import { room, bikeReview, type ReviewView, type Vec3 } from './room-config';

// Configurable review poses; no furniture or approved Home transforms change.
export const entrance = {
  desktop: { position: [-0.65, 1.43, -0.55] as Vec3, target: [-0.18, 1.29, -1.72] as Vec3, fov: 77 },
  mobile: { position: [-0.75, 1.48, 0.65] as Vec3, target: [-0.18, 1.29, -1.72] as Vec3, fov: 86 },
};
export type EntranceMotion = {
  camera: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number };
  lights: { monitors: number; pc: number; lamp: number; room: number };
  chair: { x: number; y: number; z: number; yaw: number };
  invalidate?: () => void;
};
export function poseValues(pose: typeof entrance.desktop) {
  return { x: pose.position[0], y: pose.position[1], z: pose.position[2], tx: pose.target[0], ty: pose.target[1], tz: pose.target[2], fov: pose.fov };
}
export function finalPose(view: ReviewView, mobile: boolean) {
  const pose = view === 'bike' ? bikeReview : room.home;
  return poseValues({ ...pose, fov: mobile ? 86 : pose.fov });
}
export function createEntranceMotion(): EntranceMotion {
  return {
    camera: poseValues(entrance.desktop),
    lights: { monitors: 0, pc: 0, lamp: 0, room: 0 },
    chair: { x: room.chair.position[0], y: room.chair.position[1], z: room.chair.position[2], yaw: room.chair.rotation[1] },
  };
}
