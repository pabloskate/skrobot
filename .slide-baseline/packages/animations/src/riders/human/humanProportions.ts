import { smoothstep } from '../../math';
import { PERSON_SCALE, SHIN, THIGH } from '../../motion/skeleton';

/**
 * A person's proportions on the robot's rig, which humanRig grows them to:
 * a grown-up about two boards tall over the robot's board and feet, and
 * legs as roomy as relaxed pants, which the rig keeps off the board.
 */

/** How much bigger than modelled the person is, and the rig grown: hips up, and the legs' bones. */
export const HUMAN_SCALE = PERSON_SCALE;
/** How much bigger the head grows: a grown-up's head is a smaller share of them than a kid's. */
export const HUMAN_HEAD = 1.2;
/** The person's leg bones (world units). */
export const HUMAN_THIGH = THIGH * HUMAN_SCALE;
export const HUMAN_SHIN = SHIN * HUMAN_SCALE;
/** Shoulder joint to elbow, and elbow to wrist, as modelled. */
export const HUMAN_UPPER_ARM = 19;
export const HUMAN_FOREARM = 17;

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
 * Legs in pants, at the person's size (world units): room in the thigh, then
 * slimmer down the shin to the ankle, and a hem breaking over the shoe. The
 * rig tucks the feet to clear a board as thick as the robot's legs; where
 * these roomier legs would still take it, humanRig swings the knee aside.
 */
const PANT_RADII = { hip: 10.9, knee: 7.8, ankle: 5.6 } as const;
const PANT_HEM = 3.6;
const thighProfile = profile([[0, PANT_RADII.hip], [0.35, 10.4], [0.75, 9.1], [1, PANT_RADII.knee]]);
const shinProfile = profile([[0, PANT_RADII.knee], [1, PANT_RADII.ankle], [1 + (PANT_HEM / HUMAN_SHIN) * 0.5, 5.9], [1 + PANT_HEM / HUMAN_SHIN, 6.1]]);
/** A leg's radius by distance down the thigh from the hip. */
export const thighRadius = (along: number) => thighProfile(along / HUMAN_THIGH);
/** A leg's radius by distance down the shin from the knee (to HUMAN_SHIN at the ankle, then the hem). */
export const shinRadius = (along: number) => shinProfile(along / HUMAN_SHIN);
