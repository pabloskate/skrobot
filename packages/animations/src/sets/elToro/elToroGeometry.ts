import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP, SUN } from '../../three/materials';
import { hash2 } from '../setKit';
import { stairContacts, SURFACE, type Canopy, type ContactLine } from '../surfaces';
import type { WireMesh } from '../wireMesh';
import { buildElToroBuilding, elToroBuildingShade, FENCE_MESH } from './elToroBuilding';
import { buildLowerCampus, campusBox } from './elToroCampus';
import { buildElToroCanopy, elToroCanopyShade, EL_TORO_CANOPY } from './elToroCanopy';
import {
  BUILDING_BACK, CENTER_Z, ET, FAR, FAR_RAIL_Z, HILL_DROP, HILL_EDGE, HILL_RAIL_Z, POSTS,
  RAIL_EXT, RAIL_MID, RAIL_R, RAIL_TOP, RIDER_LANE_Z, WALL_THICK, WALL_Z, hill,
} from './elToroLayout';
import { buildElToroLandscape, type ElToroShrubFoot } from './elToroLandscape';
import { RISER, SET_FOOT as F, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, nosingLine, stairGround } from './stairs';

/**
 * El Toro's scenery for ClassicSpot3D, in set units: u down the stairs is
 * x, z across, the top landing at height 0. Every surface stands where the
 * physics (stairs.ts) puts it. Ground faces carry their look surface
 * (sets/surfaces.ts) and a hand-painted pass in their vertex colours: each
 * step a tone of its own, noses rubbed paler where the flights are walked,
 * each slab of paving its own pour. The look's stair wear (EL_TORO_LOOK)
 * adds what varies inside a face, per pixel: riser stains, chips, dust and
 * leaves. Joints, cracks and litter lie on the ground as decals. The rails
 * are exactly the old ones.
 */

const tag = (solid: number): Ink => ({ ...NO_INK, solid });
const CONCRETE = tag(SURFACE.concrete);
const GRASS = tag(SURFACE.grass);
const SOIL = tag(SURFACE.soil);

const PROP_INK = 0.18;
const prop = (id: number, priority: number, solid = 0): Ink => ({ id, priority, width: PROP_INK, kind: INK_PROP, solid });

type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };
type Plan = [u: number, z: number];

const up: Vec3 = [0, 1, 0];
const downhill: Vec3 = [1, 0, 0];
const SLOPE = RISER / TREAD;
const SLOPE_N: Vec3 = [SLOPE / Math.hypot(SLOPE, 1), 1 / Math.hypot(SLOPE, 1), 0];
/** Where the embankment leaves the top landing and meets the bottom one. */
const HILL_TOP = -HILL_DROP / SLOPE;
const HILL_FOOT = (STAIR_DROP - HILL_DROP) / SLOPE;
/** The far side of the old wall's footprint: the walk at the top runs on from here to the lockers. */
const WALL_FAR = WALL_Z + WALL_THICK;
/** The locker-side bank's far end, and the canopy-side bank's, with the concrete band between it and the steps. */
const LOCKER_BANK_END = 125 * F;
const CANOPY_BANK_END = -88 * F;
const BAND_Z = -7.3 * F;
/** The lower paving's slabs lie a hair over the landing under them; marks on them a hair over that. */
const SLAB_Y = -9.48 * F;
const DECAL_LIFT = 0.3;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Smooth value noise along one axis, 0-1. */
const drift = (x: number, seed: number) => {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash2(i, 0, seed) * (1 - s) + hash2(i + 1, 0, seed) * s;
};
/** A colour a share lighter (positive) or darker (negative). */
const tint = (color: string, t: number) => (t >= 0 ? mixHex(color, '#ffffff', t) : mixHex(color, '#000000', -t));

/** How walked a line across the stairs is: people and boards keep to the middle of each flight. */
function walked(z: number): number {
  const middle = (c: number, w: number) => Math.exp(-(((z - c) / w) ** 2));
  return Math.max(middle((HILL_EDGE + CENTER_Z) / 2, 4.5 * F), middle(RIDER_LANE_Z, 4.5 * F));
}

/**
 * Each step a tone of its own (poured and patched at different times), drifting gently across it. Small
 * enough that the flight never bands step by step: the photographs show one pale stair, not stripes.
 */
const stepTone = (k: number, z: number) => 0.03 * (hash2(k, 0, 811) - 0.5) + 0.03 * (drift(z / (2.6 * F) + k * 1.7, 812) - 0.5);

/** Tread k (1-19) at `along` from its back (0) to its nose (1). */
function treadPaint(k: number, z: number, along: number): Paint {
  const walk = walked(z);
  let color = tint(ET.tread, stepTone(k, z));
  // The nose rubbed pale by feet and trucks, most where the flights are walked (the look rounds and chips it).
  color = mixHex(color, ET.nosing, smooth(0.8, 1, along) * (0.35 + 0.45 * walk));
  // A little grit at the back, more along the ends where nobody steps.
  const grit = smooth(0.3, 0, along);
  color = mixHex(color, '#a39c86', grit * (0.15 + 0.25 * (1 - walk)));
  return { color, alpha: 1 - 0.08 * grit };
}

/** Riser k (1-20) across the stairs: its tone, and its arris rubbed paler where it's walked. */
function riserPaint(k: number, z: number): Paint {
  return { color: mixHex(tint(ET.riser, stepTone(k, z) - 0.01), ET.nosing, 0.12 * walked(z)) };
}

/** Lines across the stairs where the paint changes: the same at every step, so treads and risers share their edges. */
const STAIR_Z = Array.from({ length: 13 }, (_, i) => HILL_EDGE + ((WALL_Z - HILL_EDGE) * i) / 12);

function stairs(ground: Bake) {
  const P = (u: number, h: number, z: number): Vec3 => [u, h, z];
  // Treads in three bands, back to nose: grit, body, nose. A riser is one band: its stains are the look's.
  const treadRows = [0, 0.3, 0.84, 1];
  for (let k = 1; k <= STAIR_STEPS; k++) {
    const u = (k - 1) * TREAD;
    const top = -(k - 1) * RISER, foot = -k * RISER;
    for (let c = 0; c + 1 < STAIR_Z.length; c++) {
      const [z0, z1] = [STAIR_Z[c], STAIR_Z[c + 1]];
      ground.quadCorners(P(u, top, z0), P(u, foot, z0), P(u, foot, z1), P(u, top, z1), downhill,
        [riserPaint(k, z0), riserPaint(k, z0), riserPaint(k, z1), riserPaint(k, z1)], CONCRETE);
      if (k === STAIR_STEPS) continue;
      for (let r = 0; r + 1 < treadRows.length; r++) {
        const [a0, a1] = [treadRows[r], treadRows[r + 1]];
        ground.quadCorners(P(u + a0 * TREAD, foot, z0), P(u + a1 * TREAD, foot, z0), P(u + a1 * TREAD, foot, z1), P(u + a0 * TREAD, foot, z1), up,
          [treadPaint(k, z0, a0), treadPaint(k, z0, a1), treadPaint(k, z1, a1), treadPaint(k, z1, a0)], CONCRETE);
      }
    }
  }
  // The steps' ends standing out of the bank on both flanks: from where the hill crosses each tread out to its
  // nosing. The look dirties their feet.
  for (let k = 0; k < STAIR_STEPS; k++) {
    const h = -k * RISER;
    const end = k * TREAD;
    for (const [z, n] of [[HILL_EDGE, -1], [WALL_Z, 1]] as const) {
      ground.triangle(P(end - HILL_DROP / SLOPE, h, z), P(end, h, z), P(end, h - HILL_DROP, z), [0, 0, n],
        { color: tint(ET.riser, stepTone(k + 1, z) - 0.03) }, CONCRETE);
    }
  }
}

/** The ground at the top: the run-up walk and its surroundings, the lower landing's base, the lawns either side. */
function landings(ground: Bake) {
  const P = (u: number, h: number, z: number): Vec3 => [u, h, z];
  const strip = (u0: number, u1: number, z0: number, z1: number, h0: number, h1: number, n: Vec3, color: string, ink: Ink) =>
    ground.quad(P(u0, h0, z0), P(u1, h1, z0), P(u1, h1, z1), P(u0, h0, z1), n, { color }, ink);
  // The top landing up to the lip, in the stairs' own columns so the lip has no T-junctions; its last foot and
  // a half paler where the nose is worn round.
  const lip = -1.5 * F;
  for (let c = 0; c + 1 < STAIR_Z.length; c++) {
    const [z0, z1] = [STAIR_Z[c], STAIR_Z[c + 1]];
    const worn = (z: number) => mixHex(ET.walk, ET.nosing, 0.25 + 0.3 * walked(z));
    strip(-FAR, lip, z0, z1, 0, 0, up, ET.walk, CONCRETE);
    ground.quadCorners(P(lip, 0, z0), P(0, 0, z0), P(0, 0, z1), P(lip, 0, z1), up,
      [{ color: ET.walk }, { color: worn(z0) }, { color: worn(z1) }, { color: ET.walk }], CONCRETE);
  }
  strip(-FAR, 0, WALL_Z, WALL_FAR, 0, 0, up, ET.walk, CONCRETE);
  strip(-FAR, HILL_TOP, HILL_EDGE - 90, HILL_EDGE, 0, 0, up, ET.walk, CONCRETE);
  // The open canopy stands on the school walkway above the planted bank.
  const apronU = EL_TORO_CANOPY.u0 - 60;
  const apronZ = EL_TORO_CANOPY.z0 - 60;
  strip(-FAR, apronU, -FAR, HILL_EDGE - 90, 0, 0, up, ET.grass, GRASS);
  strip(apronU, HILL_TOP, -FAR, apronZ, 0, 0, up, ET.grass, GRASS);
  strip(apronU, HILL_TOP, apronZ, HILL_EDGE - 90, 0, 0, up, ET.walk, CONCRETE);
  strip(-FAR, HILL_TOP, WALL_FAR, BUILDING_BACK + 45, 0, 0, up, ET.walk, CONCRETE);
  strip(-FAR, HILL_TOP, BUILDING_BACK + 45, FAR, 0, 0, up, ET.grass, GRASS);
  strip(STAIR_RUN, FAR, HILL_EDGE, WALL_FAR, -STAIR_DROP, -STAIR_DROP, up, ET.paving, CONCRETE);
  strip(HILL_FOOT, FAR, -FAR, HILL_EDGE, -STAIR_DROP, -STAIR_DROP, up, ET.paving, CONCRETE);
  strip(HILL_FOOT, FAR, WALL_FAR, FAR, -STAIR_DROP, -STAIR_DROP, up, ET.paving, CONCRETE);
  // The canopy's floor slab, flush with the walk it stands on and painted as it is.
  campusBox(ground, [-114, -0.3, -88], [0.5, 0, -8.1], ET.walk, SURFACE.concrete);
}

/** Two exposed stair flanks: the dirt bank at +z, the sixteen-inch concrete band at -z, the planted bank beyond it. */
function embankment(ground: Bake) {
  const strip = (u0: number, u1: number, z0: number, z1: number, color: string, ink: Ink) =>
    ground.quad([u0, hill(u0), z0], [u1, hill(u1), z0], [u1, hill(u1), z1], [u0, hill(u0), z1], SLOPE_N, { color }, ink);
  strip(HILL_TOP, HILL_FOOT, WALL_Z, LOCKER_BANK_END, ET.dirt, SOIL);
  strip(HILL_TOP, HILL_FOOT, LOCKER_BANK_END, FAR, ET.grass, GRASS);
  // The band lies at the steps' inner-corner line, with a two-foot level return at the top and the bottom.
  strip(HILL_TOP, HILL_FOOT, BAND_Z, HILL_EDGE, ET.band, CONCRETE);
  strip(-2 * F, HILL_TOP, BAND_Z, HILL_EDGE, ET.band, CONCRETE);
  strip(HILL_FOOT, 22 * F, BAND_Z, HILL_EDGE, ET.band, CONCRETE);
  // The canopy bank: hedges in mulched dirt over its upper part, grass running out onto the lawn below.
  strip(HILL_TOP, 15 * F, CANOPY_BANK_END, BAND_Z, mixHex(ET.dirt, '#6a5440', 0.35), SOIL);
  strip(15 * F, HILL_FOOT, CANOPY_BANK_END, BAND_Z, ET.grass, GRASS);
  strip(HILL_TOP, HILL_FOOT, -FAR, CANOPY_BANK_END, ET.grass, GRASS);
  // The small raised curb at the band's top corner.
  campusBox(ground, [-2, 0, -7.3], [0, 1, -6.3], ET.band, SURFACE.concrete);
}

/** Handrails: galvanized pipe, posts standing on the steps. Exactly the old set's, segment for segment. */
function handrails(props: Bake, rails: Segment[]) {
  const P = (u: number, h: number, z: number): Vec3 => [u, h, z];
  const pipe: Paint = { color: ET.rail, lit: { color: ET.railLit, from: 0.15, to: 2 } };
  const tube = (pts: Array<[number, number]>, z: number, ink: Ink) => {
    const spine = pts.map(([u, h]) => P(u, h, z));
    props.tube(spine, spine.map(() => RAIL_R), pipe, ink, 10, false);
    for (let i = 0; i + 1 < spine.length; i++) rails.push({ a: spine[i], b: spine[i + 1], radius: RAIL_R });
  };
  const post = (u: number, from: number, to: number, z: number, ink: Ink) => {
    const a = P(u, from, z);
    const b = P(u, to, z);
    props.tube([a, b], [RAIL_R, RAIL_R], pipe, ink, 10, true);
    // Embedded posts have a weathered footing collar, with small anchor heads.
    props.tube([P(u, from + 0.2, z), P(u, from + 1.1, z)], [5.1, 4.7], { color: '#747b71' }, ink, 12, true);
    for (const du of [-3.5, 3.5]) {
      props.tube([P(u + du, from + 1, z), P(u + du, from + 1.6, z)], [0.8, 0.8], { color: '#a4a698' }, ink, 6, true);
    }
    // A narrow weld at the upper joint catches a different highlight from the pipe.
    props.tube([P(u, to - 4, z), P(u, to - 2.8, z)], [RAIL_R + 0.35, RAIL_R + 0.35], { color: '#838b82' }, ink, 10, true);
    rails.push({ a, b, radius: RAIL_R });
  };
  /** Classic rails: one straight sloping top bar and a mid bar, with no end kinks. */
  const straightRail = (z: number, ink: Ink) => {
    const start = -RAIL_EXT;
    const end = STAIR_RUN + RAIL_EXT;
    for (const height of [RAIL_TOP, RAIL_MID]) {
      tube([[start, nosingLine(start) + height], [end, nosingLine(end) + height]], z, ink);
    }
    post(start, 0, nosingLine(start) + RAIL_TOP, z, ink);
    post(end, -STAIR_DROP, nosingLine(end) + RAIL_TOP, z, ink);
    for (const u of POSTS) post(u, stairGround(u), nosingLine(u) + RAIL_TOP, z, ink);
  };
  straightRail(HILL_RAIL_Z, prop(60, 10));
  straightRail(CENTER_Z, prop(62, 11));
  straightRail(FAR_RAIL_Z, prop(66, 13));
}

// ----- The lower paving: slabs of their own pours, joints between them, cracks, litter -----

/** A slab's paint: its pour's base colour, a few percent lighter or darker than its neighbours. */
const pour = (base: string, u: number, z: number, salt: number) => tint(base, 0.06 * (hash2(Math.round(u), Math.round(z), salt) - 0.5));

/**
 * A run of paving in slabs (feet): each slab a quad of its own paint, and a tooled joint down every seam, drawn
 * as a decal fading into the slab paint either side. `paint` gives a slab's colour from its corner.
 */
function slabs(ground: Bake, decals: Bake, u0: number, u1: number, z0: number, z1: number, du: number, dz: number, y: number, paint: (u: number, z: number) => string) {
  const us: number[] = [], zs: number[] = [];
  for (let u = u0; u < u1 - 0.5; u += du) us.push(u);
  us.push(u1);
  for (let z = z0; z < z1 - 0.5; z += dz) zs.push(z);
  zs.push(z1);
  const color = (i: number, j: number) => paint(us[Math.min(i, us.length - 2)], zs[Math.min(j, zs.length - 2)]);
  const at = (u: number, z: number): Vec3 => [u * F, y, z * F];
  for (let i = 0; i + 1 < us.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      ground.quad(at(us[i], zs[j]), at(us[i + 1], zs[j]), at(us[i + 1], zs[j + 1]), at(us[i], zs[j + 1]), up, { color: color(i, j) }, CONCRETE);
    }
  }
  // Joints across the run (constant u) and along it (constant z), one segment per slab edge.
  for (let i = 1; i + 1 < us.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) joint(decals, [us[i], zs[j]], [us[i], zs[j + 1]], y, color(i, j), color(i - 1, j));
  }
  for (let j = 1; j + 1 < zs.length; j++) {
    for (let i = 0; i + 1 < us.length; i++) joint(decals, [us[i], zs[j]], [us[i + 1], zs[j]], y, color(i, j - 1), color(i, j));
  }
}

/**
 * A tooled joint from a to b (feet) at height y: a fine dark groove with dirt either side, fading at its edges
 * into the paint of the slab on each side, so no seam shows where it ends.
 */
function joint(decals: Bake, a: Plan, b: Plan, y: number, left: string, right: string, core = 0.035, fringe = 0.09) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const across: Plan = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  const at = (q: Plan, off: number): Vec3 => [(q[0] + across[0] * off) * F, y + DECAL_LIFT, (q[1] + across[1] * off) * F];
  const rows = [-core - fringe, -core, 0, core, core + fringe];
  const paints = [left, mixHex(left, '#8f8a78', 0.5), '#6c675a', mixHex(right, '#8f8a78', 0.5), right];
  for (let k = 0; k < 4; k++) {
    decals.quadCorners(at(a, rows[k]), at(b, rows[k]), at(b, rows[k + 1]), at(a, rows[k + 1]), up,
      [{ color: paints[k] }, { color: paints[k] }, { color: paints[k + 1] }, { color: paints[k + 1] }], CONCRETE);
  }
}

/** A thin crack drawn flat on paving (points in feet): dark down its middle, dirty either side, fading into `under`. */
function crack(decals: Bake, pts: Plan[], y: number, under: string) {
  const core = 0.012, fringe = 0.05;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const across: Plan = [-(c[1] - a[1]) / l, (c[0] - a[0]) / l];
    const at = (q: Plan, off: number): Vec3 => [(q[0] + across[0] * off) * F, y + DECAL_LIFT, (q[1] + across[1] * off) * F];
    const rows = [-core - fringe, -core, 0, core, core + fringe];
    const paints = [under, mixHex(under, '#8a8574', 0.55), '#6a6558', mixHex(under, '#8a8574', 0.55), under];
    for (let k = 0; k < 4; k++) {
      decals.quadCorners(at(a, rows[k]), at(c, rows[k]), at(c, rows[k + 1]), at(a, rows[k + 1]), up,
        [{ color: paints[k] }, { color: paints[k] }, { color: paints[k + 1] }, { color: paints[k + 1] }], CONCRETE);
    }
  }
}

/** A wandering crack from a to b (feet), jittered so no two read alike. */
function crackPath(a: Plan, b: Plan, steps: number, wander: number, seed: number): Plan[] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Plan = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const off = i === 0 || i === steps ? 0 : (hash2(i, seed, 831) - 0.5) * 2 * wander;
    return [a[0] + (b[0] - a[0]) * t + n[0] * off, a[1] + (b[1] - a[1]) * t + n[1] * off] as Plan;
  });
}

/** The landing apron's slabs (feet), so its joints, cracks and stains can find the paint under them. */
const APRON = { u0: 20, u1: 48, z0: -6, z1: 40, du: 10, dz: 11.5 } as const;
/** The replaced slab, a darker newer pour beside the landing line (refs/07). */
const REPLACED: Plan = [30, 17];
const apronPaint = (u: number, z: number) =>
  u === REPLACED[0] && z === REPLACED[1] ? mixHex(ET.landing, '#a7a192', 0.45) : pour(ET.landing, u, z, 851);
const pavingPaint = (u: number, z: number) => pour(ET.paving, u, z, 852);

/**
 * The paving at the foot of the stairs (refs/07, 51): the pale apron in ten- and eleven-foot slabs with one
 * darker replaced slab, the walk along the bank foot, and the older, darker rollaway paving beyond, each with
 * its joints; then the lawn strip and sidewalk on the canopy side.
 */
function paving(ground: Bake, decals: Bake) {
  slabs(ground, decals, APRON.u0, APRON.u1, APRON.z0, APRON.z1, APRON.du, APRON.dz, SLAB_Y, apronPaint);
  slabs(ground, decals, 22, 42, 40, 125, 10, 10.6, SLAB_Y, (u, z) => pour(ET.landing, u, z, 853));
  slabs(ground, decals, 48, 150, -10, 29, 12, 13, SLAB_Y, pavingPaint);
  const flat = (u0: number, u1: number, z0: number, z1: number, color: string, ink: Ink) =>
    ground.quad([u0 * F, SLAB_Y, z0 * F], [u1 * F, SLAB_Y, z0 * F], [u1 * F, SLAB_Y, z1 * F], [u0 * F, SLAB_Y, z1 * F], up, { color }, ink);
  flat(20, 34, -88, -6, ET.grass, GRASS);
  slabs(ground, decals, 34, 42, -88, -10, 8, 6, SLAB_Y, (u, z) => pour('#c7bda4', u, z, 854));
}

/**
 * Wear on the walks: settlement cracks on the apron and the old paving and before the lip, stains where water
 * stands and dirt washes off the bank, and dry leaves blown against the bank's foot and the lawn's edge.
 */
function weathering(decals: Bake) {
  const apron = (u: number, z: number) => apronPaint(APRON.u0 + Math.floor((u - APRON.u0) / APRON.du) * APRON.du, APRON.z0 + Math.floor((z - APRON.z0) / APRON.dz) * APRON.dz);
  const old = (u: number, z: number) => pavingPaint(48 + Math.floor((u - 48) / 12) * 12, -10 + Math.floor((z + 10) / 13) * 13);
  // Cracks run from a joint or an edge and stop in the slab, each in one slab so its paint matches.
  for (const [a, b, steps, wander, seed] of [
    [[23, -5.2], [29, 0.6], 9, 0.45, 1], [[34.5, 28.8], [39.4, 22.6], 8, 0.35, 2], [[40.2, 5.6], [47.6, 9.2], 9, 0.4, 5],
  ] as Array<[Plan, Plan, number, number, number]>) crack(decals, crackPath(a, b, steps, wander, seed), SLAB_Y, apron(a[0], a[1]));
  for (const [a, b, steps, wander, seed] of [
    [[61, -9.6], [66.5, -3.4], 8, 0.4, 6], [[85.5, 3.2], [95.6, 6.6], 10, 0.5, 7], [[109, 16.2], [113.8, 25.4], 9, 0.4, 8],
  ] as Array<[Plan, Plan, number, number, number]>) crack(decals, crackPath(a, b, steps, wander, seed), SLAB_Y, old(a[0], a[1]));
  crack(decals, crackPath([-9, -5.5], [-4, -1.5], 6, 0.35, 3), 0, ET.walk);
  crack(decals, crackPath([-26, 17.8], [-19, 14], 7, 0.4, 4), 0, ET.walk);
  // Soft stains: water standing in a low corner of a slab, a wet fan where the bank drains onto the walk.
  const stain = (cu: number, cz: number, ru: number, rz: number, depth: number, under: (u: number, z: number) => string, y: number, seed: number) => {
    const segments = 14;
    const ring = (a: number, k: number): Vec3 => {
      const wob = 0.75 + 0.45 * hash2(Math.round(a * 10), seed, 861);
      return [(cu + Math.cos(a) * ru * k * wob) * F, y + DECAL_LIFT, (cz + Math.sin(a) * rz * k * wob) * F];
    };
    const centre: Vec3 = [cu * F, y + DECAL_LIFT, cz * F];
    const base = under(cu, cz), dark = mixHex(base, '#77725f', depth);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * 2 * Math.PI, a1 = ((i + 1) / segments) * 2 * Math.PI;
      decals.triangle(centre, ring(a1, 0.5), ring(a0, 0.5), up, { color: dark }, CONCRETE);
      decals.quadCorners(ring(a0, 0.5), ring(a1, 0.5), ring(a1, 1), ring(a0, 1), up,
        [{ color: dark }, { color: dark }, { color: base }, { color: base }], CONCRETE);
    }
  };
  stain(26.5, 34.5, 2.6, 2.2, 0.28, apron, SLAB_Y, 1);
  stain(44.2, -2.8, 1.8, 2.6, 0.22, apron, SLAB_Y, 2);
  stain(57.5, 22.5, 3.2, 2.4, 0.25, old, SLAB_Y, 3);
  stain(102, -6.5, 2.4, 3.4, 0.2, old, SLAB_Y, 4);
  // Dirt washed off the locker bank onto the walk along its foot: a band fading out from the bank.
  for (let z = 19; z < 39.9; z += 10.5) {
    const z1 = Math.min(z + 10.5, 40);
    const at = (u: number, zz: number): Vec3 => [u * F, SLAB_Y + DECAL_LIFT, zz * F];
    const dirty = (zz: number) => mixHex(apron(20.5, zz), '#9a8a6e', 0.45);
    decals.quadCorners(at(20, z), at(22.4, z), at(22.4, z1), at(20, z1), up,
      [{ color: dirty(z) }, { color: apron(22.4, z) }, { color: apron(22.4, z1) }, { color: dirty(z1) }], CONCRETE);
  }
  // Dry gum and broadleaf leaves blown against the bank's foot and the lawn edge, and a few loose on the walk.
  const leaves = ['#a28d65', '#8e7a57', '#b39f78', '#7d6a4c', '#9b8f6a'];
  for (let k = 0; k < 90; k++) {
    const side = k % 3;
    const u = side === 2 ? 22 + hash2(k, 1, 871) * 20 : 20.2 + Math.pow(hash2(k, 1, 871), 2) * 5;
    const z = side === 0 ? 18.5 + hash2(k, 2, 872) * 21 : side === 1 ? -5.8 + Math.pow(hash2(k, 2, 872), 2) * 3.5 : -4 + hash2(k, 2, 872) * 42;
    const angle = hash2(k, 3, 873) * 2 * Math.PI;
    const length = 0.22 + 0.25 * hash2(k, 4, 874), width = length * (k % 4 === 0 ? 0.45 : 0.2);
    const tip: Plan = [Math.cos(angle) * length / 2, Math.sin(angle) * length / 2];
    const side_: Plan = [-tip[1] / length * width, tip[0] / length * width];
    const at = (du: number, dz: number): Vec3 => [(u + du) * F, SLAB_Y + DECAL_LIFT + 0.05, (z + dz) * F];
    const color = { color: leaves[k % leaves.length] };
    decals.triangle(at(-tip[0], -tip[1]), at(side_[0], side_[1]), at(tip[0], tip[1]), up, color, CONCRETE);
    decals.triangle(at(-tip[0], -tip[1]), at(tip[0], tip[1]), at(-side_[0], -side_[1]), up, color, CONCRETE);
  }
}

/** The run-up walk's joints: across it every ten or eleven feet, and two lines along it either side of the lane. */
function runUpJoints(decals: Bake) {
  for (let u = -2; u > -114; u -= 10.8) joint(decals, [u, -8], [u, 29], 0, ET.walk, ET.walk);
  for (const z of [3.5, 18.5]) {
    for (let u = -114; u < -2; u += 10.8) joint(decals, [u, z], [Math.min(u + 10.8, -2), z], 0, ET.walk, ET.walk);
  }
}

/** The ground's paint under a point off the stairs: what a decal over it is painted to match. */
function groundUnder(u: number, z: number): { color: string; ink: Ink } {
  if (z > WALL_Z) return { color: ET.dirt, ink: SOIL };
  if (u < 15 * F) return { color: mixHex(ET.dirt, '#6a5440', 0.35), ink: SOIL };
  return { color: ET.grass, ink: GRASS };
}
function groundSpan(z: number): [number, number] {
  return z > WALL_Z ? [WALL_Z, LOCKER_BANK_END] : [CANOPY_BANK_END, BAND_Z];
}

/**
 * Shade pooled under each shrub, a little off its foot away from the sun: the ground's own paint, darkened
 * through its alpha (the look's occlusion), so the surface under it carries straight on.
 */
function shrubShade(decals: Bake, feet: readonly ElToroShrubFoot[]) {
  const segments = 14;
  for (const { at, radius } of feet) {
    const [u, , z] = at;
    const { color, ink } = groundUnder(u, z);
    const r = radius * 1.15;
    // Toward where the sun's shadow of the crown falls, a quarter of the way.
    const cu = u - SUN.x / SUN.y * radius * 0.25, cz = z - SUN.z / SUN.y * radius * 0.25;
    // Kept on the surface it starts on (inside the bank, off the band), so its paint matches.
    const [lo, hi] = groundSpan(z);
    // Off the slope, the walks and landings are concrete: stop at its crease.
    const [first, last] = [HILL_TOP + 1, HILL_FOOT - 1];
    const point = (a: number, k: number): Vec3 => {
      const pu = Math.min(last, Math.max(first, cu + Math.cos(a) * r * k)), pz = Math.min(hi, Math.max(lo, cz + Math.sin(a) * r * k));
      return [pu, hill(pu) + 0.35, pz];
    };
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * 2 * Math.PI, a1 = ((i + 1) / segments) * 2 * Math.PI;
      // A deep core under the stems, fading out to nothing at the drip line.
      decals.quadCorners(point(a0, 0.45), point(a0, 1), point(a1, 1), point(a1, 0.45), SLOPE_N,
        [{ color, alpha: 0.7 }, { color }, { color }, { color, alpha: 0.7 }], ink);
      decals.triangle(point(a0, 0), point(a0, 0.45), point(a1, 0.45), SLOPE_N, { color, alpha: 0.58 }, ink);
    }
  }
}

/**
 * Contact shade where faces meet the ground (the look's contact lines, 12 at most): every riser's foot, the
 * step ends along both flanks, the bank's foot on the walk, the band's foot on the lawn, the seat-wall round the
 * near side of the round lawn, and the walls of the campus blocks that cast no shadow box of their own.
 */
function contactLines(): ContactLine[] {
  const foot = (u: number, z: number): Vec3 => [u * F, -STAIR_DROP, z * F];
  const top = (u: number, z: number): Vec3 => [u * F, 0, z * F];
  const lawn = (a: number): Vec3 => foot(82 + Math.cos(a) * 38, -32 + Math.sin(a) * 38);
  return [
    stairContacts(0, 0, HILL_EDGE, WALL_Z, TREAD, RISER, STAIR_STEPS, 0.5 * F, 0.3),
    ...[HILL_EDGE, WALL_Z].map((z) => ({ a: [HILL_TOP, 0, z] as Vec3, b: [HILL_FOOT, -STAIR_DROP, z] as Vec3, reach: 0.7 * F, strength: 0.3 })),
    { a: [HILL_FOOT, -STAIR_DROP, WALL_Z], b: [HILL_FOOT, -STAIR_DROP, LOCKER_BANK_END], reach: 0.8 * F, strength: 0.26 },
    { a: [22 * F, -STAIR_DROP, BAND_Z], b: [22 * F, -STAIR_DROP, HILL_EDGE], reach: 0.6 * F, strength: 0.24 },
    // The seat-wall's near arcs, as two chords.
    { a: lawn(Math.PI * 0.55), b: lawn(Math.PI * 0.85), reach: 0.9 * F, strength: 0.3 },
    { a: lawn(Math.PI * 1.15), b: lawn(Math.PI * 1.45), reach: 0.9 * F, strength: 0.3 },
    // Block G's face toward the cross walk, block D's and E's toward the stairs, block F's down the rollaway.
    { a: top(-236, 35), b: top(-140, 35), reach: 1.2 * F, strength: 0.28 },
    { a: top(-110, -100), b: top(-10, -100), reach: 1.2 * F, strength: 0.28 },
    { a: foot(60, -95), b: foot(150, -95), reach: 1.2 * F, strength: 0.28 },
    { a: foot(150, -60), b: foot(150, 10), reach: 1.2 * F, strength: 0.28 },
    // The corner curb at the band's top.
    { a: top(-2, -6.3), b: top(0, -6.3), reach: 0.5 * F, strength: 0.25 },
  ];
}

export interface ElToroGeometry {
  ground: ReturnType<Bake['geometry']>;
  props: ReturnType<Bake['geometry']>;
  decals: ReturnType<Bake['geometry']>;
  railSegments: Segment[];
  shadowBoxes: ShadowBox[];
  wireMesh: WireMesh & { geometry: ReturnType<Bake['geometry']> };
  contacts: ContactLine[];
  canopies: Canopy[];
}

/** Everything ClassicSpot3D draws at El Toro but the trees (street props), with the crowns whose shade it dapples. */
export function buildElToroGeometry(canopies: Canopy[]): ElToroGeometry {
  // Marks lying on the ground's faces are baked apart from the props: they are drawn as ground, shaded as it is.
  const ground = new Bake(), props = new Bake(), decals = new Bake(), mesh = new Bake();
  const railSegments: Segment[] = [];
  landings(ground);
  stairs(ground);
  embankment(ground);
  paving(ground, decals);
  buildLowerCampus(ground, props);
  handrails(props, railSegments);
  buildElToroBuilding(props, mesh, railSegments);
  buildElToroCanopy(props);
  const feet = buildElToroLandscape(props);
  shrubShade(decals, feet);
  runUpJoints(decals);
  weathering(decals);
  const school = elToroBuildingShade();
  railSegments.push(school.pole);
  return {
    ground: ground.geometry(),
    props: props.geometry(),
    decals: decals.geometry(),
    railSegments,
    // The school's walls and eave, the canopy's roof and near piers, the lantern, and block B's walls and eave.
    shadowBoxes: [school.walls, school.eave, ...elToroCanopyShade(), school.lantern,
      { min: [42 * F, -STAIR_DROP, 30 * F], max: [138 * F, 1.5 * F, 126 * F] },
      { min: [37.5 * F, 1.05 * F, 25.5 * F], max: [142.5 * F, 1.5 * F, 130.5 * F] },
    ],
    wireMesh: { ...FENCE_MESH, geometry: mesh.geometry() },
    contacts: contactLines(),
    canopies,
  };
}
