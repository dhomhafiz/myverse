'use client';
import { useEffect, useMemo, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3, Euler, Quaternion } from 'three';
import { gsap } from 'gsap';
import { hotspotNavigation, type HotspotNavigationMode } from '@/lib/hotspot-navigation';
import { cameraAnchors } from '@/lib/room-config';
import type { MutableRefObject } from 'react';
import { bikeReview, phone, room, type ReviewView } from '@/lib/room-config';
import { freeLook, type CameraMode, type EntrancePhase } from '@/lib/room-state';
import { entrance, poseValues, type EntranceMotion } from '@/lib/entrance';
import { getHotspotDestination } from '@/lib/hotspot-destinations';

export default function CameraRig({ view, phase, reducedMotion, motion, onGesture, navigationMode, onNavigationSettled, directStart, directDestinationId }: {
  view: ReviewView; phase: EntrancePhase; reducedMotion: boolean; motion: MutableRefObject<EntranceMotion>;
  directStart: boolean; directDestinationId: string; onGesture: () => void;
  navigationMode: HotspotNavigationMode; onNavigationSettled: () => void;
}) {
  const { gl, size, invalidate, camera, scene } = useThree();
  const pose = view === 'bike' ? bikeReview : room.home;
  const base = useMemo(() => {
    const dx = pose.target[0] - pose.position[0], dy = pose.target[1] - pose.position[1], dz = pose.target[2] - pose.position[2];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }, [pose]);
  const completion = useRef<{ callback: () => void; frame: number | null } | null>(null);
  useEffect(() => addAfterEffect(() => {
    const pending = completion.current;
    if (!pending || pending.frame === null || gl.info.render.frame <= pending.frame) return;
    completion.current = null;
    pending.callback();
  }), [gl]);
  const projectFrame = useRef<(() => void) | null>(null);
  const navigationMotion = useRef<{ position: Vector3; from: Quaternion; to: Quaternion; fov: number; progress: number } | null>(null);
  const restoredPosition = useRef<Vector3 | null>(null);
  const restoredFov = useRef<number | null>(null);
  const mode = useRef<CameraMode>('transition');
  const target = useRef({ yaw: 0, pitch: 0, lens: 0 });
  const current = useRef({ yaw: 0, pitch: 0, lens: 0 });
  const dragging = useRef(false);
  const cinematicTarget = useMemo(() => new Vector3(), []);
  const closeValues = useMemo(() => poseValues(size.width < size.height ? entrance.mobile : entrance.desktop), [size.width, size.height]);
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const captureCurrentPose = () => {
      const rotation = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      hotspotNavigation.saved = {
        position: camera.position.toArray(),
        rotation: [rotation.x, rotation.y, rotation.z],
        fov: camera.fov,
      };
    };
    hotspotNavigation.captureCurrentPose = captureCurrentPose;
    return () => {
      if (hotspotNavigation.captureCurrentPose === captureCurrentPose) hotspotNavigation.captureCurrentPose = null;
    };
  }, [camera]);
  useEffect(() => {
    mode.current = phase === 'exploring' ? 'explore' : 'transition';
    Object.assign(target.current, { yaw: 0, pitch: 0, lens: 0 });
    Object.assign(current.current, target.current);
    invalidate();
  }, [phase, invalidate]);
  useEffect(() => {
    completion.current = null;
    if (navigationMode === 'paused') {
      mode.current = 'focus';
      navigationMotion.current = null;
      projectFrame.current = null;
      invalidate();
      return;
    }
    if (!(camera instanceof PerspectiveCamera) || phase !== 'exploring') return;
    if (navigationMode === 'explore') {
      mode.current = 'explore'; navigationMotion.current = null;
      camera.rotation.reorder('YXZ'); invalidate(); return;
    }
    mode.current = 'focus';
    const destinationConfig = getHotspotDestination(hotspotNavigation.destinationId);
    if (navigationMode === 'opening') {
      const rotation = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      hotspotNavigation.saved = { position: camera.position.toArray(), rotation: [rotation.x, rotation.y, rotation.z], fov: camera.fov };
      hotspotNavigation.visited = true;
    }
    const neutralHandoff = destinationConfig.cameraHandoff === 'opaque';
    const monitor = cameraAnchors[destinationConfig.focusPose];
    const saved = hotspotNavigation.saved;
    const restore = navigationMode === 'returning';
    const restoreSaved = restore && saved && destinationConfig.returnTo === 'saved-camera';
    const destination = !restore && neutralHandoff ? camera.position.clone()
      : restoreSaved ? new Vector3(...saved.position) : restore ? new Vector3(...pose.position) : new Vector3(...monitor.position);
    const destinationRotation = restoreSaved
      ? new Quaternion().setFromEuler(new Euler(...saved.rotation, 'YXZ'))
      : !restore && neutralHandoff ? camera.quaternion.clone()
        : new Quaternion().setFromEuler(new Euler(base.pitch, base.yaw, 0, 'YXZ'));
    if (!restore && !neutralHandoff) {
      const dummy = camera.clone(); dummy.position.copy(destination); dummy.lookAt(new Vector3(...monitor.target)); destinationRotation.copy(dummy.quaternion);
    }
    const destinationFov = restore
      ? restoreSaved ? saved.fov : size.width < size.height ? 86 : pose.fov
      : neutralHandoff ? camera.fov
        : size.width < size.height ? destinationConfig.focusFov.mobile : destinationConfig.focusFov.desktop;
    const values = { position: camera.position.clone(), from: camera.quaternion.clone(), to: destinationRotation, fov: camera.fov, progress: 0 };
    navigationMotion.current = values;
    const phoneDestination = destinationConfig.id === 'iphone';
    const phoneRoot = phoneDestination ? scene.getObjectByName(phone.name) : undefined;
    const flipPivot = phoneDestination ? scene.getObjectByName(phone.flipPivotName) : undefined;
    const phoneNeedsReset = restore && phoneRoot && flipPivot &&
      (Math.abs(phoneRoot.position.y - phone.position[1]) > 0.001 || Math.abs(flipPivot.rotation.x) > 0.001);
    if (phoneDestination && (!phoneRoot || !flipPivot)) {
      console.error('The configured iPhone contact hotspot is missing its phone root or flip pivot.');
    }
    if (phoneRoot && flipPivot && reducedMotion && phoneDestination) {
      phoneRoot.position.y = restore ? phone.position[1] : phone.position[1] + 0.11;
      flipPivot.rotation.x = restore ? 0 : Math.PI;
    }
    const settle = () => {
      if (restore) {
        const rotation = new Euler().setFromQuaternion(destinationRotation, 'YXZ');
        Object.assign(current.current, { yaw: rotation.y - base.yaw, pitch: rotation.x - base.pitch, lens: 0 });
        Object.assign(target.current, current.current);
        restoredPosition.current = destination.clone(); restoredFov.current = destinationFov;
      }
      completion.current = { callback: onNavigationSettled, frame: null };
      invalidate();
    };
    const duration = reducedMotion ? .01 : neutralHandoff ? .16 : destinationConfig.duration ?? 1.15;
    const tween = gsap.timeline({ onUpdate: invalidate, onComplete: settle });
    tween.to(values, { progress: 1, duration, ease: 'power3.inOut' }, 0);
    if (phoneRoot && flipPivot && !reducedMotion && phoneDestination) {
      if (restore) {
        if (phoneNeedsReset) {
          tween.to(flipPivot.rotation, { x: 0, duration: duration * 0.75, ease: 'power2.inOut' }, 0);
          tween.to(phoneRoot.position, { y: phone.position[1], duration: duration * 0.25, ease: 'power2.in' }, duration * 0.75);
        }
      } else {
        tween.to(phoneRoot.position, { y: phone.position[1] + 0.11, duration: duration * 0.14, ease: 'power2.out' }, 0);
        tween.to(flipPivot.rotation, { x: Math.PI, duration: duration * 0.32, ease: 'power2.inOut' }, duration * 0.14);
      }
    }
    // Numeric channels only: this rig remains the sole camera writer.
    const frame = () => {
      camera.position.lerpVectors(values.position, destination, values.progress);
      camera.quaternion.slerpQuaternions(values.from, values.to, values.progress);
      camera.fov = MathUtils.lerp(values.fov, destinationFov, values.progress); camera.updateProjectionMatrix();
    };
    projectFrame.current = frame;
    return () => { tween.kill(); projectFrame.current = null; completion.current = null; };
  }, [navigationMode, phase, camera, invalidate, reducedMotion, onNavigationSettled, base, pose, size.width, size.height, scene]);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute('tabindex', phase === 'exploring' ? '0' : '-1');
    canvas.setAttribute('aria-hidden', phase === 'exploring' ? 'false' : 'true');
    canvas.setAttribute('role', 'region');
    canvas.setAttribute('aria-label', 'Interactive room. Drag or swipe to look around. Arrow keys to look; Home to reset.');
    if (phase !== 'exploring' || navigationMode !== 'explore') return;
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
  }, [phase, navigationMode, gl, invalidate, onGesture]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (mode.current === 'focus') {
      if (projectFrame.current) {
        projectFrame.current();
        if (completion.current) completion.current.frame = gl.info.render.frame;
      }
      else if (navigationMotion.current) { const values = navigationMotion.current; camera.position.copy(values.position); camera.quaternion.copy(values.to); camera.fov = values.fov; camera.updateProjectionMatrix(); }
      else if (directStart) {
        const focus = cameraAnchors[getHotspotDestination(directDestinationId).focusPose];
        camera.position.set(...focus.position);
        camera.lookAt(new Vector3(...focus.target));
        camera.fov = size.width < size.height ? getHotspotDestination(directDestinationId).focusFov.mobile : getHotspotDestination(directDestinationId).focusFov.desktop;
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (phase !== 'exploring') {
      if (directStart) {
        const destination = getHotspotDestination(directDestinationId);
        const focus = cameraAnchors[destination.focusPose];
        camera.position.set(...focus.position);
        camera.lookAt(new Vector3(...focus.target));
        const fov = size.width < size.height ? destination.focusFov.mobile : destination.focusFov.desktop;
        if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
        return;
      }
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
    camera.position.copy(restoredPosition.current ?? new Vector3(...pose.position));
    camera.rotation.set(base.pitch + values.pitch, base.yaw + values.yaw, 0, 'YXZ');
    const fov = (restoredFov.current ?? (size.width < size.height ? 86 : pose.fov)) + values.lens;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (Math.abs(values.yaw - desired.yaw) + Math.abs(values.pitch - desired.pitch) > 0.00001) invalidate();
  });
  return null;
}
