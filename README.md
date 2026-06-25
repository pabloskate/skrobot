# Skate Robot

Play S.K.A.T.E. against a robot. You skate for real — the robot rolls the dice.
Includes a hands-free **voice mode** (Gemini Live) so you can play a whole game
through earbuds with the phone in your pocket.
The routed game flow is currently flatground-only.

Next.js App Router web app deployed to **Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare)**. The Expo companion app in
`apps/mobile` is a native WebView shell that loads the same web app for parity.

## Develop

```sh
npm install
cp .env.example .env.local   # add keys (see comments inside)
npm run dev                  # http://localhost:3000
```

Voice mode needs a Gemini key: either `GEMINI_API_KEY` (server-side, used by the
`/api/live-token` mint — preferred) or `NEXT_PUBLIC_GEMINI_API_KEY` (dev-only
browser fallback).

## Ship

```sh
npm run preview   # run the real Cloudflare worker locally (needs .dev.vars)
npm run deploy    # build + deploy to Cloudflare
npx wrangler secret put GEMINI_API_KEY   # one-time production secret
```

## Architecture

Feature-first web app: routes in `src/app/` are thin shells, and product code
lives in `src/features/<name>/` behind an `index.ts` barrel. **See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the dependency map and complexity
guardrails, [docs/FEATURE_OWNERSHIP.md](docs/FEATURE_OWNERSHIP.md) for ownership,
and [AGENTS.md](AGENTS.md) for contributor instructions.**
Voice-mode design rationale: [docs/VOICE_MODE_PLAN.md](docs/VOICE_MODE_PLAN.md).

```sh
npm run check   # lint boundaries, tests, package typechecks, production build
```
