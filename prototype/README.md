# Frozen design references

These standalone HTML demos record design explorations. They are reference
artifacts, not another implementation to maintain alongside the app.

`pick-a-trick.html` (Call It) keeps its original bundled JavaScript and a frozen
copy of its animation styles. Its experimental TypeScript source was retired
after the feature moved into the app. Serve the repository root with a local
static server and open `/prototype/pick-a-trick.html`; no build step is required.

The maintained implementation is:

- `src/features/game/RobotSetTurn.tsx`: choosing and resolving one robot set.
- `src/features/game/pickTimeline.ts` and `PickReel.tsx`: reel planning and display.
- `packages/animations/src/scene/TrickScene.tsx`: the scene and its `LeadIn` API.

Change those sources for product work. Use `skrobot-animations` to preview shared
animation changes. Do not restore copied renderers or imports of animation
internals here; a new live demo should consume the maintained public components.
