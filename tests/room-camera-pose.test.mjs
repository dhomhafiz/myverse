import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, PerspectiveCamera, Vector3 } from 'three';
import { room } from '../lib/room-config.ts';
import { getCameraPose, hasCameraLookOffset, neutralCameraLook } from '../lib/room-camera-pose.ts';

test('the neutral room camera pose looks at the configured Home target without roll', () => {
  const pose = getCameraPose(room.home);
  const direction = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
  const targetDirection = new Vector3(...room.home.target)
    .sub(new Vector3(...room.home.position))
    .normalize();
  const rotation = new Euler().setFromQuaternion(pose.quaternion, 'YXZ');
  const baseline = new PerspectiveCamera(room.home.fov, 1);
  baseline.position.fromArray(room.home.position);
  baseline.lookAt(new Vector3(...room.home.target));

  assert.deepEqual(pose.position, room.home.position);
  assert.equal(pose.fov, room.home.fov);
  assert.deepEqual(baseline.up.toArray(), [0, 1, 0]);
  assert.ok(pose.quaternion.angleTo(baseline.quaternion) < 1e-8);
  assert.ok(direction.distanceTo(targetDirection) < 1e-10);
  assert.ok(Math.abs(rotation.z) < 1e-10);

  const mobilePose = getCameraPose({ ...room.home, fov: 86 });
  assert.deepEqual(mobilePose.position, room.home.position);
  assert.equal(mobilePose.fov, 86);
  assert.ok(mobilePose.quaternion.angleTo(baseline.quaternion) < 1e-8);
});

test('the Home pose retains deliberate Free Look offsets without adding roll', () => {
  const look = { yaw: 0.17, pitch: -0.08, lens: 3 };
  const pose = getCameraPose(room.home, look);
  const base = getCameraPose(room.home);
  const rotation = new Euler().setFromQuaternion(pose.quaternion, 'YXZ');

  assert.ok(pose.quaternion.angleTo(base.quaternion) > 0.1);
  assert.equal(pose.fov, room.home.fov + look.lens);
  assert.ok(Math.abs(rotation.z) < 1e-10);
  assert.equal(hasCameraLookOffset(neutralCameraLook), false);
  assert.equal(hasCameraLookOffset(look), true);
});
