const { withAndroidManifest, withInfoPlist, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withSkrobotNativeParity(config) {
  config = withAndroidManifest(config, (androidConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidConfig.modResults);
    mainApplication.$['android:usesCleartextTraffic'] = 'true';
    return androidConfig;
  });

  config = withInfoPlist(config, (iosConfig) => {
    iosConfig.modResults.NSAppTransportSecurity = {
      ...(iosConfig.modResults.NSAppTransportSecurity ?? {}),
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsInWebContent: true,
    };
    return iosConfig;
  });

  return config;
};
