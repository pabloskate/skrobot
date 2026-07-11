'use client';

import type { GameFormat } from './engine';
import { setGameFormat, useGameFormat } from './gamePreferences';

const OPTIONS: { value: GameFormat; title: string; detail: string; letters: string }[] = [
  { value: 'skate', title: 'Game of S.K.A.T.E.', detail: 'Classic five-letter match', letters: 'S K A T E' },
  { value: 'sk8', title: 'Game of SK8', detail: 'Quick three-letter match', letters: 'S K 8' },
];

export default function GamePreferencesSection() {
  const format = useGameFormat();

  return (
    <section className="settings-section" aria-labelledby="game-preferences-title">
      <div className="settings-section-heading">
        <h2 id="game-preferences-title">Game preferences</h2>
        <p>Choose the format for new matches. Saved games keep their original format.</p>
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
    </section>
  );
}
