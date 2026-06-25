export type Stance = 'regular' | 'fakie' | 'switch' | 'nollie';
export type Category = 'flatground' | 'grinds' | 'other';

/**
 * What kind of skating a trick is — the unit a robot's identity is built from
 * (a robot "rides" a set of disciplines) and, for flatground, also the thing that
 * decides how much a non-regular stance hurts. The four flatground disciplines
 * (`shuvit`/`roll`/`rotation`/`flip`) double as stance-sensitivity families.
 */
export type Discipline =
  | 'shuvit'
  | 'roll'
  | 'rotation'
  | 'flip'
  | 'grind'
  | 'slide'
  | 'manual'
  | 'transition'
  | 'oldschool';

/** The flatground disciplines, in roughly the order they're learned. */
export type Family = 'shuvit' | 'roll' | 'rotation' | 'flip';

export interface Trick {
  id: string;
  name: string;
  base: string;
  stance: Stance;
  category: Category;
  /** 1 (easiest) to 10 (hardest). Stance variants bake in the stance load. */
  difficulty: number;
  /** The base difficulty of the trick (difficulty without the stance load). */
  baseDifficulty: number;
  /**
   * Hard floor on the robot skill needed to land this trick at all — a tier lock
   * that no focus/favorite boost can bypass. Undefined means no floor (the usual
   * difficulty curve decides). Late shuvits set this so only intermediate-and-up
   * robots get a shot. See `MIN_SKILL`.
   */
  minSkill?: number;
}

export interface TrickPool {
  pool: Trick[];
  poolLabel: string;
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
  ['Late Backside Shuvit', 5],
  ['Late Frontside Shuvit', 5],
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

/**
 * Flatground stance-sensitivity family for each base, keyed by name. Drives how
 * much a non-regular stance loads the trick: a shuvit barely cares about stance,
 * a flip cares a lot. Anything not listed falls back to `flip` (the safe, most
 * stance-sensitive assumption for tech tricks).
 */
const FLATGROUND_FAMILY: Record<string, Family> = {
  Ollie: 'roll',
  'Pop Shuvit': 'shuvit',
  'Frontside Shuvit': 'shuvit',
  '360 Shuvit': 'shuvit',
  'Frontside 360 Shuvit': 'shuvit',
  'Late Backside Shuvit': 'shuvit',
  'Late Frontside Shuvit': 'shuvit',
  'Frontside 180': 'rotation',
  'Backside 180': 'rotation',
  'Backside 360': 'rotation',
  'Frontside 360': 'rotation',
  Bigspin: 'rotation',
  'FS Bigspin': 'rotation',
  // everything else flatground (kickflip & derivatives, varials, combos) is `flip`
};

/**
 * Hard skill floor for "tier-locked" tricks, keyed by base name. Unlike difficulty
 * (which a high-skill robot can overcome via the consistency curve, focus, and
 * favorites), this is an absolute gate: a robot below the floor never gets the
 * trick. Late shuvits are intermediate-and-up only — the lowest intermediate robot
 * sits at skill 5 and beginners top out around 3.2, so 4.5 cleanly splits the
 * tiers. Bases not listed have no floor.
 */
const MIN_SKILL: Record<string, number> = {
  'Late Backside Shuvit': 4.5,
  'Late Frontside Shuvit': 4.5,
};

/** Discipline for each grind/other base (flatground disciplines come from FAMILY). */
const SPECIAL_DISCIPLINE: Record<string, Discipline> = {
  // grinds category, split into true grinds vs slides
  '50-50 Grind': 'grind',
  '5-0 Grind': 'grind',
  'Crooked Grind': 'grind',
  'Salad Grind': 'grind',
  'Suski Grind': 'grind',
  'Smith Grind': 'grind',
  'Feeble Grind': 'grind',
  Nosegrind: 'grind',
  'Overcrooked Grind': 'grind',
  Hurricane: 'grind',
  'Willy Grind': 'grind',
  Boardslide: 'slide',
  Noseslide: 'slide',
  Tailslide: 'slide',
  Lipslide: 'slide',
  Bluntslide: 'slide',
  'Noseblunt Slide': 'slide',
  Sugarcane: 'slide',
  // other category
  Manual: 'manual',
  'Nose Manual': 'manual',
  'Hippie Jump': 'oldschool',
  Caveman: 'oldschool',
  Powerslide: 'oldschool',
  Boneless: 'oldschool',
  'No Comply 180': 'oldschool',
  'Drop In': 'transition',
  'Rock to Fakie': 'transition',
  'Tail Stall': 'transition',
  'Nose Stall': 'transition',
  'Axle Stall': 'transition',
  'Rock n Roll': 'transition',
  'Fakie Bigspin Stall': 'transition',
  Sweeper: 'transition',
  Disaster: 'transition',
  'Blunt to Rock': 'transition',
  'Noseblunt Stall': 'transition',
  'Blunt to Fakie': 'transition',
};

/** The flatground stance-sensitivity family of a base trick. */
export function trickFamily(base: string): Family {
  return FLATGROUND_FAMILY[base] ?? 'flip';
}

/** The discipline (skating type) of a trick — robot identity is built from these. */
export function trickDiscipline(trick: Trick): Discipline {
  if (trick.category === 'flatground') return trickFamily(trick.base);
  return SPECIAL_DISCIPLINE[trick.base] ?? 'transition';
}

/**
 * Extra difficulty a non-regular stance adds to a trick. It is the product of how
 * foreign the stance is (`STANCE_BASE_COST`) and how stance-sensitive the trick is
 * (`STANCE_SENSITIVITY` by family): a switch shuvit barely moves, a switch flip is
 * close to relearning to skate. Regular and all non-flatground tricks are 0.
 */
const STANCE_BASE_COST: Record<Stance, number> = {
  regular: 0,
  fakie: 1.0,
  nollie: 2.0,
  switch: 2.5,
};

const STANCE_SENSITIVITY: Record<Family, number> = {
  shuvit: 0.25,
  roll: 0.5,
  rotation: 0.6,
  flip: 1.0,
};

export function stanceLoad(trick: Trick): number {
  if (trick.stance === 'regular' || trick.category !== 'flatground') return 0;
  return STANCE_BASE_COST[trick.stance] * STANCE_SENSITIVITY[trickFamily(trick.base)];
}

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];

function stanceName(stance: Stance, base: string): string {
  if (stance === 'regular') return base;
  if (base === 'Ollie') {
    if (stance === 'nollie') return 'Nollie';
    return `${stance[0].toUpperCase()}${stance.slice(1)} Ollie`;
  }
  return `${stance[0].toUpperCase()}${stance.slice(1)} ${base}`;
}

function build(): Trick[] {
  const tricks: Trick[] = [];
  for (const [base, difficulty] of FLATGROUND) {
    for (const stance of STANCES) {
      const load = STANCE_BASE_COST[stance] * STANCE_SENSITIVITY[trickFamily(base)];
      tricks.push({
        id: slug(`${stance}-${base}`),
        name: stanceName(stance, base),
        base,
        stance,
        category: 'flatground',
        difficulty: Math.min(10, Math.round((difficulty + load) * 10) / 10),
        baseDifficulty: difficulty,
        minSkill: MIN_SKILL[base],
      });
    }
  }
  for (const [base, difficulty] of GRINDS) {
    tricks.push({ id: slug(base), name: base, base, stance: 'regular', category: 'grinds', difficulty, baseDifficulty: difficulty, minSkill: MIN_SKILL[base] });
  }
  for (const [base, difficulty] of OTHER) {
    tricks.push({ id: slug(base), name: base, base, stance: 'regular', category: 'other', difficulty, baseDifficulty: difficulty, minSkill: MIN_SKILL[base] });
  }
  return tricks;
}

export const TRICKS: Trick[] = build();

export const TRICK_BY_ID = new Map(TRICKS.map((t) => [t.id, t]));

export function tricksFor(category: Category): Trick[] {
  return TRICKS.filter((t) => t.category === category);
}

/**
 * The routed app currently plays flatground-only games. Keep that product choice
 * next to the catalog so app routes can stay focused on screen transitions.
 */
export function defaultRoutedTrickPool(): TrickPool {
  return { pool: tricksFor('flatground'), poolLabel: 'Flatground' };
}

/** 1-3 difficulty grade for display (easy / medium / hard). */
export function grade(t: Trick): 1 | 2 | 3 {
  return t.difficulty <= 3 ? 1 : t.difficulty <= 6 ? 2 : 3;
}

/**
 * Short, plain-language explanation of each base trick, keyed by base name.
 * Stance variants reuse their base description (a Switch Kickflip is still a
 * kickflip). Surfaced on the robot profile's "tricks they can do" list.
 */
const DESCRIPTIONS: Record<string, string> = {
  // Flatground
  Ollie: 'Snap the tail and slide your front foot up to pop the whole board into the air — the move everything else is built on.',
  'Frontside 180': 'An ollie with a 180° turn, rotating your chest to face the way you came.',
  'Backside 180': 'An ollie with a 180° turn, spinning with your back leading the way.',
  'Pop Shuvit': 'Scoop the tail so the board spins a flat 180° under your feet while you hop.',
  'Frontside Shuvit': 'A shuvit scooped the other way, the board spinning toward your toes.',
  'Late Backside Shuvit': 'A pop shuvit held late — the board pops up flat, hangs, then scoops its 180° at the last instant before the catch.',
  'Late Frontside Shuvit': 'A frontside shuvit with the scoop delayed — pop, float, then whip the board around toes-side right before you land.',
  Kickflip: 'Flick your front foot off the corner so the board does a full barrel-roll flip.',
  Heelflip: 'A kickflip flicked off the heel side, spinning the board the opposite direction.',
  'Backside 360': 'A full 360° ollie spun backside — double the rotation, double the nerve.',
  'Frontside 360': 'A full 360° ollie spun frontside, unwinding your shoulders all the way around.',
  'Backside Flip': 'A kickflip and a backside 180 at once — the board flips as you spin behind you.',
  'Frontside Flip': 'A kickflip folded into a frontside 180 — flip and rotation in one pop.',
  Bigspin: 'A 360° shuvit paired with a 180° body turn, board and rider spinning together.',
  'Varial Kickflip': 'A kickflip blended with a pop shuvit so the board flips and spins 180° at once.',
  '360 Shuvit': 'A shuvit spun a full 360° beneath you — all rotation, no flip.',
  'Varial Heelflip': 'A heelflip mixed with a frontside shuvit, flipping and spinning together.',
  'FS Bigspin': 'A bigspin spun the frontside way — 360° board spin with a frontside body turn.',
  'Backside Heelflip': 'A heelflip wrapped into a backside 180.',
  'Frontside Heelflip': 'A heelflip wrapped into a frontside 180.',
  'Frontside 360 Shuvit': 'A 360 shuvit scooped frontside instead of backside.',
  'Pressure Flip': 'Pop off the back foot to flip and spin the board in a tight, low rotation.',
  'Hospital Flip': 'A half kickflip caught mid-flip with your foot, then flicked back over.',
  'Casper Flip': 'Flip the board into an upside-down casper, then kick it back upright.',
  Hardflip: 'A kickflip and frontside shuvit fused so the board flips vertically between your legs.',
  'Inward Heelflip': 'A heelflip combined with a backside shuvit, spinning in toward you.',
  '360 Flip': 'The tre flip — a 360 shuvit and a kickflip together in one spinning, flipping motion.',
  'Double Kickflip': 'A kickflip flicked hard enough to roll the board over twice before you land.',
  'Bigspin Flip': 'A bigspin with a kickflip mixed in — flipping while spinning a full 360°.',
  'Dolphin Flip': 'A front-foot flip that rolls the board end over end like a leaping dolphin.',
  Impossible: 'Wrap the board vertically around your back foot in a full end-over-end loop.',
  'Double Heelflip': 'A heelflip spun with enough flick to flip the board over twice.',
  'FS Bigspin Flip': 'A frontside bigspin with a kickflip folded in.',
  'Bigspin Heelflip': 'A bigspin paired with a heelflip instead of a kickflip.',
  'FS Bigspin Heelflip': 'A frontside bigspin combined with a heelflip.',
  'Laser Flip': 'A 360 shuvit and a heelflip together — the gnarliest spinning flip there is.',
  // Grinds
  '50-50 Grind': 'Grind along an edge on both trucks at once — the first grind everyone learns.',
  Boardslide: 'Slide across an obstacle with the deck centered on it, board perpendicular.',
  Noseslide: 'Slide along the edge on the underside of the nose.',
  '5-0 Grind': 'Grind on the back truck only, holding a manual along the edge.',
  'Willy Grind': 'A playful one-truck grind balanced toward the nose.',
  'Crooked Grind': 'A nosegrind ridden at an angle, the board cocked across the edge.',
  Tailslide: 'Slide along the edge on the tail, the back of the board leading.',
  Lipslide: 'Swing the board over the obstacle first, then slide it like a boardslide.',
  'Salad Grind': 'A back-truck grind with the board turned slightly off its axis.',
  'Suski Grind': 'A frontside crooked grind — nose-heavy and angled.',
  'Smith Grind': 'A 5-0 with the back truck grinding and the front dipped below the edge.',
  'Feeble Grind': 'A smith on the opposite side — front truck over the edge, back truck grinding.',
  Nosegrind: 'Grind on the front truck alone with your weight over the nose.',
  'Overcrooked Grind': 'A crooked grind that hangs the nose past the end of the rail.',
  Hurricane: 'Spin in backside and lock into a fakie 5-0 — a stylish transition staple.',
  Bluntslide: 'Slide on the tail in a blunt position with the wheels above the edge.',
  Sugarcane: 'A wrapped backside slide with the board pinched around the lip.',
  'Noseblunt Slide': 'Slide on the nose in a blunt position, wheels above the edge — proper tech.',
  // Other
  'Hippie Jump': 'Jump straight up and land back on the board as it rolls under an obstacle.',
  Caveman: 'Start with the board in your hands, drop it down and jump on to roll away.',
  Powerslide: 'Turn the board sideways and slide the wheels to scrub speed or stop.',
  Manual: 'Balance and roll on just the back two wheels — a wheelie on your board.',
  Boneless: 'Plant your front foot, grab the board, and leap, pulling it back under you.',
  'No Comply 180': 'Step the front foot down, pop the tail, and spin the board 180° with the back foot.',
  'Drop In': 'Set the tail on the coping and lean in to roll down the transition.',
  'Rock to Fakie': 'Rock the front trucks over the coping, then roll back down fakie.',
  'Tail Stall': 'Stall balanced on the tail atop the coping before rolling back in.',
  'Nose Stall': 'Stall balanced on the nose at the lip before dropping back in.',
  'Nose Manual': 'A manual balanced on the front two wheels instead of the back.',
  'Axle Stall': 'Stall on both trucks atop the coping, then drop back into the ramp.',
  'Rock n Roll': 'Rock over the coping, pivot 180°, and roll back down forward.',
  'Fakie Bigspin Stall': 'Approach fakie, bigspin into a stall on the lip, and ride away.',
  Sweeper: 'A transition stall where the back foot sweeps the board around off the coping.',
  Disaster: 'Ollie onto the coping so the board rests across it, then roll back in.',
  'Blunt to Rock': 'Stall in a tail blunt on the lip, then settle into a rock before rolling in.',
  'Noseblunt Stall': 'Stall in a noseblunt on the coping — nose down, wheels over the lip.',
  'Blunt to Fakie': 'Pop up into a blunt stall on the coping, then come back in fakie.',
};

/** Plain-language description of a trick (keyed by its base trick name). */
export function trickDescription(trick: Trick): string {
  return DESCRIPTIONS[trick.base] ?? '';
}
