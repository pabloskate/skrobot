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
npm run dev                  # http://127.0.0.1:3000 locally; Mac mini uses Tailscale
```

On a laptop, open `http://127.0.0.1:3000`. The Mac mini is a server; connect your
viewing device to the same Tailscale
network and open the printed Tailscale URL. `localhost` on your laptop or phone
refers to that device, not the Mac mini.

For a separate prototype/worktree, choose a free port:

```sh
npm run dev -- --port 3107    # http://100.74.88.58:3107/dream-tricks
```

The web `dev`, `start`, and Cloudflare `preview` commands and the animation
playground's `dev`/`preview` commands use `scripts/preview-host.mjs`: bind to
`100.74.88.58` when that address belongs to the current machine, otherwise
`127.0.0.1`. Override it in the shell with `SKROBOT_PREVIEW_HOST`, for example
`SKROBOT_PREVIEW_HOST=0.0.0.0 npm run dev` to access a laptop from another device.
Keep a delivered prototype server running while it is being reviewed.

Voice mode uses `GEMINI_API_KEY` server-side to mint an ephemeral token through
`/api/live-token`; long-lived API keys are never read by client code.

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
