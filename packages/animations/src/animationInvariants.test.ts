import { describe, expect, it } from 'vitest';
import {
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
} from './TrickAnimation';
import { orientTrickRotation, resolveRiderMechanics } from './stanceMechanics';
import type { RiderStance, Stance, Trick } from './types';

/**
 * Invariant tests for the animation core. These exist because the dominant
 * bug class in this package is a sign or symmetry error that typechecks,
 * renders fine in the one configuration someone looked at, and is wrong in
 * the mirrored one. Every claim asserted here is a symmetry the renderers
 * rely on; if a change breaks one on purpose, update the test AND the
 * comments in stanceMechanics.ts / TrickAnimation.tsx that state the claim.
 */

// Every base the catalog can produce (mirrors specFor's switch + the plain-pop
// default used by ollies). Keep in sync with specFor when adding tricks.
const BASES = [
  'Ollie',
  'Ollie North',
  'Kickflip',
  'Heelflip',
  'Double Kickflip',
  'Double Heelflip',
  'Varial Kickflip',
  'Varial Heelflip',
  'Hardflip',
  'Inward Heelflip',
  'Pressure Flip',
  'Dolphin Flip',
  '360 Flip',
  '360 Double Kickflip',
  'Laser Flip',
  'Pop Shuvit',
  'Frontside Shuvit',
  'Late Backside Shuvit',
  'Late Frontside Shuvit',
  'Late Kickflip',
  '360 Shuvit',
  'Frontside 360 Shuvit',
  'Bigspin',
  'FS Bigspin',
  'Bigspin Flip',
  'FS Bigspin Flip',
  'Bigspin Heelflip',
  'FS Bigspin Heelflip',
  'Frontside 180',
  'Backside 180',
  'Backside Flip',
  'Frontside Flip',
  'Backside Heelflip',
  'Frontside Heelflip',
  'Backside 360',
  'Frontside 360',
  'Backside 360 Kickflip',
  'Frontside 360 Kickflip',
  'Impossible',
] as const;

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDER_STANCES: RiderStance[] = ['regular', 'goofy'];
const FALLS: FallVariant[] = ['slam', 'slip', 'bail', 'tumble', 'shank'];

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
  f.footL.x, f.footL.y, f.footR.x, f.footR.y,
  f.armFront, f.armBack,
  f.streetDist,
];

const sampleTimes = (landed: boolean, n = 48): number[] => {
  const end = endTime(landed);
  return Array.from({ length: n + 1 }, (_, i) => (end * i) / n);
};

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

  it('switch is exactly the opposite footedness (the claim in stanceMechanics.ts)', () => {
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

  // Zero out the signed fields so the comparison still covers every other
  // Spec field, including ones added after this test was written.
  const unsigned = (spec: Spec): Spec => ({ ...spec, flipDir: 0, spinDir: 0 });
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
});

// ---------- Frame invariants across the full catalog ----------

describe('computeFrame', () => {
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

  it('is deterministic — same inputs, same frame', () => {
    for (const base of BASES) {
      const spec = specFor(trick(base, 'regular'));
      const t = ROLL_IN + FLIP_T * 0.5;
      expect(computeFrame(t, spec, true, 'slam')).toEqual(computeFrame(t, spec, true, 'slam'));
      expect(computeFrame(t, spec, false, 'tumble')).toEqual(computeFrame(t, spec, false, 'tumble'));
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

  it('every rotation completes exactly at the catch and holds through landing', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trick(base, stance));
        // Catch point: 85% through the flight ends the spin clocks (late
        // tricks finish even earlier); sample just after to dodge rounding.
        const atCatch = computeFrame(ROLL_IN + FLIP_T * 0.9, spec, true, 'slam').spin3d;
        const landedFrame = computeFrame(endTime(true), spec, true, 'slam').spin3d;
        for (const s of [atCatch, landedFrame]) {
          expect(s.flipDeg).toBeCloseTo(spec.flipDir * spec.flips * 360, 5);
          expect(s.yawDeg).toBeCloseTo((spec.spinDir || 1) * spec.yaw, 5);
          expect(s.bodyYawDeg).toBeCloseTo((spec.spinDir || 1) * spec.bodyYaw, 5);
          if (spec.forwardFlip) {
            expect(s.forwardPitchDeg).toBeCloseTo(spec.dir * 180, 5);
          }
        }
      }
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
