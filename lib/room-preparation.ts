export type RoomPreparationStatus = 'idle' | 'preloading' | 'assetsLoaded' | 'initializing' | 'sceneReady' | 'transitioning' | 'failed';
export const readinessGates = ['renderer', 'assets', 'objects', 'camera', 'shaders', 'frame'] as const;
export type ReadinessGate = typeof readinessGates[number];
export type RoomPreparationSnapshot = {
  status: RoomPreparationStatus;
  loaded: number;
  total: number;
  error: string | null;
  returnRequested: boolean;
  transitionComplete: boolean;
  attempt: number;
  gates: readonly ReadinessGate[];
};
const initialSnapshot: RoomPreparationSnapshot = {
  status: 'idle', loaded: 0, total: 0, error: null, returnRequested: false,
  transitionComplete: false, attempt: 0, gates: [],
};
export const preloadAssets = [
  '/models/pc-balanced.glb', '/models/gaming-chair-all-black-swivel-compact.glb',
  '/models/football-stars-compact.glb', '/models/v-guitar-black-white-longer.glb',
  '/models/v-guitar-black-lime-longer.glb', '/models/guitar-wall-two-spot-track-light.glb',
  '/models/gravel-white-black-unbranded-compact.glb', '/models/wooden-bike-stand.glb',
  '/models/mechanical-rgb-keyboard-optimized.glb', '/images/cycling-panel-left.webp',
  '/images/cycling-panel-center.webp', '/images/cycling-panel-right.webp',
];
let snapshot = initialSnapshot;
const listeners = new Set<() => void>();
const completedPreloads = new Set<string>();
let preloadStarted = false;

function diagnostic(event: string) {
  if (process.env.NODE_ENV !== 'development') return;
  console.debug('[room-preparation]', {
    event, attempt: snapshot.attempt, status: snapshot.status,
    returnRequested: snapshot.returnRequested,
    pending: readinessGates.filter(gate => !snapshot.gates.includes(gate)), error: snapshot.error,
  });
}
function publish(next: RoomPreparationSnapshot, event?: string) {
  snapshot = next;
  if (event) diagnostic(event);
  listeners.forEach(listener => listener());
}
function accepts(attempt: number) { return attempt === snapshot.attempt && snapshot.status !== 'failed'; }
function sceneIsReady() { return readinessGates.every(gate => snapshot.gates.includes(gate)); }
export function roomAssetPercent(state: RoomPreparationSnapshot) {
  return state.total > 0 ? Math.round(state.loaded / state.total * 100) : null;
}
export const roomPreparation = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  startPreloading() {
    if (preloadStarted || typeof document === 'undefined' || snapshot.status !== 'idle') return;
    preloadStarted = true;
    publish({ ...snapshot, status: 'preloading', total: preloadAssets.length }, 'preload-started');
    preloadAssets.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'prefetch'; link.href = href;
      link.onload = () => {
        completedPreloads.add(href);
        // Prefetch is a cache hint; it must never change a live scene's lifecycle or counters.
        if (!['preloading', 'assetsLoaded'].includes(snapshot.status) || snapshot.returnRequested || snapshot.gates.length) return;
        const loaded = completedPreloads.size;
        publish({ ...snapshot, loaded, status: loaded === preloadAssets.length ? 'assetsLoaded' : 'preloading' });
      };
      link.onerror = () => diagnostic('prefetch-unavailable-scene-will-retry');
      document.head.appendChild(link);
    });
  },
  beginReturn() {
    if (snapshot.returnRequested && snapshot.status !== 'failed') return;
    const retry = snapshot.status === 'failed';
    publish({ ...snapshot, status: !retry && sceneIsReady() ? 'sceneReady' : 'initializing',
      error: null, returnRequested: true, transitionComplete: false,
      attempt: snapshot.attempt + (retry ? 1 : 0), gates: retry ? [] : snapshot.gates,
      loaded: retry ? 0 : snapshot.loaded, total: retry ? 0 : snapshot.total,
    }, retry ? 'return-retry' : 'return-requested');
  },
  initialize(attempt: number) {
    if (!accepts(attempt) || sceneIsReady()) return;
    publish({ ...snapshot, status: 'initializing' }, 'room-initialization-started');
  },
  reportAssets(loaded: number, total: number, active: boolean, attempt = snapshot.attempt) {
    if (!accepts(attempt) || total <= 0 || sceneIsReady()) return;
    const safeLoaded = Math.max(0, Math.min(loaded, total));
    const settled = !active && safeLoaded === total;
    publish({ ...snapshot, loaded: safeLoaded, total, status: settled ? 'assetsLoaded' : 'initializing',
      gates: settled ? snapshot.gates : snapshot.gates.filter(gate => !['assets', 'shaders', 'frame'].includes(gate)),
    });
    if (settled) this.signal('assets', attempt);
  },
  signal(gate: ReadinessGate, attempt: number) {
    if (!accepts(attempt) || snapshot.gates.includes(gate)) return;
    publish({ ...snapshot, gates: [...snapshot.gates, gate] }, gate === 'renderer' ? 'canvas-mounted-renderer-initialized' : `${gate}-ready`);
  },
  markSceneReady(attempt: number) {
    if (!accepts(attempt) || !sceneIsReady() || ['sceneReady', 'transitioning'].includes(snapshot.status)) return;
    publish({ ...snapshot, status: 'sceneReady', error: null }, 'readiness-gates-satisfied');
  },
  beginTransition() {
    if (!snapshot.returnRequested || snapshot.status !== 'sceneReady' || !sceneIsReady()) return false;
    publish({ ...snapshot, status: 'transitioning', transitionComplete: false }, 'transition-authorized');
    return true;
  },
  markTransitionComplete() {
    if (!snapshot.returnRequested || snapshot.status !== 'transitioning' || snapshot.transitionComplete) return false;
    publish({ ...snapshot, transitionComplete: true }, 'transition-completed');
    return true;
  },
  cancelReturn(keepSceneReady = false) {
    const ready = keepSceneReady && sceneIsReady();
    const total = preloadStarted ? preloadAssets.length : 0;
    const loaded = completedPreloads.size;
    publish({ ...snapshot, status: ready ? 'sceneReady' : total === 0 ? 'idle' : loaded === total ? 'assetsLoaded' : 'preloading',
      loaded: ready ? snapshot.loaded : loaded, total: ready ? snapshot.total : total,
      gates: ready ? snapshot.gates : [], attempt: snapshot.attempt + (ready ? 0 : 1),
      returnRequested: false, transitionComplete: false, error: null,
    }, 'return-cancelled');
  },
  finishReturn() {
    if (!sceneIsReady()) return;
    publish({ ...snapshot, status: 'sceneReady', returnRequested: false, transitionComplete: false, error: null });
  },
  fail(error: Error, attempt = snapshot.attempt) {
    if (!accepts(attempt)) return;
    publish({ ...snapshot, status: 'failed', transitionComplete: false, error: error.message || 'Room initialization failed.' }, 'initialization-failed');
  },
};
export { initialSnapshot as initialRoomPreparationSnapshot };
