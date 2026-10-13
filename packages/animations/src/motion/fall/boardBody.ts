import { BOARD_WIDTH_SCALE } from '../../board/boardDimensions';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../../board/deck';
import { HANGER_BOTTOM, WHEEL_HALF_W, WHEEL_R, WHEEL_SPIN, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { add3, clamp01, cross3, dot3, norm3, scale3, sub3, type V3 } from '../../math';
import type { BoardRig } from '../skeleton';
import { qconj, qexp, qlog, qmul, qnorm, qrot, qslerp, type Quat } from './rotation';

/**
 * A skateboard on its own: a rigid body flying, tumbling and bouncing on the
 * ground once nothing holds it, and rolling away on its wheels if it comes
 * down on them. A kicked-out board (kickOut.ts) is one from the moment the
 * rider loses it, with the rider's push on it as a force at the foot.
 *
 * The deck is about a twentieth of a rider, so the board takes what the
 * ground and the foot give it and nothing else; the rider doesn't feel it.
 * Its mass is 1, so a push is the speed it gives the board. Units are the
 * physics' (y down), the board's own frame as rig.ts's (x to the nose, y
 * down, z across).
 *
 * Simulated once per attempt at SIM_HZ and kept as samples, so any frame of
 * the attempt reads it back in constant time.
 */

/** Steps a second, and the samples kept. */
const SIM_HZ = 1200;
const KEEP_EVERY = 5;
/** The board's center of mass under the deck's middle: trucks and wheels are about two fifths of it. */
const COM_LOCAL: V3 = { x: 0, y: 3, z: 0 };
/** Moments of inertia about the center of mass, along the board's own axes: easy to roll, hard to spin flat or end over end. */
const INERTIA: V3 = { x: 60, y: 810, z: 790 };
/**
 * Bounce off the ground (kept under a slow approach, so a board at rest stays at rest), and the speed below which it's dead.
 * A deck strike is a dead clack: the ply, the trucks and the bushings take most of it.
 */
const BOUNCE = { deck: 0.2, wheel: 0.35 } as const;
const BOUNCE_FROM = 45;
/**
 * Friction: the deck's printed bottom sliding on concrete (slick: it's what boardslides on), its top outline (the ply's
 * edge and the grip's rim, scraping), and a wheel across its tread (urethane grips). Along its roll, only rolling
 * resistance. Grippier ends pin a deck that comes down on one at speed, and it vaults off them far higher than decks do.
 */
const FRICTION = { bottom: 0.35, grip: 0.45, wheelAcross: 0.8, wheelRoll: 0.025 } as const;
/** The axle's level share (cosine of its tilt) at which a wheel scrubs on its side, and from which it rolls on its tread. */
const ROLL_TILT = { scrub: 0.7, roll: 0.9 } as const;
/** How much of a point's depth in the ground is taken out a step, past a slop it may sit in. */
const SINK_RECOVERY = 0.1;
const SINK_SLOP = 0.08;
/** Contact passes per step. */
const PASSES = 8;
/** Air drag on the spin, per second: a tumbling deck slows a little in the air; much more on the ground, where wood and grip scuff (a deck left rocking on its kicks settles). */
const SPIN_DRAG = 0.15;
const GROUND_SPIN_DRAG = 3;
/** A board on the ground this slow (units/s, radians/s) for SLEEP_AFTER seconds has come to rest, and stays there. */
const SLEEP = { speed: 10, spin: 0.7 } as const;
const SLEEP_AFTER = 0.25;

interface Contact {
  local: V3;
  kind: 'bottom' | 'grip' | 'wheel';
}

/** Board-local points that can meet the ground: the deck's outline, top and bottom, at the drawn width, and the wheels' rims. */
const CONTACTS: Contact[] = (() => {
  const out: Contact[] = [];
  const wide = (p: V3): V3 => ({ x: p.x, y: p.y, z: p.z * BOARD_WIDTH_SCALE });
  TOP_LOCAL.forEach((p, i) => { if (i % 2 === 0) out.push({ local: wide(p), kind: 'grip' }); });
  BOTTOM_LOCAL.forEach((p, i) => { if (i % 2 === 0) out.push({ local: wide(p), kind: 'bottom' }); });
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (const side of [-1, 1]) {
      for (const face of [-1, 1]) {
        const z = side * WHEEL_Z * BOARD_WIDTH_SCALE + face * WHEEL_HALF_W;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          out.push({ local: { x: x + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z }, kind: 'wheel' });
        }
      }
    }
  }
  return out;
})();

/**
 * And the trucks' hangers, under the deck between each pair of wheels: what a board left on a rail rests on (a 50-50's
 * trucks straddle it), metal sliding like the deck's printed bottom. On flat ground the wheels always meet it first.
 */
const HANGER_CONTACTS: Contact[] = CONTACTS.concat([-WHEEL_X, WHEEL_X].flatMap((x) =>
  [-1, -0.5, 0, 0.5, 1].map((k) => ({ local: { x, y: HANGER_BOTTOM, z: k * (WHEEL_Z * BOARD_WIDTH_SCALE - WHEEL_HALF_W) }, kind: 'bottom' as const }))));

/** Where the board is at one instant: its deck's middle, its turn, and how far its wheels have turned (radians). */
export interface BoardPose {
  center: V3;
  q: Quat;
  wheel: number;
}

/** The board free, with its motion: velocity of its deck's middle and angular velocity (world, radians/s). */
export interface BoardMotion extends BoardPose {
  velocity: V3;
  spin: V3;
}

/** A shove on the board: `impulse` in all (speed given), spread over [from, until] in a half sine, at a board-local point. */
export interface Push {
  from: number;
  until: number;
  at: V3;
  impulse: V3;
}

export interface BoardTrack {
  start: number;
  dt: number;
  poses: BoardPose[];
  /** When the board first touches the ground, or Infinity. */
  touchdown: number;
}

const INERTIA_INVERSE: V3 = { x: 1 / INERTIA.x, y: 1 / INERTIA.y, z: 1 / INERTIA.z };
const inertiaTimes = (q: Quat, v: V3, inverse: boolean): V3 => {
  const local = qrot(qconj(q), v);
  const k = inverse ? INERTIA_INVERSE : INERTIA;
  return qrot(q, { x: local.x * k.x, y: local.y * k.y, z: local.z * k.z });
};

interface BoardSimOptions {
  gravity: number;
  /** The ground's height under a point, given where the point is up and down too (`y`): a rail stands only over its underside. */
  ground: (x: number, z: number, y: number) => number;
  pushes?: Push[];
  /** Whether the trucks' hangers meet the ground too: a board left on a rail (whose `ground` has the rail's top in it). */
  hangers?: boolean;
}

/**
 * The board from `start` (at clock `t0`) until `t1`, over ground whose
 * physics height under (x, z) is `ground`, falling at `gravity`, shoved by
 * `pushes`.
 */
export function simulateBoard(start: BoardMotion, t0: number, t1: number, options: BoardSimOptions): BoardTrack {
  return boardSimulation(start, t0, options)(t1);
}

/**
 * The same, followed as far as it's asked for: each track until a later clock
 * goes on from where the last left off, and one until an earlier clock is the
 * start of what's been followed. Each is the track simulateBoard gives.
 */
export function boardSimulation(start: BoardMotion, t0: number, options: BoardSimOptions): (t1: number) => BoardTrack {
  const { gravity, ground, pushes = [] } = options;
  const contacts = options.hangers ? HANGER_CONTACTS : CONTACTS;
  const dt = 1 / SIM_HZ;
  let q = start.q;
  // The body moves about its center of mass.
  let com = add3(start.center, qrot(q, COM_LOCAL));
  let v = add3(start.velocity, cross3(start.spin, qrot(q, COM_LOCAL)));
  let w = start.spin;
  let wheel = start.wheel;
  // Wheels coast at their spin in the air, and roll with the ground on it.
  let wheelRate = (WHEEL_SPIN * dot3(start.velocity, qrot(q, { x: 1, y: 0, z: 0 }))) / WHEEL_R;
  const poses: BoardPose[] = [];
  // The step it first touches the ground at, if it has.
  let touchdownStep = -1;
  let still = 0;
  let asleep = false;
  const centerOf = () => sub3(com, qrot(q, COM_LOCAL));
  let i = 0;
  const stepTo = (steps: number) => {
    for (; i <= steps; i++) {
      const t = t0 + i * dt;
      if (i % KEEP_EVERY === 0) poses.push({ center: centerOf(), q, wheel });
      if (asleep) continue;
      // Forces: gravity, and any push under way, at its point.
      v = add3(v, { x: 0, y: gravity * dt, z: 0 });
      for (const push of pushes) {
        if (t < push.from || t >= push.until) continue;
        const span = push.until - push.from;
        // A half sine over the span gives the whole impulse.
        const share = (Math.PI / 2) * Math.sin((Math.PI * (t - push.from)) / span) * (dt / span);
        const j = scale3(push.impulse, share);
        const r = qrot(q, sub3(push.at, COM_LOCAL));
        v = add3(v, j);
        w = add3(w, inertiaTimes(q, cross3(r, j), true));
      }
      // Free rotation keeps its angular momentum, not its angular velocity.
      const L = inertiaTimes(q, w, false);
      w = add3(w, scale3(inertiaTimes(q, cross3(L, w), true), dt));
      w = scale3(w, 1 - SPIN_DRAG * dt);

      // The ground: impulses at every point in it, moving into it.
      // Impulses so far at each contact: along the ground's normal, and along the roll and across it (a wheel), or x and z (the deck).
      const touching: Array<{ c: Contact; r: V3; depth: number; approach: number; normal: number; along: number; across: number; k: number[] }> = [];
      for (const c of contacts) {
        const r = qrot(q, sub3(c.local, COM_LOCAL));
        const p = add3(com, r);
        const depth = p.y - ground(p.x, p.z, p.y);
        if (depth < -0.05) continue;
        const vp = add3(v, cross3(w, r));
        // Normal is up: -y.
        touching.push({ c, r, depth, approach: vp.y, normal: 0, along: 0, across: 0, k: [] });
      }
      if (touching.length) {
        if (touchdownStep < 0) touchdownStep = i;
        const up: V3 = { x: 0, y: -1, z: 0 };
        // A wheel rolls only on its tread: about an axle near level. Tipped up on its side face it scrubs like the deck.
        const axle = qrot(q, { x: 0, y: 0, z: 1 });
        const axleLevel = Math.hypot(axle.x, axle.z);
        const rolls = clamp01((axleLevel - ROLL_TILT.scrub) / (ROLL_TILT.roll - ROLL_TILT.scrub));
        const roll = axleLevel > 1e-3 ? norm3({ x: axle.z, y: 0, z: -axle.x }) : norm3({ ...qrot(q, { x: 1, y: 0, z: 0 }), y: 0 });
        const side = cross3(up, roll);
        const wheelAlong = FRICTION.wheelAcross + (FRICTION.wheelRoll - FRICTION.wheelAcross) * rolls;
        const kOf = (r: V3, n: V3) => 1 + dot3(n, cross3(inertiaTimes(q, cross3(r, n), true), r));
        // Each point's effective mass along each way it's pushed, the same every pass.
        const X: V3 = { x: 1, y: 0, z: 0 };
        const Z: V3 = { x: 0, y: 0, z: 1 };
        for (const contact of touching) {
          const { r } = contact;
          contact.k = contact.c.kind === 'wheel' ? [kOf(r, up), kOf(r, roll), kOf(r, side)] : [kOf(r, up), kOf(r, X), kOf(r, Z)];
        }
        for (let pass = 0; pass < PASSES; pass++) {
          for (const contact of touching) {
            const { c, r } = contact;
            const vp = add3(v, cross3(w, r));
            // Normal: stop the approach, or bounce off a fast one.
            const vn = -vp.y;
            // A point sunk into the ground is eased back out, a little each step, rather than lifted at once (which would feed a rocking board).
            const bounce = Math.max(
              contact.approach > BOUNCE_FROM ? (c.kind === 'wheel' ? BOUNCE.wheel : BOUNCE.deck) * contact.approach : 0,
              (SINK_RECOVERY * Math.max(0, contact.depth - SINK_SLOP)) / dt,
            );
            let jn = (bounce - vn) / contact.k[0];
            const total = Math.max(0, contact.normal + jn);
            jn = total - contact.normal;
            contact.normal = total;
            const apply = (j: V3) => {
              v = add3(v, j);
              w = add3(w, inertiaTimes(q, cross3(r, j), true));
            };
            apply(scale3(up, jn));
            // Friction, by direction for a wheel (rolls along, grips across), the same every way for the deck.
            const friction = (dir: V3, k: number, mu: number, key: 'along' | 'across') => {
              const vt = dot3(add3(v, cross3(w, r)), dir);
              let jt = -vt / k;
              const limit = mu * contact.normal;
              const next = Math.max(-limit, Math.min(limit, contact[key] + jt));
              jt = next - contact[key];
              contact[key] = next;
              apply(scale3(dir, jt));
            };
            if (c.kind === 'wheel') {
              friction(roll, contact.k[1], wheelAlong, 'along');
              friction(side, contact.k[2], FRICTION.wheelAcross, 'across');
            } else {
              // The deck slides any way: the friction impulse so far is a vector on the ground, capped as a whole.
              const vt = add3(v, cross3(w, r));
              const want = {
                x: contact.along - vt.x / contact.k[1],
                z: contact.across - vt.z / contact.k[2],
              };
              const limit = (c.kind === 'grip' ? FRICTION.grip : FRICTION.bottom) * contact.normal;
              const size = Math.hypot(want.x, want.z);
              const k = size > limit ? limit / size : 1;
              apply({ x: want.x * k - contact.along, y: 0, z: want.z * k - contact.across });
              contact.along = want.x * k;
              contact.across = want.z * k;
            }
          }
        }
        w = scale3(w, 1 - GROUND_SPIN_DRAG * dt);
        still = Math.hypot(v.x, v.y, v.z) < SLEEP.speed && Math.hypot(w.x, w.y, w.z) < SLEEP.spin ? still + dt : 0;
        if (still > SLEEP_AFTER) {
          asleep = true;
          continue;
        }
        // Wheels on the ground turn with it, rolling on their treads.
        if (rolls > 0.5 && touching.some((c) => c.c.kind === 'wheel')) {
          const along = qrot(q, { x: 1, y: 0, z: 0 });
          wheelRate = (WHEEL_SPIN * dot3(v, along)) / WHEEL_R;
        }
      }
      com = add3(com, scale3(v, dt));
      q = qnorm(qmul(qexp(scale3(w, dt)), q));
      wheel += wheelRate * dt;
    }
  };
  return (t1) => {
    const steps = Math.ceil((t1 - t0) * SIM_HZ);
    stepTo(steps);
    return {
      start: t0,
      dt: dt * KEEP_EVERY,
      poses: poses.slice(0, Math.max(0, Math.floor(steps / KEEP_EVERY) + 1)),
      touchdown: touchdownStep >= 0 && touchdownStep <= steps ? t0 + touchdownStep * dt : Infinity,
    };
  };
}

/** The board on its track at clock `t` (held at its ends). */
export function boardAt(track: BoardTrack, t: number): BoardPose {
  const { poses } = track;
  const at = Math.max(0, Math.min(poses.length - 1, (t - track.start) / track.dt));
  const i = Math.min(poses.length - 2, Math.floor(at));
  if (i < 0) return poses[0];
  const k = at - i;
  const a = poses[i];
  const b = poses[i + 1];
  return {
    center: add3(a.center, scale3(sub3(b.center, a.center), k)),
    q: qslerp(a.q, b.q, k),
    wheel: a.wheel + (b.wheel - a.wheel) * k,
  };
}

/** The board's velocity and spin at `t`, by differences along the track. */
export function boardMotionAt(track: BoardTrack, t: number): BoardMotion {
  const h = track.dt;
  const a = boardAt(track, t - h);
  const b = boardAt(track, t + h);
  const now = boardAt(track, t);
  return {
    ...now,
    velocity: scale3(sub3(b.center, a.center), 1 / (2 * h)),
    spin: scale3(qlog(qmul(b.q, qconj(a.q))), 1 / (2 * h)),
  };
}

/** A pose as the rig's board, moved by `offset` (the stage's scroll). Its angles are read off for the record only. */
export function boardRigOf(pose: BoardPose, offset: V3 = { x: 0, y: 0, z: 0 }): BoardRig {
  const center = add3(pose.center, offset);
  const dir = (local: V3) => qrot(pose.q, local);
  const nose = dir({ x: 1, y: 0, z: 0 });
  const down = dir({ x: 0, y: 1, z: 0 });
  return {
    center,
    point: (local) => add3(center, dir(local)),
    dir,
    flipDeg: (Math.atan2(down.z, down.y) * 180) / Math.PI,
    yawDeg: (Math.atan2(-nose.z, nose.x) * 180) / Math.PI,
    pitchDeg: (Math.asin(Math.max(-1, Math.min(1, nose.y))) * 180) / Math.PI,
  };
}
