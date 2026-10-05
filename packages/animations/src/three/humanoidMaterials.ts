import { DoubleSide, GLSL3, ShaderMaterial, Vector4 } from 'three';
import { SUN } from './materials';

/** Vertex surface tags let an entire articulated assembly share one draw. */
export const HUMANOID_SURFACE = { pearl: 0, polymer: 1, titanium: 2, glass: 3, light: 4, graphite: 5 } as const;

/** Continuous metallic lighting, deliberately independent of the toy's cel ramp. */
export function humanoidMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: DoubleSide,
    uniforms: {
      uInfo: { value: new Vector4(235 / 255, 70 / 255, 0, 0) },
      uExpression: { value: 0 },
    },
    vertexShader: /* glsl */ `
      in float aSurface;
      out vec3 vWorld;
      out vec3 vNormal;
      out vec3 vLocal;
      flat out float vSurface;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n /= vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
                    dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz),
                    dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
          n = mat3(instanceMatrix) * n;
        #endif
        vLocal = position;
        vSurface = aSurface;
        vWorld = (modelMatrix * p).xyz;
        vNormal = transpose(mat3(viewMatrix)) * normalize(normalMatrix * n);
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      in vec3 vWorld;
      in vec3 vNormal;
      in vec3 vLocal;
      flat in float vSurface;
      uniform vec4 uInfo;
      uniform float uExpression;
      const vec3 SUN = vec3(${SUN.x.toFixed(6)}, ${SUN.y.toFixed(6)}, ${SUN.z.toFixed(6)});
      const float PI = 3.14159265;

      vec3 environment(vec3 r, float roughness) {
        float elevation = smoothstep(-0.12, 0.45, r.y);
        vec3 ground = mix(vec3(0.16, 0.14, 0.105), vec3(0.43, 0.39, 0.31), smoothstep(-0.7, 0.0, r.y));
        vec3 sky = mix(vec3(0.72, 0.8, 0.85), vec3(0.19, 0.33, 0.49), smoothstep(0.0, 0.95, r.y));
        // Broad sky/cloud reflections describe the shell's curvature without
        // an environment image, and remain fixed as the camera orbits.
        float cloud = pow(max(0.0, dot(r, normalize(vec3(-0.5, 0.75, 0.42)))), mix(20.0, 4.0, roughness));
        sky += vec3(0.6, 0.57, 0.51) * cloud * 0.65;
        return mix(ground, sky, elevation);
      }
      float grain(vec3 p) {
        return fract(sin(dot(floor(p * 110.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      }
      void main() {
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 h = normalize(v + SUN);
        float nv = max(0.001, dot(n, v));
        float nl = max(0.0, dot(n, SUN));
        vec3 base = vec3(0.81, 0.825, 0.79);
        float metal = 0.32;
        float rough = 0.3;
        if (vSurface > 0.5 && vSurface < 1.5) { base = vec3(0.015, 0.02, 0.022); metal = 0.08; rough = 0.68; }
        if (vSurface > 1.5 && vSurface < 2.5) { base = vec3(0.36, 0.405, 0.42); metal = 0.91; rough = 0.25; }
        if (vSurface > 2.5 && vSurface < 3.5) { base = vec3(0.006, 0.014, 0.018); metal = 0.35; rough = 0.115; }
        if (vSurface > 4.5) { base = vec3(0.065, 0.078, 0.085); metal = 0.83; rough = 0.38; }
        float detailFade = 1.0 - smoothstep(0.006, 0.06, length(fwidth(vLocal)));
        float brushed = sin(vLocal.y * 190.0 + vLocal.x * 3.0) * 0.5;
        rough += (grain(vLocal) - 0.5 + brushed * metal) * 0.035 * detailFade;
        vec3 f0 = mix(vec3(0.045), base, metal);
        vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
        vec3 r = reflect(-v, n);
        vec3 ambient = mix(vec3(0.22, 0.2, 0.165), vec3(0.42, 0.48, 0.55), n.y * 0.5 + 0.5);
        vec3 diffuse = base * (1.0 - metal * 0.72) * (ambient + nl * vec3(0.83, 0.79, 0.7));
        float a = rough * rough;
        float a2 = a * a;
        float nh = max(0.0, dot(n, h));
        float den = nh * nh * (a2 - 1.0) + 1.0;
        float d = a2 / max(0.0001, PI * den * den);
        float k = (rough + 1.0) * (rough + 1.0) / 8.0;
        float geometry = nv / (nv * (1.0 - k) + k) * nl / max(0.001, nl * (1.0 - k) + k);
        vec3 sunF = f0 + (1.0 - f0) * pow(1.0 - max(0.0, dot(v, h)), 5.0);
        vec3 direct = min(vec3(2.5), sunF * d * geometry / max(0.004, 4.0 * nv * max(nl, 0.001))) * nl * 0.75;
        vec3 reflection = environment(r, rough) * fresnel * (1.0 - rough * 0.45);
        vec3 color = diffuse + direct + reflection;
        if (vSurface > 2.5 && vSurface < 3.5) color = base * 0.7 + reflection * 0.85 + direct;
        if (vSurface > 3.5 && vSurface < 4.5) color = vec3(0.08, 0.66, 0.76) * (1.0 + 0.12 * uExpression);
        color = color / (1.0 + color * 0.2);
        outColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
        // Zero outline width: silhouette and seams come from the model itself.
        outInfo = uInfo;
      }
    `,
  });
}
