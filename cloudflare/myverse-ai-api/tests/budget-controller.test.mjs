import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { AiBudgetController } from '../src/budget-controller.ts';

const DAY_START = Date.UTC(2026, 10, 7);
const TEST_TOKEN = 'local-test-only-budget-admin-token';

function controllerFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'myverse-budget-'));
  const databasePath = join(directory, 'controller.sqlite');
  const databases = [];
  const openDatabase = () => {
    const database = new DatabaseSync(databasePath);
    databases.push(database);
    return database;
  };
  const createStorage = database => ({
    sql: {
      exec(query, ...bindings) {
        const statement = query.trimStart().toUpperCase();
        if (statement.startsWith('SELECT') || statement.startsWith('WITH')) {
          const rows = database.prepare(query).all(...bindings);
          return { toArray: () => rows };
        }
        return database.prepare(query).run(...bindings);
      },
    },
    transactionSync(callback) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = callback();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  });
  const database = openDatabase();
  const storage = createStorage(database);
  const ctx = { storage };
  const env = {
    AI_DAILY_ESTIMATED_NEURON_BUDGET: options.budget ?? '2000',
    AI_MAX_CONCURRENT_INFERENCES: options.concurrency ?? '1',
    ...(options.adminToken ? { AI_BUDGET_ADMIN_TOKEN: options.adminToken } : {}),
  };
  const create = () => new AiBudgetController(ctx, env);
  const reopen = () => {
    const reopenedDatabase = openDatabase();
    return {
      database: reopenedDatabase,
      controller: new AiBudgetController({ storage: createStorage(reopenedDatabase) }, env),
    };
  };
  const cleanup = () => {
    for (const open of databases) open.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return { database, controller: create(), create, reopen, cleanup, env };
}

function request(path, body, token) {
  return new Request(`https://budget.internal${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function call(controller, path, body, token) {
  const response = await controller.fetch(request(path, body, token));
  return { status: response.status, body: await response.json() };
}

async function admit(controller, requestId, estimatedNeurons = 100, nowMs = DAY_START) {
  return call(controller, '/admit', {
    requestId,
    estimatedNeurons,
    model: '@cf/google/gemma-4-26b-a4b-it',
    nowMs,
  });
}

async function start(controller, requestId, grantId, nowMs = DAY_START) {
  return call(controller, '/start', { requestId, grantId, nowMs });
}

function daily(database, utcDay = '2026-11-07') {
  return { ...database.prepare(
    'SELECT settled_neurons, reserved_neurons FROM daily_budgets WHERE utc_day = ?',
  ).get(utcDay) };
}

function reservation(database, requestId) {
  return { ...database.prepare(
    'SELECT status, settlement_state, reserved_neurons, accounted_neurons, slot_active, usage_source FROM reservations WHERE request_id = ?',
  ).get(requestId) };
}

function dispose(t, fixture) {
  t.after(fixture.cleanup);
}

test('admission durably reserves budget and duplicate IDs cannot obtain another grant', async t => {
  const f = controllerFixture();
  dispose(t, f);

  const first = await admit(f.controller, 'request-a');
  assert.equal(first.status, 200);
  assert.equal(first.body.granted, true);
  assert.deepEqual(daily(f.database), { settled_neurons: 0, reserved_neurons: 100 });
  assert.equal(reservation(f.database, 'request-a').status, 'RESERVED');

  const duplicate = await admit(f.controller, 'request-a');
  assert.deepEqual(duplicate.body, { granted: false, reason: 'duplicate_request' });
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
});

test('budget is enforced atomically after distinct reservations', async t => {
  const f = controllerFixture({ budget: '100', concurrency: '2' });
  dispose(t, f);
  assert.equal((await admit(f.controller, 'request-a', 80)).body.granted, true);
  assert.deepEqual((await admit(f.controller, 'request-b', 21)).body, {
    granted: false,
    reason: 'budget_exhausted',
  });
  assert.deepEqual(daily(f.database), { settled_neurons: 0, reserved_neurons: 80 });
});

test('invalid budget and concurrency configuration fail closed', async t => {
  for (const budget of ['', '0', '-1', '1.5', '2e3', '1000001']) {
    const f = controllerFixture({ budget });
    dispose(t, f);
    const result = await admit(f.controller, `bad-budget-${budget || 'empty'}`);
    assert.deepEqual(result.body, { granted: false, reason: 'invalid_configuration' });
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 0);
  }
  for (const concurrency of ['0', '-1', '1.5', '101']) {
    const f = controllerFixture({ concurrency });
    dispose(t, f);
    const result = await admit(f.controller, `bad-concurrency-${concurrency}`);
    assert.deepEqual(result.body, { granted: false, reason: 'invalid_configuration' });
  }
});

test('controller bounds concurrently pending request bodies', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const streams = [];
  const pending = Array.from({ length: 100 }, (_, index) => {
    const body = JSON.stringify({
      requestId: `bounded-body-${index}`,
      estimatedNeurons: 1,
      model: '@cf/google/gemma-4-26b-a4b-it',
      nowMs: DAY_START,
    });
    const stream = new ReadableStream({
      start(controller) {
        streams.push({ controller, body });
      },
    });
    return f.controller.fetch(new Request('https://budget.internal/admit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    }));
  });
  const overflow = await call(f.controller, '/admit', {
    requestId: 'bounded-body-overflow',
    estimatedNeurons: 1,
    model: '@cf/google/gemma-4-26b-a4b-it',
    nowMs: DAY_START,
  });
  assert.equal(overflow.status, 503);
  assert.deepEqual(overflow.body, { error: 'CONTROLLER_OVERLOADED' });

  for (const { controller, body } of streams) {
    controller.enqueue(new TextEncoder().encode(body));
    controller.close();
  }
  const responses = await Promise.all(pending);
  assert.equal(responses.filter(response => response.status === 200).length, 100);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
});

for (const requestCount of [2, 10, 20, 100]) {
  test(`${requestCount} simultaneous admissions grant at most one global slot`, async t => {
    const f = controllerFixture();
    dispose(t, f);
    const results = await Promise.all(
      Array.from({ length: requestCount }, (_, index) => admit(f.controller, `concurrent-${requestCount}-${index}`)),
    );
    assert.equal(results.filter(result => result.body.granted === true).length, 1);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1').get().count, 1);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
  });
}

test('inference start is a durable state transition before provider dispatch', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-start')).body;
  assert.equal(reservation(f.database, 'request-start').status, 'RESERVED');

  const result = await start(f.controller, 'request-start', grant.grantId);
  assert.deepEqual(result.body, { started: true });
  assert.equal(reservation(f.database, 'request-start').status, 'INFERENCE_STARTED');
});

test('known usage settles once and repeated settlement cannot double-charge', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-settle')).body;
  await start(f.controller, 'request-settle', grant.grantId);
  const body = {
    requestId: 'request-settle',
    grantId: grant.grantId,
    outcome: 'completed',
    terminal: true,
    usage: { promptTokens: 1_000, completionTokens: 100 },
    failureClassification: 'COMPLETED_WITH_REPORTED_USAGE',
    nowMs: DAY_START + 1_000,
  };
  const settled = await call(f.controller, '/settle', body);
  assert.deepEqual(settled.body, { settled: true, duplicate: false, status: 'COMPLETED' });
  assert.deepEqual(daily(f.database), { settled_neurons: 18, reserved_neurons: 0 });
  assert.equal(reservation(f.database, 'request-settle').slot_active, 0);

  const repeated = await call(f.controller, '/settle', body);
  assert.deepEqual(repeated.body, { settled: true, duplicate: true, status: 'COMPLETED' });

  const conflict = await call(f.controller, '/settle', {
    ...body,
    usage: { promptTokens: 50_000, completionTokens: 100 },
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, { settled: false, reason: 'conflicting_settlement' });
  assert.deepEqual(daily(f.database), { settled_neurons: 18, reserved_neurons: 0 });
});

test('unknown terminal provider usage keeps the full estimate but releases a completed slot', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-provider-failure')).body;
  await start(f.controller, 'request-provider-failure', grant.grantId);
  const settled = await call(f.controller, '/settle', {
    requestId: 'request-provider-failure',
    grantId: grant.grantId,
    outcome: 'failed',
    terminal: true,
    failureClassification: 'AI_PROVIDER_REJECTED',
  });
  assert.deepEqual(settled.body, { settled: true, duplicate: false, status: 'UNKNOWN_USAGE' });
  assert.deepEqual(daily(f.database), { settled_neurons: 100, reserved_neurons: 0 });
  assert.equal(reservation(f.database, 'request-provider-failure').slot_active, 0);
  assert.equal((await admit(f.controller, 'request-after-provider-failure', 1)).body.granted, true);
});

test('timeout preserves unknown budget usage and its active slot across object restart', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-timeout')).body;
  await start(f.controller, 'request-timeout', grant.grantId);
  const result = await call(f.controller, '/settle', {
    requestId: 'request-timeout',
    grantId: grant.grantId,
    outcome: 'failed',
    terminal: false,
    failureClassification: 'INFERENCE_DEADLINE_EXCEEDED',
  });
  assert.deepEqual(result.body, { settled: true, duplicate: false, status: 'UNKNOWN_USAGE' });
  assert.deepEqual(daily(f.database), { settled_neurons: 100, reserved_neurons: 0 });

  const restarted = f.reopen();
  assert.deepEqual((await admit(restarted.controller, 'request-after-timeout')).body, {
    granted: false,
    reason: 'busy',
  });
  assert.deepEqual((await admit(restarted.controller, 'request-timeout')).body, {
    granted: false,
    reason: 'duplicate_request',
  });
  assert.equal(reservation(f.database, 'request-timeout').slot_active, 1);
});

test('pre-inference failure safely releases the reservation without recording usage', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-not-started')).body;
  const result = await call(f.controller, '/settle', {
    requestId: 'request-not-started',
    grantId: grant.grantId,
    outcome: 'not_started',
    terminal: true,
    failureClassification: 'INFERENCE_NOT_DISPATCHED',
  });
  assert.deepEqual(result.body, { settled: true, duplicate: false, status: 'RECONCILED' });
  assert.deepEqual(daily(f.database), { settled_neurons: 0, reserved_neurons: 0 });
  assert.equal(reservation(f.database, 'request-not-started').slot_active, 0);
});

test('UTC rollover retains historical accounting and blocks old active work', async t => {
  const f = controllerFixture();
  dispose(t, f);
  const beforeMidnight = Date.UTC(2026, 10, 7, 23, 59, 59);
  const oldGrant = (await admit(f.controller, 'request-before-midnight', 100, beforeMidnight)).body;
  await start(f.controller, 'request-before-midnight', oldGrant.grantId, beforeMidnight);

  const afterMidnight = beforeMidnight + 1_000;
  assert.deepEqual((await admit(f.controller, 'request-after-midnight', 100, afterMidnight)).body, {
    granted: false,
    reason: 'busy',
  });
  const settled = await call(f.controller, '/settle', {
    requestId: 'request-before-midnight',
    grantId: oldGrant.grantId,
    outcome: 'completed',
    terminal: true,
    failureClassification: 'COMPLETED_USAGE_UNKNOWN',
    nowMs: afterMidnight,
  });
  assert.equal(settled.body.status, 'UNKNOWN_USAGE');
  assert.deepEqual(daily(f.database, '2026-11-07'), { settled_neurons: 100, reserved_neurons: 0 });
  assert.equal((await admit(f.controller, 'request-next-day', 100, afterMidnight)).body.granted, true);
  assert.deepEqual(daily(f.database, '2026-11-08'), { settled_neurons: 0, reserved_neurons: 100 });
});

test('operator reconciliation requires a secret and can safely release a confirmed timeout', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN });
  dispose(t, f);
  const grant = (await admit(f.controller, 'request-reconcile')).body;
  await start(f.controller, 'request-reconcile', grant.grantId);
  await call(f.controller, '/settle', {
    requestId: 'request-reconcile',
    grantId: grant.grantId,
    outcome: 'failed',
    terminal: false,
    failureClassification: 'INFERENCE_DEADLINE_EXCEEDED',
  });
  const body = {
    requestId: 'request-reconcile',
    grantId: grant.grantId,
    action: 'confirm_usage',
    evidence: 'Provider usage record verified by operator',
    usage: { promptTokens: 1_000, completionTokens: 100 },
    nowMs: DAY_START + 5_000,
  };
  assert.equal((await call(f.controller, '/internal/reconcile', body, 'incorrect-token')).status, 403);
  assert.deepEqual(daily(f.database), { settled_neurons: 100, reserved_neurons: 0 });

  const reconciled = await call(f.controller, '/internal/reconcile', body, TEST_TOKEN);
  assert.deepEqual(reconciled.body, { reconciled: true, duplicate: false });
  assert.deepEqual(daily(f.database), { settled_neurons: 18, reserved_neurons: 0 });
  assert.equal(reservation(f.database, 'request-reconcile').status, 'RECONCILED');
  assert.equal(reservation(f.database, 'request-reconcile').slot_active, 0);
  assert.deepEqual((await call(f.controller, '/internal/reconcile', body, TEST_TOKEN)).body, {
    reconciled: true,
    duplicate: true,
  });
  const conflict = await call(f.controller, '/internal/reconcile', {
    ...body,
    action: 'confirm_terminated_unknown',
    evidence: 'A different operator conclusion',
    usage: undefined,
  }, TEST_TOKEN);
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, { reconciled: false, reason: 'conflicting_reconciliation' });
  assert.deepEqual(daily(f.database), { settled_neurons: 18, reserved_neurons: 0 });
});
