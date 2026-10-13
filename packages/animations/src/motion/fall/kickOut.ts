import { add3, bisect, clamp01, cross3, dot3, norm3, scale3, smoothstep, sub3, type V3 } from '../../math';
import type { Expression } from '../../riders/look';
import type { SkateStyle } from '../../types';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, armDirs, moveFrame, type ArmPose, type BoardRig, type LegRig, type Rig } from '../skeleton';
import { TIP_X, deckBottomY, deckTopY } from '../../board/deck';
import { FOOT } from '../../units';
import { BOARD_WIDTH_SCALE } from '../../board/boardDimensions';
import { DECK_HALF_WIDTH } from '../skeleton';
import {
  ANKLE_IN_SHOE, LIMB_RADII, SOLE_GRACE, SOLE_HALF_WIDTH, ankleOf, poseOf, rigOf, twoBone, type BodyDims, type BodyPose, type ShoePose,
} from './body';
import { capsuleIntersectsBoard, legBoardCollision, shoeIntersectsBoard } from '../../board/boardCollision';
import { kneeBetween } from '../grindRig';
import { boardAt, boardMotionAt, boardRigOf, boardSimulation, simulateBoard, type BoardMotion, type BoardTrack } from './boardBody';
import { IDENTITY, frameFrom, qaxis, qbasis, qconj, qexp, qframe, qlog, qmul, qnorm, qrot, qslerp, type Quat } from './rotation';
import { rollAt, rollOut, rollsOut, type Roll } from './rollOut';
import { UP, level, rightOf, turnLevel, type Footfall } from './footing';
import { runOut, runOutAt, type RunOut } from './runOut';
import { stepOut } from './stepOut';

/**
 * The kick-out: the trick comes round wrong, the rider's front foot finds
 * the board in the air at the wrong angle, and rather than ride it they shove
 * it away and come down on their own feet, running the speed out.
 *
 * Up to the takeover the attempt is the landed trick's, except the board:
 * it under-rotates (a flip), over-rotates (a shuv), or slips out under the
 * feet (an ollie), so that when the catch comes it's on its rail or across
 * the rider instead of flat under them. From the takeover the rider is their
 * own: the leading foot reaches down onto the board where it really is and
 * pushes it off forward and down; the board flies, bounces and rolls on its
 * own (boardBody.ts) with the push as a force at the foot; the push shoves
 * the rider back a little (the board is a twentieth of them); and the body
 * falls freely until the feet meet the ground, then brakes over its own
 * steps (runOut.ts), turning to face the way it's going. Down too hard or
 * too fast for that (off a drop), they take it on both feet and roll over a
 * shoulder (rollOut.ts), and step out of what's left from their feet coming up
 * (stepOut.ts): a few braking steps and they're stood.
 *
 * Positions are the street's (the stage's x plus its scroll); the stage
 * shifts them back by its own scroll, which from the takeover follows the
 * rider rather than the board.
 */

/** Seconds before the catch the rider's own motion takes over, and the foot meets the board (just before the catch would have). */
export const TAKEOVER_LEAD = 0.13;
const CONTACT_LEAD = 0.01;
/**
 * How long the push lasts, and the least and most speed it gives the board (world units a second: as much as it takes to
 * clear the rider's feet, at most a hard shove's 22 feet a second).
 */
const PUSH_T = 0.075;
const PUSH = { least: 200, most: 22 * FOOT } as const;
/** How finely the least push is found. */
const PUSH_STEP = 8;
/** The pushes tried, hardest first, where none clears the legs. */
const FALLBACK_PUSHES = [1, 0.875, 0.75, 0.625].map((share) => share * PUSH.most);
/**
 * The push's direction: out across the way the rider's going (away from the foot that lands first), a little along it, and
 * down; or, where no push that way clears the legs, back against it (the board left behind, the rider running on past it).
 */
const PUSH_DIR = { out: 1, along: 0.35, back: -0.8, down: 0.45 } as const;
/** How far (world units, a robot's) the board keeps off the legs that come down by it. */
const CLEARANCE = 3;
/** A shoe, as the board's kept off it: a capsule this far either way of its middle along it, as round as the shoe is high. */
const SHOE_CAPSULE = { half: 9, r: SHOE_HALF_HEIGHT } as const;
/** How long before a foot comes down the board must be out of its way. */
const CLEAR_BEFORE = 0.04;
/** The gap (world units, a robot's) the board keeps off the legs as they're drawn, coming down and running on; and how long the kicking foot takes to come off it. */
const LEG_GAP = 1;
const KICK_LETS_GO = 0.02;
/** How many boards the rider weighs. */
const RIDER_MASS = 20;
/** How far off its catch the board is when the foot meets it (degrees). */
const MISS_DEG = 62;
/** Seconds the pose the rider was in takes to give way to their own (the offsets decay over about four of these). */
const BLEND_T = 0.06;
/** Half the stretch (seconds) the braking lean averages the body's deceleration over: about a stride. */
const BRAKE_SPAN = 0.12;
/**
 * The ground a roll needs from the first foot down (in legs): this far along the way the rider's going and this far
 * either side, never further up or down than `rise` (sampled `samples` times along).
 */
const ROLL_ROOM = { ahead: 3, half: 0.4, rise: 0.12, samples: 12 } as const;
/** The share of the speed the landing on the first foot takes out: it comes down near under the hips, and the steps after brake. */
const FIRST_BRAKE = 0.2;
/** Earliest the free foot is down, as a share of the push: it reaches for the ground while the other is on the board. */
const FIRST_AFTER = 0.5;
/** How far the free foot, landing first, has turned from across the board toward the way the rider's going (degrees). */
const FIRST_TURN = 35;
/** Seconds the body takes to turn to the way it's running. */
const TURN_T = 0.45;
/** Rolling, the kicking foot is down beside the other no sooner than this after it lets go of the board. */
const SECOND_AFTER = 0.1;
/** How long past the first foot down the board's checked against a rolling body (seconds). */
const ROLL_CHECK = 1.4;

export interface KickOutSetup {
  style: SkateStyle;
  body: BodyDims;
  /** The rider and board as the landed attempt has them at clock t, on the street; given an error, its board turned by it in its own frame (and the feet kept off it). */
  regular: (t: number, error?: Quat) => Rig;
  /** How far the landed attempt's wheels have turned at clock t. */
  wheel: (t: number) => number;
  /** When the board left the ground: its turn is measured from there. */
  pop: number;
  /** The trick's board never leaves the feet (an ollie, a 180): it slips out instead of over-rotating. */
  glued: boolean;
  gravity: number;
  /** Physics height of the ground under street (x, z). */
  ground: (x: number, z: number) => number;
  /** When the trick would have been caught, and touched down. */
  catchAt: number;
  touchdown: number;
  end: number;
  /**
   * Jumping off a rail instead (railBail.ts): the velocity the legs give the hips leaving the board, over JUMP_T from the
   * takeover, the board holding their weight till then. The board is under the feet, not slipping out.
   */
  jump?: V3;
  /** What the board meets, if not the rider's `ground`: with the rail it was left on, over it (`y`, a point's height). Its hangers meet it too. */
  boardGround?: (x: number, z: number, y: number) => number;
  /**
   * Rolls it out on level ground coming down faster than this, all told (in sqrt(g * leg)), rather than only past the
   * hard limits of a ridden fall (rollOut.ts): off a rail the feet come down still across the way the body's going.
   */
  rollAbove?: number;
}

/** Points on the deck this close in height (world units) are as high as each other, for where the kicking foot finds it. */
const LEVEL_TIE = 0.25;

/** The least a rolling knee's middle keeps over the ground (world units). */
const KNEE_OVER_GROUND = 0.5;

/** How long the legs take to throw the body off a rail (seconds): a jump's push. */
export const JUMP_T = 0.16;

interface PoseRate {
  hips: V3;
  rot: { pelvis: V3; torso: V3; head: V3 };
}

/** A stretch on the feet: the run, the way the hips face and go, and the pose the rider comes into it in at `from`, and how fast that was turning. */
interface FeetPhase {
  run: RunOut;
  facing: (t: number) => V3;
  travel: V3;
  from: number;
  start: BodyPose;
  rate: PoseRate;
  /** When the feet first took the body's weight. */
  down: number;
}

/** A pose's offsets from another (the turns of pelvis, torso and head; the arms' and knees' directions) at `at`, and how fast they were changing: they die away from there. */
interface Blend {
  at: number;
  offset: V3[];
  rate: V3[];
  /** Seconds the offsets take to give way (they're gone in about four of these). */
  over: number;
}

export interface KickOutPlan {
  setup: KickOutSetup;
  takeover: number;
  contact: number;
  release: number;
  /** The board's error at clock t (board-local turn), up to the takeover. */
  error: (t: number) => Quat;
  board: BoardTrack;
  /** The speed the push gives the board. */
  push: number;
  run: RunOut;
  /** Index (0 left, 1 right) of the foot that kicks the board, and of the other. */
  kick: 0 | 1;
  /** The board-local point the foot pushes. */
  contactLocal: V3;
  /** The way the rider is travelling, and the way they face at a time. */
  travel: V3;
  facing: (t: number) => V3;
  /** The rider at the takeover, and how fast each part was moving. */
  start: BodyPose;
  rate: PoseRate;
  startShoes: [{ at: V3; velocity: V3; q: Quat }, { at: V3; velocity: V3; q: Quat }];
  /** The kicking shoe's turn while it's on the board. */
  kickShoe: Quat;
  toeDir: 1 | -1;
  /** Down too hard or too fast to run it out: the roll from the first foot down, the way into it, and the run up out of it. */
  roll: Roll | null;
  rollIn: Blend | null;
  after: FeetPhase | null;
}

const minJerk = (x: number) => {
  const s = clamp01(x);
  return s * s * s * (10 + s * (-15 + 6 * s));
};

/** Cubic Hermite between two points with velocities over `span` seconds, at `s` (0 → 1). */
function hermite3(p0: V3, v0: V3, p1: V3, v1: V3, span: number, s: number): V3 {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  return add3(add3(scale3(p0, h00), scale3(v0, h10 * span)), add3(scale3(p1, h01), scale3(v1, h11 * span)));
}

/** Inertialization: an offset `o` moving at `ov` at the takeover, gone with zero speed a few `over`s (BLEND_Ts) later. */
const decay = (o: number, ov: number, tau: number, over = BLEND_T) => (o + (ov + o / over) * tau) * Math.exp(-tau / over);
const decay3 = (o: V3, ov: V3, tau: number, over = BLEND_T): V3 => ({ x: decay(o.x, ov.x, tau, over), y: decay(o.y, ov.y, tau, over), z: decay(o.z, ov.z, tau, over) });

const boardQuat = (board: BoardRig): Quat => qbasis(board.dir({ x: 1, y: 0, z: 0 }), board.dir({ x: 0, y: 1, z: 0 }), board.dir({ x: 0, y: 0, z: 1 }));

/** A board turned in its own frame by `e` first. */
export function erredBoard(board: BoardRig, e: Quat): BoardRig {
  if (e === IDENTITY) return board;
  const dir = (local: V3) => board.dir(qrot(e, local));
  return { ...board, dir, point: (local) => add3(board.center, dir(local)) };
}

/** How far up (world units) a foot may be held off a board that isn't coming round, and the gap it keeps. */
const MOST_LIFT = 40;
const LIFT_GAP = 0.8;

/** A leg with its foot raised `by`, the knee bent to keep its bones' lengths. */
function raised(leg: LegRig, by: number): LegRig {
  if (by <= 0) return leg;
  const up = { x: 0, y: -by, z: 0 };
  const ankle = add3(leg.ankle, up);
  return { ...leg, ankle, knee: kneeBetween(leg.hip, ankle, leg.knee), shoe: moveFrame(leg.shoe, up) };
}

/**
 * The rider on a board that's come round wrong: the board turned in its own
 * frame by `error`, and each foot held up the least that keeps its shoe and
 * shin clear of it.
 */
export function offLineRig(rig: Rig, error: Quat): Rig {
  if (error === IDENTITY) return rig;
  const board = erredBoard(rig.board, error);
  const legs = rig.legs.map((leg) => {
    const hits = (by: number) => {
      const c = legBoardCollision(board, raised(leg, by), LIFT_GAP);
      return c.shoe || c.shin;
    };
    if (!hits(0)) return leg;
    return raised(leg, bisect(0, MOST_LIFT, 14, (by) => !hits(by)).hi);
  }) as Rig['legs'];
  return { ...rig, board, legs };
}

/** The board's motion at clock t, from the regular attempt, erred. */
function boardMotion(setup: KickOutSetup, error: (t: number) => Quat, t: number): BoardMotion {
  const h = 1 / 240;
  const at = (s: number) => erredBoard(setup.regular(s).board, error(s));
  const a = at(t - h);
  const b = at(t + h);
  const now = at(t);
  const qa = boardQuat(a);
  const qb = boardQuat(b);
  return {
    center: now.center,
    q: boardQuat(now),
    wheel: 0,
    velocity: scale3(sub3(b.center, a.center), 1 / (2 * h)),
    spin: scale3(qlog(qmul(qb, qconj(qa))), 1 / (2 * h)),
  };
}

/** A free board's turn `dt` on from `m` (spin held: enough over a tenth of a second). */
const coast = (m: BoardMotion, dt: number): Quat => qnorm(qmul(qexp(scale3(m.spin, dt)), m.q));

export function planKickOut(setup: KickOutSetup): KickOutPlan {
  const { body, gravity, ground } = setup;
  const leg = body.thigh + body.shin;
  // How far from the hips the body reaches: down a leg to the shoe's end, out an arm, or up to the top of the head.
  const k0 = body.scale;
  const reach = Math.max(
    leg + (SHOE_HALF_LENGTH + LIMB_RADII.hip) * k0,
    body.torso.u + Math.hypot(body.shoulder.f, body.shoulder.u, body.shoulder.s) + body.upperArm + body.forearm + LIMB_RADII.hand * k0,
    body.torso.u + body.neck + Math.hypot(body.head.f, body.head.u) + LIMB_RADII.head * k0,
  );
  const takeover = setup.catchAt - TAKEOVER_LEAD;
  const contact = setup.catchAt - CONTACT_LEAD;
  const release = contact + PUSH_T;

  // ----- The board's error -----
  // The way the trick turns the board, in its own frame, sampled from the pop to the takeover.
  const ownSpinAt = (t: number) => {
    const m = boardMotion(setup, () => IDENTITY, t);
    return qrot(qconj(m.q), m.spin);
  };
  const ownSpin = ownSpinAt(takeover - 1 / 120);
  // Which axis it turns about most, signed the way it turns: a flip (or an impossible) under-rotates about it, a shuv over-rotates.
  const ax = Math.abs(ownSpin.x);
  const ay = Math.abs(ownSpin.y);
  const az = Math.abs(ownSpin.z);
  const axisLocal: V3 = ax >= ay && ax >= az
    ? { x: Math.sign(ownSpin.x) || 1, y: 0, z: 0 }
    : ay >= az ? { x: 0, y: Math.sign(ownSpin.y) || 1, z: 0 } : { x: 0, y: 0, z: Math.sign(ownSpin.z) || 1 };
  const over = axisLocal.y !== 0 ? 1 : -1;
  // How far it has turned about that axis by clock t.
  const turnedAt: number[] = [0];
  const STEP = 1 / 240;
  // (A board that never leaves the feet doesn't miss its turn: there's none to follow.)
  if (!setup.glued) for (let t = setup.pop; t < takeover; t += STEP) turnedAt.push(turnedAt[turnedAt.length - 1] + dot3(ownSpinAt(Math.min(takeover, t + STEP / 2)), axisLocal) * STEP);
  const turned = (t: number) => {
    const at = Math.max(0, Math.min(turnedAt.length - 1, (Math.min(t, takeover) - setup.pop) / STEP));
    const i = Math.min(turnedAt.length - 2, Math.floor(at));
    return i < 0 ? 0 : turnedAt[i] + (turnedAt[i + 1] - turnedAt[i]) * (at - i);
  };
  const caught = boardQuat(setup.regular(setup.touchdown).board);
  const angleOff = (m: BoardMotion) => {
    const r = qlog(qmul(coast(m, contact - takeover), qconj(caught)));
    return Math.hypot(r.x, r.y, r.z);
  };
  const missBy = (k: number) => (t: number) => qaxis(axisLocal, over * k * turned(t));
  let lost = 0;
  if (!setup.glued) {
    // Find the share of its turn the board loses (or gains) that leaves it MISS_DEG off its catch when the foot meets it.
    const target = (MISS_DEG * Math.PI) / 180;
    const { lo, hi } = bisect(0, 0.6, 24, (k) => !(angleOff(boardMotion(setup, missBy(k), takeover)) < target));
    lost = (lo + hi) / 2;
  }
  const error = setup.glued ? () => IDENTITY : missBy(lost);
  const atTakeover = boardMotion(setup, error, takeover);
  if (setup.glued && !setup.jump) {
    // The board slips out from under the feet: it rolls off its toeside rail and swings, the way a missed ollie squirts out.
    const slip = ((MISS_DEG * 0.75 * Math.PI) / 180) / (contact - takeover);
    atTakeover.spin = add3(atTakeover.spin, qrot(atTakeover.q, { x: slip, y: slip * 0.35, z: 0 }));
  }
  atTakeover.wheel = setup.wheel(takeover);

  // ----- The rider at the takeover -----
  const h = 1 / 240;
  const rigNow = setup.regular(takeover, error(takeover));
  const rigBefore = setup.regular(takeover - h, error(takeover - h));
  const start = poseOf(rigNow);
  const before = poseOf(rigBefore);
  const rotRate = (a: Quat, b: Quat) => scale3(qlog(qmul(a, qconj(b))), 1 / h);
  const rate: PoseRate = {
    hips: scale3(sub3(start.hips, before.hips), 1 / h),
    rot: { pelvis: rotRate(start.pelvis, before.pelvis), torso: rotRate(start.torso, before.torso), head: rotRate(start.head, before.head) },
  };
  const startShoes = start.shoes.map((shoe, i) => ({
    at: shoe.at,
    velocity: scale3(sub3(shoe.at, before.shoes[i].at), 1 / h),
    q: shoe.q,
  })) as KickOutPlan['startShoes'];

  // The way the rider is going: their hips' level velocity.
  const travel = level(rate.hips);
  // The foot further along it kicks.
  const ahead = (i: number) => dot3(sub3(start.shoes[i].at, start.hips), travel);
  const kick: 0 | 1 = ahead(0) >= ahead(1) ? 0 : 1;

  // ----- The push -----
  // Where the foot finds the board: the highest point of the deck's cross-section under it, when it gets there.
  const boardGround = setup.boardGround ?? ground;
  const hangers = setup.boardGround != null;
  const freeTrack = simulateBoard(atTakeover, takeover, contact + 0.05, { gravity, ground: boardGround, hangers });
  const atContact = boardAt(freeTrack, contact);
  const toLocal = (p: V3) => qrot(qconj(atTakeover.q), sub3(p, atTakeover.center));
  const footX = Math.max(-26, Math.min(26, toLocal(start.shoes[kick].at).x));
  const hw = DECK_HALF_WIDTH * BOARD_WIDTH_SCALE * 0.92;
  const candidates: V3[] = [
    { x: footX, y: deckTopY(footX), z: 0 },
    { x: footX, y: deckTopY(footX), z: hw },
    { x: footX, y: deckTopY(footX), z: -hw },
    { x: footX, y: deckBottomY(footX), z: hw },
    { x: footX, y: deckBottomY(footX), z: -hw },
    { x: footX, y: deckBottomY(footX), z: 0 },
  ];
  const world = (local: V3) => add3(atContact.center, qrot(atContact.q, local));
  // (Off a rail the board's level on it, its edges as high as each other: the one nearer the kicking foot, so a goofy
  // rider's is a regular one's mirror.)
  const nearKick = (c: V3) => Math.hypot(world(c).x - start.shoes[kick].at.x, world(c).z - start.shoes[kick].at.z);
  const higher = (c: V3, best: V3) => (setup.jump && Math.abs(world(c).y - world(best).y) < LEVEL_TIE
    ? nearKick(c) < nearKick(best) : world(c).y < world(best).y);
  const contactLocal = candidates.reduce((best, c) => (higher(c, best) ? c : best));
  // The shoe meets it level, its toe still the way it was: over the deck's top edge (a board coming round wrong is on its
  // side), a sole turned to the deck would put the shoe's far end into it.
  const kickFwd = qrot(start.shoes[kick].q, { x: 1, y: 0, z: 0 });
  const kickShoe = qframe(sub3(kickFwd, scale3(UP, dot3(kickFwd, UP))), UP);
  const across = rightOf(travel);
  // The free foot lands first, on its own side of the line the hips run; the board goes out the other side.
  const free: 0 | 1 = kick === 0 ? 1 : 0;
  const facing0 = level(qrot(start.pelvis, { x: 1, y: 0, z: 0 }));
  const freeSide = dot3(rightOf(facing0), across) * (free === 0 ? -1 : 1);
  // Each push's board, followed as far on as it's been asked for.
  const sims = new Map<string, (until: number) => BoardTrack>();
  const boardFor = (dir: V3, push: number, until: number) => {
    const key = `${dir.x},${dir.y},${dir.z},${push}`;
    let sim = sims.get(key);
    if (!sim) {
      sim = boardSimulation(atTakeover, takeover, {
        gravity,
        ground: boardGround,
        hangers,
        pushes: [{ from: contact, until: release, at: contactLocal, impulse: scale3(dir, push) }],
      });
      sims.set(key, sim);
    }
    return sim(until);
  };

  // ----- The rider's run -----
  // The push shoves the rider back as it goes: a half-sine of the board's impulse, over RIDER_MASS. Jumping off a rail,
  // the legs throw the body too, as hard at the start as a jump's push (and holding its weight up while they're on it).
  const jumpOf = (t: number): V3 => {
    if (!setup.jump) return { x: 0, y: 0, z: 0 };
    const k = clamp01((t - takeover) / JUMP_T);
    return add3(scale3(setup.jump, (1 - Math.cos(Math.PI * k)) / 2), scale3(UP, gravity * k * JUMP_T));
  };
  const shoveOf = (dir: V3, push: number) => (t: number): V3 => {
    const k = clamp01((t - contact) / PUSH_T);
    return add3(scale3(dir, (-push * (1 - Math.cos(Math.PI * k))) / 2 / RIDER_MASS), jumpOf(t));
  };
  const heading0 = facing0;
  const yawRate = dot3(rate.rot.pelvis, { x: 0, y: 1, z: 0 });
  // The body's spin carries on until its feet meet the ground, and the turn to run starts then.
  const turnFrom = setup.touchdown;
  const spunTo = (t: number) => turnLevel(heading0, -(yawRate * (Math.min(t, turnFrom) - takeover) * 180) / Math.PI);
  const turnStart = spunTo(turnFrom);
  const signed = Math.atan2(dot3(turnStart, across), dot3(turnStart, travel));
  // (Kept for the clock it was last asked at: the run asks again for each foot, every step of its simulation.)
  let facedAt = NaN;
  let faced = travel;
  const facing = (t: number): V3 => {
    if (t !== facedAt) {
      facedAt = t;
      faced = t <= turnFrom ? spunTo(t) : turnLevel(travel, (signed * (1 - minJerk((t - turnFrom) / TURN_T)) * 180) / Math.PI);
    }
    return faced;
  };
  // The free foot comes down still near across the way it's going (it's been on the board sideways); the kicking foot is the first stride.
  const freeHeading = level(qrot(start.shoes[free].q, { x: 1, y: 0, z: 0 }));
  const towardTravel = Math.sign(dot3(travel, rightOf(freeHeading))) || 1;
  const firstTurned = turnLevel(freeHeading, towardTravel * FIRST_TURN);
  // Each push's run, kept by the way it goes (the same vector each time it's tried) and how hard: the search comes back to
  // a push, and the plan keeps the run of the one it settles on.
  const runs = new Map<V3, Map<number, RunOut>>();
  const runWith = (dir: V3, push: number): RunOut => {
    let byPush = runs.get(dir);
    if (!byPush) runs.set(dir, (byPush = new Map()));
    let run = byPush.get(push);
    if (!run) {
      run = runOut({
        body,
        gravity,
        ground,
        start: takeover,
        hips: start.hips,
        velocity: rate.hips,
        shove: shoveOf(dir, push),
        first: { foot: free, earliest: contact + FIRST_AFTER * PUSH_T, brake: FIRST_BRAKE, heading: firstTurned },
        facing,
        until: setup.end - takeover + 0.1,
      });
      byPush.set(push, run);
    }
    return run;
  };

  // As hard a push as clears the board from under every foot coming down by it: the leg over a planted foot, shoe to knee.
  const clears = (track: BoardTrack, falls: Footfall[]) => {
    const r = LIMB_RADII;
    const k = body.scale;
    for (const f of falls) {
      if (f.on > track.start + (track.poses.length - 1) * track.dt) break;
      const ankle = add3(f.at, scale3(UP, ANKLE_IN_SHOE.u));
      const knee = add3(ankle, scale3(UP, 0.55 * leg));
      const heel = add3(f.at, scale3(f.heading, -SHOE_CAPSULE.half * k));
      const toe = add3(f.at, scale3(f.heading, SHOE_CAPSULE.half * k));
      for (let t = f.on - CLEAR_BEFORE; t <= Math.min(f.off, f.on + 0.3); t += 1 / 120) {
        const b = boardRigOf(boardAt(track, t));
        if (capsuleIntersectsBoard(b, ankle, knee, r.ankle * k, r.knee * k, CLEARANCE * k)) return false;
        if (capsuleIntersectsBoard(b, heel, toe, SHOE_CAPSULE.r * k, SHOE_CAPSULE.r * k, CLEARANCE * k)) return false;
      }
    }
    return true;
  };
  // The push goes across the board, the narrow way out from under the rider (out to the side of a flip, ahead of a board turned
  // across), away from where the free foot comes down, a little along the way they're going, and down.
  const still = runWith(travel, 0);
  // Down too hard or too fast to run it out, the rider rolls from the first foot down (rollOut.ts): on ground level enough
  // to roll across. Coming down onto a bank or a flight of stairs, they ride it out on their feet.
  const firstDown = still.footfalls[0];
  const level0 = ground(firstDown.at.x, firstDown.at.z);
  const flatAhead = Array.from({ length: ROLL_ROOM.samples + 1 }, (_, i) => (i / ROLL_ROOM.samples) * ROLL_ROOM.ahead * leg)
    .flatMap((d) => [-1, 0, 1].map((side) => add3(add3(firstDown.at, scale3(travel, d)), scale3(rightOf(travel), side * ROLL_ROOM.half * leg))))
    .every((p) => Math.abs(ground(p.x, p.z) - level0) <= ROLL_ROOM.rise * leg);
  const downV = runOutAt(still, firstDown.on - still.dt).velocity;
  const rolling = flatAhead && (rollsOut(downV, gravity, leg) || (setup.rollAbove != null && Math.hypot(downV.x, downV.y, downV.z) > setup.rollAbove * Math.sqrt(gravity * leg)));
  const rollBoard = boardRigOf(atContact);
  // Each run's roll, kept likewise.
  const rolls = new Map<RunOut, Roll>();
  const rollFrom = (from: RunOut): Roll => {
    const known = rolls.get(from);
    if (known) return known;
    const first = from.footfalls[0];
    const roll = rollOut({
      body,
      gravity,
      ground,
      start: first.on,
      hips: runOutAt(from, first.on).hips,
      velocity: runOutAt(from, first.on - from.dt).velocity,
      facing: facing(first.on),
      first: { foot: free, at: first.at, heading: first.heading },
      secondFrom: release + SECOND_AFTER,
      board: rollBoard,
    });
    rolls.set(from, roll);
    return roll;
  };
  // The board in the arms, trunk or head, keeping `gap` (a robot's) off them.
  const upperHit = (rig: Rig, b: BoardRig, gap: number) => {
    const k = body.scale;
    const hit = (a: V3, c: V3, ra: number, rc: number) => capsuleIntersectsBoard(b, a, c, ra * k, rc * k, gap * k);
    const neck = scale3(add3(rig.arms[0].shoulder, rig.arms[1].shoulder), 0.5);
    const { upperArm, forearm, hand, trunk, head } = LIMB_RADII;
    return rig.arms.some((a) => hit(a.shoulder, a.elbow, upperArm, forearm) || hit(a.elbow, a.hand, forearm, hand))
      || hit(scale3(add3(rig.legs[0].hip, rig.legs[1].hip), 0.5), neck, trunk, trunk) || hit(rig.head.origin, rig.head.origin, head, head);
  };
  // Rolling, the board keeps out of the whole body going over: limbs, trunk and head, from the touchdown till it's up. Counted
  // in frames it's in it (a sixtieth of a second each), up to `enough`.
  const rollHits = (track: BoardTrack, roll: Roll, enough = 1) => {
    const k = body.scale;
    const until = Math.min(roll.end + 0.3, track.start + (track.poses.length - 1) * track.dt);
    let hits = 0;
    for (let t = roll.start - CLEAR_BEFORE; t <= until && hits < enough; t += 1 / 60) {
      const b = boardRigOf(boardAt(track, t));
      const rig = rigOf(rollAt(roll, t).pose, body, b, 1, 1);
      const hit = (a: V3, c: V3, ra: number, rc: number) => capsuleIntersectsBoard(b, a, c, ra * k, rc * k, CLEARANCE * k);
      if (rig.legs.some((l) => hit(l.hip, l.knee, LIMB_RADII.hip, LIMB_RADII.knee) || hit(l.knee, l.ankle, LIMB_RADII.knee, LIMB_RADII.ankle)
          || hit(l.shoe.at(-SHOE_CAPSULE.half * k, 0, 0), l.shoe.at(SHOE_CAPSULE.half * k, 0, 0), SHOE_CAPSULE.r, SHOE_CAPSULE.r))
        || upperHit(rig, b, CLEARANCE)) hits++;
    }
    return hits;
  };
  const clearsRoll = (track: BoardTrack, roll: Roll) => rollHits(track, roll) === 0;
  // What the plan is whatever the push: each push tried is drawn as a plan of its own, with its board, run and roll.
  const shared: Omit<KickOutPlan, 'board' | 'push' | 'run' | 'roll'> = {
    setup, takeover, contact, release, error, kick, contactLocal, travel, facing, start, rate, startShoes, kickShoe,
    toeDir: rigNow.toeDir, rollIn: null, after: null,
  };
  // And out of the body as it's drawn, coming down (into a roll, till it starts) and over the first steps: the free leg from
  // the push, the kicking one's thigh (its foot and shin push on the board till it's let go), and arms, trunk and head.
  // Counted in a leg's frames in it, or the rest's (a hundred and twentieth of a second each), up to `enough`.
  const legHits = (track: BoardTrack, run: RunOut, push: number, roll: Roll | null, from: number, until: number, enough = 1) => {
    const trial: KickOutPlan = { ...shared, board: track, push, run, roll };
    const phase = runPhase(trial);
    const k = body.scale;
    // Further from the hips than a leg, an arm or the head reach, and the board's half, it's nowhere near them.
    const near = TIP_X + reach;
    let hits = 0;
    for (let t = from; t <= Math.min(until, track.start + (track.poses.length - 1) * track.dt) && hits < enough; t += 1 / 120) {
      const pose = boardAt(track, t);
      const hips = runOutAt(run, t).hips;
      if (Math.hypot(pose.center.x - hips.x, pose.center.y - hips.y, pose.center.z - hips.z) > near) continue;
      const b = boardRigOf(pose);
      const { rig } = onFeetAt(trial, phase, t, false);
      const { legs } = rig;
      for (let i = 0; i < 2; i++) {
        const l = legs[i];
        const kicking = i === kick && t < release + KICK_LETS_GO;
        if (capsuleIntersectsBoard(b, l.hip, l.knee, LIMB_RADII.hip * k, LIMB_RADII.knee * k, LEG_GAP * k)
          || (!kicking && (capsuleIntersectsBoard(b, l.knee, l.ankle, LIMB_RADII.knee * k, LIMB_RADII.ankle * k, LEG_GAP * k)
            || shoeIntersectsBoard(b, moveFrame(l.shoe, scale3(UP, SOLE_GRACE)))))) hits++;
      }
      if (upperHit(rig, b, LEG_GAP)) hits++;
    }
    return hits;
  };
  const clearsLegs = (track: BoardTrack, run: RunOut, push: number, roll: Roll | null, from: number, until: number) =>
    legHits(track, run, push, roll, from, until) === 0;
  const freeLand = still.footfalls[0].at;
  const narrow = rightOf(level(qrot(atContact.q, { x: 1, y: 0, z: 0 })));
  const fromFoot = dot3(sub3(atContact.center, freeLand), narrow);
  const outward = Math.abs(fromFoot) > 2 ? Math.sign(fromFoot) : (Math.sign(dot3(narrow, across) * -freeSide) || 1);
  const dirOf = (sign: number, along: number = PUSH_DIR.along) => norm3(add3(add3(scale3(narrow, sign * PUSH_DIR.out), scale3(travel, along)), scale3(UP, -PUSH_DIR.down)));
  const checkUntil = Math.min(setup.end, rolling ? still.footfalls[0].on + ROLL_CHECK : (still.footfalls[2]?.on ?? still.footfalls[1].on) + 0.3);
  // The legs coming down first, over the board's first moments, till the roll or just past the first foot down.
  const earlyOf = (run: RunOut) => Math.min(checkUntil, run.footfalls[0].on + (rolling ? -CLEAR_BEFORE : 0.1));
  /** The least push that way that clears the feet (or the rolling body), or Infinity. */
  const leastFor = (dir: V3) => {
    // Each push shoves the rider into a run of its own; the roll they come down into is much the same whichever (where the
    // kicking foot heads for, coming down), till the push found is checked with their own.
    const runFor = (push: number) => runWith(dir, push);
    const typical = runFor((PUSH.least + PUSH.most) / 2);
    const roll = rolling ? rollFrom(typical) : null;
    // The legs coming down first: where a push too weak to clear them mostly fails, and cheaply (the board's flight is the
    // same however far on it's followed).
    const clearsEarly = (push: number) => {
      const run = runFor(push);
      return clearsLegs(boardFor(dir, push, earlyOf(run)), run, push, roll, contact, earlyOf(run));
    };
    const clearsAfter = (push: number) => {
      const run = runFor(push);
      const track = boardFor(dir, push, checkUntil);
      if (!rolling) return clears(track, run.footfalls) && clearsLegs(track, run, push, null, earlyOf(run), checkUntil);
      // Into their own roll: the kicking foot coming down where it lands in it, and the whole body going over.
      const own = rollFrom(run);
      return clearsLegs(track, run, push, own, contact, earlyOf(run)) && clearsRoll(track, own);
    };
    const ok = (push: number) => clearsEarly(push) && clearsAfter(push);
    if (ok(PUSH.least)) return PUSH.least;
    if (!clearsEarly(PUSH.most)) return Infinity;
    const least = (lo: number, hi: number, clear: (push: number) => boolean) => {
      while (hi - lo > PUSH_STEP) {
        const mid = (lo + hi) / 2;
        if (clear(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    // Bisected on the legs coming down, then the rest checked once at the push found (a push that clears the legs nearly
    // always clears the rest, and checking it is the long part); where it doesn't, bisected on from there.
    let hi = least(PUSH.least, PUSH.most, clearsEarly);
    if (!clearsAfter(hi)) {
      if (!clearsAfter(PUSH.most)) return Infinity;
      hi = least(hi, PUSH.most, ok);
    }
    return hi;
  };
  // Out, the other way across (which may clear sooner), and where neither clears, back, either way.
  const ways = [dirOf(outward), dirOf(-outward), dirOf(outward, PUSH_DIR.back), dirOf(-outward, PUSH_DIR.back)];
  let pushDir = ways[0];
  let push = leastFor(pushDir);
  const tryWay = (dir: V3) => {
    const otherPush = leastFor(dir);
    if (otherPush < push) {
      pushDir = dir;
      push = otherPush;
    }
  };
  if (push > PUSH.least) tryWay(ways[1]);
  if (!Number.isFinite(push)) {
    tryWay(ways[2]);
    if (push > PUSH.least) tryWay(ways[3]);
  }
  if (!Number.isFinite(push)) {
    // Nothing clears them any way: the push that leaves the board in the legs coming down least, and of those (the
    // hardest first) in the rider after least.
    const tries = ways.flatMap((dir) => FALLBACK_PUSHES.map((p) => {
      const run = runWith(dir, p);
      const own = rolling ? rollFrom(run) : null;
      return { dir, p, run, own, hits: legHits(boardFor(dir, p, earlyOf(run)), run, p, own, contact, earlyOf(run), Infinity) };
    }));
    const fewest = Math.min(...tries.map((c) => c.hits));
    let least = Infinity;
    for (const { dir, p, run, own } of tries.filter((c) => c.hits === fewest)) {
      const track = boardFor(dir, p, checkUntil);
      const after = own ? rollHits(track, own, least) : legHits(track, run, p, null, earlyOf(run), checkUntil, least);
      if (after < least) {
        least = after;
        pushDir = dir;
        push = p;
      }
    }
  }
  const board = boardFor(pushDir, push, setup.end + 0.1);
  const run = runWith(pushDir, push);

  const plan: KickOutPlan = { ...shared, board, push, run, roll: null };
  if (!rolling) return plan;

  // ----- The roll, and up out of it -----
  const roll = rollFrom(run);
  plan.roll = roll;
  // Into it from the pose the rider came down in, given way by the time the hands take the weight: a fast roll comes down
  // onto them, and onto the shoulder after, sooner.
  plan.rollIn = blendAt(roll.start, (t) => onFeetAt(plan, runPhase(plan), t, false).pose, (t) => rollAt(roll, t).pose, Math.min(BLEND_T, (roll.hands - roll.start) / 4));
  // Up on both feet, square to the way they rolled, running off what speed is left.
  const up = (t: number) => rollAt(roll, t).pose;
  const end = up(roll.end);
  const was = up(roll.end - h);
  const exitRate: PoseRate = {
    hips: roll.exit.velocity,
    rot: { pelvis: rotRate(end.pelvis, was.pelvis), torso: rotRate(end.torso, was.torso), head: rotRate(end.head, was.head) },
  };
  const rolledOn = () => roll.travel;
  plan.after = {
    run: stepOut({
      body,
      gravity,
      ground,
      start: roll.end,
      hips: roll.exit.hips,
      velocity: roll.exit.velocity,
      planted: roll.exit.feet.map((shoe) => ({ at: shoe.at, heading: level(qrot(shoe.q, { x: 1, y: 0, z: 0 })) })),
      facing: rolledOn,
      until: Math.max(0.5, setup.end - roll.end + 0.1),
    }),
    facing: rolledOn,
    travel: roll.travel,
    from: roll.end,
    start: end,
    rate: exitRate,
    down: roll.start,
  };
  return plan;
}

/** The run from the takeover, as a stretch on the feet. */
const runPhase = (plan: KickOutPlan): FeetPhase => ({
  run: plan.run,
  facing: plan.facing,
  travel: plan.travel,
  from: plan.takeover,
  start: plan.start,
  rate: plan.rate,
  down: plan.run.footfalls[0].on,
});

/** The parts of a pose `from` is off `to` by. */
function offsets(from: BodyPose, to: BodyPose): V3[] {
  const turnOff = (a: Quat, b: Quat) => qlog(qmul(a, qconj(b)));
  return [
    turnOff(from.pelvis, to.pelvis),
    turnOff(from.torso, to.torso),
    turnOff(from.head, to.head),
    sub3(from.arms[0].upper, to.arms[0].upper),
    sub3(from.arms[0].fore, to.arms[0].fore),
    sub3(from.arms[1].upper, to.arms[1].upper),
    sub3(from.arms[1].fore, to.arms[1].fore),
    sub3(from.knees[0], to.knees[0]),
    sub3(from.knees[1], to.knees[1]),
  ];
}

/** Going from one motion (`from`, up to `at`) into another (`to`, from `at`): the offsets between them then, and how fast each was changing on its own side. */
function blendAt(at: number, from: (t: number) => BodyPose, to: (t: number) => BodyPose, over = BLEND_T): Blend {
  const h = 1 / 240;
  // The one motion as it came up to `at` (a step it takes right there is the other's to make), the other as it leaves.
  const before = at - 1e-6;
  const a = from(before);
  const b = to(at);
  const offset = offsets(a, b);
  const fromSide = offsets(from(before - h), b);
  const toSide = offsets(a, to(at + h));
  return { at, offset, rate: offset.map((o, i) => scale3(add3(sub3(o, fromSide[i]), sub3(toSide[i], o)), 1 / h)), over };
}

/** A pose with a blend's offsets, dying away, put back on. */
function blended(pose: BodyPose, blend: Blend | null, t: number): BodyPose {
  const tau = blend ? t - blend.at : -1;
  if (!blend || tau < 0 || tau > 10 * blend.over) return pose;
  const o = blend.offset.map((x, i) => decay3(x, blend.rate[i], tau, blend.over));
  return {
    ...pose,
    pelvis: qnorm(qmul(qexp(o[0]), pose.pelvis)),
    torso: qnorm(qmul(qexp(o[1]), pose.torso)),
    head: qnorm(qmul(qexp(o[2]), pose.head)),
    arms: [
      { upper: norm3(add3(pose.arms[0].upper, o[3])), fore: norm3(add3(pose.arms[0].fore, o[4])) },
      { upper: norm3(add3(pose.arms[1].upper, o[5])), fore: norm3(add3(pose.arms[1].fore, o[6])) },
    ],
    knees: [norm3(add3(pose.knees[0], o[7])), norm3(add3(pose.knees[1], o[8]))],
  };
}

/** Where the rider's hips are at clock t (at or after the takeover), on the street, and how fast they're going. */
export function hipsAt(plan: KickOutPlan, t: number): { hips: V3; velocity: V3 } {
  const { roll, after } = plan;
  if (roll && t >= roll.start && (t < roll.end || !after)) {
    const sample = rollAt(roll, t);
    return { hips: sample.pose.hips, velocity: sample.velocity };
  }
  const sample = runOutAt(roll && after && t >= roll.end ? after.run : plan.run, t);
  return { hips: sample.hips, velocity: sample.velocity };
}

// ----- Posing -----

/** The steepest a planted sole lies along the ground (as a slope's rise over its run). */
const STEEPEST_REST = 0.7;
/** How a shoe planted at each footfall lies, the way its side points, and where it is. */
interface Rest { q: Quat; side: V3; at: V3 }
const RESTS = new WeakMap<Footfall, Rest>();

/**
 * How a shoe planted at `fall` lies: on the ground under it, the one even slope through it heel to toe and side to side
 * (on a bank, toe down it running down and up it running up), toe along its heading.
 */
function restOf(plan: KickOutPlan, fall: Footfall): Rest {
  const known = RESTS.get(fall);
  if (known) return known;
  const g = plan.setup.ground;
  const k = plan.setup.body.scale;
  const half = SHOE_HALF_LENGTH * k;
  const wide = SOLE_HALF_WIDTH * k;
  const right = rightOf(fall.heading);
  const at = (along: number, across: number) => {
    const p = add3(add3(fall.at, scale3(fall.heading, along)), scale3(right, across));
    return g(p.x, p.z);
  };
  // How far down (y is down) the ground goes a unit toward the toe, and a unit to the right.
  const steep = (d: number) => Math.max(-STEEPEST_REST, Math.min(STEEPEST_REST, d));
  const down = steep((at(half, 0) - at(-half, 0)) / (2 * half));
  const aside = steep((at(0, wide) - at(0, -wide)) / (2 * wide));
  let rest: Rest = { q: qframe(fall.heading, UP), side: right, at: fall.at };
  if (down !== 0 || aside !== 0) {
    const fwd = norm3({ ...fall.heading, y: down });
    const side = norm3({ ...right, y: aside });
    const up = cross3(fwd, side);
    const q = qframe(fwd, up.y < 0 ? up : scale3(up, -1));
    // Its sole just on the ground: the deepest of heel, middle and toe on it, wherever the step's height was found.
    const into = Math.max(...[-half, 0, half].map((x) => {
      const sole = add3(fall.at, qrot(q, { x, y: SHOE_HALF_HEIGHT, z: 0 }));
      return sole.y - g(sole.x, sole.z);
    }));
    rest = { q, side: qrot(q, { x: 0, y: 0, z: 1 }), at: Math.abs(into) > 0.05 ? add3(fall.at, scale3(UP, into)) : fall.at };
  }
  RESTS.set(fall, rest);
  return rest;
}

/**
 * A shoe on the ground lying `rest`, its sole rolled `pitch` degrees (toe up positive) about a point `pivot` along it (a robot's):
 * a stiff sole, so the end the roll takes down is kept on the ground and the pivot comes up off it instead.
 */
function plantedShoe(plan: KickOutPlan, rest: Rest, pitchDeg: number, pivot: number): ShoePose {
  const flat = rest.q;
  if (Math.abs(pitchDeg) < 1e-3) return { at: rest.at, q: flat };
  const { side } = rest;
  const k = plan.setup.body.scale;
  // Toe up turns the fwd axis toward up: about -side in physics' left-handed frames... worked out directly.
  const turn = qaxis(side, (-pitchDeg * Math.PI) / 180);
  const q = qnorm(qmul(turn, flat));
  // The pivot (on the sole, `pivot` along the shoe) stays put.
  const sole = (rot: Quat, x: number, at = rest.at) => add3(at, qrot(rot, { x, y: SHOE_HALF_HEIGHT, z: 0 }));
  const at = add3(rest.at, sub3(sole(flat, pivot * k), sole(q, pivot * k)));
  const g = plan.setup.ground;
  const half = SHOE_HALF_LENGTH * k;
  const into = Math.max(0, ...[-half, half].map((x) => {
    const p = sole(q, x, at);
    return p.y - g(p.x, p.z);
  }));
  return { at: into > 0 ? add3(at, scale3(UP, into)) : at, q };
}

/** Heel strike and toe-off, as degrees the sole is rolled and about where (a robot's). */
const HEEL = -9;
const BALL = 7;
const HEEL_STRIKE = 9;
const TOE_OFF = 24;

/** A planted foot at `t`. */
function standing(plan: KickOutPlan, run: RunOut, fall: Footfall, t: number): ShoePose {
  const rest = restOf(plan, fall);
  // Heel first onto a step it swung to; flat down from the air.
  const swung = fall.kind === 'step' && run.footfalls.some((f) => f.foot === fall.foot && f.on < fall.on);
  const strike = swung ? HEEL_STRIKE * (1 - smoothstep((t - fall.on) / 0.07)) : 0;
  if (strike > 0.01) return plantedShoe(plan, rest, strike, HEEL);
  if (fall.off !== Infinity) {
    const span = Math.max(0.05, fall.off - fall.on);
    const k = smoothstep((t - (fall.off - span * 0.45)) / (span * 0.45));
    if (k > 0) return plantedShoe(plan, rest, -TOE_OFF * k, BALL);
  }
  return { at: rest.at, q: rest.q };
}

/** The most the deck turning under the kicking foot carries it up (world units, a robot's). */
const DECK_CARRY = 30;

/**
 * The kicking shoe on the board, pushing: on the spot it met, and carried up by the deck where the board turning under the
 * sole comes up into it (the least that keeps the sole on top of whatever's under it, which turns no faster than the board).
 */
function onDeck(plan: KickOutPlan, t: number): ShoePose {
  const b = boardAt(plan.board, t);
  const at = add3(add3(b.center, qrot(b.q, plan.contactLocal)), qrot(plan.kickShoe, { x: 0, y: -SHOE_HALF_HEIGHT, z: 0 }));
  const board = boardRigOf(b);
  const inDeck = (by: number) => shoeIntersectsBoard(board, frameFrom(add3(at, scale3(UP, by + SOLE_GRACE)), plan.kickShoe));
  if (!inDeck(0)) return { at, q: plan.kickShoe };
  const by = bisect(0, DECK_CARRY * plan.setup.body.scale, 14, (up) => !inDeck(up)).hi;
  return { at: add3(at, scale3(UP, by)), q: plan.kickShoe };
}

/** Where the kicking foot meets the board and how it's coming down onto it, and where it leaves it and how it's going. */
interface KickEnds { meet: V3; meetV: V3; leave: V3; leaveV: V3 }
/**
 * Each board track's, worked out once: they're the same every frame, and finding where the foot leaves the deck is a
 * search. (A track is one kick-out's: its push, or the plan's own.)
 */
const KICK_ENDS = new WeakMap<BoardTrack, KickEnds>();

function kickEnds(plan: KickOutPlan): KickEnds {
  const known = KICK_ENDS.get(plan.board);
  if (known) return known;
  const { contact, release } = plan;
  const meetB = boardMotionAt(plan.board, contact);
  const meetPointV = add3(meetB.velocity, cross3(meetB.spin, qrot(meetB.q, plan.contactLocal)));
  const leaveB = boardMotionAt(plan.board, release);
  const leavePointV = add3(leaveB.velocity, cross3(leaveB.spin, qrot(leaveB.q, plan.contactLocal)));
  const ends: KickEnds = {
    meet: add3(add3(meetB.center, qrot(meetB.q, plan.contactLocal)), qrot(plan.kickShoe, { x: 0, y: -SHOE_HALF_HEIGHT, z: 0 })),
    meetV: add3(meetPointV, { x: 0, y: 40, z: 0 }),
    leave: onDeck(plan, release).at,
    leaveV: scale3(leavePointV, 0.35),
  };
  KICK_ENDS.set(plan.board, ends);
  return ends;
}

/** The kicking foot from the takeover until it's down (`land`): onto the board where it will be, pushing it, and off it to the ground. */
function kickShoeAt(plan: KickOutPlan, t: number, land: { at: V3; q: Quat; on: number }): ShoePose {
  const { takeover, contact, release } = plan;
  const shoe0 = plan.startShoes[plan.kick];
  if (t < contact) {
    // Down onto the board where it will be.
    const { meet, meetV } = kickEnds(plan);
    const s = (t - takeover) / (contact - takeover);
    return { at: hermite3(shoe0.at, shoe0.velocity, meet, meetV, contact - takeover, s), q: qslerp(shoe0.q, plan.kickShoe, minJerk(s)) };
  }
  if (t < release) return onDeck(plan, t);
  // Off it, and down to the ground.
  const { leave, leaveV } = kickEnds(plan);
  const s = clamp01((t - release) / (land.on - release));
  return { at: hermite3(leave, leaveV, land.at, { x: 0, y: 0, z: 0 }, land.on - release, s), q: qslerp(plan.kickShoe, land.q, minJerk(s)) };
}

/** A shoe where it stood on the board at the takeover, carried with the board at `t`. */
function onBoard(plan: KickOutPlan, shoe0: { at: V3; q: Quat }, t: number): ShoePose {
  const was = boardAt(plan.board, plan.takeover);
  const now = boardAt(plan.board, t);
  const turn = qmul(now.q, qconj(was.q));
  return { at: add3(now.center, qrot(turn, sub3(shoe0.at, was.center))), q: qnorm(qmul(turn, shoe0.q)) };
}

/** The shoe of foot `i` at `t`, over a run. */
function shoeAt(plan: KickOutPlan, run: RunOut, i: 0 | 1, t: number): ShoePose {
  const { startShoes, takeover } = plan;
  const mine = run.footfalls.filter((f) => f.foot === i);
  const now = mine.find((f) => f.on <= t && t < f.off);
  if (now) return standing(plan, run, now, t);
  const next = mine.find((f) => f.on > t);
  const last = [...mine].reverse().find((f) => f.off <= t);
  const shoe0 = startShoes[i];
  if (!last) {
    // Not yet down: in the air from the takeover.
    const land = next ?? mine[0];
    const { at: landAt, q: landQ } = restOf(plan, land);
    if (i === plan.kick) return kickShoeAt(plan, t, { at: landAt, q: landQ, on: land.on });
    const arrive = { x: 0, y: 0.35 * Math.max(0, runOutAt(run, land.on - 0.01).velocity.y), z: 0 };
    if (plan.setup.jump) {
      // Jumping off a rail, the free foot stays on the deck, carried with it, while the legs throw the body up off it;
      // it comes away as the other meets the board to kick it off, and reaches for the ground from there.
      const leaves = plan.contact;
      if (t < leaves) return onBoard(plan, shoe0, t);
      const from = onBoard(plan, shoe0, leaves);
      const h = 1 / 240;
      const fromV = scale3(sub3(from.at, onBoard(plan, shoe0, leaves - h).at), 1 / h);
      const s = (t - leaves) / (land.on - leaves);
      return { at: hermite3(from.at, fromV, landAt, arrive, land.on - leaves, s), q: qslerp(from.q, landQ, minJerk(s)) };
    }
    // The free foot reaches from the tuck straight for the ground, coming down onto it with the body.
    const s = (t - takeover) / (land.on - takeover);
    return { at: hermite3(shoe0.at, shoe0.velocity, landAt, arrive, land.on - takeover, s), q: qslerp(shoe0.q, landQ, minJerk(s)) };
  }
  if (!next) return standing(plan, run, last, t);
  // Swinging from one step to the next: toe off, up and through, heel down; and up over any edge on the way.
  const fromShoe = standing(plan, run, last, last.off - 1e-6);
  const toShoe = plantedShoe(plan, restOf(plan, next), HEEL_STRIKE, HEEL);
  const s = (t - last.off) / (next.on - last.off);
  const k = minJerk(s);
  const leg = plan.setup.body.thigh + plan.setup.body.shin;
  // A quick step swings low: it's lifted no higher than it has time for.
  const quick = Math.min(1, (next.on - last.off) / (0.5 * Math.sqrt(leg / plan.setup.gravity)));
  const liftAt = (u: number, v: number) => leg * (0.1 + 0.08 * Math.min(1, v / 300)) * quick * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.3;
  const speed = (u: number) => {
    const v = runOutAt(run, last.off + u * (next.on - last.off)).velocity;
    return Math.hypot(v.x, v.z);
  };
  const over = swingOver(plan, next, fromShoe, toShoe, (u) => liftAt(u, speed(u)));
  const v = runOutAt(run, t).velocity;
  const lift = liftAt(s, Math.hypot(v.x, v.z)) + (over.most ? over.most * overShape(s, over.a) : 0);
  const at = add3(add3(fromShoe.at, scale3(sub3(toShoe.at, fromShoe.at), k)), scale3(UP, lift));
  return { at, q: qslerp(fromShoe.q, toShoe.q, k) };
}

/** How far over the ground a swinging sole keeps (world units, a robot's), where the ground comes up into its way. */
const SWING_GAP = 1.5;
const SWING_SAMPLES = 48;
/** A swing's extra lift over its way, by the step it comes down in: how high at the most, and how late (`overShape`'s power). */
const SWING_OVER = new WeakMap<Footfall, { most: number; a: number }>();

/** A hump from nothing to 1 and back, soft at both ends, its top where s^a is a half. */
const overShape = (s: number, a: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, s)) ** a) ** 2;

/**
 * The extra lift a swing straight from `from` to `to` needs to keep its sole out of the ground on the way: off the end of a
 * bank or over a stair's nose, where the straight way cuts through the edge. As deep as the sole would go below the line
 * between where it starts and ends (the ground that's level, or one even slope, needs none), with its top where it's
 * deepest, over the swing's own `lift`.
 */
function swingOver(plan: KickOutPlan, next: Footfall, from: ShoePose, to: ShoePose, lift: (s: number) => number) {
  const known = SWING_OVER.get(next);
  if (known) return known;
  const g = plan.setup.ground;
  const k = plan.setup.body.scale;
  const half = SHOE_HALF_LENGTH * k;
  // How far the sole is into the ground (y is down), the most of heel, middle and toe.
  const into = (s: number) => {
    const m = minJerk(s);
    const at = add3(add3(from.at, scale3(sub3(to.at, from.at), m)), scale3(UP, lift(s)));
    const q = qslerp(from.q, to.q, m);
    return Math.max(...[-half, 0, half].map((x) => {
      const p = add3(at, qrot(q, { x, y: SHOE_HALF_HEIGHT, z: 0 }));
      return p.y - g(p.x, p.z);
    }));
  };
  const start = into(0);
  const end = into(1);
  const deep = Array.from({ length: SWING_SAMPLES - 1 }, (_, j) => {
    const s = (j + 1) / SWING_SAMPLES;
    return { s, d: into(s) - (start + (end - start) * s) };
  });
  let over = { most: 0, a: 1 };
  if (deep.some(({ d }) => d > 0.5)) {
    // The least hump over every bit of the way that's in the ground, its top wherever that's least.
    const sinks = deep.filter(({ d }) => d > 0);
    for (let top = 0.3; top <= 0.9 + 1e-9; top += 0.05) {
      const a = Math.log(0.5) / Math.log(top);
      const most = Math.max(...sinks.map(({ s, d }) => (d + SWING_GAP * k) / Math.max(1e-3, overShape(s, a))));
      if (!over.most || most < over.most) over = { most, a };
    }
  }
  SWING_OVER.set(next, over);
  return over;
}

/** The most a foot coming down by the board lifts over it, and the gap it keeps (world units, a robot's). */
const MOST_OVER = 40;
const OVER_GAP = 1.5;
const OVER_SAMPLES = 24;
/** How fast (world units a second, a robot's) a foot pulls up off the board or goes back down, at the most: a quick tuck. */
const OVER_SPEED = 500;
/**
 * A foot's lift over the board coming down past it: over which stretch, how high at the most, and when it's up and when it
 * starts down again (as parts of the stretch).
 */
interface Lift { from: number; to: number; most: number; up: number; down: number }
const LIFTS = new WeakMap<KickOutPlan, [Lift | null, Lift | null]>();

/** A lift's height at `u` of the way, as a part of its most: easing up till `up`, held, and easing down from `down`. */
const liftShape = (u: number, up: number, down: number) =>
  u <= 0 || u >= 1 ? 0 : u < up ? smoothstep(u / up) : u <= down ? 1 : 1 - smoothstep((u - down) / (1 - down));

/** Whether a leg's shin or shoe is in the board as the plan checks it (a sole may sit a little into the grip), short of `gap`. */
function legInBoard(leg: LegRig, board: BoardRig, k: number, gap: number): boolean {
  return capsuleIntersectsBoard(board, leg.knee, leg.ankle, LIMB_RADII.knee * k, LIMB_RADII.ankle * k, (LEG_GAP + gap) * k)
    || shoeIntersectsBoard(board, moveFrame(leg.shoe, scale3(UP, SOLE_GRACE)), gap * k);
}

/** How far round (radians, off the chest) something is that the head turns all it can to look at. */
const LOOK_ROUND_MOST = 1.4;

/** The tightest a knee folds, as how near the ankle comes to the hip over the leg's length (about 145° of bend). */
const FOLD = 0.3;
/** How softly (world units, a robot's) a foot comes up against the fold: eased in over this much either side, never stopped dead. */
const FOLD_EASE = 5;
/** max(0, x), eased over ±w: a foot running into a limit slows into it. */
const softRamp = (x: number, w: number) => (x >= w ? x : x <= -w ? 0 : ((x + w) * (x + w)) / (4 * w));

/** How far round its hip-ankle line a knee turns out at the most (radians) to keep out of the ground. */
const KNEE_TURN_MOST = 1.3;
/** How far over the ground (world units, a robot's) a knee is clear of it whatever the ground does round it: a step's height. */
const KNEE_CLEAR = 40;
/** Samples a side of the patch of ground under a knee its height is averaged over. */
const KNEE_PATCH = 7;
/** How long (seconds) a knee takes to turn out before it has to be out, and to come back after. */
const KNEE_TURN_T = 0.15;
/** How many times a second the plan looks for a knee going into the ground. */
const KNEE_LOOKS = 60;
/** Each leg's knee turns, per stretch on the feet (by when it starts): how far it has to be turned out, and when. */
type KneeTurns = [{ t: number; by: number }[], { t: number; by: number }[]];
const KNEE_TURNS = new WeakMap<KickOutPlan, Map<number, KneeTurns>>();

/** The ground's height under a knee at `p`: averaged over the patch it covers, so it climbs a step's edge rather than jumping. */
function groundUnderKnee(ground: (x: number, z: number) => number, p: V3, r: number): number {
  let sum = 0;
  for (let i = 0; i < KNEE_PATCH; i++) {
    for (let j = 0; j < KNEE_PATCH; j++) sum += ground(p.x + r * ((2 * i) / (KNEE_PATCH - 1) - 1), p.z + r * ((2 * j) / (KNEE_PATCH - 1) - 1));
  }
  return sum / (KNEE_PATCH * KNEE_PATCH);
}

/**
 * A knee turned out `by` round its hip-ankle line, toward `out`: no further than pointing straight out (so a knee pointing
 * nearly that way already barely turns, whichever way round that is).
 */
function kneeTurnedOut(leg: LegRig, out: V3, by: number): LegRig {
  if (by <= 0) return leg;
  const axis = norm3(sub3(leg.ankle, leg.hip));
  const rel = sub3(leg.knee, leg.hip);
  const off = sub3(rel, scale3(axis, dot3(rel, axis)));
  const outOff = sub3(out, scale3(axis, dot3(out, axis)));
  const toOut = Math.atan2(dot3(axis, cross3(off, outOff)), dot3(off, outOff));
  const turn = Math.sign(toOut) * Math.min(by, KNEE_TURN_MOST, Math.abs(toOut));
  return turn ? { ...leg, knee: add3(leg.hip, qrot(qaxis(axis, turn), rel)) } : leg;
}

/** The least turn out (radians) that keeps a knee its radius over the ground, or as far as it turns. */
function kneeTurnNeeded(leg: LegRig, out: V3, ground: (x: number, z: number) => number, k: number): number {
  const r = LIMB_RADII.knee * k;
  if (ground(leg.knee.x, leg.knee.z) - leg.knee.y > r + KNEE_CLEAR * k) return 0;
  const over = (by: number) => {
    const { knee } = kneeTurnedOut(leg, out, by);
    return groundUnderKnee(ground, knee, r) - knee.y - r;
  };
  if (over(0) >= 0) return 0;
  if (over(KNEE_TURN_MOST) < 0) return KNEE_TURN_MOST;
  return bisect(0, KNEE_TURN_MOST, 14, (by) => over(by) >= 0).hi;
}

/**
 * Where each knee has to turn out over a stretch on the feet to keep out of the ground: a deep landing on a step, facing up
 * the stairs, would put a knee into the one above. Found ahead (as the legs go unturned), so it turns out smoothly in time.
 */
function kneeTurnsOf(plan: KickOutPlan, phase: FeetPhase, to: number): KneeTurns {
  let byPhase = KNEE_TURNS.get(plan);
  if (!byPhase) KNEE_TURNS.set(plan, (byPhase = new Map()));
  const known = byPhase.get(phase.from);
  if (known) return known;
  const { ground, body } = plan.setup;
  const turns: KneeTurns = [[], []];
  for (let t = phase.from; t <= to + 1e-9; t += 1 / KNEE_LOOKS) {
    const { rig, pose } = onFeetAt(plan, phase, t, false);
    const side = qrot(pose.pelvis, { x: 0, y: 0, z: 1 });
    rig.legs.forEach((leg, i) => {
      const by = kneeTurnNeeded(leg, scale3(side, i === 0 ? -1 : 1), ground, body.scale);
      if (by > 0) turns[i].push({ t, by });
    });
  }
  byPhase.set(phase.from, turns);
  return turns;
}

/** How far a knee's turned out at clock `t`: every turn it needs eased in ahead and out after. */
function kneeTurnAt(turns: { t: number; by: number }[], t: number): number {
  let by = 0;
  for (const turn of turns) by = Math.max(by, turn.by * (1 - smoothstep(Math.abs(t - turn.t) / KNEE_TURN_T)));
  return by;
}

/** A shoe brought down (as far as the ground lets it) till its ankle's a knee's fold from the `hip`, and below it. */
function belowFold(plan: KickOutPlan, shoe: ShoePose, hip: V3): ShoePose {
  const { body, ground } = plan.setup;
  const fold = FOLD * (body.thigh + body.shin);
  const ankle = ankleOf(shoe);
  const across = Math.hypot(ankle.x - hip.x, ankle.z - hip.z);
  const k = body.scale;
  const need = softRamp(Math.sqrt(Math.max(0, fold * fold - across * across)) - (ankle.y - hip.y), FOLD_EASE * k);
  if (need <= 0) return shoe;
  const half = SHOE_HALF_LENGTH * k;
  const room = Math.min(...[-half, 0, half].map((x) => {
    const p = add3(shoe.at, qrot(shoe.q, { x, y: SHOE_HALF_HEIGHT, z: 0 }));
    return ground(p.x, p.z) - p.y;
  })) - SWING_GAP * k;
  const by = need - softRamp(need - room, FOLD_EASE * k);
  return by > 0 ? { ...shoe, at: add3(shoe.at, scale3(UP, -by)) } : shoe;
}

/**
 * A leg with its foot lifted `by`, the knee bent to keep the bones: still bending the way it did, about the same axis (the
 * knee itself is no guide, the ankle coming up past where it was).
 */
function raisedLeg(leg: LegRig, by: number, body: BodyDims): LegRig {
  // No higher than the knee folds: the ankle stays its fold away from the hip, and below it.
  const fold = FOLD * (body.thigh + body.shin);
  const across = Math.hypot(leg.ankle.x - leg.hip.x, leg.ankle.z - leg.hip.z);
  by -= softRamp(by - (leg.ankle.y - leg.hip.y - Math.sqrt(Math.max(0, fold * fold - across * across))), FOLD_EASE * body.scale);
  if (by <= 0) return leg;
  const up = scale3(UP, by);
  const ankle = add3(leg.ankle, up);
  const was = sub3(leg.ankle, leg.hip);
  const axis = cross3(was, sub3(leg.knee, leg.hip));
  const bent = Math.hypot(axis.x, axis.y, axis.z) > 1e-6 * dot3(was, was);
  const pole = bent ? cross3(axis, sub3(ankle, leg.hip)) : sub3(leg.knee, leg.hip);
  return { ...leg, ankle, knee: twoBone(leg.hip, ankle, body.thigh, body.shin, pole), shoe: moveFrame(leg.shoe, up) };
}

/**
 * How each foot lifts over the board coming down past it: the free one from the takeover, the kicking one from letting go of
 * it, each till it's down (or the roll starts). One hump each, the least that keeps the leg out of the board all the way
 * (where lifting it can), so it's up before the board comes under it and down only once it's gone.
 */
function liftsOf(plan: KickOutPlan): [Lift | null, Lift | null] {
  const known = LIFTS.get(plan);
  if (known) return known;
  // The legs found as they'd go unlifted: onFeetAt finds no lift for now.
  LIFTS.set(plan, [null, null]);
  const { setup, run, roll, kick, takeover, release } = plan;
  const { body } = setup;
  const k = body.scale;
  const phase = runPhase(plan);
  const lifts = ([0, 1] as const).map((i): Lift | null => {
    const from = i === kick ? release : takeover;
    const down = run.footfalls.find((f) => f.foot === i)?.on ?? Infinity;
    const to = Math.min(down, roll ? roll.start : Infinity, setup.end);
    if (!(to > from + 0.02)) return null;
    // How far it must lift at each bit of the way to be out of the board.
    const need: { u: number; by: number }[] = [];
    for (let j = 1; j <= OVER_SAMPLES; j++) {
      const u = j / (OVER_SAMPLES + 1);
      const { rig, board } = onFeetAt(plan, phase, from + u * (to - from), false);
      const leg = rig.legs[i];
      if (!legInBoard(leg, board, k, OVER_GAP) || legInBoard(raisedLeg(leg, MOST_OVER * k, body), board, k, OVER_GAP)) continue;
      need.push({ u, by: bisect(0, MOST_OVER * k, 12, (by) => !legInBoard(raisedLeg(leg, by, body), board, k, OVER_GAP)).hi });
    }
    if (!need.length) return null;
    // The least lift over all of it no faster than a tuck, up and down when that's least; or where none's slow enough, the
    // slowest, only as high as it can go that fast.
    const span = to - from;
    const fastest = OVER_SPEED * k;
    let best: Lift | null = null;
    let slowest: (Lift & { speed: number }) | null = null;
    for (let up = 0.05; up <= 0.7 + 1e-9; up += 0.05) {
      for (let down = up; down <= 0.95 + 1e-9; down += 0.05) {
        const most = Math.min(MOST_OVER * k, Math.max(...need.map(({ u, by }) => by / Math.max(1e-3, liftShape(u, up, down)))));
        // Smoothstep's steepest is half again its average.
        const speed = (1.5 * most) / (span * Math.min(up, 1 - down));
        if (speed <= fastest && (!best || most < best.most)) best = { from, to, most, up, down };
        if (!slowest || speed < slowest.speed) slowest = { from, to, most, up, down, speed };
      }
    }
    if (best) return best;
    const { speed, ...lift } = slowest!;
    return { ...lift, most: (lift.most * fastest) / speed };
  }) as [Lift | null, Lift | null];
  LIFTS.set(plan, lifts);
  return lifts;
}

const liftAt = (lift: Lift | null, t: number) => (lift ? lift.most * liftShape((t - lift.from) / (lift.to - lift.from), lift.up, lift.down) : 0);

/** Arm poses. */
const ARMS_BALANCE: Record<'kick' | 'other', ArmPose> = {
  kick: { out: 62, swing: -24, elbow: 34 },
  other: { out: 70, swing: 22, elbow: 40 },
};
const ARMS_BRACE: ArmPose = { out: 34, swing: 38, elbow: 36 };
const ARMS_STAND: ArmPose = { out: 9, swing: 4, elbow: 16 };

export interface KickOutFrame {
  /** The rider, on the street. */
  rig: Rig;
  board: BoardRig;
  wheel: number;
  /** Where the eyes are, on the street. */
  gaze: V3;
  expression: Expression;
  /** The hips' height over the ground, and the board's. */
  bodyHeight: number;
}

/** The rider and board at clock `t` (at or after the takeover), on the street. */
export function kickOutAt(plan: KickOutPlan, t: number): KickOutFrame {
  const { roll, after } = plan;
  if (!roll || t < roll.start) return onFeetAt(plan, runPhase(plan), t);
  if (t < roll.end || !after) return rollingAt(plan, roll, t);
  return onFeetAt(plan, after, t);
}

/** The most a heel comes up off the ground (degrees, onto the ball of the foot) to keep a foot within its leg's reach. */
const HEEL_UP_MOST = 40;

/**
 * Keeps every foot within its leg's reach: the heel comes up off the ground first, onto the ball of the foot (as a foot
 * the body's gone on past does), and only past that does the foot come along.
 */
function inReach(shoes: [ShoePose, ShoePose], hips: V3, pelvis: Quat, body: BodyDims): [ShoePose, ShoePose] {
  return shoes.map((shoe, i) => {
    const hip = add3(hips, scale3(qrot(pelvis, { x: 0, y: 0, z: 1 }), (i === 0 ? -1 : 1) * body.hipHalf));
    const most = (body.thigh + body.shin) * 0.995;
    const reachOf = (s: ShoePose) => Math.hypot(ankleOf(s).x - hip.x, ankleOf(s).y - hip.y, ankleOf(s).z - hip.z);
    if (reachOf(shoe) <= most) return shoe;
    const side = qrot(shoe.q, { x: 0, y: 0, z: 1 });
    const ball = add3(shoe.at, qrot(shoe.q, { x: BALL * body.scale, y: SHOE_HALF_HEIGHT, z: 0 }));
    const heelUp = (deg: number): ShoePose => {
      const turn = qaxis(side, (deg * Math.PI) / 180);
      return { at: add3(ball, qrot(turn, sub3(shoe.at, ball))), q: qnorm(qmul(turn, shoe.q)) };
    };
    let lifted = shoe;
    if (reachOf(heelUp(HEEL_UP_MOST)) < reachOf(shoe)) {
      const fits = (deg: number) => reachOf(heelUp(deg)) <= most;
      lifted = heelUp(fits(HEEL_UP_MOST) ? bisect(0, HEEL_UP_MOST, 16, fits).hi : HEEL_UP_MOST);
    }
    const d = sub3(ankleOf(lifted), hip);
    const len = Math.hypot(d.x, d.y, d.z);
    return len > most ? { ...lifted, at: sub3(lifted.at, scale3(d, (len - most) / len)) } : lifted;
  }) as [ShoePose, ShoePose];
}

/** Where the eyes are going rolling: the way the face points. */
const alongFace = (rig: Rig, leg: number): V3 => add3(rig.head.origin, scale3(rig.head.fwd, 3 * leg));

/** The rider rolling: the roll's pose, blended in from the one they came down in, the kicking foot on its way down beside the other. */
/** A shoe lifted (straight up) as far as its sole's lowest point, heel to toe, has gone into the ground. */
function outOfGround(shoe: ShoePose, ground: (x: number, z: number) => number, k: number): ShoePose {
  let deepest = 0;
  for (const x of [-1, -0.5, 0, 0.5, 1]) {
    const p = add3(shoe.at, qrot(shoe.q, { x: x * SHOE_HALF_LENGTH * k, y: -SHOE_HALF_HEIGHT, z: 0 }));
    deepest = Math.max(deepest, p.y - ground(p.x, p.z));
  }
  return deepest > 0 ? { at: add3(shoe.at, scale3(UP, deepest)), q: shoe.q } : shoe;
}

function rollingAt(plan: KickOutPlan, roll: Roll, t: number): KickOutFrame {
  const { setup, kick } = plan;
  const { body } = setup;
  const leg = body.thigh + body.shin;
  const sample = rollAt(roll, t);
  const pose = blended(sample.pose, plan.rollIn, t);
  const land = roll.landing[kick];
  const shoes = [...pose.shoes] as [ShoePose, ShoePose];
  if (t < land.on) shoes[kick] = kickShoeAt(plan, t, { at: land.shoe.at, q: land.shoe.q, on: land.on });
  // A foot peeling off the ground as the body goes over it is kept on it, not tipped into it.
  pose.shoes = inReach(shoes, pose.hips, pose.pelvis, body).map((shoe) => outOfGround(shoe, setup.ground, body.scale)) as [ShoePose, ShoePose];
  const boardPose = boardAt(plan.board, t);
  const board = boardRigOf(boardPose);
  const rig = rigOf(pose, body, board, plan.toeDir, 1);
  for (const legRig of rig.legs) {
    // A knee the solve would put into the ground (coming over fast, folded) is turned up out of it, its foot and hip kept.
    const pole = sub3(legRig.knee, legRig.hip);
    legRig.knee = twoBone(legRig.hip, legRig.ankle, body.thigh, body.shin, pole);
    for (let n = 1; n <= 8 && setup.ground(legRig.knee.x, legRig.knee.z) - legRig.knee.y < KNEE_OVER_GROUND; n++) {
      legRig.knee = twoBone(legRig.hip, legRig.ankle, body.thigh, body.shin, add3(pole, scale3(UP, n * 0.25 * leg)));
    }
  }
  // The eyes go from the ground ahead, coming down, to where the face points as the head tucks.
  const ahead = add3(pose.hips, scale3(roll.travel, 1.6 * leg));
  const tuck = smoothstep((t - roll.start) / 0.2);
  const gaze = add3(scale3({ ...ahead, y: setup.ground(ahead.x, ahead.z) }, 1 - tuck), scale3(alongFace(rig, leg), tuck));
  return { rig, board, wheel: boardPose.wheel, gaze, expression: 'wince', bodyHeight: setup.ground(pose.hips.x, pose.hips.z) - pose.hips.y };
}

/** The rider on their feet over a stretch: coming down and running it out, or up out of a roll. */
function onFeetAt(plan: KickOutPlan, phase: FeetPhase, t: number, turnKnees = true): KickOutFrame & { pose: BodyPose } {
  const { setup, takeover, release, kick } = plan;
  const { run, start, rate, from } = phase;
  const { body } = setup;
  const leg = body.thigh + body.shin;
  const tau = Math.max(0, t - from);
  const sample = runOutAt(run, t);
  const hips = sample.hips;
  const speed = Math.hypot(sample.velocity.x, sample.velocity.z);
  const firstDown = phase.down;
  const g = setup.gravity;
  const height = setup.ground(hips.x, hips.z) - hips.y;

  // ----- Pelvis, torso, head -----
  const tip = (fwd: V3, up: V3, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { fwd: add3(scale3(fwd, Math.cos(a)), scale3(up, -Math.sin(a))), up: add3(scale3(up, Math.cos(a)), scale3(fwd, Math.sin(a))) };
  };
  /**
   * The ground the legs stand on at clock `s`: where the feet come down, going from one footfall's to the next's over the
   * step between (not the ground under the hips, which drops away all at once as they pass over an edge).
   */
  const groundUnder = (s: number) => {
    const falls = run.footfalls;
    const at = (i: number) => setup.ground(falls[i].at.x, falls[i].at.z);
    let i = 0;
    while (i + 1 < falls.length && falls[i + 1].on <= s) i++;
    if (s <= falls[0].on || i + 1 >= falls.length) return at(i);
    return at(i) + (at(i + 1) - at(i)) * smoothstep((s - falls[i].on) / (falls[i + 1].on - falls[i].on));
  };
  /** How far forward the trunk leans (degrees) at clock `s`. */
  const trunkLeanAt = (s: number) => {
    const at = runOutAt(run, s);
    // Landing folds it over the knees as they bend, below where they hold the hips running (or standing): up out of a crouch,
    // it straightens as they come up.
    const crouch = clamp01((at.hold - (groundUnder(s) - at.hips.y)) / (0.5 * leg));
    // Braking leans it back, and falling forward (the steps not yet out ahead of it) leans it on: the body's acceleration
    // along its way over about a stride (the lean that keeps it over its feet, held through the steps rather than jerked by
    // each one, and taken up just before the first foot plants).
    const back = Math.max(from, s - BRAKE_SPAN);
    const accel = dot3(sub3(runOutAt(run, s + BRAKE_SPAN).velocity, runOutAt(run, back).velocity), phase.travel) / (s + BRAKE_SPAN - back);
    const pitch = (Math.atan2(accel, g) * 0.75 * 180) / Math.PI;
    // The kick throws it back a little (the leg going forward).
    const kickBack = 9 * Math.sin(Math.PI * clamp01((s - plan.contact) / (firstDown - plan.contact)));
    return 6 + 34 * crouch + pitch - kickBack;
  };
  const pelvisAt = (s: number) => {
    const a = tip(phase.facing(s), UP, trunkLeanAt(s) * 0.45);
    return qframe(a.fwd, a.up);
  };
  const torsoAt = (s: number) => {
    const a = tip(phase.facing(s), UP, trunkLeanAt(s));
    return qframe(a.fwd, a.up);
  };

  // Offsets from the pose the rider was in, decaying: off the pose this motion has then, turning as much faster as it was.
  const rotOffset = (was: Quat, ratePrev: V3, own: (s: number) => Quat) => {
    const o = qlog(qmul(was, qconj(own(from))));
    const ownRate = scale3(qlog(qmul(own(from + 1 / 240), qconj(own(from)))), 240);
    return qexp(decay3(o, sub3(ratePrev, ownRate), tau));
  };
  const pelvis = qnorm(qmul(rotOffset(start.pelvis, rate.rot.pelvis, pelvisAt), pelvisAt(t)));
  const torso = qnorm(qmul(rotOffset(start.torso, rate.rot.torso, torsoAt), torsoAt(t)));

  // ----- Feet -----
  let shoes = [shoeAt(plan, run, 0, t), shoeAt(plan, run, 1, t)] as [ShoePose, ShoePose];
  // Coming down into a roll, the kicking foot heads for where it lands beside the other.
  const { roll } = plan;
  if (roll && run === plan.run) {
    const land = roll.landing[kick];
    shoes[kick] = kickShoeAt(plan, t, { at: land.shoe.at, q: land.shoe.q, on: land.on });
  }
  shoes = inReach(shoes, hips, pelvis, body);
  // Nor nearer its hip than the knee folds: a foot swung up past that (over a stair's nose) comes down as far as it takes,
  // while its sole's off the ground.
  shoes = shoes.map((shoe, i) => belowFold(plan, shoe, add3(hips, scale3(qrot(pelvis, { x: 0, y: 0, z: 1 }), (i === 0 ? -1 : 1) * body.hipHalf)))) as [ShoePose, ShoePose];

  // ----- Knees -----
  const kneeFor = (i: 0 | 1): V3 => {
    const heading = qrot(shoes[i].q, { x: 1, y: 0, z: 0 });
    const side = scale3(qrot(pelvis, { x: 0, y: 0, z: 1 }), i === 0 ? -1 : 1);
    const ahead = norm3(add3(qrot(pelvis, { x: 1, y: 0, z: 0 }), scale3(heading, 0.6)));
    // Square to the leg's line, ahead of it in the upright plane it points along: forward over a foot below the hip, down
    // over one reaching back, up over one reaching forward (never along the line, wherever the foot goes).
    const leg = norm3(sub3(ankleOf(shoes[i]), add3(hips, scale3(side, body.hipHalf))));
    const bend = cross3(cross3({ x: 0, y: 1, z: 0 }, ahead), leg);
    const square = Math.hypot(bend.x, bend.y, bend.z);
    return norm3(add3(add3(bend, scale3(ahead, Math.max(0, 0.3 - square))), scale3(side, 0.15)));
  };
  const kneeStart = start.knees;
  const blendKnee = (i: 0 | 1) => norm3(add3(kneeFor(i), scale3(sub3(kneeStart[i], kneeFor(i)), Math.exp(-tau / (BLEND_T * 1.5)))));

  // ----- Arms -----
  const flying = 1 - smoothstep((t - firstDown) / 0.12);
  const brace = smoothstep((t - firstDown + 0.02) / 0.08) * (1 - smoothstep((t - firstDown - 0.12) / 0.22));
  const running = smoothstep((t - firstDown - 0.1) / 0.2) * Math.min(1, speed / 220);
  const settled = smoothstep((t - run.stopped) / 0.5);
  const forwardness = (i: 0 | 1) => clamp01(0.5 + dot3(sub3(shoes[i].at, hips), phase.travel) / (0.8 * leg)) * 2 - 1;
  const armPose = (i: 0 | 1): ArmPose => {
    const role = i === kick ? 'kick' : 'other';
    let pose = ARMS_BALANCE[role];
    const mix = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({ out: a.out + (b.out - a.out) * k, swing: a.swing + (b.swing - a.swing) * k, elbow: a.elbow + (b.elbow - a.elbow) * k });
    pose = mix(pose, ARMS_BRACE, Math.max(brace, 1 - flying) * (1 - running));
    const opposite = forwardness(i === 0 ? 1 : 0);
    const swingArm: ArmPose = { out: 14, swing: 6 + 38 * opposite, elbow: 30 + 55 * Math.min(1, speed / 250) };
    pose = mix(pose, swingArm, running);
    pose = mix(pose, ARMS_STAND, settled);
    return pose;
  };
  const armAt = (i: 0 | 1) => {
    const [upper, fore] = armDirs(armPose(i), i === 0 ? -1 : 1);
    return { upper: qrot(torso, upper), fore: qrot(torso, fore) };
  };
  const startArm = start.arms;
  const blendArm = (i: 0 | 1) => {
    const a = armAt(i);
    const k = Math.exp(-tau / (BLEND_T * 2));
    return { upper: norm3(add3(a.upper, scale3(sub3(startArm[i].upper, a.upper), k))), fore: norm3(add3(a.fore, scale3(sub3(startArm[i].fore, a.fore), k))) };
  };

  // ----- Board, gaze, head -----
  const boardPose = boardAt(plan.board, t);
  const board = boardRigOf(boardPose);
  const groundAhead = (d: number): V3 => {
    const p = add3(hips, scale3(phase.travel, d));
    return { ...p, y: setup.ground(p.x, p.z) };
  };
  const watchBoard = 1 - smoothstep((t - release - 0.1) / 0.16);
  const watchBack = smoothstep((t - run.stopped - 0.15) / 0.4);
  // Running, the eyes go further ahead, the faster.
  const ahead2 = groundAhead((1.6 + 1.4 * Math.min(1, speed / Math.sqrt(g * leg))) * leg);
  const headPos = add3(hips, scale3(qrot(torso, { x: 0, y: -1, z: 0 }), body.neck + 10 * body.scale));
  const torsoUp = qrot(torso, { x: 0, y: -1, z: 0 });
  const torsoFwd = qrot(torso, { x: 1, y: 0, z: 0 });
  const torsoSide = cross3(torsoUp, torsoFwd);
  /**
   * How far round off the chest (yaw) and up (pitch) the head turns to look at `p`: not round at all for something right
   * below it (there's no way round to that) or right behind it (looked for over neither shoulder, rather than flicked from
   * one to the other as it crosses).
   */
  const aim = (p: V3) => {
    const look = norm3(sub3(p, headPos));
    const round = Math.atan2(dot3(look, torsoSide), dot3(look, torsoFwd));
    const outThere = smoothstep(Math.hypot(p.x - headPos.x, p.z - headPos.z) / (0.6 * leg));
    const notBehind = smoothstep((Math.PI - Math.abs(round)) / (Math.PI - LOOK_ROUND_MOST));
    return { yaw: round * outThere * notBehind, pitch: Math.asin(Math.max(-1, Math.min(1, dot3(look, torsoUp)))) };
  };
  // The board, then the ground ahead, then back to the board once stopped; up out of a roll, from where the face was
  // pointing. The head's aim goes from one to the next, not the point it looks at (which would pass right under it).
  const onBoard = 1 - (1 - watchBoard) * (1 - watchBack);
  const looks: [V3, number][] = [[ahead2, 1 - onBoard], [board.center, onBoard]];
  if (from > takeover) {
    const off = smoothstep(tau / 0.25);
    for (const look of looks) look[1] *= off;
    looks.push([alongFace(rigOf(start, body, board, plan.toeDir, 1), leg), 1 - off]);
  }
  const gaze = looks.reduce((sum, [p, w]) => add3(sum, scale3(p, w)), { x: 0, y: 0, z: 0 });
  let yaw = 0;
  let pitch = 0;
  for (const [p, w] of looks) {
    if (w <= 0) continue;
    const a = aim(p);
    yaw += w * a.yaw;
    pitch += w * a.pitch;
  }
  const yawK = Math.max(-1.2, Math.min(1.2, yaw * 0.85));
  const pitchK = Math.max(-0.85, Math.min(0.4, pitch * 0.7));
  let headFwd = add3(scale3(torsoFwd, Math.cos(yawK)), scale3(cross3(torsoUp, torsoFwd), Math.sin(yawK)));
  headFwd = norm3(add3(scale3(headFwd, Math.cos(pitchK)), scale3(torsoUp, Math.sin(pitchK))));
  const headUp = norm3(add3(scale3(torsoUp, 0.5), scale3(UP, 0.5)));
  let head = qframe(headFwd, headUp);
  head = qnorm(qmul(rotOffset(start.head, rate.rot.head, () => head), head));

  const pose: BodyPose = {
    hips,
    pelvis,
    torso,
    head,
    shoes,
    knees: [blendKnee(0), blendKnee(1)],
    arms: [blendArm(0), blendArm(1)],
  };
  const free = smoothstep((t - takeover) / 0.25);
  const rig = rigOf(pose, body, board, plan.toeDir, free);
  // Knees bend toward their poles: double-check the reach (an unreachable ankle stays where it is).
  for (const legRig of rig.legs) legRig.knee = twoBone(legRig.hip, legRig.ankle, body.thigh, body.shin, sub3(legRig.knee, legRig.hip));
  // A foot coming down by the board lifts over it (the kicking one once it's let go of it).
  const lifts = liftsOf(plan);
  rig.legs = rig.legs.map((legRig, i) => raisedLeg(legRig, liftAt(lifts[i], t), body)) as Rig['legs'];
  if (turnKnees) {
    // And a knee over a step it would go into turns out, as planned: from none where the stretch starts (from the attempt,
    // or up out of a roll), and back to none before a roll it ends in.
    const to = phase.from === takeover && plan.roll ? plan.roll.start : setup.end;
    const turns = kneeTurnsOf(plan, phase, to);
    const fade = smoothstep((t - phase.from) / KNEE_TURN_T) * (to < setup.end ? 1 - smoothstep((t - to + KNEE_TURN_T) / KNEE_TURN_T) : 1);
    const side = qrot(pelvis, { x: 0, y: 0, z: 1 });
    rig.legs = rig.legs.map((legRig, i) => kneeTurnedOut(legRig, scale3(side, i === 0 ? -1 : 1), fade * kneeTurnAt(turns[i], t))) as Rig['legs'];
  }

  const expression: Expression = t < plan.contact ? 'focus' : t < run.stopped + 0.3 ? 'wince' : 'open';
  return { rig, board, wheel: boardPose.wheel, gaze, expression, bodyHeight: height, pose };
}
