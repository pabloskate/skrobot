import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA, FLIP_T, LAND_T, ROLL_IN, SCENE_CAMERA_BOUNDS, SCENE_ZOOM, grindSpecFor, stairTimeline } from '@skrobot/animations';
import { TRICK_BY_ID } from '@/features/tricks';
import {
  CAMERA_PRESETS,
  DEFAULT_STATE,
  FLATGROUND_BASES,
  FLATGROUND_TIERS,
  GRIND_CHOICES,
  GRIND_SIDES,
  GRIND_TIERS,
  INTO_CHOICES,
  INTO_TIERS,
  OUT_CHOICES,
  STANCES,
  ZOOM_RANGE,
  ZOOM_STEP,
  grindMatchesSearch,
  outEndsFor,
  sceneCamera,
  searchFromState,
  shuffle,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickInName,
  trickSteps,
  turnCamera,
  videoFilename,
  withGrind,
  withMode,
  withSet,
  zoomAt,
  zoomBy,
  type ExplorerState,
} from './explorer';

const grindState = (patch: Partial<ExplorerState> = {}): ExplorerState => ({ ...DEFAULT_STATE, mode: 'grinds', ...patch });
const flatState = (patch: Partial<ExplorerState> = {}): ExplorerState => ({ ...DEFAULT_STATE, mode: 'flatground', ...patch });

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
        const trick = stageTrick(flatState({ trick: base, stance }));
        expect(TRICK_BY_ID.get(trick.id), `${base} ${stance}`).toMatchObject({ base, stance });
      }
    }
  });

  it('shelves every grind and every trick into a grind in exactly one group, grinds apart from slides', () => {
    expect(GRIND_TIERS.flatMap((tier) => tier.bases).sort()).toEqual([...GRIND_CHOICES].sort());
    expect(INTO_TIERS.flatMap((tier) => tier.bases).sort()).toEqual([...INTO_CHOICES].sort());
    const [grinds, slides] = GRIND_TIERS;
    expect(grinds.bases).toContain('Crooked Grind');
    expect(slides.bases).toEqual(expect.arrayContaining(['Boardslide', 'Noseblunt Slide']));
    expect(grinds.bases.filter((grind) => slides.bases.includes(grind))).toEqual([]);
  });

  it('finds a grind by the name skaters say', () => {
    expect(GRIND_CHOICES.filter((grind) => grindMatchesSearch(grind, 'crooks'))).toEqual(['Crooked Grind', 'Overcrooked Grind']);
    expect(GRIND_CHOICES.filter((grind) => grindMatchesSearch(grind, 'fifty fifty'))).toEqual(['50-50 Grind']);
    expect(GRIND_CHOICES.filter((grind) => grindMatchesSearch(grind, 'lip slide'))).toEqual(['Lipslide']);
    expect(GRIND_CHOICES.filter((grind) => grindMatchesSearch(grind, '  '))).toEqual(GRIND_CHOICES);
    expect(GRIND_CHOICES.filter((grind) => grindMatchesSearch(grind, 'moonwalk'))).toEqual([]);
  });

  it('names how the rider gets on the bar by their stance', () => {
    expect(trickInName(grindState())).toBe('Ollie on');
    expect(trickInName(grindState({ stance: 'switch' }))).toBe('Switch Ollie on');
    expect(trickInName(grindState({ stance: 'nollie' }))).toBe('Nollie on');
    expect(trickInName(grindState({ stance: 'fakie', into: 'Kickflip' }))).toBe('Fakie Kickflip');
    expect(trickInName(grindState({ stance: 'nollie', into: 'Heelflip' }))).toBe('Nollie Heelflip');
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
    expect(stageTrick(flatState({ trick: 'Backside 180', stance: 'fakie' })).name).toBe('Half Cab');
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
    expect(trickSteps(flatState({ trick: 'Kickflip' }))[0].detail).not.toBe('');
  });
});

describe('Trick Explorer timeline', () => {
  it('lists moments in order, inside the trick, with the tricks in and out of a combo', () => {
    const states = [
      flatState(),
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

  it('runs a trick down El Toro for the drop’s longer hang time, timed to the stage', () => {
    const style = { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 };
    const { phases, duration } = timelineFor(flatState({ set: 'el-toro' }), style);
    const stairs = stairTimeline(style);
    expect(duration).toBe(stairs.end);
    expect(duration).toBeGreaterThan(ROLL_IN + FLIP_T + LAND_T);
    expect(phases.map((p) => p.label)).toEqual(['Set up', 'Pop', 'Peak', 'Catch', 'Land']);
    for (let i = 1; i < phases.length; i++) expect(phases[i].time, phases[i].label).toBeGreaterThan(phases[i - 1].time);
    expect(phases.at(-1)?.time).toBe(stairs.land);
  });
});

describe('Trick Explorer spots', () => {
  it('takes flatground tricks down El Toro, and grinds back to a spot with a bar', () => {
    expect(withSet(grindState(), 'el-toro')).toMatchObject({ set: 'el-toro', mode: 'flatground' });
    expect(withSet(flatState({ set: 'el-toro' }), 'plaza')).toMatchObject({ set: 'plaza', mode: 'flatground' });
    expect(withSet(grindState(), 'plaza')).toMatchObject({ set: 'plaza', mode: 'grinds' });
    expect(withMode(flatState({ set: 'el-toro' }), 'grinds')).toMatchObject({ set: DEFAULT_STATE.set, mode: 'grinds' });
    expect(withMode(flatState({ set: 'plaza' }), 'grinds')).toMatchObject({ set: 'plaza', mode: 'grinds' });
    expect(withMode(grindState(), 'flatground')).toMatchObject({ set: DEFAULT_STATE.set, mode: 'flatground' });
  });

  it('links to El Toro, never with a grind on it', () => {
    const state = flatState({ set: 'el-toro', trick: '360 Flip', stance: 'nollie' });
    expect(searchFromState(state)).toBe('?trick=360-flip&stance=nollie&set=el-toro');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(stateFromSearch('?set=el-toro')).toEqual(flatState({ set: 'el-toro' }));
    expect(stateFromSearch('?grind=lipslide&set=el-toro')).toMatchObject({ mode: 'grinds', grind: 'Lipslide', set: DEFAULT_STATE.set });
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
    const regular = sceneCamera(flatState({ camera: 'head-on' }));
    expect(sceneCamera(flatState({ stance: 'fakie', camera: 'head-on' })).yaw).toBe(-regular.yaw);
    expect(sceneCamera(grindState({ stance: 'fakie', camera: 'head-on' })).yaw).toBe(-regular.yaw);
    expect(sceneCamera(flatState({ stance: 'fakie', camera: 'overhead' })))
      .toEqual(sceneCamera(flatState({ camera: 'overhead' })));
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
      flatState({ trick: '360 Flip', stance: 'nollie', rider: 'goofy', camera: 'overhead' }),
      grindState({ grind: 'Noseblunt Slide', side: 'Backside', into: 'Pop Shuvit', out: { base: 'Kickflip', end: 'nose' }, stance: 'switch' }),
      grindState({ grind: '50-50 Grind', camera: { yaw: 12.5, pitch: 33, lens: 0.8 } }),
      flatState({ trick: 'Heelflip', camera: 'head-on', zoom: 1.75 }),
      grindState({ grind: 'Lipslide', camera: { yaw: -10, pitch: 20, lens: 1.1 }, zoom: SCENE_ZOOM.min }),
      flatState({ trick: 'Kickflip', set: 'plaza' }),
      grindState({ grind: 'Crooked Grind', set: 'waterfront', camera: 'follow' }),
      flatState({ trick: 'Kickflip', skater: 'human' }),
      grindState({ grind: 'Lipslide', side: 'Backside', skater: 'human', set: 'plaza' }),
    ];
    for (const state of states) expect(stateFromSearch(searchFromState(state)), searchFromState(state)).toEqual(state);
  });

  it('leaves defaults out of the link', () => {
    expect(searchFromState(DEFAULT_STATE)).toBe('?grind=50-50-grind');
    expect(searchFromState(flatState())).toBe('?trick=kickflip');
    expect(searchFromState(grindState({ into: 'Kickflip', out: { base: 'Heelflip', end: 'nose' } }))).toBe('?grind=50-50-grind&in=kickflip&out=nollie-heelflip');
    expect(searchFromState(grindState({ out: { base: 'Backside Heelflip', end: 'nose' } }))).toBe('?grind=50-50-grind&out=nollie-backside-heelflip');
    expect(stateFromSearch('?grind=50-50-grind&out=frontside-flip').out).toEqual({ base: 'Frontside Flip', end: 'tail' });
    expect(searchFromState({ ...DEFAULT_STATE, zoom: 1.5 })).toBe('?grind=50-50-grind&zoom=1.5');
    expect(searchFromState({ ...DEFAULT_STATE, set: 'plaza' })).toBe('?grind=50-50-grind&set=plaza');
    expect(searchFromState({ ...DEFAULT_STATE, skater: 'human' })).toBe('?grind=50-50-grind&skater=human');
  });

  it('opens with the robot, and with the human skater when a link asks for one', () => {
    expect(DEFAULT_STATE.skater).toBe('robot');
    expect(stateFromSearch('?grind=lipslide').skater).toBe('robot');
    expect(stateFromSearch('?trick=heelflip&skater=human').skater).toBe('human');
    expect(stateFromSearch('?skater=alien').skater).toBe('robot');
  });

  it('opens on the waterfront, and on the plaza when a link asks for it', () => {
    expect(DEFAULT_STATE.set).toBe('waterfront');
    expect(stateFromSearch('?grind=lipslide').set).toBe('waterfront');
    expect(stateFromSearch('?trick=heelflip&set=plaza').set).toBe('plaza');
    expect(stateFromSearch('?set=moon').set).toBe('waterfront');
  });

  it('opens on a grind by default, and on flatground only when a link names a flatground trick', () => {
    expect(DEFAULT_STATE.mode).toBe('grinds');
    expect(grindSpecFor(stageTrick(DEFAULT_STATE))).not.toBeNull();
    for (const bare of ['', '?', '?stance=switch&cam=head-on']) {
      expect(stateFromSearch(bare).mode, bare).toBe('grinds');
      expect(stateFromSearch(bare).grind, bare).toBe(DEFAULT_STATE.grind);
    }
    expect(stateFromSearch('')).toEqual(DEFAULT_STATE);
    // A link naming a flatground trick, including one shared before grinds were the default.
    expect(stateFromSearch('?trick=heelflip')).toEqual(flatState({ trick: 'Heelflip' }));
    expect(stateFromSearch('?trick=kickflip')).toEqual(flatState());
    // A grind link wins over a stray trick, and a trick nobody knows opens the default.
    expect(stateFromSearch('?grind=lipslide&trick=heelflip').mode).toBe('grinds');
    expect(stateFromSearch('?trick=moonwalk')).toEqual(DEFAULT_STATE);
  });

  it('keeps a zoom from a link in range, and reads a missing or junk one as 1×', () => {
    expect(stateFromSearch('?zoom=99').zoom).toBe(SCENE_ZOOM.max);
    expect(stateFromSearch('?zoom=0').zoom).toBe(SCENE_ZOOM.min);
    expect(stateFromSearch('?zoom=abc').zoom).toBe(1);
    expect(stateFromSearch('?zoom=').zoom).toBe(1);
    expect(stateFromSearch('?trick=heelflip').zoom).toBe(1);
    // Links written before zoom existed keep opening exactly as they did.
    expect(stateFromSearch('?trick=heelflip&cam=-30_12_1')).toEqual(flatState({ trick: 'Heelflip', camera: { yaw: -30, pitch: 12, lens: 1 } }));
  });

  it('falls back to defaults for anything it does not know, and clamps custom angles', () => {
    expect(stateFromSearch('?trick=moonwalk&stance=upside-down&rider=both&cam=drone')).toEqual(DEFAULT_STATE);
    // A nollie trick out of a grind that only rides the tail is no trick out.
    expect(stateFromSearch('?grind=5-0-grind&out=nollie-kickflip').out).toBeNull();
    expect(stateFromSearch('?cam=999_-40_9').camera).toEqual({ yaw: SCENE_CAMERA_BOUNDS.yaw.max, pitch: SCENE_CAMERA_BOUNDS.pitch.min, lens: SCENE_CAMERA_BOUNDS.lens.max });
  });
});

describe('Trick Explorer video', () => {
  it('names the download after the trick, with its speed when slowed down', () => {
    expect(videoFilename('Kickflip', 1)).toBe('kickflip.mp4');
    expect(videoFilename('Fakie Hardflip', 0.25)).toBe('fakie-hardflip-0.25x.mp4');
    expect(videoFilename(stageTrick(grindState()).name, 0.5)).toMatch(/^[a-z0-9]+(-[a-z0-9.]+)*\.mp4$/);
    expect(videoFilename('???', 1)).toBe('trick.mp4');
  });
});

describe('Trick Explorer shuffle', () => {
  it('always lands on something new to watch, and only on combos the stage can animate', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = seeded(seed);
      const flat = shuffle(flatState(), random);
      expect(flat.trick).not.toBe(flatState().trick);
      const combo = shuffle(grindState(), random);
      if (combo.out) expect(outEndsFor(combo.grind)).toContain(combo.out.end);
      expect(grindSpecFor(stageTrick(combo)), stageTrick(combo).name).not.toBeNull();
    }
  });
});
