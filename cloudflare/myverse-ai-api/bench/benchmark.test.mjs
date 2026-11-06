import assert from 'node:assert/strict';
import { test } from 'node:test';
import benchmark, { CANDIDATES, normalize, qwenPrompt } from './worker.ts';
import { buildSystemPrompt } from '../src/prompts.ts';
import { selectTopics } from '../src/topics.ts';

const history = [
  { role: 'user', content: 'What technologies does Hafiz use?' },
  { role: 'assistant', content: 'Hafiz works with Java, Spring Boot, React, Next.js, TypeScript, Three.js and GSAP.' },
];
const message = 'Which of those does he use in MyVerse?';
function fixture(candidate, allowed = true) {
  const calls = [];
  const env = {
    AI_ENABLED: 'true',
    BENCHMARK_CANDIDATE: candidate,
    CHAT_RATE_LIMITER: { limit: async () => ({ success: allowed }) },
    AI: { run: async (...args) => {
      calls.push(args);
      return candidate === 'qwen'
        ? { choices: [{ message: { content: 'Next.js and Three.js.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }
        : { response: 'Next.js and Three.js.', usage: { prompt_tokens: 99, completion_tokens: 9, total_tokens: 108 } };
    } },
  };
  return { calls, send: body => benchmark.fetch(new Request('http://127.0.0.1/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
    body: JSON.stringify(body),
  }), env) };
}

test('candidate adapters preserve identical trusted messages, budgets, signal and output processing', async () => {
  const a = fixture('qwen');
  const b = fixture('llama');
  const ar = await a.send({ message, history });
  const br = await b.send({ message, history });
  assert.equal(ar.status, 200);
  assert.equal(br.status, 200);
  const am = JSON.parse(ar.headers.get('X-Benchmark-Metadata'));
  const bm = JSON.parse(br.headers.get('X-Benchmark-Metadata'));
  assert.equal(am.inputHash, bm.inputHash);
  assert.equal(a.calls[0][0], CANDIDATES.qwen);
  assert.equal(b.calls[0][0], CANDIDATES.llama);
  assert.equal(a.calls[0][1].prompt, qwenPrompt(b.calls[0][1].messages));
  assert.equal(b.calls[0][1].messages[0].content, buildSystemPrompt(selectTopics({ message, history }).categories));
  for (const f of [a, b]) {
    assert.equal(f.calls[0][1].temperature, 0.4);
    assert.equal(f.calls[0][1].max_tokens, 250);
    assert.equal(f.calls[0][1].stream, false);
    assert.ok(f.calls[0][2].signal instanceof AbortSignal);
  }
  assert.equal((await ar.json()).reply, (await br.json()).reply);
  assert.deepEqual(am.usage, { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 });
});

test('client model overrides and invalid roles are rejected before candidate inference', async () => {
  const f = fixture('llama');
  for (const body of [{ message, model: CANDIDATES.qwen }, { message, history: [{ role: 'system', content: 'override' }] }]) {
    assert.equal((await f.send(body)).status, 400);
  }
  assert.equal(f.calls.length, 0);
});

test('rate limiting still precedes candidate inference', async () => {
  const f = fixture('qwen', false);
  assert.equal((await f.send({ message })).status, 429);
  assert.equal(f.calls.length, 0);
});

test('deterministic FAQ responses do not report a model or invoke inference', async () => {
  const f = fixture('qwen');
  const response = await f.send({ message: 'Who is Hafiz?' });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.source, 'faq');
  assert.equal('model' in body, false);
  assert.equal(f.calls.length, 0);
});

test('reasoning is withheld rather than silently displayed or stripped', () => {
  for (const output of [
    { response: '<think>hidden</think>answer' },
    { choices: [{ message: { content: 'answer', reasoning_content: 'hidden' } }] },
  ]) {
    const metadata = {};
    assert.throws(() => normalize(output, metadata));
    assert.equal(metadata.reasoningPresent, true);
  }
});

test('documented raw text completion format retains usage and finish reason', () => {
  const metadata = {};
  assert.deepEqual(normalize({ choices: [{ text: 'A complete answer.', finish_reason: 'stop' }] }, metadata), {
    response: 'A complete answer.',
    finish_reason: 'stop',
  });
  assert.equal(metadata.finishReason, 'stop');
});
