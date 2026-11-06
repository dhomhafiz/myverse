/* global fetch */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const API_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_DIRECTORY = path.resolve(API_ROOT, 'bench', 'acceptance-results');
const SAFE_HEADER_NAMES = new Set([
  'content-type',
  'cf-ray',
  'server-timing',
  'x-request-id',
]);
const DIAGNOSTIC_HEADERS = new Set([
  'x-local-evaluation',
  'x-benchmark-metadata',
  'x-reliability-timing',
]);
const INFERENCE_STATUSES = new Set(['confirmed', 'unknown', 'not_reached']);

export function resolveAcceptanceOutputDirectory(directory = DEFAULT_OUTPUT_DIRECTORY) {
  if (path.isAbsolute(directory)) return path.normalize(directory);
  return path.resolve(API_ROOT, directory);
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

export function isAttemptRecordValid(record) {
  return isObject(record)
    && typeof record.scenarioId === 'string'
    && typeof record.requestStartedAt === 'string'
    && (record.httpStatus === null || Number.isInteger(record.httpStatus))
    && (record.totalLatencyMs === null
      || (Number.isFinite(record.totalLatencyMs) && record.totalLatencyMs >= 0))
    && (record.rawResponseBody === null || typeof record.rawResponseBody === 'string')
    && (record.parsedResponse === null || isObject(record.parsedResponse))
    && isObject(record.safeDiagnosticHeaders)
    && ['present', 'missing', 'invalid'].includes(record.diagnosticHeaderStatus)
    && isNullableString(record.model)
    && isNullableString(record.source)
    && isNullableString(record.guardrailOutcome)
    && isNullableString(record.errorClassification)
    && INFERENCE_STATUSES.has(record.providerInferenceStatus)
    && typeof record.testCompletedSuccessfully === 'boolean';
}

export function isJournalValid(journal) {
  return isObject(journal)
    && journal.schemaVersion === 1
    && typeof journal.runId === 'string'
    && typeof journal.createdAt === 'string'
    && Array.isArray(journal.attempts)
    && journal.attempts.every(isAttemptRecordValid);
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error) {
  return isObject(error) && typeof error.code === 'string' ? error.code : null;
}

function fileExists(fsApi, filePath) {
  return fsApi.lstat(filePath).then(
    () => true,
    error => {
      if (errorCode(error) === 'ENOENT') return false;
      throw error;
    },
  );
}

async function removeIfPresent(fsApi, filePath) {
  try {
    await fsApi.unlink(filePath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

async function removeEmptyDirectory(fsApi, directory) {
  try {
    await fsApi.rmdir(directory);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(errorCode(error))) throw error;
  }
}

function outputError(action, filePath, error) {
  return new Error(`Acceptance result ${action} failed at "${filePath}": ${errorText(error)}`, { cause: error });
}

async function createRunDirectory(fsApi, outputDirectory, runId) {
  await fsApi.mkdir(outputDirectory, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? runId : `${runId}-${attempt}`;
    const candidate = path.join(outputDirectory, suffix);
    try {
      await fsApi.mkdir(candidate);
      return candidate;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
  }
  throw new Error(`Acceptance result directory collision at "${outputDirectory}".`);
}

async function writeAtomic(fsApi, target, payload, allowReplace) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  let primaryError;
  try {
    handle = await fsApi.open(temporary, 'wx');
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    if (allowReplace) await fsApi.rename(temporary, target);
    else await fsApi.link(temporary, target);
  } catch (error) {
    primaryError = error;
  }

  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      primaryError ??= error;
    }
  }

  try {
    await removeIfPresent(fsApi, temporary);
  } catch (error) {
    if (primaryError) throw new AggregateError([primaryError, error], 'Result write and temporary-file cleanup failed.');
    primaryError = error;
  }
  if (primaryError) throw outputError('write', target, primaryError);
}

export async function prepareResultWriter({
  outputDirectory = DEFAULT_OUTPUT_DIRECTORY,
  fsApi = fs.promises,
  now = new Date(),
  runId = `${now.toISOString().replaceAll(':', '-')}-${process.pid}-${randomUUID()}`,
} = {}) {
  const resolvedOutputDirectory = resolveAcceptanceOutputDirectory(outputDirectory);
  let runDirectory;
  try {
    runDirectory = await createRunDirectory(fsApi, resolvedOutputDirectory, runId);
  } catch (error) {
    throw outputError('preflight directory creation', resolvedOutputDirectory, error);
  }

  const probePath = path.join(runDirectory, `.write-check-${randomUUID()}.tmp`);
  try {
    const probe = 'myverse-acceptance-writer-check';
    const handle = await fsApi.open(probePath, 'wx');
    try {
      await handle.writeFile(probe, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    const written = await fsApi.readFile(probePath, 'utf8');
    if (written !== probe) throw new Error('Writer check content did not match.');
  } catch (error) {
    try {
      await removeIfPresent(fsApi, probePath);
      await removeEmptyDirectory(fsApi, runDirectory);
    } catch (cleanupError) {
      throw new AggregateError(
        [outputError('preflight write check', runDirectory, error), cleanupError],
        'Acceptance result preflight and probe cleanup failed.',
      );
    }
    throw outputError('preflight write check', runDirectory, error);
  }
  await removeIfPresent(fsApi, probePath);

  const filePath = path.join(runDirectory, 'results.json');
  try {
    if (await fileExists(fsApi, filePath)) {
      throw new Error(`Refusing to use existing result file "${filePath}".`);
    }
  } catch (error) {
    throw outputError('preflight collision check', filePath, error);
  }

  const journal = {
    schemaVersion: 1,
    runId,
    createdAt: now.toISOString(),
    attempts: [],
  };
  if (!isJournalValid(journal)) throw new Error('Acceptance result journal failed schema validation.');

  const writer = {
    outputDirectory: runDirectory,
    filePath,
    journal,
    hasPersisted: false,
    async persist() {
      if (!isJournalValid(journal)) throw new Error('Acceptance result journal failed schema validation.');
      await writeAtomic(fsApi, filePath, `${JSON.stringify(journal, null, 2)}\n`, this.hasPersisted);
      this.hasPersisted = true;
    },
  };
  await writer.persist();
  return writer;
}

function safeLocalEvaluation(value) {
  if (!isObject(value)) return null;
  const safe = {};
  if (Number.isSafeInteger(value.attemptedCalls) && value.attemptedCalls >= 0) {
    safe.attemptedCalls = value.attemptedCalls;
  }
  if (typeof value.actualModelId === 'string') safe.actualModelId = value.actualModelId;
  if (typeof value.diagnosticCode === 'string') safe.diagnosticCode = value.diagnosticCode;
  if (typeof value.apiErrorCode === 'string') safe.apiErrorCode = value.apiErrorCode;
  if (isObject(value.request)) {
    const request = {};
    if (Array.isArray(value.request.selectedCategories)
      && value.request.selectedCategories.every(item => typeof item === 'string')) {
      request.selectedCategories = value.request.selectedCategories;
    }
    if (typeof value.request.selectionReason === 'string') request.selectionReason = value.request.selectionReason;
    if (Object.keys(request).length) safe.request = request;
  }
  if (isObject(value.output)) {
    const output = {};
    if (typeof value.output.normalizedOutputSucceeded === 'boolean') {
      output.normalizedOutputSucceeded = value.output.normalizedOutputSucceeded;
    }
    if (typeof value.output.finishReason === 'string' || value.output.finishReason === null) {
      output.finishReason = value.output.finishReason;
    }
    if (isObject(value.output.usage)) output.usage = safeUsage(value.output.usage);
    if (Object.keys(output).length) safe.output = output;
  }
  if (isObject(value.providerResponse)) {
    const providerResponse = {};
    if (typeof value.providerResponse.responseShape === 'string') {
      providerResponse.responseShape = value.providerResponse.responseShape;
    }
    if (typeof value.providerResponse.rawFinishReason === 'string'
      || value.providerResponse.rawFinishReason === null) {
      providerResponse.rawFinishReason = value.providerResponse.rawFinishReason;
    }
    if (typeof value.providerResponse.generatedText === 'string') {
      providerResponse.generatedText = value.providerResponse.generatedText;
    }
    if (isObject(value.providerResponse.rawUsage)) {
      providerResponse.rawUsage = safeUsage(value.providerResponse.rawUsage);
    }
    if (Object.keys(providerResponse).length) safe.providerResponse = providerResponse;
  }
  return safe;
}

function safeUsage(value) {
  const usage = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) usage[key] = value[key];
  }
  return usage;
}

function safeBenchmarkMetadata(value) {
  if (!isObject(value)) return null;
  const safe = {};
  if (typeof value.candidate === 'string') safe.candidate = value.candidate;
  if (typeof value.inputHash === 'string') safe.inputHash = value.inputHash;
  return safe;
}

function safeReliabilityTiming(value) {
  if (!isObject(value)) return null;
  const safe = {};
  if (typeof value.id === 'string') safe.id = value.id;
  if (isObject(value.eventsMs)) {
    const eventsMs = {};
    for (const [key, number] of Object.entries(value.eventsMs)) {
      if (Number.isFinite(number)) eventsMs[key] = number;
    }
    safe.eventsMs = eventsMs;
  }
  for (const key of ['bindingSettled', 'signalAborted']) {
    if (typeof value[key] === 'boolean') safe[key] = value[key];
  }
  return safe;
}

export function collectSafeDiagnosticHeaders(headers) {
  const safe = {};
  for (const [name, value] of headers.entries()) {
    const lowerName = name.toLowerCase();
    if (SAFE_HEADER_NAMES.has(lowerName)) {
      safe[lowerName] = value;
      continue;
    }
    if (!DIAGNOSTIC_HEADERS.has(lowerName)) continue;
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      safe[lowerName] = { parseError: true };
      continue;
    }
    if (lowerName === 'x-local-evaluation') safe[lowerName] = safeLocalEvaluation(parsed);
    if (lowerName === 'x-benchmark-metadata') safe[lowerName] = safeBenchmarkMetadata(parsed);
    if (lowerName === 'x-reliability-timing') safe[lowerName] = safeReliabilityTiming(parsed);
  }
  return safe;
}

function getLocalEvaluation(record) {
  const value = record.safeDiagnosticHeaders['x-local-evaluation'];
  return isObject(value) ? value : null;
}

function classifyProviderInference(record) {
  if (record.source === 'faq' || record.parsedResponse?.error?.code === 'RATE_LIMITED') {
    return 'not_reached';
  }
  const diagnostics = getLocalEvaluation(record);
  if (record.source === 'ai' && typeof record.model === 'string') return 'confirmed';
  if (diagnostics?.providerResponse?.responseShape
    && diagnostics.providerResponse.responseShape !== 'invalid') return 'confirmed';
  return 'unknown';
}

function responseErrorCode(record) {
  const value = record.parsedResponse?.error?.code;
  return typeof value === 'string' ? value : null;
}

export async function captureAcceptanceAttempt({
  writer,
  scenarioId,
  url,
  init,
  timeoutMs = 22_000,
  fetchImpl = fetch,
  evaluate,
  clock = () => performance.now(),
  dateNow = () => new Date(),
}) {
  const record = {
    scenarioId,
    requestStartedAt: dateNow().toISOString(),
    httpStatus: null,
    totalLatencyMs: null,
    rawResponseBody: null,
    parsedResponse: null,
    safeDiagnosticHeaders: {},
    diagnosticHeaderStatus: 'missing',
    model: null,
    source: null,
    guardrailOutcome: null,
    errorClassification: null,
    providerInferenceStatus: 'unknown',
    testCompletedSuccessfully: false,
  };
  writer.journal.attempts.push(record);
  await writer.persist();
  record.requestStartedAt = dateNow().toISOString();
  await writer.persist();

  const started = clock();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      record.totalLatencyMs = Math.max(0, Math.round(clock() - started));
      record.providerInferenceStatus = classifyProviderInference(record);
      record.errorClassification = controller.signal.aborted
        ? 'timeout'
        : errorCode(error) === 'ECONNREFUSED' || errorCode(error?.cause) === 'ECONNREFUSED'
          ? 'connection_refused' : 'transport_error';
      await finishAttempt(writer, record);
      return record;
    }

    record.httpStatus = response.status;
    record.safeDiagnosticHeaders = collectSafeDiagnosticHeaders(response.headers);
    const rawLocalDiagnostics = response.headers.get('x-local-evaluation');
    record.diagnosticHeaderStatus = rawLocalDiagnostics === null ? 'missing'
      : record.safeDiagnosticHeaders['x-local-evaluation']?.parseError === true ? 'invalid' : 'present';
    await writer.persist();
    try {
      record.rawResponseBody = await response.text();
    } catch {
      record.errorClassification = controller.signal.aborted ? 'timeout' : 'response_body_read_error';
      record.totalLatencyMs = Math.max(0, Math.round(clock() - started));
      record.providerInferenceStatus = classifyProviderInference(record);
      return await finishAttempt(writer, record);
    }
    record.totalLatencyMs = Math.max(0, Math.round(clock() - started));
    await writer.persist();
    try {
      record.parsedResponse = JSON.parse(record.rawResponseBody);
      if (!isObject(record.parsedResponse)) throw new TypeError('Response JSON must be an object.');
    } catch {
      record.errorClassification = 'malformed_response';
      record.providerInferenceStatus = classifyProviderInference(record);
      return await finishAttempt(writer, record);
    }

    record.model = typeof record.parsedResponse.model === 'string' ? record.parsedResponse.model : null;
    record.source = typeof record.parsedResponse.source === 'string' ? record.parsedResponse.source : null;
    const diagnostics = getLocalEvaluation(record);
    record.model ??= typeof diagnostics?.actualModelId === 'string' ? diagnostics.actualModelId : null;
    const diagnosticCode = diagnostics?.diagnosticCode;
    record.guardrailOutcome = typeof diagnosticCode === 'string' ? 'rejected'
      : record.source === 'ai' && record.parsedResponse.success === true ? 'accepted'
        : record.source === 'faq' ? 'not_applicable' : null;
    record.providerInferenceStatus = classifyProviderInference(record);
    await writer.persist();

    if (response.status !== 200) {
      const code = responseErrorCode(record);
      record.errorClassification = code ? `http_${response.status}_${code}` : `http_${response.status}`;
    }
    if (typeof evaluate === 'function') {
      try {
        record.testCompletedSuccessfully = (await evaluate(record)) === true;
        if (!record.testCompletedSuccessfully) record.errorClassification ??= 'evaluation_failed';
      } catch {
        record.errorClassification = 'evaluation_exception';
      }
    } else if (response.status === 200) {
      record.testCompletedSuccessfully = response.ok && record.parsedResponse.success === true;
      if (!record.testCompletedSuccessfully) record.errorClassification = 'evaluation_failed';
    }
    return await finishAttempt(writer, record);
  } finally {
    clearTimeout(timeout);
  }
}

async function finishAttempt(writer, record) {
  await writer.persist();
  return record;
}

export function acceptanceOutputDirectory() {
  return DEFAULT_OUTPUT_DIRECTORY;
}
