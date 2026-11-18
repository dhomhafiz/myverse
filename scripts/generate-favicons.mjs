import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Next.js already supplies sharp. Keep every raster asset derived from the SVG.
const source = await readFile(new URL('../app/icon.svg', import.meta.url));
async function render(size) {
  return sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
}

for (const [name, size] of [['icon1.png', 32], ['icon2.png', 192], ['apple-icon.png', 180]]) {
  await writeFile(new URL(`../app/${name}`, import.meta.url), await render(size));
}

// ICO supports PNG frames: include both native tab sizes without another dependency.
const sizes = [16, 32];
const frames = await Promise.all(sizes.map(render));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2); // Icon image type.
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4); // Color planes.
  header.writeUInt16LE(32, entry + 6); // Bits per pixel.
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, ...frames]));
console.log('Generated 32px and 192px icons, 180px Apple icon, and 16px/32px ICO from app/icon.svg.');
