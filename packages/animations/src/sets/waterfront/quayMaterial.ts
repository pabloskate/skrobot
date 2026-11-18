import { BufferGeometry, DoubleSide, Float32BufferAttribute, GLSL3, Int8BufferAttribute, ShaderMaterial, Uint8BufferAttribute } from 'three';
import { Bake, type Ink, type Paint } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { glslRgb } from '../../three/materials';
import { GLSL_DAYLIGHT } from '../../three/daylight';
import { SPOT_NOISE } from '../spotMaterials';
import { SET_SCALE } from '../setScale';

/** Surface numbers live only in the bake. Waterfront props write no ink into the stage's outline pass. */
export const SURFACE = { concrete: 1, steel: 2, timber: 3, enamel: 4, castIron: 5, glass: 6, cord: 7, shutter: 8, siding: 9 } as const;

/** Bake's primitives, indexed and packed for props that need just a normal, paint and surface. */
export class QuayBake extends Bake {
  private readonly points: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly surfaces: number[] = [];
  private readonly indices: number[] = [];
  private readonly corners = new WeakMap<Vec3, { n: Vec3; paint: Paint; surface: number; index: number }>();

  constructor() { super(color => color); }

  override vertex(p: Vec3, n: Vec3, paint: Paint, ink: Ink) {
    const surface = ink.solid ?? 0;
    const prev = this.corners.get(p);
    if (prev && prev.n === n && prev.paint === paint && prev.surface === surface) {
      this.indices.push(prev.index);
      return;
    }
    const index = this.surfaces.length;
    this.corners.set(p, { n, paint, surface, index });
    this.indices.push(index);
    this.points.push(...p);
    this.normals.push(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127));
    const rgb = Number.parseInt(paint.color.slice(1), 16);
    this.colors.push(rgb >> 16, (rgb >> 8) & 255, rgb & 255);
    this.surfaces.push(surface);
  }

  override geometry() {
    const g = new BufferGeometry();
    g.setIndex(this.indices);
    g.setAttribute('position', new Float32BufferAttribute(this.points, 3));
    g.setAttribute('normal', new Int8BufferAttribute(this.normals, 3, true));
    g.setAttribute('aColor', new Uint8BufferAttribute(this.colors, 3, true));
    g.setAttribute('aSurface', new Uint8BufferAttribute(this.surfaces, 1));
    return g;
  }
}

export function quayMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      in vec3 aColor;
      in float aSurface;
      out vec3 vLocal;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vColor;
      flat out int vSurface;
      void main() {
        vSurface = int(aSurface + 0.5);
        vLocal = position;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normal;
        vColor = aColor.rgb;
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
      flat in int vSurface;
      ${GLSL_DAYLIGHT}
      ${SPOT_NOISE}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 eye = normalize(cameraPosition - vWorld);
        vec2 p = abs(n.y) > 0.65 ? vLocal.xz : abs(n.z) > 0.5 ? vLocal.xy : vLocal.zy;
        vec3 c = vColor;
        float rough = weather(p * 0.12);
        float finish = 0.85;
        float metalness = 0.0;
        if (vSurface == ${SURFACE.concrete}) {
          c *= 0.86 + 0.23 * weather(p * 0.035);
          c += grain(p * 1.8) * 0.1 + grain(p * 0.38) * 0.055;
          float run = smoothstep(0.48, 0.85, weather(p * vec2(0.19, 0.018)));
          c *= 1.0 - 0.17 * run * (1.0 - abs(n.y));
        } else if (vSurface == ${SURFACE.timber}) {
          // The boards run along the quay. The end grain grows in rings.
          vec2 grainAt = vec2(vLocal.x * 0.06, (n.y * n.y * vLocal.z + (1.0 - n.y * n.y) * vLocal.y) * 1.3);
          grainAt.y += 1.4 * noise(vLocal.xz * 0.085);
          float timber = abs(n.x) > 0.8 ? sin(length(p) * 3.1) * 0.08 : grain(grainAt) * 0.4;
          c *= 0.9 + timber + 0.19 * rough;
          c = mix(c, vec3(0.51, 0.49, 0.44), smoothstep(0.42, 0.75, rough) * 0.34);
        } else if (vSurface == ${SURFACE.siding} || vSurface == ${SURFACE.shutter}) {
          // Roll-formed siding runs vertically, the roller door's slats cross it.
          bool siding = vSurface == ${SURFACE.siding};
          float phase = (siding ? vLocal.x : vLocal.y) / (siding ? 6.8 : 9.5);
          float resolves = 1.0 - smoothstep(0.2, 1.0, fwidth(phase));
          vec3 tangent = siding ? vec3(1,0,0) : vec3(0,1,0);
          n = normalize(n + 0.33 * tangent * cos(phase * 2.0 * PI) * resolves * abs(n.z));
          float run = weather(vec2(vLocal.x * 0.11, vLocal.y * 0.012));
          c *= 0.86 + run * 0.20;
          finish = 0.60;
          metalness = 0.2;
        } else if (vSurface == ${SURFACE.glass}) {
          vec3 reflection = reflect(-eye, n);
          c = mix(c, vec3(0.71, 0.78, 0.81), clamp(0.28 + reflection.y * 0.5 + pow(1.0 - abs(dot(n, eye)), 3.0), 0.05, 0.87));
        } else {
          bool iron = vSurface == ${SURFACE.castIron};
          bool metal = iron || vSurface == ${SURFACE.steel};
          c *= 0.91 + 0.18 * rough;
          if (metal) {
            // Pitted iron holds oxidation in the casting; galvanized pipe mainly corrodes around its foot.
            float oxide = smoothstep(iron ? 0.54 : 0.69, 0.85, rough + 0.1 * (1.0 - smoothstep(5.0, 26.0, vLocal.y)));
            c = mix(c, ${glslRgb('#87644e')}, oxide * 0.7);
            metalness = (iron ? 0.44 : 0.7) * (1.0 - oxide);
            finish = (iron ? 0.56 : 0.43) + 0.23 * oxide;
          }
          c += grain(p * 2.0) * 0.035;
        }
        if (vSurface != ${SURFACE.glass}) {
          vec3 linear = pow(max(c, 0.0), vec3(2.2));
          c = displayDaylight(daylight(linear, finish, metalness, n, eye, vec2(1.0)));
        }
        float haze = smoothstep(900.0, 9800.0, length(vWorld - cameraPosition) / ${SET_SCALE.toFixed(5)});
        outColor = vec4(mix(c, ${glslRgb('#b7c2c2')}, haze * 0.55), 1.0);
        outInfo = vec4(0.0);
      }
    `,
  });
}
