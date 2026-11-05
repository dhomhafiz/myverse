'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import type { RefObject } from 'react';
import type { Material } from 'three';
import type { EntranceMotion } from '@/lib/entrance';
import { roomCursor } from '@/lib/room-state';

const MODEL_PATH = '/models/myverse_ai_companion_v1.glb';
const TARGET_HEIGHT = 0.3;
const TABLETOP_Y = 0.76 + 0.07 / 2;
const POSITION: [number, number, number] = [1.25, TABLETOP_Y, 0.64];
const YAW = -0.72;
const MAX_TRACKING_YAW = 0.4;
const MAX_TRACKING_PITCH = 0.22;
const BLINK_CLOSE = 0.08;
const BLINK_HOLD = 0.03;
const BLINK_OPEN = 0.13;

type AnimationState = {
  elapsed: number;
  nextIdleAt: number;
  idleYaw: number;
  idlePitch: number;
  idleRoll: number;
  yaw: number;
  pitch: number;
  roll: number;
  eyeX: number;
  eyeY: number;
  nextBlinkAt: number;
  blinkStart: number;
};

function resetAnimation(): AnimationState {
  return {
    elapsed: 0,
    nextIdleAt: 2 + Math.random() * 3,
    idleYaw: 0,
    idlePitch: 0,
    idleRoll: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeX: 0,
    eyeY: 0,
    nextBlinkAt: 3 + Math.random() * 4,
    blinkStart: -1,
  };
}

function blinkAmount(state: AnimationState) {
  if (state.blinkStart < 0 && state.elapsed >= state.nextBlinkAt) state.blinkStart = state.elapsed;
  if (state.blinkStart < 0) return 0;
  const time = state.elapsed - state.blinkStart;
  if (time < BLINK_CLOSE) {
    const progress = time / BLINK_CLOSE;
    return progress * progress * (3 - 2 * progress);
  }
  if (time < BLINK_CLOSE + BLINK_HOLD) return 1;
  if (time < BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN) {
    const progress = (time - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
    return 1 - progress * progress * (3 - 2 * progress);
  }
  state.blinkStart = -1;
  state.nextBlinkAt = state.elapsed + (Math.random() < 0.14 ? 0.22 : 3 + Math.random() * 4);
  return 0;
}

export default function MyVerseAICompanion({
  active,
  reducedMotion,
  motion,
}: {
  active: boolean;
  reducedMotion: boolean;
  motion: RefObject<EntranceMotion>;
}) {
  const { scene } = useGLTF(MODEL_PATH);
  const { model, scale, offset, headPivot, baseHeadRotation, eyeMotion, baseEyePosition, emissiveMaterials } = useMemo(() => {
    const model = scene.clone(true);
    const headPivot = model.getObjectByName('head_pivot');
    const eyes = model.getObjectByName('head_pivot_eyes_cyan');
    if (!headPivot || !(eyes instanceof Mesh)) {
      throw new Error('The MyVerse AI Companion model is missing its head pivot or cyan eye mesh.');
    }

    const eyeParent = eyes.parent;
    if (!eyeParent) throw new Error('The MyVerse AI Companion eye mesh has no parent.');
    eyes.geometry.computeBoundingBox();
    const eyeBounds = eyes.geometry.boundingBox;
    if (!eyeBounds) throw new Error('The MyVerse AI Companion eye mesh has no measurable geometry bounds.');
    const eyeCenter = eyeBounds.getCenter(new Vector3());
    const eyeOffset = eyeCenter.clone().multiply(eyes.scale).applyQuaternion(eyes.quaternion);
    const eyeMotion = new Group();
    eyeMotion.name = 'myverse_ai_companion_eye_control';
    eyeMotion.position.copy(eyes.position).add(eyeOffset);
    eyes.position.copy(eyeOffset).negate();
    eyeParent.remove(eyes);
    eyeMotion.add(eyes);
    eyeParent.add(eyeMotion);
    const baseEyePosition = eyeMotion.position.clone();

    const emissiveMap = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const isolateEmissive = (material: Material) => {
        if (!(material instanceof MeshStandardMaterial) || material.emissive.getHex() === 0) return material;
        let clone = emissiveMap.get(material);
        if (!clone) {
          clone = material.clone();
          emissiveMap.set(material, clone);
        }
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(isolateEmissive)
        : isolateEmissive(object.material);
    });
    const bounds = new Box3().setFromObject(model, true);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    return {
      model,
      scale: TARGET_HEIGHT / size.y,
      offset: [-center.x, -bounds.min.y, -center.z] as [number, number, number],
      headPivot,
      baseHeadRotation: headPivot.rotation.clone(),
      eyeMotion,
      baseEyePosition,
      emissiveMaterials: [...emissiveMap.values()],
    };
  }, [scene]);
  const root = useRef<Group>(null);
  const animatedObjects = useRef<{ headPivot: Object3D | null; eyeMotion: Group | null }>({
    headPivot: null,
    eyeMotion: null,
  });
  const animation = useRef<AnimationState>({
    elapsed: 0,
    nextIdleAt: 0,
    idleYaw: 0,
    idlePitch: 0,
    idleRoll: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeX: 0,
    eyeY: 0,
    nextBlinkAt: 0,
    blinkStart: -1,
  });
  const pageVisible = useRef(true);
  const scratch = useMemo(() => ({
    raycaster: new Raycaster(),
    cursor: new Vector2(),
    plane: new Plane(),
    cameraDirection: new Vector3(),
    headPosition: new Vector3(),
    intersection: new Vector3(),
    forward: new Vector3(),
    direction: new Vector3(),
    inverseRootRotation: new Quaternion(),
    rootRotation: new Quaternion(),
  }), []);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) emissiveMaterials.forEach(material => material.dispose());
      });
    };
  }, [emissiveMaterials]);

  useEffect(() => {
    const updateVisibility = () => {
      pageVisible.current = !document.hidden;
      if (pageVisible.current) motion.current.invalidate?.();
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, [motion]);

  useLayoutEffect(() => {
    animatedObjects.current.headPivot = headPivot;
    animatedObjects.current.eyeMotion = eyeMotion;
    animation.current = resetAnimation();
    headPivot.rotation.copy(baseHeadRotation);
    eyeMotion.position.copy(baseEyePosition);
    eyeMotion.scale.set(1, 1, 1);
    motion.current.invalidate?.();
  }, [active, reducedMotion, model, headPivot, baseHeadRotation, eyeMotion, baseEyePosition, motion]);

  useFrame(({ camera }, unboundedDelta) => {
    if (!active || reducedMotion || !pageVisible.current) return;
    const animated = animatedObjects.current;
    const head = animated.headPivot;
    const eyes = animated.eyeMotion;
    if (!head || !eyes) return;
    const delta = Math.min(unboundedDelta, 0.05);
    if (motion.current.lights.room < 0.95) {
      head.rotation.copy(baseHeadRotation);
      eyes.position.copy(baseEyePosition);
      eyes.scale.set(1, 1, 1);
      return;
    }

    const state = animation.current;
    state.elapsed += delta;
    if (state.elapsed >= state.nextIdleAt) {
      state.idleYaw = (Math.random() * 2 - 1) * 0.1;
      state.idlePitch = (Math.random() * 2 - 1) * 0.06;
      state.idleRoll = (Math.random() * 2 - 1) * 0.035;
      state.nextIdleAt = state.elapsed + 2.5 + Math.random() * 4;
    }

    let targetYaw = state.idleYaw;
    let targetPitch = state.idlePitch;
    let targetEyeX = 0;
    let targetEyeY = 0;
    const cursor = roomCursor;
    const modelRoot = root.current;
    if (cursor.active && !cursor.dragging && modelRoot) {
      scratch.cursor.set(cursor.x, cursor.y);
      camera.getWorldDirection(scratch.cameraDirection);
      head.getWorldPosition(scratch.headPosition);
      scratch.plane.setFromNormalAndCoplanarPoint(scratch.cameraDirection, scratch.headPosition);
      scratch.raycaster.setFromCamera(scratch.cursor, camera);
      if (scratch.raycaster.ray.intersectPlane(scratch.plane, scratch.intersection)) {
        modelRoot.getWorldQuaternion(scratch.rootRotation);
        scratch.forward.set(0, 0, 1).applyQuaternion(scratch.rootRotation);
        scratch.direction.copy(scratch.intersection).sub(scratch.headPosition).addScaledVector(scratch.forward, 1);
        scratch.inverseRootRotation.copy(scratch.rootRotation).invert();
        scratch.direction.applyQuaternion(scratch.inverseRootRotation);
        const horizontal = Math.hypot(scratch.direction.x, scratch.direction.z);
        const trackedYaw = MathUtils.clamp(Math.atan2(scratch.direction.x, scratch.direction.z), -MAX_TRACKING_YAW, MAX_TRACKING_YAW);
        const trackedPitch = MathUtils.clamp(Math.atan2(scratch.direction.y, horizontal), -MAX_TRACKING_PITCH, MAX_TRACKING_PITCH);
        targetYaw = MathUtils.clamp(trackedYaw + state.idleYaw * 0.18, -MAX_TRACKING_YAW, MAX_TRACKING_YAW);
        targetPitch = MathUtils.clamp(trackedPitch + state.idlePitch * 0.18, -MAX_TRACKING_PITCH, MAX_TRACKING_PITCH);
        const depth = Math.max(scratch.direction.z, 0.15);
        targetEyeX = MathUtils.clamp((scratch.direction.x / depth) * 0.012, -0.006, 0.006);
        targetEyeY = MathUtils.clamp((scratch.direction.y / depth) * 0.012, -0.003, 0.003);
      }
    }

    state.yaw = MathUtils.damp(state.yaw, targetYaw, 4.5, delta);
    state.pitch = MathUtils.damp(state.pitch, targetPitch, 4.5, delta);
    state.roll = MathUtils.damp(state.roll, state.idleRoll, 3.2, delta);
    state.eyeX = MathUtils.damp(state.eyeX, targetEyeX, 8, delta);
    state.eyeY = MathUtils.damp(state.eyeY, targetEyeY, 8, delta);
    head.rotation.set(
      baseHeadRotation.x + state.pitch,
      baseHeadRotation.y + state.yaw,
      baseHeadRotation.z + state.roll,
      baseHeadRotation.order,
    );
    eyes.position.set(baseEyePosition.x + state.eyeX, baseEyePosition.y + state.eyeY, baseEyePosition.z);
    eyes.scale.y = 1 - 0.97 * blinkAmount(state);
    motion.current.invalidate?.();
  });

  return (
    <group ref={root} name="myverse_ai_companion" position={POSITION} rotation={[0, YAW, 0]} dispose={null}>
      <group scale={scale}>
        <group position={offset}><primitive object={model} /></group>
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
