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

describe('Ollie North', () => {
  it('is available in every flatground stance as a roll-family progression trick', () => {
    const variants = ['regular', 'fakie', 'switch', 'nollie'].map((stance) =>
      TRICK_BY_ID.get(`${stance}-ollie-north`),
    );

    expect(variants.every(Boolean)).toBe(true);
    expect(variants.map((trick) => trick?.difficulty)).toEqual([2, 2.5, 4.5, 4]);
    expect(variants.every((trick) => trick && trickDiscipline(trick) === 'roll')).toBe(true);
  });

  it('has player-facing guidance and a north alias', () => {
    const trick = TRICK_BY_ID.get('regular-ollie-north');

    expect(trickDescription(trick!)).toContain('front foot forward');
    expect(trickMatchesSearch(trick!, 'north')).toBe(true);
  });
});

describe('trick search aliases', () => {
  const trick = (id: string) => TRICK_BY_ID.get(id)!;

  it.each([
    ['regular-frontside-flip', 'frontside 180 kickflip'],
    ['regular-ollie-north', 'north'],
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
    ['regular-backside-360-kickflip', 'bs 360 kickflip'],
    ['fakie-backside-360-kickflip', 'full cab flip'],
    ['regular-frontside-360-kickflip', 'fs 360 kickflip'],
    ['nollie-fs-bigspin', 'nollie bigspin'],
    ['switch-fs-bigspin-flip', 'switch bigspin flip'],
    ['fakie-bs-bigspin-heelflip', 'fakie bigspin heel'],
  ])('finds %s using %s', (id, query) => {
    expect(trickMatchesSearch(trick(id), query)).toBe(true);
  });

  it('keeps omitted-word matching ordered and stance-specific', () => {
    expect(trickMatchesSearch(trick('switch-fs-bigspin'), 'nollie bigspin')).toBe(false);
    expect(trickMatchesSearch(trick('nollie-fs-bigspin-flip'), 'nollie flip bigspin')).toBe(false);
  });

  it('uses the conventional display names while retaining stable ids and bases', () => {
    expect(trick('fakie-backside-180')).toMatchObject({ name: 'Half Cab', base: 'Backside 180' });
    expect(trick('fakie-backside-360')).toMatchObject({ name: 'Full Cab', base: 'Backside 360' });
    expect(trick('fakie-backside-360-kickflip')).toMatchObject({
      name: 'Full Cab Flip',
      base: 'Backside 360 Kickflip',
    });
  });

  it('does not apply fakie-only cab aliases to regular backside rotations', () => {
    expect(trickMatchesSearch(trick('regular-backside-180'), 'half cab')).toBe(false);
    expect(trickMatchesSearch(trick('regular-backside-360'), 'full cab')).toBe(false);
    expect(trickMatchesSearch(trick('regular-backside-360-kickflip'), 'full cab flip')).toBe(false);
  });
});
