import { Group, Mesh, SphereGeometry, type BufferAttribute, type BufferGeometry, type ShaderMaterial } from 'three';
import { add3, dot3, mixHex, norm3, rad, smoothstep, sub3 } from '../../math';
import type { Expression, RobotLook } from '../look';
import { ARM_RADII, FOREARM, LEG_RADII, SHIN, THIGH, UPPER_ARM, shiftFrame, type Rig } from '../../motion/skeleton';
import { frontDecalGeometry, roundedBoxGeometry, type BoxSpec } from '../../three/geometry';
import { RiderDaylight } from '../../three/daylight';
import { shoeGeometries } from '../shoe3d';
import { dirToThree, toThree } from '../../camera/view';
import { hipsFrame, Limb, placeBetween, placeFrame, placePoint, staticMesh } from '../placement';
import {
  chestMaterial, ChestContact, earMaterial, faceMaterial, gripMaterial, headMaterial, jointMaterial,
  linkMaterial, metalMaterial, SCREEN, shellPaint, shoeUpperMaterial, soleMaterial, VISOR_BEZEL,
} from './robotMaterials';
import { ballGeometry, earGeometry, KNEE_R, linkGeometry, mittGeometry, SHOULDER_R, socketGeometries } from './robotParts';

/** Hard-surface skater on the original robot rig. Every bearing sits at its corresponding motion joint. */

const HEAD: BoxSpec = { f: 14, u: 15, s: 18, r: 8.5 };
/** The grid the screen is painted on: this much of the head's front round the screen and its bezel, this far off the shell. */
const VISOR_GRID = { margin: 0.65, lift: 0.15 } as const;
const TORSO_FRAME_U = 25;
/** How far the chest's foot is raised off its frame's, so the thighs come out from under it. */
const TORSO_BASE_RAISE = 8;
/** Rounded and barely wedge-shaped, so the chest reads as a pebble of shell, not a crate. */
const TORSO: BoxSpec = { f: 11, u: TORSO_FRAME_U - TORSO_BASE_RAISE / 2, s: 15.5, r: 10.5, taper: 0.8 };
/** Bands up the chest's straight sides, for the twist from the hips to the shoulders. */
const TORSO_RINGS = 8;
/** The most the chest twists off the hips (deg): fakie slides turn the shoulders well past square. */
const TWIST_MAX = 135;
/**
 * Limb widths, root → joint → tip: a little inside the rig's clearance
 * (skeleton.ts), so the shoulder's cap and the knee's ball, which fill it,
 * stand just proud of the limb they joint.
 */
const LIMB_SLIM = 0.9;
const NECK_W = 10;
/** Where each antenna stalk leaves the head (forward, side), and where its tip stands (forward, over the top, side), by variant. */
const ANTENNA: Record<0 | 1 | 3, ReadonlyArray<{ foot: readonly [number, number]; tip: readonly [number, number, number]; width: number; ball: number }>> = {
  0: [{ foot: [0, 0], tip: [0, 9, 0], width: 2.2, ball: 3 }],
  1: [{ foot: [-2, 7], tip: [-6, 10, 9], width: 2.2, ball: 2.8 }],
  3: [-1, 1].map((side) => ({ foot: [0, side * 9] as const, tip: [-1, 7.5, side * 11.5] as const, width: 2, ball: 2.4 })),
};

/** What casts the chest's contact tone (robotMaterials.ts): the head, as an ellipsoid of these radii, and the upper arms. */
const HEAD_CONTACT: [number, number, number] = [HEAD.f * 1.05, HEAD.u * 1.05, HEAD.s * 1.05];

const EXPRESSIONS: Record<Expression, number> = { open: 0, focus: 1, happy: 2, wince: 3 };

interface ArmParts {
  upper: Mesh;
  fore: Mesh;
  shoulder: Mesh;
  elbow: Mesh;
  hand: Mesh;
}

interface LegParts {
  thigh: Mesh;
  shin: Mesh;
  hip: Mesh;
  knee: Mesh;
  ankle: Mesh;
  shoe: Group;
}

function part(name: string, geometry: BufferGeometry, material: ShaderMaterial) {
  const mesh = staticMesh(geometry, material);
  mesh.name = name;
  return mesh;
}

export class RealisticRobot3D {
  readonly group = new Group();
  private readonly torso: Mesh;
  /** The torso's untwisted vertices and normals, and the twist (rad) it's drawn with. */
  private readonly torsoRest: { pos: Float32Array; nor: Float32Array };
  private twist = 0;
  private readonly head: Mesh;
  private readonly face: ShaderMaterial;
  private readonly neck: Limb;
  private readonly antenna: Array<{ stalk: Limb; tip: Mesh }> = [];
  private readonly crest?: Mesh;
  private readonly contact = new ChestContact(HEAD_CONTACT, ARM_RADII.shoulder);
  private readonly arms: Record<'left' | 'right', ArmParts>;
  private readonly legs: Record<'left' | 'right', LegParts>;
  private disposed = false;

  constructor(private readonly look: RobotLook, light = new RiderDaylight()) {
    const paint = shellPaint(look.body);
    const graphite = mixHex('#39454b', look.body, 0.09);
    const sole = '#c7bda9';
    this.group.name = 'realistic-robot';

    this.torso = part('chest', roundedBoxGeometry(TORSO, 5, TORSO_RINGS), chestMaterial(paint, this.contact, light));
    const torsoAttr = (name: string) => (this.torso.geometry.getAttribute(name) as BufferAttribute).array as Float32Array;
    this.torsoRest = { pos: torsoAttr('position').slice(), nor: torsoAttr('normal').slice() };
    this.head = part('head', roundedBoxGeometry(HEAD), headMaterial(paint, light));
    this.face = faceMaterial(paint, look.accent, light);
    const around = VISOR_BEZEL + VISOR_GRID.margin;
    this.head.add(part('visor', frontDecalGeometry(
      HEAD, SCREEN.extent[0] + around, SCREEN.center[1] - SCREEN.extent[1] - around, SCREEN.center[1] + SCREEN.extent[1] + around, VISOR_GRID.lift,
    ), this.face));
    const steel = metalMaterial('#606d71', 0.32, 0.78, light);
    this.neck = new Limb(steel);
    this.group.add(this.torso, this.head, this.neck.mesh);

    const feet = look.variant === 2 ? [] : ANTENNA[look.variant];
    const beacon = metalMaterial(look.accent, 0.26, 0.16, light);
    if (look.variant === 2) {
      this.crest = part('crest', roundedBoxGeometry({ f: 8.5, u: 3.2, s: 2, r: 1.8 }), beacon);
      this.group.add(this.crest);
    }
    for (const { ball } of feet) {
      const stalk = new Limb(steel);
      const tip = part('antenna-tip', new SphereGeometry(ball, 20, 14), beacon);
      this.antenna.push({ stalk, tip });
      this.group.add(stalk.mesh, tip);
    }
    for (const g of socketGeometries(HEAD, look.variant, feet.map((a) => a.foot))) this.head.add(part('antenna-socket', g, steel));
    const ear = earMaterial(light);
    for (const side of [-1, 1] as const) this.head.add(part('ear', earGeometry(HEAD, side), ear));

    // Mirrored components come off the same tools and share both geometry and finish.
    const link = (a: number, b: number, length: number) => linkGeometry(a * LIMB_SLIM, b * LIMB_SLIM, length);
    const upper = link(ARM_RADII.shoulder, ARM_RADII.elbow, UPPER_ARM);
    const fore = link(ARM_RADII.elbow, ARM_RADII.wrist, FOREARM);
    const thigh = link(LEG_RADII.hip, LEG_RADII.knee, THIGH);
    const shin = link(LEG_RADII.knee, LEG_RADII.ankle, SHIN);
    const shoulder = ballGeometry(SHOULDER_R);
    const elbow = ballGeometry(ARM_RADII.elbow * LIMB_SLIM);
    // The hip and ankle articulate in every direction on spherical ball ends.
    const hip = new SphereGeometry(LEG_RADII.hip * LIMB_SLIM, 28, 20);
    const knee = ballGeometry(KNEE_R);
    const ankle = new SphereGeometry(LEG_RADII.ankle * LIMB_SLIM, 28, 20);
    const mitt = mittGeometry();
    const tube = linkMaterial(graphite, light);
    const bearing = jointMaterial(graphite, light);
    const ballFinish = metalMaterial(graphite, 0.39, 0.64, light);
    const shoulderCap = jointMaterial(paint, light);
    const grip = gripMaterial(paint, light);
    const arm = (side: string): ArmParts => {
      const parts = {
        shoulder: part(side + '-shoulder', shoulder, shoulderCap), elbow: part(side + '-elbow', elbow, bearing),
        upper: part(side + '-upper-arm', upper, tube), fore: part(side + '-forearm', fore, tube),
        hand: part(side + '-hand', mitt, grip),
      };
      this.group.add(...Object.values(parts));
      return parts;
    };
    const shoeShape = shoeGeometries();
    const rubber = soleMaterial(sole, light);
    const suede = shoeUpperMaterial(look.accent, sole, shoeShape.toeCap, light);
    const leg = (side: string): LegParts => {
      const shoe = new Group();
      shoe.name = side + '-shoe';
      shoe.matrixAutoUpdate = false;
      shoe.add(part(side + '-sole', shoeShape.sole, rubber), part(side + '-upper', shoeShape.upper, suede));
      const parts = {
        hip: part(side + '-hip', hip, ballFinish), thigh: part(side + '-thigh', thigh, tube),
        knee: part(side + '-knee', knee, bearing), shin: part(side + '-shin', shin, tube),
        ankle: part(side + '-ankle', ankle, ballFinish), shoe,
      };
      this.group.add(...Object.values(parts));
      return parts;
    };
    this.arms = { left: arm('left'), right: arm('right') };
    this.legs = { left: leg('left'), right: leg('right') };
  }

  update(rig: Rig, expression: Expression) {
    const hips = hipsFrame(rig);
    placeFrame(this.torso, shiftFrame(rig.torso, 0, TORSO_BASE_RAISE / 2, 0));
    this.twistTorso(rig, hips);
    placeFrame(this.head, rig.head);
    this.contact.aimHead(toThree(rig.head.origin), dirToThree(rig.head.fwd), dirToThree(rig.head.up), dirToThree(rig.head.side));
    this.neck.set(rig.torso.at(0, TORSO_FRAME_U - 4, 0), rig.head.at(-1, -HEAD.u + 1, 0), NECK_W);

    const top = HEAD.u;
    if (this.crest) placeFrame(this.crest, shiftFrame(rig.head, -1, top + 1.2, 0));
    for (const [i, part] of this.antenna.entries()) {
      const { foot, tip, width } = ANTENNA[this.look.variant as 0 | 1 | 3][i];
      const end = rig.head.at(tip[0], top + tip[1], tip[2]);
      part.stalk.set(rig.head.at(foot[0], top - 1, foot[1]), end, width);
      placePoint(part.tip, end);
    }

    this.face.uniforms.uExpression.value = EXPRESSIONS[expression];

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      placeBetween(parts.upper, arm.shoulder, arm.elbow);
      placeBetween(parts.fore, arm.elbow, arm.hand);
      placeFrame(parts.shoulder, { ...rig.torso, origin: arm.shoulder });
      placeFrame(parts.elbow, { ...rig.torso, origin: arm.elbow });
      this.contact.aimArm(arm.side === 'left' ? 0 : 1, toThree(arm.shoulder), toThree(arm.elbow));
      // The glove carries straight on down the forearm.
      placeBetween(parts.hand, arm.hand, add3(arm.hand, norm3(sub3(arm.hand, arm.elbow))));
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      placeBetween(parts.thigh, leg.hip, leg.knee);
      placeBetween(parts.shin, leg.knee, leg.ankle);
      placePoint(parts.hip, leg.hip);
      placeFrame(parts.knee, { ...hips, origin: leg.knee });
      placePoint(parts.ankle, leg.ankle);
      placeFrame(parts.shoe, leg.shoe);
    }
  }

  /**
   * The chest is posed on the shoulders' turn, the legs on the hips'. Riding
   * fakie the shoulders turn round toward the tail while the hips stay put,
   * and a rigid chest turned with them would set the hip joints at its front
   * and back, a thigh coming out of its belly. So its bottom turns back to
   * square over the hips, twisting up its straight sides to the shoulders.
   */
  private twistTorso(rig: Rig, pelvis: Rig['torso']) {
    const hips = pelvis.side;
    const twist = Math.max(-rad(TWIST_MAX), Math.min(rad(TWIST_MAX),
      Math.atan2(dot3(hips, rig.torso.fwd), dot3(hips, rig.torso.side))));
    if (twist === this.twist) return;
    this.twist = twist;
    const { pos: restPos, nor: restNor } = this.torsoRest;
    const geometry = this.torso.geometry;
    const posAttr = geometry.getAttribute('position') as BufferAttribute;
    const norAttr = geometry.getAttribute('normal') as BufferAttribute;
    const pos = posAttr.array as Float32Array;
    const nor = norAttr.array as Float32Array;
    const straight = TORSO.u - TORSO.r;
    for (let i = 0; i < pos.length; i += 3) {
      const y = restPos[i + 1];
      // All the hips' turn below the straight sides, none above them.
      const a = twist * (1 - smoothstep((y + straight) / (2 * straight)));
      const c = Math.cos(a);
      const s = Math.sin(a);
      // Positions, then normals, written out longhand: this runs for every vertex of the chest each
      // frame, and looped over the pair the browser kept throwing its fast code for it away.
      const x = restPos[i];
      const z = restPos[i + 2];
      pos[i] = x * c + z * s;
      pos[i + 1] = restPos[i + 1];
      pos[i + 2] = z * c - x * s;
      const nx = restNor[i];
      const nz = restNor[i + 2];
      nor[i] = nx * c + nz * s;
      nor[i + 1] = restNor[i + 1];
      nor[i + 2] = nz * c - nx * s;
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<ShaderMaterial>();
    this.group.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      geometries.add(o.geometry);
      materials.add(o.material as ShaderMaterial);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }
}
