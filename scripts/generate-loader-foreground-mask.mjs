import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Trace only a foreground silhouette; never regenerate or recolor the artwork.
// This runs offline. The browser receives a small vector mask, with no filters.
const source = new URL('../public/images/loader/nature-terminal.webp', import.meta.url);
const { data, info } = await sharp(await readFile(source)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const mask = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const [r, g, b] = data.subarray(i, i + 3);
    // Blue-black backdrop and faint glow are excluded. Dark interior shading is
    // restored below; foreground colors are always read from the original image.
    const terminal = Math.min(r, g, b) >= 40 && Math.max(r, g, b) - Math.min(r, g, b) <= 30;
    const botanicalArea = x / width > 0.17 && x / width < 0.66 && y / height > 0.205 && y / height < 0.785;
    const botanical = botanicalArea && g >= 30 && g - b >= 15 && g >= r * 0.88;
    mask[y * width + x] = terminal || botanical ? 1 : 0;
  }
}

// Fill small enclosed shadow/vein gaps, retaining the larger intentional spaces
// inside the frame, between strokes, and within the curled tendrils.
const visited = new Uint8Array(mask.length);
const queue = new Int32Array(mask.length);
for (let start = 0; start < mask.length; start++) {
  if (mask[start] || visited[start]) continue;
  let head = 0;
  let tail = 1;
  let edge = false;
  queue[0] = start;
  visited[start] = 1;
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = Math.floor(p / width);
    if (!x || !y || x === width - 1 || y === height - 1) edge = true;
    for (const next of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
      if (next < 0 || mask[next] || visited[next]) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  if (!edge && tail < 300) for (let i = 0; i < tail; i++) mask[queue[i]] = 1;
}

// Trace exposed pixel edges into closed contours. Straight runs collapse to one
// segment, retaining the source silhouette without smoothing fine botanical tips.
const stride = width + 1;
const edges = new Map();
function edge(a, b) {
  if (!edges.has(a)) edges.set(a, []);
  edges.get(a).push(b);
}
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (!mask[p]) continue;
    const a = y * stride + x;
    if (!y || !mask[p - width]) edge(a, a + 1);
    if (x === width - 1 || !mask[p + 1]) edge(a + 1, a + stride + 1);
    if (y === height - 1 || !mask[p + width]) edge(a + stride + 1, a + stride);
    if (!x || !mask[p - 1]) edge(a + stride, a);
  }
}
const contours = [];
while (edges.size) {
  const start = edges.keys().next().value;
  const points = [];
  let p = start;
  do {
    points.push([p % stride, Math.floor(p / stride)]);
    const next = edges.get(p);
    if (!next?.length) throw new Error('Open foreground contour.');
    const end = next.pop();
    if (!next.length) edges.delete(p);
    p = end;
  } while (p !== start);
  const corners = points.filter((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
  });
  if (corners.length < 3) continue;
  contours.push(`M${corners.map(point => point.join(' ')).join('L')}Z`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="white" fill-rule="evenodd" d="${contours.join('')}"/></svg>\n`;
await writeFile(new URL('../public/images/loader/nature-terminal-foreground.svg', import.meta.url), svg);
console.log(`Traced ${contours.length} foreground contours (${Buffer.byteLength(svg)} bytes). Original artwork unchanged.`);
