import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Texture,
} from 'three';
import { X0 } from '../TrickAnimation';
import { PALETTE, lambert, tone } from '../scene/camera';
import { mixHex, type V3 } from '../scene/math';
import { hash2 } from '../scene/setKit';
import { FOOT, RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, nosingLine, stairGround } from '../scene/stairs';
import { Bake, bakedMaterial, type Ink, type Paint } from './bake';
import { INK_PROP, SUN, glslRgb, skyMaterial } from './materials';
import type { StageFrame } from './stage';
import { ASPHALT, type StageView, type Vec3 } from './view';

/**
 * El Toro's 20 stair in 3D (scene/stairs.ts has its size and the flight
 * down it). Looking up from the bottom, as every photo of it does: the hill
 * on the left with its handrail along the stairs, the double rail splitting
 * the steps into two sections, and the wider right section against a
 * concrete side wall with its own rail, the school's block building at the
 * top. The rider takes the left section, the famous one, and the camera
 * films from the hill's side. No yellow gate at the top.
 *
 * Every step is real geometry the rider drops past. The ground — landings,
 * treads and risers with their anti-slip nosings, the hill, the planter —
 * is one surface material that takes its shadows from two places: the
 * handrails' and posts' cast analytically per pixel (so their zigzag runs
 * down every step), and the rider's from the renderer's shadow pass, which
 * lays it at one level (StageFrame.stairs.shadowY); each pixel finds its own
 * by casting itself along the sun onto that level.
 *
 * The set is built for each way the stairs can fall (a fakie trick rolls the
 * other way down them) and slid with the street.
 */

// ----- Layout: distances down the stairs (u, from the lip), across the set (z, toward the camera), heights over the top landing -----

/** The skated section runs from the hill (its near edge) to the double rail; the rider's lane is its middle. */
const NEAR_EDGE = 6 * FOOT;
const CENTER_Z = -6 * FOOT;
/** Half the gap between the two rails of the double rail. */
const CENTER_GAP = 17;
/** The far section is twenty feet wide, out to the side wall. */
const WALL_Z = CENTER_Z - 20 * FOOT;
const WALL_THICK = 20;
const WALL_H = 1.5 * FOOT;
const HILL_RAIL_Z = NEAR_EDGE - 24;
const FAR_RAIL_Z = WALL_Z + 24;
/** Galvanized pipe, 36" handrails and a mid rail, as the code wants them. */
const RAIL_R = 2.4;
const RAIL_TOP = 3 * FOOT;
const RAIL_MID = 1.5 * FOOT;
/** The double rail's lower bar, joined to the top one by a U at each end. */
const RAIL_LOW = RAIL_TOP - 25;
/** Level runs the side rails make past the top and bottom steps. */
const RAIL_EXT = 35;
/** Posts, at these distances down the stairs. */
const POSTS = [0.5, 6.5, 12.5, 18.5].map((k) => k * TREAD);
/** The hill lies just under the steps' inner corners, so their ends stand out of the dirt. */
const HILL_DROP = 0.55 * RISER;
/** The side wall runs from a little before the lip to a little past the bottom step. */
const WALL_U0 = -60;
const WALL_U1 = STAIR_RUN + 60;
/** The bed planted along the wall's far side. */
const BED = 70;
/** The school building at the top: block walls, a row of doors, a flat roof with a trim. */
const BUILDING_U0 = -1250;
const BUILDING_U1 = -650;
const BUILDING_Z0 = -1150;
const BUILDING_Z1 = 140;
const BUILDING_H = 12 * FOOT;
/** The landings and the slopes beside the stairs run off toward the horizon. */
const FAR = 30000;
/** With no trick down the stairs (a grind on the top landing), the lip waits this far ahead, out of reach. */
const LIP_AWAY = 3200;

/** The embankment either side of the stairs: level with each landing, sloping with the steps between. */
const hill = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u) - HILL_DROP));
/** The side wall's top: a foot and a half over the steps, level over each landing. */
const wallTop = (u: number) => Math.max(-STAIR_DROP, Math.min(0, nosingLine(u))) + WALL_H;

const ET = {
  concrete: '#e9e0d3',
  joint: '#cbbba8',
  tread: '#efe8de',
  riser: '#e1d9ce',
  nosing: '#c7b48c',
  dirt: '#cfa884',
  wall: '#ddd4c8',
  planter: '#a8bc8a',
  grass: '#c5bf92',
  rail: '#a6a9ba',
  railLit: '#dcdee8',
  block: '#dcbd93',
  blockTop: '#c4b2a2',
  trim: '#8e7d77',
  door: '#5d88c6',
  trunk: PALETTE.trunk,
  leafDark: tone(PALETTE.tree, 0.2),
  leafLit: tone(PALETTE.tree, 0.62),
  shrubDark: '#6f9a6a',
  shrubLit: '#9cc08a',
} as const;

/** Surface kinds the ground material paints. */
const CONCRETE = 0;
const TREAD_KIND = 1;
const RISER_KIND = 2;
const DIRT = 3;
const WALL = 4;
const PLANTER = 5;
const GRASS = 6;

const PROP_INK = 0.5;
const prop = (id: number, priority: number, solid = 0): Ink => ({ id, priority, width: PROP_INK, kind: INK_PROP, solid });
const GROUND_INK: Ink = { id: 0, priority: 0, width: 0, kind: 0 };
const STAIR_INK = prop(40, 4, 6);
const HILL_INK = prop(30, 2);
const PLANTER_INK = prop(32, 2);

/** Most rail and post segments whose shadows the ground casts. */
const MAX_RAILS = 72;

/** The ground's own geometry: positions, normals, a surface kind, and an ink record per vertex. */
class Surfaces {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly kind: number[] = [];
  private readonly info: number[] = [];

  triangle(a: Vec3, b: Vec3, c: Vec3, n: Vec3, kind: number, ink: Ink) {
    for (const p of [a, b, c]) {
      this.position.push(...p);
      this.normal.push(...n);
      this.kind.push(kind);
      this.info.push(ink.id / 255, ink.priority / 255, Math.min(ink.width, 4) / 4, (ink.kind + 4 * (ink.solid ?? 0)) / 255);
    }
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, kind: number, ink: Ink) {
    this.triangle(a, b, c, n, kind, ink);
    this.triangle(a, c, d, n, kind, ink);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normal, 3));
    g.setAttribute('aKind', new Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aInfo', new Float32BufferAttribute(this.info, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const SURFACE_VERT = /* glsl */ `
in float aKind;
in vec4 aInfo;
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
flat out float vKind;
flat out vec4 vInfo;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  // The set only ever slides, so its normals are already the world's.
  vNormal = normal;
  vKind = aKind;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SURFACE_FRAG = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in float vKind;
flat in vec4 vInfo;
// Three declares this one only for the vertex stage; it fills it in here too.
uniform mat4 projectionMatrix;
uniform sampler2D uShadow;
uniform vec3 uShadowOpacity;
uniform float uShadowY;
uniform float uRailShadow;
uniform vec4 uRailA[${MAX_RAILS}];
uniform vec4 uRailB[${MAX_RAILS}];
uniform int uRails;
/** Where on the ground (x0, x1, z0, z1) any rail's shadow can fall: elsewhere they aren't looked for. */
uniform vec4 uRailBox;
/** Which way the stairs fall in x, so a pixel knows how far down them it is. */
uniform float uDir;
uniform float uPxPerUnit;

const vec3 SUN = vec3(${SUN.x.toFixed(5)}, ${SUN.y.toFixed(5)}, ${SUN.z.toFixed(5)});
const vec3 WARM = ${glslRgb(PALETTE.warm)};
const vec3 COOL = ${glslRgb(PALETTE.cool)};
const vec3 SHADOW = ${glslRgb(PALETTE.shadow)};
const vec3 HORIZON = ${glslRgb(PALETTE.horizon)};
const vec3 CONCRETE = ${glslRgb(ET.concrete)};
const vec3 JOINT = ${glslRgb(ET.joint)};
const vec3 TREAD = ${glslRgb(ET.tread)};
const vec3 RISER = ${glslRgb(ET.riser)};
const vec3 NOSING = ${glslRgb(ET.nosing)};
const vec3 DIRT = ${glslRgb(ET.dirt)};
const vec3 WALL = ${glslRgb(ET.wall)};
const vec3 PLANTER = ${glslRgb(ET.planter)};
const vec3 GRASS = ${glslRgb(ET.grass)};
const float TREAD_DEPTH = ${TREAD.toFixed(4)};
const float RISER_H = ${RISER.toFixed(4)};

vec3 tone(vec3 base, float lam) {
  return lam >= 0.5 ? mix(base, WARM, (lam - 0.5) * 2.0 * 0.32) : mix(base, COOL, (0.5 - lam) * 2.0 * 0.42);
}
float lambert(vec3 n) { return clamp(0.5 + 0.5 * dot(n, SUN), 0.0, 1.0); }

/** Coverage of a band of a coordinate between lo and hi, antialiased. */
float band(float x, float lo, float hi) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x));
}

/** Coverage of a line of constant coordinate repeating every period, 1.2 viewBox units wide on screen. */
float jointLine(float coord, float period) {
  float d = coord - period * floor(coord / period + 0.5);
  float distPx = abs(d) / max(length(vec2(dFdx(coord), dFdy(coord))), 1e-5);
  return clamp(0.6 * uPxPerUnit - distPx + 0.5, 0.0, 1.0);
}

/** How much the rails and posts shade this point: the sun's ray from it passing within a pipe's radius. */
float railShadow(vec3 p) {
  if (p.x < uRailBox.x || p.x > uRailBox.y || p.z < uRailBox.z || p.z > uRailBox.w) return 0.0;
  float best = 0.0;
  for (int i = 0; i < ${MAX_RAILS}; i++) {
    if (i >= uRails) break;
    vec3 a = uRailA[i].xyz;
    vec3 seg = uRailB[i].xyz - a;
    float r = uRailA[i].w;
    float len2 = max(dot(seg, seg), 1e-4);
    // Closest approach of the ray p + s SUN (s > 0) to the segment, by alternating projections.
    float t = clamp(dot(p - a, seg) / len2, 0.0, 1.0);
    float s = max(0.0, dot(a + t * seg - p, SUN));
    t = clamp(dot(p + s * SUN - a, seg) / len2, 0.0, 1.0);
    s = max(0.0, dot(a + t * seg - p, SUN));
    if (s <= 0.0) continue;
    float d = length(p + s * SUN - (a + t * seg));
    // A penumbra that widens with the distance to the pipe.
    float soft = 0.5 + 0.012 * s;
    best = max(best, 1.0 - smoothstep(r - soft, r + soft, d));
  }
  return best;
}

/** The rider's, board's, and bar's shadows: this pixel cast along the sun onto their level, looked up where it lands on screen. */
vec3 riderShadow() {
  vec3 at = vWorld + ((uShadowY - vWorld.y) / SUN.y) * SUN;
  vec4 clip = projectionMatrix * viewMatrix * vec4(at, 1.0);
  if (clip.w <= 0.0) return vec3(0.0);
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return texture(uShadow, uv).rgb;
}

void main() {
  vec3 n = normalize(vNormal);
  float u = uDir * vLocal.x;
  float h = vLocal.y;
  float z = vLocal.z;
  vec3 base;
  if (vKind < 0.5) {
    base = CONCRETE;
    // Slab joints near the stairs, and the top step's nosing along the lip.
    if (abs(z) < 1400.0 && u > -1300.0 && u < ${(STAIR_RUN + 2600).toFixed(1)}) {
      float joints = max(jointLine(u, ${(5 * FOOT).toFixed(1)}), jointLine(z, ${(5 * FOOT).toFixed(1)}));
      base = mix(base, JOINT, 0.7 * joints);
    }
    if (h > -1.0 && z < ${NEAR_EDGE.toFixed(1)} && z > ${WALL_Z.toFixed(1)}) base = mix(base, NOSING, band(-u, 1.2, 5.5));
  } else if (vKind < 1.5) {
    // Each tread's anti-slip nosing, an inch back from its edge.
    base = mix(TREAD, NOSING, band(mod(-u, TREAD_DEPTH), 1.2, 5.5));
  } else if (vKind < 2.5) {
    // Each riser darkens into the corner at its foot.
    float fromFoot = mod(h, RISER_H);
    base = mix(RISER, SHADOW, 0.2 * (1.0 - smoothstep(0.0, 0.45 * RISER_H, fromFoot)));
  } else if (vKind < 3.5) {
    base = DIRT;
  } else if (vKind < 4.5) {
    base = WALL;
  } else if (vKind < 5.5) {
    base = PLANTER;
  } else {
    base = GRASS;
  }
  vec3 color = tone(base, lambert(n));

  // Cast shadows, only on faces turned toward the sun (the rest are in shade already).
  vec3 s = riderShadow();
  float rail = uRailShadow * railShadow(vLocal);
  float a = 1.0 - (1.0 - rail) * (1.0 - uShadowOpacity.x * s.r) * (1.0 - uShadowOpacity.y * s.g) * (1.0 - uShadowOpacity.z * s.b);
  a *= smoothstep(-0.05, 0.25, dot(n, SUN));
  color = mix(color, SHADOW, a);

  // Air: far ground fades into the horizon.
  float dist = length(vWorld - cameraPosition);
  color = mix(color, HORIZON, 0.85 * smoothstep(1800.0, 11000.0, dist));
  outColor = vec4(color, 1.0);
  outInfo = vInfo;
}
`;

function surfaceMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    uniforms: {
      uShadow: { value: null },
      uShadowOpacity: { value: new Vector3() },
      uShadowY: { value: 0 },
      uRailShadow: { value: 0.3 },
      uRailA: { value: Array.from({ length: MAX_RAILS }, () => new Vector4()) },
      uRailB: { value: Array.from({ length: MAX_RAILS }, () => new Vector4()) },
      uRails: { value: 0 },
      uRailBox: { value: new Vector4() },
      uDir: { value: 1 },
      uPxPerUnit: { value: 1 },
    },
    side: DoubleSide,
  });
}

/** A face lit by the sun, as TrickScene lights its props: three's normal, so the physics one flips y. */
const lit = (hex: string, n: Vec3): Paint => ({ color: tone(hex, lambert({ x: n[0], y: -n[1], z: n[2] } as V3)) });

/** One way down: everything built in the world for stairs falling toward `dir` in x. */
interface Build {
  group: Group;
  surface: ShaderMaterial;
}

function buildSet(dir: 1 | -1, solid: ShaderMaterial): Build {
  const X = (u: number) => dir * u;
  const P = (u: number, h: number, z: number): Vec3 => [X(u), h, z];
  const up: Vec3 = [0, 1, 0];
  const downhill: Vec3 = [dir, 0, 0];
  const slope = RISER / TREAD;
  const slopeN = ((): Vec3 => {
    const m = Math.hypot(slope, 1);
    return [(dir * slope) / m, 1 / m, 0];
  })();
  const ground = new Surfaces();
  const props = new Bake();
  const rails: Array<[Vec3, Vec3]> = [];

  /** A strip of ground between two distances down the stairs, across z0..z1, at heights h(u). */
  const strip = (u0: number, u1: number, z0: number, z1: number, h0: number, h1: number, n: Vec3, kind: number, ink: Ink) =>
    ground.quad(P(u0, h0, z0), P(u1, h1, z0), P(u1, h1, z1), P(u0, h0, z1), n, kind, ink);

  // ----- The landings, out to the horizon, cut round the stairs and the slopes beside them -----
  // Where the hill leaves the top landing and meets the bottom one.
  const hillTop = -HILL_DROP / slope;
  const hillFoot = (STAIR_DROP - HILL_DROP) / slope;
  strip(-FAR, 0, WALL_Z - WALL_THICK, NEAR_EDGE, 0, 0, up, CONCRETE, GROUND_INK);
  strip(-FAR, hillTop, NEAR_EDGE, FAR, 0, 0, up, CONCRETE, GROUND_INK);
  strip(-FAR, hillTop, -FAR, WALL_Z - WALL_THICK, 0, 0, up, CONCRETE, GROUND_INK);
  strip(STAIR_RUN, FAR, WALL_Z - WALL_THICK, NEAR_EDGE, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);
  strip(hillFoot, FAR, NEAR_EDGE, FAR, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);
  strip(hillFoot, FAR, -FAR, WALL_Z - WALL_THICK, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);

  // ----- The steps: twenty risers, nineteen treads, and their ends standing out of the hill -----
  for (let k = 1; k <= STAIR_STEPS; k++) {
    const u = (k - 1) * TREAD;
    strip(u, u, WALL_Z, NEAR_EDGE, -(k - 1) * RISER, -k * RISER, downhill, RISER_KIND, STAIR_INK);
    if (k < STAIR_STEPS) strip(u, u + TREAD, WALL_Z, NEAR_EDGE, -k * RISER, -k * RISER, up, TREAD_KIND, STAIR_INK);
  }
  for (let k = 0; k < STAIR_STEPS; k++) {
    // The part of step k's end above the dirt: from where the hill crosses its tread out to its nosing.
    const h = -k * RISER;
    const end = k * TREAD;
    ground.triangle(P(end - HILL_DROP / slope, h, NEAR_EDGE), P(end, h, NEAR_EDGE), P(end, h - HILL_DROP, NEAR_EDGE), [0, 0, 1], WALL, STAIR_INK);
  }

  // ----- The embankment either side: the hill by the skated section, and past the side wall a planted bed -----
  const wz0 = WALL_Z - WALL_THICK;
  strip(hillTop, hillFoot, NEAR_EDGE, FAR, 0, -STAIR_DROP, slopeN, DIRT, HILL_INK);
  strip(hillTop, hillFoot, -FAR, wz0 - BED, 0, -STAIR_DROP, slopeN, GRASS, HILL_INK);
  strip(hillTop, hillFoot, wz0 - BED, wz0, 0, -STAIR_DROP, slopeN, PLANTER, PLANTER_INK);

  // ----- The side wall -----
  const wallInk = (face: number) => prop(50 + face, 6 + face, 9);
  const breaks = [WALL_U0, 0, STAIR_DROP / slope, WALL_U1];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const [a, b] = [breaks[i], breaks[i + 1]];
    // Its face toward the stairs runs from below the steps (hidden under them) up to its top.
    ground.quad(P(a, -STAIR_DROP - 10, WALL_Z), P(b, -STAIR_DROP - 10, WALL_Z), P(b, wallTop(b), WALL_Z), P(a, wallTop(a), WALL_Z), [0, 0, 1], WALL, wallInk(0));
    strip(a, b, wz0, WALL_Z, wallTop(a), wallTop(b), i === 1 ? slopeN : up, WALL, wallInk(1));
  }
  for (const [u, floor, n] of [[WALL_U0, 0, [-dir, 0, 0]], [WALL_U1, -STAIR_DROP, [dir, 0, 0]]] as Array<[number, number, Vec3]>) {
    ground.quad(P(u, floor, wz0), P(u, floor, WALL_Z), P(u, wallTop(u), WALL_Z), P(u, wallTop(u), wz0), n, WALL, wallInk(2));
  }

  // ----- Handrails: galvanized pipe, posts standing on the steps -----
  const pipe: Paint = { color: ET.rail, lit: { color: ET.railLit, from: 0.15, to: 2 } };
  const tube = (pts: Array<[number, number]>, z: number, ink: Ink) => {
    const spine = pts.map(([u, h]) => P(u, h, z));
    props.tube(spine, spine.map(() => RAIL_R), pipe, ink, 10, false);
    for (let i = 0; i + 1 < spine.length; i++) rails.push([spine[i], spine[i + 1]]);
  };
  const post = (u: number, from: number, to: number, z: number, ink: Ink) => {
    const a = P(u, from, z);
    const b = P(u, to, z);
    props.tube([a, b], [RAIL_R, RAIL_R], pipe, ink, 10, true);
    rails.push([a, b]);
  };
  const bottom = nosingLine(STAIR_RUN);
  /** A side rail: a top rail that levels off past each end and posts down to the ground there, and a mid rail. */
  const sideRail = (z: number, ink: Ink) => {
    tube([[-RAIL_EXT, RAIL_TOP], [0, RAIL_TOP], [STAIR_RUN, bottom + RAIL_TOP], [STAIR_RUN + RAIL_EXT, bottom + RAIL_TOP]], z, ink);
    tube([[POSTS[0], nosingLine(POSTS[0]) + RAIL_MID], [POSTS[3], nosingLine(POSTS[3]) + RAIL_MID]], z, ink);
    post(-RAIL_EXT, 0, RAIL_TOP, z, ink);
    post(STAIR_RUN + RAIL_EXT, -STAIR_DROP, bottom + RAIL_TOP, z, ink);
    for (const u of POSTS) post(u, stairGround(u), nosingLine(u) + RAIL_TOP, z, ink);
  };
  /** One rail of the double rail: a top and a lower bar joined by a U at each end. */
  const centerRail = (z: number, ink: Ink) => {
    const r = (RAIL_TOP - RAIL_LOW) / 2;
    const loop = (u: number, out: number) => Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI / 2 - (i / 8) * Math.PI;
      return [u + out * r * Math.cos(a), nosingLine(u) + RAIL_LOW + r + r * Math.sin(a)] as [number, number];
    });
    const top = loop(0, -1);
    const foot = loop(STAIR_RUN, 1);
    tube([...top.slice().reverse().slice(0, 8), [0, RAIL_TOP], [STAIR_RUN, bottom + RAIL_TOP], ...foot.slice(1)], z, ink);
    tube([[0, RAIL_LOW], [STAIR_RUN, bottom + RAIL_LOW]], z, ink);
    for (const u of POSTS) post(u, stairGround(u), nosingLine(u) + RAIL_TOP, z, ink);
  };
  sideRail(HILL_RAIL_Z, prop(60, 10));
  centerRail(CENTER_Z + CENTER_GAP, prop(62, 11));
  centerRail(CENTER_Z - CENTER_GAP, prop(64, 12));
  sideRail(FAR_RAIL_Z, prop(66, 13));

  // ----- The school building at the top -----
  const bx = [X(BUILDING_U0), X(BUILDING_U1)].sort((a, b) => a - b);
  props.box([bx[0], 0, BUILDING_Z0], [bx[1], BUILDING_H, BUILDING_Z1], ET.block, ET.blockTop, prop(70, 6, 10), 'tfkle');
  const ex = [X(BUILDING_U1 - 2), X(BUILDING_U1 + 40)].sort((a, b) => a - b);
  props.box([ex[0], BUILDING_H - 16, BUILDING_Z0 - 20], [ex[1], BUILDING_H + 2, BUILDING_Z1 + 20], ET.trim, ET.trim, prop(76, 12, 11), 'tbfkle');
  const front = X(BUILDING_U1) + dir * 0.3;
  const facing: Vec3 = [dir, 0, 0];
  for (let i = 0; i < 6; i++) {
    const zc = BUILDING_Z0 + 150 + i * 190;
    const half = 1.5 * FOOT;
    props.quad([front, 0, zc - half], [front, 0, zc + half], [front, 7 * FOOT, zc + half], [front, 7 * FOOT, zc - half], facing, lit(ET.door, facing), prop(82 + (i % 2), 8));
  }

  // ----- Trees behind the wall and the building, shrubs along the planter -----
  const tree = (u: number, z: number, seed: number) => {
    const foot = hill(u);
    const r = 38 + 22 * hash2(seed, 0, 51);
    const trunkH = 70 + 50 * hash2(seed, 0, 52);
    props.tube([P(u, foot, z), P(u, foot + trunkH + r * 0.5, z)], [4.5, 3.2], { color: ET.trunk }, prop(99, 5), 8, false);
    const crown = P(u, foot + trunkH + r, z);
    props.disc(crown, 0, 0, r, { color: ET.leafDark }, prop(100 + (seed % 100), 6), r * 0.9);
    props.disc(crown, r * 0.16, r * 0.14, r * 0.8, { color: ET.leafLit }, prop(100 + (seed % 100), 6), r * 0.9 + 0.5);
  };
  let seed = 0;
  // Rows of them, thinning out with distance, so the slope reads as planted ground.
  for (const [row, from, to, gap] of [[330, -1900, STAIR_RUN + 2600, 230], [800, -2600, STAIR_RUN + 3200, 300], [1500, -3400, STAIR_RUN + 4200, 380]]) {
    for (let u = from; u < to; u += gap + 120 * hash2(seed, 1, 53)) {
      const at = u + 60 * hash2(seed, 2, 54);
      const z = WALL_Z - row - 220 * hash2(seed, 3, 55);
      // None inside the building.
      if (!(at > BUILDING_U0 - 60 && at < BUILDING_U1 + 60 && z > BUILDING_Z0 - 60)) tree(at, z, seed);
      seed++;
    }
  }
  /** A shrub: a dark ball with its lit side nudged toward the sun, sat on the slope. */
  const shrub = (u: number, z: number, r: number, id: number) => {
    const c = P(u, hill(u) + r * 0.45, z);
    props.disc(c, 0, 0, r, { color: ET.shrubDark }, prop(id, 7), r);
    props.disc(c, r * 0.2, r * 0.22, r * 0.72, { color: ET.shrubLit }, prop(id, 7), r + 0.4);
  };
  // A hedge along the bed behind the wall…
  for (let u = 0; u < STAIR_RUN; u += 34) {
    const k = Math.round(u / 34);
    shrub(u, WALL_Z - WALL_THICK - 22 - (BED - 44) * hash2(k, 1, 57), 11 + 6 * hash2(k, 0, 56), 210 + (k % 8));
  }
  // …and bushes in clumps on the hill, clear of its rail.
  for (let k = 0; k < 14; k++) {
    const u = 30 + (STAIR_RUN - 60) * hash2(k, 0, 58);
    shrub(u, NEAR_EDGE + 110 + 260 * hash2(k, 1, 59), 14 + 10 * hash2(k, 2, 60), 218 + (k % 8));
  }

  if (rails.length > MAX_RAILS) throw new Error(`El Toro has ${rails.length} rail segments to cast; the ground looks for ${MAX_RAILS}.`);
  const surface = surfaceMaterial();
  const su = surface.uniforms;
  su.uDir.value = dir;
  su.uRails.value = rails.length;
  // The rails' shadows reach at most their height along the sun, back and across from them.
  const reach = (RAIL_TOP + RISER) / SUN.y;
  const xs = rails.flatMap(([a, b]) => [a[0], b[0]]);
  const zs = rails.flatMap(([a, b]) => [a[2], b[2]]);
  (su.uRailBox.value as Vector4).set(
    Math.min(...xs) - reach * Math.abs(SUN.x) - 10,
    Math.max(...xs) + reach * Math.abs(SUN.x) + 10,
    Math.min(...zs) - reach * Math.abs(SUN.z) - 10,
    Math.max(...zs) + reach * Math.abs(SUN.z) + 10,
  );
  rails.forEach(([a, b], i) => {
    (su.uRailA.value as Vector4[])[i].set(a[0], a[1], a[2], RAIL_R);
    (su.uRailB.value as Vector4[])[i].set(b[0], b[1], b[2], 0);
  });
  const group = new Group();
  const groundMesh = new Mesh(ground.geometry(), surface);
  const propMesh = new Mesh(props.geometry(), solid);
  for (const m of [groundMesh, propMesh]) m.frustumCulled = false;
  groundMesh.renderOrder = -50;
  group.add(groundMesh, propMesh);
  return { group, surface };
}

export class ElToro3D {
  readonly group = new Group();
  /** No see-through overlays; the rails' shadows are cast per pixel, not in the shadow pass. */
  readonly overlay = new Group();
  readonly overlayMaterials: ShaderMaterial[] = [];
  readonly shadowGeometry = null;
  readonly propInk = mixHex(PALETTE.ink, PALETTE.concrete, 0.4);
  private readonly sky = skyMaterial();
  private readonly solid = bakedMaterial();
  private readonly builds = new Map<1 | -1, Build>();

  constructor() {
    // Rails and the building are built mirrored for a fakie trick: draw both faces.
    this.solid.side = DoubleSide;
    const skyGeometry = new BufferGeometry();
    skyGeometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const sky = new Mesh(skyGeometry, this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    this.group.add(sky);
  }

  private build(dir: 1 | -1): Build {
    let build = this.builds.get(dir);
    if (!build) {
      build = buildSet(dir, this.solid);
      this.builds.set(dir, build);
      this.group.add(build.group);
    }
    return build;
  }

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number], frame?: StageFrame) {
    const stairs = frame?.stairs ?? null;
    const dir = stairs?.dir ?? 1;
    const build = this.build(dir);
    for (const b of this.builds.values()) b.group.visible = b === build;
    build.group.position.x = -scroll + (stairs ? 0 : dir * LIP_AWAY);
    const u = build.surface.uniforms;
    u.uShadow.value = shadow;
    u.uShadowOpacity.value.set(...shadowOpacity);
    u.uShadowY.value = stairs?.shadowY ?? 0;
    u.uRailShadow.value = shadowOpacity[0];
    u.uPxPerUnit.value = size.height / view.box.height;

    const { cam, box } = view;
    const s = this.sky.uniforms;
    s.uBox.value.set(box.x, box.y, box.width, box.height);
    s.uRes.value.set(size.width, size.height);
    s.uHorizon.value = cam.horizonY;
    s.uPlazaNear.value = cam.project({ x: X0, y: ASPHALT, z: 120 }).y;
    s.uCloudDrift.value = scroll * cam.drift * 0.015;
    s.uFarShift.value = scroll * cam.drift * 0.03;
    s.uNearShift.value = scroll * cam.drift * 0.06;
  }

  dispose() {
    this.sky.dispose();
    this.solid.dispose();
    for (const b of this.builds.values()) b.surface.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  }
}
