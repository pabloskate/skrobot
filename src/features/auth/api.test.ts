import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestSignInLink } from './api';

type NativeWindowMarker = Partial<Window> & {
  ReactNativeWebView?: unknown;
  __SKROBOT_NATIVE_APP?: true;
};

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const fetchMock = vi.fn<typeof fetch>();

describe('auth api', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    Object.defineProperty(globalThis, 'fetch', { value: fetchMock, configurable: true, writable: true });
    Reflect.deleteProperty(globalThis, 'window');
  });

  afterEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', { value: originalFetch, configurable: true, writable: true });
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('requests normal web magic links outside the native shell', async () => {
    await requestSignInLink('pablo@example.com');

    expect(requestBody()).toEqual({ email: 'pablo@example.com', nativeApp: false });
  });

  it('requests native magic links when the shell marker is injected', async () => {
    setWindow({ __SKROBOT_NATIVE_APP: true });

    await requestSignInLink('pablo@example.com');

    expect(requestBody()).toEqual({ email: 'pablo@example.com', nativeApp: true });
  });

  it('requests native magic links when ReactNativeWebView is present', async () => {
    setWindow({ ReactNativeWebView: {} });

    await requestSignInLink('pablo@example.com');

    expect(requestBody()).toEqual({ email: 'pablo@example.com', nativeApp: true });
  });
});

function setWindow(value: NativeWindowMarker): void {
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
}

function requestBody(): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}
