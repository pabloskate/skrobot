import type { Group, Mesh } from 'three';
import { dirToThree, toThree, type Vec3 } from '../camera/view';
import { add3, cross3, dot3, norm3, scale3, sub3 } from '../math';
import type { Frame3, Rig } from '../motion/skeleton';

/**
 * Posing a rider's meshes from the rig's frames. Every mesh keeps
 * matrixAutoUpdate off and is placed by writing its matrix directly, in
 * three's world (physics frames are y-down, so axes go through toThree).
 */

/** Cross product in three's world, where the axes are right-handed. */
export const crossThree = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Places a part at `origin` with axes `x`, `y`, `z`, drawn `along` times its modelled length (x) and `across` times its girth (y, z). */
export function setMatrix(mesh: Mesh | Group, origin: Vec3, x: Vec3, y: Vec3, z: Vec3, along = 1, across = along) {
  mesh.matrix.set(
    x[0] * along, y[0] * across, z[0] * across, origin[0],
    x[1] * along, y[1] * across, z[1] * across, origin[1],
    x[2] * along, y[2] * across, z[2] * across, origin[2],
    0, 0, 0, 1,
  );
  mesh.matrixWorldNeedsUpdate = true;
}

/** A part placed on a rig frame (x forward, y up, z to the side), drawn `scale` times its modelled size. */
export function placeFrame(mesh: Mesh | Group, frame: Frame3, scale = 1) {
  setMatrix(mesh, toThree(frame.origin), dirToThree(frame.fwd), dirToThree(frame.up), dirToThree(frame.side), scale);
}

/**
 * The pelvis between the hip joints: side from the left hip to the right,
 * up the torso's up squared to it, so it tips with the torso's lean.
 */
export function hipsFrame(rig: Rig): Frame3 {
  const [left, right] = rig.legs[0].side === 'left' ? rig.legs : [rig.legs[1], rig.legs[0]];
  const origin = scale3(add3(left.hip, right.hip), 0.5);
  const side = norm3(sub3(right.hip, left.hip));
  const up = norm3(sub3(rig.torso.up, scale3(side, dot3(rig.torso.up, side))));
  // Physics is y-down, so its frames are left-handed: forward is side × up.
  const fwd = cross3(side, up);
  return {
    origin, fwd, up, side,
    at: (f, u, s) => add3(origin, add3(scale3(fwd, f), add3(scale3(up, u), scale3(side, s)))),
  };
}
