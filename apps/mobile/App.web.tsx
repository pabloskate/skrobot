import { useEffect, useMemo } from 'react';

import { IOS_DEV_WEB_URL, normalizeUrl } from './linking';

const WEB_URL = process.env.EXPO_PUBLIC_SKROBOT_WEB_URL ?? IOS_DEV_WEB_URL;

export default function App() {
  const appUrl = useMemo(() => normalizeUrl(WEB_URL, IOS_DEV_WEB_URL), []);

  useEffect(() => {
    window.location.replace(appUrl);
  }, [appUrl]);

  return null;
}
