# Voice Mode Plan — hands-free S.K.A.T.E. over live audio

Goal: a full game of S.K.A.T.E. playable entirely by voice — RPS toss, setting tricks,
reporting lands/misses, robot turns narrated aloud, scores logged — so you can keep the
phone in your pocket and play through AirPods between actual skate attempts.

> **Note (2026-06-11):** paths in this doc predate the feature-first restructure —
> game engine: `src/features/game/`, voice code: `src/features/voice/`, token mint:
> `src/features/voice/server/live-token.ts` behind `src/app/api/live-token/route.ts`.

## 1. Core architecture principle

**The reducer stays the source of truth. The LLM is only the interface.**

`src/features/game/engine.ts` (formerly `src/game/engine.ts`) already models the entire game as a pure reducer. Voice mode wraps it
in a `VoiceGameController` and exposes a small set of *tools* (function calls) to the live
model. The model never tracks letters, used tricks, or phase itself — every tool response
returns the authoritative state, and the model just narrates it with personality. This
prevents hallucinated scores, keeps game logic testable, and (critically, see §5) makes
the voice session disposable: any reconnect can rebuild the model's context from a state
snapshot.

## 2. Provider choice

**Recommended: Gemini Live API** (`@google/genai` SDK, WebSocket from the browser).

Models (verified against docs, June 2026):

- **`gemini-3.1-flash-live-preview` — primary choice.** Google's latest voice-first Live
  model (announced with Gemini 3.1): improved precision and lower latency, strong
  function calling (90.8% on ComplexFuncBench Audio), explicitly built to "handle complex
  tasks in noisy environments", tonal/emotion understanding, multilingual, ~2x longer
  conversation retention vs 2.5 native audio. Limitation: **sequential function calling
  only** (no async `NON_BLOCKING` tools) — irrelevant for us, since our tools are fast
  synchronous reducer dispatches in a turn-based game.
- **`gemini-2.5-flash-native-audio-preview-12-2025` — fallback.** Previous-gen native
  audio; supports async function calling (`behavior: NON_BLOCKING`) if we ever need it.
- **`gemini-2.5-flash-live-preview`** — half-cascade (audio in, text→TTS out); second
  fallback if native-audio tool calls misbehave.
- Note: the older `gemini-live-2.5-flash-preview-native-audio-09-2025` was removed
  March 19, 2026 — don't reference it.

Capabilities (confirmed in current docs):
- Function calling in live sessions; input + output **transcription events** (free
  captions for the on-screen UI).
- **Proactive audio**: `proactivity: { proactive_audio: true }` (v1alpha) — the model can
  decide *not* to respond when audio isn't relevant. Exactly what a skatepark needs;
  verify it's supported on 3.1 Flash Live, else weigh against the fallback model.
- Built-in VAD with tunable config + barge-in (user can interrupt the robot).
- Audio I/O: input 16-bit PCM **16 kHz** mono little-endian; output **24 kHz** PCM.
- Context window: 128k tokens on native audio models.

Alternatives considered:
- **OpenAI Realtime API** — equivalent capability, WebRTC-first, generally pricier. Keep
  the controller/tools layer provider-agnostic so swapping is a transport change.
- **Web Speech API + TTS** — free and on-device, but poor trick-name recognition, robotic
  voice, no conversational repair ("wait, did you mean nollie or fakie?"). Could become a
  degraded offline "lite mode" later; not the v1.

### Auth: ephemeral tokens (small backend required)

The app is currently a static Vite site with no backend. Shipping a Gemini API key in
client JS is not acceptable, so add one tiny endpoint:

- `POST /api/live-token` → mints an **ephemeral token** (`client.authTokens.create`,
  v1alpha) constrained to: the live model, 1 connection, ~1 min new-session window,
  ~30 min lifetime. Host as a Vercel/Netlify function or Cloudflare Worker.
- Dev mode: `VITE_GEMINI_API_KEY` used directly from the client, behind an obvious
  "dev only" flag.
- Later (if abuse appears): rate-limit by IP, or gate behind a lightweight login.

## 3. Tool surface

Design rule: **each player report auto-advances every robot phase inside the tool call**
and returns the complete outcome. The voice model should never need to remember to call
"continue" — the dramatic robot delays from `GameScreen` (setTimeout theatrics) are
replaced by the model's own narration pacing.

```ts
// Tool declarations given to the live session
throw_rps({ choice: 'rock' | 'paper' | 'scissors' })
  // → { yours, theirs, outcome: 'win'|'lose'|'tie', setsFirst? }  (ties: model asks again)

report_set_attempt({ landed: boolean, trick?: string })
  // landed=false → PLAYER_SET_MISSED, robot takes over: rolls its own set, returns it
  // landed=true  → resolve trick name (see §4). On ambiguity returns
  //                { needsClarification: ['Kickflip','Nollie Kickflip'] } for the model
  //                to ask about. On success: dispatch PLAYER_SET_LANDED, immediately
  //                roll the robot's copy attempt(s), return
  //                { robotLanded, robotKnewIt, letters, nextExpected, ... }

report_copy_attempt({ landed: boolean })
  // → PLAYER_COPY_LANDED / PLAYER_COPY_MISSED; if robot keeps setting, roll its next
  //   set in the same response: { letters, attemptsLeft, robotSet?, winner?, ... }

get_game_state()
  // → full snapshot: letters both sides, used tricks, phase, current trick, attempts left.
  //   Used for "what's the score?", and by the system on reconnect.

list_remaining_tricks({ category? })
  // → pool minus used, for "what hasn't been done yet?"

undo_last_report()
  // → restores the state snapshot taken before the previous dispatch. Voice input gets
  //   misheard; a one-step undo ("wait, I said LANDED it") is essential.

rematch() / end_session()
```

Every response includes a compact `say`-ready summary plus `nextExpected:
'rps' | 'playerSet' | 'playerCopy' | 'over'` so the model always knows what to prompt for.

`VoiceGameController` responsibilities:
- Holds `gameReducer` state + the robot's `bag` (reuse `buildBag`, `chooseRobotTrick`,
  `rollAttempt` as-is).
- RPS logic — extract from `GameScreen.tsx`'s `RpsPanel` into `src/game/rps.ts` so both
  screens share it.
- Keeps a pre-dispatch snapshot for `undo_last_report`.
- Calls `recordResult(robotId, won)` exactly once when a winner is set (same as today).

## 4. Trick name resolution (the ASR problem)

AirPods outdoors + wind + skate noise means "fakie bigspin" will arrive mangled. Plan:

- `src/voice/trickResolver.ts`: normalize → alias table → fuzzy match against the active
  pool minus used tricks.
- Alias table for skate vocabulary the ASR won't produce verbatim:
  `"tre flip"/"tre"/"three flip" → 360 Flip`, `"shove it"/"shuv" → Pop Shuvit`,
  `"front 180"/"frontside one eighty" → Frontside 180`, `"fifty fifty" → 50-50 Grind`,
  `"five o" → 5-0 Grind`, `"crooks" → Crooked Grind`, `"noseblunt" → Noseblunt Slide`, etc.
- Stance prefixes parsed separately (fakie/switch/nollie + base).
- Confidence tiers: exact/alias hit → accept; single fuzzy candidate → accept but echo it
  back ("Kickflip, nice"); multiple candidates → tool returns them and the model asks.
- Also pass the **full trick list of the active pool into the system prompt** so the
  model itself biases its hearing toward valid names before the tool even runs.

## 5. The pocket problem: long idle gaps, locked screens, sessions

A real game has 1–5 minute gaps while the player attempts a trick. Three sub-problems:

**(a) Session lifetime.** Audio-only sessions cap at **15 minutes** by default (confirmed
in current docs), but session-management features allow "unlimited extensions": enable
**context window compression** + **session resumption** handles, and reconnect
transparently on `GoAway`/drops. Because state lives in the controller (§1), worst case
we open a *fresh* session whose system prompt embeds the `get_game_state()` snapshot —
the game never resets.

**(b) Skatepark noise / open mic.** The mic stays open during skating so the player can
resume by voice. Mitigations:
- VAD tuning via `realtimeInputConfig.automaticActivityDetection`:
  `startOfSpeechSensitivity` (lower it), `endOfSpeechSensitivity`,
  `prefixPaddingMs` (≥20ms), `silenceDurationMs` (500–800ms recommended so natural
  pauses don't cut speech off).
- `proactivity: { proactive_audio: true }` (v1alpha) — model can choose not to reply
  to ambient chatter. 3.1 Flash Live is also explicitly tuned for noisy environments.
- System prompt: "Between attempts, stay silent. Only respond when directly addressed or
  when the player reports a result."
- Cost of idle listening is acceptable: audio ≈ 25 tokens/s ⇒ a 30-min game streams
  ~45k input tokens. At the last-known native-audio rates (~$3/M in, ~$12/M out) a full
  game is well under $0.50. (Re-verify pricing.)

**(c) iOS lock screen — the honest caveat.** Mobile Safari suspends pages and pauses
`getUserMedia` capture when the screen locks or Safari is backgrounded, even in a PWA.
True locked-phone-in-pocket play is **not reliably possible as a pure web app on iOS**.

- **v1 (web): "Pocket Mode"** — acquire a **Wake Lock** (screen stays on), render a
  dim, touch-locked, OLED-black overlay (giant letters + captions only), and tell the
  user to pocket the phone screen-on. Battery cost is modest with a black screen.
- **v2 (if voice mode proves out): Capacitor wrapper** — native audio session with
  background mode gives real lock-screen operation, plus AirPods stem-click hooks via
  the Media Session API. Don't build this until the web version validates the gameplay.

## 6. UX flow

1. Player picks mode + robot on screen as today (RobotSelect), then taps **🎙 Voice Game**
   (also offered on the robot card). Robot selection by voice is a later nicety.
2. Mic permission → session connects → robot greets in character and asks for the RPS
   throw. ("I'm Tre. Rock, paper, scissors — call it.")
3. Whole game proceeds by voice: toss → sets → copies → letters → winner. Letters are
   always spoken explicitly ("That's S-K-A on you, S on me").
4. Earcons (short non-speech sounds) for letter-taken / game-over — cuts through wind
   better than speech and gives confirmation without listening to a sentence.
5. Game over → `recordResult` persists W/L (existing localStorage) → model offers
   rematch by voice.
6. Screen UI during the session (`VoiceGameScreen`): scoreboard letters, live captions
   (from transcription events), mic/mute state, end button, Pocket Mode toggle.

**Robot personality** is the payoff of voice: the system prompt embeds the robot's name,
tier, tagline, and favorites ("Smitty — smith grind royalty, cocky about grinds, gracious
in defeat"). Trash talk on letters, respect on bangers. One template, per-robot fields.

## 7. Score logging

- Keep `recordResult` (W/L per robot) untouched — voice controller calls it.
- Add `appendGameLog` in `records.ts`: `{ date, robotId, mode: 'voice' | 'screen',
  won, playerLetters, robotLetters, tricksLanded: string[] }` to a capped localStorage
  array (e.g. last 200 games). Enables "what's my record against Drone?" via a
  `get_records()` tool, and a future history screen.

## 8. File plan

```
src/voice/
  liveSession.ts     — connect/auth, send/receive loop, resumption, GoAway handling
  audio.ts           — AudioWorklet mic capture (→16kHz PCM), playback queue (24kHz),
                       earcons
  controller.ts      — VoiceGameController: reducer + bag + RPS + undo + recordResult
  tools.ts           — function declarations + dispatch into controller
  trickResolver.ts   — aliases + fuzzy matching + clarification candidates
  prompts.ts         — system instruction builder (robot persona, rules, pool,
                       state snapshot for reconnects)
src/game/rps.ts      — RPS logic extracted from GameScreen
src/components/VoiceGameScreen.tsx  — captions, letters, mute, Pocket Mode
api/live-token.ts    — serverless ephemeral-token mint (deploy target TBD)
src/records.ts       — add game-history log
```

## 9. Build order

**Phase 1 — Audio + session spike (validate the scary part first)**
Mic worklet → Live API → audio out, in-browser, dev API key. No game. Prove: latency,
barge-in, AirPods routing, one function call round-trip. Test outdoors with AirPods.

**Phase 2 — Game bridge**
Controller + tools + trick resolver + prompts. Full game playable by voice with the
screen open. Captions on screen. Unit-test the controller and resolver hard (they're
pure TS — cheap to test).

**Phase 3 — Pocket hardening**
Wake Lock + Pocket Mode overlay, session resumption + reconnect-from-snapshot, VAD
tuning, idle-timeout auto-end (~20 min silence), earcons, undo flow.

**Phase 4 — Ship & polish**
Token endpoint deployed, per-robot personas, game history log + `get_records` tool,
voice pick (Live API offers multiple voices — could map per robot tier), settings.

**Phase 5 (contingent) — Capacitor wrapper** for true lock-screen play, if usage shows
people actually want it.

## 10. Open items (most verified against docs, June 2026)

- [x] Model: `gemini-3.1-flash-live-preview` (sequential tool calls only — fine for us);
      fallbacks `gemini-2.5-flash-native-audio-preview-12-2025`,
      `gemini-2.5-flash-live-preview`.
- [x] Ephemeral tokens: confirmed as the required auth for client-to-server Live apps.
- [x] Session limits: 15 min audio-only default; extendable via compression + resumption.
- [x] VAD config shape: `realtimeInputConfig.automaticActivityDetection` with
      start/end sensitivity, `prefixPaddingMs`, `silenceDurationMs`.
- [ ] Confirm proactive audio (`proactivity.proactive_audio`, v1alpha) works on
      3.1 Flash Live specifically.
- [ ] Current audio pricing for 3.1 Flash Live (preview) → refresh cost-per-game estimate.
- [ ] iOS Safari current behavior for backgrounded mic capture (revisit each iOS release).
