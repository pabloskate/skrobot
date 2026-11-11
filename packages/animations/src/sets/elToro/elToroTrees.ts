import { Vector3 } from 'three';
import type { Vec3 } from '../../camera/view';
import { SUN } from '../../three/materials';
import { crownSpheres, type TreePlacement, type TreeSpecies } from '../props/trees';
import { MAX_CANOPIES, type Canopy } from '../surfaces';
import { SET_FOOT as F, STAIR_RUN, stairGround } from './stairs';
import { BUILDING_BACK, BUILDING_END, BUILDING_FACE, HILL_EDGE, WALL_Z, hill } from './elToroLayout';

/** Plan position (u down the stairs, z across), height in feet, turn and seed. */
type Row = readonly [u: number, z: number, feet: number, yaw: number, seed: number];

function plant(species: TreeSpecies, rows: readonly Row[]): TreePlacement[] {
  return rows.map(([u, z, feet, yaw, seed]) => ({
    // A little below the ground, so a lean or the bank's slope never lifts a root off it.
    at: [u, hill(u) - 0.3 * F, z] as Vec3,
    height: feet * F,
    yaw,
    species,
    seed,
  }));
}

/**
 * The trees the old set drew as polygon groves, as street-prop models in
 * about the same places and sizes: tall gums behind the school and out
 * across the planted bank, a jacaranda and an ornamental among them, and
 * one gum past the bed whose crown shades the grass running down beside
 * the wall. None stands on the stairs, the landings the rider uses, or
 * the filmers' stands (elToroGeometry.test.ts).
 */
export function elToroTrees(): TreePlacement[] {
  // Campus grove fills the gaps between the blocks without trunks in a filming lane; one stands in front of
  // block H, closing the view back up the run-up.
  const rows: Row[] = [
    [-125, 145, 40, 40, 302], [-55, 145, 44, 205, 304], [-200, 150, 42, 115, 306],
    [-130, -45, 36, 290, 307], [-130, -95, 38, 160, 308], [-172, -32, 46, 18, 309],
    [24, -34, 34, 40, 310], [29, -45, 38, 110, 311], [22, -55, 36, 220, 312],
    [5, 145, 42, 32, 313], [65, 145, 44, 120, 314], [145, 135, 42, 90, 315],
    [140, 20, 40, 22, 316], [140, -74, 44, 222, 317], [-25, -210, 40, 75, 318],
  ];
  // The far perimeter: rows of tall gums in front of the outer ring of low blocks (elToroCampus), closing the sky.
  for (let i = 0; i < 14; i++) {
    rows.push([-260 + i * 38, 175, 44 + (i % 3) * 4, i * 37, 340 + i]);
    rows.push([-260 + i * 38, -225, 42 + (i % 4) * 3, i * 41, 360 + i]);
  }
  for (let i = 0; i < 10; i++) {
    rows.push([-265, -190 + i * 37, 44, i * 31, 380 + i]);
    rows.push([245, -190 + i * 37, 44, i * 47, 400 + i]);
  }
  const feet = (rows: Row[]): Row[] => rows.map(([u, z, h, yaw, seed]) => [u * F, z * F, h, yaw, seed]);
  return [
    ...plant('eucalyptus', feet(rows)),
    ...plant('jacaranda', feet([[82, -32, 33, 75, 301], [-132, -16, 30, 0, 320], [-100, -35, 32, 70, 321]])),
    ...plant('ornamental', feet([[12, -18, 27, 130, 303], [100, -42, 22, 250, 305], [68, -48, 18, 80, 322]])),
  ];
}

/** Ground the cameras look at: the landings round the stairs, the stairs, the bank, the bed and the walk by the school. */
function seenGround(u: number, z: number): boolean {
  if (u < -40 * F || u > STAIR_RUN + 45 * F || z < HILL_EDGE - 32 * F || z > WALL_Z + 25 * F) return false;
  // Under the school there is no ground to see.
  return !(u < BUILDING_END && z > BUILDING_FACE && z < BUILDING_BACK);
}

/** The ground's height: the stairs between the bank and the wall, the embankment either side. */
const groundAt = (u: number, z: number) => (z > HILL_EDGE && z < WALL_Z ? stairGround(u) : hill(u));

/** Where a sun ray from `p` meets the ground, followed down twice for the slope. */
function shadeFoot(p: Vec3): [number, number] {
  let u = p[0], z = p[2];
  for (let i = 0; i < 3; i++) {
    const s = (p[1] - groundAt(u, z)) / SUN.y;
    u = p[0] - SUN.x * s;
    z = p[2] - SUN.z * s;
  }
  return [u, z];
}

/** Sample offsets across a crown, square to the sun: its middle and two rings. */
const CROWN_SAMPLES: readonly [number, number][] = [
  [0, 0],
  ...Array.from({ length: 6 }, (_, i) => [0.45, (i * Math.PI) / 3] as [number, number]),
  ...Array.from({ length: 12 }, (_, i) => [0.8, ((i + 0.5) * Math.PI) / 6] as [number, number]),
];

/**
 * The crown spheres whose shade the cameras will see: each crown is scored
 * by how much of its sun shadow lands on ground in view (sampled across the
 * crown, square to the sun, and followed down to the ground), and the best
 * fill the canopy budget. A crown whose shade falls out of sight is left out.
 */
export function elToroCanopies(trees = elToroTrees()): Canopy[] {
  const sun = new Vector3(SUN.x, SUN.y, SUN.z);
  const a = new Vector3(0, 1, 0).cross(sun).normalize(), b = sun.clone().cross(a);
  return crownSpheres(trees)
    .map(({ center, radius }) => {
      let hits = 0;
      for (const [r, angle] of CROWN_SAMPLES) {
        const k = r * radius, du = Math.cos(angle) * k, dv = Math.sin(angle) * k;
        const p: Vec3 = [center[0] + a.x * du + b.x * dv, center[1] + a.y * du + b.y * dv, center[2] + a.z * du + b.z * dv];
        if (seenGround(...shadeFoot(p))) hits++;
      }
      return { canopy: { at: center, radius } as Canopy, score: (hits / CROWN_SAMPLES.length) * radius * radius };
    })
    .filter(({ score }) => score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, MAX_CANOPIES)
    .map(({ canopy }) => canopy);
}
