import { describe, expect, it } from 'vitest';
import { legBoardCollision } from '../../board/boardCollision';
import { HANGER_BOTTOM, WHEEL_X, deckBottomY } from '../../board/board';
import { TIP_X } from '../../board/deck';
import { BOARD_WIDTH_SCALE } from '../../board/boardDimensions';
import { add3, scale3, sub3, type V3 } from '../../math';
import { railBailPlan } from '../../stage/railBailFrame';
import { planStage, stageFrame, type StagePlan } from '../../stage/stage';
import { soundtrackFor } from '../../sound/soundtrack';
import { setHandrail, setInfo, type RailChoice, type StageSet } from '../../sets/sets';
import { SWEEP_TIMEOUT, sweep } from '../../testing';
import type { RiderStance } from '../../types';
import { FOOT, GRAVITY } from '../../units';
import { railTopY, type GrindPlan } from '../grind';
import { BAR_HALF, BAR_TOP_Y, BAR_Z } from '../grindDefinitions';
import { DECK_HALF_WIDTH, SHOE_HALF_LENGTH, moveFrame, type Rig } from '../skeleton';
import { resolveSkateStyle } from '../style';
import { X0 } from '../trick';
import { LIMB_RADII, SOLE_GRACE } from './body';
import { hipsAt, kickOutAt, type KickOutPlan } from './kickOut';
import { RAIL_BAIL_T, ROLL_ABOVE, railBailTimelineFor, type RailBail } from './railBail';
import { runOutAt } from './runOut';

/**
 * Jumping off a rail: the grind locked and ridden as landed, then part way
 * along the rider throws themself off it (forward, or out to the side they
 * came in from), the board clatters off on its own, and they come down on
 * their feet and roll it out. On the flat bar, down El Toro's center and side
 * rails and Hollywood's, and off Miami's slab edge, by both riders and both
 * skater builds, held to what a body does: no seam where they leave the
 * grind, a body that leaves the board and falls at gravity's rate, legs and
 * board that stay out of the rail and out of each other, nothing through the
 * ground, a roll on the ground it's on, and one rider the other's mirror.
 */

interface Case {
  label: string;
  set: StageSet;
  rail: RailChoice;
  grind: string;
  bail: RailBail;
  rider: RiderStance;
  skater: 'robot' | 'realistic';
}

const SPOTS: Array<{ set: StageSet; rail: RailChoice; grind: string }> = [
  { set: 'plaza', rail: 'center', grind: 'Frontside 50-50 Grind' },
  { set: 'plaza', rail: 'center', grind: 'Backside Boardslide' },
  { set: 'el-toro', rail: 'center', grind: 'Frontside 50-50 Grind' },
  { set: 'el-toro', rail: 'side', grind: 'Backside 5-0 Grind' },
  { set: 'hollywood-high', rail: 'center', grind: 'Frontside Boardslide' },
  { set: 'miami-triangle', rail: 'center', grind: 'Backside 50-50 Grind' },
];

/**
 * The spots that are their own mirror across the rail's line: the flat bar and the stairs' center rails. (El Toro's side
 * rail has the stairs on one side of it only, and Miami's edge runs at a slant, so a goofy rider's there isn't a regular
 * one's mirror; they're held to the same clearance and continuity, case by case, above.)
 */
const SYMMETRIC = SPOTS.filter((s) => s.rail === 'center' && s.set !== 'miami-triangle' && s.grind !== 'Backside Boardslide');

/**
 * How far a regular rider's hips may be from a goofy one's mirror in the air (world units). The grind they leave is
 * already a little off its mirror (the hips 0.2 to 0.4 at the jump on the flat bar and El Toro), and that grows a little
 * through the jump, along the rail only (the hips that much further on for one stance, a couple of units a second faster
 * off the faster ride; the same push, the same flight): measured, 1.26 at the most, at the foot's coming down (a person
 * off El Toro's side), nothing at all down Hollywood. (The flat bar's
 * backside boardslide is left out: the grind's own pose has the feet 1.4 units further along for both riders, so which
 * foot is ahead, and kicks the board, isn't each other's mirror.) Once the board's hit something its contacts are solved
 * one by one in a fixed order and its path goes its own way, as a kick-out's does off the flat (16 units): the board after
 * the kick, and the rider's roll and run, aren't held to the mirror.
 */
const MIRRORED = 1.5;

const CASES: Case[] = SPOTS.flatMap((spot, i) => (['forward', 'side'] as const).flatMap((bail) => (['regular', 'goofy'] as const).map((rider) => {
  const skater = (i + (bail === 'side' ? 1 : 0)) % 2 === 0 ? 'realistic' : 'robot';
  return { ...spot, bail, rider, skater, label: `${skater} ${spot.set}:${spot.rail} ${spot.grind} ${bail} ${rider}` } as Case;
})));

const style = resolveSkateStyle();
const stages = new Map<string, StagePlan>();
function stageOf(c: Omit<Case, 'label'>): StagePlan {
  const key = JSON.stringify(c);
  let stage = stages.get(key);
  if (!stage) {
    stage = planStage({ id: c.grind, name: c.grind, base: c.grind, stance: 'regular' }, {
      landed: false, riderStance: c.rider, style, fall: 'kickout', shankProgress: 0.5, skater: c.skater, set: c.set, rail: c.rail, railBail: c.bail,
    });
    stages.set(key, stage);
  }
  return stage;
}

/** How far the board may sink into what it lands on (world units): the deepest a gap kick-out's does (3.3, El Toro), and a little. */
const BOARD_SINK = 3.5;

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mid = (a: V3, b: V3): V3 => scale3(add3(a, b), 0.5);

/** The rail as a straight pipe in the bail's frame (positions the kick-out's): its axis's ends and radius; null for a ledge's edge (its top is ground). */
function railPipe(grind: GrindPlan): { a: V3; b: V3; r: number } | null {
  const ride = grind.handrail;
  if (!ride) {
    const xa = X0 + grind.spec.dir * grind.barStart;
    const xb = X0 + grind.spec.dir * grind.barEnd;
    const y = BAR_TOP_Y + BAR_HALF;
    return { a: { x: xa, y, z: BAR_Z }, b: { x: xb, y, z: BAR_Z }, r: BAR_HALF };
  }
  const { rail } = ride;
  if (rail.ledge) return null;
  const axis = (s: number): V3 => ({ x: X0 + s, y: railTopY(rail, s) + rail.radius * Math.hypot(1, rail.slope), z: 0 });
  return { a: axis(rail.start), b: axis(rail.end), r: rail.radius };
}

/**
 * How far a point is into the ground: the least it would have to move to be out of it, up or sideways. A stair's riser
 * is a wall, and a board's tip just behind one's edge is that close to it, not as deep as the step is high.
 */
function intoGround(p: V3, ground: (x: number, z: number) => number): number {
  const up = p.y - ground(p.x, p.z);
  if (up <= 0) return up;
  for (let r = 0.5; r < up; r += 0.5) {
    for (let a = 0; a < 16; a++) {
      const x = p.x + r * Math.cos((a * Math.PI) / 8);
      const z = p.z + r * Math.sin((a * Math.PI) / 8);
      if (ground(x, z) >= p.y) return r;
    }
  }
  return up;
}

/** How far a point is from a segment. */
function toSegment(p: V3, a: V3, b: V3): number {
  const ab = sub3(b, a);
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
  return dist(p, add3(a, scale3(ab, k)));
}

/** How deep (world units) the legs go into the rail at the most: thighs, shins and shoes, as capsules, sampled along. */
function legsInRail(rig: Rig, pipe: { a: V3; b: V3; r: number }, k: number): number {
  let deepest = -Infinity;
  const bone = (p: V3, q: V3, rp: number, rq: number) => {
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const at = add3(p, scale3(sub3(q, p), u));
      deepest = Math.max(deepest, pipe.r + (rp + (rq - rp) * u) * k - toSegment(at, pipe.a, pipe.b));
    }
  };
  for (const leg of rig.legs) {
    bone(leg.hip, leg.knee, LIMB_RADII.hip, LIMB_RADII.knee);
    bone(leg.knee, leg.ankle, LIMB_RADII.knee, LIMB_RADII.ankle);
    // A shoe's as tall for either rider (SHOE_HALF_HEIGHT), its length their size's.
    bone(leg.shoe.at(-SHOE_HALF_LENGTH * k, 0, 0), leg.shoe.at(SHOE_HALF_LENGTH * k, 0, 0), 3 / k, 3 / k);
  }
  return deepest;
}

/** Everything the frame draws of the rider and board, flattened, for the seam where the jump takes over. */
function drawn(stage: StagePlan, t: number): number[] {
  const { rig, lift, scroll } = stageFrame(stage, t, 1);
  const pts = [
    ...rig.legs.flatMap((l) => [l.hip, l.knee, l.ankle, l.shoe.origin]),
    ...rig.arms.flatMap((a) => [a.shoulder, a.elbow, a.hand]),
    rig.head.origin, rig.torso.origin, rig.board.center, rig.board.point({ x: 40, y: 0, z: 0 }),
  ];
  return [...pts.flatMap((p) => [p.x, p.y, p.z]), lift, scroll];
}

interface Measures {
  /** Most anything drawn steps across the takeover, against the most either side of it (world units a 240th of a second). */
  seam: number;
  around: number;
  /** The hips' fall in the air between the push and the first foot down (world units a second squared, down). */
  fall: number;
  /** Deepest the legs go into the rail once the jump's push is done, and the board's deck and hangers into it and the ground. */
  legsInRail: number;
  boardInRail: number;
  boardInGround: number;
  /** Lowest the hips, knees and ankles get over the ground under them (world units), and an elbow or forearm past its own thickness (robot units). */
  jointsLow: number;
  elbowsLow: number;
  /** Frames a leg goes through the board once the kicking foot's let go of it. */
  through: number;
  /** The hips' distance from the board at the jump and a second on. */
  apartAtJump: number;
  apartLater: number;
}

function measure(stage: StagePlan, plan: KickOutPlan): Measures {
  const grind = stage.grind!;
  const k = plan.setup.body.scale;
  const ground = plan.setup.ground;
  const pipe = railPipe(grind);
  const H = 1 / 240;
  const m: Measures = {
    seam: 0, around: 0, fall: 0, legsInRail: -Infinity, boardInRail: -Infinity, boardInGround: -Infinity, jointsLow: Infinity, elbowsLow: Infinity, through: 0,
    apartAtJump: 0, apartLater: 0,
  };
  const at = stage.railBail!.at;
  const step = (t: number) => {
    const a = drawn(stage, t - H / 2);
    const b = drawn(stage, t + H / 2);
    return Math.max(...a.map((v, i) => Math.abs(b[i] - v)));
  };
  m.seam = step(at);
  m.around = Math.max(step(at - 2 * H), step(at + 2 * H));

  // In the air: from the push's end to the first foot down, the hips fall as anything thrown does.
  const from = plan.release + 0.02;
  const to = plan.run.footfalls[0].on - 0.03;
  const y = (t: number) => hipsAt(plan, t).hips.y;
  const accels: number[] = [];
  for (let t = from + H; t < to - H; t += H) accels.push((y(t + H) - 2 * y(t) + y(t - H)) / (H * H));
  m.fall = accels.reduce((a, b) => a + b, 0) / accels.length;

  // The hangers' undersides, and the deck's: along its bottom, at its rails, to the tips.
  const hw = DECK_HALF_WIDTH * BOARD_WIDTH_SCALE * 0.92;
  const boardPoints = [-1, 1].flatMap((end) => [-6, 0, 6].map((z) => ({ x: end * WHEEL_X, y: HANGER_BOTTOM, z })))
    .concat([-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map((u) => u * TIP_X * 0.98).flatMap((x) => [-hw, 0, hw].map((z) => ({ x, y: deckBottomY(x), z }))));
  const above = (p: V3) => ground(p.x, p.z) - p.y;
  for (let t = plan.takeover; t <= stage.end; t += 1 / 60) {
    const { rig, board } = kickOutAt(plan, t);
    if (pipe && t > plan.takeover + 0.16) m.legsInRail = Math.max(m.legsInRail, legsInRail(rig, pipe, k));
    for (const local of boardPoints) {
      const p = board.point(local);
      m.boardInGround = Math.max(m.boardInGround, intoGround(p, ground));
      if (pipe) m.boardInRail = Math.max(m.boardInRail, pipe.r - toSegment(p, pipe.a, pipe.b));
    }
    const hips = mid(rig.legs[0].hip, rig.legs[1].hip);
    m.jointsLow = Math.min(m.jointsLow, above(hips), ...rig.legs.flatMap((leg) => [above(leg.knee), above(leg.ankle)]));
    for (const arm of rig.arms) for (const p of [arm.elbow, mid(arm.elbow, arm.hand)]) m.elbowsLow = Math.min(m.elbowsLow, above(p) / k - LIMB_RADII.forearm);
    rig.legs.forEach((leg, i) => {
      if (i === plan.kick && t <= plan.release + 0.03) return;
      const c = legBoardCollision(board, { ...leg, shoe: moveFrame(leg.shoe, { x: 0, y: -SOLE_GRACE, z: 0 }) });
      if (c.shoe || c.shin || c.thigh) m.through++;
    });
  }
  const apart = (t: number) => {
    const { rig, board } = kickOutAt(plan, t);
    return dist(mid(rig.legs[0].hip, rig.legs[1].hip), board.center);
  };
  m.apartAtJump = apart(plan.takeover);
  m.apartLater = apart(Math.min(stage.end, plan.takeover + 1));
  return m;
}

const measured = new Map<Case, { stage: StagePlan; plan: KickOutPlan; m: Measures }>();
function of(c: Case) {
  let known = measured.get(c);
  if (!known) {
    const stage = stageOf(c);
    const plan = railBailPlan(stage);
    known = { stage, plan, m: measure(stage, plan) };
    measured.set(c, known);
  }
  return known;
}

describe('jumping off a rail', () => {
  describe.each(sweep(CASES, 4).map((c) => [c.label, c] as const))('%s', (_, c) => {
    it('is the grind, locked, up to a jump inside the lock', { timeout: SWEEP_TIMEOUT }, () => {
      const { stage } = of(c);
      const grind = stage.grind!;
      const bail = stage.railBail!;
      expect(grind.fail).toBeNull();
      expect(bail.at).toBeGreaterThanOrEqual(grind.lockAt + 0.3);
      expect(bail.at).toBeLessThan(grind.off);
      expect(stage.end).toBeCloseTo(bail.at + RAIL_BAIL_T, 6);
    });

    it('plans the feet down after a flight, about when the body comes down', { timeout: SWEEP_TIMEOUT }, () => {
      const { stage, plan } = of(c);
      const bail = stage.railBail!;
      // The plan's guess (any rider's hips, a leg over the board) against this body's own first foot down; off a ledge's
      // top too, not where the board was already standing on it.
      expect(bail.down).toBeGreaterThan(bail.at + 0.2);
      expect(Math.abs(bail.down - plan.run.footfalls[0].on)).toBeLessThan(0.4);
    });

    it('takes over without a seam', { timeout: SWEEP_TIMEOUT }, () => {
      const { m } = of(c);
      // As a kick-out's takeover (kickOut.test.ts): no more than three times the step either side.
      expect(m.seam).toBeLessThan(3 * m.around + 0.05);
    });

    it('throws the body off the board, which goes its own way', { timeout: SWEEP_TIMEOUT }, () => {
      const { m } = of(c);
      expect(m.apartLater).toBeGreaterThan(m.apartAtJump + FOOT);
      expect(m.through).toBe(0);
    });

    it('falls at gravity once it has left', { timeout: SWEEP_TIMEOUT }, () => {
      const { m } = of(c);
      expect(m.fall / GRAVITY).toBeGreaterThan(0.97);
      expect(m.fall / GRAVITY).toBeLessThan(1.03);
    });

    it('keeps legs and board out of the rail, and everything out of the ground', { timeout: SWEEP_TIMEOUT }, () => {
      const { m } = of(c);
      expect(m.legsInRail).toBeLessThan(0.5);
      // The board's sim eases a sunk point out over a few steps rather than lifting it at once: a kick-out's board, landing
      // off El Toro's drop, sinks 3.3 into the ground. The rail it's left on is held to the same.
      expect(m.boardInRail).toBeLessThan(BOARD_SINK);
      expect(m.boardInGround).toBeLessThan(BOARD_SINK);
      // As a kick-out's (kickOut.test.ts): the joints above it, an arm grazing it at most.
      expect(m.jointsLow).toBeGreaterThan(0);
      expect(m.elbowsLow).toBeGreaterThan(-1.5);
    });

    it('comes down on its feet and rolls on the ground it lands on', { timeout: SWEEP_TIMEOUT }, () => {
      const { plan } = of(c);
      const roll = plan.roll!;
      expect(roll).not.toBeNull();
      // Earned: they come down faster than a rider off a rail can take on their feet.
      const leg = plan.setup.body.thigh + plan.setup.body.shin;
      const v = runOutAt(plan.run, plan.run.footfalls[0].on - plan.run.dt).velocity;
      expect(Math.hypot(v.x, v.y, v.z) / Math.sqrt(plan.setup.gravity * leg)).toBeGreaterThan(ROLL_ABOVE);
      const g = plan.setup.ground;
      const first = plan.run.footfalls[0];
      expect(Math.abs(g(first.at.x, first.at.z) - first.at.y)).toBeLessThan(6);
      for (const hit of roll.hits) expect(Math.abs(g(hit.at.x, hit.at.z) - hit.at.y)).toBeLessThan(30);
      // The level it rolls on is the level the first foot came down on.
      expect(Math.abs(g(roll.exit.hips.x, roll.exit.hips.z) - g(first.at.x, first.at.z))).toBeLessThan(2);
    });
  });
});

describe('which way the rider jumps', () => {
  const pair = (spot: (typeof SPOTS)[number], bail: RailBail, skater: Case['skater'] = 'robot') =>
    (['regular', 'goofy'] as const).map((rider) => railBailPlan(stageOf({ ...spot, bail, rider, skater })));

  it.each(SYMMETRIC.map((s) => [`${s.set}:${s.rail} ${s.grind}`, s] as const))('mirrors regular and goofy: %s', { timeout: SWEEP_TIMEOUT }, (_, spot) => {
    for (const bail of ['forward', 'side'] as const) for (const skater of ['robot', 'realistic'] as const) {
      const [regular, goofy] = pair(spot, bail, skater);
      expect(goofy.takeover).toBeCloseTo(regular.takeover, 9);
      // The kick's the same: found where the board's level on the rail, on the same edge of it, and as hard.
      expect(goofy.push).toBe(regular.push);
      // Across the rail's line (z = 0) the one is the other's mirror: the board, till the kick meets it (sliding on the
      // rail on its hangers already, solved in their order: a quarter of a unit off on El Toro's by then), ...
      const mirror = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z + b.z);
      for (let t = regular.takeover; t < regular.contact; t += 1 / 120) {
        expect(mirror(kickOutAt(regular, t).board.center, kickOutAt(goofy, t).board.center)).toBeLessThan(0.5);
      }
      // ... the hips, all through the air, ...
      const down = Math.min(regular.run.footfalls[0].on, goofy.run.footfalls[0].on);
      for (let t = regular.takeover; t < down; t += 1 / 120) expect(mirror(hipsAt(regular, t).hips, hipsAt(goofy, t).hips)).toBeLessThan(MIRRORED);
      // ... where the first foot comes down, and which way they roll.
      expect(mirror(regular.run.footfalls[0].at, goofy.run.footfalls[0].at)).toBeLessThan(2 * MIRRORED);
      expect(regular.roll!.side).toBe(-goofy.roll!.side as 1 | -1);
    }
  });

  it.each(sweep(SPOTS, 3).map((s) => [`${s.set}:${s.rail} ${s.grind}`, s] as const))('forward goes on along, aside goes out: %s', { timeout: SWEEP_TIMEOUT }, (_, spot) => {
    for (const rider of ['regular', 'goofy'] as const) {
      const forward = stageOf({ ...spot, bail: 'forward', rider, skater: 'robot' });
      const side = stageOf({ ...spot, bail: 'side', rider, skater: 'robot' });
      const f = railBailPlan(forward).run.footfalls[0].at;
      const s = railBailPlan(side).run.footfalls[0].at;
      // Aside lands well out from the rail, on the side the grind came in from; forward lands nearer its line.
      expect(Math.abs(s.z)).toBeGreaterThan(3 * FOOT);
      expect(Math.abs(s.z)).toBeGreaterThan(Math.abs(f.z) + 2 * FOOT);
      const approach = stageFrame(side, side.grind!.pop - 0.2, 1).rig.board.center.z - (side.grind!.handrail ? 0 : BAR_Z);
      if (!side.rail?.yaw) expect(Math.sign(s.z)).toBe(Math.sign(approach));
      expect(side.railBail!.side).toBe(forward.railBail!.side);
    }
  });

  it('runs to its own clock, and sounds the grind up to the jump and the board landing after', () => {
    const stage = stageOf({ ...SPOTS[0], bail: 'side', rider: 'regular', skater: 'robot' });
    const track = soundtrackFor(stage);
    const at = stage.railBail!.at;
    expect(track.grind(at - 0.01)).toBe(1);
    expect(track.grind(at + 0.01)).toBe(0);
    expect(track.cues.map((c) => c.kind)).toEqual(['pop', 'lock', 'crash']);
    expect(track.cues[2].at).toBeGreaterThan(at);
  });

  it('times the bail for a timeline as the stage plays it', () => {
    for (const spot of SPOTS) for (const bail of ['forward', 'side'] as const) {
      const stage = stageOf({ ...spot, bail, rider: 'goofy', skater: 'realistic' });
      const trick = { id: spot.grind, name: spot.grind, base: spot.grind, stance: 'regular' as const };
      const timeline = railBailTimelineFor(trick, 'goofy', style, bail, setHandrail(spot.set, trick, 'goofy', spot.rail))!;
      expect(timeline.bail).toBeCloseTo(stage.railBail!.at, 9);
      expect(timeline.down).toBeCloseTo(stage.railBail!.down, 9);
      expect(timeline.end).toBeCloseTo(stage.end, 9);
      expect(timeline.lock).toBeCloseTo(stage.grind!.lockAt, 9);
    }
  });

  it('leaves a landed grind and a slip off it as they were', () => {
    const plain = (fall: 'slam' | 'bail' | null) => planStage({ id: 'g', name: 'g', base: 'Frontside 50-50 Grind', stance: 'regular' }, {
      landed: fall == null, riderStance: 'regular', style, fall: fall ?? 'slam', shankProgress: 0.5, set: 'el-toro', rail: 'center',
    });
    expect(plain(null).railBail).toBeNull();
    expect(plain('bail').railBail).toBeNull();
    expect(plain('bail').grind!.fail).not.toBeNull();
    expect(setInfo('el-toro').grinds).toBe(true);
  });
});
