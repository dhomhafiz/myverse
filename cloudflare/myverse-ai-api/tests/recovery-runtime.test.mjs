import assert from 'node:assert/strict';
import { test } from 'node:test';
import process from 'node:process';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('workerd SQLite transactions, receipt replay and real alarm wakeup preserve recovery invariants', async t => {
  // Test-only clock advancement and alarm trigger. No such endpoint exists in production.
  const bundled = await build({ bundle: true, write: false, format: 'esm', platform: 'browser',
    stdin: { resolveDir: process.cwd(), contents: `
      import { AiBudgetController } from './src/budget-controller.ts';
      export class RuntimeController extends AiBudgetController {
        constructor(ctx, env) {
          let offset = 0;
          super(ctx, env, () => Date.now() + offset);
          this.expire = () => { offset += 30001; };
          this.testState = ctx;
          this.testEnv = env;
        }
        async fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === '/test/expire') {
            this.expire();
            await this.testState.storage.setAlarm(Date.now() - 1);
            return new Response('scheduled');
          }
          if (path === '/test/seed-legacy') {
            this.testEnv.AI_RECOVERY_MODE = 'observe';
            const now = Date.now();
            const day = new Date(now).toISOString().slice(0, 10);
            this.testState.storage.sql.exec('INSERT OR IGNORE INTO daily_budgets (utc_day, settled_neurons, reserved_neurons, updated_at) VALUES (?, 0, 0, ?)', day, now);
            this.testState.storage.sql.exec('UPDATE daily_budgets SET reserved_neurons = reserved_neurons + 217, updated_at = ? WHERE utc_day = ?', now, day);
            this.testState.storage.sql.exec('INSERT INTO reservations (request_id, grant_id, utc_day, model, reserved_neurons, accounted_neurons, reservation_at, inference_started_at, status, settlement_state, slot_active) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1)',
              'f76b5698-de35-4539-b3a9-7a973653a2a4', 'runtime-legacy-grant', day,
              '@cf/google/gemma-4-26b-a4b-it', 217, now, now, 'INFERENCE_STARTED', 'RESERVED');
            return new Response('seeded');
          }
          return super.fetch(request);
        }
      }
      export default { fetch() { return new Response('test-only'); } };
    ` },
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, workers: [{ name: 'recovery-runtime', modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-11-05',
    durableObjects: { AI_BUDGET_CONTROLLER: { className: 'RuntimeController', useSQLite: true } },
    bindings: { AI_DAILY_ESTIMATED_NEURON_BUDGET: '2000', AI_MAX_CONCURRENT_INFERENCES: '1',
      AI_RECOVERY_MODE: 'bounded', AI_MAX_UNCERTAIN_ATTEMPTS: '2', AI_MAX_UNCERTAIN_NEURONS: '2000',
      AI_BUDGET_ADMIN_TOKEN: 'runtime-test-only' },
  }] }));
  t.after(() => mf.dispose());
  const ns = await mf.getDurableObjectNamespace('AI_BUDGET_CONTROLLER', 'recovery-runtime');
  const stub = ns.get(ns.idFromName('global'));
  const call = async (path, body = {}) => {
    const response = await stub.fetch('https://test' + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer runtime-test-only' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const identity = { protocol: 2, requestId: 'runtime-request', attemptId: 'runtime-attempt', ownerId: 'runtime-owner' };
  const admission = { ...identity, commandId: 'admit-runtime', estimatedNeurons: 100, model: '@cf/google/gemma-4-26b-a4b-it' };
  const grant = await call('/admit', admission);
  assert.equal(grant.granted, true);
  assert.equal((await call('/admit', admission)).grantId, grant.grantId);
  const fenced = { ...identity, grantId: grant.grantId, generation: grant.generation };
  assert.equal((await call('/start', { ...fenced, commandId: 'start-runtime' })).started, true);
  await stub.fetch('https://test/test/expire');
  let status;
  for (let i = 0; i < 100; i++) {
    status = await call('/internal/status');
    if (status.recovery.attempts[0].recovery_state === 'QUARANTINED') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(status.recovery.attempts[0].recovery_state, 'QUARANTINED');
  assert.equal(status.recovery.attempts[0].provider_outcome, 'UNKNOWN');
  assert.equal(status.activeInferenceSlots, 0);
  assert.equal(status.estimatedSettledNeurons, 100);
  assert.equal(status.estimatedReservedNeurons, 0);
  await mf.unsafeEvictDurableObject('recovery-runtime', 'RuntimeController', { name: 'global' });
  status = await call('/internal/status');
  assert.equal(status.recovery.attempts[0].recovery_state, 'QUARANTINED');
  assert.equal((await call('/admit', admission)).generation, grant.generation);
  const completion = { ...fenced, commandId: 'complete-runtime', outcome: 'completed', terminal: true,
    failureClassification: 'COMPLETED_WITH_REPORTED_USAGE', usage: { promptTokens: 1000, completionTokens: 100 } };
  assert.equal((await call('/settle', completion)).settled, true);
  assert.equal((await call('/settle', completion)).replayed, true);
  status = await call('/internal/status');
  assert.equal(status.estimatedSettledNeurons, 18);
  assert.equal(status.recovery.exposure.count, 0);
  assert.equal(status.activeInferenceSlots, 0);

  await stub.fetch('https://test/test/seed-legacy');
  const recovered = await call('/internal/legacy-quarantine', {
    transition: 'legacy_unknown_to_quarantine',
    expectedStatus: 'INFERENCE_STARTED',
    expectedReservedNeurons: 217,
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.duplicate, false);
  await mf.unsafeEvictDurableObject('recovery-runtime', 'RuntimeController', { name: 'global' });
  status = await call('/internal/status');
  assert.equal(status.legacyReservation.status, 'UNKNOWN_USAGE');
  assert.equal(status.activeInferenceSlots, 0);
  assert.equal(status.estimatedSettledNeurons, 235);
  assert.equal(status.estimatedReservedNeurons, 0);
  assert.equal(status.recovery.exposure.count, 1);
  assert.equal(status.recovery.exposure.neurons, 217);
});
