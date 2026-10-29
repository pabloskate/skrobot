import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { GRIND_BASES } from '../../motion/grindDefinitions';
import { boardSamples } from '../../motion/grindTesting';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame, type StagePlan } from '../../stage/stage';
import { isFiniteFrame, sweepHz } from '../../testing';
import type { RiderStance, Stance } from '../../types';
import { SET_SCALE } from '../setScale';
import { railApproachAllowed, railLineFor, setHandrail, setInfo, type RailChoice } from '../sets';
import { Emage3D } from './emage3d';
import { buildEmageGeometry } from './emageGeometry';
import {
  EMAGE_BANK_TOP, EMAGE_DROP, EMAGE_FOOT as F, EMAGE_GRADE, EMAGE_LANE_Z, EMAGE_RAIL,
  EMAGE_RAIL_HEIGHT, EMAGE_RAIL_Z, EMAGE_RISER, EMAGE_RUN, EMAGE_SHELF_END,
  EMAGE_STAIR_Z0, EMAGE_STAIR_Z1, EMAGE_STEPS, EMAGE_TREAD,
  emageGround, emageSurface,
} from './emageLayout';

const K = SET_SCALE;
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const style = resolveSkateStyle({ popHeight: 0.65, rotationSpeed: 1.08, flickStrength: 0.95 });
const attempt = (base: string, riderStance: RiderStance = 'regular', stance: Stance = 'regular', rail: RailChoice = 'center') => planStage(
  { id: base, name: base, base, stance },
  { set: 'emage-20', rail, landed: true, riderStance, skater: 'realistic', style, fall: 'slam', shankProgress: 0.65 },
);

/** Distance from a drawn board point to the finite sloping pipe's axis. */
function fromPipe(frame: StageFrame, point: V3): number | null {
  const origin = { x: X0 - frame.scroll, y: ASPHALT - EMAGE_RAIL_HEIGHT * K };
  const s = (point.x - origin.x + EMAGE_GRADE * (point.y - origin.y)) / (1 + EMAGE_GRADE ** 2);
  if (s < EMAGE_RAIL.start * K || s > EMAGE_RAIL.end * K) return null;
  return Math.hypot(point.x - origin.x - s, point.y - origin.y - s * EMAGE_GRADE, point.z);
}

/** The physical floor beneath every wheel, including the bank outside the rail. */
function wheelClearances(frame: StageFrame): number[] {
  return [-WHEEL_X, WHEEL_X].flatMap(x => [-WHEEL_Z, WHEEL_Z].map(z => {
    const center = frame.rig.board.point({ x, y: WHEEL_Y, z });
    const floor = emageSurface((frame.scroll + center.x - X0) / K, (frame.stairs!.across + center.z) / K) * K;
    return ASPHALT - center.y - WHEEL_R - floor;
  }));
}

/**
 * A made landing's step-off: the hop comes with the board still on the trail or its shoulder, and the rider and board end
 * up stopped in the brush on the shelf, the board on it rather than in it.
 */
function stepsOffShortOfTheRiver(plan: StagePlan, label: string): string[] {
  const failures: string[] = [];
  if (!plan.stepOff) return [`${label}: no step-off`];
  const along = (frame: StageFrame, x: number) => (frame.scroll + x - X0) / K;
  const hop = stageFrame(plan, plan.stepOff.at, 1);
  const hopAt = along(hop, hop.rig.board.center.x);
  if (hopAt > EMAGE_BANK_TOP + F) failures.push(`${label}: hops ${((hopAt - EMAGE_RUN) / F).toFixed(1)} ft past the stairs, in the brush`);
  for (let t = plan.stepOff.at; t <= plan.end; t += 1 / 30) {
    const frame = stageFrame(plan, t, 1);
    if (!isFiniteFrame(frame)) failures.push(`${label} at ${t.toFixed(3)}: not finite`);
  }
  const end = stageFrame(plan, plan.end, 1);
  for (const [what, x] of [['rider', end.rig.torso.origin.x], ['board', end.rig.board.center.x]] as const) {
    const u = along(end, x);
    if (u < EMAGE_BANK_TOP || u > EMAGE_SHELF_END) failures.push(`${label}: ${what} stops at ${((u - EMAGE_RUN) / F).toFixed(1)} ft past the stairs`);
  }
  const clear = Math.min(...wheelClearances(end));
  if (clear < -1 || clear > 2 * F * K) failures.push(`${label}: board ${clear.toFixed(2)} over the ground at the end`);
  return failures;
}

describe('Emage twenty: inset walking stairs and the riverside rail', () => {
  it('keeps every grind on the same real side rail in both stances, independent of old rail links', () => {
    const info = setInfo('emage-20');
    expect(info.grinds).toBe(true);
    expect(info.rails!.fixedLine).toBe('right');
    expect(info.terrain!.drop).toBe(EMAGE_DROP * K);
    expect(info.terrain!.run).toBe(EMAGE_RUN * K);
    expect(info.terrain!.laneZ).toBe(EMAGE_LANE_Z * K);
    expect(info.tripods).toEqual(['bottom', 'side', 'top']);
    expect(EMAGE_RAIL_Z).toBeGreaterThan(EMAGE_LANE_Z);
    for (const base of GRIND_BASES) for (const side of ['Frontside', 'Backside']) {
      for (const rider of RIDERS) for (const stance of STANCES) for (const choice of ['center', 'side'] as const) {
        const trick = { base: `${side} ${base}`, stance };
        expect(railLineFor('emage-20', trick, rider, choice)).toBe('right');
        expect(railApproachAllowed('emage-20', trick, rider)).toBe(railLineFor('el-toro', trick, rider, 'side') === 'right');
        expect(railApproachAllowed('el-toro', trick, rider)).toBe(true);
        const pipe = setHandrail('emage-20', trick, rider, choice)!;
        expect(pipe.end).toBe(EMAGE_RAIL.end * K);
        expect(pipe.top).toBe(EMAGE_RAIL.top * K);
        expect(pipe.edge).toBe(true);
      }
    }
    expect(railLineFor('emage-20', { base: 'Kickflip', stance: 'regular' }, 'regular', 'side')).toBeNull();
    for (const choice of ['center', 'side'] as const) {
      expect(attempt('Frontside 50-50 Grind', 'regular', 'regular', choice).rail).toEqual({ line: 'right', z: EMAGE_RAIL_Z * K });
    }
  });

  it('draws twenty separate walking risers and agrees with their collision heights', () => {
    const built = buildEmageGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const risers = new Set<number>();
      const mesh = new Mesh(built.ground, material);
      for (let step = 0; step < 20; step++) {
        // Approach each riser horizontally from the lower path. This checks
        // exposed faces even where a deep terrace box sits behind them.
        const origin = new Vector3(EMAGE_RUN + 2 * F, -(step + 0.5) * EMAGE_RISER, 0.11 * F);
        const hit = new Raycaster(origin, new Vector3(-1, 0, 0), 0, EMAGE_RUN + 4 * F).intersectObject(mesh)[0];
        expect(hit, `walking riser ${step + 1}`).toBeDefined();
        expect(hit.point.x, `walking riser ${step + 1}`).toBeCloseTo(step * EMAGE_TREAD, 3);
        risers.add(Math.round(hit.point.x * 100));
      }
      expect(EMAGE_STEPS).toBe(20);
      expect(risers.size).toBe(20);
      const samples: [number, number][] = [[-2.31 * F, 0], [EMAGE_RUN + 5.17 * F, 0]];
      for (let step = 0; step < EMAGE_STEPS - 1; step++) {
        samples.push([(step + 0.37) * EMAGE_TREAD, 0.11 * F]);
      }
      for (const share of [0.13, 0.43, 0.83]) {
        samples.push([EMAGE_RUN * share, EMAGE_STAIR_Z0 - 3.17 * F]);
        samples.push([EMAGE_RUN * share, EMAGE_STAIR_Z1 + 2.31 * F]);
      }
      for (const [x, z] of samples) {
        const hit = new Raycaster(new Vector3(x, 3 * F, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
        expect(hit, `surface at ${x / F}, ${z / F} ft`).toBeDefined();
        expect(Math.abs(hit.point.y - emageSurface(x, z))).toBeLessThan(0.04 * F);
      }
      expect(emageGround(-0.01)).toBe(0);
      expect(emageGround(EMAGE_RUN)).toBe(-EMAGE_DROP);
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('matches the drawn grindable top pipe to the stage rail without inventing a center rail', () => {
    const built = buildEmageGeometry();
    try {
      const tops = built.railSegments.filter(({ a, b }) => Math.abs(b[0] - a[0]) > EMAGE_RUN * 0.8 && Math.abs(a[2] - b[2]) < 0.01);
      expect(tops).toHaveLength(1);
      const { a, b, radius } = tops[0];
      expect(a[0]).toBe(EMAGE_RAIL.start);
      expect(b[0]).toBe(EMAGE_RAIL.end);
      expect(a[2]).toBe(EMAGE_RAIL_Z);
      expect(b[2]).toBe(EMAGE_RAIL_Z);
      expect(radius).toBe(EMAGE_RAIL.radius);
      expect((a[1] - b[1]) / (b[0] - a[0])).toBeCloseTo(EMAGE_GRADE, 8);
      expect(a[1] + a[0] * EMAGE_GRADE + radius * Math.hypot(1, EMAGE_GRADE)).toBeCloseTo(EMAGE_RAIL.top, 8);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('leaves the gap and both mirrored rail roll-ins clear of the upper bench and planting', () => {
    const built = buildEmageGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.props, material);
      for (const base of ['Kickflip', 'Frontside 50-50 Grind', 'Backside 50-50 Grind']) {
        for (const rider of RIDERS) for (const stance of STANCES) {
          const plan = attempt(base, rider, stance);
          const pop = plan.grind?.pop ?? plan.stairs!.pop;
          for (let t = 0; t < pop - 0.05; t += 0.1) {
            const frame = stageFrame(plan, t, 1);
            const x = (frame.scroll + frame.rig.board.center.x - X0) / K;
            const z = (frame.stairs!.across + frame.rig.board.center.z) / K;
            const y = emageSurface(x, z);
            const ray = new Raycaster(new Vector3(x, y + 2 * F, z), new Vector3(0, -1, 0), 0, 1.9 * F);
            expect(ray.intersectObject(mesh), `${base}/${rider}/${stance} roll-in at ${t}`).toEqual([]);
          }
        }
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('locks onto the pipe, accelerates down it and clears the last stair on dismount in every stance', () => {
    const failures: string[] = [];
    for (const base of [
      'Frontside 50-50 Grind', 'Backside 50-50 Grind', 'Frontside Smith Grind',
      'Backside Boardslide', 'Frontside Lipslide',
      'Kickflip into Frontside 50-50 Grind', 'Backside 5-0 Grind Kickflip Out',
    ]) for (const rider of RIDERS) for (const stance of STANCES) {
      const plan = attempt(base, rider, stance);
      const grind = plan.grind!;
      const ride = grind.handrail!;
      const label = `${base}/${stance}/${rider}`;
      expect(plan.rail).toEqual({ line: 'right', z: EMAGE_RAIL_Z * K });
      expect(ride.popS).toBeLessThan(EMAGE_RAIL.start * K);
      expect(ride.lockS).toBeGreaterThan(0);
      expect(ride.offSpeed).toBeGreaterThan(ride.speed);
      for (const share of [0.2, 0.5, 0.8]) {
        const frame = stageFrame(plan, grind.lockAt + share * (grind.off - grind.lockAt - 0.1), 1);
        const distances = boardSamples(frame.rig).map(point => fromPipe(frame, point)).filter((d): d is number => d != null);
        const nearest = Math.min(...distances);
        expect(nearest, `${label} seated on rail`).toBeGreaterThan(EMAGE_RAIL.radius * K - 1);
        expect(nearest, `${label} seated on rail`).toBeLessThan(EMAGE_RAIL.radius * K + 1.5);
      }
      for (let t = grind.off; t <= grind.land + 0.02; t += 1 / sweepHz(60)) {
        const frame = stageFrame(plan, t, 1);
        const clear = Math.min(...boardSamples(frame.rig).map(point => ASPHALT - point.y - emageSurface((frame.scroll + point.x - X0) / K, (frame.stairs!.across + point.z) / K) * K));
        if (!isFiniteFrame(frame) || clear < -0.65) failures.push(`${label} at ${t.toFixed(3)}: ${clear}`);
      }
      expect(stageFrame(plan, grind.land, 1).scroll).toBeGreaterThan(EMAGE_RUN * K);
      failures.push(...stepsOffShortOfTheRiver(plan, label));
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 120_000);

  it('hops off a landed gap before the trail runs out and stops in the brush, short of the river', () => {
    const failures: string[] = [];
    for (const base of ['Ollie', 'Kickflip', 'Frontside 180']) for (const rider of RIDERS) for (const stance of STANCES) {
      const plan = attempt(base, rider, stance);
      expect(plan.stairs!.stepOff).toBe(plan.stepOff!.at);
      failures.push(...stepsOffShortOfTheRiver(plan, `${base}/${stance}/${rider}`));
    }
    expect(failures.slice(0, 12)).toEqual([]);
  }, 120_000);

  it('uses finite baked geometry within the mobile vertex and shadow budgets', () => {
    const built = buildEmageGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        vertices += geometry.getAttribute('position').count;
        for (const name of ['position', 'normal', 'aColor', 'aCorner']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
      }
      expect(vertices).toBeLessThan(140_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('keeps a gap and a rail attempt, and the rider stepping off, inside portrait and landscape shots for both riders', () => {
    const spot = new Emage3D();
    const failures = new Map<string, string>();
    try {
      for (const base of ['Kickflip', 'Backside Boardslide']) for (const rider of RIDERS) {
        const plan = attempt(base, rider);
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) {
          for (const aspect of [1.24, 390 / 640]) for (let t = 0; t <= plan.end; t += 1 / 12) {
            const frame = stageFrame(plan, t, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, aspect, tripod)!;
            expect(view.eye.every(Number.isFinite)).toBe(true);
            const eyeX = (view.eye[0] + frame.scroll) / K, eyeZ = (view.eye[2] + frame.stairs!.across) / K;
            expect(view.eye[1] / K, `${base}/${tripod} camera at ${t}`).toBeGreaterThan(emageSurface(eyeX, eyeZ));
            const points = [frame.rig.head.at(0, -30, 0)];
            // Once the rider hops off, the shot stays on them; the board rolls off on its own, out of it at times.
            const onBoard = !plan.stepOff || t < plan.stepOff.at;
            if (onBoard) for (const x of [-WHEEL_X, WHEEL_X]) points.push(frame.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z }));
            for (const point of points) {
              const p = view.cam.project(point);
              const shot = `${base}/${tripod}/${aspect}/${rider}`;
              if ((p.x <= view.box.x || p.x >= view.box.x + view.box.width || p.y <= view.box.y || p.y >= view.box.y + view.box.height) && !failures.has(shot)) {
                failures.set(shot, `at ${t.toFixed(2)}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
              }
            }
          }
        }
      }
      expect(Array.from(failures)).toEqual([]);
    } finally { spot.dispose(); }
  }, 60_000);
});
