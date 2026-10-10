import {
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  Group,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Texture,
} from 'three';
import { X0 } from '../../motion/trick';
import { GLSL_DEPTH } from '../../three/depth';
import { LIGHT_SCREEN, PALETTE, lambert, tone } from '../../camera/camera';
import { clamp01, mixHex, type V3 } from '../../math';
import { SPAN_HI, SPAN_LO, hash2 } from '../setKit';
import {
  COPING_H,
  INK,
  LEDGE_DEPTH,
  LEDGE_FRONT_Z,
  LEDGE_H,
  RAIL_H,
  RAIL_Z,
  SEAT_Z,
  TREE_Z,
  WALL_Z,
  WATER_Z,
  WF,
} from './waterfrontLayout';
import { Bake, NO_INK, bakedMaterial, overlayMaterial, type Ink, type Paint } from '../../three/bake';
import { INK_PROP, rgb } from '../../three/materials';
import { groundHull, type GroundPolygon } from '../../stage/stage';
import { waterfrontGroundMaterial } from './waterfrontGround';
import { ASPHALT, type StageView, type Vec3 } from '../../camera/view';

/**
 * The waterfront set, near to far as waterfrontLayout.ts lays it out: the
 * plaza's ground, its ledges, benches, planters and bins, the palms and
 * lamps strung with festoon lights, the sea wall with its railing and
 * lifebuoys, and on the bay its ripples, glints, and boats. Every copy along
 * the street keeps a stable index, so each palm's height and lean, each
 * crown, ledge wax, and ripple stays the same one as it scrolls. The set is
 * laid out once and slid with the street.
 *
 * Picture-plane art (palm crowns, shrubs, lifebuoys, boats) stays in the
 * picture plane, facing the camera like a cel drawing. The far panorama is
 * waterfrontFar.tsx, under the canvas.
 */

/** Street x covered by the layout: the set's span, plus a trick's worth of scrolling either way. */
const LAYOUT_LO = SPAN_LO - 1600;
const LAYOUT_HI = SPAN_HI + 1600;
const ROW_PERIOD = 800;

const PALMS = [120, 520];
const LAMPS = [330, 730];
const BENCHES = [190];
const PLANTERS = [580];
const BINS = [432];
const LEDGES: Array<[number, number]> = [[0, 190], [290, 120], [500, 210]];
const LAMP_H = 150;

/** Copies of a pattern element across the layout: each copy's stable index and street x. */
function copies(offset: number, period: number, lo = LAYOUT_LO, hi = LAYOUT_HI): Array<{ x: number; i: number }> {
  const out: Array<{ x: number; i: number }> = [];
  for (let i = Math.ceil((lo - offset) / period); offset + i * period < hi; i++) out.push({ x: offset + i * period, i });
  return out;
}

/** Street x and height above the asphalt → three (at scroll 0). */
const at = (x: number, h: number, z: number): Vec3 => [x - X0, h, z];
/** The same point as physics, for shadows. */
const phys = (x: number, h: number, z: number): V3 => ({ x, y: ASPHALT - h, z });

const prop = (id: number, priority: number, width: number, solid = 0): Ink => ({ id, priority, width, kind: INK_PROP, solid });

/** Fronds, back ones first: [screen angle, length, droop]. */
const FRONDS: Array<[number, number, number]> = [
  [158, 0.8, 0.5], [22, 0.8, 0.5], [118, 0.55, 0.35], [64, 0.55, 0.35],
  [-172, 1, 0.62], [-8, 1, 0.62], [-146, 1, 0.7], [-34, 1, 0.7],
  [-122, 0.85, 0.66], [-58, 0.85, 0.66], [-98, 0.5, 0.3], [-80, 0.52, 0.32],
];

/** A palm's crown, in the picture plane about its top. */
function palmCrown(b: Bake, top: Vec3, idx: number, ids: number) {
  const base = 100 + 18 * hash2(idx, 0, 13);
  const frond = (fi: number, layer: number) => {
    const [deg, lenK, droopK] = FRONDS[fi];
    const a = ((deg + (hash2(idx, fi, 14) - 0.5) * 14) * Math.PI) / 180;
    const L = base * lenK;
    const droop = droopK * (0.85 + 0.3 * hash2(idx, fi, 15));
    // Laid out in screen space, y down; flipped up for the billboard.
    const atU = (u: number) => ({ x: L * u * Math.cos(a), y: L * u * Math.sin(a) + droop * L * u * u });
    const upper: Array<[number, number]> = [];
    const lower: Array<[number, number]> = [];
    const S = 26;
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      const p = atU(u);
      const q = atU(Math.min(1, u + 0.02));
      const o = atU(Math.max(0, u - 0.02));
      let tx = q.x - o.x;
      let ty = q.y - o.y;
      const m = Math.hypot(tx, ty) || 1;
      tx /= m;
      ty /= m;
      let nx = -ty;
      let ny = tx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      const w = 0.21 * L * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.6) * (1 - 0.3 * u);
      const tooth = i % 2 === 1;
      const jitter = 0.8 + 0.4 * hash2(idx * 31 + fi, i, 16);
      const up = tooth ? 0.42 * jitter : 0.12;
      const down = tooth ? jitter : 0.22;
      upper.push([p.x - nx * w * up + tx * w * (tooth ? 0.5 : 0), -(p.y - ny * w * up + ty * w * (tooth ? 0.5 : 0))]);
      lower.push([p.x + nx * w * down + tx * w * (tooth ? 0.7 : 0), -(p.y + ny * w * down + ty * w * (tooth ? 0.7 : 0))]);
    }
    const light = clamp01(0.45 + 0.4 * Math.cos(a) * LIGHT_SCREEN.x - 0.45 * Math.sin(a) * -LIGHT_SCREEN.y - (fi < 4 ? 0.3 : 0));
    const fill = light > 0.5 ? mixHex(WF.frondMid, WF.frondLit, (light - 0.5) * 2) : mixHex(WF.frondDark, WF.frondMid, light * 2);
    const pull = layer * 0.08;
    b.billboardStrip(top, upper, lower, { color: fill }, prop(ids + 1 + fi, 20 + layer, 0.45), pull);
    const spine = Array.from({ length: 8 }, (_, i) => {
      const p = atU(i / 7);
      return [p.x, -p.y] as [number, number];
    });
    b.billboardLine(top, spine, 0.9, { color: mixHex(fill, '#fff2d0', 0.35) }, prop(ids + 1 + fi, 20 + layer, 0.45), pull + 0.03);
  };
  for (let fi = 0; fi < 4; fi++) frond(fi, fi);
  for (const [dx, dy] of [[-4, 4], [3, 6], [8, 2]]) b.disc(top, dx, -dy, 3.6, { color: WF.coconut }, prop(ids + 13, 24, 0.36), 4 * 0.08 + 0.02);
  for (let fi = 4; fi < 12; fi++) frond(fi, fi + 1);
}

/** Shrubs heaped in a planter: two-tone balls and flowers, in front of its rim. */
function shrubs(b: Bake, x0: number, x1: number, z0: number, z1: number, top: number, seed: number, id: number) {
  const n = Math.max(3, Math.round((x1 - x0) / 14));
  for (let k = 0; k < n; k++) {
    const x = x0 + 6 + ((x1 - x0 - 12) * k) / (n - 1);
    const zc = (z0 + z1) / 2 + (hash2(seed, k, 20) - 0.5) * 8;
    const r = 9 + 5 * hash2(seed, k, 21);
    const c = at(x, top + r * 0.5, zc);
    // Every shrub's dark ball, then every lit one, then the flowers, all over the planter's rim.
    b.disc(c, 0, 0, r, { color: WF.shrubDark }, prop(id, 40, 0.4), 16);
    b.disc(c, r * 0.2, r * 0.22, r * 0.72, { color: WF.shrubLit }, prop(id, 40, 0.4), 17);
    if (hash2(seed, k, 22) > 0.4) b.disc(c, -r * 0.3, r * 0.4, 1.4, { color: WF.flowerA }, prop(id, 40, 0.4), 18, 0, 0, Math.PI * 2, 10);
    if (hash2(seed, k, 23) > 0.5) b.disc(c, r * 0.45, r * 0.1, 1.3, { color: WF.flowerB }, prop(id, 40, 0.4), 18, 0, 0, Math.PI * 2, 10);
  }
}

const SAIL: Array<{ pts: Array<[number, number]>; color: string; alpha?: number; line?: number }> = [
  { pts: [[-22, 3], [22, 3], [15, -5], [-16, -5]], color: WF.hull, alpha: 0.22 },
  { pts: [[-2, 4], [-2, 44]], color: WF.sailShade, alpha: 0.32, line: 2.4 },
  { pts: [[-2, 6], [12, 32]], color: WF.sailShade, alpha: 0.32, line: 2.4 },
  { pts: [[-2, 12], [-14, 32]], color: WF.sailShade, alpha: 0.32, line: 2.4 },
  { pts: [[-24, -7], [24, -7], [17, 1], [-17, 1]], color: WF.hull },
  { pts: [[-23, -6.2], [23, -6.2]], color: WF.sail, line: 1.2 },
  { pts: [[-1.5, -7], [-1.5, -65]], color: WF.hull, line: 1.6 },
  { pts: [[0, -64], [0, -10], [24, -10]], color: WF.sail },
  { pts: [[0, -64], [0, -10], [7, -10]], color: WF.sailShade },
  { pts: [[-3, -58], [-3, -10], [-19, -10]], color: WF.sailShade },
];
const box2 = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const FERRY: Array<{ pts: Array<[number, number]>; color: string; alpha?: number; line?: number }> = [
  { pts: box2(-46, 1, 46, 8), color: WF.sail, alpha: 0.22 },
  { pts: [[-50, -10], [50, -10], [44, 0], [-44, 0]], color: WF.hull },
  { pts: box2(-40, -22, 34, -10), color: WF.sail },
  { pts: box2(-36, -18, 30, -14), color: WF.hull, alpha: 0.7 },
  { pts: box2(-28, -31, 18, -22), color: WF.sailShade },
  { pts: box2(-6, -42, 2, -31), color: WF.hull },
  { pts: [[-50, -10], [50, -10]], color: WF.sail, line: 1.4 },
];
const BOATS: Array<[number, number, number, typeof SAIL]> = [
  [260, -1350, 2900, SAIL],
  [1650, -2050, 2900, SAIL],
  [980, -2900, 3700, FERRY],
];

/** Glints on the bay: stars that twinkle with the scroll (waterfront.tsx's ripples), sized on screen by the GPU. */
function glintMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `
      in vec2 aStar;
      in float aPhase;
      uniform float uScroll;
      uniform float uFocal;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        float s = uFocal / max(1.0, -view.z);
        float twinkle = max(0.0, sin(uScroll * 0.035 + 6.28 * aPhase));
        float r = (1.2 + 3.2 * s) * twinkle * twinkle;
        // Too small to show: skip it.
        if (r < 0.4) r = 0.0;
        view.xy += aStar * r / s;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      uniform sampler2D uDepth;
      uniform vec2 uRes;
      ${GLSL_DEPTH}
      void main() {
        if (behindScene(gl_FragCoord.z, texture(uDepth, gl_FragCoord.xy / uRes).r)) discard;
        outColor = vec4(${rgb(WF.glint).map((v) => v.toFixed(4)).join(', ')}, 1.0);
      }
    `,
    uniforms: { uScroll: { value: 0 }, uFocal: { value: 720 }, uDepth: { value: null }, uRes: { value: new Vector2() }, uNear: { value: 1 }, uFar: { value: 1000 } },
    transparent: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
  });
}

function glintGeometry(): BufferGeometry {
  const position: number[] = [];
  const star: number[] = [];
  const phase: number[] = [];
  // An eight-point star: long arms out to 1, short ones to 0.22.
  const q = 0.22;
  const ring: Array<[number, number]> = [[-1, 0], [-q, q], [0, 1], [q, q], [1, 0], [q, -q], [0, -1], [-q, -q]];
  for (let k = 2; k < 14; k++) {
    const z = WATER_Z - 22 * Math.pow(1.24, k);
    for (const { x, i } of copies(90 * k, 260 + 60 * k, X0 - 2400 - 1600, X0 + 2400 + 1600)) {
      const p = at(x + 120 * hash2(i, k, 40), 0, z);
      for (let j = 0; j < 8; j++) {
        for (const v of [[0, 0], ring[j], ring[(j + 1) % 8]] as Array<[number, number]>) {
          position.push(...p);
          star.push(v[0], v[1]);
          phase.push(hash2(i, k, 41));
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('aStar', new Float32BufferAttribute(star, 2));
  g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  return g;
}

export class Waterfront3D {
  readonly group = new Group();
  /** See-through parts drawn after the outlines: ripples, boats, glints, glows. */
  readonly overlay = new Group();
  readonly overlayMaterials: ShaderMaterial[] = [];
  readonly propInk = INK;
  private readonly ground = waterfrontGroundMaterial();
  private readonly street = new Group();
  private readonly overlayStreet = new Group();
  private readonly glints = glintMaterial();
  private readonly materials: ShaderMaterial[] = [];
  constructor() {
    const solid = bakedMaterial();
    this.materials.push(solid, this.ground, this.glints);
    const props = new Bake();
    const wall = new Bake();
    const shadowPolys: GroundPolygon[] = [];
    const shadow = (pts: V3[], r: number, minZ = WATER_Z) => shadowPolys.push(groundHull(pts, r, minZ));
    const boxCorners = (x0: number, x1: number, z0: number, z1: number, h0: number, h1: number) => {
      const out: V3[] = [];
      for (const x of [x0, x1]) for (const h of [h0, h1]) for (const z of [z0, z1]) out.push(phys(x, h, z));
      return out;
    };

    // ----- The ground -----
    const groundGeometry = new PlaneGeometry(80000, 3400);
    groundGeometry.rotateX(-Math.PI / 2);
    groundGeometry.translate(0, 0, (WATER_Z + 2700) / 2);
    const ground = new Mesh(groundGeometry, this.ground);
    ground.frustumCulled = false;
    ground.renderOrder = -50;

    // ----- Ledges: the plaza's, waxed where they get skated -----
    for (const [offset, len] of LEDGES) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        const idx = i * 3 + offset;
        const copy = ((i % 4) + 4) % 4;
        const id = 40 + copy * 6;
        props.box(at(x, 0, LEDGE_FRONT_Z - LEDGE_DEPTH), at(x + len, LEDGE_H, LEDGE_FRONT_Z), WF.ledge, WF.ledge, prop(id, 5, 0.55, 5 + copy), 'tfkle');
        // Paint along the front lip, and wax along the stretch of top that gets skated.
        const front = prop(id + 2, 7, 0.55, 5 + copy);
        const lip = tone(PALETTE.paint, lambert({ x: 0, y: 0, z: 1 }));
        props.quad(at(x, LEDGE_H - 3.2, LEDGE_FRONT_Z + 0.05), at(x + len, LEDGE_H - 3.2, LEDGE_FRONT_Z + 0.05), at(x + len, LEDGE_H, LEDGE_FRONT_Z + 0.05), at(x, LEDGE_H, LEDGE_FRONT_Z + 0.05), [0, 0, 1], { color: lip }, front);
        const w0 = x + len * (0.15 + 0.3 * hash2(idx, 0, 30));
        const w1 = w0 + len * 0.35;
        const topColor = mixHex(tone(WF.ledge, lambert({ x: 0, y: -1, z: 0 })), PALETTE.ink, 0.12);
        props.quad(at(w0, LEDGE_H + 0.05, LEDGE_FRONT_Z), at(w1, LEDGE_H + 0.05, LEDGE_FRONT_Z), at(w1, LEDGE_H + 0.05, LEDGE_FRONT_Z - 5), at(w0, LEDGE_H + 0.05, LEDGE_FRONT_Z - 5), [0, 1, 0], { color: topColor }, prop(id, 5, 0.55, 5 + copy));
        shadow(boxCorners(x, x + len, LEDGE_FRONT_Z - LEDGE_DEPTH, LEDGE_FRONT_Z, 0, LEDGE_H), 0.5, -Infinity);
      }
    }

    // ----- Benches, planters, and bins along the seating row -----
    for (const offset of BENCHES) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        const id = 64 + ((i % 2) + 2) % 2 * 24;
        const z = SEAT_Z;
        const len = 64;
        const ink = 0.4;
        for (const [k, lx] of [[0, x + 5], [1, x + len - 9]] as const) {
          props.box(at(lx, 0, z - 15), at(lx + 4, 11.5, z - 1), WF.lampMetal, WF.lampMetal, prop(id + k * 6, 30, ink, 0), 'tfkle');
        }
        props.box(at(x, 18, z - 17), at(x + len, 32, z - 14), WF.wood, WF.woodLit, prop(id + 12, 31, ink), 'tbfkle');
        props.box(at(x, 11.5, z - 16), at(x + len, 15, z), WF.wood, WF.woodLit, prop(id + 18, 32, ink), 'tbfkle');
        shadow(boxCorners(x, x + len, z - 17, z, 0, 32), 1);
      }
    }
    for (const offset of PLANTERS) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        const idx = i * 7 + offset;
        const id = 112 + ((i % 2) + 2) % 2 * 7;
        const z = SEAT_Z;
        props.box(at(x, 0, z - 30), at(x + 96, 20, z), WF.planter, WF.planter, prop(id, 33, 0.5), 'tfkle');
        shrubs(props, x, x + 96, z - 30, z, 20, idx, id + 6);
        shadow(boxCorners(x, x + 96, z - 30, z, 0, 34), 1);
      }
    }
    for (const offset of BINS) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        const id = 126 + ((i % 2) + 2) % 2 * 2;
        const z = SEAT_Z - 8;
        const w = 7.5;
        const body: Paint = { color: WF.bin, lit: { color: mixHex(WF.bin, WF.railLit, 0.4), from: 0.25, to: 0.75 } };
        props.tube([at(x, 0, z), at(x, 28, z)], [w, w], body, prop(id, 34, 0.4), 18, false);
        const lid = mixHex(WF.bin, '#ffffff', 0.15);
        for (let k = 0; k < 24; k++) {
          const a0 = (k / 24) * Math.PI * 2;
          const a1 = ((k + 1) / 24) * Math.PI * 2;
          const r = w + 1;
          props.triangle(at(x, 28.2, z), at(x + Math.cos(a1) * r, 28.2, z + Math.sin(a1) * r), at(x + Math.cos(a0) * r, 28.2, z + Math.sin(a0) * r), [0, 1, 0], { color: lid }, prop(id + 1, 35, 0.4));
        }
        shadow([phys(x - w, 28, z), phys(x + w, 28, z), phys(x, 0, z)], 7);
      }
    }

    // ----- Palms and lamps, strung with festoon lights -----
    const anchors: Array<{ x: number; h: number }> = [];
    for (const offset of PALMS) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        const idx = i * 7 + offset;
        anchors.push({ x, h: 150 });
        const ids = 130 + ((i % 2) + 2) % 2 * 16;
        const h = 250 + 50 * hash2(idx, 0, 11);
        const lean = (hash2(idx, 0, 12) - 0.5) * 70;
        const N = 10;
        const spine: Vec3[] = [];
        const radii: number[] = [];
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          spine.push(at(x + lean * t * t, h * t, TREE_Z));
          radii.push(((13 - 5 * t) / 2) * (k === 0 ? 1.25 : 1));
        }
        const trunk: Paint = { color: WF.trunk, lit: { color: WF.trunkLit, from: 0.1, to: 2 } };
        props.tube(spine, radii, trunk, prop(ids, 10, 0.5), 12);
        // Rings round the trunk where its segments meet.
        const ring: Paint = { color: mixHex(WF.trunk, WF.trunkRing, 0.7), lit: { color: mixHex(WF.trunkLit, WF.trunkRing, 0.7), from: 0.1, to: 2 } };
        for (let k = 1; k < N; k++) {
          const p = spine[k];
          const q = spine[k + 1];
          const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
          const u = 0.45 / len;
          const a: Vec3 = [p[0] + (q[0] - p[0]) * -u, p[1] + (q[1] - p[1]) * -u, p[2] + (q[2] - p[2]) * -u];
          const b: Vec3 = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
          props.tube([a, b], [radii[k] + 0.08, radii[k] + 0.08], ring, prop(ids, 10, 0.5), 12, false);
        }
        const top = spine[N];
        palmCrown(props, top, idx, ids);
        const crown = phys(x + lean, h, TREE_Z);
        shadow([phys(x, 0, TREE_Z), phys(x + lean * 0.3, h * 0.55, TREE_Z), crown], 5);
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2 + idx;
          shadow([
            crown,
            { x: crown.x + Math.cos(a) * 48, y: crown.y - 10, z: crown.z + Math.sin(a) * 48 },
            { x: crown.x + Math.cos(a) * 92, y: crown.y + 30, z: crown.z + Math.sin(a) * 92 },
          ], 7);
        }
      }
    }
    const glows = new Bake();
    for (const offset of LAMPS) {
      for (const { x, i } of copies(offset, ROW_PERIOD)) {
        anchors.push({ x, h: 136 });
        const ids = 162 + ((i % 2) + 2) % 2 * 8;
        const z = TREE_Z;
        const metal: Paint = { color: WF.lampMetal };
        props.tube([at(x, 0, z), at(x, LAMP_H, z)], [2.6, 1.6], metal, NO_INK, 8);
        props.frustum(x - X0, z, 0, 12, 5, 5, metal, NO_INK);
        props.frustum(x - X0, z, 12, 15, 5, 3, metal, NO_INK);
        props.frustum(x - X0, z, LAMP_H, LAMP_H + 2.5, 4, 5.5, metal, NO_INK);
        props.frustum(x - X0, z, LAMP_H + 2, LAMP_H + 16, 5, 6.5, { color: WF.lampGlass }, prop(ids, 12, 0.45));
        props.frustum(x - X0, z, LAMP_H + 16, LAMP_H + 24, 9, 0.01, metal, prop(ids + 5, 13, 0.45));
        props.tube([at(x, LAMP_H + 24, z), at(x, LAMP_H + 28, z)], [0.7, 0.7], metal, NO_INK, 6);
        // The glow sits behind the lantern, so the lamp covers its middle.
        glows.glow(at(x, LAMP_H + 9, z), 30, WF.lampGlow, 0.75, -14);
        shadow([phys(x, 0, z), phys(x, LAMP_H, z), phys(x, LAMP_H + 24, z)], 3);
      }
    }
    anchors.sort((a, b) => a.x - b.x);
    const bulbs = new Bake();
    for (let k = 0; k + 1 < anchors.length; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      const z = TREE_Z + 3;
      const wire = (t: number) => at(a.x + (b.x - a.x) * t, a.h + (b.h - a.h) * t - 26 * 4 * t * (1 - t), z);
      const pts = Array.from({ length: 13 }, (_, i) => wire(i / 12));
      props.tube(pts, pts.map(() => 0.35), { color: WF.lampMetal }, NO_INK, 5, false);
      for (let i = 1; i < 9; i++) {
        const p = wire(i / 9);
        props.disc(p, 0, -1.7, 1.7, { color: WF.lampGlass }, NO_INK, 0.5, 0, 0, Math.PI * 2, 12);
        bulbs.disc(p, 0, -1.7, 5.5, { color: WF.lampGlow, alpha: 0.22 }, NO_INK, 0.2, 0, 0, Math.PI * 2, 16);
      }
    }

    // ----- The sea wall: coping, railing, lifebuoys -----
    wall.box([-40000, -2, WATER_Z], [40000, COPING_H, WALL_Z], WF.coping, WF.coping, prop(230, 4, 0.3, 13), 'tfkle');
    const railTop = COPING_H + RAIL_H;
    wall.flatBox([-40000, COPING_H + RAIL_H * 0.5 - 1.6, RAIL_Z - 0.6], [40000, COPING_H + RAIL_H * 0.5, RAIL_Z + 0.6], WF.rail);
    wall.flatBox([-40000, railTop + 1 - 3.2, RAIL_Z - 0.7], [40000, railTop + 1, RAIL_Z + 0.7], WF.rail);
    wall.flatBox([-40000, railTop + 1.4 - 1.1, RAIL_Z - 0.75], [40000, railTop + 1.4, RAIL_Z + 0.8], WF.railLit);
    for (const { x } of copies(0, 52)) props.flatBox(at(x - 1.5, COPING_H, RAIL_Z - 0.75), at(x + 1.5, railTop, RAIL_Z + 0.75), WF.rail);
    for (const { x } of copies(670, 1600)) {
      const c = at(x, COPING_H + 24, RAIL_Z + 2);
      const r = 7;
      props.disc(c, 0, 0, r + 2.8, { color: INK }, NO_INK, 2, r - 2.8);
      props.disc(c, 0, 0, r + 2, { color: WF.buoy }, NO_INK, 2.1, r - 2);
      // Four white bands round the ring (clockwise on screen from three o'clock).
      for (let k = 0; k < 4; k++) {
        const from = -((k * 90 + 18) * Math.PI) / 180;
        const to = -((k * 90 - 14.4) * Math.PI) / 180;
        props.disc(c, 0, 0, r + 2, { color: WF.sail }, NO_INK, 2.2, r - 2, from, to, 8);
      }
      props.disc(c, -0.75, -0.3, 7.7 + 0.5, { color: mixHex(WF.buoy, '#fff4e0', 0.6) }, NO_INK, 2.3, 7.7 - 0.5, (23.7 * Math.PI) / 180, (125.8 * Math.PI) / 180, 10);
    }

    // ----- The bay: ripples and boats (see-through, after the outlines) -----
    const water = new Bake();
    for (let k = 0; k < 24; k++) {
      const z = WATER_Z - 22 * Math.pow(1.24, k);
      const period = Math.max(60, 0.075 * (520 - 0.9 * z));
      // Far dashes thicken to a hairline on screen.
      const thick = Math.max(1.3, (0.3 * (520 - z)) / 720);
      for (const { x, i } of copies((k * 37) % period, period, X0 - 3200 - 1600, X0 + 3200 + 1600)) {
        const h = hash2(i, k, 3);
        if (h <= 0.55 && h >= 0.3) continue;
        const len = period * (0.22 + 0.4 * h);
        const x0 = x + period * 0.5 * hash2(i, k, 4);
        const paint = h > 0.55 ? { color: WF.rippleLit, alpha: 0.75 } : { color: WF.rippleDark, alpha: 0.3 };
        const mid = x0 + len / 2;
        water.quad(at(x0, 0, z), at(mid, -thick * 0.6, z), at(x0 + len, 0, z), at(mid, thick, z), [0, 0, 1], paint, NO_INK);
      }
    }
    for (const [offset, z, period, shape] of BOATS) {
      for (const { x } of copies(offset, period, X0 - 6000 - 1600, X0 + 6000 + 1600)) {
        const foot = at(x, 0, z);
        shape.forEach((part, k) => {
          const paint = { color: part.color, alpha: part.alpha ?? 1 };
          const pts = part.pts.map(([px, py]) => [px, -py] as [number, number]);
          if (part.line) water.billboardLine(foot, pts, part.line, paint, NO_INK, k * 0.05);
          else water.billboard(foot, pts, paint, NO_INK, k * 0.05);
        });
      }
    }

    const mesh = (bake: Bake, material: ShaderMaterial) => {
      const m = new Mesh(bake.geometry(), material);
      m.frustumCulled = false;
      return m;
    };
    this.street.add(mesh(props, solid));
    this.group.add(ground, this.street, mesh(wall, solid));

    const flat = overlayMaterial();
    const soft = overlayMaterial(true);
    this.overlayMaterials.push(flat, soft, this.glints);
    this.materials.push(flat, soft);
    const glintMesh = new Mesh(glintGeometry(), this.glints);
    glintMesh.frustumCulled = false;
    this.overlayStreet.add(mesh(water, flat), glintMesh, mesh(glows, soft), mesh(bulbs, flat));
    this.overlay.add(this.overlayStreet);
    // Prop shadows, laid on the asphalt in street coordinates.
    const position: number[] = [];
    const channel: number[] = [];
    for (const poly of shadowPolys) {
      for (let k = 1; k + 1 < poly.length; k++) {
        for (const p of [poly[0], poly[k], poly[k + 1]]) {
          position.push(p.x - X0, 0, p.z);
          channel.push(0, 0, 0, 1);
        }
      }
    }
    const shadowGeometry = new BufferGeometry();
    shadowGeometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    shadowGeometry.setAttribute('channel', new Float32BufferAttribute(channel, 4));
    this.shadowGeometry = shadowGeometry;
  }

  /** Prop shadow triangles (channel 4), for the renderer's shadow pass. */
  readonly shadowGeometry: BufferGeometry;

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number]) {
    const { cam, box } = view;
    this.street.position.x = -scroll;
    this.overlayStreet.position.x = -scroll;
    const u = this.ground.uniforms;
    u.uBox.value.set(box.x, box.y, box.width, box.height);
    u.uRes.value.set(size.width, size.height);
    u.uHorizon.value = cam.horizonY;
    u.uPlazaNear.value = cam.project({ x: X0, y: ASPHALT, z: 120 }).y;
    u.uScroll.value = scroll;
    u.uPxPerUnit.value = size.height / box.height;
    u.uShadow.value = shadow;
    u.uShadowOpacity.value.set(...shadowOpacity);
    this.glints.uniforms.uScroll.value = scroll;
    this.glints.uniforms.uFocal.value = view.focal;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.shadowGeometry.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.overlay.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
  }
}
