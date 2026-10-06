import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import { FOOT, WALLENBERG_DRIVE_EDGE, WALLENBERG_DROP, WALLENBERG_HALF_WIDTH, WALLENBERG_RISER, WALLENBERG_RUN, WALLENBERG_SCHOOL_HEIGHT, WALLENBERG_SCHOOL_X, WALLENBERG_STAIR_EDGE, WALLENBERG_STEPS, WALLENBERG_TREAD } from './wallenbergLayout';

const WHITE = '#d4d4c9';
const CONCRETE = '#bdbdb1';
const ASPHALT = '#85867e';
const BRICK = '#965d47';
const METAL = '#8c9997';
const UP: Vec3 = [0, 1, 0];
const ink = (id: number, solid = 0): Ink => ({ id, priority: 2, width: 0.16, kind: INK_PROP, solid });
const blockInk = ink(40, 10);
const masonryInk = ink(80, 10);
const steelInk = ink(61);

function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color }, NO_INK);
}

type Footprint = { x0: number; x1: number; z0: number; z1: number };

/** Adjacent paving owns its footprint; the campus floor never continues underneath it. */
function floorWithOpenings(b: Bake, bounds: Footprint, openings: Footprint[], y: number, color: string) {
  const xs = [...new Set([bounds.x0, bounds.x1, ...openings.flatMap(p => [p.x0, p.x1])])].sort((a, c) => a - c);
  const zs = [...new Set([bounds.z0, bounds.z1, ...openings.flatMap(p => [p.z0, p.z1])])].sort((a, c) => a - c);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      if (openings.some(p => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) continue;
      floor(b, xs[i], xs[i + 1], zs[j], zs[j + 1], y, color);
    }
  }
}

function line(b: Bake, a: Vec3, c: Vec3, radius = 1.4, color = METAL) {
  b.tube([a, c], [radius, radius], { color, lit: { color: '#c2c8c1', from: -1, to: 1 } }, steelInk, 8);
}

/** Sparse, irregular cracks follow the asphalt, not a repeating paving grid. */
function crack(b: Bake, x: number, z: number, y: number, seed: number, length: number) {
  let previous: Vec3 = [x, y + 0.13, z];
  for (let k = 1; k <= 7; k++) {
    const next: Vec3 = [x + length * k / 7, y + 0.13, z + 8 * (hash2(seed, k, 50) - 0.5)];
    b.quad([previous[0], previous[1], previous[2] - 0.32], [next[0], next[1], next[2] - 0.32], [next[0], next[1], next[2] + 0.32], [previous[0], previous[1], previous[2] + 0.32], UP, { color: '#56594f' }, NO_INK);
    previous = next;
  }
}

/** The four white curb faces and their very long, dark paved terraces. */
export function buildWallenbergBlocks(ground: Bake, props: Bake) {
  const z0 = -WALLENBERG_HALF_WIDTH;
  const z1 = WALLENBERG_HALF_WIDTH;
  floor(ground, WALLENBERG_SCHOOL_X, 0, z0, z1, 0, ASPHALT);
  for (let i = 0; i < WALLENBERG_STEPS; i++) {
    const x = i * WALLENBERG_TREAD;
    const upper = -i * WALLENBERG_RISER;
    const lower = upper - WALLENBERG_RISER;
    // Separate faces let tests count the four actual obstacles without counting dressing.
    ground.quad([x, lower, z1], [x, lower, z0], [x, upper, z0], [x, upper, z1], [1, 0, 0], { color: WHITE }, { ...blockInk, id: 40 + i });
    if (i < WALLENBERG_STEPS - 1) {
      floor(ground, x, x + WALLENBERG_TREAD, z0, z1, lower, ASPHALT);
      // A six-inch concrete curb cap, with abraded paint along its outer lip.
      floor(ground, x - 0.5 * FOOT, x + 0.04, z0, z1, upper + 0.07, '#c4c4b8');
      for (let n = 0; n < 7; n++) {
        crack(ground, x + 20 + hash2(i, n, 51) * 50, z0 + 70 + n * 135, lower, i * 9 + n, 35 + hash2(i, n, 52) * 48);
      }
    } else floor(ground, x - 0.5 * FOOT, x + 0.04, z0, z1, upper + 0.07, '#c4c4b8');
    // White repainting is patchy in the archive photographs; dark wear runs below each lip.
    for (let n = 0; n < 38; n++) {
      const z = z0 + n * (z1 - z0) / 38;
      const width = (z1 - z0) / 38;
      const dark = 2.5 + 3 * hash2(i, n, 53);
      props.quad([x + 0.1, upper - dark, z], [x + 0.1, upper - dark, z + width], [x + 0.1, upper, z + width], [x + 0.1, upper, z], [1, 0, 0], { color: mixHex('#5f625b', '#a9ada3', hash2(i, n, 54)) }, NO_INK);
      if ((n + i * 2) % 9 === 3) {
        const patchEnd = Math.min(z1 - 2, z + width * (2.2 + hash2(i, n, 56)));
        props.quad([x + 0.14, lower + 2, z + 2], [x + 0.14, lower + 2, patchEnd], [x + 0.14, upper - dark - 2, patchEnd], [x + 0.14, upper - dark - 2, z + 2], [1, 0, 0], { color: '#dbddd2' }, NO_INK);
      }
      // Short grass blades at the cracks, kept off the board's central travel line.
      if (Math.abs(z) > 4 * FOOT && n % 4 === 0) {
        for (let k = 0; k < 4; k++) {
          const s = z + k * 2;
          props.triangle([x + 1, lower, s], [x + 1, lower, s + 1.8], [x + 2 + k, lower + 5 + hash2(n, k, 55) * 6, s + 3], [1, 0, 0], { color: '#767e4d' }, NO_INK);
        }
      }
    }
  }
}

/** Actual neighboring pedestrian stairs, separate from the skateable block gap. */
function pedestrianStairs(ground: Bake, props: Bake, shadows: Array<{ a: Vec3; b: Vec3; radius: number }>) {
  const z0 = WALLENBERG_STAIR_EDGE;
  const z1 = -WALLENBERG_HALF_WIDTH;
  const half = WALLENBERG_RISER / 2;
  for (let i = 0; i < 4; i++) {
    const x = i * WALLENBERG_TREAD;
    const top = -i * WALLENBERG_RISER;
    ground.box([x, top - half, z0], [x + FOOT, top, z1], CONCRETE, '#c6c5b9', ink(95), 'te');
    if (i < 3) ground.box([x + FOOT, top - WALLENBERG_RISER, z0], [x + WALLENBERG_TREAD, top - half, z1], CONCRETE, '#c6c5b9', ink(95), 'te');
    for (const z of [z0 + 7, z1 - 7]) {
      const railStart: Vec3 = [x - 12, top + 2.8 * FOOT, z];
      const railEnd: Vec3 = [x + 1.9 * FOOT, top - WALLENBERG_RISER + 2.8 * FOOT, z];
      line(props, railStart, railEnd, 1.6);
      line(props, [x, top, z], [x, top + 2.75 * FOOT, z], 1.6);
      shadows.push({ a: railStart, b: railEnd, radius: 1.6 }, { a: [x, top, z], b: [x, top + 2.75 * FOOT, z], radius: 1.6 });
      if (i < 3) {
        const landingEnd: Vec3 = [(i + 1) * WALLENBERG_TREAD - 12, top - WALLENBERG_RISER + 2.8 * FOOT, z];
        line(props, railEnd, landingEnd, 1.6);
        shadows.push({ a: railEnd, b: landingEnd, radius: 1.6 });
      }
    }
  }
  floor(ground, WALLENBERG_SCHOOL_X, 0, z0, z1, 0, '#aaa99d');
  floor(ground, WALLENBERG_RUN + FOOT, 3500, z0, z1, -WALLENBERG_DROP, ASPHALT);
}

/** Gym façade: pale painted masonry, red brick plinth, blue spandrels and dark windows. */
function school(props: Bake) {
  const x = WALLENBERG_SCHOOL_X;
  const h = WALLENBERG_SCHOOL_HEIGHT;
  const z0 = -64 * FOOT;
  const z1 = 19 * FOOT;
  props.box([x - 26 * FOOT, 0, z0], [x, h, z1], '#d2d4c8', '#c1c4b8', masonryInk);
  props.box([x - 26 * FOOT - 8, h, z0 - 8], [x + 9, h + 12, z1 + 8], '#b0b5ab', '#bfc4bb', ink(105));
  // Running-bond brickwork on the right-hand half and the return wall.
  const brickZ0 = -5 * FOOT;
  const brickHeight = 4.25 * FOOT;
  props.box([x, 0, brickZ0], [x + 2, brickHeight, z1], '#aa8571', '#aaa397', NO_INK, 'e');
  for (let row = 0; row < 19; row++) {
    const y = row * brickHeight / 19;
    for (let z = brickZ0 - (row % 2) * 8; z < z1; z += 17) {
      const lo = Math.max(brickZ0, z);
      const hi = Math.min(z1, z + 15.6);
      if (hi <= lo) continue;
      props.quad([x + 2.2, y + 0.65, lo], [x + 2.2, y + 0.65, hi], [x + 2.2, y + brickHeight / 19 - 0.5, hi], [x + 2.2, y + brickHeight / 19 - 0.5, lo], [1, 0, 0], { color: mixHex(BRICK, '#b27a62', hash2(row, z, 63) * 0.55) }, NO_INK);
    }
  }
  props.box([x - 26 * FOOT, 0, z1], [x + 2, brickHeight, z1 + 2], BRICK, '#b69680', NO_INK, 'f');
  // Tall window bays with the recognizable powder-blue ribbed infill underneath.
  for (let i = 0; i < 4; i++) {
    const z = -3 * FOOT + i * 5.25 * FOOT;
    props.box([x + 0.5, 6.5 * FOOT, z], [x + 2.5, 20.5 * FOOT, z + 4.1 * FOOT], '#263944', '#263944', NO_INK, 'e');
    props.box([x + 3, 6.5 * FOOT, z], [x + 5, 11 * FOOT, z + 4.1 * FOOT], '#7091a3', '#a9bec4', NO_INK, 'e');
    for (let rib = z + 3; rib < z + 4.1 * FOOT; rib += 5) line(props, [x + 5.3, 6.5 * FOOT, rib], [x + 5.3, 11 * FOOT, rib], 0.35, '#59798d');
    for (const dz of [0, 2.05 * FOOT, 4.1 * FOOT]) props.box([x + 4, 11 * FOOT, z + dz], [x + 8, 20.5 * FOOT, z + dz + 2.5], '#b9c1b9', '#ced4ca', NO_INK);
    props.box([x + 4, 16 * FOOT, z], [x + 8, 16 * FOOT + 2, z + 4.1 * FOOT], '#b9c1b9', '#ced4ca', NO_INK);
    props.box([x + 3, 6.35 * FOOT, z - 5], [x + 12, 6.5 * FOOT, z + 4.1 * FOOT + 5], '#b3b7ab', '#daddd1', NO_INK);
  }
  // Quiet joint courses across the white gym wall.
  for (let y = 14; y < h; y += 35) props.box([x + 0.12, y, z0], [x + 0.23, y + 0.6, brickZ0 - 2], '#bbbfaf', '#bbbfaf', NO_INK, 'e');
  const doorZ = -18 * FOOT;
  props.box([x + 0.3, 0, doorZ], [x + 4, 7.2 * FOOT, doorZ + 3.4 * FOOT], '#353e3d', '#353e3d', NO_INK, 'e');
  props.box([x + 4, 3.6 * FOOT, doorZ + 1.7 * FOOT], [x + 5, 6 * FOOT, doorZ + 2.3 * FOOT], '#53625f', '#53625f', NO_INK, 'e');
  line(props, [x + 8, 3.3 * FOOT, doorZ + 0.5 * FOOT], [x + 8, 3.3 * FOOT, doorZ + 1.0 * FOOT], 1.3, '#b9beb4');
  props.box([x, 7.3 * FOOT, doorZ - 12], [x + 1.6 * FOOT, 7.48 * FOOT, doorZ + 3.8 * FOOT], '#66879b', '#bcc7c4', ink(108));
  // Electrical conduit, round vents, downpipe and practical exterior lights.
  for (const z of [-43 * FOOT, -12 * FOOT, 7 * FOOT]) {
    props.box([x + 2, 16 * FOOT, z - 8], [x + 14, 16 * FOOT + 11, z + 8], '#696f67', '#92968a', ink(113));
    props.box([x + 14, 16 * FOOT, z - 6], [x + 15, 16 * FOOT + 6, z + 6], '#d4d5bf', '#d4d5bf', NO_INK);
  }
  line(props, [x + 4, 15.7 * FOOT, -45 * FOOT], [x + 4, 15.7 * FOOT, 13 * FOOT], 0.6, '#c9cbbd');
  line(props, [x + 7, 0, 17.8 * FOOT], [x + 7, h - 2, 17.8 * FOOT], 2.7, '#c7c9bb');
  for (const z of [0, 10 * FOOT]) {
    props.tube([[x + 3, 5.4 * FOOT, z], [x + 15, 5.4 * FOOT, z]], [12, 12], { color: '#9caaa4' }, NO_INK, 16);
    props.tube([[x + 15.1, 5.4 * FOOT, z], [x + 16, 5.4 * FOOT, z]], [8, 8], { color: '#525e5d' }, NO_INK, 16);
  }
}

/** A temporary plywood roll-in is parked beside the main line, as seen in modern sessions. */
function rollIn(props: Bake) {
  const z = 11 * FOOT;
  const back = WALLENBERG_SCHOOL_X + 2;
  const length = 11 * FOOT;
  const height = 7.5 * FOOT;
  const width = 5 * FOOT;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    points.push([back + length * t, height * (1 - t) ** 2]);
  }
  for (let i = 0; i < 12; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const m = Math.hypot(x1 - x0, y1 - y0);
    props.quad([x0, y0, z - width / 2], [x1, y1, z - width / 2], [x1, y1, z + width / 2], [x0, y0, z + width / 2], [(y0 - y1) / m, (x1 - x0) / m, 0], { color: '#c3a475' }, ink(119));
    for (const edge of [z - width / 2, z + width / 2]) {
      props.quad([x0, 0, edge], [x1, 0, edge], [x1, y1, edge], [x0, y0, edge], [0, 0, edge > z ? 1 : -1], { color: '#a78860' }, NO_INK);
    }
    if (i % 3 === 0) line(props, [x0 + 0.2, y0 + 0.2, z - width / 2], [x0 + 0.2, y0 + 0.2, z + width / 2], 0.36, '#907b5b');
  }
}

/** Chain link is open geometry, so it retains depth and transparency from every camera. */
function fence(props: Bake, z: number, x0: number, x1: number, y: number, height: number) {
  const wireColor = '#8e9c96';
  const spacing = 10;
  for (let x = x0; x <= x1; x += 7 * FOOT) line(props, [x, y, z], [x, y + height + 3, z], 2.0);
  line(props, [x0, y + height, z], [x1, y + height, z], 1.55);
  for (let base = x0 - height; base < x1 + height; base += spacing) {
    for (const dir of [-1, 1]) {
      const lo = Math.max(0, dir > 0 ? x0 - base : base - x1);
      const hi = Math.min(height, dir > 0 ? x1 - base : base - x0);
      if (hi <= lo) continue;
      const a: Vec3 = [base + dir * lo, y + lo, z];
      const b: Vec3 = [base + dir * hi, y + hi, z];
      props.quad([a[0] - 0.23, a[1], z], [b[0] - 0.23, b[1], z], [b[0] + 0.23, b[1], z], [a[0] + 0.23, a[1], z], [0, 0, 1], { color: wireColor }, NO_INK);
    }
  }
}

function tree(props: Bake, x: number, z: number, ground: number, height: number, seed: number) {
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
      props.quad(a, b, c, d, n, { color: mixHex('#485744', '#7b8961', 0.16 + 0.42 * hash2(seed + crown, ring * 10 + k, 77)) }, { ...NO_INK, solid: 13 });
    }
  }
}

function yard(ground: Bake, props: Bake) {
  const bottom = -WALLENBERG_DROP;
  const courtZ0 = -58 * FOOT, courtZ1 = -29 * FOOT;
  const courtX0 = 23 * FOOT, courtX1 = 96 * FOOT;
  // The court and pedestrian landing replace the yard within their boundaries.
  // The last pedestrian step also occupies its own footprint above the yard.
  floorWithOpenings(ground, { x0: WALLENBERG_RUN, x1: 30000, z0: -30000, z1: 30000 }, [
    { x0: courtX0, x1: courtX1, z0: courtZ0, z1: courtZ1 },
    { x0: WALLENBERG_RUN, x1: 3500, z0: WALLENBERG_STAIR_EDGE, z1: -WALLENBERG_HALF_WIDTH },
  ], bottom, '#81867f');
  // Upper campus ends where the run-up, pedestrian path and parking begin.
  floorWithOpenings(ground, { x0: -30000, x1: 0, z0: -30000, z1: 30000 }, [
    { x0: WALLENBERG_SCHOOL_X, x1: 0, z0: WALLENBERG_STAIR_EDGE, z1: 5000 },
  ], -0.15, '#858b80');
  const normalLength = Math.hypot(WALLENBERG_DROP, WALLENBERG_RUN);
  const bankNormal: Vec3 = [WALLENBERG_DROP / normalLength, WALLENBERG_RUN / normalLength, 0];
  ground.quad([0, 0, -30000], [WALLENBERG_RUN, bottom, -30000], [WALLENBERG_RUN, bottom, WALLENBERG_STAIR_EDGE], [0, 0, WALLENBERG_STAIR_EDGE], bankNormal, { color: '#858b80' }, NO_INK);
  // The parking drive skirts the open end of the four terraces.
  floor(ground, WALLENBERG_SCHOOL_X, 0, WALLENBERG_HALF_WIDTH, WALLENBERG_DRIVE_EDGE, 0, ASPHALT);
  ground.quad([0, 0, WALLENBERG_HALF_WIDTH], [WALLENBERG_RUN, bottom, WALLENBERG_HALF_WIDTH], [WALLENBERG_RUN, bottom, 30000], [0, 0, 30000], bankNormal, { color: '#85877f' }, NO_INK);
  floor(ground, WALLENBERG_SCHOOL_X, 0, WALLENBERG_DRIVE_EDGE, 5000, 0, '#8b8d81');
  // Faded parking stall bars remain outside the line of the jump.
  for (let k = 0; k < 3; k++) floor(ground, -24 * FOOT + k * 9 * FOOT, -24 * FOOT + k * 9 * FOOT + 2.5, 23 * FOOT, 37 * FOOT, 0.1, '#d2d4c7');
  fence(props, 42 * FOOT, WALLENBERG_SCHOOL_X, -3 * FOOT, 0, 6 * FOOT);
  fence(props, -60 * FOOT, -45 * FOOT, 100 * FOOT, bottom, 9 * FOOT);
  // A distant school basketball court, with its hoop well clear of the landing.
  floor(ground, courtX0, courtX1, courtZ0, courtZ1, bottom + 0.1, '#788379');
  for (const z of [courtZ0, courtZ1]) floor(ground, courtX0, courtX1, z, z + 1.5, bottom + 0.15, '#b7ba9e');
  for (const x of [courtX0, (courtX0 + courtX1) / 2, courtX1]) floor(ground, x, x + 1.5, courtZ0, courtZ1, bottom + 0.15, '#b7ba9e');
  const hoopX = courtX1 - 4 * FOOT, hoopZ = (courtZ0 + courtZ1) / 2;
  line(props, [hoopX + 3 * FOOT, bottom, hoopZ], [hoopX + 3 * FOOT, bottom + 11 * FOOT, hoopZ], 3.3, '#717f7b');
  line(props, [hoopX + 3 * FOOT, bottom + 11 * FOOT, hoopZ], [hoopX, bottom + 11 * FOOT, hoopZ], 3.3, '#717f7b');
  props.box([hoopX - 2, bottom + 9.4 * FOOT, hoopZ - 3 * FOOT], [hoopX + 2, bottom + 13 * FOOT, hoopZ + 3 * FOOT], '#c3c9bd', '#d2d8cc', ink(125));
  const hoop: Vec3[] = Array.from({ length: 25 }, (_, k) => [hoopX - 24 + Math.cos(k * Math.PI / 12) * 22, bottom + 10 * FOOT, hoopZ + Math.sin(k * Math.PI / 12) * 22]);
  props.tube(hoop, hoop.map(() => 1.4), { color: '#a36d43' }, NO_INK, 6);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    line(props, [hoopX - 24 + Math.cos(a) * 21, bottom + 10 * FOOT, hoopZ + Math.sin(a) * 21], [hoopX - 24 + Math.cos(a + 0.3) * 13, bottom + 8.8 * FOOT, hoopZ + Math.sin(a + 0.3) * 13], 0.42, '#c0c4b7');
  }
  for (let k = 0; k < 18; k++) crack(ground, WALLENBERG_RUN + 20 + k * 95, -460 + hash2(k, 0, 78) * 1100, bottom, k + 98, 90);
  tree(props, -24 * FOOT, -40 * FOOT, 0, 35 * FOOT, 11);
  tree(props, 35 * FOOT, -71 * FOOT, bottom, 39 * FOOT, 12);
  tree(props, -49 * FOOT, 46 * FOOT, 0, 33 * FOOT, 13);
  // Retaining wall / raised street behind the parking fence.
  props.box([-48 * FOOT, 0, 43 * FOOT], [-3 * FOOT, 3.7 * FOOT, 45 * FOOT], '#9e6751', '#bbb49e', masonryInk);
}

export function buildWallenbergGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: Array<{ a: Vec3; b: Vec3; radius: number }> = [];
  yard(ground, props);
  buildWallenbergBlocks(ground, props);
  pedestrianStairs(ground, props, railSegments);
  school(props);
  rollIn(props);
  const shadowBoxes: Array<{ min: Vec3; max: Vec3 }> = [
    { min: [WALLENBERG_SCHOOL_X - 26 * FOOT, 0, -64 * FOOT], max: [WALLENBERG_SCHOOL_X, WALLENBERG_SCHOOL_HEIGHT, 19 * FOOT] },
    { min: [-48 * FOOT, 0, 43 * FOOT], max: [-3 * FOOT, 3.7 * FOOT, 45 * FOOT] },
  ];
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}
