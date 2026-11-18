import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Next.js already supplies sharp. Derive both detail levels from one vector master.
const full = await readFile(new URL('../assets/branding/terminal-vine.svg', import.meta.url), 'utf8');
const small = full
  .replace('width="1254" height="1254" viewBox="0 0 1254 1254"', 'width="64" height="64" viewBox="100 100 1054 1054"')
  .replace(/\s*<path data-detail="[^"]+"[^>]*\/>/g, '')
  .replace('stroke-width="50"', 'stroke-width="64"')
  .replace('id="terminal" fill="#ffffff"', 'id="terminal" fill="#ffffff" stroke="#ffffff" stroke-width="12" stroke-linejoin="round"')
  .replace('id="vine" fill="#60bd28"', 'id="vine" fill="#60bd28" stroke="#60bd28" stroke-width="10" stroke-linejoin="round"')
  // Fine leaf notches are closed in the small version to avoid subpixel noise.
  .replace('C542 416 533 402 529 386C534 410 543 425 558 433Z', 'Z')
  .replace('C593 388 608 369 627 357C603 368 588 382 576 398Z', 'Z')
  .replace('C365 626 353 610 337 598C359 608 374 619 387 636Z', 'Z')
  .replace('C533 822 545 806 559 793C540 803 526 816 516 834Z', 'Z');
await writeFile(new URL('../app/icon.svg', import.meta.url), small);
async function render(size) {
  return sharp(Buffer.from(size <= 32 ? small : full)).resize(size, size).png().toBuffer();
}

for (const [name, size] of [['icon1.png', 32], ['icon2.png', 192], ['apple-icon.png', 180]]) {
  await writeFile(new URL(`../app/${name}`, import.meta.url), await render(size));
}

// ICO supports PNG frames: include both native tab sizes without another dependency.
const sizes = [16, 32, 48];
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

// Review sheet: native tab sizes on light/dark surfaces, plus the full mark.
const preview = [];
for (const [row, textColor] of [[0, '#111111'], [1, '#ffffff']]) {
  for (const [column, size] of [16, 32, 64].entries()) {
    const left = 24 + column * 106;
    const top = row * 164;
    preview.push({ input: await render(size), left, top: top + 44 });
    const label = `<svg width="100" height="28"><text x="0" y="19" font-family="Arial" font-size="14" fill="${textColor}">${size} x ${size}</text></svg>`;
    preview.push({ input: Buffer.from(label), left, top: top + 12 });
  }
  preview.push({ input: await render(144), left: 350, top: row * 164 + 10 });
}
const darkSurface = Buffer.from('<svg width="520" height="164"><rect width="520" height="164" fill="#202124"/></svg>');
const previewPng = await sharp({ create: { width: 520, height: 328, channels: 3, background: '#f5f5f5' } })
  .composite([{ input: darkSurface, left: 0, top: 164 }, ...preview])
  .png()
  .toBuffer();
await writeFile(new URL('../docs/favicon-preview.png', import.meta.url), previewPng);
console.log('Generated small SVG, 32px/192px PNGs, 180px Apple icon, and 16px/32px/48px ICO from the vector master.');
