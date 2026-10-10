import { describe, expect, it } from 'vitest';
import { setInfo, specFor } from '@skrobot/animations';
import { outEndsFor, searchFromState, stageTrick, FLATGROUND_TIERS, GRIND_CHOICES } from './explorer';
import {
  DREAM_DEFAULT,
  DREAM_SPOTS,
  dreamLine,
  dreamShots,
  dreamStateFromSearch,
  withDreamGrind,
  withDreamLine,
  withDreamSpot,
} from './dream';

describe('Dream Tricks', () => {
  it('offers only the landmark spots, each line one the spot can skate', () => {
    expect(DREAM_SPOTS.map((spot) => spot.id)).toEqual(['el-toro', 'hollywood-high', 'wallenberg', 'sunset-car-wash', 'lyon-25', 'leap-of-faith', 'miami-triangle']);
    for (const spot of DREAM_SPOTS) {
      const info = setInfo(spot.id);
      expect(info.terrain, spot.id).not.toBeNull();
      for (const line of spot.lines) {
        if (line.mode === 'grinds') {
          expect(info.grinds, `${spot.id} ${line.id}`).toBe(true);
          if (line.rail === 'side') expect(info.rails?.sideGrinds, `${spot.id} ${line.id}`).not.toBe(false);
        } else if (line.obstacle !== 'stairs') {
          expect(info.obstacles?.some((o) => o.id === line.obstacle), `${spot.id} ${line.id}`).toBe(true);
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
    ];
    for (const state of states) expect(dreamStateFromSearch(searchFromState(state)), searchFromState(state)).toEqual(state);
  });

  it('names the line on stage, and switches lines without losing the trick or grind', () => {
    const fence = withDreamLine(withDreamSpot(DREAM_DEFAULT, 'hollywood-high'), DREAM_SPOTS[1].lines[2]);
    expect(fence).toMatchObject({ mode: 'flatground', obstacle: 'fence', trick: 'Kickflip' });
    expect(dreamLine(fence).label).toBe('Over the fence');
    const rail = withDreamLine(fence, DREAM_SPOTS[1].lines[1]);
    expect(rail).toMatchObject({ mode: 'grinds', rail: 'center' });
    expect(dreamLine(rail).label).toBe('Handrail');
    expect(withDreamLine(rail, DREAM_SPOTS[1].lines[0])).toMatchObject({ mode: 'flatground', obstacle: 'stairs', trick: 'Kickflip' });
    const triangle = withDreamLine(withDreamSpot(DREAM_DEFAULT, 'miami-triangle'), DREAM_SPOTS[6].lines[1]);
    expect(triangle).toMatchObject({ mode: 'flatground', obstacle: 'triangle', trick: 'Kickflip' });
    expect(dreamLine(triangle).label).toBe('Over the triangle');
    expect(dreamLine(withDreamSpot(triangle, 'miami-triangle')).label).toBe('Gap to bank');
  });

  it('starts each spot on its first line, gap-only spots on their gap', () => {
    const railAtToro = withDreamLine(DREAM_DEFAULT, DREAM_SPOTS[0].lines[1]);
    for (const set of ['wallenberg', 'sunset-car-wash', 'lyon-25', 'leap-of-faith'] as const) {
      const state = withDreamSpot(railAtToro, set);
      expect(state).toMatchObject({ set, mode: 'flatground', trick: 'Kickflip' });
      expect(dreamLine(state).mode).toBe('flatground');
      expect(dreamStateFromSearch(`?set=${set}&grind=boardslide`)).toMatchObject({ set, mode: 'flatground', trick: 'Kickflip' });
    }
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
});
