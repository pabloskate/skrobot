import { DoubleSide, GLSL3, ShaderMaterial, Vector4 } from 'three';
import { WHEEL_R } from '../scene/board';
import { DECK_HALF_WIDTH } from '../scene/skeleton';
import { BOARD_WIDTH_SCALE } from './boardDimensions';
import { SUN } from './materials';

export const BOARD_SURFACE = { grip: 0, underside: 1, maple: 2, aluminum: 3, bushing: 4, urethane: 5, steel: 6, bolt: 7, rubber: 8 } as const;

/** Physical-style finish for the humanoid's board; both MRT targets remain valid. */
export function realisticBoardMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: DoubleSide,
    uniforms: { uAngle: { value: 0 }, uSweep: { value: 0 }, uInfo: { value: new Vector4(234 / 255, 30 / 255, 0, 0) } },
    vertexShader: /* glsl */ `
      in float aSurface;
      in float aLayer;
      flat out float vSurface;
      out float vLayer;
      out vec3 vLocal;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vLocalNormal;
      void main() {
        vSurface = aSurface;
        vLayer = aLayer;
        vLocal = position;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = transpose(mat3(viewMatrix)) * normalize(normalMatrix * normal);
        vLocalNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      flat in float vSurface;
      in float vLayer;
      in vec3 vLocal;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec3 vLocalNormal;
      uniform float uAngle;
      uniform float uSweep;
      uniform vec4 uInfo;
      const vec3 SUN = vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)});
      const float PI = 3.14159265;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1)), f.x), f.y);
      }
      float cover(float d) {
        float aa = max(fwidth(d), 0.001);
        return 1.0 - smoothstep(-aa, aa, d);
      }
      float wood(vec2 p) {
        float bend = noise(vec2(p.x * 0.035, p.y * 0.22));
        return 0.55 * noise(vec2(p.x * 0.11, p.y * 4.0 + bend * 1.2)) + 0.45 * noise(vec2(p.x * 0.04, p.y * 11.0 + bend * 2.0));
      }
      vec3 environment(vec3 r, float rough) {
        vec3 sky = mix(vec3(0.7, 0.79, 0.83), vec3(0.19, 0.31, 0.44), smoothstep(0.0, 1.0, r.y));
        float cloud = pow(max(0.0, dot(r, normalize(vec3(-0.5, 0.75, 0.42)))), mix(22.0, 5.0, rough));
        sky += cloud * vec3(0.4, 0.39, 0.35);
        vec3 ground = mix(vec3(0.15, 0.13, 0.095), vec3(0.4, 0.36, 0.28), smoothstep(-0.8, 0.0, r.y));
        return mix(ground, sky, smoothstep(-0.12, 0.4, r.y));
      }
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 base = vec3(0.53, 0.36, 0.19);
        float rough = 0.52;
        float metal = 0.0;
        float grain = wood(vLocal.xz);
        float microScale = length(fwidth(vLocal));
        if (vSurface < 0.5) {
          // Silicon-carbide grip grain, filtered away at distance rather than
          // swimming across the deck. Larger pressure marks remain readable.
          float fine = noise(vLocal.xz * 8.5);
          float fineFade = 1.0 - smoothstep(0.06, 0.3, microScale);
          float scuff = noise(vLocal.xz * vec2(0.12, 0.5));
          base = vec3(0.019, 0.022, 0.023) * (0.85 + scuff * 0.42 + (fine - 0.5) * fineFade * 0.65);
          rough = 0.94;
          float tip = max(0.0, (abs(vLocal.x) - 38.5) / 9.5);
          float width = ${ (DECK_HALF_WIDTH * BOARD_WIDTH_SCALE).toFixed(5) } * sqrt(max(0.0, 1.0 - tip * tip));
          float edge = 1.0 - cover(abs(vLocal.z) - max(0.0, width - 0.16));
          base = mix(base, vec3(0.29, 0.215, 0.125), edge * 0.8);
        } else if (vSurface < 1.5) {
          base = mix(vec3(0.43, 0.28, 0.13), vec3(0.7, 0.52, 0.3), grain);
          // Restrained original graphic: graphite field, fine pale geometry
          // and a muted cyan registration line, with natural maple at the ends.
          vec2 q = abs(vLocal.xz) - vec2(23.0, 5.5);
          float print = cover(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.4);
          vec3 graphic = vec3(0.033, 0.047, 0.049);
          float line = cover(abs(vLocal.z - 0.115 * vLocal.x) - 0.1) * cover(abs(vLocal.x) - 18.0);
          graphic = mix(graphic, vec3(0.61, 0.65, 0.61), line * 0.8);
          float cyan = cover(abs(vLocal.z + 2.9) - 0.14) * cover(abs(vLocal.x + 5.0) - 10.5);
          graphic = mix(graphic, vec3(0.075, 0.3, 0.31), cyan);
          base = mix(base, graphic, print);
          // Small lengthwise slides and wear toward the kicked tips.
          float scrape = pow(noise(vLocal.xz * vec2(0.07, 7.0)), 10.0) * smoothstep(13.0, 44.0, abs(vLocal.x));
          base = mix(base, vec3(0.6, 0.46, 0.29), scrape * 0.5);
          rough = 0.42;
        } else if (vSurface < 2.5) {
          // Seven physical-height maple laminations and their fine glue lines.
          float layer = floor(clamp(vLayer, 0.0, 0.9999) * 7.0);
          float edge = abs(fract(vLayer * 7.0) - 0.5);
          base = mix(vec3(0.39, 0.24, 0.105), vec3(0.68, 0.48, 0.24), 0.35 + 0.5 * grain);
          base *= 0.89 + 0.15 * mod(layer, 2.0);
          base = mix(base, vec3(0.2, 0.14, 0.08), smoothstep(0.4, 0.5, edge) * 0.65);
          rough = 0.58;
        } else if (vSurface < 3.5) {
          base = vec3(0.43, 0.47, 0.48); metal = 0.91; rough = 0.32;
          base *= 0.95 + noise(vLocal.xz * 13.0) * 0.1 * (1.0 - smoothstep(0.06, 0.3, microScale));
        } else if (vSurface < 4.5) {
          base = vec3(0.022, 0.05, 0.062); rough = 0.65;
        } else if (vSurface < 5.5) {
          base = vec3(0.76, 0.715, 0.58); rough = 0.58;
          float radius = length(vLocal.xy) / ${WHEEL_R.toFixed(2)};
          float side = smoothstep(0.4, 0.85, abs(vLocalNormal.z));
          float band = cover(abs(radius - 0.73) - 0.009);
          base = mix(base, vec3(0.43, 0.44, 0.38), band * side * 0.5);
          // Same rolling angle and signed exposure sweep as the standard board.
          float sweep = clamp(uSweep, -5.23599, 5.23599);
          float lead = sweep >= 0.0 ? 1.0 : -1.0;
          float tail = uAngle - sweep - lead * 0.2;
          float span = sweep + lead * 0.4;
          float along = atan(vLocal.x, vLocal.y) - tail;
          along = span >= 0.0 ? mod(along, 2.0 * PI) : -mod(-along, 2.0 * PI);
          float t = along / span;
          float mark = cover(max(abs(radius - 0.72) - 0.045, max(-t, t - 1.0) * abs(span)));
          base = mix(base, vec3(0.17, 0.22, 0.22), mark * side * 0.72);
          float tread = 0.035 * noise(vec2(atan(vLocal.x, vLocal.y) * 50.0, vLocal.z * 6.0));
          base *= 1.0 - tread;
        } else if (vSurface < 6.5) {
          base = vec3(0.35, 0.39, 0.4); metal = 0.97; rough = 0.23;
        } else if (vSurface < 7.5) {
          base = vec3(0.028, 0.036, 0.038); metal = 0.72; rough = 0.4;
        } else { base = vec3(0.011, 0.015, 0.017); rough = 0.85; }
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 h = normalize(v + SUN);
        float nv = max(0.001, dot(n, v));
        float nl = max(0.0, dot(n, SUN));
        vec3 f0 = mix(vec3(0.035), base, metal);
        vec3 f = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
        vec3 ambient = mix(vec3(0.22, 0.2, 0.165), vec3(0.42, 0.48, 0.55), n.y * 0.5 + 0.5);
        vec3 color = base * (1.0 - metal * 0.75) * (ambient + nl * vec3(0.83, 0.79, 0.7));
        float a2 = pow(rough, 4.0);
        float nh = max(0.0, dot(n, h));
        float denom = nh * nh * (a2 - 1.0) + 1.0;
        float d = a2 / max(0.0001, PI * denom * denom);
        float k = (rough + 1.0) * (rough + 1.0) / 8.0;
        float g = nv / (nv * (1.0 - k) + k) * nl / max(0.001, nl * (1.0 - k) + k);
        color += min(vec3(2.0), f * d * g / max(0.004, 4.0 * nv * max(nl, 0.001))) * nl * 0.75;
        color += environment(reflect(-v, n), rough) * f * (1.0 - rough * 0.65);
        color = color / (1.0 + color * 0.2);
        outColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
        outInfo = uInfo;
      }
    `,
  });
}
