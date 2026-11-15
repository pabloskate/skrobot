import type { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { INK, plainBox, tubeFt } from './leapOfFaithKit';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';

/**
 * The court's furniture, world axes in feet: heavy pale-plank picnic tables and benches on painted steel A-frames
 * (refs 20, 82, 91, 143). The planks are thick and few, two to a top with a gap a camera can see; the frames are
 * stout tube with a diagonal brace each end. Every piece keeps inside the extents the clearance tests use (2.9 ft
 * either side across, 4 ft along, 2.6 ft high for a table; 0.9, 4 and 1.6 ft for a bench).
 */

/**
 * The picnic tables, [x, floor y, z] in feet, long axis along z: two against the undercroft's back wall (ref 82),
 * five out in the court left of the rider's line (refs 91, 20), two on the upper terrace.
 */
export const LEAP_OF_FAITH_TABLES = [
  [-10, -14.3, -14], [-10, -14.3, -31],
  [48, -14.3, 4], [55, -14.3, 12], [68, -14.3, 28], [43, -14.3, 40], [65, -14.3, 45],
  [-65, 0, -10], [-105, 0, -12],
] as const;
/** The two benches along the foot of the big wall (ref 82), [x, z] in feet, on the court's floor. */
export const LEAP_OF_FAITH_BENCHES = [[20, 11], [20, 22]] as const;
const COURT = -14.3;

/** Frame tube radii, set units: legs, cross bars and braces (about 2 in, 1.6 in and 1.2 in across). */
const LEG = 2.4;
const BAR = 2;
const BRACE = 1.6;

export function buildLeapOfFaithFurniture(b: Bake) {
  for (const [x, y, z] of LEAP_OF_FAITH_TABLES) picnicTable(b, x, y, z);
  for (const [x, z] of LEAP_OF_FAITH_BENCHES) bench(b, x, COURT, z);
}

/** A plank from `lo` to `hi`, relative to `at`: pale paint on its top, its sides a touch darker where the paint has worn. */
function plank(b: Bake, at: Vec3, lo: Vec3, hi: Vec3) {
  const add = (p: Vec3): Vec3 => [at[0] + p[0], at[1] + p[1], at[2] + p[2]];
  plainBox(b, add(lo), add(hi), PAINT.tableEdge, INK.stucco, 'tbfkle', PAINT.tableTop);
}

/**
 * An eight-foot picnic table: a top of two thick planks, a seat plank either side, and at each end a steel
 * A-frame, its legs splayed from the top to the ground, a bar under the seats and a brace up to the top's middle.
 */
function picnicTable(b: Bake, x: number, y: number, z: number) {
  const at: Vec3 = [x, y, z];
  plank(b, at, [-1.3, 2.38, -4], [-0.05, 2.55, 4]);
  plank(b, at, [0.05, 2.38, -4], [1.3, 2.55, 4]);
  plank(b, at, [-2.75, 1.33, -4], [-1.7, 1.5, 4]);
  plank(b, at, [1.7, 1.33, -4], [2.75, 1.5, 4]);
  for (const end of [-2.6, 2.6]) {
    const zz = z + end;
    for (const side of [-1, 1]) tubeFt(b, [[x + side * 2.4, y + 0.04, zz], [x + side * 0.9, y + 2.38, zz]], LEG, PAINT.tableFrame, INK.metal, 6);
    tubeFt(b, [[x - 2.7, y + 1.28, zz], [x + 2.7, y + 1.28, zz]], BAR, PAINT.tableFrame, INK.metal, 6);
    tubeFt(b, [[x - 1.25, y + 2.33, zz], [x + 1.25, y + 2.33, zz]], BAR, PAINT.tableFrame, INK.metal, 6);
    tubeFt(b, [[x, y + 1.28, zz], [x, y + 2.33, z + Math.sign(end) * 0.6]], BRACE, PAINT.tableFrame, INK.metal, 6);
  }
}

/** An eight-foot bench: one thick plank on two splayed steel frames and a stretcher between them. */
function bench(b: Bake, x: number, y: number, z: number) {
  plank(b, [x, y, z], [-0.55, 1.38, -4], [0.55, 1.58, 4]);
  for (const end of [-2.8, 2.8]) {
    for (const side of [-1, 1]) tubeFt(b, [[x + side * 0.75, y + 0.04, z + end], [x + side * 0.35, y + 1.38, z + end]], BAR, PAINT.tableFrame, INK.metal, 6);
    tubeFt(b, [[x - 0.6, y + 0.62, z + end], [x + 0.6, y + 0.62, z + end]], BRACE, PAINT.tableFrame, INK.metal, 6);
  }
  tubeFt(b, [[x, y + 0.62, z - 2.8], [x, y + 0.62, z + 2.8]], BRACE, PAINT.tableFrame, INK.metal, 6);
}
