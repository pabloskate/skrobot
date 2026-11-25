import { describe, expect, it } from 'vitest';
import { ASPHALT } from '../camera/view';
import { dot3, rad, sub3, type V3 } from '../math';
import { bodyDims, centerOfMass } from '../motion/fall/body';
import { bodyClearance } from '../motion/fall/rollOut';
import { selfContact } from '../motion/fall/selfContact';
import { SHOE_HALF_HEIGHT } from '../motion/skeleton';
import { resolveSkateStyle } from '../motion/style';
import { WASH_OUT_ROLL_END, WASH_OUT_ROLL_START, WASH_OUT_T, X0 } from '../motion/trick';
import { terrainSurface } from '../sets/terrain';
import { soundtrackFor } from '../sound/soundtrack';
import { RIDERS, trickNamed } from '../testing';
import { GRAVITY } from '../units';
import { boardClearance, hipsOf, type StageFrame } from './frameParts';
import { planStage, stageFrame } from './stage';

// Scroll and across follow the rider. Measure momentum relative to the fixed landing.
const world = (frame: StageFrame, point: V3): V3 => ({
  x: frame.scroll + point.x - X0,
  y: point.y,
  z: frame.stairs!.across + point.z,
});

describe('Hollywood High 16 backside 180 wash out', () => {
  it.each(RIDERS)('catches with both feet, skids and falls sideways (%s)', riderStance => {
    const trick = trickNamed('Backside 180');
    const options = { landed: false, riderStance, style: resolveSkateStyle(), fall: 'washout' as const, shankProgress: 0.65, set: 'hollywood-high' as const };
    const stage = planStage(trick, options);
    const made = planStage(trick, { ...options, landed: true });
    const stairs = stage.stairs!;
    const sample = (offset: number) => stageFrame(stage, stairs.land + offset, 1);
    const catchTime = stairs.land - 0.17;
    expect(stageFrame(stage, catchTime, 1).rig.board.center).toEqual(stageFrame(made, catchTime, 1).rig.board.center);
    const cues = soundtrackFor(stage).cues;
    expect(cues[cues.length - 1]).toMatchObject({ kind: 'land', at: stairs.land });
    expect(stage.end).toBeCloseTo(stairs.land + WASH_OUT_T);

    const touch = sample(0);
    const clean = stageFrame(made, stairs.land, 1);
    const nose = { x: 1, y: 0, z: 0 };
    expect(dot3(touch.rig.board.dir(nose), clean.rig.board.dir(nose))).toBeCloseTo(Math.cos(rad(15)));
    for (const [i, leg] of touch.rig.legs.entries()) {
      const grip = clean.rig.legs[i].shoe.origin;
      const center = clean.rig.board.center;
      expect(Math.hypot(leg.shoe.origin.x - touch.rig.board.center.x, leg.shoe.origin.z - touch.rig.board.center.z))
        .toBeCloseTo(Math.hypot(grip.x - center.x, grip.z - center.z));
      expect(leg.shoe.origin.y - touch.rig.board.center.y).toBeCloseTo(grip.y - center.y);
    }

    for (const elapsed of [0, 0.10, 0.25, 0.44, 0.60, 1, WASH_OUT_T]) {
      const frame = sample(elapsed);
      const ground = (x: number, z: number) => ASPHALT - terrainSurface(stairs.terrain, frame.scroll + x - X0, frame.stairs!.across + z);
      expect(boardClearance(frame.rig, p => ground(p.x, p.z))).toBeCloseTo(0);
      expect(bodyClearance(frame.rig, bodyDims(stage.skater), ground)).toBeGreaterThan(-0.01);
    }
    const firstFrame = sample(1 / 60);
    const contact = (leg: number) => {
      const start = touch.rig.legs[leg].shoe.origin.z - touch.rig.board.center.z;
      return Math.abs(firstFrame.rig.legs[leg].shoe.origin.z - firstFrame.rig.board.center.z - start);
    };
    expect(Math.min(contact(0), contact(1))).toBeLessThan(0.8);
    let lowestHip = hipsOf(sample(0.15).rig).y;
    for (let t = 0.15; t <= WASH_OUT_ROLL_START; t += 1 / 60) {
      const y = hipsOf(sample(t).rig).y;
      expect(y).toBeGreaterThan(lowestHip - 1);
      lowestHip = Math.max(lowestHip, y);
    }
    const down = sample(WASH_OUT_ROLL_START);
    const hip = hipsOf(down.rig);
    const floor = ASPHALT - terrainSurface(stairs.terrain, down.scroll + hip.x - X0, down.stairs!.across + hip.z);
    expect(floor - hip.y).toBeLessThan(22);
    const direction = stage.mechanics.orientationSign;
    const last = sample(WASH_OUT_T);
    const sideways = world(last, last.rig.board.center).z - world(touch, touch.rig.board.center).z;
    expect(sideways * direction).toBeGreaterThan(45);
    expect((hipsOf(last.rig).z - last.rig.board.center.z) * direction).toBeLessThan(-55);
    expect(Math.abs(down.rig.torso.up.z)).toBeGreaterThan(0.65);
    expect(down.rig.head.origin.y - touch.rig.head.origin.y).toBeGreaterThan(30);
    expect(sample(WASH_OUT_T + 1).rig.torso.origin).toEqual(last.rig.torso.origin);
  });
});

describe('El Toro kickflip wash out', () => {
  it.each(RIDERS)('carries the approach into the skid while the board rolls away (%s)', riderStance => {
    const stage = planStage(trickNamed('Kickflip'), {
      landed: false, fall: 'washout', set: 'el-toro', riderStance, style: resolveSkateStyle(), shankProgress: 0.65,
    });
    const stairs = stage.stairs!;
    const sample = (offset: number) => stageFrame(stage, stairs.land + offset, 1);
    const deck = (frame: StageFrame) => world(frame, frame.rig.board.center);
    const rider = (frame: StageFrame) => world(frame, centerOfMass(frame.rig));
    const dt = 1 / 60;
    const touch = sample(0);
    const approach = sub3(deck(touch), deck(sample(-dt)));
    const first = sub3(deck(sample(dt)), deck(touch));
    expect(first.x / approach.x).toBeCloseTo(1, 1);
    // A yawed board still arrives on the approach line. Traction takes time to turn its velocity.
    expect(Math.abs(first.z - approach.z)).toBeLessThan(0.1 * approach.x);
    const incomingSpeed = approach.x / dt;
    const carried = sub3(rider(sample(0.2)), rider(sample(0.1)));
    expect(carried.x / 0.1).toBeGreaterThan(0.75 * incomingSpeed);
    // On concrete the rider comes to rest while the unloaded board is still rolling away.
    const last = sample(WASH_OUT_T);
    const previous = sample(WASH_OUT_T - dt);
    expect(Math.abs(rider(last).x - rider(previous).x)).toBeLessThan(0.1);
    expect(deck(last).x - deck(previous).x).toBeGreaterThan(0.25 * approach.x);

    // Once its sideways skid scrubs off, the released board should roll along the trucks.
    const rolling = sample(0.8);
    const travel = sub3(deck(rolling), deck(sample(0.8 - dt)));
    const axle = rolling.rig.board.dir({ x: 0, y: 0, z: 1 });
    const crossTravel = travel.x * axle.x + travel.z * axle.z;
    expect(Math.abs(crossTravel)).toBeLessThan(0.1 * Math.hypot(travel.x, travel.z));
    expect(travel.x).toBeGreaterThan(0);

    // The ground supports the rider through the roll and the return to their feet.
    for (let t = 0.5; t < stage.end - stairs.land; t += 1 / 30) {
      const frame = sample(t);
      const ground = (x: number, z: number) => ASPHALT - terrainSurface(
        stairs.terrain, frame.scroll + x - X0, frame.stairs!.across + z,
      );
      expect(Math.abs(bodyClearance(frame.rig, bodyDims(stage.skater), ground)), `clearance at +${t}s`).toBeLessThan(1);
    }
  });
});

describe('washout recovery', () => {
  const landings = [
    ...RIDERS.map(riderStance => ({ riderStance, set: 'el-toro' as const, skater: 'robot' as const, trick: 'Kickflip' })),
    { riderStance: 'regular', set: 'el-toro', skater: 'robot', trick: 'Backside 180' } as const,
    { riderStance: 'goofy', set: 'carlsbad-gap', skater: 'realistic', trick: 'Kickflip' } as const,
    { riderStance: 'regular', set: 'sunset-car-wash', skater: 'robot', trick: 'Kickflip' } as const,
  ];
  it.each(landings)('rolls over, comes up onto planted feet and stands ($set $trick $riderStance $skater)', ({ set, riderStance, skater, trick }) => {
    const stage = planStage(trickNamed(trick), {
      landed: false, fall: 'washout', set, riderStance, skater, style: resolveSkateStyle(), shankProgress: 0.65,
    });
    const stairs = stage.stairs!;
    const sample = (offset: number) => stageFrame(stage, stairs.land + offset, 1);
    const clearance = (point: V3) => ASPHALT - terrainSurface(stairs.terrain, point.x, point.z) - point.y;
    const hipHeight = (frame: StageFrame) => clearance(world(frame, hipsOf(frame.rig)));
    const dims = bodyDims(stage.skater);
    const legLength = dims.thigh + dims.shin;
    const dt = 1 / 120;

    // Down, the chest goes over the ground and round onto the back before the rider is up.
    let prone = Infinity;
    let supine = Infinity;
    let stopped = Infinity;
    const end = stage.end - stairs.land;
    for (let t = WASH_OUT_ROLL_START; t <= end; t += dt) {
      const frame = sample(t);
      // (On a bank the ground the chest faces is the slope.)
      if (hipHeight(frame) < 0.6 * legLength) {
        if (frame.rig.torso.fwd.y > 0.5) prone = Math.min(prone, t);
        if (prone < t && frame.rig.torso.fwd.y < -0.5) supine = Math.min(supine, t);
      }
      const next = sample(t + dt);
      if (stopped === Infinity && Math.hypot(next.scroll - frame.scroll, next.stairs!.across - frame.stairs!.across) < 0.01) stopped = t;
    }
    expect(prone, 'chest down').toBeLessThan(supine);
    expect(supine, 'onto the back before the rider has stopped').toBeLessThan(stopped);
    expect(stopped).toBeLessThanOrEqual(WASH_OUT_ROLL_END + dt);

    // Drawn in for the roll, no limb goes through the body; and no joint snaps from one frame to the next.
    let before: V3[] | null = null;
    let speeds: number[] | null = null;
    for (let t = WASH_OUT_ROLL_START - 2 * dt; t <= end; t += dt) {
      const frame = sample(t);
      if (t > WASH_OUT_ROLL_START + 0.2) {
        const contact = selfContact(frame.rig, dims);
        expect(contact.trunk / dims.scale, `a leg in the trunk at +${t.toFixed(3)}s`).toBeLessThan(2.5);
        expect(contact.legs / dims.scale, `the legs in each other at +${t.toFixed(3)}s`).toBeLessThan(2.5);
      }
      const joints = [frame.rig.head.origin, ...frame.rig.legs.flatMap(l => [l.knee, l.ankle, l.shoe.origin]), ...frame.rig.arms.flatMap(a => [a.elbow, a.hand])]
        .map(p => world(frame, p));
      if (before) {
        const now = joints.map((p, i) => Math.hypot(p.x - before![i].x, p.y - before![i].y, p.z - before![i].z) / dt / dims.scale);
        // (Thrown down onto the chest, as out of a 180, a leg folded under the body still whips out from under it.)
        if (speeds && trick === 'Kickflip') {
          for (const [i, speed] of now.entries()) expect(Math.abs(speed - speeds[i]), `joint ${i} jolts at +${t.toFixed(3)}s`).toBeLessThan(2000);
        }
        speeds = now;
      }
      before = joints;
    }

    const standing = sample(WASH_OUT_T);
    expect(hipHeight(standing) - hipHeight(sample(stopped))).toBeGreaterThan(0.25 * legLength);
    expect(hipHeight(standing)).toBeGreaterThan(0.8 * legLength);
    expect(standing.rig.torso.up.y).toBeLessThan(-0.9);
    expect(standing.expression).not.toBe('wince');
    const soles = (frame: StageFrame) => frame.rig.legs.map(l => world(frame, l.shoe.at(0, -SHOE_HALF_HEIGHT, 0)));
    const planted = soles(sample(stopped));
    for (let t = stopped; t <= WASH_OUT_T; t += 1 / 30) {
      for (const [i, sole] of soles(sample(t)).entries()) {
        expect(Math.hypot(sole.x - planted[i].x, sole.z - planted[i].z), `foot ${i} travel at +${t}s`).toBeLessThan(1);
        expect(Math.abs(clearance(sole)), `foot ${i} clearance at +${t}s`).toBeLessThan(1);
      }
    }
  });
});

it('carries the rider off the raised lip of Triangle Bank without a vertical jump', () => {
  const stage = planStage(trickNamed('Kickflip'), {
    landed: false, fall: 'washout', set: 'miami-triangle', riderStance: 'regular', style: resolveSkateStyle(), shankProgress: 0.65,
  });
  const stairs = stage.stairs!;
  const height = (t: number) => centerOfMass(stageFrame(stage, stairs.land + t, 1).rig).y;
  const dt = 1 / 120;
  let previous = height(0.15);
  for (let t = 0.15 + dt; t < 0.55; t += dt) {
    const y = height(t);
    // Even in free fall from the lip, the rider cannot lose a slab's thickness in one frame.
    const freeFallSpeed = stairs.speed + GRAVITY * t;
    expect(Math.abs(y - previous), `vertical movement at +${t}s`).toBeLessThan(freeFallSpeed * dt);
    previous = y;
  }
});
