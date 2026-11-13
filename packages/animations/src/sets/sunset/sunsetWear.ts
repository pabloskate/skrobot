import type { Vec3 } from '../../camera/view';
import type { Bake, Ink } from '../../three/bake';
import { hash2 } from '../setKit';
import {
  BANK_END, BANK_Z0, BANK_Z1, F, FT, IN, LANES, LANE_Z, LIFT, ROOF_BACK, ROOF_Z0, ROOF_Z1, SIDEWALK_END, TAPER_END, FAR_FRONT,
  UP, floorY, mixHex, normalUp, tag, valueNoise, type Plan,
} from './sunsetKit';
import { SUNSET_PAINT as PAINT } from './sunsetPalette';

/**
 * Roof to Bank's wear. Level marks go on the decals (the ground's material, 0.3, 0.6 or 0.9 world units proud
 * by layer): the sidewalk's panels, cracks and the wash's dried run-off, the gutter and curb, Sunset's lane
 * paint, oil, wheel paths, skids, patches and tar-sealed cracks, the lot's stalls and puddles, the apron's
 * tyre tracks, the roof deck's laps, ponding and scuffs along the approach. The bank and the canopy's fascia
 * carry theirs in their own vertex colours (`bankTone`, `fasciaTone`): marks layered on a steep face fight at a
 * distance and read as grey dashes. Read from the Skate Sonr, cover and CCS photographs.
 */

const ASPHALT = tag('asphalt');
const CONCRETE = tag('concrete');
/** How far along the street the wear is drawn, either way: well past every camera's view. */
const REACH = 3400;

/** A level quad over a rectangle on the drawn floor, a colour at each corner (or one for all). */
function patch(b: Bake, x0: number, x1: number, z0: number, z1: number, colors: string | [string, string, string, string], ink: Ink, lift: number) {
  const [c00, c10, c11, c01] = typeof colors === 'string' ? [colors, colors, colors, colors] : colors;
  const p = (x: number, z: number): Vec3 => [x, floorY(x, z) + lift, z];
  const a = p(x0, z1), c = p(x1, z1), d = p(x1, z0), e = p(x0, z0);
  b.quadCorners(a, c, d, e, normalUp(a, c, d), [{ color: c01 }, { color: c11 }, { color: c10 }, { color: c00 }], ink);
}

/** A thin straight mark from `a` to `b` (plan), `width` across. */
function stroke(b: Bake, a: Plan, c: Plan, width: number, color: string, ink: Ink, lift: number) {
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
  const nx = (-(c[1] - a[1]) / length) * width / 2, nz = ((c[0] - a[0]) / length) * width / 2;
  const p = (x: number, z: number): Vec3 => [x, floorY(x, z) + lift, z];
  const q = [p(a[0] + nx, a[1] + nz), p(c[0] + nx, c[1] + nz), p(c[0] - nx, c[1] - nz), p(a[0] - nx, a[1] - nz)];
  b.quad(q[0], q[1], q[2], q[3], normalUp(q[0], q[1], q[2]), { color }, ink);
}

/** A crooked crack wandering from (x, z) `length` along x or z, kept inside [lo, hi] across. */
function crack(b: Bake, x: number, z: number, length: number, along: 'x' | 'z', seed: number, color: string, ink: Ink, lift: number, width = 0.35 * IN) {
  let prev: Plan = [x, z];
  const parts = 8;
  for (let k = 1; k <= parts; k++) {
    const wander = 6 * IN * (hash2(seed, k, 50) - 0.5) + 2.5 * IN * Math.sin(k * 1.7 + seed);
    const next: Plan = along === 'x' ? [x + (length * k) / parts, z + wander] : [x + wander, z + (length * k) / parts];
    stroke(b, prev, next, width * (0.7 + 0.6 * hash2(seed, k, 49)), color, ink, lift);
    prev = next;
  }
}

/** A blot: an irregular round stain `r` across, `center` in the middle fading to `rim`. */
function blot(b: Bake, x: number, z: number, r: number, center: string, rim: string, seed: number, ink: Ink, lift: number, squash = 1) {
  const around = 10;
  const mid: Vec3 = [x, floorY(x, z) + lift, z];
  for (let k = 0; k < around; k++) {
    const at = (j: number): Vec3 => {
      const a = (j / around) * Math.PI * 2, rr = r * (0.65 + 0.5 * hash2(seed, j % around, 60));
      const px = x + Math.cos(a) * rr * squash, pz = z + Math.sin(a) * rr;
      return [px, floorY(px, pz) + lift, pz];
    };
    b.vertex(mid, UP, { color: center }, ink);
    b.vertex(at(k + 1), UP, { color: rim }, ink);
    b.vertex(at(k), UP, { color: rim }, ink);
  }
}

/* ----- The sidewalk, gutter and curb ----- */

/**
 * The sidewalk below the bank: panels between dark joints, a few replaced fresher or gone dull, cracks, the
 * wash's run-off dried pale across it toward the gutter, stains; the curb's worn top and grimy edge, the
 * concrete gutter pan, and the red curb by the hydrant.
 */
function sidewalk(b: Bake) {
  const x0 = BANK_END + 0.4 * IN, x1 = SIDEWALK_END;
  const panel = 5 * FT;
  for (let z = -REACH, k = 0; z < REACH; z += panel, k++) {
    // Every third score line is a full expansion joint, darker.
    patch(b, x0, x1 - 0.6 * FT, z - 0.3 * IN, z + 0.3 * IN, k % 3 ? mixHex(PAINT.joint, PAINT.sidewalk, 0.4) : PAINT.joint, CONCRETE, LIFT[0]);
    const tint = hash2(k, 1, 301);
    if (tint > 0.72) patch(b, x0 + 0.5 * IN, x1 - 0.65 * FT, z + 0.5 * IN, z + panel - 0.5 * IN, tint > 0.86 ? PAINT.sidewalkFresh : PAINT.sidewalkOld, CONCRETE, LIFT[0]);
  }
  // The joint where the bank's toe meets the walk.
  patch(b, BANK_END, BANK_END + 0.6 * IN, -REACH, REACH, PAINT.joint, CONCRETE, LIFT[0]);
  for (let k = 0; k < 26; k++) {
    const z = -2600 + 5200 * hash2(k, 2, 302), along = hash2(k, 3, 302) > 0.45;
    const x = x0 + (along ? 0.5 : 2 + 3 * hash2(k, 4, 302)) * FT;
    crack(b, x, z, (along ? 3 + 3 * hash2(k, 5, 302) : 2 + 3 * hash2(k, 5, 302)) * FT, along ? 'x' : 'z', k + 310, PAINT.crack, CONCRETE, LIFT[2]);
  }
  // Run-off from the bays dried in pale tide marks below the bank, between the planters and past the landing.
  for (let k = 0; k < 18; k++) {
    const z = BANK_Z0 + (BANK_Z1 - BANK_Z0) * hash2(k, 6, 303);
    const w = (1.5 + 3 * hash2(k, 7, 303)) * FT;
    patch(b, x0 + 0.2 * FT, x1 - 0.8 * FT, z, z + w, [mixHex(PAINT.sidewalk, PAINT.stain, 0.7), PAINT.sidewalk, PAINT.sidewalk, mixHex(PAINT.sidewalk, PAINT.stain, 0.5)], CONCRETE, LIFT[1]);
  }
  for (let k = 0; k < 30; k++) {
    const z = -2400 + 4800 * hash2(k, 8, 304), x = x0 + (0.5 + (x1 - x0 - 1.6 * FT) / FT * hash2(k, 9, 304)) * FT;
    blot(b, x, z, (0.3 + 0.9 * hash2(k, 10, 304)) * FT, mixHex(PAINT.stain, PAINT.crack, 0.25), PAINT.sidewalk, k + 320, CONCRETE, LIFT[2]);
  }
  // The curb's top, worn pale, its street edge grimy, and the gutter pan below it on the street.
  patch(b, x1 - 0.55 * FT, x1 - 0.12 * FT, -REACH, REACH, PAINT.curbTop, CONCRETE, LIFT[0]);
  patch(b, x1 - 0.12 * FT, x1, -REACH, REACH, PAINT.curbGrime, CONCRETE, LIFT[0]);
  patch(b, x1, x1 + 1.5 * FT, -REACH, REACH, [PAINT.curbGrime, PAINT.gutter, PAINT.gutter, PAINT.curbGrime], CONCRETE, LIFT[0]);
  for (let z = -REACH; z < REACH; z += 10 * FT) patch(b, x1, x1 + 1.5 * FT, z, z + 0.4 * IN, PAINT.joint, CONCRETE, LIFT[1]);
  // Red curb either side of the hydrant (sunsetStreetscape.ts).
  patch(b, x1 - 0.55 * FT, x1, HYDRANT_Z - 15 * FT, HYDRANT_Z + 15 * FT, PAINT.curbRed, CONCRETE, LIFT[1]);
}

/** Where the hydrant stands along the curb, its red curb either side. */
export const HYDRANT_Z = 640;

/* ----- Sunset Boulevard ----- */

/**
 * The boulevard: lane paint, oil dripped down each lane's middle, wheel paths worn smooth either side of it,
 * darker trench patches and a long utility cut along the curb lane, tar-sealed cracks, manholes and a few
 * skids. Lanes keep their own marks inside them, so no two layers cross.
 */
function road(b: Bake) {
  const lanes: Array<[number, number]> = [[SIDEWALK_END + 1.5 * FT, LANES.dash], [LANES.dash, LANES.middle], [LANES.middle, LANES.farDash], [LANES.farDash, LANES.farCurb - 1.5 * FT]];
  const segment = 200;
  lanes.forEach(([a, c], li) => {
    const mid = (a + c) / 2;
    for (let z = -REACH; z < REACH; z += segment) {
      const n = valueNoise(z / 400 + li * 9, li);
      const oil = mixHex(PAINT.road, PAINT.roadOil, 0.45 + 0.4 * n);
      const half = 1.4 * FT;
      patch(b, mid - half, mid, z, z + segment, [PAINT.road, oil, oil, PAINT.road], ASPHALT, LIFT[0]);
      patch(b, mid, mid + half, z, z + segment, [oil, PAINT.road, PAINT.road, oil], ASPHALT, LIFT[0]);
      for (const side of [-1, 1]) {
        const w = mid + side * 3.2 * FT, polish = mixHex(PAINT.road, '#85847d', 0.35 + 0.3 * valueNoise(z / 300 + side, li * 3));
        patch(b, w - 0.9 * FT, w, z, z + segment, [PAINT.road, polish, polish, PAINT.road], ASPHALT, LIFT[0]);
        patch(b, w, w + 0.9 * FT, z, z + segment, [polish, PAINT.road, PAINT.road, polish], ASPHALT, LIFT[0]);
      }
    }
    // Patches over old trench cuts, inside the lane (the curb lane has its long utility cut instead).
    for (let k = 0; k < (li === 0 ? 0 : 3); k++) {
      const z = -2800 + 5600 * hash2(li, k, 330), length = (5 + 12 * hash2(li, k, 331)) * FT, width = (3 + 4 * hash2(li, k, 332)) * FT;
      const px = a + 0.5 * FT + Math.max(0, c - a - width - 1 * FT) * hash2(li, k, 333);
      patch(b, px, px + width, z, z + length, hash2(li, k, 334) > 0.5 ? PAINT.roadPatch : PAINT.roadPatchOld, ASPHALT, LIFT[1]);
    }
    // Tar-sealed cracks, wandering down and across the lane.
    for (let k = 0; k < 4; k++) {
      const z = -2600 + 5200 * hash2(li, k, 335), along = hash2(li, k, 336) > 0.5;
      const x = along ? a + (0.5 + (c - a) / FT * 0.8 * hash2(li, k, 337)) * FT : a + 0.6 * FT;
      crack(b, x, z, along ? (6 + 10 * hash2(li, k, 338)) * FT : Math.min(c - a - 1.2 * FT, (6 + 4 * hash2(li, k, 338)) * FT), along ? 'z' : 'x', li * 40 + k, PAINT.tar, ASPHALT, LIFT[2], 1.4 * IN);
    }
  });
  // The long utility cut down the curb lane, clear of the rollout's reach past the landing.
  patch(b, SIDEWALK_END + 4 * FT, SIDEWALK_END + 6.5 * FT, LANE_Z + 40 * FT, REACH, PAINT.roadPatchOld, ASPHALT, LIFT[1]);
  // Lane paint: ten-foot dashes every forty, and the double yellow.
  for (let z = -REACH; z < REACH; z += 40 * FT) {
    for (const x of [LANES.dash, LANES.farDash]) patch(b, x - 2 * IN, x + 2 * IN, z, z + 10 * FT, PAINT.laneWhite, ASPHALT, LIFT[1]);
  }
  for (const dx of [-5 * IN, 5 * IN]) patch(b, LANES.middle + dx - 2 * IN, LANES.middle + dx + 2 * IN, -REACH, REACH, PAINT.laneYellow, ASPHALT, LIFT[1]);
  // Manholes, each a cast lid in a worn ring.
  for (const [x, z] of [[(LANES.dash + LANES.middle) / 2, -900], [(LANES.middle + LANES.farDash) / 2, 650], [(LANES.farDash + LANES.farCurb) / 2, 2100], [(LANES.dash + LANES.middle) / 2, 1700]]) {
    blot(b, x, z, 1.75 * FT, PAINT.manholeRim, PAINT.manholeRim, 0, ASPHALT, LIFT[1]);
    blot(b, x, z, 1.25 * FT, PAINT.manhole, mixHex(PAINT.manhole, PAINT.manholeRim, 0.4), 0, tag('metal'), LIFT[2]);
  }
  // Skids: paired dark streaks where someone braked for the light.
  for (let k = 0; k < 6; k++) {
    const lane = lanes[1 + (k % 3)], x = (lane[0] + lane[1]) / 2 + (hash2(k, 1, 340) - 0.5) * 2 * FT;
    const z = -2000 + 4000 * hash2(k, 2, 340), length = (12 + 20 * hash2(k, 3, 340)) * FT;
    for (const side of [-1, 1]) patch(b, x + side * 2.9 * FT - 3 * IN, x + side * 2.9 * FT + 3 * IN, z, z + length, mixHex(PAINT.tar, PAINT.road, 0.55), ASPHALT, LIFT[2]);
  }
}

/* ----- The lot, the apron, the far side ----- */

/** The side lot: stall lines, oil where the cars stand, water pooled off the drying cars, patched cracks. */
function lot(b: Bake) {
  for (let z = TAPER_END - 6 * F; z > -2420; z -= 10 * F) patch(b, -620, -120, z - 2 * IN, z + 2 * IN, PAINT.stall, ASPHALT, LIFT[2]);
  patch(b, -620, -606, -2400, TAPER_END - 6 * F, PAINT.stall, ASPHALT, LIFT[2]);
  for (let z = TAPER_END - 11 * F, k = 0; z > -2420; z -= 10 * F, k++) {
    blot(b, -420 + 60 * hash2(k, 1, 350), z, (0.8 + 1.2 * hash2(k, 2, 350)) * FT, PAINT.roadOil, PAINT.lot, k + 360, ASPHALT, LIFT[1], 1.4);
  }
  for (let k = 0; k < 8; k++) {
    const x = -200 + 260 * hash2(k, 3, 351), z = TAPER_END - 80 - 900 * hash2(k, 4, 351);
    blot(b, x, z, (1.5 + 3.5 * hash2(k, 5, 351)) * FT, PAINT.wet, PAINT.lot, k + 370, ASPHALT, LIFT[0], 1.3);
  }
  for (let k = 0; k < 6; k++) {
    crack(b, -600 + 450 * hash2(k, 6, 352), TAPER_END - 100 - 1200 * hash2(k, 7, 352), (4 + 8 * hash2(k, 8, 352)) * FT, hash2(k, 9, 352) > 0.5 ? 'x' : 'z', k + 380, PAINT.tar, ASPHALT, LIFT[1], 1.2 * IN);
  }
}

/** The apron past the wash's left end: joints, tyre tracks into the bays, a wet sheen, stains. */
function apron(b: Bake) {
  for (let x = -880; x < BANK_END; x += 10 * FT) patch(b, x, x + 0.5 * IN, BANK_Z1 + 1, BANK_Z1 + 1500, PAINT.apronJoint, CONCRETE, LIFT[0]);
  for (let z = BANK_Z1 + 10 * FT; z < BANK_Z1 + 1500; z += 10 * FT) patch(b, -880, BANK_END, z, z + 0.5 * IN, PAINT.apronJoint, CONCRETE, LIFT[0]);
  for (const [z, seed] of [[BANK_Z1 + 180, 1], [BANK_Z1 + 300, 2]] as const) {
    for (const side of [-1, 1]) {
      const zz = z + side * 2.9 * FT;
      patch(b, -860, BANK_END - 4, zz - 4 * IN, zz + 4 * IN, mixHex(PAINT.apron, '#8f8c83', 0.35 + 0.1 * seed), CONCRETE, LIFT[1]);
    }
  }
  for (let k = 0; k < 10; k++) {
    blot(b, -700 + 650 * hash2(k, 1, 353), BANK_Z1 + 60 + 900 * hash2(k, 2, 353), (0.8 + 2.4 * hash2(k, 3, 353)) * FT, mixHex(PAINT.apron, PAINT.wet, 0.6), PAINT.apron, k + 390, CONCRETE, LIFT[2]);
  }
}

/** The far sidewalk: panel joints, the tree wells' dark soil, stains. */
function farSide(b: Bake) {
  const x0 = LANES.farCurb, x1 = FAR_FRONT;
  for (let z = -REACH; z < REACH; z += 5 * FT) patch(b, x0 + 0.6 * FT, x1, z, z + 0.4 * IN, PAINT.joint, CONCRETE, LIFT[0]);
  patch(b, x0, x0 + 0.5 * FT, -REACH, REACH, PAINT.curbTop, CONCRETE, LIFT[0]);
  for (const z of FAR_TREE_Z) patch(b, x0 + 2.5 * FT, x0 + 6.5 * FT, z - 2 * FT, z + 2 * FT, PAINT.soil, tag('soil'), LIFT[1]);
  for (let k = 0; k < 20; k++) {
    blot(b, x0 + (1 + 8 * hash2(k, 1, 354)) * FT, -3000 + 6000 * hash2(k, 2, 354), (0.4 + 1 * hash2(k, 3, 354)) * FT, mixHex(PAINT.stain, PAINT.crack, 0.25), PAINT.farSidewalk, k + 400, CONCRETE, LIFT[2]);
  }
}

/** Where the far sidewalk's trees stand (authored z), each in a well in the walk: palms at the ends, figs between (sunsetTrees.ts). */
export const FAR_TREE_Z = [-2300, -1500, -650, 500, 1350, 2100, 2800];

/* ----- The roof ----- */

/**
 * The roof deck: the cap sheet's laps every three feet, darker squares of newer patching, ponding stains toward
 * the back, and urethane scuffs along the approach where boards roll to the roof's end.
 */
function roof(b: Bake) {
  const ASPHALT = tag('stucco');
  for (let x = ROOF_BACK + 3 * FT; x < -0.5 * FT; x += 3 * FT) patch(b, x, x + 1.2 * IN, ROOF_Z0 + 0.3 * FT, ROOF_Z1 - 0.3 * FT, PAINT.roofLap, ASPHALT, LIFT[0]);
  for (let k = 0; k < 7; k++) {
    const x = ROOF_BACK + 60 + (-ROOF_BACK - 200) * hash2(k, 1, 355), z = ROOF_Z0 + 250 + (ROOF_Z1 - ROOF_Z0 - 400) * hash2(k, 2, 355);
    const s = (3 + 5 * hash2(k, 3, 355)) * FT;
    patch(b, x, x + s, z, z + s * (0.6 + 0.6 * hash2(k, 4, 355)), PAINT.roofPatch, ASPHALT, LIFT[1]);
  }
  for (let k = 0; k < 9; k++) {
    const x = ROOF_BACK + 90 + (-ROOF_BACK - 300) * hash2(k, 5, 356), z = ROOF_Z0 + 380 + (ROOF_Z1 - ROOF_Z0 - 450) * hash2(k, 6, 356);
    blot(b, x, z, (2 + 4 * hash2(k, 7, 356)) * FT, mixHex(PAINT.roofPond, PAINT.roofScuff, 0.4), PAINT.roof, k + 410, ASPHALT, LIFT[2], 1.3);
  }
  // Scuffs along the approach: the run-up follows -z about two authored feet in from the front edge.
  const line = -2 * F;
  for (let k = 0; k < 22; k++) {
    const x = line + (hash2(k, 8, 357) - 0.5) * 2.5 * FT;
    const z = ROOF_Z0 + 0.5 * FT + (30 * FT) * hash2(k, 9, 357);
    const length = (1.5 + 4 * hash2(k, 10, 357)) * FT;
    stroke(b, [x, z], [x + (hash2(k, 11, 357) - 0.5) * 0.4 * FT, Math.min(ROOF_Z1, z + length)], 0.7 * IN, mixHex(PAINT.roofScuff, '#5d5c58', 0.5 * hash2(k, 12, 357)), ASPHALT, LIFT[2]);
  }
}

/** Every level decal. */
export function buildSunsetWear(decals: Bake) {
  sidewalk(decals);
  road(decals);
  lot(decals);
  apron(decals);
  farSide(decals);
  roof(decals);
}

/* ----- Wear baked into faces ----- */

/** Painted-out tags and repairs on the bank: [z from, z to, x from, x to] in real feet, and fresh (1) or old (0). */
const BANK_PATCHES: ReadonlyArray<[number, number, number, number, number]> = [
  [-41, -33, 2.5, 8, 1], [-27, -22, 1, 5.5, 0], [-12, -4, 4, 10.5, 1], [6, 14, 0.8, 6, 0], [21, 30, 3, 9.5, 1],
  [38, 44, 1.5, 7, 0], [55, 66, 2, 8.5, 1], [74, 80, 4, 10, 0], [-35, -30, 8.5, 11, 0], [30, 36, 7, 10.8, 1],
];

/** Smooth 0 to 1 between edges `a` and `b`. */
const ramp = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The bank's paint at (x, z) authored: grey rolled over board-formed concrete, its ridges paler and furrows
 * darker in streaks down the fall line, patches of fresher or older grey where tags were painted out, drips
 * from the canopy's edge down the crest, wheel marks down the landing, and grime gathering over the toe. Baked
 * into the bank's own vertex colours.
 */
export function bankTone(x: number, z: number): string {
  const X = Math.max(0, x / FT), Z = z / FT;
  // Board-form streaks: thin ridges and furrows a few inches to a foot apart, running straight down the slope.
  const s = valueNoise(Z / 0.45, X / 14 + 3.1) * 0.65 + valueNoise(Z / 0.2 + 17, X / 9) * 0.35;
  let c = PAINT.bank as string;
  c = mixHex(c, PAINT.bankRidge, ramp(0.6, 0.8, s) * 0.5);
  c = mixHex(c, PAINT.bankFurrow, ramp(0.4, 0.22, s) * 0.45);
  // Broad tone drift over tens of feet, where coats were rolled on different days.
  c = mixHex(c, valueNoise(Z / 14 + 5, 1.7) > 0.5 ? PAINT.bankPatchOld : PAINT.bankPatch, 0.25 * Math.abs(valueNoise(Z / 14 + 5, 1.7) - 0.5) * 2);
  for (const [z0, z1, x0, x1, fresh] of BANK_PATCHES) {
    const inside = Math.min(ramp(z0 - 0.3, z0 + 0.3, Z), ramp(z1 + 0.3, z1 - 0.3, Z), ramp(x0 - 0.3, x0 + 0.3, X), ramp(x1 + 0.3, x1 - 0.3, X));
    if (inside > 0) c = mixHex(c, fresh ? PAINT.bankPatch : PAINT.bankPatchOld, 0.75 * inside);
  }
  // Drips off the canopy's edge, darkest at the crest, a few dozen down the frontage.
  const drip = ramp(0.7, 0.86, valueNoise(Z / 0.4 + 31, 2.2)) * ramp(4.5, 0, X) * (Z > -9 && Z < 88.5 ? 1 : 0.3);
  c = mixHex(c, PAINT.bankGrime, 0.3 * drip);
  // Wheel marks down the landing: thin dark streaks either side of the line.
  const landing = ramp(9, 4, Math.abs(Z - LANE_Z / FT)) * ramp(1.5, 3, X);
  const mark = ramp(0.8, 0.9, valueNoise(Z / 0.25 + 47, X / 8)) * landing;
  c = mixHex(c, PAINT.bankScuff, 0.25 * mark);
  // Chips knocked pale near the line, where trucks hang up.
  const chip = ramp(0.86, 0.93, valueNoise(Z / 0.35 + 61, X / 0.6)) * landing;
  c = mixHex(c, PAINT.bankChip, 0.7 * chip);
  // Grime over the toe and a foot up the face, its reach wandering along the frontage.
  const reach = 1.4 + 1.2 * valueNoise(Z / 4 + 9, 0.5);
  const grime = ramp(12 - reach, 12, X);
  return mixHex(c, PAINT.bankGrime, 0.6 * grime);
}

/**
 * The canopy fascia's paint at `z` along it (authored), `t` up it (0 its foot, 1 the coping): sage chalked
 * paler by the sun in broad panels, streaks run down from the coping where dirt washes off the roof, rust
 * bleeding from the panel fasteners, dirt along the drip band. Baked into the fascia's vertex colours.
 */
export function fasciaTone(z: number, t: number, panel = 12.5 * FT): string {
  const Z = z / FT;
  let c = mixHex(PAINT.sage, PAINT.sageChalk, 0.6 * valueNoise(Z / 7 + 2, 3.3) * (0.5 + 0.5 * t));
  // Streaks from the coping, longest under the panel joints.
  const seam = Math.abs(((z % panel) + panel) % panel - panel / 2) / (panel / 2);
  const streak = Math.max(ramp(0.72, 0.9, valueNoise(Z / 0.5 + 11, 7.1)), ramp(0.93, 1, seam) * 0.8);
  c = mixHex(c, PAINT.streak, 0.5 * streak * ramp(0.1, 0.9, t));
  const rust = ramp(0.97, 1, seam) * ramp(0.55, 0.9, t);
  c = mixHex(c, PAINT.rust, 0.35 * rust);
  return mixHex(c, PAINT.streak, 0.25 * ramp(0.25, 0, t));
}

/** The planter boards' tone: each six-inch board of the formwork a shade apart, dirtier toward the foot. */
export function boardTone(k: number, t: number): string {
  const c = mixHex(PAINT.planter, PAINT.planterBoard, hash2(k, 3, 360));
  return mixHex(c, PAINT.bankGrime, 0.35 * ramp(0.3, 0, t));
}
