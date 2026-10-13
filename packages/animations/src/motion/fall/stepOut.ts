import { add3, dot3, scale3, smoothstep, sub3, type V3 } from '../../math';
import { ANKLE_HEIGHT, ANKLE_IN_SHOE, type BodyDims } from './body';
import {
  REACH, STEP_WIDTH, TOE_OUT, UP, besideStop, clearOfEdges, footfallAt, heelToToe, level, rightOf, soleCorners, turnLevel, within,
  type Footfall,
} from './footing';
import type { RunOut, RunOutSample } from './runOut';

/**
 * Stepping out of a roll: up on both feet, still going, the rider catches
 * themselves and stops in a few steps, the way people do.
 *
 * The body is a point at the hips balanced over the feet (an inverted
 * pendulum: the legs push along the line from where the weight is on the
 * soles, so hips ahead of it fall forward and hips behind it are held back).
 * Each step lands where it would stop the body (its capture point: as far
 * ahead as the speed would carry the hips over a foot planted there), or as
 * far ahead as the leg reaches if that's short of it. Coming down ahead of
 * the hips, the leg takes the speed along it as the knee gives (a braking
 * step's heel strike), and the hips, held back behind it, slow on as they
 * come over it: that's most of what stops a runner, each step taking a good
 * share of the speed, so from a run it's a few steps, not many. Going too
 * fast for the legs to get a foot out ahead, the first steps only catch the
 * body falling forward. The next foot comes down as the hips get over the
 * one they're on (never before the leg can swing through); a step that lands
 * at the capture point stops the body over it, the other foot comes down
 * beside it, and the rider stands up.
 *
 * There's no flight and no bounce: the legs hold the hips at a height, lower
 * the faster they're going (knees bent to take the steps), standing up as
 * they slow.
 *
 * Distances scale with the leg and times with its pendulum (√(leg / gravity)),
 * so the robot and a person step out alike, each at their own size.
 * Coordinates are the physics' (y down), on the street.
 */

/** Sim steps a second. */
const HZ = 600;
/** Hip height over the ankle (in legs) the legs hold the hips at stood up, and stepping at speed (lower the faster, down to this). */
const STAND = 0.95;
const STEPPING = 0.76;
/** The speed (in √(gravity · leg)) from which the hips are held lowest. */
const FAST = 1;
/** The legs' hold on the hips' height: natural frequency (per leg pendulum) and damping (critical: no bounce). */
const HOLD = 1.8;
const HOLD_DAMPING = 1;
/** The most the legs push (in body weights, over it). */
const PUSH_MOST = 0.8;
/** Stopping over its feet, how quickly (natural frequency, per leg pendulum) the body settles over them, critically damped. */
const SETTLE = 1.4;
/** Nearest and furthest ahead of the hips (in legs) a step lands. */
const AHEAD = { least: 0.05, most: 0.6 } as const;
/**
 * How much of the speed along the leg a foot coming down ahead takes as the knee gives, the most it can take in a step (in
 * √(gravity · leg): about a metre a second, a person's), and over how long (s).
 */
const ABSORB = 1;
const ABSORB_MOST = 0.28;
const ABSORB_T = 0.05;
/** Both feet down this long at each step, and the quickest a foot swings through to the next (in leg pendulums). */
const DOUBLE_SUPPORT = 0.12;
const SWING_LEAST = 0.35;
/** The next foot comes down once the hips are this far (in legs) past the one they're on. */
const PAST = 0.05;
/** Up off both feet, the first foot lifts this long after (s), and comes down the sooner (a share of the quickest swing): it's tucked under from the roll. */
const FIRST_LIFT = 0;
const FIRST_SWING = 0.6;
/** Stopping over a foot, the other lifts this long after it lands and comes down beside it this long after (in leg pendulums). */
const CLOSE_LIFT = 0.45;
const CLOSE_ON = 1.1;
/** Up off both feet slow enough to stop over them (the capture point within this much, in legs, of their soles), the rider stands; up this long after (s). */
const STAND_SLACK = 0.04;
const STAND_UP_T = 0.3;
/** The hips never go lower over the ankles than this (in legs). */
const SQUAT = 0.42;

export interface StepOutSetup {
  body: BodyDims;
  gravity: number;
  ground: (x: number, z: number) => number;
  /** When it starts, the hips then, and how they're moving. */
  start: number;
  hips: V3;
  velocity: V3;
  /** Both feet planted at the start: the shoes' middles flat on the ground, and the ways their toes point. */
  planted: { at: V3; heading: V3 }[];
  /** Where the hips face at a time (level unit vector). */
  facing: (t: number) => V3;
  /** Seconds to run. */
  until: number;
}

export function stepOut(setup: StepOutSetup): RunOut {
  const { body, gravity: g, ground, until } = setup;
  const leg = body.thigh + body.shin;
  const pendulum = Math.sqrt(leg / g);
  const reach = REACH * leg;
  const dt = 1 / HZ;
  const footfalls: Footfall[] = setup.planted.map((f, i) => ({
    foot: i as 0 | 1, on: setup.start - 1e-6, off: Infinity, at: f.at, heading: f.heading, kind: 'close',
  }));
  let stopped = Infinity;

  const ankleOf = (f: Footfall): V3 => add3(add3(f.at, scale3(f.heading, ANKLE_IN_SHOE.f)), scale3(UP, ANKLE_IN_SHOE.u));
  const hipOf = (p: V3, foot: 0 | 1, t: number): V3 => add3(p, scale3(rightOf(setup.facing(t)), (foot === 0 ? -1 : 1) * body.hipHalf));
  const down = (t: number) => footfalls.filter((f) => f.on <= t && t < f.off);
  /** The level way the body's going (or facing, standing still). */
  const wayOf = (v: V3, t: number): V3 => (Math.hypot(v.x, v.z) > 1e-3 ? level(v) : setup.facing(t));

  /** A foot coming down with its ankle over (x, z), its toe pointing `heading`, clear of any edge along `way`. */
  const footAt = (foot: 0 | 1, flat: V3, heading: V3, on: number, kind: Footfall['kind'], way: V3): Footfall =>
    footfallAt(ground, foot, clearOfEdges(ground, body.scale, flat, heading, way), heading, on, kind);

  /** Where the weight is on the soles: rolling heel to toe as the hips come over a stepping foot; balancing, as near over the body's capture point as the soles reach. */
  const weightAt = (t: number, p: V3, v: V3, omega: number, feet: Footfall[]): V3 => {
    const capture = add3(p, scale3(v, 1 / omega));
    const rolling = (f: Footfall) => heelToToe(f, p);
    const balancing = (fs: Footfall[]) => ({ ...within(capture, fs.flatMap(soleCorners)), y: fs[fs.length - 1].at.y });
    const latest = feet.reduce((a, b) => (b.on > a.on ? b : a));
    if (latest.kind === 'step') {
      // Onto a step: the weight goes over from the foot behind to it as both are down.
      const behind = feet.find((f) => f !== latest);
      const k = behind ? smoothstep((t - latest.on) / (DOUBLE_SUPPORT * pendulum)) : 1;
      const from = behind ? (behind.kind === 'step' ? rolling(behind) : balancing([behind])) : rolling(latest);
      return add3(from, scale3(sub3(rolling(latest), from), k));
    }
    return balancing(feet);
  };

  let p = setup.hips;
  let v = setup.velocity;
  let t = setup.start;
  /** The speed the knee's still to take off a foot just down, a second, and for how much longer. */
  let absorbing: V3 = { x: 0, y: 0, z: 0 };
  let absorbLeft = 0;
  /** Stopping over a foot: when the other comes down beside it. */
  let closeOn = Infinity;

  // Slow enough to stop over the feet, the rider just stands up; otherwise the foot behind steps first.
  {
    const h = ground(p.x, p.z) - p.y;
    const capture = add3(p, scale3(v, 1 / Math.sqrt(g / Math.max(1, h))));
    const inside = within(capture, footfalls.flatMap(soleCorners));
    if (Math.hypot(inside.x - capture.x, inside.z - capture.z) <= STAND_SLACK * leg) {
      stopped = setup.start + STAND_UP_T;
    } else {
      const way = wayOf(v, t);
      const first = dot3(sub3(footfalls[0].at, footfalls[1].at), way) < 0 ? 0 : 1;
      footfalls[first].off = setup.start + FIRST_LIFT;
    }
  }

  /** The foot each leg last came down on. */
  const lastOf = (foot: 0 | 1) => footfalls.filter((f) => f.foot === foot).pop()!;

  const touchdown = (foot: 0 | 1) => {
    const other: 0 | 1 = foot === 0 ? 1 : 0;
    const stance = lastOf(other);
    const way = wayOf(v, t);
    const aside = rightOf(way);
    const facing = setup.facing(t);
    const side = foot === 0 ? -1 : 1;
    const h = Math.max(1, ground(p.x, p.z) - p.y);
    const z = Math.max(1, h - ANKLE_HEIGHT);
    const omega = Math.sqrt(g / h);
    const along = Math.max(0, dot3(v, way));
    // As far ahead as stops the body, after what the landing itself takes (more, the further ahead), or as far as the leg reaches.
    const most = Math.min(AHEAD.most * leg, Math.sqrt(Math.max(0, (0.97 * reach) ** 2 - z * z)));
    const taken = (d: number) => Math.min(ABSORB * ((d * d) / (d * d + z * z)), (ABSORB_MOST * Math.sqrt(g * leg)) / Math.max(1, along));
    let ahead = most;
    for (let i = 0; i < 8; i++) ahead = Math.max(AHEAD.least * leg, Math.min(most, (along * (1 - taken(ahead))) / omega));
    const captures = (along * (1 - taken(ahead))) / omega <= most;
    const lateral = dot3(v, aside) / omega;
    const heading = turnLevel(facing, side * TOE_OUT);
    const flat = add3(add3(add3(p, scale3(way, ahead)), scale3(aside, lateral)), scale3(rightOf(facing), side * STEP_WIDTH * body.hipHalf));
    const fall = footAt(foot, flat, heading, t, captures ? 'capture' : 'step', way);
    footfalls.push(fall);
    // The foot it was on lifts once this one has the weight; stopping over this one, once the body's settled onto it.
    stance.off = Math.min(stance.off, t + (captures ? CLOSE_LIFT : DOUBLE_SUPPORT) * pendulum);
    if (captures) closeOn = t + CLOSE_ON * pendulum;
    // Coming down ahead of the hips, the knee gives under the speed along the leg, taking it out over a moment: the share of
    // the speed along the way that's along the leg, the further ahead the foot, the more.
    const d = Math.max(0, dot3(sub3(ankleOf(fall), p), way));
    absorbing = scale3(way, (-along * taken(d)) / ABSORB_T);
    absorbLeft = ABSORB_T;
  };

  const close = () => {
    const capture = footfalls[footfalls.length - 1];
    const foot: 0 | 1 = capture.foot === 0 ? 1 : 0;
    const way = wayOf(v, t);
    const h = Math.max(1, ground(p.x, p.z) - p.y);
    const omega = Math.sqrt(g / h);
    // Beside it, where the body's balance will be (a little either way of it, along).
    const beside = besideStop(ankleOf(capture), add3(p, scale3(v, 1 / omega)), foot, setup.facing(t), way, body);
    footfalls.push(footAt(foot, beside.at, beside.heading, t, 'close', way));
    stopped = t + DOUBLE_SUPPORT * pendulum;
    closeOn = Infinity;
  };

  const samples: RunOutSample[] = [];
  let still = Infinity;
  for (let i = 0; t <= setup.start + until + 1e-9; i++) {
    // ----- Steps -----
    if (t >= closeOn) close();
    else if (stopped === Infinity && closeOn === Infinity) {
      const feet = down(t);
      const latest = footfalls.reduce((a, b) => (b.on > a.on ? b : a));
      const swinging = ([0, 1] as const).find((foot) => lastOf(foot).off <= t);
      if (swinging !== undefined && latest.kind !== 'capture') {
        const ready = lastOf(swinging).off + (lastOf(swinging).kind === 'close' ? FIRST_SWING : 1) * SWING_LEAST * pendulum;
        const stance = feet.length ? feet.reduce((a, b) => (b.on > a.on ? b : a)) : latest;
        const way = wayOf(v, t);
        const past = dot3(sub3(p, ankleOf(stance)), way) >= PAST * leg;
        const leg1 = sub3(hipOf(p, stance.foot, t), ankleOf(stance));
        const stretched = Math.hypot(leg1.x, leg1.y, leg1.z) > 0.98 * reach;
        if (t >= ready && (past || stretched || !feet.length)) touchdown(swinging);
      }
    }

    // ----- The body over the feet -----
    const feet = down(t);
    const speed = Math.hypot(v.x, v.z);
    const latest = footfalls.reduce((a, b) => (b.on > a.on && b.on <= t ? b : a), footfalls[0]);
    const floorY = ground(latest.at.x, latest.at.z);
    const h = floorY - p.y;
    const hold = ANKLE_HEIGHT + leg * (stopped <= t ? STAND : STAND - (STAND - STEPPING) * Math.min(1, speed / (FAST * Math.sqrt(g * leg))));
    let a: V3;
    let push = 0;
    const settling = stopped <= t || latest.kind === 'capture';
    if (!feet.length) {
      a = { x: 0, y: g, z: 0 };
    } else if (settling) {
      // Stopping over its feet: the ankles and hips bring the body to rest over them, as standing balance does.
      const omegaV = HOLD / pendulum;
      const up = Math.max(-g, Math.min(PUSH_MOST * g, omegaV * omegaV * (hold - h) - 2 * HOLD_DAMPING * omegaV * -v.y));
      push = g + up;
      const over = feet.length > 1 ? scale3(add3(ankleOf(feet[0]), ankleOf(feet[1])), 0.5) : ankleOf(feet[0]);
      const w = SETTLE / pendulum;
      a = { x: w * w * (over.x - p.x) - 2 * w * v.x, y: -up, z: w * w * (over.z - p.z) - 2 * w * v.z };
    } else {
      const omegaV = HOLD / pendulum;
      const up = Math.max(-g, Math.min(PUSH_MOST * g, omegaV * omegaV * (hold - h) - 2 * HOLD_DAMPING * omegaV * -v.y));
      push = g + up;
      const omega = Math.sqrt(g / Math.max(1, h));
      const weight = weightAt(t, p, v, omega, feet);
      const lever = push / Math.max(1, ground(weight.x, weight.z) - p.y);
      a = { x: (p.x - weight.x) * lever, y: -up, z: (p.z - weight.z) * lever };
    }
    if (i % 2 === 0) samples.push({ hips: p, velocity: v, load: push, hold });
    let nv = add3(v, scale3(a, dt));
    if (absorbLeft > 0) {
      const share = Math.min(dt, absorbLeft);
      nv = add3(nv, scale3(absorbing, share));
      absorbLeft -= share;
    }
    let np = add3(p, scale3(nv, dt));
    // The legs only reach so far down to a foot that's down (the knees never lock): one left behind lifts as its leg comes
    // straight, the one ahead holds the hips down within it; and they bend no deeper than a squat.
    for (const f of down(t + dt)) {
      const ankle = ankleOf(f);
      const hip = hipOf(np, f.foot, t + dt);
      const flat = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
      const top = ankle.y - Math.sqrt(Math.max(0, reach * reach - flat * flat));
      if (np.y >= top) continue;
      const leading = down(t + dt).every((o) => o.on <= f.on);
      if (!leading) f.off = t + dt;
      else {
        np = { ...np, y: top };
        nv = { ...nv, y: Math.max(nv.y, 0) };
      }
    }
    const lowest = floorY - ANKLE_HEIGHT - SQUAT * leg;
    if (np.y > lowest) {
      np = { ...np, y: lowest };
      nv = { ...nv, y: Math.min(nv.y, 0) };
    }
    p = np;
    v = nv;
    t += dt;
    if (still === Infinity && stopped < t && Math.hypot(v.x, v.y, v.z) < 3) still = t;
  }
  return { start: setup.start, dt: 2 * dt, samples, footfalls, stopped, still };
}
