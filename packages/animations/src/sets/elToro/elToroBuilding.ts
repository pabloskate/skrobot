import { campusBlock } from './elToroCampus';
import { SET_FOOT } from './stairs';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { SURFACE } from '../surfaces';
import {
  BUILDING_BACK,
  BUILDING_END,
  BUILDING_FACE,
  BUILDING_H,
  BUILDING_LENGTH,
  EAVE,
  hill,
} from './elToroLayout';
import type { Vec3 } from '../../camera/view';

/** A face the look shades as `solid` (sets/surfaces.ts; 10 is block masonry). Fine architecture is uninked: outlines alias on tiny hardware. */
const tag = (solid: number): Ink => ({ ...NO_INK, solid });
const METAL = tag(SURFACE.metal);
const CONCRETE = tag(SURFACE.concrete);
const PLAIN = NO_INK;

/** Where the school's shade falls: its walls, its overhanging hip roof, and the campus lantern by the run-up. */
export interface ElToroBuildingShade {
  walls: { min: Vec3; max: Vec3 };
  eave: { min: Vec3; max: Vec3 };
  lantern: { min: Vec3; max: Vec3 };
  /** The lantern's pole, a thin shadow-casting bar. */
  pole: { a: Vec3; b: Vec3; radius: number };
}

const U0 = BUILDING_END - BUILDING_LENGTH;
const EAVE_H = BUILDING_H;
const LAMP = { u: -2.5 * SET_FOOT, z: BUILDING_FACE - 26.5 * SET_FOOT } as const;
const LAMP_BASE = hill(LAMP.u);
const SHAFT_TOP = LAMP_BASE + 12.4 * SET_FOOT;
const LAMP_TOP = SHAFT_TOP + 2.6 * SET_FOOT;

/** Boxes and a bar standing for the school's shade (it's built facing back toward the stairs, local z mirrored). */
export function elToroBuildingShade(): ElToroBuildingShade {
  const lampZ = BUILDING_FACE - LAMP.z;
  return {
    walls: { min: [U0, 0, BUILDING_FACE], max: [BUILDING_END, BUILDING_H, BUILDING_BACK] },
    // The overhang, from the fascia's foot to where the roof planes start, flush with the gutters' faces (a face
    // inside a box would shade itself): its edge throws the shade line on the walk.
    eave: { min: [U0 - 4.5 * SET_FOOT, EAVE_H - 0.45 * SET_FOOT, BUILDING_FACE - EAVE], max: [BUILDING_END + 4.5 * SET_FOOT, EAVE_H, BUILDING_BACK + 4.5 * SET_FOOT] },
    // The lantern's core, inside its panes, so they light as glass round it.
    lantern: { min: [LAMP.u - 8, SHAFT_TOP - 8, lampZ - 8], max: [LAMP.u + 8, LAMP_TOP + 5, lampZ + 8] },
    pole: { a: [LAMP.u, LAMP_BASE + 5, lampZ], b: [LAMP.u, SHAFT_TOP, lampZ], radius: 2.6 },
  };
}

/**
 * The original school frontage visible in photographs of the twenty stair:
 * small stacked blue lockers, warm CMU, a shallow hipped standing-seam roof, and
 * the fence and lantern beside the upper embankment. Every face is its
 * authored sunlit colour; the look lights it per pixel, draws the block
 * courses (solid 10) and the roof's seams, and the shadow boxes put the
 * frontage under its eave. The fence's diamond mesh goes into `mesh`, drawn
 * per pixel (wireMesh.ts); its posts and rails cast shadows from `rails`.
 */
export function buildElToroBuilding(props: Bake, mesh: Bake, rails: Array<{ a: Vec3; b: Vec3; radius: number }>): void {
  // Author the frontage at local z=0, with its interior at negative z.
  // The school stands beyond the far rail, facing back toward the stairs.
  const P = (u: number, h: number, z: number): Vec3 => [u, h, BUILDING_FACE - z];
  const u0 = U0;

  const box = (a: Vec3, b: Vec3, color: string, record: Ink = METAL) => {
    const lo: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const hi: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const faces: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    ];
    for (const [a, b, c, d, n] of faces) props.quad(a, b, c, d, n, { color }, record);
  };
  const pipe = (points: Vec3[], radius: number, color: string, sides = 8, record = METAL) =>
    props.tube(points, points.map(() => radius), { color }, record, sides, true);

  campusBlock(props, u0 / SET_FOOT, BUILDING_END / SET_FOOT, BUILDING_FACE / SET_FOOT, BUILDING_BACK / SET_FOOT, 0, {
    lockers: true, corridorEave: EAVE / SET_FOOT, doors: [19, 76],
  });

  // A short diamond-mesh fence beside the school ends on the planted side
  // of the upper rail, leaving the full run-up and all of the stair open.
  const fenceU = -0.8 * SET_FOOT;
  const fenceBack = BUILDING_FACE - 125 * SET_FOOT;
  const fenceFront = BUILDING_FACE - 25 * SET_FOOT;
  const fenceH = 5 * SET_FOOT;
  const fence = (a: Vec3, b: Vec3) => {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    const point = (s: number, h: number): Vec3 => [a[0] + dx * s / length, h, a[2] + dz * s / length];
    // Every shadow segment costs each ground pixel a test, so only the bars whose shade is seen cast one:
    // the top rail and the posts within forty feet of the stairs. The tension wire's is thinner than a pixel.
    const bar = (from: Vec3, to: Vec3, radius: number, color: string, sides: number, shade = true) => {
      pipe([from, to], radius, color, sides);
      if (shade) rails.push({ a: from, b: to, radius });
    };
    bar(point(0, fenceH), point(length, fenceH), 1.6, '#969f95', 8);
    bar(point(0, 7), point(length, 7), 0.52, '#7d8982', 5, false);
    const bays = Math.ceil(length / (8 * SET_FOOT));
    for (let i = 0; i <= bays; i++) {
      const s = i * length / bays;
      bar(point(s, 0), point(s, fenceH + 4), 2.1, '#8b968e', 8, s > length - 40 * SET_FOOT);
      props.tube([point(s, fenceH + 3), point(s, fenceH + 5)], [2.8, 1.7], { color: '#aab2a5' }, METAL, 8, true);
      for (const h of [20, 79, 138]) pipe([point(s - 2.6, h), point(s + 2.6, h)], 0.75, '#b4baac', 6);
    }
    // The diamond mesh: one panel, its wires drawn per pixel from each corner's
    // (along, up) distances, so they never sparkle. No mesh spans the approach path or the top step.
    const low = 8;
    const high = fenceH - 3;
    const n: Vec3 = [-dz / length, 0, dx / length];
    const corners = ([[0, low], [length, low], [length, high], [0, high]] as const).map(([s, h]) => ({ at: point(s, h), along: [s, h, 0] as Vec3 }));
    for (const k of [0, 1, 2, 0, 2, 3]) mesh.vertex(corners[k].at, n, { color: FENCE_MESH.color }, NO_INK, corners[k].along);
  };
  fence(P(fenceU, 0, fenceBack), P(fenceU, 0, fenceFront));
  // Open seven-foot gate frame: never put mesh in the filmer opening.
  const gateZ = BUILDING_FACE - 19 * SET_FOOT;
  for (const z of [gateZ, fenceFront]) pipe([P(fenceU, 0, z), P(fenceU, 7 * SET_FOOT, z)], 2.1, '#8b968e');
  pipe([P(fenceU, 7 * SET_FOOT, gateZ), P(fenceU, 7 * SET_FOOT, fenceFront)], 2.1, '#8b968e');

  // Slender octagonal campus lantern beside the school-side upper landing.
  const lampU = LAMP.u;
  const lampZ = LAMP.z;
  const baseH = LAMP_BASE;
  const shaftTop = SHAFT_TOP;
  const lampTop = LAMP_TOP;
  box(P(lampU - 8, baseH, lampZ - 8), P(lampU + 8, baseH + 6, lampZ + 8), '#b0b09e', CONCRETE);
  pipe([P(lampU, baseH + 5, lampZ), P(lampU, shaftTop + 2, lampZ)], 2.6, '#717e79', 10);
  props.tube([P(lampU, shaftTop - 8, lampZ), P(lampU, shaftTop, lampZ)], [4, 12], { color: '#5c6864' }, METAL, 8, true);
  const ring = (angle: number, h: number, r = 12): Vec3 => P(lampU + Math.cos(angle) * r, h, lampZ + Math.sin(angle) * r);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const b = (i + 1) * Math.PI / 4;
    const n: Vec3 = [Math.cos((a + b) / 2), 0, -Math.sin((a + b) / 2)];
    props.quad(ring(a, shaftTop), ring(b, shaftTop), ring(b, lampTop), ring(a, lampTop), n, { color: '#e2e3d4' }, PLAIN);
    pipe([ring(a, shaftTop), ring(a, lampTop)], 0.85, '#66736c', 5);
  }
  for (const y of [shaftTop, lampTop]) props.tube([P(lampU, y - 1.5, lampZ), P(lampU, y + 1.5, lampZ)], [13.5, 13.5], { color: '#626d66' }, METAL, 8, true);
  props.tube([P(lampU, lampTop + 1.5, lampZ), P(lampU, lampTop + 5.5, lampZ), P(lampU, lampTop + 7, lampZ)], [14, 9.5, 1.5], { color: '#727a6f' }, METAL, 8, true);
}

/** The school fence's galvanized diamond mesh (wireMesh.ts): two-inch chain link of thin wire. */
export const FENCE_MESH = { spacing: 6, radius: 0.23, color: '#97a39a' } as const;
