import { BufferGeometry, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, ShaderMaterial } from 'three';
import { add3, cross3, dot3, norm3, scale3, sub3, type V3 } from '../scene/math';
import type { Expression } from '../scene/robot';
import { SHOE_HALF_HEIGHT, shiftFrame, type Frame3, type Rig } from '../scene/skeleton';
import {
  HUMANOID_LENGTH,
  humanoidFingerGeometry,
  humanoidFootGeometry,
  humanoidHeadGeometry,
  humanoidLimbGeometry,
  humanoidPalmGeometry,
  humanoidPelvisGeometry,
  humanoidSpineGeometry,
  humanoidTorsoGeometry,
  type HumanoidLimb,
} from './humanoidGeometry';
import { humanoidMaterial } from './humanoidMaterials';
import { dirToThree, toThree, type StageView, type Vec3 } from './view';

/**
 * Original adult humanoid: shaped pearl-alloy armor around an exposed servo
 * frame, a curved optical face, and articulated mechanical hands. It wears
 * the existing human-proportioned rig and the original grounded foot frames;
 * no trick trajectories, foot contacts, or board dimensions are changed.
 *
 * Assemblies are made once. Per-frame work is only rigid matrices and thirty
 * instanced finger links. All surfaces share one continuous-lighting MRT
 * material and the screen-space ink pass receives a zero outline width.
 */

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (v: V3) => Math.hypot(v.x, v.y, v.z);
const unit = (v: Vec3, fallback: Vec3): Vec3 => {
  const size = Math.hypot(...v);
  return size < 1e-6 ? fallback : [v[0] / size, v[1] / size, v[2] / size];
};

function place(mesh: Mesh | Group, origin: Vec3, x: Vec3, y: Vec3, z: Vec3, along = 1) {
  mesh.matrix.set(
    x[0] * along, y[0], z[0], origin[0],
    x[1] * along, y[1], z[1], origin[1],
    x[2] * along, y[2], z[2], origin[2],
    0, 0, 0, 1,
  );
  mesh.matrixWorldNeedsUpdate = true;
}

function placeFrame(mesh: Mesh | Group, frame: Frame3, symmetric = false) {
  const x = dirToThree(frame.fwd);
  const y = dirToThree(frame.up);
  place(mesh, toThree(frame.origin), x, y, symmetric ? cross(x, y) : dirToThree(frame.side));
}

/** Bone-local x follows its axis; y faces the knee or elbow's open side. */
function placeBone(mesh: Mesh | Group, a: V3, b: V3, hinge: V3, restLength: number) {
  const offset = sub3(b, a);
  const axis = norm3(offset);
  let side = sub3(hinge, scale3(axis, dot3(hinge, axis)));
  if (length(side) < 1e-5) side = cross3(axis, Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
  const x = dirToThree(axis);
  const z = dirToThree(norm3(side));
  place(mesh, toThree(a), x, cross(z, x), z, Math.max(0.001, length(offset)) / restLength);
}

function hipsFrame(rig: Rig): Frame3 {
  const [left, right] = rig.legs[0].side === 'left' ? rig.legs : [rig.legs[1], rig.legs[0]];
  const origin = scale3(add3(left.hip, right.hip), 0.5);
  const side = norm3(sub3(right.hip, left.hip));
  const up = norm3(sub3(rig.torso.up, scale3(side, dot3(rig.torso.up, side))));
  const fwd = cross3(side, up);
  return { origin, side, up, fwd, at: (f, u, s) => add3(origin, add3(scale3(fwd, f), add3(scale3(up, u), scale3(side, s)))) };
}

interface Hand {
  group: Group;
  fingers: InstancedMesh<BufferGeometry, ShaderMaterial>;
}
interface Arm {
  upper: Mesh;
  fore: Mesh;
  hand: Hand;
}
interface Leg {
  thigh: Mesh;
  shin: Mesh;
  foot: Mesh;
}

export class Humanoid3D {
  readonly group = new Group();
  private readonly material = humanoidMaterial();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly torso: Mesh;
  private readonly head: Mesh;
  private readonly pelvis: Mesh;
  private readonly abdomen: Mesh;
  private readonly neck: Mesh;
  private readonly arms: Record<'left' | 'right', Arm>;
  private readonly legs: Record<'left' | 'right', Leg>;
  private readonly fingerMatrix = new Matrix4();
  private disposed = false;

  constructor() {
    const mesh = (geometry: BufferGeometry, name: string): Mesh => {
      this.geometries.add(geometry);
      const object = new Mesh(geometry, this.material);
      object.name = `humanoid-${name}`;
      object.matrixAutoUpdate = false;
      object.frustumCulled = false;
      return object;
    };
    this.group.name = 'humanoid';
    this.torso = mesh(humanoidTorsoGeometry(), 'chest');
    this.head = mesh(humanoidHeadGeometry(), 'optical-head');
    this.pelvis = mesh(humanoidPelvisGeometry(), 'pelvis');
    this.abdomen = mesh(humanoidSpineGeometry(), 'abdomen-servos');
    this.neck = mesh(humanoidSpineGeometry(true), 'neck-servos');
    const shapes = Object.fromEntries((['upper', 'fore', 'thigh', 'shin'] as HumanoidLimb[]).map((kind) => [kind, humanoidLimbGeometry(kind)])) as Record<HumanoidLimb, BufferGeometry>;
    const palm = humanoidPalmGeometry();
    const finger = humanoidFingerGeometry();
    const foot = humanoidFootGeometry();
    this.geometries.add(finger);
    const arm = (side: 'left' | 'right'): Arm => {
      const group = new Group();
      group.name = `humanoid-${side}-hand`;
      group.matrixAutoUpdate = false;
      const fingers = new InstancedMesh(finger, this.material, 15);
      fingers.name = `humanoid-${side}-finger-links`;
      fingers.frustumCulled = false;
      fingers.instanceMatrix.setUsage(DynamicDrawUsage);
      group.add(mesh(palm, `${side}-palm`), fingers);
      return { upper: mesh(shapes.upper, `${side}-upper-arm`), fore: mesh(shapes.fore, `${side}-forearm`), hand: { group, fingers } };
    };
    const leg = (side: 'left' | 'right'): Leg => ({
      thigh: mesh(shapes.thigh, `${side}-thigh`),
      shin: mesh(shapes.shin, `${side}-shin`),
      foot: mesh(foot, `${side}-foot`),
    });
    this.arms = { left: arm('left'), right: arm('right') };
    this.legs = { left: leg('left'), right: leg('right') };
    this.group.add(this.torso, this.head, this.pelvis, this.abdomen, this.neck);
    for (const parts of Object.values(this.arms)) this.group.add(parts.upper, parts.fore, parts.hand.group);
    for (const parts of Object.values(this.legs)) this.group.add(parts.thigh, parts.shin, parts.foot);
  }

  private fingers(hand: Hand, side: 'left' | 'right', curl: number) {
    let instance = 0;
    const link = (at: Vec3, angle: number, yaw: number, size: number, girth = 1) => {
      // Curl toward the palm, with slight independent splay at the knuckles.
      const c = Math.cos(angle), s = Math.sin(angle), cy = Math.cos(yaw), sy = Math.sin(yaw);
      const x: Vec3 = [c * cy, -s, c * sy];
      const y: Vec3 = [s * cy, c, s * sy];
      const z: Vec3 = [-sy, 0, cy];
      this.fingerMatrix.set(
        x[0] * size, y[0] * girth, z[0] * girth, at[0],
        x[1] * size, y[1] * girth, z[1] * girth, at[1],
        x[2] * size, y[2] * girth, z[2] * girth, at[2],
        0, 0, 0, 1,
      );
      hand.fingers.setMatrixAt(instance++, this.fingerMatrix);
      return [at[0] + x[0] * size, at[1] + x[1] * size, at[2] + x[2] * size] as Vec3;
    };
    for (let finger = 0; finger < 4; finger++) {
      let at: Vec3 = [6.2, 0, -2.6 + finger * 1.73];
      const scale = [0.92, 1.04, 0.97, 0.77][finger];
      const yaw = (finger - 1.5) * 0.055;
      for (let joint = 0; joint < 3; joint++) at = link(at, curl * (0.5 + joint * 0.6) + finger * 0.018, yaw, [2.5, 2.1, 1.65][joint] * scale, 0.94);
    }
    const sign = side === 'left' ? 1 : -1;
    let thumb: Vec3 = [2.2, -0.55, sign * 3.1];
    for (let joint = 0; joint < 3; joint++) thumb = link(thumb, 0.18 + curl * (0.25 + joint * 0.25), sign * (0.87 - joint * 0.23), [2.3, 2, 1.65][joint], 1.07);
    hand.fingers.instanceMatrix.needsUpdate = true;
  }

  update(rig: Rig, expression: Expression, view: StageView): void {
    // view is part of the renderer contract; lighting stays in world space.
    void view;
    placeFrame(this.torso, rig.torso);
    // The human rig retains space for hair; this compact optical shell sits
    // lower on the same gaze frame, with an adult-sized short mechanical neck.
    const head = shiftFrame(rig.head, 0, -8.5, 0);
    placeFrame(this.head, head);
    const hips = hipsFrame(rig);
    placeFrame(this.pelvis, hips);
    placeBone(this.abdomen, hips.at(-0.5, 5.2, 0), rig.torso.at(-0.5, -8.4, 0), hips.side, 10);
    placeBone(this.neck, rig.torso.at(-0.8, 25.2, 0), head.at(-3.5, -18.5, 0), head.side, 10);
    this.material.uniforms.uExpression.value = expression === 'happy' ? 1 : expression === 'focus' ? 0.5 : 0;
    const floor = Math.min(0, ...rig.legs.map((leg) => toThree(leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0))[1]));

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      const hinge = add3(cross3(sub3(arm.elbow, arm.shoulder), sub3(arm.hand, arm.elbow)), scale3(rig.torso.side, 30));
      placeBone(parts.upper, arm.shoulder, arm.elbow, hinge, HUMANOID_LENGTH.upper);
      placeBone(parts.fore, arm.elbow, arm.hand, hinge, HUMANOID_LENGTH.fore);
      const axis = norm3(sub3(arm.hand, arm.elbow));
      const out = scale3(rig.torso.side, arm.side === 'right' ? 1 : -1);
      let palm = sub3(out, scale3(axis, dot3(out, axis)));
      if (length(palm) < 1e-5) palm = rig.torso.fwd;
      let x = dirToThree(axis);
      let y = dirToThree(norm3(palm));
      const origin = toThree(arm.hand);
      // A fall's wrist is solved close to the floor. Brace the articulated
      // hand at that same anchor instead of extending fingertips underground.
      const contact = Math.max(0, Math.min(1, (14 - (origin[1] - floor)) / 8));
      if (contact > 0) {
        const flat = unit([x[0], 0, x[2]], [1, 0, 0]);
        x = unit([x[0] + (flat[0] - x[0]) * contact, x[1] * (1 - contact), x[2] + (flat[2] - x[2]) * contact], flat);
        const up = unit([-x[0] * x[1], 1 - x[1] * x[1], -x[2] * x[1]], [0, 1, 0]);
        y = unit([y[0] + (up[0] - y[0]) * contact, y[1] + (up[1] - y[1]) * contact, y[2] + (up[2] - y[2]) * contact], up);
        const dot = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
        y = unit([y[0] - x[0] * dot, y[1] - x[1] * dot, y[2] - x[2] * dot], up);
      }
      place(parts.hand.group, origin, x, y, cross(x, y));
      const bend = 1 - Math.max(-1, Math.min(1, dot3(norm3(sub3(arm.elbow, arm.shoulder)), axis)));
      const curl = (expression === 'wince' ? 0.58 : expression === 'focus' ? 0.23 : 0.13) + bend * 0.045;
      this.fingers(parts.hand, arm.side, curl * (1 - contact));
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      const axis = norm3(sub3(leg.ankle, leg.hip));
      const hinge = add3(cross3(sub3(leg.knee, leg.hip), sub3(leg.ankle, leg.knee)), scale3(cross3(leg.shoe.fwd, axis), 40));
      placeBone(parts.thigh, leg.hip, leg.knee, hinge, HUMANOID_LENGTH.thigh);
      placeBone(parts.shin, leg.knee, leg.ankle, hinge, HUMANOID_LENGTH.shin);
      placeFrame(parts.foot, leg.shoe, true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const hand of Object.values(this.arms)) hand.hand.fingers.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
  }
}
