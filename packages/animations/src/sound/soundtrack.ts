import { grindSpeed, travel } from '../motion/grind';
import { ROLL_IN, flightTime } from '../motion/trick';
import { stairSpeed, touchdownSpeed } from '../stage/drop';
import { GRAVITY } from '../units';
import type { StagePlan } from '../stage/stage';
import { boardMotionAt } from '../motion/fall/boardBody';
import { railBailBoardDown, railBailPlan } from '../stage/railBailFrame';

/**
 * What an attempt sounds like, on its own clock: the moments that make a
 * sound — the tail snapping off the ground, the board meeting the rail and
 * popping off it, the wheels coming back down — and how loud the wheels roll
 * and the rail scrapes at any moment, and how fast the wheels are going. Worked out from the stage plan alone,
 * so the sound keeps time with the picture at any speed; skateSounds.ts
 * plays it, live or into a video.
 */

export type SoundCue =
  /** The tail snapping off the ground. */
  | { kind: 'pop'; at: number }
  /** The trucks, or the deck on a slide, meeting the rail. */
  | { kind: 'lock'; at: number }
  /** Popping off the end of the rail. */
  | { kind: 'popOff'; at: number }
  /**
   * The wheels back down with the rider on: `weight` 1 off a flatground pop, more off a drop, less onto a bank.
   * All four, unless `oneTruck`: a manual's touchdown, on the two wheels it rides.
   */
  | { kind: 'land'; at: number; weight: number; oneTruck?: true }
  /** The board coming down without its rider and clattering away. */
  | { kind: 'crash'; at: number; weight: number };

export interface Soundtrack {
  /** In clock order. */
  cues: SoundCue[];
  /** The deck rides the rail (a boardslide, a tailslide…) rather than the trucks: a smoother, woodier scrape. */
  slide: boolean;
  /** 0 → 1: how hard the wheels roll at clock time t. */
  roll(t: number): number;
  /** 0 → 1: how hard the rail scrapes at clock time t. */
  grind(t: number): number;
  /**
   * How fast the wheels roll at clock time t, as a share of cruising on flat
   * ground: quicker into a big set, picking up speed down a roll-in or a
   * handrail, a riderless board slowing to a stop.
   */
  speed(t: number): number;
}

/** Landing weights off the stairs' nine feet and the bottom of El Toro's handrail. */
const STAIRS_LANDING = 1.5;
const HANDRAIL_LANDING = 1.3;
/** The lightest a touchdown sounds, however gently a bank takes it. */
const SOFTEST_LANDING = 0.5;
/** A manual's two wheels roll quieter than all four. */
const ONE_TRUCK_ROLL = 0.7;

/**
 * A touchdown's weight on sloping ground, from the speed the deck meets it
 * with (square to it) against a flatground pop's: a bank falling away under
 * the rider takes little of the fall (Triangle Bank's slab lands lighter
 * than flat ground), and the level ground past it takes all of a drop off
 * its edge. Never heavier than the stairs'.
 */
const landingWeight = (speed: number, stage: StagePlan) =>
  Math.min(STAIRS_LANDING, Math.max(SOFTEST_LANDING, speed / ((GRAVITY * flightTime(stage.style)) / 2)));
/** A board that got away rolls lighter without its rider, and slows to a stop. */
const RIDERLESS_ROLL = 0.5;
const RIDERLESS_STOP = 0.45;

/**
 * The wheels' level: rolling up to the pop, quiet in the air, and rolling
 * away from `down` — under the rider, or on its own and slowing.
 */
function wheels(pop: number, down: number, ridden: boolean) {
  return (t: number) => {
    if (t < pop) return 1;
    if (t < down) return 0;
    return ridden ? 1 : RIDERLESS_ROLL * Math.exp(-(t - down) / RIDERLESS_STOP);
  };
}

/**
 * The wheels' speed, from the rider's (world units a second) as a share of
 * cruising on flat ground; from `down`, a riderless board slows as it fades.
 */
function rolling(speed: (t: number) => number, down: number, ridden: boolean) {
  return (t: number) => {
    const share = speed(t) / CRUISE;
    return ridden || t < down ? share : share * Math.exp(-(t - down) / RIDERLESS_STOP);
  };
}

/** World units a second rolling on flat ground. */
const CRUISE = travel(1);

const quiet = () => 0;

export function soundtrackFor(stage: StagePlan): Soundtrack {
  const track = attemptSoundtrack(stage);
  const hop = stage.stepOff?.at;
  if (hop == null) return track;
  // Stepped off the landing: from the hop the board rolls on alone, lighter, slowing into the brush.
  const fade = (t: number) => (t < hop ? 1 : Math.exp(-(t - hop) / RIDERLESS_STOP));
  return {
    ...track,
    roll: (t) => track.roll(t) * (t < hop ? 1 : RIDERLESS_ROLL * fade(t)),
    speed: (t) => track.speed(t) * fade(t),
  };
}

function attemptSoundtrack(stage: StagePlan): Soundtrack {
  const { grind, stairs, landed } = stage;
  if (grind && stage.railBail) {
    // The scrape ends at the snag; the loose board clatters when it actually comes down.
    const leave = stage.railBail.at;
    const stuck = stage.railBail.bail === 'stick';
    const boardDown = railBailBoardDown(stage);
    const down = Number.isFinite(boardDown) ? boardDown : leave + grind.drop;
    const loose = stuck && Number.isFinite(boardDown) ? boardMotionAt(railBailPlan(stage).board, down).velocity : null;
    const speedAfterSnag = loose ? Math.hypot(loose.x, loose.z) : 0;
    return {
      cues: [
        { kind: 'pop', at: grind.pop },
        { kind: 'lock', at: grind.lockAt },
        ...(stuck ? [{ kind: 'lock' as const, at: leave }] : []),
        { kind: 'crash', at: down, weight: grind.handrail ? HANDRAIL_LANDING : 1 },
      ],
      slide: grind.spec.slide,
      roll: wheels(grind.pop, down, false),
      grind: (t) => (t >= grind.lockAt && t < leave ? 1 : 0),
      speed: rolling((t) => stuck && t >= leave ? (t < down ? 0 : speedAfterSnag) : grindSpeed(grind, Math.min(t, leave)), down, false),
    };
  }
  if (grind) {
    const down = grind.fail == null ? grind.land : grind.fail + grind.drop;
    const leave = grind.fail ?? grind.off;
    const cues: SoundCue[] = [
      { kind: 'pop', at: grind.pop },
      { kind: 'lock', at: grind.lockAt },
    ];
    // Slipping off ends the grind with the board falling to the ground; riding it out pops off the end.
    if (grind.fail == null) {
      cues.push(
        { kind: 'popOff', at: grind.off },
        { kind: landed ? 'land' : 'crash', at: grind.land, weight: grind.handrail ? HANDRAIL_LANDING : 1 },
      );
    } else {
      cues.push({ kind: 'crash', at: down, weight: grind.handrail ? HANDRAIL_LANDING : 1 });
    }
    return {
      cues,
      slide: grind.spec.slide,
      roll: wheels(grind.pop, down, landed),
      grind: (t) => (t >= grind.lockAt && t < leave ? 1 : 0),
      speed: rolling((t) => grindSpeed(grind, t), down, landed),
    };
  }
  const pop = stairs?.pop ?? ROLL_IN;
  const down = stairs?.land ?? ROLL_IN + flightTime(stage.style);
  const weight = !stairs ? 1 : stairs.terrain.slope ? landingWeight(touchdownSpeed(stairs), stage) : STAIRS_LANDING;
  // A bank ridden in a manual is landed, and rolled, on one truck.
  const oneTruck = landed && stairs != null && stairs.bankRide !== 'ride';
  // Rolling off a bank's raised edge, the wheels are in the air again until they meet the ground past it:
  // a second touchdown, as hard as that drop.
  const lip = stairs?.lip ?? Infinity;
  const ledges = landed && stairs ? stairs.ledges : [];
  const rolled = wheels(pop, down, landed);
  return {
    cues: [
      { kind: 'pop', at: pop },
      landed || stage.fall === 'washout' ? { kind: 'land', at: down, weight, ...(oneTruck && { oneTruck }) } : { kind: 'crash', at: down, weight },
      ...ledges.map((ledge): SoundCue => ({ kind: 'land', at: ledge.t, weight: landingWeight(ledge.impact, stage) })),
    ],
    slide: false,
    roll: (t) => (ledges.length && t >= lip && t < ledges[0].t ? 0 : rolled(t) * (oneTruck && t >= down && t < lip ? ONE_TRUCK_ROLL : 1)),
    grind: quiet,
    speed: rolling(stairs ? (t) => stairSpeed(stairs, t) : () => CRUISE, down, landed),
  };
}

/** The cues a clock running from `from` to `to` passes: after `from`, up to and including `to`. */
export function cuesBetween(track: Soundtrack, from: number, to: number): SoundCue[] {
  return track.cues.filter((cue) => cue.at > from && cue.at <= to);
}
