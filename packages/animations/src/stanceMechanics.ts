import type { BodySide, RiderStance, Stance } from './types';

export interface RiderMechanics {
  /** World-space toeside: +1 points toward the camera, -1 points away. */
  orientationSign: 1 | -1;
  /** Awkward full-body turn reserved for switch; the board/world are never mirrored. */
  bodyYawDegrees: 0 | 180;
  /** Anatomical foot occupying the board's canonical +x / nose-side channel. */
  noseFoot: BodySide;
  /** Anatomical foot occupying the board's canonical -x / tail-side channel. */
  tailFoot: BodySide;
  /** Anatomical arm carried toward the nose/front of the riding stance. */
  frontArm: BodySide;
  /** Anatomical arm carried toward the tail/back of the riding stance. */
  backArm: BodySide;
  /** World travel direction. Fakie alone reverses it. */
  travelDirection: 1 | -1;
  /** Anatomical foot responsible for the pop in this trick stance. */
  popFoot: BodySide;
  /** Anatomical foot responsible for the flick/leveling motion. */
  flickFoot: BodySide;
}

export interface RawTrickRotation {
  flipDeg: number;
  yawDeg: number;
  bodyYawDeg: number;
}

export interface OrientedTrickRotation {
  flipDeg: number;
  yawDeg: number;
  bodyYawDeg: number;
}

const opposite = (side: BodySide): BodySide => side === 'left' ? 'right' : 'left';

/**
 * Resolve a rider's anatomical mechanics without transforming the world.
 *
 * Rider stance and trick stance are deliberately orthogonal:
 * - regular/goofy chooses the natural leading foot;
 * - fakie reverses travel only;
 * - nollie moves the pop to the nose only;
 * - switch reverses the rider's anatomical orientation only.
 */
export function resolveRiderMechanics(
  riderStance: RiderStance,
  trickStance: Stance,
): RiderMechanics {
  // Natural regular/goofy stances share the forward-knee skeleton and differ
  // across its depth/toeside: regular puts the left foot at the nose, goofy
  // puts the right foot there. Switch deliberately uses the full 180-degree
  // body turn, preserving the backward-knee awkwardness as a visual cue.
  const naturalSign: 1 | -1 = riderStance === 'regular' ? 1 : -1;
  const orientationSign: 1 | -1 = trickStance === 'switch'
    ? naturalSign === 1 ? -1 : 1
    : naturalSign;
  const noseFoot: BodySide = orientationSign === 1 ? 'left' : 'right';
  const tailFoot = opposite(noseFoot);
  const nollie = trickStance === 'nollie';

  return {
    orientationSign,
    bodyYawDegrees: trickStance === 'switch' ? 180 : 0,
    noseFoot,
    tailFoot,
    // The requested silhouette carries the same-side arm with the foot at
    // that end of the stance instead of mirroring the complete drawing.
    frontArm: noseFoot,
    backArm: tailFoot,
    travelDirection: trickStance === 'fakie' ? -1 : 1,
    popFoot: nollie ? noseFoot : tailFoot,
    flickFoot: nollie ? tailFoot : noseFoot,
  };
}

/**
 * Convert trick-relative rotation into world rotation after the rider's pose
 * is established. Kickflip/heelflip and frontside/backside remain distinct;
 * switch also receives its intentionally awkward body yaw.
 */
export function orientTrickRotation(
  mechanics: RiderMechanics,
  rotation: RawTrickRotation,
): OrientedTrickRotation {
  return {
    flipDeg: mechanics.orientationSign * rotation.flipDeg,
    yawDeg: -mechanics.orientationSign * rotation.yawDeg,
    bodyYawDeg: mechanics.bodyYawDegrees - mechanics.orientationSign * rotation.bodyYawDeg,
  };
}
