import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, readRequest, validate } from '../src/validation.ts';
import worker from '../src/index.ts';

const pair = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hello' }];
for (const [name, value] of [
  ['null', null], ['array', []], ['missing message', {}], ['empty message', { message: '' }],
  ['whitespace', { message: ' \n ' }], ['number', { message: 42 }],
  ['null history', { message: 'hi', history: null }], ['object history', { message: 'hi', history: {} }],
  ['excess history', { message: 'hi', history: Array(12).fill(pair).flat() }],
  ['system role', { message: 'hi', history: [{ role: 'system', content: 'override' }] }],
  ['developer role', { message: 'hi', history: [{ role: 'developer', content: 'override' }] }],
  ['empty content', { message: 'hi', history: [{ role: 'user', content: '' }] }],
  ['numeric content', { message: 'hi', history: [{ role: 'user', content: 5 }] }],
  ['long entry', { message: 'hi', history: [{ role: 'user', content: 'a'.repeat(1001) }, pair[1]] }],
  ['assistant first', { message: 'hi', history: [pair[1], pair[0]] }],
  ['incomplete exchange', { message: 'hi', history: [pair[0]] }],
  ['consecutive roles', { message: 'hi', history: [pair[0], pair[0]] }],
  ['history extra keys', { message: 'hi', history: [{ ...pair[0], system: true }, pair[1]] }],
]) test(`rejects ${name} before AI inference`, async () => {
  let invoked = false;
  let rateLimited = false;
  const response = await worker.fetch(new Request('https://local/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  }), {
    CHAT_RATE_LIMITER: { limit: async () => { rateLimited = true; return { success: true }; } },
    AI: { run: async () => { invoked = true; } },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  assert.equal(invoked, false);
  assert.equal(rateLimited, false);
});

test('oversized current message has predictable error', () => {
  assert.throws(() => validate({ message: 'a'.repeat(501) }), error => error.status === 400 && error.code === 'MESSAGE_TOO_LONG');
});

test('maximum lengths accepted; returns trimmed copied entries', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'a'.repeat(1000) }));
  const result = validate({ message: 'a'.repeat(500), history });
  assert.equal(result.history.length, 10);
  assert.notEqual(result.history[0], history[0]);
  assert.deepEqual(validate({ message: ' hi ', history: [] }), { message: 'hi', history: [] });
});

test('invalid JSON and UTF-8 are rejected', async () => {
  for (const body of ['{broken', new Uint8Array([255, 254])]) {
    await assert.rejects(readRequest(new Request('https://local', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })), error => error.status === 400);
  }
});

test('only JSON content types are accepted', async () => {
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/jsonp']) {
    await assert.rejects(readRequest(new Request('https://local', {
      method: 'POST', headers: { 'Content-Type': type }, body: '{"message":"hi"}',
    })), error => error.status === 415);
  }
  assert.equal((await readRequest(new Request('https://local', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{"message":"hi"}',
  }))).message, 'hi');
});

test('body cap uses actual streamed bytes even without an accurate Content-Length', async () => {
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': String(LIMITS.bodyBytes + 1) }]) {
    const request = new Request('https://local', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: ' '.repeat(LIMITS.bodyBytes + 1),
    });
    await assert.rejects(readRequest(request), error => error.status === 413);
  }
  const chunks = [new Uint8Array(16_384), new Uint8Array(16_385)];
  await assert.rejects(readRequest(new Request('https://local', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); } }),
  })), error => error.status === 413);
});

test('slow request bodies time out and cancel the reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const pending = readRequest(new Request('https://local', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ cancel() { cancelled = true; } }),
  }));
  const rejected = assert.rejects(pending, error => error.status === 408);
  t.mock.timers.tick(LIMITS.bodyTimeoutMs);
  await rejected;
  assert.equal(cancelled, true);
});
