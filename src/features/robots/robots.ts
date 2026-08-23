import type { Discipline, Trick } from '@/features/tricks';
import { getTunedConsistency, getTunedSetWeight } from './tuning';

export type Tier = 'beginner' | 'intermediate' | 'advanced' | 'pro';

export interface RpsTaunts {
  countdown: string[];
  win: string[];
  lose: string[];
  tie: string[];
}

export interface Robot {
  id: string;
  /** Optional roster robot whose explicit behavior table this generated robot copies. */
  behaviorId?: string;
  name: string;
  tier: Tier;
  tagline: string;
  /** A sentence or two of personality + skating style, shown on the robot profile. */
  summary: string;
  /** Ladder/profile calibration only. Never changes trick behavior. */
  skill: number;
  /** Offline robot-vs-robot calibration rating. Present for the routed flatground roster. */
  elo?: number;
  /** Format/category metadata only. Bag membership comes from explicit behavior data. */
  disciplines: Discipline[];
  /** Profile signature chips only. Never changes land rates or set weights. */
  favorites: string[];
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
  /** Trash talk during the rock-paper-scissors toss. */
  rpsTaunts: RpsTaunts;
}

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
    favorites: ['Heelflip'],
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
    favorites: ['Frontside Shuvit', 'Frontside 180'],
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
    skill: 5.3,
    disciplines: ['roll', 'shuvit', 'rotation', 'transition', 'slide'],
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
    skill: 5.3,
    disciplines: ['roll', 'shuvit', 'rotation', 'grind'],
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
    skill: 4.6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
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
    skill: 5.4,
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
    skill: 5.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'slide', 'transition'],
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
    skill: 4.6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Varial Kickflip', 'Varial Heelflip', 'Pop Shuvit'],
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
    skill: 4.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Bigspin', 'FS Bigspin'],
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
    tagline: "His own worst heel",
    summary:
      'Achilles rips clean kickflips all day — but the moment a trick flicks off the heel edge, his body betrays him. The heelflip is his literal Achilles\' heel, and everyone at the park knows it.',
    skill: 4.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Kickflip'],
    avatar: { body: '#95d5b2', accent: '#1b4332', variant: 2 },
    rpsTaunts: {
      countdown: ['Toe side only.', 'Not the heel. Anything but the heel.'],
      win: ['Achilles first.', 'Kickflips win tosses.'],
      lose: ['You saw the heelflip coming.', 'My heel betrayed me.'],
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
    skill: 4.6,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Backside 180', 'Backside 360'],
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
    skill: 5.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
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
    skill: 5.8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
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
    skill: 6.1,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Hardflip', 'Inward Heelflip', 'Varial Kickflip'],
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
    skill: 5.95,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Backside 360', 'Backside Flip', 'Bigspin', '360 Flip'],
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
    skill: 6.25,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Kickflip', 'Heelflip', 'Varial Kickflip'],
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
    skill: 6.0,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Late Backside Shuvit', 'Late Frontside Shuvit', 'Late Kickflip', 'Pop Shuvit'],
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
    skill: 6.9,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: [],
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
    skill: 7.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip', 'grind', 'slide'],
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
    skill: 7.5,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
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
    skill: 8.1,
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
    skill: 8.1,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
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
    skill: 7.8,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Laser Flip', 'FS Bigspin Heelflip', 'Varial Heelflip', '360 Flip'],
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
    skill: 7.2,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Impossible', 'Pressure Flip'],
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
    skill: 8.4,
    disciplines: ['roll', 'shuvit', 'rotation', 'flip'],
    favorites: ['Double Kickflip', 'Double Heelflip', '360 Double Kickflip', '360 Flip'],
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
  sacker: 167,
  fronty: 339,
  flipster: 409,
  flipper: 533,
  cabby: 541,
  shifty: 680,
  heelzy: 844,
  varial: 1001,
  biggy: 1036,
  nolly: 1076,
  fakie: 1087,
  hesh: 1583,
  jupiter: 1667,
  latezy: 1803,
  hardy: 1813,
  switchy: 1830,
  caball: 1876,
  freely: 2035,
  impy: 2307,
  c360po: 2772,
  laser: 2936,
  tre: 3009,
  double: 3158,
};

// Fixed display anchors keep product-facing ratings stable when the calibration
// is rerun. Values outside today's field may naturally display below/above them.
const RAW_RATING_LOW = -145;
const RAW_RATING_HIGH = 3095;
const DISPLAY_RATING_LOW = 800;
const DISPLAY_RATING_HIGH = 2400;

/** Friendly 800–2400-ish rating derived from raw Elo, rounded to the nearest 10. */
export function rawEloToDisplayRating(rawElo: number): number {
  const normalized = (rawElo - RAW_RATING_LOW) / (RAW_RATING_HIGH - RAW_RATING_LOW);
  const rating = DISPLAY_RATING_LOW + normalized * (DISPLAY_RATING_HIGH - DISPLAY_RATING_LOW);
  return Math.round(rating / 10) * 10;
}

/** The display rating for a robot on the shared 800–2400 scale, or null if unbounded. */
export function robotDisplayRating(robot: Pick<Robot, 'elo'>): number | null {
  if (robot.elo === undefined) return null;
  return rawEloToDisplayRating(robot.elo);
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

/** Exact configured land rate, or null when this trick is not in the robot's bag. */
export function robotConsistency(robot: Robot, trick: Trick): number | null {
  return getTunedConsistency(robot.behaviorId ?? robot.id, trick.id) ?? null;
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

export type SetWeightRobot = Pick<Robot, 'id' | 'behaviorId'>;

/** Exact configured set-pick weight. Missing entries are never set. */
export function trickSetWeight(trick: Trick, robot: SetWeightRobot): number {
  return getTunedSetWeight(robot.behaviorId ?? robot.id, trick.id) ?? 0;
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

const ROBOT_VIBE: Record<string, string> = {
  sacker: 'Send-it',
  fronty: 'Shuvit-spec',
  flipper: 'Flip-tech',
  flipster: 'Flip-tech',
  cabby: 'Send-it',
  shifty: 'Shuvit-spec',
  heelzy: 'Flip-tech',
  varial: 'Flip-tech',
  biggy: 'Spinner',
  nolly: 'Nose-tech',
  fakie: 'Technician',
  jupiter: 'Spinner',
  hesh: 'Flip-tech',
  latezy: 'Shuvit-spec',
  switchy: 'Switch-wizard',
  hardy: 'Flip-tech',
  caball: 'Spinner',
  freely: 'Switch-wizard',
  impy: 'Flip-tech',
  c360po: 'Flip-tech',
  laser: 'Flip-tech',
  tre: 'Flip-tech',
  double: 'Flip-tech',
  baily: 'Send-it',
  tictac: 'Send-it',
  wally: 'Old-school',
  lanky: 'Slider',
  wallride: 'Transition',
  droopy: 'Grinder',
  spine: 'Transition',
  skater: 'All-rounder',
  smitty: 'Grinder',
  drone: 'All-rounder',
};

/** Explicit profile label; it has no effect on gameplay. */
export function robotVibe(robot: Robot): string {
  return ROBOT_VIBE[robot.behaviorId ?? robot.id] ?? 'Technician';
}
