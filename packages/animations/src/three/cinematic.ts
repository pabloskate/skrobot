import { GLSL3, Mesh, ShaderMaterial, Vector2, type Object3D } from 'three';
import { SUN } from './materials';
import { GLSL_DEPTH } from './depth';

export type RenderQuality = 'standard' | 'cinematic';

/** Export-owned instances only. Keep rigs, geometry, silhouettes and existing physical materials. */
export function prepareCinematicSurfaces(root: Object3D) {
  const seen = new Set<ShaderMaterial>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof ShaderMaterial) || seen.has(material)) continue;
      seen.add(material);
      if (!material.fragmentShader.includes('outInfo') || material.userData.cinematic) continue;
      material.userData.cinematic = true;
      // Disable drawn contours, including the baked ink records in scenery geometry.
      let frag = material.fragmentShader.replace(/void main\s*\(\s*\)/, 'void originalSurface()');
      const paintedRobot = !!material.uniforms.uLit && frag.includes('toonLit');
      if (paintedRobot) {
        material.vertexShader = `out vec3 vFinishWorld;\nout vec3 vFinishNormal;\n${material.vertexShader}`
          .replace(/void main\s*\(\s*\)\s*\{/, `void main() {
            vFinishWorld = (modelMatrix * vec4(position, 1.0)).xyz;
            vFinishNormal = normalize(mat3(modelMatrix) * normal);`);
        // Smooth daylight replaces the camera-facing cel threshold.
        frag = frag.replace('return smoothstep(TOON_THRESHOLD - w, TOON_THRESHOLD + w, ndl);',
          `return clamp(0.35 + 0.65 * dot(normalize(vFinishNormal), FINISH_SUN), 0.0, 1.0);`);
        frag = `in vec3 vFinishWorld;
          in vec3 vFinishNormal;
          const vec3 FINISH_SUN = vec3(${SUN.x}, ${SUN.y}, ${SUN.z});
          ${frag}`;
        // Preserve the emissive face display; clearcoat belongs to the shell.
        const screenMask = material.uniforms.uExpression
          ? 'float shell = smoothstep(0.0, 1.2, roundRect(vec2(vLocal.z, vLocal.y), vec2(0.0, -0.5), vec2(14.0, 9.6), 5.6));'
          : 'float shell = 1.0;';
        frag += /* glsl */ `
          void main() {
            originalSurface();
            ${screenMask}
            vec3 n = normalize(vFinishNormal);
            vec3 v = normalize(cameraPosition - vFinishWorld);
            vec3 h = normalize(v + FINISH_SUN);
            float nl = max(dot(n, FINISH_SUN), 0.0);
            float nv = max(dot(n, v), 0.001);
            float nh = max(dot(n, h), 0.0);
            float vh = max(dot(v, h), 0.0);
            // GGX clearcoat over the painted shell, in linear light.
            float a2 = 0.0256;
            float d = nh * nh * (a2 - 1.0) + 1.0;
            float distribution = a2 / (3.14159265 * d * d);
            float visibility = 0.25 / ((nl * 0.75 + 0.25) * (nv * 0.75 + 0.25));
            float fresnel = 0.04 + 0.96 * pow(1.0 - vh, 5.0);
            vec3 base = pow(max(outColor.rgb, vec3(0.0)), vec3(2.2));
            vec3 sky = mix(vec3(0.25, 0.21, 0.17), vec3(0.50, 0.62, 0.78), n.y * 0.5 + 0.5);
            vec3 reflection = mix(vec3(0.21, 0.18, 0.14), vec3(0.62, 0.76, 0.91), smoothstep(-0.15, 0.35, reflect(-v, n).y));
            vec3 lit = base * (0.65 + 0.55 * nl) * sky * 1.65;
            lit += vec3(1.0, 0.94, 0.82) * min(1.5, distribution * visibility * fresnel * nl);
            lit += reflection * (0.035 + 0.28 * pow(1.0 - nv, 5.0));
            vec3 finish = pow(max(lit, vec3(0.0)), vec3(1.0 / 2.2));
            outColor.rgb = mix(outColor.rgb, finish, shell);
            outInfo.z = 0.0;
          }`;
      } else frag += '\nvoid main() { originalSurface(); outInfo.z = 0.0; }';
      material.fragmentShader = frag;
      material.needsUpdate = true;
    }
  });
}

/** Deterministic depth-based contact shading. Skip sky and reject distant foreground silhouettes. */
export function cinematicContactMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSource: { value: null }, uDepth: { value: null }, uTexel: { value: new Vector2() },
      uNear: { value: 2 }, uFar: { value: 40000 }, uFocalPx: { value: 1 },
    },
    vertexShader: 'out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      in vec2 vUv;
      out vec4 outColor;
      uniform sampler2D uSource;
      uniform sampler2D uDepth;
      uniform vec2 uTexel;
      uniform float uFocalPx;
      ${GLSL_DEPTH}
      void main() {
        vec4 color = texture(uSource, vUv);
        float z = viewZ(texture(uDepth, vUv).r);
        if (z > uFar * 0.95) { outColor = color; return; }
        float radius = clamp(7.0 * uFocalPx / z, 2.0, 24.0);
        float occlusion = 0.0;
        // Opposite samples cancel planar depth slopes, avoiding striped stairs.
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.39269908;
          vec2 offset = vec2(cos(a), sin(a)) * radius * uTexel;
          float za = viewZ(texture(uDepth, clamp(vUv + offset, vec2(0.0), vec2(1.0))).r);
          float zb = viewZ(texture(uDepth, clamp(vUv - offset, vec2(0.0), vec2(1.0))).r);
          float delta = z - (za + zb) * 0.5;
          float local = 1.0 - smoothstep(8.0, 20.0, max(abs(za - z), abs(zb - z)));
          occlusion += smoothstep(0.25, 3.0, delta) * local;
        }
        color.rgb *= 1.0 - 0.30 * occlusion / 8.0;
        outColor = color;
      }`,
  });
}
