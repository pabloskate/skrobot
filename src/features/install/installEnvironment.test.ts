import { describe, expect, it } from 'vitest';
import { detectAppInstallPlatform } from './installEnvironment';

describe('app install environment', () => {
  it('offers the App Store to iPhone Safari', () => {
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
    })).toBe('ios');
  });

  it('recognizes iPadOS when it uses a desktop identity', () => {
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })).toBe('ios');
  });

  it('offers PWA instructions to Android Chrome', () => {
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    })).toBe('android');
  });

  it('hides offers in iOS and Android webviews', () => {
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      platform: 'iPhone',
    })).toBeNull();
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A; wv) AppleWebKit/537.36 Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    })).toBeNull();
  });

  it('does not show a mobile install offer on desktop', () => {
    expect(detectAppInstallPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })).toBeNull();
  });
});

