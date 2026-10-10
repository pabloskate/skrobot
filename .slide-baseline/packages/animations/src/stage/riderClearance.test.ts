import { describe, expect, it } from 'vitest';
import { computeFrame, specFor, FLIP_T, ROLL_IN, TRICK_BASES } from '../motion/trick';
import { WIDEST_BOARD, LIMB_RADII } from '../motion/boardClearance';
import { solveRig } from '../motion/rig';
import { moveFrame, type Rig } from '../motion/skeleton';
import { resolveSkateStyle } from '../motion/style';
import { resolveRiderMechanics } from '../motion/stance';
import type { RiderStance, Stance } from '../types';
import { BOARD_WIDTH_SCALE } from '../board/boardDimensions';
import { LEG_RADII, capsuleIntersectsBoard, shoeIntersectsBoard } from '../board/boardCollision';
import { clearFeet } from '../board/footContact';
import { onTheGround, planStage, stageFrame } from './stage';

/**
 * The board never goes through the rider. The physics places the feet
 * side-on, where a board is a line, so a deck popped steep, rolled through a
 * flip, or swung round in a shuv used to pass straight through shoes and
 * shins. The rig now makes room for it (motion/boardClearance.ts, the tuck in
 * motion/rig.ts); this checks the result the way it's drawn — the 3D board's
 * exact volume against the rider after the stage's own ground and grip
 * passes — for every trick in every stance, from the wind-up to touchdown,
 * and for flips and shuvs popped onto and off a bar or a handrail.
 */

const BASES = TRICK_BASES;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
/** A sole may sit this far (world units) into the grip: soles rest on it, and are rounded. */
const SOLE_GRACE = 1.5;

/** Where the board is inside a shoe, shin, or thigh of `rig`, labelled `at`. */
function through(rig: Rig, at: string): string[] {
  const found: string[] = [];
  for (const leg of rig.legs) {
    const where = `${leg.side} ${at}`;
    const raised = moveFrame(leg.shoe, { x: 0, y: -SOLE_GRACE, z: 0 });
    if (shoeIntersectsBoard(rig.board, raised)) found.push(`shoe: ${where}`);
    if (capsuleIntersectsBoard(rig.board, leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle)) found.push(`shin: ${where}`);
    if (capsuleIntersectsBoard(rig.board, leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee)) found.push(`thigh: ${where}`);
  }
  return found;
}

describe('board and rider', () => {
  it('measures the board the 3D renderer draws', () => {
    expect(WIDEST_BOARD).toBe(BOARD_WIDTH_SCALE);
    expect(LIMB_RADII).toEqual(LEG_RADII);
  });

  it('never puts the board through a shoe, shin, or thigh, from the wind-up to touchdown', () => {
    const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
    const found: string[] = [];
    for (const base of BASES) {
      for (const stance of STANCES) {
        // Goofy is regular's mirror image.
        const mechanics = resolveRiderMechanics('regular', stance);
        const spec = specFor({ id: base, name: base, base, stance });
        for (let t = ROLL_IN - 0.15; t <= ROLL_IN + FLIP_T; t += 1 / 60) {
          const rig = clearFeet(onTheGround(solveRig(computeFrame(t, spec, true, 'slam', 0.65, style), spec, mechanics, style, 'landed')));
          found.push(...through(rig, `${base} ${stance} t=${t.toFixed(3)}`));
        }
      }
    }
    expect(found.slice(0, 8)).toEqual([]);
  }, 60_000);

  it('never puts the board through the legs of a trick popped onto or off a bar or a handrail', () => {
    // The hop on wears the flatground rider, tucked around a flatground board
    // the grind doesn't draw, and the hop off the grind's own feet: both are
    // tucked again against the board as drawn (grindRig.ts hopTuck).
    const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
    const TRICKS = ['Kickflip', 'Heelflip', '360 Flip', 'Hardflip', 'Varial Heelflip', 'Bigspin Flip', 'Backside Flip', '360 Shuvit'];
    const GRINDS = ['Frontside 50-50 Grind', 'Backside 5-0 Grind', 'Backside Smith Grind', 'Frontside Feeble Grind', 'Frontside Boardslide', 'Backside Lipslide', 'Frontside Noseslide'];
    const found: string[] = [];
    for (const set of ['plaza', 'el-toro'] as const) {
      for (const rider of ['regular', 'goofy'] as RiderStance[]) {
        for (const trick of TRICKS) {
          for (const grind of GRINDS) {
            for (const out of [false, true]) {
              const base = out ? `${grind} ${trick} Out` : `${trick} into ${grind}`;
              const stage = planStage({ id: base, name: base, base, stance: 'regular' }, {
                landed: true, riderStance: rider, style, fall: 'slam', shankProgress: 0.65, set,
              });
              const plan = stage.grind!;
              const [from, to] = out ? [plan.off, plan.land] : [plan.pop, plan.lockAt];
              for (let t = from; t <= to; t += 1 / 120) {
                found.push(...through(stageFrame(stage, t, 1).rig, `${set} ${base} ${rider} t=${t.toFixed(3)}`));
              }
            }
          }
        }
      }
    }
    expect(found.slice(0, 8)).toEqual([]);
  }, 120_000);
});
