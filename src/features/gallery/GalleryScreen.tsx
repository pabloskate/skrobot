'use client';

import { useMemo, useState } from 'react';
import { TbPlayerPlayFilled, TbSearch } from 'react-icons/tb';
import type { Stance, Trick } from '@/features/tricks';
import { TRICKS, grade, trickDescription } from '@/features/tricks';
import { tipForTrick } from './tips';

const STANCE_CHIPS: { stance: Stance; label: string }[] = [
  { stance: 'regular', label: 'Regular' },
  { stance: 'fakie', label: 'Fakie' },
  { stance: 'switch', label: 'Switch' },
  { stance: 'nollie', label: 'Nollie' },
];

function DifficultyDots({ trick }: { trick: Trick }) {
  const g = grade(trick);
  return (
    <span className={`dots dots-${g}`} title={['Easy', 'Medium', 'Hard'][g - 1]}>
      {'●'.repeat(g)}
      <span className="dots-empty">{'●'.repeat(3 - g)}</span>
    </span>
  );
}

/** Trick tip gallery: search + stance chips + compact video cards (flatground only). */
export default function GalleryScreen() {
  const [query, setQuery] = useState('');
  const [stance, setStance] = useState<Stance>('regular');
  const [activeVideo, setActiveVideo] = useState<{ trick: Trick; ytId: string } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRICKS.filter((t) => {
      if (t.stance !== stance) return false;
      if (t.category !== 'flatground') return false;
      if (q && !t.name.toLowerCase().includes(q) && !trickDescription(t).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  }, [query, stance]);

  return (
    <div className="container gallery-screen">
      <div className="filter-bar">
        <div className="search-wrap">
          <TbSearch className="search-icon" aria-hidden />
          <input
            className="search"
            type="search"
            placeholder="Search tricks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="tabs" role="tablist">
          {STANCE_CHIPS.map((s) => (
            <button
              key={s.stance}
              role="tab"
              aria-selected={stance === s.stance}
              className={`tab ${stance === s.stance ? 'tab-active' : ''}`}
              onClick={() => setStance(s.stance)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="result-count">
        {shown.length} trick{shown.length === 1 ? '' : 's'} · {STANCE_CHIPS.find((s) => s.stance === stance)?.label}
        {query.trim() && ` · "${query.trim()}"`}
      </p>

      <ul className="gallery-list">
        {shown.map((t) => {
          const tip = tipForTrick(t);
          const desc = trickDescription(t);
          return (
            <li key={t.id}>
              <button
                className="trick-card"
                onClick={() => tip && setActiveVideo({ trick: t, ytId: tip.ytId })}
                disabled={!tip}
              >
                <div className="tc-thumb" data-cat={t.category}>
                  <span className="tc-play">
                    <TbPlayerPlayFilled aria-hidden />
                  </span>
                  {tip && <span className="tc-duration">{tip.duration}</span>}
                </div>
                <div className="tc-body">
                  <div className="tc-head">
                    <span className="tc-name">{t.name}</span>
                    <DifficultyDots trick={t} />
                  </div>
                  {tip && <span className="tc-meta">{tip.channel}</span>}
                  {desc && <p className="tc-desc">{desc}</p>}
                  {!tip && <p className="tc-desc muted">No tip video yet</p>}
                </div>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="trick-empty">No tricks match your filters.</li>
        )}
      </ul>

      {activeVideo && (
        <div className="modal" onClick={() => setActiveVideo(null)}>
          <div className="modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="modal-frame">
              <button className="modal-close" onClick={() => setActiveVideo(null)} aria-label="Close">
                ×
              </button>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.ytId}?autoplay=1&rel=0`}
                title={`${activeVideo.trick.name} tutorial`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="modal-title">{activeVideo.trick.name}</p>
            {trickDescription(activeVideo.trick) && (
              <p className="modal-desc">{trickDescription(activeVideo.trick)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
