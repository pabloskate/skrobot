import { describe, expect, it } from 'vitest';
import {
  catchFraction,
  computeFrame,
  specFor,
  FALL_T,
  FLIP_T,
  GROUND,
  H,
  LAND_T,
  ROLL_IN,
  SKY_PAD,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
  W,
  type FallVariant,
  TRICK_BASES,
} from './trick';
import { SKATE_STYLE_BOUNDS, resolveSkateStyle } from './style';
import { flickExtension, orientTrickRotation, resolveRiderMechanics } from './stance';
import { isFiniteFrame } from '../testing';
import { planStage, stageFrame } from '../stage/stage';
import type { RiderStance, Robot, Stance, Trick } from '../types';
import { WHEEL_R, WHEEL_SPIN } from '../board/board';
import { cameraLift, makeCamera } from '../camera/camera';
import { solveRig } from './rig';
import { DECK_HALF_WIDTH, SHIN, SHOE_HALF_LENGTH, STANCE_BODY_YAW, THIGH, tiltHead, type Rig } from './skeleton';
import { dot3, sub3, type V3 } from '../math';

/**
 * The rider on the shared physics. The things that must never drift are (1)
 * the trick motion — the board's flip and spin, the body's spin, and the
 * flick come straight from computeFrame — (2) the crane camera's framing,
 * which is tuned against the extremes of the catalog and the robot style
 * bounds, and (3) the rider's own body physics: fixed-length legs, a
 * ballistic hip arc, an absorbed landing, and no joint ever jumping between
 * frames.
 */

const BASES = TRICK_BASES;
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const OUTCOMES: Array<{ landed: boolean; fall: FallVariant }> = [
  { landed: true, fall: 'slam' },
  { landed: false, fall: 'slam' },
  { landed: false, fall: 'bail' },
  { landed: false, fall: 'shank' },
];

const trickOf = (base: string, stance: Stance): Trick => ({ id: `${base}-${stance}`, name: base, base, stance });
const robotWith = (popHeight: number): Robot => ({
  id: 'test',
  name: 'Test',
  avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 },
  skateStyle: { popHeight, rotationSpeed: 1, flickStrength: 1.25 },
});

const stageOf = (robot: Robot, trick: Trick, landed: boolean, fall: FallVariant, rider: RiderStance) =>
  planStage(trick, { landed, riderStance: rider, style: resolveSkateStyle(robot.skateStyle), fall, shankProgress: 0.5 });

describe('Rider on the trick', () => {
  it('carries the trick exactly as computeFrame turns it: board flip and spin, body spin, and flick', () => {
    const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1.25 });
    // Mid-rotation and catch: where flip, shuv, spin, and flick are all live.
    const phases = [ROLL_IN + FLIP_T * 0.45, ROLL_IN + FLIP_T * 0.9];
    for (const base of BASES) {
      for (const stance of STANCES) {
        const spec = specFor(trickOf(base, stance));
        for (const rider of RIDERS) {
          const mechanics = resolveRiderMechanics(rider, stance);
          for (const t of phases) {
            const label = `${base} ${stance} ${rider} t=${t}`;
            const f = computeFrame(t, spec, true, 'slam', 0.65, style);
            const rig = solveRig(f, spec, mechanics, style, 'landed');
            const turned = orientTrickRotation(mechanics, f.spin3d);
            expect(rig.board.flipDeg, label).toBeCloseTo(turned.flipDeg, 1);
            expect(rig.board.yawDeg, label).toBeCloseTo(turned.yawDeg, 1);
            expect(rig.bodyYawDeg, label).toBeCloseTo(turned.bodyYawDeg - STANCE_BODY_YAW * mechanics.orientationSign, 1);
            // The flicking foot swings out to the heel or toe side the trick flicks off.
            const toeSide = mechanics.orientationSign * (mechanics.bodyYawDegrees === 0 ? 1 : -1);
            const flick = spec.flipDir && f.motion.flight >= 0 && f.motion.flight < 1
              ? -spec.flipDir * toeSide * 9 * style.flickStrength * flickExtension(f.motion.rotation)
              : 0;
            expect(rig.flickZ, label).toBeCloseTo(flick, 1);
          }
        }
      }
    }
  });

  it('stages finite geometry for the whole catalog, every outcome', () => {
    const robot = robotWith(1);
    for (const base of BASES) {
      for (const stance of STANCES) {
        for (const { landed, fall } of OUTCOMES) {
          const stage = stageOf(robot, trickOf(base, stance), landed, fall, 'goofy');
          for (const t of [ROLL_IN + FLIP_T * 0.5, stage.end]) {
            expect(isFiniteFrame(stageFrame(stage, t, 1)), `${base} ${stance} ${fall} t=${t}`).toBe(true);
          }
        }
      }
    }
  });

  it('flicks a kickflip off the heelside rail and a heelflip off the toeside, early in the roll', () => {
    // The flick is what starts the roll, so by the time the board has turned
    // a quarter of its flip the shoe's trailing end — toe on a kickflip, heel
    // on a heelflip — is past the far rail. World z is board-space z here:
    // no yaw on these tricks, and the resting body yaw is undone for feet.
    for (const flickStrength of [SKATE_STYLE_BOUNDS.flickStrength.min, SKATE_STYLE_BOUNDS.flickStrength.max]) {
      const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength });
      for (const base of ['Kickflip', 'Heelflip']) {
        for (const stance of STANCES) {
          const spec = specFor(trickOf(base, stance));
          for (const rider of RIDERS) {
            const mechanics = resolveRiderMechanics(rider, stance);
            let t = ROLL_IN;
            while (computeFrame(t, spec, true, 'slam', 0.9, style).motion.rotation < 0.25) t += 0.002;
            const rig = solveRig(computeFrame(t, spec, true, 'slam', 0.9, style), spec, mechanics, style);
            const shoe = rig.legs.find((leg) => leg.flicking)!.shoe;
            const heelside = -rig.toeDir;
            const [out, trailing] = base === 'Kickflip'
              ? [heelside, shoe.at(SHOE_HALF_LENGTH, 0, 0)]
              : [-heelside, shoe.at(-SHOE_HALF_LENGTH, 0, 0)];
            expect(out * trailing.z, `${base} ${stance} ${rider} flick ${flickStrength}`).toBeGreaterThan(DECK_HALF_WIDTH);
          }
        }
      }
    }
  });

  it('keeps the robot inside the stage for every trick, stance, outcome, and pop style', () => {
    const top = -SKY_PAD;
    const bottom = H;
    let highest = Infinity;
    let lowest = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const base of BASES) {
        for (const stance of STANCES) {
          const spec = specFor(trickOf(base, stance));
          for (const rider of RIDERS) {
            const mechanics = resolveRiderMechanics(rider, stance);
            for (const { landed, fall } of OUTCOMES) {
              const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
              for (let t = 0; t <= end; t += 0.06) {
                const f = computeFrame(t, spec, landed, fall, 0.9, style);
                const rig = solveRig(f, spec, mechanics, style, landed ? 'landed' : fall);
                const falling = !landed && f.motion.flight >= 1;
                const cam = makeCamera(cameraLift(f.motion.flight, style.popHeight, GROUND - rig.head.origin.y, falling));
                // Antenna tip above the head, then every body extreme.
                highest = Math.min(highest, cam.project(rig.head.at(0, 28, 0)).y);
                const corners = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((c) => [a, b, c])));
                const extremes = [
                  ...corners.map(([a, b, c]) => rig.head.at(a * 14, b * 15, c * 18)),
                  ...corners.map(([a, b, c]) => rig.torso.at(a * 11, b * 25, c * 15.5)),
                  ...rig.legs.map((leg) => leg.shoe.origin),
                  ...rig.arms.map((arm) => arm.hand),
                ];
                for (const p of extremes) {
                  const pp = cam.project(p);
                  lowest = Math.max(lowest, pp.y);
                  left = Math.min(left, pp.x);
                  right = Math.max(right, pp.x);
                }
              }
            }
          }
        }
      }
    }
    expect(highest).toBeGreaterThan(top);
    expect(lowest).toBeLessThan(bottom);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(W);
  });
});

describe('Rider body physics', () => {
  const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
  type Outcome = 'landed' | FallVariant;
  const rigAt = (base: string, stance: Stance, rider: RiderStance, outcome: Outcome, t: number): Rig => {
    const spec = specFor(trickOf(base, stance));
    const landed = outcome === 'landed';
    const f = computeFrame(t, spec, landed, landed ? 'slam' : outcome, 0.65, style);
    return solveRig(f, spec, resolveRiderMechanics(rider, stance), style, outcome);
  };
  const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const hipY = (rig: Rig) => (rig.legs[0].hip.y + rig.legs[1].hip.y) / 2;
  const OUTCOME_LIST: Outcome[] = ['landed', 'slam', 'bail', 'shank'];

  it('never stretches a leg: thigh and shin keep their length through the whole catalog', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        for (const outcome of OUTCOME_LIST) {
          const end = ROLL_IN + FLIP_T + (outcome === 'landed' ? LAND_T : FALL_T);
          for (let t = 0; t <= end; t += 0.05) {
            for (const leg of rigAt(base, stance, 'regular', outcome, t).legs) {
              expect(dist(leg.hip, leg.knee), `${base} ${stance} ${outcome} t=${t}`).toBeCloseTo(THIGH, 6);
              expect(dist(leg.knee, leg.ankle), `${base} ${stance} ${outcome} t=${t}`).toBeCloseTo(SHIN, 6);
            }
          }
        }
      }
    }
  }, 20_000);

  it('plants the feet like a rider: shoes across the deck, shins coming down into them from above', () => {
    for (const rider of RIDERS) {
      for (const stance of STANCES) {
        // Cruising, each shoe is centered on the deck: the toes hang over the
        // rail a little, not half a shoe.
        for (const leg of rigAt('Ollie', stance, rider, 'landed', 0.02).legs) {
          const overhang = Math.abs(leg.shoe.origin.z) + SHOE_HALF_LENGTH * Math.abs(leg.shoe.fwd.z) - DECK_HALF_WIDTH;
          expect(overhang, `${rider} ${stance} ${leg.side}`).toBeLessThan(5);
        }
        // An ankle only flexes so far: the shin never lies down along the
        // deck, even in the deepest tuck or landing squat.
        for (const base of BASES) {
          for (let t = 0; t <= ROLL_IN + FLIP_T + LAND_T; t += 0.04) {
            for (const leg of rigAt(base, stance, rider, 'landed', t).legs) {
              const shin = { x: leg.knee.x - leg.ankle.x, y: leg.knee.y - leg.ankle.y, z: leg.knee.z - leg.ankle.z };
              const up = leg.shoe.up;
              const tilt = Math.acos((shin.x * up.x + shin.y * up.y + shin.z * up.z) / SHIN) * 180 / Math.PI;
              // A nollie's back foot, set up out over its rail and picked up
              // by the tail popping into it, bends its ankle furthest, for a
              // frame or two after the pop.
              expect(tilt, `${rider} ${base} ${stance} ${leg.side} t=${t}`).toBeLessThan(77);
            }
          }
        }
      }
    }
  }, 20_000);

  it('stands a hardflip deck up on end between the legs, where a varial turns flat', () => {
    // Mid-flight, once the pop's own pitch has faded.
    const noseUp = (base: string) => {
      const nose = rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + 0.45 * FLIP_T).board.dir({ x: 1, y: 0, z: 0 });
      return (Math.asin(Math.abs(nose.y)) * 180) / Math.PI;
    };
    for (const base of ['Varial Kickflip', 'Varial Heelflip']) expect(noseUp(base), base).toBeLessThan(15);
    for (const base of ['Hardflip', 'Inward Heelflip']) expect(noseUp(base), base).toBeGreaterThan(45);
  });

  it('catches a tilted spin as the deck a flat one leaves: no jump where the lean hands back', () => {
    const axes: V3[] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
    for (const rotationSpeed of [SKATE_STYLE_BOUNDS.rotationSpeed.min, 1, SKATE_STYLE_BOUNDS.rotationSpeed.max]) {
      const spinStyle = resolveSkateStyle({ popHeight: 1, rotationSpeed, flickStrength: 1 });
      for (const base of ['Hardflip', 'Inward Heelflip', '360 Hardflip', '360 Inward Heelflip', 'Ghetto Bird']) {
        for (const rider of RIDERS) {
          for (const stance of STANCES) {
            const spec = specFor(trickOf(base, stance));
            // The moment the spin clock runs out (a ghetto bird's comes early, for its turn).
            let [spinning, caught] = [ROLL_IN, ROLL_IN + catchFraction(spinStyle) * FLIP_T];
            for (let i = 0; i < 40; i++) {
              const mid = (spinning + caught) / 2;
              if (computeFrame(mid, spec, true, 'slam', 0.65, spinStyle).motion.rotation >= 1) caught = mid;
              else spinning = mid;
            }
            const deck = (t: number) => solveRig(
              computeFrame(t, spec, true, 'slam', 0.65, spinStyle), spec, resolveRiderMechanics(rider, stance), spinStyle, 'landed',
            ).board.dir;
            const [before, after] = [deck(caught - 1e-4), deck(Math.min(caught + 1e-4, ROLL_IN + FLIP_T + 0.05))];
            const jump = Math.max(...axes.map((a) => dist(before(a), after(a))));
            expect(jump, `${base} ${stance} ${rider} at ${rotationSpeed}`).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  it('catches a ghetto bird\'s hardflip square under the feet part way round its turn, in every stance', () => {
    const heading = (d: V3) => (Math.atan2(-d.z, d.x) * 180) / Math.PI;
    const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
    const nose = (rig: Rig) => rig.board.dir({ x: 1, y: 0, z: 0 });
    // Where the board points from the rider's own facing.
    const underFeet = (rig: Rig) => heading(nose(rig)) - rig.bodyYawDeg;
    for (const rider of RIDERS) {
      for (const stance of STANCES) {
        const spec = specFor(trickOf('Ghetto Bird', stance));
        const at = (t: number) => rigAt('Ghetto Bird', stance, rider, 'landed', t);
        // The catch: the moment the flip is done.
        let [flipping, caught] = [ROLL_IN, ROLL_IN + FLIP_T];
        for (let i = 0; i < 40; i++) {
          const mid = (flipping + caught) / 2;
          if (computeFrame(mid, spec, true, 'slam', 0.65, style).motion.rotation >= 1) caught = mid;
          else flipping = mid;
        }
        const label = `${stance} ${rider}`;
        const [start, atCatch, touchdown] = [at(ROLL_IN - 0.01), at(caught), at(ROLL_IN + FLIP_T - 1e-6)];
        // Caught flat and square under the feet, nose and tail swapped as a
        // hardflip leaves them, with the rider part way round the turn...
        expect(Math.abs(nose(atCatch).y), label).toBeLessThan(0.02);
        expect(Math.abs(wrap(underFeet(atCatch) - underFeet(start) - 180)), label).toBeLessThan(1);
        const shown = Math.abs(wrap(heading(nose(atCatch)) - heading(nose(start))));
        expect(shown, label).toBeGreaterThan(90);
        expect(shown, label).toBeLessThan(135);
        // ...who turns on with it to the full 180, bringing the board back straight.
        for (const t of [caught + 0.1 * (ROLL_IN + FLIP_T - caught), (caught + ROLL_IN + FLIP_T) / 2]) {
          expect(Math.abs(wrap(underFeet(at(t)) - underFeet(atCatch))), `${label} t=${t}`).toBeLessThan(1);
        }
        expect(Math.abs(touchdown.bodyYawDeg - start.bodyYawDeg), label).toBeCloseTo(180, 1);
        expect(Math.abs(wrap(heading(nose(touchdown)) - heading(nose(start)))), label).toBeLessThan(1);
        // Nothing jumps on the way, an under-rotated one's flight included
        // (every shank lands crooked with a snap of its own). The pop's tail
        // snap is the one allowed jolt.
        for (const outcome of ['landed', 'shank'] as const) {
          let prev: V3 | null = null;
          const end = ROLL_IN + FLIP_T + (outcome === 'landed' ? LAND_T : 0);
          for (let t = ROLL_IN + 0.05; t < end; t += 1 / 120) {
            const now = nose(rigAt('Ghetto Bird', stance, rider, outcome, t));
            if (prev) expect(dist(now, prev), `${label} ${outcome} t=${t.toFixed(3)}`).toBeLessThan(0.15);
            prev = now;
          }
        }
      }
    }
  });

  it('flies the hips on a ballistic arc, with the board pulled up into a knee tuck at the peak', () => {
    for (const base of ['Ollie', 'Frontside 180']) {
      // Equal steps through mid-flight: constant gravity means a constant
      // second difference. (Until the pop has eased level, the front foot
      // rides the popped nose up and the hips give its knee the room.)
      const ys = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((s) => hipY(rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + s * FLIP_T)));
      const accel = ys.slice(2).map((y, i) => y - 2 * ys[i + 1] + ys[i]);
      for (const a of accel) expect(a, base).toBeCloseTo(accel[0], 6);
      expect(accel[0], `${base} falls back down`).toBeGreaterThan(0);
      const overDeck = (s: number) => rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + s * FLIP_T).hipOverDeck;
      expect(overDeck(0.5), `${base} tucks`).toBeLessThan(Math.min(overDeck(0.1), overDeck(0.95)) - 10);
    }
  });

  it('absorbs the landing: the hips sink below cruising height, then stand back up', () => {
    for (const base of ['Ollie', 'Kickflip', '360 Flip']) {
      const cruise = rigAt(base, 'regular', 'regular', 'landed', 0.02).hipOverDeck;
      let lowest = Infinity;
      for (let u = 0; u < 0.4; u += 0.01) {
        lowest = Math.min(lowest, rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + FLIP_T + u).hipOverDeck);
      }
      expect(lowest, base).toBeLessThan(cruise - 15);
      // Back to cruising height, give or take the rolling bob.
      const after = rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + FLIP_T + LAND_T).hipOverDeck;
      expect(Math.abs(after - cruise), base).toBeLessThan(2);
    }
  });

  it('moves every joint continuously: no pops at the catch, the touchdown, or into a fall', () => {
    // Worst joint acceleration between 120 Hz frames. The one allowed jolt is
    // the tail snap itself, where the shared board pops from flat to steep.
    const dt = 1 / 120;
    const joints = (rig: Rig) => [
      rig.head.origin, rig.torso.origin,
      ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
      ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
    ];
    for (const base of ['Kickflip', '360 Flip', 'Backside 180', 'Frontside 360', 'Bigspin', 'Impossible', 'Late Kickflip', 'Ollie North']) {
      for (const stance of STANCES) {
        for (const outcome of OUTCOME_LIST) {
          const end = ROLL_IN + FLIP_T + (outcome === 'landed' ? LAND_T : FALL_T);
          let prev2: ReturnType<typeof joints> | null = null;
          let prev: ReturnType<typeof joints> | null = null;
          for (let t = 0; t <= end; t += dt) {
            const now = joints(rigAt(base, stance, 'regular', outcome, t));
            if (prev && prev2 && Math.abs(t - dt - ROLL_IN) > 0.02) {
              for (let i = 0; i < now.length; i++) {
                const jerk = Math.hypot(
                  now[i].x - 2 * prev[i].x + prev2[i].x,
                  now[i].y - 2 * prev[i].y + prev2[i].y,
                  now[i].z - 2 * prev[i].z + prev2[i].z,
                );
                expect(jerk, `${base} ${stance} ${outcome} joint ${i} t=${t.toFixed(3)}`).toBeLessThan(10);
              }
            }
            prev2 = prev;
            prev = now;
          }
        }
      }
    }
  }, 30_000);
});

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('How each stance is carried', () => {
  const style = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });
  const robot = robotWith(1);
  /** Degrees, level, between a direction and the way the rider rolls along x (`travel` ±1). */
  const offTravel = (d: V3, travel: number) => (Math.atan2(Math.abs(d.z), d.x * travel) * 180) / Math.PI;
  /** Degrees, level, a direction is turned off the board's nose. */
  const offNose = (rig: Rig, d: V3) => {
    const nose = rig.board.dir({ x: 1, y: 0, z: 0 });
    return (Math.abs(Math.atan2(d.x * nose.z - d.z * nose.x, d.x * nose.x + d.z * nose.z)) * 180) / Math.PI;
  };
  const cruising = (stance: Stance, rider: RiderStance) =>
    solveRig(computeFrame(0.1, specFor(trickOf('Ollie', stance)), true, 'slam', 0.65, style), specFor(trickOf('Ollie', stance)), resolveRiderMechanics(rider, stance), style, 'landed');

  it('looks the way the board is rolling, rolling in and riding away: over the back shoulder in fakie, and after a 180', () => {
    const off: string[] = [];
    for (const base of BASES) {
      for (const stance of STANCES) {
        for (const rider of RIDERS) {
          const stage = stageOf(robot, trickOf(base, stance), true, 'slam', rider);
          for (const [when, t] of [['rolling in', 0.2], ['riding away', stage.end]] as const) {
            const look = offTravel(stageFrame(stage, t, 1).rig.head.fwd, stage.spec.dir);
            if (look > 40) off.push(`${base} ${stance} ${rider} ${when}: ${look.toFixed(0)}°`);
          }
        }
      }
    }
    expect(off).toEqual([]);
  });

  it('closes the shoulders toward the tail rolling fakie', () => {
    for (const rider of RIDERS) {
      const natural = cruising('regular', rider);
      const fakie = cruising('fakie', rider);
      // Past square to the board, toward the tail.
      expect(offNose(fakie, fakie.torso.fwd)).toBeGreaterThan(95);
      expect(offNose(fakie, fakie.torso.fwd) - offNose(natural, natural.torso.fwd)).toBeGreaterThan(50);
    }
  });

  it('carries switch on the other foot squarer, head turned harder ahead and arms guarded, standing exactly as that footedness does', () => {
    for (const [rider, other] of [['regular', 'goofy'], ['goofy', 'regular']] as const) {
      const sw = cruising('switch', rider);
      const natural = cruising('regular', other);
      // The board, feet and legs are the other footedness's own.
      for (let i = 0; i < 2; i++) {
        for (const key of ['hip', 'knee', 'ankle'] as const) {
          expect(dist(sw.legs[i][key], natural.legs[i][key]), `${rider} ${key}`).toBeLessThan(1e-6);
        }
      }
      // The shoulders open less toward the nose…
      const chest = (rig: Rig) => offNose(rig, rig.torso.fwd);
      expect(chest(sw) - chest(natural)).toBeGreaterThan(15);
      // …so the head turns further round off them to see ahead…
      const neck = (rig: Rig) => chest(rig) - offNose(rig, rig.head.fwd);
      expect(neck(sw) - neck(natural)).toBeGreaterThan(25);
      // …and the arms are held out from the body.
      const reach = (rig: Rig) => rig.arms.reduce((sum, arm) => sum + Math.abs(dot3(sub3(arm.hand, rig.torso.origin), rig.torso.side)), 0);
      expect(reach(sw) - reach(natural)).toBeGreaterThan(3);
    }
  });
});

describe('Wheels', () => {
  const robot = robotWith(1);
  const at = (trick: Trick, t: number, landed = true, fall: FallVariant = 'slam') => {
    const frame = stageFrame(stageOf(robot, trick, landed, fall, 'regular'), t, 1);
    return { roll: frame.wheels.angle, yaw: frame.rig.board.yawDeg };
  };
  // Street travel per second at full speed, in world units.
  const SPEED = STREET_DASH_PERIOD / STREET_DASH_SECONDS;
  // Radians per world unit travelled on the nose's heading.
  const RATE = WHEEL_SPIN / WHEEL_R;
  const touchdown = ROLL_IN + FLIP_T;
  const DT = 0.05;

  it('rolls the wheels with the ground, and the other way when the board lands turned around', () => {
    for (const base of BASES) {
      for (const stance of STANCES) {
        const trick = trickOf(base, stance);
        const dir = specFor(trick).dir;
        const label = `${base} ${stance}`;
        // The wheel turns in step with the distance travelled: forward on
        // the nose's heading, backward fakie.
        const before = (at(trick, 0.1 + DT).roll - at(trick, 0.1).roll) / RATE;
        expect(before, label).toBeCloseTo(dir * SPEED * DT, 0);
        const landing = at(trick, touchdown + 0.2);
        const after = (at(trick, touchdown + 0.2 + DT).roll - landing.roll) / RATE;
        expect(after, label).toBeCloseTo(dir * Math.cos((landing.yaw * Math.PI) / 180) * SPEED * DT, 0);
      }
    }
    // A pop shuv lands the nose where the tail was, so the wheels reverse.
    const shuv = trickOf('Pop Shuvit', 'regular');
    expect(at(shuv, touchdown + 0.3).roll).toBeLessThan(at(shuv, touchdown + 0.2).roll);
  }, 20_000);

  it('turns the wheels continuously: they coast through the air and never jump', () => {
    const step = 1 / 60;
    const maxTurn = SPEED * step * RATE + 1e-3;
    for (const base of ['Ollie', 'Kickflip', 'Pop Shuvit', 'Frontside 180']) {
      for (const { landed, fall } of OUTCOMES) {
        const stage = stageOf(robot, trickOf(base, 'regular'), landed, fall, 'regular');
        let prev = stageFrame(stage, 0, 1).wheels.angle;
        for (let t = step; t <= stage.end; t += step) {
          const roll = stageFrame(stage, t, 1).wheels.angle;
          expect(Math.abs(roll - prev), `${base} ${fall} t=${t.toFixed(3)}`).toBeLessThanOrEqual(maxTurn);
          prev = roll;
        }
      }
    }
  }, 40_000);
});

describe('Lead-in', () => {
  it('cruises in the t = 0 pose, so the attempt starts from the last lead-in frame', () => {
    const robot = robotWith(1);
    for (const base of ['Ollie', 'Kickflip', '360 Flip', 'Frontside 180', 'Bigspin']) {
      for (const stance of STANCES) {
        const stage = stageOf(robot, trickOf(base, stance), true, 'slam', 'goofy');
        const start = stageFrame(stage, 0, 1);
        for (const t of [-2, -0.9, -0.001]) {
          const frame = stageFrame(stage, t, 1);
          const label = `${base} ${stance} t=${t}`;
          expect(frame.rig.board.flipDeg, label).toBe(start.rig.board.flipDeg);
          expect(frame.rig.head.origin, label).toEqual(start.rig.head.origin);
          expect(frame.rig.legs.map((leg) => leg.ankle), label).toEqual(start.rig.legs.map((leg) => leg.ankle));
          expect(frame.lift, label).toBe(start.lift);
          expect(isFiniteFrame(frame), label).toBe(true);
        }
      }
    }
  });

  it('turns the head rigidly about the base of the head', () => {
    const spec = specFor(trickOf('Kickflip', 'regular'));
    const style = resolveSkateStyle();
    const rig = solveRig(computeFrame(0, spec, true, 'slam', 0.65, style), spec, resolveRiderMechanics('regular', 'regular'), style, 'landed');
    const corners = (frame: Rig['head']) => {
      const pts: V3[] = [];
      for (const f of [-13, 13]) for (const u of [-14, 14]) for (const side of [-17, 17]) pts.push(frame.at(f, u, side));
      return pts;
    };
    const base = corners(rig.head);
    expect(tiltHead(rig.head, 0, 0)).toBe(rig.head);
    for (const [pitch, roll] of [[18, 6], [-11, 0], [0, -8], [25, 12]]) {
      const head = tiltHead(rig.head, pitch, roll);
      for (const [a, b] of [[head.fwd, head.up], [head.up, head.side], [head.side, head.fwd]]) expect(dot3(a, b)).toBeCloseTo(0, 9);
      for (const axis of [head.fwd, head.up, head.side]) expect(dot3(axis, axis)).toBeCloseTo(1, 9);
      // The pivot on the neck doesn't move, and the head keeps its shape.
      const pivot = sub3(head.at(-2, -13, 0), rig.head.at(-2, -13, 0));
      expect(Math.hypot(pivot.x, pivot.y, pivot.z)).toBeCloseTo(0, 9);
      const moved = corners(head);
      const span = (pts: V3[], i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) expect(span(moved, i, j)).toBeCloseTo(span(base, i, j), 9);
      // Positive pitch looks up (world up is -y).
      if (pitch > 0) expect(head.fwd.y).toBeLessThan(rig.head.fwd.y);
    }
  });
});
