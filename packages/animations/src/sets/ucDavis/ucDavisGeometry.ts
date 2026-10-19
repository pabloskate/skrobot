import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  UC_DAVIS_BANK_Z0, UC_DAVIS_BANK_Z1, UC_DAVIS_BUILDING_BACK_X,
  UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BUILDING_Z1, UC_DAVIS_DROP,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_ROOF_BOTTOM, UC_DAVIS_ROOF_TOP, UC_DAVIS_ROOF_FRONT_X,
  UC_DAVIS_WRAP_Z, UC_DAVIS_WRAP_BACK_X, UC_DAVIS_CURB_TOP,
  UC_DAVIS_FOOT as F, UC_DAVIS_PLANTER_BASE, UC_DAVIS_PLANTER_RADIUS,
  UC_DAVIS_PLANTER_TOP, UC_DAVIS_PLANTER_X, UC_DAVIS_PLANTER_Z,
  UC_DAVIS_RISER, UC_DAVIS_RUN, UC_DAVIS_STAIR_FLIGHT,
  UC_DAVIS_STAIR_MID_END, UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1,
  UC_DAVIS_STEPS_PER_FLIGHT, UC_DAVIS_TREAD,
  ucDavisBank, ucDavisBankEnd, ucDavisOnPlanter, ucDavisStairGround,
  ucDavisCornerPoint, ucDavisSideBankTop, ucDavisWrapSurface, ucDavisSurface,
} from './ucDavisLayout';

const UP: Vec3 = [0, 1, 0];
const LOWER = -UC_DAVIS_DROP;
const FAR = 900 * F;
const CONCRETE = '#b8b6a7';
const EARTH = '#807653';
const IVY = ['#3e5736', '#526644', '#5f7048', '#485f3c', '#748050'];
const ink = (id: number): Ink => ({ id, priority: 4, width: 0.12, kind: INK_PROP, solid: 6 });
const STEP = ink(40);
const MASONRY = ink(65);
const lit = (color: string, n: Vec3): Paint => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });
type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };

function flat(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = NO_INK) {
  b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], UP, lit(color, UP), detail);
}

/** Winding is derived from the normal, including the irregular bank pieces. */
function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, detail = NO_INK, outward?: Vec3) {
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...cross) || 1;
  const normal: Vec3 = outward ?? [cross[0] / len, cross[1] / len, cross[2] / len];
  if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0) b.quad(a, e, d, c, normal, lit(color, normal), detail);
  else b.quad(a, c, d, e, normal, lit(color, normal), detail);
}

function tube(b: Bake, spine: Vec3[], radius: number, color: string, shadow?: Segment[]) {
  b.tube(spine, spine.map(() => radius), { color, lit: { color: tone(color, 1.15), from: 0.1, to: 2 } }, NO_INK, 6, true);
  if (shadow) for (let i = 1; i < spine.length; i++) shadow.push({ a: spine[i - 1], b: spine[i], radius });
}

/** The classic filmed ivy gap: one curved planted bank, the rock planter
 * beside its launch and one nine-flat-nine. All detail is baked into two
 * meshes; the layout owns the approximate dimensions and physical surfaces. */
export function buildUcDavisGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: Segment[] = [];
  const shadowBoxes: ShadowBox[] = [];
  buildTerrain(ground, props);
  buildPlanter(ground, props);
  buildStairs(ground, props, railSegments);
  buildRoessler(props, shadowBoxes);
  buildPlanting(props);
  buildCampus(props, shadowBoxes);
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

function buildTerrain(ground: Bake, props: Bake) {
  flat(ground, UC_DAVIS_BUILDING_FRONT_X, 0, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BANK_Z1, 0, '#b4b0a1');
  flat(ground, -FAR, FAR, -FAR, UC_DAVIS_STAIR_Z0, LOWER, '#adb0a0');
  flat(ground, -FAR, FAR, UC_DAVIS_WRAP_Z, FAR, LOWER, '#afb1a3');
  flat(ground, -FAR, UC_DAVIS_WRAP_BACK_X, UC_DAVIS_BANK_Z1, UC_DAVIS_WRAP_Z, LOWER, '#afb1a3');
  flat(ground, -FAR, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_STAIR_Z0, UC_DAVIS_BANK_Z1, LOWER, '#adb0a0');
  flat(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_STAIR_Z0, -UC_DAVIS_HALL_HALF_WIDTH, LOWER, '#adb0a0');
  flat(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_BANK_Z1, LOWER, '#adb0a0');
  flat(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, -UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_HALL_HALF_WIDTH, 0, '#85897f');
  flat(ground, 0, FAR, UC_DAVIS_BUILDING_Z0, UC_DAVIS_STAIR_Z0, LOWER, '#adb0a0');
  // Only the real upper walkway is raised; the landing remains open.
  const right = UC_DAVIS_BUILDING_Z0;
  face(ground, [UC_DAVIS_BUILDING_FRONT_X, LOWER, right], [0, LOWER, right], [0, 0, right], [UC_DAVIS_BUILDING_FRONT_X, 0, right], '#a6a797', MASONRY, [0, 0, -1]);
  // The left terrace edge meets soil just below its level. The soil falls
  // away sideways around the corner, so only this short lip is exposed.
  for (let k = 0; k < 14; k++) {
    const a = UC_DAVIS_BUILDING_FRONT_X * (1 - k / 14), b = UC_DAVIS_BUILDING_FRONT_X * (1 - (k + 1) / 14);
    face(ground, [a, ucDavisSideBankTop(a), UC_DAVIS_BANK_Z1], [b, ucDavisSideBankTop(b), UC_DAVIS_BANK_Z1], [b, 0, UC_DAVIS_BANK_Z1], [a, 0, UC_DAVIS_BANK_Z1], '#a6a797', MASONRY, [0, 0, 1]);
  }
  face(ground, [0, LOWER, UC_DAVIS_BUILDING_Z0], [0, LOWER, UC_DAVIS_STAIR_Z0], [0, 0, UC_DAVIS_STAIR_Z0], [0, 0, UC_DAVIS_BUILDING_Z0], '#a6a797', MASONRY, [1, 0, 0]);
  face(ground, [0, -0.65 * F, UC_DAVIS_BANK_Z0], [0, -0.65 * F, UC_DAVIS_BANK_Z1], [0, 0, UC_DAVIS_BANK_Z1], [0, 0, UC_DAVIS_BANK_Z0], '#a7a799', MASONRY, [1, 0, 0]);
  const rows = Math.round((UC_DAVIS_BANK_Z1 - UC_DAVIS_BANK_Z0) / (0.5 * F));
  for (let row = 0; row < rows; row++) {
    const z0 = UC_DAVIS_BANK_Z0 + row * 0.5 * F;
    const z1 = z0 + 0.5 * F;
    const toe0 = ucDavisBankEnd(z0), toe1 = ucDavisBankEnd(z1);
    const planterEnd = (z: number) => Math.sqrt(Math.max(0, UC_DAVIS_PLANTER_RADIUS ** 2 - (z - UC_DAVIS_PLANTER_Z) ** 2));
    const start0 = planterEnd(z0), start1 = planterEnd(z1);
    const at = (z: number, start: number, toe: number, t: number): Vec3 => {
      const x = start + (toe - start) * t;
      return [x, ucDavisBank(x, z), z];
    };
    for (let col = 0; col < 26; col++) {
      const a = col / 26, b = (col + 1) / 26;
      const path = Math.abs((z0 + z1) / 2 - 0.28 * F * Math.sin(col * 0.3)) < 1.05 * F;
      const color = path ? ['#a09675', '#9a906e', '#a79b79'][row % 3] : IVY[Math.floor(hash2(row, col, 501) * IVY.length)];
      face(ground, at(z0, start0, toe0, a), at(z1, start1, toe1, a), at(z1, start1, toe1, b), at(z0, start0, toe0, b), color);
    }
    // The bank's low curving concrete edging follows its actual bowed toe.
    face(ground, [toe0, LOWER, z0], [toe1, LOWER, z1], [toe1, LOWER + 0.4 * F, z1], [toe0, LOWER + 0.4 * F, z0], '#a9ad9d', MASONRY, [1, 0, 0]);
    face(props, [toe0 - 0.3 * F, ucDavisBank(toe0 - 0.3 * F, z0) + 0.1, z0], [toe1 - 0.3 * F, ucDavisBank(toe1 - 0.3 * F, z1) + 0.1, z1], [toe1, LOWER + 0.4 * F + 0.1, z1], [toe0, LOWER + 0.4 * F + 0.1, z0], '#c1c0ae');
    face(ground, [toe0, LOWER, z0], [toe1, LOWER, z1], [FAR, LOWER, z1], [FAR, LOWER, z0], '#b1b2a5', NO_INK, UP);
  }
  buildWraparoundBank(ground, props);
  // Fine slab divisions are kept off the airborne bank and never look like
  // a tiled skatepark floor. The darker line at takeoff is the slab joint.
  for (let z = UC_DAVIS_BUILDING_Z0 + 7 * F; z < UC_DAVIS_BANK_Z1; z += 7 * F) flat(props, UC_DAVIS_BUILDING_FRONT_X, -0.04 * F, z, z + 0.035 * F, 0.08, '#8f9487');
  flat(props, -3.5 * F, -3.5 * F + 0.03 * F, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BANK_Z1, 0.09, '#929688');
  for (let x = UC_DAVIS_RUN + 6 * F; x < 130 * F; x += 13 * F) flat(props, x, x + 0.04 * F, -65 * F, 100 * F, LOWER + 0.08, '#939b8e');
  for (let z = -60 * F; z < 100 * F; z += 14 * F) flat(props, UC_DAVIS_RUN + 0.5 * F, 140 * F, z, z + 0.035 * F, LOWER + 0.09, '#93998d');
}

/** One connected planted slope and curb around the building's left return.
 * The rounded corner shares its heights with the main bank and side bed. */
function buildWraparoundBank(ground: Bake, props: Bake) {
  const segments = 40, rings = 28;
  const centre: Vec3 = [0, -0.65 * F, UC_DAVIS_BANK_Z1];
  const at = (angle: number, t: number): Vec3 => {
    const edge = ucDavisCornerPoint(angle);
    const x = edge.x * t, z = UC_DAVIS_BANK_Z1 + (edge.z - UC_DAVIS_BANK_Z1) * t;
    return [x, ucDavisWrapSurface(x, z) ?? UC_DAVIS_CURB_TOP, z];
  };
  const curb = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n: Vec3 = [(b.z - a.z) / len, 0, -(b.x - a.x) / len];
    face(ground, [a.x, LOWER, a.z], [b.x, LOWER, b.z], [b.x, UC_DAVIS_CURB_TOP, b.z], [a.x, UC_DAVIS_CURB_TOP, a.z], '#a9ad9d', MASONRY, n);
    const inner = (p: { x: number; z: number }): Vec3 => {
      const x = p.x - n[0] * 0.3 * F, z = p.z - n[2] * 0.3 * F;
      return [x, ucDavisSurface(x, z) + 0.1, z];
    };
    face(props, inner(a), inner(b), [b.x, UC_DAVIS_CURB_TOP + 0.1, b.z], [a.x, UC_DAVIS_CURB_TOP + 0.1, a.z], '#c1c0ae');
  };
  for (let k = 0; k < segments; k++) {
    const a = k * Math.PI / (2 * segments), b = (k + 1) * Math.PI / (2 * segments);
    for (let ring = 0; ring < rings; ring++) {
      const lo = ring / rings, hi = (ring + 1) / rings;
      const color = IVY[Math.floor(hash2(k, ring, 551) * IVY.length)];
      if (ring === 0) {
        const c = at(b, hi), d = at(a, hi);
        const u = c.map((v, i) => v - centre[i]), v = d.map((q, i) => q - centre[i]);
        const cross: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const len = Math.hypot(...cross), normal = cross.map(q => q / len) as Vec3;
        ground.triangle(centre, c, d, normal, lit(color, normal), NO_INK);
      } else face(ground, at(a, lo), at(b, lo), at(b, hi), at(a, hi), color);
    }
    const c = ucDavisCornerPoint(a), d = ucDavisCornerPoint(b);
    curb(c, d);
    face(ground, [c.x, LOWER, c.z], [d.x, LOWER, d.z], [FAR, LOWER, d.z], [FAR, LOWER, c.z], '#afb1a3', NO_INK, UP);
  }
  const columns = 64, rows = 24;
  const point = (x: number, z: number): Vec3 => [x, ucDavisWrapSurface(x, z)!, z];
  for (let col = 0; col < columns; col++) {
    const a = UC_DAVIS_WRAP_BACK_X * col / columns, b = UC_DAVIS_WRAP_BACK_X * (col + 1) / columns;
    for (let row = 0; row < rows; row++) {
      const z0 = UC_DAVIS_BANK_Z1 + (UC_DAVIS_WRAP_Z - UC_DAVIS_BANK_Z1) * row / rows;
      const z1 = UC_DAVIS_BANK_Z1 + (UC_DAVIS_WRAP_Z - UC_DAVIS_BANK_Z1) * (row + 1) / rows;
      face(ground, point(a, z0), point(b, z0), point(b, z1), point(a, z1), IVY[Math.floor(hash2(col, row, 552) * IVY.length)]);
    }
    curb({ x: a, z: UC_DAVIS_WRAP_Z }, { x: b, z: UC_DAVIS_WRAP_Z });
  }
  curb({ x: UC_DAVIS_WRAP_BACK_X, z: UC_DAVIS_WRAP_Z }, { x: UC_DAVIS_WRAP_BACK_X, z: UC_DAVIS_BANK_Z1 });
}

function buildPlanter(ground: Bake, props: Bake) {
  const r = UC_DAVIS_PLANTER_RADIUS;
  const inner = r - 0.4 * F;
  const fill = -0.35 * F;
  const point = (a: number, radius: number, y: number): Vec3 => [UC_DAVIS_PLANTER_X + Math.cos(a) * radius, y, UC_DAVIS_PLANTER_Z + Math.sin(a) * radius];
  for (let k = 0; k < 44; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 44, b = a + Math.PI / 44;
    const normal: Vec3 = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
    face(ground, point(a, r, UC_DAVIS_PLANTER_BASE), point(b, r, UC_DAVIS_PLANTER_BASE), point(b, r, UC_DAVIS_PLANTER_TOP), point(a, r, UC_DAVIS_PLANTER_TOP), '#bfc0af', MASONRY, normal);
    face(ground, point(a, inner, UC_DAVIS_PLANTER_TOP), point(b, inner, UC_DAVIS_PLANTER_TOP), point(b, r, UC_DAVIS_PLANTER_TOP), point(a, r, UC_DAVIS_PLANTER_TOP), '#d1d0bf', NO_INK, UP);
    face(ground, point(a, inner, fill), point(b, inner, fill), point(b, inner, UC_DAVIS_PLANTER_TOP), point(a, inner, UC_DAVIS_PLANTER_TOP), '#9d9e8f', NO_INK, [-normal[0], 0, -normal[2]]);
    ground.triangle([UC_DAVIS_PLANTER_X, fill, UC_DAVIS_PLANTER_Z], point(b, inner, fill), point(a, inner, fill), UP, lit('#9a9985', UP), NO_INK);
    // Vertical formwork seams and subtle algae stains at the base.
    if (k % 4 === 0) {
      const p = point(a, r + 0.06, UC_DAVIS_PLANTER_BASE);
      tube(props, [p, [p[0], UC_DAVIS_PLANTER_TOP - 1, p[2]]], 0.3, '#9b9e8c');
    }
  }
  // Rounded light river stones, seated into the darker fill rather than
  // suspended over it. Their footprint stays inside the concrete ring.
  for (let i = 0; i < 175; i++) {
    const angle = -Math.PI / 2 + hash2(i, 0, 502) * Math.PI;
    const reach = Math.sqrt(hash2(i, 1, 502)) * (inner - 0.35 * F);
    const radius = (0.16 + hash2(i, 2, 502) * 0.17) * F;
    blob(props, [Math.cos(angle) * reach, fill + radius * 0.14, UC_DAVIS_PLANTER_Z + Math.sin(angle) * reach], [radius, radius * 0.62, radius * 0.8], ['#bcbba8', '#d5d0ba', '#a8aa9a', '#b6afa0'][i % 4], i, 5, 2);
  }
}

function buildStairs(ground: Bake, props: Bake, rails: Segment[]) {
  const z0 = UC_DAVIS_STAIR_Z0, z1 = UC_DAVIS_STAIR_Z1;
  flat(ground, UC_DAVIS_RUN, FAR, z0, z1, LOWER, CONCRETE);
  flat(ground, UC_DAVIS_STAIR_FLIGHT, UC_DAVIS_STAIR_MID_END, z0, z1, LOWER / 2, '#c0bdac', STEP);
  for (let flight = 0; flight < 2; flight++) {
    const base = flight === 0 ? 0 : UC_DAVIS_STAIR_MID_END;
    for (let step = 0; step < UC_DAVIS_STEPS_PER_FLIGHT; step++) {
      const x = base + step * UC_DAVIS_TREAD;
      const y0 = -flight * UC_DAVIS_DROP / 2 - step * UC_DAVIS_RISER;
      const y1 = y0 - UC_DAVIS_RISER;
      face(ground, [x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0], '#a7aa9b', STEP, [1, 0, 0]);
      if (step < UC_DAVIS_STEPS_PER_FLIGHT - 1) flat(ground, x, x + UC_DAVIS_TREAD, z0, z1, y1, '#c0beac', STEP);
      face(props, [x + 0.08, y0 - 0.055 * F, z0], [x + 0.08, y0 - 0.055 * F, z1], [x + 0.08, y0, z1], [x + 0.08, y0, z0], '#d1ceba', NO_INK, [1, 0, 0]);
      if (step < UC_DAVIS_STEPS_PER_FLIGHT - 1) {
        for (const z of [z0, z1]) face(ground, [x, LOWER, z], [x + UC_DAVIS_TREAD, LOWER, z], [x + UC_DAVIS_TREAD, y1, z], [x, y1, z], '#9c9f90', NO_INK, [0, 0, z === z0 ? -1 : 1]);
      }
    }
  }
  for (const z of [z0 + 0.45 * F, z1 - 0.45 * F]) {
    const spine: Vec3[] = [[-1.5 * F, 3 * F, z], [0, 3 * F, z], [UC_DAVIS_STAIR_FLIGHT, LOWER / 2 + 3 * F, z], [UC_DAVIS_STAIR_MID_END, LOWER / 2 + 3 * F, z], [UC_DAVIS_RUN, LOWER + 3 * F, z], [UC_DAVIS_RUN + 1.5 * F, LOWER + 3 * F, z]];
    tube(props, spine, 1.8, '#414e49', rails);
    for (const x of [-1 * F, 3 * F, 7.6 * F, UC_DAVIS_STAIR_FLIGHT + 2 * F, UC_DAVIS_STAIR_MID_END + 3 * F, UC_DAVIS_RUN - 1.4 * F, UC_DAVIS_RUN + F]) {
      const y = ucDavisStairGround(x + 0.01);
      const top = x < 0 ? 3 * F : x < UC_DAVIS_STAIR_FLIGHT ? 3 * F + x / UC_DAVIS_STAIR_FLIGHT * LOWER / 2 : x <= UC_DAVIS_STAIR_MID_END ? LOWER / 2 + 3 * F : x < UC_DAVIS_RUN ? LOWER / 2 + 3 * F + (x - UC_DAVIS_STAIR_MID_END) / UC_DAVIS_STAIR_FLIGHT * LOWER / 2 : LOWER + 3 * F;
      tube(props, [[x, y, z], [x, top, z]], 1.35, '#4c5850', rails);
    }
  }
}

function buildRoessler(props: Bake, shadows: ShadowBox[]) {
  const x = UC_DAVIS_BUILDING_FRONT_X;
  const z0 = UC_DAVIS_BUILDING_Z0, z1 = UC_DAVIS_BUILDING_Z1;
  const hall = UC_DAVIS_HALL_HALF_WIDTH;
  // Two wings leave the real approach hallway open all the way to the
  // terrace. There is no wall or window across the rider's straight line.
  for (const [a, b] of [[z0, -hall], [hall, z1]]) {
    const min: Vec3 = [UC_DAVIS_BUILDING_BACK_X, LOWER, a], max: Vec3 = [x, 13 * F, b];
    props.box(min, max, a > 0 ? '#c7c9be' : '#a6a898', '#c0beaa', MASONRY);
    shadows.push({ min, max });
  }
  // Recessed wall surfaces and a low lintel make the corridor read as an
  // open passage rather than a black painted rectangle on the facade.
  for (const z of [-hall, hall]) {
    const n: Vec3 = [0, 0, z < 0 ? 1 : -1];
    face(props, [UC_DAVIS_BUILDING_BACK_X, 0, z + (z < 0 ? 0.1 : -0.1)], [x, 0, z + (z < 0 ? 0.1 : -0.1)], [x, 11.5 * F, z + (z < 0 ? 0.1 : -0.1)], [UC_DAVIS_BUILDING_BACK_X, 11.5 * F, z + (z < 0 ? 0.1 : -0.1)], '#69736a', NO_INK, n);
  }
  props.box([UC_DAVIS_BUILDING_BACK_X, 11.5 * F, -hall], [x, 13 * F, hall], '#7b8477', '#b6bdab', NO_INK);
  // The plain pale wall is immediately left of the hallway. The reddish
  // elevation continues to its right, behind the access staircase.
  for (let z = z0 + 0.5 * F, bay = 0; z < z1; z += 9 * F, bay++) {
    const end = Math.min(z + 8.5 * F, z1 - 0.45 * F);
    if (end <= z) continue;
    const rightEnd = Math.min(end, -hall);
    if (rightEnd > z) face(props, [x + 0.12, 0.4 * F, z], [x + 0.12, 0.4 * F, rightEnd], [x + 0.12, 11.6 * F, rightEnd], [x + 0.12, 11.6 * F, z], ['#914f3d', '#9a5943', '#8e513e'][bay % 3], NO_INK, [1, 0, 0]);
    if (z <= -hall) props.box([x, 0, z - 0.35 * F], [x + 0.25 * F, 12 * F, z], '#b7b9a8', '#ceccba', NO_INK);
    if (bay % 4 === 0 && z + 1.1 * F <= -hall) face(props, [x + 0.2, 0.4 * F, z + 0.2 * F], [x + 0.2, 0.4 * F, z + 1.1 * F], [x + 0.2, 11.5 * F, z + 1.1 * F], [x + 0.2, 11.5 * F, z + 0.2 * F], '#36433e', NO_INK, [1, 0, 0]);
  }
  face(props, [x + 0.12, 0, hall], [x + 0.12, 0, z1], [x + 0.12, 12 * F, z1], [x + 0.12, 12 * F, hall], '#c7c9be', NO_INK, [1, 0, 0]);
  // Small horizontal louvres visible high on the pale corner wall.
  face(props, [x + 0.16, 9.4 * F, 9 * F], [x + 0.16, 9.4 * F, 12 * F], [x + 0.16, 10.8 * F, 12 * F], [x + 0.16, 10.8 * F, 9 * F], '#59665f', NO_INK, [1, 0, 0]);
  for (let k = 0; k < 6; k++) {
    const y = (9.47 + k * 0.22) * F;
    face(props, [x + 0.2, y, 9 * F], [x + 0.2, y, 12 * F], [x + 0.2, y + 0.065 * F, 12 * F], [x + 0.2, y + 0.065 * F, 9 * F], '#a2aaa1', NO_INK, [1, 0, 0]);
  }
  for (const [a, b] of [[z0, -hall], [hall, z1]]) props.box([x, 0, a], [x + 0.32 * F, 0.42 * F, b], '#b7b7a4', '#c6c5b3', NO_INK);
  for (const z of [-hall - 0.4 * F, hall]) props.box([x, 0, z], [x + 0.25 * F, 12 * F, z + 0.4 * F], '#b7b9a8', '#ceccba', NO_INK);
  const roofMin: Vec3 = [UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_ROOF_BOTTOM, z0 - F];
  const roofMax: Vec3 = [UC_DAVIS_ROOF_FRONT_X, UC_DAVIS_ROOF_TOP, z1];
  props.box(roofMin, roofMax, '#aeb3a3', '#c1c1b0', MASONRY);
  shadows.push({ min: roofMin, max: roofMax });
  for (let z = z0; z < z1; z += 5 * F) {
    props.box([x, 11.8 * F, z], [0.4 * F, 12.3 * F, Math.min(z + 0.32 * F, z1)], '#7e8b7b', '#a1aa99', NO_INK);
    const end = Math.min(z + 4.55 * F, z1 - 0.2 * F);
    if (end > z + 0.25 * F) face(props, [0.41 * F, 12.6 * F, z + 0.25 * F], [0.41 * F, 12.6 * F, end], [0.41 * F, 14.05 * F, end], [0.41 * F, 14.05 * F, z + 0.25 * F], '#8f9a8d', NO_INK, [1, 0, 0]);
  }
}

/** Small low mounds anchor the ivy to the slope. Their irregular rims read
 * as overlapping leaves without thousands of billboard planes. */
function buildPlanting(props: Bake) {
  for (let row = 0; row < 45; row++) for (let col = 0; col < 28; col++) {
    const z = UC_DAVIS_BANK_Z0 + (row + 0.25 + 0.4 * hash2(row, col, 511)) * (UC_DAVIS_BANK_Z1 - UC_DAVIS_BANK_Z0) / 45;
    const x = (col + 0.3 + hash2(row, col, 512) * 0.4) / 28 * (ucDavisBankEnd(z) - 0.45 * F);
    const path = 0.28 * F * Math.sin(x / F * 0.35);
    if (Math.abs(z - path) < (0.9 + hash2(row, col, 513) * 0.3) * F || ucDavisOnPlanter(x + 0.4 * F, z) || ucDavisOnPlanter(x, z + 0.4 * F) || ucDavisOnPlanter(x, z - 0.4 * F)) continue;
    const radius = (0.32 + hash2(row, col, 514) * 0.22) * F;
    const top: Vec3 = [x, ucDavisBank(x, z) + (0.12 + hash2(row, col, 515) * 0.1) * F, z];
    const shade = IVY[Math.floor(hash2(row, col, 516) * IVY.length)];
    for (let petal = 0; petal < 7; petal++) {
      const angle = petal * Math.PI * 2 / 7, next = (petal + 1) * Math.PI * 2 / 7;
      const at = (a: number): Vec3 => {
        const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
        return [px, ucDavisBank(px, pz) + 0.02 * F, pz];
      };
      const a = at(angle), b = at(next);
      const n: Vec3 = [0.37, 0.93, 0];
      props.triangle(top, b, a, n, lit(petal % 3 ? shade : IVY[(row + col + petal) % IVY.length], n), NO_INK);
    }
  }
  // The same low leaf clusters continue around the corner and alongside
  // the pale wall, seated on the wrap's actual sloping soil.
  const cornerReach = ucDavisBankEnd(UC_DAVIS_BANK_Z1);
  for (let x = UC_DAVIS_WRAP_BACK_X + F, col = 0; x < cornerReach; x += 1.2 * F, col++) {
    for (let z = UC_DAVIS_BANK_Z1 + 0.65 * F, row = 0; z < UC_DAVIS_WRAP_Z - 0.65 * F; z += 0.85 * F, row++) {
      const px = x + (hash2(col, row, 553) - 0.5) * 0.35 * F;
      const pz = z + (hash2(col, row, 554) - 0.5) * 0.25 * F;
      const radius = (0.32 + hash2(col, row, 555) * 0.2) * F;
      const y = ucDavisWrapSurface(px, pz);
      if (y == null || [[px - radius, pz], [px + radius, pz], [px, pz - radius], [px, pz + radius]].some(([a, b]) => ucDavisWrapSurface(a, b) == null)) continue;
      const top: Vec3 = [px, y + (0.12 + hash2(col, row, 556) * 0.1) * F, pz];
      for (let petal = 0; petal < 7; petal++) {
        const at = (k: number): Vec3 => {
          const angle = k * Math.PI * 2 / 7;
          const a = px + Math.cos(angle) * radius, b = pz + Math.sin(angle) * radius;
          return [a, ucDavisWrapSurface(a, b)! + 0.02 * F, b];
        };
        const n: Vec3 = [0.15, 0.93, 0.34];
        const color = IVY[Math.floor(hash2(col + petal, row, 557) * IVY.length)];
        props.triangle(top, at(petal + 1), at(petal), n, lit(color, n), NO_INK);
      }
    }
  }
  conifer(props, 5 * F, ucDavisBank(5 * F, -8 * F), -8 * F);
}

/** A closed low-poly ellipsoid used for stones and connected tree foliage. */
function blob(b: Bake, center: Vec3, radius: Vec3, color: string, seed: number, sides = 6, bands = 3) {
  const point = (lat: number, lon: number): Vec3 => {
    const a = -Math.PI / 2 + lat * Math.PI / bands, t = lon * Math.PI * 2 / sides;
    const irregular = 0.9 + 0.15 * hash2(seed, lon % sides, 525);
    return [center[0] + Math.cos(a) * Math.cos(t) * radius[0] * irregular, center[1] + Math.sin(a) * radius[1], center[2] + Math.cos(a) * Math.sin(t) * radius[2] * irregular];
  };
  for (let lat = 0; lat < bands; lat++) for (let lon = 0; lon < sides; lon++) {
    const a = -Math.PI / 2 + (lat + 0.5) * Math.PI / bands, t = (lon + 0.5) * Math.PI * 2 / sides;
    const n: Vec3 = [Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)];
    face(b, point(lat, lon), point(lat, lon + 1), point(lat + 1, lon + 1), point(lat + 1, lon), color, NO_INK, n);
  }
}

function conifer(props: Bake, x: number, y: number, z: number) {
  const height = 24 * F;
  props.tube([[x, y, z], [x + 0.2 * F, y + height * 0.7, z], [x, y + height, z + 0.4 * F]], [0.28 * F, 0.14 * F, 0.025 * F], { color: '#777363' }, NO_INK, 7, true);
  for (let tier = 0; tier < 9; tier++) {
    const h = (4.5 + tier * 2.05) * F;
    const reach = (4.5 - tier * 0.36) * F;
    for (let branch = 0; branch < 4; branch++) {
      const angle = tier * 1.73 + branch * Math.PI / 2;
      const end: Vec3 = [x + Math.cos(angle) * reach, y + h - 0.65 * F, z + Math.sin(angle) * reach];
      tube(props, [[x, y + h, z], end], (0.045 + (8 - tier) * 0.007) * F, '#777866');
      for (let cluster = 1; cluster <= 2; cluster++) {
        const t = cluster / 2;
        const center: Vec3 = [x + (end[0] - x) * t, y + h - 0.4 * F, z + (end[2] - z) * t];
        blob(props, center, [(0.7 + reach / F * 0.14) * F, 0.48 * F, (0.65 + reach / F * 0.12) * F], ['#586e62', '#698174', '#466356', '#788c7b'][(tier + branch) % 4], tier * 17 + branch * 3 + cluster, 5, 2);
      }
    }
  }
}

function buildCampus(props: Bake, shadows: ShadowBox[]) {
  // The opposite Physics building is a quiet background grid, safely clear
  // of the landing. Its lowest arcade and square concrete bays fix scale.
  const x0 = 98 * F, x1 = 116 * F, z0 = -77 * F, z1 = 88 * F;
  const min: Vec3 = [x0, LOWER, z0], max: Vec3 = [x1, LOWER + 44 * F, z1];
  props.box(min, max, '#a2aaa0', '#bbc1af', MASONRY);
  shadows.push({ min, max });
  for (let z = z0; z < z1; z += 13 * F) {
    for (let floor = 0; floor < 3; floor++) {
      const y = LOWER + (1.8 + floor * 13.5) * F;
      const far = Math.min(z + 11.6 * F, z1 - 0.8 * F);
      face(props, [x0 - 0.1, y, z + F], [x0 - 0.1, y, far], [x0 - 0.1, y + 10.5 * F, far], [x0 - 0.1, y + 10.5 * F, z + F], floor === 0 ? '#65746a' : '#909c91', NO_INK, [-1, 0, 0]);
      face(props, [x0 - 0.16, y, z + F], [x0 - 0.16, y, z + 2.1 * F], [x0 - 0.16, y + 10.5 * F, z + 2.1 * F], [x0 - 0.16, y + 10.5 * F, z + F], '#576c63', NO_INK, [-1, 0, 0]);
    }
    props.box([x0 - 0.5 * F, LOWER, z], [x0, LOWER + 44 * F, z + 0.65 * F], '#c0c4b5', '#ced0c1', NO_INK);
  }
  for (let floor = 1; floor < 4; floor++) props.box([x0 - 0.45 * F, LOWER + floor * 13.5 * F, z0], [x0, LOWER + (floor * 13.5 + 0.8) * F, z1], '#c0c4b5', '#ced0c1', NO_INK);
  for (const [x, z, seed] of [[56, 62, 1], [18, 82, 2], [-40, 80, 3], [73, -42, 4], [-55, 61, 5]] as const) {
    const height = (24 + hash2(seed, 1, 530) * 8) * F;
    tube(props, [[x * F, LOWER, z * F], [x * F + 0.5 * F, LOWER + height * 0.7, z * F]], 0.45 * F, '#797765');
    for (let branch = 0; branch < 6; branch++) {
      const angle = branch * 2.399 + seed;
      const reach = (3 + hash2(seed, branch, 531) * 4) * F;
      const end: Vec3 = [x * F + Math.cos(angle) * reach, LOWER + height * 0.7 + (branch % 3) * 2.7 * F, z * F + Math.sin(angle) * reach];
      tube(props, [[x * F, LOWER + height * 0.4, z * F], end], 0.17 * F, '#797765');
      blob(props, end, [5.3 * F, 4.9 * F, 5.7 * F], ['#7d8c57', '#677e51', '#8d975d', '#6b8356'][branch % 4], seed * 10 + branch);
    }
  }
  for (const [x, z] of [[42, 49], [76, -26], [-40, 49]] as const) {
    tube(props, [[x * F, LOWER, z * F], [x * F, LOWER + 13 * F, z * F]], 0.1 * F, '#758076');
    blob(props, [x * F, LOWER + 13.6 * F, z * F], [0.7 * F, 0.7 * F, 0.7 * F], '#dfddc3', x, 7, 3);
  }
  for (let i = 0; i < 6; i++) {
    const x = (47 + i * 2.7) * F, z = 40 * F;
    const spine: Vec3[] = [];
    for (let segment = 0; segment <= 12; segment++) {
      const t = segment * Math.PI / 12;
      spine.push([x + Math.cos(t) * 0.95 * F, LOWER + Math.sin(t) * 2.9 * F, z]);
    }
    tube(props, spine, 1.3, '#63746a');
  }
  // A few dry leaves accumulate at the toe, away from the clean rollout.
  for (let leaf = 0; leaf < 90; leaf++) {
    const z = (-11 + hash2(leaf, 0, 540) * 35) * F;
    if (Math.abs(z) < 3 * F) continue;
    const x = ucDavisBankEnd(z) + (0.6 + hash2(leaf, 1, 540) * 1.5) * F;
    const r = (0.06 + hash2(leaf, 2, 540) * 0.08) * F;
    face(props, [x - r, LOWER + 0.12, z], [x, LOWER + 0.2, z + r], [x + r, LOWER + 0.12, z], [x, LOWER + 0.2, z - r], leaf % 2 ? '#a2915f' : EARTH, NO_INK, UP);
  }
}
