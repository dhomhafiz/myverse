import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createLocalApiProvider, createWorkerApiProvider, selectConversationProvider, parseCompanionResponse,
  validateCompanionPrompt, validateWorkerApiUrl } from '../lib/companion-api.ts';
import { createCompanionRequest } from '../lib/companion-request.ts';
import { mockConversationProvider } from '../lib/companion-chat.ts';

const signal = () => new AbortController().signal;
const faq = reply => Response.json({ success: true, source: 'faq', reply });
const localFetch = handler => (url, init) => url.endsWith('/health')
  ? Promise.resolve(Response.json({ status: 'ok', localMode: 'faq-only' })) : handler(url, init);
const callbacks = events => ({ onStart: text => events.push(['start', text]), onReply: text => events.push(['reply', text]),
  onError: (_, text) => events.push(['error', text]), onSettled: () => events.push(['settled']) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('mock remains the default; local API is explicit and confined to development', async () => {
  assert.equal(selectConversationProvider({ environment: 'development' }).provider, mockConversationProvider);
  assert.equal(selectConversationProvider({ environment: 'development', mode: 'mock' }).provider, mockConversationProvider);
  assert.equal(selectConversationProvider({ environment: 'production', mode: 'local-api', url: 'http://127.0.0.1:8787' }).mode, 'unavailable');
  assert.equal(selectConversationProvider({ environment: 'production' }).provider, mockConversationProvider);
  assert.equal(selectConversationProvider({ environment: 'test', mode: 'local-api' }).mode, 'mock');
  assert.equal(selectConversationProvider({ environment: 'development', mode: 'local-api', url: 'http://127.0.0.1:8787' }).mode, 'local-api');
  assert.equal(selectConversationProvider({ environment: 'production', mode: 'worker-api',
    url: 'https://myverse-ai-api.example.workers.dev' }).mode, 'worker-api');
  assert.equal(selectConversationProvider({ environment: 'development', mode: 'worker-api',
    url: 'https://myverse-ai-api.example.workers.dev' }).mode, 'unavailable');
  for (const config of [{ mode: 'other' }, { mode: 'local-api' }, { mode: 'local-api', url: 'https://production.example' }]) {
    const selected = selectConversationProvider({ environment: 'development', ...config });
    assert.equal(selected.mode, 'unavailable');
    await assert.rejects(selected.provider.respond('Who is Hafiz?', signal()), error => error.code === 'configuration');
  }
  for (const config of [{ environment: 'production', mode: 'worker-api' },
    { environment: 'production', mode: 'worker-api', url: 'http://api.example' }]) {
    const selected = selectConversationProvider(config);
    assert.equal(selected.mode, 'unavailable');
    await assert.rejects(selected.provider.respond('Who is Hafiz?', signal()), error => error.code === 'configuration');
  }
});

test('mock responses remain deterministic and cancellable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const answer = mockConversationProvider.respond('Who is Hafiz?', signal());
  t.mock.timers.tick(520);
  assert.match(await answer, /Mohd Hafiz/);
  const controller = new AbortController();
  const cancelled = mockConversationProvider.respond('projects', controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
});

test('local URL validation rejects remote origins, credentials and unexpected URL components', () => {
  for (const url of ['http://localhost:8787', 'http://127.0.0.1:8787/', 'http://[::1]:8787']) assert.ok(createLocalApiProvider(url));
  for (const url of ['', 'https://127.0.0.1:8787', 'http://127.0.0.1.evil.example', 'http://user:secret@localhost:8787', 'http://localhost:8787/api/chat', 'http://localhost:8787/?x=1', 'http://localhost:8787/#x']) {
    assert.throws(() => createLocalApiProvider(url), error => error.code === 'configuration');
  }
});

test('production Worker URL validation requires a secure API origin', () => {
  assert.equal(validateWorkerApiUrl('https://myverse-ai-api.example.workers.dev'), 'https://myverse-ai-api.example.workers.dev');
  for (const url of ['', 'http://api.example', 'https://localhost', 'https://127.0.0.1', 'https://user:pass@api.example',
    'https://api.example', 'https://api.example/api/chat', 'https://myverse-ai-api.example.workers.dev/?x=1',
    'https://myverse-ai-api.example.workers.dev/#x']) {
    assert.throws(() => validateWorkerApiUrl(url), error => error.code === 'configuration');
  }
});

test('production Worker provider posts once and accepts FAQ or guarded AI replies', async () => {
  const calls = [];
  const provider = createWorkerApiProvider('https://myverse-ai-api.example.workers.dev', { fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return Response.json({ success: true, source: 'ai', model: '@cf/google/gemma-4-26b-a4b-it', reply: 'A grounded reply.' });
  } });
  assert.equal(await provider.respond('A question', signal()), 'A grounded reply.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://myverse-ai-api.example.workers.dev/api/chat');
  assert.deepEqual(JSON.parse(calls[0][1].body), { message: 'A question' });
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].credentials, 'omit');

  const faqProvider = createWorkerApiProvider('https://myverse-ai-api.example.workers.dev', {
    fetchImpl: async () => Response.json({ success: true, source: 'faq', reply: 'FAQ reply.' }),
  });
  assert.equal(await faqProvider.respond('Who is Hafiz?', signal()), 'FAQ reply.');
  assert.throws(() => parseCompanionResponse({ success: true, source: 'ai', reply: 'Not enabled locally.' }),
    error => error.code === 'malformed');
  assert.equal(parseCompanionResponse({ success: true, source: 'ai', reply: 'Allowed.' }, true).source, 'ai');
});

test('production Worker failures are safe and never retried', async () => {
  let calls = 0;
  const provider = createWorkerApiProvider('https://myverse-ai-api.example.workers.dev', { fetchImpl: async () => {
    calls++;
    return new Response('private provider details', { status: 503 });
  } });
  await assert.rejects(provider.respond('Question', signal()), error => error.code === '503' && !error.message.includes('private'));
  assert.equal(calls, 1);
});

test('request serialization sends only the message, no history, model, secrets or UI state', async () => {
  let called;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: localFetch(async (...args) => { called = args; return faq('Known FAQ.'); }) });
  assert.equal(await provider.respond(' Who is Hafiz? ', signal()), 'Known FAQ.');
  assert.equal(called[0], 'http://127.0.0.1:8787/api/chat');
  assert.deepEqual(JSON.parse(called[1].body), { message: 'Who is Hafiz?' });
  assert.deepEqual(called[1].headers, { 'Content-Type': 'application/json' });
  assert.equal(called[1].credentials, 'omit');
  assert.equal(called[1].redirect, 'error');
  assert.ok(called[1].signal instanceof AbortSignal);
});

test('input counts exactly 500 UTF-16 units, including astral characters, without truncation', () => {
  assert.equal(validateCompanionPrompt('a'.repeat(500)).length, 500);
  assert.equal(validateCompanionPrompt('😀'.repeat(250)).length, 500);
  assert.throws(() => validateCompanionPrompt('😀'.repeat(251)), error => error.code === 'length');
  assert.throws(() => validateCompanionPrompt(' '.repeat(500) + 'a'), error => error.code === 'length');
  assert.throws(() => validateCompanionPrompt('a'.repeat(501)), error => error.code === 'length');
  assert.throws(() => validateCompanionPrompt(' \n\t'), error => error.code === 'empty');
});

for (const [status, code] of [[400, '400'], [429, '429'], [503, '503'], [500, '503']]) {
  test(`HTTP ${status} gets safe messaging, with no retries or leaked internal details`, async () => {
    let calls = 0;
    const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: localFetch(async () => {
      calls++; return new Response('PRIVATE_DO_STATE secret internal diagnostic', { status });
    }) });
    await assert.rejects(provider.respond('Question', signal()), error => error.code === code && !/PRIVATE|secret|internal/.test(error.message));
    assert.equal(calls, 1);
  });
}

test('network failure is safe and never retried', async () => {
  let calls = 0;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: localFetch(async () => { calls++; throw new Error('secret'); }) });
  await assert.rejects(provider.respond('Question', signal()), error => error.code === 'network' && !error.message.includes('secret'));
  assert.equal(calls, 1);
});

test('successful HTTP status still requires a complete FAQ response', async () => {
  for (const response of [null, [], {}, { success: false }, { success: true, source: 'faq', reply: '' },
    { success: true, source: 'faq', reply: '  ' }, { success: true, source: 'ai', reply: 'Unexpected generated reply.' }]) {
    assert.throws(() => parseCompanionResponse(response), error => error.code === 'malformed');
  }
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: localFetch(async () => new Response('{not JSON')) });
  await assert.rejects(provider.respond('Question', signal()), error => error.code === 'malformed');
});

test('caller abort reaches fetch, settles even if transport ignores it, and never retries', async () => {
  const controller = new AbortController();
  let transportSignal;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: localFetch(async (_, init) => {
    transportSignal = init.signal; return new Promise(() => {});
  }) });
  const pending = provider.respond('Question', controller.signal);
  await setImmediate();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(transportSignal.aborted, true);
});

test('already aborted requests never reach the transport', async () => {
  const controller = new AbortController(); controller.abort();
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: () => assert.fail('transport') });
  await assert.rejects(provider.respond('Question', controller.signal), { name: 'AbortError' });
});

test('bounded timeout settles an unresponsive transport even when it ignores cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let transportSignal;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { timeoutMs: 100, fetchImpl: localFetch(async (_, init) => {
    transportSignal = init.signal; return new Promise(() => {});
  }) });
  const pending = provider.respond('Question', signal());
  const rejected = assert.rejects(pending, error => error.code === 'timeout');
  await setImmediate();
  t.mock.timers.tick(100);
  await rejected;
  assert.equal(transportSignal.aborted, true);
  assert.throws(() => createLocalApiProvider('http://localhost', { timeoutMs: 999999 }), error => error.code === 'configuration');
});

test('the same timeout also bounds an unresponsive response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { timeoutMs: 100,
    fetchImpl: localFetch(async () => ({ ok: true, json: () => new Promise(() => {}) })) });
  const pending = provider.respond('Question', signal());
  const rejected = assert.rejects(pending, error => error.code === 'timeout');
  await setImmediate();
  t.mock.timers.tick(100);
  await rejected;
});

test('each submission verifies the FAQ-only profile and never posts to an unexpected Worker', async () => {
  let calls = 0;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: async (url, init) => {
    calls++;
    assert.ok(url.endsWith('/health'));
    assert.equal(init.method, 'GET');
    return Response.json({ status: 'ok', service: 'historical-model-evaluation' });
  } });
  await assert.rejects(provider.respond('Question', signal()), error => error.code === 'configuration');
  assert.equal(calls, 1);
});

test('a disconnected health check is a safe network failure and never sends the question', async () => {
  let calls = 0;
  const provider = createLocalApiProvider('http://127.0.0.1:8787', { fetchImpl: async url => {
    calls++; assert.ok(url.endsWith('/health')); throw new Error('private connection details');
  } });
  await assert.rejects(provider.respond('Question', signal()), error => error.code === 'network' && !error.message.includes('private'));
  assert.equal(calls, 1);
});

test('rapid submits yield one start/message and one provider call; subsequent questions work', async () => {
  const first = deferred(); let calls = 0; const events = [];
  const request = createCompanionRequest({ respond: async () => { calls++; return first.promise; } });
  assert.equal(request.submit('First', callbacks(events)), true);
  assert.equal(request.submit('First', callbacks(events)), false);
  assert.equal(calls, 1);
  first.resolve('First reply'); await setImmediate();
  assert.deepEqual(events, [['start', 'First'], ['reply', 'First reply'], ['settled']]);
  assert.equal(request.submit('Second', callbacks(events)), true);
  await setImmediate();
  assert.equal(calls, 2);
});

test('close/navigation cancellation and reopening cannot admit stale or out-of-order completions', async () => {
  const old = deferred(); const next = deferred(); const events = []; const signals = [];
  const request = createCompanionRequest({ respond: (_, currentSignal) => { signals.push(currentSignal); return signals.length === 1 ? old.promise : next.promise; } });
  request.submit('Old question', callbacks(events)); request.cancel();
  assert.equal(signals[0].aborted, true);
  assert.equal(request.pending, false);
  request.submit('Reopened question', callbacks(events));
  old.resolve('STALE REPLY'); await setImmediate();
  assert.equal(request.pending, true);
  next.resolve('Current reply'); await setImmediate();
  assert.deepEqual(events, [['start', 'Old question'], ['start', 'Reopened question'], ['reply', 'Current reply'], ['settled']]);
});

test('failure preserves the original prompt for the UI and clears pending state', async () => {
  const events = []; const request = createCompanionRequest({ respond: async () => { throw new Error('failed'); } });
  request.submit('Keep my message', callbacks(events)); await setImmediate();
  assert.deepEqual(events, [['start', 'Keep my message'], ['error', 'Keep my message'], ['settled']]);
  assert.equal(request.pending, false);
});
