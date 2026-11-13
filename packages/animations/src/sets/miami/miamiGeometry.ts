import type { BufferGeometry } from 'three';
import type { Vec3 } from '../../camera/view';
import { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import type { Canopy, ContactLine } from '../surfaces';
import { buildBay, buildBoulevard, buildParking, buildSkyline } from './miamiBuildings';
import {
  CONCRETE, F, GRASS, LEAVES, SOIL, UP, level, mixHex, normalOf, part, poly, tag, toneWall, upward, valueNoise,
  type Plan, type RailShadow, type ShadowBox,
} from './miamiKit';
import {
  MIAMI_LAWN_Y, MIAMI_PEDESTAL_HALF, MIAMI_PEDESTAL_X0, MIAMI_PEDESTAL_X1,
  MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y, MIAMI_RIM_CURVE, MIAMI_RIM_HEIGHT, MIAMI_RIM_WIDTH, MIAMI_SLAB_APEX_X, MIAMI_SLAB_APEX_Y, MIAMI_SLAB_GRADE,
  MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, MIAMI_SLAB_SIDE, MIAMI_SLAB_THICK, MIAMI_TERRACE_BACK,
  MIAMI_TERRACE_HALF, MIAMI_TERRACE_SHOULDER, MIAMI_WALL_THICK, MIAMI_WALL_TOP, MIAMI_WALL_X,
  miamiLawn, miamiRim, miamiSlabHalf, miamiSlabTop, miamiTerraceHalf,
} from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';
import { MIAMI_POTS, buildPark } from './miamiPark';
import { hedge, mulchRing, palm, palmCrown, shrubMound, type PalmKind } from './miamiTrees';
import { bankSideTone, bankTone, buildMiamiWear, paverTone, plazaReach, wallTone } from './miamiWear';

export { MIAMI_BOULEVARD, MIAMI_SOUTHBOUND, miamiBoulevard, miamiParkingStall } from './miamiBuildings';

/**
 * Triangle Bank's park under the realistic look: a pointed deck with a rectangular rear, a plain cast-concrete
 * bank, garden seating, and a generic bay-front park round them (pavers, planters, palms, lights, benches), the
 * boulevard, the bay and downtown beyond. No memorial art, inscriptions or tower. Riding surfaces stay in
 * `ground`, matched to miamiSurface; their wear is on `decals`, and decorative detail is baked into `props`.
 */

const PLAZA = MIAMI_PLAZA_Y;
const H = MIAMI_PLAZA_HALF;
const TERRACE_HALF = MIAMI_TERRACE_HALF;
const BACK = MIAMI_TERRACE_BACK;
const FAR = 2400 * F;
/** Faces meant to read as flush stand this far apart, so they never z-fight (see leapOfFaith3d.ts). */
const STAND_OFF = 1;
const PAVERS = tag('pavers');
/** Each obstacle outlined as its own part: the deck, its rim, the planter walls, the bank and its pedestal. */
const TERRACE_INK = part(30, 'concrete', 3, 0.15);
const RIM_INK = part(36, 'concrete', 3, 0.15);
const WALL_INK = part(40, 'concrete', 3, 0.14);
const SLAB_INK = part(50, 'concrete', 6, 0.15);
const PEDESTAL_INK = part(56, 'concrete', 5, 0.14);
const PLANTER_INK = part(80, 'concrete', 2, 0.12);

export interface MiamiBuilt {
  ground: BufferGeometry;
  props: BufferGeometry;
  decals: BufferGeometry;
  railSegments: RailShadow[];
  shadowBoxes: ShadowBox[];
  contacts: ContactLine[];
  canopies: Canopy[];
}

/** A form joint in a board-formed wall: a shade darker than the paint either side, dirt held in it. */
const formJoint = (c: string) => mixHex(c, PAINT.wallGrime, 0.3);

/** The palms planted in this bake, for their shade (miamiTrees.ts's miamiCanopies). */
type Planted = Canopy[];

export function buildMiamiGeometry(): MiamiBuilt {
  const ground = new Bake();
  const props = new Bake();
  const decals = new Bake();
  const railSegments: RailShadow[] = [];
  const shadowBoxes: ShadowBox[] = [];
  const palms: Planted = [];
  const plant = (at: Vec3, height: number, kind: PalmKind, seed: number, shade = false) => {
    palm(props, at, height, kind, seed);
    if (shade) palms.push(palmCrown(at, height, kind));
  };
  buildParkFloor(ground, props, plant);
  buildPlaza(ground, props);
  buildLawns(ground, props, plant);
  buildTerrace(ground, shadowBoxes);
  buildSlab(ground, props, shadowBoxes);
  buildPark(props, railSegments, shadowBoxes);
  // Coconut palms on the park's corner by the boulevard, beside the plaza: their trunks and crowns shade it.
  for (let k = 0; k < 3; k++) {
    const at: Vec3 = [(36 + k * 13) * F, PLAZA, (46 - k * 2 + hash2(k, 1, 611) * 4) * F];
    plant(at, (30 + k * 4) * F, 'coconut', k + 140, true);
    railSegments.push({ a: at, b: [at[0], at[1] + (30 + k * 4) * F * 0.9, at[2]], radius: 0.5 * F });
  }
  for (const spot of buildBoulevard(props)) plant(spot.at, spot.height, spot.kind, spot.seed, Math.hypot(spot.at[0], spot.at[2]) < 160 * F);
  buildParking(props);
  buildBay(props);
  buildSkyline(props);
  buildMiamiWear(decals, MIAMI_POTS);
  return {
    ground: ground.geometry(), props: props.geometry(), decals: decals.geometry(),
    railSegments, shadowBoxes, contacts: miamiContacts(), canopies: palms,
  };
}

/**
 * The park at the plaza's level, everywhere but the plaza itself and the raised lawns: grass, and the walks
 * round the lawns' rectangle. One floor: the pieces tile the plane round the plaza and the lawns' rectangle.
 */
function buildParkFloor(ground: Bake, props: Bake, plant: (at: Vec3, height: number, kind: PalmKind, seed: number, shade?: boolean) => void) {
  const pieces: Plan[][] = [
    [[-FAR, -FAR], [MIAMI_WALL_X, -FAR], [MIAMI_WALL_X, -H], [-FAR, -H]],
    [[-FAR, H], [MIAMI_WALL_X, H], [MIAMI_WALL_X, FAR], [-FAR, FAR]],
    [[-FAR, -H], [BACK, -H], [BACK, H], [-FAR, H]],
    [[MIAMI_WALL_X, -FAR], [FAR, -FAR], [FAR, 0], [MIAMI_WALL_X + H, 0], [MIAMI_WALL_X, -H]],
    [[MIAMI_WALL_X, H], [MIAMI_WALL_X + H, 0], [FAR, 0], [FAR, FAR], [MIAMI_WALL_X, FAR]],
  ];
  for (const piece of pieces) level(ground, piece, PLAZA, PAINT.grass, GRASS);
  // Pale concrete walks round the lawns' rectangle and behind the deck, their joints every five feet.
  const walk = (x0: number, x1: number, z0: number, z1: number) => {
    level(props, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], PLAZA + STAND_OFF, PAINT.sidewalk, CONCRETE);
    const along = x1 - x0 > z1 - z0;
    const [a0, a1] = along ? [x0, x1] : [z0, z1];
    for (let a = a0 + 5 * F; a < a1 - 1; a += 5 * F) {
      const joint = mixHex(PAINT.sidewalk, '#8f8a7e', 0.45);
      if (along) level(props, [[a - 0.5, z0], [a + 0.5, z0], [a + 0.5, z1], [a - 0.5, z1]], PLAZA + STAND_OFF + 0.4, joint, CONCRETE);
      else level(props, [[x0, a - 0.5], [x1, a - 0.5], [x1, a + 0.5], [x0, a + 0.5]], PLAZA + STAND_OFF + 0.4, joint, CONCRETE);
    }
  };
  walk(BACK - 16 * F, MIAMI_WALL_X, -H - 14 * F, -H);
  walk(BACK - 16 * F, MIAMI_WALL_X, H, H + 14 * F);
  walk(BACK - 16 * F, BACK, -H, H);
  // Palms in the park beyond the walks.
  for (let k = 0; k < 5; k++) {
    const x = BACK - (30 + hash2(k, 1, 301) * 60) * F, z = (-100 + k * 48 + hash2(k, 2, 302) * 14) * F;
    plant([x, PLAZA, z], (24 + hash2(k, 3, 303) * 10) * F, k % 3 === 0 ? 'coconut' : 'date', k + 40);
  }
}

/**
 * The plaza: the right isosceles triangle in front of the wall, paved in square clay pavers (the look's paver
 * surface draws them and their joints), its tone baked into a mesh of strips so damp and bleached drifts can
 * cross it. Its short sides are stepped: a sawtooth of board-formed planters, one per step, coped and planted.
 */
function buildPlaza(ground: Bake, props: Bake) {
  // Strips down the plaza, each split across into the same number of cells, so every edge is shared.
  const rows = 30, cols = 48;
  for (let i = 0; i < rows; i++) {
    const x0 = MIAMI_WALL_X + (H * i) / rows, x1 = MIAMI_WALL_X + (H * (i + 1)) / rows;
    const r0 = plazaReach(x0), r1 = plazaReach(x1);
    for (let j = 0; j < cols; j++) {
      const za0 = -r0 + (2 * r0 * j) / cols, za1 = -r0 + (2 * r0 * (j + 1)) / cols;
      const zc0 = -r1 + (2 * r1 * j) / cols, zc1 = -r1 + (2 * r1 * (j + 1)) / cols;
      const p: Vec3[] = [[x0, PLAZA, za0], [x1, PLAZA, zc0], [x1, PLAZA, zc1], [x0, PLAZA, za1]];
      const paint = p.map(([x, , z]) => ({ color: paverTone(x, z) }));
      if (i === rows - 1) {
        // The last strip closes to the plaza's far corner: triangles, no slivers.
        if (j === 0) for (let k = 0; k < cols; k++) {
          const a: Vec3 = [x0, PLAZA, -r0 + (2 * r0 * k) / cols], c: Vec3 = [x0, PLAZA, -r0 + (2 * r0 * (k + 1)) / cols], d: Vec3 = [x1, PLAZA, 0];
          ground.vertex(a, UP, { color: paverTone(a[0], a[2]) }, PAVERS);
          ground.vertex(c, UP, { color: paverTone(c[0], c[2]) }, PAVERS);
          ground.vertex(d, UP, { color: paverTone(d[0], d[2]) }, PAVERS);
        }
        continue;
      }
      ground.quadCorners(p[0], p[3], p[2], p[1], UP, [paint[0], paint[3], paint[2], paint[1]], PAVERS);
    }
  }
  // The stepped short sides: board-formed planters, one per step, with the paving filling each step out to it.
  const STEP = 10 * F;
  for (const side of [-1, 1]) {
    for (let k = 0; k * STEP < H; k++) {
      const x0 = MIAMI_WALL_X + k * STEP, x1 = Math.min(MIAMI_WALL_X + H, x0 + STEP);
      const edge = plazaReach(x0);
      // The tooth of paving between the diagonal and the step.
      poly(props, [[x0, PLAZA + STAND_OFF, side * edge], [x1, PLAZA + STAND_OFF, side * edge], [x1, PLAZA + STAND_OFF, side * plazaReach(x1)]], UP, paverTone(x0 + STEP / 2, side * edge), PAVERS);
      const z0 = side * edge, z1 = side * (edge + 7 * F);
      const top = PLAZA + 1.5 * F;
      const seed = k * 2 + (side > 0 ? 1 : 0) + 50;
      const tone = (s: number, _t: number, y: number) => wallTone(seed, s, y - PLAZA, 1.5 * F, 0);
      // The face toward the plaza, the step's end, and the far ends.
      toneWall(props, [x0, z0], [x1, z0], PLAZA, top, [0, 0, -side], tone, PLANTER_INK, { step: 2.5 * F, rows: [0, 0.3, 1] });
      toneWall(props, [x1, z0], [x1, z1], PLAZA, top, [1, 0, 0], tone, PLANTER_INK, { step: 3.5 * F, rows: [0, 0.3, 1] });
      toneWall(props, [x0, z0], [x0, z1], PLAZA, top, [-1, 0, 0], tone, PLANTER_INK, { step: 3.5 * F, rows: [0, 1] });
      toneWall(props, [x0, z1], [x1, z1], PLAZA, top, [0, 0, side], tone, PLANTER_INK, { step: STEP, rows: [0, 1] });
      const zs: [number, number] = [Math.min(z0, z1), Math.max(z0, z1)];
      level(props, [[x0 + 0.5 * F, zs[0] + 0.5 * F], [x1 - 0.5 * F, zs[0] + 0.5 * F], [x1 - 0.5 * F, zs[1] - 0.5 * F], [x0 + 0.5 * F, zs[1] - 0.5 * F]], top - 1.5, PAINT.mulch, SOIL);
      // The coping round the top, worn grey along its edge.
      const cope = (plan: Plan[]) => level(props, plan, top, PAINT.coping, PLANTER_INK);
      for (const [x, w] of [[x0, 0.5 * F], [x1 - 0.5 * F, 0.5 * F]] as const) cope([[x, zs[0]], [x + w, zs[0]], [x + w, zs[1]], [x, zs[1]]]);
      for (const z of [zs[0], zs[1] - 0.5 * F]) cope([[x0 + 0.5 * F, z], [x1 - 0.5 * F, z], [x1 - 0.5 * F, z + 0.5 * F], [x0 + 0.5 * F, z + 0.5 * F]]);
      shrubMound(props, [(x0 + x1) / 2, top - 1.5, side * (edge + 3.5 * F)], 3.2 * F, k * 2 + (side > 0 ? 1 : 0), k % 3 === 1 ? PAINT.bloomRed : k % 3 === 2 ? PAINT.bloomPink : null);
    }
  }
}

/**
 * The lawns either side of the deck, mounding up from the planter walls that ring them, with hedges along the
 * deck, flowering shrubs, a curved bed on each side, and date palms. The mesh follows the deck's faces exactly,
 * so the lawn meets each one along a clean edge. The strip in front of the tip is trodden bare.
 */
function buildLawns(ground: Bake, props: Bake, plant: (at: Vec3, height: number, kind: PalmKind, seed: number, shade?: boolean) => void) {
  // Rows break at the tip: behind it the lawn's inner edge is the deck's face; in front of it, the middle of the
  // strip up to the wall.
  const x0 = BACK + MIAMI_WALL_THICK, x1 = MIAMI_WALL_X - MIAMI_WALL_THICK;
  const zEnd = H - MIAMI_WALL_THICK;
  const cols = 18;
  const xs = [...Array.from({ length: 30 }, (_, i) => x0 * (1 - i / 29)), MIAMI_TERRACE_SHOULDER, x1].sort((a, b) => a - b);
  const rows = xs.length - 1;
  const turf = (x: number, z: number) => {
    const n = valueNoise(x / (9 * F) + 4, z / (9 * F) + 2);
    let c = mixHex(PAINT.grass, n > 0.5 ? '#7a9350' : PAINT.grassWorn, Math.abs(n - 0.5) * 1.3);
    // Trodden where skaters wait and walk: in front of the tip and along the planter wall.
    const tip = Math.max(0, 1 - Math.hypot(x / (6 * F), z / (9 * F)));
    const wall = Math.max(0, 1 - (MIAMI_WALL_X - x) / (2.5 * F)) * 0.5;
    c = mixHex(c, PAINT.grassDry, Math.min(0.85, tip * 1.2 + wall * 0.6));
    return c;
  };
  for (const side of [-1, 1]) {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const corner = (a: number, c: number): Vec3 => {
        const x = xs[a];
        const from = Math.max(0, miamiTerraceHalf(Math.min(0, x)));
        const z = side * (from + ((zEnd - from) * c) / cols);
        return [x, miamiLawn(x, z), z];
      };
      const p = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      const up = upward(p[0], p[1], p[2]);
      const c = p.map(([x, , z]) => ({ color: turf(x, z) }));
      // Wound to face up whichever side it's on.
      const n = normalOf(p[0], p[1], p[2]);
      if (n[1] >= 0) ground.quadCorners(p[0], p[1], p[2], p[3], up, [c[0], c[1], c[2], c[3]], GRASS);
      else ground.quadCorners(p[0], p[3], p[2], p[1], up, [c[0], c[3], c[2], c[1]], GRASS);
    }
  }
  // The planter walls round the lawns: the plaza's, the two ends and the back. Board-formed and painted white,
  // their faces' weathering in their own colours; coped in pale concrete.
  const cap = (plan: Plan[]) => level(ground, plan, MIAMI_WALL_TOP, PAINT.coping, WALL_INK);
  const wallFace = (a: Plan, c: Plan, out: Vec3, seed: number, step = 1.5 * F) =>
    toneWall(ground, a, c, PLAZA, MIAMI_WALL_TOP, out, (s, _t, y) => wallTone(seed, s, y - PLAZA, 1.5 * F, 0.05), WALL_INK,
      { step, rows: [0, 0.18, 0.45, 1], joints: Array.from({ length: 30 }, (_, k) => (k + 1) * 5 * F), joint: formJoint });
  cap([[MIAMI_WALL_X - MIAMI_WALL_THICK, -H], [MIAMI_WALL_X, -H], [MIAMI_WALL_X, H], [MIAMI_WALL_X - MIAMI_WALL_THICK, H]]);
  wallFace([MIAMI_WALL_X, -H], [MIAMI_WALL_X, H], [1, 0, 0], 1, 1 * F);
  for (const side of [-1, 1]) {
    const zo = side * H, zi = side * (H - MIAMI_WALL_THICK);
    cap([[BACK, zi], [MIAMI_WALL_X - MIAMI_WALL_THICK, zi], [MIAMI_WALL_X - MIAMI_WALL_THICK, zo], [BACK, zo]]);
    wallFace([BACK, zo], [MIAMI_WALL_X, zo], [0, 0, side], side + 3, 3 * F);
    poly(ground, [[MIAMI_WALL_X, PLAZA, zo], [MIAMI_WALL_X, PLAZA, zo - side * 0.01], [MIAMI_WALL_X, MIAMI_WALL_TOP, zo - side * 0.01], [MIAMI_WALL_X, MIAMI_WALL_TOP, zo]], [1, 0, 0], PAINT.wall, WALL_INK);
    const zt = side * TERRACE_HALF;
    cap([[BACK, zt], [BACK + MIAMI_WALL_THICK, zt], [BACK + MIAMI_WALL_THICK, zi], [BACK, zi]]);
    wallFace([BACK, zt], [BACK, zo], [-1, 0, 0], side + 6, 3 * F);
  }

  // Sea-grape hedges along the deck's faces, kept back from the tip, and red and pink flowering shrubs along
  // the inside of the plaza's wall.
  for (const side of [-1, 1]) {
    const along: Plan = [-Math.cos(Math.PI / 6), side * Math.sin(Math.PI / 6)];
    for (let k = 0; k < 9; k++) {
      const x = -(12 + k * 4.2) * F;
      const z = side * (miamiTerraceHalf(x) + 2.6 * F);
      hedge(props, [x, miamiLawn(x, z), z], along, 4.3 * F, 1.7 * F + hash2(k, side, 361) * 0.4 * F, k * 2 + (side > 0 ? 1 : 0));
    }
    for (let k = 0; k < 9; k++) {
      const z = side * (11 + k * 5) * F, x = MIAMI_WALL_X - MIAMI_WALL_THICK - 2.4 * F;
      shrubMound(props, [x, miamiLawn(x, z) - 3, z], 2.6 * F, k + (side > 0 ? 20 : 0), k % 2 === 0 ? PAINT.bloomRed : PAINT.bloomPink);
    }
    // The curved bed: a crescent of flowers with a mound of shrubs inside, edged in mulch.
    const cx = -34 * F, cz = side * 34 * F, r = 13 * F;
    for (let k = 0; k < 22; k++) {
      const a0 = Math.PI * (0.25 + (k / 22) * 1.2), a1 = Math.PI * (0.25 + ((k + 1) / 22) * 1.2);
      const point = (a: number, rr: number): Vec3 => {
        const x = cx + Math.cos(a) * rr, z = cz + side * Math.sin(a) * rr;
        return [x, miamiLawn(x, z) + 0.6, z];
      };
      const flower = k % 4 < 2 ? PAINT.bloomPurple : PAINT.bloomYellow;
      const q = [point(a0, r), point(a1, r), point(a1, r - 2.2 * F), point(a0, r - 2.2 * F)];
      poly(props, q, upward(q[0], q[1], q[2]), flower, LEAVES);
      const m = [point(a0, r - 2.2 * F), point(a1, r - 2.2 * F), point(a1, r - 4 * F), point(a0, r - 4 * F)];
      poly(props, m, upward(m[0], m[1], m[2]), PAINT.mulch, SOIL);
    }
    for (let k = 0; k < 4; k++) {
      const x = cx + (k - 1.5) * 2.4 * F, z = cz - side * 4 * F + side * hash2(k, side, 371) * 3 * F;
      shrubMound(props, [x, miamiLawn(x, z) - 3, z], 3.3 * F, k + 50 + side, k === 2 ? PAINT.bloomRed : null, 1);
    }
    // Canary Island date palms on the mounds, each in a ring of mulch.
    for (const [x, z, h] of [[-22, 44, 22], [-48, 50, 27], [-62, 42, 24]] as const) {
      const px = x * F, pz = side * z * F;
      mulchRing(props, px, pz, 4 * F, miamiLawn);
      plant([px, miamiLawn(px, pz), pz], h * F, 'date', x * 3 + side, true);
    }
  }
}

/** The deck's five edges inset by `d`, at the rim's height there. */
function deckRing(d: number): Vec3[] {
  const half = TERRACE_HALF - d;
  const shoulder = -2 * (d + half * Math.cos(Math.PI / 6));
  const y = miamiRim(d);
  return [[-2 * d, y, 0], [shoulder, y, -half], [BACK + d, y, -half], [BACK + d, y, half], [shoulder, y, half]];
}

/**
 * The rim's white paint at a plan point: peeled back to grey and waxed near the tip, where the box gets its
 * tricks, and clean further back.
 */
function rimTone(x: number, z: number): string {
  const near = Math.max(0, 1 - Math.hypot(x, z) / (14 * F));
  const flakes = valueNoise(x / (1.3 * F) + 5, z / (1.3 * F) + 9);
  let c = mixHex(PAINT.rim, PAINT.wallFresh, 0.5 * valueNoise(x / (8 * F), z / (8 * F)));
  c = mixHex(c, PAINT.rimPeeled, Math.max(0, Math.min(1, (flakes - 0.72 + 0.25 * near) / 0.07)) * 0.8);
  return mixHex(c, PAINT.wax, 0.35 * near * near);
}

/**
 * The deck: its bare concrete field, the rideable rim (each band cut along every edge so its paint can peel near
 * the tip), and its board-formed faces, painted white, peeling near the tip and mildewed where the lawn meets them.
 */
function buildTerrace(ground: Bake, shadows: ShadowBox[]) {
  level(ground, deckRing(MIAMI_RIM_WIDTH).map(([x, , z]) => [x, z] as Plan), 0, PAINT.deck, TERRACE_INK);
  const curve = MIAMI_RIM_WIDTH - MIAMI_RIM_CURVE;
  const insets = [0, curve, ...Array.from({ length: 6 }, (_, k) => curve + (MIAMI_RIM_CURVE * (k + 1)) / 6)];
  for (let k = 1; k < insets.length; k++) {
    const outer = deckRing(insets[k - 1]), inner = deckRing(insets[k]);
    for (let e = 0; e < 5; e++) {
      const [oa, oc, ia, ic] = [outer[e], outer[(e + 1) % 5], inner[e], inner[(e + 1) % 5]];
      const length = Math.hypot(oc[0] - oa[0], oc[2] - oa[2]);
      const pieces = Math.max(1, Math.round(length / (2 * F)));
      const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      for (let i = 0; i < pieces; i++) {
        const q = [lerp(oa, oc, i / pieces), lerp(oa, oc, (i + 1) / pieces), lerp(ia, ic, (i + 1) / pieces), lerp(ia, ic, i / pieces)];
        const up = upward(q[0], q[1], q[2]);
        const c = q.map(([x, , z]) => ({ color: rimTone(x, z) }));
        if (normalOf(q[0], q[1], q[2])[1] >= 0) ground.quadCorners(q[0], q[1], q[2], q[3], up, [c[0], c[1], c[2], c[3]], RIM_INK);
        else ground.quadCorners(q[0], q[3], q[2], q[1], up, [c[0], c[3], c[2], c[1]], RIM_INK);
      }
    }
  }
  const foot = MIAMI_WALL_TOP - 2;
  for (const side of [-1, 1]) {
    const out: Vec3 = [0.5, 0, side * Math.sqrt(3) / 2];
    const face = (s: number) => [-s * Math.cos(Math.PI / 6), side * s * Math.sin(Math.PI / 6)] as Plan;
    // The lawn's height against the face, so the mildew follows it.
    const lawnAt = (s: number) => { const [x, z] = face(s); return miamiLawn(x + out[0] * 0.5 * F, z + out[2] * 0.5 * F); };
    toneWall(ground, [0, 0], [MIAMI_TERRACE_SHOULDER, side * TERRACE_HALF], foot, MIAMI_RIM_HEIGHT, out,
      (s, _t, y) => wallTone(side + 10, s, y - lawnAt(s), MIAMI_RIM_HEIGHT - lawnAt(s), Math.max(0, 1 - s / (12 * F))), TERRACE_INK,
      { step: 1 * F, rows: [0, 0.2, 0.4, 0.6, 0.8, 1], joints: Array.from({ length: 6 }, (_, k) => (k + 1) * 6 * F), joint: formJoint });
    const rear = (s: number) => miamiLawn(MIAMI_TERRACE_SHOULDER - s, side * (TERRACE_HALF + 0.5 * F));
    toneWall(ground, [MIAMI_TERRACE_SHOULDER, side * TERRACE_HALF], [BACK, side * TERRACE_HALF], foot, MIAMI_RIM_HEIGHT, [0, 0, side],
      (s, _t, y) => wallTone(side + 14, s, y - rear(s), MIAMI_RIM_HEIGHT - rear(s), 0), TERRACE_INK, { step: 2.5 * F, rows: [0, 0.3, 0.6, 1] });
  }
  toneWall(ground, [BACK, TERRACE_HALF], [BACK, -TERRACE_HALF], PLAZA, MIAMI_RIM_HEIGHT, [-1, 0, 0],
    (s, _t, y) => wallTone(18, s, y - PLAZA, MIAMI_RIM_HEIGHT - PLAZA, 0), TERRACE_INK, { step: 2.5 * F, rows: [0, 0.15, 0.4, 1] });
  // The deck casts its shadow onto the lawn in steps, from boxes inside it.
  for (const [a, b] of [[-5 * F, -1.5 * F], [-12 * F, -5 * F], [-24 * F, -12 * F]]) {
    const half = miamiTerraceHalf(b);
    shadows.push({ min: [a, MIAMI_WALL_TOP, -half], max: [b, -0.5, half] });
  }
}

/**
 * The bank: a plain cast-concrete triangular plate (its riding face and edges are the spot's, unchanged), on a
 * plain board-formed plinth. Its face is a fan of small triangles so its wear (polish down the middle, wax along
 * the edges, dirt toward the low end) can vary across it; the sides carry their own wax and chips.
 */
function buildSlab(ground: Bake, props: Bake, shadows: ShadowBox[]) {
  const half = MIAMI_SLAB_SIDE / 2;
  const apex: Vec3 = [MIAMI_SLAB_APEX_X, MIAMI_SLAB_APEX_Y, 0];
  const left: Vec3 = [MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, -half];
  const right: Vec3 = [MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, half];
  const nl = Math.hypot(MIAMI_SLAB_GRADE, 1);
  const n: Vec3 = [MIAMI_SLAB_GRADE / nl, 1 / nl, 0];
  const grid = 8;
  const at = (i: number, j: number): Vec3 => {
    const a = i / grid, b = i === 0 ? 0 : j / grid;
    return [apex[0] + (left[0] - apex[0]) * a + (right[0] - left[0]) * b, apex[1] + (left[1] - apex[1]) * a + (right[1] - left[1]) * b, apex[2] + (left[2] - apex[2]) * a + (right[2] - left[2]) * b];
  };
  const tri = (p: Vec3, q: Vec3, r: Vec3) => {
    const facing = normalOf(p, q, r)[1] >= 0;
    const [a, b, c] = facing ? [p, q, r] : [p, r, q];
    for (const v of [a, b, c]) ground.vertex(v, n, { color: bankTone(v[0], v[2]) }, SLAB_INK);
  };
  for (let i = 0; i < grid; i++) for (let j = 0; j <= i; j++) {
    tri(at(i, j), at(i + 1, j), at(i + 1, j + 1));
    if (j < i) tri(at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  const down = (p: Vec3): Vec3 => [p[0], p[1] - MIAMI_SLAB_THICK, p[2]];
  for (const [a, c, waxed] of [[apex, right, true], [right, left, false], [left, apex, true]] as const) {
    const out: Vec3 = [a[2] - c[2], 0, c[0] - a[0]];
    const m = Math.hypot(out[0], out[2]);
    toneWall(ground, [a[0], a[2]], [c[0], c[2]], [down(a)[1], down(c)[1]], [a[1], c[1]], [out[0] / m, 0, out[2] / m],
      (s, t) => bankSideTone(waxed ? 3 : 7, s, t, waxed), SLAB_INK, { step: 0.75 * F, rows: [0, 0.4, 0.75, 1] });
  }
  const under: Vec3 = [-n[0], -n[1], 0];
  poly(ground, [down(apex), down(right), down(left)], under, PAINT.bankUnder, SLAB_INK);
  // The plinth, its top following the plate's underside; in the plate's shade all day, darker toward its foot.
  const u = (x: number) => miamiSlabTop(x) - MIAMI_SLAB_THICK;
  const p0 = MIAMI_PEDESTAL_X0, p1 = MIAMI_PEDESTAL_X1, ph = MIAMI_PEDESTAL_HALF;
  const plinth = (_s: number, t: number) => mixHex(PAINT.pedestal, PAINT.wallGrime, Math.max(0, 0.35 - t) * 1.2);
  toneWall(props, [p0, -ph], [p1, -ph], PLAZA, [u(p0), u(p1)], [0, 0, -1], plinth, PEDESTAL_INK, { step: 1 * F, rows: [0, 0.35, 1] });
  toneWall(props, [p1, ph], [p0, ph], PLAZA, [u(p1), u(p0)], [0, 0, 1], plinth, PEDESTAL_INK, { step: 1 * F, rows: [0, 0.35, 1] });
  toneWall(props, [p1, -ph], [p1, ph], PLAZA, u(p1), [1, 0, 0], plinth, PEDESTAL_INK, { step: 1 * F, rows: [0, 0.35, 1] });
  toneWall(props, [p0, ph], [p0, -ph], PLAZA, u(p0), [-1, 0, 0], plinth, PEDESTAL_INK, { step: 1 * F, rows: [0, 0.35, 1] });
  // Its shadow, cast by boxes stacked under the plate (never around its face).
  const steps = 4;
  for (let k = 0; k < steps; k++) {
    const a = MIAMI_SLAB_APEX_X + (k * (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X)) / steps;
    const b = MIAMI_SLAB_APEX_X + ((k + 1) * (MIAMI_SLAB_LIP_X - MIAMI_SLAB_APEX_X)) / steps;
    const w = miamiSlabHalf((a + b) / 2);
    shadows.push({ min: [a, PLAZA, -w], max: [b, u(b) - 0.5, w] });
  }
}

/**
 * Contact darkening where things meet the ground: the plaza wall's foot, the stepped planters' faces and ends
 * (one line each, repeated down the steps), the plinth's sides, and the deck's faces where the lawn meets them.
 */
function miamiContacts(): ContactLine[] {
  const STEP = 10 * F;
  const lines: ContactLine[] = [{ a: [MIAMI_WALL_X, PLAZA, -H], b: [MIAMI_WALL_X, PLAZA, H], reach: 1.3 * F, strength: 0.3 }];
  for (const side of [-1, 1]) {
    const edge = plazaReach(MIAMI_WALL_X);
    lines.push({ a: [MIAMI_WALL_X, PLAZA, side * edge], b: [MIAMI_WALL_X + STEP, PLAZA, side * edge], reach: 1 * F, strength: 0.28, step: [STEP, 0, -side * STEP], count: 6 });
    lines.push({ a: [MIAMI_WALL_X + STEP, PLAZA, side * plazaReach(MIAMI_WALL_X + STEP)], b: [MIAMI_WALL_X + STEP, PLAZA, side * edge], reach: 0.9 * F, strength: 0.25, step: [STEP, 0, -side * STEP], count: 5 });
    lines.push({ a: [MIAMI_PEDESTAL_X0, PLAZA, side * MIAMI_PEDESTAL_HALF], b: [MIAMI_PEDESTAL_X1, PLAZA, side * MIAMI_PEDESTAL_HALF], reach: 0.8 * F, strength: 0.3 });
    const shoulder = MIAMI_TERRACE_SHOULDER;
    lines.push({ a: [0, MIAMI_WALL_TOP, 0], b: [shoulder, MIAMI_LAWN_Y, side * TERRACE_HALF], reach: 1.1 * F, strength: 0.28 });
  }
  return lines;
}
