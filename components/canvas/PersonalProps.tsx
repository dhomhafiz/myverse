import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { Box, Rod } from './Primitives';
import { room, type Vec3 } from '@/lib/room-config';

function capCrownPoint(angle: number, height: number, offset = 0): Vec3 {
  const radius = Math.pow(Math.max(0.035, Math.cos(height * Math.PI / 2)), 0.62);
  const panelShape = 1 + 0.018 * Math.cos(angle * 3) * Math.sin(height * Math.PI);
  return [
    0.086 * radius * panelShape * Math.sin(angle) * (1 + offset),
    -0.012 + 0.126 * Math.sin(height * Math.PI / 2),
    0.003 * height + 0.077 * radius * panelShape * Math.cos(angle) * (1 + offset),
  ];
}

function createCapCrownGeometry() {
  const angularSegments = 36, heightSegments = 16;
  const positions: number[] = [], indices: number[] = [];
  for (let y = 0; y <= heightSegments; y++) {
    const height = y / heightSegments;
    for (let x = 0; x <= angularSegments; x++) {
      positions.push(...capCrownPoint(x / angularSegments * Math.PI * 2, height));
    }
  }
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < angularSegments; x++) {
      const current = y * (angularSegments + 1) + x;
      const next = current + angularSegments + 1;
      indices.push(current, next, current + 1, next, next + 1, current + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function capBrimPoint(width: number, depth: number, underside = false): Vec3 {
  const x = width;
  const z = 0.046 + 0.116 * Math.sqrt(Math.max(0, 1 - width * width)) * depth;
  const y = -0.014 - 0.017 * width * width - 0.022 * depth * depth - (underside ? 0.004 : 0);
  return [x * 0.108, y, z];
}

function createCapBrimGeometry(underside = false) {
  const widthSegments = 26, depthSegments = 12;
  const positions: number[] = [], indices: number[] = [];
  for (let z = 0; z <= depthSegments; z++) {
    for (let x = 0; x <= widthSegments; x++) {
      positions.push(...capBrimPoint(x / widthSegments * 2 - 1, z / depthSegments, underside));
    }
  }
  for (let z = 0; z < depthSegments; z++) {
    for (let x = 0; x < widthSegments; x++) {
      const current = z * (widthSegments + 1) + x;
      const next = current + widthSegments + 1;
      indices.push(current, current + 1, next, current + 1, next + 1, next);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCapStitchGeometry() {
  const positions: number[] = [];
  for (let panel = 0; panel < 6; panel++) {
    const angle = panel * Math.PI / 3;
    for (let step = 0; step < 16; step++) {
      const start = capCrownPoint(angle, 0.08 + step / 16 * 0.82, 0.012);
      const end = capCrownPoint(angle, 0.08 + (step + 1) / 16 * 0.82, 0.012);
      positions.push(...start, ...end);
    }
  }
  for (const depth of [0.82, 0.89]) {
    for (let step = 0; step < 30; step++) {
      const start = capBrimPoint(-0.88 + step / 30 * 1.76, depth);
      const end = capBrimPoint(-0.88 + (step + 1) / 30 * 1.76, depth);
      positions.push(start[0], start[1] + 0.001, start[2], end[0], end[1] + 0.001, end[2]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

type PropTransform = { position: Vec3; rotation?: Vec3; scale?: Vec3 };

function InstancedPropMeshes({ name, geometry, material, transforms }: {
  name: string; geometry: BufferGeometry; material: MeshStandardMaterial; transforms: PropTransform[];
}) {
  const instances = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!instances.current) return;
    const object = new Object3D();
    transforms.forEach((transform, index) => {
      object.position.set(...transform.position);
      object.rotation.set(...(transform.rotation ?? [0, 0, 0]));
      object.scale.set(...(transform.scale ?? [1, 1, 1]));
      object.updateMatrix();
      instances.current?.setMatrixAt(index, object.matrix);
    });
    instances.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);
  return <instancedMesh ref={instances} name={name} args={[geometry, material, transforms.length]} castShadow receiveShadow />;
}

function useDisposeOnUnmount(resources: { dispose: () => void }[]) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) resources.forEach(resource => resource.dispose());
      });
    };
  }, [resources]);
}

function PegHook({ name, basePosition, tipPosition, geometry }: {
  name: string; basePosition: Vec3; tipPosition: Vec3; geometry: TubeGeometry;
}) {
  return <group name={name}>
    <mesh position={basePosition} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.014, 0.014, 0.01, 12]} />
      <meshStandardMaterial color="#353b3e" roughness={0.48} metalness={0.58} />
    </mesh>
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#454b4d" roughness={0.42} metalness={0.62} />
    </mesh>
    <mesh position={tipPosition} castShadow>
      <sphereGeometry args={[0.006, 8, 6]} />
      <meshStandardMaterial color="#555b5d" roughness={0.4} metalness={0.6} />
    </mesh>
  </group>;
}

function ProceduralCap() {
  const crown = useMemo(() => createCapCrownGeometry(), []);
  const brim = useMemo(() => createCapBrimGeometry(), []);
  const underside = useMemo(() => createCapBrimGeometry(true), []);
  const stitch = useMemo(() => createCapStitchGeometry(), []);
  const brimEdge = useMemo(() => {
    const points = Array.from({ length: 25 }, (_, step) => {
      const width = -1 + step / 12;
      const point = capBrimPoint(width, 1);
      return new Vector3(point[0], point[1], point[2]);
    });
    return new TubeGeometry(new CatmullRomCurve3(points), 24, 0.0022, 5, false);
  }, []);
  const ventsGeometry = useMemo(() => new TorusGeometry(0.003, 0.0006, 4, 8), []);
  const ventsMaterial = useMemo(() => new MeshStandardMaterial({ color: '#111516', roughness: 0.9, metalness: 0.02 }), []);
  const vents = useMemo<PropTransform[]>(() => Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3;
    const position = capCrownPoint(angle, 0.56, 0.006);
    const normal = new Vector3(0.61 * Math.sin(angle), 0.78, 0.61 * Math.cos(angle)).normalize();
    const orientation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal));
    return { position, rotation: [orientation.x, orientation.y, orientation.z] };
  }), []);
  const hookPoints = useMemo<Vec3[]>(() => [
    [0, 0, -0.091], [0, 0.012, -0.03], [0, 0.045, 0.025],
    [0, 0.075, 0.033], [0, 0.105, 0.038],
  ], []);
  const hook = useMemo(() => new TubeGeometry(new CatmullRomCurve3(hookPoints.map(point => new Vector3(...point))), 36, 0.006, 7, false), [hookPoints]);
  const resources = useMemo(() => [crown, brim, underside, stitch, brimEdge, ventsGeometry, ventsMaterial, hook], [brim, brimEdge, crown, hook, stitch, underside, ventsGeometry, ventsMaterial]);
  useDisposeOnUnmount(resources);

  return <group name="procedural_baseball_cap">
    <mesh geometry={crown} castShadow receiveShadow>
      <meshStandardMaterial color="#292b2a" roughness={0.9} metalness={0.015} side={DoubleSide} />
    </mesh>
    <mesh geometry={brim} castShadow receiveShadow>
      <meshStandardMaterial color="#292b2a" roughness={0.88} metalness={0.015} side={DoubleSide} />
    </mesh>
    <mesh geometry={underside} castShadow receiveShadow>
      <meshStandardMaterial color="#171a1a" roughness={0.93} side={DoubleSide} />
    </mesh>
    <mesh geometry={brimEdge} castShadow>
      <meshStandardMaterial color="#414341" roughness={0.86} />
    </mesh>
    <lineSegments geometry={stitch}>
      <lineBasicMaterial color="#545652" transparent opacity={0.72} />
    </lineSegments>
    <mesh position={[0, -0.014, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.93, 1]} castShadow>
      <torusGeometry args={[0.078, 0.0032, 5, 36]} />
      <meshStandardMaterial color="#202322" roughness={0.91} />
    </mesh>
    <mesh position={[0, 0.116, 0.003]} scale={[0.009, 0.0055, 0.009]} castShadow>
      <sphereGeometry args={[1, 10, 7]} />
      <meshStandardMaterial color="#343735" roughness={0.88} />
    </mesh>
    <InstancedPropMeshes name="cap_vent_eyelets" geometry={ventsGeometry} material={ventsMaterial} transforms={vents} />
    <PegHook name="cap_mount_hook" basePosition={hookPoints[0]} tipPosition={hookPoints[hookPoints.length - 1]} geometry={hook} />
  </group>;
}

function ProceduralHeadphones() {
  const band = useMemo(() => {
    const points = [
      new Vector3(-0.103, -0.056, 0.048), new Vector3(-0.102, 0.016, 0.048), new Vector3(-0.084, 0.086, 0.048),
      new Vector3(-0.047, 0.132, 0.048), new Vector3(0, 0.15, 0.048), new Vector3(0.047, 0.132, 0.048),
      new Vector3(0.084, 0.086, 0.048), new Vector3(0.102, 0.016, 0.048), new Vector3(0.103, -0.056, 0.048),
    ];
    return new TubeGeometry(new CatmullRomCurve3(points), 42, 0.014, 8, false);
  }, []);
  const padding = useMemo(() => {
    const points = [
      new Vector3(-0.098, -0.052, 0.034), new Vector3(-0.097, 0.016, 0.034), new Vector3(-0.08, 0.082, 0.034),
      new Vector3(-0.045, 0.12, 0.034), new Vector3(0, 0.135, 0.034), new Vector3(0.045, 0.12, 0.034),
      new Vector3(0.08, 0.082, 0.034), new Vector3(0.097, 0.016, 0.034), new Vector3(0.098, -0.052, 0.034),
    ];
    return new TubeGeometry(new CatmullRomCurve3(points), 40, 0.009, 7, false);
  }, []);
  const cupShellGeometry = useMemo(() => new SphereGeometry(1, 24, 16), []);
  const faceGeometry = useMemo(() => new SphereGeometry(1, 20, 14), []);
  const cushionGeometry = useMemo(() => new TorusGeometry(0.031, 0.008, 8, 28), []);
  const earOpeningGeometry = useMemo(() => new SphereGeometry(1, 16, 10), []);
  const hingeGeometry = useMemo(() => new CylinderGeometry(0.008, 0.008, 0.008, 10), []);
  const materials = useMemo(() => ({
    shell: new MeshStandardMaterial({ color: '#191d1f', roughness: 0.38, metalness: 0.12 }),
    face: new MeshStandardMaterial({ color: '#252a2c', roughness: 0.46, metalness: 0.16 }),
    cushion: new MeshStandardMaterial({ color: '#252729', roughness: 0.72, metalness: 0.02 }),
    opening: new MeshStandardMaterial({ color: '#101213', roughness: 0.95, metalness: 0 }),
    hinge: new MeshStandardMaterial({ color: '#464d50', roughness: 0.4, metalness: 0.68 }),
  }), []);
  const cups = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.103, -0.07, 0.045] as Vec3,
    scale: [0.039, 0.054, 0.029] as Vec3,
    rotation: [0, 0, side * -0.035] as Vec3,
  })), []);
  const faceplates = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.103, -0.07, 0.071] as Vec3,
    scale: [0.032, 0.045, 0.01] as Vec3,
    rotation: [0, 0, side * -0.035] as Vec3,
  })), []);
  const cushions = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.103, -0.07, 0.077] as Vec3,
    scale: [1, 1.4, 0.88] as Vec3,
  })), []);
  const openings = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.103, -0.07, 0.078] as Vec3,
    scale: [0.022, 0.032, 0.004] as Vec3,
  })), []);
  const hinges = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.108, -0.018, 0.052] as Vec3,
    rotation: [Math.PI / 2, 0, 0] as Vec3,
  })), []);
  const yokes = useMemo(() => [-1, 1].map(side => new TubeGeometry(new CatmullRomCurve3([
    new Vector3(side * 0.098, 0.014, 0.048),
    new Vector3(side * 0.11, -0.002, 0.05),
    new Vector3(side * 0.116, -0.032, 0.055),
    new Vector3(side * 0.112, -0.054, 0.061),
  ]), 20, 0.0042, 6, false)), []);
  const hook = useMemo(() => new TubeGeometry(new CatmullRomCurve3([
    new Vector3(0, 0, -0.091), new Vector3(0, 0.015, -0.03), new Vector3(0, 0.05, 0.025),
    new Vector3(0, 0.095, 0.043), new Vector3(0, 0.135, 0.048),
  ]), 36, 0.006, 7, false), []);
  const resources = useMemo(() => [
    band, padding, cupShellGeometry, faceGeometry, cushionGeometry, earOpeningGeometry, hingeGeometry,
    ...yokes, hook, ...Object.values(materials),
  ], [band, cushionGeometry, cupShellGeometry, earOpeningGeometry, faceGeometry, hingeGeometry, hook, materials, padding, yokes]);
  useDisposeOnUnmount(resources);

  return <group name="procedural_over_ear_headphones">
    <mesh geometry={band} castShadow receiveShadow>
      <meshStandardMaterial color="#202426" roughness={0.42} metalness={0.12} />
    </mesh>
    <mesh geometry={padding} castShadow receiveShadow>
      <meshStandardMaterial color="#292b2c" roughness={0.76} metalness={0.01} />
    </mesh>
    <InstancedPropMeshes name="headphone_cup_shells" geometry={cupShellGeometry} material={materials.shell} transforms={cups} />
    <InstancedPropMeshes name="headphone_outer_faceplates" geometry={faceGeometry} material={materials.face} transforms={faceplates} />
    <InstancedPropMeshes name="headphone_ear_cushions" geometry={cushionGeometry} material={materials.cushion} transforms={cushions} />
    <InstancedPropMeshes name="headphone_ear_openings" geometry={earOpeningGeometry} material={materials.opening} transforms={openings} />
    <InstancedPropMeshes name="headphone_hinges" geometry={hingeGeometry} material={materials.hinge} transforms={hinges} />
    {yokes.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#3f4649" roughness={0.43} metalness={0.64} />
    </mesh>)}
    <PegHook name="headphone_mount_hook" basePosition={[0, 0, -0.091]} tipPosition={[0, 0.135, 0.048]} geometry={hook} />
  </group>;
}

function createControllerShellGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.06, 0.06);
  shape.bezierCurveTo(-0.12, 0.07, -0.15, 0.048, -0.153, 0.015);
  shape.bezierCurveTo(-0.16, -0.024, -0.15, -0.078, -0.127, -0.099);
  shape.bezierCurveTo(-0.109, -0.116, -0.081, -0.106, -0.064, -0.075);
  shape.bezierCurveTo(-0.045, -0.042, -0.03, -0.025, 0, -0.024);
  shape.bezierCurveTo(0.03, -0.025, 0.045, -0.042, 0.064, -0.075);
  shape.bezierCurveTo(0.081, -0.106, 0.109, -0.116, 0.127, -0.099);
  shape.bezierCurveTo(0.15, -0.078, 0.16, -0.024, 0.153, 0.015);
  shape.bezierCurveTo(0.15, 0.048, 0.12, 0.07, 0.06, 0.06);
  shape.bezierCurveTo(0.03, 0.055, 0.02, 0.048, 0, 0.048);
  shape.bezierCurveTo(-0.02, 0.048, -0.03, 0.055, -0.06, 0.06);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.034,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.003,
    bevelSegments: 1,
    curveSegments: 8,
    steps: 1,
  });
  geometry.translate(0, 0, -0.017);
  return geometry;
}

function createControllerTouchpadGeometry() {
  const width = 0.082, height = 0.034, radius = 0.008;
  const halfWidth = width / 2, halfHeight = height / 2;
  const shape = new Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -0.001);
  return geometry;
}

function createControllerDpadGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.006, 0.019);
  shape.lineTo(0.006, 0.019);
  shape.lineTo(0.006, 0.006);
  shape.lineTo(0.019, 0.006);
  shape.lineTo(0.019, -0.006);
  shape.lineTo(0.006, -0.006);
  shape.lineTo(0.006, -0.019);
  shape.lineTo(-0.006, -0.019);
  shape.lineTo(-0.006, -0.006);
  shape.lineTo(-0.019, -0.006);
  shape.lineTo(-0.019, 0.006);
  shape.lineTo(-0.006, 0.006);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.005, bevelEnabled: false });
  geometry.translate(0, 0, -0.0025);
  return geometry;
}

function ProceduralController() {
  const shell = useMemo(() => createControllerShellGeometry(), []);
  const touchpad = useMemo(() => createControllerTouchpadGeometry(), []);
  const dpad = useMemo(() => createControllerDpadGeometry(), []);
  const faceButton = useMemo(() => new CylinderGeometry(0.0085, 0.0085, 0.005, 14), []);
  const stickBase = useMemo(() => new CylinderGeometry(0.018, 0.018, 0.006, 16), []);
  const stickCap = useMemo(() => new CylinderGeometry(0.013, 0.013, 0.006, 16), []);
  const shoulder = useMemo(() => new BoxGeometry(0.055, 0.012, 0.014), []);
  const centerButton = useMemo(() => new BoxGeometry(0.016, 0.006, 0.003), []);
  const hookPoints = useMemo<Vec3[]>(() => [
    [0, -0.024, -0.04], [0, -0.018, -0.029], [0, 0.018, -0.029],
    [0, 0.038, -0.022], [0, 0.041, -0.014],
  ], []);
  const hook = useMemo(() => new TubeGeometry(
    new CatmullRomCurve3(hookPoints.map(point => new Vector3(...point))), 28, 0.0055, 6, false,
  ), [hookPoints]);
  const materials = useMemo(() => ({
    shell: new MeshStandardMaterial({ color: '#343a3d', roughness: 0.72, metalness: 0.05 }),
    touchpad: new MeshStandardMaterial({ color: '#191e20', roughness: 0.82, metalness: 0.02 }),
    controls: new MeshStandardMaterial({ color: '#252a2d', roughness: 0.52, metalness: 0.08 }),
    rubber: new MeshStandardMaterial({ color: '#111516', roughness: 0.94, metalness: 0 }),
    shoulder: new MeshStandardMaterial({ color: '#191d1f', roughness: 0.46, metalness: 0.06 }),
  }), []);
  const sticks = useMemo<PropTransform[]>(() => [
    { position: [-0.047, -0.02, 0.02], rotation: [Math.PI / 2, 0, 0] },
    { position: [0.047, -0.032, 0.02], rotation: [Math.PI / 2, 0, 0] },
  ], []);
  const stickCaps = useMemo<PropTransform[]>(() => sticks.map(stick => ({
    position: [stick.position[0], stick.position[1], 0.026],
    rotation: [Math.PI / 2, 0, 0],
  })), [sticks]);
  const faceButtons = useMemo<PropTransform[]>(() => [
    [0.105, 0.028, 0.021], [0.123, 0.01, 0.021],
    [0.105, -0.008, 0.021], [0.087, 0.01, 0.021],
  ].map(position => ({ position: position as Vec3, rotation: [Math.PI / 2, 0, 0] })), []);
  const shoulders = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.096, 0.055, 0.013],
    rotation: [0, 0, side * -0.08],
  })), []);
  const centerButtons = useMemo<PropTransform[]>(() => [-1, 1].map(side => ({
    position: [side * 0.017, -0.004, 0.02],
  })), []);
  const resources = useMemo(() => [
    shell, touchpad, dpad, faceButton, stickBase, stickCap, shoulder, centerButton, hook,
    ...Object.values(materials),
  ], [centerButton, dpad, faceButton, hook, materials, shell, shoulder, stickBase, stickCap, touchpad]);
  useDisposeOnUnmount(resources);

  return <group name="ps4_controller" position={[-0.05, -0.2, 0.07]} rotation={[0, 0, -0.1]}>
    <mesh geometry={shell} castShadow receiveShadow material={materials.shell} />
    <PegHook name="controller_mount_hook" basePosition={hookPoints[0]} tipPosition={hookPoints[hookPoints.length - 1]} geometry={hook} />
    <mesh name="controller_touchpad" geometry={touchpad} position={[0, 0.027, 0.019]} material={materials.touchpad} />
    <mesh name="controller_dpad" geometry={dpad} position={[-0.104, 0.009, 0.02]} material={materials.controls} />
    <InstancedPropMeshes name="controller_analog_bases" geometry={stickBase} material={materials.shoulder} transforms={sticks} />
    <InstancedPropMeshes name="controller_analog_caps" geometry={stickCap} material={materials.rubber} transforms={stickCaps} />
    <InstancedPropMeshes name="controller_face_buttons" geometry={faceButton} material={materials.controls} transforms={faceButtons} />
    <InstancedPropMeshes name="controller_shoulders" geometry={shoulder} material={materials.shoulder} transforms={shoulders} />
    <InstancedPropMeshes name="controller_center_buttons" geometry={centerButton} material={materials.controls} transforms={centerButtons} />
  </group>;
}

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

export function Barstool() {
  const { scene: barstoolAsset } = useGLTF('/models/barstool-black-unbranded-compact.glb');
  const barstool = useMemo(() => {
    const clone = barstoolAsset.clone(true);
    clone.traverse(child => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [barstoolAsset]);

  return <group {...room.barstool} name="barstool">
    <primitive object={barstool} />
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
    <group name="cap_01" position={[-0.28, 0.12, 0.12]}>
      <ProceduralCap />
    </group>
    <group name="headphones" position={[0.28, -0.03, 0.12]}>
      <ProceduralHeadphones />
    </group>
    <ProceduralController />
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
