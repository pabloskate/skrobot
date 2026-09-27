import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROBOTS } from '@/features/robots';
import { TRICK_BY_ID } from '@/features/tricks';
import { VoiceGameController } from './controller';

const kickflip = TRICK_BY_ID.get('regular-kickflip')!;
const pool = [kickflip, TRICK_BY_ID.get('regular-heelflip')!, TRICK_BY_ID.get('regular-hardflip')!];
let tracking = true;

function playerSet() {
  const controller = new VoiceGameController(ROBOTS[0], pool);
  controller.state = { ...controller.state, phase: 'playerSet' };
  return controller;
}

beforeEach(() => {
  tracking = true;
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: () => tracking ? null : 'off' });
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voice tracked set reports', () => {
  it.each([undefined, 'asdfghjkl'])('rejects an unresolved missed set (%s) without changing state', (name) => {
    const controller = playerSet();
    const state = controller.state;
    const changed = vi.fn();
    controller.onChange = changed;
    expect(controller.reportSetAttempt(false, name)).toHaveProperty('error');
    expect(controller.state).toBe(state);
    expect(controller.trickAttempts).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
    expect(controller.undo().ok).toBe(false);
  });

  it('asks for clarification before accepting an ambiguous missed trick', () => {
    const controller = playerSet();
    const state = controller.state;
    expect(controller.reportSetAttempt(false, 'haelflip')).toHaveProperty('needsClarification');
    expect(controller.state).toBe(state);
    expect(controller.trickAttempts).toEqual([]);
  });

  it('records a clarified miss even when that trick was already used, and supports undo', () => {
    const controller = playerSet();
    controller.state = { ...controller.state, used: [kickflip.id] };
    const before = controller.state;
    controller.reportSetAttempt(false);
    const result = controller.reportSetAttempt(false, 'kickflip');
    expect(result).toHaveProperty('robotSet');
    expect(controller.trickAttempts).toEqual([{ trickId: kickflip.id, landed: false }]);
    expect(controller.undo().ok).toBe(true);
    expect(controller.state).toBe(before);
    expect(controller.trickAttempts).toEqual([]);
  });

  it('preserves the previous undo entry when a subsequent report needs clarification', () => {
    const controller = playerSet();
    const before = controller.state;
    controller.reportSetAttempt(false, 'kickflip');
    expect(controller.state.phase).toBe('playerSet');
    controller.reportSetAttempt(false);
    expect(controller.undo().ok).toBe(true);
    expect(controller.state).toBe(before);
    expect(controller.trickAttempts).toEqual([]);
  });

  it('allows anonymous misses after tracking is turned off mid-game', () => {
    const controller = playerSet();
    const changed = vi.fn();
    controller.onChange = changed;
    expect(controller.reportSetAttempt(false)).toHaveProperty('error');
    tracking = false;
    expect(controller.reportSetAttempt(false)).toHaveProperty('robotSet');
    expect(controller.trickAttempts).toEqual([]);
    tracking = true;
    expect(changed.mock.lastCall?.[1].trackingEligible).toBe(false);
    expect(controller.reportSetAttempt(true)).toHaveProperty('error');
  });
});
