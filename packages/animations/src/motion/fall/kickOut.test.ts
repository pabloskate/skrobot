import { describe, expect, it } from 'vitest';
import { capsuleIntersectsBoard, legBoardCollision, LEG_RADII } from '../../board/boardCollision';
import { kickOutPlan } from '../../stage/kickOutFrame';
import { planStage, stageFrame, type StagePlan } from '../../stage/stage';
import { STAGE_SETS, setTerrain } from '../../sets/sets';
import { resolveSkateStyle } from '../style';
import { sweep } from '../../testing';
import type { V3 } from '../../math';
import { PERSON_SCALE, moveFrame } from '../skeleton';
import { hipsAt, kickOutAt, type KickOutPlan } from './kickOut';
import { poseOf } from './body';
import { qconj, qlog, qmul, type Quat } from './rotation';
import type { Footfall } from './runOut';

/**
 * The kick-out, everywhere it can happen: caught wrong, the rider pushes the
 * board away and runs it out on their own feet, or comes down too hard or too
 * fast to run it out and rolls. Both riders, at the flatground plaza and every
 * spot's drop, rolling up (regular) and backward (fakie), from the takeover to
 * the clip's end, held to what a body can do: no part through the ground,
 * bones that keep their length, no jump in where the hips are or how fast they
 * go, no limb that pops, no spin no one could make, feet that stay put while
 * they're down, a board that stays out of the body, a run that slows on the
 * level, and no seam where the rider's own motion takes over from the trick's.
 *
 * Each case is its own tests, planned the first time one of them runs, so
 * `-t` plays just the one (`-t "realistic lyon-25:stairs fakie"`). The quick
 * tier plays every spot once, the riders and stances taking turns.
 */

const H = 1 / 120;
/** A sole may sit this far (world units) into the grip: soles rest on it, and are rounded. */
const SOLE_GRACE = 1.5;
/** The arms', trunk's and head's thickness (robot units), as the roll keeps them off the ground and the board. */
const ARM = { upper: 5, fore: 4.4, hand: 5.8 } as const;
const TRUNK = 13;
const HEAD = 15;
/**
 * The most a limb's step off the hips may change from one 120th of a second to the next (robot units). A hard swing makes
 * a few, a foot slapping down or a fast run's knee drive up to about 22 (the robot running off a bank as fast as a grown-up
 * would); a limb that pops, 25 and more.
 */
const POP = 23;
const style = resolveSkateStyle({ popHeight: 0.5, rotationSpeed: 1.16, flickStrength: 0.88 });
const angle = (a: Quat, b: Quat) => {
  const l = qlog(qmul(a, qconj(b)));
  return Math.hypot(l.x, l.y, l.z);
};
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flat = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
const mid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

interface Case {
  label: string;
  skater: 'robot' | 'realistic';
  set: string;
  obstacle: string;
  stance: 'regular' | 'fakie';
}

interface Planned {
  stage: StagePlan;
  plan: KickOutPlan;
}

/**
 * The flatground plaza and every spot's drop, each played by both riders rolling up (regular) and backward (fakie). Spot
 * by spot, each spot's four starting one further round than the last's: the quick tier's every fourth plays each spot
 * once, with the riders and stances in turn.
 */
function cases(): Case[] {
  const ways = [['realistic', 'fakie'], ['robot', 'regular'], ['robot', 'fakie'], ['realistic', 'regular']] as const;
  const spots = STAGE_SETS.flatMap((set) => (set.obstacles?.map((o) => o.id) ?? ['stairs'])
    .filter((obstacle) => set.id === 'plaza' || setTerrain(set.id, obstacle as never))
    .map((obstacle) => ({ set: set.id as string, obstacle: obstacle as string })));
  return spots.flatMap(({ set, obstacle }, i) => ways.map((_, j) => {
    const [skater, stance] = ways[(i + j) % ways.length];
    return { label: `${skater} ${set}:${obstacle} ${stance}`, skater, set, obstacle, stance };
  }));
}

/** A case's stage and kick-out, planned the first time it's asked for. */
const planned = new Map<Case, Planned>();
function planOf(c: Case): Planned {
  let known = planned.get(c);
  if (!known) {
    const stage = planStage({ id: 'Kickflip', name: 'Kickflip', base: 'Kickflip', stance: c.stance }, {
      landed: false, riderStance: 'regular', style, fall: 'kickout', shankProgress: 0.6, skater: c.skater, set: c.set as never, obstacle: c.obstacle as never,
    });
    known = { stage, plan: kickOutPlan(stage) };
    planned.set(c, known);
  }
  return known;
}

interface Measures {
  /** Largest change in the hips' step from one 120th of a second to the next (robot units), on the feet and rolling. */
  jerkOnFeet: number;
  jerkRolling: number;
  /** Largest change in a knee's, ankle's, hand's, elbow's or the head's step off the hips, likewise (robot units). */
  pop: number;
  /** Fastest the pelvis or trunk turns (radians a second). */
  turn: number;
  /** Most a thigh or shin stretches or shrinks from its length (a share of it). */
  stretch: number;
  /** Lowest the hips, knees, and ankles get over the ground under them (world units). */
  hipsLow: number;
  kneesLow: number;
  anklesLow: number;
  /** Lowest an elbow or forearm gets over the ground, past its own thickness (robot units). */
  elbowsLow: number;
  /** Furthest a planted foot's ankle slides across the ground while it's down. */
  slip: number;
  /** Frames a leg goes through the board (the kicking foot pressing on it while it pushes aside), and where. */
  through: string[];
  /** Frames the board goes through an arm, the trunk, the head or a thigh. */
  inBody: string[];
  /** Most the run speeds up past its first step, where every step is on the same level. */
  levelGain: number | null;
  /** What the drawn frame steps by into the takeover, much more than either side of it. */
  seams: string[];
}

/** Every drawn quantity, flattened, for the seam at the takeover. */
function drawn(stage: StagePlan, t: number): Record<string, number> {
  const f = stageFrame(stage, t, 1);
  const o: Record<string, number> = {};
  const put = (name: string, p: V3 | null | undefined, k = 1) => {
    if (!p) return;
    o[`${name}.x`] = p.x * k;
    o[`${name}.y`] = p.y * k;
    o[`${name}.z`] = p.z * k;
  };
  f.rig.legs.forEach((l, i) => {
    put(`hip${i}`, l.hip);
    put(`knee${i}`, l.knee);
    put(`ankle${i}`, l.ankle);
    put(`shoe${i}`, l.shoe.origin);
    put(`shoeFwd${i}`, l.shoe.fwd, 20);
    put(`shoeUp${i}`, l.shoe.up, 20);
  });
  f.rig.arms.forEach((a, i) => {
    put(`shoulder${i}`, a.shoulder);
    put(`elbow${i}`, a.elbow);
    put(`hand${i}`, a.hand);
  });
  put('head', f.rig.head.origin);
  put('headFwd', f.rig.head.fwd, 20);
  put('headUp', f.rig.head.up, 20);
  put('torso', f.rig.torso.origin);
  put('board', f.rig.board.center);
  o.lift = f.lift;
  o.scroll = f.scroll;
  return o;
}

function measure({ stage, plan }: Planned): Measures {
  const g = plan.setup.ground;
  const k = plan.setup.body.scale;
  const above = (p: V3) => g(p.x, p.z) - p.y;
  const rolling = (t: number) => plan.roll != null && t >= plan.roll.start && t < plan.roll.end;
  const m: Measures = {
    jerkOnFeet: 0, jerkRolling: 0, pop: 0, turn: 0, stretch: 0, hipsLow: Infinity, kneesLow: Infinity, anklesLow: Infinity,
    elbowsLow: Infinity, slip: 0, through: [], inBody: [], levelGain: null, seams: [],
  };
  const first = kickOutAt(plan, plan.takeover).rig;
  const bones = first.legs.map((leg) => [dist(leg.hip, leg.knee), dist(leg.knee, leg.ankle)]);
  let prev = poseOf(first);
  let prevStep: V3 | null = null;
  const limbs: V3[][] = [];
  for (let t = plan.takeover + H; t <= stage.end; t += H) {
    const { rig } = kickOutAt(plan, t);
    const pose = poseOf(rig);
    const at = (t - plan.takeover).toFixed(3);
    m.turn = Math.max(m.turn, angle(pose.pelvis, prev.pelvis) / H, angle(pose.torso, prev.torso) / H);
    const step = { x: pose.hips.x - prev.hips.x, y: pose.hips.y - prev.hips.y, z: pose.hips.z - prev.hips.z };
    if (prevStep) {
      const jerk = dist(step, prevStep) / k;
      if (rolling(t)) m.jerkRolling = Math.max(m.jerkRolling, jerk);
      else m.jerkOnFeet = Math.max(m.jerkOnFeet, jerk);
    }
    prevStep = step;
    prev = pose;
    // The limbs off the hips, in a robot's units.
    const hips = mid(rig.legs[0].hip, rig.legs[1].hip);
    const off = (p: V3): V3 => ({ x: (p.x - hips.x) / k, y: (p.y - hips.y) / k, z: (p.z - hips.z) / k });
    limbs.push([...rig.legs.flatMap((l) => [off(l.knee), off(l.ankle)]), ...rig.arms.flatMap((a) => [off(a.elbow), off(a.hand)]), off(rig.head.origin)]);
    if (limbs.length >= 3) {
      const [a, b, c] = limbs.slice(-3);
      b.forEach((p, j) => {
        m.pop = Math.max(m.pop, Math.hypot(a[j].x - 2 * p.x + c[j].x, a[j].y - 2 * p.y + c[j].y, a[j].z - 2 * p.z + c[j].z));
      });
      limbs.shift();
    }
    rig.legs.forEach((leg, i) => {
      m.stretch = Math.max(m.stretch, Math.abs(dist(leg.hip, leg.knee) / bones[i][0] - 1), Math.abs(dist(leg.knee, leg.ankle) / bones[i][1] - 1));
      m.kneesLow = Math.min(m.kneesLow, above(leg.knee));
      m.anklesLow = Math.min(m.anklesLow, above(leg.ankle));
      // A sole may sit a little into the grip (soles rest on it, and are rounded); the kicking foot presses on the board till it lets go.
      const c = legBoardCollision(rig.board, { ...leg, shoe: moveFrame(leg.shoe, { x: 0, y: -SOLE_GRACE, z: 0 }) });
      const kicking = i === plan.kick && t <= plan.release + 0.02;
      if (((c.shoe || c.shin) && !kicking) || c.thigh) m.through.push(`${at}:${i}${c.shoe && !kicking ? 's' : ''}${c.shin && !kicking ? 'S' : ''}${c.thigh ? 'T' : ''}`);
    });
    for (const a of rig.arms) for (const p of [a.elbow, mid(a.elbow, a.hand)]) m.elbowsLow = Math.min(m.elbowsLow, above(p) / k - ARM.fore);
    // The board against the rest of the body.
    const hit = (from: V3, to: V3, r0: number, r1: number) => capsuleIntersectsBoard(rig.board, from as never, to as never, r0 * k, r1 * k, 0);
    const neck = mid(rig.arms[0].shoulder, rig.arms[1].shoulder);
    const parts = [
      ...rig.arms.map((a, i) => (hit(a.shoulder, a.elbow, ARM.upper, ARM.fore) || hit(a.elbow, a.hand, ARM.fore, ARM.hand) ? `arm${i}` : '')),
      hit(hips, neck, TRUNK, TRUNK) ? 'trunk' : '',
      hit(rig.head.origin, rig.head.origin, HEAD, HEAD) ? 'head' : '',
      ...rig.legs.map((l, i) => (hit(l.hip, l.knee, LEG_RADII.hip, LEG_RADII.knee) ? `thigh${i}` : '')),
    ].filter(Boolean);
    if (parts.length) m.inBody.push(`${at}:${parts.join('+')}`);
    m.hipsLow = Math.min(m.hipsLow, above(pose.hips));
  }
  // Each foot down, from just after it lands to just before it lifts (the clip's end, at most), and on its feet.
  const down = (falls: Footfall[], from: number, to: number) => {
    for (const f of falls) {
      const on = Math.max(f.on, from) + 0.03;
      const off = Math.min(f.off, to, stage.end) - 0.03;
      if (off <= on) continue;
      const at = kickOutAt(plan, on).rig.legs[f.foot].ankle;
      for (let t = on; t <= off; t += H) m.slip = Math.max(m.slip, flat(kickOutAt(plan, t).rig.legs[f.foot].ankle, at));
    }
  };
  down(plan.run.footfalls, plan.takeover, plan.roll ? plan.roll.start : Infinity);
  if (plan.roll && plan.after) down(plan.after.run.footfalls, plan.roll.end, Infinity);
  // On the level, the run only slows (the push it starts with, and its steps, brake it).
  const run = plan.after ? plan.after.run : plan.run;
  const levels = run.footfalls.map((f) => g(f.at.x, f.at.z));
  if (Math.max(...levels) - Math.min(...levels) < 1) {
    const speed = (t: number) => {
      const v = hipsAt(plan, t).velocity;
      return Math.hypot(v.x, v.z);
    };
    const from = run.footfalls[0].on;
    const start = speed(from);
    let gain = 0;
    for (let t = from + 0.25; t <= stage.end; t += H) if (!rolling(t)) gain = Math.max(gain, speed(t) - start);
    m.levelGain = gain;
  }
  // Into the takeover, every drawn quantity steps by about what it steps by either side (a 600th of a second apart).
  const h = 1 / 600;
  const [a, b, c, d] = [-2, -1, 0, 1].map((n) => drawn(stage, plan.takeover + n * h));
  for (const key of Object.keys(c)) {
    const into = Math.abs(c[key] - b[key]);
    const near = Math.max(Math.abs(b[key] - a[key]), Math.abs(d[key] - c[key]));
    if (!(key in a && key in b && key in d) || into > 3 * near + 0.05) m.seams.push(`${key} ${into.toFixed(2)} vs ${near.toFixed(2)}`);
  }
  return m;
}

/** A case's measures, taken the first time a test asks for them. */
const measured = new Map<Case, Measures>();
const measuresOf = (c: Case) => measured.get(c) ?? measured.set(c, measure(planOf(c))).get(c)!;

describe('kick-out', () => {
  const all = cases();
  const played = sweep(all, 4);

  for (const c of played) {
    describe(c.label, () => {
      /** The case, where `bad` holds of its measures. */
      const failing = (bad: (m: Measures, plan: KickOutPlan) => unknown) => (bad(measuresOf(c), planOf(c).plan) ? [c.label] : []);

      it('keeps every bone its length, and the hips, knees and ankles above the ground', () => {
        expect(failing((m) => m.stretch > 0.005)).toEqual([]);
        expect(failing((m) => m.hipsLow <= 0 || m.kneesLow <= 0 || m.anklesLow <= 0)).toEqual([]);
      });

      it('keeps the elbows and forearms off the ground (grazing it at most)', () => {
        expect(failing((m) => m.elbowsLow < -1.5)).toEqual([]);
      });

      it('moves the hips without a jolt, on its feet and rolling', () => {
        expect(failing((m) => m.jerkOnFeet > 2)).toEqual([]);
        expect(failing((m) => m.jerkRolling > 6)).toEqual([]);
      });

      it('moves no limb with a pop', () => {
        expect(failing((m) => m.pop > POP)).toEqual([]);
      });

      it('turns no faster than a body can', () => {
        // A grown-up's 32 rad/s; a smaller body's quicker by the root of how much smaller (rates go as √(gravity / size)).
        expect(failing((m, plan) => m.turn > 32 * Math.sqrt(PERSON_SCALE / plan.setup.body.scale))).toEqual([]);
      });

      it('keeps a planted foot where it is', () => {
        expect(failing((m) => m.slip > 6)).toEqual([]);
      });

      it('keeps the legs out of the board, but for a sole grazing it a frame or two', () => {
        expect(failing((m) => m.through.length > 2 || m.through.some((w) => !w.endsWith('s')))).toEqual([]);
      });

      it('keeps the board out of the arms, trunk, head and thighs', () => {
        expect(failing((m) => m.inBody.length > 0)).toEqual([]);
      });

      it('only slows running on the level', () => {
        expect(failing((m) => m.levelGain != null && m.levelGain > 1)).toEqual([]);
      });

      it('takes over from the trick without a seam', () => {
        expect(failing((m) => m.seams.length > 0)).toEqual([]);
      });
    });
  }

  // Last, so it reads the plans the cases above have made.
  it('plays at every drop, both riders, both ways, and rolls off the big ones', () => {
    expect(all.length).toBeGreaterThanOrEqual(40);
    const plans = played.map((c) => planOf(c).plan);
    expect(plans.filter((plan) => plan.roll).length).toBeGreaterThan(0);
    expect(plans.filter((plan) => !plan.roll).length).toBeGreaterThan(0);
  });
}, 300_000);
