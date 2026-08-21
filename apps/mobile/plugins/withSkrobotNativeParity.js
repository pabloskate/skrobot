const { withAndroidManifest, withInfoPlist, AndroidConfig } = require('@expo/config-plugins');

const DEFAULT_APP_BOUND_DOMAINS = [
  'skrobot.me-d6a.workers.dev',
  'localhost',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'www.instagram.com',
];

function configuredWebHost() {
  const configuredUrl = process.env.EXPO_PUBLIC_SKROBOT_WEB_URL;
  if (!configuredUrl) return null;

  try {
    return new URL(configuredUrl).hostname;
  } catch {
    return null;
  }
}

module.exports = function withSkrobotNativeParity(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    return androidConfig;
  });

  config = withInfoPlist(config, (iosConfig) => {
    const configuredHost = configuredWebHost();
    const existingDomains = Array.isArray(iosConfig.modResults.WKAppBoundDomains)
      ? iosConfig.modResults.WKAppBoundDomains
      : [];

    iosConfig.modResults.NSAppTransportSecurity = {
      ...(iosConfig.modResults.NSAppTransportSecurity ?? {}),
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsInWebContent: true,
    };
    iosConfig.modResults.WKAppBoundDomains = [
      ...new Set([
        ...existingDomains,
        ...DEFAULT_APP_BOUND_DOMAINS,
        ...(configuredHost ? [configuredHost] : []),
      ]),
    ];
    return iosConfig;
  });

  return config;
};
