import type { ReactNode } from 'react';
import type { StageSet } from '@skrobot/animations';

/** Stairs down from (x, top) to the ground, `count` steps of `run` by `rise`. */
function stairs(x: number, top: number, count: number, run: number, rise: number): string {
  let d = '';
  for (let i = 0; i < count; i++) d += ` H${x + run * (i + 1)} V${top + rise * (i + 1)}`;
  return d;
}

const GROUND = 36;

/** Each spot in profile: what you drop off, and where you land. */
const PROFILES: Partial<Record<StageSet, { ground: string; strokeWidth?: number; extra?: ReactNode }>> = {
  'el-toro': {
    ground: `M0 10 H16${stairs(16, 10, 10, 2.6, 2.6)} H72`,
    extra: <path d="M15 4 L42 31" />,
  },
  'hollywood-high': {
    ground: `M0 12 H18${stairs(18, 12, 8, 3, 3)} H72`,
    extra: (
      <>
        <path d="M17 6 L42 31" />
        <path d="M50 26 V36 M54 26 V36 M58 26 V36 M62 26 V36 M66 26 V36 M48 29 H70" strokeOpacity={0.7} />
      </>
    ),
  },
  wallenberg: {
    // Down the roll-in, along the run-up, then three tall blocks and the short street curb.
    ground: `M0 4 H4 C9 4 9 16 16 16 H27 V22 H33 V28 H39 V34 H45 V36.4 H72`,
  },
  'sunset-car-wash': {
    ground: `M0 ${GROUND} V10 H26 V20 L50 ${GROUND} H72`,
    extra: <path d="M4 10 V4 H22 V10" strokeOpacity={0.7} />,
  },
  'lyon-25': {
    // The full unbroken 25-step flight, with the orange building's balcony above.
    // No center rails: the actual handrail is bracketed to the side wall.
    ground: `M0 12.25 H16${stairs(16, 12.25, 25, 1.36, 0.95)} H72`,
    strokeWidth: 0.8,
    extra: (
      <>
        <path d="M0 2 H22 V8 H16 V12.25 M0 8 H22" strokeWidth={1.4} />
        <path d="M3 2 V8 M7 2 V8 M11 2 V8 M15 2 V8 M19 2 V8" strokeOpacity={0.6} />
      </>
    ),
  },
  'leap-of-faith': {
    // Balcony over the courtyard, with the original galvanized mesh guardrail.
    ground: `M0 14 H27 V${GROUND} H72`,
    extra: (
      <>
        <path d="M0 5 H27 V14 M0 11 H27 M9 5 V14 M18 5 V14 M0 18 H27" strokeWidth={1.2} />
        <path d="M0 5 L9 11 L18 5 L27 11 M0 11 L9 5 L18 11 L27 5" strokeWidth={0.6} strokeOpacity={0.65} />
        <path d="M6 36 V23 H18 V36" strokeWidth={1.2} strokeOpacity={0.6} />
      </>
    ),
  },
  'miami-triangle': {
    // At 4.2 units a foot: the terrace tip 5 ft over the plaza with its 3 in rim curving up at the edge,
    // the low planter wall 2 ft out, then the granite slab, its apex level with the deck 5.5 ft from the tip,
    // tilted down about 24 degrees to a foot-thick low edge 1.75 ft up, on a pedestal.
    ground: `M0 15 H9 Q10.5 15 10.5 13.95 H12 V${GROUND} H20.4 V29.7 H22.9 V${GROUND} H72`,
    strokeWidth: 1.5,
    extra: (
      <>
        <path d="M35 15 L66 28.65 V32.85 L35 19.2 Z" fill="currentColor" fillOpacity={0.35} />
        <path d="M44.2 23.3 V36 M58.4 29.5 V36" strokeOpacity={0.7} />
      </>
    ),
  },
};

/** A spot's silhouette for its card. Decorative; the card names the spot. */
export default function SpotArt({ set }: { set: StageSet }) {
  const profile = PROFILES[set];
  if (!profile) return null;
  return (
    <svg className="dream-spot-art" viewBox="0 0 72 40" aria-hidden>
      <path d={`${profile.ground} V40 H0 Z`} fill="currentColor" fillOpacity={0.2} />
      <g fill="none" stroke="currentColor" strokeWidth={profile.strokeWidth ?? 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={profile.ground} />
        {profile.extra}
      </g>
    </svg>
  );
}
