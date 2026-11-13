import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import {
  BANK_TOP, BANK_Z0, BAY_FLOOR, BLOCK, F, FAR_FRONT, FT, IN, LEAVES, LOWER, ROOF_BACK, ROOF_Z0, ROOF_Z1, UP,
  face, mixHex, part, pipe, solidBox, tag, toneWall, tube, type Plan, type RailShadow, type ShadowBox,
} from './sunsetKit';
import { SUNSET_PAINT as PAINT } from './sunsetPalette';
import { fasciaTone } from './sunsetWear';

/**
 * Roof to Bank's buildings: the wash's canopy over its open bays (sage fascia panels under a galvanized coping,
 * a cream drip band, a pale soffit with strip lights, slim sage posts, the guard rail along the bank's crest),
 * the painted-block wash building behind the bays with its rooftop units, the white stucco and terracotta
 * houses behind the canopy's corner (the user's roof frames), the billboard past the far end with plain
 * colour fields, the mini-mall past the lot, and the shopfronts across Sunset with blank sign bands. No
 * business names, logos or badges anywhere.
 */

const METAL = tag('metal');
const STUCCO = tag('stucco');
const GLASS = tag('glass');
const CONCRETE = tag('concrete');

/** The canopy's bands from the roof down: coping, flashing, fascia, drip band (authored heights under the deck). */
const COPING = [-8, 0] as const;
const FLASHING = [-12, -8] as const;
const FASCIA = [-79, -12] as const;
const DRIP = [-85, -79] as const;
/** The fascia's panels, each about twelve and a half feet long. */
const PANEL = 12.5 * FT;
/** Where the canopy's posts stand along the frontage. */
export const POST_Z = Array.from({ length: Math.ceil((ROOF_Z1 - ROOF_Z0 - 80) / 250) }, (_, k) => ROOF_Z0 + 80 + k * 250);
/** The crest's cap behind the bank's lip, and the guard rail on it. */
export const CAP_BACK = -16;
const RAIL_X = -11;

/** The blocks behind the alley: their street face x, middle z, depth back from it, width along z and height (authored). */
const BACKDROP: ReadonlyArray<readonly [x: number, z: number, deep: number, wide: number, high: number]> = [
  [-1400, -2900, 520, 640, 330], [-1350, -2150, 600, 560, 420], [-1450, -1450, 420, 600, 300], [-1350, -620, 560, 700, 560],
  [-1500, 150, 480, 560, 360], [-1380, 880, 620, 640, 470], [-1420, 1650, 520, 700, 300], [-1350, 2400, 640, 600, 520],
  [-1380, 3150, 520, 640, 380], [-2050, -2500, 600, 900, 620], [-2150, -1200, 520, 1000, 480], [-2050, 400, 640, 900, 700],
  [-2150, 1700, 560, 1000, 520], [-2050, 2900, 600, 900, 440],
];

/**
 * Every building's footprint in plan, authored [x0, x1, z0, z1]: the canopy with the wash building behind it,
 * the houses, the mini-mall, the cashier's booth and the shopfronts' block across Sunset. Trees and cars stay
 * out of them (tested); the bays under the canopy are the one place cars stand inside.
 */
export const BUILDING_PLANS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  wash: [ROOF_BACK - 40, 1, ROOF_Z0 - 20, ROOF_Z1 + 20],
  houses: [-872, -537, BANK_Z0 - 207, ROOF_Z0 - 17],
  mall: [-1006, -134, -3006, -2440],
  shopfronts: [FAR_FRONT - 3.5 * F, FAR_FRONT + 40 * F + 8, -3410, 3400],
  ...Object.fromEntries(BACKDROP.map(([x, z, deep, wide], i) => [`backdrop ${i}`, [x - deep - 4, x + 4, z - wide / 2 - 4, z + wide / 2 + 4] as const])),
};

/* ----- The canopy ----- */

/**
 * One side of the canopy's edge: the coping on top, the flashing, the sage fascia in panels with dark joints
 * between them (their wear in their vertex colours, `fasciaTone`), and the drip band along the foot. `a` to `c`
 * (plan) run along the edge's face; `n` faces out.
 */
function edge(props: Bake, a: Plan, c: Plan, n: Vec3, id: number) {
  const out = (p: Plan, d: number): Plan => [p[0] + n[0] * d, p[1] + n[2] * d];
  const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const dir: Plan = [(c[0] - a[0]) / length, (c[1] - a[1]) / length];
  const along = (s: number, d = 0): Plan => out([a[0] + dir[0] * s, a[1] + dir[1] * s], d);
  // The coping: a galvanized cap flush with the deck's edge, the flashing standing proud under it. Proud bands
  // run on past both ends to close the corners.
  toneWall(props, along(0), along(length), COPING[0], COPING[1], n, 4 * FT, [0, 1], (s) => mixHex(PAINT.coping, PAINT.streak, 0.15 * hash2(Math.round(s / 40), id, 40)), part(id, 'metal', 3));
  toneWall(props, along(-0.5, 0.5), along(length + 0.5, 0.5), FLASHING[0], FLASHING[1], n, 8 * FT, [0, 1], () => PAINT.flashing, part(id + 1, 'metal', 3));
  // Panels with half-inch joints, the dark backer showing between them.
  const panels = Math.max(1, Math.round(length / PANEL));
  const gap = 0.35 * IN;
  for (let k = 0; k < panels; k++) {
    const s0 = (length * k) / panels + (k ? gap : 0), s1 = (length * (k + 1)) / panels - (k + 1 < panels ? gap : 0);
    toneWall(props, along(s0), along(s1), FASCIA[0], FASCIA[1], n, 0.75 * FT, [0, 0.12, 0.45, 0.8, 1], (s, t) => fasciaTone(s, t, PANEL), part(id + 2, 'metal', 2), s0);
  }
  toneWall(props, along(0, -1.2), along(length, -1.2), FASCIA[0], FASCIA[1], n, 20 * FT, [0, 1], () => PAINT.sageDark, METAL);
  // The drip band, standing proud, its top a little ledge where dust collects.
  toneWall(props, along(-0.7, 0.7), along(length + 0.7, 0.7), DRIP[0], DRIP[1], n, 3 * FT, [0, 0.4, 1], (s, t) => mixHex(PAINT.creamDirty, PAINT.cream, t * 0.8 + 0.2 * hash2(Math.round(s / 30), id, 41)), part(id + 3, 'metal', 4));
  const ledge = (d0: number, d1: number, y: number, ext: number, color: string, normal: Vec3) => {
    const p = (s: number, d: number): Vec3 => { const q = along(s, d); return [q[0], y, q[1]]; };
    props.quad(p(-ext, d0), p(length + ext, d0), p(length + ext, d1), p(-ext, d1), normal, { color }, METAL);
  };
  ledge(-0.4, 0.7, DRIP[1], 0.7, mixHex(PAINT.creamDirty, PAINT.streak, 0.3), UP);
  ledge(-0.4, 0.7, DRIP[0], 0.7, PAINT.creamDirty, [0, -1, 0]);
  ledge(0, 0.5, FLASHING[1], 0.5, PAINT.flashing, UP);
  ledge(-0.4, 0.5, FLASHING[0], 0.5, PAINT.flashing, [0, -1, 0]);
}

/**
 * The canopy over the bays: its edge round the front and both ends, the soffit with its strip lights, posts
 * and joists, the bays' plumbing and hoses, the crest's cap and its guard rail, and the bay floor.
 */
export function canopy(props: Bake, rails: RailShadow[], boxes: ShadowBox[]) {
  // The front faces the street (+x); the ends face the landing (-z) and the driveway (+z).
  edge(props, [0, ROOF_Z0], [0, ROOF_Z1], [1, 0, 0], 100);
  edge(props, [ROOF_BACK + 5, ROOF_Z0], [0, ROOF_Z0], [0, 0, -1], 110);
  edge(props, [0, ROOF_Z1], [ROOF_BACK + 5, ROOF_Z1], [0, 0, 1], 120);
  // The fascia's depth, closed at the back and the corners, and the soffit under the deck.
  props.quad([ROOF_BACK + 5, FASCIA[1] + 1, ROOF_Z0 + 8], [-8, FASCIA[1] + 1, ROOF_Z0 + 8], [-8, FASCIA[1] + 1, ROOF_Z1 - 8], [ROOF_BACK + 5, FASCIA[1] + 1, ROOF_Z1 - 8], [0, -1, 0], { color: PAINT.soffit }, STUCCO);
  solidBox(props, [-8, DRIP[0], ROOF_Z0], [-1.2, FASCIA[1], ROOF_Z1], PAINT.sageDark, PAINT.sageDark, METAL, 'bl');
  solidBox(props, [ROOF_BACK + 5, DRIP[0], ROOF_Z0 + 1.2], [0, FASCIA[1], ROOF_Z0 + 8], PAINT.sageDark, PAINT.sageDark, METAL, 'bf');
  solidBox(props, [ROOF_BACK + 5, DRIP[0], ROOF_Z1 - 8], [0, FASCIA[1], ROOF_Z1 - 1.2], PAINT.sageDark, PAINT.sageDark, METAL, 'bk');
  boxes.push({ min: [ROOF_BACK, FASCIA[1], ROOF_Z0], max: [0, 0, ROOF_Z1] });
  boxes.push({ min: [-8, DRIP[0], ROOF_Z0], max: [0.7, FASCIA[1], ROOF_Z1] });
  for (const z of POST_Z) {
    // Slim sage posts on the bay floor, a joist over each to the back wall, strip lights between.
    solidBox(props, [-55, BAY_FLOOR, z - 3], [-48, DRIP[0], z + 3], PAINT.post, PAINT.post, part(130, 'metal', 2));
    solidBox(props, [-57, BAY_FLOOR, z - 5], [-46, BAY_FLOOR + 2, z + 5], PAINT.unitBase, PAINT.unitBase, METAL);
    solidBox(props, [ROOF_BACK + 90, BAY_FLOOR, z - 4], [ROOF_BACK + 100, FASCIA[1], z + 4], PAINT.joist, PAINT.joist, METAL);
    solidBox(props, [ROOF_BACK + 45, -21, z - 4], [-8, FASCIA[1], z + 4], PAINT.joist, PAINT.joist, METAL, 'bfkle');
    solidBox(props, [-130, -20, z + 60], [-104, -18, z + 186], PAINT.coping, PAINT.coping, METAL, 'fkle');
    props.quad([-130, -20.2, z + 60], [-104, -20.2, z + 60], [-104, -20.2, z + 186], [-130, -20.2, z + 186], UP, { color: PAINT.stripLight }, METAL);
    solidBox(props, [-420, -20, z + 60], [-394, -18, z + 186], PAINT.coping, PAINT.coping, METAL, 'fkle');
    props.quad([-420, -20.2, z + 60], [-394, -20.2, z + 60], [-394, -20.2, z + 186], [-420, -20.2, z + 186], UP, { color: PAINT.stripLight }, METAL);
    // A hose coiled on the post.
    const coil: Vec3[] = [];
    for (let k = 0; k <= 18; k++) {
      const a = (k / 18) * Math.PI * 4;
      coil.push([-47 + Math.sin(a) * 0.6, -140 + Math.sin(a) * 9 - k * 0.4, z + Math.cos(a) * 9]);
    }
    tube(props, coil, 1.3, PAINT.hose, METAL, 5, false);
  }
  // Plumbing down the bays: the water lines and the guide rail cars ride along.
  for (const y of [-115, -138]) tube(props, [[-35, y, ROOF_Z0 + 4], [-35, y, ROOF_Z1 - 4]], 1.8, PAINT.pipe);
  for (let k = 0; k < POST_Z.length; k++) tube(props, [[-72, -112, POST_Z[k] - 85], [-72, -112, POST_Z[k] + 110]], 1.7, PAINT.pipe);
  pipe(props, [[-300, BAY_FLOOR + 6, ROOF_Z0 + 40], [-300, BAY_FLOOR + 6, ROOF_Z1 - 40]], null, 2.4, '#8d918b');
  // The crest's cap behind the lip, its back wall down to the bay floor, and the guard rail along it.
  solidBox(props, [CAP_BACK, BAY_FLOOR, ROOF_Z0], [-0.01, BANK_TOP, ROOF_Z1], PAINT.capWall, PAINT.cap, CONCRETE, 'tl');
  const railTop = BANK_TOP + 3.3 * FT, railMid = BANK_TOP + 1.7 * FT;
  for (const y of [railTop, railMid]) pipe(props, [[RAIL_X, y, ROOF_Z0 + 2], [RAIL_X, y, ROOF_Z1 - 2]], rails, 1.1 * IN, PAINT.pipe);
  for (let z = ROOF_Z0 + 2, k = 0; z <= ROOF_Z1 - 2 + 1e-6 && k < 14; z += (ROOF_Z1 - ROOF_Z0 - 4) / 13, k++) {
    pipe(props, [[RAIL_X, BANK_TOP, z], [RAIL_X, railTop + 0.6 * IN, z]], rails, 1.2 * IN, PAINT.pipe);
  }
  // The bays' wet floor, from the back wall to the cap.
  solidBox(props, [ROOF_BACK + 5, BAY_FLOOR - 6, ROOF_Z0], [CAP_BACK, BAY_FLOOR, ROOF_Z1], PAINT.bayFloor, PAINT.bayFloor, CONCRETE, 't');
}

/* ----- The wash building ----- */

/**
 * The wash building behind the bays: painted block rising past the roof, steel doors and dark glazing onto the
 * bays, its coping; rooftop units, vents and a hatch at the back of the roof, clear of the approach.
 */
export function washBuilding(props: Bake, boxes: ShadowBox[]) {
  const x0 = ROOF_BACK - 38, x1 = ROOF_BACK + 5, z0 = ROOF_Z0 - 18, z1 = ROOF_Z1 + 18;
  solidBox(props, [x0, -260, z0], [x1, 82, z1], PAINT.block, PAINT.coping, part(140, BLOCK, 2), 'fkle');
  solidBox(props, [x0 - 2, 82, z0 - 2], [x1 + 2, 86, z1 + 2], PAINT.coping, PAINT.coping, part(147, 'metal', 3));
  boxes.push({ min: [x0, -260, z0], max: [x1, 86, z1] });
  for (let z = ROOF_Z0 + 50; z < ROOF_Z1 - 100; z += 220) {
    // A roll-up door or a window band in each bay.
    if (Math.round(z / 220) % 2) {
      face(props, [x1 + 2, BAY_FLOOR, z + 100], [x1 + 2, BAY_FLOOR, z], [x1 + 2, -84, z], [x1 + 2, -84, z + 100], PAINT.door, tag('siding'), [1, 0, 0]);
      solidBox(props, [x1, -84, z - 3], [x1 + 4, -78, z + 103], PAINT.mullion, PAINT.mullion, METAL);
    } else {
      face(props, [x1 + 2, -150, z + 100], [x1 + 2, -150, z], [x1 + 2, -95, z], [x1 + 2, -95, z + 100], PAINT.glass, GLASS, [1, 0, 0]);
      for (const at of [z, z + 50, z + 100]) solidBox(props, [x1, -152, at - 1], [x1 + 3, -93, at + 1], PAINT.mullion, PAINT.mullion, METAL);
      for (const y of [-152, -95]) solidBox(props, [x1, y - 1, z - 1], [x1 + 3, y + 2, z + 101], PAINT.mullion, PAINT.mullion, METAL);
    }
  }
  // Rooftop units on curbs, with condenser fans, and vents and a hatch toward the back.
  for (const [ux0, ux1, uz0, uz1, h] of [[-720, -560, 700, 830, 62], [-520, -420, 1180, 1270, 48], [-860, -760, 1350, 1470, 54]] as const) {
    solidBox(props, [ux0 - 6, 0, uz0 - 6], [ux1 + 6, 8, uz1 + 6], PAINT.unitBase, PAINT.unitBase, METAL);
    solidBox(props, [ux0, 8, uz0], [ux1, 8 + h, uz1], PAINT.unit, mixHex(PAINT.unit, '#ffffff', 0.15), part(150, 'metal', 4));
    for (let x = ux0 + 8; x < ux1 - 8; x += 10) solidBox(props, [x, 14, uz1], [x + 4, 4 + h, uz1 + 2], PAINT.unitBase, PAINT.unitBase, METAL, 'fle');
    tube(props, [[(ux0 + ux1) / 2, 8 + h, (uz0 + uz1) / 2], [(ux0 + ux1) / 2, 10 + h, (uz0 + uz1) / 2]], (ux1 - ux0) * 0.3, '#5e625d', METAL, 14);
  }
  for (const [x, z] of [[-300, 900], [-650, 1050], [-400, 1550], [-900, 600]] as const) {
    tube(props, [[x, 0, z], [x, 34, z]], 3.5, PAINT.vent);
    tube(props, [[x, 34, z], [x, 38, z]], [6, 5], '#777c74');
  }
  solidBox(props, [-950, 0, 1000], [-880, 14, 1070], PAINT.unit, PAINT.unit, part(156, 'metal', 4));
  // A condensate line run along the roof to the back wall, as in the user's frames.
  tube(props, [[-560, 4, 760], [-560, 4, 300], [x1, 4, 300], [x1, 30, 300]], 1.4, '#e8e6de', METAL, 6, false);
}

/* ----- The neighbours ----- */

/**
 * The white stucco houses behind the canopy's corner (the user's airborne and touchdown frames): a long
 * single storey with a terracotta barrel-tile roof, a second storey toward the back, small windows with dark
 * grilles, a chimney, a satellite dish.
 */
export function houses(props: Bake, boxes: ShadowBox[]) {
  const z0 = BANK_Z0 - 200, z1 = ROOF_Z0 - 24;
  solidBox(props, [-865, LOWER, z0], [-555, 176, z1], PAINT.stucco, PAINT.stuccoShade, part(180, 'stucco', 2), 'fkle');
  solidBox(props, [-710, 176, z1 - 460], [-540, 257, z1 - 180], PAINT.stucco, PAINT.stuccoShade, part(186, 'stucco', 2), 'tfkle');
  boxes.push({ min: [-872, LOWER, z0 - 7], max: [-548, 198, z1 + 7] });
  // The tile roof: an eave board, and terracotta pitched down to the wash and away from it, its rows of barrel
  // tiles drawn by the look's roofing seams.
  solidBox(props, [-872, 177, z0 - 7], [-548, 185, z1 + 7], PAINT.trim, PAINT.trim, STUCCO, 'bfkle');
  const ridge = 206;
  face(props, [-700, ridge, z0 - 7], [-700, ridge, z1 + 7], [-544, 183, z1 + 7], [-544, 183, z0 - 7], PAINT.tile, part(189, 'roofing', 3));
  face(props, [-700, ridge, z1 + 7], [-700, ridge, z0 - 7], [-876, 183, z0 - 7], [-876, 183, z1 + 7], PAINT.tileDark, part(190, 'roofing', 3));
  for (const z of [z0 - 7, z1 + 7]) props.triangle([-876, 183, z], [-544, 183, z], [-700, ridge, z], [0, 0, z < 0 ? -1 : 1], { color: PAINT.stucco }, STUCCO);
  // The tile eyebrow over the wall toward the wash, the Spanish detail the user's frames show from the street.
  const brow: Vec3 = [0.45, 0.89, 0];
  face(props, [-555, 160, z1 + 4], [-555, 160, z0 - 4], [-533, 149, z0 - 4], [-533, 149, z1 + 4], PAINT.tile, part(191, 'roofing', 4), brow);
  props.quad([-555, 157, z0 - 4], [-555, 157, z1 + 4], [-533, 147, z1 + 4], [-533, 147, z0 - 4], [0, -1, 0], { color: PAINT.stuccoShade }, STUCCO);
  face(props, [-533, 147, z1 + 4], [-533, 147, z0 - 4], [-533, 149, z0 - 4], [-533, 149, z1 + 4], PAINT.tileDark, STUCCO, [1, 0, 0]);
  // Windows toward the wash, each with its sill and grille, and a pair on the upper storey.
  for (const z of [z1 - 148, z1 - 608, z1 - 380]) {
    face(props, [-552, 30, z + 63], [-552, 30, z], [-552, 100, z], [-552, 100, z + 63], PAINT.windowGlass, GLASS, [1, 0, 0]);
    for (let k = 1; k < 5; k++) solidBox(props, [-552, 30, z + (k * 63) / 5 - 0.6], [-550, 100, z + (k * 63) / 5 + 0.6], PAINT.grille, PAINT.grille, METAL);
    for (let k = 1; k < 4; k++) solidBox(props, [-552, 30 + (k * 70) / 4 - 0.6, z], [-550, 30 + (k * 70) / 4 + 0.6, z + 63], PAINT.grille, PAINT.grille, METAL);
    solidBox(props, [-553, 22, z - 5], [-547, 30, z + 68], PAINT.trim, PAINT.trim, STUCCO);
  }
  for (const z of [z1 - 420, z1 - 290]) face(props, [-537, 196, z + 40], [-537, 196, z], [-537, 236, z], [-537, 236, z + 40], PAINT.windowGlass, GLASS, [1, 0, 0]);
  solidBox(props, [-640, 176, z1 - 60], [-610, 290, z1 - 30], PAINT.stucco, PAINT.stuccoShade, part(192, 'stucco', 3));
  solidBox(props, [-644, 290, z1 - 64], [-606, 296, z1 - 26], PAINT.tile, PAINT.tile, STUCCO);
  tube(props, [[-560, 150, z1 - 100], [-556, 150, z1 - 100]], 1, PAINT.grille);
  tube(props, [[-556, 150, z1 - 100], [-552, 156, z1 - 100]], [10, 1], '#d9d9d2', METAL, 10);
}

/**
 * The billboard past the canopy's far end (in the photographs, beside the roof): a steel post, a frame and
 * catwalk with its rail and lamp arms, and a face of plain colour fields standing in for an advert, no text.
 */
export function billboard(props: Bake, rails: RailShadow[], boxes: ShadowBox[]) {
  const z = ROOF_Z1 + 200, x0 = -1050, x1 = -275, y0 = 305, y1 = 655;
  tube(props, [[-690, LOWER, z + 10], [-690, y0, z + 10]], [16, 13], PAINT.billboardSteel, part(230, 'metal', 2), 12);
  solidBox(props, [x0, y0, z + 1], [x1, y1, z + 15], PAINT.billboardSteel, PAINT.billboardSteel, part(231, 'metal', 2), 'tbfle');
  // The face toward the canopy: a pale field fading toward the top, a dark band along its foot, no words.
  const n: Vec3 = [0, 0, -1];
  const [pale, sky, band] = PAINT.billboardFace;
  props.quadCorners([x1 - 6, y0 + 80, z + 0.5], [x0 + 6, y0 + 80, z + 0.5], [x0 + 6, y1 - 6, z + 0.5], [x1 - 6, y1 - 6, z + 0.5], n,
    [{ color: pale }, { color: pale }, { color: sky }, { color: sky }], STUCCO);
  face(props, [x1 - 6, y0 + 6, z + 0.5], [x0 + 6, y0 + 6, z + 0.5], [x0 + 6, y0 + 80, z + 0.5], [x1 - 6, y0 + 80, z + 0.5], band, STUCCO, n);
  solidBox(props, [x0, y0 - 2, z - 1], [x1, y0 + 6, z + 1], PAINT.billboardSteel, PAINT.billboardSteel, METAL);
  solidBox(props, [x0, y1 - 6, z - 1], [x1, y1 + 2, z + 1], PAINT.billboardSteel, PAINT.billboardSteel, METAL);
  // The catwalk and its rail along the foot, the lamp arms reaching over the top.
  solidBox(props, [x0, y0 - 8, z - 40], [x1, y0 - 5, z], '#6c6e66', '#7d8077', METAL);
  pipe(props, [[x0, y0 + 30, z - 40], [x1, y0 + 30, z - 40]], rails, 1.4, PAINT.billboardSteel);
  for (let k = 0; k < 7; k++) {
    const x = x0 + 40 + k * 112;
    tube(props, [[x, y0 - 5, z - 40], [x, y0 + 30, z - 40]], 1.2, PAINT.billboardSteel);
    tube(props, [[x, y1, z + 5], [x, y1 + 30, z - 25], [x, y1 + 26, z - 45]], 1.4, PAINT.billboardSteel, METAL, 6, false);
    solidBox(props, [x - 6, y1 + 20, z - 52], [x + 6, y1 + 27, z - 40], '#4c4f4a', '#4c4f4a', METAL);
  }
  for (let k = 0; k < 7; k++) tube(props, [[x0 + 40 + k * 112, y0, z + 15], [x0 + 40 + k * 112, y0 - 22, z + 70]], 1.4, PAINT.billboardSteel);
  boxes.push({ min: [x0, y0, z], max: [x1, y1, z + 15] });
}

/**
 * The two-storey mini-mall past the side lot, its shops facing Sunset: buff stucco, a terracotta coping, a
 * shaded walkway under the upper floor, dark glass behind slim mullions, blank sign panels.
 */
export function miniMall(props: Bake) {
  const x0 = -1000, x1 = -140, z0 = -3000, z1 = -2560, h = 15 * F;
  solidBox(props, [x0, LOWER, z0], [x1, LOWER + h, z1], PAINT.mall, PAINT.mall, part(200, 'stucco', 2), 'fkle');
  solidBox(props, [x0 - 6, LOWER + h, z0 - 6], [x1 + 6, LOWER + h + 10, z1 + 6], PAINT.mallCoping, PAINT.mallCoping, part(206, 'stucco', 3));
  const n: Vec3 = [1, 0, 0], side: Vec3 = [0, 0, 1];
  const front = (a: number, b: number, c: number, d: number, color: string, lift: number, ink = GLASS) =>
    face(props, [x1 + lift, LOWER + c, b], [x1 + lift, LOWER + c, a], [x1 + lift, LOWER + d, a], [x1 + lift, LOWER + d, b], color, ink, n);
  front(z0 + 20, z1 - 20, 12, 112, PAINT.glass, 2);
  for (let m = z0 + 20; m <= z1 - 20; m += (z1 - z0 - 40) / 4) solidBox(props, [x1, LOWER + 12, m - 1.6], [x1 + 4, LOWER + 112, m + 1.6], PAINT.storefrontFrame, PAINT.storefrontFrame, METAL);
  front(z0 + 20, z1 - 20, 122, 150, PAINT.signBands[1], 2, METAL);
  for (let k = 0; k < 4; k++) front(z0 + 40 + k * 100, z0 + 110 + k * 100, 270, 390, PAINT.windowGlass, 2);
  for (let x = x0 + 60; x < x1 - 60; x += 130) {
    face(props, [x, LOWER + 12, z1 + 2], [x + 90, LOWER + 12, z1 + 2], [x + 90, LOWER + 110, z1 + 2], [x, LOWER + 110, z1 + 2], PAINT.glass, GLASS, side);
    face(props, [x, LOWER + 270, z1 + 2], [x + 90, LOWER + 270, z1 + 2], [x + 90, LOWER + 390, z1 + 2], [x, LOWER + 390, z1 + 2], PAINT.windowGlass, GLASS, side);
  }
  solidBox(props, [x0, LOWER + 232, z1], [x1, LOWER + 242, z1 + 116], '#c8bfa8', '#d6cfbb', part(208, 'stucco', 3));
  for (let x = x0 + 40; x < x1; x += 160) solidBox(props, [x - 5, LOWER, z1 + 106], [x + 5, LOWER + 232, z1 + 116], PAINT.mall, PAINT.mall, STUCCO);
}

/**
 * Across Sunset: a block of shopfronts, stucco or brick, each with a dark glass front behind its mullions, a
 * door, a blank sign band, an awning on most, and upper windows over the taller ones.
 */
export function storefronts(props: Bake) {
  const n: Vec3 = [-1, 0, 0];
  const x = FAR_FRONT;
  for (let i = 0; i < 14; i++) {
    const z0 = -3400 + i * 26 * F, z1 = z0 + 24 * F;
    const h = (13 + hash2(i, 0, 1010) * 12) * F, depth = 40 * F;
    const pick = <T>(list: readonly T[], salt: number) => list[Math.floor(hash2(i, salt, 1011) * list.length)];
    const brick = hash2(i, 7, 1011) < 0.25;
    const wall = brick ? PAINT.brick : pick(PAINT.facades, 1);
    const front = (a: number, b: number, c: number, d: number, color: string, lift: number, ink = GLASS) =>
      face(props, [x - lift, LOWER + c, a], [x - lift, LOWER + c, b], [x - lift, LOWER + d, b], [x - lift, LOWER + d, a], color, ink, n);
    solidBox(props, [x, LOWER, z0], [x + depth, LOWER + h, z1], wall, PAINT.coping2, part(210 + (i % 6), brick ? 'brick' : 'stucco', 2), 'tfkl');
    solidBox(props, [x - 5, LOWER + h - 4, z0 - 5], [x + 8, LOWER + h + 7, z1 + 5], PAINT.coping2, PAINT.coping2, brick ? CONCRETE : STUCCO);
    front(z0 + 18, z1 - 18, 0, 15, '#6a6d67', 2, CONCRETE);
    front(z0 + 18, z1 - 18, 15, 120, PAINT.glass, 2);
    const door = z0 + 40 + hash2(i, 2, 1011) * (24 * F - 120);
    front(door, door + 38, 2, 94, '#2f3b3c', 3, METAL);
    for (let m = z0 + 18; m <= z1 - 18 + 1e-6; m += (24 * F - 36) / 5) solidBox(props, [x - 4, LOWER + 15, m - 1.6], [x, LOWER + 120, m + 1.6], PAINT.storefrontFrame, PAINT.storefrontFrame, METAL);
    // The sign band, blank.
    const sign = pick(PAINT.signBands, 3);
    solidBox(props, [x - 3, LOWER + 126, z0 + 12], [x, LOWER + 156, z1 - 12], sign, sign, METAL, 'tbfkl');
    if (hash2(i, 5, 1011) < 0.6) {
      const awning = pick(PAINT.awnings, 6);
      const tilt: Vec3 = [-0.6, 0.8, 0];
      props.quad([x, LOWER + 123, z0 + 16], [x, LOWER + 123, z1 - 16], [x - 3.5 * F, LOWER + 105, z1 - 16], [x - 3.5 * F, LOWER + 105, z0 + 16], tilt, { color: awning }, part(222, 'stucco', 4));
      front(z0 + 16, z1 - 16, 95, 105, awning, 3.5 * F, STUCCO);
    }
    if (h > 19 * F) {
      for (let k = 0; k < 4; k++) {
        const wz = z0 + 40 + (k * (24 * F - 80)) / 4;
        front(wz, wz + 90, 13 * F, 17.5 * F, PAINT.windowGlass, 2);
        solidBox(props, [x - 4, LOWER + 13 * F - 4, wz - 4], [x, LOWER + 13 * F, wz + 94], PAINT.trim, PAINT.trim, brick ? CONCRETE : STUCCO);
      }
    }
  }
}

/**
 * The low city behind the alley: flat-roofed stucco blocks of one to three storeys with parapets, dark windows
 * and rooftop units, filling the view past the wash the way West Hollywood does.
 */
export function backdrop(props: Bake) {
  BACKDROP.forEach(([x, z, deep, wide, high], i) => {
    const wall = mixHex(PAINT.facades[i % PAINT.facades.length], PAINT.stucco, 0.35);
    const z0 = z - wide / 2, z1 = z + wide / 2;
    solidBox(props, [x - deep, LOWER, z0], [x, LOWER + high, z1], wall, PAINT.coping2, part(170 + (i % 5), 'stucco', 2), 'tfke');
    solidBox(props, [x - deep - 4, LOWER + high, z0 - 4], [x + 4, LOWER + high + 10, z1 + 4], PAINT.coping2, PAINT.coping2, STUCCO, 'tfke');
    const floors = Math.max(1, Math.floor(high / 190));
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < Math.floor(wide / 130); k++) {
        const wz = z0 + 40 + k * 130, y = LOWER + 60 + f * 190;
        face(props, [x + 2, y, wz + 80], [x + 2, y, wz], [x + 2, y + 90, wz], [x + 2, y + 90, wz + 80], PAINT.windowGlass, GLASS, [1, 0, 0]);
      }
    }
    if (i % 3 !== 1) solidBox(props, [x - deep / 2 - 50, LOWER + high, z - 40], [x - deep / 2 + 50, LOWER + high + 55, z + 40], PAINT.unit, PAINT.unit, METAL);
  });
}

/**
 * The hills behind the city, far enough off that the haze softens them to blue-green: one rolling ridge of
 * chaparral and trees above the rooftops, its folds darker, the way the Hollywood Hills stand behind Sunset in
 * the user's frames.
 */
export function hills(props: Bake) {
  const x0 = -12000, x1 = -20000, z0 = -30000, z1 = 30000, columns = 48;
  const height = (z: number, t: number) => {
    const ridge = 2600 + 1300 * Math.sin(z / 4100 + 0.7) + 700 * Math.sin(z / 1700 + 2.1) + 300 * Math.sin(z / 640);
    return LOWER + ridge * Math.sin((t * Math.PI) / 2) ** 0.8;
  };
  const rows = [0, 0.35, 0.7, 1];
  const point = (k: number, r: number): Vec3 => {
    const z = z0 + ((z1 - z0) * k) / columns, t = rows[r];
    return [x0 + (x1 - x0) * t, height(z, t), z];
  };
  const tone = (k: number, r: number) => mixHex(PAINT.oleanderDark, '#7d7a55', 0.25 + 0.35 * hash2(k, r, 960) + 0.2 * rows[r]);
  for (let k = 0; k < columns; k++) for (let r = 0; r + 1 < rows.length; r++) {
    const a = point(k, r), b = point(k + 1, r), c = point(k + 1, r + 1), d = point(k, r + 1);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Math.hypot(...n) || 1;
    const up: Vec3 = n[0] > 0 ? [n[0] / m, n[1] / m, n[2] / m] : [-n[0] / m, -n[1] / m, -n[2] / m];
    props.quadCorners(a, b, c, d, up, [{ color: tone(k, r) }, { color: tone(k + 1, r) }, { color: tone(k + 1, r + 1) }, { color: tone(k, r + 1) }], tag(LEAVES));
  }
}

