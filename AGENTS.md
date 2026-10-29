# Skate Robot

Mobile-first web game: play S.K.A.T.E. against robot opponents. The player skates
for real and reports results; each robot has explicit per-trick land rates and set
weights. Has an on-screen mode and a hands-free voice mode (Gemini
Live API) for playing with earbuds at the skatepark.

## Stack

- Next.js (App Router) + React 19 + TypeScript, plain CSS in `src/app/globals.css`.
- Deployed to **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) — not Vercel.
- Backend: **Cloudflare D1** via the `DB` binding for auth/session/quota data.
  Gameplay records still persist in localStorage until `features/records` is ported.
- Workspaces: `apps/mobile` is an Expo native shell that loads the production web
  app in a WebView for one-to-one parity. `packages/animations` is the shared
  animation source consumed by the web app and the standalone playground.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server on the Mac mini's Tailscale IP (Cloudflare bindings emulated via `initOpenNextCloudflareForDev`) |
| `npm run build` | `next build` — typecheck + production build (catches type errors, not logic bugs) |
| `npm test` | Vitest unit tests — the behavioral check for the rules engine, RPS, trick resolver, and animation motion |
| `npm run test:changed` | Only the tests your uncommitted changes reach |
| `npm run test:quick` | Every test with the animation sweeps thinned to a sample of their cases (`ANIMATION_SWEEP=quick`) — the fast loop, about 15 s; `npm test` sweeps in full in about a minute and a half |
| `npm run lint` | ESLint (flat config) — also enforces the architecture import boundaries below |
| `npm run typecheck:web` | Full root TypeScript check, including tests omitted by `next build` |
| `npm run typecheck:mobile` | Typecheck the Expo companion app |
| `npm run typecheck:animations` | Typecheck the shared animation package and standalone playground |
| `npm run check` | Full local confidence pass: lint boundaries, all typechecks, tests, then production build |
| `npm run mobile:start` | Start the Expo native shell from the repo root |
| `npm run mobile:ios` | Start the Expo native shell on iOS simulator/device |
| `npm run mobile:android` | Start the Expo native shell on Android emulator/device |
| `npm run native:parity-status` | Report whether required native device validation evidence is still pending |
| `npm run preview` | Build the real Cloudflare worker and serve it on the Tailscale IP with wrangler |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run cf-typegen` | Generate Wrangler binding types to `/private/tmp` for comparison with `cloudflare-env.d.ts` |

Secrets: `GEMINI_API_KEY` lives in `.env.local` (next dev), `.dev.vars` (preview), or
`npx wrangler secret put GEMINI_API_KEY` (production). It must never reach client code.

## Architecture: feature-first web app + native parity shell

```
apps/
└── mobile/              # Expo WebView shell; no alternate game implementation
packages/
└── animations/          # Shared robot/avatar/trick animation source
skrobot-animations/      # Standalone playground; imports packages/animations
src/
├── app/                  # Routes ONLY — thin shells, no domain logic
│   ├── page.tsx          #   / → renders AppShell
│   ├── AppShell.tsx      #   client-side screen state machine (the whole game is one page)
│   ├── api/live-token/   #   POST: auth-gated Gemini token mint + voice quota claim
│   ├── api/auth/         #   Magic-link auth routes (delegate to auth/server)
│   ├── api/billing/      #   Dormant Stripe routes, disabled unless ENABLE_BILLING=true
│   ├── api/me/           #   Current user + voice quota
│   ├── tune/             #   /tune → robot behavior editor shell
│   ├── explore/          #   /explore → Trick Explorer shell (/explore/3d redirects to it)
│   ├── dream-tricks/     #   /dream-tricks → Dream Tricks shell (player-facing explorer)
│   ├── about/            #   /about → About & virtual-location notice shell (explorer feature)
│   └── globals.css       #   all styling (class-based, mobile-first)
├── features/             # One folder per web feature; public API is index.ts
│   ├── auth/             # Passwordless sign-in UI + server session/magic-link code
│   ├── billing/          # Beta quota screen + dormant Stripe server helpers
│   ├── tricks/           # Trick UI, catalog, difficulty, and metadata (routed app is flatground-only today)
│   ├── robots/           # Robot UI, roster, and explicit behavior tables (home exposes flatground robots today)
│   ├── game/             # On-screen game UI, reducer, RPS, attempt logic, want-to-learn star on defense (beta)
│   ├── voice/            # Voice mode: Gemini Live session, tools, audio; server/ = token mint
│   ├── records/          # Player W/L + game log + trick marks + per-trick attempt stats (localStorage today, D1 candidate)
│   ├── analytics/        # Privacy-safe product events, offline delivery, D1 ingestion
│   ├── skater/           # Player model: skate score (unlocks at 8 games, beta-gated), robot-ladder placement, adaptive rival robot
│   ├── home/             # Landing screen / flatground robot choice
│   ├── install/          # App Store handoff + Android PWA install guidance (web-only)
│   ├── explorer/         # Trick Explorer at /explore (/explore/3d redirects here): tricks + grind combos, robot, the realistic human, or the alien, camera angles, spots (plaza, waterfront, El Toro's 20 stair and its handrails, Hollywood High's back-to-back 16 and 12 stairs and rails, plus the 16's fence, Wallenberg, Roof to Bank, 25 Stair, Leap of Faith, UC Davis Gap over the ivy bank, Carlsbad Gap over the grass bank onto its uphill landing, Emage 20 in Denver and its side rail, Triangle Bank (onto the triangular bank, over it, or grinds down its edges)), tripod angles at the landmarks, shareable links, MP4 download; plus Dream Tricks at /dream-tricks, the same stage for players (landmark spot first, avatar cards to pick a skater, then what to hit and the trick), and the /about location notice both link to
│   └── gallery/          # Flatground trick gallery + player trick book (search, stance filters, video tips, want-to-learn shelf, proven marks, consistency stats)
├── platform/             # Runtime infrastructure (Cloudflare env, D1 bindings)
└── shared/               # Primitive domain-neutral helpers (online status, etc.)
```

Full dependency map and complexity budget: `docs/ARCHITECTURE.md`.
Feature ownership registry: `docs/FEATURE_OWNERSHIP.md`.
Review checklist: `docs/ARCHITECTURE_REVIEW.md`.

### Rules (keep these invariants)

Rules 1, 4, and 5 (import boundaries, dependency direction, and server/client
separation) are enforced by `no-restricted-imports` in `eslint.config.js` and
the exact graph test in `src/architecture.test.ts`.

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
4. **Dependency direction:** `home`/`game`/`voice`/`gallery` (screens) may
   depend on `tricks`/`robots`/`records` (domain data); domain features don't
   import screens. `gallery` also shows the player model (`skater`) in its Stats
   tab. `voice` also wraps `game`. The exact allowed feature graph lives in
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
- **Animation changes:** edit `packages/animations` (folder map and "where to
  make common changes" in the Animation Source Map of `docs/ARCHITECTURE.md`);
  keep playground-only controls and fixture data in `skrobot-animations`.
  Iterate with `npm run test:quick` (every suite, sweeps thinned), then
  run `npm test`. For motion changes, watch the trick in `/explore` from a
  few angles and both rider stances, or compare the playground Contact sheet
  before and after (`skrobot-animations/AGENTS.md`).
- **Rules/catalog/robot/voice resolver changes:** edit the owning feature under
  `src/features/*` and update tests that exercise the behavior through the web
  feature API.
- **New package/app:** document its ownership and verification path in
  `docs/ARCHITECTURE.md` and make `npm run check` cover at least its typecheck.
- **New screen in the existing flow:** add a variant to `Screen` in
  `src/app/AppShell.tsx`. Root tabs are shareable via `?tab=skate|tricks|settings`.
  Game/profile stay in-memory because trick
  pools aren't URL-serializable; if one of those must be linkable, lift its
  inputs into the URL and split it into its own route under src/app/.
  Top-level tabs (the selected game format, Tricks, and Settings) are root
  screens available to everyone (release 1.3.1 made the Tricks tab generally
  available); voice mode and the Adaptive challenge are beta-only and require
  `?version=beta`. Sub-screens (profile, game, voice, signin) show a back button
  and hide the tab bar.
- **New API endpoint:** thin route under `src/app/api/`, logic in
  `features/<name>/server/`.
- **Backend work (D1):** keep SQL migrations in `migrations/` and use the
  `db:migrate:*` scripts. `features/records` is still localStorage and is the next
  candidate to port to D1.

## Gotchas

- The Live model id is pinned in `features/voice/live-model.ts` and shared by the
  browser session and the server token mint — they must match or tokens are rejected
  (model rationale: docs/VOICE_MODE_PLAN.md §2).
- Voice authentication always uses the server-side `GEMINI_API_KEY` to mint an
  ephemeral token; long-lived API keys must never be exposed to client code.
- Robot behavior is fully explicit in `src/features/robots/behavior.ts`: every
  robot/trick/stance land rate and set weight is authoritative. Missing land-rate
  entries mean the trick is not in the bag; missing/zero set weights mean it is
  never selected as a set. `robotConsistency` and `trickSetWeight` are direct
  lookups only. Edit visually at `/tune`; do not add skill curves, stance rules,
  favorite boosts, caps, exclusions, or modeled fallbacks.
- After `next build`/`next dev`, Next may rewrite `tsconfig.json` includes — that's
  expected, don't fight it.

## Hosting previews on the Mac mini

- This repository runs on a **Mac mini used as a server**. The user reviews it
  from other devices through Tailscale. Its address is **`100.74.88.58`**.
  A link to `localhost` or `127.0.0.1` points at the device opening the link,
  so it is not a usable handoff URL for this project.
- Use the npm hosting commands: `dev`, `start`, and Cloudflare `preview` at the
  root, and `dev`/`preview` in `skrobot-animations`. They bind to the Tailscale
  address by default. For another machine, set `SKROBOT_PREVIEW_HOST` in the
  command's environment; for example, `SKROBOT_PREVIEW_HOST=127.0.0.1 npm run dev`
  explicitly selects a local-only server.
- The main web preview is **`http://100.74.88.58:3000`**. A separate worktree
  must use its own free port, such as `npm run dev -- --port 3107`, and share
  the actual route, for example **`http://100.74.88.58:3107/dream-tricks`**.
  Reuse an existing server only after verifying that it serves the intended
  worktree. Never stop another thread's server to free a port.
- For static prototype/evidence files, bind the server too:
  `python3 -m http.server 3108 --bind 100.74.88.58 --directory /absolute/path/to/files`.
  Share `http://100.74.88.58:3108/<file>`, not a loopback URL or a local file path.
- Before handing over a hosted result, verify its Tailscale URL with a real GET
  (for example, `curl --fail --silent --output /dev/null http://100.74.88.58:3107/dream-tricks`)
  and open it in the collaborative browser. Confirm that the displayed build
  is the intended one and that the server is still running. The user's viewing
  device must be connected to the same tailnet.
- **Leave a delivered prototype running for review.** Use a persistent terminal
  or managed server session. Include the live URL, port and worktree in the
  handoff. If validation temporarily stops your server, restart it and verify
  the URL before delivery. Stop it when the user requests cleanup or it has
  been superseded. Temporary verification-only servers can be stopped after
  their checks. If you cannot keep a server alive, say so explicitly; do not
  present its URL as a live preview.

## Preview tools (t3-code_preview_*)

- Prefer an explicit Tailscale URL, such as
  `preview_navigate({"url": "http://100.74.88.58:3000"})`, or the worktree's own
  port. If using `target: {kind: "environment-port", port: 3000}`, `port` must
  be a literal **number**, never `{}` or a string. If that target resolves to
  loopback and fails, navigate to the explicit Tailscale URL instead.
- Optional params (`url`, `tabId`, etc.) must be **omitted**, never `null`.
- If a call fails argument validation, **change the argument** — never retry the
  same payload.
- This model may not support image input. Verify UI via `preview_snapshot` /
  `preview_evaluate` rather than asking the user for screenshots.
- Close every preview tab you opened (`t3_preview_list`, then
  `t3_preview_close`) before ending your turn. The preview browser draws WebGL
  on the CPU and never throttles, so a stage left open keeps several cores busy
  for hours.
