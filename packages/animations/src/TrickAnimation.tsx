'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { RiderStance, Robot, Trick } from './types';
import { resolveRiderMechanics } from './stanceMechanics';

/**
 * Side-view animated robot attempt: roll in, pop the trick, then catch it and
 * ride away — or slam. Board physics per trick family: flips are a cosine
 * scaleY (a heelflip reads identically to a kickflip in profile), shuvits and
 * spins are a scaleX yaw, tre flips combine both. Misses end in one of two
 * parametric falls (slam / bail / shank) with the board shooting out.
 *
 * Freezes on the final frame and fires onDone exactly once so the parent can
 * advance the game when the attempt resolves.
 */

interface Props {
  robot: Robot;
  trick: Trick;
  landed: boolean;
  onDone: () => void;
  playbackRate?: number;
  backgroundSceneId?: BackgroundSceneId;
  fallVariant?: FallVariant;
  /** Freeze the animation on the current frame (e.g. to grab a screenshot). */
  paused?: boolean;
  /** Whether the robot knew the trick (in its bag). When false and not landed,
   *  forces the "shank" fall (trick under-rotates and stumbles off). */
  knewIt?: boolean;
  /** The rider's natural footedness. Trick stance is resolved separately. */
  riderStance?: RiderStance;
  /** Render a single frozen frame at this absolute animation time (seconds,
   *  clamped to the trick's duration). Disables playback, replay, and onDone —
   *  used by the playground contact sheet to lay out key poses side by side. */
  fixedTime?: number;
}

// ---------- Trick → animation family ----------

interface Spec {
  /** Full rotations around the board's long axis (kickflip family). */
  flips: number;
  /** Direction of the flip: 1 for kickflip (flick back), -1 for heelflip (flick forward), 0 for none. */
  flipDir: 1 | -1 | 0;
  /** Board shuvit / spin degrees around the vertical axis. */
  yaw: number;
  /** Skater spin degrees — independent of the board (180 on 180s AND bigspins). */
  bodyYaw: number;
  /** In-plane end-over-end degrees (impossible). */
  roll: number;
  /** Dolphin/forward flip: front foot drives the nose down through a forward pitch. */
  forwardFlip: boolean;
  /** Nollie pops the nose, so the feet mirror (front foot pops, back foot flicks). */
  nollie: boolean;
  /** Ollie North: lift and extend the leading foot past the nose during the pop. */
  ollieNorth: boolean;
  /** Direction of travel: fakie rides backwards (-1). */
  dir: 1 | -1;
  /** Trick stance for adjusting wind-up awkwardness. */
  stance: Trick['stance'];
  /** Spin direction: -1 = frontside, 1 = backside, 0 = no fs/bs distinction. */
  spinDir: -1 | 0 | 1;
  /** "Late" shuvit: hold the board flat off the pop, then snap the rotation in the back half of the flight. */
  late: boolean;
}

function specFor(trick: Trick): Spec {
  const base: Spec = {
    flips: 0,
    flipDir: 0,
    yaw: 0,
    bodyYaw: 0,
    roll: 0,
    forwardFlip: false,
    nollie: trick.stance === 'nollie',
    ollieNorth: false,
    dir: trick.stance === 'fakie' ? -1 : 1,
    stance: trick.stance,
    spinDir: 0,
    late: false,
  };
  switch (trick.base) {
    case 'Kickflip':
      return { ...base, flips: 1, flipDir: 1 };
    case 'Ollie North':
      return { ...base, ollieNorth: true };
    case 'Heelflip':
      return { ...base, flips: 1, flipDir: -1 };
    case 'Double Kickflip':
      return { ...base, flips: 2, flipDir: 1 };
    case 'Double Heelflip':
      return { ...base, flips: 2, flipDir: -1 };
    case 'Varial Kickflip':
      return { ...base, flips: 1, yaw: 180, flipDir: 1, spinDir: 1 };
    case 'Hardflip':
      return { ...base, flips: 1, yaw: 180, flipDir: 1, spinDir: -1 };
    case 'Dolphin Flip':
      return { ...base, flips: 1, yaw: 180, flipDir: 1, spinDir: 1, forwardFlip: true };
    case 'Varial Heelflip':
      return { ...base, flips: 1, yaw: 180, flipDir: -1, spinDir: -1 };
    case 'Pressure Flip':
    case 'Inward Heelflip':
      return { ...base, flips: 1, yaw: 180, flipDir: -1, spinDir: 1 };
    case '360 Flip':
      return { ...base, flips: 1, yaw: 360, flipDir: 1, spinDir: 1 };
    case '360 Double Kickflip':
      return { ...base, flips: 2, yaw: 360, flipDir: 1, spinDir: 1 };
    case 'Laser Flip':
      return { ...base, flips: 1, yaw: 360, flipDir: -1, spinDir: -1 };
    case 'Pop Shuvit':
      return { ...base, yaw: 180, spinDir: 1 };
    case 'Frontside Shuvit':
      return { ...base, yaw: 180, spinDir: -1 };
    case 'Late Backside Shuvit':
      return { ...base, yaw: 180, spinDir: 1, late: true };
    case 'Late Frontside Shuvit':
      return { ...base, yaw: 180, spinDir: -1, late: true };
    case 'Late Kickflip':
      return { ...base, flips: 1, flipDir: 1, late: true };
    case '360 Shuvit':
      return { ...base, yaw: 360, spinDir: 1 };
    case 'Frontside 360 Shuvit':
      return { ...base, yaw: 360, spinDir: -1 };
    case 'Bigspin':
      return { ...base, yaw: 360, bodyYaw: 180, spinDir: 1 };
    case 'FS Bigspin':
      return { ...base, yaw: 360, bodyYaw: 180, spinDir: -1 };
    case 'Bigspin Flip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 180, flipDir: 1, spinDir: 1 };
    case 'FS Bigspin Flip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 180, flipDir: 1, spinDir: -1 };
    case 'BS Bigspin Heelflip':
    case 'Bigspin Heelflip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 180, flipDir: -1, spinDir: 1 };
    case 'FS Bigspin Heelflip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 180, flipDir: -1, spinDir: -1 };
    case 'Frontside 180':
      return { ...base, yaw: 180, bodyYaw: 180, spinDir: -1 };
    case 'Backside 180':
    case 'No Comply 180':
      return { ...base, yaw: 180, bodyYaw: 180, spinDir: 1 };
    case 'Backside Flip':
      return { ...base, flips: 1, yaw: 180, bodyYaw: 180, flipDir: 1, spinDir: 1 };
    case 'Frontside Flip':
      return { ...base, flips: 1, yaw: 180, bodyYaw: 180, flipDir: 1, spinDir: -1 };
    case 'Backside Heelflip':
      return { ...base, flips: 1, yaw: 180, bodyYaw: 180, flipDir: -1, spinDir: 1 };
    case 'Frontside Heelflip':
      return { ...base, flips: 1, yaw: 180, bodyYaw: 180, flipDir: -1, spinDir: -1 };
    case 'Backside 360':
      return { ...base, yaw: 360, bodyYaw: 360, spinDir: 1 };
    case 'Frontside 360':
      return { ...base, yaw: 360, bodyYaw: 360, spinDir: -1 };
    case 'Backside 360 Kickflip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 360, flipDir: 1, spinDir: 1 };
    case 'Frontside 360 Kickflip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 360, flipDir: 1, spinDir: -1 };
    case 'Impossible':
      // Nollie wraps the other way because it pops the nose; fakie only
      // reverses travel and still scoops the tail, so it keeps regular's sign.
      return { ...base, roll: trick.stance === 'nollie' ? 360 : -360 };
    default:
      // Ollies, grinds, manuals, stalls… plain pop.
      return base;
  }
}

// ---------- Scene + timing constants ----------

const W = 500;
const H = 340;
const GROUND = 272;
const X0 = 250;
const JUMP = 165; // pop height; a bigger pop buys the spin more hang time
const LIFT = 65; // hip height above the board
const FOOT_Y = 65; // feet below the hip
const THIGH = 35;
const SHIN = 35;
const KNEE_BEND_SCALE = 0.82;
// Switch stance arm spread (radians): how much further each arm opens away
// from the body compared with the natural stances.
const SWITCH_ARM_SPREAD = 0.28;
// Extra sky above the viewBox so the taller pop doesn't clip the skater's head.
const SKY_PAD = 64;

// Global speed trim: stretch every animation phase by this factor so pops,
// spins, and falls read a touch slower than baseline (physics-wise: lower effective gravity
// + lower angular velocity, preserving the relative shape of each motion).
const SPEED_SCALE = 1.12;
const ROLL_IN = 0.5 * SPEED_SCALE;
// Flight time obeys projectile motion: under constant gravity the air time
// scales with sqrt(height), so FLIP_T is derived from JUMP rather than tuned
// independently. Raising JUMP therefore slows every spin by the same physical
// law (more hang time = the 360 has longer to come around). Baseline: a 130px
// pop flew for 0.75s.
const FLIP_T = 0.75 * Math.sqrt(JUMP / 130) * SPEED_SCALE;
const LAND_T = 0.95 * SPEED_SCALE;
// Falls share the landing's "impact → settle" budget so a miss doesn't feel
// like a second, slower animation system. A touch longer than LAND_T for the
// slide-out, but no longer the old 1.7s crawl.
const FALL_T = 1.28 * SPEED_SCALE;
const HOLD = 0.35 * SPEED_SCALE; // freeze on the final frame before onDone
const STREET_DASH_PERIOD = 210;
const STREET_DASH_SECONDS = 0.7 * SPEED_SCALE;
export const SLOW_MOTION_PLAYBACK_RATE = 0.38;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
/** Zero slope at both ends — for handoffs between two motion segments. */
const smoothstep = (p: number) => p * p * (3 - 2 * p);
const rad = (d: number) => (d * Math.PI) / 180;
/** Signed yaw squash: passes through a thin edge instead of vanishing. */
const signedSquash = (c: number) => (Math.abs(c) < 0.01 ? 0.15 : Math.sign(c) * (0.15 + 0.85 * Math.abs(c)));
/** Darken a hex color by a factor (0–1) to shade the bot's back side. */
const darken = (hex: string, amount = 0.18): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((n & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

export type FallVariant = 'slam' | 'bail' | 'shank';
export type BackgroundSceneId = 'sunset' | 'skyline' | 'park' | 'palms' | 'hills';

export const FALL_VARIANT_OPTIONS: ReadonlyArray<{ id: FallVariant; label: string }> = [
  { id: 'slam', label: 'Slam' },
  { id: 'bail', label: 'Bail' },
  { id: 'shank', label: 'Shank' },
];

// ---------- Background scenes ----------
// Little skate-spot silhouettes behind the action. One is picked per attempt
// (the component remounts each attempt, so the useState initializer re-rolls).
// Motifs parallax-drift slower than the speed lines for a sense of depth.

type Scene = (px: number) => ReactElement;

const SceneSunset: Scene = (px) => (
  <>
    <circle cx={250 + px * 0.2} cy={GROUND - 46} r="30" fill="#ffd9a8" opacity="0.75" />
    <circle cx={250 + px * 0.2} cy={GROUND - 46} r="44" fill="#ffd9a8" opacity="0.22" />
  </>
);

// Silhouettes overshoot the ground by a few px so they merge into the street
// line instead of floating on a hairline gap.
const GROUND_SINK = 4;

const SceneSkyline: Scene = (px) => (
  <g fill="currentColor" opacity="0.12">
    {[-80, -10, 60, 150, 220, 300, 380, 470, 560].map((bx, i) => {
      const h = 36 + ((i * 41) % 64);
      const w = 34 + ((i * 17) % 24);
      return <rect key={i} x={bx + px} y={GROUND - h} width={w} height={h + GROUND_SINK} />;
    })}
  </g>
);

const ScenePark: Scene = (px) => (
  <g fill="currentColor" opacity="0.1">
    {/* quarter-pipe on the right */}
    <path d={`M ${430 + px} ${GROUND + GROUND_SINK} L ${430 + px} ${GROUND - 60} Q ${430 + px} ${GROUND - 100} ${490 + px} ${GROUND - 100} L ${490 + px} ${GROUND + GROUND_SINK} Z`} />
    {/* flat rail on the left */}
    <rect x={50 + px} y={GROUND - 22} width="78" height="5" opacity="0.5" />
    <rect x={54 + px} y={GROUND - 17} width="4" height={17 + GROUND_SINK} opacity="0.5" />
    <rect x={120 + px} y={GROUND - 17} width="4" height={17 + GROUND_SINK} opacity="0.5" />
  </g>
);

const PALM_LAYOUT = [
  { cx: 60, h: 84, lean: 3, fScale: 1 },
  { cx: 280, h: 96, lean: -4, fScale: 1.1 },
  { cx: 520, h: 76, lean: 5, fScale: 0.92 },
];

/** A frond blade: starts at the crown (0,0), arcs out to (tipX, tipY), and
 *  tapers back. The two quadratic control points sit on opposite sides of the
 *  blade axis, giving the leaf thickness in the middle. */
const frondBlade = (tipX: number, tipY: number, width: number): string => {
  const len = Math.hypot(tipX, tipY) || 1;
  const nx = -tipY / len;
  const ny = tipX / len;
  const c1x = tipX * 0.35 + nx * width;
  const c1y = tipY * 0.35 + ny * width;
  const c2x = tipX * 0.65 - nx * width;
  const c2y = tipY * 0.65 - ny * width;
  return `M 0 0 Q ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q ${c2x.toFixed(1)} ${c2y.toFixed(1)} 0 0 Z`;
};

const ScenePalms: Scene = (px) => (
  <g fill="currentColor" opacity="0.13">
    {PALM_LAYOUT.map((p, i) => (
      <g key={i} transform={`translate(${p.cx + px} ${GROUND})`}>
        {/* Tapered trunk with a slight natural curve, heel at the base */}
        <path
          d={`M -4 ${GROUND_SINK}
              C -4 ${-p.h * 0.3} ${-4 + p.lean * 0.7} ${-p.h * 0.72} ${-3 + p.lean} ${-p.h}
              L ${3 + p.lean} ${-p.h}
              C ${4 + p.lean * 0.7} ${-p.h * 0.72} 4 ${-p.h * 0.3} 4 ${GROUND_SINK} Z`}
        />
        {/* Collar where fronds meet the trunk */}
        <ellipse cx={p.lean} cy={-p.h} rx="6" ry="3" opacity="0.7" />
        {/* Seven fronds fan out from the crown: outer pair droops lowest,
            mid pair sweeps up, and a near-vertical spear in the center. */}
        <g transform={`translate(${p.lean} ${-p.h}) scale(${p.fScale})`}>
          <path d={frondBlade(-38, 22, 6)} />
          <path d={frondBlade(-30, 2, 6)} />
          <path d={frondBlade(-22, -22, 5)} />
          <path d={frondBlade(2, -44, 4)} />
          <path d={frondBlade(24, -22, 5)} />
          <path d={frondBlade(34, 2, 6)} />
          <path d={frondBlade(40, 22, 6)} />
          {/* Newest unfurled spear in the center */}
          <rect x="-1" y="-12" width="2" height="14" rx="1" />
        </g>
      </g>
    ))}
  </g>
);

const SceneHills: Scene = (px) => (
  <>
    <path d={`M -80 ${GROUND + GROUND_SINK} L -80 ${GROUND} Q ${80 + px} ${GROUND - 70} ${240 + px} ${GROUND} L ${240 + px} ${GROUND + GROUND_SINK} Z`} fill="currentColor" opacity="0.09" />
    <path d={`M 160 ${GROUND + GROUND_SINK} L 160 ${GROUND} Q ${320 + px} ${GROUND - 48} ${520 + px} ${GROUND} L ${520 + px} ${GROUND + GROUND_SINK} Z`} fill="currentColor" opacity="0.06" />
  </>
);

export const BACKGROUND_SCENE_OPTIONS: ReadonlyArray<{ id: BackgroundSceneId; label: string }> = [
  { id: 'sunset', label: 'Sunset' },
  { id: 'skyline', label: 'Skyline' },
  { id: 'park', label: 'Park' },
  { id: 'palms', label: 'Palms' },
  { id: 'hills', label: 'Hills' },
];

const SCENE_RENDERERS: Record<BackgroundSceneId, Scene> = {
  sunset: SceneSunset,
  skyline: SceneSkyline,
  park: ScenePark,
  palms: ScenePalms,
  hills: SceneHills,
};

const randomFallVariant = () => {
  // Full pool for every miss — shank (under-rotate) is allowed even when the
  // bot knew the trick. Not knowing it still forces shank via forcedFall.
  return FALL_VARIANT_OPTIONS[Math.floor(Math.random() * FALL_VARIANT_OPTIONS.length)].id;
};
/** How far a shanked trick gets before it dies — shared by flip and body spin. */
const SHANK_PROGRESS_MIN = 0.35;
const SHANK_PROGRESS_MAX = 0.90;
const randomShankProgress = () =>
  SHANK_PROGRESS_MIN + Math.random() * (SHANK_PROGRESS_MAX - SHANK_PROGRESS_MIN);
const randomBackgroundSceneId = () =>
  BACKGROUND_SCENE_OPTIONS[Math.floor(Math.random() * BACKGROUND_SCENE_OPTIONS.length)].id;

interface Pt {
  x: number;
  y: number;
}

interface Frame {
  t: number;
  board: { x: number; y: number; rot: number; sx: number; sy: number; griptape: boolean };
  body: { x: number; y: number; sx: number; rot: number };
  /** Raw signed rotation angles (deg). The 2D renderer keeps using the baked
   *  sx/sy squash factors; a renderer that can rotate for real (3D) uses
   *  these instead. flipDeg = around the board's long axis, yawDeg = board
   *  around the vertical axis, forwardPitchDeg = Dolphin/Forward-flip nose
   *  dive, bodyYawDeg = skater around the vertical axis. */
  spin3d: { flipDeg: number; yawDeg: number; forwardPitchDeg: number; bodyYawDeg: number };
  footL: Pt;
  footR: Pt;
  armFront: number;
  armBack: number;
  streetDist: number;
}

interface Feet {
  /** Canonical tail-side channel. Renderers map it to the rider's anatomy. */
  footL: Pt;
  /** Canonical nose-side channel. Renderers map it to the rider's anatomy. */
  footR: Pt;
}

// ---------- Per-frame math ----------

/** Board and feet stay glued: ollies, grinds/stalls, and 180s (board and body turn together). */
function boardGlued(spec: Spec): boolean {
  return !spec.flips && !spec.roll && spec.yaw === spec.bodyYaw;
}

/**
 * Shuvits and tre/laser-style 360 flips spin the board under the feet — the
 * readable catch is a front-foot stamp while the back foot stays tucked a beat
 * longer. Body-rotation combos (bigspins, FS/BS flips) keep a two-footed catch.
 */
function wantsFrontFootCatch(spec: Spec): boolean {
  if (spec.bodyYaw || spec.roll || spec.forwardFlip) return false;
  if (spec.yaw > 0 && !spec.flips) return true;
  if (spec.flips > 0 && spec.yaw >= 360) return true;
  return false;
}

/**
 * 0→1 through late flight: how hard the front foot has planted for the catch.
 * `p` is the catch/spin clock passed into feetForFlip (finishes at ~0.85 of
 * raw flight), so the plant is keyed to the last third of that clock — peaking
 * near the contact-sheet "catch" frame without dipping the foot mid-spin.
 */
function frontFootCatchPlant(p: number): number {
  return smoothstep(clamp01((p - 0.62) / 0.32));
}

function feetForFlip(spec: Spec, p: number, bodyYOffset: number, boardRot: number): Feet {
  const lift = Math.sin(p * Math.PI);
  const baselineY = FOOT_Y - bodyYOffset - 4;
  const popFromNose = spec.nollie;
  const popBaseX = popFromNose ? 25 : -25;
  const flickBaseX = popFromNose ? -25 : 25;
  const popOutward = popFromNose ? 1 : -1;
  const flickOutward = popFromNose ? -1 : 1;
  const catchPlant = wantsFrontFootCatch(spec) ? frontFootCatchPlant(p) : 0;

  // The frame channels are board roles, not anatomical labels: footR always
  // occupies the nose side and footL always occupies the tail side. Nollie
  // swaps which role pops/flicks, never which end of the board those channels
  // represent. This is what lets the renderer attach a real regular/goofy
  // skeleton without silently turning a kickflip into a heelflip.
  const fromPopAndFlick = (pop: Pt, flick: Pt): Feet => popFromNose
    ? { footR: pop, footL: flick }
    : { footR: flick, footL: pop };

  if (spec.flips && spec.yaw && !spec.forwardFlip && spec.yaw < 360) {
    // Varial / hardflip: kickflip-style flick + mild scoop. Dolphin keeps the
    // tre-style path below (it still has forwardFlip), so we only change
    // true 180-shuv flip combos here.
    const scoop = p < 0.35 ? 12 * Math.sin((p / 0.35) * Math.PI) : 0;
    const flickReach = spec.flipDir === -1 ? 12 : 8;
    return fromPopAndFlick(
      {
        x: popBaseX + popOutward * scoop,
        y: baselineY - lift * 11,
      },
      {
        x: flickBaseX + flickOutward * lift * flickReach,
        y: baselineY - lift * 17,
      },
    );
  } else if (spec.flips && spec.yaw) {
    // Tre-flip style (and dolphin): back-foot scoop, front foot out of the way.
    // For 360 flips the front/flick foot stamps the catch while the scooping
    // foot stays tucked a beat longer.
    const scoop = p < 0.3 ? 20 * Math.sin((p / 0.3) * Math.PI) : 0;
    const flickLift = lift * 25 * (1 - catchPlant);
    const popLift = lift * 8 + catchPlant * 16;
    const flickReturn = catchPlant * 10; // pull the kicked foot back over the bolts
    return fromPopAndFlick(
      {
        x: popBaseX + popOutward * scoop,
        y: baselineY - popLift,
      },
      {
        x: flickBaseX + flickOutward * lift * 8 * (1 - catchPlant) - flickOutward * flickReturn,
        y: baselineY - flickLift,
      },
    );
  } else if (spec.flips) {
    // Kickflip/Heelflip style: front foot flicks off the nose.
    // Kickflip and heelflip use opposite lateral edges in 3D; both extend the
    // flicking foot outward from its board end instead of moving the pop foot.
    const flickX = spec.flipDir === -1 ? 16 : 11;
    const flickY = spec.flipDir === -1 ? 26 : 23;
    return fromPopAndFlick(
      { x: popBaseX, y: baselineY - lift * 10 },
      {
        x: flickBaseX + flickOutward * lift * flickX,
        y: baselineY - lift * flickY,
      },
    );
  } else if (spec.roll) {
    // Impossible: the popping foot guides the wrap; the free foot tucks to
    // clear the board. Drive the tuck off an ease that rises and releases
    // without stalling at the apex (sin(πp) zeroed out mid-flight and read
    // as a pause).
    const wrapP = Math.min(1, p / 0.95);
    const tuck = Math.sin(Math.min(1, wrapP / 0.55) * Math.PI * 0.5);
    const release = smoothstep(clamp01((wrapP - 0.72) / 0.28));
    const tuckAmt = tuck * (1 - release);
    if (spec.nollie) {
      // Nollie pops the nose: front foot (footR) is the scooping foot.
      const scoopX = 25 - tuckAmt * 10;
      const scoopY = -tuckAmt * 8;

      return {
        footR: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
        footL: { x: -15, y: FOOT_Y - bodyYOffset - 4 - tuckAmt * 27 },
      };
    }

    // Regular: back foot (footL) is the scooping foot.
    const scoopX = -25 + tuckAmt * 10;
    const scoopY = -tuckAmt * 8;

    return {
      footL: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
      footR: { x: 15, y: FOOT_Y - bodyYOffset - 4 - tuckAmt * 27 },
    };
  } else if (boardGlued(spec)) {
    // Ollie family: the feet ride the rotated deck — front foot up the nose
    // on the pop, back foot down on the tail. popAngle already encodes the
    // stance (nollie pops the nose, +60; regular pops the tail, -60), so the
    // feet fall out of cos/sin(boardRot) without any nollie mirroring — return
    // early to skip the mirror block below (mirroring would push the front
    // foot back onto the tail and contradict the nose-down pop).
    const th = rad(boardRot);
    const footR = { x: 25 * Math.cos(th), y: FOOT_Y - 6 + 25 * Math.sin(th) - bodyYOffset };
    const footL = { x: -25 * Math.cos(th), y: FOOT_Y - 6 - 25 * Math.sin(th) - bodyYOffset };
    if (!spec.ollieNorth) return { footR, footL };

    // The front/nose foot comes off the deck and reaches north. In nollie that
    // is also the popping foot (footR): it snaps the nose first, then releases
    // while footL levels the board. Fakie keeps regular foot roles—only the
    // direction of travel reverses—so footR still kicks over the board's nose.
    // Let the ollie read cleanly first, then send the foot north once the deck
    // starts leveling. The smooth pulse gives the late extension a stylish
    // pause before it returns in time for the catch.
    const northP = clamp01((p - 0.32) / 0.62);
    const northExtension = Math.sin(smoothstep(northP) * Math.PI);
    // Favor horizontal travel over a tucked knee so the leg visibly straightens
    // through the stylish kick instead of only lifting above the deck.
    const northLift = northExtension * 36;
    const reach = northExtension * 32;
    return { footR: { x: footR.x + reach, y: footR.y - northLift }, footL };
  } else {
    // Shuvit family: the board spins beneath — tuck both knees out of the way.
    // Feet ease from the roll-in plant toward the ride-away plant across the
    // flight (matching x at both seams) instead of jumping straight to a
    // fixed tuck position, so the pop and the catch don't snap the feet
    // sideways. Nollie's roll-in/landing seats are handled explicitly (like
    // the ollie family above) since they aren't a mirror of the regular ones.
    // Front-foot catch: stamp the stance-front foot onto the deck while the
    // scooping foot stays tucked through the catch frame.
    const ease = Math.sin(p * Math.PI * 0.5);
    const frontLift = lift * 17 * (1 - catchPlant);
    const backLift = lift * 14 + catchPlant * 14;
    if (spec.nollie) {
      // Nollie: anatomical front foot is on the tail (footL).
      return {
        footR: {
          x: 34 - ease * 16,
          y: baselineY - backLift,
        },
        footL: {
          x: -8 - catchPlant * 4,
          y: baselineY - frontLift,
        },
      };
    }
    return {
      footR: {
        x: 10 + ease * 2 + catchPlant * 4,
        y: baselineY - frontLift,
      },
      footL: {
        x: -34 + ease * 19,
        y: baselineY - backLift,
      },
    };
  }
}

function computeFrame(
  t: number,
  spec: Spec,
  landed: boolean,
  fall: FallVariant,
  /** Fraction of the trick that completes on a shank (flip + body spin). */
  shankProgress = 0.65,
): Frame {
  let boardX = X0;
  let boardY = GROUND;
  let boardRot = 0;
  let sx = 1;
  let sy = 1;
  let bodyX = X0;
  // Switch riders stand a bit taller on the board, naturally straightening the knees
  let bodyYOffset = spec.stance === 'switch' ? -8 : 0;
  let bodySX = 1;
  let bodyRot = 0;
  let bodyFallY = 0;
  let footL: Pt | null = null;
  let footR: Pt | null = null;
  let armFront = Math.sin(t * 3) * 0.3;
  let armBack = Math.sin(t * 3 + Math.PI) * 0.3;
  let falling = false;
  let flipDeg = 0;
  let yawDeg = 0;
  let forwardPitchDeg = 0;
  let bodyYawDeg = 0;

  const popAngle = spec.nollie ? 60 : -60;

  if (t < ROLL_IN) {
    // Roll in with a bob, settled into a real crouch so BOTH knees clearly bend
    // forward. A shallow rest pose leaves the trailing leg near-straight, which
    // reads as the two knees bending in opposite directions.
    // Scale compression by trick difficulty (more flips/spins = deeper crouch)
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    // Nollie keeps its exaggerated load. Switch uses natural depth.
    const stanceLoad = spec.stance === 'nollie' ? 1.4 : 1;
    const crouchDepth = (22 + (complexity * 8)) * stanceLoad;
    const crouchRatio = clamp01((t - (ROLL_IN - 0.2)) / 0.2);
    bodyYOffset += Math.sin(t * 12) * 2 + crouchDepth * (0.5 + 0.5 * crouchRatio);

    // Feet tucked under the hips so the trailing leg bends as much as the lead
    // leg — both knees then track forward toward the nose instead of one bowing
    // hard while the other stays straight. In regular the back foot plants on
    // the tail to pop; in nollie the front foot shifts up onto the nose to pop
    // and the back foot moves toward the center, so the wind-up reads distinct.
    if (spec.nollie) {
      // Pop off the nose: front foot plants far forward, back foot stays near the bolts.
      footR = { x: 34, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -8, y: FOOT_Y - bodyYOffset - 4 };
    } else {
      // Pop off the tail: back foot plants far back on the tail, front foot stays near the bolts.
      footR = { x: 10, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -34, y: FOOT_Y - bodyYOffset - 4 };
    }

    // Wind up arms before pop — frontside winds up opening the chest (front arm
    // sweeps further forward), backside winds up closing (front arm tucks back).
    const windDir = spec.spinDir || 1;
    armFront = armFront * (1 - crouchRatio) + (0.8 + 0.4 * windDir) * crouchRatio;
    armBack = armBack * (1 - crouchRatio) - (0.5 + 0.3 * windDir) * crouchRatio;

    // Pre-rotation body lean: frontside opens the chest (lean toward the toes,
    // +x), backside winds up turning the back in first (lean toward the heels,
    // -x). Only for tricks with body rotation (180s, 360s, bigspins).
    if (spec.spinDir && spec.bodyYaw) {
      bodyX += spec.spinDir * spec.dir * 8 * crouchRatio;
    }
  } else if (t < ROLL_IN + FLIP_T) {
    const p = (t - ROLL_IN) / FLIP_T;
    
    // The "Catch": finish board rotation early so it holds flat before landing
    const catchP = Math.min(1, p / 0.85);
    // A "late" shuvit holds the board flat off the pop, then whips the rotation
    // through in the back half of the flight (the late scoop). Its yaw runs on a
    // delayed clock; everything else (pop arc, catch) stays on catchP.
    const rawSpinP = spec.late ? clamp01((p - 0.38) / 0.30) : catchP;
    // Pure shuvits (no flip, no body rotation) decelerate into the catch
    // instead of snapping to a dead stop mid-air — flip/bigspin families keep
    // the linear clock since their sy/pitch curves already read fine at
    // constant angular speed.
    const shuvitFamily = spec.yaw > 0 && !spec.bodyYaw && !spec.flips && !spec.forwardFlip;
    const spinP = shuvitFamily ? easeOutCubic(rawSpinP) : rawSpinP;
    
    // Shank: the trick dies mid-rotation. Flip and body spin (yaw) share the
    // same per-attempt progress (35–90%) so an under-rotated kickflip 180
    // reads as one incomplete move, not a flip with a frozen body.
    const shankScale = (!landed && fall === 'shank') ? shankProgress : 1;
    const shankFlipScale = shankScale;
    const shankYawScale = shankScale;
    const shankBodyScale = shankScale;
    const shankRollScale = shankScale;
    
    boardY = GROUND - 4 * JUMP * p * (1 - p);
    // Lateral drift mid-spin: the board arcs toward the toes (frontside, -1)
    // or heels (backside, +1) so the spin reads with a direction. The drift
    // peaks at the rotation apex and returns to center for the catch.
    if (spec.spinDir && spec.yaw) {
      const driftAmp = spec.yaw >= 360 ? 11 : 8;
      boardX += spec.spinDir * spec.dir * driftAmp * Math.sin(p * Math.PI);
    }
    // Late tricks run the rotation on a delayed clock (spinP); for non-late
    // tricks spinP === catchP so this is a no-op.
    sy = spec.flips ? Math.cos(rad(spinP * spec.flips * 360 * shankFlipScale)) : 1;
    if (spec.yaw) {
      const c = Math.cos(rad(spinP * spec.yaw * shankYawScale));
      // A clean spin (no flip) reads better passing through the signed thin
      // edge; combined with a flip the scaleY rotation already carries it.
      sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
    }
    if (spec.bodyYaw) bodySX = signedSquash(Math.cos(rad(catchP * spec.bodyYaw * shankBodyScale)));
    // Raw angles for the 3D renderer — same clocks (spinP/catchP) as the
    // squash factors above, so late tricks and shanks carry over for free.
    flipDeg = spec.flipDir * spinP * spec.flips * 360 * shankFlipScale;
    yawDeg = (spec.spinDir || 1) * spinP * spec.yaw * shankYawScale;
    forwardPitchDeg = spec.forwardFlip ? spec.dir * spinP * 180 * shankYawScale : 0;
    bodyYawDeg = (spec.spinDir || 1) * catchP * spec.bodyYaw * shankBodyScale;
    // Impossible: one continuous wrap from the popped angle through a full
    // end-over-end revolution. A separate pop-taper + linear roll used to
    // nearly cancel mid-flight (board almost stops rotating, then restarts),
    // which read as two disjoint moves with a pause in the middle. Ease the
    // whole 360 across nearly the full hang time so it also doesn't finish
    // early and hang flat before the catch.
    if (spec.roll) {
      const wrapP = easeOutCubic(Math.min(1, p / 0.95));
      boardRot = popAngle + (spec.roll - popAngle) * wrapP * shankRollScale;
    } else if (spec.late) {
      // Late tricks: board stays flat after the pop (no wobble). Shuvits
      // add a scoop dip as the back foot whips the tail around mid-flight;
      // late flips skip the dip — the flip itself comes from sy + pitch.
      // smoothstep (zero slope at both ends) instead of a plain quadratic so
      // the decay settles into the flat hold instead of arriving at speed.
      boardRot = p < 0.3 ? popAngle * (1 - smoothstep(clamp01(p / 0.3))) : 0;
      if (spec.yaw) {
        const scoopPhase = clamp01((p - 0.38) / 0.30);
        const dipEase = Math.sin(clamp01(scoopPhase / 0.2) * Math.PI);
        const dipDir = spec.nollie ? 1 : -1; // tail dips down regardless of stance
        boardRot += dipEase * dipDir * -14;
      }
    } else if (p < 0.3) {
      // smoothstep (zero slope at both ends) instead of a plain quadratic so
      // the pop decay arrives at the wobble with zero velocity, not at speed.
      boardRot = popAngle * (1 - smoothstep(clamp01(p / 0.3)));
    } else {
      // Idle flight wobble, faded in from the pop-decay's zero so the handoff
      // doesn't jump straight to full amplitude mid-swing.
      const wobbleP = clamp01((p - 0.3) / 0.7);
      const wobbleFade = smoothstep(Math.min(1, wobbleP / 0.25));
      boardRot = Math.sin(wobbleP * Math.PI * 2) * 4 * wobbleFade;
    }

    // 360s shouldn't snap flat right off the pop. Let the nose hang and dip
    // deeper as the board comes around, then ease back to level for the catch.
    // Tune to taste: SPIN_DIP_DEG = how far the nose drops, SPIN_DIP_BIAS =
    // how late in the rotation the dip peaks (higher = closer to the end).
    if (spec.yaw >= 360) {
      const SPIN_DIP_DEG = 22;
      const SPIN_DIP_BIAS = 2.2;
      const dipDir = (spec.nollie ? -1 : 1) * (spec.spinDir || 1); // nose-down in the stance's frame, mirrored by fs/bs
      // sin() pins the dip to 0 at the pop and the catch; pow() pushes the peak
      // toward the end of the spin; smoothstep eases the leveling on the way out.
      const dipShape = Math.sin(catchP * Math.PI) * Math.pow(catchP, SPIN_DIP_BIAS);
      boardRot += dipDir * SPIN_DIP_DEG * dipShape;
    }

    // Add board pitch for kickflips (rocket up) vs heelflips (dive down).
    // Late tricks delay the pitch onto spinP so the board holds flat during
    // the hold phase, then pitches as the flip fires.
    // Varials stay flatter so the shuv+flip reads instead of a nose-dive;
    // dolphin/forwardFlip keeps the full pitch (handled in 3D via forwardPitchDeg).
    if (spec.flipDir) {
      const pitchAmp = spec.yaw && !spec.forwardFlip && spec.yaw < 360 ? 4 : 15;
      boardRot += spec.flipDir * Math.sin(spinP * Math.PI) * pitchAmp;
    }
    // Explode out of the crouch into a near-straight popping leg, then settle
    // into the mid-air tuck (glued) / stretch (flips). Without the early
    // stretch the body stays crouched through the snap and the popping knee
    // never opens — the tell is a bent back leg while the tail is still on
    // the ground. Flips get the full stretch later so the feet clear the board.
    const flightLift = Math.sin(Math.sqrt(p) * Math.PI);
    const popStretch = Math.exp(-p / 0.1) * (boardGlued(spec) ? 24 : 16);
    bodyYOffset += 30 - flightLift * (boardGlued(spec) ? 18 : 35) - popStretch;
    
    // Throw arms up and out during jump
    const jumpApex = Math.sin(p * Math.PI);
    const flail = (spec.stance === 'switch' || spec.stance === 'fakie') ? 1.4 : 1;
    armFront = (-1.2 + jumpApex * 0.8) * flail; 
    armBack = (1.0 - jumpApex * 0.6) * flail;
    
    // Add restrained rotational flair for spins. A full sin(2π) cycle made the
    // arms reverse direction halfway through the trick; when the near/far arm
    // changed under 3D depth sorting, that looked like one forearm teleporting
    // into a completely different pose. One half-sine gives a single smooth
    // sweep that returns to the catch pose without reversing mid-air.
    if (spec.bodyYaw) {
      const spinSign = spec.spinDir || 1;
      const armSweep = Math.sin(p * Math.PI) * 0.28 * flail * spinSign;
      armFront -= armSweep;
      armBack += armSweep;
    }
    
    if (spec.late) {
      if (spec.flips) {
        // Late flip: hold the board flat off the pop, then flick the flip
        // through in the back half of the flight. feetForFlip with spinP=0
        // gives planted feet (hold); as spinP ramps up the flick kicks in
        // on the delayed clock.
        const feet = feetForFlip(spec, spinP, bodyYOffset, boardRot);
        footL = feet.footL;
        footR = feet.footR;
      } else {
        // Late shuvit: back foot stays near the board during the hold phase,
        // then scoops backward/around to whip the board rotation mid-flight.
        // Finish with a front-foot catch — same stamp as a regular shuvit.
        const scoopP = clamp01((p - 0.38) / 0.30);
        // Quick pop-and-return scoop arc: peaks early, tapers back toward the
        // board as the rotation comes around so the foot doesn't hang out.
        const scoopArc = Math.sin(scoopP * Math.PI) * (1 - scoopP * 0.5);
        const catchPlant = frontFootCatchPlant(p);
        const th = rad(boardRot);
        const noseX = spec.nollie ? 25 : 10;
        const tailX = spec.nollie ? -10 : -25;
        const holdR = { x: noseX * Math.cos(th), y: FOOT_Y - 6 + noseX * Math.sin(th) - bodyYOffset };
        const holdL = { x: tailX * Math.cos(th), y: FOOT_Y - 6 + tailX * Math.sin(th) - bodyYOffset };
        // The actual popping end scoops outward. The other end lifts just
        // enough to clear the late rotation; rider stance does not alter this
        // nose/tail mechanic. CatchPlant then drops the front foot onto the
        // deck while the scooping foot stays tucked.
        if (spec.nollie) {
          footR = {
            x: holdR.x + scoopArc * 22,
            y: holdR.y - scoopArc * 16 - catchPlant * 12,
          };
          footL = {
            x: holdL.x + scoopArc * 8 * (1 - catchPlant),
            y: holdL.y - scoopArc * 10 * (1 - catchPlant),
          };
        } else {
          footR = {
            x: holdR.x - scoopArc * 8 * (1 - catchPlant),
            y: holdR.y - scoopArc * 10 * (1 - catchPlant),
          };
          footL = {
            x: holdL.x - scoopArc * 22,
            y: holdL.y - scoopArc * 16 - catchPlant * 12,
          };
        }
      }
    } else {
      const feet = feetForFlip(spec, catchP, bodyYOffset, boardRot);
      footL = feet.footL;
      footR = feet.footR;
    }
  } else if (landed) {
    // Compress on the catch, then ride away. After a 180/bigspin the skater
    // stays turned around (rides away switch).
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    const stanceLoad = spec.stance === 'nollie' ? 1.2 : 1;
    const landingCompression = (12 + (complexity * 6)) * stanceLoad;
    
    const p = clamp01((t - ROLL_IN - FLIP_T) / LAND_T);
    // Seed from the flight-end tuck (~30) so the knees stay bent through the
    // catch instead of snapping straight then re-bending (jitter).
    const FLIGHT_END_OFFSET = 30;
    const RIDE_AWAY_OFFSET = 6;
    if (p < 0.55) {
      const q = p / 0.55;
      const settle = easeInOutCubic(q);
      bodyYOffset += FLIGHT_END_OFFSET * (1 - settle) + RIDE_AWAY_OFFSET * settle + landingCompression * Math.sin(q * Math.PI);
    } else {
      bodyYOffset += RIDE_AWAY_OFFSET + Math.sin(t * 12) * 2;
    }
    // Narrow stance during compression so the back knee doesn't protrude
    // below the board, then smoothly widen back to the ride-away stance across
    // the settle phase so the foot doesn't jump at p=0.55.
    const narrowR = spec.nollie ? 18 : 10;
    const narrowL = spec.nollie ? -8 : -15;
    const wideR = spec.nollie ? 25 : 12;
    const wideL = spec.nollie ? -10 : -25;
    const wideBlend = p < 0.55 ? 0 : easeInOutCubic((p - 0.55) / 0.45);
    footR = { x: narrowR + (wideR - narrowR) * wideBlend, y: FOOT_Y - bodyYOffset - 4 };
    footL = { x: narrowL + (wideL - narrowL) * wideBlend, y: FOOT_Y - bodyYOffset - 4 };
    bodySX = Math.sign(Math.cos(rad(spec.bodyYaw))) || 1;
    // Trick complete: hold the final rotations (rides away turned after 180s).
    flipDeg = spec.flipDir * spec.flips * 360;
    yawDeg = (spec.spinDir || 1) * spec.yaw;
    forwardPitchDeg = spec.forwardFlip ? spec.dir * 180 : 0;
    bodyYawDeg = (spec.spinDir || 1) * spec.bodyYaw;
    
    // Arms come down to balance on landing
    const landP = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) : 0;
    armFront = armFront * (1 - p) + (Math.sin(t * 3) * 0.3 + landP * 0.5);
    armBack = armBack * (1 - p) + (Math.sin(t * 3 + Math.PI) * 0.3 - landP * 0.5);
  } else {
    // Fall: same physics language as a landing — impact, compress, settle —
    // with a different outcome. Seed from the flight-end tuck so the handoff
    // doesn't teleport limbs or arms into a separate ragdoll sim. Fakie
    // mirrors via spec.dir on the body group below.
    falling = true;
    const u = t - ROLL_IN - FLIP_T;

    // Flight-end hip offset (~30) matches the landed branch's FLIGHT_END_OFFSET
    // so a miss starts at the same height a catch would.
    const FALL_START_Y = 30 + (spec.stance === 'switch' ? -8 : 0);
    const FEET_PLANT_Y = 2;
    const FLIGHT_FOOT_Y = FOOT_Y - FALL_START_Y - 4;
    const PLANT_FOOT_Y = FOOT_Y - 2;
    // Flight-end arms (p→1 of the jump): apex term zeroes out, leaving the
    // thrown-up catch pose. Falls blend from here instead of snapping to flail.
    const FLIGHT_ARM_F = -1.2;
    const FLIGHT_ARM_B = 1.0;

    // Shared timing: a quick impact (like landing compression) then a settle
    // that fills the rest of FALL_T. Continuous curves — no hard phase cuts.
    const IMPACT_T = 0.4;
    const impact = easeInOutCubic(clamp01(u / IMPACT_T));
    const settle = easeOutCubic(clamp01((u - IMPACT_T) / Math.max(0.01, FALL_T - IMPACT_T)));
    // Soft secondary motion at landing-bob frequencies, not frantic flail.
    const wobble = (amp: number, freq: number, decay: number) =>
      amp * Math.sin(u * freq) * Math.exp(-decay * u);

    // Board leave eases with the body impact so deck and rider feel coupled.
    const boardLeave =
      fall === 'bail' ? -70
        : fall === 'slam' ? 85
          : 38; // shank: crooked, nearby
    boardX = X0 + spec.dir * boardLeave * easeOutCubic(clamp01(u / 0.55));

    let fx: number;
    let fy: number;

    if (fall === 'slam') {
      // Forward fold over planted feet — hips drop, torso follows.
      bodyRot = 90 * impact + 14 * settle + wobble(2.5, 5, 2.6);
      fx = 8 * impact + 20 * settle;
      fy = FALL_START_Y * (1 - impact) + FEET_PLANT_Y * impact + wobble(2, 6, 2.4);

      // Feet: flight tuck → plant + crumple (pull toward hip, stay in reach).
      const crumple = easeOutCubic(clamp01(u / 0.5));
      footR = clampFootReach({
        x: 12 + 6 * (1 - crumple),
        y: FLIGHT_FOOT_Y * (1 - crumple) + (PLANT_FOOT_Y - 10) * crumple,
      });
      footL = clampFootReach({
        x: -18 - 4 * crumple,
        y: FLIGHT_FOOT_Y * (1 - crumple) + (PLANT_FOOT_Y - 14) * crumple,
      });

      // Arms: flight pose → protective brace → quiet settle (land language).
      const brace = Math.sin(clamp01(u / IMPACT_T) * Math.PI);
      armFront = FLIGHT_ARM_F * (1 - impact) + (-0.35 + brace * 0.55) * impact + wobble(0.12, 4, 2);
      armBack = FLIGHT_ARM_B * (1 - impact) + (0.45 - brace * 0.35) * impact + wobble(0.1, 4.5, 2);
    } else if (fall === 'bail') {
      // Stepped off: jog out the speed, then settle like a heavy landing.
      const slow = easeOutCubic(clamp01(u / 0.85));
      fx = 95 * slow;
      // Same compression envelope as a catch: dip then ride-away height.
      const compress = Math.sin(clamp01(u / 0.45) * Math.PI);
      fy = FALL_START_Y * (1 - slow) + FEET_PLANT_Y * slow + 10 * compress * (1 - settle);
      bodyRot = 6 * Math.sin(clamp01(u / 0.35) * Math.PI) * (1 - settle) + wobble(2, 4.5, 2);

      // Gait decelerates with the body — cadence matches land bob, not a sprint.
      const runVigor = Math.exp(-1.6 * u);
      const planted = 1 - runVigor;
      const cycle = u * 9;
      const strideX = 16 * runVigor;
      const liftAmp = 12 * runVigor;
      const liftR = Math.max(0, Math.cos(cycle));
      const liftL = Math.max(0, -Math.cos(cycle));
      footR = clampFootReach({
        x: 12 + planted * 4 + Math.sin(cycle) * strideX,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - liftR * liftAmp + planted * 2) * impact,
      });
      footL = clampFootReach({
        x: -10 - planted * 4 + Math.sin(cycle + Math.PI) * strideX,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - liftL * liftAmp + planted * 2) * impact,
      });

      armFront = FLIGHT_ARM_F * (1 - impact)
        + (Math.sin(cycle) * 0.7 * runVigor + 0.35 * planted) * impact;
      armBack = FLIGHT_ARM_B * (1 - impact)
        + (-Math.sin(cycle) * 0.7 * runVigor - 0.25 * planted) * impact;
    } else if (fall === 'shank') {
      // Under-rotated: board lands crooked nearby, bot stumbles off it.
      // Freeze flip/yaw/body at the incomplete pose the flight died at — easing
      // those back to 0 made failed 180s slowly unwind to the start on the
      // ground. Only the crooked landing tilt (pitch) settles flat.
      const tiltSettle = Math.exp(-2.2 * u);
      boardRot = spec.roll ? spec.roll * shankProgress : 32 * tiltSettle;
      const shankAngle = spec.flips * 360 * shankProgress;
      sy = spec.flips ? Math.cos(rad(shankAngle)) : 1;
      if (spec.yaw) {
        const c = Math.cos(rad(spec.yaw * shankProgress));
        sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
      }
      if (spec.bodyYaw) {
        bodySX = signedSquash(Math.cos(rad(spec.bodyYaw * shankProgress)));
      }
      flipDeg = spec.flipDir * shankAngle;
      yawDeg = (spec.spinDir || 1) * spec.yaw * shankProgress;
      forwardPitchDeg = spec.forwardFlip ? spec.dir * 180 * shankProgress : 0;
      bodyYawDeg = (spec.spinDir || 1) * spec.bodyYaw * shankProgress;

      const slow = easeOutCubic(clamp01(u / 0.75));
      fx = 48 * slow;
      const compress = Math.sin(clamp01(u / 0.4) * Math.PI);
      fy = FALL_START_Y * (1 - slow) + FEET_PLANT_Y * slow + 7 * compress * (1 - settle);
      bodyRot = 12 * Math.sin(clamp01(u / 0.4) * Math.PI) * (1 - settle) + wobble(2.5, 5, 2);

      const vigor = Math.exp(-1.8 * u);
      const planted = 1 - vigor;
      const cycle = u * 8;
      const stride = 10 * vigor;
      footR = clampFootReach({
        x: 12 + planted * 3 + Math.sin(cycle) * stride,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - Math.max(0, Math.cos(cycle)) * 8 * vigor + planted * 2) * impact,
      });
      footL = clampFootReach({
        x: -10 - planted * 3 + Math.sin(cycle + Math.PI) * stride,
        y: FLIGHT_FOOT_Y * (1 - impact)
          + (PLANT_FOOT_Y - Math.max(0, -Math.cos(cycle)) * 8 * vigor + planted * 2) * impact,
      });

      armFront = FLIGHT_ARM_F * (1 - impact)
        + (Math.sin(cycle) * 0.9 * vigor + 0.3 * planted) * impact;
      armBack = FLIGHT_ARM_B * (1 - impact)
        + (-Math.sin(cycle) * 0.9 * vigor - 0.2 * planted) * impact;
    } else {
      fx = 0;
      fy = FALL_START_Y;
    }
    bodyX = X0 + spec.dir * fx;
    bodyRot *= spec.dir;
    bodyFallY = fy;
  }

  if (!footL || !footR) {
    // Ride-away plant. Mirror the stance so nollie's front foot lands forward
    // on the nose and the back foot centers, matching the wind-up pose.
    if (spec.nollie) {
      footR = { x: 25, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -10, y: FOOT_Y - bodyYOffset - 4 };
    } else {
      footR = { x: 12, y: FOOT_Y - bodyYOffset - 4 };
      footL = { x: -25, y: FOOT_Y - bodyYOffset - 4 };
    }
  }

  const bodyY = falling ? GROUND - LIFT + bodyFallY : boardY - LIFT + bodyYOffset;

  // Street distance: full speed during roll-in, flight, and ride-away;
  // decelerates during falls with the same impact→settle energy as the body
  // so the ground doesn't keep racing after the skater has already stopped.
  let streetDist = t;
  if (falling) {
    const u = t - ROLL_IN - FLIP_T;
    const FULL_SPEED_TIME = ROLL_IN + FLIP_T;
    const decayK =
      fall === 'slam' ? 2.4
        : fall === 'bail' ? 1.3
          : 1.9; // shank
    streetDist = FULL_SPEED_TIME + (1 - Math.exp(-decayK * u)) / decayK;
  }

  // Switch rides with the arms a touch more open: the front arm swings
  // further toward the nose, the back arm further toward the tail. Applied
  // after every phase so the crouch, flight, and landing all inherit it.
  if (spec.stance === 'switch') {
    armFront -= SWITCH_ARM_SPREAD;
    armBack += SWITCH_ARM_SPREAD;
  }

  return {
    t,
    board: { x: boardX, y: boardY, rot: boardRot, sx, sy, griptape: sy >= 0 },
    body: { x: bodyX, y: bodyY, sx: bodySX, rot: bodyRot },
    spin3d: { flipDeg, yawDeg, forwardPitchDeg, bodyYawDeg },
    footL,
    footR,
    armFront,
    armBack,
    streetDist,
  };
}

// Shared internals for the 3D renderer (TrickAnimation3D): same physics and
// stage constants, different projection.
export {
  specFor,
  computeFrame,
  knee,
  clampFootReach,
  darken,
  SCENE_RENDERERS,
  randomFallVariant,
  randomShankProgress,
  randomBackgroundSceneId,
  W,
  H,
  GROUND,
  X0,
  SKY_PAD,
  FOOT_Y,
  JUMP,
  ROLL_IN,
  FLIP_T,
  LAND_T,
  FALL_T,
  HOLD,
  STREET_DASH_PERIOD,
  STREET_DASH_SECONDS,
};
export type { Frame, Spec, Pt };

/** Keep a body-local foot target inside the two-bone leg's reachable length.
 *  Fall poses that push past this make the shin stretch from a clamped knee to
 *  an unreachable ankle — the "limbs disconnect" look in the screenshots. */
function clampFootReach(foot: Pt): Pt {
  const maxDist = THIGH + SHIN - 0.5;
  const dist = Math.hypot(foot.x, foot.y);
  if (dist <= maxDist || dist < 1e-6) return foot;
  const s = maxDist / dist;
  return { x: foot.x * s, y: foot.y * s };
}

/** Two-bone IK: knee position for a hip-to-foot leg.
 *  Always returns the solution where the knee protrudes toward the front
 *  (+x) so both legs read as bending the same way in a skate stance.
 *  Near full reach the artificial bend eases off so a pop snap can read as a
 *  straight leg instead of keeping the permanent KNEE_BEND_SCALE kink. */
function knee(foot: Pt): Pt {
  let { x: fx, y: fy } = clampFootReach(foot);
  const dist = Math.sqrt(fx * fx + fy * fy);
  const maxDist = THIGH + SHIN - 0.1;
  if (dist > maxDist) {
    const ratio = maxDist / dist;
    fx *= ratio;
    fy *= ratio;
  }
  const c = Math.min(Math.sqrt(fx * fx + fy * fy), THIGH + SHIN);
  const angleB = Math.acos((THIGH * THIGH + c * c - SHIN * SHIN) / (2 * THIGH * c)) || 0;
  const baseAngle = Math.atan2(fy, fx);
  const k1 = { x: THIGH * Math.cos(baseAngle - angleB), y: THIGH * Math.sin(baseAngle - angleB) };
  const k2 = { x: THIGH * Math.cos(baseAngle + angleB), y: THIGH * Math.sin(baseAngle + angleB) };
  const bent = k1.x >= k2.x ? k1 : k2;
  const straight = { x: fx / 2, y: fy / 2 };
  const reach = c / (THIGH + SHIN);
  const bendScale = KNEE_BEND_SCALE * (1 - Math.pow(reach, 6));
  return {
    x: straight.x + (bent.x - straight.x) * bendScale,
    y: straight.y + (bent.y - straight.y) * bendScale,
  };
}

// ---------- Component ----------

export default function TrickAnimation({
  robot,
  trick,
  landed,
  onDone,
  playbackRate = 1,
  backgroundSceneId,
  fallVariant,
  paused = false,
  knewIt,
  riderStance = 'regular',
  fixedTime,
}: Props) {
  // Not knowing the trick still forces shank; knowing it can still roll shank
  // randomly with the other miss styles.
  const forcedFall = !landed && knewIt === false ? 'shank' as FallVariant : undefined;
  const [randomizedFallVariant] = useState<FallVariant>(randomFallVariant);
  // Per-attempt under-rotation for shank (flip + body spin share this).
  const [shankProgress] = useState(randomShankProgress);
  // Fakie changes travel and nollie changes the pop end. Switch changes only
  // footedness/toeside; it is not simulated as fakie + nollie.
  const [spec] = useState(() => specFor(trick));
  const [randomizedBackgroundSceneId] = useState<BackgroundSceneId>(randomBackgroundSceneId);
  const resolvedFallVariant = forcedFall ?? fallVariant ?? randomizedFallVariant;
  const resolvedBackgroundSceneId = backgroundSceneId ?? randomizedBackgroundSceneId;
  const scene = SCENE_RENDERERS[resolvedBackgroundSceneId];
  const [frame, setFrame] = useState(() => computeFrame(0, spec, landed, resolvedFallVariant, shankProgress));
  const [isPlaying, setIsPlaying] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const pausedRef = useRef(paused);
  const effectivePlaybackRate = Math.max(0.05, playbackRate);
  // Static mode: one frozen frame, computed in render so a changed fixedTime
  // (e.g. a scrubber) re-renders without touching the playback machinery.
  const staticTime = fixedTime == null
    ? null
    : Math.max(0, Math.min(fixedTime, ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T)));

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Read pause state inside the rAF loop without restarting it (which would
  // reset the animation clock) when the prop toggles.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (staticTime != null) return;
    const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
    const durationMs = ((end + HOLD) / effectivePlaybackRate) * 1000;
    const finish = () => {
      setIsPlaying(false);
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    let raf = 0;
    let lastNow: number | null = null;
    let animationTime = 0;
    const tick = (now: number) => {
      if (lastNow === null) lastNow = now;
      const dt = (now - lastNow) / 1000;
      lastNow = now;
      // While paused, hold the clock so the current frame freezes in place.
      if (!pausedRef.current) {
        animationTime += dt * effectivePlaybackRate;
      }
      setFrame(computeFrame(Math.min(animationTime, end), spec, landed, resolvedFallVariant, shankProgress));
      if (animationTime >= end + HOLD) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // rAF stops in backgrounded tabs / locked screens; never leave the game
    // hanging on an attempt that can't finish. Don't trip while paused — the
    // user is deliberately holding the frame.
    let failSafe = 0;
    const armFailSafe = () => {
      failSafe = window.setTimeout(() => {
        if (pausedRef.current) {
          armFailSafe();
          return;
        }
        setFrame(computeFrame(end, spec, landed, resolvedFallVariant, shankProgress));
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, resolvedFallVariant, shankProgress, effectivePlaybackRate, replayNonce, staticTime]);

  const replay = () => {
    if (staticTime != null) return;
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant, shankProgress));
    setReplayNonce((current) => current + 1);
  };

  const colors = robot.avatar;
  const f = staticTime != null
    ? computeFrame(staticTime, spec, landed, resolvedFallVariant, shankProgress)
    : frame;
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  // Body rotation changes the visible side; rider footedness supplies the
  // baseline orientation. No stance turns the body; switch only flips which
  // side faces the camera (the rider's opposite footedness).
  const showBack = mechanics.orientationSign * f.body.sx < 0;
  const bodyFill = showBack ? darken(colors.body) : colors.body;
  // Frame channels are stable board roles, even when a foot reaches across
  // during a flick: R is nose and L is tail. Re-sorting by current x erased
  // the selected stance and could hand a kickflip path to the wrong foot.
  // Clamp again at draw time so a shin never stretches past the knee even if
  // a pose briefly overshoots leg length.
  const noseChannel = clampFootReach(f.footR);
  const tailChannel = clampFootReach(f.footL);
  const leftFoot = mechanics.noseFoot === 'left' ? noseChannel : tailChannel;
  const rightFoot = mechanics.noseFoot === 'right' ? noseChannel : tailChannel;
  const kneeL = knee(leftFoot);
  const kneeR = knee(rightFoot);
  const leftArmAngle = mechanics.frontArm === 'left' ? f.armFront : f.armBack;
  const rightArmAngle = mechanics.frontArm === 'right' ? f.armFront : f.armBack;
  const rightSideNear = mechanics.orientationSign * f.body.sx < 0;
  const farArmAngle = rightSideNear ? leftArmAngle : rightArmAngle;
  const nearArmAngle = rightSideNear ? rightArmAngle : leftArmAngle;
  const shoulder: Pt = { x: 5, y: -38 };
  const pivot = FOOT_Y - 2;
  // Board cosmetics — pure render, no physics. Deck fill flips with the board
  // so the dark griptape reads on the top side and the accent graphic on the
  // underside while it flips mid-air.
  const deckFill = f.board.griptape ? 'currentColor' : colors.accent;
  const WHEEL_X = 28;

  // For impossibles, pivot the board around the popping foot so the deck
  // wraps around it instead of spinning around its own center. The pivot is
  // the popping foot's world position; the transform rotates the board's
  // center offset around that pivot. When rot is a multiple of 360 (roll-in,
  // landing, fall) this is a no-op, so it's safe to always apply for roll
  // tricks.
  const isImpossible = spec.roll !== 0;
  const popFoot: Pt = isImpossible
    ? (mechanics.popFoot === 'left' ? leftFoot : rightFoot)
    : { x: 0, y: 0 };
  const pX = f.body.x + popFoot.x * f.body.sx;
  const pY = f.body.y + popFoot.y;
  const boardTransform = isImpossible
    ? `translate(${pX} ${pY}) rotate(${f.board.rot}) scale(${f.board.sx} ${f.board.sy}) translate(${f.board.x - pX} ${f.board.y - pY})`
    : `translate(${f.board.x} ${f.board.y}) rotate(${f.board.rot}) scale(${f.board.sx} ${f.board.sy})`;

  // Kickflip vs heelflip z-order follows the resolved toeside rather than a
  // hard-coded trick label. The anatomical flick foot changes for nollie.
  const skaterTransform = `translate(${f.body.x} ${f.body.y}) scale(${f.body.sx} 1) translate(0 ${pivot}) rotate(${f.body.rot}) translate(0 ${-pivot})`;
  const hasFlick = spec.flipDir !== 0;
  const inFlipPhase = f.t >= ROLL_IN && f.t < ROLL_IN + FLIP_T;
  const flickBehind = hasFlick && inFlipPhase && (spec.flipDir === 1) === (mechanics.orientationSign === 1);
  const flickFoot = mechanics.flickFoot === 'left' ? leftFoot : rightFoot;
  const flickKnee = mechanics.flickFoot === 'left' ? kneeL : kneeR;
  const hideLeftFlick = flickBehind && mechanics.flickFoot === 'left';
  const hideRightFlick = flickBehind && mechanics.flickFoot === 'right';
  const streetTranslate =
    -(((f.streetDist / STREET_DASH_SECONDS) * STREET_DASH_PERIOD * spec.dir) % STREET_DASH_PERIOD);
  const streetStyle = { '--street-translate': `${streetTranslate}px` } as CSSProperties;

  return (
    <div
      className={`trick-anim ${isPlaying && staticTime == null ? 'trick-anim--moving' : ''}`}
      style={streetStyle}
      data-rider-stance={riderStance}
      data-nose-foot={mechanics.noseFoot}
      data-body-yaw={mechanics.bodyYawDegrees}
      data-toe-side={mechanics.orientationSign}
      aria-label={`Replay ${robot.name} attempting ${trick.name}`}
      aria-roledescription="trick animation"
      role="button"
      tabIndex={0}
      onClick={replay}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        replay();
      }}
    >
      <svg viewBox={`0 ${-SKY_PAD} ${W} ${H + SKY_PAD}`} xmlns="http://www.w3.org/2000/svg">
        {/* Background scene motif; the full-width moving street layer lives in CSS. */}
        <g aria-hidden="true">{scene(0)}</g>

        {/* Anatomical flick foot rendered behind the board when it travels on
            the far side of the resolved rider orientation. */}
        {flickBehind && (
          <g transform={skaterTransform}>
            <g stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" fill="none">
              <line x1="0" y1="0" x2={flickKnee.x} y2={flickKnee.y} />
              <line x1={flickKnee.x} y1={flickKnee.y} x2={flickFoot.x} y2={flickFoot.y} />
            </g>
            <circle cx={flickKnee.x} cy={flickKnee.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />
            <rect x={flickFoot.x - 3} y={flickFoot.y - 3.5} width="13" height="7" rx="3.5" fill={colors.body} stroke="currentColor" strokeWidth="2" />
          </g>
        )}

        {/* Board */}
        <g transform={boardTransform}>
          {/* Deck with curved kicks, concave belly, and rounded rails */}
          <path
            d="M -44 -5 Q -38 -3.5 -31 -2.5 L -28 -2 Q 0 -1 28 -2 L 31 -2.5 Q 38 -3.5 44 -5 L 43 -3 Q 42.5 -1 40 0 L 30 2 Q 0 4 -30 2 L -40 0 Q -42.5 -1 -43 -3 Z"
            fill={deckFill}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Mount bolts */}
          <circle cx={-WHEEL_X - 8} cy="-1" r="1.2" fill="currentColor" opacity="0.4" />
          <circle cx={-WHEEL_X + 8} cy="-1" r="1.2" fill="currentColor" opacity="0.4" />
          <circle cx={WHEEL_X - 8} cy="-1" r="1.2" fill="currentColor" opacity="0.4" />
          <circle cx={WHEEL_X + 8} cy="-1" r="1.2" fill="currentColor" opacity="0.4" />
          {/* Trucks */}
          <rect x={-WHEEL_X - 5} y="2" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.45" />
          <rect x={WHEEL_X - 5} y="2" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.45" />
          {/* Wheels */}
          <circle cx={-WHEEL_X} cy="8" r="5" fill="#fbfbf3" stroke="currentColor" strokeWidth="2" />
          <circle cx={WHEEL_X} cy="8" r="5" fill="#fbfbf3" stroke="currentColor" strokeWidth="2" />
          <circle cx={-WHEEL_X} cy="8" r="1.8" fill={colors.accent} />
          <circle cx={WHEEL_X} cy="8" r="1.8" fill={colors.accent} />
        </g>

        {/* Skater */}
        <g transform={skaterTransform}>
          {/* camera-far arm (behind body) */}
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={shoulder.x + Math.sin(farArmAngle) * 30}
            y2={shoulder.y + Math.cos(farArmAngle) * 30}
            stroke={colors.accent}
            strokeWidth="6.5"
            strokeLinecap="round"
            opacity="0.4"
          />

          {/* legs */}
          <g stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" fill="none">
            {!hideLeftFlick && (
              <>
                <line x1="0" y1="0" x2={kneeL.x} y2={kneeL.y} />
                <line x1={kneeL.x} y1={kneeL.y} x2={leftFoot.x} y2={leftFoot.y} />
              </>
            )}
            {!hideRightFlick && (
              <>
                <line x1="0" y1="0" x2={kneeR.x} y2={kneeR.y} />
                <line x1={kneeR.x} y1={kneeR.y} x2={rightFoot.x} y2={rightFoot.y} />
              </>
            )}
          </g>

          {/* torso */}
          <rect x="-10" y="-50" width="22" height="50" rx="11" fill={bodyFill} stroke="currentColor" strokeWidth="2.5" />

          {/* neck */}
          <line x1="7" y1="-50" x2="7" y2="-56" stroke={colors.accent} strokeWidth="3" strokeLinecap="round" />
          {/* head */}
          <rect x="-6" y="-76" width="26" height="22" rx="8" fill={bodyFill} stroke="currentColor" strokeWidth="2.5" />
          {/* visor + eyes */}
          <rect x="0" y="-70" width="18" height="9" rx="4.5" fill="currentColor" opacity="0.85" />
          <circle cx="6" cy="-65.5" r="2.1" fill={colors.accent} />
          <circle cx="12" cy="-65.5" r="2.1" fill={colors.accent} />
          {/* antenna */}
          <line x1="7" y1="-76" x2="7" y2="-84" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="7" cy="-85.5" r="3" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />

          {/* joints */}
          <circle cx="0" cy="0" r="4.5" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />
          {!hideLeftFlick && <circle cx={kneeL.x} cy={kneeL.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />}
          {!hideRightFlick && <circle cx={kneeR.x} cy={kneeR.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />}

          {/* camera-near arm */}
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={shoulder.x + Math.sin(nearArmAngle) * 30}
            y2={shoulder.y + Math.cos(nearArmAngle) * 30}
            stroke={colors.accent}
            strokeWidth="6.5"
            strokeLinecap="round"
          />

          {/* boots */}
          {!hideLeftFlick && <rect x={leftFoot.x - 3} y={leftFoot.y - 3.5} width="13" height="7" rx="3.5" fill={colors.body} stroke="currentColor" strokeWidth="2" />}
          {!hideRightFlick && <rect x={rightFoot.x - 3} y={rightFoot.y - 3.5} width="13" height="7" rx="3.5" fill={colors.body} stroke="currentColor" strokeWidth="2" />}
        </g>
      </svg>
    </div>
  );
}

export function SlowMotionTrickAnimation(props: Omit<Props, 'playbackRate'>) {
  return <TrickAnimation {...props} playbackRate={SLOW_MOTION_PLAYBACK_RATE} />;
}
