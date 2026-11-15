import type { Vec3 } from '../../camera/view';
import { stairContacts, type ContactLine } from '../surfaces';
import { FLOOR, caster, mirror, stairVertex, type BoxShadow } from './leapOfFaithKit';
import {
  LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_LOWER_RUN, LEAP_OF_FAITH_LOWER_STEPS,
  LEAP_OF_FAITH_MID_DROP, LEAP_OF_FAITH_MID_END_Z, LEAP_OF_FAITH_STAIR_RUN, LEAP_OF_FAITH_STEPS, leapOfFaithStairPoint,
} from './leapOfFaithLayout';

/**
 * Where the light goes round the gap, world axes: the twelve shadow boxes and twelve contact lines the look
 * allows, picked for what the stock cameras see. The sun stands up and out over the court toward the stairs
 * (+x, +z), so the boxes that matter are those whose shade falls toward the undercroft and the landing.
 */

/**
 * The shadow boxes, in feet. The first is the walkway slab and its fascia carried back over the undercroft's
 * whole depth and across to the return: the sun stops at a hard line some 7 ft in from the fascia's foot, and
 * everything deeper sees less and less of the sky toward the ceiling (the look's `soffit`), as refs 20, 82 and 05
 * show. Boxes need not be the masses they stand for: each is the volume that keeps the sun or the sky off what
 * the cameras see.
 */
export function leapOfFaithShadowBoxes(): BoxShadow[] {
  const boxes: BoxShadow[] = [];
  const box = (min: Vec3, max: Vec3) => caster(boxes, min, max);
  const mid = -LEAP_OF_FAITH_MID_DROP / F;
  // Carried on past the return over the void under the walkway's head, so the bay's side wall sees as little
  // sky as its back wall does.
  box([-30, -3, -56], [0, 0, 9]);
  // The gallery deck with its edge beam and cross beams, over the walkway.
  box([-14, 10.4, -56], [1.5, 12.6, 9]);
  // The left block's upper storey carried across to the deck, then the block itself.
  box([-60, 12, 9], [5, 20.5, 24]);
  box([-60, 0, 24], [5, 20.5, 110]);
  // The right wing's upper storey over its covered walk: the walk's back wall stays in shade.
  box([0, -1, -116], [85, 12.6, -56]);
  // The tall wall's leg behind the upper flight, shading its treads.
  box([0, -14.3, 9], [9, 2.5, 9.5]);
  // The return beside the stair: its shade falls into the undercroft's left end.
  box([-0.7, -14.3, -5], [0.7, 0, 0]);
  // The stair block under the upper flight, the landing and the lower flight's head, shading the strip of court
  // in front of the big wall where the rider lands. No second box for the upper flight's top half: its square
  // end threw a blurred patch onto the big wall's first facet, where the real flight's slope throws none.
  box([0, -14.3, -0.7], [18.7, mid, 9]);
  // The three upper piers whose shade crosses the walkway in the stock views.
  box([-4.1, 0, -6], [-2.6, 12, -4.5]);
  box([-4.1, 0, -22.5], [-2.6, 12, -21]);
  box([-4.1, 0, -39.5], [-2.6, 12, -38]);
  // The perimeter wall: a strip of shade along its foot.
  box([85, -14.3, -56], [86, -7.3, 110]);
  return boxes;
}

/**
 * Contact darkening on the ground, set units: both flights' risers, the big wall's foot round the stair, the
 * tall wall's, the covered walk's and the perimeter wall's; and in the undercroft its back wall's foot and the
 * floor deep inside it, out of the open sky, fading out under the fascia. The undercroft's floor is drawn with
 * the ground's material, which has no sky occlusion of its own: this is it.
 */
export function leapOfFaithContacts(profile: [number, number][]): ContactLine[] {
  const riser = LEAP_OF_FAITH_MID_DROP / LEAP_OF_FAITH_STEPS;
  const upper = stairContacts(0, 0, 0, 9 * F, LEAP_OF_FAITH_STAIR_RUN / (LEAP_OF_FAITH_STEPS - 1), riser, LEAP_OF_FAITH_STEPS, 0.35 * F);
  const lower = stairContacts(0, -LEAP_OF_FAITH_MID_DROP, 0, 9 * F, LEAP_OF_FAITH_LOWER_RUN / (LEAP_OF_FAITH_LOWER_STEPS - 1), (LEAP_OF_FAITH_DROP - LEAP_OF_FAITH_MID_DROP) / LEAP_OF_FAITH_LOWER_STEPS, LEAP_OF_FAITH_LOWER_STEPS, 0.35 * F);
  const p = leapOfFaithStairPoint(0, -LEAP_OF_FAITH_MID_END_Z);
  const turn = ([x, y, z]: Vec3): Vec3 => [p.x - z, y, p.z + x];
  // The big wall's foot, one line per face of the fixed cheek (legacy elevation, carried through the stair's plan).
  const cheek = profile.slice(1).map(([end], i) => {
    const point = (z: number): Vec3 => {
      const at: Vec3 = [0.7 * F, FLOOR, z];
      return mirror(end <= 0 ? stairVertex(at) : at);
    };
    return { a: point(profile[i][0]), b: point(end), reach: 0.6 * F, strength: 0.25 };
  });
  return [
    { a: [9 * F, FLOOR, 25 * F], b: [9 * F, FLOOR, 110 * F], reach: 0.6 * F, strength: 0.3 },
    { a: [0, FLOOR, -63 * F], b: [85 * F, FLOOR, -63 * F], reach: 0.6 * F, strength: 0.3 },
    upper, { ...lower, a: turn(lower.a), b: turn(lower.b), step: [0, lower.step![1], lower.step![0]] },
    ...cheek,
    { a: [-14 * F, FLOOR, -5.7 * F], b: [-14 * F, FLOOR, -56 * F], reach: 2.4 * F, strength: 0.32 },
    { a: [-11.5 * F, FLOOR, -9 * F], b: [-11.5 * F, FLOOR, -52 * F], reach: 10.5 * F, strength: 0.3 },
    { a: [85 * F, FLOOR, -56 * F], b: [85 * F, FLOOR, 110 * F], reach: 0.6 * F, strength: 0.28 },
  ];
}
