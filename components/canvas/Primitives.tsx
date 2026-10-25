import { Quaternion, Vector3 } from 'three';
import type { Vec3 } from '@/lib/room-config';

type BoxProps = { name?: string; position?: Vec3; size: Vec3; color: string; rotation?: Vec3; emissive?: string };

export function Box({ name, position, size, color, rotation, emissive }: BoxProps) {
  return <mesh name={name} position={position} rotation={rotation} castShadow receiveShadow>
    <boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.76} emissive={emissive} emissiveIntensity={0.5} />
  </mesh>;
}

export function Rod({ from, to, radius = 0.02, color = '#24272b' }: { from: Vec3; to: Vec3; radius?: number; color?: string }) {
  const start = new Vector3(...from), end = new Vector3(...to);
  const direction = end.clone().sub(start);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  return <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={quaternion} castShadow>
    <cylinderGeometry args={[radius, radius, direction.length(), 8]} /><meshStandardMaterial color={color} roughness={0.6} />
  </mesh>;
}

