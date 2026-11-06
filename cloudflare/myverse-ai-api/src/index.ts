import { MODEL } from './ai.ts';
import { createWorker } from './worker.ts';

export type { Bindings } from './worker.ts';
export default createWorker(MODEL);
