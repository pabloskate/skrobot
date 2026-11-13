import type { Vec3 } from '../../camera/view';
import type { CarModel, CarPlacement } from '../props/streetProps';
import { crownSpheres, type TreePlacement, type TreeSpecies } from '../props/trees';
import { SET_FOOT } from '../setScale';
import { MAX_CANOPIES, type Canopy } from '../surfaces';
import { BANK_END, BANK_Z0, BAY_FLOOR, F, FT, LANES, LANE_Z, LOWER, ROAD, SCALE, SIDEWALK_END, TAPER_END } from './sunsetKit';
import { FAR_TREE_Z } from './sunsetWear';

/**
 * Roof to Bank's trees and cars, in the set's world coordinates (authored positions times SCALE). Mexican fan
 * palms stand over the roofs behind the wash and at the ends of the far sidewalk, Sunset's street figs between
 * them, dark figs and a gum crowd the alley behind the side lot (the user's side frame), tall figs stand past
 * the bank's right-hand end over the shoulder's hedge, and a gum stands past the billboard. Traffic keeps
 * right on the boulevard, cars dry in the bays with their roofs over the bank's crest, others wait in the
 * lot, and a few are parked at the near curb well left of the landing. Nothing stands on the roof's
 * approach, the bank, the landing, the rollout or inside a building.
 */

type Row = readonly [x: number, z: number, feet: number, yaw: number, seed: number];

/** Authored rows, planted a little into the ground so a lean never lifts a root. */
function plant(species: TreeSpecies, rows: readonly Row[], y: number): TreePlacement[] {
  return rows.map(([x, z, feet, yaw, seed]) => ({
    at: [x * SCALE, (y - 0.3 * FT) * SCALE, z * SCALE] as Vec3,
    height: feet * SET_FOOT,
    yaw,
    species,
    seed,
  }));
}

/** The far sidewalk's tree line, a little over four feet out from the curb. */
const FAR_ROW = LANES.farCurb + 4.5 * FT;
/** Fan palms in the alley behind the wash, standing over its roofs. */
const PALMS_BEHIND: Row[] = [[-1290, 1250, 62, 40, 501], [-1280, -480, 58, 150, 502], [-800, -1550, 66, 260, 503], [-1300, 2700, 70, 330, 504]];
/** Fan palms at the far sidewalk's ends, figs between them, their crowns clipped back from the traffic. */
const PALMS_FAR: Row[] = [[FAR_ROW, FAR_TREE_Z[0], 64, 10, 511], [FAR_ROW, FAR_TREE_Z[5], 60, 200, 512]];
const FIGS_FAR: Row[] = FAR_TREE_Z.filter((_, i) => i !== 0 && i !== 5).map((z, i) => [FAR_ROW, z, 26 + 5 * ((i * 7) % 3), 90 + (i % 2 ? 12 : -10), 521 + i]);
/** The dark trees crowding the alley behind the lot, and a gum past the billboard. */
const ALLEY_FIGS: Row[] = [[-900, -1300, 32, 210, 531], [-1000, -1950, 34, 300, 532]];
const GUMS: Row[] = [[-1000, -1640, 56, 70, 541], [-1050, 2350, 60, 180, 542]];
/** Past the bank's right-hand end, just outside the shoulder's wall: tall dark figs over the hedge (the street views). */
const END_FIGS: Row[] = [[-440, BANK_Z0 - 3 * FT, 34, 120, 551], [-300, BANK_Z0 - 3.5 * FT, 28, 20, 552]];

export const SUNSET_TREES: TreePlacement[] = [
  ...plant('fanPalm', PALMS_BEHIND, ROAD),
  ...plant('fanPalm', PALMS_FAR, LOWER),
  ...plant('ficus', FIGS_FAR, LOWER),
  ...plant('ficus', ALLEY_FIGS, ROAD),
  ...plant('eucalyptus', GUMS, ROAD),
  ...plant('ficus', END_FIGS, LOWER),
];

/**
 * The crowns whose shade the cameras see: each tree's crown spheres, nearest the landing first, up to the
 * look's budget. Palms cast the small round shade of their heads, not a broadleaf's.
 */
export function sunsetCanopies(trees = SUNSET_TREES): Canopy[] {
  const land: Vec3 = [BANK_END * SCALE, LOWER * SCALE, LANE_Z * SCALE];
  return crownSpheres(trees)
    .map(({ center, radius }) => ({ at: center, radius }))
    .sort((a, b) => Math.hypot(a.at[0] - land[0], a.at[2] - land[2]) - Math.hypot(b.at[0] - land[0], b.at[2] - land[2]))
    .slice(0, MAX_CANOPIES);
}

/* ----- Cars ----- */

/** World units a second for a mile an hour. */
const MPH = (5280 * SET_FOOT) / 3600;
/** Each driving car comes round again out of sight, down the boulevard. */
const LAP = 900 * SET_FOOT;
const laneCenter = (a: number, b: number) => ((a + b) / 2) * SCALE;

/**
 * Sunset's traffic keeps right: toward +z on the wash's side, back on the far side. The curb lane stays empty
 * by the landing, since the rider rolls out into it.
 */
const TRAFFIC: CarPlacement[] = ([
  [laneCenter(LANES.dash, LANES.middle), -900, 'sedan', '#9aa3a6', 29, -90],
  [laneCenter(LANES.dash, LANES.middle), 1600, 'suv', '#1f2428', 29, -90],
  [laneCenter(LANES.middle, LANES.farDash), 400, 'hatchback', '#c9c5bb', 33, 90],
  [laneCenter(LANES.middle, LANES.farDash), -2200, 'sedan', '#6b2a2c', 33, 90],
  [laneCenter(LANES.farDash, LANES.farCurb), 2400, 'suv', '#e2e0d8', 26, 90],
  [laneCenter(LANES.farDash, LANES.farCurb), -400, 'sedan', '#2e3f55', 26, 90],
] as const).map(([x, z, model, paint, mph, yaw]) => ({ at: [x, ROAD * SCALE, z * SCALE] as Vec3, yaw, model, paint, speed: mph * MPH, lap: LAP }));

type Parked = readonly [x: number, y: number, z: number, model: CarModel, paint: string, yaw: number];

/**
 * Cars being hand-dried in the bays, their roofs showing over the bank; others waiting in the lot's stalls or
 * at a vacuum; and three parked at the near curb past the bus stop, far left of the landing.
 */
const PARKED: CarPlacement[] = ([
  [-480, BAY_FLOOR, 290, 'sedan', '#1d1f22', 0],
  [-500, BAY_FLOOR, 790, 'suv', '#b8bcbd', 0],
  [-470, BAY_FLOOR, 1290, 'hatchback', '#8c1e22', 180],
  [-370, LOWER, TAPER_END - 21 * F, 'sedan', '#d8d5cc', 180],
  [-370, LOWER, TAPER_END - 41 * F, 'suv', '#43505a', 180],
  [-380, LOWER, TAPER_END - 31 * F, 'hatchback', '#6d7a4f', 180],
  [-250, LOWER, TAPER_END - 11 * F, 'suv', '#e6e4dc', 0],
  [SIDEWALK_END + 4 * FT, ROAD, 1520, 'sedan', '#5b6168', -90],
  [SIDEWALK_END + 4 * FT, ROAD, 1840, 'hatchback', '#c9c2ad', -90],
  [SIDEWALK_END + 4 * FT, ROAD, 2160, 'suv', '#2b3a33', -90],
] as Parked[]).map(([x, y, z, model, paint, yaw]) => ({ at: [x * SCALE, y * SCALE, z * SCALE] as Vec3, yaw, model, paint }));

export const SUNSET_CARS: CarPlacement[] = [...TRAFFIC, ...PARKED];
