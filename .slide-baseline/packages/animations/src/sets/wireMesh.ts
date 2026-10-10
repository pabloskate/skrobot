import { DoubleSide, GLSL3, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { GLSL_DEPTH } from '../three/depth';
import { glslRgb } from '../three/materials';

/** A diamond wire mesh: the gap between neighboring wires along the panel, the wire's radius, and its color (world units). */
export interface WireMesh {
  spacing: number;
  radius: number;
  color: string;
}

/**
 * Diamond wire mesh for a set's fences, drawn in the see-through pass.
 *
 * A panel is a quad whose `aCorner` (the slot baked props use for picture-plane
 * offsets) carries each corner's distance along the panel and up it; the two
 * families of diagonal wires are worked out from that, per pixel. Wires modeled
 * as geometry are thinner than a pixel at any distance the stage films from, so
 * each pixel either catches one or misses it, and which it does changes with
 * every camera move: the mesh sparkles and crawls. Here each pixel gets the
 * share of it that wire covers instead, and a mesh too far off to resolve
 * settles into the faint veil a real one does.
 *
 * Like the other see-through parts it is hidden by hand behind anything
 * nearer in the scene's depth (the renderer gives it the depth uniforms).
 */
export function wireMeshMaterial({ spacing, radius, color }: WireMesh) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    side: DoubleSide,
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      in vec3 aCorner;
      out vec2 vPanel;
      out vec3 vWorld;
      void main() {
        vPanel = aCorner.xy;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec2 vPanel;
      in vec3 vWorld;
      uniform sampler2D uDepth;
      uniform vec2 uRes;
      ${GLSL_DEPTH}
      // The wires run at 45 degrees, so along the panel's axes the gap between
      // neighbors is the spacing and a wire's width is its diameter times root two.
      const float GAP = ${spacing.toFixed(4)};
      const float WIDTH = ${(2 * radius * Math.SQRT2).toFixed(4)};
      /** How much of a pixel, f wide along s, one family of wires covers. */
      float family(float s, float f) {
        float d = abs(fract(s / GAP + 0.5) - 0.5) * GAP;
        float h = 0.5 * max(f, 1e-4);
        float across = max(0.0, min(0.5 * WIDTH, d + h) - max(-0.5 * WIDTH, d - h)) / (2.0 * h);
        // Once a pixel spans several wires, only their average is left to show.
        return mix(across, WIDTH / GAP, smoothstep(0.5 * GAP, GAP, f));
      }
      void main() {
        if (behindScene(gl_FragCoord.z, texture(uDepth, gl_FragCoord.xy / uRes).r)) discard;
        float up = vPanel.x + vPanel.y;
        float down = vPanel.x - vPanel.y;
        float covered = 1.0 - (1.0 - family(up, fwidth(up))) * (1.0 - family(down, fwidth(down)));
        if (covered <= 0.0) discard;
        // The air thickens it with distance, as it does the baked props (sets/elToro/elToroMaterials.ts).
        float haze = 0.72 * smoothstep(2400.0, 12000.0, length(vWorld - cameraPosition));
        outColor = vec4(mix(${glslRgb(color)}, ${glslRgb('#c6d0cc')}, haze), covered);
      }
    `,
    uniforms: {
      uDepth: { value: null },
      uRes: { value: new Vector2() },
      uNear: { value: 1 },
      uFar: { value: 1000 },
    },
  });
}
