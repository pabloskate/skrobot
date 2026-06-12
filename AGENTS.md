# Skate Robot

Mobile-first web game: play S.K.A.T.E. against robot opponents. The player skates
for real and reports results; the robot's attempts are dice rolls weighted by a
per-robot skill model. Has an on-screen mode and a hands-free voice mode (Gemini
Live API) for playing with earbuds at the skatepark.

## Stack

- Next.js (App Router) + React 19 + TypeScript, plain CSS in `src/app/globals.css`.
- Deployed to **Cloudflare Workers via OpenNext** (`@opennextjs/cloudflare`) — not Vercel.
- Backend (planned): **Cloudflare D1** via the `DB` binding. Not enabled yet; see
  `src/shared/db.ts` for the enable steps. All persistence is currently localStorage.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server (Cloudflare bindings emulated via `initOpenNextCloudflareForDev`) |
| `npm run build` | `next build` — use this as the fast correctness check |
| `npm run lint` | ESLint (flat config) |
| `npm run preview` | Build the real Cloudflare worker and serve it locally with wrangler |
| `npm run deploy` | Build + deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` from wrangler.jsonc bindings |

Secrets: `GEMINI_API_KEY` lives in `.env.local` (next dev), `.dev.vars` (preview), or
`npx wrangler secret put GEMINI_API_KEY` (production). It must never reach client code.

## Architecture: feature-first modular monolith

```
src/
├── app/                  # Routes ONLY — thin shells, no domain logic
│   ├── page.tsx          #   / → renders AppShell
│   ├── AppShell.tsx      #   client-side screen state machine (the whole game is one page)
│   ├── api/live-token/   #   POST: mints ephemeral Gemini token (delegates to voice feature)
│   └── globals.css       #   all styling (class-based, mobile-first)
├── features/             # One folder per feature. THE code lives here.
│   ├── tricks/           # Trick catalog data + TrickPicker + CustomSetup
│   ├── robots/           # Opponent roster, skill model (buildBag) + RobotSelect/Avatar
│   ├── game/             # S.K.A.T.E. rules engine (pure reducer) + on-screen GameScreen
│   ├── voice/            # Voice mode: Gemini Live session, tools, audio; server/ = token mint
│   ├── records/          # Player W/L + game log (localStorage today, D1 candidate)
│   ├── home/             # Landing screen / mode choice
│   └── dice/             # Standalone random-trick roller
└── shared/               # Cross-feature infrastructure (db.ts = future D1 access)
```

### Rules (keep these invariants)

1. **Import features only through their barrel** (`@/features/<name>`), never deep
   paths. Each feature's `index.ts` is its public API and documents what the feature
   is. Within a feature, use relative imports. The one sanctioned exception:
   `src/app/api/*` routes import `@/features/<name>/server/*` directly — server-only
   code is deliberately kept out of client barrels.
2. **`src/app/` stays thin.** Routes render feature components and wire HTTP to
   feature server functions. New domain logic goes in a feature, not in `app/`.
3. **The game engine is the single source of truth for rules.**
   `features/game/engine.ts` is a pure reducer; both the on-screen mode and the
   voice mode dispatch into it. Never duplicate rule logic elsewhere (the voice
   model narrates tool results, it does not track state — see docs/VOICE_MODE_PLAN.md).
4. **Dependency direction:** `home`/`dice`/`game`/`voice` (screens) may depend on
   `tricks`/`robots`/`records` (domain data); domain features don't import screens.
   `voice` also wraps `game`. Nothing imports from `src/app/`.
5. **Server vs client:** files under `features/*/server/` are server-only.
   Everything else in features is client-safe (most components are `'use client'`).
   Secrets only in server code.

### Adding things

- **New feature:** `src/features/<name>/` with an `index.ts` barrel carrying a short
  doc comment. Add a row to the tree above.
- **New screen in the existing flow:** add a variant to `Screen` in
  `src/app/AppShell.tsx`. Screens are in-memory state by design (trick pools aren't
  URL-serializable); if a screen must be linkable, split it into a real route instead.
- **New API endpoint:** thin route under `src/app/api/`, logic in
  `features/<name>/server/`.
- **Backend work (D1):** uncomment `d1_databases` in `wrangler.jsonc`, follow the
  steps in `src/shared/db.ts`, put SQL migrations in `migrations/`. Start by porting
  `features/records` (its localStorage shape is the intended schema seed).

## Gotchas

- The Live model id is pinned in `features/voice/live-model.ts` and shared by the
  browser session and the server token mint — they must match or tokens are rejected
  (model rationale: docs/VOICE_MODE_PLAN.md §2).
- `NEXT_PUBLIC_GEMINI_API_KEY` is a dev-only fallback that ships to the browser;
  production auth is the ephemeral-token route.
- Robot "skill" is emergent: `robots.ts#robotConsistency` (skill vs difficulty,
  favorites, stance multipliers, deterministic jitter). Tune numbers there, not in
  the engine.
- After `next build`/`next dev`, Next may rewrite `tsconfig.json` includes — that's
  expected, don't fight it.
