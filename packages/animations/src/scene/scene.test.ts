import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  computeFrame,
  specFor,
  FALL_T,
  FLIP_T,
  GROUND,
  H,
  LAND_T,
  ROLL_IN,
  SKY_PAD,
  W,
  type FallVariant,
} from '../TrickAnimation';
import TrickAnimation3D from '../TrickAnimation3D';
import { SKATE_STYLE_BOUNDS, resolveSkateStyle } from '../skateStyle';
import { resolveRiderMechanics } from '../stanceMechanics';
import type { RiderStance, Robot, Stance, Trick } from '../types';
import TrickScene from './TrickScene';
import { cameraLift, makeCamera } from './camera';
import { DECK_HALF_WIDTH, SHIN, SHOE_HALF_LENGTH, THIGH, solveRig, type Rig } from './rig';

/**
 * TrickScene is a new look on the shared physics, so the things that must
 * never drift are (1) the trick motion — board, spins, flick, and stance have
 * to match New 3D frame for frame — (2) the crane camera's framing, which is
 * tuned against the extremes of the catalog and the robot style bounds, and
 * (3) the rider's own body physics: fixed-length legs, a ballistic hip arc,
 * an absorbed landing, and no joint ever jumping between frames.
 */

const BASES = [
  'Ollie', 'Ollie North', 'Kickflip', 'Heelflip', 'Double Kickflip', 'Double Heelflip',
  'Varial Kickflip', 'Varial Heelflip', 'Hardflip', 'Inward Heelflip', 'Pressure Flip',
  'Dolphin Flip', '360 Flip', '360 Double Kickflip', 'Laser Flip', 'Pop Shuvit',
  'Frontside Shuvit', 'Late Backside Shuvit', 'Late Frontside Shuvit', 'Late Kickflip',
  '360 Shuvit', 'Frontside 360 Shuvit', 'Bigspin', 'FS Bigspin', 'Bigspin Flip',
  'FS Bigspin Flip', 'Bigspin Heelflip', 'FS Bigspin Heelflip', 'Frontside 180',
  'Backside 180', 'Backside Flip', 'Frontside Flip', 'Backside Heelflip', 'Frontside Heelflip',
  'Backside 360', 'Frontside 360', 'Backside 360 Kickflip', 'Frontside 360 Kickflip', 'Impossible',
];
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

function render(component: typeof TrickScene | typeof TrickAnimation3D, props: {
  robot: Robot; trick: Trick; landed: boolean; fall: FallVariant; rider: RiderStance; t: number;
}): string {
  return renderToStaticMarkup(createElement(component, {
    robot: props.robot,
    trick: props.trick,
    landed: props.landed,
    fallVariant: props.fall,
    riderStance: props.rider,
    fixedTime: props.t,
    onDone: () => {},
  }));
}

const MOTION_ATTRS = [
  'data-board-flip',
  'data-board-yaw',
  'data-board-height',
  'data-rotation-progress',
  'data-flick-depth',
  'data-current-body-yaw',
  'data-current-head-yaw',
  'data-nose-foot',
  'data-toe-side',
];
const attrs = (html: string) =>
  Object.fromEntries(MOTION_ATTRS.map((name) => [name, new RegExp(`${name}="([^"]*)"`).exec(html)?.[1]]));

describe('TrickScene', () => {
  it('moves exactly like New 3D: same board, spin, flick, and stance state every frame', () => {
    const robot = robotWith(1);
    // Mid-rotation and catch: where flip, shuv, spin, and flick are all live.
    const phases = [ROLL_IN + FLIP_T * 0.45, ROLL_IN + FLIP_T * 0.9];
    for (const base of BASES) {
      for (const stance of STANCES) {
        for (const rider of RIDERS) {
          for (const t of phases) {
            const props = { robot, trick: trickOf(base, stance), landed: true, fall: 'slam' as const, rider, t };
            const scene = attrs(render(TrickScene, props));
            expect(scene['data-board-flip'], `${base} ${stance} ${rider} t=${t}`).toBeDefined();
            expect(scene, `${base} ${stance} ${rider} t=${t}`).toEqual(attrs(render(TrickAnimation3D, props)));
          }
        }
      }
    }
  }, 20_000);

  it('renders finite geometry for the whole catalog, every outcome', () => {
    const robot = robotWith(1);
    for (const base of BASES) {
      for (const stance of STANCES) {
        for (const { landed, fall } of OUTCOMES) {
          const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
          for (const t of [ROLL_IN + FLIP_T * 0.5, end]) {
            const html = render(TrickScene, { robot, trick: trickOf(base, stance), landed, fall, rider: 'goofy', t });
            expect(html, `${base} ${stance} ${fall} t=${t}`).not.toMatch(/NaN|Infinity/);
          }
        }
      }
    }
  }, 20_000);

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

describe('TrickScene body physics', () => {
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
              expect(tilt, `${rider} ${base} ${stance} ${leg.side} t=${t}`).toBeLessThan(72);
            }
          }
        }
      }
    }
  }, 20_000);

  it('flies the hips on a ballistic arc, with the board pulled up into a knee tuck at the peak', () => {
    for (const base of ['Ollie', 'Frontside 180']) {
      // Equal steps through mid-flight: constant gravity means a constant
      // second difference.
      const ys = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((s) => hipY(rigAt(base, 'regular', 'regular', 'landed', ROLL_IN + s * FLIP_T)));
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
