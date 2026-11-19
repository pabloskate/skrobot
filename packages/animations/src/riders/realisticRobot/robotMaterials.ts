import { Color, Matrix3, Vector3, type IUniform } from 'three';
import type { Vec3 } from '../../camera/view';
import { mixHex } from '../../math';
import { LOOK_REFLECT_GLSL } from '../../sets/surfaces';
import { SET_SCALE } from '../../sets/setScale';
import { GLSL_DAYLIGHT, RiderDaylight } from '../../three/daylight';
import { GLSL_TARGETS, inkInfo, INK_NONE, rgb, sceneMaterial } from '../../three/materials';
import { SCREEN_HEX } from '../robot/robotMaterials';
import type { ShoeShape } from '../shoe3d';

/** All dimensions are in the existing part's own frame (x forward, y up, z across). */
export const SCREEN = { center: [0, -0.5], extent: [14, 9.6], r: 5.6 } as const;
export const VISOR_BEZEL = 0.75;
export const EYE_LIFT = { below: 0.12, to: 0.3 } as const;
export const EYES = {
  side: 6.2, up: 0.2,
  open: { half: [1.9, 3.1], r: 1.85 },
  focus: { half: [1.9, 1.5], r: 1.85 },
  happy: { radius: 2.35, drop: 1.0, half: 0.95 },
  wince: { half: 0.9 },
} as const;
export const BACK_HATCH = { side: 0, up: 3, half: [5.4, 7.2], r: 2.2 } as const;
export const HEAD_VENTS = { count: 3, up: 1.5, half: [4.6, 0.62], gap: 2.6 } as const;
export const SHOE_LACES = { count: 3, from: 1.6, to: 6.4, half: 2.3, width: 0.44 } as const;

const f = (n: number) => n.toFixed(4);
const v2 = (x: number, y: number) => `vec2(${f(x)}, ${f(y)})`;

const VERT = /* glsl */ `
out vec3 vLocal;
out vec3 vLocalNormal;
out vec3 vWorld;
out vec3 vNormal;
void main() {
  vLocal = position;
  vLocalNormal = normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  // The turned sleeves stretch along one axis. Transform normals by the inverse transpose.
  vNormal = transpose(mat3(viewMatrix)) * normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SURFACE = /* glsl */ `
${GLSL_TARGETS}
${GLSL_DAYLIGHT}
in vec3 vLocal;
in vec3 vLocalNormal;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uBase;
uniform vec4 uInfo;
const vec3 GASKET = vec3(0.014, 0.018, 0.019);
const vec3 ALLOY = vec3(0.39, 0.43, 0.44);
float fill(float d) {
  float w = max(fwidth(d) * 0.65, 0.001);
  return 1.0 - smoothstep(-w, w, d);
}
float roundRect(vec2 p, vec2 center, vec2 extent, float r) {
  float rr = min(r, min(extent.x, extent.y));
  vec2 q = abs(p - center) - (extent - rr);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  return length(p - a - ba * clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0));
}
// Powder-coat stipple and suede nap. Average the grain out before it is smaller than a pixel.
float grain(vec3 p) {
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  p = fract(p * vec3(0.1031, 0.11369, 0.13787));
  p += dot(p, p.yzx + 19.19);
  return (fract((p.x + p.y) * p.z) - 0.5) * (1.0 - smoothstep(0.35, 1.0, footprint));
}
// A pressed edge or inset in the existing skin, with relief measured in stage units.
vec3 relief(float height) {
  vec3 n = normalize(vNormal);
  vec3 dx = dFdx(vWorld), dy = dFdy(vWorld);
  vec3 a = cross(dy, n), b = cross(n, dx);
  float det = dot(dx, a);
  return normalize(n - (a * dFdx(height) + b * dFdy(height)) * sign(det) / max(abs(det), 1e-7));
}
vec3 shade(vec3 base, float rough, float metal, vec3 n, vec2 exposure) {
  return daylight(base, rough, metal, n, normalize(cameraPosition - vWorld), exposure);
}
void finish(vec3 light) {
  outColor = vec4(displayDaylight(light), 1.0);
  outInfo = uInfo;
}
`;

const surface = (body: string, fragment: string, light: RiderDaylight, uniforms: Record<string, IUniform> = {}) =>
  sceneMaterial(VERT, SURFACE + fragment, {
    ...light.uniforms, uBase: { value: new Color(body) }, uInfo: { value: inkInfo(6, 70, 0, INK_NONE) }, ...uniforms,
  });

const luma = (hex: string) => {
  const lin = rgb(hex).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

export function eyeGlow(accent: string): string {
  if (luma(accent) >= EYE_LIFT.below) return accent;
  for (let t = 0.02; t < 1; t += 0.02) {
    const hex = mixHex(accent, '#ffffff', t);
    if (luma(hex) >= EYE_LIFT.to) return hex;
  }
  return '#ffffff';
}

/** Smoked cover glass with a compression seal. The LED light originates behind the glass. */
const FACE = /* glsl */ `
${LOOK_REFLECT_GLSL}
uniform vec3 uGlow;
uniform vec3 uGlass;
uniform int uExpression;
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
  vec2 p = vLocal.zy;
  float d = roundRect(p, ${v2(...SCREEN.center)}, ${v2(...SCREEN.extent)}, ${f(SCREEN.r)});
  float bezel = fill(d - ${f(VISOR_BEZEL)});
  float glass = fill(d);
  float lip = fill(abs(d + 0.28) - 0.13);
  float e = min(eye(p, vec2(-${f(EYES.side)}, ${f(EYES.up)}), -1.0), eye(p, vec2(${f(EYES.side)}, ${f(EYES.up)}), 1.0));
  float lamp = fill(e);
  vec2 lens = (p - ${v2(...SCREEN.center)}) / ${v2(...SCREEN.extent)};
  vec3 n = relief(-0.17 * bezel + (0.26 + 0.52 * max(0.0, 1.0 - dot(lens, lens))) * glass);
  vec3 base = mix(uBase, GASKET, bezel);
  base = mix(base, uGlass, glass);
  base = mix(base, ALLOY * 0.58, lip);
  vec2 exposure = daylightAt(vWorld);
  vec3 reflected = shade(base, mix(0.55, 0.17, glass), 0.70 * lip, n, exposure);
  // The tinted cover picks up the bright horizon and the darker underside of a real eave in the spot.
  vec3 view = normalize(cameraPosition - vWorld), ray = reflect(-view, n);
  float blocked = lookReflectBlocked((vWorld - uSpotOrigin) / ${SET_SCALE.toFixed(8)}, ray);
  vec3 surround = mix(environment(ray, 0.17), vec3(0.13, 0.11, 0.085), blocked);
  float fresnel = 0.045 + 0.32 * pow(1.0 - max(dot(n, view), 0.0), 4.0);
  reflected += glass * fresnel * surround * exposure.y;

  // A fine LED matrix only resolves in close-up. The diffuser holds the expression at skating distances.
  vec2 cells = p / 0.70;
  vec2 cell = abs(fract(cells + 0.5) - 0.5);
  float resolved = 1.0 - smoothstep(0.3, 0.9, max(fwidth(cells.x), fwidth(cells.y)));
  float grid = 1.0 - 0.32 * smoothstep(0.28, 0.47, max(cell.x, cell.y)) * resolved;
  vec3 led = uGlow * (1.26 * lamp * grid + 0.13 * exp(-max(e, 0.0) / 0.74));
  // Outside the seal, the original head surface continues uninterrupted.
  led += 0.20 * sqrt(uGlow) * fill(e + 0.75);
  if (bezel < 0.001) discard;
  finish(reflected + glass * led);
}
`;

export function faceMaterial(paint: string, accent: string, light = new RiderDaylight()) {
  return surface(paint, FACE, light, {
    uGlow: { value: new Color(eyeGlow(accent)) },
    uGlass: { value: new Color(SCREEN_HEX) },
    uExpression: { value: 0 },
  });
}

/** One smooth moulding, with a line of pressed vents across the back as on the cartoon robot. */
const HEAD = /* glsl */ `
void main() {
  vec2 p = vLocal.zy;
  float back = smoothstep(0.44, 0.78, -normalize(vLocalNormal).x);
  float slots = 100.0;
  for (int i = 0; i < ${HEAD_VENTS.count}; i++) {
    float y = ${f(HEAD_VENTS.up)} + (float(i) - ${f((HEAD_VENTS.count - 1) / 2)}) * ${f(HEAD_VENTS.gap)};
    slots = min(slots, roundRect(p, vec2(0.0, y), ${v2(...HEAD_VENTS.half)}, ${f(HEAD_VENTS.half[1])}));
  }
  float vent = fill(slots) * back;
  float g = grain(vLocal * 2.5);
  vec3 base = mix(uBase * (1.0 + 0.07 * g), uBase * 0.42, vent);
  finish(shade(base, 0.43 + 0.07 * g, 0.16, relief(-0.3 * vent), daylightAt(vWorld)));
}
`;

export const headMaterial = (paint: string, light: RiderDaylight) => surface(paint, HEAD, light);

/** Pose-dependent occlusion cast on the chest by the head and upper arms. */
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
}

const CHEST = /* glsl */ `
uniform vec3 uHeadCenter;
uniform mat3 uHeadToUnit;
uniform mat3 uHeadNormal;
uniform vec3 uArmA[2];
uniform vec3 uArmB[2];
uniform float uArmR;
float armOcclusion(vec3 a, vec3 b, vec3 n) {
  vec3 axis = b - a;
  vec3 d = a + axis * clamp(dot(vWorld - a, axis) / max(dot(axis, axis), 1e-4), 0.0, 1.0) - vWorld;
  float len = max(length(d), uArmR);
  return clamp(0.5 + 0.5 * dot(n, d) / len, 0.0, 1.0) * uArmR * uArmR / (len * len);
}
void main() {
  float back = smoothstep(0.35, 0.78, -normalize(vLocalNormal).x);
  vec2 p = vLocal.zy;
  // The battery hatch's pressed outline, the one line on the shell, as on the cartoon robot.
  float hatch = roundRect(p, ${v2(BACK_HATCH.side, BACK_HATCH.up)}, ${v2(...BACK_HATCH.half)}, ${f(BACK_HATCH.r)});
  float seam = fill(abs(hatch) - 0.18) * back;
  float g = grain(vLocal * 2.5);
  vec3 base = mix(uBase * (1.0 + 0.07 * g), uBase * 0.42, seam);
  float rough = 0.45 + 0.07 * g, metal = 0.16, h = -0.25 * seam;

  vec3 n = relief(h);
  vec3 head = uHeadToUnit * (uHeadCenter - vWorld);
  float dist = max(1.0, length(head));
  float occ = max(0.0, dot(normalize(uHeadNormal * n), head) / dist) / (dist * dist);
  occ += armOcclusion(uArmA[0], uArmB[0], n) + armOcclusion(uArmA[1], uArmB[1], n);
  vec2 exposure = daylightAt(vWorld);
  exposure.y *= 1.0 - 0.55 * smoothstep(0.05, 0.8, occ);
  // The head's soft sun shadow falls away from the world sun, including when the robot is sitting back.
  vec3 ray = normalize(uHeadToUnit * SUN);
  float along = max(dot(head, ray), 0.0);
  exposure.x *= mix(0.16, 1.0, smoothstep(0.9, 1.10, length(head - along * ray)));
  finish(shade(base, rough, metal, n, exposure));
}
`;

export function chestMaterial(paint: string, against: ChestContact, light: RiderDaylight) {
  return surface(paint, CHEST, light, {
    uHeadCenter: { value: against.headCenter }, uHeadToUnit: { value: against.headToUnit },
    uHeadNormal: { value: against.headNormal }, uArmA: { value: against.armA }, uArmB: { value: against.armB },
    uArmR: { value: against.arm },
  });
}

/** The plain hard parts share a program: the shell's shoulder caps and mitts, and the antenna. */
export function smoothMaterial(hex: string, rough: number, metal: number, light: RiderDaylight) {
  return surface(hex, /* glsl */ `
    uniform float uRough;
    uniform float uMetal;
    void main() { finish(shade(uBase, uRough, uMetal, normalize(vNormal), daylightAt(vWorld))); }
  `, light, { uRough: { value: rough }, uMetal: { value: metal } });
}

/**
 * Soft-touch rubber: the limbs with their joints, the neck and the ears. Seen edge-on a hard
 * finish mirrors the sky, which turned a limb pointing at the camera grey; rubber scatters
 * instead, so it is lit as if never seen at less than a slant.
 */
export const softMaterial = (hex: string, light: RiderDaylight) => surface(hex, /* glsl */ `
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(normalize(cameraPosition - vWorld) + 0.45 * n);
  finish(daylight(uBase, 0.55, 0.0, n, view, daylightAt(vWorld)));
}
`, light);

/** Suede upper, stitched eyestay and flat woven laces, over the original rubber toe cap. */
export function shoeUpperMaterial(accent: string, sole: string, cap: ShoeShape['toeCap'], light: RiderDaylight) {
  return surface(accent, /* glsl */ `
    uniform vec3 uSole;
    uniform float uSplit;
    uniform vec3 uRise;
    void main() {
      vec2 p = vLocal.xz;
      float top = smoothstep(0.36, 0.73, normalize(vLocalNormal).y);
      float leather = 1.0 - fill(vLocal.y - uSplit - uRise.x * smoothstep(uRise.y, uRise.z, p.x));
      float stay = roundRect(vec2(p.x, abs(p.y)), vec2(3.8, 2.65), vec2(4.85, 1.12), 0.85);
      float panel = fill(stay) * top;
      float stitch = fill(abs(stay + 0.30) - 0.085) * top;
      float lace = 100.0, holes = 100.0;
      for (int i = 0; i < ${SHOE_LACES.count}; i++) {
        float x = mix(${f(SHOE_LACES.from)}, ${f(SHOE_LACES.to)}, float(i) / ${f(SHOE_LACES.count - 1)});
        vec2 a = vec2(x - 0.45, -${f(SHOE_LACES.half)}), b = vec2(x + 0.45, ${f(SHOE_LACES.half)});
        lace = min(lace, segment(p, a, b) - ${f(SHOE_LACES.width)});
        holes = min(holes, min(length(p - a), length(p - b)) - 0.67);
      }
      float cord = fill(lace) * top, eyelet = fill(holes) * top;
      float nap = grain(vLocal * 2.0);
      vec3 base = mix(uSole, uBase * (0.93 + 0.17 * nap - 0.19 * panel + 0.22 * stitch), leather);
      // The ankle disappears into a padded collar. A separate suede toe overlay is stitched across the vamp.
      float collarEdge = (length((p - vec2(-4.0, 0.0)) / vec2(5.3, 4.3)) - 1.0) * 4.3;
      float collar = fill(collarEdge) * top, binding = fill(abs(collarEdge) - 0.40) * top;
      float vamp = p.x - 7.45 + 0.12 * p.y * p.y;
      float toe = (1.0 - fill(vamp)) * leather;
      base = mix(base, uBase * (0.73 + 0.14 * nap), toe * 0.82);
      base = mix(base, uSole * 0.74, fill(abs(vamp - 0.40) - 0.09) * toe * top);
      base = mix(mix(base, GASKET, collar), uBase * 0.45, binding);
      base = mix(mix(base, ALLOY * 0.48, eyelet), uSole * 0.83, cord);
      float h = 0.13 * panel + 0.35 * cord - 0.12 * eyelet + 0.16 * toe + 0.24 * binding - 0.26 * collar;
      finish(shade(base, mix(0.62, 0.89, leather), 0.65 * eyelet * (1.0 - cord), relief(h), daylightAt(vWorld)));
    }
  `, light, { uSole: { value: new Color(sole) }, uSplit: { value: cap.split }, uRise: { value: new Vector3(cap.rise.by, cap.rise.from, cap.rise.to) } });
}

export const soleMaterial = (hex: string, light: RiderDaylight) => surface(hex, /* glsl */ `
void main() {
  float bottom = smoothstep(0.46, 0.85, -normalize(vLocalNormal).y);
  float tread = abs(fract((vLocal.x + abs(vLocal.z) * 0.64) / 2.0) - 0.5);
  float groove = fill(tread - 0.10) * bottom;
  float foxing = fill(abs(vLocal.y + 1.9) - 0.13) * (1.0 - bottom);
  vec3 base = mix(uBase, vec3(0.24, 0.17, 0.10), bottom) * (1.0 - 0.30 * groove - 0.18 * foxing);
  finish(shade(base, 0.83, 0.0, relief(-0.18 * groove - 0.08 * foxing), daylightAt(vWorld)));
}
`, light);
