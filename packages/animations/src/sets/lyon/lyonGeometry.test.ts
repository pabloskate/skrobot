import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildLyonGeometry } from './lyonGeometry';
import {
  LYON_DROP, LYON_FOOT as F, LYON_LEFT_Z, LYON_RIGHT_Z, LYON_RISER,
  LYON_RUN, LYON_STEPS, LYON_TREAD, LYON_WALL_TOP, lyonGround,
} from './lyonLayout';

describe('Lyon 25 measured flight and photographed courtyard', () => {
  it('preserves the supplied feet exactly, with 25 risers and 24 treads', () => {
    expect(LYON_DROP).toBe(14.76 * F);
    expect(LYON_RUN).toBe(21.29 * F);
    expect(LYON_DROP / F * 0.3048).toBeCloseTo(4.498848, 8);
    expect(LYON_RUN / F * 0.3048).toBeCloseTo(6.489192, 8);
    const built = buildLyonGeometry();
    try {
      const p = built.ground.getAttribute('position');
      const n = built.ground.getAttribute('normal');
      const info = built.ground.getAttribute('aInfo');
      const risers = new Map<number, number[]>();
      for (let i = 0; i < p.count; i++) {
        if (Math.round(info.getX(i) * 255) !== 40 || n.getX(i) !== 1) continue;
        const heights = risers.get(p.getX(i)) ?? [];
        heights.push(p.getY(i));
        risers.set(p.getX(i), heights);
      }
      expect(risers.size).toBe(25);
      const xs = [...risers.keys()].sort((a, b) => a - b);
      expect(xs[0]).toBe(0);
      expect(xs[xs.length - 1]).toBeCloseTo(LYON_RUN, 4);
      xs.forEach((x, i) => {
        expect(x).toBeCloseTo(i * LYON_TREAD, 4);
        expect(Math.max(...risers.get(x)!)).toBeCloseTo(-i * LYON_RISER, 4);
        expect(Math.min(...risers.get(x)!)).toBeCloseTo(-(i + 1) * LYON_RISER, 4);
      });
    } finally { built.ground.dispose(); built.props.dispose(); }
  });

  it('has one physical floor at every tread and landing, matching the rider collision profile', () => {
    const built = buildLyonGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    try {
      const xs = [-12.7 * F, -0.001, ...Array.from({ length: LYON_STEPS - 1 }, (_, i) => (i + 0.42) * LYON_TREAD), LYON_RUN + 0.001, LYON_RUN + 12.3 * F];
      for (const x of xs) for (const z of [LYON_LEFT_Z + 1.7 * F, 0.31 * F, LYON_RIGHT_Z - 1.4 * F]) {
        const ray = new Raycaster(new Vector3(x, F, z), new Vector3(0, -1, 0), 0, 18 * F);
        const floors = ray.intersectObject(mesh).filter(hit => Math.abs(hit.face!.normal.y) > 0.9);
        expect(floors, `physical floor at ${x}, ${z}`).toHaveLength(1);
        expect(floors[0].point.y).toBeCloseTo(lyonGround(x), 4);
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('keeps the tall park-side retaining wall and leaves the broad flight free of center rails', () => {
    const built = buildLyonGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.ground, material);
      const x = LYON_RUN + 5 * F;
      const ray = new Raycaster(new Vector3(x, -8 * F, 0), new Vector3(0, 0, -1), 0, 30 * F);
      const hit = ray.intersectObject(mesh)[0];
      expect(hit.point.z).toBeCloseTo(LYON_LEFT_Z, 4);
      expect(LYON_WALL_TOP).toBeGreaterThan(0);
      const slopes = built.railSegments.filter(({ a, b }) => Math.abs(a[0] - b[0]) > F);
      expect(slopes).toHaveLength(1);
      expect(slopes[0].a[2]).toBeGreaterThan(LYON_RIGHT_Z - F);
      expect(built.railSegments.every(({ a, b }) => a[2] > LYON_RIGHT_Z - F && b[2] > LYON_RIGHT_Z - F)).toBe(true);
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); }
  });

  it('stays finite and merges the detailed facade, pavers and volumetric trees within the mobile budget', () => {
    const built = buildLyonGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props]) {
        vertices += geometry.getAttribute('position').count;
        expect(geometry.getAttribute('position').count % 3).toBe(0);
        for (const key of ['position', 'normal', 'aColor', 'aCorner']) expect(Array.from(geometry.getAttribute(key).array).every(Number.isFinite)).toBe(true);
        expect(Array.from(geometry.getAttribute('aCorner').array).every(value => value === 0)).toBe(true);
      }
      expect(vertices).toBeLessThan(150_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally { built.ground.dispose(); built.props.dispose(); }
  });
});
