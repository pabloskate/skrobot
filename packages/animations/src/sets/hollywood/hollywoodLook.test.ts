import type { ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { SURFACE } from '../surfaces';
import { buildHollywoodGeometry, Hollywood3D, hollywoodConfig, HOLLYWOOD_LOOK, HOLLYWOOD_TREES } from './hollywood3d';
import {
  HOLLYWOOD_12_LIP, HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_BUILDING_END, HOLLYWOOD_BUILDING_TOP,
  HOLLYWOOD_CHEEK_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_LEFT_Z, HOLLYWOOD_ROAD_Y,
  HOLLYWOOD_RUN, HOLLYWOOD_FOOT as F, hollywoodSurface,
} from './hollywoodLayout';
import { turnPoint } from './turn';

const flights = ['sixteen', 'twelve'] as const;

/** Each vertex's solid, decoded as the shader does, with its position in the sixteen's frame. */
function solids(geometry: BufferGeometry, flight: (typeof flights)[number]) {
  const position = geometry.getAttribute('position'), info = geometry.getAttribute('aInfo'), normal = geometry.getAttribute('normal');
  return Array.from({ length: position.count }, (_, i) => {
    const point: [number, number, number] = [position.getX(i), position.getY(i), position.getZ(i)];
    return {
      solid: Math.floor((info.getW(i) * 255) / 4 + 0.01),
      at: flight === 'twelve' ? turnPoint(HOLLYWOOD_12_LIP, point) : point,
      up: Math.abs(normal.getY(i)),
    };
  });
}

/** Each triangle's solid and its corners in the sixteen's frame, with its face normal. */
function triangles(geometry: BufferGeometry, flight: (typeof flights)[number]) {
  const verts = solids(geometry, flight), normal = geometry.getAttribute('normal'), index = geometry.getIndex();
  const corner = (i: number) => (index ? index.getX(i) : i);
  const count = index ? index.count : verts.length;
  return Array.from({ length: count / 3 }, (_, t) => {
    const [a, b, c] = [0, 1, 2].map((k) => corner(3 * t + k));
    // The twelve is turned half round, so its normals' x and z flip with it.
    const turn = flight === 'twelve' ? -1 : 1;
    return { solid: verts[a].solid, corners: [a, b, c].map((i) => verts[i].at), n: [turn * normal.getX(a), normal.getY(a), turn * normal.getZ(a)] };
  });
}

/** The school's two brick wings either side of its entrance stairs, as buildSchool lays them. */
const WINGS = [[-88.5 * F, -66 * F], [-6 * F, HOLLYWOOD_BUILDING_END]];
const WING_Y = [-HOLLYWOOD_DROP, HOLLYWOOD_BUILDING_TOP], WING_Z = [HOLLYWOOD_BUILDING_FACE, 25 * F];
const inWing = ([x0, x1]: number[], [x, y, z]: number[]) => x >= x0 - 0.01 && x <= x1 + 0.01
  && y >= WING_Y[0] - 0.01 && y <= WING_Y[1] + 0.01 && z >= WING_Z[0] - 0.01 && z <= WING_Z[1] + 0.01;
const onWing = (at: number[]) => WINGS.some((wing) => inWing(wing, at));
/** A triangle lying on one of a wing box's four walls and facing out of it. */
const wingWall = (corners: number[][], [nx, , nz]: number[]) => WINGS.some((wing) => corners.every((at) => inWing(wing, at)) && (
  [[0, wing[0], -nx], [0, wing[1], nx], [2, WING_Z[0], -nz], [2, WING_Z[1], nz]] as const).some(([axis, plane, out]) =>
  out > 0.5 && corners.every((at) => Math.abs(at[axis] - plane) < 0.01)));

describe('Hollywood realistic look', () => {
  it.each(flights)('lays brick on the school wings and asphalt on Highland and the aggregate bay only, in %s', flight => {
    const built = buildHollywoodGeometry(flight);
    try {
      const all = [...solids(built.ground, flight), ...solids(built.props, flight), ...solids(built.decals, flight)];
      const brick = all.filter((v) => v.solid === SURFACE.brick), asphalt = all.filter((v) => v.solid === SURFACE.asphalt);
      expect(brick.length).toBeGreaterThan(0);
      for (const { at: [x, y, z] } of brick) {
        const inBox = (a: number[], b: number[]) => [x, y, z].every((v, i) => v >= a[i] * F - 0.01 && v <= b[i] * F + 0.01);
        const retaining = inBox([-72, -8, -8.65], [0, 0, -8]);
        const cheeks = [-66.75, -6.75].some(start => inBox([start, 0, 7.95], [start + 1.5, 9, 21]));
        const courts = [[16.5, 50], [-116, -88.5]].some(([start, end]) =>
          inBox([start, -8, 36], [end, 1, 37]) ||
          inBox([start > 0 ? end - 1 : start, -8, 10], [start > 0 ? end : start + 1, 1, 36]) ||
          inBox([start > 0 ? 47 : -115, -8, 8], [start > 0 ? 49 : -113, 1, 10]));
        expect(onWing([x, y, z]) || retaining || cheeks || courts).toBe(true);
      }
      // Every wall of the wings is brick: nothing on them is left on the old block stand-in.
      expect(all.some((v) => v.solid === 10)).toBe(false);
      // Every wall of both wings is brick; what is fixed to them (sign, pipes, buffed paint) stands proud of it.
      const walls = triangles(built.props, flight).filter((t) => wingWall(t.corners, t.n));
      expect(walls.length).toBeGreaterThan(0);
      for (const { solid } of walls) expect(solid).toBe(SURFACE.brick);
      // Asphalt is the road (its one quad, and the stains and patches laid just over it between the kerbs), the lot
      // across it and, stood upright, the auditorium's recessed bay of exposed-aggregate panels: nowhere else.
      const bay = ([x, y, z]: number[]) => x >= -80.8 * F - 0.01 && x <= 8.8 * F + 0.01 && y >= 16.3 * F - 0.01 && y <= 42 * F + 0.01
        && z >= 27.9 * F && z <= 31 * F + 0.01;
      // The parking lot across Highland is asphalt too, a box on the far ground.
      const lot = ([x, y, z]: number[]) => x >= -135 * F - 0.01 && x <= 100 * F + 0.01 && y >= -8 * F - 0.01 && y <= -7.9 * F + 0.01
        && z >= -180 * F - 0.01 && z <= -119 * F + 0.01;
      const road = asphalt.filter(({ at }) => !bay(at) && !lot(at));
      expect(road.filter(({ at: [, y] }) => y === HOLLYWOOD_ROAD_Y).length).toBe(6);
      expect(asphalt.some(({ at }) => bay(at))).toBe(true);
      for (const { at: [, y, z], up } of road) {
        expect(y).toBeGreaterThanOrEqual(HOLLYWOOD_ROAD_Y);
        expect(y).toBeLessThan(HOLLYWOOD_ROAD_Y + 0.2);
        expect(up).toBe(1);
        expect(z).toBeGreaterThanOrEqual(HOLLYWOOD_FAR_CURB_Z);
        expect(z).toBeLessThanOrEqual(HOLLYWOOD_CURB_Z);
      }
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });

  it.each(flights)('compiles the brick and asphalt surfaces into %s’s shaders', flight => {
    expect(HOLLYWOOD_LOOK.brick).toBeDefined();
    expect(HOLLYWOOD_LOOK.asphalt).toBeDefined();
    // The block-mortar stand-in is gone with the block.
    expect(HOLLYWOOD_LOOK.mortar).toBeUndefined();
    const spot = new Hollywood3D(flight);
    try {
      for (const mesh of spot.terrain()) {
        const source = (mesh.material as ShaderMaterial).fragmentShader;
        expect(source).toContain('return lookBrick(c, q, n, local);');
        expect(source).toContain('return lookAsphalt(');
        expect(source).toContain('|| abs(surface - 23.0) < 0.5 || abs(surface - 24.0) < 0.5');
      }
    } finally { spot.dispose(); }
  });

  it.each(flights)('puts shaded marks on exposed paving in %s', flight => {
    const built = buildHollywoodGeometry(flight);
    const spot = new Hollywood3D(flight);
    try {
      const position = built.decals.getAttribute('position'), normal = built.decals.getAttribute('normal');
      let levelVertices = 0;
      for (let i = 0; i < position.count; i++) {
        if (normal.getY(i) < 0.9) continue;
        const point: [number, number, number] = [position.getX(i), position.getY(i), position.getZ(i)];
        const [x, y, z] = flight === 'twelve' ? turnPoint(HOLLYWOOD_12_LIP, point) : point;
        expect(y - hollywoodSurface(x, z)).toBeGreaterThan(0);
        expect(y - hollywoodSurface(x, z)).toBeLessThan(0.025 * F);
        expect(x > HOLLYWOOD_12_LIP && x < HOLLYWOOD_BUILDING_END && z >= HOLLYWOOD_BUILDING_FACE).toBe(false);
        expect(x > HOLLYWOOD_12_LIP && x < HOLLYWOOD_RUN && z >= HOLLYWOOD_CHEEK_Z && z <= HOLLYWOOD_LEFT_Z).toBe(false);
        for (const tree of HOLLYWOOD_TREES) {
          expect(Math.abs(x - tree.at[0]) < 2.2 * F && Math.abs(z - tree.at[2]) < 2.2 * F).toBe(false);
        }
        levelVertices++;
      }
      expect(levelVertices).toBeGreaterThan(1000);
      const [ground, , decals] = spot.terrain();
      expect(decals.material).toBe(ground.material);
      const source = (ground.material as ShaderMaterial).fragmentShader;
      let vectors = 0;
      for (const match of source.matchAll(/uniform\s+(?:highp\s+|mediump\s+)?(float|int|vec[234]|mat[34]|sampler2D)\s+(\w+)(?:\[(\d+)\])?/g)) {
        vectors += (match[1] === 'mat4' ? 4 : match[1] === 'mat3' ? 3 : 1) * Number(match[3] ?? 1);
      }
      expect(vectors).toBeLessThan(200);
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose(); spot.dispose();
    }
  });

  it.each(flights)('keeps model trunks clear of both stair lanes, the run-up, fence line and filmers in %s', flight => {
    const config = hollywoodConfig(flight);
    for (const tree of config.streetProps!.trees!) {
      const [x, , z] = flight === 'twelve' ? turnPoint(HOLLYWOOD_12_LIP, tree.at) : tree.at;
      // This whole corridor contains both stair lanes and the connecting run-up.
      expect(x > -54 * F && x < 46 * F && Math.abs(z) < 10 * F).toBe(false);
      // Fence pop, flight and the sidewalk ride-away out to 70 feet.
      expect(x > -4 * F && x < 70 * F && z > -20 * F && z < -3 * F).toBe(false);
      for (const shots of [config.filmers!.stairs, ...Object.values(config.filmers!.obstacles ?? {})]) {
        for (const stand of [...Object.values(shots.stands), ...Object.values(shots.across ?? {})]) {
          expect(Math.hypot(tree.at[0] - stand.u, tree.at[2] - stand.z)).toBeGreaterThan(2 * F);
        }
      }
    }
  });

  it.each(flights)('reads NO SKATING toward the street in %s', flight => {
    const built = buildHollywoodGeometry(flight);
    try {
      const position = built.props.getAttribute('position'), color = built.props.getAttribute('aColor');
      const pixels: number[] = [];
      for (let i = 0; i < position.count; i += 6) {
        const point: [number, number, number] = [position.getX(i), position.getY(i), position.getZ(i)];
        const [x, y, z] = flight === 'twelve' ? turnPoint(HOLLYWOOD_12_LIP, point) : point;
        if (Math.abs(z - (HOLLYWOOD_BUILDING_FACE - 2.6)) > 0.01 || y < 23 || y > 40) continue;
        if (Math.abs(color.getX(i) - 55 / 255) > 0.001) continue;
        pixels.push(x);
      }
      // Glyphs emit in reading order; on a -z face screen-right runs toward -x.
      // The last word must be to the viewer's right of the initial N.
      expect(pixels.length).toBeGreaterThan(100);
      expect(pixels[0]).toBeGreaterThan(pixels[pixels.length - 1]);
    } finally { built.ground.dispose(); built.props.dispose(); built.decals.dispose(); }
  });
});
