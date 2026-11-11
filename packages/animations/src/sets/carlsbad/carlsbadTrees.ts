import type { Vec3 } from '../../camera/view';
import type { TreePlacement, TreeSpecies } from '../props/trees';
import { CARLSBAD_FOOT as F, carlsbadSurface } from './carlsbadLayout';

/**
 * Carlsbad's trees, placed on the corrected site plan (carlsbadLayout.ts):
 * the classroom wing 28.5° off the stairs' line, the two portables, the
 * block wall between them and the building across the pad. Positions come
 * from the tree crowns in the 2010 aerial (NAIP, north up; downhill is
 * south, the stairs' side west) and from the photos named on each group.
 *
 * Spacing, heights, turns and seeds are deliberately irregular so no two
 * neighbours read as copies. Each tree stands on the modelled ground (or
 * the level ground beyond it), never on paving, never within five feet of
 * a roof, and clear of the rider's line and the filmers' views of it
 * (carlsbadTrees.test.ts).
 */

type Row = readonly [x: number, z: number, feet: number, yaw: number, seed: number, variant?: number];

const ground = (x: number, z: number) => carlsbadSurface(x * F, z * F);

function plant(species: TreeSpecies, rows: readonly Row[], sink = 0.3): TreePlacement[] {
  return rows.map(([x, z, feet, yaw, seed, variant]) => ({
    // A little below the surface, so a lean or a slope never lifts a root off it.
    at: [x * F, ground(x, z) - sink * F, z * F] as Vec3,
    height: feet * F,
    yaw,
    species,
    seed,
    ...(variant === undefined ? {} : { variant }),
  }));
}

/**
 * Young street trees on the lawn between the portables, standing back
 * toward the block wall (x = 66): four thin trunks with round crowns, in
 * two loose pairs off the first portable's end (refs/191, matched trunk by
 * trunk from the stair head; the specks on the 2010 lawn). Uneven gaps.
 */
const LAWN_ROW: Row[] = [
  [60.2, 1.4, 14.6, 31, 101],
  [57.4, -5.4, 16.9, 204, 102],
  [59.3, -16.2, 13.4, 118, 103],
  [60.8, -24.4, 15.7, 287, 104],
];

/**
 * The tall, dark mass behind the wall and the portables (refs/191 over the
 * portable and at the top left, refs/170 at the right): the 2010 aerial's
 * row of big round crowns along the perimeter (x ≈ 73-81), the biggest just
 * behind the wall's south end, with a looser rank of gums and broadleaves
 * behind it. Over the middle of the wall the sky stays open, as in 191.
 */
const PERIMETER_GUMS: Row[] = [
  [74, -51, 52, 17, 201],
  [81, 55, 49, 140, 202],
  [80, 118, 49, 266, 203],
  [77, -143, 55, 75, 204],
  [106, -91, 58, 198, 206],
  [83, 186, 51, 233, 208],
  [118, 71, 56, 109, 209],
];
const PERIMETER_BROAD: Row[] = [
  [96, 31, 42, 58, 221],
  [91, -116, 38, 191, 222],
  [97, -63, 35, 305, 223],
  [100, 148, 41, 82, 224],
];

/**
 * Beyond the wing's far side, on the lawn strips the 2010 aerial shows east
 * of it and along the next building: what stands over the wing's roofline
 * from the landing and the bottom tripod (refs/163's sequence, refs/170's
 * left half). The great purple crown past the wing's upper end is a
 * jacaranda; one smaller gum stands on the bank top past the wing's
 * downhill end. The last three are fill for the skyline farther out.
 */
const BEYOND_WING_GUMS: Row[] = [
  [-90, -26, 54, 23, 301],
  [3, -71, 33, 167, 302, 2],
  [-103, -93, 50, 288, 303],
  [-45, -129, 48, 91, 304],
  [-232, -38, 60, 214, 305],
  [-196, -152, 57, 339, 306],
];
const BEYOND_WING_BROAD: Row[] = [
  [-172, 12, 44, 112, 321],
  [-124, -84, 32, 251, 322],
  [-66, -113, 29, 33, 323],
  [-42, -54, 26, 176, 324],
  [-262, 66, 42, 287, 325],
];

/**
 * The stairs' side of the pad: the big broadleaf on the west lawn beside
 * the stair head (refs/01, 190, 192 at the left; the 2010 crown there), the
 * tree on the grass slope past the stairs' far cheek (refs/191 at the right),
 * one past the cross walk, and one past the wing's upper end on the pad's
 * side (refs/192, the round crown far off at the right).
 */
const WEST_LAWN_BROAD: Row[] = [
  [-22, 29, 31, 199, 331],
  [6, 42, 24, 68, 332],
  [-70, 54, 27, 302, 333],
  [-166, 63, 30, 145, 334],
];

/** A young tree against the across-pad building's long wall (refs/192, centre), and big gums past its far corner. */
const ACROSS_PAD_YOUNG: Row[] = [[-92, 76, 18.4, 250, 111]];
const ACROSS_PAD_GUMS: Row[] = [
  [-158, 129, 58, 62, 341],
  [-184, 199, 61, 300, 342],
];

/**
 * Mexican fan palms far off past the second portable, standing up out of
 * the dark mass on the skyline (refs/170: a cluster beyond the wing's
 * downhill end, two more to the right). Seen beyond the gap from the top
 * tripod; nowhere near enough to be seen trunk to head.
 */
const PALMS: Row[] = [
  [31, -241, 78, 40, 401],
  [24, -263, 86, 160, 402],
  [44, -276, 71, 275, 403],
  [111, -301, 92, 95, 404],
  [152, -322, 80, 210, 405],
  [166, -298, 74, 330, 406],
];

export function carlsbadTrees(): TreePlacement[] {
  return [
    ...plant('ornamental', LAWN_ROW),
    ...plant('eucalyptus', PERIMETER_GUMS, 0.5),
    ...plant('jacaranda', PERIMETER_BROAD, 0.5),
    ...plant('eucalyptus', BEYOND_WING_GUMS, 0.5),
    ...plant('jacaranda', BEYOND_WING_BROAD, 0.5),
    ...plant('jacaranda', WEST_LAWN_BROAD, 0.5),
    ...plant('ornamental', ACROSS_PAD_YOUNG),
    ...plant('eucalyptus', ACROSS_PAD_GUMS, 0.5),
    ...plant('fanPalm', PALMS, 0.5),
  ];
}
