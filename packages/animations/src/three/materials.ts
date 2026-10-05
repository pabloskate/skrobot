import { CustomBlending, DoubleSide, GLSL3, MaxEquation, OneFactor, ShaderMaterial, Vector2, Vector3, Vector4, type IUniform } from 'three';
import { LIGHT, LIGHT_SCREEN, PALETTE, tone } from '../camera/camera';
import { dirToThree } from '../camera/view';

/**
 * Materials for TrickScene3D: two cel tones per robot part (tone(color, 0.18)
 * in shadow, tone(color, 0.6) lit), a lambert ramp on the board, the bar,
 * and the props, all from the palette's hexes (camera.ts), written straight
 * to the canvas with no color management in between.
 *
 * Every scene material writes two targets: the color, and an "ink" record —
 * which part this pixel belongs to, its paint priority, and how wide an
 * outline it casts — that the outline pass reads (see post.ts).
 */

export type RGB = [number, number, number];

export const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
};
export const vec3 = (hex: string) => new Vector3(...rgb(hex));
export const glslRgb = (hex: string) => `vec3(${rgb(hex).map((c) => c.toFixed(5)).join(', ')})`;

/** Ink classes: what color, if any, a part outlines itself in. */
export const INK_NONE = 0;
export const INK_ROBOT = 1;
export const INK_PROP = 2;

/**
 * The ink record a part writes: its id (0 is the sky and the ground, which
 * never outline), paint priority, outline width (world units), and ink
 * class. Faces of one solid (a box, the deck) share a `solid` number (below
 * GARMENT): where two of them meet the edge is inked by priority alone, so
 * the line runs unbroken along it. Pieces of one garment (a tee and its
 * sleeves) share a `garment` number instead: where they meet there's no
 * line at all, only where one passes clearly in front of the other.
 * Garments numbered from FEATURES up are the features of a face (the skull,
 * its nose and ears), which outline themselves over a much smaller step.
 */
export function inkInfo(id: number, priority: number, width: number, ink: number, into = new Vector4(), solid = 0, garment = 0): Vector4 {
  const surface = garment > 0 ? GARMENT + garment : solid;
  return into.set(id / 255, priority / 255, Math.min(width, 4) / 4, (ink + 4 * surface) / 255);
}

/** Where garment numbers start in the ink record's surface field; solids number below it. */
export const GARMENT = 32;
/** Garment numbers from here up are a face's features: see inkInfo. */
export const FEATURES = 16;

/**
 * The cel light, in view space: up and to the right on screen, like
 * LIGHT_SCREEN's crescents, tipped toward the viewer. A surface is lit where
 * it faces the light more than TOON_THRESHOLD; the rim it turns away from it
 * is the shadow crescent.
 */
const TOON_TILT = (26 * Math.PI) / 180;
export const TOON_LIGHT = new Vector3(
  Math.sin(TOON_TILT) * LIGHT_SCREEN.x,
  -Math.sin(TOON_TILT) * LIGHT_SCREEN.y,
  Math.cos(TOON_TILT),
).normalize();
export const TOON_THRESHOLD = 0.4;

/** The sun, in three's world. */
export const SUN = new Vector3(...dirToThree(LIGHT)).normalize();

const GLSL_TONE = /* glsl */ `
const vec3 WARM = ${glslRgb(PALETTE.warm)};
const vec3 COOL = ${glslRgb(PALETTE.cool)};
const vec3 SUN = vec3(${SUN.x.toFixed(5)}, ${SUN.y.toFixed(5)}, ${SUN.z.toFixed(5)});
vec3 tone(vec3 base, float lam) {
  return lam >= 0.5
    ? mix(base, WARM, (lam - 0.5) * 2.0 * 0.32)
    : mix(base, COOL, (0.5 - lam) * 2.0 * 0.42);
}
float lambert(vec3 n) { return clamp(0.5 + 0.5 * dot(n, SUN), 0.0, 1.0); }
`;

export const GLSL_TARGETS = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
`;

export const GLSL_TOON = /* glsl */ `
const vec3 TOON_LIGHT = vec3(${TOON_LIGHT.x.toFixed(5)}, ${TOON_LIGHT.y.toFixed(5)}, ${TOON_LIGHT.z.toFixed(5)});
const float TOON_THRESHOLD = ${TOON_THRESHOLD.toFixed(4)};
/** 0 in the shadow crescent, 1 lit, antialiased across the terminator. */
float toonLit(vec3 viewNormal) {
  float ndl = dot(normalize(viewNormal), TOON_LIGHT);
  float w = max(fwidth(ndl), 1e-4);
  return smoothstep(TOON_THRESHOLD - w, TOON_THRESHOLD + w, ndl);
}
`;

type Uniforms = Record<string, IUniform>;

export function sceneMaterial(vertexShader: string, fragmentShader: string, uniforms: Uniforms, extra: Partial<ShaderMaterial> = {}) {
  return Object.assign(new ShaderMaterial({ glslVersion: GLSL3, vertexShader, fragmentShader, uniforms }), extra);
}

// ---------- Robot parts ----------

export const TOON_VERT = /* glsl */ `
out vec3 vNormal;
out vec3 vLocal;
/** World units to pull the part toward the camera in depth only (its outline on screen stays put). */
uniform float uDepthBias;
void main() {
  vLocal = position;
  vNormal = normalMatrix * normal;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  view.xyz *= 1.0 - uDepthBias / max(length(view.xyz), 1.0);
  gl_Position = projectionMatrix * view;
}
`;

const TOON_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uLit;
uniform vec3 uShade;
/**
 * Below uSplit (local y) a second paint: a shoe's sole under its upper. The
 * line climbs uRise.x toward local x, from uRise.y to uRise.z: a toe cap.
 */
uniform vec3 uLit2;
uniform vec3 uShade2;
uniform float uSplit;
uniform vec3 uRise;
uniform vec4 uInfo;
void main() {
  float lit = toonLit(vNormal);
  float split = uSplit + uRise.x * smoothstep(uRise.y, uRise.z, vLocal.x);
  float d = vLocal.y - split;
  float ws = max(fwidth(d), 1e-4);
  float upper = smoothstep(-ws, ws, d);
  vec3 shade = mix(uShade2, uShade, upper);
  vec3 bright = mix(uLit2, uLit, upper);
  outColor = vec4(mix(shade, bright, lit), 1.0);
  outInfo = uInfo;
}
`;

/** The two cel tones of a color on a rounded part. */
export const celTones = (hex: string) => ({ lit: vec3(tone(hex, 0.6)), shade: vec3(tone(hex, 0.18)) });

/**
 * A cel-shaded part in one color, or two split at a local height (`below`
 * under `split`), the line climbing `rise` between local x `from` and `to`.
 */
export function toonMaterial(hex: string, below?: { hex: string; split: number; rise?: { by: number; from: number; to: number } }) {
  const top = celTones(hex);
  const bottom = below ? celTones(below.hex) : top;
  return sceneMaterial(TOON_VERT, TOON_FRAG, {
    uLit: { value: top.lit },
    uShade: { value: top.shade },
    uLit2: { value: bottom.lit },
    uShade2: { value: bottom.shade },
    uSplit: { value: below ? below.split : -1e6 },
    uRise: { value: below?.rise ? new Vector3(below.rise.by, below.rise.from, below.rise.to) : new Vector3(0, 0, 1) },
    uInfo: { value: new Vector4() },
    uDepthBias: { value: 0 },
  });
}

/**
 * The visor and eyes, painted on a grid lying on the head's front face.
 * Shapes are drawn as distance fields in the face's (up, side) plane, with
 * no glare: the robot is matte, so the screen is too. Around them the grid shows the head's own paint, so it
 * needs no transparency.
 */
const FACE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uGlow;
uniform float uFade;
/** 0 open, 1 focus, 2 happy, 3 wince. */
uniform int uExpression;
uniform vec4 uInfo;
const vec3 SCREEN = ${glslRgb('#271f58')};

float roundRect(vec2 p, vec2 center, vec2 extent, float r) {
  float rr = min(r, min(extent.x, extent.y));
  vec2 q = abs(p - center) - (extent - rr);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float fill(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}

void main() {
  vec3 head = mix(uShade, uLit, toonLit(vNormal));
  // (side, up): the screen is laid out side to side, then up.
  vec2 p = vec2(vLocal.z, vLocal.y);
  float screen = fill(roundRect(p, vec2(0.0, -0.5), vec2(14.0, 9.6), 5.6));
  vec3 face = SCREEN;
  float eye = 1e3;
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? -1.0 : 1.0;
    float c = side * 6.2;
    float u = 0.2;
    float d;
    if (uExpression == 2) {
      d = min(segment(p, vec2(c - 2.8, u - 1.6), vec2(c, u + 1.6)), segment(p, vec2(c, u + 1.6), vec2(c + 2.8, u - 1.6))) - 0.95;
    } else if (uExpression == 3) {
      float tip = -side;
      vec2 a = vec2(c - tip * 2.2, u + 2.4);
      vec2 b = vec2(c + tip * 1.8, u);
      vec2 e = vec2(c - tip * 2.2, u - 2.4);
      d = min(segment(p, a, b), segment(p, b, e)) - 0.9;
    } else {
      d = roundRect(p, vec2(c, u), vec2(1.9, uExpression == 1 ? 1.5 : 3.1), 1.85);
    }
    eye = min(eye, d);
  }
  face = mix(face, uGlow, fill(eye));
  outColor = vec4(mix(head, face, screen * uFade), 1.0);
  outInfo = uInfo;
}
`;

export function faceMaterial(bodyHex: string, glowHex: string) {
  const tones = celTones(bodyHex);
  return sceneMaterial(TOON_VERT, FACE_FRAG, {
    uLit: { value: tones.lit },
    uShade: { value: tones.shade },
    uGlow: { value: vec3(glowHex) },
    uFade: { value: 1 },
    uExpression: { value: 0 },
    uInfo: { value: new Vector4() },
    uDepthBias: { value: 0 },
  }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// ---------- The board ----------

const WORLD_VERT = /* glsl */ `
out vec3 vLocal;
out vec3 vWorld;
out vec3 vWorldNormal;
out vec3 vLocalNormal;
void main() {
  vLocal = position;
  vLocalNormal = normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const DECK_VERT = /* glsl */ `
in float kind;
flat out int vKind;
${WORLD_VERT.replace('void main() {', 'void main() {\n  vKind = int(kind + 0.5);')}
`;

const DECK_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TONE}
flat in int vKind;
in vec3 vLocal;
in vec3 vWorldNormal;
uniform vec3 uGrip;
uniform vec3 uGraphic;
uniform vec3 uStripe;
uniform vec3 uPly;
uniform vec4 uInfoGrip;
uniform vec4 uInfoUnder;
uniform vec4 uInfoPly;
float inside(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}
void main() {
  if (vKind == 0) {
    outColor = vec4(uGrip, 1.0);
    outInfo = uInfoGrip;
  } else if (vKind == 1) {
    // The printed stripe down the middle of the underside.
    float stripe = inside(max(abs(vLocal.z) - 3.2, abs(vLocal.x) - 30.0));
    outColor = vec4(mix(uGraphic, uStripe, stripe), 1.0);
    outInfo = uInfoUnder;
  } else {
    outColor = vec4(tone(uPly, lambert(normalize(vWorldNormal))), 1.0);
    outInfo = uInfoPly;
  }
}
`;

export function deckMaterial() {
  return sceneMaterial(DECK_VERT, DECK_FRAG, {
    uGrip: { value: new Vector3() },
    uGraphic: { value: new Vector3() },
    uStripe: { value: new Vector3() },
    uPly: { value: vec3(PALETTE.ply) },
    uInfoGrip: { value: new Vector4() },
    uInfoUnder: { value: new Vector4() },
    uInfoPly: { value: new Vector4() },
  });
}

const WHEEL_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TONE}
in vec3 vLocal;
in vec3 vWorld;
in vec3 vWorldNormal;
in vec3 vLocalNormal;
uniform float uRadius;
/** Roll angle, and the angle swept over one displayed frame (radians). */
uniform float uAngle;
uniform float uSweep;
uniform vec4 uInfo;
const vec3 WHEEL = ${glslRgb(PALETTE.wheel)};
const vec3 METAL = ${glslRgb(PALETTE.metal)};
const vec3 INK = ${glslRgb(PALETTE.ink)};
const float PI = 3.14159265;
const float MARK_R = 0.72;
const float MARK_HALF_W = 0.16;
const float MARK_ARC = 34.0 * PI / 180.0;
const float MAX_SWEEP = 300.0 * PI / 180.0;
void main() {
  if (abs(vLocalNormal.z) < 0.5) {
    outColor = vec4(tone(WHEEL, 0.3), 1.0);
    outInfo = uInfo;
    return;
  }
  vec3 n = normalize(vWorldNormal);
  float lam = lambert(n);
  vec3 cap = tone(WHEEL, lam);
  // Hub and mark fade toward edge-on.
  float detail = clamp(dot(normalize(cameraPosition - vWorld), n) / 0.35, 0.0, 1.0);
  float r = length(vLocal.xy) / uRadius;
  float aa = length(fwidth(vLocal.xy)) / uRadius;
  float a = atan(vLocal.x, vLocal.y);
  // The mark: head at the roll angle, its tail smeared back over the sweep.
  float sweep = clamp(uSweep, -MAX_SWEEP, MAX_SWEEP);
  float lead = sweep >= 0.0 ? 1.0 : -1.0;
  float head = uAngle + lead * MARK_ARC / 2.0;
  float tail = uAngle - sweep - lead * MARK_ARC / 2.0;
  float span = head - tail;
  float d = a - tail;
  d = span >= 0.0 ? mod(d, 2.0 * PI) : -mod(-d, 2.0 * PI);
  float u = d / span;
  float half_ = MARK_HALF_W * (0.3 + 0.7 * clamp(u, 0.0, 1.0));
  float across = abs(r - MARK_R) - half_;
  float alongOut = max(-u, u - 1.0) * abs(span) * MARK_R;
  float mark = 1.0 - smoothstep(-aa, aa, max(across, alongOut));
  vec3 color = mix(cap, mix(cap, INK, 0.3), mark * detail);
  color = mix(color, tone(METAL, lam), (1.0 - smoothstep(0.44 - aa, 0.44 + aa, r)) * detail);
  color = mix(color, INK, (1.0 - smoothstep(0.15 - aa, 0.15 + aa, r)) * detail);
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function wheelMaterial(radius: number) {
  return sceneMaterial(WORLD_VERT, WHEEL_FRAG, {
    uRadius: { value: radius },
    uAngle: { value: 0 },
    uSweep: { value: 0 },
    uInfo: { value: new Vector4() },
  });
}

// ---------- Boxes: the bar, its posts, the plaza's ledges ----------

const BOX_VERT = /* glsl */ `
in float face;
flat out int vFace;
${WORLD_VERT.replace('void main() {', 'void main() {\n  vFace = int(face + 0.5);')}
`;

const BOX_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TONE}
flat in int vFace;
in vec3 vLocal;
in vec3 vWorldNormal;
uniform vec3 uSide;
uniform vec3 uTop;
/** A painted band along the top of the front (+z) face, uLip deep; 0 for none. */
uniform vec3 uLipColor;
uniform float uLip;
uniform float uTopY;
/** Ink record of face 0; each face is its own part (one id and priority up per face), so every edge is inked. */
uniform vec4 uInfo;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 color = tone(vFace == 2 ? uTop : uSide, lambert(n));
  if (vFace == 4 && uLip > 0.0) {
    float w = max(fwidth(vLocal.y), 1e-4) * 0.75;
    color = mix(color, uLipColor, smoothstep(uTopY - uLip - w, uTopY - uLip + w, vLocal.y));
  }
  outColor = vec4(color, 1.0);
  outInfo = vec4(uInfo.xy + float(vFace) / 255.0, uInfo.zw);
}
`;

export function boxMaterial(sideHex: string, topHex = sideHex, lip?: { hex: string; depth: number; topY: number }) {
  return sceneMaterial(BOX_VERT, BOX_FRAG, {
    uSide: { value: vec3(sideHex) },
    uTop: { value: vec3(topHex) },
    uLipColor: { value: lip ? vec3(lip.hex) : new Vector3() },
    uLip: { value: lip?.depth ?? 0 },
    uTopY: { value: lip?.topY ?? 0 },
    uInfo: { value: new Vector4() },
  });
}

/** A flat color (a tree trunk), outlined like a prop. */
const FLAT_FRAG = /* glsl */ `
${GLSL_TARGETS}
uniform vec3 uColor;
uniform vec4 uInfo;
void main() {
  outColor = vec4(uColor, 1.0);
  outInfo = uInfo;
}
`;

export function flatMaterial(hex: string) {
  return sceneMaterial(TOON_VERT, FLAT_FRAG, { uColor: { value: vec3(hex) }, uInfo: { value: new Vector4() }, uDepthBias: { value: 0 } });
}

/**
 * Round billboards: a tree's canopy (a dark disc with its lit disc nudged
 * toward the sun), sitting a radius in front of its
 * center so the trunk tucks behind it. Instanced: center + radius per tree.
 */
const CANOPY_VERT = /* glsl */ `
in vec4 aCanopy;
in float aId;
out vec2 vCorner;
flat out float vId;
void main() {
  vCorner = position.xy;
  vId = aId;
  vec4 center = modelViewMatrix * vec4(aCanopy.xyz, 1.0);
  float r = aCanopy.w;
  float dist = length(center.xyz);
  // Pull the disc to the sphere's front, scaled so its outline stays put.
  vec3 front = center.xyz * (1.0 - r / dist);
  float k = (dist - r) / dist;
  gl_Position = projectionMatrix * vec4(front + vec3(position.xy * r * 1.04 * k, 0.0), 1.0);
}
`;

const CANOPY_FRAG = /* glsl */ `
${GLSL_TARGETS}
in vec2 vCorner;
flat in float vId;
uniform vec3 uDark;
uniform vec3 uLit;
uniform vec4 uInfo;
const vec2 LIGHT_DIR = vec2(${LIGHT_SCREEN.x.toFixed(4)}, ${(-LIGHT_SCREEN.y).toFixed(4)});
void main() {
  vec2 p = vCorner * 1.04;
  float d = length(p) - 1.0;
  float w = max(fwidth(d), 1e-4);
  if (d > w) discard;
  float lit = 1.0 - smoothstep(-w, w, length(p - vec2(0.16, 0.14)) - 0.8);
  outColor = vec4(mix(uDark, uLit, lit), 1.0);
  outInfo = vec4(vId / 255.0, uInfo.yzw);
}
`;

export function canopyMaterial(darkHex: string, litHex: string) {
  return sceneMaterial(CANOPY_VERT, CANOPY_FRAG, {
    uDark: { value: vec3(darkHex) },
    uLit: { value: vec3(litHex) },
    uInfo: { value: new Vector4() },
  });
}

// ---------- The plaza's ground and sky ----------

/** Turns a fragment into the crane's viewBox coordinates. */
const GLSL_VIEWBOX = /* glsl */ `
uniform vec4 uBox;
uniform vec2 uRes;
vec2 viewBoxAt(vec2 frag) {
  return vec2(uBox.x + frag.x / uRes.x * uBox.z, uBox.y + (1.0 - frag.y / uRes.y) * uBox.w);
}
/** Vertical gradient between two screen rows, clamped like an SVG gradient. */
float rowMix(float y, float from, float to) {
  return clamp((y - from) / (to - from), 0.0, 1.0);
}
`;

const GLSL_HAZE = /* glsl */ `
const vec3 HORIZON = ${glslRgb(PALETTE.horizon)};
uniform float uHorizon;
vec3 haze(vec3 color, float y) {
  float t = (y - (uHorizon - 34.0)) / 50.0;
  if (t < 0.0 || t > 1.0) return color;
  float a = t < 0.7 ? 0.5 * t / 0.7 : 0.5 * (1.0 - t) / 0.3;
  return mix(color, HORIZON, a);
}
`;

const FULLSCREEN_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export interface SkyRows {
  /** viewBox row where the plaza's concrete reaches its near color. */
  plazaNear: number;
  lawnNear: number;
}

const SKY_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_VIEWBOX}
${GLSL_HAZE}
uniform float uCloudDrift;
uniform float uFarShift;
uniform float uNearShift;
uniform float uPlazaNear;
const vec3 SKY_TOP = ${glslRgb(PALETTE.skyTop)};
const vec3 SKY_MID = ${glslRgb(PALETTE.skyMid)};
const vec3 SKY_LOW = ${glslRgb(PALETTE.skyLow)};
const vec3 SUN = ${glslRgb(PALETTE.sun)};
const vec3 CLOUD = ${glslRgb('#fffaf1')};
const vec3 CITY_FAR = ${glslRgb(PALETTE.cityFar)};
const vec3 CITY_NEAR = ${glslRgb(PALETTE.cityNear)};
const vec3 CONCRETE = ${glslRgb(PALETTE.concrete)};
const vec3 CONCRETE_FAR = ${glslRgb(PALETTE.concreteFar)};
const float W = 500.0;
const float VIEW_TOP = -64.0;

float roundRect(vec2 p, vec2 lo, vec2 size, float r) {
  vec2 half_ = size * 0.5;
  vec2 q = abs(p - (lo + half_)) - (half_ - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Skyline blocks: x, width, height, repeating every period.
const vec3 FAR_BLOCKS[17] = vec3[17](
  vec3(0, 44, 38), vec3(40, 30, 58), vec3(66, 52, 30), vec3(116, 26, 72), vec3(140, 48, 44), vec3(186, 36, 52),
  vec3(224, 60, 26), vec3(282, 30, 64), vec3(310, 46, 40), vec3(352, 28, 84), vec3(378, 54, 34), vec3(430, 40, 56),
  vec3(468, 62, 30), vec3(528, 34, 48), vec3(560, 44, 66), vec3(602, 58, 36), vec3(658, 42, 50)
);
const vec3 NEAR_BLOCKS[11] = vec3[11](
  vec3(0, 58, 22), vec3(54, 34, 40), vec3(86, 70, 18), vec3(150, 40, 30), vec3(196, 66, 16), vec3(258, 30, 46),
  vec3(286, 60, 24), vec3(342, 44, 34), vec3(384, 76, 14), vec3(456, 38, 38), vec3(492, 56, 20)
);

float skyline(vec2 p, float shift, float period, int which, float px) {
  float cover = 0.0;
  float offset = mod(shift, period);
  int count = which == 0 ? 17 : 11;
  for (int i = 0; i < 17; i++) {
    if (i >= count) break;
    vec3 b = which == 0 ? FAR_BLOCKS[i] : NEAR_BLOCKS[i];
    float m = mod(p.x + offset - b.x, period);
    float inX = clamp(min(m, b.y - m) / px + 0.5, 0.0, 1.0);
    float inY = clamp(min(p.y - (uHorizon - b.z), uHorizon + 2.0 - p.y) / px + 0.5, 0.0, 1.0);
    cover = max(cover, inX * inY);
  }
  return cover;
}

void main() {
  vec2 p = viewBoxAt(gl_FragCoord.xy);
  float px = uBox.z / uRes.x;
  vec3 color;
  if (p.y < uHorizon + 2.0) {
    float t = rowMix(p.y, VIEW_TOP, uHorizon);
    color = t < 0.55 ? mix(SKY_TOP, SKY_MID, t / 0.55)
      : t < 0.88 ? mix(SKY_MID, SKY_LOW, (t - 0.55) / 0.33)
      : mix(SKY_LOW, HORIZON, (t - 0.88) / 0.12);
    // The sun glowing just off the right of the stock frame.
    float g = length(p - vec2(W + 30.0, uHorizon - 70.0)) / 300.0;
    float glow = g < 0.35 ? mix(0.95, 0.45, g / 0.35) : g < 1.0 ? mix(0.45, 0.0, (g - 0.35) / 0.65) : 0.0;
    color = mix(color, SUN, glow);
    // Cloud banks: a long base and a puff or two on top, drifting slowly.
    float cloud = 1e3;
    vec3 clouds[4] = vec3[4](vec3(30, 128, 120), vec3(270, 160, 150), vec3(470, 104, 96), vec3(640, 142, 130));
    for (int i = 0; i < 4; i++) {
      vec3 c = clouds[i];
      float base = mod(c.x - uCloudDrift, 760.0) - 120.0;
      float cx = base + 760.0 * floor((p.x - base + 380.0 - c.z * 0.5) / 760.0);
      float y = uHorizon - c.y;
      float w = c.z;
      cloud = min(cloud, roundRect(p, vec2(cx, y), vec2(w, 9.0), 4.5));
      cloud = min(cloud, roundRect(p, vec2(cx + w * 0.18, y - 7.0), vec2(w * 0.42, 12.0), 6.0));
      cloud = min(cloud, roundRect(p, vec2(cx + w * 0.5, y - 4.0), vec2(w * 0.3, 9.0), 4.5));
    }
    color = mix(color, CLOUD, 0.62 * clamp(0.5 - cloud / px, 0.0, 1.0));
    color = mix(color, CITY_FAR, skyline(p, uFarShift, 700.0, 0, px));
    color = mix(color, CITY_NEAR, skyline(p, uNearShift, 560.0, 1, px));
  }
  if (p.y >= uHorizon) {
    vec3 ground = mix(CONCRETE_FAR, CONCRETE, rowMix(p.y, uHorizon, uPlazaNear));
    color = p.y < uHorizon + 2.0 ? mix(color, ground, clamp((p.y - uHorizon) / px + 0.5, 0.0, 1.0)) : ground;
  }
  outColor = vec4(haze(color, p.y), 1.0);
  outInfo = vec4(0.0);
}
`;

export function skyMaterial() {
  return sceneMaterial(FULLSCREEN_VERT, SKY_FRAG, {
    uBox: { value: new Vector4() },
    uRes: { value: new Vector2() },
    uHorizon: { value: 0 },
    uCloudDrift: { value: 0 },
    uFarShift: { value: 0 },
    uNearShift: { value: 0 },
    uPlazaNear: { value: 0 },
  }, { depthTest: false, depthWrite: false });
}

export interface GroundLayout {
  lawnZ: number;
  farZ: number;
  jointFromZ: number;
  jointToZ: number;
  crossFromZ: number;
  crossToZ: number;
  slab: number;
  x0: number;
}

export function groundMaterial(layout: GroundLayout) {
  const frag = /* glsl */ `
${GLSL_TARGETS}
${GLSL_VIEWBOX}
${GLSL_HAZE}
in vec3 vWorld;
uniform float uPlazaNear;
uniform float uLawnNear;
uniform float uScroll;
uniform float uPxPerUnit;
uniform sampler2D uShadow;
uniform vec3 uShadowOpacity;
const vec3 CONCRETE = ${glslRgb(PALETTE.concrete)};
const vec3 CONCRETE_FAR = ${glslRgb(PALETTE.concreteFar)};
const vec3 LAWN = ${glslRgb(PALETTE.lawn)};
const vec3 LAWN_FAR = ${glslRgb(PALETTE.lawnFar)};
const vec3 JOINT = ${glslRgb(PALETTE.joint)};
const vec3 SHADOW = ${glslRgb(PALETTE.shadow)};

/** Coverage of a line of constant world coordinate, 1.3 viewBox units wide on screen. */
float jointLine(float coord, float period, float phase) {
  float d = coord - phase - period * floor((coord - phase) / period + 0.5);
  vec2 g = vec2(dFdx(coord), dFdy(coord));
  float distPx = abs(d) / max(length(g), 1e-5);
  return clamp(0.65 * uPxPerUnit - distPx + 0.5, 0.0, 1.0);
}

void main() {
  vec2 p = viewBoxAt(gl_FragCoord.xy);
  float z = vWorld.z;
  if (z < ${layout.farZ.toFixed(1)}) discard;
  vec3 color;
  if (z < ${layout.lawnZ.toFixed(1)}) {
    color = mix(LAWN_FAR, LAWN, rowMix(p.y, uHorizon, uLawnNear));
  } else {
    color = mix(CONCRETE_FAR, CONCRETE, rowMix(p.y, uHorizon, uPlazaNear));
  }
  color = haze(color, p.y);
  // Slab joints: rows across the plaza, and lines along it that scroll with the street.
  float joints = 0.0;
  if (z > ${layout.jointFromZ.toFixed(1)} - 1.0 && z < ${layout.jointToZ.toFixed(1)}) {
    joints = max(joints, jointLine(z, ${layout.slab.toFixed(1)}, ${layout.jointFromZ.toFixed(1)}));
  }
  if (z > ${layout.crossFromZ.toFixed(1)} && z < ${layout.crossToZ.toFixed(1)}) {
    joints = max(joints, jointLine(vWorld.x + ${layout.x0.toFixed(1)} + uScroll, ${layout.slab.toFixed(1)}, 0.0));
  }
  color = mix(color, JOINT, 0.8 * joints);
  // Cast shadows of the bar, the board, and the rider, softened.
  vec3 s = texture(uShadow, gl_FragCoord.xy / uRes).rgb;
  float a = 1.0 - (1.0 - uShadowOpacity.x * s.r) * (1.0 - uShadowOpacity.y * s.g) * (1.0 - uShadowOpacity.z * s.b);
  outColor = vec4(mix(color, SHADOW, a), 1.0);
  outInfo = vec4(0.0);
}
`;
  const vert = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
  return sceneMaterial(vert, frag, {
    uBox: { value: new Vector4() },
    uRes: { value: new Vector2() },
    uHorizon: { value: 0 },
    uPlazaNear: { value: 0 },
    uLawnNear: { value: 0 },
    uScroll: { value: 0 },
    uPxPerUnit: { value: 1 },
    uShadow: { value: null },
    uShadowOpacity: { value: new Vector3() },
  });
}

// ---------- Shadow shapes (drawn into their own target) ----------

/**
 * Ground shadow shapes: each writes its layer's channel — the bar, the board,
 * the rider, and a set's props in the fourth — overlaps merging by max, so
 * a shadow is one even shade however its parts overlap.
 */
export function shadowShapeMaterial() {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 channel;
      varying vec4 vChannel;
      void main() {
        vChannel = channel;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vChannel;
      void main() { gl_FragColor = vChannel; }
    `,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: MaxEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
  });
}
