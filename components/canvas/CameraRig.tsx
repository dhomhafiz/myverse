'use client';
import { useEffect, useMemo, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { Box3, MathUtils, PerspectiveCamera, Vector3, Euler, Quaternion } from 'three';
import type { Object3D } from 'three';
import { gsap } from 'gsap';
import { hotspotNavigation, type HotspotNavigationMode } from '@/lib/hotspot-navigation';
import { cameraAnchors } from '@/lib/room-config';
import type { MutableRefObject } from 'react';
import { bikeReview, phone, room, type ReviewView } from '@/lib/room-config';
import { freeLook, roomCursor, type CameraMode, type CompanionFocusState, type EntrancePhase } from '@/lib/room-state';
import { entrance, poseValues, type EntranceMotion } from '@/lib/entrance';
import { getHotspotDestination } from '@/lib/hotspot-destinations';

type CompanionCameraSnapshot = {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  current: { yaw: number; pitch: number; lens: number };
  target: { yaw: number; pitch: number; lens: number };
};

type CompanionCameraMotion = {
  position: Vector3;
  destination: Vector3;
  from: Quaternion;
  to: Quaternion;
  fov: number;
  progress: number;
};

function getMobileCompanionFraming(camera: PerspectiveCamera, width: number, height: number, robot: Object3D, head: Object3D, eyes: Object3D) {
  const headBounds = new Box3().setFromObject(head, true);
  const eyesBounds = new Box3().setFromObject(eyes, true);
  if (headBounds.isEmpty() || eyesBounds.isEmpty()) return null;

  const eyeCenter = eyesBounds.getCenter(new Vector3());
  const orientation = robot.getWorldQuaternion(new Quaternion());
  const forward = new Vector3(0, 0, 1).applyQuaternion(orientation).normalize();
  const corners = [
    new Vector3(headBounds.min.x, headBounds.min.y, headBounds.min.z),
    new Vector3(headBounds.min.x, headBounds.min.y, headBounds.max.z),
    new Vector3(headBounds.min.x, headBounds.max.y, headBounds.min.z),
    new Vector3(headBounds.min.x, headBounds.max.y, headBounds.max.z),
    new Vector3(headBounds.max.x, headBounds.min.y, headBounds.min.z),
    new Vector3(headBounds.max.x, headBounds.min.y, headBounds.max.z),
    new Vector3(headBounds.max.x, headBounds.max.y, headBounds.min.z),
    new Vector3(headBounds.max.x, headBounds.max.y, headBounds.max.z),
  ];
  const shortLandscape = width > height && height <= 500;
  const sheetHeight = shortLandscape
    ? Math.min(height * 0.7, 300)
    : Math.min(Math.max(height * 0.44, 300), 430);
  const sheetTop = 1 - sheetHeight / height;
  const frameTop = 0.06;
  const frameBottom = sheetTop - 0.07;
  const eyeScreenY = shortLandscape ? frameBottom - 0.08 : Math.min(0.32, frameBottom - 0.15);
  const verticalTangent = Math.tan(MathUtils.degToRad(camera.fov) / 2);
  const framingCamera = camera.clone();
  framingCamera.aspect = width / height;
  framingCamera.updateProjectionMatrix();

  for (let distance = 0.22; distance <= 4; distance *= 1.08) {
    const position = eyeCenter.clone().addScaledVector(forward, distance);
    const aimDrop = (1 - 2 * eyeScreenY) * distance * verticalTangent;
    const aimPoint = eyeCenter.clone().add(new Vector3(0, -aimDrop, 0));
    framingCamera.position.copy(position);
    framingCamera.lookAt(aimPoint);
    framingCamera.updateMatrixWorld(true);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of corners) {
      const projected = corner.clone().project(framingCamera);
      const screenX = (projected.x + 1) / 2;
      const screenY = (1 - projected.y) / 2;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
    }

    if (minX >= 0.06 && maxX <= 0.94 && minY >= frameTop && maxY <= frameBottom) {
      return { position, rotation: framingCamera.quaternion.clone() };
    }
  }
  return null;
}

export default function CameraRig({ view, phase, reducedMotion, motion, onGesture, navigationMode, onNavigationSettled, directStart, directDestinationId, roomActive, companionFocus, onCompanionFocusSettled, onCompanionFocusFailed }: {
  view: ReviewView; phase: EntrancePhase; reducedMotion: boolean; motion: MutableRefObject<EntranceMotion>;
  roomActive: boolean;
  directStart: boolean; directDestinationId: string; onGesture: () => void;
  navigationMode: HotspotNavigationMode; onNavigationSettled: () => void;
  companionFocus: CompanionFocusState;
  onCompanionFocusSettled: (direction: 'opening' | 'closing') => void;
  onCompanionFocusFailed: (error: Error) => void;
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
  const companionCameraMotion = useRef<CompanionCameraMotion | null>(null);
  const companionSnapshot = useRef<CompanionCameraSnapshot | null>(null);
  const companionLayout = useRef<{ width: number; height: number } | null>(null);
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
    if (companionFocus === 'closed') {
      if (phase === 'exploring' && navigationMode === 'explore') mode.current = 'explore';
      return;
    }

    mode.current = 'focus';
    roomCursor.active = false;
    roomCursor.dragging = false;
    dragging.current = false;
    if (!(camera instanceof PerspectiveCamera) || phase !== 'exploring') return;
    if (companionFocus === 'open' && companionLayout.current?.width === size.width) return;

    const snapshot = companionSnapshot.current;
    if (companionFocus === 'opening' && !snapshot) {
      companionSnapshot.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        fov: camera.fov,
        current: { ...current.current },
        target: { ...target.current },
      };
    }
    const saved = companionSnapshot.current;
    if (!saved) {
      const error = new Error('The previous camera view for the AI Companion could not be restored.');
      console.error('AI Companion camera focus failed:', error);
      onCompanionFocusFailed(error);
      return;
    }

    let destination: Vector3;
    let destinationRotation: Quaternion;
    if (companionFocus !== 'closing') {
      scene.updateMatrixWorld(true);
      const robot = scene.getObjectByName('myverse_ai_companion');
      const head = robot?.getObjectByName('head_pivot');
      if (!robot || !head) {
        const error = new Error('The MyVerse AI Companion or its head focus point is missing from the room scene.');
        console.error('AI Companion camera focus failed:', error);
        current.current = { ...saved.current };
        target.current = { ...saved.target };
        restoredPosition.current = saved.position.clone();
        restoredFov.current = saved.fov - saved.current.lens;
        companionSnapshot.current = null;
        companionLayout.current = null;
        onCompanionFocusFailed(error);
        return;
      }

      const mobile = size.width <= 820 ||
        (size.width <= 960 && gl.domElement.ownerDocument.defaultView?.matchMedia('(pointer: coarse)').matches === true);
      if (mobile) {
        const eyes = robot.getObjectByName('head_pivot_eyes_cyan');
        const framing = eyes && getMobileCompanionFraming(camera, size.width, size.height, robot, head, eyes);
        if (!framing) {
          const error = new Error('The MyVerse AI Companion head and eyes could not be framed above the mobile chat sheet.');
          console.error('AI Companion camera focus failed:', error);
          current.current = { ...saved.current };
          target.current = { ...saved.target };
          restoredPosition.current = saved.position.clone();
          restoredFov.current = saved.fov - saved.current.lens;
          companionSnapshot.current = null;
          companionLayout.current = null;
          onCompanionFocusFailed(error);
          return;
        }
        destination = framing.position;
        destinationRotation = framing.rotation;
      } else {
        const focusTarget = head.getWorldPosition(new Vector3());
        const orientation = robot.getWorldQuaternion(new Quaternion());
        const forward = new Vector3(0, 0, 1).applyQuaternion(orientation).normalize();
        const right = new Vector3(1, 0, 0).applyQuaternion(orientation).normalize();
        focusTarget.addScaledVector(right, 0.19);
        destination = focusTarget.clone().addScaledVector(forward, 0.72);
        destination.y += 0.025;
        const lookCamera = camera.clone();
        lookCamera.position.copy(destination);
        lookCamera.lookAt(focusTarget);
        destinationRotation = lookCamera.quaternion.clone();
      }
    } else {
      destination = saved.position.clone();
      destinationRotation = saved.quaternion.clone();
    }

    const values: CompanionCameraMotion = {
      position: camera.position.clone(),
      destination,
      from: camera.quaternion.clone(),
      to: destinationRotation,
      fov: camera.fov,
      progress: 0,
    };
    companionCameraMotion.current = values;
    const finish = () => {
      companionCameraMotion.current = null;
      if (companionFocus !== 'closing') {
        companionLayout.current = { width: size.width, height: size.height };
        if (companionFocus === 'opening') onCompanionFocusSettled('opening');
        return;
      }
      current.current = { ...saved.current };
      target.current = { ...saved.target };
      restoredPosition.current = saved.position.clone();
      restoredFov.current = saved.fov - saved.current.lens;
      companionSnapshot.current = null;
      companionLayout.current = null;
      onCompanionFocusSettled('closing');
      invalidate();
    };
    const timeline = gsap.timeline({
      onUpdate: invalidate,
      onComplete: finish,
    });
    timeline.to(values, { progress: 1, duration: reducedMotion ? 0.01 : 0.95, ease: 'power3.inOut' }, 0);
    const settleWhenHidden = () => {
      if (document.hidden) timeline.progress(1);
    };
    document.addEventListener('visibilitychange', settleWhenHidden);
    return () => {
      document.removeEventListener('visibilitychange', settleWhenHidden);
      timeline.kill();
      if (companionCameraMotion.current === values) companionCameraMotion.current = null;
    };
  }, [camera, companionFocus, gl, invalidate, navigationMode, onCompanionFocusFailed, onCompanionFocusSettled, phase, reducedMotion, scene, size.height, size.width]);
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
    roomCursor.active = false;
    roomCursor.dragging = false;
    canvas.setAttribute('tabindex', phase === 'exploring' ? '0' : '-1');
    canvas.setAttribute('aria-hidden', phase === 'exploring' ? 'false' : 'true');
    canvas.setAttribute('role', 'region');
    canvas.setAttribute('aria-label', 'Interactive room. Drag or swipe to look around. Arrow keys to look; Home to reset.');
    if (!roomActive || phase !== 'exploring' || navigationMode !== 'explore' || companionFocus !== 'closed') return;
    let pointer: { id: number; x: number; y: number; startX: number; startY: number; type: string } | null = null;
    const updateCursor = (event: PointerEvent, dragging: boolean) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = canvas.getBoundingClientRect();
      roomCursor.x = MathUtils.clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1);
      roomCursor.y = MathUtils.clamp(1 - ((event.clientY - bounds.top) / bounds.height) * 2, -1, 1);
      roomCursor.active = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      roomCursor.dragging = dragging;
    };
    const rotate = (dx: number, dy: number) => {
      target.current.yaw = MathUtils.clamp(target.current.yaw + dx * 0.003, freeLook.minYaw, freeLook.maxYaw);
      target.current.pitch = MathUtils.clamp(target.current.pitch + dy * 0.003, freeLook.minPitch, freeLook.maxPitch);
      invalidate();
    };
    const down = (event: PointerEvent) => {
      if (mode.current !== 'explore' || !event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, type: event.pointerType };
      if (event.pointerType !== 'mouse') roomCursor.active = false;
      dragging.current = false; canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      updateCursor(event, dragging.current);
      if (!pointer || event.pointerId !== pointer.id || mode.current !== 'explore') return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (!dragging.current && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= freeLook.dragThreshold) {
        dragging.current = true; canvas.classList.add('is-dragging'); onGesture();
        roomCursor.dragging = true;
      }
      if (dragging.current) rotate(dx, dy);
      pointer.x = event.clientX; pointer.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const wasCancelled = event.type === 'pointercancel';
      const pointerType = pointer.type;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      pointer = null; canvas.classList.remove('is-dragging');
      roomCursor.dragging = false;
      if (wasCancelled || pointerType !== 'mouse') roomCursor.active = false;
      else updateCursor(event, false);
    };
    const enter = (event: PointerEvent) => updateCursor(event, dragging.current);
    const leave = (event: PointerEvent) => { if (event.pointerType === 'mouse') roomCursor.active = false; };
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
    canvas.addEventListener('pointerenter', enter); canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('click', click, true); canvas.addEventListener('keydown', key);
    const blur = () => {
      pointer = null; dragging.current = false; roomCursor.active = false; roomCursor.dragging = false;
      canvas.classList.remove('is-dragging');
    };
    window.addEventListener('blur', blur);
    return () => {
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      blur(); window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerenter', enter); canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('click', click, true); canvas.removeEventListener('keydown', key);
    };
  }, [roomActive, phase, navigationMode, companionFocus, gl, invalidate, onGesture, motion]);
  useFrame(({ camera }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (companionFocus !== 'closed') {
      const values = companionCameraMotion.current;
      if (values) {
        camera.position.lerpVectors(values.position, values.destination, values.progress);
        camera.quaternion.slerpQuaternions(values.from, values.to, values.progress);
        if (camera.fov !== values.fov) { camera.fov = values.fov; camera.updateProjectionMatrix(); }
      }
      return;
    }
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
