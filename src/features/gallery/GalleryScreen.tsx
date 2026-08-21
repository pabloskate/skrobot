'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import type { IconType } from 'react-icons';
import { TbChartBar, TbCheck, TbPlayerPlayFilled, TbSearch, TbStar, TbStarFilled } from 'react-icons/tb';
import { getGameLog, getProvenTricks, getRecords, getTrickMarks, getTrickStats, setTrickMark } from '@/features/records';
import type { Record_, TrickMark, TrickStat } from '@/features/records';
import { ROBOT_BY_ID } from '@/features/robots';
import type { Robot } from '@/features/robots';
import { computeSkateScore, SKATE_SCORE_UNLOCK_GAMES } from '@/features/skater';
import type { SkateScore } from '@/features/skater';
import type { Stance, Trick } from '@/features/tricks';
import { TRICK_BY_NAME, TRICKS, grade, trickDescription, trickMatchesSearch, tricksFor } from '@/features/tricks';
import GalleryTrickAnimation from './GalleryTrickAnimation';
import { tipForTrick, tipPlayerSrc, tipThumbnailUrl, type TipVideo } from './tips';
import { computeBookView, inBag } from './trickBook';
import type { BookEntry, BookView, LearningItem } from './trickBook';

const STANCE_CHIPS: { stance: Stance; label: string }[] = [
  { stance: 'regular', label: 'Regular' },
  { stance: 'fakie', label: 'Fakie' },
  { stance: 'switch', label: 'Switch' },
  { stance: 'nollie', label: 'Nollie' },
];

/** The three jobs this screen answers: what to learn, how to do a trick, how I'm doing. */
type GalleryTab = 'learning' | 'tricks' | 'stats';
type BookFilter = 'all' | 'bag' | 'todo';

const GALLERY_TABS: { tab: GalleryTab; label: string; Icon: IconType }[] = [
  { tab: 'learning', label: 'Learning', Icon: TbStar },
  { tab: 'tricks', label: 'All Tricks', Icon: TbSearch },
  { tab: 'stats', label: 'Stats', Icon: TbChartBar },
];

const BOOK_CHIPS: { filter: BookFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'bag', label: 'In my bag' },
  { filter: 'todo', label: 'Not yet' },
];

const FLATGROUND_TRICKS = tricksFor('flatground');

const STANCE_STORAGE_KEY = 'skaterobot-gallery-stance';

/** The stance lens is a persisted browsing preference — same store pattern as
 * the gallery data so SSR/hydration stay safe without an effect. */
const stanceListeners = new Set<() => void>();

function readStoredStance(): Stance | null {
  try {
    const value = localStorage.getItem(STANCE_STORAGE_KEY);
    return STANCE_CHIPS.some((s) => s.stance === value) ? (value as Stance) : null;
  } catch {
    return null;
  }
}

function serverStanceSnapshot(): Stance {
  return 'regular';
}

function browserStanceSnapshot(): Stance {
  return readStoredStance() ?? 'regular';
}

function subscribeToStance(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  stanceListeners.add(onStoreChange);
  return () => {
    stanceListeners.delete(onStoreChange);
  };
}

function chooseStance(next: Stance): void {
  try {
    localStorage.setItem(STANCE_STORAGE_KEY, next);
  } catch {
    // storage unavailable — the lens just won't persist
  }
  stanceListeners.forEach((notify) => notify());
}

// --- Gallery data store: localStorage-backed, shared via useSyncExternalStore
// (same pattern as HomeScreen's hero) so SSR renders the empty view and
// same-tab mark toggles re-render without a page event.

/** Everything the three tabs render, derived from localStorage in one pass. */
interface GalleryData extends BookView {
  gamesPlayed: number;
  score: SkateScore | null;
  records: Record<string, Record_>;
}

const INITIAL_DATA: GalleryData = {
  ...computeBookView(FLATGROUND_TRICKS, {}, {}),
  gamesPlayed: 0,
  score: null,
  records: {},
};

let dataCacheKey = '';
let dataCache = INITIAL_DATA;

const dataListeners = new Set<() => void>();

function serverDataSnapshot(): GalleryData {
  return INITIAL_DATA;
}

function browserDataSnapshot(): GalleryData {
  const marks = getTrickMarks();
  const proven = getProvenTricks();
  const stats = getTrickStats();
  const log = getGameLog();
  const records = getRecords();
  const key = JSON.stringify({ marks, proven, stats, log, records });
  if (key !== dataCacheKey) {
    dataCacheKey = key;
    dataCache = {
      ...computeBookView(FLATGROUND_TRICKS, marks, proven, stats),
      gamesPlayed: log.length,
      score: computeSkateScore(log),
      records,
    };
  }
  return dataCache;
}

function subscribeToDataChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  dataListeners.add(onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    dataListeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** none ↔ learning. Proven is game evidence and never cycles. */
function cycleMark(trickId: string, entry: BookEntry | undefined): void {
  if (entry?.state === 'proven') return;
  const next: TrickMark | null = entry?.state === 'learning' ? null : 'learning';
  setTrickMark(trickId, next);
  dataListeners.forEach((notify) => notify());
}

function TipThumb({ tip }: { tip: TipVideo }) {
  const thumb = tipThumbnailUrl(tip);
  return (
    <>
      {thumb && (
        <img
          className="tc-thumb-img"
          src={thumb}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="tc-play">
        <TbPlayerPlayFilled aria-hidden />
      </span>
      <span className="tc-duration">{tip.duration}</span>
    </>
  );
}

function AnimationThumb() {
  return (
    <>
      <span className="tc-animation-badge">3D</span>
      <span className="tc-play">
        <TbPlayerPlayFilled aria-hidden />
      </span>
    </>
  );
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

function LandedMark() {
  return (
    <span className="tc-landed" title="Landed in a game" aria-label="Landed in a game">
      <TbCheck aria-hidden />
    </span>
  );
}

function LearnToggle({ trick, entry }: { trick: Trick; entry: BookEntry | undefined }) {
  const saved = entry?.state === 'learning';
  return (
    <button
      className={`tc-learn ${saved ? 'tc-learn-on' : ''}`}
      aria-pressed={saved}
      onClick={() => cycleMark(trick.id, entry)}
      title={saved ? 'On your want-to-learn list' : 'Save to your want-to-learn list'}
    >
      {saved ? <TbStarFilled aria-hidden /> : <TbStar aria-hidden />}
      <span>Want to learn</span>
    </button>
  );
}

/** Consistency over tracked game attempts, shown next to the book status. */
function ConsistencyChip({ stat }: { stat: TrickStat }) {
  const pct = Math.round(stat.rate * 100);
  return (
    <span
      className="tc-rate"
      title={`Landed ${stat.makes} of ${stat.attempts} tracked game attempts`}
    >
      {pct}% · {stat.makes}/{stat.attempts}
    </span>
  );
}

// --- Learning tab ------------------------------------------------------------

/** The top of the queue, made big: one trick to go work on right now. */
function LearningHero({
  item,
  stat,
  onWatch,
  onShowStats,
}: {
  item: LearningItem;
  stat: TrickStat | undefined;
  onWatch: (trick: Trick) => void;
  onShowStats: () => void;
}) {
  const { trick } = item;
  const tip = tipForTrick(trick);

  return (
    <section className="book-hero" aria-label="Next up">
      <div className="book-nextup-card">
        <div className="book-nextup-head">
          <span className="book-nextup-label">Next up</span>
          <span className="book-nextup-rationale">
            {item.starred ? '★ You starred this' : `Suggested · ${item.why}`}
          </span>
        </div>
        <button
          className="book-nextup-body"
          onClick={() => onWatch(trick)}
          aria-label={tip ? `Watch ${trick.name} tutorial` : `Watch ${trick.name} 3D animation`}
        >
          <div className={`book-nextup-thumb ${tip ? '' : 'animation-thumb'}`}>
            {tip ? <TipThumb tip={tip} /> : <AnimationThumb />}
          </div>
          <div className="book-nextup-info">
            <span className="book-nextup-name">{trick.name}</span>
            <DifficultyDots trick={trick} />
            <span className="book-nextup-channel">
              {tip ? tip.channel : '3D trick animation'}
            </span>
          </div>
        </button>
        <div className="book-nextup-cta">
          <button className="hero-watch" onClick={() => onWatch(trick)}>
            {tip ? 'Watch tip' : 'Watch 3D animation'}
          </button>
          {stat && (
            <button
              className="hero-secondary"
              onClick={onShowStats}
              title={`${Math.round(stat.rate * 100)}% of your tracked game attempts`}
            >
              My stats for this trick
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** One queue row: a starred trick or a suggestion, with its reason. */
function QueueRow({
  item,
  entry,
  stat,
  onWatch,
}: {
  item: LearningItem;
  entry: BookEntry | undefined;
  stat: TrickStat | undefined;
  onWatch: (trick: Trick) => void;
}) {
  const { trick } = item;
  const tip = tipForTrick(trick);
  const nudge = stat ? ` · ${Math.round(stat.rate * 100)}% in games` : '';
  return (
    <li className="queue-row">
      <button
        className={`queue-thumb ${tip ? '' : 'animation-thumb'}`}
        onClick={() => onWatch(trick)}
        aria-label={tip ? `Watch ${trick.name} tutorial` : `Watch ${trick.name} 3D animation`}
      >
        {tip ? <TipThumb tip={tip} /> : <AnimationThumb />}
      </button>
      <div className="queue-info">
        <span className="queue-name-row">
          <span className="queue-name">{trick.name}</span>
          <DifficultyDots trick={trick} />
        </span>
        <span className="queue-why">
          {item.starred ? (
            <>
              <span className="queue-why-star">★ On your list</span>
              {nudge}
            </>
          ) : (
            <>
              Suggested · {item.why}
              {nudge}
            </>
          )}
        </span>
      </div>
      <button
        className={`queue-star ${item.starred ? 'queue-star-on' : ''}`}
        aria-pressed={item.starred}
        onClick={() => cycleMark(trick.id, entry)}
        aria-label={
          item.starred ? `Remove ${trick.name} from your list` : `Add ${trick.name} to your list`
        }
        title={item.starred ? 'Remove from your list' : 'Add to your list'}
      >
        {item.starred ? <TbStarFilled aria-hidden /> : <TbStar aria-hidden />}
      </button>
    </li>
  );
}

/**
 * The Learning tab: what should I skate today? One queue — starred tricks
 * first (player intent), then suggestions with their reasoning. The hero is
 * simply queue #1. For a brand-new skater the queue is all suggestions and the
 * teaching card explains the star gesture.
 */
function LearningTab({
  data,
  onWatch,
  onBrowse,
  onShowStats,
}: {
  data: GalleryData;
  onWatch: (trick: Trick) => void;
  onBrowse: () => void;
  onShowStats: () => void;
}) {
  const [hero, ...rest] = data.queue;
  if (!hero) return null;

  return (
    <div className="gallery-pane">
      <LearningHero
        item={hero}
        stat={data.stats[hero.trick.name]}
        onWatch={onWatch}
        onShowStats={onShowStats}
      />

      {rest.length > 0 && (
        <>
          <div className="queue-head">
            <h2>{data.learningCount > 0 ? 'Your queue' : 'Suggested for you'}</h2>
            <span>{data.learningCount > 0 ? 'starred first, then suggested' : 'easiest first'}</span>
          </div>
          <ul className="queue-list">
            {rest.map((item) => (
              <QueueRow
                key={item.trick.id}
                item={item}
                entry={data.book.get(item.trick.id)}
                stat={data.stats[item.trick.name]}
                onWatch={onWatch}
              />
            ))}
          </ul>
        </>
      )}

      {data.learningCount === 0 && (
        <p className="learn-teach">
          <strong>Make this list yours.</strong> When a robot sets a trick you want to learn, star
          it — here or mid-game — and it pins to the top of your queue.
        </p>
      )}

      <button className="browse-link" onClick={onBrowse}>
        Browse all {FLATGROUND_TRICKS.length} tricks →
      </button>
    </div>
  );
}

// --- Stats tab ---------------------------------------------------------------

/** All tricks with tracked attempts, most-tried first; ties broken by weakest rate. */
function statRows(stats: Record<string, TrickStat>): { name: string; stat: TrickStat }[] {
  return Object.entries(stats)
    .map(([name, stat]) => ({ name, stat }))
    .sort(
      (a, b) =>
        b.stat.attempts - a.stat.attempts ||
        a.stat.rate - b.stat.rate ||
        a.name.localeCompare(b.name),
    );
}

function ladderPercent(score: SkateScore): number {
  const { peer, next } = score;
  if (!next || next.skill <= peer.skill) return 100;
  const pct = ((score.skill - peer.skill) / (next.skill - peer.skill)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/**
 * The skate score card: the 1-10 number, the robot the player rides like, and
 * the ladder rung above them — or the locked/needs-evidence states for players
 * still building a log.
 */
function ScoreCard({
  score,
  gamesPlayed,
  totalAttempts,
}: {
  score: SkateScore | null;
  gamesPlayed: number;
  totalAttempts: number;
}) {
  if (!score) {
    if (gamesPlayed < SKATE_SCORE_UNLOCK_GAMES) {
      const pct = Math.round((gamesPlayed / SKATE_SCORE_UNLOCK_GAMES) * 100);
      const remaining = SKATE_SCORE_UNLOCK_GAMES - gamesPlayed;
      return (
        <section className="score-card score-locked" aria-label="Skate score">
          <span className="score-kicker">Skate score</span>
          <p className="score-locked-title">Locked</p>
          <p className="score-locked-copy">
            Play {remaining} more game{remaining === 1 ? '' : 's'} of S.K.A.T.E. to unlock your
            skate score and see which robot you skate like.
          </p>
          <div className="score-progress" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="score-progress-note">
            {gamesPlayed} of {SKATE_SCORE_UNLOCK_GAMES} games complete
          </p>
        </section>
      );
    }
    return (
      <section className="score-card score-locked" aria-label="Skate score">
        <span className="score-kicker">Skate score</span>
        <p className="score-locked-title">Almost there</p>
        <p className="score-locked-copy">
          You have played enough games — keep recording your makes and misses so your score can
          settle.
        </p>
      </section>
    );
  }

  const { peer, next } = score;
  const pct = ladderPercent(score);
  return (
    <section className="score-card" aria-label="Skate score">
      <span className="score-kicker">Skate score</span>
      <div className="score-row">
        <span className="score-num">{score.skill.toFixed(1)}</span>
        <span className="score-tier">{score.tier}</span>
      </div>
      <p className="score-peer">
        You skate like <strong>{peer.name}</strong>
        {next ? (
          <>
            {' '}
            · next rung: <strong>{next.name}</strong>
          </>
        ) : (
          ' · top of the ladder'
        )}
      </p>
      <div className="ladder" aria-hidden="true">
        <div className="ladder-track">
          <span className="ladder-fill" style={{ width: `${pct}%` }} />
          <span className="ladder-dot" style={{ left: `${pct}%` }} />
        </div>
        <div className="ladder-labels">
          <span>
            {peer.name} · {peer.skill}
          </span>
          <span>{next ? `${next.name} · ${next.skill}` : 'Top'}</span>
        </div>
      </div>
      <p className="score-src">
        {score.source === 'attempts'
          ? `From ${totalAttempts} tracked attempts`
          : 'From the hardest tricks you have landed'}{' '}
        · {gamesPlayed} games played
      </p>
    </section>
  );
}

/**
 * The Stats tab: how am I doing? Skate score + ladder, per-trick consistency,
 * record vs robots, and a shortcut into the bag view of the catalog. A page,
 * not a modal — it's a destination players visit on purpose.
 */
function StatsTab({ data, onBrowseBag }: { data: GalleryData; onBrowseBag: () => void }) {
  const rows = statRows(data.stats);
  const totals = rows.reduce(
    (acc, { stat }) => ({ attempts: acc.attempts + stat.attempts, makes: acc.makes + stat.makes }),
    { attempts: 0, makes: 0 },
  );
  const overallPct = totals.attempts ? Math.round((totals.makes / totals.attempts) * 100) : 0;
  const recordRows = Object.entries(data.records)
    .map(([robotId, record]) => ({ robot: ROBOT_BY_ID.get(robotId), record }))
    .filter((row): row is { robot: Robot; record: Record_ } => row.robot != null)
    .sort((a, b) => b.record.w + b.record.l - (a.record.w + a.record.l));

  return (
    <div className="gallery-pane">
      <ScoreCard score={data.score} gamesPlayed={data.gamesPlayed} totalAttempts={totals.attempts} />

      <section className="stats-block" aria-label="Trick consistency">
        <h3>Consistency</h3>
        {rows.length === 0 ? (
          <p className="stats-empty">
            Nothing tracked yet. Play a game of S.K.A.T.E. — every trick you report, make or miss,
            builds your consistency stats here.
          </p>
        ) : (
          <>
            <p className="stats-summary">
              <strong>{overallPct}%</strong> overall · {totals.makes}/{totals.attempts} landed ·{' '}
              {rows.length} trick{rows.length === 1 ? '' : 's'} tried
            </p>
            <ul className="stats-list">
              {rows.map(({ name, stat }) => {
                const pct = Math.round(stat.rate * 100);
                const trick = TRICK_BY_NAME.get(name);
                const learning = trick
                  ? data.book.get(trick.id)?.state === 'learning'
                  : false;
                const barTone = pct < 30 ? 'stat-bar-low' : pct < 65 ? 'stat-bar-mid' : '';
                return (
                  <li key={name} className="stat-row">
                    <span className="stat-row-head">
                      <span className="stat-name">
                        {name}
                        {learning && (
                          <TbStarFilled className="stat-star" aria-hidden title="On your list" />
                        )}
                      </span>
                      <span className="stat-numbers">
                        {stat.makes}/{stat.attempts} · {pct}%
                      </span>
                    </span>
                    <span className="stat-bar">
                      <span className={`stat-bar-fill ${barTone}`} style={{ width: `${pct}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {recordRows.length > 0 && (
        <section className="stats-block" aria-label="Record vs robots">
          <h3>Record vs robots</h3>
          <div className="vs-chips">
            {recordRows.map(({ robot, record }) => (
              <span
                key={robot.id}
                className="vs-chip"
                aria-label={`${robot.name}: ${record.w} wins, ${record.l} losses`}
              >
                {robot.name} <span className="vs-w">{record.w}W</span>–
                <span className="vs-l">{record.l}L</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {data.bagCount > 0 && (
        <button className="bag-link" onClick={onBrowseBag}>
          {data.bagCount} trick{data.bagCount === 1 ? '' : 's'} in your bag <span>View →</span>
        </button>
      )}
    </div>
  );
}

// --- Screen ------------------------------------------------------------------

/** Trick tip gallery + the player's trick book (flatground only). */
export default function GalleryScreen() {
  const [tab, setTab] = useState<GalleryTab>('learning');
  const [query, setQuery] = useState('');
  const [bookFilter, setBookFilter] = useState<BookFilter>('all');
  const [activeVideo, setActiveVideo] = useState<Trick | null>(null);
  const stance = useSyncExternalStore(subscribeToStance, browserStanceSnapshot, serverStanceSnapshot);
  const data = useSyncExternalStore(subscribeToDataChanges, browserDataSnapshot, serverDataSnapshot);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRICKS.filter((t) => {
      if (t.stance !== stance) return false;
      if (t.category !== 'flatground') return false;
      const entry = data.book.get(t.id);
      if (bookFilter === 'bag' && !inBag(entry)) return false;
      if (bookFilter === 'todo' && entry?.state !== 'none') return false;
      if (q && !trickMatchesSearch(t, q) && !trickDescription(t).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name));
  }, [query, stance, bookFilter, data]);

  const browseAllTricks = () => {
    setQuery('');
    setBookFilter('all');
    setTab('tricks');
  };

  const browseBag = () => {
    setQuery('');
    setBookFilter('bag');
    setTab('tricks');
  };

  const activeTip = activeVideo ? tipForTrick(activeVideo) : undefined;
  const activePlayerSrc = activeTip
    ? tipPlayerSrc(activeTip, typeof window === 'undefined' ? undefined : window.location.origin)
    : undefined;
  const openMedia = (trick: Trick) => {
    setActiveVideo(trick);
  };

  const activeTabIndex = GALLERY_TABS.findIndex(({ tab: id }) => id === tab);

  return (
    <div className="gallery-screen">
      <header className="gallery-header">
        <h1>Tricks</h1>
        <div className="gallery-subtabs" role="tablist" aria-label="Tricks sections">
          <span
            className="gallery-subtab-thumb"
            aria-hidden
            style={{
              width: `calc((100% - 8px) / ${GALLERY_TABS.length})`,
              transform: `translateX(${activeTabIndex * 100}%)`,
            }}
          />
          {GALLERY_TABS.map(({ tab: id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`gallery-subtab ${tab === id ? 'gallery-subtab-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="container gallery-content">
        {tab === 'learning' && (
          <LearningTab
            data={data}
            onWatch={openMedia}
            onBrowse={browseAllTricks}
            onShowStats={() => setTab('stats')}
          />
        )}

        {tab === 'tricks' && (
          <>
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

            <div className="gallery-chip-row" role="group" aria-label="Filter by your trick book">
              {BOOK_CHIPS.map((c) => (
                <button
                  key={c.filter}
                  aria-pressed={bookFilter === c.filter}
                  className={`book-chip ${bookFilter === c.filter ? 'book-chip-active' : ''}`}
                  onClick={() => setBookFilter(c.filter)}
                >
                  {c.label}
                  {c.filter === 'bag' && data.bagCount > 0 && ` (${data.bagCount})`}
                </button>
              ))}
            </div>

            <div className="stance-seg" role="group" aria-label="Stance">
              {STANCE_CHIPS.map((s) => (
                <button
                  key={s.stance}
                  aria-pressed={stance === s.stance}
                  className={stance === s.stance ? 'stance-seg-active' : ''}
                  onClick={() => chooseStance(s.stance)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <p className="result-count">
              {shown.length} trick{shown.length === 1 ? '' : 's'}
              {bookFilter !== 'all' && ` · ${BOOK_CHIPS.find((c) => c.filter === bookFilter)?.label}`}
              {query.trim() && ` · "${query.trim()}"`}
            </p>

            <ul className="gallery-list">
              {shown.map((t) => {
                const tip = tipForTrick(t);
                const desc = trickDescription(t);
                const entry = data.book.get(t.id);
                const stat = data.stats[t.name];
                return (
                  <li key={t.id}>
                    <div className={`trick-card ${inBag(entry) ? 'trick-card-bagged' : ''}`}>
                      <button
                        className={`tc-thumb ${tip ? '' : 'animation-thumb'}`}
                        data-cat={t.category}
                        onClick={() => openMedia(t)}
                        aria-label={tip ? `Watch ${t.name} tip` : `Watch ${t.name} 3D animation`}
                      >
                        {tip ? (
                          <TipThumb tip={tip} />
                        ) : (
                          <AnimationThumb />
                        )}
                      </button>
                      <div className="tc-body">
                        <div className="tc-head">
                          <span className="tc-name-row">
                            <span className="tc-name">{t.name}</span>
                            {inBag(entry) && <LandedMark />}
                          </span>
                          <DifficultyDots trick={t} />
                        </div>
                        {tip && <span className="tc-meta">{tip.channel}</span>}
                        {!tip && <span className="tc-meta">3D trick animation</span>}
                        {desc && <p className="tc-desc">{desc}</p>}
                        {(entry?.state !== 'proven' || stat) && (
                          <div className="tc-status-row">
                            {entry?.state !== 'proven' && <LearnToggle trick={t} entry={entry} />}
                            {stat && <ConsistencyChip stat={stat} />}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="trick-empty">No tricks match your filters.</li>
              )}
            </ul>
          </>
        )}

        {tab === 'stats' && <StatsTab data={data} onBrowseBag={browseBag} />}

        {activeVideo && (
          <div className="modal" onClick={() => setActiveVideo(null)}>
            <div
              className={`modal-inner ${activePlayerSrc ? '' : 'modal-inner-animation'} ${activeTip?.igId ? 'modal-inner-instagram' : activeTip?.short ? 'modal-inner-short' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`modal-frame ${activePlayerSrc ? '' : 'modal-frame-animation'} ${activeTip?.igId ? 'modal-frame-instagram' : activeTip?.short ? 'modal-frame-short' : ''}`}>
                <button className="modal-close" onClick={() => setActiveVideo(null)} aria-label="Close">
                  ×
                </button>
                {activePlayerSrc ? (
                  <iframe
                    src={activePlayerSrc}
                    title={`${activeVideo.name} tutorial`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox={
                      activeTip?.igId
                        ? 'allow-scripts allow-same-origin allow-presentation'
                        : undefined
                    }
                  />
                ) : (
                  <GalleryTrickAnimation trick={activeVideo} />
                )}
              </div>
              <p className="modal-title">{activeVideo.name}</p>
              {!activePlayerSrc && <p className="modal-kicker">3D trick animation · Tap to replay</p>}
              {trickDescription(activeVideo) && (
                <p className="modal-desc">{trickDescription(activeVideo)}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
