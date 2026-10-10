import type { Handrail } from '../../motion/grind';
import { FOOT, type DropTerrain } from '../elToro/stairs';

/**
 * The Miami triangle gap: the Challenger Memorial in Bayfront Park, on
 * Biscayne Boulevard. Off the sharp corner of the raised triangular terrace
 * under Isamu Noguchi's tower, over a short gap onto the tilted granite
 * triangle that carries the astronauts' names, down its face and off its low
 * edge onto the plaza; or clear the triangle entirely. The plan is measured
 * off aerial imagery, the plaza and lawn levels off the county's lidar, and
 * the slab's height and the gap off The Berrics' measured overlay, checked
 * against riders in the clips; see
 * docs/MIAMI_TRIANGLE_REFERENCE.md for which is which.
 *
 * +x runs from the terrace's tip down the slab's fall line and out across
 * the plaza (about south-west); y = 0 is the terrace top. Looking down the
 * line, −z is left (south-east, toward the park's south drive) and +z right
 * (north-west, toward Biscayne Boulevard).
 */
export const MIAMI_FOOT = FOOT;
const F = FOOT;
const TAN30 = Math.tan(Math.PI / 6);
const COS30 = Math.cos(Math.PI / 6);

/**
 * The terrace top over the plaza. The Berrics' measured overlay puts the
 * slab's apex 5 ft up and level with the box; Ehrlund's side-on clip shows
 * the two level too.
 */
export const MIAMI_DROP = 5 * F;
export const MIAMI_PLAZA_Y = -MIAMI_DROP;

/**
 * The plaza's planter wall runs square to the line, its face 2 ft out from
 * the terrace's tip (the aerial's corner is the wall's coping, not the tip);
 * the plaza is the right isosceles triangle in front of it, the wall its
 * long side and the tip that side's middle.
 */
export const MIAMI_WALL_X = 2 * F;
export const MIAMI_WALL_TOP = MIAMI_PLAZA_Y + 1.5 * F;
export const MIAMI_WALL_THICK = 0.6 * F;
export const MIAMI_PLAZA_HALF = 59.5 * F;

/** The raised terrace: an equilateral triangle with the tower at its middle, one corner the tip. */
export const MIAMI_TERRACE_SIDE = 88 * F;
export const MIAMI_TERRACE_BACK = -MIAMI_TERRACE_SIDE * Math.sqrt(3) / 2;
export const MIAMI_TOWER_X = MIAMI_TERRACE_BACK * 2 / 3;
/** Half the terrace's width `x` behind its tip (x ≤ 0). */
export const miamiTerraceHalf = (x: number) => -x * TAN30;

/**
 * The deck's raised rim: the box's top edge is a curb of the same white
 * concrete, 3 in over the deck and 9 in wide, curving up out of the deck
 * along its inner side. Riders pop on the flat, before it, and ollie over
 * it (the clips); along the line its two arms meet 1½ ft behind the tip.
 */
export const MIAMI_RIM_WIDTH = 0.75 * F;
export const MIAMI_RIM_HEIGHT = 0.25 * F;
/** How much of the rim's width, on its inner side, curves up out of the deck. */
export const MIAMI_RIM_CURVE = 0.35 * F;
/** How far a point on the terrace is in from its nearest edge. */
export const miamiTerraceInset = (x: number, z: number) => Math.min(-x / 2 - Math.abs(z) * COS30, x - MIAMI_TERRACE_BACK);
/** The rim's height `d` in from the edge: flat on top, then curving down into the deck. */
export function miamiRim(d: number): number {
  const s = Math.min(1, Math.max(0, (MIAMI_RIM_WIDTH - d) / MIAMI_RIM_CURVE));
  return MIAMI_RIM_HEIGHT * s * s * (3 - 2 * s);
}

/**
 * Where the rider pops, on the line: on the flat a few feet short of the
 * rim, rather than at the very tip. A nollie or fakie pops off the leading
 * end, which drags a moment before it lifts; from here even that end rises
 * over the rim.
 */
export const MIAMI_POP_X = -4.75 * F;

/** The lawns either side of the terrace mound up to about three feet over the plaza (lidar). */
export const MIAMI_LAWN_Y = MIAMI_PLAZA_Y + 3.1 * F;
const LAWN_RISE = 12 * F;

/**
 * The granite slab, as seen from above: an equilateral triangle 8½ feet a
 * side (aerial), its apex pointing back at the tip, 5½ ft out from it (the
 * Berrics' overlay). It tilts down along the line, about 24°, from the apex
 * (5 ft up) to the middle of its far side (1¾ ft up). That low edge is a
 * foot-thick plate standing ¾ ft clear of the paving (photos from the low
 * end), on a pedestal under the slab's lower half: rolling off it is a real
 * drop.
 */
export const MIAMI_SLAB_SIDE = 8.5 * F;
export const MIAMI_SLAB_APEX_X = 5.5 * F;
export const MIAMI_SLAB_RUN = MIAMI_SLAB_SIDE * Math.sqrt(3) / 2;
export const MIAMI_SLAB_LIP_X = MIAMI_SLAB_APEX_X + MIAMI_SLAB_RUN;
export const MIAMI_SLAB_APEX_Y = MIAMI_PLAZA_Y + 5 * F;
export const MIAMI_SLAB_LIP_Y = MIAMI_PLAZA_Y + 1.75 * F;
export const MIAMI_SLAB_GRADE = (MIAMI_SLAB_APEX_Y - MIAMI_SLAB_LIP_Y) / MIAMI_SLAB_RUN;
/** The slab's edges are cut plumb; this is their height, top face to underside. */
export const MIAMI_SLAB_THICK = 1 * F;
/** The pedestal under the slab's lower half, along the line, kept inside its outline. */
export const MIAMI_PEDESTAL_X0 = MIAMI_SLAB_APEX_X + 2.2 * F;
export const MIAMI_PEDESTAL_X1 = MIAMI_SLAB_LIP_X - 1.8 * F;
export const MIAMI_PEDESTAL_HALF = 1.1 * F;

/** The slab's polished face `x` down the line. */
export const miamiSlabTop = (x: number) => MIAMI_SLAB_APEX_Y - MIAMI_SLAB_GRADE * (x - MIAMI_SLAB_APEX_X);
/** Half the slab's width `x` down the line, on its face. */
export const miamiSlabHalf = (x: number) => (x - MIAMI_SLAB_APEX_X) * TAN30;
/** Whether a plan point is under the slab's face. */
export const onMiamiSlab = (x: number, z: number) =>
  x >= MIAMI_SLAB_APEX_X && x <= MIAMI_SLAB_LIP_X && Math.abs(z) <= miamiSlabHalf(x);

/** Where the gap to the bank touches down: a little under halfway down the face, where it's over 3½ ft wide. */
export const MIAMI_BANK_LAND_X = MIAMI_SLAB_APEX_X + 3.2 * F;
/** Over the whole triangle, onto the paving past its low edge. */
export const MIAMI_GAP_LAND_X = MIAMI_SLAB_LIP_X + 3.5 * F;

/**
 * The lawns fill the rectangle behind the plaza's wall either side of the
 * terrace, ringed by the same low planter wall: the plaza's (x = WALL_X),
 * one at each end (|z| = PLAZA_HALF) and one along the back
 * (x = TERRACE_BACK). They mound up from the wall tops toward the middle.
 */
export function miamiLawn(x: number, z: number): number {
  const rise = (d: number) => {
    const p = Math.min(1, Math.max(0, d / LAWN_RISE));
    return p * p * (3 - 2 * p);
  };
  const front = MIAMI_WALL_X - MIAMI_WALL_THICK - x;
  const end = MIAMI_PLAZA_HALF - MIAMI_WALL_THICK - Math.abs(z);
  const back = x - MIAMI_TERRACE_BACK - MIAMI_WALL_THICK;
  return MIAMI_WALL_TOP + (MIAMI_LAWN_Y - MIAMI_WALL_TOP) * rise(front) * rise(end) * rise(back);
}

/** Ground a rider or shadow actually meets: terrace, planter walls and lawns, the slab's face, the plaza and the park around it. */
export function miamiSurface(x: number, z: number): number {
  if (onMiamiSlab(x, z)) return miamiSlabTop(x);
  if (x >= MIAMI_WALL_X || x < MIAMI_TERRACE_BACK || Math.abs(z) > MIAMI_PLAZA_HALF) return MIAMI_PLAZA_Y;
  if (x <= 0 && Math.abs(z) <= miamiTerraceHalf(x)) return miamiRim(miamiTerraceInset(x, z));
  const end = Math.abs(z) >= MIAMI_PLAZA_HALF - MIAMI_WALL_THICK;
  if (x >= MIAMI_WALL_X - MIAMI_WALL_THICK || end || x < MIAMI_TERRACE_BACK + MIAMI_WALL_THICK) return MIAMI_WALL_TOP;
  return miamiLawn(x, z);
}

/** Heights down the line: the terrace and its rim, the gap, the slab's face, then the plaza. */
export const miamiGround = (u: number) => miamiSurface(u, 0);

/** The signed gradient down the line: the slab's face, flat everywhere else. */
export const miamiSlope = (u: number) => (onMiamiSlab(u, 0) ? -MIAMI_SLAB_GRADE : 0);

/**
 * Grinding the slab. Its two upper edges run from the apex down to the low
 * corners, 30° either side of the line, falling 3¼ ft over their 8½: plumb
 * granite ledges with the slab's face behind them. Skaters (Jamie Foy, Chad
 * Muska) roll along the deck parallel to the edge they'll take, so beside
 * the terrace's other side, carve in a little and pop off near the tip, and
 * come down onto that edge from outside it a couple of feet below the apex;
 * then grind it down and off its low corner onto the plaza. Which edge is
 * the trick's: the one with the slab on the far side of the approach it
 * names, as El Toro's side rails are.
 */
export const MIAMI_EDGE_YAW = 30;
/** How far the edge falls per unit along it. */
export const MIAMI_EDGE_FALL = (MIAMI_SLAB_APEX_Y - MIAMI_SLAB_LIP_Y) / MIAMI_SLAB_SIDE;
/**
 * Where a grind onto the right-hand edge pops (mirrored for the left): on
 * the flat a couple of feet short of the rim, just left of the line, so the
 * line in crosses the tip toward the edge.
 */
export const MIAMI_GRIND_POP = { x: -4.5 * F, z: -0.6 * F };
/** Rolling in: quicker than El Toro's rail roll-in, for the gap. */
export const MIAMI_GRIND_SPEED = 16 * F;
/** The least hop off the deck brings the board's center down this far along the edge from the apex. */
export const MIAMI_GRIND_LOCK = 1.75 * F;
/** A granite edge, barely rounded. */
const EDGE_RADIUS = 1;

/** One of the slab's edges as a grind rides it, and where its line runs in the set. */
export interface MiamiLedge {
  handrail: Handrail;
  /** Where its line starts (the apex) and its heading, degrees off +x toward +z. */
  x: number;
  z: number;
  yaw: number;
}

/**
 * The edge on the right going down (`side` 1, +z) or the left (−1), in its own
 * frame: `s` along it from the apex, `z` across it toward its right.
 */
export function miamiLedge(side: 1 | -1): MiamiLedge {
  const yaw = side * MIAMI_EDGE_YAW;
  const c = Math.cos((yaw * Math.PI) / 180), s = Math.sin((yaw * Math.PI) / 180);
  const at = (along: number, across = 0) => ({ x: MIAMI_SLAB_APEX_X + along * c - across * s, z: along * s + across * c });
  const pop = { x: MIAMI_GRIND_POP.x - MIAMI_SLAB_APEX_X, z: side * MIAMI_GRIND_POP.z };
  return {
    x: MIAMI_SLAB_APEX_X,
    z: 0,
    yaw,
    handrail: {
      start: 0,
      end: MIAMI_SLAB_SIDE,
      top: MIAMI_SLAB_APEX_Y,
      slope: MIAMI_EDGE_FALL,
      radius: EDGE_RADIUS,
      ground: (along, across = 0) => {
        const p = at(along, across);
        return miamiSurface(p.x, p.z);
      },
      // Off the edge a slip falls outside it, onto the plaza.
      rest: () => MIAMI_PLAZA_Y,
      speed: MIAMI_GRIND_SPEED,
      edge: true,
      // The face behind the edge falls away from it across, as the slab tilts down the line.
      ledge: { fall: MIAMI_SLAB_GRADE * Math.sin(Math.PI / 6) },
      takeoff: { s: pop.x * c + pop.z * s, off: Math.abs(pop.z * c - pop.x * s), lock: MIAMI_GRIND_LOCK },
    },
  };
}

export const MIAMI_LEDGES = { left: miamiLedge(-1), right: miamiLedge(1) } as const;

/**
 * Gap to bank, the line most of the clips skate: off the tip, onto the
 * slab, down its face and off its raised low edge to the plaza. Popped on
 * the deck short of the rim, even a low popper ollies up and out over the
 * rim and the slab's apex, which is level with the deck: this least pop
 * keeps every flip and spin clear of the rim (a tenth of a foot, with a
 * notch to spare) and well over the apex.
 */
export const MIAMI_BANK_TERRAIN: DropTerrain = {
  drop: MIAMI_DROP,
  run: MIAMI_BANK_LAND_X,
  landPast: 0,
  laneZ: 0,
  ground: miamiGround,
  surface: miamiSurface,
  slope: miamiSlope,
  entry: { x: MIAMI_POP_X, z: 0, yaw: 0 },
  pop: 1.1,
};

/**
 * Over the triangle (Blake Carpenter's line): clear the slab, apex to low
 * edge, and land on the paving. This least pop, like the bank's, is what
 * keeps every flip and spin clear of the rim (with a notch to spare); the
 * apex is then passed with most of a foot to spare.
 */
export const MIAMI_GAP_TERRAIN: DropTerrain = {
  drop: MIAMI_DROP,
  run: MIAMI_GAP_LAND_X,
  landPast: 0,
  laneZ: 0,
  ground: miamiGround,
  surface: miamiSurface,
  entry: { x: MIAMI_POP_X, z: 0, yaw: 0 },
  pop: 1.25,
};
