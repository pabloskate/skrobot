import { describe, expect, it } from 'vitest';
import { computeFrame, specFor, FLIP_T, ROLL_IN } from '../../motion/trick';
import { add3, dot3, norm3, scale3, sub3, type V3 } from '../../math';
import { solveRig } from '../../motion/rig';
import { TIP_X } from '../../board/deck';
import { resolveSkateStyle } from '../../motion/style';
import { resolveRiderMechanics } from '../../motion/stance';
import type { Robot, Stance, Trick } from '../../types';
import { capsuleIntersectsBoard } from '../../board/boardCollision';
import { clearFeet } from '../../board/footContact';
import { HUMAN_FOREARM, HUMAN_SCALE, HUMAN_SHIN, HUMAN_THIGH, HUMAN_UPPER_ARM, shinRadius, thighRadius } from './humanProportions';
import { humanRig } from './humanRig';
import { onTheGround, planStage, stageFrame } from '../../stage/stage';

/**
 * A person rides the robot's rig: the same trick, frame for frame, in a
 * grown-up's body. These pin that the board and feet are the robot's
 * exactly, with the person standing taller over them, and that a person's
 * legs — roomier than the robot's — still never take the board, through
 * every flip, shuv, and spin in every stance.
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

describe('person rig', () => {
  it('skates exactly the robot\'s trick: same board and feet, the body grown over them, arms pointing the same way', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    for (const trick of TRICKS) {
      const options = { landed: true, riderStance: 'goofy' as const, style, fall: 'slam' as const, shankProgress: 0.65 };
      const robotStage = planStage(trick, options);
      const humanStage = planStage(trick, { ...options, skater: 'realistic' });
      for (let i = 0; i <= 12; i++) {
        const t = (robotStage.end * i) / 12;
        const a = stageFrame(robotStage, t, 1).rig;
        const b = stageFrame(humanStage, t, 1).rig;
        expect(b.board.center).toEqual(a.board.center);
        for (const [k, leg] of b.legs.entries()) {
          const was = a.legs[k];
          expect([leg.ankle, leg.shoe.origin, leg.shoe.fwd]).toEqual([was.ankle, was.shoe.origin, was.shoe.fwd]);
          // A person's leg, whole, from higher hips to the same ankle.
          expect(len(leg.hip, leg.knee)).toBeCloseTo(HUMAN_THIGH, 6);
          expect(len(leg.knee, leg.ankle)).toBeCloseTo(HUMAN_SHIN, 6);
        }
        expect([b.torso.fwd, b.torso.up, b.head.fwd, b.head.up]).toEqual([a.torso.fwd, a.torso.up, a.head.fwd, a.head.up]);
        for (const [k, arm] of b.arms.entries()) {
          const was = a.arms[k];
          expect(len(arm.shoulder, arm.elbow)).toBeCloseTo(HUMAN_UPPER_ARM * HUMAN_SCALE, 6);
          expect(len(arm.elbow, arm.hand)).toBeCloseTo(HUMAN_FOREARM * HUMAN_SCALE, 6);
          expect(dot3(norm3(sub3(arm.elbow, arm.shoulder)), norm3(sub3(was.elbow, was.shoulder)))).toBeCloseTo(1, 6);
          expect(dot3(norm3(sub3(arm.hand, arm.elbow)), norm3(sub3(was.hand, was.elbow)))).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it('stands about two boards tall over the deck, where the robot stands one and a half', () => {
    const style = resolveSkateStyle(robot.skateStyle);
    const trick = TRICKS[0];
    const options = { landed: true, riderStance: 'regular' as const, style, fall: 'slam' as const, shankProgress: 0.65 };
    const robotRig = stageFrame(planStage(trick, options), -0.5, 1).rig;
    const humanRig = stageFrame(planStage(trick, { ...options, skater: 'realistic' }), -0.5, 1).rig;
    const board = 2 * TIP_X;
    // Crown over the deck: about 6 over the head frame, for the robot's head box and a person's skull alike.
    const crown = (rig: typeof robotRig) => rig.board.center.y - rig.head.origin.y + 6;
    expect(crown(robotRig) / board).toBeLessThan(1.45);
    expect(crown(humanRig) / board).toBeGreaterThan(1.75);
    expect(crown(humanRig) / board).toBeLessThan(2.1);
  });

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
      'Inward Heelflip', 'Pressure Flip', 'Dolphin Flip', '360 Flip', 'Laser Flip', '360 Hardflip',
      '360 Inward Heelflip', 'Pop Shuvit',
      'Frontside Shuvit', 'Late Backside Shuvit', 'Late Frontside Shuvit', 'Late Kickflip', '360 Shuvit',
      'Bigspin', 'Bigspin Flip', 'Backside Flip', 'Frontside Flip', 'Backside 360 Kickflip', 'Ghetto Bird', 'Impossible',
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
    const through: string[] = [];
    for (const base of BASES) {
      for (const stance of STANCES) {
        const mechanics = resolveRiderMechanics('regular', stance);
        const spec = specFor({ id: base, name: base, base, stance });
        for (let t = ROLL_IN - 0.15; t <= ROLL_IN + FLIP_T; t += 1 / 60) {
          const rig = humanRig(clearFeet(onTheGround(solveRig(computeFrame(t, spec, true, 'slam', 0.65, style), spec, mechanics, style, 'landed'))));
          for (const leg of rig.legs) {
            const parts = [
              ...chain(leg.hip, leg.knee, HUMAN_THIGH, thighRadius),
              ...chain(leg.knee, leg.ankle, HUMAN_SHIN, shinRadius),
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
