'use client';

import { useEffect, useRef, useState } from 'react';
import type { Robot } from '@/features/robots';
import type { Trick } from '@/features/tricks';

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
}

// ---------- Trick → animation family ----------

interface Spec {
  /** Full rotations around the board's long axis (kickflip family). */
  flips: number;
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
}

function specFor(trick: Trick): Spec {
  const base: Spec = {
    flips: 0,
    yaw: 0,
    bodyYaw: 0,
    roll: 0,
    nollie: trick.stance === 'nollie',
    dir: trick.stance === 'fakie' ? -1 : 1,
  };
  switch (trick.base) {
    case 'Kickflip':
    case 'Heelflip':
      return { ...base, flips: 1 };
    case 'Double Kickflip':
    case 'Double Heelflip':
      return { ...base, flips: 2 };
    case 'Varial Kickflip':
    case 'Varial Heelflip':
    case 'Hardflip':
    case 'Inward Heelflip':
    case 'Pressure Flip':
    case 'Dolphin Flip':
    case 'Hospital Flip':
    case 'Casper Flip':
      return { ...base, flips: 1, yaw: 180 };
    case '360 Flip':
    case 'Laser Flip':
      return { ...base, flips: 1, yaw: 360 };
    case 'Pop Shuvit':
    case 'Frontside Shuvit':
      return { ...base, yaw: 180 };
    case '360 Shuvit':
    case 'Frontside 360 Shuvit':
      return { ...base, yaw: 360 };
    case 'Bigspin':
    case 'FS Bigspin':
      // Board does a full 360 shuvit while the skater only turns 180.
      return { ...base, yaw: 360, bodyYaw: 180 };
    case 'Bigspin Flip':
    case 'FS Bigspin Flip':
    case 'Bigspin Heelflip':
    case 'FS Bigspin Heelflip':
      return { ...base, flips: 1, yaw: 360, bodyYaw: 180 };
    case 'Frontside 180':
    case 'Backside 180':
    case 'No Comply 180':
      return { ...base, yaw: 180, bodyYaw: 180 };
    case 'Backside Flip':
    case 'Frontside Flip':
    case 'Backside Heelflip':
    case 'Frontside Heelflip':
      return { ...base, flips: 1, yaw: 180, bodyYaw: 180 };
    case 'Backside 360':
    case 'Frontside 360':
      return { ...base, yaw: 360, bodyYaw: 360 };
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
const JUMP = 130;
const LIFT = 60; // hip height above the board
const FOOT_Y = 60; // feet below the hip
const THIGH = 35;
const SHIN = 35;

const ROLL_IN = 0.5;
const FLIP_T = 0.75;
const LAND_T = 0.95;
const FALL_T = 1.7;
const HOLD = 0.35; // freeze on the final frame before onDone

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const rad = (d: number) => (d * Math.PI) / 180;
/** Signed yaw squash: passes through a thin edge instead of vanishing. */
const signedSquash = (c: number) => (Math.abs(c) < 0.01 ? 0.15 : Math.sign(c) * (0.15 + 0.85 * Math.abs(c)));

type FallVariant = 'slam' | 'slip';

interface Pt {
  x: number;
  y: number;
}

interface Frame {
  t: number;
  board: { x: number; y: number; rot: number; sx: number; sy: number; griptape: boolean };
  body: { x: number; y: number; sx: number; rot: number };
  footL: Pt;
  footR: Pt;
  arm: number;
}

// ---------- Per-frame math ----------

/** Board and feet stay glued: ollies, grinds/stalls, and 180s (board and body turn together). */
function boardGlued(spec: Spec): boolean {
  return !spec.flips && !spec.roll && spec.yaw === spec.bodyYaw;
}

function feetForFlip(spec: Spec, p: number, bodyYOffset: number, boardRot: number): { footL: Pt; footR: Pt } {
  const lift = Math.sin(p * Math.PI);
  let feet: { footL: Pt; footR: Pt };
  if (spec.flips && spec.yaw) {
    // Tre-flip style: back-foot scoop, front foot out of the way.
    const scoop = p < 0.3 ? -20 * Math.sin((p / 0.3) * Math.PI) : 0;
    feet = {
      footL: { x: -25 + scoop, y: FOOT_Y - bodyYOffset - lift * 10 },
      footR: { x: 25 + lift * 5, y: FOOT_Y - bodyYOffset - lift * 35 },
    };
  } else if (spec.flips) {
    // Kickflip style: front foot flicks off the nose.
    feet = {
      footR: { x: 25 + lift * 10, y: FOOT_Y - bodyYOffset + 8 - lift * 15 },
      footL: { x: -25, y: FOOT_Y - bodyYOffset + 8 - lift * 25 },
    };
  } else if (boardGlued(spec)) {
    // Ollie family: the feet ride the rotated deck — front foot up the nose
    // on the pop, back foot down on the tail.
    const th = rad(boardRot);
    feet = {
      footR: { x: 25 * Math.cos(th), y: FOOT_Y - 6 + 25 * Math.sin(th) - bodyYOffset },
      footL: { x: -25 * Math.cos(th), y: FOOT_Y - 6 - 25 * Math.sin(th) - bodyYOffset },
    };
  } else {
    // Shuvit family: the board spins beneath — tuck both knees out of the way.
    feet = {
      footR: { x: 25, y: FOOT_Y - bodyYOffset - 8 - lift * 22 },
      footL: { x: -25, y: FOOT_Y - bodyYOffset - 8 - lift * 18 },
    };
  }
  if (spec.nollie) {
    // Nollie pops the nose: mirror the feet so the front foot does the pop
    // and the flick goes off the tail.
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
  let arm = Math.sin(t * 3) * 0.3;
  let falling = false;

  const popAngle = spec.nollie ? 60 : -60;

  if (t < ROLL_IN) {
    // Roll in with a bob, crouching just before the pop.
    bodyYOffset = Math.sin(t * 12) * 2 + 14 * clamp01((t - (ROLL_IN - 0.2)) / 0.2);
  } else if (t < ROLL_IN + FLIP_T) {
    const p = (t - ROLL_IN) / FLIP_T;
    boardY = GROUND - 4 * JUMP * p * (1 - p);
    sy = spec.flips ? Math.cos(rad(p * spec.flips * 360)) : 1;
    if (spec.yaw) {
      const c = Math.cos(rad(p * spec.yaw));
      // A clean spin (no flip) reads better passing through the signed thin
      // edge; combined with a flip the scaleY rotation already carries it.
      sx = spec.flips ? 0.2 + 0.8 * Math.abs(c) : signedSquash(c);
    }
    if (spec.bodyYaw) bodySX = signedSquash(Math.cos(rad(p * spec.bodyYaw)));
    boardRot = p < 0.3 ? popAngle * (1 - Math.pow(p / 0.3, 2)) : Math.sin(p * Math.PI * 2) * 4;
    boardRot += spec.roll * p;
    // When the board stays under the feet, keep the hip low so the knees read
    // as tucked mid-air; flips get the full stretch so the feet clear the board.
    bodyYOffset = 30 - Math.sin(Math.sqrt(p) * Math.PI) * (boardGlued(spec) ? 18 : 35);
    arm = -0.6;
    ({ footL, footR } = feetForFlip(spec, p, bodyYOffset, boardRot));
  } else if (landed) {
    // Compress on the catch, then ride away. After a 180/bigspin the skater
    // stays turned around (rides away switch).
    const p = clamp01((t - ROLL_IN - FLIP_T) / LAND_T);
    bodyYOffset = p < 0.55 ? 20 * Math.sin((p / 0.55) * Math.PI) : Math.sin(t * 12) * 2;
    bodySX = Math.sign(Math.cos(rad(spec.bodyYaw))) || 1;
  } else {
    // Bail: board shoots out, skater slams or slips out. Everything mirrors
    // with the direction of travel (fakie bails backwards).
    falling = true;
    const u = t - ROLL_IN - FLIP_T;
    boardX = X0 + spec.dir * 150 * (1 - Math.exp(-2.0 * u));

    let fx: number;
    let fy: number;
    if (fall === 'slam') {
      if (u < 0.55) {
        const q = easeInOutCubic(clamp01(u / 0.55));
        bodyRot = 105 * q;
        fx = 18 * q;
        fy = 55 * q;
      } else if (u < 0.95) {
        const q = clamp01((u - 0.55) / 0.4);
        bodyRot = 105 + 30 * (1 - Math.exp(-6 * q)) + 8 * Math.sin(q * Math.PI * 2) * Math.exp(-3 * q);
        fx = 18 + 22 * q;
        fy = 55 + 16 * Math.sin(q * Math.PI) * Math.exp(-2.2 * q);
      } else {
        const q = u - 0.95;
        fx = 40 + 90 * (1 - Math.exp(-1.4 * q));
        fy = 62 + 2 * Math.sin(q * 8) * Math.exp(-2 * q);
        bodyRot = 122 + 4 * Math.sin(q * 6) * Math.exp(-2 * q);
      }
      const p = clamp01(u / 0.7);
      footR = { x: spec.dir * (26 + 22 * p), y: FOOT_Y - 2 + 12 * p };
      footL = { x: spec.dir * (-22 - 14 * p), y: FOOT_Y - 2 + 26 * p };
      arm = -1.2 + Math.sin(u * 18) * 1.2 * Math.exp(-u * 0.8);
    } else {
      if (u < 0.32) {
        const q = easeInOutCubic(clamp01(u / 0.32));
        bodyRot = -55 * q;
        fx = -10 * q;
        fy = 18 * q;
      } else if (u < 0.78) {
        const q = clamp01((u - 0.32) / 0.46);
        bodyRot = -55 - 35 * (1 - Math.exp(-7 * q)) + 7 * Math.sin(q * Math.PI * 2) * Math.exp(-2.5 * q);
        fx = -10 - 22 * q;
        fy = 18 + 46 * (1 - Math.exp(-3.5 * q)) + 7 * Math.sin(q * Math.PI) * Math.exp(-2.0 * q);
      } else {
        const q = u - 0.78;
        fx = -32 - 34 * (1 - Math.exp(-2.0 * q));
        fy = 62 + 1.5 * Math.sin(q * 10) * Math.exp(-2.2 * q);
        bodyRot = -92 + 3.5 * Math.sin(q * 7) * Math.exp(-2.4 * q);
      }
      const p = clamp01(u / 0.55);
      footR = { x: spec.dir * (30 + 30 * p), y: FOOT_Y - 2 + 22 * p };
      footL = { x: spec.dir * (-12 + 18 * p), y: FOOT_Y - 2 + 18 * p };
      arm = -0.7 + Math.sin(u * 12) * 1.8 * Math.exp(-u * 0.9);
    }
    bodyX = X0 + spec.dir * fx;
    bodyRot *= spec.dir;
    bodyFallY = fy;
  }

  if (!footL || !footR) {
    footR = { x: 25, y: FOOT_Y - bodyYOffset - 4 };
    footL = { x: -25, y: FOOT_Y - bodyYOffset - 4 };
  }

  const bodyY = falling ? GROUND - LIFT + bodyFallY : boardY - LIFT + bodyYOffset;

  return {
    t,
    board: { x: boardX, y: boardY, rot: boardRot, sx, sy, griptape: sy >= 0 },
    body: { x: bodyX, y: bodyY, sx: bodySX, rot: bodyRot },
    footL,
    footR,
    arm,
  };
}

/** Two-bone IK: knee position for a hip-to-foot leg. */
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
  return { x: THIGH * Math.cos(baseAngle - angleB), y: THIGH * Math.sin(baseAngle - angleB) };
}

// ---------- Component ----------

export default function TrickAnimation({ robot, trick, landed, onDone }: Props) {
  const [fallVariant] = useState<FallVariant>(() => (Math.random() < 0.5 ? 'slam' : 'slip'));
  const [spec] = useState(() => specFor(trick));
  const [frame, setFrame] = useState(() => computeFrame(0, spec, landed, fallVariant));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const end = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
    const finish = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) / 1000;
      setFrame(computeFrame(Math.min(elapsed, end), spec, landed, fallVariant));
      if (elapsed >= end + HOLD) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // rAF stops in backgrounded tabs / locked screens; never leave the game
    // hanging on an attempt that can't finish.
    const failSafe = setTimeout(() => {
      setFrame(computeFrame(end, spec, landed, fallVariant));
      finish();
    }, (end + HOLD) * 1000 + 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, fallVariant]);

  const colors = robot.avatar;
  const f = frame;
  const kneeL = knee(f.footL);
  const kneeR = knee(f.footR);
  const shoulder: Pt = { x: 5, y: -45 };
  const pivot = FOOT_Y - 2;
  const moving = f.t > 0;

  return (
    <div className="trick-anim" aria-label={`${robot.name} attempts ${trick.name}`} role="img">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
        {/* Ground + speed lines */}
        <line x1="0" y1={GROUND + 9} x2={W} y2={GROUND + 9} stroke="#1e2235" strokeWidth="3" strokeLinecap="round" />
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
                stroke="#1e2235"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.2"
              />
            );
          })}

        {/* Board */}
        <g transform={`translate(${f.board.x} ${f.board.y}) rotate(${f.board.rot}) scale(${f.board.sx} ${f.board.sy})`}>
          <rect
            x="-40"
            y="-4"
            width="80"
            height="8"
            rx="4"
            fill={f.board.griptape ? '#1e2235' : colors.accent}
          />
          <circle cx="25" cy="8" r="6" fill="#fff" stroke="#1e2235" strokeWidth="2" />
          <circle cx="-25" cy="8" r="6" fill="#fff" stroke="#1e2235" strokeWidth="2" />
        </g>

        {/* Skater */}
        <g
          transform={`translate(${f.body.x} ${f.body.y}) scale(${f.body.sx} 1) translate(0 ${pivot}) rotate(${f.body.rot}) translate(0 ${-pivot})`}
        >
          {/* torso */}
          <line x1="0" y1="0" x2="5" y2="-50" stroke={colors.body} strokeWidth="10" strokeLinecap="round" />
          {/* head */}
          <line x1="7" y1="-76" x2="7" y2="-86" stroke={colors.accent} strokeWidth="3" />
          <circle cx="7" cy="-88" r="3.5" fill={colors.accent} />
          <rect x="-6" y="-76" width="26" height="22" rx="7" fill={colors.body} stroke="#1e2235" strokeWidth="2.5" />
          <circle cx="13" cy="-67" r="3.5" fill="#1e2235" />
          {/* arm */}
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={shoulder.x + Math.sin(f.arm) * 30}
            y2={shoulder.y + Math.cos(f.arm) * 30}
            stroke={colors.accent}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx={shoulder.x + Math.sin(f.arm) * 30} cy={shoulder.y + Math.cos(f.arm) * 30} r="4" fill={colors.accent} />
          {/* legs */}
          <g stroke="#1e2235" strokeWidth="5" strokeLinecap="round">
            <line x1="0" y1="0" x2={kneeL.x} y2={kneeL.y} />
            <line x1={kneeL.x} y1={kneeL.y} x2={f.footL.x} y2={f.footL.y} />
            <line x1="0" y1="0" x2={kneeR.x} y2={kneeR.y} />
            <line x1={kneeR.x} y1={kneeR.y} x2={f.footR.x} y2={f.footR.y} />
          </g>
          {/* joints */}
          <circle cx="0" cy="0" r="5" fill={colors.accent} />
          <circle cx={shoulder.x} cy={shoulder.y} r="4.5" fill={colors.accent} />
          <circle cx={kneeL.x} cy={kneeL.y} r="4" fill={colors.accent} />
          <circle cx={kneeR.x} cy={kneeR.y} r="4" fill={colors.accent} />
        </g>
      </svg>
    </div>
  );
}
