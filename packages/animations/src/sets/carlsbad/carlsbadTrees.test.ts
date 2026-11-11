import { describe, expect, it } from 'vitest';
import type { ShaderMaterial } from 'three';
import { rad } from '../../math';
import { SUN } from '../../three/materials';
import { planStairs, stairTrack } from '../elToro/stairs';
import { crownSpheres, treeCrowns, type TreePlacement } from '../props/trees';
import { tripodStand } from '../tripods';
import { MAX_CANOPIES } from '../surfaces';
import { Carlsbad3D, carlsbadCanopies, CARLSBAD_LOOK } from './carlsbad3d';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_FILMERS,
  CARLSBAD_FOOT as F,
  CARLSBAD_FOOTPRINTS,
  CARLSBAD_TERRAIN,
  CARLSBAD_WING_YAW,
  carlsbadBuilt,
  carlsbadLanding,
  carlsbadPaved,
  carlsbadStairGround,
  carlsbadSurface,
  carlsbadUpperEdge,
} from './carlsbadLayout';
import { carlsbadTrees } from './carlsbadTrees';

type P3 = readonly [number, number, number];
const feet = (v: number) => v / F;
const wing = CARLSBAD_FOOTPRINTS.find((b) => b.name === 'wing')!;
const portable = CARLSBAD_FOOTPRINTS.find((b) => b.name === 'portable')!;
const second = CARLSBAD_FOOTPRINTS.find((b) => b.name === 'second-portable')!;
const zSpan = (b: typeof wing) => [Math.min(...b.roof.map((p) => p[1])), Math.max(...b.roof.map((p) => p[1]))];

/** How far past the wing's far wall (the side away from the pad), in feet; negative on the pad's side of it. */
function pastWing(x: number, z: number): number {
  const across = (px: number, pz: number) => -px * Math.sin(rad(CARLSBAD_WING_YAW)) + pz * Math.cos(rad(CARLSBAD_WING_YAW));
  const far = Math.min(...wing.roof.map(([px, pz]) => across(px, pz)));
  return feet(far - across(x, z));
}

/** The rider's whole line: the run-up down the covered walk (and 10 ft before the clip starts), the carve, the flight and the roll-away (and 12 ft past its end). */
const plan = planStairs({ popHeight: 1 }, true, CARLSBAD_TERRAIN);
const track = Array.from({ length: Math.ceil(plan.end / 0.02) + 1 }, (_, i) => stairTrack(plan, Math.min(plan.end, i * 0.02), 0));
const riderLine: [number, number][] = [
  ...Array.from({ length: 11 }, (_, i) => {
    const s = track[0], back = (10 - i) * F;
    return [s.x - Math.cos(rad(s.yaw)) * back, s.z - Math.sin(rad(s.yaw)) * back] as [number, number];
  }),
  ...track.map((a) => [a.x, a.z] as [number, number]),
  ...Array.from({ length: 12 }, (_, i) => {
    const e = track[track.length - 1];
    return [e.x + (i + 1) * F, e.z] as [number, number];
  }),
];

/** Where the filmers' lenses stand, on either side of the line a viewer asks for (tripods.ts). */
const stands = (['bottom', 'side', 'top'] as const).flatMap((id) =>
  (['left', 'right'] as const).map((side) => {
    const s = tripodStand(CARLSBAD_FILMERS.stairs, id, side);
    return [`${id} (${side})`, [s.u, s.height, s.z] as P3] as const;
  }),
);
/** What every filmer must see: the rider down the whole line (feet to a popped head), the stairs and the bank below the lip. */
const subjects: P3[] = [
  ...track
    .filter((_, i) => i % 5 === 0)
    .flatMap((a) => [0.5, 3, 6, 8].map((h) => [a.x, carlsbadSurface(a.x, a.z) + h * F, a.z] as P3)),
  ...[1, 4, 7, 10].flatMap((x) =>
    [6, 10.5, 15].map((z) => [x * F, carlsbadStairGround(x * F) + 0.2 * F, z * F] as P3),
  ),
  ...[2, 6, 10].flatMap((x) => [-2, -6, -10, -16].map((z) => [x * F, carlsbadSurface(x * F, z * F) + 0.2 * F, z * F] as P3)),
];

/** Does the segment a→b pass through a tree: a crown sphere, or its trunk (a foot-wide post up to the lowest crown)? */
function blocks(tree: TreePlacement, a: P3, b: P3): boolean {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  const crowns = treeCrowns(tree);
  for (const { center, radius } of crowns) {
    const t = Math.max(0, Math.min(1, ((center[0] - a[0]) * d[0] + (center[1] - a[1]) * d[1] + (center[2] - a[2]) * d[2]) / dd));
    if (Math.hypot(a[0] + d[0] * t - center[0], a[1] + d[1] * t - center[1], a[2] + d[2] * t - center[2]) < radius) return true;
  }
  const top = Math.min(...crowns.map((c) => c.center[1]));
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, y = a[1] + d[1] * t;
    if (y < tree.at[1] || y > top) continue;
    if (Math.hypot(a[0] + d[0] * t - tree.at[0], a[2] + d[2] * t - tree.at[2]) < 1 * F) return true;
  }
  return false;
}

describe('Carlsbad trees', () => {
  const trees = carlsbadTrees();
  const at = (t: TreePlacement) => `${t.species} at (${feet(t.at[0]).toFixed(0)}, ${feet(t.at[2]).toFixed(0)})`;

  it('plants a sensible number for a phone, each with its own seed', () => {
    expect(trees.length).toBeGreaterThan(30);
    expect(trees.length).toBeLessThanOrEqual(50);
    expect(new Set(trees.map((t) => t.seed)).size).toBe(trees.length);
  });

  it('stands every tree on the ground, its foot just under the surface', () => {
    for (const t of trees) {
      const ground = carlsbadSurface(t.at[0], t.at[2]);
      expect(t.at[1]).toBeLessThanOrEqual(ground);
      expect(t.at[1]).toBeGreaterThan(ground - 1 * F);
    }
  });

  it('stands no trunk on paving, but for the lawn strips past the wing’s far wall the plan paves', () => {
    for (const t of trees) {
      if (!carlsbadPaved(t.at[0], t.at[2])) continue;
      // carlsbadPaved paves the whole upper level off the west lawn; the 2010 aerial has
      // lawn strips with trees on the wing's far side, out of every tripod's sight behind it.
      expect(t.at[0] <= carlsbadUpperEdge(t.at[2]), at(t)).toBe(true);
      expect(pastWing(t.at[0], t.at[2]), at(t)).toBeGreaterThan(5);
    }
  });

  it('keeps every trunk at least 5 ft from a roof', () => {
    for (const t of trees) expect(carlsbadBuilt(t.at[0], t.at[2], 5 * F), at(t)).toBe(false);
  });

  it('keeps the rider’s line clear: no trunk within 8 ft of the run-up, the carve, the flight or the roll-away', () => {
    for (const t of trees) {
      const near = Math.min(...riderLine.map(([x, z]) => Math.hypot(x - t.at[0], z - t.at[2])));
      expect(feet(near), at(t)).toBeGreaterThan(8);
    }
  });

  it('hides nothing from the filmers: every tripod sees the rider, the stairs and the bank past every crown and trunk', () => {
    for (const [name, eye] of stands) {
      const near = trees.filter((t) => Math.hypot(t.at[0] - eye[0], t.at[2] - eye[2]) < 150 * F);
      for (const s of subjects) {
        for (const t of near) expect(blocks(t, eye, s), `${name} tripod to (${s.map((v) => feet(v).toFixed(0))}): ${at(t)}`).toBe(false);
      }
    }
  });

  it('keeps the lawn between the portables open but for the young row, and one gum on the bank top past the wing', () => {
    const [, secondEnd] = zSpan(second), [portableEnd] = zSpan(portable);
    for (const t of trees) {
      const x = feet(t.at[0]), z = t.at[2];
      if (x > 0 && x < 66 && z > secondEnd && z < portableEnd) {
        expect(t.species === 'ornamental' || (x < 6 && pastWing(t.at[0], z) > 5), at(t)).toBe(true);
      }
    }
  });

  it('plants the young row of refs/191: four thin trees on the lawn before the block wall, uneven in every way', () => {
    const [, secondEnd] = zSpan(second), [portableEnd] = zSpan(portable);
    const row = trees
      .filter((t) => t.species === 'ornamental' && t.at[2] > secondEnd && t.at[2] < portableEnd)
      .sort((a, b) => a.at[2] - b.at[2]);
    expect(row).toHaveLength(4);
    for (const t of row) {
      // Standing back toward the wall (x = 66), on its lawn, off the curved path; young and small.
      expect(feet(t.at[0])).toBeGreaterThan(55);
      expect(feet(t.at[0])).toBeLessThan(63);
      expect(carlsbadPaved(t.at[0], t.at[2])).toBe(false);
      expect(feet(t.height!)).toBeLessThan(18);
    }
    // The nearest a few yards off the first portable's end.
    expect(feet(portableEnd - row[3].at[2])).toBeLessThan(20);
    const gaps = row.slice(1).map((t, i) => Math.round(feet(t.at[2] - row[i].at[2])));
    expect(new Set(gaps).size).toBe(gaps.length);
    expect(new Set(row.map((t) => Math.round(feet(t.at[0])))).size).toBeGreaterThan(2);
    expect(new Set(row.map((t) => t.height)).size).toBe(row.length);
    expect(new Set(row.map((t) => t.yaw)).size).toBe(row.length);
  });

  it('puts the big trees and palms off the spot: palms only far out on the skyline', () => {
    for (const t of trees.filter((t) => t.species === 'fanPalm')) {
      expect(feet(Math.hypot(t.at[0], t.at[2])), at(t)).toBeGreaterThan(200);
    }
  });

  it('fills the skyline beyond the wing, behind the wall and over the west lawn', () => {
    const big = trees.filter((t) => t.species !== 'ornamental');
    expect(big.filter((t) => pastWing(t.at[0], t.at[2]) > 5).length).toBeGreaterThanOrEqual(8);
    expect(big.filter((t) => feet(t.at[0]) > 70).length).toBeGreaterThanOrEqual(8);
    expect(big.filter((t) => t.at[2] > 17 * F && feet(t.at[0]) < 11).length).toBeGreaterThanOrEqual(3);
  });

  describe('their shade', () => {
    const canopies = carlsbadCanopies(trees);
    /** Where a sun ray from a point meets the ground: the upper level's plane, else the lower ground. */
    const foot = (p: readonly number[]): [number, number] => {
      let x = p[0] - (SUN.x * p[1]) / SUN.y, z = p[2] - (SUN.z * p[1]) / SUN.y;
      if (x <= carlsbadUpperEdge(z)) return [x, z];
      for (let i = 0; i < 2; i++) {
        const s = (p[1] - carlsbadLanding(x)) / SUN.y;
        [x, z] = [p[0] - SUN.x * s, p[2] - SUN.z * s];
      }
      return [x, z];
    };
    /** Points across the crown's shadow: its middle and a ring at 80% of its radius, square to the sun. */
    const shadow = ({ at: c, radius: r }: { at: readonly number[]; radius: number }) => {
      const u = [SUN.z, 0, -SUN.x].map((v) => v / Math.hypot(SUN.x, SUN.z));
      const w = [SUN.y * u[2] - SUN.z * u[1], SUN.z * u[0] - SUN.x * u[2], SUN.x * u[1] - SUN.y * u[0]];
      return [[0, 0], ...Array.from({ length: 12 }, (_, i) => [Math.cos(i * Math.PI / 6) * 0.8, Math.sin(i * Math.PI / 6) * 0.8])].map(
        ([a, b]) => foot([0, 1, 2].map((k) => c[k] + (u[k] * a + w[k] * b) * r)),
      );
    };

    it('dapples the ground with real crowns, inside the canopy budget', () => {
      expect(canopies.length).toBeGreaterThan(0);
      expect(canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
      const crowns = crownSpheres(trees);
      for (const c of canopies) {
        expect(crowns.some((s) => s.center.every((v, i) => v === c.at[i]) && s.radius === c.radius)).toBe(true);
      }
    });

    it('spends it only on crowns whose shade falls on paving in view: the lower paths and the upper pad, both', () => {
      const lower = (x: number, z: number) => x > carlsbadUpperEdge(z) && carlsbadPaved(x, z) && x < 60 * F && z > -75 * F && z < 62 * F;
      const upper = (x: number, z: number) => x <= carlsbadUpperEdge(z) && carlsbadPaved(x, z) && x > -60 * F && z > -25 * F && z < 20 * F;
      let onLower = 0, onUpper = 0;
      for (const c of canopies) {
        const spots = shadow(c);
        const l = spots.some(([x, z]) => lower(x, z)), u = spots.some(([x, z]) => upper(x, z));
        expect(l || u, `crown at (${c.at.map((v) => feet(v).toFixed(0))})`).toBe(true);
        onLower += +l;
        onUpper += +u;
      }
      expect(onLower).toBeGreaterThan(0);
      expect(onUpper).toBeGreaterThan(0);
    });

    it('casts none from the far side of the wing or the far skyline', () => {
      for (const c of canopies) {
        expect(pastWing(c.at[0], c.at[2])).toBeLessThan(0);
        expect(feet(Math.hypot(c.at[0], c.at[2]))).toBeLessThan(120);
      }
    });
  });

  it('draws in its look, with the wall’s shade inside the shadow-box budget', () => {
    const spot = new Carlsbad3D(), built = buildCarlsbadGeometry();
    try {
      expect(spot.propInk).toBe(CARLSBAD_LOOK.ink);
      const [ground, props] = spot.terrain().map((m) => m.material as ShaderMaterial);
      expect(built.shadowBoxes.length + 1).toBeLessThanOrEqual(12);
      expect(props.uniforms.uBoxCount.value).toBe(built.shadowBoxes.length + 1);
      expect(ground.uniforms.uCanopyCount.value).toBe(carlsbadCanopies().length);
    } finally {
      spot.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });
});
