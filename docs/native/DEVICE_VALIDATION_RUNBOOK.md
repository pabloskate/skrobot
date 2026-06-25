# Native Device Validation Runbook

Use this runbook to fill `docs/native/DEVICE_VALIDATION_LOG.md`. Native parity
is not complete until every target has real results and
`npm run native:parity-status` exits successfully.

## Before Testing

1. Start the real web app from the repo root:

   ```sh
   npm run dev
   ```

2. Confirm the web app loads at `http://localhost:3000`.
3. Confirm the native shell code is healthy:

   ```sh
   npm run check
   ```

## Local Simulators

### iOS Simulator

1. Run:

   ```sh
   npm run mobile:ios
   ```

2. Use the default shell URL: `http://localhost:3000`.
3. Complete the iOS Simulator row in `docs/native/DEVICE_VALIDATION_LOG.md`.

### Android Emulator

1. Run:

   ```sh
   npm run mobile:android
   ```

2. Use the default shell URL: `http://10.0.2.2:3000`.
3. Complete the Android Emulator row in `docs/native/DEVICE_VALIDATION_LOG.md`.

## Physical Devices

Use a URL reachable by the phone. Prefer a deployed HTTPS URL for voice testing.
For LAN testing, use the host machine IP address and keep the phone on the same
network.

### Physical iPhone

1. Run with a reachable URL:

   ```sh
   EXPO_PUBLIC_SKROBOT_WEB_URL=https://YOUR_DEPLOYED_APP_URL npm run mobile:ios
   ```

2. Complete the Physical iPhone row in `docs/native/DEVICE_VALIDATION_LOG.md`.

### Physical Android

1. Run with a reachable URL:

   ```sh
   EXPO_PUBLIC_SKROBOT_WEB_URL=https://YOUR_DEPLOYED_APP_URL npm run mobile:android
   ```

2. Complete the Physical Android row in `docs/native/DEVICE_VALIDATION_LOG.md`.

## What To Prove On Each Target

Record evidence for each item in the log:

- App URL used by the shell.
- Build/run source.
- Sign-in result, including whether the link was a dev link or delivered email.
- `/api/me` result after sign-in.
- `/api/live-token` result after sign-in.
- Microphone permission prompt/result.
- One completed on-screen game.
- One attempted voice session.
- Any deviation from the web app.

After all rows are filled with real results, run:

```sh
npm run native:parity-status
```
