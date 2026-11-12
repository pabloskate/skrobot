import { describe, expect, it } from 'vitest';
import { ASPHALT, type Vec3 } from '../../camera/view';
import type { V3 } from '../../math';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import type { StageSet } from '../sets';
import { SET_SCALE } from '../setScale';
import { crownSpheres, treeHeight, type TreePlacement } from '../props/trees';
import {
  HOLLYWOOD_12_FILMERS, HOLLYWOOD_12_LIP, HOLLYWOOD_DROP, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FILMERS,
  HOLLYWOOD_FOOT as F,
} from './hollywoodLayout';
import { HOLLYWOOD_TREES, hollywoodCanopies } from './hollywoodTrees';
import { turnPoint } from './turn';

const lower = -HOLLYWOOD_DROP;
/** The sixteen's trees, or the twelve's: the same scene turned half round. */
const placed = (twelve: boolean): TreePlacement[] => HOLLYWOOD_TREES.map((tree) => twelve
  ? { ...tree, at: turnPoint(HOLLYWOOD_12_LIP, tree.at), yaw: tree.yaw + 180 }
  : tree);

const ride = (set: StageSet, base: string, obstacle?: 'fence', landed = true) =>
  planStage({ id: base, name: base, base, stance: 'regular' }, {
    set, obstacle, landed, riderStance: 'regular',
    style: resolveSkateStyle({ popHeight: 0.5, rotationSpeed: 1.16, flickStrength: 0.88 }),
    fall: 'slam', shankProgress: 0.65,
  });

/** A rig point in the flight's own set coordinates (set units). */
const inSet = (frame: StageFrame, p: V3): Vec3 => [
  (frame.scroll + p.x - X0) / SET_SCALE, (ASPHALT - p.y) / SET_SCALE, (frame.stairs!.across + p.z) / SET_SCALE,
];

/** How far `p` is outside the nearest crown sphere (negative inside). */
const clear = (spheres: ReturnType<typeof crownSpheres>, p: Vec3) =>
  Math.min(...spheres.map(({ center, radius }) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - radius));

/** How close the segment a→b comes to the sphere's centre, less its radius. */
function pass(a: Vec3, b: Vec3, center: Vec3, radius: number) {
  const ab = b.map((v, i) => v - a[i]);
  const ac = center.map((v, i) => v - a[i]);
  const k = Math.max(0, Math.min(1, (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ac[0] - k * ab[0], ac[1] - k * ab[1], ac[2] - k * ab[2]) - radius;
}

const FLIGHTS: Array<{ set: StageSet; obstacle?: 'fence'; twelve: boolean; filmers: typeof HOLLYWOOD_FILMERS.stairs }> = [
  { set: 'hollywood-high', twelve: false, filmers: HOLLYWOOD_FILMERS.stairs },
  { set: 'hollywood-high', obstacle: 'fence', twelve: false, filmers: HOLLYWOOD_FILMERS.obstacles!.fence! },
  { set: 'hollywood-high-12', twelve: true, filmers: HOLLYWOOD_12_FILMERS.stairs },
];
const TRICKS = ['Ollie', 'Kickflip', 'Impossible', 'Backside 360', 'Frontside 180'];

describe('Hollywood High: the street figs', () => {
  it('stands the seven figs in the sidewalk wells, each its own', () => {
    expect(HOLLYWOOD_TREES.map(({ at }) => at[0] / F)).toEqual([-112, -62, -36, -10, 38, 62, 86]);
    for (const { at, species } of HOLLYWOOD_TREES) {
      expect(species).toBe('ficus');
      expect(at[1]).toBe(lower);
      expect(at[2] / F).toBe(-25.5);
    }
    for (const tree of HOLLYWOOD_TREES) {
      expect(treeHeight(tree) / F).toBeGreaterThanOrEqual(30);
      expect(treeHeight(tree) / F).toBeLessThanOrEqual(35);
    }
    const looks = new Set(HOLLYWOOD_TREES.map(({ variant, yaw, height, seed }) => `${variant}/${yaw}/${height}/${seed}`));
    expect(looks.size).toBe(HOLLYWOOD_TREES.length);
  });

  it('keeps every trunk 12 ft or more from every filmer, on both flights and over the fence', () => {
    for (const { twelve, filmers } of FLIGHTS) for (const tree of placed(twelve)) {
      for (const stand of [...Object.values(filmers.stands), ...Object.values(filmers.across ?? {})]) {
        expect(Math.hypot(tree.at[0] - stand.u, tree.at[2] - stand.z) / F).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('holds every crown 13 ft or more over the sidewalk, and no more than 3 ft past the fence over the walkway', () => {
    for (const { center, radius } of crownSpheres(HOLLYWOOD_TREES)) {
      expect((center[1] - radius - lower) / F).toBeGreaterThanOrEqual(13);
      expect((center[2] + radius - HOLLYWOOD_FENCE_Z) / F).toBeLessThanOrEqual(3);
    }
  });

  it('keeps the sidewalk the fence line lands and rolls away on clear of trunks', () => {
    for (const { at } of HOLLYWOOD_TREES) {
      const onIt = at[0] >= -5 * F && at[0] <= 60 * F && at[2] >= -23 * F && at[2] <= HOLLYWOOD_FENCE_Z;
      expect(onIt, `trunk at ${at[0] / F} ft`).toBe(false);
    }
  });

  it('keeps every crown 4 ft or more from the rider\'s head down both stair lanes and over the fence', () => {
    for (const { set, obstacle, twelve } of FLIGHTS) {
      const spheres = crownSpheres(placed(twelve));
      let closest = Infinity;
      for (const base of TRICKS) for (const landed of [true, false]) {
        const stage = ride(set, base, obstacle, landed);
        for (let t = 0; t <= stage.end; t += 1 / 30) {
          const frame = stageFrame(stage, t, 1);
          closest = Math.min(closest, clear(spheres, inSet(frame, frame.rig.head.origin)));
        }
      }
      expect(closest / F, `${set}${obstacle ? '/' + obstacle : ''}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('hides the rider from no tripod: no crown stands between a filmer and the rider', () => {
    for (const { set, obstacle, twelve, filmers } of FLIGHTS) {
      const spheres = crownSpheres(placed(twelve));
      const stands = [...Object.values(filmers.stands), ...Object.values(filmers.across ?? {})];
      for (const base of ['Kickflip', 'Impossible']) {
        const stage = ride(set, base, obstacle);
        const { pop, land } = stage.stairs!;
        for (const t of [pop - 0.4, pop, (pop + land) / 2, land, land + 0.4]) {
          const frame = stageFrame(stage, t, 1);
          for (const p of [frame.rig.head.origin, frame.rig.board.center]) {
            const rider = inSet(frame, p);
            for (const stand of stands) {
              const eye: Vec3 = [stand.u, stand.height, stand.z];
              const nearest = Math.min(...spheres.map(({ center, radius }) => pass(eye, rider, center, radius)));
              expect(nearest, `${set}${obstacle ? '/' + obstacle : ''} ${base} t=${t.toFixed(2)} from ${stand.u / F},${stand.z / F}`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('spends the 16 crown shadows on paving each flight\'s cameras see', () => {
    for (const twelve of [false, true]) {
      const canopies = hollywoodCanopies(placed(twelve), twelve);
      expect(canopies.length).toBeLessThanOrEqual(16);
      expect(canopies.length).toBeGreaterThanOrEqual(12);
    }
  });
});
