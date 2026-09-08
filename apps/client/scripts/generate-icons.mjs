import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const source = path.join(publicDir, 'dink-derby-icon.svg');

const icons = [
  { file: 'pwa-192.png', size: 192, pad: 0 },
  { file: 'pwa-512.png', size: 512, pad: 0 },
  { file: 'pwa-maskable-512.png', size: 512, pad: 0.12 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0 },
];

const svg = await readFile(source);

for (const { file, size, pad } of icons) {
  const iconSize = Math.round(size * (1 - pad * 2));
  const logo = await sharp(svg, { density: 400 }).resize(iconSize, iconSize).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#123b35' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, file));
  console.log(`wrote ${file} (${size}x${size})`);
}
