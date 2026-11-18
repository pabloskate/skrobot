import { describe, expect, it } from 'vitest';
import { hasObstacle, setFlights, setInfo, STAGE_SETS } from './sets';
import { SPOTS } from './spots';
import { setFilmers } from './tripods';

/**
 * What every spot's definition has to hold for the registries built from it
 * (sets.ts, tripods.ts, the explorers' pickers and cards) to make sense.
 */
describe('the spot registry', () => {
  const ids = SPOTS.map((spot) => spot.id);

  it('lists each spot once, under an id and a link name of its own', () => {
    expect(new Set(ids).size).toBe(ids.length);
    const slugs = STAGE_SETS.flatMap((spot) => spot.slug ?? []);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.filter((slug) => (ids as readonly string[]).includes(slug))).toEqual([]);
  });

  it('keeps every flight under a listed location that is not itself a flight', () => {
    for (const spot of STAGE_SETS) {
      if (!spot.location) continue;
      expect(ids, spot.id).toContain(spot.location);
      expect(setInfo(spot.location).location, spot.id).toBeUndefined();
      expect(setFlights(spot.id).map((flight) => flight.id), spot.id).toContain(spot.id);
    }
  });

  it('stands filmers at every spot with a drop, and only there', () => {
    for (const spot of STAGE_SETS) {
      expect(setFilmers(spot.id) != null, spot.id).toBe(spot.terrain != null);
      expect(spot.tripods.length > 0, spot.id).toBe(spot.terrain != null);
    }
  });

  it('names the default drop first among a spot\'s obstacles', () => {
    for (const spot of STAGE_SETS) {
      if (!spot.obstacles) continue;
      expect(spot.obstacles[0].id, spot.id).toBe('stairs');
      expect(spot.obstacles[0].terrain, spot.id).toBe(spot.terrain);
    }
  });

  it('gives every landmark a card, and every carded flight lines the spot can stage', () => {
    for (const spot of STAGE_SETS) {
      const location = setInfo(spot.location ?? spot.id);
      if (spot.terrain) expect(location.card, spot.id).toBeDefined();
      if (!location.card) continue;
      expect(spot.lines?.length, spot.id).toBeGreaterThan(0);
      for (const line of spot.lines ?? []) {
        if (line.hit === 'rail') {
          expect(spot.grinds, `${spot.id}: ${line.label}`).toBe(true);
          if (line.rail === 'side') expect(spot.rails && spot.rails.sideGrinds !== false, `${spot.id}: ${line.label}`).toBe(true);
        } else if (line.obstacle) {
          expect(hasObstacle(spot.id, line.obstacle), `${spot.id}: ${line.label}`).toBe(true);
        }
      }
    }
  });

  it('names each line once within its location', () => {
    for (const spot of STAGE_SETS.filter((s) => !s.location)) {
      const names = setFlights(spot.id).flatMap((flight) => (flight.lines ?? []).map((line) => line.id ?? (line.hit === 'gap' ? line.obstacle ?? 'stairs' : line.rail === 'side' ? 'side-rail' : 'rail')));
      expect(new Set(names).size, spot.id).toBe(names.length);
    }
  });
});
