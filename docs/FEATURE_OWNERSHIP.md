# Feature Ownership

This registry answers: "Where does this behavior belong?" Keep it short and
update it when a feature, route, data source, or ownership boundary changes.

| Area | Kind | Owns | Public surface | Routes / APIs | Data and I/O | Verification |
|---|---|---|---|---|---|---|
| `apps/mobile` | Expo app | Native parity shell for the web app | `apps/mobile/App.tsx`, `apps/mobile/linking.ts` | native deep links only | WebView loads the same web app; no direct game/domain imports | `npm run typecheck:mobile`, native parity checklist |
| `skrobot-animations` | standalone playground | Animation iteration for robot/avatar/trick visuals | package-local exports and demo | Vite dev server only | Cloned UI animation code; manual sync to web app | `npm run typecheck:animations` |
| `app` | route shell | URLs, layout, one-page screen state | `src/app/*` | `/`, `/api/*` | Delegates to features and platform | `npm run lint` |
| `auth` | full-stack feature | Magic-link sign-in, client auth state, sessions, voice quota | `@/features/auth`, `features/auth/api.ts`, `features/auth/server/*` | `/api/auth/*`, `/api/me` | D1 via platform, Cloudflare Email via platform env | `npm run lint`, auth route smoke test |
| `billing` | server-backed feature | Beta quota screen and dormant Stripe billing | `@/features/billing`, `features/billing/server/*` | `/api/billing/*` | Stripe API, D1 via platform | `npm run build`, billing enablement checklist |
| `tricks` | web domain feature | Trick picker/setup UI, catalog helpers, metadata, difficulty, default routed trick pool; routed games currently use flatground only | `@/features/tricks` | none | Static catalog | `npm test` when resolver/metadata changes |
| `robots` | web domain feature | Avatar/profile/select UI, roster, skill model; routed home roster currently exposes flatground robots only | `@/features/robots` | none | Static roster, records read | `npm test` for bag/consistency behavior |
| `game` | gameplay feature | On-screen game UI, reducer, RPS | `@/features/game` | none | Records writes through records feature | `npm test` |
| `voice` | integration feature | Gemini Live browser session, tools, audio, voice UI, prompt/resolver helpers, token mint helper | `@/features/voice`, `features/voice/api.ts`, `features/voice/server/*` | `/api/live-token` | Gemini Live API, auth/quota route | `npm test`, voice manual smoke test |
| `records` | client persistence feature | W/L records and capped game log | `@/features/records` | none today | localStorage; D1 candidate | `npm test` when ported |
| `home` | UI composition feature | Landing screen, recent games, flatground robot entry points | `@/features/home` | `/` through AppShell | Reads records and robots | `npm run lint` |
| `dice` | UI utility feature | Standalone random-trick roller | `@/features/dice` | not currently routed | Static trick catalog | `npm run lint` |
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
