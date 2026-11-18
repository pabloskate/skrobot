import { FOOT } from '../../units';
import { SET_SCALE } from '../setScale';
import { WATER_Z } from './waterfrontLayout';

const METERS_PER_UNIT = 0.3048 / FOOT;

/** Advect the photographed chop across the water plane and light its moving facets. */
export const HARBOR_WATER = /* glsl */ `
float waveSlope(vec2 p, vec2 k, float phase) {
  // The far bay compresses many crests into a pixel at grazing angles.
  // Remove unresolved frequencies before they can sparkle as the camera moves.
  float pixelPhase = abs(dot(dFdx(p), k)) + abs(dot(dFdy(p), k));
  return cos(dot(p, k) + phase) * (1.0 - smoothstep(0.9, 3.1, pixelPhase));
}

// The shore photographs run out about ten degrees below the waterline. At
// steep angles, continue their open-water detail in overlapping angular
// bands. Both samples retain a vertical footprint, even across a band edge.
vec3 waterBand(vec2 heading, float phase) {
  float angle = 0.097 + 0.079 * fract(phase);
  float yaw = 0.028 * sin(floor(phase) * 2.4);
  vec2 direction = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * heading;
  return sampleHarbor(vec3(direction.x * cos(angle), -sin(angle), direction.y * cos(angle)));
}

vec3 waterPhoto(vec3 ray) {
  float down = -asin(clamp(ray.y, -1.0, 1.0));
  if (down <= 0.1365) return sampleHarbor(ray);
  float phase = (down - 0.097) / 0.079;
  vec2 heading = ray.xz / max(length(ray.xz), 0.00001);
  return mix(waterBand(heading, phase), waterBand(heading, phase + 0.5), abs(2.0 * fract(phase) - 1.0));
}

vec3 harborWater(vec3 still, vec3 ray, vec3 eye, float time) {
  // The waterline sits four feet down the face of the quay. Intersect the
  // actual view ray so a crest retains its position as the rider orbits it.
  if (ray.y >= -0.003 || ray.z >= 0.0) return still;
  float distanceToWater = (eye.y * ${METERS_PER_UNIT.toFixed(8)} + 1.22) / -ray.y;
  vec3 surfaceRay = ray * distanceToWater;
  vec2 p = eye.xz * ${METERS_PER_UNIT.toFixed(8)} + surfaceRay.xz;
  if (p.y > ${(WATER_Z * SET_SCALE * METERS_PER_UNIT).toFixed(5)}) return still;
  // Keep boats, the far bank and its immediate reflection registered with the land.
  float coverage = smoothstep(0.003, 0.021, -ray.y) * (1.0 - smoothstep(100.0, 350.0, distanceToWater));
  if (coverage <= 0.0) return still;

  // Two longer cross swells carry shorter, irregular wind ripples on their backs.
  float bend = sin(dot(p, vec2(0.21, 0.16)) - 0.42 * time);
  float swell = waveSlope(p, vec2(0.67, -1.35), -1.76 * time + bend);
  float crossSwell = waveSlope(p, vec2(-1.46, -1.02), -2.11 * time + 1.3 - 0.8 * bend);
  float chop = waveSlope(p, vec2(2.2, -4.7), -3.58 * time + 1.9 * swell);
  float ripple = waveSlope(p, vec2(4.4, -9.1), -5.12 * time + 1.7 * crossSwell + 0.8 * chop);
  vec2 slope = vec2(0.067, -0.115) * swell + vec2(-0.059, -0.051) * crossSwell
             + vec2(0.038, -0.077) * chop + vec2(0.023, -0.048) * ripple;
  // Sample a patch of water carried by the wind. Cross-fading between
  // two overlapping drifts preserves its photographic texture indefinitely.
  float drift = fract(time / 3.6);
  float other = fract(drift + 0.5);
  vec2 current = vec2(1.14, -0.72);
  vec3 bent = surfaceRay;
  bent.xz += slope * 0.63;
  bent.y += 0.055 * swell + 0.022 * chop;
  vec3 a = bent, b = bent;
  a.xz -= current * (drift - 0.5);
  b.xz -= current * (other - 0.5);
  vec3 water = mix(waterPhoto(normalize(a)), waterPhoto(normalize(b)), abs(2.0 * drift - 1.0));

  // Wave faces alternate between the skylight and darker reflected harbor.
  // Only the steepest, sunward facets pick up a pale specular glint.
  float tilt = dot(slope, vec2(0.58, -0.82));
  water *= 1.0 + tilt * 0.54;
  water += vec3(0.115, 0.13, 0.14) * smoothstep(0.118, 0.255, tilt);
  return mix(still, water, coverage);
}
`;
