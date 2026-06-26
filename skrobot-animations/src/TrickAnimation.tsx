'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Robot } from './types';
import type { Trick } from './types';

/**
 * Side-view animated robot attempt: roll in, pop the trick, then catch it and
 * ride away — or slam. Board physics per trick family: flips are a cosine
 * scaleY (a heelflip reads identically to a kickflip in profile), shuvits and
 * spins are a scaleX yaw, tre flips combine both. Misses end in one of two
 * parametric falls (slam / slip) with the board shooting out.
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
  /** Nollie pops the nose, so the feet mirror (front foot pops, back foot flicks). */
  nollie: boolean;
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
    nollie: trick.stance === 'nollie',
    dir: trick.stance === 'fakie' ? -1 : 1,
    stance: trick.stance,
    spinDir: 0,
    late: false,
  };
  switch (trick.base) {
    case 'Kickflip':
      return { ...base, flips: 1, flipDir: 1 };
    case 'Heelflip':
      return { ...base, flips: 1, flipDir: -1 };
    case 'Double Kickflip':
      return { ...base, flips: 2, flipDir: 1 };
    case 'Double Heelflip':
      return { ...base, flips: 2, flipDir: -1 };
    case 'Varial Kickflip':
    case 'Hardflip':
    case 'Dolphin Flip':
    case 'Hospital Flip':
    case 'Casper Flip':
      return { ...base, flips: 1, yaw: 180, flipDir: 1, spinDir: 1 };
    case 'Varial Heelflip':
    case 'Inward Heelflip':
    case 'Pressure Flip':
      return { ...base, flips: 1, yaw: 180, flipDir: -1, spinDir: -1 };
    case '360 Flip':
      return { ...base, flips: 1, yaw: 360, flipDir: 1, spinDir: 1 };
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
    case 'Impossible':
      return { ...base, roll: trick.stance === 'fakie' || trick.stance === 'nollie' ? 360 : -360 };
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
// Extra sky above the viewBox so the taller pop doesn't clip the skater's head.
const SKY_PAD = 64;

const ROLL_IN = 0.5;
// Flight time obeys projectile motion: under constant gravity the air time
// scales with sqrt(height), so FLIP_T is derived from JUMP rather than tuned
// independently. Raising JUMP therefore slows every spin by the same physical
// law (more hang time = the 360 has longer to come around). Baseline: a 130px
// pop flew for 0.75s.
const FLIP_T = 0.75 * Math.sqrt(JUMP / 130);
const LAND_T = 0.95;
const FALL_T = 1.7;
const HOLD = 0.35; // freeze on the final frame before onDone
export const SLOW_MOTION_PLAYBACK_RATE = 0.38;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
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

export type FallVariant = 'slam' | 'slip' | 'bail' | 'tumble';
export type BackgroundSceneId = 'sunset' | 'skyline' | 'park' | 'palms' | 'hills';

export const FALL_VARIANT_OPTIONS: ReadonlyArray<{ id: FallVariant; label: string }> = [
  { id: 'slam', label: 'Slam' },
  { id: 'slip', label: 'Slip' },
  { id: 'bail', label: 'Bail' },
  { id: 'tumble', label: 'Tumble' },
];

// ---------- Background scenes ----------
// Little skate-spot silhouettes behind the action. One is picked per attempt
// (the component remounts each attempt, so the useState initializer re-rolls).
// Motifs parallax-drift slower than the speed lines for a sense of depth.

const SKY_TOP = '#ece5fb';
const SKY_HORIZON = '#f6e6d6';
const GROUND_FILL = '#e6e2f1';

type Scene = (px: number) => ReactElement;

const SceneSunset: Scene = (px) => (
  <>
    <circle cx={250 + px * 0.2} cy={GROUND - 46} r="30" fill="#ffd9a8" opacity="0.75" />
    <circle cx={250 + px * 0.2} cy={GROUND - 46} r="44" fill="#ffd9a8" opacity="0.22" />
  </>
);

const SceneSkyline: Scene = (px) => (
  <g fill="currentColor" opacity="0.12">
    {[-80, -10, 60, 150, 220, 300, 380, 470, 560].map((bx, i) => {
      const h = 36 + ((i * 41) % 64);
      const w = 34 + ((i * 17) % 24);
      return <rect key={i} x={bx + px} y={GROUND - h} width={w} height={h} />;
    })}
  </g>
);

const ScenePark: Scene = (px) => (
  <g fill="currentColor" opacity="0.1">
    {/* quarter-pipe on the right */}
    <path d={`M ${430 + px} ${GROUND} L ${430 + px} ${GROUND - 60} Q ${430 + px} ${GROUND - 100} ${490 + px} ${GROUND - 100} L ${490 + px} ${GROUND} Z`} />
    {/* flat rail on the left */}
    <rect x={50 + px} y={GROUND - 22} width="78" height="5" opacity="0.5" />
    <rect x={54 + px} y={GROUND - 17} width="4" height="17" opacity="0.5" />
    <rect x={120 + px} y={GROUND - 17} width="4" height="17" opacity="0.5" />
  </g>
);

const ScenePalms: Scene = (px) => (
  <g fill="currentColor" opacity="0.12">
    {[60, 280, 520].map((tx, i) => (
      <g key={i} transform={`translate(${tx + px} ${GROUND})`}>
        <path d="M -3 0 L -3 -86 L 3 -86 L 3 0 Z" />
        <path d="M 0 -86 q -30 -6 -44 8 q 26 -12 44 -2 Z" />
        <path d="M 0 -86 q 30 -6 44 8 q -26 -12 -44 -2 Z" />
        <path d="M 0 -86 q -22 -20 -6 -40 q -2 24 14 28 Z" />
        <path d="M 0 -86 q 22 -20 6 -40 q 2 24 -14 28 Z" />
      </g>
    ))}
  </g>
);

const SceneHills: Scene = (px) => (
  <>
    <path d={`M -80 ${GROUND} Q ${80 + px} ${GROUND - 70} ${240 + px} ${GROUND} Z`} fill="currentColor" opacity="0.09" />
    <path d={`M 160 ${GROUND} Q ${320 + px} ${GROUND - 48} ${520 + px} ${GROUND} Z`} fill="currentColor" opacity="0.06" />
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

const randomFallVariant = () => FALL_VARIANT_OPTIONS[Math.floor(Math.random() * FALL_VARIANT_OPTIONS.length)].id;
const randomBackgroundSceneId = () =>
  BACKGROUND_SCENE_OPTIONS[Math.floor(Math.random() * BACKGROUND_SCENE_OPTIONS.length)].id;

interface Pt {
  x: number;
  y: number;
}

interface Feet {
  footL: Pt;
  footR: Pt;
}

interface Frame {
  t: number;
  board: { x: number; y: number; rot: number; sx: number; sy: number; griptape: boolean };
  body: { x: number; y: number; sx: number; rot: number };
  footL: Pt;
  footR: Pt;
  armFront: number;
  armBack: number;
}

// ---------- Per-frame math ----------

/** Board and feet stay glued: ollies, grinds/stalls, and 180s (board and body turn together). */
function boardGlued(spec: Spec): boolean {
  return !spec.flips && !spec.roll && spec.yaw === spec.bodyYaw;
}

function feetForFlip(spec: Spec, p: number, bodyYOffset: number, boardRot: number): Feet {
  const lift = Math.sin(p * Math.PI);
  let feet: Feet;
  if (spec.flips && spec.yaw) {
    // Tre-flip style: back-foot scoop, front foot out of the way.
    const scoop = p < 0.3 ? -20 * Math.sin((p / 0.3) * Math.PI) : 0;
    feet = {
      footL: { x: -25 + scoop, y: FOOT_Y - bodyYOffset - lift * 10 },
      footR: { x: 25 + lift * 5, y: FOOT_Y - bodyYOffset - lift * 35 },
    };
  } else if (spec.flips) {
    // Kickflip/Heelflip style: front foot flicks off the nose.
    // Kickflip kicks back/down slightly, Heelflip kicks forward/up.
    const flickX = spec.flipDir === -1 ? 15 : -5;
    const flickY = spec.flipDir === -1 ? 30 : 25;
    // Baseline matches the deck top (FOOT_Y - bodyYOffset - 4) so the catch
    // frame plants the feet ON the board and hands off seamlessly to the
    // landing pose; the lift terms raise the feet off the deck mid-flick.
    feet = {
      footR: { x: 25 + lift * 10, y: FOOT_Y - bodyYOffset - 4 - lift * 15 },
      footL: { x: -25 + lift * flickX, y: FOOT_Y - bodyYOffset - 4 - lift * flickY },
    };
  } else if (spec.roll) {
    // Impossible: The board does a full backflip end-over-end.
    // The popping foot stays relatively planted on the board while the board
    // wraps around it. The free foot tucks high up to clear the board.
    
    if (spec.nollie) {
      // Nollie pops the nose: front foot (footR) is the scooping foot.
      const tuckLift = Math.sin(p * Math.PI) * 35;
      
      // The scoop foot pulls slightly back and up to guide the wrap
      const scoopX = 25 - Math.sin(p * Math.PI) * 10;
      const scoopY = -Math.sin(p * Math.PI) * 8;
      
      return {
        footR: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
        footL: { x: -15, y: FOOT_Y - bodyYOffset - 4 - tuckLift },
      };
    }
    // Regular: back foot (footL) is the scooping foot.
    const tuckLift = Math.sin(p * Math.PI) * 35;
    
    // The scoop foot pulls slightly forward and up to guide the wrap
    const scoopX = -25 + Math.sin(p * Math.PI) * 10;
    const scoopY = -Math.sin(p * Math.PI) * 8;
    
    return {
      footL: { x: scoopX, y: FOOT_Y - bodyYOffset - 4 + scoopY },
      footR: { x: 15, y: FOOT_Y - bodyYOffset - 4 - tuckLift },
    };
  } else if (boardGlued(spec)) {
    // Ollie family: the feet ride the rotated deck — front foot up the nose
    // on the pop, back foot down on the tail. popAngle already encodes the
    // stance (nollie pops the nose, +60; regular pops the tail, -60), so the
    // feet fall out of cos/sin(boardRot) without any nollie mirroring — return
    // early to skip the mirror block below (mirroring would push the front
    // foot back onto the tail and contradict the nose-down pop).
    const th = rad(boardRot);
    return {
      footR: { x: 25 * Math.cos(th), y: FOOT_Y - 6 + 25 * Math.sin(th) - bodyYOffset },
      footL: { x: -25 * Math.cos(th), y: FOOT_Y - 6 - 25 * Math.sin(th) - bodyYOffset },
    };
  } else {
    // Shuvit family: the board spins beneath — tuck both knees out of the way.
    feet = {
      footR: { x: 12, y: FOOT_Y - bodyYOffset - 8 - lift * 22 },
      footL: { x: -25, y: FOOT_Y - bodyYOffset - 8 - lift * 18 },
    };
  }
  if (spec.nollie) {
    // Nollie pops the nose: mirror the tuck/flick feet so the popping leg is
    // forward over the nose and the flick leg drops back to the tail. The
    // boardGlued family returns above and skips this (popAngle handles it).
    feet.footL.x = -feet.footL.x;
    feet.footR.x = -feet.footR.x;
  }
  return feet;
}

function computeFrame(t: number, spec: Spec, landed: boolean, fall: FallVariant): Frame {
  let boardX = X0;
  let boardY = GROUND;
  let boardRot = 0;
  let sx = 1;
  let sy = 1;
  let bodyX = X0;
  let bodyYOffset = 0;
  let bodySX = 1;
  let bodyRot = 0;
  let bodyFallY = 0;
  let footL: Pt | null = null;
  let footR: Pt | null = null;
  let armFront = Math.sin(t * 3) * 0.3;
  let armBack = Math.sin(t * 3 + Math.PI) * 0.3;
  let falling = false;

  const popAngle = spec.nollie ? 60 : -60;

  if (t < ROLL_IN) {
    // Roll in with a bob, settled into a real crouch so BOTH knees clearly bend
    // forward. A shallow rest pose leaves the trailing leg near-straight, which
    // reads as the two knees bending in opposite directions.
    // Scale compression by trick difficulty (more flips/spins = deeper crouch)
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    const stanceLoad = (spec.stance === 'switch' || spec.stance === 'nollie') ? 1.4 : 1;
    const crouchDepth = (22 + (complexity * 8)) * stanceLoad;
    const crouchRatio = clamp01((t - (ROLL_IN - 0.2)) / 0.2);
    bodyYOffset = Math.sin(t * 12) * 2 + crouchDepth * (0.5 + 0.5 * crouchRatio);

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
    const spinP = spec.late ? clamp01((p - 0.4) / 0.45) : catchP;

    boardY = GROUND - 4 * JUMP * p * (1 - p);
    // Lateral drift mid-spin: the board arcs toward the toes (frontside, -1)
    // or heels (backside, +1) so the spin reads with a direction. The drift
    // peaks at the rotation apex and returns to center for the catch.
    if (spec.spinDir && spec.yaw) {
      const driftAmp = spec.yaw >= 360 ? 18 : 12;
      boardX += spec.spinDir * spec.dir * driftAmp * Math.sin(p * Math.PI);
    }
    sy = spec.flips ? Math.cos(rad(catchP * spec.flips * 360)) : 1;
    if (spec.yaw) {
      const c = Math.cos(rad(spinP * spec.yaw));
      // A clean spin (no flip) reads better passing through the signed thin
      // edge; combined with a flip the scaleY rotation already carries it.
      sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
    }
    if (spec.bodyYaw) bodySX = signedSquash(Math.cos(rad(catchP * spec.bodyYaw)));
    // Impossible: one continuous ease-in curve — pop angle tapers off,
    // roll picks up smoothly, no wobble or direction reversal.
    if (spec.roll) {
      boardRot = popAngle * (1 - Math.pow(Math.min(1, p / 0.3), 2));
      boardRot += spec.roll * Math.pow(catchP, 2.2);
    } else {
      boardRot = p < 0.3 ? popAngle * (1 - Math.pow(p / 0.3, 2)) : Math.sin(catchP * Math.PI * 2) * 4;
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

    // Add board pitch for kickflips (rocket up) vs heelflips (dive down)
    if (spec.flipDir) {
      boardRot += spec.flipDir * Math.sin(catchP * Math.PI) * 15;
    }
    // When the board stays under the feet, keep the hip low so the knees read
    // as tucked mid-air; flips get the full stretch so the feet clear the board.
    bodyYOffset = 30 - Math.sin(Math.sqrt(p) * Math.PI) * (boardGlued(spec) ? 18 : 35);
    
    // Throw arms up and out during jump
    const jumpApex = Math.sin(p * Math.PI);
    const flail = (spec.stance === 'switch' || spec.stance === 'fakie') ? 1.4 : 1;
    armFront = (-1.2 + jumpApex * 0.8) * flail; 
    armBack = (1.0 - jumpApex * 0.6) * flail;
    
    // Add rotational flair for spins — arms swing in the direction of rotation
    if (spec.bodyYaw) {
      const spinSign = spec.spinDir || 1;
      armFront -= Math.sin(p * Math.PI * 2) * 0.8 * flail * spinSign;
      armBack += Math.sin(p * Math.PI * 2) * 0.8 * flail * spinSign;
    }
    
    const feet = feetForFlip(spec, catchP, bodyYOffset, boardRot);
    footL = feet.footL;
    footR = feet.footR;
  } else if (landed) {
    // Compress on the catch, then ride away. After a 180/bigspin the skater
    // stays turned around (rides away switch).
    const complexity = (spec.flips * 0.5) + (spec.yaw / 180 * 0.3) + (spec.roll ? 0.5 : 0);
    const stanceLoad = (spec.stance === 'switch' || spec.stance === 'nollie') ? 1.4 : 1;
    const landingCompression = (20 + (complexity * 10)) * stanceLoad;
    
    const p = clamp01((t - ROLL_IN - FLIP_T) / LAND_T);
    bodyYOffset = p < 0.55 ? landingCompression * Math.sin((p / 0.55) * Math.PI) : Math.sin(t * 12) * 2;
    bodySX = Math.sign(Math.cos(rad(spec.bodyYaw))) || 1;
    
    // Arms come down to balance on landing
    const landP = p < 0.55 ? Math.sin((p / 0.55) * Math.PI) : 0;
    armFront = armFront * (1 - p) + (Math.sin(t * 3) * 0.3 + landP * 0.5);
    armBack = armBack * (1 - p) + (Math.sin(t * 3 + Math.PI) * 0.3 - landP * 0.5);
  } else {
    // Bail: board shoots out, skater slams or slips out. Everything mirrors
    // with the direction of travel (fakie bails backwards).
    falling = true;
    const u = t - ROLL_IN - FLIP_T;

    // Body Y continuity. Just before the bail (trick flight end, p≈1) the
    // skater's hip sits at boardY - LIFT + bodyYOffset where bodyYOffset≈30,
    // i.e. ~30px above the standing-hip baseline (GROUND - LIFT). To avoid an
    // instant vertical teleport the moment the fall branch takes over, seed
    // bodyFallY from that offset and let the slam/slip/etc. drop extend it
    // further toward the ground. Positive = downward in screen space.
    const FALL_START_Y = 30;
    let boardShootOut = 150;
    if (fall === 'bail') boardShootOut = -80; // kicks board behind them
    else if (fall === 'slip') boardShootOut = 250; // classic banana peel
    else if (fall === 'slam') boardShootOut = 100;
    else if (fall === 'tumble') boardShootOut = -120; // caught on nose

    boardX = X0 + spec.dir * boardShootOut * (1 - Math.exp(-2.5 * u));

    let fx: number;
    let fy: number;
    // End-state body Y for rotation-driven falls (slam/tumble): we want the
    // skater "planted" on the ground, so the feet (at body-frame y=FOOT_Y-2)
    // land at the ground line. That means bodyFallY settles to FEET_PLANT_Y,
    // i.e. the body sinks FROM the airborne FALL_START_Y DOWN to FEET_PLANT_Y
    // (smaller value = higher on screen). The visible "drop" then comes from
    // the rotation folding the torso/head over the planted feet, not from
    // translating the whole body through the ground.
    const FEET_PLANT_Y = 2;
    if (fall === 'slam') {
      // Sink the hips down to plant the feet as the body folds forward.
      const plantP = easeInOutCubic(clamp01(u / 0.55));
      const plantedY = FALL_START_Y * (1 - plantP) + FEET_PLANT_Y * plantP;
      if (u < 0.55) {
        const q = easeInOutCubic(clamp01(u / 0.55));
        bodyRot = 95 * q;
        fx = 14 * q;
        fy = plantedY;
      } else if (u < 0.95) {
        const q = clamp01((u - 0.55) / 0.4);
        bodyRot = 95 + 22 * (1 - Math.exp(-6 * q)) + 6 * Math.sin(q * Math.PI * 2) * Math.exp(-3 * q);
        fx = 14 + 18 * q;
        fy = FEET_PLANT_Y + 6 * Math.sin(q * Math.PI) * Math.exp(-2.2 * q);
      } else {
        const q = u - 0.95;
        fx = 32 + 80 * (1 - Math.exp(-1.4 * q));
        fy = FEET_PLANT_Y + 2 * Math.sin(q * 8) * Math.exp(-2 * q);
        bodyRot = 110 + 4 * Math.sin(q * 6) * Math.exp(-2 * q);
      }
      // Feet stay planted where the skater left the board; knees crumple as
      // they fold forward. We do NOT mirror foot x with spec.dir here — the
      // body group is rotated (bodyRot *= spec.dir below) and that already
      // carries the direction. Mirroring x too would double-flip fakie falls
      // and make the knees fold backwards.
      const p = clamp01(u / 0.7);
      footR = { x: 24, y: FOOT_Y - 2 + 10 * p };
      footL = { x: -20 - 8 * p, y: FOOT_Y - 2 + 22 * p };
      armFront = -1.2 + Math.sin(u * 18) * 1.2 * Math.exp(-u * 0.8);
      armBack = 1.0 - Math.sin(u * 20) * 1.5 * Math.exp(-u * 0.9);
    } else if (fall === 'slip') {
      // Slip = feet shoot out, body drops backward onto the ground (butt
      // slam). Here bodyFallY genuinely grows large because the pivot slides
      // out from under the skater.
      if (u < 0.32) {
        const q = easeInOutCubic(clamp01(u / 0.32));
        bodyRot = -55 * q;
        fx = -10 * q;
        fy = FALL_START_Y + 12 * q;
      } else if (u < 0.78) {
        const q = clamp01((u - 0.32) / 0.46);
        bodyRot = -55 - 33 * (1 - Math.exp(-7 * q)) + 7 * Math.sin(q * Math.PI * 2) * Math.exp(-2.5 * q);
        fx = -10 - 22 * q;
        fy = FALL_START_Y + 12 + 36 * (1 - Math.exp(-3.5 * q)) + 7 * Math.sin(q * Math.PI) * Math.exp(-2.0 * q);
      } else {
        const q = u - 0.78;
        fx = -32 - 34 * (1 - Math.exp(-2.0 * q));
        fy = FALL_START_Y + 12 + 36 + 1.5 * Math.sin(q * 10) * Math.exp(-2.2 * q);
        bodyRot = -85 + 3.5 * Math.sin(q * 7) * Math.exp(-2.4 * q);
      }
      // Feet slide out from under the skater (banana peel). Direction handled
      // by bodyRot *= spec.dir, not by mirroring foot x.
      const p = clamp01(u / 0.55);
      footR = { x: 28 + 28 * p, y: FOOT_Y - 2 + 18 * p };
      footL = { x: -12 + 16 * p, y: FOOT_Y - 2 + 14 * p };
      armFront = -0.7 + Math.sin(u * 12) * 1.8 * Math.exp(-u * 0.9);
      armBack = 0.5 - Math.sin(u * 15) * 1.4 * Math.exp(-u * 0.8);
    } else if (fall === 'bail') {
      // Stepped off the board: a brief jog to run out the speed, decelerating
      // into a settled, slightly crouched stance. Feet stay planted on the
      // ground; the skater drops their hips (absorbing the landing) from the
      // mid-air continuity height down to the standing plant, plus a small
      // compression dip — so the bail reads as a fall, not a clean ride-away.
      const slow = 1 - Math.exp(-2.2 * u); // 0→1 decel envelope
      fx = 100 * slow;
      // Sink from airborne FALL_START_Y down to ~FEET_PLANT_Y, then add a
      // small landing compression that fades. Net: starts at the trick-end
      // height (no teleport), settles with feet on the ground after a dip.
      fy = FALL_START_Y * (1 - slow) + FEET_PLANT_Y * slow + 10 * slow * Math.exp(-2.5 * u) * (1 - Math.exp(-3 * u));
      bodyRot = 8 * Math.sin(u * 6) * Math.exp(-1.8 * u); // recovery wobble

      const runSpeed = 14;
      const cycle = u * runSpeed;
      // Vigor fades as the skater decelerates; feet lift mid-stride then settle
      // into a planted stance at the end.
      const runVigor = Math.exp(-2.0 * u);
      const settle = 1 - runVigor;
      const strideX = 22 * runVigor;
      const liftAmp = 18 * runVigor;

      // Walk gait, phased so each foot swings FORWARD while airborne, then
      // plants and is passed by the body (reads as planted-pushing-backward).
      // Lifting the foot exactly when its x swing is at the back of the
      // planted stroke and driving it forward through the air avoids the
      // "moonwalk" look (front leg swinging back while lifted).
      //   liftR peaks when cos(cycle) < 0  (footR in the air)
      //   x_R   = sin(cycle)             so during lift (cycle in (π/2,3π/2))
      //          x_R goes 1→-1→0, i.e. forward-then-back — net forward swing
      //   footL is the opposite phase (+π).
      const liftR = Math.max(0, Math.cos(cycle));
      const liftL = Math.max(0, -Math.cos(cycle));
      footR = {
        x: 12 + settle * 6 + Math.sin(cycle) * strideX,
        y: FOOT_Y - 2 - liftR * liftAmp + settle * 2,
      };
      footL = {
        x: -10 - settle * 6 + Math.sin(cycle + Math.PI) * strideX,
        y: FOOT_Y - 2 - liftL * liftAmp + settle * 2,
      };

      armFront = Math.sin(cycle) * 1.3 * runVigor + 0.4 * settle;
      armBack = -Math.sin(cycle) * 1.3 * runVigor - 0.3 * settle;
    } else { // tumble
      // Ragdoll roll: hips sink toward the ground as the body tucks and rolls,
      // then settle so the curled form rests on the ground.
      if (u < 0.35) {
        const q = easeInOutCubic(clamp01(u / 0.35));
        bodyRot = 150 * q;
        fx = 36 * q;
        fy = FALL_START_Y + (FEET_PLANT_Y + 8 - FALL_START_Y) * q;
      } else if (u < 0.8) {
        const q = clamp01((u - 0.35) / 0.45);
        bodyRot = 150 + 95 * (1 - Math.exp(-4 * q));
        fx = 36 + 46 * q;
        fy = FEET_PLANT_Y + 8 - 14 * Math.sin(q * Math.PI) * Math.exp(-2 * q); // bounce up mid-roll
      } else {
        const q = u - 0.8;
        bodyRot = 245 + 15 * (1 - Math.exp(-2 * q));
        fx = 82 + 18 * (1 - Math.exp(-2 * q));
        fy = FEET_PLANT_Y + 4 + 4 * (1 - Math.exp(-3 * q));
      }

      // Tuck in limbs during the roll (body-frame x, not dir-mirrored — the
      // group rotation handles fakie direction).
      const tuck = clamp01(Math.sin(clamp01(u / 1.1) * Math.PI));
      footR = { x: 14 - 14 * tuck, y: FOOT_Y - 2 - 35 * tuck };
      footL = { x: 4 - 18 * tuck, y: FOOT_Y - 2 - 30 * tuck };

      armFront = -0.5 - 2.5 * tuck;
      armBack = 0.5 - 2.5 * tuck;
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

  return {
    t,
    board: { x: boardX, y: boardY, rot: boardRot, sx, sy, griptape: sy >= 0 },
    body: { x: bodyX, y: bodyY, sx: bodySX, rot: bodyRot },
    footL,
    footR,
    armFront,
    armBack,
  };
}

/** Two-bone IK: knee position for a hip-to-foot leg.
 *  Always returns the solution where the knee protrudes toward the front
 *  (+x) so both legs read as bending the same way in a skate stance. */
function knee(foot: Pt): Pt {
  let { x: fx, y: fy } = foot;
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
  return k1.x >= k2.x ? k1 : k2;
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
}: Props) {
  const [randomizedFallVariant] = useState<FallVariant>(randomFallVariant);
  const [spec] = useState(() => specFor(trick));
  const [randomizedBackgroundSceneId] = useState<BackgroundSceneId>(randomBackgroundSceneId);
  const resolvedFallVariant = fallVariant ?? randomizedFallVariant;
  const resolvedBackgroundSceneId = backgroundSceneId ?? randomizedBackgroundSceneId;
  const scene = SCENE_RENDERERS[resolvedBackgroundSceneId];
  const [frame, setFrame] = useState(() => computeFrame(0, spec, landed, resolvedFallVariant));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const pausedRef = useRef(paused);
  const effectivePlaybackRate = Math.max(0.05, playbackRate);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Read pause state inside the rAF loop without restarting it (which would
  // reset the animation clock) when the prop toggles.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
    const durationMs = ((end + HOLD) / effectivePlaybackRate) * 1000;
    const finish = () => {
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
      setFrame(computeFrame(Math.min(animationTime, end), spec, landed, resolvedFallVariant));
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
        setFrame(computeFrame(end, spec, landed, resolvedFallVariant));
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, resolvedFallVariant, effectivePlaybackRate]);

  const colors = robot.avatar;
  const f = frame;
  // Which side of the bot faces the camera: switch/fakie start on the back
  // (dark) side; body rotation (bodySX sign) flips the facing. Combining the
  // stance sign with bodySX gives the currently visible side.
  //   regular/nollie → starts front (light), 180 lands on back (dark)
  //   switch/fakie   → starts back (dark), 180 lands on front (light)
  const stanceSign = spec.stance === 'switch' || spec.stance === 'fakie' ? -1 : 1;
  const showBack = stanceSign * f.body.sx < 0;
  const bodyFill = showBack ? darken(colors.body) : colors.body;
  const kneeL = knee(f.footL);
  const kneeR = knee(f.footR);
  const shoulder: Pt = { x: 5, y: -38 };
  const pivot = FOOT_Y - 2;
  const moving = f.t > 0;
  const bgPx = -spec.dir * f.t * 70;
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
  const popFoot: Pt = isImpossible ? (spec.nollie ? f.footR : f.footL) : { x: 0, y: 0 };
  const pX = f.body.x + popFoot.x * f.body.sx;
  const pY = f.body.y + popFoot.y;
  const boardTransform = isImpossible
    ? `translate(${pX} ${pY}) rotate(${f.board.rot}) scale(${f.board.sx} ${f.board.sy}) translate(${f.board.x - pX} ${f.board.y - pY})`
    : `translate(${f.board.x} ${f.board.y}) rotate(${f.board.rot}) scale(${f.board.sx} ${f.board.sy})`;

  // Kickflip vs heelflip z-order: the flicking foot (footR, the front foot)
  // flicks behind the board for kickflips (regular/nollie) and in front for
  // heelflips. Switch/fakie inverts the relationship. Only active during the
  // flip phase so the layering doesn't affect roll-in or landing poses.
  const skaterTransform = `translate(${f.body.x} ${f.body.y}) scale(${f.body.sx} 1) translate(0 ${pivot}) rotate(${f.body.rot}) translate(0 ${-pivot})`;
  const hasFlick = spec.flipDir !== 0;
  const inFlipPhase = f.t >= ROLL_IN && f.t < ROLL_IN + FLIP_T;
  const flickBehind = hasFlick && inFlipPhase && (spec.flipDir === 1) === (spec.stance === 'regular' || spec.stance === 'nollie');

  return (
    <div className="trick-anim" aria-label={`${robot.name} attempts ${trick.name}`} role="img">
      <svg viewBox={`0 ${-SKY_PAD} ${W} ${H + SKY_PAD}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="trick-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SKY_TOP} />
            <stop offset="100%" stopColor={SKY_HORIZON} />
          </linearGradient>
        </defs>
        {/* Background scene (sky + ground fill, then parallax silhouette motif) */}
        <rect x="0" y={-SKY_PAD} width={W} height={GROUND + SKY_PAD} fill="url(#trick-sky)" />
        <rect x="0" y={GROUND} width={W} height={H - GROUND} fill={GROUND_FILL} />
        <g aria-hidden="true">{scene(bgPx)}</g>

        {/* Ground + speed lines */}
        <line x1="0" y1={GROUND + 9} x2={W} y2={GROUND + 9} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {moving &&
          [0, 1, 2, 3].map((i) => {
            const x = ((((i * 140 - spec.dir * f.t * 300) % W) + W) % W);
            return (
              <line
                key={i}
                x1={x}
                y1={GROUND + 24}
                x2={x + 28 + i * 8}
                y2={GROUND + 24}
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.2"
              />
            );
          })}

        {/* Flicking foot + leg rendered behind the board for kickflips
            (regular/nollie) and heelflips (switch/fakie), so the foot reads
            as flicking off the far side of the deck. */}
        {flickBehind && (
          <g transform={skaterTransform}>
            <g stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" fill="none">
              <line x1="0" y1="0" x2={kneeR.x} y2={kneeR.y} />
              <line x1={kneeR.x} y1={kneeR.y} x2={f.footR.x} y2={f.footR.y} />
            </g>
            <circle cx={kneeR.x} cy={kneeR.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />
            <rect x={f.footR.x - 3} y={f.footR.y - 3.5} width="13" height="7" rx="3.5" fill={colors.accent} stroke="currentColor" strokeWidth="2" />
          </g>
        )}

        {/* Board */}
        <g transform={boardTransform}>
          {/* Symmetric deck with kicked nose and tail, rounded bottom corners, and concave belly. */}
          <path
            d="M -42 -7 L -30 -4 L 30 -4 L 42 -7 L 42 -2 Q 42 0 40 0.5 L 30 3 Q 0 5 -30 3 L -40 0.5 Q -42 0 -42 -2 Z"
            fill={deckFill}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx={-WHEEL_X} cy="7" r="5" fill="#fbfbf3" stroke="currentColor" strokeWidth="2" />
          <circle cx={WHEEL_X} cy="7" r="5" fill="#fbfbf3" stroke="currentColor" strokeWidth="2" />
          <circle cx={-WHEEL_X} cy="7" r="1.8" fill={colors.accent} />
          <circle cx={WHEEL_X} cy="7" r="1.8" fill={colors.accent} />
        </g>

        {/* Skater */}
        <g transform={skaterTransform}>
          {/* back arm (behind body) */}
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={shoulder.x + Math.sin(f.armBack) * 30}
            y2={shoulder.y + Math.cos(f.armBack) * 30}
            stroke={colors.accent}
            strokeWidth="6.5"
            strokeLinecap="round"
            opacity="0.4"
          />
          <circle cx={shoulder.x + Math.sin(f.armBack) * 30} cy={shoulder.y + Math.cos(f.armBack) * 30} r="4" fill={colors.accent} opacity="0.45" />

          {/* legs */}
          <g stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" fill="none">
            <line x1="0" y1="0" x2={kneeL.x} y2={kneeL.y} />
            <line x1={kneeL.x} y1={kneeL.y} x2={f.footL.x} y2={f.footL.y} />
            {!flickBehind && (
              <>
                <line x1="0" y1="0" x2={kneeR.x} y2={kneeR.y} />
                <line x1={kneeR.x} y1={kneeR.y} x2={f.footR.x} y2={f.footR.y} />
              </>
            )}
          </g>

          {/* torso */}
          <rect x="-10" y="-50" width="22" height="50" rx="11" fill={bodyFill} stroke="currentColor" strokeWidth="2.5" />

          {/* neck */}
          <line x1="7" y1="-50" x2="7" y2="-56" stroke={colors.accent} strokeWidth="3" strokeLinecap="round" />
          {/* head */}
          <rect x="-6" y="-76" width="26" height="22" rx="8" fill={bodyFill} stroke="currentColor" strokeWidth="2.5" />
          {/* visor + eye */}
          <rect x="-2" y="-70" width="18" height="9" rx="4.5" fill="currentColor" opacity="0.85" />
          <circle cx="12" cy="-65.5" r="2.4" fill={colors.accent} />
          {/* antenna */}
          <line x1="7" y1="-76" x2="7" y2="-84" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="7" cy="-85.5" r="3" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />

          {/* joints */}
          <circle cx="0" cy="0" r="4.5" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />
          <circle cx={shoulder.x} cy={shoulder.y} r="4.5" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />
          <circle cx={kneeL.x} cy={kneeL.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />
          {!flickBehind && <circle cx={kneeR.x} cy={kneeR.y} r="3.6" fill={colors.accent} stroke="currentColor" strokeWidth="1.2" />}

          {/* front arm */}
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={shoulder.x + Math.sin(f.armFront) * 30}
            y2={shoulder.y + Math.cos(f.armFront) * 30}
            stroke={colors.accent}
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          <circle cx={shoulder.x + Math.sin(f.armFront) * 30} cy={shoulder.y + Math.cos(f.armFront) * 30} r="4.5" fill={colors.accent} stroke="currentColor" strokeWidth="1.5" />

          {/* boots */}
          <rect x={f.footL.x - 3} y={f.footL.y - 3.5} width="13" height="7" rx="3.5" fill={colors.accent} stroke="currentColor" strokeWidth="2" />
          {!flickBehind && <rect x={f.footR.x - 3} y={f.footR.y - 3.5} width="13" height="7" rx="3.5" fill={colors.accent} stroke="currentColor" strokeWidth="2" />}
        </g>
      </svg>
    </div>
  );
}

export function SlowMotionTrickAnimation(props: Omit<Props, 'playbackRate'>) {
  return <TrickAnimation {...props} playbackRate={SLOW_MOTION_PLAYBACK_RATE} />;
}
