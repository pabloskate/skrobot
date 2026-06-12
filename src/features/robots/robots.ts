import type { Stance, Trick } from '@/features/tricks';

export type Tier = 'beginner' | 'intermediate' | 'advanced';

export interface Robot {
  id: string;
  name: string;
  tier: Tier;
  tagline: string;
  /** Overall skill 1-10. Drives which tricks make the bag and at what consistency. */
  skill: number;
  /** Base trick names this robot loves — big consistency boost. */
  favorites: string[];
  /** Multipliers applied to non-regular stances. */
  stanceSkill: Record<Exclude<Stance, 'regular'>, number>;
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
}

const BEGINNER_STANCES = { fakie: 0.8, switch: 0.45, nollie: 0.5 };
const MID_STANCES = { fakie: 0.9, switch: 0.65, nollie: 0.7 };
const ADV_STANCES = { fakie: 0.95, switch: 0.82, nollie: 0.87 };

export const ROBOTS: Robot[] = [
  // Beginner
  { id: 'shifty', name: 'Shifty', tier: 'beginner', tagline: 'Shuvit specialist', skill: 2.5, favorites: ['Pop Shuvit', 'Frontside Shuvit'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 } },
  { id: 'baily', name: 'Baily', tier: 'beginner', tagline: 'Falls with style', skill: 2, favorites: ['Ollie'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#5b8def', accent: '#f2a541', variant: 1 } },
  { id: 'sacker', name: 'Sacker', tier: 'beginner', tagline: 'Brave, mostly', skill: 2.5, favorites: ['Backside 180'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#3d5a6c', accent: '#e0455c', variant: 2 } },
  { id: 'flipster', name: 'Flipster', tier: 'beginner', tagline: 'Kickflip kid', skill: 3, favorites: ['Kickflip'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#4f86f7', accent: '#f7c948', variant: 3 } },
  { id: 'tictac', name: 'Tictac', tier: 'beginner', tagline: 'Old school cruiser', skill: 2, favorites: ['Manual', 'Powerslide', 'Boneless'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#7bb661', accent: '#c8e6b0', variant: 0 } },
  { id: 'flipper', name: 'Flipper', tier: 'beginner', tagline: 'Heels over head', skill: 3, favorites: ['Heelflip'], stanceSkill: BEGINNER_STANCES, avatar: { body: '#41c9b4', accent: '#1d7a8c', variant: 1 } },
  // Intermediate
  { id: 'spine', name: 'Spine', tier: 'intermediate', tagline: 'Transition machine', skill: 5, favorites: ['Rock n Roll', 'Disaster', 'Axle Stall'], stanceSkill: MID_STANCES, avatar: { body: '#6fcf72', accent: '#2e7d32', variant: 2 } },
  { id: 'lanky', name: 'Lanky', tier: 'intermediate', tagline: 'Slides everything', skill: 5, favorites: ['Boardslide', 'Noseslide'], stanceSkill: MID_STANCES, avatar: { body: '#b0b7c3', accent: '#e0455c', variant: 3 } },
  { id: 'droopy', name: 'Droopy', tier: 'intermediate', tagline: 'Locked-in grinds', skill: 5.5, favorites: ['50-50 Grind', '5-0 Grind'], stanceSkill: MID_STANCES, avatar: { body: '#d6457a', accent: '#9be564', variant: 0 } },
  { id: 'wally', name: 'Wally', tier: 'intermediate', tagline: 'No-comply wizard', skill: 5, favorites: ['No Comply 180', 'Boneless'], stanceSkill: MID_STANCES, avatar: { body: '#c9a227', accent: '#8d99ae', variant: 1 } },
  { id: 'skater', name: 'Skater', tier: 'intermediate', tagline: 'Jack of all tricks', skill: 6, favorites: [], stanceSkill: MID_STANCES, avatar: { body: '#8d99ae', accent: '#ffd166', variant: 2 } },
  { id: 'wallride', name: 'Wallride', tier: 'intermediate', tagline: 'Defies gravity', skill: 5.5, favorites: ['Lipslide', 'Rock to Fakie'], stanceSkill: MID_STANCES, avatar: { body: '#9bd1f9', accent: '#4361ee', variant: 3 } },
  { id: 'jupiter', name: 'Jupiter', tier: 'intermediate', tagline: 'Spins like a planet', skill: 6, favorites: ['Bigspin', '360 Shuvit', 'FS Bigspin'], stanceSkill: MID_STANCES, avatar: { body: '#cfd2d9', accent: '#7b6cf6', variant: 0 } },
  // Advanced
  { id: 'freely', name: 'Freely', tier: 'advanced', tagline: 'Switch sorcerer', skill: 8, favorites: [], stanceSkill: { fakie: 1, switch: 0.97, nollie: 0.97 }, avatar: { body: '#5fc9f3', accent: '#f9b234', variant: 1 } },
  { id: 'olly', name: 'Olly', tier: 'advanced', tagline: 'Pop for days', skill: 8, favorites: ['Ollie', 'Frontside 180', 'Backside 180'], stanceSkill: ADV_STANCES, avatar: { body: '#e8e9ed', accent: '#f2a541', variant: 2 } },
  { id: 'smitty', name: 'Smitty', tier: 'advanced', tagline: 'Smith grind royalty', skill: 8.5, favorites: ['Smith Grind', 'Feeble Grind'], stanceSkill: ADV_STANCES, avatar: { body: '#aab2bd', accent: '#7b6cf6', variant: 3 } },
  { id: 'c360po', name: 'C360PO', tier: 'advanced', tagline: 'Fluent in 360s', skill: 8.5, favorites: ['360 Shuvit', '360 Flip', 'Laser Flip'], stanceSkill: ADV_STANCES, avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 0 } },
  { id: 'drone', name: 'Drone', tier: 'advanced', tagline: 'Cold, calculated, consistent', skill: 9, favorites: [], stanceSkill: ADV_STANCES, avatar: { body: '#9d6bce', accent: '#3ddad7', variant: 1 } },
  { id: 'tre', name: 'Tre', tier: 'advanced', tagline: 'Tre flips on demand', skill: 9, favorites: ['360 Flip'], stanceSkill: ADV_STANCES, avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 2 } },
];

export const ROBOT_BY_ID = new Map(ROBOTS.map((r) => [r.id, r]));

export const TIERS: { tier: Tier; label: string }[] = [
  { tier: 'beginner', label: 'Beginner' },
  { tier: 'intermediate', label: 'Intermediate' },
  { tier: 'advanced', label: 'Advanced' },
];

/** Deterministic per-robot-per-trick jitter in [0,1) so every bag feels hand-tuned. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const BAG_THRESHOLD = 0.25;

/**
 * Consistency (0-1) this robot has for a trick, or null if it's not in their bag.
 * Skill vs difficulty sets the baseline, favorites get a big boost, off-stance
 * tricks are scaled down, and a deterministic jitter keeps bags unique.
 */
export function robotConsistency(robot: Robot, trick: Trick): number | null {
  let c = 0.78 + (robot.skill - trick.difficulty) * 0.13;
  if (robot.favorites.includes(trick.base)) c += 0.22;
  if (trick.stance !== 'regular') c *= robot.stanceSkill[trick.stance];
  c += (hash01(robot.id + trick.id) - 0.5) * 0.12;
  c = Math.min(0.97, c);
  if (c < BAG_THRESHOLD) return null;
  return Math.round(c * 100) / 100;
}

/** The robot's full bag for a given trick pool: trickId -> consistency. */
export function buildBag(robot: Robot, pool: Trick[]): Map<string, number> {
  const bag = new Map<string, number>();
  for (const trick of pool) {
    const c = robotConsistency(robot, trick);
    if (c !== null) bag.set(trick.id, c);
  }
  return bag;
}
