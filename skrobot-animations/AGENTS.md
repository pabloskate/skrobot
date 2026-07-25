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

## Verifying animation changes

The playground header has a **Contact sheet** mode: every trick as a row of
frozen key frames (wind-up → pop → peak → catch → touch down → ride away),
rendered via the `fixedTime` prop on `TrickAnimation`/`TrickAnimation3D`.
Use the filter to narrow to the trick family you're editing, set Rider to
"both" to compare the regular/goofy mirror, and View "both" to compare the
2D and 3D renderers side by side. Screenshot before and after a change and
diff. Each cell's root carries `data-*` attributes (`data-board-flip`,
`data-nose-foot`, `data-toe-side`, …) so pose state can also be asserted
programmatically from the DOM.

The symmetry invariants behind those poses are tested in
`../packages/animations/src/animationInvariants.test.ts` (runs with the root
`npm test`). Run it after any change to `computeFrame`, `specFor`, or
`stanceMechanics`.

## Rules

- Treat `src/` in this package as playground-only UI and fixtures.
- Production animation changes belong in `../packages/animations`, which is
  consumed by both the web game and this playground.
- Do not import from the web app's `src/` tree.
- Do not commit generated `dist/` output unless a review explicitly needs a
  static demo artifact.
