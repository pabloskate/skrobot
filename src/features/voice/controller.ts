import type { GameAction, GameState, Rps } from '@/features/game';
import {
  LETTERS,
  chooseRobotTrick,
  gameReducer,
  initialGameState,
  robotThrow,
  rollAttempt,
  rpsOutcome,
} from '@/features/game';
import { appendGameLog, recordResult } from '@/features/records';
import type { Robot } from '@/features/robots';
import { buildBag } from '@/features/robots';
import type { Trick } from '@/features/tricks';
import { TRICK_BY_ID } from '@/features/tricks';
import { resolveTrick } from './trickResolver';

export interface Snapshot {
  phase: GameState['phase'];
  playerLetters: string;
  robotLetters: string;
  trickToCopy: string | null;
  copyAttemptsLeft: number;
  usedTricks: string[];
  winner: 'player' | 'robot' | null;
  /** What the model should ask the player for next. Values are self-describing
   * sentences-in-miniature: the live model narrates words, not booleans. */
  nextExpected: 'rps_throw' | 'player_sets_next_trick' | 'player_copies_trick' | 'game_over';
}

/** Facts about what the robot just did, for the model to narrate. */
export interface RobotEvents {
  robotCopy?: { trick: string; result: 'copied' | 'fell'; knewIt: boolean; usedRetry: boolean; tookLetter: boolean };
  robotSet?: { trick: string | null; result: 'landed' | 'fell' | 'out_of_tricks' };
}

const spell = (n: number) => (n === 0 ? 'no letters' : LETTERS.slice(0, n).join('-'));

export class VoiceGameController {
  state: GameState = initialGameState;
  readonly robot: Robot;
  readonly pool: Trick[];
  private bag: Map<string, number>;
  private prevState: GameState | null = null;
  private recorded = false;
  tricksLanded: string[] = [];
  onChange?: (state: GameState) => void;
  /** Fired for every robot trick attempt (including retries) so the UI can animate it. */
  onRobotAttempt?: (trick: Trick, landed: boolean) => void;

  /** `resume` continues a game handed over from the on-screen mode. */
  constructor(robot: Robot, pool: Trick[], resume?: GameState) {
    this.robot = robot;
    this.pool = pool;
    this.bag = buildBag(robot, pool);
    if (resume) {
      this.state = resume;
      this.recorded = resume.phase === 'over';
    }
  }

  private dispatch(a: GameAction) {
    this.state = gameReducer(this.state, a);
    if (this.state.phase === 'over' && this.state.winner && !this.recorded) {
      this.recorded = true;
      const won = this.state.winner === 'player';
      recordResult(this.robot.id, won);
      appendGameLog({
        date: new Date().toISOString(),
        robotId: this.robot.id,
        mode: 'voice',
        won,
        playerLetters: this.state.letters.player,
        robotLetters: this.state.letters.robot,
        tricksLanded: this.tricksLanded,
      });
    }
    this.onChange?.(this.state);
  }

  snapshot(): Snapshot {
    const s = this.state;
    return {
      phase: s.phase,
      playerLetters: spell(s.letters.player),
      robotLetters: spell(s.letters.robot),
      trickToCopy: s.phase === 'playerCopy' ? (s.current?.name ?? null) : null,
      copyAttemptsLeft: s.phase === 'playerCopy' ? s.attemptsLeft : 0,
      usedTricks: s.used.map((id) => TRICK_BY_ID.get(id)?.name ?? id),
      winner: s.winner ?? null,
      nextExpected:
        s.phase === 'rps'
          ? 'rps_throw'
          : s.phase === 'over'
            ? 'game_over'
            : s.phase === 'playerCopy'
              ? 'player_copies_trick'
              : 'player_sets_next_trick',
    };
  }

  /** One plain-English sentence telling the model what to prompt the player for. */
  nextStep(): string {
    switch (this.snapshot().nextExpected) {
      case 'rps_throw':
        return 'Ask the player for their rock-paper-scissors throw.';
      case 'player_sets_next_trick':
        return "It is the PLAYER's turn to set: ask what trick they are going for, then wait for them to report how it went.";
      case 'player_copies_trick':
        return `The player must now copy ${this.state.current!.name}${
          this.state.attemptsLeft === 2 ? ' — they get TWO tries (last-letter defense)' : ''
        }. Wait for them to report how it went.`;
      case 'game_over':
        return `GAME OVER — ${this.state.winner === 'player' ? 'the PLAYER wins' : 'YOU (the robot) win'}. Announce it and offer a rematch.`;
    }
  }

  private letterScore(): string {
    return `Letters now: you (the robot) have ${spell(this.state.letters.robot)}, the player has ${spell(this.state.letters.player)}.`;
  }

  /** Compose the `summary` ground-truth narration string for a tool response. */
  private summarize(...parts: (string | undefined)[]): string {
    return [...parts.filter(Boolean), this.letterScore(), this.nextStep()].join(' ');
  }

  private describeRobotSet(set: NonNullable<RobotEvents['robotSet']>): string {
    if (set.result === 'out_of_tricks')
      return 'You (the robot) had no unused tricks left to set, so the set passes to the player.';
    if (set.result === 'fell')
      return `You (the robot) tried to set ${set.trick} and FELL — you did NOT land it. There is nothing for the player to copy, and nobody takes a letter for missing their own set.`;
    return `You (the robot) set ${set.trick} and LANDED it.`;
  }

  private describeRobotCopy(copy: NonNullable<RobotEvents['robotCopy']>): string {
    if (copy.result === 'copied')
      return `You (the robot) copied their ${copy.trick}${copy.usedRetry ? ' on your second try' : ''} — no letter for you. Copying never steals the set: the player keeps setting.`;
    const how = copy.knewIt ? `tried to copy their ${copy.trick} and FELL` : `had no idea how to do their ${copy.trick} and bailed`;
    return `You (the robot) ${how} — you take a letter. The player keeps setting.`;
  }

  remainingTricks(): string[] {
    const used = new Set(this.state.used);
    return this.pool.filter((t) => !used.has(t.id)).map((t) => t.name);
  }

  /** Re-read phase after dispatches; defeats TS narrowing from earlier guards. */
  private phaseNow(): GameState['phase'] {
    return this.state.phase;
  }

  private saveUndo() {
    this.prevState = this.state;
  }

  undo(): { ok: boolean; summary: string } {
    if (!this.prevState) return { ok: false, summary: `Nothing to undo. ${this.nextStep()}` };
    this.state = this.prevState;
    this.prevState = null;
    this.onChange?.(this.state);
    return { ok: true, summary: `Reverted the last report. ${this.letterScore()} ${this.nextStep()}` };
  }

  throwRps(choice: Rps) {
    if (this.state.phase !== 'rps')
      return { error: `The toss is already done. ${this.nextStep()}`, ...this.snapshot() };
    const theirs = robotThrow();
    const outcome = rpsOutcome(choice, theirs);
    if (outcome === 'tie') {
      return {
        player: choice,
        robot: theirs,
        tossResult: 'tie_throw_again',
        summary: `Tie — you both threw ${choice}. Ask the player to throw again.`,
        ...this.snapshot(),
      };
    }
    this.dispatch({ type: 'START', playerFirst: outcome === 'win' });
    const events: RobotEvents = {};
    // Robot won the toss — it sets immediately so the game never idles in robotSet.
    if (outcome === 'lose') events.robotSet = this.runRobotSet();
    return {
      player: choice,
      robot: theirs,
      tossResult: outcome === 'win' ? 'player_sets_first' : 'robot_sets_first',
      ...events,
      summary: this.summarize(
        outcome === 'win'
          ? `The player's ${choice} beats your ${theirs} — the player sets first.`
          : `Your ${theirs} beats the player's ${choice} — you set first.`,
        events.robotSet && this.describeRobotSet(events.robotSet),
      ),
      ...this.snapshot(),
    };
  }

  /** Run the robot's copy attempt(s) after the player lands a set. */
  private runRobotCopy(): NonNullable<RobotEvents['robotCopy']> {
    const trick = this.state.current!;
    let usedRetry = false;
    let res = rollAttempt(this.bag, trick.id);
    this.onRobotAttempt?.(trick, res.landed);
    this.dispatch({ type: 'ROBOT_COPY_RESULT', landed: res.landed, knewIt: res.knewIt });
    if (this.state.stage === 'retry') {
      usedRetry = true;
      res = rollAttempt(this.bag, trick.id);
      this.onRobotAttempt?.(trick, res.landed);
      this.dispatch({ type: 'ROBOT_COPY_RESULT', landed: res.landed, knewIt: res.knewIt });
    }
    const tookLetter = this.state.stage === 'missed';
    this.dispatch({ type: 'CONTINUE' });
    return { trick: trick.name, result: tookLetter ? 'fell' : 'copied', knewIt: res.knewIt, usedRetry, tookLetter };
  }

  /** Run the robot's own set: pick a trick and attempt it. */
  private runRobotSet(): NonNullable<RobotEvents['robotSet']> {
    const trick = chooseRobotTrick(this.bag, this.state.used, TRICK_BY_ID);
    this.dispatch({ type: 'ROBOT_SET_CHOICE', trick });
    if (!trick) {
      this.dispatch({ type: 'CONTINUE' });
      return { trick: null, result: 'out_of_tricks' };
    }
    const { landed } = rollAttempt(this.bag, trick.id);
    this.onRobotAttempt?.(trick, landed);
    this.dispatch({ type: 'ROBOT_SET_RESULT', landed });
    const set: NonNullable<RobotEvents['robotSet']> = { trick: trick.name, result: landed ? 'landed' : 'fell' };
    this.dispatch({ type: 'CONTINUE' });
    return set;
  }

  reportSetAttempt(landed: boolean, trickName?: string) {
    if (this.state.phase !== 'playerSet')
      return { error: `Not expecting a set report right now — it is not the player's set. ${this.nextStep()}`, ...this.snapshot() };

    if (landed) {
      if (!trickName) return { error: 'Need the trick name. Ask the player what they landed.', ...this.snapshot() };
      const used = new Set(this.state.used);
      const available = this.pool.filter((t) => !used.has(t.id));
      const res = resolveTrick(trickName, available);
      if (res.kind === 'none')
        return { error: `Couldn't match "${trickName}" to an available trick. Ask them to repeat it.`, ...this.snapshot() };
      if (res.kind === 'ambiguous')
        return { needsClarification: res.candidates.map((t) => t.name), ...this.snapshot() };

      this.saveUndo();
      this.tricksLanded.push(res.trick.name);
      this.dispatch({ type: 'PLAYER_SET_LANDED', trick: res.trick });
      const robotCopy = this.runRobotCopy();
      return {
        trickResolvedAs: res.trick.name,
        robotCopy,
        summary: this.summarize(
          `Recorded: the player LANDED ${res.trick.name} as their set.`,
          this.describeRobotCopy(robotCopy),
        ),
        ...this.snapshot(),
      };
    }

    this.saveUndo();
    this.dispatch({ type: 'PLAYER_SET_MISSED' });
    const robotSet = this.runRobotSet();
    return {
      robotSet,
      summary: this.summarize(
        'Recorded: the player missed their set attempt — no letter for missing your own set, but the set passes to you.',
        this.describeRobotSet(robotSet),
      ),
      ...this.snapshot(),
    };
  }

  reportCopyAttempt(landed: boolean) {
    if (this.state.phase !== 'playerCopy')
      return {
        error: `Not expecting a copy report right now — there is no trick for the player to copy. ${this.nextStep()}`,
        ...this.snapshot(),
      };
    this.saveUndo();
    const trickName = this.state.current!.name;
    const events: RobotEvents = {};

    if (landed) {
      this.tricksLanded.push(trickName);
      this.dispatch({ type: 'PLAYER_COPY_LANDED' });
    } else {
      this.dispatch({ type: 'PLAYER_COPY_MISSED' });
      if (this.phaseNow() === 'playerCopy') {
        // Last-letter defense: one more try before the letter sticks.
        return {
          lastChance: true,
          summary: `The player fell on ${trickName}, but they are defending their last letter, so they get ONE MORE TRY at it. No letter yet — tell them to go again.`,
          ...this.snapshot(),
        };
      }
    }
    if (this.phaseNow() === 'robotSet') events.robotSet = this.runRobotSet();
    return {
      playerLanded: landed,
      playerTookLetter: !landed,
      ...events,
      summary: this.summarize(
        landed
          ? `Recorded: the player COPIED ${trickName} — no letter for them.`
          : `Recorded: the player fell on ${trickName} and takes a letter.`,
        events.robotSet && this.describeRobotSet(events.robotSet),
      ),
      ...this.snapshot(),
    };
  }

  rematch() {
    this.state = initialGameState;
    this.prevState = null;
    this.recorded = false;
    this.tricksLanded = [];
    this.bag = buildBag(this.robot, this.pool);
    this.onChange?.(this.state);
    return { summary: 'Fresh game started. Ask the player for their rock-paper-scissors throw.', ...this.snapshot() };
  }
}
