import { wheelRoll } from '../board/board';
import { ASPHALT } from '../camera/view';
import { add3, clamp01, dot3, lerp3, norm3, scale3, smoothstep, sub3, turnAbout, type V3 } from '../math';
import { carriedRig, shiftRig } from '../motion/dynamics';
import { boardSimulation, type BoardTrack } from '../motion/fall/boardBody';
import { qbasis } from '../motion/fall/rotation';
import type { Rig } from '../motion/skeleton';
import { WASH_OUT_ROLL_END, WASH_OUT_ROLL_START, X0 } from '../motion/trick';
import { terrainSurface } from '../sets/terrain';
import { GRAVITY } from '../units';
import type { StairPlan } from './drop';
import { boardClearance, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';

/** Degrees the rolling end points off the incoming line at a straight landing. */
const CATCH_ANGLE = 15;
const HZ = 120;
const GRIP = 0.6;
/** Rolling over, the ground takes less of the rider's speed than it does skidding on a hip. */
const ROLL_GRIP = 0.3;
/** The load transfers to the ground as the hands and hip come down. */
const CONTACT = 0.32;
const LOAD_TIME = 0.10;

export const spotGround = (stairs: StairPlan, x: number, z: number) =>
  ASPHALT - terrainSurface(stairs.terrain, x - X0, z);

/** Turn the caught rider and deck about the deck center, keeping both soles on the grip. */
export function turnCatch(rig: Rig, yaw: number, axis: V3): Rig {
  const turn = (v: V3) => turnAbout(v, axis, yaw);
  const pivot = rig.board.center;
  const turned = carriedRig(rig, p => add3(pivot, turn(sub3(p, pivot))), turn);
  return {
    ...turned,
    board: { ...turned.board, yawDeg: rig.board.yawDeg + yaw },
    bodyYawDeg: rig.bodyYawDeg + yaw,
    headYawDeg: rig.headYawDeg + yaw,
  };
}

interface WashOutMotion {
  travel: V3;
  yaw: number;
  side: number;
  boardUntil: (t: number) => BoardTrack;
  axis: V3;
  /** The spot position followed under the rider. Height continues ballistically off a raised edge. */
  path: RollSample[];
}

interface RollSample extends V3 {
  /** How far along the ground the rider still has to travel before they stop. */
  left: number;
}

const plans = new WeakMap<StagePlan, WashOutMotion>();

export function washOutMotion(stage: StagePlan, stairs: StairPlan, ridden: (t: number) => StageFrame): WashOutMotion {
  const known = plans.get(stage);
  if (known) return known;
  const touch = ridden(stairs.land);
  const velocity = { ...stairs.velocity, y: 0 };
  const travel = norm3(velocity);
  // Choose the rolling end, whether the nose or the tail landed leading.
  const nose = touch.rig.board.dir({ x: 1, y: 0, z: 0 });
  const lead = scale3(nose, dot3(nose, travel) < 0 ? -1 : 1);
  const offLine = Math.atan2(lead.z * travel.x - lead.x * travel.z, dot3(lead, travel));
  // A diagonal entry can already be well across its course. Keep the visible
  // catch error small there and let the wheels' actual bearing set the fall side.
  const bearing = offLine * 180 / Math.PI;
  const yaw = Math.max(-CATCH_ANGLE, Math.min(CATCH_ANGLE, bearing - stage.mechanics.orientationSign * CATCH_ANGLE));
  const side = Math.sign(bearing - yaw) || stage.mechanics.orientationSign;
  const origin = { x: touch.scroll, y: 0, z: touch.stairs!.across };
  // The trucks turn in the landing plane; yawing about the vertical on a bank would lift a wheel.
  const axis = touch.rig.board.dir({ x: 0, y: 1, z: 0 });
  const caught = shiftRig(turnCatch(touch.rig, yaw, axis), origin);
  const ground = (x: number, z: number) => spotGround(stairs, x, z);
  const seat = boardClearance(caught, p => ground(p.x, p.z));
  const b = caught.board;
  const grade = (x: number, z: number, dx = 1, dz = 0) => {
    // At a raised lip the board flies off it. Only continuous slopes have a tangent here.
    const g = (ground(x + dx, z + dz) - ground(x - dx, z - dz)) / 2;
    return Math.abs(g) < 1.5 ? g : 0;
  };
  const descent = grade(b.center.x, b.center.z) * velocity.x + grade(b.center.x, b.center.z, 0, 1) * velocity.z;
  const boardUntil = boardSimulation({
    center: { ...b.center, y: b.center.y + seat },
    q: qbasis(b.dir({ x: 1, y: 0, z: 0 }), b.dir({ x: 0, y: 1, z: 0 }), b.dir({ x: 0, y: 0, z: 1 })),
    wheel: touch.wheels.angle,
    velocity: { ...velocity, y: descent },
    spin: { x: 0, y: 0, z: 0 },
  }, stairs.land, {
    gravity: GRAVITY, ground,
    slope: stairs.terrain.slope ? (x, z) => grade(x, z) : undefined,
    drag: stairs.terrain.brush ? (x, z) => stairs.terrain.brush!(x - X0, z) : undefined,
  });

  // The impact carries the rider along the incoming course. Pavement takes speed
  // out of the shoulder roll; off the edge of a bank there's no traction in the air.
  let vx = velocity.x;
  let vz = velocity.z;
  let pos = { ...origin, y: ground(origin.x + X0, origin.z) };
  let vy = descent;
  let supported = true;
  const path: RollSample[] = [{ ...pos, left: 0 }];
  for (let i = 1; i <= Math.ceil(WASH_OUT_ROLL_END * HZ); i++) {
    const elapsed = i / HZ;
    const x = pos.x + X0;
    const z = pos.z;
    const dx = grade(x, z);
    const dz = grade(x, z, 0, 1);
    const load = smoothstep((elapsed - CONTACT) / LOAD_TIME);
    const drag = stairs.terrain.brush?.(pos.x, z) ?? 0;
    const g = supported ? GRAVITY / (1 + dx * dx + dz * dz) : 0;
    const ux = vx + g * dx / HZ;
    const uz = vz + g * dz / HZ;
    const speed = Math.hypot(ux, uz);
    // As the tuck opens, a hand and then the feet brake whatever speed the
    // roll has left. Arrive at the plant at rest, including on fast downslopes.
    const toPlant = Math.max(1 / HZ, WASH_OUT_ROLL_END - (i - 1) / HZ);
    const plant = supported && elapsed > WASH_OUT_ROLL_START ? 1 / toPlant : 0;
    const grip = GRIP + (ROLL_GRIP - GRIP) * smoothstep((elapsed - WASH_OUT_ROLL_START) / LOAD_TIME);
    const remaining = Math.max(0, 1 - (Math.max(g * grip * load / Math.max(1, speed), plant) + drag) / HZ);
    const nextX = pos.x + (vx + ux * remaining) / (2 * HZ);
    const nextZ = pos.z + (vz + uz * remaining) / (2 * HZ);
    const floor = ground(nextX + X0, nextZ);
    const falling = pos.y + vy / HZ + GRAVITY / (2 * HZ * HZ);
    supported = falling >= floor - 0.03;
    const y = supported ? floor : falling;
    vx = ux * remaining;
    vz = uz * remaining;
    vy = supported ? (y - pos.y) * HZ : vy + GRAVITY / HZ;
    pos = { x: nextX, y, z: nextZ };
    path.push({ ...pos, left: 0 });
  }
  for (let i = path.length - 2; i >= 0; i--) {
    path[i].left = path[i + 1].left + Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
  }
  const plan = { travel, yaw, side, axis, boardUntil, path };
  plans.set(stage, plan);
  return plan;
}

export function washOutPosition(path: RollSample[], elapsed: number): RollSample {
  const sample = Math.min(path.length - 1, Math.max(0, elapsed * HZ));
  const i = Math.min(path.length - 2, Math.floor(sample));
  const a = path[i], b = path[i + 1];
  const k = sample - i;
  return { ...lerp3(a, b, k), left: a.left + (b.left - a.left) * k };
}

/** Seconds after the landing the rider comes within `left` of where they stop. */
export function washOutClock(path: RollSample[], left: number): number {
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].left > left) lo = mid;
    else hi = mid;
  }
  const span = path[lo].left - path[hi].left;
  return (lo + (span > 1e-9 ? clamp01((path[lo].left - left) / span) : 1)) / HZ;
}

/** Airborne wheels still coast on their approach spin up to the instant of contact. */
export const approachWheelRate = (stage: StagePlan, stairs: StairPlan) => wheelRoll(stairs.speed, Infinity, stage.spec.dir, 0);
