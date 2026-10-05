import { lambert } from '../scene/camera';
import { mixHex } from '../scene/math';
import { hash2 } from '../scene/setKit';
import { FOOT } from '../scene/stairs';
import { Bake, NO_INK, type Ink } from './bake';
import type { Vec3 } from './view';

/** Open campus canopy opposite the blue-locker school, all before the lip. */
export const EL_TORO_CANOPY = {
  u0: -740,
  u1: -50,
  z0: -1090,
  z1: -235,
  pierHalf: 24,
  pierTop: 330,
  beamBottom: 330,
  beamTop: 358,
  roofBottom: 370,
  roofTop: 375,
} as const;

/** Main roof slab, for an exact ray/roof intersection rather than an opaque building box. */
export const EL_TORO_CANOPY_ROOF_BOUNDS: Readonly<{ min: Vec3; max: Vec3 }> = {
  min: [EL_TORO_CANOPY.u0, EL_TORO_CANOPY.roofBottom, EL_TORO_CANOPY.z0],
  max: [EL_TORO_CANOPY.u1, EL_TORO_CANOPY.roofTop, EL_TORO_CANOPY.z1],
};

/** Discrete piers leave daylight through the open walkway and its cast shadow. */
export const EL_TORO_CANOPY_COLUMNS: ReadonlyArray<{ u: number; z: number; half: number; height: number }> =
  [-650, -400, -140].flatMap((u) => [-990, -320].map((z) => ({
    u, z, half: EL_TORO_CANOPY.pierHalf, height: EL_TORO_CANOPY.pierTop,
  })));

const MASONRY: Ink = { ...NO_INK, solid: 10 };
const WOOD: Ink = { ...NO_INK, solid: 11 };
const METAL: Ink = { ...NO_INK, solid: 12 };

const daylight = (color: string, n: Vec3): string => {
  const light = lambert({ x: n[0], y: -n[1], z: n[2] });
  return light > 0.5
    ? mixHex(color, '#e6dcc4', (light - 0.5) * 0.2)
    : mixHex(color, '#292e2c', (0.5 - light) * 0.7);
};

/**
 * The broad, flat covered walkway in the user's El Toro photograph: tan
 * masonry piers, weathered fascia, projecting rafters and deep open bays.
 * A floor is intentionally left to the spot's shadow-receiving ground mesh.
 */
export function buildElToroCanopy(props: Bake, dir: 1 | -1): void {
  const C = EL_TORO_CANOPY;
  const P = (u: number, y: number, z: number): Vec3 => [dir * u, y, z];
  const face = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, color: string, ink: Ink) =>
    props.quad(a, b, c, d, n, { color: daylight(color, n) }, ink);
  const box = (a: Vec3, b: Vec3, color: string, ink: Ink = WOOD) => {
    const [x0, y0, z0]: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const [x1, y1, z1]: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, ink);
    face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, ink);
    face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, ink);
    face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, ink);
    face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, ink);
    face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, ink);
  };

  // Individual running-bond block faces wrap the square piers. Their shallow
  // mortar gaps read at close range while the original open silhouette stays clear.
  EL_TORO_CANOPY_COLUMNS.forEach(({ u, z, half, height }, column) => {
    box(P(u - half, 0, z - half), P(u + half, height, z + half), '#93836c', MASONRY);
    const blockH = FOOT * 2 / 3;
    const blockW = FOOT * 4 / 3;
    const sides: Array<{ point: (s: number, y: number) => Vec3; normal: Vec3 }> = [
      { point: (s, y) => P(u - half + s, y, z + half + 0.45), normal: [0, 0, 1] },
      { point: (s, y) => P(u + half - s, y, z - half - 0.45), normal: [0, 0, -1] },
      { point: (s, y) => P(u + half + 0.45, y, z + half - s), normal: [dir, 0, 0] },
      { point: (s, y) => P(u - half - 0.45, y, z - half + s), normal: [-dir, 0, 0] },
    ];
    sides.forEach(({ point, normal }, side) => {
      for (let row = 0; row * blockH < height; row++) {
        const low = row * blockH + 0.55;
        const high = Math.min(height - 0.4, (row + 1) * blockH - 0.55);
        for (let cell = -1; cell < 2; cell++) {
          const start = Math.max(0.35, (cell + (row % 2) * 0.5) * blockW + 0.55);
          const end = Math.min(half * 2 - 0.35, (cell + 1 + (row % 2) * 0.5) * blockW - 0.55);
          if (end <= start) continue;
          const variation = hash2(column * 17 + side * 7 + cell, row, 902);
          const color = mixHex('#baa481', '#d1b893', variation * 0.5);
          face(point(start, low), point(end, low), point(end, high), point(start, high), normal, color, MASONRY);
        }
      }
    });
    // A darker base course, plus a steel bearing plate under the crossbeam.
    box(P(u - half - 0.6, 0, z - half - 0.6), P(u + half + 0.6, 5, z + half + 0.6), '#a59477', MASONRY);
    box(P(u - half - 1, height - 2, z - half - 1), P(u + half + 1, height + 1, z + half + 1), '#5b5b4e', METAL);
    // Compact daylight campus sconce high on the downstream face.
    if (u === -140) {
      box(P(u + half + 0.8, 259, z - 8), P(u + half + 4.3, 274, z + 8), '#62645a', METAL);
      box(P(u + half + 4.4, 261, z - 6), P(u + half + 5.2, 272, z + 6), '#d4d1b8', METAL);
      box(P(u + half + 0.3, 274, z - 9), P(u + half + 6, 277, z + 9), '#797a6b', METAL);
    }
  });

  // Three substantial transverse girders rest directly on paired piers.
  for (const u of [-650, -400, -140]) {
    box(P(u - 15, C.beamBottom, C.z0 - 6), P(u + 15, C.beamTop, C.z1 + 6), '#716858');
    // Lower lamination seam and bolt plates on the exposed downstream face.
    box(P(u + 15.05, C.beamBottom + 8, C.z0 - 6), P(u + 15.35, C.beamBottom + 8.6, C.z1 + 6), '#524f43');
    for (const z of [-990, -320]) {
      box(P(u + 15.4, C.beamBottom + 4, z - 8), P(u + 15.9, C.beamTop - 4, z + 8), '#5e6257', METAL);
      for (const y of [C.beamBottom + 9, C.beamTop - 9]) {
        props.tube([P(u + 15.9, y, z), P(u + 16.6, y, z)], [1.2, 1.2], { color: '#969785' }, METAL, 6, true);
      }
    }
  }

  // A dark uninterrupted underside keeps the roof open and sheltered, rather
  // than turning the canopy into another solid-walled classroom building.
  box(P(C.u0, C.roofBottom, C.z0), P(C.u1, C.roofTop, C.z1), '#858174');
  face(P(C.u0, C.roofBottom - 0.2, C.z1), P(C.u1, C.roofBottom - 0.2, C.z1), P(C.u1, C.roofBottom - 0.2, C.z0), P(C.u0, C.roofBottom - 0.2, C.z0), [0, -1, 0], '#4c493f', WOOD);
  for (let z = C.z0 + 15; z < C.z1; z += 76) {
    // Exposed rectangular ends project beyond both roof edges, as in the photo.
    box(P(C.u0 - 23, 354, z - 4), P(C.u1 + 30, 371, z + 4), '#827a66');
    box(P(C.u1 + 29.7, 356, z - 3), P(C.u1 + 30.2, 369, z + 3), '#a2967d');
    // Fine roof-sheet seams are subtle geometry, not additional textures.
    box(P(C.u0, C.roofTop + 0.15, z + 9), P(C.u1, C.roofTop + 0.6, z + 9.8), '#716e62');
  }

  // Weathered perimeter fascia with a narrow metal flashing and drip edge.
  for (const u of [C.u0, C.u1]) {
    box(P(u - 4, 344, C.z0 - 4), P(u + 4, 370, C.z1 + 4), '#786e5a');
    box(P(u - 4.3, 371, C.z0 - 4.3), P(u + 4.3, 375.6, C.z1 + 4.3), '#9c9785', METAL);
    for (let y = 349; y < 370; y += 5.2) {
      box(P(u + 4.1, y, C.z0), P(u + 4.4, y + 0.6, C.z1), '#625c4f');
    }
  }
  for (const z of [C.z0, C.z1]) {
    box(P(C.u0 - 4, 344, z - 4), P(C.u1 + 4, 370, z + 4), '#726956');
    box(P(C.u0 - 4.3, 371, z - 4.3), P(C.u1 + 4.3, 375.6, z + 4.3), '#999481', METAL);
  }

  // A low blue-gray guardrail across the rear bay remains visibly open.
  const guardU = C.u0 + 16;
  const z0 = C.z0 + 52;
  const z1 = C.z1 - 55;
  for (const height of [9, 3.4 * FOOT]) {
    box(P(guardU - 1.8, height, z0), P(guardU + 1.8, height + 3.3, z1), '#697977', METAL);
  }
  for (let z = z0; z <= z1; z += 20) {
    box(P(guardU - 1.1, 0, z - 1.1), P(guardU + 1.1, 3.4 * FOOT + 3.3, z + 1.1), '#687977', METAL);
  }
}
