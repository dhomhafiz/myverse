import assert from 'node:assert/strict';
import { test } from 'node:test';
import diagnostic from './reliability-worker.ts';
import { AI_TIMEOUT_MS } from '../src/ai.ts';

const request = body => new Request('http://127.0.0.1/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const base = {
  AI_ENABLED: 'true',
  BENCHMARK_CANDIDATE: 'llama',
  CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
};
const openEndedMessage = 'How could Hafiz combine backend engineering with interactive frontend development?';

test('local diagnostic records actual phase boundaries without exposing prompts', async () => {
  const response = await diagnostic.fetch(request({ message: openEndedMessage }), {
    ...base, AI: { run: async () => ({ response: 'A creative developer.' }) },
  });
  assert.equal(response.status, 200);
  const trace = JSON.parse(response.headers.get('X-Reliability-Timing'));
  const events = trace.eventsMs;
  assert.ok(events.rateLimiterComplete >= events.rateLimiterStart);
  assert.ok(events.validationCompletedBy >= events.rateLimiterComplete);
  assert.ok(events.aiBindingResolved >= events.aiInvocationStart);
  assert.equal(trace.bindingSettled, true);
  assert.equal(trace.signalAborted, false);
  assert.doesNotMatch(JSON.stringify(trace), /VERIFIED PUBLIC|system prompt|Who is Hafiz/);
});

test('invalid requests do not reach diagnostic AI instrumentation', async () => {
  let calls = 0;
  const response = await diagnostic.fetch(request({ message: '' }), { ...base, AI: { run: async () => { calls++; } } });
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(response.headers.get('X-Reliability-Timing')).eventsMs.aiInvocationStart, undefined);
});

test('deadline is safe even if the underlying operation ignores cancellation and settles later', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  let entered;
  let signal;
  const invoked = new Promise(resolve => { entered = resolve; });
  const pending = diagnostic.fetch(request({ message: openEndedMessage }), {
    ...base, AI: { run: (_model, _input, options) => {
      signal = options.signal;
      entered();
      return new Promise(resolve => { release = resolve; });
    } },
  });
  await invoked;
  t.mock.timers.tick(AI_TIMEOUT_MS);
  const response = await pending;
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: 'AI_UNAVAILABLE',
      message: 'Sorry, the AI Companion is temporarily unavailable. Please try again, or explore /work and /contact.',
    },
  });
  const trace = JSON.parse(response.headers.get('X-Reliability-Timing'));
  assert.equal(signal.aborted, true);
  assert.equal(trace.signalAborted, true);
  assert.equal(trace.bindingSettled, false);
  release({ response: 'Late mocked answer.' });
  await Promise.resolve();
  await Promise.resolve();
  const status = await diagnostic.fetch(new Request('http://127.0.0.1/__reliability/status'), base);
  const latest = (await status.json()).traces.find(item => item.id === trace.id);
  assert.equal(latest.bindingSettled, true);
  assert.ok('aiBindingResolved' in latest.eventsMs);
});
