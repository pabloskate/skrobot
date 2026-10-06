import { Matrix4, Quaternion, Vector3 } from 'three';
import { SHOE_HALF_HEIGHT, type Rig } from '../../motion/skeleton';
import { dirToThree, toThree } from '../../camera/view';
import { smoothstep } from '../../math';
import type { Expression } from '../look';

/**
 * The realistic skater's skeleton posed from the trick rig.
 *
 * The rig is a handful of joints (hips, knees, ankles, shoulders, elbows,
 * hands) and three frames (torso, head, shoes). The skater is a full human
 * skeleton (MakeHuman's default rig: five vertebrae, three neck bones, twist
 * bones down each limb, fifteen finger bones a hand). Each bone gets a world
 * rotation away from its rest pose (its delta), and its head is carried by
 * its parent, so bones never stretch:
 *
 *  - the pelvis sits between the rig's hips, turned with them and tipped
 *    only part of the way the torso leans, so a lean bends the back
 *    instead of tilting a plank;
 *  - the vertebrae share out the turn and lean from pelvis to chest, the
 *    neck bones from chest to head;
 *  - each foot is laid on the rig's shoe frame with its sole exactly where
 *    the rig's sole is, and the leg reaches it with two-bone IK; the knee
 *    points the way the hips face (a tuck brings both knees up in front of
 *    the chest, not out along the board), and never quite locks;
 *  - the arms take the rig's arm angles (out, swing, elbow) but are worn as
 *    a person's, not the robot's: hanging close to the body while riding,
 *    out to the side only as far as balance asks, elbows always soft, each
 *    arm drifting a little on its own; the collarbones lift as an arm rises;
 *    in playback a hand trails its shoulder a beat and settles; the
 *    wrist hangs relaxed off the forearm, the palm toward the body or the
 *    ground, the forearm's twist bones taking their share of that turn; the
 *    fingers rest in a loose curl, opening as an arm goes out for balance;
 *  - the eyes glance toward the board, the lids following them down and
 *    narrowing or shutting with the rider's expression;
 *  - a body thrown down lies on top of the ground, not in it.
 *
 * The rig is the trick; this is how a person wears it. Positions are in
 * three's world (y up), in the rig's units (about a centimetre).
 */

export interface RestBone {
  name: string;
  parent: number;
  /** Head of the bone in the rest pose, world. */
  head: Vector3;
  /** World rotation in the rest pose. */
  quat: Quaternion;
}

export interface Sole {
  /** Middle of the sole's underside, rest pose. */
  center: Vector3;
  /** Toe direction, level. */
  fwd: Vector3;
}

/** What else, besides the rig, a pose is solved from. */
export interface SolveOptions {
  expression?: Expression;
  /** Height (three's y) of the ground under the rider. */
  ground?: number;
  /**
   * Trick time since the last solve while playback runs forward, for what eases
   * (the arms' follow-through, the hands, the head turning to look); 0 (or less)
   * for a pose on its own (a frozen frame, a scrub), which snaps them.
   */
  dt?: number;
  /** The trick's clock, for the small drifts of arms and fingers. */
  time?: number;
  /** Where the rider is looking (three's world); null keeps the head as the rig holds it. */
  gaze?: Vector3 | null;
}

export interface RestSkeleton {
  bones: RestBone[];
  soles: { L: Sole; R: Sole };
}

/** The posed skeleton: per bone, its head and world rotation. */
export interface SkeletonPose {
  head: Vector3[];
  quat: Quaternion[];
}

type SideKey = 'L' | 'R';
const SIDES: readonly SideKey[] = ['L', 'R'];
const UP = new Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** A rotation whose z axis is `fwd` and y axis `up` squared to it. */
function frameQuat(fwd: Vector3, up: Vector3, out = new Quaternion()): Quaternion {
  const z = fwd.clone().normalize();
  const y = up.clone().addScaledVector(z, -up.dot(z));
  if (y.lengthSq() < 1e-10) {
    y.set(0, 1, 0).addScaledVector(z, -z.y);
    if (y.lengthSq() < 1e-10) y.set(1, 0, 0).addScaledVector(z, -z.x);
  }
  y.normalize();
  const x = new Vector3().crossVectors(y, z);
  return out.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
}

/** The world rotation taking the frame (fwd0, up0) onto (fwd, up). */
export function deltaFrom(fwd0: Vector3, up0: Vector3, fwd: Vector3, up: Vector3): Quaternion {
  return frameQuat(fwd, up).multiply(frameQuat(fwd0, up0).invert());
}

/** The part of `q` that turns about the unit `axis`. */
function twistAbout(q: Quaternion, axis: Vector3): Quaternion {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  const t = new Quaternion(axis.x * d, axis.y * d, axis.z * d, q.w);
  const len = Math.hypot(t.x, t.y, t.z, t.w);
  return len < 1e-9 ? new Quaternion() : t.set(t.x / len, t.y / len, t.z / len, t.w / len);
}

const v3 = (p: { x: number; y: number; z: number }) => new Vector3(...toThree(p));
const d3 = (p: { x: number; y: number; z: number }) => new Vector3(...dirToThree(p)).normalize();

/**
 * The middle joint of a two-bone limb (lengths a, b) from `root` toward
 * `target`, bent toward `pole`; where its end gets to; and the normal of the
 * plane it bends in (root-to-target × the bend), the one direction square to
 * both its bones however far it folds.
 */
function twoBone(root: Vector3, target: Vector3, a: number, b: number, pole: Vector3): { mid: Vector3; end: Vector3; normal: Vector3 } {
  const toward = target.clone().sub(root);
  const reach = toward.length();
  const u = reach > 1e-6 ? toward.divideScalar(reach) : new Vector3(0, -1, 0);
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, reach));
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const v = pole.clone().addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(u, -u.z);
  v.normalize();
  return {
    mid: root.clone().addScaledVector(u, along).addScaledVector(v, h),
    end: root.clone().addScaledVector(u, d),
    normal: new Vector3().crossVectors(u, v).normalize(),
  };
}

/** A direction off the line a→c toward b. */
function bendOf(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const axis = c.clone().sub(a).normalize();
  const off = b.clone().sub(a);
  return off.addScaledVector(axis, -off.dot(axis)).normalize();
}

/** `p` pushed out from the segment a→b (the trunk's axis) to at least `radius` from it. */
function clearOfTrunk(p: Vector3, a: Vector3, b: Vector3, radius: number): Vector3 {
  const axis = b.clone().sub(a);
  const t = clamp(p.clone().sub(a).dot(axis) / Math.max(1e-6, axis.lengthSq()), 1);
  if (t <= 0) return p;
  const near = a.clone().addScaledVector(axis, t);
  const off = p.clone().sub(near);
  const r = off.length();
  return r >= radius || r < 1e-6 ? p : near.addScaledVector(off, radius / r);
}

/**
 * Finger flexion per joint (degrees: knuckle, middle joint, tip), index to little
 * finger, for a hand at rest and a hand held open. A relaxed hand is a cascade:
 * each finger a little more curled than the one before it, most of it at the
 * knuckle and middle joint, the tip following the middle joint. An open hand,
 * out for balance, keeps a soft curve; it is never a flat paddle.
 */
const RELAXED = [
  [9, 16, 8],
  [13, 21, 10],
  [18, 26, 12],
  [23, 30, 14],
] as const;
const OPEN = [
  [2, 5, 3],
  [3, 6, 3],
  [4, 7, 4],
  [6, 9, 5],
] as const;
/**
 * Fingers turned toward the little finger's side (degrees), index to little
 * finger, from MakeHuman's rest hand, which fans them 33° from index to little
 * finger, twice a relaxed hand's. Drawn together at rest (nearly parallel, the
 * little finger a touch out); a little apart when open.
 */
const SPREAD_RELAXED = [11, 0, -6, -8] as const;
const SPREAD_OPEN = [7, 0, -3, -3] as const;
/** Thumb (base, middle, tip): flexion resting along the index finger, and held open; and how far it swings away from the palm when open. */
const THUMB_RELAXED = [10, 14, 18] as const;
const THUMB_OPEN = [2, 4, 6] as const;
const THUMB_AWAY = 12;
/**
 * The hand's intent, by what the arm is doing (flex in degrees, negative lifting
 * the back of the hand: a wrist at rest sits 10–20° extended, and a hand flexed
 * past straight reads as limp). Hanging, it rests: curled, wrist a little lifted,
 * angled toward the little finger. Out for balance it opens and the wrist lifts
 * further, the palm pressing down on the air. Moving fast it reaches open.
 */
const HAND_HANG = { curl: 0.9, flex: -12, dev: 6 } as const;
const HAND_OUT = { curl: 0.3, flex: -24, dev: 3 } as const;
/** Arm speed (world units/s) at which the hand is fully reaching. */
const HAND_FAST = 260;
/** Hand shape springs: each finger a little slower than the one before it, so the hand closes as a wave. */
const FINGER_OMEGA = [22, 19, 16, 14] as const;
const WRIST_OMEGA = 16;

/**
 * Looking (degrees, off the chest for the head, off the head for the eyes). The
 * head carries most of a look, as far as a neck turns: side to side, down
 * (chin to chest) and up; the eyes the rest, within what's comfortable. Eyes
 * jump to a new target first; the head follows a beat later and the eyes
 * re-center as it arrives.
 */
const HEAD_SHARE = { yaw: 0.8, pitch: 0.6 } as const;
const HEAD_YAW = 70;
const HEAD_DOWN = 48;
const HEAD_UP = 20;
const EYE_YAW = 24;
const EYE_DOWN = 36;
const EYE_UP = 14;
const HEAD_OMEGA = 11;
/** How much the head keeps level with the world rather than tilting with the chest, while the rider is up. */
const HEAD_LEVEL = 0.85;
const EYE_OMEGA = 45;
/** Per expression: degrees the upper lids close and the lower lids rise. */
const LIDS: Record<Expression, [number, number]> = {
  open: [0, 0],
  focus: [3, 2],
  happy: [3, 6],
  wince: [24, 9],
};
/** The arms' follow-through: natural frequency (rad/s) and damping ratio. */
const ARM_SPRING = { omega: 12, zeta: 0.9 } as const;

/**
 * A damped spring chasing a target vector. A step that isn't a short one
 * forward (the first, a redraw, a seek, a replay) puts it on the target: a
 * pose with no history is drawn as the rig has it.
 */
class Spring {
  private readonly at = new Vector3();
  private readonly velocity = new Vector3();
  private live = false;
  constructor(private readonly tune: { omega: number; zeta: number }) {}
  step(target: Vector3, dt: number, maxLength: number): Vector3 {
    if (!this.live || !(dt > 0) || dt > 0.1) {
      this.at.copy(target);
      this.velocity.set(0, 0, 0);
      this.live = true;
      return this.at.clone();
    }
    const { omega, zeta } = this.tune;
    // Sub-steps of at most 1/240 s keep the integration steady.
    const n = Math.ceil(dt * 240);
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const accel = target.clone().sub(this.at).multiplyScalar(omega * omega).addScaledVector(this.velocity, -2 * zeta * omega);
      this.velocity.addScaledVector(accel, h);
      this.at.addScaledVector(this.velocity, h);
    }
    if (this.at.length() > maxLength) this.at.setLength(maxLength);
    return this.at.clone();
  }
}

/** Critically damped scalar springs, one per channel; a step that isn't a short one forward snaps them. */
class Springs {
  private readonly at: number[];
  private readonly velocity: number[];
  private live = false;
  constructor(count: number) {
    this.at = new Array(count).fill(0);
    this.velocity = new Array(count).fill(0);
  }
  step(i: number, target: number, dt: number, omega: number): number {
    if (!this.live || !(dt > 0) || dt > 0.1) {
      this.at[i] = target;
      this.velocity[i] = 0;
      return target;
    }
    const n = Math.ceil(dt * 240);
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      this.velocity[i] += ((target - this.at[i]) * omega * omega - 2 * omega * this.velocity[i]) * h;
      this.at[i] += this.velocity[i] * h;
    }
    return this.at[i];
  }
  /** Call once a frame, after every channel has stepped: the first frame snaps them all. */
  settle() {
    this.live = true;
  }
}

/** How much a look's sideways angle counts, by its pitch (degrees): fully when level, not at all looking straight down. */
const besideWeight = (pitch: number) => smoothstep((Math.cos(pitch * DEG) - 0.15) / 0.5);

/** How far over the ground a hand stays (world units). */
const HAND_OFF_GROUND = 3;
const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
/**
 * Crouching: the trunk leans CROUCH_LEAN degrees per degree the knees bend past
 * CROUCH_FROM (riding, about 15°; the pop's crouch, about 45°), CROUCH_AIR as much
 * in the air. The pelvis takes PELVIS_SHARE of the lean, the back rounds through
 * the rest; the hips sit back HIPS_BACK of how far forward the leaning trunk carries.
 */
const CROUCH_LEAN = 0.55;
const CROUCH_FROM = 45;
const CROUCH_AIR = 0.45;
const PELVIS_SHARE = 0.62;
const HIPS_BACK = 0.4;
/** The most a leg straightens, as a share of its length (about 25° of knee bend). */
const SOFT_KNEE = 0.975;
/** How much the knee turns from the rig's toward the way the hips face (a tuck brings the knees up in front of the chest). */
const KNEE_FORWARD = 0.75;
/** How much a knee turns toward its own foot (negative: a touch in, over the board, as a skater's knees ride). */
const KNEE_SPLAY = -0.12;
/**
 * Arms, from the rig's angles (radians): the rig's riding arm is ARM_OUT_RIG_RIDE
 * out from the side, a person's ARM_OUT_RIDE, and as the rig raises an arm the
 * person raises it ARM_OUT_GAIN as far; never closer in than ARM_OUT_MIN (clear of
 * the hips). Swing fore and aft is kept nearly whole. A relaxed elbow is always a
 * little bent. Each arm drifts on its own, slowly, by up to ARM_DRIFT.
 */
const ARM_OUT_RIG_RIDE = 22 * DEG;
const ARM_OUT_RIDE = 6 * DEG;
const ARM_OUT_GAIN = 0.82;
const ARM_OUT_MIN = 4 * DEG;
const ARM_SWING_GAIN = 0.9;
const ARM_ELBOW_REST = 9 * DEG;
const ARM_ELBOW_GAIN = 0.72;
const ARM_ELBOW_MAX = 110 * DEG;
const ARM_CARRY = 0.13;
const ARM_DRIFT = { out: 2 * DEG, swing: 3.5 * DEG, elbow: 5 * DEG } as const;
/** How far from the spine a hand stays: clear of the hips and the tee. */
const HAND_CLEARANCE = 19;

interface Limb {
  /** The bone and its twist bone, for each half. */
  upper: [number, number];
  lower: [number, number];
  root: Vector3;
  mid: Vector3;
  tip: Vector3;
  a: number;
  b: number;
  /** The normal of the plane the limb bends in at rest (root-to-tip × the bend). */
  normal: Vector3;
}

interface Hand {
  wrist: number;
  metacarpals: number[];
  fingers: number[][];
  thumb: number[];
  /** Rest: knuckles' direction from the wrist, the palm's normal, and the axis fingers close about. */
  fwd: Vector3;
  palm: Vector3;
  curl: Vector3;
  thumbCurl: Vector3;
  /** +1 if turning about the palm's normal by a positive angle swings the fingers toward the little finger. */
  ulnar: number;
  /** Rest index-to-little-finger direction. */
  across: Vector3;
}

export class SkaterSolver {
  readonly rest: RestSkeleton;
  readonly pose: SkeletonPose;
  private readonly index = new Map<string, number>();
  /** Parents before children. */
  private readonly order: number[] = [];
  private readonly delta: Quaternion[];
  private readonly driven: boolean[];

  private readonly root: number;
  private readonly spine: number[];
  private readonly neck: number[];
  private readonly headBone: number;
  private readonly eyes: number[];
  /** Upper and lower lid, per eye (left then right), where the rig has them. */
  private readonly lids: { upper: number; lower: number }[];
  private readonly hipMid: Vector3;
  /** Hips to the base of the neck, at rest. */
  private readonly trunkLength: number;
  private readonly restFwd: Vector3;
  private readonly legs: Record<SideKey, Limb & { foot: number }>;
  private readonly arms: Record<SideKey, Limb & { clavicle: number }>;
  private readonly hands: Record<SideKey, Hand>;
  /** The look: head yaw and pitch off the chest, eye yaw and pitch off the head (degrees), eased. */
  private readonly look = new Springs(4);
  /** Each hand's shape (four finger curls, wrist flex, wrist deviation, spread), eased. */
  private readonly handShape: Record<SideKey, Springs> = { L: new Springs(7), R: new Springs(7) };
  /** Each wrist where it was last frame, for how fast the arm is moving. */
  private readonly lastWrist: Record<SideKey, Vector3 | null> = { L: null, R: null };
  /** Each hand's follow-through. */
  private readonly follow: Record<SideKey, Spring> = { L: new Spring(ARM_SPRING), R: new Spring(ARM_SPRING) };
  /** The trunk as spheres for keeping it out of the ground: bone, radius, and how far up the bone the middle is. */
  private readonly trunk: [number, number, number][];

  constructor(rest: RestSkeleton) {
    this.rest = rest;
    const bones = rest.bones;
    // glTF loaders drop the dots from node names (upperleg01.L → upperleg01L); match either.
    bones.forEach((b, i) => this.index.set(b.name.replace(/\./g, ''), i));
    const placed = new Set<number>();
    const visit = (i: number) => {
      if (placed.has(i)) return;
      if (bones[i].parent >= 0) visit(bones[i].parent);
      placed.add(i);
      this.order.push(i);
    };
    bones.forEach((_, i) => visit(i));
    this.delta = bones.map(() => new Quaternion());
    this.driven = bones.map(() => false);
    this.pose = { head: bones.map((b) => b.head.clone()), quat: bones.map((b) => b.quat.clone()) };

    const n = (name: string) => {
      const i = this.index.get(name.replace(/\./g, ''));
      if (i === undefined) throw new Error(`skater skeleton has no bone ${name}`);
      return i;
    };
    const at = (name: string) => bones[n(name)].head;
    this.root = n('root');
    this.spine = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'].map(n);
    this.neck = ['neck01', 'neck02', 'neck03'].map(n);
    this.headBone = n('head');
    this.eyes = ['eyeL', 'eyeR'].filter((s) => this.index.has(s)).map(n);
    this.lids = ['L', 'R'].filter((s) => this.index.has(`orbicularis03${s}`)).map((s) => ({ upper: n(`orbicularis03${s}`), lower: n(`orbicularis04${s}`) }));
    this.hipMid = at('upperleg01.L').clone().add(at('upperleg01.R')).multiplyScalar(0.5);
    this.trunkLength = at('neck01').distanceTo(this.hipMid);
    const restRight = at('upperleg01.R').clone().sub(at('upperleg01.L')).normalize();
    this.restFwd = new Vector3().crossVectors(UP, restRight).normalize();

    const limb = (u1: string, u2: string, l1: string, l2: string, end: string): Limb => {
      const root = at(u1).clone(), mid = at(l1).clone(), tip = at(end).clone();
      return {
        upper: [n(u1), n(u2)], lower: [n(l1), n(l2)],
        root, mid, tip, a: root.distanceTo(mid), b: mid.distanceTo(tip),
        normal: new Vector3().crossVectors(tip.clone().sub(root), bendOf(root, mid, tip)).normalize(),
      };
    };
    const leg = (s: SideKey) => ({ ...limb(`upperleg01.${s}`, `upperleg02.${s}`, `lowerleg01.${s}`, `lowerleg02.${s}`, `foot.${s}`), foot: n(`foot.${s}`) });
    const arm = (s: SideKey) => ({ ...limb(`upperarm01.${s}`, `upperarm02.${s}`, `lowerarm01.${s}`, `lowerarm02.${s}`, `wrist.${s}`), clavicle: n(`clavicle.${s}`) });
    this.legs = { L: leg('L'), R: leg('R') };
    this.arms = { L: arm('L'), R: arm('R') };

    const hand = (s: SideKey): Hand => {
      const w = at(`wrist.${s}`);
      const fwd = at(`finger3-1.${s}`).clone().sub(w).normalize();
      const across = at(`finger5-1.${s}`).clone().sub(at(`finger2-1.${s}`)).normalize();
      const palm = new Vector3().crossVectors(fwd, across).normalize();
      // The palm is the side the thumb sits in front of.
      if (at(`finger1-3.${s}`).clone().sub(at(`finger2-1.${s}`)).dot(palm) < 0) palm.negate();
      // Turning a finger about fwd × palm by a positive angle swings its tip toward the palm.
      const curl = new Vector3().crossVectors(fwd, palm).normalize();
      const thumbDir = at(`finger1-3.${s}`).clone().sub(at(`finger1-1.${s}`)).normalize();
      // The thumb closes across the palm, toward the little finger.
      const thumbCurl = new Vector3().crossVectors(thumbDir, across).normalize();
      const ulnar = Math.sign(new Vector3().crossVectors(palm, fwd).dot(across)) || 1;
      return {
        wrist: n(`wrist.${s}`),
        metacarpals: [1, 2, 3, 4].map((m) => n(`metacarpal${m}.${s}`)),
        fingers: [2, 3, 4, 5].map((f) => [1, 2, 3].map((j) => n(`finger${f}-${j}.${s}`))),
        thumb: [1, 2, 3].map((j) => n(`finger1-${j}.${s}`)),
        fwd, palm, curl, thumbCurl, ulnar, across,
      };
    };
    this.hands = { L: hand('L'), R: hand('R') };
    this.trunk = [
      [this.root, 9, 0], [this.spine[0], 10, 0], [this.spine[1], 10, 0], [this.spine[2], 10.5, 0], [this.spine[3], 11, 0],
      [this.spine[4], 11, 8], [this.neck[0], 6, 0], [this.headBone, 10, 8], [this.arms.L.upper[0], 6, 0], [this.arms.R.upper[0], 6, 0],
    ];
  }

  /** Pose every bone from the rig. */
  solve(rig: Rig, options: SolveOptions = {}): SkeletonPose {
    const { expression = 'focus', ground = 0, dt = 0, time = 0, gaze = null } = options;
    const bones = this.rest.bones;
    for (let i = 0; i < bones.length; i++) {
      this.delta[i].identity();
      this.driven[i] = false;
    }
    const drive = (i: number, q: Quaternion) => {
      this.delta[i].copy(q);
      this.driven[i] = true;
    };

    const legOf = (side: 'left' | 'right') => (rig.legs[0].side === side ? rig.legs[0] : rig.legs[1]);
    const armOf = (side: 'left' | 'right') => (rig.arms[0].side === side ? rig.arms[0] : rig.arms[1]);
    const rigLeg = { L: legOf('left'), R: legOf('right') };
    const rigArm = { L: armOf('left'), R: armOf('right') };
    const torsoUp = d3(rig.torso.up);
    const headUp = d3(rig.head.up);
    const headFwd = d3(rig.head.fwd);

    // Feet on the rig's soles.
    const feet = {} as Record<SideKey, { quat: Quaternion; ankle: Vector3 }>;
    for (const s of SIDES) {
      const shoe = rigLeg[s].shoe;
      const sole = this.rest.soles[s];
      const quat = deltaFrom(sole.fwd, UP, d3(shoe.fwd), d3(shoe.up));
      const contact = v3(shoe.at(0, -SHOE_HALF_HEIGHT, 0));
      feet[s] = { quat, ankle: contact.add(this.legs[s].tip.clone().sub(sole.center).applyQuaternion(quat)) };
    }

    // The chest's frame as the rig holds it, its side from the shoulders so the twist is the arms' own.
    const shoulderRight = v3(rigArm.R.shoulder).sub(v3(rigArm.L.shoulder));
    shoulderRight.addScaledVector(torsoUp, -shoulderRight.dot(torsoUp)).normalize();
    const chestFwd = new Vector3().crossVectors(torsoUp, shoulderRight).normalize();
    const upright = smoothstep((torsoUp.dot(UP) - 0.3) / 0.5);

    // Crouching. The rig bends a robot's knees with its back nearly straight; a
    // person can't: to stay over their feet they fold at the hips as the knees
    // bend, the back rounds, and the hips sit back. How far the knees bend is read
    // off how far each hip is from its ankle; the trunk leans with it, fully with
    // the feet on the board on the ground, less in the air (a tuck brings the knees
    // up to the chest more than the chest down to them).
    const bend = SIDES.reduce((sum, s) => {
      const reach = v3(rigLeg[s].hip).distanceTo(feet[s].ankle) / (this.legs[s].a + this.legs[s].b);
      return sum + 2 * Math.acos(Math.min(1, reach)) / SIDES.length;
    }, 0) / DEG;
    const boardHeight = v3(rig.board.center).y - ground;
    const support = 1 - smoothstep((boardHeight - 20) / 30);
    const leanTo = new Vector3(chestFwd.x, 0, chestFwd.z);
    const rigLean = Math.acos(clamp(torsoUp.dot(UP), 1)) / DEG;
    let lean = rigLean;
    if (leanTo.lengthSq() > 1e-6 && upright > 0) {
      leanTo.normalize();
      const want = CROUCH_LEAN * Math.max(0, bend - CROUCH_FROM) * (CROUCH_AIR + (1 - CROUCH_AIR) * support);
      const extra = Math.max(0, want - rigLean) * upright;
      if (extra > 0) {
        const fold = new Quaternion().setFromAxisAngle(new Vector3().crossVectors(UP, leanTo).normalize(), extra * DEG);
        torsoUp.applyQuaternion(fold);
        chestFwd.applyQuaternion(fold);
        shoulderRight.applyQuaternion(fold);
        lean += extra;
      }
    }

    // Pelvis: square to the hips, tipped most of the way the trunk leans (the hips
    // flex) while the rider is up; the rest of the lean rounds the back.
    const hipL = v3(rigLeg.L.hip), hipR = v3(rigLeg.R.hip);
    const right = hipR.clone().sub(hipL).normalize();
    const pelvisUp = torsoUp.clone().lerp(UP, (1 - PELVIS_SHARE) * upright);
    pelvisUp.addScaledVector(right, -pelvisUp.dot(right)).normalize();
    const pelvisFwd = new Vector3().crossVectors(pelvisUp, right).normalize();
    const pelvis = deltaFrom(this.restFwd, UP, pelvisFwd, pelvisUp);
    drive(this.root, pelvis);

    // Chest: the rig's torso, folded over by the crouch.
    const chest = deltaFrom(this.restFwd, UP, chestFwd, torsoUp);
    this.spine.forEach((b, k) => drive(b, pelvis.clone().slerp(chest, (k + 1) / this.spine.length)));

    // Neck and head share the head's turn off the chest.
    const head = deltaFrom(this.restFwd, UP, headFwd, headUp);
    this.neck.forEach((b, k) => drive(b, chest.clone().slerp(head, (k + 1) / (this.neck.length + 1))));
    drive(this.headBone, head);

    // Hips between the rig's, pulled toward the feet if a leg can't reach its foot
    // with the knee still soft: a skater never locks a knee on a rolling board.
    const rootRest = bones[this.root].head;
    const rootAt = v3(rigLeg.L.hip).add(v3(rigLeg.R.hip)).multiplyScalar(0.5).add(rootRest.clone().sub(this.hipMid).applyQuaternion(pelvis));
    // The hips sit back as far as the trunk leans past the rig's, so the weight stays over the feet.
    if (lean > rigLean && leanTo.lengthSq() > 0.5) {
      rootAt.addScaledVector(leanTo, -HIPS_BACK * this.trunkLength * (Math.sin(lean * DEG) - Math.sin(rigLean * DEG)));
    }
    const hipAt = (s: SideKey) => rootAt.clone().add(this.legs[s].root.clone().sub(rootRest).applyQuaternion(pelvis));
    for (let pass = 0; pass < 2; pass++) {
      for (const s of SIDES) {
        const d = feet[s].ankle.clone().sub(hipAt(s));
        const reach = (this.legs[s].a + this.legs[s].b) * SOFT_KNEE;
        const len = d.length();
        if (len > reach) rootAt.addScaledVector(d, (len - reach) / len);
      }
    }
    // A body down on the ground lies on it: the rig's thin capsules can be closer to the
    // ground than a back, a chest, or a skull is thick. Lift the body clear.
    this.pose.head[this.root].copy(rootAt);
    this.forward();
    let sink = 0;
    for (const [bone, radius, up] of this.trunk) {
      const p = this.pose.head[bone];
      const y = up ? p.y + new Vector3(0, up, 0).applyQuaternion(this.delta[bone]).y : p.y;
      sink = Math.max(sink, radius - (y - ground));
    }
    rootAt.y += sink;
    this.pose.head[this.root].copy(rootAt);

    // Looking: the head turns off the chest toward what the rider is watching.
    if (gaze) {
      this.forward();
      const eyesAt = this.eyesAt();
      const want = gaze.clone().sub(eyesAt).normalize();
      // The head's own frame: level with the world while the rider is up (eyes keep to
      // the horizon), going over to the chest's as the body goes down.
      const level = torsoUp.clone().lerp(UP, HEAD_LEVEL * upright).normalize();
      const ahead = chestFwd.clone().addScaledVector(level, -chestFwd.dot(level)).normalize();
      const side = new Vector3().crossVectors(level, ahead);
      const yaw = Math.atan2(want.dot(side), want.dot(ahead)) / DEG;
      const pitch = Math.asin(clamp(want.dot(level), 1)) / DEG;
      // Looking steeply down (at the board under the feet) the head bows the way the
      // chest faces: which side the target is on means little once it's nearly below,
      // and turning after it would swing the head about.
      const headYaw = this.look.step(0, clamp(yaw * HEAD_SHARE.yaw * besideWeight(pitch), HEAD_YAW), dt, HEAD_OMEGA);
      const headPitch = this.look.step(1, Math.max(-HEAD_DOWN, Math.min(HEAD_UP, pitch * HEAD_SHARE.pitch)), dt, HEAD_OMEGA);
      const facing = ahead.clone().applyAxisAngle(level, headYaw * DEG);
      facing.applyAxisAngle(new Vector3().crossVectors(level, facing).normalize(), -headPitch * DEG);
      head.copy(deltaFrom(this.restFwd, UP, facing, level));
      this.neck.forEach((b, k) => drive(b, chest.clone().slerp(head, (k + 1) / (this.neck.length + 1))));
      drive(this.headBone, head);
    }

    // Legs.
    for (const s of SIDES) {
      const L = this.legs[s];
      const leg = rigLeg[s];
      const hip = hipAt(s);
      // Knees point the way the hips face, splayed a little toward their own foot, with
      // some of the rig's own bend kept (a slam's legs go where they're thrown).
      const toward = feet[s].ankle.clone().sub(hip).projectOnPlane(pelvisUp).normalize();
      const forward = pelvisFwd.clone().addScaledVector(toward, KNEE_SPLAY).normalize();
      let pole = bendOf(v3(leg.hip), v3(leg.knee), v3(leg.ankle));
      if (!Number.isFinite(pole.x) || pole.lengthSq() < 0.5) pole = forward.clone();
      pole.lerp(forward, KNEE_FORWARD * upright).normalize();
      const { mid: knee, normal } = twoBone(hip, feet[s].ankle, L.a, L.b, pole);
      this.aimLimb(L.upper, L.root, L.mid, L.normal, hip, knee, normal, 0.5);
      this.aimLimb(L.lower, L.mid, L.tip, L.normal, knee, feet[s].ankle, normal, 0.5);
      drive(L.foot, feet[s].quat);
    }

    // Arms. The rig's arms are posed for a robot: held well out from a boxy body,
    // flung out like wings in the air. Read each back as the angles it was posed
    // from (motion/skeleton.ts armDirs: out from the side, swing fore and aft, elbow
    // bend) and wear them as a person does: hanging close to the body while riding,
    // out to the sides only as far as balance asks, elbows hinging forward and
    // pointing back, each arm with a little life of its own.
    const down = torsoUp.clone().negate();
    const human = {} as Record<SideKey, { upper: Vector3; fore: Vector3; out: number }>;
    for (const s of SIDES) {
      const arm = rigArm[s];
      const outward = s === 'L' ? shoulderRight.clone().negate() : shoulderRight.clone();
      const rigUpper = v3(arm.elbow).sub(v3(arm.shoulder)).normalize();
      const rigFore = v3(arm.hand).sub(v3(arm.elbow)).normalize();
      const swingR = Math.asin(clamp(rigUpper.dot(chestFwd), 1));
      const outR = Math.atan2(rigUpper.dot(outward), rigUpper.dot(down));
      const elbowR = rigUpper.angleTo(rigFore);
      const drift = (k: number) => {
        const seed = (s === 'L' ? 1.3 : 4.1) + k * 2.7;
        return Math.sin(time * (1.1 + 0.37 * k) + seed) * 0.6 + Math.sin(time * (2.3 + 0.21 * k) + seed * 1.9) * 0.4;
      };
      const out = Math.max(ARM_OUT_MIN, ARM_OUT_RIDE + (outR - ARM_OUT_RIG_RIDE) * ARM_OUT_GAIN + ARM_DRIFT.out * drift(0));
      const swing = swingR * ARM_SWING_GAIN + ARM_DRIFT.swing * drift(1);
      const bend = clamp(ARM_ELBOW_REST + elbowR * ARM_ELBOW_GAIN + ARM_DRIFT.elbow * drift(2), ARM_ELBOW_MAX);
      const upperH = chestFwd.clone().multiplyScalar(Math.sin(swing))
        .addScaledVector(down, Math.cos(swing) * Math.cos(out))
        .addScaledVector(outward, Math.cos(swing) * Math.sin(out)).normalize();
      // The elbow folds the forearm forward and up, toward the chest; the forearm
      // carries out a little from the elbow (the carrying angle), clear of the hips.
      const hinge = chestFwd.clone().addScaledVector(torsoUp, 0.35);
      hinge.addScaledVector(upperH, -hinge.dot(upperH)).normalize();
      const foreH = upperH.clone().multiplyScalar(Math.cos(bend)).addScaledVector(hinge, Math.sin(bend))
        .addScaledVector(outward, ARM_CARRY).normalize();
      human[s] = { upper: upperH, fore: foreH, out };
      // Collarbones rise as an arm does.
      const raise = smoothstep((out - 0.6) / 0.9);
      const axis = new Vector3().crossVectors(outward, torsoUp).normalize();
      drive(this.arms[s].clavicle, new Quaternion().setFromAxisAngle(axis, 16 * DEG * raise).multiply(chest));
    }
    this.forward();

    // The trunk the hands keep out of: from the hips up the spine.
    const hipsAt = this.pose.head[this.root].clone();
    const neckAt = this.pose.head[this.neck[0]].clone();
    for (const s of SIDES) {
      const A = this.arms[s];
      const outward = s === 'L' ? shoulderRight.clone().negate() : shoulderRight.clone();
      const shoulder = this.pose.head[A.upper[0]].clone();
      const { upper: upperH, fore: foreH } = human[s];
      const elbowAt = shoulder.clone().addScaledVector(upperH, A.a);
      let target = elbowAt.clone().addScaledVector(foreH, A.b);
      // The hand follows through: it trails the shoulder's moves a beat, then settles,
      // the way an arm that's held (not thrown) does.
      target = shoulder.clone().add(this.follow[s].step(target.sub(shoulder), dt, A.a + A.b));
      target = clearOfTrunk(target, hipsAt, neckAt, HAND_CLEARANCE);
      // Hands stay on top of the ground they're thrown at.
      target.y = Math.max(target.y, ground + HAND_OFF_GROUND);
      let pole = bendOf(shoulder, elbowAt, elbowAt.clone().addScaledVector(foreH, A.b));
      if (!Number.isFinite(pole.x) || pole.lengthSq() < 0.5) pole = chestFwd.clone().negate().addScaledVector(down, 0.5).normalize();
      const { mid: elbow, end: wrist, normal } = twoBone(shoulder, target, A.a, A.b, pole);
      this.aimLimb(A.upper, A.root, A.mid, A.normal, shoulder, elbow, normal, 0.4);
      const fore = this.aimLimb(A.lower, A.mid, A.tip, A.normal, elbow, wrist, normal, 1);
      this.handPose(s, fore, wrist, wrist.clone().sub(elbow).normalize(), upperH, outward, torsoUp, chestFwd, dt, time);
    }

    // Eyes: on what the rider is watching, as far as the head left them to turn;
    // the upper lids follow them down, so the whites never show above the iris.
    const headLeft = new Vector3(1, 0, 0).applyQuaternion(head);
    const headAhead = this.restFwd.clone().applyQuaternion(head);
    const headTop = UP.clone().applyQuaternion(head);
    let pitch = 0;
    if (this.eyes.length) {
      this.forward();
      let yaw = 0;
      if (gaze) {
        const want = gaze.clone().sub(this.eyesAt()).normalize();
        pitch = Math.asin(clamp(want.dot(headTop), 1)) / DEG;
        yaw = (Math.atan2(want.dot(headLeft), want.dot(headAhead)) / DEG) * besideWeight(pitch);
      }
      yaw = this.look.step(2, clamp(yaw, EYE_YAW), dt, EYE_OMEGA);
      pitch = this.look.step(3, Math.max(-EYE_DOWN, Math.min(EYE_UP, pitch)), dt, EYE_OMEGA);
      const turn = new Quaternion().setFromAxisAngle(headTop, yaw * DEG).multiply(new Quaternion().setFromAxisAngle(headLeft, -pitch * DEG));
      for (const e of this.eyes) drive(e, turn.clone().multiply(head));
    }
    this.look.settle();
    // Lids: a relaxed, slightly hooded look; narrowed in focus, shut in a wince, lifted by a smile.
    const [upperShut, lowerLift] = LIDS[expression];
    for (const lid of this.lids) {
      drive(lid.upper, new Quaternion().setFromAxisAngle(headLeft, (upperShut - pitch * 0.7) * DEG).multiply(head));
      drive(lid.lower, new Quaternion().setFromAxisAngle(headLeft, -lowerLift * DEG).multiply(head));
    }

    this.forward();
    return this.pose;
  }

  /** Midway between the eyes as currently posed (the head, if the skeleton has no eye bones). */
  private eyesAt(): Vector3 {
    if (!this.eyes.length) return this.pose.head[this.headBone].clone();
    return this.eyes.reduce((m, e) => m.add(this.pose.head[e]), new Vector3()).divideScalar(this.eyes.length);
  }

  /**
   * Turn a bone and its twist bone from rest `a0 → b0` onto `a → b`, its limb's
   * bend plane from the one with normal `normal0` onto the one with `normal`.
   * The normal is square to both bones of the limb however far it folds, so
   * the bone's roll about itself is always defined; a direction within the
   * plane (the pole) isn't: in a deep crouch the thigh points nearly along it,
   * and the roll it gives flips over. The first bone takes `share` of the
   * limb's twist and the second all of it, twist counted from the bone the
   * limb hangs off (a thigh's from the pelvis), not from the world: however
   * the rider faces, a leg is only ever turned in or out a little at the hip.
   * Returns the second's.
   */
  private aimLimb(bones: [number, number], a0: Vector3, b0: Vector3, normal0: Vector3, a: Vector3, b: Vector3, normal: Vector3, share: number): Quaternion {
    const dir0 = b0.clone().sub(a0).normalize();
    const dir = b.clone().sub(a).normalize();
    const full = deltaFrom(dir0, normal0, dir, normal);
    // In the parent's frame: the swing there from rest, and the turn about the limb left over.
    const parent = this.heldBy(bones[0]);
    const local = parent.clone().invert().multiply(full);
    const localDir = dir0.clone().applyQuaternion(local);
    const swing = new Quaternion().setFromUnitVectors(dir0, localDir);
    const twist = twistAbout(local.multiply(swing.clone().invert()), localDir);
    const first = parent.clone().multiply(new Quaternion().slerp(twist, share).multiply(swing));
    // The two bones aren't quite in line: swing the first a touch so the twist bone
    // starts where the whole limb's turn puts it, and the limb ends on its target.
    const along = this.rest.bones[bones[1]].head.clone().sub(a0);
    const from = along.clone().applyQuaternion(first).normalize();
    const to = along.applyQuaternion(full).normalize();
    first.premultiply(new Quaternion().setFromUnitVectors(from, to));
    this.delta[bones[0]].copy(first);
    this.driven[bones[0]] = true;
    this.delta[bones[1]].copy(full);
    this.driven[bones[1]] = true;
    return full;
  }

  /** The turn of the nearest driven bone above `bone` (what it hangs off): its parent's, or that one's, and so on. */
  private heldBy(bone: number): Quaternion {
    const bones = this.rest.bones;
    for (let i = bones[bone].parent; i >= 0; i = bones[i].parent) {
      if (this.driven[i]) return this.delta[i].clone();
    }
    return new Quaternion();
  }

  /**
   * The hand: turned so the palm faces the thigh while the arm hangs and the
   * ground as it goes out for balance (the forearm's twist bones sharing that
   * turn), then shaped by what the arm is doing. Shape eases on springs, the
   * fingers one after another, and drifts a little on its own, so the hand is
   * held, not frozen and not limp.
   */
  private handPose(s: SideKey, fore: Quaternion, wrist: Vector3, foreDir: Vector3, upperDir: Vector3, outward: Vector3, up: Vector3, chestFwd: Vector3, dt: number, time: number) {
    const H = this.hands[s];
    const A = this.arms[s];
    const out = smoothstep((upperDir.dot(outward) + 0.1) / 0.8) * (1 - smoothstep((upperDir.dot(up) - 0.5) / 0.4));
    const palm = outward.clone().multiplyScalar(-(1 - out)).addScaledVector(up, -out).addScaledVector(chestFwd, -0.35 * (1 - out));
    palm.addScaledVector(foreDir, -palm.dot(foreDir));
    if (palm.lengthSq() < 1e-4) palm.copy(up).negate().addScaledVector(foreDir, foreDir.y);
    palm.normalize();

    // How fast the arm is moving: a hand being swung through the air reaches open.
    const last = this.lastWrist[s];
    const speed = last && dt > 0 && dt <= 0.1 ? wrist.distanceTo(last) / dt : 0;
    this.lastWrist[s] = wrist.clone();
    const reach = smoothstep(speed / HAND_FAST);
    const wave = (k: number) => {
      const seed = (s === 'L' ? 0.7 : 2.9) + k * 1.618;
      return Math.sin(time * (1.3 + 0.29 * k) + seed) * 0.6 + Math.sin(time * (2.9 + 0.17 * k) + seed * 2.3) * 0.4;
    };
    const mixed = (a: number, b: number) => a + (b - a) * out;
    const curlTarget = Math.max(0, mixed(HAND_HANG.curl, HAND_OUT.curl) - 0.35 * reach);
    const shape = this.handShape[s];
    const curls = FINGER_OMEGA.map((omega, f) => Math.min(1.1, Math.max(0, shape.step(f, curlTarget + 0.07 * wave(f), dt, omega))));
    const flex = shape.step(4, mixed(HAND_HANG.flex, HAND_OUT.flex) - 8 * reach + 3 * wave(5), dt, WRIST_OMEGA);
    const dev = shape.step(5, mixed(HAND_HANG.dev, HAND_OUT.dev) + 2 * wave(6), dt, WRIST_OMEGA);
    const open = shape.step(6, Math.min(1, out + reach), dt, WRIST_OMEGA);
    shape.settle();

    // The wrist: the hand along the forearm, then flexed toward the palm (or lifted
    // back) and angled toward the little finger's side.
    const base = deltaFrom(H.fwd, H.palm, foreDir, palm);
    const flexAxis = new Vector3().crossVectors(foreDir, palm).normalize();
    const ulnarW = H.across.clone().applyQuaternion(base);
    const devSign = Math.sign(new Vector3().crossVectors(palm, foreDir).dot(ulnarW)) || 1;
    const hand = new Quaternion().setFromAxisAngle(palm, devSign * dev * DEG)
      .multiply(new Quaternion().setFromAxisAngle(flexAxis, flex * DEG))
      .multiply(base);
    // The forearm's twist bones take part of the hand's turn about the forearm.
    const turn = twistAbout(hand.clone().multiply(fore.clone().invert()), foreDir);
    this.delta[A.lower[0]].copy(new Quaternion().slerp(turn, 0.25).multiply(fore));
    this.delta[A.lower[1]].copy(new Quaternion().slerp(turn, 0.7).multiply(fore));
    for (const b of [H.wrist, ...H.metacarpals]) {
      this.delta[b].copy(hand);
      this.driven[b] = true;
    }
    H.fingers.forEach((chain, f) => {
      const c = curls[f];
      const spread = SPREAD_RELAXED[f] + (SPREAD_OPEN[f] - SPREAD_RELAXED[f]) * open;
      let q = hand.clone().multiply(new Quaternion().setFromAxisAngle(H.palm, H.ulnar * spread * DEG));
      chain.forEach((b, j) => {
        const angle = OPEN[f][j] + (RELAXED[f][j] - OPEN[f][j]) * c;
        q = q.clone().multiply(new Quaternion().setFromAxisAngle(H.curl, angle * DEG));
        this.delta[b].copy(q);
        this.driven[b] = true;
      });
    });
    // The thumb rests along the side of the index finger, and swings away from the
    // palm as the hand opens.
    const thumbCurl = (curls[0] + curls[1]) / 2;
    let q = hand.clone().multiply(new Quaternion().setFromAxisAngle(H.palm, -H.ulnar * THUMB_AWAY * open * DEG));
    H.thumb.forEach((b, j) => {
      const angle = THUMB_OPEN[j] + (THUMB_RELAXED[j] - THUMB_OPEN[j]) * thumbCurl;
      q = q.clone().multiply(new Quaternion().setFromAxisAngle(H.thumbCurl, angle * DEG));
      this.delta[b].copy(q);
      this.driven[b] = true;
    });
  }

  /** Carry heads down the hierarchy; undriven bones keep their rest pose relative to their parent. */
  private forward() {
    const bones = this.rest.bones;
    for (const i of this.order) {
      const b = bones[i];
      if (b.parent >= 0) {
        if (!this.driven[i]) this.delta[i].copy(this.delta[b.parent]);
        this.pose.head[i].copy(b.head).sub(bones[b.parent].head).applyQuaternion(this.delta[b.parent]).add(this.pose.head[b.parent]);
      }
      this.pose.quat[i].copy(this.delta[i]).multiply(b.quat);
    }
  }
}
