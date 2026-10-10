import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { HANGER_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { LEG_RADII, capsuleIntersectsBoard, shoeIntersectsBoard } from '../../board/boardCollision';
import { BOTTOM_LOCAL, TOP_LOCAL } from '../../board/deck';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { moveFrame } from '../../motion/skeleton';
import { GRIND_BASES } from '../../motion/grindDefinitions';
import { resolveSkateStyle } from '../../motion/style';
import { GROUND, X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame, type StagePlan } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { setInfo } from '../sets';
import { buildMiamiGeometry, Miami3D } from './miami3d';
import {
  MIAMI_EDGE_FALL, MIAMI_EDGE_YAW, MIAMI_FOOT as F, MIAMI_GRIND_LOCK, MIAMI_GRIND_SPEED, MIAMI_LEDGES, MIAMI_PLAZA_HALF, MIAMI_PLAZA_Y,
  MIAMI_RIM_WIDTH, MIAMI_SLAB_APEX_X, MIAMI_SLAB_LIP_X, MIAMI_SLAB_SIDE, MIAMI_SLAB_THICK, MIAMI_WALL_X,
  miamiSlabTop, miamiSurface, miamiTerraceHalf, miamiTerraceInset, onMiamiSlab,
} from './miamiLayout';

/**
 * Grinding the Miami triangle's edges: off the terrace, across the gap at an
 * angle, down one of the slab's two upper edges and off its low corner, the
 * edge the one with the slab past the side the trick names. These pin what
 * the clips show and what a skater would check: the pop is on the deck short
 * of the rim, the board comes down on the edge a little below the apex and
 * rests on the granite rather than through it, it pops off the low corner
 * onto the plaza, and the filmers stand clear of the line in.
 */

// The lowest popper, as the gap lines are tested: everyone else pops higher.
const style = resolveSkateStyle({ popHeight: 0.45, rotationSpeed: 1.16, flickStrength: 0.88 });
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const COMBOS = [
  'Kickflip into Frontside 50-50 Grind',
  'Backside 180 into Frontside Nosegrind',
  'Bigspin into Backside Boardslide',
  '360 Flip into Frontside Smith Grind',
  'Backside 5-0 Grind Kickflip Out',
  'Frontside Boardslide Backside 180 Out',
];

const grind = (base: string, stance: Stance = 'regular', riderStance: RiderStance = 'regular', skater: 'robot' | 'realistic' = 'robot'): StagePlan =>
  planStage({ id: base, name: base, base, stance }, { set: 'miami-triangle', landed: true, riderStance, skater, style, fall: 'slam', shankProgress: 0.65 });

function* everyGrind() {
  for (const base of GRIND_BASES) for (const side of ['Frontside', 'Backside']) {
    for (const rider of RIDERS) for (const stance of STANCES) yield { base: `${side} ${base}`, rider, stance };
  }
  for (const base of COMBOS) for (const rider of RIDERS) yield { base, rider, stance: 'regular' as Stance };
}

/** A rig point in the set's own coordinates: down the line, height over the deck, across. */
const inSet = (frame: StageFrame, p: V3) => ({ x: frame.scroll + p.x - X0, y: ASPHALT - p.y, z: frame.stairs!.across + p.z });

/** A set point along an edge from the apex (`s`), how far outside it (`out`), and how high over its line (`over`). */
function onEdge(line: 'left' | 'right', q: V3) {
  const side = line === 'right' ? 1 : -1;
  const a = (side * MIAMI_EDGE_YAW * Math.PI) / 180;
  const dx = q.x - MIAMI_SLAB_APEX_X;
  const s = dx * Math.cos(a) + q.z * Math.sin(a);
  const across = -dx * Math.sin(a) + q.z * Math.cos(a);
  return { s, out: side * across, over: q.y + MIAMI_EDGE_FALL * s };
}

/** Board-local points that can't go into the granite: the deck, its underside, the hangers, the wheels' rims. */
const BOARD: V3[] = (() => {
  const pts: V3[] = [...TOP_LOCAL, ...BOTTOM_LOCAL];
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (let z = -WHEEL_Z; z <= WHEEL_Z; z += 2) pts.push({ x, y: HANGER_BOTTOM, z });
    for (const z of [-WHEEL_Z, WHEEL_Z]) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      pts.push({ x: x + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z });
    }
  }
  return pts;
})();

/** How far a set point is over the granite's top (negative, into it), or null where it isn't over the slab. */
function overSlab(q: V3): number | null {
  if (!onMiamiSlab(q.x, q.z)) return null;
  const top = miamiSlabTop(q.x);
  // Under the plate it's not in it.
  return q.y < top - MIAMI_SLAB_THICK ? null : q.y - top;
}

describe('Miami Triangle: grinding the slab’s edges', () => {
  it('lays each edge from the apex to a low corner, a ledge whose top falls away behind it', () => {
    for (const line of ['left', 'right'] as const) {
      const { handrail, x, z, yaw } = MIAMI_LEDGES[line];
      const side = line === 'right' ? 1 : -1;
      expect([x, z, yaw]).toEqual([MIAMI_SLAB_APEX_X, 0, side * MIAMI_EDGE_YAW]);
      expect(handrail.end - handrail.start).toBeCloseTo(MIAMI_SLAB_SIDE, 9);
      // Down 3¼ ft over its 8½: about 21°, gentler than the face's fall line.
      expect(handrail.slope * MIAMI_SLAB_SIDE / F).toBeCloseTo(3.25, 6);
      // On the edge it's the slab's top, past its low end the plaza, and outside it the plaza too.
      expect(handrail.ground(MIAMI_SLAB_SIDE / 2)).toBeCloseTo(-handrail.slope * MIAMI_SLAB_SIDE / 2, 6);
      expect(handrail.ground(MIAMI_SLAB_SIDE + F)).toBe(MIAMI_PLAZA_Y);
      expect(handrail.ground(MIAMI_SLAB_SIDE / 2, side * F)).toBe(MIAMI_PLAZA_Y);
      // The takeoff is on the deck, back from the tip and out from the edge's line.
      const takeoff = handrail.takeoff!;
      expect(handrail.ground(takeoff.s, side * takeoff.off)).toBe(0);
      expect(takeoff.s).toBeLessThan(-8 * F);
      expect(takeoff.off).toBeGreaterThan(4 * F);
      expect(takeoff.lock).toBe(MIAMI_GRIND_LOCK);
    }
    // Grinds are on, down whichever edge the trick takes; there's no center rail to pick.
    expect(setInfo('miami-triangle')).toMatchObject({ grinds: true, rails: null });
  });

  it('takes the edge with the slab past the side the trick names, coming in from outside it', () => {
    const line = (base: string, stance: Stance = 'regular', rider: RiderStance = 'regular') => grind(base, stance, rider).rail!.line;
    // A regular rider's frontside 50-50 has the edge on the toeside: the left edge, coming in from its left.
    expect(line('Frontside 50-50 Grind')).toBe('left');
    expect(line('Backside 50-50 Grind')).toBe('right');
    // Goofy, or riding fakie, the toes point the other way.
    expect(line('Frontside 50-50 Grind', 'regular', 'goofy')).toBe('right');
    expect(line('Frontside 50-50 Grind', 'fakie')).toBe('right');
    expect(line('Frontside 50-50 Grind', 'switch')).toBe('right');
    // A boardslide is named for its approach like every other slide: a frontside
    // one comes in toeside, as a frontside bluntslide does, onto the same edge.
    expect(line('Frontside Boardslide')).toBe('left');
    expect(line('Backside Boardslide')).toBe('right');
    expect(line('Frontside Bluntslide')).toBe('left');
    for (const stance of STANCES) for (const rider of RIDERS) {
      const board = grind('Frontside Boardslide', stance, rider), blunt = grind('Frontside Bluntslide', stance, rider);
      expect(board.rail!.line, `${stance}/${rider}`).toBe(blunt.rail!.line);
      expect(board.grind!.far, `${stance}/${rider}`).toBe(blunt.grind!.far);
      expect(Math.sign(board.grind!.lock.yaw), `${stance}/${rider}`).toBe(Math.sign(blunt.grind!.lock.yaw));
    }
    for (const { base, rider, stance } of everyGrind()) {
      const stage = grind(base, stance, rider);
      const edge = stage.rail!.line as 'left' | 'right';
      const g = stage.grind!;
      const context = `${base}/${stance}/${rider}`;
      expect(stage.rail!.yaw, context).toBe(MIAMI_LEDGES[edge].yaw);
      // At the pop the board is out past the edge's line, on its outside...
      const pop = onEdge(edge, inSet(stageFrame(stage, g.pop, 1), stageFrame(stage, g.pop, 1).rig.board.center));
      expect(pop.out, context).toBeGreaterThan(4 * F);
      // ...and once locked it's on the edge, its center over the slab side or the edge itself.
      const locked = stageFrame(stage, (g.lockAt + g.off) / 2, 1);
      const on = onEdge(edge, inSet(locked, locked.rig.board.center));
      expect(Math.abs(on.out), context).toBeLessThan(1.5 * F);
    }
  }, 120_000);

  it('pops on the deck short of the rim, at an angle across the tip, and locks on a couple of feet below the apex', () => {
    for (const { base, rider, stance } of everyGrind()) {
      const stage = grind(base, stance, rider);
      const g = stage.grind!;
      const context = `${base}/${stance}/${rider}`;
      // Rolling in and popping, the board's on the flat deck, its middle well inside the rim.
      for (let t = 0; t <= g.pop; t += 1 / 30) {
        const frame = stageFrame(stage, t, 1);
        const c = inSet(frame, frame.rig.board.center);
        expect(miamiSurface(c.x, c.z), `${context} t=${t.toFixed(2)}`).toBe(0);
        expect(miamiTerraceInset(c.x, c.z), `${context} t=${t.toFixed(2)}`).toBeGreaterThan(MIAMI_RIM_WIDTH + 0.5 * F);
      }
      // The line in angles across toward the edge: from the deck, the gap's too far to fly along it.
      const angle = Math.abs(g.approachYaw);
      expect(angle, context).toBeGreaterThan(12);
      expect(angle, context).toBeLessThan(36);
      // It locks on past the apex, with most of the edge still to grind: popping higher for a trick
      // in, the rider comes in slower to come down in the same place.
      const ride = g.handrail!;
      expect(ride.lockS, context).toBeCloseTo(MIAMI_GRIND_LOCK, 6);
      expect(ride.offS - ride.lockS, context).toBeGreaterThan(5 * F);
      expect(ride.speed, context).toBeLessThanOrEqual(MIAMI_GRIND_SPEED + 1e-6);
      expect(ride.speed / F, context).toBeGreaterThan(11);
      // The hop is a real ollie, not a launch.
      expect(g.apex / F, context).toBeLessThan(3);
    }
  }, 120_000);

  it('rests the lock on the edge and the granite behind it, never through it, and clears the rim on the way', () => {
    const failures: string[] = [];
    for (const { base, rider, stance } of everyGrind()) {
      const stage = grind(base, stance, rider);
      const g = stage.grind!;
      const edge = stage.rail!.line as 'left' | 'right';
      for (let t = g.pop + 0.05; t <= g.land; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        const context = `${base}/${stance}/${rider} t=${(t - g.pop).toFixed(3)}`;
        let lowest = Infinity;
        for (const local of BOARD) {
          const q = inSet(frame, frame.rig.board.point(local));
          // A pinched crook rides the edge's corner from just outside it.
          const corner = onEdge(edge, q);
          if (corner.out >= 0 && corner.out < 0.1 * F && corner.s > 0 && corner.s < MIAMI_SLAB_SIDE) lowest = Math.min(lowest, corner.over);
          // Over the rim on the way off the deck the board passes a tenth of a foot clear at least.
          const rim = q.x <= 0 && Math.abs(q.z) <= miamiTerraceHalf(q.x) && miamiSurface(q.x, q.z) > 0;
          if (rim && q.y - miamiSurface(q.x, q.z) < 0.1 * F) failures.push(`${context} ${((q.y - miamiSurface(q.x, q.z)) / F).toFixed(2)} ft over the rim`);
          const over = overSlab(q);
          if (over == null) continue;
          lowest = Math.min(lowest, over);
          if (over < -0.02 * F) failures.push(`${context} ${(over / F).toFixed(3)} ft into the slab`);
        }
        // Locked, something rests on it: the edge, or the top behind it. Nothing floats.
        if (t > g.lockAt + 0.03 && t < g.off - 0.1 && lowest > 0.05 * F) failures.push(`${context} floating ${(lowest / F).toFixed(3)} ft over the slab`);
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 240_000);

  it('keeps the rider’s legs out of the granite and off the deck, a person’s as a robot’s', () => {
    const failures: string[] = [];
    for (const skater of ['robot', 'realistic'] as const) for (const { base, rider, stance } of everyGrind()) {
      const stage = grind(base, stance, rider, skater);
      const g = stage.grind!;
      for (let t = g.pop; t <= g.land; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        for (const leg of frame.rig.legs) for (const p of [leg.hip, leg.knee, leg.ankle]) {
          const q = inSet(frame, p);
          const clear = q.y - miamiSurface(q.x, q.z);
          if (clear < 0.25 * F) failures.push(`${skater} ${base}/${stance}/${rider} t=${(t - g.pop).toFixed(3)} ${(clear / F).toFixed(2)} ft`);
        }
      }
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 300_000);

  it('never puts the board through the legs on the way onto the edge or along it, tricks in included', () => {
    // As riderClearance.test.ts checks bars and handrails: the hop across the gap is longer, so a trick
    // in plays at its own pace over it, and a lock resting on the granite still keeps clear of the shins.
    const popper = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
    const TRICKS = ['Kickflip', 'Heelflip', '360 Flip', 'Hardflip', 'Varial Heelflip', 'Bigspin Flip', 'Backside Flip', '360 Shuvit'];
    const GRINDS = ['Frontside 50-50 Grind', 'Backside 5-0 Grind', 'Backside Smith Grind', 'Frontside Feeble Grind', 'Frontside Boardslide', 'Backside Lipslide', 'Frontside Noseslide'];
    const found: string[] = [];
    const check = (base: string, rider: RiderStance, stance: Stance) => {
      const stage = planStage({ id: base, name: base, base, stance }, { set: 'miami-triangle', landed: true, riderStance: rider, style: popper, fall: 'slam', shankProgress: 0.65 });
      const g = stage.grind!;
      for (let t = g.pop; t <= g.off - 0.12; t += 1 / 120) {
        const rig = stageFrame(stage, t, 1).rig;
        for (const leg of rig.legs) {
          const where = `${leg.side} ${base} ${stance} ${rider} t=${(t - g.pop).toFixed(3)}`;
          if (shoeIntersectsBoard(rig.board, moveFrame(leg.shoe, { x: 0, y: -1.5, z: 0 }))) found.push(`shoe: ${where}`);
          if (capsuleIntersectsBoard(rig.board, leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle)) found.push(`shin: ${where}`);
          if (capsuleIntersectsBoard(rig.board, leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee)) found.push(`thigh: ${where}`);
        }
      }
    };
    for (const rider of RIDERS) {
      for (const trick of TRICKS) for (const base of GRINDS) check(`${trick} into ${base}`, rider, 'regular');
      for (const base of GRIND_BASES) for (const side of ['Frontside', 'Backside']) for (const stance of STANCES) check(`${side} ${base}`, rider, stance);
    }
    expect(found.slice(0, 8)).toEqual([]);
  }, 300_000);

  it('pops off the low corner and lands on the plaza past it, then rides away clear of the pots and beds', () => {
    for (const { base, rider, stance } of everyGrind()) {
      const stage = grind(base, stance, rider);
      const g = stage.grind!;
      const edge = stage.rail!.line as 'left' | 'right';
      const context = `${base}/${stance}/${rider}`;
      expect(GROUND - g.landY, context).toBeCloseTo(MIAMI_PLAZA_Y, 6);
      const touchdown = stageFrame(stage, g.land, 1);
      const at = inSet(touchdown, touchdown.rig.board.center);
      expect(onMiamiSlab(at.x, at.z), context).toBe(false);
      expect(onEdge(edge, at).s, context).toBeGreaterThan(MIAMI_SLAB_SIDE);
      for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
        const wheel = inSet(touchdown, touchdown.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z }));
        expect(Math.abs(wheel.y - MIAMI_PLAZA_Y), context).toBeLessThan(0.1 * F);
      }
      for (let t = g.land; t <= stage.end; t += 1 / 30) {
        const frame = stageFrame(stage, t, 1);
        const c = inSet(frame, frame.rig.board.center);
        expect(miamiSurface(c.x, c.z), `${context} t=${t.toFixed(2)}`).toBe(MIAMI_PLAZA_Y);
        // Well inside the plaza's triangle, away from the beds along its sides and the pots along the wall.
        expect(Math.abs(c.z), context).toBeLessThan(MIAMI_PLAZA_HALF - (c.x - MIAMI_WALL_X) - 8 * F);
        expect(c.x, context).toBeGreaterThan(MIAMI_SLAB_LIP_X - F);
      }
    }
  }, 120_000);

  it('films each edge in frame from the crane and every tripod, the filmers clear of the line in', () => {
    const spot = new Miami3D();
    try {
      for (const base of ['Frontside 50-50 Grind', 'Backside 50-50 Grind', 'Frontside Boardslide']) for (const rider of RIDERS) {
        const stage = grind(base, 'regular', rider);
        const g = stage.grind!;
        const times = [...Array.from({ length: Math.ceil(stage.end * 20) + 1 }, (_, i) => Math.min(stage.end, i / 20)), g.pop, g.lockAt, g.off, g.land];
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) for (const t of times) {
          const frame = stageFrame(stage, t, 1);
          expect(frame.stairs!.ledge).toBe(stage.rail!.line);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
          const context = `${base}/${rider}/${tripod ?? 'crane'} at ${t.toFixed(2)}`;
          expect(view.eye.every(Number.isFinite)).toBe(true);
          const eye = { x: view.eye[0] + frame.scroll, z: view.eye[2] + frame.stairs!.across };
          expect(view.eye[1], context).toBeGreaterThan(miamiSurface(eye.x, eye.z) + F);
          const hips = inSet(frame, frame.rig.board.center);
          if (tripod) expect(Math.hypot(eye.x - hips.x, eye.z - hips.z), context).toBeGreaterThan(5 * F);
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
  }, 120_000);

  it('keeps the tripods’ view of the grind clear of the scenery', () => {
    // From the plaza the deck's edge hides the board on the run-up; the top
    // filmer loses it behind the apex once it's down the edge. Each films
    // the part of the line it's there for.
    const spot = new Miami3D();
    const built = buildMiamiGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const scenery = [new Mesh(built.ground, material), new Mesh(built.props, material)];
    try {
      for (const base of ['Frontside 50-50 Grind', 'Backside 50-50 Grind']) for (const rider of RIDERS) {
        const stage = grind(base, 'regular', rider);
        const g = stage.grind!;
        for (const tripod of ['bottom', 'side', 'top'] as TripodId[]) {
          const from = tripod === 'top' ? 0 : g.pop + 0.15;
          const until = tripod === 'top' ? g.lockAt : g.land + 0.4;
          for (let t = from; t <= until; t += 1 / 20) {
            const frame = stageFrame(stage, t, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
            const eye = new Vector3(view.eye[0] + frame.scroll, view.eye[1], view.eye[2] + frame.stairs!.across);
            for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
              const p = inSet(frame, point);
              const direction = new Vector3(p.x, p.y, p.z).sub(eye);
              const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 6);
              expect(ray.intersectObjects(scenery), `${base}/${rider}/${tripod} at ${t.toFixed(2)}`).toHaveLength(0);
            }
          }
        }
      }
    } finally { spot.dispose(); material.dispose(); built.ground.dispose(); built.props.dispose(); }
  }, 120_000);
});
