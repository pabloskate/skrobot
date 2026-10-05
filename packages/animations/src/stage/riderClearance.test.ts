import { describe, expect, it } from 'vitest';
import { computeFrame, specFor, FLIP_T, ROLL_IN, TRICK_BASES } from '../motion/trick';
import { WIDEST_BOARD, LIMB_RADII } from '../motion/boardClearance';
import { solveRig } from '../motion/rig';
import { moveFrame } from '../motion/skeleton';
import { resolveSkateStyle } from '../motion/style';
import { resolveRiderMechanics } from '../motion/stance';
import type { Stance } from '../types';
import { BOARD_WIDTH_SCALE } from '../board/boardDimensions';
import { LEG_RADII, capsuleIntersectsBoard, shoeIntersectsBoard } from '../board/boardCollision';
import { clearFeet } from '../board/footContact';
import { onTheGround } from './stage';

/**
 * The board never goes through the rider. The physics places the feet
 * side-on, where a board is a line, so a deck popped steep, rolled through a
 * flip, or swung round in a shuv used to pass straight through shoes and
 * shins. The rig now makes room for it (motion/boardClearance.ts, the tuck in
 * motion/rig.ts); this checks the result the way it's drawn — the 3D board's
 * exact volume against the rider after the stage's own ground and grip
 * passes — for every trick in every stance, from the wind-up to touchdown.
 */

const BASES = TRICK_BASES;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
/** A sole may sit this far (world units) into the grip: soles rest on it, and are rounded. */
const SOLE_GRACE = 1.5;

describe('board and rider', () => {
  it('measures the board the 3D renderer draws', () => {
    expect(WIDEST_BOARD).toBe(BOARD_WIDTH_SCALE);
    expect(LIMB_RADII).toEqual(LEG_RADII);
  });

  it('never puts the board through a shoe, shin, or thigh, from the wind-up to touchdown', () => {
    const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
    const through: string[] = [];
    for (const base of BASES) {
      for (const stance of STANCES) {
        // Goofy is regular's mirror image.
        const mechanics = resolveRiderMechanics('regular', stance);
        const spec = specFor({ id: base, name: base, base, stance });
        for (let t = ROLL_IN - 0.15; t <= ROLL_IN + FLIP_T; t += 1 / 60) {
          const rig = clearFeet(onTheGround(solveRig(computeFrame(t, spec, true, 'slam', 0.65, style), spec, mechanics, style, 'landed')));
          for (const leg of rig.legs) {
            const at = `${base} ${stance} ${leg.side} t=${t.toFixed(3)}`;
            const raised = moveFrame(leg.shoe, { x: 0, y: -SOLE_GRACE, z: 0 });
            if (shoeIntersectsBoard(rig.board, raised)) through.push(`shoe: ${at}`);
            if (capsuleIntersectsBoard(rig.board, leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle)) through.push(`shin: ${at}`);
            if (capsuleIntersectsBoard(rig.board, leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee)) through.push(`thigh: ${at}`);
          }
        }
      }
    }
    expect(through.slice(0, 8)).toEqual([]);
  }, 60_000);
});
