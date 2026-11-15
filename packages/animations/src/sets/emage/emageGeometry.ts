import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  EMAGE_BANK_TOP, EMAGE_SHELF_END, EMAGE_DROP, EMAGE_EDGE_Z, EMAGE_FOOT as F,
  EMAGE_GRADE, EMAGE_PATH_END, EMAGE_PAVED_Z0, EMAGE_RAIL_END, EMAGE_RAIL_HEIGHT,
  EMAGE_RAIL_RADIUS, EMAGE_RAIL_START, EMAGE_RAIL_Z, EMAGE_RISER,
  EMAGE_RUN, EMAGE_STAIR_Z0, EMAGE_STAIR_Z1, EMAGE_TERRACE_Z0, EMAGE_TREAD,
  EMAGE_WATER_EDGE, emageBank, emageGround,
} from './emageLayout';
import { PICKETS, box, bunch, face, flat, mixHex, profile, tube, tag, type Segment, type ShadowBox } from './emageKit';
import { crack, disc, raggedEdge, softLine, wearFace, type Plan } from './emageWear';
import * as PAINT from './emagePalette';
import type { ContactLine } from '../surfaces';
import { buildApartments, buildBridge, buildSkyline } from './emageBuildings';
import { buildPlanting, emageCanopies } from './emageTrees';
import { buildRiver } from './emageRiver';

const LOWER = -EMAGE_DROP;
/** How far the trail, its verge and the river run either way along the foot of the stairs. */
const ALONG0 = -220 * F, ALONG1 = 150 * F;
/** The risers and the stones' faces: inked edges, so each step reads at a distance. */
const STEP: Ink = { id: 40, priority: 4, width: 0.12, kind: INK_PROP, solid: 15 };
/** Each tier's front edge: a concrete curb fourteen inches deep, its gravel bed a little lower behind it. */
const CURB = 14 / 12 * F;
const BED_DROP = 0.12 * F;
/** Decals lie this far over what they mark (the ground's material, a hair proud of it). */
const DECAL_LIFT = 0.35;

/**
 * Emage's amphitheatre above the river trail, the South Platte straight ahead and the cable-stayed bridge over
 * both. All surfaces are procedural; the reference photographs are a separate research pack.
 */
export function buildEmageGeometry() {
  const ground = new Bake(), props = new Bake(), decals = new Bake(), mesh = new Bake();
  const railSegments: Segment[] = [], shadowBoxes: ShadowBox[] = [];
  buildPlaza(ground, decals);
  buildTerraces(ground, props, decals);
  buildRiverside(ground, props, decals);
  buildHandrail(props, railSegments);
  buildBridge(props, mesh, shadowBoxes);
  buildApartments(props, mesh, shadowBoxes);
  buildSkyline(props);
  buildPlanting(props);
  return {
    ground: ground.geometry(), props: props.geometry(), decals: decals.geometry(),
    wireMesh: { ...PICKETS, geometry: mesh.geometry() },
    railSegments, shadowBoxes, contacts: emageContacts(), canopies: emageCanopies(),
  };
}

/* ----- The plaza and the hillside ----- */

function buildPlaza(ground: Bake, decals: Bake) {
  // The open red-tan plaza between the apartments and the top step, cast in panels (the look's pavers at panel
  // size: tooled joints, each pour a touch its own tone); grey paving round it out to the buildings, and a
  // planting bed past its straight -z edge.
  flat(ground, -350 * F, 0, -260 * F, EMAGE_EDGE_Z, 0, PAINT.OUTER_PAVING);
  flat(ground, -75 * F, 0, -34 * F, EMAGE_EDGE_Z, 0.08, PAINT.PLAZA, PANELS);
  flat(ground, -70 * F, 0, -42 * F, -34 * F, 0.1, PAINT.HILLSIDE, tag('soil'));
  buildThresholdBand(ground);
  buildCorridor(ground);
  // On the rail side the plaza runs past the bench to the bridge's mouth, then a planted bank with a path down
  // beside the south building.
  flat(ground, -350 * F, -4 * F, EMAGE_EDGE_Z, 260 * F, 0, PAINT.PLAZA, PANELS);
  flat(ground, -60 * F, -4 * F, 36 * F, 70 * F, 0.15, PAINT.HILLSIDE, tag('soil'));
  profile(ground, -4 * F, EMAGE_RUN, 65 * F, 73 * F, emageBank, () => PAINT.TRAIL, 16);
  buildPlazaMarks(decals);
  // Beyond the seating, the hillside falls to the trail as a slope of dry grass.
  const slope = (x: number) => -EMAGE_DROP * Math.min(1, Math.max(0, x / EMAGE_RUN));
  profile(ground, 0, EMAGE_RUN, ALONG0, EMAGE_TERRACE_Z0, slope, () => PAINT.END_SLOPE, 8, tag('grass'));
  // The seating's inland end: each tier's side, up to that slope, cast like the risers.
  for (let tier = 0; tier < 10; tier++) {
    const x0 = tier * 2 * EMAGE_TREAD, x1 = Math.min(EMAGE_RUN, x0 + 2 * EMAGE_TREAD), y = -(tier + 1) * 2 * EMAGE_RISER;
    wearFace(ground, [x0, slope(x0), EMAGE_TERRACE_Z0], [x1, slope(x1), EMAGE_TERRACE_Z0], [x1, y, EMAGE_TERRACE_Z0], [x0, y, EMAGE_TERRACE_Z0], [0, 0, -1], PAINT.TERRACE_END, tag('concrete'), 2500 * F + x0);
  }
  // The bank outside the rail, from the plaza's edge down to the trail: dry grass and dirt under the thicket.
  profile(ground, -4 * F, EMAGE_RUN, EMAGE_EDGE_Z, ALONG1, emageBank, () => PAINT.RAIL_BANK, 40, tag('grass'));
}

/** Plaza concrete in panels: the look's pavers, drawn at panel size. */
const PANELS = tag('pavers');
/** Decals on the plaza lie this far up: over the plaza, the paver band and the beds by enough, and no more. */
const PLAZA_DECAL_Y = 0.42;

/**
 * What lies on the plaza: the two long curved score lines sweeping across it by the stairs and the bridge (refs
 * 02, 03, 06), and the round tree grates and covers in it (aerial 21), flush with the paving.
 */
function buildPlazaMarks(decals: Bake) {
  const inPlaza = ([x, z]: Plan) => x < -0.6 * F && x > -74 * F && z > -33.4 * F && (z < EMAGE_EDGE_Z || x < -4.6 * F) && z < 32 * F;
  for (const [r, from, to] of [[30, -1.75, 0.15], [44, -1.3, 0.3]]) {
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const at = (t: number): Plan => [(-10 - r * Math.cos(t)) * F, (29 + r * Math.sin(t)) * F];
      const a = at(from + (to - from) * i / steps), c = at(from + (to - from) * (i + 1) / steps);
      if (inPlaza(a) && inPlaza(c)) softLine(decals, a, c, PLAZA_DECAL_Y, 0.14 * F, PAINT.PLAZA, PAINT.PLAZA_JOINT, PANELS);
    }
  }
  for (const [x, z] of [[-55, -22], [-45, 22], [-22, 14]]) {
    disc(decals, x * F, z * F, PLAZA_DECAL_Y, 1.6 * F, PAINT.GRATE_RIM, PAINT.GRATE_RIM, tag('metal'));
    disc(decals, x * F, z * F, PLAZA_DECAL_Y + 0.08, 1.3 * F, PAINT.GRATE, PAINT.GRATE_RIM, tag('metal'));
  }
}

/** The curved band of dark pavers with pale edging across the plaza, concave toward the bridge mouth. */
function buildThresholdBand(ground: Bake) {
  const steps = 24;
  const at = (r: number, t: number): [number, number, number] => [(-10 - r * Math.cos(t)) * F, 0.12, (29 + r * Math.sin(t)) * F];
  for (let i = 0; i < steps; i++) {
    const a = -0.85 + i * 1.7 / steps, b = -0.85 + (i + 1) * 1.7 / steps;
    for (const [r0, r1, color] of [[62, 63, PAINT.PAVER_EDGING], [63, 71, PAINT.PAVER_BAND], [71, 72, PAINT.PAVER_EDGING]] as const) {
      face(ground, at(r0, a), at(r0, b), at(r1, b), at(r1, a), color);
    }
  }
}

/** The corridor's paving up between the two buildings, angled off the stairs' line, with a dark band down its middle. */
function buildCorridor(ground: Bake) {
  face(ground, [-85 * F, 0.09, -79 * F], [-330 * F, 0.09, -181 * F], [-330 * F, 0.09, -80 * F], [-85 * F, 0.09, 60 * F], PAINT.CORRIDOR);
  face(ground, [-85 * F, 0.13, -13 * F], [-330 * F, 0.13, -134 * F], [-330 * F, 0.13, -126 * F], [-85 * F, 0.13, -5 * F], PAINT.PAVER_BAND);
}

/* ----- The stairs and terraces ----- */

function buildTerraces(ground: Bake, props: Bake, decals: Bake) {
  for (let tier = 0; tier < 10; tier++) buildTier(ground, props, decals, tier);
  buildEndSlopeGrass(props);
}

/** Where along the wear each tier's faces start, so no two risers weather alike (set units). */
const wearFrom = (tier: number, face: number) => (tier * 97 + face * 41) * F;

/**
 * One seating terrace, two walking risers tall: its tread (a curb fourteen inches deep at the front, the gravel
 * bed behind it, dark paved slabs beside the stones, a strip of concrete on the bank side), its tall riser and
 * the sandstone half-step set in it, bunch grass along the back of the bed, a step light and the odd repair.
 * The concrete's weathering is the look's wall wear, per pixel (emageWear.ts).
 */
function buildTier(ground: Bake, props: Bake, decals: Bake, tier: number) {
  const tread = EMAGE_TREAD, riser = EMAGE_RISER;
  const x0 = tier * 2 * tread, x1 = Math.min(EMAGE_RUN, x0 + 2 * tread);
  const y = -(tier + 1) * 2 * riser, above = y + 2 * riser;
  const stoneTop = y + riser;
  const halfEnd = Math.min(x0 + tread, EMAGE_RUN);
  const curbBack = Math.max(x0, x1 - CURB);
  const bedded = x1 - x0 > 1.5 * F;
  // The tread: the curb, the gravel behind it a little lower and the curb's back face, the paved slabs, the
  // bank-side strip. The last tier is too short for a bed: it is all curb.
  flat(ground, curbBack, x1, EMAGE_TERRACE_Z0, EMAGE_PAVED_Z0, y, PAINT.TREAD);
  if (curbBack > x0) {
    flat(ground, x0, curbBack, EMAGE_TERRACE_Z0, EMAGE_PAVED_Z0, y - BED_DROP, PAINT.BED_GRAVEL, tag('asphalt'));
    wearFace(ground, [curbBack, y - BED_DROP, EMAGE_TERRACE_Z0], [curbBack, y - BED_DROP, EMAGE_PAVED_Z0], [curbBack, y, EMAGE_PAVED_Z0], [curbBack, y, EMAGE_TERRACE_Z0], [-1, 0, 0], PAINT.CONCRETE, tag('concrete'), wearFrom(tier, 3));
    // The bed's sides: the paved slabs' edge, and the tier's end.
    face(ground, [x0, y - BED_DROP, EMAGE_PAVED_Z0], [curbBack, y - BED_DROP, EMAGE_PAVED_Z0], [curbBack, y, EMAGE_PAVED_Z0], [x0, y, EMAGE_PAVED_Z0], PAINT.PAVED, [0, 0, -1]);
    face(ground, [x0, y - BED_DROP, EMAGE_TERRACE_Z0], [curbBack, y - BED_DROP, EMAGE_TERRACE_Z0], [curbBack, y, EMAGE_TERRACE_Z0], [x0, y, EMAGE_TERRACE_Z0], PAINT.TERRACE_END, [0, 0, -1]);
  }
  flat(ground, x0, x1, EMAGE_PAVED_Z0, EMAGE_STAIR_Z0, y, PAINT.PAVED);
  flat(ground, x0, x1, EMAGE_STAIR_Z1, EMAGE_EDGE_Z, y, PAINT.TREAD);
  // The paved slabs' joints, two feet apart.
  for (let slab = EMAGE_PAVED_Z0 + 2 * F; slab < EMAGE_STAIR_Z0 - 0.5 * F; slab += 2 * F) {
    softLine(decals, [x0 + 0.05 * F, slab], [x1 - 0.05 * F, slab], y + DECAL_LIFT, 0.12 * F, PAINT.PAVED, PAINT.SLAB_JOINT);
  }
  // The tall concrete riser, full height except where the half-step stands in front of it: cast concrete,
  // splashed at its foot and run down from its top.
  // Behind a bed it reaches down to the gravel.
  for (const [z0, z1, foot] of [[EMAGE_TERRACE_Z0, EMAGE_PAVED_Z0, curbBack > x0 ? y - BED_DROP : y], [EMAGE_PAVED_Z0, EMAGE_STAIR_Z0, y], [EMAGE_STAIR_Z1, EMAGE_EDGE_Z, y]]) {
    const from = wearFrom(tier, 0) + (z0 - EMAGE_TERRACE_Z0);
    wearFace(ground, [x0, foot, z0], [x0, foot, z1], [x0, above, z1], [x0, above, z0], [1, 0, 0], PAINT.CONCRETE, STEP, from);
  }
  wearFace(ground, [x0, stoneTop, EMAGE_STAIR_Z0], [x0, stoneTop, EMAGE_STAIR_Z1], [x0, above, EMAGE_STAIR_Z1], [x0, above, EMAGE_STAIR_Z0], [1, 0, 0], PAINT.CONCRETE, STEP, wearFrom(tier, 0) + (EMAGE_STAIR_Z0 - EMAGE_TERRACE_Z0));
  // The red sandstone half-step: two blocks side by side across the lane, their joint wandering a little from
  // row to row.
  const joint = (hash2(tier, 0, 5) - 0.5) * 1.2 * F;
  for (const [z0, z1, k] of [[EMAGE_STAIR_Z0, joint, 0], [joint, EMAGE_STAIR_Z1, 1]]) {
    buildStone(ground, x0, halfEnd, y, stoneTop, z0, z1, tier * 2 + k);
  }
  softLine(decals, [x0 + 0.04 * F, joint], [halfEnd - 0.12 * F, joint], stoneTop + DECAL_LIFT, 0.1 * F, PAINT.SANDSTONE[tier % 4], PAINT.STONE_JOINT, STONE);
  // Grime ground into the tops where feet go, darkest at the back against the riser; a dusty bloom on others.
  for (let k = 0; k < 3; k++) {
    // Kept on the stone's flat top, short of its worn nosing: a ragged disc reaches 1.21 of its radius.
    const r = (0.14 + 0.14 * hash2(tier, k, 25)) * F, reach = 1.25 * r;
    const z = (2 * hash2(tier, k, 24) - 1) * (EMAGE_STAIR_Z1 - reach - 0.1 * F);
    const x = x0 + reach + 0.05 * F + Math.max(0, halfEnd - x0 - 2 * reach - 0.25 * F) * hash2(tier, k, 26) ** 2;
    const dusty = hash2(tier, k, 27) > 0.6;
    disc(decals, x, z, stoneTop + DECAL_LIFT + 0.02 * (k + 1), r, dusty ? PAINT.STONE_DUST : PAINT.STONE_GRIME, PAINT.SANDSTONE[(tier + k) % 4], STONE, tier * 5 + k, 0.35);
  }
  if (halfEnd < x1) flat(ground, halfEnd, x1, EMAGE_STAIR_Z0, EMAGE_STAIR_Z1, y, PAINT.TREAD);
  // The stair's outer wall, down to the bank beside it.
  wearFace(ground, [x0, emageBank(x0), EMAGE_EDGE_Z], [x1, emageBank(x1), EMAGE_EDGE_Z], [x1, y, EMAGE_EDGE_Z], [x0, y, EMAGE_EDGE_Z], [0, 0, 1], PAINT.OUTER_WALL, tag('concrete'), 2000 * F + x0);
  // Dry bunch grass along the back of the bed against the riser behind, thicker toward the far end, and a few
  // clumps out in the gravel; none within eight feet of the lane.
  if (bedded) {
    for (let k = 0; k < 16; k++) {
      const share = hash2(tier, k, 13) ** 0.65;
      const z = EMAGE_TERRACE_Z0 + (0.6 + share * 26) * F;
      const back = hash2(tier, k, 14) < 0.8;
      const x = back ? x0 + (0.15 + 0.35 * hash2(tier, k, 15)) * F : x0 + (0.4 + (curbBack - x0) / F * 0.6 * hash2(tier, k, 15)) * F;
      const height = (0.7 + 1.1 * hash2(tier, k, 16) * (1 - 0.4 * share)) * F;
      // Its blades lean out up to their height: the whole clump stays clear of the lane.
      if (z > WEED_LIMIT_Z - height) continue;
      bunch(props, x, y - BED_DROP, z, height, k % 5 === 0 ? [PAINT.BUNCH_GREEN, ...PAINT.BUNCH] : PAINT.BUNCH, tier * 31 + k);
    }
  }
  // A small step light set flush in the riser just inland of the stones: a grey plate, a faint warm lens.
  const lightZ = EMAGE_STAIR_Z0 - 1.3 * F;
  const plateX = x0 + 0.012 * F;
  face(props, [plateX, y + 0.3 * F, lightZ - 0.34 * F], [plateX, y + 0.58 * F, lightZ - 0.34 * F], [plateX, y + 0.58 * F, lightZ + 0.34 * F], [plateX, y + 0.3 * F, lightZ + 0.34 * F], PAINT.LIGHT_PLATE, [1, 0, 0], tag('metal'));
  face(props, [plateX + 0.006 * F, y + 0.35 * F, lightZ - 0.27 * F], [plateX + 0.006 * F, y + 0.53 * F, lightZ - 0.27 * F], [plateX + 0.006 * F, y + 0.53 * F, lightZ + 0.27 * F], [plateX + 0.006 * F, y + 0.35 * F, lightZ + 0.27 * F], PAINT.LIGHT_WARM, [1, 0, 0], tag('metal'));
  // A few risers patched in a paler rectangle, round the light by the lane on some and out along the tier on one.
  for (const [z0, z1] of RISER_PATCHES[tier] ?? []) {
    const patchX = x0 + 0.008 * F;
    wearFace(props, [patchX, y + 0.03 * F, z0 * F], [patchX, y + 0.03 * F, z1 * F], [patchX, above - 0.05 * F, z1 * F], [patchX, above - 0.05 * F, z0 * F], [1, 0, 0], PAINT.RISER_PATCH, tag('concrete'), wearFrom(tier, 5) + z0 * F);
  }
}

/** Bunch grass and weeds stay this far from the lane's edge (eight feet), so nothing stands in the line. */
export const WEED_LIMIT_Z = EMAGE_STAIR_Z0 - 8 * F;
/** Paler patched rectangles in a few risers, from z0 to z1 (feet). */
const RISER_PATCHES: Record<number, [number, number][]> = { 1: [[-6.4, -3.1]], 3: [[-6.1, -3.1]], 5: [[-23, -18.5]], 6: [[-6.6, -3.1]] };
/** The sandstone: the look's stucco, its sandy grain; its faces inked with the risers. */
const STONE = tag('stucco');
const STONE_FACE: Ink = { ...STEP, solid: STONE.solid };
/** The blocks replaced in pale concrete, by index (tier * 2 + block). */
const PATCHED_STONES = [7, 14];

/**
 * One sandstone block of the half-step, from x0 back to its nosing at x1, foot at y and top at `top`, across z0
 * to z1. Its nosing is worn round and chipped: three lengths along it, each bevelled its own depth, the bigger
 * chips catching the light and the shade under them; the block's top a touch its own tone in each.
 */
function buildStone(ground: Bake, x0: number, x1: number, y: number, top: number, z0: number, z1: number, index: number) {
  const patched = PATCHED_STONES.includes(index);
  const pieces = 3;
  const bevels = Array.from({ length: pieces }, (_, k) => (0.04 + 0.1 * hash2(index, k, 21) ** 2) * F);
  const topColor = (k: number) => patched ? PAINT.STONE_PATCH : mixHex(PAINT.SANDSTONE[index % 4], PAINT.SANDSTONE[(index + k + 1) % 4], 0.6 * hash2(index, k, 22));
  const faceColor = patched ? mixHex(PAINT.STONE_PATCH, PAINT.CONCRETE, 0.4) : PAINT.SANDSTONE_FACE[index % 4];
  const ink = patched ? tag('concrete') : STONE;
  const faceInk = patched ? STEP : STONE_FACE;
  // The face's bedding: a lower course a shade darker than the upper, where the stone was split.
  const bed = y + (0.35 + 0.3 * hash2(index, 0, 23)) * (top - y);
  for (let k = 0; k < pieces; k++) {
    const a = z0 + (z1 - z0) * k / pieces, c = z0 + (z1 - z0) * (k + 1) / pieces, bevel = bevels[k];
    flat(ground, x0, x1 - bevel, a, c, top, topColor(k), ink);
    // The worn nosing, sloped from the top down to the face.
    const n: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
    face(ground, [x1 - bevel, top, a], [x1 - bevel, top, c], [x1, top - bevel, c], [x1, top - bevel, a], mixHex(topColor(k), faceColor, 0.4), n, ink);
    const from = 3000 * F + index * 13 * F + (a - z0);
    wearFace(ground, [x1, y, a], [x1, y, c], [x1, bed, c], [x1, bed, a], [1, 0, 0], patched ? faceColor : mixHex(faceColor, PAINT.STONE_GRIME, 0.18), faceInk, from, 'cast');
    wearFace(ground, [x1, bed, a], [x1, bed, c], [x1, top - bevel, c], [x1, top - bevel, a], [1, 0, 0], faceColor, faceInk, from, 'cast');
    // Where one length's chip is deeper than the next, the step between them.
    if (k + 1 < pieces) {
      const next = bevels[k + 1], deep = Math.max(bevel, next), shallow = Math.min(bevel, next);
      if (deep - shallow > 0.005 * F) {
        face(ground, [x1 - deep, top, c], [x1 - shallow, top, c], [x1, top - shallow, c], [x1, top - deep, c], faceColor, [0, 0, bevel > next ? -1 : 1], ink);
      }
    }
  }
  // The block's ends, against the lane's sides.
  for (const [z, side] of [[EMAGE_STAIR_Z0, -1], [EMAGE_STAIR_Z1, 1]] as const) {
    if (z !== z0 && z !== z1) continue;
    const bevel = bevels[side < 0 ? 0 : pieces - 1];
    wearFace(ground, [x0, y, z], [x1, y, z], [x1, top - bevel, z], [x0, top, z], [0, 0, side], faceColor, ink, 3500 * F + index * 7 * F, 'cast');
    face(ground, [x0, top, z], [x1 - bevel, top, z], [x1, top - bevel, z], [x1, top - bevel, z], faceColor, [0, 0, side], ink);
  }
}

/** Dry bunch grass thick on the slope past the tiers' far end, thinning up toward the plaza corner. */
function buildEndSlopeGrass(props: Bake) {
  const slope = (x: number) => -EMAGE_DROP * Math.min(1, Math.max(0, x / EMAGE_RUN));
  for (let i = 0; i < 150; i++) {
    const x = (0.5 + 21 * hash2(i, 0, 17)) * F;
    const z = EMAGE_TERRACE_Z0 - (0.4 + 26 * hash2(i, 0, 18) ** 1.4) * F;
    const height = (1 + 1.4 * hash2(i, 0, 19)) * F;
    bunch(props, x, slope(x), z, height, i % 4 === 0 ? [PAINT.BUNCH_GREEN, ...PAINT.BUNCH] : PAINT.BUNCH, 700 + i, 11);
  }
}

/* ----- The trail and the river ----- */

function buildRiverside(ground: Bake, props: Bake, decals: Bake) {
  buildTrail(ground, decals);
  buildRiver(ground, props, decals);
}

/**
 * The trail along the foot of the stairs: a dry verge, the ten-foot path against the hill, widening to the buff
 * apron at the foot of the stairs, jointed in panels about eight feet square with a few cracks; the grass grown
 * ragged over its edges; the dirt shoulder, then the brushy bank.
 */
function buildTrail(ground: Bake, decals: Bake) {
  flat(ground, EMAGE_RUN, EMAGE_PATH_END, ALONG0, ALONG1, LOWER, PAINT.VERGE, tag('grass'));
  flat(ground, EMAGE_RUN, TRAIL_EDGE, ALONG0, ALONG1, LOWER + 0.04, PAINT.APRON);
  flat(ground, EMAGE_RUN, EMAGE_PATH_END, APRON_Z0, APRON_Z1, LOWER + 0.04, PAINT.APRON);
  flat(ground, EMAGE_PATH_END, EMAGE_BANK_TOP, ALONG0, ALONG1, LOWER, PAINT.DIRT, tag('soil'));
  const y = LOWER + DECAL_LIFT;
  const joint = (a: Plan, c: Plan) => softLine(decals, a, c, y, 0.13 * F, PAINT.APRON, PAINT.TRAIL_JOINT);
  // The path's centre joint, and the apron's two long joints.
  joint([27 * F, SEEN_Z0], [27 * F, APRON_Z0]);
  joint([27 * F, APRON_Z1], [27 * F, SEEN_Z1]);
  for (const x of [29.3, 36.7]) joint([x * F, APRON_Z0], [x * F, APRON_Z1]);
  // Cross joints every eight feet, the full apron's width beside the stairs, the path's elsewhere.
  for (let z = SEEN_Z0; z <= SEEN_Z1; z += 8 * F) {
    const wide = z > APRON_Z0 && z < APRON_Z1;
    joint([EMAGE_RUN + 0.1 * F, z], [(wide ? EMAGE_PATH_END : TRAIL_EDGE) - 0.1 * F, z]);
  }
  // Cracks, mostly where the panels take the landings.
  for (let i = 0; i < 7; i++) {
    const x = (24 + 17 * hash2(i, 0, 43)) * F, z = (-30 + 38 * hash2(i, 0, 44)) * F;
    crack(decals, [x, z], hash2(i, 0, 45) * Math.PI * 2, (2 + 5 * hash2(i, 0, 46)) * F, y + 0.03, PAINT.APRON, PAINT.CRACK, 900 + i);
  }
  // The verge grown ragged over the path's edge and the apron's ends, and the shoulder's dirt spilled onto the
  // apron's river edge; the verge ragged into the dirt either side of it.
  const grass = tag('grass'), dirt = tag('soil');
  raggedEdge(decals, [TRAIL_EDGE, SEEN_Z0], [TRAIL_EDGE, APRON_Z0], y, 0.9 * F, 1, PAINT.VERGE, grass, 51);
  raggedEdge(decals, [TRAIL_EDGE, APRON_Z1], [TRAIL_EDGE, SEEN_Z1], y, 0.9 * F, 1, PAINT.VERGE, grass, 52);
  raggedEdge(decals, [TRAIL_EDGE, APRON_Z0], [EMAGE_PATH_END, APRON_Z0], y, 1.1 * F, -1, PAINT.VERGE, grass, 53);
  raggedEdge(decals, [EMAGE_PATH_END, APRON_Z1], [TRAIL_EDGE, APRON_Z1], y, 1.1 * F, -1, PAINT.VERGE, grass, 54);
  raggedEdge(decals, [EMAGE_PATH_END, APRON_Z1], [EMAGE_PATH_END, APRON_Z0], y, 1.0 * F, 1, PAINT.DIRT, dirt, 55);
  raggedEdge(decals, [EMAGE_PATH_END, SEEN_Z0], [EMAGE_PATH_END, APRON_Z0], y, 1.6 * F, -1, PAINT.VERGE, grass, 56);
  raggedEdge(decals, [EMAGE_PATH_END, APRON_Z1], [EMAGE_PATH_END, SEEN_Z1], y, 1.6 * F, -1, PAINT.VERGE, grass, 57);
  // The brushy bank down into the South Platte.
  const bankEnd = EMAGE_WATER_EDGE + 4 * F;
  profile(ground, EMAGE_BANK_TOP, bankEnd, ALONG0, ALONG1, emageGround,
    x => x > EMAGE_WATER_EDGE - 3 * F ? PAINT.WET_BANK : x > EMAGE_SHELF_END ? PAINT.LOWER_BANK : PAINT.SHELF, 14);
}

/** The path's edge against the verge, beyond the apron; the apron's ends; the stretch of trail the cameras see. */
const TRAIL_EDGE = 32 * F;
const APRON_Z0 = -40 * F, APRON_Z1 = 12 * F;
const SEEN_Z0 = -128 * F, SEEN_Z1 = 104 * F;

/* ----- The rail ----- */

function buildHandrail(props: Bake, shadows: Segment[]) {
  const z = EMAGE_RAIL_Z, h = EMAGE_RAIL_HEIGHT;
  const axis = (x: number) => h - EMAGE_GRADE * x;
  // The actual grind line: one round, rust-brown sloping pipe with a straight cut toe.
  tube(props, [[EMAGE_RAIL_START, axis(EMAGE_RAIL_START), z], [EMAGE_RAIL_END, axis(EMAGE_RAIL_END), z]], EMAGE_RAIL_RADIUS, PAINT.RUST, shadows, 10);
  for (const step of [1.2, 6.2, 11.2, 17.7]) {
    const x = step * EMAGE_TREAD, foot = emageGround(x + 0.18 * F) - EMAGE_RISER;
    tube(props, [[x + 0.18 * F, foot, z], [x, axis(x), z]], 0.07 * F, PAINT.RAIL_POST, shadows);
    // Galvanized sleeves where the posts go into the concrete.
    tube(props, [[x + 0.17 * F, foot, z], [x + 0.16 * F, foot + 0.45 * F, z]], 0.085 * F, PAINT.RAIL_SLEEVE);
  }
  // At the top it kinks into the galvanized guard along the plaza's edge,
  // with the shallow sag seen in the references, and runs past the bench.
  const top = axis(EMAGE_RAIL_START);
  tube(props, [[EMAGE_RAIL_START, top, z], [-2.4 * F, top - 0.3 * F, 6.5 * F], [-3.6 * F, top - 0.42 * F, 9 * F], [-4 * F, top - 0.1 * F, 11 * F], [-4 * F, top, 16 * F], [-4 * F, top, 22 * F]], EMAGE_RAIL_RADIUS, PAINT.GALVANIZED, shadows);
  for (const [x, across] of [[-2.4, 6.5], [-4, 11], [-4, 16], [-4, 22]]) tube(props, [[x * F, 0, across * F], [x * F, top - 0.1 * F, across * F]], 0.065 * F, PAINT.GUARD_POST, shadows);
  // The long timber bench follows the guard, off to the river side of the
  // skating lane; it never lies across a mirrored grind's roll-in.
  for (let slat = 0; slat < 4; slat++) box(props, [(-5.5 - slat * 0.22) * F, 1.5 * F, 9 * F], [(-5.31 - slat * 0.22) * F, 1.67 * F, 19 * F], PAINT.BENCH_SIDE, PAINT.BENCH_TOP, NO_INK);
  for (const across of [10.5 * F, 17 * F]) box(props, [-6.2 * F, 0, across], [-5.3 * F, 1.5 * F, across + 0.22 * F], PAINT.BENCH_FOOT, PAINT.BENCH_FOOT_TOP, NO_INK);
}

/**
 * Contact darkening (nine of the look's twelve slots): along the lane, the foot of each upper half-riser on its
 * stone and of each stone on the tread below; the foot of every tall riser along its bed, slabs and bank-side
 * strip; the gravel against each curb's back; the bank against the stair's outer wall (one slope, then level);
 * the tiers' ends on the slope; and the two apartment buildings' feet along the plaza and the corridor.
 */
export function emageContacts(): ContactLine[] {
  const tier: Vec3 = [2 * EMAGE_TREAD, -2 * EMAGE_RISER, 0];
  const bankLevels = (EMAGE_DROP - 0.65 * F) / EMAGE_GRADE;
  return [
    { a: [0, -EMAGE_RISER, EMAGE_STAIR_Z0], b: [0, -EMAGE_RISER, EMAGE_STAIR_Z1], step: tier, count: 10, reach: 0.22 * F, strength: 0.22 },
    { a: [EMAGE_TREAD, -2 * EMAGE_RISER, EMAGE_STAIR_Z0], b: [EMAGE_TREAD, -2 * EMAGE_RISER, EMAGE_STAIR_Z1], step: tier, count: 10, reach: 0.22 * F, strength: 0.24 },
    { a: [0, -2 * EMAGE_RISER - BED_DROP / 2, EMAGE_TERRACE_Z0], b: [0, -2 * EMAGE_RISER - BED_DROP / 2, EMAGE_EDGE_Z], step: tier, count: 10, reach: 0.3 * F, strength: 0.28 },
    { a: [2 * EMAGE_TREAD - CURB, -2 * EMAGE_RISER - BED_DROP, EMAGE_TERRACE_Z0], b: [2 * EMAGE_TREAD - CURB, -2 * EMAGE_RISER - BED_DROP, EMAGE_PAVED_Z0], step: tier, count: 9, reach: 0.16 * F, strength: 0.22 },
    { a: [0, emageBank(0), EMAGE_EDGE_Z], b: [bankLevels, -EMAGE_DROP, EMAGE_EDGE_Z], reach: 0.3 * F, strength: 0.2 },
    { a: [bankLevels, -EMAGE_DROP, EMAGE_EDGE_Z], b: [EMAGE_RUN, -EMAGE_DROP, EMAGE_EDGE_Z], reach: 0.3 * F, strength: 0.2 },
    { a: [0, 0, EMAGE_TERRACE_Z0], b: [EMAGE_RUN, -EMAGE_DROP, EMAGE_TERRACE_Z0], reach: 0.3 * F, strength: 0.18 },
    { a: [-62 * F, 0, 73 * F], b: [-250 * F, 0, -34 * F], reach: F, strength: 0.3 },
    { a: [-45 * F, 0, -62 * F], b: [-220 * F, 0, -135 * F], reach: F, strength: 0.3 },
  ];
}
