'use client';

import { useSyncExternalStore } from 'react';
import { TbMicrophone } from 'react-icons/tb';
import { getGameLog, getRecords } from '@/features/records';
import { RobotAvatar, RobotSelect } from '@/features/robots';
import type { Robot } from '@/features/robots';
import { computeHero, type HeroState } from './homeHero';

/** Minimal continue-card payload from AppShell (avoids home→game imports). */
export interface ContinueMatch {
  robot: Robot;
  mode: 'screen' | 'voice';
  playerLetters: number;
  robotLetters: number;
  gameLetters: readonly string[];
}

interface Props {
  onPickRobot: (robot: Robot) => void;
  onPlayVoice: (robot: Robot) => void;
  voiceEnabled?: boolean;
  /** In-progress match to resume; when set, replaces the normal hero card. */
  continueMatch?: ContinueMatch | null;
  onContinueGame?: () => void;
  onDiscardContinue?: () => void;
}

export default function HomeScreen({
  onPickRobot,
  onPlayVoice,
  voiceEnabled = true,
  continueMatch = null,
  onContinueGame,
  onDiscardContinue,
}: Props) {
  const hero = useSyncExternalStore(subscribeToRecordChanges, browserHeroSnapshot, serverHeroSnapshot);

  return (
    <div className="container">
      {continueMatch && onContinueGame && onDiscardContinue ? (
        <ContinueCard
          match={continueMatch}
          onContinue={onContinueGame}
          onDiscard={onDiscardContinue}
        />
      ) : (
        <HeroCard hero={hero} onPickRobot={onPickRobot} onPlayVoice={onPlayVoice} voiceEnabled={voiceEnabled} />
      )}
      <div className="hero-divider">
        <span>or pick your opponent</span>
      </div>
      <RobotSelect onPick={onPickRobot} />
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
}: {
  hero: HeroState;
  onPickRobot: (robot: Robot) => void;
  onPlayVoice: (robot: Robot) => void;
  voiceEnabled: boolean;
}) {
  const { robot } = hero;

  let headline: string;
  let subtext: string;

  if (hero.kind === 'welcome') {
    headline = 'New here?';
    subtext = "Shifty's the friendly one — start there. Pick a robot, skate for real, report your tricks.";
  } else if (hero.kind === 'rematch') {
    headline = `Run it back vs ${robot.name}?`;
    subtext =
      hero.record && hero.record.l > hero.record.w
        ? `You're ${hero.record.w}W–${hero.record.l}L against them. Time to change that.`
        : `${robot.name} got you last time.`;
  } else if (hero.kind === 'next') {
    headline = `Next up: ${robot.name}`;
    subtext = `You beat ${hero.beatenRobot.name}. Keep climbing the flatground ladder.`;
  } else {
    headline = 'Flatground cleared!';
    subtext = 'You have a win over every flatground robot. Run it back, or pick a new opponent below.';
  }

  return (
    <div className={`hero-card hero-card--${hero.kind === 'complete' ? 'victory' : hero.kind}`}>
      <div className="hero-avatar anim-idle">
        <RobotAvatar robot={robot} size={88} pose={hero.kind === 'complete' ? 'stoked' : 'idle'} />
      </div>
      <div className="hero-copy">
        <p className="hero-eyebrow">{robot.name}</p>
        <h2 className="hero-headline">{headline}</h2>
        <p className="hero-subtext">{subtext}</p>
      </div>
      <div className="hero-actions">
        <button className="btn-hero" onClick={() => onPickRobot(robot)}>
          Play {robot.name}
        </button>
        <button className="btn-voice" onClick={() => onPlayVoice(robot)} disabled={!voiceEnabled}>
          <TbMicrophone aria-hidden /> Play by voice
        </button>
        {!voiceEnabled && <p className="offline-hint">Voice needs internet. Screen mode is ready offline.</p>}
      </div>
    </div>
  );
}

const INITIAL_HERO = computeHero([], {});
let heroCacheKey = '';
let heroCache = INITIAL_HERO;

function serverHeroSnapshot(): HeroState {
  return INITIAL_HERO;
}

function browserHeroSnapshot(): HeroState {
  const log = getGameLog();
  const records = getRecords();
  const key = JSON.stringify({ log, records });
  if (key !== heroCacheKey) {
    heroCacheKey = key;
    heroCache = computeHero(log, records);
  }
  return heroCache;
}

function subscribeToRecordChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}
