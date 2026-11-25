import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { normalOf, solidBox, tag, tube } from '../lookKit';
import { WATER_TOWER_FOOT as F } from './waterTowerLayout';

/**
 * The water tower gap's building pieces, in feet in the spot's own axes (waterTowerLayout.ts: x along the line
 * from the lip, y over the roofs, z across toward the road), each turned into set units as it is baked.
 */

/** A point given in feet, in set units. */
export const point = (x: number, y: number, z: number): Vec3 => [x * F, y * F, z * F];

/** An upright box standing on (x, y, z), `width` along x and `depth` along z, in flat paint. */
export function box(b: Bake, x: number, y: number, z: number, width: number, height: number, depth: number, color: string, ink = tag('metal')) {
  solidBox(b, point(x - width / 2, y, z - depth / 2), point(x + width / 2, y + height, z + depth / 2), color, color, ink);
}

/** A round pipe of one radius through points in feet: a stub, a ladder rail, a pole, a wire. */
export function pipe(b: Bake, points: Vec3[], radius: number, color: string, sides = 6) {
  tube(b, points.map((p) => point(...p)), radius * F, color, tag('metal'), sides);
}

/** A flat face through four corners in feet, wound counter-clockwise seen from the side it faces. */
export function face(b: Bake, corners: [Vec3, Vec3, Vec3, Vec3], color: string, ink = tag('concrete')) {
  const [a, c, d, e] = corners.map((p) => point(...p));
  b.quad(a, c, d, e, normalOf(a, c, d), { color }, ink);
}
