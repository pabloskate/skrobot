import { describe, expect, it } from 'vitest';
import { capsuleIntersectsBoard, legBoardCollision } from '../../board/boardCollision';
import { slipBackPlan } from '../../stage/slipBackFrame';
import { planStage, stageFrame, type StagePlan } from '../../stage/stage';
import { STAGE_SETS, setTerrain } from '../../sets/sets';
import { resolveSkateStyle } from '../style';
import { isFiniteFrame, sweep } from '../../testing';
import { dot3, sub3, type V3 } from '../../math';
import { PERSON_SCALE, moveFrame } from '../skeleton';
import { LIMB_RADII, SOLE_GRACE, poseOf } from './body';
import { trunkInGround } from './rollOut';
import { qconj, qlog, qmul, type Quat } from './rotation';
import { slipBackAt, slipBackHips, type SlipBackPlan } from './slipBack';

/**
 * The slip back, everywhere it can happen: landed with the weight behind the
 * board, which shoots out ahead while the rider sits down and slides. Both
 * riders, at the flatground plaza and every spot's drop, rolling up (regular)
 * and backward (fakie), from the takeover to the clip's end, held to what a
 * body can do: no part through the ground, bones that keep their length, no
 * jump in where the hips are or how fast they go, no limb that pops, no spin
 * no one could make, a board that leaves ahead and stays out of the body, a
 * slide that slows on the level, and no seam where the rider's own motion
 * takes over from the trick's. (Landing on a bank, the bank is right behind
 * the board: it sits the rider down before the board's out from under their
 * legs, which cross its tail for a moment as it goes.)
 *
 * Each case is its own tests, planned the first time one of them runs, so
 * `-t` plays just the one (`-t "realistic el-toro:stairs fakie"`). The quick
 * tier plays every spot once, the riders and stances taking turns.
 */

const H = 1 / 120;
/** As a kick-out's (kickOut.test.ts): the most a limb's step off the hips may change from one 120th of a second to the next (robot units). */
const POP = 23;
const style = resolveSkateStyle({ popHeight: 0.5, rotationSpeed: 1.16, flickStrength: 0.88 });
const angle = (a: Quat, b: Quat) => {
  const l = qlog(qmul(a, qconj(b)));
  return Math.hypot(l.x, l.y, l.z);
};
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

interface Case {
  label: string;
  skater: 'robot' | 'realistic';
  set: string;
  obstacle: string;
  stance: 'regular' | 'fakie';
  /** Whether the landing's on a bank. */
  bank: boolean;
}

/** Frames (120 a second) a rider a bank has sat down may have their legs, and the rest of them, across the board as it leaves. */
const BANK_CROSSING = { legs: 12, body: 6 } as const;

interface Planned {
  stage: StagePlan;
  plan: SlipBackPlan;
}

/** The flatground plaza and every spot's drop, each played by both riders rolling up (regular) and backward (fakie), as the kick-out's are. */
function cases(): Case[] {
  const ways = [['realistic', 'fakie'], ['robot', 'regular'], ['robot', 'fakie'], ['realistic', 'regular']] as const;
  const spots = STAGE_SETS.flatMap((set) => (set.obstacles?.map((o) => o.id) ?? ['stairs'])
    .filter((obstacle) => set.id === 'plaza' || setTerrain(set.id, obstacle as never))
    .map((obstacle) => ({ set: set.id as string, obstacle: obstacle as string })));
  return spots.flatMap(({ set, obstacle }, i) => ways.map((_, j) => {
    const [skater, stance] = ways[(i + j) % ways.length];
    return { label: `${skater} ${set}:${obstacle} ${stance}`, skater, set, obstacle, stance, bank: setTerrain(set as never, obstacle as never)?.slope != null };
  }));
}

/** A case's stage and slip back, planned the first time it's asked for. */
const planned = new Map<Case, Planned>();
function planOf(c: Case): Planned {
  let known = planned.get(c);
  if (!known) {
    const stage = planStage({ id: 'Kickflip', name: 'Kickflip', base: 'Kickflip', stance: c.stance }, {
      landed: false, riderStance: 'regular', style, fall: 'slipback', shankProgress: 0.6, skater: c.skater, set: c.set as never, obstacle: c.obstacle as never,
    });
    known = { stage, plan: slipBackPlan(stage) };
    planned.set(c, known);
  }
  return known;
}

interface Measures {
  /** Largest change in the hips' step from one 120th of a second to the next (robot units). */
  jerk: number;
  /** Largest change in a knee's, ankle's, hand's, elbow's or the head's step off the hips, likewise (robot units). */
  pop: number;
  /** Fastest the pelvis or trunk turns (radians a second). */
  turn: number;
  /** Most a thigh or shin stretches or shrinks from its length (a share of it). */
  stretch: number;
  /** Lowest the knees and ankles get over the ground under them, and deepest the trunk goes into it (world units). */
  kneesLow: number;
  anklesLow: number;
  trunkDeep: number;
  /** Lowest an elbow, forearm or hand gets over the ground, past its own thickness (robot units). */
  armsLow: number;
  /** Frames a leg goes through the board once the feet have left it, and frames the board's in an arm, the trunk, the head or a thigh. */
  through: string[];
  inBody: string[];
  /** Most the slide speeds up past the speed it sat down at, where it's on the level throughout. */
  levelGain: number | null;
  /** How far ahead of the hips (along the way they were going) the board is at the end, in legs. */
  boardAhead: number;
  /** A frame with a number that isn't finite. */
  broken: number | null;
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
  const { body } = plan.setup;
  const k = body.scale;
  const leg = body.thigh + body.shin;
  const above = (p: V3) => g(p.x, p.z) - p.y;
  const m: Measures = {
    jerk: 0, pop: 0, turn: 0, stretch: 0, kneesLow: Infinity, anklesLow: Infinity, trunkDeep: -Infinity, armsLow: Infinity,
    through: [], inBody: [], levelGain: null, boardAhead: 0, broken: null, seams: [],
  };
  const first = slipBackAt(plan, plan.takeover).rig;
  const bones = first.legs.map((l) => [dist(l.hip, l.knee), dist(l.knee, l.ankle)]);
  let prev = poseOf(first);
  let prevStep: V3 | null = null;
  const limbs: V3[][] = [];
  for (let t = plan.takeover + H; t <= stage.end; t += H) {
    const { rig } = slipBackAt(plan, t);
    const pose = poseOf(rig);
    const at = (t - plan.touchdown).toFixed(3);
    if (m.broken == null && !isFiniteFrame(stageFrame(stage, t, 1))) m.broken = t;
    m.turn = Math.max(m.turn, angle(pose.pelvis, prev.pelvis) / H, angle(pose.torso, prev.torso) / H);
    const step = { x: pose.hips.x - prev.hips.x, y: pose.hips.y - prev.hips.y, z: pose.hips.z - prev.hips.z };
    if (prevStep) m.jerk = Math.max(m.jerk, dist(step, prevStep) / k);
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
    const offBoard = t > plan.release + 0.02;
    rig.legs.forEach((l, i) => {
      m.stretch = Math.max(m.stretch, Math.abs(dist(l.hip, l.knee) / bones[i][0] - 1), Math.abs(dist(l.knee, l.ankle) / bones[i][1] - 1));
      m.kneesLow = Math.min(m.kneesLow, above(l.knee));
      m.anklesLow = Math.min(m.anklesLow, above(l.ankle));
      // A sole may sit a little into the grip (soles rest on it, and are rounded); on the board, the feet stand on it.
      const c = legBoardCollision(rig.board, { ...l, shoe: moveFrame(l.shoe, { x: 0, y: -SOLE_GRACE, z: 0 }) });
      if ((offBoard && (c.shoe || c.shin)) || c.thigh) m.through.push(`${at}:${i}${c.shoe ? 's' : ''}${c.shin ? 'S' : ''}${c.thigh ? 'T' : ''}`);
    });
    if (t >= plan.touchdown) m.trunkDeep = Math.max(m.trunkDeep, trunkInGround(rig, body, g));
    for (const a of rig.arms) {
      for (const p of [a.elbow, mid(a.elbow, a.hand)]) m.armsLow = Math.min(m.armsLow, above(p) / k - LIMB_RADII.forearm);
      m.armsLow = Math.min(m.armsLow, above(a.hand) / k - LIMB_RADII.hand);
    }
    // The board against the rest of the body.
    const { upperArm, forearm, hand, trunk, head } = LIMB_RADII;
    const hit = (from: V3, to: V3, r0: number, r1: number) => capsuleIntersectsBoard(rig.board, from as never, to as never, r0 * k, r1 * k, 0);
    const neck = mid(rig.arms[0].shoulder, rig.arms[1].shoulder);
    const parts = [
      ...rig.arms.map((a, i) => (hit(a.shoulder, a.elbow, upperArm, forearm) || hit(a.elbow, a.hand, forearm, hand) ? `arm${i}` : '')),
      hit(hips, neck, trunk, trunk) ? 'trunk' : '',
      hit(rig.head.origin, rig.head.origin, head, head) ? 'head' : '',
      ...rig.legs.map((l, i) => (hit(l.hip, l.knee, LIMB_RADII.hip, LIMB_RADII.knee) ? `thigh${i}` : '')),
    ].filter(Boolean);
    if (parts.length) m.inBody.push(`${at}:${parts.join('+')}`);
  }
  // On the level, the slide only slows.
  const speed = (t: number) => {
    const v = slipBackHips(plan, t).velocity;
    return Math.hypot(v.x, v.z);
  };
  const levels: number[] = [];
  for (let t = plan.seat; t <= stage.end; t += H) {
    const { hips } = slipBackHips(plan, t);
    levels.push(g(hips.x, hips.z));
  }
  if (Math.max(...levels) - Math.min(...levels) < 1) {
    const start = speed(plan.seat);
    let gain = 0;
    for (let t = plan.seat; t <= stage.end; t += H) gain = Math.max(gain, speed(t) - start);
    m.levelGain = gain;
  }
  const last = slipBackAt(plan, stage.end);
  m.boardAhead = dot3(sub3(last.board.center, mid(last.rig.legs[0].hip, last.rig.legs[1].hip)), plan.travel) / leg;
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

describe('slip back', () => {
  const all = cases();
  const played = sweep(all, 4);

  for (const c of played) {
    describe(c.label, () => {
      /** The case, where `bad` holds of its measures. */
      const failing = (bad: (m: Measures, plan: SlipBackPlan) => unknown) => (bad(measuresOf(c), planOf(c).plan) ? [c.label] : []);

      it('draws every frame', () => {
        expect(failing((m) => m.broken != null)).toEqual([]);
      });

      it('keeps every bone its length, and the trunk, knees and ankles out of the ground', () => {
        expect(failing((m) => m.stretch > 0.005)).toEqual([]);
        expect(failing((m) => m.trunkDeep > 0.5 || m.kneesLow <= 0 || m.anklesLow <= 0)).toEqual([]);
      });

      it('keeps the arms and hands off the ground (resting on it at most)', () => {
        expect(failing((m) => m.armsLow < -1.5)).toEqual([]);
      });

      it('moves the hips without a jolt past the seat coming down', () => {
        expect(failing((m) => m.jerk > 6)).toEqual([]);
      });

      it('moves no limb with a pop', () => {
        expect(failing((m) => m.pop > POP)).toEqual([]);
      });

      it('turns no faster than a body can', () => {
        expect(failing((m, plan) => m.turn > 32 * Math.sqrt(PERSON_SCALE / plan.setup.body.scale))).toEqual([]);
      });

      it('sits down after the touchdown, loses the board about then, and ends sat', () => {
        const { stage, plan } = planOf(c);
        expect(plan.seat).toBeGreaterThan(plan.touchdown + 0.1);
        expect(plan.seat).toBeLessThan(plan.touchdown + 0.9);
        expect(plan.release).toBeGreaterThan(plan.touchdown);
        expect(plan.release).toBeLessThan(plan.seat + 0.05);
        const { rig } = slipBackAt(plan, stage.end);
        const hips = mid(rig.legs[0].hip, rig.legs[1].hip);
        const leg = plan.setup.body.thigh + plan.setup.body.shin;
        expect(plan.setup.ground(hips.x, hips.z) - hips.y).toBeLessThan(0.3 * leg);
        expect(rig.head.origin.y).toBeLessThan(hips.y - 0.4 * leg);
      });

      it('sends the board out ahead, and keeps it out of the legs once they have left it', () => {
        expect(failing((m) => m.boardAhead < 1)).toEqual([]);
        expect(failing((m) => (c.bank ? m.through.length > BANK_CROSSING.legs : m.through.length > 2 || m.through.some((w) => !w.endsWith('s'))))).toEqual([]);
      });

      it('keeps the board out of the arms, trunk, head and thighs', () => {
        expect(failing((m) => m.inBody.length > (c.bank ? BANK_CROSSING.body : 0))).toEqual([]);
      });

      it('only slows sliding on the level', () => {
        expect(failing((m) => m.levelGain != null && m.levelGain > 1)).toEqual([]);
      });

      it('takes over from the trick without a seam', () => {
        expect(failing((m) => m.seams.length > 0)).toEqual([]);
      });
    });
  }

  // Last, so it reads the plans the cases above have made.
  it('plays at every drop, both riders, both ways, sliding further off the big ones', () => {
    expect(all.length).toBeGreaterThanOrEqual(40);
    const slid = (set: string) => played.filter((c) => c.set === set).map((c) => planOf(c).plan).map((plan) => {
      const from = slipBackHips(plan, plan.seat).hips;
      const to = slipBackHips(plan, plan.stopped).hips;
      return Math.hypot(to.x - from.x, to.z - from.z) / (plan.setup.body.thigh + plan.setup.body.shin);
    });
    expect(Math.min(...slid('el-toro'))).toBeGreaterThan(2 * Math.max(...slid('plaza')));
  });
}, 300_000);
