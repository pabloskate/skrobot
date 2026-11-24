import { describe, expect, it } from 'vitest';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { resolveSkateStyle } from '../../motion/style';
import { X0, type FallVariant } from '../../motion/trick';
import { planStairs, stairTrack } from '../../stage/drop';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import { RIDERS, STANCES, SWEEP_TIMEOUT, sweepHz } from '../../testing';
import type { RiderStance, Stance } from '../../types';
import { FOOT } from '../../units';
import { SET_SCALE, stageTerrain } from '../setScale';
import {
  WATER_TOWER_FILMERS, WATER_TOWER_FOOT as F, WATER_TOWER_GAP, WATER_TOWER_HEIGHT, WATER_TOWER_LAND_PAST, WATER_TOWER_LANDING_X,
  WATER_TOWER_LANE_Z, WATER_TOWER_ROOF_RADIUS, WATER_TOWER_TAKEOFF_X, WATER_TOWER_TERRAIN, waterTowerGround, waterTowerHill,
  waterTowerRoof, waterTowerSurface,
} from './waterTowerLayout';

const attempt = (base: string, landed: boolean, fall: FallVariant, stance: Stance = 'regular', riderStance: RiderStance = 'regular') => planStage(
  { id: base, name: base, base, stance },
  { set: 'water-tower-gap', landed, riderStance, style: resolveSkateStyle(), skater: 'realistic', fall, shankProgress: 0.65 },
);
/** A stage length in the set's own units. */
const set = (units: number) => units / SET_SCALE;
/** A rig point in the set's own coordinates (set units). */
const inSet = (frame: StageFrame, point: V3) => ({ x: set(frame.scroll + point.x - X0), y: set(ASPHALT - point.y), z: set(frame.stairs!.across + point.z) });

describe('Water tower gap: the two reservoirs as surveyed', () => {
  it('stands two level roofs 174 ft across, 13.9 ft apart and 21 ft up', () => {
    expect(WATER_TOWER_GAP / F).toBeCloseTo(13.9, 9);
    expect(WATER_TOWER_HEIGHT / F).toBeCloseTo(21, 9);
    expect((2 * WATER_TOWER_ROOF_RADIUS) / F).toBeCloseTo(174.4, 9);
    // Level with each other, the slot between them open to the pavement, each roof ending at its far rim.
    expect(waterTowerGround(-0.01 * F)).toBe(0);
    expect(waterTowerGround(0.01 * F)).toBe(-WATER_TOWER_HEIGHT);
    expect(waterTowerGround(WATER_TOWER_GAP - 0.01 * F)).toBe(-WATER_TOWER_HEIGHT);
    expect(waterTowerGround(WATER_TOWER_GAP + 0.01 * F)).toBe(0);
    expect(waterTowerRoof(WATER_TOWER_TAKEOFF_X - WATER_TOWER_ROOF_RADIUS + F, 0)).toBe('takeoff');
    expect(waterTowerRoof(WATER_TOWER_LANDING_X + WATER_TOWER_ROOF_RADIUS - F, 0)).toBe('landing');
    expect(waterTowerRoof(WATER_TOWER_LANDING_X + WATER_TOWER_ROOF_RADIUS + F, 0)).toBeNull();
    // Off the line the round roofs draw apart: 10 ft to one side the slot is over a foot wider.
    const edge = (z: number) => Math.sqrt(WATER_TOWER_ROOF_RADIUS ** 2 - z ** 2) - WATER_TOWER_ROOF_RADIUS;
    expect((WATER_TOWER_GAP - 2 * edge(10 * F)) / F).toBeGreaterThan(15);
    // The terrain's ground and its surface agree on the line: the ride follows one, the falls the other.
    for (let u = -100 * F; u <= 120 * F; u += F / 3) expect(waterTowerGround(u), `u ${u / F}`).toBe(waterTowerSurface(u, WATER_TOWER_LANE_Z));
  });

  it('crosses on a low, quick pop at about 18 mph, the tricks turning faster to fit, back wheels down just inside the far rim', () => {
    const plan = planStairs({ popHeight: resolveSkateStyle().popHeight }, true, stageTerrain(WATER_TOWER_TERRAIN));
    // No drop to add hang: the air is the low pop's own, shorter than the flatground hop, so every trick turns faster.
    expect(plan.flight).toBeGreaterThan(0.6);
    expect(plan.flight).toBeLessThan(0.65);
    expect(plan.flight / plan.clockFlight).toBeGreaterThan(0.75);
    expect(plan.flight / plan.clockFlight).toBeLessThan(0.8);
    // About 18 mph: between the game's fast gaps and the day's low, flat ollie at about 22.
    const mph = plan.speed / FOOT * 3600 / 5280;
    expect(mph).toBeGreaterThan(17.5);
    expect(mph).toBeLessThan(18.5);
    // A low- or high-popping rider gets the same arc: the gap sets the pop.
    for (const popHeight of [0.45, 1.15]) expect(planStairs({ popHeight }, true, stageTerrain(WATER_TOWER_TERRAIN)).speed).toBeCloseTo(plan.speed, 6);
    expect(WATER_TOWER_LAND_PAST / F).toBeGreaterThanOrEqual(1.5);
    expect(WATER_TOWER_LAND_PAST / F).toBeLessThanOrEqual(2.5);
  });

  it('rolls in across the takeoff roof and away across the landing roof, whatever the pop', () => {
    for (const popHeight of [0.45, 1, 1.15]) {
      const plan = planStairs({ popHeight }, true, stageTerrain(WATER_TOWER_TERRAIN));
      for (let t = 0; t <= plan.pop; t += 1 / 60) {
        const p = stairTrack(plan, t, 0);
        expect(waterTowerRoof(set(p.x), set(p.z)), `pop ${popHeight} t=${t.toFixed(2)}`).toBe('takeoff');
      }
    }
    for (const stance of STANCES) for (const rider of RIDERS) {
      const stage = attempt('Ollie', true, 'slam', stance, rider);
      for (let t = stage.stairs!.land; t <= stage.end; t += 1 / 30) {
        const board = inSet(stageFrame(stage, t, 1), stageFrame(stage, t, 1).rig.board.center);
        expect(waterTowerRoof(board.x, board.z), `${stance}/${rider} t=${t.toFixed(2)}`).toBe('landing');
        expect(board.y / F, `${stance}/${rider} t=${t.toFixed(2)}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every fall on the landing roof, rider and board', () => {
    const failures: string[] = [];
    for (const fall of ['kickout', 'slipback', 'washout', 'slam', 'bail'] as const) {
      // An impossible's kicked board flies widest; fakie pops from further back.
      for (const [base, stance, rider] of [['Kickflip', 'regular', 'regular'], ['Impossible', 'regular', 'goofy'], ['360 Flip', 'fakie', 'regular']] as const) {
        const stage = attempt(base, false, fall, stance, rider);
        for (let t = stage.stairs!.land; t <= stage.end; t += 1 / sweepHz(30)) {
          const frame = stageFrame(stage, Math.min(t, stage.end), 1);
          const out = ([['board', frame.rig.board.center], ['hips', frame.rig.legs[0].hip]] as const).find(([, point]) => {
            const p = inSet(frame, point);
            return waterTowerRoof(p.x, p.z) !== 'landing' || p.y < -F;
          });
          if (!out) continue;
          const p = inSet(frame, out[1]);
          failures.push(`${fall} ${base} ${stance}/${rider} at ${t.toFixed(2)}: ${out[0]} at ${(p.x / F).toFixed(0)}, ${(p.z / F).toFixed(0)} ft, ${(p.y / F).toFixed(1)} up`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  }, SWEEP_TIMEOUT);

  it('stands every filmer on something: the pavement, a roof, or the hillside', () => {
    const { stands, across } = WATER_TOWER_FILMERS.stairs;
    const under = (z: number, x: number) => Math.max(waterTowerSurface(x, z), waterTowerHill(z));
    for (const [name, stand] of [...Object.entries(stands), ...Object.entries(across ?? {}).map(([k, v]) => [`${k} across`, v] as const)]) {
      const eye = (stand.height - under(stand.z, stand.u)) / F;
      expect(eye, name).toBeGreaterThan(2.5);
      expect(eye, name).toBeLessThan(7);
    }
    // The cover's filmer is down in the slot, well under the roofs; the video's is up the hill, about level with them.
    expect(stands.bottom.height).toBeLessThan(-15 * F);
    expect(waterTowerRoof(stands.bottom.u, stands.bottom.z)).toBeNull();
    expect(Math.abs(stands.side.height) / F).toBeLessThan(10);
    expect(attempt('Ollie', true, 'slam').stairs).toBeTruthy();
  });
});
