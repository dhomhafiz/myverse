'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, Object3D, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import type { RefObject } from 'react';
import type { Material } from 'three';
import type { EntranceMotion } from '@/lib/entrance';
import { roomCursor } from '@/lib/room-state';
import { companionRobot } from '@/lib/companion-robot-config';

const MODEL_PATH = companionRobot.modelPath;
const TARGET_HEIGHT = companionRobot.targetHeight;
const POSITION = companionRobot.position;
const YAW = companionRobot.yaw;
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
  greetingStart: number;
  nextGreetingAt: number;
  attentionUntil: number;
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
    greetingStart: -1,
    nextGreetingAt: 0,
    attentionUntil: 0,
  };
}

function startGreeting(state: AnimationState, reducedMotion: boolean) {
  if (reducedMotion || state.greetingStart >= 0 || state.elapsed < state.nextGreetingAt) return;
  state.greetingStart = state.elapsed;
  state.nextGreetingAt = state.elapsed + 2.4;
}

function greetingAmount(state: AnimationState) {
  if (state.greetingStart < 0) return 0;
  const elapsed = state.elapsed - state.greetingStart;
  const ease = (value: number) => value * value * (3 - 2 * value);
  if (elapsed < 0.22) return 0.78 * ease(elapsed / 0.22);
  if (elapsed < 0.78) return 0.78 + Math.sin((elapsed - 0.22) * Math.PI * 2 * 2.5) * 0.045;
  if (elapsed < 1.02) return 0.78 * (1 - ease((elapsed - 0.78) / 0.24));
  state.greetingStart = -1;
  return 0;
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
  interactive,
  reducedMotion,
  motion,
  interactionSignal,
  hovered,
  onHoverChange,
  onCompanionActivate,
}: {
  active: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  motion: RefObject<EntranceMotion>;
  interactionSignal: number;
  hovered: boolean;
  onHoverChange: (source: 'robot', hovered: boolean) => void;
  onCompanionActivate: () => void;
}) {
  const { scene } = useGLTF(MODEL_PATH);
  const { model, scale, offset, hitSize, hitCenter, headPivot, pitchPivot, rollPivot, armPivot,
    baseHeadRotation, basePitchRotation, baseRollRotation, baseArmRotation, eyeMotion, baseEyePosition, emissiveMaterials } = useMemo(() => {
    const model = scene.clone(true);
    const headPivot = model.getObjectByName('head_yaw');
    const pitchPivot = model.getObjectByName('neck_pitch');
    const rollPivot = model.getObjectByName('neck_roll');
    const armPivot = model.getObjectByName('shoulder_right');
    const eyes = model.getObjectByName('head_pivot_eyes_cyan');
    if (!headPivot || !pitchPivot || !rollPivot || !armPivot || !(eyes instanceof Mesh)) {
      throw new Error('The MyVerse AI Companion model is missing a required head, arm, or cyan eye pivot.');
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
    const fittedScale = TARGET_HEIGHT / size.y;
    return {
      model,
      scale: fittedScale,
      // Keep the authored origin at the track footprint, not at the asymmetrical raised arm.
      offset: [0, -bounds.min.y, 0] as [number, number, number],
      hitSize: [size.x * fittedScale + 0.015, TARGET_HEIGHT + 0.01, size.z * fittedScale + 0.015] as [number, number, number],
      hitCenter: [center.x * fittedScale, TARGET_HEIGHT / 2, center.z * fittedScale] as [number, number, number],
      headPivot,
      pitchPivot,
      rollPivot,
      armPivot,
      baseHeadRotation: headPivot.rotation.clone(),
      basePitchRotation: pitchPivot.rotation.clone(),
      baseRollRotation: rollPivot.rotation.clone(),
      baseArmRotation: armPivot.rotation.clone(),
      eyeMotion,
      baseEyePosition,
      emissiveMaterials: [...emissiveMap.values()],
    };
  }, [scene]);
  const root = useRef<Group>(null);
  const animatedObjects = useRef<{ headPivot: Object3D | null; pitchPivot: Object3D | null; rollPivot: Object3D | null; armPivot: Object3D | null; eyeMotion: Group | null }>({
    headPivot: null,
    pitchPivot: null,
    rollPivot: null,
    armPivot: null,
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
    greetingStart: -1,
    nextGreetingAt: 0,
    attentionUntil: 0,
  });
  const wasHovered = useRef(false);
  const wasActive = useRef(active);
  const previousInteractionSignal = useRef(interactionSignal);
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
  const acknowledge = useEffectEvent(() => {
    if (!active) return;
    const state = animation.current;
    state.attentionUntil = state.elapsed + 1.35;
    if (state.blinkStart < 0) state.blinkStart = state.elapsed;
    startGreeting(state, reducedMotion);
    motion.current.invalidate?.();
  });

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
    animatedObjects.current.pitchPivot = pitchPivot;
    animatedObjects.current.rollPivot = rollPivot;
    animatedObjects.current.armPivot = armPivot;
    animatedObjects.current.eyeMotion = eyeMotion;
    animation.current = resetAnimation();
    wasHovered.current = false;
    headPivot.rotation.copy(baseHeadRotation);
    pitchPivot.rotation.copy(basePitchRotation);
    rollPivot.rotation.copy(baseRollRotation);
    armPivot.rotation.copy(baseArmRotation);
    eyeMotion.position.copy(baseEyePosition);
    eyeMotion.scale.set(1, 1, 1);
    motion.current.invalidate?.();
    return () => {
      headPivot.rotation.copy(baseHeadRotation);
      pitchPivot.rotation.copy(basePitchRotation);
      rollPivot.rotation.copy(baseRollRotation);
      armPivot.rotation.copy(baseArmRotation);
      eyeMotion.position.copy(baseEyePosition);
      eyeMotion.scale.set(1, 1, 1);
    };
  }, [active, reducedMotion, model, headPivot, pitchPivot, rollPivot, armPivot, baseHeadRotation,
    basePitchRotation, baseRollRotation, baseArmRotation, eyeMotion, baseEyePosition, motion]);

  useEffect(() => {
    if (interactionSignal === previousInteractionSignal.current) return;
    previousInteractionSignal.current = interactionSignal;
    acknowledge();
  }, [interactionSignal]);

  useEffect(() => {
    const state = animation.current;
    if (!active) {
      wasHovered.current = false;
      wasActive.current = false;
      return;
    }
    if (!wasActive.current) {
      wasActive.current = true;
      wasHovered.current = hovered;
      return;
    }
    if (hovered && !wasHovered.current) {
      state.attentionUntil = state.elapsed + 1.1;
      startGreeting(state, reducedMotion);
      motion.current.invalidate?.();
    }
    wasHovered.current = hovered;
  }, [active, hovered, motion, reducedMotion]);

  useFrame(({ camera }, unboundedDelta) => {
    if (!active || reducedMotion || !pageVisible.current) return;
    const animated = animatedObjects.current;
    const head = animated.headPivot;
    const pitch = animated.pitchPivot;
    const roll = animated.rollPivot;
    const arm = animated.armPivot;
    const eyes = animated.eyeMotion;
    if (!head || !pitch || !roll || !arm || !eyes) return;
    const delta = Math.min(unboundedDelta, 0.05);
    if (motion.current.lights.room < 0.95) {
      head.rotation.copy(baseHeadRotation);
      pitch.rotation.copy(basePitchRotation);
      roll.rotation.copy(baseRollRotation);
      arm.rotation.copy(baseArmRotation);
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
    const cursorTracking = roomCursor.active && !roomCursor.dragging;
    const cursor = roomCursor;
    const modelRoot = root.current;
    if (cursorTracking && modelRoot) {
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
    const attentive = hovered || state.elapsed < state.attentionUntil;
    if (attentive) {
      targetYaw = cursorTracking ? MathUtils.clamp(targetYaw + 0.06, -MAX_TRACKING_YAW, MAX_TRACKING_YAW) : 0.12;
      targetPitch = cursorTracking ? targetPitch : 0.035;
      targetEyeX = cursorTracking ? targetEyeX : 0.002;
      targetEyeY = Math.max(targetEyeY, 0.0015);
    }

    state.yaw = MathUtils.damp(state.yaw, targetYaw, 4.5, delta);
    state.pitch = MathUtils.damp(state.pitch, targetPitch, 4.5, delta);
    state.roll = MathUtils.damp(state.roll, state.idleRoll + (attentive ? 0.045 : 0), 3.2, delta);
    state.eyeX = MathUtils.damp(state.eyeX, targetEyeX, 8, delta);
    state.eyeY = MathUtils.damp(state.eyeY, targetEyeY, 8, delta);
    head.rotation.y = baseHeadRotation.y + state.yaw;
    pitch.rotation.x = basePitchRotation.x - state.pitch;
    roll.rotation.z = baseRollRotation.z + state.roll;
    arm.rotation.z = baseArmRotation.z - greetingAmount(state);
    eyes.position.set(baseEyePosition.x + state.eyeX, baseEyePosition.y + state.eyeY, baseEyePosition.z);
    eyes.scale.y = 1 - 0.97 * blinkAmount(state);
    motion.current.invalidate?.();
  });

  return (
    <group ref={root} name="myverse_ai_companion" position={POSITION} rotation={[0, YAW, 0]} dispose={null}>
      <mesh
        name="myverse_ai_companion_hit_target"
        position={hitCenter}
        onPointerOver={event => {
          if (!interactive) return;
          event.stopPropagation();
          if (event.nativeEvent.pointerType !== 'touch') onHoverChange('robot', true);
        }}
        onPointerOut={event => {
          if (interactive) event.stopPropagation();
          if (event.nativeEvent.pointerType !== 'touch') onHoverChange('robot', false);
        }}
        onPointerCancel={() => onHoverChange('robot', false)}
        onClick={event => {
          if (!interactive) return;
          event.stopPropagation();
          if (!roomCursor.dragging) onCompanionActivate();
        }}
      >
        <boxGeometry args={hitSize} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <object3D name="myverse_ai_companion_hotspot_anchor" position={[0.15, TARGET_HEIGHT + 0.04, 0.04]} />
      <group scale={scale}>
        <group position={offset}><primitive object={model} /></group>
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
