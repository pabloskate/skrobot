# Skrobot Animations Package

Shared animation source for the web game and the standalone playground.

## Rules

- Keep reusable robot/avatar/trick animation code here.
- Production feature files under `src/features/*` should wrap this package rather
  than cloning animation components.
- Playground-specific knobs and demo data stay in `skrobot-animations/`.
- Do not import from `src/app/` or web feature internals. Use structural types so
  feature-owned `Robot` and `Trick` objects can be passed in safely.

## Verification

From the repo root:

```sh
npm run typecheck:animations
```
