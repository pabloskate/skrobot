'use client';

import type { GameFormat, GameVariant } from './engine';
import type { PlayerStance } from './gamePreferences';
import {
  setGameFormat,
  setGameVariant,
  setPlayerStance,
  useGameFormat,
  useGameVariant,
  usePlayerStance,
} from './gamePreferences';

const OPTIONS: { value: GameFormat; title: string; detail: string; letters: string }[] = [
  { value: 'skate', title: 'Game of S.K.A.T.E.', detail: 'Classic five-letter match', letters: 'S K A T E' },
  { value: 'sk8', title: 'Game of SK8', detail: 'Quick three-letter match', letters: 'S K 8' },
];

const VARIANTS: { value: GameVariant; title: string; detail: string }[] = [
  { value: 'classic', title: 'Classic', detail: 'Win the toss, trade sets, and play both sides' },
  { value: 'defense', title: 'Defense only', detail: 'The robot always sets; your job is to match it' },
];

const STANCES: { value: PlayerStance; title: string; detail: string }[] = [
  { value: 'regular', title: 'Regular', detail: 'Left foot forward' },
  { value: 'goofy', title: 'Goofy', detail: 'Right foot forward' },
];

export default function GamePreferencesSection() {
  const format = useGameFormat();
  const variant = useGameVariant();
  const stance = usePlayerStance();

  return (
    <section className="settings-section" aria-labelledby="game-preferences-title">
      <div className="settings-section-heading">
        <h2 id="game-preferences-title">Game preferences</h2>
        <p>Choose match rules and your stance. Saved games keep their match settings.</p>
      </div>
      <fieldset className="game-format-options">
        <legend className="sr-only">Game format</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`game-format-option ${format === option.value ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="game-format"
              value={option.value}
              checked={format === option.value}
              onChange={() => setGameFormat(option.value)}
            />
            <span className="game-format-copy">
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
            <span className="game-format-letters" aria-hidden>{option.letters}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="game-format-options">
        <legend className="settings-choice-label">Gameplay</legend>
        {VARIANTS.map((option) => (
          <label key={option.value} className={`game-format-option ${variant === option.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="game-variant"
              value={option.value}
              checked={variant === option.value}
              onChange={() => setGameVariant(option.value)}
            />
            <span className="game-format-copy">
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="game-format-options">
        <legend className="settings-choice-label">Stance</legend>
        {STANCES.map((option) => (
          <label key={option.value} className={`game-format-option ${stance === option.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="player-stance"
              value={option.value}
              checked={stance === option.value}
              onChange={() => setPlayerStance(option.value)}
            />
            <span className="game-format-copy">
              <strong>{option.title}</strong>
              <small>{option.detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
