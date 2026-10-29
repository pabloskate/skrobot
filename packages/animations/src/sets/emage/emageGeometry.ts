import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  EMAGE_BANK_TOP, EMAGE_SHELF_END, EMAGE_DROP, EMAGE_EDGE_Z, EMAGE_FOOT as F, EMAGE_GRADE,
  EMAGE_PATH_END, EMAGE_PAVED_Z0, EMAGE_SHELF, EMAGE_SIDE_TRIPOD_Z, EMAGE_RAIL_END, EMAGE_RAIL_HEIGHT,
  EMAGE_RAIL_RADIUS, EMAGE_RAIL_START, EMAGE_RAIL_Z, EMAGE_RISER,
  EMAGE_RIVER_WIDTH, EMAGE_RUN, EMAGE_STAIR_Z0, EMAGE_STAIR_Z1,
  EMAGE_TERRACE_Z0, EMAGE_TREAD, EMAGE_WATER_EDGE, EMAGE_WATER_Y,
  emageBank, emageGround,
} from './emageLayout';

const UP: Vec3 = [0, 1, 0];
const LOWER = -EMAGE_DROP;
const PLAZA = '#b69f94', CONCRETE = '#aaa99f', TREAD = '#b4b1a5', PAVED = '#8f918b';
const SANDSTONE = ['#a2604f', '#9a5a4b', '#a96a56', '#94574a'];
const TRAIL = '#b59e8e', DIRT = '#8b7a60', WATER = '#55706b';
const RUST = '#4c3b32', GALVANIZED = '#8f9792';
const STEP: Ink = { id: 40, priority: 4, width: 0.12, kind: INK_PROP, solid: 6 };
/** How far the scenery runs either way along the river. */
const ALONG0 = -220 * F, ALONG1 = 150 * F;
const FAR_BANK = EMAGE_WATER_EDGE + EMAGE_RIVER_WIDTH;
/** The Platte River Bridge: over the bank beside the stairs, the trail and the river. */
const BRIDGE_Z0 = 24 * F, BRIDGE_Z1 = 36 * F, BRIDGE_Y = -0.05 * F;
const BRIDGE_X0 = -4 * F, BRIDGE_X1 = FAR_BANK + 40 * F;
const MAST_X = EMAGE_WATER_EDGE + 48 * F;
type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };

function face(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, normal: Vec3 = UP, ink = NO_INK) {
  const u = c.map((q, i) => q - a[i]), v = d.map((q, i) => q - a[i]);
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const paint = { color: tone(color, lambert({ x: normal[0], y: -normal[1], z: normal[2] })) };
  if (n.reduce((sum, q, i) => sum + q * normal[i], 0) < 0) b.quad(a, e, d, c, normal, paint, ink);
  else b.quad(a, c, d, e, normal, paint, ink);
}

function flat(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  face(b, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color);
}

/** A surface whose height changes only along x, sampled into strips. */
function profile(b: Bake, x0: number, x1: number, z0: number, z1: number, height: (x: number) => number, color: (x: number) => string, strips: number) {
  for (let i = 0; i < strips; i++) {
    const a = x0 + (x1 - x0) * i / strips, c = x0 + (x1 - x0) * (i + 1) / strips;
    const ya = height(a), yc = height(c);
    const n: Vec3 = [(ya - yc) / (c - a), 1, 0];
    const len = Math.hypot(...n);
    face(b, [a, ya, z0], [a, ya, z1], [c, yc, z1], [c, yc, z0], color((a + c) / 2), n.map(v => v / len) as Vec3);
  }
}

function tube(b: Bake, spine: Vec3[], radius: number, color: string, shadows?: Segment[], sides = 8) {
  b.tube(spine, spine.map(() => radius), { color, lit: { color: tone(color, 1.18), from: 0.1, to: 2 } }, NO_INK, sides, true);
  if (shadows) for (let i = 1; i < spine.length; i++) shadows.push({ a: spine[i - 1], b: spine[i], radius });
}

/** Small irregular volumes, rather than camera-facing vegetation cards. */
function foliage(b: Bake, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string, seed: number) {
  const rows = 5, cols = 8;
  const at = (r: number, c: number): Vec3 => {
    const lat = Math.PI * r / rows, a = Math.PI * 2 * c / cols;
    const jitter = 0.84 + hash2(r, c % cols, seed) * 0.3;
    return [x + rx * Math.sin(lat) * Math.cos(a) * jitter, y + ry * Math.cos(lat), z + rz * Math.sin(lat) * Math.sin(a) * jitter];
  };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = at(r, c), q = at(r + 1, c), d = at(r + 1, c + 1), e = at(r, c + 1);
    const n: Vec3 = [(a[0] + q[0] + d[0] + e[0]) / 4 - x, (a[1] + q[1] + d[1] + e[1]) / 4 - y, (a[2] + q[2] + d[2] + e[2]) / 4 - z];
    const len = Math.hypot(...n) || 1;
    face(b, a, q, d, e, tone(color, 0.92 + hash2(r, c, seed) * 0.16), n.map(v => v / len) as Vec3);
  }
}

/** Emage's amphitheater above the river trail, the South Platte straight
 * ahead and the cable-stayed bridge over both. All surfaces are procedural;
 * reference photos remain a separate research pack. */
export function buildEmageGeometry() {
  const ground = new Bake(), props = new Bake();
  const railSegments: Segment[] = [], shadowBoxes: ShadowBox[] = [];
  buildPlaza(ground, props);
  buildTerraces(ground, props);
  buildRiverside(ground, props);
  buildHandrail(props, railSegments);
  buildBridge(props);
  buildApartments(props, shadowBoxes);
  buildSkyline(props);
  buildPlanting(props);
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

function buildPlaza(ground: Bake, props: Bake) {
  // The open reddish plaza between the apartments and the top step; on the
  // bank side it runs past the bench to the bridge's landing.
  flat(ground, -250 * F, 0, -260 * F, EMAGE_EDGE_Z, 0, PLAZA);
  flat(ground, -250 * F, -4 * F, EMAGE_EDGE_Z, ALONG1, 0, PLAZA);
  for (let x = -77 * F; x < 0; x += 11 * F) flat(props, x, x + 0.025 * F, -150 * F, 40 * F, 0.08, '#95877e');
  for (let z = -146 * F; z < 40 * F; z += 12 * F) flat(props, -80 * F, z > EMAGE_EDGE_Z ? -4 * F : 0, z, z + 0.025 * F, 0.09, '#95877e');
  // Beyond the seating, the hillside falls to the trail as a planted slope.
  const slope = (x: number) => -EMAGE_DROP * Math.min(1, Math.max(0, x / EMAGE_RUN));
  profile(ground, 0, EMAGE_RUN, ALONG0, EMAGE_TERRACE_Z0, slope, x => tone('#8a8b62', 0.97 + hash2(Math.round(x), 0, 3) * 0.06), 8);
  // The seating's inland end: each tier's side, up to that slope.
  for (let tier = 0; tier < 10; tier++) {
    const x0 = tier * 2 * EMAGE_TREAD, x1 = Math.min(EMAGE_RUN, x0 + 2 * EMAGE_TREAD), y = -(tier + 1) * 2 * EMAGE_RISER;
    face(ground, [x0, y, EMAGE_TERRACE_Z0], [x0, slope(x0), EMAGE_TERRACE_Z0], [x1, slope(x1), EMAGE_TERRACE_Z0], [x1, y, EMAGE_TERRACE_Z0], '#a8a499', [0, 0, -1]);
  }
  // The planted bank outside the rail, from the plaza's edge down to the trail.
  profile(ground, -4 * F, EMAGE_RUN, EMAGE_EDGE_Z, ALONG1, emageBank, x => tone('#777c59', 0.96 + hash2(Math.round(x), 0, 4) * 0.08), 40);
}

function buildTerraces(ground: Bake, props: Bake) {
  const t = EMAGE_TREAD, r = EMAGE_RISER;
  for (let tier = 0; tier < 10; tier++) {
    const x0 = tier * 2 * t, x1 = Math.min(EMAGE_RUN, x0 + 2 * t);
    const y = -(tier + 1) * 2 * r, above = y + 2 * r;
    const stoneTop = y + r;
    const halfEnd = Math.min(x0 + t, EMAGE_RUN);
    // The tier's tread: gravel seating inland, paved slabs beside the
    // stones, and a strip of concrete between the stones and the bank.
    flat(ground, x0, x1, EMAGE_TERRACE_Z0, EMAGE_PAVED_Z0, y, TREAD);
    flat(ground, x0, x1, EMAGE_PAVED_Z0, EMAGE_STAIR_Z0, y, PAVED);
    flat(ground, x0, x1, EMAGE_STAIR_Z1, EMAGE_EDGE_Z, y, TREAD);
    for (let slab = EMAGE_PAVED_Z0 + 2 * F; slab < EMAGE_STAIR_Z0; slab += 2 * F) flat(props, x0 + 0.02 * F, x1 - 0.02 * F, slab, slab + 0.03 * F, y + 0.05, '#71736d');
    // Each tall concrete riser, full height except where the half-step stands.
    for (const [z0, z1] of [[EMAGE_TERRACE_Z0, EMAGE_STAIR_Z0], [EMAGE_STAIR_Z1, EMAGE_EDGE_Z]]) {
      face(ground, [x0, y, z0], [x0, above, z0], [x0, above, z1], [x0, y, z1], CONCRETE, [1, 0, 0], STEP);
    }
    face(ground, [x0, stoneTop, EMAGE_STAIR_Z0], [x0, above, EMAGE_STAIR_Z0], [x0, above, EMAGE_STAIR_Z1], [x0, stoneTop, EMAGE_STAIR_Z1], CONCRETE, [1, 0, 0], STEP);
    // The red sandstone half-step: two blocks side by side across the lane,
    // their joint wandering a little from row to row.
    const joint = (hash2(tier, 0, 5) - 0.5) * 1.2 * F;
    for (const [z0, z1, k] of [[EMAGE_STAIR_Z0, joint, 0], [joint, EMAGE_STAIR_Z1, 1]]) {
      const stone = SANDSTONE[(tier * 2 + k) % SANDSTONE.length];
      flat(ground, x0, halfEnd, z0, z1, stoneTop, tone(stone, 1.12));
      face(ground, [halfEnd, y, z0], [halfEnd, stoneTop, z0], [halfEnd, stoneTop, z1], [halfEnd, y, z1], stone, [1, 0, 0], STEP);
    }
    flat(props, x0 + 0.03 * F, halfEnd - 0.03 * F, joint - 0.02 * F, joint + 0.02 * F, stoneTop + 0.08, '#6f4339');
    face(ground, [x0, y, EMAGE_STAIR_Z0], [x0, stoneTop, EMAGE_STAIR_Z0], [halfEnd, stoneTop, EMAGE_STAIR_Z0], [halfEnd, y, EMAGE_STAIR_Z0], tone(SANDSTONE[tier % 4], 0.9), [0, 0, -1]);
    face(ground, [x0, y, EMAGE_STAIR_Z1], [x0, stoneTop, EMAGE_STAIR_Z1], [halfEnd, stoneTop, EMAGE_STAIR_Z1], [halfEnd, y, EMAGE_STAIR_Z1], tone(SANDSTONE[tier % 4], 0.95), [0, 0, 1]);
    if (halfEnd < x1) flat(ground, halfEnd, x1, EMAGE_STAIR_Z0, EMAGE_STAIR_Z1, y, TREAD);
    // The stair's outer wall, down to the bank beside it.
    face(ground, [x0, emageBank(x0), EMAGE_EDGE_Z], [x1, emageBank(x1), EMAGE_EDGE_Z], [x1, y, EMAGE_EDGE_Z], [x0, y, EMAGE_EDGE_Z], '#a79c85', [0, 0, 1]);
    // Gravel beds behind a concrete nosing, with weeds coming through.
    flat(props, x0 + 0.1 * F, x1 - 0.55 * F, EMAGE_TERRACE_Z0 + 0.5 * F, EMAGE_PAVED_Z0 - 0.4 * F, y + 0.06, '#7c7d72');
    for (let k = 0; k < 40; k++) {
      const x = x0 + (0.2 + hash2(tier, k, 11) * 1.1) * F;
      const z = EMAGE_TERRACE_Z0 + (1 + hash2(tier, k, 12) * 36) * F;
      flat(props, x, Math.min(x + 0.13 * F, x1 - 0.55 * F), z, z + 0.09 * F, y + 0.1, ['#8b8b7c', '#666e64', '#9b9888', '#7c8a5c'][k % 4]);
    }
    for (let k = 0; k < 5; k++) {
      const z = EMAGE_TERRACE_Z0 + (2 + hash2(tier, k, 13) * 33) * F;
      foliage(props, x0 + 0.6 * F, y + 0.15 * F, z, 0.4 * F, 0.25 * F, 0.5 * F, ['#7f8a55', '#a19a62'][k % 2], 300 + tier * 7 + k);
    }
    // Small rectangular step lights in the risers, just inland of the stones.
    const lightZ = EMAGE_STAIR_Z0 - 1.3 * F;
    props.box([x0 - 0.03 * F, y + 0.3 * F, lightZ - 0.35 * F], [x0 + 0.045 * F, y + 0.6 * F, lightZ + 0.35 * F], '#696e68', '#696e68', NO_INK);
    face(props, [x0 + 0.05 * F, y + 0.36 * F, lightZ - 0.26 * F], [x0 + 0.05 * F, y + 0.53 * F, lightZ - 0.26 * F], [x0 + 0.05 * F, y + 0.53 * F, lightZ + 0.26 * F], [x0 + 0.05 * F, y + 0.36 * F, lightZ + 0.26 * F], '#d4bc72', [1, 0, 0]);
    // Pale patched rectangles in a few of the broad faces.
    if (tier % 3 === 1) face(props, [x0 + 0.02 * F, y + 0.1 * F, -26 * F], [x0 + 0.02 * F, above - 0.08 * F, -26 * F], [x0 + 0.02 * F, above - 0.08 * F, -16 * F], [x0 + 0.02 * F, y + 0.1 * F, -16 * F], '#c4c2b8', [1, 0, 0]);
  }
}

function buildRiverside(ground: Bake, props: Bake) {
  // The concrete river trail across the foot of the stairs, jointed into
  // squares, then a strip of bare dirt at its far edge.
  flat(ground, EMAGE_RUN, EMAGE_PATH_END, ALONG0, ALONG1, LOWER, TRAIL);
  const mid = (EMAGE_RUN + EMAGE_PATH_END) / 2;
  flat(props, mid, mid + 0.03 * F, ALONG0, ALONG1, LOWER + 0.08, '#98877d');
  for (let z = ALONG0; z < ALONG1; z += 5.5 * F) flat(props, EMAGE_RUN, EMAGE_PATH_END, z, z + 0.03 * F, LOWER + 0.09, '#98877d');
  flat(ground, EMAGE_PATH_END, EMAGE_BANK_TOP, ALONG0, ALONG1, LOWER, DIRT);
  for (let i = 0; i < 90; i++) {
    const x = EMAGE_PATH_END + hash2(i, 0, 41) * (EMAGE_BANK_TOP - EMAGE_PATH_END - 0.2 * F);
    const z = ALONG0 * 0.4 + hash2(i, 0, 42) * (ALONG1 - ALONG0 * 0.4);
    flat(props, x, x + 0.15 * F, z, z + 0.12 * F, LOWER + 0.08, ['#a3927a', '#6f644f', '#8f8f6a'][i % 3]);
  }
  // The brushy bank down into the South Platte.
  const bankEnd = EMAGE_WATER_EDGE + 4 * F;
  profile(ground, EMAGE_BANK_TOP, bankEnd, ALONG0, ALONG1, emageGround,
    x => x > EMAGE_WATER_EDGE - 3 * F ? '#7c7864' : x > EMAGE_SHELF_END ? '#6f7150' : '#76774f', 14);
  // The water is drawn as props: physically the bank goes on down to the
  // river bed, so a board that gets away sinks out of sight.
  flat(props, EMAGE_WATER_EDGE - 1 * F, FAR_BANK + 2 * F, ALONG0 - 200 * F, ALONG1 + 200 * F, EMAGE_WATER_Y, WATER);
  for (let i = 0; i < 70; i++) {
    const x = EMAGE_WATER_EDGE + hash2(i, 0, 31) * EMAGE_RIVER_WIDTH;
    const z = (-260 + hash2(i, 0, 32) * 420) * F;
    flat(props, x, x + 0.05 * F, z, z + (2 + hash2(i, 0, 33) * 9) * F, EMAGE_WATER_Y + 0.07, '#7c958f');
  }
  // A boulder weir arcs across the channel, white water spilling below it.
  for (let i = 0; i < 46; i++) {
    const a = -1.1 + i * 2.2 / 45;
    const x = EMAGE_WATER_EDGE + (30 + Math.cos(a) * 18 + hash2(i, 0, 51) * 2) * F;
    const z = (-24 + Math.sin(a) * 34) * F;
    const size = (1.1 + hash2(i, 0, 52) * 0.9) * F;
    foliage(props, x, EMAGE_WATER_Y + size * 0.25, z, size, size * 0.55, size * 0.85, ['#9d998b', '#aaa697', '#8c887c'][i % 3], 500 + i);
    if (i % 2 === 0) flat(props, x + 1.5 * F, x + (3 + hash2(i, 0, 53) * 5) * F, z - 0.6 * F, z + 0.6 * F, EMAGE_WATER_Y + 0.1, '#dce4de');
  }
  // Riprap at the near water's edge.
  for (let i = 0; i < 40; i++) {
    const z = (-180 + i * 8 + hash2(i, 0, 61) * 5) * F;
    const size = (0.8 + hash2(i, 0, 62) * 0.7) * F;
    foliage(props, EMAGE_WATER_EDGE + hash2(i, 0, 63) * 2 * F, EMAGE_WATER_Y + 0.2 * F, z, size, size * 0.5, size, '#9a9785', 600 + i);
  }
  // Commons Park's bank across the river, rising to its lawns and paths.
  const farTop = FAR_BANK + 14 * F;
  profile(props, FAR_BANK - 3 * F, farTop, ALONG0 - 200 * F, ALONG1 + 200 * F,
    x => EMAGE_WATER_Y - 2 * F + (LOWER - 1 * F - EMAGE_WATER_Y + 2 * F) * Math.min(1, Math.max(0, (x - FAR_BANK + 3 * F) / (17 * F))), () => '#7a805a', 4);
  flat(props, farTop, farTop + 500 * F, ALONG0 - 200 * F, ALONG1 + 200 * F, LOWER - 1 * F, '#8a9168');
  flat(props, farTop + 30 * F, farTop + 37 * F, ALONG0 - 200 * F, ALONG1 + 200 * F, LOWER - 0.9 * F, '#b3a58f');
}

function buildHandrail(props: Bake, shadows: Segment[]) {
  const z = EMAGE_RAIL_Z, h = EMAGE_RAIL_HEIGHT;
  const axis = (x: number) => h - EMAGE_GRADE * x;
  // The actual grind line: one round, rust-brown sloping pipe with a straight cut toe.
  tube(props, [[EMAGE_RAIL_START, axis(EMAGE_RAIL_START), z], [EMAGE_RAIL_END, axis(EMAGE_RAIL_END), z]], EMAGE_RAIL_RADIUS, RUST, shadows, 10);
  for (const step of [1.2, 6.2, 11.2, 17.7]) {
    const x = step * EMAGE_TREAD, foot = emageGround(x + 0.18 * F) - EMAGE_RISER;
    tube(props, [[x + 0.18 * F, foot, z], [x, axis(x), z]], 0.07 * F, '#55443a', shadows);
    // Galvanized sleeves where the posts go into the concrete.
    tube(props, [[x + 0.17 * F, foot, z], [x + 0.16 * F, foot + 0.45 * F, z]], 0.085 * F, '#a7aba4');
  }
  // At the top it kinks into the galvanized guard along the plaza's edge,
  // with the shallow sag seen in the references, and runs past the bench.
  const top = axis(EMAGE_RAIL_START);
  tube(props, [[EMAGE_RAIL_START, top, z], [-2.4 * F, top - 0.3 * F, 6.5 * F], [-3.6 * F, top - 0.42 * F, 9 * F], [-4 * F, top - 0.1 * F, 11 * F], [-4 * F, top, 16 * F], [-4 * F, top, 22 * F]], EMAGE_RAIL_RADIUS, GALVANIZED, shadows);
  for (const [x, across] of [[-2.4, 6.5], [-4, 11], [-4, 16], [-4, 22]]) tube(props, [[x * F, 0, across * F], [x * F, top - 0.1 * F, across * F]], 0.065 * F, '#87908a', shadows);
  // The long timber bench follows the guard, off to the river side of the
  // skating lane; it never lies across a mirrored grind's roll-in.
  for (let slat = 0; slat < 4; slat++) props.box([(-5.5 - slat * 0.22) * F, 1.5 * F, 9 * F], [(-5.31 - slat * 0.22) * F, 1.67 * F, 19 * F], '#7f7661', '#9b9078', NO_INK);
  for (const across of [10.5 * F, 17 * F]) props.box([-6.2 * F, 0, across], [-5.3 * F, 1.5 * F, across + 0.22 * F], '#666f68', '#7d8275', NO_INK);
}

function buildBridge(props: Bake) {
  const x0 = BRIDGE_X0, x1 = BRIDGE_X1, y = BRIDGE_Y;
  // The deck lands on the plaza beside the bench, a low sandstone wall at its mouth.
  props.box([x0, y - 1.3 * F, BRIDGE_Z0], [x1, y, BRIDGE_Z1], '#7b8582', '#a6a79e', NO_INK);
  for (let k = 0; k < 3; k++) props.box([(-30 + k * 7) * F, 0, 21.6 * F], [(-24 + k * 7) * F, 1.4 * F, 23.4 * F], SANDSTONE[k], tone(SANDSTONE[k], 1.1), NO_INK);
  // The white steel spine hung under its near edge.
  tube(props, [[x0 + 8 * F, y - 2.4 * F, BRIDGE_Z0 + 1.6 * F], [MAST_X, y - 3.4 * F, BRIDGE_Z0 + 2.4 * F], [x1, y - 2.4 * F, BRIDGE_Z0 + 1.6 * F]], 1.15 * F, '#dfe2da');
  for (const z of [BRIDGE_Z0, BRIDGE_Z1]) {
    tube(props, [[x0, y + 3.6 * F, z], [x1, y + 3.6 * F, z]], 0.1 * F, '#74827e');
    tube(props, [[x0, y + 0.3 * F, z], [x1, y + 0.3 * F, z]], 0.07 * F, '#83908a');
    for (let x = x0; x < x1; x += 0.75 * F) tube(props, [[x, y + 0.3 * F, z], [x, y + 3.6 * F, z]], 0.022 * F, '#87928b', undefined, 4);
  }
  // Paired white masts leaning apart, the stays fanning down to both edges.
  for (const [z, lean] of [[BRIDGE_Z0, -1], [BRIDGE_Z1, 1]] as const) {
    const base: Vec3 = [MAST_X, y - 1.2 * F, z];
    const top: Vec3 = [MAST_X - 6 * F, y + 52 * F, z + lean * 7 * F];
    tube(props, [base, top], 0.55 * F, '#dcdfd4');
    for (const along of [-75, -58, -42, -26, 22, 40, 58, 78]) tube(props, [top, [MAST_X + along * F, y + 0.2 * F, z]], 0.035 * F, '#9aaba5', undefined, 5);
  }
  // Piers: one at the bank top beside the trail and one in the river.
  props.box([EMAGE_BANK_TOP + 2 * F, LOWER - 1 * F, 27.5 * F], [EMAGE_BANK_TOP + 4.5 * F, y - 1.3 * F, 32.5 * F], '#a2a397', '#babaae', NO_INK);
  props.box([MAST_X - 3 * F, EMAGE_WATER_Y - 3 * F, 26 * F], [MAST_X + 3 * F, y - 1.3 * F, 34 * F], '#a2a397', '#babaae', NO_INK);
}

function buildApartments(props: Bake, shadows: ShadowBox[]) {
  // Four-storey gray and cream apartments facing down the plaza toward the
  // river, with dark window frames, Juliet balconies, dark bays and dormers.
  const front = -80 * F, back = -120 * F, z0 = -190 * F, z1 = 18 * F;
  const roof = 40 * F;
  props.box([back, 0, z0], [front, roof, z1], '#a9a8a0', '#c8c6bb', NO_INK);
  props.box([front, roof - 1 * F, z0], [front + 0.4 * F, roof, z1], '#d6d3c6', '#d6d3c6', NO_INK);
  const bays = 15;
  for (let bay = 0; bay < bays; bay++) {
    const z = z0 + (bay + 0.15) * (z1 - z0) / bays, w = 0.7 * (z1 - z0) / bays;
    const dark = bay % 4 === 2;
    if (dark) props.box([front, 0, z - 1.5 * F], [front + 0.3 * F, roof, z + w + 1.5 * F], '#4c5150', '#4c5150', NO_INK);
    for (let floor = 0; floor < 4; floor++) {
      const y = (2.5 + floor * 9.5) * F;
      props.box([front, y, z], [front + 0.35 * F, y + 6.4 * F, z + w], '#3f4747', '#3f4747', NO_INK);
      props.box([front + 0.36 * F, y + 0.25 * F, z + 0.25 * F], [front + 0.4 * F, y + 6.1 * F, z + w - 0.25 * F], '#5f716e', '#5f716e', NO_INK);
      props.box([front + 0.4 * F, y + 0.2 * F, z + w / 2 - 0.1 * F], [front + 0.45 * F, y + 6.2 * F, z + w / 2 + 0.1 * F], '#38403f', '#38403f', NO_INK);
      if (floor > 0 && bay % 2 === 0) {
        props.box([front, y, z - 0.4 * F], [front + 1.4 * F, y + 0.18 * F, z + w + 0.4 * F], '#5b625e', '#7d847b', NO_INK);
        tube(props, [[front + 1.4 * F, y + 3 * F, z - 0.3 * F], [front + 1.4 * F, y + 3 * F, z + w + 0.3 * F]], 0.06 * F, '#2f3533');
        for (let k = 0; k <= 8; k++) tube(props, [[front + 1.4 * F, y + 0.2 * F, z + k * w / 8], [front + 1.4 * F, y + 3 * F, z + k * w / 8]], 0.025 * F, '#3a403e', undefined, 4);
      }
    }
    if (bay % 2 === 1) {
      // Dormer gable over every other bay, on the pitched slate roof.
      const a: Vec3 = [front + 0.4 * F, roof, z - 1 * F], b: Vec3 = [front + 0.4 * F, roof, z + w + 1 * F], c: Vec3 = [front + 0.4 * F, roof + 5 * F, z + w / 2];
      props.triangle(a, b, c, [1, 0, 0], { color: '#d2d0c4' }, NO_INK);
    }
  }
  face(props, [front, roof, z0], [front, roof, z1], [back + 12 * F, roof + 12 * F, z1], [back + 12 * F, roof + 12 * F, z0], '#5d6463', [0.7, 0.7, 0]);
  for (let k = 0; k < 7; k++) {
    const z = z0 + (k + 0.5) * (z1 - z0) / 7;
    props.box([back + 16 * F, roof, z], [back + 20 * F, roof + 17 * F, z + 4 * F], '#b5b2a6', '#c9c6ba', NO_INK);
  }
  shadows.push({ min: [back, 0, z0], max: [front, roof, z1] });
}

function buildSkyline(props: Bake) {
  // Downtown and the riverfront towers across the river: contextual
  // massing for the photographs' backdrop, not a surveyed skyline.
  const from = FAR_BANK + 160 * F;
  for (const [x, z, w, d, h, color] of [
    [0, -160, 50, 40, 70, '#9a8b7e'], [30, -80, 40, 36, 160, '#7f949a'], [70, 10, 46, 40, 85, '#9a6a5c'],
    [10, 90, 56, 30, 45, '#c7c1ad'], [120, -30, 30, 30, 210, '#8aa0a8'], [90, 150, 40, 40, 120, '#a4aaa2'],
    [-60, 210, 40, 30, 60, '#b9b39c'], [160, 60, 34, 34, 140, '#7d8a8e'],
  ] as const) {
    const x0 = from + x * F, y0 = LOWER - 1 * F;
    props.box([x0, y0, z * F], [x0 + d * F, h * F, (z + w) * F], color, tone(color, 1.08), NO_INK);
    for (let y = 8; y < h - 4; y += 9) props.box([x0 - 0.1 * F, y * F, (z + 2) * F], [x0, (y + 4) * F, (z + w - 2) * F], tone(color, 0.75), tone(color, 0.75), NO_INK);
  }
}

function buildPlanting(props: Bake) {
  // Shrubs on the bank beside the rail, clear of the skate lane and the
  // pop-off: low groundcover in front of the side tripod (it films the rail
  // across them), full shrubs behind it, thickening toward the bridge.
  for (let i = 0; i < 26; i++) {
    const x = (-3 + hash2(i, 0, 71) * 26) * F, z = (6.5 + hash2(i, 0, 72) * 24) * F;
    const low = z < EMAGE_SIDE_TRIPOD_Z + 1.5 * F;
    const base = emageBank(x), size = (low ? 0.7 + hash2(i, 0, 73) * 0.5 : 1.4 + hash2(i, 0, 73) * 1.4) * F;
    const tall = low ? 0.5 : 0.85;
    foliage(props, x, base + size * tall * 0.6, z, size * 1.3, size * tall, size * 1.2, ['#657454', '#738062', '#56694f', '#808a63'][i % 4], 71 + i);
  }
  // The river bank's brush, beginning right past the dirt. Straight ahead of
  // the stairs, where a landed rider hops off and runs into it, it's knee-high
  // scrub they're seen wading into; either side, gray-green shrubs with a
  // yellowing one.
  for (let i = 0; i < 70; i++) {
    const z = (-200 + i * 5 + hash2(i, 0, 81) * 4) * F;
    const x = EMAGE_BANK_TOP + (0.8 + hash2(i, 0, 82) * 12) * F;
    const ahead = Math.abs(z) < 10 * F;
    const size = (ahead ? 0.7 + hash2(i, 0, 83) * 0.4 : 1.1 + hash2(i, 0, 83) * 1.3) * F;
    const tall = ahead ? 0.5 : 0.8;
    const color = i === 37 ? '#b39a3e' : ['#6f7a5c', '#7d8569', '#5f6c50', '#8a8d6f'][i % 4];
    foliage(props, x, emageGround(x) + size * tall * 0.55, z, size * 1.3, size * tall, size * 1.2, color, 900 + i);
  }
  // More knee-high scrub filling the shelf ahead, short of the bank's fall.
  for (let i = 0; i < 18; i++) {
    const z = (-9 + hash2(i, 0, 85) * 18) * F;
    const x = EMAGE_BANK_TOP + (1 + hash2(i, 0, 86) * (EMAGE_SHELF / F - 2)) * F;
    const size = (0.6 + hash2(i, 0, 87) * 0.4) * F;
    foliage(props, x, emageGround(x) + size * 0.25, z, size * 1.4, size * 0.45, size * 1.3, ['#7d8569', '#8a8d6f', '#6f7a5c'][i % 3], 960 + i);
  }
  // A small green post at the shoulder, seen ahead of the stairs.
  const post = EMAGE_PATH_END + 1.2 * F;
  props.box([post, LOWER, 7 * F], [post + 0.15 * F, LOWER + 4.5 * F, 7.15 * F], '#3f6a50', '#4f7a5c', NO_INK);
}

/** Tall riverside trees, loaded as realistic props (props/streetProps.ts). */
export function emageTrees() {
  const trees: { at: Vec3; height: number; yaw: number }[] = [];
  // Big trees on the near bank, left of the gap ahead, and along the trail.
  for (const [x, z, h] of [[6, -40, 42], [9, -62, 36], [5, -26, 30], [8, 46, 34], [12, 70, 40], [7, -95, 45], [10, -130, 38]] as const) {
    trees.push({ at: [EMAGE_BANK_TOP + x * F, emageGround(EMAGE_BANK_TOP + x * F), z * F], height: h * F, yaw: x * 37 + z });
  }
  for (let i = 0; i < 9; i++) {
    const z = (-200 + i * 45 + hash2(i, 0, 91) * 20) * F;
    trees.push({ at: [FAR_BANK + (22 + hash2(i, 0, 92) * 30) * F, LOWER - 1 * F, z], height: (38 + hash2(i, 0, 93) * 18) * F, yaw: i * 71 });
  }
  // Two at the plaza's far end, in front of the apartments.
  trees.push({ at: [-60 * F, 0, -150 * F], height: 30 * F, yaw: 20 }, { at: [-55 * F, 0, -100 * F], height: 26 * F, yaw: 160 });
  return trees;
}
