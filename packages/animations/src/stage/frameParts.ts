import { LIGHT } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, boardShadowPoints, type WheelSpin } from '../board/board';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../board/deck';
import { clamp01, easeOutCubic, hull, type V3 } from '../math';
import type { GrindPlan } from '../motion/grind';
import { kneeBetween } from '../motion/grindRig';
import { moveFrame, tiltHead, type LegRig, type Rig } from '../motion/skeleton';
import { FLIP_T, JUMP, ROLL_IN } from '../motion/trick';
import { humanRig } from '../riders/human/humanRig';
import type { Expression } from '../riders/look';
import { skaterInfo, type Skater } from '../riders/skaters';
import type { BarSpan } from '../sets/bar';
import type { HeadPose } from '../types';

/**
 * What a stage frame is, and the pieces every kind of frame (flat ground,
 * a flat bar, down a stair set, down its handrail) is built from: the
 * rider's face, the board kept out of the ground, the person's proportions
 * and a lead-in head move put on the rig, dust kicked up, and the shadows
 * the board and rider cast.
 */

/** A dust puff: a disc in the world, seen face-on. */
export interface Puff {
  center: V3;
  radius: number;
  opacity: number;
}

/** A shadow outline on the ground, as (x, z) points. */
export type GroundPolygon = Array<{ x: number; z: number }>;

export interface StageFrame {
  /** The trick's clock (seconds). */
  t: number;
  rig: Rig;
  /** Crane height over its stock position. */
  lift: number;
  /** World units the street has rolled under the rider (signed by travel). */
  scroll: number;
  /** The bar's ends this frame, for a grind. */
  span: BarSpan | null;
  /**
   * Down a stair set: the fixed +x downhill direction, independent of stance,
   * the height (three's y) the cast shadows are laid at — the step the
   * rider's shadow falls on — and where across the set the rider's line runs
   * (the set's own z under the stage's z = 0): down the left-hand flight, or
   * on the rail a grind rides. Null on flat ground, where shadows lie
   * on the asphalt.
   */
  stairs: { dir: 1 | -1; shadowY: number; across: number } | null;
  wheels: WheelSpin;
  expression: Expression;
  dust: Puff[];
  shadows: {
    bar: GroundPolygon[];
    board: GroundPolygon;
    body: GroundPolygon[];
    /** Opacity of the board's and the rider's shadows: both fade as they rise. */
    boardOpacity: number;
    bodyOpacity: number;
  };
}

/** The rider's face through a grind: open on the approach, focused on the bar, happy once it's ridden away (or wincing in a slip). */
export function grindExpression(t: number, plan: GrindPlan): Expression {
  if (t < plan.pop) return 'open';
  if (plan.fail != null && t >= plan.fail) return t > plan.fail + 0.06 ? 'wince' : 'focus';
  if (t < plan.land) return 'focus';
  return t > plan.land + 0.14 ? 'happy' : 'focus';
}

/** The rider's face through a flatground trick. */
export function expressionAt(t: number, landed: boolean): Expression {
  const touchdown = ROLL_IN + FLIP_T;
  if (t < ROLL_IN) return 'open';
  if (t < touchdown) return 'focus';
  if (landed) return t > touchdown + 0.14 ? 'happy' : 'focus';
  return t > touchdown + 0.06 ? 'wince' : 'focus';
}

/**
 * The ground hull of points cast along the sun onto the asphalt, each
 * widened by `r`, and cut off where the ground ends at `minZ` (a sea wall)
 * so it never lands on water.
 *
 * Given a `plane` (a physics height), points are cast along the sun's line
 * onto that level instead, from above or below it: on a stair set every
 * surface finds its shadow by casting itself onto the same level (elToro3d.ts).
 */
export function groundHull(pts: V3[], r: number, minZ = -Infinity, plane?: number): GroundPolygon {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const t = (plane == null ? Math.max(0, ASPHALT - p.y) : plane - p.y) / -LIGHT.y;
    const c = { x: p.x - LIGHT.x * t, z: p.z - LIGHT.z * t };
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) out.push({ x: c.x + dx, y: c.z + dz });
  }
  let ground = hull(out);
  if (Number.isFinite(minZ)) {
    const cut: typeof ground = [];
    for (let i = 0; i < ground.length; i++) {
      const a = ground[i];
      const b = ground[(i + 1) % ground.length];
      if (a.y >= minZ) cut.push(a);
      if ((a.y >= minZ) !== (b.y >= minZ)) cut.push({ x: a.x + ((b.x - a.x) * (minZ - a.y)) / (b.y - a.y), y: minZ });
    }
    ground = cut;
  }
  return ground.map((q) => ({ x: q.x, z: q.y }));
}

/** The rider's cast silhouettes: torso and head together, then each leg and arm. */
export function bodyShadows(rig: Rig, plane?: number): GroundPolygon[] {
  const box = (frame: Rig['torso'], f: number, u: number, s: number) => {
    const pts: V3[] = [];
    for (const a of [-f, f]) for (const b of [-u, u]) for (const c of [-s, s]) pts.push(frame.at(a, b, c));
    return pts;
  };
  const out = [groundHull([...box(rig.torso, 10, 23, 14), ...box(rig.head, 13, 14, 17)], 1, -Infinity, plane)];
  for (const leg of rig.legs) out.push(groundHull([leg.hip, leg.knee, leg.ankle, leg.shoe.at(8, 0, 0), leg.shoe.at(-8, 0, 0)], 3.5, -Infinity, plane));
  for (const arm of rig.arms) out.push(groundHull([arm.shoulder, arm.elbow, arm.hand], 3, -Infinity, plane));
  return out;
}

/** Seconds a puff of dust lasts. */
export const DUST_T = 0.36;

/** A puff of dust `progress` (0 → 1) through its life, kicked up off the ground (a physics height) at (x, z). */
export function dustPuffs(progress: number, atX: number, strength: number, atZ = 0, ground = ASPHALT): Puff[] {
  const grow = easeOutCubic(progress);
  const fade = (1 - progress) ** 2;
  const out: Puff[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const spread = (0.35 + (i % 3) * 0.3) * side;
    out.push({
      center: { x: atX + spread * 40 * grow, y: ground - 14 * grow * (1 - grow * 0.4) - (i % 3) * 2, z: atZ + ((i % 3) - 1) * 10 * grow },
      radius: (2.4 + 4.6 * grow) * strength,
      opacity: 0.85 * fade,
    });
  }
  return out;
}

/** Board-local points that must stay on or above the asphalt: the deck's outline and every wheel's rim. */
const BOARD_HULL: V3[] = (() => {
  const pts: V3[] = [...TOP_LOCAL, ...BOTTOM_LOCAL];
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (const z of [-WHEEL_Z, WHEEL_Z]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push({ x: x + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z });
      }
    }
  }
  return pts;
})();

/**
 * The board and feet lifted until no part of the board is under the
 * asphalt (or, given `groundUnder`, the ground's physics height under a
 * point). The grind hop pops the board about its middle at deck height, so
 * the tail and back wheels would swing below the ground. Lifting by just the
 * overlap pivots the pop on the tail touching the ground instead, as a real
 * one does. The pop snaps the tail down in a single frame, so the overlap
 * does too: the knees take it up, and the hips, torso, arms, and head stay
 * exactly where the rig solver put them.
 */
export function onTheGround(rig: Rig, groundUnder: (p: V3) => number = () => ASPHALT): Rig {
  let sunk = 0;
  for (const local of BOARD_HULL) {
    const p = rig.board.point(local);
    sunk = Math.max(sunk, p.y - groundUnder(p));
  }
  if (sunk <= 0) return rig;
  const up = (p: V3): V3 => ({ x: p.x, y: p.y - sunk, z: p.z });
  const by = { x: 0, y: -sunk, z: 0 };
  return {
    ...rig,
    board: { ...rig.board, center: up(rig.board.center), point: (local) => up(rig.board.point(local)) },
    legs: rig.legs.map((l) => {
      const ankle = up(l.ankle);
      return { ...l, knee: kneeBetween(l.hip, ankle, l.knee), ankle, shoe: moveFrame(l.shoe, by) };
    }) as [LegRig, LegRig],
    hipOverDeck: rig.hipOverDeck - sunk,
  };
}

/** Hips' midpoint. */
export const hipsOf = (rig: Rig): V3 => ({
  x: (rig.legs[0].hip.x + rig.legs[1].hip.x) / 2,
  y: (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2,
  z: (rig.legs[0].hip.z + rig.legs[1].hip.z) / 2,
});

/**
 * The solved rig as it's shown: a lead-in's head move on top, and worn by
 * the stage's skater, a person growing to their own proportions over the
 * same feet (humanRig.ts) from the ground at `ground` (a physics height).
 */
export function posed(rig: Rig, skater: Skater, headPose?: HeadPose | null, ground?: number): Rig {
  const tilted = headPose ? { ...rig, head: tiltHead(rig.head, headPose.pitch, headPose.roll) } : rig;
  return skaterInfo(skater).person ? humanRig(tilted, ground) : tilted;
}

/** Shadows soften and fade as what casts them rises: to 45% at a full pop's height. */
const heightFade = (height: number) => 1 - 0.55 * clamp01(height / JUMP);

/**
 * The board's and the rider's cast shadows, faded by how high each is over
 * the ground they fall on: the asphalt, or given `plane` (a physics height)
 * that level, the step under a rider going down a stair set.
 */
export function riderShadows(rig: Rig, heights: { board: number; body: number }, plane?: number, bar: GroundPolygon[] = []): StageFrame['shadows'] {
  return {
    bar,
    board: groundHull(boardShadowPoints(rig.board), 1.5, -Infinity, plane),
    body: bodyShadows(rig, plane),
    boardOpacity: 0.34 * heightFade(heights.board),
    bodyOpacity: 0.3 * heightFade(heights.body),
  };
}

/** The dust kicked up at time `at`, at (x, z) off the ground at `ground`, while it lasts. */
export function kickedUp(now: number, at: number, x: number, strength: number, z = 0, ground = ASPHALT): Puff[] {
  const progress = (now - at) / DUST_T;
  return progress >= 0 && progress < 1 ? dustPuffs(progress, x, strength, z, ground) : [];
}
