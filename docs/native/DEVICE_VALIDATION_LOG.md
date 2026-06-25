# Native Device Validation Log

Native parity is not complete until this log contains real results from the
matrix in `docs/native/PARITY_CHECKLIST.md`. Use
`docs/native/DEVICE_VALIDATION_RUNBOOK.md` to produce those results.

Do not fill this with expected behavior. Each row needs evidence from an actual
simulator, emulator, or physical device run.

Run `npm run native:parity-status` from the repo root to check whether any
target is still pending.

## Current Status

| Target | App URL | Build/run source | Sign-in | `/api/me` after sign-in | Voice token | Mic permission | Screen game | Voice session | Deviations |
|---|---|---|---|---|---|---|---|---|---|
| iOS Simulator | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Android Emulator | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Physical iPhone | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Physical Android | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Evidence Notes

For each target, include:

- Date tested.
- Device model and OS version.
- App URL used.
- Whether sign-in used dev link or delivered email.
- `/api/me` response state after sign-in.
- `/api/live-token` result after sign-in.
- Microphone permission prompt and result.
- One completed on-screen game result.
- One voice session attempt result.
- Any deviation from the web app, including layout, navigation, auth, storage,
  audio, quota, or recovery behavior.
