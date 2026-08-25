# Feature Ownership

This registry answers: "Where does this behavior belong?" Keep it short and
update it when a feature, route, data source, or ownership boundary changes.

| Area | Kind | Owns | Public surface | Routes / APIs | Data and I/O | Verification |
|---|---|---|---|---|---|---|
| `apps/mobile` | Expo app | Native parity shell for the web app | `apps/mobile/App.tsx`, `apps/mobile/linking.ts` | native deep links only | WebView loads the same web app; no direct game/domain imports | `npm run typecheck:mobile`, native parity checklist |
| `packages/animations` | workspace package | Shared robot/avatar/trick animation components, animation timing/physics, and browser feedback helpers | `@skrobot/animations` | none | Structural `Robot`/`Trick` inputs from feature-owned data | `npm run typecheck:animations` |
| `skrobot-animations` | standalone playground | Animation iteration controls, local fixture data, and Vite preview shell | package-local demo plus `@skrobot/animations` re-exports | Vite dev server only | Imports shared animation source; no production behavior clone | `npm run typecheck:animations` |
| `app` | route shell | URLs, layout, one-page screen state | `src/app/*` | `/`, `/api/*` | Delegates to features and platform | `npm run lint` |
| `auth` | full-stack feature | Magic-link sign-in, client auth state, sessions, voice quota | `@/features/auth`, `features/auth/api.ts`, `features/auth/server/*` | `/api/auth/*`, `/api/me` | D1 via platform, Cloudflare Email via platform env | `npm run lint`, auth route smoke test |
| `billing` | server-backed feature | Beta quota screen and dormant Stripe billing | `@/features/billing`, `features/billing/server/*` | `/api/billing/*` | Stripe API, D1 via platform | `npm run build`, billing enablement checklist |
| `analytics` | full-stack feature | Gameplay event semantics, strict privacy-safe contracts, offline delivery, deduplicated ingestion, aggregate queries, and owner dashboard | `@/features/analytics`, `features/analytics/server/*` | `/admin/analytics`, `/api/analytics`, `/api/analytics/summary` | localStorage delivery queue, D1 event table | `npm test`, `npm run lint` |
| `tricks` | web domain feature | Trick picker UI, catalog helpers, metadata, difficulty, default routed trick pool; routed games currently use flatground only | `@/features/tricks` | none | Static catalog | `npm test` when resolver/metadata changes |
| `gallery` | web UI feature | Tricks screen with three tabs — Learning (starred queue + suggestions), Tricks (catalog with search, stance lens, bag chips), and Stats (skate score + ladder, per-trick consistency, record vs robots) — plus curated video tips and the player trick book (proven/learning state) | `@/features/gallery` | none | Static tip catalog (empty until videos are curated); trick marks + game log via records; skate score via skater | `npm test` for trick book derivation, `npm run lint` |
| `robots` | web domain feature | Avatar/profile/select/tuning UI, roster metadata, explicit per-trick land rates and set weights; routed home roster currently exposes flatground robots only | `@/features/robots` | `/tune` | Static roster and behavior tables, browser-local tuning overrides, records read | `npm test` for explicit behavior lookup/validation |
| `game` | gameplay feature | On-screen game UI, reducer, RPS | `@/features/game` | none | Records writes through records feature | `npm test` |
| `voice` | integration feature | Gemini Live browser session, tools, audio, voice UI, prompt/resolver helpers, token mint helper | `@/features/voice`, `features/voice/api.ts`, `features/voice/server/*` | `/api/live-token` | Gemini Live API, auth/quota route | `npm test`, voice manual smoke test |
| `records` | client persistence feature | W/L records, versioned stable-ID game log, player trick marks, proven-trick derivation, per-trick attempt stats, reactive snapshot | `@/features/records` | none today | localStorage; D1 candidate | `npm test` |
| `skater` | web domain feature | Player model: skate score (8-game unlock, robot-equivalent curve fit with frontier fallback), robot-ladder placement, adaptive rival robot factory (`rival` id), rival-aware robot resolution for saved games | `@/features/skater` | none | Derived from records game log; no persistence of its own | `npm test` |
| `home` | UI composition feature | Landing screen, recent games, flatground robot entry points | `@/features/home` | `/` through AppShell | Reads records and robots | `npm run lint` |
| `install` | web UI feature | Platform-aware App Store handoff and Android PWA install instructions | `@/features/install` | Home banner through AppShell | Browser identity, display mode, `beforeinstallprompt`; hidden in WebViews/native shell | `npm test`, `npm run lint` |
| `platform/server` | runtime platform | Cloudflare env, D1 binding access, future logging/HTTP adapters | `@/platform/server/*` | none | Runtime bindings and secrets | `npm run build` |

## Ownership Rules

- If a workflow belongs mostly to one product area, put orchestration in that
  feature.
- If a workflow spans features with no clear owner, add a small orchestration
  feature and document it here before wiring routes or UI to it.
- Runtime concerns with no product meaning belong in `src/platform/`, not
  `src/shared/`.
- `src/shared/` is reserved for primitive, domain-neutral code. If a helper uses
  skate, robot, billing, voice, or auth words, it belongs to a feature.
- Browser route calls live in feature-owned API files such as
  `features/auth/api.ts` and `features/voice/api.ts`, not leaf UI components.
- Product rules and static domain data live in their owning feature folders.
- Standalone packages must state whether they are synced from web app code or are
  intentionally isolated.
