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
import { readRequest } from './validation.ts';
import { decideAiFallback, matchPortfolioFaq } from './faq.ts';
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
};
// Keep existing Qwen harness imports compatible.
export type LocalQwenDiagnostics = LocalModelDiagnostics;

type BudgetControllerStub = ReturnType<NonNullable<Bindings['AI_BUDGET_CONTROLLER']>['getByName']>;

async function budgetCommand(
  controller: BudgetControllerStub,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const response = await controller.fetch(new Request(`${BUDGET_CONTROLLER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
    if (!response.ok) throw new Error('Budget controller rejected the command.');
    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new Error('Budget controller returned an invalid response.');
    }
    return result as Record<string, unknown>;
  } catch {
    throw new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI is temporarily unavailable.', 'BUDGET_CONTROLLER_UNAVAILABLE');
  }
}

function isInferenceTimeout(error: unknown): boolean {
  return error instanceof ApiError
    && error.internalDiagnostics?.failureCategory === 'INFERENCE_DEADLINE_EXCEEDED';
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
  return { fetch: (request: Request, env: Bindings) => handleRequest(request, env, model, diagnostics) };
}

async function handleRequest(
  request: Request,
  env: Bindings,
  modelOverride: SupportedModel | undefined,
  diagnostics?: LocalModelDiagnostics,
): Promise<Response> {
    const headers = new Headers({ Vary: 'Origin' });
    try {
      const path = new URL(request.url).pathname;
      if (path !== '/health' && path !== '/api/chat') throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
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

      const input = await readRequest(request);
      // CF-Connecting-IP is supplied by Cloudflare at the edge. Never use forwarded
      // headers/session IDs supplied by clients. Missing IPs share a conservative bucket.
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`myverse-chat:${ip}`));
      const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      let allowed: boolean;
      try { allowed = (await env.CHAT_RATE_LIMITER.limit({ key })).success; }
      catch { throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply); }
      if (!allowed) {
        headers.set('Retry-After', '60');
        throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
      }

      const faq = input.history.length === 0 ? matchPortfolioFaq(input.message) : null;
      if (faq) return json({ success: true, reply: faq.reply, source: 'faq' }, 200, headers);

      if (env.AI_ENABLED !== 'true') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply);
      }

      const model = modelOverride ?? resolveProductionModel(env.AI_MODEL);
      if (!model) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'MODEL_CONFIGURATION_INVALID');
      }
      if (model !== GEMMA_MODEL && model !== QWEN_MODEL) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'MODEL_CONFIGURATION_INVALID');
      }
      if (!env.AI || typeof env.AI.run !== 'function') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_BINDING_UNAVAILABLE');
      }
      if (!env.AI_BUDGET_CONTROLLER || typeof env.AI_BUDGET_CONTROLLER.getByName !== 'function') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'BUDGET_CONTROLLER_UNAVAILABLE');
      }

      const selection = selectTopics(input);
      const estimatedNeurons = model === GEMMA_MODEL
        ? estimateGemmaNeuronReservation(input, selection)
        : estimateModelNeuronReservation(input, selection, model);
      if (estimatedNeurons === null) {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'BUDGET_ESTIMATE_UNAVAILABLE');
      }
      const controller = env.AI_BUDGET_CONTROLLER.getByName(BUDGET_CONTROLLER_NAME);
      const requestId = crypto.randomUUID();
      const admission = await budgetCommand(controller, '/admit', { requestId, estimatedNeurons, model });
      if (admission.granted !== true || typeof admission.grantId !== 'string') {
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_ADMISSION_DENIED');
      }
      const grantId = admission.grantId;
      const identity = { requestId, grantId };
      const started = await budgetCommand(controller, '/start', identity);
      if (started.started !== true) {
        const notStarted = await budgetCommand(controller, '/settle', {
          ...identity,
          outcome: 'not_started',
          terminal: true,
          failureClassification: 'INFERENCE_NOT_DISPATCHED',
        });
        if (notStarted.settled !== true) {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_SETTLEMENT_UNAVAILABLE');
        }
        throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_ADMISSION_DENIED');
      }

      let providerUsage: ReportedTokenUsage | undefined;
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
            providerUsage = reportedModelTokenUsage(result, model);
            diagnostics?.onProviderResponse?.(result);
          },
          onNormalization: diagnostics?.onNormalization,
          onElapsed: diagnostics?.onElapsed,
        });
        const settled = await budgetCommand(controller, '/settle', {
          ...identity,
          outcome: 'completed',
          terminal: true,
          ...(providerUsage ? { usage: providerUsage } : {}),
          failureClassification: providerUsage ? 'COMPLETED_WITH_REPORTED_USAGE' : 'COMPLETED_USAGE_UNKNOWN',
        });
        if (settled.settled !== true) {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_SETTLEMENT_UNAVAILABLE');
        }
        if (model === QWEN_MODEL || model === GEMMA_MODEL) {
          diagnostics?.onOutput?.({
            finishReason: aiReply.finishReason,
            ...(aiReply.usage ? { usage: aiReply.usage } : {}),
          });
        }
        return json({ success: true, reply: aiReply.response, model, source: 'ai' }, 200, headers);
      } catch (error) {
        if (error instanceof ApiError
          && ['AI_SETTLEMENT_UNAVAILABLE', 'BUDGET_CONTROLLER_UNAVAILABLE'].includes(error.diagnosticCode ?? '')) throw error;
        const terminal = !isInferenceTimeout(error);
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
          });
          if (settled.settled !== true) throw new Error('Reservation settlement was not recorded.');
        } catch {
          throw new ApiError(503, 'AI_UNAVAILABLE', decideAiFallback(input.message, false).reply, 'AI_SETTLEMENT_UNAVAILABLE');
        }
        if (model === QWEN_MODEL || model === GEMMA_MODEL) diagnostics?.onError?.(error);
        if (error instanceof ApiError) {
          throw new ApiError(error.status, error.code, decideAiFallback(input.message, false).reply,
            error.diagnosticCode, error.internalDiagnostics, error.cause);
        }
        throw error;
      }
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
      if (safe.code === 'RATE_LIMITED') headers.set('Retry-After', '60');
      return json({ success: false, error: { code: safe.code, message: safe.message } }, safe.status, headers);
    }
}
