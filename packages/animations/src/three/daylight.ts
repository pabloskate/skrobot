import { Vector3, Vector4 } from 'three';
import { SET_SCALE } from '../sets/setScale';
import { LOOK_BOX_SHADOW_GLSL } from '../sets/surfaces';
import { SUN } from './materials';

/** The landmark's existing shadow boxes, in its moving scenery frame. */
export interface SpotShade {
  origin: Vector3;
  count: number;
  min: Vector4[];
  max: Vector4[];
  look: Vector4;
  soffit: number;
}

// WebGL expects a complete uniform array even on streets with no occluders.
const OPEN_STREET: SpotShade = {
  origin: new Vector3(), count: 0, min: Array.from({ length: 12 }, () => new Vector4()),
  max: Array.from({ length: 12 }, () => new Vector4()), look: new Vector4(), soffit: 0,
};

/** Shared by the robot and its board. Bind once on a set change. The origin follows the scrolling scenery. */
export class RiderDaylight {
  readonly uniforms = {
    uSpotOrigin: { value: OPEN_STREET.origin }, uBoxCount: { value: 0 },
    uBoxMin: { value: OPEN_STREET.min }, uBoxMax: { value: OPEN_STREET.max },
    uLook: { value: OPEN_STREET.look }, uSoffit: { value: 0 },
  };

  setSpot(shade = OPEN_STREET) {
    const u = this.uniforms;
    u.uSpotOrigin.value = shade.origin;
    u.uBoxCount.value = shade.count;
    u.uBoxMin.value = shade.min;
    u.uBoxMax.value = shade.max;
    u.uLook.value = shade.look;
    u.uSoffit.value = shade.soffit;
  }
}

/** The board's warm sun, sky/ground reflection and roughness-dependent metal response, in linear light. */
export const GLSL_DAYLIGHT = /* glsl */ `
const vec3 SUN = vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)});
const float PI = 3.14159265;
${LOOK_BOX_SHADOW_GLSL}
uniform vec3 uSpotOrigin;
uniform float uSoffit;

// Direct sun and ambient sky exposure at this point, including the shadow edge across a moving rider.
vec2 daylightAt(vec3 world) {
  if (uBoxCount == 0) return vec2(1.0);
  vec3 p = (world - uSpotOrigin) / ${SET_SCALE.toFixed(8)};
  float sky = uSoffit > 0.0 ? mix(1.0, lookSkyOpen(p), 0.75 * uSoffit) : 1.0;
  return vec2(1.0 - lookBoxShadow(p), sky);
}
vec3 environment(vec3 r, float rough) {
  vec3 sky = mix(vec3(0.7, 0.79, 0.83), vec3(0.19, 0.31, 0.44), smoothstep(0.0, 1.0, r.y));
  float cloud = pow(max(0.0, dot(r, normalize(vec3(-0.5, 0.75, 0.42)))), mix(22.0, 5.0, rough));
  sky += cloud * vec3(0.4, 0.39, 0.35);
  vec3 ground = mix(vec3(0.15, 0.13, 0.095), vec3(0.4, 0.36, 0.28), smoothstep(-0.8, 0.0, r.y));
  return mix(ground, sky, smoothstep(-0.12, 0.4, r.y));
}
vec3 daylight(vec3 base, float rough, float metal, vec3 n, vec3 v, vec2 exposure) {
  vec3 h = normalize(v + SUN);
  float nv = max(0.001, dot(n, v));
  float nl = max(0.0, dot(n, SUN));
  vec3 f0 = mix(vec3(0.035), base, metal);
  vec3 f = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
  vec3 ambient = mix(vec3(0.22, 0.2, 0.165), vec3(0.42, 0.48, 0.55), n.y * 0.5 + 0.5);
  vec3 color = base * (1.0 - metal * 0.75) * (ambient * exposure.y + nl * vec3(0.83, 0.79, 0.7) * exposure.x);
  float a2 = pow(rough, 4.0);
  float nh = max(0.0, dot(n, h));
  float denom = nh * nh * (a2 - 1.0) + 1.0;
  float d = a2 / max(0.0001, PI * denom * denom);
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float g = nv / (nv * (1.0 - k) + k) * nl / max(0.001, nl * (1.0 - k) + k);
  color += min(vec3(2.0), f * d * g / max(0.004, 4.0 * nv * max(nl, 0.001))) * nl * 0.75 * exposure.x;
  return color + environment(reflect(-v, n), rough) * f * (1.0 - rough * 0.65) * exposure.y;
}
vec3 displayDaylight(vec3 color) {
  color = color / (1.0 + color * 0.2);
  return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
}
`;
