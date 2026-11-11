import { Group, Mesh, SphereGeometry, type BufferAttribute, type BufferGeometry, type ShaderMaterial } from 'three';
import { PALETTE } from '../../camera/camera';
import { add3, dot3, mixHex, norm3, rad, smoothstep, sub3, type V3 } from '../../math';
import type { Expression, RobotLook } from '../look';
import { ARM_RADII, LEG_RADII, shiftFrame, type Rig } from '../../motion/skeleton';
import { frontDecalGeometry, roundedBoxGeometry, type BoxSpec } from '../../three/geometry';
import { inkInfo, INK_ROBOT, toonMaterial } from '../../three/materials';
import { shoeGeometries } from '../shoe3d';
import { dirToThree, toThree, type StageView } from '../../camera/view';
import { hipsFrame, Limb, placeBetween, placeFrame, placePoint, staticMesh } from '../placement';
import { chestMaterial, ChestContact, faceMaterial, headMaterial, SCREEN, shoeUpperMaterial, VISOR_BEZEL } from './robotMaterials';
import { ballGeometry, earGeometry, KNEE_R, mittGeometry, SHOULDER_R, socketGeometries } from './robotParts';

/**
 * The robot skater: a chunky moulded toy. A box head with a visor screen
 * set into it (its face shows the rider's expression), button ears and an
 * antenna in its socket (the robot's variant); a softly tapered chest of
 * shell the thighs come straight out of; sturdy graphite limbs seated in
 * shell shoulder caps and jointed at the knee; shell gloves with a rolled
 * cuff; and sculpted accent skate shoes on cream cupsoles
 * (shoe3d.ts). Every part is matte, two cel tones and no highlight: a glint
 * read as shiny. Its shapes are robotParts.ts's, its paint
 * robotMaterials.ts's, and its poses come straight from the rig.
 */

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
const ARM_W = [ARM_RADII.shoulder, ARM_RADII.elbow, ARM_RADII.wrist].map((r) => 2 * r * LIMB_SLIM);
const LEG_W = [LEG_RADII.hip, LEG_RADII.knee, LEG_RADII.ankle].map((r) => 2 * r * LIMB_SLIM);
const NECK_W = 10;
/** Where each antenna stalk leaves the head (forward, side), and where its tip stands (forward, over the top, side), by variant. */
const ANTENNA: Record<0 | 1 | 3, ReadonlyArray<{ foot: readonly [number, number]; tip: readonly [number, number, number]; width: number; ball: number }>> = {
  0: [{ foot: [0, 0], tip: [0, 9, 0], width: 2.2, ball: 3 }],
  1: [{ foot: [-2, 7], tip: [-6, 10, 9], width: 2.2, ball: 2.8 }],
  3: [-1, 1].map((side) => ({ foot: [0, side * 9] as const, tip: [-1, 7.5, side * 11.5] as const, width: 2, ball: 2.4 })),
};

/** Outline widths (world units): every part's, the head's slightly heavier one, and the lighter one a small fitting carries. */
const INK = 1.15;
const HEAD_INK = INK * 1.1;
const FITTING_INK = INK * 0.72;
/** What casts the chest's contact tone (robotMaterials.ts): the head, as an ellipsoid of these radii, and the upper arms. */
const HEAD_CONTACT: [number, number, number] = [HEAD.f * 1.05, HEAD.u * 1.05, HEAD.s * 1.05];

/**
 * Part ids for the outline pass: each is one silhouette. The fittings are
 * numbered clear of the board's, the bar's and the scenery's (as Wind-Up's
 * are, windup3d.ts).
 */
const ID = {
  leftArm: 1, rightArm: 2, leftLeg: 3, rightLeg: 4, torso: 5, head: 6, leftShoe: 7, rightShoe: 8,
  fittings: 241, leftKnee: 243, rightKnee: 244, leftShoulder: 245, rightShoulder: 246, leftHand: 247, rightHand: 248,
} as const;
/** Paint order (back to front) for parts touching, the fittings just over what they're fitted to. */
export const ROBOT_PRIORITY = { armFar: 40, legFar: 50, legNear: 55, torso: 60, head: 70, fittings: 72, armNear: 80 } as const;
const KNEE_OVER_LEG = 1;
const SHOE_OVER_LEG = 2;
const SHOULDER_OVER_ARM = 1;
const HAND_OVER_ARM = 2;

const EXPRESSIONS: Record<Expression, number> = { open: 0, focus: 1, happy: 2, wince: 3 };

interface ArmParts {
  upper: Limb;
  fore: Limb;
  shoulder: Mesh;
  hand: Mesh;
}

interface LegParts {
  thigh: Limb;
  shin: Limb;
  knee: Mesh;
  shoe: Group;
  shoeMaterials: ShaderMaterial[];
}

const avg = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const material = (mesh: Mesh) => mesh.material as ShaderMaterial;

export class Robot3D {
  readonly group = new Group();
  private readonly torso: Mesh;
  /** The torso's untwisted vertices and normals, and the twist (rad) it's drawn with. */
  private readonly torsoRest: { pos: Float32Array; nor: Float32Array };
  private twist = 0;
  private readonly head: Mesh;
  private readonly face: ShaderMaterial;
  /** The ears and the antenna's sockets: graphite let into the head. */
  private readonly fittings: ShaderMaterial[] = [];
  private readonly neck: Limb;
  private readonly antenna: Array<{ stalk: Limb; tip: Mesh }> = [];
  private readonly crest?: Mesh;
  /** Everything in the head's silhouette: the shell, the screen, the neck, the antenna or crest. */
  private readonly headMaterials: ShaderMaterial[] = [];
  private readonly contact = new ChestContact(HEAD_CONTACT, ARM_RADII.shoulder);
  private readonly arms: Record<'left' | 'right', ArmParts>;
  private readonly legs: Record<'left' | 'right', LegParts>;
  private readonly geometries: BufferGeometry[] = [];

  constructor(private readonly look: RobotLook) {
    const limbHex = mixHex(PALETTE.limb, look.body, 0.16);
    const geometry = <T extends BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };

    this.torso = staticMesh(geometry(roundedBoxGeometry(TORSO, 5, TORSO_RINGS)), chestMaterial(look.body, this.contact));
    const torsoAttr = (name: string) => (this.torso.geometry.getAttribute(name) as BufferAttribute).array as Float32Array;
    this.torsoRest = { pos: torsoAttr('position').slice(), nor: torsoAttr('normal').slice() };
    this.head = staticMesh(geometry(roundedBoxGeometry(HEAD)), headMaterial(look.body));
    this.face = faceMaterial(look.body, look.accent);
    const around = VISOR_BEZEL + VISOR_GRID.margin;
    this.head.add(staticMesh(geometry(frontDecalGeometry(
      HEAD, SCREEN.extent[0] + around, SCREEN.center[1] - SCREEN.extent[1] - around, SCREEN.center[1] + SCREEN.extent[1] + around, VISOR_GRID.lift,
    )), this.face));
    this.neck = new Limb(toonMaterial(limbHex));
    this.headMaterials.push(material(this.head), this.face, this.neck.material);

    // The per-robot antenna, or the crest instead of one, each let into the head.
    const feet = look.variant === 2 ? [] : ANTENNA[look.variant];
    const antenna: ShaderMaterial[] = [];
    if (look.variant === 2) {
      this.crest = staticMesh(geometry(roundedBoxGeometry({ f: 8.5, u: 3.2, s: 2, r: 1.8 })), toonMaterial(look.accent));
      antenna.push(material(this.crest));
    }
    for (const { ball } of feet) {
      const stalk = new Limb(toonMaterial(PALETTE.limb));
      const tip = staticMesh(geometry(new SphereGeometry(ball, 20, 14)), toonMaterial(look.accent));
      antenna.push(stalk.material, material(tip));
      this.antenna.push({ stalk, tip });
    }
    this.headMaterials.push(...antenna);
    const sockets = socketGeometries(HEAD, look.variant, feet.map((a) => a.foot));
    for (const g of [earGeometry(HEAD, -1), earGeometry(HEAD, 1), ...sockets]) {
      const fitting = staticMesh(geometry(g), toonMaterial(limbHex));
      this.head.add(fitting);
      this.fittings.push(material(fitting));
    }

    const mitt = geometry(mittGeometry());
    const shoulderBall = geometry(ballGeometry(SHOULDER_R));
    const kneeBall = geometry(ballGeometry(KNEE_R));
    const arm = (): ArmParts => ({
      upper: new Limb(toonMaterial(limbHex)),
      fore: new Limb(toonMaterial(limbHex)),
      shoulder: staticMesh(shoulderBall, toonMaterial(look.body)),
      hand: staticMesh(mitt, toonMaterial(look.body)),
    });
    const shoeShape = shoeGeometries();
    geometry(shoeShape.sole);
    geometry(shoeShape.upper);
    const leg = (): LegParts => {
      const sole = staticMesh(shoeShape.sole, toonMaterial(PALETTE.wheel));
      const upper = staticMesh(shoeShape.upper, shoeUpperMaterial(look.accent, { hex: PALETTE.wheel, ...shoeShape.toeCap }));
      const shoe = new Group();
      shoe.matrixAutoUpdate = false;
      shoe.add(sole, upper);
      return {
        thigh: new Limb(toonMaterial(limbHex)),
        shin: new Limb(toonMaterial(limbHex)),
        knee: staticMesh(kneeBall, toonMaterial(limbHex)),
        shoe,
        shoeMaterials: [material(upper), material(sole)],
      };
    };
    this.arms = { left: arm(), right: arm() };
    this.legs = { left: leg(), right: leg() };

    this.group.add(this.torso, this.head, this.neck.mesh);
    if (this.crest) this.group.add(this.crest);
    for (const part of this.antenna) this.group.add(part.stalk.mesh, part.tip);
    for (const a of Object.values(this.arms)) this.group.add(a.upper.mesh, a.fore.mesh, a.shoulder, a.hand);
    for (const l of Object.values(this.legs)) this.group.add(l.thigh.mesh, l.shin.mesh, l.knee, l.shoe);

    const ink = (materials: ShaderMaterial[], id: number, width = INK) => {
      for (const m of materials) inkInfo(id, 0, width, INK_ROBOT, m.uniforms.uInfo.value);
    };
    ink([material(this.torso)], ID.torso);
    ink([this.neck.material], ID.head);
    ink([material(this.head), this.face], ID.head, HEAD_INK);
    ink(antenna, ID.head, FITTING_INK);
    ink(this.fittings, ID.fittings, FITTING_INK);
    for (const side of ['left', 'right'] as const) {
      const a = this.arms[side];
      ink([a.upper.material, a.fore.material], ID[`${side}Arm`]);
      ink([material(a.shoulder)], ID[`${side}Shoulder`], FITTING_INK);
      ink([material(a.hand)], ID[`${side}Hand`]);
      const l = this.legs[side];
      ink([l.thigh.material, l.shin.material], ID[`${side}Leg`]);
      ink([material(l.knee)], ID[`${side}Knee`], FITTING_INK);
      // A shoe outlines itself against its own leg: the shin drops into the collar.
      ink(l.shoeMaterials, ID[`${side}Shoe`]);
    }
  }

  update(rig: Rig, expression: Expression, view: StageView) {
    const { cam } = view;
    placeFrame(this.torso, shiftFrame(rig.torso, 0, TORSO_BASE_RAISE / 2, 0));
    this.twistTorso(rig);
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

    // The screen fades out gradually as it turns edge-on.
    const facePoint = rig.head.at(HEAD.f, 0, 0);
    const facing = dot3(norm3(sub3(cam.eye, facePoint)), norm3(rig.head.fwd));
    this.face.uniforms.uFade.value = smoothstep((facing - 0.02) / 0.24);
    this.face.uniforms.uExpression.value = EXPRESSIONS[expression];

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      parts.upper.set(arm.shoulder, arm.elbow, ARM_W[0], ARM_W[1]);
      parts.fore.set(arm.elbow, arm.hand, ARM_W[1], ARM_W[2]);
      placePoint(parts.shoulder, arm.shoulder);
      this.contact.aimArm(arm.side === 'left' ? 0 : 1, toThree(arm.shoulder), toThree(arm.elbow));
      // The glove carries straight on down the forearm.
      placeBetween(parts.hand, arm.hand, add3(arm.hand, norm3(sub3(arm.hand, arm.elbow))));
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      parts.thigh.set(leg.hip, leg.knee, LEG_W[0], LEG_W[1]);
      parts.shin.set(leg.knee, leg.ankle, LEG_W[1], LEG_W[2]);
      placePoint(parts.knee, leg.knee);
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
      const a = this.arms[side];
      const arm = side === nearArm ? ROBOT_PRIORITY.armNear : ROBOT_PRIORITY.armFar;
      prioritize([a.upper.material, a.fore.material], arm);
      prioritize([material(a.shoulder)], arm + SHOULDER_OVER_ARM);
      prioritize([material(a.hand)], arm + HAND_OVER_ARM);
      const l = this.legs[side];
      const leg = side === nearLeg ? ROBOT_PRIORITY.legNear : ROBOT_PRIORITY.legFar;
      prioritize([l.thigh.material, l.shin.material], leg);
      prioritize([material(l.knee)], leg + KNEE_OVER_LEG);
      // The shin meets its shoe where the two cross, at one depth: a nudge
      // up puts the collar's line on the shin there.
      prioritize(l.shoeMaterials, leg + SHOE_OVER_LEG);
    }
    prioritize([material(this.torso)], ROBOT_PRIORITY.torso);
    prioritize(this.headMaterials, ROBOT_PRIORITY.head);
    prioritize(this.fittings, ROBOT_PRIORITY.fittings);
  }

  /**
   * The chest is posed on the shoulders' turn, the legs on the hips'. Riding
   * fakie the shoulders turn round toward the tail while the hips stay put,
   * and a rigid chest turned with them would set the hip joints at its front
   * and back, a thigh coming out of its belly. So its bottom turns back to
   * square over the hips, twisting up its straight sides to the shoulders.
   */
  private twistTorso(rig: Rig) {
    const hips = hipsFrame(rig).side;
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
      for (const [rest, out] of [[restPos, pos], [restNor, nor]] as const) {
        const x = rest[i];
        const z = rest[i + 2];
        out[i] = x * c + z * s;
        out[i + 1] = rest[i + 1];
        out[i + 2] = z * c - x * s;
      }
    }
    posAttr.needsUpdate = true;
    norAttr.needsUpdate = true;
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
