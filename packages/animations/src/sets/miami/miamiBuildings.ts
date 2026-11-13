import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { ASPHALT, CONCRETE, F, GLASS, GRASS, METAL, STUCCO, UP, block, mixHex, part, poly, tube, type Plan } from './miamiKit';
import { MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y, MIAMI_WALL_X } from './miamiLayout';
import { MIAMI_PAINT as PAINT } from './miamiPalette';

/**
 * Triangle Bank's surroundings: a broad bay-front boulevard with its promenade, planted median and an elevated
 * guideway; the park's drive and car park; the bay behind the park with its seawall; and a generic downtown
 * skyline of stucco and glass towers. Generic Biscayne-style city fabric, not copies of particular buildings.
 */

const PLAZA = MIAMI_PLAZA_Y;
const H = MIAMI_PLAZA_HALF;
/** Floors that aren't the ground's stand this far proud of the park's grass, so they never fight it. */
const STAND_OFF = 1;
const TOWER = part(70, 'stucco', 1, 0.12);

/**
 * The boulevard runs north–south, parallel to the plaza's right-hand stepped side (the line bears 225°,
 * south-west, so `along` it is south and `across` it west, away from the park).
 */
const BLVD_ALONG: Plan = [Math.SQRT1_2, -Math.SQRT1_2];
const BLVD_ACROSS: Plan = [Math.SQRT1_2, Math.SQRT1_2];
/** The boulevard's cross-section, west of the deck's tip: its broad east promenade, kerb, median, far kerb and sidewalk. */
export const MIAMI_BOULEVARD = { sidewalk: 66 * F, kerb: 100 * F, median: 150 * F, medianEnd: 164 * F, farKerb: 212 * F, farEdge: 228 * F };
const BLVD = MIAMI_BOULEVARD;
const blvd = (along: number, across: number, y: number): Vec3 =>
  [BLVD_ALONG[0] * along + BLVD_ACROSS[0] * across, y, BLVD_ALONG[1] * along + BLVD_ACROSS[1] * across];
/** A point on the boulevard: `along` it (south is +), `across` west from the deck's tip. */
export const miamiBoulevard = (along: number, across: number): Vec3 => blvd(along, across, PLAZA);
/** The boulevard's heading in a car's yaw (degrees about up, 0 = +x): southbound. */
export const MIAMI_SOUTHBOUND = 45;

/** A palm to plant (miamiTrees.ts's palm), where the surroundings call for one. */
export interface PalmSpot { at: Vec3; height: number; kind: 'date' | 'royal' | 'coconut'; seed: number }

/**
 * The boulevard: the promenade's pavers, six lanes either side of the planted median, the far sidewalk, lane
 * lines, a crosswalk, street lights and the guideway on its columns. Returns the royal palms down the
 * promenade and the median, for the scene to plant.
 */
export function buildBoulevard(props: Bake): PalmSpot[] {
  const y = PLAZA + STAND_OFF;
  const strip = (a: number, c: number, from: number, to: number, height: number, color: string, ink = CONCRETE) =>
    poly(props, [blvd(a, from, height), blvd(c, from, height), blvd(c, to, height), blvd(a, to, height)], UP, color, ink);
  const L0 = -900 * F, L1 = 900 * F;
  const kerbY = PLAZA + 0.35 * F, medianY = PLAZA + 0.5 * F;
  const west: Vec3 = [BLVD_ACROSS[0], 0, BLVD_ACROSS[1]], east: Vec3 = [-west[0], 0, -west[2]];
  const step = (across: number, low: number, high: number, out: Vec3) =>
    poly(props, [blvd(L0, across, low), blvd(L1, across, low), blvd(L1, across, high), blvd(L0, across, high)], out, PAINT.kerb);
  strip(L0, L1, BLVD.sidewalk, BLVD.kerb, kerbY, PAINT.sidewalk);
  step(BLVD.sidewalk, PLAZA, kerbY, east);
  step(BLVD.kerb, y, kerbY, west);
  // The road in lengths, each its own grey: resurfaced in patches over the years.
  for (let a = L0; a < L1; a += 150 * F) {
    const k = Math.round(a / (150 * F));
    strip(a, a + 150 * F, BLVD.kerb, BLVD.farKerb, y, mixHex(PAINT.asphalt, PAINT.asphaltWorn, hash2(k, 1, 801) * 0.8), ASPHALT);
  }
  strip(L0, L1, BLVD.median, BLVD.medianEnd, medianY, PAINT.median, GRASS);
  step(BLVD.median, y, medianY, east);
  step(BLVD.medianEnd, y, medianY, west);
  strip(L0, L1, BLVD.farKerb, BLVD.farEdge + 400 * F, kerbY, PAINT.sidewalk);
  step(BLVD.farKerb, y, kerbY, east);
  // Joints across the promenade.
  for (let a = L0; a < L1; a += 12 * F) strip(a, a + 0.3 * F, BLVD.sidewalk, BLVD.kerb, kerbY + 0.4, mixHex(PAINT.sidewalk, '#9c978a', 0.5));
  // Lane lines: dashed whites between the lanes, double yellow along the median, wheel paths darker.
  for (const lane of [BLVD.kerb + 12.5 * F, BLVD.kerb + 25 * F, BLVD.kerb + 37.5 * F, BLVD.medianEnd + 12 * F, BLVD.medianEnd + 24 * F, BLVD.medianEnd + 36 * F]) {
    for (let a = L0; a < L1; a += 40 * F) strip(a, a + 10 * F, lane - 0.25 * F, lane + 0.25 * F, y + 0.4, PAINT.laneWhite);
  }
  for (const edge of [BLVD.median - 1.2 * F, BLVD.medianEnd + 1.2 * F]) strip(L0, L1, edge - 0.2 * F, edge + 0.2 * F, y + 0.4, PAINT.laneYellow);
  for (const wheel of [3.5, 9, 16, 21.5, 28.5, 34, 41, 46.5]) {
    for (const base of [BLVD.kerb, BLVD.medianEnd]) {
      if (base === BLVD.medianEnd && wheel > 34) continue;
      strip(L0, L1, base + (wheel - 1) * F, base + (wheel + 1) * F, y + 0.25, mixHex(PAINT.asphalt, '#3d3f3c', 0.35), ASPHALT);
    }
  }
  // A crosswalk south of the park, at the car park's entrance, worn through where the tyres run.
  for (let across = BLVD.kerb + 1.5 * F; across < BLVD.farKerb - 2 * F; across += 6.4 * F) {
    if (across > BLVD.median - 3 * F && across < BLVD.medianEnd) continue;
    strip(150 * F, 162 * F, across, across + 3.2 * F, y + 0.5, mixHex(PAINT.laneWhite, PAINT.asphalt, 0.18 * hash2(Math.round(across), 2, 802)));
  }
  // The guideway: a pale box girder on hammerhead columns along the far side.
  const g = BLVD.farEdge - 7 * F;
  const deck0 = PLAZA + 22 * F, deck1 = PLAZA + 27 * F;
  const GIRDER = part(72, 'concrete', 1, 0.12);
  for (const [w, sign] of [[g - 4 * F, -1], [g + 4 * F, 1]] as const) {
    const out: Vec3 = [BLVD_ACROSS[0] * sign, 0, BLVD_ACROSS[1] * sign];
    poly(props, [blvd(L0, w, deck0), blvd(L1, w, deck0), blvd(L1, w, deck1), blvd(L0, w, deck1)], out, sign < 0 ? PAINT.guideway : PAINT.guidewayShade, GIRDER);
    // A parapet and a grime line along the girder's foot.
    poly(props, [blvd(L0, w + sign * 0.5, deck0), blvd(L1, w + sign * 0.5, deck0), blvd(L1, w + sign * 0.5, deck0 + 0.8 * F), blvd(L0, w + sign * 0.5, deck0 + 0.8 * F)], out, mixHex(PAINT.guideway, '#8d8c84', 0.35));
  }
  poly(props, [blvd(L0, g - 4 * F, deck0), blvd(L1, g - 4 * F, deck0), blvd(L1, g + 4 * F, deck0), blvd(L0, g + 4 * F, deck0)], [0, -1, 0], PAINT.guidewayShade, GIRDER);
  poly(props, [blvd(L0, g - 4 * F, deck1), blvd(L1, g - 4 * F, deck1), blvd(L1, g + 4 * F, deck1), blvd(L0, g + 4 * F, deck1)], UP, PAINT.roof, GIRDER);
  for (let a = -600 * F; a <= 600 * F; a += 95 * F) {
    const c = blvd(a, g, PLAZA);
    props.frustum(c[0], c[2], PLAZA, deck0 - 3 * F, 2.2 * F, 1.8 * F, { color: PAINT.guideway }, GIRDER);
    props.frustum(c[0], c[2], deck0 - 3 * F, deck0, 2.6 * F, 4.4 * F, { color: PAINT.guideway }, GIRDER);
  }
  // Street lights down the promenade: grey poles, a mast arm over the kerb lane.
  for (let k = 0; k < 8; k++) {
    const base = blvd((-130 + k * 42 + 21) * F, BLVD.kerb - 2 * F, kerbY);
    const head = blvd((-130 + k * 42 + 21) * F, BLVD.kerb + 4 * F, PLAZA + 28 * F);
    const top: Vec3 = [base[0], PLAZA + 29 * F, base[2]];
    tube(props, [base, top, head], 0.3 * F, PAINT.pole, METAL, 8);
    block(props, head[0] - 0.9 * F, head[0] + 0.9 * F, head[1] - 0.6 * F, head[1], head[2] - 0.6 * F, head[2] + 0.6 * F, PAINT.lampHead, PAINT.lampHead, METAL);
  }
  // Royal palms down the promenade and the median.
  const palms: PalmSpot[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (-150 + k * 42) * F;
    palms.push({ at: blvd(a, BLVD.kerb - 6 * F, kerbY), height: (52 + hash2(k, 1, 601) * 14) * F, kind: 'royal', seed: k + 100 });
    if (k % 2 === 0) palms.push({ at: blvd(a + 21 * F, (BLVD.median + BLVD.medianEnd) / 2, medianY), height: (48 + hash2(k, 2, 602) * 12) * F, kind: 'royal', seed: k + 120 });
  }
  return palms;
}

/* ----- The car park ----- */

/** In the frame of the plaza's left side: `s` along it, `o` out from it. */
const lot = (s: number, o: number, y: number): Vec3 => [MIAMI_WALL_X + Math.SQRT1_2 * (s + o), y, -H + Math.SQRT1_2 * (s - o)];

/** Where the car park's stalls are, for the parked cars: along the plaza's left side, nose in. */
export function miamiParkingStall(k: number): Vec3 {
  return lot((-31.5 + k * 9) * F, 31 * F, PLAZA);
}

/** The park's south drive and its car park, beyond the plaza's stepped planters on the left: asphalt, stalls, oil, lamps. */
export function buildParking(props: Bake) {
  const y = PLAZA + STAND_OFF;
  const quad = (s0: number, s1: number, o0: number, o1: number, height: number, color: string, ink = ASPHALT) =>
    poly(props, [lot(s0, o0, height), lot(s1, o0, height), lot(s1, o1, height), lot(s0, o1, height)], UP, color, ink);
  quad(-40 * F, 105 * F, 22 * F, 62 * F, y, PAINT.asphalt);
  quad(-40 * F, 105 * F, 16 * F, 22 * F, y + 0.35 * F, PAINT.sidewalk, CONCRETE);
  // Stall lines, square to the drive, faded.
  for (let s = -36 * F; s < 100 * F; s += 9 * F) quad(s, s + 0.35 * F, 22 * F, 40 * F, y + 0.4, mixHex(PAINT.laneWhite, PAINT.asphalt, 0.25));
  quad(-40 * F, 105 * F, 39.8 * F, 40.2 * F, y + 0.4, mixHex(PAINT.laneWhite, PAINT.asphalt, 0.25));
  // Oil where cars stand, and a darker drip line down the middle of each stall.
  for (let k = 0; k < 15; k++) {
    const s = (-31.5 + k * 9) * F, o = (31 + (hash2(k, 1, 811) - 0.5) * 3) * F;
    const r = (1 + hash2(k, 2, 811)) * F;
    quad(s - r, s + r, o - r * 0.8, o + r * 0.8, y + 0.25, mixHex(PAINT.asphalt, PAINT.oil, 0.45));
  }
  // Lamp posts on the kerb.
  for (let s = -30 * F; s < 100 * F; s += 40 * F) {
    const base = lot(s, 20 * F, PLAZA + 0.35 * F);
    tube(props, [base, [base[0], PLAZA + 18 * F, base[2]]], 0.25 * F, PAINT.pole, METAL, 8);
    block(props, base[0] - 0.8 * F, base[0] + 0.8 * F, PLAZA + 18 * F, PLAZA + 18.6 * F, base[2] - 0.8 * F, base[2] + 0.8 * F, PAINT.lampHead, PAINT.lampHead, METAL);
  }
}

/* ----- The bay ----- */

/** Due east in plan (the line bears 225°): the bay lies this way, past the park. */
const EAST: Plan = [-Math.SQRT1_2, -Math.SQRT1_2];
/** The seawall's distance east of the deck's tip. */
const SEAWALL = 640 * F;

/**
 * Biscayne Bay behind the park: a pale seawall with its railing and promenade, the water out to the horizon,
 * and a low wooded shore far across it.
 */
export function buildBay(props: Bake) {
  const north: Plan = [-EAST[1], EAST[0]];
  const p = (e: number, n: number, y: number): Vec3 => [EAST[0] * e + north[0] * n, y, EAST[1] * e + north[1] * n];
  const N0 = -1600 * F, N1 = 1600 * F;
  const walk = PLAZA + 1.5 * F;
  const level = (e0: number, e1: number, y: number, color: string, ink = CONCRETE) => poly(props, [p(e0, N0, y), p(e1, N0, y), p(e1, N1, y), p(e0, N1, y)], UP, color, ink);
  level(SEAWALL - 30 * F, SEAWALL, walk, PAINT.seawall);
  const out: Vec3 = [EAST[0], 0, EAST[1]];
  poly(props, [p(SEAWALL, N0, PLAZA + 0.5 * F), p(SEAWALL, N1, PLAZA + 0.5 * F), p(SEAWALL, N1, walk), p(SEAWALL, N0, walk)], out, mixHex(PAINT.seawall, '#7f7b70', 0.3));
  // The water a little below the walk, paler toward the horizon, and the far shore.
  level(SEAWALL, SEAWALL + 900 * F, PLAZA + 0.6 * F, PAINT.bay, GLASS);
  level(SEAWALL + 900 * F, SEAWALL + 2600 * F, PLAZA + 0.6 * F, PAINT.bayFar, GLASS);
  for (let k = 0; k < 18; k++) {
    const n0 = N0 + (k / 18) * (N1 - N0), n1 = n0 + (N1 - N0) / 18;
    const h = (14 + 18 * hash2(k, 1, 821)) * F;
    const e = SEAWALL + 2600 * F;
    poly(props, [p(e, n0, PLAZA), p(e, n1, PLAZA), p(e, n1, PLAZA + h), p(e, n0, PLAZA + h * 0.8)], [-EAST[0], 0, -EAST[1]], mixHex('#5d7352', '#9fb0a6', 0.55));
  }
  // The railing along the seawall: two rails (its posts are lost at this distance).
  const rail = (n0: number, n1: number, y: number) => tube(props, [p(SEAWALL - 1 * F, n0, y), p(SEAWALL - 1 * F, n1, y)], 0.08 * F, PAINT.railing, METAL, 6);
  rail(N0, N1, walk + 3.4 * F);
  rail(N0, N1, walk + 1.8 * F);
}

/* ----- Downtown ----- */

/** A high-rise beside the boulevard: a glass-fronted podium, a rendered tower banded with glass each floor (deeper on a glassier one), red balcony fronts where it has them, and a plant room on its roof. */
function tower(b: Bake, foot: Vec3, width: number, depth: number, height: number, color: string, glass: string, red: string | null, glassy: boolean) {
  const along: Vec3 = [BLVD_ALONG[0], 0, BLVD_ALONG[1]], across: Vec3 = [BLVD_ACROSS[0], 0, BLVD_ACROSS[1]];
  const p = (s: number, d: number, y: number): Vec3 => [foot[0] + along[0] * s + across[0] * d, y, foot[2] + along[2] * s + across[2] * d];
  const w = width / 2, y0 = foot[1], y1 = foot[1] + height;
  const faces: Array<[Vec3, Vec3, Vec3]> = [
    [p(-w, 0, y0), p(w, 0, y0), [-across[0], 0, -across[2]]],
    [p(w, 0, y0), p(w, depth, y0), along],
    [p(-w, depth, y0), p(-w, 0, y0), [-along[0], 0, -along[2]]],
  ];
  const floor = 11 * F;
  // The podium: two storeys of shopfront glass under a concrete band.
  const podium = y0 + 2 * floor;
  for (const [a, c, n] of faces) {
    poly(b, [a, c, [c[0], podium, c[2]], [a[0], podium, a[2]]], n, mixHex(glass, '#2c3438', 0.4), GLASS);
    // A wall of render, and each floor a band of glass (or a red balcony front): deep bands on a glassier
    // tower, its spandrels pale; narrower ribbons on a rendered one. Glass in bands, never a whole face, so its
    // reflection reads as floors rather than one cloudy sheet.
    poly(b, [[a[0], podium, a[2]], [c[0], podium, c[2]], [c[0], y1, c[2]], [a[0], y1, a[2]]], n, glassy ? mixHex(color, '#b9c2c4', 0.4) : color, TOWER);
    const o: Vec3 = [n[0] * 2, 0, n[2] * 2];
    const band = glassy ? 0.72 : 0.45;
    for (let y = podium + 0.5 * floor * (1 - band); y < y1 - floor; y += floor) {
      const balcony = red && Math.floor((y - y0) / floor) % 2 === 0;
      poly(b, [[a[0] + o[0], y, a[2] + o[2]], [c[0] + o[0], y, c[2] + o[2]], [c[0] + o[0], y + floor * band, c[2] + o[2]], [a[0] + o[0], y + floor * band, a[2] + o[2]]],
        n, balcony ? red : glass, balcony ? STUCCO : GLASS);
    }
  }
  poly(b, [p(-w, 0, y1), p(w, 0, y1), p(w, depth, y1), p(-w, depth, y1)], UP, PAINT.roof, TOWER);
  // A plant room on the roof.
  const r = Math.min(w, depth / 2) * 0.5;
  const c = p(0, depth / 2, y1);
  block(b, c[0] - r, c[0] + r, y1, y1 + 1.6 * floor, c[2] - r, c[2] + r, mixHex(color, '#9a9b95', 0.3), PAINT.roof, TOWER);
}

/**
 * Downtown across the boulevard: a wall of towers, render and banded glass, one or two with red balcony fronts;
 * and a broad rounded hotel tower off to the south-east, behind the left of the deck.
 */
export function buildSkyline(props: Bake) {
  const towers: Array<[number, number, number, boolean, boolean]> = [
    [-420, 70, 380, false, false], [-310, 80, 300, true, false], [-200, 75, 460, false, true],
    [-90, 60, 260, false, false], [10, 85, 520, false, true], [130, 70, 330, false, false],
    [240, 90, 400, true, false], [360, 70, 290, false, false], [470, 80, 450, false, true],
    [590, 75, 340, false, false],
  ];
  towers.forEach(([a, w, h, red, glassy], i) => {
    const back = BLVD.farEdge + 30 * F + hash2(a, 1, 701) * 40 * F;
    const color = PAINT.towers[i % PAINT.towers.length], glass = PAINT.towerGlass[i % PAINT.towerGlass.length];
    tower(props, blvd(a * F, back, PLAZA), w * F, (w * 0.8 + hash2(a, 2, 702) * 30) * F, h * F, color, glass, red ? PAINT.balconyRed : null, glassy);
  });
  // The rounded tower: an elongated drum, ribbon windows round it.
  const cx = -184 * F, cz = -443 * F, rx = 70 * F, rz = 44 * F, height = 400 * F;
  const sides = 24;
  for (let k = 0; k < sides; k++) {
    const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
    const at = (a: number, y: number, grow = 0): Vec3 => [cx + Math.cos(a) * (rx + grow), y, cz + Math.sin(a) * (rz + grow)];
    const n: Vec3 = [Math.cos((a0 + a1) / 2) / rx, 0, Math.sin((a0 + a1) / 2) / rz];
    const m = Math.hypot(n[0], n[2]);
    const nn: Vec3 = [n[0] / m, 0, n[2] / m];
    poly(props, [at(a0, PLAZA), at(a1, PLAZA), at(a1, PLAZA + height), at(a0, PLAZA + height)], nn, PAINT.towers[1], TOWER);
    for (let y = PLAZA + 20 * F; y < PLAZA + height - 10 * F; y += 11 * F) {
      poly(props, [at(a0, y, 2), at(a1, y, 2), at(a1, y + 5 * F, 2), at(a0, y + 5 * F, 2)], nn, PAINT.towerGlass[2], GLASS);
    }
  }
  poly(props, Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, PLAZA + height, cz + Math.sin(a) * rz] as Vec3;
  }), UP, PAINT.roof, TOWER);
}
