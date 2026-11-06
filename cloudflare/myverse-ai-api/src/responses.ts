export type ErrorCode = 'INVALID_REQUEST' | 'MESSAGE_TOO_LONG' | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE' | 'FORBIDDEN_ORIGIN' | 'METHOD_NOT_ALLOWED' | 'NOT_FOUND'
  | 'RATE_LIMITED' | 'AI_QUOTA_EXCEEDED' | 'AI_UNAVAILABLE' | 'INTERNAL_ERROR';

export type ChatResponse = { success: true; reply: string; model?: string; source?: 'faq' | 'ai' }
  | { success: false; error: { code: ErrorCode; message: string } };

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  diagnosticCode?: string;
  constructor(status: number, code: ErrorCode, message: string, diagnosticCode?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

export function json(body: ChatResponse | { status: 'ok'; service: string }, status: number, headers: Headers) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers });
}
