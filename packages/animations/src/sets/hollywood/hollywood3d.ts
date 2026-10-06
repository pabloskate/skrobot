import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { ClassicSpot3D } from '../classicSpot3d';
import {
  HOLLYWOOD_BUILDING_END, HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_BUILDING_TOP,
  HOLLYWOOD_DROP, HOLLYWOOD_FOOT as F, HOLLYWOOD_GRADE, HOLLYWOOD_LANE_Z,
  HOLLYWOOD_LEFT_Z, HOLLYWOOD_RAIL_END, HOLLYWOOD_RAIL_HEIGHT,
  HOLLYWOOD_RAIL_LINES, HOLLYWOOD_RAIL_RADIUS, HOLLYWOOD_RAIL_START,
  HOLLYWOOD_RIGHT_Z, HOLLYWOOD_RISER, HOLLYWOOD_RUN, HOLLYWOOD_SIDE_RAIL_Z,
  HOLLYWOOD_STEPS, HOLLYWOOD_TREAD, hollywoodGround, hollywoodNosing,
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
  // adjacent street/parking is lower, so no fictitious bank fills this edge.
  plane(-FAR, 0, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, 0, '#bdbdb1');
  // Parking, street, landing and raised sidewalk own disjoint footprints.
  // Stacking broad asphalt planes a fraction apart makes their colors fight
  // for depth from distant cameras, even when their nominal heights differ.
  plane(HOLLYWOOD_RUN, FAR, HOLLYWOOD_LEFT_Z - 0.7 * F, FAR, lower, '#bebdaf');
  plane(HOLLYWOOD_RUN, FAR, HOLLYWOOD_LEFT_Z - 4 * F, HOLLYWOOD_LEFT_Z - 3.8 * F, lower, '#bebdaf');
  plane(-FAR, HOLLYWOOD_RUN, HOLLYWOOD_LEFT_Z - 17 * F, HOLLYWOOD_LEFT_Z - 3.8 * F, lower - 1, '#626664');
  plane(-FAR, FAR, -FAR, HOLLYWOOD_LEFT_Z - 17 * F, lower - 1.2, '#5a605e');
  // Raised parking curb and concrete sidewalk continue alongside the stairs.
  props.box([-FAR, lower - 1, HOLLYWOOD_LEFT_Z - 3.8 * F], [FAR, lower + 4, HOLLYWOOD_LEFT_Z - 3.3 * F], '#a6a79c', '#c5c4b7', ink(41, 3));
  plane(-FAR, FAR, HOLLYWOOD_LEFT_Z - 3.3 * F, HOLLYWOOD_LEFT_Z - 0.7 * F, lower + 4, '#b3b5a9');

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
  // One continuous crack in the landing, with finite shallow branch seams.
  for (const x of [-13 * F, -5 * F, HOLLYWOOD_RUN + 6 * F, HOLLYWOOD_RUN + 16 * F, HOLLYWOOD_RUN + 30 * F]) {
    const y = x < 0 ? 0.09 : lower + 0.09;
    plane(x, x + 0.6, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z + (x > 0 ? 12 * F : 0), y, '#898f86');
  }
  for (const z of [-2 * F, 5.4 * F]) {
    plane(-28 * F, -1, z, z + 0.6, 0.09, '#8e9489');
    plane(HOLLYWOOD_RUN + 1, HOLLYWOOD_RUN + 32 * F, z, z + 0.6, lower + 0.09, '#8e9489');
  }

  // Solid outside cheek: a narrow concrete slope, not a second staircase.
  const cheekOuter = HOLLYWOOD_LEFT_Z - 0.65 * F;
  const cheekTop = (x: number) => Math.max(lower + 0.4 * F, Math.min(0.4 * F, hollywoodNosing(x) + 0.15 * F));
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
  buildStreet(props, ground, tube);
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
}

type Tube = (spine: Vec3[], radius: number, color: string, detail?: Ink, sides?: number, cast?: boolean) => void;

/** Welded mesh atop the upper retaining cheek, black spear fence below. */
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
  const fenceZ = HOLLYWOOD_LEFT_Z - 0.95 * F;
  const fenceTop = lower + 6.5 * F;
  for (const y of [lower + 16, fenceTop - 18]) tube([[-42 * F, y, fenceZ], [HOLLYWOOD_RUN + 12 * F, y, fenceZ]], 1.5, '#424e49', ink(73, 6));
  for (let x = -42 * F; x < HOLLYWOOD_RUN + 12 * F; x += 17) {
    tube([[x, lower + 8, fenceZ], [x, fenceTop, fenceZ]], 1.1, '#424e49', ink(73, 6), 5);
    props.tube([[x, fenceTop - 2, fenceZ], [x, fenceTop + 7, fenceZ]], [2.7, 0.1], { color: '#424e49' }, NO_INK, 4, true);
  }
}

/** Parking stripes, billboard backs, curbs and palms give the set its tightly
 * urban Highland Avenue context without closing the ride-away; parked cars
 * stand in the bays (HOLLYWOOD_CARS). */
function buildStreet(props: Bake, ground: Bake, tube: Tube) {
  const z = HOLLYWOOD_LEFT_Z - 7 * F;
  for (let i = 0; i < 8; i++) {
    const x = -32 * F + i * 8.5 * F;
    ground.quad([x, lower + 0.06, z - 15 * F], [x + 1.8, lower + 0.06, z - 15 * F], [x + 1.8, lower + 0.06, z - 1 * F], [x, lower + 0.06, z - 1 * F], up, lit('#c4c1a1', up), NO_INK);
  }
  // Blue parking sign appears over the upper landing in classic footage.
  const signX = -24 * F, signZ = z - 9 * F;
  for (const x of [signX, signX + 150]) tube([[x, lower, signZ], [x, 195, signZ]], 3.8, '#70796e', ink(122, 7));
  props.box([signX - 21, 116, signZ - 3], [signX + 171, 229, signZ + 3], '#3d5354', '#425758', ink(124, 8));
  props.quad([signX - 16, 122, signZ + 3.2], [signX + 166, 122, signZ + 3.2], [signX + 166, 223, signZ + 3.2], [signX - 16, 223, signZ + 3.2], [0, 0, 1], { color: '#365c71' }, NO_INK);
  // Both faces have plain sign lettering, visible from either camera side.
  for (const face of [signZ - 3.3, signZ + 3.3]) {
    lettering(props, 'PUBLIC', signX + 9, 193, face, 3.1, '#dddcca');
    lettering(props, 'PARKING', signX - 3, 160, face, 3.1, '#dddcca');
  }
  // Distant billboards are blank weathered color fields, avoiding fictional
  // advertisements while keeping their observed high urban silhouettes.
  for (const [x, zz, h, width] of [[-52 * F, -31 * F, 25 * F, 22 * F], [-70 * F, -16 * F, 31 * F, 15 * F]]) {
    tube([[x, lower, zz], [x, h, zz]], 9, '#655e52', ink(128, 5));
    props.box([x - width / 2, h - 5 * F, zz - 7], [x + width / 2, h + 5 * F, zz + 7], '#8e9690', '#a5ada3', ink(130, 5));
    props.box([x - width / 2 + 4, h - 5 * F + 4, zz + 7.2], [x + width / 2 - 4, h + 5 * F - 4, zz + 7.4], '#76898b', '#76898b', NO_INK);
    for (let xx = x - width / 2; xx < x + width / 2; xx += 100) tube([[xx, h - 5 * F - 4, zz + 18], [xx, h - 5 * F + 8, zz + 18]], 2, '#666f63', NO_INK, 6);
  }
  // Low distant businesses beyond the parking apron.
  for (let i = 0; i < 5; i++) {
    const x = -64 * F + i * 23 * F;
    const zz = -66 * F;
    const h = 12 * F + random(i) * 11 * F;
    props.box([x, lower, zz - 18 * F], [x + 21 * F, lower + h, zz], '#a9aea1', '#bfc2b1', ink(135, 4));
    props.box([x - 5, lower + h - 4, zz - 18 * F - 5], [x + 21 * F + 5, lower + h + 6, zz + 5], '#8b978b', '#bbc0b0', NO_INK);
    for (let window = 0; window < 5; window++) props.box([x + 25 + window * 115, lower + 35, zz + 0.1], [x + 106 + window * 115, lower + 136, zz + 0.5], '#5c7371', '#5c7371', NO_INK);
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
 * (props/streetProps.ts) where the set's broadleaf trees stood, turned so
 * no two show the same side.
 */
const HOLLYWOOD_TREES = [[-17, -16, 22, 20], [-40, -16, 25, 140], [-67, -17, 23, 250], [30, 25, 24, 75]]
  .map(([x, z, height, yaw]) => ({ at: [x * F, lower, z * F] as Vec3, height: height * F, yaw }));

/** Parked cars, nose in or out, in the bays beside the parking stripes: everyday colors, sun-faded. */
const HOLLYWOOD_CARS = ([
  [-24, 'sedan', 90, '#9aa3a6'], [-15, 'suv', -90, '#2d3438'], [-4, 'hatchback', 90, '#d9d7cf'], [5, 'sedan', -90, '#6b2a2c'], [17, 'suv', 90, '#4f5b66'],
] as const).map(([x, model, yaw, paint]) => ({
  at: [x * F, lower, HOLLYWOOD_LEFT_Z - 15.3 * F] as Vec3, yaw, model, paint,
}));

/** True three-dimensional palm fronds. */
function buildTrees(props: Bake, tube: Tube) {
  for (const [x, z, height] of [[-8 * F, -29 * F, 44 * F], [-59 * F, -37 * F, 37 * F]]) {
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

// Compact block lettering on actual signs, baked into the same prop mesh.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
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
      streetProps: { trees: HOLLYWOOD_TREES, cars: HOLLYWOOD_CARS },
      tripods: {
        bottom: { u: HOLLYWOOD_RUN + 23 * F, z: HOLLYWOOD_LEFT_Z + 1.6 * F, height: lower + 2.8 * F, frame: 24 * F, place: 0.43 },
        side: { u: HOLLYWOOD_RUN + 6 * F, z: HOLLYWOOD_LEFT_Z - 14 * F, height: lower + 7 * F, frame: 23 * F, place: 0.53 },
        top: { u: -3 * F, z: HOLLYWOOD_LEFT_Z + 1.1 * F, height: 6.5 * F, frame: 19 * F, place: 0.48 },
      },
    });
  }
}

export const buildHollywood3D = () => new Hollywood3D();
