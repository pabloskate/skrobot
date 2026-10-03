'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/** Wall-clock seconds the last frame holds before a loop starts over. */
const LOOP_HOLD = 0.7;
/** Longest step one frame may take, so a backgrounded tab doesn't jump to the end. */
const MAX_STEP = 0.1;
/**
 * At this rate and slower the stage draws at 30 fps: slowed down, the trick
 * moves so little between frames that drawing more of them only costs battery.
 */
const SLOW_RATE = 0.5;
const SLOW_INTERVAL = 1000 / 30;
/** Display frames skipped while the page warms up before judging the device. */
const WARMUP = 10;
/** Display frames per judgment. */
const PACE_WINDOW = 30;
/** Share of late display frames in a window that halves the frame rate. */
const LATE_SHARE = 0.25;
/** Gaps between animation frames shorter than this (ms) aren't a display's period. */
const MIN_GAP = 5;

/**
 * Set once this device has shown it can't draw the stage every display
 * frame. Kept for the page's life: a phone that can't keep up on one trick
 * won't on the next.
 */
let halfRate = false;

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
 *
 * Each frame renders synchronously inside the animation frame that asked for
 * it, so it reaches the screen on that display frame rather than a later one.
 * A device that keeps missing frames draws every other display frame instead:
 * an even 30 fps reads smoother than an uneven 45, and runs much cooler.
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
    let lastDraw = -Infinity;
    let held = 0;
    // The display's period: the shortest gap seen between animation frames.
    let vsync = Infinity;
    let seen = 0;
    let late = 0;
    const slow = rate <= SLOW_RATE;
    const draw = (now: number, to: number) => {
      lastDraw = now;
      flushSync(() => setTime(to));
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const gap = last == null ? 0 : now - last;
      const dt = Math.min(MAX_STEP, gap / 1000);
      last = now;
      if (gap >= MIN_GAP) {
        vsync = Math.min(vsync, gap);
        // Judge the device only while it's asked to draw every display frame.
        if (!slow && !halfRate && ++seen > WARMUP) {
          if (gap > vsync * 1.5) late++;
          if ((seen - WARMUP) % PACE_WINDOW === 0) {
            halfRate = late >= PACE_WINDOW * LATE_SHARE;
            late = 0;
          }
        }
      }
      if (clock.current >= duration) {
        if (!loop) {
          cancelAnimationFrame(raf);
          setPlaying(false);
          return;
        }
        held += dt;
        if (held >= LOOP_HOLD) {
          held = 0;
          clock.current = 0;
          draw(now, 0);
        }
        return;
      }
      clock.current = Math.min(duration, clock.current + dt * rate);
      if (clock.current < duration && vsync < Infinity) {
        const interval = Math.max(slow ? SLOW_INTERVAL : 0, halfRate ? vsync * 2 : 0);
        // Half a display frame of slack, so a frame landing a hair early still draws.
        if (now - lastDraw < interval - vsync / 2) return;
      }
      draw(now, clock.current);
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
