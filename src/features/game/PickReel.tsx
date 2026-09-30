'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { readableAccent } from '@skrobot/animations';
import type { Robot } from '@/features/robots';
import { NAME_GONE, NAME_OUT, PICK_LOCK, REEL_START, reelPosition, type PickReelPlan } from './pickTimeline';
import { rpsSound, rpsVibrate } from './rpsFeedback';

const ROW_HEIGHT = 34;
const MAX_FONT = 30;
const MAX_WIDTH = 300;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (p: number) => {
  const x = clamp01(p);
  return x * x * (3 - 2 * x);
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let measure: CanvasRenderingContext2D | null | undefined;
const widthPerPx = new Map<string, number>();

/** Font size that fits a name on one line inside the stage. */
function fitFont(label: string): number {
  let per = widthPerPx.get(label);
  if (per === undefined) {
    if (measure === undefined) measure = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (measure) {
      measure.font = "800 100px Montserrat, system-ui, sans-serif";
      per = measure.measureText(label).width / 100 + 0.08;
      // Metrics taken before the web font arrives would stick; only keep real ones.
      if (document.fonts?.status === 'loaded') widthPerPx.set(label, per);
    } else {
      per = label.length * 0.66;
    }
  }
  return Math.min(MAX_FONT, MAX_WIDTH / per);
}

/**
 * The reel over the stage, in the sky above the robot. `t` is seconds from
 * the start of the robot's turn. Decorative: the status line under the stage
 * carries the same news, so the reel is hidden from assistive tech.
 */
export default function PickReel({ plan, robot, t }: { plan: PickReelPlan; robot: Robot; t: number }) {
  const blurId = `${useId().replace(/:/g, '')}-reel-blur`;
  // Reduced motion skips the spin: the name just fades in at the call.
  const [still] = useState(prefersReducedMotion);

  // A tick for each name that reaches the center (thinned while it rattles),
  // a buzz and a chime for the call.
  const heard = useRef({ t, tick: -1 });
  useEffect(() => {
    const prev = heard.current.t;
    heard.current.t = t;
    if (t <= prev) return;
    if (prev < PICK_LOCK && t >= PICK_LOCK) {
      rpsSound('call');
      rpsVibrate(18);
      return;
    }
    if (still || t - heard.current.tick < 0.045) return;
    if (plan.ticks.some((tick) => tick > prev && tick <= t)) {
      heard.current.tick = t;
      rpsSound('tick');
    }
  }, [t, plan.ticks, still]);

  if (t < REEL_START - 0.06 || t >= NAME_GONE) return null;
  const locked = t >= PICK_LOCK;
  if (still && !locked) return null;

  const accent = readableAccent(robot.avatar.accent);
  const lockAge = t - PICK_LOCK;
  const p = still ? plan.pickRow : reelPosition(t);
  const speed = Math.abs(reelPosition(t + 0.004) - reelPosition(t - 0.004)) / 0.008;
  const blur = locked || still ? 0 : Math.min(3.2, speed * 0.1);
  const enter = still ? clamp01(lockAge / 0.2) : smoothstep((t - REEL_START + 0.06) / 0.16);
  const out = smoothstep((t - NAME_OUT) / (NAME_GONE - NAME_OUT));
  const neighbours = locked ? 1 - clamp01(lockAge / 0.16) : 1;
  const slam = locked && !still ? 1 + 0.2 * Math.exp(-lockAge / 0.07) * Math.cos(lockAge * 22) : 1;

  const rows: ReactElement[] = [];
  for (let i = Math.floor(p) - 2; i <= Math.ceil(p) + 2; i++) {
    const trick = plan.rows[i];
    if (!trick) continue;
    const d = i - p;
    const isPick = locked && i === plan.pickRow;
    if (still && !isPick) continue;
    const opacity = isPick ? 1 : clamp01(1 - Math.abs(d) * 0.72) * neighbours;
    if (opacity <= 0.01) continue;
    const label = trick.name.toUpperCase();
    const scale = (0.6 + 0.4 * clamp01(1 - Math.abs(d))) * (isPick ? slam : 1);
    rows.push(
      <span
        key={i}
        className={`pick-reel-name${isPick ? ' pick-reel-name--pick' : ''}`}
        style={{
          fontSize: fitFont(label),
          opacity,
          transform: `translate(-50%, -50%) translateY(${(d * ROW_HEIGHT).toFixed(2)}px) scale(${scale.toFixed(3)})`,
          color: isPick ? accent : undefined,
        }}
      >
        {label}
      </span>,
    );
  }

  // The tape slaps on: quick fade, a swing and a shrink onto the name.
  const tapeIn = still ? 1 : clamp01(lockAge / 0.2);
  const tape = 1 - (1 - tapeIn) ** 3;
  return (
    <div
      className="pick-reel"
      aria-hidden="true"
      style={{ opacity: enter * (1 - out), transform: `translateY(${(-16 * out).toFixed(2)}px)` }}
    >
      {/* Inline size: the stage's own svg rules would otherwise size this one. */}
      <svg width="0" height="0" style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id={blurId} x="-5%" y="-60%" width="110%" height="220%">
          <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
        </filter>
      </svg>
      <div className="pick-reel-window" style={{ filter: blur > 0.05 ? `url(#${blurId})` : undefined }}>
        {rows}
      </div>
      {locked && (
        <span
          className="pick-reel-tape"
          style={{
            opacity: clamp01(tapeIn * 3),
            transform: `translateX(-50%) rotate(${(-4 + 12 * (1 - tape)).toFixed(2)}deg) scale(${(1 + 0.7 * (1 - tape)).toFixed(3)})`,
          }}
        >
          {robot.name} calls it
        </span>
      )}
    </div>
  );
}
