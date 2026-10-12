import { add3, clamp01, cross3, dot3, lerp3, norm3, scale3, smoothstep, sub3, type V3 } from '../../math';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH, type BoardRig, type Rig } from '../skeleton';
import { ANKLE_IN_SHOE, ankleOf, centerOfMass, rigOf, twoBone, type BodyDims, type BodyPose, type ShoePose } from './body';
import { frameFrom, qframe, qrot, qslerp } from './rotation';
import { rightOf, turnLevel } from './runOut';

/**
 * Rolling it out: a rider who comes down off a drop (or off the board at
 * speed) too hard to run it out takes it on their feet and rolls.
 *
 * The feet land, and the knees take the fall: the hips sink into a deep
 * squat as fast as the drop has them coming down, the body folding over the
 * knees, while the speed carries the hips on over the feet. Then the rider
 * dives: the hands reach the ground ahead, the head tucks away from the
 * shoulder that leads, and the body rolls over that shoulder, across the
 * back to the other hip, and back onto the feet, coming up in a crouch with
 * what's left of the speed to run off.
 *
 * Through the roll the body is a shape that changes as it goes round (the
 * posture, keyed by how far round the pelvis has pitched) and rests on
 * whatever part of it is lowest. On its feet it pivots about the leading
 * point it rests on and falls with gravity's torque about it; it flies when
 * nothing is under it. On its body, tucked, it's round: the ground pushes up
 * through its middle, so the speed it came down with carries it on, the
 * ground's grip only turning that into spin until it rolls (and rolling
 * takes a little more), and up over its feet the leg to a foot ahead brakes
 * it as a step would: the faster it lands, the further it goes. A hand or
 * foot that meets the ground stays where it met it until the body has gone
 * past it. The shape is the drawn body's: its chest and head as rounded
 * boxes and its limbs as capsules, so the back that rolls is the back that's
 * drawn.
 *
 * Positions are the physics' (y down). Angles in degrees unless named.
 */

/** Sim steps a second; the poses are kept at every other one. */
const HZ = 600;
/** The deepest the hips go taking a drop's landing, over the ankles (in legs): right down, the chest over the knees. */
const ROLL_SQUAT = 0.5;
/** Pelvis pitch (degrees forward) at the touchdown, and once the knees have taken the drop. */
const LAND_PITCH = 10;
const DIVE_PITCH = 35;
/**
 * How far the body leans over toward the side it tucks the head to, and
 * turns off the way it's going, as it goes over: the roll runs diagonally,
 * from the leading shoulder across the back to the other hip, so the head
 * (the robot's is wider than its shoulders) stays off the ground.
 */
const ROLL_BANK = 62;
const ROLL_YAW = 15;
/**
 * Pelvis pitch the turn and lean onto the leading shoulder are done by: as it comes down onto it. Turned in any sooner,
 * a rider who lands sideways (as one off a board does) would twist square faster than anyone can.
 */
const TURNED_IN = 110;
/**
 * How much deeper a person tucks the chin than the posture's nod (the robot's: its head is a box as wide as its
 * shoulders, and turns off one): chin to the chest, the head goes inside the curl and the shoulder blade takes the ground.
 */
const PERSON_TUCK = 1.6;
/** Pelvis pitches the feet let go by, the hands let go by, the feet may come down again from, and the roll ends at. */
const FEET_OFF = 70;
/** A held foot lets go once its leg is stretched this far (in legs): the legs peel off the ground rather than straighten. */
const FEET_STRETCH = 0.85;
const HANDS_OFF = 160;
const FEET_BACK = 245;
const ROLL_END = 352;
/** Pelvis pitches the lean and turn off the line unwind over, coming up: off the back, and before the feet are down. */
const SQUARE_FROM = 235;
const SQUARE_BY = 305;
/** The roll never turns slower than this (rad/s): a tucked rider keeps going over; nor faster than a tight tuck can. */
const LEAST_RATE = 6;
const MOST_RATE = 18;
/**
 * Coming up over the feet, the legs drive it round them (the speed into the
 * ground is lost): never slower than this, so it gets up, nor faster, so they
 * don't spring it up off them. Any faster is its own speed along carrying it
 * up over them.
 */
const RISE_RATE = { least: 2.5, most: 5 } as const;
/**
 * Coming up over the feet, the most (in √(gravity · leg)) the legs stand the body up at, how high the hips come up to (in
 * legs, over the ankles: a crouch over the feet), and how high they're let carry on up to on their own (a runner's
 * height, not a hop).
 */
const RISE_UP = 1.6;
const RISE_TO = 0.45;
const RISE_TOP = 0.85;
/**
 * The ground's grip on a body rolling over it (sliding friction, body and clothes on concrete): the most of its speed along
 * the ground it can turn into spin, or spin into speed, or take as it skids, as a share of how hard the body's pressed onto
 * it (coming down onto it, the speed it comes down with; rolling, its weight).
 */
const GRIP = 0.6;
/** How long (seconds) the ground's push on a body coming down onto it takes to come on: a shoulder and back give. */
const IMPACT_T = 0.02;
/** How hard (in gravities) rolling over its body slows it: it isn't quite round, and gives. */
const ROLL_DRAG = 0.3;
/** Friction turning over the feet (rad/s² and per second). */
const DRAG = 8;
const DAMPING = 1.5;
/** The legs' drive (rad/s²): pushing off into the dive, and up out of the roll over the feet. */
const DIVE_PUSH = 12;
/** How fast the legs straighten out of the squat diving (world units a second, a robot's). */
const EXTEND = 160;
const RISE_PUSH = 15;
/** How close (world units) a part has to be to the ground to be resting on it, and how far a rolling body is let drop to stay on it. */
const TOUCH = 0.6;
const SNAP = 3;
/**
 * How far (world units, a robot's, and a person's) the head is held off the ground, and the most it's lifted on its neck
 * to keep it there (degrees). A person keeps it well clear, as a skater who rolls is taught to; the robot's head is as
 * wide as its shoulders, and grazes by.
 */
const HEAD_CLEAR = { robot: 2, person: 8 } as const;
const HEAD_LIFT = 80;
/**
 * How far off the ground (world units) a leg that's let go of it is kept, and the most it's swung back at the hip to keep
 * it there (degrees); coming up over the feet, it's let back down onto the ground (by roll angle, 1 → 0).
 */
const LEG_CLEAR = 1.5;
const ARM_CLEAR = 1.5;
const LEG_LIFT = 90;
const LEG_DOWN_FROM = 215;
const legLiftAt = (theta: number) => 1 - smoothstep((theta - LEG_DOWN_FROM) / (FEET_BACK - LEG_DOWN_FROM));
/** Seconds a hand or foot takes to go from where it was held back to the posture's. */
const LET_GO_T = 0.12;
/** Seconds a foot coming down mid-roll takes to settle flat where it met the ground. */
const SETTLE_T = 0.06;
/** Feet land this far either side of the hips' line (in hip widths). */
const STEP_WIDTH = 1.25;
/** The most the arms brake the body's fall (in gravities), and how fast they let it down at the least (world units a second). */
const ARM_BRAKE = 2.5;
const LOWER = 60;
/** Coming down slower than this (world units a second), the knees have taken the drop. */
const ABSORBED = 8;

const UP: V3 = { x: 0, y: -1, z: 0 };
const level = (v: V3): V3 => norm3({ x: v.x, y: 0, z: v.z });

/** `v` turned `deg` about the unit axis `k` (right-handed about it in the physics' coordinates). */
function turn(v: V3, k: V3, deg: number): V3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  return add3(add3(scale3(v, c), scale3(cross3(k, v), Math.sin(a))), scale3(k, dot3(k, v) * (1 - c)));
}

// ----- The posture through the roll -----

/** A hand off its shoulder in the torso's frame: forward, up, and out to its own side, in arm lengths. */
type Reach = [number, number, number];

interface Posture {
  /** The spine: chest folded forward over the pelvis, and turned away from the shoulder that leads. */
  flex: number;
  twist: number;
  /** The head off the chest: chin tucked, turned and tilted away from the leading shoulder. */
  nod: number;
  turn: number;
  tilt: number;
  /** Each leg: thigh forward off hanging straight down, out to its side, the knee's bend, and the toes pointed. */
  hip: number;
  out: number;
  knee: number;
  point: number;
  /** The hands: the leading shoulder's, and the other. */
  lead: Reach;
  other: Reach;
}

/**
 * The posture by pelvis pitch: landing; folded over the knees; diving onto
 * the hands, legs driving; on the leading shoulder; tucked across the back;
 * onto the other hip with the feet coming under; up over the feet.
 */
const KEYS: ReadonlyArray<readonly [number, Posture]> = [
  [LAND_PITCH, { flex: 12, twist: 0, nod: 5, turn: 0, tilt: 0, hip: 40, out: 10, knee: 40, point: 0, lead: [0.3, -0.55, 0.5], other: [0.3, -0.55, 0.5] }],
  [DIVE_PITCH, { flex: 15, twist: 5, nod: 5, turn: 25, tilt: 20, hip: 105, out: 12, knee: 120, point: 0, lead: [0.75, 0.25, 0.22], other: [0.75, 0.2, 0.2] }],
  [80, { flex: 30, twist: 12, nod: 15, turn: 40, tilt: 45, hip: 70, out: 8, knee: 50, point: 30, lead: [0.5, 0.6, 0.15], other: [0.55, 0.5, 0.25] }],
  [130, { flex: 50, twist: 15, nod: 30, turn: 45, tilt: 50, hip: 105, out: 5, knee: 110, point: 25, lead: [0.45, 0.3, 0.1], other: [0.6, 0.3, 0.35] }],
  [200, { flex: 58, twist: 10, nod: 40, turn: 35, tilt: 35, hip: 128, out: 5, knee: 135, point: 25, lead: [0.6, -0.15, 0.2], other: [0.6, -0.15, 0.45] }],
  [265, { flex: 48, twist: 5, nod: 32, turn: 15, tilt: 10, hip: 118, out: 9, knee: 128, point: 5, lead: [0.75, 0.05, 0.35], other: [0.75, 0.05, 0.35] }],
  [325, { flex: 38, twist: 0, nod: 12, turn: 0, tilt: 0, hip: 102, out: 17, knee: 118, point: 0, lead: [0.75, -0.1, 0.3], other: [0.75, -0.1, 0.3] }],
  [380, { flex: 25, twist: 0, nod: 0, turn: 0, tilt: 0, hip: 80, out: 15, knee: 95, point: 0, lead: [0.45, -0.45, 0.4], other: [0.45, -0.45, 0.4] }],
];

const SCALARS = ['flex', 'twist', 'nod', 'turn', 'tilt', 'hip', 'out', 'knee', 'point'] as const;

/** A smooth curve through the keys (cubic Hermite, each key's slope from its neighbours'). */
function along(theta: number, value: (p: Posture) => number): number {
  const n = KEYS.length;
  if (theta <= KEYS[0][0]) return value(KEYS[0][1]);
  if (theta >= KEYS[n - 1][0]) return value(KEYS[n - 1][1]);
  let i = 0;
  while (theta > KEYS[i + 1][0]) i++;
  const [x0, p0] = KEYS[i];
  const [x1, p1] = KEYS[i + 1];
  const slope = (j: number) => {
    if (j <= 0 || j >= n - 1) return 0;
    return (value(KEYS[j + 1][1]) - value(KEYS[j - 1][1])) / (KEYS[j + 1][0] - KEYS[j - 1][0]);
  };
  const h = x1 - x0;
  const s = (theta - x0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * value(p0) + (s3 - 2 * s2 + s) * h * slope(i) + (-2 * s3 + 3 * s2) * value(p1) + (s3 - s2) * h * slope(i + 1);
}

function postureAt(theta: number): Posture {
  const p = {} as Posture;
  for (const key of SCALARS) p[key] = along(theta, (q) => q[key]);
  p.lead = [0, 1, 2].map((j) => along(theta, (q) => q.lead[j])) as Reach;
  p.other = [0, 1, 2].map((j) => along(theta, (q) => q.other[j])) as Reach;
  return p;
}

// ----- The body's shape, for the ground -----

/** The robot's chest and head (robot3d.ts), as rounded boxes: half-extents along their frames' (fwd, up, side), rounding, and how far up its frame the chest sits. */
const CHEST = { half: [11, 21, 15.5] as const, r: 10.5, raise: 4 };
const ROBOT_HEAD = { half: [14, 15, 18] as const, r: 8.5 };
/**
 * A person's skull, as a ball (world units, a person's): where the drawn skeleton (riders/realistic) has it off the head
 * frame's origin, a little back and down it, as far along (fwd, up) as it sits, and big enough for the neck's give either side.
 */
const PERSON_SKULL = { f: -4, u: -7, r: 12.5 } as const;
/** Limb radii (robot's: robot3d.ts's widths halved): upper arm, forearm, hand, thigh at the hip, knee, ankle. */
const LIMB = { upperArm: 5, forearm: 4.4, hand: 5.8, hip: 6.5, knee: 5.2, ankle: 4.3 } as const;

type Part = 'chest' | 'head' | 'arm0' | 'arm1' | 'hand0' | 'hand1' | 'leg0' | 'leg1' | 'foot0' | 'foot1';

interface Touch {
  /** Clearance over the ground (negative: in it), and the point that's lowest over it. */
  gap: number;
  at: V3;
  part: Part;
}

/** Every part's lowest points over the ground, as touches. */
function touches(rig: Rig, body: BodyDims, ground: (x: number, z: number) => number): Touch[] {
  const k = body.scale;
  const out: Touch[] = [];
  const point = (p: V3, r: number, part: Part) => {
    out.push({ gap: ground(p.x, p.z) - p.y - r, at: { x: p.x, y: p.y + r, z: p.z }, part });
  };
  const box = (center: V3, axes: [V3, V3, V3], half: readonly [number, number, number], r: number, part: Part) => {
    const inner = half.map((h) => Math.max(0, h - r));
    for (const a of [-1, 1]) for (const c of [-1, 1]) for (const d of [-1, 1]) {
      point(add3(center, add3(scale3(axes[0], a * inner[0]), add3(scale3(axes[1], c * inner[1]), scale3(axes[2], d * inner[2])))), r, part);
    }
  };
  const { torso, head } = rig;
  box(torso.at(0, CHEST.raise * k, 0), [torso.fwd, torso.up, torso.side], CHEST.half.map((h) => h * k) as [number, number, number], CHEST.r * k, 'chest');
  if (k === 1) box(head.origin, [head.fwd, head.up, head.side], ROBOT_HEAD.half, ROBOT_HEAD.r, 'head');
  else point(head.at(PERSON_SKULL.f, PERSON_SKULL.u, 0), PERSON_SKULL.r, 'head');
  // The shoulders and hips are the trunk's: they go where it does, whatever a hand or foot is held to.
  rig.arms.forEach((arm, i) => {
    point(arm.shoulder, LIMB.upperArm * k, 'chest');
    point(arm.elbow, LIMB.forearm * k, i === 0 ? 'arm0' : 'arm1');
    point(arm.hand, LIMB.hand * k, i === 0 ? 'hand0' : 'hand1');
  });
  rig.legs.forEach((leg, i) => {
    point(leg.hip, LIMB.hip * k, 'chest');
    point(leg.knee, LIMB.knee * k, i === 0 ? 'leg0' : 'leg1');
    point(leg.ankle, LIMB.ankle * k, i === 0 ? 'leg0' : 'leg1');
    for (const a of [-1, 1]) for (const c of [-1, 1]) {
      point(leg.shoe.at(a * SHOE_HALF_LENGTH, -SHOE_HALF_HEIGHT, c * SHOE_HALF_WIDTH), 0, i === 0 ? 'foot0' : 'foot1');
    }
  });
  return out;
}

const isHand = (part: Part) => part === 'hand0' || part === 'hand1';
const footOf = (part: Part): 0 | 1 | null => (part === 'foot0' ? 0 : part === 'foot1' ? 1 : null);
/** Which leg, or arm, a part is on (null: the body's). */
const legOf = (part: Part): 0 | 1 | null => (part === 'foot0' || part === 'leg0' ? 0 : part === 'foot1' || part === 'leg1' ? 1 : null);
const armOf = (part: Part): 0 | 1 | null => (part === 'hand0' || part === 'arm0' ? 0 : part === 'hand1' || part === 'arm1' ? 1 : null);

// ----- Posing -----

/** A hand or foot held somewhere, and how much it's held there (1, or letting go). */
interface Hold<T> {
  at: T;
  weight: number;
}

interface Holds {
  feet: [Hold<ShoePose> | null, Hold<ShoePose> | null];
  hands: [Hold<V3> | null, Hold<V3> | null];
  /** Whether each hand is done with the ground (it's been down, and isn't held there), so kept off it. */
  handsFree: [boolean, boolean];
}

/** The way the roll goes: along `travel`, about `axis` (its level right), over the shoulder on `side` (1 right, -1 left). */
interface RollLine {
  travel: V3;
  axis: V3;
  side: 1 | -1;
  ground: (x: number, z: number) => number;
  /** Facing off the line (degrees right), and leaning over (degrees, the head toward the left for positive), by roll angle. */
  yaw: (theta: number) => number;
  bank: (theta: number) => number;
}

interface Shape {
  pose: BodyPose;
  rig: Rig;
  com: V3;
  clearing: Clearing;
}

/**
 * How far each part's turned to keep it off the ground (degrees): the head lifted on its neck, each leg swung back at the
 * hip, each hand swung up at the shoulder and each elbow turned round its shoulder-hand line (which way round, by sign).
 * Carried from one step of the roll to the next, so where the least turn that clears jumps (an edge comes under it, or no
 * turn clears) the part swings there rather than snapping.
 */
interface Clearing {
  head: number;
  legs: [number, number];
  hands: [number, number];
  elbows: [number, number];
  /** Where each elbow was bent off its shoulder before it was turned, in the chest's frame (forward, up, right). */
  elbowsAt: [V3 | null, V3 | null];
}
/** The most an elbow turns round its shoulder-hand line to keep off the ground (degrees, either way round). */
const ELBOW_TURN_MOST = 150;
/** How far off upright (the sine) a shoulder-hand line is that an elbow turned round it rises all it can. */
const ELBOW_TILT = 0.35;
/**
 * The fastest (degrees a second) a part turns to keep off the ground: as quick as the roll goes round; an elbow, three times
 * that (a hand let go of the ground swings back to the posture's quickly, and the elbow has to turn up out of its way).
 */
const CLEARING_RATE = 1200;
const ELBOW_RATE = 3600;
/** `want`, as near as a turn from `was` gets in a step at `rate` (all of it, with nothing to go from). */
const toward = (was: number | undefined, want: number, rate = CLEARING_RATE) =>
  was === undefined ? want : was + Math.max(-rate / HZ, Math.min(rate / HZ, want - was));

/** The body posed `theta` round the roll, the hips at `hips`; its parts kept off the ground turning on from `was`, the step before's. */
function shapeAt(body: BodyDims, line: RollLine, theta: number, hips: V3, holds: Holds, board: BoardRig, was: Clearing | null): Shape {
  const clearing: Clearing = { head: 0, legs: [0, 0], hands: [0, 0], elbows: [0, 0], elbowsAt: [null, null] };
  const p = postureAt(theta);
  const { travel, axis, side } = line;
  // The pelvis: facing off the line, leaning over, and pitched forward about the line's axis.
  const f0 = turnLevel(travel, line.yaw(theta));
  const bank = line.bank(theta);
  const F = turn(f0, axis, theta);
  const U = turn(turn(UP, f0, bank), axis, theta);
  const S = turn(turn(rightOf(f0), f0, bank), axis, theta);
  // The chest folds forward over it about its side, and turns its front away from the leading shoulder.
  let Ft = turn(F, S, p.flex);
  const Ut = turn(U, S, p.flex);
  Ft = turn(Ft, Ut, -side * p.twist);
  const St = cross3(Ut, Ft);
  // The head tucks its chin, and turns and tilts away from the leading shoulder.
  const nod = body.scale === 1 ? p.nod : p.nod * PERSON_TUCK;
  let Fh = turn(Ft, St, nod);
  let Uh = turn(Ut, St, nod);
  Fh = turn(Fh, Uh, -side * p.turn);
  Uh = turn(Uh, Fh, side * p.tilt);
  // And it's held off the ground: lifted on its neck the least that keeps it clear.
  const neckBase = add3(hips, scale3(Ut, body.neckBase));
  const headGap = (fh: V3, uh: V3) => {
    const center = add3(neckBase, add3(scale3(uh, body.neck - body.neckBase + body.head.u), scale3(fh, body.head.f)));
    if (body.scale !== 1) {
      const skull = add3(center, add3(scale3(fh, PERSON_SKULL.f), scale3(uh, PERSON_SKULL.u)));
      return line.ground(skull.x, skull.z) - skull.y - PERSON_SKULL.r;
    }
    const floor = line.ground(center.x, center.z);
    const sh = cross3(uh, fh);
    const inner = ROBOT_HEAD.half.map((h) => h - ROBOT_HEAD.r);
    const low = center.y + Math.abs(fh.y) * inner[0] + Math.abs(uh.y) * inner[1] + Math.abs(sh.y) * inner[2];
    return floor - low - ROBOT_HEAD.r;
  };
  const clear = body.scale === 1 ? HEAD_CLEAR.robot : HEAD_CLEAR.person;
  {
    let k = cross3(Uh, UP);
    const kl = Math.hypot(k.x, k.y, k.z);
    if (kl < 0.25) k = add3(k, scale3(Fh, -side * (0.25 - kl)));
    k = norm3(k);
    const most = Math.min(HEAD_LIFT, (Math.acos(Math.max(-1, Math.min(1, dot3(Uh, UP)))) * 180) / Math.PI);
    const lifted = (deg: number) => headGap(turn(Fh, k, deg), turn(Uh, k, deg));
    let want = 0;
    if (headGap(Fh, Uh) < clear) {
      let lo = 0;
      let hi = most;
      if (lifted(hi) >= clear) {
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (lifted(mid) >= clear) hi = mid;
          else lo = mid;
        }
      }
      want = hi;
    }
    clearing.head = Math.max(0, Math.min(most, toward(was?.head, want)));
    Fh = turn(Fh, k, clearing.head);
    Uh = turn(Uh, k, clearing.head);
  }

  const pelvis = qframe(F, U);
  const torso = qframe(Ft, Ut);
  const head = qframe(Fh, Uh);

  // Legs from the posture, or toward where a foot's held.
  const shoes = [] as unknown as [ShoePose, ShoePose];
  const knees = [] as unknown as [V3, V3];
  for (const i of [0, 1] as const) {
    const s = i === 0 ? -1 : 1;
    const hip = add3(hips, scale3(S, s * body.hipHalf));
    // Out to its side hanging down, then forward: the spread holds however far the hip folds.
    const thigh = turn(turn(scale3(U, -1), F, s * p.out), S, -p.hip);
    const knee = add3(hip, scale3(thigh, body.thigh));
    const shin = turn(thigh, S, p.knee);
    const ankle = add3(knee, scale3(shin, body.shin));
    const fwd = turn(shin, S, p.point - 90);
    const up = turn(fwd, S, -90);
    const q = qframe(fwd, up);
    let shoe: ShoePose = { at: sub3(sub3(ankle, scale3(fwd, ANKLE_IN_SHOE.f)), scale3(up, ANKLE_IN_SHOE.u)), q };
    const off = sub3(knee, hip);
    const legAxis = norm3(sub3(ankle, hip));
    let pole = norm3(sub3(off, scale3(legAxis, dot3(off, legAxis))));
    const held = holds.feet[i];
    if (held) {
      shoe = { at: lerp3(shoe.at, held.at.at, held.weight), q: qslerp(shoe.q, held.at.q, held.weight) };
      pole = norm3(lerp3(pole, norm3(add3(F, scale3(S, s * 0.25))), held.weight));
    }
    // Let go of the ground, a leg's kept out of it: the ground swings it back at the hip the least that clears it (as the
    // head's lifted on its neck), rather than taking it in; as much as it's let go.
    const most = LEG_LIFT * legLiftAt(theta);
    const loose = held ? 1 - held.weight : 1;
    const swung = (deg: number) => {
      const fwdS = turn(qrot(shoe.q, { x: 1, y: 0, z: 0 }), S, deg);
      const upS = turn(qrot(shoe.q, { x: 0, y: -1, z: 0 }), S, deg);
      return { shoe: { at: add3(hip, turn(sub3(shoe.at, hip), S, deg)), q: qframe(fwdS, upS) }, pole: turn(pole, S, deg) };
    };
    const gapOf = (deg: number) => {
      const leg = swung(deg);
      return legGap(body, line.ground, hip, leg.shoe, leg.pole);
    };
    let want = 0;
    if (most > 0 && loose > 0 && gapOf(0) < LEG_CLEAR) {
      let lo = 0;
      let hi = most;
      if (gapOf(hi) >= LEG_CLEAR) {
        for (let n = 0; n < 12; n++) {
          const mid = (lo + hi) / 2;
          if (gapOf(mid) >= LEG_CLEAR) hi = mid;
          else lo = mid;
        }
      }
      want = hi;
    }
    clearing.legs[i] = Math.max(0, Math.min(most, toward(was?.legs[i], want)));
    if (clearing.legs[i] > 0 && loose > 0) {
      const leg = swung(clearing.legs[i] * loose);
      shoe = leg.shoe;
      pole = leg.pole;
    }
    shoes[i] = shoe;
    knees[i] = pole;
  }

  // Arms: each hand where the posture reaches it, or toward where it's held; the elbow bent out and back.
  const chest = (f: number, u: number, s: number) => add3(hips, add3(scale3(Ft, f), add3(scale3(Ut, u), scale3(St, s))));
  const armLength = body.upperArm + body.forearm;
  const arms = ([0, 1] as const).map((i) => {
    const s = i === 0 ? -1 : 1;
    const shoulder = chest(body.shoulder.f, body.shoulder.u, s * body.shoulder.s);
    const reach = s === side ? p.lead : p.other;
    let hand = add3(shoulder, scale3(add3(add3(scale3(Ft, reach[0]), scale3(Ut, reach[1])), scale3(St, s * reach[2])), armLength));
    const held = holds.hands[i];
    if (held) hand = lerp3(hand, held.at, held.weight);
    let pole = add3(add3(scale3(St, s * 0.7), scale3(Ut, -0.5)), scale3(Ft, -0.2));
    const k = body.scale;
    const gap = (q: V3, r: number) => line.ground(q.x, q.z) - q.y - r;
    // Kept off the ground: a hand that isn't held there swings up at the shoulder the least that clears it, and the arm
    // turns about the line from its shoulder to its hand the least that lifts the elbow clear.
    {
      const d = sub3(hand, shoulder);
      const lift = cross3(norm3(d), UP);
      if (Math.hypot(lift.x, lift.y, lift.z) > 1e-3) {
        const about = norm3(lift);
        const most = (Math.acos(Math.max(-1, Math.min(1, dot3(norm3(d), UP)))) * 180) / Math.PI;
        const handAt = (deg: number) => add3(shoulder, turn(d, about, deg));
        let want = 0;
        if (holds.handsFree[i] && gap(hand, LIMB.hand * k) < ARM_CLEAR) {
          let lo = 0;
          let hi = most;
          if (gap(handAt(hi), LIMB.hand * k) >= ARM_CLEAR) {
            for (let n = 0; n < 12; n++) {
              const mid = (lo + hi) / 2;
              if (gap(handAt(mid), LIMB.hand * k) >= ARM_CLEAR) hi = mid;
              else lo = mid;
            }
          }
          want = hi;
        }
        clearing.hands[i] = Math.max(0, Math.min(most, toward(was?.hands[i], want)));
        hand = handAt(clearing.hands[i]);
        pole = turn(pole, about, clearing.hands[i]);
      }
    }
    // The elbow bent toward its pole, swung round the shoulder-hand line no faster than the clearing turns: a hand held still
    // with the shoulder going over it would flick it round as that line passed through where the pole points.
    const limb = norm3(sub3(hand, shoulder));
    const offLine = (v: V3) => sub3(v, scale3(limb, dot3(v, limb)));
    let elbow = twoBone(shoulder, hand, body.upperArm, body.forearm, pole);
    const bentWas = was?.elbowsAt[i];
    if (bentWas) {
      const from = offLine(add3(add3(scale3(Ft, bentWas.x), scale3(Ut, bentWas.y)), scale3(St, bentWas.z)));
      const to = offLine(sub3(elbow, shoulder));
      if (dot3(from, from) > 1e-6 && dot3(to, to) > 1e-6) {
        const swing = (Math.atan2(dot3(limb, cross3(from, to)), dot3(from, to)) * 180) / Math.PI;
        const most = CLEARING_RATE / HZ;
        if (Math.abs(swing) > most) elbow = twoBone(shoulder, hand, body.upperArm, body.forearm, turn(from, limb, Math.sign(swing) * most));
      }
    }
    const bent = sub3(elbow, shoulder);
    clearing.elbowsAt[i] = { x: dot3(bent, Ft), y: dot3(bent, Ut), z: dot3(bent, St) };
    // Then turned on round that line off the ground, the least that clears it: no further round than it rises, and only as
    // much as the line's off upright (round an upright one it doesn't rise). It keeps turning the way it was, so an elbow
    // pointing straight down doesn't flick from one way round to the other.
    {
      const centre = add3(shoulder, scale3(limb, dot3(bent, limb)));
      const out = sub3(elbow, centre);
      const upward = offLine(UP);
      const tilt = Math.hypot(upward.x, upward.y, upward.z);
      const turned = (deg: number) => add3(centre, turn(out, limb, deg));
      const elbowGap = (e: V3) => gap(e, LIMB.forearm * k);
      const turnedWas = was?.elbows[i] ?? 0;
      let want = 0;
      if (tilt > 1e-3 && dot3(out, out) > 1e-6 && elbowGap(elbow) < ARM_CLEAR) {
        const up = scale3(upward, 1 / tilt);
        const sign = Math.abs(turnedWas) > 1 ? Math.sign(turnedWas) : dot3(cross3(limb, out), up) >= 0 ? 1 : -1;
        const toUp = (Math.atan2(dot3(limb, cross3(out, up)), dot3(out, up)) * 180) / Math.PI;
        const rises = Math.min(ELBOW_TURN_MOST, sign > 0 ? (toUp >= 0 ? toUp : toUp + 360) : toUp <= 0 ? -toUp : 360 - toUp);
        let lo = 0;
        let hi = rises;
        if (elbowGap(turned(sign * hi)) >= ARM_CLEAR) {
          for (let n = 0; n < 14; n++) {
            const mid = (lo + hi) / 2;
            if (elbowGap(turned(sign * mid)) >= ARM_CLEAR) hi = mid;
            else lo = mid;
          }
        }
        want = sign * hi * smoothstep(tilt / ELBOW_TILT);
      }
      clearing.elbows[i] = Math.max(-ELBOW_TURN_MOST, Math.min(ELBOW_TURN_MOST, toward(was?.elbows[i], want, ELBOW_RATE)));
      elbow = turned(clearing.elbows[i]);
    }
    return { upper: norm3(sub3(elbow, shoulder)), fore: norm3(sub3(hand, elbow)) };
  }) as BodyPose['arms'];

  const pose: BodyPose = { hips, pelvis, torso, head, shoes, knees, arms };
  const rig = rigOf(pose, body, board, 1, 1);
  return { pose, rig, com: centerOfMass(rig), clearing };
}

/** How far a leg's lowest point (its knee, ankle or sole) is off the ground, the shoe and knee posed as given. */
function legGap(body: BodyDims, ground: (x: number, z: number) => number, hip: V3, shoe: ShoePose, pole: V3): number {
  const k = body.scale;
  const ankle = ankleOf(shoe);
  const knee = twoBone(hip, ankle, body.thigh, body.shin, pole);
  const gap = (p: V3, r: number) => ground(p.x, p.z) - p.y - r;
  let low = Math.min(gap(knee, LIMB.knee * k), gap(ankle, LIMB.ankle * k));
  const sole = frameFrom(shoe.at, shoe.q);
  for (const a of [-1, 1]) for (const c of [-1, 1]) low = Math.min(low, gap(sole.at(a * SHOE_HALF_LENGTH, -SHOE_HALF_HEIGHT, c * SHOE_HALF_WIDTH), 0));
  return low;
}

/** The square of the body's radius of gyration about an axis through its center of mass (point masses at each part's middle, limbs as rods). */
function gyration(rig: Rig, com: V3, axis: V3): number {
  const MASS = { head: 0.081, trunk: 0.497, upperArm: 0.028, foreHand: 0.022, thigh: 0.1, shank: 0.0465, foot: 0.0145 };
  let sum = 0;
  const at = (p: V3, m: number, length = 0) => {
    const d = sub3(p, com);
    const a = dot3(d, axis);
    sum += m * (dot3(d, d) - a * a + (length * length) / 12);
  };
  const mid = (a: V3, b: V3) => scale3(add3(a, b), 0.5);
  const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const hips = mid(rig.legs[0].hip, rig.legs[1].hip);
  const neck = mid(rig.arms[0].shoulder, rig.arms[1].shoulder);
  at(mid(hips, neck), MASS.trunk, dist(hips, neck));
  at(rig.head.origin, MASS.head);
  for (const arm of rig.arms) {
    at(mid(arm.shoulder, arm.elbow), MASS.upperArm, dist(arm.shoulder, arm.elbow));
    at(mid(arm.elbow, arm.hand), MASS.foreHand, dist(arm.elbow, arm.hand));
  }
  for (const leg of rig.legs) {
    at(mid(leg.hip, leg.knee), MASS.thigh, dist(leg.hip, leg.knee));
    at(mid(leg.knee, leg.ankle), MASS.shank, dist(leg.knee, leg.ankle));
    at(leg.shoe.origin, MASS.foot);
  }
  return sum;
}

// ----- The roll -----

export interface RollFoot {
  foot: 0 | 1;
  /** When it comes down, and the shoe there. */
  on: number;
  shoe: ShoePose;
}

export interface RollSetup {
  body: BodyDims;
  gravity: number;
  ground: (x: number, z: number) => number;
  /** When the first foot meets the ground, and the hips then. */
  start: number;
  hips: V3;
  velocity: V3;
  /** The way the hips face at the touchdown (level). */
  facing: V3;
  /** The first foot down: which, its shoe's middle flat on the ground, and the way its toe points. */
  first: { foot: 0 | 1; at: V3; heading: V3 };
  /** When the other foot can be down at the earliest. */
  secondFrom: number;
  /** The board, for the rig (the rider's let go of it). */
  board: BoardRig;
}

export interface RollSample {
  pose: BodyPose;
  /** The hips' velocity. */
  velocity: V3;
  theta: number;
  /** What the body's resting on (null: in the air). */
  on: string | null;
}

export interface Roll {
  start: number;
  dt: number;
  samples: RollSample[];
  /** The feet's landing, left and right. */
  landing: [RollFoot, RollFoot];
  /** When the knees have taken the drop and the rider dives, the hands first take the weight, and the roll's done (on the feet, coming up). */
  dive: number;
  hands: number;
  end: number;
  /** The feet, planted, as the roll ends; the hips then, and how fast they're going. */
  exit: { feet: [ShoePose, ShoePose]; hips: V3; velocity: V3 };
  /** Where the body hit the ground hard enough to raise dust: when, where, how hard (0 → 1). */
  hits: { t: number; at: V3; strength: number }[];
  /** Which shoulder it rolled over (1 right, -1 left), and the way it rolled (level). */
  side: 1 | -1;
  travel: V3;
}

interface Held<T> {
  at: T;
  /** When it came down to be held (settling there), if it wasn't held from the start. */
  on?: number;
  /** When it let go (Infinity: still held). */
  off: number;
}

/** Plans the roll from the first foot's touchdown. */
export function rollOut(setup: RollSetup): Roll {
  const { body, gravity: g, ground, board } = setup;
  const leg = body.thigh + body.shin;
  const dt = 1 / HZ;
  const travel = level(setup.velocity);
  const axis = rightOf(travel);
  // Over the shoulder that's ahead as they come down.
  const side: 1 | -1 = dot3(rightOf(setup.facing), travel) >= 0 ? 1 : -1;
  // Facing off the line at the touchdown, then turned and leaning to put that shoulder ahead (the head away from it), then square coming up.
  const yawLand = (Math.atan2(dot3(setup.facing, axis), dot3(setup.facing, travel)) * 180) / Math.PI;
  const into = (theta: number) => smoothstep((theta - LAND_PITCH) / (TURNED_IN - LAND_PITCH));
  // Square again by the time the feet come down, so they come down either side of the hips.
  const outOf = (theta: number) => smoothstep((theta - SQUARE_FROM) / (SQUARE_BY - SQUARE_FROM));
  const line: RollLine = {
    ground,
    travel,
    axis,
    side,
    yaw: (theta) => (yawLand + (-side * ROLL_YAW - yawLand) * into(theta)) * (1 - outOf(theta)),
    bank: (theta) => side * ROLL_BANK * into(theta) * (1 - outOf(theta)),
  };

  // Hands and feet held on the ground, and how much they're held at a time.
  const feet: [Held<ShoePose> | null, Held<ShoePose> | null] = [null, null];
  const hands: [Held<V3> | null, Held<V3> | null] = [null, null];
  const handUsed = [false, false];
  let theta = LAND_PITCH;
  const holdsAt = (t: number): Holds => {
    const weight = (h: Held<unknown>) =>
      h.off === Infinity ? (h.on === undefined ? 1 : smoothstep((t - h.on) / SETTLE_T)) : 1 - smoothstep((t - h.off) / LET_GO_T);
    const of = <T>(h: Held<T> | null): Hold<T> | null => (h && weight(h) > 0 ? { at: h.at, weight: weight(h) } : null);
    const free = (i: 0 | 1) => (handUsed[i] || theta >= HANDS_OFF) && !(hands[i] && weight(hands[i]!) >= 1);
    return { feet: [of(feet[0]), of(feet[1])], hands: [of(hands[0]), of(hands[1])], handsFree: [free(0), free(1)] };
  };
  const planted = (i: 0 | 1) => feet[i] != null && feet[i]!.off === Infinity;

  // ----- The landing -----
  const ankleHeight = ANKLE_IN_SHOE.u + 4;
  const second: 0 | 1 = setup.first.foot === 0 ? 1 : 0;
  const firstShoe: ShoePose = { at: setup.first.at, q: qframe(setup.first.heading, UP) };
  // The other foot comes down beside the first, out to its own side, pointing the same way.
  const across = rightOf(setup.facing);
  const width = (second === 0 ? -1 : 1) * 2 * STEP_WIDTH * body.hipHalf;
  const secondSpot = add3(setup.first.at, scale3(across, width));
  const secondShoe: ShoePose = {
    at: { ...secondSpot, y: setup.first.at.y + ground(secondSpot.x, secondSpot.z) - ground(setup.first.at.x, setup.first.at.z) },
    q: qframe(setup.first.heading, UP),
  };
  const secondOn = Math.max(setup.secondFrom, setup.start + 0.03);
  const landing = [] as unknown as [RollFoot, RollFoot];
  landing[setup.first.foot] = { foot: setup.first.foot, on: setup.start, shoe: firstShoe };
  landing[second] = { foot: second, on: secondOn, shoe: secondShoe };
  feet[setup.first.foot] = { at: firstShoe, off: Infinity };
  feet[second] = { at: secondShoe, off: Infinity };

  const samples: RollSample[] = [];
  const hits: Roll['hits'] = [{ t: setup.start, at: setup.first.at, strength: clamp01(setup.velocity.y / (3 * Math.sqrt(g * leg))) }];
  let step = 0;
  let on: string | null = 'feet';
  const keep = (velocity: V3) => {
    if (step % 2 === 0) samples.push({ pose: shape.pose, velocity, theta, on });
  };

  // The knees take the fall: the hips come down at an even rate onto the deepest squat, carried on over the feet.
  let t = setup.start;
  let p = setup.hips;
  let v = setup.velocity;
  const low = ankleHeight + ROLL_SQUAT * leg;
  const h0 = ground(p.x, p.z) - p.y;
  let shape = shapeAt(body, line, theta, p, holdsAt(t), board, null);
  for (; step < HZ / 2; step++) {
    const h = ground(p.x, p.z) - p.y;
    if ((v.y <= ABSORBED || h <= low + 0.5) && t >= secondOn + 0.02) break;
    const down = landing.filter((f) => f.on <= t + 1e-9).map((f) => f.shoe.at);
    const support = scale3(down.reduce(add3, { x: 0, y: 0, z: 0 }), 1 / down.length);
    const brake = v.y > 0 ? (v.y * v.y) / (2 * Math.max(0.5, h - low)) : 0;
    const lever = (g + brake) / Math.max(1, h);
    const a = { x: lever * (p.x - support.x), y: -brake, z: lever * (p.z - support.z) };
    keep(v);
    v = add3(v, scale3(a, dt));
    p = add3(p, scale3(v, dt));
    t += dt;
    theta = LAND_PITCH + (DIVE_PITCH - LAND_PITCH) * clamp01((h0 - (ground(p.x, p.z) - p.y)) / Math.max(1, h0 - low));
    shape = shapeAt(body, line, theta, p, holdsAt(t), board, shape.clearing);
  }
  const dive = t;

  // ----- The roll -----
  // It turns about the leading point it rests on (a held foot, or the body itself; the hands only cushion it), and flies off nothing.
  const restOf = (all: Touch[]): Touch | null => {
    const resting = all.filter((x) => !isHand(x.part) && x.gap <= TOUCH);
    return resting.length ? resting.reduce((a, b) => (dot3(b.at, travel) > dot3(a.at, travel) ? b : a)) : null;
  };
  const pivotOf = (all: Touch[]): V3 | null => restOf(all)?.at ?? null;
  let com = shape.com;
  let all = touches(shape.rig, body, ground);
  let contact = pivotOf(all) ?? shape.pose.shoes[setup.first.foot].at;
  const rateAbout = (velocity: V3, from: V3) => {
    const r = sub3(com, from);
    const perp = sub3(r, scale3(axis, dot3(r, axis)));
    return dot3(velocity, cross3(axis, perp)) / Math.max(1, dot3(perp, perp));
  };
  /** Over the feet coming up, or rolling. */
  const rateIn = (w: number, rising: boolean) => (rising ? Math.min(RISE_RATE.most, Math.max(RISE_RATE.least, w)) : Math.min(MOST_RATE, Math.max(LEAST_RATE, w)));
  let omega = rateIn(rateAbout(v, contact), false);
  let flying = false;
  let comV = v;
  /**
   * Its speed along the ground rolling on its body (null: on its feet, or in the air). Tucked, it's round: it rolls about
   * the ground under its middle, and the ground's push goes up through that, so only the ground's grip takes the speed it
   * goes along with, turning it into spin (or spin into speed) until it rolls, and rolling takes a little more.
   */
  let carry: number | null = null;
  /** How much of its speed into the ground, coming down onto its body, the ground's still to take. */
  let impact = 0;
  /** Where it was coming up off its back onto its feet from: how far round, and the hips' height. */
  let comingUp: { theta: number; hips: number } | null = null;
  let handsAt = Infinity;
  let end = Infinity;
  /** How far the lowest part that can carry the body is off the ground. */
  let clearance = 0;
  for (; step < 4 * HZ; step++) {
    let turnBy = (omega * dt * 180) / Math.PI;
    let target: V3;
    const upOver = !flying && carry != null && (planted(0) || planted(1));
    if (flying) {
      // Hands down take the fall: the arms give, lowering the body onto whatever comes down next, gently.
      let fall = g;
      if (comV.y > 0 && hands.some((h) => h && h.off === Infinity)) {
        fall -= Math.min(ARM_BRAKE * g, Math.max(0, (comV.y ** 2 - LOWER ** 2) / (2 * Math.max(1, clearance - TOUCH))));
      }
      comV = add3(comV, { x: 0, y: fall * dt, z: 0 });
      target = add3(com, scale3(comV, dt));
    } else if (upOver) {
      // Up over its feet: carried on over them at its speed along (or as the legs turn it up over them), the legs standing
      // the hips up into a crouch by the time it's over them (the knees take what a stiff leg would vault it up by), and the
      // body coming upright as they do.
      const r = sub3(com, contact);
      const hipsUp = ground(p.x, p.z) - p.y;
      if (!comingUp) {
        // The roll's spin is its speed along now: the legs start turning it up over the feet from slow.
        comingUp = { theta, hips: hipsUp };
        omega = RISE_RATE.least;
      }
      const along = Math.max(carry ?? 0, omega * Math.max(1, -r.y));
      const need = ankleHeight + RISE_TO * leg - hipsUp;
      const behind = -dot3(r, travel);
      const most = RISE_UP * Math.sqrt(g * leg);
      // (Easing into the crouch, no harder than gravity slows them: the legs stop pushing, they don't pull.)
      const up = need <= 0 ? 0 : Math.min(most, Math.sqrt(2 * g * need), behind > 1 ? (need * along) / behind : most);
      target = add3(com, add3(scale3(travel, along * dt), scale3(UP, up * dt)));
      const upright = clamp01((hipsUp + up * dt - comingUp.hips) / Math.max(1, ankleHeight + RISE_TO * leg - comingUp.hips));
      turnBy = Math.max(0, Math.min((MOST_RATE * dt * 180) / Math.PI, comingUp.theta + (ROLL_END - comingUp.theta) * upright - theta));
    } else {
      const pivot = carry == null ? contact : { x: com.x, y: ground(com.x, com.z), z: com.z };
      target = add3(pivot, turn(sub3(com, pivot), axis, turnBy));
      // Diving, the legs drive the body off the feet, out of the squat.
      if (theta < FEET_OFF && (planted(0) || planted(1))) target = add3(target, scale3(norm3(sub3(target, contact)), EXTEND * dt));
      // On its body, what of its speed the roll can't carry (turning as fast as it can) it skids on, what it rests on with it.
      if (carry != null) {
        const slid = scale3(travel, Math.max(0, carry - omega * (pivot.y - com.y)) * dt);
        target = add3(target, slid);
        contact = add3(contact, slid);
      }
    }
    theta += turnBy;
    t += dt;
    // Pose there: the hips placed to carry the center of mass where the roll took it, then kept out of the ground.
    const holds = holdsAt(t);
    let hips = add3(p, sub3(target, com));
    let next = shapeAt(body, line, theta, hips, holds, board, shape.clearing);
    hips = add3(hips, sub3(target, next.com));
    if (upOver) {
      // Coming up, the legs ease off as the hips near the crouch they come up into: no faster than carries them up to it.
      const room = Math.max(0, ankleHeight + RISE_TOP * leg - (ground(p.x, p.z) - p.y));
      hips = { ...hips, y: Math.max(hips.y, p.y - Math.sqrt(2 * g * room) * dt) };
    }
    next = shapeAt(body, line, theta, hips, holds, board, shape.clearing);
    all = touches(next.rig, body, ground);
    // What carries the body: not the hands, nor a limb held where it is (it moves only partly with the body).
    const carrying = (x: Touch) => {
      if (isHand(x.part)) return false;
      const l = legOf(x.part);
      const a = armOf(x.part);
      return !(l != null && holds.feet[l]) && !(a != null && holds.hands[a]);
    };
    const lowestFree = () => all.filter(carrying).reduce((a, b) => (b.gap < a.gap ? b : a));
    const footDown = planted(0) || planted(1);
    let lowest = lowestFree();
    // The ground pushing the body out of it (or the body kept down on it) moves it but gives it no speed: the speed into it is lost.
    let stepV = scale3(sub3(target, com), 1 / dt);
    if (lowest.gap < 0) stepV = { ...stepV, y: Math.min(stepV.y, 0) };
    if (lowest.gap < 0 || (!flying && !footDown && lowest.gap < SNAP)) {
      hips = add3(hips, { x: 0, y: lowest.gap, z: 0 });
      next = shapeAt(body, line, theta, hips, holds, board, shape.clearing);
      all = touches(next.rig, body, ground);
      lowest = lowestFree();
    }
    const hipsV = scale3(sub3(hips, p), 1 / dt);
    clearance = lowest.gap;
    let landed = false;
    if (flying && lowest.gap <= TOUCH) {
      // Down onto it: the speed square to the ground is taken, the rest rolls on.
      landed = true;
      flying = false;
      hits.push({ t, at: pivotOf(all) ?? lowest.at, strength: clamp01(comV.y / (2 * Math.sqrt(g * leg))) });
    } else if (!flying && !footDown && lowest.gap > SNAP) {
      flying = true;
      comV = stepV;
    } else if (!flying) {
      comV = stepV;
    }
    com = next.com;
    p = hips;
    shape = next;
    const rising = footDown && theta >= FEET_BACK;
    if (!flying && (!footDown || rising)) {
      if (carry == null) carry = dot3(comV, travel);
      if (!footDown) {
        // On its body, the ground's grip turns its speed along into spin about its middle (or spin into speed) until it
        // rolls, keeping how much it was turning about the ground under it: no more at once than GRIP of how hard it's
        // pressed down. (Turning only as fast as the tuck keeps it going over, it has no spin to spare for speed.)
        const R = Math.max(1, ground(com.x, com.z) - com.y);
        const spin = Math.max(1, gyration(next.rig, com, axis));
        if (landed) impact = Math.max(0, comV.y);
        const press = impact * (1 - Math.exp(-dt / IMPACT_T)) + g * dt;
        impact *= Math.exp(-dt / IMPACT_T);
        const spare = (Math.max(0, omega - LEAST_RATE) * spin) / R;
        const take = Math.max(-GRIP * press, -spare, Math.min(GRIP * press, ((carry - omega * R) * spin) / (spin + R * R)));
        carry -= take;
        omega = rateIn(omega + (take * R) / spin, false);
        carry = Math.max(0, carry - ROLL_DRAG * g * dt);
      } else {
        // Up over its feet, the leg to a foot ahead of it brakes it as a step does (an inverted pendulum: the knees give, so
        // the speed goes into the ground, not up); the legs drive it up over them when that's all it has.
        carry = Math.max(0, carry - ((g * dot3(sub3(contact, com), travel)) / Math.max(1, contact.y - com.y)) * dt);
      }
    } else {
      carry = null;
    }
    // Diving off its feet, onto another part it turns about that keeping how much it was turning about it (the ground pushes
    // through it): its own spin, and its speed round it; the speed toward it is taken. (On its body, and coming up over its
    // feet, its speed along is the carry's.)
    const nextContact = pivotOf(all);
    if (!flying && footDown && !rising && nextContact && (landed || Math.hypot(nextContact.x - contact.x, nextContact.y - contact.y, nextContact.z - contact.z) > 1)) {
      const part = restOf(all)?.part;
      const r = sub3(com, nextContact);
      const reach = dot3(r, r) - dot3(r, axis) ** 2;
      const spin = gyration(next.rig, com, axis);
      const kept = (spin * omega + reach * rateAbout(comV, nextContact)) / Math.max(1, spin + reach);
      omega = rateIn(kept, theta >= FEET_BACK && part != null && footOf(part) != null);
    }
    if (landed) comV = stepV;
    contact = nextContact ?? contact;
    on = flying ? null : restOf(all)?.part ?? null;

    // Hands and feet that meet the ground stay there until the body's gone past them.
    for (const i of [0, 1] as const) {
      const arm = next.rig.arms[i];
      const handGap = all.find((x) => x.part === (i === 0 ? 'hand0' : 'hand1'))!.gap;
      if (!hands[i] && !handUsed[i] && theta < HANDS_OFF && handGap <= TOUCH) {
        hands[i] = { at: { ...arm.hand, y: ground(arm.hand.x, arm.hand.z) - LIMB.hand * body.scale }, off: Infinity };
        handUsed[i] = true;
        handsAt = Math.min(handsAt, t);
        hits.push({ t, at: { ...arm.hand, y: ground(arm.hand.x, arm.hand.z) }, strength: 0.35 });
      }
      const hand = hands[i];
      if (hand && hand.off === Infinity) {
        // It lets go stretched out, or once the body's come down onto the arm (its elbow's down at the ground, held off it).
        const span = Math.hypot(hand.at.x - arm.shoulder.x, hand.at.y - arm.shoulder.y, hand.at.z - arm.shoulder.z);
        const elbowGap = Math.min(...all.filter((x) => x.part === (i === 0 ? 'arm0' : 'arm1')).map((x) => x.gap));
        if (theta >= HANDS_OFF || span > 0.97 * (body.upperArm + body.forearm) || elbowGap <= ARM_CLEAR + 0.05) hand.off = t;
      }
      const foot = feet[i];
      if (foot && foot.off === Infinity) {
        const legRig = next.rig.legs[i];
        const span = Math.hypot(legRig.ankle.x - legRig.hip.x, legRig.ankle.y - legRig.hip.y, legRig.ankle.z - legRig.hip.z);
        if ((theta >= FEET_OFF && theta < FEET_BACK) || span > FEET_STRETCH * leg) foot.off = t;
      } else if (theta >= FEET_BACK) {
        const footGap = Math.min(...all.filter((x) => footOf(x.part) === i).map((x) => x.gap));
        if (footGap <= TOUCH) {
          // Down flat where it meets the ground, pointing the way it's going.
          const fwd = level(qrot(next.pose.shoes[i].q, { x: 1, y: 0, z: 0 }));
          const ankle = ankleOf(next.pose.shoes[i]);
          const q = qframe(dot3(fwd, travel) > 0.2 ? fwd : travel, UP);
          const flat = { x: ankle.x, y: ground(ankle.x, ankle.z) - ankleHeight, z: ankle.z };
          const at = sub3(sub3(flat, qrot(q, { x: ANKLE_IN_SHOE.f, y: 0, z: 0 })), qrot(q, { x: 0, y: -ANKLE_IN_SHOE.u, z: 0 }));
          feet[i] = { at: { at, q }, on: t, off: Infinity };
          hits.push({ t, at: { ...flat, y: ground(flat.x, flat.z) }, strength: 0.3 });
        }
      }
    }

    keep(hipsV);
    if (theta >= ROLL_END && planted(0) && planted(1)) {
      end = t;
      break;
    }

    // On its feet: gravity's torque about what it rests on, the legs' drive, and friction.
    if (!flying && (carry == null || planted(0) || planted(1))) {
      const r = sub3(com, contact);
      const perp = sub3(r, scale3(axis, dot3(r, axis)));
      const inertia = dot3(perp, perp) + gyration(next.rig, com, axis);
      let alpha = (g * dot3(r, travel)) / Math.max(1, inertia) - DRAG - DAMPING * omega;
      const anyFoot = planted(0) || planted(1);
      if (anyFoot && theta < FEET_OFF) alpha += DIVE_PUSH;
      const rising = anyFoot && theta >= FEET_BACK;
      if (rising) alpha += RISE_PUSH;
      omega = rateIn(omega + alpha * dt, rising);
    }
  }
  if (end === Infinity) end = t;
  const last = samples[samples.length - 1];
  // Coming up, how fast the hips are going: over the last few hundredths, not a step's jolt.
  const lastFew = samples.slice(-Math.max(1, Math.round(0.03 / (2 * dt))));
  const exitV = scale3(lastFew.reduce((sum, x) => add3(sum, x.velocity), { x: 0, y: 0, z: 0 }), 1 / lastFew.length);
  return {
    start: setup.start,
    dt: 2 * dt,
    samples,
    landing,
    dive,
    hands: Math.min(handsAt, end),
    end,
    exit: { feet: last.pose.shoes, hips: last.pose.hips, velocity: exitV },
    hits,
    side,
    travel,
  };
}

/** The roll's pose at `t` (held at its ends). */
export function rollAt(roll: Roll, t: number): RollSample {
  const at = Math.max(0, Math.min(roll.samples.length - 1, (t - roll.start) / roll.dt));
  const i = Math.max(0, Math.min(roll.samples.length - 2, Math.floor(at)));
  const k = Math.min(1, at - i);
  const a = roll.samples[i];
  const b = roll.samples[i + 1] ?? a;
  const mixDir = (x: V3, y: V3) => norm3(lerp3(x, y, k));
  const pose: BodyPose = {
    hips: lerp3(a.pose.hips, b.pose.hips, k),
    pelvis: qslerp(a.pose.pelvis, b.pose.pelvis, k),
    torso: qslerp(a.pose.torso, b.pose.torso, k),
    head: qslerp(a.pose.head, b.pose.head, k),
    shoes: [0, 1].map((j) => ({ at: lerp3(a.pose.shoes[j].at, b.pose.shoes[j].at, k), q: qslerp(a.pose.shoes[j].q, b.pose.shoes[j].q, k) })) as BodyPose['shoes'],
    knees: [mixDir(a.pose.knees[0], b.pose.knees[0]), mixDir(a.pose.knees[1], b.pose.knees[1])],
    arms: [0, 1].map((j) => ({ upper: mixDir(a.pose.arms[j].upper, b.pose.arms[j].upper), fore: mixDir(a.pose.arms[j].fore, b.pose.arms[j].fore) })) as BodyPose['arms'],
  };
  return { pose, velocity: lerp3(a.velocity, b.velocity, k), theta: a.theta + (b.theta - a.theta) * k, on: k < 0.5 ? a.on : b.on };
}

/** Coming down faster than this (in √(gravity · leg)) rolls; so does going faster than this along. */
const ROLL_IMPACT = 2.2;
const ROLL_SPEED = 2.0;

/** Whether a landing is too hard or too fast to run out: the knees can't take its fall, or the legs can't keep up with its speed. */
export function rollsOut(velocity: V3, gravity: number, leg: number): boolean {
  const scale = Math.sqrt(gravity * leg);
  return velocity.y > ROLL_IMPACT * scale || Math.hypot(velocity.x, velocity.z) > ROLL_SPEED * scale;
}
