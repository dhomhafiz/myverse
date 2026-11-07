import { CAREER_TIMELINE, CURRENT_CAREER_DATES, PORTFOLIO_FACTS, type KnowledgeCategory } from './knowledge.ts';
import {
  buildSystemPrompt,
  PERSONALITY_EXAMPLE_INSTRUCTIONS,
  selectPersonalityExamples,
} from './prompts.ts';
import { selectTopics, type TopicSelection } from './topics.ts';
import type { ChatRequest } from './validation.ts';
import { ApiError, type InternalFailureCategory, type InternalInferenceDiagnostics, type ResponseNormalizationOutcome } from './responses.ts';

export const MODEL = '@cf/meta/llama-3.2-3b-instruct' as const;
export const QWEN_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8' as const;
export const GEMMA_MODEL = '@cf/google/gemma-4-26b-a4b-it' as const;
export type SupportedModel = typeof MODEL | typeof QWEN_MODEL | typeof GEMMA_MODEL;
const PRODUCTION_MODEL_ALLOWLIST: ReadonlySet<string> = new Set([GEMMA_MODEL]);
export function resolveProductionModel(value: string | undefined): typeof GEMMA_MODEL | null {
  return value !== undefined && PRODUCTION_MODEL_ALLOWLIST.has(value) ? GEMMA_MODEL : null;
}
export const AI_TIMEOUT_MS = 15_000;
// Fixed server-side budget; never taken from visitor input. Llama remains at 250.
export const QWEN_MAX_OUTPUT_TOKENS = 768;
export const GEMMA_MAX_COMPLETION_TOKENS = 768;
export const GEMMA_MAX_CONTEXT_TOKENS = 256_000;
export const QWEN_MAX_CONTEXT_TOKENS = 32_768;

type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ReportedTokenUsage = { promptTokens: number; completionTokens: number };
type ModelRequest = {
  messages: ModelMessage[];
  temperature: number;
  max_tokens: number;
  stream: false;
};
type TokenUsage = Partial<Record<'prompt_tokens' | 'completion_tokens' | 'total_tokens', number>>;
export type ModelOutput = { response: string; finishReason: string | null; usage?: TokenUsage };
type InferenceInstrumentation = {
  beforeInference?: (model: SupportedModel) => void;
  onProviderResponse?: (result: unknown) => void;
  onNormalization?: (outcome: ResponseNormalizationOutcome) => void;
  onElapsed?: (elapsedMs: number) => void;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidModelResponse(reason: string): Error {
  return Object.assign(new Error('Unexpected or incomplete model response.'), {
    diagnosticCode: reason,
    normalizationFailure: true,
  });
}

function guardrailFailure(reason: string): Error {
  return Object.assign(new Error('Model response failed a portfolio guardrail.'), { diagnosticCode: reason });
}

class ProviderRejection extends Error {
  constructor(cause: unknown) {
    super('AI provider rejected inference.', { cause });
  }
}

class InferenceDeadlineExceeded extends Error {
  constructor() {
    super('Inference deadline exceeded.');
  }
}

function getFinishReason(value: RecordValue): string | null {
  const keys = ['finish_reason', 'finishReason'].filter(key => key in value);
  if (keys.length > 1) throw invalidModelResponse('CONFLICTING_FINISH_METADATA');
  if (keys.length === 0) return null;
  const reason = value[keys[0]];
  if (typeof reason !== 'string' || !reason.trim()) throw invalidModelResponse('INVALID_FINISH_METADATA');
  return reason.trim().toLowerCase();
}

function normalizeUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: TokenUsage = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const) {
    const count = value[key];
    if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) usage[key] = count;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

type NeuronRate = {
  inputNeuronsPerMillion: number;
  outputNeuronsPerMillion: number;
  maxContextTokens: number;
  maxCompletionTokens: number;
};

function neuronRate(model: SupportedModel): NeuronRate | null {
  if (model === GEMMA_MODEL) {
    return {
      inputNeuronsPerMillion: 9_091,
      outputNeuronsPerMillion: 27_273,
      maxContextTokens: GEMMA_MAX_CONTEXT_TOKENS,
      maxCompletionTokens: GEMMA_MAX_COMPLETION_TOKENS,
    };
  }
  if (model === QWEN_MODEL) {
    return {
      inputNeuronsPerMillion: 4_625,
      outputNeuronsPerMillion: 30_475,
      maxContextTokens: QWEN_MAX_CONTEXT_TOKENS,
      maxCompletionTokens: QWEN_MAX_OUTPUT_TOKENS,
    };
  }
  return null;
}

export function reportedModelTokenUsage(value: unknown, model: SupportedModel): ReportedTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const rate = neuronRate(model);
  if (!rate) return undefined;
  const usage = normalizeUsage(value.usage);
  if (!usage || usage.prompt_tokens === undefined || usage.completion_tokens === undefined) return undefined;
  if (usage.prompt_tokens < 1
    || usage.prompt_tokens + usage.completion_tokens > rate.maxContextTokens
    || usage.completion_tokens > rate.maxCompletionTokens) return undefined;
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}

export function estimateNeuronUsageForModel(
  model: SupportedModel,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const rate = neuronRate(model);
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 1
    || !Number.isSafeInteger(completionTokens) || completionTokens < 0
    || !rate || promptTokens + completionTokens > rate.maxContextTokens
    || completionTokens > rate.maxCompletionTokens) return null;

  const inputNeurons = promptTokens * rate.inputNeuronsPerMillion;
  const outputNeurons = completionTokens * rate.outputNeuronsPerMillion;
  return Math.max(1, Math.ceil(((inputNeurons + outputNeurons) * 1.5) / 1_000_000));
}

export function estimateGemmaNeuronUsage(promptTokens: number, completionTokens: number): number | null {
  return estimateNeuronUsageForModel(GEMMA_MODEL, promptTokens, completionTokens);
}

function buildModelMessages(
  input: ChatRequest,
  model: SupportedModel,
  selection: TopicSelection,
): ModelMessage[] {
  const personalityExamples = model === GEMMA_MODEL
    ? selectPersonalityExamples(input.message, selection.categories)
    : [];
  const systemPrompt = buildSystemPrompt(selection.categories, selection.knowledgeProfile);
  return [
    {
      role: 'system',
      content: personalityExamples.length > 0
        ? `${systemPrompt}\n\n${PERSONALITY_EXAMPLE_INSTRUCTIONS}`
        : systemPrompt,
    },
    ...personalityExamples,
    ...input.history,
    { role: 'user', content: input.message },
  ];
}

export function estimateGemmaNeuronReservation(input: ChatRequest, selection: TopicSelection): number | null {
  return estimateModelNeuronReservation(input, selection, GEMMA_MODEL);
}

export function estimateModelNeuronReservation(
  input: ChatRequest,
  selection: TopicSelection,
  model: SupportedModel,
): number | null {
  const rate = neuronRate(model);
  if (!rate) return null;
  const messages = buildModelMessages(input, model, selection);
  const encoder = new TextEncoder();
  const promptBytes = messages.reduce(
    (total, message) => total + encoder.encode(`${message.role}\n${message.content}\n`).byteLength,
    0,
  );
  const promptTokenCeiling = promptBytes + (messages.length * 16) + 64;
  if (promptTokenCeiling + rate.maxCompletionTokens > rate.maxContextTokens) return null;
  return estimateNeuronUsageForModel(model, promptTokenCeiling, rate.maxCompletionTokens);
}

function normalizedResponse(result: unknown): ModelOutput {
  if (!isRecord(result)) throw invalidModelResponse('INVALID_RESPONSE_SHAPE');

  let content: unknown;
  let finishReason = getFinishReason(result);
  let hasLegacyResponseShape = false;
  if ('choices' in result) {
    if (!Array.isArray(result.choices) || result.choices.length === 0 || !isRecord(result.choices[0])) {
      throw invalidModelResponse('INVALID_CHOICES_SHAPE');
    }
    const choice = result.choices[0];
    const choiceReason = getFinishReason(choice);
    if (finishReason !== null && choiceReason !== null && finishReason !== choiceReason) {
      throw invalidModelResponse('CONFLICTING_FINISH_METADATA');
    }
    finishReason = choiceReason ?? finishReason;
    if ('message' in choice) {
      if (!isRecord(choice.message)) throw invalidModelResponse('INVALID_MESSAGE_SHAPE');
      if (typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content.trim()) {
        throw invalidModelResponse('REASONING_OUTPUT_PRESENT');
      }
      content = choice.message.content;
    } else {
      content = choice.text;
    }
  } else {
    content = result.response;
    hasLegacyResponseShape = true;
  }

  if (typeof content !== 'string' || !content.trim() || content.length > 8_000
    || /<\/?think\b/i.test(content)) {
    throw invalidModelResponse('INVALID_RESPONSE_CONTENT');
  }

  if (finishReason !== null) {
    if (['length', 'max_tokens', 'max_new_tokens', 'token_limit'].includes(finishReason)) {
      throw invalidModelResponse('OUTPUT_TOKEN_LIMIT');
    }
    if (!['stop', 'stop_sequence', 'eos', 'eos_token', 'end_turn', 'completed'].includes(finishReason)) {
      throw invalidModelResponse('UNSUPPORTED_FINISH_REASON');
    }
  } else if (!hasLegacyResponseShape) {
    throw invalidModelResponse('MISSING_FINISH_METADATA');
  }

  const usage = normalizeUsage(result.usage);
  return {
    response: content.trim(),
    finishReason,
    ...(usage ? { usage } : {}),
  };
}

function normalizedGemmaResponse(result: unknown): ModelOutput {
  // Gemma's documented chat-completions output is not Qwen's raw text/legacy shape.
  if (!isRecord(result) || !Array.isArray(result.choices) || result.choices.length !== 1
    || !isRecord(result.choices[0]) || !isRecord(result.choices[0].message)) {
    throw invalidModelResponse('INVALID_GEMMA_RESPONSE_SHAPE');
  }
  const choice = result.choices[0];
  const message = choice.message as RecordValue;
  if (message.role !== 'assistant' || !('finish_reason' in choice)) {
    throw invalidModelResponse('INVALID_GEMMA_MESSAGE_METADATA');
  }
  // Unexpected reasoning fields are defensive fixtures, not a promised provider shape.
  for (const record of [result, choice, message]) {
    for (const key of ['reasoning_content', 'reasoning']) {
      if (key in record && record[key] !== null && record[key] !== '') {
        throw invalidModelResponse('REASONING_OUTPUT_PRESENT');
      }
    }
  }
  if (typeof message.content === 'string' && /<\|channel>|<channel\|>|<\|think\|>/i.test(message.content)) {
    throw invalidModelResponse('REASONING_OUTPUT_PRESENT');
  }
  if ((message.refusal !== undefined && message.refusal !== null && message.refusal !== '')
    || (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0))
    || (message.function_call !== undefined && message.function_call !== null)) {
    throw invalidModelResponse('UNSUPPORTED_GEMMA_MESSAGE');
  }
  const reason = getFinishReason(choice);
  if (reason !== 'stop' && reason !== 'length') throw invalidModelResponse('UNSUPPORTED_FINISH_REASON');
  return normalizedResponse(result);
}

function escapeQwenContent(content: string): string {
  return content.replace(/<\|/g, '&lt;|');
}

function technologyPattern(technology: string): RegExp {
  const escaped = technology.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (technology === 'REST APIs') return /\bREST API(?:s)?\b/i;
  if (technology === 'Microsoft SQL Server') return /\b(?:Microsoft )?SQL Server\b/i;
  if (technology === 'Microsoft Power Platform') return /\b(?:Microsoft )?Power Platform\b/i;
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

function mentionsTechnology(clause: string, technology: string): boolean {
  const searchable = technology === 'Java'
    ? clause.replace(/\bJava Developer\b/gi, '')
    : clause;
  return technologyPattern(technology).test(searchable);
}

function hasUnsupportedEmployerTechnologyClaim(response: string): boolean {
  const technologies = [...new Set(PORTFOLIO_FACTS.career.employers.flatMap(record => record.technologies))];
  const clauses = response.split(/[.!?;\n]+|\b(?:while|whereas|but|although|unlike)\b/i);

  return clauses.some(clause => {
    const mentionedTechnologies = technologies.filter(technology => mentionsTechnology(clause, technology));
    if (mentionedTechnologies.length === 0) return false;
    return PORTFOLIO_FACTS.career.employers.some(record => {
      if (!clause.toLowerCase().includes(record.employer.toLowerCase())) return false;
      return mentionedTechnologies.some(technology => !record.technologies.some(supported => supported === technology));
    });
  });
}

const PROJECT_FACT_MAPPINGS = [
  {
    project: /\b(?:Netflix|Squid Game(?:\s+2)?|interactive poll system|poll installation)\b/i,
    technologies: PORTFOLIO_FACTS.projects.netflix.technologies,
  },
  {
    project: /\b(?:My\s?Verse|3D room portfolio)\b/i,
    technologies: PORTFOLIO_FACTS.myVerse.technologies,
  },
] as const;
const PROJECT_TECHNOLOGIES = [...new Set(PROJECT_FACT_MAPPINGS.flatMap(mapping => mapping.technologies))];
const PROJECT_ATTRIBUTION_VERBS = String.raw`(?:use|uses|using|used|build|builds|built|building|develop|develops|developed|developing|implement|implements|implemented|implementing|create|creates|created|creating|write|writes|written|writing|program|programs|programmed|programming|code|codes|coded|coding|run|runs|ran|running|power|powers|powered|powering|integrate|integrates|integrated|integrating|incorporate|incorporates|incorporated|incorporating|feature|features|featured|featuring)`;
const NEGATED_PROJECT_ATTRIBUTION = [
  /\b(?:did|does|do|is|are|was|were|has|have|had)\s+not\s+(?:use|uses|using|used|build|builds|built|develop|develops|developed|implement|implements|implemented|create|creates|created|write|writes|written|program|programs|programmed|code|codes|coded|run|runs|ran|power|powers|powered|integrate|integrates|integrated|incorporate|incorporates|incorporated|feature|features|featured)\b/i,
  /\b(?:didn't|doesn't|don't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\s+(?:use|uses|using|used|build|builds|built|develop|develops|developed|implement|implements|implemented|create|creates|created|write|writes|written|program|programs|programmed|code|codes|coded|run|runs|ran|power|powers|powered|integrate|integrates|integrated|incorporate|incorporates|incorporated|feature|features|featured)\b/i,
  /\bnever\s+(?:use|uses|using|used|build|builds|built|develop|develops|developed|implement|implements|implemented|create|creates|created|write|writes|written|program|programs|programmed|code|codes|coded|run|runs|ran|power|powers|powered|integrate|integrates|integrated|incorporate|incorporates|incorporated|feature|features|featured)\b/i,
  /\b(?:use|uses|using|used|build|builds|built|develop|develops|developed|implement|implements|implemented|create|creates|created|write|writes|written|program|programs|programmed|code|codes|coded|run|runs|ran|power|powers|powered|integrate|integrates|integrated|incorporate|incorporates|incorporated|feature|features|featured)\s+(?:no|without)\b/i,
  /\bwithout\s+(?:using|use|building|built|developing|developed|implementing|implemented)\b/i,
];

function hasPositiveProjectTechnologyAttribution(
  clause: string,
  project: RegExp,
  technology: string,
): boolean {
  const projectPattern = project.source;
  const technologySource = technologyPattern(technology).source;
  const withinClause = String.raw`(?:(?![.!?;]).){0,80}?`;
  const forward = new RegExp(
    `${projectPattern}${withinClause}\\b${PROJECT_ATTRIBUTION_VERBS}\\b${withinClause}${technologySource}`,
    'i',
  );
  const reverse = new RegExp(
    `${technologySource}${withinClause}\\b(?:(?:is|are|was|were|has been|have been|had been)\\s+)?${PROJECT_ATTRIBUTION_VERBS}\\b\\s+(?:(?:to\\s+)?(?:build|develop|implement|create)\\s+|with\\s+|in\\s+|for\\s+|by\\s+|on\\s+)?(?:the\\s+)?${projectPattern}`,
    'i',
  );
  const attribution = forward.exec(clause) ?? reverse.exec(clause);
  if (!attribution) return false;
  return !NEGATED_PROJECT_ATTRIBUTION.some(pattern => pattern.test(attribution[0]));
}

function hasUnsupportedProjectTechnologyClaim(response: string): boolean {
  const clauses = response.split(/[!?;\n]+|\.(?!js\b)|\b(?:while|whereas|but|although|unlike)\b/i);
  return clauses.some(clause => PROJECT_FACT_MAPPINGS.some(mapping => {
    const unsupported = PROJECT_TECHNOLOGIES.filter(technology =>
      !mapping.technologies.some(supported => supported.toLowerCase() === technology.toLowerCase()));
    return unsupported.some(technology =>
      hasPositiveProjectTechnologyAttribution(clause, mapping.project, technology));
  }));
}

function hasUnsupportedQualityClaim(response: string): boolean {
  const quality = /\b(?:stable|stability|scalable|scalability|scaleable|high[- ]performance|performant|performance|efficient|efficiency|robust|usable|usability|smooth|smoothly|seamless|award[- ]winning|industry[- ]leading|stabil|skalabel|kebolehskalaan|efisien|cekap|prestasi|kebolehgunaan|lancar|kelancaran)\b/i;
  const personalContext = /\b(?:Hafiz|he|his|beliau|pengalaman(?:\s+(?:ini|beliau|Hafiz|backend))?|kemahiran(?:\s+backend)?|My\s?Verse|Netflix|Squid Game(?:\s+2)?)\b/i;
  const accomplishment = /\b(?:understands?|allows?|enables?|helps?|builds?|built|develops?|developed|creates?|created|delivers?|delivered|implements?|implemented|ensures?|ensured|makes?|made|memahami|membolehkan|membangunkan|membina|menggunakan|memastikan|menjamin|menghasilkan|mencipta|menunjukkan|membuktikan|berfungsi|dijalankan)\b/i;
  const qualityPredicate = /\b(?:is|are|was|were|has been|have been|remains?)\s+(?!(?:not|never|no|unverified|unproven|unsupported|unknown)\b)(?:[\w-]+\s*){0,3}/i;
  const unsupportedExpertise = /\b(?:strong foundation|deep expertise|expertise)\s+in\s+(?:system\s+)?architecture\b/i;

  return response.split(/[.!?;\n]+/).some(statement => {
    const predicate = qualityPredicate.exec(statement)?.[0] ?? '';
    return (quality.test(statement) && personalContext.test(statement)
      && (accomplishment.test(statement) || quality.test(predicate)))
      || (unsupportedExpertise.test(statement) && personalContext.test(statement));
  });
}

function hasNonChronologicalDatedCareer(response: string, question: string): boolean {
  const records = [
    ...CAREER_TIMELINE,
    { employer: 'Independent Developer', startYear: CURRENT_CAREER_DATES.startYear },
  ];
  const lower = response.toLowerCase();
  const mentions = records.flatMap(record => {
    const positions: { position: number; startYear: number; nameLength: number }[] = [];
    let position = lower.indexOf(record.employer.toLowerCase());
    while (position !== -1) {
      positions.push({ position, startYear: record.startYear, nameLength: record.employer.length });
      position = lower.indexOf(record.employer.toLowerCase(), position + record.employer.length);
    }
    return positions;
  }).sort((a, b) => a.position - b.position);
  // Check explicit forward transitions independently of the question's intent.
  // This is a bounded relationship check, not a general temporal-language parser.
  for (let index = 1; index < mentions.length; index++) {
    const previous = mentions[index - 1];
    const current = mentions[index];
    const between = lower.slice(previous.position + previous.nameLength, current.position);
    const asserted = between.replace(/\b(?:not|never|tidak)\s+(?:later joined|then joined|kemudian menyertai)\b/g, '');
    if (current.startYear < previous.startYear
      && /\b(?:(?:later|then|subsequently)\s+(?:joined|worked at|moved to)|kemudian\s+(?:menyertai|bekerja di))\b/.test(asserted)) return true;
  }
  // Source ordering is required for requested/declared timelines, not comparisons
  // or focused descriptions of an earlier role relative to the current role.
  const explicitTimeline = /\b(?:timeline|chronolog(?:y|ical)|oldest[- ]first|garis masa|kronologi)\b/i;
  const comparison = /\b(?:compare|compared|comparison|versus|vs|bandingkan|berbanding|perbezaan)\b/i;
  const timelineQuestion = explicitTimeline.test(question)
    || (!comparison.test(question) && /\b(?:career|journey|kerjaya)\b/i.test(question));
  const declaredTimeline = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:(?:full|complete|chronological|oldest[- ]first)\s+)*(?:career\s+)?timeline\s*[:—-]|(?:^|\n)\s*(?:garis masa|kronologi)\s*(?:kerjaya)?\s*:/i;
  if (!timelineQuestion && !declaredTimeline.test(response)) return false;
  // Narrow check for dated role narration within an explicitly chronological mode.
  // Limit each date lookup to its own clause and the next employer mention.
  const dated = mentions.filter((mention, index) => {
    const end = Math.min(mention.position + mention.nameLength + 80, mentions[index + 1]?.position ?? response.length);
    const clause = response.slice(mention.position + mention.nameLength, end).split(/[.!?;\n]/, 1)[0];
    return new RegExp(`\\b${mention.startYear}\\b`).test(clause);
  });
  return dated.some((mention, index) => index > 0 && mention.startYear < dated[index - 1].startYear);
}

function validatePortfolioGrounding(response: string, categories: readonly KnowledgeCategory[], question: string): void {
  if (categories.includes('career') && hasNonChronologicalDatedCareer(response, question)) {
    throw guardrailFailure('NON_CHRONOLOGICAL_CAREER');
  }
  if (categories.includes('career') && hasUnsupportedEmployerTechnologyClaim(response)) {
    throw guardrailFailure('UNSUPPORTED_EMPLOYER_TECHNOLOGY');
  }
  if (hasUnsupportedProjectTechnologyClaim(response)) {
    throw guardrailFailure('UNSUPPORTED_PROJECT_TECHNOLOGY');
  }
  if (hasUnsupportedQualityClaim(response)) {
    throw guardrailFailure('UNSUPPORTED_QUALITY_CLAIM');
  }
}

export function qwenPrompt(messages: readonly ModelMessage[]): string {
  return messages.map(({ role, content }) => {
    if (!['system', 'user', 'assistant'].includes(role)) throw new Error('Unsupported model message role.');
    return `<|im_start|>${role}\n${escapeQwenContent(content)}<|im_end|>\n`;
  }).join('') + '<|im_start|>assistant\n<think>\n\n</think>\n\n';
}

export async function invokeModel(
  ai: Pick<Env['AI'], 'run'>,
  model: SupportedModel,
  input: ModelRequest,
  options?: AiOptions,
  instrumentation?: InferenceInstrumentation,
): Promise<ModelOutput> {
  instrumentation?.beforeInference?.(model);
  let result: unknown;
  try {
    result = model === QWEN_MODEL
      ? await ai.run(model, {
        prompt: qwenPrompt(input.messages),
        raw: true,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
        stream: input.stream,
      }, options)
      : model === GEMMA_MODEL
        ? await ai.run(model, {
          messages: input.messages,
          max_completion_tokens: GEMMA_MAX_COMPLETION_TOKENS,
          temperature: input.temperature,
          stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }, options)
        : await ai.run(model, input, options);
  } catch (error) {
    throw new ProviderRejection(error);
  }
  if (options?.signal?.aborted) throw new InferenceDeadlineExceeded();
  instrumentation?.onProviderResponse?.(result);
  try {
    const output = model === GEMMA_MODEL ? normalizedGemmaResponse(result) : normalizedResponse(result);
    instrumentation?.onNormalization?.('succeeded');
    return output;
  } catch (error) {
    const code = isRecord(error) && typeof error.diagnosticCode === 'string' ? error.diagnosticCode : null;
    instrumentation?.onNormalization?.(code === 'OUTPUT_TOKEN_LIMIT' ? 'truncated' : 'invalid');
    throw error;
  }
}

function getProviderErrorCode(error: unknown): number | undefined {
  const code = isRecord(error) && 'code' in error ? Number(error.code)
    : error instanceof Error ? Number(/^(\d+):/.exec(error.message)?.[1]) : NaN;
  return Number.isSafeInteger(code) && code >= 0 ? code : undefined;
}

function upstreamError(error: unknown): ApiError {
  if (isRecord(error) && typeof error.diagnosticCode === 'string') {
    return new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI returned incomplete output.', error.diagnosticCode);
  }
  // workerd's AI binding formats errors as "<internalCode>: <description>".
  // Match an explicit code, never vague text such as "quota" or "limit".
  const code = isRecord(error) && 'code' in error ? Number(error.code)
    : error instanceof Error ? Number(/^(\d+):/.exec(error.message)?.[1]) : NaN;
  if (code === 3036) {
    return new ApiError(429, 'AI_QUOTA_EXCEEDED', 'MyVerse AI usage allowance is temporarily exhausted.');
  }
  if (code === 3040 || (isRecord(error) && 'status' in error && error.status === 429)) {
    return new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI is temporarily unavailable.');
  }
  return new ApiError(503, 'AI_UNAVAILABLE', 'MyVerse AI is temporarily unavailable.');
}

export async function reply(
  ai: Pick<Env['AI'], 'run'>,
  input: ChatRequest,
  model: SupportedModel = MODEL,
  selection: TopicSelection = selectTopics(input),
  instrumentation?: InferenceInstrumentation,
): Promise<ModelOutput> {
  const messages = buildModelMessages(input, model, selection);
  const modelInput: ModelRequest = {
    messages, temperature: 0.4,
    max_tokens: model === QWEN_MODEL ? QWEN_MAX_OUTPUT_TOKENS : 250,
    stream: false,
  };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const inferenceStartedAt = Date.now();
  let deadlineReached = false;
  let abortRequested = false;
  let responseNormalizationOutcome: ResponseNormalizationOutcome = 'not_started';
  let elapsedReported = false;
  const reportElapsed = () => {
    if (elapsedReported) return Math.max(0, Date.now() - inferenceStartedAt);
    elapsedReported = true;
    const elapsedMs = Math.max(0, Date.now() - inferenceStartedAt);
    instrumentation?.onElapsed?.(elapsedMs);
    return elapsedMs;
  };
  const trackedInstrumentation = instrumentation ? {
    ...instrumentation,
    onProviderResponse: (result: unknown) => {
      if (!deadlineReached) instrumentation.onProviderResponse?.(result);
    },
    onNormalization: (outcome: ResponseNormalizationOutcome) => {
      if (deadlineReached) return;
      responseNormalizationOutcome = outcome;
      instrumentation.onNormalization?.(outcome);
    },
  } : undefined;
  try {
    const output = await Promise.race([
      invokeModel(ai, model, modelInput, { signal: controller.signal }, trackedInstrumentation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          deadlineReached = true;
          abortRequested = true;
          reject(new InferenceDeadlineExceeded());
          controller.abort();
        }, AI_TIMEOUT_MS);
      }),
    ]);
    reportElapsed();
    if (model === QWEN_MODEL || model === GEMMA_MODEL) validatePortfolioGrounding(output.response, selection.categories, input.message);
    return output;
  } catch (error) {
    const elapsedInferenceMs = reportElapsed();
    const providerRejected = error instanceof ProviderRejection;
    const originalError = providerRejected ? error.cause : error;
    const providerErrorCode = providerRejected ? getProviderErrorCode(originalError) : undefined;
    const normalizationFailure = isRecord(originalError) && originalError.normalizationFailure === true;
    const diagnosticCode = normalizationFailure && typeof originalError.diagnosticCode === 'string'
      ? originalError.diagnosticCode : null;
    let failureCategory: InternalFailureCategory = 'UNKNOWN';
    if (deadlineReached || error instanceof InferenceDeadlineExceeded) {
      failureCategory = 'INFERENCE_DEADLINE_EXCEEDED';
    } else if (providerRejected) {
      failureCategory = providerErrorCode === 3036 ? 'AI_PROVIDER_QUOTA' : 'AI_PROVIDER_REJECTED';
    } else if (diagnosticCode === 'OUTPUT_TOKEN_LIMIT') {
      failureCategory = 'AI_RESPONSE_TRUNCATED';
    } else if (normalizationFailure) {
      failureCategory = 'AI_RESPONSE_INVALID';
    }
    const mapped = upstreamError(originalError);
    const internalDiagnostics: InternalInferenceDiagnostics = {
      failureCategory,
      elapsedInferenceMs,
      deadlineReached,
      abortRequested,
      providerRejected,
      responseNormalizationOutcome,
      publicHttpErrorCode: mapped.code,
      ...(providerErrorCode !== undefined ? { providerErrorCode } : {}),
    };
    throw new ApiError(mapped.status, mapped.code, mapped.message, mapped.diagnosticCode, internalDiagnostics, error);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
