import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { companionRobot } from '../lib/companion-robot-config.ts';
import { room } from '../lib/room-config.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetPath = path.join(root, 'public', companionRobot.modelPath);
const bytes = fs.readFileSync(assetPath);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
assert.equal(json.asset.version, '2.0');
assert.equal(json.images?.length ?? 0, 0);
assert.equal(json.textures?.length ?? 0, 0);
assert.ok(bytes.length < 2 * 1024 * 1024);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const model = gltf.scene;
model.updateMatrixWorld(true);
const nativeBounds = new Box3().setFromObject(model, true);
const nativeSize = nativeBounds.getSize(new Vector3());
assert.ok(Math.abs(nativeBounds.min.y) < 0.00001, 'Origin must sit at the track contact plane');
let triangles = 0;
let meshCount = 0;
model.traverse(o => {
  if (!o.isMesh) return;
  meshCount++;
  triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  assert.ok(o.geometry.attributes.normal, `${o.name}: missing normals`);
  assert.ok(o.scale.distanceTo(new Vector3(1, 1, 1)) < 0.00001, `${o.name}: mesh transforms must be baked`);
  assert.ok(o.matrixWorld.determinant() > 0, 'No mirrored/inverted transforms');
  for (const key of ['position', 'normal']) {
    assert.ok(o.geometry.attributes[key].array.every(Number.isFinite), `${o.name}: invalid ${key}`);
  }
  assert.ok(o.material.isMeshStandardMaterial, `${o.name}: shared PBR material expected`);
});
assert.ok(triangles <= 40_000, `Triangle budget exceeded: ${triangles}`);
const controls = { head_yaw: 'y', neck_pitch: 'x', neck_roll: 'z',
  shoulder_left: 'z', shoulder_right: 'z', elbow_left: 'x', elbow_right: 'x', wrist_left: 'y', wrist_right: 'y' };
const joints = [];
const restPose = {};
for (const [name, axis] of Object.entries(controls)) {
  const joint = model.getObjectByName(name);
  assert.ok(joint, `Missing ${name}`);
  for (const otherAxis of ['x', 'y', 'z']) {
    if (otherAxis !== axis) assert.ok(Math.abs(joint.rotation[otherAxis]) < 0.0001,
      `${name}: rest rotation is not aligned with its ${axis.toUpperCase()} articulation axis`);
  }
  restPose[name] = joint.rotation[axis];
  const child = joint.getObjectByProperty('isMesh', true);
  assert.ok(child, `${name} must own moving geometry`);
  const pivot = joint.getWorldPosition(new Vector3());
  child.geometry.computeBoundingBox();
  const sample = child.geometry.boundingBox.max.clone();
  const before = sample.clone().applyMatrix4(child.matrixWorld);
  const base = joint.rotation[axis];
  joint.rotation[axis] += 0.16;
  model.updateMatrixWorld(true);
  assert.ok(joint.getWorldPosition(new Vector3()).distanceTo(pivot) < 0.000001, `${name}: pivot drift`);
  assert.ok(sample.clone().applyMatrix4(child.matrixWorld).distanceTo(before) > 0.00001, `${name}: no articulation`);
  joint.rotation[axis] = base;
  model.updateMatrixWorld(true);
  joints.push({ name, axis, pivotMetres: pivot.toArray(), limitsDegrees: joint.userData.rotation_limits_degrees });
}
for (const name of ['shoulder_left', 'shoulder_right']) {
  assert.ok(Math.abs(restPose[name]) <= 0.15, `${name}: resting shoulder must be lowered`);
}
for (const name of ['elbow_left', 'elbow_right']) {
  assert.ok(restPose[name] < -0.05 && restPose[name] >= -0.5, `${name}: resting elbow must be slightly bent`);
}
for (const name of ['wrist_left', 'wrist_right']) {
  assert.ok(Math.abs(restPose[name]) <= 0.15, `${name}: resting wrist must be relaxed`);
}
const chassis = model.getObjectByName('chassis');
assert.ok(chassis, 'Chassis node is missing');
const bodyLocal = new Box3();
chassis.children.filter(child => child.isMesh).forEach(child => bodyLocal.union(new Box3().setFromObject(child, true)));
const tracksLocal = new Box3();
for (const name of ['track_left', 'track_right']) tracksLocal.union(new Box3().setFromObject(model.getObjectByName(name), true));
for (const name of ['wrist_left', 'wrist_right']) {
  const hand = new Box3().setFromObject(model.getObjectByName(name), true);
  assert.ok(!hand.intersectsBox(bodyLocal), `${name}: hand or wrist clips the torso`);
  assert.ok(!hand.intersectsBox(tracksLocal), `${name}: hand or wrist clips a track`);
}
assert.ok(model.getObjectByName('head_pivot'), 'Existing camera focus anchor missing');
assert.ok(!new Box3().setFromObject(model.getObjectByName('head_pivot'), true).isEmpty(), 'Mobile camera focus group must contain head geometry');
assert.ok(model.getObjectByName('head_pivot_eyes_cyan')?.isMesh, 'Existing eye/blink contract missing');
assert.ok(model.getObjectByName('companion_root')?.userData.brand === 'dhomhafiz.dev');

// Place exactly as the runtime component, preserving the authored footprint origin.
const placed = new Group();
placed.position.fromArray(companionRobot.position).add(new Vector3(...room.desk.position));
placed.rotation.y = companionRobot.yaw;
const fitted = new Group();
fitted.scale.setScalar(companionRobot.targetHeight / nativeSize.y);
fitted.position.y = -nativeBounds.min.y * fitted.scale.y;
fitted.add(model); placed.add(fitted); placed.updateMatrixWorld(true);
const placedBounds = new Box3().setFromObject(model, true);
const tracks = new Box3();
for (const name of ['track_left', 'track_right']) tracks.union(new Box3().setFromObject(model.getObjectByName(name), true));
const hands = ['wrist_left', 'wrist_right'].map(name => {
  const bounds = new Box3().setFromObject(model.getObjectByName(name), true);
  assert.ok(bounds.min.y >= 0.795, `${name}: hand or wrist clips the desk`);
  return { name, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
});
const desk = { minX: 0.975, maxX: 1.525, minZ: -1.23, maxZ: -0.11, topY: 0.795 };
assert.ok(tracks.min.x >= desk.minX && tracks.max.x <= desk.maxX, 'Track footprint overhangs the desk width');
assert.ok(tracks.min.z >= desk.minZ && tracks.max.z <= desk.maxZ, 'Track footprint overhangs the desk depth');
assert.ok(Math.abs(tracks.min.y - desk.topY) < 0.0001, 'Tracks must contact the tabletop');

// PC textures are irrelevant to bounds; inspect accessor bounds without decoding its images.
function glbBounds(filename) {
  const b = fs.readFileSync(filename);
  const g = JSON.parse(b.subarray(20, 20+b.readUInt32LE(12)).toString());
  const bounds = new Box3();
  function visit(index, parent) {
    const n = g.nodes[index];
    const m = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
      new Vector3(...(n.translation ?? [0,0,0])), new Quaternion(...(n.rotation ?? [0,0,0,1])), new Vector3(...(n.scale ?? [1,1,1])));
    m.premultiply(parent);
    if (n.mesh !== undefined) for (const p of g.meshes[n.mesh].primitives) {
      const a = g.accessors[p.attributes.POSITION];
      bounds.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(m));
    }
    for (const c of n.children ?? []) visit(c, m);
  }
  for (const n of g.scenes[g.scene ?? 0].nodes) visit(n, new Matrix4());
  return bounds;
}
const pcLocal = glbBounds(path.join(root, 'public/models/pc-balanced.glb'));
const pcTransform = new Matrix4().compose(new Vector3(...room.gamingPc.position).add(new Vector3(...room.desk.position)),
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), room.gamingPc.rotation[1]), new Vector3(...room.gamingPc.scale));
const pcBounds = pcLocal.clone().applyMatrix4(pcTransform);
assert.ok(!placedBounds.intersectsBox(pcBounds), 'Robot clips the PC tower');
const pcHeight = pcBounds.getSize(new Vector3()).y;
assert.ok(companionRobot.targetHeight / pcHeight > 0.9 && companionRobot.targetHeight / pcHeight < 1.1);
const monitorBounds = new Box3(new Vector3(-1.12, 1.035, -1.80), new Vector3(0.73, 1.545, -1.60));
assert.ok(!placedBounds.intersectsBox(monitorBounds), 'Robot clips monitor envelope');
assert.ok(placedBounds.min.y >= desk.topY - 0.0001, 'Robot geometry penetrates the tabletop');
assert.ok(placedBounds.min.z > -room.depth / 2 + 0.06 && placedBounds.max.x < room.width / 2 - 0.06
  && placedBounds.min.x > -room.width / 2 + 0.06, 'Robot clips a room wall');
const eye = model.getObjectByName('head_pivot_eyes_cyan');
const faceDirection = new Vector3(0, 0, 1).transformDirection(model.getObjectByName('head_yaw').matrixWorld);
const cameraDirection = new Vector3(...room.home.position).sub(eye.getWorldPosition(new Vector3())).normalize();
const faceCameraAngle = faceDirection.angleTo(cameraDirection) * 180 / Math.PI;
assert.ok(faceCameraAngle < 12, `Face misses camera by ${faceCameraAngle} degrees`);

const report = { asset: companionRobot.modelPath, triangles, meshCount, materials: json.materials.map(m => m.name),
  textures: 0, bytes: bytes.length, nativeDimensionsMetres: nativeSize.toArray(), placedHeightMetres: companionRobot.targetHeight,
  pcHeightMetres: pcHeight, relativePcHeight: companionRobot.targetHeight / pcHeight,
  deskLocalPosition: companionRobot.position, yawRadians: companionRobot.yaw,
  armRestPoseRadians: restPose, hands,
  trackFootprintWorld: { min: tracks.min.toArray(), max: tracks.max.toArray() }, faceCameraAngleDegrees: faceCameraAngle,
  joints, checks: ['GLTFLoader import', 'finite normals', '40k triangle budget', '2 MiB budget', 'joint movement and fixed pivot origins',
    'natural asymmetric arm rest pose', 'hand clearance from torso, tracks, and desk', 'camera focus and blinking node compatibility',
    'track contact and desk support', 'PC, monitor, tabletop and wall clearance', 'camera-facing alignment'] };
fs.mkdirSync(path.join(root, 'artifacts/companion-robot'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts/companion-robot/validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
