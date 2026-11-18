import { smoothstep } from '../../math';
import { PERSON_SCALE, SHIN, THIGH } from '../../motion/skeleton';

/**
 * A person's proportions on the robot's rig, which humanRig grows them to:
 * a grown-up 5'10" tall over the robot's board and feet, and legs as roomy
 * as relaxed pants, which the rig keeps off the board.
 */

/** Ratio of adult leg length to the base trick rig’s leg length. */
export const HUMAN_SCALE = PERSON_SCALE;
/** How much bigger the head grows: a grown-up's head is a smaller share of them than a kid's. */
export const HUMAN_HEAD = HUMAN_SCALE * 0.845;
/**
 * Rest-pose joint centers measured on the shipped MakeHuman skeleton, in
 * model units. The stage physics uses these same lever arms as the mesh.
 * See the GLB measurement check in realisticHuman3d.test.ts.
 */
const MODEL_THIGH = 46.116;
const MODEL_SHIN = 44.654;
/** Stage units per unit of the skinned model. */
export const MODEL_SCALE = (THIGH + SHIN) * HUMAN_SCALE / (MODEL_THIGH + MODEL_SHIN);
export const HUMAN_THIGH = MODEL_THIGH * MODEL_SCALE;
export const HUMAN_SHIN = MODEL_SHIN * MODEL_SCALE;
export const HUMAN_HIP_HALF = 11.062 * MODEL_SCALE;
/** Shoulder joint off the hip midpoint along the chest's forward, up and side axes. */
export const HUMAN_SHOULDER = { f: 2.519 * MODEL_SCALE, u: 47.134 * MODEL_SCALE, s: 20.401 * MODEL_SCALE };
export const HUMAN_UPPER_ARM = 26.556 * MODEL_SCALE;
export const HUMAN_FOREARM = 26.966 * MODEL_SCALE;
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
