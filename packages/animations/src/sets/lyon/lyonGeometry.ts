import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { hash2 } from '../setKit';
import {
  LYON_BUILDING_FACE, LYON_BUILDING_TOP, LYON_DROP, LYON_FOOT as F,
  LYON_GRADE, LYON_LEFT_Z, LYON_PROMENADE_Y, LYON_PROMENADE_Z,
  LYON_REAR_X, LYON_RIGHT_Z, LYON_RISER, LYON_RUN, LYON_STEPS,
  LYON_TREAD, LYON_WALL_TOP, lyonGround,
} from './lyonLayout';

const up: Vec3 = [0, 1, 0];
const front: Vec3 = [0, 0, -1];
const lower = -LYON_DROP;
const FAR = 24000;
const ink = (id: number): Ink => ({ id, priority: 5, width: 0.15, kind: INK_PROP, solid: 6 });
const STEP = ink(40);
const WALL = ink(72);
const lit = (color: string, n: Vec3): Paint => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });
type Segment = { a: Vec3; b: Vec3; radius: number };
type ShadowBox = { min: Vec3; max: Vec3 };

function flat(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = NO_INK) {
  b.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], up, lit(color, up), detail);
}

function wall(b: Bake, x0: number, x1: number, y0: number, y1: number, z: number, color: string) {
  b.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], front, lit(color, front), NO_INK);
}

function tube(b: Bake, spine: Vec3[], radius = 1.5, color = '#596864', cast?: Segment[]) {
  b.tube(spine, spine.map(() => radius), { color, lit: { color: '#a5b4a8', from: 0.15, to: 2 } }, NO_INK, 7, true);
  if (cast) for (let i = 1; i < spine.length; i++) cast.push({ a: spine[i - 1], b: spine[i], radius });
}

/** The fixed, unmirrored 25 and its sunken convention-centre courtyard.
 * Two merged meshes; no photographic textures or hundreds of separate meshes. */
export function buildLyonGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: Segment[] = [];
  const shadowBoxes: ShadowBox[] = [];
  // Every footprint has exactly one floor, including all twenty-four treads.
  flat(ground, -FAR, 0, LYON_LEFT_Z, LYON_RIGHT_Z, 0, '#b4b09f');
  flat(ground, LYON_RUN, FAR, LYON_LEFT_Z, LYON_RIGHT_Z, lower, '#b0ad9f');
  flat(ground, -FAR, FAR, -FAR, LYON_PROMENADE_Z, LYON_PROMENADE_Y, '#a8aaa0');

  for (let step = 0; step < LYON_STEPS; step++) {
    const x = step * LYON_TREAD;
    const y0 = -step * LYON_RISER;
    const y1 = -(step + 1) * LYON_RISER;
    const n: Vec3 = [1, 0, 0];
    ground.quad([x, y0, LYON_LEFT_Z], [x, y1, LYON_LEFT_Z], [x, y1, LYON_RIGHT_Z], [x, y0, LYON_RIGHT_Z], n, lit('#a8a89a', n), STEP);
    if (step < LYON_STEPS - 1) flat(ground, x, x + LYON_TREAD, LYON_LEFT_Z, LYON_RIGHT_Z, y1, '#c3c0ad', STEP);
    // Pale polished noses, recessed dark bottom corners, and staggered joints
    // between long stone stair pieces are visible in all three photo angles.
    for (const [low, high, color] of [[y0 - 1.1, y0, '#ded9c5'], [y0 - 2, y0 - 1.1, '#b7b8a8'], [y1, y1 + 0.7, '#858c81']] as const) {
      ground.quad([x + 0.04, low, LYON_LEFT_Z], [x + 0.04, low, LYON_RIGHT_Z], [x + 0.04, high, LYON_RIGHT_Z], [x + 0.04, high, LYON_LEFT_Z], n, lit(color, n), NO_INK);
    }
    for (let joint = 0; joint < 10; joint++) {
      const z = LYON_LEFT_Z + ((joint + (step % 2) * 0.45) / 10) * (LYON_RIGHT_Z - LYON_LEFT_Z);
      if (z <= LYON_LEFT_Z + 1) continue;
      props.quad([x + 0.09, y1, z], [x + 0.09, y1, z + 0.6], [x + 0.09, y0, z + 0.6], [x + 0.09, y0, z], n, lit('#7e877c', n), NO_INK);
      if (step < LYON_STEPS - 1) flat(props, x + 0.1, x + LYON_TREAD - 0.1, z, z + 0.6, y1 + 0.07, '#919487');
    }
    // Irregular dark runoff is strongest against the retaining wall, without
    // ever covering a complete tread or turning the flight into a ramp.
    for (let mark = 0; mark < 5; mark++) {
      const z = LYON_LEFT_Z + (0.4 + hash2(step, mark, 31) * 8) * F;
      const width = (0.2 + hash2(step, mark, 67) * 0.7) * F;
      const h = 2 + hash2(step, mark, 42) * LYON_RISER * 0.7;
      props.quad([x + 0.12, y1, z], [x + 0.12, y1, z + width], [x + 0.12, y1 + h, z + width * 0.8], [x + 0.12, y1 + h * 0.7, z + width * 0.1], n, lit('#818879', n), NO_INK);
    }
  }
  paving(props, -76 * F, -0.12, 0);
  paving(props, LYON_RUN + 0.12, LYON_RUN + 74 * F, lower);
  // Narrow linear drains at the walls and at the landing, before the pavers.
  for (const z of [LYON_LEFT_Z + 0.2 * F, LYON_RIGHT_Z - 0.55 * F]) {
    flat(props, -78 * F, -1, z, z + 0.32 * F, 0.12, '#626c65');
    flat(props, LYON_RUN + 1, LYON_RUN + 76 * F, z, z + 0.32 * F, lower + 0.12, '#626c65');
  }
  buildRetainingWall(ground, props);
  buildConventionCentre(props, shadowBoxes);
  buildCourtyard(props);

  // The only rail beside the actual flight is bracketed to the orange wall.
  // No center rail, no freestanding pair, and no invented grind obstacle.
  const railZ = LYON_RIGHT_Z - 0.7 * F;
  const a: Vec3 = [-0.5 * F, 3 * F + 0.5 * F * LYON_GRADE, railZ];
  const b: Vec3 = [LYON_RUN - 0.25 * F, 3 * F - (LYON_RUN - 0.25 * F) * LYON_GRADE, railZ];
  tube(props, [a, b], 1.25, '#67766f', railSegments);
  for (let i = 0; i < 5; i++) {
    const x = i * LYON_RUN / 4;
    const h = 3 * F - x * LYON_GRADE;
    tube(props, [[x, h - 5, LYON_RIGHT_Z - 0.3], [x, h - 5, railZ], [x, h, railZ]], 0.8, '#6b7770', railSegments);
  }
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

/** Small squared pavers: recessed hairline joints and seeded tone changes.
 * Larger color patches sit on the same field, matching the worn courtyard. */
function paving(props: Bake, x0: number, x1: number, y: number) {
  const unit = 0.7 * F;
  const z0 = LYON_LEFT_Z + 0.6 * F;
  const z1 = LYON_RIGHT_Z - 0.7 * F;
  const tones = ['#b4b1a1', '#b9b6a5', '#bbb7a6', '#c2beac', '#a6ab9c'];
  for (let x = x0, row = 0; x < x1; x += unit, row++) {
    for (let z = z0, col = 0; z < z1; z += unit, col++) {
      const color = tones[Math.floor(hash2(row, col, y) * tones.length)];
      flat(props, x + 0.28, Math.min(x + unit - 0.28, x1), z + 0.28, Math.min(z + unit - 0.28, z1), y + 0.07, color);
    }
  }
}

/** A tall straight side wall holds a sloping, panelled bank up to the park
 * promenade. It stays high beside the landing: it is not a stair cheek. */
function buildRetainingWall(ground: Bake, props: Bake) {
  const z0 = LYON_LEFT_Z;
  const z1 = LYON_PROMENADE_Z;
  const top = LYON_WALL_TOP;
  ground.quad([-FAR, lower, z0], [FAR, lower, z0], [FAR, top, z0], [-FAR, top, z0], [0, 0, 1], lit('#bab39e', [0, 0, 1]), WALL);
  const rise = LYON_PROMENADE_Y - top;
  const span = z0 - z1;
  const normal: Vec3 = [0, span / Math.hypot(span, rise), rise / Math.hypot(span, rise)];
  ground.quad([-FAR, top, z0], [FAR, top, z0], [FAR, LYON_PROMENADE_Y, z1], [-FAR, LYON_PROMENADE_Y, z1], normal, lit('#c0bda8', normal), WALL);
  // Six-foot panel divisions, backed by the darker metal expansion channels.
  for (let x = -100 * F; x <= 116 * F; x += 6 * F) {
    props.quad([x, lower, z0 + 0.06], [x + 0.7, lower, z0 + 0.06], [x + 0.7, top, z0 + 0.06], [x, top, z0 + 0.06], [0, 0, 1], lit('#727b72', [0, 0, 1]), NO_INK);
    tube(props, [[x, top + 0.07, z0], [x, LYON_PROMENADE_Y + 0.07, z1]], 0.65, '#68766e');
  }
  for (let y = lower + 3.3 * F; y < top; y += 3.3 * F) {
    props.quad([-100 * F, y, z0 + 0.09], [116 * F, y, z0 + 0.09], [116 * F, y + 0.4, z0 + 0.09], [-100 * F, y + 0.4, z0 + 0.09], [0, 0, 1], lit('#898e80', [0, 0, 1]), NO_INK);
  }
  for (let panel = 1; panel < 6; panel++) {
    const f = panel / 6;
    tube(props, [[-100 * F, top + f * rise + 0.15, z0 - f * span], [116 * F, top + f * rise + 0.15, z0 - f * span]], 0.4, '#949787');
  }
  props.box([-100 * F, top, z0 - 0.6 * F], [116 * F, top + 0.18 * F, z0], '#747f73', '#939b8b', NO_INK);
  railing(props, -100 * F, 116 * F, z1, LYON_PROMENADE_Y);
  // The rail around the upper-run-up's corner stops at the lip; the lower
  // bank's metal edge is a cap, never an extra waist-high stair handrail.
  railing(props, LYON_REAR_X, -2.5 * F, z0 - 0.6 * F, top);
}

function railing(b: Bake, x0: number, x1: number, z: number, y: number) {
  for (const h of [0.55, 1.4, 2.25, 3.35]) tube(b, [[x0, y + h * F, z], [x1, y + h * F, z]], h === 3.35 ? 1.25 : 0.65);
  for (let x = x0; x <= x1; x += 5 * F) tube(b, [[x, y, z], [x, y + 3.4 * F, z]], 1.4);
}

function buildConventionCentre(props: Bake, shadows: ShadowBox[]) {
  const z = LYON_BUILDING_FACE;
  const x0 = -112 * F, x1 = 126 * F;
  const min: Vec3 = [x0, lower - F, z];
  const max: Vec3 = [x1, LYON_BUILDING_TOP, z + 25 * F];
  props.box(min, max, '#965e43', '#b2ab91', WALL);
  shadows.push({ min, max });
  const tiles = ['#b96f4a', '#c67e53', '#bc7650', '#bb714b', '#c48259'];
  // Renzo Piano's terracotta rainscreen uses long HORIZONTAL slabs, not
  // conventional brick bonds. Thin grey uprights and deeper horizontal
  // channels break it into repeated bays, as the close photographs show.
  for (let row = 0; lower + row * 1.12 * F < LYON_BUILDING_TOP; row++) {
    const y = lower + row * 1.12 * F;
    for (let col = 0; x0 + col * 4.5 * F < x1; col++) {
      const x = x0 + col * 4.5 * F;
      wall(props, x + 0.6, Math.min(x + 4.5 * F - 0.6, x1), y + 0.7, Math.min(y + 1.12 * F - 0.7, LYON_BUILDING_TOP), z - 0.08, tiles[Math.floor(hash2(row, col, 62) * tiles.length)]);
    }
  }
  for (let x = x0; x < x1; x += 18 * F) {
    props.box([x - 0.055 * F, lower, z - 0.14 * F], [x + 0.055 * F, LYON_BUILDING_TOP, z + 0.1], '#697973', '#859086', NO_INK);
  }
  // Ground-floor glass entries lie along the upper courtyard and beyond
  // the foot; the face right beside the staircase itself is solid orange.
  for (const x of [-72, -54, -36, -18, 38, 56, 74, 92]) {
    const a = x * F, b = (x + 12) * F;
    const base = x < 0 ? 0 : lower;
    glazing(props, a, b, base + 0.2 * F, base + 15.5 * F, z - 0.19 * F);
    // Terracotta piers project proud of the window grid.
    props.box([a - 1.1 * F, base, z - 0.8 * F], [a, base + 16.2 * F, z + 0.1], '#ab694b', '#ca8760', NO_INK);
  }
  // Continuous upper gallery and its gray four-bar guardrail.
  const galleryY = 16.5 * F;
  props.box([x0, galleryY - 0.6 * F, z - 4.4 * F], [x1, galleryY, z], '#929784', '#adb09c', WALL);
  railing(props, x0, x1, z - 4.1 * F, galleryY);
  for (let x = x0 + 4 * F; x < x1; x += 18 * F) glazing(props, x, x + 13 * F, galleryY + 0.2 * F, 26 * F, z - 0.22 * F);
  // Projecting upper rooms create the recognizable white soffit, orange
  // block above and dark steel fascia in the bottom-up video shots.
  const soffit = 27 * F;
  const projectedZ = z - 7.5 * F;
  props.box([x0, soffit, projectedZ], [x1, LYON_BUILDING_TOP, z + 25 * F], '#b7734e', '#b2b29f', WALL);
  props.box([x0, soffit - 0.22 * F, projectedZ], [x1, soffit, z + 0.1], '#d0cebc', '#d0cebc', NO_INK);
  props.box([x0, soffit, projectedZ - 0.08 * F], [x1, soffit + 0.35 * F, projectedZ], '#51625e', '#6f7e71', NO_INK);
  for (let row = 0; soffit + row * 1.12 * F < LYON_BUILDING_TOP; row++) {
    const y = soffit + row * 1.12 * F;
    for (let x = x0; x < x1; x += 4.5 * F) wall(props, x + 0.6, Math.min(x + 4.5 * F - 0.6, x1), y + 0.7, Math.min(y + 1.12 * F - 0.7, LYON_BUILDING_TOP), projectedZ - 0.1, tiles[row % tiles.length]);
  }
  shadows.push({ min: [x0, soffit, projectedZ], max: [x1, LYON_BUILDING_TOP, z] });
  // Small service plates and hose connections beside the wall handrail.
  for (const x of [-3 * F, LYON_RUN + 2.4 * F]) {
    const y = lyonGround(x) + 3.1 * F;
    wall(props, x - 1.6 * F, x + 1.6 * F, y, y + 0.8 * F, z - 0.3 * F, '#aeb4a8');
    for (const offset of [-0.8, 0.8]) tube(props, [[x + offset * F, y + 0.4 * F, z - 0.5 * F], [x + offset * F, y + 0.4 * F, z - 0.9 * F]], 2.6, '#8c5345');
  }
}

function glazing(props: Bake, x0: number, x1: number, y0: number, y1: number, z: number) {
  wall(props, x0, x1, y0, y1, z, '#3e504c');
  const split = y0 + (y1 - y0) * 0.43;
  wall(props, x0 + 1, x1 - 1, split, y1 - 1, z - 0.08, '#687772');
  // Muted reflections of the pale facing bank, not transparent openings
  // onto an empty shell or fake indoor scenery.
  wall(props, x0 + 1, x1 - 1, split + F, split + 2.7 * F, z - 0.09, '#989b86');
  for (let x = x0; x <= x1 + 0.1; x += (x1 - x0) / 4) props.box([x - 0.06 * F, y0, z - 0.13 * F], [x + 0.06 * F, y1, z], '#7c8b82', '#9aa497', NO_INK);
  for (const y of [y0, split, y1]) props.box([x0, y - 0.065 * F, z - 0.13 * F], [x1, y + 0.065 * F, z], '#7c8b82', '#9aa497', NO_INK);
}

function buildCourtyard(props: Bake) {
  // Far end of the upper run-up: orange crosswall, recessed doorway and
  // small steel spiral escape stair. These fix the scale in the old footage.
  props.box([LYON_REAR_X - 2 * F, -F, LYON_LEFT_Z], [LYON_REAR_X, LYON_PROMENADE_Y, LYON_RIGHT_Z], '#b47b5a', '#c5a583', WALL);
  const nx: Vec3 = [1, 0, 0];
  props.quad([LYON_REAR_X + 0.1, 0, 4 * F], [LYON_REAR_X + 0.1, 0, 11 * F], [LYON_REAR_X + 0.1, 9 * F, 11 * F], [LYON_REAR_X + 0.1, 9 * F, 4 * F], nx, lit('#38443e', nx), NO_INK);
  const cx = LYON_REAR_X + 4 * F, cz = LYON_RIGHT_Z - 5 * F;
  tube(props, [[cx, 0, cz], [cx, 15 * F, cz]], 2.1);
  const outer: Vec3[] = [];
  for (let i = 0; i < 26; i++) {
    const a = i * Math.PI / 10;
    const y = i / 25 * LYON_PROMENADE_Y;
    const p: Vec3 = [cx + 3 * F * Math.cos(a), y, cz + 3 * F * Math.sin(a)];
    props.triangle([cx, y, cz], p, [cx + 3 * F * Math.cos(a + 0.29), y, cz + 3 * F * Math.sin(a + 0.29)], up, lit('#818b80', up), NO_INK);
    tube(props, [p, [p[0], y + 3 * F, p[2]]], 0.65);
    outer.push([p[0], y + 3 * F, p[2]]);
  }
  tube(props, outer, 1);
  // Benches along the bank, behind the takeoff rather than in the runout.
  for (const x of [-58 * F, -38 * F]) {
    const z = LYON_LEFT_Z + 3.2 * F;
    props.box([x, 1.35 * F, z - 0.6 * F], [x + 6 * F, 1.55 * F, z + 0.8 * F], '#756f58', '#a49a76', NO_INK);
    for (const px of [x + 0.8 * F, x + 5.2 * F]) tube(props, [[px, 0, z], [px, 3 * F, z]], 1.3);
    props.box([x, 2.2 * F, z - 0.75 * F], [x + 6 * F, 2.8 * F, z - 0.58 * F], '#77775f', '#a49a76', NO_INK);
  }
  // Real park trees above the sloped bank, with a small planted bed in the
  // rear courtyard. Leaf clusters are volumes, never camera-facing cards.
  for (let i = 0; i < 8; i++) tree(props, (-102 + i * 29) * F, LYON_PROMENADE_Y, LYON_PROMENADE_Z - (9 + (i % 3) * 5) * F, i + 4, 1);
  props.box([-74 * F, 0, -4 * F], [-63 * F, 0.25 * F, 5 * F], '#66774f', '#64784b', NO_INK);
  tree(props, -68 * F, 0, 0, 8, 0.63);
}

function tree(props: Bake, x: number, y: number, z: number, seed: number, scale: number) {
  const height = (20 + hash2(seed, 2) * 7) * F * scale;
  const trunk = 0.36 * F * scale;
  const crown = height * 0.63;
  tube(props, [[x, y, z], [x + trunk, y + crown, z - trunk]], trunk, '#797460');
  for (let branch = 0; branch < 6; branch++) {
    const angle = branch * 2.399;
    const reach = (4.8 + hash2(seed, branch) * 3) * F * scale;
    const cx = x + Math.cos(angle) * reach;
    const cz = z + Math.sin(angle) * reach;
    const cy = y + crown + (branch % 3) * 2.7 * F * scale;
    tube(props, [[x, y + crown * 0.6, z], [cx, cy, cz]], trunk * 0.36, '#777760');
    const radius = 4.8 * F * scale;
    for (let lat = 0; lat < 4; lat++) {
      const a0 = -Math.PI / 2 + lat * Math.PI / 4;
      const a1 = a0 + Math.PI / 4;
      const point = (a: number, b: number): Vec3 => [cx + Math.cos(a) * Math.cos(b) * radius, cy + Math.sin(a) * radius * 0.85, cz + Math.cos(a) * Math.sin(b) * radius];
      for (let lon = 0; lon < 7; lon++) {
        const b0 = lon * 2 * Math.PI / 7, b1 = (lon + 1) * 2 * Math.PI / 7;
        const n: Vec3 = [Math.cos((a0 + a1) / 2) * Math.cos((b0 + b1) / 2), Math.sin((a0 + a1) / 2), Math.cos((a0 + a1) / 2) * Math.sin((b0 + b1) / 2)];
        const colors = ['#667b4d', '#78895a', '#687e51', '#859364'];
        props.quad(point(a0, b0), point(a0, b1), point(a1, b1), point(a1, b0), n, lit(colors[(lat + lon + branch) % colors.length], n), NO_INK);
      }
    }
  }
}
