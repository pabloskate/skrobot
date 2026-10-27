import { describe, expect, it } from 'vitest';
import { SWEEP_TIMEOUT } from '../testing';
import { GROUND } from './trick';
import { resolveSkateStyle } from './style';
import { EL_TORO_RAIL } from '../sets/elToro/stairs';
import { stageFrame } from '../stage/stage';
import { barSpan, carve, grindFrame, grindStreetDist, travel, type GrindPlan } from './grind';
import { BAR_HALF, BAR_TOP_Y, BAR_Z, GRIND_BASES, grindSpecFor, type GrindSide } from './grindDefinitions';
import { solveGrindRig } from './grindRig';
import { rotY } from '../math';
import { PERSON_SCALE } from './skeleton';
import { GRAVITY } from '../units';
import {
  COMBO_DIMS,
  FALLS,
  NEUTRAL,
  RIDERS,
  SIDES,
  covering,
  everyGrind,
  expectOneRise,
  grindPlan,
  grownHipY,
  nameOf,
  planFor,
  stageOf,
  stepOf,
  sweepBar,
  sweepBounds,
  type GrindCombo,
} from './grindTesting';

/**
 * Grinds are their own trick motion, so these pin the physics a skater would
 * check: the board's riding part sits exactly on the bar for the whole
 * lock, nothing ever passes through the bar, the bar stays put in the plaza,
 * the side names match the approach, and the body keeps the flatground
 * rig's promises (whole legs, soles on the grip, no pops, always in frame).
 * The body's sweeps are in grindBody.test.ts, and tricks popped into and out
 * of a grind in grindTrickIn, grindSpinIn and grindTrickOut.
 */

/** The plain combos a sweep covers: all of them in full, a few that bring every grind, side, rider and stance in the quick tier. */
const plainCombos = (combos: Iterable<GrindCombo> = everyGrind()) => covering(combos, ...COMBO_DIMS);

describe('Grind catalog', () => {
  it('picks out grinds by name, with or without their side, and nothing else', () => {
    expect(grindSpecFor({ base: 'Kickflip', stance: 'regular' })).toBeNull();
    expect(grindSpecFor({ base: 'Frontside 180', stance: 'regular' })).toBeNull();
    expect(grindSpecFor({ base: 'Backside 50-50 Grind', stance: 'regular' })?.side).toBe('backside');
    expect(grindSpecFor({ base: 'FS Feeble Grind', stance: 'regular' })?.side).toBe('frontside');
    for (const base of GRIND_BASES) {
      const bare = grindSpecFor({ base, stance: 'regular' });
      expect(bare?.base, base).toBe(base);
      for (const side of SIDES) expect(grindSpecFor({ base: nameOf(base, side), stance: 'regular' })?.side).toBe(side);
    }
  });

  it('comes in frontside with the bar on the toeside and backside on the heelside, boardslides too', () => {
    // Frontside is the chest facing the bar before the pop, whatever the slide.
    for (const { base, side, rider, stance, label } of plainCombos()) {
      const { plan } = planFor(base, side, stance, rider, null);
      const barToward = Math.sign(BAR_Z - plan.laneZ);
      const toeside = side === 'frontside';
      expect(barToward, label).toBe(toeside ? plan.toeDir : -plan.toeDir);
    }
  });

  it('turns into slides the way their names say: frontside lip-, tail- and noseblunt slides face down the bar, board-, nose- and bluntslides up it', () => {
    // Facing = the toeside of the locked board, against the direction of travel.
    const facesDownBar: Record<string, Record<GrindSide, boolean>> = {
      Boardslide: { frontside: false, backside: true },
      Lipslide: { frontside: true, backside: false },
      Noseslide: { frontside: false, backside: true },
      Tailslide: { frontside: true, backside: false },
      Bluntslide: { frontside: false, backside: true },
      'Noseblunt Slide': { frontside: true, backside: false },
    };
    for (const [base, sides] of Object.entries(facesDownBar)) {
      for (const side of SIDES) {
        for (const rider of RIDERS) {
          for (const stance of ['regular', 'switch'] as const) {
            const { plan, spec } = planFor(base, side, stance, rider, null);
            const facing = rotY({ x: 0, y: 0, z: plan.toeDir }, plan.lock.yaw).x * spec.dir;
            expect(facing > 0.99, `${side} ${base} ${stance} ${rider}`).toBe(sides[side]);
          }
        }
      }
    }
  });
});

describe('Grind physics', () => {
  it('turns a slide in off the pop and whips it round toward the bar: still turning as it touches down, for the bar to stop', () => {
    const FRAME = 1 / 120;
    const slides = plainCombos([...everyGrind()].filter(({ base, side, stance }) => Math.abs(grindSpecFor({ base: nameOf(base, side), stance })!.yaw) === 90));
    for (const rail of [null, EL_TORO_RAIL]) {
      for (const { base, side, rider, stance, label: name } of slides) {
        const { plan } = grindPlan(nameOf(base, side), stance, rider, null, NEUTRAL, rail);
        const label = `${name} ${rail ? 'rail' : 'bar'}`;
        const turn = plan.lock.yaw - plan.approachYaw;
        const share = (t: number) => (grindFrame(t, plan).pose.yaw - plan.approachYaw) / turn;
        const rate = (t: number) => (share(t + FRAME) - share(t)) / FRAME;
        // Under way off the pop (if slowly while a popped end swings over the bar).
        expect(share(plan.pop + 0.3 * plan.upT), label).toBeGreaterThan(0.03);
        const turnIn = plan.turnIn!;
        // A blunt's wheels hook just past the bar's side: short of its turn, they'd be in the bar.
        expect(turnIn.by < 1, label).toBe(/blunt/i.test(base));
        if (turnIn.by < 1) {
          // So it's turned all the way in, eased to a stop, before they drop past the bar's top.
          expect(Math.abs(1 - share(plan.pop + turnIn.by * plan.upT)), label).toBeLessThan(0.01);
          expect(Math.abs(rate(plan.pop + turnIn.by * plan.upT - FRAME) * turn), label).toBeLessThan(30);
          continue;
        }
        // Anything else comes on harder toward the bar, comes down still turning, short of the lock, and the bar stops it.
        expect(rate(plan.pop + 0.75 * plan.upT), label).toBeGreaterThan(rate(plan.pop + 0.35 * plan.upT));
        const short = 1 - share(plan.lockAt);
        expect(short, label).toBeGreaterThan(0.05);
        expect(short, label).toBeLessThan(0.16);
        expect(Math.abs(rate(plan.lockAt - FRAME) * turn), label).toBeGreaterThan(150);
        // Only the balance wobble left (WOBBLE_SLIDE at most).
        expect(Math.abs(grindFrame(plan.lockAt + turnIn.finishT, plan).pose.yaw - plan.lock.yaw), label).toBeLessThan(3);
      }
    }
  }, SWEEP_TIMEOUT);

  it('flies the rider on gravity alone onto the bar and off it: one push up into each hop, the knees push the board down, nothing pushes the hips back up', () => {
    const DT = 1 / 240;
    for (const { base, side, rider, stance, label } of plainCombos([...everyGrind()].filter((c) => c.rider === 'regular'))) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      // The robot, and a person grown over the same feet (riders/human/humanRig.ts).
      for (const grow of [1, PERSON_SCALE]) {
        const hipY = grownHipY(plan, mechanics, grow);
        expectOneRise(hipY, plan.pop, `${label} x${grow} pop`);
        expectOneRise(hipY, plan.off, `${label} x${grow} pop off`);
        for (const [from, to] of [[plan.pop, plan.lockAt], [plan.off, plan.land]]) {
          for (let t = from + 2 * DT; t < to - 2 * DT; t += 0.03) {
            // Falling no slower than gravity (a leg at full stretch can only let a foot off the board).
            const fall = (hipY(t + DT) - 2 * hipY(t) + hipY(t - DT)) / (DT * DT);
            expect(fall, `${label} x${grow} t=${t.toFixed(2)}`).toBeGreaterThan(0.98 * GRAVITY);
          }
        }
      }
    }
  }, SWEEP_TIMEOUT);

  it('locks the riding part of the board exactly onto the bar for the whole grind', () => {
    for (const { base, side, rider, stance, label } of plainCombos()) {
      const { plan, spec, mechanics } = planFor(base, side, stance, rider, null);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += stepOf(0.05)) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        const contact = rig.board.point(spec.contact.at);
        expect(contact.z, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_Z, 6);
        // The lowest of the bearing part over the bar rests on its top.
        let low = -Infinity;
        for (const line of spec.contact.lines) {
          for (let i = 0; i + 1 < line.length; i++) {
            for (let k = 0; k <= 400; k++) {
              const p = rig.board.point({
                x: line[i].x + ((line[i + 1].x - line[i].x) * k) / 400,
                y: line[i].y + ((line[i + 1].y - line[i].y) * k) / 400,
                z: line[i].z + ((line[i + 1].z - line[i].z) * k) / 400,
              });
              if (Math.abs(p.z - BAR_Z) <= BAR_HALF) low = Math.max(low, p.y);
            }
          }
        }
        expect(low, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_TOP_Y, 1);
        const span = barSpan(plan, frame.streetDist);
        expect(contact.x, label).toBeGreaterThan(span.x0 + 10);
        expect(contact.x, label).toBeLessThan(span.x1 - 10);
      }
    }
  });

  it('never puts the board through the bar or its posts', () => {
    const sweep = sweepBounds();
    const cases = [0.45, 1.15].flatMap((popHeight) => [...everyGrind()].map((combo) => ({ popHeight, ...combo })));
    for (const { popHeight, base, side, rider, stance, label } of covering(cases, ...COMBO_DIMS, (c) => c.popHeight)) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      const { plan, mechanics } = planFor(base, side, stance, rider, null, style);
      // Rolling in and away the board is on the ground beside or past the bar.
      for (let t = plan.pop; t <= plan.land; t += stepOf(1 / 60)) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
        sweepBar(sweep, plan, rig, frame, () => `${label} pop ${popHeight} t=${t.toFixed(3)}`);
      }
    }
    sweep.verify();
  }, SWEEP_TIMEOUT);

  it('keeps the bar standing still in the plaza: it scrolls exactly with the ground', () => {
    for (const fall of [null, ...FALLS]) {
      const { plan, spec } = planFor('50-50 Grind', 'frontside', 'regular', 'regular', fall);
      const fixed = new Set<string>();
      for (let t = -1; t <= plan.end; t += 0.05) {
        const dist = t < 0 ? t : grindStreetDist(t, plan);
        // A world-fixed point plus the ground's scroll never moves.
        fixed.add((barSpan(plan, dist).x0 + spec.dir * travel(dist)).toFixed(6));
      }
      expect(fixed.size, `${fall}`).toBe(1);
    }
    // Staged frames agree with the plan.
    const stage = stageOf('Frontside 50-50 Grind', true, 'slam', 'regular');
    const { plan } = planFor('50-50 Grind', 'frontside', 'regular', 'regular', null);
    expect(stageFrame(stage, 1.5, 1).span?.x0).toBeCloseTo(barSpan(plan, grindStreetDist(1.5, plan)).x0, 6);
  });

  it('starts and ends the board flat on the ground, rolling in along its angled line and away along the bar', () => {
    for (const { base, side, rider, stance, label } of plainCombos()) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      const at = (t: number) => solveGrindRig(t, plan, mechanics, NEUTRAL).rig.board;
      const straight = plan.land + plan.turnOut.finishT;
      for (const t of [0, plan.pop - 0.01, plan.land + 0.01, straight, plan.end]) {
        const board = at(t);
        expect(board.center.y, `${label} t=${t}`).toBeCloseTo(GROUND, 6);
        expect(Math.abs(board.pitchDeg) + Math.abs(board.flipDeg), `${label} t=${t}`).toBeLessThan(1e-6);
        // Carving onto the approach's angle (rider and all), on it by the pop; away straight along the
        // bar once the wheels have finished turning it out of the lock (TurnOut), a few degrees at most.
        if (t > plan.land && t < straight) {
          expect(Math.abs(board.yawDeg), `${label} t=${t}`).toBeLessThan(10);
          continue;
        }
        expect(board.yawDeg, `${label} t=${t}`).toBeCloseTo(t < plan.pop ? plan.approachYaw * carve(t, plan.pop, plan.carveTight).share : 0, 6);
      }
    }
  });

  it('crosses to the bar on the sideways speed the approach gave it: nothing pushes the board sideways in the air', () => {
    for (const { base, side, rider, stance, label } of plainCombos()) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      const z = (t: number) => solveGrindRig(t, plan, mechanics, NEUTRAL).frame.ref.z;
      const dt = 1 / 120;
      // Carved onto the line rolling in; then the same sideways speed into the pop and all through the hop to the lock.
      for (const t of [plan.pop - 0.03, plan.pop + 0.05, (plan.pop + plan.lockAt) / 2, plan.lockAt - 0.05]) {
        expect((z(t + dt) - z(t - dt)) / (2 * dt), `${label} t=${t.toFixed(2)}`).toBeCloseTo(plan.approachSpeed, 3);
      }
      // The carve builds that speed up smoothly from rolling straight.
      let last = 0;
      for (let t = dt; t < plan.pop - 0.03; t += 0.02) {
        const v = (z(t + dt) - z(t - dt)) / (2 * dt);
        expect(Math.abs(v - last), `${label} t=${t.toFixed(2)}`).toBeLessThan(Math.abs(plan.approachSpeed) * 0.3 + 1e-9);
        last = v;
      }
      // Toward the bar, and landing on the lock.
      expect(Math.sign(plan.approachSpeed || plan.far), label).toBe(plan.far);
      // Where it touches down: short of its turn, it pivots from there into the lock.
      expect(z(plan.lockAt), label).toBeCloseTo(plan.lockCenter.z + plan.touchdown.z, 6);
    }
  });
});

describe('Grind timeline', () => {
  it('holds the lock long enough to read, and ends on the ground', () => {
    for (const { base, side, rider, stance, label } of plainCombos()) {
      const { plan } = planFor(base, side, stance, rider, null);
      expect(plan.off - plan.lockAt, label).toBeGreaterThan(0.9);
      expect(plan.lockAt, label).toBeGreaterThan(plan.pop);
      expect(plan.land, label).toBeGreaterThan(plan.off);
      expect(plan.end, label).toBeGreaterThan(plan.land);
      for (const fall of FALLS) {
        const failed = planFor(base, side, stance, rider, fall).plan as GrindPlan;
        expect(failed.fail, `${label} ${fall}`).toBeGreaterThan(failed.lockAt);
        expect(failed.fail, `${label} ${fall}`).toBeLessThan(failed.off);
      }
    }
  });
});
