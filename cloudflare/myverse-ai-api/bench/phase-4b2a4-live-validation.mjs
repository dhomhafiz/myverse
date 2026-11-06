/* global fetch */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { QWEN_MODEL } from '../src/ai.ts';
import { createWorkerForLocalQwenValidation } from '../src/local-qwen-validation.ts';
import {
  acceptanceOutputDirectory,
  captureAcceptanceAttempt,
  prepareResultWriter,
} from './acceptance-results.mjs';

const endpoint = 'http://127.0.0.1:8787';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDirectory, '..');
const configFile = path.join(apiRoot, '.wrangler', 'phase-4b2a4-local.json');
const questions = [
  {
    id: 'A',
    message: 'Boleh terangkan bagaimana pengalaman Hafiz dalam pembangunan backend membentuk pendekatan beliau sebagai creative developer?',
    expectedCategories: ['identity', 'career'],
  },
  {
    id: 'B',
    message: 'Compare the technologies used in the Netflix Squid Game 2 installation with those used in MyVerse, and explain their different purposes.',
    expectedCategories: ['publishedProjects', 'myVerse'],
  },
  {
    id: 'C',
    message: "What can visitors learn about Hafiz's development approach from his backend experience and the interactive MyVerse portfolio?",
    expectedCategories: ['identity', 'career', 'approach', 'myVerse'],
  },
];

const mockedCases = [
  {
    id: 'wrong-employer-angular',
    message: 'What technologies did Hafiz use in his backend career at Ethereal Digital?',
    generatedText: 'Angular was used at Ethereal Digital.',
    expected: 'rejected',
    expectedRule: 'UNSUPPORTED_EMPLOYER_TECHNOLOGY',
  },
  {
    id: 'myverse-stack-attributed-to-netflix',
    message: 'Compare the technologies used for Netflix and MyVerse.',
    generatedText: 'The Netflix installation used Next.js and Three.js.',
    expected: 'rejected',
    expectedRule: 'UNSUPPORTED_PROJECT_TECHNOLOGY',
  },
  {
    id: 'unsupported-scalability',
    message: 'What makes MyVerse different from a conventional developer portfolio?',
    generatedText: 'MyVerse is highly scalable.',
    expected: 'rejected',
    expectedRule: 'UNSUPPORTED_QUALITY_CLAIM',
  },
  {
    id: 'unsupported-performance',
    message: 'How does Hafiz combine backend and interactive 3D development?',
    generatedText: 'Hafiz built a high-performance backend system.',
    expected: 'rejected',
    expectedRule: 'UNSUPPORTED_QUALITY_CLAIM',
  },
  {
    id: 'unsupported-architecture',
    message: 'How does Hafiz combine backend and interactive 3D development?',
    generatedText: 'He has a strong foundation in system architecture.',
    expected: 'rejected',
    expectedRule: 'UNSUPPORTED_QUALITY_CLAIM',
  },
  {
    id: 'supported-ethereal-mapping',
    message: 'What technologies did Hafiz use in his backend career at Ethereal Digital?',
    generatedText: 'Ethereal Digital used Spring Boot, REST APIs and Microsoft SQL Server.',
    expected: 'accepted',
  },
  {
    id: 'supported-commerce-mapping',
    message: 'What technologies did Hafiz use in his backend career at Commerce Dot Com?',
    generatedText: 'Commerce Dot Com International used Spring Boot and Angular.',
    expected: 'accepted',
  },
  {
    id: 'supported-myverse-mapping',
    message: 'Compare the technologies used for Netflix and MyVerse.',
    generatedText: 'MyVerse uses Next.js, TypeScript, Three.js, React Three Fiber and GSAP.',
    expected: 'accepted',
  },
  {
    id: 'supported-netflix-mapping',
    message: 'Compare the technologies used for Netflix and MyVerse.',
    generatedText: 'The Netflix installation used Python and hardware integration.',
    expected: 'accepted',
  },
  {
    id: 'technology-name-with-platform-keyword',
    message: 'What technologies did Hafiz use in his backend career at Strato Solutions?',
    generatedText: 'Strato Solutions lists Spring Boot, Microsoft Power Platform and CI/CD.',
    expected: 'accepted',
  },
  {
    id: 'ordinary-capability-description',
    message: 'What makes MyVerse different from a conventional developer portfolio?',
    generatedText: 'MyVerse brings interactive 3D into a portfolio room and provides navigation to Work, Skills, About, Beyond and Contact.',
    expected: 'accepted',
  },
];

function request(message) {
  return new Request('http://127.0.0.1/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
    body: JSON.stringify({ message }),
  });
}

async function runMockedCases() {
  const results = [];
  for (const testCase of mockedCases) {
    let calls = 0;
    let generatedText = null;
    let diagnosticCode = null;
    const application = createWorkerForLocalQwenValidation({
      onProviderResponse: result => {
        const choice = result?.choices?.[0];
        generatedText = typeof choice?.text === 'string'
          ? choice.text
          : typeof choice?.message?.content === 'string' ? choice.message.content : null;
      },
      onError: error => {
        diagnosticCode = error && typeof error === 'object' && 'diagnosticCode' in error
          && typeof error.diagnosticCode === 'string' ? error.diagnosticCode : null;
      },
    });
    const response = await application.fetch(request(testCase.message), {
      AI: { run: async () => {
        calls++;
        return { choices: [{ text: testCase.generatedText, finish_reason: 'stop' }] };
      } },
      CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const body = await response.json();
    const actual = response.ok && body.success === true ? 'accepted' : 'rejected';
    const result = {
      id: testCase.id,
      message: testCase.message,
      generatedText,
      finalUserFacingResponse: body.reply ?? body.error?.message ?? null,
      httpStatus: response.status,
      actual,
      expected: testCase.expected,
      diagnosticCode,
      expectedRule: testCase.expectedRule ?? null,
      inferenceCalls: calls,
      passed: actual === testCase.expected
        && (!testCase.expectedRule || diagnosticCode === testCase.expectedRule)
        && calls === 1,
    };
    results.push(result);
  }
  return results;
}

function prepare() {
  if (fs.existsSync(configFile)) throw new Error('The phase 4B.2A.4 local config already exists.');
  const configPath = path.join(apiRoot, 'wrangler.jsonc');
  const parsed = ts.parseConfigFileTextToJson(configPath, fs.readFileSync(configPath, 'utf8'));
  if (parsed.error || !parsed.config.ai) throw new Error('Unable to prepare the local validation configuration.');
  const config = {
    ...parsed.config,
    main: '../bench/live-validation-worker.ts',
    ai: { ...parsed.config.ai, remote: true },
  };
  delete config.$schema;
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Prepared ${configFile}; no inference was run.`);
}

async function run() {
  const writer = await prepareResultWriter();
  writer.journal.phase = 'MyVerse AI Companion — Phase 4B.2A.4.6 Final Live Acceptance Rerun';
  writer.journal.timezone = 'Asia/Kuala_Lumpur';
  writer.journal.environment = 'Local Wrangler Worker at 127.0.0.1:8787; remote Workers AI binding';
  writer.journal.selectedModel = QWEN_MODEL;
  writer.journal.maximumRealInferenceCalls = 3;
  writer.journal.retries = 0;
  writer.journal.preflight = {
    outputDirectory: acceptanceOutputDirectory(),
    outputFile: writer.filePath,
    outputSchemaValid: true,
    outputWritable: true,
  };
  await writer.persist();

  const mockedGuardrailChecks = await runMockedCases();
  writer.journal.preflight.mockedGuardrailChecks = mockedGuardrailChecks.map(({ id, actual, expected, passed }) => ({
    id, actual, expected, passed,
  }));
  let health;
  try {
    health = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    writer.journal.preflight.healthError = error instanceof Error ? error.name : 'transport_error';
    await writer.persist();
    throw new Error('Local worker health check failed before any acceptance request.', { cause: error });
  }
  writer.journal.preflight.healthStatus = health.status;
  await writer.persist();
  if (!health.ok) throw new Error(`Local worker health check failed with HTTP ${health.status}.`);

  for (const question of questions) {
    if (writer.journal.attempts.length >= writer.journal.maximumRealInferenceCalls) break;
    const item = await captureAcceptanceAttempt({
      writer,
      scenarioId: question.id,
      url: `${endpoint}/api/chat`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
        body: JSON.stringify({ message: question.message }),
      },
      timeoutMs: 22_000,
      evaluate: attempt => {
        const diagnostics = attempt.safeDiagnosticHeaders['x-local-evaluation'];
        const selectedCategories = diagnostics?.request?.selectedCategories ?? [];
        const actualModelId = diagnostics?.actualModelId ?? attempt.model;
        attempt.evaluation = {
          actualModelId,
          expectedCategories: question.expectedCategories,
          selectedCategories,
          categoryExpectationMatch: question.expectedCategories
            .every(category => selectedCategories.includes(category)),
        };
        const completedGuardrailCheck = attempt.httpStatus === 503
          && attempt.guardrailOutcome === 'rejected'
          && actualModelId === QWEN_MODEL
          && typeof diagnostics?.diagnosticCode === 'string'
          && typeof diagnostics?.providerResponse?.responseShape === 'string'
          && diagnostics.providerResponse.responseShape !== 'invalid';
        return completedGuardrailCheck || (attempt.httpStatus === 200
          && attempt.parsedResponse?.success === true
          && attempt.source === 'ai'
          && actualModelId === QWEN_MODEL
          && attempt.evaluation.categoryExpectationMatch
          && diagnostics?.output?.normalizedOutputSucceeded === true);
      },
    });
    console.log(JSON.stringify(item));
    if (!item.testCompletedSuccessfully) break;
    if (question.id !== 'C') await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

const action = process.argv[2];
if (action === 'prepare') prepare();
else if (action === 'mocks') console.log(JSON.stringify(await runMockedCases(), null, 2));
else if (action === 'run') await run();
else throw new Error('Choose either prepare, mocks or run. Existing attempts cannot be resumed or retried.');
