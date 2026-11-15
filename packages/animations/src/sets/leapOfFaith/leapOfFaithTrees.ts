import type { TreePlacement } from '../props/trees';
import type { CarPlacement } from '../props/streetProps';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';

/** The lower court's floor, in feet. */
const COURT = -14.3;

type Tree = { x: number; z: number; height: number; species: NonNullable<TreePlacement['species']> };

/**
 * The upper terrace's trees in their square beds, none nearer the walkway than x = -45: a jacaranda behind the
 * gallery's right end (in bloom over it in ref 122), figs, and a tall gum farther off, so the crowns over the
 * gallery are not all one dome.
 */
const TERRACE_TREES: Tree[] = [
  { x: -52, z: -38, height: 29, species: 'jacaranda' },
  { x: -78, z: 12, height: 34, species: 'ficus' },
  { x: -115, z: -35, height: 44, species: 'eucalyptus' },
  { x: -132, z: 12, height: 28, species: 'ficus' },
  { x: -78, z: 65, height: 30, species: 'jacaranda' },
];
/** The court's far-left corner bed: a fig and a young ornamental beside it (ref 03). */
const CORNER_TREES: Tree[] = [
  { x: 65, z: 85, height: 31, species: 'ficus' },
  { x: 77, z: 101, height: 17, species: 'ornamental' },
];
/** The street's figs, along both sidewalks beyond the perimeter wall (refs 03, 77). */
const STREET_TREES: Tree[] = [
  { x: 93.5, z: -35, height: 40, species: 'ficus' },
  { x: 93.5, z: 24, height: 40, species: 'ficus' },
  { x: 93.5, z: 78, height: 40, species: 'ficus' },
  { x: 142, z: 104, height: 38, species: 'ficus' },
  { x: 142, z: 30, height: 35, species: 'ficus' },
  { x: 142, z: -58, height: 37, species: 'ficus' },
];

/** World coordinates, set units. */
export const LEAP_OF_FAITH_TREES: TreePlacement[] = [
  ...TERRACE_TREES.map((t, i) => ({ t, y: 0, yaw: i * 73, seed: 500 + i })),
  ...[...CORNER_TREES, ...STREET_TREES].map((t, i) => ({ t, y: COURT, yaw: i * 63, seed: 510 + i })),
].map(({ t, y, yaw, seed }) => ({ at: [t.x * F, y * F, t.z * F] as [number, number, number], height: t.height * F, yaw, species: t.species, seed }));

/** Five sedans parked along the street's near kerb, z in feet. */
const CAR_Z = [-42, -17, 27, 51, 94];
const CAR_PAINT = ['#d5d3c8', '#4b6375', '#a29580', '#ece6d5', '#744f44'];
export const LEAP_OF_FAITH_CARS: CarPlacement[] = CAR_Z.map((z, i) => ({
  at: [102 * F, COURT * F, z * F], yaw: 0, model: 'sedan', paint: CAR_PAINT[i],
}));
