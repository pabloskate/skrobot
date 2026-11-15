import type { Vec3 } from '../../camera/view';
import type { Bake, Ink } from '../../three/bake';
import { hash2 } from '../setKit';
import { INK, ft, mixHex } from './leapOfFaithKit';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import { LEAP_OF_FAITH_TABLES } from './leapOfFaithFurniture';

/**
 * Leap of Faith's wear, world axes in feet. Level marks lie on the decals (drawn with the ground's material, a
 * hair proud of it, so they take the shade and contact darkening the paving does): the undercroft's dusty floor,
 * paler lanes worn by feet across the court and along the walkway's run-up, stains under the tables, sealed
 * cracks, two drain grates, and leaves and grit drifted into corners and against wall feet. Upright marks are
 * the three weep holes low on the big wall (refs 05, 142); the walls' other weathering is per pixel, in the look
 * (SpotLook.walls). The urethane where boards land and roll away is the look's `marks`.
 */

const COURT = -14.3;
/** Decal layers above the ground, set units: overlapping marks never share a plane. */
const LIFT = [0.3, 0.5, 0.7] as const;
/** A point on the ground at height `y` (feet), `lift` units proud. */
const onGround = (x: number, y: number, z: number, lift: number): Vec3 => [x * F, y * F + lift, z * F];

/** The three weep holes at the foot of the wall under the upper flight (the face z = -0.7 toward the bay): x in feet. */
export const LEAP_OF_FAITH_WEEP_HOLES = [2.4, 5.1, 7.7].map(x => ({ x, y: COURT + 0.85, z: -0.7, radius: 0.13 }));

/**
 * `ground` is the bake the big wall itself is drawn in (the ground's material): its weep holes light as it does.
 */
export function buildLeapOfFaithWear(ground: Bake, decals: Bake) {
  weepHoles(ground);
  bayFloor(decals);
  wornLanes(decals);
  tableStains(decals);
  sealedCracks(decals);
  drains(decals);
  drifts(decals);
}

/** A level polygon (a fan from its first corner, convex or star-shaped about it), one paint or one per corner. */
function level(b: Bake, corners: Vec3[], paint: string | string[], ink: Ink) {
  const colour = (k: number) => ({ color: typeof paint === 'string' ? paint : paint[k] });
  for (let k = 1; k + 1 < corners.length; k++) {
    for (const i of [0, k, k + 1]) b.vertex(corners[i], [0, 1, 0], colour(i), ink);
  }
}

/** A ragged round mark `r` feet across about (x, z): darker in its middle, its rim the paving's own paint so it has no edge. */
function blot(b: Bake, x: number, y: number, z: number, r: number, centre: string, rim: string, seed: number, lift: number, ink: Ink, around = 10) {
  const pts: Vec3[] = [onGround(x, y, z, lift)];
  const paints = [centre];
  for (let k = 0; k <= around; k++) {
    const a = (k % around) / around * Math.PI * 2;
    const rr = r * (0.7 + 0.5 * hash2(seed, k % around, 901));
    pts.push(onGround(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, lift));
    paints.push(rim);
  }
  level(b, pts, paints, ink);
}

/**
 * The three weep holes (refs 05, 142): dark round drains about 3 in across, a foot up the wall, a hair proud of
 * its face, toward the bay (−z).
 */
function weepHoles(ground: Bake) {
  const n: Vec3 = [0, 0, -1];
  for (const { x, y, z, radius } of LEAP_OF_FAITH_WEEP_HOLES) {
    const face = z - 1 / F;
    const sides = 14;
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
      ground.triangle(ft([x, y, face - 0.5 / F]), ft([x + Math.cos(a1) * radius, y + Math.sin(a1) * radius, face - 0.5 / F]),
        ft([x + Math.cos(a0) * radius, y + Math.sin(a0) * radius, face - 0.5 / F]), n, { color: PAINT.weepHole }, INK.metal);
    }
  }
}

/**
 * The undercroft's floor behind the column line: the same slab out of the weather, dustier and less stained
 * than the court, without its joints.
 */
function bayFloor(decals: Bake) {
  level(decals, [onGround(-14, COURT, -5.7, LIFT[0]), onGround(-0.85, COURT, -5.7, LIFT[0]), onGround(-0.85, COURT, -56, LIFT[0]), onGround(-14, COURT, -56, LIFT[0])], PAINT.bayFloor, INK.concrete);
}

/** A lane `width` feet wide from (x0, z0) to (x1, z1) at height `y`: worn paler down its middle, fading to `rim` at both edges. */
function lane(b: Bake, from: [number, number], to: [number, number], y: number, width: number, worn: string, rim: string, lift: number, ink: Ink) {
  const [x0, z0] = from, [x1, z1] = to;
  const length = Math.hypot(x1 - x0, z1 - z0);
  const [ux, uz] = [(x1 - x0) / length, (z1 - z0) / length];
  const [nx, nz] = [-uz, ux];
  const steps = Math.max(1, Math.round(length / 6));
  const at = (t: number, s: number): Vec3 => {
    const wobble = 0.12 * width * Math.sin(t * 7.1 + x0) * (s === 0 ? 1 : 0.5);
    return onGround(x0 + ux * length * t + nx * (s * width / 2 + wobble), y, z0 + uz * length * t + nz * (s * width / 2 + wobble), lift);
  };
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps, t1 = (k + 1) / steps;
    // The ends fade out too.
    const mid = (t: number) => mixHex(rim, worn, Math.min(1, Math.min(t, 1 - t) * 6));
    for (const [sa, sb] of [[-1, 0], [0, 1]]) {
      const paint = (t: number, s: number) => ({ color: s === 0 ? mid(t) : rim });
      b.quadCorners(at(t0, sa), at(t1, sa), at(t1, sb), at(t0, sb), [0, 1, 0], [paint(t0, sa), paint(t1, sa), paint(t1, sb), paint(t0, sb)], ink);
    }
  }
}

/**
 * Where feet have worn the paving paler: from the stair's foot and from the undercroft to the near gate, across
 * the court (refs 91, 129); and up top the run-up along the walkway to the pop, polished by wheels.
 */
function wornLanes(decals: Bake) {
  lane(decals, [17, 27], [83, 6], COURT, 8, PAINT.courtWorn, PAINT.court, LIFT[0], INK.pavers);
  lane(decals, [3, -24], [83, 3], COURT, 7, PAINT.courtWorn, PAINT.court, LIFT[1], INK.pavers);
  lane(decals, [-24, 18.6], [-2.5, 4.2], 0, 3.2, PAINT.walkwayWorn, PAINT.walkway, LIFT[0], INK.concrete);
}

/** Old stains under the tables, where drinks and lunches went down, ragged and soft-edged. */
function tableStains(decals: Bake) {
  for (const [i, [x, y, z]] of LEAP_OF_FAITH_TABLES.entries()) {
    const inBay = x < 0 && y < -1;
    const rim = y > -1 ? PAINT.walkway : inBay ? PAINT.bayFloor : PAINT.court;
    blot(decals, x + 0.6 * (hash2(i, 1, 911) - 0.5), y, z + 1.5 * (hash2(i, 2, 911) - 0.5), 2.6 + 0.8 * hash2(i, 3, 911), mixHex(rim, PAINT.stain, 0.75), rim, i, LIFT[2], y > -1 || inBay ? INK.concrete : INK.pavers);
  }
}

/** A sealed crack: a wandering dark line of sealant about 2 in wide, from (x, z) `length` feet along `angle`. */
function crack(b: Bake, x: number, z: number, angle: number, length: number, seed: number) {
  const parts = 7, w = 0.065;
  let prev: [number, number] = [x, z];
  for (let k = 1; k <= parts; k++) {
    const a = angle + 0.35 * (hash2(seed, k, 921) - 0.5);
    const next: [number, number] = [prev[0] + Math.cos(a) * length / parts, prev[1] + Math.sin(a) * length / parts];
    const [dx, dz] = [-Math.sin(a) * w, Math.cos(a) * w];
    level(b, [onGround(prev[0] - dx, COURT, prev[1] - dz, LIFT[2]), onGround(prev[0] + dx, COURT, prev[1] + dz, LIFT[2]),
      onGround(next[0] + dx, COURT, next[1] + dz, LIFT[2]), onGround(next[0] - dx, COURT, next[1] - dz, LIFT[2])], PAINT.sealant, INK.pavers);
    prev = next;
  }
}

function sealedCracks(decals: Bake) {
  crack(decals, 26, -33, 0.5, 13, 1);
  crack(decals, 36, 18, -1.2, 9, 2);
  crack(decals, 12, -46, 0.1, 8, 3);
  crack(decals, 58, -8, 2.2, 10, 4);
}

/** A cast-iron drain grate, its frame a touch paler, set flush in the paving. */
function drains(decals: Bake) {
  for (const [x, z] of [[4.5, -42], [60, -22]]) {
    const square = (h: number, lift: number) => [onGround(x - h, COURT, z - h, lift), onGround(x + h, COURT, z - h, lift), onGround(x + h, COURT, z + h, lift), onGround(x - h, COURT, z + h, lift)];
    level(decals, square(0.75, LIFT[1]), PAINT.drainFrame, INK.metal);
    level(decals, square(0.58, LIFT[2]), PAINT.drain, INK.metal);
  }
}

/**
 * Leaves and grit drifted where the wind leaves them: the undercroft's back corners, the inside corner of the
 * return and the big wall, along the tall wall's foot and the perimeter wall's, and the covered walk's end. The
 * look's soil draws the dry leaves; paint near the paving's own keeps the drift's edge soft.
 */
function drifts(decals: Bake) {
  const litter = (rim: string) => mixHex(rim, PAINT.litter, 0.6);
  const spots: [number, number, number, string][] = [
    [-12.6, -7.1, 1.1, PAINT.bayFloor], [-12.5, -54.4, 1.2, PAINT.bayFloor],
    [1.9, -2.2, 0.9, PAINT.court], [1.6, -61.4, 0.9, PAINT.court],
  ];
  for (const [i, [x, z, r, rim]] of spots.entries()) blot(decals, x, COURT, z, r, litter(rim), litter(rim), 40 + i, LIFT[2], INK.soil, 9);
  // Strips along the walls' feet, from the foot line at x0 out to a ragged edge toward x1.
  const strip = (x0: number, x1: number, z0: number, z1: number, seed: number) => {
    const steps = 12;
    const edge = (k: number) => x0 + (x1 - x0) * (0.3 + 0.7 * hash2(seed, k, 931));
    for (let k = 0; k < steps; k++) {
      const za = z0 + (z1 - z0) * k / steps, zb = z0 + (z1 - z0) * (k + 1) / steps;
      level(decals, [onGround(x0, COURT, za, LIFT[2]), onGround(edge(k), COURT, za, LIFT[2]), onGround(edge(k + 1), COURT, zb, LIFT[2]), onGround(x0, COURT, zb, LIFT[2])], litter(PAINT.court), INK.soil);
    }
  };
  strip(9.05, 10.3, 30, 62, 1);
  strip(84.95, 83.6, -50, -8, 2);
  strip(84.95, 83.8, 14, 56, 3);
}
