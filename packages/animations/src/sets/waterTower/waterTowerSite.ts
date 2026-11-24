import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { smoothstep } from '../../math';
import { mixHex, tag, valueNoise } from '../lookKit';
import { scrubPaint } from '../surfaces';
import { box, face, point } from './waterTowerKit';
import { waterTowerHill, WATER_TOWER_FOOT as F } from './waterTowerLayout';
import { WATER_TOWER_PAINT as PAINT, WATER_TOWER_SCRUB } from './waterTowerPalette';

/**
 * The ground round the tanks, in feet in the spot's axes (waterTowerLayout.ts): the service pavement, the
 * hillside the footage was filmed from on the rider's left, the fence, verge and Fullerton Road on the right,
 * the scrub slope beyond the road with houses along its crest, and hills closing both ends of the valley.
 */

/** How far Fullerton Road has swung toward +z at x: straight beside the slot, then away from the pad going north. */
export const roadBend = (x: number) =>
  0.3 * (Math.hypot(x, 105) - Math.hypot(x - 255, 105) + Math.hypot(255, 105) - 105);
/** Where the east slope's crest runs (z past the road's bend), and how high it stands over the roofs. */
export const crest = (x: number) => 440 + 20 * Math.sin(x / 115);
const crestHeight = (x: number) => 72 + 19 * Math.sin(x / 85) + 13 * Math.cos(x / 136);

/** How far into the hills closing the valley's north and south ends x is: 0 on the pad, 1 well into them. */
const intoEnds = (x: number) => smoothstep(Math.max((x - 465) / 145, (-x - 345) / 130));
/** The end hills' height over the pad: long rolling ridges across the valley, not peaks. */
const endHeight = (x: number, z: number) => 60 + 13 * Math.sin(z / 170 + x / 230) + 7 * Math.sin(z / 75 - x / 120);
/** Far up and down the valley the hills close over the road too, so no camera sees a bare horizon down it. */
const closure = (x: number, z: number) => smoothstep((Math.abs(x) - 760) / 480) * (150 + 30 * Math.sin(z / 210 + x / 330));

/** The ground's height over the roofs at (x, z), in feet. */
export function landHeight(x: number, z: number) {
  // Far up and down the valley the hills close in on both sides of the road.
  const distantRise = Math.min(1, Math.max(0, (Math.abs(x) - 550) / 260)) * (92 + 20 * Math.sin(z / 145));
  // The valley road keeps its shallow grade through the distant hills.
  const shoulderDistance = Math.max(0, Math.abs(z - roadBend(x) - 190) - 43);
  const valley = Math.min(1, shoulderDistance / 170);
  const roadRise = Math.min(32, Math.max(0, Math.abs(x) - 460) * 0.035);
  return distantRise * valley + roadRise * (1 - valley) + closure(x, z) + localHeight(x, z);
}

/** The ground near the tanks, before the valley's far hills are added. */
function localHeight(x: number, z: number) {
  // The end hills reach back over the pad's ends and up the hillside; they fall smoothly to the road.
  const across = z - roadBend(x);
  const ends = -21 + intoEnds(x) * endHeight(x, z) * smoothstep((118 - across) / 110);
  if (z < -96) {
    // The hillside: the measured grade through the side filmer's stand, bending and lumping away from it (the
    // lumps fading in up from the foot, so the hill meets the pad without a step), rolling on up past the top of
    // the measured face, and running into the end hills behind the takeoff tank.
    const climb = -96 - z;
    const variation = Math.min(1, Math.max(0, (climb - 54) / 65, (Math.abs(x - 15) - 96) / 80)) * Math.min(1, climb / 30);
    const hill = waterTowerHill(Math.max(z, -207) * F) / F
      + variation * (12 * Math.sin(x / 65 + z / 77) + 8 * Math.sin(z / 39 - x / 90))
      + Math.min(62, Math.max(0, climb - 114) * 0.12);
    return Math.max(hill, ends);
  }
  if (across < 118) return ends;
  // The verge falls four feet from the fence to the road.
  if (across < 150) return -21 - (across - 118) / 8;
  if (across < 235) return -25;
  // The east slope: up to its crest with a ripple across the face, then on up to the hills behind the houses.
  const t = Math.min(1, (across - 235) / (crest(x) - 235));
  return (
    -25 +
    (crestHeight(x) + 25) * t +
    4 * Math.sin(Math.PI * t) * Math.sin(x / 18 + t * 7) +
    Math.max(0, Math.min(1, (across - crest(x)) / 300)) * (78 + 48 * Math.sin(x / 160 + across / 190))
  );
}

/** Where the ground's columns are cut (x, feet): fine across the spot, coarse out to the horizon. */
const COLUMNS = [-2200, -1500, -1150, -850, ...Array.from({ length: 71 }, (_, i) => -560 + i * 16), 850, 1150, 1500, 2200];

/**
 * Where each column is cut across (z, feet): the hillside's edges, then the pad's, then from the fence on the road
 * side's, which bend with the road. The strips between them, by index, are what STRIP names.
 */
const crossSection = (x: number) => [
  -2400, -520, -290, -207, -180, -150, -124, -96, -65,
  ...[
    116, 118, 126, 132, 150, 188, 192, 230, 235, 263, 298, 340, 385,
    crest(x), crest(x) + 65, crest(x) + 200, crest(x) + 380, 2500,
  ].map((z) => z + roadBend(x)),
];
const STRIP = { sidewalk: 11, median: 14 };
const isPad = (j: number) => j === 7 || j === 8 || j === 9;
const isRoad = (j: number) => j === 13 || j === 15;
/** The verge's watered groundcover either side of the sidewalk. */
const isVerge = (j: number) => j === 10 || j === 12;
/** The hillside's face and the east slope's, which the filmers see most of. */
const isWestFace = (j: number) => j >= 3 && j <= 6;
const isEastSlope = (j: number) => j >= 17 && j <= 21;
/** The pad is paved between the hills at its ends. */
const isOpenPad = (j: number, x: number) => isPad(j) && x > -360 && x < 465;
/**
 * Strips cut finer near the filmed line, so the slopes' scrub changes over yards, not over a whole strip; and the
 * pad's wide strip cut finer where the end hills rise over it, so they round over instead of folding on a crease.
 */
const stripsIn = (j: number, x: number) => {
  if (Math.abs(x) < 210 && (isWestFace(j) || isEastSlope(j))) return 4;
  return j === 8 && (x < -330 || x > 440) ? 6 : 1;
};

/** Each quad of the ground: its corners in plan (feet, wound as baked) and the strip of the cross-section it's in. */
function forEachCell(visit: (corners: [number, number][], j: number, x: number) => void, from = 0, to = COLUMNS.length - 1) {
  for (let i = from; i < to; i++) {
    const x = COLUMNS[i], next = COLUMNS[i + 1], left = crossSection(x), right = crossSection(next);
    for (let j = 0; j < left.length - 1; j++) {
      const strips = stripsIn(j, x);
      for (let step = 0; step < strips; step++) {
        const along = (r: number[], k: number) => r[j] + ((r[j + 1] - r[j]) * k) / strips;
        visit([[x, along(left, step + 1)], [next, along(right, step + 1)], [next, along(right, step)], [x, along(left, step)]], j, x);
      }
    }
  }
}

/**
 * The ground mesh's own height at (x, z), in feet: the terrain as its flat faces carry it between their corners,
 * so whatever lies on the ground (a ditch, a path, a bush) sits on what is drawn, not on the smooth terrain under it.
 */
export function groundHeight(x: number, z: number) {
  let i = 0;
  while (i < COLUMNS.length - 2 && COLUMNS[i + 1] <= x) i++;
  let found = landHeight(x, z);
  forEachCell((corners) => {
    // The quad as baked: triangles (0, 1, 2) and (0, 2, 3).
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
      const [p, q, r] = [corners[a], corners[b], corners[c]];
      const det = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
      const wp = ((q[1] - r[1]) * (x - r[0]) + (r[0] - q[0]) * (z - r[1])) / det;
      const wq = ((r[1] - p[1]) * (x - r[0]) + (p[0] - r[0]) * (z - r[1])) / det;
      const wr = 1 - wp - wq;
      if (wp < -1e-9 || wq < -1e-9 || wr < -1e-9) continue;
      found = wp * landHeight(...p) + wq * landHeight(...q) + wr * landHeight(...r);
    }
  }, i, i + 1);
  return found;
}

/** How much of a slope's face is under brush, and how much of the rest is bare dirt (scrubPaint). */
function scrubShare(x: number, z: number, j: number): [number, number] {
  const patchy = 0.7 + 0.6 * valueNoise(x / 70 + 3.3, z / 50);
  const across = z - roadBend(x);
  if (isEastSlope(j) || (j > 17 && across < crest(x) + 20)) {
    // Thicker low down by the road (09-13), a drier band of small bushes on pale ground across the middle (11,
    // 16), a dense stand of chaparral under the houses (66); greener and denser all the way up south of the slot,
    // behind the run-up (05, 07, the right of 66), than opposite it.
    const t = Math.min(1, Math.max(0, (across - 235) / (crest(x) - 235)));
    const cover = 0.2 + 0.27 * (1 - smoothstep(t / 0.25)) + 0.62 * smoothstep((t - 0.4) / 0.35);
    const south = 1 + 0.75 * smoothstep((-x - 30) / 140);
    return [Math.min(0.85, cover * patchy * south), 0.8 - 0.5 * t - 0.2 * (south - 1)];
  }
  // Behind the crest the hills are bare golden grass with the odd dark oak (65, 66).
  if (j > 21) return [0.07 * patchy, 0.06];
  // The hillside the footage was filmed from is dry, brushy and browner (67), thinning smoothly into the end hills.
  const west = smoothstep((-96 - z) / 20) * (1 - smoothstep((Math.abs(x - 15) - 260) / 140));
  return [(0.3 + 0.28 * west) * patchy, 0.3 + 0.2 * west];
}

/** The whole ground: pavement, hillside, verge, road and slopes, smooth-shaded down the terrain. */
export function landscape(b: Bake) {
  const grass = tag('grass'), scrub = tag('scrub'), asphalt = tag('asphalt'), concrete = tag('concrete');
  forEachCell((corners, j, x) => {
    const road = isRoad(j), openPad = isOpenPad(j, x), sidewalk = j === STRIP.sidewalk, median = j === STRIP.median;
    const ink = road || openPad ? asphalt : sidewalk || median ? concrete : isVerge(j) ? grass : scrub;
    const paints = corners.map(([u, v]) => {
      if (road || openPad || sidewalk || median) return { color: openPad ? PAINT.asphalt : road ? PAINT.road : sidewalk ? PAINT.sidewalk : PAINT.median };
      if (isVerge(j)) return { color: mixHex(PAINT.verge, '#8d8a5a', 0.4 * valueNoise(u / 23, v / 9)) };
      return { color: scrubPaint(WATER_TOWER_SCRUB, ...scrubShare(u, v, j)) };
    });
    const positions = corners.map(([u, v]) => point(u, landHeight(u, v), v));
    // Normals from the terrain itself, so the faces shade as one smooth slope.
    const normals = corners.map(([u, v]): Vec3 => {
      const dx = (landHeight(u + 0.25, v) - landHeight(u - 0.25, v)) * 2;
      const dz = (landHeight(u, v + 0.25) - landHeight(u, v - 0.25)) * 2;
      const length = Math.hypot(dx, 1, dz);
      return [-dx / length, 1 / length, -dz / length];
    });
    for (const k of [0, 1, 2, 0, 2, 3]) b.vertex(positions[k], normals[k], paints[k], ink);
  });
}

/**
 * A house on the crest (65, 66): a white two-storey box under a low hipped tile roof with eaves a foot out, two
 * rows of dark windows on the faces that look down the valley and along it. `w` along x, `d` along z.
 */
function house(b: Bake, x: number, y: number, z: number, w: number, h: number, d: number, color: string, seed: number) {
  box(b, x, y, z, w, h, d, color, tag('stucco'));
  const half = w / 2 + 1, depth = d / 2 + 1, eave = y + h, ridge = eave + d * 0.13;
  const tile = seed % 2 ? PAINT.tile : PAINT.tileDark;
  for (const side of [-1, 1]) {
    const hip = half - depth * 0.75;
    face(b, [[x - side * half, eave, z + side * depth], [x + side * half, eave, z + side * depth], [x + side * hip, ridge, z], [x - side * hip, ridge, z]], tile, tag('roofing'));
    b.triangle(point(x + side * half, eave, z - side * depth), point(x + side * hip, ridge, z), point(x + side * half, eave, z + side * depth), [side, 0.4, 0], { color: tile }, tag('roofing'));
  }
  // Windows a hand's breadth proud of the stucco, so they never fight it: a row to each storey.
  const glass = tag('stucco');
  const front = z - d / 2 - 0.12;
  for (const sill of [y + 3.2, y + h - 6.2]) {
    const count = Math.max(2, Math.floor(w / 8.5));
    for (let k = 0; k < count; k++) {
      // The odd bay blank, where a stair or a garage stands behind it.
      if ((seed * 7 + k * 3) % 5 === 0) continue;
      const u = x - w / 2 + (w / count) * (k + 0.5);
      face(b, [[u - 1.7, sill, front], [u + 1.7, sill, front], [u + 1.7, sill + 3.8, front], [u - 1.7, sill + 3.8, front]], PAINT.window, glass);
    }
    for (const end of [-1, 1]) {
      const ex = x + end * (w / 2 + 0.12);
      for (const dz of [-d / 4, d / 4])
        face(b, end > 0
          ? [[ex, sill, z + dz + 1.6], [ex, sill, z + dz - 1.6], [ex, sill + 3.8, z + dz - 1.6], [ex, sill + 3.8, z + dz + 1.6]]
          : [[ex, sill, z + dz - 1.6], [ex, sill, z + dz + 1.6], [ex, sill + 3.8, z + dz + 1.6], [ex, sill + 3.8, z + dz - 1.6]], PAINT.window, glass);
    }
  }
}

/** The district's office south of the takeoff tank (19, 58): a low tan block with a red tile roof. */
function office(b: Bake, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
  box(b, x, y, z, w, h, d, color, tag('stucco'));
  const half = w / 2 + 1, depth = d / 2 + 1, eave = y + h, ridge = eave + d * 0.17;
  for (const side of [-1, 1]) {
    const hip = half - depth * 0.6;
    face(b, [[x - side * half, eave, z + side * depth], [x + side * half, eave, z + side * depth], [x + side * hip, ridge, z], [x - side * hip, ridge, z]], '#906c57', tag('roofing'));
    b.triangle(point(x + side * half, eave, z - side * depth), point(x + side * hip, ridge, z), point(x + side * half, eave, z + side * depth), [side, 0.4, 0], { color: '#98735c' }, tag('roofing'));
  }
}

/**
 * The houses strung along the east crest (65, 66), small, white and irregularly spaced, with gaps of open
 * ground between; and the district's office south of the takeoff tank (19, 58).
 */
export function buildings(b: Bake) {
  let x = -640;
  for (let i = 0; x < 640; i++) {
    const w = 34 + 10 * hash(i, 1), d = 26 + 6 * hash(i, 2), h = 18 + 2 * hash(i, 3);
    const z = crest(x) + roadBend(x) + 14 + 10 * hash(i, 4);
    // Stood into the slope, its downhill foot showing.
    house(b, x, groundHeight(x, z - d / 2) - 1.5, z, w, h, d, hash(i, 5) > 0.3 ? PAINT.house : PAINT.houseShade, i);
    // Houses in twos and threes, then a wider gap.
    x += w + 14 + (hash(i, 6) > 0.6 ? 60 + 70 * hash(i, 7) : 12 * hash(i, 8));
  }
  office(b, -277, -21, -61, 64, 14, 34, PAINT.office);
  office(b, -300, -21, -34, 34, 11, 28, PAINT.officeWing);
}

/** A repeatable 0-1 hash of two integers. */
const hash = (i: number, k: number) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A flat strip `width` wide along the ground from one point to another (feet). */
function ribbon(b: Bake, from: Vec3, to: Vec3, width: number, color: string, ink = tag('concrete')) {
  const [x, y, z] = from, [u, h, v] = to;
  const l = Math.hypot(u - x, v - z), dx = (width * (v - z)) / l / 2, dz = (-width * (u - x)) / l / 2;
  face(b, [[x - dx, y, z - dz], [u - dx, h, v - dz], [u + dx, h, v + dz], [x + dx, y, z + dz]], color, ink);
}

/**
 * A concrete V-ditch along a path over the ground (feet): about three feet across its lips, its two faces sloping
 * in to the invert, the face toward the sun the paler. Laid on the drawn ground, its lips just proud of it.
 */
function ditch(b: Bake, path: [number, number][]) {
  const concrete = tag('concrete');
  for (let i = 0; i + 1 < path.length; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    const l = Math.hypot(x1 - x0, z1 - z0), ox = (1.5 * (z1 - z0)) / l, oz = (-1.5 * (x1 - x0)) / l;
    const at = ([x, z]: [number, number], side: number, lift: number): Vec3 => [x + side * ox, groundHeight(x + side * ox, z + side * oz) + lift, z + side * oz];
    const p = path[i], q = path[i + 1];
    face(b, [at(p, -1, 0.35), at(q, -1, 0.35), at(q, 0, 0.12), at(p, 0, 0.12)], PAINT.ditch, concrete);
    face(b, [at(p, 0, 0.12), at(q, 0, 0.12), at(q, 1, 0.35), at(p, 1, 0.35)], mixHex(PAINT.ditch, '#9a9684', 0.35), concrete);
  }
}

/**
 * The drainage ditches slanting down the east slope (16, 65, 66), the dirt track across the hillside (58), the
 * office's parking and the access road.
 */
export function sitePaths(b: Bake) {
  for (const [start, lean] of [[-205, -0.55], [52, -0.62], [250, 0.5]]) {
    const path: [number, number][] = [];
    for (let across = 238; across < 410; across += 8) {
      const x = start + lean * (across - 238) + 5 * Math.sin(across / 37);
      path.push([x, roadBend(x) + across]);
    }
    ditch(b, path);
  }
  // Trodden dirt with the scrub's edges broken over it: a pale track, not a painted line.
  const track = scrubPaint(WATER_TOWER_SCRUB, 0.12, 0.62);
  for (let i = 0; i < 70; i++) {
    const at = (j: number): Vec3 => {
      const x = -400 + j * 12, z = -180 + 9 * Math.sin(x / 77);
      return [x, groundHeight(x, z) + 0.15, z];
    };
    ribbon(b, at(i), at(i + 1), 6.2, track, tag('scrub'));
  }
  // A small service parking apron at the office.
  for (let i = 0; i <= 7; i++) ribbon(b, [-310 + i * 8.5, -20.96, -13], [-310 + i * 8.5, -20.96, 4], 0.28, '#c0bca5');
  // The access road beyond C meets Fullerton at the north end of the pad.
  for (let z = -76; z < 190 + roadBend(400); z += 8) {
    ribbon(b, [403, groundHeight(403, z) + 0.1, z], [403, groundHeight(403, z + 8) + 0.1, z + 8], 24, PAINT.road, tag('asphalt'));
  }
}
