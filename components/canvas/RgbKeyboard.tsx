'use client';
import { useGLTF } from '@react-three/drei';

const MODEL_PATH = '/models/mechanical-rgb-keyboard-optimized.glb';

export default function RgbKeyboard({ position, scale }: { position: [number, number, number]; scale: number }) {
  const { scene } = useGLTF(MODEL_PATH);

  return (
    <group name="rgb_keyboard" position={position} scale={scale} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
