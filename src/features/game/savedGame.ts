import type { GameState } from './engine';
import { TRICK_BY_ID } from '@/features/tricks';

export type SavedGameMode = 'screen' | 'voice';

export interface SavedGame {
  version: 1;
  savedAt: string;
  robotId: string;
  mode: SavedGameMode;
  state: GameState;
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

function parseSavedGame(value: unknown): SavedGame | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Partial<SavedGame>;
  if (v.version !== 1) return null;
  if (typeof v.robotId !== 'string' || !v.robotId) return null;
  if (v.mode !== 'screen' && v.mode !== 'voice') return null;
  if (typeof v.savedAt !== 'string') return null;
  const state = rehydrateState(v.state as GameState);
  if (!state || !isSaveWorthKeeping(state)) return null;
  return { version: 1, savedAt: v.savedAt, robotId: v.robotId, mode: v.mode, state };
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
  state: GameState;
}): SavedGame | null {
  if (!isSaveWorthKeeping(input.state)) {
    clearSavedGame();
    return null;
  }
  const saved: SavedGame = {
    version: 1,
    savedAt: new Date().toISOString(),
    robotId: input.robotId,
    mode: input.mode,
    state: input.state,
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
