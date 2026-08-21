import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initialGameState, type GameState } from './engine';
import {
  clearSavedGame,
  getSavedGame,
  isSaveWorthKeeping,
  saveGame,
} from './savedGame';

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
}

function midGame(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initialGameState,
    phase: 'playerSet',
    letters: { player: 1, robot: 2 },
    used: ['kickflip'],
    note: 'Keep going',
    ...overrides,
  };
}

const progress = {
  tricksLanded: ['Kickflip'],
  trickAttempts: [
    { trick: 'Kickflip', landed: true },
    { trick: 'Heelflip', landed: false },
  ],
};

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe('isSaveWorthKeeping', () => {
  it('rejects toss, pre-trick, and finished games', () => {
    expect(isSaveWorthKeeping(initialGameState)).toBe(false);
    expect(isSaveWorthKeeping({ ...initialGameState, phase: 'playerSet' })).toBe(false);
    expect(isSaveWorthKeeping({ ...initialGameState, phase: 'over', winner: 'player' })).toBe(false);
  });

  it('keeps mid-match phases', () => {
    expect(isSaveWorthKeeping(midGame())).toBe(true);
    expect(isSaveWorthKeeping(midGame({ phase: 'robotCopy' }))).toBe(true);
  });
});

describe('saveGame / getSavedGame', () => {
  it('round-trips a mid-game save', () => {
    const state = midGame();
    const saved = saveGame({ robotId: 'shifty', mode: 'screen', state, progress });
    expect(saved?.version).toBe(2);
    expect(saved?.robotId).toBe('shifty');
    expect(getSavedGame()?.state.letters).toEqual({ player: 1, robot: 2 });
    expect(getSavedGame()?.state.used).toEqual(['kickflip']);
    expect(getSavedGame()?.progress).toEqual(progress);
  });

  it('round-trips the defense-only variant', () => {
    const state = midGame({ gameVariant: 'defense', phase: 'robotSet' });
    saveGame({ robotId: 'shifty', mode: 'screen', state, progress });
    expect(getSavedGame()?.state.gameVariant).toBe('defense');
  });

  it('loads legacy version-1 saves with empty progress', () => {
    localStorage.setItem(
      'skaterobot-saved-game',
      JSON.stringify({
        version: 1,
        savedAt: '2026-08-01T00:00:00.000Z',
        robotId: 'shifty',
        mode: 'voice',
        state: midGame(),
      }),
    );

    expect(getSavedGame()).toMatchObject({
      version: 2,
      mode: 'voice',
      progress: { tricksLanded: [], trickAttempts: [] },
    });
  });

  it('does not persist rps or over states', () => {
    expect(
      saveGame({ robotId: 'shifty', mode: 'screen', state: initialGameState, progress }),
    ).toBeNull();
    expect(getSavedGame()).toBeNull();
  });

  it('clearSavedGame removes the slot', () => {
    saveGame({ robotId: 'shifty', mode: 'voice', state: midGame(), progress });
    clearSavedGame();
    expect(getSavedGame()).toBeNull();
  });
});
