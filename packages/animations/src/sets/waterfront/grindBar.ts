import { Mesh } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BAR_HALF } from '../../motion/grindDefinitions';
import { GLSL_DAYLIGHT } from '../../three/daylight';
import { GLSL_TARGETS, sceneMaterial } from '../../three/materials';
import { POST_HALF, POST_INSET } from '../bar';
import { EL_TORO_NOISE } from '../elToro/elToroMaterials';

/** Square hollow section with polished running edges and oxide on its sheltered faces. */
export function quayGrindBar(length: number, top: number) {
  const material = sceneMaterial(/* glsl */ `
    out vec3 vLocal;
    out vec3 vWorld;
    out vec3 vNormal;
    void main() {
      vLocal = position;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }
  `, /* glsl */ `
    ${GLSL_TARGETS}
    ${GLSL_DAYLIGHT}
    ${EL_TORO_NOISE}
    in vec3 vLocal;
    in vec3 vWorld;
    in vec3 vNormal;
    void main() {
      vec3 n = normalize(vNormal);
      float streak = grain(vec2(vLocal.x * 0.055, (vLocal.z + vLocal.y) * 1.45));
      float wear = smoothstep(0.05, 0.95, n.y + 0.22 * streak);
      float oxide = smoothstep(0.46, 0.78, weather(vLocal.xy * 0.19 + vLocal.z * 0.1));
      vec3 base = mix(vec3(0.21, 0.235, 0.24), vec3(0.19, 0.135, 0.10), oxide * 0.62);
      base = mix(base, vec3(0.59, 0.61, 0.62), wear) * (1.0 + 0.19 * streak);
      vec3 lit = daylight(base, mix(0.68, 0.29, wear), 0.86 - 0.36 * oxide * (1.0 - wear),
        n, normalize(cameraPosition - vWorld), vec2(1.0));
      outColor = vec4(displayDaylight(lit), 1.0);
      outInfo = vec4(0.0);
    }
  `, {});
  const box = (x: number, y: number, width: number, height: number, depth: number, bevel: number) => {
    const geo = new RoundedBoxGeometry(width, height, depth, 1, bevel);
    geo.translate(x, y, 0);
    return new Mesh(geo, material);
  };
  const bottom = top - 2 * BAR_HALF;
  const pieces = [box(length / 2, top - BAR_HALF, length, 2 * BAR_HALF, 2 * BAR_HALF, 0.55)];
  for (const x of [POST_INSET, length - POST_INSET]) {
    pieces.push(box(x, bottom / 2, POST_HALF * 2, bottom, POST_HALF * 2, 0.35));
    pieces.push(box(x, 0.45, POST_HALF * 4.6, 0.9, POST_HALF * 6.4, 0.22));
  }
  return { pieces, material };
}
