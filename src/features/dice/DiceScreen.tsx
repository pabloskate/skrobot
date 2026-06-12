'use client';

import { useMemo, useState } from 'react';
import type { Category, Stance, Trick } from '@/features/tricks';
import { TRICKS, grade } from '@/features/tricks';

const CATS: { id: Category; label: string }[] = [
  { id: 'flatground', label: 'Flatground' },
  { id: 'grinds', label: 'Grinds' },
  { id: 'other', label: 'Other' },
];

const STANCES: { id: Stance; label: string }[] = [
  { id: 'regular', label: 'Regular' },
  { id: 'fakie', label: 'Fakie' },
  { id: 'switch', label: 'Switch' },
  { id: 'nollie', label: 'Nollie' },
];

/** Random trick generator — roll the dice, go try whatever comes up. */
export default function DiceScreen() {
  const [cats, setCats] = useState<Set<Category>>(new Set(['flatground']));
  const [stances, setStances] = useState<Set<Stance>>(new Set(['regular', 'fakie']));
  const [trick, setTrick] = useState<Trick | null>(null);
  const [rolling, setRolling] = useState(false);

  const pool = useMemo(
    () => TRICKS.filter((t) => cats.has(t.category) && (t.category !== 'flatground' || stances.has(t.stance))),
    [cats, stances],
  );

  const toggle = <T,>(set: Set<T>, value: T, update: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (next.size > 0) update(next);
  };

  const roll = () => {
    if (pool.length === 0) return;
    setRolling(true);
    setTimeout(() => {
      setTrick(pool[Math.floor(Math.random() * pool.length)]);
      setRolling(false);
    }, 700);
  };

  return (
    <div className="container">
      <div className="panel center">
        <div className={`dice-face ${rolling ? 'anim-roll' : ''}`} aria-hidden>
          🎲
        </div>
        {trick && !rolling ? (
          <>
            <h2 className="trick-callout">{trick.name}</h2>
            <p className="muted">{['Easy', 'Medium', 'Hard'][grade(trick) - 1]} · {trick.category}</p>
          </>
        ) : (
          <p className="muted">{rolling ? 'Rolling…' : 'Roll for a random trick to try.'}</p>
        )}
        <button className="btn-primary" onClick={roll} disabled={rolling || pool.length === 0}>
          {trick ? 'Roll again' : 'Roll'}
        </button>
      </div>

      <div className="panel">
        <h3 className="filter-title">Categories</h3>
        <div className="chip-row">
          {CATS.map((c) => (
            <button
              key={c.id}
              className={`chip ${cats.has(c.id) ? 'chip-on' : ''}`}
              onClick={() => toggle(cats, c.id, setCats)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {cats.has('flatground') && (
          <>
            <h3 className="filter-title">Stances</h3>
            <div className="chip-row">
              {STANCES.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${stances.has(s.id) ? 'chip-on' : ''}`}
                  onClick={() => toggle(stances, s.id, setStances)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="muted small">{pool.length} tricks in the pool</p>
      </div>
    </div>
  );
}
