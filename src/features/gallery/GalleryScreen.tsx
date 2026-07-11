'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { TbPlayerPlayFilled, TbSearch, TbAdjustments } from 'react-icons/tb';
import { getProvenTricks, getTrickMarks, setTrickMark } from '@/features/records';
import type { TrickMark } from '@/features/records';
import type { Stance, Trick } from '@/features/tricks';
import { TRICKS, grade, trickDescription, trickMatchesSearch, tricksFor } from '@/features/tricks';
import { tipForTrick } from './tips';
import { computeBookView, inBag } from './trickBook';
import type { BookEntry, BookView } from './trickBook';

const STANCE_CHIPS: { stance: Stance; label: string }[] = [
  { stance: 'regular', label: 'Regular' },
  { stance: 'fakie', label: 'Fakie' },
  { stance: 'switch', label: 'Switch' },
  { stance: 'nollie', label: 'Nollie' },
];

type BookFilter = 'all' | 'bag' | 'learning' | 'todo';

const BOOK_CHIPS: { filter: BookFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'bag', label: 'My bag' },
  { filter: 'learning', label: 'Learning' },
  { filter: 'todo', label: 'Not yet' },
];

const FLATGROUND_TRICKS = tricksFor('flatground');

// --- Trick book store: localStorage-backed, shared via useSyncExternalStore
// (same pattern as HomeScreen's hero) so SSR renders the empty book and
// same-tab mark toggles re-render without a page event.

const INITIAL_BOOK = computeBookView(FLATGROUND_TRICKS, {}, {});
let bookCacheKey = '';
let bookCache = INITIAL_BOOK;

const bookListeners = new Set<() => void>();

function serverBookSnapshot(): BookView {
  return INITIAL_BOOK;
}

function browserBookSnapshot(): BookView {
  const marks = getTrickMarks();
  const proven = getProvenTricks();
  const key = JSON.stringify({ marks, proven });
  if (key !== bookCacheKey) {
    bookCacheKey = key;
    bookCache = computeBookView(FLATGROUND_TRICKS, marks, proven);
  }
  return bookCache;
}

function subscribeToBookChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  bookListeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    bookListeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** none ↔ learning. Proven is game evidence and never cycles. */
function cycleMark(trickId: string, entry: BookEntry | undefined): void {
  if (entry?.state === 'proven') return;
  const next: TrickMark | null = entry?.state === 'learning' ? null : 'learning';
  setTrickMark(trickId, next);
  bookListeners.forEach((notify) => notify());
}

function DifficultyDots({ trick }: { trick: Trick }) {
  const g = grade(trick);
  return (
    <span className={`dots dots-${g}`} title={['Easy', 'Medium', 'Hard'][g - 1]}>
      {[1, 2, 3].map((dot) => (
        <span key={dot} className={dot <= g ? 'dot dot-on' : 'dot'} />
      ))}
    </span>
  );
}

const MARK_LABEL: Record<BookEntry['state'], string> = {
  proven: 'Proven',
  learning: 'Learning',
  none: 'Not yet',
};

function StatusPill({ trick, entry }: { trick: Trick; entry: BookEntry | undefined }) {
  const state = entry?.state ?? 'none';
  if (state === 'proven') {
    const p = entry!.proven!;
    return (
      <span className="tc-status tc-status-proven" title="Landed in games — can't be unmarked">
        ✓ Landed in games{p.count > 1 ? ` ×${p.count}` : ''}
      </span>
    );
  }
  return (
    <button
      className={`tc-status tc-status-${state}`}
      onClick={() => cycleMark(trick.id, entry)}
      aria-label={`Mark ${trick.name} (now: ${MARK_LABEL[state]})`}
    >
      {MARK_LABEL[state]}
    </button>
  );
}

/** Why this trick is the suggested next step, based on the player's bag. */
function suggestionRationale(trick: Trick, view: BookView): string {
  const entry = view.book.get(trick.id);
  if (entry?.state === 'learning') return "You're working on this one";
  const bagBases = new Set(
    FLATGROUND_TRICKS.filter((t) => inBag(view.book.get(t.id))).map((t) => t.base),
  );
  if (bagBases.has(trick.base) && trick.base !== trick.name) {
    return `Builds on your ${trick.base}`;
  }
  return 'A fresh trick to learn';
}

function BookHero({
  view,
  onPickSuggestion,
  onWatch,
}: {
  view: BookView;
  onPickSuggestion: (trick: Trick) => void;
  onWatch: (trick: Trick, ytId: string) => void;
}) {
  const featured = view.suggestions[0];
  const tip = featured ? tipForTrick(featured) : undefined;

  return (
    <section className="book-hero">
      <div className="book-hero-summary">
        {view.bagCount === 0 ? (
          <p className="book-hero-copy">
            <strong>Your bag is empty.</strong> Play a game of S.K.A.T.E. — every trick you land
            shows up here, proven.
          </p>
        ) : (
          <p className="book-hero-copy">
            <strong>
              {view.bagCount} trick{view.bagCount === 1 ? '' : 's'} in your bag.
            </strong>{' '}
            {view.spot ? (
              <>
                Your bag rides like <strong>{view.spot.peer.name}</strong>
                {view.spot.next ? (
                  <>
                    {' '}
                    — next stop, <strong>{view.spot.next.name}</strong>.
                  </>
                ) : (
                  <> — top of the ladder.</>
                )}
              </>
            ) : (
              'Play a couple more games to see where you sit on the robot ladder.'
            )}
          </p>
        )}
      </div>

      {featured && (
        <div className="book-nextup-card">
          <div className="book-nextup-head">
            <span className="book-nextup-label">Next up</span>
            <span className="book-nextup-rationale">
              {suggestionRationale(featured, view)}
            </span>
          </div>
          <button
            className="book-nextup-body"
            onClick={() => (tip ? onWatch(featured, tip.ytId) : onPickSuggestion(featured))}
            aria-label={tip ? `Watch ${featured.name} tutorial` : `Find ${featured.name} in gallery`}
          >
            <div className={`book-nextup-thumb ${tip ? '' : 'book-nextup-thumb-empty'}`}>
              {tip ? (
                <>
                  <span className="tc-play">
                    <TbPlayerPlayFilled aria-hidden />
                  </span>
                  <span className="tc-duration">{tip.duration}</span>
                </>
              ) : (
                <span className="book-nextup-thumb-placeholder">
                  <TbPlayerPlayFilled aria-hidden />
                </span>
              )}
            </div>
            <div className="book-nextup-info">
              <div className="book-nextup-name-row">
                <span className="book-nextup-name">{featured.name}</span>
                <DifficultyDots trick={featured} />
              </div>
              {tip ? (
                <span className="book-nextup-channel">{tip.channel}</span>
              ) : (
                <span className="book-nextup-channel muted">No video yet — tap to find in gallery</span>
              )}
            </div>
          </button>
          {view.suggestions.length > 1 && (
            <div className="book-nextup-more">
              <span className="book-nextup-more-label">Also next</span>
              {view.suggestions.slice(1).map((t) => (
                <button
                  key={t.id}
                  className="book-nextup-more-chip"
                  onClick={() => onPickSuggestion(t)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Trick tip gallery + the player's trick book (flatground only). */
export default function GalleryScreen() {
  const [query, setQuery] = useState('');
  const [stance, setStance] = useState<Stance>('regular');
  const [bookFilter, setBookFilter] = useState<BookFilter>('all');
  const [activeVideo, setActiveVideo] = useState<{ trick: Trick; ytId: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const view = useSyncExternalStore(subscribeToBookChanges, browserBookSnapshot, serverBookSnapshot);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRICKS.filter((t) => {
      if (t.stance !== stance) return false;
      if (t.category !== 'flatground') return false;
      const entry = view.book.get(t.id);
      if (bookFilter === 'bag' && !inBag(entry)) return false;
      if (bookFilter === 'learning' && entry?.state !== 'learning') return false;
      if (bookFilter === 'todo' && entry?.state !== 'none') return false;
      if (q && !trickMatchesSearch(t, q) && !trickDescription(t).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  }, [query, stance, bookFilter, view]);

  const showSuggestion = (trick: Trick) => {
    setBookFilter('all');
    setStance(trick.stance);
    setQuery(trick.name);
  };

  const activeFilterCount =
    (stance !== 'regular' ? 1 : 0) + (bookFilter !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0);

  return (
    <div className="container gallery-screen">
      <BookHero
        view={view}
        onPickSuggestion={showSuggestion}
        onWatch={(trick, ytId) => setActiveVideo({ trick, ytId })}
      />

      <div className="filter-bar-row">
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
        <button
          className={`filter-btn ${activeFilterCount > 0 ? 'filter-btn-active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label="Open filters"
        >
          <TbAdjustments aria-hidden />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {activeFilterCount > 0 && (
        <div className="active-filter-chips">
          {stance !== 'regular' && (
            <button
              className="af-chip"
              onClick={() => setStance('regular')}
            >
              {STANCE_CHIPS.find((s) => s.stance === stance)?.label} ×
            </button>
          )}
          {bookFilter !== 'all' && (
            <button
              className="af-chip"
              onClick={() => setBookFilter('all')}
            >
              {BOOK_CHIPS.find((c) => c.filter === bookFilter)?.label} ×
            </button>
          )}
          {query.trim() && (
            <button className="af-chip" onClick={() => setQuery('')}>
              &ldquo;{query.trim()}&rdquo; ×
            </button>
          )}
        </div>
      )}

      <p className="result-count">
        {shown.length} trick{shown.length === 1 ? '' : 's'} · {STANCE_CHIPS.find((s) => s.stance === stance)?.label}
        {bookFilter !== 'all' && ` · ${BOOK_CHIPS.find((c) => c.filter === bookFilter)?.label}`}
        {query.trim() && ` · "${query.trim()}"`}
      </p>

      <ul className="gallery-list">
        {shown.map((t) => {
          const tip = tipForTrick(t);
          const desc = trickDescription(t);
          const entry = view.book.get(t.id);
          return (
            <li key={t.id}>
              <div className={`trick-card ${inBag(entry) ? 'trick-card-bagged' : ''}`}>
                <button
                  className="tc-thumb"
                  data-cat={t.category}
                  onClick={() => tip && setActiveVideo({ trick: t, ytId: tip.ytId })}
                  disabled={!tip}
                  aria-label={tip ? `Watch ${t.name} tip` : `${t.name} — no tip video yet`}
                >
                  <span className="tc-play">
                    <TbPlayerPlayFilled aria-hidden />
                  </span>
                  {tip && <span className="tc-duration">{tip.duration}</span>}
                </button>
                <div className="tc-body">
                  <div className="tc-head">
                    <span className="tc-name">{t.name}</span>
                    <DifficultyDots trick={t} />
                  </div>
                  {tip && <span className="tc-meta">{tip.channel}</span>}
                  {desc && <p className="tc-desc">{desc}</p>}
                  {!tip && <p className="tc-desc muted">No tip video yet</p>}
                  <div className="tc-status-row">
                    <StatusPill trick={t} entry={entry} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="trick-empty">No tricks match your filters.</li>
        )}
      </ul>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="sheet gallery-filter-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h2>Filters</h2>
              <button
                className="sheet-close"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
              >
                ×
              </button>
            </div>
            <div className="filter-group">
              <p className="filter-group-label">Stance</p>
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
            <div className="filter-group">
              <p className="filter-group-label">Your trick book</p>
              <div className="book-chips" role="group" aria-label="Filter by your trick book">
                {BOOK_CHIPS.map((c) => (
                  <button
                    key={c.filter}
                    aria-pressed={bookFilter === c.filter}
                    className={`book-chip ${bookFilter === c.filter ? 'book-chip-active' : ''}`}
                    onClick={() => setBookFilter(c.filter)}
                  >
                    {c.label}
                    {c.filter === 'bag' && view.bagCount > 0 && ` (${view.bagCount})`}
                    {c.filter === 'learning' && view.learningCount > 0 && ` (${view.learningCount})`}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="sheet-done"
              onClick={() => setSheetOpen(false)}
            >
              Show {shown.length} trick{shown.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

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
