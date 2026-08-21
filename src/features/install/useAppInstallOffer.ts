'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { detectAppInstallPlatform, type AppInstallPlatform } from './installEnvironment';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface AppInstallOffer {
  platform: AppInstallPlatform | null;
  canPrompt: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

function isStandalone(): boolean {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

function subscribeToEnvironment(): () => void {
  return () => {};
}

function browserPlatformSnapshot(): AppInstallPlatform | null {
  if (isStandalone()) return null;
  return detectAppInstallPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

function serverPlatformSnapshot(): null {
  return null;
}

/** Capture Android's one-shot install event at the app-shell level. */
export function useAppInstallOffer(nativeApp: boolean): AppInstallOffer {
  const detectedPlatform = useSyncExternalStore(
    subscribeToEnvironment,
    browserPlatformSnapshot,
    serverPlatformSnapshot,
  );
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const platform = nativeApp || installed ? null : detectedPlatform;

  useEffect(() => {
    if (platform !== 'android') return;

    const handleBeforeInstall = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setPromptEvent(installEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [platform]);

  const install = useCallback(async () => {
    if (!promptEvent) return 'unavailable' as const;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  }, [promptEvent]);

  return { platform, canPrompt: platform === 'android' && promptEvent !== null, install };
}
