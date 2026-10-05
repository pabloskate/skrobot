import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { cameraLift } from '../camera/camera';
import { barSpan, grindCameraLift, grindStreetDist } from '../motion/grind';
import { SHIN, THIGH, type Frame3 } from '../motion/skeleton';
import { resolveSkateStyle } from '../motion/style';
import type { RiderStance, Robot, Trick } from '../types';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../board/board';
import { solveGrindRig } from '../motion/grindRig';
import { dot3, sub3, type V3 } from '../math';
import { deckTopY, TIP_X } from '../board/deck';
import { shoeGeometries } from '../riders/shoe3d';
import { boardHalfWidth } from '../board/boardDimensions';
import { solveRig } from '../motion/rig';
import { GROUND, computeFrame } from '../motion/trick';
import { planStage, stageFrame } from './stage';
import { dirToThree, toThree, type Vec3 } from '../camera/view';

const robot: Robot = {
  id: 'shifty',
  name: 'Swivel',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
  skateStyle: { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 },
};

const TRICKS: Trick[] = [
  'Ollie',
  'Kickflip',
  'Frontside 180',
  'Frontside 50-50 Grind',
  'Backside Smith Grind',
  'Kickflip into Backside Boardslide',
  'Backside 180 into Frontside Nosegrind',
].map((base) => ({ id: base, name: base, base, stance: 'regular' as const }));

describe('TrickScene3D stage', () => {
  it('layers the pick-reel head pose over cruising without changing the trick or camera in either rider stance', () => {
    for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
      const stage = planStage(TRICKS[0], { landed: true, riderStance, style: resolveSkateStyle(robot.skateStyle), fall: 'slam', shankProgress: 0.65 });
      const cruise = stageFrame(stage, -1, 1);
      const reading = stageFrame(stage, -1, 1, { pitch: 18, roll: 6, expression: 'happy' });
      expect(reading.rig.head.fwd).not.toEqual(cruise.rig.head.fwd);
      expect(reading.rig.torso.origin).toEqual(cruise.rig.torso.origin);
      expect(reading.rig.board.center).toEqual(cruise.rig.board.center);
      expect(reading.rig.board.flipDeg).toBe(cruise.rig.board.flipDeg);
      const legPositions = (frame: typeof cruise) => frame.rig.legs.map(({ hip, knee, ankle }) => ({ hip, knee, ankle }));
      expect(legPositions(reading)).toEqual(legPositions(cruise));
      expect(reading.lift).toBe(cruise.lift);
      expect(reading.scroll).toBe(cruise.scroll);
      expect(reading.wheels).toEqual(cruise.wheels);
      expect(reading.expression).toBe('happy');
    }
  });

  it('builds the shoe outside out: drawn inside out, its near wall is culled and the shin shows through it', () => {
    const { sole, upper } = shoeGeometries();
    for (const geometry of [sole, upper]) {
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new Vector3());
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      let inward = 0;
      for (let i = 0; i < position.count; i++) {
        const out = (position.getX(i) - center.x) * normal.getX(i) + (position.getY(i) - center.y) * normal.getY(i) + (position.getZ(i) - center.z) * normal.getZ(i);
        if (out < 0) inward++;
      }
      geometry.dispose();
      expect(inward).toBe(0);
    }
  });

  it('keeps the drawn soles above the curved grip throughout a grind pop in both stances', () => {
    const { sole, upper } = shoeGeometries();
    const vertices = sole.getAttribute('position');
    let worst = 0;
    for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
      const stage = planStage(TRICKS[3], { landed: true, riderStance, style: resolveSkateStyle(robot.skateStyle), fall: 'slam', shankProgress: 0.65 });
      for (let t = 0; t < stage.end; t += 1 / 60) {
        const { rig } = stageFrame(stage, t, 1);
        const along = rig.board.dir({ x: 1, y: 0, z: 0 });
        const across = rig.board.dir({ x: 0, y: 0, z: 1 });
        const down = rig.board.dir({ x: 0, y: 1, z: 0 });
        for (const leg of rig.legs) {
          for (let i = 0; i < vertices.count; i += 9) {
            const rel = sub3(leg.shoe.at(vertices.getX(i), vertices.getY(i), vertices.getZ(i)), rig.board.center);
            const x = dot3(rel, along);
            if (Math.abs(x) >= TIP_X || Math.abs(dot3(rel, across)) > boardHalfWidth(x)) continue;
            worst = Math.max(worst, dot3(rel, down) - deckTopY(x));
          }
        }
      }
    }
    sole.dispose();
    upper.dispose();
    expect(worst).toBeLessThan(0.3);
  });

  it('lifts the crane with the pop and lays the bar out in street distance, as the camera and grind plans say', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    let worst = 0;
    for (const trick of TRICKS) {
      for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
        const stage = planStage(trick, { landed: true, riderStance, style, fall: 'slam', shankProgress: 0.65 });
        for (let i = 0; i <= 12; i++) {
          const t = (stage.end * i) / 12;
          const frame = stageFrame(stage, t, 1);
          if (stage.grind) {
            const { frame: grind } = solveGrindRig(t, stage.grind, stage.mechanics, style);
            worst = Math.max(worst, Math.abs(frame.lift - grindCameraLift(stage.grind, t, grind.rail, 0)));
            worst = Math.max(worst, Math.abs(frame.span!.x0 - barSpan(stage.grind, grindStreetDist(t, stage.grind)).x0));
          } else {
            const f = computeFrame(t, stage.spec, true, 'slam', 0.65, style);
            worst = Math.max(worst, Math.abs(frame.lift - cameraLift(f.motion.flight, style.popHeight, GROUND - frame.rig.head.origin.y, false)));
            expect(frame.span).toBeNull();
          }
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });

  it('poses every part with a proper rotation, so no mesh is drawn mirrored', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const handed = (x: Vec3, y: Vec3, z: Vec3) =>
      (x[1] * y[2] - x[2] * y[1]) * z[0] + (x[2] * y[0] - x[0] * y[2]) * z[1] + (x[0] * y[1] - x[1] * y[0]) * z[2];
    const frameHanded = (f: Frame3) => handed(dirToThree(f.fwd), dirToThree(f.up), dirToThree(f.side));
    let worst = Infinity;
    for (const trick of TRICKS) {
      const stage = planStage(trick, { landed: true, riderStance: 'goofy', style, fall: 'slam', shankProgress: 0.65 });
      for (let i = 0; i <= 24; i++) {
        const { rig } = stageFrame(stage, (stage.end * i) / 24, 1);
        const b = rig.board;
        worst = Math.min(
          worst,
          frameHanded(rig.torso),
          frameHanded(rig.head),
          ...rig.legs.map((leg) => frameHanded(leg.shoe)),
          handed(dirToThree(b.dir({ x: 1, y: 0, z: 0 })), dirToThree(b.dir({ x: 0, y: -1, z: 0 })), dirToThree(b.dir({ x: 0, y: 0, z: 1 }))),
        );
      }
    }
    expect(worst).toBeGreaterThan(0.999);
  });

  it('rolls on its wheels: they meet the asphalt riding and never sink into it', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    let deepest = Infinity;
    let restingGap = 0;
    for (const trick of TRICKS) {
      const stage = planStage(trick, { landed: true, riderStance: 'regular', style, fall: 'slam', shankProgress: 0.65 });
      for (let i = 0; i <= 60; i++) {
        const t = (stage.end * i) / 60;
        const { rig } = stageFrame(stage, t, 1);
        let lowest = Infinity;
        for (const tx of [-WHEEL_X, WHEEL_X]) {
          for (const wz of [-WHEEL_Z, WHEEL_Z]) {
            for (let k = 0; k < 32; k++) {
              const a = (k / 32) * Math.PI * 2;
              const rim = rig.board.point({ x: tx + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z: wz });
              lowest = Math.min(lowest, toThree(rim)[1]);
            }
          }
        }
        deepest = Math.min(deepest, lowest);
        // Rolling in, before anything pops.
        if (t < 0.3) restingGap = Math.max(restingGap, Math.abs(lowest));
      }
    }
    expect(restingGap).toBeLessThan(0.05);
    expect(deepest).toBeGreaterThan(-0.05);
  });

  it('takes a board out of the asphalt with the knees, leaving the body where the rig solver puts it', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const gap = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    let bodyOff = 0;
    let boneOff = 0;
    for (const trick of TRICKS) {
      const stage = planStage(trick, { landed: true, riderStance: 'regular', style, fall: 'slam', shankProgress: 0.65 });
      // Every displayed frame and then some. (The tail strike tips the board
      // up as it rises, so a pop rarely sinks the tail any more.)
      for (let t = 0; t <= stage.end; t += 1 / 120) {
        const shared = stage.grind
          ? solveGrindRig(t, stage.grind, stage.mechanics, style).rig
          : solveRig(computeFrame(t, stage.spec, true, 'slam', 0.65, style), stage.spec, stage.mechanics, style, 'landed');
        const { rig } = stageFrame(stage, t, 1);
        bodyOff = Math.max(
          bodyOff,
          gap(shared.head.origin, rig.head.origin),
          gap(shared.torso.origin, rig.torso.origin),
          ...rig.legs.map((leg, i) => gap(shared.legs[i].hip, leg.hip)),
          ...rig.arms.map((arm, i) => gap(shared.arms[i].hand, arm.hand)),
        );
        for (const leg of rig.legs) boneOff = Math.max(boneOff, Math.abs(gap(leg.hip, leg.knee) - THIGH), Math.abs(gap(leg.knee, leg.ankle) - SHIN));
      }
    }
    expect(bodyOff).toBeLessThan(1e-9);
    expect(boneOff).toBeLessThan(1e-6);
  });
});
