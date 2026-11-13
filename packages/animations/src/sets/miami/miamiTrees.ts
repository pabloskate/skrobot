import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import type { CarPlacement } from '../props/streetProps';
import { crownSpheres, type TreePlacement } from '../props/trees';
import { hash2 } from '../setKit';
import { MAX_CANOPIES, type Canopy } from '../surfaces';
import { F, LEAVES, SOIL, STUCCO, UP, mixHex, normalOf, poly, tag, upward } from './miamiKit';
import { MIAMI_BOULEVARD, MIAMI_SOUTHBOUND, miamiBoulevard, miamiParkingStall } from './miamiBuildings';
import { MIAMI_PLAZA_Y } from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';

/**
 * Triangle Bank's planting and traffic: palms (royal, coconut, Canary date), sea-grape and ficus hedges,
 * flowering shrubs, the park's broad shade trees as street props, and the cars on the boulevard and in the car
 * park. Bay-front Miami's generic planting, read from the clips; every tree stands clear of the line, the deck,
 * the bank and the filmers' views (tested).
 */

const PLAZA = MIAMI_PLAZA_Y;
const BARK = tag('stucco', 0);
const FROND = LEAVES;

/** A palm's kind: a Canary Island date palm (thick, dense crown), a royal (smooth grey column, green crownshaft) or a coconut (lean, curving). */
export type PalmKind = 'date' | 'royal' | 'coconut';

/** Where a palm's crown sits and how wide it spreads, for its shade on the paving. */
export function palmCrown(at: Vec3, height: number, kind: PalmKind): Canopy {
  const reach = (kind === 'date' ? 13 : kind === 'royal' ? 11 : 10) * F;
  const top = at[1] + height + (kind === 'royal' ? 5 * F : 0);
  return { at: [at[0], top - reach * 0.15, at[2]], radius: reach * 0.8 };
}

/**
 * A palm: its trunk (ringed leaf scars on a date palm, a smooth pale column on a royal, a leaning grey stem on a
 * coconut), and a crown of fronds, each a curved rachis with leaflets either side.
 */
export function palm(b: Bake, at: Vec3, height: number, kind: PalmKind, seed: number) {
  const lean = kind === 'coconut' ? (0.08 + 0.1 * hash2(seed, 1, 501)) * height : 0.02 * height * hash2(seed, 1, 501);
  const dir = hash2(seed, 2, 502) * Math.PI * 2;
  const trunkAt = (t: number): Vec3 => [at[0] + Math.cos(dir) * lean * t * t, at[1] + height * t, at[2] + Math.sin(dir) * lean * t * t];
  const width = kind === 'date' ? 1.5 * F : kind === 'royal' ? 0.85 * F : 0.55 * F;
  const spine = [0, 0.2, 0.45, 0.7, 1].map(trunkAt);
  const radii = kind === 'royal'
    ? [width * 0.78, width * 0.92, width * 0.95, width * 0.72, width * 0.62]
    : kind === 'date' ? [width * 1.08, width, width * 0.98, width * 0.96, width * 1.05] : [width * 1.12, width, width * 0.92, width * 0.85, width * 0.8];
  const bark = kind === 'royal' ? PAINT.royalTrunk : kind === 'date' ? PAINT.dateTrunk : PAINT.coconutTrunk;
  b.tube(spine, radii, { color: bark }, BARK, 10, false);
  // Rings up the trunk: a date palm's diamond of old leaf bases, faint scars on the others; the foot darker where the sprinklers splash it.
  const rings = kind === 'date' ? 6 : 0;
  for (let k = 1; k < rings; k++) {
    const t = k / (rings + 0.3);
    const p = trunkAt(t), r = radii[Math.min(4, Math.round(t * 4))] * (kind === 'date' ? 1.07 : 1.015);
    const color = mixHex(bark, '#5d5040', 0.45);
    b.tube([[p[0], p[1] - 4, p[2]], [p[0], p[1] + 4, p[2]]], [r, r], { color }, BARK, 8, false);
  }
  b.tube([trunkAt(0), trunkAt(0.06)], [radii[0] * 1.02, radii[0] * 1.01], { color: mixHex(bark, '#55524a', 0.4) }, BARK, 10, false);
  const crown = trunkAt(1);
  if (kind === 'royal') b.tube([crown, [crown[0], crown[1] + 5 * F, crown[2]]], [width * 0.66, width * 0.55], { color: PAINT.crownshaft }, STUCCO, 10, true);
  const head: Vec3 = kind === 'royal' ? [crown[0], crown[1] + 5 * F, crown[2]] : crown;
  // A date palm's crown is a dense ball of long stiff fronds, the lowest hanging; royals and coconuts carry
  // fewer, arching, drooping at the tips.
  const fronds = kind === 'date' ? 24 : 15;
  const reach = (kind === 'date' ? 13 : kind === 'royal' ? 11 : 10) * F;
  const leaflets = kind === 'date' ? 11 : 8;
  const greens = kind === 'date' ? PAINT.dateFrond : PAINT.frond;
  for (let f = 0; f < fronds; f++) {
    const a = f * 2.399 + seed;
    const tier = f % 3;
    const rise = kind === 'date' ? 1.15 - tier * 0.7 : 0.8 - tier * 0.45;
    const len = reach * (0.82 + 0.3 * hash2(seed, f, 503));
    const dx = Math.cos(a), dz = Math.sin(a);
    const droop = kind === 'date' ? 0.55 : 0.8;
    const along = (t: number): Vec3 => [head[0] + dx * len * t, head[1] + len * (rise * t - droop * t * t), head[2] + dz * len * t];
    b.tube([along(0), along(0.5), along(1)], [2.6, 1.6, 0.3], { color: PAINT.rachis }, FROND, 3, false);
    // Old fronds go yellow-brown at the bottom of the crown.
    const dead = tier === 2 && hash2(seed, f, 504) < 0.35;
    for (let k = 1; k <= leaflets; k++) {
      const t = k / (leaflets + 1);
      const p = along(t);
      const leaf = (kind === 'date' ? 3.3 : 3.6) * F * Math.sin(Math.PI * (0.12 + t * 0.88)) + 8;
      for (const side of [-1, 1]) {
        const s = a + side * (kind === 'date' ? 0.95 : 1.3);
        const tip: Vec3 = [p[0] + Math.cos(s) * leaf, p[1] - leaf * (kind === 'date' ? 0.2 : 0.5), p[2] + Math.sin(s) * leaf];
        // Narrow pinnae: the base only a little back along the rachis.
        const base: Vec3 = [p[0] - dx * leaf * (kind === 'date' ? 0.16 : 0.24), p[1] + 2, p[2] - dz * leaf * (kind === 'date' ? 0.16 : 0.24)];
        const color = dead ? mixHex(greens[k % greens.length], '#a08a52', 0.6) : greens[(k + f + tier) % greens.length];
        b.triangle(p, base, tip, upward(p, base, tip), { color }, FROND);
      }
    }
  }
}

/**
 * A clipped shrub: a few faceted lobes of leaves, and flowers dotted over the top when `flowers` is a colour
 * (the red and pink beds in the clips).
 */
export function shrubMound(b: Bake, at: Vec3, radius: number, seed: number, flowers: string | null, height = 0.8) {
  const greens = PAINT.hedge;
  for (let lobe = 0; lobe < 4; lobe++) {
    const a = lobe * 2.4 + seed;
    const cx = at[0] + Math.cos(a) * radius * 0.35, cz = at[2] + Math.sin(a) * radius * 0.35;
    const r = radius * (0.55 + 0.2 * hash2(seed, lobe, 341));
    const cy = at[1] + r * height * 0.55;
    const point = (lat: number, lon: number): Vec3 => [cx + Math.cos(lat) * Math.cos(lon) * r, cy + Math.sin(lat) * r * height, cz + Math.cos(lat) * Math.sin(lon) * r];
    for (let ring = 0; ring < 3; ring++) {
      const l0 = -0.2 + ring * 0.6, l1 = l0 + 0.6;
      for (let k = 0; k < 7; k++) {
        const o0 = (k / 7) * Math.PI * 2, o1 = ((k + 1) / 7) * Math.PI * 2;
        const n: Vec3 = [Math.cos((l0 + l1) / 2) * Math.cos((o0 + o1) / 2), Math.sin((l0 + l1) / 2), Math.cos((l0 + l1) / 2) * Math.sin((o0 + o1) / 2)];
        const pts = ring === 2 ? [point(l0, o0), point(l0, o1), point(Math.PI / 2, 0)] : [point(l0, o0), point(l0, o1), point(l1, o1), point(l1, o0)];
        // Lower lobes a shade darker, in their own shade.
        const color = mixHex(greens[(k + ring + lobe) % greens.length], '#2f4529', ring === 0 ? 0.25 : 0);
        poly(b, pts, n, color, LEAVES);
      }
    }
    if (flowers) {
      for (let k = 0; k < 6; k++) {
        const lat = 0.5 + hash2(seed, lobe * 9 + k, 342) * 0.9, lon = hash2(seed, lobe * 9 + k, 343) * Math.PI * 2;
        const p = point(lat, lon), s = 2.2;
        b.triangle([p[0] - s, p[1] + 0.6, p[2]], [p[0] + s, p[1] + 0.6, p[2] - s * 0.6], [p[0], p[1] + 0.6, p[2] + s], UP, { color: flowers }, LEAVES);
      }
    }
  }
}

/**
 * A clipped hedge, `length` long along the plan direction `along`: a lumpy block of leaves, its foot tucked a
 * little into the ground at `at`.
 */
export function hedge(b: Bake, at: Vec3, along: [number, number], length: number, height: number, seed: number, depth = 3 * F) {
  const out: [number, number] = [-along[1], along[0]];
  const p = (s: number, d: number, y: number): Vec3 => [at[0] + along[0] * s + out[0] * d, at[1] + y, at[2] + along[1] * s + out[1] * d];
  const segs = Math.max(2, Math.round(length / (1.2 * F)));
  for (let k = 0; k < segs; k++) {
    const s0 = (k / segs - 0.5) * length, s1 = ((k + 1) / segs - 0.5) * length;
    const h = height * (0.92 + 0.12 * hash2(seed, k, 381));
    const d0 = -depth / 2, d1 = depth / 2;
    const color = PAINT.hedge[(seed + k) % PAINT.hedge.length];
    const shade = mixHex(color, '#2f4529', 0.2);
    poly(b, [p(s0, d0, h), p(s1, d0, h), p(s1, d1, h * 0.96), p(s0, d1, h * 0.96)], UP, color, LEAVES);
    for (const [d, sign] of [[d0, -1], [d1, 1]] as const) {
      const n: Vec3 = [out[0] * sign, 0.25, out[1] * sign];
      b.quadCorners(p(s0, d * 1.1, -4), p(s1, d * 1.1, -4), p(s1, d, h * 0.97), p(s0, d, h * 0.97), n,
        [{ color: shade }, { color: shade }, { color }, { color }], LEAVES);
    }
    for (const s of [s0, s1]) {
      const n: Vec3 = [along[0] * Math.sign(s), 0.25, along[1] * Math.sign(s)];
      poly(b, [p(s, d0 * 1.1, -4), p(s, d1 * 1.1, -4), p(s, d1, h * 0.96), p(s, d0, h)], n, color, LEAVES);
    }
  }
}

/** A ring of mulch round a tree, following the ground `y(x, z)`. */
export function mulchRing(b: Bake, x: number, z: number, radius: number, y: (x: number, z: number) => number) {
  const c = y(x, z) + 0.5;
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
    const rim = (a: number): Vec3 => {
      const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      return [px, y(px, pz) + 0.5, pz];
    };
    const [p, q] = [rim(a0), rim(a1)];
    b.triangle([x, c, z], q, p, normalOf([x, c, z], q, p)[1] < 0 ? UP : normalOf([x, c, z], q, p), { color: PAINT.mulch }, SOIL);
  }
}

/* ----- Street props: shade trees and cars ----- */

type Row = readonly [x: number, z: number, feet: number, yaw: number, seed: number];
const plant = (species: TreePlacement['species'], rows: readonly Row[]): TreePlacement[] =>
  rows.map(([x, z, feet, yaw, seed]) => ({ at: [x * F, PLAZA - 0.3 * F, z * F] as Vec3, height: feet * F, yaw, species, seed }));

/**
 * The park's groves east of the deck, toward the bay (`e` feet east of the tip, `n` north): ficus scattered over
 * the lawns with fan palms standing over them, a loose screen before the water. Clear of the rounded hotel tower
 * to the south-east.
 */
const GROVES: TreePlacement[] = Array.from({ length: 44 }, (_, k): TreePlacement | null => {
  const e = 200 + 400 * hash2(k, 1, 641), n = -460 + 900 * hash2(k, 2, 642);
  const x = (-e + n) * Math.SQRT1_2 * F, z = (-e - n) * Math.SQRT1_2 * F;
  // The hotel tower's drum (miamiBuildings.ts), with room round it.
  if (((x + 184 * F) / (100 * F)) ** 2 + ((z + 443 * F) / (74 * F)) ** 2 < 1) return null;
  const palmy = k % 4 === 0;
  return {
    at: [x, PLAZA - 0.3 * F, z], height: (palmy ? 46 + 14 * hash2(k, 3, 643) : 22 + 14 * hash2(k, 3, 643)) * F,
    yaw: hash2(k, 4, 644) * 360, species: palmy ? 'fanPalm' : 'ficus', seed: 700 + k,
  };
}).filter((t): t is TreePlacement => t !== null);

/**
 * Broad shade trees: ficus in the park behind the deck and its lawns, in a loose rank along the far walk, and
 * a few along the car park's far side.
 */
export const MIAMI_TREES: TreePlacement[] = [
  ...plant('ficus', [
    [-110, -46, 30, 40, 601], [-126, 30, 28, 160, 602], [-104, 70, 26, 250, 603], [-138, -8, 32, 300, 604],
    [-98, -86, 24, 80, 605], [-162, -72, 34, 20, 606], [-176, 44, 30, 110, 607], [-152, 98, 28, 210, 608],
    [-196, -22, 36, 330, 609], [-134, -118, 30, 70, 610], [-214, 76, 32, 190, 613], [-232, -96, 34, 260, 614],
  ]),
  ...plant('ornamental', [[-100, 16, 15, 20, 611], [-101, -14, 14, 140, 612]]),
  // Past the car park, on the lawn toward the park's south drive.
  ...plant('ficus', [
    [118, -128, 24, 10, 621], [148, -98, 26, 200, 622], [88, -158, 22, 120, 623], [60, -118, 26, 300, 624],
    [86, -90, 24, 40, 625], [168, -46, 28, 150, 626], [40, -160, 30, 240, 627], [128, -170, 32, 80, 628],
  ]),
  // Tall fan palms standing over the park behind the deck.
  ...plant('fanPalm', [[-120, -26, 52, 0, 631], [-146, 62, 58, 90, 632], [-112, 108, 48, 200, 633], [-170, -104, 55, 270, 634]]),
  ...GROVES,
];

/** World units a second for a mile an hour. */
const MPH = (5280 * F) / 3600;
/** Each driving car comes round again out of sight, down the boulevard. */
const LAP = 1400 * F;
const lane = (k: number) => MIAMI_BOULEVARD.kerb + (k + 0.5) * 12.5 * F;
const farLane = (k: number) => MIAMI_BOULEVARD.medianEnd + (k + 0.5) * 12 * F;

/** Biscayne's traffic keeps right: northbound in the lanes by the park, southbound beyond the median. */
export const MIAMI_TRAFFIC: CarPlacement[] = ([
  [lane(1), -300, 'sedan', '#c9c5bb', 34], [lane(2), 250, 'suv', '#1f2428', 31], [lane(0), 650, 'hatchback', '#8c1e22', 28],
  [lane(3), -700, 'sedan', '#9aa3a6', 36],
  [farLane(0), 100, 'suv', '#e2e0d8', 33], [farLane(1), -500, 'sedan', '#2e3f55', 30], [farLane(2), 500, 'hatchback', '#6b2a2c', 35],
] as const).map(([across, along, model, paint, mph]) => ({
  at: miamiBoulevard(along * F, across), model, paint,
  yaw: across > MIAMI_BOULEVARD.median ? MIAMI_SOUTHBOUND : MIAMI_SOUTHBOUND + 180,
  speed: mph * MPH, lap: LAP,
}));

/** Cars nosed into the park's car park beyond the plaza's left side. */
export const MIAMI_PARKED: CarPlacement[] = ([
  [0, 'sedan', '#d8d5cc'], [1, 'suv', '#43505a'], [3, 'sedan', '#1d1f22'], [4, 'hatchback', '#b8bcbd'],
  [5, 'suv', '#e6e3da'], [7, 'sedan', '#7a1f25'], [8, 'sedan', '#2c3a4f'], [10, 'suv', '#9a9c98'],
  [11, 'hatchback', '#cfc9b8'], [12, 'sedan', '#30302d'], [14, 'suv', '#5f6a70'],
] as const).map(([k, model, paint]) => ({ at: miamiParkingStall(k) as Vec3, yaw: 225, model, paint }));

/** Every car in the scene, parked and driving. */
export const MIAMI_CARS: CarPlacement[] = [...MIAMI_TRAFFIC, ...MIAMI_PARKED];

/**
 * The crowns whose shade the cameras see on the paving, within the look's budget: the palms beside the plaza
 * first (passed in by the scene as it plants them), then the shade trees' crowns nearest the plaza.
 */
export function miamiCanopies(palms: Canopy[], trees = MIAMI_TREES): Canopy[] {
  const near = (c: Canopy) => Math.hypot(c.at[0] - 20 * F, c.at[2]);
  const crowns = crownSpheres(trees).map(({ center, radius }) => ({ at: center, radius }) as Canopy);
  return [...[...palms].sort((a, b) => near(a) - near(b)), ...crowns.sort((a, b) => near(a) - near(b))].slice(0, MAX_CANOPIES);
}
