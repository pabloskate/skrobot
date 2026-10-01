'use client';

import { useEffect, useRef, useState } from 'react';

/** Wall-clock seconds the last frame holds before a loop starts over. */
const LOOP_HOLD = 0.7;
/** Longest step one frame may take, so a backgrounded tab doesn't jump to the end. */
const MAX_STEP = 0.1;

export interface Playhead {
  /** Seconds into the trick. */
  time: number;
  playing: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Jump to a moment and hold there. */
  seek(time: number): void;
}

/**
 * The explorer's own clock for the trick: plays at `rate`, loops with a
 * short hold on the landing, and can be paused or scrubbed to any moment.
 * It starts playing from the top on mount; key the owner by trick to restart.
 */
export function usePlayhead(duration: number, rate: number, loop: boolean): Playhead {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  // The clock's source of truth between frames; `time` is its rendered copy.
  const clock = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    let held = 0;
    const tick = (now: number) => {
      const dt = last == null ? 0 : Math.min(MAX_STEP, (now - last) / 1000);
      last = now;
      if (clock.current >= duration) {
        if (!loop) {
          setPlaying(false);
          return;
        }
        held += dt;
        if (held >= LOOP_HOLD) {
          held = 0;
          clock.current = 0;
          setTime(0);
        }
      } else {
        clock.current = Math.min(duration, clock.current + dt * rate);
        setTime(clock.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration, rate, loop]);

  const play = () => {
    // From the end, play starts the trick over.
    if (clock.current >= duration) {
      clock.current = 0;
      setTime(0);
    }
    setPlaying(true);
  };
  const pause = () => setPlaying(false);
  const seek = (to: number) => {
    clock.current = Math.max(0, Math.min(duration, to));
    setTime(clock.current);
    setPlaying(false);
  };

  return { time, playing, play, pause, toggle: () => (playing ? pause() : play()), seek };
}
