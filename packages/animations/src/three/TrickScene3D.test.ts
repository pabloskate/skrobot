import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Robot, Trick } from '../types';
import TrickScene3D from './TrickScene3D';

const robot: Robot = {
  id: 'echo',
  name: 'Echo',
  avatar: { body: '#aaa0dc', accent: '#f1add0', variant: 0 },
};
const trick: Trick = { id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance: 'regular' };

describe('3D game presentation', () => {
  it('keeps the chosen trick hidden behind the lead-in label and overlays the reel on its negative clock', () => {
    const onEnd = vi.fn();
    const overlay = vi.fn((time: number) => createElement('span', null, `Reel clock ${time}`));
    const html = renderToStaticMarkup(createElement(TrickScene3D, {
      robot, trick, landed: true, onDone: vi.fn(), showSpeedToggle: true, set: 'waterfront',
      leadIn: { seconds: 2.3, label: "Skip to Echo's pick", overlay, onEnd },
    }));
    expect(html).toContain('data-renderer="three"');
    expect(html).toContain('data-set="waterfront"');
    expect(html).toContain('data-time="-2.300"');
    expect(html).toContain('aria-label="Skip to Echo&#x27;s pick"');
    expect(html).not.toContain('Replay Echo attempting Kickflip');
    expect(html).not.toContain('Animation speed');
    expect(overlay).toHaveBeenCalledWith(-2.3);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('provides replay and speed controls for game attempts, while fixed-time viewers hide the speed toggle', () => {
    const props = { robot, trick, landed: false, knewIt: false, onDone: vi.fn(), showSpeedToggle: true };
    const playing = renderToStaticMarkup(createElement(TrickScene3D, props));
    expect(playing).toContain('aria-label="Replay Echo attempting Kickflip"');
    expect(playing).toContain('Animation speed 1x; switch to .5x');
    const frozen = renderToStaticMarkup(createElement(TrickScene3D, { ...props, fixedTime: 1 }));
    expect(frozen).toContain('data-time="1.000"');
    expect(frozen).not.toContain('Animation speed');
  });
});
