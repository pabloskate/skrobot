import { add3, cross3, dot3, norm3, scale3, type V3 } from '../../math';
import type { Frame3 } from '../skeleton';

/**
 * Rotations for the falls: unit quaternions in the physics' own axes (y
 * down), and the frames the rig is made of turned to and from them. A frame
 * maps its local (fwd, up, side) onto world axes, and up is -y, so a
 * frame's rotation takes local x to fwd, local -y to up, local z to side.
 */

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export const IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };

export function qmul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export const qconj = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

export function qnorm(q: Quat): Quat {
  const m = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / m, x: q.x / m, y: q.y / m, z: q.z / m };
}

/** `v` turned by `q`. */
export function qrot(q: Quat, v: V3): V3 {
  // v + 2w(u × v) + 2u × (u × v), u the vector part: written out, as the board's physics turns points thousands of times a step.
  const { w, x, y, z } = q;
  const tx = (y * v.z - z * v.y) * 2;
  const ty = (z * v.x - x * v.z) * 2;
  const tz = (x * v.y - y * v.x) * 2;
  return { x: v.x + tx * w + (y * tz - z * ty), y: v.y + ty * w + (z * tx - x * tz), z: v.z + tz * w + (x * ty - y * tx) };
}

/** A turn of |r| radians about r. */
export function qexp(r: V3): Quat {
  const angle = Math.hypot(r.x, r.y, r.z);
  if (angle < 1e-9) return { w: 1, x: r.x / 2, y: r.y / 2, z: r.z / 2 };
  const s = Math.sin(angle / 2) / angle;
  return { w: Math.cos(angle / 2), x: r.x * s, y: r.y * s, z: r.z * s };
}

/** The rotation vector (axis times radians) of `q`, the short way round. */
export function qlog(q: Quat): V3 {
  const p = q.w < 0 ? { w: -q.w, x: -q.x, y: -q.y, z: -q.z } : q;
  const s = Math.hypot(p.x, p.y, p.z);
  if (s < 1e-9) return { x: p.x * 2, y: p.y * 2, z: p.z * 2 };
  const angle = 2 * Math.atan2(s, p.w);
  return { x: (p.x / s) * angle, y: (p.y / s) * angle, z: (p.z / s) * angle };
}

export const qaxis = (axis: V3, radians: number): Quat => qexp(scale3(norm3(axis), radians));

export function qslerp(a: Quat, b: Quat, k: number): Quat {
  return qnorm(qmul(a, qexp(scale3(qlog(qmul(qconj(a), b)), k))));
}

/** The rotation whose columns are the orthonormal (x, y, z). */
export function qbasis(x: V3, y: V3, z: V3): Quat {
  const trace = x.x + y.y + z.z;
  let q: Quat;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = { w: s / 4, x: (y.z - z.y) / s, y: (z.x - x.z) / s, z: (x.y - y.x) / s };
  } else if (x.x > y.y && x.x > z.z) {
    const s = Math.sqrt(1 + x.x - y.y - z.z) * 2;
    q = { w: (y.z - z.y) / s, x: s / 4, y: (y.x + x.y) / s, z: (z.x + x.z) / s };
  } else if (y.y > z.z) {
    const s = Math.sqrt(1 + y.y - x.x - z.z) * 2;
    q = { w: (z.x - x.z) / s, x: (y.x + x.y) / s, y: s / 4, z: (z.y + y.z) / s };
  } else {
    const s = Math.sqrt(1 + z.z - x.x - y.y) * 2;
    q = { w: (x.y - y.x) / s, x: (z.x + x.z) / s, y: (z.y + y.z) / s, z: s / 4 };
  }
  return qnorm(q);
}

/**
 * The rotation of a frame facing `fwd` with `up` (squared to it). Physics
 * frames are left-handed (side = fwd × up would point the other way), so
 * side is up × fwd here, as frameOf's are.
 */
export function qframe(fwd: V3, up: V3): Quat {
  const f = norm3(fwd);
  const u = norm3(add3(up, scale3(f, -dot3(up, f))));
  const side = cross3(u, f);
  // Columns: where local x, y (down) and z go.
  return qbasis(f, scale3(u, -1), side);
}

/** A rig frame at `origin` turned by `q`. */
export function frameFrom(origin: V3, q: Quat): Frame3 {
  const fwd = qrot(q, { x: 1, y: 0, z: 0 });
  const up = qrot(q, { x: 0, y: -1, z: 0 });
  const side = qrot(q, { x: 0, y: 0, z: 1 });
  return {
    origin, fwd, up, side,
    at: (f, u, s) => add3(origin, add3(scale3(fwd, f), add3(scale3(up, u), scale3(side, s)))),
  };
}

/**
 * A rig frame's rotation, from its fwd and up alone: a rider's shoe frames
 * are mirrored (their side runs along the board whichever way that is), and
 * a mirrored basis isn't a rotation.
 */
export const frameQuat = (frame: Frame3): Quat => qframe(frame.fwd, frame.up);
