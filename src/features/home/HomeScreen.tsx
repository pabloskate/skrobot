'use client';

import { useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TbLock, TbMicrophone, TbX } from 'react-icons/tb';
import { useRecordsSnapshot } from '@/features/records';
import { RobotAvatar, RobotSelect } from '@/features/robots';
import type { Robot } from '@/features/robots';
import { buildAdaptiveMatchState, type AdaptiveMatchState } from './adaptiveMatch';
import { computeHero, type HeroState } from './homeHero';

/** Minimal continue-card payload from AppShell (avoids home→game imports). */
interface ContinueMatch {
  robot: Robot;
  mode: 'screen' | 'voice';
  playerLetters: number;
  robotLetters: number;
  gameLetters: readonly string[];
}

interface Props {
  installBanner?: ReactNode;
  onPickRobot: (robot: Robot) => void;
  onPlayVoice?: (robot: Robot) => void;
  voiceEnabled?: boolean;
  /** When false, hide the Play-by-voice CTA (voice is beta-only). */
  voiceVisible?: boolean;
  /** Current game variant: defense swaps in its own roster and skips ladder heroes. */
  gameVariant?: 'classic' | 'defense';
  /** When true, every robot is pickable regardless of the unlock gate (?override=true). */
  rosterOverrideEnabled?: boolean;
  /** When true, offer the adaptive challenge (adaptive is beta-only). */
  adaptiveMatchVisible?: boolean;
  /** A pre-threshold Adaptive save that must wait for the new unlock requirement. */
  adaptiveSaveWaiting?: boolean;
  /** In-progress match to resume; when set, replaces the normal hero card. */
  continueMatch?: ContinueMatch | null;
  onContinueGame?: () => void;
  onDiscardContinue?: () => void;
}

export default function HomeScreen({
  installBanner,
  onPickRobot,
  onPlayVoice,
  voiceEnabled = true,
  voiceVisible = true,
  gameVariant = 'classic',
  rosterOverrideEnabled = false,
  adaptiveMatchVisible = false,
  adaptiveSaveWaiting = false,
  continueMatch = null,
  onContinueGame,
  onDiscardContinue,
}: Props) {
  const recordsSnapshot = useRecordsSnapshot();
  const snapshot = useMemo<HomeSnapshot>(() => ({
    hero: computeHero(recordsSnapshot.gameLog, recordsSnapshot.records),
    adaptiveMatch: buildAdaptiveMatchState(recordsSnapshot.gameLog, recordsSnapshot.records),
  }), [recordsSnapshot]);
  const [selectedChallenge, setSelectedChallenge] = useState<HomeChallenge>('standard');
  const [adaptiveWarningVisible, setAdaptiveWarningVisible] = useState(false);
  const adaptiveInputRef = useRef<HTMLInputElement>(null);
  const { hero, adaptiveMatch } = snapshot;
  const defenseMode = gameVariant === 'defense';
  const adaptiveLocked = adaptiveMatch.status === 'needs_games';
  const challenge =
    !adaptiveMatchVisible || (adaptiveLocked && selectedChallenge === 'adaptive')
      ? 'standard'
      : selectedChallenge;
  const savedMatch =
    continueMatch && onContinueGame && onDiscardContinue
      ? { match: continueMatch, onContinue: onContinueGame, onDiscard: onDiscardContinue }
      : null;

  return (
    <div className="container">
      {installBanner}
      {savedMatch ? (
        <ContinueCard {...savedMatch} />
      ) : !defenseMode ? (
        <section
          className="challenge-section"
          aria-labelledby={adaptiveMatchVisible ? 'challenge-heading' : undefined}
        >
          {adaptiveMatchVisible && (
            <>
              <h1 className="challenge-heading" id="challenge-heading">
                Choose your challenge
              </h1>
              <ChallengePicker
                value={challenge}
                adaptiveLocked={adaptiveLocked}
                adaptiveMatch={adaptiveMatch}
                adaptiveSaveWaiting={adaptiveSaveWaiting}
                adaptiveInputRef={adaptiveInputRef}
                onChange={(nextChallenge) => {
                  setSelectedChallenge(nextChallenge);
                  setAdaptiveWarningVisible(false);
                }}
                onLockedAdaptive={() => {
                  setAdaptiveWarningVisible(true);
                }}
              />
              {adaptiveMatch.status === 'needs_games' && adaptiveWarningVisible && (
                <AdaptiveLockNotice
                  adaptiveMatch={adaptiveMatch}
                  adaptiveSaveWaiting={adaptiveSaveWaiting}
                  onDismiss={() => {
                    setAdaptiveWarningVisible(false);
                    requestAnimationFrame(() => adaptiveInputRef.current?.focus());
                  }}
                />
              )}
            </>
          )}
          <div className="challenge-stage" key={challenge}>
            {challenge === 'adaptive' ? (
              <AdaptiveHero
                adaptiveMatch={adaptiveMatch}
                onPickRobot={onPickRobot}
                onPlayVoice={onPlayVoice}
                voiceEnabled={voiceEnabled}
                voiceVisible={voiceVisible}
              />
            ) : (
              <HeroCard
                hero={hero}
                onPickRobot={onPickRobot}
                onPlayVoice={onPlayVoice}
                voiceEnabled={voiceEnabled}
                voiceVisible={voiceVisible}
              />
            )}
          </div>
        </section>
      ) : null}
      {!savedMatch && (
        <>
          <div className="hero-divider">
            <span>or choose a robot</span>
          </div>
          <RobotSelect onPick={onPickRobot} variant={gameVariant} override={rosterOverrideEnabled} />
        </>
      )}
    </div>
  );
}

type HomeChallenge = 'standard' | 'adaptive';

function ChallengePicker({
  value,
  adaptiveLocked,
  adaptiveMatch,
  adaptiveSaveWaiting,
  adaptiveInputRef,
  onChange,
  onLockedAdaptive,
}: {
  value: HomeChallenge;
  adaptiveLocked: boolean;
  adaptiveMatch: AdaptiveMatchState;
  adaptiveSaveWaiting: boolean;
  adaptiveInputRef: RefObject<HTMLInputElement | null>;
  onChange: (challenge: HomeChallenge) => void;
  onLockedAdaptive: () => void;
}) {
  const lockDescriptionId = adaptiveLocked ? 'adaptive-lock-description' : undefined;

  return (
    <fieldset className="challenge-picker">
      <legend className="sr-only">Challenge type</legend>
      {(['standard', 'adaptive'] as const).map((challenge) => {
        const locked = challenge === 'adaptive' && adaptiveLocked;
        return (
          <label
            className={`challenge-option${locked ? ' challenge-option--locked' : ''}`}
            key={challenge}
          >
            <input
              className="challenge-option-input sr-only"
              type="radio"
              name="home-challenge"
              value={challenge}
              ref={challenge === 'adaptive' ? adaptiveInputRef : undefined}
              checked={value === challenge}
              aria-disabled={locked || undefined}
              aria-describedby={locked ? lockDescriptionId : undefined}
              onChange={() => (locked ? onLockedAdaptive() : onChange(challenge))}
            />
            <span className="challenge-option-control">
              {challenge === 'standard' ? 'Standard' : 'Adaptive'}
              {locked && <TbLock className="challenge-lock-icon" aria-hidden />}
            </span>
          </label>
        );
      })}
      {adaptiveLocked && adaptiveMatch.status === 'needs_games' && (
        <span className="sr-only" id={lockDescriptionId}>
          Locked. Finish {adaptiveMatch.gamesPlayed + adaptiveMatch.gamesRemaining} completed games
          to complete Adaptive&apos;s game requirement.{' '}
          {adaptiveSaveWaiting
            ? 'Your saved Adaptive match will return when the game lock clears.'
            : 'Enough recorded trick data is also required.'}{' '}
          {adaptiveMatch.gamesPlayed} complete.
        </span>
      )}
    </fieldset>
  );
}

function AdaptiveLockNotice({
  adaptiveMatch,
  adaptiveSaveWaiting,
  onDismiss,
}: {
  adaptiveMatch: Extract<AdaptiveMatchState, { status: 'needs_games' }>;
  adaptiveSaveWaiting: boolean;
  onDismiss: () => void;
}) {
  const gamesRequired = adaptiveMatch.gamesPlayed + adaptiveMatch.gamesRemaining;
  return (
    <div className="adaptive-lock-notice">
      <TbLock aria-hidden />
      <div role="status" aria-live="polite" aria-atomic="true">
        <strong>{gamesRequired} games required for Adaptive</strong>
        <span>
          Finish {adaptiveMatch.gamesRemaining} more game
          {adaptiveMatch.gamesRemaining === 1 ? '' : 's'} to clear the game lock.{' '}
          {adaptiveMatch.gamesPlayed} of {gamesRequired} complete.{' '}
          {adaptiveSaveWaiting
            ? 'Your saved Adaptive match is safe and will return then.'
            : 'Enough recorded makes and misses are also needed.'}
        </span>
      </div>
      <button
        className="adaptive-lock-dismiss"
        type="button"
        aria-label="Dismiss Adaptive lock notice"
        onClick={onDismiss}
      >
        <TbX aria-hidden />
      </button>
    </div>
  );
}

function LetterRow({ count, label, letters }: { count: number; label: string; letters: readonly string[] }) {
  return (
    <div className="continue-score-row">
      <span className="continue-score-name">{label}</span>
      <div className="letters">
        {letters.map((ch, i) => (
          <span key={ch} className={`letter ${i < count ? 'letter-on' : ''}`}>
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function ContinueCard({
  match,
  onContinue,
  onDiscard,
}: {
  match: ContinueMatch;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const { robot } = match;
  return (
    <div className="hero-card hero-card--continue">
      <div className="hero-avatar anim-idle">
        <RobotAvatar robot={robot} size={88} pose="idle" />
      </div>
      <div className="hero-copy">
        <p className="hero-eyebrow">In progress</p>
        <h2 className="hero-headline">Continue vs {robot.name}?</h2>
        <p className="hero-subtext">
          {match.mode === 'voice' ? 'Voice game' : 'On-screen game'} saved mid-match. Pick it back up
          where you left off.
        </p>
      </div>
      <div className="continue-scoreboard" aria-label="Saved score">
        <LetterRow label={robot.name} count={match.robotLetters} letters={match.gameLetters} />
        <LetterRow label="You" count={match.playerLetters} letters={match.gameLetters} />
      </div>
      <div className="hero-actions">
        <button className="btn-hero" onClick={onContinue}>
          Continue game
        </button>
        <button className="btn-ghost" onClick={onDiscard}>
          Start fresh
        </button>
      </div>
    </div>
  );
}

function HeroCard({
  hero,
  onPickRobot,
  onPlayVoice,
  voiceEnabled,
  voiceVisible,
}: {
  hero: HeroState;
  onPickRobot: (robot: Robot) => void;
  onPlayVoice?: (robot: Robot) => void;
  voiceEnabled: boolean;
  voiceVisible: boolean;
}) {
  const { robot } = hero;

  let headline: string;
  let subtext: string;

  if (hero.kind === 'welcome') {
    headline = `Start with ${robot.name}`;
    subtext = `${robot.name} is the friendly one. Skate for real and report your tricks.`;
  } else if (hero.kind === 'rematch') {
    headline = `Run it back vs ${robot.name}?`;
    subtext =
      hero.record && hero.record.l > hero.record.w
        ? `You're ${hero.record.w}W–${hero.record.l}L against them. Time to change that.`
        : `${robot.name} got you last time.`;
  } else if (hero.kind === 'next') {
    headline = `Next opponent: ${robot.name}`;
    subtext = `You beat ${hero.beatenRobot.name}. Keep moving through the flatground roster.`;
  } else {
    headline = 'Flatground cleared!';
    subtext = 'You have a win over every flatground robot. Run it back, or pick a new opponent below.';
  }

  const showVoice = voiceVisible && onPlayVoice != null;

  return (
    <article
      className={`hero-card hero-card--${hero.kind === 'complete' ? 'victory' : hero.kind}`}
      aria-labelledby="standard-challenge-title"
    >
      <div className="hero-avatar anim-idle" aria-hidden="true">
        <RobotAvatar robot={robot} size={88} pose={hero.kind === 'complete' ? 'stoked' : 'idle'} />
      </div>
      <div className="hero-copy">
        <p className="hero-eyebrow">Standard</p>
        <h2 className="hero-headline" id="standard-challenge-title">
          {headline}
        </h2>
        <p className="hero-subtext">{subtext}</p>
      </div>
      <div className="hero-actions">
        <button className="btn-hero" onClick={() => onPickRobot(robot)}>
          View {robot.name}
        </button>
        {showVoice && (
          <>
            <button className="btn-voice" onClick={() => onPlayVoice(robot)} disabled={!voiceEnabled}>
              <TbMicrophone aria-hidden /> Play by voice
            </button>
            {!voiceEnabled && <p className="offline-hint">Voice needs internet. Screen mode is ready offline.</p>}
          </>
        )}
      </div>
    </article>
  );
}

// --- Adaptive challenge (beta) ---

function AdaptiveHero({
  adaptiveMatch,
  onPickRobot,
  onPlayVoice,
  voiceEnabled,
  voiceVisible,
}: {
  adaptiveMatch: AdaptiveMatchState;
  onPickRobot: (robot: Robot) => void;
  onPlayVoice?: (robot: Robot) => void;
  voiceEnabled: boolean;
  voiceVisible: boolean;
}) {
  if (adaptiveMatch.status === 'needs_games') {
    const { gamesPlayed, gamesRemaining } = adaptiveMatch;
    const gamesRequired = gamesPlayed + gamesRemaining;
    const pct = Math.round((gamesPlayed / gamesRequired) * 100);
    return (
      <article className="hero-card hero-card--adaptive" aria-labelledby="adaptive-challenge-title">
        <div className="adaptive-calibration" aria-hidden="true">
          <strong>{gamesPlayed}</strong>
          <span>of {gamesRequired}</span>
        </div>
        <div className="hero-copy">
          <p className="hero-eyebrow">Adaptive challenge</p>
          <h2 className="hero-headline" id="adaptive-challenge-title">
            {gamesRemaining} game{gamesRemaining === 1 ? '' : 's'} to unlock
          </h2>
          <p className="hero-subtext">
            Finish {gamesRemaining} more game{gamesRemaining === 1 ? '' : 's'} so Nemesis can learn
            your level.
          </p>
        </div>
        <div
          className="score-progress"
          role="progressbar"
          aria-valuenow={gamesPlayed}
          aria-valuemin={0}
          aria-valuemax={gamesRequired}
          aria-label={`${gamesPlayed} of ${gamesRequired} games complete`}
        >
          <span className="score-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          {gamesPlayed} of {gamesRequired} games complete
        </p>
      </article>
    );
  }

  if (adaptiveMatch.status === 'needs_evidence') {
    return (
      <article className="hero-card hero-card--adaptive" aria-labelledby="adaptive-challenge-title">
        <div className="adaptive-calibration adaptive-calibration--complete" aria-hidden="true">
          <strong>{adaptiveMatch.gamesPlayed}</strong>
          <span>games</span>
        </div>
        <div className="hero-copy">
          <p className="hero-eyebrow">Adaptive challenge</p>
          <h2 className="hero-headline" id="adaptive-challenge-title">
            More trick data needed
          </h2>
          <p className="hero-subtext">
            You have played enough games. Keep recording your makes and misses so Nemesis can learn
            your level.
          </p>
        </div>
        <p className="adaptive-requirement">Game requirement complete</p>
      </article>
    );
  }

  const { score, rival, record } = adaptiveMatch;
  const skillGap = rival.skill - score.skill;
  const skillGapLabel = `${skillGap >= 0 ? '+' : ''}${skillGap.toFixed(1)}`;
  const wins = record?.w ?? 0;
  const losses = record?.l ?? 0;
  const showVoice = voiceVisible && onPlayVoice != null;

  return (
    <article className="hero-card hero-card--adaptive" aria-labelledby="adaptive-challenge-title">
      <div className="hero-avatar anim-idle" aria-hidden="true">
        <RobotAvatar robot={rival} size={88} pose="idle" />
      </div>
      <div className="hero-copy">
        <p className="hero-eyebrow">Adaptive challenge</p>
        <h2 className="hero-headline" id="adaptive-challenge-title">
          {rival.name}
        </h2>
        <p className="hero-subtext">
          {skillGap > 0
            ? 'Tuned one step ahead using your recent games and the tricks you are ready to learn next.'
            : 'Tuned to challenge your current level using your recent games and frontier tricks.'}
        </p>
      </div>
      <dl className="adaptive-matchup" aria-label="Adaptive matchup">
        <div className="adaptive-stat">
          <dt>Your level</dt>
          <dd>
            <strong>{score.skill.toFixed(1)}</strong>
            <span>{score.tier}</span>
          </dd>
        </div>
        <div className="adaptive-stat">
          <dt>{rival.name}</dt>
          <dd>
            <strong>{rival.skill.toFixed(1)}</strong>
            <span>{skillGapLabel}</span>
          </dd>
        </div>
        <div className="adaptive-stat adaptive-stat--record">
          <dt>Record</dt>
          <dd>
            {wins + losses > 0 ? (
              <>
                <strong aria-hidden="true">{wins}W–{losses}L</strong>
                <span className="sr-only">{wins} wins, {losses} losses</span>
              </>
            ) : (
              <strong>First match</strong>
            )}
          </dd>
        </div>
      </dl>
      <div className="hero-actions">
        <button className="btn-hero" onClick={() => onPickRobot(rival)}>
          View {rival.name}
        </button>
        {showVoice && (
          <>
            <button className="btn-voice" onClick={() => onPlayVoice(rival)} disabled={!voiceEnabled}>
              <TbMicrophone aria-hidden /> Play by voice
            </button>
            {!voiceEnabled && <p className="offline-hint">Voice needs internet. Screen mode is ready offline.</p>}
          </>
        )}
      </div>
    </article>
  );
}

// --- Home projection of the records-owned snapshot ---------------------------

interface HomeSnapshot {
  hero: HeroState;
  adaptiveMatch: AdaptiveMatchState;
}
