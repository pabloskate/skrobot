# Skate Robot Mobile

Expo native shell for Skate Robot.

The goal is exact functional pairing with the web app. This app must not grow a
separate reduced React Native implementation of Skate Robot screens. It loads
the real deployed/local web app in a native WebView so home, robot selection,
profiles, game mode, voice mode, auth, billing/quota, records, styling, and any
future web feature stay one-to-one by construction.

Use `docs/native/PARITY_CHECKLIST.md` as the source of truth for native parity
completion.

## Commands

From the repo root:

```sh
npm run typecheck --workspace apps/mobile
npm run start --workspace apps/mobile
```

From `apps/mobile/`:

```sh
npm run typecheck
npm run start
```

There is intentionally no `npm run web` script in this workspace. Web is the
root Next app; Expo web must remain redirect-only for export checks, not a
supported Skate Robot surface.

## Runtime URL

The shell defaults to `http://localhost:3000` on iOS simulator and
`http://10.0.2.2:3000` on Android emulator. Expo web must remain redirect-only;
it must not render an alternate Skate Robot UI.

Set `EXPO_PUBLIC_SKROBOT_WEB_URL` when running on a physical device, where
neither `localhost` nor Android emulator loopback is the host Mac:

```sh
EXPO_PUBLIC_SKROBOT_WEB_URL=http://YOUR_LAN_IP:3000 npm run ios
```

## Rules

- Do not add alternate Skate Robot screens to `apps/mobile`.
- Do not copy web feature internals into this app.
- If a feature appears in the web app, the native shell gets it by loading that
  same app URL.
- Native-only work belongs here only when it wraps or improves the exact same
  web experience, such as WebView permissions, deep links, app icons, background
  audio support, push notifications, or store packaging.
- Keep sign-in paired: native magic links must route back into the WebView
  session, not into a separate system browser cookie jar.
- Keep Android hardware Back wired to WebView history first; otherwise the same
  flow behaves differently in the native shell.
- Shell load failures may show Retry/Open URL recovery controls only. Do not add
  alternate Skate Robot feature screens as an offline or fallback experience.
- Keep `plugins/withSkrobotNativeParity.js` in place while local development
  uses HTTP app URLs; production app URLs should be HTTPS.
- Do not commit `localhost`, `127.0.0.1`, or emulator loopback URLs into
  `eas.json`; pass `EXPO_PUBLIC_SKROBOT_WEB_URL` when creating internal or
  production builds.
- Keep `app.json` native identifiers and `eas.json` build profiles stable so
  device validation runs against the same shell.
- Expo APIs are version-sensitive. This app is pinned to Expo SDK 56; verify
  SDK 56 docs before changing Expo-specific APIs.
