import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import {
  ANDROID_EMULATOR_WEB_URL,
  IOS_DEV_WEB_URL,
  isInAppEmbedUrl,
  isShellInternalWebUrl,
  normalizeUrl,
  webUrlFromDeepLink,
} from './linking';

const DEFAULT_WEB_URL = Platform.OS === 'android' ? ANDROID_EMULATOR_WEB_URL : IOS_DEV_WEB_URL;
const WEB_URL = process.env.EXPO_PUBLIC_SKROBOT_WEB_URL ?? DEFAULT_WEB_URL;
// A non-OK document status is often recoverable: the service worker can serve
// the cached shell on a second pass even if the first paint raced. Auto-retry
// once before ever showing the fatal overlay so a transient blip never wins.
const MAX_HTTP_ERROR_RETRIES = 1;
const HTTP_ERROR_RETRY_DELAY_MS = 600;
const NATIVE_APP_MARKER_SCRIPT = 'window.__SKROBOT_NATIVE_APP = true; true;';
// Metro needs a static asset reference so the mascot is bundled into the native binary.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SPLASH_MASCOT = require('./assets/splash-mascot.png');

SplashScreen.setOptions({
  duration: 350,
  fade: true,
});

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const appUrl = useMemo(() => normalizeUrl(WEB_URL, DEFAULT_WEB_URL), []);
  const [webviewUrl, setWebviewUrl] = useState(appUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const httpErrorRetriesRef = useRef(0);
  const sawHttpErrorRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const openInShell = useCallback(
    (url: string) => {
      const nextUrl = webUrlFromDeepLink(url, appUrl);
      if (!nextUrl) return false;
      clearRetryTimeout();
      httpErrorRetriesRef.current = 0;
      setLoading(true);
      setLoadError(null);
      setWebviewUrl(nextUrl);
      webviewRef.current?.stopLoading();
      return true;
    },
    [appUrl, clearRetryTimeout],
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
    (request: ShouldStartLoadRequest) => {
      // Iframe players perform their own internal navigations. They are not
      // user requests to leave Skate Robot and must remain in the WebView.
      if (!request.isTopFrame) return true;

      const { url } = request;
      if (openInShell(url)) return false;
      if (isShellInternalWebUrl(url, appUrl)) return true;
      if (isInAppEmbedUrl(url)) return true;
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
    clearRetryTimeout();
    httpErrorRetriesRef.current = 0;
    setLoadError(null);
    setLoading(true);
    webviewRef.current?.reload();
  }, [clearRetryTimeout]);

  useEffect(() => clearRetryTimeout, [clearRetryTimeout]);

  const handleLoadError = useCallback((event: WebViewErrorEvent) => {
    clearRetryTimeout();
    setLoading(false);
    setLoadError(event.nativeEvent.description || 'Could not load the Skate Robot web app.');
  }, [clearRetryTimeout]);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { statusCode } = event.nativeEvent;
    sawHttpErrorRef.current = true;
    if (httpErrorRetriesRef.current < MAX_HTTP_ERROR_RETRIES) {
      httpErrorRetriesRef.current += 1;
      setLoading(true);
      setLoadError(null);
      clearRetryTimeout();
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        webviewRef.current?.reload();
      }, HTTP_ERROR_RETRY_DELAY_MS);
      return;
    }
    setLoading(false);
    setLoadError(`Skate Robot returned HTTP ${statusCode}.`);
  }, [clearRetryTimeout]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
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
        limitsNavigationsToAppBoundDomains={Platform.OS === 'ios'}
        setSupportMultipleWindows={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        injectedJavaScriptBeforeContentLoaded={NATIVE_APP_MARKER_SCRIPT}
        injectedJavaScript={NATIVE_APP_MARKER_SCRIPT}
        onShouldStartLoadWithRequest={handleExternalRequest}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={() => {
          sawHttpErrorRef.current = false;
          setLoading(true);
          setLoadError(null);
        }}
        onLoadEnd={() => {
          setLoading(false);
          if (!sawHttpErrorRef.current) httpErrorRetriesRef.current = 0;
        }}
        onError={handleLoadError}
        onHttpError={handleHttpError}
      />
      {loading && (
        <View style={styles.loading}>
          <Image
            source={SPLASH_MASCOT}
            style={styles.splashMascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <ActivityIndicator color="#e0455c" />
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
    backgroundColor: '#f3f2f6',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f3f2f6',
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
    backgroundColor: '#f3f2f6',
  },
  splashMascot: {
    width: 190,
    height: 190,
    marginBottom: 4,
  },
  loadingText: {
    color: '#221a4e',
    fontSize: 15,
    fontWeight: '700',
  },
  button: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#e0455c',
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
    borderColor: '#221a4e',
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: '#221a4e',
    fontSize: 16,
    fontWeight: '800',
  },
  errorTitle: {
    color: '#221a4e',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorCopy: {
    color: '#6b6786',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
});
