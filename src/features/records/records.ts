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

export interface GameLogEntry {
  date: string;
  robotId: string;
  mode: 'voice' | 'screen';
  won: boolean;
  playerLetters: number;
  robotLetters: number;
  tricksLanded: string[];
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

/** Player-declared relationship to a trick: "I can do this" / "I'm learning it". */
export type TrickMark = 'claimed' | 'learning';

const MARKS_KEY = 'skaterobot-trickbook';

export function getTrickMarks(): Record<string, TrickMark> {
  try {
    return JSON.parse(localStorage.getItem(MARKS_KEY) ?? '{}');
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
