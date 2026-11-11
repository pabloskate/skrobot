import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { hash2 } from '../setKit';
import { SURFACE } from '../surfaces';
import { SET_FOOT as F } from './stairs';

/**
 * El Toro's campus round the stairs, authored in feet in the spot's own axes (u downhill, h up, z across) and
 * baked in set units. The blocks share one architecture (refs/07, 30, 31, 40): buff 8 x 16 in block walls (solid
 * 10, coursed by the look), a deep eave with a dark-brown fascia over a tan soffit with small recessed lights,
 * and a charcoal-brown standing-seam skirt round a flat top with a few HVAC boxes. The locker banks are flat
 * panels the look paints door by door (SURFACE.lockers, EL_TORO_LOOK.lockers) between the tan block piers.
 */

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];
const tag = (solid: number): Ink => ({ ...NO_INK, solid });

const WALL = '#bda17e';
const FASCIA = '#4b3e31';
const SOFFIT = '#c4ae88';
const SOFFIT_LIGHT = '#ece6d0';
const SEAM_ROOF = '#5d564c';
const HVAC = '#929086';
const LOCKER = '#8ea6ad';
const LOCKER_CAP = '#71858a';
const CURB = '#c3b597';
const DOOR = '#415f6c';

/** The look's locker grid: doors a foot wide, tiers 9.5/8 ft tall from half a tier over a floor (EL_TORO_LOOK). */
const LOCKER_TIER = 9.5 / 8;
const LOCKER_BASE = LOCKER_TIER / 2;
const LOCKER_TIERS = 5;
/** Banks twelve doors wide between four-foot block piers; never closer than this to a corner. */
const BANK = 12;
const PIER = 4;
const CORNER_PIER = 3.5;
/** The roof skirt: it rises 6.5 ft over 12 ft of plan, so from the walk it looks nearly as tall as the wall (refs/07). */
const SKIRT_RUN = 12;
const SKIRT_RISE = 6.5;

export const point = (u: number, h: number, z: number): Vec3 => [u * F, h * F, z * F];

/** An axis-aligned box between corners a and c (feet), every face the same paint, shaded as `solid`. */
export function campusBox(bake: Bake, a: Vec3, c: Vec3, color: string, solid: number = SURFACE.stucco) {
  const [u0, h0, z0] = a;
  const [u1, h1, z1] = c;
  const paint: Paint = { color };
  const ink = tag(solid);
  const face = (p: Vec3, q: Vec3, r: Vec3, s: Vec3, n: Vec3) => bake.quad(point(...p), point(...q), point(...r), point(...s), n, paint, ink);
  face([u0, h1, z0], [u1, h1, z0], [u1, h1, z1], [u0, h1, z1], UP);
  face([u0, h0, z1], [u1, h0, z1], [u1, h0, z0], [u0, h0, z0], DOWN);
  face([u0, h0, z1], [u1, h0, z1], [u1, h1, z1], [u0, h1, z1], [0, 0, 1]);
  face([u1, h0, z0], [u0, h0, z0], [u0, h1, z0], [u1, h1, z0], [0, 0, -1]);
  face([u0, h0, z0], [u0, h0, z1], [u0, h1, z1], [u0, h1, z0], [-1, 0, 0]);
  face([u1, h0, z1], [u1, h0, z0], [u1, h1, z0], [u1, h1, z1], [1, 0, 0]);
}

/** A flat rectangle facing `n` (feet): one of the blocks' painted faces, lying just proud of a wall or under a soffit. */
function panel(bake: Bake, corners: [Vec3, Vec3, Vec3, Vec3], n: Vec3, color: string, solid: number) {
  bake.quad(point(...corners[0]), point(...corners[1]), point(...corners[2]), point(...corners[3]), n, { color }, tag(solid));
}

export interface CampusBlockOptions {
  /** Wall height over the floor (ft). */
  height?: number;
  /** How far the eave overhangs the walls (ft), and on the corridor face (z0) if that differs. */
  eave?: number;
  corridorEave?: number;
  /** Locker banks on the corridor face (z0) and on the end facing the stairs. */
  lockers?: boolean;
  /** Recessed soffit lights along the corridor eave. */
  lights?: boolean;
  /** HVAC boxes on the flat top. */
  hvac?: boolean;
  roof?: string;
  wall?: string;
  /** The walls' look surface: block masonry (solid 10) unless it's a stucco block. */
  wallSolid?: number;
  /** Classroom doors on the corridor face, at these distances from u0 (ft). */
  doors?: number[];
}

/**
 * A campus block: walls u0..u1 x z0..z1 standing on `floor`, its eave and roof. The corridor face is z0 (toward
 * the stairs on every block that has one); the end facing the stairs is whichever of u0 and u1 is nearer them.
 */
export function campusBlock(bake: Bake, u0: number, u1: number, z0: number, z1: number, floor: number, options: CampusBlockOptions = {}) {
  const { height = 11, eave = 4.5, lockers = false, lights = lockers, hvac = true, roof = SEAM_ROOF, wall = WALL, wallSolid = 10 } = options;
  const corridorEave = options.corridorEave ?? eave;
  campusBox(bake, [u0, floor, z0], [u1, floor + height, z1], wall, wallSolid);
  const top = floor + height;
  const [eu0, eu1, ez0, ez1] = [u0 - eave, u1 + eave, z0 - corridorEave, z1 + eave];

  // The eave: a tan soffit plate, its edge closed by a deep dark-brown fascia board standing a little above it.
  const soffit = top - 0.45;
  campusBox(bake, [eu0, soffit, ez0], [eu1, top, ez1], SOFFIT, SURFACE.stucco);
  const board = 0.12;
  for (const [a, c] of [
    [[eu0, soffit - 0.55, ez0 - board], [eu1, top + 0.35, ez0]],
    [[eu0, soffit - 0.55, ez1], [eu1, top + 0.35, ez1 + board]],
    [[eu0 - board, soffit - 0.55, ez0], [eu0, top + 0.35, ez1]],
    [[eu1, soffit - 0.55, ez0], [eu1 + board, top + 0.35, ez1]],
  ] as Array<[Vec3, Vec3]>) campusBox(bake, a, c, FASCIA, SURFACE.siding);
  if (lights) {
    // Small square downlights a hair under the soffit, every sixteen feet along the corridor.
    for (let u = u0 + 8; u < u1 - 4; u += 16) {
      const z = z0 - corridorEave / 2;
      panel(bake, [[u - 0.5, soffit - 0.02, z + 0.5], [u + 0.5, soffit - 0.02, z + 0.5], [u + 0.5, soffit - 0.02, z - 0.5], [u - 0.5, soffit - 0.02, z - 0.5]], DOWN, SOFFIT_LIGHT, SURFACE.glass);
    }
  }

  // The standing-seam skirt: four hipped planes rising 6.5 ft over 12, round a flat top.
  const low = top + 0.35, high = low + SKIRT_RISE;
  const slope = Math.hypot(SKIRT_RUN, SKIRT_RISE);
  const [ny, nx] = [SKIRT_RUN / slope, SKIRT_RISE / slope];
  const [iu0, iu1, iz0, iz1] = [eu0 + SKIRT_RUN, eu1 - SKIRT_RUN, ez0 + SKIRT_RUN, ez1 - SKIRT_RUN];
  const seam = (corners: [Vec3, Vec3, Vec3, Vec3], n: Vec3) => panel(bake, corners, n, roof, SURFACE.roofing);
  seam([[eu0, low, ez0], [eu1, low, ez0], [iu1, high, iz0], [iu0, high, iz0]], [0, ny, -nx]);
  seam([[eu1, low, ez1], [eu0, low, ez1], [iu0, high, iz1], [iu1, high, iz1]], [0, ny, nx]);
  seam([[eu0, low, ez1], [eu0, low, ez0], [iu0, high, iz0], [iu0, high, iz1]], [-nx, ny, 0]);
  seam([[eu1, low, ez0], [eu1, low, ez1], [iu1, high, iz1], [iu1, high, iz0]], [nx, ny, 0]);
  seam([[iu0, high, iz0], [iu1, high, iz0], [iu1, high, iz1], [iu0, high, iz1]], UP);
  if (hvac) {
    for (const u of [u0 + 28, u1 - 28]) {
      campusBox(bake, [u, high, z0 + 32], [u + 7, high + 2.5, z0 + 39], HVAC, SURFACE.metal);
      campusBox(bake, [u + 1, high + 2.5, z0 + 33], [u + 6, high + 2.8, z0 + 38], '#7e7c73', SURFACE.metal);
    }
  }

  const doors = options.doors ?? [];
  for (const d of doors) {
    campusBox(bake, [u0 + d, floor, z0 - 0.18], [u0 + d + 3, floor + 7.5, z0 - 0.06], DOOR, SURFACE.metal);
    // A dark-brown frame round each door, and a kick plate.
    campusBox(bake, [u0 + d - 0.25, floor, z0 - 0.12], [u0 + d + 3.25, floor + 7.8, z0 - 0.04], FASCIA, SURFACE.siding);
  }
  if (!lockers) return;
  // Banks along the corridor face, skipping the doors, then down the end facing the stairs.
  const clearOfDoors = (a: number) => doors.every((d) => a + BANK < u0 + d - 1.5 || a > u0 + d + 4.5);
  for (let a = Math.ceil(u0 + CORNER_PIER); a + BANK <= u1 - CORNER_PIER; a += BANK + PIER) {
    if (clearOfDoors(a)) lockerBank(bake, floor, 'z', z0, a, a + BANK, -1);
  }
  const end = u0 > 0 ? u0 : u1;
  for (let a = Math.ceil(z0 + CORNER_PIER); a + BANK <= z1 - CORNER_PIER; a += BANK + PIER) {
    lockerBank(bake, floor, 'u', end, a, a + BANK, u0 > 0 ? -1 : 1);
  }
}

/**
 * One bank of lockers on a wall at `wall` (u or z, feet) from `from` to `to` along it, `out` the side it faces:
 * a concrete base curb, five tiers of doors painted by the look, and a sloped sheet-metal cap.
 */
function lockerBank(bake: Bake, floor: number, axis: 'u' | 'z', wall: number, from: number, to: number, out: 1 | -1) {
  const proud = 0.14;
  // Corners along the wall (s) and up (h), at depth d out from it.
  const at = (s: number, h: number, d: number): Vec3 => (axis === 'z' ? [s, h, wall + out * d] : [wall + out * d, h, s]);
  const n: Vec3 = axis === 'z' ? [0, 0, out] : [out, 0, 0];
  const base = floor + LOCKER_BASE, head = base + LOCKER_TIERS * LOCKER_TIER;
  const ordered = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): [Vec3, Vec3, Vec3, Vec3] => {
    // Wound to face out, whichever way the wall faces.
    const flip = (axis === 'z') === (out > 0);
    return flip ? [a, b, c, d] : [b, a, d, c];
  };
  panel(bake, ordered(at(from, base, proud), at(to, base, proud), at(to, head, proud), at(from, head, proud)), n, LOCKER, SURFACE.lockers);
  const box = (s0: number, s1: number, h0: number, h1: number, d: number, color: string, solid: number) => {
    const [a, c] = [at(s0, h0, 0), at(s1, h1, d)];
    campusBox(bake, [Math.min(a[0], c[0]), h0, Math.min(a[2], c[2])], [Math.max(a[0], c[0]), h1, Math.max(a[2], c[2])], color, solid);
  };
  box(from - 0.1, to + 0.1, floor, base, proud + 0.25, CURB, SURFACE.concrete);
  box(from - 0.1, to + 0.1, head, head + 0.3, proud + 0.12, LOCKER_CAP, SURFACE.metal);
}

/**
 * A low far block (feet): walls, a fascia and a shallow seam skirt, no hardware. The campus's outer ring,
 * broken into separate buildings and mostly seen through trees.
 */
function farBlock(bake: Bake, u0: number, u1: number, z0: number, z1: number, floor: number, height: number) {
  campusBlock(bake, u0, u1, z0, z1, floor, { height, eave: 3, hvac: false });
}

/** The outer campus: separate low blocks of differing height round the spot, gaps between, trees in front (elToroTrees). */
function farCampus(props: Bake) {
  const ring: Array<[u0: number, u1: number, z0: number, z1: number, floor: number, height: number]> = [
    // Beyond the locker side, behind the gums along z = 175.
    [-300, -215, 186, 250, 0, 11], [-190, -95, 190, 245, 0, 12], [-75, -5, 184, 235, 0, 12],
    [40, 135, 188, 250, -9.5, 11], [160, 255, 184, 240, -9.5, 12],
    // Beyond the canopy side, behind the gums along z = -225.
    [-300, -205, -305, -240, 0, 12], [-180, -120, -295, -238, 0, 10.5], [-95, -5, -305, -245, 0, 12],
    [45, 140, -295, -238, -9.5, 11], [165, 260, -305, -240, -9.5, 12.5],
    // Downhill past block F, behind the gums along u = 245; uphill behind those along u = -265.
    [258, 318, -215, -120, -9.5, 11], [262, 312, -95, 0, -9.5, 12], [258, 322, 30, 160, -9.5, 11.5],
    [-345, -280, -150, -40, 0, 12], [-340, -282, 60, 160, 0, 11],
  ];
  for (const [u0, u1, z0, z1, floor, height] of ring) farBlock(props, u0, u1, z0, z1, floor, height);
}

/** The lower level's fixtures: grey litter bins (refs/60), two concrete benches by the lawn. */
function fixtures(props: Bake) {
  const metal = tag(SURFACE.metal);
  for (const [u, z] of [[36, 27], [58, -4], [112, -44]]) {
    const at = (h: number) => point(u, -9.5 + h, z);
    // A darker foot ring, the drum, a rolled rim at its top, and a low dark domed lid.
    props.tube([at(0), at(0.25)], [1.05 * F, 1.05 * F], { color: '#626559' }, metal, 14, false);
    props.tube([at(0.25), at(2.9)], [1.0 * F, 1.04 * F], { color: '#7a7d71' }, metal, 14, false);
    props.tube([at(2.9), at(3.1)], [1.1 * F, 1.1 * F], { color: '#8d9083' }, metal, 14, false);
    props.tube([at(3.1), at(3.12), at(3.2)], [1.1 * F, 0.8 * F, 0.02 * F], { color: '#3e3f39' }, metal, 14, true);
  }
  // Concrete benches: a thick precast seat on two pedestals, a rubbed-pale top.
  for (const u of [57, 106]) {
    campusBox(props, [u + 0.6, -9.5, -71.6], [u + 1.6, -8.1, -70.4], '#b4aa93', SURFACE.concrete);
    campusBox(props, [u + 5.4, -9.5, -71.6], [u + 6.4, -8.1, -70.4], '#b4aa93', SURFACE.concrete);
    campusBox(props, [u, -8.1, -72], [u + 7, -7.75, -70], '#c9bfa6', SURFACE.concrete);
  }
}

/**
 * The round lawn (refs/60): a grass island with a low concrete seat-wall round its near arc, broken where the
 * paths come in. The wall has a coping a little wider than its face, pale where it's sat on.
 */
function roundLawn(ground: Bake, props: Bake) {
  const [cu, cz, radius] = [82, -32, 38];
  const segments = 64;
  const concrete = tag(SURFACE.concrete);
  const ring = (a: number, r: number, h: number) => point(cu + Math.cos(a) * r, h, cz + Math.sin(a) * r);
  for (let i = 0; i < segments; i++) {
    const [a, c] = [(i * 2 * Math.PI) / segments, ((i + 1) * 2 * Math.PI) / segments];
    ground.triangle(point(cu, -9.45, cz), ring(a, radius, -9.45), ring(c, radius, -9.45), UP, { color: '#7b8950' }, tag(SURFACE.grass));
    // The seat-wall stands on the half facing the stairs, in two arcs with an opening between them.
    const quarter = segments / 4;
    if (i < quarter || i >= 3 * quarter || i % quarter > 12) continue;
    const out: Vec3 = [Math.cos((a + c) / 2), 0, Math.sin((a + c) / 2)];
    const inward: Vec3 = [-out[0], 0, -out[2]];
    const tone = 0.04 * (hash2(i, 0, 61) - 0.5);
    const face = tone > 0 ? '#bbb29c' : '#b5ac96';
    props.quad(ring(a, radius, -9.5), ring(c, radius, -9.5), ring(c, radius, -8.15), ring(a, radius, -8.15), out, { color: face }, concrete);
    props.quad(ring(c, radius - 1, -9.45), ring(a, radius - 1, -9.45), ring(a, radius - 1, -8.15), ring(c, radius - 1, -8.15), inward, { color: '#a59c86' }, concrete);
    // The coping: proud of both faces, its edges and its top.
    const [lo, hi, rIn, rOut] = [-8.15, -8.0, radius - 1.12, radius + 0.12];
    props.quad(ring(a, rOut, lo), ring(c, rOut, lo), ring(c, rOut, hi), ring(a, rOut, hi), out, { color: '#c7bea7' }, concrete);
    props.quad(ring(c, rIn, lo), ring(a, rIn, lo), ring(a, rIn, hi), ring(c, rIn, hi), inward, { color: '#bdb49d' }, concrete);
    props.quadCorners(ring(a, rIn, hi), ring(c, rIn, hi), ring(c, rOut, hi), ring(a, rOut, hi), UP,
      [{ color: '#d3cab2' }, { color: '#d3cab2' }, { color: '#cbc2aa' }, { color: '#cbc2aa' }], concrete);
    props.quad(ring(a, rIn, lo), ring(a, rOut, lo), ring(c, rOut, lo), ring(c, rIn, lo), DOWN, { color: '#9d947f' }, concrete);
  }
}

/**
 * The lower campus: blocks B, D, E, F, G and H round the stairs (SITE_PLAN), the outer ring of far blocks, the
 * round lawn and the fixtures. The paving at the stair foot is the stairs' own (elToroGeometry).
 */
export function buildLowerCampus(ground: Bake, props: Bake) {
  farCampus(props);
  // B: the lower lockers, along the rollaway and facing the bank. G: lockers past the top of the run-up.
  campusBlock(props, 42, 138, 30, 126, -9.5, { lockers: true, doors: [19, 76] });
  campusBlock(props, -236, -140, 35, 131, 0, { lockers: true, doors: [19, 76] });
  // D beyond the canopy, E the stucco block with its red-tile edge, F closing the view down the rollaway.
  campusBlock(props, -110, -10, -190, -100, 0, { height: 14, lights: true });
  campusBlock(props, 60, 150, -180, -95, -9.5, { height: 12, eave: 2, roof: '#8d604a', wall: '#c2b293', wallSolid: SURFACE.stucco, hvac: false });
  campusBlock(props, 150, 220, -60, 10, -9.5, { height: 12 });
  // H closes the view back up the run-up, its end facing down the walk, far beyond where the rider waits.
  campusBlock(props, -250, -185, -45, 24, 0, { height: 12, lights: true, doors: [20, 44] });
  roundLawn(ground, props);
  fixtures(props);
}
