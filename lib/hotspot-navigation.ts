import type { Vec3 } from './room-config';

export type HotspotCameraPose = { position: Vec3; rotation: Vec3; fov: number };
export type HotspotNavigationMode = 'explore' | 'opening' | 'paused' | 'returning';

let navigationMode: HotspotNavigationMode = 'explore';
const modeListeners = new Set<() => void>();

export const hotspotNavigation: {
  saved: HotspotCameraPose | null;
  visited: boolean;
  destinationId: string | null;
  setMode: (mode: HotspotNavigationMode) => void;
  getMode: () => HotspotNavigationMode;
  subscribeMode: (listener: () => void) => () => void;
  setDestination: (destinationId: string) => void;
  open: (destinationId: string) => void;
} = {
  saved: null,
  visited: false,
  destinationId: null,
  setMode(mode) {
    if (navigationMode === mode) return;
    navigationMode = mode;
    modeListeners.forEach(listener => listener());
  },
  getMode: () => navigationMode,
  subscribeMode(listener) {
    modeListeners.add(listener);
    return () => modeListeners.delete(listener);
  },
  setDestination(destinationId) {
    this.destinationId = destinationId;
  },
  open(destinationId) {
    this.setDestination(destinationId);
    this.setMode('opening');
  },
};
