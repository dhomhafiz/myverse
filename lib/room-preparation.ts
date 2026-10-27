export type RoomPreparationStatus =
  | 'idle'
  | 'preloading'
  | 'assetsLoaded'
  | 'initializing'
  | 'sceneReady'
  | 'transitioning'
  | 'failed';

export type RoomPreparationSnapshot = {
  status: RoomPreparationStatus;
  loaded: number;
  total: number;
  error: string | null;
  returnRequested: boolean;
  transitionComplete: boolean;
  attempt: number;
};

const initialSnapshot: RoomPreparationSnapshot = {
  status: 'idle',
  loaded: 0,
  total: 0,
  error: null,
  returnRequested: false,
  transitionComplete: false,
  attempt: 0,
};

const preloadAssets = [
  '/models/pc-balanced.glb',
  '/models/gaming-chair-all-black-swivel-compact.glb',
  '/models/football-stars-compact.glb',
  '/models/v-guitar-black-white-longer.glb',
  '/models/v-guitar-black-lime-longer.glb',
  '/models/guitar-wall-two-spot-track-light.glb',
  '/models/gravel-white-black-unbranded-compact.glb',
  '/models/wooden-bike-stand.glb',
  '/models/mechanical-rgb-keyboard-optimized.glb',
  '/images/cycling-panel-left.webp',
  '/images/cycling-panel-center.webp',
  '/images/cycling-panel-right.webp',
];

let snapshot = initialSnapshot;
const listeners = new Set<() => void>();
const completedPreloads = new Set<string>();
const failedPreloads = new Set<string>();
let preloadStarted = false;

function publish(next: RoomPreparationSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

export const roomPreparation = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  startPreloading() {
    if (preloadStarted || typeof document === 'undefined') return;
    preloadStarted = true;
    publish({ ...snapshot, status: 'preloading', total: preloadAssets.length });
    preloadAssets.forEach(href => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.onload = () => {
        if (completedPreloads.has(href) || failedPreloads.has(href)) return;
        completedPreloads.add(href);
        const loaded = completedPreloads.size;
        publish({
          ...snapshot,
          loaded,
          status: loaded === preloadAssets.length ? 'assetsLoaded' : 'preloading',
        });
      };
      link.onerror = () => {
        if (completedPreloads.has(href) || failedPreloads.has(href)) return;
        failedPreloads.add(href);
        console.warn(`Room asset prefetch was unavailable for ${href}; scene loading will retry on return.`);
        publish({ ...snapshot, loaded: completedPreloads.size, status: 'preloading' });
      };
      document.head.appendChild(link);
    });
  },
  beginReturn() {
    const retry = snapshot.status === 'failed';
    publish({
      ...snapshot,
      status: snapshot.status === 'sceneReady' ? 'transitioning' : 'initializing',
      error: null,
      returnRequested: true,
      transitionComplete: false,
      attempt: snapshot.attempt + (retry ? 1 : 0),
    });
  },
  reportAssets(loaded: number, total: number, active: boolean) {
    if (total <= 0) return;
    const safeLoaded = Math.max(0, Math.min(loaded, total));
    publish({
      ...snapshot,
      loaded: safeLoaded,
      total,
      status: !active && safeLoaded === total ? 'assetsLoaded' : 'initializing',
    });
  },
  markSceneReady() {
    publish({ ...snapshot, status: 'sceneReady', loaded: snapshot.total, error: null });
  },
  beginTransition() {
    publish({ ...snapshot, status: 'transitioning', returnRequested: true, transitionComplete: false, error: null });
  },
  markTransitionComplete() {
    publish({ ...snapshot, status: 'transitioning', returnRequested: true, transitionComplete: true });
  },
  cancelReturn(keepSceneReady = false) {
    if (keepSceneReady) {
      publish({ ...snapshot, status: 'sceneReady', returnRequested: false, transitionComplete: false, error: null });
      return;
    }
    const total = preloadStarted ? preloadAssets.length : 0;
    const loaded = preloadStarted ? completedPreloads.size : 0;
    const status = total === 0 ? 'idle' : loaded === total ? 'assetsLoaded' : 'preloading';
    publish({ ...snapshot, status, loaded, total, returnRequested: false, transitionComplete: false, error: null });
  },
  finishReturn() {
    publish({ ...snapshot, status: 'sceneReady', returnRequested: false, transitionComplete: false, error: null });
  },
  fail(error: Error) {
    publish({ ...snapshot, status: 'failed', transitionComplete: false, error: error.message || 'Room initialization failed.' });
  },
};

export { initialSnapshot as initialRoomPreparationSnapshot };
