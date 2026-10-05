'use client';

import { getAudioContext } from './audio';

/** RPS beats plus the robot's trick call: a reel tick and the call itself. */
export type RpsSound = 'beat' | 'reveal' | 'win' | 'lose' | 'tie' | 'tick' | 'call';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Short vibration burst, guarded for mobile browsers. */
export function rpsVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore unsupported vibrate calls
  }
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', when?: number, peak = 0.2) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (prefersReducedMotion()) return;

  const t = when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function rpsSound(kind: RpsSound): void {
  if (prefersReducedMotion()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  switch (kind) {
    case 'beat':
      beep(800, 0.08, 'triangle', now);
      break;
    case 'reveal':
      beep(1200, 0.15, 'sine', now);
      break;
    case 'win':
      beep(880, 0.12, 'sine', now);
      beep(1100, 0.18, 'sine', now + 0.12);
      break;
    case 'lose':
      beep(400, 0.18, 'sawtooth', now);
      beep(300, 0.25, 'sawtooth', now + 0.18);
      break;
    case 'tie':
      beep(500, 0.1, 'square', now);
      beep(500, 0.1, 'square', now + 0.12);
      beep(500, 0.1, 'square', now + 0.24);
      break;
    case 'tick':
      beep(1700, 0.02, 'square', now, 0.03);
      break;
    case 'call':
      beep(660, 0.12, 'triangle', now, 0.12);
      beep(990, 0.16, 'triangle', now + 0.07, 0.12);
      break;
  }
}
