import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const mobilePath = (...parts: string[]) => resolve(process.cwd(), 'apps/mobile', ...parts);

describe('mobile parity shell', () => {
  it('keeps the native parity checklist in the repo', () => {
    const checklist = readFileSync(resolve(process.cwd(), 'docs/native/PARITY_CHECKLIST.md'), 'utf8');
    const deviceLog = readFileSync(resolve(process.cwd(), 'docs/native/DEVICE_VALIDATION_LOG.md'), 'utf8');
    const runbook = readFileSync(resolve(process.cwd(), 'docs/native/DEVICE_VALIDATION_RUNBOOK.md'), 'utf8');

    expect(checklist).toContain('Web Feature Surface To Verify In Native');
    expect(checklist).toContain('Home screen');
    expect(checklist).toContain('Robot profile');
    expect(checklist).toContain('On-screen game mode');
    expect(checklist).toContain('Voice mode');
    expect(checklist).toContain('Device Matrix');
    expect(checklist).toContain('media playback and capture');
    expect(checklist).toContain('docs/native/DEVICE_VALIDATION_RUNBOOK.md');
    expect(checklist).toContain('docs/native/DEVICE_VALIDATION_LOG.md');
    expect(checklist).toContain('npm run native:parity-status');
    expect(deviceLog).toContain('docs/native/DEVICE_VALIDATION_RUNBOOK.md');
    expect(deviceLog).toContain('iOS Simulator');
    expect(deviceLog).toContain('Android Emulator');
    expect(deviceLog).toContain('Physical iPhone');
    expect(deviceLog).toContain('Physical Android');
    expect(deviceLog).toContain('Native parity is not complete');
    expect(deviceLog).toContain('npm run native:parity-status');
    expect(runbook).toContain('npm run dev');
    expect(runbook).toContain('npm run check');
    expect(runbook).toContain('npm run mobile:ios');
    expect(runbook).toContain('npm run mobile:android');
    expect(runbook).toContain('npm run native:parity-status');
  });

  it('keeps the checklist aligned with feature folders, AppShell screens, and API routes', () => {
    const checklist = readFileSync(resolve(process.cwd(), 'docs/native/PARITY_CHECKLIST.md'), 'utf8');
    const appShell = readFileSync(resolve(process.cwd(), 'src/app/AppShell.tsx'), 'utf8');
    const featureNames = readdirSync(resolve(process.cwd(), 'src/features')).filter((name) =>
      statSync(resolve(process.cwd(), 'src/features', name)).isDirectory(),
    );
    const screenIds = [...appShell.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
    const apiRoutes = collectApiRoutes(resolve(process.cwd(), 'src/app/api'));

    for (const featureName of featureNames) {
      expect(checklist).toContain(`\`${featureName}\``);
    }
    for (const screenId of [...new Set(screenIds)]) {
      expect(checklist).toContain(`\`${screenId}\``);
    }
    for (const apiRoute of apiRoutes) {
      expect(checklist).toContain(apiRoute);
    }
  });

  it('loads the real app in a WebView instead of a separate game implementation', () => {
    const appSource = readFileSync(mobilePath('App.tsx'), 'utf8');
    const appWebSource = readFileSync(mobilePath('App.web.tsx'), 'utf8');

    expect(appSource).toContain("from 'react-native-webview'");
    expect(appSource).toContain('<WebView');
    expect(appSource).not.toContain('SafeAreaView');
    expect(appSource).toContain('allowsInlineMediaPlayback');
    expect(appSource).toContain('mediaPlaybackRequiresUserAction={false}');
    expect(appSource).toContain('mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"');
    expect(appSource).toContain('mixedContentMode="always"');
    expect(appSource).toContain('domStorageEnabled');
    expect(appSource).toContain('cacheEnabled');
    expect(appSource).toContain('incognito={false}');
    expect(appSource).toContain('sharedCookiesEnabled');
    expect(appSource).toContain('thirdPartyCookiesEnabled');
    expect(appSource).toContain('setSupportMultipleWindows={false}');
    expect(appSource).toContain('contentInsetAdjustmentBehavior="never"');
    expect(appSource).toContain('automaticallyAdjustContentInsets={false}');
    expect(appSource).toContain('allowsBackForwardNavigationGestures');
    expect(appSource).toContain('BackHandler.addEventListener');
    expect(appSource).toContain('hardwareBackPress');
    expect(appSource).toContain('webviewRef.current?.goBack()');
    expect(appSource).toContain('onNavigationStateChange={handleNavigationStateChange}');
    expect(appSource).toContain('onError={handleLoadError}');
    expect(appSource).toContain('onHttpError={handleHttpError}');
    expect(appSource).toContain('webviewRef.current?.reload()');
    expect(appSource).toContain('NATIVE_APP_MARKER_SCRIPT');
    expect(appSource).toContain('injectedJavaScriptBeforeContentLoaded={NATIVE_APP_MARKER_SCRIPT}');
    expect(appSource).toContain('injectedJavaScript={NATIVE_APP_MARKER_SCRIPT}');
    expect(appSource).not.toContain('@/features');
    expect(appSource).not.toContain('src/features');
    expect(appSource).not.toContain('gameReducer');
    expect(appSource).not.toContain('ROBOTS');
    expect(appSource).not.toContain("Platform.OS === 'web'");
    expect(appSource).not.toContain('Opening the full web app');
    expect(appWebSource).toContain('window.location.replace(appUrl)');
    expect(appWebSource).toContain('return null');
    expect(appWebSource).not.toContain('<WebView');
  });

  it('does not depend on game or domain packages directly', () => {
    const packageJson = JSON.parse(readFileSync(mobilePath('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    });

    expect(dependencyNames.some((name) => name === 'skrobot' || name.startsWith('@skrobot/'))).toBe(false);
    expect(packageJson.scripts?.web).toBeUndefined();
  });

  it('keeps the whole mobile workspace free of cloned game/domain code', () => {
    const mobileSource = collectTextFiles(resolve(process.cwd(), 'apps/mobile')).join('\n');

    expect(mobileSource).not.toContain('@/features');
    expect(mobileSource).not.toContain('src/features');
    expect(mobileSource).not.toContain('@skrobot/');
    expect(mobileSource).not.toContain('gameReducer');
    expect(mobileSource).not.toContain('ROBOTS');
    expect(mobileSource).not.toContain('TRICKS');
    expect(mobileSource).not.toContain('VoiceGameScreen');
    expect(mobileSource).not.toContain('GameScreen');
    expect(mobileSource).not.toContain('RobotSelect');
    expect(mobileSource).not.toContain('RobotProfile');
  });

  it('keeps native network and microphone config for the WebView shell', () => {
    const appJson = JSON.parse(readFileSync(mobilePath('app.json'), 'utf8')) as {
      expo?: {
        plugins?: string[];
        ios?: { infoPlist?: Record<string, unknown> };
        android?: { permissions?: string[] };
      };
    };
    const pluginSource = readFileSync(mobilePath('plugins/withSkrobotNativeParity.js'), 'utf8');

    expect(appJson.expo?.plugins).toContain('./plugins/withSkrobotNativeParity');
    expect(appJson.expo?.ios?.infoPlist?.NSMicrophoneUsageDescription).toContain('voice games');
    expect(appJson.expo?.android?.permissions).toContain('RECORD_AUDIO');
    expect(pluginSource).toContain("android:usesCleartextTraffic");
    expect(pluginSource).toContain('NSAllowsLocalNetworking');
    expect(pluginSource).toContain('NSAllowsArbitraryLoadsInWebContent');
  });

  it('keeps stable native identifiers and build profiles for device validation', () => {
    const appJson = JSON.parse(readFileSync(mobilePath('app.json'), 'utf8')) as {
      expo?: { scheme?: string; ios?: { bundleIdentifier?: string }; android?: { package?: string } };
    };
    const easJson = JSON.parse(readFileSync(mobilePath('eas.json'), 'utf8')) as {
      build?: Record<string, unknown>;
    };

    expect(appJson.expo?.scheme).toBe('skrobot');
    expect(appJson.expo?.ios?.bundleIdentifier).toBe('com.skaterobot.mobile');
    expect(appJson.expo?.android?.package).toBe('com.skaterobot.mobile');
    expect(easJson.build?.development).toBeDefined();
    expect(easJson.build?.preview).toBeDefined();
    expect(easJson.build?.production).toBeDefined();
    expect(JSON.stringify(easJson)).not.toContain('localhost');
    expect(JSON.stringify(easJson)).not.toContain('127.0.0.1');
    expect(JSON.stringify(easJson)).not.toContain('10.0.2.2');
  });

  it('resolves native identity through Expo config', () => {
    const configOutput = execFileSync('npm', ['--workspace', 'mobile', 'exec', 'expo', 'config', '--', '--type', 'public', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const expoConfig = JSON.parse(configOutput) as {
      scheme?: string;
      ios?: { bundleIdentifier?: string };
      android?: { package?: string; permissions?: string[] };
    };

    expect(expoConfig.scheme).toBe('skrobot');
    expect(expoConfig.ios?.bundleIdentifier).toBe('com.skaterobot.mobile');
    expect(expoConfig.android?.package).toBe('com.skaterobot.mobile');
    expect(expoConfig.android?.permissions).toContain('RECORD_AUDIO');
  });

  it('exports Expo web as a redirect-only entry instead of an alternate app', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'skrobot-mobile-web-export-'));
    try {
      execFileSync(
        'npm',
        ['--workspace', 'mobile', 'exec', 'expo', 'export', '--', '--platform', 'web', '--output-dir', outputDir],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );
      const exportedText = collectTextFiles(outputDir).join('\n');

      expect(exportedText).toContain('window.location.replace');
      expect(exportedText).not.toContain('Opening the full web app');
      expect(exportedText).not.toContain('Open Skate Robot');
      expect(exportedText).not.toContain("Couldn't load Skate Robot");
      expect(exportedText).not.toContain('react-native-webview');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('keeps an explicit native parity status command', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const statusScript = readFileSync(resolve(process.cwd(), 'scripts/native-parity-status.mjs'), 'utf8');

    expect(packageJson.scripts?.['native:parity-status']).toBe('node scripts/native-parity-status.mjs');
    expect(packageJson.scripts?.['mobile:start']).toBe('npm --workspace mobile run start');
    expect(packageJson.scripts?.['mobile:ios']).toBe('npm --workspace mobile run ios');
    expect(packageJson.scripts?.['mobile:android']).toBe('npm --workspace mobile run android');
    expect(packageJson.scripts?.['mobile:web']).toBeUndefined();
    expect(statusScript).toContain('docs/native/DEVICE_VALIDATION_LOG.md');
    expect(statusScript).toContain('iOS Simulator');
    expect(statusScript).toContain('Android Emulator');
    expect(statusScript).toContain('Physical iPhone');
    expect(statusScript).toContain('Physical Android');
    expect(statusScript).toContain('expectedHeaders');
    expect(statusScript).toContain('wrong table header');
    expect(statusScript).toContain('malformed rows');
    expect(statusScript).toContain('missing required targets');
    expect(statusScript).toContain('process.exit(1)');
  });
});

function collectApiRoutes(dir: string, prefix = '/api'): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) return collectApiRoutes(path, `${prefix}/${entry}`);
    return entry === 'route.ts' ? [prefix] : [];
  });
}

function collectTextFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === '.expo' || entry === 'node_modules') return [];
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) return collectTextFiles(path);
    if (!/\.(html|js|json|ts|tsx|md)$/.test(entry)) return [];
    return readFileSync(path, 'utf8');
  });
}
