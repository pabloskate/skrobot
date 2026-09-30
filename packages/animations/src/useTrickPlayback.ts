'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkateStyle } from './types';
import {
  computeFrame, ROLL_IN, FLIP_T, LAND_T, FALL_T, HOLD,
  type Spec, type FallVariant,
} from './TrickAnimation';

interface Options {
  spec: Spec;
  landed: boolean;
  resolvedFallVariant: FallVariant;
  shankProgress: number;
  skateStyle: Readonly<SkateStyle>;
  onDone: () => void;
  paused: boolean;
  playbackRate: number;
  showSpeedToggle: boolean;
  fixedTime?: number;
  /** Seconds before the trick's t = 0 that the first run starts at. */
  leadIn?: number;
  /** Fires once, when the clock first reaches t = 0 after a lead-in. */
  onLeadInEnd?: () => void;
  /** Clock time the attempt ends at, for motions longer than a flatground trick. */
  end?: number;
}

/** Shared playback lifecycle for the active 3D renderers. Geometry stays in each renderer. */
export function useTrickPlayback({
  spec, landed, resolvedFallVariant, shankProgress, skateStyle,
  onDone, paused, playbackRate, showSpeedToggle, fixedTime,
  leadIn = 0, onLeadInEnd, end: endOverride,
}: Options) {
  // The trick's clock, negative during a lead-in. Frames clamp it to t >= 0.
  const [time, setTime] = useState(-leadIn);
  const [isPlaying, setIsPlaying] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const [selectedPlaybackRate, setSelectedPlaybackRate] = useState<0.5 | 1>(() => playbackRate === 0.5 ? 0.5 : 1);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const leadInDoneRef = useRef(leadIn <= 0);
  const onLeadInEndRef = useRef(onLeadInEnd);
  const pausedRef = useRef(paused);
  const seekRef = useRef<number | null>(null);
  const speedToggleVisible = showSpeedToggle && fixedTime == null;
  const effectivePlaybackRate = Math.max(0.05, speedToggleVisible ? selectedPlaybackRate : playbackRate);
  const end = endOverride ?? ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
  // Static mode: one frozen frame, computed in render so a changed fixedTime
  // (e.g. a scrubber) re-renders without touching the playback machinery.
  const staticTime = fixedTime == null
    ? null
    : Math.max(-leadIn, Math.min(fixedTime, end));
  const clock = staticTime ?? time;

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onLeadInEndRef.current = onLeadInEnd;
  }, [onLeadInEnd]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (staticTime != null) return;
    // Only the first run has the lead-in; a replay is just the trick.
    const start = replayNonce === 0 ? -leadIn : 0;
    const durationMs = ((end - start + HOLD) / effectivePlaybackRate) * 1000;
    const endLeadIn = () => {
      if (leadInDoneRef.current) return;
      leadInDoneRef.current = true;
      onLeadInEndRef.current?.();
    };
    const finish = () => {
      setIsPlaying(false);
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current();
      }
    };
    let raf = 0;
    let lastNow: number | null = null;
    let animationTime = start;
    const tick = (now: number) => {
      if (lastNow === null) lastNow = now;
      const dt = (now - lastNow) / 1000;
      lastNow = now;
      if (seekRef.current != null) {
        animationTime = Math.max(animationTime, seekRef.current);
        seekRef.current = null;
      } else if (!pausedRef.current) {
        animationTime += dt * effectivePlaybackRate;
      }
      if (animationTime >= 0) endLeadIn();
      setTime(Math.min(animationTime, end));
      if (animationTime >= end + HOLD) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let failSafe = 0;
    const armFailSafe = () => {
      failSafe = window.setTimeout(() => {
        if (pausedRef.current) {
          armFailSafe();
          return;
        }
        setTime(end);
        endLeadIn();
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
    // A new trick, outcome, or style restarts the clock, as does a replay.
  }, [spec, landed, resolvedFallVariant, shankProgress, skateStyle, end, leadIn, effectivePlaybackRate, replayNonce, staticTime]);

  const frame = useMemo(
    () => computeFrame(Math.max(0, Math.min(clock, end)), spec, landed, resolvedFallVariant, shankProgress, skateStyle),
    [clock, end, spec, landed, resolvedFallVariant, shankProgress, skateStyle],
  );

  const replay = () => {
    if (staticTime != null) return;
    setIsPlaying(true);
    setTime(0);
    setReplayNonce((current) => current + 1);
  };

  /** Jump the running clock forward to `to` (never back). */
  const seek = (to: number) => {
    if (staticTime != null) return;
    seekRef.current = to;
  };

  const togglePlaybackRate = () => {
    if (!speedToggleVisible) return;
    doneRef.current = false;
    setIsPlaying(true);
    setTime(0);
    setSelectedPlaybackRate((current) => current === 1 ? 0.5 : 1);
    setReplayNonce((current) => current + 1);
  };

  return {
    frame,
    /** The trick's clock: negative during the lead-in, capped at the end. */
    time: clock,
    /** False once a replay or speed change has restarted the trick. */
    firstRun: replayNonce === 0,
    isPlaying, staticTime, speedToggleVisible, effectivePlaybackRate,
    selectedPlaybackRate, replay, seek, togglePlaybackRate,
  };
}
