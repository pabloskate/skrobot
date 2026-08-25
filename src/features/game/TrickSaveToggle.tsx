'use client';

import { useState } from 'react';
import { TbStar, TbStarFilled } from 'react-icons/tb';
import { getProvenTricks, getTrickMarks, setTrickMark } from '@/features/records';
import type { Trick } from '@/features/tricks';

/**
 * Quiet star on the defense panel: saves the trick the robot just set into the
 * player's want-to-learn list (the Tricks tab). The star must be tappable
 * before the player reports Landed/Missed — reporting ends the phase — so it
 * lives alongside the outcome buttons as a secondary action. Tricks already
 * proven in games are in the bag and can't be "wanted".
 */
export default function TrickSaveToggle({ trick }: { trick: Trick }) {
  const [proven] = useState(() => Boolean(getProvenTricks()[trick.id]));
  const [saved, setSaved] = useState(() => getTrickMarks()[trick.id] === 'learning');

  if (proven) return null;

  return (
    <button
      className={`save-trick ${saved ? 'save-trick-on' : ''}`}
      aria-pressed={saved}
      onClick={() => {
        const next = !saved;
        setSaved(next);
        setTrickMark(trick.id, next ? 'learning' : null);
      }}
      title={saved ? 'On your want-to-learn list — Tricks tab' : 'Save to your want-to-learn list'}
    >
      {saved ? <TbStarFilled aria-hidden /> : <TbStar aria-hidden />}
      <span>Want to learn</span>
    </button>
  );
}
