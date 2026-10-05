# Skrobot Animations Package

Shared animation source for the web game, the Trick Explorer, and the
standalone playground: trick motion, the stage, its sets and riders, and the
three.js renderer.

## Where things are

One folder per concept under `src/` (full map, and where to make common
changes, in the Animation Source Map of `../../docs/ARCHITECTURE.md`):

- `motion/` the trick and rider motion, no drawing (`trick.ts` has the table of what every flatground trick does)
- `stage/` one attempt put in the world, frame by frame
- `camera/` the crane, the sun and palette, and the three.js camera
- `sets/` the spots; `sets/sets.ts` is the registry
- `riders/` who rides; `riders/skaters.ts` is the registry
- `board/` the skateboard
- `three/` the renderer and the public `./three` and `./three/video` entries
- `sound/` trick sounds and the page's audio context
- `ui/` small SVG components for the game's screens

## Rules

- Keep reusable robot/avatar/trick animation code here.
- Production feature files under `src/features/*` should wrap this package rather
  than cloning animation components.
- Playground-specific knobs and demo data stay in `skrobot-animations/`.
- Do not import from `src/app/` or web feature internals. Use structural types so
  feature-owned `Robot` and `Trick` objects can be passed in safely.
- Consumers use the package exports; everything else is private.
- The root entry (`src/index.ts`) must never load three.js or the video
  encoder; `src/architecture.test.ts` walks its imports to check.
- A spot or a skater is added in its registry and the renderer's builder map,
  not with `set === '…'` / `skater === '…'` checks elsewhere.
- Test helpers shared by suites live in `src/testing.ts`; it is never exported.

## Verification

From the repo root:

```sh
npm run typecheck:animations
npm run test:changed   # while iterating
npm test               # before finishing
```

For motion changes, watch the trick in `/explore` from a few angles and both
rider stances, or compare the playground Contact sheet before and after, as
described in `../../skrobot-animations/AGENTS.md`.
