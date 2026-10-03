import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  GLSL3,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector4,
  type Texture,
} from 'three';
import { X0 } from '../TrickAnimation';
import { PALETTE, lambert, tone } from '../scene/camera';
import { mixHex } from '../scene/math';
import { SPAN_HI, SPAN_LO } from '../scene/setKit';
import { faceBoxGeometry } from './geometry';
import {
  boxMaterial,
  canopyMaterial,
  groundMaterial,
  inkInfo,
  INK_NONE,
  INK_PROP,
  skyMaterial,
  vec3,
} from './materials';
import { ASPHALT, type StageView } from './view';

/**
 * The golden-hour plaza in 3D (backdrop.tsx is the reference). The sky and
 * everything at infinity — its gradient, the sun's glow, cloud banks, two
 * skylines, the horizon haze — is one screen-space pass drawn exactly as the
 * SVG lays it out. The ground is a real plane: the plaza's concrete with its
 * slab joints, the lawn behind it, and the cast shadows. The trees and the
 * ledge row are real objects at their SVG depths, repeating along the street
 * and sliding with it.
 */

const SLAB = 64;
const LEDGE_FRONT_Z = -330;
const LEDGE_DEPTH = 24;
const LEDGE_H = 17;
const LAWN_Z = LEDGE_FRONT_Z - LEDGE_DEPTH - 8;
const TREE_Z = -440;
const FAR_TREE_Z = -1100;
const FAR_Z = -20000;

const TREES: ReadonlyArray<readonly [number, number]> = [[0, 26], [160, 21], [290, 30], [470, 23], [590, 27]];
const TREE_PERIOD = 720;
const FAR_TREES: ReadonlyArray<readonly [number, number]> = [[0, 34], [110, 28], [200, 40], [320, 30], [410, 26], [505, 38]];
const FAR_TREE_PERIOD = 620;
const LEDGES: ReadonlyArray<readonly [number, number]> = [[0, 190], [290, 120], [500, 210]];
const LEDGE_PERIOD = 800;

const PROP_INK = 1.1;
/** The waxed paint along a ledge's front lip, lit as the front face is. */
const LIP = tone(PALETTE.paint, lambert({ x: 0, y: 0, z: 1 }));
const TREE_INK = 0.9;
const PROP_PRIORITY = 5;

/** Physics x of every copy of a pattern element laid out across the street's span. */
function copies(offset: number, period: number): number[] {
  const out: number[] = [];
  const from = Math.floor((SPAN_LO - period - offset) / period);
  const to = Math.ceil((SPAN_HI + period - offset) / period);
  for (let k = from; k <= to; k++) out.push(offset + k * period);
  return out;
}

/** Pattern layers slide by the street's travel, wrapped to their period. */
const slide = (group: Group, period: number, scroll: number) => {
  group.position.x = -(((scroll % period) + period) % period);
};

const TRUNK_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

function trunkMaterial(hex: string) {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: TRUNK_VERT,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 outColor;
      layout(location = 1) out vec4 outInfo;
      uniform vec3 uColor;
      uniform vec4 uInfo;
      void main() {
        outColor = vec4(uColor, 1.0);
        outInfo = uInfo;
      }
    `,
    uniforms: { uColor: { value: vec3(hex) }, uInfo: { value: new Vector4() } },
  });
}

/** A row of trees: trunks and round canopies, at one depth, repeating. */
function treeRow(
  pattern: ReadonlyArray<readonly [number, number]>,
  period: number,
  z: number,
  crownLift: number,
  trunkWidth: number,
  colors: { trunk: string; dark: string; lit: string },
  ink: { trunkId: number; canopyId: (i: number) => number; kind: number },
) {
  const group = new Group();
  const trees: Array<{ x: number; r: number }> = [];
  for (const [offset, r] of pattern) for (const x of copies(offset, period)) trees.push({ x: x - X0, r });

  const trunkGeometry = new CylinderGeometry(trunkWidth / 2, trunkWidth / 2, 1, 8, 1, false);
  trunkGeometry.translate(0, 0.5, 0);
  const trunks = new InstancedMesh(trunkGeometry, trunkMaterial(colors.trunk), trees.length);
  const m = new Matrix4();
  for (const [i, tree] of trees.entries()) {
    m.makeScale(1, crownLift + tree.r, 1).setPosition(tree.x, 0, z);
    trunks.setMatrixAt(i, m);
  }
  trunks.frustumCulled = false;
  inkInfo(ink.trunkId, PROP_PRIORITY, TREE_INK, ink.kind, (trunks.material as ShaderMaterial).uniforms.uInfo.value);

  const quad = new PlaneGeometry(2, 2);
  const canopyGeometry = new InstancedBufferGeometry();
  canopyGeometry.index = quad.index;
  canopyGeometry.setAttribute('position', quad.getAttribute('position'));
  canopyGeometry.setAttribute('aCanopy', new InstancedBufferAttribute(new Float32Array(trees.flatMap((t) => [t.x, crownLift + t.r, z, t.r])), 4));
  canopyGeometry.setAttribute('aId', new InstancedBufferAttribute(new Float32Array(trees.map((_, i) => ink.canopyId(i))), 1));
  canopyGeometry.instanceCount = trees.length;
  const canopyMat = canopyMaterial(colors.dark, colors.lit);
  inkInfo(0, PROP_PRIORITY + 1, TREE_INK, ink.kind, canopyMat.uniforms.uInfo.value);
  const canopies = new Mesh(canopyGeometry, canopyMat);
  canopies.frustumCulled = false;
  group.add(trunks, canopies);
  return group;
}

export class Plaza3D {
  readonly group = new Group();
  /** The plaza has no see-through overlays or prop shadows; its props outline in TrickScene's backdrop ink. */
  readonly overlay = new Group();
  readonly overlayMaterials: ShaderMaterial[] = [];
  readonly shadowGeometry = null;
  readonly propInk = mixHex(PALETTE.ink, PALETTE.concrete, 0.5);
  private readonly sky = skyMaterial();
  private readonly ground: ShaderMaterial;
  private readonly ledges = new Group();
  private readonly trees: Group;
  private readonly farTrees: Group;

  constructor() {
    const skyGeometry = new BufferGeometry();
    skyGeometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const sky = new Mesh(skyGeometry, this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -100;

    this.ground = groundMaterial({
      lawnZ: LAWN_Z,
      farZ: FAR_Z,
      jointFromZ: LEDGE_FRONT_Z + SLAB * 0.5,
      jointToZ: 700,
      crossFromZ: LEDGE_FRONT_Z,
      crossToZ: 900,
      slab: SLAB,
      x0: X0,
    });
    const groundGeometry = new PlaneGeometry(80000, 30000);
    groundGeometry.rotateX(-Math.PI / 2);
    groundGeometry.translate(0, 0, FAR_Z + 15000);
    const ground = new Mesh(groundGeometry, this.ground);
    ground.frustumCulled = false;
    ground.renderOrder = -50;

    // The ledge row at the back of the plaza, its front lip waxed in the plaza's paint.
    let copy = 0;
    for (const [offset, len] of LEDGES) {
      const geometry = faceBoxGeometry([0, 0, LEDGE_FRONT_Z - LEDGE_DEPTH], [len, LEDGE_H, LEDGE_FRONT_Z]);
      for (const x of copies(offset, LEDGE_PERIOD)) {
        const material = boxMaterial(PALETTE.ledge, PALETTE.ledge, { hex: LIP, depth: 3.2, topY: LEDGE_H });
        inkInfo(40 + (copy % 8) * 6, PROP_PRIORITY, PROP_INK, INK_PROP, material.uniforms.uInfo.value, 5 + (copy % 8));
        const mesh = new Mesh(geometry, material);
        mesh.position.x = x - X0;
        this.ledges.add(mesh);
        copy++;
      }
    }

    this.trees = treeRow(TREES, TREE_PERIOD, TREE_Z, 30, 3.6, {
      trunk: PALETTE.trunk,
      dark: tone(PALETTE.tree, 0.2),
      lit: tone(PALETTE.tree, 0.62),
    }, { trunkId: 99, canopyId: (i) => 100 + (i % 120), kind: INK_PROP });
    const farTone = mixHex(PALETTE.tree, PALETTE.lawnFar, 0.5);
    this.farTrees = treeRow(FAR_TREES, FAR_TREE_PERIOD, FAR_TREE_Z, 18, 3.4, {
      trunk: mixHex(PALETTE.trunk, PALETTE.lawnFar, 0.5),
      dark: farTone,
      lit: farTone,
    }, { trunkId: 0, canopyId: () => 0, kind: INK_NONE });

    this.group.add(sky, ground, this.ledges, this.trees, this.farTrees);
  }

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number]) {
    const { cam, box } = view;
    const horizon = cam.horizonY;
    const plazaNear = cam.project({ x: X0, y: ASPHALT, z: 120 }).y;
    const lawnNear = cam.project({ x: X0, y: ASPHALT, z: LAWN_Z }).y;
    for (const material of [this.sky, this.ground]) {
      const u = material.uniforms;
      u.uBox.value.set(box.x, box.y, box.width, box.height);
      u.uRes.value.set(size.width, size.height);
      u.uHorizon.value = horizon;
      u.uPlazaNear.value = plazaNear;
    }
    this.sky.uniforms.uCloudDrift.value = scroll * cam.drift * 0.015;
    this.sky.uniforms.uFarShift.value = scroll * cam.drift * 0.03;
    this.sky.uniforms.uNearShift.value = scroll * cam.drift * 0.06;
    const g = this.ground.uniforms;
    g.uLawnNear.value = lawnNear;
    g.uScroll.value = scroll;
    g.uPxPerUnit.value = size.height / box.height;
    g.uShadow.value = shadow;
    g.uShadowOpacity.value.set(...shadowOpacity);
    slide(this.ledges, LEDGE_PERIOD, scroll);
    slide(this.trees, TREE_PERIOD, scroll);
    slide(this.farTrees, FAR_TREE_PERIOD, scroll);
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        (o.material as ShaderMaterial).dispose();
      }
    });
  }
}
