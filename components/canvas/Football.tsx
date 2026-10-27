'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Group, Material, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
import RoomLabel from './RoomLabel';
import { createBall, football, kickBall, moving, stepBall } from '@/lib/football';
import { freeLook } from '@/lib/room-state';

export default function Football({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const { camera, gl, invalidate } = useThree();
  const root = useRef<Group>(null), model = useRef<Group>(null), hitMesh = useRef<Mesh>(null);
  const ball = useRef(createBall()), accumulator = useRef(0);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const { scene } = useGLTF('/models/football-stars-compact.glb');
  const visual = useMemo(() => {
    const object = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    object.traverse(child => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true; child.receiveShadow = true;
      const cloneMaterial = (material: Material) => {
        const clone = material.clone();
        if (clone instanceof MeshStandardMaterial) {
          clone.emissive.set('#adcee3'); clone.emissiveIntensity = 0; materials.push(clone);
        }
        return clone;
      };
      child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
    });
    object.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(object);
    const size = bounds.getSize(new Vector3()), diameter = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(diameter) || diameter <= 0) {
      materials.forEach(material => material.dispose());
      throw new Error('Football model has invalid or empty geometry.');
    }
    object.position.sub(bounds.getCenter(new Vector3()));
    return { object, materials, scale: football.radius * 2 / diameter };
  }, [scene]);
  const vectors = useMemo(() => ({ forward: new Vector3(), right: new Vector3(), axis: new Vector3() }), []);
  useEffect(() => () => visual.materials.forEach(material => material.dispose()), [visual]);
  useEffect(() => {
    const intensity = active && (hovered || focused) ? 0.16 : 0;
    model.current?.traverse(child => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) material.emissiveIntensity = intensity;
      }
    });
    invalidate();
  }, [active, hovered, focused, invalidate]);
  useEffect(() => {
    if (active) return;
    accumulator.current = 0;
    gl.domElement.classList.remove('over-football');
  }, [active, gl]);

  const kick = () => {
    if (!active) return;
    camera.getWorldDirection(vectors.forward);
    kickBall(ball.current, vectors.forward.x, vectors.forward.z, 0, reducedMotion); invalidate();
  };
  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement, ray = new Raycaster(), pointer = new Vector2();
    let gesture: { id: number; x: number; y: number; dragged: boolean; side: number } | null = null;
    const hit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return hitMesh.current ? ray.intersectObject(hitMesh.current, false)[0] : undefined;
    };
    const highlight = (value: boolean) => { setHovered(value); canvas.classList.toggle('over-football', value); };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) { gesture = null; return; }
      if (event.button !== 0) return;
      const intersection = hit(event);
      if (!intersection) return;
      vectors.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      const side = vectors.axis.copy(intersection.point).sub(hitMesh.current!.getWorldPosition(vectors.forward)).dot(vectors.right) / football.radius;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false, side };
    };
    const move = (event: PointerEvent) => {
      if (event.buttons) {
        if (gesture && event.pointerId === gesture.id && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= freeLook.dragThreshold) gesture.dragged = true;
        highlight(false);
      } else if (event.pointerType !== 'touch') highlight(!!hit(event));
    };
    const up = (event: PointerEvent) => {
      const candidate = gesture; gesture = null;
      if (!candidate || event.pointerId !== candidate.id || candidate.dragged ||
        Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) >= freeLook.dragThreshold) return;
      camera.getWorldDirection(vectors.forward);
      kickBall(ball.current, vectors.forward.x, vectors.forward.z, candidate.side, reducedMotion); invalidate();
      highlight(false);
    };
    const cancel = () => { gesture = null; highlight(false); };
    // Observe native gestures; CameraRig retains capture, thresholds and camera ownership.
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    const leave = () => highlight(false);
    canvas.addEventListener('pointerleave', leave);
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave); window.removeEventListener('blur', cancel);
      canvas.classList.remove('over-football');
      setHovered(false);
      setFocused(false);
    };
  }, [active, reducedMotion, camera, gl, invalidate, vectors]);

  useFrame((_, delta) => {
    if (!active || !moving(ball.current) || !root.current || !model.current) return;
    accumulator.current += Math.min(delta, football.physics.maxFrame);
    while (accumulator.current >= football.physics.step) {
      const x = ball.current.x, z = ball.current.z;
      stepBall(ball.current, reducedMotion);
      const dx = ball.current.x - x, dz = ball.current.z - z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0) model.current.rotateOnWorldAxis(vectors.axis.set(dz, 0, -dx).normalize(), distance / football.radius);
      accumulator.current -= football.physics.step;
    }
    root.current.position.set(ball.current.x, ball.current.y, ball.current.z);
    invalidate();
  });
  return <group ref={root} name={football.name} position={[football.initial.x, football.floor + football.radius, football.initial.z]}>
    <group ref={model}>
      <mesh ref={hitMesh} visible={false}>
        <sphereGeometry args={[football.radius, 24, 16]} />
        <meshBasicMaterial />
      </mesh>
      <primitive object={visual.object} scale={visual.scale} dispose={null} />
    </group>
    {active && <RoomLabel position={[0, 0.24, 0]} zIndex={12} button
      className={`football-kick${hovered ? ' is-hovered' : ''}`} text="Kick Me!" ariaLabel="Kick football"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={kick} />}
  </group>;
}
