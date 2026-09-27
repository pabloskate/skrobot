import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RobotSelect } from './index';
import { rosterForVariant } from './robots';

describe('robot selection for a new player', () => {
  it.each(['classic', 'defense'] as const)('makes every %s starter-tier robot selectable without wins', (variant) => {
    // Server rendering uses the empty records snapshot: no account, wins, or URL override.
    const html = renderToStaticMarkup(createElement(RobotSelect, { variant, onPick: () => {} }));
    const cards = html.match(/<button\b[^>]*class="robot-card[^"]*"[^>]*>/g) ?? [];
    const robots = rosterForVariant(variant).filter((robot) => robot.tier === 'beginner');

    expect(cards).toHaveLength(robots.length);
    expect(cards.length).toBeGreaterThan(3);
    for (const card of cards) {
      expect(card).not.toMatch(/\bdisabled(?:=|\s|>)/);
      expect(card).not.toContain('robot-card--locked');
    }
    for (const robot of robots) expect(html).toContain(robot.name);
    expect(html).not.toContain('to unlock');
  });
});
