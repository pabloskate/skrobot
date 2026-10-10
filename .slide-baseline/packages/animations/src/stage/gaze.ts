import { smoothstep, type V3 } from '../math';
import { FLIP_T, ROLL_IN } from '../motion/trick';
import { WHEEL_BOTTOM } from '../board/board';
import type { StageFrame, StagePlan } from './stage';

/**
 * Where the rider is looking, through an attempt. A skater reads the spot
 * first: rolling in, the eyes are on the obstacle — the rail where the
 * trucks will lock, the lip of the stairs, or on flat ground the patch just
 * past where they'll pop. As they set their feet for the pop the eyes drop to
 * the board, and stay on it through the flip and the catch until it's back
 * on the ground (you can't time a catch you aren't watching). Locked on a
 * rail they look down it toward where they'll pop off; once landed, they look
 * up and ahead to roll away.
 *
 * The obstacle spots are where the board itself will be at those moments
 * (lock-in, the pop, the pop-off), pinned to the street: they slide toward
 * the rider with the scenery, exactly as the rail or the lip does.
 */

/** Seconds before a pop the eyes drop to the board: the setup. */
export const SETUP_LOOK = 0.3;
/** Seconds the eyes stay on the board after touchdown before looking up. */
const SETTLE = 0.12;
/** Seconds a change of target is blended over (the head's own lag is the rider's). */
const SHIFT = 0.12;
/** How far ahead (world units) a rider rolling away looks, and past the pop spot on flat ground. */
const AHEAD = 650;
const PAST_POP = 260;
/** On the rail: how far the eyes are drawn from the board toward the pop-off spot. */
const DOWN_THE_RAIL = 0.55;

/** A point fixed in the scenery: frame x plus the street's scroll, frame z plus the lane across a set. */
interface Spot {
  x: number;
  y: number;
  z: number;
}

interface Moments {
  pop: number;
  land: number;
  /** A grind's lock-in and pop-off. */
  lock: number | null;
  off: number | null;
  /** Whether the rider rolls away (no slam or slip). */
  rideAway: boolean;
  spots: { pop: Spot; land: Spot; lock: Spot | null; off: Spot | null };
  /** +1 or -1: which way along frame x the rider travels. */
  travel: 1 | -1;
}

const across = (frame: StageFrame) => frame.stairs?.across ?? 0;
const pin = (frame: StageFrame, p: V3): Spot => ({ x: p.x + frame.scroll, y: p.y, z: p.z + across(frame) });
const unpin = (frame: StageFrame, s: Spot): V3 => ({ x: s.x - frame.scroll, y: s.y, z: s.z - across(frame) });

const cache = new WeakMap<StagePlan, Moments>();

/** The attempt's key moments and spots, worked out once per plan from frames at those moments. */
function momentsOf(stage: StagePlan, frameAt: (t: number) => StageFrame): Moments {
  const known = cache.get(stage);
  if (known) return known;
  const { grind, stairs } = stage;
  const pop = grind?.pop ?? stairs?.pop ?? ROLL_IN;
  const land = grind?.land ?? stairs?.land ?? ROLL_IN + FLIP_T;
  const lock = grind?.lockAt ?? null;
  const off = grind?.off ?? null;
  const boardAt = (t: number) => {
    const frame = frameAt(t);
    return pin(frame, frame.rig.board.center);
  };
  const spots = {
    pop: boardAt(pop),
    land: boardAt(land),
    lock: lock == null ? null : boardAt(lock),
    off: off == null ? null : boardAt(off),
  };
  const moments: Moments = {
    pop, land, lock, off,
    rideAway: grind ? grind.fail == null : stage.landed,
    spots,
    travel: spots.land.x >= spots.pop.x ? 1 : -1,
  };
  cache.set(stage, moments);
  return moments;
}

const lerp = (a: V3, b: V3, k: number): V3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

/**
 * Where the eyes are on at `frame.t`, in the frame's own (physics) coordinates.
 * `frameAt` gives the attempt's frame at another time, without a gaze.
 */
export function gazeAt(stage: StagePlan, frame: StageFrame, frameAt: (t: number) => StageFrame): V3 {
  const m = momentsOf(stage, frameAt);
  const t = frame.t;
  const board = frame.rig.board.center;
  // The ground under the board, `distance` ahead along the way the rider travels.
  const ahead = (distance: number): V3 => ({ x: board.x + m.travel * distance, y: board.y + WHEEL_BOTTOM, z: board.z });
  const spot = (s: Spot) => unpin(frame, s);

  // Each look from its start time, in order; blended over SHIFT at each change.
  const looks: [number, () => V3][] = [];
  if (m.lock != null && m.off != null && m.spots.lock && m.spots.off) {
    const lockSpot = m.spots.lock, offSpot = m.spots.off;
    looks.push([-Infinity, () => spot(lockSpot)]);
    looks.push([m.pop - SETUP_LOOK, () => board]);
    looks.push([m.lock + 0.1, () => lerp(board, spot(offSpot), DOWN_THE_RAIL)]);
    looks.push([m.off - SETUP_LOOK * 0.8, () => board]);
  } else if (stage.stairs) {
    const lip = m.spots.pop;
    looks.push([-Infinity, () => spot(lip)]);
    looks.push([m.pop - SETUP_LOOK, () => board]);
  } else {
    const popSpot = m.spots.pop;
    looks.push([-Infinity, () => {
      const p = spot(popSpot);
      return { x: p.x + m.travel * PAST_POP, y: p.y + WHEEL_BOTTOM, z: p.z };
    }]);
    looks.push([m.pop - SETUP_LOOK, () => board]);
  }
  if (m.rideAway) looks.push([m.land + SETTLE, () => ahead(AHEAD)]);

  let at = looks[0][1]();
  for (let i = 1; i < looks.length; i++) {
    const [start, look] = looks[i];
    const k = smoothstep((t - (start - SHIFT / 2)) / SHIFT);
    if (k <= 0) break;
    at = k >= 1 ? look() : lerp(at, look(), k);
  }
  return at;
}
