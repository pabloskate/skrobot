import { FLIP_T, ROLL_IN } from '../TrickAnimation';
import type { StagePlan } from './stage';

/**
 * What an attempt sounds like, on its own clock: the moments that make a
 * sound — the tail snapping off the ground, the board meeting the rail and
 * popping off it, the wheels coming back down — and how loud the wheels roll
 * and the rail scrapes at any moment. Worked out from the stage plan alone,
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
  /** Four wheels back down with the rider on: `weight` 1 off a flatground pop, more off a drop. */
  | { kind: 'land'; at: number; weight: number }
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
}

/** Landing weights off the stairs' nine feet and the bottom of El Toro's handrail. */
const STAIRS_LANDING = 1.5;
const HANDRAIL_LANDING = 1.3;
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

const quiet = () => 0;

export function soundtrackFor(stage: StagePlan): Soundtrack {
  const { grind, stairs, landed } = stage;
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
        { kind: 'land', at: grind.land, weight: grind.handrail ? HANDRAIL_LANDING : 1 },
      );
    } else {
      cues.push({ kind: 'crash', at: down, weight: grind.handrail ? HANDRAIL_LANDING : 1 });
    }
    return {
      cues,
      slide: grind.spec.slide,
      roll: wheels(grind.pop, down, grind.fail == null),
      grind: (t) => (t >= grind.lockAt && t < leave ? 1 : 0),
    };
  }
  const pop = stairs?.pop ?? ROLL_IN;
  const down = stairs?.land ?? ROLL_IN + FLIP_T;
  const weight = stairs ? STAIRS_LANDING : 1;
  return {
    cues: [
      { kind: 'pop', at: pop },
      landed ? { kind: 'land', at: down, weight } : { kind: 'crash', at: down, weight },
    ],
    slide: false,
    roll: wheels(pop, down, landed),
    grind: quiet,
  };
}

/** The cues a clock running from `from` to `to` passes: after `from`, up to and including `to`. */
export function cuesBetween(track: Soundtrack, from: number, to: number): SoundCue[] {
  return track.cues.filter((cue) => cue.at > from && cue.at <= to);
}
