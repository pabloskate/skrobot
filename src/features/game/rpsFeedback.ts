'use client';

export type RpsSound = 'beat' | 'reveal' | 'win' | 'lose' | 'tie';

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

/** Lazy-created Web Audio context. Created on first user gesture. */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', when?: number) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (prefersReducedMotion()) return;

  const t = when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
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
  }
}
