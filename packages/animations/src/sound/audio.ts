'use client';

/**
 * The page's one Web Audio context, shared by the RPS beeps and the trick
 * sounds. Created lazily; browsers start it suspended until the first user
 * gesture, so `unlockAudio` resumes it from inside one.
 */
let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
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

/**
 * The context, only if it's running now. Sounds scheduled on a suspended
 * context wait and then all play at once when it resumes, so anything timed
 * to the picture checks here first and skips the sound instead.
 */
export function runningAudioContext(): AudioContext | null {
  const ctx = getAudioContext();
  return ctx?.state === 'running' ? ctx : null;
}

let unlockArmed = false;

/**
 * Resume the context on the next tap, click, or key press. Safari only lets
 * audio start inside a gesture, and sounds driven by an animation clock
 * never are one.
 */
export function unlockAudio(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  if (audioCtx?.state === 'running') return;
  unlockArmed = true;
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const disarm = () => {
    for (const event of events) window.removeEventListener(event, unlock, true);
    unlockArmed = false;
  };
  function unlock() {
    const ctx = getAudioContext();
    if (!ctx) return disarm();
    ctx.resume().then(() => {
      if (ctx.state === 'running') disarm();
    }).catch(() => {});
  }
  for (const event of events) window.addEventListener(event, unlock, true);
}
