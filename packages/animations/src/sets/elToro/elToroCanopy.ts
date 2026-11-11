import { SET_FOOT } from './stairs';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { SURFACE } from '../surfaces';
import type { Vec3 } from '../../camera/view';

/** Open campus canopy opposite the blue-locker school, all before the lip. */
export const EL_TORO_CANOPY = {
  u0: -114 * SET_FOOT,
  u1: 4 * SET_FOOT,
  z0: -88 * SET_FOOT,
  z1: -235,
  pierHalf: SET_FOOT,
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
  [-4, -26, -48, -70, -92, -110].flatMap((u) => [-13, -35, -57, -83].map((z) => ({
    u: u * SET_FOOT, z: z * SET_FOOT, half: EL_TORO_CANOPY.pierHalf, height: EL_TORO_CANOPY.pierTop,
  })));

/**
 * The canopy's shade: its roof with the fascia round it (from the beams' underside, so the girders' shade is
 * in it too) and each pier. The look shades the walk and the props under them from these boxes.
 */
export function elToroCanopyShade(): Array<{ min: Vec3; max: Vec3 }> {
  const C = EL_TORO_CANOPY;
  return [
    // Flush with the fascia's faces and the roof's top: a face inside a box would shade itself.
    { min: [C.u0 - 4, C.beamBottom + 14, C.z0 - 4], max: [C.u1 + 4, C.roofTop, C.z1 + 4] },
    ...EL_TORO_CANOPY_COLUMNS.filter(({ u, z }) => u === -4 * SET_FOOT || (z === -13 * SET_FOOT && u > -70 * SET_FOOT)).map(({ u, z, half, height }) => ({ min: [u - half, 0, z - half] as Vec3, max: [u + half, height, z + half] as Vec3 })),
  ];
}

const tag = (solid: number): Ink => ({ ...NO_INK, solid });
const MASONRY = tag(10);
const WOOD = tag(11);
const METAL = tag(SURFACE.metal);

/**
 * The broad, flat covered walkway in the user's El Toro photograph: tan
 * masonry piers, weathered fascia, projecting rafters and deep open bays.
 * A floor is intentionally left to the spot's shadow-receiving ground mesh.
 * Every face is its authored sunlit colour: the look lights it, draws the
 * piers' block courses (solid 10), and its shadow boxes put the underside
 * and the walk below in the roof's shade.
 */
export function buildElToroCanopy(props: Bake): void {
  const C = EL_TORO_CANOPY;
  const P = (u: number, y: number, z: number): Vec3 => [u, y, z];
  const face = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, color: string, ink: Ink) => props.quad(a, b, c, d, n, { color }, ink);
  const box = (a: Vec3, b: Vec3, color: string, ink: Ink = WOOD, options: { faces?: string; bottom?: string } = {}) => {
    const [x0, y0, z0]: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const [x1, y1, z1]: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    const faces = options.faces ?? 'tbfkle';
    if (faces.includes('t')) face([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], color, ink);
    if (faces.includes('b')) face([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], options.bottom ?? color, ink);
    if (faces.includes('f')) face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, ink);
    if (faces.includes('k')) face([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, ink);
    if (faces.includes('l')) face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, ink);
    if (faces.includes('e')) face([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, ink);
  };

  // Square block piers: flat faces, the running bond drawn by the look.
  EL_TORO_CANOPY_COLUMNS.forEach(({ u, z, half, height }) => {
    box(P(u - half, 0, z - half), P(u + half, height, z + half), '#c6af8a', MASONRY);
    // A darker base course, plus a steel bearing plate under the crossbeam.
    box(P(u - half - 0.6, 0, z - half - 0.6), P(u + half + 0.6, 5, z + half + 0.6), '#ad9c7f', MASONRY);
    box(P(u - half - 1, height - 2, z - half - 1), P(u + half + 1, height + 1, z + half + 1), '#5b5b4e', METAL);
    // Compact daylight campus sconce high on the downstream face.
    if (u === -140) {
      box(P(u + half + 0.8, 259, z - 8), P(u + half + 4.3, 274, z + 8), '#62645a', METAL);
      box(P(u + half + 4.4, 261, z - 6), P(u + half + 5.2, 272, z + 6), '#d4d1b8', METAL);
      box(P(u + half + 0.3, 274, z - 9), P(u + half + 6, 277, z + 9), '#797a6b', METAL);
    }
  });

  // Heavy glulam girders across the walk, one on each line of piers, dark with age (refs/34).
  for (const u of [-4, -26, -48, -70, -92, -110].map((v) => v * SET_FOOT)) {
    box(P(u - 15, C.beamBottom, C.z0 - 6), P(u + 15, C.beamTop, C.z1 + 6), '#6b5b45');
    // A lamination seam, and a steel strap where each girder bears on a pier.
    box(P(u + 15.05, C.beamBottom + 8, C.z0 - 6), P(u + 15.35, C.beamBottom + 8.6, C.z1 + 6), '#4f463a');
    for (const z of [-13, -35, -57, -83].map((v) => v * SET_FOOT)) {
      box(P(u + 15.4, C.beamBottom + 4, z - 8), P(u + 15.9, C.beamTop - 4, z + 8), '#55574e', METAL);
    }
  }

  // An uninterrupted underside keeps the roof open and sheltered, rather than
  // turning the canopy into another solid-walled classroom building. It's
  // painted paler than the fascia: the shadow boxes and the hidden sky darken it.
  box(P(C.u0, C.roofBottom, C.z0), P(C.u1, C.roofTop, C.z1), '#514b40', WOOD, { bottom: '#4a4034' });
  // Dark timber beams seven feet apart, six by eight inches, their ends projecting past both roof edges with the
  // end grain showing paler (refs/34, 46). They sit above the fascia's lower edge, so its line stays unbroken.
  for (let z = C.z0 + 15; z < C.z1; z += 203) {
    box(P(C.u0 - 23, 353, z - 7), P(C.u1 + 30, 371, z + 7), '#5b4a37');
    box(P(C.u1 + 29.7, 354, z - 6.5), P(C.u1 + 30.2, 370, z + 6.5), '#8f7a5c');
    box(P(C.u0 - 23.5, 354, z - 6.5), P(C.u0 - 23, 370, z + 6.5), '#8f7a5c');
  }
  // Fine roof-sheet seams are subtle geometry, not additional textures.
  for (let z = C.z0 + 24; z < C.z1; z += 76) box(P(C.u0, C.roofTop + 0.15, z), P(C.u1, C.roofTop + 0.6, z + 0.8), '#716e62');
  picnicTables(props);

  // Each perimeter is a closed ring. The u sides own the corner footprints;
  // the z sides meet them without hidden end caps or duplicate top faces.
  const perimeter = (half: number, low: number, high: number, uColor: string, zColor: string, ink: Ink) => {
    for (const [u, outward] of [[C.u0, -1], [C.u1, 1]]) {
      const a = P(u - half, low, C.z0 - half), b = P(u + half, high, C.z1 + half);
      box(a, b, uColor, ink, { faces: 'tbfk' });
      box(a, b, uColor, ink, { faces: outward > 0 ? 'e' : 'l' });
      // Only the section facing the open roof interior is exposed inward.
      box(P(u - half, low, C.z0 + half), P(u + half, high, C.z1 - half), uColor, ink, { faces: outward > 0 ? 'l' : 'e' });
    }
    for (const z of [C.z0, C.z1]) {
      box(P(C.u0 + half, low, z - half), P(C.u1 - half, high, z + half), zColor, ink, { faces: 'tbfk' });
    }
  };
  // Weathered perimeter fascia with a narrow metal flashing and drip edge.
  perimeter(4, 344, 370, '#514434', '#514434', WOOD);
  perimeter(4.3, 371, 375.6, '#9c9785', '#999481', METAL);
  for (const u of [C.u0, C.u1]) {
    for (let y = 349; y < 370; y += 5.2) {
      box(P(u + 4.1, y, C.z0), P(u + 4.4, y + 0.6, C.z1), '#625c4f');
    }
  }

  // A low blue-gray guardrail across the rear bay remains visibly open.
  const guardU = 0.5 * SET_FOOT;
  const z0 = -88 * SET_FOOT;
  const z1 = -9 * SET_FOOT;
  for (const height of [9, 3.4 * SET_FOOT]) {
    box(P(guardU - 1.8, height, z0), P(guardU + 1.8, height + 3.3, z1), '#697977', METAL);
  }
  // The pickets, eight inches apart: four sides each, their ends hidden in the rails and the slab.
  for (let z = z0; z <= z1; z += 20) {
    box(P(guardU - 1.1, 0, z - 1.1), P(guardU + 1.1, 3.4 * SET_FOOT + 3.3, z + 1.1), '#687977', METAL, { faces: 'fkle' });
  }
  for (let u = -5.5 * SET_FOOT; u <= guardU; u += 20) box(P(u - 1.1, 0, z1 - 1.1), P(u + 1.1, 3.5 * SET_FOOT, z1 + 1.1), '#687977', METAL, { faces: 'fkle' });
  box(P(-5.5 * SET_FOOT, 3.4 * SET_FOOT, z1 - 1.8), P(guardU, 3.5 * SET_FOOT, z1 + 1.8), '#697977', METAL);
}

/**
 * A few picnic tables in the canopy's gloom (refs/46): weathered wooden tops and benches on dark steel frames,
 * set between the piers and well off the walk and the rider's lane (feet, the spot's axes).
 */
function picnicTables(props: Bake) {
  const P = (u: number, h: number, z: number): Vec3 => [u * SET_FOOT, h * SET_FOOT, z * SET_FOOT];
  const slab = (a: Vec3, b: Vec3, color: string, ink: Ink) => {
    const [x0, y0, z0] = a, [x1, y1, z1] = b;
    const quad = (p: Vec3[], n: Vec3) => props.quad(P(...p[0]), P(...p[1]), P(...p[2]), P(...p[3]), n, { color }, ink);
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
  };
  for (const [u, z] of [[-31, -24], [-59, -46], [-37, -68], [-81, -24], [-97, -62]]) {
    // Top and benches run along the walk (u); the frames stand across it.
    slab([u - 3, 2.35, z - 1.25], [u + 3, 2.5, z + 1.25], '#8a7a62', WOOD);
    for (const side of [-1, 1]) slab([u - 3, 1.4, z + side * 2.4 - 0.5], [u + 3, 1.52, z + side * 2.4 + 0.5], '#857560', WOOD);
    for (const du of [-2.2, 2.2]) {
      slab([u + du - 0.1, 0, z - 1.2], [u + du + 0.1, 2.35, z - 0.95], '#3f413b', METAL);
      slab([u + du - 0.1, 0, z + 0.95], [u + du + 0.1, 2.35, z + 1.2], '#3f413b', METAL);
      slab([u + du - 0.1, 1.28, z - 2.9], [u + du + 0.1, 1.4, z + 2.9], '#3f413b', METAL);
    }
  }
}
