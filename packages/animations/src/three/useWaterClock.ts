import { useEffect, useRef, type RefObject } from 'react';
import type { SceneRenderer } from './renderer';

/** Live water keeps running between trick frames. A hidden stage or reduced-motion preference freezes it. */
export function useWaterClock(
  enabled: boolean,
  host: RefObject<HTMLDivElement | null>,
  renderer: RefObject<SceneRenderer | null>,
) {
  const read = useRef<() => number>(() => 0);
  useEffect(() => {
    const element = host.current;
    if (!enabled || !element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    let elapsed = 0;
    let started = 0;
    let interval = 0;
    const seconds = () => (elapsed + (interval ? performance.now() - started : 0)) / 1000;
    read.current = seconds;
    const stop = () => {
      if (!interval) return;
      elapsed += performance.now() - started;
      window.clearInterval(interval);
      interval = 0;
    };
    const sync = () => {
      if (!inView || document.hidden || motion.matches) {
        stop();
      } else if (!interval) {
        started = performance.now();
        interval = window.setInterval(() => renderer.current?.animateWater(seconds()), 1000 / 24);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      stop();
      read.current = () => 0;
    };
  }, [enabled, host, renderer]);
  return read;
}
