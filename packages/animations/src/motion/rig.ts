import {
  STANCE_BODY_YAW,
  SWITCH_ARMS,
  upperBodyTurn,
  HIP_Z,
  SHOE_TOESIDE,
  ANKLE_LIFT,
  TOE_REACH,
  FOOT_OVER_SOLE,
  SHOE_HALF_HEIGHT,
  SHOE_HALF_LENGTH,
  SHOE_HALF_WIDTH,
  DECK_HALF_WIDTH,
  SHOULDER,
  UPPER_ARM,
  FOREARM,
  RIDE_HEIGHT,
  SQUAT_FLOOR,
  POP_HEIGHT,
  TOUCHDOWN_HEIGHT,
  KNEE_AIM_FRONT,
  KNEE_AIM_BACK,
  HIP_CENTER,
  CROUCH_START,
  PRE_WIND,
  LEAN_REST,
  LEAN_SQUAT,
  HIP_BACK,
  HEAD_STEADY,
  LOOK_DOWN_OLLIE,
  LEAN_IMPACT,
  HIP_BACK_IMPACT,
  LOOK_DOWN_IMPACT,
  HEAD_OFF_NECK,
  NECK_TOP,
  TORSO_ORIGIN,
  type Frame3,
  type LegRig,
  type ArmRig,
  type Rig,
  frameOf,
  moveFrame,
  solveLeg,
  cruiseBob,
  ARM_RIDE,
  ARM_LOAD,
  ARM_AIR,
  ARM_LAND,
  ARM_BRACE,
  mixPose,
  armDirs,
  FOOT_RAKE,
} from './skeleton';
import type { SkateStyle } from '../types';
import { CROUCH_HOLD, extendTime, extending, flightLegs, flightSpeeds, rideAway } from './dynamics';
import { flickExtension, orientTrickRotation, tailFirst, type RiderMechanics } from './stance';
import {
  FOOT_Y,
  boardGlued,
  boardRise,
  flightTime,
  popLeft,
  popTuck,
  LIFT,
  POP_RISE,
  ROLL_IN,
  boardYawDeg,
  clampFootReach,
  computeFrame,
  type FallVariant,
  type Frame,
  type Pt,
  type Spec,
} from './trick';
import { add3, clamp01, dot3, rad, rotX, rotY, rotZ, scale3, smoothstep, sub3, turnAbout, type V3 } from '../math';
import { legInBoard, soleClearance } from './boardClearance';
import { TIP_X, deckTopY } from '../board/deck';

/**
 * Physics frame → world-space skeleton.
 *
 * The board, the feet on it, and every rotation (flip, shuv, body spin,
 * flick) come straight from the shared computeFrame physics (rig.test.ts
 * pins that). The rider's *body* is solved here:
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
 *
 * The physics places the feet side-on, where the board is a line, so it
 * never makes room for the board's volume. Two things here do:
 *
 * - the board tucks the feet: each trick's flight is measured once against
 *   the board's real volume (boardClearance.ts), and each foot is picked up
 *   ahead of the moment a popped, rolling, or spinning board would pass
 *   through it, then set back down. The hips rise to give the legs that
 *   room, so a flip is ridden with the knees tucked up;
 * - an impossible's scooping foot holds the spot on the tail it popped from
 *   as the board comes round, its sole on the grip, carrying the board
 *   within the leg's reach, and lets go to come back for it at the catch.
 */

/** Fall rotation pivots near the feet, like the 2D body transform. */
const BODY_PIVOT_Y = FOOT_Y - 2;
/** Past the far rail, per unit of flick strength, the flicked shoe ends up. */
export const FLICK_STYLE_REACH = 4;
/** A kickflip drags the toe diagonally off the corner, so the flicking shoe
 *  turns toward its end of the board as it goes out. */
const FLICK_TOE_TURN = 34;
/** Shortest hip-to-ankle distance the tuck may reach. */
const LEG_CLEAR = 29;
/** Flight fraction where the feet start settling onto their touchdown spots. */
const CATCH_START = 0.86;
/** Seconds a fall takes to hand the hips over to the fall physics. */
const FALL_HANDOFF = 0.24;
/** Head nod (deg) toward the board while it's in the air. */
const LOOK_DOWN_TRICK = 16;

// ----- Board tuck -----

/** Seconds a foot starts lifting before the board needs the room, and takes
 *  to come back down after. */
const TUCK_LEAD = 0.12;
const TUCK_LAG = 0.1;
/** Room a tucked foot keeps from the board. */
export const TUCK_MARGIN = 0.4;
/** Overlap too slight to tuck for: a sole set down on the grip. */
export const TUCK_SLACK = 0.5;
/** Share of a foot's tuck past HIP_FOLLOW_FROM that the hips rise by, and
 *  the gentler lead and lag (s) they follow it with. */
const HIP_FOLLOW = 1;
const HIP_FOLLOW_FROM = 6;
/** The most (world units) the hips rise for a tuck. */
const HIP_FOLLOW_MAX = 16;
const HIP_LEAD = 0.2;
const HIP_LAG = 0.18;
/** Flight share from which a fall's tuck lets go before touchdown. */
const FALL_TUCK_FROM = 0.8;
/** Times each trick's tuck is posed again and checked. */
const TUCK_PASSES = 8;
/** Extra lift tried at a time for a foot whose shin or thigh is still in
 *  the board, and the most it gets before that's given up on. */
const LEG_STEP = 3;
const LEG_LIFT = 15;
/** Samples a trick's tuck is measured at, from the pop through touchdown. */
const TUCK_SAMPLES = 96;

/** How far (world units) a flip's flicking foot sets up out over its rail,
 *  and the seconds it shuffles there in, ahead of the pop. */
export const SETUP_HANG = 4.5;
export const SETUP_RAMP = 0.22;
const SETUP_FROM = 0.12;

/** 0 → 1: how far the flicking foot has set up for a flip at clock `t`. It
 *  shuffles out on the roll-in, holds through the flick, and is back over
 *  the bolts for the catch. */
function setupFor(t: number, flight: number): number {
  if (flight >= 1) return 0;
  const out = smoothstep((t - SETUP_FROM) / SETUP_RAMP);
  return flight < 0 ? out : out * (1 - smoothstep((flight - 0.45) / 0.35));
}

/** Share of the flight over which the feet go from where they stood to the
 *  physics' flight marks (it moves them between two frames). */
const TAKEOFF_END = 0.12;
/** A pop's pitch (deg) is the physics' up to POP_PITCH_KNEE, easing in to no
 *  more than POP_PITCH_MAX: as far as a tail strike tips a board with a foot
 *  riding the nose up (the physics' 60 comes out about 40). */
const POP_PITCH_KNEE = 25;
const POP_PITCH_MAX = 40;
/** How far over the board's middle (world units) the physics turns the feet
 *  it carries with the deck: its FOOT_Y - 6 stance against the hips' LIFT. */
const GLUED_PIVOT = LIFT - FOOT_Y + 6;
/** Share of the pop still to ease out when the feet start handing back to
 *  the physics: they stay on the deck while it's still steep. */
const RIDE_UNTIL = 0.35;
/** How far (deg) the board spins under the feet before they stop riding it. */
const RIDE_TURN = 50;

// ----- Impossible wrap -----

/** Share of an impossible's turn over which the scooping foot lets go of the
 *  end it has been following round, to come back for it at the catch. */
const WRAP_LET_GO = [0.85, 1] as const;
/** How far (world units) from the hip the scooping foot holds the board's
 *  end: the leg all but straight, its ankle a little over the sole. Past
 *  where it eases in, the board's free turn would carry that end away from
 *  the foot, so the foot carries it. */
const WRAP_REACH = 60;
const WRAP_REACH_EASE = 8;
/** How far (world units) the scooping foot drives the end it holds in under
 *  the rider (WRAP_SCOOP) and down (WRAP_SCOOP_DOWN) through the middle of
 *  the wrap, pulling it back for the catch: the scoop is forward and down. */
const WRAP_SCOOP = 8;
const WRAP_SCOOP_DOWN = 12;
/** How steeply (height per unit out) the grip falls away past the deck's
 *  rail, for a shoe set on it: a toe hanging off the rail isn't standing on
 *  the deck, and one just over it is on the rail's round. */
const DECK_EDGE_FALL = 4;

/** How firmly an impossible's scooping foot holds the end it popped: 1 off
 *  the pop, letting go to 0 over WRAP_LET_GO. */
function wrapHold(spec: Spec, f: Frame): number {
  if (!spec.wrap || f.motion.flight < 0 || f.motion.flight >= 1) return 0;
  return wrapLetGo(f.motion.rotation);
}

/** 1 → 0: how firmly the scooping foot holds on `rotation` (0 → 1) of the way round (WRAP_LET_GO). */
export const wrapLetGo = (rotation: number) => 1 - smoothstep((rotation - WRAP_LET_GO[0]) / (WRAP_LET_GO[1] - WRAP_LET_GO[0]));

/** How far the scooping foot has driven the end it holds `rotation` (0 → 1) of the way round: `forward`, in under the rider, and down (WRAP_SCOOP). */
export const wrapScoop = (rotation: number, forward: V3): V3 =>
  scale3(add3(scale3(forward, WRAP_SCOOP), { x: 0, y: WRAP_SCOOP_DOWN, z: 0 }), Math.sin(Math.PI * rotation) ** 2);

// ----- Hip trajectory -----

interface FlightArc {
  /** Hip height over the deck at pop and touchdown, and the mid-flight tuck. */
  pop: number;
  touchdown: number;
  tuck: number;
  /** Deepest hip height over the deck in the wind-up. */
  squat: number;
}

function flightArc(spec: Spec): FlightArc {
  const complexity = spec.flips * 0.5 + (spec.yaw / 180) * 0.3;
  const load = (22 + complexity * 8) * (spec.stance === 'nollie' ? 1.4 : 1);
  return {
    pop: POP_HEIGHT,
    touchdown: TOUCHDOWN_HEIGHT,
    // How far the arc sinks below a straight line at mid-flight: the trick's
    // knee tuck (trick.ts popTuck). It still gives way wherever the feet ride
    // higher (hipState).
    tuck: popTuck(spec),
    squat: Math.max(SQUAT_FLOOR + 5, RIDE_HEIGHT - load * 0.9),
  };
}

/** Smooth max: exact once a and b are more than k apart. */
function smoothMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

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
function hipState(f: Frame, spec: Spec, style: SkateStyle, clearance: number, jumpUp = 0): HipState {
  const arc = flightArc(spec);
  const t = f.t;
  const tau = t - ROLL_IN;
  // Hip height = deck height + hips over the deck. Both are parabolas in the
  // flight clock (the deck's is the physics' pop arc), so the hips fly a true
  // ballistic arc; these are its vertical speeds at takeoff and touchdown.
  const flight = flightTime(style);
  const { takeoff: takeoffSpeed, touchdown: touchdownSpeed } = flightSpeeds(4 * boardRise(spec, style), arc.pop, arc.touchdown, arc.tuck, flight);

  if (tau < 0) {
    // Load, then explode: the extension is timed so the hips leave the
    // crouch at rest and reach the pop moving at the takeoff speed.
    const extendT = extendTime(arc.pop - arc.squat, takeoffSpeed);
    const bottomT = ROLL_IN - extendT;
    if (t < bottomT) {
      const c = smoothstep((t - CROUCH_START) / (bottomT - CROUCH_HOLD - CROUCH_START));
      return {
        overDeck: RIDE_HEIGHT + cruiseBob(t) * (1 - c) + (arc.squat - RIDE_HEIGHT) * c,
        load: c,
        air: 0,
        sinceTouchdown: -1,
      };
    }
    return { ...extending(arc.squat, arc.pop, takeoffSpeed, extendT, (t - bottomT) / extendT), air: 0, sinceTouchdown: -1 };
  }

  if (tau < flight) {
    const s = tau / flight;
    return {
      overDeck: smoothMax(flightLegs(arc.pop, arc.touchdown, arc.tuck, s) + jumpUp, clearance, 6),
      load: 0,
      air: smoothstep(tau / 0.16),
      sinceTouchdown: -1,
    };
  }

  // Touchdown: a damped spring from the arriving height and speed back up to
  // the cruising stance.
  const u = tau - flight;
  return { ...rideAway(t, u, arc.touchdown, touchdownSpeed), load: 0, sinceTouchdown: u };
}

/** Soft cap: `x` unchanged up to `knee`, easing in toward `max` past it. */
function softCap(x: number, knee: number, max: number): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  return Math.sign(x) * (knee + (max - knee) * Math.tanh((a - knee) / (max - knee)));
}

/**
 * The board's pitch in the air. The physics snaps a pop from flat to its
 * full angle between two frames; here the tail strike tips it up over the
 * first POP_RISE seconds instead, and no further than POP_PITCH_MAX.
 */
function popPitch(f: Frame): number {
  if (f.motion.flight < 0 || f.motion.flight >= 1) return f.board.rot;
  const pitch = softCap(f.board.rot, POP_PITCH_KNEE, POP_PITCH_MAX);
  return pitch * smoothstep((f.t - ROLL_IN) / POP_RISE);
}

type Outcome = 'landed' | FallVariant;
/** How far each foot (left, right) is lifted, along its sole's up, off the
 *  physics' placement. */
export type Tuck = readonly [number, number];

/** The rider at frame `f`; `impact` (0 → 1) is how hard a drop's landing is hitting them now (stage/downhill.ts). */
export function solveRig(
  f: Frame,
  spec: Spec,
  mechanics: RiderMechanics,
  skateStyle: SkateStyle,
  outcome: Outcome = 'landed',
  impact = 0,
): Rig {
  const track = tuckTrack(spec, mechanics, skateStyle, outcome);
  const nose = mechanics.noseFoot === 'left';
  // A fall comes down onto the board however it lies: the feet don't wait
  // for it, and the hips meet the ground where the fall physics has them.
  const down = outcome === 'landed' ? 1 : 1 - smoothstep((f.motion.flight - FALL_TUCK_FROM) / (1 - FALL_TUCK_FROM));
  const [a, b] = tuckAt(track, f.t);
  const tuck: Tuck = nose ? [a * down, b * down] : [b * down, a * down];
  // A foot the board picks up high takes the hips up with it: the rider
  // jumps higher rather than folding the leg flat. The body moves slower
  // than a foot, so the hips follow a gentler version of the tuck.
  const [ha, hb] = tuckAt(track, f.t, HIP_LEAD, HIP_LAG);
  const jumpUp = softCap(HIP_FOLLOW * Math.max(0, Math.max(ha, hb) * down - HIP_FOLLOW_FROM), HIP_FOLLOW_MAX / 2, HIP_FOLLOW_MAX);
  return poseRig(f, spec, mechanics, skateStyle, outcome, tuck, jumpUp, impact);
}

// ----- Board tuck -----

export interface TuckTrack {
  times: number[];
  /** Per foot: how far it must lift to clear the board at each time. */
  need: [number[], number[]];
  /** Per time, if set: the window (from, to) the feet may be off the deck in
   *  for it. The lift eases in and back down inside it, quicker if it must. */
  within?: ReadonlyArray<readonly [number, number]>;
}

const TUCK_TRACKS = new Map<string, TuckTrack>();

/**
 * Measure where the board passes through each foot of the rider posed at
 * `times` (`pose(k, tuck)`: the rider at times[k], each foot, left and right,
 * lifted by `tuck`), and how far that foot must lift to clear it.
 *
 * Lifting a foot ahead of one moment can carry it into the board at another
 * (a rolling, pitched deck has parts above the foot too), and a shoe can
 * clear the board with its shin or thigh still across a rail. So each
 * moment is posed again with the tuck it actually gets, and wherever the
 * shoe is still in the board, or the leg is, that foot lifts further. Extra
 * lift for a leg that never comes clear is dropped: it would only look
 * worse. A foot may stand `allowed[i][k]` into the board at times[k] (a
 * sole resting on a kick).
 */
export function measureTuck(
  times: number[],
  pose: (k: number, tuck: Tuck) => Rig,
  within?: TuckTrack['within'],
  allowed?: [number[], number[]],
): TuckTrack {
  const track: TuckTrack = { times, need: [times.map(() => 0), times.map(() => 0)], within };
  const legExtra = times.map(() => [0, 0]);
  const legStuck = times.map(() => [false, false]);
  // Moments to check: all of them, then only those near a change.
  let check = times.map(() => true);
  for (let pass = 0; pass < TUCK_PASSES && check.some(Boolean); pass++) {
    const changed = times.map(() => false);
    times.forEach((t, k) => {
      if (!check[k]) return;
      const tuck = tuckAt(track, t);
      const rig = pose(k, tuck);
      rig.legs.forEach((leg, i) => {
        const rests = allowed?.[i][k] ?? 0;
        const left = soleClearance(rig.board, leg.shoe, leg.shoe.up) - rests;
        legStuck[k][i] = left <= TUCK_SLACK && !rests && legInBoard(rig.board, leg);
        const more = left > TUCK_SLACK ? left + TUCK_MARGIN : legStuck[k][i] && legExtra[k][i] < LEG_LIFT ? LEG_STEP : 0;
        if (!more) return;
        if (left <= TUCK_SLACK) legExtra[k][i] += more;
        track.need[i][k] = tuck[i] + more;
        changed[k] = true;
      });
    });
    check = times.map((t) => times.some((u, j) => changed[j] && u - t < TUCK_LEAD && t - u < TUCK_LAG));
  }
  legStuck.forEach((stuck, k) => stuck.forEach((s, i) => { if (s) track.need[i][k] -= legExtra[k][i]; }));
  return track;
}

/**
 * Measure, once per trick, where the flight would put the board through
 * each foot (measureTuck).
 */
function tuckTrack(spec: Spec, mechanics: RiderMechanics, style: SkateStyle, outcome: Outcome): TuckTrack {
  // Regular and goofy are mirror images, and a slam or bail flies the same
  // flight as a landing: one track serves them all, kept by foot role (nose,
  // tail) rather than by anatomical side.
  const roles = { pop: mechanics.popFoot === mechanics.noseFoot, flick: mechanics.flickFoot === mechanics.noseFoot };
  const key = JSON.stringify([spec, roles, style.popHeight, style.rotationSpeed, style.flickStrength, outcome === 'shank']);
  const known = TUCK_TRACKS.get(key);
  if (known) return known;
  const landed = outcome === 'landed';
  const times: number[] = [];
  const frames: Frame[] = [];
  for (let k = 0; k <= TUCK_SAMPLES; k++) {
    const t = ROLL_IN + (flightTime(style) * k) / TUCK_SAMPLES;
    times.push(t);
    frames.push(computeFrame(t, spec, landed, landed ? 'slam' : outcome, 0.65, style));
  }
  // An impossible's scooping foot stays down on the board while it holds it
  // (poseRig keeps its sole on the grip): only the free foot clears it.
  const holding = frames.map((f) => (wrapHold(spec, f) > 0.5 ? Infinity : 0));
  const loose = frames.map(() => 0);
  const track = measureTuck(
    times,
    (k, tuck) => poseRig(frames[k], spec, mechanics, style, landed ? 'landed' : outcome, tuck),
    undefined,
    spec.wrap ? (mechanics.popFoot === 'left' ? [holding, loose] : [loose, holding]) : undefined,
  );
  // Store nose foot first.
  if (mechanics.noseFoot !== 'left') track.need.reverse();
  if (TUCK_TRACKS.size >= 512) TUCK_TRACKS.clear();
  TUCK_TRACKS.set(key, track);
  return track;
}

/** How far the board lifts each foot (left, right) at clock time `t`. */
export function boardTuck(spec: Spec, mechanics: RiderMechanics, style: SkateStyle, outcome: Outcome, t: number): Tuck {
  const [nose, tail] = tuckAt(tuckTrack(spec, mechanics, style, outcome), t);
  return mechanics.noseFoot === 'left' ? [nose, tail] : [tail, nose];
}

/** Each foot's lift at `t`: up `lead` seconds ahead of every moment it
 *  needs the room, and back down over `lag` after, eased so it never jumps. */
export function tuckAt(track: TuckTrack, t: number, lead = TUCK_LEAD, lag = TUCK_LAG): Tuck {
  const lift = (need: number[]) => {
    let best = 0;
    for (let k = 0; k < need.length; k++) {
      if (need[k] <= best) continue;
      const ahead = track.times[k] - t;
      const window = track.within?.[k];
      if (window && (t < window[0] || t > window[1])) continue;
      const before = window ? Math.min(lead, track.times[k] - window[0]) : lead;
      const after = window ? Math.min(lag, window[1] - track.times[k]) : lag;
      const ease = ahead === 0 ? 1 : ahead > 0 ? 1 - smoothstep(ahead / before) : 1 - smoothstep(-ahead / after);
      best = Math.max(best, need[k] * ease);
    }
    return best;
  };
  return [lift(track.need[0]), lift(track.need[1])];
}

/** The whole flip and shuv a trick turns the deck through, as `mechanics` rides it. */
const doneTurn = (spec: Spec, mechanics: RiderMechanics) => orientTrickRotation(mechanics, {
  flipDeg: spec.flipDir * spec.flips * 360,
  yawDeg: (spec.spinDir || 1) * spec.yaw,
  bodyYawDeg: 0,
});

/**
 * A tilted trick's spin axis (see tiltFor): leaned `tilt` off vertical
 * toward the pitch axis, the way that lifts the end the pop leaves in the
 * air. A grind's impossible turns about it too (grindTricks.ts).
 */
export function tiltAxis(spec: Spec, mechanics: RiderMechanics): V3 {
  // A tail pop raises the nose: rotZ's negative sense. A nose pop the tail.
  const lift = spec.nollie ? 1 : -1;
  const lean = Math.sign(doneTurn(spec, mechanics).yawDeg) * lift;
  return { x: 0, y: Math.cos(rad(spec.tilt)), z: lean * Math.sin(rad(spec.tilt)) };
}

/** A tilted trick's spin axis, and the share of its flick the deck rolls. */
interface Tilt {
  axis: V3;
  rollShare: number;
}

/**
 * Where a hardflip's board turns (see Spec.tilt). The shuv is a turn about
 * an axis leaned `tilt` off vertical toward the pitch axis, the way that
 * lifts the end the pop leaves in the air, so the nose (the tail, off a
 * nollie) rises on end as the deck comes round.
 *
 * Leaning the axis costs the deck some roll. Half a turn about it ends with
 * the deck rolled 2·tilt (two half turns about axes `tilt` apart are one
 * turn of 2·tilt about the axis square to both: the long axis), so the flick
 * rolls it the rest of the way, the nearest roll to a whole flip that lands
 * it upright. A whole turn about any axis comes back round, and the deck
 * rolls its whole flip.
 *
 * Once the shuv is round (`yawDeg`, the turn so far) the deck is simply
 * turned, exactly as a flat spin leaves it: the pop's pitch has faded by
 * then. From there it pitches about its own width like any other, as it
 * lands or skids away from a fall, so it takes the plain turn (null).
 */
function tiltFor(spec: Spec, mechanics: RiderMechanics, yawDeg: number): Tilt | null {
  if (!spec.tilt) return null;
  const done = doneTurn(spec, mechanics);
  if (Math.abs(yawDeg) >= Math.abs(done.yawDeg)) return null;
  const axis = tiltAxis(spec, mechanics);
  const lean = Math.sign(axis.z);
  const rolled = Math.round(Math.abs(done.yawDeg) / 180) % 2 ? 2 * spec.tilt * lean : 0;
  const roll = rolled + 360 * Math.round((done.flipDeg - rolled) / 360);
  return { axis, rollShare: done.flipDeg ? roll / done.flipDeg : 1 };
}

function poseRig(
  f: Frame,
  spec: Spec,
  mechanics: RiderMechanics,
  skateStyle: SkateStyle,
  outcome: Outcome,
  tuck: Tuck,
  jumpUp = 0,
  impact = 0,
): Rig {
  const landed = outcome === 'landed';
  // Slams and bails come down with the trick's rotation complete, but the
  // shared fall physics reports them unrotated, which would snap a spun body
  // back to its starting facing on touchdown. Hold the completed rotation.
  // (Shanks already freeze theirs part-way.)
  const heldSpin = !landed && outcome !== 'shank' && f.motion.flight >= 1;
  const spin: Frame['spin3d'] = heldSpin
    ? {
        flipDeg: spec.flipDir * spec.flips * 360,
        yawDeg: boardYawDeg(spec, 1, 1),
        forwardPitchDeg: spec.forwardFlip ? spec.dir * 180 : 0,
        bodyYawDeg: (spec.bodySpinDir || 1) * spec.bodyYaw,
        ...(spec.counterShuv && { shuvDeg: (spec.spinDir || 1) * spec.yaw }),
      }
    : f.spin3d;
  const oriented = orientTrickRotation(mechanics, spin);
  const toeDir = mechanics.orientationSign;
  const restingBodyYaw = -STANCE_BODY_YAW * toeDir;
  const bodyYawDeg = oriented.bodyYawDeg + restingBodyYaw;
  // The shoulders and head sit the way the board is rolling: over the back
  // shoulder rolling fakie, squarer riding switch. A half spin carries them
  // round from the way the rider rolled in to the way they roll away, so an
  // open 180 keeps the eyes on the landing and a blind one comes round to it.
  const rolling = tailFirst(spec.dir === -1 ? 1 : 0, spec.bodyYaw, Math.abs(spin.bodyYawDeg));
  const turn = upperBodyTurn(spec.stance === 'switch', rolling);
  const chestYaw = -turn.chest * toeDir;
  // Blend the head's look out as the body folds in a fall, so the head stays
  // on the neck.
  const uprightP = clamp01(1 - Math.abs(f.body.rot) / 55);
  const headYawDeg = oriented.bodyYawDeg - turn.head * toeDir * uprightP + chestYaw * (1 - uprightP);

  const flipDeg = oriented.flipDeg;
  const spinP = f.motion.rotation;
  const flight = f.motion.flight;
  const airborne = flight >= 0 && flight < 1;
  const boardPitch = popPitch(f);
  // A forward flip's nose dips through the middle of the flip, once the pop's own pitch has let go.
  const pitchDeg = boardPitch + (spec.forwardFlip ? Math.sin(spinP * Math.PI) ** 2 * 42 : 0);
  const yawDeg = oriented.yawDeg;
  // The board's own shuv: all of its turn, but for a counter shuv's.
  const shuvDeg = spin.shuvDeg === undefined
    ? yawDeg
    : orientTrickRotation(mechanics, { flipDeg: 0, yawDeg: spin.shuvDeg, bodyYawDeg: 0, shuvDeg: spin.shuvDeg }).yawDeg;
  const center: V3 = { x: f.board.x, y: f.board.y, z: 0 };
  // The feet stand on the board through the tail strike and ride its pitch
  // about the board's middle as the front foot levels it (trick.ts popLeft).
  // They hand back to the physics once it's nearly level, and as soon as the
  // board spins away under them in a shuv. (A flip's front foot slides up the
  // deck as it flicks, so a roll doesn't stop the ride.)
  const underFeet = (deg: number) => 1 - smoothstep(Math.abs(deg) / RIDE_TURN);
  const riding = !airborne ? 0
    : smoothstep(popLeft(spec, flight, flightTime(skateStyle)) / RIDE_UNTIL) * underFeet(yawDeg - oriented.bodyYawDeg);

  // ----- Board -----
  const tilt = tiltFor(spec, mechanics, shuvDeg);
  const boardDir = tilt
    ? (local: V3) => rotY(turnAbout(rotZ(rotX(local, flipDeg * tilt.rollShare), pitchDeg), tilt.axis, shuvDeg), yawDeg - shuvDeg)
    : (local: V3) => rotY(rotZ(rotX(local, flipDeg), pitchDeg), yawDeg);
  // Where the feet stood on the board before the pop.
  const stand = computeFrame(ROLL_IN - 1e-4, spec, landed, landed ? 'slam' : outcome, 0.65, skateStyle);
  const popAtNose = mechanics.popFoot === mechanics.noseFoot;
  // An impossible's scooping foot holds the spot it popped from as the
  // board comes round, until it lets go (WRAP_LET_GO). The board turns as a
  // tilted shuv does, but about that spot; where the leg can't reach where
  // that takes it, the foot keeps hold of it, carrying the board with it.
  const wrapping = wrapHold(spec, f);
  const popSpot = popAtNose ? stand.footR : stand.footL;
  const wrapSpot: V3 = { x: popSpot.x + stand.body.x - stand.board.x, y: popSpot.y + stand.body.y - stand.board.y, z: toeDir * SHOE_TOESIDE };
  // It turns about that spot under the sole, not about its own middle: the
  // end stays under the foot and the rest of the deck swings round the leg.
  const pivot: V3 = { x: wrapSpot.x, y: 0, z: wrapSpot.z };
  const unspun = (local: V3) => rotY(rotZ(rotX(local, flipDeg * (tilt?.rollShare ?? 1)), pitchDeg), yawDeg - shuvDeg);
  // The foot scoops it in toward the board's middle, under the rider.
  const scoop = wrapScoop(spinP, unspun({ x: -Math.sign(pivot.x), y: 0, z: 0 }));
  const swung: V3 = spec.wrap && tilt ? add3(sub3(unspun(pivot), boardDir(pivot)), scoop) : { x: 0, y: 0, z: 0 };
  let held: V3 = { x: 0, y: 0, z: 0 };
  if (wrapping > 0) {
    const spot = add3(add3(center, swung), boardDir(wrapSpot));
    const hipLocal: V3 = { x: 0, y: 0, z: mechanics.popFoot === 'left' ? -HIP_Z : HIP_Z };
    const hipAt = add3({ x: f.body.x, y: f.board.y - hipState(f, spec, skateStyle, 0, jumpUp).overDeck, z: 0 }, rotY(hipLocal, bodyYawDeg));
    const out = sub3(spot, hipAt);
    const len = Math.hypot(out.x, out.y, out.z);
    // Taken up as the tail strike tips the board up (popPitch), not snapped to off the ground.
    const taken = smoothstep((f.t - ROLL_IN) / POP_RISE);
    held = scale3(out, (softCap(len, WRAP_REACH - WRAP_REACH_EASE, WRAP_REACH) / len - 1) * wrapping * taken);
  }
  const boardPoint = (local: V3): V3 => add3(add3(add3(center, swung), held), boardDir(local));
  // The scooping shoe, holding the board: set on the grip, its lowest point
  // over the deck touching it.
  const onGrip = (shoe: Frame3, ankle: V3): { shoe: Frame3; ankle: V3 } => {
    const grip = boardDir({ x: 0, y: -1, z: 0 });
    const origin = boardPoint({ x: 0, y: 0, z: 0 });
    const axes = [boardDir({ x: 1, y: 0, z: 0 }), boardDir({ x: 0, y: 1, z: 0 }), boardDir({ x: 0, y: 0, z: 1 })];
    let over = Infinity;
    for (const along of [-SHOE_HALF_LENGTH, 0, SHOE_HALF_LENGTH]) {
      for (const across of [-SHOE_HALF_WIDTH, 0, SHOE_HALF_WIDTH]) {
        const p = sub3(shoe.at(along, -SHOE_HALF_HEIGHT, across), origin);
        const [x, y, z] = axes.map((a) => dot3(p, a));
        over = Math.min(over, deckTopY(x) - y + (Math.max(0, Math.abs(z) - DECK_HALF_WIDTH) + Math.max(0, Math.abs(x) - TIP_X)) * DECK_EDGE_FALL);
      }
    }
    // Out of the deck while it holds on, easing off as it lets go for the
    // tuck to take over; down onto it as firmly as it holds.
    const by = scale3(grip, -over * (over < 0 ? smoothstep(wrapping) : wrapping));
    return { shoe: moveFrame(shoe, by), ankle: add3(ankle, by) };
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
  const toBoard = (w: V3) => {
    const q = rotY(sub3(w, feetAnchor), -bodyYawDeg);
    const r = rotZ({ x: q.x, y: q.y - BODY_PIVOT_Y, z: q.z }, -f.body.rot);
    return rotY({ x: r.x, y: r.y + BODY_PIVOT_Y, z: r.z }, restingBodyYaw);
  };

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
  const turnPt = (p: Pt, about: Pt, deg: number): Pt => {
    const q = rotZ({ x: p.x - about.x, y: p.y - about.y, z: 0 }, deg);
    return { x: about.x + q.x, y: about.y + q.y };
  };
  const deckMid: Pt = { x: f.board.x - f.body.x, y: f.board.y - f.body.y };
  // Ollies and late shuvits: the physics carries the feet with the deck,
  // turned by its pitch about a point GLUED_PIVOT over the board's middle.
  // Set them flat for the easing below, then turn them back.
  const carried = (boardGlued(spec) || (spec.late && !spec.flips)) && airborne;
  const glue: Pt = { x: deckMid.x, y: deckMid.y - GLUED_PIVOT };
  if (carried) {
    footR = turnPt(footR, glue, -f.board.rot);
    footL = turnPt(footL, glue, -f.board.rot);
  }
  // `toward` takes a foot `k` of the way to where it stands on the board, in
  // another frame of the physics, relative to the deck.
  const toward = (now: Pt, other: Frame, then: Pt, k: number): Pt => ({
    x: now.x + (other.body.x + then.x - other.board.x - (f.body.x + now.x - f.board.x)) * k,
    y: now.y + (other.body.y + then.y - other.board.y - (f.body.y + now.y - f.board.y)) * k,
  });
  // Takeoff: the physics moves the feet from where they stood to their
  // flight marks between two frames. They leave from where they stood.
  const takeoffK = airborne ? 1 - smoothstep(flight / TAKEOFF_END) : 0;
  if (takeoffK > 0) {
    footR = toward(footR, stand, stand.footR, takeoffK);
    footL = toward(footL, stand, stand.footL, takeoffK);
  }
  const catchK = airborne ? smoothstep((flight - CATCH_START) / (1 - CATCH_START)) : 0;
  if (catchK > 0) {
    const touch = computeFrame(ROLL_IN + flightTime(skateStyle) + 1e-4, spec, landed, landed ? 'slam' : outcome, 0.65, skateStyle);
    footR = toward(footR, touch, touch.footR, catchK);
    footL = toward(footL, touch, touch.footL, catchK);
  }
  // Of a flip's or shuv's feet only the popping foot rides, pressing its end
  // down; the foot over the rising end is lifted clear by the tuck instead.
  // (Carried up and in along the rising end, the leg folds past where the
  // knee can follow.)
  const onDeck = (p: Pt, popping: boolean): Pt => {
    const physics = carried ? turnPt(p, glue, f.board.rot) : p;
    if (!riding || !(carried || popping)) return physics;
    const ridden = turnPt(p, deckMid, boardPitch);
    return { x: physics.x + (ridden.x - physics.x) * riding, y: physics.y + (ridden.y - physics.y) * riding };
  };
  footR = onDeck(footR, popAtNose);
  footL = onDeck(footL, !popAtNose);
  const noseChannel = clampFootReach(footR);
  const tailChannel = clampFootReach(footL);

  const footPlan = (side: 'left' | 'right') => {
    const isNose = mechanics.noseFoot === side;
    const flicking = mechanics.flickFoot === side;
    // Shoe-local x runs heel → toe across the deck toward toeside, raked
    // toward the nose; shoe-local z runs along the board.
    const toeAt = (rake: number) => rotY({ x: 0, y: 0, z: toeDir }, toeDir * rake);
    const restRake = isNose ? FOOT_RAKE.nose : FOOT_RAKE.tail;
    // The ankle's lane across the deck that centers its shoe at SHOE_TOESIDE.
    // Setting up a flip, the flicking foot shuffles out before the pop: the
    // heel hangs off the heelside for a kickflip, the toes off the toeside
    // for a heelflip.
    const setup = flicking && spec.flipDir ? flickDir * SETUP_HANG * setupFor(f.t, flight) : 0;
    const restLane = toeDir * SHOE_TOESIDE - toeAt(restRake).z * TOE_REACH + setup;
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
    let laneZ = restLane + flick;
    let foot = isNose ? noseChannel : tailChannel;
    // An impossible's scooping foot stands on the spot it popped from while
    // it holds it, then comes back for the board at the catch.
    if (wrapping > 0 && mechanics.popFoot === side) {
      const ridden = toBoard(boardPoint(wrapSpot));
      foot = { x: foot.x + (ridden.x - foot.x) * wrapping, y: foot.y + (ridden.y - foot.y) * wrapping };
      laneZ += (ridden.z - wrapSpot.z) * wrapping;
    }
    const rake = restRake + fullTurn * flickOut;
    const toe = toeAt(rake);
    const down: V3 = { x: 0, y: 1, z: 0 };
    const along = rotY({ x: 1, y: 0, z: 0 }, toeDir * rake);
    const ankle: V3 = { x: foot.x, y: foot.y - ANKLE_LIFT, z: laneZ };
    // The ankle sits over the heel end, so the shoe reaches forward from it.
    const shoeCenter: V3 = {
      x: foot.x + toe.x * TOE_REACH,
      y: foot.y + FOOT_OVER_SOLE - SHOE_HALF_HEIGHT,
      z: laneZ + toe.z * TOE_REACH,
    };
    const placed = frameOf(fromBoard(shoeCenter), (d) => sub3(
      fromBoard(add3(shoeCenter, add3(add3(scale3(toe, d.x), scale3(down, d.y)), scale3(along, d.z)))),
      fromBoard(shoeCenter),
    ));
    const held = wrapping > 0 && mechanics.popFoot === side
      ? onGrip(placed, fromBoard(ankle))
      : { shoe: placed, ankle: fromBoard(ankle) };
    // The board's tuck lifts the whole foot clear.
    const by = scale3(held.shoe.up, tuck[side === 'left' ? 0 : 1]);
    const hipLocal: V3 = { x: 0, y: 0, z: side === 'left' ? -HIP_Z : HIP_Z };
    return { side, isNose, flicking, shoe: moveFrame(held.shoe, by), hipLocal, ankle: add3(held.ankle, by) };
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
  const hip = hipState(f, spec, skateStyle, clearance, jumpUp);
  // A fall hands the hips back to the fall physics (fold, stumble) once the
  // touchdown spring has taken the impact.
  const fallBlend = !landed && hip.sinceTouchdown >= 0 ? smoothstep(hip.sinceTouchdown / FALL_HANDOFF) : 0;
  const hipY = (f.board.y - hip.overDeck) * (1 - fallBlend) + f.body.y * fallBlend;
  const posture = 1 - fallBlend;
  const squat = clamp01((RIDE_HEIGHT - hip.overDeck) / (RIDE_HEIGHT - SQUAT_FLOOR));
  // A drop's hard landing (`impact`, 0 → 1) folds the rider past the squat:
  // chest further over the knees, hips further back to keep the weight over
  // the feet.
  const leanDeg = (LEAN_REST + LEAN_SQUAT * squat + LEAN_IMPACT * impact) * posture;
  const hipShift = add3(
    scale3(centerOffset, posture),
    boardSpaceDir({ x: 0, y: 0, z: -toeDir * HIP_BACK * (squat + HIP_BACK_IMPACT * impact) * posture }),
  );
  const anchor: V3 = add3({ x: f.body.x, y: hipY, z: 0 }, hipShift);

  // Upper body: rest/torso yaw, then a hinge over the toes about the board's
  // long axis, then the trick's body spin.
  const leanX = -toeDir * leanDeg;
  const upperDir = (d: V3, relYaw: number) =>
    rotY(rotX(rotY(d, restingBodyYaw + relYaw), leanX), oriented.bodyYawDeg);
  // Before a body spin the shoulders wind up against it through the crouch
  // and release into it off the pop; the head keeps looking ahead. A counter
  // shuv's turn eases in, so it winds up as its trick does.
  const spinWay = spec.counterShuv ? 0 : Math.sign(orientTrickRotation(mechanics, {
    flipDeg: 0, yawDeg: 0, bodyYawDeg: (spec.bodySpinDir || 1) * spec.bodyYaw,
  }).bodyYawDeg);
  const torsoRelYaw = chestYaw - restingBodyYaw - spinWay * PRE_WIND * hip.load;
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
    // An impossible's scooping leg sweeps its foot forward and round with
    // the board: its knee leans softly rather than flipping sides.
    const solved = solveLeg(hipJoint, plan.ankle, pole, plan.shoe.up, spec.wrap && mechanics.popFoot === plan.side);
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
  const guarded = spec.stance === 'switch' ? 1 - hip.air : 0;
  const arm = (side: 'left' | 'right'): ArmRig => {
    const front = mechanics.frontArm === side;
    const role = front ? 'front' : 'back';
    const sideZ = side === 'left' ? -1 : 1;
    const sway = (front ? f.armFront : f.armBack) * 12 * (1 - hip.air) * (1 - hip.load);
    let pose = mixPose(ARM_RIDE[role], ARM_LOAD[role], hip.load);
    pose = mixPose(pose, ARM_AIR[role], hip.air);
    pose = mixPose(pose, ARM_LAND[role], press);
    pose = mixPose(pose, ARM_BRACE[role], impact);
    pose = {
      out: pose.out + awkward * 10 * hip.air + SWITCH_ARMS.out * guarded,
      swing: pose.swing + sway,
      elbow: pose.elbow + awkward * 8 * hip.air + SWITCH_ARMS.elbow * guarded,
    };
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
  const lookDown = (spec.flips || spec.yaw ? LOOK_DOWN_TRICK : LOOK_DOWN_OLLIE) * hip.air + LOOK_DOWN_IMPACT * impact;
  const headLean = leanX * (1 - HEAD_STEADY);
  const headRelYaw = headYawDeg - oriented.bodyYawDeg - restingBodyYaw;
  const headDir = (d: V3) =>
    rotY(rotX(rotY(rotZ(rotZ(d, lookDown * posture), f.body.rot), restingBodyYaw + headRelYaw), headLean), oriented.bodyYawDeg);
  const neckTop = torsoPoint(NECK_TOP);
  const headOrigin = add3(neckTop, headDir(HEAD_OFF_NECK));

  return {
    board: { center: boardPoint({ x: 0, y: 0, z: 0 }), point: boardPoint, dir: boardDir, flipDeg, yawDeg, pitchDeg },
    legs: [leg(plans[0]), leg(plans[1])],
    arms: [arm('left'), arm('right')],
    torso: frameOf(torsoPoint(TORSO_ORIGIN), torsoDir),
    head: frameOf(headOrigin, headDir),
    toeDir,
    flickZ,
    flickOut,
    bodyYawDeg,
    headYawDeg,
    hipOverDeck: hip.overDeck,
  };
}
