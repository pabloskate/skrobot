import type { Vec3 } from '../../camera/view';
import { NO_INK, type Paint } from '../../three/bake';
import { surfaceInk } from '../surfaces';
import type { Baker } from './turn';
import { HOLLYWOOD_TREES } from './hollywoodTrees';
import { HOLLYWOOD_PAINT as PAINT } from './hollywoodPalette';
import { HOLLYWOOD_CURB_Z, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_LANE_WIDTH, HOLLYWOOD_ROAD_Y, HOLLYWOOD_FOOT as F } from './hollywoodLayout';

/**
 * Highland Avenue and what stands across it, about 2011-12 (50, 54, 62-66, 74, 76, 77, 87), in the sixteen's frame:
 * the school's sidewalk with its tree wells, the kerbs and gutters, seven 11.3 ft lanes (a centre turn lane edged
 * in double yellow), black lantern posts, two signal masts at the corners, and across the avenue an open parking
 * lot behind a low wall with plain billboard frames and a white block set back behind it. Generic shapes only: no
 * real building, sign, name or logo. Ground paint goes in `decals` (so it takes shade), solids in `props`.
 */

type SurfaceKind = 'concrete' | 'stucco' | 'metal' | 'glass' | 'asphalt';

/** Paint, as it looks in sun: the shared ones from hollywoodPalette.ts. */
const KERB = PAINT.kerb;
const KERB_GRIME = '#9a968b';
const GUTTER_GRIME = '#8c887e';
const LANE_YELLOW = PAINT.laneYellow;
const LANE_WHITE = PAINT.laneWhite;
const SIDEWALK = PAINT.sidewalk;
const SIDEWALK_JOINT = PAINT.sidewalkJoint;
const WELL_SOIL = PAINT.wellSoil;
const WELL_SOIL_DARK = '#5a4d3c';
const POST_BLACK = PAINT.postBlack;
const LANTERN_GLASS = '#cfccbb';
const SIGNAL_HEAD = '#3a3f37';
const SIGNAL_LENS = ['#6e4a3c', '#77693f', '#4a6650'];
const ROAD = PAINT.road;
const ROAD_PATCH = ['#706d66', '#8a867d', '#77736b'];
const ROAD_STAIN = ['#74706a', '#78746d'];
const LOT_ASPHALT = '#7a776e';
const LOT_WALL = '#b3ad9b';
const WHITE_BLOCK = '#d8d7cb';
const LOW_FRONTAGE = '#c0b49c';
const DISTANT_BLOCK = '#b6b4a5';
const PALE_BLOCK = '#cbc9bd';
const WARM_BLOCK = '#bfae93';
const WINDOW_BAND = '#7c8184';
const ROOF_UNIT = '#9d9e97';
const STEEL = '#6d6f6a';
const SHRUB_BED = '#a39c8c';
/** Billboard faces: plain muted colour blocks only, never words or pictures. */
const BILLBOARD_BLOCKS: Array<[string, string]> = [['#3e4650', '#a49c86'], ['#7b8f92', '#c9c0a6'], ['#8f7d68', '#d2ccb8'], ['#4d5a52', '#b5ab95']];
/** Parked cars' sun-faded body colours and their dark glass. */
const CAR_COLOURS = ['#c9c8c0', '#8d9092', '#5a5f63', '#2f3337', '#8b3a33', '#d9d6cb', '#4f5b6b', '#a7a291'];
const CAR_GLASS = '#3d4246';

/** Far enough along the avenue to run past both horizons. */
const ROAD_FAR = 24000;
/** The sidewalk's own height, and the retaining wall's face along its school edge (feet). */
const SIDEWALK_Y = -8;
const RETAINING_FACE = -8.65;

interface StreetTools {
  props: Baker;
  ground: Baker;
  decals: Baker;
  /** A level quad in set units, uninked. */
  flat: (bake: Baker, x0: number, x1: number, z0: number, z1: number, y: number, color: string) => void;
  /** A box between two corners in feet; `faces` as Bake's, so what stands on the ground or a wall skips its hidden faces. */
  box: (min: Vec3, max: Vec3, color: string, surface?: SurfaceKind, faces?: string) => void;
  /**
   * A black metal post or arm through points in feet, its radius in set units (or a radius per point), with `sides`
   * round it: eight for the lanterns by the stairs, fewer for what is only seen far off.
   */
  pipe: (points: Vec3[], radius: number | number[], color?: string, sides?: number, caps?: boolean) => void;
  /**
   * A level patch on the road or sidewalk, its own paint at each corner, x0..x1 by z0..z1 in feet at height y (set
   * units), on `surface` or, for 'paint', the stock paint path like the other lines.
   */
  patch: (bake: Baker, x0: number, x1: number, z0: number, z1: number, y: number, corners: [Paint, Paint, Paint, Paint], surface: SurfaceKind | 'paint') => void;
}

export function buildStreet(props: Baker, ground: Baker, decals: Baker) {
  const flat: StreetTools['flat'] = (bake, x0, x1, z0, z1, y, color) => bake.quad(
    [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0], { color }, NO_INK);
  const box: StreetTools['box'] = (min, max, color, surface = 'concrete', faces = 'tbfkle') =>
    props.box(min.map(v => v * F) as Vec3, max.map(v => v * F) as Vec3, color, color, surfaceInk(surface), faces);
  const pipe: StreetTools['pipe'] = (points, radius, color = POST_BLACK, sides = 6, caps = true) => props.tube(
    points.map(p => p.map(v => v * F) as Vec3), points.map((_, i) => (Array.isArray(radius) ? radius[i] : radius)), { color }, surfaceInk('metal'), sides, caps);
  const patch: StreetTools['patch'] = (bake, x0, x1, z0, z1, y, corners, surface) => bake.quadCorners(
    [x0 * F, y, z0 * F], [x1 * F, y, z0 * F], [x1 * F, y, z1 * F], [x0 * F, y, z1 * F], [0, 1, 0], corners, surface === 'paint' ? NO_INK : surfaceInk(surface));
  const tools: StreetTools = { props, ground, decals, flat, box, pipe, patch };

  buildKerbs(tools);
  buildLanePaint(tools);
  buildSidewalk(tools);
  buildLamps(tools);
  buildSignals(tools);
  buildRoadWear(tools);
  buildFarSide(tools);
  buildSkylineClosures(tools);
  buildNorthShrubBed(tools);
  buildCrossStreetPaint(tools);
}

/** Both six-inch kerbs (76): the kerb's face down to the road, grimy at its foot, and a 1.5 ft concrete gutter pan in front of it, dark along the crease and at its joint with the road. */
function buildKerbs({ ground, decals, flat }: StreetTools) {
  for (const [z, direction] of [[HOLLYWOOD_CURB_Z, -1], [HOLLYWOOD_FAR_CURB_Z, 1]]) {
    ground.quadCorners([-ROAD_FAR, HOLLYWOOD_ROAD_Y, z], [ROAD_FAR, HOLLYWOOD_ROAD_Y, z], [ROAD_FAR, SIDEWALK_Y * F, z], [-ROAD_FAR, SIDEWALK_Y * F, z],
      [0, 0, direction], [{ color: KERB_GRIME }, { color: KERB_GRIME }, { color: KERB }, { color: KERB }], surfaceInk('concrete'));
    const pan = z + direction * 1.5 * F;
    flat(decals, -ROAD_FAR, ROAD_FAR, Math.min(z, pan), Math.max(z, pan), HOLLYWOOD_ROAD_Y + 0.06, KERB);
    const crease = z + direction * 0.3 * F, edge = pan - direction * 0.12 * F;
    flat(decals, -ROAD_FAR, ROAD_FAR, Math.min(z, crease), Math.max(z, crease), HOLLYWOOD_ROAD_Y + 0.07, GUTTER_GRIME);
    flat(decals, -ROAD_FAR, ROAD_FAR, Math.min(edge, pan), Math.max(edge, pan), HOLLYWOOD_ROAD_Y + 0.07, GUTTER_GRIME);
  }
}

/**
 * Lane lines between the seven lanes (77, 50, 13): double yellow either side of the centre turn lane (lanes 3 and
 * 4 counted from the near kerb), white ten-foot dashes every forty feet between the others. Near the school every
 * line is worn unevenly back toward the road's grey, foot by foot; past 300 ft each way it runs on as one strip.
 */
function buildLanePaint({ decals, flat, patch }: StreetTools) {
  const y = HOLLYWOOD_ROAD_Y + 0.08;
  const worn = (color: string, seed: number): Paint => ({ color: mix(color, ROAD, 0.08 + 0.42 * random(seed) ** 2) });
  const line = (x0: number, x1: number, z0: number, z1: number, color: string, seed: number) => {
    for (let x = x0; x < x1; x += 10) {
      const a = worn(color, seed + x), b = worn(color, seed + x + 10);
      patch(decals, x, Math.min(x1, x + 10), z0, z1, y, [a, b, b, a], 'paint');
    }
  };
  for (let lane = 1; lane < 7; lane++) {
    const z = (HOLLYWOOD_CURB_Z - lane * HOLLYWOOD_LANE_WIDTH) / F;
    if (lane === 3 || lane === 4) {
      for (const offset of [-3, 3]) {
        const z0 = z + offset / F, z1 = z0 + 1.5 / F;
        line(-200, 200, z0, z1, LANE_YELLOW, lane * 1000 + offset * 100);
        const far = mix(LANE_YELLOW, ROAD, 0.25);
        flat(decals, -ROAD_FAR, -200 * F, z0 * F, z1 * F, y, far);
        flat(decals, 200 * F, ROAD_FAR, z0 * F, z1 * F, y, far);
      }
    } else {
      for (let x = -300; x < 300; x += 40) line(x, x + 10, z, z + 2 / F, LANE_WHITE, lane * 1000 + x);
    }
  }
}

/**
 * Highland's own wear near the school (44, 13, 36, 62-66): darker wheel paths down the travel lanes, a few dark oil
 * drips down the lanes' middles, and patched trench cuts in other greys, all on the asphalt surface so its stones
 * carry on across them.
 */
function buildRoadWear({ decals, patch }: StreetTools) {
  const y = HOLLYWOOD_ROAD_Y;
  const paint = (color: string): Paint => ({ color });
  for (const lane of [0, 1, 2, 4, 5, 6]) {
    const middle = (HOLLYWOOD_CURB_Z - (lane + 0.5) * HOLLYWOOD_LANE_WIDTH) / F;
    for (const side of [-2.9, 2.9]) {
      const dark = paint(mix(ROAD, '#5e5b55', 0.18)), edge = paint(ROAD);
      patch(decals, -300, 300, middle + side - 1.2, middle + side, y + 0.03, [edge, edge, dark, dark], 'asphalt');
      patch(decals, -300, 300, middle + side, middle + side + 1.2, y + 0.03, [dark, dark, edge, edge], 'asphalt');
    }
    for (let k = 0; k < 6; k++) {
      const x = -200 + 400 * random(lane * 50 + k), r = 0.8 + 1.4 * random(lane * 50 + k + 20);
      blot(decals, x * F, (middle + (random(lane * 50 + k + 40) - 0.5) * 1.5) * F, y + 0.05, r * F, ROAD_STAIN[k % 2], lane * 50 + k, 7);
    }
  }
  // Trench patches: a long one along the near lanes, two short cuts across, a square over a utility box.
  for (const [x0, x1, z0, z1, k] of [[-120, -44, -45, -41.5, 0], [14, 22, -95, -30, 1], [96, 101, -70, -30, 2], [-20, -12, -63, -56, 1]]) {
    const c = paint(ROAD_PATCH[k]);
    patch(decals, x0, x1, z0, z1, y + 0.04, [c, c, c, c], 'asphalt');
  }
}

/**
 * The school's sidewalk (63-66): square joints every five feet each way, and a 4 ft soil well round each tree, its
 * soil darker toward the trunk, with the slab beside it heaved up by the roots on the school side and on one end.
 */
function buildSidewalk({ ground, decals, flat }: StreetTools) {
  for (let x = -150; x < 150; x += 5) flat(decals, x * F, x * F + 0.5, HOLLYWOOD_CURB_Z, RETAINING_FACE * F, SIDEWALK_Y * F + 0.07, SIDEWALK_JOINT);
  for (const z of [-23, -18, -13]) flat(decals, -150 * F, 150 * F, z * F, z * F + 0.5, SIDEWALK_Y * F + 0.07, SIDEWALK_JOINT);
  const soil = { color: WELL_SOIL }, dark = { color: WELL_SOIL_DARK };
  HOLLYWOOD_TREES.forEach(({ at: [x, , z] }, k) => {
    const y = SIDEWALK_Y * F + 0.08, h = 2 * F;
    // The soil, in four quarters darker at the trunk.
    const corners: Vec3[] = [[x - h, y, z - h], [x + h, y, z - h], [x + h, y, z + h], [x - h, y, z + h]];
    const mid = (i: number): Vec3 => { const a = corners[(i + 4) % 4], b = corners[(i + 5) % 4]; return [(a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2]; };
    for (let i = 0; i < 4; i++) ground.quadCorners([x, y, z], mid(i - 1), corners[i], mid(i), [0, 1, 0], [dark, soil, soil, soil], surfaceInk('soil'));
    // Heaved slabs: rising from the joint 1.5 ft out to a lip 1.5 in proud at the well's edge, its broken edge dark.
    const lift = 0.13 * F, low = SIDEWALK_Y * F + 0.25, top = SIDEWALK_Y * F + lift, out = h + 1.5 * F;
    const slab = { color: mix(SIDEWALK, '#ffffff', 0.04) }, base = { color: SIDEWALK }, lip = { color: '#6f6a60' };
    ground.quadCorners([x - h, top, z + h], [x + h, top, z + h], [x + h, low, z + out], [x - h, low, z + out], [0, 1, 0], [slab, slab, base, base], surfaceInk('concrete'));
    ground.quad([x + h, y, z + h], [x - h, y, z + h], [x - h, top, z + h], [x + h, top, z + h], [0, 0, -1], lip, NO_INK);
    const end = random(k + 600) < 0.5 ? -1 : 1;
    const ex = x + end * h, eo = x + end * out;
    const [za, zb] = end > 0 ? [z + h, z - h] : [z - h, z + h];
    ground.quadCorners([ex, top, za], [ex, top, zb], [eo, low, zb], [eo, low, za], [0, 1, 0], [slab, slab, base, base], surfaceInk('concrete'));
    ground.quad([ex, y, zb], [ex, y, za], [ex, top, za], [ex, top, zb], [-end, 0, 0], lip, NO_INK);
  });
}

/**
 * Black lantern posts along the near kerb every seventy feet, clear of the wells (50, 54): a slim tapered post, a
 * flared collar, a pale glass lantern widening upward, a dark hipped cap and a finial.
 */
function buildLamps({ pipe }: StreetTools) {
  for (const x of [-140, -70, 0, 70, 140]) {
    const at = (y: number): Vec3 => [x, y, -26.5];
    // The post and collar's ends are hidden in the sidewalk and the pieces stacked on them.
    pipe([at(-8), at(-7.4), at(4.6)], [5, 3.6, 2.6], POST_BLACK, 6, false);
    pipe([at(4.6), at(5)], [3, 9], POST_BLACK, 6, false);
    pipe([at(5), at(6.3)], [11, 15], LANTERN_GLASS);
    pipe([at(6.3), at(6.65)], [18, 4]);
    pipe([at(6.65), at(7)], [2, 0.6]);
  }
}

/**
 * Two tall signal poles at the corners (x = -150 and 130), each with a mast arm over the avenue carrying two heads
 * on backplates with their visors, and a walk signal on the pole by the crosswalk. The lenses face up the avenue
 * toward the school.
 */
function buildSignals({ box, pipe }: StreetTools) {
  for (const x of [-150, 130]) {
    const facing = x < 0 ? 1 : -1;
    pipe([[x, -8, -26.5], [x, 14, -26.5], [x, 14, -52]], 4, POST_BLACK, 6);
    for (const z of [-40, -50]) {
      pipe([[x, 14, z], [x, 13.6, z]], 1.2, POST_BLACK, 4);
      box([x - 0.08, 9.9, z - 0.85], [x + 0.08, 13.6, z + 0.85], SIGNAL_HEAD, 'metal');
      box([x - 0.45, 10.2, z - 0.45], [x + 0.45, 13.4, z + 0.45], SIGNAL_HEAD, 'metal');
      SIGNAL_LENS.forEach((lens, i) => {
        const y = 12.85 - i * 1.05, face = x + facing * 0.45;
        box([Math.min(face, face + facing * 0.03), y - 0.35, z - 0.35], [Math.max(face, face + facing * 0.03), y + 0.35, z + 0.35], lens, 'glass');
        box([Math.min(face, face + facing * 0.5), y + 0.35, z - 0.42], [Math.max(face, face + facing * 0.5), y + 0.45, z + 0.42], SIGNAL_HEAD, 'metal');
      });
    }
    // The walk signal, on the pole's street side.
    box([x + facing * 0.15 - 0.6, 1, -27.6], [x + facing * 0.15 + 0.6, 2.6, -27.1], SIGNAL_HEAD, 'metal');
  }
}

/** A billboard on its steel post (87, 01): a frame carrying two plain muted colour blocks, the catwalk along its foot with a rail, and lamp arms over its top. `facing` is the side the face looks toward. */
function billboard({ box, pipe }: StreetTools, x: number, z: number, top: number, width: number, height: number, facing: '+z' | '+x' | '-x', blocks: [string, string]) {
  const bottom = top - height, half = width / 2;
  // The face's plane, along x (facing +z) or along z (facing ±x); `at` maps (u along the face, y, depth out of it).
  const at = (u: number, y: number, depth: number): Vec3 =>
    facing === '+z' ? [x + u, y, z + depth] : [x + (facing === '+x' ? depth : -depth), y, z + u];
  const slab = (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, color: string, surface: SurfaceKind = 'metal') => {
    const a = at(u0, y0, d0), b = at(u1, y1, d1);
    box([Math.min(a[0], b[0]), y0, Math.min(a[2], b[2])], [Math.max(a[0], b[0]), y1, Math.max(a[2], b[2])], color, surface);
  };
  pipe([at(0, -8, -1.5), at(0, bottom, -1.5)], 9, STEEL, 6);
  // The face, the two blocks split unevenly, then the back frame behind them (in that order, so the depth test
  // spares the frame's hidden pixels).
  const split = -half + width * 0.62;
  slab(-half, split, bottom, top, -0.4, -0.2, blocks[0]);
  slab(split, half, bottom, top, -0.4, -0.2, blocks[1]);
  slab(-half - 0.3, half + 0.3, bottom - 0.3, top + 0.3, -1, -0.4, STEEL);
  // The catwalk and its rail.
  slab(-half, half, bottom - 1.2, bottom - 1, -0.4, 2.2, STEEL);
  // (Seen from across the avenue at the nearest: four-sided and open-ended.)
  pipe([at(-half, bottom + 2.2, 2.1), at(half, bottom + 2.2, 2.1)], 1.2, STEEL, 4, false);
  for (let u = -half; u <= half + 0.01; u += width / 4) pipe([at(u, bottom - 1, 2.1), at(u, bottom + 2.2, 2.1)], 1, STEEL, 4, false);
  // Lamp arms over the top edge.
  for (const u of [-half / 2, 0, half / 2]) pipe([at(u, top + 0.3, -0.6), at(u, top + 1.4, 1.6)], 1.4, STEEL, 4, false);
}

/**
 * One face of a block with a band of dark windows per floor, drawn in the face's own plane: rows of stucco between
 * the bands, and each band glass with a two-foot stucco margin at both ends. (Bands laid over a whole face would
 * shade the same pixels twice.) `face` names the face; `from` is the first band's height above the foot.
 */
function bandedFace({ props }: StreetTools, min: Vec3, max: Vec3, color: string, face: '+z' | '+x' | '-x', floor: number, from = 3) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  // Each face as Bake.box draws it: its ink id, normal, and the point at (u along the face, y), u running the way
  // box's corners do so the winding matches.
  const { id, n, at, u0, u1 } = face === '+z'
    ? { id: 2, n: [0, 0, 1] as Vec3, at: (u: number, y: number): Vec3 => [u, y, z1], u0: x0, u1: x1 }
    : face === '+x'
      ? { id: 5, n: [1, 0, 0] as Vec3, at: (u: number, y: number): Vec3 => [x1, y, u], u0: z1, u1: z0 }
      : { id: 4, n: [-1, 0, 0] as Vec3, at: (u: number, y: number): Vec3 => [x0, y, u], u0: z0, u1: z1 };
  const rect = (ua: number, ub: number, ya: number, yb: number, paint: string, surface: SurfaceKind) => props.quad(
    ...([at(ua, ya), at(ub, ya), at(ub, yb), at(ua, yb)].map(p => p.map(v => v * F) as Vec3) as [Vec3, Vec3, Vec3, Vec3]),
    n, { color: paint }, { ...surfaceInk(surface), id, priority: id });
  const margin = 2 * Math.sign(u1 - u0);
  let y = y0;
  for (let band = y0 + from; band + 4 < y1 - 2; band += floor) {
    rect(u0, u1, y, band, color, 'stucco');
    rect(u0, u0 + margin, band, band + 4, color, 'stucco');
    rect(u0 + margin, u1 - margin, band, band + 4, WINDOW_BAND, 'glass');
    rect(u1 - margin, u1, band, band + 4, color, 'stucco');
    y = band + 4;
  }
  rect(u0, u1, y, y1, color, 'stucco');
}

/**
 * A plain block with a parapet line and a few rooftop units; `bands` gives the faces with a window band per floor.
 * Its faces turned away from every camera (all stand between the far side and the school, within 150 ft of the
 * stairs along the avenue) are left out with its foot: the far face of a block up or down the avenue, the back of
 * one across it, the back of one behind the school's line.
 */
function block(tools: StreetTools, min: Vec3, max: Vec3, color: string, seed: number, bands: Array<'+z' | '+x' | '-x'> = [], floor = 11) {
  const { box } = tools;
  const [x0, , z0] = min, [x1, y1, z1] = max;
  const letter = { '+z': 'f', '+x': 'e', '-x': 'l' } as const;
  const away = (x1 <= -150 ? 'l' : '') + (x0 >= 150 ? 'e' : '') + (z1 <= -110 ? 'k' : '') + (z1 > 40 ? 'f' : '');
  box(min, max, color, 'stucco', 'tfkle'.split('').filter(f => !bands.some(b => letter[b] === f) && !away.includes(f)).join(''));
  for (const face of bands) bandedFace(tools, min, max, color, face, floor);
  // Rooftop units: two to four boxes set in from the parapet.
  const units = 2 + Math.floor(random(seed) * 3);
  for (let k = 0; k < units; k++) {
    const ux = x0 + 4 + (x1 - x0 - 12) * random(seed + k * 3 + 1), uz = z0 + 4 + (z1 - z0 - 12) * random(seed + k * 3 + 2);
    const w = 4 + 4 * random(seed + k * 3 + 3);
    box([ux, y1, uz], [ux + w, y1 + 3 + 3 * random(seed + k * 3 + 4), uz + w * 0.7], ROOF_UNIT, 'metal', 'tfkle');
  }
}

/** A parked car nosed into a space along z: wheels, body, glasshouse and roof, in feet. */
function parkedCar({ box }: StreetTools, cx: number, z0: number, length: number, color: string) {
  // Each part skips the faces hidden by the part below it or the lot.
  box([cx - 2.7, -7.9, z0 + 1], [cx + 2.7, -7.5, z0 + length - 1], '#2a2c2d', 'metal', 'fkle');
  box([cx - 2.95, -7.5, z0], [cx + 2.95, -5.6, z0 + length], color, 'metal', 'tbfkle');
  box([cx - 2.6, -5.6, z0 + length * 0.28], [cx + 2.6, -4.2, z0 + length * 0.75], CAR_GLASS, 'glass', 'fkle');
  box([cx - 2.45, -4.2, z0 + length * 0.3], [cx + 2.45, -4, z0 + length * 0.73], color, 'metal', 'tfkle');
}

/**
 * Across Highland in 2011 (87, 74, 01, 13): an open parking lot behind a low wall with its space lines and a few
 * dozen parked cars, billboards on steel posts with catwalks carrying plain muted panels (no words or pictures), a
 * plain white four-storey block set back, low single-storey frontages toward both ends, and behind them blocks of
 * varied height with their window bands and rooftop units. Not a row of identical shops.
 */
function buildFarSide(tools: StreetTools) {
  const { flat, box, props } = tools;
  // The lot's surface, its low front wall and its parking-space lines, and cars in about two spaces in three.
  // (Across the avenue, nothing here is seen from behind or below.)
  box([-135, -8, -180], [100, -7.9, -119], LOT_ASPHALT, 'asphalt', 'tfle');
  box([-135, -8, -120], [100, -5.5, -119], LOT_WALL, 'concrete', 'tfle');
  for (let x = -120; x < 90; x += 9) flat(props, x * F, x * F + 2, -162 * F, -144 * F, -7.89 * F, LANE_WHITE);
  for (let x = -120, k = 0; x < 81; x += 9, k++) {
    if (random(k + 4000) < 0.68) parkedCar(tools, x + 4.6, -161 + 1.5 * random(k + 4100), 14 + 2 * random(k + 4200), CAR_COLOURS[Math.floor(random(k + 4300) * CAR_COLOURS.length)]);
  }
  // Two billboards over the lot, facing the school.
  billboard(tools, -90, -132, 30, 28, 11, '+z', BILLBOARD_BLOCKS[0]);
  billboard(tools, 55, -146, 33, 26, 11, '+z', BILLBOARD_BLOCKS[1]);
  // The white block set back behind the lot.
  block(tools, [-90, -8, -230], [-30, 36, -190], WHITE_BLOCK, 4400, ['+z']);
  // Low frontages toward both ends of the block.
  for (const [start, end] of [[-240, -140], [115, 240]]) box([start, -8, -155], [end, 5, -120], LOW_FRONTAGE, 'stucco', 'tfle');
  // Blocks of varied height behind, and two low ones beyond the school at each end.
  const behind: Array<[number, number, number, number, string]> = [
    [-270, -240, 40, 65, DISTANT_BLOCK], [-170, -300, 72, 70, PALE_BLOCK], [-20, -290, 48, 55, WARM_BLOCK], [60, -300, 58, 60, DISTANT_BLOCK],
    [130, -260, 30, 50, WARM_BLOCK], [200, -270, 45, 65, PALE_BLOCK],
  ];
  behind.forEach(([x, z, height, width, color], k) => block(tools, [x, -8, z], [x + width, height, z + 35], color, 4500 + k * 20, ['+z']));
  for (const [x, z, height] of [[-210, 40, 23], [190, 30, 20]]) block(tools, [x, -8, z], [x + 65, height, z + 35], DISTANT_BLOCK, 4700 + x);
}

/**
 * What closes the views straight down each flight and over the sixteen's top (01): low blocks clear of both
 * rollaways, the north gate, the sidewalk and the avenue near the school; then to the north across Highland a
 * billboard on its catwalk and a broad pale mid-rise on a podium, banded with windows; to the south a taller block
 * and a lower one on the school's side.
 */
function buildSkylineClosures(tools: StreetTools) {
  const { box } = tools;
  box([-250, -8, -28], [-230, 18, 100], DISTANT_BLOCK, 'stucco', 'tke');
  box([230, -8, -28], [250, 18, 100], DISTANT_BLOCK, 'stucco', 'tkl');
  block(tools, [-420, -8, -200], [-400, 35, 160], DISTANT_BLOCK, 4800, ['+x']);
  block(tools, [400, -8, -200], [420, 35, 160], DISTANT_BLOCK, 4820, ['-x']);
  // North, over the sixteen's top (01): the avenue runs on north, so what fills the view up the flight stands on the
  // school's side past Hawthorn, near enough to stay out of the haze: a billboard on the low block's roof line, a
  // tall portrait board, a podium and the banded mid-rise behind them; across the avenue a lower block.
  billboard(tools, -330, 20, 58, 30, 13, '+x', BILLBOARD_BLOCKS[2]);
  block(tools, [-520, -8, -6], [-440, 30, 110], WARM_BLOCK, 4840, ['+x']);
  billboard(tools, -470, 80, 74, 18, 26, '+x', BILLBOARD_BLOCKS[0]);
  block(tools, [-680, -8, -6], [-560, 112, 100], PALE_BLOCK, 4860, ['+x'], 10);
  block(tools, [-600, -8, -260], [-520, 58, -150], DISTANT_BLOCK, 4880, ['+x']);
  // South, beyond the sixteen's run-out, likewise what fills the view up the twelve: a billboard and a banded
  // mid-rise on the school's side, a lower block before it, and a taller banded block across Highland.
  block(tools, [560, -8, -330], [680, 72, -150], PALE_BLOCK, 4900, ['-x']);
  billboard(tools, 340, -135, 40, 26, 11, '-x', BILLBOARD_BLOCKS[3]);
  billboard(tools, 330, 30, 56, 28, 12, '-x', BILLBOARD_BLOCKS[1]);
  block(tools, [440, -8, 20], [520, 38, 140], WARM_BLOCK, 4920, ['-x']);
  block(tools, [560, -8, -6], [680, 104, 110], DISTANT_BLOCK, 4940, ['-x'], 10);
}

/** A level irregular blot on the asphalt: an oil drip, a damp patch. */
function blot(bake: Baker, x: number, z: number, y: number, r: number, color: string, seed: number, sides = 9) {
  const at = (i: number): Vec3 => {
    const k = r * (0.7 + 0.4 * random(seed * 13 + (i % sides)));
    return [x + Math.cos(i * Math.PI * 2 / sides) * k, y, z + Math.sin(i * Math.PI * 2 / sides) * k * 0.7];
  };
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i + 1), at(i), [0, 1, 0], { color }, surfaceInk('asphalt'));
}

const random = (seed: number) => { const a = Math.sin(seed * 71.37 + 19.13) * 43758.5453; return a - Math.floor(a); };

/** Two hex paints mixed, `t` of the way from `a` to `b`. */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** A shallow shrub bed in the corner by the street fence north of the twelve, outside its lane: a kerbed bed and a low mass of leaves. */
function buildNorthShrubBed({ props, box }: StreetTools) {
  box([-145, -8, -8.5], [-136, -7.5, -6.5], SHRUB_BED);
  // Five low clipped shrubs in a row, each a mound of its own height and green.
  for (let k = 0; k < 5; k++) {
    const x = -144 + k * 1.8 + 0.3 * random(k + 4950), h = 1.2 + 0.6 * random(k + 4960);
    const green = ['#3a5230', '#445c36', '#36492b'][k % 3];
    props.frustum(x * F, -7.5 * F, -7.5 * F, (-7.5 + h * 0.55) * F, 0.95 * F, 1.05 * F, { color: green }, surfaceInk('soil'));
    props.frustum(x * F, -7.5 * F, (-7.5 + h * 0.55) * F, (-7.5 + h) * F, 1.05 * F, 0.45 * F, { color: green }, surfaceInk('soil'));
  }
}

/** Crosswalk paint where Hawthorn (x = -170) and Selma (x = 120) meet Highland, on the road only: the school's sidewalk stays whole. */
function buildCrossStreetPaint({ decals, flat }: StreetTools) {
  for (const x of [-170, 120]) {
    for (let z = -105; z < -30; z += 7) flat(decals, x * F, (x + 9) * F, z * F, (z + 2) * F, HOLLYWOOD_ROAD_Y + 0.09, LANE_WHITE);
  }
}
