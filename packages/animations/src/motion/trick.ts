import type { SkateStyle, Trick } from '../types';
import { DEFAULT_SKATE_STYLE } from './style';

/**
 * The trick's own motion: what the board, the feet on it, and the body's
 * spin do through one attempt, as a side-on frame at clock time t. Every
 * renderer and every rider solver starts here: `specFor` turns a trick's name
 * into its parameters (flips, shuv, body spin, flick side), and
 * `computeFrame` plays them through the roll in, the pop, the catch, and the
 * landing or a fall (slam / bail / shank). The rider's 3D body is solved on
 * top of this in rig.ts; grinds borrow its hop and rotation clocks.
 */

// ---------- Trick → animation family ----------

interface Spec {
  /** Full rotations around the board's long axis (kickflip family). */
  flips: number;
  /** Direction of the flip: 1 for kickflip (flick back), -1 for heelflip (flick forward), 0 for none. */
  flipDir: 1 | -1 | 0;
  /** Board shuvit / spin degrees around the vertical axis. */
  yaw: number;
  /** Skater spin degrees — independent of the board (180 on 180s AND bigspins). */
  bodyYaw: number;
  /** In-plane end-over-end degrees (impossible). */
  roll: number;
  /** Dolphin/forward flip: front foot drives the nose down through a forward pitch. */
  forwardFlip: boolean;
  /** Nollie pops the nose, so the feet mirror (front foot pops, back foot flicks). */
  nollie: boolean;
  /** Ollie North: lift and extend the leading foot past the nose during the pop. */
  ollieNorth: boolean;
  /** Direction of travel: fakie rides backwards (-1). */
  dir: 1 | -1;
  /** Trick stance for adjusting wind-up awkwardness. */
  stance: Trick['stance'];
  /** Spin direction: -1 = frontside, 1 = backside, 0 = no fs/bs distinction. */
  spinDir: -1 | 0 | 1;
  /**
   * The body spin's direction: the board's (spinDir), unless a counter shuv
   * goes the other way (a ghetto bird's hardflip shuvs frontside, its 180 is backside).
   */
  bodySpinDir: -1 | 0 | 1;
  /** "Late" shuvit: hold the board flat off the pop, then snap the rotation in the back half of the flight. */
  late: boolean;
  /**
   * The board's own shuv (`yaw`, `spinDir`) turns against the body's spin,
   * inside it: a ghetto bird is a frontside hardflip in a backside 180. The
   * rider carries the board through the whole turn, so to them it is a plain
   * hardflip, caught early and square under the feet with the turn still to
   * finish; to the world the deck is caught short of its shuv and brought
   * back round straight.
   */
  counterShuv: boolean;
  /**
   * Degrees the board's spin axis leans off vertical, toward its pitch axis.
   * A spinning, flipping deck is close to a top: its long axis sweeps a cone
   * about one fixed axis while it rolls about itself. Varials and tre flips
   * level the pop with the front foot, so that axis stands vertical and the
   * deck turns flat (0). A hardflip's front foot flicks down instead, the
   * pop's nose-up pitch stays in it, and the axis leans over: the shuv
   * carries the nose up on end between the legs (see the rig's tiltFor).
   */
  tilt: number;
}

/**
 * Share of the catch clock a counter shuv's trick is caught by
 * (Spec.counterShuv): the back of the flight is left to finish the turn.
 */
const COUNTER_SHUV_CATCH = 0.6;
/**
 * Share of its turn the rider has made when a counter shuv is caught. A
 * ghetto bird's rider is some 70° into the backside 180, so the deck, a half
 * turn round them, is caught a bit past a quarter turn round in the world.
 */
const COUNTER_SHUV_TURNED = 0.4;
/** How far a hardflip or inward heelflip's spin axis leans off vertical. */
const HARDFLIP_TILT = 55;
/** A 360 hardflip's lean: its whole turn stands the deck on end twice. */
const HARDFLIP_360_TILT = 40;
/** A 360 inward heelflip's: the heel's flatter flick keeps more of it level. */
const INWARD_HEEL_360_TILT = 20;
/**
 * Share of the flight a tilted trick's pop pitch fades over. It must be gone
 * by the earliest catch (0.85 / the fastest rotationSpeed): the rig hands a
 * finished spin back to the plain turn, which only matches a level deck.
 */
const TILT_POP_FADE = 0.5;

/** How each flatground trick moves, over a plain pop. A function for one whose motion depends on its stance. */
type TrickMotion = Partial<Spec> | ((stance: Trick['stance']) => Partial<Spec>);

const BIGSPIN_HEELFLIP: Partial<Spec> = { flips: 1, yaw: 360, bodyYaw: 180, flipDir: -1, spinDir: 1 };
const BACKSIDE_180: Partial<Spec> = { yaw: 180, bodyYaw: 180, spinDir: 1 };

/**
 * Every flatground trick the motion knows, by its catalog base. Anything
 * else (a grind's name, a manual, a stall) is a plain pop.
 */
const TRICK_MOTIONS: Readonly<Record<string, TrickMotion>> = {
  'Ollie': {},
  'Ollie North': { ollieNorth: true },
  'Kickflip': { flips: 1, flipDir: 1 },
  'Heelflip': { flips: 1, flipDir: -1 },
  'Double Kickflip': { flips: 2, flipDir: 1 },
  'Double Heelflip': { flips: 2, flipDir: -1 },
  'Varial Kickflip': { flips: 1, yaw: 180, flipDir: 1, spinDir: 1 },
  'Hardflip': { flips: 1, yaw: 180, flipDir: 1, spinDir: -1, tilt: HARDFLIP_TILT },
  'Dolphin Flip': { flips: 1, yaw: 180, flipDir: 1, spinDir: 1, forwardFlip: true },
  'Varial Heelflip': { flips: 1, yaw: 180, flipDir: -1, spinDir: -1 },
  'Pressure Flip': { flips: 1, yaw: 180, flipDir: -1, spinDir: 1 },
  'Inward Heelflip': { flips: 1, yaw: 180, flipDir: -1, spinDir: 1, tilt: HARDFLIP_TILT },
  '360 Flip': { flips: 1, yaw: 360, flipDir: 1, spinDir: 1 },
  '360 Double Kickflip': { flips: 2, yaw: 360, flipDir: 1, spinDir: 1 },
  'Laser Flip': { flips: 1, yaw: 360, flipDir: -1, spinDir: -1 },
  '360 Hardflip': { flips: 1, yaw: 360, flipDir: 1, spinDir: -1, tilt: HARDFLIP_360_TILT },
  '360 Inward Heelflip': { flips: 1, yaw: 360, flipDir: -1, spinDir: 1, tilt: INWARD_HEEL_360_TILT },
  'Pop Shuvit': { yaw: 180, spinDir: 1 },
  'Frontside Shuvit': { yaw: 180, spinDir: -1 },
  'Late Backside Shuvit': { yaw: 180, spinDir: 1, late: true },
  'Late Frontside Shuvit': { yaw: 180, spinDir: -1, late: true },
  'Late Kickflip': { flips: 1, flipDir: 1, late: true },
  '360 Shuvit': { yaw: 360, spinDir: 1 },
  'Frontside 360 Shuvit': { yaw: 360, spinDir: -1 },
  'Bigspin': { yaw: 360, bodyYaw: 180, spinDir: 1 },
  'FS Bigspin': { yaw: 360, bodyYaw: 180, spinDir: -1 },
  'Bigspin Flip': { flips: 1, yaw: 360, bodyYaw: 180, flipDir: 1, spinDir: 1 },
  'FS Bigspin Flip': { flips: 1, yaw: 360, bodyYaw: 180, flipDir: 1, spinDir: -1 },
  'Bigspin Heelflip': BIGSPIN_HEELFLIP,
  'BS Bigspin Heelflip': BIGSPIN_HEELFLIP,
  'FS Bigspin Heelflip': { flips: 1, yaw: 360, bodyYaw: 180, flipDir: -1, spinDir: -1 },
  'Frontside 180': { yaw: 180, bodyYaw: 180, spinDir: -1 },
  'Backside 180': BACKSIDE_180,
  'No Comply 180': BACKSIDE_180,
  'Backside Flip': { flips: 1, yaw: 180, bodyYaw: 180, flipDir: 1, spinDir: 1 },
  'Frontside Flip': { flips: 1, yaw: 180, bodyYaw: 180, flipDir: 1, spinDir: -1 },
  'Backside Heelflip': { flips: 1, yaw: 180, bodyYaw: 180, flipDir: -1, spinDir: 1 },
  'Frontside Heelflip': { flips: 1, yaw: 180, bodyYaw: 180, flipDir: -1, spinDir: -1 },
  // A hardflip inside a backside 180: caught early, then turned on round with the board.
  'Ghetto Bird': {
    flips: 1, yaw: 180, flipDir: 1, spinDir: -1, tilt: HARDFLIP_TILT, bodyYaw: 180, bodySpinDir: 1, counterShuv: true,
  },
  'Backside 360': { yaw: 360, bodyYaw: 360, spinDir: 1 },
  'Frontside 360': { yaw: 360, bodyYaw: 360, spinDir: -1 },
  'Backside 360 Kickflip': { flips: 1, yaw: 360, bodyYaw: 360, flipDir: 1, spinDir: 1 },
  'Backside 360 Heelflip': { flips: 1, yaw: 360, bodyYaw: 360, flipDir: -1, spinDir: 1 },
  'Frontside 360 Kickflip': { flips: 1, yaw: 360, bodyYaw: 360, flipDir: 1, spinDir: -1 },
  // Nollie wraps the other way because it pops the nose; fakie only
  // reverses travel and still scoops the tail, so it keeps regular's sign.
  'Impossible': (stance) => ({ roll: stance === 'nollie' ? 360 : -360 }),
};

/** Every flatground trick base the motion animates (aliases included): what the motion sweeps test. */
export const TRICK_BASES: readonly string[] = Object.keys(TRICK_MOTIONS);

function specFor(trick: Trick): Spec {
  const base: Spec = {
    flips: 0,
    flipDir: 0,
    yaw: 0,
    bodyYaw: 0,
    roll: 0,
    forwardFlip: false,
    nollie: trick.stance === 'nollie',
    ollieNorth: false,
    dir: trick.stance === 'fakie' ? -1 : 1,
    stance: trick.stance,
    spinDir: 0,
    bodySpinDir: 0,
    late: false,
    counterShuv: false,
    tilt: 0,
  };
  const motion = TRICK_MOTIONS[trick.base];
  const spec = { ...base, ...(typeof motion === 'function' ? motion(trick.stance) : motion) };
  return { ...spec, bodySpinDir: spec.bodySpinDir || spec.spinDir };
}

/**
 * The board's world yaw (signed degrees) with its own shuv `shuvP` and the
 * body's spin `bodyP` of the way round. The body carries the board with it
 * (a 180's whole turn, a bigspin's first half; all of a counter shuv's) and
 * the board's own shuv turns on top.
 */
function boardYawDeg(spec: Spec, shuvP: number, bodyP: number): number {
  const carried = spec.counterShuv ? spec.bodyYaw : Math.min(spec.yaw, spec.bodyYaw);
  const own = spec.counterShuv ? spec.yaw : spec.yaw - carried;
  return (spec.bodySpinDir || 1) * carried * bodyP + (spec.spinDir || 1) * own * shuvP;
}

/**
 * 0 → 1 through a counter shuv's turn: easing off the pop, COUNTER_SHUV_TURNED
 * of the way by the catch at `caughtAt`, and still coming round at touchdown.
 */
function counterTurnProgress(p: number, caughtAt: number): number {
  return clamp01(p) ** (Math.log(COUNTER_SHUV_TURNED) / Math.log(caughtAt));
}

// ---------- Scene + timing constants ----------

const W = 500;
const H = 340;
const GROUND = 272;
const X0 = 250;
const JUMP = 165; // pop height; a bigger pop buys the spin more hang time
const LIFT = 65; // hip height above the board
const FOOT_Y = 65; // feet below the hip
const THIGH = 35;
const SHIN = 35;
const KNEE_BEND_SCALE = 0.82;
// Switch stance arm spread (radians): how much further each arm opens away
// from the body compared with the natural stances.
const SWITCH_ARM_SPREAD = 0.28;
// Extra sky above the viewBox so the taller pop doesn't clip the skater's head.
const SKY_PAD = 64;

// Global speed trim: stretch every animation phase by this factor so pops,
// spins, and falls read a touch slower than baseline (physics-wise: lower effective gravity
// + lower angular velocity, preserving the relative shape of each motion).
const SPEED_SCALE = 1.12;
const ROLL_IN = 0.5 * SPEED_SCALE;
// Flight time obeys projectile motion: under constant gravity the air time
// scales with sqrt(height), so FLIP_T is derived from JUMP rather than tuned
// independently. Raising JUMP therefore slows every spin by the same physical
// law (more hang time = the 360 has longer to come around). Baseline: a 130px
// pop flew for 0.75s.
const FLIP_T = 0.75 * Math.sqrt(JUMP / 130) * SPEED_SCALE;
/** Share of the flight by which a robot's rotation is caught: 0.85 at neutral speed, never after touchdown. */
const catchFraction = (style: Readonly<SkateStyle>) => Math.min(1, 0.85 / style.rotationSpeed);
const LAND_T = 0.95 * SPEED_SCALE;
// Falls share the landing's "impact → settle" budget so a miss doesn't feel
// like a second, slower animation system. A touch longer than LAND_T for the
// slide-out, but no longer the old 1.7s crawl.
const FALL_T = 1.28 * SPEED_SCALE;
const HOLD = 0.35 * SPEED_SCALE; // freeze on the final frame before onDone
const STREET_DASH_PERIOD = 210;
const STREET_DASH_SECONDS = 0.7 * SPEED_SCALE;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
/** Zero slope at both ends — for handoffs between two motion segments. */
const smoothstep = (p: number) => p * p * (3 - 2 * p);
const rad = (d: number) => (d * Math.PI) / 180;
/** Signed yaw squash: passes through a thin edge instead of vanishing. */
const signedSquash = (c: number) => (Math.abs(c) < 0.01 ? 0.15 : Math.sign(c) * (0.15 + 0.85 * Math.abs(c)));

export type FallVariant = 'slam' | 'bail' | 'shank';

export const FALL_VARIANT_OPTIONS: ReadonlyArray<{ id: FallVariant; label: string }> = [
  { id: 'slam', label: 'Slam' },
  { id: 'bail', label: 'Bail' },
  { id: 'shank', label: 'Shank' },
];

const randomFallVariant = () => {
  // Full pool for every miss — shank (under-rotate) is allowed even when the
  // bot knew the trick. Not knowing it still forces shank via forcedFall.
  return FALL_VARIANT_OPTIONS[Math.floor(Math.random() * FALL_VARIANT_OPTIONS.length)].id;
};
/** How far a shanked trick gets before it dies — shared by flip and body spin. */
const SHANK_PROGRESS_MIN = 0.35;
const SHANK_PROGRESS_MAX = 0.90;
const randomShankProgress = () =>
  SHANK_PROGRESS_MIN + Math.random() * (SHANK_PROGRESS_MAX - SHANK_PROGRESS_MIN);

interface Pt {
  x: number;
  y: number;
}

interface Frame {
  t: number;
  board: { x: number; y: number; rot: number; sx: number; sy: number; griptape: boolean };
  body: { x: number; y: number; sx: number; rot: number };
  /** Raw signed rotation angles (deg). The 2D renderer keeps using the baked
   *  sx/sy squash factors; a renderer that can rotate for real (3D) uses
   *  these instead. flipDeg = around the board's long axis, yawDeg = board
   *  around the vertical axis, forwardPitchDeg = Dolphin/Forward-flip nose
   *  dive, bodyYawDeg = skater around the vertical axis; a counter shuv
   *  also names its shuvDeg (RawTrickRotation). */
  spin3d: { flipDeg: number; yawDeg: number; forwardPitchDeg: number; bodyYawDeg: number; shuvDeg?: number };
  /** Shared phase clocks for renderer-only motion such as lateral flick. */
  motion: { flight: number; rotation: number };
  footL: Pt;
  footR: Pt;
  armFront: number;
  armBack: number;
  streetDist: number;
}

interface Feet {
  /** Canonical tail-side channel. Renderers map it to the rider's anatomy. */
  footL: Pt;
  /** Canonical nose-side channel. Renderers map it to the rider's anatomy. */
  footR: Pt;
}

// ---------- Per-frame math ----------

/** Board and feet stay glued: ollies, grinds/stalls, and 180s (board and body turn together). */
function boardGlued(spec: Spec): boolean {
  return !spec.flips && !spec.roll && spec.yaw === spec.bodyYaw;
}

/**
 * Shuvits and tre/laser-style 360 flips spin the board under the feet — the
 * readable catch is a front-foot stamp while the back foot stays tucked a beat
 * longer. Body-rotation combos (bigspins, FS/BS flips) keep a two-footed catch.
 */
function wantsFrontFootCatch(spec: Spec): boolean {
  if (spec.bodyYaw || spec.roll || spec.forwardFlip) return false;
  if (spec.yaw > 0 && !spec.flips) return true;
  if (spec.flips > 0 && spec.yaw >= 360) return true;
  return false;
}

/**
 * 0→1 through late flight: how hard the front foot has planted for the catch.
 * `p` is the catch/spin clock passed into feetForFlip (finishes at ~0.85 of
 * raw flight), so the plant is keyed to the last third of that clock — peaking
 * near the contact-sheet "catch" frame without dipping the foot mid-spin.
 */
function frontFootCatchPlant(p: number): number {
  return smoothstep(clamp01((p - 0.62) / 0.32));
}

function feetForFlip(
  spec: Spec,
  p: number,
  bodyYOffset: number,
  boardRot: number,
  flickStrength = 1,
): Feet {
  const lift = Math.sin(p * Math.PI);
  const baselineY = FOOT_Y - bodyYOffset - 4;
  const popFromNose = spec.nollie;
  const popBaseX = popFromNose ? 25 : -25;
  const flickBaseX = popFromNose ? -25 : 25;
  const popOutward = popFromNose ? 1 : -1;
  const flickOutward = popFromNose ? -1 : 1;
  const catchPlant = wantsFrontFootCatch(spec) ? frontFootCatchPlant(p) : 0;

  // The frame channels are board roles, not anatomical labels: footR always
  // occupies the nose side and footL always occupies the tail side. Nollie
  // swaps which role pops/flicks, never which end of the board those channels
  // represent. This is what lets the renderer attach a real regular/goofy
  // skeleton without silently turning a kickflip into a heelflip.
  const fromPopAndFlick = (pop: Pt, flick: Pt): Feet => {
    // Strong styles can ask for a larger gesture, never a stretched shin.
    // Leave neutral untouched so the pre-style renderer stays byte-equivalent.
    const reachableFlick = flickStrength === 1 ? flick : clampFootReach(flick);
    return popFromNose
      ? { footR: pop, footL: reachableFlick }
      : { footR: reachableFlick, footL: pop };
  };

  if (spec.flips && spec.yaw && !spec.forwardFlip && spec.yaw < 360) {
    // Varial / hardflip: kickflip-style flick + mild scoop. Dolphin keeps the
    // tre-style path below (it still has forwardFlip), so we only change
    // true 180-shuv flip combos here.
    const scoop = p < 0.35 ? 12 * Math.sin((p / 0.35) * Math.PI) : 0;
    const flickReach = spec.flipDir === -1 ? 12 : 8;
    return fromPopAndFlick(
      {
        x: popBaseX + popOutward * scoop,
        y: baselineY - lift * 11,
      },
      {
        x: flickBaseX + flickOutward * lift * flickReach * flickStrength,
        y: baselineY - lift * 17 * flickStrength,
      },
    );
  } else if (spec.flips && spec.yaw) {
    // Tre-flip style (and dolphin): back-foot scoop, front foot out of the way.
    // For 360 flips the front/flick foot stamps the catch while the scooping
    // foot stays tucked a beat longer.
    const scoop = p < 0.3 ? 20 * Math.sin((p / 0.3) * Math.PI) : 0;
    const flickLift = lift * 25 * flickStrength * (1 - catchPlant);
    const popLift = lift * 8 + catchPlant * 16;
    const flickReturn = catchPlant * 10; // pull the kicked foot back over the bolts
    return fromPopAndFlick(
      {
        x: popBaseX + popOutward * scoop,
        y: baselineY - popLift,
      },
      {
        x: flickBaseX
          + flickOutward * lift * 8 * flickStrength * (1 - catchPlant)
          - flickOutward * flickReturn,
        y: baselineY - flickLift,
      },
    );
  } else if (spec.flips) {
    // Kickflip/Heelflip style: front foot flicks off the nose.
    // Kickflip and heelflip use opposite lateral edges in 3D; both extend the
    // flicking foot outward from its board end instead of moving the pop foot.
    const flickX = spec.flipDir === -1 ? 16 : 11;
    const flickY = spec.flipDir === -1 ? 26 : 23;
    return fromPopAndFlick(
      { x: popBaseX, y: baselineY - lift * 10 },
      {
        x: flickBaseX + flickOutward * lift * flickX * flickStrength,
        y: baselineY - lift * flickY * flickStrength,
      },
    );
  } else if (spec.roll) {
    // Impossible: the popping foot guides the wrap; the free foot tucks to
    // clear the board. Drive the tuck off an ease that rises and releases
    // without stalling at the apex (sin(πp) zeroed out mid-flight and read
    // as a pause).
    const wrapP = Math.min(1, p / 0.95);
    const tuck = Math.sin(Math.min(1, wrapP / 0.55) * Math.PI * 0.5);
    const release = smoothstep(clamp01((wrapP - 0.72) / 0.28));
    const tuckAmt = tuck * (1 - release);
    if (spec.nollie) {
      // Nollie pops the nose: front foot (footR) is the scooping foot.
      const scoopX = 25 - tuckAmt * 10;
      const scoopY = -tuckAmt * 8;

      return {
        footR: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
        footL: { x: -15, y: FOOT_Y - bodyYOffset - 4 - tuckAmt * 27 },
      };
    }

    // Regular: back foot (footL) is the scooping foot.
    const scoopX = -25 + tuckAmt * 10;
    const scoopY = -tuckAmt * 8;

    return {
      footL: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
      footR: { x: 15, y: FOOT_Y - bodyYOffset - 4 - tuckAmt * 27 },
    };
  } else if (boardGlued(spec)) {
    // Ollie family: the feet ride the rotated deck — front foot up the nose
    // on the pop, back foot down on the tail. popAngle already encodes the
    // stance (nollie pops the nose, +60; regular pops the tail, -60), so the
    // feet fall out of cos/sin(boardRot) without any nollie mirroring — return
    // early to skip the mirror block below (mirroring would push the front
    // foot back onto the tail and contradict the nose-down pop).
    const th = rad(boardRot);
    const footR = { x: 25 * Math.cos(th), y: FOOT_Y - 6 + 25 * Math.sin(th) - bodyYOffset };
    const footL = { x: -25 * Math.cos(th), y: FOOT_Y - 6 - 25 * Math.sin(th) - bodyYOffset };
    if (!spec.ollieNorth) return { footR, footL };

    // The front/nose foot comes off the deck and reaches north. In nollie that
    // is also the popping foot (footR): it snaps the nose first, then releases
    // while footL levels the board. Fakie keeps regular foot roles—only the
    // direction of travel reverses—so footR still kicks over the board's nose.
    // Let the ollie read cleanly first, then send the foot north once the deck
    // starts leveling. The smooth pulse gives the late extension a stylish
    // pause before it returns in time for the catch.
    const northP = clamp01((p - 0.32) / 0.62);
    const northExtension = Math.sin(smoothstep(northP) * Math.PI);
    // Favor horizontal travel over a tucked knee so the leg visibly straightens
    // through the stylish kick instead of only lifting above the deck.
    const northLift = northExtension * 36;
    const reach = northExtension * 32;
    return { footR: { x: footR.x + reach, y: footR.y - northLift }, footL };
  } else {
    // Shuvit family: the board spins beneath — tuck both knees out of the way.
    // Feet ease from the roll-in plant toward the ride-away plant across the
    // flight (matching x at both seams) instead of jumping straight to a
    // fixed tuck position, so the pop and the catch don't snap the feet
    // sideways. Nollie's roll-in/landing seats are handled explicitly (like
    // the ollie family above) since they aren't a mirror of the regular ones.
    // Front-foot catch: stamp the stance-front foot onto the deck while the
    // scooping foot stays tucked through the catch frame.
    const ease = Math.sin(p * Math.PI * 0.5);
    const frontLift = lift * 17 * (1 - catchPlant);
    const backLift = lift * 14 + catchPlant * 14;
    if (spec.nollie) {
      // Nollie: anatomical front foot is on the tail (footL).
      return {
        footR: {
          x: 34 - ease * 16,
          y: baselineY - backLift,
        },
        footL: {
          x: -8 - catchPlant * 4,
          y: baselineY - frontLift,
        },
      };
    }
    return {
      footR: {
        x: 10 + ease * 2 + catchPlant * 4,
        y: baselineY - frontLift,
      },
      footL: {
        x: -34 + ease * 19,
        y: baselineY - backLift,
      },
    };
  }
}

function computeFrame(
  t: number,
  spec: Spec,
  landed: boolean,
  fall: FallVariant,
  /** Fraction of the trick that completes on a shank (flip + body spin). */
  shankProgress = 0.65,
  skateStyle: Readonly<SkateStyle> = DEFAULT_SKATE_STYLE,
): Frame {
  let boardX = X0;
  let boardY = GROUND;
  let boardRot = 0;
  let sx = 1;
  let sy = 1;
  let bodyX = X0;
  // Switch riders stand a bit taller on the board, naturally straightening the knees
  let bodyYOffset = spec.stance === 'switch' ? -8 : 0;
  let bodySX = 1;
  let bodyRot = 0;
  let bodyFallY = 0;
  let footL: Pt | null = null;
  let footR: Pt | null = null;
  let armFront = Math.sin(t * 3) * 0.3;
  let armBack = Math.sin(t * 3 + Math.PI) * 0.3;
  let falling = false;
  let flipDeg = 0;
  let yawDeg = 0;
  let shuvDeg = 0;
  let forwardPitchDeg = 0;
  let bodyYawDeg = 0;
  const flightProgress = (t - ROLL_IN) / FLIP_T;
  let rotationProgress = 0;

  const popAngle = spec.nollie ? 60 : -60;

  if (t < ROLL_IN) {
    // Roll in with a bob, settled into a real crouch so BOTH knees clearly bend
    // forward. A shallow rest pose leaves the trailing leg near-straight, which
    // reads as the two knees bending in opposite directions.
    // Scale compression by trick difficulty (more flips/spins = deeper crouch)
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    // Nollie keeps its exaggerated load. Switch uses natural depth.
    const stanceLoad = spec.stance === 'nollie' ? 1.4 : 1;
    const crouchDepth = (22 + (complexity * 8)) * stanceLoad;
    const crouchRatio = clamp01((t - (ROLL_IN - 0.2)) / 0.2);
    bodyYOffset += Math.sin(t * 12) * 2 + crouchDepth * (0.5 + 0.5 * crouchRatio);

    // Feet tucked under the hips so the trailing leg bends as much as the lead
    // leg — both knees then track forward toward the nose instead of one bowing
    // hard while the other stays straight. In regular the back foot plants on
    // the tail to pop; in nollie the front foot shifts up onto the nose to pop
    // and the back foot moves toward the center, so the wind-up reads distinct.
    if (spec.nollie) {
      // Pop off the nose: front foot plants far forward, back foot stays near the bolts.
      footR = { x: 34, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -8, y: FOOT_Y - bodyYOffset - 4 };
    } else {
      // Pop off the tail: back foot plants far back on the tail, front foot stays near the bolts.
      footR = { x: 10, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -34, y: FOOT_Y - bodyYOffset - 4 };
    }

    // Wind up arms before pop — frontside winds up opening the chest (front arm
    // sweeps further forward), backside winds up closing (front arm tucks back).
    const windDir = spec.spinDir || 1;
    armFront = armFront * (1 - crouchRatio) + (0.8 + 0.4 * windDir) * crouchRatio;
    armBack = armBack * (1 - crouchRatio) - (0.5 + 0.3 * windDir) * crouchRatio;

    // Pre-rotation body lean: frontside opens the chest (lean toward the toes,
    // +x), backside winds up turning the back in first (lean toward the heels,
    // -x). Only for tricks with body rotation (180s, 360s, bigspins) off
    // the pop: a counter shuv's turn eases in, so it sets up as its trick does.
    if (spec.bodySpinDir && spec.bodyYaw && !spec.counterShuv) {
      bodyX += spec.bodySpinDir * spec.dir * 8 * crouchRatio;
    }
  } else if (t < ROLL_IN + FLIP_T) {
    const p = (t - ROLL_IN) / FLIP_T;
    
    // The "Catch": finish board rotation early so it holds flat before
    // landing. Robot style only stretches this normalized clock; the actual
    // flight phase remains the same duration for every opponent.
    // Slow styles may use the entire flight, but must still finish at
    // touchdown. Without the cap, values below 0.85 would remain visibly
    // under-rotated at p=1 and snap into the landed pose on the next frame.
    const catchAt = catchFraction(skateStyle);
    const caughtAt = spec.counterShuv ? catchAt * COUNTER_SHUV_CATCH : catchAt;
    const catchP = clamp01(p / caughtAt);
    // A "late" shuvit holds the board flat off the pop, then whips the rotation
    // through in the back half of the flight (the late scoop). Its yaw runs on a
    // delayed clock; everything else (pop arc, catch) stays on catchP.
    const rawSpinP = spec.late
      ? clamp01((p - 0.38) / (0.30 / skateStyle.rotationSpeed))
      : catchP;
    // Pure shuvits (no flip, no body rotation) decelerate into the catch
    // instead of snapping to a dead stop mid-air — flip/bigspin families keep
    // the linear clock since their sy/pitch curves already read fine at
    // constant angular speed.
    const shuvitFamily = spec.yaw > 0 && !spec.bodyYaw && !spec.flips && !spec.forwardFlip;
    const spinP = shuvitFamily ? easeOutCubic(rawSpinP) : rawSpinP;
    rotationProgress = spinP;
    
    // Shank: the trick dies mid-rotation. Flip and body spin (yaw) share the
    // same per-attempt progress (35–90%) so an under-rotated kickflip 180
    // reads as one incomplete move, not a flip with a frozen body.
    const shankScale = (!landed && fall === 'shank') ? shankProgress : 1;
    const shankFlipScale = shankScale;
    const shankYawScale = shankScale;
    const shankBodyScale = shankScale;
    const shankRollScale = shankScale;
    
    boardY = GROUND - 4 * JUMP * skateStyle.popHeight * p * (1 - p);
    // Lateral drift mid-spin: the board arcs toward the toes (frontside, -1)
    // or heels (backside, +1) so the spin reads with a direction. The drift
    // peaks at the rotation apex and returns to center for the catch.
    if (spec.spinDir && spec.yaw) {
      const driftAmp = spec.yaw >= 360 ? 11 : 8;
      boardX += spec.spinDir * spec.dir * driftAmp * Math.sin(p * Math.PI);
    }
    // Late tricks run the rotation on a delayed clock (spinP); for non-late
    // tricks spinP === catchP so this is a no-op.
    sy = spec.flips ? Math.cos(rad(spinP * spec.flips * 360 * shankFlipScale)) : 1;
    // The feet catch a flip or the board's own shuv early, but a body spin
    // has the whole rider's momentum behind it: it turns steadily until
    // touchdown, carrying the board round with it, and never stops in the air.
    // A counter shuv's turn eases in round the trick and on past its catch.
    const bodyP = spec.counterShuv ? counterTurnProgress(p, caughtAt) : p;
    const boardYaw = boardYawDeg(spec, spinP, bodyP);
    if (spec.yaw) {
      const c = Math.cos(rad(boardYaw * shankYawScale));
      // A clean spin (no flip) reads better passing through the signed thin
      // edge; combined with a flip the scaleY rotation already carries it.
      sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
    }
    if (spec.bodyYaw) bodySX = signedSquash(Math.cos(rad(bodyP * spec.bodyYaw * shankBodyScale)));
    // Raw angles for the 3D renderer — same clocks (spinP/catchP, and the
    // flight for a body spin) as the squash factors above, so late tricks
    // and shanks carry over for free.
    flipDeg = spec.flipDir * spinP * spec.flips * 360 * shankFlipScale;
    yawDeg = boardYaw * shankYawScale;
    shuvDeg = (spec.spinDir || 1) * spec.yaw * spinP * shankYawScale;
    forwardPitchDeg = spec.forwardFlip ? spec.dir * spinP * 180 * shankYawScale : 0;
    bodyYawDeg = (spec.bodySpinDir || 1) * bodyP * spec.bodyYaw * shankBodyScale;
    // Impossible: one continuous wrap from the popped angle through a full
    // end-over-end revolution. A separate pop-taper + linear roll used to
    // nearly cancel mid-flight (board almost stops rotating, then restarts),
    // which read as two disjoint moves with a pause in the middle. Ease the
    // whole 360 across nearly the full hang time so it also doesn't finish
    // early and hang flat before the catch.
    if (spec.roll) {
      // A relaxed style still completes the wrap in flight instead of snapping
      // from an unfinished impossible to the landed pose at touchdown.
      const wrapEnd = Math.min(0.98, 0.95 / skateStyle.rotationSpeed);
      const wrapP = easeOutCubic(Math.min(1, p / wrapEnd));
      boardRot = popAngle + (spec.roll - popAngle) * wrapP * shankRollScale;
    } else if (spec.late) {
      // Late tricks: board stays flat after the pop (no wobble). Shuvits
      // add a scoop dip as the back foot whips the tail around mid-flight;
      // late flips skip the dip — the flip itself comes from sy + pitch.
      // smoothstep (zero slope at both ends) instead of a plain quadratic so
      // the decay settles into the flat hold instead of arriving at speed.
      boardRot = p < 0.3 ? popAngle * (1 - smoothstep(clamp01(p / 0.3))) : 0;
      if (spec.yaw) {
        const scoopPhase = rawSpinP;
        const dipEase = Math.sin(clamp01(scoopPhase / 0.2) * Math.PI);
        const dipDir = spec.nollie ? 1 : -1; // tail dips down regardless of stance
        boardRot += dipEase * dipDir * -14;
      }
    } else if (spec.tilt) {
      // A tilted spin keeps the pop's pitch (Spec.tilt): its leaning axis
      // lifts the nose as the pop's own pitch fades, so the fade runs over
      // that climb instead of levelling the deck off first. It eases off
      // from the start (the popping foot rides the strike, not a held
      // pitch) and arrives at zero with zero slope, by the catch at the
      // latest (a counter shuv's comes early).
      const fade = Math.min(TILT_POP_FADE, caughtAt);
      boardRot = popAngle * (1 - clamp01(p / fade)) ** 2;
    } else if (p < 0.3) {
      // smoothstep (zero slope at both ends) instead of a plain quadratic so
      // the pop decay arrives at the wobble with zero velocity, not at speed.
      boardRot = popAngle * (1 - smoothstep(clamp01(p / 0.3)));
    } else {
      // Idle flight wobble, faded in from the pop-decay's zero so the handoff
      // doesn't jump straight to full amplitude mid-swing.
      const wobbleP = clamp01((p - 0.3) / 0.7);
      const wobbleFade = smoothstep(Math.min(1, wobbleP / 0.25));
      boardRot = Math.sin(wobbleP * Math.PI * 2) * 4 * wobbleFade;
    }

    // 360s shouldn't snap flat right off the pop. Let the nose hang and dip
    // deeper as the board comes around, then ease back to level for the catch.
    // Tune to taste: SPIN_DIP_DEG = how far the nose drops, SPIN_DIP_BIAS =
    // how late in the rotation the dip peaks (higher = closer to the end).
    // A tilted spin pitches the deck itself (Spec.tilt): these nods would fight it.
    if (spec.yaw >= 360 && !spec.tilt) {
      const SPIN_DIP_DEG = 22;
      const SPIN_DIP_BIAS = 2.2;
      const dipDir = (spec.nollie ? -1 : 1) * (spec.spinDir || 1); // nose-down in the stance's frame, mirrored by fs/bs
      // sin() pins the dip to 0 at the pop and the catch; pow() pushes the peak
      // toward the end of the spin; smoothstep eases the leveling on the way out.
      const dipShape = Math.sin(catchP * Math.PI) * Math.pow(catchP, SPIN_DIP_BIAS);
      boardRot += dipDir * SPIN_DIP_DEG * dipShape;
    }

    // Add board pitch for kickflips (rocket up) vs heelflips (dive down).
    // Late tricks delay the pitch onto spinP so the board holds flat during
    // the hold phase, then pitches as the flip fires.
    // Varials stay flatter so the shuv+flip reads instead of a nose-dive;
    // dolphin/forwardFlip keeps the full pitch (handled in 3D via forwardPitchDeg).
    if (spec.flipDir && !spec.tilt) {
      const pitchAmp = spec.yaw && !spec.forwardFlip && spec.yaw < 360 ? 4 : 15;
      boardRot += spec.flipDir * Math.sin(spinP * Math.PI) * pitchAmp;
    }
    // Explode out of the crouch into a near-straight popping leg, then settle
    // into the mid-air tuck (glued) / stretch (flips). Without the early
    // stretch the body stays crouched through the snap and the popping knee
    // never opens — the tell is a bent back leg while the tail is still on
    // the ground. Flips get the full stretch later so the feet clear the board.
    const flightLift = Math.sin(Math.sqrt(p) * Math.PI);
    const popStretch = Math.exp(-p / 0.1) * (boardGlued(spec) ? 24 : 16);
    bodyYOffset += 30 - flightLift * (boardGlued(spec) ? 18 : 35) - popStretch;
    
    // Throw arms up and out during jump
    const jumpApex = Math.sin(p * Math.PI);
    const flail = (spec.stance === 'switch' || spec.stance === 'fakie') ? 1.4 : 1;
    armFront = (-1.2 + jumpApex * 0.8) * flail; 
    armBack = (1.0 - jumpApex * 0.6) * flail;
    
    // Add restrained rotational flair for spins. A full sin(2π) cycle made the
    // arms reverse direction halfway through the trick; when the near/far arm
    // changed under 3D depth sorting, that looked like one forearm teleporting
    // into a completely different pose. One half-sine gives a single smooth
    // sweep that returns to the catch pose without reversing mid-air.
    if (spec.bodyYaw) {
      const spinSign = spec.bodySpinDir || 1;
      const armSweep = Math.sin(bodyP * Math.PI) * 0.28 * flail * spinSign;
      armFront -= armSweep;
      armBack += armSweep;
    }
    
    if (spec.late) {
      if (spec.flips) {
        // Late flip: hold the board flat off the pop, then flick the flip
        // through in the back half of the flight. feetForFlip with spinP=0
        // gives planted feet (hold); as spinP ramps up the flick kicks in
        // on the delayed clock.
        const feet = feetForFlip(spec, spinP, bodyYOffset, boardRot, skateStyle.flickStrength);
        footL = feet.footL;
        footR = feet.footR;
      } else {
        // Late shuvit: back foot stays near the board during the hold phase,
        // then scoops backward/around to whip the board rotation mid-flight.
        // Finish with a front-foot catch — same stamp as a regular shuvit.
        const scoopP = rawSpinP;
        // Quick pop-and-return scoop arc: peaks early, tapers back toward the
        // board as the rotation comes around so the foot doesn't hang out.
        const scoopArc = Math.sin(scoopP * Math.PI) * (1 - scoopP * 0.5);
        const catchPlant = frontFootCatchPlant(clamp01(p * skateStyle.rotationSpeed));
        const th = rad(boardRot);
        const noseX = spec.nollie ? 25 : 10;
        const tailX = spec.nollie ? -10 : -25;
        const holdR = { x: noseX * Math.cos(th), y: FOOT_Y - 6 + noseX * Math.sin(th) - bodyYOffset };
        const holdL = { x: tailX * Math.cos(th), y: FOOT_Y - 6 + tailX * Math.sin(th) - bodyYOffset };
        // The actual popping end scoops outward. The other end lifts just
        // enough to clear the late rotation; rider stance does not alter this
        // nose/tail mechanic. CatchPlant then drops the front foot onto the
        // deck while the scooping foot stays tucked.
        if (spec.nollie) {
          footR = {
            x: holdR.x + scoopArc * 22,
            y: holdR.y - scoopArc * 16 - catchPlant * 12,
          };
          footL = {
            x: holdL.x + scoopArc * 8 * (1 - catchPlant),
            y: holdL.y - scoopArc * 10 * (1 - catchPlant),
          };
        } else {
          footR = {
            x: holdR.x - scoopArc * 8 * (1 - catchPlant),
            y: holdR.y - scoopArc * 10 * (1 - catchPlant),
          };
          footL = {
            x: holdL.x - scoopArc * 22,
            y: holdL.y - scoopArc * 16 - catchPlant * 12,
          };
        }
      }
    } else {
      const feet = feetForFlip(spec, catchP, bodyYOffset, boardRot, skateStyle.flickStrength);
      footL = feet.footL;
      footR = feet.footR;
    }
  } else if (landed) {
    rotationProgress = 1;
    // Compress on the catch, then ride away. After a 180/bigspin the skater
    // stays turned around (rides away switch).
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    const stanceLoad = spec.stance === 'nollie' ? 1.2 : 1;
    const landingCompression = (12 + (complexity * 6)) * stanceLoad;
    
    const p = clamp01((t - ROLL_IN - FLIP_T) / LAND_T);
    // Seed from the flight-end tuck (~30) so the knees stay bent through the
    // catch instead of snapping straight then re-bending (jitter).
    const FLIGHT_END_OFFSET = 30;
    const RIDE_AWAY_OFFSET = 6;
    if (p < 0.55) {
      const q = p / 0.55;
      const settle = easeInOutCubic(q);
      bodyYOffset += FLIGHT_END_OFFSET * (1 - settle) + RIDE_AWAY_OFFSET * settle + landingCompression * Math.sin(q * Math.PI);
    } else {
      bodyYOffset += RIDE_AWAY_OFFSET + Math.sin(t * 12) * 2;
    }
    // Narrow stance during compression so the back knee doesn't protrude
    // below the board, then smoothly widen back to the ride-away stance across
    // the settle phase so the foot doesn't jump at p=0.55.
    const narrowR = spec.nollie ? 18 : 10;
    const narrowL = spec.nollie ? -8 : -15;
    const wideR = spec.nollie ? 25 : 12;
    const wideL = spec.nollie ? -10 : -25;
    const wideBlend = p < 0.55 ? 0 : easeInOutCubic((p - 0.55) / 0.45);
    footR = { x: narrowR + (wideR - narrowR) * wideBlend, y: FOOT_Y - bodyYOffset - 4 };
    footL = { x: narrowL + (wideL - narrowL) * wideBlend, y: FOOT_Y - bodyYOffset - 4 };
    bodySX = Math.sign(Math.cos(rad(spec.bodyYaw))) || 1;
    // Trick complete: hold the final rotations (rides away turned after 180s).
    flipDeg = spec.flipDir * spec.flips * 360;
    yawDeg = boardYawDeg(spec, 1, 1);
    shuvDeg = (spec.spinDir || 1) * spec.yaw;
    forwardPitchDeg = spec.forwardFlip ? spec.dir * 180 : 0;
    bodyYawDeg = (spec.bodySpinDir || 1) * spec.bodyYaw;
    
    // Arms come down to balance on landing
    const landP = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) : 0;
    armFront = armFront * (1 - p) + (Math.sin(t * 3) * 0.3 + landP * 0.5);
    armBack = armBack * (1 - p) + (Math.sin(t * 3 + Math.PI) * 0.3 - landP * 0.5);
  } else {
    rotationProgress = 1;
    // Fall: same physics language as a landing — impact, compress, settle —
    // with a different outcome. Seed from the flight-end tuck so the handoff
    // doesn't teleport limbs or arms into a separate ragdoll sim. Fakie
    // mirrors via spec.dir on the body group below.
    falling = true;
    const u = t - ROLL_IN - FLIP_T;

    // Flight-end hip offset (~30) matches the landed branch's FLIGHT_END_OFFSET
    // so a miss starts at the same height a catch would.
    const FALL_START_Y = 30 + (spec.stance === 'switch' ? -8 : 0);
    const FEET_PLANT_Y = 2;
    const FLIGHT_FOOT_Y = FOOT_Y - FALL_START_Y - 4;
    const PLANT_FOOT_Y = FOOT_Y - 2;
    // Flight-end arms (p→1 of the jump): apex term zeroes out, leaving the
    // thrown-up catch pose. Falls blend from here instead of snapping to flail.
    const FLIGHT_ARM_F = -1.2;
    const FLIGHT_ARM_B = 1.0;

    // Shared timing: a quick impact (like landing compression) then a settle
    // that fills the rest of FALL_T. Continuous curves — no hard phase cuts.
    const IMPACT_T = 0.4;
    const impact = easeInOutCubic(clamp01(u / IMPACT_T));
    const settle = easeOutCubic(clamp01((u - IMPACT_T) / Math.max(0.01, FALL_T - IMPACT_T)));
    // Soft secondary motion at landing-bob frequencies, not frantic flail.
    const wobble = (amp: number, freq: number, decay: number) =>
      amp * Math.sin(u * freq) * Math.exp(-decay * u);

    // Board leave eases with the body impact so deck and rider feel coupled.
    const boardLeave =
      fall === 'bail' ? -70
        : fall === 'slam' ? 85
          : 38; // shank: crooked, nearby
    boardX = X0 + spec.dir * boardLeave * easeOutCubic(clamp01(u / 0.55));

    let fx: number;
    let fy: number;

    if (fall === 'slam') {
      // Forward fold over planted feet — hips drop, torso follows.
      bodyRot = 90 * impact + 14 * settle + wobble(2.5, 5, 2.6);
      fx = 8 * impact + 20 * settle;
      fy = FALL_START_Y * (1 - impact) + FEET_PLANT_Y * impact + wobble(2, 6, 2.4);

      // Feet: flight tuck → plant + crumple (pull toward hip, stay in reach).
      const crumple = easeOutCubic(clamp01(u / 0.5));
      footR = clampFootReach({
        x: 12 + 6 * (1 - crumple),
        y: FLIGHT_FOOT_Y * (1 - crumple) + (PLANT_FOOT_Y - 10) * crumple,
      });
      footL = clampFootReach({
        x: -18 - 4 * crumple,
        y: FLIGHT_FOOT_Y * (1 - crumple) + (PLANT_FOOT_Y - 14) * crumple,
      });

      // Arms: flight pose → protective brace → quiet settle (land language).
      const brace = Math.sin(clamp01(u / IMPACT_T) * Math.PI);
      armFront = FLIGHT_ARM_F * (1 - impact) + (-0.35 + brace * 0.55) * impact + wobble(0.12, 4, 2);
      armBack = FLIGHT_ARM_B * (1 - impact) + (0.45 - brace * 0.35) * impact + wobble(0.1, 4.5, 2);
    } else if (fall === 'bail') {
      // Stepped off: jog out the speed, then settle like a heavy landing.
      const slow = easeOutCubic(clamp01(u / 0.85));
      fx = 95 * slow;
      // Same compression envelope as a catch: dip then ride-away height.
      const compress = Math.sin(clamp01(u / 0.45) * Math.PI);
      fy = FALL_START_Y * (1 - slow) + FEET_PLANT_Y * slow + 10 * compress * (1 - settle);
      bodyRot = 6 * Math.sin(clamp01(u / 0.35) * Math.PI) * (1 - settle) + wobble(2, 4.5, 2);

      // Gait decelerates with the body — cadence matches land bob, not a sprint.
      const runVigor = Math.exp(-1.6 * u);
      const planted = 1 - runVigor;
      const cycle = u * 9;
      const strideX = 16 * runVigor;
      const liftAmp = 12 * runVigor;
      const liftR = Math.max(0, Math.cos(cycle));
      const liftL = Math.max(0, -Math.cos(cycle));
      footR = clampFootReach({
        x: 12 + planted * 4 + Math.sin(cycle) * strideX,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - liftR * liftAmp + planted * 2) * impact,
      });
      footL = clampFootReach({
        x: -10 - planted * 4 + Math.sin(cycle + Math.PI) * strideX,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - liftL * liftAmp + planted * 2) * impact,
      });

      armFront = FLIGHT_ARM_F * (1 - impact)
        + (Math.sin(cycle) * 0.7 * runVigor + 0.35 * planted) * impact;
      armBack = FLIGHT_ARM_B * (1 - impact)
        + (-Math.sin(cycle) * 0.7 * runVigor - 0.25 * planted) * impact;
    } else if (fall === 'shank') {
      // Under-rotated: board lands crooked nearby, bot stumbles off it.
      // Freeze flip/yaw/body at the incomplete pose the flight died at — easing
      // those back to 0 made failed 180s slowly unwind to the start on the
      // ground. Only the crooked landing tilt (pitch) settles flat.
      const tiltSettle = Math.exp(-2.2 * u);
      boardRot = spec.roll ? spec.roll * shankProgress : 32 * tiltSettle;
      const shankAngle = spec.flips * 360 * shankProgress;
      sy = spec.flips ? Math.cos(rad(shankAngle)) : 1;
      if (spec.yaw) {
        const c = Math.cos(rad(boardYawDeg(spec, 1, 1) * shankProgress));
        sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
      }
      if (spec.bodyYaw) {
        bodySX = signedSquash(Math.cos(rad(spec.bodyYaw * shankProgress)));
      }
      flipDeg = spec.flipDir * shankAngle;
      yawDeg = boardYawDeg(spec, 1, 1) * shankProgress;
      shuvDeg = (spec.spinDir || 1) * spec.yaw * shankProgress;
      forwardPitchDeg = spec.forwardFlip ? spec.dir * 180 * shankProgress : 0;
      bodyYawDeg = (spec.bodySpinDir || 1) * spec.bodyYaw * shankProgress;

      const slow = easeOutCubic(clamp01(u / 0.75));
      fx = 48 * slow;
      const compress = Math.sin(clamp01(u / 0.4) * Math.PI);
      fy = FALL_START_Y * (1 - slow) + FEET_PLANT_Y * slow + 7 * compress * (1 - settle);
      bodyRot = 12 * Math.sin(clamp01(u / 0.4) * Math.PI) * (1 - settle) + wobble(2.5, 5, 2);

      const vigor = Math.exp(-1.8 * u);
      const planted = 1 - vigor;
      const cycle = u * 8;
      const stride = 10 * vigor;
      footR = clampFootReach({
        x: 12 + planted * 3 + Math.sin(cycle) * stride,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - Math.max(0, Math.cos(cycle)) * 8 * vigor + planted * 2) * impact,
      });
      footL = clampFootReach({
        x: -10 - planted * 3 + Math.sin(cycle + Math.PI) * stride,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - Math.max(0, -Math.cos(cycle)) * 8 * vigor + planted * 2) * impact,
      });

      armFront = FLIGHT_ARM_F * (1 - impact)
        + (Math.sin(cycle) * 0.9 * vigor + 0.3 * planted) * impact;
      armBack = FLIGHT_ARM_B * (1 - impact)
        + (-Math.sin(cycle) * 0.9 * vigor - 0.2 * planted) * impact;
    } else {
      fx = 0;
      fy = FALL_START_Y;
    }
    bodyX = X0 + spec.dir * fx;
    bodyRot *= spec.dir;
    bodyFallY = fy;
  }

  if (!footL || !footR) {
    // Ride-away plant. Mirror the stance so nollie's front foot lands forward
    // on the nose and the back foot centers, matching the wind-up pose.
    if (spec.nollie) {
      footR = { x: 25, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -10, y: FOOT_Y - bodyYOffset - 4 };
    } else {
      footR = { x: 12, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -25, y: FOOT_Y - bodyYOffset - 4 };
    }
  }

  const bodyY = falling ? GROUND - LIFT + bodyFallY : boardY - LIFT + bodyYOffset;

  // Street distance: full speed during roll-in, flight, and ride-away;
  // decelerates during falls with the same impact→settle energy as the body
  // so the ground doesn't keep racing after the skater has already stopped.
  let streetDist = t;
  if (falling) {
    const u = t - ROLL_IN - FLIP_T;
    const FULL_SPEED_TIME = ROLL_IN + FLIP_T;
    const decayK =
      fall === 'slam' ? 2.4
        : fall === 'bail' ? 1.3
          : 1.9; // shank
    streetDist = FULL_SPEED_TIME + (1 - Math.exp(-decayK * u)) / decayK;
  }

  // Switch rides with the arms a touch more open: the front arm swings
  // further toward the nose, the back arm further toward the tail. Applied
  // after every phase so the crouch, flight, and landing all inherit it.
  if (spec.stance === 'switch') {
    armFront -= SWITCH_ARM_SPREAD;
    armBack += SWITCH_ARM_SPREAD;
  }

  return {
    t,
    board: { x: boardX, y: boardY, rot: boardRot, sx, sy, griptape: sy >= 0 },
    body: { x: bodyX, y: bodyY, sx: bodySX, rot: bodyRot },
    spin3d: { flipDeg, yawDeg, forwardPitchDeg, bodyYawDeg, ...(spec.counterShuv && { shuvDeg }) },
    motion: { flight: flightProgress, rotation: rotationProgress },
    footL,
    footR,
    armFront,
    armBack,
    streetDist,
  };
}

export {
  specFor,
  boardYawDeg,
  computeFrame,
  catchFraction,
  knee,
  clampFootReach,
  randomFallVariant,
  randomShankProgress,
  W,
  H,
  GROUND,
  X0,
  SKY_PAD,
  FOOT_Y,
  LIFT,
  JUMP,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  HOLD,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
};
export type { Frame, Spec, Pt };

/** Keep a body-local foot target inside the two-bone leg's reachable length.
 *  Fall poses that push past this make the shin stretch from a clamped knee to
 *  an unreachable ankle — the "limbs disconnect" look in the screenshots. */
function clampFootReach(foot: Pt): Pt {
  const maxDist = THIGH + SHIN - 0.5;
  const dist = Math.hypot(foot.x, foot.y);
  if (dist <= maxDist || dist < 1e-6) return foot;
  const s = maxDist / dist;
  return { x: foot.x * s, y: foot.y * s };
}

/** Two-bone IK: knee position for a hip-to-foot leg.
 *  Always returns the solution where the knee protrudes toward the front
 *  (+x) so both legs read as bending the same way in a skate stance.
 *  `bend` (default 1) picks the protrude side: +1 = board +x, -1 = board -x,
 *  and fades the artificial bend through a straight knee at 0 — so a spun
 *  body can bend knees the other way without ever crossing the hip-ankle
 *  line into a broken pose. Near full reach the artificial bend eases off so
 *  a pop snap can read as a straight leg instead of keeping the permanent
 *  KNEE_BEND_SCALE kink. */
function knee(foot: Pt, bend = 1): Pt {
  let { x: fx, y: fy } = clampFootReach(foot);
  const dist = Math.sqrt(fx * fx + fy * fy);
  const maxDist = THIGH + SHIN - 0.1;
  if (dist > maxDist) {
    const ratio = maxDist / dist;
    fx *= ratio;
    fy *= ratio;
  }
  const c = Math.min(Math.sqrt(fx * fx + fy * fy), THIGH + SHIN);
  const angleB = Math.acos((THIGH * THIGH + c * c - SHIN * SHIN) / (2 * THIGH * c)) || 0;
  const baseAngle = Math.atan2(fy, fx);
  const k1 = { x: THIGH * Math.cos(baseAngle - angleB), y: THIGH * Math.sin(baseAngle - angleB) };
  const k2 = { x: THIGH * Math.cos(baseAngle + angleB), y: THIGH * Math.sin(baseAngle + angleB) };
  const forward = k1.x >= k2.x ? k1 : k2;
  const backward = forward === k1 ? k2 : k1;
  const bent = bend >= 0 ? forward : backward;
  const straight = { x: fx / 2, y: fy / 2 };
  const reach = c / (THIGH + SHIN);
  const bendScale = KNEE_BEND_SCALE * (1 - Math.pow(reach, 6)) * Math.abs(bend);
  return {
    x: straight.x + (bent.x - straight.x) * bendScale,
    y: straight.y + (bent.y - straight.y) * bendScale,
  };
}
