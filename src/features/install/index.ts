/**
 * Install feature — platform-aware App Store and Android PWA installation UI.
 * Native shells and generic embedded browsers are deliberately excluded.
 */
export { default as AppInstallBanner, IOS_APP_STORE_URL } from './AppInstallBanner';
export { useAppInstallOffer, type AppInstallOffer } from './useAppInstallOffer';
