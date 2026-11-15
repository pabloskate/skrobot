import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type ShaderMaterial } from 'three';
import { MAX_CANOPIES, MAX_CONTACTS, SURFACE } from '../surfaces';
import { treeHeight } from '../props/trees';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import { buildLeapOfFaithGeometry } from './leapOfFaithGeometry';
import { LEAP_OF_FAITH_LOOK, LeapOfFaith3D } from './leapOfFaith3d';
import { LEAP_OF_FAITH_WEEP_HOLES } from './leapOfFaithWear';
import { CORNER_BED } from './leapOfFaithPlanting';
import {
  LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_FILMERS, LEAP_OF_FAITH_BALCONY_BACK,
  LEAP_OF_FAITH_BALCONY_END_Z, LEAP_OF_FAITH_HEAD_Z, leapOfFaithLineZ, leapOfFaithSurface,
} from './leapOfFaithLayout';
import { LEAP_OF_FAITH_TABLES, LEAP_OF_FAITH_BENCHES, buildLeapOfFaithCourt } from './leapOfFaithCourt';
import { buildLeapOfFaithBuildings } from './leapOfFaithBuildings';
import { Bake } from '../../three/bake';
import { tripodStand } from '../tripods';
import { LEAP_OF_FAITH_TREES, LEAP_OF_FAITH_CARS } from './leapOfFaithTrees';

const geometries = (b: ReturnType<typeof buildLeapOfFaithGeometry>) => [b.ground, b.props, b.decals, b.wireMesh.geometry];
/** The decal layer's vertex count: a fingerprint of the wear, updated when the wear is. */
const DECAL_VERTICES = 1152;

describe('Leap of Faith realistic look groundwork', () => {
  it('fits all shader and geometry budgets with finite attributes and disposes every buffer', () => {
    const b = buildLeapOfFaithGeometry();
    try {
      expect(b.railSegments.length).toBeLessThanOrEqual(48);
      expect(b.shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(b.shadowBoxes).toHaveLength(12);
      expect(b.contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
      expect(b.canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
      expect(b.contacts.filter(c => c.count! > 1)).toHaveLength(2);
      expect(b.canopies).toHaveLength(LEAP_OF_FAITH_TREES.length);
      expect(geometries(b).reduce((sum, g) => sum + g.getAttribute('position').count, 0)).toBeLessThan(100_000);
      for (const g of geometries(b)) for (const a of Object.values(g.attributes)) {
        expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
      }
      expect(LEAP_OF_FAITH_LOOK.light).toBe('shader');
      // Its own urethane marks and window sash, never Carlsbad's leaking through the spread look.
      expect(LEAP_OF_FAITH_LOOK.marks).not.toEqual(CARLSBAD_LOOK.marks);
      for (const { x, z } of LEAP_OF_FAITH_LOOK.marks ?? []) {
        expect(x[0]).toBeGreaterThanOrEqual(0);
        expect(x[1]).toBeLessThanOrEqual(85);
        expect(z[0]).toBeGreaterThanOrEqual(-56);
        expect(z[1]).toBeLessThanOrEqual(9);
      }
      expect(LEAP_OF_FAITH_LOOK.stairs?.x).toEqual([0, 9]);
      expect(LEAP_OF_FAITH_LOOK.stairs?.z).toEqual([0, 9]);
      expect(LEAP_OF_FAITH_LOOK.sash).not.toBe(CARLSBAD_LOOK.sash);
      expect(LEAP_OF_FAITH_LOOK.sash?.yaw).toBe(0);
      expect(LEAP_OF_FAITH_LOOK.walls).toBeDefined();
    } finally {
      for (const g of geometries(b)) {
        let disposed = false;
        g.addEventListener('dispose', () => { disposed = true; });
        g.dispose();
        expect(disposed).toBe(true);
      }
    }
  });

  it('keeps drawn treads, the landing and walkway on the physical surface, carrying concrete', () => {
    const b = buildLeapOfFaithGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(b.ground, material);
    try {
      const pos = b.ground.getAttribute('position'), n = b.ground.getAttribute('normal'), ink = b.ground.getAttribute('aInfo');
      let walking = 0;
      for (let i = 0; i < pos.count; i += 3) {
        if (n.getY(i) < 0.999) continue;
        const [x, y, z] = [0, 1, 2].map(axis => [0, 1, 2].reduce((s, k) => s + pos.getComponent(i + k, axis), 0) / 3);
        // Caps are above walking height; the continuous court beneath the stair is occluded by its treads.
        if (Math.abs(y - leapOfFaithSurface(x, z)) > 0.01) continue;
        const hit = new Raycaster(new Vector3(x, y + 0.1, z), new Vector3(0, -1, 0), 0, 0.2).intersectObject(mesh)[0];
        expect(hit?.point.y).toBeCloseTo(leapOfFaithSurface(x, z), 3);
        expect(Math.floor(Math.round(ink.getW(i) * 255) / 4)).toBe(y < -14 * F ? SURFACE.pavers : SURFACE.concrete);
        walking++;
      }
      expect(walking).toBeGreaterThanOrEqual(54);
    } finally { material.dispose(); geometries(b).forEach(g => g.dispose()); }
  });

  it('lays every level decal a hair above the ground under it, never inside a wall or under planting', () => {
    const b = buildLeapOfFaithGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ground = new Mesh(b.ground, material);
    try {
      const p = b.decals.getAttribute('position');
      expect(p.count).toBe(DECAL_VERTICES);
      // Footprints a decal must stay out of, [x0, x1, z0, z1] in feet: the perimeter wall, the tall wall's two
      // legs, the left block, the right wing's lower storey, the undercroft's back and end walls, the big wall
      // under the upper flight, the court's corner bed and the terrace's tree beds.
      const solid = [
        [85, 86, -56, 110], [8.5, 9, 9.5, 110], [0, 9, 9, 9.5], [-60, 2, 24, 110], [0, 85, -116, -63],
        [-14.7, -14, -56, -5], [-14.7, 0, -63, -56], [0, 9, -0.7, 0], [CORNER_BED.x[0], CORNER_BED.x[1], CORNER_BED.z[0], CORNER_BED.z[1]],
        ...LEAP_OF_FAITH_TREES.filter(t => t.at[1] > -F).map(t => [t.at[0] / F - 3.3, t.at[0] / F + 3.3, t.at[2] / F - 3.3, t.at[2] / F + 3.3]),
      ];
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
        const below = new Raycaster(new Vector3(x, y + 5, z), new Vector3(0, -1, 0), 0, 40).intersectObject(ground)[0];
        expect(below, `${x / F},${z / F}`).toBeDefined();
        const lift = y - below.point.y;
        expect(lift, `${x / F},${y / F},${z / F}`).toBeGreaterThan(0.2);
        expect(lift).toBeLessThan(1);
        for (const [x0, x1, z0, z1] of solid) {
          const inside = x / F > x0 + 0.01 && x / F < x1 - 0.01 && z / F > z0 + 0.01 && z / F < z1 - 0.01;
          expect(inside, `decal at ${x / F},${z / F} inside ${[x0, x1, z0, z1]}`).toBe(false);
        }
      }
    } finally { material.dispose(); geometries(b).forEach(g => g.dispose()); }
  });

  it('sets the weep holes on the big wall, a hair proud of its face', () => {
    for (const { x, y, z, radius } of LEAP_OF_FAITH_WEEP_HOLES) {
      // On the face under the upper flight (x 0 to 9 ft, z = -0.7 ft toward the bay), low on it, wholly on it.
      expect(z).toBe(-0.7);
      expect(x - radius).toBeGreaterThan(0);
      expect(x + radius).toBeLessThan(9);
      expect(y - radius).toBeGreaterThan(-14.3);
      expect(y + radius).toBeLessThan(-14.3 + 1.5);
    }
    // The drawn holes stand between half a unit and two units in front of the face, never behind it.
    const b = buildLeapOfFaithGeometry();
    try {
      const p = b.ground.getAttribute('position'), info = b.ground.getAttribute('aInfo');
      let holes = 0;
      for (let i = 0; i < p.count; i++) {
        const [x, y, z] = [p.getX(i) / F, p.getY(i) / F, p.getZ(i) / F];
        if (Math.floor(Math.round(info.getW(i) * 255) / 4) !== SURFACE.metal) continue;
        const hole = LEAP_OF_FAITH_WEEP_HOLES.find(h => Math.hypot(x - h.x, y - h.y) <= h.radius + 1e-6);
        if (!hole) continue;
        holes++;
        expect((-0.7 - z) * F).toBeGreaterThan(0.5);
        expect((-0.7 - z) * F).toBeLessThan(2);
      }
      expect(holes).toBe(LEAP_OF_FAITH_WEEP_HOLES.length * 14 * 3);
    } finally { geometries(b).forEach(g => g.dispose()); }
  });

  it('keeps every tree clear of roofs, the gallery deck, the rider\'s paving and the cameras\' clear volumes', () => {
    // Boxes in feet, [x0, x1, y0, y1, z0, z1]: roofs and the deck a crown must not reach into, then the lower
    // court's and the walkway's clear volumes (SITE_PLAN.md).
    const keepOut = [
      [-60.5, 5.5, 10, 21, 8.5, 110.5], [-122, 87, 0, 13, -118, -56], [-165, -150, 0, 25, -116, 110],
      [153.8, 187.2, -14.3, 3, -96, 124], [-14, 1.5, 10.4, 16.1, -56, 9],
      [9, 80, -13.8, 40, -52, 34], [-40, 0, 0, 12, -56, 20],
    ];
    for (const tree of LEAP_OF_FAITH_TREES) {
      const height = treeHeight(tree);
      const [x, y, z] = tree.at.map(v => v / F);
      const crown = { x, y: y + 0.62 * height / F, z, r: 0.3 * height / F };
      for (const [x0, x1, y0, y1, z0, z1] of keepOut) {
        const dx = Math.max(x0 - crown.x, 0, crown.x - x1), dy = Math.max(y0 - crown.y, 0, crown.y - y1), dz = Math.max(z0 - crown.z, 0, crown.z - z1);
        expect(Math.hypot(dx, dy, dz), `tree at ${x},${z} reaches into ${[x0, x1, z0, z1]}`).toBeGreaterThan(crown.r);
        const trunk = x > x0 && x < x1 && z > z0 && z < z1;
        expect(trunk, `trunk at ${x},${z}`).toBe(false);
      }
      // Off the rider's paving: the walkway's run-up and the court along the line, past the landing.
      if (x > -25 && x < 70) expect(Math.abs(z - leapOfFaithLineZ(x * F) / F)).toBeGreaterThan(12);
    }
  });

  it('keeps the look inside the fragment shaders\' uniform budget', () => {
    const spot = new LeapOfFaith3D();
    try {
      for (const mesh of spot.terrain()) {
        const source = (mesh.material as ShaderMaterial).fragmentShader;
        let vectors = 0;
        for (const m of source.matchAll(/uniform\s+(?:highp\s+|mediump\s+)?(float|int|vec[234]|mat[34]|sampler2D)\s+(\w+)(?:\[(\d+)\])?/g)) {
          vectors += (m[1] === 'mat4' ? 4 : m[1] === 'mat3' ? 3 : 1) * Number(m[3] ?? 1);
        }
        // WebGL2 guarantees 224 fragment uniform vectors; leave three.js room for its own.
        expect(vectors).toBeLessThan(200);
      }
    } finally { spot.dispose(); }
  });

  it('keeps relocated trees, cars and furniture clear of the route, stands and buildings', () => {
    // The original two trees stood inside the new right wing: deliberately replaced by the site plan.
    const placements = [
      ...LEAP_OF_FAITH_TREES.map(t => ({ at: t.at, hx: 3.3 * F, hz: 3.3 * F })),
      ...LEAP_OF_FAITH_CARS.map(t => ({ at: t.at, hx: 3.5 * F, hz: 9 * F })),
      ...LEAP_OF_FAITH_TABLES.map(([x, y, z]) => ({ at: [x * F, y * F, z * F], hx: 2.9 * F, hz: 4 * F })),
      ...LEAP_OF_FAITH_BENCHES.map(([x, z]) => ({ at: [x * F, -14.3 * F, z * F], hx: 0.9 * F, hz: 4 * F })),
    ];
    // Building footprints, [x0, x1, z0, z1] in feet: the left block, the right wing, the far block.
    const footprints = [[-60, 5, 24, 110], [-120, 85, -116, -56], [-165, -150, -116, 110]];
    for (const { at: [x, y, z], hx, hz } of placements) {
      const onWalkway = y >= 0 && x + hx > LEAP_OF_FAITH_BALCONY_BACK && x - hx < 0 && z + hz > LEAP_OF_FAITH_BALCONY_END_Z && z - hz < LEAP_OF_FAITH_HEAD_Z;
      expect(onWalkway).toBe(false);
      if (x > 0 && x < 70 * F) expect((Math.abs(z - leapOfFaithLineZ(x)) - 0.7 * hx - hz) / Math.hypot(1, 0.7)).toBeGreaterThan(8 * F);
      expect(x + hx > 0 && x - hx < 18 * F && z + hz > 0 && z - hz < 35 * F, `${x / F},${z / F}`).toBe(false);
      for (const id of ['bottom', 'side', 'top'] as const) for (const side of ['left', 'right'] as const) {
        const stand = tripodStand(LEAP_OF_FAITH_FILMERS.stairs!, id, side);
        const gap = Math.hypot(Math.max(0, Math.abs(x - stand.u) - hx), Math.max(0, Math.abs(z - stand.z) - hz));
        expect(gap, `${x / F},${z / F}: ${id}/${side}`).toBeGreaterThan(6 * F);
      }
      for (const [x0, x1, z0, z1] of footprints) {
        expect(x + hx > x0 * F && x - hx < x1 * F && z + hz > z0 * F && z - hz < z1 * F).toBe(false);
      }
    }
  });

  it('checks actual new vertices against the lower-court and walkway keep-clear volumes', () => {
    const b = new Bake(color => color);
    const ground = new Bake(color => color);
    buildLeapOfFaithBuildings(b);
    buildLeapOfFaithCourt(b, ground);
    const geometry = b.geometry();
    const paving = ground.geometry();
    try {
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / F, y = p.getY(i) / F, z = p.getZ(i) / F;
        // Fixed piers and explicitly specified overhead deck beams are exceptions to the corridor.
        const pier = x >= -4.101 && x <= -2.599 && [-4.5, -21, -38, -54].some(k => z >= k - 1.501 && z <= k + 0.001);
        if (x > -40 && x < 0 && z > -56 && z < 20 && y > 0.01 && y < 10.4) expect(pier, `walkway ${x},${y},${z}`).toBe(true);
        if (x > 9.04 && x < 80 && z > -52 && z < 34 && y > -13.8) {
          const table = LEAP_OF_FAITH_TABLES.some(([tx, ty, tz]) => Math.abs(x - tx) < 2.9 && Math.abs(z - tz) < 4.01 && y <= ty + 2.6);
          const bench = LEAP_OF_FAITH_BENCHES.some(([bx, bz]) => Math.abs(x - bx) < 0.9 && Math.abs(z - bz) < 4.01 && y <= -12.7);
          expect(table || bench, `court ${x},${y},${z}`).toBe(true);
        }
      }
    } finally {
      geometry.dispose();
      paving.dispose();
    }
  });
});
