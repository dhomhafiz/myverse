import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/models/floor-uplighter-optimized.glb');
const buffer = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
let triangleCount = 0;

const materials = [
  {
    name: 'Satin black metal',
    pbrMetallicRoughness: { baseColorFactor: [0.045, 0.05, 0.053, 1], metallicFactor: 0.78, roughnessFactor: 0.34 },
  },
  {
    name: 'Matte black switch',
    pbrMetallicRoughness: { baseColorFactor: [0.055, 0.059, 0.061, 1], metallicFactor: 0.08, roughnessFactor: 0.62 },
  },
  {
    name: 'Warm opal reflector',
    pbrMetallicRoughness: { baseColorFactor: [0.9, 0.89, 0.85, 1], metallicFactor: 0.02, roughnessFactor: 0.46 },
  },
  {
    name: 'Warm practical bulb',
    pbrMetallicRoughness: { baseColorFactor: [0.95, 0.81, 0.62, 1], metallicFactor: 0, roughnessFactor: 0.36 },
    emissiveFactor: [0.34, 0.13, 0.025],
  },
];

function normalized(vector) {
  const length = Math.hypot(...vector);
  return length ? vector.map(value => value / length) : [0, 1, 0];
}

function lathe(name, profile, radialSegments, materialIndex) {
  const positions = [];
  const indices = [];
  const rowLength = radialSegments + 1;

  for (const [radius, y] of profile) {
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      positions.push(radius * Math.cos(angle), y, radius * Math.sin(angle));
    }
  }

  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const lower = ring * rowLength + segment;
      const upper = (ring + 1) * rowLength + segment;
      indices.push(lower, upper, upper + 1, lower, upper + 1, lower + 1);
    }
  }

  addMesh(name, positions, indices, materialIndex);
}

function box(name, center, size, materialIndex) {
  const [x, y, z] = center;
  const [width, height, depth] = size;
  const x0 = x - width / 2, x1 = x + width / 2;
  const y0 = y - height / 2, y1 = y + height / 2;
  const z0 = z - depth / 2, z1 = z + depth / 2;
  const faces = [
    { normal: [1, 0, 0], points: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { normal: [-1, 0, 0], points: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
    { normal: [0, 1, 0], points: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { normal: [0, -1, 0], points: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { normal: [0, 0, 1], points: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, 0, -1], points: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
  ];
  const positions = [];
  const normals = [];
  const indices = [];

  for (const face of faces) {
    const vertexOffset = positions.length / 3;
    for (const point of face.points) {
      positions.push(...point);
      normals.push(...face.normal);
    }
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }

  addMesh(name, positions, indices, materialIndex, normals);
}

function sphere(name, center, radius, widthSegments, heightSegments, materialIndex) {
  const positions = [];
  const indices = [];

  for (let row = 0; row <= heightSegments; row += 1) {
    const latitude = row / heightSegments * Math.PI;
    for (let column = 0; column <= widthSegments; column += 1) {
      const longitude = column / widthSegments * Math.PI * 2;
      positions.push(
        center[0] + radius * Math.sin(latitude) * Math.cos(longitude),
        center[1] + radius * Math.cos(latitude),
        center[2] + radius * Math.sin(latitude) * Math.sin(longitude),
      );
    }
  }

  const rowLength = widthSegments + 1;
  for (let row = 0; row < heightSegments; row += 1) {
    for (let column = 0; column < widthSegments; column += 1) {
      const lower = row * rowLength + column;
      const upper = lower + rowLength;
      indices.push(lower, lower + 1, upper, lower + 1, upper + 1, upper);
    }
  }

  const normals = positions.map((_, index) => (positions[index] - center[index % 3]) / radius);
  addMesh(name, positions, indices, materialIndex, normals);
}

function appendBytes(bytes, target) {
  while (buffer.length % 4) buffer.push(0);
  const byteOffset = buffer.length;
  buffer.push(...bytes);
  const bufferView = bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target }) - 1;
  while (buffer.length % 4) buffer.push(0);
  return bufferView;
}

function floatBytes(values) {
  const array = new Float32Array(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function indexBytes(values) {
  const array = new Uint16Array(values);
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function addAccessor(bufferView, componentType, count, type, min, max) {
  const accessor = { bufferView, componentType, count, type };
  if (min) accessor.min = min;
  if (max) accessor.max = max;
  accessors.push(accessor);
  return accessors.length - 1;
}

function addMesh(name, positions, indices, materialIndex, suppliedNormals) {
  const normals = suppliedNormals ?? new Array(positions.length).fill(0);
  if (!suppliedNormals) {
    for (let index = 0; index < indices.length; index += 3) {
      const a = indices[index] * 3, b = indices[index + 1] * 3, c = indices[index + 2] * 3;
      const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
      const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
      const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      for (const vertex of [a, b, c]) {
        normals[vertex] += normal[0];
        normals[vertex + 1] += normal[1];
        normals[vertex + 2] += normal[2];
      }
    }
    for (let index = 0; index < normals.length; index += 3) {
      const normal = normalized(normals.slice(index, index + 3));
      normals.splice(index, 3, ...normal);
    }
  }

  const vertexCount = positions.length / 3;
  const min = [0, 1, 2].map(axis => Math.min(...positions.filter((_, index) => index % 3 === axis)));
  const max = [0, 1, 2].map(axis => Math.max(...positions.filter((_, index) => index % 3 === axis)));
  const positionAccessor = addAccessor(appendBytes(floatBytes(positions), 34962), 5126, vertexCount, 'VEC3', min, max);
  const normalAccessor = addAccessor(appendBytes(floatBytes(normals), 34962), 5126, vertexCount, 'VEC3');
  const indexAccessor = addAccessor(appendBytes(indexBytes(indices), 34963), 5123, indices.length, 'SCALAR');

  meshes.push({
    name,
    primitives: [{
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
      indices: indexAccessor,
      material: materialIndex,
    }],
  });
  nodes.push({ name, mesh: meshes.length - 1 });
  triangleCount += indices.length / 3;
}

lathe('Weighted rounded base', [
  [0.012, 0.006], [0.12, 0.006], [0.18, 0.008], [0.205, 0.018],
  [0.216, 0.035], [0.212, 0.051], [0.196, 0.066], [0.155, 0.077],
  [0.012, 0.081], [0.012, 0.006],
], 24, 0);

lathe('Single satin metal pole', [[0.014, 0.075], [0.014, 1.94]], 12, 0);

box('Inline pole switch', [0.022, 0.88, 0], [0.032, 0.085, 0.035], 1);
box('Switch slider', [0.022, 0.88, 0.019], [0.014, 0.03, 0.008], 0);

lathe('Tapered shade housing', [
  [0.028, 1.91], [0.043, 1.918], [0.05, 1.945], [0.064, 1.99],
  [0.082, 2.035], [0.084, 2.05], [0.074, 2.05], [0.058, 2.018],
  [0.041, 1.97], [0.028, 1.94],
], 24, 0);

lathe('Shallow opal uplighter bowl', [
  [0.048, 2.025], [0.09, 2.034], [0.14, 2.052], [0.19, 2.08],
  [0.225, 2.12], [0.243, 2.165], [0.25, 2.18], [0.244, 2.18],
  [0.235, 2.165], [0.219, 2.124], [0.185, 2.087], [0.136, 2.059],
  [0.087, 2.042], [0.048, 2.04],
], 36, 2);

sphere('Warm bulb', [0, 2.075, 0], 0.027, 12, 8, 3);

const scene = {
  asset: {
    version: '2.0',
    generator: 'MyVerse procedural floor uplighter',
    extras: { notes: 'Original low-poly reconstruction from a user-provided reference; electrical cord intentionally omitted.' },
  },
  scene: 0,
  scenes: [{ name: 'Floor uplighter', nodes: [0] }],
  nodes: [{ name: 'floor_uplighter', children: nodes.map((_, index) => index + 1) }, ...nodes],
  meshes,
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: buffer.length }],
};

const json = Buffer.from(JSON.stringify(scene));
const jsonPadding = (4 - json.length % 4) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
const binaryChunk = Buffer.from(buffer);
const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(binaryChunk.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]));
console.log(`Wrote ${output}`);
console.log(`${triangleCount.toLocaleString()} triangles, ${binaryChunk.length.toLocaleString()} binary bytes`);
