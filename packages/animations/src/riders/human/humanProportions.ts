import { smoothstep } from '../../math';
import { PERSON_SCALE, SHIN, THIGH } from '../../motion/skeleton';

/**
 * A person's proportions on the robot's rig, which humanRig grows them to:
 * a grown-up 5'10" tall over the robot's board and feet, and legs as roomy
 * as relaxed pants, which the rig keeps off the board.
 */

/** How much bigger than modelled the person is, and the rig grown: hips up, and the legs' bones. */
export const HUMAN_SCALE = PERSON_SCALE;
/** How much bigger the head grows: a grown-up's head is a smaller share of them than a kid's. */
export const HUMAN_HEAD = HUMAN_SCALE * 0.845;
/** The person's leg bones (world units). */
export const HUMAN_THIGH = THIGH * HUMAN_SCALE;
export const HUMAN_SHIN = SHIN * HUMAN_SCALE;
/**
 * The realistic person (riders/realistic) as built, hip joint to ankle, in
 * its own units (blender/build_skater.py), and how much bigger it's drawn:
 * its legs the person's. Lengths measured on the model as built are this
 * much bigger on the stage.
 */
export const MODEL_LEGS = 90.77;
export const MODEL_SCALE = (HUMAN_THIGH + HUMAN_SHIN) / MODEL_LEGS;
/** Shoulder joint to elbow, and elbow to wrist, as modelled. */
export const HUMAN_UPPER_ARM = 19;
export const HUMAN_FOREARM = 17;
/** How far a person's knees turn from the rig's toward the way their hips face: over the toes (a tuck brings them up in front of the chest). */
export const KNEE_FORWARD = 0.75;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise-linear profile through (t, value) keys, eased between them. */
function profile(keys: ReadonlyArray<readonly [number, number]>): (t: number) => number {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return lerp(v0, v1, smoothstep((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/**
 * Legs in pants, measured on the model as built (MODEL_SCALE grows them to
 * the person): room in the thigh, then slimmer down the shin to the ankle,
 * and a hem breaking over the shoe. The rig tucks the feet to clear a board
 * as thick as the robot's legs; where these roomier legs would still take
 * it, humanRig swings the knee aside.
 */
const PANT_RADII = { hip: 10.9, knee: 7.8, ankle: 5.6 } as const;
const PANT_HEM = 3.6 * MODEL_SCALE;
const thighProfile = profile([[0, PANT_RADII.hip], [0.35, 10.4], [0.75, 9.1], [1, PANT_RADII.knee]]);
const shinProfile = profile([[0, PANT_RADII.knee], [1, PANT_RADII.ankle], [1 + (PANT_HEM / HUMAN_SHIN) * 0.5, 5.9], [1 + PANT_HEM / HUMAN_SHIN, 6.1]]);
/** A leg's radius (world units) by distance down the thigh from the hip. */
export const thighRadius = (along: number) => MODEL_SCALE * thighProfile(along / HUMAN_THIGH);
/** A leg's radius (world units) by distance down the shin from the knee (to HUMAN_SHIN at the ankle, then the hem). */
export const shinRadius = (along: number) => MODEL_SCALE * shinProfile(along / HUMAN_SHIN);
