// Isolated v1 play area. Bounds describe outer edges, not centre limits.
// Entirely over the carpet, clear of furniture; this is not furniture collision physics.
export const football = {
  name: 'football',
  radius: 0.12,
  initial: { x: -1.12, z: -0.48 },
  floor: 0.027,
  maxHeight: 0.75, // Outer top edge of the conservative v1 play volume.
  bounds: { minX: -1.55, maxX: -0.52, minZ: -0.82, maxZ: 0.48 },
  physics: {
    step: 1 / 120, maxFrame: 0.05, gravity: 9.81,
    kick: 1.45, lift: 1.65, maxSpeed: 2.8,
    bounce: 0.48, wallBounce: 0.6, rollingFriction: 1.1,
    airDrag: 0.2, settleSpeed: 0.035, bounceThreshold: 0.22,
    reducedKick: 0.65, reducedFriction: 2.2,
  },
};
export type BallState = { x: number; y: number; z: number; vx: number; vy: number; vz: number };
export function createBall(): BallState {
  return { ...football.initial, y: football.floor + football.radius, vx: 0, vy: 0, vz: 0 };
}
export function moving(ball: BallState) { return ball.vx !== 0 || ball.vy !== 0 || ball.vz !== 0; }

// horizontalSide is the camera-right offset of the hit, in ball radii.
export function kickBall(ball: BallState, forwardX: number, forwardZ: number, horizontalSide = 0, reduced = false) {
  const p = football.physics;
  const length = Math.hypot(forwardX, forwardZ);
  const fx = length > 0.000001 ? forwardX / length : 0, fz = length > 0.000001 ? forwardZ / length : -1;
  const bias = Math.max(-1, Math.min(1, horizontalSide)) * 0.85;
  const dx = fx + fz * bias, dz = fz - fx * bias;
  const amount = (reduced ? p.reducedKick : p.kick) / Math.hypot(dx, dz);
  ball.vx += dx * amount; ball.vz += dz * amount;
  if (!reduced) ball.vy = Math.max(0, ball.vy) + p.lift;
  const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
  if (speed > p.maxSpeed) {
    const scale = p.maxSpeed / speed;
    ball.vx *= scale; ball.vy *= scale; ball.vz *= scale;
  }
}

// Called only with a fixed step. No randomness, wall-clock time or rendering objects.
export function stepBall(ball: BallState, reduced = false) {
  const { radius, floor, bounds, physics: p } = football, dt = p.step;
  const ground = floor + radius;
  if (ball.y > ground || ball.vy > 0) ball.vy -= p.gravity * dt;
  ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
  if (ball.y <= ground) {
    ball.y = ground;
    ball.vy = !reduced && ball.vy < -p.bounceThreshold ? -ball.vy * p.bounce : 0;
  }
  if (ball.y > football.maxHeight - radius) {
    ball.y = football.maxHeight - radius;
    ball.vy = -Math.abs(ball.vy) * p.wallBounce;
  }
  const friction = ball.y === ground && ball.vy === 0 ? (reduced ? p.reducedFriction : p.rollingFriction) : p.airDrag;
  const speed = Math.hypot(ball.vx, ball.vz);
  const factor = speed ? Math.max(0, speed - friction * dt) / speed : 0;
  ball.vx *= factor; ball.vz *= factor;
  if (ball.x < bounds.minX + radius) { ball.x = bounds.minX + radius; ball.vx = Math.abs(ball.vx) * p.wallBounce; }
  if (ball.x > bounds.maxX - radius) { ball.x = bounds.maxX - radius; ball.vx = -Math.abs(ball.vx) * p.wallBounce; }
  if (ball.z < bounds.minZ + radius) { ball.z = bounds.minZ + radius; ball.vz = Math.abs(ball.vz) * p.wallBounce; }
  if (ball.z > bounds.maxZ - radius) { ball.z = bounds.maxZ - radius; ball.vz = -Math.abs(ball.vz) * p.wallBounce; }
  if (ball.y === ground && ball.vy === 0 && Math.hypot(ball.vx, ball.vz) < p.settleSpeed) ball.vx = ball.vz = 0;
}
