import { ROLL_IN, type HeadPose } from '@skrobot/animations';
import type { Trick } from '@/features/tricks';
import type { SetOption } from './engine';

/**
 * The robot calling its set: a reel of names from its own set options that
 * slows down and clicks onto the trick the engine already picked, while the
 * robot looks up at it and nods. It plays on the attempt stage as the lead-in
 * to the trick. Times here are seconds from the start of the robot's turn.
 */

/** When the reel starts spinning. */
export const REEL_START = 0.1;
/** When the reel clicks onto the pick. */
export const PICK_LOCK = 2.0;
/** When thinking ends: ROBOT_SET_CHOICE fires and the trick's own clock starts. */
export const PICK_GO = 2.3;
/** The called name lifts away just before the pop, leaving the sky to the trick. */
export const NAME_OUT = PICK_GO + ROLL_IN - 0.3;
export const NAME_GONE = PICK_GO + ROLL_IN - 0.06;

/** Names before the pick. A longer reel spends its extra time on the readable slowdown. */
const ROWS = 18;
/** Rows per second as the pick reaches center. */
const ARRIVE = 3;
/** Ease-out power: higher spends longer crawling at the end. */
const EASE = 4;
/** The detent spring that stops the reel on the pick. */
const DETENT_W = 20;
const DETENT_Z = 0.5;

const LOOK_UP = 18;
const LOOK_ROLL = 6;
const COMMIT = 0.45;
const HAPPY_FOR = 0.34;

export interface PickReelPlan {
  /** Top to bottom. `rows[pickRow]` is the pick; one name follows it so the overshoot never shows a gap. */
  rows: Trick[];
  pickRow: number;
  /** Times a new name reaches the center. */
  ticks: number[];
}

/**
 * Reel position in rows. It decelerates but still carries the pick into the
 * center with some speed at the lock, so the pick never sits there early,
 * then a detent spring takes that speed: a small overshoot and a click back.
 */
export function reelPosition(t: number): number {
  if (t <= REEL_START) return 0;
  const span = PICK_LOCK - REEL_START;
  if (t < PICK_LOCK) {
    const u = (t - REEL_START) / span;
    const linear = (ARRIVE * span) / ROWS;
    return ROWS * ((1 - linear) * (1 - (1 - u) ** EASE) + linear * u);
  }
  const s = t - PICK_LOCK;
  const damped = DETENT_W * Math.sqrt(1 - DETENT_Z * DETENT_Z);
  return ROWS + (ARRIVE / damped) * Math.exp(-DETENT_Z * DETENT_W * s) * Math.sin(damped * s);
}

/**
 * The reel for one call. Names are drawn from the options by set weight, so
 * favorites come up more often. With at least two options, names never repeat
 * back to back. A single remaining trick necessarily fills the whole reel.
 */
export function planPickReel(options: SetOption[], pick: Trick, random: () => number = Math.random): PickReelPlan {
  const draw = (neighbourId: string): Trick => {
    const allowed = options.filter((o) => o.trick.id !== neighbourId);
    if (allowed.length === 0) return pick;
    let roll = random() * allowed.reduce((sum, o) => sum + o.weight, 0);
    for (const o of allowed) {
      roll -= o.weight;
      if (roll <= 0) return o.trick;
    }
    return allowed[allowed.length - 1].trick;
  };
  // Build back from the known pick. Each draw excludes just its neighbour,
  // so even a two-trick bag always has a valid candidate.
  const rows: Trick[] = Array(ROWS + 2);
  rows[ROWS] = pick;
  for (let i = ROWS - 1; i >= 0; i--) {
    rows[i] = draw(rows[i + 1].id);
  }
  rows[ROWS + 1] = draw(pick.id);

  const ticks: number[] = [];
  let row = 0;
  for (let t = REEL_START; t < PICK_LOCK; t += 1 / 600) {
    const r = Math.round(reelPosition(t));
    if (r > row) {
      row = r;
      ticks.push(t);
    }
  }
  return { rows, pickRow: ROWS, ticks };
}

const smoothstep = (p: number) => {
  const x = Math.max(0, Math.min(1, p));
  return x * x * (3 - 2 * x);
};

/** Each name the reel settles on gets a small nod, once it's slow enough to read. */
function readingNods(t: number, ticks: number[]): number {
  let nod = 0;
  for (let i = 0; i < ticks.length; i++) {
    const dt = t - ticks[i];
    if (dt < 0) break;
    if (dt > 0.5) continue;
    const gap = i > 0 ? ticks[i] - ticks[i - 1] : 0;
    const amp = 2.6 * Math.max(0, Math.min(1, (gap - 0.045) / 0.14));
    nod += amp * (dt / 0.05) * Math.exp(1 - dt / 0.05);
  }
  return nod;
}

/**
 * The robot reading its reel: it tips its head up toward the names, nods at
 * each readable one, smiles at the call, then nods down past level to the
 * board. Settled well before the pop.
 */
export function pickHead(t: number, { ticks }: PickReelPlan): HeadPose | null {
  if (t >= PICK_LOCK + 0.5) return null;
  const nods = readingNods(t, ticks);
  if (t < PICK_LOCK) {
    const look = smoothstep((t - 0.04) / 0.32);
    return { pitch: LOOK_UP * look - nods, roll: LOOK_ROLL * look };
  }
  const e = smoothstep((t - PICK_LOCK) / COMMIT);
  return {
    pitch: LOOK_UP * (1 - e) - 11 * Math.sin(Math.PI * e) - nods,
    roll: LOOK_ROLL * (1 - e),
    expression: t < PICK_LOCK + HAPPY_FOR ? 'happy' : undefined,
  };
}
