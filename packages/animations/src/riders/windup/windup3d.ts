import { Group, Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import type { BoardLook } from '../../board/board';
import { dirToThree, toThree, type StageView } from '../../camera/view';
import { add3, clamp01, dot3, norm3, scale3, sub3, type V3 } from '../../math';
import { RIDE_HEIGHT, SQUAT_FLOOR, shiftFrame, type Frame3, type Rig } from '../../motion/skeleton';
import type { StageFrame } from '../../stage/stage';
import { inkInfo, INK_ROBOT, toonMaterial } from '../../three/materials';
import type { Expression } from '../look';
import { crossThree, hipsFrame, Limb, placeBetween, placeFrame, placePoint, setMatrix, staticMesh } from '../placement';
import { shoeGeometries } from '../shoe3d';
import { bellowsMaterial, DIAL, drumMaterial, eyeMaterial, IRIS, shellMaterial } from './windupMaterials';
import {
  ballGeometry, bellowsGeometry, drumGeometry, earGeometry, eyeGeometry, headGeometry, keyGeometries, keySocketGeometry,
  LENS, pelvisGeometry, pincerGeometries,
} from './windupParts';

/**
 * Wind-Up: a tin toy robot off a shelf of the 1950s, on the robot's rig.
 * A ball of a head with one big lens for a face and a wind-up key turning
 * on top; a drum of a chest with a pressure dial printed on it; accordion
 * sleeves for arms and thighs, brass balls at the shoulders and knees,
 * pincers for hands. Pressed tin in three paints (tomato, teal, cream) with
 * brass fittings, where the robot is one shell color and graphite.
 *
 * It moves the way the robot does (same rig, same sizes), and adds three
 * movements of its own, each read off the frame it's handed and nothing
 * else, so a scrubbed clip shows the same picture as a played one: the
 * lens's iris looks where the rider looks; the dial's needle climbs as the
 * legs load; and the key turns steadily with the clock, winding back as the
 * rider crouches and letting go as they pop.
 */

/** Its paints. It wears its own, whatever the robot's look is. */
const PAINT = {
  shell: '#e5563c',
  trim: '#2bb0a2',
  cream: '#f8ecd4',
  brass: '#f1b243',
  sleeve: '#d3cfe3',
  fold: '#918cb0',
  glow: '#ffd45c',
} as const;

/** The board it rides: teal under, a cream stripe. */
export const WINDUP_BOARD: BoardLook = { graphic: PAINT.trim, stripe: PAINT.cream };

/** A sleeve: its folds, its radius at either end (the folds' middle), and a fold's depth from crest to valley. */
interface Sleeve { pleats: number; ra: number; rb: number; depth: number }
/**
 * Sized inside the rig's limbs (skeleton.ts's LEG_RADII and ARM_RADII), the
 * crests about where the robot's limbs are, so the motion that keeps those
 * out of the board and of each other keeps these out too.
 */
const THIGH: Sleeve = { pleats: 6, ra: 5.7, rb: 4.5, depth: 1.5 };
const UPPER_ARM: Sleeve = { pleats: 3, ra: 4, rb: 3.8, depth: 1.1 };
const FOREARM: Sleeve = { pleats: 3, ra: 3.8, rb: 3.6, depth: 1.1 };
const NECK: Sleeve = { pleats: 2, ra: 5.4, rb: 5, depth: 1.4 };
const KNEE_R = 5.6;
const SHOULDER_R = 4.8;
/** The ball inside the elbow's bend: a little over the sleeves' ends, to close them. */
const ELBOW_R = 3.6;
/** The shin's widths, knee to ankle, and how far below the knee's middle it starts: well inside the ball, so the two never share a surface. */
const SHIN_W = [9.4, 8.8] as const;
const SHIN_FROM = 2.6;
/** Where the neck leaves the chest (torso-local height), and how far under the head's middle it goes in. */
const NECK_FROM = 23;
const NECK_INTO = 12;
/** How far the pelvis's middle sits over the hip joints. */
const PELVIS_RAISE = 1.5;
/** The hand sits this far back up the forearm from the rig's (a mitt's middle), so the pincer reaches no further than the mitt did; the sleeve ends this far inside its cuff. */
const HAND_BACK = 1;
const CUFF_IN = 2.2;

/** The key's steady turn (rad/s), and how far it winds back (rad) over a full crouch. */
const KEY_TURN = 2.2;
const KEY_WIND = 4.2;

/** Outline widths (world units): the big parts', the head's, and the fittings'. */
const INK = 1.15;
const HEAD_INK = INK * 1.1;
const FITTING_INK = 1;

/**
 * Part ids for the outline pass: each is one silhouette. The robot's eight
 * (robot3d.ts), then its own fittings, clear of the board's, the bar's and
 * the scenery's.
 */
const ID = {
  leftArm: 1, rightArm: 2, leftLeg: 3, rightLeg: 4, torso: 5, head: 6, leftShoe: 7, rightShoe: 8, pelvis: 9,
  eye: 240, ears: 241, key: 242, leftKnee: 243, rightKnee: 244, leftShoulder: 245, rightShoulder: 246, leftHand: 247, rightHand: 248,
} as const;
/** Paint order (back to front) for parts touching: the robot's, with the fittings just over what they're fitted to. */
const PRIORITY = { armFar: 40, legFar: 50, legNear: 55, pelvis: 58, torso: 60, head: 70, ears: 72, key: 73, eye: 74, armNear: 80 } as const;
const KNEE_OVER_LEG = 1;
const SHOE_OVER_LEG = 2;
const SHOULDER_OVER_ARM = 1;
const HAND_OVER_ARM = 2;

const MOODS: Record<Expression, number> = { open: 0, focus: 1, happy: 2, wince: 3 };

interface ArmParts {
  /** The sleeve: upper arm, the ball in the elbow, forearm. */
  sleeve: ShaderMaterial[];
  upper: Mesh;
  elbow: Mesh;
  fore: Mesh;
  shoulder: Mesh;
  hand: Group;
  handMaterial: ShaderMaterial;
}

interface LegParts {
  /** The thigh's sleeve and the shin. */
  limb: ShaderMaterial[];
  thigh: Mesh;
  knee: Mesh;
  shin: Limb;
  shoe: Group;
  shoeMaterials: ShaderMaterial[];
}

const avg = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const material = (mesh: Mesh) => mesh.material as ShaderMaterial;

export class WindUp3D {
  readonly group = new Group();
  private readonly drum: Mesh;
  private readonly pelvis: Mesh;
  private readonly head: Mesh;
  private readonly neck: Mesh;
  private readonly eye: Mesh;
  private readonly key = new Group();
  private readonly ears: ShaderMaterial[];
  private readonly keyMaterial: ShaderMaterial;
  private readonly arms: Record<'left' | 'right', ArmParts>;
  private readonly legs: Record<'left' | 'right', LegParts>;
  private readonly geometries: BufferGeometry[] = [];

  constructor() {
    const geometry = <T extends BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };
    const sleeve = (s: Sleeve) => geometry(bellowsGeometry(s.pleats, s.ra, s.rb, s.depth));
    const sleeveMaterial = (s: Sleeve) => bellowsMaterial(PAINT.sleeve, PAINT.fold, s.pleats);

    this.drum = staticMesh(geometry(drumGeometry()), drumMaterial(PAINT.shell, PAINT.trim, PAINT.cream));
    this.pelvis = staticMesh(geometry(pelvisGeometry()), toonMaterial(PAINT.fold));

    // The head, and what's fitted to it: all of it rides the head's matrix.
    this.head = staticMesh(geometry(headGeometry()), shellMaterial(PAINT.shell));
    this.eye = staticMesh(geometry(eyeGeometry()), eyeMaterial(PAINT.brass, PAINT.glow));
    const ears = ([1, -1] as const).map((side) => staticMesh(geometry(earGeometry(side)), toonMaterial(PAINT.trim)));
    this.ears = ears.map(material);
    this.keyMaterial = toonMaterial(PAINT.brass);
    const socket = staticMesh(geometry(keySocketGeometry()), this.keyMaterial);
    this.key.matrixAutoUpdate = false;
    for (const g of keyGeometries()) this.key.add(staticMesh(geometry(g), this.keyMaterial));
    this.head.add(this.eye, ...ears, socket, this.key);
    this.neck = staticMesh(sleeve(NECK), sleeveMaterial(NECK));

    const shoulderGeometry = geometry(ballGeometry(SHOULDER_R));
    const elbowGeometry = geometry(ballGeometry(ELBOW_R));
    const upperGeometry = sleeve(UPPER_ARM);
    const foreGeometry = sleeve(FOREARM);
    const pincer = pincerGeometries().map(geometry);
    const arm = (): ArmParts => {
      const upper = staticMesh(upperGeometry, sleeveMaterial(UPPER_ARM));
      const fore = staticMesh(foreGeometry, sleeveMaterial(FOREARM));
      const elbow = staticMesh(elbowGeometry, toonMaterial(PAINT.fold));
      const shoulder = staticMesh(shoulderGeometry, toonMaterial(PAINT.brass));
      const handMaterial = toonMaterial(PAINT.trim);
      const hand = new Group();
      hand.matrixAutoUpdate = false;
      for (const g of pincer) hand.add(staticMesh(g, handMaterial));
      return { sleeve: [material(upper), material(elbow), material(fore)], upper, elbow, fore, shoulder, hand, handMaterial };
    };

    const kneeGeometry = geometry(ballGeometry(KNEE_R));
    const thighGeometry = sleeve(THIGH);
    const shoeShape = shoeGeometries();
    geometry(shoeShape.sole);
    geometry(shoeShape.upper);
    const leg = (): LegParts => {
      const thigh = staticMesh(thighGeometry, sleeveMaterial(THIGH));
      const knee = staticMesh(kneeGeometry, toonMaterial(PAINT.brass));
      const shin = new Limb(toonMaterial(PAINT.shell));
      const sole = staticMesh(shoeShape.sole, toonMaterial(PAINT.cream));
      const upper = staticMesh(shoeShape.upper, toonMaterial(PAINT.trim, { hex: PAINT.cream, ...shoeShape.toeCap }));
      const shoe = new Group();
      shoe.matrixAutoUpdate = false;
      shoe.add(sole, upper);
      return { limb: [material(thigh), shin.material], thigh, knee, shin, shoe, shoeMaterials: [material(upper), material(sole)] };
    };
    this.arms = { left: arm(), right: arm() };
    this.legs = { left: leg(), right: leg() };

    this.group.add(this.drum, this.pelvis, this.head, this.neck);
    for (const a of Object.values(this.arms)) this.group.add(a.upper, a.elbow, a.fore, a.shoulder, a.hand);
    for (const l of Object.values(this.legs)) this.group.add(l.thigh, l.knee, l.shin.mesh, l.shoe);

    const ink = (materials: ShaderMaterial[], id: number, width = INK) => {
      for (const m of materials) inkInfo(id, 0, width, INK_ROBOT, m.uniforms.uInfo.value);
    };
    ink([material(this.drum)], ID.torso);
    ink([material(this.pelvis)], ID.pelvis);
    // The neck is the head's: no line where it goes up into it.
    ink([material(this.head), material(this.neck)], ID.head, HEAD_INK);
    ink([material(this.eye)], ID.eye, FITTING_INK);
    ink(this.ears, ID.ears, FITTING_INK);
    ink([this.keyMaterial], ID.key, FITTING_INK);
    for (const side of ['left', 'right'] as const) {
      const a = this.arms[side];
      ink(a.sleeve, ID[`${side}Arm`]);
      ink([material(a.shoulder)], ID[`${side}Shoulder`], FITTING_INK);
      ink([a.handMaterial], ID[`${side}Hand`], FITTING_INK);
      const l = this.legs[side];
      ink(l.limb, ID[`${side}Leg`]);
      ink([material(l.knee)], ID[`${side}Knee`]);
      ink(l.shoeMaterials, ID[`${side}Shoe`]);
    }
  }

  update(rig: Rig, expression: Expression, view: StageView, frame?: StageFrame) {
    const { cam } = view;
    placeFrame(this.drum, rig.torso);
    placeFrame(this.pelvis, shiftFrame(hipsFrame(rig), 0, PELVIS_RAISE, 0));
    placeFrame(this.head, rig.head);
    placeBetween(this.neck, rig.torso.at(0, NECK_FROM, 0), rig.head.at(-1, -NECK_INTO, 0));

    // How far the legs are loaded, standing to a full squat.
    const crouch = clamp01((RIDE_HEIGHT - rig.hipOverDeck) / (RIDE_HEIGHT - SQUAT_FLOOR));
    material(this.drum).uniforms.uNeedle.value = DIAL.swing * (2 * crouch - 1);
    this.key.matrix.makeRotationY((frame?.t ?? 0) * KEY_TURN - crouch * KEY_WIND);
    this.key.matrixWorldNeedsUpdate = true;

    const eye = material(this.eye);
    eye.uniforms.uMood.value = MOODS[expression];
    this.lookAt(rig.head, frame?.gaze);

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      const along = norm3(sub3(arm.hand, arm.elbow));
      const wrist = sub3(arm.hand, scale3(along, HAND_BACK));
      placePoint(parts.shoulder, arm.shoulder);
      placeBetween(parts.upper, arm.shoulder, arm.elbow);
      placePoint(parts.elbow, arm.elbow);
      placeBetween(parts.fore, arm.elbow, sub3(wrist, scale3(along, CUFF_IN)));
      this.placeHand(parts.hand, wrist, along, rig.torso);
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      placeBetween(parts.thigh, leg.hip, leg.knee);
      placePoint(parts.knee, leg.knee);
      parts.shin.set(add3(leg.knee, scale3(norm3(sub3(leg.ankle, leg.knee)), SHIN_FROM)), leg.ankle, SHIN_W[0], SHIN_W[1]);
      placeFrame(parts.shoe, leg.shoe);
    }

    // Who paints over whom where parts touch: PRIORITY, near and far by depth.
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
      const arm = side === nearArm ? PRIORITY.armNear : PRIORITY.armFar;
      prioritize(a.sleeve, arm);
      prioritize([material(a.shoulder)], arm + SHOULDER_OVER_ARM);
      prioritize([a.handMaterial], arm + HAND_OVER_ARM);
      const l = this.legs[side];
      const leg = side === nearLeg ? PRIORITY.legNear : PRIORITY.legFar;
      prioritize(l.limb, leg);
      prioritize([material(l.knee)], leg + KNEE_OVER_LEG);
      prioritize(l.shoeMaterials, leg + SHOE_OVER_LEG);
    }
    prioritize([material(this.pelvis)], PRIORITY.pelvis);
    prioritize([material(this.drum)], PRIORITY.torso);
    prioritize([material(this.head), material(this.neck)], PRIORITY.head);
    prioritize(this.ears, PRIORITY.ears);
    prioritize([this.keyMaterial], PRIORITY.key);
    prioritize([eye], PRIORITY.eye);
  }

  /** Turns the iris toward `gaze` (rig coordinates), as far as it goes behind the glass; straight ahead with nothing to look at. */
  private lookAt(head: Frame3, gaze: V3 | undefined) {
    const look = material(this.eye).uniforms.uLook.value;
    if (!gaze) {
      look.set(0, 0);
      return;
    }
    const to = norm3(sub3(gaze, head.at(LENS.at, 0, 0)));
    // The tangent of the angle off the head's forward, either way; anything behind the head counts as far to the side.
    const ahead = Math.max(dot3(to, head.fwd), 0.25);
    const side = dot3(to, head.side) / ahead;
    const up = dot3(to, head.up) / ahead;
    const off = Math.hypot(side, up);
    const reach = off > 1e-6 ? (IRIS.reach * (1 - Math.exp(-1.4 * off))) / off : 0;
    look.set(side * reach, up * reach);
  }

  /**
   * A hand at `wrist`, pointing on `along` the forearm. The pincer is flat,
   * and a flat thing edge-on is a stick: it lies in the plane of the chest
   * (across the torso's forward), which is the plane the camera mostly sees
   * the rider in, tipping toward the torso's up as the forearm comes to
   * point straight out of the chest.
   */
  private placeHand(hand: Group, wrist: V3, along: V3, torso: Frame3) {
    const across = (v: V3) => sub3(v, scale3(along, dot3(v, along)));
    const flat = norm3(add3(across(torso.fwd), scale3(across(torso.up), 0.3)));
    const x = dirToThree(along);
    const z = dirToThree(flat);
    setMatrix(hand, toThree(wrist), x, crossThree(z, x), z);
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
