/** Top-level tabs shown in the bottom navigation bar. */
export type RootTab = 'skate' | 'tricks' | 'settings';

export const ROOT_TAB_PARAM = 'tab';
export const VERSION_PARAM = 'version';
export const URL_CHANGE_EVENT = 'skrobot-url';

const BETA_VERSION = 'beta';

/** The one version flag that must survive round-trips (e.g. through sign-in). */
export const PRESERVED_VERSIONS: ReadonlySet<string> = new Set([BETA_VERSION]);

type SearchRecord = Record<string, string | string[] | undefined>;

function asSearchParams(search: string | URLSearchParams | SearchRecord): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  if (typeof search === 'string') {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }
  return params;
}

export function searchFromRecord(params: SearchRecord): string {
  const next = asSearchParams(params).toString();
  return next ? `?${next}` : '';
}

/** Release features are generally available; only unfinished features stay beta-only. */
export function betaFeaturesEnabledFromSearch(search: string | URLSearchParams | SearchRecord): boolean {
  return asSearchParams(search).get(VERSION_PARAM) === BETA_VERSION;
}

export function parseRootTab(search: string | URLSearchParams | SearchRecord): RootTab {
  const tab = asSearchParams(search).get(ROOT_TAB_PARAM);
  if (tab === 'settings') return 'settings';
  if (tab === 'tricks') return 'tricks';
  return 'skate';
}

export function searchWithRootTab(search: string, tab: RootTab): string {
  const params = asSearchParams(search);
  if (tab === 'skate') params.delete(ROOT_TAB_PARAM);
  else params.set(ROOT_TAB_PARAM, tab);
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function hrefForRootTab(tab: RootTab, search: string): string {
  return `/${searchWithRootTab(search, tab)}`;
}

export function subscribeToUrlChanges(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(URL_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(URL_CHANGE_EVENT, onStoreChange);
  };
}

/** Keep the address bar in sync without adding history (native back stays the same). */
export function syncRootTabUrl(tab: RootTab): void {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${searchWithRootTab(window.location.search, tab)}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, '', next);
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}
