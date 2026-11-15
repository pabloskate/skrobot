import type { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { INK, ft, plainBox, worldBox } from './leapOfFaithKit';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import { COURT } from './leapOfFaithFacade';

/**
 * The masses either side of the court, world axes in feet: the tall retaining wall behind the stairs with its
 * pale cap, the left block on top of it (cream lower storey, white ribbed upper storey carried across to the
 * gallery), and the right wing (covered walk, window bands, doors, trim). Refs 20, 82, 91 (1998), 97 (later).
 */

/** One unit proud of a face: a band or a mark that must not fight the face under it. */
const PROUD = 1 / F;
/** The pale cap band along every painted top edge, about 5 in deep (refs 20, 82). */
export const CAP_BAND = 0.42;
/** The retaining wall's level top. */
const WALL_TOP = 2.5;
/** The right wing's upper window band and its lower storey's doors and windows, every 16 ft from x = -114. */
const BAY_FROM = -114;
const BAY_STEP = 16;
const WING_FACE = -56.06;
const WALK_BACK = -63;
const WING_END = 84;

export function buildLeapOfFaithBlocks(b: Bake) {
  retainingWall(b);
  leftBlock(b);
  rightWing(b);
}

/** A painted band, `CAP_BAND` deep under a top edge at `top`, a hair proud of a face square to x or z. */
function capBand(b: Bake, axis: 'x' | 'z', at: number, from: number, to: number, top: number, sign: 1 | -1) {
  const lo: Vec3 = axis === 'x' ? [at, top - CAP_BAND, from] : [from, top - CAP_BAND, at];
  const hi: Vec3 = axis === 'x' ? [at + PROUD, top, to] : [to, top, at + PROUD];
  const face = axis === 'x' ? (sign > 0 ? 'e' : 'l') : (sign > 0 ? 'f' : 'k');
  if (sign < 0) {
    if (axis === 'x') { lo[0] -= PROUD; hi[0] -= PROUD; } else { lo[2] -= PROUD; hi[2] -= PROUD; }
  }
  worldBox(b, lo, hi, PAINT.cap, { foot: COURT, faces: face });
}

/**
 * The tall wall on the far side of the fixed stair plan, level-topped, carried on past the stair's foot: painted
 * pale blue, its top and a band under it paler (refs 20, 82, 97).
 */
function retainingWall(b: Bake) {
  worldBox(b, [0, COURT, 9], [9, WALL_TOP, 9.5], PAINT.white, { top: PAINT.cap, faces: 'tkle' });
  worldBox(b, [8.5, COURT, 9.5], [9, WALL_TOP, 110], PAINT.white, { top: PAINT.cap, faces: 'tef' });
  // Its planter side, above the soil.
  worldBox(b, [0, 1.5, 9.5], [8.5, WALL_TOP, 9.5 + PROUD], PAINT.white, { faces: 'f' });
  worldBox(b, [8.5 - PROUD, 1.5, 9.5], [8.5, WALL_TOP, 110], PAINT.white, { faces: 'l' });
  capBand(b, 'z', 9, 0, 9, WALL_TOP, -1);
  capBand(b, 'x', 9, 9, 110, WALL_TOP, 1);
}

/**
 * The left block, standing on the terrace behind the planter: a cream lower storey with its brown door (ref 82),
 * the white vertical-ribbed upper storey overhanging the court by 3 ft (refs 20, 91), and above y = 12 that storey
 * carried across to the gallery deck, so no sky shows between them over the head of the stairs (refs 20, 82, 91).
 */
function leftBlock(b: Bake) {
  worldBox(b, [-60, 0, 24], [2, 10, 110], PAINT.cream, { kind: 'cast', faces: 'efkl' });
  const siding = { sides: INK.siding, underside: PAINT.cream };
  worldBox(b, [-60, 10, 24], [5, 20, 110], PAINT.siding, { ...siding, faces: 'befkl' });
  worldBox(b, [-60, 12, 9], [5, 20, 24], PAINT.siding, { ...siding, faces: 'bekl' });
  worldBox(b, [-60.5, 20, 8.5], [5.5, 20.5, 110.5], PAINT.concrete, { kind: 'cast', foot: -40 });
  // The brown door on the court face, in a frame.
  b.box([2 * F + 1, 0, 28.5 * F], [2 * F + 2, 7 * F, 31.5 * F], PAINT.door, PAINT.door, INK.metal);
  plainBox(b, [2, 0, 28.25], [2.12, 7.25, 28.5], PAINT.doorFrame, INK.metal, 'tfke');
  plainBox(b, [2, 0, 31.5], [2.12, 7.25, 31.75], PAINT.doorFrame, INK.metal, 'tfke');
  plainBox(b, [2, 7, 28.5], [2.12, 7.25, 31.5], PAINT.doorFrame, INK.metal, 'tbe');
}

/**
 * The right wing: its face the plane z = -56 (SITE_PLAN.md block 4). Upstairs a band of steel-sash windows;
 * downstairs a covered walk seven feet deep on slim posts, doors in frames scuffed at the foot and windows behind
 * it; a pale blue trim band and a flat roof running on over the terrace.
 */
function rightWing(b: Bake) {
  worldBox(b, [-120, 0, -116], [85, 12, WING_FACE], PAINT.cream, { kind: 'cast', foot: -40, faces: 'fel' });
  worldBox(b, [0, COURT, -116], [85, 0, WALK_BACK], PAINT.cream, { kind: 'cast', faces: 'fe', use: [0.12, 0] });
  worldBox(b, [0, -1, WALK_BACK], [85, 0, -56], PAINT.white, { underside: PAINT.cream, foot: -40, faces: 'bfe' });
  worldBox(b, [-122, 12, -118], [87, 12.6, -56], PAINT.concrete, { kind: 'cast', foot: -40 });
  for (let x = 5; x < 85; x += 16) worldBox(b, [x, COURT, -56.8], [x + 0.8, -1, -56], PAINT.white, { faces: 'fkle', use: [0.3, 0] });
  for (let x = BAY_FROM; x < 80; x += BAY_STEP) {
    window(b, x, Math.min(x + 12, WING_END), 4, 9, WING_FACE);
    if (x > 0 && x + 5 < WING_END) {
      door(b, x, x + 3);
      if (x + 6 < WING_END) window(b, x + 6, Math.min(x + 12, WING_END), -9, -5, WALK_BACK);
    }
  }
  worldBox(b, [-120, 0, -56.03], [85, 0.8, -56], PAINT.white, { foot: -40, faces: 'tfel' });
}

/**
 * A window on a face at `z` facing +z: the glass and its steel sash (the look's sash surface), and a concrete sill
 * where the court sees it (over the terrace a sill would stand into the walkway's clear volume).
 */
function window(b: Bake, x0: number, x1: number, y0: number, y1: number, z: number) {
  b.quad(ft([x0, y0, z + PROUD]), ft([x1, y0, z + PROUD]), ft([x1, y1, z + PROUD]), ft([x0, y1, z + PROUD]), [0, 0, 1], { color: PAINT.glass }, INK.sash);
  if (x0 - 0.2 >= 0) worldBox(b, [x0 - 0.2, y0 - 0.22, z], [x1 + 0.2, y0, z + 0.22], PAINT.concrete, { kind: 'cast', foot: -40, faces: 'tfle' });
}

/** A brown door in the walk's back wall, framed, its foot dark with kicks and scuffs. */
function door(b: Bake, x0: number, x1: number) {
  const z = WALK_BACK;
  b.quad(ft([x0, COURT, z + PROUD]), ft([x1, COURT, z + PROUD]), ft([x1, -6.8, z + PROUD]), ft([x0, -6.8, z + PROUD]), [0, 0, 1], { color: PAINT.door }, INK.metal);
  b.quad(ft([x0 + 0.05, COURT, z + 2 * PROUD]), ft([x1 - 0.05, COURT, z + 2 * PROUD]), ft([x1 - 0.05, COURT + 0.9, z + 2 * PROUD]), ft([x0 + 0.05, COURT + 0.9, z + 2 * PROUD]), [0, 0, 1], { color: PAINT.kick }, INK.metal);
  plainBox(b, [x0 - 0.25, COURT, z], [x0, -6.55, z + 0.12], PAINT.doorFrame, INK.metal, 'tfkle');
  plainBox(b, [x1, COURT, z], [x1 + 0.25, -6.55, z + 0.12], PAINT.doorFrame, INK.metal, 'tfkle');
  plainBox(b, [x0, -6.8, z], [x1, -6.55, z + 0.12], PAINT.doorFrame, INK.metal, 'tbf');
}
