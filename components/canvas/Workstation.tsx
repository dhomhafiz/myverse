import { Box, Rod } from './Primitives';
import GamingPc from './GamingPc';
import RgbKeyboard from './RgbKeyboard';
import GamingMouse from './GamingMouse';
import { phone, room } from '@/lib/room-config';
import type { RefObject } from 'react';
import type { EntranceMotion } from '@/lib/entrance';

function Monitor({ name, x, yaw }: { name: string; x: number; yaw: number }) {
  return <group name={name} position={[x, 1.29, -0.07]} rotation={[0, yaw, 0]}>
    <Box size={[0.87, 0.51, 0.045]} color="#14191d" />
    <Box position={[0, 0, 0.025]} size={[0.81, 0.455, 0.009]} color="#172b40" emissive="#245078" />
    <Box position={[-0.31, 0, 0.032]} size={[0.12, 0.41, 0.003]} color="#21394c" />
    {Array.from({ length: 12 }, (_, i) => <Box key={i} position={[-0.05 + (i % 3) * 0.025, 0.175 - i * 0.029, 0.034]}
      size={[0.26 + (i % 4) * 0.06, 0.006, 0.003]} color={['#86b9c5', '#c3a67d', '#6e8b9b'][i % 3]} />)}
    <object3D name={name === 'monitor_left' ? 'screen_left_anchor' : 'screen_right_anchor'} position={[0, 0, 0.04]} />
  </group>;
}

export default function Workstation({ active, reducedMotion, motion }: {
  active: boolean; reducedMotion: boolean; motion: RefObject<EntranceMotion>;
}) {
  return <group {...room.desk} name="workstation">
    <Box name="desk_main" position={[0, 0.76, 0]} size={[3.05, 0.07, 0.84]} color="#c1a27b" />
    <Box name="desk_side" position={[1.25, 0.76, 0.98]} size={[0.55, 0.07, 1.12]} color="#c1a27b" />
    {[-1.38, 1.38].map(x => <group key={x}>
      <Box position={[x, 0.37, -0.31]} size={[0.045, 0.74, 0.045]} color="#25282a" />
      <Box position={[x, 0.37, 0.31]} size={[0.045, 0.74, 0.045]} color="#25282a" />
      <Box position={[x, 0.1, 0]} size={[0.045, 0.045, 0.65]} color="#25282a" />
    </group>)}
    <Box position={[1.45, 0.37, 1.43]} size={[0.045, 0.74, 0.045]} color="#25282a" />
    <group name="monitor_arm">
      <Rod from={[-0.92, 0.79, -0.3]} to={[-0.92, 1.4, -0.3]} radius={0.025} />
      <Rod from={[-0.92, 1.26, -0.3]} to={[0.3, 1.26, -0.14]} radius={0.022} />
    </group>
    <Monitor name="monitor_left" x={-0.66} yaw={0.13} />
    <Monitor name="monitor_right" x={0.25} yaw={-0.12} />
    <Box name="mousepad" position={[-0.23, 0.803, 0.19]} size={[1.1, 0.012, 0.38]} color="#24282c" />
    <RgbKeyboard position={[-0.42, 0.809, 0.2]} scale={1.3} />
    <GamingMouse position={[0.2, 0.797, 0.23]} />
    <GamingPc active={active} reducedMotion={reducedMotion} motion={motion} />
    <group name={phone.name} position={phone.position} rotation={phone.rotation} scale={phone.scale} userData={{ destination: 'contact' }}>
      {/* Centre pivot is reserved for a future lift-then-flip; nothing animates yet. */}
      <group name={phone.flipPivotName}>
        <Box size={[0.08, 0.16, 0.013]} color="#787e82" />
        <Box position={[0, 0, 0.008]} size={[0.071, 0.15, 0.003]} color="#141a20" />
        <Box position={[0, 0, -0.0075]} size={[0.074, 0.153, 0.002]} color="#a9acae" />
        <Box name="iphone_rear_camera_module" position={[-0.017, 0.045, -0.0115]} size={[0.041, 0.045, 0.006]} color="#8b9195" />
        {([[-0.028, 0.059], [-0.008, 0.046], [-0.028, 0.033]] as const).map(([x, y], index) => <group key={index} name={`iphone_rear_lens_${index + 1}`}>
          <mesh position={[x, y, -0.0165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.0075, 0.0075, 0.004, 16]} /><meshStandardMaterial color="#555e66" metalness={0.55} roughness={0.3} />
          </mesh>
          <mesh position={[x, y, -0.0186]} rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.0058, 16]} /><meshStandardMaterial color="#111c28" roughness={0.18} metalness={0.3} />
          </mesh>
        </group>)}
        <mesh name="iphone_rear_flash" position={[-0.004, 0.061, -0.0147]} rotation={[0, Math.PI, 0]}>
          <circleGeometry args={[0.003, 12]} /><meshStandardMaterial color="#e5dec9" />
        </mesh>
        <object3D name={phone.contactAnchor.name} position={phone.contactAnchor.position} />
      </group>
    </group>
    <Box name="audio_interface" position={[0.69, 0.825, -0.1]} size={[0.16, 0.06, 0.12]} color="#765047" />
    <group name="plant_small" position={[0.62, 0.84, -0.25]}>
      <mesh><cylinderGeometry args={[0.065, 0.05, 0.1, 8]} /><meshStandardMaterial color="#b3aca0" /></mesh>
      <mesh position={[0, 0.12, 0]}><icosahedronGeometry args={[0.12, 0]} /><meshStandardMaterial color="#607563" /></mesh>
    </group>
  </group>;
}
