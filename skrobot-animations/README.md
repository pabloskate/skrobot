# Skrobot Animation Playground

A standalone, interactive dev environment for the Skrobot animation assets.

## What's inside

- `TrickAnimation` — side-view SVG animation of a robot attempting a skate trick, imported from `@skrobot/animations`.
- `TrickAnimation3D` — perspective SVG renderer sharing the same animation model.
- `TrickScene` — from-scratch look on the same physics: a new toy-robot character, a golden-hour skate plaza, and a crane camera that rises with the pop. Code lives in `packages/animations/src/scene/`; its tests assert it moves exactly like `TrickAnimation3D` and keeps every trick in frame.
- Grinds — flat-bar grinds and slides, rendered by `TrickScene` only. Under `packages/animations/src/scene/`, `grindDefinitions.ts` owns the catalog and contact geometry, `grind.ts` the timing and board path, `grindRig.ts` the rider's body, and `rail.tsx` the bar. Both rider solvers share `skeleton.ts`.
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
2. Pick the rider's natural **Rider stance** (`regular` or `goofy`).
3. Pick a trick and its independent **Trick stance** (`regular`, `fakie`, `switch`, or `nollie`).
4. Click **Land** to see the success animation, **Fall** to see the bail, or **Replay** to restart the current one.
5. Switch **Playback** between normal and slow motion to inspect trick timing.
6. Pin a **Background** and **Fall** variant, then copy the parameter JSON below the demo.

Switch **Discipline** to **Grinds** for flat-bar tricks: pick a **Grind side**
(Frontside or Backside) and a grind or slide. Grinds only render in the Scene
view, so the other views are disabled while Grinds is selected. The frame
buttons become Setup / Pop / Lock / Hold / Pop off / Roll away, or
Slip / Bail for a fall. Frontside means the bar is on the rider's toeside on
the way in. Pick a
**Trick into grind** (for example Kickflip) to pop a flatground trick on the
way to the bar, giving "Kickflip into Frontside Lipslide". Flips, shuvits,
and spins (180s, 360s, bigspins, and flips with them) qualify; dolphin flips
and impossibles don't. The trick turns the board during the hop, settles onto
the bar, and a "Trick" phase is added to the frame buttons and transport
timeline. A 180 or bigspin turns the rider round, so the grind is named the
way they then ride it, fakie: its side is where the bar is at the lock, and
nose and tail are theirs. "Backside 180 into Frontside Nosegrind" rolls in
with the bar on the heelside and grinds the front-foot truck, now trailing
(it sits like a switch 5-0). In the animation params JSON it shows up as
`entryTrick`. The contact sheet
has the same Flatground / Grinds switch, with each grind's key frames placed
at its own timing (and the same Trick into grind control).

The New 3D preview opens on a frozen setup pose. Use the frame slider or
Setup / Pop / Peak / Catch / Roll away buttons to inspect the motion, and
Land / Fall / Replay to return to playback. Background presets apply to the
side and legacy views; New 3D uses its original outdoor scene.

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
