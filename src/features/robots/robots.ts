import type { Discipline, Stance, Trick } from '@/features/tricks';
import { stanceLoad, trickDiscipline } from '@/features/tricks';

export type Tier = 'beginner' | 'intermediate' | 'advanced' | 'pro';

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
  /** Offline robot-vs-robot calibration rating. Present for the routed flatground roster. */
  elo?: number;
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
  /** Per-trick stance restrictions, used when one trick is only attempted in select stances. */
  trickAllowedStances?: Partial<Record<string, Stance[]>>;
  /** Optional ceiling for named tricks, used for a deliberately shaky trick. */
  consistencyCaps?: Partial<Record<string, number>>;
  /** Exact consistency overrides for named stance variants, in the 0..1 range. */
  consistencyOverrides?: Partial<Record<string, number>>;
  /**
   * Optional pick-weight overrides when this robot sets a trick. Keys are trick
   * ids (`regular-kickflip`) or base names (`Kickflip`); id wins. Omit a key —
   * or the whole field — to use the default policy (land rate, with uncommon
   * tricks cut and favorites boosted). `0` means never set it (it stays copyable).
   */
  setWeights?: Partial<Record<string, number>>;
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
  /** Trash talk during the rock-paper-scissors toss. */
  rpsTaunts: RpsTaunts;
}

/**
 * Default per-stance comfort by tier. Beginners are nearly lost off-stance,
 * advanced robots are comfortable in most stances, and pros are near-ambidextrous.
 * Individual robots override this (a switch sorcerer, a nollie specialist) via
 * `stanceComfort`.
 */
const TIER_STANCE_COMFORT: Record<Tier, Record<OffStance, number>> = {
  beginner: { fakie: 0.4, nollie: 0.15, switch: 0.1 },
  intermediate: { fakie: 0.6, nollie: 0.4, switch: 0.35 },
  advanced: { fakie: 0.75, nollie: 0.55, switch: 0.5 },
  pro: { fakie: 0.9, nollie: 0.8, switch: 0.75 },
};

const TIE = ['Tie. Again.', 'Dead heat. Throw once more.', 'One more time.'];

const ROBOTS_UNSORTED: Robot[] = [
  // Beginner
  {
    id: 'shifty',
    name: 'Swivel',
    tier: 'beginner',
    tagline: 'Shuvit specialist',
    summary:
      "Swivel only really trusts one move — the shuvit — and scoops it every chance it gets. Loose and a little sketchy, but it never stops popping the board around under its feet.",
    skill: 3,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    trickAllowedStances: { Kickflip: ['regular', 'fakie'] },
    consistencyCaps: { Kickflip: 0.5 },
    focus: { shuvit: 0.18 },
    favorites: ['Pop Shuvit', 'Frontside Shuvit'],
    avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
    rpsTaunts: {
      countdown: ['You sure about that throw?', 'Here we go...'],
      win: ['Swivel takes first!', 'I set, you sweat.'],
      lose: ['You got it. This time.'],
      tie: TIE,
    },
  },
  {
    id: 'baily',
    name: 'Scuffy',
    tier: 'beginner',
    tagline: 'Falls with style',
    summary:
      'Scuffy bails more than it lands, but always with flair. Expect ollies, hippie jumps, and the occasional faceplant — it is here for the good time, not the win.',
    skill: 2,
    disciplines: ['roll', 'shuvit', 'rotation', 'manual', 'oldschool'],
    favorites: ['Ollie', 'Hippie Jump', 'Caveman'],
    avatar: { body: '#5b8def', accent: '#f2a541', variant: 1 },
    rpsTaunts: {
      countdown: ['Here goes nothing!', 'Okay, no take-backs.'],
      win: ["Scuffy's going first!", 'Style points for winning the toss.'],
      lose: ['Ugh, figures.', 'I fell at the first hurdle.'],
      tie: ['Again! I was not ready.', 'Best two out of three?'],
    },
  },
  {
    id: 'sacker',
    name: 'Gutsy',
    tier: 'beginner',
    tagline: 'Brave, mostly',
    summary:
      'Gutsy will try anything once — usually a backside 180, usually with its eyes half shut. More courage than control, but you have to respect the send.',
    skill: 2.6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    trickAllowedStances: { Kickflip: ['regular', 'fakie'] },
    consistencyCaps: { Kickflip: 0.5 },
    consistencyOverrides: {
      'regular-heelflip': 0.35,
      'regular-pop-shuvit': 0.68,
      'fakie-pop-shuvit': 0.68,
      'switch-backside-180': 0.1,
      'regular-ollie': 0.9,
      'nollie-ollie': 0.75,
      'switch-ollie': 0.75,
    },
    favorites: ['Backside 180'],
    avatar: { body: '#7ea0b5', accent: '#e0455c', variant: 2 },
    rpsTaunts: {
      countdown: ["I'm feeling lucky.", 'Brave throw, human.'],
      win: ['Gutsy sets!', 'Bravery pays off.'],
      lose: ['Brave, mostly.', 'Next time.'],
      tie: ['One more time!', 'Tie? How brave.'],
    },
  },
  {
    id: 'flipster',
    name: 'Sparky',
    tier: 'beginner',
    tagline: 'Kickflip kid',
    summary:
      "Sparky learned the kickflip last week and hasn't stopped since. It's the only flip trick it really has — but it's got the ollies, shuvits and 180s underneath it, like anyone who can kickflip does.",
    skill: 3.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Kickflip'],
    consistencyOverrides: {
      'regular-kickflip': 0.75,
      'switch-kickflip': 0.15,
      'nollie-kickflip': 0.15,
    },
    excludes: ['Heelflip'],
    avatar: { body: '#4f86f7', accent: '#f7c948', variant: 3 },
    rpsTaunts: {
      countdown: ['Kickflip of the coin.', 'Flip it.'],
      win: ['Sparky flips first!', 'First flip is mine.'],
      lose: ['No, I wanted to flip!', 'You flipped the toss.'],
      tie: ['Tie? Flip again!', 'Stale flip.'],
    },
  },
  {
    id: 'tictac',
    name: 'Rusty',
    tier: 'beginner',
    tagline: 'Old school cruiser',
    summary:
      'Rusty skates like it is 1985 — manuals, powerslides, bonelesses, and not a flip trick in sight. Pure cruising energy, low on tech, high on style.',
    skill: 2.5,
    disciplines: ['roll', 'rotation', 'manual', 'oldschool', 'transition'],
    favorites: ['Manual', 'Powerslide', 'Boneless', 'Caveman'],
    allowedStances: ['regular', 'fakie'],
    avatar: { body: '#7bb661', accent: '#c8e6b0', variant: 0 },
    rpsTaunts: {
      countdown: ['Old school rules.', 'Cruiser ready.'],
      win: ["Rusty's turn!", 'Old school goes first.'],
      lose: ['You got me.', 'Classic setup by you.'],
      tie: ['Honor system — again.', 'Cruise into a rematch.'],
    },
  },
  {
    id: 'flipper',
    name: 'Lefty',
    tier: 'beginner',
    tagline: 'Heels over head',
    summary:
      'Lefty is all about the heelflip and that satisfying flick of the heel. Kickflips? Never heard of them. It commits to the heel side and rarely strays.',
    skill: 3.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    trickAllowedStances: { 'Varial Kickflip': ['regular'] },
    consistencyOverrides: { 'regular-varial-kickflip': 0.4 },
    favorites: ['Heelflip'],
    excludes: ['Kickflip'],
    avatar: { body: '#41c9b4', accent: '#1d7a8c', variant: 1 },
    rpsTaunts: {
      countdown: ['Heels over head.', 'Heel flip the coin.'],
      win: ['Lefty first!', 'Heel yeah.'],
      lose: ['That did not heel.', 'Heads, you win.'],
      tie: ['Best two out of three?', 'Heel-to-heel tie.'],
    },
  },
  {
    id: 'cabby',
    name: 'Boomerang',
    tier: 'beginner',
    tagline: 'Half cab forever',
    summary:
      'Boomerang learned the half cab before almost anything else and still rides out of fakie more than regular. Classic early-street progression: ollie, half cab, fakie shuv — switch can wait.',
    skill: 3,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Backside 180', 'Pop Shuvit'],
    signatureStance: 'fakie',
    stanceComfort: { fakie: 0.85, nollie: 0.2, switch: 0.12 },
    consistencyOverrides: { 'switch-pop-shuvit': 0.5 },
    excludes: ['Dolphin Flip', 'Frontside Heelflip'],
    // Kickflip is a shaky regular-only reach; fakie flip stays out at this skill.
    trickAllowedStances: {
      Kickflip: ['regular'],
      Heelflip: ['regular'],
      // Boomerang has no regular frontside 360 in its bag.
      'Frontside 360': ['fakie', 'nollie', 'switch'],
    },
    consistencyCaps: { Kickflip: 0.45, Heelflip: 0.4 },
    avatar: { body: '#6a8caf', accent: '#f0c987', variant: 2 },
    rpsTaunts: {
      countdown: ['Cab it.', 'Fakie first.'],
      win: ['Boomerang half-cabs first!', 'Out of fakie, into first.'],
      lose: ['Rolled the wrong way.', 'Half a cab short.'],
      tie: ['Cab again.', 'Fakie rematch.'],
    },
  },
  {
    id: 'fronty',
    name: 'Magnet',
    tier: 'beginner',
    tagline: 'Frontside everything',
    summary:
      'Magnet scoops everything frontside — FS shuvits, FS 180s, the occasional FS flip dream. Backside feels foreign; frontside is home. A very real early-street bias.',
    skill: 3.1,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { shuvit: 0.12 },
    favorites: ['Frontside Shuvit', 'Frontside 180'],
    // Still has pop shuvits (learning order), but refuses backside rotation/flip lines.
    excludes: [
      'Backside 180',
      'Backside Flip',
      'Backside Heelflip',
      'Backside 360',
      'Backside 360 Kickflip',
    ],
    trickAllowedStances: {
      Kickflip: ['regular', 'fakie'],
      Heelflip: ['regular'],
      'Frontside Flip': ['regular'],
    },
    consistencyCaps: { Kickflip: 0.48, Heelflip: 0.35 },
    consistencyOverrides: {
      'regular-frontside-flip': 0.28,
      'regular-pop-shuvit': 0.45,
    },
    avatar: { body: '#ff9f1c', accent: '#2ec4b6', variant: 0 },
    rpsTaunts: {
      countdown: ['Frontside only.', 'Scoop it front.'],
      win: ['Magnet goes first!', 'Frontside privilege.'],
      lose: ['Backside beat me.', 'Wrong way around.'],
      tie: ['Front again.', 'Spin it frontside.'],
    },
  },
  // Intermediate
  {
    id: 'spine',
    name: 'Pendulum',
    tier: 'intermediate',
    tagline: 'Transition machine',
    summary:
      'Pendulum lives on the ramp — stalls, rock n rolls, and disasters are its bread and butter. Put it on transition and it will grind you down; flatground, less so.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'transition', 'slide'],
    focus: { transition: 0.2 },
    favorites: ['Rock n Roll', 'Disaster', 'Axle Stall'],
    avatar: { body: '#6fcf72', accent: '#2e7d32', variant: 2 },
    rpsTaunts: {
      countdown: ['Transition or nothing.', 'Drop in...'],
      win: ['Pendulum sets the tone.', 'First drop is mine.'],
      lose: ['You got the drop.', 'Next transition is yours.'],
      tie: ['Round two.', 'Stall for a rematch.'],
    },
  },
  {
    id: 'lanky',
    name: 'Noodle',
    tier: 'intermediate',
    tagline: 'Slides everything',
    summary:
      "Noodle's long limbs lock into anything that slides — boardslides and noseslides for days. Its flatground game is nothing special, but on a rail it is a problem.",
    skill: 5,
    disciplines: ['roll', 'shuvit', 'rotation', 'slide'],
    focus: { slide: 0.2 },
    favorites: ['Boardslide', 'Noseslide', 'Tailslide'],
    avatar: { body: '#b0b7c3', accent: '#e0455c', variant: 3 },
    rpsTaunts: {
      countdown: ['Slide into it.', 'Long limbs, long odds.'],
      win: ['Noodle goes first.', 'Slid into first.'],
      lose: ['Slim margin.', 'You slid by me.'],
      tie: ['Stalemate? How boring.', 'Slide it again.'],
    },
  },
  {
    id: 'droopy',
    name: 'Clamp',
    tier: 'intermediate',
    tagline: 'Locked-in grinds',
    summary:
      'Clamp finds the lock-in and never lets go. A grind specialist that will out-balance you on any rail, though it keeps both feet near the ground.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'grind'],
    focus: { grind: 0.2 },
    favorites: ['50-50 Grind', '5-0 Grind', 'Salad Grind', 'Suski Grind'],
    avatar: { body: '#d6457a', accent: '#9be564', variant: 0 },
    rpsTaunts: {
      countdown: ['Locked and loaded.', 'Stay locked.'],
      win: ['Clamp sets.', 'Locked in first.'],
      lose: ['Grind harder next time.', 'Lock slipped.'],
      tie: ['Again. Stay locked.', 'Grind to a tie.'],
    },
  },
  {
    id: 'wally',
    name: 'Hocus',
    tier: 'intermediate',
    tagline: 'No-comply wizard',
    summary:
      'Hocus pops no-complies and bonelesses out of nowhere — old-school wizardry with a modern twist. Tricky to read, and a lot of fun to watch.',
    skill: 5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'oldschool', 'manual'],
    focus: { oldschool: 0.2 },
    favorites: ['No Comply 180', 'Boneless'],
    avatar: { body: '#c9a227', accent: '#8d99ae', variant: 1 },
    rpsTaunts: {
      countdown: ['No comply? No problem.', 'Wizard incoming.'],
      win: ['Hocus is up first!', 'No comply, first try.'],
      lose: ['You complied.', 'Wizard needs a retry.'],
      tie: ['Comply with a rematch.', 'Magic fizzled.'],
    },
  },
  {
    id: 'nolly',
    name: 'Nosy',
    tier: 'intermediate',
    tagline: 'Lives on the nose',
    summary:
      "Nosy does everything off the nose. Its nollie flips come out cleaner than most skaters' regular ones — flip it the normal way and it suddenly looks human. Proof that stance and trick are two different skills.",
    skill: 6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
    signatureStance: 'nollie',
    stanceComfort: { nollie: 0.95, fakie: 0.6, switch: 0.4 },
    avatar: { body: '#f6a5c0', accent: '#3a2e4d', variant: 2 },
    rpsTaunts: {
      countdown: ['Off the nose...', 'Nollie or nothing.'],
      win: ['Nosy noses ahead.', 'First, off the nose.'],
      lose: ['Tail beat the nose.', 'You popped it better.'],
      tie: ['Nose to nose. Again.', 'Re-pop it.'],
    },
  },
  {
    id: 'skater',
    name: 'Jack',
    tier: 'intermediate',
    tagline: 'Jack of all tricks',
    summary:
      'Jack has no specialty and no glaring weakness — a solid all-rounder that will match you trick for trick across the whole board. Master of none, dangerous everywhere.',
    skill: 6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide', 'manual', 'transition', 'oldschool'],
    favorites: [],
    avatar: { body: '#8d99ae', accent: '#ffd166', variant: 2 },
    rpsTaunts: {
      countdown: ['Jack of all throws.', 'Well-rounded toss.'],
      win: ['Jack sets.', 'Jack wins the toss.'],
      lose: ['Fair toss.', 'Master of none today.'],
      tie: ['Evenly matched.', 'Jack of all ties.'],
    },
  },
  {
    id: 'wallride',
    name: 'Gecko',
    tier: 'intermediate',
    tagline: 'Defies gravity',
    summary:
      'Gecko treats walls like floors and gravity like a suggestion. Strong on lips and stalls, with a few spins up its sleeve when you least expect them.',
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'slide', 'transition'],
    focus: { transition: 0.15, rotation: 0.1 },
    favorites: ['Lipslide', 'Rock to Fakie', 'Fakie Bigspin Stall'],
    avatar: { body: '#9bd1f9', accent: '#4361ee', variant: 3 },
    rpsTaunts: {
      countdown: ['Defying gravity...', 'Ride the wall.'],
      win: ['Gecko sets first.', 'Gravity loses.'],
      lose: ['Gravity wins.', 'Fell off the wall.'],
      tie: ['Air mail — send it again.', 'Wall-to-wall tie.'],
    },
  },
  {
    id: 'varial',
    name: 'Zigzag',
    tier: 'intermediate',
    tagline: 'Diagonal flip kid',
    summary:
      'Zigzag is stuck in that classic mid-bag phase where varial flips and varial heels feel more natural than a clean tre. Diagonal flips first, 360 flips later — exactly how most street skaters actually progress.',
    skill: 5.8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.12, shuvit: 0.08 },
    favorites: ['Varial Kickflip', 'Varial Heelflip', 'Pop Shuvit'],
    // Hardflips/inwards/tres are advanced-gate tricks for this bag.
    excludes: ['360 Flip', 'Hardflip', 'Inward Heelflip', 'Laser Flip', 'Bigspin Flip'],
    // Fakie varials are common; switch/nollie varials come much later.
    trickAllowedStances: {
      'Varial Kickflip': ['regular', 'fakie'],
      'Varial Heelflip': ['regular', 'fakie'],
      Kickflip: ['regular', 'fakie', 'nollie'],
      Heelflip: ['regular', 'fakie'],
    },
    stanceComfort: { fakie: 0.7, nollie: 0.45, switch: 0.3 },
    avatar: { body: '#7bdff2', accent: '#b388eb', variant: 1 },
    rpsTaunts: {
      countdown: ['Diagonal only.', 'Varial the toss.'],
      win: ['Zigzag goes first.', 'Diagonal privilege.'],
      lose: ['Straight beat diagonal.', 'No varial this time.'],
      tie: ['Spin it diagonal.', 'Varial rematch.'],
    },
  },
  {
    id: 'biggy',
    name: 'Cyclone',
    tier: 'intermediate',
    tagline: 'Bigspin merchant',
    summary:
      'Cyclone collects bigspins the way other skaters collect kickflips. BS bigspin, FS bigspin, 360 shuvs — rotation is the whole game. Flip tricks exist, but they are not the main event.',
    skill: 6.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { rotation: 0.18, shuvit: 0.12 },
    favorites: ['Bigspin', 'FS Bigspin', '360 Shuvit', 'Frontside 360 Shuvit'],
    excludes: ['Hardflip', 'Inward Heelflip', 'Laser Flip'],
    // Bigspins show up in regular/fakie long before clean switch bigspins.
    trickAllowedStances: {
      Bigspin: ['regular', 'fakie', 'nollie'],
      'FS Bigspin': ['regular', 'fakie'],
      '360 Shuvit': ['regular', 'fakie', 'nollie', 'switch'],
      Kickflip: ['regular', 'fakie'],
      Heelflip: ['regular', 'fakie'],
    },
    stanceComfort: { fakie: 0.75, nollie: 0.5, switch: 0.35 },
    avatar: { body: '#ff6b6b', accent: '#4ecdc4', variant: 0 },
    rpsTaunts: {
      countdown: ['Bigspin the coin.', 'Spin big.'],
      win: ['Cyclone sets first.', 'Big spin, first set.'],
      lose: ['Small spin today.', 'You spun bigger.'],
      tie: ['Spin it again.', 'Equal bigspin.'],
    },
  },
  {
    id: 'heelzy',
    name: 'Achilles',
    tier: 'intermediate',
    tagline: 'Heelflip path',
    summary:
      'Achilles took the heelflip path instead of the kickflip path. FS heels, BS heels, varial heels — if it flicks off the heel edge, it is in the bag. Kickflips exist, but they feel foreign.',
    skill: 5.7,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.1 },
    favorites: ['Heelflip', 'Varial Heelflip', 'Frontside Heelflip', 'Backside Heelflip'],
    excludes: ['360 Flip', 'Hardflip', 'Bigspin Flip', 'Laser Flip'],
    // Heel tricks are most common regular/fakie; switch heels are rare at this level.
    trickAllowedStances: {
      Heelflip: ['regular', 'fakie', 'nollie'],
      'Varial Heelflip': ['regular', 'fakie'],
      'Frontside Heelflip': ['regular', 'fakie'],
      'Backside Heelflip': ['regular'],
      Kickflip: ['regular', 'fakie'],
    },
    consistencyCaps: { Kickflip: 0.55 },
    stanceComfort: { fakie: 0.72, nollie: 0.48, switch: 0.32 },
    avatar: { body: '#95d5b2', accent: '#1b4332', variant: 2 },
    rpsTaunts: {
      countdown: ['Heel side.', 'Flick the heel.'],
      win: ['Achilles first.', 'Heel takes the toss.'],
      lose: ['Toe edge beat me.', 'No heel this time.'],
      tie: ['Heel to heel.', 'Flick again.'],
    },
  },
  {
    id: 'fakie',
    name: 'Rewind',
    tier: 'intermediate',
    tagline: 'Rides out of fakie',
    summary:
      'Rewind lives rolling backward. Half cabs, full cabs, fakie flips, fakie bigspins — the bag is built the way street skaters actually learn stance: fakie first, switch much later.',
    skill: 6.1,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Backside 180', 'Backside 360', 'Kickflip', 'Bigspin'],
    signatureStance: 'fakie',
    stanceComfort: { fakie: 0.95, nollie: 0.45, switch: 0.35 },
    // Switch stays thin on purpose; nollie is secondary to fakie.
    trickAllowedStances: {
      '360 Flip': ['regular', 'fakie'],
      Hardflip: ['regular'],
      'Varial Kickflip': ['regular', 'fakie'],
    },
    avatar: { body: '#a8dadc', accent: '#e63946', variant: 3 },
    rpsTaunts: {
      countdown: ['Rolling fakie...', 'Backward first.'],
      win: ['Rewind sets first.', 'Out of fakie, into first.'],
      lose: ['Forward beat backward.', 'Rolled the wrong way.'],
      tie: ['Fakie rematch.', 'Cab it again.'],
    },
  },
  // Advanced
  {
    id: 'jupiter',
    name: 'Orbit',
    tier: 'advanced',
    tagline: 'Spins like a planet',
    summary:
      'Orbit lives and breathes rotation — bigspins, 360 shuvits, and tre-flip combos orbit out of its feet with confidence. The more spin a trick has, the happier it gets.',
    skill: 6.75,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { rotation: 0.2, shuvit: 0.1 },
    favorites: ['Bigspin', '360 Shuvit', 'FS Bigspin', 'Frontside 360 Shuvit'],
    avatar: { body: '#cfd2d9', accent: '#7b6cf6', variant: 0 },
    rpsTaunts: {
      countdown: ['Spin the planets.', 'Planetary alignment...'],
      win: ['Orbit rotates first.', 'Planetary priority.'],
      lose: ['Orbit shifted.', 'You spun the toss.'],
      tie: ['Planetary alignment.', 'Spin it again.'],
    },
  },
  {
    id: 'hesh',
    name: 'Bouncer',
    tier: 'advanced',
    tagline: 'Tre flip gatekeeper',
    summary:
      'Bouncer sits right at the tre-flip threshold — 360 flips are a coin flip, hardflips are sketchy, and laser flips are still out of reach. The textbook advanced skater: dangerous, but beatable.',
    skill: 7,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.1 },
    favorites: ['360 Flip', 'Hardflip'],
    avatar: { body: '#e07a5f', accent: '#3d405b', variant: 0 },
    rpsTaunts: {
      countdown: ['Tre flip or die.', 'Gate is open.'],
      win: ['Bouncer sets. Good luck.', 'Gatekeeper goes first.'],
      lose: ['You got past the gate.', 'Respect. Next time.'],
      tie: ['Even at the gate.', 'Flip it again.'],
    },
  },
  {
    id: 'hardy',
    name: 'Diesel',
    tier: 'advanced',
    tagline: 'Hardflip specialist',
    summary:
      'Diesel is all about the hardflip and inward heel — the two tricks that separate advanced street from intermediate. Tre flips are there, lasers are not. Pop, scoop, and commit.',
    skill: 7.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.15 },
    favorites: ['Hardflip', 'Inward Heelflip', 'Varial Kickflip'],
    excludes: ['Laser Flip', 'BS Bigspin Heelflip', '360 Double Kickflip'],
    // Hardflips are overwhelmingly regular/fakie in the wild; switch hardflips are rare.
    trickAllowedStances: {
      Hardflip: ['regular', 'fakie'],
      'Inward Heelflip': ['regular', 'fakie'],
      '360 Flip': ['regular', 'fakie', 'nollie'],
    },
    stanceComfort: { fakie: 0.78, nollie: 0.55, switch: 0.45 },
    avatar: { body: '#e76f51', accent: '#264653', variant: 1 },
    rpsTaunts: {
      countdown: ['Hardflip energy.', 'Scoop and commit.'],
      win: ['Diesel sets first.', 'Hard first.'],
      lose: ['Soft toss.', 'You scooped better.'],
      tie: ['Hard rematch.', 'Scoop again.'],
    },
  },
  {
    id: 'caball',
    name: 'Carousel',
    tier: 'advanced',
    tagline: 'Full cab technician',
    summary:
      'Carousel is the full-cab technician — fakie 360s, cab flips, and every cab variation you can name. Street-video energy: if it comes out of fakie with spin, it is probably in the bag.',
    skill: 7.1,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { rotation: 0.15, flip: 0.08 },
    favorites: ['Backside 360', 'Backside Flip', 'Bigspin', '360 Flip'],
    signatureStance: 'fakie',
    stanceComfort: { fakie: 0.95, nollie: 0.55, switch: 0.48 },
    excludes: ['Laser Flip', 'BS Bigspin Heelflip'],
    avatar: { body: '#90be6d', accent: '#577590', variant: 2 },
    rpsTaunts: {
      countdown: ['Full cab incoming.', 'Cab it all.'],
      win: ['Carousel goes first.', 'Cab priority.'],
      lose: ['Half cab short.', 'You spun past me.'],
      tie: ['Cab again.', 'Full rematch.'],
    },
  },
  {
    id: 'switchy',
    name: 'Echo',
    tier: 'advanced',
    tagline: 'Learning switch',
    summary:
      'Echo is deep into the switch chapter — switch flips and switch heels are online, switch bigspins are coming, and regular still feels safer. Not a full switch sorcerer yet, but the mirror is forming.',
    skill: 7.3,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Kickflip', 'Heelflip', 'Varial Kickflip'],
    signatureStance: 'switch',
    stanceComfort: { fakie: 0.82, nollie: 0.6, switch: 0.78 },
    // Elite tech still mostly regular/fakie at this stage.
    excludes: ['Laser Flip', 'BS Bigspin Heelflip', '360 Double Kickflip'],
    trickAllowedStances: {
      Hardflip: ['regular', 'fakie', 'switch'],
      '360 Flip': ['regular', 'fakie', 'switch', 'nollie'],
    },
    avatar: { body: '#cdb4db', accent: '#ffafcc', variant: 3 },
    rpsTaunts: {
      countdown: ['Switch it.', 'Mirror mode.'],
      win: ['Echo first.', 'Switch takes the toss.'],
      lose: ['Regular beat switch.', 'Mirror cracked.'],
      tie: ['Switch rematch.', 'Mirror again.'],
    },
  },
  {
    id: 'latezy',
    name: 'Snooze',
    tier: 'advanced',
    tagline: 'Late trick nerd',
    summary:
      'Snooze lives for late shuvits and late flips — the weird mid-air scoop chapter of advanced skating. Not the flashiest bag, but deeply annoying to match if you never learned lates.',
    skill: 6.9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { shuvit: 0.15, flip: 0.08 },
    favorites: ['Late Backside Shuvit', 'Late Frontside Shuvit', 'Late Kickflip', 'Pop Shuvit'],
    excludes: ['Laser Flip', 'BS Bigspin Heelflip', '360 Double Kickflip'],
    // Lates are almost always regular/fakie; switch lates are unicorn territory.
    trickAllowedStances: {
      'Late Backside Shuvit': ['regular', 'fakie'],
      'Late Frontside Shuvit': ['regular', 'fakie'],
      'Late Kickflip': ['regular', 'fakie'],
      '360 Flip': ['regular', 'fakie'],
    },
    stanceComfort: { fakie: 0.8, nollie: 0.5, switch: 0.4 },
    avatar: { body: '#f4a261', accent: '#2a9d8f', variant: 0 },
    rpsTaunts: {
      countdown: ['Late to the toss.', 'Scoop it late.'],
      win: ['Snooze sets first.', 'Fashionably first.'],
      lose: ['Early loss.', 'Too late this time.'],
      tie: ['Late rematch.', 'Scoop again.'],
    },
  },
  // Pro
  {
    id: 'freely',
    name: 'Palindrome',
    tier: 'pro',
    tagline: 'Switch sorcerer',
    summary:
      'Palindrome is fluent in every stance — switch, nollie, fakie, it is all the same. There is no off-foot to exploit here; it skates a flawless mirror of itself.',
    skill: 8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
    stanceComfort: { fakie: 0.97, nollie: 0.95, switch: 0.92 },
    avatar: { body: '#5fc9f3', accent: '#f9b234', variant: 1 },
    rpsTaunts: {
      countdown: ['Switch it up.', 'Freestyle toss.'],
      win: ['Palindrome, first and switch.', 'Sorcery starts first.'],
      lose: ['You switch better than me.', 'Spell broken.'],
      tie: ['Switching gears — again.', 'Mirror spell.'],
    },
  },
  {
    id: 'smitty',
    name: 'Crown',
    tier: 'pro',
    tagline: 'Smith grind royalty',
    summary:
      'Crown is grind royalty, ruling the rails with smiths, feebles, and overcrookeds. Bow down — its lock-ins are very nearly flawless.',
    skill: 8.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide'],
    focus: { grind: 0.2 },
    favorites: ['Smith Grind', 'Feeble Grind', 'Overcrooked Grind', 'Hurricane'],
    avatar: { body: '#aab2bd', accent: '#7b6cf6', variant: 3 },
    rpsTaunts: {
      countdown: ['Smith grind royalty.', 'Bow to the crown.'],
      win: ['Crown sets. Bow down.', 'Royal first set.'],
      lose: ['Lucky toss.', 'The crown slips.'],
      tie: ['Royal rematch.', 'Noble tie.'],
    },
  },
  {
    id: 'c360po',
    name: 'Abacus',
    tier: 'pro',
    tagline: 'Fluent in 360s',
    summary:
      'Abacus computes rotation like a machine — tre flips, laser flips, and every big-spinning variant in between. Calculated, precise, and very hard to copy.',
    skill: 8.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.15, rotation: 0.1 },
    favorites: ['360 Shuvit', '360 Flip', 'Laser Flip', 'Bigspin Flip'],
    avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 0 },
    rpsTaunts: {
      countdown: ['Calculating probability...', 'Rotational analysis...'],
      win: ['Abacus sets. Optimal.', '360 degrees of first.'],
      lose: ['Variance detected.', 'Non-optimal outcome.'],
      tie: ['Tie probability: 33%. Again.', 'Recalculate.'],
    },
  },
  {
    id: 'drone',
    name: 'Metronome',
    tier: 'pro',
    tagline: 'Cold, calculated, consistent',
    summary:
      'Metronome has no favorites and no flair — just cold, relentless consistency across the entire trick list. It will not dazzle you; it will simply never miss.',
    skill: 9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide', 'manual', 'transition', 'oldschool'],
    favorites: [],
    avatar: { body: '#9d6bce', accent: '#3ddad7', variant: 1 },
    rpsTaunts: {
      countdown: ['Cold, calculated.', 'Consistent throw required.'],
      win: ['Metronome sets first.', 'Efficiency first.'],
      lose: ['Unfortunate.', 'Margin of error exceeded.'],
      tie: ['Recalculating.', 'Tie within tolerance.'],
    },
  },
  {
    id: 'tre',
    name: 'Maestro',
    tier: 'pro',
    tagline: 'Tre flips on demand',
    summary:
      'Maestro throws 360 flips like they are ollies and only gets fancier from there. Elite-level flip tech — matching its sets is a very tall order.',
    skill: 9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.15 },
    favorites: ['360 Flip', 'Bigspin Flip', 'Dolphin Flip'],
    avatar: { body: '#f4f4f6', accent: '#2b2d42', variant: 2 },
    rpsTaunts: {
      countdown: ['Tre flips on demand.', 'Demand a good throw.'],
      win: ['Maestro sets. Flip it.', 'First flip coming up.'],
      lose: ['You flipped the script.', 'Tre flip missed.'],
      tie: ['Flip again.', 'Tre-for-tre tie.'],
    },
  },
  {
    id: 'laser',
    name: 'Scope',
    tier: 'pro',
    tagline: 'Laser flip sniper',
    summary:
      'Scope is the laser-flip sniper — 360 heels, bigspin heels, and every frontside-spinning flip combo. The rare bag where laser flips feel more natural than hardflips.',
    skill: 8.8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.18, rotation: 0.08 },
    favorites: ['Laser Flip', 'FS Bigspin Heelflip', 'Varial Heelflip', '360 Flip'],
    // Laser flips are almost always regular/fakie even at pro; switch lasers are mythical.
    trickAllowedStances: {
      'Laser Flip': ['regular', 'fakie', 'nollie'],
      'FS Bigspin Heelflip': ['regular', 'fakie'],
      'BS Bigspin Heelflip': ['regular'],
    },
    stanceComfort: { fakie: 0.92, nollie: 0.82, switch: 0.72 },
    avatar: { body: '#e0aaff', accent: '#10002b', variant: 0 },
    rpsTaunts: {
      countdown: ['Laser locked.', 'Sniper mode.'],
      win: ['Scope sets first.', 'Target acquired.'],
      lose: ['Missed the laser.', 'Off target.'],
      tie: ['Recalibrate.', 'Laser rematch.'],
    },
  },
  {
    id: 'impy',
    name: 'Houdini',
    tier: 'pro',
    tagline: 'Impossible artist',
    summary:
      'Houdini wraps the board with impossibles and pressure flips — old-school footwork tech that still cooks modern games of S.K.A.T.E. Weird bag, elite land rates.',
    skill: 8.3,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.12 },
    favorites: ['Impossible', 'Pressure Flip'],
    // These footwork tricks are almost exclusively regular/fakie in real skating.
    trickAllowedStances: {
      Impossible: ['regular', 'fakie'],
      'Pressure Flip': ['regular', 'fakie'],
      'Dolphin Flip': ['regular', 'fakie'],
    },
    excludes: ['BS Bigspin Heelflip', '360 Double Kickflip'],
    stanceComfort: { fakie: 0.9, nollie: 0.75, switch: 0.7 },
    avatar: { body: '#ffd6a5', accent: '#9b2226', variant: 1 },
    rpsTaunts: {
      countdown: ['Wrap it up.', 'Impossible odds.'],
      win: ['Houdini first.', 'Art sets first.'],
      lose: ['Possible loss.', 'Unwrapped.'],
      tie: ['Wrap again.', 'Impossible rematch.'],
    },
  },
  {
    id: 'double',
    name: 'Encore',
    tier: 'pro',
    tagline: 'Double flip dealer',
    summary:
      'Encore only feels alive when the board flips twice. Double kicks, double heels, 360 doubles — single flips are warmups. The modern contest-bag energy.',
    skill: 9.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    focus: { flip: 0.2 },
    favorites: ['Double Kickflip', 'Double Heelflip', '360 Double Kickflip', '360 Flip'],
    // Doubles stay regular/fakie-heavy; switch doubles are still rare even among pros.
    trickAllowedStances: {
      'Double Kickflip': ['regular', 'fakie', 'nollie'],
      'Double Heelflip': ['regular', 'fakie'],
      '360 Double Kickflip': ['regular', 'fakie'],
      'BS Bigspin Heelflip': ['regular'],
    },
    stanceComfort: { fakie: 0.93, nollie: 0.85, switch: 0.78 },
    avatar: { body: '#48cae4', accent: '#023e8a', variant: 2 },
    rpsTaunts: {
      countdown: ['Twice is nice.', 'Double or nothing.'],
      win: ['Encore sets first.', 'Two flips ahead.'],
      lose: ['Single loss.', 'Only flipped once.'],
      tie: ['Double rematch.', 'Flip it twice more.'],
    },
  },
];

/**
 * Canonical output of the seeded 506,000-game flatground calibration tournament
 * (`npm run simulate:robot-elo -- --games=2000 --seed=20260820`). Elo is only
 * comparable within that routed flatground field; other-discipline robots have
 * not been assigned a misleading flatground rating.
 */
export const ROBOT_ELO_BY_ID: Readonly<Partial<Record<string, number>>> = {
  sacker: -145,
  fronty: -50,
  flipper: -31,
  flipster: 3,
  cabby: 50,
  shifty: 91,
  heelzy: 1114,
  varial: 1182,
  nolly: 1299,
  fakie: 1373,
  biggy: 1397,
  jupiter: 1769,
  hesh: 1834,
  latezy: 1861,
  switchy: 1949,
  hardy: 1978,
  caball: 2023,
  freely: 2195,
  impy: 2443,
  c360po: 2953,
  laser: 3035,
  tre: 3082,
  double: 3095,
};

// Fixed display anchors keep product-facing ratings stable when the calibration
// is rerun. Values outside today's field may naturally display below/above them.
const RAW_RATING_LOW = -145;
const RAW_RATING_HIGH = 3095;
const DISPLAY_RATING_LOW = 800;
const DISPLAY_RATING_HIGH = 2400;

/** Friendly 800–2400-ish rating derived from raw Elo, rounded to the nearest 10. */
export function robotDisplayRating(robot: Pick<Robot, 'elo'>): number | null {
  if (robot.elo === undefined) return null;
  const normalized = (robot.elo - RAW_RATING_LOW) / (RAW_RATING_HIGH - RAW_RATING_LOW);
  const rating = DISPLAY_RATING_LOW + normalized * (DISPLAY_RATING_HIGH - DISPLAY_RATING_LOW);
  return Math.round(rating / 10) * 10;
}

/** Calibrated robots first, ordered easiest → hardest by Elo. */
export const ROBOTS: Robot[] = ROBOTS_UNSORTED
  .map((robot) => ({ ...robot, elo: ROBOT_ELO_BY_ID[robot.id] }))
  .sort((a, b) => {
    if (a.elo !== undefined && b.elo !== undefined) return a.elo - b.elo || a.name.localeCompare(b.name);
    if (a.elo !== undefined) return -1;
    if (b.elo !== undefined) return 1;
    return a.skill - b.skill || a.name.localeCompare(b.name);
  });

export const ROBOT_BY_ID = new Map(ROBOTS.map((r) => [r.id, r]));

const FLATGROUND_DISCIPLINES = new Set<Discipline>(['roll', 'shuvit', 'rotation', 'flip']);

export function isFlatgroundRobot(robot: Robot): boolean {
  return robot.disciplines.every((discipline) => FLATGROUND_DISCIPLINES.has(discipline));
}

export const TIERS: { tier: Tier; label: string }[] = [
  { tier: 'beginner', label: 'Easy' },
  { tier: 'intermediate', label: 'Medium' },
  { tier: 'advanced', label: 'Hard' },
  { tier: 'pro', label: 'Pro' },
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

/**
 * The consistency curve over headroom (skill - effective difficulty): right at
 * the edge ≈ 50%, well within ≈ 90%+, beyond it falls off fast. Exported so the
 * player skate score (features/skater) is fit onto the same ruler the robots ride.
 */
export function consistencyCurve(headroom: number): number {
  return 0.5 + 0.45 * Math.tanh(headroom * 0.45);
}

// Late backside shuvit is a specialty move rather than a normal skill-band
// unlock. Only robots that call it a favorite get to carry it in their bag.
const SPECIALTY_ONLY_TRICKS = new Set(['Late Backside Shuvit']);

/** Catalog tricks no robot ever sets or lands — still playable/viewable by humans. */
const PLAYER_ONLY_TRICKS = new Set(['Frontside 360 Kickflip']);

/** Tier-wide ceilings for tricks that should remain a reach at that level. */
const TIER_TRICK_CAPS: Partial<Record<Tier, Partial<Record<string, number>>>> = {
  beginner: { 'switch-pop-shuvit': 0.5 },
};

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
  if (PLAYER_ONLY_TRICKS.has(trick.base)) return null;
  if (SPECIALTY_ONLY_TRICKS.has(trick.base) && !robot.favorites.includes(trick.base)) return null;
  if (robot.allowedStances && !robot.allowedStances.includes(trick.stance)) return null;
  const trickStances = robot.trickAllowedStances?.[trick.base];
  if (trickStances && !trickStances.includes(trick.stance)) return null;
  // Tier-locked tricks (e.g. late shuvits) impose a hard skill floor no boost can
  // beat — below it the robot simply can't do the trick, regardless of focus.
  if (trick.minSkill !== undefined && robot.skill < trick.minSkill) return null;

  const comfort = trick.stance === 'regular' ? 1 : stanceComfortFor(robot, trick.stance);
  const effDifficulty = trick.baseDifficulty + stanceLoad(trick) * (1 - comfort);
  const headroom = robot.skill - effDifficulty;

  let c = consistencyCurve(headroom);
  if (robot.favorites.includes(trick.base)) c += 0.15;
  if (robot.focus?.[discipline]) c += robot.focus[discipline]!;
  if (robot.signatureStance && trick.stance === robot.signatureStance) c += 0.12;
  c += (hash01(robot.id + trick.id) - 0.5) * 0.1; // ±0.05 deterministic jitter

  const robotCap = robot.consistencyCaps?.[trick.base] ?? 0.97;
  const tierCap = TIER_TRICK_CAPS[robot.tier]?.[trick.id] ?? 0.97;
  const cap = Math.min(robotCap, tierCap);
  const override = robot.consistencyOverrides?.[trick.id];
  if (override !== undefined) return Math.max(0, Math.min(cap, override));
  c = Math.max(0, Math.min(cap, c));
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

/** The robot fields the set-picker reads. */
export type SetWeightRobot = Pick<Robot, 'id' | 'favorites' | 'setWeights'>;

/**
 * Tricks most robots can land but rarely choose to set — Ollie Norths and
 * anything "late". Specialists skip this via `favorites`.
 */
function isUncommonSet(trick: Trick): boolean {
  return trick.base === 'Ollie North' || trick.base.startsWith('Late ');
}

/** 0.18–0.50 of land rate, with late flips the rarest. Deterministic per robot. */
function uncommonSetMultiplier(robot: SetWeightRobot, trick: Trick): number {
  const jitter = hash01(`${robot.id}:uncommon-set:${trick.base}`);
  if (trickDiscipline(trick) === 'flip') return 0.18 + jitter * 0.22;
  if (trick.base.startsWith('Late ')) return 0.25 + jitter * 0.22;
  return 0.28 + jitter * 0.22;
}

/** 2–3× land rate, hashed per robot + trick so specialties don't share one bump. */
function specialtySetMultiplier(robot: SetWeightRobot, trick: Trick): number {
  return 2 + hash01(`${robot.id}:specialty-set:${trick.base}`);
}

/**
 * Weight used when this robot picks a trick to set.
 *
 * Default is the land rate. Favorites are set 2–3× as often as they land;
 * Ollie Norths and late tricks are at least halved unless they're a favorite.
 * `setWeights` replaces that result for a trick id or base name.
 */
export function trickSetWeight(trick: Trick, consistency: number, robot?: SetWeightRobot): number {
  const override = robot?.setWeights?.[trick.id] ?? robot?.setWeights?.[trick.base];
  if (override !== undefined) return Math.max(0, override);

  let weight = consistency;
  if (robot?.favorites.includes(trick.base)) {
    weight *= specialtySetMultiplier(robot, trick);
  } else if (robot && isUncommonSet(trick)) {
    weight *= uncommonSetMultiplier(robot, trick);
  }
  return weight;
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
