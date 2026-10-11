import { Color, CustomBlending, DoubleSide, MinEquation, OneFactor, Vector2, Vector3, Vector4, type ShaderMaterial, type Texture } from 'three';
import { SUN, sceneMaterial } from '../../three/materials';

/**
 * The realistic skater's surfaces. Each is lit by the scene's sun and sky
 * (the realistic board's light: a warm sun, a cool sky over warm ground),
 * in linear light (textures and colors arrive linear: three decodes sRGB),
 * then filmically rolled off into the scene's sRGB:
 *
 *  - skin: a texture over MakeHuman's UVs with a pore-and-muscle normal
 *    map, a wrapped diffuse that bleeds red where light turns into
 *    shadow (light scattered under the skin), and two soft specular lobes;
 *  - cloth: the outfit's fold normals and baked occlusion, a cotton tee
 *    and darker denim, with a little sheen at grazing angles;
 *  - shoes: suede uppers over white vulcanized soles, worked out from each
 *    point's height over the sole;
 *  - eyes: the iris texture under a wet glint; brows and lashes cut out
 *    of their hair cards.
 *
 * Direct sunlight is shadowed by the skater's own body (SunShadow): the arms
 * on the tee, the beanie over the brow, the chin on the neck.
 *
 * None of them draws an outline (ink width 0).
 */

const sun = `vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)})`;

/** Ink record: a rider id, no outline. */
const info = (id: number) => ({ value: new Vector4(id / 255, 70 / 255, 0, 0) });

const SKINNED_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#ifdef USE_REST
  // A mesh posed on the CPU (DeltaMush) carries its rest positions alongside.
  in vec3 rest;
#endif
out vec3 vNormal;
out vec3 vWorld;
out vec2 vUv;
out vec3 vRest;
out float vAO;
void main() {
  #ifdef USE_COLOR
    vAO = color.r;
  #else
    vAO = 1.0;
  #endif
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  // The rest pose in world units, whatever the mesh's own (packed) frame.
  #if defined(USE_REST)
    vRest = rest;
  #elif defined(USE_SKINNING)
    vRest = (bindMatrix * vec4(position, 1.0)).xyz;
  #else
    vRest = (modelMatrix * vec4(position, 1.0)).xyz;
  #endif
  #include <skinning_vertex>
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * objectNormal);
  vUv = uv;
  vec4 view = viewMatrix * world;
  #ifdef OUTER_LAYER
    // The tee (its UVs' top half) is worn over the jeans: in depth only, it sits a
    // little nearer the camera, so denim close under it never shows through.
    float layer = uv.y < 0.5 ? OUTER_LAYER : 0.0;
    view.xyz *= 1.0 - layer / max(length(view.xyz), 1.0);
  #endif
  gl_Position = projectionMatrix * view;
}
`;

const LIGHT = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec3 vNormal;
in vec3 vWorld;
in vec2 vUv;
in vec3 vRest;
in float vAO;
uniform vec4 uInfo;
const vec3 SUN_DIR = ${sun};
const vec3 SUN_RGB = vec3(0.83, 0.79, 0.7) * 1.25;
vec3 ambientLight(vec3 n) {
  vec3 ground = vec3(0.27, 0.235, 0.2);
  vec3 sky = vec3(0.47, 0.5, 0.6);
  return mix(ground, sky, smoothstep(-0.9, 0.9, n.y));
}
// A gentle filmic shoulder so lit skin and white cotton don't clip flat.
vec3 display(vec3 c) {
  c = c * (1.0 + c / 6.0) / (1.0 + c);
  c *= 1.32;
  return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
}
vec3 surfaceNormal() {
  vec3 n = normalize(vNormal);
  return gl_FrontFacing ? n : -n;
}
// Tangent-space normal map on a frame worked out from screen derivatives (no tangents needed).
vec3 mapNormal(vec3 n, vec3 m, float strength) {
  vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
  vec2 duv1 = dFdx(vUv), duv2 = dFdy(vUv);
  vec3 dp2perp = cross(dp2, n), dp1perp = cross(n, dp1);
  vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(1e-12, max(dot(t, t), dot(b, b))));
  m.xy *= strength;
  // glTF UVs run down the image, so the map's green points the other way.
  vec3 p = normalize(mat3(t * inv, -b * inv, n) * m);
  return dot(p, p) > 0.0 ? p : n;
}
// Bump a normal by a height field's screen derivatives (Mikkelsen), for procedural relief.
vec3 bumpNormal(vec3 n, float dhdx, float dhdy) {
  vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - grad);
}
float ggx(float nh, float rough) {
  float a = rough * rough;
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159 * d * d);
}
float visibility(float nl, float nv, float rough) {
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  return 0.25 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/**
 * The skater's own sun shadow: light-space depth, nearest the sun, of every
 * body part, in a square of SHADOW_HALF either side of the hips (light axes
 * from SUN). Shared by all the skater's materials; RealisticHuman3D fills it.
 */
export interface SunShadow {
  uShadowMap: { value: Texture | null };
  uShadowCenter: { value: Vector3 };
  uShadowOn: { value: number };
}
export const SHADOW_HALF = 120;
export const SHADOW_RANGE = 420;
export const SHADOW_SIZE = 1024;

export const sunShadow = (): SunShadow => ({
  uShadowMap: { value: null }, uShadowCenter: { value: new Vector3() }, uShadowOn: { value: 0 },
});

/** The sun's axes: x and y across the shadow map, z toward the sun. */
const LIGHT_BASIS = /* glsl */ `
const vec3 SHADOW_Z = ${sun};
const vec3 SHADOW_X = ${(() => {
  const z = SUN.clone();
  const x = new Vector3(0, 1, 0).cross(z).normalize();
  return `vec3(${x.x.toFixed(6)}, ${x.y.toFixed(6)}, ${x.z.toFixed(6)})`;
})()};
const float SHADOW_HALF = ${SHADOW_HALF.toFixed(1)};
const float SHADOW_RANGE = ${SHADOW_RANGE.toFixed(1)};
`;

const SHADOW = /* glsl */ `
${LIGHT_BASIS}
uniform sampler2D uShadowMap;
uniform vec3 uShadowCenter;
uniform float uShadowOn;
/** 1 in sunlight, 0 in the skater's own shadow, soft at the edges. */
float sunlit(vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 y = cross(SHADOW_Z, SHADOW_X);
  // Offset along the normal against shadow acne on surfaces turned from the sun.
  float facing = dot(n, SHADOW_Z);
  vec3 p = vWorld + n * (0.6 + 0.8 * (1.0 - abs(facing))) - uShadowCenter;
  vec2 uv = vec2(dot(p, SHADOW_X), dot(p, y)) / SHADOW_HALF * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 1.0;
  float depth = (SHADOW_RANGE * 0.5 - dot(p, SHADOW_Z)) / SHADOW_RANGE;
  float bias = 1.2 / SHADOW_RANGE;
  vec2 texel = vec2(1.0 / ${SHADOW_SIZE.toFixed(1)});
  float lit = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * texel * 1.25;
      lit += step(depth - bias, texture(uShadowMap, uv + o).r);
    }
  }
  return lit / 25.0;
}
`;

const material = (fragment: string, uniforms: Record<string, { value: unknown }>, shadow: SunShadow, id: number, extra: Partial<ShaderMaterial> = {}) =>
  sceneMaterial(SKINNED_VERT, LIGHT + SHADOW + fragment, { ...uniforms, ...shadow, uInfo: info(id) }, extra);

/** Writes each fragment's light-space depth; MIN blending keeps the one nearest the sun. */
export function shadowCasterMaterial(): ShaderMaterial {
  return sceneMaterial(/* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    ${LIGHT_BASIS}
    uniform vec3 uShadowCenter;
    out float vDepth;
    void main() {
      #include <skinbase_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec3 p = (modelMatrix * vec4(transformed, 1.0)).xyz - uShadowCenter;
      vec3 y = cross(SHADOW_Z, SHADOW_X);
      vDepth = (SHADOW_RANGE * 0.5 - dot(p, SHADOW_Z)) / SHADOW_RANGE;
      gl_Position = vec4(dot(p, SHADOW_X) / SHADOW_HALF, dot(p, y) / SHADOW_HALF, 0.5, 1.0);
    }
  `, /* glsl */ `
    layout(location = 0) out vec4 outColor;
    in float vDepth;
    void main() { outColor = vec4(vDepth, 0.0, 0.0, 1.0); }
  `, { uShadowCenter: { value: new Vector3() } }, {
    side: DoubleSide, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendEquation: MinEquation, blendSrc: OneFactor, blendDst: OneFactor,
  });
}

/** Skin: scattered, soft, a little sheen. */
export function skinMaterial(albedo: Texture, normal: Texture, hair: Texture, hairColor: string, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform sampler2D uAlbedo;
    uniform sampler2D uNormal;
    uniform sampler2D uHair;
    uniform vec3 uHairColor;
    void main() {
      vec3 geo = surfaceNormal();
      vec3 n = mapNormal(geo, texture(uNormal, vUv).xyz * 2.0 - 1.0, 0.7);
      vec3 base = texture(uAlbedo, vUv).rgb;
      // Close-cropped hair, painted on the scalp: sideburns and the nape show under the beanie.
      float hair = texture(uHair, vUv).r;
      // Short hair: fine grain, thinning to stubble at its edge.
      float grain = noise3(vRest * 14.0) * 0.6 + noise3(vRest * 40.0) * 0.4;
      float cover = hair * mix(0.55, 0.95, smoothstep(0.2, 0.8, hair)) * (0.8 + 0.3 * grain);
      base = mix(base, uHairColor * (0.8 + 0.4 * grain), clamp(cover, 0.0, 1.0));
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      // Light scatters under skin: a warm band where the light turns into shadow, and the
      // broad shading taken from a smoothed normal (the geometry's) more than the pores'.
      float nl = dot(n, SUN_DIR);
      float soft = mix(dot(geo, SUN_DIR), nl, 0.5);
      float lam = max(0.0, soft);
      float band = smoothstep(-0.35, 0.0, soft) * (1.0 - smoothstep(0.0, 0.45, soft));
      // The shadow's edge on skin glows red too: light scattered in from the lit side.
      float shade = sunlit(geo);
      vec3 diffuse = vec3(lam) * shade + vec3(0.2, 0.06, 0.03) * band * shade
        + vec3(0.1, 0.025, 0.01) * lam * smoothstep(0.0, 0.5, shade) * (1.0 - shade);
      float ao = vAO;
      vec3 color = base * (ambientLight(n) * ao + diffuse * SUN_RGB * mix(1.0, ao, 0.35));
      // Thin edges (ears, fingers, nostrils) glow when backlit.
      color += base * vec3(0.5, 0.12, 0.06) * pow(max(0.0, dot(-v, SUN_DIR)), 3.0) * pow(1.0 - nv, 2.0);
      // Oily skin: a tight lobe and a broad one.
      vec3 h = normalize(v + SUN_DIR);
      float nh = max(0.0, dot(n, h));
      float lit = max(0.0, nl);
      float fres = 0.028 + 0.972 * pow(1.0 - max(0.0, dot(v, h)), 5.0);
      float spec = (ggx(nh, 0.38) * 0.55 + ggx(nh, 0.62) * 0.45) * visibility(lit, nv, 0.5) * fres * (1.0 - 0.7 * hair);
      color += SUN_RGB * spec * lit * 0.9 * shade;
      // Sky sheen at grazing angles.
      color += ambientLight(reflect(-v, n)) * 0.05 * pow(1.0 - nv, 4.0);
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, { uAlbedo: { value: albedo }, uNormal: { value: normal }, uHair: { value: hair }, uHairColor: { value: new Color(hairColor) } }, shadow, 245);
}

/** The alien's hide: its green, and the deeper green of its lips. sRGB. */
export interface AlienSkin {
  skin: string;
  lips: string;
}

/**
 * The alien's skin: a green hide, lit like skin (light scattered under it,
 * here coming out yellow-green) with a softer sheen. The skater's map only
 * lends it detail: its reddest parts (the lips) turn deep green, and its
 * fine grain, the map over its own blur, shows; its painted stubble and
 * shading don't.
 */
export function alienSkinMaterial(albedo: Texture, normal: Texture, look: AlienSkin, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform sampler2D uAlbedo;
    uniform sampler2D uNormal;
    uniform vec3 uSkin;
    uniform vec3 uLips;
    void main() {
      vec3 geo = surfaceNormal();
      // Across a seam in the UVs (down the back of the bare head) a pixel's UVs jump, its
      // texture reads go to the smallest mip and its tangent frame is meaningless:
      // the detail borrowed from the maps fades out there.
      float uvRate = max(length(dFdx(vUv)), length(dFdy(vUv))) * 2048.0;
      float seam = smoothstep(32.0, 128.0, uvRate);
      vec3 n = mapNormal(geo, texture(uNormal, vUv).xyz * 2.0 - 1.0, 0.3 * (1.0 - seam));
      vec3 tex = texture(uAlbedo, vUv).rgb;
      vec3 blur = textureLod(uAlbedo, vUv, 4.0).rgb;
      const vec3 LUM = vec3(0.3, 0.59, 0.11);
      float grain = mix(clamp(dot(tex, LUM) / max(dot(blur, LUM), 1e-3), 0.8, 1.15), 1.0, seam);
      float lips = smoothstep(0.36, 0.24, tex.g / max(tex.r, 1e-3)) * (1.0 - seam);
      // A mottled hide, drifting a little yellower and bluer across the body.
      float mottle = noise3(vRest * 0.18) * 0.6 + noise3(vRest * 0.5) * 0.4;
      vec3 base = uSkin * mix(0.88, 1.08, mottle) * mix(vec3(1.05, 1.0, 0.85), vec3(0.94, 1.0, 1.1), noise3(vRest * 0.09 + 3.0));
      base = mix(base, uLips, lips * 0.85) * grain;
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      float nl = dot(n, SUN_DIR);
      float soft = mix(dot(geo, SUN_DIR), nl, 0.5);
      float lam = max(0.0, soft);
      float band = smoothstep(-0.35, 0.0, soft) * (1.0 - smoothstep(0.0, 0.45, soft));
      float shade = sunlit(geo);
      vec3 diffuse = vec3(lam) * shade + vec3(0.07, 0.14, 0.02) * band * shade
        + vec3(0.04, 0.08, 0.01) * lam * smoothstep(0.0, 0.5, shade) * (1.0 - shade);
      float ao = vAO;
      vec3 color = base * (ambientLight(n) * ao + diffuse * SUN_RGB * mix(1.0, ao, 0.35));
      // Thin edges (fingers, the little ears) glow when backlit.
      color += base * vec3(0.2, 0.45, 0.08) * pow(max(0.0, dot(-v, SUN_DIR)), 3.0) * pow(1.0 - nv, 2.0);
      vec3 h = normalize(v + SUN_DIR);
      float nh = max(0.0, dot(n, h));
      float lit = max(0.0, nl);
      float fres = 0.028 + 0.972 * pow(1.0 - max(0.0, dot(v, h)), 5.0);
      float spec = (ggx(nh, 0.45) * 0.5 + ggx(nh, 0.68) * 0.5) * visibility(lit, nv, 0.55) * fres;
      color += SUN_RGB * spec * lit * 0.6 * shade;
      color += ambientLight(reflect(-v, n)) * 0.05 * pow(1.0 - nv, 4.0);
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, { uAlbedo: { value: albedo }, uNormal: { value: normal }, uSkin: { value: new Color(look.skin) }, uLips: { value: new Color(look.lips) } }, shadow, 245);
}

/** The alien's eyes: solid black and wet, mirroring the sky, with the sun's glint. */
export function alienEyeMaterial(shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    void main() {
      // The cornea over the iris (the disc in the texture's corner) isn't drawn: the eye is one smooth black lens.
      if (distance(vUv, vec2(0.934, 0.934)) < 0.08) discard;
      vec3 n = surfaceNormal();
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      float nl = max(0.0, dot(n, SUN_DIR)) * sunlit(n);
      vec3 color = vec3(0.006, 0.009, 0.008) * (ambientLight(n) + nl * SUN_RGB);
      color += ambientLight(reflect(-v, n)) * (0.04 + 0.96 * pow(1.0 - nv, 5.0));
      vec3 h = normalize(v + SUN_DIR);
      color += SUN_RGB * ggx(max(0.0, dot(n, h)), 0.12) * 0.03 * nl;
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, {}, shadow, 245);
}

/** A knitted beanie: ribbed cuff, finer knit up the crown, a wool fuzz at the edges. */
export function beanieMaterial(color: string, center: [number, number, number], brim: number, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform vec3 uColor;
    uniform vec3 uCenter;
    uniform float uBrim;
    void main() {
      vec3 geo = surfaceNormal();
      vec3 p = vRest - uCenter;
      float around = atan(p.x, p.z);
      float rise = vRest.y - uBrim;
      // 1x1 rib round the head, deep in the folded cuff; it softens away where it's
      // finer than a pixel. The cuff's top edge is a rolled fold.
      float cuff = 1.0 - smoothstep(4.6, 5.4, rise - 0.6 * sin(around));
      float rib = sin(around * 140.0);
      float stitch = sin(rise * 7.0 + abs(sin(around * 70.0)) * 2.0);
      float h = (rib * mix(0.5, 1.4, cuff) + stitch * 0.25 * (1.0 - cuff)) * 0.05;
      float fade = 1.0 - smoothstep(0.35, 1.2, fwidth(around * 140.0));
      vec3 n = bumpNormal(geo, dFdx(h) * fade, dFdy(h) * fade);
      if (!(dot(n, n) > 0.5)) n = geo;
      float heather = noise3(vRest * 4.0) * 0.6 + noise3(vRest * 13.0) * 0.4;
      vec3 base = uColor * (0.8 + 0.4 * heather) * (0.9 + 0.1 * rib * fade * (0.5 + cuff));
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      float nl = dot(n, SUN_DIR);
      float diffuse = clamp((nl + 0.25) / 1.25, 0.0, 1.0);
      float shade = sunlit(geo);
      vec3 color = base * (ambientLight(n) * vAO + diffuse * diffuse * SUN_RGB * shade * mix(1.0, vAO, 0.4));
      // Wool fuzz catches light along the silhouette.
      color += SUN_RGB * base * 0.6 * pow(1.0 - nv, 3.0) * max(0.0, nl + 0.4) * shade;
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, { uColor: { value: new Color(color) }, uCenter: { value: center }, uBrim: { value: brim } }, shadow, 247);
}

/** Where the jeans bend: each knee's rest position, and how far each knee is bent now (0 straight, 1 folded). */
export interface Knees {
  uKneeL: { value: Vector3 };
  uKneeR: { value: Vector3 };
  uBend: { value: Vector2 };
  /** Rest height of the jeans' hems. */
  uHem: { value: number };
}

export interface Outfit {
  /** The tee's cotton, sRGB. */
  tee: string;
  /** Denim: its deep indigo and faded tones, sRGB. */
  denimDark: string;
  denimLight: string;
}

/** The tee and jeans: one texture set, the tee across its top half. */
export function outfitMaterial(albedo: Texture, normal: Texture, ao: Texture, look: Outfit, knees: Knees, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform sampler2D uAlbedo;
    uniform sampler2D uNormal;
    uniform sampler2D uAO;
    uniform vec3 uTee;
    uniform vec3 uDenimDark;
    uniform vec3 uDenimLight;
    uniform vec3 uKneeL;
    uniform vec3 uKneeR;
    uniform vec2 uBend;
    uniform float uHem;
    void main() {
      vec3 geo = surfaceNormal();
      vec3 n = mapNormal(geo, texture(uNormal, vUv).xyz * 2.0 - 1.0, 1.0);
      float ao = texture(uAO, vUv).r;
      bool tee = vUv.y < 0.5;
      vec3 tex = texture(uAlbedo, vUv).rgb;
      vec3 base;
      float sheen;
      if (tee) {
        // Plain cotton with a faint weave.
        float weave = noise3(vRest * vec3(6.0, 6.0, 6.0)) - 0.5;
        base = uTee * (1.0 + weave * 0.04);
        sheen = 0.12;
      } else {
        // The texture's fading kept, in darker indigo.
        float lum = dot(tex, vec3(0.3, 0.55, 0.15));
        base = mix(uDenimDark, uDenimLight, smoothstep(0.03, 0.5, lum));
        // Seams and the twill's diagonal.
        float twill = sin((vRest.x + vRest.y + vRest.z) * 9.0) * 0.5 + 0.5;
        base *= 0.94 + 0.08 * twill;
        sheen = 0.06;
        // Denim creases behind a knee as it bends (the leg faces +z at rest), and
        // stacks in soft rings where the hem breaks over the shoe.
        bool left = vRest.x > 0.0;
        vec3 d = vRest - (left ? uKneeL : uKneeR);
        float bend = left ? uBend.x : uBend.y;
        float behind = smoothstep(2.0, -4.0, d.z);
        float near = 1.0 - smoothstep(3.0, 10.0, abs(d.y + 1.0));
        float fold = sin(d.y * 1.4 + noise3(vRest * 0.35) * 2.5);
        float crease = bend * behind * near;
        float stack = 1.0 - smoothstep(uHem + 3.0, uHem + 13.0, vRest.y);
        float ring = sin(vRest.y * 1.2 + atan(d.x, d.z) * 2.0 + noise3(vRest * 0.3) * 3.0);
        float relief = fold * crease * 0.7 + ring * stack * 0.3;
        n = bumpNormal(n, dFdx(relief), dFdy(relief));
        if (!(dot(n, n) > 0.5)) n = geo;
        ao *= 1.0 - 0.45 * crease * (0.5 - 0.5 * fold) - 0.18 * stack * (0.5 - 0.5 * ring);
      }
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      float nl = dot(n, SUN_DIR);
      // Cloth scatters a little light past its folds.
      float diffuse = clamp((nl + 0.2) / 1.2, 0.0, 1.0);
      diffuse *= diffuse;
      float occlusion = mix(1.0, ao, 0.85);
      float shade = sunlit(geo);
      vec3 color = base * (ambientLight(n) * occlusion + diffuse * SUN_RGB * mix(1.0, ao, 0.4) * shade);
      color += SUN_RGB * base * sheen * pow(1.0 - nv, 3.0) * max(0.0, nl + 0.3) * shade;
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, {
    uAlbedo: { value: albedo }, uNormal: { value: normal }, uAO: { value: ao },
    uTee: { value: new Color(look.tee) }, uDenimDark: { value: new Color(look.denimDark) }, uDenimLight: { value: new Color(look.denimLight) },
    ...knees,
  }, shadow, 244, { defines: { OUTER_LAYER: '1.2' }, side: DoubleSide });
}

export interface ShoeLook {
  upper: string;
  sole: string;
  /** Height of the sole's top edge over its underside (world units). */
  soleTop: number;
  /** Height of the sole's underside in the rest pose. */
  floor: number;
}

/** Skate shoes: suede over a white vulcanized sole, from each point's rest height. */
export function shoeMaterial(look: ShoeLook, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform vec3 uUpper;
    uniform vec3 uSole;
    uniform float uSoleTop;
    uniform float uFloor;
    void main() {
      vec3 n = surfaceNormal();
      float height = vRest.y - uFloor;
      float sole = 1.0 - smoothstep(uSoleTop - 0.15, uSoleTop + 0.15, height);
      // A thin foxing line just above the sole, and suede nap.
      float nap = noise3(vRest * 2.2) * 0.6 + noise3(vRest * 7.0) * 0.4;
      vec3 upper = uUpper * (0.86 + 0.28 * nap);
      vec3 base = mix(upper, uSole * (0.95 + 0.05 * nap), sole);
      float line = smoothstep(0.2, 0.0, abs(height - uSoleTop - 0.9));
      base = mix(base, uSole * 0.8, line * 0.6);
      vec3 v = normalize(cameraPosition - vWorld);
      float nv = max(0.0, dot(n, v));
      float nl = max(0.0, dot(n, SUN_DIR)) * sunlit(n);
      vec3 color = base * (ambientLight(n) * vAO + nl * SUN_RGB * mix(1.0, vAO, 0.4));
      // Suede glows a little at grazing angles; rubber has a soft shine.
      color += SUN_RGB * upper * (1.0 - sole) * 0.25 * pow(1.0 - nv, 2.0) * nl;
      vec3 h = normalize(v + SUN_DIR);
      color += SUN_RGB * sole * ggx(max(0.0, dot(n, h)), 0.5) * 0.04 * nl;
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, {
    uUpper: { value: new Color(look.upper) }, uSole: { value: new Color(look.sole) },
    uSoleTop: { value: look.soleTop }, uFloor: { value: look.floor },
  }, shadow, 242);
}

/** Eyes: the iris texture under a wet, sharp glint. */
export function eyeMaterial(albedo: Texture, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform sampler2D uAlbedo;
    void main() {
      vec3 n = surfaceNormal();
      vec3 v = normalize(cameraPosition - vWorld);
      float nl = max(0.0, dot(n, SUN_DIR)) * sunlit(n);
      // The clear cornea over the iris maps to the disc in the texture's corner: only its glint shows.
      if (distance(vUv, vec2(0.934, 0.934)) < 0.08) {
        float glint = ggx(max(0.0, dot(n, normalize(v + SUN_DIR))), 0.08) * nl;
        if (glint < 4.0) discard;
        outColor = vec4(display(SUN_RGB * min(glint * 0.02, 1.2) + vec3(0.2)), 1.0);
        outInfo = uInfo;
        return;
      }
      vec3 base = texture(uAlbedo, vUv).rgb;
      // Lids shade the eyeball; it's never as lit as the face.
      vec3 color = base * (ambientLight(n) * vec3(0.95, 0.88, 0.82) + nl * SUN_RGB * 0.6);
      vec3 h = normalize(v + SUN_DIR);
      color += SUN_RGB * ggx(max(0.0, dot(n, h)), 0.12) * 0.03 * nl;
      outColor = vec4(display(color), 1.0);
      outInfo = uInfo;
    }
  `, { uAlbedo: { value: albedo } }, shadow, 245);
}

/** Brows and lashes: hair cards, blended over the skin so their hairs fade out at the ends. */
export function hairCardMaterial(albedo: Texture, tint: string, shadow: SunShadow): ShaderMaterial {
  return material(/* glsl */ `
    uniform sampler2D uAlbedo;
    uniform vec3 uTint;
    void main() {
      vec4 tex = texture(uAlbedo, vUv);
      if (tex.a < 0.04) discard;
      vec3 n = surfaceNormal();
      vec3 base = uTint * (0.6 + 0.4 * tex.r);
      float nl = max(0.0, dot(n, SUN_DIR)) * sunlit(n);
      vec3 color = base * (ambientLight(n) + nl * SUN_RGB * 0.8);
      outColor = vec4(display(color), tex.a * 0.85);
      outInfo = uInfo;
    }
  `, { uAlbedo: { value: albedo }, uTint: { value: new Color(tint) } }, shadow, 245, { side: DoubleSide, transparent: true, depthWrite: false });
}
