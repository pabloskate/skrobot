'use client';

import { useMemo, useState } from 'react';
import type { Trick } from './tricks';
import { TRICKS } from './tricks';

interface Props {
  onDone: (pool: Trick[]) => void;
}

const MIN_TRICKS = 5;

const GROUPS: { label: string; filter: (t: Trick) => boolean }[] = [
  { label: 'Flatground', filter: (t) => t.category === 'flatground' && t.stance === 'regular' },
  { label: 'Fakie', filter: (t) => t.stance === 'fakie' },
  { label: 'Switch', filter: (t) => t.stance === 'switch' },
  { label: 'Nollie', filter: (t) => t.stance === 'nollie' },
  { label: 'Grinds', filter: (t) => t.category === 'grinds' },
  { label: 'Other', filter: (t) => t.category === 'other' },
];

/** Build a custom trick list, then pick a robot to play it against. */
export default function CustomSetup({ onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? TRICKS.filter((t) => t.name.toLowerCase().includes(q)) : null),
    [q],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const row = (t: Trick) => (
    <li key={t.id}>
      <label className="check-row">
        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
        <span>{t.name}</span>
      </label>
    </li>
  );

  return (
    <div className="container custom">
      <p className="muted">Pick at least {MIN_TRICKS} tricks for your game, then choose your opponent.</p>
      <input
        className="search"
        type="search"
        placeholder="Search all tricks"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches ? (
        <ul className="trick-list">{matches.map(row)}</ul>
      ) : (
        GROUPS.map((g) => (
          <details key={g.label} className="group">
            <summary>
              {g.label}
              <span className="muted small"> · {TRICKS.filter(g.filter).filter((t) => selected.has(t.id)).length} selected</span>
            </summary>
            <ul className="trick-list">{TRICKS.filter(g.filter).map(row)}</ul>
          </details>
        ))
      )}
      <div className="sticky-footer">
        <button
          className="btn-primary"
          disabled={selected.size < MIN_TRICKS}
          onClick={() => onDone(TRICKS.filter((t) => selected.has(t.id)))}
        >
          {selected.size < MIN_TRICKS
            ? `Pick ${MIN_TRICKS - selected.size} more trick${MIN_TRICKS - selected.size === 1 ? '' : 's'}`
            : `Continue with ${selected.size} tricks`}
        </button>
      </div>
    </div>
  );
}
