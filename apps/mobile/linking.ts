export const IOS_DEV_WEB_URL = 'http://localhost:3000';
export const ANDROID_EMULATOR_WEB_URL = 'http://10.0.2.2:3000';

export function normalizeUrl(value: string, fallback: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return fallback;
  }
}

export function appOrigin(appUrl: string): string {
  return new URL(appUrl).origin;
}

export function sameOrigin(url: string, appUrl: string): boolean {
  try {
    return new URL(url).origin === appOrigin(appUrl);
  } catch {
    return false;
  }
}

export function webUrlFromDeepLink(url: string, appUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const origin = appOrigin(appUrl);
  const path = parsed.hostname === 'auth' && parsed.pathname === '/callback' ? '/api/auth/callback' : parsed.pathname;
  if (parsed.protocol === 'skrobot:' && path === '/api/auth/callback') {
    const token = parsed.searchParams.get('token');
    return token ? `${origin}/api/auth/callback?token=${encodeURIComponent(token)}` : null;
  }

  if (parsed.protocol === 'skrobot:' && parsed.hostname === 'open') {
    const target = parsed.searchParams.get('url');
    if (target && sameOrigin(target, appUrl)) return target;
  }

  return null;
}

export function isShellInternalWebUrl(url: string, appUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && sameOrigin(parsed.toString(), appUrl)) {
    return true;
  }

  return false;
}
