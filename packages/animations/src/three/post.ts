import {
  AlwaysDepth,
  GLSL3,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { PALETTE } from '../scene/camera';
import { BAY } from '../scene/waterfrontPanorama';
import { GARMENT, INK_PROP, INK_ROBOT, rgb } from './materials';

/**
 * Screen passes for TrickScene3D.
 *
 * The ink pass is what makes the 3D robot read like the SVG one. TrickScene
 * paints each body part (an arm, a leg with its shoe, the head with its
 * neck) as one silhouette with its outline behind it, then paints the parts
 * over one another back to front. So there is no line where a shin enters
 * its shoe, but there is one wherever a part covers another, including
 * where an arm meets the chest.
 *
 * Here every pixel knows its part, its paint priority, and the outline its
 * part casts (materials.ts writes that alongside the color). A pixel is inked
 * when a different part in front of it lies within that part's outline
 * width: the outline falls outside the nearer part, over whatever it covers,
 * exactly where TrickScene's would. Depth decides who is in front; parts
 * touching within a hair of each other fall back to TrickScene's paint order,
 * except pieces of one garment, which join seamlessly where they touch.
 */

const glsl = (hex: string) => `vec3(${rgb(hex).map((c) => c.toFixed(5)).join(', ')})`;

const QUAD_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Widest an outline may be drawn, in device pixels. */
export const MAX_INK_PX = 16;
/** Side of the square tiles the edge map keeps one texel for, in device pixels. */
export const EDGE_TILE = 8;
/**
 * How far in front (world units) one piece of a garment must be to outline
 * itself over another. More than touching: where a sleeve meets the tee the
 * two surfaces slant away together, so the seam's ends run apart in depth.
 */
const GARMENT_GAP = 4;

const GLSL_DEPTH = /* glsl */ `
uniform float uNear;
uniform float uFar;
float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
`;

/**
 * The edge map: one texel per tile of the picture, holding how wide (in
 * pixels) the widest outline cast from inside that tile is — zero where no
 * two parts meet, or where neither of them outlines itself. The ink pass
 * searches each pixel's neighborhood only as far as the outlines of the
 * tiles around it reach, and not at all far from any edge, which is most of
 * the picture.
 */
export function edgeMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      uniform sampler2D uInfo;
      uniform sampler2D uDepth;
      uniform ivec2 uSize;
      uniform float uFocalPx;
      ${GLSL_DEPTH}
      float inkClass(vec4 a) { return mod(floor(a.a * 255.0 + 0.5), 4.0); }
      /** The outline width of whichever of two different parts is nearer, if it casts one. */
      float outlineAcross(vec4 a, ivec2 pa, vec4 b, ivec2 pb) {
        if (abs(a.r - b.r) < 0.5 / 255.0) return 0.0;
        float za = viewZ(texelFetch(uDepth, pa, 0).r);
        float zb = viewZ(texelFetch(uDepth, pb, 0).r);
        float wa = inkClass(a) > 0.5 ? a.b * 4.0 * uFocalPx / za : 0.0;
        float wb = inkClass(b) > 0.5 ? b.b * 4.0 * uFocalPx / zb : 0.0;
        // Touching parts can outline either way; anything else outlines the nearer one.
        return abs(za - zb) < 2.0 ? max(wa, wb) : za < zb ? wa : wb;
      }
      void main() {
        ivec2 origin = ivec2(gl_FragCoord.xy) * ${EDGE_TILE};
        ivec2 last = uSize - 1;
        float widest = 0.0;
        for (int y = 0; y < ${EDGE_TILE}; y++) {
          for (int x = 0; x < ${EDGE_TILE}; x++) {
            ivec2 p = min(origin + ivec2(x, y), last);
            ivec2 right = min(p + ivec2(1, 0), last);
            ivec2 down = min(p + ivec2(0, 1), last);
            vec4 a = texelFetch(uInfo, p, 0);
            widest = max(widest, outlineAcross(a, p, texelFetch(uInfo, right, 0), right));
            widest = max(widest, outlineAcross(a, p, texelFetch(uInfo, down, 0), down));
          }
        }
        // Pixels, a quarter-pixel at a time; a pixel more for the antialiased rim.
        outColor = vec4(widest > 0.0 ? min(${MAX_INK_PX}.0, widest + 1.0) / 64.0 : 0.0, 0.0, 0.0, 1.0);
      }
    `,
    uniforms: {
      uInfo: { value: null as Texture | null },
      uDepth: { value: null as Texture | null },
      uSize: { value: [1, 1] },
      uFocalPx: { value: 1 },
      uNear: { value: 1 },
      uFar: { value: 1000 },
    },
    depthTest: false,
    depthWrite: false,
  });
}

export function inkMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec2 vUv;
      uniform sampler2D uColor;
      uniform sampler2D uInfo;
      uniform sampler2D uDepth;
      uniform sampler2D uEdges;
      uniform vec2 uTexel;
      uniform float uFocalPx;
      /** Parts nearer than this (world units) to each other count as touching. */
      uniform float uTouch;
      /** The set's prop outline color. */
      uniform vec3 uPropInk;
      /**
       * The waterfront's light over its set (not over the rider): the air
       * fading the horizon, a warm wash from the sun's side and cool shade
       * opposite, and a vignette. viewBox geometry: the picture's box, and the
       * horizon's row.
       */
      uniform int uOverlays;
      uniform vec4 uBox;
      uniform vec2 uRes;
      uniform float uHorizon;
      const vec3 INK = ${glsl(PALETTE.ink)};
      const vec3 AIR = ${glsl(BAY.horizon)};
      const vec3 WARM = ${glsl('#ffd2a1')};
      const vec3 COOL = ${glsl('#5b4aa8')};
      const vec3 SHADE = ${glsl('#2a1f5c')};

      vec4 over(vec4 under, vec3 color, float a) {
        return vec4(color * a + under.rgb * (1.0 - a), a + under.a * (1.0 - a));
      }
      vec4 setLight(vec4 c) {
        vec2 vb = vec2(uBox.x + gl_FragCoord.x / uRes.x * uBox.z, uBox.y + (1.0 - gl_FragCoord.y / uRes.y) * uBox.w);
        float t = (vb.y - (uHorizon - 60.0)) / 110.0;
        if (t >= 0.0 && t <= 1.0) c = over(c, AIR, t < 0.5 ? 0.32 * t / 0.5 : t < 0.62 ? 0.32 : 0.32 * (1.0 - t) / 0.38);
        vec2 p1 = vec2(uBox.x + uBox.z, uBox.y);
        vec2 d = vec2(-uBox.z, uBox.w);
        float w = clamp(dot(vb - p1, d) / dot(d, d), 0.0, 1.0);
        if (w < 0.5) c = over(c, WARM, 0.24 * (1.0 - w / 0.5));
        else if (w > 0.78) c = over(c, COOL, 0.1 * (w - 0.78) / 0.22);
        float r = length(vb - (uBox.xy + 0.5 * uBox.zw)) / (length(uBox.zw) * 0.6);
        if (r > 0.55) c = over(c, SHADE, 0.26 * min(1.0, (r - 0.55) / 0.45));
        return c;
      }
      bool riderAt(vec4 info) { return abs(mod(floor(info.a * 255.0 + 0.5), 4.0) - ${INK_ROBOT.toFixed(1)}) < 0.5; }

      ${GLSL_DEPTH}

      void main() {
        // How far the outlines cast from the tiles around this pixel reach.
        // Tiles two away only matter for outlines wider than a tile.
        ivec2 tile = ivec2(gl_FragCoord.xy) / ${EDGE_TILE};
        ivec2 tiles = textureSize(uEdges, 0) - 1;
        float radius = 0.0;
        for (int ty = -1; ty <= 1; ty++) {
          for (int tx = -1; tx <= 1; tx++) radius = max(radius, texelFetch(uEdges, clamp(tile + ivec2(tx, ty), ivec2(0), tiles), 0).r);
        }
        if (radius * 64.0 > ${EDGE_TILE}.0) {
          for (int ty = -2; ty <= 2; ty++) {
            for (int tx = -2; tx <= 2; tx++) radius = max(radius, texelFetch(uEdges, clamp(tile + ivec2(tx, ty), ivec2(0), tiles), 0).r);
          }
        }
        int reachPx = int(ceil(radius * 64.0));
        vec4 own = texture(uInfo, vUv);
        float ownDepth = texture(uDepth, vUv).r;
        gl_FragDepth = ownDepth;
        bool lit = uOverlays == 1 && !riderAt(own);
        if (reachPx == 0) {
          vec4 c = texture(uColor, vUv);
          outColor = lit ? setLight(c) : c;
          return;
        }
        float ownSurface = floor(floor(own.a * 255.0 + 0.5) / 4.0);
        float z = viewZ(texture(uDepth, vUv).r);
        float best = 0.0;
        float bestInk = 0.0;
        float bestDepth = ownDepth;
        float reach = float(reachPx) + 0.5;
        for (int dy = -reachPx; dy <= reachPx; dy++) {
          int span = int(sqrt(max(0.0, reach * reach - float(dy * dy))));
          for (int dx = -span; dx <= span; dx++) {
            float d = length(vec2(dx, dy));
            if (d == 0.0) continue;
            vec2 at = vUv + vec2(float(dx), float(dy)) * uTexel;
            vec4 other = texture(uInfo, at);
            float code = floor(other.a * 255.0 + 0.5);
            float kind = mod(code, 4.0);
            if (kind < 0.5) continue;
            if (abs(other.r - own.r) < 0.5 / 255.0) continue;
            float oz = viewZ(texture(uDepth, at).r);
            float surface = floor(code / 4.0);
            bool sameSurface = surface > 0.5 && abs(surface - ownSurface) < 0.5;
            // Pieces of one garment: no seam where they meet, only a line where one is clearly in front.
            bool garment = sameSurface && surface > ${GARMENT}.0 - 0.5;
            bool crease = sameSurface && !garment && abs(other.g - own.g) > 0.5 / 255.0;
            bool front = crease
              ? other.g > own.g
              : garment
                ? oz < z - ${GARMENT_GAP.toFixed(1)}
                : oz < z - uTouch || (abs(oz - z) <= uTouch && other.g > own.g);
            if (!front) continue;
            float width = other.b * 4.0 * uFocalPx / oz;
            float cover = clamp(width + 1.0 - d, 0.0, 1.0);
            if (cover > best) {
              best = cover;
              bestInk = kind;
              bestDepth = texture(uDepth, at).r;
            }
          }
        }
        // Props' outlines go under the set's light, the rider's over it.
        vec4 c = texture(uColor, vUv);
        bool propInk = bestInk > ${INK_PROP.toFixed(1)} - 0.5;
        if (propInk) c = mix(c, vec4(uPropInk, 1.0), best);
        if (lit) c = setLight(c);
        if (!propInk) c = mix(c, vec4(INK, 1.0), best);
        // Transparent set details must also stay behind the expanded silhouette.
        if (best > 0.0) gl_FragDepth = min(ownDepth, bestDepth);
        outColor = c;
      }
    `,
    uniforms: {
      uColor: { value: null as Texture | null },
      uInfo: { value: null as Texture | null },
      uDepth: { value: null as Texture | null },
      uEdges: { value: null as Texture | null },
      uTexel: { value: new Vector2() },
      uFocalPx: { value: 1 },
      uNear: { value: 1 },
      uFar: { value: 1000 },
      uTouch: { value: 1.5 },
      uPropInk: { value: new Vector3() },
      uOverlays: { value: 0 },
      uBox: { value: new Vector4() },
      uRes: { value: new Vector2() },
      uHorizon: { value: 0 },
    },
    depthTest: true,
    depthFunc: AlwaysDepth,
    depthWrite: true,
  });
}

/** One direction of a Gaussian blur, for the cast shadows. */
export function blurMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec2 vUv;
      uniform sampler2D uSource;
      /** One texel along the blur's direction, and the blur's sigma in texels. */
      uniform vec2 uStep;
      uniform float uSigma;
      void main() {
        float sigma = max(uSigma, 0.3);
        // 13 taps, spread to cover about two and a half sigma either side.
        float spacing = max(1.0, sigma * 2.5 / 6.0);
        vec4 sum = vec4(0.0);
        float total = 0.0;
        for (int i = -6; i <= 6; i++) {
          float x = float(i) * spacing;
          float w = exp(-0.5 * x * x / (sigma * sigma));
          sum += texture(uSource, vUv + uStep * x) * w;
          total += w;
        }
        // The rider's shadows soften; a set's props' (the fourth channel) stay crisp, as TrickScene's.
        outColor = vec4(sum.rgb / total, texture(uSource, vUv).a);
      }
    `,
    uniforms: {
      uSource: { value: null as Texture | null },
      uStep: { value: new Vector2() },
      uSigma: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
}

export function fxaaMaterial() {
  const material = new ShaderMaterial({
    ...FXAAShader,
    uniforms: { tDiffuse: { value: null }, resolution: { value: new Vector2() } },
    depthTest: false,
    depthWrite: false,
  });
  return material;
}

/** Copy the inked color before overlays sample its depth in a separate framebuffer. */
export function copyMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec2 vUv;
      uniform sampler2D uSource;
      void main() { outColor = texture(uSource, vUv); }
    `,
    uniforms: { uSource: { value: null as Texture | null } },
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * Dust puffs: discs facing the camera, see-through like TrickScene's. They
 * are drawn after the outlines so they never cast or catch ink, and test
 * themselves against the scene's depth by hand.
 */
export function dustMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `
      in vec4 aPuff;
      in float aOpacity;
      out vec2 vCorner;
      out float vOpacity;
      void main() {
        vCorner = position.xy;
        vOpacity = aOpacity;
        vec4 center = modelViewMatrix * vec4(aPuff.xyz, 1.0);
        gl_Position = projectionMatrix * vec4(center.xyz + vec3(position.xy * aPuff.w, 0.0), 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec2 vCorner;
      in float vOpacity;
      uniform sampler2D uDepth;
      uniform vec2 uRes;
      const vec3 DUST = ${glsl(PALETTE.dust)};
      void main() {
        float d = length(vCorner) - 1.0;
        float w = max(fwidth(d), 1e-4);
        float a = 1.0 - smoothstep(-w, w, d);
        if (a <= 0.0) discard;
        if (gl_FragCoord.z > texture(uDepth, gl_FragCoord.xy / uRes).r + 1e-6) discard;
        outColor = vec4(DUST, a * vOpacity);
      }
    `,
    uniforms: {
      uDepth: { value: null as Texture | null },
      uRes: { value: new Vector2() },
    },
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
  });
}

export const shadowChannel = {
  bar: [1, 0, 0, 0],
  board: [0, 1, 0, 0],
  body: [0, 0, 1, 0],
} as const;
