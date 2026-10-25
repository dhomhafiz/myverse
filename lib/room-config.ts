// Metres, right-handed Y-up. Origin: floor centre; back wall is negative Z.
// All placements are floor-level pivots unless a wall-mounted centre is specified.
import { Euler, Vector3 } from 'three';
export type Vec3 = [number, number, number];
export type Placement = { position: Vec3; rotation: Vec3; scale?: Vec3 };
const place = (position: Vec3, yaw = 0): Placement => ({ position, rotation: [0, yaw, 0] });

export const room = {
  width: 5.2, depth: 4.8, height: 2.8,
  desk: place([0, 0, -1.65]),
  gamingPc: {
    position: [1.14, 0.795, -0.06] as Vec3,
    rotation: [0, Math.PI, 0] as Vec3,
    scale: [1.25, 1.25, 1.25] as Vec3,
  },
  chair: { ...place([-0.31, 0, -0.46]), scale: [1.1, 1.1, 1.1] as Vec3 },
  chairStartup: { position: [-0.31, 0, -0.6] as Vec3, rotation: [0, 0, 0] as Vec3 },
  window: place([-0.15, 1.73, -2.34]),
  guitars: place([0, 0, -2.34]),
  guitarTrackLight: place([-1.87, 2.8, -1.98]),
  guitarV: { position: [-2.12, 1.3, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [0.9, 0.9, 0.9] as Vec3 },
  guitarSecond: { position: [-1.62, 1.3, 0] as Vec3, rotation: [0, 0, 0] as Vec3, scale: [0.9, 0.9, 0.9] as Vec3 },
  guitarHanger: { position: [0, 0.74, -0.055] as Vec3 },
  leftWallFeature: {
    position: [-2.585, 1.05, -1.15] as Vec3,
    rotation: [0, Math.PI / 2, 0] as Vec3,
    posterSize: [0.78, 1.12] as [number, number],
    neonSize: [1.32, 0.36] as [number, number],
    neonOffsetY: 0.94,
  },
  pegboard: place([2.48, 1.75, -1.4], -Math.PI / 2),
  cyclingTriptych: {
    ...place([2.5825, 1.82, -0.225], -Math.PI / 2),
    panelSize: [0.37, 0.535] as [number, number],
    panelGap: 0.015,
  },
  bike: place([2.22, 0, 0.68], -Math.PI / 2 + 0.04),
  bikeStand: { ...place([-0.53, 0, 0]), scale: [0.96, 0.96, 0.96] as Vec3 },
  lamp: place([1.62, 0, -2.05]),
  home: { position: [-1.35, 1.6, 1.7] as Vec3, target: [-0.15, 1.23, -1.65] as Vec3, fov: 66 },
};

// Alternate starting composition for visual review; the default remains approved Home.
export const bikeReview = {
  position: [-0.45, 1.6, 1.4] as Vec3,
  target: [2.3, 0.67, 0.68] as Vec3,
  fov: 60,
};
export type ReviewView = 'home' | 'bike';

// Desk-local placement. Local +Z is the screen; +π/2 around X puts it face down.
export const phone = {
  name: 'iphone_15_pro_max',
  position: [-0.87, 0.8045, 0.2] as Vec3,
  rotation: [Math.PI / 2, 0, -0.12] as Vec3,
  scale: [1, 1, 1] as Vec3,
  contactAnchor: { name: 'contact_anchor', position: [0, 0, -0.022] as Vec3 },
  flipPivotName: 'iphone_flip_pivot',
};

// Future focus poses share the room coordinate system; these are not interactive yet.
function relative(placement: Placement & { scale?: Vec3 }, offset: Vec3): Vec3 {
  return new Vector3(...offset)
    .multiply(new Vector3(...(placement.scale ?? [1, 1, 1])))
    .applyEuler(new Euler(...placement.rotation))
    .add(new Vector3(...placement.position)).toArray();
}

export const cameraAnchors = {
  camera_home: room.home,
  camera_projects: { position: relative(room.desk, [-0.7, 1.35, 1.05]), target: relative(room.desk, [-0.66, 1.29, -0.07]) },
  camera_skills: { position: relative(room.desk, [0.3, 1.35, 1.05]), target: relative(room.desk, [0.25, 1.29, -0.07]) },
  camera_about: { position: relative(room.guitars, [0, 1.5, 1.3]), target: relative(room.guitars, [0, 1.3, 0]) },
  camera_contact: {
    position: relative(room.desk, [phone.position[0], 1.2, phone.position[2] + 0.65]),
    target: relative(room.desk, relative(phone, phone.contactAnchor.position)),
  },
  camera_beyond_code: { position: relative(room.pegboard, [0, -0.15, 1.2]), target: room.pegboard.position },
};
