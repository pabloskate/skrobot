import { BufferGeometry, Float32BufferAttribute, Group, Mesh, PlaneGeometry, type ShaderMaterial, type Texture } from 'three';
import { fromThree, type StageView, type Vec3 } from '../../camera/view';
import { X0 } from '../../motion/trick';
import { mixHex } from '../../math';
import { groundHull } from '../../stage/stage';
import { NO_INK, type Ink } from '../../three/bake';
import { hash2, SPAN_HI, SPAN_LO } from '../setKit';
import { SET_SCALE } from '../setScale';
import { QuayBake, quayMaterial, SURFACE } from './quayMaterial';
import { waterfrontGroundMaterial } from './waterfrontGround';
import { WATER_Z } from './waterfrontLayout';
import { HarborPanorama } from './waterfrontPanorama';

// Model coordinates are in set units (29 per foot), relative to the rider's rolling spot.
const LO = SPAN_LO - X0 - 1600;
const HI = SPAN_HI - X0 + 1600;
const PANEL = 186;
const RAIL_Z = WATER_Z + 21;
const CAP = 8;
const RAIL_TOP = 101;
const GALVANIZED = '#859293';
const DARK_STEEL = '#505c5c';
const CAST = '#4b4841';
const ZINC = '#afb4af';
const tag = (solid: number): Ink => ({ ...NO_INK, solid });

/** Opaque fittings batched together; silhouettes in the alpha channel of the stage's shadow atlas. */
class Quay {
  readonly bake = new QuayBake();
  constructor(private readonly shadows: number[]) {}

  box(lo: Vec3, hi: Vec3, color: string, surface: number) {
    this.bake.box(lo, hi, color, color, tag(surface));
  }

  pipe(points: Vec3[], radii: number[], color: string, surface: number = SURFACE.steel, sides = 10) {
    this.bake.tube(points, radii, { color }, tag(surface), sides);
  }

  shadow(points: Vec3[], radius: number) {
    const hull = groundHull(points.map(fromThree), radius, WATER_Z);
    for (let i = 1; i + 1 < hull.length; i++) {
      for (const p of [hull[0], hull[i], hull[i + 1]]) this.shadows.push(p.x - X0, 0, p.z);
    }
  }

}

function shadowGeometry(vertices: number[]) {
  const geometry = new BufferGeometry();
  const channels = new Float32Array(vertices.length / 3 * 4);
  for (let n = 3; n < channels.length; n += 4) channels[n] = 1;
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('channel', new Float32BufferAttribute(channels, 4));
  return geometry;
}

function quayEdge(q: Quay, x: number, i: number) {
  // Each piece of salt-stained coping has a recessed joint and a small chamfer at its walking edge.
  const end = x + PANEL - 0.6;
  const front = WATER_Z + 35;
  const tone = mixHex('#a29f92', '#c0bcae', hash2(i, 1, 1));
  q.box([x, -95, WATER_Z], [end, CAP - 1.2, front], tone, SURFACE.concrete);
  q.box([x + 0.7, CAP - 1.2, WATER_Z + 0.8], [end - 0.7, CAP, front - 1.2], tone, SURFACE.concrete);

  const rust = mixHex('#65574c', '#8b6147', hash2(i, 1, 5));
  q.box([x - 7, CAP + 0.08, RAIL_Z - 6], [x + 7, CAP + 1.4, RAIL_Z + 6], rust, SURFACE.castIron);
  q.pipe([[x, CAP + 1.4, RAIL_Z], [x, CAP + 5, RAIL_Z]], [5.3, 4.2], DARK_STEEL);
  q.pipe([[x, CAP + 4, RAIL_Z], [x, RAIL_TOP, RAIL_Z]], [2.35, 2.35], GALVANIZED);
  for (const dx of [-4.5, 4.5]) {
    for (const dz of [-3.8, 3.8]) {
      q.pipe([[x + dx, CAP + 1.4, RAIL_Z + dz], [x + dx, CAP + 2.9, RAIL_Z + dz]], [1.05, 0.92], ZINC, SURFACE.steel, 6);
    }
  }
  // Sleeve couplings are slightly darker than the pipe; the upper rail catches skylight continuously.
  for (const [h, r] of [[RAIL_TOP, 2.35], [58, 1.7], [29, 1.35]]) {
    const ends: Vec3[] = [[x, h, RAIL_Z], [x + PANEL, h, RAIL_Z]];
    q.pipe(ends, [r, r], GALVANIZED);
    q.pipe([[x - 4, h, RAIL_Z], [x + 4, h, RAIL_Z]], [r + 0.75, r + 0.75], DARK_STEEL);
    q.shadow(ends, r);
  }
  q.shadow([[x, CAP, RAIL_Z], [x, RAIL_TOP, RAIL_Z]], 2.4);
}

/** Twin cast mooring posts are bolted through a common foot; their broad crowns retain the mooring line. */
function mooringBitts(q: Quay, x: number) {
  const z = WATER_Z + 64;
  q.box([x - 28, 0, z - 11], [x + 28, 3.5, z + 11], CAST, SURFACE.castIron);
  for (const dx of [-15, 15]) {
    const center = x + dx;
    const heights = [3.5, 6, 9, 26, 28.5, 32.5, 34];
    q.pipe(heights.map(h => [center, h, z]), [9, 8.6, 7.3, 6.1, 10, 10.6, 9], CAST, SURFACE.castIron, 16);
    // The ridge worn by dock lines has exposed a lighter band of iron.
    q.pipe([[center, 23, z], [center, 26, z]], [6.45, 6.3], '#787364', SURFACE.castIron, 16);
    q.shadow([[center, 0, z], [center, 33, z]], 9);
  }
  for (const dx of [-23, 23]) for (const dz of [-7, 7]) {
    q.pipe([[x + dx, 3.5, z + dz], [x + dx, 5.8, z + dz]], [1.8, 1.55], '#797366', SURFACE.castIron, 6);
  }
}

/** A proper torus in the bracket, including its four retroreflective strips and the slack grab line. */
function lifeRing(q: Quay, x: number) {
  const z = RAIL_Z + 7.2;
  const h = 63;
  const axis = 26;
  const radius = 6.1;
  const n = 48, cross = 8;
  const orange = '#c86037', white = '#d8d4c2';
  for (let i = 0; i < n; i++) {
    const paint = { color: i % 12 < 2 || i % 12 === 11 ? white : orange };
    for (let j = 0; j < cross; j++) {
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
        const angle = 2 * Math.PI * a / n;
        const roll = 2 * Math.PI * b / cross;
        const normal: Vec3 = [Math.cos(angle) * Math.cos(roll), Math.sin(angle) * Math.cos(roll), Math.sin(roll)];
        const p: Vec3 = [x + axis * Math.cos(angle) + radius * normal[0], h + axis * Math.sin(angle) + radius * normal[1], z + radius * normal[2]];
        q.bake.vertex(p, normal, paint, tag(SURFACE.enamel));
      }
    }
  }
  const line: Vec3[] = [];
  for (let j = 0; j <= 32; j++) {
    const a = j * Math.PI / 16;
    const r = axis + radius + 3 * Math.abs(Math.sin(2 * a));
    line.push([x + Math.cos(a) * r, h + Math.sin(a) * r - 1.4, z + 0.5]);
  }
  q.pipe(line, line.map(() => 0.75), '#a89f84', SURFACE.cord, 5);
  q.box([x - 2.4, h - 1, RAIL_Z + 1.8], [x + 2.4, h + 27, z - 4], DARK_STEEL, SURFACE.steel);
}

/** A backless seat built from five thick, individually silvered wharf planks. */
function quayBench(q: Quay, x: number, i: number) {
  const z = WATER_Z + 157;
  const len = 170;
  for (const dx of [17, len - 27]) {
    q.box([x + dx - 2, 0, z - 2], [x + dx + 12, 2.1, z + 42], DARK_STEEL, SURFACE.steel);
    q.box([x + dx, 2.1, z + 2], [x + dx + 10, 36, z + 38], '#919185', SURFACE.concrete);
    q.box([x + dx - 3, 36, z - 1], [x + dx + 13, 38.2, z + 41], DARK_STEEL, SURFACE.steel);
  }
  for (let plank = 0; plank < 5; plank++) {
    const color = mixHex('#897968', '#ad9c84', hash2(i, plank, 22));
    const near = z + plank * 8.2;
    q.box([x, 38.2, near], [x + len, 43.7, near + 7.4], color, SURFACE.timber);
  }
  q.shadow([[x, 42, z], [x + len, 42, z], [x, 42, z + 40], [x + len, 42, z + 40]], 1.0);
}

/** Grab rails roll over the cap and the ladder descends outside the sea wall. */
function quayLadder(q: Quay, x: number) {
  for (const dx of [-20, 20]) {
    const lower: Vec3 = [x + dx, -90, WATER_Z - 7];
    const spine: Vec3[] = [lower, [x + dx, 25, WATER_Z - 7]];
    for (let i = 1; i <= 8; i++) {
      const a = Math.PI * i / 8;
      spine.push([x + dx, 25 + 10 * Math.sin(a), WATER_Z + 3 - 10 * Math.cos(a)]);
    }
    spine.push([x + dx, CAP, WATER_Z + 13]);
    q.pipe(spine, spine.map(() => 1.9), '#acaaa0');
  }
  for (let h = -78; h <= 14; h += 23) {
    q.pipe([[x - 20, h, WATER_Z - 7], [x + 20, h, WATER_Z - 7]], [1.4, 1.4], DARK_STEEL);
  }
}

/** A pitched-roof freight shed with a low office addition, set across the apron. */
function transitShed(q: Quay) {
  const x = 650, end = 1250, z = 3000, back = z + 425, ridge = (z + back) / 2;
  const eaves = 307, top = 378;
  const zinc = '#737f7e', siding = '#a7aca2', trim = '#5f6b69';
  q.box([x, 0, z], [end, eaves, back], siding, SURFACE.siding);
  q.box([x - 1, 0, z - 3], [end + 1, 31, back + 2], '#a39988', SURFACE.concrete);

  // The eaves cast a dark return below each corrugated roof plane. The gable closes its actual pitch.
  const pitch = (top - eaves) / (ridge - z);
  for (const [edgeZ, direction] of [[z - 14, -1], [back + 14, 1]]) {
    const low = eaves - 14 * pitch;
    const normal: Vec3 = [0, 1 / Math.hypot(1, pitch), direction * pitch / Math.hypot(1, pitch)];
    q.bake.quad([x - 10, low, edgeZ], [end + 10, low, edgeZ], [end + 10, top, ridge], [x - 10, top, ridge],
      normal, { color: zinc }, tag(SURFACE.siding));
    q.box([x - 10, low - 7, edgeZ - 2], [end + 10, low, edgeZ + 2], trim, SURFACE.steel);
  }
  for (const side of [x, end]) {
    q.bake.triangle([side, eaves, z], [side, eaves, back], [side, top, ridge],
      [side === x ? -1 : 1, 0, 0], { color: siding }, tag(SURFACE.siding));
  }

  // Recessed roller shutter with deep jambs and its two protective cast bollards.
  q.box([x + 48, 0, z - 5], [x + 327, 224, z], trim, SURFACE.steel);
  q.box([x + 54, 0, z - 6], [x + 321, 216, z - 5], '#899893', SURFACE.shutter);
  for (const dx of [36, 340]) {
    q.pipe([[x + dx, 0, z - 22], [x + dx, 47, z - 22], [x + dx, 49, z - 22]], [4.4, 4.4, 3.2], '#a99054', SURFACE.enamel);
  }
  q.box([x + 371, 95, z - 4], [end - 25, 178, z], trim, SURFACE.steel);
  for (let i = 0; i < 3; i++) {
    q.box([x + 375 + i * 67, 100, z - 4.5], [x + 436 + i * 67, 172, z - 4], '#40575b', SURFACE.glass);
  }
  const office = end + 238, door = end + 45, wall = z + 44;
  q.box([end, 0, wall], [office, 182, back - 70], '#9c9a8e', SURFACE.concrete);
  q.box([end, 178, wall - 18], [office + 12, 190, back - 60], zinc, SURFACE.siding);
  q.box([door, 0, wall - 2], [door + 79, 157, wall], '#617472', SURFACE.shutter);
  q.box([door + 10, 76, wall - 2.5], [door + 69, 146, wall - 2], '#445958', SURFACE.glass);
  q.pipe([[x + 8, eaves, z - 10], [x + 8, 15, z - 10], [x + 8, 8, z - 20]], [3.2, 3.2, 3.2], ZINC);
  q.shadow([[x, 0, z], [end, 0, z], [x, eaves, z], [end, eaves, z],
    [x, top, ridge], [end, top, ridge], [x, 0, back], [end, 0, back]], 0);
  q.shadow([[end, 0, wall], [office, 0, wall], [end, 189, wall - 18], [office, 189, wall - 18],
    [end, 189, back - 60], [office, 189, back - 60]], 0);
}

export class Waterfront3D {
  readonly group = new Group();
  readonly overlay = new Group();
  readonly overlayMaterials: ShaderMaterial[] = [];
  readonly propInk = '#545d5d';
  readonly shadowGeometry: BufferGeometry;
  readonly panorama = new HarborPanorama();
  readonly ready = this.panorama.ready;
  private readonly floor = waterfrontGroundMaterial();
  private readonly fittings = quayMaterial();
  private readonly street = new Group();

  constructor() {
    const shadows: number[] = [];
    // Short batches keep the shed behind the camera and the stretches of rail outside the frustum off the GPU.
    const last = Math.ceil(HI / PANEL);
    for (let first = Math.floor(LO / PANEL); first <= last; first += 6) {
      const q = new Quay(shadows);
      for (let i = first; i < Math.min(first + 6, last + 1); i++) {
        const x = i * PANEL;
        quayEdge(q, x, i);
        if ((i + 101) % 5 === 0) mooringBitts(q, x + PANEL * 0.41);
        if ((i + 102) % 9 === 0) lifeRing(q, x);
        if ((i + 107) % 7 === 0) quayBench(q, x + 22, i);
        if ((i + 99) % 8 === 0) quayLadder(q, x + PANEL / 2);
      }
      this.street.add(new Mesh(q.bake.geometry(), this.fittings));
    }
    const shed = new Quay(shadows);
    transitShed(shed);
    this.street.add(new Mesh(shed.bake.geometry(), this.fittings));
    this.shadowGeometry = shadowGeometry(shadows);
    this.street.scale.setScalar(SET_SCALE);
    const inland = 24000;
    const groundGeometry = new PlaneGeometry(80000, inland - WATER_Z);
    groundGeometry.rotateX(-Math.PI / 2);
    groundGeometry.translate(0, 0, (inland + WATER_Z) / 2);
    const ground = new Mesh(groundGeometry, this.floor);
    ground.scale.setScalar(SET_SCALE);
    ground.renderOrder = -50;
    this.group.add(ground, this.street);
  }

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, opacity: [number, number, number]) {
    this.panorama.update(view, scroll);
    this.street.position.x = -scroll;
    const u = this.floor.uniforms;
    u.uRes.value.set(size.width, size.height);
    u.uScroll.value = scroll / SET_SCALE;
    u.uShadow.value = shadow;
    u.uShadowOpacity.value.set(...opacity);
  }

  dispose() {
    this.panorama.dispose();
    this.floor.dispose();
    this.fittings.dispose();
    this.shadowGeometry.dispose();
    this.group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
  }
}
