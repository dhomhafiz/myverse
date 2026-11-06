// Prepare loopback-only experiment configs; never reset the request journal.
import fs from 'node:fs';
import ts from 'typescript';

const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', fs.readFileSync('wrangler.jsonc', 'utf8'));
if (parsed.error) throw new Error('Invalid base Wrangler configuration');
fs.mkdirSync('.wrangler', { recursive: true });
for (const candidate of ['qwen', 'llama']) {
  const config = {
    ...parsed.config,
    main: '../bench/worker.ts',
    ai: { ...parsed.config.ai, remote: true },
    vars: { ...parsed.config.vars, BENCHMARK_CANDIDATE: candidate },
  };
  delete config.$schema;
  fs.writeFileSync(`.wrangler/benchmark-${candidate}.json`, JSON.stringify(config, null, 2) + '\n');
}
