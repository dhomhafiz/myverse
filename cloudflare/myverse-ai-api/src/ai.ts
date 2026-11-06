import { PORTFOLIO_FACTS, type KnowledgeCategory } from './knowledge.ts';
import { buildSystemPrompt } from './prompts.ts';
import { selectTopics, type TopicSelection } from './topics.ts';
import type { ChatRequest } from './validation.ts';
import { ApiError } from './responses.ts';

export const MODEL = '@cf/meta/llama-3.2-3b-instruct' as const;
export const QWEN_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8' as const;
export type SupportedModel = typeof MODEL | typeof QWEN_MODEL;
export const AI_TIMEOUT_MS = 15_000;

type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
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
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidModelResponse(reason: string): Error {
  return Object.assign(new Error('Unexpected or incomplete model response.'), { diagnosticCode: reason });
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
  const unsupportedExpertise = /\b(?:strong foundation|deep expertise|expertise)\s+in\s+(?:system\s+)?architecture\b/i;

  return response.split(/[.!?;\n]+/).some(statement =>
    (quality.test(statement) && personalContext.test(statement) && accomplishment.test(statement))
    || (unsupportedExpertise.test(statement) && personalContext.test(statement)));
}

function validateQwenGrounding(response: string, categories: readonly KnowledgeCategory[]): void {
  if (categories.includes('career') && hasUnsupportedEmployerTechnologyClaim(response)) {
    throw invalidModelResponse('UNSUPPORTED_EMPLOYER_TECHNOLOGY');
  }
  if (hasUnsupportedProjectTechnologyClaim(response)) {
    throw invalidModelResponse('UNSUPPORTED_PROJECT_TECHNOLOGY');
  }
  if (hasUnsupportedQualityClaim(response)) {
    throw invalidModelResponse('UNSUPPORTED_QUALITY_CLAIM');
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
  const result: unknown = model === QWEN_MODEL
    ? await ai.run(model, {
      prompt: qwenPrompt(input.messages),
      raw: true,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      stream: input.stream,
    }, options)
    : await ai.run(model, input, options);
  instrumentation?.onProviderResponse?.(result);
  return normalizedResponse(result);
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
  const messages: ModelMessage[] = [
    { role: 'system', content: buildSystemPrompt(selection.categories) },
    ...input.history,
    { role: 'user', content: input.message },
  ];
  const modelInput: ModelRequest = { messages, temperature: 0.4, max_tokens: 250, stream: false };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const output = await Promise.race([
      invokeModel(ai, model, modelInput, { signal: controller.signal }, instrumentation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Inference deadline exceeded'));
          controller.abort();
        }, AI_TIMEOUT_MS);
      }),
    ]);
    if (model === QWEN_MODEL) validateQwenGrounding(output.response, selection.categories);
    return output;
  } catch (error) {
    throw upstreamError(error);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
