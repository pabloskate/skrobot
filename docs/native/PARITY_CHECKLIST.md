# Native Feature Parity Checklist

The native app is a shell around the real Skate Robot web app. It is not a
second implementation. Feature parity means the native shell loads the same app
URL and preserves the same browser session behaviors closely enough that every
web feature below is available without a native clone.

## Code Evidence

- `apps/mobile/App.tsx` loads the configured Skate Robot URL in `react-native-webview`.
- `apps/mobile/App.tsx` must not import game reducers, robot catalogs, web feature internals, or any game/domain package.
- `apps/mobile/App.tsx` must preserve WebView media playback and capture settings needed by the web voice mode.
- `apps/mobile/plugins/withSkrobotNativeParity.js` must preserve native HTTP dev loading and WebView local networking.
- `apps/mobile/app.json` must keep the `skrobot` URL scheme so native magic links return to the shell.
- `apps/mobile/app.json` must define stable iOS and Android identifiers for repeatable device validation.
- `apps/mobile/eas.json` must define development/internal build profiles for the native shell.
- `src/mobile-parity/*.test.ts` must guard the shell, link routing, plugin output, and no-clone invariant.

## Feature Inventory

These feature folders exist in the web app and must either be reachable through
the loaded web app or explicitly noted as not routed yet:

- `auth` — passwordless sign-in UI, session state, logout.
- `billing` — quota/upgrade screen and dormant Stripe API behavior.
- `dice` — standalone random-trick roller; not currently routed by `AppShell`.
- `game` — S.K.A.T.E. rules and on-screen game mode.
- `gallery` — flatground trick gallery with stance filters and optional curated video tips.
- `home` — landing hero and flatground robot roster entry point.
- `records` — localStorage records and game log.
- `robots` — roster data, avatars, profile, and trick repertoire.
- `tricks` — flatground trick catalog, picker, and stance tabs in the routed app; custom setup is not currently routed.
- `voice` — Gemini Live voice game mode.

## Routed Screen States

The native shell must load the same web app states defined by `AppShell`:

- `home`
- `profile`
- `game`
- `voice`
- `gallery`
- `account`
- `signin`
- `upgrade`

## API Surface

Native WebView requests must hit the same first-party API surface as web:

- `/api/auth/callback`
- `/api/auth/logout`
- `/api/auth/request-link`
- `/api/billing/checkout`
- `/api/billing/webhook`
- `/api/live-token`
- `/api/me`

## Web Feature Surface To Verify In Native

1. Home screen
   - Dynamic hero appears.
   - Flatground robot roster appears.
   - Hero and robot cards can enter profile or voice flow.

2. Robot profile
   - Avatar, tagline, summary, and `Play <robot>` action appear.
   - Expandable trick repertoire works.
   - Stance consistency pills and descriptions match web behavior.

3. On-screen game mode
   - Rock-paper-scissors flow works.
   - Player set, trick picker, robot copy/set animation, player copy, rematch, and exit flow work.
   - Switching from eligible screen-game states into voice mode is offered when expected.

4. Trick selection
   - Trick search works.
   - Stance tabs work.
   - Used tricks are disabled.

5. Records
   - Web localStorage record and game-log behavior works inside the native WebView session.
   - Home hero reacts to previous result inside the shell.

6. Sign-in
   - Voice mode gates signed-out users to the same sign-in screen.
   - Native WebView requests native magic links.
   - `skrobot://auth/callback?...` opens the native app and consumes `/api/auth/callback` inside the WebView.
   - The resulting HTTP-only session cookie is available to `/api/me` and `/api/live-token` inside the shell.
   - Logout clears the native WebView session.

7. Voice mode
   - Microphone permission prompt appears with Skate Robot copy.
   - `POST /api/live-token` succeeds after sign-in.
   - Gemini Live session connects.
   - Captions, mute, pocket mode, end session, and switch-to-screen-mode controls work.
   - Audio capture/playback works with phone mic and earbuds.

8. Upgrade/quota
   - Weekly voice quota response is reflected.
   - Quota exceeded routes to the same upgrade screen.
   - Billing endpoints remain disabled/enabled according to the same server flags as web.

9. Trick gallery
   - With `?beta=true`, the bottom nav bar appears with S.K.A.T.E., Tricks, and Account tabs.
   - Gallery shows flatground trick cards with difficulty dots, stance filters, and search.
   - Stance chips filter the list.
   - Tapping a trick with a curated video opens the video modal; tricks without tips are disabled.

10. Account
    - Account tab shows sign-in prompt when signed out.
    - Signed-in account shows email and voice quota bar.
    - Sign-out clears the session.

11. Shell behavior
   - iOS simulator/local shell loads `http://localhost:3000`.
   - Android emulator/local shell loads `http://10.0.2.2:3000`.
   - Physical devices load `EXPO_PUBLIC_SKROBOT_WEB_URL`.
   - External non-app links open outside the shell.
   - Android hardware Back navigates WebView history before exiting the app.
   - WebView load failures show only Retry/Open URL recovery controls.

## Device Matrix

Run this matrix before calling native parity complete:

- iOS Simulator, local Next dev URL.
- Android Emulator, local Next dev URL.
- Physical iPhone, LAN or deployed HTTPS URL.
- Physical Android device, LAN or deployed HTTPS URL.

Follow `docs/native/DEVICE_VALIDATION_RUNBOOK.md` and record results in
`docs/native/DEVICE_VALIDATION_LOG.md`. Native parity remains incomplete while
any target in that log is still pending.

Use `npm run native:parity-status` to check the log. A nonzero exit means the
native parity goal is still honestly incomplete.

For each device, record:

- App URL used.
- Sign-in result.
- `/api/me` result after sign-in.
- Voice token result.
- Microphone prompt/result.
- One completed on-screen game.
- One attempted voice session.
- Any deviation from the web app.
