'use client';

import { TbSkateboard } from 'react-icons/tb';
import type { Category } from '@/features/tricks';

export type ModeChoice = { kind: 'category'; category: Category } | { kind: 'dice' } | { kind: 'custom' };

interface Props {
  onPick: (mode: ModeChoice) => void;
}

/** Board sliding down a handrail — Tabler has no grind-rail, so this matches its stroke style. */
const GrindRailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* Sloped rail with legs */}
    <path d="M3 9l18 7" />
    <path d="M7 10.5V19" />
    <path d="M17 14.5V19" />
    {/* Board grinding the rail, parallel to it */}
    <g transform="rotate(21 11 6)">
      <path d="M5.5 6h11" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="14" cy="8" r="1" fill="currentColor" />
    </g>
  </svg>
);

const CARDS: { mode: ModeChoice; title: string; blurb: string; icon: React.ReactNode }[] = [
  {
    mode: { kind: 'category', category: 'flatground' },
    title: 'Flatground',
    blurb: 'Flip tricks, shuvits & spins',
    icon: <TbSkateboard aria-hidden />,
  },
  {
    mode: { kind: 'category', category: 'grinds' },
    title: 'Grinds',
    blurb: 'Rails, ledges & slides',
    icon: <GrindRailIcon />,
  },
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
            <span className="mode-icon">{c.icon}</span>
            <span className="mode-title">{c.title}</span>
            <span className="mode-blurb">{c.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
