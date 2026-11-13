import { describe, expect, it } from 'vitest';
import { MAX_CANOPIES, MAX_CONTACTS } from '../surfaces';
import { buildMiamiGeometry } from './miamiGeometry';
import {
  MIAMI_FOOT as F, MIAMI_GAP_LAND_X, MIAMI_PLAZA_HALF, MIAMI_SLAB_APEX_X, MIAMI_TERRACE_BACK, MIAMI_WALL_X, miamiSurface,
} from './miamiLayout';
import { MIAMI_CARS, MIAMI_PARKED, MIAMI_TREES, miamiCanopies } from './miamiTrees';
import { onPlaza } from './miamiWear';

describe('Triangle Bank under the realistic look', () => {
  it('stays inside the look\'s shader budgets', () => {
    const { ground, props, decals, railSegments, shadowBoxes, contacts, canopies } = buildMiamiGeometry();
    try {
      expect(railSegments.length).toBeLessThanOrEqual(48);
      expect(shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
      const crowns = miamiCanopies(canopies);
      expect(crowns.length).toBeLessThanOrEqual(MAX_CANOPIES);
      // The palms beside the plaza come first: their shade is the one the cameras see.
      expect(crowns.length).toBeGreaterThan(5);
      const count = [ground, props, decals].reduce((n, g) => n + g.getAttribute('position').count, 0);
      expect(count).toBeLessThan(150_000);
      for (const g of [ground, props, decals]) {
        expect(g.getAttribute('position').count % 3).toBe(0);
        expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      }
    } finally {
      for (const g of [ground, props, decals]) g.dispose();
    }
  });

  it('lays every level decal a hair over the ground, never in it, and layers apart', () => {
    const { ground, props, decals } = buildMiamiGeometry();
    try {
      const position = decals.getAttribute('position'), normal = decals.getAttribute('normal');
      let level = 0;
      // Each triangle at its middle, so marks along an edge (the rim's top) are judged by the ground they lie on.
      for (let i = 0; i < position.count; i += 3) {
        if (normal.getY(i) < 0.98) continue;
        const [x, y, z] = [0, 1, 2].map((axis) => [0, 1, 2].reduce((sum, k) => sum + position.getComponent(i + k, axis), 0) / 3);
        const lift = y - miamiSurface(x, z);
        const where = `decal at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`;
        expect(lift, where).toBeGreaterThan(0.2);
        expect(lift, where).toBeLessThan(1);
        level++;
      }
      expect(level).toBeGreaterThan(300);
    } finally {
      for (const g of [ground, props, decals]) g.dispose();
    }
  });

  it('keeps the trees and cars off the plaza, the deck, the lawns, the bank and its landings', () => {
    for (const { at } of [...MIAMI_TREES, ...MIAMI_CARS]) {
      const [x, , z] = at;
      const label = `${(x / F).toFixed(0)}, ${(z / F).toFixed(0)} ft`;
      // Not on the plaza or within ten feet of it.
      expect(onPlaza(x, z, -10 * F), label).toBe(false);
      // Not on the deck, its lawns or the walks round them.
      expect(x > MIAMI_TERRACE_BACK - 20 * F && x < MIAMI_WALL_X + 2 * F && Math.abs(z) < MIAMI_PLAZA_HALF + 16 * F, label).toBe(false);
      // Not anywhere down the line, from the pop over the bank to past the over line's landing.
      expect(Math.abs(z) < 12 * F && x > -20 * F && x < MIAMI_GAP_LAND_X + 40 * F, label).toBe(false);
    }
    // The parked cars stand in the car park, beyond the plaza's left side.
    for (const { at } of MIAMI_PARKED) expect(at[2] - at[0] < -MIAMI_PLAZA_HALF - MIAMI_WALL_X).toBe(true);
    expect(MIAMI_SLAB_APEX_X).toBeGreaterThan(MIAMI_WALL_X);
  });
});
