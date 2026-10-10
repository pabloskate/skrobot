import { describe, expect, it } from 'vitest';
import { planStage, stageFrame, type StageFrame } from './stage';
import { DEFAULT_SKATE_STYLE } from '../motion/style';
import { SETUP_LOOK } from './gaze';
import type { V3 } from '../math';

const plan = (base: string, set = 'plaza', landed = true) => planStage(
  { id: base, name: base, base, stance: 'regular' },
  { landed, riderStance: 'regular', style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, skater: 'realistic', set: set as never },
);
const distance = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Where a point of the frame sits in the scenery: it doesn't move as the street rolls by. */
const pinned = (frame: StageFrame, p: V3) => ({ x: p.x + frame.scroll, z: p.z + (frame.stairs?.across ?? 0) });

describe('where the rider looks', () => {
  it('flat ground: ahead while rolling in, on the board from the setup to touchdown, then ahead again', () => {
    const stage = plan('Kickflip');
    const pop = 0.5 * 1.12;
    const early = stageFrame(stage, 0.05, 1);
    expect(early.gaze!.y).toBeGreaterThan(early.rig.board.center.y); // on the ground, below the deck
    expect(distance(early.gaze!, early.rig.board.center)).toBeGreaterThan(250);
    for (let t = pop - SETUP_LOOK + 0.1; t < pop + 0.5; t += 0.05) {
      const frame = stageFrame(stage, t, 1);
      expect(distance(frame.gaze!, frame.rig.board.center), `t ${t}`).toBeLessThan(1e-6);
    }
    const away = stageFrame(stage, stage.end, 1);
    expect(distance(away.gaze!, away.rig.board.center)).toBeGreaterThan(400);
  });

  it('a grind: the bar where the trucks will lock is watched rolling in, and stays put in the scenery', () => {
    const stage = plan('Backside 50-50 Grind');
    const grind = stage.grind!;
    const spots = [0, 0.1, 0.2].map((t) => { const f = stageFrame(stage, t, 1); return pinned(f, f.gaze!); });
    for (const s of spots) expect(Math.abs(s.x - spots[0].x)).toBeLessThan(1e-6);
    // It is where the board will be at lock-in.
    const locked = stageFrame(stage, grind.lockAt, 1);
    const lock = pinned(locked, locked.rig.board.center);
    expect(Math.abs(spots[0].x - lock.x)).toBeLessThan(1e-6);
    // Locked on, the eyes are drawn down the bar toward where they'll pop off.
    const riding = stageFrame(stage, (grind.lockAt + grind.off) / 2, 1);
    const ahead = Math.sign(stageFrame(stage, grind.off, 1).rig.board.center.x + stageFrame(stage, grind.off, 1).scroll - (riding.rig.board.center.x + riding.scroll));
    expect(Math.sign(riding.gaze!.x - riding.rig.board.center.x)).toBe(ahead);
  });

  it('down a stair set: the lip, rolling in, then the board', () => {
    const stage = plan('Kickflip', 'el-toro');
    const stairs = stage.stairs!;
    const a = stageFrame(stage, 0.1, 1), b = stageFrame(stage, 0.4, 1);
    expect(Math.abs(pinned(a, a.gaze!).x - pinned(b, b.gaze!).x)).toBeLessThan(1e-6);
    const atPop = stageFrame(stage, stairs.pop, 1);
    expect(Math.abs(pinned(a, a.gaze!).x - pinned(atPop, atPop.rig.board.center).x)).toBeLessThan(1e-6);
    const air = stageFrame(stage, (stairs.pop + stairs.land) / 2, 1);
    expect(distance(air.gaze!, air.rig.board.center)).toBeLessThan(1e-6);
  });

  it('keeps watching the board when the attempt goes down', () => {
    const stage = plan('Kickflip', 'plaza', false);
    const frame = stageFrame(stage, stage.end, 1);
    expect(distance(frame.gaze!, frame.rig.board.center)).toBeLessThan(1e-6);
  });

  it('leaves a choreographed head move (a lead-in) alone', () => {
    const stage = plan('Kickflip');
    expect(stageFrame(stage, -0.2, 1, { pitch: 5, roll: 0, expression: 'open' }).gaze).toBeUndefined();
  });
});

describe('contact shadows', () => {
  it('darken the ground right under the wheels while they roll on it, and are gone in the air', () => {
    for (const set of ['plaza', 'hollywood-high', 'el-toro']) {
      const stage = plan('Kickflip', set);
      const rolling = stageFrame(stage, stage.end, 1).shadows.contact!;
      // Four wheels, darker than the board's cast shadow; and a softer one under the deck.
      expect(rolling.filter((c) => c.dark > 2).length, set).toBe(4);
      expect(rolling.length, set).toBe(5);
      const air = stage.stairs ? (stage.stairs.pop + stage.stairs.land) / 2 : 0.56 + 0.4;
      expect(stageFrame(stage, air, 1).shadows.contact!.length, set).toBe(0);
    }
  });
});
