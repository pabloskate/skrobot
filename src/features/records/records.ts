export interface Record_ {
  w: number;
  l: number;
}

const KEY = 'skaterobot-records';

export function getRecords(): Record<string, Record_> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** One player trick attempt with a known outcome. Keyed by trick NAME, same as
 * tricksLanded. Only attributable attempts are recorded: landed sets, and copy
 * makes/misses. A passed set ("couldn't land one") names no trick, so it isn't
 * one — consistency rates are over the attempts we can attribute. */
export interface TrickAttempt {
  trick: string;
  landed: boolean;
}

export interface GameLogEntry {
  date: string;
  robotId: string;
  mode: 'voice' | 'screen';
  won: boolean;
  playerLetters: number;
  robotLetters: number;
  tricksLanded: string[];
  /** Per-trick make/miss outcomes. Absent on entries logged before attempt
   * tracking — those contribute to proven tricks but not to consistency stats. */
  trickAttempts?: TrickAttempt[];
}

const LOG_KEY = 'skaterobot-gamelog';
const LOG_CAP = 200;

export function getGameLog(): GameLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function appendGameLog(entry: GameLogEntry): void {
  try {
    const log = [...getGameLog(), entry].slice(-LOG_CAP);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // storage unavailable — best-effort, same as records
  }
}

/** Player-declared relationship to a trick: "I'm learning it". Bag membership is
 * earned only by landing the trick in a game (see ProvenTrick / deriveProvenTricks). */
export type TrickMark = 'learning';

const MARKS_KEY = 'skaterobot-trickbook';

function parseTrickMarks(value: unknown): { marks: Record<string, TrickMark>; changed: boolean } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return { marks: {}, changed: value != null };

  const marks: Record<string, TrickMark> = {};
  let changed = false;
  for (const [trickId, mark] of Object.entries(value)) {
    if (mark === 'learning') marks[trickId] = mark;
    else changed = true;
  }
  return { marks, changed };
}

export function getTrickMarks(): Record<string, TrickMark> {
  try {
    const raw = localStorage.getItem(MARKS_KEY);
    const parsed = JSON.parse(raw ?? '{}');
    const { marks, changed } = parseTrickMarks(parsed);
    if (changed || raw == null) localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
    return marks;
  } catch {
    return {};
  }
}

export function setTrickMark(trickId: string, mark: TrickMark | null): void {
  try {
    const marks = getTrickMarks();
    if (mark === null) delete marks[trickId];
    else marks[trickId] = mark;
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  } catch {
    // storage unavailable — best-effort, same as records
  }
}

/** A trick proven in a game, derived from the game log. Keyed by trick NAME. */
export interface ProvenTrick {
  count: number;
  lastDate: string;
  lastRobotId: string;
}

export function getProvenTricks(): Record<string, ProvenTrick> {
  return deriveProvenTricks(getGameLog());
}

export function deriveProvenTricks(log: GameLogEntry[]): Record<string, ProvenTrick> {
  const proven: Record<string, ProvenTrick> = {};
  for (const entry of log) {
    for (const name of entry.tricksLanded) {
      const p = proven[name] ?? { count: 0, lastDate: entry.date, lastRobotId: entry.robotId };
      p.count += 1;
      p.lastDate = entry.date;
      p.lastRobotId = entry.robotId;
      proven[name] = p;
    }
  }
  return proven;
}

/** Per-trick consistency over tracked attempts, derived from the game log.
 * Keyed by trick NAME. This is the raw material for trick recommendations:
 * rate tells you how dialled a trick is, attempts how much to trust it. */
export interface TrickStat {
  attempts: number;
  makes: number;
  misses: number;
  /** makes / attempts (0–1). */
  rate: number;
  lastDate: string;
  lastRobotId: string;
}

export function getTrickStats(): Record<string, TrickStat> {
  return deriveTrickStats(getGameLog());
}

export function deriveTrickStats(log: GameLogEntry[]): Record<string, TrickStat> {
  const stats: Record<string, TrickStat> = {};
  for (const entry of log) {
    for (const attempt of entry.trickAttempts ?? []) {
      const s =
        stats[attempt.trick] ??
        { attempts: 0, makes: 0, misses: 0, rate: 0, lastDate: entry.date, lastRobotId: entry.robotId };
      s.attempts += 1;
      if (attempt.landed) s.makes += 1;
      else s.misses += 1;
      s.rate = s.makes / s.attempts;
      s.lastDate = entry.date;
      s.lastRobotId = entry.robotId;
      stats[attempt.trick] = s;
    }
  }
  return stats;
}

export function recordResult(robotId: string, won: boolean): void {
  const records = getRecords();
  const rec = records[robotId] ?? { w: 0, l: 0 };
  if (won) rec.w += 1;
  else rec.l += 1;
  records[robotId] = rec;
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    // storage unavailable (private mode etc.) — records are best-effort
  }
}
