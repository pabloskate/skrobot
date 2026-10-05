import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GROUND, H, SKY_PAD, W, type FallVariant } from '../TrickAnimation';
import { resolveSkateStyle } from '../skateStyle';
import { resolveRiderMechanics } from '../stanceMechanics';
import type { RiderStance, Robot, SkateStyle, Stance } from '../types';
import TrickScene from './TrickScene';
import { HANGER_BOTTOM, WHEEL_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, deckTopY, drawBoard } from './board';
import { TIP_X, deckBottomY } from './deck';
import { EL_TORO_RAIL } from './stairs';
import { fallSink, makeCamera } from './camera';
import { facing } from './draw';
import { drawRobot } from './robot';
import {
  barSpan,
  grindCameraLift,
  grindFrame,
  grindStreetDist,
  grindTimelineFor,
  planGrind,
  travel,
  type GrindPlan,
} from './grind';
import {
  BAR_HALF,
  BAR_TOP_Y,
  BAR_Z,
  GRIND_BASES,
  exitEndsFor,
  grindSpecFor,
  joinGrindBase,
  joinGrindExit,
  splitGrindBase,
  type GrindSide,
  type PopEnd,
} from './grindDefinitions';
import { canEnterGrind, canExitGrind, thenSpin } from './grindTricks';
import { boardRigAt, solveGrindRig } from './grindRig';
import { add3, dot3, rotX, rotY, scale3, sub3, type V3 } from './math';
import { DECK_HALF_WIDTH, SHIN, SHOE_HALF_HEIGHT, THIGH, type Rig } from './skeleton';

/**
 * Grinds are their own trick motion, so these pin the physics a skater would
 * check: the board's riding part sits exactly on the bar for the whole
 * lock, nothing ever passes through the bar, the bar stays put in the plaza,
 * the side names match the approach, and the body keeps the flatground
 * rig's promises (whole legs, soles on the grip, no pops, always in frame).
 */

const SIDES: GrindSide[] = ['frontside', 'backside'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];
const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const FALLS: FallVariant[] = ['slam', 'bail', 'shank'];
const NEUTRAL = resolveSkateStyle({ popHeight: 1, rotationSpeed: 1, flickStrength: 1 });

it.each(['360 Flip', 'Laser Flip'])('snaps %s close to the ground before the grind hop carries it away', (entry) => {
  for (const rail of [null, EL_TORO_RAIL]) for (const rider of RIDERS) for (const stance of STANCES) {
    for (const popHeight of [0.45, 1.15]) for (const rotationSpeed of [0.8, 1.25]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed, flickStrength: 1 });
      const spec = grindSpecFor({ base: `${entry} into Frontside 50-50 Grind`, stance })!;
      const mechanics = resolveRiderMechanics(rider, stance);
      const plan = planGrind(spec, mechanics, style, true, 'slam', rail);
      const tipX = spec.popNose ? TIP_X : -TIP_X;
      const label = `${rail ? 'handrail' : 'flat bar'} ${rider} ${stance} ${popHeight}/${rotationSpeed}`;
      let closest = Infinity;
      let lowest = -Infinity;
      for (let tau = 0; tau <= 0.1; tau += 0.002) {
        const { rig } = solveGrindRig(plan.pop + tau, plan, mechanics, style);
        closest = Math.min(closest, GROUND + WHEEL_BOTTOM - rig.board.point({ x: tipX, y: deckBottomY(tipX), z: 0 }).y);
        lowest = Math.max(lowest, ...boardSamples(rig).map((p) => p.y));
      }
      expect(closest, label).toBeLessThan(6);
      expect(closest, label).toBeGreaterThanOrEqual(-0.1);
      expect(lowest, label).toBeLessThanOrEqual(GROUND + WHEEL_BOTTOM + 0.1);
    }
  }
});

const nameOf = (base: string, side: GrindSide) => `${side === 'frontside' ? 'Frontside' : 'Backside'} ${base}`;

function planFor(base: string, side: GrindSide, stance: Stance, rider: RiderStance, fall: FallVariant | null, style: SkateStyle = NEUTRAL) {
  const spec = grindSpecFor({ base: nameOf(base, side), stance })!;
  const mechanics = resolveRiderMechanics(rider, stance);
  return { spec, mechanics, plan: planGrind(spec, mechanics, style, fall == null, fall ?? 'slam') };
}

/** Every combination worth sweeping: the catalog, both sides, both riders, every stance. */
function* everyGrind() {
  for (const base of GRIND_BASES) {
    for (const side of SIDES) {
      for (const rider of RIDERS) {
        for (const stance of STANCES) yield { base, side, rider, stance, label: `${side} ${base} ${stance} ${rider}` };
      }
    }
  }
}

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A world point in the board's own frame. */
function toBoard(rig: Rig, p: V3): V3 {
  const d = sub3(p, rig.board.center);
  return {
    x: dot3(d, rig.board.dir({ x: 1, y: 0, z: 0 })),
    y: dot3(d, rig.board.dir({ x: 0, y: 1, z: 0 })),
    z: dot3(d, rig.board.dir({ x: 0, y: 0, z: 1 })),
  };
}

/** Samples over the board's solid parts: deck underside, hangers, and wheel rims. */
function boardSamples(rig: Rig): V3[] {
  const pts: V3[] = [];
  for (let x = -46; x <= 46; x += 4) {
    for (const z of [-DECK_HALF_WIDTH + 1, 0, DECK_HALF_WIDTH - 1]) pts.push(rig.board.point({ x, y: deckTopY(x) + 2, z }));
  }
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    for (let z = -5; z <= 5; z += 2.5) pts.push(rig.board.point({ x: tx, y: HANGER_BOTTOM, z }));
    for (const wz of [-WHEEL_Z, WHEEL_Z]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push(rig.board.point({ x: tx + Math.sin(a) * WHEEL_R, y: WHEEL_Y + Math.cos(a) * WHEEL_R, z: wz }));
      }
    }
  }
  return pts;
}

/**
 * Keep every sampled frame, but ask Vitest to format/assert only the worst
 * value for each bound. Millions of expect() calls dominated these sweeps.
 * Non-finite samples are failures too, even if a later sample is finite.
 */
function sweepBounds() {
  const worst = new Map<string, { value: number; limit: number; where: string }>();
  return {
    below(name: string, value: number, limit: number, where: string) {
      const bounded = Number.isFinite(value) ? value : Infinity;
      const previous = worst.get(name);
      if (!previous || bounded - limit > previous.value - previous.limit) {
        worst.set(name, { value: bounded, limit, where });
      }
    },
    verify() {
      expect(worst.size).toBeGreaterThan(0);
      for (const [name, { value, limit, where }] of worst) {
        expect(value, `${name}: ${where}`).toBeLessThan(limit);
      }
    },
  };
}

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

  it('comes in frontside with the bar on the toeside and backside on the heelside', () => {
    for (const { base, side, rider, stance, label } of everyGrind()) {
      const { plan } = planFor(base, side, stance, rider, null);
      const barToward = Math.sign(BAR_Z - plan.laneZ);
      expect(barToward, label).toBe(side === 'frontside' ? plan.toeDir : -plan.toeDir);
    }
  });

  it('turns into slides the way their names say: frontside board-, nose- and bluntslides face up the bar, lip-, tail- and noseblunt slides down it', () => {
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
          for (const stance of ['regular', 'switch'] as Stance[]) {
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
  it('locks the riding part of the board exactly onto the bar for the whole grind', () => {
    for (const { base, side, rider, stance, label } of everyGrind()) {
      const { plan, spec, mechanics } = planFor(base, side, stance, rider, null);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += 0.05) {
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
    const inside = (p: V3, x0: number, x1: number, top: number, bottom: number, half: number) =>
      p.x > x0 && p.x < x1 && p.y > top && p.y < bottom && Math.abs(p.z - BAR_Z) < half;
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      for (const { base, side, rider, stance, label } of everyGrind()) {
        const { plan, mechanics } = planFor(base, side, stance, rider, null, style);
        // Rolling in and away the board is on the ground beside or past the bar.
        for (let t = plan.pop; t <= plan.land; t += 1 / 60) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
          const { x0, x1 } = barSpan(plan, frame.streetDist);
          const posts = [x0 + 46, x1 - 46];
          for (const p of boardSamples(rig)) {
            const where = `${label} pop ${popHeight} t=${t.toFixed(3)}`;
            sweep.below('bar intersections', Number(inside(p, x0, x1, BAR_TOP_Y + 0.4, BAR_TOP_Y + 2 * BAR_HALF, BAR_HALF - 0.4)), 1, where);
            for (const px of posts) sweep.below('post intersections', Number(inside(p, px - 1.7, px + 1.7, BAR_TOP_Y, GROUND, 1.7)), 1, where);
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

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
    // Rendered frames agree with the plan.
    const html = renderToStaticMarkup(createElement(TrickScene, {
      robot: { id: 't', name: 'T', avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 } },
      trick: { id: 'x', name: 'x', base: 'Frontside 50-50 Grind', stance: 'regular' },
      landed: true,
      fixedTime: 1.5,
      onDone: () => {},
    }));
    const { plan } = planFor('50-50 Grind', 'frontside', 'regular', 'regular', null);
    expect(Number(/data-bar-x0="([^"]*)"/.exec(html)?.[1])).toBeCloseTo(barSpan(plan, 1.5).x0, 1);
  });

  it('starts and ends the board flat on the ground', () => {
    for (const { base, side, rider, stance, label } of everyGrind()) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      const at = (t: number) => solveGrindRig(t, plan, mechanics, NEUTRAL).rig.board;
      for (const t of [0, plan.pop - 0.01, plan.land + 0.01, plan.end]) {
        const board = at(t);
        expect(board.center.y, `${label} t=${t}`).toBeCloseTo(GROUND, 6);
        expect(Math.abs(board.yawDeg) + Math.abs(board.pitchDeg) + Math.abs(board.flipDeg), `${label} t=${t}`).toBeLessThan(1e-6);
      }
    }
  });
});

/** Seconds a pop keeps the board's end dipped at its steepest. */
const POP_SNAP_T = 0.1;

describe('Grind body', () => {
  const OUTCOMES: Array<FallVariant | null> = [null, ...FALLS];

  it('holds the complete starting pose throughout the lead-in', () => {
    // Compare physical points and frame axes, including soles and head aim;
    // rendering attributes alone do not expose all of the rider's geometry.
    const pose = (rig: Rig) => JSON.parse(JSON.stringify(rig));
    for (const { base, side, rider, stance, label } of everyGrind()) {
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      const start = pose(solveGrindRig(0, plan, mechanics, NEUTRAL).rig);
      for (const t of [-2, -0.9, -0.001]) {
        expect(pose(solveGrindRig(t, plan, mechanics, NEUTRAL).rig), `${label} t=${t}`).toEqual(start);
      }
    }
  });

  it('paints the shoes behind a deck that shows its underside to the camera on the hop', () => {
    // Tipped up for the pop, the deck can show the wheels to the camera while
    // both soles stand on the far side of it. Drawn over the deck, the shoes
    // read as being on the trucks. Swept over the stock camera and the ones the
    // explorer's presets frame it from (head-on, behind).
    const cameras = [{ yaw: -26, pitch: 9, lens: 1 }, { yaw: -70, pitch: 7, lens: 1 }, { yaw: 58, pitch: 14, lens: 0.85 }];
    const look = { body: '#5b8def', accent: '#f2a541', variant: 0 as const };
    let underside = 0;
    const wrong: string[] = [];
    for (const { base, side, rider, label } of everyGrind()) {
      const { plan, mechanics } = planFor(base, side, 'regular', rider, null);
      if (plan.entry) continue;
      for (const camera of cameras) {
        for (let t = plan.pop; t < plan.lockAt; t += 0.02) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const cam = makeCamera(grindCameraLift(plan, t, frame.rail, 0), camera);
          const deckCenter = rig.board.point({ x: 0, y: 0, z: 0 });
          // Past the crossfade band: comfortably showing the underside.
          if (facing(cam, deckCenter, rig.board.dir({ x: 0, y: -1, z: 0 })) > -0.06) continue;
          underside++;
          const keys = drawRobot(cam, rig, look, 'focus', createElement('g', { key: 'board' })).map((el) => String(el.key));
          const board = keys.indexOf('board');
          for (const leg of ['legFar', 'legNear']) {
            if (keys.indexOf(`${leg}Behind`) < 0 || keys.indexOf(`${leg}Behind`) > board) wrong.push(`${label} ${camera.yaw}° t=${t.toFixed(2)} ${leg}`);
          }
        }
      }
    }
    expect(underside).toBeGreaterThan(0);
    expect(wrong.slice(0, 5)).toEqual([]);
  }, 30_000);

  it('keeps the far wheels behind the bar and the near ones in front, whichever side of the deck the camera sees', () => {
    // A tilted 5-0 or a slide filmed low shows the camera the deck's
    // underside. The far wheels must still go behind the bar there, not over
    // it, and the deck under the whole running gear.
    const cameras = [{ yaw: -26, pitch: 9, lens: 1 }, { yaw: -50, pitch: 0, lens: 1 }, { yaw: -75, pitch: 4, lens: 1 }, { yaw: 60, pitch: 0, lens: 1 }];
    const look = { graphic: '#f2a541', stripe: '#ffffff' };
    const bar = { el: createElement('g'), cover: createElement('g'), clipId: 'bar', z: BAR_Z, top: BAR_TOP_Y };
    const keysOf = (node: unknown): string[] => {
      if (Array.isArray(node)) return node.flatMap(keysOf);
      return node && typeof node === 'object' && 'key' in node ? [String((node as { key: unknown }).key)] : [];
    };
    const seen = { top: 0, underside: 0 };
    const wrong: string[] = [];
    for (const { base, side, rider, stance, label } of everyGrind()) {
      if (stance !== 'regular') continue;
      const { plan, mechanics } = planFor(base, side, stance, rider, null);
      for (const camera of cameras) {
        for (let t = plan.lockAt; t < plan.off; t += 0.1) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const cam = makeCamera(grindCameraLift(plan, t, frame.rail, 0), camera);
          const board = drawBoard(cam, rig.board, look, { angle: 0, sweep: 0 }, bar);
          const keys = keysOf((board.props as { children: unknown }).children);
          const at = (key: string) => keys.indexOf(key);
          const fromAbove = at('deck') > at('bar');
          seen[fromAbove ? 'top' : 'underside']++;
          if (!fromAbove && at('deck') !== 0) wrong.push(`${label} ${camera.yaw}° t=${t.toFixed(2)}: deck over the gear from below`);
          for (const tx of [-WHEEL_X, WHEEL_X]) {
            for (const wz of [-WHEEL_Z, WHEEL_Z]) {
              const far = rig.board.point({ x: tx, y: WHEEL_Y, z: wz }).z < BAR_Z - 0.5;
              if (far !== at(`wheel${tx}${wz}`) < at('bar')) wrong.push(`${label} ${camera.yaw}° t=${t.toFixed(2)} wheel ${tx},${wz}`);
            }
          }
        }
      }
    }
    expect(seen.top).toBeGreaterThan(0);
    expect(seen.underside).toBeGreaterThan(0);
    expect(wrong.slice(0, 5)).toEqual([]);
  }, 30_000);

  it('never stretches a leg, and keeps the soles on the grip until a slip', () => {
    const sweep = sweepBounds();
    for (const { base, side, rider, stance, label } of everyGrind()) {
      for (const fall of OUTCOMES) {
        const { plan, mechanics } = planFor(base, side, stance, rider, fall);
        for (let t = 0; t <= plan.end; t += 0.04) {
          // The drop off the bar blends two poses; the legs are whole on both ends of it.
          if (plan.fail != null && t > plan.fail && t < plan.fail + plan.drop) continue;
          const { rig, falling } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const where = `${label} ${fall ?? 'landed'} t=${t.toFixed(2)}`;
          for (const leg of rig.legs) {
            sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
            sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
            // A leg (all but) straight can't follow a popped tail down any
            // further: the planted foot eases off it over the last few units.
            const straight = dist(leg.hip, leg.ankle) > THIGH + SHIN - 4.5;
            if (falling || straight) continue;
            const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
            sweep.below('sole height', Math.abs(sole.y - deckTopY(sole.x)), 0.5, `${where} ${leg.side} sole`);
            sweep.below('sole width', Math.abs(sole.z), DECK_HALF_WIDTH + 2, `${where} ${leg.side} on deck`);
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('moves every joint continuously: no pops onto the bar, off it, or into a slip', () => {
    const sweep = sweepBounds();
    // Worst joint acceleration between 120 Hz frames, as the flatground test.
    // The allowed jolts are the two snaps: the tail off the ground and off the bar.
    const dt = 1 / 120;
    const joints = (rig: Rig) => [
      rig.head.origin, rig.torso.origin,
      ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
      ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
    ];
    for (const base of GRIND_BASES) {
      for (const side of SIDES) {
        for (const stance of ['regular', 'nollie'] as Stance[]) {
          for (const fall of OUTCOMES) {
            const { plan, mechanics } = planFor(base, side, stance, 'regular', fall);
            const snaps = [plan.pop, plan.off];
            let prev2: V3[] | null = null;
            let prev: V3[] | null = null;
            for (let t = 0; t <= plan.end; t += dt) {
              const now = joints(solveGrindRig(t, plan, mechanics, NEUTRAL).rig);
              const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
              if (prev && prev2 && !nearSnap) {
                for (let i = 0; i < now.length; i++) {
                  const jerk = dist(add3(now[i], prev2[i]), scale3(prev[i], 2));
                  sweep.below('joint acceleration', jerk, 10, `${side} ${base} ${stance} ${fall ?? 'landed'} joint ${i} t=${t.toFixed(3)}`);
                }
              }
              prev2 = prev;
              prev = now;
            }
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('keeps the robot inside the stage for every grind, side, stance, outcome, and pop style', () => {
    // Worst reach past each edge, with where it happened.
    const worst = { top: [-Infinity, ''], bottom: [-Infinity, ''], left: [-Infinity, ''], right: [-Infinity, ''] } as Record<string, [number, string]>;
    const push = (edge: string, over: number, where: string) => {
      if (over > worst[edge][0]) worst[edge] = [over, where];
    };
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const { base, side, rider, stance, label } of everyGrind()) {
        for (const fall of OUTCOMES) {
          const { plan, mechanics } = planFor(base, side, stance, rider, fall, style);
          for (let t = 0; t <= plan.end; t += 0.06) {
            const { rig, frame, falling } = solveGrindRig(t, plan, mechanics, style);
            const sink = falling ? fallSink(GROUND - rig.head.origin.y) : 0;
            const cam = makeCamera(grindCameraLift(plan, t, frame.rail, sink));
            const where = `${label} ${fall ?? 'landed'} pop ${popHeight} t=${t.toFixed(2)}`;
            push('top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, where);
            const extremes = [
              ...[-1, 1].flatMap((a) => [-1, 1].map((b) => rig.head.at(a * 14, 15, b * 18))),
              ...rig.legs.map((leg) => leg.shoe.origin),
              ...rig.arms.map((arm) => arm.hand),
              // A slipped board may skid out of shot, like a flatground board shooting
              // out, and the pop snaps its end past the frame's foot for a few frames,
              // as a flatground pop does.
              ...(falling || (t >= plan.pop && t < plan.pop + POP_SNAP_T)
                ? []
                : [rig.board.point({ x: 48, y: 0, z: 0 }), rig.board.point({ x: -48, y: 0, z: 0 })]),
            ];
            for (const p of extremes) {
              const pp = cam.project(p);
              push('bottom', pp.y - H, where);
              push('left', -pp.x, where);
              push('right', pp.x - W, where);
            }
          }
        }
      }
    }
    for (const [edge, [over, where]] of Object.entries(worst)) expect(over, `${edge}: ${where}`).toBeLessThan(0);
  }, 60_000);

  it('renders finite geometry for every grind and outcome, and holds the t = 0 pose through a lead-in', () => {
    const robot: Robot = { id: 't', name: 'T', avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 } };
    const render = (base: string, landed: boolean, fall: FallVariant, t: number, stance: Stance = 'regular') =>
      renderToStaticMarkup(createElement(TrickScene, {
        robot, trick: { id: 'x', name: base, base, stance }, landed, fallVariant: fall, riderStance: 'goofy', fixedTime: t,
        leadIn: { seconds: 2, label: 'Lead-in' }, onDone: () => {},
      }));
    const pose = (html: string) =>
      html.replace(/(data-time|data-bar-x0|data-wheel-roll|aria-label)="[^"]*"/g, '').replace(/<svg[\s\S]*<\/svg>/, '');
    for (const base of GRIND_BASES) {
      for (const side of SIDES) {
        const name = nameOf(base, side);
        for (const fall of FALLS) {
          const { plan } = planFor(base, side, 'regular', 'goofy', fall);
          for (const t of [plan.lockAt + 0.3, plan.end]) {
            expect(render(name, false, fall, t), `${name} ${fall} t=${t}`).not.toMatch(/NaN|Infinity/);
          }
        }
        const start = render(name, true, 'slam', 0);
        expect(start).toContain(`data-grind="${side} ${base}"`);
        expect(pose(render(name, true, 'slam', -1.2)), name).toBe(pose(start));
      }
    }
  }, 30_000);
});

describe('Trick into grind', () => {
  // Board-only tricks: a flip, a shuv, both, and the longest combinations.
  const ENTRIES = ['Kickflip', 'Heelflip', 'Pop Shuvit', 'Frontside Shuvit', 'Hardflip', '360 Flip', 'Double Kickflip'];
  // One of each way of riding the bar: on both trucks, one truck, a slide, a kick, a blunt.
  const GRINDS = ['50-50 Grind', 'Nosegrind', 'Smith Grind', 'Boardslide', 'Lipslide', 'Noseslide', 'Bluntslide'];

  function* everyEntry() {
    for (const entry of ENTRIES) {
      for (const base of GRINDS) {
        for (const side of SIDES) {
          for (const rider of RIDERS) {
            for (const stance of STANCES) {
              yield { entry, base, side, rider, stance, label: `${entry} into ${side} ${base} ${stance} ${rider}` };
            }
          }
        }
      }
    }
  }

  function entryPlan(
    entry: string, base: string, side: GrindSide, stance: Stance, rider: RiderStance,
    fall: FallVariant | null, style: SkateStyle = NEUTRAL,
  ) {
    const spec = grindSpecFor({ base: joinGrindBase(entry, nameOf(base, side)), stance })!;
    const mechanics = resolveRiderMechanics(rider, stance);
    return { spec, mechanics, plan: planGrind(spec, mechanics, style, fall == null, fall ?? 'slam') };
  }

  it('names the trick and the grind it goes into, and only accepts tricks that keep the board level', () => {
    expect(splitGrindBase('Kickflip into Frontside Lipslide')).toEqual({ entry: 'Kickflip', grind: 'Frontside Lipslide', exit: null });
    expect(splitGrindBase('Frontside Lipslide')).toEqual({ entry: null, grind: 'Frontside Lipslide', exit: null });
    expect(joinGrindBase('Kickflip', 'Frontside Lipslide')).toBe('Kickflip into Frontside Lipslide');

    const spec = grindSpecFor({ base: 'Kickflip into Backside Smith Grind', stance: 'regular' });
    expect(spec?.base).toBe('Smith Grind');
    expect(spec?.side).toBe('backside');
    expect(spec?.entry?.base).toBe('Kickflip');
    expect(grindSpecFor({ base: 'Backside Smith Grind', stance: 'regular' })?.entry).toBeNull();

    for (const entry of ENTRIES) expect(canEnterGrind(entry), entry).toBe(true);
    // Dolphin flips and impossibles pitch the board end over end.
    for (const entry of ['Ollie', 'Impossible', 'Dolphin Flip', 'Not A Trick']) {
      expect(canEnterGrind(entry), entry).toBe(false);
      expect(grindSpecFor({ base: joinGrindBase(entry, 'Frontside Lipslide'), stance: 'regular' }), entry).toBeNull();
    }
    expect(grindSpecFor({ base: 'Kickflip into Kickflip', stance: 'regular' })).toBeNull();
  });

  it('leaves the lock, the bar contact, and the pop off exactly as the plain grind has them', () => {
    for (const { entry, base, side, rider, stance, label } of everyEntry()) {
      const plain = planFor(base, side, stance, rider, null).plan;
      const { plan, spec, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      expect(plan.lock, label).toEqual(plain.lock);
      expect(plan.lockCenter, label).toEqual(plain.lockCenter);
      expect(plan.laneZ, label).toBe(plain.laneZ);
      expect(plan.off - plan.lockAt, label).toBeCloseTo(plain.off - plain.lockAt, 9);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += 0.1) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        // A deck shuved half way round is the same deck: its bearing is the local point that lands where the plain grind's does.
        const bearing = rotX(rotY(spec.contact.at, -frame.spin.yaw), -frame.spin.flip);
        expect(rig.board.point(bearing).z, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_Z, 6);
      }
    }
  });

  it('turns the deck under the feet through the hop and has it settled by the lock', () => {
    for (const { entry, base, side, rider, stance, label } of everyEntry()) {
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      const flips = /flip|Double/i.test(entry);
      const shuvs = /Shuvit|Hardflip|360 Flip/.test(entry);
      let flipReach = 0;
      let yawReach = 0;
      for (let t = plan.pop; t <= plan.lockAt; t += 0.01) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        flipReach = Math.max(flipReach, Math.abs(frame.spin.flip));
        yawReach = Math.max(yawReach, Math.abs(frame.spin.yaw));
        expect(rig.board.flipDeg, label).toBeCloseTo(frame.pose.roll + frame.spin.flip, 6);
      }
      if (flips) expect(flipReach, label).toBeGreaterThan(300);
      if (shuvs) expect(yawReach, label).toBeGreaterThan(170);
      for (const t of [plan.lockAt, plan.off, plan.land, plan.end]) {
        const { flip, yaw } = solveGrindRig(t, plan, mechanics, NEUTRAL).frame.spin;
        expect(flip, `${label} t=${t}`).toBeCloseTo(0, 6);
        expect(Math.abs(yaw) === 0 || Math.abs(yaw) === 180, `${label} t=${t} yaw=${yaw}`).toBe(true);
      }
    }
  }, 20_000);

  it('takes the feet off the deck only while it turns, and keeps the soles on the grip otherwise', () => {
    for (const { entry, base, side, rider, stance, label } of everyEntry()) {
      const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null);
      let lifted = 0;
      for (let t = 0; t <= plan.end; t += 0.02) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        lifted = Math.max(lifted, frame.offDeck);
        if (frame.offDeck > 0) expect(frame.phase, label).toBe('up');
        // The pop and the trick are the flatground rider's, whose feet leave
        // the deck as it snaps up, before it starts to turn.
        if (frame.offDeck > 0.001 || (t >= plan.pop && t < plan.lockAt)) continue;
        for (const leg of rig.legs) {
          const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
          expect(Math.abs(sole.y - deckTopY(sole.x)), `${label} t=${t.toFixed(2)}`).toBeLessThan(0.5);
        }
      }
      expect(lifted, label).toBeGreaterThan(0.9);
    }
  }, 60_000);

  it('never stretches a leg, and flicks the right foot out for a kickflip or a heelflip', () => {
    const sweep = sweepBounds();
    for (const { entry, base, side, rider, stance, label } of everyEntry()) {
      for (const fall of [null, 'slam'] as Array<FallVariant | null>) {
        const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, fall);
        for (let t = 0; t <= plan.end; t += 0.03) {
          if (plan.fail != null && t > plan.fail && t < plan.fail + plan.drop) continue;
          const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          for (const leg of rig.legs) {
            sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, `${label} t=${t.toFixed(2)}`);
            sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, `${label} t=${t.toFixed(2)}`);
            if (frame.flickOut > 0.9 && leg.flicking && (entry === 'Kickflip' || entry === 'Heelflip')) {
              // Out past the rail: heelside for a kickflip, toeside for a heelflip.
              // (Measured across the world, since the flipping deck's own sides swap.)
              const across = leg.shoe.origin.z - rig.board.center.z;
              expect(Math.sign(across) * rig.toeDir, `${label} t=${t.toFixed(2)}`).toBe(entry === 'Heelflip' ? 1 : -1);
              expect(Math.abs(across), label).toBeGreaterThan(DECK_HALF_WIDTH - 3);
            }
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('never puts the board through the bar or its posts', () => {
    const sweep = sweepBounds();
    const inside = (p: V3, x0: number, x1: number, top: number, bottom: number, half: number) =>
      p.x > x0 && p.x < x1 && p.y > top && p.y < bottom && Math.abs(p.z - BAR_Z) < half;
    // The longest reach (a shuv sweeps the whole deck across), the most hang, and the flips.
    const swept = ['Kickflip', 'Frontside Shuvit', '360 Flip', 'Double Kickflip'];
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      for (const { entry, base, side, rider, stance, label } of everyEntry()) {
        if (!swept.includes(entry)) continue;
        const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, null, style);
        for (let t = plan.pop; t <= plan.lockAt + 0.02; t += 1 / 60) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
          const { x0, x1 } = barSpan(plan, frame.streetDist);
          const posts = [x0 + 46, x1 - 46];
          for (const p of boardSamples(rig)) {
            const where = `${label} pop ${popHeight} t=${t.toFixed(3)}`;
            sweep.below('bar intersections', Number(inside(p, x0, x1, BAR_TOP_Y + 0.4, BAR_TOP_Y + 2 * BAR_HALF, BAR_HALF - 0.4)), 1, where);
            for (const px of posts) sweep.below('post intersections', Number(inside(p, px - 1.7, px + 1.7, BAR_TOP_Y, GROUND, 1.7)), 1, where);
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('moves every joint continuously, and keeps the robot inside the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    const joints = (rig: Rig) => [
      rig.head.origin, rig.torso.origin,
      ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
      ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
    ];
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const { entry, base, side, rider, stance, label } of everyEntry()) {
        if (stance === 'fakie' || stance === 'switch') continue;
        for (const fall of [null, 'slam'] as Array<FallVariant | null>) {
          const { plan, mechanics } = entryPlan(entry, base, side, stance, rider, fall, style);
          const snaps = [plan.pop, plan.off];
          let prev2: V3[] | null = null;
          let prev: V3[] | null = null;
          for (let t = 0; t <= plan.end; t += dt) {
            const { rig, frame, falling } = solveGrindRig(t, plan, mechanics, style);
            const now = joints(rig);
            const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
            if (prev && prev2 && !nearSnap) {
              for (let i = 0; i < now.length; i++) {
                const jerk = dist(add3(now[i], prev2[i]), scale3(prev[i], 2));
                sweep.below('joint acceleration', jerk, 10, `${label} ${fall ?? 'landed'} pop ${popHeight} joint ${i} t=${t.toFixed(3)}`);
              }
            }
            prev2 = prev;
            prev = now;
            if (Math.round(t / dt) % 6 !== 0) continue;
            const sink = falling ? fallSink(GROUND - rig.head.origin.y) : 0;
            const cam = makeCamera(grindCameraLift(plan, t, frame.rail, sink));
            const where = `${label} ${fall ?? 'landed'} pop ${popHeight} t=${t.toFixed(2)}`;
            sweep.below('stage top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, 0, `top ${where}`);
            for (const p of [...rig.legs.map((leg) => leg.shoe.origin), ...rig.arms.map((arm) => arm.hand)]) {
              const pp = cam.project(p);
              sweep.below('stage bottom', pp.y - H, 0, `bottom ${where}`);
              sweep.below('stage left', -pp.x, 0, `left ${where}`);
              sweep.below('stage right', pp.x - W, 0, `right ${where}`);
            }
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('renders finite geometry and stamps the entry trick on the scene', () => {
    const robot: Robot = { id: 't', name: 'T', avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 } };
    for (const entry of ENTRIES) {
      const base = joinGrindBase(entry, 'Backside Lipslide');
      const { plan } = entryPlan(entry, 'Lipslide', 'backside', 'regular', 'goofy', null);
      for (const t of [0, plan.pop + 0.15, (plan.pop + plan.lockAt) / 2, plan.lockAt, plan.end]) {
        const html = renderToStaticMarkup(createElement(TrickScene, {
          robot, trick: { id: 'x', name: base, base, stance: 'regular' }, landed: true, riderStance: 'goofy', fixedTime: t, onDone: () => {},
        }));
        expect(html, `${base} t=${t}`).not.toMatch(/NaN|Infinity/);
        expect(html).toContain(`data-grind-entry="${entry}"`);
      }
    }
  });

  it('gives the trick room in the hop and the timeline: more hang time than the plain grind, and a mid-trick moment before the lock', () => {
    for (const { entry, base, side, rider, stance, label } of everyEntry()) {
      const plain = planFor(base, side, stance, rider, null).plan;
      const { plan } = entryPlan(entry, base, side, stance, rider, null);
      expect(plan.upT, label).toBeGreaterThan(plain.upT);
      const mid = grindTimelineFor(
        { base: joinGrindBase(entry, nameOf(base, side)), stance }, rider, NEUTRAL, true, 'slam',
      )?.trickIn;
      expect(mid, label).toBeGreaterThan(plan.pop);
      expect(mid, label).toBeLessThan(plan.lockAt);
    }
  });
});

describe('Grind timeline', () => {
  it('holds the lock long enough to read, and ends on the ground', () => {
    for (const { base, side, rider, stance, label } of everyGrind()) {
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

describe('Spin into grind', () => {
  // The rider turns: half way (180s, bigspins, a frontside flip) or all the way round (360s).
  const SPINS = ['Frontside 180', 'Backside 180', 'Bigspin', 'FS Bigspin', 'Frontside 360', 'Backside 360', 'Frontside Flip'];
  const HALF = new Set(['Frontside 180', 'Backside 180', 'Bigspin', 'FS Bigspin', 'Frontside Flip']);
  const GRINDS = ['50-50 Grind', '5-0 Grind', 'Nosegrind', 'Crooked Grind', 'Smith Grind', 'Boardslide', 'Tailslide', 'Bluntslide'];
  const AFTER_HALF: Record<Stance, Stance> = { regular: 'fakie', nollie: 'fakie', fakie: 'regular', switch: 'switch' };

  function* everySpin(stances: Stance[] = STANCES) {
    for (const entry of SPINS) {
      for (const base of GRINDS) {
        for (const side of SIDES) {
          for (const rider of RIDERS) {
            for (const stance of stances) {
              yield { entry, base, side, rider, stance, label: `${entry} into ${side} ${base} ${stance} ${rider}` };
            }
          }
        }
      }
    }
  }

  function spinPlan(
    entry: string, base: string, side: GrindSide, stance: Stance, rider: RiderStance,
    fall: FallVariant | null, style: SkateStyle = NEUTRAL,
  ) {
    const spec = grindSpecFor({ base: joinGrindBase(entry, nameOf(base, side)), stance })!;
    const mechanics = resolveRiderMechanics(rider, stance);
    return { spec, mechanics, plan: planGrind(spec, mechanics, style, fall == null, fall ?? 'slam') };
  }

  it('accepts 180s, 360s, and bigspins, and names the grind as the rider rides it after the spin', () => {
    for (const entry of SPINS) expect(canEnterGrind(entry), entry).toBe(true);
    const spec = grindSpecFor({ base: 'Backside 180 into Frontside Nosegrind', stance: 'regular' });
    expect(spec?.entry?.base).toBe('Backside 180');
    expect(spec?.base).toBe('Nosegrind');
    expect(spec?.side).toBe('frontside');
    // Spun round, the rider rides it frontside, so they rolled in with the bar on the heelside.
    expect(spec?.reversed).toBe(true);
    expect(spec?.toesideApproach).toBe(false);
    expect(grindSpecFor({ base: 'Backside 360 into Frontside Nosegrind', stance: 'regular' })?.toesideApproach).toBe(true);
  });

  it('rolls in with the bar on the other side of the rider after a half turn, and the named side after a full one', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin()) {
      const { plan } = spinPlan(entry, base, side, stance, rider, null);
      const barToward = Math.sign(BAR_Z - plan.laneZ);
      const onToeside = (side === 'frontside') !== HALF.has(entry);
      expect(barToward, label).toBe(onToeside ? plan.toeDir : -plan.toeDir);
    }
  });

  it('locks in exactly as the grind the spin leaves them riding: fakie after a 180 or a bigspin, turned to face the way they travel', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin()) {
      const { plan } = spinPlan(entry, base, side, stance, rider, null);
      const half = HALF.has(entry);
      expect(Math.abs(plan.heading), label).toBe(half ? 180 : 360);
      // The plain grind from the stance they land in. Fakie only reverses travel,
      // so its toeside matches; switch stays switch and just rides backwards.
      const after = half ? AFTER_HALF[stance] : stance;
      const plain = planFor(base, side, after, rider, null).plan;
      expect(plan.lock.yaw - plan.heading, label).toBeCloseTo(plain.lock.yaw, 9);
      expect(plan.lock.pitch, label).toBe(plain.lock.pitch);
      expect(plan.lock.roll, label).toBeCloseTo(plain.lock.roll, 9);
      // Turned half way round about the bar, the board sits across it the other way.
      expect(plan.lockCenter.y, label).toBeCloseTo(plain.lockCenter.y, 9);
      expect(plan.lockCenter.z - BAR_Z, label).toBeCloseTo((half ? -1 : 1) * (plain.lockCenter.z - BAR_Z), 9);
    }
  });

  it('keeps the riding part on the bar, and rides away the other way round', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular', 'fakie'])) {
      const { spec, plan, mechanics } = spinPlan(entry, base, side, stance, rider, null);
      for (let t = plan.lockAt; t < plan.off - 0.08; t += 0.1) {
        const { rig, frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        const bearing = rotX(rotY(spec.contact.at, -frame.spin.yaw), -frame.spin.flip);
        expect(rig.board.point(bearing).z, `${label} t=${t.toFixed(2)}`).toBeCloseTo(BAR_Z, 6);
      }
      const start = solveGrindRig(0, plan, mechanics, NEUTRAL).rig;
      const end = solveGrindRig(plan.end, plan, mechanics, NEUTRAL);
      expect(end.rig.bodyYawDeg - start.bodyYawDeg, label).toBeCloseTo(plan.heading, 6);
      // A half turn swaps which end leads: the nose trails riding away from a regular roll-in, and leads out of a fakie one.
      const leads = (yaw: number) => rotY({ x: 1, y: 0, z: 0 }, yaw).x * spec.dir;
      expect(leads(end.frame.pose.yaw), label).toBeCloseTo((HALF.has(entry) ? -1 : 1) * leads(0), 6);
    }
  });

  it('carries the board round under planted feet for a 180 or a 360, and shuvs it out from under them for a bigspin', () => {
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular'])) {
      const { plan, mechanics } = spinPlan(entry, base, side, stance, rider, null);
      let yawReach = 0;
      let lifted = 0;
      for (let t = plan.pop; t <= plan.lockAt; t += 0.01) {
        const { frame } = solveGrindRig(t, plan, mechanics, NEUTRAL);
        yawReach = Math.max(yawReach, Math.abs(frame.spin.yaw));
        lifted = Math.max(lifted, frame.offDeck);
      }
      const bigspin = /Bigspin/.test(entry);
      const flip = /Flip/.test(entry);
      expect(yawReach, label).toBeCloseTo(bigspin ? 180 : 0, 0);
      expect(lifted > 0.9, label).toBe(bigspin || flip);
    }
  });

  it('never stretches a leg, keeps the soles on the grip off the hop, moves continuously, and stays in the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    const joints = (rig: Rig) => [
      rig.head.origin, rig.torso.origin,
      ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
      ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
    ];
    for (const { entry, base, side, rider, stance, label } of everySpin(['regular', 'fakie', 'nollie'])) {
      for (const fall of [null, 'slam', 'bail'] as Array<FallVariant | null>) {
        const { plan, mechanics } = spinPlan(entry, base, side, stance, rider, fall);
        const snaps = [plan.pop, plan.off];
        let prev2: V3[] | null = null;
        let prev: V3[] | null = null;
        for (let t = 0; t <= plan.end; t += dt) {
          const { rig, frame, falling } = solveGrindRig(t, plan, mechanics, NEUTRAL);
          const where = `${label} ${fall ?? 'landed'} t=${t.toFixed(3)}`;
          const now = joints(rig);
          const nearSnap = snaps.some((s) => t > s - 0.09 && t < s + 2 * dt);
          if (prev && prev2 && !nearSnap) {
            for (let i = 0; i < now.length; i++) {
              sweep.below('joint acceleration', dist(add3(now[i], prev2[i]), scale3(prev[i], 2)), 10, `${where} joint ${i}`);
            }
          }
          prev2 = prev;
          prev = now;
          if (Math.round(t / dt) % 6 !== 0) continue;
          const dropping = plan.fail != null && t > plan.fail && t < plan.fail + plan.drop;
          for (const leg of rig.legs) {
            if (!dropping) {
              sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
              sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
            }
            if (falling || (t >= plan.pop && t < plan.lockAt)) continue;
            const sole = toBoard(rig, leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0));
            sweep.below('sole height', Math.abs(sole.y - deckTopY(sole.x)), 0.5, `${where} sole`);
          }
          const sink = falling ? fallSink(GROUND - rig.head.origin.y) : 0;
          const cam = makeCamera(grindCameraLift(plan, t, frame.rail, sink));
          sweep.below('stage top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, 0, `top ${where}`);
          for (const p of [...rig.legs.map((leg) => leg.shoe.origin), ...rig.arms.map((arm) => arm.hand)]) {
            const pp = cam.project(p);
            sweep.below('stage bottom', pp.y - H, 0, `bottom ${where}`);
            sweep.below('stage left', -pp.x, 0, `left ${where}`);
            sweep.below('stage right', pp.x - W, 0, `right ${where}`);
          }
        }
      }
    }
    sweep.verify();
  }, 30_000);
});

describe('Trick out of grind', () => {
  // Board-only tricks (a flip, a shuv, both), the rider's own half turn, a flip on it, and a bigspin's of both.
  const EXITS = [
    'Kickflip', 'Heelflip', 'Pop Shuvit', 'Frontside Shuvit', '360 Flip', 'Backside 180', 'Frontside 180',
    'Backside Flip', 'Frontside Flip', 'Backside Heelflip', 'Frontside Heelflip', 'Bigspin', 'FS Bigspin',
  ];
  /** Exits that turn the rider round to ride away the other way. */
  const TURNS = /180|side (Flip|Heelflip)|Bigspin/;
  // Every grind by what rides the bar: centered on it, or one end of the board.
  const BOTH_ENDS = ['50-50 Grind', 'Boardslide', 'Lipslide'];
  const TAIL_END = ['5-0 Grind', 'Smith Grind', 'Feeble Grind', 'Salad Grind', 'Suski Grind', 'Tailslide', 'Bluntslide'];
  const NOSE_END = ['Nosegrind', 'Crooked Grind', 'Overcrooked Grind', 'Willy Grind', 'Noseslide', 'Noseblunt Slide'];
  // One of each way of riding the bar: both trucks, a truck at each end, a slide, a kick at each end, a blunt.
  const GRINDS = ['50-50 Grind', '5-0 Grind', 'Crooked Grind', 'Boardslide', 'Tailslide', 'Noseslide', 'Bluntslide'];

  function* everyExit(stances: Stance[] = STANCES, exits: string[] = EXITS) {
    for (const exit of exits) {
      for (const base of GRINDS) {
        for (const end of exitEndsFor(base)) {
          for (const side of SIDES) {
            for (const rider of RIDERS) {
              for (const stance of stances) {
                yield { exit, end, base, side, rider, stance, label: `${side} ${base} ${end === 'nose' ? 'Nollie ' : ''}${exit} Out ${stance} ${rider}` };
              }
            }
          }
        }
      }
    }
  }

  function exitPlan(
    exit: string, end: PopEnd, base: string, side: GrindSide, stance: Stance, rider: RiderStance,
    fall: FallVariant | null, style: SkateStyle = NEUTRAL, entry?: string,
  ) {
    const grind = joinGrindExit(nameOf(base, side), exit, end);
    const spec = grindSpecFor({ base: entry ? joinGrindBase(entry, grind) : grind, stance })!;
    const mechanics = resolveRiderMechanics(rider, stance);
    return { spec, mechanics, plan: planGrind(spec, mechanics, style, fall == null, fall ?? 'slam') };
  }

  const joints = (rig: Rig) => [
    rig.head.origin, rig.torso.origin,
    ...rig.legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]),
    ...rig.arms.flatMap((arm) => [arm.elbow, arm.hand]),
  ];

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
    for (const { exit, end, base, side, rider, stance, label } of everyExit(STANCES, ['Kickflip', 'Backside 180', 'Bigspin'])) {
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
    for (const { exit, end, base, side, rider, stance, label } of everyExit(['regular', 'switch'])) {
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
      const start = solveGrindRig(0, plan, mechanics, NEUTRAL).rig;
      const done = solveGrindRig(plan.end, plan, mechanics, NEUTRAL).rig;
      expect(done.bodyYawDeg - start.bodyYawDeg, label).toBeCloseTo(plan.endHeading, 6);
    }
  });

  it('takes the feet off the deck only while it turns, and flicks with the foot off the other end', () => {
    for (const { exit, end, base, side, rider, stance, label } of everyExit(STANCES, ['Kickflip', 'Heelflip', 'Pop Shuvit', 'Backside 180', 'Backside Flip', 'Frontside Heelflip', 'Bigspin'])) {
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
  }, 60_000);

  it('never puts the board through the bar or its posts popping out', () => {
    const sweep = sweepBounds();
    const inside = (p: V3, x0: number, x1: number, top: number, bottom: number, half: number) =>
      p.x > x0 && p.x < x1 && p.y > top && p.y < bottom && Math.abs(p.z - BAR_Z) < half;
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1 });
      for (const { exit, end, base, side, rider, stance, label } of everyExit(['regular', 'fakie', 'switch'])) {
        const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, style);
        for (let t = plan.off - 0.1; t <= plan.land; t += 1 / 60) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
          const { x0, x1 } = barSpan(plan, frame.streetDist);
          const posts = [x0 + 46, x1 - 46];
          for (const p of boardSamples(rig)) {
            const where = `${label} pop ${popHeight} t=${t.toFixed(3)}`;
            sweep.below('bar intersections', Number(inside(p, x0, x1, BAR_TOP_Y + 0.4, BAR_TOP_Y + 2 * BAR_HALF, BAR_HALF - 0.4)), 1, where);
            for (const px of posts) sweep.below('post intersections', Number(inside(p, px - 1.7, px + 1.7, BAR_TOP_Y, GROUND, 1.7)), 1, where);
          }
        }
      }
    }
    sweep.verify();
  }, 60_000);

  it('never stretches a leg, moves every joint continuously, and keeps the robot inside the stage', () => {
    const sweep = sweepBounds();
    const dt = 1 / 120;
    for (const popHeight of [0.45, 1.15]) {
      const style = resolveSkateStyle({ popHeight, rotationSpeed: 1, flickStrength: 1.25 });
      for (const { exit, end, base, side, rider, stance, label } of everyExit(['regular', 'fakie'])) {
        const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, style);
        let prev2: V3[] | null = null;
        let prev: V3[] | null = null;
        // From the lock on: the hop on is the plain grind's, swept above.
        for (let t = plan.lockAt; t <= plan.end; t += dt) {
          const { rig, frame } = solveGrindRig(t, plan, mechanics, style);
          const where = `${label} pop ${popHeight} t=${t.toFixed(3)}`;
          const now = joints(rig);
          const nearSnap = t > plan.off - 0.09 && t < plan.off + 2 * dt;
          if (prev && prev2 && !nearSnap) {
            for (let i = 0; i < now.length; i++) {
              sweep.below('joint acceleration', dist(add3(now[i], prev2[i]), scale3(prev[i], 2)), 10, `${where} joint ${i}`);
            }
          }
          prev2 = prev;
          prev = now;
          if (Math.round(t / dt) % 6 !== 0) continue;
          for (const leg of rig.legs) {
            sweep.below('thigh length error', Math.abs(dist(leg.hip, leg.knee) - THIGH), 0.5e-6, where);
            sweep.below('shin length error', Math.abs(dist(leg.knee, leg.ankle) - SHIN), 0.5e-6, where);
          }
          const cam = makeCamera(grindCameraLift(plan, t, frame.rail, 0));
          sweep.below('stage top', -SKY_PAD - cam.project(rig.head.at(0, 28, 0)).y, 0, `top ${where}`);
          for (const p of [...rig.legs.map((leg) => leg.shoe.origin), ...rig.arms.map((arm) => arm.hand)]) {
            const pp = cam.project(p);
            sweep.below('stage bottom', pp.y - H, 0, `bottom ${where}`);
            sweep.below('stage left', -pp.x, 0, `left ${where}`);
            sweep.below('stage right', pp.x - W, 0, `right ${where}`);
          }
        }
      }
    }
    sweep.verify();
  }, 60_000);

  it('gives the trick room: a higher, longer pop off than the plain grind, with a mid-trick moment before landing', () => {
    for (const { exit, end, base, side, rider, stance, label } of everyExit(['regular'])) {
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
    for (const { entry, base, exit, end } of combos) {
      for (const side of SIDES) {
        for (const rider of RIDERS) {
          for (const stance of ['regular', 'nollie'] as Stance[]) {
            const label = `${entry} into ${side} ${base} ${end} ${exit} Out ${stance} ${rider}`;
            const { plan, mechanics } = exitPlan(exit, end, base, side, stance, rider, null, NEUTRAL, entry);
            const into = planFor(base, side, stance, rider, null);
            expect(plan.entry?.trick.base, label).toBe(entry);
            expect(plan.exit?.trick.base, label).toBe(exit);
            let prev2: V3[] | null = null;
            let prev: V3[] | null = null;
            for (let t = 0; t <= plan.end; t += dt) {
              const now = joints(solveGrindRig(t, plan, mechanics, NEUTRAL).rig);
              const nearSnap = [plan.pop, plan.off].some((s) => t > s - 0.09 && t < s + 2 * dt);
              if (prev && prev2 && !nearSnap) {
                for (let i = 0; i < now.length; i++) {
                  sweep.below('joint acceleration', dist(add3(now[i], prev2[i]), scale3(prev[i], 2)), 10, `${label} joint ${i} t=${t.toFixed(3)}`);
                }
              }
              prev2 = prev;
              prev = now;
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
        }
      }
    }
    sweep.verify();
  }, 30_000);

  it('renders finite geometry and stamps the trick out on the scene', () => {
    const robot: Robot = { id: 't', name: 'T', avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 } };
    for (const [base, end, stamp] of [
      ['Backside 5-0 Grind Kickflip Out', 'tail', 'Kickflip'],
      ['Frontside Crooked Grind Nollie Heelflip Out', 'nose', 'Nollie Heelflip'],
      ['Kickflip into Backside Boardslide Nollie 360 Flip Out', 'nose', 'Nollie 360 Flip'],
    ] as const) {
      const spec = grindSpecFor({ base, stance: 'regular' })!;
      expect(spec.exitNose, base).toBe(end === 'nose');
      const plan = planGrind(spec, resolveRiderMechanics('goofy', 'regular'), NEUTRAL, true, 'slam');
      for (const t of [plan.off - 0.1, plan.off + 0.1, (plan.off + plan.land) / 2, plan.land, plan.end]) {
        const html = renderToStaticMarkup(createElement(TrickScene, {
          robot, trick: { id: 'x', name: base, base, stance: 'regular' }, landed: true, riderStance: 'goofy', fixedTime: t, onDone: () => {},
        }));
        expect(html, `${base} t=${t}`).not.toMatch(/NaN|Infinity/);
        expect(html).toContain(`data-grind-exit="${stamp}"`);
      }
    }
  });
});
