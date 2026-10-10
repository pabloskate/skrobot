import { BufferGeometry, Float32BufferAttribute, GLSL3, NormalBlending, ShaderMaterial, Vector2 } from 'three';
import { lambert, tone } from '../camera/camera';
import type { V3 } from '../math';
import { rgb, type RGB } from './materials';
import { GLSL_DEPTH } from './depth';
import type { Vec3 } from '../camera/view';

/**
 * Baked props: set pieces that never move relative to the street, merged
 * into one mesh per material with their paint in the vertices — a color per
 * face (lit once by the sun), an ink record per part, and, for art drawn in
 * the picture plane (palm crowns, shrubs, buoys, boats), an offset that turns
 * the vertex to face the camera.
 */

/** How a part outlines itself: its id, paint priority, outline width (world units), ink class, and solid. */
export interface Ink {
  id: number;
  priority: number;
  width: number;
  kind: number;
  solid?: number;
}

export const NO_INK: Ink = { id: 0, priority: 0, width: 0, kind: 0 };

/**
 * Paint modes. Flat is one color. Split shades a round part (a trunk, a
 * bin) like a cel drawing: its base color with a lit color over
 * the stretch of it, left to right on screen, between `from` and `to`
 * (-1 its left edge, 1 its right).
 */
export interface Paint {
  color: string;
  alpha?: number;
  lit?: { color: string; from: number; to: number };
}

export class Bake {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly corner: number[] = [];
  private readonly color: number[] = [];
  private readonly lit: number[] = [];
  private readonly band: number[] = [];
  private readonly info: number[] = [];

  /**
   * One vertex. `corner` is (right, up) in the camera's plane plus a pull
   * toward the camera; `band` overrides the split band (a glow's radius).
   */
  vertex(p: Vec3, n: Vec3, paint: Paint, ink: Ink, corner: Vec3 = [0, 0, 0], band?: [number, number]) {
    this.position.push(...p);
    this.normal.push(...n);
    this.corner.push(...corner);
    const c = rgb(paint.color);
    this.color.push(c[0], c[1], c[2], paint.alpha ?? 1);
    const l: RGB = paint.lit ? rgb(paint.lit.color) : c;
    this.lit.push(...l);
    this.band.push(...(band ?? [paint.lit?.from ?? 2, paint.lit?.to ?? 2]));
    this.info.push(ink.id / 255, ink.priority / 255, Math.min(ink.width, 4) / 4, (ink.kind + 4 * (ink.solid ?? 0)) / 255);
  }

  triangle(a: Vec3, b: Vec3, c: Vec3, n: Vec3, paint: Paint, ink: Ink) {
    this.vertex(a, n, paint, ink);
    this.vertex(b, n, paint, ink);
    this.vertex(c, n, paint, ink);
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, paint: Paint, ink: Ink) {
    this.triangle(a, b, c, n, paint, ink);
    this.triangle(a, c, d, n, paint, ink);
  }

  /**
   * A box lying on the ground, its faces lit by the sun. Each face is its own part, so every visible edge is inked.
   * Three's y is up; `n` normals are three's, so the physics normal flips y.
   */
  box(min: Vec3, max: Vec3, side: string, top: string, ink: Ink | null, faces = 'tbfkle', sunlit = true) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const list: Array<{ key: string; n: Vec3; pts: Vec3[]; color: string }> = [
      { key: 't', n: [0, 1, 0], pts: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], color: top },
      { key: 'b', n: [0, -1, 0], pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], color: side },
      { key: 'f', n: [0, 0, 1], pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color: side },
      { key: 'k', n: [0, 0, -1], pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], color: side },
      { key: 'l', n: [-1, 0, 0], pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], color: side },
      { key: 'e', n: [1, 0, 0], pts: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], color: side },
    ];
    list.forEach((face, i) => {
      if (!faces.includes(face.key)) return;
      const physics: V3 = { x: face.n[0], y: -face.n[1], z: face.n[2] };
      const paint = { color: sunlit ? tone(face.color, lambert(physics)) : face.color };
      const faceInk = ink ? { ...ink, id: ink.id + i, priority: ink.priority + i } : NO_INK;
      const [a, b, c, d] = face.pts;
      this.quad(a, b, c, d, face.n, paint, faceInk);
    });
  }

  /** A box in one flat color, unlit and not outlined (the waterfront's railing). */
  flatBox(min: Vec3, max: Vec3, color: string) {
    this.box(min, max, color, color, null, 'tbfkle', false);
  }

  /**
   * A round tube along `spine` (three world), radius per point, with
   * `sides` facets: a palm trunk, a lamp post, a wire. Normals are smooth,
   * for split paint.
   */
  tube(spine: Vec3[], radii: number[], paint: Paint, ink: Ink, sides = 10, caps = true) {
    const rings: Array<{ p: Vec3; n: Vec3 }[]> = [];
    for (let i = 0; i < spine.length; i++) {
      const prev = spine[Math.max(0, i - 1)];
      const next = spine[Math.min(spine.length - 1, i + 1)];
      const t = norm([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
      const ref: Vec3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm(cross(t, ref));
      const e2 = cross(t, e1);
      const ring: { p: Vec3; n: Vec3 }[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const n: Vec3 = [e1[0] * Math.cos(a) + e2[0] * Math.sin(a), e1[1] * Math.cos(a) + e2[1] * Math.sin(a), e1[2] * Math.cos(a) + e2[2] * Math.sin(a)];
        ring.push({ p: [spine[i][0] + n[0] * radii[i], spine[i][1] + n[1] * radii[i], spine[i][2] + n[2] * radii[i]], n });
      }
      rings.push(ring);
    }
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let k = 0; k < sides; k++) {
        const a = rings[i][k];
        const b = rings[i][(k + 1) % sides];
        const c = rings[i + 1][(k + 1) % sides];
        const d = rings[i + 1][k];
        this.vertex(a.p, a.n, paint, ink);
        this.vertex(c.p, c.n, paint, ink);
        this.vertex(b.p, b.n, paint, ink);
        this.vertex(a.p, a.n, paint, ink);
        this.vertex(d.p, d.n, paint, ink);
        this.vertex(c.p, c.n, paint, ink);
      }
    }
    if (!caps) return;
    for (const [i, flip] of [[0, true], [rings.length - 1, false]] as const) {
      const center = spine[i];
      const axis = norm(sub(spine[flip ? 1 : i], spine[flip ? 0 : i - 1]));
      const n: Vec3 = flip ? [-axis[0], -axis[1], -axis[2]] : axis;
      for (let k = 0; k < sides; k++) {
        const a = rings[i][k].p;
        const b = rings[i][(k + 1) % sides].p;
        if (flip) this.triangle(center, a, b, n, paint, ink);
        else this.triangle(center, b, a, n, paint, ink);
      }
    }
  }

  /** A square frustum on the vertical through (x, z): half-widths at its foot and top. */
  frustum(x: number, z: number, y0: number, y1: number, half0: number, half1: number, paint: Paint, ink: Ink) {
    const at = (h: number, y: number): Vec3[] => [[x - h, y, z + h], [x + h, y, z + h], [x + h, y, z - h], [x - h, y, z - h]];
    const lo = at(half0, y0);
    const hi = at(half1, y1);
    const slope = (half0 - half1) / Math.max(1e-6, y1 - y0);
    const normals: Vec3[] = [norm([0, slope, 1]), norm([1, slope, 0]), norm([0, slope, -1]), norm([-1, slope, 0])];
    for (let k = 0; k < 4; k++) {
      const n = normals[k];
      const face = ink.id ? { ...ink, id: ink.id + k, priority: ink.priority + k } : ink;
      this.quad(lo[k], lo[(k + 1) % 4], hi[(k + 1) % 4], hi[k], n, paint, face);
    }
    if (half1 > 1e-3) this.quad(hi[0], hi[1], hi[2], hi[3], [0, 1, 0], paint, ink.id ? { ...ink, id: ink.id + 4, priority: ink.priority + 4 } : ink);
  }

  /** A camera-facing polygon about `anchor`, in the picture plane's (right, up) world units. */
  billboard(anchor: Vec3, pts: Array<[number, number]>, paint: Paint, ink: Ink, pull = 0) {
    // Fan from the first point: picture-plane shapes are convex or star-shaped about it.
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) this.vertex(anchor, [0, 0, 1], paint, ink, [p[0], p[1], pull]);
    }
  }

  /** A camera-facing strip between two edges (a frond, a stroke), in the picture plane. */
  billboardStrip(anchor: Vec3, a: Array<[number, number]>, b: Array<[number, number]>, paint: Paint, ink: Ink, pull = 0) {
    for (let i = 0; i + 1 < a.length; i++) {
      const quad = [a[i], a[i + 1], b[i + 1], b[i]];
      for (const k of [0, 1, 2, 0, 2, 3]) this.vertex(anchor, [0, 0, 1], paint, ink, [quad[k][0], quad[k][1], pull]);
    }
  }

  /** A camera-facing disc, or a ring between two radii. */
  disc(anchor: Vec3, cx: number, cy: number, r: number, paint: Paint, ink: Ink, pull = 0, inner = 0, from = 0, to = Math.PI * 2, segments = 28) {
    const n = Math.max(6, Math.ceil((segments * (to - from)) / (Math.PI * 2)));
    for (let k = 0; k < n; k++) {
      const a0 = from + ((to - from) * k) / n;
      const a1 = from + ((to - from) * (k + 1)) / n;
      const o0: [number, number] = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r];
      const o1: [number, number] = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r];
      if (inner <= 0) {
        for (const p of [[cx, cy], o0, o1] as Array<[number, number]>) this.vertex(anchor, [0, 0, 1], paint, ink, [p[0], p[1], pull]);
      } else {
        const i0: [number, number] = [cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner];
        const i1: [number, number] = [cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner];
        for (const p of [i0, o0, o1, i0, o1, i1]) this.vertex(anchor, [0, 0, 1], paint, ink, [p[0], p[1], pull]);
      }
    }
  }

  /** A soft round glow, drawn see-through after the outlines: `alpha` at its heart, fading out to `r`. */
  glow(anchor: Vec3, r: number, color: string, alpha: number, pull = 0) {
    const n = 24;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      for (const [x, y] of [[0, 0], [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r]]) {
        this.vertex(anchor, [0, 0, 1], { color, alpha }, NO_INK, [x, y, pull], [r, 0]);
      }
    }
  }

  /** A camera-facing stroke along a polyline, `width` wide, with round-ish joins from overlap. */
  billboardLine(anchor: Vec3, pts: Array<[number, number]>, width: number, paint: Paint, ink: Ink, pull = 0) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const m = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / m) * width * 0.5;
      const ny = ((bx - ax) / m) * width * 0.5;
      const ex = ((bx - ax) / m) * width * 0.5;
      const ey = ((by - ay) / m) * width * 0.5;
      const quad: Array<[number, number]> = [[ax - ex + nx, ay - ey + ny], [bx + ex + nx, by + ey + ny], [bx + ex - nx, by + ey - ny], [ax - ex - nx, ay - ey - ny]];
      for (const k of [0, 1, 2, 0, 2, 3]) this.vertex(anchor, [0, 0, 1], paint, ink, [quad[k][0], quad[k][1], pull]);
    }
  }

  get empty() {
    return this.position.length === 0;
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normal, 3));
    g.setAttribute('aCorner', new Float32BufferAttribute(this.corner, 3));
    g.setAttribute('aColor', new Float32BufferAttribute(this.color, 4));
    g.setAttribute('aLit', new Float32BufferAttribute(this.lit, 3));
    g.setAttribute('aBand', new Float32BufferAttribute(this.band, 2));
    g.setAttribute('aInfo', new Float32BufferAttribute(this.info, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
};

const BAKED_VERT = /* glsl */ `
in vec3 aCorner;
in vec4 aColor;
in vec3 aLit;
in vec2 aBand;
in vec4 aInfo;
out vec4 vColor;
out vec3 vLit;
out vec2 vBand;
flat out vec4 vInfo;
out vec3 vNormal;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  // Picture-plane art: offset in the camera's plane, then pulled toward it in depth only.
  view.xy += aCorner.xy;
  view.xyz *= 1.0 - aCorner.z / max(length(view.xyz), 1.0);
  vColor = aColor;
  vLit = aLit;
  vBand = aBand;
  vInfo = aInfo;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * view;
}
`;

/** The material every baked prop shares: its own paint, written with its ink record. */
export function bakedMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: BAKED_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      in vec4 vColor;
      in vec3 vLit;
      in vec2 vBand;
      flat in vec4 vInfo;
      in vec3 vNormal;
      void main() {
        vec3 color = vColor.rgb;
        if (vBand.x < 1.5) {
          // Where across the part this pixel sits, left edge -1 to right edge 1, is its normal's screen x.
          float across = normalize(vNormal).x;
          float w = max(fwidth(across), 1e-3);
          float lit = smoothstep(vBand.x - w, vBand.x + w, across) * (1.0 - smoothstep(vBand.y - w, vBand.y + w, across));
          color = mix(color, vLit, lit);
        }
        outColor = vec4(color, 1.0);
        outInfo = vInfo;
      }
    `,
  });
}

/**
 * The same baked geometry drawn see-through after the outlines (ripples,
 * boats, glows): straight alpha over the picture, hidden by hand behind
 * anything nearer in the scene's depth. `glow` paints each billboard as a
 * soft radial falloff instead of a flat fill.
 */
export function overlayMaterial(glow = false) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: BAKED_VERT.replace('out vec3 vNormal;', 'out vec3 vNormal;\nout vec2 vCorner;').replace('vNormal = normalMatrix * normal;', 'vNormal = normalMatrix * normal;\n  vCorner = aCorner.xy;'),
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      in vec4 vColor;
      in vec2 vCorner;
      in vec2 vBand;
      uniform sampler2D uDepth;
      uniform vec2 uRes;
      ${GLSL_DEPTH}
      void main() {
        if (behindScene(gl_FragCoord.z, texture(uDepth, gl_FragCoord.xy / uRes).r)) discard;
        float a = vColor.a;
        ${glow ? `
        // vBand.x is the glow's radius; vCorner its offset from the center.
        float t = length(vCorner) / vBand.x;
        a *= t < 0.35 ? mix(1.0, 0.4, t / 0.35) : t < 1.0 ? mix(0.4, 0.0, (t - 0.35) / 0.65) : 0.0;` : ''}
        outColor = vec4(vColor.rgb, a);
      }
    `,
    uniforms: {
      uDepth: { value: null },
      uRes: { value: new Vector2() },
      uNear: { value: 1 },
      uFar: { value: 1000 },
    },
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
  });
}
