'use client';

import type { Category } from '@/features/tricks';

export type ModeChoice = { kind: 'category'; category: Category } | { kind: 'dice' } | { kind: 'custom' };

interface Props {
  onPick: (mode: ModeChoice) => void;
}

const CARDS: { mode: ModeChoice; title: string; blurb: string; icon: string }[] = [
  { mode: { kind: 'category', category: 'flatground' }, title: 'Flatground', blurb: 'Flip tricks, shuvits & spins', icon: '🛹' },
  { mode: { kind: 'category', category: 'grinds' }, title: 'Grinds', blurb: 'Rails, ledges & slides', icon: '🛤️' },
  { mode: { kind: 'category', category: 'other' }, title: 'Other', blurb: 'Transition, manuals & more', icon: '🌀' },
  { mode: { kind: 'dice' }, title: 'Skate Dice', blurb: 'Roll a random trick to try', icon: '🎲' },
  { mode: { kind: 'custom' }, title: 'Custom', blurb: 'Build your own trick list', icon: '✨' },
];

export default function HomeScreen({ onPick }: Props) {
  return (
    <div className="container">
      <p className="home-intro">
        Play S.K.A.T.E. against a robot. You skate for real — the robot rolls the dice.
      </p>
      <div className="mode-grid">
        {CARDS.map((c) => (
          <button key={c.title} className="mode-card" onClick={() => onPick(c.mode)}>
            <span className="mode-icon" aria-hidden>{c.icon}</span>
            <span className="mode-title">{c.title}</span>
            <span className="mode-blurb">{c.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
