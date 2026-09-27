import type { SkateStyle } from '../types';
import { flickExtension, orientTrickRotation, type RiderMechanics } from '../stanceMechanics';
import {
  FLIP_T,
  FOOT_Y,
  JUMP,
  ROLL_IN,
  clampFootReach,
  computeFrame,
  type FallVariant,
  type Frame,
  type Pt,
  type Spec,
} from '../TrickAnimation';
import { add3, clamp01, cross3, dot3, norm3, rad, rotX, rotY, rotZ, scale3, smoothstep, sub3, type V3 } from './math';

/**
 * Physics frame → world-space skeleton.
 *
 * The board, the feet on it, and every rotation (flip, shuv, body spin,
 * flick) come straight from the shared computeFrame physics through the same
 * mapping New 3D uses, so tricks read identically. The rider's *body* is
 * solved here instead:
 *
 * - the hips fly a ballistic arc. The crouch loads, the legs explode through
 *   the pop, and a spring-damper absorbs the touchdown with the velocity the
 *   arc arrived with — so a bigger pop lands heavier;
 * - the legs are a two-bone IK chain of fixed length from hip to ankle, with
 *   knees tracking over the toes (the back knee pinches in) and shins that
 *   never tip further than an ankle flexes, so the board rising up to the
 *   feet is what tucks the knees;
 * - the hips ride between the feet and slide back over the heels as they
 *   sink, the torso hinges over the toes, the arms balance out
 *   along the board, and the head steadies and watches the board in the air.
 */

/** Mild resting torso yaw from travel toward toeside. */
const STANCE_BODY_YAW = 40;
/** Degrees the head stays toward travel relative to the torso yaw. */
const HEAD_LOOK_FORWARD = 16;
/** Fraction of a frontside half spin the shoulders take (see New 3D). */
const TORSO_SPIN_FOLLOW = 0.55;
const HEAD_SPIN_FOLLOW = 0.25;
/** Fall rotation pivots near the feet, like the 2D body transform. */
const BODY_PIVOT_Y = FOOT_Y - 2;

// New body placements (skeleton-local, hip at origin, y down).
const HIP_Z = 5;
/** Shoe centers sit this far toeside of the deck's centerline: the shoe is
 *  longer than the deck is wide, so the toes hang over a little more than
 *  the heels, like a real stance. */
const SHOE_TOESIDE = 1;
const ANKLE_LIFT = 6.5;
/** Shoe center ahead of the ankle, toward the toe. */
const TOE_REACH = 3.6;
/** Shoe box half extents (robot.tsx draws them) so soles sit on the grip. */
export const SHOE_HALF_HEIGHT = 4;
export const SHOE_HALF_LENGTH = 12;
/** Deck half-width across the rails (board.tsx draws it). */
export const DECK_HALF_WIDTH = 8.6;
/** Past the far rail, per unit of flick strength, the flicked shoe ends up. */
const FLICK_STYLE_REACH = 4;
/** A kickflip drags the toe diagonally off the corner, so the flicking shoe
 *  turns toward its end of the board as it goes out. */
const FLICK_TOE_TURN = 34;
export const SHOULDER = { x: 2, y: -32, z: 17 } as const;
const UPPER_ARM = 13;
const FOREARM = 12;

// ----- Body physics -----

/** Fixed bone lengths: the legs never stretch. */
export const THIGH = 34;
export const SHIN = 30;
const LEG_REACH = THIGH + SHIN - 0.4;
/** Hip height above the deck center while cruising: an athletic, soft-kneed stance. */
const RIDE_HEIGHT = 63;
/** Deepest the hips ever sink over the deck. */
const SQUAT_FLOOR = 33;
/** Hip height over the deck at the instant the tail snaps: legs extended. */
const POP_HEIGHT = 62;
/** Hip height at touchdown: legs reaching down to meet the ground. */
const TOUCHDOWN_HEIGHT = 57;
/** How far the arc sinks below a straight line at mid-flight: the knee tuck.
 *  Glued tricks pull the board all the way up; flips and shuvs tuck less,
 *  and the arc still gives way wherever the feet ride higher (hipState). */
const TUCK_GLUED = 17;
const TUCK_FREE = 12;
/** Shortest hip-to-ankle distance the tuck may reach. */
const LEG_CLEAR = 29;
/** Knee aim, degrees from the nose toward toeside: knees track over the
 *  toes (66–82), the back one pinched in a little toward the front foot. */
const KNEE_AIM_FRONT = 55;
const KNEE_AIM_BACK = 62;
/** Most the shin tips off the foot's up (ankle flex plus a soft shoe), and the
 *  most the knee swings off its aim to stay inside that. */
const SHIN_TILT_MAX = 45;
const KNEE_TWIST_MAX = 60;
/** How far the hips slide along the board toward the midpoint of the feet:
 *  the weight sits between them, not over the physics' body anchor. */
const HIP_CENTER = 0.6;
/** Landing spring: natural frequency (rad/s) and damping ratio. */
const LAND_OMEGA = 10.5;
const LAND_ZETA = 0.86;
/** Flight fraction where the feet start settling onto their touchdown spots. */
const CATCH_START = 0.86;
/** Seconds the crouch starts into the roll-in. */
const CROUCH_START = 0.06;
/** Seconds a fall takes to hand the hips over to the fall physics. */
const FALL_HANDOFF = 0.24;

/** Shoulder wind-up (deg) against a body spin at the bottom of the crouch. */
const PRE_WIND = 22;
/** Torso hinge toward toeside (deg): standing, plus more as the hips sink. */
const LEAN_REST = 5;
const LEAN_SQUAT = 24;
/** Hips slide toward the heels as they sink, keeping weight over the feet. */
const HIP_BACK = 14;
/** How much of the torso lean the head undoes to keep the eyes level. */
const HEAD_STEADY = 0.6;
/** Head nod (deg) toward the board while it's in the air. */
const LOOK_DOWN_TRICK = 16;
const LOOK_DOWN_OLLIE = 7;

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
  bodyYawDeg: number;
  headYawDeg: number;
  /** Hip height above the deck center. */
  hipOverDeck: number;
}

function frameOf(origin: V3, dir: (d: V3) => V3): Frame3 {
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

/** The same frame, moved by a world-space offset. */
function moveFrame(frame: Frame3, by: V3): Frame3 {
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
 */
function solveLeg(hip: V3, ankle: V3, pole: V3, up: V3): { knee: V3; ankle: V3 } {
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
    const best = Math.atan2(vUp, wUp);
    const slack = Math.acos(Math.min(1, Math.max(-1, (need - base) / reachUp)));
    const twistMax = rad(KNEE_TWIST_MAX);
    swing = Math.max(-twistMax, Math.min(twistMax, best - Math.sign(best) * slack));
  }
  const bend = add3(scale3(w, Math.cos(swing)), scale3(v, Math.sin(swing)));
  return { knee: add3(hip, add3(scale3(u, along), scale3(bend, out))), ankle: reached };
}

// ----- Hip trajectory -----

interface FlightArc {
  /** Hip height over the deck at pop and touchdown, and the mid-flight tuck. */
  pop: number;
  touchdown: number;
  tuck: number;
  /** Deepest hip height over the deck in the wind-up. */
  squat: number;
}

const glued = (spec: Spec) => !spec.flips && !spec.roll && spec.yaw === spec.bodyYaw;

function flightArc(spec: Spec): FlightArc {
  const complexity = spec.flips * 0.5 + (spec.yaw / 180) * 0.3 + (spec.roll ? 0.5 : 0);
  const load = (22 + complexity * 8) * (spec.stance === 'nollie' ? 1.4 : 1);
  return {
    pop: POP_HEIGHT,
    touchdown: TOUCHDOWN_HEIGHT,
    tuck: glued(spec) ? TUCK_GLUED : TUCK_FREE,
    squat: Math.max(SQUAT_FLOOR + 5, RIDE_HEIGHT - load * 0.9),
  };
}

/** Smooth max: exact once a and b are more than k apart. */
function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/** Hip height over the deck through the flight (s = 0 → 1). */
const flightLegs = (arc: FlightArc, s: number) =>
  arc.pop + (arc.touchdown - arc.pop) * s - 4 * arc.tuck * s * (1 - s);

/** Softly keep x above `floor`: unchanged well above it, easing into it. */
function softFloor(x: number, floor: number, knee = 5): number {
  const over = x - floor;
  return over >= knee ? x : floor + knee * Math.exp(over / knee - 1);
}

/** Cubic Hermite on [0, 1]. */
function hermite(p0: number, p1: number, m0: number, m1: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

const cruiseBob = (t: number) => Math.sin(t * 7) * 0.8;

interface HipState {
  /** Hip height over the deck center. */
  overDeck: number;
  /** 0 → 1 wind-up crouch (arms load, shoulders wind). */
  load: number;
  /** 0 → 1 airborne balance (arms out). */
  air: number;
  /** Seconds since touchdown, or -1 before it. */
  sinceTouchdown: number;
}

/**
 * `clearance` is the lowest the hips can sit over the deck this frame and
 * still leave the legs room for wherever the trick has lifted the feet
 * (flicks, scoops, the nose foot riding a popped deck). The flight arc only
 * gives way to it where it has to.
 */
function hipState(f: Frame, spec: Spec, style: SkateStyle, clearance: number): HipState {
  const arc = flightArc(spec);
  const t = f.t;
  const tau = t - ROLL_IN;
  // Hip height = deck height + hips over the deck. Both are parabolas in the
  // flight clock (the deck's is the physics' pop arc), so the hips fly a true
  // ballistic arc; these are its vertical speeds at takeoff and touchdown.
  const popRise = 4 * JUMP * style.popHeight;
  const takeoffSpeed = (popRise + (arc.touchdown - arc.pop) - 4 * arc.tuck) / FLIP_T;
  const touchdownSpeed = (-popRise + (arc.touchdown - arc.pop) + 4 * arc.tuck) / FLIP_T;

  if (tau < 0) {
    // Load, then explode: the extension is timed so the hips leave the
    // crouch at rest and reach the pop moving at the takeoff speed.
    const rise = arc.pop - arc.squat;
    const extendT = Math.min(0.14, Math.max(0.06, (2.5 * rise) / takeoffSpeed));
    const bottomT = ROLL_IN - extendT;
    if (t < bottomT) {
      const c = smoothstep((t - CROUCH_START) / (bottomT - 0.02 - CROUCH_START));
      return {
        overDeck: RIDE_HEIGHT + cruiseBob(t) * (1 - c) + (arc.squat - RIDE_HEIGHT) * c,
        load: c,
        air: 0,
        sinceTouchdown: -1,
      };
    }
    const s = (t - bottomT) / extendT;
    return {
      overDeck: hermite(arc.squat, arc.pop, 0, takeoffSpeed * extendT, s),
      load: 1 - smoothstep(s),
      air: 0,
      sinceTouchdown: -1,
    };
  }

  if (tau < FLIP_T) {
    const s = tau / FLIP_T;
    return {
      overDeck: smoothMax(flightLegs(arc, s), clearance, 6),
      load: 0,
      air: smoothstep(tau / 0.16),
      sinceTouchdown: -1,
    };
  }

  // Touchdown: a damped spring from the arriving height and speed back up to
  // the cruising stance.
  const u = tau - FLIP_T;
  const w = LAND_OMEGA;
  const zeta = LAND_ZETA;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const a = arc.touchdown - RIDE_HEIGHT;
  const b = (touchdownSpeed + zeta * w * a) / wd;
  const spring = RIDE_HEIGHT + Math.exp(-zeta * w * u) * (a * Math.cos(wd * u) + b * Math.sin(wd * u));
  const settle = smoothstep(u / 0.5);
  return {
    overDeck: softFloor(spring, SQUAT_FLOOR) + cruiseBob(t) * settle,
    load: 0,
    air: 1 - smoothstep(u / 0.4),
    sinceTouchdown: u,
  };
}

// ----- Arms -----

/** Arm pose: abduction out along the board (deg), swing toward the chest
 *  (deg), elbow bend (deg). */
interface ArmPose {
  out: number;
  swing: number;
  elbow: number;
}

const ARM_RIDE: Record<'front' | 'back', ArmPose> = {
  front: { out: 24, swing: 10, elbow: 30 },
  back: { out: 20, swing: -6, elbow: 24 },
};
/** Wind-up: the front arm reaches down over the knees, the back arm draws back. */
const ARM_LOAD: Record<'front' | 'back', ArmPose> = {
  front: { out: 12, swing: 38, elbow: 38 },
  back: { out: 18, swing: -34, elbow: 20 },
};
/** Airborne: both arms out along the board for balance. */
const ARM_AIR: Record<'front' | 'back', ArmPose> = {
  front: { out: 66, swing: 16, elbow: 40 },
  back: { out: 58, swing: -14, elbow: 36 },
};
/** Landing: arms press down and out as the knees absorb. */
const ARM_LAND: Record<'front' | 'back', ArmPose> = {
  front: { out: 44, swing: 26, elbow: 30 },
  back: { out: 40, swing: -4, elbow: 26 },
};

const mixPose = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({
  out: a.out + (b.out - a.out) * k,
  swing: a.swing + (b.swing - a.swing) * k,
  elbow: a.elbow + (b.elbow - a.elbow) * k,
});

/** Torso-local upper-arm and forearm directions for a pose. */
function armDirs(pose: ArmPose, sideZ: 1 | -1): [V3, V3] {
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

export function solveRig(
  f: Frame,
  spec: Spec,
  mechanics: RiderMechanics,
  skateStyle: SkateStyle,
  outcome: 'landed' | FallVariant = 'landed',
): Rig {
  const landed = outcome === 'landed';
  // Slams and bails come down with the trick's rotation complete, but the
  // shared fall physics reports them unrotated, which would snap a spun body
  // back to its starting facing on touchdown. Hold the completed rotation.
  // (Shanks already freeze theirs part-way.)
  const heldSpin = !landed && outcome !== 'shank' && f.motion.flight >= 1;
  const spin = heldSpin
    ? {
        flipDeg: spec.flipDir * spec.flips * 360,
        yawDeg: (spec.spinDir || 1) * spec.yaw,
        forwardPitchDeg: spec.forwardFlip ? spec.dir * 180 : 0,
        bodyYawDeg: (spec.spinDir || 1) * spec.bodyYaw,
      }
    : f.spin3d;
  const oriented = orientTrickRotation(mechanics, spin);
  const toeDir = mechanics.orientationSign;
  const restingBodyYaw = -STANCE_BODY_YAW * toeDir;
  const restingHeadYaw = -(STANCE_BODY_YAW - HEAD_LOOK_FORWARD) * toeDir;
  const bodyYawDeg = oriented.bodyYawDeg + restingBodyYaw;
  const halfSpin = spec.bodyYaw % 360 !== 0;
  const backside = spec.spinDir === 1;
  const torsoFollow = !halfSpin || backside ? 1 : TORSO_SPIN_FOLLOW;
  const headFollow = !halfSpin || backside ? 1 : HEAD_SPIN_FOLLOW;
  // Blend the head's look-forward out as the body folds in a fall, so the
  // head stays on the neck.
  const uprightP = clamp01(1 - Math.abs(f.body.rot) / 55);
  const headYawDeg = oriented.bodyYawDeg * headFollow
    + restingHeadYaw * uprightP
    + restingBodyYaw * (1 - uprightP);

  // ----- Board -----
  const flipDeg = oriented.flipDeg;
  const spinP = f.motion.rotation;
  const pitchDeg = f.board.rot + (spec.forwardFlip ? Math.sin(spinP * Math.PI) * 42 : 0);
  const yawDeg = oriented.yawDeg;
  const center: V3 = { x: f.board.x, y: f.board.y, z: 0 };
  const popFoot = spec.roll !== 0 ? (spec.nollie ? f.footR : f.footL) : null;
  const pivot: V3 = popFoot ? { x: f.body.x + popFoot.x, y: f.body.y + popFoot.y, z: 0 } : center;
  const boardDir = (local: V3) => rotY(rotZ(rotX(local, flipDeg), pitchDeg), yawDeg);
  const boardPoint = (local: V3): V3 => {
    const q = rotX(local, flipDeg);
    const off: V3 = { x: center.x - pivot.x + q.x, y: center.y - pivot.y + q.y, z: center.z - pivot.z + q.z };
    const r = rotY(rotZ(off, pitchDeg), yawDeg);
    return { x: pivot.x + r.x, y: pivot.y + r.y, z: pivot.z + r.z };
  };

  // ----- Feet (board space, straight from the physics) -----
  const fallTurn = (p: V3): V3 => {
    const q = rotZ({ x: p.x, y: p.y - BODY_PIVOT_Y, z: p.z }, f.body.rot);
    return { x: q.x, y: q.y + BODY_PIVOT_Y, z: q.z };
  };
  // Board space (x nose, y down, z toeside-signed) → world: the physics'
  // resting yaw is undone, so only the trick's body spin (and a fall's
  // pitch) carries it.
  const boardSpaceDir = (d: V3) => rotY(rotZ(rotY(d, -restingBodyYaw), f.body.rot), bodyYawDeg);
  const feetAnchor: V3 = { x: f.body.x, y: f.body.y, z: 0 };
  const fromBoard = (p: V3) => add3(feetAnchor, rotY(fallTurn(rotY(p, -restingBodyYaw)), bodyYawDeg));

  // Kickflip (flipDir 1) flicks off the heelside rail, heelflip off the
  // toeside rail, whichever way the rider faces.
  let flickOut = 0;
  if (spec.flipDir && f.motion.flight >= 0 && f.motion.flight < 1) flickOut = flickExtension(spinP);
  const flickZ = -spec.flipDir * toeDir * 9 * skateStyle.flickStrength * flickOut;
  const flickDir = -spec.flipDir * toeDir;
  // Catch: a real rider's feet land on the board before the board lands on
  // the ground. The shared physics keeps some feet tucked until touchdown
  // (a tre flip's scoop foot) and then plants them in one frame, so ease both
  // feet onto their touchdown spots, relative to the deck, over the end of
  // the flight.
  let footR = f.footR;
  let footL = f.footL;
  const catchK = f.motion.flight >= 0 && f.motion.flight < 1
    ? smoothstep((f.motion.flight - CATCH_START) / (1 - CATCH_START))
    : 0;
  if (catchK > 0) {
    const touch = computeFrame(ROLL_IN + FLIP_T + 1e-4, spec, landed, landed ? 'slam' : outcome, 0.65, skateStyle);
    const onto = (now: Pt, then: Pt): Pt => ({
      x: now.x + (touch.body.x + then.x - touch.board.x - (f.body.x + now.x - f.board.x)) * catchK,
      y: now.y + (touch.body.y + then.y - touch.board.y - (f.body.y + now.y - f.board.y)) * catchK,
    });
    footR = onto(footR, touch.footR);
    footL = onto(footL, touch.footL);
  }
  const noseChannel = clampFootReach(footR);
  const tailChannel = clampFootReach(footL);

  const footPlan = (side: 'left' | 'right') => {
    const isNose = mechanics.noseFoot === side;
    const foot = isNose ? noseChannel : tailChannel;
    const flicking = mechanics.flickFoot === side;
    // Shoe-local x runs heel → toe across the deck toward toeside, raked
    // toward the nose; shoe-local z runs along the board.
    const toeAt = (rake: number) => rotY({ x: 0, y: 0, z: toeDir }, toeDir * rake);
    // Front foot angles toward the nose, back foot sits nearly across.
    const restRake = isNose ? 24 : 8;
    // The ankle's lane across the deck that centers its shoe at SHOE_TOESIDE.
    const restLane = toeDir * SHOE_TOESIDE - toeAt(restRake).z * TOE_REACH;
    const fullTurn = flicking && spec.flipDir === 1 ? FLICK_TOE_TURN * (isNose ? 1 : -1) : 0;
    // The long shoe has to travel until its trailing end (the toe on a
    // kickflip, the heel on a heelflip) is past the far rail — that's the
    // moment it leaves the board. Size the flick by that, plus style.
    let flick = 0;
    if (flicking && flickOut > 0) {
      const trailing = spec.flipDir === 1 ? TOE_REACH + SHOE_HALF_LENGTH : TOE_REACH - SHOE_HALF_LENGTH;
      const trailZ = restLane + toeAt(restRake + fullTurn).z * trailing;
      const reach = DECK_HALF_WIDTH - flickDir * trailZ + FLICK_STYLE_REACH * skateStyle.flickStrength;
      flick = flickDir * flickOut * reach;
    }
    const laneZ = restLane + flick;
    const rake = restRake + fullTurn * flickOut;
    const toe = toeAt(rake);
    const along = rotY({ x: 1, y: 0, z: 0 }, toeDir * rake);
    // The ankle sits over the heel end, so the shoe reaches forward from it.
    const shoeCenter: V3 = {
      x: foot.x + toe.x * TOE_REACH,
      y: foot.y + 2 - SHOE_HALF_HEIGHT,
      z: laneZ + toe.z * TOE_REACH,
    };
    const shoe = frameOf(fromBoard(shoeCenter), (d) => sub3(
      fromBoard({ x: shoeCenter.x + toe.x * d.x + along.x * d.z, y: shoeCenter.y + d.y, z: shoeCenter.z + toe.z * d.x + along.z * d.z }),
      fromBoard(shoeCenter),
    ));
    const hipLocal: V3 = { x: 0, y: 0, z: side === 'left' ? -HIP_Z : HIP_Z };
    return { side, isNose, flicking, shoe, hipLocal, ankle: fromBoard({ x: foot.x, y: foot.y - ANKLE_LIFT, z: laneZ }) };
  };
  const plans = [footPlan('left'), footPlan('right')] as const;

  // ----- Hips -----
  // The hips ride between the feet along the board.
  const centerOffset = boardSpaceDir({ x: HIP_CENTER * (noseChannel.x + tailChannel.x) / 2, y: 0, z: 0 });
  // How low the hips may sit over the deck and still leave each leg LEG_CLEAR
  // of hip-to-ankle room, given how far the foot is lifted and set out.
  let clearance = 0;
  for (const plan of plans) {
    const hipAt = add3(add3(feetAnchor, centerOffset), rotY(plan.hipLocal, bodyYawDeg));
    const across = Math.hypot(plan.ankle.x - hipAt.x, plan.ankle.z - hipAt.z);
    const lifted = f.board.y - plan.ankle.y;
    clearance = Math.max(clearance, lifted + Math.sqrt(Math.max(0, LEG_CLEAR * LEG_CLEAR - across * across)));
  }
  const hip = hipState(f, spec, skateStyle, clearance);
  // A fall hands the hips back to the fall physics (fold, stumble) once the
  // touchdown spring has taken the impact.
  const fallBlend = !landed && hip.sinceTouchdown >= 0 ? smoothstep(hip.sinceTouchdown / FALL_HANDOFF) : 0;
  const hipY = (f.board.y - hip.overDeck) * (1 - fallBlend) + f.body.y * fallBlend;
  const posture = 1 - fallBlend;
  const squat = clamp01((RIDE_HEIGHT - hip.overDeck) / (RIDE_HEIGHT - SQUAT_FLOOR));
  const leanDeg = (LEAN_REST + LEAN_SQUAT * squat) * posture;
  const hipShift = add3(
    scale3(centerOffset, posture),
    boardSpaceDir({ x: 0, y: 0, z: -toeDir * HIP_BACK * squat * posture }),
  );
  const anchor: V3 = add3({ x: f.body.x, y: hipY, z: 0 }, hipShift);

  // Upper body: rest/torso yaw, then a hinge over the toes about the board's
  // long axis, then the trick's body spin.
  const leanX = -toeDir * leanDeg;
  const upperDir = (d: V3, relYaw: number) =>
    rotY(rotX(rotY(d, restingBodyYaw + relYaw), leanX), oriented.bodyYawDeg);
  // Before a body spin the shoulders wind up against it through the crouch
  // and release into it off the pop; the head keeps looking ahead.
  const spinWay = Math.sign(orientTrickRotation(mechanics, {
    flipDeg: 0, yawDeg: 0, bodyYawDeg: (spec.spinDir || 1) * spec.bodyYaw,
  }).bodyYawDeg);
  const torsoRelYaw = oriented.bodyYawDeg * (torsoFollow - 1) - spinWay * PRE_WIND * hip.load;
  const torsoPoint = (p: V3) => add3(anchor, upperDir(fallTurn(p), torsoRelYaw));
  const torsoDir = (d: V3) => upperDir(rotZ(d, f.body.rot), torsoRelYaw);
  const bodyPoint = (p: V3) => add3(anchor, rotY(fallTurn(p), bodyYawDeg));

  // ----- Legs -----
  const leg = (plan: (typeof plans)[number]): LegRig => {
    const hipJoint = bodyPoint(plan.hipLocal);
    // Knees track over the toes, the back one pinched in toward the front
    // foot, like a real stance.
    const kneeAim = rad(plan.isNose ? KNEE_AIM_FRONT : KNEE_AIM_BACK);
    const pole = boardSpaceDir({ x: Math.cos(kneeAim), y: -0.12, z: toeDir * Math.sin(kneeAim) });
    const solved = solveLeg(hipJoint, plan.ankle, pole, plan.shoe.up);
    return {
      side: plan.side,
      hip: hipJoint,
      knee: solved.knee,
      ankle: solved.ankle,
      shoe: moveFrame(plan.shoe, sub3(solved.ankle, plan.ankle)),
      flicking: plan.flicking,
    };
  };

  // ----- Arms -----
  // Arms balance out along the board: the front arm toward the nose, the
  // back arm toward the tail. Falls hand back to the physics' swing.
  const sinceTd = hip.sinceTouchdown;
  const press = sinceTd >= 0 ? squat * (1 - smoothstep(sinceTd / 0.6)) : 0;
  const awkward = spec.stance === 'switch' || spec.stance === 'fakie' ? 1 : 0;
  const arm = (side: 'left' | 'right'): ArmRig => {
    const front = mechanics.frontArm === side;
    const role = front ? 'front' : 'back';
    const sideZ = side === 'left' ? -1 : 1;
    const sway = (front ? f.armFront : f.armBack) * 12 * (1 - hip.air) * (1 - hip.load);
    let pose = mixPose(ARM_RIDE[role], ARM_LOAD[role], hip.load);
    pose = mixPose(pose, ARM_AIR[role], hip.air);
    pose = mixPose(pose, ARM_LAND[role], press);
    pose = { out: pose.out + awkward * 10 * hip.air, swing: pose.swing + sway, elbow: pose.elbow + awkward * 8 * hip.air };
    const [upper, fore] = armDirs(pose, sideZ as 1 | -1);
    const shoulderL: V3 = { x: SHOULDER.x, y: SHOULDER.y, z: sideZ * SHOULDER.z };
    // Legacy swing for falls.
    const swing = front ? f.armFront : f.armBack;
    const bend = side === 'left' ? -0.24 : 0.24;
    const legacyElbow: V3 = { x: shoulderL.x + Math.sin(swing) * UPPER_ARM, y: shoulderL.y + Math.cos(swing) * UPPER_ARM, z: sideZ * SHOULDER.z * 1.22 };
    const legacyHand: V3 = { x: legacyElbow.x + Math.sin(swing + bend) * FOREARM, y: legacyElbow.y + Math.cos(swing + bend) * FOREARM, z: sideZ * SHOULDER.z * 1.36 };
    const elbowL = add3(shoulderL, scale3(upper, UPPER_ARM));
    const handL = add3(elbowL, scale3(fore, FOREARM));
    const mix = (a: V3, b: V3) => add3(scale3(a, posture), scale3(b, 1 - posture));
    return {
      side,
      shoulder: torsoPoint(shoulderL),
      elbow: torsoPoint(mix(elbowL, legacyElbow)),
      hand: torsoPoint(mix(handL, legacyHand)),
    };
  };

  // ----- Head -----
  // The head rides on the leaning torso but only takes part of the lean, and
  // nods down to watch the board while it's in the air.
  const lookDown = (spec.flips || spec.yaw || spec.roll ? LOOK_DOWN_TRICK : LOOK_DOWN_OLLIE) * hip.air;
  const headLean = leanX * (1 - HEAD_STEADY);
  const headRelYaw = headYawDeg - oriented.bodyYawDeg - restingBodyYaw;
  const headDir = (d: V3) =>
    rotY(rotX(rotY(rotZ(rotZ(d, lookDown * posture), f.body.rot), restingBodyYaw + headRelYaw), headLean), oriented.bodyYawDeg);
  const neckTop = torsoPoint({ x: 0, y: -60, z: 0 });
  const headOrigin = add3(neckTop, headDir({ x: 4, y: 0, z: 0 }));

  return {
    board: { center, point: boardPoint, dir: boardDir, flipDeg, yawDeg, pitchDeg },
    legs: [leg(plans[0]), leg(plans[1])],
    arms: [arm('left'), arm('right')],
    torso: frameOf(torsoPoint({ x: 1, y: -14, z: 0 }), torsoDir),
    head: frameOf(headOrigin, headDir),
    toeDir,
    flickZ,
    flickOut,
    bodyYawDeg,
    headYawDeg,
    hipOverDeck: hip.overDeck,
  };
}
