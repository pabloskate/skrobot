import { add3, cross3, dot3, norm3, scale3, smoothstep, sub3, type V3 } from '../scene/math';
import type { ArmRig, BoardRig, Frame3, LegRig, Rig } from '../scene/skeleton';
import { capsuleIntersectsBoard } from './boardCollision';
import { HUMAN_FOREARM, HUMAN_HEAD, HUMAN_SCALE, HUMAN_SHIN, HUMAN_THIGH, HUMAN_UPPER_ARM, shinRadius, thighRadius } from './humanGeometry';
import { ASPHALT } from './view';

/**
 * The robot's rig worn by a person. The rig is sized for a toy: legs and
 * a chest that put its head about a board and a third over the deck, with
 * stubby arms set wide on a boxy chest (UPPER_ARM 13, FOREARM 12,
 * shoulders 17 off the spine). A grown skater stands about two boards tall,
 * with arms that hang to mid-thigh from shoulders set in narrower.
 *
 * So the person is the robot's pose, bigger: everything from the hips up is
 * scaled by HUMAN_SCALE out from under the feet, and the legs are that much
 * longer, re-bent to reach from the higher hips down to the very same
 * ankles. The board, the shoes on it, and the ankles in them are the rig as
 * solved, so the trick is the same trick; the person just stands taller
 * over it. The head grows less than the body (HUMAN_HEAD), the way a
 * grown-up's head is a smaller share of them than a kid's.
 *
 * The arms keep the rig's pose: each bone points the way the rig points
 * it, only longer, from a shoulder moved in along the chest and down a
 * little, and tipped up off the ground where that longer reach would put a
 * hand through it.
 */

/** How far the shoulder joints sit off the spine, and below the robot's: a person's sit under the shoulder's top. */
export const HUMAN_SHOULDER = 12.4;
export const HUMAN_SHOULDER_DROP = 3.2;
/** Where the neck meets the jaw in the rig's head frame: the head grows out from here, so the neck keeps its length. */
const HEAD_PIVOT = { f: -2.5, u: -15 } as const;

/**
 * The point the body grows out from: under the hips, at the ankles' height
 * while the rider is up, sinking to the ground as the torso lies down, so a
 * slammed rider grows along the ground instead of into it.
 */
function growFrom(rig: Rig): V3 {
  const [a, b] = rig.legs;
  const feet = scale3(add3(a.ankle, b.ankle), 0.5);
  // Physics is y-down: an upright torso's up is -y.
  const upright = smoothstep((-rig.torso.up.y - 0.25) / 0.45);
  return { x: feet.x, y: ASPHALT + (feet.y - ASPHALT) * upright, z: feet.z };
}

/** A knee for a leg of the person's bones from `hip` to `ankle`, bent the way `bent` (a direction off the hip-ankle line) points. */
function kneeFor(hip: V3, ankle: V3, bent: V3): V3 {
  const d = sub3(ankle, hip);
  const len = Math.max(1e-6, Math.hypot(d.x, d.y, d.z));
  const u = scale3(d, 1 / len);
  const along = Math.max(-HUMAN_THIGH, Math.min(HUMAN_THIGH, (HUMAN_THIGH ** 2 - HUMAN_SHIN ** 2 + len * len) / (2 * len)));
  const out = sub3(bent, scale3(u, dot3(bent, u)));
  const side = Math.hypot(out.x, out.y, out.z) > 1e-6 ? norm3(out) : norm3({ x: -u.y, y: u.x, z: 0 });
  return add3(add3(hip, scale3(u, along)), scale3(side, Math.sqrt(Math.max(0, HUMAN_THIGH ** 2 - along * along))));
}

/** The pant legs as drawn, sampled as short tapered capsules this many to a bone. */
const PANT_SEGMENTS = 6;

/** Whether the pant legs from `hip` through `knee` to `ankle` pass through the board. */
function pantsThroughBoard(board: BoardRig, hip: V3, knee: V3, ankle: V3): boolean {
  const through = (a: V3, b: V3, length: number, radius: (along: number) => number) => {
    const dir = norm3(sub3(b, a));
    for (let k = 0; k < PANT_SEGMENTS; k++) {
      const s0 = (length * k) / PANT_SEGMENTS;
      const s1 = (length * (k + 1)) / PANT_SEGMENTS;
      if (capsuleIntersectsBoard(board, add3(a, scale3(dir, s0)), add3(a, scale3(dir, s1)), radius(s0), radius(s1))) return true;
    }
    return false;
  };
  return through(hip, knee, HUMAN_THIGH, thighRadius) || through(knee, ankle, HUMAN_SHIN, shinRadius);
}

/** How far, at most, a knee swings aside for the board, and in what steps. */
const KNEE_SWING_MAX = (60 * Math.PI) / 180;
const KNEE_SWING_STEP = (2.5 * Math.PI) / 180;

/**
 * The knee, swung round the hip-ankle line just far enough that the pant
 * leg clears the board. The rig tucks the feet for the robot's slimmer
 * legs; a person's knee, higher and roomier, can still catch a nose or tail
 * swinging up past it, and moves it aside the way a skater does — away from
 * the board first. Left where it was if no swing clears.
 */
function kneeClear(board: BoardRig, hip: V3, knee: V3, ankle: V3): V3 {
  if (!pantsThroughBoard(board, hip, knee, ankle)) return knee;
  const axis = norm3(sub3(ankle, hip));
  const center = add3(hip, scale3(axis, dot3(sub3(knee, hip), axis)));
  const out = sub3(knee, center);
  const turn = cross3(axis, out);
  const away = dot3(turn, sub3(knee, board.center)) >= 0 ? 1 : -1;
  for (let angle = KNEE_SWING_STEP; angle <= KNEE_SWING_MAX; angle += KNEE_SWING_STEP) {
    for (const sign of [away, -away]) {
      const swung = add3(center, add3(scale3(out, Math.cos(angle)), scale3(turn, sign * Math.sin(angle))));
      if (!pantsThroughBoard(board, hip, swung, ankle)) return swung;
    }
  }
  return knee;
}

/** How far over the ground an elbow and a hand stay (world units): about their thickness. */
const ELBOW_OFF_GROUND = 4.5;
const HAND_OFF_GROUND = 3;

/**
 * A bone's direction from `from`, tipped up just enough that its far end,
 * `length` along it, stays `floor` over the ground: an arm the rig swings
 * down through the asphalt in a slam lies along it instead, still pointing
 * the same way round.
 */
function overGround(from: V3, dir: V3, length: number, floor: number): V3 {
  const lowest = ASPHALT - floor;
  if (from.y + dir.y * length <= lowest) return dir;
  const y = Math.max(-1, Math.min(1, (lowest - from.y) / length));
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-6) return { x: Math.sqrt(1 - y * y), y, z: 0 };
  const k = Math.sqrt(1 - y * y) / flat;
  return { x: dir.x * k, y, z: dir.z * k };
}

/** A frame moved to a new origin, its axes unchanged. */
const frameAt = (frame: Frame3, origin: V3): Frame3 => ({
  ...frame,
  origin,
  at: (f, u, s) => add3(origin, add3(scale3(frame.fwd, f), add3(scale3(frame.up, u), scale3(frame.side, s)))),
});

export function humanRig(rig: Rig): Rig {
  const from = growFrom(rig);
  const grow = (p: V3): V3 => add3(from, scale3(sub3(p, from), HUMAN_SCALE));

  // Hips up, scaled; then pulled in toward the feet if either leg can't reach its ankle.
  let shift: V3 = { x: 0, y: 0, z: 0 };
  const reach = (HUMAN_THIGH + HUMAN_SHIN) * 0.995;
  for (let pass = 0; pass < 2; pass++) {
    for (const leg of rig.legs) {
      const hip = add3(grow(leg.hip), shift);
      const d = sub3(leg.ankle, hip);
      const len = Math.hypot(d.x, d.y, d.z);
      if (len > reach) shift = add3(shift, scale3(d, (len - reach) / len));
    }
  }
  const place = (p: V3) => add3(grow(p), shift);

  const legs = rig.legs.map((leg): LegRig => {
    const hip = place(leg.hip);
    // The robot's knee, as a direction off its own hip-ankle line.
    const axis = norm3(sub3(leg.ankle, leg.hip));
    const off = sub3(leg.knee, leg.hip);
    const bent = sub3(off, scale3(axis, dot3(off, axis)));
    return { ...leg, hip, knee: kneeClear(rig.board, hip, kneeFor(hip, leg.ankle, bent), leg.ankle) };
  }) as Rig['legs'];

  const torso = frameAt(rig.torso, place(rig.torso.origin));
  // The head: the neck's top placed with the body, the head grown out from it by HUMAN_HEAD.
  const pivot = rig.head.at(HEAD_PIVOT.f, HEAD_PIVOT.u, 0);
  const head = frameAt(rig.head, add3(place(pivot), scale3(sub3(rig.head.origin, pivot), HUMAN_HEAD)));

  const arms = rig.arms.map((arm): ArmRig => {
    const upper = norm3(sub3(arm.elbow, arm.shoulder));
    const fore = norm3(sub3(arm.hand, arm.elbow));
    const across = dot3(sub3(arm.shoulder, rig.torso.origin), rig.torso.side);
    const inward = scale3(rig.torso.side, Math.sign(across) * HUMAN_SHOULDER - across);
    const shoulder = place(add3(add3(arm.shoulder, inward), scale3(rig.torso.up, -HUMAN_SHOULDER_DROP)));
    const upperLength = HUMAN_UPPER_ARM * HUMAN_SCALE;
    const foreLength = HUMAN_FOREARM * HUMAN_SCALE;
    const elbow = add3(shoulder, scale3(overGround(shoulder, upper, upperLength, ELBOW_OFF_GROUND), upperLength));
    const hand = add3(elbow, scale3(overGround(elbow, fore, foreLength, HAND_OFF_GROUND), foreLength));
    return { ...arm, shoulder, elbow, hand };
  }) as Rig['arms'];

  const hipY = (legs[0].hip.y + legs[1].hip.y) / 2;
  return { ...rig, legs, arms, torso, head, hipOverDeck: rig.board.center.y - hipY };
}
