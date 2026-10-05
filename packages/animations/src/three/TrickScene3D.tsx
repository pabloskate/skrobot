'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RiderStance, Robot, Trick } from '../types';
import { resolveSkateStyle } from '../motion/style';
import { useTrickPlayback } from './useTrickPlayback';
import { randomFallVariant, randomShankProgress, type FallVariant } from '../motion/trick';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import { setInfo, type RailChoice, type StageSet } from '../sets/sets';
import type { LeadIn } from '../types';
import type { Skater } from '../riders/skaters';
import type { SceneRenderer } from './renderer';
import { borrowRenderer, lookFor, returnRenderer } from './rendererPool';
import { planStage, stageFrame } from '../stage/stage';
import { useTrickSound } from '../sound/useTrickSound';
import { STOCK_VIEW, stageView } from '../camera/view';
import WaterfrontFar from '../sets/waterfront/waterfrontFar';

/**
 * TrickScene3D — a skate attempt on stage, drawn in WebGL with three.js.
 *
 * The attempt is planned and worked out frame by frame by the stage
 * (stage/stage.ts); this component runs its clock, borrows a renderer for
 * the set and rider (rendererPool.ts), and draws each frame. Parts are
 * depth-tested, so crossing limbs, a board flipping past a foot, and any
 * camera angle sort themselves out; the look is two-tone cel shading, ink
 * outlines, and soft cast shadows.
 *
 * With `fixedTime` it draws that moment; without it plays the attempt on
 * its own clock. Where the set has a far panorama (the waterfront's) it is
 * SVG in layers under the canvas (waterfrontFar.tsx).
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
  paused?: boolean;
  knewIt?: boolean;
  riderStance?: RiderStance;
  /** Render one frozen frame at this absolute time (seconds). */
  fixedTime?: number;
  /** The robot's pick reel and head moves before the first attempt. */
  leadIn?: LeadIn;
  /** Where the crane films from; the stock 3/4 view when omitted. */
  camera?: SceneCamera;
  /** Film from a filmer standing still in the spot instead, where the set has that tripod (El Toro); else `camera`. */
  tripod?: TripodId | null;
  /** Magnify the picture about the rider, 1 stock. */
  zoom?: number;
  /** The backdrop: the stock plaza, the bayside waterfront, or El Toro's 20 stair (flatground tricks go down it, grinds down its center rail). */
  set?: StageSet;
  /** Where the set has several handrails (El Toro): the center one, or the side one the grind's approach takes. */
  rail?: RailChoice;
  /** Who rides: the robot (its look from `robot`), illustrated human, or detailed humanoid. */
  skater?: Skater;
  /** Play the attempt's sounds while its clock runs: the pop, the wheels, a grind or slide, the landing. Off by default. */
  sound?: boolean;
}

/** Device pixels drawn per CSS pixel: supersampled on ordinary screens, native on retina. */
const PIXEL_RATIO = 2;

export default function TrickScene3D({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  showSpeedToggle = false,
  fallVariant,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
  leadIn,
  camera = DEFAULT_SCENE_CAMERA,
  tripod = null,
  zoom = 1,
  set = 'plaza',
  skater = 'robot',
  rail = 'center',
  sound = false,
}: Props) {
  const idBase = useId().replace(/:/g, '');
  const style = useMemo(() => resolveSkateStyle(robot.skateStyle), [robot.skateStyle]);
  const forcedFall = !landed && knewIt === false ? ('shank' as FallVariant) : undefined;
  const [randomizedFall] = useState<FallVariant>(randomFallVariant);
  const [shankProgress] = useState(randomShankProgress);
  const fall = forcedFall ?? fallVariant ?? randomizedFall;
  const stage = useMemo(
    () => planStage(trick, { landed, riderStance, style, fall, shankProgress, skater, set, rail }),
    // The trick's name and id don't change what is skated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [robot, trick.base, trick.stance, landed, riderStance, style, fall, shankProgress, skater, set, rail],
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

  // The canvas's shape, for framing the far layers the way the canvas is framed.
  const [aspect, setAspect] = useState(STOCK_VIEW.width / STOCK_VIEW.height);
  const frame = stageFrame(stage, time, effectivePlaybackRate, lead?.head?.(time));
  const view = stageView(frame.lift, camera, zoom, aspect);

  const host = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const renderer = useRef<SceneRenderer | null>(null);
  const fallback = useRef<HTMLParagraphElement>(null);
  const draw = useRef<() => void>(() => {});

  // Only the robot's colors, the rider, and the set need a different renderer; a new trick reuses it.
  const { body, accent, variant } = robot.avatar;
  useEffect(() => {
    const box = host.current;
    const into = slot.current;
    if (!box || !into) return;
    let scene: SceneRenderer;
    try {
      scene = borrowRenderer(lookFor({ avatar: { body, accent, variant } }, skater), set);
    } catch {
      // No WebGL 2: say so in place of the picture.
      if (fallback.current) fallback.current.hidden = false;
      return;
    }
    const canvas = scene.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
    into.append(canvas);
    renderer.current = scene;
    const resize = () => {
      const rect = box.getBoundingClientRect();
      scene.setSize(rect.width, rect.height, PIXEL_RATIO);
      if (rect.width > 0 && rect.height > 0) setAspect(rect.width / rect.height);
      draw.current();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => {
      observer.disconnect();
      renderer.current = null;
      canvas.remove();
      returnRenderer(scene);
    };
  }, [body, accent, variant, set, skater]);

  useLayoutEffect(() => {
    draw.current = () => renderer.current?.render(frame, camera, zoom, tripod);
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
          {setInfo(set).farPanorama && <WaterfrontFar cam={view.cam} scroll={frame.scroll} view={view.box} idBase={idBase} />}
          {/* The borrowed renderer's canvas goes here, above the SVG panorama, including in panels that give their SVGs a z-index. */}
          <div ref={slot} style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }} />
          <p ref={fallback} hidden style={{ position: 'absolute', zIndex: 3, inset: 0, placeContent: 'center', margin: 0, padding: 16, textAlign: 'center' }}>
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
