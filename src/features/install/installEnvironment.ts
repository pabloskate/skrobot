export type AppInstallPlatform = 'ios' | 'android';

export interface BrowserIdentity {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

const IN_APP_BROWSER_PATTERN = /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok/i;

function isIOSBrowser(identity: BrowserIdentity): boolean {
  return (
    /iPad|iPhone|iPod/i.test(identity.userAgent) ||
    (identity.platform === 'MacIntel' && (identity.maxTouchPoints ?? 0) > 1)
  );
}

/**
 * Returns an install target only for supported mobile browsers. Embedded
 * browsers cannot reliably launch the App Store or install a PWA, so they are
 * intentionally excluded in addition to the native-shell marker checked by
 * the hook.
 */
export function detectAppInstallPlatform(identity: BrowserIdentity): AppInstallPlatform | null {
  const { userAgent } = identity;
  const ios = isIOSBrowser(identity);
  const android = /Android/i.test(userAgent);
  if (!ios && !android) return null;

  const androidWebView =
    android && (/; wv\)/i.test(userAgent) || /Version\/4\.0.*Chrome/i.test(userAgent));
  const iosWebView = ios && !/Safari/i.test(userAgent);
  if (androidWebView || iosWebView || IN_APP_BROWSER_PATTERN.test(userAgent)) return null;

  return ios ? 'ios' : 'android';
}
