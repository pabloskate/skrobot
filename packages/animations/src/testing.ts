import type { StageFrame } from './stage/stage';
import type { V3 } from './math';
import { WHEEL_BOTTOM, WHEEL_X, WHEEL_Z } from './board/board';
import { ASPHALT } from './camera/view';
import { X0 } from './motion/trick';
import type { RiderStance, Stance, Trick } from './types';

/**
 * Test helpers shared across the package's suites. Not exported from the
 * package: only tests import this.
 */

const point = (p: V3) => [p.x, p.y, p.z];

/** Every number a stage frame hands the renderer, so a suite can check none is NaN or infinite. */
export function frameNumbers(frame: StageFrame): number[] {
  const { rig } = frame;
  const frames = [rig.torso, rig.head, ...rig.legs.map((leg) => leg.shoe)];
  return [
    frame.t,
    frame.lift,
    frame.scroll,
    frame.wheels.angle,
    frame.wheels.sweep,
    ...point(rig.board.center),
    ...point(rig.board.point({ x: 48, y: 0, z: 10 })),
    ...point(rig.board.point({ x: -48, y: WHEEL_BOTTOM, z: -10 })),
    rig.board.flipDeg,
    rig.board.yawDeg,
    ...rig.legs.flatMap((leg) => [...point(leg.hip), ...point(leg.knee), ...point(leg.ankle)]),
    ...rig.arms.flatMap((arm) => [...point(arm.shoulder), ...point(arm.elbow), ...point(arm.hand)]),
    ...frames.flatMap((f) => [...point(f.origin), ...point(f.fwd), ...point(f.up), ...point(f.side)]),
    ...frame.dust.flatMap((puff) => [...point(puff.center), puff.radius, puff.opacity]),
    ...[frame.shadows.board, ...frame.shadows.body, ...frame.shadows.bar].flatMap((polygon) => polygon.flatMap((q) => [q.x, q.z])),
    frame.shadows.boardOpacity,
    frame.shadows.bodyOpacity,
    ...(frame.span ? [frame.span.x0, frame.span.x1] : []),
  ];
}

/** Whether every number in a stage frame is finite. */
export const isFiniteFrame = (frame: StageFrame) => frameNumbers(frame).every(Number.isFinite);

/**
 * The quick tier (`npm run test:quick`, ANIMATION_SWEEP=quick): the motion
 * sweeps thin out to a sample of their cases and frames, for a loop of
 * seconds while iterating. `npm test` (and `npm run check`) sweeps in full.
 */
export const QUICK_SWEEP = process.env.ANIMATION_SWEEP === 'quick';

/** Every case in full; in the quick tier every `stride`th one, starting with the first. */
export const sweep = <T>(cases: readonly T[], stride = 3): readonly T[] =>
  QUICK_SWEEP ? cases.filter((_, i) => i % stride === 0) : cases;

/** Frames per second a sweep samples at: `full`, or a quarter of it (at least 15) in the quick tier. */
export const sweepHz = (full: number) => (QUICK_SWEEP ? Math.max(15, full / 4) : full);

/**
 * A full sweep's time limit. Files run side by side, which can slow a sweep
 * several times over on a busy machine, so the limit only catches a hang.
 */
export const SWEEP_TIMEOUT = 240_000;

/** Every trick stance, and both ways a rider stands: what a sweep goes through. */
export const STANCES: readonly Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
export const RIDERS: readonly RiderStance[] = ['regular', 'goofy'];

/** A trick to stage, from its catalog base. */
export const trickNamed = (base: string, stance: Stance = 'regular'): Pick<Trick, 'id' | 'name' | 'base' | 'stance'> => ({ id: base, name: base, base, stance });

/**
 * How far the lowest wheel is over the ground under it: 0 rolling on it,
 * positive in the air, negative sunk into it. `ground` is the height at a
 * point of the spot (along the drop from its lip, and across it); `dir` is
 * the way the attempt travels along it.
 */
export function wheelClearance(frame: StageFrame, ground: (along: number, across: number) => number, dir: 1 | -1 = 1): number {
  let low = Infinity;
  for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
    const p = frame.rig.board.point({ x, y: WHEEL_BOTTOM, z });
    const along = (p.x - X0) + frame.scroll * dir;
    low = Math.min(low, ASPHALT - ground(along, (frame.stairs?.across ?? 0) + p.z) - p.y);
  }
  return low;
}
