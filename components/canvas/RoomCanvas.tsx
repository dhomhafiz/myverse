'use client';

import { Canvas } from '@react-three/fiber';
import type { ReactNode, RefObject } from 'react';
import { PCFShadowMap } from 'three';
import type { ProjectCameraMode } from '@/lib/projects-navigation';
import ProjectsHotspot from './ProjectsHotspot';
import CameraRig from './CameraRig';
import PlaceholderRoom from './PlaceholderRoom';
import { room, type ReviewView } from '@/lib/room-config';
import type { EntrancePhase, Readiness } from '@/lib/room-state';
import SceneReadiness from './SceneReadiness';
import SceneLighting from './SceneLighting';
import type { EntranceMotion } from '@/lib/entrance';
import Football from './Football';

export default function RoomCanvas({ fallback, view, phase, reducedMotion, onReadiness, onProgress, motion, onGesture, onFailure, projectMode, onProjectSettled, onOpenProjects, directStart, roomActive }: {
  directStart: boolean; roomActive: boolean; projectMode: ProjectCameraMode; onProjectSettled: () => void; onOpenProjects: () => void;
  fallback: ReactNode; view: ReviewView; phase: EntrancePhase; reducedMotion: boolean;
  onReadiness: (stage: Readiness) => void; onProgress: (loaded: number, total: number, active: boolean) => void;
  motion: RefObject<EntranceMotion>; onGesture: () => void; onFailure: (error?: Error) => void;
}) {
  return (
    <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} frameloop="demand" fallback={fallback} onCreated={state => {
      Object.assign(motion.current, {
        invalidate: state.invalidate,
      });
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
      <CameraRig directStart={directStart} view={view} phase={phase} reducedMotion={reducedMotion} motion={motion} onGesture={onGesture} projectMode={projectMode} onProjectSettled={onProjectSettled} />
      <PlaceholderRoom chairActive={roomActive && phase === 'exploring' && projectMode === 'explore'} pcActive={roomActive && (phase === 'entering' || (phase === 'exploring' && projectMode === 'explore'))}
        reducedMotion={reducedMotion} onGesture={onGesture} motion={motion} />
      <ProjectsHotspot reducedMotion={reducedMotion} active={roomActive && phase === 'exploring' && projectMode === 'explore'} onOpen={onOpenProjects} />
      <Football active={roomActive && phase === 'exploring' && projectMode === 'explore'} reducedMotion={reducedMotion} />
      <SceneLighting motion={motion} />
      <SceneReadiness onReadiness={onReadiness} onProgress={onProgress} onFailure={onFailure} />
    </Canvas>
  );
}
