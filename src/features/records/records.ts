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
