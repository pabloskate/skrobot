import { expect } from 'vitest';
import { GROUND, H, SKY_PAD, W, type FallVariant } from './trick';
import { resolveSkateStyle } from './style';
import { resolveRiderMechanics } from './stance';
import { QUICK_SWEEP, sweepHz } from '../testing';
import { planStage } from '../stage/stage';
import type { RiderStance, SkateStyle, Stance } from '../types';
import { HANGER_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { deckBottomY } from '../board/deck';
import { DEFAULT_SCENE_CAMERA, fallSink, makeCamera } from '../camera/camera';
import { GRAVITY, barSpan, grindCameraLift, grindCameraTrack, planGrind, type GrindFrame, type GrindPlan, type Handrail } from './grind';
import { BAR_HALF, BAR_TOP_Y, BAR_Z, GRIND_BASES, exitEndsFor, grindSpecFor, joinGrindBase, joinGrindExit, type GrindSide, type PopEnd } from './grindDefinitions';
import { solveGrindRig, type GrindRig } from './grindRig';
import { add3, dot3, scale3, sub3, type V3 } from '../math';
import { DECK_HALF_WIDTH, type Rig } from './skeleton';

/**
 * Scaffolding the grind suites (grind*.test.ts) share: the combos they sweep,
 * each planned once, and the sweeps' measuring loops. Not exported from the
 * package: only tests import this.
 */

/** A grind combo staged the way the explorer and the game stage it, by a goofy rider unless told otherwise. */
export const stageOf = (base: string, landed: boolean, fall: FallVariant, riderStance: RiderStance = 'goofy') =>
  planStage({ id: base, name: base, base, stance: 'regular' }, { landed, riderStance, style: resolveSkateStyle(), fall, shankProgress: 0.65 });

export const SIDES: GrindSide[] = ['frontside', 'backside'];
export const RIDERS: RiderStance[] = ['regular', 'goofy'];
export const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
export const FALLS: FallVariant[] = ['slam', 'bail', 'shank'];
export const OUTCOMES: Array<FallVariant | null> = [null, ...FALLS];
export const NEUTRAL = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });

export const nameOf = (base: string, side: GrindSide) => `${side === 'frontside' ? 'Frontside' : 'Backside'} ${base}`;

// ----- Plans, each made once -----

/** Ids for the rails a combo grinds down, for the plans' keys. */
const RAIL_IDS = new Map<Handrail, number>();
const PLANS = new Map<string, { spec: NonNullable<ReturnType<typeof grindSpecFor>>; mechanics: ReturnType<typeof resolveRiderMechanics>; plan: GrindPlan }>();

/**
 * The grind a full trick name (entry, side, grind, exit) names, planned for a
 * rider and outcome (`fall` null: landed) on the flat bar or down `rail`.
 * Planned once and handed out again: plans are pure, and the per-attempt
 * measurements grindRig.ts keeps with them are made once too.
 */
export function grindPlan(base: string, stance: Stance, rider: RiderStance, fall: FallVariant | null, style: SkateStyle = NEUTRAL, rail: Handrail | null = null) {
  let railId = 0;
  if (rail) {
    railId = RAIL_IDS.get(rail) ?? RAIL_IDS.size + 1;
    RAIL_IDS.set(rail, railId);
  }
  const key = JSON.stringify([base, stance, rider, fall, style, railId]);
  let planned = PLANS.get(key);
  if (!planned) {
    const spec = grindSpecFor({ base, stance })!;
    const mechanics = resolveRiderMechanics(rider, stance);
    planned = { spec, mechanics, plan: planGrind(spec, mechanics, style, fall == null, fall ?? 'slam', rail) };
    PLANS.set(key, planned);
  }
  return planned;
}

export function planFor(base: string, side: GrindSide, stance: Stance, rider: RiderStance, fall: FallVariant | null, style: SkateStyle = NEUTRAL) {
  return grindPlan(nameOf(base, side), stance, rider, fall, style);
}

export interface GrindCombo {
  base: string;
  side: GrindSide;
  rider: RiderStance;
  stance: Stance;
  label: string;
}

/** Every combination worth sweeping: the catalog, both sides, both riders, every stance. */
export function* everyGrind(): Generator<GrindCombo> {
  for (const base of GRIND_BASES) {
    for (const side of SIDES) {
      for (const rider of RIDERS) {
        for (const stance of STANCES) yield { base, side, rider, stance, label: `${side} ${base} ${stance} ${rider}` };
      }
    }
  }
}

// ----- The quick tier -----

/**
 * `cases` in full. In the quick tier (testing.ts QUICK_SWEEP) as few as still
 * bring every value of each of `dims` (the grind, the trick in or out, the
 * side, rider, stance, pop) at least once: case by case, kept if it brings
 * one not yet seen.
 */
export function covering<T>(cases: Iterable<T>, ...dims: Array<(c: T) => unknown>): T[] {
  const all = [...cases];
  if (!QUICK_SWEEP) return all;
  const seen = dims.map(() => new Set<unknown>());
  return all.filter((c) => {
    const fresh = dims.some((dim, i) => !seen[i].has(dim(c)));
    if (fresh) dims.forEach((dim, i) => seen[i].add(dim(c)));
    return fresh;
  });
}

/** The usual dimensions of a grind combo. */
export const COMBO_DIMS = [
  (c: { base: string }) => c.base,
  (c: { side: GrindSide }) => c.side,
  (c: { rider: RiderStance }) => c.rider,
  (c: { stance: Stance }) => c.stance,
] as const;

/**
 * Seconds between a sweep's samples: `step` in full, coarser in the quick
 * tier (sweepHz). Only for samples checked one at a time: a difference
 * between neighbours (a speed, a jolt) keeps its own step in both tiers.
 */
export const stepOf = (step: number) => (QUICK_SWEEP ? Math.max(step, 1 / sweepHz(1 / step)) : step);

// ----- Tricks popped into and out of a grind -----

/** Board-only tricks into a grind: a flip, a shuv, both, and the longest combinations. */
export const ENTRY_TRICKS = ['Kickflip', 'Heelflip', 'Pop Shuvit', 'Frontside Shuvit', 'Hardflip', '360 Flip', 'Double Kickflip'];
/** One of each way of riding the bar, for a trick into it: on both trucks, one truck, a slide, a kick, a blunt. */
export const ENTRY_GRINDS = ['50-50 Grind', 'Nosegrind', 'Smith Grind', 'Boardslide', 'Lipslide', 'Noseslide', 'Bluntslide'];

export interface EntryCombo { entry: string; base: string; side: GrindSide; rider: RiderStance; stance: Stance; label: string }

export function* everyEntry(): Generator<EntryCombo> {
  for (const entry of ENTRY_TRICKS) {
    for (const base of ENTRY_GRINDS) {
      for (const side of SIDES) {
        for (const rider of RIDERS) {
          for (const stance of STANCES) {
            yield { entry, base, side, rider, stance, label: `${entry} into ${side} ${base} ${stance} ${rider}` };
          }
        }
      }
    }
  }
}

/** The entry combos a sweep covers: all of them in full, a few that bring every trick in, grind, side, rider and stance in the quick tier. */
export const entryCombos = <T extends EntryCombo>(combos: Iterable<T>, ...more: Array<(c: T) => unknown>) =>
  covering(combos, (c) => c.entry, (c) => c.base, (c) => c.side, (c) => c.rider, (c) => c.stance, ...more);

export function entryPlan(
  entry: string, base: string, side: GrindSide, stance: Stance, rider: RiderStance,
  fall: FallVariant | null, style: SkateStyle = NEUTRAL,
) {
  return grindPlan(joinGrindBase(entry, nameOf(base, side)), stance, rider, fall, style);
}

/** The rider's own spins into a grind: half way (180s, bigspins, a frontside flip) or all the way round (360s). */
export const SPIN_TRICKS = ['Frontside 180', 'Backside 180', 'Bigspin', 'FS Bigspin', 'Frontside 360', 'Backside 360', 'Frontside Flip'];
export const HALF_SPINS = new Set(['Frontside 180', 'Backside 180', 'Bigspin', 'FS Bigspin', 'Frontside Flip']);
export const SPIN_GRINDS = ['50-50 Grind', '5-0 Grind', 'Nosegrind', 'Crooked Grind', 'Smith Grind', 'Boardslide', 'Tailslide', 'Bluntslide'];

/**
 * The spin combos a sweep covers: all of them in full, a few that bring
 * every spin, grind, side, rider and stance in the quick tier.
 */
export function everySpin(stances: Stance[] = STANCES) {
  const combos: EntryCombo[] = [];
  for (const entry of SPIN_TRICKS) {
    for (const base of SPIN_GRINDS) {
      for (const side of SIDES) {
        for (const rider of RIDERS) {
          for (const stance of stances) {
            combos.push({ entry, base, side, rider, stance, label: `${entry} into ${side} ${base} ${stance} ${rider}` });
          }
        }
      }
    }
  }
  return entryCombos(combos);
}

export const spinPlan = entryPlan;

/** Board-only tricks out of a grind (a flip, a shuv, both), the rider's own half turn, a flip on it, and a bigspin's of both. */
export const EXIT_TRICKS = [
  'Kickflip', 'Heelflip', 'Pop Shuvit', 'Frontside Shuvit', '360 Flip', 'Backside 180', 'Frontside 180',
  'Backside Flip', 'Frontside Flip', 'Backside Heelflip', 'Frontside Heelflip', 'Bigspin', 'FS Bigspin',
];
/** One of each way of riding the bar, for a trick out of it: both trucks, a truck at each end, a slide, a kick at each end, a blunt. */
export const EXIT_GRINDS = ['50-50 Grind', '5-0 Grind', 'Crooked Grind', 'Boardslide', 'Tailslide', 'Noseslide', 'Bluntslide'];

export interface ExitCombo { exit: string; end: PopEnd; base: string; side: GrindSide; rider: RiderStance; stance: Stance; label: string }

export function everyExit(stances: Stance[] = STANCES, exits: string[] = EXIT_TRICKS) {
  const combos: ExitCombo[] = [];
  for (const exit of exits) {
    for (const base of EXIT_GRINDS) {
      for (const end of exitEndsFor(base)) {
        for (const side of SIDES) {
          for (const rider of RIDERS) {
            for (const stance of stances) {
              combos.push({ exit, end, base, side, rider, stance, label: `${side} ${base} ${end === 'nose' ? 'Nollie ' : ''}${exit} Out ${stance} ${rider}` });
            }
          }
        }
      }
    }
  }
  return combos;
}

/** The exit combos a sweep covers: all of them in full, a few that bring every trick out, grind, end, side, rider and stance in the quick tier. */
export const exitCombos = <T extends ExitCombo>(combos: Iterable<T>, ...more: Array<(c: T) => unknown>) =>
  covering(combos, (c) => c.exit, (c) => c.base, (c) => c.end, (c) => c.side, (c) => c.rider, (c) => c.stance, ...more);

export function exitPlan(
  exit: string, end: PopEnd, base: string, side: GrindSide, stance: Stance, rider: RiderStance,
  fall: FallVariant | null, style: SkateStyle = NEUTRAL, entry?: string,
) {
  const grind = joinGrindExit(nameOf(base, side), exit, end);
  return grindPlan(entry ? joinGrindBase(entry, grind) : grind, stance, rider, fall, style);
}

// ----- Measuring -----

/** The drawn rider's hip height (physics y): `grow` times the rig over the same feet (riders/human/humanRig.ts). */
export function grownHipY(plan: GrindPlan, mechanics: ReturnType<typeof resolveRiderMechanics>, grow: number) {
  return (t: number) => {
    const { legs } = solveGrindRig(t, plan, mechanics, NEUTRAL, grow).rig;
    const feet = (legs[0].ankle.y + legs[1].ankle.y) / 2;
    return feet + grow * ((legs[0].hip.y + legs[1].hip.y) / 2 - feet);
  };
}

/**
 * Into a takeoff the hips crouch once and rise once: from the bottom of the
 * crouch they never sink again, never snap, and nothing pulls them down
 * faster than gravity (beyond a foot coming up off the deck at the pop).
 */
export function expectOneRise(hipY: (t: number) => number, takeoff: number, label: string) {
  const DT = 1 / 240;
  const from = takeoff - 0.25;
  let bottom = from;
  let low = hipY(from);
  for (let t = from + DT; t < takeoff; t += DT) {
    const y = hipY(t);
    if (y > low) [bottom, low] = [t, y];
  }
  let high = low;
  let sink = 0;
  for (let t = bottom; t < takeoff + 0.05; t += 2 * DT) {
    const y = hipY(t);
    high = Math.min(high, y);
    sink = Math.max(sink, y - high);
  }
  expect(sink, `${label}: sinks again after the crouch`).toBeLessThan(0.25);
  for (let t = from; t < takeoff + 0.05; t += 0.01) {
    const a = (hipY(t + DT) - 2 * hipY(t) + hipY(t - DT)) / (DT * DT);
    expect(Math.abs(a), `${label}: snaps at ${(t - takeoff).toFixed(2)}`).toBeLessThan(20 * GRAVITY);
    if (t > bottom && t < takeoff) expect(a, `${label}: pulled down at ${(t - takeoff).toFixed(2)}`).toBeLessThan(1.75 * GRAVITY);
  }
}

export const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A world point in the board's own frame. */
export function toBoard(rig: Rig, p: V3): V3 {
  const d = sub3(p, rig.board.center);
  return {
    x: dot3(d, rig.board.dir({ x: 1, y: 0, z: 0 })),
    y: dot3(d, rig.board.dir({ x: 0, y: 1, z: 0 })),
    z: dot3(d, rig.board.dir({ x: 0, y: 0, z: 1 })),
  };
}

/** Samples over the board's solid parts: deck underside, hangers, and wheel rims. */
export function boardSamples(rig: Rig): V3[] {
  const pts: V3[] = [];
  for (let x = -46; x <= 46; x += 4) {
    for (const z of [-DECK_HALF_WIDTH + 1, 0, DECK_HALF_WIDTH - 1]) pts.push(rig.board.point({ x, y: deckBottomY(x) - 0.4, z }));
  }
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    for (let z = -5; z <= 5; z += 2.5) pts.push(rig.board.point({ x: tx, y: HANGER_BOTTOM, z }));
    for (const wz of [-WHEEL_Z, WHEEL_Z]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push(rig.board.point({ x: tx + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z: wz }));
      }
    }
  }
  return pts;
}

/** Where a sample was taken, for a failure's message: built only if it's kept. */
export type Where = string | (() => string);

/**
 * Keep every sampled frame, but ask Vitest to format/assert only the worst
 * value for each bound. Millions of expect() calls dominated these sweeps.
 * Non-finite samples are failures too, even if a later sample is finite.
 */
export function sweepBounds() {
  const worst = new Map<string, { value: number; limit: number; where: Where }>();
  return {
    below(name: string, value: number, limit: number, where: Where) {
      const bounded = Number.isFinite(value) ? value : Infinity;
      const previous = worst.get(name);
      if (!previous || bounded - limit > previous.value - previous.limit) {
        worst.set(name, { value: bounded, limit, where: typeof where === 'string' ? where : where() });
      }
    },
    verify() {
      expect(worst.size).toBeGreaterThan(0);
      for (const [name, { value, limit, where }] of worst) {
        expect(value, `${name}: ${where}`).toBeLessThan(limit);
      }
    },
  };
}

export type Sweep = ReturnType<typeof sweepBounds>;

/** The joints whose acceleration the continuity sweeps bound. */
export const joints = (rig: Rig) => [
  rig.head.origin, rig.torso.origin,
  ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
  ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
];

/**
 * Every joint's acceleration between 120 Hz frames (as the flatground test),
 * frame by frame: the returned function takes each frame's joints, and
 * bounds the jolt from the two frames before unless it's to `skip` (the two
 * snaps, the tail off the ground and off the bar, are the allowed jolts).
 */
export function jointJolts(sweep: Sweep) {
  let prev2: V3[] | null = null;
  let prev: V3[] | null = null;
  return (now: V3[], skip: boolean, where: (joint: number) => string) => {
    if (prev && prev2 && !skip) {
      for (let i = 0; i < now.length; i++) {
        sweep.below('joint acceleration', dist(add3(now[i], prev2[i]), scale3(prev[i], 2)), 10, () => where(i));
      }
    }
    prev2 = prev;
    prev = now;
  };
}

const inside = (p: V3, x0: number, x1: number, top: number, bottom: number, half: number) =>
  p.x > x0 && p.x < x1 && p.y > top && p.y < bottom && Math.abs(p.z - BAR_Z) < half;

/** Bounds every sample of the board out of the bar and its posts. */
export function sweepBar(sweep: Sweep, plan: GrindPlan, rig: Rig, frame: GrindFrame, where: () => string) {
  const { x0, x1 } = barSpan(plan, frame.streetDist);
  const posts = [x0 + 46, x1 - 46];
  // Each bound keeps its worst, the first sample to reach it: so one value a frame is the same as one a sample.
  let bar = 0;
  let post = 0;
  for (const p of boardSamples(rig)) {
    bar = Math.max(bar, Number(inside(p, x0, x1, BAR_TOP_Y + 0.4, BAR_TOP_Y + 2 * BAR_HALF, BAR_HALF - 0.4)));
    for (const px of posts) post = Math.max(post, Number(inside(p, px - 1.7, px + 1.7, BAR_TOP_Y, GROUND, 1.7)));
  }
  sweep.below('bar intersections', bar, 1, where);
  sweep.below('post intersections', post, 1, where);
}

/** Bounds the robot inside the stage, filmed by the grind's crane, at time `t`. */
export function sweepStage(sweep: Sweep, plan: GrindPlan, t: number, { rig, frame, falling }: GrindRig, where: () => string) {
  const sink = falling ? fallSink(GROUND - rig.head.origin.y) : 0;
  const cam = makeCamera(grindCameraLift(plan, t, frame.rail, sink), { ...DEFAULT_SCENE_CAMERA, targetZ: grindCameraTrack(plan, t) });
  sweep.below('stage top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, 0, () => `top ${where()}`);
  for (const p of [...rig.legs.map((leg) => leg.shoe.origin), ...rig.arms.map((arm) => arm.hand)]) {
    const pp = cam.project(p);
    sweep.below('stage bottom', pp.y - H, 0, () => `bottom ${where()}`);
    sweep.below('stage left', -pp.x, 0, () => `left ${where()}`);
    sweep.below('stage right', pp.x - W, 0, () => `right ${where()}`);
  }
}
