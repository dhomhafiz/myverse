export type EntrancePhase = 'loading' | 'ready' | 'entering' | 'exploring';
export type Readiness = 'initializing' | 'renderer' | 'compiling' | 'ready';
export type CameraMode = 'explore' | 'transition' | 'focus';
export const freeLook = { minYaw: -1.25, maxYaw: 0.75, minPitch: -0.34, maxPitch: 0.22, dragThreshold: 8 };
