'use client';

import { useMemo, useState } from 'react';
import type { Stance, Trick } from './tricks';
import { grade } from './tricks';

interface Props {
  title: string;
  pool: Trick[];
  usedIds: Set<string>;
  onPick: (trick: Trick) => void;
  onClose: () => void;
}

const STANCE_TABS: { stance: Stance; label: string }[] = [
  { stance: 'regular', label: 'Regular' },
  { stance: 'fakie', label: 'Fakie' },
  { stance: 'switch', label: 'Switch' },
  { stance: 'nollie', label: 'Nollie' },
];

function DifficultyDots({ trick }: { trick: Trick }) {
  const g = grade(trick);
  return (
    <span className={`dots dots-${g}`} title={['Easy', 'Medium', 'Hard'][g - 1]} aria-label={['Easy', 'Medium', 'Hard'][g - 1]}>
      {'●'.repeat(g)}
      <span className="dots-empty">{'●'.repeat(3 - g)}</span>
    </span>
  );
}

/** Bottom-sheet trick browser: search across everything, stance tabs to browse. */
export default function TrickPicker({ title, pool, usedIds, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [stance, setStance] = useState<Stance>('regular');

  const hasStances = useMemo(() => pool.some((t) => t.stance !== 'regular'), [pool]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? pool.filter((t) => t.name.toLowerCase().includes(q))
      : hasStances
        ? pool.filter((t) => t.stance === stance)
        : pool;
    return [...list].sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  }, [pool, query, stance, hasStances]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search all tricks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {hasStances && !query.trim() && (
          <div className="tabs" role="tablist">
            {STANCE_TABS.map((t) => (
              <button
                key={t.stance}
                role="tab"
                aria-selected={stance === t.stance}
                className={`tab ${stance === t.stance ? 'tab-active' : ''}`}
                onClick={() => setStance(t.stance)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <ul className="trick-list">
          {shown.map((t) => {
            const used = usedIds.has(t.id);
            return (
              <li key={t.id}>
                <button className="trick-row" disabled={used} onClick={() => onPick(t)}>
                  <span>{t.name}</span>
                  {used ? <span className="trick-used">already set ✓</span> : <DifficultyDots trick={t} />}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="trick-empty">No tricks match.</li>}
        </ul>
      </div>
    </div>
  );
}
