import { add3, dot3, norm3, scale3, sub3 } from '../scene/math';
import type { ArmRig, Rig } from '../scene/skeleton';

/**
 * The robot's rig worn by a person. The rig is built for a toy with stubby
 * arms set wide on a boxy chest (UPPER_ARM 13, FOREARM 12, shoulders 17 off
 * the spine). A person's arms hang to mid-thigh from shoulders set in
 * narrower. Everything else — hips, legs, feet, the board, the torso and
 * head frames — is the rig as solved, so the trick is the same trick.
 *
 * The arms keep the rig's pose exactly: each bone points the way the rig
 * points it, only longer, from a shoulder moved in along the chest and down
 * a little.
 */

/** Shoulder joint to elbow, and elbow to wrist (world units). */
export const HUMAN_UPPER_ARM = 19;
export const HUMAN_FOREARM = 17;
/** How far the shoulder joints sit off the spine, and below the robot's: a person's sit under the shoulder's top. */
export const HUMAN_SHOULDER = 13.2;
export const HUMAN_SHOULDER_DROP = 3.2;

export function humanRig(rig: Rig): Rig {
  const arms = rig.arms.map((arm): ArmRig => {
    const upper = norm3(sub3(arm.elbow, arm.shoulder));
    const fore = norm3(sub3(arm.hand, arm.elbow));
    const across = dot3(sub3(arm.shoulder, rig.torso.origin), rig.torso.side);
    const inward = scale3(rig.torso.side, Math.sign(across) * HUMAN_SHOULDER - across);
    const shoulder = add3(add3(arm.shoulder, inward), scale3(rig.torso.up, -HUMAN_SHOULDER_DROP));
    const elbow = add3(shoulder, scale3(upper, HUMAN_UPPER_ARM));
    return { ...arm, shoulder, elbow, hand: add3(elbow, scale3(fore, HUMAN_FOREARM)) };
  }) as Rig['arms'];
  return { ...rig, arms };
}
