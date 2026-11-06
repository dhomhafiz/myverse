// Explicitly invoked local benchmark. Never imported by the app or routine tests.
/* global fetch */
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const candidate = process.argv[2];
if (!['qwen', 'llama'].includes(candidate)) throw new Error('Choose qwen or llama locally.');
const scenarios = [
  { message: 'Who is Hafiz, and what is his professional background?' },
  { message: 'Siapa Hafiz dan apakah kepakaran utama beliau?' },
  { message: 'What technologies did Hafiz use for the Netflix Squid Game 2 installation, and how does that differ from MyVerse?' },
  { message: 'Boleh terangkan pengalaman Hafiz dalam pembangunan backend dan teknologi yang pernah beliau gunakan?' },
  { message: 'Which of those does he use in MyVerse?', history: [
    { role: 'user', content: 'What technologies does Hafiz use?' },
    { role: 'assistant', content: 'Hafiz works with Java, Spring Boot, React, Next.js, TypeScript, Three.js and GSAP.' },
  ] },
  { message: 'How much does Hafiz charge for a 3D website, and can he start next Monday?' },
];
const file = '.wrangler/benchmark-results.json';
const fingerprint = () => createHash('sha256').update(
  ['src/prompts.ts', 'src/knowledge.ts', 'src/ai.ts', 'bench/worker.ts']
    .map(path => fs.readFileSync(path, 'utf8')).join('\n'),
).digest('hex');
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : { sourceHash: fingerprint(), scenarios, results: [] };
if (data.sourceHash !== fingerprint() || JSON.stringify(data.scenarios) !== JSON.stringify(scenarios)) {
  throw new Error('Source or scenarios changed; comparison is no longer identical.');
}
if (data.results.some(result => result.candidate === candidate)) throw new Error('Candidate already attempted; no retries.');
if (data.results.some(result => result.body?.error?.code === 'AI_QUOTA_EXCEEDED')) throw new Error('Quota exhausted; stop all inference.');
const last = data.results.at(-1);
if (last && Date.now() - Date.parse(last.completedAt ?? last.startedAt) < 65_000) {
  throw new Error('Wait at least 65 seconds after the previous batch; do not bypass the limiter.');
}
for (const [index, body] of scenarios.entries()) {
  if (data.results.length >= 12 || data.results.filter(result => result.candidate === candidate).length >= 6) {
    throw new Error('Inference budget reached.');
  }
  if (data.sourceHash !== fingerprint()) throw new Error('Source changed during benchmark.');
  // Journal before sending: even an interrupted or timed-out attempt cannot be
  // accidentally retried or disappear from the strict request budget.
  const result = { candidate, scenario: index + 1, startedAt: new Date().toISOString(), status: 'pending' };
  data.results.push(result);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  const start = performance.now();
  try {
    const response = await fetch('http://127.0.0.1:8787/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(22_000),
    });
    result.status = response.status;
    result.body = await response.json();
    result.metadata = JSON.parse(response.headers.get('X-Benchmark-Metadata') ?? '{}');
    if (result.metadata.candidate !== candidate) throw new Error('Wrong local candidate configuration.');
    const pair = data.results.find(item => item.candidate !== candidate && item.scenario === index + 1);
    if (pair && pair.metadata?.inputHash !== result.metadata.inputHash) throw new Error('Candidate input mismatch.');
  } catch {
    result.localFailure = true;
  } finally {
    result.latencyMs = Math.round(performance.now() - start);
    result.completedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  const disclosure = /VERIFIED PUBLIC PORTFOLIO KNOWLEDGE|Follow the language of the LATEST visitor/.test(result.body?.reply ?? '');
  console.log(JSON.stringify(disclosure ? { ...result, body: 'WITHHELD: possible prompt disclosure' } : result));
  if (result.localFailure || result.status !== 200 || result.body?.success !== true || disclosure) {
    throw new Error('Stopped after unsuccessful response; no automatic retries.');
  }
}
