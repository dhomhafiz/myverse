import {
  estimateGemmaNeuronReservation,
  estimateModelNeuronReservation,
  GEMMA_MODEL,
  QWEN_MODEL,
  reply,
  reportedModelTokenUsage,
  resolveProductionModel,
  type ModelOutput,
  type ReportedTokenUsage,
  type SupportedModel,
} from './ai.ts';
import { ApiError, json, type ResponseNormalizationOutcome } from './responses.ts';
import { readRequest, type ChatRequest } from './validation.ts';
import { budgetExhaustedMessage, decideAiFallback, matchPortfolioFaq } from './faq.ts';
import { selectTopics, type TopicSelection } from './topics.ts';
import type { KnowledgeCategory } from './knowledge.ts';

export type Bindings = {
  AI?: Pick<Env['AI'], 'run'>;
  CHAT_RATE_LIMITER: Pick<Env['CHAT_RATE_LIMITER'], 'limit'>;
  AI_MODEL?: string;
  AI_ENABLED?: string;
  AI_BUDGET_CONTROLLER?: Pick<Env['AI_BUDGET_CONTROLLER'], 'getByName'>;
  LOCAL_DEV_ORIGINS?: string;
};
const PRODUCTION_ORIGIN = 'https://www.dhomhafiz.dev';
const BUDGET_CONTROLLER_NAME = 'global';
const BUDGET_CONTROLLER_URL = 'https://myverse-budget.internal';

export type LocalModelDiagnostics = {
  beforeInference?: (model: SupportedModel) => void;
  onProviderResponse?: (result: unknown) => void;
  onNormalization?: (outcome: ResponseNormalizationOutcome) => void;
  onElapsed?: (elapsedMs: number) => void;
  onError?: (error: unknown) => void;
  onRequest?: (value: {
    model: SupportedModel;
    selectedCategories: readonly KnowledgeCategory[];
    selectionReason: TopicSelection['reason'];
  }) => void;
  onOutput?: (value: Pick<ModelOutput, 'finishReason' | 'usage'>) => void;
  estimateReservation?: (
    input: ChatRequest,
    selection: TopicSelection,
    model: SupportedModel,
  ) => number | null;
};
// Keep existing Qwen harness imports compatible.
export type LocalQwenDiagnostics = LocalModelDiagnostics;

type BudgetControllerStub = ReturnType<NonNullable<Bindings['AI_BUDGET_CONTROLLER']>['getByName']>;
type WorkerContext = Pick<ExecutionContext, 'waitUntil'>;
export const BUDGET_COMMAND_TIMEOUT_MS = 1_000;

async function budgetCommand(
  controller: BudgetControllerStub,
  path: string,
  body: Record<string, unknown>,
  diagnosticCode: 'DURABLE_OBJECT_ADMISSION_REQUEST_FAILURE' | 'RESERVATION_SETTLEMENT_FAILURE',
): Promise<Record<string, unknown>> {
  const command = { ...body, commandId: crypto.randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([(async () => {
        const response = await controller.fetch(new Request(`${BUDGET_CONTROLLER_URL}${path}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
        }));
        if (!response.ok) throw new Error('Budget controller rejected the command.');
        const result: unknown = await response.json();
        if (typeof result !== 'object' || result === null || Array.isArray(result)) {
          throw new Error('Budget controller returned an invalid response.');
        }
        return result as Record<string, unknown>;
      })(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Budget command outcome is ambiguous.')), BUDGET_COMMAND_TIMEOUT_MS);
      })]);
      return result;
    } catch {
      // Replay the same command receipt; never replay provider dispatch.
      if (attempt === 1) throw new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI is temporarily unavailable.', diagnosticCode);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  throw new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI is temporarily unavailable.', diagnosticCode);
}

const AI_UNAVAILABLE_DIAGNOSTICS = {
  RATE_LIMITER_DEPENDENCY_FAILURE: { stage: 'rate_limit' },
  AI_DISABLED: { stage: 'ai_configuration' },
  AI_CONFIGURATION_INVALID: { stage: 'ai_configuration' },
  AI_BINDING_UNAVAILABLE: { stage: 'ai_configuration' },
  BUDGET_CONTROLLER_BINDING_UNAVAILABLE: { stage: 'budget_admission' },
  BUDGET_ESTIMATE_FAILURE: { stage: 'budget_estimation' },
  DURABLE_OBJECT_ADMISSION_REQUEST_FAILURE: { stage: 'budget_admission' },
  AI_BUDGET_EXHAUSTED: { stage: 'budget_admission' },
  AI_CONCURRENCY_LIMIT_REACHED: { stage: 'budget_admission' },
  AI_RECOVERY_UNCERTAIN: { stage: 'budget_admission' },
  BUDGET_CONTROLLER_CONFIGURATION_INVALID: { stage: 'budget_admission' },
  DURABLE_OBJECT_STORAGE_FAILURE: { stage: 'budget_admission' },
  DURABLE_OBJECT_ADMISSION_REJECTED: { stage: 'budget_admission' },
  DURABLE_OBJECT_ADMISSION_STATE_FAILURE: { stage: 'budget_admission' },
  RESERVATION_SETTLEMENT_FAILURE: { stage: 'reservation_settlement' },
  GEMMA_PROVIDER_FAILURE: { stage: 'inference' },
  INFERENCE_TIMEOUT: { stage: 'inference' },
  INFERENCE_FAILURE: { stage: 'inference' },
} as const;

function admissionFailureCode(reason: unknown): keyof typeof AI_UNAVAILABLE_DIAGNOSTICS {
  switch (reason) {
    case 'busy': return 'AI_CONCURRENCY_LIMIT_REACHED';
    case 'uncertainty_limit': return 'AI_RECOVERY_UNCERTAIN';
    case 'budget_exhausted': return 'AI_BUDGET_EXHAUSTED';
    case 'invalid_configuration': return 'BUDGET_CONTROLLER_CONFIGURATION_INVALID';
    case 'storage_unavailable': return 'DURABLE_OBJECT_STORAGE_FAILURE';
    default: return 'DURABLE_OBJECT_ADMISSION_REJECTED';
  }
}

function publicAiFailureReason(diagnosticCode?: string) {
  switch (diagnosticCode) {
    case 'AI_BUDGET_EXHAUSTED': return 'daily_budget_exhausted' as const;
    case 'AI_CONCURRENCY_LIMIT_REACHED': return 'concurrency_unavailable' as const;
    case 'AI_RECOVERY_UNCERTAIN': return 'recovery_uncertain' as const;
    case 'INFERENCE_TIMEOUT': return 'provider_timeout' as const;
    case 'GEMMA_PROVIDER_FAILURE':
    case 'INFERENCE_FAILURE': return 'provider_failure' as const;
    default: return 'service_unavailable' as const;
  }
}

function logAiUnavailable(error: ApiError, correlationId: string): void {
  const diagnosticCode = error.diagnosticCode && Object.hasOwn(AI_UNAVAILABLE_DIAGNOSTICS, error.diagnosticCode)
    ? error.diagnosticCode as keyof typeof AI_UNAVAILABLE_DIAGNOSTICS
    : 'INFERENCE_FAILURE';
  console.error({
    event: 'ai_unavailable',
    correlationId,
    timestamp: new Date().toISOString(),
    stage: AI_UNAVAILABLE_DIAGNOSTICS[diagnosticCode].stage,
    diagnosticCode,
    publicHttpStatus: error.status,
  });
}

function isInferenceTimeout(error: unknown): boolean {
  return error instanceof ApiError
    && error.internalDiagnostics?.failureCategory === 'INFERENCE_DEADLINE_EXCEEDED';
}

function inferenceDiagnosticCode(error: unknown, model: SupportedModel): string {
  if (isInferenceTimeout(error)) return 'INFERENCE_TIMEOUT';
  if (model === GEMMA_MODEL && error instanceof ApiError
    && error.internalDiagnostics?.failureCategory === 'AI_PROVIDER_REJECTED') return 'GEMMA_PROVIDER_FAILURE';
  return 'INFERENCE_FAILURE';
}

function isAllowedOrigin(origin: string, configured: string): boolean {
  if (origin === PRODUCTION_ORIGIN) return true;
  return configured.split(',').some(candidate => {
    const allowed = candidate.trim();
    if (allowed !== origin) return false;
    try {
      const url = new URL(allowed);
      return url.origin === allowed && ['http:', 'https:'].includes(url.protocol)
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch { return false; }
  });
}

export function createWorker(model?: SupportedModel, diagnostics?: LocalModelDiagnostics) {
  return { fetch: (request: Request, env: Bindings, context?: WorkerContext) => {
    const task = handleRequest(request, env, model, diagnostics, context);
    // Best-effort disconnect protection, bounded by the runtime. The durable watchdog is authoritative.
    context?.waitUntil(task.then(() => {}, () => {}));
    return task;
  } };
}

async function handleRequest(
  request: Request,
  env: Bindings,
  modelOverride: SupportedModel | undefined,
  diagnostics?: LocalModelDiagnostics,
  context?: WorkerContext,
): Promise<Response> {
    const headers = new Headers({ Vary: 'Origin' });
    const correlationId = crypto.randomUUID();
    try {
      const path = new URL(request.url).pathname;
      if (path !== '/health' && path !== '/api/chat'
        && path !== '/internal/budget/status' && path !== '/internal/budget/recovery') {
        throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
      }
      const origin = request.headers.get('Origin');
      if (origin !== null) {
        if (!isAllowedOrigin(origin, env.LOCAL_DEV_ORIGINS ?? '')) throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Origin is not allowed.');
        headers.set('Access-Control-Allow-Origin', origin);
      }
      const method = path === '/health' ? 'GET' : 'POST';
      headers.set('Allow', `${method}, OPTIONS`);
      if (request.method === 'OPTIONS') {
        const requestedMethod = request.headers.get('Access-Control-Request-Method');
        const requestedHeaders = request.headers.get('Access-Control-Request-Headers')?.split(',').map(value => value.trim().toLowerCase()) ?? [];
        if (!origin || requestedMethod !== method || requestedHeaders.some(value => value !== 'content-type')) {
          throw new ApiError(400, 'INVALID_REQUEST', 'Invalid CORS preflight.');
        }
        headers.set('Access-Control-Allow-Methods', method);
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
        headers.set('Access-Control-Max-Age', '600');
        headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== method) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      if (path === '/health') return json({ status: 'ok', service: 'myverse-ai-api' }, 200, headers);
      if (path === '/internal/budget/status') {
        const controllerBinding = env.AI_BUDGET_CONTROLLER;
        if (!controllerBinding || typeof controllerBinding.getByName !== 'function') {
          headers.set('Cache-Control', 'no-store');
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.set('X-Content-Type-Options', 'nosniff');
          return new Response(JSON.stringify({ error: 'BUDGET_STATUS_UNAVAILABLE' }), { status: 503, headers });
        }

        const statusHeaders = new Headers({ 'Content-Type': 'application/json' });
        const authorization = request.headers.get('Authorization');
        if (authorization !== null) statusHeaders.set('Authorization', authorization);
        const controller = controllerBinding.getByName(BUDGET_CONTROLLER_NAME);
        try {
          return await controller.fetch(new Request(`${BUDGET_CONTROLLER_URL}/internal/status`, {
            method: 'POST',
            headers: statusHeaders,
            body: '{}',
          }));
        } catch {
          headers.set('Cache-Control', 'no-store');
          headers.set('Content-Type', 'application/json; charset=utf-8');
          headers.set('X-Content-Type-Options', 'nosniff');
          return new Response(JSON.stringify({ error: 'BUDGET_STATUS_UNAVAILABLE' }), { status: 503, headers });
        }
      }
      if (path === '/internal/budget/recovery') {
        const controllerBinding = env.AI_BUDGET_CONTROLLER;
        if (!controllerBinding || typeof controllerBinding.getByName !== 'function') {
          return json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Budget recovery is unavailable.' } }, 503, headers);
        }
        const length = request.headers.get('Content-Length');
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2_048)) {
          return json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid recovery request.' } }, 400, headers);
        }
        let body: ArrayBuffer;
        try {
          body = await request.arrayBuffer();
        } catch {
          return json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid recovery request.' } }, 400, headers);
        }
        if (body.byteLength > 2_048) {
          return json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid recovery request.' } }, 400, headers);
        }
        const recoveryHeaders = new Headers({ 'Content-Type': 'application/json' });
        const authorization = request.headers.get('Authorization');
        if (authorization !== null) recoveryHeaders.set('Authorization', authorization);
        const controller = controllerBinding.getByName(BUDGET_CONTROLLER_NAME);
        try {
          return await controller.fetch(new Request(`${BUDGET_CONTROLLER_URL}/internal/legacy-quarantine`, {
            method: 'POST',
            headers: recoveryHeaders,
            body,
          }));
        } catch {
          return json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Budget recovery is unavailable.' } }, 503, headers);
        }
      }

      const input = await readRequest(request);
      // CF-Connecting-IP is supplied by Cloudflare at the edge. Never use forwarded
      // headers/session IDs supplied by clients. Missing IPs share a conservative bucket.
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`myverse-chat:${ip}`));
      const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      let allowed: boolean;
      try { allowed = (await env.CHAT_RATE_LIMITER.limit({ key })).success; }
      catch {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'RATE_LIMITER_DEPENDENCY_FAILURE');
      }
      if (!allowed) {
        headers.set('Retry-After', '60');
        throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
      }

      if (env.AI_ENABLED !== 'true') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_DISABLED');
      }

      const model = modelOverride ?? resolveProductionModel(env.AI_MODEL);
      if (!model) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_CONFIGURATION_INVALID');
      }
      if (model !== GEMMA_MODEL && model !== QWEN_MODEL) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_CONFIGURATION_INVALID');
      }
      if (!env.AI || typeof env.AI.run !== 'function') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_BINDING_UNAVAILABLE');
      }
      if (!env.AI_BUDGET_CONTROLLER || typeof env.AI_BUDGET_CONTROLLER.getByName !== 'function') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'BUDGET_CONTROLLER_BINDING_UNAVAILABLE');
      }

      const selection = selectTopics(input);
      const estimateReservation = diagnostics?.estimateReservation ?? ((request, topics, selectedModel) => selectedModel === GEMMA_MODEL
        ? estimateGemmaNeuronReservation(request, topics)
        : estimateModelNeuronReservation(request, topics, selectedModel));
      const estimatedNeurons = estimateReservation(input, selection, model);
      if (estimatedNeurons === null) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'BUDGET_ESTIMATE_FAILURE');
      }
      const controller = env.AI_BUDGET_CONTROLLER.getByName(BUDGET_CONTROLLER_NAME);
      const requestId = correlationId;
      const attemptId = crypto.randomUUID();
      const ownerId = crypto.randomUUID();
      const ray = request.headers.get('cf-ray');
      const ingressCorrelation = ray && /^[a-fA-F0-9]{16,32}-[A-Z]{3}$/.test(ray) ? { ingressRayId: ray } : {};
      const admission = await budgetCommand(
        controller,
        '/admit',
        { protocol: 2, requestId, attemptId, ownerId, estimatedNeurons, model, ...ingressCorrelation },
        'DURABLE_OBJECT_ADMISSION_REQUEST_FAILURE',
      );
      if (admission.granted !== true || typeof admission.grantId !== 'string') {
        if (admission.granted === false && admission.reason === 'budget_exhausted') {
          const faq = matchPortfolioFaq(input.message);
          if (faq) return json({ success: true, reply: faq.reply, source: 'faq' }, 200, headers);
          throw new ApiError(503, 'AI_UNAVAILABLE', budgetExhaustedMessage(input.message), 'AI_BUDGET_EXHAUSTED');
        }
        throw new ApiError(
          503,
          'AI_UNAVAILABLE',
          decideAiFallback(input.message, false).reply,
          admissionFailureCode(admission.granted === false ? admission.reason : undefined),
        );
      }
      const grantId = admission.grantId;
      if (!Number.isSafeInteger(admission.generation) || admission.attemptId !== attemptId || admission.ownerId !== ownerId) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'DURABLE_OBJECT_ADMISSION_STATE_FAILURE');
      }
      const identity = { protocol: 2, requestId, grantId, attemptId, ownerId, generation: admission.generation };
      let started: Record<string, unknown>;
      try {
        started = await budgetCommand(controller, '/start', identity, 'DURABLE_OBJECT_ADMISSION_REQUEST_FAILURE');
        if (started.started !== true || !Number.isSafeInteger(started.leaseExpiresAt)
          || Number(started.leaseExpiresAt) <= Date.now() || request.signal.aborted) {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'DURABLE_OBJECT_ADMISSION_STATE_FAILURE');
        }
      } catch (error) {
        // This invocation has not called the provider. Even an ambiguous /start can safely close its own grant.
        const notStarted = await budgetCommand(controller, '/settle', {
          ...identity,
          outcome: 'not_started',
          terminal: true,
          failureClassification: 'INFERENCE_NOT_DISPATCHED',
        }, 'RESERVATION_SETTLEMENT_FAILURE');
        if (notStarted.settled !== true) {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'RESERVATION_SETTLEMENT_FAILURE');
        }
        throw error;
      }

      let providerUsage: ReportedTokenUsage | undefined;
      let providerResponseObserved = false;
      try {
        if (model === QWEN_MODEL || model === GEMMA_MODEL) {
          diagnostics?.onRequest?.({
            model,
            selectedCategories: selection.categories,
            selectionReason: selection.reason,
          });
        }
        const aiReply = await reply(env.AI, input, model, selection, {
          beforeInference: diagnostics?.beforeInference,
          onProviderResponse: result => {
            providerResponseObserved = true;
            providerUsage = reportedModelTokenUsage(result, model);
            diagnostics?.onProviderResponse?.(result);
          },
          onNormalization: diagnostics?.onNormalization,
          onElapsed: diagnostics?.onElapsed,
          retain: task => context?.waitUntil(task),
          onLateProviderResponse: result => {
            const usage = reportedModelTokenUsage(result, model);
            const finalization = budgetCommand(controller, '/settle', {
              ...identity, outcome: 'completed', terminal: true,
              ...(usage ? { usage } : {}),
              failureClassification: usage ? 'COMPLETED_WITH_REPORTED_USAGE' : 'COMPLETED_USAGE_UNKNOWN',
            }, 'RESERVATION_SETTLEMENT_FAILURE').then(() => {}, () => {});
            context?.waitUntil(finalization);
          },
        });
        const settled = await budgetCommand(controller, '/settle', {
          ...identity,
          outcome: 'completed',
          terminal: true,
          ...(providerUsage ? { usage: providerUsage } : {}),
          failureClassification: providerUsage ? 'COMPLETED_WITH_REPORTED_USAGE' : 'COMPLETED_USAGE_UNKNOWN',
        }, 'RESERVATION_SETTLEMENT_FAILURE');
        if (settled.settled !== true) {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'RESERVATION_SETTLEMENT_FAILURE');
        }
        if (model === QWEN_MODEL || model === GEMMA_MODEL) {
          diagnostics?.onOutput?.({
            finishReason: aiReply.finishReason,
            ...(aiReply.usage ? { usage: aiReply.usage } : {}),
          });
        }
        return json({ success: true, reply: aiReply.response, model, source: 'ai' }, 200, headers);
      } catch (error) {
        if (error instanceof ApiError && error.diagnosticCode === 'RESERVATION_SETTLEMENT_FAILURE') throw error;
        // A rejected/aborted transport is not evidence that remote execution has terminated.
        const terminal = providerResponseObserved;
        try {
          const settled = await budgetCommand(controller, '/settle', {
            ...identity,
            outcome: 'failed',
            terminal,
            ...(providerUsage ? { usage: providerUsage } : {}),
            failureClassification: isInferenceTimeout(error)
              ? 'INFERENCE_DEADLINE_EXCEEDED'
              : error instanceof ApiError && error.internalDiagnostics?.failureCategory
                ? error.internalDiagnostics.failureCategory
                : 'INFERENCE_FAILED',
          }, 'RESERVATION_SETTLEMENT_FAILURE');
          if (settled.settled !== true) throw new Error('Reservation settlement was not recorded.');
        } catch {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'RESERVATION_SETTLEMENT_FAILURE');
        }
        if (model === QWEN_MODEL || model === GEMMA_MODEL) diagnostics?.onError?.(error);
        if (error instanceof ApiError) {
          throw new ApiError(error.status, error.code, decideAiFallback(input.message, false).reply,
            error.code === 'AI_UNAVAILABLE' ? inferenceDiagnosticCode(error, model) : error.diagnosticCode,
            error.internalDiagnostics, error.cause);
        }
        throw error;
      }
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
      if (safe.code === 'AI_UNAVAILABLE') logAiUnavailable(safe, correlationId);
      if (safe.code === 'RATE_LIMITED') headers.set('Retry-After', '60');
      return json({
        success: false,
        error: {
          code: safe.code,
          message: safe.message,
          ...(safe.code === 'AI_UNAVAILABLE' ? { reason: publicAiFailureReason(safe.diagnosticCode) } : {}),
        },
      }, safe.status, headers);
    }
}
