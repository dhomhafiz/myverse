import { Euler, Quaternion } from 'three';
import type { Vec3 } from './room-config';

export type CameraPoseSource = { position: Vec3; target: Vec3; fov: number };
export type CameraLookOffset = { yaw: number; pitch: number; lens: number };

export const neutralCameraLook: CameraLookOffset = { yaw: 0, pitch: 0, lens: 0 };

export function getCameraBaseAngles(pose: CameraPoseSource) {
  const dx = pose.target[0] - pose.position[0];
  const dy = pose.target[1] - pose.position[1];
  const dz = pose.target[2] - pose.position[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

export function hasCameraLookOffset(offset: CameraLookOffset) {
  return Math.abs(offset.yaw) + Math.abs(offset.pitch) + Math.abs(offset.lens) > 0.00001;
}

export function getCameraPose(pose: CameraPoseSource, look: CameraLookOffset = neutralCameraLook) {
  const base = getCameraBaseAngles(pose);
  return {
    position: [...pose.position] as Vec3,
    quaternion: new Quaternion().setFromEuler(new Euler(
      base.pitch + look.pitch,
      base.yaw + look.yaw,
      0,
      'YXZ',
    )),
    fov: pose.fov + look.lens,
  };
}
