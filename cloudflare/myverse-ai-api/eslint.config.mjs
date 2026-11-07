import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['worker-configuration.d.ts', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: Object.fromEntries([
    'Request', 'Response', 'Headers', 'URL', 'TextDecoder', 'TextEncoder',
    'AbortSignal', 'AbortController', 'ReadableStream', 'setTimeout', 'clearTimeout', 'crypto',
  ].map(name => [name, 'readonly'])) } },
);
