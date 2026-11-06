/* global fetch */
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

const endpoint = 'http://127.0.0.1:8787';
const resultFile = 'bench/phase-4b2a2a-results-2026-11-06.json';
const configFile = '.wrangler/phase-4b2a2a-local.json';
const model = '@cf/qwen/qwen3-30b-a3b-fp8';
const questions = [
  {
    id: 'A',
    message: 'Boleh terangkan pengalaman Hafiz dalam pembangunan backend dan teknologi yang pernah digunakan?',
    expectedCategories: ['identity', 'career'],
  },
  {
    id: 'B',
    message: 'Compare the technologies used for the Netflix Squid Game 2 installation and MyVerse.',
    expectedCategories: ['publishedProjects', 'myVerse'],
  },
  {
    id: 'C',
    message: 'How does Hafiz combine his backend engineering background with creative frontend and interactive 3D development?',
    expectedCategories: ['identity', 'approach', 'career', 'skills', 'myVerse'],
  },
  {
    id: 'D',
    message: 'How do those differ from the technologies in MyVerse?',
    history: [
      { role: 'user', content: 'What technologies were used for the Netflix installation?' },
      { role: 'assistant', content: 'The Netflix installation used Python voting logic and physical Continue/Withdraw inputs.' },
    ],
    expectedCategories: ['publishedProjects', 'myVerse'],
  },
];

function save(results) {
  fs.writeFileSync(resultFile, `${JSON.stringify(results, null, 2)}\n`);
}

function prepare() {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', fs.readFileSync('wrangler.jsonc', 'utf8'));
  if (parsed.error || !parsed.config.ai) throw new Error('Unable to prepare the local validation configuration.');
  const config = {
    ...parsed.config,
    main: '../bench/live-validation-worker.ts',
    ai: { ...parsed.config.ai, remote: true },
  };
  delete config.$schema;
  fs.mkdirSync('.wrangler', { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Prepared ${configFile}; no inference was run.`);
}

async function run() {
  if (fs.existsSync(resultFile)) throw new Error('The result journal already exists; refusing to repeat inference.');
  const health = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!health.ok) throw new Error(`Local worker health check failed with HTTP ${health.status}.`);

  const results = {
    phase: 'MyVerse AI Companion — Phase 4B.2A.2 Live Architecture Validation',
    date: '2026-11-06',
    timezone: 'Asia/Kuala_Lumpur',
    environment: 'Local Wrangler Worker at 127.0.0.1:8787; remote Workers AI binding; application HTTP path',
    selectedModel: model,
    maximumRealInferenceCalls: 4,
    requestAttempts: 0,
    realInferenceCallsObserved: 0,
    retries: 0,
    preflight: {
      healthStatus: health.status,
      workerPath: '/api/chat',
      defaultApplicationModelUnchanged: '@cf/meta/llama-3.2-3b-instruct',
      remoteQuotaBalance: 'Not available through Wrangler CLI; checked-in usage figures are historical.',
    },
    cases: questions,
    results: [],
  };
  save(results);

  for (const question of questions) {
    if (results.requestAttempts >= results.maximumRealInferenceCalls) break;
    const item = {
      id: question.id,
      message: question.message,
      ...(question.history ? { history: question.history } : {}),
      startedAt: new Date().toISOString(),
      status: 'pending',
    };
    results.results.push(item);
    results.requestAttempts++;
    save(results);

    const start = performance.now();
    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
        body: JSON.stringify({
          message: question.message,
          ...(question.history ? { history: question.history } : {}),
        }),
        signal: AbortSignal.timeout(22_000),
      });
      item.httpStatus = response.status;
      item.responseBody = await response.json();
      item.localDiagnostics = JSON.parse(response.headers.get('X-Local-Evaluation') ?? 'null');
      item.totalLatencyMs = Math.round(performance.now() - start);
      item.completedAt = new Date().toISOString();
      item.actualModelId = item.localDiagnostics?.actualModelId ?? null;
      results.realInferenceCallsObserved = item.localDiagnostics?.attemptedCalls ?? results.realInferenceCallsObserved;
      item.source = item.responseBody?.source ?? null;
      item.selectedKnowledgeCategories = item.localDiagnostics?.request?.selectedCategories ?? null;
      item.selectionReason = item.localDiagnostics?.request?.selectionReason ?? null;
      item.providerResponseShape = item.localDiagnostics?.providerResponse?.responseShape ?? null;
      item.rawFinishReason = item.localDiagnostics?.providerResponse?.rawFinishReason ?? null;
      item.finishReason = item.localDiagnostics?.output?.finishReason ?? null;
      item.tokenUsage = item.localDiagnostics?.output?.usage ?? null;
      item.normalizationSucceeded = item.localDiagnostics?.output?.normalizedOutputSucceeded === true;
      item.truncationDetected = ['length', 'max_tokens', 'max_new_tokens', 'token_limit']
        .includes(String(item.rawFinishReason).toLowerCase());
      const selectedCategories = item.selectedKnowledgeCategories ?? [];
      item.categoryExpectationMatch = question.expectedCategories.every(category => selectedCategories.includes(category));
      item.additionalSelectedCategories = selectedCategories
        .filter(category => !question.expectedCategories.includes(category));
      item.missingExpectedCategories = question.expectedCategories
        .filter(category => !selectedCategories.includes(category));
      item.status = response.ok && item.responseBody?.success === true ? 'completed' : 'failed';
    } catch (error) {
      item.status = 'transport-failure';
      item.totalLatencyMs = Math.round(performance.now() - start);
      item.completedAt = new Date().toISOString();
      item.failure = error instanceof Error ? error.name : 'Unknown local transport failure';
    }

    save(results);
    console.log(JSON.stringify(item));

    if (item.status !== 'completed' || item.actualModelId !== model || item.source !== 'ai'
      || !item.normalizationSucceeded) {
      results.stoppedEarly = `Case ${question.id} did not meet the local execution checks.`;
      save(results);
      break;
    }
    if (question.id !== 'D') await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

const action = process.argv[2];
if (action === 'prepare') prepare();
else if (action === 'run') await run();
else throw new Error('Choose either prepare or run.');
