import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT } from '../../camera/view';
import type { V3 } from '../../math';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import type { RiderStance, Stance } from '../../types';
import { planStairs, stairTrack } from '../elToro/stairs';
import { buildLeapOfFaithGeometry, LeapOfFaith3D } from './leapOfFaith3d';
import {
  LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_LANE_Z,
  LEAP_OF_FAITH_BEND_DEGREES, LEAP_OF_FAITH_BEND_LENGTH, LEAP_OF_FAITH_LOWER_RUN, LEAP_OF_FAITH_LOWER_STEPS, leapOfFaithStairPoint,
  LEAP_OF_FAITH_MID_DROP, LEAP_OF_FAITH_MID_END_Z, LEAP_OF_FAITH_POP_X,
  LEAP_OF_FAITH_POP_Z, LEAP_OF_FAITH_RUN, LEAP_OF_FAITH_STAIR_END_Z,
  LEAP_OF_FAITH_STAIR_RUN, LEAP_OF_FAITH_STAIR_X0, LEAP_OF_FAITH_STEPS,
  LEAP_OF_FAITH_STAIR_WIDTH, LEAP_OF_FAITH_TERRAIN, LEAP_OF_FAITH_TREAD, leapOfFaithGuardTop,
  leapOfFaithStairGround, leapOfFaithSurface,
} from './leapOfFaithLayout';

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const attempt = (base = 'Kickflip', stance: Stance = 'regular', riderStance: RiderStance = 'regular', popHeight = 0.45) => planStage(
  { id: base, name: base, base, stance },
  { set: 'leap-of-faith', landed: true, riderStance, style: resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 }), skater: 'realistic', fall: 'slam', shankProgress: 0.65 },
);
const inSet = (frame: StageFrame, point: V3) => ({ x: frame.scroll + point.x - X0, y: ASPHALT - point.y, z: frame.stairs!.across + point.z });

describe('Leap of Faith: the original Point Loma courtyard', () => {
  it('uses the requested decimal 14.3 ft and rolls in on the upper landing', () => {
    expect(LEAP_OF_FAITH_DROP / F).toBeCloseTo(14.3, 12);
    expect(LEAP_OF_FAITH_DROP / F * 0.3048).toBeCloseTo(4.35864, 10);
    expect(leapOfFaithSurface(LEAP_OF_FAITH_POP_X, LEAP_OF_FAITH_POP_Z)).toBe(0);
    expect(leapOfFaithSurface(LEAP_OF_FAITH_RUN, LEAP_OF_FAITH_LANE_Z)).toBe(-LEAP_OF_FAITH_DROP);
    for (const popHeight of [0.45, 1.15]) {
      const plan = planStairs({ popHeight }, true, LEAP_OF_FAITH_TERRAIN);
      for (let t = 0; t <= plan.pop; t += 1 / 60) {
        const p = stairTrack(plan, t, 0);
        expect(leapOfFaithSurface(p.x, p.z), `runup t=${t}`).toBe(0);
      }
    }
  });

  it('turns the stair 90° off the end of the walkway and pops at its head', () => {
    // The walkway rail runs along x = 0; the stair's bay-side rail leaves its
    // end square to it, straight out toward the court, then turns along the facade.
    const top = leapOfFaithStairPoint(0, 0), foot = leapOfFaithStairPoint(0, LEAP_OF_FAITH_STAIR_RUN);
    expect(top.x).toBeCloseTo(0, 9);
    expect(top.z).toBeCloseTo(0, 9);
    expect(foot.x).toBeCloseTo(LEAP_OF_FAITH_STAIR_RUN, 9);
    expect(foot.z).toBeCloseTo(0, 9);
    const lowerStart = leapOfFaithStairPoint(0, LEAP_OF_FAITH_MID_END_Z), lowerEnd = leapOfFaithStairPoint(0, LEAP_OF_FAITH_STAIR_END_Z);
    expect(lowerEnd.x - lowerStart.x).toBeCloseTo(0, 9);
    expect(lowerEnd.z - lowerStart.z).toBeCloseTo(LEAP_OF_FAITH_LOWER_RUN, 9);
    // The pop is on the head of the stairs, a step behind the top nosing.
    expect(LEAP_OF_FAITH_POP_X).toBeLessThan(0);
    expect(LEAP_OF_FAITH_POP_X).toBeGreaterThan(-4 * F);
    expect(LEAP_OF_FAITH_POP_Z).toBeGreaterThan(0);
    expect(LEAP_OF_FAITH_POP_Z).toBeLessThan(LEAP_OF_FAITH_STAIR_WIDTH);
    // Over the stair rail, into the open drop in front of the undercroft.
    expect(LEAP_OF_FAITH_LANE_Z).toBeLessThan(-2 * F);
    expect(leapOfFaithSurface(LEAP_OF_FAITH_STAIR_RUN / 2, -2 * F)).toBe(-LEAP_OF_FAITH_DROP);
  });

  it('builds real steps and a square landing turn, with one court floor', () => {
    const built = buildLeapOfFaithGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    const floorAt = (x: number, z: number) => new Raycaster(new Vector3(x, 2 * F, z), new Vector3(0, -1, 0)).intersectObject(mesh).map(hit => hit.point.y);
    try {
      for (let k = 0; k < LEAP_OF_FAITH_STEPS - 1; k++) {
        const s = (k + 0.43) * LEAP_OF_FAITH_TREAD;
        const p = leapOfFaithStairPoint(LEAP_OF_FAITH_STAIR_X0 / 2 + 0.7, s);
        expect(floorAt(p.x, p.z)[0]).toBeCloseTo(leapOfFaithStairGround(s), 3);
        expect(leapOfFaithSurface(p.x, p.z)).toBe(leapOfFaithStairGround(s));
      }
      expect(LEAP_OF_FAITH_BEND_DEGREES).toBe(90);
      for (const across of [-8 * F, -4.5 * F, -F]) {
        for (const fraction of [0.17, 0.38, 0.64, 0.87]) {
          const p = leapOfFaithStairPoint(across, LEAP_OF_FAITH_STAIR_RUN + fraction * LEAP_OF_FAITH_BEND_LENGTH);
          expect(floorAt(p.x, p.z)[0]).toBeCloseTo(-LEAP_OF_FAITH_MID_DROP, 3);
          expect(leapOfFaithSurface(p.x, p.z)).toBe(-LEAP_OF_FAITH_MID_DROP);
        }
        for (let k = 0; k < LEAP_OF_FAITH_LOWER_STEPS - 1; k++) {
          const distance = LEAP_OF_FAITH_MID_END_Z + (k + 0.43) * LEAP_OF_FAITH_LOWER_RUN / (LEAP_OF_FAITH_LOWER_STEPS - 1);
          const p = leapOfFaithStairPoint(across, distance);
          expect(floorAt(p.x, p.z)[0]).toBeCloseTo(leapOfFaithStairGround(distance), 3);
          expect(leapOfFaithSurface(p.x, p.z)).toBeCloseTo(leapOfFaithStairGround(distance), 6);
        }
      }
      // The balcony's plane has not been rotated with the stair wing.
      expect(floorAt(-4 * F, -4 * F)[0]).toBeCloseTo(0, 4);
      expect(leapOfFaithStairGround(LEAP_OF_FAITH_STAIR_END_Z)).toBe(-LEAP_OF_FAITH_DROP);
      for (const [x, z] of [[LEAP_OF_FAITH_RUN + 0.37 * F, LEAP_OF_FAITH_LANE_Z], [28.7 * F, -9.3 * F], [60.3 * F, 0.73 * F]]) {
        const floors = floorAt(x, z).filter(y => y <= -LEAP_OF_FAITH_DROP + 0.01);
        expect(floors).toHaveLength(1);
        expect(floors[0]).toBeCloseTo(-LEAP_OF_FAITH_DROP, 3);
      }
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        for (const name of ['position', 'normal', 'aCorner']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('aCorner').array).every(value => value === 0)).toBe(true);
        vertices += geometry.getAttribute('position').count;
      }
      expect(vertices).toBeLessThan(180_000);
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('clears the actual mesh guardrail with wheels, deck and feet for spinning and flipping tricks', () => {
    let minimum = Infinity;
    let crossings = 0;
    const failures: string[] = [];
    for (const base of ['Ollie', 'Kickflip', 'Heelflip', '360 Flip', 'Frontside 180', 'Backside 360 Kickflip', 'Impossible']) {
      for (const stance of STANCES) for (const rider of RIDERS) for (const pop of [0.45, 1.15]) {
        const stage = attempt(base, stance, rider, pop);
        const { pop: takeoff, land } = stage.stairs!;
        for (let t = takeoff; t < land; t += 1 / 90) {
          const frame = stageFrame(stage, t, 1);
          const points: { p: V3; below: number }[] = [];
          for (const x of [-WHEEL_X, WHEEL_X]) for (const z of [-WHEEL_Z, WHEEL_Z]) points.push({ p: frame.rig.board.point({ x, y: WHEEL_Y, z }), below: WHEEL_R });
          for (const x of [-42, 0, 42]) for (const z of [-10, 10]) points.push({ p: frame.rig.board.point({ x, y: 0, z }), below: 1 });
          for (const leg of frame.rig.legs) points.push({ p: leg.ankle, below: 4 }, { p: leg.knee, below: 4 });
          for (const { p, below } of points) {
            const at = inSet(frame, p);
            const top = leapOfFaithGuardTop(at.x, at.z, 4);
            if (top == null) continue;
            const clearance = at.y - below - top;
            crossings++;
            minimum = Math.min(minimum, clearance);
            if (clearance < 0.2 * F) failures.push(`${base}/${stance}/${rider}/${pop} t=${t.toFixed(2)} gap=${(clearance / F).toFixed(2)}ft at ${(at.x / F).toFixed(2)},${(at.z / F).toFixed(2)} below=${below}`);
          }
        }
      }
    }
    expect(crossings).toBeGreaterThan(100);
    expect(failures.slice(0, 15)).toEqual([]);
    expect(minimum / F).toBeGreaterThan(0.2);
  }, 120_000);

  it('keeps rider and board inside each camera frame through the deep drop', () => {
    const spot = new LeapOfFaith3D();
    try {
      for (const rider of RIDERS) {
        const stage = attempt('Kickflip', 'regular', rider);
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) {
          const times = [...Array.from({ length: Math.ceil(stage.end * 20) + 1 }, (_, i) => Math.min(stage.end, i / 20)), stage.stairs!.pop, stage.stairs!.pop + 0.01, stage.stairs!.land];
          for (const t of times) {
            const frame = stageFrame(stage, t, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, tripod)!;
            expect(view.eye.every(Number.isFinite)).toBe(true);
            const eyeFloor = leapOfFaithSurface(view.eye[0] + frame.scroll, view.eye[2] + frame.stairs!.across);
            expect(view.eye[1], `${tripod} camera below the rebuilt surface`).toBeGreaterThan(eyeFloor);
            for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
              const p = view.cam.project(point);
              expect(p.x, `${tripod}/${rider} x at ${t.toFixed(2)}`).toBeGreaterThan(view.box.x);
              expect(p.x).toBeLessThan(view.box.x + view.box.width);
              expect(p.y, `${tripod}/${rider} y at ${t.toFixed(2)}`).toBeGreaterThan(view.box.y);
              expect(p.y).toBeLessThan(view.box.y + view.box.height);
            }
          }
        }
      }
    } finally { spot.dispose(); }
  });

  it('keeps the top filmer clear of the roof piers through the approach and pop', () => {
    const spot = new LeapOfFaith3D();
    const built = buildLeapOfFaithGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const scenery = [new Mesh(built.ground, material), new Mesh(built.props, material)];
    try {
      for (const rider of RIDERS) {
        const stage = attempt('Kickflip', 'regular', rider);
        const times = [...Array.from({ length: Math.ceil(stage.end * 30) + 1 }, (_, i) => Math.min(stage.end, i / 30)), stage.stairs!.pop, stage.stairs!.pop + 0.01, stage.stairs!.land];
        for (const t of times) {
          const frame = stageFrame(stage, t, 1);
          const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, 1.24, 'top')!;
          const eye = new Vector3(view.eye[0] + frame.scroll, view.eye[1], view.eye[2] + frame.stairs!.across);
          for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
            const p = inSet(frame, point);
            const target = new Vector3(p.x, p.y, p.z);
            const direction = target.sub(eye);
            const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 1);
            expect(ray.intersectObjects(scenery), `${rider} top filmer occluded at ${t.toFixed(2)}`).toHaveLength(0);
          }
        }
      }
    } finally { spot.dispose(); material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });
});
