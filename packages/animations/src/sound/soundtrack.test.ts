import { describe, expect, it } from 'vitest';
import { FLIP_T, ROLL_IN, type FallVariant } from '../motion/trick';
import { resolveSkateStyle } from '../motion/style';
import type { Robot, Trick } from '../types';
import { GRIND_BASES } from '../motion/grindDefinitions';
import type { StageSet } from '../sets/sets';
import { cuesBetween, soundtrackFor, type Soundtrack } from './soundtrack';
import { planStage, type StagePlan } from '../stage/stage';

/**
 * The sounds keep time with the picture: every hit lands on the moment the
 * stage plan says it happens, the wheels go quiet exactly while the board is
 * off the ground, and the rail scrapes exactly while the board rides it.
 */

const robot: Robot = {
  id: 'shifty',
  name: 'Swivel',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
  skateStyle: { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 },
};
const trick = (base: string): Trick => ({ id: base, name: base, base, stance: 'regular' });
const plan = (base: string, { landed = true, fall = 'slam' as FallVariant, set = 'plaza' as StageSet } = {}): StagePlan =>
  planStage(trick(base), {
    landed,
    riderStance: 'regular',
    style: resolveSkateStyle(robot.skateStyle),
    fall,
    shankProgress: 0.65,
    set,
  });
const kinds = (track: Soundtrack) => track.cues.map((cue) => cue.kind);
const sample = (stage: StagePlan, level: (t: number) => number) => {
  const out: Array<{ t: number; v: number }> = [];
  for (let i = -20; i <= 400; i++) {
    const t = (stage.end * i) / 400;
    out.push({ t, v: level(t) });
  }
  return out;
};

describe('soundtrackFor', () => {
  it('pops at the roll-in and lands at touchdown on flat ground, rolling only with the wheels down', () => {
    const stage = plan('Kickflip');
    const track = soundtrackFor(stage);
    const touchdown = ROLL_IN + FLIP_T;
    expect(track.cues).toEqual([{ kind: 'pop', at: ROLL_IN }, { kind: 'land', at: touchdown, weight: 1 }]);
    for (const { t, v } of sample(stage, track.roll)) expect(v).toBe(t >= ROLL_IN && t < touchdown ? 0 : 1);
    for (const { v } of sample(stage, track.grind)) expect(v).toBe(0);
  });

  it('clatters instead of landing on a miss, the riderless board rolling away to a stop', () => {
    for (const fall of ['slam', 'bail', 'shank'] as const) {
      const stage = plan('Kickflip', { landed: false, fall });
      const track = soundtrackFor(stage);
      expect(kinds(track)).toEqual(['pop', 'crash']);
      const touchdown = ROLL_IN + FLIP_T;
      const after = sample(stage, track.roll).filter(({ t }) => t >= touchdown);
      expect(after[0].v).toBeLessThan(1);
      for (let i = 1; i < after.length; i++) expect(after[i].v).toBeLessThanOrEqual(after[i - 1].v);
      expect(after[after.length - 1].v).toBeLessThan(0.05);
    }
  });

  it('times a grind to its plan: pop, lock-in, the scrape along the rail, pop off, landing', () => {
    for (const set of ['plaza', 'el-toro'] as const) {
      const stage = plan('Frontside 50-50 Grind', { set });
      const grind = stage.grind!;
      const track = soundtrackFor(stage);
      expect(track.slide).toBe(false);
      expect(track.cues.map(({ kind, at }) => [kind, at])).toEqual([
        ['pop', grind.pop],
        ['lock', grind.lockAt],
        ['popOff', grind.off],
        ['land', grind.land],
      ]);
      for (const { t, v } of sample(stage, track.grind)) expect(v).toBe(t >= grind.lockAt && t < grind.off ? 1 : 0);
      for (const { t, v } of sample(stage, track.roll)) expect(v).toBe(t >= grind.pop && t < grind.land ? 0 : 1);
    }
  });

  it('lands harder off a handrail and off the stairs than on flat ground', () => {
    const weight = (stage: StagePlan) => {
      const land = soundtrackFor(stage).cues.find((cue) => cue.kind === 'land');
      return land && 'weight' in land ? land.weight : NaN;
    };
    expect(weight(plan('Frontside 50-50 Grind', { set: 'el-toro' }))).toBeGreaterThan(weight(plan('Frontside 50-50 Grind')));
    expect(weight(plan('Kickflip', { set: 'el-toro' }))).toBeGreaterThan(weight(plan('Kickflip')));
    const stairs = plan('Kickflip', { set: 'el-toro' }).stairs!;
    expect(soundtrackFor(plan('Kickflip', { set: 'el-toro' })).cues.map((cue) => cue.at)).toEqual([stairs.pop, stairs.land]);
  });

  it('slides wood on metal when the deck rides the rail, grinds metal on metal when the trucks do', () => {
    const slides = GRIND_BASES.filter((base) => /slide$/i.test(base));
    expect(slides).toEqual(['Boardslide', 'Lipslide', 'Noseslide', 'Tailslide', 'Bluntslide', 'Noseblunt Slide']);
    for (const base of GRIND_BASES) {
      for (const side of ['Frontside', 'Backside']) {
        expect(soundtrackFor(plan(`${side} ${base}`)).slide, `${side} ${base}`).toBe(slides.includes(base));
      }
    }
  });

  it('cuts the scrape at the slip and clatters where the board hits the ground', () => {
    for (const fall of ['slam', 'bail', 'shank'] as const) {
      const stage = plan('Backside Boardslide', { landed: false, fall });
      const grind = stage.grind!;
      const track = soundtrackFor(stage);
      expect(track.cues.map(({ kind, at }) => [kind, at])).toEqual([
        ['pop', grind.pop],
        ['lock', grind.lockAt],
        ['crash', grind.fail! + grind.drop],
      ]);
      for (const { t, v } of sample(stage, track.grind)) expect(v).toBe(t >= grind.lockAt && t < grind.fail! ? 1 : 0);
    }
  });

  it('rolls the wheels at the speed the spot is ridden at', () => {
    const cruise = soundtrackFor(plan('Kickflip'));
    for (const { v } of sample(plan('Kickflip'), cruise.speed)) expect(v).toBeCloseTo(1, 9);
    for (const { v } of sample(plan('Frontside 50-50 Grind'), soundtrackFor(plan('Frontside 50-50 Grind')).speed)) expect(v).toBeCloseTo(1, 9);
    // Into a big set at about twice cruising speed, and away from it as fast.
    const stairs = plan('Kickflip', { set: 'el-toro' });
    const set = soundtrackFor(stairs);
    expect(set.speed(stairs.stairs!.pop - 0.1)).toBeGreaterThan(1.8);
    expect(set.speed(stairs.stairs!.land + 0.1)).toBeCloseTo(set.speed(stairs.stairs!.pop - 0.1), 9);
    // Down a handrail: rolled in a little quicker than cruising, ridden off the bottom quicker still.
    const rail = plan('Frontside 50-50 Grind', { set: 'el-toro' });
    const grind = rail.grind!;
    const down = soundtrackFor(rail);
    expect(down.speed(grind.pop - 0.1)).toBeGreaterThan(1);
    expect(down.speed(grind.land + 0.1)).toBeGreaterThan(down.speed(grind.pop - 0.1));
  });

  it('picks up speed down a roll-in and down a bank', () => {
    const dropIn = plan('Kickflip', { set: 'wallenberg' });
    const rollIn = soundtrackFor(dropIn);
    const speeds = sample(dropIn, rollIn.speed).filter(({ t }) => t >= 0 && t < dropIn.stairs!.pop).map(({ v }) => v);
    expect(speeds[0]).toBeLessThan(0.6);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] - 1e-6);
    // Reaching the set's speed at the ramp's foot, and holding it on to the pop.
    expect(speeds[speeds.length - 1]).toBeCloseTo(rollIn.speed(dropIn.stairs!.pop), 1);
    expect(rollIn.speed(dropIn.stairs!.pop)).toBeGreaterThan(1.8);
    const bank = plan('Kickflip', { set: 'sunset-car-wash' });
    const away = soundtrackFor(bank);
    expect(away.speed(bank.end - 0.1)).toBeGreaterThan(away.speed(bank.stairs!.pop));
  });

  it('slows a riderless board to a stop', () => {
    const stage = plan('Kickflip', { landed: false });
    const track = soundtrackFor(stage);
    const after = sample(stage, track.speed).filter(({ t }) => t >= ROLL_IN + FLIP_T);
    for (let i = 1; i < after.length; i++) expect(after[i].v).toBeLessThanOrEqual(after[i - 1].v);
    expect(after[after.length - 1].v).toBeLessThan(0.1);
  });

  it('pops into and out of a grind with a trick at the same moments', () => {
    const stage = plan('Kickflip into Backside 5-0 Grind Kickflip Out');
    const grind = stage.grind!;
    expect(grind.entry).not.toBeNull();
    expect(grind.exit).not.toBeNull();
    expect(soundtrackFor(stage).cues.map(({ kind, at }) => [kind, at])).toEqual([
      ['pop', grind.pop],
      ['lock', grind.lockAt],
      ['popOff', grind.off],
      ['land', grind.land],
    ]);
  });
});

describe('cuesBetween', () => {
  it('hands each cue to exactly one step of a running clock', () => {
    const track = soundtrackFor(plan('Frontside 50-50 Grind'));
    const heard: string[] = [];
    let last = -0.5;
    for (let t = -0.5 + 1 / 60; t <= 5; t += 1 / 60) {
      heard.push(...cuesBetween(track, last, t).map((cue) => cue.kind));
      last = t;
    }
    expect(heard).toEqual(kinds(track));
  });
});
