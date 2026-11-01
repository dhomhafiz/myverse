'use client';

import { useSyncExternalStore } from 'react';
import { useProgress } from '@react-three/drei';

type LoadingState = ReturnType<typeof useProgress.getState>;
export type AssetTelemetrySample = {
  sequence: number;
  loaded: number;
  total: number;
  elapsedMs: number | null;
};
type AssetTelemetrySnapshot = {
  active: boolean;
  loaded: number;
  total: number;
  samples: readonly AssetTelemetrySample[];
};

const emptySamples: readonly AssetTelemetrySample[] = [];
const emptySnapshot: AssetTelemetrySnapshot = { active: false, loaded: 0, total: 0, samples: emptySamples };
const maxSamples = 64;
const telemetryListeners = new Set<() => void>();
let sequence = 0;
let startedAt: number | null = null;
let lastLoadingState: LoadingState = useProgress.getState();
let samples = emptySamples;

if (typeof window !== 'undefined' && lastLoadingState.total > 0) {
  samples = [{
    sequence: ++sequence,
    loaded: lastLoadingState.loaded,
    total: lastLoadingState.total,
    elapsedMs: null,
  }];
}

let snapshot: AssetTelemetrySnapshot = typeof window === 'undefined'
  ? emptySnapshot
  : { active: lastLoadingState.active, loaded: lastLoadingState.loaded, total: lastLoadingState.total, samples };

if (typeof window !== 'undefined') {
  useProgress.subscribe(state => {
    const previous = lastLoadingState;
    lastLoadingState = state;
    const countsChanged = state.loaded !== previous.loaded || state.total !== previous.total;
    if (countsChanged) {
      const now = performance.now();
      if (samples.length === 0 && state.active && !previous.active) startedAt = now;
      const sample: AssetTelemetrySample = {
        sequence: ++sequence,
        loaded: state.loaded,
        total: state.total,
        elapsedMs: startedAt === null ? null : now - startedAt,
      };
      samples = [...samples, sample].slice(-maxSamples);
    }
    if (!countsChanged && state.active === snapshot.active) return;
    snapshot = { active: state.active, loaded: state.loaded, total: state.total, samples };
    telemetryListeners.forEach(listener => listener());
  });
}

function subscribe(listener: () => void) {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return emptySnapshot;
}

export default function useAssetTelemetry() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
