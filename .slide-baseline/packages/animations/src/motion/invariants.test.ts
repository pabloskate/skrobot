import { describe, expect, it } from 'vitest';
import {
  boardYawDeg,
  computeFrame,
  specFor,
  GROUND,
  X0,
  JUMP,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  type FallVariant,
  type Frame,
  type Spec,
  TRICK_BASES,
} from './trick';
import {
  DEFAULT_SKATE_STYLE,
  SKATE_STYLE_BOUNDS,
  resolveSkateStyle,
} from './style';
import { orientTrickRotation, resolveRiderMechanics } from './stance';
import type { RiderStance, SkateStyle, Stance, Trick } from '../types';

/**
 * Invariant tests for the animation core. These exist because the dominant
 * bug class in this package is a sign or symmetry error that typechecks,
 * renders fine in the one configuration someone looked at, and is wrong in
 * the mirrored one. Every claim asserted here is a symmetry the renderers
 * rely on; if a change breaks one on purpose, update the test AND the
 * comments in motion/stance.ts / motion/trick.ts that state the claim.
 */

// Every flatground trick the motion animates (its own table, aliases included).
const BASES = TRICK_BASES;

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDER_STANCES: RiderStance[] = ['regular', 'goofy'];
const FALLS: FallVariant[] = ['slam', 'bail', 'shank'];

const trick = (base: string, stance: Stance): Trick => ({
  id: `${base}-${stance}`,
  name: base,
  base,
  stance,
});

const endTime = (landed: boolean) => ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);

/** Every numeric leaf of a frame, for NaN/finiteness sweeps. */
const frameNumbers = (f: Frame): number[] => [
  f.t,
  f.board.x, f.board.y, f.board.rot, f.board.sx, f.board.sy,
  f.body.x, f.body.y, f.body.sx, f.body.rot,
  f.spin3d.flipDeg, f.spin3d.yawDeg, f.spin3d.forwardPitchDeg, f.spin3d.bodyYawDeg,
  f.motion.flight, f.motion.rotation,
  f.footL.x, f.footL.y, f.footR.x, f.footR.y,
  f.armFront, f.armBack,
  f.streetDist,
];

const sampleTimes = (landed: boolean, n = 48): number[] => {
  const end = endTime(landed);
  return Array.from({ length: n + 1 }, (_, i) => (end * i) / n);
};

const style = (overrides: Partial<SkateStyle>): SkateStyle =>
  resolveSkateStyle({ ...DEFAULT_SKATE_STYLE, ...overrides });

const STYLE_EXTREMES: SkateStyle[] = [
  {
    popHeight: SKATE_STYLE_BOUNDS.popHeight.min,
    rotationSpeed: SKATE_STYLE_BOUNDS.rotationSpeed.min,
    flickStrength: SKATE_STYLE_BOUNDS.flickStrength.min,
  },
  {
    popHeight: SKATE_STYLE_BOUNDS.popHeight.max,
    rotationSpeed: SKATE_STYLE_BOUNDS.rotationSpeed.max,
    flickStrength: SKATE_STYLE_BOUNDS.flickStrength.max,
  },
];

describe('resolveSkateStyle', () => {
  it('uses neutral values by default and clamps authored values to the style bounds', () => {
    expect(resolveSkateStyle()).toEqual(DEFAULT_SKATE_STYLE);
    expect(resolveSkateStyle({
      popHeight: -10,
      rotationSpeed: 10,
      flickStrength: Number.NaN,
    })).toEqual({
      popHeight: SKATE_STYLE_BOUNDS.popHeight.min,
      rotationSpeed: SKATE_STYLE_BOUNDS.rotationSpeed.max,
      flickStrength: DEFAULT_SKATE_STYLE.flickStrength,
    });
  });
});

// ---------- Rider mechanics symmetries ----------

describe('resolveRiderMechanics', () => {
  it('regular and goofy are exact mirrors in every trick stance', () => {
    for (const stance of STANCES) {
      const reg = resolveRiderMechanics('regular', stance);
      const goo = resolveRiderMechanics('goofy', stance);
      expect(goo.orientationSign).toBe(-reg.orientationSign);
      expect(goo.noseFoot).not.toBe(reg.noseFoot);
      expect(goo.tailFoot).not.toBe(reg.tailFoot);
      expect(goo.frontArm).not.toBe(reg.frontArm);
      expect(goo.backArm).not.toBe(reg.backArm);
      expect(goo.popFoot).not.toBe(reg.popFoot);
      expect(goo.flickFoot).not.toBe(reg.flickFoot);
      expect(goo.travelDirection).toBe(reg.travelDirection);
      expect(goo.bodyYawDegrees).toBe(reg.bodyYawDegrees);
    }
  });

  it('switch is exactly the opposite footedness (the claim in motion/stance.ts)', () => {
    // A regular rider in switch has the same mechanics as a goofy rider
    // riding natural, except the trick stance label itself.
    expect(resolveRiderMechanics('regular', 'switch'))
      .toEqual(resolveRiderMechanics('goofy', 'regular'));
    expect(resolveRiderMechanics('goofy', 'switch'))
      .toEqual(resolveRiderMechanics('regular', 'regular'));
  });

  it('fakie changes travel direction and nothing else', () => {
    for (const rider of RIDER_STANCES) {
      const natural = resolveRiderMechanics(rider, 'regular');
      const fakie = resolveRiderMechanics(rider, 'fakie');
      expect(fakie).toEqual({ ...natural, travelDirection: -1 });
      expect(natural.travelDirection).toBe(1);
    }
  });

  it('nollie moves the pop to the nose foot and the flick to the tail foot', () => {
    for (const rider of RIDER_STANCES) {
      for (const stance of STANCES) {
        const m = resolveRiderMechanics(rider, stance);
        if (stance === 'nollie') {
          expect(m.popFoot).toBe(m.noseFoot);
          expect(m.flickFoot).toBe(m.tailFoot);
        } else {
          expect(m.popFoot).toBe(m.tailFoot);
          expect(m.flickFoot).toBe(m.noseFoot);
        }
      }
    }
  });
});

describe('orientTrickRotation', () => {
  const raw = { flipDeg: 360, yawDeg: 180, bodyYawDeg: 180 };

  it('goofy negates every rotation a regular rider gets', () => {
    for (const stance of STANCES) {
      const reg = orientTrickRotation(resolveRiderMechanics('regular', stance), raw);
      const goo = orientTrickRotation(resolveRiderMechanics('goofy', stance), raw);
      expect(goo.flipDeg).toBe(-reg.flipDeg);
      expect(goo.yawDeg).toBe(-reg.yawDeg);
      expect(goo.bodyYawDeg).toBe(-reg.bodyYawDeg);
    }
  });

  it('regular riding switch rotates exactly like goofy riding natural', () => {
    expect(orientTrickRotation(resolveRiderMechanics('regular', 'switch'), raw))
      .toEqual(orientTrickRotation(resolveRiderMechanics('goofy', 'regular'), raw));
  });

  it('nollie reverses board-only shuv yaw while preserving flip direction', () => {
    const boardOnly = { ...raw, bodyYawDeg: 0 };
    const natural = orientTrickRotation(resolveRiderMechanics('regular', 'regular'), boardOnly);
    const nollie = orientTrickRotation(resolveRiderMechanics('regular', 'nollie'), boardOnly);

    expect(nollie.flipDeg).toBe(natural.flipDeg);
    expect(nollie.yawDeg).toBe(-natural.yawDeg);
  });

  it('nollie keeps board and body yaw together during body spins', () => {
    const natural = orientTrickRotation(resolveRiderMechanics('regular', 'regular'), raw);
    const nollie = orientTrickRotation(resolveRiderMechanics('regular', 'nollie'), raw);

    expect(nollie.flipDeg).toBe(natural.flipDeg);
    expect(nollie.yawDeg).toBe(natural.yawDeg);
    expect(nollie.bodyYawDeg).toBe(natural.bodyYawDeg);
  });
});

// ---------- Trick spec symmetries ----------

describe('specFor', () => {
  it('stance flags are derived only from the trick stance', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        expect(spec.stance).toBe(stance);
        expect(spec.nollie).toBe(stance === 'nollie');
        expect(spec.dir).toBe(stance === 'fakie' ? -1 : 1);
      }
    }
  });

  it('impossible roll flips only for nollie; fakie keeps the tail wrap', () => {
    expect(specFor(trick('Impossible', 'regular')).roll).toBe(-360);
    expect(specFor(trick('Impossible', 'switch')).roll).toBe(-360);
    expect(specFor(trick('Impossible', 'fakie')).roll).toBe(-360);
    expect(specFor(trick('Impossible', 'nollie')).roll).toBe(360);
  });

  it('pressure flip rotates like an inward heelflip, not a varial heelflip', () => {
    const pressure = specFor(trick('Pressure Flip', 'regular'));
    const inwardHeel = specFor(trick('Inward Heelflip', 'regular'));
    const varialHeel = specFor(trick('Varial Heelflip', 'regular'));

    expect(pressure.flipDir).toBe(inwardHeel.flipDir);
    expect(pressure.yaw).toBe(inwardHeel.yaw);
    expect(pressure.spinDir).toBe(inwardHeel.spinDir);
    expect(pressure.spinDir).toBe(-varialHeel.spinDir);
  });

  // Mirror pairs must be identical specs up to the mirrored signs — anything
  // else means the two directions of the "same" trick have quietly diverged.
  // Three families: kick/heel pairs mirror the flip only, FS/BS pairs mirror
  // the spin only, and true spatial mirrors (varials, tre/laser) mirror both.
  const flipMirrors: Array<[string, string]> = [
    ['Kickflip', 'Heelflip'],
    ['Double Kickflip', 'Double Heelflip'],
  ];
  const spinMirrors: Array<[string, string]> = [
    ['Pop Shuvit', 'Frontside Shuvit'],
    ['Late Backside Shuvit', 'Late Frontside Shuvit'],
    ['360 Shuvit', 'Frontside 360 Shuvit'],
    ['Bigspin', 'FS Bigspin'],
    ['Bigspin Flip', 'FS Bigspin Flip'],
    ['Bigspin Heelflip', 'FS Bigspin Heelflip'],
    ['Backside 180', 'Frontside 180'],
    ['Backside Flip', 'Frontside Flip'],
    ['Backside Heelflip', 'Frontside Heelflip'],
    ['Backside 360', 'Frontside 360'],
    ['Backside 360 Kickflip', 'Frontside 360 Kickflip'],
  ];
  const fullMirrors: Array<[string, string]> = [
    ['Varial Kickflip', 'Varial Heelflip'],
    ['Hardflip', 'Inward Heelflip'],
    ['360 Flip', 'Laser Flip'],
  ];
  // Mirrors in every way but the lean: a 360 inward heelflip stays flatter
  // than the 360 hardflip it mirrors.
  const leanApart: Array<[string, string]> = [
    ['360 Hardflip', '360 Inward Heelflip'],
  ];

  // Zero out the signed fields so the comparison still covers every other
  // Spec field, including ones added after this test was written.
  const unsigned = (spec: Spec): Spec => ({ ...spec, flipDir: 0, spinDir: 0, bodySpinDir: 0 });
  const specs = (a: string, b: string): [Spec, Spec] =>
    [specFor(trick(a, 'regular')), specFor(trick(b, 'regular'))];

  it.each(flipMirrors)('%s / %s mirror the flip direction only', (a, b) => {
    const [sa, sb] = specs(a, b);
    expect(unsigned(sb)).toEqual(unsigned(sa));
    expect(sb.flipDir).toBe(-sa.flipDir);
    expect(sb.spinDir).toBe(sa.spinDir);
  });

  it.each(spinMirrors)('%s / %s mirror the spin direction only', (a, b) => {
    const [sa, sb] = specs(a, b);
    expect(unsigned(sb)).toEqual(unsigned(sa));
    expect(sb.flipDir).toBe(sa.flipDir);
    expect(sb.spinDir).toBe(-sa.spinDir);
  });

  it.each(fullMirrors)('%s / %s mirror both flip and spin', (a, b) => {
    const [sa, sb] = specs(a, b);
    expect(unsigned(sb)).toEqual(unsigned(sa));
    expect(sb.flipDir).toBe(-sa.flipDir);
    expect(sb.spinDir).toBe(-sa.spinDir);
  });

  it.each(leanApart)('%s / %s mirror both flip and spin, the second leaning less', (a, b) => {
    const [sa, sb] = specs(a, b);
    expect({ ...unsigned(sb), tilt: 0 }).toEqual({ ...unsigned(sa), tilt: 0 });
    expect(sb.flipDir).toBe(-sa.flipDir);
    expect(sb.spinDir).toBe(-sa.spinDir);
    expect(sb.tilt).toBeGreaterThan(0);
    expect(sb.tilt).toBeLessThan(sa.tilt);
  });
});

// ---------- Frame invariants across the full catalog ----------

describe('computeFrame', () => {
  it('keeps the neutral style identical to the default animation', () => {
    for (const base of BASES) {
      const spec = specFor(trick(base, 'regular'));
      for (const t of sampleTimes(true, 12)) {
        expect(computeFrame(t, spec, true, 'slam', 0.65, DEFAULT_SKATE_STYLE))
          .toEqual(computeFrame(t, spec, true, 'slam'));
      }
    }
  });

  it('never produces NaN or infinity for any trick, stance, outcome, or fall', () => {
    const failures: string[] = [];
    const sweep = (spec: Spec, label: string, landed: boolean, fall: FallVariant, samples: number) => {
      for (const t of sampleTimes(landed, samples)) {
        if (!frameNumbers(computeFrame(t, spec, landed, fall)).every(Number.isFinite)) {
          failures.push(`${label} t=${t.toFixed(3)} landed=${landed} fall=${fall}`);
        }
      }
    };
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        sweep(spec, `${base} (${stance})`, true, 'slam', 48);
        for (const fall of FALLS) {
          sweep(spec, `${base} (${stance})`, false, fall, 24);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('stays finite across the full catalog at both style extremes', () => {
    const failures: string[] = [];
    for (const skateStyle of STYLE_EXTREMES) {
      for (const base of BASES) {
        for (const stance of STANCES) {
          const spec = specFor(trick(base, stance));
          for (const landed of [true, false]) {
            for (const t of sampleTimes(landed, 16)) {
              const frame = computeFrame(t, spec, landed, 'shank', 0.65, skateStyle);
              if (!frameNumbers(frame).every(Number.isFinite)) {
                failures.push(`${base} (${stance}) t=${t.toFixed(3)}`);
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('is deterministic — same inputs, same frame', () => {
    for (const base of BASES) {
      const spec = specFor(trick(base, 'regular'));
      const t = ROLL_IN + FLIP_T * 0.5;
      expect(computeFrame(t, spec, true, 'slam')).toEqual(computeFrame(t, spec, true, 'slam'));
      expect(computeFrame(t, spec, false, 'bail')).toEqual(computeFrame(t, spec, false, 'bail'));
    }
  });

  it('board leaves the ground at the pop, peaks at JUMP mid-flight, and returns for the catch', () => {
    for (const base of BASES) {
      const spec = specFor(trick(base, 'regular'));
      expect(computeFrame(ROLL_IN, spec, true, 'slam').board.y).toBeCloseTo(GROUND, 5);
      expect(computeFrame(ROLL_IN + FLIP_T / 2, spec, true, 'slam').board.y).toBeCloseTo(GROUND - JUMP, 5);
      expect(computeFrame(ROLL_IN + FLIP_T, spec, true, 'slam').board.y).toBeCloseTo(GROUND, 5);
      expect(computeFrame(endTime(true), spec, true, 'slam').board.y).toBeCloseTo(GROUND, 5);
    }
  });

  it('pop style changes only the height of the shared flight arc', () => {
    const spec = specFor(trick('Ollie', 'regular'));
    const low = style({ popHeight: SKATE_STYLE_BOUNDS.popHeight.min });
    const high = style({ popHeight: SKATE_STYLE_BOUNDS.popHeight.max });
    const apex = ROLL_IN + FLIP_T / 2;
    const lowFrame = computeFrame(apex, spec, true, 'slam', 0.65, low);
    const highFrame = computeFrame(apex, spec, true, 'slam', 0.65, high);

    expect(lowFrame.board.y).toBeCloseTo(GROUND - JUMP * low.popHeight, 5);
    expect(highFrame.board.y).toBeCloseTo(GROUND - JUMP * high.popHeight, 5);
    expect(highFrame.board.y).toBeLessThan(lowFrame.board.y);
    expect(computeFrame(ROLL_IN, spec, true, 'slam', 0.65, high).board.y).toBe(GROUND);
    expect(computeFrame(ROLL_IN + FLIP_T, spec, true, 'slam', 0.65, high).board.y).toBe(GROUND);
  });

  it('rotation style makes the catch earlier while preserving the exact final trick', () => {
    const spec = specFor(trick('Kickflip', 'regular'));
    const slow = style({ rotationSpeed: SKATE_STYLE_BOUNDS.rotationSpeed.min });
    const fast = style({ rotationSpeed: SKATE_STYLE_BOUNDS.rotationSpeed.max });
    const beforeSlowCatch = ROLL_IN + FLIP_T * 0.8;
    const slowFrame = computeFrame(beforeSlowCatch, spec, true, 'slam', 0.65, slow);
    const fastFrame = computeFrame(beforeSlowCatch, spec, true, 'slam', 0.65, fast);

    expect(Math.abs(fastFrame.spin3d.flipDeg)).toBeGreaterThan(Math.abs(slowFrame.spin3d.flipDeg));
    expect(fastFrame.spin3d.flipDeg).toBeCloseTo(360, 5);
    expect(Math.abs(slowFrame.spin3d.flipDeg)).toBeLessThan(360);

    const end = endTime(true);
    expect(computeFrame(end, spec, true, 'slam', 0.65, slow).spin3d.flipDeg).toBeCloseTo(360, 5);
    expect(computeFrame(end, spec, true, 'slam', 0.65, fast).spin3d.flipDeg).toBeCloseTo(360, 5);

    const justBeforeTouchdown = ROLL_IN + FLIP_T - 1e-6;
    expect(computeFrame(justBeforeTouchdown, spec, true, 'slam', 0.65, slow).spin3d.flipDeg)
      .toBeCloseTo(360, 3);
  });

  it('carries a body spin round until touchdown, whatever the style: momentum never stops in the air', () => {
    for (const base of ['Backside 180', 'Frontside 360', 'Bigspin Flip', 'Backside Flip']) {
      const spec = specFor(trick(base, 'regular'));
      for (const rotationSpeed of [SKATE_STYLE_BOUNDS.rotationSpeed.min, SKATE_STYLE_BOUNDS.rotationSpeed.max]) {
        const s = style({ rotationSpeed });
        const yaw = (p: number) => computeFrame(ROLL_IN + FLIP_T * p, spec, true, 'slam', 0.65, s).spin3d.bodyYawDeg;
        // Steady through the whole flight, still turning just before touchdown.
        const steps = [0.2, 0.5, 0.8, 0.95].map((p) => Math.abs(yaw(p)));
        for (let i = 1; i < steps.length; i++) expect(steps[i], base).toBeGreaterThan(steps[i - 1]);
        expect(Math.abs(yaw(0.95)), base).toBeLessThan(spec.bodyYaw);
        expect(Math.abs(yaw(1 - 1e-6)), base).toBeCloseTo(spec.bodyYaw, 3);
      }
    }
  });

  it('flick style changes the flick foot reach without moving the pop foot', () => {
    const spec = specFor(trick('Kickflip', 'regular'));
    const weak = style({ flickStrength: SKATE_STYLE_BOUNDS.flickStrength.min });
    const strong = style({ flickStrength: SKATE_STYLE_BOUNDS.flickStrength.max });
    const midFlick = ROLL_IN + FLIP_T * 0.425;
    const weakFrame = computeFrame(midFlick, spec, true, 'slam', 0.65, weak);
    const strongFrame = computeFrame(midFlick, spec, true, 'slam', 0.65, strong);

    expect(strongFrame.footR.x).toBeGreaterThan(weakFrame.footR.x);
    expect(strongFrame.footR.y).toBeLessThan(weakFrame.footR.y);
    expect(strongFrame.footL).toEqual(weakFrame.footL);

    const catchTime = ROLL_IN + FLIP_T * 0.85;
    expect(computeFrame(catchTime, spec, true, 'slam', 0.65, strong).footR)
      .toEqual(computeFrame(catchTime, spec, true, 'slam', 0.65, weak).footR);
  });

  it('strong styled flicks keep the extended foot within the two-bone leg reach', () => {
    const MAX_REACH = 35 + 35 - 0.5;
    const strong = style({ flickStrength: SKATE_STYLE_BOUNDS.flickStrength.max });
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        if (!spec.flips) continue;
        for (let i = 0; i <= 24; i += 1) {
          const t = ROLL_IN + FLIP_T * (i / 24);
          const frame = computeFrame(t, spec, true, 'slam', 0.65, strong);
          const flickFoot = spec.nollie ? frame.footL : frame.footR;
          expect(Math.hypot(flickFoot.x, flickFoot.y), `${base} ${stance}`).toBeLessThanOrEqual(MAX_REACH + 1e-6);
        }
      }
    }
  });

  it('no rotation happens before the pop', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        const f = computeFrame(ROLL_IN * 0.5, spec, true, 'slam');
        expect(f.spin3d.flipDeg).toBe(0);
        expect(f.spin3d.yawDeg).toBe(0);
        expect(f.spin3d.bodyYawDeg).toBe(0);
        expect(f.spin3d.forwardPitchDeg).toBe(0);
      }
    }
  });

  it('every rotation completes exactly at the catch, or for a body spin at touchdown, and holds through landing', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        // Catch point: 85% through the flight ends the flip and shuv clocks
        // (late tricks finish even earlier); sample just after to dodge
        // rounding. A body spin, and the board it carries, turns on to
        // touchdown.
        const atCatch = computeFrame(ROLL_IN + FLIP_T * 0.9, spec, true, 'slam').spin3d;
        const atTouchdown = computeFrame(ROLL_IN + FLIP_T - 1e-9, spec, true, 'slam').spin3d;
        const landedFrame = computeFrame(endTime(true), spec, true, 'slam').spin3d;
        for (const s of [atCatch, atTouchdown, landedFrame]) {
          expect(s.flipDeg).toBeCloseTo(spec.flipDir * spec.flips * 360, 5);
          if (spec.forwardFlip) {
            expect(s.forwardPitchDeg).toBeCloseTo(spec.dir * 180, 5);
          }
        }
        for (const s of [atTouchdown, landedFrame]) {
          expect(s.yawDeg).toBeCloseTo(boardYawDeg(spec, 1, 1), 5);
          expect(s.bodyYawDeg).toBeCloseTo((spec.bodySpinDir || 1) * spec.bodyYaw, 5);
        }
        if (!spec.bodyYaw) expect(atCatch.yawDeg).toBeCloseTo((spec.spinDir || 1) * spec.yaw, 5);
      }
    }
  });

  it('nollie body-spin tricks keep board and body yaw aligned', () => {
    for (const base of BASES) {
      const spec = specFor(trick(base, 'nollie'));
      // A counter shuv's own shuv turns against the body by design.
      if (!spec.bodyYaw || spec.counterShuv) continue;

      const frame = computeFrame(ROLL_IN + FLIP_T * 0.9, spec, true, 'slam');
      const rotation = orientTrickRotation(resolveRiderMechanics('regular', 'nollie'), frame.spin3d);
      expect(Math.sign(rotation.yawDeg), base).toBe(Math.sign(rotation.bodyYawDeg));
    }
  });

  it('ghetto bird: a hardflip inside a backside 180, caught square under the feet part way round', () => {
    const ghettoBird = specFor(trick('Ghetto Bird', 'regular'));
    const hardflip = specFor(trick('Hardflip', 'regular'));
    const backside180 = specFor(trick('Backside 180', 'regular'));
    expect(ghettoBird).toMatchObject({
      flips: hardflip.flips, flipDir: hardflip.flipDir, yaw: hardflip.yaw, spinDir: hardflip.spinDir, tilt: hardflip.tilt,
      bodyYaw: backside180.bodyYaw, bodySpinDir: backside180.bodySpinDir,
    });
    for (const rotationSpeed of [SKATE_STYLE_BOUNDS.rotationSpeed.min, 1, SKATE_STYLE_BOUNDS.rotationSpeed.max]) {
      const s = style({ rotationSpeed });
      const spin = (p: number) => computeFrame(ROLL_IN + FLIP_T * p, ghettoBird, true, 'slam', 0.65, s).spin3d;
      const samples = Array.from({ length: 201 }, (_, i) => i / 200).slice(0, -1);
      const caught = samples.find((p) => Math.abs(spin(p).flipDeg) >= 360 - 1e-9)!;
      // Caught with the back of the flight still to go...
      expect(caught, `${rotationSpeed}`).toBeLessThan(0.65);
      let prev = spin(0);
      for (const p of samples) {
        const now = spin(p);
        const label = `${rotationSpeed} p=${p}`;
        // ...the rider turning backside all the way, carrying the board, so
        // to them it's a plain hardflip, its frontside shuv done by the catch...
        expect(now.bodyYawDeg, label).toBeGreaterThanOrEqual(prev.bodyYawDeg);
        expect(now.yawDeg - now.bodyYawDeg, label).toBeCloseTo(now.shuvDeg!, 6);
        expect(now.shuvDeg, label).toBeCloseTo(-180 * Math.abs(now.flipDeg) / 360, 6);
        prev = now;
      }
      // ...caught square under the feet, a bit past a quarter turn round in
      // the world with the turn part done, and brought back straight by it.
      const atCatch = spin(caught);
      expect(atCatch.yawDeg - atCatch.bodyYawDeg).toBeCloseTo(-180, 6);
      expect(atCatch.yawDeg).toBeLessThan(-90);
      expect(atCatch.yawDeg).toBeGreaterThan(-135);
      const touchdown = spin(1 - 1e-9);
      expect(touchdown.bodyYawDeg).toBeCloseTo(180, 3);
      expect(touchdown.yawDeg).toBeCloseTo(0, 3);
    }
  });

  it('fakie mirrors the board path around the stage center; switch and nollie leave it unchanged', () => {
    for (const base of BASES) {
      const regular = specFor(trick(base, 'regular'));
      const fakie = specFor(trick(base, 'fakie'));
      const switchSpec = specFor(trick(base, 'switch'));
      for (const p of [0.15, 0.4, 0.6, 0.8]) {
        const t = ROLL_IN + FLIP_T * p;
        const regX = computeFrame(t, regular, true, 'slam').board.x - X0;
        expect(computeFrame(t, fakie, true, 'slam').board.x - X0).toBeCloseTo(-regX, 5);
        expect(computeFrame(t, switchSpec, true, 'slam').board.x - X0).toBeCloseTo(regX, 5);
      }
    }
  });

  it('shank under-rotates flip and body spin by the same progress', () => {
    const progress = 0.7;
    const spec = specFor(trick('Backside Flip', 'regular'));
    // At touchdown: the flip is caught earlier, the body spin turns until then.
    const atTouchdown = computeFrame(ROLL_IN + FLIP_T - 1e-9, spec, false, 'shank', progress).spin3d;
    expect(atTouchdown.flipDeg).toBeCloseTo(spec.flipDir * spec.flips * 360 * progress, 5);
    expect(atTouchdown.yawDeg).toBeCloseTo((spec.spinDir || 1) * spec.yaw * progress, 5);
    expect(atTouchdown.bodyYawDeg).toBeCloseTo((spec.spinDir || 1) * spec.bodyYaw * progress, 5);
  });

  it('shank holds incomplete spin on the ground (no unwind to start)', () => {
    const progress = 0.7;
    const spec = specFor(trick('Backside 180', 'regular'));
    const midFall = computeFrame(ROLL_IN + FLIP_T + FALL_T * 0.7, spec, false, 'shank', progress).spin3d;
    expect(midFall.yawDeg).toBeCloseTo((spec.spinDir || 1) * spec.yaw * progress, 5);
    expect(midFall.bodyYawDeg).toBeCloseTo((spec.spinDir || 1) * spec.bodyYaw * progress, 5);
  });

  it('fall feet stay within two-bone leg reach (no stretched shins)', () => {
    // THIGH + SHIN - slack, matching clampFootReach in motion/trick.ts.
    const MAX_REACH = 35 + 35 - 0.5;
    for (const base of ['Ollie', 'Kickflip', 'Impossible', 'Backside 180'] as const) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        for (const fall of FALLS) {
          for (const t of sampleTimes(false, 32)) {
            if (t < ROLL_IN + FLIP_T) continue;
            const f = computeFrame(t, spec, false, fall);
            expect(Math.hypot(f.footL.x, f.footL.y)).toBeLessThanOrEqual(MAX_REACH + 1e-6);
            expect(Math.hypot(f.footR.x, f.footR.y)).toBeLessThanOrEqual(MAX_REACH + 1e-6);
          }
        }
      }
    }
  });

  it('street distance never runs backwards, in any outcome', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        for (const [landed, falls] of [[true, ['slam']], [false, FALLS]] as const) {
          for (const fall of falls) {
            let last = -Infinity;
            for (const t of sampleTimes(landed, 32)) {
              const d = computeFrame(t, spec, landed, fall).streetDist;
              expect(d).toBeGreaterThanOrEqual(last);
              last = d;
            }
          }
        }
      }
    }
  });
});
