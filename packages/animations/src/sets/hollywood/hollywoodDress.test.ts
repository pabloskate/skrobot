import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { buildHollywoodGeometry, HOLLYWOOD_PALMS, HOLLYWOOD_TREES, type HollywoodFlight } from './hollywood3d';
import {
  HOLLYWOOD_12_FILMERS, HOLLYWOOD_12_LIP, HOLLYWOOD_12_RUN, HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_CHEEK_Z,
  HOLLYWOOD_FENCE_TERRAIN, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FILMERS, HOLLYWOOD_LANE_Z, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RUN,
  HOLLYWOOD_FOOT as F, hollywoodSurface,
} from './hollywoodLayout';
import { turnPoint } from './turn';

/**
 * The dress pass's guards: wear marks only on open paving, the rider's lines and the filmers' stands kept clear of
 * dressing, the one lettered plate the only lettering, and the new skyline kept off the sidewalk and the trees.
 */

const FLIGHTS: HollywoodFlight[] = ['sixteen', 'twelve'];

interface Vertex { at: [number, number, number]; up: number; id: number; solid: number; color: string }

/** Every vertex in the sixteen's frame, with its ink id and paint. */
function vertices(geometry: BufferGeometry, flight: HollywoodFlight): Vertex[] {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), info = geometry.getAttribute('aInfo'), c = geometry.getAttribute('aColor');
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return Array.from({ length: p.count }, (_, i) => {
    const point: [number, number, number] = [p.getX(i), p.getY(i), p.getZ(i)];
    return {
      at: flight === 'twelve' ? turnPoint(HOLLYWOOD_12_LIP, point) : point,
      up: n.getY(i),
      id: Math.round(info.getX(i) * 255),
      solid: Math.floor((info.getW(i) * 255) / 4 + 0.01),
      color: `#${hex(c.getX(i))}${hex(c.getY(i))}${hex(c.getZ(i))}`,
    };
  });
}

/** What stands on the ground in plan (feet, the sixteen's frame): walls, the auditorium, the court walls and the south block. */
const FOOTPRINTS: Array<[number, number, number, number]> = [
  [-88.5, -66, HOLLYWOOD_BUILDING_FACE / F, 25], [-6, 16.5, HOLLYWOOD_BUILDING_FACE / F, 25],
  [-66.75, -5.25, 8, 31], [-108, 36, 31, 110],
  [16.5, 50, 36, 37], [49, 50, 10, 36], [47, 49, 8, 10],
  [-116, -88.5, 36, 37], [-116, -115, 10, 36], [-115, -113, 8, 10],
  [60, 150, 14, 70],
];

/**
 * Dressing that stands in the way: a solid drawn without one of the spot's outline inks (the fixed rails, mesh and
 * pickets carry theirs, 60 and up) but with a surface of its own, on any of a box's six faces (ink ids 0-5). Flush
 * paint skins (drips down a riser, a plate on a wall) carry no surface and cannot trip anyone.
 */
const dressing = (v: Vertex) => v.id < 6 && v.solid !== 0;

describe('Hollywood High dressing', () => {
  it.each(FLIGHTS)('lays every ground mark on open paving, never under a wall, in a tree well or in the air, in the %s frame', flight => {
    const built = buildHollywoodGeometry(flight);
    try {
      const level = vertices(built.decals, flight).filter(v => v.up > 0.9);
      expect(level.length).toBeGreaterThan(1000);
      for (let t = 0; t + 2 < level.length; t += 3) {
        const corners = level.slice(t, t + 3);
        for (const { at: [x, y, z] } of corners) {
          const lift = y - hollywoodSurface(x, z);
          expect(lift).toBeGreaterThan(0);
          expect(lift).toBeLessThanOrEqual(0.025 * F + 1e-3);
        }
        const [cx, , cz] = [0, 1, 2].map(k => corners.reduce((sum, v) => sum + v.at[k], 0) / 3);
        for (const [x0, x1, z0, z1] of FOOTPRINTS) expect(cx > x0 * F && cx < x1 * F && cz > z0 * F && cz < z1 * F).toBe(false);
        for (const { at: [tx, , tz] } of HOLLYWOOD_TREES) expect(Math.abs(cx - tx) < 2 * F && Math.abs(cz - tz) < 2 * F).toBe(false);
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });

  it.each(FLIGHTS)('keeps dressing off the three rider lines in the %s frame', flight => {
    const built = buildHollywoodGeometry(flight);
    try {
      const solid = vertices(built.props, flight).filter(dressing);
      // Both stair lines run on the street half (z = -4 ft in the sixteen's frame, the twelve's turned onto it),
      // from their run-ups to well past their landings; the fence line from its run-up to past touchdown.
      const stairs = (x: number) => x > (HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - 40 * F) && x < HOLLYWOOD_RUN + 40 * F;
      // (Back past x = -16 ft the line, drawn straight on, would leave the walkway for the entry stair.)
      const fence = (x: number) => x > -16 * F && x < HOLLYWOOD_FENCE_TERRAIN.run + 20 * F;
      for (const { at: [x, y, z] } of solid) {
        const lift = y - hollywoodSurface(x, z);
        if (!stairs(x) || lift < 0.3 * F || lift > 6.5 * F) continue;
        expect(Math.abs(z - HOLLYWOOD_LANE_Z)).toBeGreaterThan(1.5 * F);
      }
      // The fence line, as the rider takes it: no dressing within a foot and a half of its path over the cheek and
      // down. The fixed fence and mesh planes it is meant to clear are not dressing in its way.
      const entry = HOLLYWOOD_FENCE_TERRAIN.entry;
      if (!entry) throw new Error('the fence line has no entry');
      const path = (x: number) => entry.z + (x - entry.x) * Math.tan(entry.yaw * Math.PI / 180);
      for (const { at: [x, y, z] } of solid) {
        if (!fence(x) || Math.abs(z - HOLLYWOOD_FENCE_Z) < 0.6 * F || Math.abs(z - (HOLLYWOOD_LEFT_Z - 0.22 * F)) < 0.6 * F) continue;
        const lift = y - hollywoodSurface(x, z);
        if (lift < 0.3 * F || lift > 8 * F) continue;
        expect(Math.abs(z - path(x))).toBeGreaterThan(1.5 * F);
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });

  it.each(FLIGHTS)('stands no dressing within eight feet of a filmer in the %s frame', flight => {
    const built = buildHollywoodGeometry(flight);
    try {
      const solid = vertices(built.props, flight).filter(dressing)
        // The fixed pickets and their spears, the mesh, and the wings' face with the sixteen's flush plinth, beside the
        // stands as they always were.
        .filter(({ at: [, , z] }) => Math.abs(z - HOLLYWOOD_FENCE_Z) > 0.6 * F && Math.abs(z - (HOLLYWOOD_LEFT_Z - 0.22 * F)) > 0.6 * F
          && Math.abs(Math.abs(z) - HOLLYWOOD_BUILDING_FACE) > 0.1 * F);
      const filmers = flight === 'sixteen' ? HOLLYWOOD_FILMERS : HOLLYWOOD_12_FILMERS;
      const stands = [
        ...Object.values(filmers.stairs.stands), ...Object.values(filmers.stairs.across ?? {}),
        ...Object.values(filmers.obstacles ?? {}).flatMap(o => [...Object.values(o.stands), ...Object.values(o.across ?? {})]),
      ];
      expect(stands.length).toBeGreaterThan(3);
      for (const stand of stands) {
        // A stand is in its flight's frame: the sixteen's own, or the twelve's turned half round.
        const [sx, , sz] = flight === 'sixteen' ? [stand.u, 0, stand.z] : turnPoint(HOLLYWOOD_12_LIP, [stand.u, 0, stand.z]);
        for (const { at: [x, y, z] } of solid) {
          if (y > stand.height + 3 * F) continue;
          expect(Math.hypot(x - sx, z - sz)).toBeGreaterThan(8 * F);
        }
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });

  it('letters only the one sign plate on the sixteen’s wing', () => {
    const built = buildHollywoodGeometry('sixteen');
    try {
      const ink = vertices(built.props, 'sixteen').filter(v => v.color === '#374348');
      expect(ink.length).toBeGreaterThan(0);
      for (const { at: [x, y, z] } of ink) {
        expect(x).toBeGreaterThan(93); expect(x).toBeLessThan(161);
        expect(y).toBeGreaterThan(14); expect(y).toBeLessThan(42);
        expect(Math.abs(z - HOLLYWOOD_BUILDING_FACE)).toBeLessThan(3);
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });

  it('keeps the skyline’s blocks off the sidewalk strip and fifteen feet clear of every tree and palm', () => {
    const built = buildHollywoodGeometry('sixteen');
    try {
      // Tall stucco and window-band faces: what the far side and the closures are built of.
      const tall = vertices(built.props, 'sixteen').filter(v => dressing(v) && v.at[1] > 10 * F && (v.color === '#7c8184' || ['#cbc9bd', '#bfae93', '#b6b4a5', '#d8d7cb'].includes(v.color)));
      expect(tall.length).toBeGreaterThan(100);
      for (const { at: [x, , z] } of tall) {
        expect(z > -28 * F && z < HOLLYWOOD_CHEEK_Z - 0.01).toBe(false);
        for (const { at: [tx, , tz] } of [...HOLLYWOOD_TREES, ...HOLLYWOOD_PALMS]) expect(Math.hypot(x - tx, z - tz)).toBeGreaterThan(15 * F);
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });
});
