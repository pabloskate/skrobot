import type { Vec3 } from '../../camera/view';
import type { CarPlacement } from '../props/streetProps';
import type { TreePlacement, TreeSpecies } from '../props/trees';
import { SET_FOOT as F, WALLENBERG_DROP, WALLENBERG_GATE_X, WALLENBERG_RUN, wallenbergSlope } from './wallenbergLayout';

/**
 * Wallenberg's trees and parked cars. The big dark tree on the bank past the side stairs (FindSkateSpots, its
 * crown shading the stair rails), a cypress and gums over the houses up the hill beyond the gate (the 2024
 * group photograph), and street trees along the far side of the yard. Every tree stands clear of the line,
 * the roll-in, the gym and the filmers' views of the blocks.
 */

type Row = readonly [x: number, z: number, feet: number, yaw: number, seed: number, variant?: number];

/** The bank past the side stairs falls with the blocks; up top and below it the ground is level. */
const bank = (x: number) => Math.max(-WALLENBERG_DROP, Math.min(0, (-x / WALLENBERG_RUN) * WALLENBERG_DROP));

function plant(species: TreeSpecies, rows: readonly Row[], ground: (x: number, z: number) => number): TreePlacement[] {
  return rows.map(([x, z, feet, yaw, seed, variant]) => ({
    // A little into the ground, so a lean never lifts a root off it.
    at: [x * F, ground(x * F, z * F) - 0.3 * F, z * F] as Vec3,
    height: feet * F,
    yaw,
    species,
    seed,
    ...(variant === undefined ? {} : { variant }),
  }));
}

/** On the planted bank and up top past the gym's far end. */
const BANK: Row[] = [
  [11, 50, 26, 40, 301],
  [-2, 64, 30, 160, 302],
];
/** Beyond the gate: the dark cypress in front of the houses, and a loose rank of gums standing over them from behind. */
const UPHILL: Row[] = [
  [-112, -66, 42, 210, 311],
  [-182, -22, 58, 75, 312],
  [-190, -95, 62, 300, 313],
  [-178, 30, 52, 120, 314],
];
/** Young street trees along the far side of the yard, in front of the apartments there. */
const YARD: Row[] = [
  [142, -60, 18, 20, 321],
  [139, -22, 16, 140, 322],
  [144, 22, 19, 250, 323],
  [141, 64, 17, 330, 324],
];

const up = (x: number) => (x < 0 ? wallenbergSlope(Math.min(x, WALLENBERG_GATE_X - 12 * F)) : 0);

export const WALLENBERG_TREES: TreePlacement[] = [
  ...plant('ficus', BANK, (x) => bank(x)),
  ...plant('ficus', UPHILL.slice(0, 1), up),
  ...plant('eucalyptus', UPHILL.slice(1), up),
  ...plant('ornamental', YARD, () => -WALLENBERG_DROP),
];

/**
 * The school's vans and a staff car in the lot beyond the gate, where the slope has come level (the group
 * photograph), and a car parked across the yard.
 */
export const WALLENBERG_CARS: CarPlacement[] = [
  { at: [-72 * F, up(-72 * F), -40 * F], yaw: 90, model: 'suv', paint: '#e4e4df' },
  { at: [-72 * F, up(-72 * F), -50 * F], yaw: 90, model: 'suv', paint: '#d9dad6' },
  { at: [-73 * F, up(-73 * F), -61 * F], yaw: 270, model: 'sedan', paint: '#8d939a' },
  { at: [128 * F, -WALLENBERG_DROP, -42 * F], yaw: 0, model: 'hatchback', paint: '#7c2f2b' },
];
