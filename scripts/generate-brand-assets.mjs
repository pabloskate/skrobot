import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIGHT_BACKGROUND = '#f3f2f6';
const sourceSvg = await readFile(resolve(ROOT, 'public/app-icon.svg'), 'utf8');
const markSvg = sourceSvg.replace(/\s*<rect width="1024" height="1024" fill="#f3f2f6"\/>/, '');
const monochromeSvg = markSvg.replace(/#(?:6431d8|e0455c|221a4e|fff)/gi, '#000000');

const png = (input) => sharp(input, { density: 384 }).png({ compressionLevel: 9 });

async function renderOpaqueIcon(path, size) {
  await png(Buffer.from(sourceSvg))
    .resize(size, size)
    .flatten({ background: LIGHT_BACKGROUND })
    .removeAlpha()
    .toFile(resolve(ROOT, path));
}

async function renderTransparentMark(path, size) {
  await png(Buffer.from(markSvg)).resize(size, size).toFile(resolve(ROOT, path));
}

async function renderPaddedMark(path, size, markSize, source = markSvg, background = null) {
  const mark = await png(Buffer.from(source)).resize(markSize, markSize).toBuffer();
  const offset = Math.round((size - markSize) / 2);
  const canvas = background
    ? { create: { width: size, height: size, channels: 3, background } }
    : { create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } };

  let image = sharp(canvas).composite([{ input: mark, left: offset, top: offset }]);
  if (background) image = image.removeAlpha();
  await image.png({ compressionLevel: 9 }).toFile(resolve(ROOT, path));
}

async function renderSolid(path, size, background) {
  await sharp({ create: { width: size, height: size, channels: 3, background } })
    .png({ compressionLevel: 9 })
    .toFile(resolve(ROOT, path));
}

await Promise.all([
  renderOpaqueIcon('public/favicon.png', 32),
  renderOpaqueIcon('public/apple-icon.png', 180),
  renderOpaqueIcon('public/icon-192.png', 192),
  renderOpaqueIcon('public/icon-512.png', 512),
  renderOpaqueIcon('public/app-icon.png', 1024),
  renderPaddedMark('public/maskable-icon-512.png', 512, 460, markSvg, LIGHT_BACKGROUND),

  renderOpaqueIcon('apps/mobile/assets/favicon.png', 48),
  renderOpaqueIcon('apps/mobile/assets/icon.png', 1024),
  renderTransparentMark('apps/mobile/assets/splash-mascot.png', 1024),
  renderTransparentMark('apps/mobile/assets/splash-icon.png', 1024),
  renderPaddedMark('apps/mobile/assets/android-icon-foreground.png', 512, 432),
  renderPaddedMark('apps/mobile/assets/android-icon-monochrome.png', 512, 432, monochromeSvg),
  renderSolid('apps/mobile/assets/android-icon-background.png', 512, LIGHT_BACKGROUND),
]);

console.log('Generated Skate Robot web and Expo brand assets.');
