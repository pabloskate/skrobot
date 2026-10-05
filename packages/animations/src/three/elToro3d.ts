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
import { PALETTE } from '../scene/camera';
import { mixHex } from '../scene/math';
import { RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, nosingLine, stairGround } from '../scene/stairs';
import { Bake, type Ink, type Paint } from './bake';
import { INK_PROP, SUN, glslRgb } from './materials';
import { EL_TORO_NOISE, elToroPropMaterial, elToroSkyMaterial } from './elToroMaterials';
import { buildElToroLandscape } from './elToroLandscape';
import { buildElToroBuilding } from './elToroBuilding';
import { buildElToroCanopy, EL_TORO_CANOPY, EL_TORO_CANOPY_COLUMNS, EL_TORO_CANOPY_ROOF_BOUNDS } from './elToroCanopy';
import type { StageFrame } from './stage';
import { type StageView, type Vec3 } from './view';
import { BED, BUILDING_BACK, BUILDING_END, BUILDING_FACE, BUILDING_H, BUILDING_LENGTH, CENTER_Z, DIRT_WIDTH, EAVE, ET, FAR, FAR_RAIL_Z, HILL_DROP, HILL_EDGE, HILL_RAIL_Z, LIP_AWAY, POSTS, RAIL_EXT, RAIL_MID, RAIL_R, RAIL_TOP, RIDER_LANE_Z, WALL_THICK, WALL_U0, WALL_U1, WALL_Z, wallTop } from './elToroLayout';

/**
 * Classic El Toro: twenty steps, a single center handrail, straight sloping
 * side rails, an exposed dirt bank, the locker school on the left and an
 * open covered walkway on the right when viewed from the landing.
 * Photo references and the user-supplied layout correction are documented
 * in docs/EL_TORO_REFERENCE.md.
 *
 * Ground, stairs and wall share weathered materials and analytical rail,
 * building and foliage shadows. Rider shadows are reprojected from the
 * renderer's shadow level onto each tread and riser. The environment is
 * built once in its canonical downhill direction. Fakie changes the rider's
 * heading in stage.ts; it never mirrors or rebuilds this location.
 */

/** Surface kinds the ground material paints. */
const CONCRETE = 0;
const TREAD_KIND = 1;
const RISER_KIND = 2;
const DIRT = 3;
const WALL = 4;
const PLANTER = 5;
const GRASS = 6;

const PROP_INK = 0.18;
const prop = (id: number, priority: number, solid = 0): Ink => ({ id, priority, width: PROP_INK, kind: INK_PROP, solid });
const GROUND_INK: Ink = { id: 0, priority: 0, width: 0, kind: 0 };
const STAIR_INK = prop(40, 4, 6);
const HILL_INK = prop(30, 2);
const PLANTER_INK = prop(32, 2);

/** Most rail and post segments whose shadows the ground casts. */
const MAX_RAILS = 32;

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
uniform vec4 uCanopy[24];
uniform int uCanopies;

const vec3 SUN = vec3(${SUN.x.toFixed(5)}, ${SUN.y.toFixed(5)}, ${SUN.z.toFixed(5)});
const vec3 WARM = ${glslRgb('#f4edcf')};
const vec3 SHADOW = ${glslRgb('#535c58')};
const vec3 HORIZON = ${glslRgb('#c6d0cc')};
const vec3 CONCRETE = ${glslRgb(ET.concrete)};
const vec3 TREAD = ${glslRgb(ET.tread)};
const vec3 RISER = ${glslRgb(ET.riser)};
const vec3 NOSING = ${glslRgb(ET.nosing)};
const vec3 DIRT = ${glslRgb(ET.dirt)};
const vec3 WALL = ${glslRgb(ET.wall)};
const vec3 PLANTER = ${glslRgb(ET.planter)};
const vec3 GRASS = ${glslRgb(ET.grass)};
const float TREAD_DEPTH = ${TREAD.toFixed(4)};
const float RISER_H = ${RISER.toFixed(4)};

${EL_TORO_NOISE}
vec3 tone(vec3 base, float lam) {
  return base * (0.73 + 0.30 * lam) + WARM * 0.025 * lam;
}
float lambert(vec3 n) { return clamp(0.5 + 0.5 * dot(n, SUN), 0.0, 1.0); }

/** Coverage of a band of a coordinate between lo and hi, antialiased. */
float band(float x, float lo, float hi) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x));
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

float rayBox(vec3 at, vec3 sun, vec3 lo, vec3 hi) {
  vec3 a = (lo - at) / sun, b = (hi - at) / sun;
  vec3 near_ = min(a, b), far_ = max(a, b);
  float enter = max(max(near_.x, near_.y), near_.z);
  float leave = min(min(far_.x, far_.y), far_.z);
  return leave > max(enter, 0.0) ? 1.0 : 0.0;
}

/** An open roof casts its slab and discrete piers, never a fictitious enclosure. */
float shelterShadow(vec3 at, vec3 sun) {
  const vec2 lo = vec2(${EL_TORO_CANOPY_ROOF_BOUNDS.min[0].toFixed(1)}, ${EL_TORO_CANOPY_ROOF_BOUNDS.min[2].toFixed(1)});
  const vec2 hi = vec2(${EL_TORO_CANOPY_ROOF_BOUNDS.max[0].toFixed(1)}, ${EL_TORO_CANOPY_ROOF_BOUNDS.max[2].toFixed(1)});
  float reach = (${(EL_TORO_CANOPY.roofTop + STAIR_DROP + 10).toFixed(1)}) / sun.y;
  vec2 shift = sun.xz * reach;
  // The envelope includes shadows on the lowest stair/landing level.
  if (any(lessThan(at.xz, min(lo, lo - shift) - 3.0)) || any(greaterThan(at.xz, max(hi, hi - shift) + 3.0))) return 0.0;
  float t = (${EL_TORO_CANOPY.roofBottom.toFixed(1)} - at.y) / sun.y;
  vec2 roof = at.xz + sun.xz * max(t, 0.0);
  float coverage = t > 0.0 ? band(roof.x, lo.x, hi.x) * band(roof.y, lo.y, hi.y) : 0.0;
  float shade = coverage * 0.38;
  if (coverage > 0.999) return shade;
  const vec4 columns[${EL_TORO_CANOPY_COLUMNS.length}] = vec4[](
    ${EL_TORO_CANOPY_COLUMNS.map(({ u, z, half, height }) => `vec4(${u.toFixed(1)}, ${z.toFixed(1)}, ${half.toFixed(1)}, ${height.toFixed(1)})`).join(',\n    ')}
  );
  for (int i = 0; i < ${EL_TORO_CANOPY_COLUMNS.length}; i++) {
    vec4 c = columns[i];
    shade = max(shade, 0.32 * rayBox(at, sun, vec3(c.x - c.z, 0.0, c.y - c.z), vec3(c.x + c.z, c.w, c.y + c.z)));
  }
  return shade;
}

/** Architecture and nearby foliage share the same sunlight as the rails. */
float environmentShadow(vec3 p) {
  vec3 sun = vec3(uDir * SUN.x, SUN.y, SUN.z);
  vec3 at = vec3(uDir * p.x, p.y, p.z);
  vec3 lo = vec3(${(BUILDING_END - BUILDING_LENGTH - EAVE).toFixed(1)}, 0.0, ${(BUILDING_FACE - EAVE).toFixed(1)});
  vec3 hi = vec3(${(BUILDING_END + EAVE).toFixed(1)}, ${BUILDING_H.toFixed(1)}, ${(BUILDING_BACK + EAVE).toFixed(1)});
  float shade = max(0.30 * rayBox(at, sun, lo, hi), shelterShadow(at, sun));
  float dapple = -1.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uCanopies) break;
    vec3 delta = uCanopy[i].xyz - p;
    float along = dot(delta, SUN);
    if (along < 0.0) continue;
    vec3 perpendicular = delta - SUN * along;
    float distance2 = dot(perpendicular, perpendicular);
    float radius = 1.15 * uCanopy[i].w;
    if (distance2 >= radius * radius) continue;
    float distance_ = sqrt(distance2) / uCanopy[i].w;
    if (dapple < 0.0) dapple = 0.68 + 0.32 * noise(p.xz * 0.14);
    shade = max(shade, (1.0 - smoothstep(0.45, 1.15, distance_)) * 0.29 * dapple);
  }
  return shade;
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
  vec2 surfaceAt = abs(n.y) > 0.55 ? vec2(u, z) : abs(n.z) > 0.5 ? vec2(u, h) : vec2(z, h);
  float mottling = weather(surfaceAt * 0.028);
  float aggregate = grain(surfaceAt * 2.2);
  vec3 base;
  if (vKind < 0.5) {
    base = CONCRETE;
    // Continuous worn concrete, without the artificial square paving grid.
    // Preserve only the physical lip where the landing meets the first step.
    if (h > -1.0 && z > ${HILL_EDGE.toFixed(1)} && z < ${WALL_Z.toFixed(1)}) base = mix(base, NOSING, band(-u, 0.0, 1.8));
  } else if (vKind < 1.5) {
    // Classic cast-concrete lips: pale worn edge, darker accumulated grit behind it.
    float fromEdge = mod(-u, TREAD_DEPTH);
    base = mix(TREAD, NOSING, band(fromEdge, 0.0, 1.6));
    float dirt = smoothstep(TREAD_DEPTH - 6.0, TREAD_DEPTH, fromEdge);
    base *= 1.0 - dirt * (0.12 + 0.10 * noise(vec2(z * 0.08, u)));
    base *= 0.97 + 0.06 * hash(vec2(floor(u / TREAD_DEPTH), 5.0));
  } else if (vKind < 2.5) {
    // Each riser darkens into the corner at its foot.
    float fromFoot = mod(h, RISER_H);
    base = mix(RISER, SHADOW, 0.2 * (1.0 - smoothstep(0.0, 0.45 * RISER_H, fromFoot)));
    float streak = weather(vec2(z * 0.055, h * 0.012));
    base *= 0.84 + 0.19 * streak;
    base = mix(base, NOSING, 0.45 * band(fromFoot, RISER_H - 1.1, RISER_H));
  } else if (vKind < 3.5) {
    base = mix(DIRT * 0.72, DIRT * 1.21, weather(vec2(u, z) * 0.047));
    base += grain(vec2(u, z) * 0.6) * 0.12;
  } else if (vKind < 4.5) {
    base = WALL * (0.89 + 0.15 * weather(surfaceAt * vec2(0.045, 0.008)));
  } else if (vKind < 5.5) {
    base = mix(DIRT, PLANTER, mottling);
  } else {
    base = mix(GRASS * 0.92, ${glslRgb('#a09f7d')}, weather(surfaceAt * 0.022) * 0.65);
    base += grain(surfaceAt * vec2(1.6, 0.35)) * 0.07;
  }
  if (vKind < 2.5 || (vKind > 3.5 && vKind < 4.5)) {
    base *= 0.91 + 0.16 * mottling;
    base += aggregate * 0.035;
    float spots = smoothstep(0.78, 0.88, noise(surfaceAt * 0.4));
    base *= 1.0 - spots * 0.045;
    // Dust and organic grime along the edges where concrete meets planting.
    float edge = 1.0 - smoothstep(0.0, 14.0, min(abs(z - ${HILL_EDGE.toFixed(1)}), abs(z - ${WALL_Z.toFixed(1)})));
    base *= 1.0 - edge * 0.13 * mottling;
  }
  vec3 color = tone(base, lambert(n));

  // Cast shadows, only on faces turned toward the sun (the rest are in shade already).
  vec3 s = riderShadow();
  float rail = uRailShadow * railShadow(vLocal);
  float a = 1.0 - (1.0 - rail) * (1.0 - environmentShadow(vLocal)) * (1.0 - uShadowOpacity.x * s.r) * (1.0 - uShadowOpacity.y * s.g) * (1.0 - uShadowOpacity.z * s.b);
  a *= smoothstep(-0.05, 0.25, dot(n, SUN));
  color = mix(color, color * vec3(0.51, 0.59, 0.65), min(a * 1.65, 0.75));

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
      uCanopy: { value: Array.from({ length: 24 }, () => new Vector4()) },
      uCanopies: { value: 0 },
    },
    side: DoubleSide,
  });
}

/** Static terrain and props, shared by every stance. */
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
  const wz1 = WALL_Z + WALL_THICK;
  strip(-FAR, 0, HILL_EDGE, wz1, 0, 0, up, CONCRETE, GROUND_INK);
  strip(-FAR, hillTop, HILL_EDGE - 90, HILL_EDGE, 0, 0, up, CONCRETE, GROUND_INK);
  // The open canopy stands on the school walkway above the planted bank.
  const apronU = EL_TORO_CANOPY.u0 - 60;
  const apronZ = EL_TORO_CANOPY.z0 - 60;
  strip(-FAR, apronU, -FAR, HILL_EDGE - 90, 0, 0, up, GRASS, HILL_INK);
  strip(apronU, hillTop, -FAR, apronZ, 0, 0, up, GRASS, HILL_INK);
  strip(apronU, hillTop, apronZ, HILL_EDGE - 90, 0, 0, up, CONCRETE, GROUND_INK);
  strip(-FAR, hillTop, wz1, BUILDING_BACK + 45, 0, 0, up, CONCRETE, GROUND_INK);
  strip(-FAR, hillTop, BUILDING_BACK + 45, FAR, 0, 0, up, GRASS, HILL_INK);
  strip(STAIR_RUN, FAR, HILL_EDGE, wz1, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);
  strip(hillFoot, FAR, -FAR, HILL_EDGE, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);
  strip(hillFoot, FAR, wz1, FAR, -STAIR_DROP, -STAIR_DROP, up, CONCRETE, GROUND_INK);

  // ----- The steps: twenty risers, nineteen treads, and their ends standing out of the hill -----
  for (let k = 1; k <= STAIR_STEPS; k++) {
    const u = (k - 1) * TREAD;
    strip(u, u, HILL_EDGE, WALL_Z, -(k - 1) * RISER, -k * RISER, downhill, RISER_KIND, STAIR_INK);
    if (k < STAIR_STEPS) strip(u, u + TREAD, HILL_EDGE, WALL_Z, -k * RISER, -k * RISER, up, TREAD_KIND, STAIR_INK);
  }
  for (let k = 0; k < STAIR_STEPS; k++) {
    // The part of step k's end above the dirt: from where the hill crosses its tread out to its nosing.
    const h = -k * RISER;
    const end = k * TREAD;
    ground.triangle(P(end - HILL_DROP / slope, h, HILL_EDGE), P(end, h, HILL_EDGE), P(end, h - HILL_DROP, HILL_EDGE), [0, 0, -1], WALL, STAIR_INK);
  }

  // ----- The embankment either side: the dirt hill by the skated section, and past the side wall a planted bed -----
  strip(hillTop, hillFoot, HILL_EDGE - DIRT_WIDTH, HILL_EDGE, 0, -STAIR_DROP, slopeN, DIRT, HILL_INK);
  strip(hillTop, hillFoot, -FAR, HILL_EDGE - DIRT_WIDTH, 0, -STAIR_DROP, slopeN, GRASS, HILL_INK);
  strip(hillTop, hillFoot, wz1, wz1 + BED, 0, -STAIR_DROP, slopeN, PLANTER, PLANTER_INK);
  strip(hillTop, hillFoot, wz1 + BED, FAR, 0, -STAIR_DROP, slopeN, GRASS, HILL_INK);

  // ----- The side wall -----
  const wallInk = (face: number) => prop(50 + face, 6 + face, 9);
  const breaks = [WALL_U0, 0, STAIR_DROP / slope, WALL_U1];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const [a, b] = [breaks[i], breaks[i + 1]];
    // Its face toward the stairs runs from below the steps (hidden under them) up to its top.
    ground.quad(P(a, -STAIR_DROP - 10, WALL_Z), P(b, -STAIR_DROP - 10, WALL_Z), P(b, wallTop(b), WALL_Z), P(a, wallTop(a), WALL_Z), [0, 0, -1], WALL, wallInk(0));
    strip(a, b, WALL_Z, wz1, wallTop(a), wallTop(b), i === 1 ? slopeN : up, WALL, wallInk(1));
  }
  for (const [u, floor, n] of [[WALL_U0, 0, [-dir, 0, 0]], [WALL_U1, -STAIR_DROP, [dir, 0, 0]]] as Array<[number, number, Vec3]>) {
    ground.quad(P(u, floor, WALL_Z), P(u, floor, wz1), P(u, wallTop(u), wz1), P(u, wallTop(u), WALL_Z), n, WALL, wallInk(2));
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
    // Embedded posts have a weathered footing collar, with small anchor heads.
    props.tube([P(u, from + 0.2, z), P(u, from + 1.1, z)], [5.1, 4.7], { color: '#747b71' }, ink, 12, true);
    for (const du of [-3.5, 3.5]) {
      props.tube([P(u + du, from + 1, z), P(u + du, from + 1.6, z)], [0.8, 0.8], { color: '#a4a698' }, ink, 6, true);
    }
    // A narrow weld at the upper joint catches a different highlight from the pipe.
    props.tube([P(u, to - 4, z), P(u, to - 2.8, z)], [RAIL_R + 0.35, RAIL_R + 0.35], { color: '#838b82' }, ink, 10, true);
    rails.push([a, b]);
  };
  /** Classic rails: one straight sloping top bar and a mid bar, with no end kinks. */
  const straightRail = (z: number, ink: Ink) => {
    const start = -RAIL_EXT;
    const end = STAIR_RUN + RAIL_EXT;
    for (const height of [RAIL_TOP, RAIL_MID]) {
      tube([[start, nosingLine(start) + height], [end, nosingLine(end) + height]], z, ink);
    }
    post(start, 0, nosingLine(start) + RAIL_TOP, z, ink);
    post(end, -STAIR_DROP, nosingLine(end) + RAIL_TOP, z, ink);
    for (const u of POSTS) post(u, stairGround(u), nosingLine(u) + RAIL_TOP, z, ink);
  };
  straightRail(HILL_RAIL_Z, prop(60, 10));
  straightRail(CENTER_Z, prop(62, 11));
  straightRail(FAR_RAIL_Z, prop(66, 13));

  buildElToroBuilding(props, dir);
  buildElToroCanopy(props, dir);

  const canopies = buildElToroLandscape(props, dir);

  if (rails.length > MAX_RAILS) throw new Error(`El Toro has ${rails.length} rail segments to cast; the ground looks for ${MAX_RAILS}.`);
  const surface = surfaceMaterial();
  const su = surface.uniforms;
  su.uDir.value = dir;
  su.uCanopies.value = Math.min(24, canopies.length);
  canopies.slice(0, 24).forEach(({ center, radius }, i) => {
    (su.uCanopy.value as Vector4[])[i].set(...center, radius);
  });
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
  // Keep the rig and camera around their shared origin while centering the
  // fixed spot on the chosen line in the left-hand flight.
  group.position.z = -RIDER_LANE_Z;
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
  private readonly sky = elToroSkyMaterial();
  private readonly solid = elToroPropMaterial();
  private built: Build | null = null;

  constructor() {
    // Rail tubes and thin fence wires are visible from either camera side.
    this.solid.side = DoubleSide;
    const skyGeometry = new BufferGeometry();
    skyGeometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const sky = new Mesh(skyGeometry, this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    this.group.add(sky);
  }

  private build(): Build {
    if (!this.built) {
      this.built = buildSet(1, this.solid);
      this.group.add(this.built.group);
    }
    return this.built;
  }

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number], frame?: StageFrame) {
    const stairs = frame?.stairs ?? null;
    const build = this.build();
    build.group.position.x = -scroll + (stairs ? 0 : LIP_AWAY);
    // Under the rider: their line down the left-hand flight, or the center rail they grind.
    build.group.position.z = -(stairs?.across ?? RIDER_LANE_Z);
    const u = build.surface.uniforms;
    u.uShadow.value = shadow;
    u.uShadowOpacity.value.set(...shadowOpacity);
    u.uShadowY.value = stairs?.shadowY ?? 0;
    u.uRailShadow.value = shadowOpacity[0];

    const s = this.sky.uniforms;
    s.uRes.value.set(size.width, size.height);
    s.uFrustum.value.set(view.frustum.left, view.frustum.right, view.frustum.bottom, view.frustum.top);
    s.uRight.value.set(...view.right);
    s.uUp.value.set(...view.up);
    s.uBack.value.set(...view.back);
  }

  dispose() {
    this.sky.dispose();
    this.solid.dispose();
    this.built?.surface.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  }
}
