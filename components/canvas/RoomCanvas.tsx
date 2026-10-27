'use client';

import { useGLTF, useProgress } from '@react-three/drei';
import { preloadAssets } from '@/lib/room-preparation';
import { Canvas } from '@react-three/fiber';
import type { ReactNode, RefObject } from 'react';
import { PCFShadowMap } from 'three';
import type { HotspotNavigationMode } from '@/lib/hotspot-navigation';
import DestinationHotspots from './DestinationHotspots';
import CameraRig from './CameraRig';
import PlaceholderRoom from './PlaceholderRoom';
import type { ReadinessGate } from '@/lib/room-preparation';
import { room, type ReviewView } from '@/lib/room-config';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import SceneReadiness from './SceneReadiness';
import SceneLighting from './SceneLighting';
import type { EntranceMotion } from '@/lib/entrance';
import Football from './Football';

// Clear rejected loader promises before Retry; successful cached models stay untouched.
export function clearFailedRoomAssets() {
  const failed = useProgress.getState().errors;
  preloadAssets.filter(path => path.endsWith('.glb') && failed.some(error => String(error).includes(path)))
    .forEach(path => useGLTF.clear(path));
}

export default function RoomCanvas({ fallback, view, phase, reducedMotion, onReadiness, onProgress, onGate, motion, onGesture, onFailure, navigationMode, onNavigationSettled, onOpenDestination, directStart, directDestinationId, roomActive }: {
  directStart: boolean; directDestinationId: string; roomActive: boolean; navigationMode: HotspotNavigationMode;
  onNavigationSettled: () => void; onOpenDestination: (destinationId: string) => void;
  fallback: ReactNode; view: ReviewView; phase: EntrancePhase; reducedMotion: boolean;
  onReadiness: (stage: Readiness) => void; onProgress: (loaded: number, total: number, active: boolean) => void;
  onGate: (gate: ReadinessGate) => void;
  motion: RefObject<EntranceMotion>; onGesture: () => void; onFailure: (error?: Error) => void;
}) {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} frameloop="demand" fallback={fallback} onCreated={state => {
      Object.assign(motion.current, {
        invalidate: state.invalidate,
      });
      onGate('renderer');
      onReadiness('renderer');
    }}
      camera={{ position: room.home.position, fov: room.home.fov, near: 0.05, far: 35 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#20282c']} />
      <ambientLight name="room_ambient_light" intensity={0.65} color="#c3cfd5" />
      <hemisphereLight name="room_hemisphere_light" args={['#b9d7ef', '#75604a', 1.15]} />
      <directionalLight name="room_directional_light" position={[-2, 4, 1]} intensity={2.1} color="#e0e8ec" castShadow
        shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4}
        shadow-camera-top={4} shadow-camera-bottom={-4} shadow-bias={-0.001} />
      <CameraRig directStart={directStart} directDestinationId={directDestinationId} view={view} phase={phase} reducedMotion={reducedMotion} motion={motion} onGesture={onGesture} navigationMode={navigationMode} onNavigationSettled={onNavigationSettled} />
      <PlaceholderRoom chairActive={roomActive && phase === 'exploring' && navigationMode === 'explore'} pcActive={roomActive && (phase === 'entering' || (phase === 'exploring' && navigationMode === 'explore'))}
        reducedMotion={reducedMotion} onGesture={onGesture} motion={motion} />
      <DestinationHotspots reducedMotion={reducedMotion} active={roomActive && phase === 'exploring' && navigationMode === 'explore'} onOpen={onOpenDestination} />
      <Football active={roomActive && phase === 'exploring' && navigationMode === 'explore'} reducedMotion={reducedMotion} />
      <SceneLighting motion={motion} />
      <SceneReadiness onGate={onGate} onReadiness={onReadiness} onProgress={onProgress} onFailure={onFailure} />
    </Canvas>
  );
}
