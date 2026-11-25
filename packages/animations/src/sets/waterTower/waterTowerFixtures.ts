import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { normalOf, tag } from '../lookKit';
import { WATER_TOWER_FOOT as F } from './waterTowerLayout';
import { box, face, pipe, point } from './waterTowerKit';
import { WATER_TOWER_PAINT as PAINT } from './waterTowerPalette';
import { groundHeight, landHeight, roadBend } from './waterTowerSite';

/** The takeoff roof's hatch (07, 22): about 8 x 5 ft and 8 in high, its lid a little proud, a low slab beside it. */
export const HATCH = { x: -62, z: -22 };
/** The landing roof's louvred vent (18, 70), about four feet square with a shallow cap. */
export const VENT = { x: 58, z: 16 };
/** Short pipe stubs scattered over both roofs, clear of the lanes (07, 18, 22, 70). */
export const STUBS = [[-80, -27], [-54, -17], [-40, -23], [42, 17], [67, 21], [73, -17]];

/**
 * The ladder up the landing tank's wall, road side (20): along and across the wall where it faces (72, 82), the
 * wall's tangent there turned 20 degrees from +x. `u` runs along the wall, `r` out from the tank's centre.
 */
const LADDER = { x: 101.1, cos: 0.9404, sin: 0.34 };
const onLadder = (u: number, y: number, r: number): Vec3 => [LADDER.x - LADDER.sin * r + LADDER.cos * u, y, LADDER.cos * r + LADDER.sin * u];

/** The hatch, vent and stubs on the roofs, and the caged ladder up the landing tank's wall. */
export function roofFurniture(b: Bake) {
  // The hatch: a cast kerb with a steel plate lid lapping over it, and a low slab beside it.
  box(b, HATCH.x, 0, HATCH.z, 8, 0.68, 5, PAINT.hatchKerb, tag('concrete'));
  box(b, HATCH.x, 0.68, HATCH.z, 8.3, 0.12, 5.3, PAINT.hatchLid);
  box(b, HATCH.x - 10, 0, HATCH.z, 6, 0.3, 4, '#b6b4a5', tag('concrete'));
  for (const [x, z] of STUBS) {
    pipe(b, [[x, 0, z], [x, 0.65, z]], 0.21, '#7f7a6e');
    // Each stub's open end, dark.
    pipe(b, [[x, 0.64, z], [x, 0.67, z]], 0.14, PAINT.pipeEnd);
  }
  vent(b);

  // Two rails up from the pavement, hooking back over the rim onto the roof, rungs a foot apart.
  for (const u of [-0.95, 0.95])
    pipe(b, [onLadder(u, -20, 87.4), onLadder(u, 2.6, 87.4), onLadder(u, 3, 87), onLadder(u, 3, 86), onLadder(u, 0, 85.8)], 0.11, PAINT.galvanised);
  for (let y = -19; y < 1; y += 1) pipe(b, [onLadder(-0.95, y, 87.4), onLadder(0.95, y, 87.4)], 0.085, PAINT.galvanised);
  // The safety cage: half-hoops every four feet from head height on a climber, tied by four straps.
  const cage = (i: number, y: number) =>
    onLadder(1.35 * Math.cos((i * Math.PI) / 8), y, 87.4 + 2.25 * Math.sin((i * Math.PI) / 8));
  for (let y = -13; y <= 3; y += 4) pipe(b, Array.from({ length: 9 }, (_, i) => cage(i, y)), 0.08, PAINT.galvanised, 4);
  for (const i of [1, 3, 5, 7]) pipe(b, [cage(i, -13), cage(i, 3)], 0.06, PAINT.galvanised, 4);
}

/**
 * The landing roof's vent (18, 70): a box of pale painted sheet metal on a low kerb, louvred on every face (slats
 * tilted down and out over the dark inside), under a shallow pyramid cap that overhangs it.
 */
function vent(b: Bake) {
  const { x, z } = VENT, metal = tag('metal');
  box(b, x, 0, z, 4.4, 0.35, 4.4, PAINT.hatchKerb, tag('concrete'));
  // The box: dark where the louvres open into it, pale corner posts and a band top and bottom.
  box(b, x, 0.35, z, 3.9, 3.2, 3.9, '#5d5f59');
  for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(b, x + cx * 1.9, 0.35, z + cz * 1.9, 0.32, 3.2, 0.32, PAINT.vent);
  for (const y of [0.35, 3.25]) box(b, x, y, z, 4.06, 0.3, 4.06, PAINT.vent);
  // Six slats a face, each a strip tilted down and out.
  for (let k = 0; k < 6; k++) {
    const top = 3.12 - k * 0.43, low = top - 0.3;
    for (let side = 0; side < 4; side++) {
      const ux = [1, 0, -1, 0][side], uz = [0, 1, 0, -1][side];
      // Along the face (t) and out from it (o), in plan.
      const at = (t: number, o: number, y: number): Vec3 => [x + ux * o - uz * t, y, z + uz * o + ux * t];
      const corners = [at(-1.75, 1.9, top), at(1.75, 1.9, top), at(1.75, 2.15, low), at(-1.75, 2.15, low)].map((p) => point(...p));
      b.quad(corners[0], corners[1], corners[2], corners[3], normalOf(corners[0], corners[1], corners[2]), { color: PAINT.ventLouvre }, metal);
    }
  }
  b.frustum(x * F, z * F, 3.55 * F, 4.35 * F, 2.45 * F, 0.22 * F, { color: PAINT.ventCap }, metal);
}

/** Along the road side: the planted verge, the bar fence, the street lamps, and the lane paint (decals). */
export function roadside(b: Bake, decals: Bake) {
  const fence = (x: number) => 118 + roadBend(x);
  hedge(b);
  // The fence: posts every ten feet, a top and bottom rail, and twelve flat bars between each pair.
  const dark = PAINT.fence;
  for (let x = -200; x < 330; x += 10) {
    const z = fence(x), next = fence(x + 10);
    box(b, x, -21, z, 0.24, 6.2, 0.24, dark);
    for (const y of [-20.4, -15.5]) pipe(b, [[x, y, z], [x + 10, y, next]], 0.1, dark, 4);
    for (let i = 1; i < 13; i++) {
      const u = x + (i * 10) / 13, v = z + ((next - z) * i) / 13;
      face(b, [[u - 0.05, -21, v], [u + 0.05, -21, v], [u + 0.05, -15, v], [u - 0.05, -15, v]], dark, tag('metal'));
    }
  }
  // Cobra-head lamps on both sides of the road, staggered, about every 120 ft (07, 09, 17, 18, 70).
  for (const side of [-1, 1])
    for (let k = -3; k <= 4; k++) {
      const x = k * 120 + (side === 1 ? 48 : -8), z = 190 + side * 42 + roadBend(x);
      const at = (y: number, inset: number): Vec3 => [x, y, z - inset * side];
      pipe(b, [at(-25, 0), at(4, 0), at(6, 0.45), at(8, 2.8), at(9, 7), at(9, 10.5)], 0.24, PAINT.lampPole, 8);
      // The cobra head: a long, flattened pod out on the arm's end, deepest toward its tip.
      const head = [at(8.85, 9.9), at(8.75, 10.6), at(8.65, 11.9), at(8.7, 12.9)].map((p) => point(...p));
      b.tube(head, [0.32, 0.6, 0.55, 0.2].map((r) => r * F), { color: PAINT.lampHead }, tag('metal'), 8, true);
    }
  // Broken white lane lines and the median's two yellow lines, a hair over the road where it runs level beside the
  // pad (past that it climbs, and the paint would sink into it between the ground's columns).
  const lift = 0.6 / F;
  for (let x = -448; x < 448; x += 24)
    for (const offset of [163, 176, 204, 217, 187.5, 192.5]) {
      const yellow = offset === 187.5 || offset === 192.5, end = Math.min(448, x + (yellow ? 24 : 9));
      const z0 = offset + roadBend(x), z1 = offset + roadBend(end);
      const y0 = groundHeight(x, z0) + lift, y1 = groundHeight(end, z1) + lift;
      face(decals, [[x, y0, z0 + 0.17], [end, y1, z1 + 0.17], [end, y1, z1 - 0.17], [x, y0, z0 - 0.17]], yellow ? '#cdb66b' : '#d5d2c8', tag('asphalt'));
    }
}

/** The pipe yard at the hill's foot (36, 37, 67): three bundles of long pipe on sleepers, and a small container. */
export function yard(b: Bake) {
  for (const [x, z] of [[19, -92], [55, -90], [43, -98]]) {
    const y = landHeight(x, z);
    for (const dx of [-6, 6]) box(b, x + dx, y, z, 1, 0.65, 4.5, PAINT.sleeper);
    // Pale cement pipe, each end a dark hole.
    for (const [dz, h] of [[-1.2, 1.25], [0, 1.25], [1.2, 1.25], [-0.6, 2.25], [0.6, 2.25]]) {
      pipe(b, [[x - 9, y + h, z + dz], [x + 9, y + h, z + dz]], 0.58, PAINT.pipe, 8);
      for (const end of [-1, 1]) pipe(b, [[x + end * 9, y + h, z + dz], [x + end * 9.03, y + h, z + dz]], 0.44, PAINT.pipeEnd, 8);
    }
  }
  box(b, 64, -21, -92, 13, 6, 7, PAINT.container, tag('siding'));
}

/** The lattice pylon on the east crest toward -x (65, 69), and the wires it carries across the sky (01, 76). */
export function transmissionTower(b: Bake) {
  const x = -152, z = 440 + roadBend(x), y = landHeight(x, z) - 2, steel = PAINT.pylon;
  // Height of each panel's foot and the half-width of the tower there.
  const levels = [[0, 10], [27, 6.2], [51, 2.8], [75, 1.8], [92, 0.65]];
  const leg = (corner: number, level: number): Vec3 => [
    x + (corner < 2 ? -1 : 1) * levels[level][1],
    y + levels[level][0],
    z + ([0, 3].includes(corner) ? -1 : 1) * levels[level][1],
  ];
  // Each face of each panel: the leg, two diagonals crossing it, and the horizontal at its foot.
  for (let k = 0; k < 4; k++)
    for (let h = 0; h < 4; h++) {
      const edge = (k + 1) % 4;
      pipe(b, [leg(k, h), leg(k, h + 1)], 0.35, steel, 4);
      pipe(b, [leg(k, h), leg(edge, h + 1)], 0.19, steel, 4);
      pipe(b, [leg(edge, h), leg(k, h + 1)], 0.19, steel, 4);
      pipe(b, [leg(k, h), leg(edge, h)], 0.18, steel, 4);
    }
  // Two tiers of arms, each carrying a wire either side, sagging across three spans to the next towers.
  for (const h of [63, 79])
    for (const side of [-1, 1]) {
      const tip = z + side * 13;
      pipe(b, [[x, y + h - 4, z], [x, y + h, tip], [x, y + h + 1, z]], 0.33, steel);
      const span = 325;
      for (let k = -1; k <= 1; k++) {
        const points = Array.from({ length: 9 }, (_, i): Vec3 => [
          x + span * (k + i / 8),
          y + h - 1 - 9 * Math.sin((i * Math.PI) / 8),
          tip + 46 * (k + i / 8),
        ]);
        // Thicker than the real conductors, so they draw as the thin dark lines the cover shows (01, 76).
        pipe(b, points, 0.32, PAINT.wire, 4);
      }
    }
}

/**
 * The clipped hedge between the sidewalk and the road (09-13): one dark, rounded mass following the road, its
 * width and crown drifting slowly, tapering shut at the two access gaps.
 */
function hedge(b: Bake) {
  const leaves = tag(13), paint = { color: PAINT.hedge };
  const gaps = [[-132, -118], [97, 115]];
  const runs = [[-200, gaps[0][0]], [gaps[0][1], gaps[1][0]], [gaps[1][1], 335]];
  // A section across it: from its foot on each side, up the shoulder to the crown.
  const profile = [[-1, 0.15], [-0.8, 0.75], [-0.35, 1], [0.35, 1], [0.8, 0.75], [1, 0.15]];
  for (const [from, to] of runs) {
    const at = (x: number, k: number): Vec3 => {
      const taper = Math.min(1, (x - from) / 4, (to - x) / 4);
      const half = (2.6 + 0.4 * Math.sin(x / 23) + 0.2 * Math.sin(x / 7.3)) * (0.4 + 0.6 * taper);
      const crown = (3.3 + 0.35 * Math.sin(x / 17 + 1) + 0.15 * Math.sin(x / 5.3)) * taper;
      const z = roadBend(x) + 140 + profile[k][0] * half;
      return point(x, groundHeight(x, z) + profile[k][1] * crown, z);
    };
    for (let x = from; x < to - 0.01; x += 3) {
      const next = Math.min(x + 3, to);
      for (let k = 0; k + 1 < profile.length; k++) {
        const a = at(x, k), c = at(next, k), d = at(next, k + 1), e = at(x, k + 1);
        b.quad(a, e, d, c, normalOf(a, e, d), paint, leaves);
      }
    }
  }
}
