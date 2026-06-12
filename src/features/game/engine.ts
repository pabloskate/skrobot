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

export const LETTERS = ['S', 'K', 'A', 'T', 'E'] as const;

export interface GameState {
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

export const initialGameState: GameState = {
  phase: 'rps',
  stage: null,
  letters: { player: 0, robot: 0 },
  used: [],
  current: null,
  attemptsLeft: 1,
  robotKnewIt: true,
  note: '',
  winner: null,
};

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

const copyAttempts = (letterCount: number) => (letterCount === LETTERS.length - 1 ? 2 : 1);

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
        attemptsLeft: copyAttempts(s.letters.robot),
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
        winner: robotLetters >= LETTERS.length ? 'player' : s.winner,
      };
    }

    case 'ROBOT_SET_CHOICE':
      return a.trick
        ? { ...s, stage: 'attempting', current: a.trick }
        : { ...s, stage: 'cant', current: null };

    case 'ROBOT_SET_RESULT':
      return a.landed
        ? { ...s, stage: 'landed', used: [...s.used, s.current!.id] }
        : { ...s, stage: 'missed' };

    case 'PLAYER_COPY_LANDED':
      return { ...s, phase: 'robotSet', stage: 'thinking', current: null, note: 'You matched it! {R} sets again.' };

    case 'PLAYER_COPY_MISSED': {
      if (s.attemptsLeft > 1) {
        return { ...s, attemptsLeft: s.attemptsLeft - 1, note: 'Last chance — land it or take the E!' };
      }
      const playerLetters = s.letters.player + 1;
      const lost = playerLetters >= LETTERS.length;
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
            attemptsLeft: copyAttempts(s.letters.player),
            note: s.letters.player === LETTERS.length - 1 ? 'Defend your last letter — you get two tries!' : '',
          };
        }
        const note = s.stage === 'cant' ? "{R} is out of tricks — you take over!" : "{R} didn't land it — your turn to set!";
        return { ...s, phase: 'playerSet', stage: null, current: null, note };
      }
      return s;
    }

    case 'REMATCH':
      return initialGameState;

    default:
      return s;
  }
}

/**
 * Weighted random pick from the robot's bag, excluding tricks already set this
 * game. Weight is the consistency itself, so a 90% trick is 9x more likely
 * than a 10% trick. Returns null when nothing is left.
 */
export function chooseRobotTrick(
  bag: Map<string, number>,
  used: string[],
  trickById: Map<string, Trick>,
): Trick | null {
  const usedSet = new Set(used);
  const options: { trick: Trick; weight: number }[] = [];
  for (const [id, consistency] of bag) {
    if (usedSet.has(id)) continue;
    const trick = trickById.get(id);
    if (trick) options.push({ trick, weight: consistency });
  }
  if (options.length === 0) return null;
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll <= 0) return o.trick;
  }
  return options[options.length - 1].trick;
}

/** Roll a landing attempt. Tricks outside the bag are an automatic miss. */
export function rollAttempt(bag: Map<string, number>, trickId: string): { landed: boolean; knewIt: boolean } {
  const consistency = bag.get(trickId);
  if (consistency === undefined) return { landed: false, knewIt: false };
  return { landed: Math.random() < consistency, knewIt: true };
}
