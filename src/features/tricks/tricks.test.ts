import { describe, expect, it } from 'vitest';

import { TRICK_BY_ID, trickDescription, trickDiscipline, trickMatchesSearch } from './tricks';

describe('Late Kickflip', () => {
  it('is available in every flatground stance with the intended progression metadata', () => {
    const variants = ['regular', 'fakie', 'switch', 'nollie'].map((stance) =>
      TRICK_BY_ID.get(`${stance}-late-kickflip`),
    );

    expect(variants.every(Boolean)).toBe(true);
    expect(variants.map((trick) => trick?.difficulty)).toEqual([7, 8, 9.5, 9]);
    expect(variants.map((trick) => trick?.minSkill)).toEqual([6, 6, 6, 6]);
    expect(variants.every((trick) => trick && trickDiscipline(trick) === 'flip')).toBe(true);
  });

  it('has player-facing guidance', () => {
    const trick = TRICK_BY_ID.get('regular-late-kickflip');

    expect(trick).toBeDefined();
    expect(trickDescription(trick!)).toContain('flick a kickflip late');
  });
});

describe('trick search aliases', () => {
  const trick = (id: string) => TRICK_BY_ID.get(id)!;

  it.each([
    ['regular-frontside-flip', 'frontside 180 kickflip'],
    ['regular-dolphin-flip', 'forward flip'],
    ['regular-360-flip', 'tre flip'],
    ['nollie-360-flip', 'nollie tre flip'],
    ['switch-varial-kickflip', 'switch varial flip'],
    ['regular-pop-shuvit', 'pop shove it'],
    ['crooked-grind', 'crooks'],
    ['nose-manual', 'nose manny'],
    ['fakie-backside-180', 'fakie backside 180'],
    ['fakie-backside-360', 'caballerial'],
    ['fakie-frontside-180', 'frontside half cab'],
    ['fakie-backside-flip', 'half cab flip'],
  ])('finds %s using %s', (id, query) => {
    expect(trickMatchesSearch(trick(id), query)).toBe(true);
  });

  it('uses the conventional display names while retaining stable ids and bases', () => {
    expect(trick('fakie-backside-180')).toMatchObject({ name: 'Half Cab', base: 'Backside 180' });
    expect(trick('fakie-backside-360')).toMatchObject({ name: 'Full Cab', base: 'Backside 360' });
  });

  it('does not apply fakie-only cab aliases to regular backside rotations', () => {
    expect(trickMatchesSearch(trick('regular-backside-180'), 'half cab')).toBe(false);
    expect(trickMatchesSearch(trick('regular-backside-360'), 'full cab')).toBe(false);
  });
});
