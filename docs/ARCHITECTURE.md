# Architecture

Skate Robot is a feature-first web app with a native parity shell. The
codebase should feel easy to navigate by answering two questions quickly:

1. What feature owns this behavior?
2. Is this product behavior, runtime infrastructure, or native shell behavior?

If the answer is unclear, tighten the feature boundary before adding more code.

## Where To Look

| Need | Start here | Notes |
|---|---|---|
| Route or API wiring | `src/app/` | Thin shells only. Move behavior into a feature. |
| Web feature API | `src/features/<name>/index.ts` | Public web boundary. Other web features import this barrel. |
| Game rules in the web app | `src/features/game/engine.ts` | Pure reducer; edit here for rule changes. |
| On-screen gameplay | `src/features/game/` | Web UI may call reducer, robot model, trick catalog, and records. `TrickAnimation.tsx` loads the shared three.js renderer for waterfront attempts, including the pick reel, replay, and slow motion. |
| Robot set presentation | `src/features/game/RobotSetTurn.tsx` | Owns one set turn; `pickTimeline.ts` plans the reel and `PickReel.tsx` renders it. Eligible tricks and weighted selection stay in `engine.ts`. |
| Voice gameplay | `src/features/voice/` | Web Live API client code plus resolver/prompts. |
| Voice token mint | `src/features/voice/server/` | Server-only; imported directly only by `src/app/api/live-token`. |
| Auth/session/quota | `src/features/auth/` | Client auth state in the barrel; server code under `server/`. |
| Billing | `src/features/billing/` | Beta quota UI plus dormant Stripe server helpers. |
| Tricks | `src/features/tricks/` | Catalog, difficulty, metadata, picker UI, and the default routed trick pool. Routed games currently use flatground only. |
| Trick Explorer | `src/features/explorer/` | Customer-facing animation playground at `/explore`: flatground tricks and grind combos on the three.js stage, scrubbable playback, camera angles, a choice of spot and of skater (robot or human), and shareable links. |
| Trick Explorer 3D | `src/features/explorer3d/` | Preview at `/explore/3d`: the explorer's tricks, cameras, and links on the three.js renderer, with a side-by-side comparison against the SVG scene. Reuses the explorer's picker, clock, and URL model; `/explore` also uses the three.js renderer. |
| Gallery | `src/features/gallery/` | Flatground trick gallery plus the player trick book: browse the catalog with stance filters, curated video tips, personal proven/learning state, and per-trick consistency stats. |
| Robots | `src/features/robots/` | Roster metadata, explicit per-trick land-rate/set-weight tables, profile/select/avatar UI, and the browser-local editor routed at `/tune`. Routed home currently exposes flatground robots only. |
| Player skill / adaptive rival | `src/features/skater/` | Skate score (player-only curve fit + frontier fallback), robot-ladder placement, and a generated rival that copies the closest roster behavior table. All derived from the game log; nothing persisted. |
| Records | `src/features/records/` | LocalStorage W/L, game log, trick marks, and per-trick attempt stats until the D1 port. |
| Product analytics | `src/features/analytics/` | Strict gameplay event contracts, anonymous installation identity, offline delivery, D1 ingestion, and the owner-only aggregate dashboard at `/admin/analytics`. |
| Web/native install handoff | `src/features/install/` | App Store handoff, Android PWA instructions, and browser/WebView detection. |
| Runtime infrastructure | `src/platform/server/` | Cloudflare env and bindings, D1, future logging/HTTP adapters. |
| Shared primitives | `src/shared/` | Reserved for domain-neutral primitives only, such as online status. |
| Expo companion app | `apps/mobile/` | Native WebView shell that loads the same web app; no alternate game implementation. |
| Shared animations | `packages/animations/` | Reusable robot/avatar/trick animation components, physics model, push-off scene, and browser feedback helpers. The three.js renderer is a separate entry, `@skrobot/animations/three`, so three.js ships only to pages that import it. |
| Animation playground | `skrobot-animations/` | Standalone Vite playground for animation iteration; consumes `@skrobot/animations` and owns only preview controls/fixtures. |
| Frozen design references | `prototype/` | Static artifacts with no build step; see its README for the maintained product sources. |

## Animation Source Map

Consumers use `@skrobot/animations` and its exported styles. Internal scene files
are private to the package; the import graph test checks alias and relative
imports so moving these files does not require app or playground changes.

| Change | Owner under `packages/animations/src/` |
|---|---|
| Flatground board motion | `TrickAnimation.tsx` (`computeFrame`) |
| Shared skeleton dimensions, frames, joints, and neutral poses | `scene/skeleton.ts` |
| Flatground rider motion | `scene/rig.ts` |
| Grind names, lock poses, contact geometry, and which ends a trick out can pop off | `scene/grindDefinitions.ts` |
| Tricks popped into and out of a grind | `scene/grindTricks.ts` |
| Grind timeline and board path | `scene/grind.ts` |
| Grind rider motion and handoff from flatground | `scene/grindRig.ts` |
| Scene rendering and reusable lead-in presentation | `scene/TrickScene.tsx` |
| Scene camera angles, lens, and the bounds every trick is framed for | `scene/camera.ts` (`SceneCamera`, `SCENE_CAMERA_BOUNDS`) |
| The scene in WebGL (`TrickScene3D`, `@skrobot/animations/three`): per-frame stage state worked out exactly as TrickScene does, the camera recovered from `scene/camera.ts`, the robot/board/bar/plaza meshes and their cel and ink shaders, and the outline pass; the human skater (`human3d.ts`) rides the same rig, with a person's arms (`humanRig.ts`). It reads the motion solvers and never changes them | `three/` (`stage.ts`, `view.ts`, `robot3d.ts`, `human3d.ts`, `humanGeometry.ts`, `humanMaterials.ts`, `humanRig.ts`, `board3d.ts`, `bar3d.ts`, `plaza3d.ts`, `materials.ts`, `post.ts`, `renderer.ts`) |
| Scene sets (backdrops): the stock plaza, the bayside waterfront and its far panorama, and the ground/prop/shadow helpers they share. A set's sky and panorama are `FarLayer`s: separate SVGs under the scene that are painted once and slid with a transform, so only what moves is repainted each frame | `scene/backdrop.tsx`, `scene/waterfront.tsx` (composition), `scene/waterfrontProps.tsx`, `scene/waterfrontPanorama.tsx`, `scene/setKit.tsx` (`SceneSet`) |

Motion solvers share the skeleton contract, not each other's private constants.
Grind entry reuses the flatground solver for the hop; tricks into and out of a
grind borrow its rotation clocks. Match-specific choices,
reel text, and reducer callbacks belong in `features/game`, passed through the
scene's `LeadIn` API. Keep tests sampling the complete motion; aggregate hot
sweeps by their worst violation instead of making an assertion per sample.

## Dependency Map

Imports across web features must go through `@/features/<name>` unless an API
route is importing server-only feature code. ESLint enforces the common cases;
`src/architecture.test.ts` locks the exact graph and catches relative bypasses.

| Feature | May depend on | Must not depend on |
|---|---|---|
| `apps/mobile` | React Native/Expo, WebView, linking helpers | `src/*`, Cloudflare platform, web feature internals, game/domain packages |
| `packages/animations` | React, three.js (only under `three/`), package-local files | `src/*`, `skrobot-animations/*`, app/platform code |
| `skrobot-animations` | package-local files, `@skrobot/animations` | `src/*`; reusable animation behavior belongs in `packages/animations` |
| `auth` | `platform/server` from server files | Gameplay, screens, other features |
| `analytics` | `platform/server` from server files | Gameplay and screen features; AppShell supplies lifecycle context through the public tracking API |
| `billing` | `platform/server` from server files | Auth UI, gameplay, screens, other features |
| `tricks` | none | Other features |
| `explorer` | `tricks`, `robots`, `@skrobot/animations`, `@skrobot/animations/three` | Other features; it plays animations and never reads or writes player records |
| `explorer3d` | `explorer`, `robots`, `@skrobot/animations`, `@skrobot/animations/three` | Other features; `explorer` must not import it back |
| `gallery` | `tricks`, `records`, `robots`, `skater` | Other features |
| `records` | `tricks` | Other features; the catalog dependency is limited to legacy display-name migration into stable trick IDs |
| `robots` | `tricks`, `records`, `@skrobot/animations` | Screens, game, voice, auth, billing, skater |
| `skater` | `tricks`, `records`, `robots` | Screens, game, voice, auth, billing |
| `home` | `robots`, `records`, `skater` | Game/voice flow internals; non-flatground roster setup |
| `install` | none | Other features; AppShell supplies native-shell context |
| `game` | `tricks`, `robots`, `records`, `@skrobot/animations`, `@skrobot/animations/three` | Voice, home, auth, billing |
| `voice` | `game`, `tricks`, `robots`, `records`, `auth`, `billing` | Home screens |
| `platform/server` | platform-local modules only | Features, app UI, domain logic |
| `shared` | shared-local modules only | Features, app, platform, domain logic |
| `app` | feature barrels and platform; API routes may import `features/*/server/*` | Domain logic |

Server-only files under `features/*/server/` are deliberately excluded from
feature barrels. Client-safe feature files must not import `server/` by alias or
relative path, and must not import `@/platform/server/*`.

## Native Parity Shell

`apps/mobile` exists to make the current web game feel native without creating a
second product surface. It loads the deployed or local web app in a WebView,
handles native link routing and platform permissions, and must not import web
features or game/domain modules directly.

Parity work is tracked in `docs/native/PARITY_CHECKLIST.md`. Native changes are
not complete until the exact web features are verified in the shell, especially
magic-link auth, WebView cookies, microphone permission, and Gemini voice mode
on real iOS and Android devices.

## Platform And Shared

`src/platform/` owns runtime details with no product meaning:

- Cloudflare env and bindings
- D1 access
- future logging, tracing, HTTP response helpers, queues, cache, or email adapters
- third-party clients that should not leak into UI code

`src/shared/` is only for primitive, stable, domain-neutral code. Good examples
would be formatting helpers or UI primitives. If a helper starts using words like
robot, trick, voice, quota, billing, or session, it belongs in a feature.

## Boundary Safety

Public boundaries are where unsafe inputs become typed values. Routes and
feature-owned API/server entry points are responsible for:

- auth and permission checks
- input parsing and validation
- secret lookup through platform modules
- external API calls or client wrappers
- response normalization

Do not let browser UI, route files, and persistence code each invent their own
validation path for the same workflow. Pick the boundary, parse once, and pass
safe values inward.

## Browser API Calls

Browser-initiated calls to first-party routes live in feature-owned API modules:

- `src/features/auth/api.ts`
- `src/features/voice/api.ts`
- `src/features/analytics/api.ts`

Leaf UI components should call those helpers instead of scattering
`fetch('/api/...')` details through the tree. Add a feature `api.ts` when a new
browser route contract appears.

## Complexity Budget

Every change should satisfy these constraints:

- A route stays a shell: it parses HTTP or selects a screen, then delegates.
- A feature exports only the public surface another feature needs.
- A feature dependency is added only when the dependency map is updated and linted.
- Runtime bindings and secrets stay behind `src/platform/server/`.
- Browser route calls stay in feature-owned `api.ts` files.
- Product rules/data stay in their owning feature folders.
- Animation motion and reusable scenes stay in `packages/animations`; game features supply match-specific text and state.
- Narration and UI react to reducer state instead of duplicating rules.
- Durable data changes come with a migration and stay behind a feature/server API.
- Repeated behavior is extracted only after there is real duplication or a shared
  contract, not just because it might be reused someday.

## Change Checklist

Run this before a boundary-affecting change is considered done:

```sh
npm run check
```

For small UI-only changes, `npm run lint` is the minimum because it is the
architecture boundary check. For rules, RPS, robot skill, or voice tool changes,
`npm test` is the behavioral check.

When adding a feature:

1. Create `src/features/<name>/index.ts` with a short doc comment.
2. Keep private files imported relatively inside the feature.
3. Add the feature to the dependency map in this doc.
4. Add or update the matching `no-restricted-imports` rule in `eslint.config.js`.
5. Add a row to `docs/FEATURE_OWNERSHIP.md` and the architecture tree in `AGENTS.md`.

When changing rules/catalog/robots/voice resolver behavior:

1. Edit the owning feature under `src/features/*`.
2. Keep imports through feature barrels from outside that feature.
3. Verify through web-facing tests (`npm test`).

When adding a package or app, add it to this doc and to `npm run check` with at
least a typecheck.
