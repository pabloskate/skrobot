import { describe, expect, it } from 'vitest';
import { GROUND } from './trick';
import { resolveSkateStyle } from './style';
import { isFiniteFrame, SWEEP_TIMEOUT } from '../testing';
import { stageFrame } from '../stage/stage';
import type { Stance } from '../types';
import { deckTopY } from '../board/board';
import { grindFrame, grindTimelineFor } from './grind';
import { GRIND_BASES, exitEndsFor, grindSpecFor, joinGrindExit, splitGrindBase, type PopEnd } from './grindDefinitions';
import { canExitGrind, thenSpin } from './grindTricks';
import { boardRigAt, solveGrindRig } from './grindRig';
import { dot3, rotX, rotY, sub3, type V3 } from '../math';
import { SHIN, SHOE_HALF_HEIGHT, THIGH, type Rig } from './skeleton';
import {
  EXIT_GRINDS,
  EXIT_TRICKS,
  NEUTRAL,
  RIDERS,
  SIDES,
  STANCES,
  covering,
  dist,
  everyExit,
  exitCombos,
  exitPlan,
  grindPlan,
  jointJolts,
  joints,
  nameOf,
  planFor,
  stageOf,
  sweepBounds,
  sweepStage,
  toBoard,
} from './grindTesting';

/**
 * A flatground trick popped out of a grind off the end it names ("Backside
 * 5-0 Grind Kickflip Out"): everything up to the pop off is the plain
 * grind's (grind.test.ts), and the trick turns the deck, and a 180 the
 * rider, on the way down. The board's sweep past the bar popping out is in
 * grindTrickOutSweep.test.ts, to run alongside.
 */

describe('Trick out of grind', () => {
  const EXITS = EXIT_TRICKS;
  /** Exits that turn the rider round to ride away the other way. */
  const TURNS = /180|side (Flip|Heelflip)|Bigspin/;
  // Every grind by what rides the bar: centered on it, or one end of the board.
  const BOTH_ENDS = ['50-50 Grind', 'Boardslide', 'Lipslide'];
  const TAIL_END = ['5-0 Grind', 'Smith Grind', 'Feeble Grind', 'Salad Grind', 'Suski Grind', 'Tailslide', 'Bluntslide'];
  const NOSE_END = ['Nosegrind', 'Crooked Grind', 'Overcrooked Grind', 'Willy Grind', 'Noseslide', 'Noseblunt Slide'];
  const GRINDS = EXIT_GRINDS;

  /** An angle as a whole number of half turns, or NaN if it isn't one. */
  const halfTurns = (deg: number) => {
    const k = Math.round(deg / 180);
    return Math.abs(deg - 180 * k) < 1e-6 ? k : NaN;
  };

  it('pops out off either end of both trucks or the middle, and only off the end of one truck, a kick, or a blunt', () => {
    expect([...BOTH_ENDS, ...TAIL_END, ...NOSE_END].sort()).toEqual([...GRIND_BASES].sort());
    for (const base of BOTH_ENDS) expect(exitEndsFor(base), base).toEqual(['tail', 'nose']);
    for (const base of TAIL_END) expect(exitEndsFor(base), base).toEqual(['tail']);
    for (const base of NOSE_END) expect(exitEndsFor(base), base).toEqual(['nose']);
    expect(exitEndsFor('Backside 5-0 Grind')).toEqual(['tail']);
    expect(exitEndsFor('FS Crooked Grind')).toEqual(['nose']);
    expect(exitEndsFor('Kickflip')).toEqual([]);

    // A 5-0 can kickflip out but not nollie flip out; a crooked grind the other way round.
    expect(grindSpecFor({ base: 'Backside 5-0 Grind Kickflip Out', stance: 'regular' })?.exit?.base).toBe('Kickflip');
    expect(grindSpecFor({ base: 'Backside 5-0 Grind Nollie Kickflip Out', stance: 'regular' })).toBeNull();
    expect(grindSpecFor({ base: 'Backside Crooked Grind Nollie Kickflip Out', stance: 'regular' })?.exitNose).toBe(true);
    expect(grindSpecFor({ base: 'Backside Crooked Grind Kickflip Out', stance: 'regular' })).toBeNull();
    for (const base of GRIND_BASES) {
      for (const side of SIDES) {
        for (const end of ['tail', 'nose'] as PopEnd[]) {
          const name = joinGrindExit(nameOf(base, side), 'Kickflip', end);
          const spec = grindSpecFor({ base: name, stance: 'regular' });
          expect(spec != null, name).toBe(exitEndsFor(base).includes(end));
          if (spec) expect(spec.exitNose, name).toBe(end === 'nose');
        }
      }
    }
  });

  it('names the trick out after the grind and the end it pops off, and only accepts tricks that keep the board level', () => {
    expect(joinGrindExit('Backside 5-0 Grind', 'Kickflip', 'tail')).toBe('Backside 5-0 Grind Kickflip Out');
    expect(joinGrindExit('Crooked Grind', 'Kickflip', 'nose')).toBe('Crooked Grind Nollie Kickflip Out');
    expect(splitGrindBase('Kickflip into Frontside 50-50 Grind Nollie Heelflip Out')).toEqual({
      entry: 'Kickflip', grind: 'Frontside 50-50 Grind', exit: { base: 'Heelflip', end: 'nose' },
    });
    expect(splitGrindBase('50-50 Grind Frontside Shuvit Out').exit).toEqual({ base: 'Frontside Shuvit', end: 'tail' });
    expect(splitGrindBase('Noseblunt Slide Nollie 360 Flip Out')).toEqual({
      entry: null, grind: 'Noseblunt Slide', exit: { base: '360 Flip', end: 'nose' },
    });

    for (const exit of EXITS) expect(canExitGrind(exit), exit).toBe(true);
    for (const exit of ['Ollie', 'Impossible', 'Dolphin Flip', 'Not A Trick']) {
      expect(canExitGrind(exit), exit).toBe(false);
      expect(grindSpecFor({ base: joinGrindExit('Frontside 50-50 Grind', exit, 'tail'), stance: 'regular' }), exit).toBeNull();
    }
    expect(grindSpecFor({ base: 'Frontside 50-50 Grind Out', stance: 'regular' })).toBeNull();
    expect(grindSpecFor({ base: 'Kickflip Out', stance: 'regular' })).toBeNull();

    // No trick out pops off the end the grind rides, or the tail, as before.
    expect(grindSpecFor({ base: 'Frontside 50-50 Grind', stance: 'regular' })?.exit).toBeNull();
    expect(grindSpecFor({ base: 'Frontside 50-50 Grind', stance: 'regular' })?.exitNose).toBe(false);
    expect(grindSpecFor({ base: 'Frontside Nosegrind', stance: 'regular' })?.exitNose).toBe(true);
  });

  it('turns the rider steadily through to touchdown, whatever the robot\'s rotation speed', () => {
    // A fast spinner catches early, but a body spin runs to the end of the
    // flight: it must not arrive at touchdown with the last of the turn left
    // to snap round in one frame.
    const FRAME = 1 / 60;
    for (const rotationSpeed of [0.8, 1, 1.25, 1.5]) {
      const style = resolveSkateStyle({ popHeight: 1, rotationSpeed, flickStrength: 1 });
      for (const exit of ['Backside 180', 'Frontside 180', 'Bigspin', 'FS Bigspin', 'Frontside Flip']) {
        for (const base of GRINDS) {
          for (const end of exitEndsFor(base)) {
            const { plan } = exitPlan(exit, end, base, 'backside', 'regular', 'regular', null, style);
            const label = `${base} ${end} ${exit} rs ${rotationSpeed}`;
            const turn = Math.abs(plan.endHeading - plan.heading);
            let prev = grindFrame(plan.off, plan).heading;
            let worst = 0;
            for (let t = plan.off + FRAME; t <= plan.land + 0.2; t += FRAME) {
              const heading = grindFrame(t, plan).heading;
              worst = Math.max(worst, Math.abs(heading - prev));
              prev = heading;
            }
            // The turn spread evenly over the hop, with room for a little speed-up.
            expect(worst, label).toBeLessThan((turn / plan.offT) * FRAME * 2 + 1e-6);
            expect(grindFrame(plan.land, plan).heading, label).toBeCloseTo(plan.endHeading, 6);
          }
        }
      }
    }
  });

  it('starts turning into a spin out on the bar, and is turning at its speed by the pop off', () => {
    const FRAME = 1 / 240;
    for (const exit of ['Backside 180', 'Frontside 180', 'Bigspin', 'Frontside Flip']) {
      for (const base of GRINDS) {
        for (const end of exitEndsFor(base)) {
          const { plan } = exitPlan(exit, end, base, 'backside', 'regular', 'regular', null);
          const label = `${base} ${end} ${exit}`;
          const way = Math.sign(plan.endHeading - plan.heading);
          const { lead } = plan.spinOut!;
          // Square to the board until the lead-in, then a little way round before the board leaves.
          expect(grindFrame(plan.off - lead - FRAME, plan).heading, label).toBeCloseTo(plan.heading, 9);
          const before = way * (grindFrame(plan.off - FRAME, plan).heading - plan.heading);
          expect(before, label).toBeGreaterThan(15);
          expect(before, label).toBeLessThan(60);
          expect(grindFrame(plan.off - FRAME, plan).pose.yaw, label).toBeCloseTo(grindFrame(plan.off - lead, plan).pose.yaw, 0);
          // No jolt at the pop: the same speed either side of it.
          const rate = (t: number) => (grindFrame(t + FRAME, plan).heading - grindFrame(t, plan).heading) / FRAME;
          expect(rate(plan.off - 2 * FRAME) / rate(plan.off + FRAME), label).toBeCloseTo(1, 1);
        }
      }
    }
  });

  it('composes a trick out after the deck the trick in left turned', () => {
    const v: V3[] = [{ x: 30, y: 4, z: 7 }, { x: -12, y: -6, z: 3 }];
    const pose = { yaw: 20, pitch: -8, roll: 5 };
    for (const first of [{ flip: 0, yaw: 0 }, { flip: 0, yaw: 180 }, { flip: 0, yaw: -180 }]) {
      for (const then of [{ flip: 137, yaw: 0 }, { flip: -60, yaw: 95 }, { flip: 0, yaw: -180 }]) {
        const c = { x: 0, y: 0, z: 0 };
        const both = boardRigAt(c, pose, thenSpin(first, then));
        const stepwise = boardRigAt(c, pose, then);
        for (const p of v) {
          const firstOnly = rotY(rotX(p, first.flip), first.yaw);
          expect(dist(both.dir(p), stepwise.dir(firstOnly)), `${JSON.stringify(first)} then ${JSON.stringify(then)}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('leaves everything up to the pop off exactly as the plain grind has it, and levers off the named end', () => {
    const pose = (rig: Rig) => JSON.parse(JSON.stringify(rig));
    for (const { exit, end, base, side, rider, stance, label } of exitCombos(everyExit(STANCES, ['Kickflip', 'Backside 180', 'Bigspin']))) {
      const plain = planFor(base, side, stance, rider, null);
      const { plan, spec, mechanics } = exitPlan(exit, end, base, side, stance, rider, null);
      expect(plan.lock, label).toEqual(plain.plan.lock);
      expect(plan.lockCenter, label).toEqual(plain.plan.lockCenter);
      expect(plan.laneZ, label).toBe(plain.plan.laneZ);
      expect(plan.lockAt, label).toBe(plain.plan.lockAt);
      expect(plan.off, label).toBe(plain.plan.off);
      // The exit crouch moves the feet to the popping end; before it, nothing differs.
      for (const t of [0, plan.pop + 0.1, plan.lockAt, plan.off - 0.45]) {
        expect(pose(solveGrindRig(t, plan, mechanics, NEUTRAL).rig), `${label} t=${t}`).toEqual(pose(solveGrindRig(t, plain.plan, plain.mechanics, NEUTRAL).rig));
      }
      // The board levers off that end: its truck, or the edge of the bar on that side.
      expect(Math.sign(spec.pivot.x), label).toBe(end === 'nose' ? 1 : -1);
      expect(Math.sign(plan.popOut - plan.lock.pitch), label).toBe(end === 'nose' ? 1 : -1);
    }
  });

  it('turns the deck through the hop off, and has it settled flat for the ride away', () => {
    for (const { exit, end, base, side, rider, stance, label } of exitCombos(everyExit(['regular', 'switch']))) {
      const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null);
      const flips = /flip/i.test(exit);
      const shuvs = /Shuvit|360 Flip|Bigspin/.test(exit);
      let flipReach = 0;
      let yawReach = 0;
      for (let t = plan.off; t <= plan.land; t += 0.01) {
        const { frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        flipReach = Math.max(flipReach, Math.abs(frame.spin.flip));
        yawReach = Math.max(yawReach, Math.abs(frame.spin.yaw));
      }
      if (flips) expect(flipReach, label).toBeGreaterThan(300);
      if (shuvs) expect(yawReach, label).toBeGreaterThan(170);
      expect(Math.abs(plan.endHeading), label).toBe(TURNS.test(exit) ? 180 : 0);
      for (const t of [plan.land + 0.01, plan.end]) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        expect(rig.board.center.y, `${label} t=${t}`).toBeCloseTo(GROUND, 6);
        expect(rig.board.pitchDeg, `${label} t=${t}`).toBe(0);
        expect(halfTurns(rig.board.flipDeg) % 2, `${label} t=${t} flip=${rig.board.flipDeg}`).toBe(0);
        expect(Number.isNaN(halfTurns(rig.board.yawDeg)), `${label} t=${t} yaw=${rig.board.yawDeg}`).toBe(false);
        expect(frame.heading, label).toBe(plan.endHeading);
      }
      const start = solveGrindRig(0, plan, mechanics, NEUTRAL);
      const done = solveGrindRig(plan.end, plan, mechanics, NEUTRAL).rig;
      expect(done.bodyYawDeg - (start.rig.bodyYawDeg - start.frame.approach), label).toBeCloseTo(plan.endHeading, 6);
    }
  }, SWEEP_TIMEOUT);

  it('takes the feet off the deck only while it turns, and flicks with the foot off the other end', () => {
    for (const { exit, end, base, side, rider, stance, label } of exitCombos(everyExit(STANCES, ['Kickflip', 'Heelflip', 'Pop Shuvit', 'Backside 180', 'Backside Flip', 'Frontside Heelflip', 'Bigspin']))) {
      const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null);
      let lifted = 0;
      let flicked = 0;
      for (let t = 0; t <= plan.end; t += 0.02) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        lifted = Math.max(lifted, frame.offDeck);
        if (frame.offDeck > 0) expect(frame.phase, label).toBe('off');
        if (frame.flickOut > 0.9) {
          flicked = Math.max(flicked, frame.flickOut);
          // A nollie flip flicks with the back foot, a flip off the tail with the front.
          const flicking = rig.legs.find((leg) => leg.flicking)!;
          expect(flicking.side, label).toBe(end === 'nose' ? mechanics.tailFoot : mechanics.noseFoot);
          // Measured across the board's heading: out of a slide it is still turning back from across the bar.
          const across = dot3(sub3(flicking.shoe.origin, rig.board.center), rotY({ x: 0, y: 0, z: 1 }, frame.pose.yaw));
          expect(Math.sign(across) * rig.toeDir, `${label} t=${t.toFixed(2)}`).toBe(/Heelflip/.test(exit) ? 1 : -1);
        }
        if (frame.offDeck > 0.001 || (t >= plan.pop && t < plan.lockAt)) continue;
        for (const leg of rig.legs) {
          const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
          expect(Math.abs(sole.y - deckTopY(sole.x)), `${label} t=${t.toFixed(2)}`).toBeLessThan(0.5);
        }
      }
      expect(lifted > 0.9, label).toBe(exit !== 'Backside 180');
      expect(flicked > 0.9, label).toBe(/flip/i.test(exit));
    }
  }, SWEEP_TIMEOUT);

  it('never stretches a leg, moves every joint continuously, and keeps the robot inside the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    const cases = [0.45, 1.15].flatMap((popHeight) => everyExit(['regular', 'fakie']).map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, exit, end, base, side, rider, stance, label } of exitCombos(cases, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, style);
      const jolt = jointJolts(sweep);
      // From the lock on: the hop on is the plain grind's, swept above.
      for (let t = plan.lockAt; t <= plan.end; t += dt) {
        const solved = solveGrindRig(t, plan, mechanics, style);
        const { rig } = solved;
        const where = () => `${label} pop ${popHeight} t=${t.toFixed(3)}`;
        const nearSnap = t > plan.off - 0.09 && t < plan.off + 2 * dt;
        jolt(joints(rig), nearSnap, (i) => `${where()} joint ${i}`);
        if (Math.round(t / dt) % 6 !== 0) continue;
        for (const leg of rig.legs) {
          sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
          sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
        }
        // Landed, so never falling: the crane doesn't sink.
        sweepStage(sweep, plan, t, solved, where);
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('gives the trick room: a higher, longer pop off than the plain grind, with a mid-trick moment before landing', () => {
    for (const { exit, end, base, side, rider, stance, label } of exitCombos(everyExit(['regular']))) {
      const plain = planFor(base, side, stance, rider, null).plan;
      const { plan } = exitPlan(exit, end, base, side, stance, rider, null);
      expect(plan.offPop, label).toBeGreaterThan(plain.offPop);
      expect(plan.offT, label).toBeGreaterThan(plain.offT);
      const name = joinGrindExit(nameOf(base, side), exit, end);
      const tl = grindTimelineFor({ base: name, stance }, rider, NEUTRAL, true, 'slam')!;
      expect(tl.trickOut, label).toBeGreaterThan(plan.off);
      expect(tl.trickOut, label).toBeLessThan(plan.land);
      // A slip off the bar never gets to the trick out.
      expect(grindTimelineFor({ base: name, stance }, rider, NEUTRAL, false, 'bail')?.trickOut, label).toBeNull();
    }
    expect(grindTimelineFor({ base: 'Frontside 50-50 Grind', stance: 'regular' }, 'regular', NEUTRAL, true, 'slam')?.trickOut).toBeNull();
  });

  it('follows a trick into the grind: spun round, or with the deck already turned', () => {
    // A shuv in leaves the deck turned half way, which the flip out rolls the other way about.
    // A 180 in leaves the rider fakie, riding their own tail truck in a 5-0.
    const combos = [
      { entry: 'Pop Shuvit', base: 'Boardslide', exit: 'Kickflip', end: 'nose' as PopEnd },
      { entry: 'Kickflip', base: '50-50 Grind', exit: 'Frontside Shuvit', end: 'tail' as PopEnd },
      { entry: 'Backside 180', base: '5-0 Grind', exit: 'Kickflip', end: 'tail' as PopEnd },
      { entry: 'Bigspin', base: 'Crooked Grind', exit: 'Heelflip', end: 'nose' as PopEnd },
      // A bigspin out turns the rider round on top of whatever the trick in left.
      { entry: 'Kickflip', base: 'Nosegrind', exit: 'Bigspin', end: 'nose' as PopEnd },
      { entry: 'Pop Shuvit', base: 'Lipslide', exit: 'FS Bigspin', end: 'tail' as PopEnd },
    ];
    const sweep = sweepBounds();
    const dt = 1 / 120;
    const cases = combos.flatMap((combo) => SIDES.flatMap((side) => RIDERS.flatMap((rider) =>
      (['regular', 'nollie'] as Stance[]).map((stance) => ({ ...combo, side, rider, stance })))));
    for (const { entry, base, exit, end, side, rider, stance } of covering(cases, (c) => `${c.entry} ${c.base} ${c.exit}`, (c) => c.side, (c) => c.rider, (c) => c.stance)) {
      const label = `${entry} into ${side} ${base} ${end} ${exit} Out ${stance} ${rider}`;
      const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, NEUTRAL, entry);
      const into = planFor(base, side, stance, rider, null);
      expect(plan.entry?.trick.base, label).toBe(entry);
      expect(plan.exit?.trick.base, label).toBe(exit);
      const jolt = jointJolts(sweep);
      for (let t = 0; t <= plan.end; t += dt) {
        const now = joints(solveGrindRig(t, plan, mechanics, NEUTRAL).rig);
        const nearSnap = [plan.pop, plan.off].some((s) => t > s - 0.09 && t < s + 2 * dt);
        jolt(now, nearSnap, (i) => `${label} joint ${i} t=${t.toFixed(3)}`);
      }
      const { rig, frame } = solveGrindRig(plan.end, plan, mechanics, NEUTRAL);
      expect(rig.board.center.y, label).toBeCloseTo(GROUND, 6);
      expect(halfTurns(frame.spin.flip) % 2, `${label} flip=${frame.spin.flip}`).toBe(0);
      expect(Number.isNaN(halfTurns(frame.spin.yaw)), `${label} yaw=${frame.spin.yaw}`).toBe(false);
      expect(Math.abs(plan.endHeading - plan.heading), label).toBe(TURNS.test(exit) ? 180 : 0);
      // The plain grind with the same entry rides away the same way round.
      expect(Math.abs(plan.heading), label).toBe(/180|Bigspin/.test(entry) ? 180 : 0);
      expect(into.plan.exit, label).toBeNull();
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('stages finite geometry and plans the trick out off the right end', () => {
    for (const [base, end, stamp] of [
      ['Backside 5-0 Grind Kickflip Out', 'tail', 'Kickflip'],
      ['Frontside Crooked Grind Nollie Heelflip Out', 'nose', 'Nollie Heelflip'],
      ['Kickflip into Backside Boardslide Nollie 360 Flip Out', 'nose', 'Nollie 360 Flip'],
    ] as const) {
      const { spec, plan } = grindPlan(base, 'regular', 'goofy', null);
      expect(spec.exitNose, base).toBe(end === 'nose');
      const stage = stageOf(base, true, 'slam');
      expect(`${stage.grind?.spec.exitNose ? 'Nollie ' : ''}${stage.grind?.exit?.trick.base}`).toBe(stamp);
      for (const t of [plan.off - 0.1, plan.off + 0.1, (plan.off + plan.land) / 2, plan.land, plan.end]) {
        expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base} t=${t}`).toBe(true);
      }
    }
  });
});
