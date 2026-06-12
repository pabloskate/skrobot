# Skate Robot 🛹🤖

Play S.K.A.T.E. against a robot. You skate for real — the robot rolls the dice.
Includes a hands-free **voice mode** (Gemini Live) so you can play a whole game
through earbuds with the phone in your pocket.

Next.js App Router app deployed to **Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare)**.

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

Feature-first modular monolith — routes in `src/app/` are thin shells; all domain
code lives in `src/features/<name>/` behind an `index.ts` barrel. **See
[CLAUDE.md](CLAUDE.md) for the full map, conventions, and the D1 backend roadmap.**
Voice-mode design rationale: [docs/VOICE_MODE_PLAN.md](docs/VOICE_MODE_PLAN.md).
