// Local experiment only. The normal Wrangler entry point remains src/index.ts.
import worker, { type Bindings } from '../src/index.ts';
import { qwenPrompt } from '../src/ai.ts';
export { qwenPrompt } from '../src/ai.ts';

export const CANDIDATES = {
  qwen: '@cf/qwen/qwen3-30b-a3b-fp8',
  llama: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
} as const;
type Candidate = keyof typeof CANDIDATES;
type BenchmarkEnv = Bindings & { BENCHMARK_CANDIDATE: Candidate };
type ModelInput = {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature: number;
  max_tokens: number;
  stream: false;
};
type Metadata = Record<string, unknown>;
const attempts: Record<Candidate, number> = { qwen: 0, llama: 0 };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalize(result: unknown, metadata: Metadata): Record<string, unknown> {
  if (!record(result)) throw new Error('Unexpected model response');
  const normalized: Record<string, unknown> = {};
  if (record(result.usage)) {
    const usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens']
      .filter(key => typeof result.usage === 'object' && result.usage !== null
        && typeof (result.usage as Record<string, unknown>)[key] === 'number')
      .map(key => [key, (result.usage as Record<string, unknown>)[key]]));
    metadata.usage = usage;
    normalized.usage = usage;
  }
  let content: unknown = result.response;
  if ('choices' in result) {
    if (!Array.isArray(result.choices) || result.choices.length === 0 || !record(result.choices[0])) {
      throw new Error('Unexpected model response');
    }
    const choice = result.choices[0];
    metadata.finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
    if ('finish_reason' in choice) normalized.finish_reason = choice.finish_reason;
    if (record(choice.message)) {
      content = choice.message.content;
      metadata.reasoningPresent = typeof choice.message.reasoning_content === 'string'
        && choice.message.reasoning_content.trim().length > 0;
    } else content = choice.text;
  } else {
    const finishKey = 'finish_reason' in result ? 'finish_reason'
      : 'finishReason' in result ? 'finishReason' : null;
    if (finishKey !== null) {
      const finishReason = result[finishKey];
      metadata.finishReason = typeof finishReason === 'string' ? finishReason : null;
      normalized[finishKey] = finishReason;
    }
  }
  // Never return hidden reasoning as a visitor reply, or silently strip it and
  // pretend it did not consume the identical 250-token budget.
  if (metadata.reasoningPresent || (typeof content === 'string' && /<\/?think\b/i.test(content))) {
    metadata.reasoningPresent = true;
    throw new Error('Reasoning output is not comparable to a concise visitor reply');
  }
  normalized.response = content;
  return normalized;
}

export default {
  async fetch(request: Request, env: BenchmarkEnv): Promise<Response> {
    const candidate = env.BENCHMARK_CANDIDATE;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname)
      || (candidate !== 'qwen' && candidate !== 'llama')) {
      return new Response('Local benchmark configuration required.', { status: 403 });
    }
    const metadata: Metadata = { candidate, model: CANDIDATES[candidate] };
    const invoke = async (_defaultModel: string, value: unknown, options?: AiOptions): Promise<unknown> => {
      if (attempts[candidate] >= 6) throw new Error('Local inference budget exhausted');
      const input = value as ModelInput; // Only the existing server assembles this input.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
      metadata.inputHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      attempts[candidate]++;
      metadata.attempt = attempts[candidate];
      try {
        const result: unknown = candidate === 'qwen'
          ? await env.AI.run(CANDIDATES.qwen, {
            prompt: qwenPrompt(input.messages), raw: true,
            temperature: input.temperature, max_tokens: input.max_tokens, stream: input.stream,
          }, options)
          : await env.AI.run(CANDIDATES.llama, input, options);
        return normalize(result, metadata);
      } catch (error) {
        metadata.upstreamCode = record(error) && typeof error.code === 'number' ? error.code
          : error instanceof Error ? Number(/^(\d+):/.exec(error.message)?.[1]) || null : null;
        throw error; // Existing safe API error handling remains in control.
      }
    };
    const response = await worker.fetch(request, {
      ...env, AI: { run: invoke as Env['AI']['run'] },
    });
    const body: unknown = await response.json();
    if (record(body) && body.success === true && body.source === 'ai') body.model = CANDIDATES[candidate];
    const headers = new Headers(response.headers);
    headers.set('X-Benchmark-Metadata', JSON.stringify(metadata));
    return new Response(JSON.stringify(body), { status: response.status, headers });
  },
};
