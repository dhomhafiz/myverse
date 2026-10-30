import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('out');
const requiredRoutes = [
  '',
  'about',
  'beyond',
  'contact',
  'credits',
  'skills',
  'work',
  'work/netflix',
  'work/coming-soon',
  'work/project-preview',
];
const productionAssets = [
  'models/barstool-black-unbranded-compact.glb',
  'models/football-compact.glb',
  'models/football-stars-compact.glb',
  'models/gaming-chair-all-black-swivel-compact.glb',
  'models/gravel-white-black-unbranded-compact.glb',
  'models/guitar-wall-two-spot-track-light.glb',
  'models/mechanical-rgb-keyboard-optimized.glb',
  'models/pc-balanced.glb',
  'models/v-guitar-black-lime-longer.glb',
  'models/v-guitar-black-white-longer.glb',
  'models/wooden-bike-stand.glb',
  'images/about-portrait-original.png',
  'images/beyond/beyond_football_noir.png',
  'images/beyond/beyond-cycling-noir.webp',
  'images/beyond/beyond-gaming-noir.webp',
  'images/beyond/beyond-music-noir.webp',
  'images/cycling-panel-left.webp',
  'images/cycling-panel-center.webp',
  'images/cycling-panel-right.webp',
  'images/selectedwork1.webp',
  'images/social-preview.jpg',
  'images/work-in-progress-noir.webp',
];
const excludedAssets = [
  'models/beanbag-black-unbranded-compact.glb',
  'models/gaming-chair-all-black-compact.glb',
  'models/v-guitar-black-lime-unbranded-compact.glb',
  'models/vertical-bike-display-stand.glb',
  'images/about-approved-reference.png',
  'images/about/approach.webp',
  'images/about/approved-silhouette.webp',
  'images/about/identity.webp',
  'images/about/journey.webp',
  'images/beyond/beyond_cycling_noir.png',
  'images/beyond/beyond_gaming_noir.png',
  'images/beyond/beyond_music_noir.png',
  'images/selectedwork1.png',
  'images/squid-game-2-installation.webp',
];

async function requireFile(relativePath) {
  await access(path.join(outputDirectory, relativePath));
}

for (const route of requiredRoutes) {
  await requireFile(path.join(route, 'index.html'));
}

const homepageHtml = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');
const homepageHead = homepageHtml.match(/<head>[\s\S]*?<\/head>/)?.[0];
if (!homepageHead) {
  throw new Error('Homepage export is missing its document head.');
}

const socialImageUrl = 'https://www.dhomhafiz.dev/images/social-preview.jpg';
if (
  !homepageHead.includes(`property="og:image" content="${socialImageUrl}"`) ||
  !homepageHead.includes(`name="twitter:image" content="${socialImageUrl}"`)
) {
  throw new Error('Homepage Open Graph and Twitter images do not reference the production social preview URL.');
}
if (homepageHead.includes('selectedwork1.webp')) {
  throw new Error('Homepage export still references the previous social preview image.');
}

for (const file of ['robots.txt', 'sitemap.xml', 'third-party-notices.txt']) {
  await requireFile(file);
}

for (const asset of productionAssets) {
  await requireFile(asset);
}

for (const asset of excludedAssets) {
  const outputPath = path.join(outputDirectory, asset);
  try {
    await access(outputPath);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`Excluded unverified asset found in export: ${asset}`);
}

const sourceNotices = await readFile('public/third-party-notices.txt');
const exportedNotices = await readFile(path.join(outputDirectory, 'third-party-notices.txt'));
if (!sourceNotices.equals(exportedNotices)) {
  throw new Error('Exported third-party notices differ from the public source.');
}

const noticeText = sourceNotices.toString('utf8');
for (const notice of [
  'SIL OPEN FONT LICENSE Version 1.1',
  'The MIT License (MIT)',
  'GSAP 3.15.0',
]) {
  if (!noticeText.includes(notice)) {
    throw new Error(`Required third-party notice is missing: ${notice}`);
  }
}

console.log(
  `Static export verified: ${requiredRoutes.length} routes, ${productionAssets.length} production assets, ` +
  `${excludedAssets.length} excluded assets absent, and third-party notices intact.`,
);
