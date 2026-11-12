import type { Vec3 } from '../../camera/view';
import { SUN } from '../../three/materials';
import { crownSpheres, type TreePlacement } from '../props/trees';
import { HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_12_LIP, hollywoodSurface, HOLLYWOOD_FOOT as F } from './hollywoodLayout';

const lower = -HOLLYWOOD_DROP;

/**
 * The Highland Avenue street figs, about 2012 (Street View 63-66, the 2012
 * fence clip 07; cut down in 2017): one in each sidewalk well, 30-35 ft,
 * broad dense clipped crowns over pale trunks. The species leans its crown
 * toward +z at yaw 0, here away from the road over the sidewalk, as the
 * real ones grew clipped back from the traffic; the yaws keep it that way.
 * Variant, height, turn and seed (crown width, lean) differ tree to tree.
 */
const WELLS: ReadonlyArray<{ x: number; variant: number; height: number; yaw: number }> = [
  { x: -112, variant: 1, height: 33, yaw: 18 },
  { x: -62, variant: 0, height: 34.5, yaw: -24 },
  { x: -36, variant: 2, height: 31, yaw: 9 },
  { x: -10, variant: 1, height: 32, yaw: -11 },
  { x: 38, variant: 0, height: 33.5, yaw: 27 },
  { x: 62, variant: 2, height: 30.5, yaw: -17 },
  { x: 86, variant: 1, height: 34, yaw: 4 },
];

export const HOLLYWOOD_TREES: TreePlacement[] = WELLS.map(({ x, variant, height, yaw }, index) => ({
  at: [x * F, lower, -25.5 * F] as Vec3, height: height * F, yaw, species: 'ficus', variant, seed: 310 + index,
}));

/** Same far-side palms, now drawn by the shared tree models. */
export const HOLLYWOOD_PALMS: TreePlacement[] = [
  { at: [-8 * F, lower, HOLLYWOOD_FAR_CURB_Z - 4 * F], height: 44 * F, yaw: 0, species: 'fanPalm', seed: 901 },
  { at: [-59 * F, lower, HOLLYWOOD_FAR_CURB_Z - 5 * F], height: 37 * F, yaw: 130, species: 'fanPalm', seed: 902 },
];

/** Where each flight's cameras look along the spot (canonical x, feet): the sixteen's landing and sidewalk, or the twelve's. */
const SEEN_X: Record<'sixteen' | 'twelve', readonly [number, number]> = { sixteen: [-48, 72], twelve: [-122, -24] };
/** Paving the cameras see across the spot (canonical z): the near sidewalk and kerb lane up to the school. */
const SEEN_Z = [HOLLYWOOD_CURB_Z - 14 * F, HOLLYWOOD_BUILDING_FACE] as const;

/**
 * The look's 16 crown shadows: to the crown spheres whose shade falls on
 * paving this flight's cameras see (the sidewalk under the row and the
 * kerb lane), most first. Each sphere's disc is sampled at nine points,
 * dropped along the sun onto the ground; a point counts in full inside
 * the flight's stretch of the spot and fades out over 40 ft past it.
 */
export function hollywoodCanopies(trees: TreePlacement[], turned: boolean) {
  const [x0, x1] = SEEN_X[turned ? 'twelve' : 'sixteen'];
  const canonical = (x: number, z: number) => (turned ? [HOLLYWOOD_12_LIP - x, -z] : [x, z]);
  return crownSpheres(trees).map(({ center, radius }) => {
    let score = 0;
    for (const [dx, dz] of [[0, 0], ...Array.from({ length: 8 }, (_, i) => [0.7 * Math.cos(i * Math.PI / 4), 0.7 * Math.sin(i * Math.PI / 4)])]) {
      let x = center[0] + dx * radius, z = center[2] + dz * radius;
      for (let i = 0; i < 3; i++) {
        const [cx, cz] = canonical(x, z);
        const distance = (center[1] - hollywoodSurface(cx, cz)) / SUN.y;
        x = center[0] + dx * radius - SUN.x * distance;
        z = center[2] + dz * radius - SUN.z * distance;
      }
      const [cx, cz] = canonical(x, z);
      if (cz < SEEN_Z[0] || cz > SEEN_Z[1]) continue;
      const outside = Math.max(x0 * F - cx, cx - x1 * F, 0);
      score += Math.max(0, 1 - outside / (40 * F));
    }
    return { at: center, radius, score: score * radius * radius };
  }).filter(crown => crown.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 16)
    .map(({ at, radius }) => ({ at, radius }));
}
