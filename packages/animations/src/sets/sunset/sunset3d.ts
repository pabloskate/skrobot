import type { BufferGeometry } from 'three';
import type { Vec3 } from '../../camera/view';
import { Bake, type Ink } from '../../three/bake';
import { ClassicSpot3D } from '../classicSpot3d';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import type { Canopy, ContactLine, SpotLook } from '../surfaces';
import { CAP_BACK, backdrop, billboard, canopy, hills, houses, miniMall, storefronts, washBuilding } from './sunsetBuildings';
import { hedge, oleanderMound, oleanderTree } from './sunsetDetails';
import {
  BANK_END, BANK_START, BANK_TOP, BANK_Z0, BANK_Z1, BAY_FLOOR, CHAIN_LINK, F, FAR_FRONT, FT, LANE_Z, LOWER, PAVING, ROAD,
  ROOF_BACK, ROOF_Z0, ROOF_Z1, SCALE, SIDEWALK_END, TAPER_END, TOE_START,
  bankSlope, bankY, floor, mixHex, part, solidBox, tag, toneWall, toWorld, type PavingKind, type RailShadow, type ShadowBox,
} from './sunsetKit';
import * as layout from './sunsetLayout';
import { SUNSET_PAINT as PAINT } from './sunsetPalette';
import { buildSunsetStreetscape } from './sunsetStreetscape';
import { SUNSET_CARS, SUNSET_TREES, sunsetCanopies } from './sunsetTrees';
import { bankTone, boardTone, buildSunsetWear } from './sunsetWear';

/**
 * Los Angeles' hazy afternoon on Sunset Boulevard, warmer and thicker than Carlsbad's (the Skate Sonr
 * photograph in hard sun, the 2019 cover in late light): the realistic look, with the boulevard's asphalt,
 * gum on the sidewalk, the wash building's painted block and a few brick shopfronts across the street.
 */
export const SUNSET_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  haze: { color: '#d7d5cb', from: 60, to: 900, amount: 0.5 },
  // Urethane marks where boards roll out down the sidewalk below the landing, in feet.
  marks: [{ x: [12.3, 19.4], z: [-23, -13] }],
  markDepth: 0.12,
  gum: 3,
  // Painted block: joints a shade under the wash building's cream.
  mortar: '#b3ad9c',
  // Common brick on the shopfronts that have it, 8 x 2 1/4 in on 3/8 in joints.
  brick: { length: 8 / 12, height: 2.25 / 12, joint: 0.375 / 12, mortar: PAINT.mortar, paint: PAINT.brick, spread: 0.1 },
  // Sun-faded boulevard asphalt, its stones showing.
  asphalt: { scale: 0.03, contrast: 0.15 },
  foliage: true,
  sash: undefined,
};

/** The bank's face, unoutlined painted render: the tests find the riding profile by this ink (id 0, solid 17). */
export const BANK_INK: Ink = tag('stucco');
const BANK_SIDE = tag('stucco', 86);
const CONCRETE = tag('concrete');
const ASPHALT = tag('asphalt');
const SOIL = tag('soil');

/** Each paving's surface and paint; the default, past every patch, is the boulevard's asphalt. */
const PAVED: Record<Exclude<PavingKind, 'bank'> | 'road', [Ink, string]> = {
  sidewalk: [CONCRETE, PAINT.sidewalk],
  farSidewalk: [CONCRETE, PAINT.farSidewalk],
  apron: [CONCRETE, PAINT.apron],
  lot: [ASPHALT, PAINT.lot],
  road: [ASPHALT, PAINT.road],
};

/**
 * The level ground: one floor per cell of the paving's grid, the sidewalks, apron and lot at street level and
 * the boulevard a fraction under them. Almost coplanar overlapping floors lose depth precision at street-level
 * camera angles, so each cell is laid once; the bank's own cells are left to the bank.
 */
function paving(ground: Bake) {
  const xs = [...new Set([-24000, 24000, ...PAVING.flatMap((p) => [p.x0, p.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([-24000, 24000, ...PAVING.flatMap((p) => [p.z0, p.z1])])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      const patch = PAVING.find((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
      if (patch?.kind === 'bank') continue;
      const [ink, color] = PAVED[patch?.kind ?? 'road'];
      floor(ground, xs[i], xs[i + 1], zs[j], zs[j + 1], patch ? LOWER : ROAD, color, ink);
    }
  }
}

/** The roof deck: the riding approach, its front edge the takeoff, a fine-grained cap sheet laid flush (the laps and scuffs are decals). */
function roofDeck(ground: Bake) {
  floor(ground, ROOF_BACK, 0, ROOF_Z0, ROOF_Z1, 0, PAINT.roof, tag('stucco', 89));
}

/** Columns along the frontage: close where the cameras look at the landing, wider toward the far end. */
function bankColumns(): number[] {
  const fine0 = Math.max(BANK_Z0, LANE_Z - 30 * FT), fine1 = LANE_Z + 25 * FT;
  const zs = new Set<number>([BANK_Z0, BANK_Z1]);
  const span = (a: number, b: number, step: number) => { const n = Math.max(1, Math.round((b - a) / step)); for (let k = 0; k <= n; k++) zs.add(a + ((b - a) * k) / n); };
  if (fine0 > BANK_Z0) span(BANK_Z0, fine0, 1.2 * FT);
  span(fine0, fine1, 0.4 * FT);
  span(fine1, BANK_Z1, 1.2 * FT);
  return [...zs].sort((a, b) => a - b);
}

/** Rows down the fall line: the straight face, then sixteen through the rounded toe. */
function bankRows(): number[] {
  const rows = [];
  for (let i = 0; i <= 8; i++) rows.push(BANK_START + ((TOE_START - BANK_START) * i) / 8);
  for (let i = 1; i <= 16; i++) rows.push(TOE_START + ((BANK_END - TOE_START) * i) / 16);
  return rows;
}

/**
 * The bank: one profile for the whole frontage and the open landing past the roof's end, crest six feet under
 * the roof, smooth normals down its fall, its paint and wear in its vertex colours (`bankTone`); the tapered
 * right-hand end beside the lot, and the left end's face over the apron.
 */
function bank(ground: Bake) {
  const xs = bankRows(), zs = bankColumns();
  const vertex = (x: number, z: number, ink: Ink, color = bankTone(x, z)) => {
    const slope = bankSlope(x), length = Math.hypot(slope, 1);
    ground.vertex([x, bankY(x), z], [-slope / length, 1 / length, 0], { color }, ink);
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const [a, b, z0, z1] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
      for (const [x, z] of [[a, z1], [b, z1], [b, z0], [a, z1], [b, z0], [a, z0]]) vertex(x, z, BANK_INK);
    }
  }
  // The right-hand end tapers down beside the lot, outside the rider's route.
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    const p0: Vec3 = [a, bankY(a), BANK_Z0], p1: Vec3 = [b, bankY(b), BANK_Z0], p2: Vec3 = [b, LOWER, TAPER_END], p3: Vec3 = [a, LOWER, TAPER_END];
    const mid = (a + b) / 2;
    const gradient = -(bankY(mid) - LOWER) / (TAPER_END - BANK_Z0);
    const length = Math.hypot(bankSlope(mid), 1, gradient);
    const n: Vec3 = [-bankSlope(mid) / length, 1 / length, -gradient / length];
    const top = bankTone(mid, BANK_Z0 - 4 * FT), foot = mixHex(top, PAINT.bankGrime, 0.4);
    ground.quadCorners(p0, p1, p2, p3, n, [{ color: top }, { color: top }, { color: foot }, { color: foot }], BANK_SIDE);
  }
  // The taper's back, facing the shoulder, and the left end's upright face over the apron.
  ground.quad([BANK_START, LOWER, TAPER_END], [BANK_START, LOWER, BANK_Z0], [BANK_START, BANK_TOP, BANK_Z0], [BANK_START, LOWER, TAPER_END], [-1, 0, 0], { color: PAINT.capWall }, BANK_SIDE);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1];
    ground.quadCorners([b, LOWER, BANK_Z1], [a, LOWER, BANK_Z1], [a, bankY(a), BANK_Z1], [b, bankY(b), BANK_Z1], [0, 0, 1],
      [{ color: PAINT.bankGrime }, { color: PAINT.bankGrime }, { color: PAINT.bankEnd }, { color: PAINT.bankEnd }], part(88, 'stucco', 3));
  }
}

/** How far back the shoulders either side of the canopy run behind the crest. */
const SHOULDER_BACK = -430;
/** The clipped hedge along the right-hand shoulder's outer edge, past the bank's end: its line (z) and half-width. */
export const HEDGE_Z = BANK_Z0 + 2.2 * FT, HEDGE_HALF = 1.6 * FT;

/**
 * The shoulders either side of the canopy, behind the crest: bare concrete at the crest's height, as the
 * frames show the top past the canopy's ends, with painted retaining walls down to the street. Nothing grows
 * at the crest. Past the bank's right-hand end a clipped hedge runs along the shoulder's outer edge, with tall
 * figs standing over it (`SUNSET_TREES`), the green the street views show beyond the bank's end.
 */
function shoulders(ground: Bake, props: Bake) {
  const wall = (s: number, t: number) => mixHex(PAINT.capWall, PAINT.bankGrime, 0.45 * Math.max(0, 1 - t / 0.25) + 0.1 * Math.sin(s / 37));
  for (const [z0, z1, outer] of [[BANK_Z0, ROOF_Z0, -1], [ROOF_Z1, BANK_Z1, 1]] as const) {
    floor(ground, SHOULDER_BACK, BANK_START, z0, z1, BANK_TOP, PAINT.cap, CONCRETE);
    const zo = outer < 0 ? z0 : z1;
    toneWall(props, [SHOULDER_BACK, zo], [BANK_START, zo], LOWER, BANK_TOP, [0, 0, outer], 3 * FT, [0, 0.25, 1], wall, part(90, 'stucco', 3));
    toneWall(props, [SHOULDER_BACK, z0], [SHOULDER_BACK, z1], LOWER, BANK_TOP, [-1, 0, 0], 3 * FT, [0, 0.25, 1], wall, part(96, 'stucco', 3));
  }
  // Where the bays' floor stands over the street, its plinth's ends face the shoulders and the lot.
  solidBox(props, [ROOF_BACK + 5, LOWER, ROOF_Z0], [SHOULDER_BACK, BAY_FLOOR - 6, ROOF_Z1], PAINT.capWall, PAINT.capWall, tag('stucco'), 'fk');
  // The hedge stops well short of the crest, so it never hangs over the bank.
  hedge(props, SHOULDER_BACK + 1 * FT, BANK_START - 4 * FT, HEDGE_Z, HEDGE_HALF, 6.5 * FT, BANK_TOP, 27);
}

/** The three box planters on the frontage, left of the landing, their fronts close to the sidewalk. */
export const PLANTER_Z = [400, 575, 1320] as const;
const PLANTER_X0 = BANK_END - 105, PLANTER_X1 = BANK_END - 13, PLANTER_TOP = LOWER + 86;
/** The tall oleander at the corner by the landing, on the bank's face: x, z authored. */
export const CORNER_OLEANDER = [BANK_END - 77, ROOF_Z0 + 106] as const;

/**
 * The planters punctured into the bank (the Skate Sonr photograph): board-formed concrete boxes, each six-inch
 * board of the formwork its own shade (`boardTone`), a cap round the rim, soil, and oleanders clipped into a
 * mound; the tall oleander at the corner by the landing (the 2019 cover).
 */
function planters(props: Bake, boxes: ShadowBox[]) {
  PLANTER_Z.forEach((z, i) => {
    const [x0, x1, top] = [PLANTER_X0, PLANTER_X1, PLANTER_TOP];
    // Six-inch boards, counted along the face.
    const board = (s: number, t: number) => boardTone(Math.floor(s / (0.5 * FT)) + i * 31, t);
    const ink = part(160 + i * 4, 'concrete', 3);
    toneWall(props, [x1, z + 54], [x1, z - 54], LOWER + 2, top, [1, 0, 0], 0.5 * FT, [0, 0.3, 1], board, ink);
    toneWall(props, [x0, z - 54], [x1, z - 54], LOWER + 2, top, [0, 0, -1], 0.5 * FT, [0, 0.3, 1], board, { ...ink, id: ink.id + 1 });
    toneWall(props, [x1, z + 54], [x0, z + 54], LOWER + 2, top, [0, 0, 1], 0.5 * FT, [0, 0.3, 1], board, { ...ink, id: ink.id + 2 });
    solidBox(props, [x0 - 1, top, z - 55], [x1 + 1, top + 3, z + 55], PAINT.planterCap, PAINT.planterCap, { ...ink, id: ink.id + 3 }, 'tfke');
    floor(props, x0 + 6, x1 - 6, z - 48, z + 48, top + 1, PAINT.soil, SOIL);
    oleanderMound(props, (x0 + x1) / 2, top + 1, z, 2.8 * FT, 3.4 * FT, 3.6 * FT, i + 1);
    boxes.push({ min: [x0, LOWER, z - 54], max: [x1, top + 3, z + 54] });
  });
  oleanderTree(props, CORNER_OLEANDER[0], bankY(CORNER_OLEANDER[0]), CORNER_OLEANDER[1], 7.5 * FT, 4.2 * FT, 20);
}

/**
 * Contact darkening (the look's lines): along the bank's foot and each planter's, the bays' back wall and the
 * cap's, the shoulder's outer wall, the houses, the mini-mall and the shopfronts across the street, and the curb.
 */
function contacts(): ContactLine[] {
  const lines: ContactLine[] = [
    { a: [BANK_END, LOWER, BANK_Z0], b: [BANK_END, LOWER, BANK_Z1], reach: 0.8 * F, strength: 0.18 },
    ...PLANTER_Z.map((z) => ({ a: [PLANTER_X1, LOWER, z - 54] as Vec3, b: [PLANTER_X1, LOWER, z + 54] as Vec3, reach: 0.9 * F, strength: 0.3 })),
    { a: [ROOF_BACK + 5, BAY_FLOOR, ROOF_Z0], b: [ROOF_BACK + 5, BAY_FLOOR, ROOF_Z1], reach: 1.4 * F, strength: 0.3 },
    { a: [CAP_BACK, BAY_FLOOR, ROOF_Z0], b: [CAP_BACK, BAY_FLOOR, ROOF_Z1], reach: 1 * F, strength: 0.28 },
    { a: [SHOULDER_BACK, LOWER, BANK_Z0], b: [BANK_START, LOWER, BANK_Z0], reach: 1 * F, strength: 0.28 },
    { a: [-555, LOWER, BANK_Z0 - 200], b: [-555, LOWER, ROOF_Z0 - 24], reach: 1.2 * F, strength: 0.3 },
    { a: [-140, LOWER, -3000], b: [-140, LOWER, -2560], reach: 1.2 * F, strength: 0.3 },
    { a: [FAR_FRONT, LOWER, -3400], b: [FAR_FRONT, LOWER, 3400], reach: 1 * F, strength: 0.3 },
    { a: [SIDEWALK_END, ROAD, -3400], b: [SIDEWALK_END, ROAD, 3400], reach: 0.5 * F, strength: 0.22 },
  ];
  return lines.map((c) => ({ ...c, a: toWorld(c.a), b: toWorld(c.b), reach: c.reach * SCALE }));
}

export interface SunsetBuilt {
  ground: BufferGeometry;
  props: BufferGeometry;
  decals: BufferGeometry;
  wireMesh: typeof CHAIN_LINK & { geometry: BufferGeometry };
  railSegments: RailShadow[];
  shadowBoxes: ShadowBox[];
  contacts: ContactLine[];
  canopies: Canopy[];
}

/**
 * Roof to Bank: the established riding surfaces (the roof deck, the bank's single profile) under the realistic
 * look, with an unbranded sage and cream canopy, the wash and its neighbours, and Sunset Boulevard. Authored at
 * 1/SUNSET_SCALE and baked to world size; physics uses the layout's world dimensions directly and the rider is
 * never scaled. Historical research in docs/SUNSET_REFERENCE.md; business signs and badges are not reproduced.
 */
export function buildSunsetGeometry(): SunsetBuilt {
  const ground = new Bake();
  const props = new Bake();
  const decals = new Bake();
  const mesh = new Bake();
  const rails: RailShadow[] = [];
  const boxes: ShadowBox[] = [];
  paving(ground);
  roofDeck(ground);
  bank(ground);
  shoulders(ground, props);
  planters(props, boxes);
  canopy(props, rails, boxes);
  washBuilding(props, boxes);
  houses(props, boxes);
  billboard(props, rails, boxes);
  miniMall(props);
  storefronts(props);
  backdrop(props);
  hills(props);
  buildSunsetStreetscape(props, mesh, rails);
  buildSunsetWear(decals);
  const world = (g: BufferGeometry) => g.scale(SCALE, SCALE, SCALE);
  // The corner oleander's crown dapples the bank beside the landing, ahead of the street trees'.
  const oleander: Canopy = { at: toWorld([CORNER_OLEANDER[0], bankY(CORNER_OLEANDER[0]) + 4.5 * FT, CORNER_OLEANDER[1]]), radius: 3.8 * FT * SCALE };
  return {
    ground: world(ground.geometry()),
    props: world(props.geometry()),
    decals: world(decals.geometry()),
    wireMesh: { ...CHAIN_LINK, geometry: world(mesh.geometry()) },
    railSegments: rails.map((r) => ({ a: toWorld(r.a), b: toWorld(r.b), radius: r.radius * SCALE })),
    shadowBoxes: boxes.map((b) => ({ min: toWorld(b.min), max: toWorld(b.max) })),
    contacts: contacts(),
    canopies: [oleander, ...sunsetCanopies()].slice(0, 16),
  };
}

export class Sunset3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildSunsetGeometry,
      laneZ: layout.SUNSET_LANE_Z,
      ground: layout.sunsetGround,
      grade: layout.SUNSET_GRADE,
      run: layout.SUNSET_BANK_END,
      drop: layout.SUNSET_DROP,
      framing: 0.82,
      streetProps: { trees: SUNSET_TREES, cars: SUNSET_CARS },
      filmers: layout.SUNSET_FILMERS,
      look: SUNSET_LOOK,
    });
  }
}

export const buildSunset3D = () => new Sunset3D();
