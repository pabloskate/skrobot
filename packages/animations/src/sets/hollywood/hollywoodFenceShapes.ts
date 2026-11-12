import type { Vec3 } from '../../camera/view';
import { surfaceInk } from '../surfaces';
import type { Baker } from './turn';
import { HOLLYWOOD_FOOT as F } from './hollywoodLayout';

/**
 * The black picket fence beyond each stair's fixed stretch, in feet in the sixteen's frame. The pickets beside
 * both flights (inks 73 and 144, built in hollywood3d.ts's buildBoundary) never move; these extensions carry
 * their own uninked metal surface so nothing here can touch that fixed hardware. Between the two stairs there is
 * no fence at all: the brick retaining wall faces the sidewalk bare (62-66, 54-57).
 */

const PICKET_BLACK = '#343c36';
/** The fence's line on the sidewalk, just street-side of the retaining wall's face at z = -8.65. */
const FENCE_Z = -8.95;
const RETAINING_FACE = -8.65;
/** Pickets 0.586 ft apart (seven inches), seven and a half feet tall from the sidewalk at y = -8. */
const PICKET_SPACING = 0.586;
const POST_SPACING = 8;
/** The two top rails' heights at the posts; each sags a quarter foot to midspan (30, 31). */
const TOP_RAILS = [-1.4, -2.1];
const SAG = 0.25;

/** Fence extensions south of the sixteen and north of the twelve, the returns to the wall, and both gates. */
export function buildFenceExtensions(props: Baker) {
  const pipe = (points: Vec3[], radius: number, caps = true) => props.tube(
    points.map(p => p.map(v => v * F) as Vec3), points.map(() => radius), { color: PICKET_BLACK }, surfaceInk('metal'), 4, caps);

  /**
   * A half-inch picket from the sidewalk to just under the top rail: two thin planes crossed at right angles, at 45°
   * to the fence line, which read as the round bar from any side at a third of a tube's vertices.
   */
  const picket = (x: number, z: number) => {
    const d = 1.1 * Math.SQRT1_2, [bottom, top] = [-8 * F, -0.5 * F], cx = x * F, cz = z * F;
    for (const [dx, dz] of [[d, d], [d, -d]]) {
      const n: Vec3 = [dz / 1.1, 0, -dx / 1.1];
      props.quad([cx - dx, bottom, cz - dz], [cx + dx, bottom, cz + dz], [cx + dx, top, cz + dz], [cx - dx, top, cz - dz], n, { color: PICKET_BLACK }, surfaceInk('metal'));
    }
  };

  /** A straight run of pickets from x = start to end along z, with posts every eight feet and two sagging top rails. */
  const run = (start: number, end: number, z: number) => {
    for (let x = start; x < end; x += PICKET_SPACING) picket(x, z);
    for (let x = start; x < end; x += POST_SPACING) {
      const next = Math.min(x + POST_SPACING, end);
      pipe([[x, -8, z], [x, -0.5, z]], 3);
      // (Each span's ends die into its posts: open-ended.)
      for (const y of TOP_RAILS) pipe([[x, y, z], [(x + next) / 2, y - SAG, z], [next, y, z]], 1.5, false);
    }
  };

  // South of the sixteen's fixed stretch (which ends at x = 28) to x = 130, with a closed double gate at x 62..70.
  run(28, 62, FENCE_Z); run(62, 70, FENCE_Z); run(70, 130, FENCE_Z);
  // North of the twelve's fixed stretch to the cross fence.
  run(-148, -94.5, FENCE_Z);
  // Short returns at each stair's top back to the bare retaining wall.
  for (const x of [-3, -69]) for (const y of TOP_RAILS) pipe([[x, y, FENCE_Z], [x, y, RETAINING_FACE]], 1.5);
  // The cross fence's gate north of the twelve (29), its leaves standing open along both edges of the landing,
  // 65.5 ft past the twelve's foot: each leaf a short run and its hinge post.
  for (const z of [FENCE_Z, 8]) {
    run(-156, -148, z);
    pipe([[-148, -8, z], [-148, 0, z]], 3.5);
  }
}
