'use client';

import { useEffect, useRef, useState } from 'react';
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
}

/** Shared playback lifecycle for the active 3D renderers. Geometry stays in each renderer. */
export function useTrickPlayback({
  spec, landed, resolvedFallVariant, shankProgress, skateStyle,
  onDone, paused, playbackRate, showSpeedToggle, fixedTime,
}: Options) {
  const [frame, setFrame] = useState(() =>
    computeFrame(0, spec, landed, resolvedFallVariant, shankProgress, skateStyle)
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [replayNonce, setReplayNonce] = useState(0);
  const [selectedPlaybackRate, setSelectedPlaybackRate] = useState<0.5 | 1>(() => playbackRate === 0.5 ? 0.5 : 1);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const pausedRef = useRef(paused);
  const speedToggleVisible = showSpeedToggle && fixedTime == null;
  const effectivePlaybackRate = Math.max(0.05, speedToggleVisible ? selectedPlaybackRate : playbackRate);
  // Static mode: one frozen frame, computed in render so a changed fixedTime
  // (e.g. a scrubber) re-renders without touching the playback machinery.
  const staticTime = fixedTime == null
    ? null
    : Math.max(0, Math.min(fixedTime, ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T)));

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

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
      if (!pausedRef.current) {
        animationTime += dt * effectivePlaybackRate;
      }
      setFrame(computeFrame(
        Math.min(animationTime, end),
        spec,
        landed,
        resolvedFallVariant,
        shankProgress,
        skateStyle,
      ));
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
        setFrame(computeFrame(end, spec, landed, resolvedFallVariant, shankProgress, skateStyle));
        finish();
      }, durationMs + 500);
    };
    armFailSafe();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(failSafe);
    };
  }, [spec, landed, resolvedFallVariant, shankProgress, skateStyle, effectivePlaybackRate, replayNonce, staticTime]);

  const replay = () => {
    if (staticTime != null) return;
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant, shankProgress, skateStyle));
    setReplayNonce((current) => current + 1);
  };

  const togglePlaybackRate = () => {
    if (!speedToggleVisible) return;
    doneRef.current = false;
    setIsPlaying(true);
    setFrame(computeFrame(0, spec, landed, resolvedFallVariant, shankProgress, skateStyle));
    setSelectedPlaybackRate((current) => current === 1 ? 0.5 : 1);
    setReplayNonce((current) => current + 1);
  };

  return {
    frame: staticTime != null
      ? computeFrame(staticTime, spec, landed, resolvedFallVariant, shankProgress, skateStyle)
      : frame,
    isPlaying, staticTime, speedToggleVisible, effectivePlaybackRate,
    selectedPlaybackRate, replay, togglePlaybackRate,
  };
}
