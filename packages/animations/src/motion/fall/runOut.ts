import { add3, dot3, scale3, sub3, type V3 } from '../../math';
import { ANKLE_HEIGHT, ANKLE_IN_SHOE, type BodyDims } from './body';
import {
  REACH, STEP_WIDTH, TOE_OUT, besideStop, clearOfEdges, footfallAt, heelToToe, level, rightOf, soleCorners, turnLevel, within,
  type Footfall,
} from './footing';

/**
 * Running it out: a rider down off the board on their own feet at the
 * board's speed, braking to a stop in a few steps.
 *
 * The body is a point at the hips carried by its legs. On the ground the
 * legs push it along the line from the foot (an inverted pendulum, the way
 * walking and braking work): a foot planted ahead of the hips slows them as
 * they come over it, and the harder they're landing (the legs pushing up
 * more than gravity) the harder it brakes. Up and down, the legs are a
 * spring with damping that takes a landing and stands back up; in the air
 * the body falls.
 *
 * Each step is placed by the capture point: where the foot would have to go
 * to stop the body over it. A foot that far ahead stops it in one step; a
 * foot short of it lets it carry on, slower. A step can't reach further than
 * the leg, so from speed it takes a few, each shorter and slower than the
 * last, until one can stop it; the other foot then comes alongside and the
 * rider stands.
 *
 * Distances scale with the leg and times with the leg's pendulum
 * (√(leg / gravity)), so the robot and a person run out alike, each at
 * their own size. Coordinates are the physics' (y down), on the street.
 */

/** Sim steps a second. */
const HZ = 600;
/** Hip height over the ground riding it out, and standing, as shares of the leg (thigh and shin) over the ankle's height. */
const RUN_HEIGHT = 0.85;
const STAND_HEIGHT = 0.965;
/** The deepest the hips go, as a share of the leg. */
const SQUAT = 0.46;
/** The legs' spring up and down standing: natural frequency (per √(gravity / leg)) and damping. */
const SPRING = 2.3;
const DAMPING = 0.72;
/**
 * Running, the legs push hardest just after a foot comes down (while it's
 * ahead, braking) and least as the body goes past it: the push swings this
 * share of the body's weight either way over a step, as running's does. A
 * softer spring holds the hips at their running height on average.
 */
const RUN_SWING = 0.75;
const RUN_HOLD = 1.2;
/** Step timing, in leg pendulums (√(leg / gravity)): from speed, and slowed right down. */
const STEP_FAST = 1.0;
const STEP_SLOW = 1.5;
/** Both feet down this long at each step (seconds per leg pendulum). */
const DOUBLE_SUPPORT = 0.14;
/** How much of its speed each step takes out, unless the leg can't reach that far. */
const BRAKE = 0.5;
/** Below this speed (in √(gravity · leg)), one step stops the body. */
const STOP_SPEED = 0.22;
/** The longest a stride (one footfall to the next) carries the body, in legs: ahead of the foot it lands on and past it. */
const STRIDE_REACH = 0.85;
/** How far ahead of the hips (in legs) a step may land, and at least. */
const STEP_AHEAD = { min: 0.08, max: 0.65 } as const;
/** A landing's knees bend no deeper than this (share of the leg) above the squat: the fall is taken over that much. */
const ABSORB_MARGIN = 0.1;
/** The legs hold the hips this far (in legs) short of their reach: the knees stay soft. */
const SOFT_KNEES = 0.02;
/**
 * A planted foot lifts once the hips are further across from it than this much of the leg's reach, or (dropping off an
 * edge) closer above it than this much of a squat.
 */
const LOST_REACH = 0.98;
const LOST_DROP = 0.8;
/** Stopping, the foot behind stays down while the weight goes onto the one ahead, and lifts this long (in leg pendulums) before it comes down alongside. */
const CLOSE_SWING = 0.6;
/** A foot coming down out of the hips' reach: they bend down to it over this long before (in leg pendulums). */
const LAND_EASE = 0.5;
/** Below about this speed (in √(gravity · leg)) the way the steps go eases from the body's to the run's: still, it has none. */
const COURSE_EASE = 0.1;

export interface RunOutSample {
  hips: V3;
  velocity: V3;
  /** The legs' push (acceleration less gravity, up). */
  load: number;
  /** The height the legs hold the hips at over the ground then (running, lower the faster; standing, up): below it, they're taking a landing. */
  hold: number;
}

export interface RunOut {
  start: number;
  dt: number;
  samples: RunOutSample[];
  footfalls: Footfall[];
  /** When the second foot is down beside the stopping one, and when the body's come to rest. */
  stopped: number;
  still: number;
}

export interface RunOutSetup {
  body: BodyDims;
  gravity: number;
  ground: (x: number, z: number) => number;
  /** The hips at `start`, in the air, and how they're moving. */
  start: number;
  hips: V3;
  velocity: V3;
  /** Extra velocity given the body over time (the kick's push back on it), as a function of time: cumulative. */
  shove?: (t: number) => V3;
  /**
   * The first foot down, already on its way: which, when at the earliest,
   * the way its toe points, and the share of the speed the landing on it
   * takes out (the foot goes that far ahead of the hips: a landing pushes up
   * along the leg, so a foot far ahead of a hard landing stops the body dead).
   */
  first: { foot: 0 | 1; earliest: number; brake: number; heading: V3 };
  /** Where the hips face at a time (level unit vector): the rider turning to run. */
  facing: (t: number) => V3;
  /** Seconds to run. */
  until: number;
}

interface State {
  t: number;
  p: V3;
  v: V3;
}

export function runOut(setup: RunOutSetup): RunOut {
  const { body, gravity: g, ground, until } = setup;
  const leg = body.thigh + body.shin;
  const pendulum = Math.sqrt(leg / g);
  const omegaV = SPRING / pendulum;
  const dt = 1 / HZ;
  const footfalls: Footfall[] = [];
  const travel = level(setup.velocity);
  const standHeight = ANKLE_HEIGHT + STAND_HEIGHT * leg;
  const runHeight = ANKLE_HEIGHT + RUN_HEIGHT * leg;
  const lowest = ANKLE_HEIGHT + SQUAT * leg;
  const reach = REACH * leg;
  const shove = setup.shove ?? (() => ({ x: 0, y: 0, z: 0 }));
  let stopped = Infinity;

  const down = (t: number) => footfalls.filter((f) => f.on <= t && t < f.off);
  /** Where the leg holds a planted foot, its reach measured to: over the ankle, level with the shoe's middle. */
  const heldAt = (f: Footfall): V3 => add3(f.at, scale3(f.heading, ANKLE_IN_SHOE.f));
  /** Recording the run: where a landing foot pulled the hips down to its reach, and how far. */
  let landings: { t: number; by: number }[] | null = null;
  /** The level way the steps go at a velocity: the body's, easing to the run's as it slows to a stand. */
  const courseOf = (v: V3): V3 => {
    const sum = add3(scale3(travel, COURSE_EASE * Math.sqrt(g * leg)), { x: v.x, y: 0, z: v.z });
    return Math.hypot(sum.x, sum.z) < 1e-6 ? travel : level(sum);
  };
  const heightOf = (s: State) => ground(s.p.x, s.p.z) - s.p.y;
  /**
   * The highest the hips can be over the ground under them with the leg reaching down to a foot's ankle, given how far
   * across it is (over an edge, the ground under the hips is lower than the foot's).
   */
  const ceiling = (s: State, f: Footfall) => {
    const side = (f.foot === 0 ? -1 : 1) * body.hipHalf;
    const hip = add3(s.p, scale3(rightOf(setup.facing(s.t)), side));
    const ankle = heldAt(f);
    const flat = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
    return ground(s.p.x, s.p.z) - ankle.y + Math.sqrt(Math.max(0, reach * reach - flat * flat));
  };

  /**
   * The leg from a hip down to a planted foot: how far across, how far down, whether the hips are going away from it, and
   * whether gravity alone bends their path round it (the leg only pushes: any faster across it and they fly off).
   */
  const legTo = (s: State, f: Footfall) => {
    const side = (f.foot === 0 ? -1 : 1) * body.hipHalf;
    const hip = add3(s.p, scale3(rightOf(setup.facing(s.t)), side));
    const ankle = heldAt(f);
    const along = sub3(hip, ankle);
    const length = Math.max(1, Math.hypot(along.x, along.y, along.z));
    const out = dot3(s.v, along) / length;
    // Round it, the pull they need (speed across squared over the leg) against gravity's along the leg toward the foot.
    const across2 = Math.max(0, dot3(s.v, s.v) - out * out);
    return { flat: Math.hypot(along.x, along.z), drop: -along.y, away: along.x * s.v.x + along.z * s.v.z > 0, arcs: across2 / length <= (g * -along.y) / length };
  };
  /**
   * Whether a planted foot still holds the body: run past (the hips further off it than the leg reaches across), or left on
   * the ground above as they drop off an edge (less than a squat over its shoe), it's lifted off.
   */
  const grips = (s: State, f: Footfall) => {
    const l = legTo(s, f);
    return l.flat < LOST_REACH * reach && l.drop > LOST_DROP * SQUAT * leg;
  };
  /**
   * And a leg can't pull: the hips going on away from a foot past its reach lift it, heel first, rather than it dragging them
   * down, once the next foot's down and holding, or if they're going too fast for gravity to bring them round it. (Slower, on
   * the one foot, they vault over it on the straight leg.)
   */
  const holds = (s: State, f: Footfall) => {
    if (!grips(s, f)) return false;
    const l = legTo(s, f);
    if (!l.away || Math.hypot(l.flat, l.drop) <= reach) return true;
    return l.arcs && !down(s.t).some((o) => o.on > f.on && grips(s, o));
  };
  const holding = (s: State) => down(s.t).filter((f) => holds(s, f));

  /** The height the legs hold the hips at over the ground, going at `speed` at `t`: running, lower the faster; stopped, stood up. */
  const holdAt = (t: number, speed: number) =>
    stopped < t ? standHeight : runHeight + (standHeight - runHeight) * (1 - Math.min(1, speed / Math.sqrt(g * leg)));

  /** One step of the dynamics with the feet down then. */
  const advance = (s: State, extra: (t: number) => V3): State => {
    const feet = holding(s);
    const h = heightOf(s);
    let a: V3;
    if (!feet.length) {
      a = { x: 0, y: g, z: 0 };
    } else {
      const speed = Math.hypot(s.v.x, s.v.z);
      // Never aimed past where the legs reach: the spring slows the hips before the knees lock.
      const reachable = Math.min(...feet.map((f) => ceiling(s, f))) - SOFT_KNEES * leg;
      const target = Math.min(reachable, holdAt(s.t, speed));
      // Up (h grows), the legs' spring; they push only, never pull the body down faster than it falls.
      const hv = -s.v.y;
      // Coming down, the knees take the fall over what's left above the deepest they'll bend to, at an even rate.
      const absorb = hv < 0 ? (hv * hv) / (2 * Math.max(1, h - lowest - ABSORB_MARGIN * leg)) : -Infinity;
      const last = feet.reduce((a1, b1) => (b1.on > a1.on ? b1 : a1));
      const running = stopped > s.t && last.kind === 'step';
      let hold: number;
      if (running) {
        const since = s.t - last.on;
        const phase = Math.min(1, since / period(speed));
        const swing = -1 + (Math.cos(Math.PI * phase) + 1) * Math.min(1, since / 0.025);
        const omegaH = RUN_HOLD / pendulum;
        hold = g * RUN_SWING * swing + omegaH * omegaH * (target - h) - 2 * omegaH * hv;
      } else {
        hold = omegaV * omegaV * (target - h) - 2 * DAMPING * omegaV * hv;
      }
      const ah = Math.max(-g, absorb, hold);
      const push = g + ah;
      // Where the push comes from: the foot down, or between two by how far the step's weight has moved over.
      let zmp: V3;
      const omega = Math.sqrt(g / Math.max(1, h));
      // Balancing: the push moves under the soles to bring the body to rest over `over` (its capture point driven onto it).
      const balance = (over: V3, soles: Footfall[]) => {
        const capture = add3(s.p, scale3(s.v, 1 / omega));
        const want = add3(capture, scale3(sub3(capture, over), 1.2));
        return { ...within(want, soles.flatMap(soleCorners)), y: over.y };
      };
      if (feet.length === 1) {
        const f = feet[0];
        if (f.kind === 'step') {
          // Braking, the weight's on the heel while the foot's ahead, and rolls toward the ball as the body comes over it.
          zmp = heelToToe(f, s.p);
        } else {
          zmp = balance(f.at, [f]);
        }
      } else {
        const [a1, b1] = feet[0].on <= feet[1].on ? [feet[0], feet[1]] : [feet[1], feet[0]];
        if (stopped <= s.t || b1.kind === 'close') {
          // Standing on both: the push moves about under the two soles to bring the body to rest over their middle.
          zmp = balance(scale3(add3(a1.at, b1.at), 0.5), [a1, b1]);
        } else if (b1.kind === 'capture') {
          // Stopping: the foot behind still down, the weight goes over onto the one ahead.
          zmp = balance(b1.at, [a1, b1]);
        } else {
          const k = Math.min(1, (s.t - b1.on) / (DOUBLE_SUPPORT * pendulum));
          zmp = add3(a1.at, scale3(sub3(b1.at, a1.at), k));
        }
      }
      const off = sub3(s.p, zmp);
      // Along the leg from the soles: on a slope or a stair the foot is higher or lower than the ground under the hips.
      const sole = zmp.y + ANKLE_HEIGHT - ANKLE_IN_SHOE.u;
      const lever = push / Math.max(1, sole - s.p.y);
      a = { x: off.x * lever, y: -ah, z: off.z * lever };
    }
    const nudge = sub3(extra(s.t + dt), extra(s.t));
    let v = add3(add3(s.v, scale3(a, dt)), nudge);
    let p = add3(s.p, scale3(v, dt));
    const next: State = { t: s.t + dt, p, v };
    // The legs only reach so far: hips over a planted foot stay within it; and never lower than a squat.
    for (const f of holding(next)) {
      const top = ceiling(next, f);
      const h2 = heightOf(next);
      if (h2 > top) {
        // A foot just down further below than the leg reaches: the knee bent into it on the way (see the run's samples).
        if (landings && f.on > s.t - dt) landings.push({ t: next.t, by: h2 - top });
        p = { ...p, y: p.y + (h2 - top) };
        v = { ...v, y: Math.max(v.y, 0) };
      }
    }
    if (holding(next).length && ground(p.x, p.z) - p.y < lowest) {
      p = { ...p, y: ground(p.x, p.z) - lowest };
      v = { ...v, y: Math.min(v.y, 0) };
    }
    return { t: next.t, p, v };
  };

  const simulate = (from: State, to: number): State => {
    let s = from;
    while (s.t < to - 1e-9) s = advance(s, shove);
    return s;
  };

  /**
   * Where a foot lands for a step at `on`, from a forecast of the body then; null if the ground there is further below the
   * hips than the leg reaches (stepping off an edge, it comes down once they've dropped to it).
   */
  const place = (from: State, foot: 0 | 1, on: number): Footfall | null => {
    const s = simulate(from, on);
    const h = Math.max(lowest, heightOf(s));
    const omega = Math.sqrt(g / h);
    const way = courseOf(s.v);
    const aside = rightOf(way);
    const vAlong = dot3(s.v, way);
    const vAcross = dot3(s.v, aside);
    const speed = Math.max(0, vAlong);
    const stop = speed < STOP_SPEED * Math.sqrt(g * leg);
    const goal = stop ? 0 : speed * (1 - BRAKE);
    const want = Math.sqrt(Math.max(0, speed * speed - goal * goal)) / omega;
    const facing = setup.facing(on);
    const side = foot === 0 ? -1 : 1;
    // Out to its own side of the hips, and across as far as catches the body's drift.
    const width = scale3(rightOf(facing), side * STEP_WIDTH * body.hipHalf);
    const lateral = vAcross / omega;
    const heading = turnLevel(facing, side * TOE_OUT);
    // The hips as the step's taken: the leg down bends them to their running height over the ground it stands on, if they're higher.
    const support = footfalls.filter((f) => f.foot !== foot && f.on <= on).pop();
    const standOn = support ? support.at.y + ANKLE_HEIGHT - ANKLE_IN_SHOE.u : ground(s.p.x, s.p.z);
    // Stopping, they bend as low as the step out to the capture point needs (no deeper than a squat).
    const capture = stop ? want + (STEP_WIDTH - 1) * body.hipHalf : 0;
    const lunge = stop ? Math.min(standOn - lowest, standOn - (ANKLE_HEIGHT - ANKLE_IN_SHOE.u) - Math.sqrt(Math.max(0, (reach * 0.97) ** 2 - capture * capture))) : -Infinity;
    const taking: State = { ...s, p: { ...s.p, y: Math.max(s.p.y, standOn - runHeight, lunge) } };
    // The leg's reach down to the ground where it comes down (the planted ankle sits ANKLE_HEIGHT up), found from under the
    // hips: whether there's ground in reach at all, as the step's taken; and how far ahead it goes, from where they are.
    const dropFrom = (at: V3, y: number) => Math.max(lowest - ANKLE_HEIGHT, ground(at.x, at.z) - ANKLE_HEIGHT - y);
    // (The stride's reach is the legs' hold on a planted foot: to its shoe's middle, under the ankle.)
    const strideFrom = (at: V3) => dropFrom(at, taking.p.y) + ANKLE_IN_SHOE.u;
    let drop = dropFrom(s.p, taking.p.y);
    let stride = strideFrom(s.p);
    let most = 0;
    let flat = s.p;
    // Moving back (braked too hard), the step goes behind to catch it.
    const back = vAlong < 0;
    for (let pass = 0; pass < 3; pass++) {
      if (drop > reach * 0.97) return null;
      most = Math.min(STEP_AHEAD.max * leg, Math.sqrt(Math.max(0, (reach * 0.97) ** 2 - stride ** 2)));
      const ahead = back ? Math.max(-most, vAlong / omega) : Math.max(STEP_AHEAD.min * leg, Math.min(most, want));
      flat = add3(add3(add3(s.p, scale3(way, ahead)), scale3(aside, lateral)), width);
      // No further from the hip it hangs from than the leg reaches across.
      const hip = add3(s.p, scale3(rightOf(facing), side * body.hipHalf));
      const off = Math.hypot(flat.x - hip.x, flat.z - hip.z);
      if (off > most) flat = { ...flat, x: hip.x + ((flat.x - hip.x) * most) / off, z: hip.z + ((flat.z - hip.z) * most) / off };
      drop = dropFrom(flat, taking.p.y);
      stride = strideFrom(flat);
    }
    flat = clearOfEdges(ground, body.scale, flat, heading, way);
    drop = dropFrom(flat, taking.p.y);
    if (drop > reach * 0.97) return null;
    const fall = footfallAt(ground, foot, flat, heading, on, stop && want <= most ? 'capture' : 'step');
    return heightOf(taking) > ceiling(taking, fall) ? null : fall;
  };

  /**
   * A foot coming down out of the air at `on`, toe pointing `heading`: under where the hips will be halfway through the
   * landing (the knees take it over an even fall from vy), so they pass over the sole as it's taken and the weight rolls
   * heel to toe with them; any further ahead (by `brake`) and the landing brakes. With the body then.
   */
  const landing = (from: State, foot: 0 | 1, on: number, heading: V3, brake: number): { fall: Footfall; at0: State } => {
    const at0 = simulate(from, on);
    const depth = Math.max(1, heightOf(at0) - lowest - ABSORB_MARGIN * leg);
    const absorbT = (2 * depth) / Math.max(1, at0.v.y);
    const way = courseOf(at0.v);
    const ahead = Math.min(STEP_AHEAD.max * leg, (Math.max(0, dot3(at0.v, way)) * absorbT) / 2 + brake * 0.05 * leg);
    const flat = add3(at0.p, scale3(way, ahead));
    // Out to its side of the body; how far ahead is the body's, whatever way the hips face.
    const hipSide = scale3(rightOf(setup.facing(on)), (foot === 0 ? -1 : 1) * body.hipHalf);
    const spot = clearOfEdges(ground, body.scale, add3(flat, scale3(rightOf(way), dot3(hipSide, rightOf(way)))), heading, way);
    return { fall: footfallAt(ground, foot, spot, heading, on, 'step'), at0 };
  };
  /** Whether a foot coming down reaches the ground then: the hips are no higher over it than the leg reaches. */
  const reaches = (l: { fall: Footfall; at0: State }) => heightOf(l.at0) <= ceiling(l.at0, l.fall);

  let s: State = { t: setup.start, p: setup.hips, v: setup.velocity };
  // The first foot comes down as soon as it reaches the ground, a little ahead of the hips.
  const { first } = setup;
  const firstFall = (on: number) => landing(s, first.foot, on, first.heading, first.brake);
  let firstOn = landingTime(setup, s, ground, g, leg);
  let down1 = firstFall(firstOn);
  // Reaching ahead, the foot is further off the hips than straight under them: it meets the ground once they've come down
  // that much further (taken any sooner, the leg would have to stretch past its length to stand on it).
  for (let guard = 0; guard < 300 && !reaches(down1); guard++) {
    firstOn += dt;
    down1 = firstFall(firstOn);
  }
  footfalls.push(down1.fall);
  /**
   * The time from one footfall to the next at a speed (world units a second): quicker, the faster, and never so slow the body
   * runs past the planted foot before the next comes down (a step lands at most STEP_AHEAD.max ahead; the foot leaves about as far behind).
   */
  const period = (speed: number) => Math.min(
    (STEP_SLOW + (STEP_FAST - STEP_SLOW) * Math.min(1, speed / Math.sqrt(g * leg) / 0.8)) * pendulum,
    (STRIDE_REACH * leg) / Math.max(1, speed),
  );

  // Then each foot in turn, placed as it leaves the ground (the second as soon as the first is planned).
  let next: 0 | 1 = first.foot === 0 ? 1 : 0;
  let planFrom = s;
  let on = firstOn + 0.6 * period(Math.max(0, dot3(simulate(s, firstOn).v, travel)));
  for (let guard = 0; guard < 40 && on < setup.start + until; guard++) {
    const other: 0 | 1 = next === 0 ? 1 : 0;
    const stance = footfalls.filter((f) => f.foot === other).pop();
    let placed = place(planFrom, next, on);
    if (!placed) {
      // Nothing to step onto in reach (off an edge): the leg down pushes off as it would to step, the body flies, and the
      // foot comes down as the first did, once the ground's in reach.
      if (stance && stance.off > on) stance.off = on;
      const toe = (t: number) => turnLevel(setup.facing(t), (next === 0 ? -1 : 1) * TOE_OUT);
      let down = landing(planFrom, next, on, toe(on), 0);
      for (let wait = 0; !reaches(down) && wait < 240 && on < setup.start + until; wait++) {
        on += 1 / 120;
        down = landing(planFrom, next, on, toe(on), 0);
      }
      placed = reaches(down) ? down.fall : null;
    }
    if (!placed) break;
    const fall = placed;
    footfalls.push(fall);
    // The other foot, down until now, lifts once this one has the weight, or once it can't hold the body.
    if (stance) {
      let lifts = Math.min(stance.off, fall.on + DOUBLE_SUPPORT * pendulum);
      for (let at = planFrom; at.t < lifts; at = advance(at, shove)) {
        if (at.t >= stance.on && !holds(at, stance)) {
          lifts = at.t;
          break;
        }
      }
      stance.off = lifts;
    }
    if (fall.kind === 'capture') {
      // The other foot comes alongside, where the body's balance will be then, and the rider stands.
      const closeOn = fall.on + STEP_SLOW * pendulum;
      if (stance) {
        // Down until the weight's over the foot ahead and it swings up alongside, unless it can't hold the body before.
        let lifts = closeOn - CLOSE_SWING * pendulum;
        for (let at = planFrom; at.t < lifts; at = advance(at, shove)) {
          if (at.t >= fall.on && !holds(at, stance)) {
            lifts = at.t;
            break;
          }
        }
        stance.off = Math.max(stance.off, lifts);
      }
      const then = simulate(simulate(planFrom, fall.on + DOUBLE_SUPPORT * pendulum), closeOn);
      const capture = add3(then.p, scale3(then.v, 1 / Math.sqrt(g / Math.max(lowest, heightOf(then)))));
      const { at, heading } = besideStop(fall.at, capture, other, setup.facing(closeOn), travel, body);
      footfalls.push({ foot: other, on: closeOn, off: Infinity, at, heading, kind: 'close' });
      stopped = closeOn + DOUBLE_SUPPORT * pendulum;
      break;
    }
    // The next foot lifts as this one takes the weight, and lands a step later.
    const lift = fall.on + DOUBLE_SUPPORT * pendulum;
    planFrom = simulate(planFrom, lift);
    on = fall.on + period(Math.max(0, dot3(planFrom.v, travel)));
    next = next === 0 ? 1 : 0;
  }

  // The whole run, kept.
  const samples: RunOutSample[] = [];
  let still = Infinity;
  landings = [];
  for (let i = 0; s.t <= setup.start + until + 1e-9; i++) {
    const before = s;
    s = advance(s, shove);
    if (i % 2 === 0) {
      const acc = scale3(sub3(s.v, before.v), 1 / dt);
      samples.push({ hips: before.p, velocity: before.v, load: g - acc.y, hold: holdAt(before.t, Math.hypot(before.v.x, before.v.z)) });
    }
    if (still === Infinity && stopped < s.t && Math.hypot(s.v.x, s.v.y, s.v.z) < 3) still = s.t;
  }
  // The hips come down to a foot's reach as it lands over the moment before it does, not at once.
  const span = LAND_EASE * pendulum;
  for (const { t: at, by } of landings) {
    for (let i = 0; i < samples.length; i++) {
      const t = setup.start + i * 2 * dt;
      // (A sample at the landing already has the hips where it put them.)
      if (t <= at - span || t >= at - dt / 2) continue;
      const k = (t - (at - span)) / span;
      const sample = samples[i];
      samples[i] = {
        ...sample,
        hips: { ...sample.hips, y: sample.hips.y + by * k * k * (3 - 2 * k) },
        velocity: { ...sample.velocity, y: sample.velocity.y + (by * 6 * k * (1 - k)) / span },
      };
    }
  }
  return { start: setup.start, dt: 2 * dt, samples, footfalls, stopped, still };
}

/** When the first foot, reaching down ahead of the falling hips, meets the ground: not before `earliest`. */
function landingTime(setup: RunOutSetup, from: State, ground: (x: number, z: number) => number, g: number, leg: number): number {
  const height = ANKLE_HEIGHT + REACH * leg * 0.98;
  let { p, v } = from;
  let t = from.t;
  const dt = 1 / 1000;
  const shove = setup.shove ?? (() => ({ x: 0, y: 0, z: 0 }));
  while (t < from.t + 3) {
    if (t >= setup.first.earliest && ground(p.x, p.z) - p.y <= height) return t;
    const nudge = sub3(shove(t + dt), shove(t));
    v = add3(add3(v, { x: 0, y: g * dt, z: 0 }), nudge);
    p = add3(p, scale3(v, dt));
    t += dt;
  }
  return t;
}

/** The hips' sample at `t` (held at the ends). */
export function runOutAt(run: RunOut, t: number): RunOutSample {
  const at = Math.max(0, Math.min(run.samples.length - 1, (t - run.start) / run.dt));
  const i = Math.min(run.samples.length - 2, Math.floor(at));
  const k = at - i;
  const a = run.samples[i];
  const b = run.samples[i + 1] ?? a;
  return {
    hips: add3(a.hips, scale3(sub3(b.hips, a.hips), k)),
    velocity: add3(a.velocity, scale3(sub3(b.velocity, a.velocity), k)),
    load: a.load + (b.load - a.load) * k,
    hold: a.hold + (b.hold - a.hold) * k,
  };
}
