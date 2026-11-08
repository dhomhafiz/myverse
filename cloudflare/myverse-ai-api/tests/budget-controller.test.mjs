import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { AiBudgetController } from '../src/budget-controller.ts';
import { createWorker } from '../src/worker.ts';
import { GEMMA_MODEL } from '../src/ai.ts';

const DAY_START = Date.UTC(2026, 10, 7);
const TEST_TOKEN = 'local-test-only-budget-admin-token';

function controllerFixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'myverse-budget-'));
  const databasePath = join(directory, 'controller.sqlite');
  const databases = [];
  const alarm = { at: null };
  const openDatabase = () => {
    const database = new DatabaseSync(databasePath);
    databases.push(database);
    return database;
  };
  const createStorage = database => ({
    ...(options.alarms === false ? {} : {
      getAlarm: async () => alarm.at,
      setAlarm: async at => { alarm.at = at; },
    }),
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
    ...options.recovery,
  };
  const clock = () => options.clock ? options.clock() : Date.now();
  const create = () => new AiBudgetController(ctx, env, clock);
  const reopen = () => {
    const reopenedDatabase = openDatabase();
    return {
      database: reopenedDatabase,
      controller: new AiBudgetController({ storage: createStorage(reopenedDatabase) }, env, clock),
    };
  };
  const cleanup = () => {
    for (const open of databases) open.close();
    rmSync(directory, { recursive: true, force: true });
  };
  return { database, controller: create(), create, reopen, cleanup, env, alarm };
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
  assert.deepEqual((await admit(
    restarted.controller,
    'request-after-expiration-window',
    100,
    DAY_START + (30 * 24 * 60 * 60 * 1_000),
  )).body, {
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

test('authenticated status reads report slots, unresolved states and estimated budget without mutation', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN, concurrency: '3' });
  dispose(t, f);
  const nowMs = Date.now();
  const budgetDay = new Date(nowMs).toISOString().slice(0, 10);

  const completedGrant = (await admit(f.controller, 'status-completed', 100, nowMs)).body;
  await start(f.controller, 'status-completed', completedGrant.grantId, nowMs);
  await call(f.controller, '/settle', {
    requestId: 'status-completed',
    grantId: completedGrant.grantId,
    outcome: 'completed',
    terminal: true,
    usage: { promptTokens: 1_000, completionTokens: 100 },
    failureClassification: 'COMPLETED_WITH_REPORTED_USAGE',
    nowMs,
  });

  const unknownGrant = (await admit(f.controller, 'status-unknown', 120, nowMs)).body;
  await start(f.controller, 'status-unknown', unknownGrant.grantId, nowMs);
  await call(f.controller, '/settle', {
    requestId: 'status-unknown',
    grantId: unknownGrant.grantId,
    outcome: 'failed',
    terminal: false,
    failureClassification: 'INFERENCE_DEADLINE_EXCEEDED',
    nowMs,
  });
  const reservedGrant = (await admit(f.controller, 'status-reserved', 200, nowMs)).body;
  const snapshot = () => ({
    budgets: f.database.prepare('SELECT * FROM daily_budgets ORDER BY utc_day').all(),
    reservations: f.database.prepare('SELECT * FROM reservations ORDER BY request_id').all(),
  });
  const before = snapshot();

  const response = await f.controller.fetch(request('/internal/status', {}, TEST_TOKEN));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.status, 'ok');
  assert.equal(result.budgetDay, budgetDay);
  assert.equal(result.activeInferenceSlots, 2);
  assert.equal(result.configuredConcurrencyLimit, 3);
  assert.equal(result.unresolvedReservationCount, 2);
  assert.deepEqual(result.reservationStates, {
    RESERVED: 1,
    INFERENCE_STARTED: 0,
    COMPLETED: 1,
    FAILED_WITH_KNOWN_USAGE: 0,
    UNKNOWN_USAGE: 1,
    RECONCILED: 0,
  });
  assert.equal(result.estimatedSettledNeurons, 138);
  assert.equal(result.estimatedReservedNeurons, 200);
  assert.equal(result.unresolvedReservationDetailsTruncated, false);
  assert.deepEqual(result.unresolvedReservations.map(row => row.requestId), [
    'status-reserved',
    'status-unknown',
  ]);
  assert.equal(result.unresolvedReservations[0].grantId, reservedGrant.grantId);
  assert.equal(result.unresolvedReservations[0].state, 'RESERVED');
  assert.equal(result.unresolvedReservations[1].grantId, unknownGrant.grantId);
  assert.equal(result.unresolvedReservations[1].state, 'UNKNOWN_USAGE');
  assert.equal(result.unresolvedReservations[1].reservationAt, nowMs);
  assert.equal(result.unresolvedReservations[1].inferenceStartedAt, nowMs);
  assert.equal(result.unresolvedReservations[1].completionAt, null);
  assert.equal(JSON.stringify(result).includes(TEST_TOKEN), false);
  assert.deepEqual(snapshot(), before);
});

test('budget status rejects missing and invalid administrator credentials without revealing state', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN });
  dispose(t, f);
  const grant = (await admit(f.controller, 'status-protected')).body;

  for (const token of [undefined, 'incorrect-token']) {
    const response = await f.controller.fetch(request('/internal/status', {
      requestId: 'status-protected',
      grantId: grant.grantId,
    }, token));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'UNAUTHORIZED' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('budget status remains available from Durable Object storage after restart', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN });
  dispose(t, f);
  const nowMs = Date.now();
  const grant = (await admit(f.controller, 'status-restart', 100, nowMs)).body;
  await start(f.controller, 'status-restart', grant.grantId, nowMs);
  await call(f.controller, '/settle', {
    requestId: 'status-restart',
    grantId: grant.grantId,
    outcome: 'failed',
    terminal: false,
    failureClassification: 'INFERENCE_DEADLINE_EXCEEDED',
    nowMs,
  });
  const beforeRestart = await call(f.controller, '/internal/status', {}, TEST_TOKEN);

  const restarted = f.reopen();
  const afterRestart = await call(restarted.controller, '/internal/status', {}, TEST_TOKEN);

  assert.equal(beforeRestart.status, 200);
  assert.deepEqual(afterRestart, beforeRestart);
  assert.equal(afterRestart.body.activeInferenceSlots, 1);
  assert.equal(afterRestart.body.reservationStates.UNKNOWN_USAGE, 1);
  assert.equal(afterRestart.body.estimatedSettledNeurons, 100);
});

test('Worker exposes the authenticated status operation without invoking AI', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN });
  dispose(t, f);
  const worker = createWorker();
  const binding = {
    getByName: () => ({ fetch: internalRequest => f.controller.fetch(internalRequest) }),
  };
  const env = {
    CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI_BUDGET_CONTROLLER: binding,
  };

  const authorized = await worker.fetch(request('/internal/budget/status', {}, TEST_TOKEN), env);
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).status, 'ok');
  assert.equal(authorized.headers.get('Cache-Control'), 'no-store');

  const unauthorized = await worker.fetch(request('/internal/budget/status', {}, 'incorrect-token'), env);
  assert.equal(unauthorized.status, 403);
  assert.deepEqual(await unauthorized.json(), { error: 'UNAUTHORIZED' });
});

test('budget status caps unresolved reservation details', async t => {
  const f = controllerFixture({ adminToken: TEST_TOKEN });
  dispose(t, f);
  const nowMs = Date.now();

  for (let index = 0; index < 103; index++) {
    const requestId = `status-cap-${String(index).padStart(3, '0')}`;
    const grant = (await admit(f.controller, requestId, 1, nowMs)).body;
    await start(f.controller, requestId, grant.grantId, nowMs);
    await call(f.controller, '/settle', {
      requestId,
      grantId: grant.grantId,
      outcome: 'failed',
      terminal: true,
      failureClassification: 'PROVIDER_USAGE_UNKNOWN',
      nowMs,
    });
  }

  const result = await call(f.controller, '/internal/status', {}, TEST_TOKEN);
  assert.equal(result.body.unresolvedReservationCount, 103);
  assert.equal(result.body.unresolvedReservations.length, 100);
  assert.equal(result.body.unresolvedReservationDetailsTruncated, true);
});

function recoveryFixture(t, options = {}) {
  let now = options.now ?? Date.now();
  const f = controllerFixture({ ...options, clock: () => now, recovery: {
    AI_RECOVERY_MODE: 'bounded', AI_MAX_UNCERTAIN_ATTEMPTS: '2', AI_MAX_UNCERTAIN_NEURONS: '1000',
    ...options.recovery,
  } });
  dispose(t, f);
  let sequence = 0;
  f.tick = milliseconds => { now += milliseconds; };
  f.send = async (path, body) => call(f.controller, path, body);
  f.admitAttempt = async (name, amount = 100) => (await f.send('/admit', {
    protocol: 2, requestId: name, attemptId: `attempt-${name}`, ownerId: `owner-${name}`,
    commandId: `admission-${name}`, estimatedNeurons: amount, model: GEMMA_MODEL,
  })).body;
  f.command = async (grant, path, extra = {}, commandId = `command-${++sequence}`) => f.send(path, {
    protocol: 2, requestId: grant.requestId, grantId: grant.grantId, attemptId: grant.attemptId,
    ownerId: grant.ownerId, generation: grant.generation, commandId, ...extra,
  });
  f.finish = (grant, extra = {}, id) => f.command(grant, '/settle', {
    outcome: 'completed', terminal: true, usage: { promptTokens: 1000, completionTokens: 100 },
    failureClassification: 'COMPLETED_WITH_REPORTED_USAGE', ...extra,
  }, id);
  f.invariants = () => {
    for (const budget of f.database.prepare('SELECT * FROM daily_budgets').all()) {
      const sums = f.database.prepare(`SELECT COALESCE(SUM(CASE WHEN settlement_state = 'RESERVED'
        THEN reserved_neurons ELSE 0 END), 0) AS reserved, COALESCE(SUM(accounted_neurons), 0) AS settled
        FROM reservations WHERE utc_day = ?`).get(budget.utc_day);
      assert.equal(budget.reserved_neurons, sums.reserved);
      assert.equal(budget.settled_neurons, sums.settled);
      assert.ok(budget.reserved_neurons >= 0 && budget.settled_neurons >= 0);
    }
    const active = f.database.prepare('SELECT COUNT(*) AS count FROM reservations WHERE slot_active = 1').get().count;
    assert.ok(active <= Number(f.env.AI_MAX_CONCURRENT_INFERENCES));
    const staleOwners = f.database.prepare(`SELECT COUNT(*) AS count FROM execution_attempts e
      JOIN reservations r ON e.request_id = r.request_id WHERE e.recovery_state != 'OWNED' AND r.slot_active = 1`).get().count;
    assert.equal(staleOwners, 0);
    const legacy = f.database.prepare(`SELECT COUNT(*) AS count FROM reservations r LEFT JOIN execution_attempts e
      ON e.request_id = r.request_id WHERE e.request_id IS NULL`).get().count;
    if (legacy === 0) {
      for (const budget of f.database.prepare('SELECT * FROM daily_budgets').all()) {
        const audit = f.database.prepare(`SELECT COALESCE(SUM(reserved_delta), 0) AS reserved,
          COALESCE(SUM(settled_delta), 0) AS settled FROM accounting_adjustments WHERE utc_day = ?`).get(budget.utc_day);
        assert.equal(audit.reserved, budget.reserved_neurons);
        assert.equal(audit.settled, budget.settled_neurons);
      }
    }
  };
  return f;
}

function legacyFixture(t, { status = 'INFERENCE_STARTED', amount = 217, settled = 0, recovery = {} } = {}) {
  const f = controllerFixture({ budget: '2000', concurrency: '1', adminToken: TEST_TOKEN,
    clock: () => DAY_START, recovery: {
      AI_RECOVERY_MODE: 'observe', AI_MAX_UNCERTAIN_ATTEMPTS: '2', AI_MAX_UNCERTAIN_NEURONS: '2000',
      ...recovery,
    } });
  dispose(t, f);
  f.database.prepare(`INSERT INTO daily_budgets (utc_day, settled_neurons, reserved_neurons, updated_at)
    VALUES ('2026-11-07', ?, ?, ?)`).run(settled, amount, DAY_START);
  if (settled > 0) {
    f.database.prepare(`INSERT INTO reservations (
      request_id, grant_id, utc_day, model, reserved_neurons, accounted_neurons, reservation_at,
      completion_at, status, settlement_state, slot_active
    ) VALUES ('prior-settled', 'prior-grant', '2026-11-07', ?, ?, ?, ?, ?, 'COMPLETED', 'SETTLED', 0)`).run(
      GEMMA_MODEL, settled, settled, DAY_START, DAY_START,
    );
  }
  f.database.prepare(`INSERT INTO reservations (
    request_id, grant_id, utc_day, model, reserved_neurons, accounted_neurons, reservation_at,
    inference_started_at, status, settlement_state, slot_active
  ) VALUES (?, 'legacy-grant', '2026-11-07', ?, ?, 0, ?, ?, ?, 'RESERVED', 1)`).run(
    'f76b5698-de35-4539-b3a9-7a973653a2a4', GEMMA_MODEL, amount, DAY_START,
    status === 'INFERENCE_STARTED' ? DAY_START : null, status,
  );
  f.quarantineLegacy = (expectedStatus = status, token = TEST_TOKEN) => call(f.controller, '/internal/legacy-quarantine', {
    transition: 'legacy_unknown_to_quarantine',
    expectedStatus,
    expectedReservedNeurons: 217,
  }, token);
  return f;
}

const timeoutSettlement = { outcome: 'failed', terminal: false, usage: undefined,
  failureClassification: 'INFERENCE_DEADLINE_EXCEEDED' };

test('disabling bounded recovery after quarantine restores strict admission rather than bypassing old exposure', async t => {
  const f = recoveryFixture(t); const old = await f.admitAttempt('old-exposure');
  await f.command(old, '/start'); f.tick(30_001); await f.controller.alarm();
  f.env.AI_RECOVERY_MODE = 'off'; f.controller = f.create();
  assert.equal((await f.admitAttempt('blocked')).reason, 'busy');
  assert.equal((await admit(f.controller, 'old-protocol')).body.reason, 'busy');
  await f.finish(old);
  assert.equal((await f.admitAttempt('safe-now')).granted, true); f.invariants();
});

test('old protocol admissions cannot bypass bounded uncertainty exposure', async t => {
  const f = recoveryFixture(t); await f.admitAttempt('unknown'); f.tick(30_001); await f.controller.alarm();
  assert.equal((await admit(f.controller, 'legacy-caller')).body.reason, 'busy');
  f.invariants();
});

for (const nextPolicy of [{ AI_RECOVERY_MODE: 'off' }, { AI_MAX_UNCERTAIN_ATTEMPTS: '1' }]) {
  test(`policy tightening prevents a pending attempt from receiving new dispatch authorization: ${JSON.stringify(nextPolicy)}`, async t => {
    const f = recoveryFixture(t); const old = await f.admitAttempt('old');
    await f.command(old, '/start'); f.tick(30_001); await f.controller.alarm();
    const pending = await f.admitAttempt('pending');
    Object.assign(f.env, nextPolicy); f.controller = f.create();
    assert.equal((await f.command(pending, '/start')).body.started, false);
    assert.equal(reservation(f.database, 'pending').status, 'RESERVED');
    assert.equal(reservation(f.database, 'old').slot_active, 0); f.invariants();
  });
}

test('bounded commands reject invalid metadata without persisting sensitive payloads', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('sanitized');
  const before = f.database.prepare('SELECT COUNT(*) AS count FROM lifecycle_receipts').get().count;
  const r = await f.finish(grant, { failureClassification: 'private provider response payload' });
  assert.equal(r.status, 400);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM lifecycle_receipts').get().count, before);
  f.invariants();
});

test('v2 admission and start receipts survive restart and lost responses without another grant', async t => {
  const f = recoveryFixture(t);
  const first = await f.admitAttempt('replay');
  const again = await f.admitAttempt('replay');
  assert.equal(first.grantId, again.grantId);
  assert.equal(again.replayed, true);
  await f.command(first, '/start', {}, 'start-once'); // Deliberately lose this response.
  f.controller = f.reopen().controller;
  assert.equal((await f.command(first, '/start', {}, 'start-once')).body.replayed, true);
  assert.equal((await f.command(first, '/start')).body.reason, 'already_dispatched');
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM lifecycle_events WHERE event = 'dispatch_intent'").get().count, 1);
  assert.ok(f.alarm.at !== null);
  f.invariants();
});

test('v2 normal success, settlement replay and conflicting evidence preserve exact accounting', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('success');
  await f.command(grant, '/start');
  await f.finish(grant, {}, 'settle-once'); // Lose response after commit.
  f.controller = f.reopen().controller;
  assert.equal((await f.finish(grant, {}, 'settle-once')).body.replayed, true);
  assert.equal((await f.finish(grant)).body.duplicate, true);
  assert.equal((await f.finish(grant, { usage: { promptTokens: 2000, completionTokens: 100 } })).status, 409);
  assert.equal(reservation(f.database, 'success').accounted_neurons, 18);
  assert.equal(reservation(f.database, 'success').slot_active, 0);
  f.invariants();
});

test('completion without provider usage replays successfully for v2 and legacy records', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('no-usage');
  await f.command(grant, '/start');
  const completion = { usage: undefined, failureClassification: 'COMPLETED_USAGE_UNKNOWN' };
  await f.finish(grant, completion);
  assert.equal((await f.finish(grant, completion)).body.duplicate, true);
  assert.equal(reservation(f.database, 'no-usage').accounted_neurons, 100);
  const variant = await f.admitAttempt('no-usage-variant');
  const variantCompletion = { usage: undefined, failureClassification: 'COMPLETED_UNKNOWN_VARIANT' };
  await f.finish(variant, variantCompletion);
  assert.equal((await f.finish(variant, variantCompletion)).body.duplicate, true);
  const old = (await admit(f.controller, 'old-no-usage')).body;
  const oldBody = { requestId: 'old-no-usage', grantId: old.grantId, outcome: 'completed', terminal: true,
    failureClassification: 'COMPLETED_USAGE_UNKNOWN' };
  await call(f.controller, '/settle', oldBody);
  assert.equal((await call(f.controller, '/settle', oldBody)).body.duplicate, true);
  f.invariants();
});

test('timeout charges once, retains cancellation uncertainty and quarantines after restart', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('timeout');
  await f.command(grant, '/start'); await f.finish(grant, timeoutSettlement);
  assert.equal(reservation(f.database, 'timeout').slot_active, 1);
  assert.equal(reservation(f.database, 'timeout').accounted_neurons, 100);
  f.controller = f.reopen().controller; f.tick(30_001);
  await f.controller.alarm(); await f.controller.alarm();
  const a = f.database.prepare('SELECT * FROM execution_attempts').get();
  assert.equal(a.recovery_state, 'QUARANTINED'); assert.equal(a.provider_outcome, 'UNKNOWN');
  assert.equal(reservation(f.database, 'timeout').slot_active, 0);
  assert.equal(reservation(f.database, 'timeout').accounted_neurons, 100);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM lifecycle_events WHERE event = 'recovery_applied'").get().count, 1);
  f.invariants();
});

for (const stage of ['RESERVED', 'INFERENCE_STARTED']) {
  test(`Worker interruption in ${stage} is conservatively recovered by the admission sweep`, async t => {
    const f = recoveryFixture(t); const old = await f.admitAttempt('interrupted');
    if (stage === 'INFERENCE_STARTED') await f.command(old, '/start');
    f.tick(30_001);
    const next = await f.admitAttempt('next');
    assert.equal(next.granted, true); assert.ok(next.generation > old.generation);
    assert.equal(reservation(f.database, 'interrupted').slot_active, 0);
    assert.equal(reservation(f.database, 'interrupted').accounted_neurons, 100);
    assert.equal(reservation(f.database, 'next').slot_active, 1);
    f.invariants();
  });
}

test('finite attempt exposure caps physical dispatch potential including delayed stale owners', async t => {
  const f = recoveryFixture(t); const first = await f.admitAttempt('first');
  await f.command(first, '/start'); f.tick(30_001); await f.controller.alarm();
  const second = await f.admitAttempt('second'); await f.command(second, '/start');
  // Both could still exist remotely: old owner is counted even after logical release.
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM execution_attempts WHERE provider_outcome = 'UNKNOWN'").get().count, 2);
  f.tick(30_001); await f.controller.alarm();
  assert.equal((await f.admitAttempt('third')).reason, 'uncertainty_limit');
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 2);
  f.invariants();
});

test('neuron exposure cap is independently enforced atomically', async t => {
  const f = recoveryFixture(t, { recovery: { AI_MAX_UNCERTAIN_ATTEMPTS: '5', AI_MAX_UNCERTAIN_NEURONS: '150' } });
  await f.admitAttempt('exposed', 100); f.tick(30_001);
  const results = await Promise.all(['a', 'b', 'c'].map(name => f.admitAttempt(name, 60)));
  assert.ok(results.every(r => r.reason === 'uncertainty_limit'));
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM reservations').get().count, 1);
  f.invariants();
});

test('late final usage corrects only its original charge and cannot release the newer owner', async t => {
  const f = recoveryFixture(t); const old = await f.admitAttempt('late');
  await f.command(old, '/start'); f.tick(30_001); const current = await f.admitAttempt('current');
  await f.command(current, '/start');
  await f.finish(old); await f.finish(old);
  assert.equal(reservation(f.database, 'late').accounted_neurons, 18);
  assert.equal(reservation(f.database, 'current').slot_active, 1);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM execution_attempts WHERE provider_outcome = 'UNKNOWN'").get().count, 1);
  await f.finish(old, timeoutSettlement); // Delayed provisional observation cannot overwrite final usage.
  assert.equal(reservation(f.database, 'late').accounted_neurons, 18);
  f.invariants();
});

test('verified usage can refine a terminal unknown charge once without touching current capacity', async t => {
  const f = recoveryFixture(t); const old = await f.admitAttempt('terminal-unknown');
  await f.command(old, '/start');
  await f.finish(old, { usage: undefined, failureClassification: 'COMPLETED_USAGE_UNKNOWN' });
  const current = await f.admitAttempt('current'); await f.command(current, '/start');
  await f.finish(old); await f.finish(old);
  assert.equal(reservation(f.database, 'terminal-unknown').accounted_neurons, 18);
  assert.equal(reservation(f.database, 'current').slot_active, 1);
  assert.equal((await f.finish(old, { usage: { promptTokens: 2000, completionTokens: 100 } })).status, 409);
  f.invariants();
});

test('generation mismatch cannot start, renew, settle or release another owner', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('fenced');
  const invalid = { ...grant, generation: grant.generation + 1 };
  assert.equal((await f.command(invalid, '/start')).body.reason, 'fenced');
  assert.equal((await f.command(invalid, '/heartbeat')).body.reason, 'fenced');
  assert.equal((await f.finish(invalid)).body.reason, 'fenced');
  assert.equal(reservation(f.database, 'fenced').slot_active, 1);
  assert.equal(reservation(f.database, 'fenced').accounted_neurons, 0);
  f.invariants();
});

test('heartbeats never extend absolute execution deadline and cannot revive expired owners', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('heartbeat');
  f.tick(20_000); const first = await f.command(grant, '/heartbeat');
  assert.equal(first.body.leaseExpiresAt, grant.leaseExpiresAt + 20_000);
  f.tick(20_000); const second = await f.command(grant, '/heartbeat');
  assert.equal(second.body.leaseExpiresAt, grant.deadlineAt);
  f.tick(20_001);
  assert.equal((await f.command(grant, '/heartbeat')).body.renewed, false);
  assert.equal(reservation(f.database, 'heartbeat').slot_active, 0);
  f.invariants();
});

for (const ordering of ['recovery-first', 'settlement-first']) {
  test(`recovery and settlement race remains consistent: ${ordering}`, async t => {
    const f = recoveryFixture(t); const grant = await f.admitAttempt('race');
    await f.command(grant, '/start'); f.tick(30_001);
    const operations = ordering === 'recovery-first'
      ? [() => f.controller.alarm(), () => f.finish(grant)] : [() => f.finish(grant), () => f.controller.alarm()];
    await Promise.all(operations.map(run => run()));
    assert.equal(reservation(f.database, 'race').accounted_neurons, 18);
    assert.equal(reservation(f.database, 'race').slot_active, 0);
    f.invariants();
  });
}

test('UTC rollover retains original-day charge and carries unresolved exposure into admission checks', async t => {
  const f = recoveryFixture(t, { now: Date.UTC(2026, 10, 8, 23, 59, 50), budget: '150' });
  const old = await f.admitAttempt('yesterday', 100); await f.command(old, '/start');
  f.tick(30_001);
  assert.equal((await f.admitAttempt('today', 60)).reason, 'budget_exhausted');
  await f.finish(old);
  assert.equal(f.database.prepare("SELECT settled_neurons FROM daily_budgets WHERE utc_day = '2026-11-08'").get().settled_neurons, 18);
  assert.equal((await f.admitAttempt('today-allowed', 60)).granted, true);
  f.invariants();
});

test('actual final usage is never clamped and budget overrun blocks further admission', async t => {
  const f = recoveryFixture(t, { budget: '100' }); const grant = await f.admitAttempt('overrun', 10);
  await f.command(grant, '/start'); await f.finish(grant, { usage: { promptTokens: 20_000, completionTokens: 100 } });
  assert.ok(reservation(f.database, 'overrun').accounted_neurons > 100);
  assert.equal((await f.admitAttempt('blocked', 1)).reason, 'budget_exhausted');
  f.invariants();
});

for (const config of [
  { AI_RECOVERY_MODE: undefined }, { AI_RECOVERY_MODE: 'off' },
  { AI_MAX_UNCERTAIN_ATTEMPTS: undefined }, { AI_MAX_UNCERTAIN_NEURONS: '0' },
  { AI_MAX_UNCERTAIN_ATTEMPTS: 'not-a-number' },
]) {
  test(`invalid or disabled recovery fails closed: ${JSON.stringify(config)}`, async t => {
    const f = recoveryFixture(t, { recovery: config }); const grant = await f.admitAttempt('strict');
    await f.command(grant, '/start'); f.tick(86_400_000); await f.controller.alarm();
    assert.equal(reservation(f.database, 'strict').slot_active, 1);
    assert.equal((await f.admitAttempt('blocked')).reason, 'busy');
    f.invariants();
  });
}

test('missing alarm capability forces strict concurrency even when bounded mode was requested', async t => {
  const f = recoveryFixture(t, { alarms: false }); await f.admitAttempt('strict'); f.tick(30_001);
  assert.equal((await f.admitAttempt('blocked')).reason, 'busy');
  assert.equal(reservation(f.database, 'strict').slot_active, 1); f.invariants();
});

test('observation-only alarms journal candidates without releasing ownership or changing accounting', async t => {
  const f = recoveryFixture(t, { recovery: { AI_RECOVERY_MODE: 'observe' } }); await f.admitAttempt('observe');
  const before = f.database.prepare('SELECT * FROM reservations').get(); f.tick(30_001);
  await f.controller.alarm(); await f.controller.alarm();
  assert.deepEqual(f.database.prepare('SELECT * FROM reservations').get(), before);
  assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM lifecycle_events WHERE event = 'recovery_would_apply'").get().count, 1);
  assert.equal((await f.admitAttempt('blocked')).reason, 'busy'); f.invariants();
});

test('legacy incident reservation and historical totals survive migration, alarms and new admission unchanged', async t => {
  const f = recoveryFixture(t);
  const id = 'f76b5698-de35-4539-b3a9-7a973653a2a4';
  const old = (await admit(f.controller, id, 217)).body; await start(f.controller, id, old.grantId);
  const before = f.database.prepare('SELECT * FROM reservations WHERE request_id = ?').get(id);
  const budgetsBefore = f.database.prepare('SELECT * FROM daily_budgets').all();
  f.controller = f.reopen().controller; f.tick(30 * 86_400_000); await f.controller.alarm();
  assert.equal((await f.admitAttempt('new-work')).reason, 'busy');
  assert.deepEqual(f.database.prepare('SELECT * FROM reservations WHERE request_id = ?').get(id), before);
  assert.deepEqual(f.database.prepare('SELECT * FROM daily_budgets').all(), budgetsBefore);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM execution_attempts WHERE request_id = ?').get(id).count, 0);
  f.invariants();
});

test('command ID conflicts cannot change the durable original result', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('conflict');
  await f.command(grant, '/start', {}, 'same-command');
  assert.equal((await f.command(grant, '/settle', timeoutSettlement, 'same-command')).status, 409);
  assert.equal(reservation(f.database, 'conflict').settlement_state, 'RESERVED'); f.invariants();
});

test('irrelevant body fields never enter durable receipts or lifecycle records', async t => {
  const f = recoveryFixture(t); const grant = await f.admitAttempt('privacy');
  await f.command(grant, '/start', { model: 'private-unused-value', estimatedNeurons: 'private-unused-value',
    headers: { Authorization: 'private-unused-value' }, userQuestion: 'private-unused-value' });
  for (const table of ['lifecycle_receipts', 'lifecycle_events', 'execution_attempts', 'accounting_adjustments']) {
    assert.doesNotMatch(JSON.stringify(f.database.prepare(`SELECT * FROM ${table}`).all()), /private-unused-value/);
  }
  f.invariants();
});

const goodProviderResult = { choices: [{ message: { role: 'assistant', content: 'Hafiz builds interactive portfolio experiences.' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1000, completion_tokens: 100 } };

test('concurrent operator evidence corrections serialize and cannot double-charge or alter another owner', async t => {
  const f = recoveryFixture(t, { adminToken: TEST_TOKEN }); const old = await f.admitAttempt('operator-race');
  await f.command(old, '/start'); f.tick(30_001); const current = await f.admitAttempt('current-owner');
  const identity = { requestId: old.requestId, grantId: old.grantId };
  const results = await Promise.all([
    call(f.controller, '/internal/reconcile', { ...identity, action: 'confirm_usage', evidence: 'test final provider receipt',
      usage: { promptTokens: 1000, completionTokens: 100 } }, TEST_TOKEN),
    call(f.controller, '/internal/reconcile', { ...identity, action: 'confirm_terminated_unknown', evidence: 'different test evidence' }, TEST_TOKEN),
  ]);
  assert.equal(results.filter(r => r.body.reconciled === true).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 1);
  assert.equal(reservation(f.database, current.requestId).slot_active, 1);
  assert.equal((await f.finish(old)).status, 409); f.invariants();
});

function connectedWorker(f, { intercept, provider = async () => goodProviderResult } = {}) {
  let inferenceCalls = 0; const retained = [];
  const env = { AI_ENABLED: 'true', AI_MODEL: GEMMA_MODEL,
    CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI: { run: (...args) => { inferenceCalls++; return provider(...args); } },
    AI_BUDGET_CONTROLLER: { getByName: () => ({ fetch: async request => {
      const response = await f.controller.fetch(request.clone());
      return intercept ? intercept(request, response) : response;
    } }) },
  };
  return { retained, calls: () => inferenceCalls,
    send: (signal) => createWorker().fetch(new Request('https://local/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ message: 'Does Hafiz have experience with Kubernetes?' }),
    }), env, { waitUntil: task => { retained.push(task); } }),
  };
}

for (const path of ['/admit', '/start', '/settle']) {
  test(`Worker handles response loss after ${path} commit without redispatch or duplicate accounting`, async t => {
    const f = recoveryFixture(t); let lost = false;
    const w = connectedWorker(f, { intercept: (request, response) => {
      if (!lost && new URL(request.url).pathname === path) { lost = true; throw new Error('simulated response loss'); }
      return response;
    } });
    assert.equal((await w.send()).status, 200); assert.equal(w.calls(), 1); assert.equal(lost, true);
    const record = f.database.prepare('SELECT * FROM reservations').get();
    assert.equal(record.accounted_neurons, 18); assert.equal(record.slot_active, 0);
    assert.equal(f.database.prepare("SELECT COUNT(*) AS count FROM lifecycle_events WHERE event = 'dispatch_intent'").get().count, 1);
    f.invariants();
  });
}

test('ambiguous start before provider dispatch safely closes only that un-dispatched attempt', async t => {
  const f = recoveryFixture(t);
  const w = connectedWorker(f, { intercept: (request, response) => {
    if (new URL(request.url).pathname === '/start') throw new Error('both start responses lost');
    return response;
  } });
  assert.equal((await w.send()).status, 503); assert.equal(w.calls(), 0);
  const record = f.database.prepare('SELECT * FROM reservations').get();
  assert.equal(record.slot_active, 0); assert.equal(record.accounted_neurons, 0);
  f.invariants();
});

test('client disconnected before dispatch never invokes provider or leaves an owned slot', async t => {
  const f = recoveryFixture(t); const w = connectedWorker(f); const abort = new AbortController(); abort.abort();
  assert.equal((await w.send(abort.signal)).status, 503); assert.equal(w.calls(), 0);
  assert.equal(f.database.prepare('SELECT slot_active FROM reservations').get().slot_active, 0);
  f.invariants();
});

test('provider transport failure stays unknown until bounded recovery rather than asserting cancellation', async t => {
  const f = recoveryFixture(t); const w = connectedWorker(f, { provider: async () => { throw new Error('sensitive provider payload'); } });
  assert.equal((await w.send()).status, 503); assert.equal(w.calls(), 1);
  assert.equal(f.database.prepare('SELECT provider_outcome FROM execution_attempts').get().provider_outcome, 'UNKNOWN');
  f.tick(30_001); await f.controller.alarm();
  assert.equal(f.database.prepare('SELECT slot_active FROM reservations').get().slot_active, 0);
  for (const table of ['lifecycle_receipts', 'lifecycle_events', 'execution_attempts', 'accounting_adjustments']) {
    assert.doesNotMatch(JSON.stringify(f.database.prepare(`SELECT * FROM ${table}`).all()), /sensitive provider payload|Kubernetes|Authorization/);
  }
  f.invariants();
});

test('observed provider response followed by normalization failure is terminal and releases the slot', async t => {
  const f = recoveryFixture(t); const w = connectedWorker(f, { provider: async () => ({ ...goodProviderResult, choices: [] }) });
  assert.equal((await w.send()).status, 503); assert.equal(w.calls(), 1);
  assert.equal(f.database.prepare('SELECT slot_active FROM reservations').get().slot_active, 0);
  assert.equal(f.database.prepare('SELECT provider_outcome FROM execution_attempts').get().provider_outcome, 'FAILED');
  assert.equal(f.database.prepare('SELECT accounted_neurons FROM reservations').get().accounted_neurons, 18);
  f.invariants();
});

test('client disconnect during provider execution preserves completion accounting through background retention', async t => {
  const f = recoveryFixture(t); const abort = new AbortController(); let began; let finish;
  const started = new Promise(resolve => { began = resolve; });
  const w = connectedWorker(f, { provider: () => { began(); return new Promise(resolve => { finish = resolve; }); } });
  const response = w.send(abort.signal); await started; abort.abort(); finish(goodProviderResult);
  assert.equal((await response).status, 200); await Promise.all(w.retained);
  assert.equal(f.database.prepare('SELECT slot_active FROM reservations').get().slot_active, 0);
  assert.equal(f.database.prepare('SELECT accounted_neurons FROM reservations').get().accounted_neurons, 18);
  f.invariants();
});

test('budget command timeout bounds stalled response bodies and never dispatches inference', async t => {
  const f = recoveryFixture(t);
  const w = connectedWorker(f, { intercept: (request, response) => new URL(request.url).pathname === '/start'
    ? new Response(new ReadableStream()) : response });
  const before = Date.now(); const response = await w.send();
  assert.equal(response.status, 503); assert.equal(w.calls(), 0);
  assert.ok(Date.now() - before < 10_000);
  assert.equal(f.database.prepare('SELECT accounted_neurons FROM reservations').get().accounted_neurons, 0);
  assert.equal(f.database.prepare('SELECT slot_active FROM reservations').get().slot_active, 0);
  f.invariants();
});

test('late provider completion after timeout and quarantine is recorded without touching a newer slot', async t => {
  mock.timers.enable({ apis: ['setTimeout'] }); t.after(() => mock.timers.reset());
  const f = recoveryFixture(t); let resolveProvider; let began;
  const started = new Promise(resolve => { began = resolve; });
  const w = connectedWorker(f, { provider: () => { began(); return new Promise(resolve => { resolveProvider = resolve; }); } });
  const response = w.send(); await started; mock.timers.tick(15_000);
  assert.equal((await response).status, 503);
  f.tick(30_001); const next = await f.admitAttempt('new-owner'); await f.command(next, '/start');
  resolveProvider(goodProviderResult);
  let size;
  do { size = w.retained.length; await Promise.all(w.retained); } while (size !== w.retained.length);
  const old = f.database.prepare("SELECT * FROM reservations WHERE request_id != 'new-owner'").get();
  assert.equal(old.accounted_neurons, 18); assert.equal(old.slot_active, 0);
  assert.equal(reservation(f.database, 'new-owner').slot_active, 1); assert.equal(w.calls(), 1);
  f.invariants();
});

test('authenticated legacy bridge quarantines only the exact reservation and replays without another charge', async t => {
  const f = legacyFixture(t);
  const worker = createWorker();
  const env = { AI_BUDGET_CONTROLLER: { getByName: () => ({ fetch: internalRequest => f.controller.fetch(internalRequest) }) } };
  const body = { transition: 'legacy_unknown_to_quarantine', expectedStatus: 'INFERENCE_STARTED',
    expectedReservedNeurons: 217 };
  const unauthorized = await worker.fetch(request('/internal/budget/recovery', body), env);
  assert.equal(unauthorized.status, 403);
  assert.deepEqual(await unauthorized.json(), { recovered: false, reason: 'unauthorized' });

  const first = await worker.fetch(request('/internal/budget/recovery', body, TEST_TOKEN), env);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { recovered: true, duplicate: false,
    requestId: 'f76b5698-de35-4539-b3a9-7a973653a2a4', provisionalNeurons: 217, providerOutcome: 'UNKNOWN' });
  assert.deepEqual(daily(f.database), { settled_neurons: 217, reserved_neurons: 0 });
  assert.deepEqual(reservation(f.database, 'f76b5698-de35-4539-b3a9-7a973653a2a4'), {
    status: 'UNKNOWN_USAGE', settlement_state: 'SETTLED', reserved_neurons: 217, accounted_neurons: 217,
    slot_active: 0, usage_source: 'provisional_legacy_unknown_exposure',
  });
  assert.deepEqual({ ...f.database.prepare(`SELECT reserved_delta, settled_delta, reason FROM accounting_adjustments`).get() },
    { reserved_delta: -217, settled_delta: 217, reason: 'LEGACY_UNKNOWN_TO_QUARANTINE' });

  const duplicate = await worker.fetch(request('/internal/budget/recovery', body, TEST_TOKEN), env);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM accounting_adjustments').get().count, 1);
  const status = await (await worker.fetch(request('/internal/budget/status', {}, TEST_TOKEN), env)).json();
  assert.equal(status.activeInferenceSlots, 0);
  assert.equal(status.configuredConcurrencyLimit, 1);
  assert.equal(status.configuredDailyEstimatedNeuronBudget, 2000);
  assert.equal(status.legacyReservation.reservedNeurons, 217);
  assert.equal(status.legacyReservation.accountedNeurons, 217);
  assert.equal(status.recovery.exposure.count, 1);
  assert.equal(status.recovery.exposure.neurons, 217);
  assert.equal(status.recovery.legacyExposure.providerOutcome, 'UNKNOWN');
  assert.equal(status.recovery.legacyExposure.recoveryState, 'QUARANTINED');
});

test('legacy bridge rejects stale status, wrong neuron amount, and invalid recovery policy without mutation', async t => {
  for (const [options, expectedStatus, reason] of [
    [{ status: 'RESERVED' }, 'INFERENCE_STARTED', 'legacy_state_mismatch'],
    [{ amount: 218 }, 'INFERENCE_STARTED', 'legacy_state_mismatch'],
    [{ recovery: { AI_MAX_UNCERTAIN_NEURONS: '1000' } }, 'INFERENCE_STARTED', 'safety_configuration_invalid'],
  ]) {
    const f = legacyFixture(t, options);
    const result = await f.quarantineLegacy(expectedStatus);
    assert.equal(result.status, 409);
    assert.equal(result.body.reason, reason);
    assert.equal(reservation(f.database, 'f76b5698-de35-4539-b3a9-7a973653a2a4').slot_active, 1);
    assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM legacy_exposures').get().count, 0);
  }
});

test('legacy bridge preserves durable unknown exposure across controller restart', async t => {
  const f = legacyFixture(t);
  assert.equal((await f.quarantineLegacy()).body.recovered, true);
  const reopened = f.reopen();
  const status = await call(reopened.controller, '/internal/status', {}, TEST_TOKEN);
  assert.equal(status.status, 200);
  assert.equal(status.body.legacyReservation.status, 'UNKNOWN_USAGE');
  assert.equal(status.body.activeInferenceSlots, 0);
  assert.equal(status.body.recovery.exposure.count, 1);
  assert.equal(status.body.recovery.exposure.neurons, 217);
  assert.equal(status.body.recovery.legacyExposure.providerOutcome, 'UNKNOWN');
  const duplicate = await call(reopened.controller, '/internal/legacy-quarantine', {
    transition: 'legacy_unknown_to_quarantine', expectedStatus: 'INFERENCE_STARTED',
    expectedReservedNeurons: 217,
  }, TEST_TOKEN);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS count FROM accounting_adjustments').get().count, 1);
});

test('legacy unknown exposure participates in caps and budget before allowing the bridge', async t => {
  const capped = legacyFixture(t);
  capped.database.prepare(`INSERT INTO reservations (
    request_id, grant_id, utc_day, model, reserved_neurons, accounted_neurons, reservation_at,
    completion_at, status, settlement_state, slot_active
  ) VALUES ('prior-unknown', 'prior-unknown-grant', '2026-11-07', ?, 1784, 1784, ?, ?, 'UNKNOWN_USAGE', 'SETTLED', 0)`)
    .run(GEMMA_MODEL, DAY_START, DAY_START);
  capped.database.prepare(`INSERT INTO execution_attempts (
    request_id, grant_id, attempt_id, owner_id, generation, lease_expires_at, deadline_at, admitted_at,
    provider_outcome, recovery_state
  ) VALUES ('prior-unknown', 'prior-unknown-grant', 'prior-unknown-attempt', 'prior-unknown-owner', 1, ?, ?, ?, 'UNKNOWN', 'QUARANTINED')`)
    .run(DAY_START, DAY_START, DAY_START);
  capped.database.prepare(`UPDATE daily_budgets SET settled_neurons = 1784 WHERE utc_day = '2026-11-07'`).run();
  assert.equal((await capped.quarantineLegacy()).body.reason, 'exposure_capacity_exhausted');
  assert.equal(reservation(capped.database, 'f76b5698-de35-4539-b3a9-7a973653a2a4').slot_active, 1);

  const exhausted = legacyFixture(t, { settled: 1900 });
  assert.equal((await exhausted.quarantineLegacy()).body.reason, 'budget_exhausted');
  assert.equal(reservation(exhausted.database, 'f76b5698-de35-4539-b3a9-7a973653a2a4').slot_active, 1);
});

test('late legacy settlement cannot release a newer slot or refund the provisional charge', async t => {
  const f = legacyFixture(t);
  assert.equal((await f.quarantineLegacy()).body.recovered, true);
  f.env.AI_RECOVERY_MODE = 'bounded';
  f.controller = f.create();
  const admission = await call(f.controller, '/admit', {
    protocol: 2, requestId: 'new-owner-after-legacy', attemptId: 'new-attempt', ownerId: 'new-owner',
    commandId: 'new-admit', estimatedNeurons: 100, model: GEMMA_MODEL,
  });
  assert.equal(admission.body.granted, true);
  const grant = admission.body;
  assert.equal((await call(f.controller, '/start', {
    protocol: 2, requestId: grant.requestId, grantId: grant.grantId, attemptId: grant.attemptId,
    ownerId: grant.ownerId, generation: grant.generation, commandId: 'new-start',
  })).body.started, true);

  const delayed = { requestId: 'f76b5698-de35-4539-b3a9-7a973653a2a4', grantId: 'legacy-grant',
    outcome: 'completed', terminal: true, failureClassification: 'COMPLETED_WITH_REPORTED_USAGE',
    usage: { promptTokens: 1000, completionTokens: 100 }, nowMs: DAY_START + 1 };
  assert.equal((await call(f.controller, '/settle', delayed)).body.settled, true);
  assert.equal(reservation(f.database, delayed.requestId).accounted_neurons, 217);
  assert.equal(reservation(f.database, delayed.requestId).slot_active, 0);
  assert.equal(reservation(f.database, grant.requestId).slot_active, 1);
  assert.deepEqual(daily(f.database), { settled_neurons: 217, reserved_neurons: 100 });
  assert.equal((await call(f.controller, '/settle', delayed)).body.duplicate, true);
  const status = await call(f.controller, '/internal/status', {}, TEST_TOKEN);
  assert.equal(status.body.recovery.exposure.count, 1);
  assert.equal(status.body.recovery.exposure.neurons, 100);
  assert.equal(status.body.recovery.legacyExposure.providerOutcome, 'COMPLETED');
  assert.equal(status.body.recovery.legacyExposure.recoveryState, 'TERMINAL');
});
