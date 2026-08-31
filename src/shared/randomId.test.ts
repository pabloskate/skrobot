import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomId } from './randomId';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomId', () => {
  it('uses randomUUID when the browser exposes it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'native-id' });
    expect(randomId()).toBe('native-id');
  });

  it('creates a UUID when randomUUID is unavailable on a plain-HTTP origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(randomId()).toBe('abababab-abab-4bab-abab-abababababab');
  });
});
