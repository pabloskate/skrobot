'use client';

import { useEffect, useRef } from 'react';
import { unlockAudio } from './audio';
import { LiveSoundtrack, loadRecordings } from './skateSounds';
import { soundtrackFor } from './soundtrack';
import type { StagePlan } from '../stage/stage';
import { useSoundEffects } from './preferences';

/**
 * Plays the attempt's sounds along with the clock its picture is drawn at,
 * when requested and the viewer has enabled sound effects.
 */
export function useTrickSound(stage: StagePlan, time: number, rate: number, requested: boolean) {
  const soundEffects = useSoundEffects();
  const enabled = requested && soundEffects;
  const player = useRef<LiveSoundtrack | null>(null);

  useEffect(() => {
    if (!enabled) return;
    unlockAudio();
    void loadRecordings();
    const live = new LiveSoundtrack(soundtrackFor(stage));
    player.current = live;
    return () => {
      live.dispose();
      player.current = null;
    };
  }, [stage, enabled]);

  useEffect(() => {
    player.current?.update(time, rate);
  }, [time, rate]);
}
