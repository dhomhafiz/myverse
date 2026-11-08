/** Desk-local metres; glTF front +Z. PC rendered height: 0.45 * 1.25 = 0.5625 m. */
export const companionRobot = {
  modelPath: '/models/myverse_companion_robot_v2.glb',
  targetHeight: 0.54,
  position: [1.25, 0.795, 0.72] as [number, number, number],
  // Home camera lies to the robot's front-left. ~45 degrees faces the lens.
  yaw: -0.78,
};
