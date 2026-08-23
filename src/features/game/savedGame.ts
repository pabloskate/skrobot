import type { GameState } from './engine';
import type { TrickAttempt } from '@/features/records';
import { TRICK_BY_ID } from '@/features/tricks';

export type SavedGameMode = 'screen' | 'voice';

/** Player evidence accumulated during a match, carried across saves and mode switches. */
export interface GameProgress {
  tricksLanded: string[];
  trickAttempts: TrickAttempt[];
}

export interface GameSessionSnapshot {
  state: GameState;
  progress: GameProgress;
}

export interface GameSessionIdentity {
  id: string;
  startedAt: string;
}

export interface SavedGame {
  version: 3;
  savedAt: string;
  robotId: string;
  mode: SavedGameMode;
  session: GameSessionIdentity;
  state: GameState;
  progress: GameProgress;
}

const KEY = 'skaterobot-saved-game';
const CHANGE_EVENT = 'skrobot-saved-game';

// Stable snapshot for useSyncExternalStore — getSnapshot must return the same
// object reference when storage has not changed (JSON.parse always allocates).
let cachedRaw: string | null | undefined;
let cachedGame: SavedGame | null = null;

function notifySavedGameChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function setCache(raw: string | null, game: SavedGame | null): void {
  cachedRaw = raw;
  cachedGame = game;
}

/** True once the match has real progress worth resuming later. */
export function isSaveWorthKeeping(state: GameState): boolean {
  if (state.phase === 'over') return false;
  if (state.phase === 'rps') return false;
  return state.used.length > 0;
}

function rehydrateState(raw: GameState): GameState | null {
  if (raw == null || typeof raw !== 'object') return null;
  if (typeof raw.phase !== 'string' || typeof raw.letters !== 'object' || raw.letters == null) {
    return null;
  }
  if (!Array.isArray(raw.used)) return null;

  let current = raw.current;
  if (current != null) {
    if (typeof current !== 'object' || typeof current.id !== 'string') return null;
    current = TRICK_BY_ID.get(current.id) ?? current;
  }

  return {
    gameFormat: raw.gameFormat === 'sk8' ? 'sk8' : 'skate',
    gameVariant: raw.gameVariant === 'defense' ? 'defense' : 'classic',
    phase: raw.phase,
    stage: raw.stage ?? null,
    letters: {
      player: Number(raw.letters.player) || 0,
      robot: Number(raw.letters.robot) || 0,
    },
    used: raw.used.filter((id): id is string => typeof id === 'string'),
    current,
    attemptsLeft: typeof raw.attemptsLeft === 'number' ? raw.attemptsLeft : 1,
    robotKnewIt: raw.robotKnewIt !== false,
    note: typeof raw.note === 'string' ? raw.note : '',
    winner: raw.winner === 'player' || raw.winner === 'robot' ? raw.winner : null,
  };
}

function rehydrateProgress(value: unknown): GameProgress {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return { tricksLanded: [], trickAttempts: [] };
  }
  const raw = value as Partial<GameProgress>;
  const tricksLanded = Array.isArray(raw.tricksLanded)
    ? raw.tricksLanded.filter((name): name is string => typeof name === 'string')
    : [];
  const trickAttempts = Array.isArray(raw.trickAttempts)
    ? raw.trickAttempts.filter(
        (attempt): attempt is TrickAttempt =>
          attempt != null &&
          typeof attempt === 'object' &&
          typeof attempt.trick === 'string' &&
          typeof attempt.landed === 'boolean',
      )
    : [];
  return { tricksLanded, trickAttempts };
}

function parseSavedGame(value: unknown): SavedGame | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as {
    version?: unknown;
    savedAt?: unknown;
    robotId?: unknown;
    mode?: unknown;
    session?: unknown;
    state?: unknown;
    progress?: unknown;
  };
  if (v.version !== 1 && v.version !== 2 && v.version !== 3) return null;
  if (typeof v.robotId !== 'string' || !v.robotId) return null;
  if (v.mode !== 'screen' && v.mode !== 'voice') return null;
  if (typeof v.savedAt !== 'string') return null;
  const state = rehydrateState(v.state as GameState);
  if (!state || !isSaveWorthKeeping(state)) return null;
  const rawSession = v.session;
  const session =
    v.version === 3 &&
    rawSession != null &&
    typeof rawSession === 'object' &&
    'id' in rawSession &&
    typeof rawSession.id === 'string' &&
    'startedAt' in rawSession &&
    typeof rawSession.startedAt === 'string'
      ? { id: rawSession.id, startedAt: rawSession.startedAt }
      : { id: crypto.randomUUID(), startedAt: v.savedAt };
  return {
    version: 3,
    savedAt: v.savedAt,
    robotId: v.robotId,
    mode: v.mode,
    session,
    state,
    progress: v.version === 2 || v.version === 3 ? rehydrateProgress(v.progress) : rehydrateProgress(null),
  };
}

export function getSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedGame;
    if (raw == null) {
      setCache(null, null);
      return null;
    }
    const parsed = parseSavedGame(JSON.parse(raw));
    if (!parsed) {
      localStorage.removeItem(KEY);
      setCache(null, null);
      return null;
    }
    setCache(raw, parsed);
    return parsed;
  } catch {
    setCache(null, null);
    return null;
  }
}

export function saveGame(input: {
  robotId: string;
  mode: SavedGameMode;
  session: GameSessionIdentity;
  state: GameState;
  progress: GameProgress;
}): SavedGame | null {
  if (!isSaveWorthKeeping(input.state)) {
    clearSavedGame();
    return null;
  }
  const saved: SavedGame = {
    version: 3,
    savedAt: new Date().toISOString(),
    robotId: input.robotId,
    mode: input.mode,
    session: input.session,
    state: input.state,
    progress: rehydrateProgress(input.progress),
  };
  try {
    const raw = JSON.stringify(saved);
    localStorage.setItem(KEY, raw);
    setCache(raw, saved);
    notifySavedGameChanged();
    return saved;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  try {
    const had = localStorage.getItem(KEY) != null;
    localStorage.removeItem(KEY);
    setCache(null, null);
    if (had) notifySavedGameChanged();
  } catch {
    // storage unavailable — best-effort
  }
}

/** Same-tab + cross-tab subscription for the home continue card. */
export function subscribeSavedGame(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key == null) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}
