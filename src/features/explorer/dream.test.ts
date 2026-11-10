import { describe, expect, it } from 'vitest';
import { FOOT, setInfo, specFor, spotStands } from '@skrobot/animations';
import { outEndsFor, sceneCamera, sceneTripod, searchFromState, stageTrick, withCamera, withShot, FLATGROUND_TIERS, GRIND_CHOICES } from './explorer';
import {
  DREAM_DEFAULT,
  DREAM_SPOTS,
  STAND_HEIGHT,
  actionPoint,
  cameraMode,
  dreamLine,
  dreamShots,
  dreamSpot,
  dreamStateFromSearch,
  followOffset,
  followYaw,
  insideWindow,
  mapWindow,
  pathAt,
  placeStand,
  presetStand,
  standFrame,
  swingStand,
  withDreamGrind,
  withDreamLine,
  withDreamSpot,
} from './dream';

describe('Dream Tricks', () => {
  it('offers only the landmark spots, each line one the spot can skate', () => {
    expect(DREAM_SPOTS.map((spot) => spot.id)).toEqual(['el-toro', 'hollywood-high', 'wallenberg', 'sunset-car-wash', 'lyon-25', 'leap-of-faith', 'miami-triangle', 'uc-davis-gap', 'carlsbad-gap', 'emage-20']);
    for (const spot of DREAM_SPOTS) {
      const info = setInfo(spot.id);
      expect(info.terrain, spot.id).not.toBeNull();
      expect(spot.name, spot.id).toBe(info.label);
      expect(new Set(spot.lines.map((line) => line.id)).size, spot.id).toBe(spot.lines.length);
      for (const line of spot.lines) {
        const lineInfo = setInfo(line.set ?? spot.id);
        if (line.mode === 'grinds') {
          expect(lineInfo.grinds, `${spot.id} ${line.id}`).toBe(true);
          if (line.rail === 'side') expect(lineInfo.rails?.sideGrinds, `${spot.id} ${line.id}`).not.toBe(false);
        } else if (line.obstacle !== 'stairs') {
          expect(lineInfo.obstacles?.some((o) => o.id === line.obstacle), `${spot.id} ${line.id}`).toBe(true);
        }
      }
    }
  });

  it('opens on a kickflip down El Toro', () => {
    const state = dreamStateFromSearch('');
    expect(state).toEqual(DREAM_DEFAULT);
    expect(dreamLine(state).label).toBe('20 stair');
  });

  it('offers a nollie backside 360 heelflip and preserves its motion in shared links', () => {
    expect(FLATGROUND_TIERS.find((tier) => tier.label === 'Pro')?.bases).toContain('Backside 360 Heelflip');
    const search = '?trick=backside-360-heelflip&stance=nollie&cam=tripod-bottom&set=wallenberg&skater=realistic';
    const state = dreamStateFromSearch(search);
    const trick = stageTrick(state);
    expect(trick.name).toBe('Nollie Backside 360 Heelflip');
    expect(specFor(trick)).toMatchObject({ nollie: true, flips: 1, flipDir: -1, yaw: 360, bodyYaw: 360, spinDir: 1 });
    expect(dreamStateFromSearch(searchFromState(state))).toEqual(state);
  });

  it('opens explorer links as they are, moved to a landmark when they were elsewhere', () => {
    expect(dreamStateFromSearch('?trick=heelflip&set=wallenberg&stance=nollie')).toMatchObject({ mode: 'flatground', trick: 'Heelflip', set: 'wallenberg', stance: 'nollie' });
    expect(dreamStateFromSearch('?grind=lipslide&set=el-toro&rail=side')).toMatchObject({ mode: 'grinds', grind: 'Lipslide', rail: 'side' });
    expect(dreamStateFromSearch('?trick=kickflip&set=plaza').set).toBe('el-toro');
    expect(dreamStateFromSearch('?grind=lipslide').set).toBe('el-toro');
    expect(dreamStateFromSearch('?trick=kickflip&skater=humanoid').skater).toBe('robot');
  });

  it('round-trips what is on stage through the link', () => {
    const states = [
      DREAM_DEFAULT,
      withDreamLine(withDreamSpot(DREAM_DEFAULT, 'hollywood-high'), DREAM_SPOTS[1].lines[2]),
      { ...withDreamLine(DREAM_DEFAULT, DREAM_SPOTS[0].lines[2]), grind: 'Crooked Grind', into: 'Kickflip', skater: 'realistic' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'sunset-car-wash'), trick: '360 Flip', rider: 'goofy' as const, camera: 'tripod-bottom' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'lyon-25'), trick: 'Heelflip', stance: 'nollie' as const, rider: 'goofy' as const, camera: 'tripod-top' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'leap-of-faith'), trick: 'Ollie', skater: 'realistic' as const, camera: 'tripod-side' as const },
      { ...withDreamLine(withDreamSpot(DREAM_DEFAULT, 'miami-triangle'), DREAM_SPOTS[6].lines[1]), trick: 'Heelflip', skater: 'realistic' as const, camera: 'tripod-top' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'uc-davis-gap'), trick: 'Ollie', skater: 'realistic' as const, stance: 'switch' as const, rider: 'goofy' as const, camera: 'tripod-side' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'carlsbad-gap'), trick: 'Heelflip', skater: 'realistic' as const, stance: 'nollie' as const, rider: 'goofy' as const, camera: 'tripod-bottom' as const },
      { ...withDreamSpot(DREAM_DEFAULT, 'emage-20'), trick: 'Kickflip', skater: 'realistic' as const, stance: 'switch' as const, rider: 'goofy' as const, camera: 'tripod-top' as const },
    ];
    for (const state of states) expect(dreamStateFromSearch(searchFromState(state)), searchFromState(state)).toEqual(state);
  });

  it('names the line on stage, and switches lines without losing the trick or grind', () => {
    const fence = withDreamLine(withDreamSpot(DREAM_DEFAULT, 'hollywood-high'), DREAM_SPOTS[1].lines[2]);
    expect(fence).toMatchObject({ mode: 'flatground', obstacle: 'fence', trick: 'Kickflip' });
    expect(dreamLine(fence).label).toBe('Over the fence');
    const rail = withDreamLine(fence, DREAM_SPOTS[1].lines[1]);
    expect(rail).toMatchObject({ mode: 'grinds', rail: 'center' });
    expect(dreamLine(rail).label).toBe('16 rail');
    expect(withDreamLine(rail, DREAM_SPOTS[1].lines[0])).toMatchObject({ mode: 'flatground', obstacle: 'stairs', trick: 'Kickflip' });
    const triangle = withDreamLine(withDreamSpot(DREAM_DEFAULT, 'miami-triangle'), DREAM_SPOTS[6].lines[1]);
    expect(triangle).toMatchObject({ mode: 'flatground', obstacle: 'triangle', trick: 'Kickflip' });
    expect(dreamLine(triangle).label).toBe('Over the triangle');
    expect(dreamLine(withDreamSpot(triangle, 'miami-triangle')).label).toBe('Gap to bank');
  });

  it('keeps both Hollywood flights under one spot and switches between all five lines', () => {
    const hollywood = dreamSpot('hollywood-high');
    expect(dreamSpot('hollywood-high-12')).toBe(hollywood);
    expect(DREAM_SPOTS.filter((spot) => spot.id.startsWith('hollywood'))).toHaveLength(1);
    expect(hollywood.lines.map((line) => line.label)).toEqual(['16 stair', '16 rail', 'Over the fence', '12 stair', '12 rail']);
    const initial = { ...withDreamSpot(DREAM_DEFAULT, 'hollywood-high'), trick: 'Heelflip', grind: 'Smith Grind', rider: 'goofy' as const, stance: 'fakie' as const };
    // Every line remains reachable from every other one, including returning
    // to the sixteen's fence from the twelve's rail.
    for (const from of hollywood.lines) for (const to of hollywood.lines) {
      const next = withDreamLine(withDreamLine(initial, from), to);
      expect(next).toMatchObject({ set: to.set, mode: to.mode, trick: 'Heelflip', grind: 'Smith Grind', rider: 'goofy', stance: 'fakie' });
      expect(dreamLine(next)).toBe(to);
      const reopened = dreamStateFromSearch(searchFromState(next));
      expect(dreamLine(reopened)).toBe(to);
      expect(stageTrick(reopened)).toEqual(stageTrick(next));
    }
  });

  it('opens a shared twelve-stair link on its own line without exposing the sixteen fence', () => {
    const stairs = dreamStateFromSearch('?set=hollywood-high-12&trick=kickflip&obstacle=fence');
    expect(stairs).toMatchObject({ set: 'hollywood-high-12', mode: 'flatground', obstacle: 'stairs' });
    expect(dreamLine(stairs).label).toBe('12 stair');
    const rail = dreamStateFromSearch('?set=hollywood-high-12&grind=boardslide');
    expect(dreamLine(rail).label).toBe('12 rail');
    expect(dreamSpot(rail.set).id).toBe('hollywood-high');
    expect(dreamLine(dreamStateFromSearch('?set=hollywood-high&trick=kickflip')).label).toBe('16 stair');
  });

  it('offers the Emage stairs and its side rail, retaining the combo when switching lines', () => {
    const spot = dreamSpot('emage-20');
    expect(spot.lines.map((line) => line.label)).toEqual(['20 stair', 'Side rail']);
    const stairs = { ...withDreamSpot(DREAM_DEFAULT, spot.id), trick: 'Heelflip', grind: 'Lipslide', into: 'Kickflip', side: 'Backside' as const, rider: 'goofy' as const };
    expect(dreamLine(stairs)).toBe(spot.lines[0]);
    const rail = withDreamLine(stairs, spot.lines[1]);
    expect(rail).toMatchObject({ set: 'emage-20', mode: 'grinds', rail: 'side', grind: 'Lipslide', into: 'Kickflip', side: 'Backside', rider: 'goofy' });
    expect(dreamLine(rail)).toBe(spot.lines[1]);
    const reopened = dreamStateFromSearch(searchFromState(rail));
    expect(dreamLine(reopened)).toBe(spot.lines[1]);
    expect(stageTrick(reopened)).toEqual(stageTrick(rail));
    expect(reopened.rider).toBe('goofy');
    expect(stageTrick(rail).name).toBe('Kickflip into Backside Lipslide');
    expect(withDreamLine(rail, spot.lines[0])).toMatchObject({ mode: 'flatground', trick: 'Heelflip' });
    expect(dreamLine(dreamStateFromSearch('?set=emage-20&grind=boardslide'))).toBe(spot.lines[1]);
  });

  it('starts each spot on its first line, gap-only spots on their gap', () => {
    const railAtToro = withDreamLine(DREAM_DEFAULT, DREAM_SPOTS[0].lines[1]);
    for (const set of ['wallenberg', 'sunset-car-wash', 'lyon-25', 'leap-of-faith', 'uc-davis-gap', 'carlsbad-gap'] as const) {
      const state = withDreamSpot(railAtToro, set);
      expect(state).toMatchObject({ set, mode: 'flatground', trick: 'Kickflip' });
      expect(dreamLine(state).mode).toBe('flatground');
      expect(dreamStateFromSearch(`?set=${set}&grind=boardslide`)).toMatchObject({ set, mode: 'flatground', trick: 'Kickflip' });
    }
    expect(dreamLine(withDreamSpot(railAtToro, 'uc-davis-gap')).label).toBe('Over the ivy');
    expect(dreamLine(withDreamSpot(railAtToro, 'carlsbad-gap')).label).toBe('Over the grass');
    expect(withDreamSpot(railAtToro, 'hollywood-high')).toMatchObject({ set: 'hollywood-high', mode: 'flatground', obstacle: 'stairs' });
    // Miami starts on its gap, and grinds down whichever edge the trick takes.
    expect(withDreamSpot(railAtToro, 'miami-triangle')).toMatchObject({ set: 'miami-triangle', mode: 'flatground', obstacle: 'stairs' });
    const edge = withDreamLine(withDreamSpot(railAtToro, 'miami-triangle'), DREAM_SPOTS[6].lines[2]);
    expect(edge).toMatchObject({ set: 'miami-triangle', mode: 'grinds', rail: 'center' });
    expect(dreamLine(edge).label).toBe('Down an edge');
    expect(dreamStateFromSearch('?set=miami-triangle&grind=boardslide')).toMatchObject({ set: 'miami-triangle', mode: 'grinds' });
  });

  it('keeps a flip out when changing grinds, off an end the new grind rides', () => {
    const combo = { ...withDreamLine(DREAM_DEFAULT, DREAM_SPOTS[0].lines[1]), out: { base: 'Kickflip', end: 'tail' as const } };
    for (const grind of GRIND_CHOICES) {
      const next = withDreamGrind(combo, grind);
      expect(next.out?.base, grind).toBe('Kickflip');
      expect(outEndsFor(grind), grind).toContain(next.out!.end);
    }
  });

  it('films every landmark from the bottom, the side, and the top, classic from the bottom', () => {
    for (const spot of DREAM_SPOTS) {
      const shots = dreamShots({ set: spot.id, camera: DREAM_DEFAULT.camera });
      expect(shots.map((shot) => shot.id), spot.id).toEqual(expect.arrayContaining(['tripod-bottom', 'tripod-side', 'tripod-top']));
      expect(shots.find((shot) => shot.label === 'Bottom')?.id, spot.id).toBe('tripod-bottom');
      expect(shots.some((shot) => shot.id === 'classic'), spot.id).toBe(false);
    }
  });

  it('opens the crane\'s classic shot, or no shot, from the bottom', () => {
    expect(DREAM_DEFAULT.camera).toBe('tripod-bottom');
    expect(dreamStateFromSearch('?trick=kickflip').camera).toBe('tripod-bottom');
    expect(dreamStateFromSearch('?trick=kickflip&cam=classic').camera).toBe('tripod-bottom');
    expect(dreamStateFromSearch('?trick=kickflip&cam=follow').camera).toBe('follow');
  });

  it('keeps the filmer-at-the-bottom framing instead of the explorer\'s classic pull-back', () => {
    expect(DREAM_DEFAULT.zoom).toBe(1);
    expect(dreamStateFromSearch('').zoom).toBe(1);
    expect(dreamStateFromSearch('?cam=classic').zoom).toBe(1);
    // A link that asks for a zoom still keeps it.
    expect(dreamStateFromSearch('?cam=classic&zoom=1.4').zoom).toBe(1.4);
  });

  describe('camera', () => {
    const stand = { u: 30 * FOOT, z: -20 * FOOT, height: 5 * FOOT, frame: 30 * FOOT };

    it('is a tripod or a follow camera, with starting points for each', () => {
      expect(cameraMode(DREAM_DEFAULT)).toBe('tripod');
      expect(cameraMode(withShot(DREAM_DEFAULT, 'follow'))).toBe('follow');
      expect(cameraMode({ ...withShot(DREAM_DEFAULT, 'follow'), stand })).toBe('tripod');
      expect(dreamShots(DREAM_DEFAULT, 'tripod').map((shot) => shot.label)).toEqual(['Bottom', 'Side', 'Top']);
      expect(dreamShots(DREAM_DEFAULT, 'follow').map((shot) => shot.label)).toEqual(['Behind', 'Beside', 'In front', 'Above']);
    });

    it('films from a tripod the viewer placed, and keeps it in the link', () => {
      const placed = { ...DREAM_DEFAULT, stand };
      expect(sceneTripod(placed)).toBeNull();
      expect(sceneCamera(placed).stand).toEqual(stand);
      const back = dreamStateFromSearch(searchFromState(placed));
      expect(back.stand?.u).toBeCloseTo(stand.u, 3);
      expect(back.stand?.z).toBeCloseTo(stand.z, 3);
      expect(back.stand?.height).toBeCloseTo(stand.height, 3);
      expect(back.stand?.frame).toBeCloseTo(stand.frame, 3);
      // A named shot, a crane angle, or another spot each let go of it.
      expect(withShot(placed, 'tripod-side').stand).toBeUndefined();
      expect(withCamera(placed, { yaw: 10, pitch: 10, lens: 1 }).stand).toBeUndefined();
      expect(withDreamSpot(placed, 'wallenberg').stand).toBeUndefined();
    });

    it('starts a dragged tripod from where the spot\'s own filmer stands', () => {
      for (const spot of DREAM_SPOTS) {
        const own = spotStands(spot.id, { obstacle: 'stairs' })!.bottom;
        const from = presetStand(withDreamSpot(DREAM_DEFAULT, spot.id), () => own.y - 4 * FOOT);
        expect(from, spot.id).toMatchObject({ u: own.u, z: own.z, frame: own.frame });
        expect(from!.height, spot.id).toBeCloseTo(4 * FOOT, 6);
      }
      expect(presetStand(withShot(DREAM_DEFAULT, 'follow'), () => 0)).toBeNull();
      expect(presetStand({ ...DREAM_DEFAULT, stand }, () => 0)).toBeNull();
    });

    it('walks a tripod round the trick, and reframes one moved across the map', () => {
      const action = { u: 10 * FOOT, z: 0 };
      const swung = swingStand({ ...stand, u: action.u, z: 20 * FOOT }, action, 90, 10);
      // A quarter turn, crane-wise, from beside the trick to behind it (back up the drop).
      expect(swung.u).toBeCloseTo(action.u - 20 * FOOT, 6);
      expect(swung.z).toBeCloseTo(0, 6);
      expect(swung.height).toBeGreaterThan(stand.height);
      expect(swingStand(stand, action, 0, 1000).height).toBe(STAND_HEIGHT.max);
      expect(swingStand(stand, action, 0, -1000).height).toBe(STAND_HEIGHT.min);
      const moved = placeStand(stand, { u: action.u + 40 * FOOT, z: 30 * FOOT }, action);
      expect(moved).toMatchObject({ u: action.u + 40 * FOOT, z: 30 * FOOT, height: stand.height });
      expect(moved.frame).toBeCloseTo(standFrame(moved, action), 6);
      // Twice as far away, twice as long a lens: the trick stays the same size.
      expect(standFrame({ u: action.u + 60 * FOOT, z: 0 }, action)).toBeCloseTo(2 * standFrame({ u: action.u + 30 * FOOT, z: 0 }, action), 6);
    });

    it('hangs the follow camera where the map shows it', () => {
      for (const yaw of [-170, -90, -30, 0, 58, 90, 179]) {
        const offset = followOffset({ yaw, pitch: 20, lens: 1.2 }, 520);
        expect(followYaw(offset), String(yaw)).toBeCloseTo(yaw, 6);
        expect(Math.hypot(offset.u, offset.z)).toBeCloseTo(520 * 1.2 * Math.cos((20 * Math.PI) / 180), 6);
      }
      // Yaw -90 is ahead of the rider, down the drop.
      expect(followOffset({ yaw: -90, pitch: 0, lens: 1 }, 100).u).toBeCloseTo(100, 6);
    });

    it('reads the rider\'s place off their path, and the trick\'s between pop and landing', () => {
      const path = [{ t: 0, u: 0, z: 0 }, { t: 1, u: 10, z: 2 }, { t: 2, u: 30, z: 2 }];
      expect(pathAt(path, -1)).toEqual({ t: 0, u: 0, z: 0 });
      expect(pathAt(path, 0.5)).toEqual({ u: 5, z: 1 });
      expect(pathAt(path, 9)).toEqual({ t: 2, u: 30, z: 2 });
      expect(actionPoint(path, [{ label: 'Set up', time: 0 }, { label: 'Pop', time: 1 }, { label: 'Land', time: 2 }])).toEqual({ u: 20, z: 2 });
    });

    it('maps the rider\'s line with room round it, inside the spot\'s plan', () => {
      const plan = { u0: -60 * FOOT, u1: 200 * FOOT, z0: -70 * FOOT, z1: 70 * FOOT };
      const line = [{ u: 0, z: 0 }, { u: 80 * FOOT, z: 0 }];
      const window = mapWindow(plan, line);
      expect(window.u0).toBeLessThan(-10 * FOOT);
      expect(window.u1).toBeGreaterThan(90 * FOOT);
      expect(window.z0).toBeLessThanOrEqual(-24 * FOOT);
      expect(window.z1).toBeGreaterThanOrEqual(24 * FOOT);
      const shape = (window.u1 - window.u0) / (window.z1 - window.z0);
      expect(shape).toBeGreaterThan(1.3);
      expect(shape).toBeLessThan(2.2);
      // A small plan is shown whole.
      const small = { u0: -10 * FOOT, u1: 90 * FOOT, z0: -10 * FOOT, z1: 10 * FOOT };
      expect(mapWindow(small, line)).toEqual(small);
      expect(insideWindow({ u: -999 * FOOT, z: 999 * FOOT }, window, FOOT)).toEqual({ u: window.u0 + FOOT, z: window.z1 - FOOT });
    });
  });
});
