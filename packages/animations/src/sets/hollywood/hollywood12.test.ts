import { describe, expect, it } from 'vitest';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { ASPHALT } from '../../camera/view';
import { boardSamples } from '../../motion/grindTesting';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame, type StagePlan } from '../../stage/stage';
import { isFiniteFrame, sweepHz } from '../../testing';
import type { RiderStance, Stance } from '../../types';
import { terrainSurface } from '../elToro/stairs';
import { setInfo, setTimeline } from '../sets';
import { SET_SCALE } from '../setScale';
import {
  HOLLYWOOD_12_DROP, HOLLYWOOD_12_GRADE, HOLLYWOOD_12_LANE_Z,
  HOLLYWOOD_12_RAIL, HOLLYWOOD_12_RUN, HOLLYWOOD_GRADE,
} from './hollywoodLayout';

const K = SET_SCALE;
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const style = resolveSkateStyle({ popHeight: 0.65, rotationSpeed: 1.08, flickStrength: 0.95 });
const plan = (base: string, stance: Stance, riderStance: RiderStance, landed = true): StagePlan =>
  planStage({ id: base, name: base, base, stance }, {
    set: 'hollywood-high-12', rail: 'side', landed, riderStance, style,
    fall: landed ? 'slam' : 'kickout', shankProgress: 0.65,
  });

/** Wheel clearance above the actual stair or landing under its world position. */
function wheelClearances(frame: StageFrame): number[] {
  const terrain = setInfo('hollywood-high-12').terrain!;
  return [-WHEEL_X, WHEEL_X].flatMap((x) => [-WHEEL_Z, WHEEL_Z].map((z) => {
    const center = frame.rig.board.point({ x, y: WHEEL_Y, z });
    return ASPHALT - center.y - WHEEL_R - terrainSurface(terrain, frame.scroll + center.x - X0, frame.stairs!.across + center.z);
  }));
}

describe('Hollywood High twelve-stair attempts', () => {
  it('uses the twelve’s own steeper, shorter terrain and rail, on the street-side gap line', () => {
    const info = setInfo('hollywood-high-12');
    expect(info.terrain!.run).toBe(HOLLYWOOD_12_RUN * K);
    expect(info.terrain!.drop).toBe(HOLLYWOOD_12_DROP * K);
    expect(info.terrain!.laneZ).toBe(HOLLYWOOD_12_LANE_Z * K);
    expect(info.rails!.handrail.slope).toBe(HOLLYWOOD_12_GRADE);
    expect(info.rails!.handrail.slope).toBeGreaterThan(HOLLYWOOD_GRADE);
    expect(info.rails!.handrail.end).toBe(HOLLYWOOD_12_RAIL.end * K);
    expect(info.rails!.sideGrinds).toBe(false);
  });

  it('clears the twelve’s steps and lands all four wheels on its bottom landing in every stance', () => {
    const failures: string[] = [];
    for (const base of ['Ollie', 'Kickflip', 'Heelflip', 'Frontside 180', '360 Flip', 'Impossible']) {
      for (const stance of STANCES) for (const rider of RIDERS) {
        const stage = plan(base, stance, rider);
        const timeline = setTimeline('hollywood-high-12', style, true, 'stairs', stance, base);
        expect(stage.grind).toBeNull();
        expect(timeline.land).toBe(stage.stairs!.land);
        expect(timeline.end).toBe(stage.end);
        for (let t = stage.stairs!.pop + 0.06; t <= stage.end; t += 1 / sweepHz(60)) {
          const frame = stageFrame(stage, t, 1);
          const clearance = Math.min(...wheelClearances(frame));
          if (!isFiniteFrame(frame) || clearance < -0.65) failures.push(`${base}/${stance}/${rider} at ${t.toFixed(3)}: ${clearance}`);
        }
        const touchdown = stageFrame(stage, timeline.land, 1);
        expect(touchdown.scroll).toBeCloseTo(stage.stairs!.terrain.run + stage.stairs!.terrain.landPast, 8);
        expect(touchdown.stairs!.across).toBe(HOLLYWOOD_12_LANE_Z * K);
        expect(touchdown.stairs!.shadowY).toBeCloseTo(-HOLLYWOOD_12_DROP * K, 8);
        const rideAway = stageFrame(stage, stage.end, 1);
        for (const clearance of wheelClearances(rideAway)) expect(clearance).toBeCloseTo(0, 3);
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('grinds its center pipe in both rider stances, including trick entries and exits, clearing the last riser', () => {
    const failures: string[] = [];
    for (const base of [
      'Frontside 50-50 Grind', 'Backside Boardslide', 'Frontside Smith Grind',
      'Kickflip into Frontside 50-50 Grind', 'Backside 5-0 Grind Kickflip Out',
    ]) {
      for (const stance of STANCES) for (const rider of RIDERS) {
        const stage = plan(base, stance, rider);
        const grind = stage.grind!;
        expect(grind, `${base}/${stance}`).not.toBeNull();
        expect(stage.rail).toEqual({ line: 'center', z: 0 });
        expect(grind.handrail!.rail).toBe(setInfo('hollywood-high-12').rails!.handrail);
        for (let t = grind.off; t <= grind.land + 0.02; t += 1 / sweepHz(60)) {
          const frame = stageFrame(stage, t, 1);
          const clearance = Math.min(...boardSamples(frame.rig).map((p) => ASPHALT - p.y - K * HOLLYWOOD_12_RAIL.ground((frame.scroll + p.x - X0) / K)));
          if (!isFiniteFrame(frame) || clearance < -0.65) failures.push(`${base}/${stance}/${rider} at ${t.toFixed(3)}: ${clearance}`);
        }
        const landing = stageFrame(stage, grind.land, 1);
        expect(landing.scroll).toBeGreaterThan(HOLLYWOOD_12_RUN * K);
        expect(landing.stairs!.shadowY).toBeCloseTo(-HOLLYWOOD_12_DROP * K, 8);
        const rideAway = stageFrame(stage, stage.end, 1);
        for (const clearance of wheelClearances(rideAway)) expect(clearance).toBeCloseTo(0, 3);
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 60_000);

  it('keeps kicked-out gap and rail attempts finite through their own bottom landing', () => {
    for (const base of ['Kickflip', 'Frontside 50-50 Grind']) for (const stance of ['regular', 'fakie'] as Stance[]) for (const rider of RIDERS) {
      const stage = plan(base, stance, rider, false);
      expect(stage.grind ? stage.railBail : stage.stairs).not.toBeNull();
      for (let t = 0; t <= stage.end; t += 1 / sweepHz(30)) {
        expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base}/${stance}/${rider} at ${t.toFixed(3)}`).toBe(true);
      }
      const end = stageFrame(stage, stage.end, 1);
      expect(end.scroll).toBeGreaterThan(HOLLYWOOD_12_RUN * K);
      expect(end.stairs!.shadowY).toBeCloseTo(-HOLLYWOOD_12_DROP * K, 8);
    }
  }, 60_000);
});
