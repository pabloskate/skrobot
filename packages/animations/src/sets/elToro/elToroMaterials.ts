import { DoubleSide, GLSL3, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { glslRgb, SUN } from '../../three/materials';

/** Deterministic, world-anchored materials: no texture downloads or camera-facing decals. */
export const EL_TORO_NOISE = /* glsl */ `
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float weather(vec2 p) {
  return noise(p) * 0.57 + noise(p * 2.13 + 7.1) * 0.28 + noise(p * 4.31 + 19.7) * 0.15;
}
// Fade subpixel grain rather than letting it sparkle when the camera moves.
float grain(vec2 p) {
  float visibility = 1.0 - smoothstep(0.45, 1.8, max(length(dFdx(p)), length(dFdy(p))));
  return (noise(p) - 0.5) * visibility;
}
`;

/** Baked mesh attributes stay compatible with the existing two-target outline renderer. */
export function elToroPropMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      in vec3 aCorner;
      in vec4 aColor;
      in vec3 aLit;
      in vec2 aBand;
      in vec4 aInfo;
      out vec3 vLocal;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vColor;
      out vec2 vBand;
      flat out vec4 vInfo;
      void main() {
        vLocal = position;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normal;
        vColor = aColor.rgb;
        vBand = aBand;
        vInfo = aInfo;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      in vec3 vLocal;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec3 vColor;
      in vec2 vBand;
      flat in vec4 vInfo;
      const vec3 SUN = vec3(${SUN.x.toFixed(5)}, ${SUN.y.toFixed(5)}, ${SUN.z.toFixed(5)});
      ${EL_TORO_NOISE}
      void main() {
        vec3 n = normalize(vNormal);
        vec2 p = abs(n.y) > 0.65 ? vLocal.xz : abs(n.z) > 0.5 ? vLocal.xy : vLocal.zy;
        float id = floor(vInfo.x * 255.0 + 0.5);
        float surface = floor(vInfo.w * 255.0 / 4.0 + 0.01);
        vec3 color = vColor;
        if (id >= 60.0 && id <= 69.0) {
          // Dull galvanized steel, with a bright polished riding edge.
          float wear = smoothstep(0.35, 0.88, n.y) * (0.65 + 0.35 * noise(p * 0.13));
          color = mix(color, ${glslRgb('#c0c3bb')}, wear * 0.7);
          color *= 0.76 + 0.26 * max(0.0, dot(n, SUN));
          vec3 eye = normalize(cameraPosition - vWorld);
          float spec = pow(max(dot(n, normalize(SUN + eye)), 0.0), 42.0);
          color += vec3(0.22) * spec;
          color += grain(p * 2.5) * 0.035;
        } else {
          // Tubular building hardware supplies split paint; shade it around its true world normal.
          // Masonry and vegetation already have daylight baked into their vertices.
          if (vBand.x < 1.5) color *= 0.67 + 0.34 * max(dot(n, SUN), 0.0);
          // Paint, masonry and foliage have small, non-repeating surface variation.
          color *= 0.94 + 0.10 * weather(p * 0.08);
          color += grain(p * 1.8) * 0.035;
          if (surface == 10.0) {
            // Rough split-face block pores, with accumulated dirt low on the wall.
            color += grain(p * 0.95) * 0.055;
            color *= 1.0 - 0.10 * (1.0 - smoothstep(5.0, 50.0, vLocal.y)) * weather(p * 0.16);
          } else if (surface == 11.0) {
            color *= 0.93 + 0.10 * weather(p * vec2(0.025, 0.11));
          } else if (surface == 13.0) {
            // Small overlapping leaves break up the volumes between the modeled leaf tips.
            float leaf = weather((vLocal.xz + vLocal.y * vec2(0.7, 0.4)) * 0.33);
            color *= 0.77 + 0.38 * smoothstep(0.24, 0.73, leaf);
            color += vec3(0.035, 0.04, 0.018) * smoothstep(0.67, 0.81, leaf);
          }
        }
        float haze = 0.72 * smoothstep(2400.0, 12000.0, length(vWorld - cameraPosition));
        color = mix(color, ${glslRgb('#c6d0cc')}, haze);
        outColor = vec4(color, 1.0);
        outInfo = vInfo;
      }
    `,
  });
}

/** Southern California daylight and distant hills, without the plaza's graphic city backdrop. */
export function elToroSkyMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new Vector2() },
      uFrustum: { value: new Vector4() },
      uRight: { value: new Vector3() },
      uUp: { value: new Vector3() },
      uBack: { value: new Vector3() },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      uniform vec2 uRes;
      uniform vec4 uFrustum;
      uniform vec3 uRight;
      uniform vec3 uUp;
      uniform vec3 uBack;
      ${EL_TORO_NOISE}
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        vec3 ray = normalize(uRight * mix(uFrustum.x, uFrustum.y, uv.x)
          + uUp * mix(uFrustum.z, uFrustum.w, uv.y) - uBack);
        float altitude = max(ray.y, 0.0);
        vec3 color = mix(${glslRgb('#d6dcd5')}, ${glslRgb('#75a6c5')}, pow(altitude, 0.48));
        // Thin cirrus rather than hard-edged cartoon cloud icons.
        vec2 cloudAt = ray.xz / max(ray.y + 0.3, 0.1);
        float cloud = smoothstep(0.57, 0.82, weather(cloudAt * vec2(1.6, 6.0)));
        color = mix(color, ${glslRgb('#edf0e8')}, cloud * smoothstep(0.05, 0.35, altitude) * 0.38);
        float azimuth = atan(ray.x, ray.z);
        float ridge = 0.018 + 0.016 * noise(vec2(azimuth * 7.0, 3.0));
        color = mix(color, ${glslRgb('#a6b5ac')}, 0.6 * (1.0 - smoothstep(ridge - 0.002, ridge + 0.002, ray.y)));
        outColor = vec4(color, 1.0);
        outInfo = vec4(0.0);
      }
    `,
  });
}
