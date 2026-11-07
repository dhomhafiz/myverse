import { ApiError } from './responses.ts';

export const LIMITS = { bodyBytes: 32_768, message: 500, history: 10, entry: 1_000, bodyTimeoutMs: 5_000 } as const;
export type HistoryMessage = { role: 'user' | 'assistant'; content: string };
export type ChatRequest = { message: string; history: HistoryMessage[] };
const invalid = () => new ApiError(400, 'INVALID_REQUEST', 'Provide a message and a valid conversation history.');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validate(value: unknown): ChatRequest {
  if (!record(value) || Object.keys(value).some(key => !['message', 'history'].includes(key))) throw invalid();
  if (typeof value.message !== 'string' || !value.message.trim()) throw invalid();
  if (value.message.length > LIMITS.message) throw new ApiError(400, 'MESSAGE_TOO_LONG', 'Message must be at most 500 characters.');
  const history = value.history === undefined ? [] : value.history;
  if (!Array.isArray(history) || history.length > LIMITS.history) throw invalid();
  const clean: HistoryMessage[] = [];
  for (const item of history) {
    if (!record(item) || Object.keys(item).some(key => !['role', 'content'].includes(key))
      || (item.role !== 'user' && item.role !== 'assistant')
      || typeof item.content !== 'string' || !item.content.trim() || item.content.length > LIMITS.entry) throw invalid();
    // History is complete previous exchanges: user first, assistant second, ending in assistant.
    if (item.role !== (clean.length % 2 === 0 ? 'user' : 'assistant')) throw invalid();
    clean.push({ role: item.role, content: item.content.trim() });
  }
  if (clean.length % 2 !== 0) throw invalid();
  return { message: value.message.trim(), history: clean };
}

export async function readRequest(request: Request): Promise<ChatRequest> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
  const tooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > LIMITS.bodyBytes)) throw tooLarge();
  if (!request.body) throw invalid();
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ApiError(408, 'INVALID_REQUEST', 'Request body timed out.'));
      void reader.cancel().catch(() => {});
    }, LIMITS.bodyTimeoutMs);
  });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bodyBytes) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
    catch { throw invalid(); }
    return validate(value);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    reader.releaseLock();
  }
}
