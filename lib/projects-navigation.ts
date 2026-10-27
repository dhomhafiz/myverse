import type { Vec3 } from './room-config';
export type CameraPose = { position: Vec3; rotation: Vec3; fov: number };
export type ProjectCameraMode = 'explore' | 'opening' | 'paused' | 'returning';

let cameraMode: ProjectCameraMode = 'explore';
const modeListeners = new Set<() => void>();

export const projectsNavigation: {
  saved: CameraPose | null;
  visited: boolean;
  setMode: (mode: ProjectCameraMode) => void;
  getMode: () => ProjectCameraMode;
  subscribeMode: (listener: () => void) => () => void;
} = {
  saved: null,
  visited: false,
  setMode(mode) {
    if (cameraMode === mode) return;
    cameraMode = mode;
    modeListeners.forEach(listener => listener());
  },
  getMode: () => cameraMode,
  subscribeMode(listener) {
    modeListeners.add(listener);
    return () => modeListeners.delete(listener);
  },
};
