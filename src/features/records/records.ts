import { TRICK_BY_NAME } from '@/features/tricks';

export interface Record_ {
  w: number;
  l: number;
}

/** One attributable player attempt, keyed by stable trick id. */
export interface TrickAttempt {
  trickId: string;
  landed: boolean;
}

/** Version 2 replaced display-name identity with stable trick ids. */
export interface GameLogEntry {
  version: 2;
  date: string;
  robotId: string;
  mode: 'voice' | 'screen';
  won: boolean;
  playerLetters: number;
  robotLetters: number;
  trickIdsLanded: string[];
  /** Absent on entries logged before attempt tracking. */
  trickAttempts?: TrickAttempt[];
}

export type CompletedMatch = Omit<GameLogEntry, 'version'>;

/** Player-declared relationship to a trick. Proven status comes from game evidence. */
export type TrickMark = 'learning';

export interface ProvenTrick {
  count: number;
  lastDate: string;
  lastRobotId: string;
}

export interface TrickStat {
  attempts: number;
  makes: number;
  misses: number;
  /** makes / attempts (0–1). */
  rate: number;
  lastDate: string;
  lastRobotId: string;
}

export interface RecordsSnapshot {
  records: Record<string, Record_>;
  gameLog: GameLogEntry[];
  marks: Record<string, TrickMark>;
  proven: Record<string, ProvenTrick>;
  stats: Record<string, TrickStat>;
}

const RECORDS_KEY = 'skaterobot-records';
const LOG_KEY = 'skaterobot-gamelog';
const MARKS_KEY = 'skaterobot-trickbook';
const LOG_CAP = 200;
const STORAGE_KEYS = new Set([RECORDS_KEY, LOG_KEY, MARKS_KEY]);

const EMPTY_SNAPSHOT: RecordsSnapshot = {
  records: {},
  gameLog: [],
  marks: {},
  proven: {},
  stats: {},
};

let cachedStorageKey: string | undefined;
let cachedSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function snapshotStorageKey(): string {
  return JSON.stringify([readStorage(RECORDS_KEY), readStorage(LOG_KEY), readStorage(MARKS_KEY)]);
}

function notifyRecordsChanged(): void {
  cachedStorageKey = undefined;
  listeners.forEach((notify) => notify());
}

function handleStorage(event: StorageEvent): void {
  if (event.key === null || STORAGE_KEYS.has(event.key)) notifyRecordsChanged();
}

export function subscribeRecords(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (typeof window !== 'undefined' && !storageListenerAttached) {
    window.addEventListener('storage', handleStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== 'undefined' && storageListenerAttached && listeners.size === 0) {
      window.removeEventListener('storage', handleStorage);
      storageListenerAttached = false;
    }
  };
}

function parseRecords(value: unknown): { records: Record<string, Record_>; changed: boolean } {
  if (!isObject(value)) return { records: {}, changed: value != null };
  const records: Record<string, Record_> = {};
  let changed = false;
  for (const [robotId, candidate] of Object.entries(value)) {
    if (!isObject(candidate)) {
      changed = true;
      continue;
    }
    const w = candidate.w;
    const l = candidate.l;
    if (!Number.isInteger(w) || !Number.isInteger(l) || Number(w) < 0 || Number(l) < 0) {
      changed = true;
      continue;
    }
    records[robotId] = { w: Number(w), l: Number(l) };
  }
  return { records, changed };
}

export function getRecords(): Record<string, Record_> {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const { records, changed } = parseRecords(JSON.parse(raw ?? '{}'));
    if (changed) localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return records;
  } catch {
    return {};
  }
}

function legacyTrickId(name: unknown): string | null {
  return typeof name === 'string' ? (TRICK_BY_NAME.get(name)?.id ?? null) : null;
}

function parseAttempt(value: unknown): { attempt: TrickAttempt | null; changed: boolean } {
  if (!isObject(value) || typeof value.landed !== 'boolean') return { attempt: null, changed: true };
  if (typeof value.trickId === 'string' && value.trickId) {
    return { attempt: { trickId: value.trickId, landed: value.landed }, changed: false };
  }
  const trickId = legacyTrickId(value.trick);
  return trickId
    ? { attempt: { trickId, landed: value.landed }, changed: true }
    : { attempt: null, changed: true };
}

function parseGameLogEntry(value: unknown): { entry: GameLogEntry | null; changed: boolean } {
  if (!isObject(value)) return { entry: null, changed: true };
  if (
    typeof value.date !== 'string' ||
    typeof value.robotId !== 'string' ||
    (value.mode !== 'voice' && value.mode !== 'screen') ||
    typeof value.won !== 'boolean' ||
    typeof value.playerLetters !== 'number' ||
    typeof value.robotLetters !== 'number'
  ) {
    return { entry: null, changed: true };
  }

  let changed = value.version !== 2;
  const rawLanded = value.version === 2 ? value.trickIdsLanded : value.tricksLanded;
  const trickIdsLanded: string[] = [];
  if (Array.isArray(rawLanded)) {
    for (const identity of rawLanded) {
      const trickId = value.version === 2
        ? (typeof identity === 'string' && identity ? identity : null)
        : legacyTrickId(identity);
      if (trickId) trickIdsLanded.push(trickId);
      else changed = true;
    }
  } else {
    changed = true;
  }

  let trickAttempts: TrickAttempt[] | undefined;
  if (Array.isArray(value.trickAttempts)) {
    trickAttempts = [];
    for (const candidate of value.trickAttempts) {
      const parsed = parseAttempt(candidate);
      if (parsed.attempt) trickAttempts.push(parsed.attempt);
      if (parsed.changed) changed = true;
    }
  } else if (value.trickAttempts != null) {
    changed = true;
  }

  return {
    entry: {
      version: 2,
      date: value.date,
      robotId: value.robotId,
      mode: value.mode,
      won: value.won,
      playerLetters: value.playerLetters,
      robotLetters: value.robotLetters,
      trickIdsLanded,
      ...(trickAttempts ? { trickAttempts } : {}),
    },
    changed,
  };
}

function parseGameLog(value: unknown): { log: GameLogEntry[]; changed: boolean } {
  if (!Array.isArray(value)) return { log: [], changed: value != null };
  const log: GameLogEntry[] = [];
  let changed = value.length > LOG_CAP;
  for (const candidate of value.slice(-LOG_CAP)) {
    const parsed = parseGameLogEntry(candidate);
    if (parsed.entry) log.push(parsed.entry);
    if (parsed.changed) changed = true;
  }
  return { log, changed };
}

export function getGameLog(): GameLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const { log, changed } = parseGameLog(JSON.parse(raw ?? '[]'));
    if (changed) localStorage.setItem(LOG_KEY, JSON.stringify(log));
    return log;
  } catch {
    return [];
  }
}

function parseTrickMarks(value: unknown): { marks: Record<string, TrickMark>; changed: boolean } {
  if (!isObject(value)) return { marks: {}, changed: value != null };
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
    const { marks, changed } = parseTrickMarks(JSON.parse(raw ?? '{}'));
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
    notifyRecordsChanged();
  } catch {
    // storage unavailable — records are best-effort
  }
}

/** Persist the result aggregate and its evidence through one feature-owned operation. */
export function recordCompletedMatch(match: CompletedMatch): void {
  let changed = false;
  try {
    const records = getRecords();
    const record = records[match.robotId] ?? { w: 0, l: 0 };
    if (match.won) record.w += 1;
    else record.l += 1;
    records[match.robotId] = record;

    const entry: GameLogEntry = { version: 2, ...match };
    const log = [...getGameLog(), entry].slice(-LOG_CAP);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
    changed = true;
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // storage unavailable — records are best-effort
  }
  if (changed) notifyRecordsChanged();
}

/** Proven-game evidence keyed by stable trick id. */
export function deriveProvenTricks(log: GameLogEntry[]): Record<string, ProvenTrick> {
  const proven: Record<string, ProvenTrick> = {};
  for (const entry of log) {
    for (const trickId of entry.trickIdsLanded) {
      const current = proven[trickId] ?? {
        count: 0,
        lastDate: entry.date,
        lastRobotId: entry.robotId,
      };
      current.count += 1;
      current.lastDate = entry.date;
      current.lastRobotId = entry.robotId;
      proven[trickId] = current;
    }
  }
  return proven;
}

/** Per-trick consistency keyed by stable trick id. */
export function deriveTrickStats(log: GameLogEntry[]): Record<string, TrickStat> {
  const stats: Record<string, TrickStat> = {};
  for (const entry of log) {
    for (const attempt of entry.trickAttempts ?? []) {
      const current = stats[attempt.trickId] ?? {
        attempts: 0,
        makes: 0,
        misses: 0,
        rate: 0,
        lastDate: entry.date,
        lastRobotId: entry.robotId,
      };
      current.attempts += 1;
      if (attempt.landed) current.makes += 1;
      else current.misses += 1;
      current.rate = current.makes / current.attempts;
      current.lastDate = entry.date;
      current.lastRobotId = entry.robotId;
      stats[attempt.trickId] = current;
    }
  }
  return stats;
}

export function getRecordsSnapshot(): RecordsSnapshot {
  const storageKey = snapshotStorageKey();
  if (storageKey === cachedStorageKey) return cachedSnapshot;
  const records = getRecords();
  const gameLog = getGameLog();
  const marks = getTrickMarks();
  cachedSnapshot = {
    records,
    gameLog,
    marks,
    proven: deriveProvenTricks(gameLog),
    stats: deriveTrickStats(gameLog),
  };
  cachedStorageKey = snapshotStorageKey();
  return cachedSnapshot;
}

export function getServerRecordsSnapshot(): RecordsSnapshot {
  return EMPTY_SNAPSHOT;
}

/** Retained for leaf callers that only need one derivation. Prefer the snapshot hook in screens. */
export function getProvenTricks(): Record<string, ProvenTrick> {
  return deriveProvenTricks(getGameLog());
}
