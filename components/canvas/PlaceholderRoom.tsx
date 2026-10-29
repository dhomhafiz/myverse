import { Box, Rod } from './Primitives';
import Workstation from './Workstation';
import { Barstool, Bike, GuitarTrackLight, Guitars, Pegboard } from './PersonalProps';
import CyclingTriptych from './CyclingTriptych';
import LeftWallFeature from './LeftWallFeature';
import InteractiveChair from './InteractiveChair';
import { cameraAnchors, room } from '@/lib/room-config';
import type { RefObject } from 'react';
import type { EntranceMotion } from '@/lib/entrance';

function Window() {
  return <group {...room.window} name="window">
    <Box size={[2.35, 1.65, 0.06]} color="#747a7b" />
    <Box position={[0, 0, 0.04]} size={[2.2, 1.5, 0.025]} color="#172b3d" emissive="#253d55" />
    <mesh position={[0.65, 0.4, 0.06]}><circleGeometry args={[0.13, 24]} /><meshBasicMaterial color="#c5d5d9" /></mesh>
    <Box position={[0, 0, 0.08]} size={[0.035, 1.5, 0.035]} color="#9da8aa" />
    <Box position={[0, -0.2, 0.08]} size={[2.2, 0.035, 0.035]} color="#9da8aa" />
    <group name="curtain">
      {[-1, 1].map(side => <group key={side} position={[side * 0.91, 0, 0.15]}>
        {Array.from({ length: 7 }, (_, i) => <Box key={i} position={[(i - 3) * 0.075, 0, i % 2 * 0.035]} size={[0.084, 1.9, 0.07]} color={i % 2 ? '#757a76' : '#94958a'} />)}
      </group>)}
    </group>
    <Rod from={[-1.35, 1, 0.14]} to={[1.35, 1, 0.14]} radius={0.025} />
  </group>;
}

export default function PlaceholderRoom({ chairActive, pcActive, reducedMotion, onGesture, motion }: {
  chairActive: boolean; pcActive: boolean; reducedMotion: boolean; onGesture: () => void;
  motion: RefObject<EntranceMotion>;
}) {
  const { width: w, depth: d, height: h } = room;
  return <group name="room_root">
    <Box name="room_floor" position={[0, -0.06, 0]} size={[w, 0.12, d]} color="#aca89d" />
    <Box name="wall_back" position={[0, h / 2, -d / 2 - 0.06]} size={[w, h, 0.12]} color="#686e6d" />
    <Box name="wall_right" position={[w / 2 + 0.06, h / 2, 0]} size={[0.12, h, d]} color="#777d79" />
    <Box name="wall_left" position={[-w / 2 - 0.06, h / 2, 0]} size={[0.12, h, d]} color="#717875" />
    <Box name="wall_front" position={[0, h / 2, d / 2 + 0.06]} size={[w, h, 0.12]} color="#717875" />
    <Box name="room_ceiling" position={[0, h + 0.06, 0]} size={[w, 0.12, d]} color="#6c7475" />
    {Array.from({ length: 9 }, (_, i) => <Box key={`x${i}`} position={[-w / 2 + i * 0.65, 0.002, 0]} size={[0.006, 0.003, d]} color="#8e918c" />)}
    {Array.from({ length: 8 }, (_, i) => <Box key={`z${i}`} position={[0, 0.002, -d / 2 + i * 0.65]} size={[w, 0.003, 0.006]} color="#8e918c" />)}
    <Box name="carpet" position={[0, 0.014, -0.7]} size={[3.3, 0.025, 2.55]} color="#4b5050" />
    <Box position={[0, 0.09, -d / 2 + 0.012]} size={[w, 0.18, 0.035]} color="#525b5b" />
    <Window /><Workstation active={pcActive} reducedMotion={reducedMotion} motion={motion} /><InteractiveChair active={chairActive} reducedMotion={reducedMotion} onGesture={onGesture} motion={motion} /><Guitars /><Barstool /><GuitarTrackLight /><LeftWallFeature /><Pegboard /><CyclingTriptych /><Bike />
    <group {...room.lamp} name="floor_lamp">
      <mesh position={[0, 0.03, 0]}><cylinderGeometry args={[0.18, 0.2, 0.06, 16]} /><meshStandardMaterial color="#282d30" /></mesh>
      <Rod from={[0, 0.03, 0]} to={[0, 2.1, 0]} radius={0.018} />
      <mesh position={[0, 2.12, 0]}><cylinderGeometry args={[0.24, 0.08, 0.13, 16]} /><meshStandardMaterial color="#e7c198" emissive="#f2ad5e" emissiveIntensity={0.7} /></mesh>
    </group>
    {Object.entries(cameraAnchors).map(([name, pose]) => <object3D key={name} name={name} position={pose.position} userData={{ lookAtTarget: pose.target }} />)}
  </group>;
}
