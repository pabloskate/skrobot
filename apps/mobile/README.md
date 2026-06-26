# Skate Robot Mobile

This is a parity-first native shell for the existing Skate Robot web app. It
does not contain a second simplified UI. It opens the same app URL inside a
native WebView so native and web stay functionally paired.

The tracked completion checklist is
`docs/native/PARITY_CHECKLIST.md`.

The shell marks the WebView as the native app before the web bundle loads. When
the same sign-in screen requests a magic link from inside the shell, the server
sends an HTTPS callback with `native=1` so mail clients render a normal clickable
link. That callback hands off to `skrobot://auth/callback?...`, which routes back
into the WebView and consumes `/api/auth/callback` there, so the session cookie
lives in the native app instead of a separate browser.

`plugins/withSkrobotNativeParity.js` enables local HTTP loading for native dev
builds. Internal and production builds should point
`EXPO_PUBLIC_SKROBOT_WEB_URL` at the HTTPS Cloudflare deployment. Do not bake
`localhost` into an EAS build profile.

On Android, the hardware Back button is wired to WebView history first, so it
navigates the same app flow instead of immediately closing the shell.

If the WebView cannot load the app URL, the shell shows only a connection
recovery screen with Retry/Open URL actions. It must not grow Skate Robot
feature screens of its own.

## Run

Start the web app first:

```sh
npm run dev
```

Then start Expo:

```sh
npm run mobile:start
```

Do not run a mobile web app from this workspace. Web development uses the root
Next app (`npm run dev`); this workspace exists for the native shell.

The default web URL is `http://localhost:3000` on iOS simulator and
`http://10.0.2.2:3000` on Android emulator. Expo web is redirect-only; it does
not host a Skate Robot UI. For a physical phone, pass a reachable host URL:

```sh
EXPO_PUBLIC_SKROBOT_WEB_URL=http://YOUR_LAN_IP:3000 npm run mobile:start
```

Use `http://10.0.2.2:3000` for Android emulator when overriding manually.

## Native Builds

The app uses stable native identifiers:

- iOS: `com.mycompany.skaterobot`
- Android: `com.skaterobot.mobile`

For local simulator/emulator testing, Expo start is enough. For physical-device
validation, create an internal build and pass a real reachable URL at build time:

```sh
cd apps/mobile
EXPO_PUBLIC_SKROBOT_WEB_URL=https://YOUR_DEPLOYED_APP_URL eas build --profile preview --platform ios
EXPO_PUBLIC_SKROBOT_WEB_URL=https://YOUR_DEPLOYED_APP_URL eas build --profile preview --platform android
```

Use the resulting builds to complete `docs/native/PARITY_CHECKLIST.md`.
Follow `docs/native/DEVICE_VALIDATION_RUNBOOK.md` and record results in
`docs/native/DEVICE_VALIDATION_LOG.md`; `npm run native:parity-status` remains
red until those rows are complete.
