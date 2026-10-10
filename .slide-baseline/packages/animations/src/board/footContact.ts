import { deckTopY, TIP_X } from './deck';
import { dot3, sub3 } from '../math';
import { moveFrame, type LegRig, type Rig } from '../motion/skeleton';
import { kneeBetween } from '../motion/grindRig';
import { boardHalfWidth } from './boardDimensions';
import { soleUnderside } from '../riders/shoe3d';

/** The drawn sole's underside, toe spring and rounded rim included, packed x, y, z. */
const SOLE_POINTS = Float32Array.from(soleUnderside().flatMap((p) => [p.x, p.y, p.z]));

/** deckTopY tabulated finely along the deck: it's looked up for every sole point, every frame. */
const TOP_STEP = 0.25;
const TOP = Float64Array.from({ length: Math.ceil((2 * TIP_X) / TOP_STEP) + 2 }, (_, i) => deckTopY(-TIP_X + i * TOP_STEP));
function gripAt(x: number): number {
  const k = (x + TIP_X) / TOP_STEP;
  const i = Math.floor(k);
  return TOP[i] + (TOP[i + 1] - TOP[i]) * (k - i);
}

export function solePenetration(rig: Rig, leg: LegRig): number {
  const grip = rig.board.dir({ x: 0, y: -1, z: 0 });
  if (dot3(leg.shoe.up, grip) < 0.25) return 0;
  const along = rig.board.dir({ x: 1, y: 0, z: 0 });
  const across = rig.board.dir({ x: 0, y: 0, z: 1 });
  const down = rig.board.dir({ x: 0, y: 1, z: 0 });
  const center = sub3(leg.shoe.origin, rig.board.center);
  // A flipping deck passing above a free foot must remain free to cover it.
  if (dot3(center, down) > deckTopY(dot3(center, along))) return 0;
  // The shoe's axes and origin in board axes, so each sole point is a few multiply-adds.
  const { fwd, up, side } = leg.shoe;
  const ox = dot3(center, along), oz = dot3(center, across), oy = dot3(center, down);
  const fx = dot3(fwd, along), ux = dot3(up, along), sx = dot3(side, along);
  const fz = dot3(fwd, across), uz = dot3(up, across), sz = dot3(side, across);
  const fy = dot3(fwd, down), uy = dot3(up, down), sy = dot3(side, down);
  let penetration = 0;
  for (let i = 0; i < SOLE_POINTS.length; i += 3) {
    const pf = SOLE_POINTS[i], pu = SOLE_POINTS[i + 1], ps = SOLE_POINTS[i + 2];
    const x = ox + pf * fx + pu * ux + ps * sx;
    if (Math.abs(x) >= TIP_X) continue;
    const z = oz + pf * fz + pu * uz + ps * sz;
    if (Math.abs(z) > boardHalfWidth(x)) continue;
    penetration = Math.max(penetration, oy + pf * fy + pu * uy + ps * sy - gripAt(x));
  }
  return penetration;
}

/** Resolve contact in 3D geometry, keeping the body and fixed leg lengths intact. */
export function clearFeet(rig: Rig): Rig {
  const grip = rig.board.dir({ x: 0, y: -1, z: 0 });
  return {
    ...rig,
    legs: rig.legs.map((leg) => {
      const depth = solePenetration(rig, leg);
      if (depth <= 0) return leg;
      const by = { x: grip.x * (depth + 0.15), y: grip.y * (depth + 0.15), z: grip.z * (depth + 0.15) };
      const ankle = { x: leg.ankle.x + by.x, y: leg.ankle.y + by.y, z: leg.ankle.z + by.z };
      return { ...leg, ankle, knee: kneeBetween(leg.hip, ankle, leg.knee), shoe: moveFrame(leg.shoe, by) };
    }) as [LegRig, LegRig],
  };
}
