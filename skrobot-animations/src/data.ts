import type { Robot, Stance, Trick } from './types';

export const ROBOTS: Robot[] = [
  { id: 'shifty', name: 'Shifty', avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 } },
  { id: 'baily', name: 'Baily', avatar: { body: '#5b8def', accent: '#f2a541', variant: 1 } },
  { id: 'sacker', name: 'Sacker', avatar: { body: '#7ea0b5', accent: '#e0455c', variant: 2 } },
  { id: 'nolly', name: 'Nolly', avatar: { body: '#9b59b6', accent: '#f1c40f', variant: 3 } },
];

const FLATGROUND_BASES = [
  'Ollie',
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
  'Hospital Flip',
  'Casper Flip',
  'Hardflip',
  'Inward Heelflip',
  '360 Flip',
  'Double Kickflip',
  'Bigspin Flip',
  'Dolphin Flip',
  'Impossible',
  'Double Heelflip',
  'FS Bigspin Flip',
  'Bigspin Heelflip',
  'FS Bigspin Heelflip',
  'Laser Flip',
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

export function trickByBase(base: string, stance: Stance): Trick | undefined {
  return TRICKS.find((t) => t.base === base && t.stance === stance);
}

export function tricksForStance(stance: Stance): Trick[] {
  return TRICKS.filter((t) => t.stance === stance);
}

export function robotById(id: string): Robot | undefined {
  return ROBOTS.find((r) => r.id === id);
}
