import { describe, expect, it } from 'vitest';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { ASPHALT } from '../camera/view';
import { resolveSkateStyle } from '../motion/style';
import { X0 } from '../motion/trick';
import { planStage, stageFrame } from '../stage/stage';
import type { RiderStance, Stance } from '../types';
import { setInfo, setTimeline, type StageSet } from './sets';
import { SUNSET_BANK_END, SUNSET_LAND_X, SUNSET_POP_X, SUNSET_POP_Z, SUNSET_ROOF_Z0, sunsetGround, sunsetSlope } from './sunset/sunsetLayout';
import { entryTurn, FOOT, terrainSurface, TURN_PAST_TOUCHDOWN } from './elToro/stairs';
import { LEAN_PAST_TOUCHDOWN } from '../stage/bank';
import { Sunset3D } from './sunset/sunset3d';
import { DEFAULT_SCENE_CAMERA } from '../camera/camera';
import { HOLLYWOOD_RAIL, HOLLYWOOD_RUN } from './hollywood/hollywoodLayout';

const SPOTS: StageSet[] = ['hollywood-high', 'wallenberg', 'sunset-car-wash', 'lyon-25', 'leap-of-faith', 'miami-triangle'];
const plan = (set: StageSet, base = 'Kickflip', stance: Stance = 'regular', riderStance: RiderStance = 'regular', popHeight = 1) =>
  planStage({ id: base, name: base, base, stance }, {
    set, landed: true, riderStance, style: resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 }), fall: 'slam', shankProgress: 0.65,
  });

describe('classic spots use their actual terrain', () => {
  it('rides Hollywood’s real center pipe and clears the final stair on dismount', () => {
    for (const base of ['Frontside 50-50 Grind', 'Backside Boardslide', 'Frontside Smith Grind', 'Kickflip into Frontside 50-50 Grind']) {
      for (const stance of ['regular', 'fakie'] as Stance[]) for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
        const stage = planStage({ id: base, name: base, base, stance }, {
          set: 'hollywood-high', rail: 'side', landed: true, riderStance,
          style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65,
        });
        expect(stage.rail).toEqual({ line: 'center', z: 0 });
        expect(stage.grind!.handrail!.rail).toBe(HOLLYWOOD_RAIL);
        const landing = stageFrame(stage, stage.grind!.land, 1);
        expect(landing.scroll).toBeGreaterThan(HOLLYWOOD_RUN);
        expect(landing.stairs!.shadowY).toBeCloseTo(-setInfo('hollywood-high').terrain!.drop);
      }
    }
  });

  it('plans each drop separately and keeps the explorer timeline synchronized', () => {
    const flights = new Set<number>();
    for (const set of SPOTS) {
      const stage = plan(set);
      const timeline = setTimeline(set, stage.style)!;
      expect(timeline.land).toBe(stage.stairs!.land);
      expect(timeline.end).toBe(stage.end);
      flights.add(stage.stairs!.flight);
      const frame = stageFrame(stage, timeline.land, 1);
      expect(frame.scroll).toBeCloseTo(stage.stairs!.terrain.run + stage.stairs!.terrain.landPast);
      expect(frame.stairs!.across).toBe(setInfo(set).terrain!.laneZ);
    }
    expect(flights.size).toBe(SPOTS.length);
  });

  it('clears the obstacles across tricks, both riders and forward/backward approaches', () => {
    const failures: string[] = [];
    for (const set of SPOTS) for (const base of ['Ollie', 'Kickflip', 'Heelflip', '360 Flip', 'Frontside 180', 'Impossible']) {
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) for (const rider of ['regular', 'goofy'] as RiderStance[]) {
        const stage = plan(set, base, stance, rider, 0.65);
        const terrain = setInfo(set).terrain!;
        for (let t = stage.stairs!.pop + 0.06; t <= stage.end; t += 1 / 30) {
          const frame = stageFrame(stage, t, 1);
          for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
            // Lowest point of a wheel in the board's transverse plane.
            const center = frame.rig.board.point({ x, y: WHEEL_Y, z });
            const clearance = ASPHALT - center.y - WHEEL_R - terrainSurface(terrain, frame.scroll + center.x - X0, frame.stairs!.across + center.z);
            if (clearance < -0.65) failures.push(`${set} ${base}/${stance}/${rider} t=${t.toFixed(2)}: ${clearance.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('lands on Sunset’s bank uphill truck first, settles both trucks downhill, then rolls onto the flat', () => {
    for (const stance of ['regular', 'fakie'] as Stance[]) for (const rider of ['regular', 'goofy'] as RiderStance[]) {
      const stage = plan('sunset-car-wash', 'Kickflip', stance, rider);
      const land = stage.stairs!.land;
      const touchdown = stageFrame(stage, land, 1);
      // Wheel heights over the bank, uphill truck first.
      const trucks = (frame: typeof touchdown) => [-WHEEL_X, WHEEL_X]
        .map(x => frame.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z }))
        .sort((a, b) => a.x - b.x)
        .map(p => ASPHALT - p.y - sunsetGround(frame.scroll + p.x - X0));
      // Still leaning in as it lands: a little flatter than the bank, so the
      // uphill truck touches while the nose is a few inches off it.
      const [uphill, downhill] = trucks(touchdown);
      expect(uphill).toBeLessThan(1);
      expect(downhill).toBeGreaterThan(5);
      const leaned = stageFrame(stage, land + LEAN_PAST_TOUCHDOWN, 1);
      const axis = leaned.rig.board.dir({ x: 1, y: 0, z: 0 });
      expect(axis.y / axis.x).toBeCloseTo(-sunsetSlope(leaned.scroll), 3);
      for (const height of trucks(leaned)) expect(height).toBeLessThan(0.5);
      expect(touchdown.scroll).toBeCloseTo(SUNSET_LAND_X);
      expect(touchdown.scroll).toBeLessThan(SUNSET_BANK_END);
      const end = stageFrame(stage, stage.end, 1);
      expect(end.scroll).toBeGreaterThan(SUNSET_BANK_END + 60);
      expect(end.rig.board.dir({ x: 1, y: 0, z: 0 }).y).toBeCloseTo(0, 3);
      expect(ASPHALT - end.rig.board.center.y - sunsetGround(end.scroll)).toBeCloseTo(13, 0);
    }
  });

  it('adds Sunset’s quarter-turn to every trick, approaching toward the roof’s right end and landing beside it', () => {
    for (const base of ['Ollie', 'Kickflip', 'Heelflip', 'Frontside 180', 'Backside 360', '360 Flip']) {
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) for (const rider of ['regular', 'goofy'] as RiderStance[]) {
        const stage = plan('sunset-car-wash', base, stance, rider);
        const straight = { ...stage, stairs: { ...stage.stairs!, terrain: { ...stage.stairs!.terrain, entry: undefined } } };
        const pop = stage.stairs!.pop, land = stage.stairs!.land;
        const setup = stageFrame(stage, pop - 0.2, 1);
        const takeoff = stageFrame(stage, pop, 1);
        const touchdown = stageFrame(stage, land, 1);
        expect(setup.scroll).toBeCloseTo(SUNSET_POP_X);
        expect(takeoff.scroll).toBeCloseTo(SUNSET_POP_X);
        expect(setup.stairs!.across).toBeGreaterThan(takeoff.stairs!.across);
        expect(takeoff.stairs!.across).toBeCloseTo(SUNSET_POP_Z);
        expect(takeoff.stairs!.across).toBeGreaterThan(SUNSET_ROOF_Z0);
        expect(touchdown.stairs!.across).toBe(-18 * FOOT);
        expect(SUNSET_ROOF_Z0 - touchdown.stairs!.across).toBe(9 * FOOT);
        expect(touchdown.scroll).toBeCloseTo(SUNSET_LAND_X);
        expect(touchdown.scroll).toBeCloseTo(3 * FOOT);
        // The terrain contributes +90° before takeoff, a few degrees still
        // to carve at touchdown and none once that carve is done, regardless
        // of the selected trick's own yaw and forward/fakie stance.
        const terrainYaw = (t: number) => stageFrame(stage, t, 1).rig.board.yawDeg - stageFrame(straight, t, 1).rig.board.yawDeg;
        expect(terrainYaw(pop - 0.2)).toBeCloseTo(90);
        const left = 90 * (1 - entryTurn(stage.stairs!, land));
        expect(left).toBeGreaterThan(8);
        expect(left).toBeLessThan(25);
        expect(touchdown.rig.board.yawDeg - stageFrame(straight, land, 1).rig.board.yawDeg).toBeCloseTo(left);
        expect(terrainYaw(land + TURN_PAST_TOUCHDOWN)).toBeCloseTo(0);
        const middle = (pop + land) / 2;
        const turned = stageFrame(stage, middle, 1).rig;
        const original = stageFrame(straight, middle, 1).rig;
        // Own-trick rotations survive during flight, not just at its endpoints.
        const midTurn = 90 * (1 - entryTurn(stage.stairs!, middle));
        expect(turned.board.yawDeg - original.board.yawDeg).toBeCloseTo(midTurn);
        expect(turned.bodyYawDeg - original.bodyYawDeg).toBeCloseTo(midTurn);
        expect(turned.headYawDeg - original.headYawDeg).toBeCloseTo(midTurn);
        for (const seam of [pop, land]) {
          const before = stageFrame(stage, seam - 1e-5, 1);
          const after = stageFrame(stage, seam + 1e-5, 1);
          expect(Math.abs(before.scroll - after.scroll)).toBeLessThan(0.02);
          expect(Math.abs(before.stairs!.across - after.stairs!.across)).toBeLessThan(0.02);
        }
      }
    }
  });

  it('keeps the pitched rider and board inside Sunset’s default shot', () => {
    const spot = new Sunset3D();
    try {
      for (const rider of ['regular', 'goofy'] as RiderStance[]) {
        const stage = plan('sunset-car-wash', 'Kickflip', 'regular', rider);
        for (let t = 0; t <= stage.end; t += 1 / 30) {
          const frame = stageFrame(stage, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, null)!;
          const points = [frame.rig.head.at(0, 15, 0)];
          for (const x of [-WHEEL_X, WHEEL_X]) points.push(frame.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z }));
          for (const point of points) {
            const p = view.cam.project(point);
            expect(p.x, `x at ${t}`).toBeGreaterThan(view.box.x);
            expect(p.x).toBeLessThan(view.box.x + view.box.width);
            expect(p.y, `y at ${t}`).toBeGreaterThan(view.box.y);
            expect(p.y, `y at ${t}`).toBeLessThan(view.box.y + view.box.height);
          }
        }
      }
    } finally { spot.dispose(); }
  });
});
