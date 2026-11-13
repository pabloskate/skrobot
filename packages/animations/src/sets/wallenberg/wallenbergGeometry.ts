import type { BufferGeometry } from 'three';
import type { Vec3 } from '../../camera/view';
import { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { stairContacts, type ContactLine } from '../surfaces';
import { buildAnnex, buildGym, buildNeighbourhood } from './wallenbergBuildings';
import {
  CHAIN_LINK, F, INCH, LEAVES, STEEL, UP, chainLink, face, floor, meshPanel, mixHex, normalOf, part, pipe, solidBox, tag, tube,
  type Plan, type RailShadow, type ShadowBox,
} from './wallenbergKit';
import {
  WALLENBERG_ANNEX_FRONT_X,
  WALLENBERG_CORNER_R,
  WALLENBERG_DROP,
  WALLENBERG_END_Z,
  WALLENBERG_FENCE_Z,
  WALLENBERG_FLIGHTS,
  WALLENBERG_GATE_X,
  WALLENBERG_GYM_BACK_X,
  WALLENBERG_GYM_FAR_Z,
  WALLENBERG_GYM_X,
  WALLENBERG_GYM_Z,
  WALLENBERG_LEDGE_Z,
  WALLENBERG_RAMP,
  WALLENBERG_RISERS,
  WALLENBERG_RUN,
  WALLENBERG_SIDE_STAIRS_Z0,
  WALLENBERG_SIDE_STAIRS_Z1,
  WALLENBERG_STEP_RUN,
  WALLENBERG_STEPS,
  WALLENBERG_TREAD,
  sideStairHeight,
  slopeMeets,
  wallenbergLevel,
  wallenbergRampHeight,
  wallenbergSlope,
  wallenbergSurface,
} from './wallenbergLayout';
import { WALLENBERG_PAINT as PAINT } from './wallenbergPalette';
import { buildWallenbergWear, faceTone } from './wallenbergWear';

const FAR = 1000 * F;
const ASPHALT = tag('asphalt');
const CONCRETE = tag('concrete');
/** Each curb its own part, so the four obstacles outline separately. */
const curbInk = (i: number) => part(40 + i, 'concrete', 2, 0.14);

/* ----- The four curbs and the slope beside them ----- */

const FACE_SEGMENTS = 24;
const ARC_SEGMENTS = 12;
const SIDE_SEGMENTS = 8;
/** How far toward the court the straight curbs' wear, weeds and caps are drawn. */
export const WALLENBERG_NEAR = 75 * F;

/**
 * One of the top two curbs in plan: along its face from the side stairs,
 * round its end, and back along its side to `back`. `inset` moves it toward
 * its upper side; every line has the same points, so the tread between two
 * is a strip of quads.
 */
export function curbLine(i: number, back: number, inset = 0): Plan[] {
  const faceX = i * WALLENBERG_TREAD - inset;
  const end = WALLENBERG_END_Z[i] + inset;
  const r = Math.max(1, WALLENBERG_CORNER_R[i] - inset);
  const points: Plan[] = [];
  for (let k = 0; k <= FACE_SEGMENTS; k++) points.push([faceX, WALLENBERG_SIDE_STAIRS_Z0 + ((end + r - WALLENBERG_SIDE_STAIRS_Z0) * k) / FACE_SEGMENTS]);
  for (let k = 1; k <= ARC_SEGMENTS; k++) {
    const a = ((k / ARC_SEGMENTS) * Math.PI) / 2;
    points.push([faceX - r + r * Math.cos(a), end + r - r * Math.sin(a)]);
  }
  for (let k = 1; k <= SIDE_SEGMENTS; k++) points.push([faceX - r + ((back - (faceX - r)) * k) / SIDE_SEGMENTS, end]);
  return points;
}

/** A strip of floor between two matching plan lines. */
export function strip(b: Bake, inner: Plan[], outer: Plan[], y: number, color: string | ((p: Plan) => string), ink = ASPHALT) {
  const paint = (p: Plan) => ({ color: typeof color === 'string' ? color : color(p) });
  for (let k = 0; k + 1 < inner.length; k++) {
    const [a, c, d, e] = [inner[k], inner[k + 1], outer[k + 1], outer[k]];
    b.quadCorners([a[0], y, a[1]], [e[0], y, e[1]], [d[0], y, d[1]], [c[0], y, c[1]], UP, [paint(a), paint(e), paint(d), paint(c)], ink);
  }
}

/** A floor through its outline, fanned from its middle (or `apex`, where every edge can be seen from), at `height(x)`. */
function fan(b: Bake, outline: Plan[], height: (x: number) => number, color: string, apex?: Plan) {
  const mid: Plan = apex ?? [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length];
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k], c = outline[(k + 1) % outline.length];
    const pa: Vec3 = [a[0], height(a[0]), a[1]], pc: Vec3 = [c[0], height(c[0]), c[1]], pm: Vec3 = [mid[0], height(mid[0]), mid[1]];
    const n = normalOf(pm, pc, pa);
    const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
    b.triangle(pm, pc, pa, up, { color }, ASPHALT);
  }
}

/**
 * The face standing along a plan line, facing its outer (lower) side, from
 * whatever lies outside it up to `top`: full height along the treads,
 * shrinking as the slope beside it rises, gone where the slope is level.
 */
function curbFace(b: Bake, path: Plan[], top: number, tone: (p: Plan, t: number) => string, ink = CONCRETE) {
  const below = path.map((p, k) => {
    const [a, c] = [path[Math.max(0, k - 1)], path[Math.min(path.length - 1, k + 1)]];
    const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const z = Math.min(WALLENBERG_SIDE_STAIRS_Z0 - 1, p[1] + ((c[0] - a[0]) / length) * 0.5);
    return Math.min(top, wallenbergSurface(p[0] - ((c[1] - a[1]) / length) * 0.5, z));
  });
  // Rows up the face, so its paint can grime toward the foot.
  const rows = [0, 0.15, 0.35, 0.6, 1];
  for (let k = 0; k + 1 < path.length; k++) {
    if (below[k] >= top - 0.01 && below[k + 1] >= top - 0.01) continue;
    const [a, c] = [path[k], path[k + 1]];
    const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n: Vec3 = [-(c[1] - a[1]) / length, 0, (c[0] - a[0]) / length];
    const ya = (t: number) => below[k] + (top - below[k]) * t, yc = (t: number) => below[k + 1] + (top - below[k + 1]) * t;
    for (let r = 0; r + 1 < rows.length; r++) {
      const [t0, t1] = [rows[r], rows[r + 1]];
      b.quadCorners([a[0], ya(t0), a[1]], [a[0], ya(t1), a[1]], [c[0], yc(t1), c[1]], [c[0], yc(t0), c[1]], n,
        [{ color: tone(a, t0) }, { color: tone(a, t1) }, { color: tone(c, t1) }, { color: tone(c, t0) }], ink);
    }
  }
}

/** The top curb's face, round its end and along its side back to where the slope swallows it. */
export function topCurbPath(): Plan[] {
  const [meet0, meet1] = [slopeMeets(0), slopeMeets(1)];
  const end0 = WALLENBERG_END_Z[0];
  return [...curbLine(0, meet1), ...Array.from({ length: SIDE_SEGMENTS }, (_, k): Plan => [meet1 + ((meet0 - meet1) * (k + 1)) / SIDE_SEGMENTS, end0])];
}

/**
 * The four curbs, three tall blocks and the short street curb, with off-white
 * painted faces and broad asphalt treads, and the slope beside them: the top
 * two end in rounded corners, their sides sinking into the asphalt rising
 * past them toward the gate, while the lower two run on. Caps, paint, buffing
 * and grime are the wear's (wallenbergWear.ts), drawn on the decals.
 */
export function buildWallenbergBlocks(ground: Bake, props: Bake) {
  const [meet0, meet1] = [slopeMeets(0), slopeMeets(1)];
  const T = WALLENBERG_TREAD;
  const flat = (y: number) => () => y;
  // The top platform: up to the top curb's rounded end, and on back along the alley.
  const r0 = WALLENBERG_CORNER_R[0], end0 = WALLENBERG_END_Z[0];
  const corner0: Plan[] = [];
  for (let k = 0; k <= ARC_SEGMENTS; k++) {
    const a = ((1 - k / ARC_SEGMENTS) * Math.PI) / 2;
    corner0.push([-r0 + r0 * Math.cos(a), end0 + r0 - r0 * Math.sin(a)]);
  }
  fan(ground, [[meet0, end0], ...corner0, [0, WALLENBERG_SIDE_STAIRS_Z0], [meet0, WALLENBERG_SIDE_STAIRS_Z0]], flat(0), PAINT.platform);
  floor(ground, WALLENBERG_GYM_BACK_X, meet0, WALLENBERG_LEDGE_Z, WALLENBERG_SIDE_STAIRS_Z0, 0, PAINT.platform, ASPHALT);
  // The second block's top, between the top two curbs, back to where the slope comes level with it.
  strip(ground, curbLine(0, meet1), curbLine(1, meet1), wallenbergLevel(1), PAINT.tread);
  // The lower two treads run straight on.
  floor(ground, T, 2 * T, -FAR, WALLENBERG_SIDE_STAIRS_Z0, wallenbergLevel(2), PAINT.tread, ASPHALT);
  floor(ground, 2 * T, 3 * T, -FAR, WALLENBERG_SIDE_STAIRS_Z0, wallenbergLevel(3), PAINT.tread, ASPHALT);
  // Faces, each curb its own part.
  const tone = (i: number) => (p: Plan, t: number) => faceTone(i, p[1], t);
  curbFace(ground, topCurbPath(), 0, tone(0), curbInk(0));
  curbFace(ground, curbLine(1, meet1), wallenbergLevel(1), tone(1), curbInk(1));
  for (let i = 2; i < WALLENBERG_STEPS; i++) {
    // Close enough along to carry the paint's patches where the cameras see it; one long quad on out of sight.
    const path: Plan[] = [];
    for (let z = WALLENBERG_SIDE_STAIRS_Z0; z > -WALLENBERG_NEAR; z -= 1.25 * F) path.push([i * T, z]);
    path.push([i * T, -WALLENBERG_NEAR], [i * T, -FAR]);
    curbFace(ground, path, wallenbergLevel(i), tone(i), curbInk(i));
  }
  weeds(props);
  // The slope: past the alley's ledge, past the top curb's end, past the second's, flat beyond the gate.
  const r1 = WALLENBERG_CORNER_R[1], end1 = WALLENBERG_END_Z[1];
  const level = WALLENBERG_GATE_X - 10 * F;
  const slab = (x0: number, x1: number, z1: number) => fan(ground, [[x0, -FAR], [x1, -FAR], [x1, z1], [x0, z1]], wallenbergSlope, PAINT.slope);
  slab(-FAR, level, WALLENBERG_LEDGE_Z);
  slab(level, meet0, WALLENBERG_LEDGE_Z);
  slab(meet0, meet1, end0);
  slab(meet1, T - r1, end1);
  slab(T - r1, T, end1);
  const corner1: Plan[] = [[T, end1]];
  for (let k = 0; k <= ARC_SEGMENTS; k++) {
    const a = ((k / ARC_SEGMENTS) * Math.PI) / 2;
    corner1.push([T - r1 + r1 * Math.cos(a), end1 + r1 - r1 * Math.sin(a)]);
  }
  fan(ground, corner1, wallenbergSlope, PAINT.slope, [T, end1]);
}

/**
 * Grass and weeds in the joint along each face's foot and at the side stairs' end, in clumps, thickest where
 * nobody rolls (refs: every photograph), none on the board's line.
 */
function weeds(props: Bake) {
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    const faceX = i * WALLENBERG_TREAD;
    const lower = wallenbergLevel(i + 1);
    const from = i < WALLENBERG_END_Z.length ? WALLENBERG_END_Z[i] + WALLENBERG_CORNER_R[i] : -WALLENBERG_NEAR;
    for (let z = from + 1.5 * F; z < WALLENBERG_SIDE_STAIRS_Z0 - 1 * F; z += (1.6 + 2.8 * hash2(i, Math.round(z), 51)) * F) {
      if (Math.abs(z) < 3.5 * F || hash2(i, Math.round(z), 52) < 0.35) continue;
      const blades = 4 + Math.floor(5 * hash2(i, Math.round(z), 53));
      const dry = hash2(i, Math.round(z), 54) > 0.6;
      for (let k = 0; k < blades; k++) {
        const s = z + (k - blades / 2) * 1.4;
        const h = (3 + 7 * hash2(k, Math.round(z), 55)) * (i === 3 ? 0.6 : 1);
        const lean = (hash2(k, Math.round(z), 56) - 0.3) * 4;
        props.triangle([faceX + 0.6, lower, s], [faceX + 0.6, lower, s + 1.2], [faceX + 1.2 + lean, lower + h, s + 0.6 + (k % 2 ? 1 : -1)], [1, 0.3, 0],
          { color: mixHex(dry ? PAINT.weedDry : PAINT.weed, '#4f5a33', hash2(k, i, 57) * 0.4) }, tag(LEAVES));
      }
    }
  }
}

/* ----- The side stairs ----- */

/**
 * The side stairs beside the blocks' square end: a flight of three steps
 * down each tall block, landing level with its tread, and one step down the
 * short street curb, galvanized rails along both sides and one down the
 * middle (refs: FindSkateSpots, 2024 group photograph).
 */
function sideStairs(ground: Bake, props: Bake, shadows: RailShadow[]) {
  const z0 = WALLENBERG_SIDE_STAIRS_Z0;
  const z1 = WALLENBERG_SIDE_STAIRS_Z1;
  const bottom = -WALLENBERG_DROP;
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    const steps = WALLENBERG_FLIGHTS[i];
    const rise = WALLENBERG_RISERS[i] / steps;
    const x = i * WALLENBERG_TREAD;
    for (let j = 0; j < steps; j++) {
      const top = wallenbergLevel(i) - (j + 1) * rise;
      const front = x + j * WALLENBERG_STEP_RUN;
      // The last step of a flight runs on as the landing to the next.
      const back = j + 1 < steps ? front + WALLENBERG_STEP_RUN : i + 1 < WALLENBERG_STEPS ? (i + 1) * WALLENBERG_TREAD : front + 4 * F;
      if (top <= bottom + 0.01) continue;
      solidBox(ground, [front, bottom, z0], [back, top, z1], PAINT.concrete, PAINT.concreteTread, part(95, 'concrete', 2, 0.12), 'tfke');
    }
  }
  // Rails at both edges and down the middle: sloped over each flight of three, level along its landing.
  for (const z of [z0 + 0.6 * F, (z0 + z1) / 2, z1 - 0.6 * F]) {
    const points: Vec3[] = [[-1.5 * F, 34 * INCH, z]];
    for (let i = 0; i < WALLENBERG_STEPS - 1; i++) {
      const x = i * WALLENBERG_TREAD;
      points.push([x, wallenbergLevel(i) + 34 * INCH, z]);
      points.push([x + WALLENBERG_FLIGHTS[i] * WALLENBERG_STEP_RUN, wallenbergLevel(i + 1) + 34 * INCH, z]);
    }
    points.push([(WALLENBERG_STEPS - 1) * WALLENBERG_TREAD - 0.5 * F, wallenbergLevel(WALLENBERG_STEPS - 1) + 34 * INCH, z]);
    const middle = Math.abs(z - (z0 + z1) / 2) < 1;
    pipe(props, points, middle ? null : shadows, 1.5, PAINT.galvanised);
    for (const p of points) tube(props, [[p[0], sideStairHeight(p[0] - 1), z], p], 1.45, PAINT.galvanised);
    // The returns: each end turns down to a post.
    const first = points[0], last = points[points.length - 1];
    tube(props, [first, [first[0] - 0.8 * F, first[1] - 0.3 * F, z], [first[0] - 0.8 * F, sideStairHeight(first[0]) + 0.1, z]], 1.45, PAINT.galvanised);
    tube(props, [last, [last[0] + 0.8 * F, last[1] - 0.3 * F, z], [last[0] + 0.8 * F, wallenbergLevel(WALLENBERG_STEPS - 1) + 0.1, z]], 1.45, PAINT.galvanised);
  }
}

/* ----- The run-up ----- */

/**
 * The alley the run-up rolls down: the low concrete ledge along its court
 * side, holding back the slope as it rises, with a pipe rail on top.
 */
function alley(props: Bake, decals: Bake, shadows: RailShadow[]) {
  const z = WALLENBERG_LEDGE_Z;
  const from = slopeMeets(0);
  const xs = Array.from({ length: 17 }, (_, k) => from + ((WALLENBERG_ANNEX_FRONT_X - from) * k) / 16);
  for (let k = 0; k + 1 < xs.length; k++) {
    const [a, c] = [xs[k], xs[k + 1]];
    face(props, [a, 0, z], [a, wallenbergSlope(a), z], [c, wallenbergSlope(c), z], [c, 0, z], PAINT.ledge, part(92, 'concrete', 2, 0.12), [0, 0, 1]);
    // Its cap, a foot wide on the slope's edge, drawn as ground.
    const n = normalOf([a, wallenbergSlope(a), z - 0.8 * F], [a, wallenbergSlope(a), z], [c, wallenbergSlope(c), z]);
    const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
    decals.quad([a, wallenbergSlope(a) + 0.3, z - 0.8 * F], [a, wallenbergSlope(a) + 0.3, z], [c, wallenbergSlope(c) + 0.3, z], [c, wallenbergSlope(c) + 0.3, z - 0.8 * F], up, { color: PAINT.ledgeCap }, CONCRETE);
  }
  // The rail along it, a little in from the edge (the roll-in stills).
  const zr = z - 0.35 * F;
  const start = from - 2 * F;
  const railEnd = WALLENBERG_ANNEX_FRONT_X + 0.5 * F;
  const top = (x: number): Vec3 => [x, wallenbergSlope(x) + 2.6 * F, zr];
  pipe(props, [top(start), top(WALLENBERG_GATE_X + 10 * F), top(railEnd)], shadows, 1.5, PAINT.galvanised);
  for (let x = start; x > railEnd; x -= 5 * F) tube(props, [[x, wallenbergSlope(x), zr], top(x)], 1.45, PAINT.galvanised);
  tube(props, [top(start), [start + 0.6 * F, wallenbergSlope(start) + 2 * F, zr], [start + 0.6 * F, wallenbergSlope(start + 0.6 * F) + 0.1, zr]], 1.45, PAINT.galvanised);
}

/**
 * The plywood roll-in at the end of the run-up: deck level with the side
 * door's little roof, a rounded lip and a steep transition sheeted in
 * plywood gone grey toward its toe, open framing of ribs, posts and braces.
 */
function rollIn(ground: Bake, props: Bake) {
  const r = WALLENBERG_RAMP;
  const w = r.halfWidth;
  const xs: number[] = [r.deck];
  for (let k = 0; k <= 8; k++) xs.push(r.top + ((r.joint - r.top) * k) / 8);
  for (let k = 1; k <= 26; k++) xs.push(r.joint + (r.bottom - r.joint) * (1 - (1 - k / 26) ** 1.4));
  const normal = (a: number, c: number): Vec3 => {
    const dx = c - a, dy = wallenbergRampHeight(c) - wallenbergRampHeight(a);
    const m = Math.hypot(dx, dy);
    return [-dy / m, dx / m, 0];
  };
  const PLY = tag('stucco');
  // The sheet's top is the riding surface; its toe stays a hair off the alley floor it runs out onto.
  const toe = 0.3;
  const sheetTop = (x: number) => Math.max(wallenbergRampHeight(x), toe);
  const sheet = (x: number, z: number) => ({
    color: mixHex(PAINT.plywood, PAINT.plywoodGrey, Math.max(0, 0.75 - sheetTop(x) / r.height) + 0.18 * hash2(Math.round(x / (4 * F)), Math.round(z), 71)),
  });
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], c = xs[k + 1];
    const ya = sheetTop(a), yc = sheetTop(c);
    ground.quadCorners([a, ya, -w], [a, ya, w], [c, yc, w], [c, yc, -w], normal(a, c), [sheet(a, -1), sheet(a, 1), sheet(c, 1), sheet(c, -1)], part(119, 'stucco', 2, 0.12));
  }
  // Sheet seams across the transition and down its middle, and the screw lines over the ribs beneath.
  let rolled = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], c = xs[k + 1];
    const step = Math.hypot(c - a, wallenbergRampHeight(c) - wallenbergRampHeight(a));
    const n = normal(a, c);
    const lift = (x: number): Vec3 => [x + n[0] * 0.2, sheetTop(x) + n[1] * 0.2, 0];
    const [pa, pc] = [lift(a), lift(c)];
    ground.quad([pa[0], pa[1], -0.4], [pa[0], pa[1], 0.4], [pc[0], pc[1], 0.4], [pc[0], pc[1], -0.4], n, { color: PAINT.plywoodSeam }, PLY);
    for (const z of [-w + 0.9, w - 0.9]) ground.quad([pa[0], pa[1], z - 0.25], [pa[0], pa[1], z + 0.25], [pc[0], pc[1], z + 0.25], [pc[0], pc[1], z - 0.25], n, { color: '#a8875a' }, PLY);
    if (Math.floor((rolled + step) / (4 * F)) > Math.floor(rolled / (4 * F))) {
      ground.quad([pc[0] - 0.4, pc[1], -w], [pc[0] - 0.4, pc[1], w], [pc[0] + 0.4, pc[1], w], [pc[0] + 0.4, pc[1], -w], n, { color: PAINT.plywoodSeam }, PLY);
    }
    rolled += step;
  }
  // Framing down each side: a rib under the sheet's edge, posts to the floor, and braces.
  const rib = 3.5 * INCH;
  const WOOD = tag('stucco');
  for (const side of [-1, 1]) {
    const z = side * (w - 0.75 * INCH);
    for (let k = 0; k + 1 < xs.length; k++) {
      const a = xs[k], c = xs[k + 1];
      const ya = wallenbergRampHeight(a), yc = wallenbergRampHeight(c);
      if (ya < rib && yc < rib) continue;
      face(props, [a, Math.max(0, ya - rib), z + side * 0.8], [a, ya, z + side * 0.8], [c, yc, z + side * 0.8], [c, Math.max(0, yc - rib), z + side * 0.8], PAINT.lumber, part(118, 'stucco', 2, 0.1), [0, 0, side]);
    }
    for (let x = r.deck + 2; x < r.bottom - 2.5 * F; x += 16 * INCH) {
      const top = wallenbergRampHeight(x + 1.5 * INCH) - rib;
      if (top < 4) continue;
      solidBox(props, [x, 0, z - 0.75 * INCH], [x + 1.5 * INCH, top, z + 0.75 * INCH], PAINT.lumber, PAINT.lumber, WOOD, 'fkle');
    }
    for (let x = r.deck + 2; x < r.joint + 3 * F; x += 32 * INCH) {
      const a: Vec3 = [x, 0.4 * F, z + side * 1.6];
      const c: Vec3 = [x + 30 * INCH, Math.min(wallenbergRampHeight(x + 30 * INCH) - rib, 5 * F), z + side * 1.6];
      props.tube([a, c], [1.3, 1.3], { color: PAINT.brace }, WOOD, 4);
    }
  }
  // It stands on its own: corner posts under the deck, cross-braced across the back and the sides.
  const deckUnder = r.height - rib;
  for (const x of [r.deck, r.top - 3.5 * INCH]) for (const z of [-w, w - 3.5 * INCH]) {
    solidBox(props, [x, 0, z], [x + 3.5 * INCH, deckUnder, z + 3.5 * INCH], PAINT.lumber, PAINT.lumber, WOOD, 'fkle');
  }
  const brace = (a: Vec3, c: Vec3) => props.tube([a, c], [1.4, 1.4], { color: PAINT.brace }, WOOD, 4);
  brace([r.deck - 1, 0.5 * F, -w], [r.deck - 1, deckUnder - 0.5 * F, w]);
  brace([r.deck - 1, 0.5 * F, w], [r.deck - 1, deckUnder - 0.5 * F, -w]);
  for (const z of [-w - 2, w + 2]) brace([r.deck, 0.5 * F, z], [r.top, deckUnder - 0.5 * F, z]);
  for (const y of [2 * F, 5 * F]) solidBox(props, [r.deck, y, -w], [r.deck + 3.5 * INCH, y + 1.5 * INCH, w], PAINT.lumber, PAINT.lumber, WOOD, 'tkfle');
  face(props, [r.deck, deckUnder, -w], [r.deck, r.height, -w], [r.deck, r.height, w], [r.deck, deckUnder, w], PAINT.lumber, WOOD, [-1, 0, 0]);
}

/* ----- Around the blocks ----- */

/** The bank beside the side stairs, falling with the blocks from the yard above to the yard below. */
const bankHeight = (x: number) => Math.max(-WALLENBERG_DROP, Math.min(0, (-x / WALLENBERG_RUN) * WALLENBERG_DROP));

/**
 * Round the blocks: the yard they land on, with its gutter along the bottom
 * curb; the planted bank and picket fence past the side stairs; up the
 * court-side slope, chain link along its far edge and the gate across its
 * top. Buildings and the neighbourhood are wallenbergBuildings.ts's.
 */
function yard(ground: Bake, props: Bake, mesh: Bake) {
  const bottom = -WALLENBERG_DROP;
  const gutter = WALLENBERG_RUN + 1.5 * F;
  floor(ground, WALLENBERG_RUN, gutter, -FAR, WALLENBERG_SIDE_STAIRS_Z0, bottom, PAINT.gutter, CONCRETE);
  floor(ground, gutter, FAR, -FAR, WALLENBERG_SIDE_STAIRS_Z0, bottom, PAINT.yard, ASPHALT);
  floor(ground, WALLENBERG_RUN, FAR, WALLENBERG_SIDE_STAIRS_Z0, FAR, bottom, PAINT.yard, ASPHALT);
  // Up top past the side stairs and the gym.
  floor(ground, -FAR, 0, WALLENBERG_SIDE_STAIRS_Z0, FAR, 0, PAINT.platform, ASPHALT);
  // The planted bank falling beside the stairs: mulched soil under shrubs.
  const z1 = WALLENBERG_SIDE_STAIRS_Z1;
  const bank = normalOf([0, 0, FAR], [WALLENBERG_RUN, bottom, FAR], [WALLENBERG_RUN, bottom, z1]);
  ground.quad([0, 0, FAR], [WALLENBERG_RUN, bottom, FAR], [WALLENBERG_RUN, bottom, z1], [0, 0, z1], bank[1] < 0 ? bank.map((v) => -v) as Vec3 : bank, { color: PAINT.bankSoil }, tag('soil'));
  // Its concrete edge along the stairs.
  const edge = 0.5 * F;
  face(props, [0, 0, z1], [0, edge, z1], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1], [WALLENBERG_RUN, -WALLENBERG_DROP, z1], PAINT.concrete, part(130, 'concrete', 2, 0.12), [0, 0, -1]);
  face(props, [0, edge, z1], [0, edge, z1 + 0.6 * F], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1 + 0.6 * F], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1], PAINT.ledgeCap, CONCRETE);
  // The galvanized picket fence along it (FindSkateSpots).
  const fenceTop = (x: number) => bankHeight(x) + 4 * F;
  const zf = z1 + 0.3 * F;
  tube(props, [[-1 * F, fenceTop(0), zf], [WALLENBERG_RUN, fenceTop(WALLENBERG_RUN), zf]], 1.4, PAINT.picket);
  tube(props, [[-1 * F, bankHeight(0) + 4, zf], [WALLENBERG_RUN, bankHeight(WALLENBERG_RUN) + 4, zf]], 1.2, PAINT.picket);
  for (let x = 0; x <= WALLENBERG_RUN; x += 5 * INCH) tube(props, [[x, bankHeight(x), zf], [x, fenceTop(x) + 4, zf]], 0.55, PAINT.picket, STEEL, 4);
  // Shrubs on the bank.
  for (let k = 0; k < 9; k++) {
    const x = (k + 0.3) * 2.1 * F, z = z1 + (2.5 + 5 * hash2(k, 1, 131)) * F;
    shrub(props, x, bankHeight(x), z, (1.2 + hash2(k, 2, 131)) * F, k);
  }
  // Chain link along the slope's far edge, and across its top the gate between the annex and it.
  const onSlope = (x: number) => wallenbergSlope(x);
  chainLink(props, mesh, [WALLENBERG_GATE_X, WALLENBERG_FENCE_Z], [WALLENBERG_TREAD, WALLENBERG_FENCE_Z], onSlope, 6 * F);
  chainLink(props, mesh, [WALLENBERG_GATE_X, WALLENBERG_LEDGE_Z - 0.6 * F], [WALLENBERG_GATE_X, -30 * F], onSlope, 6 * F);
  chainLink(props, mesh, [WALLENBERG_GATE_X, -54 * F], [WALLENBERG_GATE_X, WALLENBERG_FENCE_Z], onSlope, 6 * F);
  gate(props, mesh, WALLENBERG_GATE_X, -30 * F, -54 * F, wallenbergSlope(WALLENBERG_GATE_X), 6 * F);
  yucca(props, 2 * WALLENBERG_TREAD - 0.2 * F, WALLENBERG_SIDE_STAIRS_Z0 - 1.6 * F, wallenbergLevel(2));
}

/** A rounded shrub of a few overlapping masses, leaves patterned on them by the look. */
export function shrub(props: Bake, x: number, y: number, z: number, r: number, seed: number, color: string = PAINT.shrub) {
  for (let m = 0; m < 3; m++) {
    const a = m * 2.1 + seed, off = m === 0 ? 0 : r * 0.45;
    const cx = x + Math.cos(a) * off, cz = z + Math.sin(a) * off, rr = r * (m === 0 ? 1 : 0.7);
    const rings = 4, around = 8;
    const p = (i: number, j: number): Vec3 => {
      const lat = (Math.PI / 2) * (i / rings), lon = (j / around) * Math.PI * 2;
      const wob = 0.85 + 0.3 * hash2(seed * 7 + m, i * 10 + (j % around), 133);
      return [cx + Math.cos(lat) * Math.cos(lon) * rr * wob, y + Math.sin(lat) * rr * 1.1 * wob, cz + Math.cos(lat) * Math.sin(lon) * rr * wob];
    };
    for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
      const a0 = p(i, j), a1 = p(i, j + 1), b1 = p(i + 1, j + 1), b0 = p(i + 1, j);
      const n = normalOf(a0, a1, b1);
      props.quad(a0, b0, b1, a1, n[1] < -0.2 ? [-n[0], -n[1], -n[2]] : n, { color: mixHex(color, '#3f4f30', 0.35 * (1 - i / rings) + 0.15 * hash2(i, j, seed)) }, tag(LEAVES));
    }
  }
}

/** A double chain-link gate, braced corner to corner, between posts at z0 and z1. */
function gate(props: Bake, mesh: Bake, x: number, z0: number, z1: number, y: number, height: number) {
  const mid = (z0 + z1) / 2;
  for (const z of [z0, z1]) tube(props, [[x, y, z], [x, y + height + 6, z]], 2.4, '#a2a8a3');
  for (const [a, c] of [[z0, mid], [mid, z1]]) {
    const frame: Vec3[] = [[x, y + 3, a], [x, y + height, a], [x, y + height, c], [x, y + 3, c], [x, y + 3, a]];
    tube(props, frame, 1.3, '#a2a8a3');
    tube(props, [[x, y + height / 2, a], [x, y + height / 2, c]], 1.1, '#a2a8a3');
    tube(props, [[x, y + 3, a], [x, y + height, c]], 1.1, '#a2a8a3');
  }
  // The mesh within the frames.
  for (const [a, c] of [[z0, mid], [mid, z1]]) meshPanel(mesh, [x, a], [x, c], y + 3, y + 3, height - 3);
}

/** The spiky yucca at the foot of the side stairs, half dead, as in every photograph. */
function yucca(props: Bake, x: number, z: number, y: number) {
  for (let k = 0; k < 40; k++) {
    const a = k * 2.4;
    const tilt = 0.3 + 0.6 * hash2(k, 3, 140);
    const length = (2.4 + 1.3 * hash2(k, 4, 140)) * F;
    const dead = hash2(k, 5, 140) > 0.5;
    // Dead leaves hang down as a skirt.
    const droop = dead ? 0.9 + 0.5 * hash2(k, 6, 140) : tilt;
    const tip: Vec3 = [x + Math.cos(a) * Math.sin(droop) * length, y + (dead ? 0.4 * F + Math.cos(droop) * length * 0.5 : Math.cos(droop) * length), z + Math.sin(a) * Math.sin(droop) * length];
    const side: Vec3 = [-Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2];
    const base: Vec3 = [x, y + (dead ? 0.9 * F : 0.6 * F), z];
    const n: Vec3 = [Math.cos(a), 0.4, Math.sin(a)];
    props.triangle([base[0] - side[0], base[1], base[2] - side[2]], [base[0] + side[0], base[1], base[2] + side[2]], tip, n, { color: dead ? mixHex('#a59b72', '#8a7f5c', hash2(k, 7, 140)) : mixHex('#5f7146', '#7a8a55', hash2(k, 8, 140)) }, tag(LEAVES));
  }
  // The woody trunk.
  tube(props, [[x, y, z], [x + 2, y + 1 * F, z]], 4, '#6d6352', tag(0));
}

/* ----- Contact shade and shadows ----- */

/**
 * Contact darkening (the look's lines): along each curb's foot, the gym's front and side walls, the ledge, the
 * annex, and each flight of the side stairs.
 */
function wallenbergContacts(): ContactLine[] {
  const lines: ContactLine[] = [];
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    const x = i * WALLENBERG_TREAD, y = wallenbergLevel(i + 1);
    const from = i < WALLENBERG_END_Z.length ? WALLENBERG_END_Z[i] + WALLENBERG_CORNER_R[i] : -WALLENBERG_NEAR;
    lines.push({ a: [x, y, WALLENBERG_SIDE_STAIRS_Z0], b: [x, y, from], reach: (i === 3 ? 0.5 : 0.8) * F, strength: i === 3 ? 0.22 : 0.3 });
  }
  lines.push({ a: [WALLENBERG_GYM_X, 0, WALLENBERG_GYM_Z], b: [WALLENBERG_GYM_X, 0, WALLENBERG_GYM_FAR_Z], reach: 1.4 * F, strength: 0.3 });
  lines.push({ a: [WALLENBERG_ANNEX_FRONT_X, 0, WALLENBERG_GYM_Z], b: [WALLENBERG_GYM_X, 0, WALLENBERG_GYM_Z], reach: 1.4 * F, strength: 0.32 });
  lines.push({ a: [slopeMeets(0), 0, WALLENBERG_LEDGE_Z], b: [WALLENBERG_ANNEX_FRONT_X, 0, WALLENBERG_LEDGE_Z], reach: 1.0 * F, strength: 0.28 });
  lines.push({ a: [WALLENBERG_ANNEX_FRONT_X, wallenbergSlope(WALLENBERG_ANNEX_FRONT_X), -12 * F], b: [WALLENBERG_ANNEX_FRONT_X, 0, WALLENBERG_LEDGE_Z], reach: 1.2 * F, strength: 0.3 });
  for (let i = 0; i < 3; i++) {
    const rise = WALLENBERG_RISERS[i] / WALLENBERG_FLIGHTS[i];
    lines.push(stairContacts(i * WALLENBERG_TREAD, wallenbergLevel(i), WALLENBERG_SIDE_STAIRS_Z0, WALLENBERG_SIDE_STAIRS_Z1, WALLENBERG_STEP_RUN, rise, WALLENBERG_FLIGHTS[i], 0.45 * F, 0.26));
  }
  return lines;
}

export interface WallenbergBuilt {
  ground: BufferGeometry;
  props: BufferGeometry;
  decals: BufferGeometry;
  wireMesh: typeof CHAIN_LINK & { geometry: BufferGeometry };
  railSegments: RailShadow[];
  shadowBoxes: ShadowBox[];
  contacts: ContactLine[];
}

export function buildWallenbergGeometry(): WallenbergBuilt {
  const ground = new Bake();
  const props = new Bake();
  const decals = new Bake();
  const mesh = new Bake();
  const railSegments: RailShadow[] = [];
  const shadowBoxes: ShadowBox[] = [];
  buildWallenbergBlocks(ground, props);
  sideStairs(ground, props, railSegments);
  alley(props, decals, railSegments);
  rollIn(ground, props);
  buildGym(props, shadowBoxes);
  buildAnnex(props, mesh, railSegments, shadowBoxes);
  yard(ground, props, mesh);
  buildNeighbourhood(props);
  buildWallenbergWear(decals, props);
  const r = WALLENBERG_RAMP;
  shadowBoxes.push({ min: [r.deck, 0, -r.halfWidth], max: [r.joint, r.height, r.halfWidth] });
  return {
    ground: ground.geometry(),
    props: props.geometry(),
    decals: decals.geometry(),
    wireMesh: { ...CHAIN_LINK, geometry: mesh.geometry() },
    railSegments,
    shadowBoxes,
    contacts: wallenbergContacts(),
  };
}
