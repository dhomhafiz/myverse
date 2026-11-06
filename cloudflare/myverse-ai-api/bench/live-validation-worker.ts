import { QWEN_MODEL } from '../src/ai.ts';
import { createWorkerForLocalQwenValidation } from '../src/local-qwen-validation.ts';
import type { Bindings } from '../src/worker.ts';

type JsonRecord = Record<string, unknown>;
type ProviderMetadata = {
  responseShape: string;
  generatedText?: string;
  rawFinishReason: string | null;
  rawUsage?: Partial<Record<'prompt_tokens' | 'completion_tokens' | 'total_tokens', number>>;
};

let attemptedCalls = 0;
let actualModelId: string | null = null;
let requestDiagnostics: {
  selectedCategories: readonly string[];
  selectionReason: string;
} | null = null;
let outputDiagnostics: {
  normalizedOutputSucceeded: true;
  finishReason: string | null;
  usage?: Partial<Record<'prompt_tokens' | 'completion_tokens' | 'total_tokens', number>>;
} | null = null;
let providerMetadata: ProviderMetadata | null = null;
let diagnosticCode: string | null = null;
let apiErrorCode: string | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedProviderMetadata(value: unknown): ProviderMetadata {
  if (!isRecord(value)) {
    return { responseShape: 'invalid', rawFinishReason: null };
  }

  const choices = Array.isArray(value.choices) ? value.choices : null;
  const choice = choices && isRecord(choices[0]) ? choices[0] : null;
  const message = choice && isRecord(choice.message) ? choice.message : null;
  const responseShape = message ? 'choices.message'
    : choice && typeof choice.text === 'string' ? 'choices.text'
      : typeof value.response === 'string' ? 'legacy.response'
        : 'invalid';
  const generatedText = typeof message?.content === 'string' ? message.content
    : choice && typeof choice.text === 'string' ? choice.text
      : typeof value.response === 'string' ? value.response
        : undefined;
  const finishReason = choice && ('finish_reason' in choice || 'finishReason' in choice)
    ? choice.finish_reason ?? choice.finishReason
    : value.finish_reason ?? value.finishReason;
  const rawUsage: NonNullable<ProviderMetadata['rawUsage']> = {};
  if (isRecord(value.usage)) {
    for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
      const count = value.usage[key];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) rawUsage[key] = count;
    }
  }

  return {
    responseShape,
    ...(generatedText !== undefined ? { generatedText } : {}),
    rawFinishReason: typeof finishReason === 'string' ? finishReason : null,
    ...(Object.keys(rawUsage).length > 0 ? { rawUsage } : {}),
  };
}

const application = createWorkerForLocalQwenValidation({
  beforeInference: model => {
    if (attemptedCalls >= 3) throw new Error('Local Qwen inference budget exhausted.');
    attemptedCalls++;
    actualModelId = model;
    if (actualModelId !== QWEN_MODEL) throw new Error('Unexpected model in local validation.');
  },
  onProviderResponse: result => {
    providerMetadata = normalizedProviderMetadata(result);
  },
  onError: error => {
    if (error && typeof error === 'object' && 'diagnosticCode' in error
      && typeof error.diagnosticCode === 'string') diagnosticCode = error.diagnosticCode;
    if (error && typeof error === 'object' && 'code' in error
      && typeof error.code === 'string') apiErrorCode = error.code;
  },
  onRequest: value => {
    requestDiagnostics = {
      selectedCategories: value.selectedCategories,
      selectionReason: value.selectionReason,
    };
  },
  onOutput: value => {
    outputDiagnostics = {
      normalizedOutputSucceeded: true,
      finishReason: value.finishReason,
      ...(value.usage ? { usage: value.usage } : {}),
    };
  },
});

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const hostname = new URL(request.url).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
      return new Response('Local validation only.', { status: 403 });
    }

    actualModelId = null;
    requestDiagnostics = null;
    outputDiagnostics = null;
    providerMetadata = null;
    diagnosticCode = null;
    apiErrorCode = null;
    const response = await application.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set('X-Local-Evaluation', JSON.stringify({
      attemptedCalls,
      actualModelId,
      request: requestDiagnostics,
      output: outputDiagnostics,
      providerResponse: providerMetadata,
      diagnosticCode,
      apiErrorCode,
    }));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
