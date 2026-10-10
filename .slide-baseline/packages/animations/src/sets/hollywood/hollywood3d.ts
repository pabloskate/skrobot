import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { ClassicSpot3D } from '../classicSpot3d';
import {
  HOLLYWOOD_BUILDING_END, HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_BUILDING_TOP,
  HOLLYWOOD_CHEEK_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z,
  HOLLYWOOD_FENCE_END, HOLLYWOOD_FENCE_START, HOLLYWOOD_FENCE_TIPS,
  HOLLYWOOD_FENCE_TOP, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FOOT as F, HOLLYWOOD_GRADE,
  HOLLYWOOD_LANE_WIDTH, HOLLYWOOD_LANE_Z, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RAIL_END,
  HOLLYWOOD_RAIL_HEIGHT, HOLLYWOOD_RAIL_LINES, HOLLYWOOD_RAIL_RADIUS,
  HOLLYWOOD_RAIL_START, HOLLYWOOD_RIGHT_Z, HOLLYWOOD_RISER, HOLLYWOOD_ROAD_Y,
  HOLLYWOOD_RUN, HOLLYWOOD_SIDE_RAIL_Z, HOLLYWOOD_STEPS, HOLLYWOOD_TREAD,
  hollywoodCheekTop, hollywoodGround, hollywoodNosing,
} from './hollywoodLayout';

const ink = (id: number, priority = 5, solid = 0): Ink => ({ id, priority, width: 0.18, kind: INK_PROP, solid });
const STEP_INK = ink(40, 4, 6);
const WALL_INK = ink(74, 7, 10);
const LEAF_INK = ink(100, 8, 13);
const lit = (color: string, n: Vec3): Paint => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });
const up: Vec3 = [0, 1, 0];
const front: Vec3 = [0, 0, -1];
const lower = -HOLLYWOOD_DROP;
const FAR = 24000;
const random = (seed: number) => { const a = Math.sin(seed * 93.17 + 72.81) * 43758.5453; return a - Math.floor(a); };
/** The run-up's poured slabs near the lip: five feet long, four across. */
const SLAB = 5 * F;
const RUN_UP_SLABS = 8;
const SLAB_TINTS = ['#bdbdb1', '#c1c0b3', '#b9baae', '#bebcae', '#b7b8ad', '#c3c2b6'];

export interface HollywoodRailSegment { a: Vec3; b: Vec3; radius: number }
export interface HollywoodShadowBox { min: Vec3; max: Vec3 }

/** All details are real, static geometry. Two merged draws, no web textures,
 * camera-facing foliage or per-brick meshes. The layout is never mirrored. */
export function buildHollywoodGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const railSegments: HollywoodRailSegment[] = [];
  const shadowBoxes: HollywoodShadowBox[] = [];
  const plane = (x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = NO_INK) =>
    ground.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], up, lit(color, up), detail);
  const tube = (spine: Vec3[], radius: number, color: string, detail = ink(71, 6), sides = 8, cast = false) => {
    props.tube(spine, spine.map(() => radius), { color, lit: { color: '#bfc0b0', from: 0.2, to: 2 } }, detail, sides, true);
    if (cast) for (let i = 1; i < spine.length; i++) railSegments.push({ a: spine[i - 1], b: spine[i], radius });
  };

  // The long elevated run-up between the school's twelve and sixteen. The
  // street side is lower, so no fictitious bank fills this edge. Near the
  // lip it is poured slabs, each a slightly different pour of concrete.
  plane(-FAR, -RUN_UP_SLABS * SLAB, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, 0, '#bdbdb1');
  const across = (HOLLYWOOD_RIGHT_Z - HOLLYWOOD_LEFT_Z) / 4;
  for (let i = 0; i < RUN_UP_SLABS; i++) for (let j = 0; j < 4; j++) {
    const x0 = -(i + 1) * SLAB, z0 = HOLLYWOOD_LEFT_Z + j * across;
    plane(x0, x0 + SLAB, z0, z0 + across, 0, SLAB_TINTS[Math.floor(random(i * 17 + j * 5) * SLAB_TINTS.length)]);
  }
  // Landing, sidewalk, road and the far side own disjoint footprints.
  // Stacking broad planes a fraction apart makes their colors fight for
  // depth from distant cameras, even when their nominal heights differ.
  // The wide sidewalk runs past the fence and on beside the bottom landing.
  plane(HOLLYWOOD_RUN, FAR, HOLLYWOOD_CURB_Z, FAR, lower, '#bebdaf');
  plane(-FAR, HOLLYWOOD_RUN, HOLLYWOOD_CURB_Z, HOLLYWOOD_CHEEK_Z, lower, '#b3b5a9');
  plane(-FAR, FAR, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_ROAD_Y, '#5d6261');
  plane(-FAR, FAR, -FAR, HOLLYWOOD_FAR_CURB_Z, lower, '#adafa3');

  // Sixteen risers, with fifteen independent treads. Pale rounded wear bands
  // and blackened corners remain visible when seen from the landing.
  for (let k = 1; k <= HOLLYWOOD_STEPS; k++) {
    const x = (k - 1) * HOLLYWOOD_TREAD;
    const high = -(k - 1) * HOLLYWOOD_RISER;
    const low = -k * HOLLYWOOD_RISER;
    ground.quad([x, high, HOLLYWOOD_LEFT_Z], [x, low, HOLLYWOOD_LEFT_Z], [x, low, HOLLYWOOD_RIGHT_Z], [x, high, HOLLYWOOD_RIGHT_Z], [1, 0, 0], lit('#969e92', [1, 0, 0]), STEP_INK);
    // The worn nosing wraps onto the vertical face. A low landing camera
    // cannot see the tread tops, so their wear alone would flatten all
    // sixteen identically colored risers into an apparent concrete slope.
    for (const [y0, y1, color] of [
      [high - 1.1, high, '#c4c6b6'],
      [high - 1.65, high - 1.1, '#abb3a3'],
      [low, low + 0.65, '#828e80'],
    ] as const) {
      ground.quad([x + 0.025, y0, HOLLYWOOD_LEFT_Z], [x + 0.025, y0, HOLLYWOOD_RIGHT_Z], [x + 0.025, y1, HOLLYWOOD_RIGHT_Z], [x + 0.025, y1, HOLLYWOOD_LEFT_Z], [1, 0, 0], lit(color, [1, 0, 0]), NO_INK);
    }
    if (k < HOLLYWOOD_STEPS) {
      plane(x, x + HOLLYWOOD_TREAD, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low, '#bdbfb3', STEP_INK);
      plane(x + HOLLYWOOD_TREAD - 1.8, x + HOLLYWOOD_TREAD, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low + 0.06, '#d1d0c0', NO_INK);
      plane(x + 0.06, x + 2, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low + 0.08, '#8e968b', NO_INK);
    }
    // Different narrow weather runs per step, avoiding a tiled dirt texture.
    for (let j = 0; j < 6; j++) {
      const z = HOLLYWOOD_LEFT_Z + 15 + random(k * 51 + j) * (HOLLYWOOD_RIGHT_Z - HOLLYWOOD_LEFT_Z - 35);
      const w = 0.7 + random(k * 29 + j) * 2.5;
      const h = 0.8 + random(k * 71 + j) * 2.4;
      props.quad([x + 0.08, low, z], [x + 0.08, low, z + w], [x + 0.08, low + h, z + w * 0.8], [x + 0.08, low + h * 0.7, z + 0.3], [1, 0, 0], lit('#818c80', [1, 0, 0]), NO_INK);
    }
  }
  // Tooled joints between the run-up's slabs, and the landing's.
  for (let i = 1; i <= RUN_UP_SLABS; i++) plane(-i * SLAB - 0.3, -i * SLAB + 0.3, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, 0.09, '#898f86');
  for (let j = 1; j < 4; j++) {
    const z = HOLLYWOOD_LEFT_Z + j * across;
    plane(-RUN_UP_SLABS * SLAB, -1, z - 0.3, z + 0.3, 0.09, '#8e9489');
  }
  for (const x of [HOLLYWOOD_RUN + 6 * F, HOLLYWOOD_RUN + 16 * F, HOLLYWOOD_RUN + 30 * F]) {
    plane(x, x + 0.6, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z + 12 * F, lower + 0.09, '#898f86');
  }
  for (const z of [-2 * F, 5.4 * F]) plane(HOLLYWOOD_RUN + 1, HOLLYWOOD_RUN + 32 * F, z, z + 0.6, lower + 0.09, '#8e9489');

  // Solid outside cheek: a narrow concrete slope, not a second staircase.
  const cheekOuter = HOLLYWOOD_CHEEK_Z;
  const cheekTop = hollywoodCheekTop;
  for (const [x0, x1] of [[-35 * F, 0], [0, HOLLYWOOD_RUN], [HOLLYWOOD_RUN, HOLLYWOOD_RUN + 0.4 * F]]) {
    const h0 = cheekTop(x0), h1 = cheekTop(x1);
    const n: Vec3 = [-(h1 - h0) / Math.hypot(x1 - x0, h1 - h0), (x1 - x0) / Math.hypot(x1 - x0, h1 - h0), 0];
    ground.quad([x0, h0, cheekOuter], [x1, h1, cheekOuter], [x1, h1, HOLLYWOOD_LEFT_Z], [x0, h0, HOLLYWOOD_LEFT_Z], n, lit('#b6b7a9', n), WALL_INK);
    ground.quad([x0, lower, cheekOuter], [x1, lower, cheekOuter], [x1, h1, cheekOuter], [x0, h0, cheekOuter], front, lit('#a2a699', front), WALL_INK);
    ground.quad([x0, lower, HOLLYWOOD_LEFT_Z], [x0, h0, HOLLYWOOD_LEFT_Z], [x1, h1, HOLLYWOOD_LEFT_Z], [x1, lower, HOLLYWOOD_LEFT_Z], [0, 0, 1], lit('#b9b9ac', [0, 0, 1]), WALL_INK);
  }

  // Three real handrails. The round center rail has three supports and no
  // horizontal ends or lower longitudinal rail, unlike El Toro's handrails.
  HOLLYWOOD_RAIL_LINES.forEach(({ z, wallMounted }, index) => {
    const detail = ink(60 + index, 10 + index);
    const at = (x: number): Vec3 => [x, hollywoodNosing(x) + HOLLYWOOD_RAIL_HEIGHT, z];
    tube([at(HOLLYWOOD_RAIL_START), at(HOLLYWOOD_RAIL_END)], HOLLYWOOD_RAIL_RADIUS, index === 0 ? '#555b56' : '#959d91', detail, 12, true);
    const posts = [HOLLYWOOD_RAIL_START, 7 * HOLLYWOOD_TREAD, HOLLYWOOD_RAIL_END];
    for (const x of posts) {
      const h = hollywoodNosing(x) + HOLLYWOOD_RAIL_HEIGHT;
      if (wallMounted) {
        // Short returned brackets embed in the school wall rather than
        // inventing a second free-standing rail in the narrow school lane.
        tube([[x, h - 4, HOLLYWOOD_BUILDING_FACE - 0.1], [x, h - 4, z], [x, h, z]], 1.5, '#9aa194', detail, 8, true);
      } else {
        const base = index === 0 ? hollywoodGround(x) : cheekTop(x);
        tube([[x, base, z], [x, h, z]], HOLLYWOOD_RAIL_RADIUS, index === 0 ? '#797f73' : '#a0a699', detail, 10, true);
        props.tube([[x, base + 0.2, z], [x, base + 1.2, z]], [4.2, 3.7], { color: '#878e80' }, detail, 10);
        // Faded paper stickers wrapped around the lower center posts.
        if (index === 0) {
          props.tube([[x, base + 9, z], [x, base + 18, z]], [2.24, 2.24], { color: '#d1cbbb' }, detail, 10);
          props.tube([[x, base + 19, z], [x, base + 22, z]], [2.26, 2.26], { color: '#909285' }, detail, 10);
        }
      }
    }
  });

  buildSchool(props, shadowBoxes);
  buildBoundary(props, tube);
  buildStreet(props, ground);
  buildStreetFurniture(props, ground, tube);
  buildWear(props, ground);
  buildTrees(props, tube);
  return { ground: ground.geometry(), props: props.geometry(), railSegments, shadowBoxes };
}

/** Long red brick auditorium flank, its cream cornice and recessed entry. */
function buildSchool(props: Bake, shadows: HollywoodShadowBox[]) {
  const face = HOLLYWOOD_BUILDING_FACE;
  const x0 = -42 * F;
  const x1 = HOLLYWOOD_BUILDING_END;
  const depth = face + 19 * F;
  const top = HOLLYWOOD_BUILDING_TOP;
  props.box([x0, lower - 5, face], [x1, top, depth], '#867f6d', '#b6b3a1', WALL_INK);
  shadows.push({ min: [x0, lower, face], max: [x1, top, depth] });
  // Mortar is recessed behind staggered red/brown brick faces. Each brick is
  // a quad: 3D relief goes in the piers, caps, corners and window surrounds.
  const brickColors = ['#a06e53', '#9c664f', '#9e7258', '#8e654e', '#a4775b', '#a5785b'];
  const brickW = 19, brickH = 7;
  for (let row = 0; row * brickH < top - lower - 11; row++) {
    const y = lower + row * brickH;
    let col = 0;
    for (let x = x0 - (row % 2) * brickW / 2; x < x1; x += brickW) {
      const left = Math.max(x0, x + 0.65), right = Math.min(x1, x + brickW - 0.6);
      if (right <= left) continue;
      const n: Vec3 = [0, 0, -1];
      const color = brickColors[Math.floor(random(row * 138 + col++) * brickColors.length)];
      props.quad([left, y + 0.8, face - 0.2], [right, y + 0.8, face - 0.2], [right, y + brickH - 0.5, face - 0.2], [left, y + brickH - 0.5, face - 0.2], n, lit(color, n), NO_INK);
    }
    for (let z = face; z < depth; z += brickW) {
      const right = Math.min(z + brickW - 0.65, depth);
      props.quad([x1 + 0.2, y + 0.8, z + 0.6], [x1 + 0.2, y + 0.8, right], [x1 + 0.2, y + brickH - 0.5, right], [x1 + 0.2, y + brickH - 0.5, z + 0.6], [1, 0, 0], lit(brickColors[(row + Math.round(z / brickW)) % brickColors.length], [1, 0, 0]), NO_INK);
    }
  }
  // Horizontal concrete fascia is a distinctive stripe above the brick.
  props.box([x0 - 10, top - 10, face - 16], [x1 + 17, top + 3, depth + 8], '#909487', '#c8c7b5', ink(80, 8));
  props.box([x0 - 7, top + 3, face - 12], [x1 + 12, top + 11, depth + 6], '#bcbdac', '#d0cebd', ink(80, 8));
  props.box([x0 - 7, top + 10, face - 10], [x1 + 12, top + 13, depth + 6], '#81887d', '#a6ab9b', NO_INK);
  // Small anti-skating sign is drawn in geometry; it is part of the location.
  props.box([90, 11, face - 2.1], [164, 45, face - 0.3], '#6e756d', '#6e756d', NO_INK);
  props.quad([93, 14, face - 2.4], [161, 14, face - 2.4], [161, 42, face - 2.4], [93, 42, face - 2.4], front, { color: '#e8e5ca' }, NO_INK);
  lettering(props, 'NO', 97, 25, face - 2.6, 2, '#374348');
  lettering(props, 'SKATING', 121, 23, face - 2.6, 0.65, '#374348');

  // Graffiti buffed out in not-quite-matching paint, as on every skated wall.
  for (const [px0, px1, py0, py1, color, seed] of [
    [-12 * F, -6.5 * F, 22, 118, '#8f5d48', 1], [-31 * F, -27 * F, 14, 74, '#9b9688', 2],
    [4.5 * F, 9.5 * F, -112, 6, '#94644e', 3], [11 * F, 13.5 * F, -175, -118, '#a07560', 4],
  ] as const) {
    const j = (k: number) => (random(seed * 31 + k) - 0.5) * 9;
    props.quad([px0 + j(1), py0 + j(2), face - 0.35], [px1 + j(3), py0 + j(4), face - 0.35], [px1 + j(5), py1 + j(6), face - 0.35], [px0 + j(7), py1 + j(8), face - 0.35], front, lit(color, front), NO_INK);
  }
  // Downspouts from the cornice, strapped to the brick, onto splash blocks.
  for (const x of [-38 * F, -20 * F]) {
    props.tube([[x, top - 11, face - 3], [x, 9, face - 3], [x, 3, face - 11]], [2.4, 2.4, 2.4], { color: '#8a8676', lit: { color: '#b4ae98', from: 0, to: 2 } }, ink(140, 6), 8);
    for (let y = 30; y < top - 20; y += 4 * F) props.box([x - 3.4, y, face - 6], [x + 3.4, y + 1.6, face - 0.3], '#6f6d62', '#6f6d62', NO_INK);
    props.box([x - 6, 0, face - 30], [x + 6, 1.8, face - 9], '#a9a99b', '#bdbcae', NO_INK);
  }
  // A utility panel and its conduit, and a security light under the cornice.
  props.box([-26 * F, 1.6 * F, face - 6], [-24 * F, 4.2 * F, face], '#868b84', '#9ea39b', ink(142, 6));
  props.quad([-25.8 * F, 1.9 * F, face - 6.2], [-24.2 * F, 1.9 * F, face - 6.2], [-24.2 * F, 3.9 * F, face - 6.2], [-25.8 * F, 3.9 * F, face - 6.2], front, lit('#7b8079', front), NO_INK);
  props.tube([[-25 * F, 4.2 * F, face - 2.6], [-25 * F, top - 11, face - 2.6]], [1.3, 1.3], { color: '#8d9089' }, NO_INK, 6);
  props.tube([[-24.5 * F, 1.6 * F, face - 2.6], [-24.5 * F, 0, face - 2.6]], [1.3, 1.3], { color: '#8d9089' }, NO_INK, 6);
  props.box([-9 * F - 6, top - 34, face - 9], [-9 * F + 6, top - 24, face], '#55595a', '#686c6b', ink(143, 6));
  props.quad([-9 * F - 4, top - 34.2, face - 8], [-9 * F + 4, top - 34.2, face - 8], [-9 * F + 4, top - 34.2, face - 2], [-9 * F - 4, top - 34.2, face - 2], [0, -1, 0], { color: '#d9d6c4' }, NO_INK);

  // Taller recessed theater entry on the same school's upper apron. This is
  // perpendicular to the skated flight, as it is in reference views.
  const towerX0 = -35 * F, towerX1 = -14 * F;
  const towerFace = face + 9 * F;
  const towerTop = 30 * F;
  props.box([towerX0, top, towerFace], [towerX1, towerTop, depth + 20 * F], '#c3bfaa', '#ccc9b7', ink(83, 8));
  shadows.push({ min: [towerX0, top, towerFace], max: [towerX1, towerTop, depth + 20 * F] });
  for (let x = towerX0 + 20; x < towerX1; x += 118) {
    props.box([x, top + 9, towerFace - 8], [x + 18, towerTop - 22, towerFace + 6], '#d6d0bb', '#dfdac6', ink(84, 8));
    props.box([x + 21, top + 55, towerFace - 2], [Math.min(x + 98, towerX1 - 4), towerTop - 44, towerFace], '#a7a78f', '#bdbca7', NO_INK);
    for (let y = top + 70; y < towerTop - 55; y += 12) props.box([x + 28, y, towerFace - 3], [Math.min(x + 91, towerX1 - 6), y + 1.1, towerFace - 1], '#777f73', '#a5a895', NO_INK);
  }
  props.box([towerX0 - 15, towerTop - 22, towerFace - 12], [towerX1 + 15, towerTop - 10, depth + 20 * F], '#b6b5a1', '#d2cfba', ink(85, 8));

  // A restrained painted portrait panel evokes the real auditorium mural.
  // It is not a textured copy or an attribution to an invented person.
  const muralX = towerX1 + 0.4, z0 = towerFace + 12, z1 = depth + 12 * F;
  props.quad([muralX, top + 15, z0], [muralX, top + 15, z1], [muralX, towerTop - 27, z1], [muralX, towerTop - 27, z0], [1, 0, 0], lit('#4d7775', [1, 0, 0]), NO_INK);
  const portrait = (z: number, y: number, scale: number, skin: string, jacket: string) => {
    const n: Vec3 = [1, 0, 0];
    props.quad([muralX + 0.2, y - 103 * scale, z - 69 * scale], [muralX + 0.2, y - 103 * scale, z + 73 * scale], [muralX + 0.2, y - 23 * scale, z + 31 * scale], [muralX + 0.2, y - 23 * scale, z - 35 * scale], n, lit(jacket, n), NO_INK);
    ellipseOnX(props, muralX + 0.35, y + 13 * scale, z, 35 * scale, 49 * scale, skin);
    ellipseOnX(props, muralX + 0.5, y + 47 * scale, z - 4 * scale, 39 * scale, 20 * scale, '#4b4f43');
    // Broad tonal shapes keep the mural readable as painted faces instead
    // of featureless ovals when the orbit looks back toward the auditorium.
    const patch = (points: Array<[number, number]>, color: string) => {
      for (let i = 1; i + 1 < points.length; i++) {
        const p = [points[0], points[i], points[i + 1]].map(([zz, yy]): Vec3 => [muralX + 0.62, y + yy * scale, z + zz * scale]);
        props.triangle(p[0], p[1], p[2], n, lit(color, n), NO_INK);
      }
    };
    patch([[-32, 21], [-21, 8], [-17, -19], [-7, -30], [-22, -24], [-33, -2]], '#998564');
    patch([[21, 21], [31, 24], [30, -4], [20, -24], [7, -32], [11, -17]], '#af996e');
    patch([[-31, 30], [-22, 24], [-10, 26], [-6, 23], [-9, 29], [-25, 32]], '#635d49');
    patch([[7, 28], [23, 30], [28, 24], [20, 25], [9, 24]], '#635d49');
    patch([[1, 24], [-3, 3], [-9, -2], [3, -6], [8, -2], [2, 0]], '#9e8763');
    patch([[-15, -15], [-2, -13], [13, -16], [3, -19], [-8, -18]], '#876e54');
    for (const eye of [-18, 17]) {
      ellipseOnX(props, muralX + 0.72, y + 20 * scale, z + eye * scale, 8.5 * scale, 2.7 * scale, '#b9ac88');
      ellipseOnX(props, muralX + 0.82, y + 20 * scale, z + (eye - 2) * scale, 2.9 * scale, 3.1 * scale, '#4c5547');
    }
    patch([[-22, -33], [-8, -44], [0, -62], [-26, -51], [-35, -39]], '#c3b796');
    patch([[22, -33], [8, -44], [0, -62], [26, -51], [35, -39]], '#a49c7f');
  };
  portrait(z0 + 98, top + 280, 1.42, '#cdb581', '#76807b');
  portrait(z0 + 280, top + 142, 1.2, '#b59168', '#343f3e');
  portrait(z0 + 424, top + 330, 1.12, '#d0bf99', '#728c7c');

  // The campus goes on down the block past the auditorium: a two-story
  // Streamline classroom wing behind a hedge, set well back from the landing.
  const wx0 = HOLLYWOOD_RUN + 55 * F, wx1 = HOLLYWOOD_RUN + 210 * F;
  const wz0 = 30 * F, wz1 = 86 * F, wTop = lower + 27 * F;
  props.box([wx0, lower, wz0], [wx1, wTop, wz1], '#d1c6ab', '#c9c1aa', ink(86, 8));
  shadows.push({ min: [wx0, lower, wz0], max: [wx1, wTop, wz1] });
  props.box([wx0 - 6, wTop, wz0 - 6], [wx1 + 6, wTop + 10, wz1 + 6], '#bcb39b', '#c8c0aa', ink(87, 8));
  for (const y of [lower + 12.6 * F, lower + 25 * F]) props.box([wx0, y, wz0 - 3], [wx1, y + 8, wz0], '#b8ae95', '#c9c0a8', NO_INK);
  props.box([wx0, lower, wz0 - 2], [wx1, lower + 2.2 * F, wz0], '#9c917e', '#a89d89', NO_INK);
  for (const [y0, y1] of [[lower + 4 * F, lower + 10.5 * F], [lower + 16 * F, lower + 22.5 * F]]) {
    for (let x = wx0 + 5 * F; x + 7 * F < wx1 - 4 * F; x += 10 * F) {
      props.quad([x, y0, wz0 - 0.4], [x + 7 * F, y0, wz0 - 0.4], [x + 7 * F, y1, wz0 - 0.4], [x, y1, wz0 - 0.4], front, lit('#53676a', front), NO_INK);
      for (const t of [1 / 3, 2 / 3]) props.quad([x + t * 7 * F - 1.2, y0, wz0 - 0.6], [x + t * 7 * F + 1.2, y0, wz0 - 0.6], [x + t * 7 * F + 1.2, y1, wz0 - 0.6], [x + t * 7 * F - 1.2, y1, wz0 - 0.6], front, lit('#d6cfba', front), NO_INK);
      props.quad([x, (y0 + y1) / 2 - 1, wz0 - 0.6], [x + 7 * F, (y0 + y1) / 2 - 1, wz0 - 0.6], [x + 7 * F, (y0 + y1) / 2 + 1, wz0 - 0.6], [x, (y0 + y1) / 2 + 1, wz0 - 0.6], front, lit('#d6cfba', front), NO_INK);
      props.box([x - 3, y0 - 4, wz0 - 5], [x + 7 * F + 3, y0, wz0], '#c4bba3', '#d8d1bd', NO_INK);
    }
  }
  // A recessed entry with steel doors, and the hedge in its low planter.
  const ex = wx0 + 34 * F;
  props.box([ex - 3 * F, lower, wz0 - 0.4], [ex + 3 * F, lower + 8.5 * F, wz0 + 0.5], '#4a5150', '#4a5150', NO_INK);
  props.box([ex - 4 * F, lower + 8.5 * F, wz0 - 3 * F], [ex + 4 * F, lower + 9.4 * F, wz0], '#c3baa2', '#d2cab4', ink(88, 8));
  props.box([wx0 - 10 * F, lower, wz0 - 6 * F], [ex - 5 * F, lower + 1.6 * F, wz0 - 4 * F], '#a8a79a', '#b5b3a5', ink(89, 8));
  props.box([ex + 5 * F, lower, wz0 - 6 * F], [wx1, lower + 1.6 * F, wz0 - 4 * F], '#a8a79a', '#b5b3a5', ink(89, 8));
  props.box([wx0 - 10 * F + 3, lower + 1.6 * F, wz0 - 6 * F + 3], [ex - 5 * F - 3, lower + 4 * F, wz0 - 4 * F - 3], '#55683f', '#647a49', LEAF_INK);
  props.box([ex + 5 * F + 3, lower + 1.6 * F, wz0 - 6 * F + 3], [wx1 - 3, lower + 4 * F, wz0 - 4 * F - 3], '#55683f', '#647a49', LEAF_INK);
}

type Tube = (spine: Vec3[], radius: number, color: string, detail?: Ink, sides?: number, cast?: boolean) => void;

/** Welded mesh atop the upper retaining cheek, black spear fence below (raised a little: it's an obstacle now). */
function buildBoundary(props: Bake, tube: Tube) {
  const z = HOLLYWOOD_LEFT_Z - 0.22 * F;
  const length = 34 * F;
  const white = '#bfc3b2';
  // Square welded wire, not chain-link: vertical/horizontal open mesh.
  for (const y of [7, 87]) tube([[-length, y, z], [-38, y, z]], 1.6, white, ink(72, 6));
  for (let x = -length; x < -30; x += 116) {
    tube([[x, 2, z], [x, 96, z]], 2.1, white, ink(72, 6));
    props.box([x - 5, 0.3, z - 5], [x + 5, 2, z + 5], '#8e9588', '#b7bbab', NO_INK);
  }
  for (let x = -length; x < -38; x += 10.5) tube([[x, 10, z], [x, 83, z]], 0.35, '#a1aa98', NO_INK, 4);
  for (let y = 12; y < 83; y += 10.5) tube([[-length, y, z], [-38, y, z]], 0.35, '#a1aa98', NO_INK, 4);
  const sideTop = hollywoodNosing(HOLLYWOOD_RAIL_START) + HOLLYWOOD_RAIL_HEIGHT;
  tube([[-38, 87, z], [HOLLYWOOD_RAIL_START, sideTop, HOLLYWOOD_SIDE_RAIL_Z]], 1.7, white, ink(72, 6));
  const fenceZ = HOLLYWOOD_FENCE_Z;
  const fenceTop = HOLLYWOOD_FENCE_TOP;
  for (const y of [lower + 16, fenceTop - 18]) tube([[HOLLYWOOD_FENCE_START, y, fenceZ], [HOLLYWOOD_FENCE_END, y, fenceZ]], 1.5, '#424e49', ink(73, 6));
  for (let x = HOLLYWOOD_FENCE_START; x < HOLLYWOOD_FENCE_END; x += 17) {
    tube([[x, lower + 8, fenceZ], [x, fenceTop, fenceZ]], 1.1, '#424e49', ink(73, 6), 5);
    props.tube([[x, fenceTop - 2, fenceZ], [x, HOLLYWOOD_FENCE_TIPS, fenceZ]], [2.7, 0.1], { color: '#424e49' }, NO_INK, 4, true);
  }
  // Square posts every eight feet, set in the sidewalk, capped no higher than the spears.
  for (let x = HOLLYWOOD_FENCE_START + 8.5; x < HOLLYWOOD_FENCE_END; x += 8 * F) {
    props.box([x - 3, lower, fenceZ - 3], [x + 3, fenceTop + 1, fenceZ + 3], '#39433f', '#4c5853', ink(144, 6));
    props.frustum(x, fenceZ, fenceTop + 1, HOLLYWOOD_FENCE_TIPS - 1, 3.6, 0.6, { color: '#3d4843' }, NO_INK);
    props.box([x - 4.5, lower, fenceZ - 4.5], [x + 4.5, lower + 1.2, fenceZ + 4.5], '#9b9c90', '#a9aa9e', NO_INK);
  }

  // The cheek's tall street face: form joints, rust-and-dirt drips off its
  // top, weep holes near the sidewalk and a gray buff over old tags.
  const face = HOLLYWOOD_CHEEK_Z - 0.15;
  const cheekQuad = (x0: number, x1: number, y0: number, y1: number, color: string, offset = 0) =>
    props.quad([x0, y0, face - offset], [x1, y0, face - offset], [x1, y1, face - offset], [x0, y1, face - offset], front, lit(color, front), NO_INK);
  for (let x = -34 * F; x < HOLLYWOOD_RUN; x += 8 * F) cheekQuad(x - 0.4, x + 0.4, lower, hollywoodCheekTop(x) - 1, '#8f9488');
  for (let i = 0; i < 26; i++) {
    const x = -34 * F + random(i * 7 + 400) * (HOLLYWOOD_RUN + 33 * F);
    const w = 3 + random(i * 7 + 401) * 14;
    const topY = Math.min(hollywoodCheekTop(x), hollywoodCheekTop(x + w)) - 0.5;
    const drop = (0.15 + random(i * 7 + 402) * 0.55) * (topY - lower);
    const color = random(i * 7 + 403) < 0.3 ? '#a59d88' : '#959a8e';
    props.quad([x, topY, face - 0.05], [x + w, topY, face - 0.05], [x + w * 0.8, topY - drop * 0.7, face - 0.05], [x + w * 0.2, topY - drop, face - 0.05], front, lit(color, front), NO_INK);
  }
  for (let x = -30 * F; x < 0; x += 10 * F) cheekQuad(x - 2.4, x + 2.4, lower + 9, lower + 13.8, '#4c504b', 0.1);
  cheekQuad(-22 * F, -15.5 * F, lower + 40, lower + 150, '#a3a69a', 0.1);
}

/** Highland Avenue: curbs, four lanes with their paint and wear, a
 * crosswalk down the block, tree wells in the wide sidewalk, and beyond the
 * road low businesses, billboards, palms and hazy mid-rises. Cars drive the
 * lanes (HOLLYWOOD_TRAFFIC). */
function buildStreet(props: Bake, ground: Bake) {
  const road = HOLLYWOOD_ROAD_Y;
  // Paint and patching lie at distinct heights over the asphalt, so nothing stacked fights for depth.
  const paint = (x0: number, x1: number, z0: number, z1: number, color: string, lift = 0.06) =>
    ground.quad([x0, road + lift, z0], [x1, road + lift, z0], [x1, road + lift, z1], [x0, road + lift, z1], up, lit(color, up), NO_INK);
  // Both curbs: a concrete face down to the road and a gutter pan along it.
  for (const [z, side] of [[HOLLYWOOD_CURB_Z, -1], [HOLLYWOOD_FAR_CURB_Z, 1]] as const) {
    const n: Vec3 = [0, 0, side];
    ground.quad([-FAR, road, z], [FAR, road, z], [FAR, lower, z], [-FAR, lower, z], n, lit('#a9aa9e', n), ink(41, 3));
    paint(-FAR, FAR, side < 0 ? z - 1.5 * F : z, side < 0 ? z : z + 1.5 * F, '#8d918b');
  }
  // A double yellow down the middle, dashed white between each side's lanes.
  const middle = HOLLYWOOD_CURB_Z - 2 * HOLLYWOOD_LANE_WIDTH;
  for (const z of [middle - 3.5, middle + 2]) paint(-FAR, FAR, z, z + 1.5, '#c9b25a');
  for (const z of [HOLLYWOOD_CURB_Z - HOLLYWOOD_LANE_WIDTH, middle - HOLLYWOOD_LANE_WIDTH]) {
    for (let x = -300 * F; x < 300 * F; x += 40 * F) paint(x, x + 10 * F, z - 0.75, z + 0.75, '#d3d2c6');
  }
  // Oil darkens the middle of each lane where engines drip; trench patches
  // and tar-sealed cracks show decades of utility work.
  for (let n = 0; n < 4; n++) {
    const c = HOLLYWOOD_CURB_Z - (n + 0.5) * HOLLYWOOD_LANE_WIDTH;
    paint(-300 * F, 300 * F, c - 1.6 * F, c + 1.6 * F, '#575c5b', 0.02);
  }
  // Patches, as distances out from the near curb.
  for (const [x0, x1, d0, d1, color] of [
    [-48 * F, -20 * F, 1 * F, 5 * F, '#545958'], [12 * F, 15 * F, 0, 4 * HOLLYWOOD_LANE_WIDTH, '#666b69'],
    [40 * F, 58 * F, 3.5 * F, 8 * F, '#626766'], [-90 * F, -84 * F, 24 * F, 31 * F, '#525756'],
    [74 * F, 96 * F, 30 * F, 35 * F, '#5f6463'],
  ] as const) paint(x0, x1, HOLLYWOOD_CURB_Z - d1, HOLLYWOOD_CURB_Z - d0, color, 0.035);
  for (let k = 0; k < 7; k++) {
    let x = (-80 + random(k + 500) * 170) * F, z = HOLLYWOOD_CURB_Z - random(k + 510) * 4 * HOLLYWOOD_LANE_WIDTH;
    const points: Array<[number, number]> = [[x, z]];
    for (let i = 0; i < 9; i++) {
      x += (random(k * 13 + i + 520) - 0.5) * 3 * F;
      z += (random(k * 17 + i + 530) - 0.5) * 4 * F;
      points.push([x, Math.min(HOLLYWOOD_CURB_Z - 2 * F, Math.max(HOLLYWOOD_FAR_CURB_Z + 2 * F, z))]);
    }
    seam(ground, points, road + 0.05, 1.6, '#3f4443');
  }
  // Manhole and valve covers, a ring of steel round each.
  for (const [x, n] of [[-26 * F, 1.5], [33 * F, 0.5], [70 * F, 2.5], [-62 * F, 3.2]]) {
    const z = HOLLYWOOD_CURB_Z - n * HOLLYWOOD_LANE_WIDTH;
    disc(ground, x, z, road + 0.07, 1.45 * F, '#70736d', 16);
    disc(ground, x, z, road + 0.08, 1.25 * F, '#494c49', 16);
  }
  // A continental crosswalk down the block, with limit lines before it.
  const CROSS = 118 * F;
  for (let z = HOLLYWOOD_FAR_CURB_Z + 3 * F; z < HOLLYWOOD_CURB_Z - 2 * F; z += 5 * F) paint(CROSS, CROSS + 10 * F, z, z + 2 * F, '#d8d7cc', 0.06);
  paint(CROSS - 5 * F, CROSS - 4 * F, middle, HOLLYWOOD_CURB_Z - 1.5 * F, '#d8d7cc', 0.06);
  paint(CROSS + 14 * F, CROSS + 15 * F, HOLLYWOOD_FAR_CURB_Z + 1.5 * F, middle - 3.5, '#d8d7cc', 0.06);
  // Red no-stopping curb either side of the hydrant and at the corner.
  for (const [x0, x1] of [[-15 * F, 3 * F], [CROSS - 30 * F, CROSS]]) {
    const n: Vec3 = [0, 0, -1];
    ground.quad([x0, road + 0.1, HOLLYWOOD_CURB_Z - 0.12], [x1, road + 0.1, HOLLYWOOD_CURB_Z - 0.12], [x1, lower, HOLLYWOOD_CURB_Z - 0.12], [x0, lower, HOLLYWOOD_CURB_Z - 0.12], n, lit('#9c4b40', n), NO_INK);
    flat(ground, x0, x1, HOLLYWOOD_CURB_Z, HOLLYWOOD_CURB_Z + 0.55 * F, lower + 0.1, '#a3574b');
  }
  // A storm drain's mouth in the curb, under its concrete lid.
  {
    const n: Vec3 = [0, 0, -1], z = HOLLYWOOD_CURB_Z - 0.2;
    ground.quad([-26 * F, road + 0.4, z], [-20 * F, road + 0.4, z], [-20 * F, lower - 0.6, z], [-26 * F, lower - 0.6, z], n, { color: '#2e3332' }, NO_INK);
    flat(ground, -27 * F, -19 * F, HOLLYWOOD_CURB_Z + 0.6, HOLLYWOOD_CURB_Z + 3.2 * F, lower + 0.1, '#c5c4b7');
    for (const x of [-27 * F, -19 * F - 0.6, -23 * F]) flat(ground, x, x + 0.6, HOLLYWOOD_CURB_Z + 0.6, HOLLYWOOD_CURB_Z + 3.2 * F, lower + 0.12, '#8d9087');
  }
  // Tree wells in the sidewalk, dirt a little below a narrow concrete border.
  for (const { at: [x, , z] } of HOLLYWOOD_TREES) {
    flat(ground, x - 2 * F, x + 2 * F, z - 2 * F, z + 2 * F, lower + 0.08, '#6f6655');
    for (const [a, b, c, d] of [[-2, 2, -2.2, -2], [-2, 2, 2, 2.2], [-2.2, -2, -2.2, 2.2], [2, 2.2, -2.2, 2.2]]) {
      props.box([x + a * F, lower, z + c * F], [x + b * F, lower + 1.6, z + d * F], '#a5a699', '#b4b4a7', NO_INK);
    }
  }
  // Joints across the sidewalk every five feet, and one down its middle.
  for (let x = -60 * F; x < 80 * F; x += 5 * F) flat(ground, x, x + 0.5, HOLLYWOOD_CURB_Z + 0.2, HOLLYWOOD_CHEEK_Z - 0.2, lower + 0.07, '#9fa197');
  const mid = (HOLLYWOOD_CURB_Z + HOLLYWOOD_FENCE_Z) / 2;
  flat(ground, -60 * F, 80 * F, mid - 0.25, mid + 0.25, lower + 0.07, '#a2a49a');
  // Billboards: their art is abstract painted color fields, never a real
  // or invented brand, on steel frames with a catwalk and lamps.
  for (const [x, zz, h, width, art] of [[-52 * F, -104 * F, 25 * F, 22 * F, 0], [-70 * F, -92 * F, 31 * F, 15 * F, 1]] as const) {
    const x0 = x - width / 2, x1 = x + width / 2, y0 = h - 5 * F, y1 = h + 5 * F, fz = zz + 7.6;
    props.tube([[x, lower, zz], [x, h, zz]], [9, 9], { color: '#655e52' }, ink(128, 5), 8);
    props.box([x0, y0, zz - 7], [x1, y1, zz + 7], '#8e9690', '#a5ada3', ink(130, 5));
    const n: Vec3 = [0, 0, 1];
    const panel = (a: number, b: number, c: number, d: number, color: string, lift: number) =>
      props.quad([a, c, fz + lift], [b, c, fz + lift], [b, d, fz + lift], [a, d, fz + lift], n, lit(color, n), NO_INK);
    const [sky, band, accent, dark] = art ? ['#c9b78e', '#b0634b', '#e4ddc6', '#3c4a4f'] : ['#7f9ea6', '#d2c39c', '#c35f45', '#2f3a3d'];
    panel(x0 + 4, x1 - 4, y0 + 4, y1 - 4, sky, 0);
    panel(x0 + 4, x1 - 4, y0 + 4, y0 + 4 + (y1 - y0) * 0.35, band, 0.2);
    discFacing(props, x0 + width * 0.7, y0 + (y1 - y0) * 0.58, fz + 0.4, (y1 - y0) * 0.24, accent);
    panel(x0 + width * 0.08, x0 + width * 0.48, y0 + (y1 - y0) * 0.6, y0 + (y1 - y0) * 0.72, dark, 0.4);
    panel(x0 + width * 0.08, x0 + width * 0.36, y0 + (y1 - y0) * 0.46, y0 + (y1 - y0) * 0.53, dark, 0.4);
    props.box([x0, y0 - 6, zz + 7], [x1, y0 - 4, zz + 2.5 * F], '#5d605a', '#6e716a', NO_INK);
    props.tube([[x0, y0 - 4, zz + 2.5 * F], [x1, y0 - 4, zz + 2.5 * F]], [0.8, 0.8], { color: '#5d605a' }, NO_INK, 4);
    for (let k = 0; k < 3; k++) {
      const lx = x0 + width * (k + 0.5) / 3;
      props.tube([[lx, y0 - 4, zz + 8], [lx, y0 - 1, zz + 4 * F]], [0.9, 0.9], { color: '#55585a' }, NO_INK, 4);
      props.box([lx - 7, y0 - 4, zz + 4 * F - 4], [lx + 7, y0 + 1, zz + 4 * F + 4], '#6c6f6c', '#7d807b', NO_INK);
    }
  }
  // Low businesses across the road, behind their own sidewalk, up and down
  // the block: stucco, shop glass, doors, sign bands, awnings and rooftop units.
  const FACADES = ['#c9bfa6', '#b7b3a4', '#d0c2a6', '#a9b0a6', '#c3ad97', '#bdb9ad', '#a8a297', '#cdb9a0'];
  const AWNINGS = ['#7a3b35', '#3f5a4c', '#33475e', '#9b8a62', '#6d3e52'];
  const SIGNS = ['#e0d8c0', '#2f3b45', '#8f2f2b', '#d7c48a', '#4b6150'];
  const n: Vec3 = [0, 0, 1];
  for (let i = 0; i < 16; i++) {
    const x = -156 * F + i * 23 * F, x1 = x + 21 * F;
    const zz = HOLLYWOOD_FAR_CURB_Z - 12 * F;
    const h = 12 * F + random(i) * 11 * F;
    const pick = <T>(list: readonly T[], seed: number) => list[Math.floor(random(i * 11 + seed) * list.length)];
    const shop = (a: number, b: number, c: number, d: number, color: string, lift: number) =>
      props.quad([a, lower + c, zz + lift], [b, lower + c, zz + lift], [b, lower + d, zz + lift], [a, lower + d, zz + lift], n, lit(color, n), NO_INK);
    props.box([x, lower, zz - 18 * F], [x1, lower + h, zz], pick(FACADES, 1), '#bfc2b1', ink(135, 4));
    props.box([x - 5, lower + h - 4, zz - 18 * F - 5], [x1 + 5, lower + h + 6, zz + 5], '#8b978b', '#bbc0b0', NO_INK);
    // Shop glass over a low kickplate, mullions, a door and the sun's reflection.
    shop(x + 18, x1 - 18, 0, 15, '#6a6d67', 0.2);
    shop(x + 18, x1 - 18, 15, 118, '#4f6567', 0.2);
    const door = x + 40 + random(i * 11 + 2) * (21 * F - 120);
    shop(door, door + 38, 2, 92, '#2f3b3c', 0.4);
    shop(door - 2.5, door, 0, 94, '#5c605b', 0.45);
    shop(door + 38, door + 40.5, 0, 94, '#5c605b', 0.45);
    for (let m = x + 18; m <= x1 - 18; m += (21 * F - 36) / 5) shop(m - 1.6, m + 1.6, 15, 118, '#5c605b', 0.35);
    props.quad([x + 60, lower + 30, zz + 0.3], [x + 110, lower + 30, zz + 0.3], [x + 150, lower + 110, zz + 0.3], [x + 100, lower + 110, zz + 0.3], n, lit('#6f8789', n), NO_INK);
    // A sign band with an abstract run of lettering, and on most an awning.
    const sign = pick(SIGNS, 3);
    props.box([x + 12, lower + 124, zz], [x1 - 12, lower + 152, zz + 2], sign, sign, NO_INK);
    const letters = 4 + Math.floor(random(i * 11 + 4) * 5);
    const letterColor = sign === '#e0d8c0' || sign === '#d7c48a' ? '#3b3f3c' : '#e7e1cb';
    for (let k = 0; k < letters; k++) {
      const lx = x + 21 * F / 2 + (k - letters / 2) * 22;
      shop(lx + 3, lx + 18, 131, 145, letterColor, 2.3);
    }
    if (random(i * 11 + 5) < 0.65) {
      const awning = pick(AWNINGS, 6);
      const tilt: Vec3 = [0, 0.8, 0.6];
      props.quad([x + 16, lower + 121, zz], [x1 - 16, lower + 121, zz], [x1 - 16, lower + 103, zz + 3.5 * F], [x + 16, lower + 103, zz + 3.5 * F], tilt, lit(awning, tilt), ink(136, 4));
      props.quad([x + 16, lower + 103, zz + 3.5 * F], [x1 - 16, lower + 103, zz + 3.5 * F], [x1 - 16, lower + 93, zz + 3.5 * F], [x + 16, lower + 93, zz + 3.5 * F], n, lit(awning, n), NO_INK);
    }
    // Upper-floor windows with sills on the taller buildings.
    if (h > 17 * F) {
      for (let k = 0; k < 4; k++) {
        const wx = x + 40 + k * (21 * F - 80) / 4;
        shop(wx, wx + 80, 12.5 * F, 16.5 * F, '#566c6d', 0.2);
        props.box([wx - 4, lower + 12.5 * F - 4, zz], [wx + 84, lower + 12.5 * F, zz + 4], '#cfcab8', '#d8d4c3', NO_INK);
      }
    }
    // Rooftop air conditioners behind the parapet.
    for (let k = 0; k < 1 + Math.floor(random(i * 11 + 7) * 2); k++) {
      const ax = x + 60 + random(i * 11 + 8 + k) * (21 * F - 200);
      const az = zz - 4 * F - random(i * 11 + 9 + k) * 9 * F;
      props.box([ax, lower + h + 6, az - 2.5 * F], [ax + 3.5 * F, lower + h + 6 + 2.6 * F, az], '#a8ada6', '#bcc0b8', ink(137, 4));
    }
  }
  // Hazy mid-rises behind the block, as down Highland toward Sunset.
  for (const [x0, x1, z0, z1, height, tint] of [
    [-150 * F, -122 * F, -330 * F, -300 * F, 120 * F, '#b4b6aa'], [30 * F, 64 * F, -380 * F, -344 * F, 150 * F, '#a9b0ac'],
    [190 * F, 216 * F, -300 * F, -276 * F, 90 * F, '#c0b7a4'], [-290 * F, -256 * F, -360 * F, -330 * F, 135 * F, '#b9b3a3'],
  ] as const) {
    props.box([x0, lower, z0], [x1, lower + height, z1], tint, '#c3c5b9', ink(138, 3));
    for (let y = lower + 14 * F; y < lower + height - 8 * F; y += 12 * F) {
      for (let x = x0 + 2 * F; x < x1 - 3 * F; x += 5 * F) {
        props.quad([x, y, z1 + 0.5], [x + 3 * F, y, z1 + 0.5], [x + 3 * F, y + 6 * F, z1 + 0.5], [x, y + 6 * F, z1 + 0.5], n, lit('#6e8085', n), NO_INK);
      }
    }
  }
}

/**
 * The near sidewalk's furniture, along the curb and the fence, clear of the
 * fence line's touchdown and ride away (x from the lip to 70 ft down) and
 * of the filmers' tripods: cobra-head streetlights, a hydrant, parking signs,
 * a city trash can, a signal cabinet and the corner's traffic signal.
 */
function buildStreetFurniture(props: Bake, ground: Bake, tube: Tube) {
  const kerb = HOLLYWOOD_CURB_Z + 1.6 * F;
  const steel = { color: '#7d827b', lit: { color: '#b4b8ae', from: 0.1, to: 2 } };
  for (const x of [-48 * F, 84 * F]) {
    props.frustum(x, kerb, lower, lower + 1.4 * F, 8, 6, { color: '#9a9b8f' }, ink(146, 6));
    props.tube([[x, lower + 1.4 * F, kerb], [x, lower + 27 * F, kerb]], [4.4, 2.6], steel, ink(147, 6), 8);
    props.tube([[x, lower + 26 * F, kerb], [x, lower + 28 * F, kerb - 2 * F], [x, lower + 28.6 * F, kerb - 8 * F]], [2, 1.8, 1.6], steel, ink(148, 6), 6);
    props.box([x - 6, lower + 27.6 * F, kerb - 8 * F - 26], [x + 6, lower + 29 * F, kerb - 8 * F + 4], '#9a9e96', '#aeb1a8', ink(149, 6));
    props.quad([x - 4.5, lower + 27.55 * F, kerb - 8 * F - 22], [x + 4.5, lower + 27.55 * F, kerb - 8 * F - 22], [x + 4.5, lower + 27.55 * F, kerb - 8 * F], [x - 4.5, lower + 27.55 * F, kerb - 8 * F], [0, -1, 0], { color: '#e5e2cf' }, NO_INK);
    flat(ground, x + 1.2 * F, x + 2.4 * F, kerb - 0.6 * F, kerb + 0.6 * F, lower + 0.1, '#7a7d76');
  }

  // An LA wet-barrel hydrant, faded yellow, its outlets toward the street.
  {
    const x = -6 * F, z = HOLLYWOOD_CURB_Z + 1.8 * F;
    const yellow = { color: '#b99a3e', lit: { color: '#d8bf63', from: 0, to: 2 } };
    props.tube([[x, lower, z], [x, lower + 2.5, z]], [7, 6.5], { color: '#868880' }, NO_INK, 10);
    props.tube([[x, lower + 2.5, z], [x, lower + 25, z]], [4.8, 4.6], yellow, ink(150, 7), 10);
    props.tube([[x, lower + 25, z], [x, lower + 28, z], [x, lower + 31.5, z]], [5.6, 4.6, 1.4], yellow, ink(151, 7), 10);
    props.tube([[x, lower + 17, z - 3], [x, lower + 17, z - 9.5]], [2.6, 2.6], yellow, NO_INK, 8);
    for (const side of [-1, 1]) props.tube([[x + 3 * side, lower + 19, z], [x + 8 * side, lower + 19, z]], [1.9, 1.9], yellow, NO_INK, 8);
  }

  // Parking-restriction signs facing oncoming traffic, and a school-zone sign before the crosswalk.
  const post = (x: number, z: number, height: number) => tube([[x, lower, z], [x, lower + height, z]], 1.1, '#8f938b', NO_INK, 4);
  const plate = (x: number, z: number, y0: number, y1: number, w: number, color: string) => {
    const n: Vec3 = [-1, 0, 0];
    props.box([x - 0.3, y0, z - w / 2], [x + 0.3, y1, z + w / 2], '#9a9d95', '#9a9d95', NO_INK);
    props.quad([x - 0.4, y0 + 0.5, z - w / 2 + 0.5], [x - 0.4, y0 + 0.5, z + w / 2 - 0.5], [x - 0.4, y1 - 0.5, z + w / 2 - 0.5], [x - 0.4, y1 - 0.5, z - w / 2 + 0.5], n, lit(color, n), NO_INK);
    return (a: number, b: number, c: number, d: number, paint: string) =>
      props.quad([x - 0.5, y0 + c, z - w / 2 + a], [x - 0.5, y0 + c, z - w / 2 + b], [x - 0.5, y0 + d, z - w / 2 + b], [x - 0.5, y0 + d, z - w / 2 + a], n, lit(paint, n), NO_INK);
  };
  for (const x of [-30 * F, 60 * F]) {
    post(x, kerb, 8.5 * F);
    const text = plate(x, kerb, lower + 6.6 * F, lower + 8.3 * F, 1.05 * F, '#e7e5da');
    for (const [c, d] of [[37, 43], [27, 33], [17, 23], [7, 12]]) text(5, 26, c, d, '#a8392f');
  }
  {
    const x = 104 * F;
    post(x, kerb, 9.5 * F);
    const n: Vec3 = [-1, 0, 0], y = lower + 7.2 * F, half = 0.75 * F;
    const pentagon: Array<[number, number]> = [[0, 2.3 * half], [half, 1.4 * half], [half, -half], [-half, -half], [-half, 1.4 * half]];
    for (let i = 1; i + 1 < pentagon.length; i++) {
      const pts = [pentagon[0], pentagon[i], pentagon[i + 1]].map(([dz, dy]): Vec3 => [x - 0.5, y + dy, kerb + dz]);
      props.triangle(pts[0], pts[1], pts[2], n, lit('#c6cf45', n), ink(152, 7));
    }
    for (const [dz, h] of [[-7, 16], [5, 12]]) props.quad([x - 0.7, y - 10, kerb + dz], [x - 0.7, y - 10, kerb + dz + 5], [x - 0.7, y - 10 + h, kerb + dz + 5], [x - 0.7, y - 10 + h, kerb + dz], n, { color: '#2f3330' }, NO_INK);
  }

  // A city trash can and a traffic-signal cabinet against the fence.
  {
    const x = -56 * F, z = HOLLYWOOD_FENCE_Z - 2.4 * F;
    props.tube([[x, lower, z], [x, lower + 84, z]], [25, 27], { color: '#3d5245', lit: { color: '#5e7564', from: 0, to: 2 } }, ink(154, 6), 12);
    props.tube([[x, lower + 84, z], [x, lower + 90, z]], [28.5, 26], { color: '#47594d' }, ink(155, 6), 12);
    disc(props, x, z, lower + 90.1, 15, '#26302a', 10);
  }
  {
    const x = -74 * F, z0 = HOLLYWOOD_FENCE_Z - 2.6 * F, z1 = HOLLYWOOD_FENCE_Z - 0.6 * F;
    props.box([x - 6, lower, z0 - 6], [x + 3.2 * F, lower + 4, z1 + 3], '#a3a497', '#b2b2a5', NO_INK);
    props.box([x, lower + 4, z0], [x + 2.6 * F, lower + 5 * F, z1], '#9aa097', '#acb1a7', ink(156, 6));
    const n: Vec3 = [0, 0, -1];
    for (let y = lower + 3.6 * F; y < lower + 4.6 * F; y += 5) props.quad([x + 10, y, z0 - 0.3], [x + 2.6 * F - 10, y, z0 - 0.3], [x + 2.6 * F - 10, y + 2, z0 - 0.3], [x + 10, y + 2, z0 - 0.3], n, { color: '#6f746d' }, NO_INK);
    props.quad([x + 1.3 * F - 0.5, lower + 8, z0 - 0.3], [x + 1.3 * F + 0.5, lower + 8, z0 - 0.3], [x + 1.3 * F + 0.5, lower + 3.4 * F, z0 - 0.3], [x + 1.3 * F - 0.5, lower + 3.4 * F, z0 - 0.3], n, { color: '#6f746d' }, NO_INK);
  }
  // Water-meter lids in the paving.
  for (const x of [-36 * F, 90 * F]) {
    flat(ground, x, x + 1.2 * F, HOLLYWOOD_FENCE_Z - 2.2 * F, HOLLYWOOD_FENCE_Z - 0.6 * F, lower + 0.11, '#6c6e68');
    flat(ground, x + 3, x + 1.2 * F - 3, HOLLYWOOD_FENCE_Z - 2.2 * F + 3, HOLLYWOOD_FENCE_Z - 0.6 * F - 3, lower + 0.13, '#5e605b');
  }

  // The corner's traffic signal: a mast arm over the near lanes, three-lamp heads.
  {
    const x = 116 * F, z = kerb;
    props.tube([[x, lower, z], [x, lower + 20 * F, z]], [5, 3.6], { color: '#6f746e', lit: { color: '#9da29a', from: 0.1, to: 2 } }, ink(158, 6), 8);
    props.tube([[x, lower + 18 * F, z], [x, lower + 19.2 * F, z - 24 * F]], [2.6, 1.8], { color: '#6f746e' }, ink(159, 6), 6);
    for (const dz of [-12 * F, -22 * F]) {
      const hz = z + dz, y = lower + 18.6 * F;
      props.box([x - 7, y - 3.2 * F, hz - 7], [x + 5, y, hz + 7], '#3a3e3b', '#454945', ink(160, 7));
      for (const [k, lamp] of [[0, '#7c3a32'], [1, '#867a3c'], [2, '#3f6a4b']] as const) {
        props.quad([x - 7.2, y - 0.6 * F - k * F - 4, hz - 4], [x - 7.2, y - 0.6 * F - k * F - 4, hz + 4], [x - 7.2, y - 0.6 * F - k * F + 4, hz + 4], [x - 7.2, y - 0.6 * F - k * F + 4, hz - 4], [-1, 0, 0], { color: lamp }, NO_INK);
      }
    }
    props.box([x + 4, lower + 8 * F, z - 6], [x + 16, lower + 9.5 * F, z + 6], '#3a3e3b', '#454945', NO_INK);
  }
}

/**
 * The marks a famous spot collects: gum and stains on the paving, cracks,
 * black board scuffs at the lip and powerslide marks on the landing, and
 * dry leaves in the gutter and along the fences' feet.
 */
function buildWear(props: Bake, ground: Bake) {
  const scatter = (count: number, seed: number, x0: number, x1: number, z0: number, z1: number, draw: (x: number, z: number, k: number) => void) => {
    for (let k = 0; k < count; k++) draw(x0 + random(seed + k * 3) * (x1 - x0), z0 + random(seed + k * 3 + 1) * (z1 - z0), k);
  };
  const GUM = ['#7d7e76', '#8a8a82', '#6f706a', '#93938a'];
  scatter(55, 700, -50 * F, 90 * F, HOLLYWOOD_CURB_Z + F, HOLLYWOOD_FENCE_Z - 1.5 * F, (x, z, k) => blot(ground, x, z, lower + 0.14, 1.1 + random(k + 760) * 1.3, GUM[k % 4], k + 760, 5));
  scatter(22, 900, -30 * F, -1, HOLLYWOOD_LEFT_Z + 4, HOLLYWOOD_RIGHT_Z - 4, (x, z, k) => blot(ground, x, z, 0.14, 1.1 + random(k + 960) * 1.2, GUM[k % 4], k + 960, 5));
  const STAINS = ['#b2b2a5', '#b7b6a8', '#adafa3', '#b0b1a6'];
  scatter(9, 1100, -38 * F, -2 * F, HOLLYWOOD_LEFT_Z + F, HOLLYWOOD_RIGHT_Z - F, (x, z, k) => blot(ground, x, z, 0.12, (0.8 + random(k + 1150) * 1.2) * F, STAINS[k % 4], k + 1150, 12));
  scatter(8, 1200, -50 * F, 80 * F, HOLLYWOOD_CURB_Z + 2 * F, HOLLYWOOD_FENCE_Z - 2 * F, (x, z, k) => blot(ground, x, z, lower + 0.12, (0.8 + random(k + 1250) * 1.3) * F, STAINS[k % 4], k + 1250, 12));
  scatter(5, 1300, HOLLYWOOD_RUN + 2 * F, HOLLYWOOD_RUN + 30 * F, HOLLYWOOD_LEFT_Z + F, HOLLYWOOD_RIGHT_Z - F, (x, z, k) => blot(ground, x, z, lower + 0.12, (0.8 + random(k + 1350) * 1.1) * F, STAINS[k % 4], k + 1350, 12));
  // Hairline cracks wandering across slabs.
  const crack = (x: number, z: number, y: number, seed: number, zMin: number, zMax: number) => {
    const points: Array<[number, number]> = [[x, z]];
    for (let i = 0; i < 7; i++) {
      x += (random(seed + i) - 0.3) * 1.6 * F;
      z = Math.max(zMin, Math.min(zMax, z + (random(seed + i + 40) - 0.5) * 2 * F));
      points.push([x, z]);
    }
    seam(ground, points, y, 0.55, '#878a81');
  };
  crack(-24 * F, -3 * F, 0.11, 1400, HOLLYWOOD_LEFT_Z + 2, HOLLYWOOD_RIGHT_Z - 2);
  crack(-11 * F, 4 * F, 0.11, 1450, HOLLYWOOD_LEFT_Z + 2, HOLLYWOOD_RIGHT_Z - 2);
  for (const [x, seed] of [[-40 * F, 1500], [-8 * F, 1550], [52 * F, 1600]]) crack(x, HOLLYWOOD_CURB_Z + 6 * F, lower + 0.11, seed, HOLLYWOOD_CURB_Z + F, HOLLYWOOD_FENCE_Z - F);
  // Black scuffs where boards' tails and wheels hit the lip, mostly the
  // street half where the lines come in, and powerslides on the landing.
  for (let k = 0; k < 18; k++) {
    const z = -200 + random(k + 1700) * 230;
    const x = -0.3 - random(k + 1720) * 3.5 * F;
    const len = 6 + random(k + 1740) * 18;
    const angle = (random(k + 1760) - 0.5) * 0.5;
    seam(ground, [[x - len * Math.cos(angle), z - len * Math.sin(angle)], [x, z]], 0.15, 0.7 + random(k + 1780) * 1.1, k % 3 ? '#5f6261' : '#747672');
  }
  for (let k = 0; k < 6; k++) {
    const x = HOLLYWOOD_RUN + (3 + random(k + 1800) * 14) * F, z = -170 + random(k + 1820) * 140;
    const len = (2.5 + random(k + 1840) * 4) * F, angle = (random(k + 1860) - 0.5) * 0.7;
    seam(ground, [[x, z], [x + len * Math.cos(angle), z + len * Math.sin(angle)]], lower + 0.15, 2.2, '#80827d');
  }
  // Dry leaves caught in the gutter and along the fences' feet.
  const LEAVES = ['#8a7a55', '#6d6447', '#9a8a62', '#5f5a43', '#7f6a4a'];
  const leaf = (x: number, z: number, y: number, k: number) => {
    const a = random(k * 7 + 2000) * Math.PI * 2, r = 1.6 + random(k * 7 + 2001) * 1.8;
    const p = (t: number, s: number): Vec3 => [x + Math.cos(a + t) * r * s, y, z + Math.sin(a + t) * r * s];
    props.triangle(p(0, 1), p(2.4, 0.6), p(-2.4, 0.6), up, lit(LEAVES[k % LEAVES.length], up), NO_INK);
  };
  scatter(45, 2100, -70 * F, 110 * F, HOLLYWOOD_CURB_Z - 1.3 * F, HOLLYWOOD_CURB_Z - 0.2, (x, z, k) => leaf(x, z, HOLLYWOOD_ROAD_Y + 0.12, k));
  scatter(30, 2300, -34 * F, -2 * F, HOLLYWOOD_LEFT_Z + 1, HOLLYWOOD_LEFT_Z + 9, (x, z, k) => leaf(x, z, 0.16, k + 50));
  scatter(30, 2500, -40 * F, 30 * F, HOLLYWOOD_FENCE_Z - 7, HOLLYWOOD_FENCE_Z - 1, (x, z, k) => leaf(x, z, lower + 0.16, k + 90));
  for (const { at: [x, , z] } of HOLLYWOOD_TREES) scatter(8, 2700 + x, x - 1.8 * F, x + 1.8 * F, z - 1.8 * F, z + 1.8 * F, (lx, lz, k) => leaf(lx, lz, lower + 0.14, k + 140));
}

const flat = (bake: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) =>
  bake.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], up, lit(color, up), NO_INK);

/** A round cover lying flat on the ground. */
function disc(bake: Bake, x: number, z: number, y: number, r: number, color: string, sides = 12) {
  const at = (i: number): Vec3 => [x + Math.cos(i * Math.PI * 2 / sides) * r, y, z + Math.sin(i * Math.PI * 2 / sides) * r];
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i + 1), at(i), up, lit(color, up), NO_INK);
}

/** A round painted shape on a face toward the street (+z). */
function discFacing(bake: Bake, x: number, y: number, z: number, r: number, color: string, sides = 18) {
  const n: Vec3 = [0, 0, 1];
  const at = (i: number): Vec3 => [x + Math.cos(i * Math.PI * 2 / sides) * r, y + Math.sin(i * Math.PI * 2 / sides) * r, z];
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i), at(i + 1), n, lit(color, n), NO_INK);
}

/** An irregular blot on the ground: a stain, a gum spot, a dried puddle. */
function blot(bake: Bake, x: number, z: number, y: number, r: number, color: string, seed: number, sides = 7) {
  const at = (i: number): Vec3 => {
    const k = r * (0.78 + 0.32 * random(seed * 13 + (i % sides)));
    return [x + Math.cos(i * Math.PI * 2 / sides) * k, y, z + Math.sin(i * Math.PI * 2 / sides) * k * 0.8];
  };
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i + 1), at(i), up, lit(color, up), NO_INK);
}

/** A thin line along the ground through (x, z) points: a crack, a sealed seam. */
function seam(bake: Bake, points: Array<[number, number]>, y: number, width: number, color: string) {
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1], [x1, z1] = points[i];
    const length = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / length * width / 2, nz = (x1 - x0) / length * width / 2;
    bake.quad([x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz], up, lit(color, up), NO_INK);
  }
}

function ellipseOnX(props: Bake, x: number, y: number, z: number, rz: number, ry: number, color: string) {
  const n: Vec3 = [1, 0, 0];
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10, b = (i + 1) * Math.PI / 10;
    props.triangle([x, y, z], [x, y + Math.sin(a) * ry, z + Math.cos(a) * rz], [x, y + Math.sin(b) * ry, z + Math.cos(b) * rz], n, lit(color, n), NO_INK);
  }
}

/**
 * Street trees: jacarandas, the city's own, as realistic street props
 * (props/streetProps.ts) in wells beside the curb, clear of the fence
 * line's flight and ride away, and one past the school's end beyond the
 * bottom landing; turned so no two show the same side.
 */
export const HOLLYWOOD_TREES = [[-17, -20.5, 22, 20], [-40, -20.5, 25, 140], [-67, -20.5, 23, 250], [62, -20.5, 24, 300], [30, 25, 24, 75]]
  .map(([x, z, height, yaw]) => ({ at: [x * F, lower, z * F] as Vec3, height: height * F, yaw }));

/** Lane centers out from the near curb; the near two run +x, the far two back (cars keep right). */
const lane = (n: number) => HOLLYWOOD_CURB_Z - (n + 0.5) * HOLLYWOOD_LANE_WIDTH;
const MPH = (5280 * F) / 3600;
/** Each car's lap down the street: out of sight in the haze before it comes round again. */
const LAP = 700 * F;

/** Traffic on the avenue, everyday colors, sun-faded: one speed per lane, so no car ever catches another. */
export const HOLLYWOOD_TRAFFIC = ([
  [0, -40, 'sedan', '#9aa3a6', 27], [0, 180, 'suv', '#2d3438', 27],
  [1, 60, 'hatchback', '#d9d7cf', 33],
  [2, 120, 'sedan', '#6b2a2c', 30], [2, -170, 'suv', '#4f5b66', 30],
  [3, -10, 'sedan', '#c8c4b8', 25],
] as const).map(([n, x, model, paint, mph]) => ({
  at: [x * F, HOLLYWOOD_ROAD_Y, lane(n)] as Vec3,
  yaw: n < 2 ? 0 : 180,
  model,
  paint,
  speed: mph * MPH,
  lap: LAP,
}));

/** True three-dimensional palm fronds. */
function buildTrees(props: Bake, tube: Tube) {
  for (const [x, z, height] of [[-8 * F, HOLLYWOOD_FAR_CURB_Z - 4 * F, 44 * F], [-59 * F, HOLLYWOOD_FAR_CURB_Z - 5 * F, 37 * F]]) {
    const top = lower + height;
    props.tube([[x, lower, z], [x + 13, top * 0.45, z - 4], [x + 18, top, z + 7]], [10, 8, 5], { color: '#827d61', lit: { color: '#afa184', from: 0.1, to: 2 } }, ink(97, 7), 9);
    for (let h = lower + 10; h < top; h += 16) {
      const t = (h - lower) / height;
      props.tube([[x + 18 * t, h, z + 7 * t], [x + 18 * t, h + 1.8, z + 7 * t]], [10 - 5 * t, 10 - 5 * t], { color: '#686e55' }, NO_INK, 8);
    }
    for (let i = 0; i < 14; i++) {
      const a = i * Math.PI * 2 / 14;
      const dx = Math.cos(a), dz = Math.sin(a);
      const stem: Vec3[] = [[x + 18, top, z + 7], [x + 18 + dx * 65, top + 22, z + 7 + dz * 65], [x + 18 + dx * 123, top - 2, z + 7 + dz * 123], [x + 18 + dx * 155, top - 65, z + 7 + dz * 155]];
      tube(stem, 1.35, '#718058', NO_INK, 5);
      for (let j = 0; j < 11; j++) {
        const t = (j + 1) / 12;
        const reach = 150 * t;
        const y = top + Math.sin(t * Math.PI) * 28 - t * t * 65;
        const p: Vec3 = [x + 18 + dx * reach, y, z + 7 + dz * reach];
        const width = 30 * Math.sin(t * Math.PI) + 5;
        for (const side of [-1, 1]) {
          const q: Vec3 = [p[0] - dz * width * side + dx * 16, p[1] - 17, p[2] + dx * width * side + dz * 16];
          props.triangle(p, q, [p[0] + dx * 11, p[1] - 3, p[2] + dz * 11], [0, 1, 0], lit(i % 2 ? '#687c4c' : '#78844c', up), LEAF_INK);
        }
      }
    }
  }
}

// Compact block lettering on actual signs (the NO SKATING sign), baked into the same prop mesh.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

function lettering(props: Bake, text: string, x: number, y: number, z: number, scale: number, color: string) {
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]];
    if (!glyph) continue;
    glyph.forEach((row, r) => [...row].forEach((pixel, c) => {
      if (pixel !== '1') return;
      const a = x + (i * 6 + c) * scale, b = y + (6 - r) * scale;
      props.quad([a, b, z], [a + scale * 0.9, b, z], [a + scale * 0.9, b + scale * 0.9, z], [a, b + scale * 0.9, z], front, { color }, NO_INK);
    }));
  }
}

export class Hollywood3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildHollywoodGeometry,
      laneZ: HOLLYWOOD_LANE_Z,
      ground: hollywoodGround,
      grade: HOLLYWOOD_GRADE,
      run: HOLLYWOOD_RUN,
      drop: HOLLYWOOD_DROP,
      // The crane stays clear of the real school wall on the positive side.
      cameraZ: [-30 * F, HOLLYWOOD_BUILDING_FACE - 25],
      streetProps: { trees: HOLLYWOOD_TREES, cars: HOLLYWOOD_TRAFFIC },
      tripods: {
        bottom: { u: HOLLYWOOD_RUN + 23 * F, z: HOLLYWOOD_LEFT_Z + 1.6 * F, height: lower + 2.8 * F, frame: 24 * F, place: 0.43 },
        side: { u: HOLLYWOOD_RUN + 6 * F, z: HOLLYWOOD_LEFT_Z - 14 * F, height: lower + 7 * F, frame: 23 * F, place: 0.53 },
        top: { u: -3 * F, z: HOLLYWOOD_LEFT_Z + 1.1 * F, height: 6.5 * F, frame: 19 * F, place: 0.48 },
      },
      stayUp: ['fence'],
      obstacleTripods: {
        // Over the fence: from the sidewalk the rider lands on, from down the
        // street, and from the top of the stairs behind the center rail, as
        // the classic clips were filmed.
        fence: {
          bottom: { u: 8 * F, z: HOLLYWOOD_CURB_Z + 1.5 * F, height: lower + 2.6 * F, frame: 22 * F, place: 0.45 },
          side: { u: 58 * F, z: HOLLYWOOD_FENCE_Z - 5 * F, height: lower + 5.5 * F, frame: 24 * F, place: 0.5 },
          top: { u: 2 * F, z: 3 * F, height: 5 * F, frame: 20 * F, place: 0.5 },
        },
      },
    });
  }
}

export const buildHollywood3D = () => new Hollywood3D();
