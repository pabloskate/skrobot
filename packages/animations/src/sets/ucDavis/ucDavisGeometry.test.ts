import { describe, expect, it } from 'vitest';
import { MAX_CANOPIES, MAX_CONTACTS } from '../surfaces';
import { UC_DAVIS_BLOCKS } from './ucDavisBuildings';
import { buildUcDavisGeometry } from './ucDavisGeometry';
import {
  UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BUILDING_Z1,
  UC_DAVIS_FOOT as F, UC_DAVIS_RUN, UC_DAVIS_STAIR_Z0, UC_DAVIS_WRAP_Z, ucDavisSurface,
} from './ucDavisLayout';
import { UC_DAVIS_CARS, UC_DAVIS_TREES } from './ucDavisTrees';
import { UC_DAVIS_DRIVE } from './ucDavisWear';

describe('UC Davis realistic look', () => {
  it('stays inside the realistic look\'s shader budgets', () => {
    const { ground, props, decals, wireMesh, railSegments, shadowBoxes, contacts, canopies } = buildUcDavisGeometry();
    try {
      expect(railSegments.length).toBeLessThanOrEqual(48);
      expect(shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
      expect(canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
      const count = [ground, props, decals, wireMesh.geometry].reduce((n, g) => n + g.getAttribute('position').count, 0);
      expect(count).toBeLessThan(165_000);
    } finally {
      for (const g of [ground, props, decals, wireMesh.geometry]) g.dispose();
    }
  });

  it('lays every level decal a hair over the ground, never in it, and layers apart', () => {
    const { decals, ground, props, wireMesh } = buildUcDavisGeometry();
    try {
      const position = decals.getAttribute('position'), normal = decals.getAttribute('normal');
      let level = 0;
      // Each triangle at its middle, so marks along an edge (the coping's band) are judged by the ground they lie on.
      for (let i = 0; i < position.count; i += 3) {
        if (normal.getY(i) < 0.98) continue;
        const [x, y, z] = [0, 1, 2].map((axis) => [0, 1, 2].reduce((sum, k) => sum + position.getComponent(i + k, axis), 0) / 3);
        const lift = y - ucDavisSurface(x, z);
        const where = `decal at ${(x / F).toFixed(1)}, ${(z / F).toFixed(1)} ft`;
        expect(lift, where).toBeGreaterThan(0.2);
        expect(lift, where).toBeLessThan(1);
        level++;
      }
      expect(level).toBeGreaterThan(300);
    } finally {
      for (const g of [ground, props, decals, wireMesh.geometry]) g.dispose();
    }
  });

  it('keeps the trees and parked cars off the line, the bank, the landing and the buildings', () => {
    for (const { at } of [...UC_DAVIS_TREES, ...UC_DAVIS_CARS]) {
      const [x, , z] = at;
      const label = `${(x / F).toFixed(0)}, ${(z / F).toFixed(0)} ft`;
      // Not on the terrace's run-up, the bank, the stairs, the side bed or the sidewalk below them.
      expect(x > UC_DAVIS_BUILDING_BACK_X && x < UC_DAVIS_DRIVE[0] && z > UC_DAVIS_STAIR_Z0 - 2 * F && z < UC_DAVIS_WRAP_Z + 2 * F, label).toBe(false);
      // Not on the roll-away, across the drive and beyond.
      expect(x > UC_DAVIS_RUN && x < UC_DAVIS_RUN + 45 * F && Math.abs(z) < 12 * F, label).toBe(false);
      // Not inside the red wing or either campus block.
      expect(x > UC_DAVIS_BUILDING_BACK_X && x < UC_DAVIS_BUILDING_FRONT_X && z > UC_DAVIS_BUILDING_Z0 && z < UC_DAVIS_BUILDING_Z1, label).toBe(false);
      for (const b of UC_DAVIS_BLOCKS) expect(x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1, label).toBe(false);
    }
  });
});
