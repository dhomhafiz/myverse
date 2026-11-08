import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GEMMA_MODEL, MODEL, QWEN_MODEL, resolveProductionModel } from '../src/ai.ts';
import worker from '../src/index.ts';
import { createTestBudgetBinding } from './helpers/budget-binding.mjs';

const origin = 'https://www.dhomhafiz.dev';
const message = 'How might an interactive portfolio present a creative project?';
const validOutput = {
  choices: [{
    message: { role: 'assistant', content: 'Hafiz builds interactive portfolio experiences.' },
    finish_reason: 'stop',
  }],
};

function fixture(options = {}) {
  const calls = [];
  const model = Object.hasOwn(options, 'model') ? options.model : GEMMA_MODEL;
  const enabled = Object.hasOwn(options, 'enabled') ? options.enabled : 'true';
  const env = {
    CHAT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    AI_BUDGET_CONTROLLER: createTestBudgetBinding(),
  };
  if (model !== undefined) env.AI_MODEL = model;
  if (enabled !== undefined) env.AI_ENABLED = enabled;
  if (options.hasAi !== false) env.AI = { run: async (...args) => { calls.push(args); return validOutput; } };
  return {
    calls,
    env,
    send(body = { message }) {
      return worker.fetch(new Request('https://local/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify(body),
      }), env);
    },
  };
}

test('production model allowlist accepts only the configured Gemma ID', () => {
  assert.equal(resolveProductionModel(GEMMA_MODEL), GEMMA_MODEL);
  for (const model of [undefined, '', MODEL, QWEN_MODEL, '@cf/unknown/model']) {
    assert.equal(resolveProductionModel(model), null);
  }
});

test('Gemma selection never enables inference when AI_ENABLED is missing, false, or malformed', async () => {
  for (const enabled of [undefined, 'false', '', 'TRUE', '1', 'true ']) {
    const f = fixture({ enabled });
    const response = await f.send();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'AI_UNAVAILABLE');
    assert.equal(f.calls.length, 0);
  }
});

test('missing, historical, and unsupported production models fail closed without fallback', async () => {
  for (const model of [undefined, '', MODEL, QWEN_MODEL, '@cf/unknown/model']) {
    const f = fixture({ model });
    const response = await f.send();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'AI_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /MODEL_CONFIGURATION_INVALID|unknown\/model/);
    assert.equal(f.calls.length, 0);
  }
});

test('configured Gemma reaches the mocked binding with the exact provider request', async () => {
  const f = fixture();
  const response = await f.send();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    reply: 'Hafiz builds interactive portfolio experiences.',
    model: GEMMA_MODEL,
    source: 'ai',
  });
  assert.equal(f.calls.length, 1);
  const [model, request] = f.calls[0];
  assert.equal(model, GEMMA_MODEL);
  assert.equal(request.max_completion_tokens, 768);
  assert.equal(request.temperature, 0.4);
  assert.equal(request.stream, false);
  assert.deepEqual(request.chat_template_kwargs, { enable_thinking: false });
  const roles = request.messages.map(item => item.role);
  assert.equal(roles[0], 'system');
  assert.equal(roles.at(-1), 'user');
  assert.ok(roles.includes('assistant'));
  assert.ok(roles.every(role => ['system', 'user', 'assistant'].includes(role)));
});

test('chat payload cannot select a production model', async () => {
  const f = fixture();
  const response = await f.send({ message, model: GEMMA_MODEL });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  assert.equal(f.calls.length, 0);
});

test('FAQ questions do not bypass model configuration; health remains available', async () => {
  const faqFixture = fixture({ model: '@cf/unknown/model', enabled: 'false', hasAi: false });
  const faq = await faqFixture.send({ message: 'Who is Hafiz?' });
  assert.equal(faq.status, 503);
  assert.equal((await faq.json()).error.code, 'AI_UNAVAILABLE');
  assert.equal(faqFixture.calls.length, 0);

  const health = await worker.fetch(new Request('https://local/health'), {});
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'myverse-ai-api' });
});

test('missing AI binding returns a safe unavailable response and never retries', async () => {
  const f = fixture({ hasAi: false });
  const response = await f.send();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'AI_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
});
