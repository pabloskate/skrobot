import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { FT, IN, LEAVES, mixHex, tag, tube } from './sunsetKit';
import { SUNSET_PAINT as PAINT } from './sunsetPalette';

/**
 * Roof to Bank's planting and its one word of lettering: oleanders clipped into mounds on the planters and
 * left to grow tall at the corner by the landing (the Skate Sonr photograph and the 2019 cover), weeds in the
 * joint at the bank's foot, and the booth's OPEN sign. Leaves are modelled masses the look patterns in three
 * dimensions, never camera-facing cards.
 */

const FOLIAGE = tag(LEAVES);

/**
 * Every word the scene letters. Generic only: no business name, slogan or address (the location notice,
 * docs/LOCATION_PRESENTATION.md); `sunsetLettering` refuses anything else and a test reads this list.
 */
export const SUNSET_LETTERING: readonly string[] = ['OPEN'];

/** A small stencil alphabet, just the letters SUNSET_LETTERING needs. */
const LETTERS: Record<string, string[]> = {
  O: ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
  P: ['11110', '11011', '11011', '11110', '11000', '11000', '11000'],
  E: ['11111', '11000', '11000', '11110', '11000', '11000', '11111'],
  N: ['11001', '11001', '11101', '11111', '11011', '11011', '11001'],
};

/** Raised letters along `right` from `origin` (their top left), each pixel `scale` square. */
export function sunsetLettering(props: Bake, text: string, origin: Vec3, right: Vec3, scale: number, color: string) {
  if (!SUNSET_LETTERING.includes(text)) throw new Error(`Roof to Bank letters only generic words, not "${text}"`);
  const n: Vec3 = [-right[2], 0, right[0]];
  const at = (x: number, y: number): Vec3 => [origin[0] + right[0] * x, origin[1] + y, origin[2] + right[2] * x];
  for (let k = 0; k < text.length; k++) {
    LETTERS[text[k]].forEach((row, y) => {
      // Adjacent filled pixels merge into one stroke.
      for (let x = 0; x < row.length;) {
        if (row[x] !== '1') { x++; continue; }
        let end = x + 1;
        while (row[end] === '1') end++;
        const x0 = (k * 6 + x) * scale, x1 = (k * 6 + end) * scale, y0 = -(y + 1) * scale, y1 = -y * scale;
        props.quad(at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), n, { color }, tag('metal'));
        x = end;
      }
    });
  }
}

/**
 * One rounded mass of foliage, `rx` × `rz` across and `h` tall over its foot at `y`, its outline wobbled and its
 * underside darker. Normals are the ellipsoid's own, smooth across the mass, so the look's light rounds it
 * instead of breaking it into facets; leaves are patterned on it by the look.
 */
function mass(props: Bake, cx: number, y: number, cz: number, rx: number, rz: number, h: number, seed: number, color: string, rings = 5, around = 12) {
  const point = (i: number, j: number) => {
    const lat = (Math.PI / 2) * (i / rings), lon = (j / around) * Math.PI * 2;
    const wob = 0.86 + 0.28 * hash2(seed, i === rings ? 0 : i * 32 + (j % around), 901);
    const d: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const n: Vec3 = [d[0] / rx, d[1] / h + 0.25 / h, d[2] / rz];
    const m = Math.hypot(...n);
    return { at: [cx + d[0] * rx * wob, y + d[1] * h * wob, cz + d[2] * rz * wob] as Vec3, n: [n[0] / m, n[1] / m, n[2] / m] as Vec3 };
  };
  const tone = (i: number, j: number) => mixHex(color, PAINT.oleanderDark, 0.45 * (1 - i / rings) + 0.15 * hash2(seed, i * 32 + (j % around), 902));
  for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
    const corners: Array<[number, number]> = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]];
    for (const [a, b] of corners) {
      const { at, n } = point(a, b);
      props.vertex(at, n, { color: tone(a, b) }, FOLIAGE);
    }
  }
}

/** A narrow oleander leaf from `p`, `length` long, pointing `angle` round and `rise` up. */
function leaf(props: Bake, p: Vec3, length: number, angle: number, rise: number, color: string) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const tip: Vec3 = [p[0] + dx * length, p[1] + rise * length, p[2] + dz * length];
  const mid: Vec3 = [p[0] + dx * length * 0.45, p[1] + rise * length * 0.5, p[2] + dz * length * 0.45];
  const w = length * 0.12;
  for (const s of [-1, 1]) {
    const side: Vec3 = [mid[0] - dz * w * s, mid[1], mid[2] + dx * w * s];
    props.triangle(p, side, tip, [dx * 0.3, 0.9, dz * 0.3], { color }, FOLIAGE);
  }
}

/** A cluster of oleander flowers: a few pale five-petalled stars on the crown's surface. */
function blooms(props: Bake, at: Vec3, seed: number, color: string) {
  for (let k = 0; k < 4; k++) {
    const a = k * 2.4 + seed;
    const c: Vec3 = [at[0] + Math.cos(a) * 2.2 * IN, at[1] + hash2(seed, k, 903) * 2 * IN, at[2] + Math.sin(a) * 2.2 * IN];
    const r = 1.1 * IN;
    for (let p = 0; p < 5; p++) {
      const t0 = (p / 5) * Math.PI * 2, t1 = t0 + 0.9;
      props.triangle(c, [c[0] + Math.cos(t0) * r, c[1] + 0.3 * IN, c[2] + Math.sin(t0) * r], [c[0] + Math.cos(t1) * r, c[1] + 0.3 * IN, c[2] + Math.sin(t1) * r], [0, 1, 0], { color }, FOLIAGE);
    }
  }
}

/**
 * Oleanders clipped into a long mound over a planter (the Skate Sonr photograph): overlapping masses `halfZ`
 * along it and `halfX` across, `h` tall from `y`, a fringe of loose leaves breaking the clipped outline and a
 * few white flower clusters.
 */
export function oleanderMound(props: Bake, x: number, y: number, z: number, halfX: number, halfZ: number, h: number, seed: number) {
  const count = 4;
  for (let m = 0; m < count; m++) {
    const t = (m + 0.5) / count - 0.5;
    const cz = z + t * 2 * halfZ * 0.72, cx = x + (hash2(seed, m, 904) - 0.5) * halfX * 0.3;
    const color = m % 2 ? PAINT.oleander : mixHex(PAINT.oleander, PAINT.oleanderLight, 0.4);
    mass(props, cx, y, cz, halfX * (0.85 + 0.2 * hash2(seed, m, 905)), halfZ * 0.42, h * (0.85 + 0.25 * hash2(seed, m, 906)), seed * 7 + m, color);
  }
  for (let k = 0; k < 80; k++) {
    const a = k * 2.399 + seed, s = hash2(seed, k, 907);
    const lz = z + (s - 0.5) * 2 * halfZ * 0.95, lx = x + Math.cos(a) * halfX * 0.9;
    const ly = y + h * (0.45 + 0.5 * hash2(seed, k, 908));
    leaf(props, [lx, ly, lz], (5 + 3 * hash2(seed, k, 909)) * IN, a, 0.35 + 0.4 * hash2(seed, k, 910), k % 3 ? PAINT.oleanderLight : PAINT.oleander);
  }
  for (let k = 0; k < 5; k++) {
    const a = k * 1.9 + seed;
    blooms(props, [x + Math.cos(a) * halfX * 0.6, y + h * (0.85 + 0.15 * hash2(seed, k, 911)), z + (hash2(seed, k, 912) - 0.5) * 1.6 * halfZ], seed + k, PAINT.bloomWhite);
  }
}

/**
 * A tall, loose oleander (the 2019 cover's, at the corner by the landing): woody stems rising out of a dark
 * clump, a dozen small crowns of foliage stacked up and out along them so the outline is lumpy, not a ball,
 * long leaves sprouting from every crown and clusters of white flowers. `height` to its top, `spread` its
 * radius, rooted at `rootY`.
 */
export function oleanderTree(props: Bake, x: number, rootY: number, z: number, height: number, spread: number, seed: number) {
  for (let s = 0; s < 7; s++) {
    const a = s * 2.399 + seed, r = spread * (0.25 + 0.3 * hash2(seed, s, 913));
    const top: Vec3 = [x + Math.cos(a) * r, rootY + height * (0.55 + 0.3 * hash2(seed, s, 914)), z + Math.sin(a) * r];
    tube(props, [[x, rootY, z], [x + Math.cos(a) * r * 0.4, rootY + height * 0.3, z + Math.sin(a) * r * 0.4], top], [1.6 * IN, 1.1 * IN, 0.6 * IN], '#6f6a50', tag(0), 5, false);
  }
  mass(props, x, rootY, z, spread * 0.95, spread * 0.9, height * 0.55, seed, PAINT.oleanderDark);
  const crowns: Array<{ at: Vec3; r: number }> = [];
  for (let m = 0; m < 13; m++) {
    const a = m * 2.399 + seed, out = Math.sqrt((m + 0.5) / 13);
    const r = spread * (0.12 + 0.62 * out * (0.8 + 0.3 * hash2(seed, m, 915)));
    const up = height * (0.3 + 0.42 * (1 - out * 0.7) * (0.75 + 0.45 * hash2(seed, m, 916)));
    const rr = spread * (0.32 + 0.14 * hash2(seed, m, 917));
    const at: Vec3 = [x + Math.cos(a) * r, rootY + up, z + Math.sin(a) * r];
    crowns.push({ at, r: rr });
    mass(props, at[0], at[1] - rr * 0.35, at[2], rr, rr * 0.9, rr * 1.15, seed * 11 + m, m % 3 ? PAINT.oleander : PAINT.oleanderLight, 4, 10);
  }
  // Long leaves sprouting from every crown's surface, upward and out, and flowers at the tops.
  crowns.forEach(({ at, r }, m) => {
    for (let k = 0; k < 9; k++) {
      const a = k * 2.399 + m, lift = 0.2 + 0.7 * hash2(seed + m, k, 931);
      const p: Vec3 = [at[0] + Math.cos(a) * r * 0.85, at[1] + r * (lift - 0.1), at[2] + Math.sin(a) * r * 0.85];
      leaf(props, p, (6 + 3 * hash2(seed + m, k, 933)) * IN, a + (hash2(seed + m, k, 934) - 0.5), 0.2 + 0.7 * lift, k % 3 ? PAINT.oleander : PAINT.oleanderLight);
    }
    if (m % 2 === 0) blooms(props, [at[0], at[1] + r * 0.75, at[2]], seed + m * 3, PAINT.bloomWhite);
  });
}

/** A tuft of grass and weeds, a few blades fanned from its root at `y`, some dried to straw. */
export function weedTuft(props: Bake, x: number, y: number, z: number, seed: number, size = 1) {
  const blades = 4 + Math.floor(5 * hash2(seed, 0, 924));
  const dry = hash2(seed, 1, 925) > 0.55;
  for (let k = 0; k < blades; k++) {
    const a = k * 2.4 + seed;
    const lean = 0.2 + 0.5 * hash2(seed, k, 926);
    const h = (3 + 6 * hash2(seed, k, 927)) * IN * size;
    const tip: Vec3 = [x + Math.cos(a) * lean * h, y + h, z + Math.sin(a) * lean * h];
    const w = 0.35 * IN;
    props.triangle([x - Math.sin(a) * w, y, z + Math.cos(a) * w], [x + Math.sin(a) * w, y, z - Math.cos(a) * w], tip, [Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4],
      { color: dry || k % 4 === 3 ? mixHex(PAINT.weedDry, PAINT.weed, 0.25 * hash2(seed, k, 928)) : mixHex(PAINT.weed, PAINT.oleanderDark, 0.3 * hash2(seed, k, 929)) }, FOLIAGE);
  }
}

/**
 * A clipped hedge along x from `x0` to `x1` on the line `z`, `half` deep either side and `h` tall from `y`:
 * tall, narrow masses overlapping along it, upright at the foot and rounded over the top as a hedge is
 * trimmed, a fringe of loose leaves breaking the clipped outline. Every mass, wobble and all, stays between its
 * ends, so it never hangs past them.
 */
export function hedge(props: Bake, x0: number, x1: number, z: number, half: number, h: number, y: number, seed: number) {
  const step = 2.4 * FT;
  const count = Math.max(1, Math.round((x1 - x0) / step));
  // A mass's wobble reaches 1.14 of its radius.
  const r = Math.min(0.75 * step * 1.6, (x1 - x0) / 2) / 1.14;
  for (let m = 0; m < count; m++) {
    const cx = Math.min(x1 - r * 1.14, Math.max(x0 + r * 1.14, x0 + ((m + 0.5) * (x1 - x0)) / count));
    const color = m % 3 ? PAINT.oleanderDark : PAINT.oleander;
    mass(props, cx, y - 0.5 * IN, z + (hash2(seed, m, 945) - 0.5) * 0.2 * half, r, half * (0.9 + 0.12 * hash2(seed, m, 946)), h * (0.92 + 0.12 * hash2(seed, m, 947)), seed * 13 + m, color);
  }
  for (let k = 0, n = Math.round(count * 14); k < n; k++) {
    const a = k * 2.399 + seed, side = Math.cos(a) > 0 ? 1 : -1;
    const lx = x0 + r + (x1 - x0 - 2 * r) * hash2(seed, k, 948), lz = z + side * half * 0.92;
    leaf(props, [lx, y + h * (0.25 + 0.68 * hash2(seed, k, 949)), lz], (5 + 3 * hash2(seed, k, 950)) * IN, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.2 + 0.5 * hash2(seed, k, 951), k % 3 ? PAINT.oleander : PAINT.oleanderLight);
  }
}
