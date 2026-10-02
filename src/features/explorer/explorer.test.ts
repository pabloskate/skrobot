import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA, SCENE_CAMERA_BOUNDS, SCENE_ZOOM, grindSpecFor } from '@skrobot/animations';
import { TRICK_BY_ID } from '@/features/tricks';
import {
  CAMERA_PRESETS,
  DEFAULT_STATE,
  FLATGROUND_BASES,
  FLATGROUND_TIERS,
  GRIND_CHOICES,
  GRIND_SIDES,
  INTO_CHOICES,
  OUT_CHOICES,
  STANCES,
  ZOOM_RANGE,
  ZOOM_STEP,
  outEndsFor,
  sceneCamera,
  searchFromState,
  shuffle,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickSteps,
  turnCamera,
  withGrind,
  zoomAt,
  zoomBy,
  type ExplorerState,
} from './explorer';

const grindState = (patch: Partial<ExplorerState> = {}): ExplorerState => ({ ...DEFAULT_STATE, mode: 'grinds', ...patch });

/** A seeded generator, so shuffle sweeps are repeatable. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('Trick Explorer catalog', () => {
  it('offers every flatground trick in the catalog, each in exactly one tier, in every stance', () => {
    const tiered = FLATGROUND_TIERS.flatMap((tier) => tier.bases);
    expect([...tiered].sort()).toEqual([...FLATGROUND_BASES].sort());
    for (const base of FLATGROUND_BASES) {
      for (const stance of STANCES) {
        const trick = stageTrick({ ...DEFAULT_STATE, trick: base, stance });
        expect(TRICK_BY_ID.get(trick.id), `${base} ${stance}`).toMatchObject({ base, stance });
      }
    }
  });

  it('only builds grind combos the stage can animate', () => {
    for (const grind of GRIND_CHOICES) {
      for (const side of GRIND_SIDES) {
        for (const into of [null, ...INTO_CHOICES]) {
          for (const out of [null, ...OUT_CHOICES.flatMap((base) => outEndsFor(grind).map((end) => ({ base, end })))]) {
            const trick = stageTrick(grindState({ grind, side, into, out }));
            expect(grindSpecFor(trick), trick.name).not.toBeNull();
          }
        }
      }
    }
  });

  it('names a combo the way it is skated, stance first', () => {
    const trick = stageTrick(grindState({ stance: 'switch', grind: 'Crooked Grind', side: 'Backside', into: 'Kickflip', out: { base: 'Heelflip', end: 'nose' } }));
    expect(trick.name).toBe('Switch Kickflip into Backside Crooked Grind Nollie Heelflip Out');
    expect(stageTrick({ ...DEFAULT_STATE, trick: 'Backside 180', stance: 'fakie' }).name).toBe('Half Cab');
  });

  it('drops a trick out when the new grind does not ride the end it pops off', () => {
    const tailOut = grindState({ grind: '5-0 Grind', out: { base: 'Kickflip', end: 'tail' } });
    expect(withGrind(tailOut, 'Nosegrind').out).toBeNull();
    expect(withGrind(tailOut, '50-50 Grind').out).toEqual({ base: 'Kickflip', end: 'tail' });
  });

  it('walks a combo through its approach, way on, lock, and way off', () => {
    const steps = trickSteps(grindState({ grind: 'Lipslide', side: 'Frontside', into: 'Inward Heelflip', out: { base: 'FS Bigspin', end: 'tail' } }));
    expect(steps.map((s) => s.label)).toEqual(['Approach', 'Inward Heelflip', 'Frontside Lipslide', 'FS Bigspin out']);
    expect(steps[1].detail).toMatch(/^Pop an Inward Heelflip/);
    expect(steps[3].detail).toMatch(/^Pop an FS Bigspin off the tail/);
    expect(trickSteps({ ...DEFAULT_STATE, trick: 'Kickflip' })[0].detail).not.toBe('');
  });
});

describe('Trick Explorer timeline', () => {
  it('lists moments in order, inside the trick, with the tricks in and out of a combo', () => {
    const states = [
      DEFAULT_STATE,
      grindState(),
      grindState({ into: 'Kickflip', out: { base: '360 Flip', end: 'tail' } }),
    ];
    for (const state of states) {
      const { phases, duration } = timelineFor(state, undefined);
      expect(phases[0]).toEqual({ label: 'Set up', time: 0 });
      for (let i = 1; i < phases.length; i++) expect(phases[i].time, phases[i].label).toBeGreaterThan(phases[i - 1].time);
      expect(phases[phases.length - 1].time).toBeLessThan(duration);
    }
    const labels = timelineFor(states[2], undefined).phases.map((p) => p.label);
    expect(labels).toEqual(['Set up', 'Pop', 'Trick in', 'Lock', 'Pop off', 'Trick out', 'Land']);
  });
});

describe('Trick Explorer camera', () => {
  it('keeps every preset inside the camera bounds, with Classic as the game view', () => {
    const { yaw, pitch, lens } = SCENE_CAMERA_BOUNDS;
    for (const preset of CAMERA_PRESETS) {
      for (const stance of STANCES) {
        const camera = sceneCamera({ ...DEFAULT_STATE, stance, camera: preset.id });
        expect(camera.yaw, preset.id).toBeGreaterThanOrEqual(yaw.min);
        expect(camera.yaw, preset.id).toBeLessThanOrEqual(yaw.max);
        expect(camera.pitch, preset.id).toBeGreaterThanOrEqual(pitch.min);
        expect(camera.pitch, preset.id).toBeLessThanOrEqual(pitch.max);
        expect(camera.lens, preset.id).toBeGreaterThanOrEqual(lens.min);
        expect(camera.lens, preset.id).toBeLessThanOrEqual(lens.max);
      }
    }
    expect(sceneCamera(DEFAULT_STATE)).toEqual(DEFAULT_SCENE_CAMERA);
  });

  it('swings travel-framed angles round for a trick rolling fakie, flatground or grind', () => {
    const regular = sceneCamera({ ...DEFAULT_STATE, camera: 'head-on' });
    expect(sceneCamera({ ...DEFAULT_STATE, stance: 'fakie', camera: 'head-on' }).yaw).toBe(-regular.yaw);
    expect(sceneCamera(grindState({ stance: 'fakie', camera: 'head-on' })).yaw).toBe(-regular.yaw);
    expect(sceneCamera({ ...DEFAULT_STATE, stance: 'fakie', camera: 'overhead' }))
      .toEqual(sceneCamera({ ...DEFAULT_STATE, camera: 'overhead' }));
  });

  it('turns the camera only as far as the bounds allow', () => {
    const turned = turnCamera(DEFAULT_SCENE_CAMERA, 500, -500);
    expect(turned).toEqual({ ...DEFAULT_SCENE_CAMERA, yaw: SCENE_CAMERA_BOUNDS.yaw.max, pitch: SCENE_CAMERA_BOUNDS.pitch.min });
  });
});

describe('Trick Explorer zoom', () => {
  it('steps in and out evenly and never leaves its range', () => {
    expect(zoomBy(1, ZOOM_STEP)).toBeCloseTo(ZOOM_STEP, 3);
    expect(zoomBy(zoomBy(1, ZOOM_STEP), 1 / ZOOM_STEP)).toBeCloseTo(1, 3);
    expect(zoomBy(SCENE_ZOOM.max, ZOOM_STEP)).toBe(SCENE_ZOOM.max);
    expect(zoomBy(SCENE_ZOOM.min, 1 / ZOOM_STEP)).toBe(SCENE_ZOOM.min);
    expect(zoomBy(1, Number.NaN)).toBe(1);
  });

  it('maps the slider onto the zoom range, settling on 1× near the middle', () => {
    expect(zoomAt(ZOOM_RANGE.min)).toBeCloseTo(SCENE_ZOOM.min, 9);
    expect(zoomAt(ZOOM_RANGE.max)).toBeCloseTo(SCENE_ZOOM.max, 9);
    expect(zoomAt(0)).toBe(1);
    expect(zoomAt(0.03)).toBe(1);
    expect(zoomAt(-0.03)).toBe(1);
    expect(zoomAt(0.2)).toBeGreaterThan(1);
    expect(zoomAt(-0.2)).toBeLessThan(1);
  });
});

describe('Trick Explorer links', () => {
  it('round-trips flatground and grind states through the URL', () => {
    const states: ExplorerState[] = [
      DEFAULT_STATE,
      { ...DEFAULT_STATE, trick: '360 Flip', stance: 'nollie', rider: 'goofy', camera: 'overhead' },
      grindState({ grind: 'Noseblunt Slide', side: 'Backside', into: 'Pop Shuvit', out: { base: 'Kickflip', end: 'nose' }, stance: 'switch' }),
      grindState({ grind: '50-50 Grind', camera: { yaw: 12.5, pitch: 33, lens: 0.8 } }),
      { ...DEFAULT_STATE, trick: 'Heelflip', camera: 'head-on', zoom: 1.75 },
      grindState({ grind: 'Lipslide', camera: { yaw: -10, pitch: 20, lens: 1.1 }, zoom: SCENE_ZOOM.min }),
    ];
    for (const state of states) expect(stateFromSearch(searchFromState(state)), searchFromState(state)).toEqual(state);
  });

  it('leaves defaults out of the link', () => {
    expect(searchFromState(DEFAULT_STATE)).toBe('?trick=kickflip');
    expect(searchFromState(grindState({ into: 'Kickflip', out: { base: 'Heelflip', end: 'nose' } }))).toBe('?grind=50-50-grind&in=kickflip&out=nollie-heelflip');
    expect(searchFromState({ ...DEFAULT_STATE, zoom: 1.5 })).toBe('?trick=kickflip&zoom=1.5');
  });

  it('keeps a zoom from a link in range, and reads a missing or junk one as 1×', () => {
    expect(stateFromSearch('?zoom=99').zoom).toBe(SCENE_ZOOM.max);
    expect(stateFromSearch('?zoom=0').zoom).toBe(SCENE_ZOOM.min);
    expect(stateFromSearch('?zoom=abc').zoom).toBe(1);
    expect(stateFromSearch('?zoom=').zoom).toBe(1);
    expect(stateFromSearch('?trick=heelflip').zoom).toBe(1);
    // Links written before zoom existed keep opening exactly as they did.
    expect(stateFromSearch('?trick=heelflip&cam=-30_12_1')).toEqual({
      ...DEFAULT_STATE, trick: 'Heelflip', camera: { yaw: -30, pitch: 12, lens: 1 },
    });
  });

  it('falls back to defaults for anything it does not know, and clamps custom angles', () => {
    expect(stateFromSearch('?trick=moonwalk&stance=upside-down&rider=both&cam=drone')).toEqual(DEFAULT_STATE);
    // A nollie trick out of a grind that only rides the tail is no trick out.
    expect(stateFromSearch('?grind=5-0-grind&out=nollie-kickflip').out).toBeNull();
    expect(stateFromSearch('?cam=999_-40_9').camera).toEqual({ yaw: SCENE_CAMERA_BOUNDS.yaw.max, pitch: SCENE_CAMERA_BOUNDS.pitch.min, lens: SCENE_CAMERA_BOUNDS.lens.max });
  });
});

describe('Trick Explorer shuffle', () => {
  it('always lands on something new to watch, and only on combos the stage can animate', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = seeded(seed);
      const flat = shuffle(DEFAULT_STATE, random);
      expect(flat.trick).not.toBe(DEFAULT_STATE.trick);
      const combo = shuffle(grindState(), random);
      if (combo.out) expect(outEndsFor(combo.grind)).toContain(combo.out.end);
      expect(grindSpecFor(stageTrick(combo)), stageTrick(combo).name).not.toBeNull();
    }
  });
});
