import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateGemmaNeuronReservation,
  estimateGemmaNeuronUsage,
  reportedModelTokenUsage,
} from '../src/ai.ts';
import { selectTopics } from '../src/topics.ts';

test('reservation estimate includes the constructed prompt and completion ceiling', () => {
  const input = { message: 'What is MyVerse?', history: [] };
  const selection = selectTopics(input);
  const estimate = estimateGemmaNeuronReservation(input, selection);
  assert.equal(Number.isSafeInteger(estimate), true);
  assert.ok(estimate > 0 && estimate < 2_000);

  const contextualInput = {
    message: 'What about the second approach?',
    history: [
      { role: 'user', content: 'How does the portfolio work?' },
      { role: 'assistant', content: 'It is an interactive 3D portfolio.' },
    ],
  };
  const contextualEstimate = estimateGemmaNeuronReservation(contextualInput, selectTopics(contextualInput));
  assert.ok(contextualEstimate > estimate);
});

test('over-context prompt estimates fail closed', () => {
  const input = { message: 'x'.repeat(300_000), history: [] };
  assert.equal(estimateGemmaNeuronReservation(input, selectTopics(input)), null);
});

test('reported usage uses official model token rates with a conservative margin', () => {
  assert.equal(estimateGemmaNeuronUsage(1_000, 100), 18);
  assert.equal(estimateGemmaNeuronUsage(1, 0), 1);
  assert.equal(estimateGemmaNeuronUsage(256_000, 0), 3_491);
  assert.equal(estimateGemmaNeuronUsage(1, 769), null);
});

test('provider usage is accepted only when both bounded token counts are present', () => {
  assert.deepEqual(reportedModelTokenUsage({
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }, '@cf/google/gemma-4-26b-a4b-it'), { promptTokens: 100, completionTokens: 20 });
  assert.equal(reportedModelTokenUsage({ usage: { prompt_tokens: 100 } }, '@cf/google/gemma-4-26b-a4b-it'), undefined);
  assert.equal(reportedModelTokenUsage({ usage: { prompt_tokens: 0, completion_tokens: 1 } }, '@cf/google/gemma-4-26b-a4b-it'), undefined);
  assert.equal(reportedModelTokenUsage({
    usage: { prompt_tokens: 255_233, completion_tokens: 768 },
  }, '@cf/google/gemma-4-26b-a4b-it'), undefined);
});
