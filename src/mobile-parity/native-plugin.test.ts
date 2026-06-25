import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { compileModsAsync } from '@expo/config-plugins';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const withSkrobotNativeParity = require('../../apps/mobile/plugins/withSkrobotNativeParity') as (
  config: Record<string, unknown>,
) => Record<string, unknown>;

describe('mobile native parity config plugin', () => {
  it('writes native cleartext and local WebView loading settings during introspection', async () => {
    const config = withSkrobotNativeParity({
      name: 'Skate Robot',
      slug: 'skate-robot-mobile',
    });
    const output = (await compileModsAsync(config, {
      projectRoot: resolve(process.cwd(), 'apps/mobile'),
      platforms: ['ios', 'android'],
      introspect: true,
      assertMissingModProviders: false,
      ignoreExistingNativeFiles: true,
    })) as {
      _internal?: {
        modResults?: {
          android?: { manifest?: { manifest?: { application?: [{ $?: Record<string, string> }] } } };
          ios?: { infoPlist?: { NSAppTransportSecurity?: Record<string, unknown> } };
        };
      };
    };

    const androidApp = output._internal?.modResults?.android?.manifest?.manifest?.application?.[0].$;
    const transport = output._internal?.modResults?.ios?.infoPlist?.NSAppTransportSecurity;

    expect(androidApp?.['android:usesCleartextTraffic']).toBe('true');
    expect(transport?.NSAllowsLocalNetworking).toBe(true);
    expect(transport?.NSAllowsArbitraryLoadsInWebContent).toBe(true);
  });
});
