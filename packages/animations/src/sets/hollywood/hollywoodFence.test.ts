import { describe, expect, it } from 'vitest';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { resolveSkateStyle } from '../../motion/style';
import { TRICK_BASES, X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { EL_TORO_TERRAIN, landingYaw } from '../elToro/stairs';
import { setInfo, setTerrain, setTimeline } from '../sets';
import { Hollywood3D, HOLLYWOOD_TRAFFIC, HOLLYWOOD_TREES } from './hollywood3d';
import {
  HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_CHEEK_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP,
  HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_FENCE_TERRAIN, HOLLYWOOD_FENCE_TIPS,
  HOLLYWOOD_FENCE_YAW, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FOOT, HOLLYWOOD_LANE_WIDTH,
  HOLLYWOOD_LEFT_Z, HOLLYWOOD_RAIL_END, HOLLYWOOD_RAIL_HEIGHT, HOLLYWOOD_RAIL_RADIUS,
  HOLLYWOOD_RAIL_START, HOLLYWOOD_ROAD_Y, HOLLYWOOD_SIDE_RAIL_Z,
  hollywoodNosing, hollywoodSurface,
} from './hollywoodLayout';

const F = HOLLYWOOD_FOOT;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];

const fence = (base: string, stance: Stance = 'regular', riderStance: RiderStance = 'regular', options: { popHeight?: number; landed?: boolean; skater?: 'robot' | 'realistic' } = {}) =>
  planStage({ id: base, name: base, base, stance }, {
    set: 'hollywood-high', obstacle: 'fence', landed: options.landed ?? true, riderStance, skater: options.skater,
    style: resolveSkateStyle({ popHeight: options.popHeight ?? 0.5, rotationSpeed: 1.16, flickStrength: 0.88 }),
    fall: 'slam', shankProgress: 0.65,
  });

/** A rig point in the set's own coordinates: down the stairs, height over the top landing, across. */
const inSet = (frame: StageFrame, p: V3) => ({ x: frame.scroll + p.x - X0, y: ASPHALT - p.y, z: frame.stairs!.across + p.z });
/** The top of the side rail's pipe over the top landing, `x` down the stairs. */
const railTop = (x: number) => hollywoodNosing(x) + HOLLYWOOD_RAIL_HEIGHT + HOLLYWOOD_RAIL_RADIUS;

describe('Hollywood 16: over the fence', () => {
  it('keeps the stairs as the way down unless the fence is picked', () => {
    const info = setInfo('hollywood-high');
    expect(info.obstacles?.map((o) => o.id)).toEqual(['stairs', 'fence']);
    expect(setTerrain('hollywood-high')).toBe(info.terrain);
    expect(setTerrain('hollywood-high', 'fence')).toBe(HOLLYWOOD_FENCE_TERRAIN);
    // Spots without a fence keep their only drop.
    expect(setTerrain('el-toro', 'fence')).toBe(EL_TORO_TERRAIN);
    const style = resolveSkateStyle();
    const options = { set: 'hollywood-high' as const, landed: true, riderStance: 'regular' as const, style, fall: 'slam' as const, shankProgress: 0.65 };
    const kickflip = { id: 'k', name: 'Kickflip', base: 'Kickflip', stance: 'regular' as const };
    const stairs = planStage(kickflip, options);
    expect(stairs.obstacle).toBe('stairs');
    expect(stairs.stairs!.terrain).toBe(info.terrain);
    expect(planStage(kickflip, { ...options, obstacle: 'fence' }).stairs!.terrain).toBe(HOLLYWOOD_FENCE_TERRAIN);
    // Grinds ride the handrail whatever the obstacle; elsewhere there's no choice to report.
    expect(planStage({ id: 'g', name: 'g', base: 'Frontside 50-50 Grind', stance: 'regular' }, { ...options, obstacle: 'fence' }).obstacle).toBeNull();
    expect(planStage(kickflip, { ...options, set: 'el-toro', obstacle: 'fence' }).obstacle).toBeNull();
    expect(stageFrame(planStage(kickflip, { ...options, obstacle: 'fence' }), 1, 1).stairs!.obstacle).toBe('fence');
  });

  it('comes in at an angle no more than 45° off the stairs and holds it to touchdown, whatever the trick spins', () => {
    expect(Math.abs(HOLLYWOOD_FENCE_YAW)).toBeGreaterThanOrEqual(20);
    expect(Math.abs(HOLLYWOOD_FENCE_YAW)).toBeLessThanOrEqual(45);
    // Toward the street (−z) while going down the stairs (+x).
    expect(HOLLYWOOD_FENCE_YAW).toBeLessThan(0);
    for (const base of ['Ollie', 'Kickflip', 'Backside 360 Kickflip', 'Frontside 180']) for (const stance of STANCES) for (const rider of RIDERS) {
      const stage = fence(base, stance, rider);
      const { pop, land } = stage.stairs!;
      const straight = { ...stage, stairs: { ...stage.stairs!, terrain: { ...stage.stairs!.terrain, entry: { ...stage.stairs!.terrain.entry!, yaw: 0 } } } };
      for (const t of [0.05, pop - 0.2, pop, (pop + land) / 2, land]) {
        const a = stageFrame(stage, t - 0.02, 1);
        const b = stageFrame(stage, t, 1);
        // The route runs along the heading…
        const heading = Math.atan2(b.stairs!.across - a.stairs!.across, b.scroll - a.scroll) * 180 / Math.PI;
        expect(heading, `${base}/${stance}/${rider} route at ${t.toFixed(2)}`).toBeCloseTo(HOLLYWOOD_FENCE_YAW, 3);
        // …and the rider is turned onto it, the trick's own rotation on top.
        expect(b.rig.board.yawDeg - stageFrame(straight, t, 1).rig.board.yawDeg).toBeCloseTo(-HOLLYWOOD_FENCE_YAW, 6);
      }
    }
  });

  it('rolls in on the run-up, clear of the school wall, and passes the center rail with room to spare', () => {
    // The center rail's first post, and its pipe on down the stairs.
    const top = hollywoodNosing(HOLLYWOOD_RAIL_START) + HOLLYWOOD_RAIL_HEIGHT;
    const post: [V3, V3] = [{ x: HOLLYWOOD_RAIL_START, y: 0, z: 0 }, { x: HOLLYWOOD_RAIL_START, y: top, z: 0 }];
    const pipe: [V3, V3] = [post[1], { x: HOLLYWOOD_RAIL_END, y: hollywoodNosing(HOLLYWOOD_RAIL_END) + HOLLYWOOD_RAIL_HEIGHT, z: 0 }];
    const away = (p: V3, [a, b]: [V3, V3]) => {
      const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / (ab.x ** 2 + ab.y ** 2 + ab.z ** 2)));
      return Math.hypot(p.x - a.x - k * ab.x, p.y - a.y - k * ab.y, p.z - a.z - k * ab.z) - HOLLYWOOD_RAIL_RADIUS;
    };
    for (const base of ['Kickflip', 'Bigspin Heelflip', 'Frontside 180', 'Impossible']) for (const stance of STANCES) for (const rider of RIDERS) {
      const stage = fence(base, stance, rider, { skater: 'realistic' });
      for (let t = 0; t <= stage.stairs!.pop + 0.5; t += 1 / 30) {
        const frame = stageFrame(stage, t, 1);
        if (t <= stage.stairs!.pop) {
          const { x, z } = { x: frame.scroll, z: frame.stairs!.across };
          expect(x).toBeLessThan(0);
          expect(z).toBeLessThan(HOLLYWOOD_BUILDING_FACE - 2 * F);
          expect(z).toBeGreaterThan(HOLLYWOOD_LEFT_Z + 2 * F);
          expect(hollywoodSurface(x, z)).toBe(0);
        }
        const { rig } = frame;
        for (const p of [rig.board.center, ...rig.arms.flatMap((a) => [a.shoulder, a.elbow, a.hand]), ...rig.legs.flatMap((l) => [l.hip, l.knee, l.ankle])]) {
          const q = inSet(frame, p);
          // The closest is the leading hand rolling fakie, the shoulders turned down the run, ~0.85 ft off.
          expect(Math.min(away(q, post), away(q, pipe)) / F, `${base}/${stance}/${rider} at ${t.toFixed(2)}`).toBeGreaterThan(0.75);
        }
      }
    }
  });

  it('clears the side rail and the fence with the board and the legs, every trick, both ways round', () => {
    const failures: string[] = [];
    let board = Infinity;
    let legs = Infinity;
    for (const base of TRICK_BASES) for (const stance of STANCES) for (const rider of RIDERS) {
      const stage = fence(base, stance, rider, { skater: 'realistic' });
      const { pop, land } = stage.stairs!;
      for (let t = pop + 1 / 60; t < land; t += 1 / 45) {
        const frame = stageFrame(stage, t, 1);
        const check = (p: V3, below: number, near: number, isLeg: boolean) => {
          const q = inSet(frame, p);
          const overRail = Math.abs(q.z - HOLLYWOOD_SIDE_RAIL_Z) < HOLLYWOOD_RAIL_RADIUS + near && q.x > HOLLYWOOD_RAIL_START ? q.y - below - railTop(q.x) : Infinity;
          const overFence = Math.abs(q.z - HOLLYWOOD_FENCE_Z) < near + 1 ? q.y - below - HOLLYWOOD_FENCE_TIPS : Infinity;
          const clearance = Math.min(overRail, overFence);
          if (isLeg) legs = Math.min(legs, clearance);
          else board = Math.min(board, clearance);
          if (clearance < (isLeg ? F : 0.4 * F)) failures.push(`${base}/${stance}/${rider} t=${t.toFixed(2)} ${isLeg ? 'leg' : 'board'} ${(clearance / F).toFixed(2)} ft`);
        };
        for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) check(frame.rig.board.point({ x, y: WHEEL_Y, z }), WHEEL_R, 1.5, false);
        for (const x of [-42, 0, 42]) for (const z of [-10, 10]) check(frame.rig.board.point({ x, y: 0, z }), 0, 1.5, false);
        for (const leg of frame.rig.legs) for (const p of [leg.knee, leg.ankle]) check(p, 0, 5, true);
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
    // The worst of them still has room to spare (~0.75 ft over the rail, a foot over the fence).
    expect(board / F).toBeGreaterThan(0.5);
    expect(legs / F).toBeGreaterThan(1.5);
  }, 120_000);

  it('pops the same over the fence whatever the rider pops on flatground', () => {
    const low = fence('Kickflip', 'regular', 'regular', { popHeight: 0.45 }).stairs!;
    const high = fence('Kickflip', 'regular', 'regular', { popHeight: 1.15 }).stairs!;
    expect(low.rise).toBeCloseTo(high.rise, 6);
    expect(low.speed).toBeCloseTo(high.speed, 6);
    // About nineteen feet a second over a twenty-four foot flight.
    expect(low.speed / F).toBeGreaterThan(15);
    expect(low.speed / F).toBeLessThan(21);
    // The stairs still go by each rider's own pop.
    const stairs = (popHeight: number) => planStage({ id: 'k', name: 'k', base: 'Kickflip', stance: 'regular' }, {
      set: 'hollywood-high', landed: true, riderStance: 'regular', style: resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 }), fall: 'slam', shankProgress: 0.65,
    }).stairs!;
    expect(stairs(0.45).rise).toBeLessThan(stairs(1.15).rise);
  });

  it('lands on the sidewalk well past the fence and carves away along it, short of the road and the trees', () => {
    for (const base of ['Ollie', 'Kickflip', 'Impossible', 'Backside 360']) for (const stance of STANCES) for (const rider of RIDERS) for (const landed of [true, false]) {
      const stage = fence(base, stance, rider, { landed });
      const context = `${base}/${stance}/${rider}/${landed ? 'landed' : 'fall'}`;
      const touchdown = stageFrame(stage, stage.stairs!.land, 1);
      expect(touchdown.stairs!.across, context).toBeLessThan(HOLLYWOOD_FENCE_Z - 5 * F);
      expect(hollywoodSurface(touchdown.scroll, touchdown.stairs!.across)).toBe(-HOLLYWOOD_DROP);
      expect(touchdown.stairs!.shadowY).toBeCloseTo(-HOLLYWOOD_DROP, 0);
      for (let t = stage.stairs!.land; t <= stage.end; t += 1 / 30) {
        const frame = stageFrame(stage, t, 1);
        const z = frame.stairs!.across;
        expect(z, `${context} at ${t.toFixed(2)}`).toBeLessThan(HOLLYWOOD_CHEEK_Z - 3 * F);
        expect(z, `${context} at ${t.toFixed(2)}`).toBeGreaterThan(HOLLYWOOD_CURB_Z + 2.5 * F);
        for (const { at } of HOLLYWOOD_TREES) expect(Math.hypot(frame.scroll - at[0], z - at[2]), context).toBeGreaterThan(4 * F);
      }
      const end = stageFrame(stage, stage.end, 1);
      const straight = { ...stage, stairs: { ...stage.stairs!, terrain: { ...stage.stairs!.terrain, entry: { ...stage.stairs!.terrain.entry!, yaw: 0 } } } };
      const turned = end.rig.board.yawDeg - stageFrame(straight, stage.end, 1).rig.board.yawDeg;
      // A ride away comes round to downhill, along the sidewalk; a fall slides on along the line.
      expect(turned, context).toBeCloseTo(landed ? 0 : -HOLLYWOOD_FENCE_YAW, 3);
    }
    expect(landingYaw(HOLLYWOOD_FENCE_TERRAIN)).toBe(HOLLYWOOD_FENCE_YAW);
  });

  it('has no jumps in the route, the heading or the rider at the pop, touchdown or through the carve', () => {
    for (const rider of RIDERS) for (const landed of [true, false]) {
      const stage = fence('Kickflip', 'regular', rider, { landed });
      let previous = stageFrame(stage, 0, 1);
      for (let t = 1 / 120; t <= stage.end; t += 1 / 120) {
        const frame = stageFrame(stage, t, 1);
        const step = Math.hypot(frame.scroll - previous.scroll, frame.stairs!.across - previous.stairs!.across);
        expect(step, `route step at ${t.toFixed(3)}`).toBeLessThan(stage.stairs!.speed / 120 + 0.05);
        // A slam throws the board, as it does on flatground; ridden away it rolls on with the route.
        if (landed) {
          const a = inSet(previous, previous.rig.board.center);
          const b = inSet(frame, frame.rig.board.center);
          expect(Math.hypot(b.x - a.x, b.z - a.z), `board at ${t.toFixed(3)}`).toBeLessThan(6);
          let turn = frame.rig.board.yawDeg - previous.rig.board.yawDeg;
          turn -= 360 * Math.round(turn / 360);
          expect(Math.abs(turn), `board turn at ${t.toFixed(3)}`).toBeLessThan(12);
        }
        previous = frame;
      }
    }
  });

  it('keeps the explorer timeline in step with the stage', () => {
    const stage = fence('Kickflip');
    const timeline = setTimeline('hollywood-high', stage.style, true, 'fence')!;
    expect(timeline.pop).toBe(stage.stairs!.pop);
    expect(timeline.land).toBe(stage.stairs!.land);
    expect(timeline.end).toBe(stage.end);
    expect(setTimeline('hollywood-high', stage.style)!.land).not.toBe(timeline.land);
  });

  it('films it in frame from the crane, and the crane stays up top rather than sinking behind the fence', () => {
    const spot = new Hollywood3D();
    try {
      for (const rider of RIDERS) {
        const stage = fence('Kickflip', 'regular', rider);
        let pitch = DEFAULT_SCENE_CAMERA.pitch;
        for (let t = 0; t <= stage.end; t += 1 / 30) {
          const frame = stageFrame(stage, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, null)!;
          for (const point of [frame.rig.head.at(0, 15, 0), frame.rig.board.center]) {
            const p = view.cam.project(point);
            expect(p.x, `x at ${t.toFixed(2)}`).toBeGreaterThan(view.box.x);
            expect(p.x).toBeLessThan(view.box.x + view.box.width);
            expect(p.y, `y at ${t.toFixed(2)}`).toBeGreaterThan(view.box.y);
            expect(p.y, `y at ${t.toFixed(2)}`).toBeLessThan(view.box.y + view.box.height);
          }
          // The eye never drops under the fence's spear tips, and tilts smoothly.
          expect(view.eye[1], `eye at ${t.toFixed(2)}`).toBeGreaterThan(HOLLYWOOD_FENCE_TIPS + 2 * F);
          const now = Math.asin(view.back[1]) * 180 / Math.PI;
          expect(Math.abs(now - pitch), `tilt at ${t.toFixed(2)}`).toBeLessThan(4);
          pitch = now;
        }
        // Down the stairs the crane follows the rider down as before.
        const stairs = planStage({ id: 'k', name: 'k', base: 'Kickflip', stance: 'regular' }, {
          set: 'hollywood-high', landed: true, riderStance: rider, style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65,
        });
        const bottom = spot.view(stageFrame(stairs, stairs.end, 1), DEFAULT_SCENE_CAMERA, 1, 1.24, null)!;
        expect(Math.asin(bottom.back[1]) * 180 / Math.PI).toBeCloseTo(DEFAULT_SCENE_CAMERA.pitch, 3);
      }
    } finally { spot.dispose(); }
  });

  it('has its own tripods, each keeping the rider in its picture', () => {
    const spot = new Hollywood3D();
    try {
      const stage = fence('Kickflip');
      for (const tripod of ['bottom', 'side', 'top'] as TripodId[]) {
        for (let t = 0.3; t <= stage.end; t += 1 / 15) {
          const frame = stageFrame(stage, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
          // Standing on the ground somewhere the rider never goes.
          const eye = { x: view.eye[0] + frame.scroll, z: view.eye[2] + frame.stairs!.across };
          expect(Math.hypot(eye.x - frame.scroll, eye.z - frame.stairs!.across), `${tripod} at ${t.toFixed(2)}`).toBeGreaterThan(5 * F);
          const p = view.cam.project(frame.rig.board.center);
          expect(p.x, `${tripod} x at ${t.toFixed(2)}`).toBeGreaterThan(view.box.x);
          expect(p.x).toBeLessThan(view.box.x + view.box.width);
          expect(p.y, `${tripod} y at ${t.toFixed(2)}`).toBeGreaterThan(view.box.y);
          expect(p.y).toBeLessThan(view.box.y + view.box.height);
        }
      }
    } finally { spot.dispose(); }
  });
});

describe('Hollywood 16: the avenue', () => {
  it('drives its cars down their lanes, near side one way and far side the other, never catching each other', () => {
    const lanes = new Map<number, number[]>();
    for (const car of HOLLYWOOD_TRAFFIC) {
      const [, y, z] = car.at;
      expect(y).toBe(HOLLYWOOD_ROAD_Y);
      expect(z).toBeLessThan(HOLLYWOOD_CURB_Z - 4 * F);
      expect(z).toBeGreaterThan(HOLLYWOOD_FAR_CURB_Z + 4 * F);
      const lane = Math.floor((HOLLYWOOD_CURB_Z - z) / HOLLYWOOD_LANE_WIDTH);
      // Keeping right: the near lanes run down the stairs' way (+x), the far ones back.
      expect(car.yaw).toBe(lane < 2 ? 0 : 180);
      // City speed, 20–40 mph.
      expect(car.speed / ((5280 * F) / 3600)).toBeGreaterThan(20);
      expect(car.speed / ((5280 * F) / 3600)).toBeLessThan(40);
      lanes.set(lane, [...(lanes.get(lane) ?? []), car.speed]);
    }
    for (const speeds of lanes.values()) expect(new Set(speeds).size).toBe(1);
    expect(hollywoodSurface(0, HOLLYWOOD_CURB_Z - 10 * F)).toBe(HOLLYWOOD_ROAD_Y);
  });
});
