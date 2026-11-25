import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { tag } from '../lookKit';
import { wallVertex, type ContactLine, type WallAt } from '../surfaces';
import { WATER_TOWER_FOOT as F, WATER_TOWER_HEIGHT, WATER_TOWER_OVERHANG, WATER_TOWER_ROOF_RADIUS } from './waterTowerLayout';
import { point } from './waterTowerKit';
import { WATER_TOWER_PAINT as PAINT } from './waterTowerPalette';

/** A box that shades the ground and props, turned `yaw` radians about the vertical (classicSpot3d's shadowBoxes). */
export type ShadowBox = { min: Vec3; max: Vec3; yaw: number };

/** Faces round each ridden tank: enough that its rim stays round from a filmer standing on the roof. */
const SIDES = 224;

/**
 * The stepped edge and the wall below it, in feet under the roof (read from 03, 09, 11, 49, 66 and 71): a thin
 * slab lip standing out furthest, a ring beam set back a few inches under it, a soffit back to the wall, a
 * shadowed reveal at the wall's head, then the wall down to a pale footing apron round its foot.
 */
const LIP = 0.55;
const BEAM_SETBACK = 0.28;
const BEAM_FOOT = 2.45;
const REVEAL_FOOT = 2.83;
const FOOTING_RISE = 0.45;
const FOOTING_WIDTH = 3.25;

/** Pale vertical strips round each wall (03, 66, 67): two faces in every eight, 28 round the drum, nearly five feet wide. */
const isStrip = (k: number) => k % 8 < 2;
/** How far the wall's wear reaches back across the footing from the wall's foot: well past the apron. */
const FOOTING_DOWN = 40;

/**
 * One of the two ridden tanks, centred `centre` feet along the line: the roof disc in the ground mesh (only the
 * ground takes the rider's shadow), the edge, wall and footing in the props, and six boxes for its shade. The
 * wall and the footing's top carry the look's wall wear, measured round the drum from the side away from the
 * slot, so the pattern's one seam is where nobody films.
 */
export function tank(ground: Bake, props: Bake, shadows: ShadowBox[], centre: number) {
  const radius = WATER_TOWER_ROOF_RADIUS / F, wall = radius - WATER_TOWER_OVERHANG / F, pad = -WATER_TOWER_HEIGHT / F;
  const rim = (k: number, r: number, y: number) =>
    point(centre + r * Math.cos((k * 2 * Math.PI) / SIDES), y, r * Math.sin((k * 2 * Math.PI) / SIDES));
  const concrete = tag('concrete');
  // The face round the drum from the far side: the takeoff tank faces the slot at +x, the landing tank at -x.
  const seam = centre < 0 ? SIDES / 2 : 0;
  const foot = pad + FOOTING_RISE;
  // One face's width round the wall, in set units.
  const step = ((2 * Math.PI * wall) / SIDES) * F;
  for (let k = 0; k < SIDES; k++) {
    ground.triangle(point(centre, 0, 0), rim(k + 1, radius, 0), rim(k, radius, 0), [0, 1, 0], { color: PAINT.roof }, concrete);
    const outward = (i: number): Vec3 => [Math.cos((i * 2 * Math.PI) / SIDES), 0, Math.sin((i * 2 * Math.PI) / SIDES)];
    // A ring between two circles, from (outer, top) down or across to (inner, base): level where both are at
    // one height, otherwise upright and facing out, smooth round the drum.
    const ring = (outer: number, top: number, inner: number, base: number, color: string) => {
      const facing = (i: number): Vec3 => (top === base ? [0, inner > outer ? 1 : -1, 0] : outward(i));
      const ends = [rim(k, outer, top), rim(k + 1, outer, top), rim(k + 1, inner, base), rim(k, inner, base)];
      const normals = [facing(k), facing(k + 1), facing(k + 1), facing(k)];
      for (const i of [0, 1, 2, 0, 2, 3]) props.vertex(ends[i], normals[i], { color }, concrete);
    };
    // A ring that carries the wall wear: each corner says how far round the drum it is, and how far (feet) above
    // the wall's foot and below its head, as `place` reckons them from its radius and height.
    const along = ((k - seam + SIDES) % SIDES) * step;
    const worn = (outer: number, top: number, inner: number, base: number, color: string, place: (r: number, y: number) => [number, number]) => {
      const corners: Array<[number, number, number]> = [[k, outer, top], [k + 1, outer, top], [k + 1, inner, base], [k, inner, base]];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [index, r, y] = corners[i];
        const [up, down] = place(r, y);
        const at: WallAt = { along: along + (index - k) * step, up: up * F, down: down * F };
        wallVertex(props, rim(index, r, y), top === base ? [0, 1, 0] : outward(index), { color }, concrete, at, 'cast');
      }
    };
    const beam = radius - BEAM_SETBACK;
    // The lip and the ring beam are worn from their own top edges, with no ground at their feet to dirty them:
    // plain bands under the roof, as the footage shows them, without the stock streaks' smudges.
    const hung = (top: number) => (_: number, y: number): [number, number] => [FOOTING_DOWN, top - y];
    worn(radius, 0, radius, -LIP, PAINT.lip, hung(0));
    ring(radius, -LIP, beam, -LIP, PAINT.lipUnder);
    worn(beam, -LIP, beam, -BEAM_FOOT, PAINT.beam, hung(-LIP));
    ring(beam, -BEAM_FOOT, wall, -BEAM_FOOT, PAINT.soffit);
    // The wall from under the soffit, its shadowed reveal first, down to the footing.
    const onWall = (_: number, y: number): [number, number] => [y - foot, -BEAM_FOOT - y];
    worn(wall, -BEAM_FOOT, wall, -REVEAL_FOOT, PAINT.reveal, onWall);
    worn(wall, -REVEAL_FOOT, wall, foot, isStrip(k) ? PAINT.strip : PAINT.wall, onWall);
    // The footing's top, worn as though the wall ran on across it: dirt and damp kept against the wall's foot.
    worn(wall, foot, wall + FOOTING_WIDTH, foot, PAINT.footing, (r) => [r - wall, FOOTING_DOWN]);
    ring(wall + FOOTING_WIDTH, foot, wall + FOOTING_WIDTH, pad, PAINT.footingKerb);
  }
  // The drum's shade as six strips through its centre, 30 degrees apart, each as wide as a 30-degree sector at
  // either end: together a twelve-sided column just inside the wall.
  for (let i = 0; i < 6; i++) {
    const yaw = (i * Math.PI) / 6, x = centre * Math.cos(yaw), z = -centre * Math.sin(yaw);
    const length = wall * 0.982, width = wall * Math.sin(Math.PI / 12);
    shadows.push({ min: point(x - length, pad, z - width), max: point(x + length, -1, z + width), yaw });
  }
}

/**
 * Contact darkening on the pavement where a footing's kerb meets it, in short chords round the curve where the
 * cameras see it: through the slot and a little way round either side (set units).
 */
export function footingContacts(centre: number): ContactLine[] {
  const r = (WATER_TOWER_ROOF_RADIUS - WATER_TOWER_OVERHANG) / F + FOOTING_WIDTH, pad = -WATER_TOWER_HEIGHT / F;
  const facing = centre < 0 ? 0 : Math.PI;
  const at = (a: number) => point(centre + r * Math.cos(facing + a), pad, r * Math.sin(facing + a));
  return [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((k) => ({
    a: at(((k - 0.5) * 10 * Math.PI) / 180), b: at(((k + 0.5) * 10 * Math.PI) / 180), reach: 1.4 * F, strength: 0.34,
  }));
}

/** The third reservoir beyond the landing tank (00, 58, 60): smaller, as tall, its roof visibly domed. Background only. */
const THIRD = { x: 275, z: -17, radius: 65, sides: 64 };

export function thirdTank(b: Bake) {
  const n = THIRD.sides, cx = THIRD.x, cz = THIRD.z;
  const at = (i: number, r: number, y: number) =>
    point(cx + r * Math.cos((2 * Math.PI * i) / n), y, cz + r * Math.sin((2 * Math.PI * i) / n));
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) * 2 * Math.PI) / n;
    // The wall, then the dome in two rings: a shallow cone out to the rim and a flatter cap in the middle.
    b.quad(at(i, 65, 0), at(i + 1, 65, 0), at(i + 1, 65, -21), at(i, 65, -21), [Math.cos(a), 0, Math.sin(a)], { color: '#a6a499' }, tag('concrete'));
    b.quad(at(i, 36, 3.3), at(i + 1, 36, 3.3), at(i + 1, 65, 0), at(i, 65, 0), [0, 1, 0], { color: '#b9b7a6' }, tag('concrete'));
    b.triangle(at(i, 0, 4.1), at(i + 1, 36, 3.3), at(i, 36, 3.3), [0, 1, 0], { color: '#b9b7a6' }, tag('concrete'));
  }
}
