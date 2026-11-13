import type { Vec3 } from '../../camera/view';
import type { CarPlacement } from '../props/streetProps';
import type { TreePlacement, TreeSpecies } from '../props/trees';
import { UC_DAVIS_DROP, UC_DAVIS_FOOT as F } from './ucDavisLayout';
import { UC_DAVIS_DRIVE } from './ucDavisWear';

/**
 * The UC Davis gap's trees and parked cars. Broad dark oaks over the bike racks across the drive and on the
 * quad's lawns (Luc's photograph from the takeoff, the 2023 frames), tall gums standing over the campus behind
 * the wing, young street trees along the drive, and the yellowing broadleaf hanging over the wall beside the
 * stairs (the Camarillo photograph). The blue conifer on the bank is modelled with the set
 * (ucDavisGeometry.ts). Every tree stands clear of the line, the bank, the landing and the buildings.
 */

type Row = readonly [x: number, z: number, feet: number, yaw: number, seed: number];

/** Planted on level ground at `y` (a little into it, so a lean never lifts a root off it). */
function plant(species: TreeSpecies, rows: readonly Row[], y: number): TreePlacement[] {
  return rows.map(([x, z, feet, yaw, seed]) => ({ at: [x * F, y - 0.3 * F, z * F] as Vec3, height: feet * F, yaw, species, seed }));
}

const LOWER = -UC_DAVIS_DROP;

/** Oaks (the street props' broad, dense, clipped-crowned fig stands in for them) over the racks and on the lawns. */
const OAKS: Row[] = [
  [74, 16, 30, 200, 401],
  [88, 36, 33, 20, 402],
  [71, 46, 28, 290, 403],
  [82, -50, 32, 120, 404],
  [24, -78, 34, 60, 405],
  [-28, 72, 31, 250, 406],
];
/** Tall gums standing over the campus behind the wing and across the quad. */
const GUMS: Row[] = [
  [-128, -20, 62, 30, 411],
  [-146, -62, 58, 160, 412],
  [30, -108, 55, 300, 413],
  [-46, 112, 56, 80, 414],
];
/** Oaks and gums on the lawns far out round the quad, for the skyline past the buildings. */
const FAR: Row[] = [
  [170, -40, 40, 10, 441],
  [185, 60, 58, 200, 442],
  [150, 150, 36, 90, 443],
  [-40, -190, 52, 300, 444],
];
/** Young street trees along the drive and on the side lawn. */
const YOUNG: Row[] = [
  [66, -26, 17, 40, 421],
  [6, 54, 18, 170, 422],
];

export const UC_DAVIS_TREES: TreePlacement[] = [
  ...plant('ficus', OAKS, LOWER),
  ...plant('eucalyptus', GUMS, LOWER),
  ...plant('ornamental', YOUNG, LOWER),
  ...plant('ficus', [FAR[0], FAR[2]], LOWER),
  ...plant('eucalyptus', [FAR[1], FAR[3]], LOWER),
  // The yellowing broadleaf on the terrace past the stairs, hanging over the wall's right end.
  ...plant('ornamental', [[-3.4, -44, 25, 110, 431]], 0),
];

const [, DRIVE_FAR] = UC_DAVIS_DRIVE;

/**
 * Two white campus service trucks and a staff car parked along the far side of the drive, well off the line
 * (Luc's photograph from the takeoff shows the trucks at the edge of the plaza).
 */
export const UC_DAVIS_CARS: CarPlacement[] = [
  { at: [DRIVE_FAR - 4 * F, LOWER, -58 * F], yaw: 0, model: 'suv', paint: '#e6e6e1' },
  { at: [DRIVE_FAR - 4 * F, LOWER, -74 * F], yaw: 0, model: 'suv', paint: '#dcddd8' },
  { at: [DRIVE_FAR - 4 * F, LOWER, 66 * F], yaw: 180, model: 'sedan', paint: '#4f5d6b' },
];
