import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { GEMMA_MODEL } from '../src/ai.ts';
import { createWorker } from '../src/worker.ts';
import { fencedResult } from './helpers/budget-binding.mjs';

const origin = 'https://www.dhomhafiz.dev';
const message = 'Does Hafiz have experience with Kubernetes?';
const validOutput = {
  choices: [{
    message: { role: 'assistant', content: 'Hafiz builds interactive portfolio experiences.' },
    finish_reason: 'stop',
  }],
};

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function budgetBinding(handler = async request => {
  const path = new URL(request.url).pathname;
  const body = await request.json();
  const result = path === '/admit'
    ? { granted: true, grantId: `test-grant-${body.requestId}` }
    : path === '/start'
      ? { started: true }
      : { settled: true };
  return response(result);
}) {
  return { getByName: () => ({ fetch: async request => {
    const body = await request.clone().json();
    const result = await handler(request);
    return response(fencedResult(body, await result.json()), result.status);
  } }) };
}

function fixture({
  rateLimiter = { limit: async () => ({ success: true }) },
  budget = budgetBinding(),
  ai = { run: async () => validOutput },
  enabled = 'true',
  model = GEMMA_MODEL,
  diagnostics,
} = {}) {
  const env = {
    CHAT_RATE_LIMITER: rateLimiter,
    AI_ENABLED: enabled,
    AI_MODEL: model,
  };
  if (budget !== null) env.AI_BUDGET_CONTROLLER = budget;
  if (ai !== null) env.AI = ai;
  return {
    send: () => createWorker(undefined, diagnostics).fetch(new Request('https://local/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message }),
    }), env),
  };
}

async function assertDiagnostic(f, diagnosticCode, stage) {
  const entries = [];
  const originalError = globalThis.console.error;
  globalThis.console.error = entry => {
    if (typeof entry === 'object' && entry !== null && entry.event === 'ai_unavailable') entries.push(entry);
  };
  let result;
  try {
    result = await f.send();
  } finally {
    globalThis.console.error = originalError;
  }

  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.code, 'AI_UNAVAILABLE');
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.deepEqual(Object.keys(entry).sort(), [
    'correlationId', 'diagnosticCode', 'event', 'publicHttpStatus', 'stage', 'timestamp',
  ]);
  assert.equal(entry.event, 'ai_unavailable');
  assert.match(entry.correlationId, /^[0-9a-f-]{36}$/i);
  assert.equal(Number.isNaN(Date.parse(entry.timestamp)), false);
  assert.match(entry.timestamp, /Z$/);
  assert.equal(entry.stage, stage);
  assert.equal(entry.diagnosticCode, diagnosticCode);
  assert.equal(entry.publicHttpStatus, 503);
  assert.equal(JSON.stringify(entry).includes(message), false);
}

test('tech-stack and programming-language synonyms use the existing deterministic FAQ', async () => {
  let baseline;
  for (const question of [
    'What is his tech stack?',
    'What tech stack does Hafiz use?',
    'What technologies does Hafiz use?',
    'What programming languages does Hafiz know?',
  ]) {
    const request = new Request('https://local/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ message: question }),
    });
    const result = await createWorker().fetch(request, {
      CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
      AI_ENABLED: 'false',
    });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.source, 'faq');
    baseline ??= body.reply;
    assert.equal(body.reply, baseline);
  }
});

test('unrelated technical questions continue through the mocked AI path', async () => {
  const calls = [];
  const f = fixture({
    budget: budgetBinding(async request => {
      const path = new URL(request.url).pathname;
      calls.push(path);
      if (path === '/admit') return response({ granted: true, grantId: 'test-grant' });
      if (path === '/start') return response({ started: true });
      return response({ settled: true });
    }),
  });
  const result = await f.send();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).source, 'ai');
  assert.deepEqual(calls, ['/admit', '/start', '/settle']);
});

test('rate limiter dependency failure is logged with safe metadata', async () => {
  await assertDiagnostic(fixture({
    rateLimiter: { limit: async () => { throw new Error('private limiter failure'); } },
  }), 'RATE_LIMITER_DEPENDENCY_FAILURE', 'rate_limit');
});

test('disabled and invalid AI configuration produce distinct diagnostics', async () => {
  await assertDiagnostic(fixture({ enabled: 'false' }), 'AI_DISABLED', 'ai_configuration');
  await assertDiagnostic(fixture({ model: '@cf/unknown/model' }), 'AI_CONFIGURATION_INVALID', 'ai_configuration');
  await assertDiagnostic(fixture({ ai: null }), 'AI_BINDING_UNAVAILABLE', 'ai_configuration');
  await assertDiagnostic(fixture({ budget: null }), 'BUDGET_CONTROLLER_BINDING_UNAVAILABLE', 'budget_admission');
});

test('budget estimate failure is logged without reaching inference', async () => {
  await assertDiagnostic(fixture({
    diagnostics: { estimateReservation: () => null },
  }), 'BUDGET_ESTIMATE_FAILURE', 'budget_estimation');
});

test('Durable Object admission request failure is logged safely', async () => {
  await assertDiagnostic(fixture({
    budget: budgetBinding(async () => { throw new Error('private Durable Object failure'); }),
  }), 'DURABLE_OBJECT_ADMISSION_REQUEST_FAILURE', 'budget_admission');
});

test('budget and concurrency admission denials have distinct diagnostic codes', async () => {
  for (const [reason, code] of [
    ['budget_exhausted', 'AI_BUDGET_EXHAUSTED'],
    ['busy', 'AI_CONCURRENCY_LIMIT_REACHED'],
    ['invalid_configuration', 'BUDGET_CONTROLLER_CONFIGURATION_INVALID'],
    ['storage_unavailable', 'DURABLE_OBJECT_STORAGE_FAILURE'],
    ['duplicate_request', 'DURABLE_OBJECT_ADMISSION_REJECTED'],
  ]) {
    await assertDiagnostic(fixture({
      budget: budgetBinding(async () => response({ granted: false, reason })),
    }), code, 'budget_admission');
  }
});

test('Gemma provider failure is logged without including provider details', async () => {
  await assertDiagnostic(fixture({
    ai: { run: async () => { throw new Error('private provider response'); } },
  }), 'GEMMA_PROVIDER_FAILURE', 'inference');
});

test('inference timeout is logged as a distinct diagnostic', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let inferenceStarted;
  const started = new Promise(resolve => { inferenceStarted = resolve; });
  const f = fixture({
    ai: { run: () => new Promise(() => {}) },
    diagnostics: { beforeInference: inferenceStarted },
  });
  const entries = [];
  const originalError = globalThis.console.error;
  globalThis.console.error = entry => {
    if (typeof entry === 'object' && entry !== null && entry.event === 'ai_unavailable') entries.push(entry);
  };
  try {
    const responsePromise = f.send();
    await started;
    mock.timers.tick(15_000);
    const result = await responsePromise;
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error.code, 'AI_UNAVAILABLE');
  } finally {
    globalThis.console.error = originalError;
    mock.timers.reset();
  }
  assert.equal(entries.length, 1, JSON.stringify(entries));
  assert.equal(entries[0].diagnosticCode, 'INFERENCE_TIMEOUT');
  assert.equal(entries[0].stage, 'inference');
  assert.equal(entries[0].publicHttpStatus, 503);
  assert.equal(JSON.stringify(entries[0]).includes(message), false);
});

test('reservation settlement failure is logged without changing the public response', async () => {
  const f = fixture({
    budget: budgetBinding(async request => {
      const path = new URL(request.url).pathname;
      if (path === '/admit') return response({ granted: true, grantId: 'test-grant' });
      if (path === '/start') return response({ started: true });
      return response({ settled: false });
    }),
  });
  await assertDiagnostic(f, 'RESERVATION_SETTLEMENT_FAILURE', 'reservation_settlement');
});
