import { QWEN_MODEL, reply, type ModelOutput, type SupportedModel } from './ai.ts';
import { ApiError, json } from './responses.ts';
import { readRequest } from './validation.ts';
import { decideAiFallback, matchPortfolioFaq } from './faq.ts';
import { selectTopics, type TopicSelection } from './topics.ts';
import type { KnowledgeCategory } from './knowledge.ts';

export type Bindings = {
  AI: Pick<Env['AI'], 'run'>;
  CHAT_RATE_LIMITER: Pick<Env['CHAT_RATE_LIMITER'], 'limit'>;
  AI_ENABLED?: string;
  LOCAL_DEV_ORIGINS?: string;
};
const PRODUCTION_ORIGIN = 'https://www.dhomhafiz.dev';

export type LocalQwenDiagnostics = {
  beforeInference?: (model: SupportedModel) => void;
  onProviderResponse?: (result: unknown) => void;
  onError?: (error: unknown) => void;
  onRequest?: (value: {
    model: typeof QWEN_MODEL;
    selectedCategories: readonly KnowledgeCategory[];
    selectionReason: TopicSelection['reason'];
  }) => void;
  onOutput?: (value: Pick<ModelOutput, 'finishReason' | 'usage'>) => void;
};

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

export function createWorker(model: SupportedModel, diagnostics?: LocalQwenDiagnostics) {
  return { fetch: (request: Request, env: Bindings) => handleRequest(request, env, model, diagnostics) };
}

async function handleRequest(
  request: Request,
  env: Bindings,
  model: SupportedModel,
  diagnostics?: LocalQwenDiagnostics,
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

      try {
        const selection = selectTopics(input);
        if (model === QWEN_MODEL) {
          diagnostics?.onRequest?.({
            model,
            selectedCategories: selection.categories,
            selectionReason: selection.reason,
          });
        }
        const aiReply = await reply(env.AI, input, model, selection, model === QWEN_MODEL ? {
          beforeInference: diagnostics?.beforeInference,
          onProviderResponse: diagnostics?.onProviderResponse,
        } : undefined);
        if (model === QWEN_MODEL) {
          diagnostics?.onOutput?.({
            finishReason: aiReply.finishReason,
            ...(aiReply.usage ? { usage: aiReply.usage } : {}),
          });
        }
        return json({ success: true, reply: aiReply.response, model, source: 'ai' }, 200, headers);
      } catch (error) {
        if (model === QWEN_MODEL) diagnostics?.onError?.(error);
        if (error instanceof ApiError) {
          throw new ApiError(error.status, error.code, decideAiFallback(input.message, false).reply, error.diagnosticCode);
        }
        throw error;
      }
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
      if (safe.code === 'RATE_LIMITED') headers.set('Retry-After', '60');
      return json({ success: false, error: { code: safe.code, message: safe.message } }, safe.status, headers);
    }
}
