import { GLSL3, ShaderMaterial, Vector2, Vector3 } from 'three';
import { X0 } from '../../motion/trick';
import { glslRgb } from '../../three/materials';
import { EL_TORO_NOISE } from '../elToro/elToroMaterials';
import { SET_FOOT, SET_SCALE } from '../setScale';
import { WATER_Z } from './waterfrontLayout';

/**
 * Sealed concrete pours extending inland from the quay. All texture coordinates
 * are in feet in the moving street frame, including the saw cuts and drain iron.
 */
const FRAGMENT = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec2 vGround;
uniform vec2 uRes;
uniform float uScroll;
uniform sampler2D uShadow;
uniform vec3 uShadowOpacity;
${EL_TORO_NOISE}

// Pixel-filter a strip of full world width 2 * radius. Narrow joints and grate
// slots keep their average coverage when viewed down the length of the wharf.
float strip(float distanceToLine, float radius, float footprint) {
  float w = max(footprint, 0.0001);
  return clamp(min(w, min(2.0 * radius, radius + 0.5 * w - abs(distanceToLine))) / w, 0.0, 1.0);
}

vec3 flatwork(vec2 q, vec2 pixel) {
  const vec2 pourSize = vec2(8.5, 7.25);
  vec2 grid = (q + vec2(2.3, 1.4)) / pourSize;
  vec2 id = floor(grid);
  vec2 local = fract(grid) * pourSize;
  vec2 edges = min(local, pourSize - local);
  float batch = hash(id + 2.21);
  float cloud = weather(q * 0.47 + 13.8);
  float salt = weather(q * 1.83 + 4.5);
  vec3 c = mix(${glslRgb('#a5a399')}, ${glslRgb('#c7c4b9')},
    clamp(0.50 + 0.30 * (batch - 0.5) + 0.86 * (cloud - 0.5) + 0.28 * (salt - 0.5), 0.0, 1.0));

  // The trowelled skim coat covers most of the aggregate. At wheel height
  // the fine mineral grain and the drag of the float are barely visible.
  float sand = grain(q * 53.0);
  float finish = grain(vec2(q.x * 1.2 + batch * 7.0, q.y * 22.0 + 1.8 * cloud));
  c += vec3(0.048 * sand + 0.019 * finish + 0.032 * grain(q * 12.0));
  float silt = smoothstep(0.53, 0.80, weather(q * 0.16 + 30.6) + 0.18 * (salt - 0.5));
  c *= 1.0 - silt * vec3(0.075, 0.085, 0.095);

  // Soft broken edges around the original saw cuts and a narrow dark seal.
  float spall = smoothstep(0.50, 0.76, salt) * 0.034;
  vec2 seam = vec2(strip(edges.x, 0.013 + spall, pixel.x), strip(edges.y, 0.013 + spall, pixel.y));
  float border = min(edges.x, edges.y);
  c *= 1.0 - 0.085 * (1.0 - smoothstep(0.025, 0.13, border)) * (0.6 + salt);
  c = mix(c, c * vec3(0.57, 0.56, 0.54), max(seam.x, seam.y));

  // A few corners fractured back to the joint. Their jagged faces taper
  // toward either end and vary with the concrete rather than with view angle.
  if (batch < 0.24 && max(local.x, local.y) < 2.5) {
    float run = 0.78 + 1.45 * hash(id + 31.2);
    float slope = 0.55 + 0.42 * hash(id + 8.7);
    float d = local.y + local.x * slope - run + (salt - 0.5) * 0.38;
    float crack = strip(d, 0.007 + 0.012 * cloud, pixel.y + pixel.x * slope);
    c *= 1.0 - 0.37 * crack;
  }

  // Old urethane traces fade into the skim coat along the riding line.
  float wear = grain(q * vec2(0.33, 6.0) + 7.7);
  c *= 1.0 - 0.08 * smoothstep(0.13, 0.35, wear) * (1.0 - smoothstep(0.2, 2.9, abs(q.y)));
  return c;
}

// Flush catch basins, just inland of the coping. A cast frame surrounds the
// recessed bars. Salt has taken the black finish back to iron along their lips.
vec3 catchBasin(vec3 cement, vec2 q, vec2 pixel, float fromWater) {
  vec2 p = vec2(mod(q.x + 11.0, 22.0) - 11.0, fromWater - 3.6);
  vec2 edge = abs(p) - vec2(0.98, 0.54);
  float body = max(edge.x, edge.y);
  float aa = max(pixel.x, pixel.y) * 0.5 + 0.001;
  if (body > aa + 0.10) return cement;
  float speckle = noise(q * 7.2);
  vec3 iron = mix(${glslRgb('#514e46')}, ${glslRgb('#827a69')}, speckle);
  float slot = mod(p.x + 0.082, 0.164) - 0.082;
  float opening = strip(slot, 0.041, pixel.x);
  float bevel = strip(slot - 0.044, 0.012, pixel.x);
  float inset = 1.0 - smoothstep(-0.095 - aa, -0.095 + aa, body);
  iron += vec3(0.11) * bevel * inset;
  iron = mix(iron, ${glslRgb('#333733')}, opening * inset);
  return mix(cement, iron, 1.0 - smoothstep(-aa, aa, body));
}

void main() {
  float fromWater = (vGround.y - ${WATER_Z.toFixed(2)}) / ${SET_FOOT.toFixed(2)};
  if (fromWater < 0.0) discard;
  vec2 q = (vGround + vec2(${X0.toFixed(2)} + uScroll, 0.0)) / ${SET_FOOT.toFixed(2)};
  vec2 pixel = fwidth(q);
  vec3 color = flatwork(q, pixel);
  float splash = 1.0 - smoothstep(1.2, 2.1 + 0.9 * noise(q * 0.6), fromWater);
  color *= 1.0 - splash * vec3(0.22, 0.20, 0.185);
  color = catchBasin(color, q, pixel, fromWater);

  // Preserve the surface detail under the rider, board and quay furniture.
  vec4 s = texture(uShadow, gl_FragCoord.xy / uRes);
  vec3 lit = 1.0 - s.rgb * uShadowOpacity;
  float blocked = 1.0 - lit.r * lit.g * lit.b * (1.0 - 0.36 * s.a);
  color *= mix(vec3(1.0), vec3(0.49, 0.54, 0.60), min(1.6 * blocked, 1.0));
  // At grazing angles a pixel can span several pours. Their grain settles
  // into the quay's average tone, then sea haze softens the far end.
  color = mix(color, ${glslRgb('#afaea5')}, smoothstep(0.45, 3.0, max(pixel.x, pixel.y)));
  float depthFeet = 1.0 / (gl_FragCoord.w * ${(SET_SCALE * SET_FOOT).toFixed(5)});
  color = mix(color, ${glslRgb('#b4c5cf')}, 0.67 * smoothstep(85.0, 1000.0, depthFeet));
  outColor = vec4(color, 1.0);
  outInfo = vec4(0.0);
}
`;

export function waterfrontGroundMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `
      out vec2 vGround;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vGround = world.xz / ${SET_SCALE.toFixed(6)};
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: FRAGMENT,
    uniforms: {
      uRes: { value: new Vector2() },
      uScroll: { value: 0 },
      uShadow: { value: null },
      uShadowOpacity: { value: new Vector3() },
    },
  });
}
