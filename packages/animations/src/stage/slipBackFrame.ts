import { cameraLift, fallSink } from '../camera/camera';
import { ASPHALT } from '../camera/view';
import { smoothstep, type V3 } from '../math';
import { bodyDims } from '../motion/fall/body';
import { planSlipBack, slipBackAt, slipBackHips, type SlipBackPlan } from '../motion/fall/slipBack';
import { GROUND, ROLL_IN, X0, flightTime } from '../motion/trick';
import { stairDeckHeight } from './drop';
import { terrainSurface } from '../sets/terrain';
import { shiftRig, stairCrane, stairShadowLevel } from './downhill';
import { kickedUp, riderShadows, type StageFrame } from './frameParts';
import { SHADOW_SEAM_T, attemptCamera, fallSetup, followAt, followHips, lowestOver, type Follow } from './kickOutFrame';
import type { StagePlan } from './stage';

/**
 * A slip back on the stage (motion/fall/slipBack.ts): up to the takeover,
 * just before the touchdown, it's the landed attempt (stage.ts and
 * downhill.ts draw those frames); from there the rider and board are the
 * slip's, worked out where they really are (on the street, or at a spot
 * down its drop) and moved back into the frame by a camera that follows the
 * rider, as a kick-out's are (kickOutFrame.ts).
 */

/** Whether an attempt on this stage is a slip back: on flat ground, or down a spot's drop. */
export const isSlipBack = (stage: StagePlan) => !stage.landed && stage.fall === 'slipback' && !stage.grind;

interface Planned {
  plan: SlipBackPlan;
  follow: Follow;
  /** How much darker the attempt's shadows were than the slip's at the takeover (they're measured differently). */
  seam?: { board: number; body: number };
}

const plans = new WeakMap<StagePlan, Planned>();

/** The slip back planned for a stage, once, with the camera that follows it. */
function planned(stage: StagePlan): Planned {
  const known = plans.get(stage);
  if (known) return known;
  const plan = planSlipBack(fallSetup(stage));
  const follow = followHips(
    { takeover: plan.takeover, end: plan.setup.end, dt: plan.dt, hips: (t) => slipBackHips(plan, t) },
    attemptCamera(stage, plan.takeover),
  );
  const made = { plan, follow };
  plans.set(stage, made);
  return made;
}

/** The slip back planned for a stage, once. */
export const slipBackPlan = (stage: StagePlan): SlipBackPlan => planned(stage).plan;

/** The slip's frame at clock `t`, from its takeover on; `attempt` is the attempt's frame it takes over from. */
export function slipBackFrame(stage: StagePlan, t: number, rate: number, attempt: (t: number) => StageFrame): StageFrame {
  const made = planned(stage);
  const frame = ownFrame(stage, t, rate);
  const fade = 1 - smoothstep((Math.min(t, stage.end) - made.plan.takeover) / SHADOW_SEAM_T);
  if (fade <= 0) return frame;
  if (!made.seam) {
    const was = attempt(made.plan.takeover).shadows;
    const now = ownFrame(stage, made.plan.takeover, rate).shadows;
    made.seam = { board: was.boardOpacity - now.boardOpacity, body: was.bodyOpacity - now.bodyOpacity };
  }
  const { shadows } = frame;
  return {
    ...frame,
    shadows: { ...shadows, boardOpacity: shadows.boardOpacity + made.seam.board * fade, bodyOpacity: shadows.bodyOpacity + made.seam.body * fade },
  };
}

function ownFrame(stage: StagePlan, t: number, rate: number): StageFrame {
  const { plan, follow } = planned(stage);
  const clock = Math.min(t, stage.end);
  const at = slipBackAt(plan, clock);
  const camera = followAt(follow, clock);
  // Flat ground has no across: the street is the same wherever the rider slides.
  const stairs = stage.stairs;
  const by = { x: -camera.x, y: 0, z: stairs ? -camera.z : 0 };
  const toFrame = (p: V3): V3 => ({ x: p.x + by.x, y: p.y, z: p.z + by.z });
  const rig = shiftRig(at.rig, by);
  const scale = bodyDims(stage.skater).scale;
  const ground = plan.setup.ground;
  const { touchdown } = plan;

  // The wheels turn as the board has them; the mark smears over a displayed frame.
  const wheelBefore = slipBackAt(plan, Math.max(plan.takeover, clock - rate / 60)).wheel;

  // Dust where the board comes down and where the rider sits down, left where it was kicked up.
  const dust = plan.hits.flatMap((hit) => {
    const q = toFrame(hit.at);
    return kickedUp(clock, hit.t, q.x, hit.strength, q.z, ground(hit.at.x, hit.at.z));
  });

  // The crane sinks only as far as a low head needs, from the touchdown on.
  const head = at.rig.head.origin;
  const headHeight = (ground(head.x, head.z) - head.y - (ASPHALT - GROUND)) / scale;
  const sink = smoothstep((clock - touchdown) / 0.3) * fallSink(headHeight);
  // The body's shadow fades with its lowest part off the ground: the soles, or sat down, whatever's down.
  const lowestPart = lowestOver(at.rig, ground, scale);
  const boardHeight = ground(at.board.center.x, at.board.center.z) - at.board.center.y - (ASPHALT - GROUND);
  const frame = {
    t,
    rig,
    span: null,
    wheels: { angle: at.wheel, sweep: at.wheel - wheelBefore },
    expression: at.expression,
    gaze: toFrame(at.gaze),
    dust,
  };
  if (!stairs) {
    // The crane rides the pop as the landed attempt does.
    const lift = cameraLift((clock - ROLL_IN) / flightTime(stage.style), stage.style.popHeight, headHeight, false) - sink;
    return {
      ...frame,
      lift,
      scroll: camera.x,
      stairs: null,
      shadows: riderShadows(rig, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }),
    };
  }
  // Down a drop the crane follows the deck as the landed attempt has it, down to the touchdown, then the ground under the rider.
  const level = (time: number) => {
    if (time < touchdown) return stairDeckHeight(stairs, time);
    const hips = slipBackHips(plan, Math.min(time, stage.end)).hips;
    return terrainSurface(stairs.terrain, hips.x - X0, hips.z);
  };
  const lift = stairCrane(stairs, clock, level) - sink;
  const shadowY = stairShadowLevel(rig, stairs, camera.x, camera.z);
  return {
    ...frame,
    lift,
    scroll: camera.x,
    stairs: { dir: stairs.dir, shadowY, across: camera.z, ...(stage.obstacle ? { obstacle: stage.obstacle } : null) },
    shadows: riderShadows(rig, { board: Math.max(0, boardHeight), body: Math.max(0, lowestPart) }, ASPHALT - shadowY),
  };
}
