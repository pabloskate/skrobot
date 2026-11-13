import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import {
  BANK_END, BANK_Z0, BANK_Z1, F, FT, LANE_Z, LOWER, SIDEWALK_END, TAPER_END,
  chainLink, face, mixHex, part, pipe, solidBox, tag, tube, type RailShadow,
} from './sunsetKit';
import { sunsetLettering, weedTuft } from './sunsetDetails';
import { SUNSET_PAINT as PAINT } from './sunsetPalette';
import { HYDRANT_Z } from './sunsetWear';

/**
 * The street life round the wash, all generic: a hydrant, a bus bench and stop, a city can and two cobra-head
 * streetlights on the sidewalk; weeds in the joint at the bank's foot; the side lot's vacuums, cashier's booth
 * and towel cart behind its chain link; and the alley's wooden power poles and lines. Authored, like the rest
 * of the set, at its normalized scale, and kept off the rider's line: the roof approach, the landing and the
 * rollout, which reaches some twelve feet into the curb lane.
 */

const METAL = tag('metal');
const CONCRETE = tag('concrete');
/** The curb's line, a foot in from the sidewalk's street edge, where poles and posts stand. */
const KERB = SIDEWALK_END - 1.2 * FT;

/** A faded yellow hydrant, its outlets toward the street. */
function hydrant(props: Bake) {
  const z = HYDRANT_Z, x = KERB;
  tube(props, [[x, LOWER, z], [x, LOWER + 2.5, z]], 7, '#868880', CONCRETE, 10);
  tube(props, [[x, LOWER + 2.5, z], [x, LOWER + 25, z]], [4.8, 4.6], PAINT.hydrant, part(240, 'metal', 6), 10);
  tube(props, [[x, LOWER + 25, z], [x, LOWER + 28, z], [x, LOWER + 31.5, z]], [5.6, 4.6, 1.4], PAINT.hydrant, part(241, 'metal', 6), 10);
  tube(props, [[x + 3, LOWER + 17, z], [x + 9.5, LOWER + 17, z]], 2.6, PAINT.hydrant, METAL, 8);
  for (const side of [-1, 1]) tube(props, [[x, LOWER + 19, z + 3 * side], [x, LOWER + 19, z + 8 * side]], 1.9, PAINT.hydrant, METAL, 8);
}

/** A bus bench with its back toward the bank and a blank panel, and the stop's post on the curb with a plain plate. */
function busStop(props: Bake, rails: RailShadow[]) {
  const x = KERB - 2.2 * F, z0 = 1080, z1 = z0 + 6 * F;
  for (const z of [z0 + 6, z1 - 6]) solidBox(props, [x - 9, LOWER, z - 2], [x + 9, LOWER + 17, z + 2], '#4b524d', '#5a615b', METAL);
  solidBox(props, [x - 9, LOWER + 17, z0], [x + 9, LOWER + 20, z1], PAINT.bench, PAINT.bench, part(242, 'metal', 5));
  solidBox(props, [x - 12, LOWER + 20, z0], [x - 9, LOWER + 50, z1], '#d8d2bf', '#d8d2bf', part(243, 'stucco', 5));
  face(props, [x - 8.8, LOWER + 23, z1 - 6], [x - 8.8, LOWER + 23, z0 + 6], [x - 8.8, LOWER + 47, z0 + 6], [x - 8.8, LOWER + 47, z1 - 6], '#b9b6aa', tag('stucco'), [1, 0, 0]);
  pipe(props, [[KERB, LOWER, z1 + F], [KERB, LOWER + 9 * F, z1 + F]], rails, 1.2, PAINT.poleMetal);
  solidBox(props, [KERB - 0.3, LOWER + 7.3 * F, z1 + F - 13], [KERB + 0.3, LOWER + 8.9 * F, z1 + F + 13], PAINT.signBlue, PAINT.signBlue, part(244, 'metal', 6));
}

/** A city trash can between the planters, its lid and liner. */
function trashCan(props: Bake) {
  const x = KERB - 0.4 * F, z = 860;
  tube(props, [[x, LOWER, z], [x, LOWER + 84, z]], [25, 27], PAINT.can, part(245, 'metal', 6), 12);
  tube(props, [[x, LOWER + 84, z], [x, LOWER + 90, z]], [28.5, 26], mixHex(PAINT.can, '#000000', 0.15), part(246, 'metal', 6), 12);
}

/**
 * Two cobra-head streetlights on the curb, one past each end of the bank (the user's side frame shows one by the
 * bank's tapered end): a tapered galvanized pole, an arm out over the street, and the lamp head.
 */
function streetlights(props: Bake, rails: RailShadow[]) {
  for (const z of [BANK_Z1 + 130, BANK_Z0 - 15 * F]) {
    const x = SIDEWALK_END - 32, top = LOWER + 625;
    tube(props, [[x, LOWER, z], [x, top, z]], [4.8, 3.2], PAINT.poleMetal, part(247, 'metal', 4), 10);
    rails.push({ a: [x, LOWER, z], b: [x, top, z], radius: 4 });
    tube(props, [[x, top - 10, z], [x + 38, top + 35, z], [x + 105, top + 40, z]], [3, 2.7, 2.5], PAINT.poleMetal, METAL, 8, false);
    solidBox(props, [x + 90, top + 30, z - 12], [x + 142, top + 38, z + 12], PAINT.poleMetal, mixHex(PAINT.poleMetal, '#ffffff', 0.2), part(248, 'metal', 5));
    face(props, [x + 92, top + 29.8, z - 10], [x + 140, top + 29.8, z - 10], [x + 140, top + 29.8, z + 10], [x + 92, top + 29.8, z + 10], '#d9d6c6', METAL, [0, -1, 0]);
    tube(props, [[x, LOWER, z], [x, LOWER + 10, z]], 7, PAINT.poleMetal, METAL, 10);
  }
}

/**
 * Weeds in the joint along the bank's foot and round the planters, thickest away from the landing, none on the
 * line (the cover and the user's side frame show the toe weedy).
 */
function weeds(props: Bake) {
  for (let z = BANK_Z0 + 2 * FT, k = 0; z < BANK_Z1 - 2 * FT; z += (2 + 6 * hash2(k, 1, 270)) * FT, k++) {
    if (Math.abs(z - LANE_Z) < 30 * FT || hash2(k, 2, 270) < 0.3) continue;
    weedTuft(props, BANK_END + (0.15 + 0.4 * hash2(k, 3, 270)) * FT, LOWER, z, k + 280, 0.8 + 0.6 * hash2(k, 4, 270));
  }
  // The tapered end, where nobody rolls.
  for (let k = 0; k < 14; k++) weedTuft(props, BANK_END + (0.2 + 0.6 * hash2(k, 5, 271)) * FT, LOWER, TAPER_END + (BANK_Z0 - TAPER_END) * hash2(k, 6, 271), k + 300, 1.2);
}

/** The side lot: self-serve vacuums between the stalls, the cashier's booth with its OPEN sign, a towel cart. */
function lot(props: Bake) {
  for (const z of [TAPER_END - 11 * F, TAPER_END - 21 * F, TAPER_END - 31 * F]) {
    const x = -90;
    solidBox(props, [x - 9, LOWER, z - 9], [x + 9, LOWER + 3, z + 9], '#a9a99c', '#b8b7aa', CONCRETE);
    tube(props, [[x, LOWER + 3, z], [x, LOWER + 58, z]], [5.5, 5], PAINT.vacuum, part(250, 'metal', 6), 10);
    solidBox(props, [x - 10, LOWER + 58, z - 10], [x + 10, LOWER + 80, z + 10], PAINT.vacuumHead, PAINT.vacuumHead, part(251, 'metal', 6));
    tube(props, [[x - 10, LOWER + 70, z], [x - 26, LOWER + 66, z + 6], [x - 30, LOWER + 40, z + 14], [x - 18, LOWER + 20, z + 10], [x - 8, LOWER + 34, z + 2]], 2.4, '#2d302e', METAL, 6, false);
  }
  {
    const x0 = -470, x1 = -360, z0 = TAPER_END - 3 * F, z1 = z0 - 4 * F;
    solidBox(props, [x0, LOWER, z1], [x1, LOWER + 92, z0], PAINT.booth, PAINT.booth, part(252, 'stucco', 5));
    solidBox(props, [x0 - 10, LOWER + 92, z1 - 10], [x1 + 10, LOWER + 100, z0 + 10], PAINT.boothRoof, PAINT.boothRoof, part(253, 'metal', 5));
    face(props, [x1 + 2, LOWER + 40, z0 - 12], [x1 + 2, LOWER + 40, z1 + 12], [x1 + 2, LOWER + 82, z1 + 12], [x1 + 2, LOWER + 82, z0 - 12], '#4f6767', tag('glass'), [1, 0, 0]);
    solidBox(props, [x1, LOWER + 37, z1 + 8], [x1 + 8, LOWER + 40, z0 - 8], '#c9c4b1', '#d8d3c1', METAL);
    solidBox(props, [x1 + 2, LOWER + 70, z1 + 30], [x1 + 3, LOWER + 80, z1 + 70], '#2b2d2b', '#2b2d2b', METAL);
    sunsetLettering(props, 'OPEN', [x1 + 3.2, LOWER + 79, z1 + 66], [0, 0, -1], 1.25, PAINT.open);
  }
  solidBox(props, [-260, LOWER + 6, TAPER_END - 60], [-215, LOWER + 46, TAPER_END - 10], '#8d969a', '#9aa3a6', part(254, 'metal', 5));
  for (let k = 0; k < 4; k++) solidBox(props, [-257, LOWER + 46 + k * 4, TAPER_END - 57], [-218, LOWER + 50 + k * 4, TAPER_END - 13], PAINT.towels[k], PAINT.towels[k], tag('stucco'));
  for (const z of [TAPER_END - 58, TAPER_END - 12]) for (const x of [-255, -220]) tube(props, [[x, LOWER, z], [x, LOWER + 6, z]], 2.5, '#2b2d2b', METAL, 6);
}

/** Chain link round the back of the lot and along the mini-mall's side. */
function lotFence(props: Bake, mesh: Bake) {
  chainLink(props, mesh, [-640, TAPER_END - 2 * F], [-640, -2420], LOWER, 6 * FT);
  chainLink(props, mesh, [-640, -2420], [-150, -2420], LOWER, 6 * FT);
}

/**
 * Wooden utility poles down the alley behind the wash: crossarms with insulators, a transformer can, three
 * sagging primaries and a heavier communications cable below them.
 */
function powerLines(props: Bake) {
  const x = -1200;
  const poles = [-3000, -2350, -1700, -1050, -400, 250, 900, 1550, 2200, 2850];
  const top = LOWER + 26 * F;
  poles.forEach((z, i) => {
    tube(props, [[x, LOWER, z], [x, top + 12, z]], [7, 5], mixHex(PAINT.wood, PAINT.woodGrey, hash2(i, 1, 290)), part(255, 'stucco', 4), 7);
    solidBox(props, [x - 4, top - 4, z - 70], [x + 4, top + 4, z + 70], PAINT.wood, PAINT.wood, tag('stucco'));
    for (const dz of [-60, 0, 60]) tube(props, [[x, top + 4, z + dz], [x, top + 10, z + dz]], 1.6, '#c9c6b8', METAL, 6);
    if (i % 3 === 1) tube(props, [[x + 9, top - 45, z], [x + 9, top - 8, z]], 9, '#7b7f78', METAL, 10);
  });
  for (let i = 1; i < poles.length; i++) {
    const a = poles[i - 1], b = poles[i];
    for (const [dz, y, sag, r] of [[-60, top + 10, 38, 0.7], [0, top + 10, 38, 0.7], [60, top + 10, 38, 0.7], [0, top - 70, 30, 1.3]] as const) {
      const wire: Vec3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        wire.push([x, y - Math.sin(t * Math.PI) * sag, a + (b - a) * t + dz]);
      }
      tube(props, wire, r, PAINT.wire, METAL, 3, false);
    }
  }
}

/** Every piece of street life, its poles and posts casting rail shadows, its chain link into `mesh`. */
export function buildSunsetStreetscape(props: Bake, mesh: Bake, rails: RailShadow[]) {
  hydrant(props);
  busStop(props, rails);
  trashCan(props);
  streetlights(props, rails);
  weeds(props);
  lot(props);
  lotFence(props, mesh);
  powerLines(props);
}
