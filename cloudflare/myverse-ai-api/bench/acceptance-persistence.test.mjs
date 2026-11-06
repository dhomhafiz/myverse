import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  captureAcceptanceAttempt,
  isJournalValid,
  prepareResultWriter,
  resolveAcceptanceOutputDirectory,
} from './acceptance-results.mjs';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));

async function temporaryDirectory(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'myverse-acceptance-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function mockServer(t) {
  const server = http.createServer((request, response) => {
    const diagnostics = JSON.stringify({
      attemptedCalls: 1,
      actualModelId: '@cf/qwen/qwen3-30b-a3b-fp8',
      diagnosticCode: null,
      apiErrorCode: null,
      output: { normalizedOutputSucceeded: true, finishReason: 'stop', usage: { total_tokens: 14 } },
      providerResponse: {
        responseShape: 'choices.message',
        rawFinishReason: 'stop',
        generatedText: 'Generated answer for comparison.',
        rawUsage: { total_tokens: 14 },
      },
    });
    response.setHeader('content-type', 'application/json');
    response.setHeader('authorization', 'secret-response-credential');
    if (request.url === '/ai') {
      response.setHeader('x-local-evaluation', diagnostics);
      response.end(JSON.stringify({
        success: true, reply: 'Mocked answer.', model: '@cf/qwen/qwen3-30b-a3b-fp8', source: 'ai',
      }));
    } else if (request.url === '/faq') {
      response.setHeader('x-local-evaluation', JSON.stringify({ attemptedCalls: 0 }));
      response.end(JSON.stringify({ success: true, reply: 'Mocked FAQ.', source: 'faq' }));
    } else if (request.url === '/unavailable') {
      response.statusCode = 503;
      response.setHeader('x-local-evaluation', JSON.stringify({
        attemptedCalls: 1, actualModelId: '@cf/qwen/qwen3-30b-a3b-fp8', providerResponse: null,
        apiErrorCode: 'AI_UNAVAILABLE',
      }));
      response.end(JSON.stringify({ success: false, error: { code: 'AI_UNAVAILABLE' } }));
    } else if (request.url === '/guardrail-rejected') {
      response.statusCode = 503;
      response.setHeader('x-local-evaluation', JSON.stringify({
        attemptedCalls: 1,
        actualModelId: '@cf/qwen/qwen3-30b-a3b-fp8',
        diagnosticCode: 'UNSUPPORTED_PROJECT_TECHNOLOGY',
        providerResponse: {
          responseShape: 'choices.message',
          generatedText: 'The Netflix installation used Next.js and Three.js.',
        },
      }));
      response.end(JSON.stringify({
        success: false,
        error: { code: 'AI_UNAVAILABLE', message: 'Sorry, the AI Companion is temporarily unavailable.' },
      }));
    } else if (request.url === '/limited') {
      response.statusCode = 429;
      response.end(JSON.stringify({ success: false, error: { code: 'RATE_LIMITED' } }));
    } else if (request.url === '/invalid-json') {
      response.end('{invalid json');
    } else if (request.url === '/missing-diagnostics') {
      response.end(JSON.stringify({
        success: true, reply: 'No diagnostic header.', model: '@cf/qwen/qwen3-30b-a3b-fp8', source: 'ai',
      }));
    } else if (request.url === '/evaluation-exception') {
      response.setHeader('x-local-evaluation', diagnostics);
      response.end(JSON.stringify({ success: true, reply: 'Captured first.', source: 'ai' }));
    } else if (request.url === '/timeout') {
      setTimeout(() => {
        if (!response.destroyed) response.end(JSON.stringify({ success: true, reply: 'Too late.' }));
      }, 100);
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('preflight creates missing directories and resolves Windows paths from the API package', async t => {
  const root = await temporaryDirectory(t);
  const missing = path.join(root, 'missing', 'acceptance');
  const writer = await prepareResultWriter({ outputDirectory: missing, runId: 'preflight' });
  assert.equal(fs.existsSync(path.join(writer.outputDirectory, 'results.json')), true);
  const journal = JSON.parse(fs.readFileSync(writer.filePath, 'utf8'));
  assert.equal(isJournalValid(journal), true);
  assert.equal(isJournalValid({ ...journal, schemaVersion: 2 }), false);

  const expectedDefault = path.resolve(apiRoot, 'bench', 'acceptance-results');
  const previousDirectory = process.cwd();
  try {
    process.chdir(root);
    assert.equal(resolveAcceptanceOutputDirectory(), expectedDefault);
  } finally {
    process.chdir(previousDirectory);
  }
  const windowsDirectory = path.win32.resolve(apiRoot, '..', 'windows-acceptance-results');
  assert.equal(resolveAcceptanceOutputDirectory(windowsDirectory), windowsDirectory);
  assert.equal(path.win32.isAbsolute(resolveAcceptanceOutputDirectory(windowsDirectory)), true);
});

test('invalid output paths and permission failures abort preflight before a request can run', async t => {
  const root = await temporaryDirectory(t);
  const pathFile = path.join(root, 'not-a-directory');
  await fs.promises.writeFile(pathFile, 'existing benchmark');
  await assert.rejects(
    prepareResultWriter({ outputDirectory: pathFile, runId: 'invalid' }),
    /preflight directory creation failed/,
  );

  const fsApi = Object.create(fs.promises);
  fsApi.open = async (target, flags) => {
    if (String(target).includes('.write-check-')) {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    }
    return fs.promises.open(target, flags);
  };
  let fetchCalled = false;
  await assert.rejects(
    async () => {
      const writer = await prepareResultWriter({
        outputDirectory: path.join(root, 'denied'), fsApi, runId: 'permission',
      });
      await captureAcceptanceAttempt({
        writer,
        scenarioId: 'must-not-send',
        url: 'http://127.0.0.1/',
        init: { method: 'POST' },
        fetchImpl: async () => {
          fetchCalled = true;
          return new Response('{}');
        },
      });
    },
    /preflight write check failed/,
  );
  assert.equal(fetchCalled, false);
  assert.equal(fs.readFileSync(pathFile, 'utf8'), 'existing benchmark');
});

test('mock HTTP responses are captured before evaluation and preserve all outcomes', async t => {
  const root = await temporaryDirectory(t);
  const outputDirectory = path.join(root, 'new-results');
  const writer = await prepareResultWriter({ outputDirectory, runId: 'mock-e2e' });
  const endpoint = await mockServer(t);
  const commonInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'secret-request-credential',
    },
    body: JSON.stringify({ message: 'not stored in result journal' }),
  };
  const run = (scenarioId, route, extra = {}) => captureAcceptanceAttempt({
    writer, scenarioId, url: `${endpoint}/${route}`, init: commonInit, ...extra,
  });

  const ai = await run('ai-success', 'ai');
  assert.equal(ai.httpStatus, 200);
  assert.equal(ai.source, 'ai');
  assert.equal(ai.providerInferenceStatus, 'confirmed');
  assert.equal(ai.testCompletedSuccessfully, true);
  assert.equal(ai.safeDiagnosticHeaders['x-local-evaluation'].providerResponse.generatedText, 'Generated answer for comparison.');

  const faq = await run('faq-success', 'faq');
  assert.equal(faq.source, 'faq');
  assert.equal(faq.providerInferenceStatus, 'not_reached');

  const unavailable = await run('ai-unavailable', 'unavailable');
  assert.equal(unavailable.httpStatus, 503);
  assert.equal(unavailable.errorClassification, 'http_503_AI_UNAVAILABLE');
  assert.equal(unavailable.providerInferenceStatus, 'unknown');

  const guardrailRejected = await run('guardrail-rejected', 'guardrail-rejected', {
    evaluate: attempt => attempt.httpStatus === 503
      && attempt.guardrailOutcome === 'rejected'
      && attempt.safeDiagnosticHeaders['x-local-evaluation'].providerResponse.generatedText
        === 'The Netflix installation used Next.js and Three.js.',
  });
  assert.equal(guardrailRejected.httpStatus, 503);
  assert.equal(guardrailRejected.guardrailOutcome, 'rejected');
  assert.equal(guardrailRejected.parsedResponse.error.message, 'Sorry, the AI Companion is temporarily unavailable.');
  assert.equal(guardrailRejected.testCompletedSuccessfully, true);
  assert.equal(guardrailRejected.errorClassification, 'http_503_AI_UNAVAILABLE');
  assert.equal(guardrailRejected.providerInferenceStatus, 'confirmed');

  const limited = await run('rate-limited', 'limited');
  assert.equal(limited.httpStatus, 429);
  assert.equal(limited.errorClassification, 'http_429_RATE_LIMITED');
  assert.equal(limited.providerInferenceStatus, 'not_reached');

  const timeout = await run('timeout', 'timeout', { timeoutMs: 20 });
  assert.equal(timeout.httpStatus, null);
  assert.equal(timeout.errorClassification, 'timeout');
  assert.equal(timeout.providerInferenceStatus, 'unknown');

  const malformed = await run('invalid-json', 'invalid-json');
  assert.equal(malformed.httpStatus, 200);
  assert.equal(malformed.rawResponseBody, '{invalid json');
  assert.equal(malformed.errorClassification, 'malformed_response');
  assert.equal(malformed.parsedResponse, null);

  const missing = await run('missing-diagnostics', 'missing-diagnostics');
  assert.equal(missing.diagnosticHeaderStatus, 'missing');
  assert.equal(missing.safeDiagnosticHeaders['x-local-evaluation'], undefined);
  assert.equal(missing.testCompletedSuccessfully, true);

  let capturedBeforeEvaluation;
  const evaluationFailure = await run('evaluation-exception', 'evaluation-exception', {
    evaluate: () => {
      capturedBeforeEvaluation = JSON.parse(fs.readFileSync(writer.filePath, 'utf8')).attempts
        .find(attempt => attempt.scenarioId === 'evaluation-exception');
      throw new Error('evaluation failure');
    },
  });
  assert.equal(capturedBeforeEvaluation.rawResponseBody, evaluationFailure.rawResponseBody);
  assert.equal(capturedBeforeEvaluation.httpStatus, 200);
  assert.equal(evaluationFailure.parsedResponse.reply, 'Captured first.');
  assert.equal(evaluationFailure.errorClassification, 'evaluation_exception');
  assert.equal(evaluationFailure.testCompletedSuccessfully, false);

  const persisted = JSON.parse(fs.readFileSync(writer.filePath, 'utf8'));
  assert.equal(persisted.attempts.length, 9);
  assert.equal(isJournalValid(persisted), true);
  assert.equal(JSON.stringify(persisted).includes('secret-request-credential'), false);
  assert.equal(JSON.stringify(persisted).includes('secret-response-credential'), false);
  assert.equal(JSON.stringify(persisted).includes('Generated answer for comparison.'), true);
  assert.equal(JSON.stringify(persisted).includes('not stored in result journal'), false);
  assert.deepEqual(fs.readdirSync(writer.outputDirectory), ['results.json']);
});

test('existing benchmark files remain untouched and preflight output is collision-safe', async t => {
  const root = await temporaryDirectory(t);
  const oldResult = path.join(root, 'phase-4b2a4-remote-acceptance-2026-11-06.json');
  const original = '{"preserve":"prior benchmark"}\n';
  await fs.promises.writeFile(oldResult, original);

  const writer = await prepareResultWriter({ outputDirectory: path.join(root, 'results'), runId: 'new-run' });
  const record = await captureAcceptanceAttempt({
    writer,
    scenarioId: 'mock-record',
    url: 'http://127.0.0.1:1/unreachable',
    init: { method: 'POST' },
    timeoutMs: 100,
  });
  assert.equal(record.errorClassification, 'transport_error');
  assert.equal(fs.readFileSync(oldResult, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(writer.outputDirectory, 'results.json')), true);
});
