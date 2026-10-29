import { describe, expect, it } from 'vitest';
import { setInfo, specFor } from '@skrobot/animations';
import { outEndsFor, searchFromState, stageTrick, FLATGROUND_TIERS, GRIND_CHOICES } from './explorer';
import {
  DREAM_DEFAULT,
  DREAM_SPOTS,
  dreamLine,
  dreamShots,
  dreamSpot,
  dreamStateFromSearch,
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
      expect(shots.find((shot) => shot.label === 'Classic')?.id, spot.id).toBe('tripod-bottom');
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
});
