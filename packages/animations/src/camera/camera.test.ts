import { describe, expect, it } from 'vitest';
import { computeFrame, specFor, FLIP_T, GROUND, H, LAND_T, ROLL_IN, SKY_PAD, W, X0, TRICK_BASES } from '../motion/trick';
import { resolveSkateStyle } from '../motion/style';
import { resolveRiderMechanics } from '../motion/stance';
import { isFiniteFrame } from '../testing';
import { planStage, stageFrame } from '../stage/stage';
import { stageView } from './view';
import type { RiderStance, Stance, Trick } from '../types';
import { DEFAULT_SCENE_CAMERA, SCENE_CAMERA_BOUNDS, SCENE_ZOOM, cameraLift, clampSceneCamera, clampZoom, makeCamera, zoomedViewBox, type SceneCamera } from './camera';
import { grindCameraLift, planGrind } from '../motion/grind';
import { BAR_HALF, BAR_Z, GRIND_BASES, exitEndsFor, grindSpecFor, joinGrindBase, joinGrindExit } from '../motion/grindDefinitions';
import { solveGrindRig } from '../motion/grindRig';
import { solveRig } from '../motion/rig';
import type { Rig } from '../motion/skeleton';

/**
 * The crane films every trick in frame from any SceneCamera inside
 * SCENE_CAMERA_BOUNDS. These pin what that promise means: omitting the
 * camera is exactly the stock view, the eye never crosses the bar's plane,
 * and every landed trick, flatground or grind, stays in frame from anywhere
 * in the bounds.
 */

const BASES = TRICK_BASES;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const POPS = [0.45, 1.15];

const { yaw: YAW, pitch: PITCH, lens: LENS } = SCENE_CAMERA_BOUNDS;
/** A grid over the bounds, edges included: wide lenses frame worst part-way down. */
const VIEWS: SceneCamera[] = [YAW.min, -26, 0, YAW.max].flatMap((yaw) =>
  [0, 15, 30, 45, 60].flatMap((pitch) => [LENS.min, 1, LENS.max].map((lens) => ({ yaw, pitch, lens }))));

const trickOf = (base: string, stance: Stance): Trick => ({ id: `${base}-${stance}`, name: base, base, stance });
const stageOf = (base: string, riderStance: RiderStance) =>
  planStage(trickOf(base, 'regular'), { landed: true, riderStance, style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65 });
const finiteView = (view: ReturnType<typeof stageView>) =>
  [...view.eye, ...view.right, ...view.up, ...view.back, view.focal, view.distance, ...Object.values(view.frustum)].every(Number.isFinite);

/** The furthest the rider reaches past each edge of the stage, over every view. */
function frameSweep() {
  const worst = new Map<string, { over: number; where: string }>();
  const push = (edge: string, over: number, where: string) => {
    if (over > (worst.get(edge)?.over ?? -Infinity)) worst.set(edge, { over, where });
  };
  return {
    sample(rig: Rig, lift: number, where: string) {
      const antenna = rig.head.at(0, 28, 0);
      const extremes = [
        ...[-1, 1].flatMap((a) => [-1, 1].map((b) => rig.head.at(a * 14, 15, b * 18))),
        ...rig.legs.map((leg) => leg.shoe.origin),
        ...rig.arms.map((arm) => arm.hand),
      ];
      for (const view of VIEWS) {
        const cam = makeCamera(lift, view);
        const label = `${where} ${JSON.stringify(view)}`;
        push('top', -SKY_PAD - cam.project(antenna).y, label);
        for (const p of extremes) {
          const pp = cam.project(p);
          push('bottom', pp.y - H, label);
          push('left', -pp.x, label);
          push('right', pp.x - W, label);
        }
      }
    },
    verify() {
      expect(worst.size).toBe(4);
      for (const [edge, { over, where }] of worst) expect(over, `${edge}: ${where}`).toBeLessThan(0);
    },
  };
}

describe('Scene camera', () => {
  it('films the stock view when no camera is given', () => {
    const stage = stageOf('360 Flip', 'goofy');
    for (const t of [0, ROLL_IN + FLIP_T * 0.5, ROLL_IN + FLIP_T + LAND_T]) {
      const { lift } = stageFrame(stage, t, 1);
      // The camera itself holds functions; everything it frames with is plain data.
      const framing = (view: ReturnType<typeof stageView>) => ({ ...view, cam: view.cam.eye });
      expect(framing(stageView(lift, { ...DEFAULT_SCENE_CAMERA }))).toEqual(framing(stageView(lift)));
    }
  });

  it('clamps cameras into the bounds and fills gaps from the stock view', () => {
    expect(clampSceneCamera({})).toEqual(DEFAULT_SCENE_CAMERA);
    expect(clampSceneCamera({ yaw: 400, pitch: -20, lens: Number.NaN })).toEqual({ yaw: YAW.max, pitch: PITCH.min, lens: DEFAULT_SCENE_CAMERA.lens });
  });

  it('keeps the eye on the viewer\'s side of the bar from every camera in bounds', () => {
    // The bar sorts the rider and the board's parts against its own plane,
    // which is only right while the eye is on the +z side of it.
    for (const yaw of [YAW.min, YAW.max]) {
      for (const pitch of [PITCH.min, PITCH.max]) {
        for (const lens of [LENS.min, LENS.max]) {
          expect(makeCamera(0, { yaw, pitch, lens }).eye.z - BAR_Z, `${yaw} ${pitch} ${lens}`).toBeGreaterThan(4 * BAR_HALF);
        }
      }
    }
  });

  it('keeps every landed flatground trick in frame from every camera in bounds', () => {
    const sweep = frameSweep();
    for (const popHeight of POPS) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const base of BASES) {
        for (const stance of STANCES) {
          const spec = specFor(trickOf(base, stance));
          for (const rider of RIDERS) {
            const mechanics = resolveRiderMechanics(rider, stance);
            for (let t = 0; t <= ROLL_IN + FLIP_T + LAND_T; t += 0.06) {
              const f = computeFrame(t, spec, true, 'slam', 0.9, style);
              const rig = solveRig(f, spec, mechanics, style, 'landed');
              const lift = cameraLift(f.motion.flight, style.popHeight, GROUND - rig.head.origin.y, false);
              sweep.sample(rig, lift, `${base} ${stance} ${rider} pop ${popHeight} t=${t.toFixed(2)}`);
            }
          }
        }
      }
    }
    sweep.verify();
  }, 60_000);

  it('keeps every landed grind, and tricks into and out of one, in frame from every camera in bounds', () => {
    const sweep = frameSweep();
    const names = GRIND_BASES.flatMap((grind) => ['Frontside', 'Backside'].flatMap((side) => {
      const sided = `${side} ${grind}`;
      const [end] = exitEndsFor(grind);
      return [sided, joinGrindBase('360 Flip', sided), joinGrindExit(sided, 'Bigspin', end), joinGrindBase('Kickflip', joinGrindExit(sided, 'Heelflip', end))];
    }));
    for (const popHeight of POPS) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const name of names) {
        for (const stance of ['regular', 'fakie'] as Stance[]) {
          const spec = grindSpecFor({ base: name, stance });
          expect(spec, name).not.toBeNull();
          for (const rider of RIDERS) {
            const mechanics = resolveRiderMechanics(rider, stance);
            const plan = planGrind(spec!, mechanics, style, true, 'slam');
            for (let t = 0; t <= plan.end; t += 0.06) {
              const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
              sweep.sample(rig, grindCameraLift(plan, t, frame.rail, 0), `${name} ${stance} ${rider} pop ${popHeight} t=${t.toFixed(2)}`);
            }
          }
        }
      }
    }
    sweep.verify();
  }, 60_000);

  it('frames finite geometry, flatground and grinds, from the corners of the bounds', () => {
    for (const camera of [
      { yaw: YAW.min, pitch: PITCH.min, lens: LENS.min },
      { yaw: YAW.max, pitch: PITCH.max, lens: LENS.max },
      { yaw: YAW.min, pitch: PITCH.max, lens: LENS.min },
      { yaw: YAW.max, pitch: PITCH.min, lens: LENS.min },
    ]) {
      for (const base of ['360 Flip', 'Kickflip into Frontside Lipslide', 'Backside 5-0 Grind Kickflip Out']) {
        const stage = stageOf(base, 'goofy');
        for (const t of [0, ROLL_IN + FLIP_T * 0.5, 2.4, 6]) {
          const frame = stageFrame(stage, t, 1);
          const label = `${base} ${JSON.stringify(camera)} t=${t}`;
          expect(isFiniteFrame(frame), label).toBe(true);
          expect(finiteView(stageView(frame.lift, camera)), label).toBe(true);
        }
      }
    }
  });
});

describe('Scene zoom', () => {
  const STOCK = { x: 0, y: -SKY_PAD, width: W, height: H + SKY_PAD };

  it('is the stock picture at 1× and when none is given, and stays inside its bounds', () => {
    expect(zoomedViewBox(1, STOCK)).toEqual(STOCK);
    expect(clampZoom(undefined)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(0.01)).toBe(SCENE_ZOOM.min);
    expect(clampZoom(99)).toBe(SCENE_ZOOM.max);
    expect(stageView(0, DEFAULT_SCENE_CAMERA, 1).box).toEqual(stageView(0).box);
  });

  it('magnifies the picture without changing its shape: zooming in shows less, out shows more', () => {
    for (const zoom of [SCENE_ZOOM.min, 0.75, 1.5, 2, SCENE_ZOOM.max]) {
      const box = zoomedViewBox(zoom, STOCK);
      expect(box.width * zoom, `${zoom}×`).toBeCloseTo(STOCK.width, 9);
      expect(box.height * zoom, `${zoom}×`).toBeCloseTo(STOCK.height, 9);
      expect(box.width / box.height, `${zoom}×`).toBeCloseTo(STOCK.width / STOCK.height, 9);
      // Centered on the rider across the stage, whatever the zoom.
      expect(box.x + box.width / 2, `${zoom}×`).toBeCloseTo(X0, 9);
    }
  });

  it('keeps the rider\'s hips and the ground under them in the shot at every zoom', () => {
    // The target is the resting hip and projects to the stage's anchor; the board
    // sits on the ground straight below it. Zooming in is for a close look at the
    // trick, so both have to survive it.
    const cam = makeCamera(0);
    const hips = cam.project({ x: X0, y: GROUND - 72, z: 0 });
    const ground = cam.project({ x: X0, y: GROUND, z: 0 });
    for (let zoom = SCENE_ZOOM.min; zoom <= SCENE_ZOOM.max + 1e-9; zoom += 0.05) {
      const box = zoomedViewBox(zoom, STOCK);
      for (const [name, p] of [['hips', hips], ['ground', ground]] as const) {
        expect(p.x, `${name} x at ${zoom.toFixed(2)}×`).toBeGreaterThan(box.x);
        expect(p.x, `${name} x at ${zoom.toFixed(2)}×`).toBeLessThan(box.x + box.width);
        expect(p.y, `${name} y at ${zoom.toFixed(2)}×`).toBeGreaterThan(box.y);
        expect(p.y, `${name} y at ${zoom.toFixed(2)}×`).toBeLessThan(box.y + box.height);
      }
    }
  });

  it('frames finite geometry zoomed all the way out and all the way in', () => {
    const stage = stageOf('Kickflip', 'regular');
    for (const zoom of [SCENE_ZOOM.min, SCENE_ZOOM.max]) {
      for (const t of [0, ROLL_IN + FLIP_T * 0.5, ROLL_IN + FLIP_T + LAND_T]) {
        expect(finiteView(stageView(stageFrame(stage, t, 1).lift, DEFAULT_SCENE_CAMERA, zoom)), `${zoom}× t=${t}`).toBe(true);
      }
    }
  });
});
