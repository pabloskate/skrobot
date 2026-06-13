export type Stance = 'regular' | 'fakie' | 'switch' | 'nollie';
export type Category = 'flatground' | 'grinds' | 'other';

export interface Trick {
  id: string;
  name: string;
  base: string;
  stance: Stance;
  category: Category;
  /** 1 (easiest) to 10 (hardest). Stance variants bake in a bump. */
  difficulty: number;
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// [name, difficulty]
const FLATGROUND: [string, number][] = [
  ['Ollie', 1],
  ['Frontside 180', 2],
  ['Backside 180', 2],
  ['Pop Shuvit', 2],
  ['Frontside Shuvit', 2],
  ['Kickflip', 3],
  ['Heelflip', 4],
  ['Backside 360', 5],
  ['Frontside 360', 5],
  ['Backside Flip', 5],
  ['Frontside Flip', 5],
  ['Bigspin', 5],
  ['Varial Kickflip', 5],
  ['360 Shuvit', 5],
  ['Varial Heelflip', 6],
  ['FS Bigspin', 6],
  ['Backside Heelflip', 6],
  ['Frontside Heelflip', 6],
  ['Frontside 360 Shuvit', 6],
  ['Pressure Flip', 6],
  ['Hospital Flip', 6],
  ['Casper Flip', 6],
  ['Hardflip', 7],
  ['Inward Heelflip', 7],
  ['360 Flip', 7],
  ['Double Kickflip', 7],
  ['Bigspin Flip', 7],
  ['Dolphin Flip', 7],
  ['Impossible', 8],
  ['Double Heelflip', 8],
  ['FS Bigspin Flip', 8],
  ['Bigspin Heelflip', 8],
  ['FS Bigspin Heelflip', 8],
  ['Laser Flip', 9],
];

const GRINDS: [string, number][] = [
  ['50-50 Grind', 2],
  ['Boardslide', 2],
  ['Noseslide', 3],
  ['5-0 Grind', 4],
  ['Willy Grind', 4],
  ['Crooked Grind', 5],
  ['Tailslide', 5],
  ['Lipslide', 5],
  ['Salad Grind', 5],
  ['Suski Grind', 5],
  ['Smith Grind', 6],
  ['Feeble Grind', 6],
  ['Nosegrind', 6],
  ['Overcrooked Grind', 6],
  ['Hurricane', 7],
  ['Bluntslide', 8],
  ['Sugarcane', 8],
  ['Noseblunt Slide', 9],
];

const OTHER: [string, number][] = [
  ['Hippie Jump', 1],
  ['Caveman', 1],
  ['Powerslide', 1],
  ['Manual', 2],
  ['Boneless', 2],
  ['No Comply 180', 2],
  ['Drop In', 2],
  ['Rock to Fakie', 2],
  ['Tail Stall', 2],
  ['Nose Stall', 2],
  ['Nose Manual', 3],
  ['Axle Stall', 3],
  ['Rock n Roll', 3],
  ['Fakie Bigspin Stall', 4],
  ['Sweeper', 4],
  ['Disaster', 5],
  ['Blunt to Rock', 6],
  ['Noseblunt Stall', 6],
  ['Blunt to Fakie', 7],
];

const STANCE_BUMP: Record<Stance, number> = {
  regular: 0,
  fakie: 0.5,
  nollie: 1.5,
  switch: 2,
};

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];

function stanceName(stance: Stance, base: string): string {
  return stance === 'regular' ? base : `${stance[0].toUpperCase()}${stance.slice(1)} ${base}`;
}

function build(): Trick[] {
  const tricks: Trick[] = [];
  for (const [base, difficulty] of FLATGROUND) {
    for (const stance of STANCES) {
      tricks.push({
        id: slug(`${stance}-${base}`),
        name: stanceName(stance, base),
        base,
        stance,
        category: 'flatground',
        difficulty: Math.min(10, difficulty + STANCE_BUMP[stance]),
      });
    }
  }
  for (const [base, difficulty] of GRINDS) {
    tricks.push({ id: slug(base), name: base, base, stance: 'regular', category: 'grinds', difficulty });
  }
  for (const [base, difficulty] of OTHER) {
    tricks.push({ id: slug(base), name: base, base, stance: 'regular', category: 'other', difficulty });
  }
  return tricks;
}

export const TRICKS: Trick[] = build();

export const TRICK_BY_ID = new Map(TRICKS.map((t) => [t.id, t]));

export function tricksFor(category: Category): Trick[] {
  return TRICKS.filter((t) => t.category === category);
}

/** 1-3 difficulty grade for display (easy / medium / hard). */
export function grade(t: Trick): 1 | 2 | 3 {
  return t.difficulty <= 3 ? 1 : t.difficulty <= 6 ? 2 : 3;
}
