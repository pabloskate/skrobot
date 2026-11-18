'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RiderStance, Robot, Trick } from '../types';
import { resolveSkateStyle } from '../motion/style';
import { useTrickPlayback } from './useTrickPlayback';
import { randomFallVariant, randomShankProgress, type FallVariant } from '../motion/trick';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import { type Obstacle, type RailChoice, type StageSet } from '../sets/sets';
import type { RailBail } from '../motion/fall/railBail';
import type { LeadIn } from '../types';
import type { Skater } from '../riders/skaters';
import { useWaterClock } from './useWaterClock';
import { useStageRenderer } from './useStageRenderer';
import { planStage, stageFrame } from '../stage/stage';
import { useTrickSound } from '../sound/useTrickSound';

/**
 * TrickScene3D — a skate attempt on stage, drawn in WebGL with three.js.
 *
 * The attempt is planned and worked out frame by frame by the stage
 * (stage/stage.ts); this component runs its clock, borrows a renderer for
 * the rider and puts the set on it (useStageRenderer.ts), and draws each frame. Parts are
 * depth-tested, so crossing limbs, a board flipping past a foot, and any
 * camera angle sort themselves out; the look is two-tone cel shading, ink
 * outlines, and soft cast shadows.
 *
 * With `fixedTime` it draws that moment; without it plays the attempt on
 * its own clock.
 */

interface Props {
  robot: Robot;
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>;
  landed: boolean;
  onDone: () => void;
  playbackRate?: number;
  /** Show the in-stage .5x / 1x playback toggle. Off for externally controlled viewers. */
  showSpeedToggle?: boolean;
  fallVariant?: FallVariant;
  /** A grind kicked out (`fallVariant` 'kickout'): the rider jumps off the rail this way and rolls it out. Forward unless given. */
  railBail?: RailBail;
  paused?: boolean;
  knewIt?: boolean;
  riderStance?: RiderStance;
  /** Render one frozen frame at this absolute time (seconds). */
  fixedTime?: number;
  /** Keep the water moving on a live stage, including a viewer that supplies its own playhead. */
  animateWater?: boolean;
  /** The robot's pick reel and head moves before the first attempt. */
  leadIn?: LeadIn;
  /** Where the crane films from; the stock 3/4 view when omitted. */
  camera?: SceneCamera;
  /** Film from a filmer standing still in the spot instead, where the set has that tripod (the landmarks); else `camera`. */
  tripod?: TripodId | null;
  /** Magnify the picture about the rider, 1 stock. */
  zoom?: number;
  /** The backdrop: the stock plaza, the bayside waterfront, or a landmark (flatground tricks go down its drop, grinds down its handrail where it has one). */
  set?: StageSet;
  /** Where the set has several handrails (El Toro): the center one, or the side one the grind's approach takes. */
  rail?: RailChoice;
  /** Where the set has several ways down (Hollywood): what a gap trick goes over, the stairs or the fence. */
  obstacle?: Obstacle;
  /** Who rides: the robot (its look from `robot`), the realistic human, the alien, or Wind-Up (a tin toy robot in its own paint). */
  skater?: Skater;
  /** Play the attempt's sounds while its clock runs: the pop, the wheels, a grind or slide, the landing. Off by default. */
  sound?: boolean;
  /**
   * Told when the stage starts getting a scene ready that has to be built
   * first (another spot, another rider, the first of either) and when it's
   * on screen. Given, that build happens a step at a time without freezing
   * the page, the last picture left up meanwhile, for a host that runs the
   * clock and can show that it's loading. Omitted, it's built on the spot,
   * as a stage running its own clock needs.
   */
  onLoading?: (loading: boolean) => void;
}

export default function TrickScene3D({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  showSpeedToggle = false,
  fallVariant,
  railBail,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
  animateWater = fixedTime == null,
  leadIn,
  camera = DEFAULT_SCENE_CAMERA,
  tripod = null,
  zoom = 1,
  set = 'plaza',
  skater = 'robot',
  rail = 'center',
  obstacle = 'stairs',
  sound = false,
  onLoading,
}: Props) {
  const style = useMemo(() => resolveSkateStyle(robot.skateStyle), [robot.skateStyle]);
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFall] = useState<FallVariant>(randomFallVariant);
  const [shankProgress] = useState(randomShankProgress);
  const fall = forcedFall ?? fallVariant ?? randomizedFall;
  const stage = useMemo(
    () => planStage(trick, { landed, riderStance, style, fall, shankProgress, skater, set, rail, obstacle, railBail }),
    // The trick's name and id don't change what is skated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [robot, trick.base, trick.stance, landed, riderStance, style, fall, shankProgress, skater, set, rail, obstacle, railBail],
  );
  const {
    time, firstRun, isPlaying, staticTime, speedToggleVisible, effectivePlaybackRate,
    selectedPlaybackRate, replay, seek, togglePlaybackRate,
  } = useTrickPlayback({
    attempt: stage,
    end: stage.end,
    onDone,
    paused,
    playbackRate,
    showSpeedToggle,
    fixedTime,
    leadIn: leadIn?.seconds,
    onLeadInEnd: leadIn?.onEnd,
  });
  const lead = firstRun ? leadIn : undefined;
  const inLeadIn = lead != null && time < 0;
  useTrickSound(stage, time, effectivePlaybackRate, sound);

  const frame = stageFrame(stage, time, effectivePlaybackRate, lead?.head?.(time));

  const host = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const draw = useRef<() => void>(() => {});
  const { renderer, unsupported } = useStageRenderer({ host, slot, look: robot.avatar, skater, set, draw, onLoading });

  const liveWater = animateWater && set === 'waterfront';
  const waterClock = useWaterClock(liveWater, host, renderer);

  useLayoutEffect(() => {
    draw.current = () => renderer.current?.render(frame, camera, zoom, tripod, liveWater ? waterClock.current() : frame.t);
    draw.current();
  });

  return (
    <div
      className={`trick-anim trick-anim--3d trick-scene-3d ${isPlaying && staticTime == null ? 'trick-anim--moving' : ''}`}
      data-renderer="three"
      data-time={time.toFixed(3)}
      data-set={set}
      data-skater={skater}
      data-rail={stage.rail?.line}
      data-obstacle={stage.obstacle ?? undefined}
      data-rider-stance={riderStance}
      data-nose-foot={stage.mechanics.noseFoot}
      data-toe-side={stage.mechanics.orientationSign}
      data-board-flip={frame.rig.board.flipDeg.toFixed(1)}
      data-board-yaw={frame.rig.board.yawDeg.toFixed(1)}
      data-playback-rate={effectivePlaybackRate}
      style={{ position: 'relative', width: '100%', overflow: 'hidden' }}
    >
      <button
        type="button"
        className="trick-anim-3d__replay"
        aria-label={inLeadIn ? lead.label : `Replay ${robot.name} attempting ${trick.name}`}
        aria-roledescription="trick animation"
        onClick={() => {
          if (!inLeadIn) replay();
          else if (lead.skipTo != null && time < lead.skipTo) seek(lead.skipTo);
        }}
      >
        <div ref={host} style={{ position: 'relative', width: '100%', aspectRatio: '500 / 404', overflow: 'hidden' }}>
          <div ref={slot} style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }} />
          <p hidden={!unsupported} style={{ position: 'absolute', zIndex: 3, inset: 0, placeContent: 'center', margin: 0, padding: 16, textAlign: 'center' }}>
            This browser can&apos;t draw the 3D stage (WebGL 2 is off or unavailable).
          </p>
        </div>
      </button>
      {lead?.overlay?.(time)}
      {speedToggleVisible && !inLeadIn && (
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
