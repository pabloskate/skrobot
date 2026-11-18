import { describe, expect, it } from 'vitest';
import { DEFAULT_SKATE_STYLE } from './style';
import { FLIP_T, ROLL_IN, TRICK_BASES, boardSweep, computeFrame, specFor } from './trick';
import type { Stance, Trick } from '../types';

/**
 * A spot with something beside its line near the takeoff (Hollywood's side
 * rail and fence, Leap of Faith's stair rail) pops each trick by how its
 * board sweeps past it (DropTerrain.trickPop). That class is read off the
 * trick's row; this holds it to what the board actually does off the pop.
 */
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
/** The share of the flight in which the board crosses what's beside the takeoff. */
const EARLY = 0.3;
/** A board still within this of the line (degrees) hasn't swung its ends out. */
const LINED_UP = 10;

/** The most the board has turned off its line over the early flight, degrees. */
function earlyTurn(base: string, stance: Stance): number {
  const spec = specFor({ id: base, name: base, base, stance } as Trick);
  let most = 0;
  for (let p = 0; p <= EARLY; p += 0.01) {
    const frame = computeFrame(ROLL_IN + p * FLIP_T, spec, true, 'slam', 0.65, DEFAULT_SKATE_STYLE);
    most = Math.max(most, Math.abs(frame.spin3d.yawDeg));
  }
  return most;
}

describe('boardSweep', () => {
  it('calls a board along the line exactly when it stays lined up off the pop, every stance', () => {
    const wrong: string[] = [];
    for (const base of TRICK_BASES) {
      for (const stance of STANCES) {
        const turned = earlyTurn(base, stance) > LINED_UP;
        if ((boardSweep(base) === 'along') === turned) wrong.push(`${stance} ${base}: ${boardSweep(base)}, turned ${earlyTurn(base, stance).toFixed(0)}°`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('calls a board wrapped exactly when the trick wraps it round the scooping foot', () => {
    for (const base of TRICK_BASES) {
      const spec = specFor({ id: base, name: base, base, stance: 'regular' } as Trick);
      expect(boardSweep(base) === 'wrap', base).toBe(spec.wrap);
    }
  });

  it('has all three kinds among the tricks, and takes an unknown name to turn', () => {
    expect(new Set(TRICK_BASES.map(boardSweep))).toEqual(new Set(['along', 'across', 'wrap']));
    expect(boardSweep('Not A Trick')).toBe('across');
  });
});
