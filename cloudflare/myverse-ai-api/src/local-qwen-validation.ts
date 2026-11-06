import { QWEN_MODEL } from './ai.ts';
import { createWorker, type LocalQwenDiagnostics } from './worker.ts';

export function createWorkerForLocalQwenValidation(diagnostics?: LocalQwenDiagnostics) {
  return createWorker(QWEN_MODEL, diagnostics);
}
