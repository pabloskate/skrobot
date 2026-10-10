import type { Vec3 } from '../../camera/view';
import { lambert, tone } from '../../camera/camera';
import { mixHex } from '../../math';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  FOOT,
  WALLENBERG_ANNEX_HEIGHT,
  WALLENBERG_ANNEX_X,
  WALLENBERG_ANNEX_FRONT_X,
  WALLENBERG_CORNER_R,
  WALLENBERG_DROP,
  WALLENBERG_END_Z,
  WALLENBERG_FENCE_Z,
  WALLENBERG_FLIGHTS,
  WALLENBERG_GATE_X,
  WALLENBERG_GYM_BACK_X,
  WALLENBERG_GYM_FAR_Z,
  WALLENBERG_GYM_HEIGHT,
  WALLENBERG_GYM_X,
  WALLENBERG_GYM_Z,
  WALLENBERG_LEDGE_Z,
  WALLENBERG_RAMP,
  WALLENBERG_RISERS,
  WALLENBERG_RUN,
  WALLENBERG_SIDE_STAIRS_Z0,
  WALLENBERG_SIDE_STAIRS_Z1,
  WALLENBERG_SLOPE,
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

const WHITE = '#d4d4c9';
const CAP = '#c6c6ba';
const PLATFORM = '#7b7c74';
const TREAD = '#71736c';
const STREET = '#5f625c';
const CONCRETE = '#bdbdb1';
const BRICK = '#965d47';
const METAL = '#8c9997';
const PLYWOOD = '#caa36c';
const LUMBER = '#a9824f';
const PLANTING = '#6c7552';
const UP: Vec3 = [0, 1, 0];
const FAR = 1000 * FOOT;
const ink = (id: number, solid = 0): Ink => ({ id, priority: 2, width: 0.16, kind: INK_PROP, solid });
const blockInk = (i: number) => ink(40 + i, 10);
const masonryInk = ink(80, 10);
const steelInk = ink(61);
const woodInk = ink(119);
const INCH = FOOT / 12;

/** A color lit once by the sun for a face's three-world normal, as boxes are. */
const lit = (color: string, n: Vec3) => tone(color, lambert({ x: n[0], y: -n[1], z: n[2] }));

function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color: lit(color, UP) }, NO_INK);
}

/** A flat face through four corners, lit and outlined as a part. */
function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, n: Vec3, color: string, part: Ink = NO_INK) {
  b.quad(a, c, d, e, n, { color: lit(color, n) }, part);
}

function line(b: Bake, a: Vec3, c: Vec3, radius = 1.4, color = METAL) {
  b.tube([a, c], [radius, radius], { color, lit: { color: '#c2c8c1', from: -1, to: 1 } }, steelInk, 8);
}

/** Galvanized pipe through several points, its shadow cast per segment. */
function pipe(b: Bake, points: Vec3[], shadows: RailShadow[], radius = 1.6) {
  for (let i = 0; i + 1 < points.length; i++) {
    line(b, points[i], points[i + 1], radius);
    shadows.push({ a: points[i], b: points[i + 1], radius });
  }
}

type RailShadow = { a: Vec3; b: Vec3; radius: number };
type Plan = [number, number];

/** Sparse, irregular cracks follow the asphalt, not a repeating paving grid. */
function crack(b: Bake, x: number, z: number, y: number, seed: number, length: number, along: 'x' | 'z' = 'x') {
  let previous: Vec3 = [x, y + 0.13, z];
  for (let k = 1; k <= 7; k++) {
    const wander = 8 * (hash2(seed, k, 50) - 0.5);
    const next: Vec3 = along === 'x' ? [x + length * k / 7, y + 0.13, z + wander] : [x + wander, y + 0.13, z + length * k / 7];
    const [dx, dz] = along === 'x' ? [0, 0.32] : [0.32, 0];
    b.quad([previous[0] - dx, previous[1], previous[2] - dz], [next[0] - dx, next[1], next[2] - dz], [next[0] + dx, next[1], next[2] + dz], [previous[0] + dx, previous[1], previous[2] + dz], UP, { color: '#56594f' }, NO_INK);
    previous = next;
  }
}

/* ----- The four curbs and the slope beside them ----- */

const FACE_SEGMENTS = 10;
const ARC_SEGMENTS = 12;
const SIDE_SEGMENTS = 8;
/** How far toward the court the straight curbs' wear and weeds are drawn. */
const NEAR = 75 * FOOT;

/**
 * One of the top two curbs in plan: along its face from the side stairs,
 * round its end, and back along its side to `back`. `inset` moves it toward
 * its upper side; every line has the same points, so the tread between two
 * is a strip of quads.
 */
export function curbLine(i: number, back: number, inset = 0): Plan[] {
  const face = i * WALLENBERG_TREAD - inset;
  const end = WALLENBERG_END_Z[i] + inset;
  const r = Math.max(1, WALLENBERG_CORNER_R[i] - inset);
  const points: Plan[] = [];
  for (let k = 0; k <= FACE_SEGMENTS; k++) points.push([face, WALLENBERG_SIDE_STAIRS_Z0 + ((end + r - WALLENBERG_SIDE_STAIRS_Z0) * k) / FACE_SEGMENTS]);
  for (let k = 1; k <= ARC_SEGMENTS; k++) {
    const a = ((k / ARC_SEGMENTS) * Math.PI) / 2;
    points.push([face - r + r * Math.cos(a), end + r - r * Math.sin(a)]);
  }
  for (let k = 1; k <= SIDE_SEGMENTS; k++) points.push([face - r + ((back - (face - r)) * k) / SIDE_SEGMENTS, end]);
  return points;
}

/** A strip of floor between two matching plan lines. */
function strip(b: Bake, inner: Plan[], outer: Plan[], y: number, color: string) {
  const paint = { color: lit(color, UP) };
  for (let k = 0; k + 1 < inner.length; k++) {
    const [a, c, d, e] = [inner[k], inner[k + 1], outer[k + 1], outer[k]];
    b.quad([a[0], y, a[1]], [e[0], y, e[1]], [d[0], y, d[1]], [c[0], y, c[1]], UP, paint, NO_INK);
  }
}

/** A floor through its outline, fanned from its middle (or `apex`, where every edge can be seen from), at `height(x)`. */
function fan(b: Bake, outline: Plan[], height: (x: number) => number, color: string, apex?: Plan) {
  const mid: Plan = apex ?? [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length];
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k], c = outline[(k + 1) % outline.length];
    const pa: Vec3 = [a[0], height(a[0]), a[1]], pc: Vec3 = [c[0], height(c[0]), c[1]], pm: Vec3 = [mid[0], height(mid[0]), mid[1]];
    const u = [pc[0] - pm[0], pc[1] - pm[1], pc[2] - pm[2]], v = [pa[0] - pm[0], pa[1] - pm[1], pa[2] - pm[2]];
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Math.hypot(...n) || 1;
    const up: Vec3 = (n[1] < 0 ? n.map(x => -x / m) : n.map(x => x / m)) as Vec3;
    b.triangle(pm, pc, pa, up, { color: lit(color, up) }, NO_INK);
  }
}

/**
 * The face standing along a plan line, facing its outer (lower) side, from
 * whatever lies outside it up to `top`: full height along the treads,
 * shrinking as the slope beside it rises, gone where the slope is level.
 */
function curbFace(b: Bake, path: Plan[], top: number, color: string, part: Ink) {
  const below = path.map((p, k) => {
    const [a, c] = [path[Math.max(0, k - 1)], path[Math.min(path.length - 1, k + 1)]];
    const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const z = Math.min(WALLENBERG_SIDE_STAIRS_Z0 - 1, p[1] + ((c[0] - a[0]) / length) * 0.5);
    return Math.min(top, wallenbergSurface(p[0] - ((c[1] - a[1]) / length) * 0.5, z));
  });
  for (let k = 0; k + 1 < path.length; k++) {
    if (below[k] >= top - 0.01 && below[k + 1] >= top - 0.01) continue;
    const [a, c] = [path[k], path[k + 1]];
    const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n: Vec3 = [-(c[1] - a[1]) / length, 0, (c[0] - a[0]) / length];
    face(b, [a[0], below[k], a[1]], [a[0], top, a[1]], [c[0], top, c[1]], [c[0], below[k + 1], c[1]], n, color, part);
  }
}

/** Patchy repainting, dark wear running down from the lip, and grass in the joint at its foot, along a straight face. */
function weathering(props: Bake, i: number, z0: number, z1: number) {
  const faceX = i * WALLENBERG_TREAD;
  const upper = wallenbergLevel(i);
  const lower = wallenbergLevel(i + 1);
  const bays = Math.round((z1 - z0) / (1.1 * FOOT));
  for (let n = 0; n < bays; n++) {
    const z = z0 + (n * (z1 - z0)) / bays;
    const width = (z1 - z0) / bays;
    const dark = Math.min(upper - lower - 1, 2 + 3 * hash2(i, n, 53));
    props.quad([faceX + 0.1, upper - dark, z], [faceX + 0.1, upper - dark, z + width], [faceX + 0.1, upper, z + width], [faceX + 0.1, upper, z], [1, 0, 0], { color: mixHex('#5f625b', '#a9ada3', hash2(i, n, 54)) }, NO_INK);
    if ((n + i * 2) % 9 === 3 && upper - lower > 8) {
      const patchEnd = Math.min(z1 - 2, z + width * (2.2 + hash2(i, n, 56)));
      props.quad([faceX + 0.14, lower + 2, z + 2], [faceX + 0.14, lower + 2, patchEnd], [faceX + 0.14, upper - dark - 2, patchEnd], [faceX + 0.14, upper - dark - 2, z + 2], [1, 0, 0], { color: '#dfe0d6' }, NO_INK);
    }
    // Kept off the board's line.
    if (Math.abs(z) > 4 * FOOT && n % 3 === 0) {
      for (let k = 0; k < 4; k++) {
        const s = z + k * 2;
        props.triangle([faceX + 1, lower, s], [faceX + 1, lower, s + 1.8], [faceX + 2 + k, lower + 5 + hash2(n, k, 55) * 6, s + 3], [1, 0, 0], { color: '#767e4d' }, NO_INK);
      }
    }
  }
}

/**
 * The four curbs, three tall blocks and the short street curb, with white
 * painted faces, worn caps and broad asphalt treads, and the slope beside
 * them: the top two end in rounded corners, their sides sinking into the
 * asphalt rising past them toward the gate, while the lower two run on.
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
  fan(ground, [[meet0, end0], ...corner0, [0, WALLENBERG_SIDE_STAIRS_Z0], [meet0, WALLENBERG_SIDE_STAIRS_Z0]], flat(0), PLATFORM);
  floor(ground, WALLENBERG_GYM_BACK_X, meet0, WALLENBERG_LEDGE_Z, WALLENBERG_SIDE_STAIRS_Z0, 0, PLATFORM);
  // The second block's top, between the top two curbs, back to where the slope comes level with it.
  strip(ground, curbLine(0, meet1), curbLine(1, meet1), wallenbergLevel(1), TREAD);
  // The lower two treads run straight on.
  floor(ground, T, 2 * T, -FAR, WALLENBERG_SIDE_STAIRS_Z0, wallenbergLevel(2), TREAD);
  floor(ground, 2 * T, 3 * T, -FAR, WALLENBERG_SIDE_STAIRS_Z0, wallenbergLevel(3), TREAD);
  // Faces, each curb its own part so the four obstacles outline separately, with caps worn pale along the lip.
  const top0 = [...curbLine(0, meet1), ...Array.from({ length: SIDE_SEGMENTS }, (_, k): Plan => [meet1 + ((meet0 - meet1) * (k + 1)) / SIDE_SEGMENTS, end0])];
  curbFace(ground, top0, 0, WHITE, blockInk(0));
  curbFace(ground, curbLine(1, meet1), wallenbergLevel(1), WHITE, blockInk(1));
  strip(ground, curbLine(0, meet0, 0.5 * FOOT), curbLine(0, meet0), 0.07, CAP);
  strip(ground, curbLine(1, meet1, 0.5 * FOOT), curbLine(1, meet1), wallenbergLevel(1) + 0.07, CAP);
  for (let i = 2; i < WALLENBERG_STEPS; i++) {
    const x = i * T;
    curbFace(ground, [[x, WALLENBERG_SIDE_STAIRS_Z0], [x, -FAR]], wallenbergLevel(i), WHITE, blockInk(i));
    floor(ground, x - 0.5 * FOOT, x + 0.04, -NEAR, WALLENBERG_SIDE_STAIRS_Z0, wallenbergLevel(i) + 0.07, CAP);
  }
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    weathering(props, i, i < WALLENBERG_END_Z.length ? WALLENBERG_END_Z[i] + WALLENBERG_CORNER_R[i] : -NEAR, WALLENBERG_SIDE_STAIRS_Z0);
    if (i + 1 < WALLENBERG_STEPS) {
      for (let n = 0; n < 7; n++) crack(ground, i * T + 20 + hash2(i, n, 51) * 50, -9 * FOOT + n * 120, wallenbergLevel(i + 1), i * 9 + n, 35 + hash2(i, n, 52) * 48);
    }
  }
  // The slope: past the alley's ledge, past the top curb's end, past the second's, flat beyond the gate.
  const r1 = WALLENBERG_CORNER_R[1], end1 = WALLENBERG_END_Z[1];
  const level = WALLENBERG_GATE_X - 10 * FOOT;
  const slab = (x0: number, x1: number, z1: number) => fan(ground, [[x0, -FAR], [x1, -FAR], [x1, z1], [x0, z1]], wallenbergSlope, '#686a64');
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
  fan(ground, corner1, wallenbergSlope, '#686a64', [T, end1]);
  // Tyre marks scuffed down it.
  for (let k = 0; k < 6; k++) {
    const z = (-24 - k * 7 - 4 * hash2(k, 1, 57)) * FOOT;
    for (let x = -40 * FOOT; x < 4 * FOOT; x += 2 * FOOT) {
      const bend = Math.sin((x / FOOT + k * 3) * 0.12) * 2 * FOOT;
      const y0 = wallenbergSlope(x) + 0.12, y1 = wallenbergSlope(x + 2 * FOOT) + 0.12;
      ground.quad([x, y0, z + bend - 3], [x, y0, z + bend + 3], [x + 2 * FOOT, y1, z + bend + 3], [x + 2 * FOOT, y1, z + bend - 3], UP, { color: lit('#5c5f59', UP) }, NO_INK);
    }
  }
}

/* ----- The side stairs ----- */

/**
 * The side stairs beside the blocks' square end: a flight of three steps
 * down each tall block, landing level with its tread, and one step down the
 * short street curb, galvanized rails along both sides.
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
      const back = j + 1 < steps ? front + WALLENBERG_STEP_RUN : i + 1 < WALLENBERG_STEPS ? (i + 1) * WALLENBERG_TREAD : front + 4 * FOOT;
      if (top <= bottom + 0.01) continue;
      ground.box([front, bottom, z0], [back, top, z1], CONCRETE, '#c6c5b9', ink(95), 'tfke');
    }
  }
  // Rails at both edges: sloped over each flight of three, level along its landing.
  for (const z of [z0 + 0.6 * FOOT, z1 - 0.6 * FOOT]) {
    const points: Vec3[] = [[-1.5 * FOOT, 34 * INCH, z]];
    for (let i = 0; i < WALLENBERG_STEPS - 1; i++) {
      const x = i * WALLENBERG_TREAD;
      points.push([x, wallenbergLevel(i) + 34 * INCH, z]);
      points.push([x + WALLENBERG_FLIGHTS[i] * WALLENBERG_STEP_RUN, wallenbergLevel(i + 1) + 34 * INCH, z]);
    }
    points.push([(WALLENBERG_STEPS - 1) * WALLENBERG_TREAD - 0.5 * FOOT, wallenbergLevel(WALLENBERG_STEPS - 1) + 34 * INCH, z]);
    pipe(props, points, shadows);
    for (const p of points) line(props, [p[0], sideStairHeight(p[0] - 1), z], p, 1.5);
  }
}

/* ----- The gym ----- */

/** Running-bond brick over a wall's face: `along` the wall, `at` its plane, facing `facing`. */
function brickwork(b: Bake, wall: 'x' | 'z', at: number, from: number, to: number, height: number, facing: 1 | -1) {
  const course = height / 19;
  const plane = at + facing * 2.2;
  for (let row = 0; row < 19; row++) {
    const y = row * course;
    for (let s = from - (row % 2) * 8; s < to; s += 17) {
      const lo = Math.max(from, s);
      const hi = Math.min(to, s + 15.6);
      if (hi <= lo) continue;
      const paint = { color: mixHex(BRICK, '#b27a62', hash2(row, s, 63) * 0.55) };
      const n: Vec3 = wall === 'x' ? [facing, 0, 0] : [0, 0, facing];
      const p = (u: number, v: number): Vec3 => (wall === 'x' ? [plane, v, u] : [u, v, plane]);
      b.quad(p(lo, y + 0.65), p(hi, y + 0.65), p(hi, y + course - 0.5), p(lo, y + course - 0.5), n, paint, NO_INK);
    }
  }
  const n: Vec3 = wall === 'x' ? [facing, 0, 0] : [0, 0, facing];
  const p = (u: number, v: number): Vec3 => (wall === 'x' ? [at + facing * 2, v, u] : [u, v, at + facing * 2]);
  face(b, p(from, 0), p(to, 0), p(to, height), p(from, height), n, '#aa8571');
}

/** A bay of the gym's glazing: dark windows over powder-blue ribbed panels. */
function bay(b: Bake, wall: 'x' | 'z', at: number, from: number, to: number, facing: 1 | -1, panel: [number, number], glass: [number, number]) {
  const p = (u: number, v: number, out: number): Vec3 => (wall === 'x' ? [at + facing * out, v, u] : [u, v, at + facing * out]);
  const n: Vec3 = wall === 'x' ? [facing, 0, 0] : [0, 0, facing];
  face(b, p(from, glass[0], 0.5), p(to, glass[0], 0.5), p(to, glass[1], 0.5), p(from, glass[1], 0.5), n, '#263944');
  face(b, p(from, panel[0], 3), p(to, panel[0], 3), p(to, panel[1], 3), p(from, panel[1], 3), n, '#7091a3');
  for (let rib = from + 3; rib < to; rib += 5) line(b, p(rib, panel[0], 3.3), p(rib, panel[1], 3.3), 0.35, '#59798d');
  // Mullions and the sill between them.
  for (const s of [from, (from + to) / 2, to]) {
    const lo = wall === 'x' ? [at + facing * 1, glass[0], s - 1.2] : [s - 1.2, glass[0], at + facing * 1];
    const hi = wall === 'x' ? [at + facing * 4, glass[1], s + 1.2] : [s + 1.2, glass[1], at + facing * 4];
    b.box(lo.map((v, k) => Math.min(v, hi[k])) as Vec3, lo.map((v, k) => Math.max(v, hi[k])) as Vec3, '#b9c1b9', '#ced4ca', NO_INK);
  }
}

/** A round wall vent and a practical light over it. */
function vent(b: Bake, wall: 'x' | 'z', at: number, s: number, y: number, facing: 1 | -1) {
  const p = (out: number): Vec3 => (wall === 'x' ? [at + facing * out, y, s] : [s, y, at + facing * out]);
  b.tube([p(1), p(13)], [12, 12], { color: '#9caaa4' }, NO_INK, 16);
  b.tube([p(13.1), p(14)], [8, 8], { color: '#525e5d' }, NO_INK, 16);
}

/**
 * The gym: pale painted block, a brick base round its corner on the line,
 * powder-blue panels under its windows, round vents; the door with its blue
 * awning on the front, and the long side wall the run-up rolls along, with
 * the little roof over its side door that the roll-in is set against.
 */
function gym(props: Bake) {
  const x = WALLENBERG_GYM_X;
  const z = WALLENBERG_GYM_Z;
  const h = WALLENBERG_GYM_HEIGHT;
  props.box([WALLENBERG_GYM_BACK_X, 0, z], [x, h, WALLENBERG_GYM_FAR_Z], '#d2d4c8', '#c1c4b8', masonryInk, 'tfke');
  props.box([WALLENBERG_GYM_BACK_X - 8, h, z - 8], [x + 9, h + 12, WALLENBERG_GYM_FAR_Z + 8], '#b0b5ab', '#bfc4bb', ink(105));
  const brick = 4.25 * FOOT;
  // Front: brick round the corner, the glazing above it, then white block to the door.
  const brickEnd = z + 8.5 * FOOT;
  brickwork(props, 'x', x, z, brickEnd, brick, 1);
  bay(props, 'x', x, z + 0.8 * FOOT, brickEnd - 0.6 * FOOT, 1, [9.5 * FOOT, 14 * FOOT], [14 * FOOT, 20.5 * FOOT]);
  for (const s of [z + 2.5 * FOOT, z + 6.2 * FOOT]) vent(props, 'x', x, s, 7.4 * FOOT, 1);
  line(props, [x + 6, 0, brickEnd + 6], [x + 6, h - 2, brickEnd + 6], 2.6, '#c98a62');
  const doorZ = 14 * FOOT;
  props.box([x, 0, doorZ], [x + 4, 7.2 * FOOT, doorZ + 3.4 * FOOT], '#353e3d', '#353e3d', NO_INK, 'e');
  props.box([x + 4, 3.6 * FOOT, doorZ + 0.3 * FOOT], [x + 5, 3.9 * FOOT, doorZ + 1.4 * FOOT], '#b9beb4', '#b9beb4', NO_INK, 'e');
  props.box([x, 7.4 * FOOT, doorZ - 14], [x + 2 * FOOT, 7.7 * FOOT, doorZ + 3.4 * FOOT + 14], '#4f7fae', '#bcd0d8', ink(108));
  props.box([x + 0.5, 4.2 * FOOT, doorZ - 1.3 * FOOT], [x + 1.2, 5 * FOOT, doorZ - 0.6 * FOOT], '#2f63a6', '#2f63a6', NO_INK, 'e');
  // A conduit runs up across the white block to a light over the door.
  line(props, [x + 3, 6.6 * FOOT, doorZ + 8 * FOOT], [x + 3, 13.5 * FOOT, doorZ + 0.8 * FOOT], 1.1, '#c9cbbd');
  line(props, [x + 3, 13.5 * FOOT, doorZ + 0.8 * FOOT], [x + 3, 13.5 * FOOT, doorZ - 2 * FOOT], 1.1, '#c9cbbd');
  props.box([x, 11.6 * FOOT, doorZ + 1.2 * FOOT], [x + 10, 12.2 * FOOT, doorZ + 2.2 * FOOT], '#696f67', '#92968a', ink(113));
  for (let y = 14; y < h; y += 35) props.box([x + 0.12, y, brickEnd], [x + 0.23, y + 0.6, WALLENBERG_GYM_FAR_Z], '#bbbfaf', '#bbbfaf', NO_INK, 'e');
  // Side: the brick base along the run-up, vents and lights, the glazing above.
  brickwork(props, 'z', z, WALLENBERG_ANNEX_FRONT_X, x, brick, -1);
  for (let k = 0; k < 4; k++) {
    const s0 = x - 2 * FOOT - (k + 1) * 6.2 * FOOT;
    bay(props, 'z', z, s0, s0 + 5.4 * FOOT, -1, [11 * FOOT, 15.5 * FOOT], [15.5 * FOOT, 21.5 * FOOT]);
    vent(props, 'z', z, s0 + 2.7 * FOOT, 8.6 * FOOT, -1);
    props.box([s0 + 1.2 * FOOT, 10.1 * FOOT, z - 12], [s0 + 2.2 * FOOT, 10.7 * FOOT, z], '#696f67', '#92968a', ink(114));
  }
  for (let y = 14; y < h; y += 35) props.box([WALLENBERG_GYM_BACK_X, y, z - 0.23], [x, y + 0.6, z - 0.12], '#bbbfaf', '#bbbfaf', NO_INK, 'k');
  // The little roof over the side door, level with the roll-in's deck: the ramp's high end butts up to it.
  const r = WALLENBERG_RAMP;
  const roof = r.height + 0.6;
  const front = r.deck - 1;
  props.box([front - 5.5 * FOOT, roof - 7 * INCH, -0.5 * FOOT], [front, roof, z], '#8c9ea8', '#b4c0c4', ink(109), 'tbke');
  props.box([front - 3.6 * FOOT, 0, z - 4], [front - 0.6 * FOOT, 7 * FOOT, z], '#3a4342', '#3a4342', NO_INK, 'k');
  props.box([front - 1.2 * FOOT, 3.4 * FOOT, z - 5], [front - 1 * FOOT, 3.7 * FOOT, z - 4], '#b9beb4', '#b9beb4', NO_INK, 'k');
}

/* ----- The run-up ----- */

/**
 * The alley the run-up rolls down: the low concrete ledge along its court
 * side, holding back the slope as it rises, with a pipe rail on top; and
 * well behind the roll-in, against the gym's side wall, the one-storey brick
 * annex, its door, and a planter on its roof.
 */
function alley(ground: Bake, props: Bake, shadows: RailShadow[]) {
  const z = WALLENBERG_LEDGE_Z;
  const from = slopeMeets(0);
  const xs = Array.from({ length: 17 }, (_, k) => from + ((WALLENBERG_ANNEX_FRONT_X - from) * k) / 16);
  for (let k = 0; k + 1 < xs.length; k++) {
    const [a, c] = [xs[k], xs[k + 1]];
    face(props, [a, 0, z], [a, wallenbergSlope(a), z], [c, wallenbergSlope(c), z], [c, 0, z], [0, 0, 1], '#c3c4b8', ink(92, 10));
    const n: Vec3 = [WALLENBERG_SLOPE, 1, 0];
    ground.quad([a, wallenbergSlope(a) + 0.07, z - 0.6 * FOOT], [a, wallenbergSlope(a) + 0.07, z], [c, wallenbergSlope(c) + 0.07, z], [c, wallenbergSlope(c) + 0.07, z - 0.6 * FOOT], n, { color: lit('#c9cabf', n) }, NO_INK);
  }
  // The rail along it, a little in from the edge.
  const zr = z - 0.3 * FOOT;
  const start = from - 2 * FOOT;
  const railEnd = WALLENBERG_ANNEX_FRONT_X + 0.5 * FOOT;
  pipe(props, [[start, wallenbergSlope(start) + 2.6 * FOOT, zr], [WALLENBERG_GATE_X + 10 * FOOT, wallenbergSlope(WALLENBERG_GATE_X + 10 * FOOT) + 2.6 * FOOT, zr], [railEnd, wallenbergSlope(railEnd) + 2.6 * FOOT, zr]], shadows);
  for (let x = start; x > railEnd; x -= 5 * FOOT) line(props, [x, wallenbergSlope(x), zr], [x, wallenbergSlope(x) + 2.6 * FOOT, zr], 1.4);

  // The annex, brick, against the gym's side wall well behind the roll-in.
  const x0 = WALLENBERG_ANNEX_X, x1 = WALLENBERG_ANNEX_FRONT_X;
  const z0 = -12 * FOOT, z1 = WALLENBERG_GYM_Z;
  const h = WALLENBERG_ANNEX_HEIGHT;
  props.box([x0, 0, z0], [x1, h, z1], BRICK, '#a39d8f', masonryInk, 'tke');
  for (let row = 0; row < 40; row++) {
    const y = (row * h) / 40;
    for (let s0 = z0 - (row % 2) * 8; s0 < z1; s0 += 17) {
      const lo = Math.max(z0, s0), hi = Math.min(z1, s0 + 15.6);
      if (hi > lo) props.quad([x1 + 0.2, y + 0.6, lo], [x1 + 0.2, y + 0.6, hi], [x1 + 0.2, y + h / 40 - 0.5, hi], [x1 + 0.2, y + h / 40 - 0.5, lo], [1, 0, 0], { color: mixHex(BRICK, '#b27a62', hash2(row, s0, 64) * 0.55) }, NO_INK);
    }
  }
  const sill = wallenbergSlope(x1);
  props.box([x1, sill, -10 * FOOT], [x1 + 3, sill + 7 * FOOT, -7.2 * FOOT], '#c99a8c', '#c99a8c', ink(85), 'e');
  props.box([x1, sill + 7 * FOOT, -10.3 * FOOT], [x1 + 4, sill + 7.4 * FOOT, -6.9 * FOOT], '#d0cdc2', '#d0cdc2', NO_INK, 'te');
  // Its parapet, a coping along the front, and a planter on the roof's edge.
  props.box([x0, h, z0], [x1 + 3, h + 1.2 * FOOT, z0 + 0.7 * FOOT], '#b7b1a4', '#c9c3b5', ink(84), 'tke');
  props.box([x1 - 0.7 * FOOT, h, z0], [x1 + 3, h + 0.3 * FOOT, z1], '#b7b1a4', '#c9c3b5', ink(84), 'tke');
  for (const [a, c] of [[-11.5, -5.5]] as const) {
    props.box([x1 - 3 * FOOT, h, a * FOOT], [x1 - 0.8 * FOOT, h + 2 * FOOT, c * FOOT], '#9b6a52', '#b38a6e', ink(86), 'tfke');
    for (let k = 0; k < 6; k++) {
      const cx = x1 - 1.9 * FOOT, cz = (a + ((c - a) * (k + 0.5)) / 6) * FOOT;
      const r = (0.8 + 0.4 * hash2(k, a, 87)) * FOOT;
      props.box([cx - r, h + 2 * FOOT, cz - r], [cx + r, h + 2 * FOOT + r * 1.3, cz + r], '#55693f', '#637a49', ink(88, 13), 'tfkle');
      props.box([cx - 3, h + 2 * FOOT + r * 1.3, cz - 3], [cx + 3, h + 2 * FOOT + r * 1.3 + 3, cz + 3], '#e8e8de', '#f2f2ea', NO_INK, 't');
    }
  }
}

/**
 * The plywood roll-in at the end of the run-up: deck level with the terrace,
 * a rounded lip and a steep transition sheeted in plywood, open framing of
 * ribs, posts and braces down both sides.
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
  // The sheet's top is the riding surface, its thickness keeping the toe off the alley floor.
  const sheet = 0.6;
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], c = xs[k + 1];
    const ya = wallenbergRampHeight(a) + sheet, yc = wallenbergRampHeight(c) + sheet;
    const n = normal(a, c);
    ground.quad([a, ya, -w], [a, ya, w], [c, yc, w], [c, yc, -w], n, { color: lit(PLYWOOD, n) }, woodInk);
  }
  // Sheet seams across the transition, and down its middle.
  let rolled = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    const a = xs[k], c = xs[k + 1];
    const step = Math.hypot(c - a, wallenbergRampHeight(c) - wallenbergRampHeight(a));
    const n = normal(a, c);
    const lift = (x: number): Vec3 => [x + n[0] * 0.2, wallenbergRampHeight(x) + sheet + n[1] * 0.2, 0];
    const [pa, pc] = [lift(a), lift(c)];
    ground.quad([pa[0], pa[1], -0.4], [pa[0], pa[1], 0.4], [pc[0], pc[1], 0.4], [pc[0], pc[1], -0.4], n, { color: lit('#9d7d50', n) }, NO_INK);
    if (Math.floor((rolled + step) / (4 * FOOT)) > Math.floor(rolled / (4 * FOOT))) {
      ground.quad([pc[0] - 0.4, pc[1], -w], [pc[0] - 0.4, pc[1], w], [pc[0] + 0.4, pc[1], w], [pc[0] + 0.4, pc[1], -w], n, { color: lit('#9d7d50', n) }, NO_INK);
    }
    rolled += step;
  }
  // Framing down each side: a rib under the sheet's edge, posts to the floor, and braces.
  const rib = 3.5 * INCH;
  for (const side of [-1, 1]) {
    const z = side * (w - 0.75 * INCH);
    for (let k = 0; k + 1 < xs.length; k++) {
      const a = xs[k], c = xs[k + 1];
      const ya = wallenbergRampHeight(a), yc = wallenbergRampHeight(c);
      if (ya < rib && yc < rib) continue;
      face(props, [a, Math.max(0, ya - rib), z + side * 0.8], [a, ya, z + side * 0.8], [c, yc, z + side * 0.8], [c, Math.max(0, yc - rib), z + side * 0.8], [0, 0, side], LUMBER, woodInk);
    }
    for (let x = r.deck + 2; x < r.bottom - 2.5 * FOOT; x += 16 * INCH) {
      const top = wallenbergRampHeight(x + 1.5 * INCH) - rib;
      if (top < 4) continue;
      props.box([x, 0, z - 0.75 * INCH], [x + 1.5 * INCH, top, z + 0.75 * INCH], LUMBER, '#b8935f', ink(120), 'fkle');
    }
    for (let x = r.deck + 2; x < r.joint + 3 * FOOT; x += 32 * INCH) {
      const a: Vec3 = [x, 0.4 * FOOT, z + side * 1.6];
      const c: Vec3 = [x + 30 * INCH, Math.min(wallenbergRampHeight(x + 30 * INCH) - rib, 5 * FOOT), z + side * 1.6];
      props.tube([a, c], [1.3, 1.3], { color: '#9e7a4a' }, ink(121), 4);
    }
  }
  // It stands on its own: corner posts under the deck, cross-braced across the back and the sides.
  const deckUnder = r.height - rib;
  for (const x of [r.deck, r.top - 3.5 * INCH]) for (const z of [-w, w - 3.5 * INCH]) {
    props.box([x, 0, z], [x + 3.5 * INCH, deckUnder, z + 3.5 * INCH], LUMBER, '#b8935f', ink(123), 'fkle');
  }
  const brace = (a: Vec3, c: Vec3) => props.tube([a, c], [1.4, 1.4], { color: '#9e7a4a' }, ink(121), 4);
  brace([r.deck - 1, 0.5 * FOOT, -w], [r.deck - 1, deckUnder - 0.5 * FOOT, w]);
  brace([r.deck - 1, 0.5 * FOOT, w], [r.deck - 1, deckUnder - 0.5 * FOOT, -w]);
  for (const z of [-w - 2, w + 2]) brace([r.deck, 0.5 * FOOT, z], [r.top, deckUnder - 0.5 * FOOT, z]);
  for (const y of [2 * FOOT, 5 * FOOT]) props.box([r.deck, y, -w], [r.deck + 3.5 * INCH, y + 1.5 * INCH, w], LUMBER, '#b8935f', ink(122), 'tkfle');
  face(props, [r.deck, deckUnder, -w], [r.deck, r.height + 0.6, -w], [r.deck, r.height + 0.6, w], [r.deck, deckUnder, w], [-1, 0, 0], LUMBER, woodInk);
}

/* ----- Around the blocks ----- */

/** Chain link between two points over the ground (`base` its height along x), open so it keeps its depth from every camera. */
function fence(props: Bake, from: [number, number], to: [number, number], base: (x: number) => number, height: number, posts = true) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / length, uz = (to[1] - from[1]) / length;
  const at = (s: number, h: number): Vec3 => {
    const x = from[0] + ux * s;
    return [x, base(x) + h, from[1] + uz * s];
  };
  const n: Vec3 = [-uz, 0, ux];
  if (posts) for (let s = 0; s <= length; s += 7 * FOOT) line(props, at(s, 0), at(s, height + 3), 2.0);
  for (let s = 0; s < length; s += 7 * FOOT) line(props, at(s, height), at(Math.min(length, s + 7 * FOOT), height), 1.55);
  // Diamonds of wire: each strand climbs from the bottom rail to the top, either way along.
  for (let base0 = -height; base0 < length + height; base0 += 10) {
    for (const dir of [-1, 1]) {
      const lo = Math.max(0, dir > 0 ? -base0 : base0 - length);
      const hi = Math.min(height, dir > 0 ? length - base0 : base0);
      if (hi <= lo) continue;
      const a = at(base0 + dir * lo, lo), b = at(base0 + dir * hi, hi);
      props.quad([a[0] - ux * 0.23, a[1], a[2] - uz * 0.23], [b[0] - ux * 0.23, b[1], b[2] - uz * 0.23], [b[0] + ux * 0.23, b[1], b[2] + uz * 0.23], [a[0] + ux * 0.23, a[1], a[2] + uz * 0.23], n, { color: '#8e9c96' }, NO_INK);
    }
  }
}

function tree(props: Bake, x: number, z: number, ground: number, height: number, seed: number, leaf = ['#485744', '#7b8961']) {
  props.tube([[x, ground, z], [x + 5, ground + height * 0.6, z - 7], [x + 19, ground + height * 0.83, z]], [10, 7, 3], { color: '#7b7a67' }, NO_INK, 8);
  for (let crown = 0; crown < 9; crown++) {
    const angle = crown * 2.4;
    const reach = crown === 0 ? 0 : height * 0.22;
    const cx = x + Math.cos(angle) * reach;
    const cz = z + Math.sin(angle) * reach;
    const cy = ground + height * (0.73 + hash2(seed, crown, 74) * 0.2);
    const radius = height * (0.17 + hash2(seed, crown, 75) * 0.07);
    line(props, [x + 5, ground + height * 0.55, z - 7], [cx, cy, cz], 2.7, '#777965');
    const spherePoint = (ring: number, k: number): Vec3 => {
      const latitude = Math.PI * ring / 6;
      const longitude = k * Math.PI / 5;
      const r = radius * (0.83 + 0.26 * hash2(seed + crown, ring * 10 + k % 10, 76));
      return [cx + Math.sin(latitude) * Math.cos(longitude) * r, cy + Math.cos(latitude) * r, cz + Math.sin(latitude) * Math.sin(longitude) * r];
    };
    for (let ring = 0; ring < 6; ring++) for (let k = 0; k < 10; k++) {
      const a = spherePoint(ring, k), b = spherePoint(ring + 1, k), c = spherePoint(ring + 1, (k + 1) % 10), d = spherePoint(ring, (k + 1) % 10);
      const normal: Vec3 = [(a[0] + b[0] + c[0] + d[0]) / 4 - cx, (a[1] + b[1] + c[1] + d[1]) / 4 - cy, (a[2] + b[2] + c[2] + d[2]) / 4 - cz];
      const len = Math.hypot(...normal) || 1;
      const n = normal.map(value => value / len) as Vec3;
      props.quad(a, b, c, d, n, { color: mixHex(leaf[0], leaf[1], 0.16 + 0.42 * hash2(seed + crown, ring * 10 + k, 77)) }, { ...NO_INK, solid: 13 });
    }
  }
}

/**
 * Round the blocks: the street they land on, with its gutter along the
 * bottom curb; the planted bank and picket fence past the side stairs; up
 * the court-side slope, chain link along its far edge and the gate across
 * its top, the apartments beyond.
 */
function yard(ground: Bake, props: Bake) {
  const bottom = -WALLENBERG_DROP;
  const gutter = WALLENBERG_RUN + 1.5 * FOOT;
  floor(ground, WALLENBERG_RUN, gutter, -FAR, WALLENBERG_SIDE_STAIRS_Z0, bottom, '#a3a499');
  floor(ground, gutter, FAR, -FAR, WALLENBERG_SIDE_STAIRS_Z0, bottom, STREET);
  floor(ground, WALLENBERG_RUN, FAR, WALLENBERG_SIDE_STAIRS_Z0, FAR, bottom, STREET);
  // Up top past the side stairs and the gym, and the planted bank falling beside the stairs.
  floor(ground, -FAR, 0, WALLENBERG_SIDE_STAIRS_Z0, FAR, 0, '#8f9088');
  const bank: Vec3 = [WALLENBERG_DROP / Math.hypot(WALLENBERG_DROP, WALLENBERG_RUN), WALLENBERG_RUN / Math.hypot(WALLENBERG_DROP, WALLENBERG_RUN), 0];
  const z1 = WALLENBERG_SIDE_STAIRS_Z1;
  ground.quad([0, 0, FAR], [WALLENBERG_RUN, bottom, FAR], [WALLENBERG_RUN, bottom, z1], [0, 0, z1], bank, { color: lit(PLANTING, bank) }, NO_INK);
  const edge = 0.5 * FOOT;
  face(props, [0, 0, z1], [0, edge, z1], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1], [WALLENBERG_RUN, -WALLENBERG_DROP, z1], [0, 0, -1], CONCRETE, ink(130));
  face(props, [0, edge, z1], [0, edge, z1 + 0.6 * FOOT], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1 + 0.6 * FOOT], [WALLENBERG_RUN, edge - WALLENBERG_DROP, z1], bank, '#cacabe', ink(131));
  // The galvanized picket fence along it.
  const fenceTop = (x: number) => Math.min(0, -x / WALLENBERG_RUN * WALLENBERG_DROP) + 4 * FOOT;
  line(props, [-1 * FOOT, fenceTop(0), z1 + 0.3 * FOOT], [WALLENBERG_RUN, fenceTop(WALLENBERG_RUN), z1 + 0.3 * FOOT], 1.4);
  for (let x = 0; x <= WALLENBERG_RUN; x += 5 * INCH) {
    const y0 = Math.min(0, -x / WALLENBERG_RUN * WALLENBERG_DROP);
    line(props, [x, y0, z1 + 0.3 * FOOT], [x, fenceTop(x) + 4, z1 + 0.3 * FOOT], 0.55);
  }
  // Shrubs on the bank.
  for (let k = 0; k < 9; k++) {
    const x = (k + 0.3) * 2.1 * FOOT, z = z1 + (2.5 + 5 * hash2(k, 1, 131)) * FOOT;
    const y = Math.min(0, -x / WALLENBERG_RUN * WALLENBERG_DROP);
    const r = (1.2 + hash2(k, 2, 131)) * FOOT;
    props.box([x - r, y, z - r], [x + r, y + 1.6 * r, z + r], '#4c5c3c', '#5d6f47', ink(132, 13), 'tfkle');
  }
  // Chain link along the slope's far edge, and across its top the gate between the annex and it.
  fence(props, [WALLENBERG_GATE_X, WALLENBERG_FENCE_Z], [WALLENBERG_TREAD, WALLENBERG_FENCE_Z], wallenbergSlope, 6 * FOOT);
  fence(props, [WALLENBERG_GATE_X, WALLENBERG_LEDGE_Z - 0.6 * FOOT], [WALLENBERG_GATE_X, -30 * FOOT], wallenbergSlope, 6 * FOOT);
  fence(props, [WALLENBERG_GATE_X, -54 * FOOT], [WALLENBERG_GATE_X, WALLENBERG_FENCE_Z], wallenbergSlope, 6 * FOOT);
  gate(props, WALLENBERG_GATE_X, -30 * FOOT, -54 * FOOT, wallenbergSlope(WALLENBERG_GATE_X), 6 * FOOT);
  for (let k = 0; k < 18; k++) crack(ground, WALLENBERG_RUN + 20 + k * 95, -560 + hash2(k, 0, 78) * 1100, bottom, k + 98, 90);
  yucca(props, 2 * WALLENBERG_TREAD - 0.2 * FOOT, WALLENBERG_SIDE_STAIRS_Z0 - 1.6 * FOOT, wallenbergLevel(2));
  houses(props);
  tree(props, -66 * FOOT, -22 * FOOT, wallenbergSlope(-66 * FOOT), 36 * FOOT, 11, ['#2f3d2e', '#4f5e46']);
  tree(props, 6 * FOOT, 38 * FOOT, -1.5 * FOOT, 38 * FOOT, 12);
  tree(props, -14 * FOOT, 52 * FOOT, 0, 40 * FOOT, 13);
  tree(props, 70 * FOOT, -120 * FOOT, bottom, 36 * FOOT, 14);
}

/** A double chain-link gate, braced corner to corner, between posts at z0 and z1. */
function gate(props: Bake, x: number, z0: number, z1: number, y: number, height: number) {
  const mid = (z0 + z1) / 2;
  for (const z of [z0, z1]) line(props, [x, y, z], [x, y + height + 6, z], 2.4);
  for (const [a, c] of [[z0, mid], [mid, z1]]) {
    const frame: Vec3[] = [[x, y + 3, a], [x, y + height, a], [x, y + height, c], [x, y + 3, c], [x, y + 3, a]];
    for (let k = 0; k + 1 < frame.length; k++) line(props, frame[k], frame[k + 1], 1.3);
    line(props, [x, y + height / 2, a], [x, y + height / 2, c], 1.1);
    line(props, [x, y + 3, a], [x, y + height, c], 1.1);
  }
  fence(props, [x, z0], [x, z1], () => y + 3, height - 3, false);
}

/** The spiky yucca at the foot of the side stairs, half dead, as in every photograph. */
function yucca(props: Bake, x: number, z: number, y: number) {
  for (let k = 0; k < 34; k++) {
    const a = k * 2.4;
    const tilt = 0.35 + 0.55 * hash2(k, 3, 140);
    const length = (2.4 + 1.2 * hash2(k, 4, 140)) * FOOT;
    const tip: Vec3 = [x + Math.cos(a) * Math.sin(tilt) * length, y + Math.cos(tilt) * length, z + Math.sin(a) * Math.sin(tilt) * length];
    const side: Vec3 = [-Math.sin(a) * 2.2, 0, Math.cos(a) * 2.2];
    const n: Vec3 = [Math.cos(a), 0.4, Math.sin(a)];
    const dead = hash2(k, 5, 140) > 0.55;
    props.triangle([x - side[0], y, z - side[2]], [x + side[0], y, z + side[2]], tip, n, { color: dead ? '#a39a72' : '#5f7146' }, NO_INK);
  }
}

/** San Francisco houses up the hill behind the terrace, and apartments across the street below. */
function houses(props: Bake) {
  const colors = ['#e2d9c6', '#d8dccf', '#e6d2bb', '#cfd6d8', '#e8e2d2', '#d9c9b6'];
  const row = (x0: number, base: number, from: number, count: number, step: number, facing: 1 | -1, seed: number) => {
    for (let k = 0; k < count; k++) {
      const z = from + k * step;
      const height = (24 + 14 * hash2(k, seed, 150)) * FOOT;
      const depth = 40 * FOOT;
      const x1 = facing > 0 ? x0 : x0 + depth;
      const x2 = facing > 0 ? x0 - depth : x0;
      props.box([Math.min(x1, x2), base, z], [Math.max(x1, x2), base + height, z + step - 1.5 * FOOT], colors[(k + seed) % colors.length], '#bfc0b6', ink(151, 10), facing > 0 ? 'tfke' : 'tfkl');
      for (let floorY = base + 9 * FOOT; floorY < base + height - 6 * FOOT; floorY += 10 * FOOT) {
        for (let w = 0; w < 3; w++) {
          const wz = z + (2 + w * (step - 3.5 * FOOT) / 3) * 1;
          const wx = x0 + facing * 0.6;
          props.quad([wx, floorY, wz + 3 * FOOT], [wx, floorY, wz], [wx, floorY + 5 * FOOT, wz], [wx, floorY + 5 * FOOT, wz + 3 * FOOT], [facing, 0, 0], { color: '#47545a' }, NO_INK);
        }
      }
    }
  };
  row(WALLENBERG_GYM_BACK_X - 40 * FOOT, wallenbergSlope(-FAR), -170 * FOOT, 11, 24 * FOOT, 1, 1);
  row(WALLENBERG_RUN + 150 * FOOT, -WALLENBERG_DROP, -140 * FOOT, 9, 28 * FOOT, -1, 4);
}

export function buildWallenbergGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: RailShadow[] = [];
  buildWallenbergBlocks(ground, props);
  sideStairs(ground, props, railSegments);
  alley(ground, props, railSegments);
  rollIn(ground, props);
  gym(props);
  yard(ground, props);
  const r = WALLENBERG_RAMP;
  const shadowBoxes: Array<{ min: Vec3; max: Vec3 }> = [
    { min: [WALLENBERG_GYM_BACK_X, 0, WALLENBERG_GYM_Z], max: [WALLENBERG_GYM_X, WALLENBERG_GYM_HEIGHT, WALLENBERG_GYM_FAR_Z] },
    { min: [WALLENBERG_ANNEX_X, 0, -12 * FOOT], max: [WALLENBERG_ANNEX_FRONT_X, WALLENBERG_ANNEX_HEIGHT, WALLENBERG_GYM_Z] },
    { min: [r.deck, 0, -r.halfWidth], max: [r.joint, r.height, r.halfWidth] },
  ];
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}
