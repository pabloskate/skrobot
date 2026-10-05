import { Group, Mesh, SphereGeometry, type BufferGeometry, type ShaderMaterial } from 'three';
import { PALETTE } from '../../camera/camera';
import { mixHex, smoothstep, sub3, norm3, dot3, type V3 } from '../../math';
import type { Expression, RobotLook } from '../look';
import { shiftFrame, type Rig } from '../../motion/skeleton';
import { Capsule, frontDecalGeometry, roundedBoxGeometry, type BoxSpec } from '../../three/geometry';
import { faceMaterial, inkInfo, INK_ROBOT, toonMaterial } from '../../three/materials';
import { shoeGeometries } from '../shoe3d';
import { toThree, type StageView } from '../../camera/view';
import { placeFrame } from '../placement';

/**
 * The robot skater: a chunky toy with a box head and visor screen (its face
 * shows the rider's expression; the antenna is the robot's variant), a
 * softly tapered chest, sturdy graphite limbs, big shell-colored mitts, and
 * sculpted accent skate shoes on cream cupsoles (shoe3d.ts). Every part is
 * matte, two cel tones and no highlight: a glint read as shiny. Poses come
 * straight from the rig.
 */

const HEAD: BoxSpec = { f: 14, u: 15, s: 18, r: 8.5 };
const TORSO_FRAME_U = 25;
const TORSO_BASE_RAISE = 8;
/** Rounded and barely wedge-shaped, so the chest reads as a pebble of shell, not a crate. */
const TORSO: BoxSpec = { f: 11, u: TORSO_FRAME_U - TORSO_BASE_RAISE / 2, s: 15.5, r: 10.5, taper: 0.8 };
/** Limb widths, root → joint → tip: sturdy and only gently tapered, so they read as a toy's limbs, not sticks. */
const ARM_W = [10, 8.8, 8] as const;
const LEG_W = [13, 10.4, 8.6] as const;
const HAND_R = 5.8;
const NECK_W = 8;

/** Outline widths (world units): every part's, and the head's slightly heavier one. */
const INK = 1.15;
const HEAD_INK = INK * 1.1;

/** Part ids for the outline pass: each is one silhouette. */
const ID = { leftArm: 1, rightArm: 2, leftLeg: 3, rightLeg: 4, torso: 5, head: 6, leftShoe: 7, rightShoe: 8 } as const;
/** Paint order (back to front) for parts touching. */
export const ROBOT_PRIORITY = { armFar: 40, legFar: 50, legNear: 55, torso: 60, head: 70, armNear: 80 } as const;
const SHOE_OVER_LEG = 2;

const EXPRESSIONS: Record<Expression, number> = { open: 0, focus: 1, happy: 2, wince: 3 };

function staticMesh(geometry: BufferGeometry, material: ShaderMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** A limb segment, rewritten every frame in world space. */
class Limb {
  readonly capsule = new Capsule();
  readonly mesh: Mesh;
  constructor(readonly material: ShaderMaterial) {
    this.mesh = new Mesh(this.capsule.geometry, material);
    this.mesh.frustumCulled = false;
  }
  set(a: V3, b: V3, wa: number, wb = wa) {
    this.capsule.set(toThree(a), toThree(b), wa / 2, wb / 2);
  }
}

interface ArmParts {
  upper: Limb;
  fore: Limb;
  hand: Mesh;
  materials: ShaderMaterial[];
}

interface LegParts {
  thigh: Limb;
  shin: Limb;
  shoe: Group;
  /** Every material of the leg, its shoe's included. */
  materials: ShaderMaterial[];
  upper: ShaderMaterial;
  sole: ShaderMaterial;
}

const avg = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

export class Robot3D {
  readonly group = new Group();
  private readonly torso: Mesh;
  private readonly head: Mesh;
  private readonly face: Mesh;
  private readonly neck: Limb;
  private readonly antenna: Array<{ stalk?: Limb; tip?: Mesh; crest?: Mesh }> = [];
  private readonly headMaterials: ShaderMaterial[] = [];
  private readonly arms: Record<'left' | 'right', ArmParts>;
  private readonly legs: Record<'left' | 'right', LegParts>;
  private readonly geometries: BufferGeometry[] = [];

  constructor(private readonly look: RobotLook) {
    const limbHex = mixHex(PALETTE.limb, look.body, 0.16);
    const geometry = <T extends BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };

    this.torso = staticMesh(geometry(roundedBoxGeometry(TORSO)), toonMaterial(look.body));
    this.head = staticMesh(geometry(roundedBoxGeometry(HEAD)), toonMaterial(look.body));
    const face = faceMaterial(look.body, look.accent);
    this.face = staticMesh(geometry(frontDecalGeometry(HEAD, 14.6, -10.6, 9.6, 0.15)), face);
    this.head.add(this.face);
    this.neck = new Limb(toonMaterial(limbHex));
    this.headMaterials.push(this.head.material as ShaderMaterial, face, this.neck.material);

    // The per-robot antenna, or the crest instead of one.
    const stalkHex = PALETTE.limb;
    const tip = (r: number) => {
      const mesh = staticMesh(geometry(new SphereGeometry(r, 20, 14)), toonMaterial(look.accent));
      this.headMaterials.push(mesh.material as ShaderMaterial);
      return mesh;
    };
    const stalk = () => {
      const limb = new Limb(toonMaterial(stalkHex));
      this.headMaterials.push(limb.material);
      return limb;
    };
    if (look.variant === 2) {
      const crest = staticMesh(geometry(roundedBoxGeometry({ f: 8.5, u: 3.2, s: 2, r: 1.8 })), toonMaterial(look.accent));
      this.headMaterials.push(crest.material as ShaderMaterial);
      this.antenna.push({ crest });
    } else if (look.variant === 3) {
      this.antenna.push({ stalk: stalk(), tip: tip(2.4) }, { stalk: stalk(), tip: tip(2.4) });
    } else {
      this.antenna.push({ stalk: stalk(), tip: tip(look.variant === 1 ? 2.8 : 3) });
    }

    const handGeometry = geometry(new SphereGeometry(HAND_R, 24, 16));
    const arm = (): ArmParts => {
      const upper = new Limb(toonMaterial(limbHex));
      const fore = new Limb(toonMaterial(limbHex));
      const hand = staticMesh(handGeometry, toonMaterial(look.body));
      return { upper, fore, hand, materials: [upper.material, fore.material, hand.material as ShaderMaterial] };
    };
    const shoeShape = shoeGeometries();
    geometry(shoeShape.sole);
    geometry(shoeShape.upper);
    const leg = (): LegParts => {
      const thigh = new Limb(toonMaterial(limbHex));
      const shin = new Limb(toonMaterial(limbHex));
      const sole = staticMesh(shoeShape.sole, toonMaterial(PALETTE.wheel));
      const upper = staticMesh(shoeShape.upper, toonMaterial(look.accent, { hex: PALETTE.wheel, ...shoeShape.toeCap }));
      const shoe = new Group();
      shoe.matrixAutoUpdate = false;
      shoe.add(sole, upper);
      const parts = { upper: upper.material as ShaderMaterial, sole: sole.material as ShaderMaterial };
      return { thigh, shin, shoe, materials: [thigh.material, shin.material, parts.upper, parts.sole], ...parts };
    };
    this.arms = { left: arm(), right: arm() };
    this.legs = { left: leg(), right: leg() };

    this.group.add(this.torso, this.head, this.neck.mesh);
    for (const part of this.antenna) {
      if (part.stalk) this.group.add(part.stalk.mesh);
      if (part.tip) this.group.add(part.tip);
      if (part.crest) this.group.add(part.crest);
    }
    for (const a of Object.values(this.arms)) this.group.add(a.upper.mesh, a.fore.mesh, a.hand);
    for (const l of Object.values(this.legs)) this.group.add(l.thigh.mesh, l.shin.mesh, l.shoe);

    const ink = (materials: ShaderMaterial[], id: number, width = INK) => {
      for (const m of materials) inkInfo(id, 0, width, INK_ROBOT, m.uniforms.uInfo.value);
    };
    ink([this.torso.material as ShaderMaterial], ID.torso);
    ink(this.headMaterials, ID.head);
    ink([this.head.material as ShaderMaterial, face], ID.head, HEAD_INK);
    ink(this.arms.left.materials, ID.leftArm);
    ink(this.arms.right.materials, ID.rightArm);
    ink(this.legs.left.materials, ID.leftLeg);
    ink(this.legs.right.materials, ID.rightLeg);
    // A shoe outlines itself against its own leg: the shin drops into the collar.
    ink([this.legs.left.upper, this.legs.left.sole], ID.leftShoe);
    ink([this.legs.right.upper, this.legs.right.sole], ID.rightShoe);
  }

  update(rig: Rig, expression: Expression, view: StageView) {
    const { cam } = view;
    placeFrame(this.torso, shiftFrame(rig.torso, 0, TORSO_BASE_RAISE / 2, 0));
    placeFrame(this.head, rig.head);
    this.neck.set(rig.torso.at(0, TORSO_FRAME_U - 4, 0), rig.head.at(-1, -HEAD.u + 1, 0), NECK_W);

    const top = HEAD.u;
    const [first, second] = this.antenna;
    if (first.crest) {
      placeFrame(first.crest, shiftFrame(rig.head, -1, top + 1.2, 0));
    } else if (second) {
      for (const [i, side] of [-1, 1].entries()) {
        const part = this.antenna[i];
        const tip = rig.head.at(-1, top + 7.5, side * 11.5);
        part.stalk!.set(rig.head.at(0, top - 1, side * 9), tip, 2);
        placePoint(part.tip!, tip);
      }
    } else if (this.look.variant === 1) {
      const tip = rig.head.at(-6, top + 10, 9);
      first.stalk!.set(rig.head.at(-2, top - 1, 7), tip, 2.2);
      placePoint(first.tip!, tip);
    } else {
      const tip = rig.head.at(0, top + 9, 0);
      first.stalk!.set(rig.head.at(0, top - 1, 0), tip, 2.2);
      placePoint(first.tip!, tip);
    }

    // The screen fades out gradually as it turns edge-on.
    const facePoint = rig.head.at(HEAD.f, 0, 0);
    const facing = dot3(norm3(sub3(cam.eye, facePoint)), norm3(rig.head.fwd));
    const face = this.face.material as ShaderMaterial;
    face.uniforms.uFade.value = smoothstep((facing - 0.02) / 0.24);
    face.uniforms.uExpression.value = EXPRESSIONS[expression];

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      parts.upper.set(arm.shoulder, arm.elbow, ARM_W[0], ARM_W[1]);
      parts.fore.set(arm.elbow, arm.hand, ARM_W[1], ARM_W[2]);
      placePoint(parts.hand, arm.hand);
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      parts.thigh.set(leg.hip, leg.knee, LEG_W[0], LEG_W[1]);
      parts.shin.set(leg.knee, leg.ankle, LEG_W[1], LEG_W[2]);
      placeFrame(parts.shoe, leg.shoe);
    }

    // Who paints over whom where parts touch: ROBOT_PRIORITY, near and far by depth.
    const [armA, armB] = rig.arms;
    const nearArm = cam.depthOf(armA.shoulder) >= cam.depthOf(armB.shoulder) ? armA.side : armB.side;
    const [legA, legB] = rig.legs;
    const legDepth = (l: typeof legA) => cam.depthOf(avg(l.knee, l.ankle));
    const nearLeg = legDepth(legA) >= legDepth(legB) ? legA.side : legB.side;
    const prioritize = (materials: ShaderMaterial[], priority: number) => {
      for (const m of materials) m.uniforms.uInfo.value.y = priority / 255;
    };
    for (const side of ['left', 'right'] as const) {
      prioritize(this.arms[side].materials, side === nearArm ? ROBOT_PRIORITY.armNear : ROBOT_PRIORITY.armFar);
      const leg = side === nearLeg ? ROBOT_PRIORITY.legNear : ROBOT_PRIORITY.legFar;
      prioritize(this.legs[side].materials, leg);
      // The shin meets its shoe where the two cross, at one depth: a nudge
      // up puts the collar's line on the shin there.
      prioritize([this.legs[side].upper, this.legs[side].sole], leg + SHOE_OVER_LEG);
    }
    prioritize([this.torso.material as ShaderMaterial], ROBOT_PRIORITY.torso);
    prioritize(this.headMaterials, ROBOT_PRIORITY.head);
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        (o.material as ShaderMaterial).dispose();
        if (o.geometry && !this.geometries.includes(o.geometry)) o.geometry.dispose();
      }
    });
  }
}

function placePoint(mesh: Mesh, p: V3) {
  const [x, y, z] = toThree(p);
  mesh.matrix.makeTranslation(x, y, z);
  mesh.matrixWorldNeedsUpdate = true;
}
