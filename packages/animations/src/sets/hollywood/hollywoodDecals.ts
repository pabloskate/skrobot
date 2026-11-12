import type { Vec3 } from '../../camera/view';
import { Bake, type Ink, type Paint } from '../../three/bake';
import {
  HOLLYWOOD_12_LIP, HOLLYWOOD_12_RUN, HOLLYWOOD_BUILDING_FACE,
  HOLLYWOOD_CHEEK_Z, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RUN, HOLLYWOOD_FOOT as F,
  hollywoodSurface,
} from './hollywoodLayout';
import { HOLLYWOOD_TREES } from './hollywoodTrees';
import { turnPoint } from './turn';

/**
 * Invented wear is carried over only on exposed paving. Reject whole small
 * triangles at bed edges rather than leaving paint beneath soil or hovering
 * beside a cheek; later dressing can author clipped marks from references.
 */
export class HollywoodDecals extends Bake {
  constructor(private readonly turned: boolean) { super(color => color); }

  override triangle(a: Vec3, b: Vec3, c: Vec3, normal: Vec3, paint: Paint, ink: Ink) {
    if (!this.rejects([a, b, c], normal)) super.triangle(a, b, c, normal, paint, ink);
  }

  /** A per-corner quad is held to the same rule, each of its two triangles on its own. */
  override quadCorners(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, paints: [Paint, Paint, Paint, Paint], ink: Ink) {
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      const pts = [a, b, c, d];
      if (this.rejects([pts[i], pts[j], pts[k]], normal)) continue;
      for (const n of [i, j, k]) this.vertex(pts[n], normal, paints[n], ink);
    }
  }

  /** Whether a level triangle would float, sink, or lie under a wall, a cheek or a tree well. */
  private rejects([a, b, c]: Vec3[], normal: Vec3) {
    if (normal[1] > 0.9) {
      const points = [a, b, c].map(point => this.turned ? turnPoint(HOLLYWOOD_12_LIP, point) : point);
      if (points.some(([x, y, z]) => {
        const lift = y - hollywoodSurface(x, z);
        return lift <= 0 || lift > 0.025 * F;
      })) return true;
      const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
      const minZ = Math.min(...points.map(point => point[2])), maxZ = Math.max(...points.map(point => point[2]));
      const overlaps = (x0: number, x1: number, z0: number, z1: number) => maxX >= x0 && minX <= x1 && maxZ >= z0 && minZ <= z1;
      for (const [x0, x1, z0, z1] of [
        [-88.5, -66, HOLLYWOOD_BUILDING_FACE / F, 25], [-6, 16.5, HOLLYWOOD_BUILDING_FACE / F, 25],
        [-66.75, -5.25, 8, 31], [-108, 36, 31, 110],
        [16.5, 50, 36, 37], [49, 50, 10, 36], [47, 49, 8, 10],
        [-116, -88.5, 36, 37], [-116, -115, 10, 36], [-115, -113, 8, 10],
        [60, 150, 14, 70],
      ]) if (overlaps(x0 * F, x1 * F, z0 * F, z1 * F)) return true;
      if (overlaps(HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - 0.4 * F, HOLLYWOOD_RUN + 0.4 * F, HOLLYWOOD_CHEEK_Z, HOLLYWOOD_LEFT_Z)) return true;
      for (const { at: [x, , z] } of HOLLYWOOD_TREES) {
        if (overlaps(x - 2.2 * F, x + 2.2 * F, z - 2.2 * F, z + 2.2 * F)) return true;
      }
    }
    return false;
  }
}
