import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { FLIP_T, LAND_T, ROLL_IN, TRICK_BASES } from '../../motion/trick';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA } from '../../camera/camera';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../../board/deck';
import { cross3, dot3, type V3 } from '../../math';
import { SQUAT_FLOOR } from '../../motion/skeleton';
import { EL_TORO_TERRAIN, FOOT, RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, planStairs, stairClock, stairGround, stairTimeline } from './stairs';
import { resolveSkateStyle } from '../../motion/style';
import type { RiderStance, Robot, Stance, Trick } from '../../types';
import { ElToro3D } from './elToro3d';
import { planStage, stageFrame, type StageFrame, type StagePlan } from '../../stage/stage';
import { ASPHALT, stageView } from '../../camera/view';
import { X0 } from '../../motion/trick';

/**
 * El Toro's 20 stair: flatground tricks go down it. These pin the set's
 * size at the robot's scale, that every trick clears every step and lands
 * past the bottom one whatever the robot's pop, that the trick and rider are
 * the flatground ones carried down whole, and that the camera keeps it all
 * in the shot.
 */


const robotWith = (popHeight: number): Robot => ({
  id: 'shifty',
  name: 'Swivel',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
  skateStyle: { popHeight, rotationSpeed: 1.08, flickStrength: 0.95 },
});
const trick = (base: string, stance: Stance = 'regular'): Trick => ({ id: base, name: base, base, stance });
const plan = (base: string, options: { stance?: Stance; rider?: RiderStance; pop?: number; landed?: boolean; set?: 'el-toro' | 'plaza' } = {}): StagePlan => {
  const r = robotWith(options.pop ?? 0.92);
  return planStage(trick(base, options.stance), {
    landed: options.landed ?? true,
    riderStance: options.rider ?? 'regular',
    style: resolveSkateStyle(r.skateStyle),
    fall: 'slam',
    shankProgress: 0.65,
    set: options.set ?? 'el-toro',
  });
};
const frames = (stage: StagePlan, from = 0, to = stage.end) => {
  const out: StageFrame[] = [];
  for (let t = from; t <= to + 1e-9; t += 1 / 60) out.push(stageFrame(stage, t, 1));
  return out;
};
/** Distance down the stairs of a world point on a frame. */
const along = (frame: StageFrame, p: V3) => frame.scroll * frame.stairs!.dir + frame.stairs!.dir * (p.x - X0);
const height = (p: V3) => ASPHALT - p.y;

const BOARD_POINTS: V3[] = [...TOP_LOCAL, ...BOTTOM_LOCAL];
for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) BOARD_POINTS.push({ x, y: WHEEL_Y + WHEEL_R, z });

const BASES = TRICK_BASES;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const POPS = [0.45, 1, 1.15];

describe('El Toro', () => {
  it('is twenty steps falling nine and a half feet over twenty, at a robot about five feet tall', () => {
    expect(STAIR_STEPS).toBe(20);
    expect(STAIR_DROP / FOOT).toBe(9.5);
    expect(STAIR_RUN / FOOT).toBe(20);
    expect(stairGround(-1)).toBe(0);
    expect(stairGround(TREAD * 0.5)).toBeCloseTo(-RISER);
    expect(stairGround(STAIR_RUN - 1)).toBeCloseTo(-(STAIR_STEPS - 1) * RISER);
    expect(stairGround(STAIR_RUN)).toBe(-STAIR_DROP);
    const standing = stageFrame(plan('Ollie', { set: 'plaza' }), 0.1, 1).rig;
    const tall = (height(standing.head.at(0, 15, 0)) - height(standing.board.center)) / FOOT;
    expect(tall).toBeGreaterThan(4.4);
    expect(tall).toBeLessThan(5.4);
  });

  it('adapts to the taller drop with the same gravity and pop, landing at the same distance', () => {
    const gravity = 32.2 * FOOT;
    for (const popHeight of POPS) {
      const stairs = planStairs({ popHeight }, true);
      const oldHeight = planStairs({ popHeight }, true, {
        ...EL_TORO_TERRAIN, drop: 9 * FOOT, ground: () => -9 * FOOT,
      });
      expect(stairs.rise).toBe(oldHeight.rise);
      expect(stairs.pop).toBe(oldHeight.pop);
      expect(stairs.flight).toBeGreaterThan(oldHeight.flight);
      expect(stairs.speed).toBeLessThan(oldHeight.speed);
      expect(stairs.rise * stairs.flight - 0.5 * gravity * stairs.flight ** 2).toBeCloseTo(-9.5 * FOOT, 6);
      expect(stairs.velocity.x * stairs.flight).toBeCloseTo(oldHeight.velocity.x * oldHeight.flight, 6);
      expect(stairGround(STAIR_RUN + stairs.terrain.landPast)).toBe(-9.5 * FOOT);
    }
  });

  it('clears every step and lands every trick past the bottom one, in every stance, whatever the pop', () => {
    const problems: string[] = [];
    for (const pop of POPS) {
      for (const base of BASES) {
        for (const stance of STANCES) for (const rider of RIDERS) {
          const stage = plan(base, { stance, rider, pop });
          const stairs = stage.stairs!;
          for (const frame of frames(stage, stairs.pop + 0.05, stairs.land - 1 / 60)) {
            for (const local of BOARD_POINTS) {
              const p = frame.rig.board.point(local);
              const clear = height(p) - stairGround(along(frame, p));
              if (clear < -0.01) problems.push(`${base} ${stance} ${rider} pop ${pop} t=${frame.t.toFixed(2)}: ${clear.toFixed(1)}`);
            }
          }
          const touchdown = stageFrame(stage, stairs.land, 1);
          // The whole board past the bottom step, down on the bottom landing.
          if (along(touchdown, touchdown.rig.board.center) < STAIR_RUN + 48) problems.push(`${base} ${stance} ${rider} pop ${pop} lands on the stairs`);
          expect(height(touchdown.rig.board.center)).toBeCloseTo(-STAIR_DROP + height({ x: 0, y: ASPHALT - 13, z: 0 }), 0);
        }
      }
    }
    expect(problems.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('rides the flatground trick and rider down whole, on a clock stretched to the drop', () => {
    for (const base of ['Kickflip', 'Frontside 360', 'Impossible']) {
      for (const stance of ['regular', 'fakie'] as Stance[]) {
        for (const rider of RIDERS) {
          const stairs = plan(base, { stance, rider });
          const flat = plan(base, { stance, rider, set: 'plaza' });
          const heading = stance === 'fakie' ? 180 : 0;
          const unturn = (p: V3): V3 => heading ? { x: 2 * X0 - p.x, y: p.y, z: -p.z } : p;
          // From the flatground roll-in on (before it, the stairs' run-up has no flatground frame).
          for (let t = stairs.stairs!.pop - ROLL_IN; t < stairs.stairs!.land; t += 0.05) {
            const down = stageFrame(stairs, t, 1).rig;
            const level = stageFrame(flat, stairClock(stairs.stairs!, t), 1).rig;
            expect(down.board.flipDeg).toBeCloseTo(level.board.flipDeg, 6);
            expect(down.board.yawDeg - heading).toBeCloseTo(level.board.yawDeg, 6);
            expect(down.bodyYawDeg - heading).toBeCloseTo(level.bodyYawDeg, 6);
            expect(down.headYawDeg - heading).toBeCloseTo(level.headYawDeg, 6);
            // Carried down by one offset (the board alone may be lifted clear of the lip).
            const offset = down.legs[0].hip.y - level.legs[0].hip.y;
            for (const [a, b] of [[down.head.origin, level.head.origin], [down.legs[1].hip, level.legs[1].hip], [down.arms[1].hand, level.arms[1].hand]]) {
              expect(unturn(a).x).toBeCloseTo(b.x, 6);
              expect(a.y - offset).toBeCloseTo(b.y, 6);
              expect(unturn(a).z).toBeCloseTo(b.z, 6);
            }
          }
          // The flight is the drop's: longer than flatground's, so the trick turns a little slower.
          expect(stairs.stairs!.flight).toBeGreaterThan(FLIP_T);
          // …and it starts further back, rolling up the run-up first.
          expect(stairs.end - flat.end).toBeCloseTo(stairs.stairs!.pop - ROLL_IN + stairs.stairs!.flight - FLIP_T, 6);
        }
      }
    }
  });

  it('keeps the same downhill travel while fakie faces backwards, in either rider stance', () => {
    for (const rider of RIDERS) {
      const regular = plan('Kickflip', { rider });
      const fakie = plan('Kickflip', { rider, stance: 'fakie' });
      expect(fakie.stairs).toEqual(regular.stairs);
      for (const t of [0, 0.4, regular.stairs!.pop, regular.stairs!.land, regular.end]) {
        const forwards = stageFrame(regular, t, 1);
        const backwards = stageFrame(fakie, t, 1);
        expect(forwards.stairs!.dir).toBe(1);
        expect(backwards.stairs!.dir).toBe(1);
        expect(backwards.scroll).toBeCloseTo(forwards.scroll, 8);
      }
      const forwards = stageFrame(regular, 0.4, 1).rig;
      const backwards = stageFrame(fakie, 0.4, 1).rig;
      expect(forwards.board.dir({ x: 1, y: 0, z: 0 }).x).toBeGreaterThan(0.99);
      expect(backwards.board.dir({ x: 1, y: 0, z: 0 }).x).toBeLessThan(-0.99);
      expect(forwards.head.fwd.x).toBeGreaterThan(0);
      expect(backwards.head.fwd.x).toBeLessThan(0);
      expect(backwards.toeDir).toBe(-forwards.toeDir);
    }
  });

  it('turns the whole fakie pose rigidly, preserving body axes, board normals and trick handedness', () => {
    const near = (actual: V3, expected: V3) => {
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
      expect(actual.z).toBeCloseTo(expected.z, 6);
    };
    for (const rider of RIDERS) {
      for (const base of ['Kickflip', 'Heelflip', 'Frontside 180', 'Backside 180', '360 Flip', 'Impossible']) {
        const stairs = plan(base, { stance: 'fakie', rider });
        const flat = plan(base, { stance: 'fakie', rider, set: 'plaza' });
        const t = stairs.stairs!.pop + stairs.stairs!.flight * 0.45;
        const down = stageFrame(stairs, t, 1).rig;
        const level = stageFrame(flat, stairClock(stairs.stairs!, t), 1).rig;
        const offset = down.legs[0].hip.y - level.legs[0].hip.y;
        const unturn = (p: V3): V3 => ({ x: 2 * X0 - p.x, y: p.y - offset, z: -p.z });
        const unturnDirection = (d: V3): V3 => ({ x: -d.x, y: d.y, z: -d.z });
        for (const local of BOARD_POINTS) near(unturn(down.board.point(local)), level.board.point(local));
        for (const axis of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]) {
          near(unturnDirection(down.board.dir(axis)), level.board.dir(axis));
        }
        for (const [a, b] of [[down.head, level.head], [down.torso, level.torso], ...down.legs.map((l, i) => [l.shoe, level.legs[i].shoe])]) {
          near(unturn(a.origin), b.origin);
          near(unturnDirection(a.fwd), b.fwd);
          near(unturnDirection(a.up), b.up);
          near(unturnDirection(a.side), b.side);
          near(unturn(a.at(5, 7, 9)), b.at(5, 7, 9));
          expect(dot3(cross3(a.fwd, a.up), a.side)).toBeCloseTo(dot3(cross3(b.fwd, b.up), b.side), 8);
        }
        for (let i = 0; i < 2; i++) {
          for (const key of ['hip', 'knee', 'ankle'] as const) near(unturn(down.legs[i][key]), level.legs[i][key]);
          for (const key of ['shoulder', 'elbow', 'hand'] as const) near(unturn(down.arms[i][key]), level.arms[i][key]);
        }
        expect(down.board.flipDeg).toBe(level.board.flipDeg);
        expect(down.board.pitchDeg).toBe(level.board.pitchDeg);
        expect(down.flickZ).toBe(-level.flickZ);
      }
    }
  });

  it('rolls the wheels in board coordinates before and after fakie turns', () => {
    for (const base of ['Ollie', 'Backside 180']) {
      for (const stance of ['regular', 'fakie'] as Stance[]) {
        const stage = plan(base, { stance });
        for (const t of [0.4, stage.stairs!.land + 0.3]) {
          const frame = stageFrame(stage, t, 1);
          const heading = frame.rig.board.dir({ x: 1, y: 0, z: 0 }).x;
          expect(Math.sign(frame.wheels.sweep)).toBe(Math.sign(heading));
          expect(frame.scroll).toBeGreaterThan(stageFrame(stage, t - 1 / 60, 1).scroll);
        }
      }
    }
  });

  it('lands heavier off nine and a half feet: deeper and longer in the crouch, never past the deepest squat', () => {
    for (const pop of POPS) {
      const stairs = plan('Ollie', { pop });
      const flat = plan('Ollie', { pop, set: 'plaza' });
      const landing = (stage: StagePlan, from: number) => frames(stage, from, from + 0.6).map((f) => f.rig.hipOverDeck);
      const down = landing(stairs, stairs.stairs!.land);
      const level = landing(flat, flat.end - LAND_T);
      const flatLowest = Math.min(...level);
      expect(Math.min(...down)).toBeLessThanOrEqual(flatLowest + 1e-6);
      expect(Math.min(...down)).toBeGreaterThanOrEqual(SQUAT_FLOOR);
      const crouched = (hips: number[]) => hips.filter((h) => h < flatLowest + 3).length;
      expect(crouched(down)).toBeGreaterThan(crouched(level));
    }
  });

  it('keeps the rider in the stock shot all the way down, and the board when zoomed in on it', () => {
    for (const base of ['Ollie', 'Kickflip', 'Frontside 360']) {
      const stage = plan(base);
      for (const zoom of [1, 1.6]) {
        for (const frame of frames(stage)) {
          const view = stageView(frame.lift, DEFAULT_SCENE_CAMERA, zoom);
          const { x, y, width, height: h } = view.box;
          // Zoomed in, the frame settles on the legs and board (on flatground too, the head pops out of it).
          const points = [...(zoom === 1 ? [frame.rig.head.at(0, 15, 0)] : []), ...BOARD_POINTS.map(frame.rig.board.point)];
          for (const p of points) {
            const q = view.cam.project(p);
            expect(q.x, `${base} zoom ${zoom} t=${frame.t.toFixed(2)}`).toBeGreaterThan(x);
            expect(q.x).toBeLessThan(x + width);
            expect(q.y, `${base} zoom ${zoom} t=${frame.t.toFixed(2)}`).toBeGreaterThan(y);
            expect(q.y, `${base} zoom ${zoom} t=${frame.t.toFixed(2)}`).toBeLessThan(y + h);
          }
        }
      }
    }
  });

  it('casts the shadows onto a step at or below the board, always rolling down the same staircase', () => {
    for (const stance of ['regular', 'fakie'] as Stance[]) {
      const stage = plan('Kickflip', { stance });
      const all = frames(stage);
      for (const frame of all) {
        const level = frame.stairs!.shadowY;
        expect(level).toBeLessThanOrEqual(0);
        expect(level).toBeGreaterThanOrEqual(-STAIR_DROP);
        expect(Math.abs(level / RISER - Math.round(level / RISER))).toBeLessThan(1e-6);
        expect(level).toBeLessThanOrEqual(height(frame.rig.board.center));
      }
      const distances = all.map((f) => f.scroll * f.stairs!.dir);
      expect(distances.every((d, i) => i === 0 || d > distances[i - 1])).toBe(true);
      expect(all[0].stairs!.dir).toBe(1);
    }
  });

  it('times the explorer’s moments to the stage, and sends grinds down the center rail instead', () => {
    for (const pop of POPS) {
      const stage = plan('Kickflip', { pop });
      const timeline = stairTimeline(robotWith(pop).skateStyle);
      expect(timeline.end).toBeCloseTo(stage.end, 9);
      expect(timeline.land).toBeCloseTo(stage.stairs!.land, 9);
      expect(timeline.pop).toBeLessThan(timeline.peak);
      expect(timeline.peak).toBeLessThan(timeline.catch);
      expect(timeline.catch).toBeLessThan(timeline.land);
    }
    const grind = plan('Frontside 50-50 Grind');
    expect(grind.stairs).toBeNull();
    expect(grind.grind?.handrail).not.toBeNull();
    expect(stageFrame(grind, 1, 1).stairs).toMatchObject({ dir: 1 });
    expect(plan('Frontside 50-50 Grind', { set: 'plaza' }).grind?.handrail).toBeNull();
  });

  it('reuses the same scene object for regular and fakie, with every rail casting its shadow', () => {
    const set = new ElToro3D();
    const view = stageView(0);
    for (const stance of ['regular', 'fakie'] as Stance[]) {
      const frame = stageFrame(plan('Ollie', { stance }), 0.5, 1);
      expect(() => set.update(view, frame.scroll, { width: 500, height: 404 }, null as never, [0.3, 0.3, 0.3], frame)).not.toThrow();
    }
    const builds = set.group.children.filter((child) => child instanceof Group);
    expect(builds).toHaveLength(1);
    expect(builds.filter((b) => b.visible)).toHaveLength(1);
    set.dispose();
  });
});
