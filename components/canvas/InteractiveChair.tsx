'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Color, Group, MathUtils, Material, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector2, Vector3 } from 'three';
import { room } from '@/lib/room-config';
import { freeLook } from '@/lib/room-state';
import type { EntranceMotion } from '@/lib/entrance';

const carpetSurfaceY = 0.0265;
const radiansPerPixel = 0.0125;
const maxAngularVelocity = 3.5;
const damping = 7;

type HoverMaterial = { material: MeshStandardMaterial; emissive: Color; intensity: number };
type ChairModel = {
  object: Object3D;
  swivel: Object3D | null;
  base: Object3D | null;
  hoverMaterials: HoverMaterial[];
};
type Gesture = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastTime: number;
  dragging: boolean;
};

export default function InteractiveChair({ active, reducedMotion, onGesture, motion }: {
  active: boolean; reducedMotion: boolean; onGesture: () => void; motion: RefObject<EntranceMotion>;
}) {
  const { camera, gl, invalidate } = useThree();
  const { scene } = useGLTF('/models/gaming-chair-all-black-swivel-compact.glb');
  const model = useMemo<ChairModel>(() => {
    const object = scene.clone(true);
    const swivel = object.getObjectByName('chair_swivel') ?? null;
    const base = object.getObjectByName('chair_base') ?? null;
    const hoverMaterials: HoverMaterial[] = [];
    object.traverse(child => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      let current: Object3D | null = child;
      let belongsToSwivel = false;
      while (current) {
        if (current === swivel) { belongsToSwivel = true; break; }
        current = current.parent;
      }
      const cloneMaterial = (material: Material) => {
        const clone = material.clone();
        if (belongsToSwivel && clone instanceof MeshStandardMaterial) {
          hoverMaterials.push({ material: clone, emissive: clone.emissive.clone(), intensity: clone.emissiveIntensity });
        }
        return clone;
      };
      child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
    });
    object.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(object);
    const size = bounds.getSize(new Vector3());
    if (![size.x, size.y, size.z].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error('Gaming chair model has invalid or empty geometry.');
    }
    const missing = [
      !swivel && 'chair_swivel',
      !base && 'chair_base',
    ].filter((name): name is string => !!name);
    if (missing.length) {
      console.warn(`Gaming chair swivel interaction disabled; missing required GLB node(s): ${missing.join(', ')}.`);
    }
    const center = bounds.getCenter(new Vector3());
    object.position.set(-center.x, -bounds.min.y, -center.z);
    return { object, swivel, base, hoverMaterials };
  }, [scene]);
  const scale = room.chair.scale ?? [1, 1, 1];
  const swivelRef = useRef(model.swivel);
  const baseRef = useRef(model.base);
  const hoverMaterialsRef = useRef(model.hoverMaterials);
  const spin = useRef({ angle: model.swivel?.rotation.y ?? 0, velocity: 0, dragging: false });
  const chairRootRef = useRef<Group>(null);
  const gesture = useRef<Gesture | null>(null);
  const hoveredRef = useRef(false);
  const suppressClick = useRef(false);
  const reducedMotionRef = useRef(reducedMotion);
  const [hovered, setHovered] = useState(false);

  useEffect(() => { reducedMotionRef.current = reducedMotion; }, [reducedMotion]);

  const setHover = useCallback((value: boolean) => {
    if (hoveredRef.current === value) return;
    hoveredRef.current = value;
    gl.domElement.classList.toggle('over-chair', value);
    setHovered(value);
    invalidate();
  }, [gl, invalidate]);

  useEffect(() => () => {
    model.hoverMaterials.forEach(({ material }) => material.dispose());
  }, [model]);

  useEffect(() => {
    const color = new Color('#b7c8d2');
    for (const entry of hoverMaterialsRef.current) {
      entry.material.emissive.copy(hovered ? color : entry.emissive);
      entry.material.emissiveIntensity = hovered ? 0.035 : entry.intensity;
    }
    invalidate();
  }, [hovered, invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const swivel = swivelRef.current;
    const base = baseRef.current;
    if (!active || !swivel || !base) {
      setHover(false);
      return;
    }

    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const spinState = spin.current;
    const hitSwivel = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(swivel, true).length > 0;
    };
    const down = (event: PointerEvent) => {
      suppressClick.current = false;
      if (!event.isPrimary || (event.pointerType !== 'touch' && event.button !== 0) || !hitSwivel(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gesture.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        dragging: false,
      };
      spinState.velocity = 0;
      spinState.dragging = false;
      if (event.pointerType !== 'touch') setHover(true);
      canvas.setPointerCapture(event.pointerId);
      invalidate();
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (current && event.pointerId === current.pointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const totalX = event.clientX - current.startX;
        const totalY = event.clientY - current.startY;
        let deltaX = 0;
        let elapsed = (event.timeStamp - current.lastTime) / 1000;
        if (!current.dragging && Math.hypot(totalX, totalY) >= freeLook.dragThreshold) {
          current.dragging = true;
          spinState.dragging = true;
          canvas.classList.add('is-chair-dragging');
          onGesture();
          deltaX = totalX;
          elapsed = (event.timeStamp - current.startTime) / 1000;
        } else if (current.dragging) {
          deltaX = event.clientX - current.lastX;
        }
        if (current.dragging && deltaX !== 0) {
          const deltaAngle = deltaX * radiansPerPixel;
          spinState.angle += deltaAngle;
          spinState.velocity = reducedMotionRef.current ? 0 : MathUtils.clamp(
            deltaAngle / Math.max(elapsed, 1 / 120),
            -maxAngularVelocity,
            maxAngularVelocity,
          );
        }
        current.lastX = event.clientX;
        current.lastTime = event.timeStamp;
        invalidate();
        return;
      }
      if (event.buttons !== 0 || event.pointerType === 'touch') return;
      setHover(hitSwivel(event));
    };
    const finish = (event: PointerEvent, cancelled: boolean) => {
      const current = gesture.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      gesture.current = null;
      spinState.dragging = false;
      if (cancelled || reducedMotionRef.current) spinState.velocity = 0;
      suppressClick.current = !cancelled && current.dragging;
      canvas.classList.remove('is-chair-dragging');
      if (current.pointerType === 'touch') setHover(false);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      invalidate();
    };
    const up = (event: PointerEvent) => finish(event, false);
    const cancel = (event: PointerEvent) => finish(event, true);
    const lostCapture = (event: PointerEvent) => finish(event, true);
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blur = () => {
      const current = gesture.current;
      if (!current) return;
      gesture.current = null;
      spinState.dragging = false;
      spinState.velocity = 0;
      canvas.classList.remove('is-chair-dragging');
      setHover(false);
      if (canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
      invalidate();
    };
    const leave = () => { if (!gesture.current) setHover(false); };

    // Claim swivel hits in capture phase so Free Look cannot capture the same gesture.
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move, true);
    canvas.addEventListener('pointerup', up, true);
    canvas.addEventListener('pointercancel', cancel, true);
    canvas.addEventListener('lostpointercapture', lostCapture, true);
    canvas.addEventListener('pointerleave', leave, true);
    canvas.addEventListener('click', click, true);
    window.addEventListener('blur', blur);
    return () => {
      const current = gesture.current;
      gesture.current = null;
      spinState.dragging = false;
      spinState.velocity = 0;
      canvas.classList.remove('is-chair-dragging', 'over-chair');
      hoveredRef.current = false;
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', up, true);
      canvas.removeEventListener('pointercancel', cancel, true);
      canvas.removeEventListener('lostpointercapture', lostCapture, true);
      canvas.removeEventListener('pointerleave', leave, true);
      canvas.removeEventListener('click', click, true);
      window.removeEventListener('blur', blur);
      if (current && canvas.hasPointerCapture(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    };
  }, [active, camera, gl, invalidate, model, onGesture, setHover]);

  useFrame((_, delta) => {
    const chairRoot = chairRootRef.current;
    if (chairRoot) {
      const pose = motion.current.chair;
      chairRoot.position.set(pose.x, pose.y, pose.z);
      chairRoot.rotation.y = pose.yaw;
    }
    const swivel = swivelRef.current;
    if (!active || !swivel || !baseRef.current) return;
    const state = spin.current;
    if (state.dragging) {
      swivel.rotation.y = state.angle;
      return;
    }
    if (reducedMotion || Math.abs(state.velocity) < 0.01) {
      state.velocity = 0;
      swivel.rotation.y = state.angle;
      return;
    }
    const step = Math.min(delta, 0.05);
    state.angle += state.velocity * step;
    state.velocity *= Math.exp(-damping * step);
    swivel.rotation.y = state.angle;
    invalidate();
  });

  return <group ref={chairRootRef} {...room.chair} name="gaming_chair">
    <group position={[0, carpetSurfaceY / scale[1], 0]}>
      <primitive object={model.object} dispose={null} />
    </group>
    <Html position={[0, 1.4, 0]} center zIndexRange={[18, 12]}>
      <span aria-hidden="true" className={`chair-spin-hint${hovered ? ' is-hovered' : ''}`}>Give it a spin</span>
    </Html>
  </group>;
}
