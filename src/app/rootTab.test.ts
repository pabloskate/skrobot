import { describe, expect, it } from 'vitest';
import {
  betaFeaturesEnabledFromSearch,
  hrefForRootTab,
  parseRootTab,
  rosterOverrideEnabledFromSearch,
  searchFromRecord,
  searchWithRootTab,
} from './rootTab';

describe('root tab URL params', () => {
  it('defaults missing or unknown tabs to skate', () => {
    expect(parseRootTab('')).toBe('skate');
    expect(parseRootTab('?tab=skate')).toBe('skate');
    expect(parseRootTab('?tab=nope')).toBe('skate');
    expect(parseRootTab({ tab: 'gallery' })).toBe('skate');
  });

  it('opens settings from ?tab=settings', () => {
    expect(parseRootTab('?tab=settings')).toBe('settings');
    expect(parseRootTab({ tab: 'settings', version: '1.3.0' })).toBe('settings');
  });

  it('opens tricks for everyone now that release features are generally available', () => {
    expect(parseRootTab('?tab=tricks')).toBe('tricks');
    expect(parseRootTab('?tab=tricks&version=beta')).toBe('tricks');
    expect(parseRootTab({ tab: 'tricks', version: '1.3.0' })).toBe('tricks');
    expect(parseRootTab('?tab=tricks&version=1.0')).toBe('tricks');
  });

  it('keeps unfinished features beta-only', () => {
    expect(betaFeaturesEnabledFromSearch('')).toBe(false);
    expect(betaFeaturesEnabledFromSearch('?version=1.3.0')).toBe(false);
    expect(betaFeaturesEnabledFromSearch('?version=beta')).toBe(true);
  });

  it('unlocks the whole roster only with ?override=true', () => {
    expect(rosterOverrideEnabledFromSearch('')).toBe(false);
    expect(rosterOverrideEnabledFromSearch('?tab=settings')).toBe(false);
    expect(rosterOverrideEnabledFromSearch('?override=false')).toBe(false);
    expect(rosterOverrideEnabledFromSearch('?override=1')).toBe(false);
    expect(rosterOverrideEnabledFromSearch('?override=true')).toBe(true);
    expect(rosterOverrideEnabledFromSearch('?tab=skate&override=true&version=beta')).toBe(true);
    expect(rosterOverrideEnabledFromSearch({ override: 'true' })).toBe(true);
  });

  it('omits tab=skate from the URL and preserves other params', () => {
    expect(searchWithRootTab('?version=1.3.0', 'skate')).toBe('?version=1.3.0');
    expect(searchWithRootTab('?version=1.3.0&tab=settings', 'skate')).toBe('?version=1.3.0');
    expect(searchWithRootTab('?version=1.3.0', 'settings')).toBe('?version=1.3.0&tab=settings');
    expect(searchWithRootTab('?version=1.3.0', 'tricks')).toBe('?version=1.3.0&tab=tricks');
    expect(searchWithRootTab('', 'settings')).toBe('?tab=settings');
    expect(searchWithRootTab('', 'skate')).toBe('');
  });

  it('builds shareable tab hrefs from the current search string', () => {
    expect(hrefForRootTab('skate', '?version=1.3.0&tab=settings')).toBe('/?version=1.3.0');
    expect(hrefForRootTab('settings', '?version=1.3.0')).toBe('/?version=1.3.0&tab=settings');
    expect(hrefForRootTab('tricks', '?version=1.3.0')).toBe('/?version=1.3.0&tab=tricks');
    expect(hrefForRootTab('settings', '')).toBe('/?tab=settings');
  });

  it('serializes Next search param records back into a query string', () => {
    expect(searchFromRecord({})).toBe('');
    expect(searchFromRecord({ version: '1.3.0', tab: 'settings' })).toBe('?version=1.3.0&tab=settings');
    expect(searchFromRecord({ tag: ['a', 'b'] })).toBe('?tag=a&tag=b');
  });
});
