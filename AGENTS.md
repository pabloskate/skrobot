# Skate Robot

Mobile-first web game: play S.K.A.T.E. against robot opponents. The player skates
for real and reports results; the robot's attempts are dice rolls weighted by a
per-robot skill model. Has an on-screen mode and a hands-free voice mode (Gemini
Live API) for playing with earbuds at the skatepark.

## Stack

- Next.js (App Router) + React 19 + TypeScript, plain CSS in `src/app/globals.css`.
- Deployed to **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) — not Vercel.
- Backend: **Cloudflare D1** via the `DB` binding for auth/session/quota data.
  Gameplay records still persist in localStorage until `features/records` is ported.
- Workspaces: `apps/mobile` is an Expo native shell that loads the production web
  app in a WebView for one-to-one parity. `skrobot-animations` is a standalone
  animation playground, not a workspace.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (Cloudflare bindings emulated via `initOpenNextCloudflareForDev`) |
| `npm run build` | `next build` — typecheck + production build (catches type errors, not logic bugs) |
| `npm test` | Vitest unit tests — the behavioral check for the rules engine, RPS, and trick resolver |
| `npm run lint` | ESLint (flat config) — also enforces the architecture import boundaries below |
| `npm run typecheck:mobile` | Typecheck the Expo companion app |
| `npm run typecheck:animations` | Typecheck the standalone animation playground |
| `npm run check` | Full local confidence pass: lint boundaries, tests, package typechecks, then production build |
| `npm run mobile:start` | Start the Expo native shell from the repo root |
| `npm run mobile:ios` | Start the Expo native shell on iOS simulator/device |
| `npm run mobile:android` | Start the Expo native shell on Android emulator/device |
| `npm run native:parity-status` | Report whether required native device validation evidence is still pending |
| `npm run preview` | Build the real Cloudflare worker and serve it locally with wrangler |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run cf-typegen` | Generate Wrangler binding types to `/private/tmp` for comparison with `cloudflare-env.d.ts` |

Secrets: `GEMINI_API_KEY` lives in `.env.local` (next dev), `.dev.vars` (preview), or
`npx wrangler secret put GEMINI_API_KEY` (production). It must never reach client code.

## Architecture: feature-first web app + native parity shell

```
apps/
└── mobile/              # Expo WebView shell; no alternate game implementation
skrobot-animations/      # Standalone playground; cloned animation code, manually synced
src/
├── app/                  # Routes ONLY — thin shells, no domain logic
│   ├── page.tsx          #   / → renders AppShell
│   ├── AppShell.tsx      #   client-side screen state machine (the whole game is one page)
│   ├── api/live-token/   #   POST: auth-gated Gemini token mint + voice quota claim
│   ├── api/auth/         #   Magic-link auth routes (delegate to auth/server)
│   ├── api/billing/      #   Dormant Stripe routes, disabled unless ENABLE_BILLING=true
│   ├── api/me/           #   Current user + voice quota
│   └── globals.css       #   all styling (class-based, mobile-first)
├── features/             # One folder per web feature; public API is index.ts
│   ├── auth/             # Passwordless sign-in UI + server session/magic-link code
│   ├── billing/          # Beta quota screen + dormant Stripe server helpers
│   ├── tricks/           # Trick UI, catalog, difficulty, and metadata (routed app is flatground-only today)
│   ├── robots/           # Robot UI, roster, and skill model (home exposes flatground robots today)
│   ├── game/             # On-screen game UI, reducer, RPS, and attempt logic
│   ├── voice/            # Voice mode: Gemini Live session, tools, audio; server/ = token mint
│   ├── records/          # Player W/L + game log (localStorage today, D1 candidate)
│   ├── home/             # Landing screen / flatground robot choice
│   ├── gallery/          # Flatground trick gallery (stance filters, optional video tips)
│   └── dice/             # Standalone random-trick roller
├── platform/             # Runtime infrastructure (Cloudflare env, D1 bindings)
└── shared/               # Primitive domain-neutral helpers only (currently empty)
```

Full dependency map and complexity budget: `docs/ARCHITECTURE.md`.
Feature ownership registry: `docs/FEATURE_OWNERSHIP.md`.
Review checklist: `docs/ARCHITECTURE_REVIEW.md`.

### Rules (keep these invariants)

Rules 1, 4, and 5 (import boundaries, dependency direction, and server/client
separation) are enforced by `no-restricted-imports` in `eslint.config.js` —
break one and `npm run lint` fails with a message pointing back here.

1. **Import features only through their barrel** (`@/features/<name>`), never deep
   paths. Each feature's `index.ts` is its public API and documents what the feature
   is. Within a feature, use relative imports. The one sanctioned exception:
   `src/app/api/*` routes import `@/features/<name>/server/*` directly — server-only
   code is deliberately kept out of client barrels.
2. **`src/app/` stays thin.** Routes render feature components and wire HTTP to
   feature server functions. New domain logic goes in a feature, not in `app/`.
3. **Web features are the source of truth for product behavior.**
   `src/features/game/engine.ts` is the pure reducer; tricks, robots, records,
   and voice resolver logic live in their owning feature folders. Mobile must not
   rebuild or import game/domain logic; it loads the same web app in a WebView.
4. **Dependency direction:** `home`/`dice`/`game`/`voice` (screens) may depend on
   `tricks`/`robots`/`records` (domain data); domain features don't import screens.
   `voice` also wraps `game`. The exact allowed feature graph lives in
   `docs/ARCHITECTURE.md`. Nothing imports from `src/app/`.
5. **Server vs client:** files under `features/*/server/` are server-only.
   Everything else in features is client-safe (most components are `'use client'`).
   Secrets only in server code.
6. **Platform vs shared:** runtime details (Cloudflare env, D1 bindings, future
   logging/HTTP adapters) live in `src/platform/`. `src/shared/` is only for
   primitive domain-neutral helpers.
7. **Browser API calls:** first-party `fetch('/api/...')` calls live in a
   feature-owned `api.ts`, not leaf UI components.

### Adding things

- **New feature:** `src/features/<name>/` with an `index.ts` barrel carrying a short
  doc comment. Add a row to the tree above and to the dependency map in
  `docs/ARCHITECTURE.md` and `docs/FEATURE_OWNERSHIP.md`, then update
  `eslint.config.js` to enforce it.
- **Rules/catalog/robot/voice resolver changes:** edit the owning feature under
  `src/features/*` and update tests that exercise the behavior through the web
  feature API.
- **New package/app:** document its ownership and verification path in
  `docs/ARCHITECTURE.md` and make `npm run check` cover at least its typecheck.
- **New screen in the existing flow:** add a variant to `Screen` in
  `src/app/AppShell.tsx`. Screens are in-memory state by design (trick pools aren't
  URL-serializable); if a screen must be linkable, split it into a real route instead.
  Top-level tabs (S.K.A.T.E., Tricks, Account) are beta root screens shown only
  when the URL has `?beta=true`; sub-screens (profile, game, voice, signin,
  upgrade) show a back button and hide the tab bar.
- **New API endpoint:** thin route under `src/app/api/`, logic in
  `features/<name>/server/`.
- **Backend work (D1):** keep SQL migrations in `migrations/` and use the
  `db:migrate:*` scripts. `features/records` is still localStorage and is the next
  candidate to port to D1.

## Gotchas

- The Live model id is pinned in `features/voice/live-model.ts` and shared by the
  browser session and the server token mint — they must match or tokens are rejected
  (model rationale: docs/VOICE_MODE_PLAN.md §2).
- `NEXT_PUBLIC_GEMINI_API_KEY` is a dev-only fallback that ships to the browser;
  production auth is the ephemeral-token route.
- Robot "skill" is emergent: `src/features/robots/robots.ts#robotConsistency`.
  A robot rides a set of
  `disciplines` (the bag filter), and consistency is a smooth curve over
  `skill - effectiveDifficulty`, where stance adds a load that depends on the
  trick (`src/features/tricks/tricks.ts#stanceLoad`: a switch shuvit barely loads, a switch flip loads a
  lot) softened by per-robot `stanceComfort`. Boosts: `favorites`, `focus`
  disciplines, `signatureStance`. Because difficulty drives bag membership, the real
  learning order is automatic: a robot can't have a kickflip without the shuvit/180
  under it. Tune numbers in `robots.ts`/`tricks.ts`, not in the engine. Stance is
  decoupled from trick on purpose (a robot can be better at nollie flips than regular
  ones); the `nolly` robot is the reference example.
- After `next build`/`next dev`, Next may rewrite `tsconfig.json` includes — that's
  expected, don't fight it.
