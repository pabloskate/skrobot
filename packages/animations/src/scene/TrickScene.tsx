'use client';

import { useId, useMemo, useState, type ReactElement } from 'react';
import type { RiderStance, Robot, Trick } from '../types';
import { resolveRiderMechanics } from '../stanceMechanics';
import { readableAccent } from '../robotColors';
import { resolveSkateStyle } from '../skateStyle';
import { useTrickPlayback } from '../useTrickPlayback';
import {
  specFor,
  randomFallVariant,
  randomShankProgress,
  W,
  H,
  GROUND,
  X0,
  SKY_PAD,
  JUMP,
  ROLL_IN,
  FLIP_T,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
  type BackgroundSceneId,
  type FallVariant,
} from '../TrickAnimation';
import { LIGHT, PALETTE, cameraLift, makeCamera, type Camera } from './camera';
import { drawBackdrop } from './backdrop';
import { boardShadowPoints, drawBoard } from './board';
import { resetKeys } from './draw';
import { clamp01, easeOutCubic, hull, mixHex, pathOf, type P2, type V3 } from './math';
import { drawRobot, type Expression } from './robot';
import { solveRig, type Rig } from './rig';

/**
 * TrickScene — a from-scratch look for the trick animation: a new toy-robot
 * character, a golden-hour skate plaza, and a crane camera that rises with
 * the pop. The trick motion is untouched: the board, feet, spins, and flick
 * come from the shared computeFrame physics and the New 3D mapping, so this
 * is a drop-in alternative to TrickAnimation3D with the same props. The
 * rider's body on top of that is solved physically in rig.ts (ballistic
 * hips, fixed-length legs, absorbed landings).
 */

interface Props {
  robot: Robot;
  trick: Trick;
  landed: boolean;
  onDone: () => void;
  playbackRate?: number;
  /** Show the in-stage .5x / 1x playback toggle. */
  showSpeedToggle?: boolean;
  /** Accepted for prop parity with the other renderers; the plaza is fixed. */
  backgroundSceneId?: BackgroundSceneId;
  fallVariant?: FallVariant;
  /** Freeze the animation on the current frame. */
  paused?: boolean;
  /** Whether the robot knew the trick; false forces shank. */
  knewIt?: boolean;
  /** The rider's natural footedness. Trick stance is resolved separately. */
  riderStance?: RiderStance;
  /** Render one frozen frame at this absolute time (seconds). */
  fixedTime?: number;
}

function expressionAt(t: number, landed: boolean): Expression {
  const touchdown = ROLL_IN + FLIP_T;
  if (t < ROLL_IN) return 'open';
  if (t < touchdown) return 'focus';
  if (landed) return t > touchdown + 0.14 ? 'happy' : 'focus';
  return t > touchdown + 0.06 ? 'wince' : 'focus';
}

/** Where a point's shadow falls on the ground along the sun's rays. */
function cast(p: V3): V3 {
  const t = Math.max(0, GROUND - p.y) / -LIGHT.y;
  return { x: p.x - LIGHT.x * t, y: GROUND, z: p.z - LIGHT.z * t };
}

/** Hull of cast points, each widened by `r` so thin limbs still shade. */
function shadowPath(cam: Camera, pts: V3[], r: number): string {
  const out: P2[] = [];
  for (const p of pts) {
    const c = cast(p);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      out.push(cam.project({ x: c.x + dx, y: GROUND, z: c.z + dz }));
    }
  }
  return pathOf(hull(out));
}

function robotShadow(cam: Camera, rig: Rig): string[] {
  const box = (frame: Rig['torso'], f: number, u: number, s: number) => {
    const pts: V3[] = [];
    for (const a of [-f, f]) for (const b of [-u, u]) for (const c of [-s, s]) pts.push(frame.at(a, b, c));
    return pts;
  };
  const paths = [shadowPath(cam, [...box(rig.torso, 10, 23, 14), ...box(rig.head, 13, 14, 17)], 1)];
  for (const leg of rig.legs) {
    paths.push(shadowPath(cam, [leg.hip, leg.knee, leg.ankle, leg.shoe.at(8, 0, 0), leg.shoe.at(-8, 0, 0)], 3.5));
  }
  for (const arm of rig.arms) paths.push(shadowPath(cam, [arm.shoulder, arm.elbow, arm.hand], 3));
  return paths;
}

export default function TrickScene({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  showSpeedToggle = true,
  fallVariant,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
}: Props) {
  const idBase = useId().replace(/:/g, '');
  const skateStyle = useMemo(() => resolveSkateStyle(robot.skateStyle), [robot.skateStyle]);
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFallVariant] = useState<FallVariant>(randomFallVariant);
  const [shankProgress] = useState(randomShankProgress);
  const [spec] = useState(() => specFor(trick));
  const resolvedFallVariant = forcedFall ?? fallVariant ?? randomizedFallVariant;
  const {
    frame: f, isPlaying, staticTime, speedToggleVisible, effectivePlaybackRate,
    selectedPlaybackRate, replay, togglePlaybackRate,
  } = useTrickPlayback({
    spec, landed, resolvedFallVariant, shankProgress, skateStyle,
    onDone, paused, playbackRate, showSpeedToggle, fixedTime,
  });

  resetKeys();

  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  const rig = solveRig(f, spec, mechanics, skateStyle, landed ? 'landed' : resolvedFallVariant);
  const falling = !landed && f.motion.flight >= 1;
  const lift = cameraLift(f.motion.flight, skateStyle.popHeight, GROUND - rig.head.origin.y, falling);
  const cam = makeCamera(lift);

  const viewTop = -SKY_PAD;
  const viewBottom = H;
  const scroll = (f.streetDist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD * spec.dir;
  const ids = {
    sky: `${idBase}-sky`,
    glow: `${idBase}-glow`,
    ground: `${idBase}-ground`,
    lawn: `${idBase}-lawn`,
    haze: `${idBase}-haze`,
  };
  const shadowBlurId = `${idBase}-shadow`;
  const backdrop = drawBackdrop(cam, scroll, ids, viewTop, viewBottom);

  // ----- Shadows: the real silhouette cast along the sun, softened. -----
  const boardHeight = Math.max(0, GROUND - f.board.y);
  const bodyHeight = Math.max(0, GROUND - f.body.y - 60);
  const heightFade = (h: number) => 1 - 0.55 * clamp01(h / JUMP);
  const shadowColor = PALETTE.shadow;
  const shadows = (
    <g key="shadows" filter={`url(#${shadowBlurId})`}>
      <path d={shadowPath(cam, boardShadowPoints(rig.board), 1.5)} fill={shadowColor} opacity={0.34 * heightFade(boardHeight)} />
      <g opacity={0.3 * heightFade(bodyHeight)} fill={shadowColor}>
        {robotShadow(cam, rig).map((d, i) => <path key={i} d={d} />)}
      </g>
    </g>
  );

  // ----- Pop and touchdown dust -----
  const dust: ReactElement[] = [];
  const puff = (key: string, progress: number, atX: number, strength: number) => {
    const grow = easeOutCubic(progress);
    const fade = (1 - progress) ** 2;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = (0.35 + (i % 3) * 0.3) * side;
      const p = cam.project({ x: atX + spread * 40 * grow, y: GROUND - 14 * grow * (1 - grow * 0.4) - (i % 3) * 2, z: ((i % 3) - 1) * 10 * grow });
      dust.push(<circle key={`${key}${i}`} cx={p.x} cy={p.y} r={(2.4 + 4.6 * grow) * p.s * strength} fill={PALETTE.dust} opacity={0.85 * fade} />);
    }
  };
  const DUST_T = 0.36;
  const popP = (f.t - ROLL_IN) / DUST_T;
  if (popP >= 0 && popP < 1) puff('pop', popP, X0 + (spec.nollie ? 32 : -32), 0.8);
  const landP = (f.t - ROLL_IN - FLIP_T) / DUST_T;
  if (landP >= 0 && landP < 1) puff('land', landP, f.board.x, landed ? 1 : 0.8);

  // ----- Rider -----
  const accent = readableAccent(robot.avatar.accent);
  const look = { body: robot.avatar.body, accent, variant: robot.avatar.variant };
  const board = drawBoard(cam, rig.board, { graphic: accent, stripe: mixHex(robot.avatar.body, '#ffffff', 0.35) });
  const rider = drawRobot(cam, rig, look, expressionAt(f.t, landed), <g key="board">{board}</g>);

  return (
    <div
      className={`trick-anim trick-anim--3d trick-scene ${isPlaying && staticTime == null ? 'trick-anim--moving' : ''}`}
      style={{ background: PALETTE.concrete }}
      data-renderer="scene"
      data-rider-stance={riderStance}
      data-nose-foot={mechanics.noseFoot}
      data-toe-side={mechanics.orientationSign}
      data-board-flip={rig.board.flipDeg.toFixed(1)}
      data-board-yaw={rig.board.yawDeg.toFixed(1)}
      data-board-height={(GROUND - f.board.y).toFixed(1)}
      data-rotation-progress={f.motion.rotation.toFixed(3)}
      data-flick-depth={rig.flickZ.toFixed(1)}
      data-current-body-yaw={rig.bodyYawDeg.toFixed(1)}
      data-current-head-yaw={rig.headYawDeg.toFixed(1)}
      data-camera-lift={lift.toFixed(1)}
      data-playback-rate={effectivePlaybackRate}
    >
      <button
        type="button"
        className="trick-anim-3d__replay"
        aria-label={`Replay ${robot.name} attempting ${trick.name}`}
        aria-roledescription="trick animation"
        onClick={replay}
      >
        <svg viewBox={`0 ${viewTop} ${W} ${H + SKY_PAD}`} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <defs>
            {backdrop.defs}
            <filter id={shadowBlurId} x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          <g aria-hidden="true">{backdrop.layers}</g>
          {shadows}
          {dust}
          {rider}
        </svg>
      </button>
      {speedToggleVisible && (
        <button
          type="button"
          className="trick-anim-3d__speed-toggle"
          aria-label={`Animation speed ${selectedPlaybackRate === 1 ? '1x' : '.5x'}; switch to ${selectedPlaybackRate === 1 ? '.5x' : '1x'}`}
          title={`Animation speed: ${selectedPlaybackRate === 1 ? '1x' : '.5x'}`}
          onClick={togglePlaybackRate}
        >
          {selectedPlaybackRate === 1 ? '1x' : '.5x'}
        </button>
      )}
    </div>
  );
}
