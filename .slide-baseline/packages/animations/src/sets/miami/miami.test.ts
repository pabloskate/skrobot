import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { resolveSkateStyle } from '../../motion/style';
import { TRICK_BASES, X0 } from '../../motion/trick';
import { LEAN_PAST_TOUCHDOWN } from '../../stage/bank';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { routeHeight } from '../elToro/stairs';
import { setInfo, setTerrain, setTimeline, type Obstacle } from '../sets';
import { buildMiamiGeometry, Miami3D } from './miami3d';
import { miamiTowerNode, MIAMI_TOWER_HEIGHT, MIAMI_TOWER_NODES } from './miamiGeometry';
import {
  MIAMI_BANK_LAND_X, MIAMI_BANK_TERRAIN, MIAMI_DROP, MIAMI_FOOT as F, MIAMI_GAP_LAND_X, MIAMI_GAP_TERRAIN,
  MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y, MIAMI_POP_X, MIAMI_RIM_HEIGHT, MIAMI_RIM_WIDTH, MIAMI_SLAB_APEX_X, MIAMI_SLAB_APEX_Y,
  MIAMI_SLAB_GRADE, MIAMI_SLAB_LIP_X, MIAMI_SLAB_LIP_Y, MIAMI_SLAB_SIDE, MIAMI_SLAB_THICK, MIAMI_TERRACE_BACK, MIAMI_TOWER_X,
  MIAMI_WALL_THICK, MIAMI_WALL_TOP, MIAMI_WALL_X,
  miamiGround, miamiSlabHalf, miamiSlabTop, miamiSlope, miamiSurface, miamiTerraceHalf, miamiTerraceInset, onMiamiSlab,
} from './miamiLayout';

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const attempt = (base: string, obstacle: Obstacle = 'stairs', stance: Stance = 'regular', riderStance: RiderStance = 'regular', options: { popHeight?: number; landed?: boolean; skater?: 'robot' | 'realistic' } = {}) => planStage(
  { id: base, name: base, base, stance },
  {
    set: 'miami-triangle', obstacle, landed: options.landed ?? true, riderStance, skater: options.skater,
    style: resolveSkateStyle({ popHeight: options.popHeight ?? 0.45, rotationSpeed: 1.16, flickStrength: 0.88 }),
    fall: 'slam', shankProgress: 0.65,
  },
);
/** A rig point in the set's own coordinates: down the line, height over the deck, across. */
const inSet = (frame: StageFrame, p: V3) => ({ x: frame.scroll + p.x - X0, y: ASPHALT - p.y, z: frame.stairs!.across + p.z });
/** Each wheel's height over the slab (or whatever is under it), uphill first. */
const trucks = (frame: StageFrame) => [-WHEEL_X, WHEEL_X]
  .map((x) => inSet(frame, frame.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z })))
  .sort((a, b) => a.x - b.x)
  .map((p) => p.y - miamiSurface(p.x, p.z));

describe('Miami Triangle: the Challenger Memorial', () => {
  it('measures the gap off the Berrics overlay and the plan off the aerials', () => {
    // The box 5 ft over the plaza, the slab's apex level with it, 5½ ft out from the tip.
    expect(MIAMI_DROP / F).toBe(5);
    expect(MIAMI_PLAZA_Y).toBe(-MIAMI_DROP);
    expect((MIAMI_SLAB_APEX_Y - MIAMI_PLAZA_Y) / F).toBeCloseTo(5, 9);
    expect(MIAMI_SLAB_APEX_X / F).toBeCloseTo(5.5, 9);
    // Its low edge: a foot-thick plate standing ¾ ft clear of the paving.
    expect((MIAMI_SLAB_LIP_Y - MIAMI_PLAZA_Y) / F).toBeCloseTo(1.75, 9);
    expect((MIAMI_SLAB_LIP_Y - MIAMI_SLAB_THICK - MIAMI_PLAZA_Y) / F).toBeCloseTo(0.75, 9);
    // A 1½ ft planter wall, its face 2 ft out from the tip, under the gap.
    expect(MIAMI_WALL_X / F).toBe(2);
    expect((MIAMI_WALL_TOP - MIAMI_PLAZA_Y) / F).toBeCloseTo(1.5, 9);
    expect(MIAMI_WALL_X).toBeLessThan(MIAMI_SLAB_APEX_X);
    // About 24°: steep, as the clips show.
    expect(Math.atan(MIAMI_SLAB_GRADE) * 180 / Math.PI).toBeGreaterThan(22);
    expect(Math.atan(MIAMI_SLAB_GRADE) * 180 / Math.PI).toBeLessThan(28);
    // The terrace is an 88 ft equilateral triangle; the tower stands at its middle, about 51 ft behind the tip.
    expect(miamiTerraceHalf(MIAMI_TERRACE_BACK) * 2 / F).toBeCloseTo(88, 6);
    expect(-MIAMI_TOWER_X / F).toBeCloseTo(50.8, 1);
  });

  it('raises a curved rim round the deck, which along the line starts a foot and a half behind the tip', () => {
    expect(MIAMI_RIM_HEIGHT / F).toBeCloseTo(0.25, 9);
    // Up on the rim at the tip and all round the edges; flat deck inside it.
    expect(miamiGround(-1)).toBeCloseTo(MIAMI_RIM_HEIGHT, 9);
    expect(miamiSurface(-20 * F, miamiTerraceHalf(-20 * F) - 1)).toBeCloseTo(MIAMI_RIM_HEIGHT, 9);
    expect(miamiSurface(MIAMI_TERRACE_BACK + 1, 0)).toBeCloseTo(MIAMI_RIM_HEIGHT, 9);
    expect(miamiGround(-2 * MIAMI_RIM_WIDTH - 0.01)).toBe(0);
    expect(miamiSurface(-20 * F, 0)).toBe(0);
    // It curves up out of the deck: no step anywhere across it.
    let previous = miamiGround(-2 * MIAMI_RIM_WIDTH - 2);
    for (let x = -2 * MIAMI_RIM_WIDTH - 2; x < 0; x += 0.25) {
      const y = miamiGround(x);
      expect(y).toBeGreaterThanOrEqual(previous);
      expect(y - previous).toBeLessThan(0.25 * 0.6);
      previous = y;
    }
    // The pop is back on the flat, where the rim's arms are wider apart than
    // the board, both ends of it: a nollie or fakie pops off the leading one.
    for (const end of [-1, 1]) for (const z of [-10, 10]) {
      expect(miamiTerraceInset(MIAMI_POP_X + end * 46, z)).toBeGreaterThan(MIAMI_RIM_WIDTH);
    }
    for (const terrain of [MIAMI_BANK_TERRAIN, MIAMI_GAP_TERRAIN]) expect(terrain.entry).toEqual({ x: MIAMI_POP_X, z: 0, yaw: 0 });
  });

  it('lays the slab out as an equilateral triangle, its apex pointing back at the tip', () => {
    const corners = [[MIAMI_SLAB_APEX_X, 0], [MIAMI_SLAB_LIP_X, -MIAMI_SLAB_SIDE / 2], [MIAMI_SLAB_LIP_X, MIAMI_SLAB_SIDE / 2]];
    for (let i = 0; i < 3; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 3];
      expect(Math.hypot(bx - ax, bz - az) / F).toBeCloseTo(8.5, 9);
    }
    expect(miamiSlabHalf(MIAMI_SLAB_LIP_X)).toBeCloseTo(MIAMI_SLAB_SIDE / 2, 9);
    expect(onMiamiSlab(MIAMI_SLAB_APEX_X + 1, 0)).toBe(true);
    expect(onMiamiSlab(MIAMI_SLAB_APEX_X - 1, 0)).toBe(false);
    expect(onMiamiSlab(MIAMI_SLAB_LIP_X - 1, MIAMI_SLAB_SIDE / 2 - 2)).toBe(true);
    expect(onMiamiSlab(MIAMI_SLAB_APEX_X + 2 * F, 1.5 * F)).toBe(false);
    expect(miamiSlabTop(MIAMI_SLAB_APEX_X)).toBeCloseTo(MIAMI_SLAB_APEX_Y, 9);
    expect(miamiSlabTop(MIAMI_SLAB_LIP_X)).toBeCloseTo(MIAMI_SLAB_LIP_Y, 9);
    // The ground the rider follows down the line, and its gradient.
    for (let x = MIAMI_SLAB_APEX_X + 0.5; x < MIAMI_SLAB_LIP_X; x += 0.5) {
      expect(miamiSlope(x)).toBeCloseTo((miamiGround(x + 1e-4) - miamiGround(x - 1e-4)) / 2e-4, 5);
    }
    expect(miamiSlope(MIAMI_SLAB_LIP_X + 3)).toBe(0);
    expect(miamiGround(-3 * F)).toBe(0);
    expect(miamiGround((MIAMI_WALL_X + MIAMI_SLAB_APEX_X) / 2)).toBe(MIAMI_PLAZA_Y);
    expect(miamiGround(MIAMI_SLAB_LIP_X + 1)).toBe(MIAMI_PLAZA_Y);
    // The bank touches down where the face is over 3½ ft wide; over the triangle lands on the plaza.
    expect(onMiamiSlab(MIAMI_BANK_LAND_X, 0)).toBe(true);
    expect(miamiSlabHalf(MIAMI_BANK_LAND_X) * 2 / F).toBeGreaterThan(3.5);
    expect(MIAMI_GAP_LAND_X).toBeGreaterThan(MIAMI_SLAB_LIP_X + 3 * F);
    expect(miamiSurface(MIAMI_GAP_LAND_X, 0)).toBe(MIAMI_PLAZA_Y);
  });

  it('offers the gap onto the slab first, and over the whole triangle', () => {
    const info = setInfo('miami-triangle');
    expect(info.obstacles?.map((o) => o.id)).toEqual(['stairs', 'triangle']);
    expect(info.terrain).toBe(MIAMI_BANK_TERRAIN);
    expect(setTerrain('miami-triangle')).toBe(MIAMI_BANK_TERRAIN);
    expect(setTerrain('miami-triangle', 'triangle')).toBe(MIAMI_GAP_TERRAIN);
    expect(setTerrain('miami-triangle', 'fence')).toBe(MIAMI_BANK_TERRAIN);
    expect(attempt('Kickflip').obstacle).toBe('stairs');
    expect(attempt('Kickflip', 'triangle').stairs!.terrain).toBe(MIAMI_GAP_TERRAIN);
    const stage = attempt('Kickflip', 'triangle');
    const timeline = setTimeline('miami-triangle', stage.style, true, 'triangle')!;
    expect(timeline.land).toBe(stage.stairs!.land);
    expect(timeline.end).toBe(stage.end);
    expect(setTimeline('miami-triangle', stage.style)!.land).not.toBe(timeline.land);
  });

  it('runs up along the deck and pops on the flat, all four wheels short of the rim', () => {
    for (const obstacle of ['stairs', 'triangle'] as Obstacle[]) for (const rider of RIDERS) for (const stance of STANCES) {
      const stage = attempt('Kickflip', obstacle, stance, rider);
      const pop = stageFrame(stage, stage.stairs!.pop, 1);
      expect(pop.scroll).toBeCloseTo(MIAMI_POP_X, 6);
      for (let t = 0; t <= stage.stairs!.pop; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        const context = `${obstacle}/${rider}/${stance} at ${t.toFixed(2)}`;
        expect(frame.stairs!.across).toBe(0);
        expect(miamiSurface(frame.scroll, 0), context).toBe(0);
        // Rolling, up to the crouch: every wheel on the flat deck.
        if (t > stage.stairs!.pop - 0.3) continue;
        for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
          const p = inSet(frame, frame.rig.board.point({ x, y: WHEEL_Y, z }));
          expect(miamiSurface(p.x, p.z), context).toBe(0);
        }
      }
    }
  });

  it('lands on the slab uphill truck first, rides its face down and rolls off its low edge onto the plaza', () => {
    for (const skater of ['robot', 'realistic'] as const) for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) for (const rider of RIDERS) {
      const context = `${skater}/${stance}/${rider}`;
      const stage = attempt('Kickflip', 'stairs', stance, rider, { skater, popHeight: 0.8 });
      const plan = stage.stairs!;
      const touchdown = stageFrame(stage, plan.land, 1);
      expect(touchdown.scroll).toBeCloseTo(MIAMI_BANK_LAND_X);
      const [uphill, downhill] = trucks(touchdown);
      expect(uphill, context).toBeLessThan(1);
      expect(downhill, context).toBeGreaterThan(2);
      // Leaned onto the face, both trucks on it, down to the low edge.
      for (let t = plan.land + LEAN_PAST_TOUCHDOWN; ; t += 1 / 120) {
        const frame = stageFrame(stage, t, 1);
        if (frame.scroll + WHEEL_X > MIAMI_SLAB_LIP_X) break;
        const axis = frame.rig.board.dir({ x: 1, y: 0, z: 0 });
        expect(Math.abs(axis.y / axis.x), `${context} pitch at ${t.toFixed(3)}`).toBeCloseTo(MIAMI_SLAB_GRADE, 2);
        for (const height of trucks(frame)) expect(height, `${context} at ${t.toFixed(3)}`).toBeLessThan(0.5);
      }
      // Off the edge once: a short drop through the air, then the pavers.
      expect(plan.ledges, context).toHaveLength(1);
      const ledge = plan.ledges[0];
      expect(stageFrame(stage, ledge.t, 1).scroll).toBeGreaterThan(MIAMI_SLAB_LIP_X);
      expect(ledge.t - plan.land).toBeGreaterThan(0.2);
      expect(ledge.impact).toBeGreaterThan(0);
      let airborne = 0;
      for (let x = MIAMI_SLAB_LIP_X; x < MIAMI_SLAB_LIP_X + 4 * F; x += 1) if (routeHeight(plan, x) > MIAMI_PLAZA_Y + 1) airborne++;
      expect(airborne).toBeGreaterThan(5);
      const end = stageFrame(stage, stage.end, 1);
      expect(end.scroll).toBeGreaterThan(MIAMI_SLAB_LIP_X + 4 * F);
      expect(end.rig.board.dir({ x: 1, y: 0, z: 0 }).y).toBeCloseTo(0, 3);
      for (const height of trucks(end)) expect(height, context).toBeLessThan(0.5);
    }
  });

  it('clears the rim, the wall and the slab’s apex with every trick, both ways round, on both lines', () => {
    for (const obstacle of ['stairs', 'triangle'] as Obstacle[]) {
      const failures: string[] = [];
      let board = Infinity;
      let legs = Infinity;
      let rimBoard = Infinity;
      let crossings = 0;
      for (const base of TRICK_BASES) for (const stance of STANCES) for (const rider of RIDERS) {
        const stage = attempt(base, obstacle, stance, rider, { skater: 'realistic' });
        const { pop, land } = stage.stairs!;
        for (let t = pop + 1 / 60; t < land; t += 1 / 60) {
          const frame = stageFrame(stage, t, 1);
          // Onto the slab, the last moments are the touchdown itself, the
          // uphill truck reaching the face: the apex is passed well before.
          if (obstacle === 'stairs' && t > land - 0.15) break;
          const check = (p: V3, below: number, isLeg: boolean) => {
            const q = inSet(frame, p);
            const where = `${obstacle} ${base}/${stance}/${rider} t=${t.toFixed(2)} ${isLeg ? 'leg' : 'board'}`;
            // Just after the pop the board rises over the 3 in rim at the
            // tip, as an ollie over a curb does: it only has to miss it.
            const onRim = q.x <= 0 && Math.abs(q.z) <= miamiTerraceHalf(q.x) && miamiSurface(q.x, q.z) > 0;
            if (onRim) {
              const clearance = q.y - below - miamiSurface(q.x, q.z);
              if (!isLeg) rimBoard = Math.min(rimBoard, clearance);
              if (clearance < 0.1 * F) failures.push(`${where} ${(clearance / F).toFixed(2)} ft over the rim at x=${(q.x / F).toFixed(2)}`);
              return;
            }
            const wall = q.x >= MIAMI_WALL_X - MIAMI_WALL_THICK && q.x <= MIAMI_WALL_X ? MIAMI_WALL_TOP : -Infinity;
            const top = Math.max(wall, onMiamiSlab(q.x, q.z) ? miamiSlabTop(q.x) : -Infinity);
            if (top === -Infinity) return;
            const clearance = q.y - below - top;
            crossings++;
            if (isLeg) legs = Math.min(legs, clearance);
            else board = Math.min(board, clearance);
            if (clearance < (isLeg ? F : 0.5 * F)) failures.push(`${where} ${(clearance / F).toFixed(2)} ft at x=${(q.x / F).toFixed(2)}`);
          };
          for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) check(frame.rig.board.point({ x, y: WHEEL_Y, z }), WHEEL_R, false);
          for (const x of [-42, 0, 42]) for (const z of [-10, 10]) check(frame.rig.board.point({ x, y: 0, z }), 0, false);
          for (const leg of frame.rig.legs) for (const p of [leg.knee, leg.ankle]) check(p, 0, true);
        }
      }
      expect(crossings).toBeGreaterThan(1000);
      expect(failures.slice(0, 12)).toEqual([]);
      expect(board / F).toBeGreaterThan(0.5);
      expect(legs / F).toBeGreaterThan(1);
      expect(rimBoard / F).toBeGreaterThan(0.1);
    }
  }, 180_000);

  it('lands over the triangle on the plaza and rolls away straight down the line', () => {
    for (const base of ['Ollie', 'Kickflip', 'Backside 360', 'Impossible']) for (const stance of STANCES) for (const rider of RIDERS) {
      const stage = attempt(base, 'triangle', stance, rider);
      const context = `${base}/${stance}/${rider}`;
      expect(stage.stairs!.ledges).toHaveLength(0);
      const touchdown = stageFrame(stage, stage.stairs!.land, 1);
      expect(touchdown.scroll, context).toBeCloseTo(MIAMI_GAP_LAND_X);
      expect(touchdown.stairs!.shadowY).toBeCloseTo(MIAMI_PLAZA_Y, 0);
      for (let t = stage.stairs!.land; t <= stage.end; t += 1 / 30) {
        const frame = stageFrame(stage, t, 1);
        expect(frame.stairs!.across).toBe(0);
        // The rollout stays on the paving, short of the plaza's far corner.
        expect(frame.scroll, context).toBeLessThan(MIAMI_WALL_X + MIAMI_PLAZA_HALF - 4 * F);
      }
    }
  });

  it('films both lines in frame from the crane and every tripod, each eye above the ground and clear of the rider', () => {
    const spot = new Miami3D();
    try {
      for (const obstacle of ['stairs', 'triangle'] as Obstacle[]) for (const rider of RIDERS) {
        const stage = attempt('Kickflip', obstacle, 'regular', rider);
        const times = [...Array.from({ length: Math.ceil(stage.end * 20) + 1 }, (_, i) => Math.min(stage.end, i / 20)), stage.stairs!.pop, stage.stairs!.land];
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) for (const t of times) {
          const frame = stageFrame(stage, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
          const context = `${obstacle}/${rider}/${tripod ?? 'crane'} at ${t.toFixed(2)}`;
          expect(view.eye.every(Number.isFinite)).toBe(true);
          const eye = { x: view.eye[0] + frame.scroll, z: view.eye[2] + frame.stairs!.across };
          expect(view.eye[1], context).toBeGreaterThan(miamiSurface(eye.x, eye.z) + F);
          if (tripod) expect(Math.hypot(eye.x - frame.scroll, eye.z - frame.stairs!.across), context).toBeGreaterThan(5 * F);
          for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
            const p = view.cam.project(point);
            expect(p.x, context).toBeGreaterThan(view.box.x);
            expect(p.x, context).toBeLessThan(view.box.x + view.box.width);
            expect(p.y, context).toBeGreaterThan(view.box.y);
            expect(p.y, context).toBeLessThan(view.box.y + view.box.height);
          }
        }
      }
    } finally { spot.dispose(); }
  });

  it('keeps every tripod’s view of the rider clear of the scenery', () => {
    // The top filmer stands on the deck behind the apex, which hides the
    // board as it comes down past it: they film the run-up, the pop and the
    // rise. The others see the rider land and ride away; from down on the
    // plaza the deck's edge and rim hide the board on the run-up and the
    // pop, so until it's up in the air they only have the rider's head.
    const spot = new Miami3D();
    const built = buildMiamiGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const scenery = [new Mesh(built.ground, material), new Mesh(built.props, material)];
    try {
      for (const obstacle of ['stairs', 'triangle'] as Obstacle[]) for (const rider of RIDERS) {
        const stage = attempt('Kickflip', obstacle, 'regular', rider);
        for (const tripod of ['bottom', 'side', 'top'] as TripodId[]) {
          const { pop, land } = stage.stairs!;
          const until = tripod === 'top' ? (pop + land) / 2 : land + 0.4;
          for (let t = pop - 0.4; t <= until; t += 1 / 20) {
            const frame = stageFrame(stage, t, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
            const eye = new Vector3(view.eye[0] + frame.scroll, view.eye[1], view.eye[2] + frame.stairs!.across);
            const points = tripod === 'top' || t >= pop + 0.15 ? [frame.rig.head.at(0, -30, 0), frame.rig.board.center] : [frame.rig.head.at(0, -30, 0)];
            for (const point of points) {
              const p = inSet(frame, point);
              const direction = new Vector3(p.x, p.y, p.z).sub(eye);
              const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 6);
              expect(ray.intersectObjects(scenery), `${obstacle}/${rider}/${tripod} at ${t.toFixed(2)}`).toHaveLength(0);
            }
          }
        }
      }
    } finally { spot.dispose(); material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });
});

describe('Miami Triangle: the scenery', () => {
  it('builds one floor under every point (the plaza shows under the slab too), where the rider and the shadows meet it', () => {
    const built = buildMiamiGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    const floors = (x: number, z: number) => new Raycaster(new Vector3(x, 30 * F, z), new Vector3(0, -1, 0))
      .intersectObject(mesh).filter((hit) => hit.face!.normal.y > 0.5).map((hit) => hit.point.y);
    try {
      const samples: Array<[number, number, number]> = [
        // The deck, out to the tip and back toward the tower.
        [-0.31 * F, 0.07 * F, 0.5], [-1.2 * F, 0.04 * F, 0.5], [-6.3 * F, 2.1 * F, 0.5], [-24.7 * F, -9.3 * F, 0.5], [-70.1 * F, 33.3 * F, 0.5],
        // Across the rim's curve and its top, and at a back corner's mitre.
        [-30.2 * F, miamiTerraceHalf(-30.2 * F) - 0.55 * F, 0.5], [-30.2 * F, -miamiTerraceHalf(-30.2 * F) + 0.2 * F, 0.5], [MIAMI_TERRACE_BACK + 0.3 * F, 43.1 * F, 0.5],
        // The gap: the lawn strip in front of the tip, the wall's top, the plaza.
        [0.71 * F, 0.13 * F, 0.5], [MIAMI_WALL_X - 0.27 * F, 0.4 * F, 0.5], [MIAMI_WALL_X + 1.3 * F, 0.17 * F, 0.5],
        // The slab's face, apex to low edge.
        [MIAMI_SLAB_APEX_X + 0.6 * F, 0.1 * F, 0.5], [MIAMI_BANK_LAND_X + 0.13, 0.31 * F, 0.5], [MIAMI_SLAB_LIP_X - 0.2 * F, -3.7 * F, 0.5],
        // The plaza, along the line and off it, and the park round it.
        [MIAMI_SLAB_LIP_X + 0.4 * F, 0.2 * F, 0.5], [MIAMI_GAP_LAND_X + 11.3 * F, -1.7 * F, 0.5], [9.4 * F, 34.1 * F, 0.5],
        [30.2 * F, -1.2 * F, 0.5], [70.3 * F, 2.2 * F, 0.5], [-100.4 * F, 12.1 * F, 0.5], [-20.3 * F, -80.6 * F, 0.5],
        // The lawns, their mesh following the mounds between its corners.
        [-30.3 * F, 42.2 * F, 0.15 * F], [-12.2 * F, -20.4 * F, 0.15 * F], [-1.6 * F, 25.3 * F, 0.15 * F],
      ];
      for (const [x, z, tolerance] of samples) {
        const hits = floors(x, z);
        expect(hits, `floors at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`).toHaveLength(onMiamiSlab(x, z) ? 2 : 1);
        if (onMiamiSlab(x, z)) expect(hits[1]).toBeCloseTo(MIAMI_PLAZA_Y, 6);
        expect(Math.abs(hits[0] - miamiSurface(x, z)), `height at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`).toBeLessThan(tolerance);
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('builds the tower as Noguchi’s tetrahelix: 31 regular tetrahedra, about 100 ft tall', () => {
    expect(MIAMI_TOWER_NODES - 3).toBe(31);
    const edge = Math.hypot(...[0, 1, 2].map((k) => miamiTowerNode(1)[k] - miamiTowerNode(0)[k]));
    for (let i = 0; i < MIAMI_TOWER_NODES; i++) for (let step = 1; step <= 3; step++) {
      if (i + step >= MIAMI_TOWER_NODES) continue;
      const a = miamiTowerNode(i), b = miamiTowerNode(i + step);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / edge, `edge ${i}–${i + step}`).toBeCloseTo(1, 9);
    }
    expect(miamiTowerNode(MIAMI_TOWER_NODES - 1)[1]).toBeCloseTo(MIAMI_TOWER_HEIGHT, 6);
    expect(edge / F).toBeGreaterThan(9);
    expect(edge / F).toBeLessThan(10.5);
  });

  it('stays finite and inside the mobile budget', () => {
    const built = buildMiamiGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        vertices += geometry.getAttribute('position').count;
        expect(geometry.getAttribute('position').count % 3).toBe(0);
        for (const key of ['position', 'normal', 'aColor', 'aCorner']) expect(Array.from(geometry.getAttribute(key).array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('aCorner').array).every((value) => value === 0)).toBe(true);
      }
      expect(vertices).toBeLessThan(150_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });
});
