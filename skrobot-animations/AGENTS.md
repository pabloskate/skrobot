# Skrobot Animation Playground

Standalone Vite playground for iterating on robot/avatar/trick animations.
Reusable animation behavior lives in `../packages/animations`; this package owns
preview controls, fixture data, and the demo shell.

## Commands

From this directory:

```sh
npm run dev
npm run typecheck
```

From the repo root:

```sh
npm run typecheck:animations
```

## Rules

- Treat `src/` in this package as playground-only UI and fixtures.
- Production animation changes belong in `../packages/animations`, which is
  consumed by both the web game and this playground.
- Do not import from the web app's `src/` tree.
- Do not commit generated `dist/` output unless a review explicitly needs a
  static demo artifact.
