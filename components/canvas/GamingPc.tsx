'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { MathUtils, Object3D } from 'three';
import type { RefObject } from 'react';
import type { EntranceMotion } from '@/lib/entrance';
import { room } from '@/lib/room-config';

const MODEL_PATH = '/models/pc-balanced.glb';
const FRONT_ROTORS = ['Fan_Front_Bottom_Rotor', 'Fan_Front_Top_Rotor'];
const ADDITIONAL_ROTORS = ['Fan_Rear_Rotor', 'Fan_Top_1_Rotor', 'Fan_Top_2_Rotor', 'Fan_Top_3_Rotor'];
const ROTOR_SPEED_FACTORS = [0.98, 1.02, 0.96, 1.04, 1, 1.03];
const MAX_ROTATION_SPEED = 4.4;
const MAX_FRAME_DELTA = 0.05;

export default function GamingPc({
  active,
  reducedMotion,
  motion,
}: {
  active: boolean;
  reducedMotion: boolean;
  motion: RefObject<EntranceMotion>;
}) {
  const { scene } = useGLTF(MODEL_PATH);
  const rotors = useMemo(() => {
    const front = FRONT_ROTORS.map(name => {
      const rotor = scene.getObjectByName(name);
      if (!rotor) throw new Error(`The PC model is missing required fan rotor "${name}".`);
      return rotor;
    });
    const additional = ADDITIONAL_ROTORS
      .map(name => scene.getObjectByName(name))
      .filter((rotor): rotor is Object3D => rotor !== undefined);
    const nodes = [...front, ...additional];
    if (new Set(nodes).size !== nodes.length) throw new Error('PC fan rotor nodes must be independently controllable.');
    return nodes.map((node, index) => ({
      node,
      baseRotation: node.rotation.z,
      angle: 0,
      speed: 0,
      speedFactor: ROTOR_SPEED_FACTORS[index] ?? 1,
    }));
  }, [scene]);
  const pageVisible = useRef(true);

  useEffect(() => {
    const updateVisibility = () => {
      pageVisible.current = !document.hidden;
      if (pageVisible.current) motion.current.invalidate?.();
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [motion]);

  useEffect(() => () => {
    rotors.forEach(rotor => {
      rotor.node.rotation.z = rotor.baseRotation;
      rotor.angle = 0;
      rotor.speed = 0;
    });
  }, [rotors]);

  useFrame((_, unboundedDelta) => {
    if (!active || reducedMotion || !pageVisible.current) return;
    const delta = Math.min(unboundedDelta, MAX_FRAME_DELTA);
    const power = MathUtils.clamp(motion.current.lights.pc, 0, 1);
    const targetSpeed = MAX_ROTATION_SPEED * power;
    let moving = targetSpeed > 0.01;
    rotors.forEach(rotor => {
      rotor.speed = MathUtils.damp(rotor.speed, targetSpeed * rotor.speedFactor, 3.2, delta);
      if (rotor.speed > 0.01) {
        rotor.angle = (rotor.angle + rotor.speed * delta) % (Math.PI * 2);
        rotor.node.rotation.z = rotor.baseRotation + rotor.angle;
        moving = true;
      }
    });
    if (moving) motion.current.invalidate?.();
  });

  return (
    <group
      name="gaming_pc"
      position={room.gamingPc.position}
      rotation={room.gamingPc.rotation}
      scale={room.gamingPc.scale}
      dispose={null}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
