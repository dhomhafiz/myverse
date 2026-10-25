import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Object3D } from 'three';
import { Box, Rod } from './Primitives';
import { room } from '@/lib/room-config';

function GuitarHanger() {
  return <group name="guitar_hanger" {...room.guitarHanger}>
    <Box position={[0, 0, 0]} size={[0.09, 0.12, 0.016]} color="#252a2d" />
    <Rod from={[0, 0, 0.005]} to={[0, 0, 0.12]} radius={0.009} color="#252a2d" />
    {[-1, 1].map(side => <group key={side}>
      <Rod from={[side * 0.022, 0, 0.12]} to={[side * 0.072, 0, 0.12]} radius={0.008} color="#252a2d" />
      <Rod from={[side * 0.072, 0, 0.12]} to={[side * 0.078, 0.034, 0.12]} radius={0.008} color="#252a2d" />
    </group>)}
  </group>;
}

function VShapedGuitar({ name, position, rotation, scale, lime }: {
  name: string; position: [number, number, number]; rotation: [number, number, number];
  scale: [number, number, number]; lime: boolean;
}) {
  const { scene: baseScene } = useGLTF('/models/v-guitar-black-white-longer.glb');
  const { scene: limeGraphic } = useGLTF('/models/v-guitar-black-lime-longer.glb');
  const guitarScene = useMemo(() => {
    const clone = baseScene.clone(true);
    if (lime) {
      const whiteGraphic = clone.getObjectByName('guitar_lime_graphics');
      if (!whiteGraphic) throw new Error('The longer V-guitar model is missing its color graphic.');
      whiteGraphic.visible = false;
    }
    return clone;
  }, [baseScene, lime]);

  return <group name={name} position={position} rotation={rotation} scale={scale}>
    <primitive object={guitarScene} />
    {lime && <primitive object={limeGraphic} />}
    <GuitarHanger />
  </group>;
}

export function Guitars() {
  return <group {...room.guitars} name="guitar_wall">
    <VShapedGuitar name="guitar_01" {...room.guitarV} lime={false} />
    <VShapedGuitar name="guitar_02" {...room.guitarSecond} lime />
  </group>;
}

export function GuitarTrackLight() {
  const { scene: trackLight } = useGLTF('/models/guitar-wall-two-spot-track-light.glb');
  const targets = useMemo(() => {
    const left = new Object3D();
    left.position.set(-0.23, -1.3, -0.3);
    const right = new Object3D();
    right.position.set(0.23, -1.3, -0.3);
    return [left, right];
  }, []);

  return <group {...room.guitarTrackLight} name="guitar_wall_track_light">
    <primitive object={trackLight} />
    {targets.map((target, index) => <primitive key={`target-${index}`} object={target} />)}
    {targets.map((target, index) => <spotLight
      key={`spot-${index}`}
      name={`guitar_track_spot_0${index + 1}`}
      position={[index === 0 ? -0.23 : 0.23, -0.187, -0.106]}
      target={target}
      color="#ffe1bb"
      intensity={3}
      distance={1.75}
      angle={0.42}
      penumbra={0.9}
      decay={2}
    />)}
  </group>;
}

export function Pegboard() {
  return <group {...room.pegboard} name="pegboard">
    <Box size={[1.1, 0.73, 0.045]} color="#25292c" />
    {Array.from({ length: 88 }, (_, i) => <Box key={i} position={[-0.48 + i % 11 * 0.096, -0.3 + Math.floor(i / 11) * 0.084, 0.026]} size={[0.013, 0.021, 0.005]} color="#60676b" />)}
    <group name="cap_01" position={[-0.28, 0.12, 0.09]}>
      <mesh scale={[1, 0.7, 1]}><sphereGeometry args={[0.11, 8, 6]} /><meshStandardMaterial color="#62665c" /></mesh>
      <Box position={[0, -0.06, 0.1]} size={[0.17, 0.015, 0.17]} color="#62665c" />
    </group>
    <group name="headphones" position={[0.28, -0.03, 0.09]}>
      <mesh><torusGeometry args={[0.115, 0.017, 6, 16, Math.PI]} /><meshStandardMaterial color="#8c8a81" /></mesh>
      {[-0.11, 0.11].map(x => <Box key={x} position={[x, -0.05, 0]} size={[0.055, 0.11, 0.07]} color="#171c20" />)}
    </group>
    <Box name="ps4_controller" position={[-0.05, -0.2, 0.08]} size={[0.18, 0.085, 0.07]} color="#8a8d8c" rotation={[0, 0, -0.1]} />
  </group>;
}

export function Bike() {
  const { scene: bikeScene } = useGLTF('/models/gravel-white-black-unbranded-compact.glb');
  const { scene: standScene } = useGLTF('/models/wooden-bike-stand.glb');
  return <group {...room.bike} name="gravel_bike">
    <group rotation={[0, 0, 0]}>
      <primitive object={bikeScene} />
    </group>
    <group {...room.bikeStand} name="bike_floor_stand">
      <primitive object={standScene} />
    </group>
  </group>;
}
