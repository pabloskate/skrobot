# Skrobot Animation Playground

Standalone Vite playground for iterating on robot/avatar/trick animations.
This package is intentionally isolated from the web app.

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

- Treat `src/` in this package as a sandbox clone, not the production web app.
- Production animation changes must be ported back to the matching files under
  `/src/features/*` before they affect the game.
- Do not import from the web app's `src/` tree.
- Do not commit generated `dist/` output unless a review explicitly needs a
  static demo artifact.
