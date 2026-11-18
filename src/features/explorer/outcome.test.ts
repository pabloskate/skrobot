import { describe, expect, it } from 'vitest';
import { RAIL_BAIL_OPTIONS, railBailTimelineFor, setHandrail } from '@skrobot/animations';
import { DEFAULT_STATE, outcomeOf, outcomeOptions, searchFromState, stageOutcome, stageTrick, stateFromSearch, timelineFor, withMode, withSet } from './explorer';
import { dreamSpot, withDreamLine } from './dream';

/**
 * How an attempt ends: landed, or missed the mode's way (a flatground or gap trick kicked out or slipped back, a grind
 * jumped off forward or aside), kept in the link, and only where the mode has it.
 */
describe('outcome', () => {
  it('lands by default, and leaves it out of the link', () => {
    expect(DEFAULT_STATE.fall).toBeNull();
    expect(searchFromState(DEFAULT_STATE)).not.toContain('fall=');
    expect(stageOutcome(null)).toEqual({ landed: true });
  });

  it('offers a slip back in both modes alongside their own bail options', () => {
    expect(outcomeOptions('flatground').map((o) => o.fall)).toEqual([null, 'kickout', 'slipback']);
    expect(outcomeOptions('grinds').map((o) => o.fall)).toEqual([null, 'rail-slip-off', 'jump-forward', 'rail-stick', 'jump-side', 'slipback']);
    // The grind's labels are the package's.
    expect(outcomeOptions('grinds').filter(o => stageOutcome(o.fall).railBail).map((o) => o.label)).toEqual(RAIL_BAIL_OPTIONS.map((o) => o.label));
  });

  it('shares Rail Stick on the Hollywood High boardslide and clears it on gaps and ledges', () => {
    const state = stateFromSearch('?grind=boardslide&set=hollywood-high&fall=rail-stick');
    expect(stageOutcome(state.fall).railBail).toBe('stick');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(timelineFor(state, undefined).phases.map(p => p.label)).toContain('Stick');
    expect(withMode(state, 'flatground').fall).toBeNull();
    expect(withSet(state, 'miami-triangle').fall).toBeNull();
  });

  it('shares the Hollywood High rail slip and clears it on a gap or ledge', () => {
    const state = stateFromSearch('?grind=crooked-grind&in=360-flip&set=hollywood-high&fall=rail-slip-off');
    expect(state.fall).toBe('rail-slip-off');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(timelineFor(state, undefined).phases.map(p => p.label)).toEqual(['Set up', 'Pop', 'Trick in', 'Lock', 'Slip off', 'Down']);
    expect(withMode(state, 'flatground').fall).toBeNull();
    expect(withSet(state, 'miami-triangle').fall).toBeNull();
    expect(outcomeOptions('grinds', 'miami-triangle').some(o => o.fall === state.fall)).toBe(false);
  });

  it('round-trips a flatground kick-out through the link as it did', () => {
    const state = stateFromSearch('?trick=kickflip&set=el-toro&fall=kickout');
    expect(state).toMatchObject({ mode: 'flatground', fall: 'kickout' });
    const search = searchFromState(state);
    expect(new URLSearchParams(search).get('fall')).toBe('kickout');
    expect(stateFromSearch(search)).toEqual(state);
    expect(stageOutcome('kickout')).toEqual({ landed: false, fallVariant: 'kickout', railBail: undefined });
  });

  it('round-trips a slip back through the link, and runs its clip on past the landing', () => {
    const state = stateFromSearch('?trick=kickflip&set=el-toro&fall=slipback');
    expect(state).toMatchObject({ mode: 'flatground', fall: 'slipback' });
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(stageOutcome('slipback')).toEqual({ landed: false, fallVariant: 'slipback', railBail: undefined });
    for (const set of ['el-toro', 'plaza'] as const) {
      const slipped = withSet(state, set);
      const landed = { ...slipped, fall: null };
      expect(timelineFor(slipped, undefined).duration).toBeGreaterThan(timelineFor(landed, undefined).duration + 0.5);
      expect(timelineFor(slipped, undefined).phases.map((p) => p.label)).toContain('Slip');
    }
  });

  it('shares the Hollywood High crooked grind with its flip-in, camera and slip on landing', () => {
    const state = stateFromSearch('?grind=crooked-grind&in=360-flip&cam=-15.8_11.2_1&zoom=0.9&set=hollywood-high&fall=slipback');
    expect(state.fall).toBe('slipback');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(timelineFor(state, undefined).phases.map(p => p.label)).toEqual(['Set up', 'Pop', 'Trick in', 'Lock', 'Pop off', 'Slip']);
  });

  it.each([['jump-forward', 'forward'], ['jump-side', 'side']] as const)('round-trips a grind jumped off (%s) through the link', (fall, bail) => {
    const state = stateFromSearch(`?grind=50-50-grind&set=el-toro&rail=side&rider=goofy&fall=${fall}`);
    expect(state).toMatchObject({ mode: 'grinds', set: 'el-toro', rail: 'side', rider: 'goofy', fall });
    const search = searchFromState(state);
    expect(new URLSearchParams(search).get('fall')).toBe(fall);
    expect(stateFromSearch(search)).toEqual(state);
    expect(stageOutcome(fall)).toEqual({ landed: false, fallVariant: 'kickout', railBail: bail });
  });

  it("drops a miss from a link whose mode doesn't have it", () => {
    expect(stateFromSearch('?trick=kickflip&fall=jump-side').fall).toBeNull();
    expect(stateFromSearch('?grind=50-50-grind&set=el-toro&fall=kickout').fall).toBeNull();
    expect(stateFromSearch('?grind=50-50-grind&set=el-toro&fall=flail').fall).toBeNull();
    // Naming neither opens on the default grind, which doesn't kick out.
    expect(stateFromSearch('?fall=kickout').fall).toBeNull();
  });

  it('goes back to landed switching to a mode without the miss, and keeps it where it has it', () => {
    const kicked = stateFromSearch('?trick=kickflip&set=el-toro&fall=kickout');
    expect(withMode(kicked, 'grinds').fall).toBeNull();
    expect(withMode(kicked, 'flatground').fall).toBe('kickout');
    const jumped = stateFromSearch('?grind=50-50-grind&set=el-toro&fall=jump-side');
    expect(withMode(jumped, 'flatground').fall).toBeNull();
    expect(withMode(jumped, 'grinds').fall).toBe('jump-side');
    // Moving to a spot with no grinds is moving to flatground.
    expect(withSet(jumped, 'wallenberg').fall).toBeNull();
    // Dream Tricks: from the rail to the gap and back.
    const lines = dreamSpot('el-toro').lines;
    const gap = lines.find((line) => line.mode === 'flatground')!;
    const rail = lines.find((line) => line.mode === 'grinds')!;
    expect(withDreamLine(jumped, gap).fall).toBeNull();
    expect(withDreamLine(jumped, rail).fall).toBe('jump-side');
    // And a state that somehow holds the other mode's miss plays it landed.
    expect(outcomeOf({ ...jumped, mode: 'flatground' })).toBeNull();
  });

  it("times a grind jumped off by the bail's own clock: the lock, the jump, the roll", () => {
    for (const fall of ['jump-forward', 'jump-side'] as const) {
      const state = stateFromSearch(`?grind=50-50-grind&set=el-toro&fall=${fall}`);
      const timeline = timelineFor(state, undefined);
      const bail = railBailTimelineFor(stageTrick(state), state.rider, undefined, stageOutcome(fall).railBail!, setHandrail(state.set, stageTrick(state), state.rider, state.rail))!;
      expect(timeline.duration).toBe(bail.end);
      expect(timeline.phases.map((p) => p.label)).toEqual(['Set up', 'Pop', 'Lock', 'Jump off', 'Roll']);
      expect(timeline.phases.find((p) => p.label === 'Jump off')!.time).toBe(bail.bail);
      // Landed, the grind runs its own way, popping off and landing.
      const landed = timelineFor({ ...state, fall: null }, undefined);
      expect(landed.phases.map((p) => p.label)).toContain('Pop off');
      expect(landed.duration).not.toBe(timeline.duration);
    }
  });
});
