'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { MutableRefObject } from 'react';
import { bikeReview, room, type ReviewView } from '@/lib/room-config';
import { freeLook, type CameraMode, type EntrancePhase } from '@/lib/room-state';
import { entrance, poseValues, type EntranceMotion } from '@/lib/entrance';

export default function CameraRig({ view, phase, reducedMotion, motion, onGesture }: {
  view: ReviewView; phase: EntrancePhase; reducedMotion: boolean; motion: MutableRefObject<EntranceMotion>;
  onGesture: () => void;
}) {
  const { gl, size, invalidate } = useThree();
  const pose = view === 'bike' ? bikeReview : room.home;
  const base = useMemo(() => {
    const dx = pose.target[0] - pose.position[0], dy = pose.target[1] - pose.position[1], dz = pose.target[2] - pose.position[2];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }, [pose]);
  const mode = useRef<CameraMode>('transition');
  const target = useRef({ yaw: 0, pitch: 0, lens: 0 });
  const current = useRef({ yaw: 0, pitch: 0, lens: 0 });
  const dragging = useRef(false);
  const cinematicTarget = useMemo(() => new Vector3(), []);
  const closeValues = useMemo(() => poseValues(size.width < size.height ? entrance.mobile : entrance.desktop), [size.width, size.height]);
  useEffect(() => {
    mode.current = phase === 'exploring' ? 'explore' : 'transition';
    Object.assign(target.current, { yaw: 0, pitch: 0, lens: 0 });
    Object.assign(current.current, target.current);
    invalidate();
  }, [phase, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute('tabindex', phase === 'exploring' ? '0' : '-1');
    canvas.setAttribute('aria-hidden', phase === 'exploring' ? 'false' : 'true');
    canvas.setAttribute('role', 'region');
    canvas.setAttribute('aria-label', 'Interactive room. Drag or swipe to look around. Arrow keys to look; Home to reset.');
    if (phase !== 'exploring') return;
    let pointer: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
    const rotate = (dx: number, dy: number) => {
      target.current.yaw = MathUtils.clamp(target.current.yaw + dx * 0.003, freeLook.minYaw, freeLook.maxYaw);
      target.current.pitch = MathUtils.clamp(target.current.pitch + dy * 0.003, freeLook.minPitch, freeLook.maxPitch);
      invalidate();
    };
    const down = (event: PointerEvent) => {
      if (mode.current !== 'explore' || !event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      dragging.current = false; canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id || mode.current !== 'explore') return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!dragging.current && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= freeLook.dragThreshold) {
        dragging.current = true; canvas.classList.add('is-dragging'); onGesture();
      }
      if (dragging.current) rotate(dx, dy);
      pointer.x = event.clientX; pointer.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      pointer = null; canvas.classList.remove('is-dragging');
    };
    const click = (event: MouseEvent) => {
      // Retained until the click event so future hotspot handlers cannot mistake a drag for a click.
      if (dragging.current) { event.preventDefault(); event.stopImmediatePropagation(); }
      dragging.current = false;
    };
    const key = (event: KeyboardEvent) => {
      if (mode.current !== 'explore') return;
      const deltas: Record<string, [number, number]> = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 25], ArrowDown: [0, -25] };
      if (event.key === 'Home') { target.current.yaw = 0; target.current.pitch = 0; invalidate(); }
      else if (deltas[event.key]) rotate(...deltas[event.key]);
      else return;
      event.preventDefault(); onGesture();
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('click', click, true); canvas.addEventListener('keydown', key);
    const blur = () => { pointer = null; dragging.current = false; canvas.classList.remove('is-dragging'); };
    window.addEventListener('blur', blur);
    return () => {
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      blur(); window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('click', click, true); canvas.removeEventListener('keydown', key);
    };
  }, [phase, gl, invalidate, onGesture]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof PerspectiveCamera) || mode.current === 'focus') return;
    if (phase !== 'exploring') {
      const values = phase === 'entering' ? motion.current.camera : closeValues;
      camera.position.set(values.x, values.y, values.z);
      cinematicTarget.set(values.tx, values.ty, values.tz);
      camera.lookAt(cinematicTarget);
      if (camera.fov !== values.fov) { camera.fov = values.fov; camera.updateProjectionMatrix(); }
      return;
    }
    const values = current.current, desired = target.current;
    const blend = reducedMotion || mode.current === 'transition' ? 1 : 1 - Math.exp(-14 * Math.min(delta, 0.05));
    values.yaw = MathUtils.lerp(values.yaw, desired.yaw, blend);
    values.pitch = MathUtils.lerp(values.pitch, desired.pitch, blend);
    if (Math.abs(values.yaw - desired.yaw) < 0.00001) values.yaw = desired.yaw;
    if (Math.abs(values.pitch - desired.pitch) < 0.00001) values.pitch = desired.pitch;
    values.lens = desired.lens;
    camera.position.set(...pose.position);
    camera.rotation.set(base.pitch + values.pitch, base.yaw + values.yaw, 0, 'YXZ');
    const fov = (size.width < size.height ? 86 : pose.fov) + values.lens;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (Math.abs(values.yaw - desired.yaw) + Math.abs(values.pitch - desired.pitch) > 0.00001) invalidate();
  });
  return null;
}
