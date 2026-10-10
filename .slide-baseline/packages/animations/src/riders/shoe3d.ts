import type { BufferGeometry } from 'three';
import { smoothstep } from '../math';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH } from '../motion/skeleton';
import { blobGeometry } from '../three/geometry';
import type { Vec3 } from '../camera/view';

/**
 * The robot's skate shoe, in shoe-local axes (x toward the toe, y up, z
 * across): a cream cupsole with a puffy upper sitting in it. The upper is
 * what makes it a shoe and not a block: low and round over the toes, rising
 * through the laces to a padded collar the shin drops into, narrower at the
 * heel than across the forefoot, the toe springing up off the ground. The
 * sole is a touch wider than the rig's footprint (SHOE_HALF_WIDTH), so the
 * shoe holds its own beside the shin when it's seen toe-on, the way the
 * stock camera mostly sees it; footContact.ts keeps this sole, as drawn, on
 * top of the grip.
 */

/**
 * The underside, a hair above the rig's sole plane: a sole lying exactly on
 * the grip fights it for depth and the deck's outline speckles the rim.
 */
const GROUND = -SHOE_HALF_HEIGHT + 0.3;
const LENGTH = SHOE_HALF_LENGTH;
const HALF_WIDTH = SHOE_HALF_WIDTH * 1.15;
/** Cupsole height, and how far it stands proud of the upper all round. */
const SOLE_T = 3;
const PROUD = 0.9;
/** Top of the upper over the toes and at the collar, and where the line between them starts and ends. */
const TOE_TOP = 4.8;
const COLLAR_TOP = 10;
const COLLAR_END = -2.5;
const TOE_START = 7;
/** How far the toe curls up off the ground at its tip. */
const SPRING = 1.3;
/** Heel width as a share of the forefoot's. */
const HEEL = 0.86;
/** The rubber toe cap: how far the sole's cream climbs over the toe by the tip, from where. */
const CAP = 1.8;
const CAP_FROM = 4;

/** The upper's half extents, how square it is across and in plan (blobGeometry), and where it sinks into the sole. */
const UPPER_HALF: Vec3 = [LENGTH - PROUD, 1, HALF_WIDTH - PROUD];
const UPPER_SQUARE = { side: 0.6, plan: 0.75 } as const;
const UPPER_FLOOR = GROUND + SOLE_T - 1;

const spring = (x: number) => SPRING * Math.max(0, (x - 5) / (LENGTH - 5)) ** 2;
const width = (x: number) => HEEL + (1 - HEEL) * smoothstep((x + 8) / 12);
const topline = (x: number) => TOE_TOP + (COLLAR_TOP - TOE_TOP) * (1 - smoothstep((x - COLLAR_END) / (TOE_START - COLLAR_END)));

export interface ShoeShape {
  sole: BufferGeometry;
  upper: BufferGeometry;
  /** Where the upper's paint turns sole-colored (toonMaterial's `below`): the sole's top, climbing over the toe as a cap. */
  toeCap: { split: number; rise: { by: number; from: number; to: number } };
}

export function shoeGeometries(): ShoeShape {
  const sole = blobGeometry(
    [LENGTH, SOLE_T / 2, HALF_WIDTH],
    { side: 0.5, plan: 0.55 },
    (x, y, z) => [x, GROUND + SOLE_T / 2 + y + spring(x), z * width(x)],
  );
  // The upper sinks a little into the sole, so no seam opens between them.
  const upper = blobGeometry(
    UPPER_HALF,
    UPPER_SQUARE,
    (x, y, z) => [x, UPPER_FLOOR + ((topline(x) - UPPER_FLOOR) * (y + 1)) / 2 + spring(x), z * width(x)],
  );
  return { sole, upper, toeCap: { split: GROUND + SOLE_T, rise: { by: CAP, from: CAP_FROM, to: LENGTH } } };
}

/**
 * The upper's top over a point of the shoe's plan (shoe-local x and z): how
 * high it is there, and how far out the point is (0 in the middle, 1 at the
 * upper's edge, more beside it). What a pant cuff comes to rest on.
 */
export function upperTop(x: number, z: number): { height: number; out: number } {
  const e = 2 / UPPER_SQUARE.plan;
  const out = ((Math.abs(x) / UPPER_HALF[0]) ** e + (Math.abs(z / width(x)) / UPPER_HALF[2]) ** e) ** (1 / e);
  const y = (1 - Math.min(1, out) ** (2 / UPPER_SQUARE.side)) ** (UPPER_SQUARE.side / 2);
  return { height: UPPER_FLOOR + ((topline(x) - UPPER_FLOOR) * (y + 1)) / 2 + spring(x), out };
}

/**
 * Every point of the drawn sole's lower half, in shoe-local axes: the
 * underside and the rim around it, which a kick rising beside the shoe meets
 * first. What has to stay on top of the grip.
 */
export function soleUnderside(): Array<{ x: number; y: number; z: number }> {
  const { sole, upper } = shoeGeometries();
  const pos = sole.getAttribute('position');
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < GROUND + SOLE_T / 2) points.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  }
  sole.dispose();
  upper.dispose();
  return points;
}
