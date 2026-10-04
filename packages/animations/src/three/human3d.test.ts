import { describe, expect, it } from 'vitest';
import { computeFrame, specFor, FLIP_T, ROLL_IN } from '../TrickAnimation';
import { add3, dot3, norm3, scale3, sub3, type V3 } from '../scene/math';
import { solveRig } from '../scene/rig';
import { SHIN, THIGH } from '../scene/skeleton';
import { resolveSkateStyle } from '../skateStyle';
import { resolveRiderMechanics } from '../stanceMechanics';
import type { Robot, Stance, Trick } from '../types';
import { DoubleSide, Matrix4, Mesh, type BufferGeometry, type Material } from 'three';
import { capsuleIntersectsBoard } from './boardCollision';
import { Human3D } from './human3d';
import { clearFeet } from './footContact';
import { TEE, shinRadius, thighRadius } from './humanGeometry';
import { dirToThree, toThree } from './view';
import { HUMAN_FOREARM, HUMAN_UPPER_ARM, humanRig } from './humanRig';
import { onTheGround, planStage, stageFrame } from './stage';
import { stageView } from './view';

/**
 * The human skater rides the robot's rig: the same trick, frame for frame,
 * in a different body. These pin that the body only changes the arms, and
 * that the pants — roomier than the robot's legs — still never take the
 * board, through every flip, shuv, and spin in every stance.
 */

const robot: Robot = {
  id: 'shifty',
  name: 'Swivel',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
  skateStyle: { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 },
};

const TRICKS: Trick[] = [
  'Ollie', 'Kickflip', '360 Flip', 'Backside 180', 'Frontside 50-50 Grind', 'Kickflip into Backside Boardslide',
  'Backside 180 into Frontside Nosegrind', 'Backside Smith Grind Kickflip Out',
].map((base) => ({ id: base, name: base, base, stance: 'regular' as const }));

const len = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('human skater', () => {
  it('skates exactly the robot\'s trick: same board, feet, legs, torso, and head, longer arms pointing the same way', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    for (const trick of TRICKS) {
      const options = { landed: true, riderStance: 'goofy' as const, style, fall: 'slam' as const, shankProgress: 0.65 };
      const robotStage = planStage(robot, trick, options);
      const humanStage = planStage(robot, trick, { ...options, skater: 'human' });
      for (let i = 0; i <= 12; i++) {
        const t = (robotStage.end * i) / 12;
        const a = stageFrame(robotStage, t, 1).rig;
        const b = stageFrame(humanStage, t, 1).rig;
        expect(b.board.center).toEqual(a.board.center);
        for (const [k, leg] of b.legs.entries()) {
          const was = a.legs[k];
          expect([leg.hip, leg.knee, leg.ankle, leg.shoe.origin, leg.shoe.fwd]).toEqual([was.hip, was.knee, was.ankle, was.shoe.origin, was.shoe.fwd]);
        }
        expect(b.torso.origin).toEqual(a.torso.origin);
        expect(b.head.origin).toEqual(a.head.origin);
        for (const [k, arm] of b.arms.entries()) {
          const was = a.arms[k];
          expect(len(arm.shoulder, arm.elbow)).toBeCloseTo(HUMAN_UPPER_ARM, 6);
          expect(len(arm.elbow, arm.hand)).toBeCloseTo(HUMAN_FOREARM, 6);
          expect(dot3(norm3(sub3(arm.elbow, arm.shoulder)), norm3(sub3(was.elbow, was.shoulder)))).toBeCloseTo(1, 6);
          expect(dot3(norm3(sub3(arm.hand, arm.elbow)), norm3(sub3(was.hand, was.elbow)))).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it('builds every part outside out and poses it unmirrored, so no near wall is culled', () => {
    const signedVolume = (g: BufferGeometry) => {
      const p = g.getAttribute('position');
      const index = g.getIndex();
      const at = (i: number) => (index ? index.getX(i) : i);
      const count = index ? index.count : p.count;
      let v = 0;
      for (let i = 0; i < count; i += 3) {
        const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
        v += p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c))
          - p.getY(a) * (p.getX(b) * p.getZ(c) - p.getZ(b) * p.getX(c))
          + p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c));
      }
      return v;
    };
    const human = new Human3D();
    const stage = planStage(robot, TRICKS[2], { landed: true, riderStance: 'regular', style: resolveSkateStyle(robot.skateStyle), fall: 'slam', shankProgress: 0.65, skater: 'human' });
    for (const t of [0.2, 0.9, 1.3]) {
      human.update(stageFrame(stage, t, 1).rig, 'focus', stageView(0));
      human.group.updateMatrixWorld(true);
      let meshes = 0;
      human.group.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        meshes++;
        // Cloth left open (the tee's hem) is drawn from both sides and has no inside to wind.
        if ((o.material as Material).side !== DoubleSide) expect(signedVolume(o.geometry), o.geometry.type).toBeGreaterThan(0);
        expect(new Matrix4().copy(o.matrixWorld).determinant()).toBeGreaterThan(0.999);
      });
      expect(meshes).toBeGreaterThan(30);
    }
    human.dispose();
  });

  it('wears the tee over the pants: no leg ever comes through it, crouched, popped, grinding, or fallen', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const human = new Human3D();
    const shin = shinRadius(SHIN);
    const inside: string[] = [];
    const cases: Array<{ base: string; fall?: 'slam' | 'bail'; rider: 'regular' | 'goofy' }> = [
      { base: 'Kickflip', rider: 'regular' },
      { base: '360 Flip', rider: 'goofy' },
      { base: 'Backside 180', rider: 'regular' },
      { base: 'Varial Heelflip into Frontside 50-50 Grind', rider: 'regular' },
      { base: 'Backside Boardslide', rider: 'goofy' },
      { base: 'Kickflip', fall: 'slam', rider: 'regular' },
      { base: 'Ollie', fall: 'bail', rider: 'goofy' },
    ];
    for (const { base, fall, rider } of cases) {
      const trick = { id: base, name: base, base, stance: 'regular' as const };
      const stage = planStage(robot, trick, { landed: !fall, riderStance: rider, style, fall: fall ?? 'slam', shankProgress: 0.65, skater: 'human' });
      for (let i = 0; i <= 40; i++) {
        const t = (stage.end * i) / 40;
        const rig = stageFrame(stage, t, 1).rig;
        human.update(rig, 'focus', stageView(0));
        let tee: BufferGeometry | null = null;
        human.group.traverse((o) => {
          if (o instanceof Mesh && o.geometry.getAttribute('rest')) tee = o.geometry;
        });
        const pos = (tee as BufferGeometry | null)!.getAttribute('position');
        for (const leg of rig.legs) {
          const bones = [
            { a: toThree(leg.hip), b: toThree(leg.knee), r: (s: number) => thighRadius(s / THIGH) },
            { a: toThree(leg.knee), b: toThree(leg.ankle), r: shin },
          ];
          for (const bone of bones) {
            const u = [bone.b[0] - bone.a[0], bone.b[1] - bone.a[1], bone.b[2] - bone.a[2]];
            const length = Math.hypot(u[0], u[1], u[2]);
            let deepest = 0;
            for (let k = 0; k < pos.count; k++) {
              const p = [pos.getX(k) - bone.a[0], pos.getY(k) - bone.a[1], pos.getZ(k) - bone.a[2]];
              const s = Math.max(0, Math.min(length, (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) / length));
              const d = Math.hypot(p[0] - (u[0] * s) / length, p[1] - (u[1] * s) / length, p[2] - (u[2] * s) / length);
              deepest = Math.max(deepest, bone.r(s) - d);
            }
            if (deepest > 0.05) inside.push(`${base}${fall ? ` (${fall})` : ''} ${rider} ${leg.side} t=${t.toFixed(2)}: ${deepest.toFixed(2)} deep`);
          }
        }
      }
    }
    human.dispose();
    expect(inside.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('keeps the back of the tee down over the seat when the thighs come up', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const human = new Human3D();
    const lifted: string[] = [];
    for (const [base, rider] of [['Kickflip', 'regular'], ['Kickflip', 'goofy'], ['Backside 180', 'regular'], ['Frontside 50-50 Grind', 'goofy']] as const) {
      const trick = { id: base, name: base, base, stance: 'regular' as const };
      const stage = planStage(robot, trick, { landed: true, riderStance: rider, style, fall: 'slam', shankProgress: 0.65, skater: 'human' });
      for (let i = 0; i <= 40; i++) {
        const t = (stage.end * i) / 40;
        const rig = stageFrame(stage, t, 1).rig;
        human.update(rig, 'focus', stageView(0));
        let tee: BufferGeometry | null = null;
        human.group.traverse((o) => {
          if (o instanceof Mesh && o.geometry.getAttribute('rest')) tee = o.geometry;
        });
        const geometry = tee as BufferGeometry | null;
        const pos = geometry!.getAttribute('position');
        const rest = geometry!.getAttribute('rest');
        // Up the hips, from the hip joints and the torso's lean, as the pants are placed.
        const [l, r] = rig.legs[0].side === 'left' ? rig.legs : [rig.legs[1], rig.legs[0]];
        const across = norm3(sub3(r.hip, l.hip));
        const lean = norm3(sub3(rig.torso.up, scale3(across, dot3(rig.torso.up, across))));
        const up = dirToThree({ x: lean.x, y: lean.y, z: lean.z });
        const middle = toThree({ x: (l.hip.x + r.hip.x) / 2, y: (l.hip.y + r.hip.y) / 2, z: (l.hip.z + r.hip.z) / 2 });
        for (let k = 0; k < pos.count; k++) {
          if (rest.getY(k) > TEE.hem + 0.5 || rest.getX(k) > -5 || Math.abs(rest.getZ(k)) > 9) continue;
          const height = (pos.getX(k) - middle[0]) * up[0] + (pos.getY(k) - middle[1]) * up[1] + (pos.getZ(k) - middle[2]) * up[2];
          if (height > 2.5) lifted.push(`${base} ${rider} t=${t.toFixed(2)}: hem ${height.toFixed(1)} above the hips`);
        }
      }
    }
    human.dispose();
    expect(lifted.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('keeps each shoulder on its own side of the chest', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const spec = specFor({ id: 'k', name: 'Kickflip', base: 'Kickflip', stance: 'regular' });
    const rig = humanRig(solveRig(computeFrame(ROLL_IN + FLIP_T / 2, spec, true, 'slam', 0.65, style), spec, resolveRiderMechanics('regular', 'regular'), style, 'landed'));
    const across = (p: V3) => dot3(sub3(p, rig.torso.origin), rig.torso.side);
    const left = rig.arms.find((a) => a.side === 'left')!;
    const right = rig.arms.find((a) => a.side === 'right')!;
    expect(across(left.shoulder)).toBeLessThan(-10);
    expect(across(right.shoulder)).toBeGreaterThan(10);
  });

  it('never puts the board through the pants, from the wind-up to touchdown', () => {
    const BASES = [
      'Ollie', 'Kickflip', 'Heelflip', 'Double Kickflip', 'Varial Kickflip', 'Varial Heelflip', 'Hardflip',
      'Inward Heelflip', 'Pressure Flip', 'Dolphin Flip', '360 Flip', 'Laser Flip', 'Pop Shuvit',
      'Frontside Shuvit', 'Late Backside Shuvit', 'Late Frontside Shuvit', 'Late Kickflip', '360 Shuvit',
      'Bigspin', 'Bigspin Flip', 'Backside Flip', 'Frontside Flip', 'Backside 360 Kickflip', 'Impossible',
    ];
    const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
    const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
    // The pant legs as drawn: their radius profiles, sampled as short tapered capsules.
    const SEGMENTS = 6;
    const chain = (a: V3, b: V3, length: number, radius: (along: number) => number) => {
      const dir = norm3(sub3(b, a));
      return Array.from({ length: SEGMENTS }, (_, k) => {
        const s0 = (length * k) / SEGMENTS;
        const s1 = (length * (k + 1)) / SEGMENTS;
        return { a: add3(a, scale3(dir, s0)), b: add3(a, scale3(dir, s1)), ra: radius(s0), rb: radius(s1) };
      });
    };
    const shin = shinRadius(SHIN);
    const through: string[] = [];
    for (const base of BASES) {
      for (const stance of STANCES) {
        const mechanics = resolveRiderMechanics('regular', stance);
        const spec = specFor({ id: base, name: base, base, stance });
        for (let t = ROLL_IN - 0.15; t <= ROLL_IN + FLIP_T; t += 1 / 60) {
          const rig = clearFeet(onTheGround(solveRig(computeFrame(t, spec, true, 'slam', 0.65, style), spec, mechanics, style, 'landed')));
          for (const leg of rig.legs) {
            const parts = [
              ...chain(leg.hip, leg.knee, THIGH, (s) => thighRadius(s / THIGH)),
              ...chain(leg.knee, leg.ankle, SHIN, shin),
            ];
            if (parts.some((p) => capsuleIntersectsBoard(rig.board, p.a, p.b, p.ra, p.rb))) {
              through.push(`${base} ${stance} ${leg.side} t=${t.toFixed(3)}`);
            }
          }
        }
      }
    }
    expect(through.slice(0, 8)).toEqual([]);
  }, 60_000);
});
