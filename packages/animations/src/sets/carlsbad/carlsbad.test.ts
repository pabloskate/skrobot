import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { LEAN_PAST_TOUCHDOWN } from '../../stage/bank';
import { planStage, stageFrame } from '../../stage/stage';
import { isFiniteFrame } from '../../testing';
import type { RiderStance, Stance } from '../../types';
import { SET_SCALE } from '../setScale';
import { setInfo, setTimeline } from '../sets';
import { Carlsbad3D } from './carlsbad3d';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_DROP, CARLSBAD_FOOT as F, CARLSBAD_LANE_Z, CARLSBAD_RISER,
  CARLSBAD_RUN, CARLSBAD_STAIR_RUN, CARLSBAD_STAIR_Z0, CARLSBAD_STAIR_Z1,
  CARLSBAD_STEPS, CARLSBAD_TOE_HEIGHT, CARLSBAD_TREAD,
  CARLSBAD_UPHILL_END, CARLSBAD_UPHILL_EASE,
  carlsbadBankEnd, carlsbadLanding, carlsbadLandingSlope, carlsbadSurface,
} from './carlsbadLayout';

const attempt = (riderStance: RiderStance = 'regular', stance: Stance = 'regular') => planStage(
  { id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance },
  { set: 'carlsbad-gap', landed: true, riderStance, skater: 'realistic', style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65 },
);

describe('Carlsbad: the original grass gap and uphill landing', () => {
  it('registers a gap beside eleven stairs with its own scaled terrain and stationary filmers', () => {
    const info = setInfo('carlsbad-gap');
    expect(info.terrain!.run).toBe(CARLSBAD_RUN * SET_SCALE);
    expect(info.terrain!.drop).toBe(CARLSBAD_DROP * SET_SCALE);
    expect(info.terrain!.laneZ).toBe(CARLSBAD_LANE_Z * SET_SCALE);
    expect(info.grinds).toBe(false);
    expect(info.rails).toBeNull();
    expect(info.tripods).toEqual(['bottom', 'side', 'top']);
    expect(CARLSBAD_STEPS).toBe(11);
    expect(CARLSBAD_STAIR_Z0).toBeGreaterThan(CARLSBAD_LANE_Z);
    const built = buildCarlsbadGeometry();
    try {
      const p = built.ground.getAttribute('position'), n = built.ground.getAttribute('normal');
      const risers = new Set<number>();
      for (let i = 0; i < p.count; i += 3) {
        if (n.getX(i) < 0.99 || Math.abs(n.getY(i)) > 1e-6) continue;
        if ([i, i + 1, i + 2].some(k => p.getZ(k) < CARLSBAD_STAIR_Z0 - 0.01 || p.getZ(k) > CARLSBAD_STAIR_Z1 + 0.01)) continue;
        const heights = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
        if (Math.abs(Math.max(...heights) - Math.min(...heights) - CARLSBAD_RISER) < 0.01) risers.add(Math.round(p.getX(i) * 100));
      }
      expect(risers.size).toBe(11);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('draws the same walk, bank, curved toe, stairs and uphill pavement the rider and shadows use', () => {
    const built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    const samples: [number, number][] = [
      [-0.2 * F, 0], [0.7 * F, 0], [5.1 * F, 0], [10.3 * F, 0],
      [CARLSBAD_RUN + 1.7 * F, 0], [CARLSBAD_RUN + 13.1 * F, -2.3 * F],
      [CARLSBAD_UPHILL_END + 3.7 * F, 0], [CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE + F, 0],
    ];
    for (const z of [-2.3 * F, 3.3 * F, 7.3 * F]) {
      const end = carlsbadBankEnd(z);
      samples.push([end - 1.7 * F, z], [end - 0.1 * F, z], [end + 0.2 * F, z]);
    }
    for (let i = 0; i < CARLSBAD_STEPS - 1; i++) samples.push([(i + 0.37) * CARLSBAD_TREAD, (CARLSBAD_STAIR_Z0 + CARLSBAD_STAIR_Z1) / 2]);
    try {
      for (const [x, z] of samples) {
        const hit = new Raycaster(new Vector3(x, 2 * F, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
        const context = `surface at ${x / F}, ${z / F} ft`;
        expect(hit, context).toBeDefined();
        expect(Math.abs(hit.point.y - carlsbadSurface(x, z)), context).toBeLessThan(0.04 * F);
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('bows the low concrete toe away from the stair foot rather than making a straight stair bank', () => {
    expect(carlsbadBankEnd(CARLSBAD_STAIR_Z0)).toBe(CARLSBAD_STAIR_RUN);
    expect(carlsbadBankEnd(CARLSBAD_LANE_Z)).toBeGreaterThan(CARLSBAD_STAIR_RUN);
    expect(carlsbadBankEnd(CARLSBAD_STAIR_Z0 - 2 * F)).toBeLessThan(carlsbadBankEnd(CARLSBAD_STAIR_Z0 - 6 * F));
    for (const z of [-2 * F, 3 * F, 7 * F]) {
      const end = carlsbadBankEnd(z);
      const exposedHeight = carlsbadSurface(end - 0.1 * F, z) - carlsbadSurface(end + 0.1 * F, z);
      expect(Math.abs(exposedHeight - CARLSBAD_TOE_HEIGHT)).toBeLessThan(0.01 * F);
    }
    expect(carlsbadLanding(CARLSBAD_RUN + 12 * F)).toBeGreaterThan(carlsbadLanding(CARLSBAD_RUN));
    expect(carlsbadLandingSlope(CARLSBAD_RUN + F)).toBeGreaterThan(0);
    expect(carlsbadLandingSlope(CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE)).toBe(0);
  });

  it('settles both trucks onto the uphill landing and loses speed rolling away in every stance', () => {
    for (const rider of ['regular', 'goofy'] as const) for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
      const plan = attempt(rider, stance);
      const timeline = setTimeline('carlsbad-gap', plan.style, true, 'stairs', stance, 'Kickflip');
      expect(plan.stairs!.land).toBe(timeline.land);
      expect(plan.end).toBe(timeline.end);
      const land = plan.stairs!.land;
      const touchdown = stageFrame(plan, land, 1);
      expect(touchdown.scroll).toBeCloseTo((CARLSBAD_RUN + 3 * F) * SET_SCALE);
      expect(touchdown.stairs!.across).toBe(CARLSBAD_LANE_Z * SET_SCALE);
      for (const t of [land + LEAN_PAST_TOUCHDOWN + 0.06, plan.end]) {
        const frame = stageFrame(plan, t, 1);
        expect(isFiniteFrame(frame)).toBe(true);
        const axis = frame.rig.board.dir({ x: 1, y: 0, z: 0 });
        expect(axis.y / axis.x).toBeCloseTo(-carlsbadLandingSlope(frame.scroll / SET_SCALE), 3);
        for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) {
          const wheel = frame.rig.board.point({ x, y: WHEEL_Y + WHEEL_R, z });
          const floor = carlsbadSurface((frame.scroll + wheel.x - X0) / SET_SCALE, (frame.stairs!.across + wheel.z) / SET_SCALE) * SET_SCALE;
          expect(Math.abs(ASPHALT - wheel.y - floor), `${stance}/${rider} wheel at ${t}`).toBeLessThan(0.5);
        }
      }
      const earlyDistance = stageFrame(plan, land + 0.3, 1).scroll - stageFrame(plan, land + 0.2, 1).scroll;
      const laterDistance = stageFrame(plan, land + 0.6, 1).scroll - stageFrame(plan, land + 0.5, 1).scroll;
      expect(earlyDistance).toBeGreaterThan(laterDistance);
      expect(laterDistance).toBeGreaterThan(0);
    }
  });

  it('keeps all baked geometry finite and below the mobile vertex and shadow budgets', () => {
    const built = buildCarlsbadGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        vertices += geometry.getAttribute('position').count;
        for (const name of ['position', 'normal', 'aColor', 'aCorner']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
      }
      expect(vertices).toBeLessThan(100_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('films both rider stances from above the terrain with the rider and board inside the frame', () => {
    const spot = new Carlsbad3D();
    const failures = new Map<string, string>();
    try {
      for (const rider of ['regular', 'goofy'] as const) {
        const plan = attempt(rider);
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) {
          for (const aspect of [1.24, 390 / 640]) for (let t = 0; t <= plan.end; t += 1 / 15) {
            const frame = stageFrame(plan, t, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, aspect, tripod)!;
            const x = (view.eye[0] + frame.scroll) / SET_SCALE;
            const z = (view.eye[2] + frame.stairs!.across) / SET_SCALE;
            expect(view.eye.every(Number.isFinite)).toBe(true);
            expect(view.eye[1] / SET_SCALE, `${tripod}/${rider} camera at ${t}`).toBeGreaterThan(carlsbadSurface(x, z));
            const points = [frame.rig.head.at(0, -30, 0)];
            for (const wheel of [-WHEEL_X, WHEEL_X]) points.push(frame.rig.board.point({ x: wheel, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z }));
            for (const point of points) {
              const p = view.cam.project(point);
              const shot = `${tripod}/${aspect}/${rider}`;
              const outside = p.x <= view.box.x || p.x >= view.box.x + view.box.width || p.y <= view.box.y || p.y >= view.box.y + view.box.height;
              if (outside && !failures.has(shot)) failures.set(shot, `at ${t.toFixed(2)}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) outside ${JSON.stringify(view.box)}`);
            }
          }
        }
      }
      expect(Array.from(failures)).toEqual([]);
    } finally { spot.dispose(); }
  });
});
