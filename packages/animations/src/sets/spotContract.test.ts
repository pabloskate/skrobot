import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SKATE_STYLE } from '../motion/style';
import { TRICK_BASES, catchFraction } from '../motion/trick';
import { routeHeight } from '../stage/drop';
import { planStage, stageFrame } from '../stage/stage';
import { RIDERS, STANCES, SWEEP_TIMEOUT, isFiniteFrame, sweep, sweepHz, trickNamed, wheelClearance } from '../testing';
import { SET_PIECES } from '../three/setPieces';
import type { RiderStance, Stance } from '../types';
import { STAGE_SETS, setTerrain, setTimeline, type Obstacle, type RailChoice, type StageSet } from './sets';
import { terrainSurface } from './terrain';

/**
 * What every spot has to hold, whatever it looks like. The suite goes
 * through the registry (sets/spots.ts), so a new spot is held to all of it
 * the moment it is listed; a spot's own tests are for what only it has (a
 * fence to clear, a slab to roll off, its measured dimensions).
 *
 * Other suites that already go through every spot: the filmers either side
 * of the line (tripods.test.ts), the takeoff in every stance
 * (elToro/takeoff.test.ts), and the falls (motion/fall/kickOut.test.ts,
 * slipBack.test.ts).
 */

/** A wheel this far into the ground (world units; about a sixth of an inch) has gone through it. */
const SUNK = 0.5;
/** Rolling away, a wheel this far over the ground is floating. */
const FLOATING = 0.5;
/** Everything a set draws, at most: what a phone holds comfortably. */
const VERTEX_BUDGET = 200_000;

const RIDE_AWAY_GAPS = ['Ollie', 'Kickflip', '360 Flip', 'Backside 180'];
const RIDE_AWAY_GRINDS = ['Backside 50-50 Grind', 'Frontside Boardslide', '360 Flip into Backside 50-50 Grind', 'Backside 5-0 Grind Kickflip Out'];

const attempt = (set: StageSet, base: string, options: { stance?: Stance; rider?: RiderStance; obstacle?: Obstacle; rail?: RailChoice } = {}) => planStage(
  trickNamed(base, options.stance),
  { landed: true, riderStance: options.rider ?? 'regular', style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, set, obstacle: options.obstacle, rail: options.rail },
);

describe.each(STAGE_SETS.map((spot) => [spot.id, spot] as const))('spot contract: %s', (set, spot) => {
  it('builds its scenery finite and inside the mobile budget, with ground to map wherever there is a drop', () => {
    const piece = SET_PIECES[set]();
    try {
      let vertices = 0;
      for (const root of [piece.group, piece.overlay]) {
        root.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          const position = object.geometry.getAttribute('position');
          if (!position) return;
          vertices += position.count;
          expect(Array.from(position.array as ArrayLike<number>).every(Number.isFinite), object.name || 'mesh').toBe(true);
        });
      }
      expect(vertices).toBeGreaterThan(0);
      expect(vertices).toBeLessThan(VERTEX_BUDGET);
      // A placed tripod stands on the spot's drawn ground (three/spotPlan.ts).
      if (spot.terrain) expect(piece.terrain?.().length ?? 0).toBeGreaterThan(0);
    } finally {
      piece.dispose();
    }
  });

  if (spot.terrain) {
    const obstacles: readonly Obstacle[] = spot.obstacles?.map((o) => o.id) ?? ['stairs'];

    it.each(obstacles)('flies every trick over its %s in every stance: finite, clear of the ground, down where the plan lands it', (obstacle) => {
      const terrain = setTerrain(set, obstacle)!;
      const ground = (along: number, across: number) => terrainSurface(terrain, along, across);
      const problems: string[] = [];
      sweep(TRICK_BASES, 6).forEach((base, i) => {
        // Every trick in two of the four stances and one rider, turn about: each stance and rider meets
        // every kind of trick across the sweep, at a quarter of its cost. (The takeoff, where a stance
        // changes the most, is swept in full by elToro/takeoff.test.ts.)
        STANCES.filter((_, j) => j % 2 === i % 2).forEach((stance, j) => {
          const rider = RIDERS[(Math.floor(i / 2) + j) % 2];
          const name = `${stance} ${base} (${rider})`;
          const stage = attempt(set, base, { stance, rider, obstacle });
          const stairs = stage.stairs!;
          // The moments the explorer shows are the stage's own.
          const timeline = setTimeline(set, DEFAULT_SKATE_STYLE, true, obstacle, stance, base);
          if (timeline.pop !== stairs.pop || timeline.land !== stairs.land || timeline.end !== stage.end) problems.push(`${name}: the timeline and the stage disagree`);
          for (const t of [0, stairs.pop / 2, stairs.pop]) {
            if (!isFiniteFrame(stageFrame(stage, t, 1))) problems.push(`${name}: not finite at ${t.toFixed(2)}`);
          }
          for (let t = stairs.pop + 0.05; t < stairs.land; t += 1 / sweepHz(20)) {
            const frame = stageFrame(stage, t, 1);
            if (!isFiniteFrame(frame)) problems.push(`${name}: not finite at ${t.toFixed(2)}`);
            const clear = wheelClearance(frame, ground);
            if (clear < -SUNK) problems.push(`${name}: wheels ${(-clear).toFixed(1)} into the ground at ${t.toFixed(2)}`);
          }
          const touchdown = stageFrame(stage, stairs.land, 1);
          if (Math.abs(touchdown.scroll - (terrain.run + terrain.landPast)) > 1e-6) problems.push(`${name}: lands at ${touchdown.scroll.toFixed(1)}, not the plan's ${(terrain.run + terrain.landPast).toFixed(1)}`);
        });
      });
      expect(problems.slice(0, 10)).toEqual([]);
    }, SWEEP_TIMEOUT);

    it('has a kickflip round sooner in the flight the longer it hangs, and never later than on the flat', () => {
      const level = catchFraction(DEFAULT_SKATE_STYLE);
      for (const rider of RIDERS) {
        const stage = attempt(set, 'Kickflip', { rider });
        const { pop, flight, clockFlight } = stage.stairs!;
        const caughtAt = catchFraction(stage.style);
        // A flick is as hard off a drop as on the flat: the catch is no later in a long flight, and well before touchdown.
        expect(caughtAt).toBeLessThanOrEqual(level);
        if (flight > 1.2 * clockFlight) expect(caughtAt).toBeLessThan(level - 0.03);
        expect(caughtAt).toBeGreaterThan(0.6);
        const flipped = (q: number) => Math.abs(stageFrame(stage, pop + q * flight, 1).rig.board.flipDeg);
        expect(flipped(caughtAt + 1e-6)).toBeCloseTo(360, 3);
        expect(flipped(caughtAt - 0.03)).toBeLessThan(355);
      }
    });

    it('rides a gap trick away finite, with its wheels on the landing', () => {
      const terrain = spot.terrain!;
      for (const base of RIDE_AWAY_GAPS) for (const rider of RIDERS) {
        const stage = attempt(set, base, { rider });
        const stairs = stage.stairs!;
        for (let t = stairs.land; t <= stage.end; t += 0.1) expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base} ${rider} at ${t.toFixed(2)}`).toBe(true);
        expect(isFiniteFrame(stageFrame(stage, stage.end, 1)), `${base} ${rider} at the end`).toBe(true);
        // With no room to ride it out (Emage's river), up to the hop off the board.
        for (let t = stairs.land + 0.05; t <= (stage.stepOff?.at ?? stage.end); t += 0.1) {
          const frame = stageFrame(stage, t, 1);
          // Rolling off a raised edge (Miami's slab), the deck is in the air for a moment, as planned.
          if (routeHeight(stairs, frame.scroll) > terrainSurface(terrain, frame.scroll, frame.stairs!.across) + 0.5) continue;
          const gap = wheelClearance(frame, (u, z) => terrainSurface(terrain, u, z), stairs.dir);
          expect(gap, `${base} ${rider} at ${t.toFixed(2)}`).toBeLessThan(FLOATING);
        }
      }
    });
  }

  const rail = spot.rails?.handrail;
  if (rail && spot.grinds) {
    it('rides a grind down its handrail away with its wheels on the landing, past the rail\'s end', () => {
      for (const base of RIDE_AWAY_GRINDS) for (const rider of RIDERS) {
        const stage = attempt(set, base, { rider });
        const grind = stage.grind!;
        for (let t = grind.land + 0.02; t <= (stage.stepOff?.at ?? stage.end); t += 0.1) {
          const gap = wheelClearance(stageFrame(stage, t, 1), (u) => rail.ground(u));
          expect(gap, `${base} ${rider} at ${t.toFixed(2)}`).toBeLessThan(FLOATING);
        }
      }
    });
  }

  if (spot.grinds) {
    it('stages a grind finite from the roll-in to the ride away, both riders', () => {
      const choices: readonly RailChoice[] = spot.rails && spot.rails.sideGrinds !== false ? ['center', 'side'] : ['center'];
      for (const base of RIDE_AWAY_GRINDS) for (const rider of RIDERS) for (const choice of choices) {
        const stage = attempt(set, base, { rider, rail: choice });
        expect(stage.grind, `${base} ${rider} ${choice}`).not.toBeNull();
        for (let t = 0; t <= stage.end; t += 1 / sweepHz(20)) {
          expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base} ${rider} ${choice} at ${t.toFixed(2)}`).toBe(true);
        }
      }
    });
  }
});
