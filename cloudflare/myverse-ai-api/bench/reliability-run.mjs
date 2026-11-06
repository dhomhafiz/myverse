/* global fetch */
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const file = 'bench/reliability-2026-11-06.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const oldBenchmarkHash = () => hash(fs.readFileSync('bench/results-2026-11-06.json'));
const sourceHash = () => hash(['src/ai.ts', 'src/index.ts', 'src/validation.ts', 'src/prompts.ts', 'src/knowledge.ts', 'bench/worker.ts', 'bench/reliability-worker.ts']
  .map(path => fs.readFileSync(path, 'utf8')).join('\n'));
const identity = 'Who is Hafiz, and what is his professional background?';
const technologies = 'What technologies were used in MyVerse?';
const cases = {
  A: { candidate: 'llama', session: 'llama-1', condition: 'initial fresh local session', message: identity },
  B: { candidate: 'llama', session: 'llama-1', condition: 'subsequent same session', message: technologies },
  C: { candidate: 'llama', session: 'llama-1', condition: 'after at least 45 seconds without inference', message: 'Can Hafiz build interactive 3D websites?' },
  D: { candidate: 'llama', session: 'llama-2', condition: 'initial second fresh local session', message: identity },
  E1: { candidate: 'qwen', session: 'qwen-1', condition: 'initial Qwen reference', message: identity },
  E2: { candidate: 'qwen', session: 'qwen-1', condition: 'subsequent Qwen reference', message: technologies },
};
const action = process.argv[2];
if (action === 'prepare') {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', fs.readFileSync('wrangler.jsonc', 'utf8'));
  if (parsed.error) throw new Error('Invalid base configuration');
  for (const candidate of ['llama', 'qwen']) {
    const config = { ...parsed.config, main: '../bench/reliability-worker.ts', ai: { ...parsed.config.ai, remote: true }, vars: { ...parsed.config.vars, BENCHMARK_CANDIDATE: candidate } };
    delete config.$schema;
    fs.writeFileSync(`.wrangler/reliability-${candidate}.json`, JSON.stringify(config, null, 2) + '\n');
  }
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({
    phase: '4B.1C', date: '2026-11-06', timezone: 'Asia/Kuala_Lumpur',
    sourceHash: sourceHash(), previousBenchmarkSha256: oldBenchmarkHash(),
    preflight: JSON.parse(fs.readFileSync('.wrangler/reliability-preflight.json', 'utf8')),
    cases, results: [],
  }, null, 2) + '\n');
  console.log('Prepared local diagnostic configurations without resetting any result journal.');
} else if (action === 'skip-D') {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.results.length !== 3 || data.results.slice(-2).some(row => row.status !== 503)) throw new Error('Skip only after the documented repeated Llama failures.');
  data.skippedCases = [{ id: 'D', reason: 'Two consecutive Llama deadlines after initial success; sufficient evidence to stop Llama early rather than consume further quota.' }];
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('Optional second local Llama session skipped; no inference call made.');
} else {
  const item = cases[action];
  if (!item) throw new Error('Choose prepare, A, B, C, D, E1 or E2.');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.sourceHash !== sourceHash() || data.previousBenchmarkSha256 !== oldBenchmarkHash()) throw new Error('Source or original benchmark changed.');
  if (data.results.some(row => row.id === action)) throw new Error('This diagnostic case was already attempted; no automatic retries.');
  if (data.results.length >= 8 || data.results.filter(row => row.candidate === item.candidate).length >= (item.candidate === 'llama' ? 6 : 2)) throw new Error('Inference budget reached.');
  if (data.results.some(row => row.body?.error?.code === 'AI_QUOTA_EXCEEDED')) throw new Error('Quota failure; stop all inference.');
  const lastTwo = data.results.filter(row => row.candidate === item.candidate).slice(-2);
  if (lastTwo.length === 2 && lastTwo.every(row => row.status !== 200)) throw new Error('Repeated failures; stop this model.');
  if (data.results.filter(row => Date.now() - Date.parse(row.startedAt) < 60_000).length >= 6) throw new Error('Rate window full; wait.');
  const index = Object.keys(cases).filter(id => !data.skippedCases?.some(row => row.id === id)).indexOf(action);
  if (index !== data.results.length) throw new Error('Run the documented cases in order.');
  const last = data.results.at(-1);
  const idleMs = last ? Date.now() - Date.parse(last.completedAt) : null;
  if (action === 'C' && idleMs < 45_000) throw new Error('Documented idle interval not yet complete.');
  const result = { id: action, ...item, startedAt: new Date().toISOString(), sincePreviousResponseMs: idleMs, status: 'pending' };
  data.results.push(result);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  const start = performance.now();
  try {
    const response = await fetch('http://127.0.0.1:8787/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://www.dhomhafiz.dev' },
      body: JSON.stringify({ message: item.message }), signal: AbortSignal.timeout(22_000),
    });
    result.status = response.status;
    result.body = await response.json();
    result.totalLatencyMs = Math.round(performance.now() - start);
    result.responseReceivedAt = new Date().toISOString();
    result.metadata = JSON.parse(response.headers.get('X-Benchmark-Metadata') ?? '{}');
    result.traceAtResponse = JSON.parse(response.headers.get('X-Reliability-Timing') ?? '{}');
    if (result.metadata.candidate !== item.candidate) throw new Error('Wrong locally configured candidate');
    if (response.status !== 200) await new Promise(resolve => setTimeout(resolve, 1_000));
    const snapshot = await (await fetch('http://127.0.0.1:8787/__reliability/status')).json();
    result.traceAfterResponse = snapshot.traces.find(trace => trace.id === result.traceAtResponse.id);
    result.snapshotAt = new Date().toISOString();
  } catch {
    result.localDiagnosticFailure = true;
    result.totalLatencyMs ??= Math.round(performance.now() - start);
  } finally {
    result.completedAt = result.responseReceivedAt ?? new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  const disclosure = /VERIFIED PUBLIC PORTFOLIO KNOWLEDGE|Follow the language of the LATEST visitor/.test(result.body?.reply ?? '');
  console.log(JSON.stringify(disclosure ? { ...result, body: 'WITHHELD: possible prompt disclosure' } : result));
  if (disclosure || result.localDiagnosticFailure) throw new Error('Stop and inspect diagnostics before further calls.');
}
