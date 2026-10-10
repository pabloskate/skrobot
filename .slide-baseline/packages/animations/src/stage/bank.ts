import type { V3 } from '../math';
import { rotY, smoothstep } from '../math';
import { ASPHALT } from '../camera/view';
import { GROUND, X0 } from '../motion/trick';
import type { Frame3, Rig } from '../motion/skeleton';
import { rideGrade, routeHeight, type StairPlan } from '../sets/elToro/stairs';
import { WHEEL_X } from '../board/board';

/**
 * Seconds past touchdown the rider is still leaning into the bank: its board
 * meets the bank a little flatter than it, so the uphill truck lands first
 * and the nose comes down onto the bank just after.
 */
export const LEAN_PAST_TOUCHDOWN = 0.12;

/**
 * Turn into the bank, then pitch into its plane (finishing just after
 * touchdown), preserving local foot/board transforms. Down a roll-in the
 * rider rides square to the ramp under the board, as gravity along it
 * leaves them standing.
 */
export function bankRig(rig: Rig, plan: StairPlan, time: number, u: number, heading = 0): Rig {
  const { terrain } = plan;
  const rolling = plan.dropIn != null && time <= plan.pop;
  if (!terrain.slope && !heading && !rolling) return rig;
  const landing = terrain.run + terrain.landPast;
  // The axle-to-axle chord rolls both trucks through the rounded bank toe,
  // and tips the nose down off a raised edge until both are on the ground.
  const slope = !terrain.slope ? 0 : time < plan.land
    ? terrain.slope(landing)
    : (routeHeight(plan, u + WHEEL_X) - routeHeight(plan, u - WHEEL_X)) / (2 * WHEEL_X);
  const leanFrom = plan.pop + 0.66 * plan.flight;
  const angle = rolling
    ? -Math.atan(rideGrade(plan, time))
    : -Math.atan(slope) * smoothstep((time - leanFrom) / (plan.land + LEAN_PAST_TOUCHDOWN - leanFrom));
  if (Math.abs(angle) < 1e-9 && Math.abs(heading) < 1e-9) return rig;
  const c = Math.cos(angle), s = Math.sin(angle);
  const pivot = { x: X0, y: rig.board.center.y + ASPHALT - GROUND };
  const direction = (d: V3): V3 => {
    const turned = rotY(d, -heading);
    return { x: c * turned.x - s * turned.y, y: s * turned.x + c * turned.y, z: turned.z };
  };
  const point = (p: V3): V3 => {
    const d = direction({ x: p.x - pivot.x, y: p.y - pivot.y, z: p.z });
    return { x: d.x + pivot.x, y: d.y + pivot.y, z: d.z };
  };
  const frame = (f: Frame3): Frame3 => ({
    origin: point(f.origin), fwd: direction(f.fwd), up: direction(f.up), side: direction(f.side),
    at: (x, y, z) => point(f.at(x, y, z)),
  });
  return {
    ...rig,
    board: { ...rig.board, center: point(rig.board.center), point: p => point(rig.board.point(p)), dir: d => direction(rig.board.dir(d)), yawDeg: rig.board.yawDeg - heading },
    legs: rig.legs.map(l => ({ ...l, hip: point(l.hip), knee: point(l.knee), ankle: point(l.ankle), shoe: frame(l.shoe) })) as Rig['legs'],
    arms: rig.arms.map(a => ({ ...a, shoulder: point(a.shoulder), elbow: point(a.elbow), hand: point(a.hand) })) as Rig['arms'],
    torso: frame(rig.torso), head: frame(rig.head),
    bodyYawDeg: rig.bodyYawDeg - heading,
    headYawDeg: rig.headYawDeg - heading,
  };
}
