import { describe, expect, it } from 'vitest';
import { ASPHALT } from '../camera/view';
import { bodyDims } from '../motion/fall/body';
import { bodyClearance } from '../motion/fall/rollOut';
import { resolveSkateStyle } from '../motion/style';
import { WASH_OUT_T, X0 } from '../motion/trick';
import { terrainSurface } from '../sets/terrain';
import { soundtrackFor } from '../sound/soundtrack';
import { boardClearance, hipsOf } from './frameParts';
import { planStage, stageFrame } from './stage';

describe('Hollywood High 16 backside 180 wash out', () => {
  it.each(['regular', 'goofy'] as const)('catches with both feet, skids and falls sideways (%s)', riderStance => {
    const trick = { id: 'bs180', name: 'Backside 180', base: 'Backside 180', stance: 'regular' as const };
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
    expect(Math.abs(touch.rig.board.yawDeg - clean.rig.board.yawDeg)).toBeCloseTo(15);
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
    const down = sample(WASH_OUT_T);
    const direction = stage.mechanics.orientationSign;
    expect((down.rig.board.center.z - touch.rig.board.center.z) * direction).toBeGreaterThan(45);
    expect((hipsOf(down.rig).z - down.rig.board.center.z) * direction).toBeLessThan(-55);
    expect(Math.abs(down.rig.torso.up.z)).toBeGreaterThan(0.65);
    expect(down.rig.head.origin.y - touch.rig.head.origin.y).toBeGreaterThan(30);
    expect(sample(WASH_OUT_T + 1).rig.torso.origin).toEqual(down.rig.torso.origin);
  });
});
