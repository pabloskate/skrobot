import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import { FLIP_T, LAND_T } from '../TrickAnimation';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../scene/board';
import { DEFAULT_SCENE_CAMERA } from '../scene/camera';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../scene/deck';
import type { V3 } from '../scene/math';
import { SQUAT_FLOOR } from '../scene/skeleton';
import { FOOT, RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, stairClock, stairGround, stairTimeline } from '../scene/stairs';
import { resolveSkateStyle } from '../skateStyle';
import type { Robot, Stance, Trick } from '../types';
import { ElToro3D } from './elToro3d';
import { planStage, stageFrame, type StageFrame, type StagePlan } from './stage';
import { ASPHALT, stageView } from './view';
import { X0 } from '../TrickAnimation';

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
const plan = (base: string, options: { stance?: Stance; pop?: number; landed?: boolean; set?: 'el-toro' | 'plaza' } = {}): StagePlan => {
  const r = robotWith(options.pop ?? 0.92);
  return planStage(r, trick(base, options.stance), {
    landed: options.landed ?? true,
    riderStance: 'regular',
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

const BASES = ['Ollie', 'Kickflip', 'Heelflip', '360 Flip', 'Hardflip', 'Pop Shuvit', 'Backside 180', 'Frontside 360', 'Bigspin Flip', 'Impossible', 'Dolphin Flip', 'Late Kickflip'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const POPS = [0.45, 1, 1.15];

describe('El Toro', () => {
  it('is twenty steps falling nine feet over twenty, at a robot about five feet tall', () => {
    expect(STAIR_STEPS).toBe(20);
    expect(STAIR_DROP / FOOT).toBe(9);
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

  it('clears every step and lands every trick past the bottom one, in every stance, whatever the pop', () => {
    const problems: string[] = [];
    for (const pop of POPS) {
      for (const base of BASES) {
        for (const stance of STANCES) {
          const stage = plan(base, { stance, pop });
          const stairs = stage.stairs!;
          for (const frame of frames(stage, stairs.pop + 0.05, stairs.land - 1 / 60)) {
            for (const local of BOARD_POINTS) {
              const p = frame.rig.board.point(local);
              const clear = height(p) - stairGround(along(frame, p));
              if (clear < -0.01) problems.push(`${base} ${stance} pop ${pop} t=${frame.t.toFixed(2)}: ${clear.toFixed(1)}`);
            }
          }
          const touchdown = stageFrame(stage, stairs.land, 1);
          // The whole board past the bottom step, down on the bottom landing.
          if (along(touchdown, touchdown.rig.board.center) < STAIR_RUN + 48) problems.push(`${base} ${stance} pop ${pop} lands on the stairs`);
          expect(height(touchdown.rig.board.center)).toBeCloseTo(-STAIR_DROP + height({ x: 0, y: ASPHALT - 13, z: 0 }), 0);
        }
      }
    }
    expect(problems.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('rides the flatground trick and rider down whole, on a clock stretched to the drop', () => {
    for (const base of ['Kickflip', 'Frontside 360', 'Impossible']) {
      const stairs = plan(base);
      const flat = plan(base, { set: 'plaza' });
      for (let t = 0; t < stairs.stairs!.land; t += 0.05) {
        const down = stageFrame(stairs, t, 1).rig;
        const level = stageFrame(flat, stairClock(stairs.stairs!, t), 1).rig;
        expect(down.board.flipDeg).toBeCloseTo(level.board.flipDeg, 6);
        expect(down.board.yawDeg).toBeCloseTo(level.board.yawDeg, 6);
        // Carried down by one offset (the board alone may be lifted clear of the lip).
        const offset = down.legs[0].hip.y - level.legs[0].hip.y;
        for (const [a, b] of [[down.head.origin, level.head.origin], [down.legs[1].hip, level.legs[1].hip], [down.arms[1].hand, level.arms[1].hand]]) {
          expect(a.x).toBeCloseTo(b.x, 6);
          expect(a.y - offset).toBeCloseTo(b.y, 6);
          expect(a.z).toBeCloseTo(b.z, 6);
        }
      }
      // The flight is the drop's: longer than flatground's, so the trick turns a little slower.
      expect(stairs.stairs!.flight).toBeGreaterThan(FLIP_T);
      expect(stairs.end - flat.end).toBeCloseTo(stairs.stairs!.flight - FLIP_T, 6);
    }
  });

  it('lands heavier off nine feet: deeper and longer in the crouch, never past the deepest squat', () => {
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

  it('casts the shadows onto a step at or below the board, and rolls down the way the trick travels', () => {
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
      expect(all[0].stairs!.dir).toBe(stance === 'fakie' ? -1 : 1);
    }
  });

  it('times the explorer’s moments to the stage, and leaves grinds on their flat bar', () => {
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
    expect(stageFrame(grind, 1, 1).stairs).toBeNull();
  });

  it('builds the set each way the stairs fall, with every rail casting its shadow', () => {
    const set = new ElToro3D();
    const view = stageView(0);
    for (const stance of ['regular', 'fakie'] as Stance[]) {
      const frame = stageFrame(plan('Ollie', { stance }), 0.5, 1);
      expect(() => set.update(view, frame.scroll, { width: 500, height: 404 }, null as never, [0.3, 0.3, 0.3], frame)).not.toThrow();
    }
    const builds = set.group.children.filter((child) => child instanceof Group);
    expect(builds).toHaveLength(2);
    expect(builds.filter((b) => b.visible)).toHaveLength(1);
    set.dispose();
  });
});
