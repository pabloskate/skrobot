import type { BufferGeometry } from 'three';
import type { Vec3 } from '../../camera/view';
import { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { canopiesFromTrees, stairContacts, type Canopy, type ContactLine } from '../surfaces';
import { buildCampusBuildings, buildRoessler } from './ucDavisBuildings';
import {
  CHAIN_LINK, F, LEAVES, METAL, UP, chainLink, face, floor, mixHex, normalOf, part, pipe, solidBox, tag, tube, valueNoise,
  type Plan, type RailShadow, type ShadowBox,
} from './ucDavisKit';
import {
  UC_DAVIS_BANK_Z0, UC_DAVIS_BANK_Z1, UC_DAVIS_BUILDING_BACK_X,
  UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z0, UC_DAVIS_DROP,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_WRAP_Z, UC_DAVIS_WRAP_BACK_X, UC_DAVIS_CURB_TOP,
  UC_DAVIS_PLANTER_BASE, UC_DAVIS_PLANTER_RADIUS,
  UC_DAVIS_PLANTER_TOP, UC_DAVIS_PLANTER_X, UC_DAVIS_PLANTER_Z,
  UC_DAVIS_RISER, UC_DAVIS_RUN, UC_DAVIS_STAIR_FLIGHT,
  UC_DAVIS_STAIR_MID_END, UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1,
  UC_DAVIS_STEPS_PER_FLIGHT, UC_DAVIS_TREAD,
  ucDavisBank, ucDavisBankEnd, ucDavisOnPlanter, ucDavisStairGround,
  ucDavisCornerPoint, ucDavisSideBankTop, ucDavisWrapSurface, ucDavisSurface,
} from './ucDavisLayout';
import { UC_DAVIS_PAINT as PAINT } from './ucDavisPalette';
import { UC_DAVIS_TREES } from './ucDavisTrees';
import { UC_DAVIS_DRIVE, UC_DAVIS_LAWNS, buildUcDavisWear, curbTone, finTone, planterTone, ucDavisLawn } from './ucDavisWear';

const LOWER = -UC_DAVIS_DROP;
const FAR = 900 * F;
const CONCRETE = tag('concrete');
const ASPHALT = tag('asphalt');
const SOIL = tag('soil');
const GRASS = tag('grass');
const STEP = part(40, 'concrete', 4, 0.12);
const CURB = part(44, 'concrete', 3, 0.12);
const PLANTER = part(46, 'concrete', 3, 0.12);
const COPING = part(48, 'concrete', 3, 0.12);

/* ----- The lower ground: sidewalk, drive, plaza and lawns ----- */

/** Past these the campus is lawn under trees to the horizon (x and z, set units), no paving running out to the sky. */
const FIELDS_X = [-140 * F, 125 * F];
const FIELDS_Z = [-150 * F, 150 * F];

/** Where the lower ground changes from one surface to the next (x and z, set units). */
const X_EDGES = [...UC_DAVIS_DRIVE, ...UC_DAVIS_LAWNS.flatMap(([x0, x1]) => [x0, x1]), ...FIELDS_X].sort((a, b) => a - b);
const Z_EDGES = [...UC_DAVIS_LAWNS.flatMap(([, , z0, z1]) => [z0, z1]), ...FIELDS_Z].sort((a, b) => a - b);

/** The lower ground's surface and paint at a point: lawn, the drive's asphalt, or concrete paving. */
function lowerPaint(x: number, z: number): [string, ReturnType<typeof tag>] {
  if (ucDavisLawn(x, z) || x < FIELDS_X[0] || x > FIELDS_X[1] || z < FIELDS_Z[0] || z > FIELDS_Z[1]) {
    return [PAINT.lawn, GRASS];
  }
  if (x > UC_DAVIS_DRIVE[0] && x < UC_DAVIS_DRIVE[1]) return [PAINT.asphalt, ASPHALT];
  return [PAINT.sidewalk, CONCRETE];
}

/** Cut values strictly inside (a, b), with the ends. */
const within = (edges: number[], a: number, b: number) => [a, ...edges.filter((v) => v > a + 0.01 && v < b - 0.01), b];

/** A rectangle of lower ground, cut where its surface changes. */
function lowerRect(ground: Bake, x0: number, x1: number, z0: number, z1: number) {
  const xs = within(X_EDGES, x0, x1), zs = within(Z_EDGES, z0, z1);
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const [color, ink] = lowerPaint((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2);
    floor(ground, xs[i], xs[i + 1], zs[j], zs[j + 1], LOWER, color, ink);
  }
}

/** Lower ground from the edge `a`…`b` (the curb's toe) on out to the far distance along +x, cut where its surface changes. */
function lowerStrip(ground: Bake, a: Plan, b: Plan) {
  const start = Math.max(a[0], b[0]);
  const xs = within(X_EDGES, start, FAR);
  const zc = (a[1] + b[1]) / 2;
  const [c0, i0] = lowerPaint((start + xs[1]) / 2, zc);
  face(ground, [a[0], LOWER, a[1]], [b[0], LOWER, b[1]], [xs[1], LOWER, b[1]], [xs[1], LOWER, a[1]], c0, i0, UP);
  for (let i = 1; i + 1 < xs.length; i++) {
    const [color, ink] = lowerPaint((xs[i] + xs[i + 1]) / 2, zc);
    face(ground, [xs[i], LOWER, a[1]], [xs[i], LOWER, b[1]], [xs[i + 1], LOWER, b[1]], [xs[i + 1], LOWER, a[1]], color, ink, UP);
  }
}

/* ----- The bank ----- */

/** Where the trodden path runs down the bank, a little wandering, on the jump line. */
const onPath = (x: number, z: number, slack = 0) => Math.abs(z - 0.28 * F * Math.sin((x / F) * 0.35)) < (1.05 + slack) * F;

/** How thick the drifts of dead leaves lie in the ivy at a point (0 none, 1 a full drift), the Camarillo photograph's brown swaths. */
const litter = (x: number, z: number) => Math.max(0, Math.min(1, (valueNoise(x / (5 * F) + 3.1, z / (5 * F)) - 0.6) / 0.14));

/**
 * The soil's paint under the ivy at a point on the bank: dark under the leaves, the brown of dead leaves in the
 * drifts, the sandy bare earth of the trodden path and its frayed edges.
 */
function bankTone(x: number, z: number, seed: number): string {
  if (onPath(x, z)) return mixHex(PAINT.path, PAINT.bare, hash2(seed, 1, 501));
  if (onPath(x, z, 0.5)) return mixHex(PAINT.bare, PAINT.litterPale, hash2(seed, 2, 501));
  const drift = litter(x, z);
  const under = mixHex(PAINT.soil, '#5a5240', 0.5 + 0.3 * hash2(seed, 3, 501));
  return mixHex(under, mixHex(PAINT.litter, hash2(seed, 4, 501) > 0.5 ? PAINT.litterPale : PAINT.litterDark, 0.4), drift);
}

/** One segment of the low curb from `a` to `b` round the bank: its face (grimy toward the gutter) and its rounded top. */
function curb(ground: Bake, props: Bake, a: { x: number; z: number }, b: { x: number; z: number }, along: number) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n: Vec3 = [(b.z - a.z) / len, 0, -(b.x - a.x) / len];
  const mid = LOWER + 0.15 * F;
  face(ground, [a.x, LOWER, a.z], [b.x, LOWER, b.z], [b.x, mid, b.z], [a.x, mid, a.z], [curbTone(along, 0), curbTone(along + len, 0), curbTone(along + len, 0.4), curbTone(along, 0.4)], CURB, n);
  face(ground, [a.x, mid, a.z], [b.x, mid, b.z], [b.x, UC_DAVIS_CURB_TOP, b.z], [a.x, UC_DAVIS_CURB_TOP, a.z], [curbTone(along, 0.4), curbTone(along + len, 0.4), curbTone(along + len, 1), curbTone(along, 1)], CURB, n);
  const inner = (p: { x: number; z: number }): Vec3 => {
    const x = p.x - n[0] * 0.3 * F, z = p.z - n[2] * 0.3 * F;
    return [x, ucDavisSurface(x, z) + 0.1, z];
  };
  face(props, inner(a), inner(b), [b.x, UC_DAVIS_CURB_TOP + 0.1, b.z], [a.x, UC_DAVIS_CURB_TOP + 0.1, a.z], mixHex(PAINT.curb, PAINT.curbGrime, 0.25 * valueNoise(along / (4 * F), 2)), CONCRETE);
}

function buildTerrain(ground: Bake, props: Bake) {
  const hall = UC_DAVIS_HALL_HALF_WIDTH;
  floor(ground, UC_DAVIS_BUILDING_FRONT_X, 0, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BANK_Z1, 0, PAINT.terrace, CONCRETE);
  lowerRect(ground, -FAR, FAR, -FAR, UC_DAVIS_STAIR_Z0);
  lowerRect(ground, -FAR, FAR, UC_DAVIS_WRAP_Z, FAR);
  lowerRect(ground, -FAR, UC_DAVIS_WRAP_BACK_X, UC_DAVIS_BANK_Z1, UC_DAVIS_WRAP_Z);
  lowerRect(ground, -FAR, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_STAIR_Z0, UC_DAVIS_BANK_Z1);
  floor(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_STAIR_Z0, -hall, LOWER, PAINT.sidewalk, CONCRETE);
  floor(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, hall, UC_DAVIS_BANK_Z1, LOWER, PAINT.sidewalk, CONCRETE);
  floor(ground, UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, -hall, hall, 0, PAINT.terrace, CONCRETE);
  // Only the real upper walkway is raised; the landing remains open. Its right end and its front past the
  // stairs stand as cast walls, streaked from the coping and grimy at their feet.
  const right = UC_DAVIS_BUILDING_Z0;
  for (let k = 0; k < 4; k++) {
    const a = UC_DAVIS_BUILDING_FRONT_X * (1 - k / 4), b = UC_DAVIS_BUILDING_FRONT_X * (1 - (k + 1) / 4);
    for (const [y0, y1] of [[LOWER, LOWER + 2.5 * F], [LOWER + 2.5 * F, 0]]) {
      face(ground, [a, y0, right], [b, y0, right], [b, y1, right], [a, y1, right], [finTone(a, y0 - LOWER, PAINT.copingFace), finTone(b, y0 - LOWER, PAINT.copingFace), finTone(b, y1 - LOWER, PAINT.copingFace), finTone(a, y1 - LOWER, PAINT.copingFace)], COPING, [0, 0, -1]);
    }
  }
  for (let z = UC_DAVIS_BUILDING_Z0; z < UC_DAVIS_STAIR_Z0 - 1; z += 5 * F) {
    const z1 = Math.min(z + 5 * F, UC_DAVIS_STAIR_Z0);
    for (const [y0, y1] of [[LOWER, LOWER + 2.5 * F], [LOWER + 2.5 * F, 0]]) {
      face(ground, [0, y0, z], [0, y0, z1], [0, y1, z1], [0, y1, z], [finTone(z, y0 - LOWER, PAINT.copingFace), finTone(z1, y0 - LOWER, PAINT.copingFace), finTone(z1, y1 - LOWER, PAINT.copingFace), finTone(z, y1 - LOWER, PAINT.copingFace)], COPING, [1, 0, 0]);
    }
  }
  // The left terrace edge meets soil just below its level. The soil falls
  // away sideways around the corner, so only this short lip is exposed.
  for (let k = 0; k < 14; k++) {
    const a = UC_DAVIS_BUILDING_FRONT_X * (1 - k / 14), b = UC_DAVIS_BUILDING_FRONT_X * (1 - (k + 1) / 14);
    face(ground, [a, ucDavisSideBankTop(a), UC_DAVIS_BANK_Z1], [b, ucDavisSideBankTop(b), UC_DAVIS_BANK_Z1], [b, 0, UC_DAVIS_BANK_Z1], [a, 0, UC_DAVIS_BANK_Z1], PAINT.copingFace, COPING, [0, 0, 1]);
  }
  // The coping's face along the lip, a few inches standing out of the bank's soil.
  for (let z = UC_DAVIS_BANK_Z0; z < UC_DAVIS_BANK_Z1 - 1; z += 4 * F) {
    const z1 = Math.min(z + 4 * F, UC_DAVIS_BANK_Z1);
    const tone = (zz: number, t: number) => mixHex(PAINT.copingFace, PAINT.plinthGrime, 0.5 * (1 - t) * (0.6 + 0.4 * valueNoise(zz / (2 * F), 5)));
    face(ground, [0, -0.65 * F, z], [0, -0.65 * F, z1], [0, 0, z1], [0, 0, z], [tone(z, 0), tone(z1, 0), tone(z1, 1), tone(z, 1)], COPING, [1, 0, 0]);
  }
  const rows = Math.round((UC_DAVIS_BANK_Z1 - UC_DAVIS_BANK_Z0) / (0.5 * F));
  let along = 0;
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
      const corners = [at(z0, start0, toe0, a), at(z1, start1, toe1, a), at(z1, start1, toe1, b), at(z0, start0, toe0, b)];
      face(ground, corners[0], corners[1], corners[2], corners[3], corners.map((p, k) => bankTone(p[0], p[2], row * 31 + col * 7 + k)) as [string, string, string, string], SOIL);
    }
    // The bank's low curving concrete edging follows its actual bowed toe.
    curb(ground, props, { x: toe0, z: z0 }, { x: toe1, z: z1 }, along);
    along += Math.hypot(toe1 - toe0, z1 - z0);
    lowerStrip(ground, [toe0, z0], [toe1, z1]);
  }
  buildWraparoundBank(ground, props);
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
  let along = 100 * F;
  for (let k = 0; k < segments; k++) {
    const a = k * Math.PI / (2 * segments), b = (k + 1) * Math.PI / (2 * segments);
    for (let ring = 0; ring < rings; ring++) {
      const lo = ring / rings, hi = (ring + 1) / rings;
      if (ring === 0) {
        const c = at(b, hi), d = at(a, hi);
        const n = normalOf(centre, c, d);
        const up: Vec3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
        ground.triangle(centre, c, d, up, { color: bankTone(c[0], c[2], k) }, SOIL);
      } else {
        const corners = [at(a, lo), at(b, lo), at(b, hi), at(a, hi)];
        face(ground, corners[0], corners[1], corners[2], corners[3], corners.map((p, j) => bankTone(p[0], p[2], k * 37 + ring * 5 + j)) as [string, string, string, string], SOIL);
      }
    }
    const c = ucDavisCornerPoint(a), d = ucDavisCornerPoint(b);
    curb(ground, props, c, d, along);
    along += Math.hypot(d.x - c.x, d.z - c.z);
    lowerStrip(ground, [c.x, c.z], [d.x, d.z]);
  }
  const columns = 64, rows = 24;
  const point = (x: number, z: number): Vec3 => [x, ucDavisWrapSurface(x, z)!, z];
  for (let col = 0; col < columns; col++) {
    const a = UC_DAVIS_WRAP_BACK_X * col / columns, b = UC_DAVIS_WRAP_BACK_X * (col + 1) / columns;
    for (let row = 0; row < rows; row++) {
      const z0 = UC_DAVIS_BANK_Z1 + (UC_DAVIS_WRAP_Z - UC_DAVIS_BANK_Z1) * row / rows;
      const z1 = UC_DAVIS_BANK_Z1 + (UC_DAVIS_WRAP_Z - UC_DAVIS_BANK_Z1) * (row + 1) / rows;
      const corners = [point(a, z0), point(b, z0), point(b, z1), point(a, z1)];
      face(ground, corners[0], corners[1], corners[2], corners[3], corners.map((p, j) => bankTone(p[0], p[2], col * 29 + row * 3 + j)) as [string, string, string, string], SOIL);
    }
    curb(ground, props, { x: a, z: UC_DAVIS_WRAP_Z }, { x: b, z: UC_DAVIS_WRAP_Z }, along);
    along += Math.abs(b - a);
  }
  curb(ground, props, { x: UC_DAVIS_WRAP_BACK_X, z: UC_DAVIS_WRAP_Z }, { x: UC_DAVIS_WRAP_BACK_X, z: UC_DAVIS_BANK_Z1 }, along);
}

/* ----- The planter ----- */

/**
 * The semicircular rock planter beside the launch: board-formed concrete, each form board a few inches wide in
 * its own tone with a seam between, algae and grime at its foot where the bank's soil and water lie against
 * it, its pale cap, and rounded river stones seated in its dark fill (the Camarillo and Luc photographs).
 */
function buildPlanter(ground: Bake, props: Bake) {
  const r = UC_DAVIS_PLANTER_RADIUS;
  const inner = r - 0.4 * F;
  const fill = -0.35 * F;
  const point = (a: number, radius: number, y: number): Vec3 => [UC_DAVIS_PLANTER_X + Math.cos(a) * radius, y, UC_DAVIS_PLANTER_Z + Math.sin(a) * radius];
  const rows = [0, 0.12, 0.3, 0.55, 1];
  const height = UC_DAVIS_PLANTER_TOP - UC_DAVIS_PLANTER_BASE;
  for (let k = 0; k < 44; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 44, b = a + Math.PI / 44;
    const normal: Vec3 = [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)];
    for (let j = 0; j + 1 < rows.length; j++) {
      const y0 = UC_DAVIS_PLANTER_BASE + height * rows[j], y1 = UC_DAVIS_PLANTER_BASE + height * rows[j + 1];
      face(ground, point(a, r, y0), point(b, r, y0), point(b, r, y1), point(a, r, y1),
        [planterTone(k, rows[j]), planterTone(k, rows[j]), planterTone(k, rows[j + 1]), planterTone(k, rows[j + 1])], PLANTER, normal);
    }
    const cap = mixHex(PAINT.planterTop, PAINT.planterGrime, 0.2 * valueNoise(k / 4, 1.3));
    face(ground, point(a, inner, UC_DAVIS_PLANTER_TOP), point(b, inner, UC_DAVIS_PLANTER_TOP), point(b, r, UC_DAVIS_PLANTER_TOP), point(a, r, UC_DAVIS_PLANTER_TOP), cap, CONCRETE, UP);
    face(ground, point(a, inner, fill), point(b, inner, fill), point(b, inner, UC_DAVIS_PLANTER_TOP), point(a, inner, UC_DAVIS_PLANTER_TOP), PAINT.planterInside, CONCRETE, [-normal[0], 0, -normal[2]]);
    ground.triangle([UC_DAVIS_PLANTER_X, fill, UC_DAVIS_PLANTER_Z], point(b, inner, fill), point(a, inner, fill), UP, { color: PAINT.fill }, SOIL);
    // The formwork's tie seams, every few boards.
    if (k % 4 === 0) {
      const p = point(a, r + 0.06, UC_DAVIS_PLANTER_BASE);
      tube(props, [p, [p[0], UC_DAVIS_PLANTER_TOP - 1, p[2]]], 0.3, PAINT.planterGrime, CONCRETE, 4);
    }
  }
  // Rounded river stones, seated into the darker fill rather than
  // suspended over it. Their footprint stays inside the concrete ring.
  for (let i = 0; i < 100; i++) {
    const angle = -Math.PI / 2 + hash2(i, 0, 502) * Math.PI;
    const reach = Math.sqrt(hash2(i, 1, 502)) * (inner - 0.35 * F);
    const radius = (0.19 + hash2(i, 2, 502) * 0.2) * F;
    blob(props, [Math.cos(angle) * reach, fill + radius * 0.14, UC_DAVIS_PLANTER_Z + Math.sin(angle) * reach], [radius, radius * 0.62, radius * 0.8],
      PAINT.stones[i % PAINT.stones.length], i, CONCRETE, 5, 2);
  }
}

/* ----- The nine-flat-nine ----- */

/**
 * The sole access stair: two nine-riser flights in cast concrete with a level landing between, its noses, riser
 * grime and tread dust the look's own (UC_DAVIS_LOOK.stairs), and the dark painted handrails down both sides.
 */
function buildStairs(ground: Bake, props: Bake, rails: RailShadow[]) {
  const z0 = UC_DAVIS_STAIR_Z0, z1 = UC_DAVIS_STAIR_Z1;
  lowerRect(ground, UC_DAVIS_RUN, FAR, z0, z1);
  floor(ground, UC_DAVIS_STAIR_FLIGHT, UC_DAVIS_STAIR_MID_END, z0, z1, LOWER / 2, PAINT.stairTread, STEP);
  for (let flight = 0; flight < 2; flight++) {
    const base = flight === 0 ? 0 : UC_DAVIS_STAIR_MID_END;
    for (let step = 0; step < UC_DAVIS_STEPS_PER_FLIGHT; step++) {
      const x = base + step * UC_DAVIS_TREAD;
      const y0 = -flight * UC_DAVIS_DROP / 2 - step * UC_DAVIS_RISER;
      const y1 = y0 - UC_DAVIS_RISER;
      face(ground, [x, y1, z0], [x, y1, z1], [x, y0, z1], [x, y0, z0], PAINT.stair, STEP, [1, 0, 0]);
      if (step < UC_DAVIS_STEPS_PER_FLIGHT - 1) floor(ground, x, x + UC_DAVIS_TREAD, z0, z1, y1, PAINT.stairTread, STEP);
      if (step < UC_DAVIS_STEPS_PER_FLIGHT - 1) {
        for (const z of [z0, z1]) face(ground, [x, LOWER, z], [x + UC_DAVIS_TREAD, LOWER, z], [x + UC_DAVIS_TREAD, y1, z], [x, y1, z], PAINT.cheek, CONCRETE, [0, 0, z === z0 ? -1 : 1]);
      }
    }
  }
  for (const z of [z0 + 0.45 * F, z1 - 0.45 * F]) {
    const spine: Vec3[] = [[-1.5 * F, 3 * F, z], [0, 3 * F, z], [UC_DAVIS_STAIR_FLIGHT, LOWER / 2 + 3 * F, z], [UC_DAVIS_STAIR_MID_END, LOWER / 2 + 3 * F, z], [UC_DAVIS_RUN, LOWER + 3 * F, z], [UC_DAVIS_RUN + 1.5 * F, LOWER + 3 * F, z]];
    pipe(props, spine, rails, 1.8, PAINT.handrail);
    for (const x of [-1 * F, 3 * F, 7.6 * F, UC_DAVIS_STAIR_FLIGHT + 2 * F, UC_DAVIS_STAIR_MID_END + 3 * F, UC_DAVIS_RUN - 1.4 * F, UC_DAVIS_RUN + F]) {
      const y = ucDavisStairGround(x + 0.01);
      const top = x < 0 ? 3 * F : x < UC_DAVIS_STAIR_FLIGHT ? 3 * F + x / UC_DAVIS_STAIR_FLIGHT * LOWER / 2 : x <= UC_DAVIS_STAIR_MID_END ? LOWER / 2 + 3 * F : x < UC_DAVIS_RUN ? LOWER / 2 + 3 * F + (x - UC_DAVIS_STAIR_MID_END) / UC_DAVIS_STAIR_FLIGHT * LOWER / 2 : LOWER + 3 * F;
      pipe(props, [[x, y, z], [x, top, z]], rails, 1.35, PAINT.handrail);
    }
  }
}

/* ----- Planting ----- */

/**
 * Ivy over the bank: low domed mounds of leaves seated on the slope's soil, their rims overlapping, thinned out
 * where dead leaves have drifted and gone from the trodden path; the same clusters round the corner and along
 * the pale wall. The look patterns the leaves on them in three dimensions.
 */
function buildPlanting(props: Bake) {
  const mound = (x: number, z: number, radius: number, height: number, surface: (x: number, z: number) => number, seed: number) => {
    const top: Vec3 = [x, surface(x, z) + height, z];
    const shade = PAINT.ivy[Math.floor(hash2(seed, 1, 516) * PAINT.ivy.length)];
    const dry = litter(x, z) > 0.2 ? 0.35 : 0;
    for (let petal = 0; petal < 6; petal++) {
      const at = (k: number): Vec3 => {
        const a = k * Math.PI * 2 / 6 + seed;
        const r = radius * (0.85 + 0.3 * hash2(seed, k % 6, 517));
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        return [px, surface(px, pz) + 0.02 * F, pz];
      };
      const a = at(petal), b = at(petal + 1);
      const n = normalOf(top, b, a);
      const color = mixHex(petal % 3 ? shade : PAINT.ivy[(seed + petal) % PAINT.ivy.length], PAINT.ivyDry, dry + 0.15 * hash2(seed, petal, 518));
      props.triangle(top, b, a, n[1] < 0 ? [-n[0], -n[1], -n[2]] : n, { color }, tag(LEAVES));
    }
  };
  let seed = 0;
  for (let row = 0; row < 46; row++) for (let col = 0; col < 28; col++) {
    const z = UC_DAVIS_BANK_Z0 + (row + 0.25 + 0.4 * hash2(row, col, 511)) * (UC_DAVIS_BANK_Z1 - UC_DAVIS_BANK_Z0) / 46;
    const x = (col + 0.3 + hash2(row, col, 512) * 0.4) / 28 * (ucDavisBankEnd(z) - 0.45 * F);
    seed++;
    if (onPath(x, z, -0.15 + 0.3 * hash2(row, col, 513)) || ucDavisOnPlanter(x + 0.4 * F, z) || ucDavisOnPlanter(x, z + 0.4 * F) || ucDavisOnPlanter(x, z - 0.4 * F)) continue;
    // Drifts of dead leaves show through where the ivy thins.
    if (litter(x, z) > 0.35 + 0.5 * hash2(row, col, 519)) continue;
    const radius = (0.34 + hash2(row, col, 514) * 0.24) * F;
    mound(x, z, radius, (0.14 + hash2(row, col, 515) * 0.12) * F, ucDavisBank, seed);
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
      if (litter(px, pz) > 0.35 + 0.5 * hash2(col, row, 556)) continue;
      mound(px, pz, radius, (0.12 + hash2(col, row, 557) * 0.1) * F, (a, b) => ucDavisWrapSurface(a, b)!, 5000 + col * 97 + row);
    }
  }
  conifer(props, CONIFER[0], ucDavisBank(CONIFER[0], CONIFER[1]), CONIFER[1]);
}

/** A closed low-poly ellipsoid: a river stone, a cluster of needles. */
function blob(b: Bake, center: Vec3, radius: Vec3, color: string, seed: number, ink = tag(LEAVES), sides = 6, bands = 3) {
  const point = (lat: number, lon: number): Vec3 => {
    const a = -Math.PI / 2 + lat * Math.PI / bands, t = lon * Math.PI * 2 / sides;
    const irregular = 0.9 + 0.15 * hash2(seed, lon % sides, 525);
    return [center[0] + Math.cos(a) * Math.cos(t) * radius[0] * irregular, center[1] + Math.sin(a) * radius[1], center[2] + Math.cos(a) * Math.sin(t) * radius[2] * irregular];
  };
  for (let lat = 0; lat < bands; lat++) for (let lon = 0; lon < sides; lon++) {
    const a = -Math.PI / 2 + (lat + 0.5) * Math.PI / bands, t = (lon + 0.5) * Math.PI * 2 / sides;
    const n: Vec3 = [Math.cos(a) * Math.cos(t), Math.sin(a), Math.cos(a) * Math.sin(t)];
    face(b, point(lat, lon), point(lat, lon + 1), point(lat + 1, lon + 1), point(lat + 1, lon), color, ink, n);
  }
}

/**
 * A spray of conifer needles: a flattened, rounded mass `length` along its limb (turned `yaw` from +x), `width`
 * across and `thick` deep, drooping a little at both ends.
 */
function spray(b: Bake, center: Vec3, length: number, width: number, thick: number, yaw: number, color: string, seed: number) {
  const sides = 6, bands = 3, c = Math.cos(yaw), s = Math.sin(yaw);
  const point = (lat: number, lon: number): Vec3 => {
    const a = -Math.PI / 2 + lat * Math.PI / bands, t = lon * Math.PI * 2 / sides;
    const irregular = 0.85 + 0.25 * hash2(seed, lon % sides, 526);
    const u = Math.cos(a) * Math.cos(t) * length / 2 * irregular, w = Math.cos(a) * Math.sin(t) * width / 2 * irregular;
    const sag = -0.6 * thick * (2 * u / length) ** 2;
    return [center[0] + c * u - s * w, center[1] + Math.sin(a) * thick / 2 + sag, center[2] + s * u + c * w];
  };
  for (let lat = 0; lat < bands; lat++) for (let lon = 0; lon < sides; lon++) {
    const p = [point(lat, lon), point(lat, lon + 1), point(lat + 1, lon + 1), point(lat + 1, lon)];
    const mid: Vec3 = [(p[0][0] + p[2][0]) / 2 - center[0], (p[0][1] + p[2][1]) / 2 - center[1], (p[0][2] + p[2][2]) / 2 - center[2]];
    const m = Math.hypot(...mid) || 1;
    face(b, p[0], p[1], p[2], p[3], mixHex(color, '#3f5048', lat === 0 ? 0.3 : 0), tag(LEAVES), [mid[0] / m, mid[1] / m, mid[2] / m]);
  }
}

/** Where the blue conifer stands on the bank, right of the jump line (x, z). */
const CONIFER: Plan = [5 * F, -8 * F];

/**
 * The blue conifer on the bank (the Camarillo photograph): a slender grey trunk with a lean and a kink, and
 * sparse tiers of drooping blue-grey branches, their needles in loose clusters hanging off each limb.
 */
function conifer(props: Bake, x: number, y: number, z: number) {
  const height = 24 * F;
  props.tube([[x, y, z], [x + 0.2 * F, y + height * 0.7, z], [x, y + height, z + 0.4 * F]], [0.28 * F, 0.14 * F, 0.025 * F], { color: '#7a756a' }, tag('stucco'), 7, true);
  const needles = ['#5f746c', '#6d847a', '#53665e', '#7a8f84', '#66796f'];
  const tiers = 12;
  for (let tier = 0; tier < tiers; tier++) {
    const h = (4 + tier * 1.6 + 0.5 * hash2(tier, 0, 540)) * F;
    const reach = (4.6 - tier * 0.33) * F;
    const trunkX = x + 0.2 * F * Math.min(1, h / (height * 0.7));
    for (let branch = 0; branch < 4; branch++) {
      if (hash2(tier, branch, 541) < 0.12) continue;
      const angle = tier * 2.39 + branch * Math.PI / 2 + 0.7 * (hash2(tier, branch, 542) - 0.5);
      const r = reach * (0.7 + 0.45 * hash2(tier, branch, 543));
      const c = Math.cos(angle), sn = Math.sin(angle);
      // Out and then down: a limb that rises a little from the trunk and droops toward its tip.
      const along = (t: number): Vec3 => [trunkX + c * r * t, y + h + 0.35 * F * t - 1.6 * F * t * t, z + sn * r * t];
      tube(props, [along(0), along(0.5), along(1)], (0.035 + (tiers - tier) * 0.005) * F, '#77736a', tag('stucco'), 4);
      for (let cluster = 0; cluster < 3; cluster++) {
        const t = 0.4 + cluster * 0.28 + 0.08 * (hash2(tier * 7 + branch, cluster, 544) - 0.5);
        const p = along(t);
        const length = (1.9 + 0.9 * hash2(tier, branch * 3 + cluster, 547)) * F * (1 - 0.35 * tier / tiers);
        spray(props, [p[0], p[1] - 0.3 * F, p[2]], length, length * 0.72, 0.5 * F, angle + 0.5 * (hash2(tier, branch * 3 + cluster, 545) - 0.5),
          needles[(tier * 3 + branch + cluster) % needles.length], tier * 17 + branch * 5 + cluster);
      }
    }
  }
  // The leader: a few small tufts up the top of the trunk.
  for (let k = 0; k < 3; k++) spray(props, [x + 0.05 * F, y + (22 + k * 0.75) * F, z + 0.3 * F], 0.9 * F, 0.75 * F, 0.6 * F, k * 1.3, needles[k], 900 + k);
}

/* ----- Campus life ----- */

/** A globe lamp on a dark bronze pole, the old campus fitting (the 2023 frames). */
function globeLamp(props: Bake, x: number, y: number, z: number) {
  tube(props, [[x, y, z], [x, y + 0.6 * F, z]], 0.22 * F, PAINT.lampPole, METAL, 8);
  tube(props, [[x, y + 0.6 * F, z], [x, y + 12.2 * F, z]], 0.1 * F, PAINT.lampPole, METAL, 8);
  tube(props, [[x, y + 12.1 * F, z], [x, y + 12.5 * F, z]], 0.2 * F, PAINT.lampPole, METAL, 8);
  blob(props, [x, y + 13.2 * F, z], [0.75 * F, 0.75 * F, 0.75 * F], PAINT.globe, Math.round(x + z), tag('stucco'), 8, 4);
}

/**
 * A bicycle standing in a rack, its wheels in the plane through (x, z) turned `yaw` radians from +x: two
 * spoked-looking wheels (dark tyres round a pale rim), the frame's diamond in its paint, bars and saddle.
 */
function bicycle(props: Bake, x: number, y: number, z: number, yaw: number, color: string) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const p = (u: number, v: number, w = 0): Vec3 => [x + c * u - s * w, y + v, z + s * u + c * w];
  const r = 1.1 * F, wheelbase = 3.4 * F;
  for (const u of [-wheelbase / 2, wheelbase / 2]) {
    const ring: Vec3[] = [];
    for (let k = 0; k <= 10; k++) ring.push(p(u + Math.cos((k / 10) * Math.PI * 2) * r, r + Math.sin((k / 10) * Math.PI * 2) * r));
    tube(props, ring, 0.07 * F, PAINT.tire, METAL, 3);
  }
  const rear = p(-wheelbase / 2, r), front = p(wheelbase / 2, r);
  const crank = p(-0.15 * F, r * 0.95), seatTop = p(-0.55 * F, 2.75 * F), head = p(1.15 * F, 2.65 * F);
  for (const [a, b] of [[rear, crank], [rear, seatTop], [crank, seatTop], [crank, head], [seatTop, head], [head, front]] as const) tube(props, [a, b], 0.05 * F, color, METAL, 3);
  tube(props, [p(1.15 * F, 2.65 * F), p(1.0 * F, 3.15 * F)], 0.045 * F, '#3b3b3b', METAL, 3);
  tube(props, [p(1.0 * F, 3.15 * F, -0.75 * F), p(1.0 * F, 3.15 * F, 0.75 * F)], 0.045 * F, '#3b3b3b', METAL, 3);
  solidBox(props, (() => { const q = p(-0.6 * F, 2.95 * F); return [q[0] - 0.3 * F, q[1], q[2] - 0.3 * F] as Vec3; })(),
    (() => { const q = p(-0.6 * F, 3.08 * F); return [q[0] + 0.3 * F, q[1], q[2] + 0.3 * F] as Vec3; })(), PAINT.seat, PAINT.seat, METAL, 'tfkle');
}

/**
 * A row of inverted-U bike racks along +x from `x0`, `count` hoops two and a half feet apart, bikes in most
 * slots, parked square to the row on either side (Luc's photograph from the takeoff: racks full under the oaks).
 */
function bikeRack(props: Bake, x0: number, z: number, count: number, seed: number) {
  const y = LOWER;
  for (let k = 0; k < count; k++) {
    const x = x0 + k * 2.5 * F;
    tube(props, [[x, y, z - 0.9 * F], [x, y + 2.6 * F, z - 0.9 * F], [x, y + 2.9 * F, z - 0.6 * F], [x, y + 2.9 * F, z + 0.6 * F], [x, y + 2.6 * F, z + 0.9 * F], [x, y, z + 0.9 * F]], 0.08 * F, PAINT.rack, METAL, 4);
    if (hash2(seed, k, 560) < 0.28) continue;
    const side = hash2(seed, k, 561) > 0.5 ? 1 : -1;
    const color = PAINT.bikes[Math.floor(hash2(seed, k, 562) * PAINT.bikes.length)];
    bicycle(props, x + 0.35 * F * side, y, z + side * 0.2 * F, Math.PI / 2 + (hash2(seed, k, 563) - 0.5) * 0.12, color);
  }
}

/** A campus bench: slatted wooden seat and back on dark steel ends, facing `facing` (+1 toward +z). */
function bench(props: Bake, x: number, z: number, facing: 1 | -1) {
  const y = LOWER, w = 3 * F;
  for (const dx of [-w + 0.3 * F, w - 0.3 * F]) solidBox(props, [x + dx - 0.08 * F, y, z - 0.8 * F], [x + dx + 0.08 * F, y + 1.5 * F, z + 0.8 * F], PAINT.benchFrame, PAINT.benchFrame, METAL);
  for (let k = 0; k < 3; k++) solidBox(props, [x - w, y + 1.45 * F, z - 0.75 * F + k * 0.5 * F], [x + w, y + 1.6 * F, z - 0.4 * F + k * 0.5 * F], PAINT.bench, PAINT.bench, tag('stucco'));
  for (let k = 0; k < 2; k++) {
    const zz = z - facing * 0.8 * F;
    solidBox(props, [x - w, y + 2.0 * F + k * 0.45 * F, zz - 0.06 * F], [x + w, y + 2.3 * F + k * 0.45 * F, zz + 0.06 * F], PAINT.bench, PAINT.bench, tag('stucco'));
  }
}

/** A plain green litter bin with its dark lid. */
function bin(props: Bake, x: number, z: number) {
  props.tube([[x, LOWER, z], [x, LOWER + 3.2 * F, z]], [0.95 * F, 0.95 * F], { color: PAINT.bin }, METAL, 10, true);
  props.tube([[x, LOWER + 3.2 * F, z], [x, LOWER + 3.5 * F, z]], [1 * F, 0.8 * F], { color: '#2f3430' }, METAL, 10, true);
}

/**
 * Campus life round the gap: globe lamps along the paths, racks of bikes on the plaza across the drive and at
 * the stair's foot, benches and a bin, and a chain-link fence round the service yard past the far lawn.
 */
function buildCampus(props: Bake, mesh: Bake) {
  for (const [x, z] of [[42, 49], [76, -14], [-40, 38.5], [UC_DAVIS_RUN / F + 2, -38], [62, 8]] as const) {
    const y = ucDavisSurface(x * F, z * F);
    globeLamp(props, x * F, y, z * F);
  }
  bikeRack(props, 67 * F, 22 * F, 10, 1);
  bikeRack(props, 67 * F, 30 * F, 10, 2);
  bikeRack(props, UC_DAVIS_RUN + 5 * F, -41.5 * F, 5, 3);
  bench(props, -22 * F, 38.6 * F, -1);
  bench(props, 80 * F, 4 * F, 1);
  bin(props, 74.5 * F, -14 * F);
  bin(props, -36 * F, 38.8 * F);
  chainLink(props, mesh, [-10 * F, -124 * F], [60 * F, -124 * F], LOWER, 6 * F);
  chainLink(props, mesh, [60 * F, -124 * F], [60 * F, -150 * F], LOWER, 6 * F);
}

/* ----- Contact shade and shadows ----- */

/**
 * Contact darkening (the look's lines): the facade's foot either side of the hallway and the hallway's own
 * walls, the curb round the bank's toe and along the side path, the terrace wall past the stairs, and every
 * riser of both flights.
 */
function ucDavisContacts(): ContactLine[] {
  const x = UC_DAVIS_BUILDING_FRONT_X + 0.32 * F, hall = UC_DAVIS_HALL_HALF_WIDTH;
  const toe = (z: number): Vec3 => [ucDavisBankEnd(z), LOWER, z];
  const corner = ucDavisCornerPoint(Math.PI / 2);
  return [
    { a: [x, 0, UC_DAVIS_BUILDING_Z0], b: [x, 0, -hall], reach: 1.3 * F, strength: 0.3 },
    { a: [x, 0, hall], b: [x, 0, UC_DAVIS_BANK_Z1], reach: 1.3 * F, strength: 0.3 },
    { a: [UC_DAVIS_BUILDING_BACK_X, 0, hall - 0.1], b: [UC_DAVIS_BUILDING_FRONT_X, 0, hall - 0.1], reach: 1.1 * F, strength: 0.3 },
    { a: [UC_DAVIS_BUILDING_BACK_X, 0, -hall + 0.1], b: [UC_DAVIS_BUILDING_FRONT_X, 0, -hall + 0.1], reach: 1.1 * F, strength: 0.3 },
    { a: toe(UC_DAVIS_BANK_Z0), b: toe(-10 * F), reach: 0.6 * F, strength: 0.26 },
    { a: toe(-10 * F), b: toe(6 * F), reach: 0.6 * F, strength: 0.26 },
    { a: toe(6 * F), b: toe(UC_DAVIS_BANK_Z1), reach: 0.6 * F, strength: 0.26 },
    { a: toe(UC_DAVIS_BANK_Z1), b: [corner.x, LOWER, corner.z], reach: 0.6 * F, strength: 0.26 },
    { a: [corner.x, LOWER, UC_DAVIS_WRAP_Z], b: [UC_DAVIS_WRAP_BACK_X, LOWER, UC_DAVIS_WRAP_Z], reach: 0.6 * F, strength: 0.26 },
    { a: [0, LOWER, UC_DAVIS_BUILDING_Z0], b: [0, LOWER, UC_DAVIS_STAIR_Z0], reach: 1.2 * F, strength: 0.3 },
    stairContacts(0, 0, UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1, UC_DAVIS_TREAD, UC_DAVIS_RISER, UC_DAVIS_STEPS_PER_FLIGHT, 0.4 * F, 0.26),
    stairContacts(UC_DAVIS_STAIR_MID_END, LOWER / 2, UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1, UC_DAVIS_TREAD, UC_DAVIS_RISER, UC_DAVIS_STEPS_PER_FLIGHT, 0.4 * F, 0.26),
  ];
}

/**
 * Tree crowns whose shade dapples the ground: the street-prop trees, and the conifer's two loose masses of
 * branches over the bank.
 */
function ucDavisCanopies(): Canopy[] {
  const y = ucDavisBank(CONIFER[0], CONIFER[1]);
  return [
    { at: [CONIFER[0], y + 10 * F, CONIFER[1]], radius: 4.2 * F },
    { at: [CONIFER[0], y + 17 * F, CONIFER[1]], radius: 3.2 * F },
    // Only the crowns near enough to shade what the cameras see; the far trees stand outside the budget.
    ...canopiesFromTrees(UC_DAVIS_TREES.filter(({ at }) => Math.abs(at[0]) < 110 * F && Math.abs(at[2]) < 115 * F)),
  ];
}

export interface UcDavisBuilt {
  ground: BufferGeometry;
  props: BufferGeometry;
  decals: BufferGeometry;
  wireMesh: typeof CHAIN_LINK & { geometry: BufferGeometry };
  railSegments: RailShadow[];
  shadowBoxes: ShadowBox[];
  contacts: ContactLine[];
  canopies: Canopy[];
}

/** The classic filmed ivy gap: one curved planted bank, the rock planter
 * beside its launch and one nine-flat-nine, Roessler's red wing behind and the
 * campus round it, drawn under the realistic look (UC_DAVIS_LOOK). The layout
 * owns the approximate dimensions and physical surfaces. */
export function buildUcDavisGeometry(): UcDavisBuilt {
  const ground = new Bake();
  const props = new Bake();
  const decals = new Bake();
  const mesh = new Bake();
  const railSegments: RailShadow[] = [];
  const shadowBoxes: ShadowBox[] = [];
  buildTerrain(ground, props);
  buildPlanter(ground, props);
  buildStairs(ground, props, railSegments);
  buildRoessler(props, shadowBoxes);
  buildPlanting(props);
  buildCampusBuildings(props, shadowBoxes);
  buildCampus(props, mesh);
  buildUcDavisWear(decals);
  return {
    ground: ground.geometry(),
    props: props.geometry(),
    decals: decals.geometry(),
    wireMesh: { ...CHAIN_LINK, geometry: mesh.geometry() },
    railSegments,
    shadowBoxes,
    contacts: ucDavisContacts(),
    canopies: ucDavisCanopies(),
  };
}
