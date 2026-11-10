import { Vector2, Vector4 } from 'three';
import { PALETTE } from '../../camera/camera';
import { mixHex } from '../../math';
import { celTones, GLSL_TARGETS, GLSL_TOON, glslRgb, sceneMaterial, TOON_VERT, vec3 } from '../../three/materials';
import { DRUM_BELT_TOP, DRUM_COLLAR, LENS } from './windupParts';

/**
 * The wind-up robot's paint. A tin toy's detail is printed on, so beyond
 * the two cel tones every part carries (three/materials.ts) these draw
 * lithographed lines and panels as distance fields in the part's own axes:
 * the seam round the head, the lit lens, the dial on the chest, the folds
 * of a sleeve.
 *
 * Each one lights itself with toonLit and names its base tones uLit and
 * uShade, which is what the cinematic finish looks for (three/cinematic.ts).
 */

const f = (n: number) => n.toFixed(4);

const GLSL_PAINT = /* glsl */ `
const vec3 INK = ${glslRgb(PALETTE.ink)};
float fill(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float box(vec2 p, vec2 center, vec2 extent, float r) {
  float rr = min(r, min(extent.x, extent.y));
  vec2 q = abs(p - center) - (extent - rr);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
}
`;

const HEADER = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec4 uInfo;
${GLSL_PAINT}
`;

const base = (hex: string) => {
  const tones = celTones(hex);
  return {
    uLit: { value: tones.lit },
    uShade: { value: tones.shade },
    uInfo: { value: new Vector4() },
    uDepthBias: { value: 0 },
  };
};

// ---------- The head ----------

/** Half the width of a printed line (world units): a little under the outline's, so paint sits back from the silhouette. */
const LINE = 0.42;

/**
 * The head's shell: two pressings crimped together round the middle, the
 * seam running from the key's socket down through each ear.
 */
export function shellMaterial(hex: string) {
  const seam = celTones(mixHex(hex, PALETTE.ink, 0.42));
  return sceneMaterial(TOON_VERT, /* glsl */ `
${HEADER}
uniform vec3 uSeamLit;
uniform vec3 uSeamShade;
void main() {
  float lit = toonLit(vNormal);
  float seam = fill(abs(vLocal.x) - ${f(LINE)});
  outColor = vec4(mix(mix(uShade, uLit, lit), mix(uSeamShade, uSeamLit, lit), seam), 1.0);
  outInfo = uInfo;
}
`, { ...base(hex), uSeamLit: { value: seam.lit }, uSeamShade: { value: seam.shade } });
}

/** The glass, and what glows behind it. */
const GLASS = '#271f58';
/** The iris's radius, its pupil's, and how far the iris can wander off the lens's middle. */
export const IRIS = { r: 4.9, pupil: 2.2, reach: 1.9 } as const;

/**
 * The eye: a turned barrel with a dark lens in it, and behind the glass an
 * iris that shows the rider's face. Open, a lit ring round a pupil,
 * looking where the rider looks (`uLook`, in the lens's side and up);
 * focused, the same ring under a lowered lid; happy, an arch; a wince, a
 * cross. The mood is `uMood`: the cinematic finish reads a uniform named
 * uExpression as the robot's visor.
 */
export function eyeMaterial(barrelHex: string, glowHex: string) {
  return sceneMaterial(TOON_VERT, /* glsl */ `
${HEADER}
uniform vec3 uGlow;
/** 0 open, 1 focus, 2 happy, 3 wince. */
uniform int uMood;
uniform vec2 uLook;
const vec3 GLASS = ${glslRgb(GLASS)};
void main() {
  vec3 barrel = mix(uShade, uLit, toonLit(vNormal));
  // (side, up) across the lens.
  vec2 p = vec2(vLocal.z, vLocal.y);
  float r = length(p);
  float glass = fill(r - ${f(LENS.r)});
  float d;
  float pupil = 0.0;
  if (uMood == 2) {
    // An arch: the top of a ring.
    d = max(abs(length(p - vec2(0.0, -1.4)) - 3.9) - 1.15, -(p.y + 0.6));
  } else if (uMood == 3) {
    d = min(segment(p, vec2(-3.2, 3.2), vec2(3.2, -3.2)), segment(p, vec2(-3.2, -3.2), vec2(3.2, 3.2))) - 1.05;
  } else {
    vec2 q = p - uLook;
    d = length(q) - ${f(IRIS.r)};
    // Focused, a lid comes down over the top of it.
    if (uMood == 1) d = max(d, q.y - 1.5);
    pupil = fill(length(q) - ${f(IRIS.pupil)});
  }
  vec3 lens = mix(GLASS, uGlow, fill(d));
  lens = mix(lens, GLASS, pupil);
  // The lip's shadow line round the glass.
  vec3 c = mix(barrel, lens, glass);
  c = mix(c, INK, fill(abs(r - ${f(LENS.r)}) - ${f(LINE)}));
  outColor = vec4(c, 1.0);
  outInfo = uInfo;
}
`, { ...base(barrelHex), uGlow: { value: vec3(glowHex) }, uMood: { value: 0 }, uLook: { value: new Vector2() } });
}

// ---------- The chest ----------

/** The dial: its middle up the chest, its radius, and the most its needle swings either side of straight up (rad). */
export const DIAL = { y: 8.7, r: 6.3, swing: 1.05 } as const;

/**
 * The drum: a painted body between two hoops, a pressure dial printed on
 * its front over a speaker's slots, an inspection hatch on its back. The
 * dial's needle is `uNeedle`, radians from straight up.
 */
export function drumMaterial(bodyHex: string, hoopHex: string, faceHex: string) {
  const hoop = celTones(hoopHex);
  const face = celTones(faceHex);
  const needle = mixHex(bodyHex, PALETTE.ink, 0.12);
  return sceneMaterial(TOON_VERT, /* glsl */ `
${HEADER}
uniform vec3 uHoopLit;
uniform vec3 uHoopShade;
uniform vec3 uFaceLit;
uniform vec3 uFaceShade;
uniform float uNeedle;
const vec3 NEEDLE = ${glslRgb(needle)};
const vec2 DIAL = vec2(0.0, ${f(DIAL.y)});
void main() {
  float lit = toonLit(vNormal);
  vec3 body = mix(uShade, uLit, lit);
  float y = vLocal.y;
  float hoops = max(fill(y - ${f(DRUM_BELT_TOP)}), fill(${f(DRUM_COLLAR)} - y));
  vec3 c = mix(body, mix(uHoopShade, uHoopLit, lit), hoops);
  float lines = min(abs(y - ${f(DRUM_BELT_TOP)}), abs(y - ${f(DRUM_COLLAR)})) - ${f(LINE)};

  // (side, up) on the front and the back.
  vec2 p = vec2(vLocal.z, y);
  float front = smoothstep(-0.5, 0.5, vLocal.x);
  float back = 1.0 - front;

  // The dial.
  vec2 q = p - DIAL;
  float rim = length(q) - ${f(DIAL.r)};
  c = mix(c, mix(uFaceShade, uFaceLit, lit), fill(rim) * front);
  float marks = 1e3;
  for (int i = -2; i <= 2; i++) {
    float a = float(i) * ${f(DIAL.swing / 2)};
    vec2 dir = vec2(sin(a), cos(a));
    marks = min(marks, segment(q, dir * ${f(DIAL.r - 2.1)}, dir * ${f(DIAL.r - 1.2)}) - 0.3);
  }
  vec2 tip = vec2(sin(uNeedle), cos(uNeedle)) * ${f(DIAL.r - 2.2)};
  float hand = segment(q, -tip * 0.22, tip) - 0.5;
  // Two slots of the speaker under it.
  float slots = min(
    box(p, vec2(0.0, ${f(DIAL.y - DIAL.r - 2.5)}), vec2(5.2, 0.55), 0.55),
    box(p, vec2(0.0, ${f(DIAL.y - DIAL.r - 4.7)}), vec2(4.1, 0.55), 0.55));
  float printed = min(min(abs(rim) - ${f(LINE)}, marks), slots);
  c = mix(c, NEEDLE, fill(hand) * front);
  c = mix(c, INK, fill(min(printed, length(q) - 1.05)) * front);

  // The hatch, screwed down at its corners.
  vec2 hatch = vec2(0.0, 6.4);
  float door = abs(box(p, hatch, vec2(7.4, 8.2), 2.6)) - ${f(LINE * 0.8)};
  vec2 screw = abs(p - hatch) - vec2(5.0, 5.8);
  c = mix(c, mix(body, INK, 0.55), fill(min(door, length(screw) - 0.75)) * back);

  c = mix(c, INK, fill(lines));
  outColor = vec4(c, 1.0);
  outInfo = uInfo;
}
`, {
    ...base(bodyHex),
    uHoopLit: { value: hoop.lit },
    uHoopShade: { value: hoop.shade },
    uFaceLit: { value: face.lit },
    uFaceShade: { value: face.shade },
    uNeedle: { value: 0 },
  });
}

// ---------- Sleeves ----------

/**
 * An accordion sleeve's paint (windupParts.ts's bellowsGeometry): its folds'
 * valleys in a darker tone, the crests in the sleeve's own.
 */
export function bellowsMaterial(hex: string, valleyHex: string, pleats: number) {
  const valley = celTones(valleyHex);
  return sceneMaterial(TOON_VERT, /* glsl */ `
${HEADER}
uniform vec3 uValleyLit;
uniform vec3 uValleyShade;
void main() {
  float lit = toonLit(vNormal);
  float valley = fill(0.3 - cos(${f(2 * Math.PI * pleats)} * vLocal.x));
  outColor = vec4(mix(mix(uShade, uLit, lit), mix(uValleyShade, uValleyLit, lit), valley), 1.0);
  outInfo = uInfo;
}
`, { ...base(hex), uValleyLit: { value: valley.lit }, uValleyShade: { value: valley.shade } });
}
