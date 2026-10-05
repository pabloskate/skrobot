import { describe, expect, it } from 'vitest';
import { X0, type FallVariant } from '../TrickAnimation';
import { HANGER_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../scene/board';
import { BOTTOM_LOCAL, TOP_LOCAL, deckBottomY } from '../scene/deck';
import { GRIND_BASES } from '../scene/grindDefinitions';
import { handrailHeight, railTrack, type GrindPlan } from '../scene/grind';
import { add3, scale3, type V3 } from '../scene/math';
import { SHIN, THIGH, type Rig } from '../scene/skeleton';
import { EL_TORO_RAIL, FOOT, RAIL_R, RAIL_TOP, STAIR_DROP, STAIR_RUN, TREAD, nosingLine, stairGround } from '../scene/stairs';
import { resolveSkateStyle } from '../skateStyle';
import type { RiderStance, Robot, Stance } from '../types';
import { planStage, stageFrame, type StageFrame, type StagePlan } from './stage';
import { ASPHALT } from './view';

/**
 * Grinds down El Toro's center handrail. These pin what a skater would
 * check: the rider pops near the top of the rail and locks on a few steps
 * down, the trucks (or the deck) ride the rail all the way down and nothing
 * ever goes through it, the grind picks up speed, the board comes down past
 * the bottom step, and the body stays whole and moves smoothly throughout.
 */

const robot: Robot = {
  id: 'shifty',
  name: 'Swivel',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
  skateStyle: { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 },
};
const style = resolveSkateStyle(robot.skateStyle);
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const COMBOS = [
  'Kickflip into Frontside 50-50 Grind',
  'Backside 180 into Frontside Nosegrind',
  'Bigspin into Backside Boardslide',
  'Frontside Shuvit into Backside Lipslide',
  '360 Flip into Frontside Smith Grind',
  'Backside 5-0 Grind Kickflip Out',
  'Crooked Grind Nollie Heelflip Out',
  'Frontside Boardslide Backside 180 Out',
];

const plan = (base: string, options: { stance?: Stance; rider?: RiderStance; fall?: FallVariant | null } = {}): StagePlan =>
  planStage(robot, { id: base, name: base, base, stance: options.stance ?? 'regular' }, {
    landed: options.fall == null,
    riderStance: options.rider ?? 'regular',
    style,
    fall: options.fall ?? 'slam',
    shankProgress: 0.65,
    set: 'el-toro',
  });
const grindOf = (stage: StagePlan): GrindPlan => stage.grind!;

function* everyGrind() {
  for (const base of GRIND_BASES) {
    for (const side of ['Frontside', 'Backside']) {
      for (const rider of RIDERS) for (const stance of STANCES) yield { base: `${side} ${base}`, rider, stance };
    }
  }
  for (const base of COMBOS) for (const rider of RIDERS) yield { base, rider, stance: 'regular' as Stance };
}

/** Board-local points that must never pass through the rail: the deck, its underside, the hangers, and the wheels. */
const BOARD: V3[] = (() => {
  const pts: V3[] = [...TOP_LOCAL, ...BOTTOM_LOCAL];
  for (let x = -44; x <= 44; x += 2) for (const z of [-5, 0, 5]) pts.push({ x, y: deckBottomY(x), z });
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (let z = -WHEEL_Z; z <= WHEEL_Z; z += 1) pts.push({ x, y: HANGER_BOTTOM, z });
    for (const z of [-WHEEL_Z, WHEEL_Z]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        pts.push({ x: x + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z });
      }
    }
  }
  return pts;
})();

/**
 * How far a world point is from the center rail's axis on a frame (the
 * rail at the stage's z = 0, the set slid by how far down the rider is),
 * or null past either end of the rail.
 */
function fromRail(frame: StageFrame, p: V3): number | null {
  const k = EL_TORO_RAIL.slope;
  // The axis, u along the stairs: x = X0 + u - scroll, y = ASPHALT - (RAIL_TOP + nosingLine(u)).
  const origin = { x: X0 - frame.scroll, y: ASPHALT - RAIL_TOP, z: 0 };
  const u = (p.x - origin.x + k * (p.y - origin.y)) / (1 + k * k);
  if (u < EL_TORO_RAIL.start || u > EL_TORO_RAIL.end) return null;
  const on = { x: origin.x + u, y: ASPHALT - (RAIL_TOP + nosingLine(u)), z: 0 };
  return Math.hypot(p.x - on.x, p.y - on.y, p.z - on.z);
}

const frames = (stage: StagePlan, step = 1 / 60) => {
  const out: StageFrame[] = [];
  for (let t = 0; t <= stage.end + 1e-9; t += step) out.push(stageFrame(stage, t, 1));
  return out;
};

describe('El Toro handrail', () => {
  it('pops as the rail starts, locks on about five steps down, and speeds up all the way down it', () => {
    for (const base of GRIND_BASES) {
      const g = grindOf(plan(`Frontside ${base}`));
      const ride = g.handrail!;
      // Not far back from the rail: a foot or so before it starts.
      expect(ride.popS).toBeGreaterThan(EL_TORO_RAIL.start - 2 * FOOT);
      expect(ride.popS).toBeLessThan(EL_TORO_RAIL.start);
      // A few steps down, not on the rail's top end.
      expect(ride.lockS / TREAD, base).toBeGreaterThan(4);
      expect(ride.lockS / TREAD, base).toBeLessThan(7);
      // Well under the rail's top end (3.6 ft): a truck grind no higher an ollie than the flat bar's,
      // a slide a little higher, for the time over the rail to step across and turn into it.
      expect(g.apex, base).toBeLessThan((g.spec.slide ? 2.75 : 2.3) * FOOT);
      // Gravity down the waxed rail wins: faster at the bottom, slides less so than grinds.
      expect(ride.offSpeed / ride.speed, base).toBeGreaterThan(g.spec.slide ? 1.25 : 1.4);
      const at = (t: number) => railTrack(g, t);
      let last = -Infinity;
      for (let t = g.lockAt; t < g.off; t += 0.05) {
        const speed = (at(t + 0.01) - at(t - 0.01)) / 0.02;
        expect(speed).toBeGreaterThan(last);
        last = speed;
      }
    }
    // A trick into the rail needs more hang time, so it locks on further down.
    const ollie = grindOf(plan('Frontside 50-50 Grind')).handrail!;
    const flip = grindOf(plan('Kickflip into Frontside 50-50 Grind')).handrail!;
    expect(flip.lockS).toBeGreaterThan(ollie.lockS + TREAD);
  });

  it('never puts the board through the rail, and seats the riding part on it the whole way down', () => {
    const through: string[] = [];
    const loose: string[] = [];
    for (const { base, rider, stance } of everyGrind()) {
      const stage = plan(base, { stance, rider });
      const g = grindOf(stage);
      for (let t = g.pop - 0.1; t < g.land; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        let nearest = Infinity;
        for (const local of BOARD) {
          const d = fromRail(frame, frame.rig.board.point(local));
          if (d != null) nearest = Math.min(nearest, d);
        }
        if (nearest < RAIL_R - 0.75) through.push(`${base} ${stance} ${rider} t=${t.toFixed(2)}: ${(nearest - RAIL_R).toFixed(2)}`);
        // Locked on (past the lock-in, before the pop off's snap), it rides right on the rail.
        if (t > g.lockAt + 0.02 && t < g.off - 0.08 && nearest > RAIL_R + 1.5) loose.push(`${base} ${stance} ${rider} t=${t.toFixed(2)}: ${(nearest - RAIL_R).toFixed(2)}`);
      }
    }
    expect(through.slice(0, 8)).toEqual([]);
    expect(loose.slice(0, 8)).toEqual([]);
  }, 120_000);

  it('keeps the board out of the steps, and lands it on the bottom landing past the last one', () => {
    const problems: string[] = [];
    for (const { base, rider, stance } of everyGrind()) {
      if (stance === 'switch' || stance === 'nollie') continue;
      const stage = plan(base, { stance, rider });
      const g = grindOf(stage);
      for (const frame of frames(stage, 1 / 40)) {
        for (const local of BOARD) {
          const p = frame.rig.board.point(local);
          const clear = ASPHALT - p.y - stairGround(frame.scroll + p.x - X0);
          if (clear < -0.01) problems.push(`${base} ${stance} ${rider} t=${frame.t.toFixed(2)}: ${clear.toFixed(1)}`);
        }
      }
      const touchdown = stageFrame(stage, g.land, 1);
      expect(railTrack(g, g.land), base).toBeGreaterThan(STAIR_RUN + 3 * FOOT);
      expect(ASPHALT - touchdown.rig.board.center.y).toBeCloseTo(-STAIR_DROP + 13, 0);
      expect(handrailHeight(g, g.end)).toBeCloseTo(-STAIR_DROP, 6);
    }
    expect(problems.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('rides fakie down the same stairs backwards, and every stance down the same rail', () => {
    for (const stance of STANCES) {
      const stage = plan('Backside Boardslide', { stance });
      const all = frames(stage, 1 / 30);
      const distances = all.map((f) => f.scroll);
      expect(distances.every((d, i) => i === 0 || d > distances[i - 1])).toBe(true);
      for (const f of all) expect(f.stairs).toMatchObject({ dir: 1 });
    }
    // Rolling in, fakie faces up the stairs: the nose points back the way they came.
    const regular = stageFrame(plan('Frontside 50-50 Grind'), 0.2, 1).rig.board;
    const fakie = stageFrame(plan('Frontside 50-50 Grind', { stance: 'fakie' }), 0.2, 1).rig.board;
    expect(regular.dir({ x: 1, y: 0, z: 0 }).x).toBeGreaterThan(0.9);
    expect(fakie.dir({ x: 1, y: 0, z: 0 }).x).toBeLessThan(-0.9);
  });

  it('keeps the legs whole and moves every joint smoothly, slips included', () => {
    const jointsOf = (rig: Rig) => [
      rig.head.origin, rig.torso.origin,
      ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
      ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
    ];
    // Worst joint acceleration between 120 Hz frames, as the flat bar's test,
    // away from the two snaps (the tail off the ground and off the rail).
    const dt = 1 / 120;
    const worstJerk = (stage: StagePlan, stretched: string[], label: string) => {
      const g = grindOf(stage);
      let worst = 0;
      let prev: V3[] | null = null;
      let prev2: V3[] | null = null;
      for (let t = 0; t <= stage.end; t += dt) {
        const rig = stageFrame(stage, t, 1).rig;
        for (const leg of rig.legs) {
          const reach = Math.hypot(leg.hip.x - leg.ankle.x, leg.hip.y - leg.ankle.y, leg.hip.z - leg.ankle.z);
          if (reach > THIGH + SHIN + 0.01) stretched.push(`${label} t=${t.toFixed(2)} ${reach.toFixed(1)}`);
        }
        const now = jointsOf(rig);
        const nearSnap = [g.pop, g.off].some((s) => t > s - 0.09 && t < s + 2 * dt);
        if (prev && prev2 && !nearSnap) {
          for (let i = 0; i < now.length; i++) {
            worst = Math.max(worst, Math.hypot(...(['x', 'y', 'z'] as const).map((a) => add3(now[i], prev2![i])[a] - scale3(prev![i], 2)[a])));
          }
        }
        prev2 = prev;
        prev = now;
      }
      return worst;
    };
    const stretched: string[] = [];
    const rough: string[] = [];
    for (const base of GRIND_BASES) {
      for (const fall of [null, 'slam', 'bail', 'shank'] as const) {
        const name = `Backside ${base}`;
        const label = `${base} ${fall ?? 'landed'}`;
        const rail = worstJerk(plan(name, { fall }), stretched, label);
        // Ridden out, as smooth as the flat bar asks. A slip jolts the feet as the
        // board kicks out from under them (clearFeet), as off the flat bar; off a
        // handrail it is moving faster, so the jolt can be a little harder.
        const flat = fall == null ? 10 : Math.max(12, 1.2 * worstJerk(planStage(robot, { id: name, name, base: name, stance: 'regular' }, {
          landed: false, riderStance: 'regular', style, fall, shankProgress: 0.65, set: 'plaza',
        }), [], label));
        if (rail > flat) rough.push(`${label}: ${rail.toFixed(1)} over ${flat.toFixed(1)}`);
      }
    }
    expect(stretched.slice(0, 8)).toEqual([]);
    expect(rough).toEqual([]);
  }, 120_000);

  it('lays a slip down along the steps as a fall on flat ground lies on the asphalt', () => {
    for (const base of ['50-50 Grind', 'Boardslide', 'Crooked Grind', 'Tailslide']) {
      for (const fall of ['slam', 'bail', 'shank'] as const) {
        const name = `Frontside ${base}`;
        const stage = plan(name, { fall });
        const flat = planStage(robot, { id: name, name, base: name, stance: 'regular' }, {
          landed: false, riderStance: 'regular', style, fall, shankProgress: 0.65, set: 'plaza',
        });
        // How low the flatground fall lets a joint lie: the shared fall's own pose.
        const lowest = (rig: Rig, ground: (p: V3) => number) => Math.min(...[...joints(rig), rig.board.center].map((p) => ASPHALT - p.y - ground(p)));
        const flatLowest = lowest(stageFrame(flat, flat.end, 1).rig, () => 0);
        for (const frame of frames(stage, 1 / 30)) {
          const rig = frame.rig;
          for (const p of [...joints(rig), rig.board.center]) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          const onSteps = lowest(rig, (p) => EL_TORO_RAIL.rest(frame.scroll + p.x - X0));
          expect(onSteps, `${base} ${fall} t=${frame.t.toFixed(2)}`).toBeGreaterThan(Math.min(-4, flatLowest) - 6);
        }
      }
    }
  });
});

const joints = (rig: Rig): V3[] => [
  rig.head.origin, rig.torso.origin,
  ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
  ...rig.arms.flatMap((arm) => [arm.shoulder, arm.elbow, arm.hand]),
];
