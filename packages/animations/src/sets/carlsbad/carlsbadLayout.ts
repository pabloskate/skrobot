import type { DropTerrain } from '../elToro/stairs';
import { SET_FOOT as F } from '../setScale';
import type { SpotFilmers } from '../tripods';
import { smoothstep } from '../../math';

/** Original Carlsbad High grass gap, not the replacement campus stairs.
 * Eleven risers and an uphill landing are documented; dimensions below
 * are photographic estimates, not a surveyed plan. docs/CARLSBAD_REFERENCE.md. */
export const CARLSBAD_FOOT = F;
export const CARLSBAD_STEPS = 11;
export const CARLSBAD_DROP = 6 * F;
export const CARLSBAD_STAIR_RUN = 11 * F;
export const CARLSBAD_RUN = 13 * F;
export const CARLSBAD_RISER = CARLSBAD_DROP / CARLSBAD_STEPS;
export const CARLSBAD_TREAD = CARLSBAD_STAIR_RUN / (CARLSBAD_STEPS - 1);
/** Looking uphill, positive z is image-left: the stairs are left of the grass. */
export const CARLSBAD_STAIR_Z0 = 8 * F;
export const CARLSBAD_STAIR_Z1 = 20 * F;
export const CARLSBAD_BANK_Z0 = -25 * F;
export const CARLSBAD_LANE_Z = 0;
export const CARLSBAD_TOE_HEIGHT = 1.3 * F;
export const CARLSBAD_UPHILL_GRADE = 0.065;
export const CARLSBAD_UPHILL_END = CARLSBAD_STAIR_RUN + 34 * F;
export const CARLSBAD_UPHILL_EASE = 10 * F;
/** Classrooms flank the approach, rather than blocking it behind the lip. */
export const CARLSBAD_FACADE_Z = CARLSBAD_BANK_Z0;
export const CARLSBAD_BUILDING_X0 = -108 * F;
export const CARLSBAD_BUILDING_X1 = -2 * F;
export const CARLSBAD_ROOF_Y = 9.5 * F;

/** The broad runout rises against travel, then eases into the campus path. */
export function carlsbadLanding(x: number): number {
  const u = Math.max(0, x - CARLSBAD_STAIR_RUN);
  const straight = CARLSBAD_UPHILL_END - CARLSBAD_STAIR_RUN;
  const ease = Math.max(0, Math.min(CARLSBAD_UPHILL_EASE, u - straight));
  return -CARLSBAD_DROP + CARLSBAD_UPHILL_GRADE * (Math.min(u, straight) + ease - ease * ease / (2 * CARLSBAD_UPHILL_EASE));
}

export function carlsbadLandingSlope(x: number): number {
  if (x < CARLSBAD_STAIR_RUN) return 0;
  return CARLSBAD_UPHILL_GRADE * (1 - Math.max(0, Math.min(1, (x - CARLSBAD_UPHILL_END) / CARLSBAD_UPHILL_EASE)));
}

/** Curved concrete toe joins the stair foot before bowing out below the grass. */
export const carlsbadBankEnd = (z: number) => z < 0
  ? CARLSBAD_RUN - 8 * F * smoothstep(-z / -CARLSBAD_BANK_Z0)
  : CARLSBAD_STAIR_RUN + (CARLSBAD_RUN - CARLSBAD_STAIR_RUN) * smoothstep((CARLSBAD_STAIR_Z0 - z) / (8 * F));
export const carlsbadToeTop = (z: number) => carlsbadLanding(carlsbadBankEnd(z)) + CARLSBAD_TOE_HEIGHT;

/** The lower walk flares beside the stair apron, curving around the grass.
 * Its width, like the bank's plan curvature, is a visual approximation. */
export const carlsbadPathOuter = (z: number) => 32 * F - 15 * F * smoothstep(-z / -CARLSBAD_BANK_Z0);

export function carlsbadBank(x: number, z: number): number {
  const t = Math.max(0, Math.min(1, x / carlsbadBankEnd(z)));
  return -0.12 * F + (carlsbadToeTop(z) + 0.12 * F) * t;
}

export function carlsbadStairGround(x: number): number {
  if (x <= 0) return 0;
  if (x >= CARLSBAD_STAIR_RUN) return carlsbadLanding(x);
  return -Math.min(CARLSBAD_STEPS, Math.floor(x / CARLSBAD_TREAD) + 1) * CARLSBAD_RISER;
}

/** Ground and shadow receivers share the drawn stairs, grass, wall and paving. */
export function carlsbadSurface(x: number, z: number): number {
  if (x <= 0) return 0;
  if (z >= CARLSBAD_STAIR_Z0 && z <= CARLSBAD_STAIR_Z1) return carlsbadStairGround(x);
  if (z >= CARLSBAD_BANK_Z0 && z < CARLSBAD_STAIR_Z0) {
    const end = carlsbadBankEnd(z);
    if (x < end - 0.3 * F) return carlsbadBank(x, z);
    if (x <= end) return carlsbadToeTop(z);
  }
  // Grass continues beside the stairs instead of a freestanding stair block.
  if (x < CARLSBAD_STAIR_RUN && (z < CARLSBAD_BANK_Z0 || z > CARLSBAD_STAIR_Z1)) {
    return -CARLSBAD_DROP * x / CARLSBAD_STAIR_RUN;
  }
  return carlsbadLanding(x);
}

export const carlsbadGround = (x: number) => carlsbadSurface(x, CARLSBAD_LANE_Z);

export const CARLSBAD_TERRAIN: DropTerrain = {
  drop: CARLSBAD_DROP, run: CARLSBAD_RUN, landPast: 3 * F,
  laneZ: CARLSBAD_LANE_Z, ground: carlsbadGround, surface: carlsbadSurface,
  slope: (x) => x > CARLSBAD_RUN ? carlsbadLandingSlope(x) : 0,
};

/** Where the filmers stand (tripods.ts). */
export const CARLSBAD_FILMERS: SpotFilmers = {
  stairs: {
    line: CARLSBAD_LANE_Z,
    stands: {
      bottom: { u: CARLSBAD_RUN + 29 * F, z: 13 * F, height: carlsbadLanding(CARLSBAD_RUN + 29 * F) + 4.5 * F, frame: 17 * F, place: 0.52 },
      side: { u: CARLSBAD_RUN + 9 * F, z: -17 * F, height: carlsbadLanding(CARLSBAD_RUN + 9 * F) + 4 * F, frame: 18 * F, place: 0.53 },
      top: { u: -6 * F, z: -14 * F, height: 6 * F, frame: 14 * F, place: 0.6 },
    },
  },
};
