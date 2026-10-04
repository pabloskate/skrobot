import { DoubleSide, Vector3, Vector4 } from 'three';
import { GLSL_TARGETS, GLSL_TOON, TOON_VERT, celTones, sceneMaterial } from './materials';
import { BEANIE, PANT_HEM, TEE } from './humanGeometry';

/**
 * The skater's paint. Same cel as the robot — two tones a color, the light
 * from the same place, no highlights — with the small things that make a
 * person read painted on rather than modelled: a face, a tee's collar and
 * print, the beanie's knit, pant seams and a cargo pocket, the shoes' stripe
 * and laces. Every painted mark takes the cel light too, so nothing glows.
 */

const GLSL_PAINT = /* glsl */ `
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
/** Distance to a quadratic Bezier, sampled: plenty for a stroke a few units long. */
float arc(vec2 p, vec2 a, vec2 c, vec2 b) {
  float d = 1e3;
  vec2 prev = a;
  for (int i = 1; i <= 10; i++) {
    float t = float(i) / 10.0;
    vec2 q = mix(mix(a, c, t), mix(c, b, t), t);
    d = min(d, segment(p, prev, q));
    prev = q;
  }
  return d;
}
float ellipse(vec2 p, vec2 center, vec2 r) {
  vec2 q = (p - center) / r;
  return (length(q) - 1.0) * min(r.x, r.y);
}
float fill(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}
/** A color's cel tones, lit and shaded. */
vec3 cel(vec3 shade, vec3 lit, float l) { return mix(shade, lit, l); }
`;

type Tones = { lit: Vector3; shade: Vector3 };
const tones = (hex: string): Tones => celTones(hex);
const toneUniforms = (name: string, hex: string) => {
  const t = tones(hex);
  return { [`${name}Lit`]: { value: t.lit }, [`${name}Shade`]: { value: t.shade } };
};
const base = () => ({ uInfo: { value: new Vector4() }, uDepthBias: { value: 0 } });

// ---------- The face ----------

/**
 * The face, painted on the skull: eyes, brows, and a mouth, in the four
 * expressions the robot's visor shows. Laid out in the face's (side, up)
 * plane, on the front of the skull only; the nose is modelled, and inked by
 * the outline pass where it stands out over the cheek.
 *
 * Eyes as a grown-up's: almond openings wider than they're tall, set an eye
 * apart, the whites showing either side of a brown iris whose top the upper
 * lid covers, so the gaze is relaxed instead of a stare; the lid drawn as a
 * line that thickens to the outer corner, brows low and nearly straight over
 * them.
 */
const FACE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uSkinLit;
uniform vec3 uSkinShade;
uniform vec3 uWhiteLit;
uniform vec3 uWhiteShade;
uniform vec3 uIrisLit;
uniform vec3 uIrisShade;
uniform vec3 uPupilLit;
uniform vec3 uPupilShade;
uniform vec3 uBrowLit;
uniform vec3 uBrowShade;
uniform vec3 uMouthLit;
uniform vec3 uMouthShade;
uniform vec3 uLipLit;
uniform vec3 uLipShade;
/** 0 open, 1 focus, 2 happy, 3 wince. */
uniform int uExpression;
uniform vec4 uInfo;

/** An eye's opening, centered at c, h its half height: an almond tipped up toward the outer corner. */
float almond(vec2 m, vec2 c, float h) {
  vec2 q = m - c;
  q.y -= 0.14 * q.x;
  // Fuller over the iris than under it.
  float ry = q.y > 0.0 ? h : h * 0.72;
  return ellipse(q, vec2(0.0), vec2(1.7, ry));
}

void main() {
  float l = toonLit(vNormal);
  vec3 color = cel(uSkinShade, uSkinLit, l);
  if (vLocal.x > 0.0) {
    vec2 p = vec2(vLocal.z, vLocal.y);
    // Mirror to one side for the eyes and brows; s > 0 is outward.
    vec2 m = vec2(abs(p.x), p.y);
    float white = 1e3;
    float iris = 1e3;
    float pupil = 1e3;
    float line = 1e3;
    float brow = 1e3;
    float mouth = 1e3;
    float lip = 1e3;
    float teeth = 1e3;
    const vec2 EYE = vec2(3.75, 0.45);
    if (uExpression == 0 || uExpression == 1) {
      float h = uExpression == 1 ? 0.66 : 1.05;
      float dy = uExpression == 1 ? -0.12 : 0.0;
      vec2 c = EYE + vec2(0.0, dy);
      white = almond(m, c, h);
      // The iris sits high, so the lid covers its top.
      vec2 ic = c + vec2(-0.08, h * 0.32);
      iris = max(length(m - ic) - 0.95, white);
      pupil = max(length(m - ic) - 0.45, white);
      // The upper lid: along the top of the opening, thickening outward, past the outer corner.
      float lid = arc(m, c + vec2(-1.72, 0.02), c + vec2(-0.1, h * 2.15), c + vec2(1.85, 0.45));
      line = lid - mix(0.18, 0.38, smoothstep(c.x - 1.2, c.x + 1.7, m.x));
      if (uExpression == 0) {
        brow = arc(m, vec2(1.95, 2.55), vec2(3.7, 3.15), vec2(5.65, 2.6)) - mix(0.5, 0.3, smoothstep(2.0, 5.6, m.x));
        lip = arc(p, vec2(-2.3, -6.3), vec2(0.0, -6.95), vec2(2.3, -6.3)) - 0.27;
      } else {
        brow = arc(m, vec2(1.8, 2.2), vec2(3.6, 2.6), vec2(5.6, 2.75)) - mix(0.55, 0.32, smoothstep(2.0, 5.6, m.x));
        lip = segment(p, vec2(-1.6, -6.6), vec2(1.6, -6.6)) - 0.28;
      }
    } else if (uExpression == 2) {
      // Smiling eyes: the lids pushed up into arcs.
      line = arc(m, vec2(2.35, 0.25), vec2(3.75, 1.55), vec2(5.3, 0.45)) - 0.3;
      brow = arc(m, vec2(1.95, 2.9), vec2(3.7, 3.6), vec2(5.65, 3.0)) - mix(0.5, 0.3, smoothstep(2.0, 5.6, m.x));
      // An open grin: a straight top, a round bottom, teeth along the top.
      vec2 q = p - vec2(0.0, -6.0);
      float grin = max(q.y - 0.0, length(q / vec2(2.7, 2.0)) - 1.0);
      mouth = grin * 2.0;
      teeth = max(mouth, -(q.y + 0.65));
    } else {
      // Squeezed shut: > <.
      line = min(segment(m, vec2(2.5, 1.25), vec2(5.2, 0.45)), segment(m, vec2(2.5, -0.45), vec2(5.2, 0.45))) - 0.32;
      brow = arc(m, vec2(1.8, 3.1), vec2(3.6, 3.15), vec2(5.6, 2.3)) - 0.5;
      vec2 q = p - vec2(0.0, -6.5);
      mouth = roundRect(q, vec2(0.0), vec2(2.4, 0.9), 0.8);
      teeth = max(mouth, abs(q.y) - 0.3);
    }
    color = mix(color, cel(uWhiteShade, uWhiteLit, l), fill(white));
    color = mix(color, cel(uIrisShade, uIrisLit, l), fill(iris));
    color = mix(color, cel(uPupilShade, uPupilLit, l), fill(pupil));
    color = mix(color, cel(uLipShade, uLipLit, l), fill(lip));
    color = mix(color, cel(uMouthShade, uMouthLit, l), fill(mouth));
    color = mix(color, cel(uWhiteShade, uWhiteLit, l), fill(teeth));
    color = mix(color, cel(uBrowShade, uBrowLit, l), fill(min(line, brow)));
  }
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export interface FacePaint {
  skin: string;
  white: string;
  iris: string;
  pupil: string;
  brow: string;
  mouth: string;
  lip: string;
}

export function humanFaceMaterial(paint: FacePaint) {
  return sceneMaterial(TOON_VERT, FACE_FRAG, {
    ...toneUniforms('uSkin', paint.skin),
    ...toneUniforms('uWhite', paint.white),
    ...toneUniforms('uIris', paint.iris),
    ...toneUniforms('uPupil', paint.pupil),
    ...toneUniforms('uBrow', paint.brow),
    ...toneUniforms('uMouth', paint.mouth),
    ...toneUniforms('uLip', paint.lip),
    uExpression: { value: 0 },
    ...base(),
  });
}

// ---------- The tee ----------

const TEE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uTeeLit;
uniform vec3 uTeeShade;
uniform vec3 uRibLit;
uniform vec3 uRibShade;
uniform vec3 uPrintLit;
uniform vec3 uPrintShade;
uniform vec3 uScreenLit;
uniform vec3 uScreenShade;
uniform vec3 uGlowLit;
uniform vec3 uGlowShade;
uniform vec4 uInfo;
const float TOP = ${TEE.top.toFixed(1)};
const float HEM = ${TEE.hem.toFixed(1)};

void main() {
  // Up under the hem: the inside of the shirt, in its own shade.
  if (!gl_FrontFacing) {
    outColor = vec4(uRibShade * 0.86, 1.0);
    outInfo = uInfo;
    return;
  }
  float l = toonLit(vNormal);
  vec3 color = cel(uTeeShade, uTeeLit, l);
  // The crew neck's rib, round where the neck goes in.
  float neck = length(vLocal.xz - vec2(0.6, 0.0));
  float rib = max(abs(neck - 5.6) - 1.05, TOP - 1.5 - vLocal.y);
  // A stitched hem.
  float hem = abs(vLocal.y - (HEM + 1.7)) - 0.22;
  color = mix(color, cel(uRibShade, uRibLit, l), max(fill(rib), 0.8 * fill(hem)));
  // The print on the chest: Skate Robot's own bot, head and antenna.
  if (vLocal.x > 0.0) {
    vec2 p = vec2(vLocal.z, vLocal.y - 5.6) / 1.25;
    float head = roundRect(p, vec2(0.0), vec2(3.6, 2.8), 1.3);
    float antenna = min(segment(p, vec2(0.0, 2.6), vec2(0.0, 4.6)) - 0.32, length(p - vec2(0.0, 4.9)) - 0.75);
    float screen = roundRect(p, vec2(0.0, -0.1), vec2(2.55, 1.75), 0.9);
    float eyes = min(length(p - vec2(-1.1, -0.1)), length(p - vec2(1.1, -0.1))) - 0.48;
    color = mix(color, cel(uPrintShade, uPrintLit, l), fill(min(head, antenna)));
    color = mix(color, cel(uScreenShade, uScreenLit, l), fill(screen));
    color = mix(color, cel(uGlowShade, uGlowLit, l), fill(eyes));
  }
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

/** TOON_VERT, painting by a skinned mesh's rest pose (its `rest` attribute) instead of its posed one. */
const REST_VERT = TOON_VERT.replace('out vec3 vLocal;', 'in vec3 rest;\nout vec3 vLocal;').replace('vLocal = position;', 'vLocal = rest;');

export function teeMaterial(colors: { tee: string; rib: string; print: string; screen: string; glow: string }) {
  return sceneMaterial(REST_VERT, TEE_FRAG, {
    ...toneUniforms('uTee', colors.tee),
    ...toneUniforms('uRib', colors.rib),
    ...toneUniforms('uPrint', colors.print),
    ...toneUniforms('uScreen', colors.screen),
    ...toneUniforms('uGlow', colors.glow),
    ...base(),
  }, { side: DoubleSide });
}

/** A sleeve: the tee's color, and inside its open end the shade of the inside. */
const SLEEVE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uTeeLit;
uniform vec3 uTeeShade;
uniform vec3 uRibLit;
uniform vec3 uRibShade;
uniform float uEnd;
uniform vec4 uInfo;
void main() {
  float l = toonLit(vNormal);
  vec3 color = cel(uTeeShade, uTeeLit, l);
  // The opening: the inside of the sleeve, in shade.
  float r = length(vLocal.yz);
  float inside = step(uEnd, vLocal.x + 0.05) * fill(r - 4.8);
  float hem = abs(vLocal.x - (uEnd - 1.3)) - 0.2;
  color = mix(color, cel(uRibShade, uRibLit, l), 0.8 * fill(hem));
  color = mix(color, uTeeShade * 0.82, inside);
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function sleeveMaterial(colors: { tee: string; rib: string }, end: number) {
  return sceneMaterial(TOON_VERT, SLEEVE_FRAG, {
    ...toneUniforms('uTee', colors.tee),
    ...toneUniforms('uRib', colors.rib),
    uEnd: { value: end },
    ...base(),
  });
}

// ---------- The beanie ----------

const BEANIE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uKnitLit;
uniform vec3 uKnitShade;
uniform vec3 uRibLit;
uniform vec3 uRibShade;
uniform vec3 uLabelLit;
uniform vec3 uLabelShade;
uniform vec4 uInfo;
const vec3 AT = vec3(${BEANIE.at.map((v) => v.toFixed(2)).join(', ')});
const float TILT = ${((BEANIE.tilt * Math.PI) / 180).toFixed(5)};
const float CUFF = ${BEANIE.cuff.toFixed(2)};
void main() {
  float l = toonLit(vNormal);
  // Back into the beanie's own upright axes.
  vec2 q = vLocal.xy - AT.xy;
  float x = q.x * cos(TILT) + q.y * sin(TILT);
  float y = -q.x * sin(TILT) + q.y * cos(TILT);
  float around = atan(vLocal.z, x);
  // Knit ribs: fine stripes round the head, bolder on the cuff.
  float rib = abs(fract(around * 44.0 / 6.28318) - 0.5) * 2.0;
  float cuff = y < CUFF ? 1.0 : 0.0;
  float stripe = smoothstep(0.55, 0.85, rib) * (cuff > 0.5 ? 0.6 : 0.28);
  vec3 color = mix(cel(uKnitShade, uKnitLit, l), cel(uRibShade, uRibLit, l), stripe);
  // The fold along the cuff's top.
  color = mix(color, cel(uRibShade, uRibLit, l), fill(abs(y - CUFF) - 0.25));
  // A woven label on the front of the cuff.
  if (x > 0.0) {
    vec2 p = vec2(vLocal.z, y);
    float label = roundRect(p, vec2(0.0, CUFF * 0.5), vec2(1.9, 0.95), 0.25);
    color = mix(color, cel(uLabelShade, uLabelLit, l), fill(label));
    color = mix(color, cel(uRibShade, uRibLit, l), fill(max(label + 0.35, abs(p.y - CUFF * 0.5) - 0.18)));
  }
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function beanieMaterial(colors: { knit: string; rib: string; label: string }) {
  return sceneMaterial(TOON_VERT, BEANIE_FRAG, {
    ...toneUniforms('uKnit', colors.knit),
    ...toneUniforms('uRib', colors.rib),
    ...toneUniforms('uLabel', colors.label),
    ...base(),
  });
}

// ---------- Pants ----------

/**
 * A pant leg along its bone (x), z the knee's hinge. The thigh carries a
 * cargo pocket on its outer side (`uOut` picks the side); the shin a
 * stitched hem where it breaks over the shoe.
 */
const PANTS_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uClothLit;
uniform vec3 uClothShade;
uniform vec3 uSeamLit;
uniform vec3 uSeamShade;
uniform float uLength;
/** 1 for a thigh (pocket), 0 for a shin (hem). */
uniform float uThigh;
/** Which way along z is outward, away from the other leg. */
uniform float uOut;
uniform vec4 uInfo;
void main() {
  float l = toonLit(vNormal);
  vec3 color = cel(uClothShade, uClothLit, l);
  float seam = 1e3;
  float fillIn = 1e3;
  float around = atan(vLocal.y, vLocal.z * uOut);
  if (uThigh > 0.5) {
    // The outseam, and a cargo pocket over it with a flap.
    float r = length(vLocal.yz);
    vec2 p = vec2(vLocal.x, around * r);
    seam = abs(around) * r - 0.16;
    float pocket = roundRect(p, vec2(uLength * 0.6, 0.0), vec2(uLength * 0.17, 4.6), 0.8);
    float flap = roundRect(p, vec2(uLength * 0.6 - uLength * 0.12, 0.0), vec2(uLength * 0.05, 4.8), 0.6);
    seam = max(seam, -pocket);
    fillIn = min(pocket, flap);
    seam = min(seam, abs(pocket) - 0.18);
    seam = min(seam, abs(flap) - 0.18);
  } else {
    float r = length(vLocal.yz);
    seam = abs(around) * r - 0.16;
    seam = min(seam, abs(vLocal.x - (uLength - 1.4)) - 0.2);
  }
  color = mix(color, mix(color, cel(uSeamShade, uSeamLit, l), 0.45), fill(fillIn));
  color = mix(color, cel(uSeamShade, uSeamLit, l), 0.85 * fill(seam));
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function pantsMaterial(colors: { cloth: string; seam: string }, part: { thigh: boolean; length: number; out: 1 | -1 }) {
  // A shin is drawn in the world (its cuff rests on the shoe) and painted by its rest pose.
  return sceneMaterial(part.thigh ? TOON_VERT : REST_VERT, PANTS_FRAG, {
    ...toneUniforms('uCloth', colors.cloth),
    ...toneUniforms('uSeam', colors.seam),
    uLength: { value: part.length + (part.thigh ? 0 : PANT_HEM) },
    uThigh: { value: part.thigh ? 1 : 0 },
    uOut: { value: part.out },
    ...base(),
  });
}

/** The seat of the pants: the cloth, a waistband along the top with belt loops, and the back seam. */
const SEAT_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uClothLit;
uniform vec3 uClothShade;
uniform vec3 uSeamLit;
uniform vec3 uSeamShade;
uniform float uTop;
uniform vec4 uInfo;
void main() {
  float l = toonLit(vNormal);
  vec3 color = cel(uClothShade, uClothLit, l);
  vec3 seam = cel(uSeamShade, uSeamLit, l);
  float band = abs(vLocal.y - (uTop - 1.6)) - 1.25;
  float around = atan(vLocal.z, vLocal.x);
  float loops = max(abs(fract(around * 6.0 / 6.28318 + 0.5) - 0.5) * 6.28318 / 6.0 * 12.0 - 0.45, abs(vLocal.y - (uTop - 1.6)) - 1.9);
  float back = max(abs(vLocal.z) - 0.18, vLocal.x);
  color = mix(color, mix(color, seam, 0.55), fill(band));
  color = mix(color, seam, 0.9 * fill(min(min(abs(band) - 0.16, loops), back)));
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function seatMaterial(colors: { cloth: string; seam: string }, top: number) {
  return sceneMaterial(TOON_VERT, SEAT_FRAG, {
    ...toneUniforms('uCloth', colors.cloth),
    ...toneUniforms('uSeam', colors.seam),
    uTop: { value: top },
    ...base(),
  });
}

// ---------- Shoes ----------

/**
 * The sneaker's upper over its cupsole (shoe3d.ts), with a stripe swooping
 * along each side from the heel to the laces, and the laces across the top.
 */
const SHOE_FRAG = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
${GLSL_PAINT}
in vec3 vNormal;
in vec3 vLocal;
uniform vec3 uUpperLit;
uniform vec3 uUpperShade;
uniform vec3 uSoleLit;
uniform vec3 uSoleShade;
uniform vec3 uStripeLit;
uniform vec3 uStripeShade;
uniform float uSplit;
uniform vec3 uRise;
uniform float uUpper;
uniform vec4 uInfo;
void main() {
  float l = toonLit(vNormal);
  float split = uSplit + uRise.x * smoothstep(uRise.y, uRise.z, vLocal.x);
  float d = vLocal.y - split;
  float ws = max(fwidth(d), 1e-4);
  float upper = uUpper * smoothstep(-ws, ws, d);
  vec3 color = mix(cel(uSoleShade, uSoleLit, l), cel(uUpperShade, uUpperLit, l), upper);
  if (uUpper > 0.5) {
    vec2 side = vec2(vLocal.x, vLocal.y);
    // The side stripe: from low at the heel, along, and up to the laces.
    float stripe = arc(side, vec2(-10.2, 1.2), vec2(1.5, -0.4), vec2(3.8, 4.2)) - 0.62;
    stripe = max(stripe, 2.2 - abs(vLocal.z));
    // Laces: short bars across the tongue.
    float laces = 1e3;
    for (int i = 0; i < 4; i++) {
      float x = -0.6 + float(i) * 1.75;
      laces = min(laces, segment(vec2(vLocal.x, vLocal.z), vec2(x, -1.5), vec2(x + 0.35, 1.5)) - 0.36);
    }
    laces = max(laces, 4.0 - vLocal.y);
    color = mix(color, cel(uStripeShade, uStripeLit, l), fill(stripe) * upper);
    color = mix(color, cel(uStripeShade, uStripeLit, l), fill(laces) * upper);
  }
  outColor = vec4(color, 1.0);
  outInfo = uInfo;
}
`;

export function sneakerMaterial(
  colors: { upper: string; sole: string; stripe: string },
  toeCap: { split: number; rise: { by: number; from: number; to: number } } | null,
) {
  return sceneMaterial(TOON_VERT, SHOE_FRAG, {
    ...toneUniforms('uUpper', colors.upper),
    ...toneUniforms('uSole', colors.sole),
    ...toneUniforms('uStripe', colors.stripe),
    uSplit: { value: toeCap ? toeCap.split : -1e6 },
    uRise: { value: toeCap ? new Vector3(toeCap.rise.by, toeCap.rise.from, toeCap.rise.to) : new Vector3(0, 0, 1) },
    uUpper: { value: toeCap ? 1 : 0 },
    ...base(),
  });
}

