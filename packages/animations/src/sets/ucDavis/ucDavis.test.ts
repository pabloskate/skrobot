import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import { resolveSkateStyle } from '../../motion/style';
import { KICK_OUT_DROP_T, X0 } from '../../motion/trick';
import { planStage, stageFrame } from '../../stage/stage';
import { FOOT } from '../../units';
import { SET_SCALE } from '../setScale';
import { setInfo, setTimeline } from '../sets';
import { stairTrack } from '../elToro/stairs';
import { UcDavis3D } from './ucDavis3d';
import { buildUcDavisGeometry } from './ucDavisGeometry';
import {
  UC_DAVIS_DROP, UC_DAVIS_FOOT as F, UC_DAVIS_RUN,
  UC_DAVIS_BANK_Z1, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z1,
  UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_HALL_HALF_WIDTH,
  UC_DAVIS_WRAP_Z, UC_DAVIS_WRAP_WIDTH, UC_DAVIS_WRAP_BACK_X, UC_DAVIS_CURB_TOP,
  UC_DAVIS_PLANTER_RADIUS, UC_DAVIS_PLANTER_Z, UC_DAVIS_PLANTER_TOP,
  UC_DAVIS_RISER, UC_DAVIS_STAIR_FLIGHT, UC_DAVIS_STAIR_MID_END,
  UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1, UC_DAVIS_TREAD,
  ucDavisOnPlanter, ucDavisSurface, ucDavisWrapSurface, ucDavisBankEnd,
} from './ucDavisLayout';

const attempt = (riderStance: 'regular' | 'goofy' = 'regular', landed = true) => planStage(
  { id: '360-flip', name: '360 Flip', base: '360 Flip', stance: 'regular' },
  { set: 'uc-davis-gap', landed, riderStance, skater: 'realistic', style: resolveSkateStyle(), fall: 'kickout', shankProgress: 0.65 },
);

describe('UC Davis: the classic Roessler ivy gap', () => {
  it('uses the documented estimated span and drop at real board scale', () => {
    const { terrain, grinds, rails, tripods } = setInfo('uc-davis-gap');
    expect(UC_DAVIS_RUN / F).toBeCloseTo(24 + 4 / 12, 10);
    expect(UC_DAVIS_DROP / F).toBe(10);
    expect(terrain!.run / FOOT * 0.3048).toBeCloseTo(7.4168, 8);
    expect(terrain!.drop / FOOT * 0.3048).toBeCloseTo(3.048, 8);
    expect(grinds).toBe(false);
    expect(rails).toBeNull();
    expect(tripods).toEqual(['bottom', 'side', 'top']);
    for (const rider of ['regular', 'goofy'] as const) for (const landed of [true, false]) {
      const plan = attempt(rider, landed);
      const timeline = setTimeline('uc-davis-gap', plan.style, landed);
      expect(plan.stairs!.land).toBe(timeline.land);
      expect(plan.end).toBe(landed ? timeline.end : timeline.land + KICK_OUT_DROP_T);
      if (landed) {
        const frame = stageFrame(plan, timeline.land, 1);
        expect(frame.scroll).toBeCloseTo((UC_DAVIS_RUN + 3 * F) * SET_SCALE);
        expect(terrain!.ground(frame.scroll)).toBe(-terrain!.drop);
      }
    }
  });

  it('leaves the walkway and jump line clear of the rock planter', () => {
    // The observed run-up is straight through the open hallway, continuing
    // on the same heading across the terrace to the lip.
    for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
      for (const popHeight of [0.45, 1.15]) {
        const plan = planStage({ id: stance, name: 'Ollie', base: 'Ollie', stance }, {
          set: 'uc-davis-gap', landed: true, riderStance: 'regular', skater: 'realistic',
          style: resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 }), fall: 'slam', shankProgress: 0.65,
        }).stairs!;
        for (let t = 0; t <= plan.pop; t += 1 / 60) {
          const p = stairTrack(plan, t, 0);
          expect(p.x / SET_SCALE).toBeGreaterThan(UC_DAVIS_BUILDING_BACK_X);
          expect(p.z).toBe(0);
          expect(p.yaw).toBe(0);
          expect(ucDavisSurface(p.x / SET_SCALE, p.z / SET_SCALE)).toBe(0);
        }
      }
    }
    for (let x = 0; x <= UC_DAVIS_RUN; x += F) expect(ucDavisOnPlanter(x, 0)).toBe(false);
    expect(UC_DAVIS_PLANTER_Z - UC_DAVIS_PLANTER_RADIUS).toBeGreaterThan(2 * F);
    expect(ucDavisSurface(F, UC_DAVIS_PLANTER_Z)).toBe(-0.35 * F);
    expect(ucDavisSurface(UC_DAVIS_PLANTER_RADIUS - 0.1 * F, UC_DAVIS_PLANTER_Z)).toBe(UC_DAVIS_PLANTER_TOP);
  });

  it('matches the photographed left termination and right access stair', () => {
    // From the landing looking uphill, positive z is image-left. The
    // planter stays left; both rails and the sole stair are image-right.
    const built = buildUcDavisGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      expect(UC_DAVIS_PLANTER_Z).toBeGreaterThan(0);
      expect(built.railSegments.every(({ a, b }) => a[2] < 0 && b[2] < 0)).toBe(true);
      expect(ucDavisSurface(-F, UC_DAVIS_BANK_Z1 + F)).toBeGreaterThan(-UC_DAVIS_DROP);
      expect(ucDavisSurface(-F, UC_DAVIS_WRAP_Z + F)).toBe(-UC_DAVIS_DROP);
      const facade = new Mesh(built.props, material);
      const front = new Raycaster(new Vector3(0, 6 * F, -8 * F), new Vector3(-1, 0, 0)).intersectObject(facade)[0];
      expect(front.point.x).toBeCloseTo(UC_DAVIS_BUILDING_FRONT_X + 0.12, 3);
      const pale = new Raycaster(new Vector3(0, 6 * F, 8 * F), new Vector3(-1, 0, 0)).intersectObject(facade)[0];
      const color = built.props.getAttribute('aColor');
      expect(color.getX(pale.face!.a) / color.getY(pale.face!.a)).toBeLessThan(1.1);
      expect(color.getX(front.face!.a) / color.getY(front.face!.a)).toBeGreaterThan(1.2);
      const hallway = new Raycaster(new Vector3(0, 6 * F, 0), new Vector3(-1, 0, 0), 0, -UC_DAVIS_BUILDING_BACK_X).intersectObject(facade);
      expect(hallway).toHaveLength(0);
      expect(UC_DAVIS_HALL_HALF_WIDTH).toBeGreaterThan(F);
      const pastLeftEnd = new Raycaster(new Vector3(0, 6 * F, UC_DAVIS_BUILDING_Z1 + F), new Vector3(-1, 0, 0)).intersectObject(facade);
      expect(pastLeftEnd).toHaveLength(0);
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('slopes around the left corner into one continuous low curb and side path', () => {
    const built = buildUcDavisGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    try {
      for (const x of [-40 * F, -10 * F, -3 * F, 0, 3 * F, 10 * F, 18 * F]) {
        for (const z of [17 * F, 20 * F, 24 * F, 27 * F]) {
          const y = ucDavisWrapSurface(x, z);
          if (y == null) continue;
          const hit = new Raycaster(new Vector3(x, F, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
          expect(hit, `wrapped soil at ${x / F}, ${z / F}`).toBeDefined();
          expect(Math.abs(hit.point.y - y)).toBeLessThan(0.08 * F);
        }
      }
      for (const x of [F, 8 * F, 18 * F]) {
        expect(ucDavisSurface(x, UC_DAVIS_BANK_Z1 + 1e-4)).toBeCloseTo(ucDavisSurface(x, UC_DAVIS_BANK_Z1 - 1e-4), 3);
      }
      const toe = ucDavisBankEnd(UC_DAVIS_BANK_Z1);
      for (const x of [-20 * F, -3 * F, 8 * F, 18 * F]) {
        const edge = x < 0 ? UC_DAVIS_WRAP_Z : UC_DAVIS_BANK_Z1 + UC_DAVIS_WRAP_WIDTH * Math.sqrt(1 - (x / toe) ** 2);
        const ray = new Raycaster(new Vector3(x, -UC_DAVIS_DROP + 0.2 * F, edge + F), new Vector3(0, 0, -1), 0, 3 * F);
        const hit = ray.intersectObject(mesh)[0];
        expect(hit, `continuous low curb at ${x / F} ft`).toBeDefined();
        expect(Math.abs(hit.point.z - edge)).toBeLessThan(0.05 * F);
        expect(Math.abs(hit.face!.normal.y)).toBeLessThan(0.01);
        expect(ucDavisSurface(x, edge + 0.1 * F)).toBe(-UC_DAVIS_DROP);
      }
      for (const z of [UC_DAVIS_BANK_Z1, 20 * F, UC_DAVIS_WRAP_Z]) {
        expect(ucDavisWrapSurface(UC_DAVIS_WRAP_BACK_X, z)).toBeCloseTo(UC_DAVIS_CURB_TOP, 6);
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('builds the surfaces used by flight clearance: the walk, bank, nine-flat-nine and rollout', () => {
    const built = buildUcDavisGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    const samples: [number, number][] = [
      [-3.3 * F, 0.17 * F], [-0.1 * F, 0.3 * F],
      [2.3 * F, 0], [10.7 * F, 0], [20.1 * F, 0],
      [UC_DAVIS_RUN + 0.3 * F, 0.1 * F], [UC_DAVIS_RUN + 30.3 * F, 1.2 * F],
      [(UC_DAVIS_STAIR_FLIGHT + UC_DAVIS_STAIR_MID_END) / 2, (UC_DAVIS_STAIR_Z0 + UC_DAVIS_STAIR_Z1) / 2],
    ];
    for (const start of [0, UC_DAVIS_STAIR_MID_END]) {
      for (let i = 0; i < 8; i++) samples.push([start + (i + 0.37) * UC_DAVIS_TREAD, UC_DAVIS_STAIR_Z0 + 3.2 * F]);
    }
    try {
      for (const [x, z] of samples) {
        const ray = new Raycaster(new Vector3(x, F, z), new Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh);
        expect(hits.length, `floor at ${x / F}, ${z / F}`).toBeGreaterThan(0);
        expect(hits[0].point.y, `surface at ${x / F}, ${z / F}`).toBeCloseTo(ucDavisSurface(x, z), 1);
      }
      // Both nine-riser flights are actually drawn, with the flat between.
      const p = built.ground.getAttribute('position'), n = built.ground.getAttribute('normal');
      const risers = new Set<number>();
      for (let i = 0; i < p.count; i += 3) {
        if (n.getX(i) < 0.99 || n.getY(i) !== 0) continue;
        if ([i, i + 1, i + 2].some(k => p.getZ(k) < UC_DAVIS_STAIR_Z0 - 0.01 || p.getZ(k) > UC_DAVIS_STAIR_Z1 + 0.01)) continue;
        const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
        if (Math.abs(Math.max(...ys) - Math.min(...ys) - UC_DAVIS_RISER) < 0.01) risers.add(Math.round(p.getX(i) * 100));
      }
      expect(risers.size).toBe(18);
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('keeps the geometry finite and within the landmark mobile budget', () => {
    const built = buildUcDavisGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        vertices += geometry.getAttribute('position').count;
        for (const name of ['position', 'normal', 'aCorner', 'aColor']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('aCorner').array).every(value => value === 0)).toBe(true);
      }
      expect(vertices).toBeLessThan(150_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('films both stances from above the terrain and keeps the rider and board in shot', () => {
    const spot = new UcDavis3D();
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
            expect(view.eye[1] / SET_SCALE, `${tripod} eye at ${t}`).toBeGreaterThan(ucDavisSurface(x, z));
            const points = [frame.rig.head.at(0, -30, 0)];
            for (const wheel of [-WHEEL_X, WHEEL_X]) points.push(frame.rig.board.point({ x: wheel, y: WHEEL_Y + WHEEL_R, z: WHEEL_Z }));
            for (const point of points) {
              const p = view.cam.project(point);
              expect(p.x, `${tripod}/${aspect} x at ${t}`).toBeGreaterThan(view.box.x);
              expect(p.x).toBeLessThan(view.box.x + view.box.width);
              expect(p.y, `${tripod}/${aspect} y at ${t}`).toBeGreaterThan(view.box.y);
              expect(p.y).toBeLessThan(view.box.y + view.box.height);
            }
          }
        }
      }
    } finally { spot.dispose(); }
  });

  it('keeps the fixed filmers’ view of takeoff and landing free of scenery', () => {
    const spot = new UcDavis3D(), built = buildUcDavisGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const meshes = [new Mesh(built.ground, material), new Mesh(built.props, material)];
    try {
      const plan = attempt();
      for (const tripod of ['bottom', 'side', 'top'] as const) {
        for (const t of [plan.stairs!.pop - 0.2, plan.stairs!.pop, (plan.stairs!.pop + plan.stairs!.land) / 2, plan.stairs!.land]) {
          const frame = stageFrame(plan, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
          const eye = new Vector3((view.eye[0] + frame.scroll) / SET_SCALE, view.eye[1] / SET_SCALE, (view.eye[2] + frame.stairs!.across) / SET_SCALE);
          for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
            // A filmer below the lip can see the rider approaching, but the
            // walk's edge naturally conceals the board until the actual pop.
            if (t < plan.stairs!.pop && point === frame.rig.board.center) continue;
            const target = new Vector3((frame.scroll + point.x - X0) / SET_SCALE, (ASPHALT - point.y) / SET_SCALE, (frame.stairs!.across + point.z) / SET_SCALE);
            const direction = target.sub(eye);
            const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 2);
            expect(ray.intersectObjects(meshes), `${tripod} occluded at ${t.toFixed(2)}`).toHaveLength(0);
          }
        }
      }
    } finally { spot.dispose(); material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });
});
