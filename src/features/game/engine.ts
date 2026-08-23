import { trickSetWeight, type SetWeightRobot } from '@/features/robots';
import type { Trick } from '@/features/tricks';

export type Phase = 'rps' | 'playerSet' | 'robotCopy' | 'robotSet' | 'playerCopy' | 'over';

/** Sub-state for animated robot sequences. */
export type Stage =
  | 'thinking' // robot picking a trick to set
  | 'attempting' // robot mid-attempt
  | 'retry' // robot missed first try on its last letter, one more roll
  | 'landed'
  | 'missed'
  | 'cant' // robot has no unused tricks left to set
  | null;

export type Side = 'player' | 'robot';

export type GameFormat = 'skate' | 'sk8';
export type GameVariant = 'classic' | 'defense';

export const GAME_LETTERS = {
  skate: ['S', 'K', 'A', 'T', 'E'],
  sk8: ['S', 'K', '8'],
} as const;

/** Letters used by the classic format. Kept as a public alias for existing callers. */
export const LETTERS = GAME_LETTERS.skate;

export function lettersForFormat(format: GameFormat): readonly string[] {
  return GAME_LETTERS[format];
}

export interface GameState {
  gameFormat: GameFormat;
  /** Classic alternates setters; defense keeps the robot setting every trick. */
  gameVariant: GameVariant;
  phase: Phase;
  stage: Stage;
  letters: Record<Side, number>;
  /** Trick ids successfully landed as a set by either side — off limits for the rest of the game. */
  used: string[];
  /** The trick currently being set / copied. */
  current: Trick | null;
  /** Copy attempts remaining (2 when defending your last letter, else 1). */
  attemptsLeft: number;
  /** Whether the robot knew the current trick at all (for flavor text). */
  robotKnewIt: boolean;
  /** Context line shown above the action area. {R} is replaced with the robot's name. */
  note: string;
  winner: Side | null;
}

export function createInitialGameState(
  gameFormat: GameFormat = 'skate',
  gameVariant: GameVariant = 'classic',
): GameState {
  return {
    gameFormat,
    gameVariant,
    phase: gameVariant === 'defense' ? 'robotSet' : 'rps',
    stage: gameVariant === 'defense' ? 'thinking' : null,
    letters: { player: 0, robot: 0 },
    used: [],
    current: null,
    attemptsLeft: 1,
    robotKnewIt: true,
    note: gameVariant === 'defense' ? '{R} sets every trick. Land it to give them a letter.' : '',
    winner: null,
  };
}

export const initialGameState: GameState = createInitialGameState();

export type GameAction =
  | { type: 'START'; playerFirst: boolean }
  | { type: 'PLAYER_SET_LANDED'; trick: Trick }
  | { type: 'PLAYER_SET_MISSED' }
  | { type: 'ROBOT_COPY_RESULT'; landed: boolean; knewIt: boolean }
  | { type: 'ROBOT_SET_CHOICE'; trick: Trick | null }
  | { type: 'ROBOT_SET_RESULT'; landed: boolean }
  | { type: 'PLAYER_COPY_LANDED' }
  | { type: 'PLAYER_COPY_MISSED' }
  | { type: 'CONTINUE' }
  | { type: 'REMATCH' };

const copyAttempts = (state: GameState, letterCount: number) =>
  letterCount === lettersForFormat(state.gameFormat).length - 1 ? 2 : 1;

export function gameReducer(s: GameState, a: GameAction): GameState {
  switch (a.type) {
    case 'START':
      return a.playerFirst
        ? { ...s, phase: 'playerSet', note: 'You won the toss — you set first!' }
        : { ...s, phase: 'robotSet', stage: 'thinking', note: '{R} won the toss and sets first.' };

    case 'PLAYER_SET_LANDED':
      return {
        ...s,
        phase: 'robotCopy',
        stage: 'attempting',
        current: a.trick,
        used: [...s.used, a.trick.id],
        attemptsLeft: copyAttempts(s, s.letters.robot),
        note: '',
      };

    case 'PLAYER_SET_MISSED':
      return { ...s, phase: 'robotSet', stage: 'thinking', note: "You couldn't land a set — {R} takes over." };

    case 'ROBOT_COPY_RESULT': {
      if (a.landed) return { ...s, stage: 'landed', robotKnewIt: a.knewIt };
      if (s.attemptsLeft > 1) {
        return { ...s, stage: 'retry', attemptsLeft: s.attemptsLeft - 1, robotKnewIt: a.knewIt };
      }
      const robotLetters = s.letters.robot + 1;
      return {
        ...s,
        stage: 'missed',
        robotKnewIt: a.knewIt,
        letters: { ...s.letters, robot: robotLetters },
        winner: robotLetters >= lettersForFormat(s.gameFormat).length ? 'player' : s.winner,
      };
    }

    case 'ROBOT_SET_CHOICE':
      return a.trick
        ? { ...s, stage: 'attempting', current: a.trick }
        : { ...s, stage: 'cant', current: null };

    case 'ROBOT_SET_RESULT':
      return a.landed || s.gameVariant === 'defense'
        ? { ...s, stage: 'landed', used: [...s.used, s.current!.id] }
        : { ...s, stage: 'missed' };

    case 'PLAYER_COPY_LANDED': {
      if (s.gameVariant === 'defense') {
        const robotLetters = s.letters.robot + 1;
        const won = robotLetters >= lettersForFormat(s.gameFormat).length;
        return {
          ...s,
          phase: won ? 'over' : 'robotSet',
          stage: won ? null : 'thinking',
          current: null,
          letters: { ...s.letters, robot: robotLetters },
          winner: won ? 'player' : null,
          note: won ? '' : 'You matched it — {R} takes a letter and sets again.',
        };
      }
      return { ...s, phase: 'robotSet', stage: 'thinking', current: null, note: 'You matched it! {R} sets again.' };
    }

    case 'PLAYER_COPY_MISSED': {
      if (s.gameVariant === 'defense') {
        const playerLetters = s.letters.player + 1;
        const lost = playerLetters >= lettersForFormat(s.gameFormat).length;
        return {
          ...s,
          phase: lost ? 'over' : 'robotSet',
          stage: lost ? null : 'thinking',
          current: null,
          letters: { ...s.letters, player: playerLetters },
          winner: lost ? 'robot' : null,
          note: lost ? '' : "You missed it — that's your letter. {R} sets again.",
        };
      }
      if (s.attemptsLeft > 1) {
        const finalLetter = lettersForFormat(s.gameFormat).at(-1);
        return {
          ...s,
          attemptsLeft: s.attemptsLeft - 1,
          note: `Last chance — land it or take the ${finalLetter}!`,
        };
      }
      const playerLetters = s.letters.player + 1;
      const lost = playerLetters >= lettersForFormat(s.gameFormat).length;
      return {
        ...s,
        phase: lost ? 'over' : 'robotSet',
        stage: lost ? null : 'thinking',
        current: null,
        letters: { ...s.letters, player: playerLetters },
        winner: lost ? 'robot' : null,
        note: lost ? '' : `That's a letter. {R} keeps setting.`,
      };
    }

    case 'CONTINUE': {
      if (s.winner) return { ...s, phase: 'over', stage: null, current: null };
      if (s.phase === 'robotCopy') {
        // Robot finished responding to your set — you keep setting either way.
        const note = s.stage === 'landed' ? '{R} matched it — set another one!' : '{R} takes a letter! Keep setting.';
        return { ...s, phase: 'playerSet', stage: null, current: null, note };
      }
      if (s.phase === 'robotSet') {
        if (s.stage === 'landed') {
          return {
            ...s,
            phase: 'playerCopy',
            stage: null,
            attemptsLeft: copyAttempts(s, s.letters.player),
            note:
              s.letters.player === lettersForFormat(s.gameFormat).length - 1
                ? 'Defend your last letter — you get two tries!'
                : '',
          };
        }
        if (s.gameVariant === 'defense') {
          return { ...s, phase: 'over', stage: null, current: null, winner: 'player', note: '' };
        }
        const note = s.stage === 'cant' ? "{R} is out of tricks — you take over!" : "{R} didn't land it — your turn to set!";
        return { ...s, phase: 'playerSet', stage: null, current: null, note };
      }
      return s;
    }

    case 'REMATCH':
      return createInitialGameState(s.gameFormat, s.gameVariant);

    default:
      return s;
  }
}

/**
 * Weighted random pick from the robot's bag, excluding tricks already set this
 * game. Every weight is explicitly configured for that robot/trick. Returns
 * null when nothing is left (or every leftover trick has weight 0).
 */
export function chooseRobotTrick(
  bag: Map<string, number>,
  used: string[],
  trickById: Map<string, Trick>,
  robot: SetWeightRobot,
  random: () => number = Math.random,
  setWeight: (trick: Trick, robot: SetWeightRobot) => number = trickSetWeight,
): Trick | null {
  const usedSet = new Set(used);
  const options: { trick: Trick; weight: number }[] = [];
  for (const [id] of bag) {
    if (usedSet.has(id)) continue;
    const trick = trickById.get(id);
    if (!trick) continue;
    const weight = setWeight(trick, robot);
    if (weight <= 0) continue;
    options.push({ trick, weight });
  }
  if (options.length === 0) return null;
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = random() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.trick;
  }
  return options[options.length - 1].trick;
}

/** Roll a landing attempt. Tricks outside the bag are an automatic miss. */
export function rollAttempt(
  bag: Map<string, number>,
  trickId: string,
  random: () => number = Math.random,
): { landed: boolean; knewIt: boolean } {
  const consistency = bag.get(trickId);
  if (consistency === undefined) return { landed: false, knewIt: false };
  return { landed: random() < consistency, knewIt: true };
}
