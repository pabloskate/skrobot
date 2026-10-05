import {
  GRIND_BASES,
  canEnterGrind,
  canExitGrind,
  exitEndsFor,
  joinGrindBase,
  joinGrindExit,
  type PopEnd,
  type Robot,
  type Stance,
  type Trick,
} from '@skrobot/animations';

export const ROBOTS: Robot[] = [
  {
    id: 'shifty',
    name: 'Swivel',
    avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
    skateStyle: { popHeight: 0.5, rotationSpeed: 1.16, flickStrength: 0.88 },
  },
  {
    id: 'baily',
    name: 'Scuffy',
    avatar: { body: '#5b8def', accent: '#f2a541', variant: 1 },
    skateStyle: { popHeight: 0.88, rotationSpeed: 0.88, flickStrength: 0.76 },
  },
  {
    id: 'sacker',
    name: 'Gutsy',
    avatar: { body: '#7ea0b5', accent: '#e0455c', variant: 2 },
    skateStyle: { popHeight: 1.15, rotationSpeed: 0.94, flickStrength: 1.04 },
  },
  {
    id: 'nolly',
    name: 'Nosy',
    avatar: { body: '#9b59b6', accent: '#f1c40f', variant: 3 },
    skateStyle: { popHeight: 1.04, rotationSpeed: 1.16, flickStrength: 1.25 },
  },
];

const FLATGROUND_BASES = [
  'Ollie',
  'Ollie North',
  'Frontside 180',
  'Backside 180',
  'Pop Shuvit',
  'Frontside Shuvit',
  'Kickflip',
  'Heelflip',
  'Backside 360',
  'Frontside 360',
  'Backside Flip',
  'Frontside Flip',
  'Backside 360 Kickflip',
  'Frontside 360 Kickflip',
  'Bigspin',
  'Varial Kickflip',
  '360 Shuvit',
  'Late Backside Shuvit',
  'Late Frontside Shuvit',
  'Late Kickflip',
  'Varial Heelflip',
  'FS Bigspin',
  'Backside Heelflip',
  'Frontside Heelflip',
  'Frontside 360 Shuvit',
  'Pressure Flip',
  'Hardflip',
  'Inward Heelflip',
  '360 Flip',
  'Double Kickflip',
  'Bigspin Flip',
  'Dolphin Flip',
  'Impossible',
  'Double Heelflip',
  'FS Bigspin Flip',
  'BS Bigspin Heelflip',
  'FS Bigspin Heelflip',
  'Laser Flip',
  '360 Double Kickflip',
  '360 Hardflip',
  '360 Inward Heelflip',
];

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const stanceSuffix = (stance: Stance): string => {
  switch (stance) {
    case 'regular':
      return '';
    case 'fakie':
      return ' (Fakie)';
    case 'switch':
      return ' (Switch)';
    case 'nollie':
      return ' (Nollie)';
  }
};

export const TRICKS: Trick[] = FLATGROUND_BASES.flatMap((base) =>
  STANCES.map((stance) => ({
    id: `${slug(base)}-${stance}`,
    name: `${base}${stanceSuffix(stance)}`,
    base,
    stance,
  }))
);

/** Grinds and slides name their side up front: "Frontside 50-50 Grind". */
export const GRIND_SIDES = ['Frontside', 'Backside'] as const;
export type GrindSideName = (typeof GRIND_SIDES)[number];
export { GRIND_BASES, exitEndsFor, type PopEnd };

/** Flatground tricks that can be popped into a grind (the animation package decides which). */
export const GRIND_ENTRY_BASES = FLATGROUND_BASES.filter(canEnterGrind);

/**
 * Tricks offered out of a grind: a few flips, shuvs, 180s, and bigspins rather
 * than the whole catalog. Each pops off the tail, or off the nose as a nollie trick;
 * the grind decides which ends are free (see exitEndsFor).
 */
export const GRIND_EXIT_BASES = [
  'Kickflip',
  'Heelflip',
  'Pop Shuvit',
  'Frontside Shuvit',
  '360 Flip',
  'Frontside 180',
  'Backside 180',
  'Bigspin',
  'FS Bigspin',
].filter(canExitGrind);

/** A trick out of a grind, and the end it pops off. */
export interface GrindExit {
  base: string;
  end: PopEnd;
}

/**
 * A grind, optionally popped into off a flatground trick and out of off one
 * end: "Kickflip into Frontside 5-0 Grind Heelflip Out".
 */
export function grindTrick(base: string, side: GrindSideName, stance: Stance, entry?: string, exit?: GrindExit): Trick {
  const sided = `${side} ${base}`;
  const out = exit ? joinGrindExit(sided, exit.base, exit.end) : sided;
  const named = entry ? joinGrindBase(entry, out) : out;
  return { id: `${slug(named)}-${stance}`, name: `${named}${stanceSuffix(stance)}`, base: named, stance };
}

export function trickByBase(base: string, stance: Stance): Trick | undefined {
  return TRICKS.find((t) => t.base === base && t.stance === stance);
}

export function tricksForStance(stance: Stance): Trick[] {
  return TRICKS.filter((t) => t.stance === stance);
}

export function robotById(id: string): Robot | undefined {
  return ROBOTS.find((r) => r.id === id);
}
