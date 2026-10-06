import { Bake, NO_INK, type Ink } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { hash2 } from '../setKit';
import { mixHex } from '../../math';

const LEAVES: Ink = { ...NO_INK, solid: 13 };
const FOLIAGE = ['#486547', '#55764a', '#698653', '#3f6042', '#738b54'];
const N: Vec3 = [0, 1, 0];

/** A small physical stencil alphabet: signage remains legible from an orbit. */
const LETTERS: Record<string, string[]> = {
  A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
  B: ['11110', '11011', '11011', '11110', '11011', '11011', '11110'],
  C: ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
  D: ['11110', '11011', '11011', '11011', '11011', '11011', '11110'],
  E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
  F: ['11111', '11000', '11000', '11110', '11000', '11000', '11000'],
  H: ['11011', '11011', '11011', '11111', '11011', '11011', '11011'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['11000', '11000', '11000', '11000', '11000', '11000', '11111'],
  M: ['10001', '11011', '11111', '10101', '10001', '10001', '10001'],
  N: ['11001', '11001', '11101', '11111', '11011', '11011', '11001'],
  O: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  P: ['11110', '11011', '11011', '11110', '11000', '11000', '11000'],
  R: ['11110', '11011', '11011', '11110', '11100', '11010', '11011'],
  S: ['01111', '11000', '11000', '01110', '00011', '00011', '11110'],
  T: ['11111', '00110', '00110', '00110', '00110', '00110', '00110'],
  U: ['11011', '11011', '11011', '11011', '11011', '11011', '01110'],
  W: ['10001', '10001', '10001', '10101', '11111', '11011', '10001'],
  Y: ['10001', '11011', '01110', '00100', '00100', '00100', '00100'],
  '0': ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '%': ['11001', '11010', '00100', '00100', '01000', '10110', '00110'],
  '7': ['11111', '00011', '00110', '00110', '01100', '01100', '01100'],
  '9': ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
  '5': ['11111', '11000', '11000', '11110', '00011', '00011', '11110'],
};

export function sunsetLettering(props: Bake, text: string, origin: Vec3, right: Vec3, scale: number, color = '#f3ede0') {
  const n: Vec3 = [-right[2], 0, right[0]];
  const at = (x: number, y: number): Vec3 => [origin[0] + right[0] * x, origin[1] + y, origin[2] + right[2] * x];
  for (let k = 0; k < text.length; k++) {
    const letter = LETTERS[text[k]];
    if (!letter) continue;
    letter.forEach((row, y) => {
      // Merge adjacent filled pixels into a stroke, keeping the draw inexpensive.
      for (let x = 0; x < row.length;) {
        if (row[x] !== '1') { x++; continue; }
        let end = x + 1;
        while (row[end] === '1') end++;
        const x0 = (k * 6 + x) * scale;
        const x1 = (k * 6 + end) * scale;
        const y0 = -(y + 1) * scale;
        const y1 = -y * scale;
        props.quad(at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), n, { color }, NO_INK);
        x = end;
      }
    });
  }
}

/** Folded lanceolate oleander leaves, never camera-facing sprites. */
function leaf(props: Bake, p: Vec3, length: number, angle: number, color: string) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const tip: Vec3 = [p[0] + dx * length, p[1] + length * 0.38, p[2] + dz * length];
  const middle: Vec3 = [p[0] + dx * length * 0.45, p[1] + length * 0.34, p[2] + dz * length * 0.45];
  const width = length * 0.13;
  for (const sign of [-1, 1]) {
    const side: Vec3 = [middle[0] - dz * width * sign, middle[1], middle[2] + dx * width * sign];
    props.triangle(p, side, tip, N, { color }, LEAVES);
  }
}

/** Dense trimmed shrubs with branching stems and a broken-leaf silhouette. */
export function sunsetShrub(props: Bake, x: number, y: number, z: number, radius: number, seed: number, rootY = y - 15) {
  for (let stem = 0; stem < 9; stem++) {
    const angle = stem * 2.399;
    const sx = x + Math.cos(angle) * radius * 0.5;
    const sz = z + Math.sin(angle) * radius * 0.62;
    const sy = y + radius * (0.5 + hash2(seed, stem, 835) * 0.4);
    props.tube([[x, rootY, z], [sx, sy, sz]], [2, 0.6], { color: '#746f52' }, NO_INK, 5);
    for (let level = 0; level < 5; level++) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.256 + stem;
        const p: Vec3 = [sx + Math.cos(a) * radius * 0.24, sy - level * 7, sz + Math.sin(a) * radius * 0.24];
        leaf(props, p, 16 + hash2(seed + level, k, 836) * 10, a, FOLIAGE[(stem + k + level) % FOLIAGE.length]);
      }
    }
  }
  // Dense shaded cores are faceted volumes; individual leaves break their outlines.
  for (let mound = 0; mound < 6; mound++) {
    const a = mound * 2.399;
    const cx = x + Math.cos(a) * radius * 0.45;
    const cz = z + Math.sin(a) * radius * 0.48;
    const cy = y + radius * (0.38 + 0.4 * hash2(seed, mound, 847));
    const r = radius * (0.4 + 0.22 * hash2(seed, mound, 848));
    for (let ring = 0; ring < 4; ring++) {
      const lat0 = -Math.PI / 2 + ring * Math.PI / 4;
      const lat1 = lat0 + Math.PI / 4;
      const point = (lat: number, angle: number): Vec3 => [cx + Math.cos(lat) * Math.cos(angle) * r, cy + Math.sin(lat) * r * 0.72, cz + Math.cos(lat) * Math.sin(angle) * r];
      for (let k = 0; k < 8; k++) {
        const a0 = k * Math.PI / 4, a1 = a0 + Math.PI / 4;
        const color = FOLIAGE[(k + ring + mound) % FOLIAGE.length];
        props.quad(point(lat0, a0), point(lat0, a1), point(lat1, a1), point(lat1, a0), N, { color }, LEAVES);
      }
    }
  }
}

/** Tall palms behind the low commercial roofs establish Sunset Boulevard. */
export function sunsetPalm(props: Bake, x: number, y: number, z: number, height: number, seed: number) {
  const lean = 24 * (hash2(seed, 0, 839) - 0.5);
  const crown: Vec3 = [x + lean, y + height, z + 13];
  props.tube([[x, y, z], [x + lean * 0.3, y + height * 0.4, z + 4], crown], [9, 6, 4], { color: '#8e8270' }, NO_INK, 9);
  for (let r = 0; r < 25; r++) {
    const h = height * r / 25;
    props.tube([[x + lean * h / height, y + h, z + 13 * h / height], [x + lean * h / height, y + h + 2, z + 13 * h / height]], [8 - r * 0.13, 8 - r * 0.13], { color: '#716e57' }, NO_INK, 8);
  }
  for (let frond = 0; frond < 13; frond++) {
    const angle = frond * 2.399 + seed;
    const reach = 100 + hash2(seed, frond, 841) * 75;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const stem: Vec3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      stem.push([crown[0] + dx * reach * t, crown[1] + 48 * Math.sin(t * Math.PI) - 45 * t * t, crown[2] + dz * reach * t]);
    }
    props.tube(stem, [3, 2.8, 2.1, 1.4, 0.8, 0.1], { color: '#667545' }, NO_INK, 5, false);
    for (let k = 1; k <= 13; k++) {
      const t = k / 14;
      const p: Vec3 = [crown[0] + dx * reach * t, crown[1] + 48 * Math.sin(t * Math.PI) - 45 * t * t, crown[2] + dz * reach * t];
      const length = 38 * Math.sin(t * Math.PI) + 9;
      for (const side of [-1, 1]) leaf(props, p, length, angle + side * 1.05, mixHex('#536a43', '#8b9157', t * 0.55));
    }
  }
}
