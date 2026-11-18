import { add3, bisect, cross3, dot3, norm3, scale3, smoothstep, sub3, type V3 } from '../../math';
import type { Expression } from '../../riders/look';
import { capsuleIntersectsBoard, shoeIntersectsBoard } from '../../board/boardCollision';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, armDirs, type ArmPose, type BoardRig, type Rig } from '../skeleton';
import { LIMB_RADII, SOLE_GRACE, ankleOf, poseOf, rigOf, twoBone, type BodyDims, type BodyPose, type ShoePose } from './body';
import { boardAt, boardRigOf, simulateBoard, type BoardMotion, type BoardTrack } from './boardBody';
import { REACH, UP, level, rightOf, turnLevel } from './footing';
import { blendAt, blended, hermite3, minJerk, type Blend } from './kickOut';
import { trunkInGround } from './rollOut';
import { frameFrom, qaxis, qbasis, qconj, qframe, qlog, qmul, qnorm, qrot, qslerp, type Quat } from './rotation';

/**
 * The slip back: the trick comes round and the board is under the feet, but
 * the rider comes down with their weight behind it, over the back leg and
 * past it. The wheels roll freely, so the ground can only push straight up
 * through the feet: ahead of the body's middle, that push turns the body
 * over backward and sends the feet, and the board under them, out ahead. The
 * board shoots off down the street, the rider sits down where they were
 * going to stand, catches the lean on their hands, and slides to a stop on
 * the seat of their trousers.
 *
 * Up to the takeover the attempt is the landed trick's. From it, coming
 * down, the hips drift back off the board and the body leans back with them
 * (the board lands where the landed trick puts it). From the touchdown the
 * body is its own:
 *
 * - Its fall is the landing's: the hips come down as fast as the drop had
 *   them and the legs brake it, folding into a squat over the heels, as
 *   they would riding away; a big drop folds them at once. They hold the
 *   rider there, on the board, only while it's under the feet. Once it's
 *   gone the seat drops the rest of the way to the ground.
 * - Its lean is a body pitching about its own middle under that push ahead
 *   of it: the harder the legs are braking the fall, the faster it goes
 *   over, and the further over it is the longer the push's arm. The hands,
 *   reaching back, stop it short of lying down.
 * - The board is carried ahead by the feet as fast as the lean swings them,
 *   until they can't follow it; then it's a board on its own (boardBody.ts),
 *   rolling away, and the feet come down onto the ground past where it was.
 * - Sat down, the rider slides: what's left of their speed against the
 *   ground's grip on them, and any slope under them, till they stop.
 *
 * Positions are the street's, as the kick-out's are (kickOut.ts).
 */

/** Seconds before the touchdown the rider's own motion takes over: the weight goes back coming down. */
export const SLIP_BACK_LEAD = 0.2;
/** How far behind where the landed trick has them the hips are at the touchdown (in legs), and how far back the body's leant by then (degrees). */
const BACK = 0.2;
const LEAN_IN = 14;
/** The lean the hands catch (degrees back off upright), and the one the rider sits up to once they've stopped. */
const LEAN_CAUGHT = 46;
const LEAN_SAT = 24;
/** How much of the trunk's lean the pelvis has: sat down, the back rounds. */
const PELVIS_SHARE = 0.8;
/**
 * The body turning over: how far above the feet its middle is, and its radius of gyration about that (in legs; a rider
 * crouched for a landing). The push up through the feet is the body's weight and whatever the legs are braking its fall
 * with, as far as it turns the body over (gravities: the back leg gives before it carries more).
 */
const MIDDLE_OVER_FEET = 0.55;
const GYRATION = 0.45;
const PUSH_MOST = 3;
/** The fastest the feet carry the board ahead of the body (in √(gravity · leg)), and how far ahead before they can't follow it (in legs). */
const SHOOT_MOST = 1;
const SHOOT_REACH = 0.42;
/** The feet stay on the board at least this long from the touchdown, and no longer than this (seconds). */
const ON_BOARD = { least: 0.08, most: 0.32 } as const;
/**
 * The landing's squat: how deep the legs fold, as a share of how far over the deck they hold the hips riding the same
 * landing away (the lowest within `within` seconds of the touchdown; deeper, the weight on the back one), and how fast
 * they let the hips down into it (in √(gravity · leg)).
 */
const SQUAT = { deeper: 0.8, within: 0.5 } as const;
const SQUAT_SINK = 0.25;
/** The share of the rider's weight the legs still carry once the board's gone from under them. */
const LEGS_GIVE = 0.1;
/** The ground's grip on a rider sliding on their seat (as rollOut.ts's: body and clothes on concrete), and how long the seat's impact takes to scrub its share of the speed. */
const GRIP = 0.6;
const IMPACT_T = 0.06;
/** Seconds the hips' drift across the board's line takes to die away, coming down onto the seat. */
const DRIFT_T = 0.1;
/** How wide a patch of ground the rider's sat square to (in legs, either way), and how long they take to come square to it as it changes (seconds). */
const SAT_ON = { patch: 0.3, ease: 0.08 } as const;
/** Slower than this (world units a second), a rider the slope can't move has stopped. */
const STOPPED = 3;
/** How far round the hips turn toward the way they're going as they go down, at the most, how far short of square to it they end (degrees), and how long it takes. */
const TURN_MOST = 95;
const SIT_OPEN = 22;
const TURN_T = 0.5;
/** Seconds the pose the rider landed in takes to give way to the fall's (the offsets decay over about four of these). */
const BLEND_T = 0.07;
/** Seconds a foot takes from the board to the ground, and the rider takes to sit up once stopped (after a moment). */
const FOOT_DOWN_T = 0.24;
const SIT_UP = { after: 0.15, over: 0.7 } as const;
/**
 * Sat down, how far ahead of its hip each heel is (in legs: the foot that led, then the other), how far apart the feet are
 * (in hip widths), how far the toes turn out, and how far they're up off the ground sliding and sat still (degrees).
 */
const HEEL_AHEAD = [0.74, 0.64] as const;
const FEET_APART = 1.3;
const TOES_OUT = 12;
const TOES_UP = { sliding: 24, sat: 8 } as const;
/** Where each hand comes down off the ground under its shoulder (in arms: behind, and out to its side), catching the lean and sat up. */
const HAND = { caught: { back: 0.7, out: 0.34 }, sat: { back: 0.45, out: 0.4 } } as const;
/** The arms thrown out as the board goes, before the hands reach for the ground. */
const ARMS_THROWN: ArmPose = { out: 58, swing: -18, elbow: 28 };
/**
 * A foot coming down by a board that's still going out from under it: the most it lifts to stay over it (world units, a
 * robot's), how many times a second the plan looks, and how long ahead of needing it the lift comes on, and after goes (seconds).
 */
const OVER_BOARD = 36;
const OVER_HZ = 60;
const OVER_EASE = 0.05;
/** Sim steps a second. */
const HZ = 240;

export interface SlipBackSetup {
  body: BodyDims;
  /** The rider and board as the landed attempt has them at clock t, on the street. */
  regular: (t: number) => Rig;
  /** How far the landed attempt's wheels have turned at clock t. */
  wheel: (t: number) => number;
  gravity: number;
  /** Physics height of the ground under street (x, z). */
  ground: (x: number, z: number) => number;
  /** When the trick touches down. */
  touchdown: number;
  end: number;
  /** How fast brush on the ground at street (x, z) slows what goes through it (a share of its level speed a second). */
  drag?: (x: number, z: number) => number;
}

interface Sample {
  hips: V3;
  velocity: V3;
  /** The ground's own up under the rider: straight up on the level, square to a bank. */
  up: V3;
  /** How far back the trunk leans (radians). */
  lean: number;
  /** How far ahead of where the landed trick has it the feet have carried the board (seconds of its roll). */
  ahead: number;
}

export interface SlipBackPlan {
  setup: SlipBackSetup;
  takeover: number;
  touchdown: number;
  /** When the feet lose the board, the seat meets the ground, and the slide stops (those two the clip's end, if they never do). */
  release: number;
  seat: number;
  stopped: number;
  /** The way the rider is travelling. */
  travel: V3;
  /** The way the hips face at clock t (level), from the touchdown. */
  facing: (t: number) => V3;
  /** The fall from the touchdown, sampled every `dt`. */
  dt: number;
  samples: Sample[];
  /** The board on its own, from the release. */
  board: BoardTrack;
  /** Where the board and the rider hit the ground hard enough to raise dust: when, where, how hard (0 → 1). */
  hits: { t: number; at: V3; strength: number }[];
  /** Out of the pose the rider landed in. */
  blend: Blend;
  /** Each shoe as it left the board: where it was off the hips, how fast that was changing, and its turn. */
  left: [{ off: V3; rate: V3; q: Quat }, { off: V3; rate: V3; q: Quat }];
  /** How far each foot lifts over the board on its way down past it, every 1 / OVER_HZ from the release. */
  over: [number[], number[]];
  /** Which foot was ahead (0 left, 1 right) at the touchdown. */
  lead: 0 | 1;
  toeDir: 1 | -1;
}

export interface SlipBackFrame {
  /** The rider, on the street. */
  rig: Rig;
  board: BoardRig;
  wheel: number;
  /** Where the eyes are, on the street. */
  gaze: V3;
  expression: Expression;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const X: V3 = { x: 1, y: 0, z: 0 };
const Z: V3 = { x: 0, y: 0, z: 1 };
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mix3 = (a: V3, b: V3, k: number): V3 => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), z: mix(a.z, b.z, k) });
const boardQuat = (board: BoardRig): Quat => qbasis(board.dir(X), board.dir({ x: 0, y: 1, z: 0 }), board.dir(Z));

/** The turn that leans upright `by` radians over toward the level way `toward`. */
const leanTo = (toward: V3, by: number): Quat => qaxis(cross3(UP, toward), by);

/** `v`'s way along ground whose own up is `up`. */
const along = (v: V3, up: V3): V3 => norm3(sub3(v, scale3(up, dot3(v, up))));

/** A pelvis or trunk stood on ground whose own up is `up`, facing the level way `heading`, leant `by` radians back against the level way `travel`. */
function stood(up: V3, heading: V3, travel: V3, by: number): Quat {
  const back = along(scale3(travel, -1), up);
  return qnorm(qmul(qaxis(cross3(up, back), by), qframe(along(heading, up), up)));
}

/** The way `a` turned the share `k` of the way round to the way `b` (never through nothing, as going straight across between them could). */
function turned(a: V3, b: V3, k: number): V3 {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const axis = cross3(a, b);
  const sin = Math.hypot(axis.x, axis.y, axis.z);
  if (sin < 1e-6) return dot3(a, b) > 0 ? b : a;
  return qrot(qaxis(axis, k * Math.atan2(sin, dot3(a, b))), a);
}

/**
 * The ground's own up at street (x, z): square to it, over a patch `r` either way (so an edge is a bend, not a jump),
 * and no steeper than a bank anyone lands on.
 */
function groundUp(ground: (x: number, z: number) => number, x: number, z: number, r: number): V3 {
  const steepest = 1.2;
  const sx = (ground(x + r, z) - ground(x - r, z)) / (2 * r);
  const sz = (ground(x, z + r) - ground(x, z - r)) / (2 * r);
  const k = Math.min(1, steepest / Math.max(1e-9, Math.hypot(sx, sz)));
  return norm3({ x: sx * k, y: -1, z: sz * k });
}

/** Each hip joint of a pelvis at `hips`. */
const hipOf = (hips: V3, pelvis: Quat, i: number, body: BodyDims): V3 => add3(hips, scale3(qrot(pelvis, Z), (i === 0 ? -1 : 1) * body.hipHalf));

/** How far the further foot is from its hip. */
const stretch = (hips: V3, pelvis: Quat, shoes: readonly ShoePose[], body: BodyDims) =>
  Math.max(dist(hipOf(hips, pelvis, 0, body), ankleOf(shoes[0])), dist(hipOf(hips, pelvis, 1, body), ankleOf(shoes[1])));

/** Hips brought down the least that keeps both feet within `most` of them: sat back off the board, the legs can't hold them up there. */
function lowered(hips: V3, pelvis: Quat, shoes: readonly ShoePose[], body: BodyDims, most: number): V3 {
  if (stretch(hips, pelvis, shoes, body) <= most) return hips;
  const down = (by: number) => add3(hips, scale3(UP, -by));
  const deepest = 0.6 * (body.thigh + body.shin);
  const fits = (by: number) => stretch(down(by), pelvis, shoes, body) <= most;
  return down(fits(deepest) ? bisect(0, deepest, 14, fits).hi : deepest);
}

/** Feet the hips have dropped away from, brought along rather than stretch their legs. */
function withinReach(shoes: readonly ShoePose[], hips: V3, pelvis: Quat, body: BodyDims): [ShoePose, ShoePose] {
  const most = 0.995 * (body.thigh + body.shin);
  return shoes.map((shoe, i) => {
    const d = sub3(ankleOf(shoe), hipOf(hips, pelvis, i, body));
    const far = Math.hypot(d.x, d.y, d.z);
    return far > most ? { ...shoe, at: sub3(shoe.at, scale3(d, (far - most) / far)) } : shoe;
  }) as [ShoePose, ShoePose];
}

/** A pose's arms with any elbow or hand that's into the ground lifted straight up onto it. */
function armsOverGround(pose: BodyPose, body: BodyDims, ground: (x: number, z: number) => number): BodyPose {
  const k = body.scale;
  const chest = frameFrom(pose.hips, pose.torso);
  const up = (p: V3, r: number): V3 => {
    const deep = p.y + r - ground(p.x, p.z);
    return deep > 0 ? add3(p, scale3(UP, deep)) : p;
  };
  const arms = pose.arms.map((arm, i) => {
    const shoulder = chest.at(body.shoulder.f, body.shoulder.u, (i === 0 ? -1 : 1) * body.shoulder.s);
    const elbow = add3(shoulder, scale3(norm3(arm.upper), body.upperArm));
    const hand = add3(elbow, scale3(norm3(arm.fore), body.forearm));
    const elbowUp = up(elbow, LIMB_RADII.forearm * k);
    const handUp = up(hand, LIMB_RADII.hand * k);
    if (elbowUp === elbow && handUp === hand) return arm;
    const upper = norm3(sub3(elbowUp, shoulder));
    return { upper, fore: norm3(sub3(handUp, add3(shoulder, scale3(upper, body.upperArm)))) };
  }) as BodyPose['arms'];
  return { ...pose, arms };
}

/** A shoe raised (straight up) as far as its sole, heel to toe, is into the ground. */
function outOfGround(shoe: ShoePose, ground: (x: number, z: number) => number, k: number): ShoePose {
  let deepest = 0;
  for (const x of [-1, 0, 1]) {
    const p = add3(shoe.at, qrot(shoe.q, { x: x * SHOE_HALF_LENGTH * k, y: SHOE_HALF_HEIGHT, z: 0 }));
    deepest = Math.max(deepest, p.y - ground(p.x, p.z));
  }
  return deepest > 0 ? { at: add3(shoe.at, scale3(UP, deepest)), q: shoe.q } : shoe;
}

export function planSlipBack(setup: SlipBackSetup): SlipBackPlan {
  const { body, gravity: g, ground, touchdown } = setup;
  const leg = body.thigh + body.shin;
  const pace = Math.sqrt(g * leg);
  const takeover = touchdown - SLIP_BACK_LEAD;
  const dt = 1 / HZ;
  const h = 1 / 240;

  // The way the rider's going: the way the landed board rolls off its touchdown.
  const rigNow = setup.regular(touchdown);
  const rolling = scale3(sub3(setup.regular(touchdown + h).board.center, rigNow.board.center), 1 / h);
  const travel = level(rolling);
  const boardSpeed = Math.max(1, dot3(rolling, travel));
  const across = rightOf(travel);

  // ----- Coming down: the weight goes back -----
  const coming = (t: number) => leaningAt(setup, takeover, travel, t);
  const landed = coming(touchdown);
  const before = coming(touchdown - h);
  const velocity0 = scale3(sub3(landed.hips, before.hips), 1 / h);
  // How far over the deck's middle the hips are, and how fast they're coming down onto it.
  const high0 = rigNow.board.center.y - landed.hips.y;
  const sink0 = Math.max(0, velocity0.y - rolling.y);
  const lead: 0 | 1 = dot3(sub3(landed.shoes[0].at, landed.shoes[1].at), travel) >= 0 ? 0 : 1;

  // ----- The way the hips face: round toward the way they're going, as they go down -----
  const heading0 = level(qrot(landed.pelvis, X));
  const a0 = Math.atan2(dot3(heading0, across), dot3(heading0, travel));
  const a1 = Math.sign(a0) * Math.min(Math.abs(a0), Math.max(rad(SIT_OPEN), Math.abs(a0) - rad(TURN_MOST)));
  const facing = (t: number) => turnLevel(travel, ((a1 + (a0 - a1) * (1 - minJerk((t - touchdown) / TURN_T))) * 180) / Math.PI);

  // ----- The fall: into the squat, and the seat down onto the ground -----
  // How far over the ground at street (x, z) the hips are with the trunk sat on it (its own up `up`), facing `heading` and leant back `lean`.
  const seatOver = (at: { x: number; z: number }, up: V3, heading: V3, lean: number) => {
    const pelvis = stood(up, heading, travel, lean * PELVIS_SHARE);
    const torso = stood(up, heading, travel, lean);
    const down = { upper: scale3(UP, -1), fore: scale3(UP, -1) };
    const hips = { x: at.x, y: ground(at.x, at.z), z: at.z };
    const pose: BodyPose = { hips, pelvis, torso, head: torso, shoes: landed.shoes, knees: [UP, UP], arms: [down, down] };
    return Math.max(0, trunkInGround(rigOf(pose, body, rigNow.board, 1, 1), body, ground));
  };
  const leanIn = rad(LEAN_IN);
  const caught = rad(LEAN_CAUGHT);
  // The squat the legs fold into: the hips this far over the deck under the feet.
  let ridden = high0;
  for (let t = touchdown; t <= touchdown + SQUAT.within; t += 1 / 60) {
    const rig = setup.regular(t);
    ridden = Math.min(ridden, rig.board.center.y - poseOf(rig).hips.y);
  }
  const squat = SQUAT.deeper * ridden;
  const deckAt = (t: number, by: number) => setup.regular(t + by / boardSpeed).board.center.y;

  // ----- The run of it, stepped -----
  const samples: Sample[] = [];
  let pos = { x: landed.hips.x, z: landed.hips.z };
  let w = { x: velocity0.x, z: velocity0.z };
  let y = landed.hips.y;
  let vy = velocity0.y;
  // The ground's own up under the rider: the board's, landing, then the seat's, eased as it changes.
  let up = groundUp(ground, rigNow.board.center.x, rigNow.board.center.z, SAT_ON.patch * leg);
  // The hips' height over the deck and how fast they're coming down onto it, while the feet are on it.
  let height = high0;
  let sink = sink0;
  let seat = Infinity;
  let impact = 0;
  // The lean as it falls freely, and as it's drawn: caught by the hands, and sat up from once stopped.
  let lean = leanIn;
  let leanRate = 0;
  let shot = 0;
  let resting = false;
  let release = Infinity;
  let stopped = Infinity;
  const caughtAt = (free: number) => leanIn + (caught - leanIn) * Math.tanh((free - leanIn) / (caught - leanIn));
  const drawn = (t: number) => {
    const sat = stopped === Infinity ? 0 : smoothstep((t - stopped - SIT_UP.after) / SIT_UP.over);
    return mix(caughtAt(lean), rad(LEAN_SAT), sat);
  };
  const shoesOn = (t: number, by: number) => poseOf(setup.regular(t + by / boardSpeed)).shoes;
  const steps = Math.ceil((setup.end + 0.1 - touchdown) * HZ) + 1;
  for (let i = 0; i < steps; i++) {
    const t = touchdown + i * dt;
    samples.push({ hips: { x: pos.x, y, z: pos.z }, velocity: { x: w.x, y: vy, z: w.z }, up, lean: drawn(t), ahead: shot / boardSpeed });
    const next = t + dt;
    // Down, till the seat's on the ground: the legs brake the fall into the squat, as hard as it takes (as they do riding
    // it away), and hold it there while the board's under the feet; without it they give, and the seat drops. `legs` is
    // their push (the body's weight, sat or held), `falling` how fast the hips' fall is speeding up.
    let legs = g;
    let falling = 0;
    if (seat === Infinity) {
      const slow = SQUAT_SINK * pace;
      if (release !== Infinity) {
        legs = LEGS_GIVE * g;
        falling = g - legs;
      } else if (height <= squat) falling = -sink / 0.04;
      else if (sink > slow) {
        const brake = (sink * sink - slow * slow) / (2 * (height - squat));
        legs = g + brake;
        falling = -brake;
      } else falling = 0.5 * g;
      // (A landing that barely comes down, onto a bank, still sinks into the squat.)
    }
    // The push up through the feet, ahead of the body's middle, turns it over backward (till the hands have it).
    const arm = BACK + MIDDLE_OVER_FEET * Math.sin(lean);
    leanRate += ((Math.min(PUSH_MOST * g, legs) * arm) / (GYRATION * GYRATION * leg)) * dt;
    if (lean > leanIn + 4 * (caught - leanIn)) leanRate = 0;
    lean += leanRate * dt;
    if (release === Infinity) {
      // The feet swing out ahead as it goes over, the board under them, till they can't follow it.
      shot += Math.min(SHOOT_MOST * pace, leanRate * MIDDLE_OVER_FEET * leg) * dt;
      const pelvis = stood(up, facing(next), travel, drawn(next) * PELVIS_SHARE);
      // (Sat down already, on a bank that came up to meet the seat, they've lost it.)
      const gone = next >= touchdown + ON_BOARD.least
        && (shot >= SHOOT_REACH * leg || next >= touchdown + ON_BOARD.most || seat !== Infinity || stretch({ x: pos.x, y, z: pos.z }, pelvis, shoesOn(next, shot), body) > REACH * leg);
      if (gone) release = next;
    }
    // Along the ground: sat down, the ground's grip on the seat, the slope, and brush.
    if (resting) {
      const e = 0.5;
      const slope = { x: (ground(pos.x + e, pos.z) - ground(pos.x - e, pos.z)) / (2 * e), z: (ground(pos.x, pos.z + e) - ground(pos.x, pos.z - e)) / (2 * e) };
      const steep = Math.hypot(slope.x, slope.z);
      // (Along the level: a slope takes its share of gravity's pull down it, and of the weight on it.)
      const pull = g / (1 + steep * steep);
      // The seat coming down scrubs its share of the speed at once.
      const grip = GRIP * (pull + (t < seat + IMPACT_T ? impact / IMPACT_T : 0));
      const speed = Math.hypot(w.x, w.z);
      if (speed > STOPPED || steep > GRIP) {
        const way = speed > 1e-6 ? { x: w.x / speed, z: w.z / speed } : { x: slope.x / steep, z: slope.z / steep };
        const slowed = Math.max(0, speed - grip * dt);
        w = { x: way.x * slowed + slope.x * pull * dt, z: way.z * slowed + slope.z * pull * dt };
      } else {
        w = { x: 0, z: 0 };
        if (stopped === Infinity) stopped = next;
      }
      const brush = setup.drag?.(pos.x, pos.z) ?? 0;
      if (brush) w = { x: w.x * Math.exp(-brush * dt), z: w.z * Math.exp(-brush * dt) };
    } else if (seat === Infinity) {
      // Till the seat's down the feet are on the board, or just off it: what the hips were drifting across its line dies away.
      const drift = (w.x * across.x + w.z * across.z) * (1 - Math.exp(-dt / DRIFT_T));
      w = { x: w.x - across.x * drift, z: w.z - across.z * drift };
    }
    const floorWas = ground(pos.x, pos.z);
    pos = { x: pos.x + w.x * dt, z: pos.z + w.z * dt };
    const floor = ground(pos.x, pos.z);
    const under = groundUp(ground, pos.x, pos.z, SAT_ON.patch * leg);
    up = norm3(add3(up, scale3(sub3(under, up), 1 - Math.exp(-dt / SAT_ON.ease))));
    const rest = seatOver(pos, up, facing(next), drawn(next));
    if (seat === Infinity) {
      // Over the deck while the feet are on it, and falling once they aren't, till the seat meets the ground.
      let at: number;
      let fell = vy + falling * dt;
      if (release === Infinity) {
        sink += falling * dt;
        height -= sink * dt;
        at = deckAt(next, shot) - height;
        fell = (at - y) / dt;
      } else at = y + vy * dt + 0.5 * falling * dt * dt;
      if (at >= floor - rest) {
        seat = next;
        // (How fast the seat and the ground meet: on a bank the ground's going down under them too.)
        impact = Math.max(0, fell - (floor - floorWas) / dt);
        at = floor - rest;
        fell = (at - y) / dt;
        resting = true;
      }
      vy = fell;
      y = at;
    } else {
      // Sat on the ground wherever it goes, and falling to it where it drops away.
      const at = floor - rest;
      const free = y + vy * dt + 0.5 * g * dt * dt;
      resting = at <= free;
      if (resting) {
        vy = (at - y) / dt;
        y = at;
      } else {
        y = free;
        vy += g * dt;
      }
    }
  }
  if (release === Infinity) release = touchdown + ON_BOARD.most;
  if (seat === Infinity) seat = setup.end;
  if (stopped === Infinity) stopped = setup.end;

  const sampleAt = (t: number) => sampled(samples, touchdown, dt, t);
  // ----- The board, on its own from the release -----
  const carried = (t: number) => setup.regular(t + sampleAt(t).ahead).board;
  const atRelease = carried(release);
  const wasRelease = carried(release - h);
  const leaving: BoardMotion = {
    center: atRelease.center,
    q: boardQuat(atRelease),
    wheel: setup.wheel(release + sampleAt(release).ahead),
    velocity: scale3(sub3(atRelease.center, wasRelease.center), 1 / h),
    spin: scale3(qlog(qmul(boardQuat(atRelease), qconj(boardQuat(wasRelease)))), 1 / h),
  };
  const board = simulateBoard(leaving, release, setup.end + 0.1, { gravity: g, ground: (x, z) => ground(x, z), drag: setup.drag });

  // ----- The feet as they leave it -----
  const onBoard = (t: number) => poseOf(setup.regular(t + sampleAt(t).ahead)).shoes;
  const leftAt = onBoard(release);
  const leftBefore = onBoard(release - h);
  const hipsLeft = sampleAt(release).hips;
  const hipsBefore = sampleAt(release - h).hips;
  const left = [0, 1].map((i) => {
    const off = sub3(leftAt[i].at, hipsLeft);
    return { off, rate: scale3(sub3(off, sub3(leftBefore[i].at, hipsBefore)), 1 / h), q: leftAt[i].q };
  }) as SlipBackPlan['left'];

  const plan: SlipBackPlan = {
    setup, takeover, touchdown, release, seat, stopped, travel, facing, dt, samples, board,
    hits: [
      { t: touchdown, at: rigNow.board.center, strength: 0.9 },
      { t: seat, at: sampleAt(seat).hips, strength: Math.min(1, 0.35 + 0.4 * (impact / pace)) },
    ],
    blend: { at: touchdown, offset: [], rate: [], over: BLEND_T },
    left,
    over: [[], []],
    lead,
    toeDir: rigNow.toeDir,
  };
  plan.over = [liftsOver(plan, 0), liftsOver(plan, 1)];
  plan.blend = blendAt(touchdown, coming, (t) => fallingAt(plan, t), BLEND_T);
  return plan;
}

/** The fall's sample at clock t (held at its ends). */
function sampled(samples: Sample[], start: number, dt: number, t: number): Sample {
  const at = Math.max(0, Math.min(samples.length - 1, (t - start) / dt));
  const i = Math.min(samples.length - 2, Math.floor(at));
  const k = at - i;
  const a = samples[i];
  const b = samples[i + 1];
  return { hips: mix3(a.hips, b.hips, k), velocity: mix3(a.velocity, b.velocity, k), up: norm3(mix3(a.up, b.up, k)), lean: mix(a.lean, b.lean, k), ahead: mix(a.ahead, b.ahead, k) };
}

/**
 * Coming down, before the touchdown: the landed attempt's rider with the hips drifting back off the board and the body
 * leaning back with them, the feet still on it (and the hips as low as keeps them in the legs' reach).
 */
function leaningAt(setup: SlipBackSetup, takeover: number, travel: V3, t: number): BodyPose {
  const { body } = setup;
  const leg = body.thigh + body.shin;
  const pose = poseOf(setup.regular(t));
  const k = minJerk((t - takeover) / (setup.touchdown - takeover));
  if (k <= 0) return pose;
  const back = scale3(travel, -1);
  const lean = leanTo(back, rad(LEAN_IN) * k);
  const part = leanTo(back, rad(LEAN_IN) * k * PELVIS_SHARE);
  const pelvis = qnorm(qmul(part, pose.pelvis));
  // No further from the feet than the legs reach, or than the landed attempt has them.
  const most = Math.max(REACH * leg, stretch(pose.hips, pose.pelvis, pose.shoes, body));
  return {
    ...pose,
    hips: lowered(add3(pose.hips, scale3(back, BACK * leg * k)), pelvis, pose.shoes, body, most),
    pelvis,
    torso: qnorm(qmul(lean, pose.torso)),
    head: qnorm(qmul(part, pose.head)),
    arms: pose.arms.map((arm) => ({ upper: qrot(lean, arm.upper), fore: qrot(lean, arm.fore) })) as BodyPose['arms'],
  };
}

/** A shoe sat on its heel on ground whose own up is `up`: `heel` its heel's bottom (on the ground), its toe pointing the level way `toe` and `pitch` radians up off the ground. */
function onHeel(heel: V3, toe: V3, up: V3, pitch: number, k: number): ShoePose {
  const q = qframe(add3(scale3(along(toe, up), Math.cos(pitch)), scale3(up, Math.sin(pitch))), up);
  return { at: sub3(heel, qrot(q, { x: -SHOE_HALF_LENGTH * k, y: SHOE_HALF_HEIGHT, z: 0 })), q };
}

/** The way a knee bends, sat down or going down: up off the ground, and a little apart. */
const kneeWay = (up: V3, heading: V3, i: 0 | 1): V3 => norm3(add3(add3(up, scale3(heading, 0.35)), scale3(rightOf(heading), (i === 0 ? -1 : 1) * 0.2)));

/** The hips and the way they face and lean at clock `t`, from the touchdown. */
function seatAt(plan: SlipBackPlan, t: number) {
  const { hips, lean, up } = sampled(plan.samples, plan.touchdown, plan.dt, t);
  const heading = plan.facing(t);
  const pelvis = stood(up, heading, plan.travel, lean * PELVIS_SHARE);
  return { hips, up, heading, pelvis, sat: smoothstep((t - plan.stopped - SIT_UP.after) / SIT_UP.over) };
}

/** Foot `i` at clock `t`, from the release: off the board and down onto its heel ahead of the hips (before it's lifted over the board). */
function footDown(plan: SlipBackPlan, i: 0 | 1, t: number): ShoePose {
  const { body, ground } = plan.setup;
  const k = body.scale;
  const leg = body.thigh + body.shin;
  const { hips, up, heading, pelvis, sat } = seatAt(plan, t);
  const out = i === 0 ? -1 : 1;
  const ahead = add3(add3(hipOf(hips, pelvis, i, body), scale3(heading, HEEL_AHEAD[i === plan.lead ? 0 : 1] * leg)), scale3(rightOf(heading), out * (FEET_APART - 1) * body.hipHalf));
  const heel = { x: ahead.x, y: ground(ahead.x, ahead.z), z: ahead.z };
  const to = outOfGround(onHeel(heel, turnLevel(heading, out * TOES_OUT), up, rad(mix(TOES_UP.sliding, TOES_UP.sat, sat)), k), ground, k);
  const s = (t - plan.release) / FOOT_DOWN_T;
  if (s >= 1) return to;
  const from = plan.left[i];
  return {
    at: add3(hips, hermite3(from.off, from.rate, sub3(to.at, hips), { x: 0, y: 0, z: 0 }, FOOT_DOWN_T, Math.max(0, s))),
    q: qslerp(from.q, to.q, minJerk(s)),
  };
}

/**
 * How far foot `i` has to lift, every 1 / OVER_HZ from the release, to keep its shoe and shin out of a board that's still
 * under it: found ahead, and eased in before it's needed and out after, so the foot goes over the board rather than
 * popping off it.
 */
function liftsOver(plan: SlipBackPlan, i: 0 | 1): number[] {
  const { body } = plan.setup;
  const k = body.scale;
  const need: number[] = [];
  for (let t = plan.release; t <= plan.setup.end + 1 / OVER_HZ; t += 1 / OVER_HZ) {
    const board = boardRigOf(boardAt(plan.board, t));
    const shoe = footDown(plan, i, t);
    // Nowhere near it: the board's long gone.
    if (dist(board.center, shoe.at) > 80 + (SHOE_HALF_LENGTH + OVER_BOARD) * k) {
      need.push(0);
      continue;
    }
    const { hips, up, heading, pelvis } = seatAt(plan, t);
    const hip = hipOf(hips, pelvis, i, body);
    const inBoard = (by: number) => {
      const raised: ShoePose = { at: add3(shoe.at, scale3(UP, by)), q: shoe.q };
      const ankle = ankleOf(raised);
      const knee = twoBone(hip, ankle, body.thigh, body.shin, kneeWay(up, heading, i));
      return shoeIntersectsBoard(board, frameFrom(add3(raised.at, scale3(UP, SOLE_GRACE)), raised.q), k) || capsuleIntersectsBoard(board, knee, ankle, LIMB_RADII.knee * k, LIMB_RADII.ankle * k, k);
    };
    need.push(inBoard(0) ? bisect(0, OVER_BOARD * k, 10, (by) => !inBoard(by)).hi : 0);
  }
  // As much as any moment near needs, then smoothed.
  const reach = Math.ceil(OVER_EASE * OVER_HZ);
  const at = (a: number[], j: number) => a[Math.max(0, Math.min(a.length - 1, j))];
  let lift = need.map((_, j) => Math.max(...Array.from({ length: 2 * reach + 1 }, (_n, n) => at(need, j + n - reach))));
  for (let pass = 0; pass < 2 * reach; pass++) lift = lift.map((_, j) => (at(lift, j - 1) + 2 * at(lift, j) + at(lift, j + 1)) / 4);
  // (The foot's on the deck as it leaves it: none there.)
  return lift.map((by, j) => by * smoothstep(j / reach));
}

function liftOver(plan: SlipBackPlan, i: 0 | 1, t: number): number {
  const lift = plan.over[i];
  const at = Math.max(0, Math.min(lift.length - 1, (t - plan.release) * OVER_HZ));
  const j = Math.min(lift.length - 2, Math.floor(at));
  return j < 0 ? 0 : mix(lift[j], lift[j + 1], at - j);
}

/** The fall's own pose at clock `t`, from the touchdown: going over backward, sat down, sliding, and sat up. */
function fallingAt(plan: SlipBackPlan, t: number): BodyPose {
  const { setup, touchdown, seat, release, stopped, travel, lead } = plan;
  const { body, ground } = setup;
  const k = body.scale;
  const arm = body.upperArm + body.forearm;
  const sample = sampled(plan.samples, touchdown, plan.dt, t);
  const { hips, lean, up } = sample;
  const heading = plan.facing(t);
  const side = rightOf(heading);
  const pelvis = stood(up, heading, travel, lean * PELVIS_SHARE);
  const torso = stood(up, heading, travel, lean);
  const sat = smoothstep((t - stopped - SIT_UP.after) / SIT_UP.over);
  // The reaching palm sweeps over a lip before its center crosses it. Sample the
  // width of the hand along the slide; final arm contact still uses the hard ground.
  const floor = (p: V3): V3 => {
    const r = LIMB_RADII.hand * k;
    const along = (n: number) => ground(p.x + travel.x * r * n, p.z + travel.z * r * n);
    const center = along(0);
    const mean = (along(-1) + along(-0.5) + center + along(0.5) + along(1)) / 5;
    return { x: p.x, y: Math.min(center, mean), z: p.z };
  };

  // ----- Feet: on the board while it's under them, then down onto their heels ahead of the hips, over the board as it goes -----
  let shoes: [ShoePose, ShoePose];
  if (t < release) shoes = poseOf(setup.regular(t + sample.ahead)).shoes;
  else {
    shoes = ([0, 1] as const).map((i) => {
      const shoe = footDown(plan, i, t);
      return outOfGround({ at: add3(shoe.at, scale3(UP, liftOver(plan, i, t))), q: shoe.q }, ground, k);
    }) as [ShoePose, ShoePose];
  }
  shoes = withinReach(shoes, hips, pelvis, body);

  // ----- Knees: as the rider had them while the feet are on the board, then up -----
  const stand = poseOf(setup.regular(Math.min(t, release) + sample.ahead)).knees;
  const up0 = smoothstep((t - release) / FOOT_DOWN_T);
  const knee = (i: 0 | 1) => turned(stand[i], kneeWay(up, heading, i), up0);

  // ----- Arms: thrown out as the board goes, then back and down for the ground -----
  const chest = frameFrom(hips, torso);
  const reaching = smoothstep((t - touchdown) / Math.max(0.1, 0.7 * (seat - touchdown)));
  const armAt = (i: 0 | 1) => {
    const out = i === 0 ? -1 : 1;
    const [upper, fore] = armDirs(ARMS_THROWN, out);
    const thrown = { upper: qrot(torso, upper), fore: qrot(torso, fore) };
    const shoulder = chest.at(body.shoulder.f, body.shoulder.u, out * body.shoulder.s);
    // The hand behind as they landed is the further back.
    const behind = i === lead ? 0.8 : 1;
    const spot = floor(add3(add3(shoulder, scale3(heading, -mix(HAND.caught.back * behind, HAND.sat.back, sat) * arm)), scale3(side, out * mix(HAND.caught.out, HAND.sat.out, sat) * arm)));
    const palm = add3(spot, scale3(UP, LIMB_RADII.hand * k));
    const to = sub3(palm, shoulder);
    const far = Math.hypot(to.x, to.y, to.z);
    const hand = far > 0.98 * arm ? add3(shoulder, scale3(to, (0.98 * arm) / far)) : palm;
    const elbow = twoBone(shoulder, hand, body.upperArm, body.forearm, add3(add3(scale3(heading, -1), scale3(side, out * 0.7)), scale3(UP, 0.2)));
    const down = { upper: norm3(sub3(elbow, shoulder)), fore: norm3(sub3(hand, elbow)) };
    return { upper: norm3(mix3(thrown.upper, down.upper, reaching)), fore: norm3(mix3(thrown.fore, down.fore, reaching)) };
  };

  // ----- Head: on the board as it goes -----
  const boardCenter = t < release ? setup.regular(t + sample.ahead).board.center : boardAt(plan.board, t).center;
  const torsoUp = qrot(torso, { x: 0, y: -1, z: 0 });
  const torsoFwd = qrot(torso, X);
  const torsoSide = cross3(torsoUp, torsoFwd);
  const look = norm3(sub3(boardCenter, add3(hips, scale3(torsoUp, body.neck + 10 * k))));
  // (Not round at all for a board right behind: looked for over neither shoulder, rather than flicked from one to the other.)
  const about = Math.atan2(dot3(look, torsoSide), dot3(look, torsoFwd));
  const round = Math.max(-1, Math.min(1, about * 0.85 * smoothstep((Math.PI - Math.abs(about)) / (Math.PI - 1.4))));
  const nod = Math.max(-0.9, Math.min(0.3, Math.asin(Math.max(-1, Math.min(1, dot3(look, torsoUp)))) * 0.75));
  const level0 = add3(scale3(torsoFwd, Math.cos(round)), scale3(torsoSide, Math.sin(round)));
  const head = qframe(add3(scale3(level0, Math.cos(nod)), scale3(torsoUp, Math.sin(nod))), norm3(add3(scale3(torsoUp, 0.5), scale3(UP, 0.5))));

  return { hips, pelvis, torso, head, shoes, knees: [knee(0), knee(1)], arms: [armAt(0), armAt(1)] };
}

/** Where the rider's hips are at clock t (at or after the takeover), on the street, and how fast they're going. */
export function slipBackHips(plan: SlipBackPlan, t: number): { hips: V3; velocity: V3 } {
  if (t >= plan.touchdown) {
    const { hips, velocity } = sampled(plan.samples, plan.touchdown, plan.dt, t);
    return { hips, velocity };
  }
  const h = 1 / 240;
  const hips = leaningAt(plan.setup, plan.takeover, plan.travel, t).hips;
  return { hips, velocity: scale3(sub3(hips, leaningAt(plan.setup, plan.takeover, plan.travel, t - h).hips), 1 / h) };
}

/** The rider and board at clock `t` (at or after the takeover), on the street. */
export function slipBackAt(plan: SlipBackPlan, t: number): SlipBackFrame {
  const { setup, takeover, touchdown, release } = plan;
  const { body, ground } = setup;
  const free = smoothstep((t - takeover) / 0.25);
  if (t < touchdown) {
    const { board } = setup.regular(t);
    return { rig: rigOf(leaningAt(setup, takeover, plan.travel, t), body, board, plan.toeDir, free), board, wheel: setup.wheel(t), gaze: board.center, expression: 'focus' };
  }
  const ahead = sampled(plan.samples, touchdown, plan.dt, t).ahead;
  const loose = t < release ? null : boardAt(plan.board, t);
  const board = loose ? boardRigOf(loose) : setup.regular(t + ahead).board;
  const wheel = loose ? loose.wheel : setup.wheel(t + ahead);
  // (Twice: lifting an elbow moves its hand.)
  let pose = armsOverGround(armsOverGround(blended(fallingAt(plan, t), plan.blend, t), body, ground), body, ground);
  let rig = rigOf(pose, body, board, plan.toeDir, free);
  // Sat on a slope, or going over an edge: the trunk on top of the ground, not in it.
  const deep = trunkInGround(rig, body, ground);
  if (deep > 0) {
    pose = { ...pose, hips: add3(pose.hips, scale3(UP, deep)) };
    pose = { ...pose, shoes: withinReach(pose.shoes, pose.hips, pose.pelvis, body) };
    rig = rigOf(pose, body, board, plan.toeDir, free);
  }
  return { rig, board, wheel, gaze: board.center, expression: t < plan.stopped + 0.4 ? 'wince' : 'open' };
}
