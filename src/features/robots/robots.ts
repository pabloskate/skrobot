import type { Discipline, Stance, Trick } from '@/features/tricks';
import { stanceLoad, trickDiscipline } from '@/features/tricks';

export type Tier = 'beginner' | 'intermediate' | 'advanced';

type OffStance = Exclude<Stance, 'regular'>;

export interface RpsTaunts {
  countdown: string[];
  win: string[];
  lose: string[];
  tie: string[];
}

export interface Robot {
  id: string;
  name: string;
  tier: Tier;
  tagline: string;
  /** A sentence or two of personality + skating style, shown on the robot profile. */
  summary: string;
  /** Overall skill 1-10. A trick lands well when it sits below this; above it, falls off fast. */
  skill: number;
  /** Disciplines this robot rides at all. Tricks outside these are never in their bag. */
  disciplines: Discipline[];
  /** Per-discipline consistency boost — what this robot is known for. */
  focus?: Partial<Record<Discipline, number>>;
  /** Base trick names this robot is famous for — signature chips + a consistency boost. */
  favorites: string[];
  /** Base tricks this robot stylistically refuses, even if skill would allow them. */
  excludes?: string[];
  /**
   * Per-stance comfort, 0..1 (regular is implicitly 1). Higher means a non-regular
   * stance loads the trick less. Omit to use the tier default.
   */
  stanceComfort?: Partial<Record<OffStance, number>>;
  /** A stance this robot specialises in — extra boost to every trick done in it. */
  signatureStance?: Stance;
  /** Hard stance restriction (e.g. an old-school cruiser only rides regular/fakie). */
  allowedStances?: Stance[];
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
  /** Trash talk during the rock-paper-scissors toss. */
  rpsTaunts: RpsTaunts;
}

/**
 * Default per-stance comfort by tier. Beginners are nearly lost off-stance,
 * advanced robots are close to ambidextrous. Individual robots override this
 * (a switch sorcerer, a nollie specialist) via `stanceComfort`.
 */
const TIER_STANCE_COMFORT: Record<Tier, Record<OffStance, number>> = {
  beginner: { fakie: 0.4, nollie: 0.15, switch: 0.1 },
  intermediate: { fakie: 0.6, nollie: 0.4, switch: 0.35 },
  advanced: { fakie: 0.85, nollie: 0.7, switch: 0.65 },
};

const TIE = ['Tie. Again.', 'Dead heat. Throw once more.', 'One more time.'];

export const ROBOTS: Robot[] = [
  // Beginner
  {
    id: 'shifty',
    name: 'Shifty',
    tier: 'beginner',
    tagline: 'Shuvit specialist',
    summary:
      "Shifty only really trusts one move — the shuvit — and scoops it every chance it gets. Loose and a little sketchy, but it never stops popping the board around under its feet.",
    skill: 3,
    disciplines: ['roll', 'shuvit', 'rotation'],
    focus: { shuvit: 0.18 },
    favorites: ['Pop Shuvit', 'Frontside Shuvit'],
    avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
    rpsTaunts: {
      countdown: ['You sure about that throw?', 'Here we go...'],
      win: ['Shifty takes first!', 'I set, you sweat.'],
      lose: ['You got it. This time.'],
      tie: TIE,
    },
  },
  {
    id: 'baily',
    name: 'Baily',
    tier: 'beginner',
    tagline: 'Falls with style',
    summary:
      'Baily bails more than it lands, but always with flair. Expect ollies, hippie jumps, and the occasional faceplant — it is here for the good time, not the win.',
    skill: 2,
    disciplines: ['roll', 'shuvit', 'rotation', 'manual', 'oldschool'],
    favorites: ['Ollie', 'Hippie Jump', 'Caveman'],
    avatar: { body: '#5b8def', accent: '#f2a541', variant: 1 },
    rpsTaunts: {
      countdown: ['Here goes nothing!', 'Okay, no take-backs.'],
      win: ["Baily's going first!", 'Style points for winning the toss.'],
      lose: ['Ugh, figures.', 'I fell at the first hurdle.'],
      tie: ['Again! I was not ready.', 'Best two out of three?'],
    },
  },
  {
    id: 'sacker',
    name: 'Sacker',
    tier: 'beginner',
    tagline: 'Brave, mostly',
    summary:
      'Sacker will try anything once — usually a backside 180, usually with its eyes half shut. More courage than control, but you have to respect the send.',
    skill: 2.6,
    disciplines: ['roll', 'shuvit', 'rotation'],
    favorites: ['Backside 180'],
    avatar: { body: '#3d5a6c', accent: '#e0455c', variant: 2 },
    rpsTaunts: {
      countdown: ["I'm feeling lucky.", 'Brave throw, human.'],
      win: ['Sacker sets!', 'Bravery pays off.'],
      lose: ['Brave, mostly.', 'Next time.'],
      tie: ['One more time!', 'Tie? How brave.'],
    },
  },
  {
    id: 'flipster',
    name: 'Flipster',
    tier: 'beginner',
    tagline: 'Kickflip kid',
    summary:
      "Flipster learned the kickflip last week and hasn't stopped since. It's the only flip trick it really has — but it's got the ollies, shuvits and 180s underneath it, like anyone who can kickflip does.",
    skill: 3.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Kickflip'],
    excludes: ['Heelflip'],
    avatar: { body: '#4f86f7', accent: '#f7c948', variant: 3 },
    rpsTaunts: {
      countdown: ['Kickflip of the coin.', 'Flip it.'],
      win: ['Flipster flips first!', 'First flip is mine.'],
      lose: ['No, I wanted to flip!', 'You flipped the toss.'],
      tie: ['Tie? Flip again!', 'Stale flip.'],
    },
  },
  {
    id: 'tictac',
    name: 'Tictac',
    tier: 'beginner',
    tagline: 'Old school cruiser',
    summary:
      'Tictac skates like it is 1985 — manuals, powerslides, bonelesses, and not a flip trick in sight. Pure cruising energy, low on tech, high on style.',
    skill: 2.5,
    disciplines: ['roll', 'rotation', 'manual', 'oldschool', 'transition'],
    favorites: ['Manual', 'Powerslide', 'Boneless', 'Caveman'],
    allowedStances: ['regular', 'fakie'],
    avatar: { body: '#7bb661', accent: '#c8e6b0', variant: 0 },
    rpsTaunts: {
      countdown: ['Old school rules.', 'Cruiser ready.'],
      win: ["Tictac's turn!", 'Old school goes first.'],
      lose: ['You got me.', 'Classic setup by you.'],
      tie: ['Honor system — again.', 'Cruise into a rematch.'],
    },
  },
  {
    id: 'flipper',
    name: 'Flipper',
    tier: 'beginner',
    tagline: 'Heels over head',
    summary:
      'Flipper is all about the heelflip and that satisfying flick of the heel. Kickflips? Never heard of them. It commits to the heel side and rarely strays.',
    skill: 3.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Heelflip'],
    excludes: ['Kickflip'],
    avatar: { body: '#41c9b4', accent: '#1d7a8c', variant: 1 },
    rpsTaunts: {
      countdown: ['Heels over head.', 'Heel flip the coin.'],
      win: ['Flipper first!', 'Heel yeah.'],
      lose: ['That did not heel.', 'Heads, you win.'],
      tie: ['Best two out of three?', 'Heel-to-heel tie.'],
    },
  },
  // Intermediate
  {
    id: 'spine',
    name: 'Spine',
    tier: 'intermediate',
    tagline: 'Transition machine',
    summary:
      'Spine lives on the ramp — stalls, rock n rolls, and disasters are its bread and butter. Put it on transition and it will grind you down; flatground, less so.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'transition', 'slide'],
    focus: { transition: 0.2 },
    favorites: ['Rock n Roll', 'Disaster', 'Axle Stall'],
    avatar: { body: '#6fcf72', accent: '#2e7d32', variant: 2 },
    rpsTaunts: {
      countdown: ['Transition or nothing.', 'Drop in...'],
      win: ['Spine sets the tone.', 'First drop is mine.'],
      lose: ['You got the drop.', 'Next transition is yours.'],
      tie: ['Round two.', 'Stall for a rematch.'],
    },
  },
  {
    id: 'lanky',
    name: 'Lanky',
    tier: 'intermediate',
    tagline: 'Slides everything',
    summary:
      "Lanky's long limbs lock into anything that slides — boardslides and noseslides for days. Its flatground game is nothing special, but on a rail it is a problem.",
    skill: 5,
    disciplines: ['roll', 'shuvit', 'rotation', 'slide'],
    focus: { slide: 0.2 },
    favorites: ['Boardslide', 'Noseslide', 'Tailslide'],
    avatar: { body: '#b0b7c3', accent: '#e0455c', variant: 3 },
    rpsTaunts: {
      countdown: ['Slide into it.', 'Long limbs, long odds.'],
      win: ['Lanky goes first.', 'Slid into first.'],
      lose: ['Slim margin.', 'You slid by me.'],
      tie: ['Stalemate? How boring.', 'Slide it again.'],
    },
  },
  {
    id: 'droopy',
    name: 'Droopy',
    tier: 'intermediate',
    tagline: 'Locked-in grinds',
    summary:
      'Droopy finds the lock-in and never lets go. A grind specialist that will out-balance you on any rail, though it keeps both feet near the ground.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'grind'],
    focus: { grind: 0.2 },
    favorites: ['50-50 Grind', '5-0 Grind', 'Salad Grind', 'Suski Grind'],
    avatar: { body: '#d6457a', accent: '#9be564', variant: 0 },
    rpsTaunts: {
      countdown: ['Locked and loaded.', 'Stay locked.'],
      win: ['Droopy sets.', 'Locked in first.'],
      lose: ['Grind harder next time.', 'Lock slipped.'],
      tie: ['Again. Stay locked.', 'Grind to a tie.'],
    },
  },
  {
    id: 'wally',
    name: 'Wally',
    tier: 'intermediate',
    tagline: 'No-comply wizard',
    summary:
      'Wally pops no-complies and bonelesses out of nowhere — old-school wizardry with a modern twist. Tricky to read, and a lot of fun to watch.',
    skill: 5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'oldschool', 'manual'],
    focus: { oldschool: 0.2 },
    favorites: ['No Comply 180', 'Boneless'],
    avatar: { body: '#c9a227', accent: '#8d99ae', variant: 1 },
    rpsTaunts: {
      countdown: ['No comply? No problem.', 'Wizard incoming.'],
      win: ["Wally's up first!", 'No comply, first try.'],
      lose: ['You complied.', 'Wizard needs a retry.'],
      tie: ['Comply with a rematch.', 'Magic fizzled.'],
    },
  },
  {
    id: 'nolly',
    name: 'Nolly',
    tier: 'intermediate',
    tagline: 'Lives on the nose',
    summary:
      "Nolly does everything off the nose. Its nollie flips come out cleaner than most skaters' regular ones — flip it the normal way and it suddenly looks human. Proof that stance and trick are two different skills.",
    skill: 6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
    signatureStance: 'nollie',
    stanceComfort: { nollie: 0.95, fakie: 0.6, switch: 0.4 },
    avatar: { body: '#f6a5c0', accent: '#3a2e4d', variant: 2 },
    rpsTaunts: {
      countdown: ['Off the nose...', 'Nollie or nothing.'],
      win: ['Nolly noses ahead.', 'First, off the nose.'],
      lose: ['Tail beat the nose.', 'You popped it better.'],
      tie: ['Nose to nose. Again.', 'Re-pop it.'],
    },
  },
  {
    id: 'skater',
    name: 'Skater',
    tier: 'intermediate',
    tagline: 'Jack of all tricks',
    summary:
      'Skater has no specialty and no glaring weakness — a solid all-rounder that will match you trick for trick across the whole board. Master of none, dangerous everywhere.',
    skill: 6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide', 'manual', 'transition', 'oldschool'],
    favorites: [],
    avatar: { body: '#8d99ae', accent: '#ffd166', variant: 2 },
    rpsTaunts: {
      countdown: ['Jack of all throws.', 'Well-rounded toss.'],
      win: ['Skater sets.', 'Jack wins the toss.'],
      lose: ['Fair toss.', 'Master of none today.'],
      tie: ['Evenly matched.', 'Jack of all ties.'],
    },
  },
  {
    id: 'wallride',
    name: 'Wallride',
    tier: 'intermediate',
    tagline: 'Defies gravity',
    summary:
      'Wallride treats walls like floors and gravity like a suggestion. Strong on lips and stalls, with a few spins up its sleeve when you least expect them.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'slide', 'transition'],
    focus: { transition: 0.15, rotation: 0.1 },
    favorites: ['Lipslide', 'Rock to Fakie', 'Fakie Bigspin Stall'],
    avatar: { body: '#9bd1f9', accent: '#4361ee', variant: 3 },
    rpsTaunts: {
      countdown: ['Defying gravity...', 'Ride the wall.'],
      win: ['Wallride sets first.', 'Gravity loses.'],
      lose: ['Gravity wins.', 'Fell off the wall.'],
      tie: ['Air mail — send it again.', 'Wall-to-wall tie.'],
    },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    tier: 'intermediate',
    tagline: 'Spins like a planet',
    summary:
      'Jupiter loves rotation — bigspins and 360 shuvits orbit out of its feet effortlessly. The more spin a trick has, the happier it gets.',
    skill: 6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { rotation: 0.2, shuvit: 0.1 },
    favorites: ['Bigspin', '360 Shuvit', 'FS Bigspin', 'Frontside 360 Shuvit'],
    avatar: { body: '#cfd2d9', accent: '#7b6cf6', variant: 0 },
    rpsTaunts: {
      countdown: ['Spin the planets.', 'Planetary alignment...'],
      win: ['Jupiter rotates first.', 'Planetary priority.'],
      lose: ['Orbit shifted.', 'You spun the toss.'],
      tie: ['Planetary alignment.', 'Spin it again.'],
    },
  },
  // Advanced
  {
    id: 'freely',
    name: 'Freely',
    tier: 'advanced',
    tagline: 'Switch sorcerer',
    summary:
      'Freely is fluent in every stance — switch, nollie, fakie, it is all the same. There is no off-foot to exploit here; it skates a flawless mirror of itself.',
    skill: 8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
    stanceComfort: { fakie: 0.97, nollie: 0.95, switch: 0.92 },
    avatar: { body: '#5fc9f3', accent: '#f9b234', variant: 1 },
    rpsTaunts: {
      countdown: ['Switch it up.', 'Freestyle toss.'],
      win: ['Freely, first and switch.', 'Sorcery starts first.'],
      lose: ['You switch better than me.', 'Spell broken.'],
      tie: ['Switching gears — again.', 'Mirror spell.'],
    },
  },
  {
    id: 'olly',
    name: 'Olly',
    tier: 'advanced',
    tagline: 'Pop for days',
    summary:
      'Olly has pop for days and uses every inch of it — towering ollies, 180s, and 360s. If it gets off the ground, it is landing it. Just do not ask it to flip the board.',
    skill: 8,
    disciplines: ['roll', 'shuvit', 'rotation'],
    focus: { roll: 0.15, rotation: 0.15 },
    favorites: ['Ollie', 'Frontside 180', 'Backside 180', 'Backside 360', 'Frontside 360'],
    avatar: { body: '#e8e9ed', accent: '#f2a541', variant: 2 },
    rpsTaunts: {
      countdown: ['Pop for days.', 'Pop it high.'],
      win: ['Olly pops first.', 'Pop goes first.'],
      lose: ['You popped that.', 'Low pop.'],
      tie: ['Pop it again.', 'Equal pop.'],
    },
  },
  {
    id: 'smitty',
    name: 'Smitty',
    tier: 'advanced',
    tagline: 'Smith grind royalty',
    summary:
      'Smitty is grind royalty, ruling the rails with smiths, feebles, and overcrookeds. Bow down — its lock-ins are very nearly flawless.',
    skill: 8.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide'],
    focus: { grind: 0.2 },
    favorites: ['Smith Grind', 'Feeble Grind', 'Overcrooked Grind', 'Hurricane'],
    avatar: { body: '#aab2bd', accent: '#7b6cf6', variant: 3 },
    rpsTaunts: {
      countdown: ['Smith grind royalty.', 'Bow to the crown.'],
      win: ['Smitty sets. Bow down.', 'Royal first set.'],
      lose: ['Lucky toss.', 'The crown slips.'],
      tie: ['Royal rematch.', 'Noble tie.'],
    },
  },
  {
    id: 'c360po',
    name: 'C360PO',
    tier: 'advanced',
    tagline: 'Fluent in 360s',
    summary:
      'C360PO computes rotation like a machine — tre flips, laser flips, and every big-spinning variant in between. Calculated, precise, and very hard to copy.',
    skill: 8.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.15, rotation: 0.1 },
    favorites: ['360 Shuvit', '360 Flip', 'Laser Flip', 'Bigspin Flip', 'Bigspin Heelflip'],
    avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 0 },
    rpsTaunts: {
      countdown: ['Calculating probability...', 'Rotational analysis...'],
      win: ['C360PO sets. Optimal.', '360 degrees of first.'],
      lose: ['Variance detected.', 'Non-optimal outcome.'],
      tie: ['Tie probability: 33%. Again.', 'Recalculate.'],
    },
  },
  {
    id: 'drone',
    name: 'Drone',
    tier: 'advanced',
    tagline: 'Cold, calculated, consistent',
    summary:
      'Drone has no favorites and no flair — just cold, relentless consistency across the entire trick list. It will not dazzle you; it will simply never miss.',
    skill: 9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide', 'manual', 'transition', 'oldschool'],
    favorites: [],
    avatar: { body: '#9d6bce', accent: '#3ddad7', variant: 1 },
    rpsTaunts: {
      countdown: ['Cold, calculated.', 'Consistent throw required.'],
      win: ['Drone sets first.', 'Efficiency first.'],
      lose: ['Unfortunate.', 'Margin of error exceeded.'],
      tie: ['Recalculating.', 'Tie within tolerance.'],
    },
  },
  {
    id: 'tre',
    name: 'Tre',
    tier: 'advanced',
    tagline: 'Tre flips on demand',
    summary:
      'Tre throws 360 flips like they are ollies and only gets fancier from there. Elite-level flip tech — matching its sets is a very tall order.',
    skill: 9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.15 },
    favorites: ['360 Flip', 'Bigspin Flip', 'Dolphin Flip'],
    avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 2 },
    rpsTaunts: {
      countdown: ['Tre flips on demand.', 'Demand a good throw.'],
      win: ['Tre sets. Flip it.', 'First flip coming up.'],
      lose: ['You flipped the script.', 'Tre flip missed.'],
      tie: ['Flip again.', 'Tre-for-tre tie.'],
    },
  },
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

const BAG_THRESHOLD = 0.2;

function stanceComfortFor(robot: Robot, stance: OffStance): number {
  return robot.stanceComfort?.[stance] ?? TIER_STANCE_COMFORT[robot.tier][stance];
}

/**
 * Consistency (0-1) this robot has for a trick, or null if it's not in their bag.
 *
 * The model is "how much skill headroom is left after the trick's difficulty?":
 *   - A trick's base difficulty is fixed; its stance adds a *load* that depends on
 *     the trick (a switch shuvit barely loads, a switch flip loads a lot — see
 *     `stanceLoad`), softened by how comfortable this robot is in that stance.
 *   - Consistency is a smooth curve over (skill - effective difficulty): right at
 *     the edge ≈ 50%, well within ≈ 90%+, beyond it falls off fast and drops out.
 *   - Favorites, focus disciplines, and a signature stance add boosts; a small
 *     deterministic jitter keeps each robot's bag unique.
 *
 * Because difficulty drives membership, the learning order is correct for free: a
 * shuvit (easier base) always outranks a kickflip for the same robot, so no robot
 * can land kickflips without also having shuvits and 180s.
 */
export function robotConsistency(robot: Robot, trick: Trick): number | null {
  const discipline = trickDiscipline(trick);
  if (!robot.disciplines.includes(discipline)) return null;
  if (robot.excludes?.includes(trick.base)) return null;
  if (robot.allowedStances && !robot.allowedStances.includes(trick.stance)) return null;
  // Tier-locked tricks (e.g. late shuvits) impose a hard skill floor no boost can
  // beat — below it the robot simply can't do the trick, regardless of focus.
  if (trick.minSkill !== undefined && robot.skill < trick.minSkill) return null;

  const comfort = trick.stance === 'regular' ? 1 : stanceComfortFor(robot, trick.stance);
  const effDifficulty = trick.baseDifficulty + stanceLoad(trick) * (1 - comfort);
  const headroom = robot.skill - effDifficulty;

  let c = 0.5 + 0.45 * Math.tanh(headroom * 0.45);
  if (robot.favorites.includes(trick.base)) c += 0.15;
  if (robot.focus?.[discipline]) c += robot.focus[discipline]!;
  if (robot.signatureStance && trick.stance === robot.signatureStance) c += 0.12;
  c += (hash01(robot.id + trick.id) - 0.5) * 0.1; // ±0.05 deterministic jitter

  c = Math.max(0, Math.min(0.97, c));
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

const GENERIC_TAUNTS: RpsTaunts = {
  countdown: ['Ready?', 'Here we go...', 'No take-backs.'],
  win: ['I go first.', 'Winner sets.'],
  lose: ['You set first.', 'Fine, you won.'],
  tie: ['Tie. Again.', 'Dead heat.'],
};

/** Pick a robot's RPS taunt for a given moment. */
export function getRpsTaunt(robot: Robot, moment: keyof RpsTaunts): string {
  const lines = robot.rpsTaunts[moment] ?? GENERIC_TAUNTS[moment];
  return lines[Math.floor(Math.random() * lines.length)];
}

const FOCUS_VIBE: Record<Discipline, string> = {
  grind: 'Grinder',
  slide: 'Slider',
  transition: 'Transition',
  rotation: 'Spinner',
  flip: 'Flip-tech',
  oldschool: 'Old-school',
  shuvit: 'Shuvit-spec',
  roll: 'Pop-machine',
  manual: 'Balancer',
};

/** A short "vibe" label derived from the robot's skill model — for roster cards. */
export function robotVibe(robot: Robot): string {
  if (robot.signatureStance === 'switch') return 'Switch-wizard';
  if (robot.signatureStance === 'nollie') return 'Nose-tech';

  const c = robot.stanceComfort;
  if (c && (c.fakie ?? 0) >= 0.9 && (c.switch ?? 0) >= 0.9) return 'Switch-wizard';

  if (robot.focus) {
    const key = Object.keys(robot.focus)[0] as Discipline;
    return FOCUS_VIBE[key] ?? 'Technician';
  }

  if (robot.favorites.some((f) => /flip/i.test(f))) return 'Flip-tech';
  if (robot.disciplines.length >= 7) return 'All-rounder';
  if (robot.skill <= 3) return 'Send-it';

  return 'Technician';
}
