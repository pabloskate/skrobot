import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA, FLIP_T, FOOT, LAND_T, ROLL_IN, SCENE_ORBIT_BOUNDS, SCENE_ZOOM, SKATERS, TRICK_BASES, grindSpecFor, grindTimelineFor, setInfo, stairTimeline } from '@skrobot/animations';
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
  cameraPresetsFor,
  grindMatchesSearch,
  outEndsFor,
  sceneCamera,
  sceneTripod,
  searchFromState,
  shuffle,
  stageTrick,
  stateFromSearch,
  timelineFor,
  trickInName,
  railLine,
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

  it('animates every flatground trick in the catalog as itself, never as a plain ollie', () => {
    // A catalog base the motion doesn't know pops like an ollie without a word.
    expect(FLATGROUND_BASES.filter((base) => !TRICK_BASES.includes(base))).toEqual([]);
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

  it('times a grind at El Toro down its center rail, longer than over the flat bar', () => {
    const style = { popHeight: 0.92, rotationSpeed: 1.08, flickStrength: 0.95 };
    const state = grindState({ set: 'el-toro', grind: 'Boardslide', into: 'Kickflip' });
    const rail = grindTimelineFor(stageTrick(state), state.rider, style, true, 'slam', setInfo('el-toro').rails!.handrail)!;
    const { phases, duration } = timelineFor(state, style);
    expect(duration).toBe(rail.end);
    expect(phases.map((p) => p.label)).toEqual(['Set up', 'Pop', 'Trick in', 'Lock', 'Pop off', 'Land']);
    expect(phases.find((p) => p.label === 'Lock')?.time).toBe(rail.lock);
    expect(timelineFor({ ...state, set: 'plaza' }, style).duration).not.toBe(duration);
  });
});

describe('Trick Explorer spots', () => {
  it('keeps the trick when changing spots: at El Toro flatground goes down the stairs and grinds down the rail', () => {
    expect(withSet(grindState(), 'el-toro')).toMatchObject({ set: 'el-toro', mode: 'grinds' });
    expect(withSet(flatState(), 'el-toro')).toMatchObject({ set: 'el-toro', mode: 'flatground' });
    expect(withSet(flatState({ set: 'el-toro' }), 'plaza')).toMatchObject({ set: 'plaza', mode: 'flatground' });
    expect(withSet(grindState(), 'plaza')).toMatchObject({ set: 'plaza', mode: 'grinds' });
    expect(withMode(flatState({ set: 'el-toro' }), 'grinds')).toMatchObject({ set: 'el-toro', mode: 'grinds' });
    expect(withMode(flatState({ set: 'plaza' }), 'grinds')).toMatchObject({ set: 'plaza', mode: 'grinds' });
    expect(withMode(grindState({ set: 'el-toro' }), 'flatground')).toMatchObject({ set: 'el-toro', mode: 'flatground' });
  });

  it('links to El Toro with a flatground trick or a grind on it', () => {
    const state = flatState({ set: 'el-toro', trick: '360 Flip', stance: 'nollie' });
    expect(searchFromState(state)).toBe('?trick=360-flip&stance=nollie&set=el-toro');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(stateFromSearch('?set=el-toro')).toEqual(grindState({ set: 'el-toro' }));
    expect(stateFromSearch('?grind=lipslide&set=el-toro')).toMatchObject({ mode: 'grinds', grind: 'Lipslide', set: 'el-toro' });
    const rail = grindState({ set: 'el-toro', grind: 'Smith Grind', side: 'Backside', into: 'Kickflip', stance: 'fakie' });
    expect(stateFromSearch(searchFromState(rail))).toEqual(rail);
  });

  it('walks a grind at El Toro through the rail rather than the bar', () => {
    const steps = trickSteps(grindState({ set: 'el-toro' })).map((step) => step.detail).join(' ');
    expect(steps).toMatch(/rail/);
    expect(steps).not.toMatch(/\bbar\b/);
    expect(trickSteps(grindState({ set: 'plaza' })).map((step) => step.detail).join(' ')).toMatch(/\bbar\b/);
  });

  it('grinds the center rail at El Toro unless asked for the side one, whose side the trick picks', () => {
    const boardslide = (side: 'Frontside' | 'Backside', patch: Partial<ExplorerState> = {}) =>
      grindState({ set: 'el-toro', grind: 'Boardslide', side, ...patch });
    expect(railLine(boardslide('Backside'))).toBe('center');
    // Going down the stairs, a regular rider's backside boardslide takes the right rail, a frontside one the left.
    expect(railLine(boardslide('Backside', { rail: 'side' }))).toBe('right');
    expect(railLine(boardslide('Frontside', { rail: 'side' }))).toBe('left');
    expect(railLine(boardslide('Backside', { rail: 'side', rider: 'goofy' }))).toBe('left');
    // No rail where there's no handrail, or no grind.
    expect(railLine(boardslide('Backside', { rail: 'side', set: 'plaza' }))).toBeNull();
    expect(railLine(flatState({ set: 'el-toro', rail: 'side' }))).toBeNull();
    expect(trickSteps(boardslide('Backside', { rail: 'side' })).map((step) => step.detail).join(' ')).toMatch(/right rail on your toeside/);
  });

  it('links to the side rail, and leaves the center one out of the link', () => {
    const side = grindState({ set: 'el-toro', grind: 'Boardslide', side: 'Backside', rail: 'side' });
    expect(searchFromState(side)).toBe('?grind=boardslide&side=bs&set=el-toro&rail=side');
    expect(stateFromSearch(searchFromState(side))).toEqual(side);
    expect(searchFromState({ ...side, rail: 'center' })).not.toMatch(/rail=/);
    expect(stateFromSearch('?grind=boardslide&set=el-toro&rail=sideways').rail).toBe('center');
  });
});

describe('Trick Explorer camera', () => {
  it('keeps every preset inside the camera bounds, with Classic as the game view', () => {
    const { yaw, pitch, lens } = SCENE_ORBIT_BOUNDS;
    for (const preset of CAMERA_PRESETS) {
      for (const stance of STANCES) {
        const camera = sceneCamera({ ...DEFAULT_STATE, stance, camera: preset.id });
        expect(camera.yaw, preset.id).toBeGreaterThanOrEqual(yaw.min);
        expect(camera.yaw, preset.id).toBeLessThan(yaw.max);
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

  it('keeps every El Toro camera preset fixed when changing trick or rider stance', () => {
    for (const preset of CAMERA_PRESETS) {
      const regular = sceneCamera(flatState({ set: 'el-toro', camera: preset.id }));
      for (const stance of STANCES) {
        for (const rider of ['regular', 'goofy'] as const) {
          expect(sceneCamera(flatState({ set: 'el-toro', camera: preset.id, stance, rider }))).toEqual(regular);
        }
      }
      // A grind goes down the same stairs on the center rail, so the same way round;
      // angles aimed across at the rail from the stair line aim at the rider on it.
      const grind = sceneCamera(grindState({ set: 'el-toro', camera: preset.id, stance: 'fakie' }));
      expect(grind).toEqual({ ...regular, targetZ: undefined });
      // Away from El Toro a fakie grind still swings the travel-framed angles round.
      const elsewhere = sceneCamera(grindState({ set: 'plaza', camera: preset.id, stance: 'fakie' }));
      expect(elsewhere.yaw).toBe(preset.followsTravel ? -preset.camera.yaw : preset.camera.yaw);
    }
  });

  it('films El Toro from tripods standing at the bottom, the side, and the top of the set', () => {
    const stairs = flatState({ set: 'el-toro' });
    const tripods = cameraPresetsFor(stairs).filter((preset) => preset.tripod);
    expect(tripods.map((preset) => preset.tripod)).toEqual([...setInfo('el-toro').tripods]);
    for (const preset of tripods) {
      expect(sceneTripod({ ...stairs, camera: preset.id })).toBe(preset.tripod);
      expect(sceneTripod(grindState({ set: 'el-toro', camera: preset.id }))).toBe(preset.tripod);
      // Shared links reopen on the tripod.
      expect(stateFromSearch(searchFromState({ ...stairs, camera: preset.id }))).toEqual({ ...stairs, camera: preset.id });
      // Elsewhere there is no tripod to stand at: the crane films from roughly where it would stand.
      expect(sceneTripod(flatState({ set: 'plaza', camera: preset.id }))).toBeNull();
      // Dragging takes over as a crane angle from there.
      expect(sceneTripod({ ...stairs, camera: turnCamera(sceneCamera({ ...stairs, camera: preset.id }), 5, 0) })).toBeNull();
    }
    expect(sceneTripod(stairs)).toBeNull();
    expect(cameraPresetsFor(DEFAULT_STATE).some((preset) => preset.tripod)).toBe(false);
  });

  it('offers the bottom angles at El Toro and keeps a selected one when changing spots', () => {
    expect(cameraPresetsFor(DEFAULT_STATE).map((preset) => preset.id)).not.toContain('bottom-center');
    const stairs = flatState({ set: 'el-toro' });
    expect(cameraPresetsFor(stairs).map((preset) => preset.id)).toEqual(expect.arrayContaining(['bottom-center', 'bottom-right']));
    expect(sceneCamera({ ...stairs, camera: 'bottom-center' }).yaw).toBe(-90);
    expect(sceneCamera({ ...stairs, camera: 'bottom-center' }).targetZ).toBe(-6 * FOOT);
    expect(sceneCamera({ ...stairs, camera: 'bottom-right' }).yaw).toBe(-125);
    const changed = withSet({ ...stairs, camera: 'bottom-right' }, 'plaza');
    expect(cameraPresetsFor(changed).map((preset) => preset.id)).toContain('bottom-right');
    expect(sceneCamera(changed)).toEqual(sceneCamera({ ...stairs, camera: 'bottom-right' }));
  });

  it('continues dragging through full circles while keeping pitch in bounds', () => {
    const turned = turnCamera(DEFAULT_SCENE_CAMERA, 500, -500);
    expect(turned).toEqual({ ...DEFAULT_SCENE_CAMERA, yaw: 114, pitch: SCENE_ORBIT_BOUNDS.pitch.min });
    expect(turnCamera(DEFAULT_SCENE_CAMERA, -720, 500)).toEqual({ ...DEFAULT_SCENE_CAMERA, pitch: SCENE_ORBIT_BOUNDS.pitch.max });
    const from = { ...DEFAULT_SCENE_CAMERA, yaw: 175 };
    // The gesture samples total movement from pointer-down, including across the seam.
    expect([0, 10, 20, 370].map((delta) => turnCamera(from, delta, 0).yaw)).toEqual([175, -175, -165, -175]);
  });

  it('lets arrow-key steps orbit repeatedly in both directions without getting stuck at the seam', () => {
    let camera = { ...DEFAULT_SCENE_CAMERA };
    for (let step = 0; step < 60; step++) camera = turnCamera(camera, 6, 0);
    expect(camera).toEqual(DEFAULT_SCENE_CAMERA);
    for (let step = 0; step < 60; step++) camera = turnCamera(camera, -6, 0);
    expect(camera).toEqual(DEFAULT_SCENE_CAMERA);
    expect(turnCamera({ ...camera, yaw: -180 }, -6, 0).yaw).toBe(174);
  });

  it('keeps the staircase center framing when dragging or sharing a bottom-center angle', () => {
    const camera = sceneCamera(flatState({ set: 'el-toro', camera: 'bottom-center' }));
    const dragged = turnCamera(camera, -40, 7);
    expect(dragged).toEqual({ yaw: -130, pitch: 13, lens: 1, targetZ: -6 * FOOT });
    const state = flatState({ set: 'el-toro', camera: dragged });
    expect(searchFromState(state)).toBe('?trick=kickflip&cam=-130_13_1_-174&set=el-toro');
    expect(stateFromSearch(searchFromState(state))).toEqual(state);
    expect(stateFromSearch('?trick=kickflip&cam=-130_13_1_-999').camera).toEqual(dragged);
    expect(stateFromSearch('?cam=-130_13_1_NaN').camera).toBe(DEFAULT_STATE.camera);
    expect(searchFromState(flatState({ camera: { ...DEFAULT_SCENE_CAMERA, targetZ: 0 } }))).toBe('?trick=kickflip&cam=-26_9_1');
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
      flatState({ trick: 'Kickflip', skater: 'humanoid', set: 'el-toro', rider: 'goofy', stance: 'fakie' }),
      flatState({ set: 'el-toro', camera: 'bottom-center' }),
      flatState({ set: 'el-toro', camera: 'bottom-right', stance: 'fakie' }),
      flatState({ set: 'el-toro', camera: { yaw: 145.5, pitch: 0, lens: 1.1 } }),
      grindState({ grind: 'Crooked Grind', skater: 'humanoid', into: 'Kickflip', out: { base: 'Heelflip', end: 'nose' } }),
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
    expect(searchFromState({ ...DEFAULT_STATE, skater: 'humanoid' })).toBe('?grind=50-50-grind&skater=humanoid');
  });

  it('opens with the robot, and accepts every selectable skater in shared links', () => {
    expect(DEFAULT_STATE.skater).toBe('robot');
    expect(stateFromSearch('?grind=lipslide').skater).toBe('robot');
    expect(SKATERS.map((option) => option.id)).toContain('humanoid');
    for (const { id } of SKATERS) {
      expect(stateFromSearch(`?trick=heelflip&skater=${id}`).skater).toBe(id);
    }
    expect(stateFromSearch('?skater=alien').skater).toBe('robot');
  });

  it('keeps the humanoid selected when changing spots, modes, grinds, and random tricks', () => {
    const initial = flatState({ skater: 'humanoid', trick: 'Heelflip' });
    const onStairs = withSet(initial, 'el-toro');
    const onPlaza = withSet(onStairs, 'plaza');
    const grind = withGrind(withMode(onPlaza, 'grinds'), 'Nosegrind');
    for (const state of [onStairs, onPlaza, grind, shuffle(grind, seeded(24)), shuffle(onStairs, seeded(32))]) {
      expect(state.skater).toBe('humanoid');
      expect(stateFromSearch(searchFromState(state)).skater).toBe('humanoid');
    }
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

  it('serializes equivalent full-circle angles to one stable share URL, including rounding at the seam', () => {
    for (const yaw of [180, -180, 540, -540, 179.98, -179.98]) {
      const search = searchFromState(flatState({ set: 'el-toro', camera: { yaw, pitch: 9, lens: 1 } }));
      expect(search).toBe('?trick=kickflip&cam=-180_9_1&set=el-toro');
      expect(searchFromState(stateFromSearch(search))).toBe(search);
    }
    expect(stateFromSearch('?trick=kickflip&cam=595_0_1').camera).toEqual({ yaw: -125, pitch: 0, lens: 1 });
    expect(stateFromSearch('?trick=kickflip&cam=-595_0_1').camera).toEqual({ yaw: 125, pitch: 0, lens: 1 });
  });

  it('opens Bottom center wide enough for both flights, preserving explicitly chosen zoom in links', () => {
    const search = '?trick=kickflip&cam=bottom-center&set=el-toro';
    const wide = stateFromSearch(search);
    expect(wide.zoom).toBe(0.6);
    expect(searchFromState(wide)).toBe(search);
    for (const zoom of [0.5, 1, 1.75]) {
      const state = stateFromSearch(`${search}&zoom=${zoom}`);
      expect(state.zoom).toBe(zoom);
      expect(stateFromSearch(searchFromState(state))).toEqual(state);
    }
    const preset = cameraPresetsFor(wide).find((option) => option.id === 'bottom-center');
    expect(preset?.zoom).toBe(0.6);
  });

  it('falls back to defaults for anything it does not know, wrapping yaw and clamping pitch and lens', () => {
    expect(stateFromSearch('?trick=moonwalk&stance=upside-down&rider=both&cam=drone')).toEqual(DEFAULT_STATE);
    // A nollie trick out of a grind that only rides the tail is no trick out.
    expect(stateFromSearch('?grind=5-0-grind&out=nollie-kickflip').out).toBeNull();
    expect(stateFromSearch('?cam=999_-40_9').camera).toEqual({ yaw: -81, pitch: SCENE_ORBIT_BOUNDS.pitch.min, lens: SCENE_ORBIT_BOUNDS.lens.max });
    expect(stateFromSearch('?cam=Infinity_9_1').camera).toBe(DEFAULT_STATE.camera);
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
