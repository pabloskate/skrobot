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
| On-screen gameplay | `src/features/game/` | Web UI may call reducer, robot model, trick catalog, and records. |
| Voice gameplay | `src/features/voice/` | Web Live API client code plus resolver/prompts. |
| Voice token mint | `src/features/voice/server/` | Server-only; imported directly only by `src/app/api/live-token`. |
| Auth/session/quota | `src/features/auth/` | Client auth state in the barrel; server code under `server/`. |
| Billing | `src/features/billing/` | Beta quota UI plus dormant Stripe server helpers. |
| Tricks | `src/features/tricks/` | Catalog, difficulty, metadata, picker/setup UI, and the default routed trick pool. Routed games currently use flatground only. |
| Gallery | `src/features/gallery/` | Flatground trick gallery: browse the catalog with stance filters and optional curated video tips. |
| Robots | `src/features/robots/` | Roster, skill model, profile/select/avatar UI. Routed home currently exposes flatground robots only. |
| Records | `src/features/records/` | LocalStorage W/L and game log until the D1 port. |
| Runtime infrastructure | `src/platform/server/` | Cloudflare env and bindings, D1, future logging/HTTP adapters. |
| Shared primitives | `src/shared/` | Reserved for domain-neutral primitives only; currently empty. |
| Expo companion app | `apps/mobile/` | Native WebView shell that loads the same web app; no alternate game implementation. |
| Animation playground | `skrobot-animations/` | Standalone Vite package with cloned UI animation code; sync manually by design. |

## Dependency Map

Imports across web features must go through `@/features/<name>` unless an API
route is importing server-only feature code. This map is enforced by
`eslint.config.js`.

| Feature | May depend on | Must not depend on |
|---|---|---|
| `apps/mobile` | React Native/Expo, WebView, linking helpers | `src/*`, Cloudflare platform, web feature internals, game/domain packages |
| `skrobot-animations` | package-local files only | `src/*`; changes do not sync automatically |
| `auth` | `platform/server` from server files | Gameplay, screens, other features |
| `billing` | `platform/server` from server files | Auth UI, gameplay, screens, other features |
| `tricks` | none | Other features |
| `gallery` | `tricks` | Other features |
| `records` | none | Other features |
| `robots` | `tricks`, `records` | Screens, game, voice, auth, billing |
| `home` | `robots`, `records` | Game/voice flow internals; non-flatground roster setup |
| `dice` | `tricks` | Robot/game/record/auth concerns |
| `game` | `tricks`, `robots`, `records` | Voice, home, dice, auth, billing |
| `voice` | `game`, `tricks`, `robots`, `records`, `auth`, `billing` | Home and dice screens |
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
