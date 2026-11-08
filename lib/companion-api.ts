import { mockConversationProvider, type CompanionHistoryMessage, type ConversationProvider } from './companion-chat.ts';

export const MAX_COMPANION_MESSAGE_LENGTH = 500;
export const COMPANION_CLIENT_TIMEOUT_MS = 20_000;
export type CompanionRequest = { message: string; history: CompanionHistoryMessage[] };
export type CompanionResponse = { success: true; reply: string; source: 'faq' | 'ai' };
type Failure = 'empty' | 'length' | 'configuration' | 'timeout' | 'network' | 'malformed' | '400' | '429'
  | '503' | 'budget' | 'capacity' | 'recovery' | 'provider';
type PublicAiFailureReason = 'daily_budget_exhausted' | 'concurrency_unavailable' | 'recovery_uncertain'
  | 'provider_timeout' | 'provider_failure' | 'service_unavailable';
const messages: Record<Failure, string> = {
  empty: 'Please enter a message.',
  length: 'Please keep your message within 500 characters.',
  configuration: 'The companion is unavailable right now. You can still explore the portfolio.',
  timeout: 'That reply took too long. Your message is still here if you want to try again.',
  network: 'The companion could not connect. Your message is still here if you want to try again.',
  malformed: 'That reply could not be read. Please try again when you’re ready.',
  '400': 'That message could not be sent. Please check it and try again.',
  '429': 'A few too many messages. Please wait a minute before sending another.',
  '503': 'The companion is unavailable right now. Please try again later, or explore the portfolio.',
  budget: 'AI replies are temporarily unavailable because today’s AI budget has been reached. You can still explore the portfolio.',
  capacity: 'The companion is handling another request right now. Please try again shortly.',
  recovery: 'The companion is temporarily unavailable while it safely recovers. Please try again later.',
  provider: 'The AI service could not complete that reply. Please try again later.',
};

export class CompanionChatError extends Error {
  readonly code: Failure;
  constructor(code: Failure) { super(messages[code]); this.code = code; }
}

export function validateCompanionPrompt(raw: string): string {
  // Match the backend's UTF-16 .length semantics, including before trimming.
  if (raw.length > MAX_COMPANION_MESSAGE_LENGTH) throw new CompanionChatError('length');
  if (!raw.trim()) throw new CompanionChatError('empty');
  return raw.trim();
}

export function validateLocalApiUrl(raw?: string): string {
  try {
    if (!raw) throw new Error();
    const url = new URL(raw);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new CompanionChatError('configuration'); }
}

export function validateWorkerApiUrl(raw?: string): string {
  try {
    if (!raw) throw new Error();
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new CompanionChatError('configuration'); }
}

export function parseCompanionResponse(value: unknown, allowAi = false): CompanionResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompanionChatError('malformed');
  const response = value as Record<string, unknown>;
  if (response.success !== true || (response.source !== 'faq' && !(allowAi && response.source === 'ai'))
    || typeof response.reply !== 'string'
    || !response.reply.trim() || response.reply.length > 8_000) throw new CompanionChatError('malformed');
  return { success: true, source: response.source, reply: response.reply };
}

function publicFailureReason(value: unknown): PublicAiFailureReason | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  const reason = (error as Record<string, unknown>).reason;
  return ['daily_budget_exhausted', 'concurrency_unavailable', 'recovery_uncertain',
    'provider_timeout', 'provider_failure', 'service_unavailable'].includes(String(reason))
    ? reason as PublicAiFailureReason : null;
}

function failureForResponse(response: Response, body: unknown): Failure {
  if (response.status === 429) {
    if (body && typeof body === 'object' && !Array.isArray(body)
      && 'error' in body && body.error && typeof body.error === 'object' && !Array.isArray(body.error)
      && 'code' in body.error && body.error.code === 'AI_QUOTA_EXCEEDED') return 'provider';
    return '429';
  }
  if (response.status === 400) return '400';
  if (response.status !== 503) return '503';
  switch (publicFailureReason(body)) {
    case 'daily_budget_exhausted': return 'budget';
    case 'concurrency_unavailable': return 'capacity';
    case 'recovery_uncertain': return 'recovery';
    case 'provider_timeout': return 'timeout';
    case 'provider_failure': return 'provider';
    default: return '503';
  }
}

function createApiProvider(origin: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number }, localFaqOnly: boolean): ConversationProvider {
  const timeoutMs = options.timeoutMs ?? COMPANION_CLIENT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 25_000) throw new CompanionChatError('configuration');
  return {
    async respond(raw, signal, history = []) {
      const payload: CompanionRequest = { message: validateCompanionPrompt(raw), history: [...history] };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let cancel: () => void = () => {};
      const cancelled = new Promise<never>((_, reject) => {
        cancel = () => {
          controller.abort();
          reject(new DOMException('The reply was cancelled.', 'AbortError'));
        };
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) { cancel(); return; }
        timer = setTimeout(() => {
          reject(new CompanionChatError('timeout'));
          controller.abort();
        }, timeoutMs);
      });
      const exchange = async () => {
        if (signal.aborted) throw new DOMException('The reply was cancelled.', 'AbortError');
        let response: Response;
        const transport = options.fetchImpl ?? fetch;
        const common = { signal: controller.signal, credentials: 'omit' as const, cache: 'no-store' as const, redirect: 'error' as const };
        if (localFaqOnly) {
          // Verify on every submission: a different Worker may have taken this local port.
          try {
            const healthResponse = await transport(`${origin}/health`, { ...common, method: 'GET' })
              .catch(() => { throw new CompanionChatError('network'); });
            if (!healthResponse.ok) throw new CompanionChatError('configuration');
            const health: unknown = await healthResponse.json();
            if (!health || typeof health !== 'object' || !('localMode' in health) || health.localMode !== 'faq-only'
              || !('status' in health) || health.status !== 'ok') throw new CompanionChatError('configuration');
          } catch (error) {
            throw error instanceof CompanionChatError ? error : new CompanionChatError('configuration');
          }
        }
        if (controller.signal.aborted) throw new DOMException('The reply was cancelled.', 'AbortError');
        try {
          response = await transport(`${origin}/api/chat`, {
            ...common,
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          });
        } catch { throw new CompanionChatError('network'); }
        if (!response.ok) {
          let body: unknown;
          try { body = await response.json(); } catch { /* Status mapping remains safe without a response body. */ }
          throw new CompanionChatError(failureForResponse(response, body));
        }
        try {
          const result = parseCompanionResponse(await response.json(), !localFaqOnly);
          return { reply: result.reply, source: result.source };
        }
        catch { throw new CompanionChatError('malformed'); }
      };
      try { return await Promise.race([cancelled, exchange()]); }
      finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
    },
  };
}

export function createLocalApiProvider(baseUrl: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): ConversationProvider {
  return createApiProvider(validateLocalApiUrl(baseUrl), options, true);
}

export function createWorkerApiProvider(baseUrl: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): ConversationProvider {
  return createApiProvider(validateWorkerApiUrl(baseUrl), options, false);
}

export function selectConversationProvider(config: { environment: string; mode?: string; url?: string }): {
  mode: 'mock' | 'local-api' | 'worker-api' | 'unavailable'; provider: ConversationProvider;
} {
  if (config.environment === 'development') {
    if (!config.mode || config.mode === 'mock') return { mode: 'mock', provider: mockConversationProvider };
    if (config.mode === 'local-api') {
      try { return { mode: 'local-api', provider: createLocalApiProvider(config.url ?? '') }; } catch { /* Fail closed below. */ }
    }
    return { mode: 'unavailable', provider: { async respond() { throw new CompanionChatError('configuration'); } } };
  }
  if (config.environment === 'production' && config.mode === 'worker-api') {
    try { return { mode: 'worker-api', provider: createWorkerApiProvider(config.url ?? '') }; } catch { /* Fail closed below. */ }
    return { mode: 'unavailable', provider: { async respond() { throw new CompanionChatError('configuration'); } } };
  }
  if (config.environment !== 'production') return { mode: 'mock', provider: mockConversationProvider };
  return { mode: 'unavailable', provider: { async respond() { throw new CompanionChatError('configuration'); } } };
}

export const companionConversation = selectConversationProvider({
  environment: process.env.NODE_ENV,
  mode: process.env.NEXT_PUBLIC_COMPANION_PROVIDER,
  url: process.env.NEXT_PUBLIC_COMPANION_API_URL,
});
