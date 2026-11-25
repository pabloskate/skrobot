import { add3, bisect, clamp01, cross3, dot3, lerp3, norm3, rad, scale3, smoothstep, sub3, turnAbout, type V3 } from '../../math';
import { shiftRig } from '../dynamics';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH, moveFrame, type Rig } from '../skeleton';
import { X0 } from '../trick';
import { ANKLE_IN_SHOE, LIMB_RADII, ankleOf, centerOfMass, poseOf, rigOf, type BodyDims, type BodyPose, type ShoePose } from './body';
import { level, rightOf, turnLevel, UP } from './footing';
import { CHEST, PERSON_SKULL, ROBOT_HEAD, bodyClearance } from './rollOut';
import { IDENTITY, qconj, qframe, qmul, qrot, qslerp, type Quat } from './rotation';
import { legsApart } from './selfContact';
import { legsOnGround } from './washOutPose';

/**
 * Getting up out of a wash out: the rider is down on one hip, still
 * travelling, their spine across the line. The ground takes the low side
 * back and the top carries on, so they roll like a log, chest first: fists
 * in, over the forearms, the far shoulder, and onto the back, as the legs
 * swing round to lead. There the knees draw up, the feet reach for the ground
 * ahead and catch, and what speed is left carries the hips up over them into
 * a squat. Then the rider stands and looks after the board.
 *
 * Every limb is posed off the trunk, by its joints' angles, so the body is
 * one shape that turns and nothing reaches through the chest. The feet only
 * go to the ground (and the knees follow them) from the tuck's own place in
 * front of the hips.
 *
 * Positions are the physics' (y down). Angles in degrees.
 */

type Ground = (x: number, z: number) => number;
const deg = (radians: number) => (radians * 180) / Math.PI;

/** How far from where they stop (in legs) the feet come down: the hips travel that far on, up over them. */
export const WASH_OUT_PLANT = 0.46;
/** Seconds the arms, legs and head take to draw in for the roll. */
const TUCK_T = 0.16;
/** Seconds the legs take to straighten out behind it: longer, a leg folded under the body has further to go. */
const LEGS_T = 0.28;
/** How far out to its side a thigh swings on the way: enough that one folded under a face-down body comes round beside it. */
const THIGH_BOW = 1.6;
/** Seconds its middle takes to come back over the line it's carried along. */
const SETTLE_T = 0.45;
/** Degrees off the line the rider faces once up: after the board. */
const FACE_SLIP = 0.62;

/** A leg off the pelvis: thigh forward of hanging down, out to its side, the knee's bend, and the toes pointed. */
interface LegAngles {
  hip: number;
  out: number;
  knee: number;
  point: number;
}

/** Rolling: all but straight, toes pointed so they trail; one knee a little more bent than the other. */
const LOG: LegAngles = { hip: 12, out: 5, knee: 20, point: 78 };
const LOG_BENT: LegAngles = { hip: 28, out: 5, knee: 46, point: 74 };
/** Knees to the chest, heels under the hips. Stood on its feet, this is the squat the rider comes up through. */
const TUCK: LegAngles = { hip: 92, out: 15, knee: 118, point: 12 };
/** How far through the tumble the knees start to draw up and are tucked, and the feet start out for the ground (they're down at its end). */
const GATHER = { from: 0.5, by: 0.88 } as const;
const REACH_FROM = 0.7;
/** How far through the tumble the body has come round onto its back. */
const ROUND_BY = 0.9;

/** The trunk leaning back on the hips as the feet reach, squatting over them (past upright: leaning in), and stood. */
const SIT = 32;
const SQUAT = 100;
const STOOD = 91;
/** How high the hips stand over the ankles (in legs): the knees stay soft. */
const STAND_HEIGHT = 0.93;
/** The least and most the spine is raised lying down: on a bank it lies along the slope. */
const LIE = { least: -30, most: 35 } as const;
/** The most the head turns off the way the rider faces to look after the board (degrees). */
const LOOK_MOST = 55;

/** An arm off the chest: its upper arm's and forearm's ways along the chest's (fwd, up, out to its own side). */
type ArmAim = { upper: [number, number, number]; fore: [number, number, number] };
/** Fists up in front of the chest, elbows in. */
const GUARD: ArmAim = { upper: [0.62, -0.78, 0.06], fore: [0.62, 0.72, -0.18] };
/** Forearms down under the chest, hands by the chin, as the chest goes over the ground. */
const BRACE: ArmAim = { upper: [0.74, -0.62, 0.16], fore: [0.42, 0.88, -0.14] };
/** Palms down beside the hips, pushing off. */
const PUSH: ArmAim = { upper: [-0.3, -0.9, 0.32], fore: [0.25, -0.95, 0.1] };
/** Out in front over the knees, for balance. */
const BALANCE: ArmAim = { upper: [0.6, -0.76, 0.24], fore: [0.92, -0.36, 0] };
const HANG: ArmAim = { upper: [0.04, -0.98, 0.2], fore: [0.22, -0.97, 0.06] };

/** How far the chin's tucked (the head nodding toward the chest) in the tuck, as the chest goes over the ground, and squatting. */
const NOD = { tuck: 24, prone: -26, squat: -8 } as const;

export interface Recovering {
  /** Seconds since the roll began. */
  since: number;
  /** 0 → 1 through the roll, to the feet coming down; then 0 → 1 as the hips come up over them and the rider stops. */
  turned: number;
  up: number;
  /** Where the rider stops (in the rig's coordinates). */
  rest: V3;
  /** 0 → 1 standing up out of the squat. */
  stand: number;
}

/** How far round (0 → 1) the roll is, `x` of the way through it: it picks up as the shoulder goes down, and runs out onto the back. */
function easedTurn(x: number): number {
  const up = 0.18;
  const down = 0.34;
  const area = 1 - (up + down) / 2;
  if (x < up) return (x * x) / (2 * up) / area;
  if (x < 1 - down) return (x - up / 2) / area;
  return 1 - ((1 - x) * (1 - x)) / (2 * down) / area;
}

/** The trunk's frame, lying along `heading` raised `elev` off the ground and turned `spin` about its spine. */
function trunkAt(heading: V3, elev: number, spin: number, way: number): { fwd: V3; up: V3 } {
  const c = Math.cos(rad(elev));
  const s = Math.sin(rad(elev));
  const up = add3(scale3(heading, c), scale3(UP, s));
  const chest = add3(scale3(UP, c), scale3(heading, -s));
  return { fwd: turnAbout(chest, up, way * spin), up };
}

/** A sole flat on the ground at `at`, toes along `heading`, lying across whatever slope is under it. */
function setFoot(at: V3, heading: V3, ground: Ground): ShoePose {
  const side = rightOf(heading);
  const slope = (v: V3) => (ground(at.x + v.x, at.z + v.z) - ground(at.x - v.x, at.z - v.z)) / 2;
  const forwardSlope = slope(heading);
  const sideSlope = slope(side);
  const normal = add3(UP, add3(scale3(heading, forwardSlope), scale3(side, sideSlope)));
  const q = qframe({ ...heading, y: forwardSlope }, normal);
  let y = Infinity;
  for (const x of [-SHOE_HALF_LENGTH, SHOE_HALF_LENGTH]) for (const z of [-SHOE_HALF_WIDTH, SHOE_HALF_WIDTH]) {
    const corner = qrot(q, { x, y: SHOE_HALF_HEIGHT, z });
    y = Math.min(y, ground(at.x + corner.x, at.z + corner.z) - corner.y);
  }
  return { at: { ...at, y }, q };
}

/** A leg's thigh and shin (unit, in the pelvis' own axes: x forward, y down, z to the right) and its shoe's turn off the pelvis, for its joints' angles. */
function legOf(angles: LegAngles, sign: number): { thigh: V3; shin: V3; shoe: Quat } {
  const side = { x: 0, y: 0, z: 1 };
  const fwd = { x: 1, y: 0, z: 0 };
  const thigh = turnAbout(turnAbout({ x: 0, y: 1, z: 0 }, fwd, sign * angles.out), side, -angles.hip);
  const shin = turnAbout(thigh, side, angles.knee);
  const toe = turnAbout(shin, side, angles.point - 90);
  return { thigh, shin, shoe: qframe(toe, turnAbout(toe, side, -90)) };
}

const mix = (a: V3, b: V3, k: number) => norm3(lerp3(a, b, k));
/**
 * From pointing along `a` to along `b`, bowed toward `side`: where the two are opposed (a leg folded under the body that
 * has to straighten, an arm behind the back that has to come to the chest) it goes round that way, not straight through
 * whatever's between them.
 */
const round = (a: V3, b: V3, k: number, side: V3, bow = 0.6) => {
  const via = norm3(add3(add3(a, b), scale3(side, bow)));
  return mix(mix(a, via, k), mix(via, b, k), k);
};
const aim = (a: ArmAim, sign: number) => ({
  upper: norm3({ x: a.upper[0], y: -a.upper[1], z: sign * a.upper[2] }),
  fore: norm3({ x: a.fore[0], y: -a.fore[1], z: sign * a.fore[2] }),
});

/**
 * How far off the ground the body's two ends are at their lowest: the shoulders, upper chest, head and the arms folded
 * against it; and the hips and lower chest, with the legs as far as they're laid out `straight` behind them (1 → 0: drawn
 * up, they aren't what it lies on).
 */
function trunkEnds(rig: Rig, body: BodyDims, ground: Ground, straight: number): { head: number; tail: number } {
  const k = body.scale;
  const gap = (p: V3, r: number) => ground(p.x, p.z) - p.y - r;
  const { torso, head } = rig;
  const inner = CHEST.half.map(h => (h - CHEST.r) * k);
  const chest = (end: number) => {
    let low = Infinity;
    for (const f of [-1, 1]) for (const s of [-1, 1]) low = Math.min(low, gap(torso.at(f * inner[0], CHEST.raise * k + end * inner[1], s * inner[2]), CHEST.r * k));
    return low;
  };
  let top = Math.min(chest(1), ...rig.arms.map(arm => Math.min(
    gap(arm.shoulder, LIMB_RADII.upperArm * k), gap(arm.elbow, LIMB_RADII.forearm * k), gap(arm.hand, LIMB_RADII.hand * k),
  )));
  if (k === 1) {
    const box = ROBOT_HEAD.half.map(h => h - ROBOT_HEAD.r);
    for (const f of [-1, 1]) for (const u of [-1, 1]) for (const s of [-1, 1]) top = Math.min(top, gap(head.at(f * box[0], u * box[1], s * box[2]), ROBOT_HEAD.r));
  } else {
    top = Math.min(top, gap(head.at(PERSON_SKULL.f, PERSON_SKULL.u, 0), PERSON_SKULL.r));
  }
  const legs = Math.min(...rig.legs.map(l => Math.min(gap(l.knee, LIMB_RADII.knee * k), gap(l.ankle, LIMB_RADII.ankle * k))));
  const tail = Math.min(chest(-1), ...rig.legs.map(l => gap(l.hip, LIMB_RADII.hip * k)));
  return { head: top, tail: Math.min(tail, legs + (1 - straight) * (body.thigh + body.shin)) };
}

/** The rider `at` this far through getting up, from the pose the fall left them in. */
export function recoverWashOut(impact: Rig, dims: BodyDims, travel: V3, side: number, ground: Ground, at: Recovering): Rig {
  const from = poseOf(impact);
  const leg = dims.thigh + dims.shin;
  const slip = scale3(rightOf(travel), side);
  const facing = level(add3(travel, scale3(slip, FACE_SLIP)));
  const right = rightOf(facing);
  const board = impact.board;
  const rigFor = (pose: BodyPose) => rigOf(pose, dims, board, impact.toeDir, 1);

  const tuck = smoothstep(at.since / TUCK_T);
  const laid = smoothstep(at.since / LEGS_T);
  const gather = smoothstep((at.turned - GATHER.from) / (GATHER.by - GATHER.from));
  const reach = smoothstep((at.turned - REACH_FROM) / (1 - REACH_FROM));
  const over = smoothstep(at.up);
  const stand = at.stand;

  // ----- The trunk: where its spine points, how far it's raised, and how far round it it's turned -----
  const spine0 = impact.torso.up;
  const elev0 = deg(Math.asin(Math.max(-1, Math.min(1, dot3(spine0, UP)))));
  const flat0 = sub3(spine0, scale3(UP, dot3(spine0, UP)));
  const yaw0 = Math.hypot(flat0.x, flat0.z) > 0.05 ? deg(Math.atan2(-dot3(flat0, travel), -dot3(flat0, slip))) : 0;
  const headingAt = (yaw: number) => add3(scale3(slip, -Math.cos(rad(yaw))), scale3(travel, -Math.sin(rad(yaw))));
  // The ground under the body takes the lowest part back; the top carries on. Chest first, down the line.
  const way = Math.sign(dot3(cross3(scale3(slip, -1), UP), travel)) || 1;
  const chest0 = trunkAt(headingAt(yaw0), elev0, 0, way).fwd;
  let spin0 = way * deg(Math.atan2(dot3(spine0, cross3(chest0, impact.torso.fwd)), dot3(chest0, impact.torso.fwd)));
  if (spin0 < -120) spin0 += 360;
  if (spin0 > 240) spin0 -= 360;
  const yawUp = deg(Math.atan2(dot3(facing, travel), dot3(facing, slip)));
  const spin = spin0 + (360 - spin0) * easedTurn(clamp01(at.turned / ROUND_BY));
  const heading = headingAt(yaw0 + (yawUp - yaw0) * smoothstep((at.turned - 0.3) / 0.7));
  const prone = smoothstep((spin - 95) / 55) * (1 - smoothstep((spin - 215) / 55));
  // Once up, the head turns after the board.
  const toBoard = sub3(board.center, at.rest);
  const bearing = deg(Math.atan2(dot3(toBoard, right), dot3(toBoard, facing)));
  // (Not over a shoulder at one right behind: there's no side to turn to.)
  const glance = Math.max(-LOOK_MOST, Math.min(LOOK_MOST, bearing)) * clamp01((180 - Math.abs(bearing)) / 60);
  const looking = smoothstep((stand - 0.35) / 0.55);

  const torso0 = from.torso;
  const pelvis0 = from.pelvis;
  const inChest = (v: V3) => qrot(qconj(torso0), v);
  const inPelvis = (v: V3) => qrot(qconj(pelvis0), v);
  const shoeAt = (ankle: V3, q: Quat) => sub3(ankle, qrot(q, { x: ANKLE_IN_SHOE.f, y: -ANKLE_IN_SHOE.u, z: 0 }));

  const headOff = inChest(sub3(impact.head.origin, rigFor(from).head.origin));

  /** The body lying with its spine raised `lie` off level (the trunk sat up, squatting and stood from there), with its hips at a point. */
  const bodyAt = (lie: number) => {
    const sat = lie + (SIT - lie) * reach;
    const squat = sat + (SQUAT - sat) * over;
    const trunk = trunkAt(heading, squat + (STOOD - squat) * stand, spin, way);
    const torso = qframe(trunk.fwd, trunk.up);
    const pelvis = qmul(torso, qslerp(qmul(qconj(torso0), pelvis0), IDENTITY, tuck));

    // The head: chin in on its back, up as the chest goes over the ground.
    const nod = (NOD.tuck + (NOD.prone - NOD.tuck) * prone) * (1 - over) + NOD.squat * over * (1 - stand);
    const nodded = qframe(
      mix(add3(scale3(trunk.fwd, Math.cos(rad(nod))), scale3(trunk.up, -Math.sin(rad(nod)))), turnLevel(facing, glance), looking),
      add3(scale3(trunk.up, Math.cos(rad(nod))), scale3(trunk.fwd, Math.sin(rad(nod)))),
    );
    const head = qmul(nodded, qslerp(qmul(qconj(nodded), qmul(torso, qmul(qconj(torso0), from.head))), IDENTITY, tuck));
    // The fall holds the head where its neck bent to; it comes back over the neck as the chin tucks.
    const headShift = scale3(qrot(torso, headOff), 1 - tuck);

    // The legs, off the pelvis: straight to roll, then drawn up.
    const legs = ([0, 1] as const).map(i => {
      const sign = i === 0 ? -1 : 1;
      const hip0 = add3(from.hips, qrot(pelvis0, { x: 0, y: 0, z: sign * dims.hipHalf }));
      const ankle0 = ankleOf(from.shoes[i]);
      const knee0 = impact.legs.find(l => l.side === (i === 0 ? 'left' : 'right'))!.knee;
      const log = (sign > 0) === (side > 0) ? LOG_BENT : LOG;
      const want = legOf({
        hip: log.hip + (TUCK.hip - log.hip) * gather, out: log.out + (TUCK.out - log.out) * gather,
        knee: log.knee + (TUCK.knee - log.knee) * gather, point: log.point + (TUCK.point - log.point) * gather,
      }, sign);
      return {
        sign,
        // A thigh swings out round its own side of the hip (face down, the ground's in front of it), and a shin under the knee.
        thigh: qrot(pelvis, round(inPelvis(norm3(sub3(knee0, hip0))), want.thigh, laid, { x: 0.3, y: 0, z: sign }, THIGH_BOW)),
        shin: qrot(pelvis, round(inPelvis(norm3(sub3(ankle0, knee0))), want.shin, laid, { x: 0, y: 1, z: 0 })),
        shoe: qmul(pelvis, qslerp(qmul(qconj(pelvis0), from.shoes[i].q), want.shoe, laid)),
      };
    });

    // The arms, off the chest.
    const arms = ([0, 1] as const).map(i => {
      const sign = i === 0 ? -1 : 1;
      let want = aim(GUARD, sign);
      const blend = (to: ArmAim, k: number) => {
        const b = aim(to, sign);
        want = { upper: mix(want.upper, b.upper, k), fore: mix(want.fore, b.fore, k) };
      };
      blend(BRACE, prone);
      blend(PUSH, reach * (1 - over));
      blend(BALANCE, over);
      blend(HANG, stand);
      // An arm that was braced behind the back comes round its own side to the front.
      const out = { x: 0.1, y: 0.45, z: sign };
      return {
        upper: qrot(torso, round(inChest(from.arms[i].upper), want.upper, tuck, out)),
        fore: qrot(torso, round(inChest(from.arms[i].fore), want.fore, tuck, out)),
      };
    }) as BodyPose['arms'];

    const pose = (hips: V3): BodyPose => {
      const shoes = [] as unknown as BodyPose['shoes'];
      const knees = [] as unknown as BodyPose['knees'];
      for (const [i, l] of legs.entries()) {
        const hip = add3(hips, qrot(pelvis, { x: 0, y: 0, z: l.sign * dims.hipHalf }));
        const knee = add3(hip, scale3(l.thigh, dims.thigh));
        const ankle = add3(knee, scale3(l.shin, dims.shin));
        shoes[i] = { at: shoeAt(ankle, l.shoe), q: l.shoe };
        const line = norm3(sub3(ankle, hip));
        const off = sub3(knee, hip);
        knees[i] = norm3(sub3(off, scale3(line, dot3(off, line))));
      }
      return { hips, pelvis, torso, head, shoes, knees, arms };
    };
    return { pose, headShift };
  };

  // ----- Lying down: the trunk rests on both its ends, whatever the ground's slope -----
  const probe = from.hips;
  const tilt = (lie: number) => {
    const ends = trunkEnds(rigFor(bodyAt(lie).pose(probe)), dims, ground, laid * (1 - gather));
    return ends.tail - ends.head;
  };
  const flat = reach >= 1 ? 0 : tilt(LIE.most) > 0 ? LIE.most : tilt(LIE.least) <= 0 ? LIE.least : bisect(LIE.least, LIE.most, 8, lie => tilt(lie) <= 0).hi;
  const body = bodyAt(elev0 + (flat - elev0) * tuck);

  // Its middle follows the line it's carried along (the fall leaves it a little off it).
  const middle = centerOfMass(rigFor(body.pose({ x: 0, y: 0, z: 0 })));
  const start = centerOfMass(impact);
  const onLine = smoothstep(at.since / SETTLE_T);
  let hips = { x: start.x + (X0 - start.x) * onLine - middle.x, y: from.hips.y, z: start.z * (1 - onLine) - middle.z };
  // Wherever the fall left it held off the ground, it comes down onto it as it's drawn in.
  const ends = trunkEnds(rigFor(body.pose(hips)), dims, ground, laid * (1 - gather));
  const held = Math.min(ends.head, ends.tail);
  hips = { ...hips, y: hips.y + (held > 0 ? held * tuck : held) };

  // ----- Onto the feet: each sole comes down ahead, and the hips ride up over them -----
  const feet = ([0, 1] as const).map(i => {
    const sign = i === 0 ? -1 : 1;
    const lead = (sign > 0) === (dot3(right, slip) > 0);
    const spot = add3(at.rest, add3(scale3(right, sign * 0.17 * leg), scale3(facing, (lead ? 0.17 : 0.07) * leg)));
    return setFoot(spot, turnLevel(facing, sign * 9), ground);
  });
  const ankles = feet.map(ankleOf);
  const between = lerp3(ankles[0], ankles[1], 0.5);
  // Squatting, the tuck stands on its own heels: the hips sit where that puts them over the planted ankles.
  const upright = trunkAt(headingAt(yawUp), SQUAT, 0, way);
  const squatLeg = legOf(TUCK, 1);
  const heel = qrot(qframe(upright.fwd, upright.up), add3(scale3({ ...squatLeg.thigh, z: 0 }, dims.thigh), scale3({ ...squatLeg.shin, z: 0 }, dims.shin)));
  if (over > 0) {
    const up = lerp3(sub3(between, heel), add3(between, scale3(UP, STAND_HEIGHT * leg)), stand);
    hips = { x: hips.x + (up.x - hips.x) * over, y: Math.min(hips.y, hips.y + (up.y - hips.y) * over), z: hips.z + (up.z - hips.z) * over };
  }
  const pose = body.pose(hips);
  for (const i of [0, 1] as const) {
    if (reach <= 0) break;
    const sign = i === 0 ? -1 : 1;
    pose.shoes[i] = { at: lerp3(pose.shoes[i].at, feet[i].at, reach), q: qslerp(pose.shoes[i].q, feet[i].q, reach) };
    pose.knees[i] = mix(pose.knees[i], norm3(add3(add3(scale3(facing, 0.6), scale3(right, sign * 0.4)), UP)), reach);
    // A foot the hips haven't come within a leg of yet stays as far out toward its place as the leg reaches.
    const hip = add3(hips, qrot(pose.pelvis, { x: 0, y: 0, z: sign * dims.hipHalf }));
    const span = sub3(ankleOf(pose.shoes[i]), hip);
    const far = Math.hypot(span.x, span.y, span.z);
    const most = 0.985 * leg;
    if (far > most) pose.shoes[i].at = add3(pose.shoes[i].at, scale3(span, most / far - 1));
  }
  const free = tuck * (1 - reach);
  const posed = rigFor(pose);
  posed.head = moveFrame(posed.head, body.headShift);
  const rig = legsOnGround(legsApart(posed, dims, free), dims, ground, free);
  // Whatever's still in the ground lifts the body out of it.
  return { ...shiftRig(rig, { x: 0, y: Math.min(0, bodyClearance(rig, dims, ground)), z: 0 }), board };
}
