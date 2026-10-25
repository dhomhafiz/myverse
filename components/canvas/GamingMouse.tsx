import type { Vec3 } from '@/lib/room-config';

export default function GamingMouse({ position }: { position: Vec3 }) {
  return (
    <group name="gaming_mouse" position={position}>
      <mesh position={[0, 0.025, 0]} scale={[0.041, 0.025, 0.066]} castShadow receiveShadow>
        <sphereGeometry args={[1, 20, 12]} />
        <meshStandardMaterial color="#171a1e" roughness={0.58} metalness={0.12} />
      </mesh>
      {([-1, 1] as const).map(side => (
        <mesh key={side} position={[side * 0.012, 0.049, -0.019]} scale={[0.011, 0.003, 0.036]} castShadow>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color="#2a2f34" roughness={0.52} />
        </mesh>
      ))}
      <mesh position={[0, 0.048, -0.003]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.018, 12]} />
        <meshStandardMaterial color="#090d11" roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.048, -0.003]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.006, 0.0015, 5, 16]} />
        <meshStandardMaterial color="#54d8ea" emissive="#26bcd1" emissiveIntensity={1.25} roughness={0.32} />
      </mesh>
      {([-1, 1] as const).map((side, index) => (
        <mesh key={side} position={[side * 0.041, 0.019, 0.012]}>
          <boxGeometry args={[0.0025, 0.003, 0.052]} />
          <meshStandardMaterial
            color={index === 0 ? '#35bfd0' : '#8d6bcb'}
            emissive={index === 0 ? '#24b8ca' : '#7650bd'}
            emissiveIntensity={0.8}
            roughness={0.4}
          />
        </mesh>
      ))}
      <mesh position={[-0.038, 0.033, -0.005]} rotation={[0, 0, -0.12]}>
        <boxGeometry args={[0.005, 0.006, 0.014]} />
        <meshStandardMaterial color="#30353a" roughness={0.5} />
      </mesh>
    </group>
  );
}
