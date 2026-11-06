/* global performance */
// Timing observer for local diagnostics only. No normal API source is changed.
import benchmark from './worker.ts';

type DiagnosticEnv = Parameters<typeof benchmark.fetch>[1];
type Trace = {
  id: number;
  candidate: string;
  startedAt: string;
  eventsMs: Record<string, number>;
  bindingSettled: boolean;
  signalAborted: boolean;
  bindingErrorName?: string;
  bindingErrorCode?: number;
  responseStatus?: number;
};
const traces: Trace[] = [];

export default {
  async fetch(request: Request, env: DiagnosticEnv): Promise<Response> {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return new Response('Local diagnostics only.', { status: 403 });
    }
    if (url.pathname === '/__reliability/status') {
      return Response.json({ traces }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname !== '/api/chat' || request.method !== 'POST') return benchmark.fetch(request, env);
    if (traces.length >= 8) return new Response('Local diagnostic budget reached.', { status: 429 });
    const start = performance.now();
    const trace: Trace = {
      id: traces.length + 1, candidate: env.BENCHMARK_CANDIDATE,
      startedAt: new Date().toISOString(), eventsMs: { requestStart: 0 },
      bindingSettled: false, signalAborted: false,
    };
    traces.push(trace);
    const stamp = (name: string) => { trace.eventsMs[name] = Math.round((performance.now() - start) * 100) / 100; };
    const invoke = async (model: string, input: unknown, options?: AiOptions): Promise<unknown> => {
      // Existing handler has finished validation before reaching the AI binding.
      // This is an upper bound, not an invented exact validation timestamp.
      stamp('validationCompletedBy');
      stamp('aiInvocationStart');
      const signal = options?.signal;
      const abort = () => { trace.signalAborted = true; stamp('abortSignalObserved'); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const result: unknown = await (env.AI.run as (model: string, input: unknown, options?: AiOptions) => Promise<unknown>)(model, input, options);
        stamp('aiBindingResolved');
        return result;
      } catch (error) {
        stamp('aiBindingRejected');
        trace.bindingErrorName = error instanceof Error && ['AbortError', 'TimeoutError', 'InferenceUpstreamError', 'Error'].includes(error.name) ? error.name : 'Error';
        if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') trace.bindingErrorCode = error.code;
        throw error;
      } finally {
        trace.bindingSettled = true;
        signal?.removeEventListener('abort', abort);
      }
    };
    const response = await benchmark.fetch(request, {
      ...env,
      CHAT_RATE_LIMITER: { limit: async input => {
        stamp('rateLimiterStart');
        try { return await env.CHAT_RATE_LIMITER.limit(input); }
        finally { stamp('rateLimiterComplete'); }
      } },
      AI: { run: invoke as Env['AI']['run'] },
    });
    stamp('responsePrepared');
    trace.responseStatus = response.status;
    const headers = new Headers(response.headers);
    headers.set('X-Reliability-Timing', JSON.stringify(trace));
    return new Response(response.body, { status: response.status, headers });
  },
};
