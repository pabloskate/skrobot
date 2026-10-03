/**
 * Shared skeleton dimensions, frames, joint solver, and neutral poses.
 * Both motion rigs use this contract; trick-specific trajectories stay in
 * their own solvers.
 */
import { add3, cross3, dot3, norm3, rad, scale3, smoothstep, sub3, type V3 } from './math';

/** Mild resting torso yaw from travel toward toeside. */
export const STANCE_BODY_YAW = 40;
/** Degrees the head stays toward travel relative to the torso yaw. */
export const HEAD_LOOK_FORWARD = 16;

// New body placements (skeleton-local, hip at origin, y down).
export const HIP_Z = 5;
/** Shoe centers sit this far toeside of the deck's centerline: the shoe is
 *  longer than the deck is wide, so the toes hang over a little more than
 *  the heels, like a real stance. */
export const SHOE_TOESIDE = 1;
export const ANKLE_LIFT = 6.5;
/** Shoe center ahead of the ankle, toward the toe. */
export const TOE_REACH = 3.6;
/** Shoe box half extents (robot.tsx draws them) so soles sit on the grip. */
export const SHOE_HALF_HEIGHT = 4;
export const SHOE_HALF_LENGTH = 12;
export const SHOE_HALF_WIDTH = 6;
/** Rounding of the shoe box's edges. */
export const SHOE_ROUND = 3.6;
/** Deck half-width across the rails (board.tsx draws it). */
export const DECK_HALF_WIDTH = 8.6;
export const SHOULDER = { x: 2, y: -32, z: 17 } as const;
export const UPPER_ARM = 13;
export const FOREARM = 12;

// ----- Body physics -----

/** Fixed bone lengths: the legs never stretch. */
export const THIGH = 34;
export const SHIN = 30;
const LEG_REACH = THIGH + SHIN - 0.4;
/** Hip height above the deck center while cruising: an athletic, soft-kneed stance. */
export const RIDE_HEIGHT = 63;
/** Deepest the hips ever sink over the deck. */
export const SQUAT_FLOOR = 33;
/** Hip height over the deck at the instant the tail snaps: legs extended. */
export const POP_HEIGHT = 62;
/** Hip height at touchdown: legs reaching down to meet the ground. */
export const TOUCHDOWN_HEIGHT = 57;
/** Knee aim, degrees from the nose toward toeside: knees track over the
 *  toes (66–82), the back one pinched in a little toward the front foot. */
export const KNEE_AIM_FRONT = 55;
export const KNEE_AIM_BACK = 62;
/** Most the shin tips off the foot's up (ankle flex plus a soft shoe), and the
 *  most the knee swings off its aim to stay inside that. */
const SHIN_TILT_MAX = 45;
const KNEE_TWIST_MAX = 60;
/** A soft twist: shortfall (world units of knee height) it eases in over, and how hard it leans. */
const SOFT_TWIST = 5;
const SOFT_GAIN = 2.5;
/** How far the hips slide along the board toward the midpoint of the feet:
 *  the weight sits between them, not over the physics' body anchor. */
export const HIP_CENTER = 0.6;
/** Landing spring: natural frequency (rad/s) and damping ratio. */
export const LAND_OMEGA = 10.5;
export const LAND_ZETA = 0.86;
/** Seconds the crouch starts into the roll-in. */
export const CROUCH_START = 0.06;

/** Shoulder wind-up (deg) against a body spin at the bottom of the crouch. */
export const PRE_WIND = 22;
/** Torso hinge toward toeside (deg): standing, plus more as the hips sink. */
export const LEAN_REST = 5;
export const LEAN_SQUAT = 24;
/** Hips slide toward the heels as they sink, keeping weight over the feet. */
export const HIP_BACK = 14;
/** How much of the torso lean the head undoes to keep the eyes level. */
export const HEAD_STEADY = 0.6;
export const LOOK_DOWN_OLLIE = 7;

export interface Frame3 {
  origin: V3;
  /** Unit axes in world space: fwd = chest/face direction, up, side. */
  fwd: V3;
  up: V3;
  side: V3;
  /** Local (fwd, up, side) → world. */
  at(f: number, u: number, s: number): V3;
}

export interface LegRig {
  side: 'left' | 'right';
  hip: V3;
  knee: V3;
  ankle: V3;
  /** Shoe frame: fwd = toe direction, up, side = along the board. */
  shoe: Frame3;
  /** This foot does the flick (see Rig.flickOut). */
  flicking: boolean;
}

export interface ArmRig {
  side: 'left' | 'right';
  shoulder: V3;
  elbow: V3;
  hand: V3;
}

export interface BoardRig {
  center: V3;
  /** Board local (x = long axis, y = down, z = width) → world. */
  point(local: V3): V3;
  /** Rotation only, for normals. */
  dir(local: V3): V3;
  flipDeg: number;
  yawDeg: number;
  pitchDeg: number;
}

export interface Rig {
  board: BoardRig;
  legs: [LegRig, LegRig];
  arms: [ArmRig, ArmRig];
  torso: Frame3;
  head: Frame3;
  /** Rider's toeside in world z at rest (+1 toward camera). */
  toeDir: 1 | -1;
  flickZ: number;
  /** 0 → 1 as the flicking foot goes out over the rail and back. */
  flickOut: number;
  /** 0 → 1: both soles stand on the grip (grinds), so a deck turned underside-up to the camera hides them. */
  onGrip?: number;
  bodyYawDeg: number;
  headYawDeg: number;
  /** Hip height above the deck center. */
  hipOverDeck: number;
}

export function frameOf(origin: V3, dir: (d: V3) => V3): Frame3 {
  const fwd = dir({ x: 1, y: 0, z: 0 });
  const up = dir({ x: 0, y: -1, z: 0 });
  const side = dir({ x: 0, y: 0, z: 1 });
  return {
    origin,
    fwd,
    up,
    side,
    at: (f, u, s) => ({
      x: origin.x + fwd.x * f + up.x * u + side.x * s,
      y: origin.y + fwd.y * f + up.y * u + side.y * s,
      z: origin.z + fwd.z * f + up.z * u + side.z * s,
    }),
  };
}

/** The same frame, re-centered at a local (fwd, up, side) offset. */
export function shiftFrame(frame: Frame3, f: number, u: number, s: number): Frame3 {
  return {
    ...frame,
    origin: frame.at(f, u, s),
    at: (df, du, ds) => frame.at(f + df, u + du, s + ds),
  };
}

/** Where the head pivots on the neck, in head-local (fwd, up) units. */
const HEAD_PIVOT = { f: -2, u: -13 };

/**
 * The head pitched toward its own up axis, then rolled, about its base on
 * the neck. A rigid turn, so the face stays square and the head stays on the
 * neck. Degrees; positive pitch looks up.
 */
export function tiltHead(head: Frame3, pitchDeg: number, rollDeg: number): Frame3 {
  if (Math.abs(pitchDeg) < 1e-3 && Math.abs(rollDeg) < 1e-3) return head;
  const p = rad(pitchDeg);
  const r = rad(rollDeg);
  const fwd = add3(scale3(head.fwd, Math.cos(p)), scale3(head.up, Math.sin(p)));
  const pitchedUp = add3(scale3(head.up, Math.cos(p)), scale3(head.fwd, -Math.sin(p)));
  const up = add3(scale3(pitchedUp, Math.cos(r)), scale3(head.side, Math.sin(r)));
  const side = add3(scale3(head.side, Math.cos(r)), scale3(pitchedUp, -Math.sin(r)));
  const pivot = head.at(HEAD_PIVOT.f, HEAD_PIVOT.u, 0);
  const origin = add3(pivot, add3(scale3(fwd, -HEAD_PIVOT.f), scale3(up, -HEAD_PIVOT.u)));
  return frameOf(origin, (d) => add3(add3(scale3(fwd, d.x), scale3(up, -d.y)), scale3(side, d.z)));
}

/** The same frame, moved by a world-space offset. */
export function moveFrame(frame: Frame3, by: V3): Frame3 {
  return {
    ...frame,
    origin: add3(frame.origin, by),
    at: (f, u, s) => add3(frame.at(f, u, s), by),
  };
}

/**
 * Two-bone IK: the knee for a hip → ankle chain of fixed length, bent toward
 * `pole`. An ankle out of reach is pulled in along the leg (the foot leaves
 * the deck rather than the shin stretching).
 *
 * The ankle only flexes so far, so the shin has to come down into the shoe
 * from above: when the pole would lay the shin flatter than SHIN_TILT_MAX
 * off the foot's `up`, the knee swings around the hip–ankle axis toward the
 * top of its circle, by no more than KNEE_TWIST_MAX.
 *
 * The exact swing whips round as the limit comes into reach (it runs on an
 * arccosine), and flips sides when the top of the knee's circle comes round
 * behind it. `soft` instead leans the knee sideways toward up in proportion
 * to how much up there is to lean toward, eased in over SOFT_TWIST units of
 * shortfall: never a flip, never a whip, at the cost of the shin leaning a
 * few degrees past the limit for a few frames. For legs that fold and
 * extend fast (feet glued to a snapping board).
 */
export function solveLeg(hip: V3, ankle: V3, pole: V3, up: V3, soft = false): { knee: V3; ankle: V3 } {
  const d = sub3(ankle, hip);
  const len = Math.hypot(d.x, d.y, d.z) || 1e-6;
  const u = scale3(d, 1 / len);
  const dist = Math.min(len, LEG_REACH);
  const reached = dist < len ? add3(hip, scale3(u, dist)) : ankle;
  const along = Math.min(THIGH, Math.max(-THIGH, (THIGH * THIGH - SHIN * SHIN + dist * dist) / (2 * dist)));
  const out = Math.sqrt(Math.max(0, THIGH * THIGH - along * along));
  let w = sub3(pole, scale3(u, dot3(pole, u)));
  const wl = Math.hypot(w.x, w.y, w.z);
  w = wl > 1e-6 ? scale3(w, 1 / wl) : norm3({ x: -u.y, y: u.x, z: 0 });
  const v = cross3(u, w);
  // Height of the knee over the ankle along `up`, as the knee swings by θ:
  // rise(θ) = base + out·(wUp·cos θ + vUp·sin θ).
  const base = dot3(sub3(add3(hip, scale3(u, along)), reached), up);
  const wUp = dot3(w, up);
  const vUp = dot3(v, up);
  const need = SHIN * Math.cos(rad(SHIN_TILT_MAX));
  let swing = 0;
  const reachUp = out * Math.hypot(wUp, vUp);
  if (base + out * wUp < need && reachUp > 1e-6) {
    const twistMax = rad(KNEE_TWIST_MAX);
    let target: number;
    if (soft) {
      target = Math.atan(SOFT_GAIN * vUp * smoothstep((need - base - out * wUp) / SOFT_TWIST));
    } else {
      const best = Math.atan2(vUp, wUp);
      target = best - Math.sign(best) * Math.acos(Math.min(1, Math.max(-1, (need - base) / reachUp)));
    }
    swing = Math.max(-twistMax, Math.min(twistMax, target));
  }
  const bend = add3(scale3(w, Math.cos(swing)), scale3(v, Math.sin(swing)));
  return { knee: add3(hip, add3(scale3(u, along), scale3(bend, out))), ankle: reached };
}

/** Softly keep x above `floor`: unchanged well above it, easing into it. */
export function softFloor(x: number, floor: number, knee = 5): number {
  const over = x - floor;
  return over >= knee ? x : floor + knee * Math.exp(over / knee - 1);
}

/** Cubic Hermite on [0, 1]. */
export function hermite(p0: number, p1: number, m0: number, m1: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

export const cruiseBob = (t: number) => Math.sin(t * 7) * 0.8;

// ----- Arms -----

/** Arm pose: abduction out along the board (deg), swing toward the chest
 *  (deg), elbow bend (deg). */
export interface ArmPose {
  out: number;
  swing: number;
  elbow: number;
}

export const ARM_RIDE: Record<'front' | 'back', ArmPose> = {
  front: { out: 24, swing: 10, elbow: 30 },
  back: { out: 20, swing: -6, elbow: 24 },
};
/** Wind-up: the front arm reaches down over the knees, the back arm draws back. */
export const ARM_LOAD: Record<'front' | 'back', ArmPose> = {
  front: { out: 12, swing: 38, elbow: 38 },
  back: { out: 18, swing: -34, elbow: 20 },
};
/** Airborne: both arms out along the board for balance. */
export const ARM_AIR: Record<'front' | 'back', ArmPose> = {
  front: { out: 66, swing: 16, elbow: 40 },
  back: { out: 58, swing: -14, elbow: 36 },
};
/** Landing: arms press down and out as the knees absorb. */
export const ARM_LAND: Record<'front' | 'back', ArmPose> = {
  front: { out: 44, swing: 26, elbow: 30 },
  back: { out: 40, swing: -4, elbow: 26 },
};

export const mixPose = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({
  out: a.out + (b.out - a.out) * k,
  swing: a.swing + (b.swing - a.swing) * k,
  elbow: a.elbow + (b.elbow - a.elbow) * k,
});

/** Torso-local upper-arm and forearm directions for a pose. */
export function armDirs(pose: ArmPose, sideZ: 1 | -1): [V3, V3] {
  const out = rad(pose.out);
  const swing = rad(pose.swing);
  const upper = norm3({
    x: Math.sin(swing),
    y: Math.cos(swing) * Math.cos(out),
    z: sideZ * Math.cos(swing) * Math.sin(out),
  });
  // Elbows fold forward and up, toward the chest.
  const hinge = { x: 1, y: -0.35, z: 0 };
  const n = norm3(sub3(hinge, scale3(upper, dot3(hinge, upper))));
  const e = rad(pose.elbow);
  const fore = norm3(add3(scale3(upper, Math.cos(e)), scale3(n, Math.sin(e))));
  return [upper, fore];
}
