import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import {
  ANDROID_EMULATOR_WEB_URL,
  IOS_DEV_WEB_URL,
  isShellInternalWebUrl,
  normalizeUrl,
  webUrlFromDeepLink,
} from './linking';

const DEFAULT_WEB_URL = Platform.OS === 'android' ? ANDROID_EMULATOR_WEB_URL : IOS_DEV_WEB_URL;
const WEB_URL = process.env.EXPO_PUBLIC_SKROBOT_WEB_URL ?? DEFAULT_WEB_URL;
const NATIVE_APP_MARKER_SCRIPT = 'window.__SKROBOT_NATIVE_APP = true; true;';

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const appUrl = useMemo(() => normalizeUrl(WEB_URL, DEFAULT_WEB_URL), []);
  const [webviewUrl, setWebviewUrl] = useState(appUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openInShell = useCallback(
    (url: string) => {
      const nextUrl = webUrlFromDeepLink(url, appUrl);
      if (!nextUrl) return false;
      setLoading(true);
      setLoadError(null);
      setWebviewUrl(nextUrl);
      webviewRef.current?.stopLoading();
      return true;
    },
    [appUrl],
  );

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) openInShell(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      openInShell(url);
    });
    return () => subscription.remove();
  }, [openInShell]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      webviewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const handleExternalRequest = useCallback(
    (url: string) => {
      if (openInShell(url)) return false;
      if (isShellInternalWebUrl(url, appUrl)) return true;
      if (url === 'about:blank') return true;
      void Linking.openURL(url);
      return false;
    },
    [appUrl, openInShell],
  );

  const handleNavigationStateChange = useCallback((event: WebViewNavigation) => {
    setCanGoBack(event.canGoBack);
  }, []);

  const reload = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    webviewRef.current?.reload();
  }, []);

  const handleLoadError = useCallback((event: WebViewErrorEvent) => {
    setLoading(false);
    setLoadError(event.nativeEvent.description || 'Could not load the Skate Robot web app.');
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    setLoading(false);
    setLoadError(`Skate Robot returned HTTP ${event.nativeEvent.statusCode}.`);
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <WebView
        ref={webviewRef}
        source={{ uri: webviewUrl }}
        style={styles.webview}
        originWhitelist={['http://*', 'https://*', 'skrobot://*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        mixedContentMode="always"
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        incognito={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        injectedJavaScriptBeforeContentLoaded={NATIVE_APP_MARKER_SCRIPT}
        injectedJavaScript={NATIVE_APP_MARKER_SCRIPT}
        onShouldStartLoadWithRequest={(request) => handleExternalRequest(request.url)}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={() => {
          setLoading(true);
          setLoadError(null);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={handleLoadError}
        onHttpError={handleHttpError}
      />
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color="#ee4e56" />
          <Text style={styles.loadingText}>Loading Skate Robot</Text>
        </View>
      )}
      {loadError && (
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>Couldn't load Skate Robot</Text>
          <Text style={styles.errorCopy}>{loadError}</Text>
          <Text style={styles.errorCopy}>Current URL: {webviewUrl}</Text>
          <Pressable style={styles.button} onPress={reload}>
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => Linking.openURL(webviewUrl)}>
            <Text style={styles.secondaryButtonText}>Open URL</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101113',
  },
  webview: {
    flex: 1,
    backgroundColor: '#101113',
  },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#101113',
  },
  loadingText: {
    color: '#f6f1e8',
    fontSize: 15,
    fontWeight: '700',
  },
  button: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#ee4e56',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderColor: '#f6f1e8',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#f6f1e8',
    fontSize: 16,
    fontWeight: '800',
  },
  errorTitle: {
    color: '#f6f1e8',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorCopy: {
    color: '#ada79f',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
});
