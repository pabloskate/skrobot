import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIPS = resolve(ROOT, 'src/features/gallery/tips.ts');
const OUT = resolve(ROOT, 'public/tips');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const source = await readFile(TIPS, 'utf8');
const ids = [...source.matchAll(/igId: '([^']+)'/g)].map((match) => match[1]);
if (ids.length === 0) throw new Error('No Instagram reel ids found in tips.ts');

await mkdir(OUT, { recursive: true });

for (const id of ids) {
  const response = await fetch(`https://www.instagram.com/p/${id}/media/?size=l`, {
    headers: { 'user-agent': UA },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Failed to fetch ${id}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('image/')) throw new Error(`Non-image response for ${id}: ${type}`);
  await sharp(buffer).resize({ width: 480 }).jpeg({ quality: 78 }).toFile(resolve(OUT, `${id}.jpg`));
  console.log(id);
}
