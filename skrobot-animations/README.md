# Skrobot Animation Playground

A standalone, interactive dev environment for the Skrobot animation assets.

## What's inside

- `TrickAnimation` — side-view SVG animation of a robot attempting a skate trick, imported from `@skrobot/animations`.
- `TrickAnimation3D` — perspective SVG renderer sharing the same animation model.
- `SlowMotionTrickAnimation` — a ready-made slow-motion version of `TrickAnimation`.
- `BACKGROUND_SCENE_OPTIONS` / `FALL_VARIANT_OPTIONS` — named scene and bail presets for reproducible demos.
- `RobotAvatar` — parameterized robot avatar SVG from the shared animation package.
- `rpsFeedback` — sound + vibration helpers for RPS from the shared animation package.
- A Vite-powered playground UI for iterating on animations.

## Get started

```bash
cd skrobot-animations
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

## How to use the playground

1. Pick a robot.
2. Pick a trick and stance.
3. Click **Land** to see the success animation, **Fall** to see the bail, or **Replay** to restart the current one.
4. Switch **Playback** between normal and slow motion to inspect trick timing.
5. Pin a **Background** and **Fall** variant, then copy the parameter JSON below the demo.

## Slow motion

Use `SlowMotionTrickAnimation` for the preset slow-motion version, or pass
`playbackRate` to `TrickAnimation` for a custom speed.

Use `backgroundSceneId` and `fallVariant` to pin a reproducible animation setup.
Leave them unset to keep the original randomized behavior.

## Type check

```bash
npm run typecheck
```

From the repo root, this is included in:

```bash
npm run typecheck:animations
npm run check
```

## Notes

- Reusable animation code lives in `../packages/animations` and is consumed by
  both this playground and the production web app.
- This package does not import from the main app, so animation ideas can be
  iterated on without touching feature code.
- Playground-only changes stay here. Animation behavior changes should land in
  `packages/animations` so the game and playground remain in lockstep.
- Do not commit `dist/` output unless there is an explicit reason to publish a
  static demo artifact.
