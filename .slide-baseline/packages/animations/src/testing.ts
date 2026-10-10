import type { StageFrame } from './stage/stage';
import type { V3 } from './math';

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
    ...point(rig.board.point({ x: -48, y: 13, z: -10 })),
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
