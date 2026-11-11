import { Matrix3, Vector3, Vector4, type IUniform } from 'three';
import { PALETTE, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { celTones, GLSL_TARGETS, GLSL_TOON, glslRgb, rgb, sceneMaterial, vec3 } from '../../three/materials';

/**
 * The robot skater's paint (robot3d.ts). Beyond the two matte cel tones
 * every part carries (three/materials.ts's toonMaterial), these draw what a
 * moulded toy of the robot has painted on it, as distance fields in each
 * part's own axes (x forward, y up, z to the side), antialiased with
 * fwidth: the visor screen set into the head, a battery hatch on the
 * back, vents on the back of the head, laces on the shoes. Lines inside a part are drawn in its own shade tone, a little
 * darker in shadow; the black ink is for silhouettes only. Paint is colour
 * only: every material writes its ink record (uInfo) unchanged.
 *
 * Parts also sit on each other: a soft contact tone on the chest where the
 * head overhangs it and where the arms leave it, from an analytic occlusion
 * term against those neighbours (ChestContact, aimed every frame from the
 * rig): a function of the frame alone. (The limbs and neck are graphite,
 * already darker than any contact tone would make them.)
 *
 * Every element below sits behind a named constant: set its size or
 * strength to 0 to remove it. The places are in part-local coordinates so
 * they can be re-seated on new shapes in one place.
 */

const f = (n: number) => n.toFixed(4);
const v2 = (x: number, y: number) => `vec2(${f(x)}, ${f(y)})`;

// ---------- Tunables ----------

/**
 * The visor screen on the head's front, in its (side, up) plane: centre,
 * half extents, corner radius. three/cinematic.ts masks the same rectangle.
 */
export const SCREEN = { center: [0, -0.5], extent: [14, 9.6], r: 5.6 } as const;
/** The screen's dark glass. */
export const SCREEN_HEX = '#271f58';
/** The groove the screen is set in: its width round the glass (0 removes it), in the head's shade tone. */
export const VISOR_BEZEL = 0.75;
/** The recess's lower inner wall, catching the light inside the bezel: how tall at most (0 removes it), and how light. */
export const VISOR_WALL = { depth: 0.85, mix: 0.3 } as const;
/**
 * The eyes' glow: a soft halo on the glass round each eye (its reach and
 * strength; 0 strength removes it) and a paler core set `inset` inside it.
 */
export const EYE_GLOW = { reach: 1.3, strength: 0.42, inset: 0.75, core: 0.38 } as const;
/**
 * Eyes in a dark accent (relative luminance under `below`) would vanish on
 * the dark glass: theirs is lifted toward white until it reaches `to`, so
 * they glow like the rest (the accent stays as it is everywhere else).
 */
export const EYE_LIFT = { below: 0.12, to: 0.3 } as const;
/** The eyes: centres either side of the middle, height, and each expression's drawing. */
export const EYES = {
  side: 6.2,
  up: 0.2,
  /** open: a tall rounded pill. */
  open: { half: [1.9, 3.1], r: 1.85 },
  /** focus: the pill narrowed to a dot. */
  focus: { half: [1.9, 1.5], r: 1.85 },
  /** happy: an arch, its centre `drop` under the eye's, with round ends. */
  happy: { radius: 2.35, drop: 1.0, half: 0.95 },
  /** wince: a chevron pointing in. */
  wince: { half: 0.9 },
} as const;

/** Half the width of a painted seam line (world units): well under the silhouette line's. */
export const SEAM_HALF = 0.3;
/** How much darker than the part's shade tone a seam runs in shadow. */
export const SEAM_DARKEN = 0.22;

/** The battery hatch on the back: centre (side, up), half extents, corner radius (0 half-extents remove it). */
export const BACK_HATCH = { side: 0, up: 3, half: [5.4, 7.2], r: 2.2 } as const;
/** Vent slots on the back of the head: how many (0 removes them), centre height, half length and half height, spacing. */
export const HEAD_VENTS = { count: 3, up: 1.5, half: [4.6, 0.62], gap: 2.6 } as const;
/** Laces across the top of the shoe: how many (0 removes them), first and last row (shoe-local x), half length across, half width. */
export const SHOE_LACES = { count: 3, from: 1.6, to: 6.4, half: 2.3, width: 0.5 } as const;

/**
 * The contact tone on the chest: how dark it gets at most (0 removes it),
 * toward the shell's shade tone deepened by `deepen`, and the occlusion it
 * ramps in over (ChestContact).
 */
export const CONTACT = { strength: 0.75, deepen: 0.3, from: 0.08, to: 0.45 } as const;

// ---------- Shared GLSL ----------

/** Robot parts' vertex shader: TOON_VERT's outputs, plus local and world position and normal. */
const ROBOT_VERT = /* glsl */ `
out vec3 vNormal;
out vec3 vLocal;
out vec3 vLocalNormal;
out vec3 vWorld;
out vec3 vWorldNormal;
/** World units to pull the part toward the camera in depth only (its outline on screen stays put). */
uniform float uDepthBias;
void main() {
  vLocal = position;
  vLocalNormal = normal;
  vNormal = normalMatrix * normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  view.xyz *= 1.0 - uDepthBias / max(length(view.xyz), 1.0);
  gl_Position = projectionMatrix * view;
}
`;

const HEADER = /* glsl */ `
${GLSL_TARGETS}
${GLSL_TOON}
in vec3 vNormal;
in vec3 vLocal;
in vec3 vLocalNormal;
in vec3 vWorld;
in vec3 vWorldNormal;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec4 uInfo;
float fill(float d) {
  float w = max(fwidth(d), 1e-4) * 0.75;
  return 1.0 - smoothstep(-w, w, d);
}
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
`;

/** A seam: the part's shade tone where lit, a little darker in shadow. */
const GLSL_SEAM = /* glsl */ `
uniform vec3 uSeamLit;
uniform vec3 uSeamShade;
vec3 seam(float lit) { return mix(uSeamShade, uSeamLit, lit); }
`;

/**
 * The contact term: the analytic occlusion (the classic cos/d² form of a
 * sphere's) of the chest by its neighbours: the head, an ellipsoid of
 * radii ChestContact.head, and each upper arm, a capsule, by the sphere on
 * its axis nearest the point. uHeadToUnit takes a world offset into the
 * head's unit sphere; uHeadNormal takes a world normal there (its inverse
 * transpose).
 */
const GLSL_CONTACT = /* glsl */ `
uniform vec3 uHeadCenter;
uniform mat3 uHeadToUnit;
uniform mat3 uHeadNormal;
uniform vec3 uArmA[2];
uniform vec3 uArmB[2];
uniform float uArmR;
uniform vec3 uContact;
uniform vec3 uContactTone;
float sphereOcclusion(vec3 d, vec3 n, float r) {
  float l = max(length(d), r);
  return clamp(dot(n, d) / l, 0.0, 1.0) * (r * r) / (l * l);
}
float armOcclusion(vec3 a, vec3 b, vec3 n) {
  vec3 ba = b - a;
  float h = clamp(dot(vWorld - a, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  // The arm's root is inside the chest, its axis behind the surface there:
  // wrapped round, so the shell darkens all round where the arm leaves it.
  vec3 d = a + ba * h - vWorld;
  float l = max(length(d), uArmR);
  return clamp(0.5 + 0.5 * dot(n, d) / l, 0.0, 1.0) * (uArmR * uArmR) / (l * l);
}
vec3 contact(vec3 c) {
  vec3 n = normalize(vWorldNormal);
  float occ = sphereOcclusion(uHeadToUnit * (uHeadCenter - vWorld), normalize(uHeadNormal * vWorldNormal), 1.0);
  occ += armOcclusion(uArmA[0], uArmB[0], n) + armOcclusion(uArmA[1], uArmB[1], n);
  return mix(c, uContactTone, uContact.x * smoothstep(uContact.y, uContact.z, occ));
}
`;

type Uniforms = Record<string, IUniform>;

const base = (hex: string): Uniforms => {
  const tones = celTones(hex);
  return { uLit: { value: tones.lit }, uShade: { value: tones.shade }, uInfo: { value: new Vector4() }, uDepthBias: { value: 0 } };
};

const seamUniforms = (hex: string): Uniforms => {
  const shade = tone(hex, 0.18);
  return { uSeamLit: { value: vec3(shade) }, uSeamShade: { value: vec3(mixHex(shade, PALETTE.ink, SEAM_DARKEN)) } };
};

/**
 * What the chest sits against this frame: the head over it (an ellipsoid of
 * radii `head`, on the head's frame) and the upper arms leaving it (capsules
 * of radius `arm`, shoulder to elbow), in three's world.
 */
export class ChestContact {
  readonly headCenter = new Vector3();
  readonly headToUnit = new Matrix3();
  readonly headNormal = new Matrix3();
  readonly armA = [new Vector3(), new Vector3()];
  readonly armB = [new Vector3(), new Vector3()];

  constructor(readonly head: Vec3, readonly arm: number) {}

  /** The head's frame: origin and its unit fwd, up and side axes. */
  aimHead(origin: Vec3, fwd: Vec3, up: Vec3, side: Vec3) {
    this.headCenter.set(...origin);
    const [a, b, c] = this.head;
    // Rows: the axes, scaled into the unit sphere (offsets), or out of it (normals).
    this.headToUnit.set(
      fwd[0] / a, fwd[1] / a, fwd[2] / a,
      up[0] / b, up[1] / b, up[2] / b,
      side[0] / c, side[1] / c, side[2] / c,
    );
    this.headNormal.set(
      fwd[0] * a, fwd[1] * a, fwd[2] * a,
      up[0] * b, up[1] * b, up[2] * b,
      side[0] * c, side[1] * c, side[2] * c,
    );
  }

  /** An upper arm, 0 or 1: shoulder and elbow. */
  aimArm(i: number, shoulder: Vec3, elbow: Vec3) {
    this.armA[i].set(...shoulder);
    this.armB[i].set(...elbow);
  }

  uniforms(hex: string): Uniforms {
    return {
      uHeadCenter: { value: this.headCenter },
      uHeadToUnit: { value: this.headToUnit },
      uHeadNormal: { value: this.headNormal },
      uArmA: { value: this.armA },
      uArmB: { value: this.armB },
      uArmR: { value: this.arm },
      uContact: { value: new Vector3(CONTACT.strength, CONTACT.from, CONTACT.to) },
      uContactTone: { value: vec3(mixHex(tone(hex, 0.18), PALETTE.ink, CONTACT.deepen)) },
    };
  }
}

// ---------- The face ----------

const luma = (hex: string) => {
  const lin = rgb(hex).map((s) => {
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

/** The colour the eyes glow: the accent, lifted toward white as far as it takes to read on the glass. */
export function eyeGlow(accentHex: string): string {
  if (luma(accentHex) >= EYE_LIFT.below) return accentHex;
  for (let t = 0.02; t < 1; t += 0.02) {
    const hex = mixHex(accentHex, '#ffffff', t);
    if (luma(hex) >= EYE_LIFT.to) return hex;
  }
  return '#ffffff';
}

/**
 * The visor and eyes, painted on a grid lying on the head's front face
 * (geometry.ts's frontDecalGeometry): the dark glass set in a groove, the
 * lower wall of its recess catching the light, and two eyes glowing on it
 * in the rider's expression. Matte: no glare. Around the screen the grid
 * shows the head's own paint, so it needs no transparency, and the whole
 * screen fades out as it turns edge-on (`uFade`).
 */
const FACE_FRAG = /* glsl */ `
${HEADER}
${GLSL_SEAM}
uniform vec3 uGlow;
uniform vec3 uWall;
uniform float uFade;
/** 0 open, 1 focus, 2 happy, 3 wince. */
uniform int uExpression;
const vec3 SCREEN = ${glslRgb(SCREEN_HEX)};
const vec3 CORE = vec3(1.0, 0.98, 0.94);

/** One eye, centred at c, drawn for the expression; side is -1 or 1 (outward). */
float eye(vec2 p, vec2 c, float side) {
  if (uExpression == 2) {
    vec2 q = p - c + vec2(0.0, ${f(EYES.happy.drop)});
    float arc = q.y >= 0.0
      ? abs(length(q) - ${f(EYES.happy.radius)})
      : length(vec2(abs(q.x) - ${f(EYES.happy.radius)}, q.y));
    return arc - ${f(EYES.happy.half)};
  }
  if (uExpression == 3) {
    float tip = -side;
    vec2 a = c + vec2(-tip * 2.2, 2.4);
    vec2 b = c + vec2(tip * 1.8, 0.0);
    vec2 e = c + vec2(-tip * 2.2, -2.4);
    return min(segment(p, a, b), segment(p, b, e)) - ${f(EYES.wince.half)};
  }
  if (uExpression == 1) return roundRect(p, c, ${v2(EYES.focus.half[0], EYES.focus.half[1])}, ${f(EYES.focus.r)});
  return roundRect(p, c, ${v2(EYES.open.half[0], EYES.open.half[1])}, ${f(EYES.open.r)});
}

void main() {
  float lit = toonLit(vNormal);
  vec3 head = mix(uShade, uLit, lit);
  // (side, up): the screen is laid out side to side, then up.
  vec2 p = vec2(vLocal.z, vLocal.y);
  float d = roundRect(p, ${v2(SCREEN.center[0], SCREEN.center[1])}, ${v2(SCREEN.extent[0], SCREEN.extent[1])}, ${f(SCREEN.r)});
  float screen = fill(d);
  // The groove round the glass, in the head's shade tone.
  float bezel = fill(d - ${f(VISOR_BEZEL)}) * (1.0 - screen);
  // The recess's lower wall: inside the glass, under the glass raised by the wall's depth.
  float above = roundRect(p, ${v2(SCREEN.center[0], SCREEN.center[1] + VISOR_WALL.depth)}, ${v2(SCREEN.extent[0], SCREEN.extent[1])}, ${f(SCREEN.r)});
  float wall = 1.0 - fill(above);

  float e = min(eye(p, vec2(-${f(EYES.side)}, ${f(EYES.up)}), -1.0), eye(p, vec2(${f(EYES.side)}, ${f(EYES.up)}), 1.0));
  vec3 glass = mix(SCREEN, uWall, wall);
  glass = mix(glass, uGlow, ${f(EYE_GLOW.strength)} * exp(-max(e, 0.0) / ${f(EYE_GLOW.reach)}));
  vec3 lamp = mix(uGlow, CORE, ${f(EYE_GLOW.core)} * fill(e + ${f(EYE_GLOW.inset)}));
  vec3 face = mix(glass, lamp, fill(e));

  vec3 c = mix(head, seam(lit), bezel * uFade);
  outColor = vec4(mix(c, face, screen * uFade), 1.0);
  outInfo = uInfo;
}
`;

export function faceMaterial(bodyHex: string, accentHex: string) {
  return sceneMaterial(ROBOT_VERT, FACE_FRAG, {
    ...base(bodyHex),
    ...seamUniforms(bodyHex),
    uGlow: { value: vec3(eyeGlow(accentHex)) },
    uWall: { value: vec3(mixHex(SCREEN_HEX, tone(bodyHex, 0.18), VISOR_WALL.mix)) },
    uFade: { value: 1 },
    uExpression: { value: 0 },
  }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

// ---------- The head ----------

/** The head's shell: vent slots moulded into its back. */
const HEAD_FRAG = /* glsl */ `
${HEADER}
${GLSL_SEAM}
void main() {
  float lit = toonLit(vNormal);
  vec3 c = mix(uShade, uLit, lit);
  float back = smoothstep(-0.55, -0.8, vLocalNormal.x);
  vec2 p = vec2(vLocal.z, vLocal.y);
  float slots = 1e3;
  for (int i = 0; i < ${Math.max(HEAD_VENTS.count, 1)}; i++) {
    float y = ${f(HEAD_VENTS.up)} + (float(i) - ${f((HEAD_VENTS.count - 1) / 2)}) * ${f(HEAD_VENTS.gap)};
    slots = min(slots, roundRect(p, vec2(0.0, y), ${v2(HEAD_VENTS.half[0], HEAD_VENTS.half[1])}, ${f(HEAD_VENTS.half[1])}));
  }
  c = mix(c, seam(lit), ${HEAD_VENTS.count > 0 ? '1.0' : '0.0'} * fill(slots) * back);
  outColor = vec4(c, 1.0);
  outInfo = uInfo;
}
`;

export function headMaterial(bodyHex: string) {
  return sceneMaterial(ROBOT_VERT, HEAD_FRAG, { ...base(bodyHex), ...seamUniforms(bodyHex) });
}

// ---------- The chest ----------

/**
 * The chest's shell: a battery hatch on the back, and the contact tone
 * under the head and round the shoulders. The paint is laid straight
 * through the chest front to back, in the chest's own axes
 * (the shoulders'), not in the shell's skin: riding fakie the shell twists
 * down to the hips under it (robot3d.ts's twistTorso), and paint carried in
 * the skin would shear into a spiral with it. So the hatch stays a hatch,
 * square to the shoulders, on whatever shell is behind it.
 */
const CHEST_FRAG = /* glsl */ `
${HEADER}
${GLSL_SEAM}
${GLSL_CONTACT}
void main() {
  float lit = toonLit(vNormal);
  vec3 c = mix(uShade, uLit, lit);
  vec2 p = vec2(vLocal.z, vLocal.y);
  // The chest's back; a twisted shell still faces one way or the other.
  float back = smoothstep(-0.15, -0.4, normalize(vLocalNormal).x);

  // The hatch's seam.
  float hatch = abs(roundRect(p, ${v2(BACK_HATCH.side, BACK_HATCH.up)}, ${v2(BACK_HATCH.half[0], BACK_HATCH.half[1])}, ${f(BACK_HATCH.r)})) - ${f(SEAM_HALF)};
  c = mix(c, seam(lit), fill(hatch) * back * ${BACK_HATCH.half[0] > 0 ? '1.0' : '0.0'});

  outColor = vec4(contact(c), 1.0);
  outInfo = uInfo;
}
`;

export function chestMaterial(bodyHex: string, against: ChestContact) {
  return sceneMaterial(ROBOT_VERT, CHEST_FRAG, { ...base(bodyHex), ...seamUniforms(bodyHex), ...against.uniforms(bodyHex) });
}

// ---------- The shoe ----------

/**
 * The shoe's upper: the accent, turning to the sole's cream under the
 * sole's top and over the toe as a cap (shoe3d.ts's toeCap, as
 * toonMaterial paints it), with laces across its top in the accent's shade.
 */
const UPPER_FRAG = /* glsl */ `
${HEADER}
${GLSL_SEAM}
uniform vec3 uLit2;
uniform vec3 uShade2;
uniform float uSplit;
uniform vec3 uRise;
void main() {
  float lit = toonLit(vNormal);
  float split = uSplit + uRise.x * smoothstep(uRise.y, uRise.z, vLocal.x);
  float d = vLocal.y - split;
  float ws = max(fwidth(d), 1e-4);
  float upper = smoothstep(-ws, ws, d);
  vec3 c = mix(mix(uShade2, uLit2, lit), mix(uShade, uLit, lit), upper);
  // Laces: bars across the top, between the collar and the toe.
  float top = smoothstep(0.55, 0.75, vLocalNormal.y);
  float laces = 1e3;
  for (int i = 0; i < ${Math.max(SHOE_LACES.count, 1)}; i++) {
    float x = ${f(SHOE_LACES.from)} + float(i) * ${f(SHOE_LACES.count > 1 ? (SHOE_LACES.to - SHOE_LACES.from) / (SHOE_LACES.count - 1) : 0)};
    laces = min(laces, segment(vec2(vLocal.x, vLocal.z), vec2(x, -${f(SHOE_LACES.half)}), vec2(x, ${f(SHOE_LACES.half)})) - ${f(SHOE_LACES.width)});
  }
  c = mix(c, seam(lit), ${SHOE_LACES.count > 0 ? '1.0' : '0.0'} * fill(laces) * top * upper);
  outColor = vec4(c, 1.0);
  outInfo = uInfo;
}
`;

export function shoeUpperMaterial(hex: string, below: { hex: string; split: number; rise: { by: number; from: number; to: number } }) {
  const bottom = celTones(below.hex);
  return sceneMaterial(ROBOT_VERT, UPPER_FRAG, {
    ...base(hex),
    ...seamUniforms(hex),
    uLit2: { value: bottom.lit },
    uShade2: { value: bottom.shade },
    uSplit: { value: below.split },
    uRise: { value: new Vector3(below.rise.by, below.rise.from, below.rise.to) },
  });
}
