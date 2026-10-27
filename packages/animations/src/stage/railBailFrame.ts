import { wheelRoll } from '../board/board';
import { clearFeet } from '../board/footContact';
import { fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { smoothstep, type V3 } from '../math';
import { bodyDims } from '../motion/fall/body';
import { boardAt, boardRigOf } from '../motion/fall/boardBody';
import { TAKEOVER_LEAD, hipsAt, kickOutAt, planKickOut, type KickOutPlan, type KickOutSetup } from '../motion/fall/kickOut';
import { UP } from '../motion/fall/footing';
import { handrailHeight, railTopY, railTrack, travel, type GrindPlan } from '../motion/grind';
import { BAR_HALF, BAR_TOP_Y, BAR_Z } from '../motion/grindDefinitions';
import { solveGrindRig } from '../motion/grindRig';
import { GROUND, X0 } from '../motion/trick';
import { barShadowParts } from '../sets/bar';
import { GRAVITY } from '../units';
import { ROLL_ABOVE } from '../motion/fall/railBail';
import { craneDownhill, ledgeAcross, placeOnLedge, railRig, shadowLevel, shiftRig } from './downhill';
import { followAt, followRider, lowestOver, SHADOW_SEAM_T, type Follow } from './kickOutFrame';
import { groundHull, grownBy, kickedUp, onTheGround, posed, riderShadows, type StageFrame } from './frameParts';
import type { StagePlan } from './stage';

/**
 * A bail off a rail on the stage (motion/fall/railBail.ts): up to the jump
 * it's the grind ridden as landed (stage.ts draws the flat bar's frames,
 * downhill.ts a handrail's); from the jump the rider and board are the
 * kick-out's (motion/fall/kickOut.ts), thrown off by the legs, worked out
 * where they really are (along the street past a flat bar, or down a
 * handrail's stairs, in the rail's own frame), with the rail solid under the
 * board, and moved back into the frame by a camera that follows the rider.
 * A ledge at an angle (Miami's) is worked out in its own frame and laid onto
 * the set's as its grind is.
 */

interface Planned {
  plan: KickOutPlan;
  follow: Follow;
  /** When the board first comes down on the ground, off the rail. */
  boardDown: number;
  /** How much darker the grind's shadows were than the bail's at the jump (they're measured differently). */
  seam?: { board: number; body: number };
}

const plans = new WeakMap<StagePlan, Planned>();

/** How near (world units) a board's lowest point is to the ground as it first comes down on it. */
const DOWN_WITHIN = 2;
/** Seconds a board left on a ledge's top takes to be off it, at the least. */
const LEDGE_LEAVE = 0.2;

/** The rail's top under (x, z) in the frame a setup's positions are in, or Infinity off it. */
function railTop(grind: GrindPlan, x: number, z: number, y: number): number {
  const ride = grind.handrail;
  if (!ride) {
    // The flat bar along the street, square; a point under its middle is beside it or below it, not on it.
    const a = X0 + grind.spec.dir * grind.barStart;
    const b = X0 + grind.spec.dir * grind.barEnd;
    if (x < Math.min(a, b) || x > Math.max(a, b) || Math.abs(z - BAR_Z) > BAR_HALF || y > BAR_TOP_Y + BAR_HALF) return Infinity;
    return BAR_TOP_Y;
  }
  const { rail } = ride;
  const s = x - X0;
  if (s < rail.start || s > rail.end || Math.abs(z) > rail.radius) return Infinity;
  // A round pipe, seen across: its top falls away either side of the line; under its axis, a point's past it.
  const k = Math.hypot(1, rail.slope);
  const top = railTopY(rail, s);
  if (y > top + rail.radius * k) return Infinity;
  return top + (rail.radius - Math.sqrt(rail.radius * rail.radius - z * z)) * k;
}

/** Which way the street (+x) or the rail (downhill) the grind's way of travel is, in the setup's frame, and across. */
function frameOf(stage: StagePlan) {
  const grind = stage.grind!;
  const reversed = grind.handrail != null && grind.spec.dir === -1;
  return {
    // Down a handrail every grind is turned round to go downhill (+x); along a flat bar the street runs either way.
    along: grind.handrail ? 1 : grind.spec.dir,
    // A turned-round grind has its across turned too.
    across: (reversed ? -1 : 1) as 1 | -1,
  };
}

/** The rider and board as the grind has them at clock `t`, ridden as landed, posed, in the setup's frame. */
function grindRigAt(stage: StagePlan, t: number) {
  const grind = stage.grind!;
  if (grind.handrail) {
    const { rig, u } = railRig(stage, grind, t);
    return shiftRig(rig, { x: u, y: 0, z: 0 });
  }
  const solved = solveGrindRig(t, grind, stage.mechanics, stage.style, grownBy(stage.skater));
  return shiftRig(posed(clearFeet(onTheGround(solved.rig)), stage.skater), { x: travel(t) * grind.spec.dir, y: 0, z: 0 });
}

/** The street's scroll, or how far down the rail the frame's middle is, at clock `t` ridden as landed. */
const scrollAt = (stage: StagePlan, t: number) => (stage.grind!.handrail ? railTrack(stage.grind!, t) : travel(t) * stage.grind!.spec.dir);

/** Physics height of the ground under a point in the setup's frame. */
function groundOf(grind: GrindPlan): (x: number, z: number) => number {
  const ride = grind.handrail;
  if (!ride) return () => ASPHALT;
  return (x, z) => ASPHALT - ride.rail.ground(x - X0, z);
}

function setupFor(stage: StagePlan): KickOutSetup {
  const grind = stage.grind!;
  const bail = stage.railBail!;
  const way = frameOf(stage);
  const ground = groundOf(grind);
  // A ledge's top is its ground already; a rail or the bar stands up out of it.
  const boardGround = grind.handrail?.rail.ledge ? ground : (x: number, z: number, y: number) => Math.min(ground(x, z), railTop(grind, x, z, y));
  const { up, along, out } = bail.jump;
  const jump: V3 = { x: way.along * along, y: 0, z: way.across * bail.side * out };
  return {
    style: stage.style,
    body: bodyDims(stage.skater),
    regular: (t) => grindRigAt(stage, t),
    wheel: (t) => wheelRoll(Math.abs(scrollAt(stage, t)), Infinity, grind.spec.dir, 0),
    pop: grind.pop,
    glued: true,
    gravity: GRAVITY,
    ground,
    catchAt: bail.at + TAKEOVER_LEAD,
    touchdown: bail.down,
    end: stage.end,
    jump: { x: jump.x + UP.x * up, y: UP.y * up, z: jump.z },
    boardGround,
    // A rail's top falls away downhill: a board riding it goes on down it, not stopped as on level ground.
    boardSlope: grind.handrail && !grind.handrail.rail.ledge ? (x: number, z: number, y: number) => (railTop(grind, x, z, y) < ground(x, z) ? grind.handrail!.rail.slope : 0) : undefined,
    rollAbove: ROLL_ABOVE,
  };
}

/** The bail planned for a stage, once, with the camera that follows it. */
function planned(stage: StagePlan): Planned {
  const known = plans.get(stage);
  if (known) return known;
  const grind = stage.grind!;
  const plan = planKickOut(setupFor(stage));
  const h = 1 / 240;
  const { takeover } = plan;
  const scroll = (t: number) => scrollAt(stage, t);
  // A ledge's frame follows the board across its line as well; a rail's and the bar's only along.
  const across = (t: number) => (grind.handrail && stage.rail?.yaw ? ledgeAcross(grind, t) : 0);
  const follow = followRider(plan, {
    x: scroll(takeover),
    vx: (scroll(takeover + h) - scroll(takeover - h)) / (2 * h),
    z: across(takeover),
    vz: (across(takeover + h) - across(takeover - h)) / (2 * h),
  });
  // The board's first touch of the ground, not the rail it left (or, a ledge's top being its ground, once it's off it).
  const ground = groundOf(grind);
  let boardDown = Infinity;
  for (let t = takeover + (grind.handrail?.rail.ledge ? LEDGE_LEAVE : 0); t <= stage.end; t += plan.board.dt) {
    const b = boardRigOf(boardAt(plan.board, t));
    const corners = [-40, 40].flatMap((x) => [-10, 10].map((z) => b.point({ x, y: 4, z })));
    if (corners.some((p) => ground(p.x, p.z) - p.y < DOWN_WITHIN && railTop(grind, p.x, p.z, p.y) === Infinity)) {
      boardDown = t;
      break;
    }
  }
  const made: Planned = { plan, follow, boardDown };
  plans.set(stage, made);
  return made;
}

/** The bail planned for a stage, once (for the soundtrack and tests). */
export const railBailPlan = (stage: StagePlan): KickOutPlan => planned(stage).plan;

/** When the board left on the rail first comes down on the ground. */
export const railBailBoardDown = (stage: StagePlan): number => planned(stage).boardDown;

/** When the rider's own motion takes over from the grind. */
export const railBailTakeover = (stage: StagePlan): number => stage.railBail!.at;

/** The bail's frame at clock `t`, from the jump on; `attempt` is the grind's frame it takes over from. */
export function railBailFrame(stage: StagePlan, t: number, rate: number, attempt: (t: number) => StageFrame): StageFrame {
  const made = planned(stage);
  const frame = ownFrame(stage, t, rate, attempt);
  const fade = 1 - smoothstep((Math.min(t, stage.end) - made.plan.takeover) / SHADOW_SEAM_T);
  if (fade <= 0) return frame;
  if (!made.seam) {
    const was = attempt(made.plan.takeover).shadows;
    const now = ownFrame(stage, made.plan.takeover, rate, attempt).shadows;
    made.seam = { board: was.boardOpacity - now.boardOpacity, body: was.bodyOpacity - now.bodyOpacity };
  }
  const { shadows } = frame;
  return {
    ...frame,
    shadows: { ...shadows, boardOpacity: shadows.boardOpacity + made.seam.board * fade, bodyOpacity: shadows.bodyOpacity + made.seam.body * fade },
  };
}

/** Dust kicked up at `from` at `p` (in a frame), left where it was. */
const lineDustOf = (clock: number, from: number, p: V3, strength: number, ground: number) => kickedUp(clock, from, p.x, strength, p.z, ground);

/** The crane's lift as the grind had it at the jump, eased down as the rider comes off the rail onto the ground. */
const LIFT_EASE = 0.35;

function ownFrame(stage: StagePlan, t: number, rate: number, attempt: (t: number) => StageFrame): StageFrame {
  const { plan, follow, boardDown } = planned(stage);
  const grind = stage.grind!;
  const clock = Math.min(t, stage.end);
  const at = kickOutAt(plan, clock);
  const camera = followAt(follow, clock);
  const ride = grind.handrail;
  const ledge = ride && stage.rail?.yaw ? stage.rail : null;
  // Along the flat bar the street is the same wherever across the rider runs: the crane turns to follow instead.
  const by = { x: -camera.x, y: 0, z: ride ? -camera.z : 0 };
  const toFrame = (p: V3): V3 => ({ x: p.x + by.x, y: p.y, z: p.z + by.z });
  const local = shiftRig(at.rig, by);
  const scale = bodyDims(stage.skater).scale;
  const ground = plan.setup.ground;
  const { takeover } = plan;
  const firstDown = plan.run.footfalls[0].on;

  const wheelBefore = boardAt(plan.board, Math.max(takeover, clock - rate / 60)).wheel;

  // Dust where the board comes down and where the first foot lands (or everywhere the rolling body hits).
  const puff = (from: number, p: V3, strength: number) => {
    const q = toFrame(p);
    return kickedUp(clock, from, q.x, strength, q.z, ground(p.x, p.z));
  };
  const first = plan.run.footfalls[0];
  const hits = plan.roll ? plan.roll.hits.flatMap((hit) => puff(hit.t, hit.at, Math.max(0.25, hit.strength * 0.8))) : puff(first.on, first.at, 0.45);
  const boardSpot = boardRigOf(boardAt(plan.board, Math.min(boardDown, stage.end))).center;
  const dust = [...(Number.isFinite(boardDown) ? puff(boardDown, boardSpot, 0.6) : []), ...hits];

  // The crane sinks only as far as a low head needs, from the feet down.
  const head = at.rig.head.origin;
  const headHeight = (ground(head.x, head.z) - head.y - (ASPHALT - GROUND)) / scale;
  const sink = smoothstep((clock - firstDown) / 0.3) * fallSink(headHeight);
  // The body's shadow fades with its lowest part off the ground, the board's with its deck's middle over its rolling height.
  const lowestPart = lowestOver(at.rig, ground, scale);
  const boardHeight = ground(at.board.center.x, at.board.center.z) - at.board.center.y - (ASPHALT - GROUND);
  const shared = {
    t,
    wheels: { angle: at.wheel, sweep: at.wheel - wheelBefore },
    expression: at.expression,
  };

  if (!ride) {
    // The flat bar: where it is in the frame, its shadows, and the crane easing down from the grind's lift as the rider comes off.
    const moved = camera.x;
    const a = X0 + grind.spec.dir * grind.barStart - moved;
    const b = X0 + grind.spec.dir * grind.barEnd - moved;
    const span = { x0: Math.min(a, b), x1: Math.max(a, b) };
    const barShadows = barShadowParts(span).map((pts) => groundHull(pts.map((p) => (p.y >= GROUND ? { ...p, y: ASPHALT } : p)), 0.8));
    const from = attempt(takeover).lift;
    const lift = from * (1 - smoothstep((clock - takeover) / Math.max(0.1, firstDown - takeover + LIFT_EASE))) - sink;
    return {
      ...shared,
      rig: local,
      lift,
      track: camera.z,
      scroll: moved,
      span,
      stairs: null,
      gaze: toFrame(at.gaze),
      dust,
      shadows: riderShadows(local, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }, undefined, barShadows),
    };
  }

  // Down a handrail: the crane follows the board down the rail up to the jump, then the rider's hips down onto the ground under them.
  const atJump = handrailHeight(grind, takeover);
  const hipsAtJump = hipsAt(plan, takeover).hips.y;
  const level = (time: number) => {
    if (time < takeover) return handrailHeight(grind, time);
    const hips = hipsAt(plan, Math.min(time, stage.end)).hips;
    const flying = atJump + (hipsAtJump - hips.y);
    const under = ride.rail.ground(hips.x - X0, hips.z);
    return flying + (under - flying) * smoothstep((time - takeover) / Math.max(0.1, firstDown - takeover + LIFT_EASE));
  };
  const lift = craneDownhill(level, clock) - sink;
  const groundAt = (x: number, z: number) => ride.rail.ground(x, z);
  if (ledge) {
    // Laid onto the set as the grind's frames are: the ledge's own frame, its middle where the camera's following.
    const along = { x: -camera.x, y: 0, z: 0 };
    const onLine = (p: V3): V3 => ({ x: p.x + along.x, y: p.y, z: p.z });
    const lineDust = [...(Number.isFinite(boardDown) ? lineDustOf(clock, boardDown, onLine(boardSpot), 0.6, ground(boardSpot.x, boardSpot.z)) : []),
      ...(plan.roll ? plan.roll.hits.flatMap((hit) => lineDustOf(clock, hit.t, onLine(hit.at), Math.max(0.25, hit.strength * 0.8), ground(hit.at.x, hit.at.z)))
        : lineDustOf(clock, first.on, onLine(first.at), 0.45, ground(first.at.x, first.at.z)))];
    const placed = placeOnLedge(ledge, grind, camera.x, camera.z, shiftRig(at.rig, along), lineDust);
    const shadowY = shadowLevel(placed.rig, 0, 1, placed.ground);
    return {
      ...shared,
      rig: placed.rig,
      lift,
      scroll: placed.x,
      span: null,
      stairs: { dir: 1, shadowY, across: placed.z, ...(ledge.line === 'left' || ledge.line === 'right' ? { ledge: ledge.line } : null) },
      gaze: placed.place(onLine(at.gaze)),
      dust: placed.dust,
      shadows: riderShadows(placed.rig, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }, ASPHALT - shadowY),
    };
  }
  const shadowY = shadowLevel(local, camera.x, 1, groundAt, camera.z);
  return {
    ...shared,
    rig: local,
    lift,
    scroll: camera.x,
    span: null,
    stairs: { dir: 1, shadowY, across: (stage.rail?.z ?? 0) + camera.z },
    gaze: toFrame(at.gaze),
    dust,
    shadows: riderShadows(local, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }, ASPHALT - shadowY),
  };
}
