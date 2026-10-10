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
| On-screen gameplay | `src/features/game/` | Web UI may call reducer, robot model, trick catalog, and records. `TrickAnimation.tsx` loads the shared three.js renderer for waterfront attempts, including the pick reel, replay, and slow motion. |
| Robot set presentation | `src/features/game/RobotSetTurn.tsx` | Owns one set turn; `pickTimeline.ts` plans the reel and `PickReel.tsx` renders it. Eligible tricks and weighted selection stay in `engine.ts`. |
| Voice gameplay | `src/features/voice/` | Web Live API client code plus resolver/prompts. |
| Voice token mint | `src/features/voice/server/` | Server-only; imported directly only by `src/app/api/live-token`. |
| Auth/session/quota | `src/features/auth/` | Client auth state in the barrel; server code under `server/`. |
| Billing | `src/features/billing/` | Beta quota UI plus dormant Stripe server helpers. |
| Tricks | `src/features/tricks/` | Catalog, difficulty, metadata, picker UI, and the default routed trick pool. Routed games currently use flatground only. |
| Trick Explorer | `src/features/explorer/` | Customer-facing animation playground at `/explore`: flatground tricks and grind combos on the three.js stage, scrubbable playback, camera angles, a choice of spot (including El Toro's 20 stair: flatground tricks go down it, grinds down its center handrail or the side rail the trick comes in toward, filmed by the crane or from tripods at the bottom, side, and top; and Hollywood 16, where a flatground trick goes down the stairs or, picked under Obstacle, over the fence beside them at an angle; Lyon 25 and the classic Point Loma Leap of Faith are gap-only landmarks; at the Miami Triangle a flatground trick goes off the terrace tip onto the granite triangle or, picked under Obstacle, over it, and a grind goes across the gap and down whichever of the slab's edges the trick comes in toward) and of skater (robot, realistic human, or the alien), and shareable links. Also Dream Tricks at `/dream-tricks`: the same stage and URL state for players — the landmark spots only, what to hit there (stairs, rail, fence, the triangle), stance right above the trick list, looping playback with slow-mo, and filmer-position shots instead of the scrubber, zoom, and step-by-step. |
| Gallery | `src/features/gallery/` | Flatground trick gallery plus the player trick book: browse the catalog with stance filters, curated video tips, personal proven/learning state, and per-trick consistency stats. A trick without a video tip plays on the three.js stage, loaded on demand. |
| Robots | `src/features/robots/` | Roster metadata, explicit per-trick land-rate/set-weight tables, profile/select/avatar UI, and the browser-local editor routed at `/tune`. Routed home currently exposes flatground robots only. |
| Player skill / adaptive rival | `src/features/skater/` | Skate score (player-only curve fit + frontier fallback), robot-ladder placement, and a generated rival that copies the closest roster behavior table. All derived from the game log; nothing persisted. |
| Records | `src/features/records/` | LocalStorage W/L, game log, trick marks, and per-trick attempt stats until the D1 port. |
| Product analytics | `src/features/analytics/` | Strict gameplay event contracts, anonymous installation identity, offline delivery, D1 ingestion, and the owner-only aggregate dashboard at `/admin/analytics`. |
| Web/native install handoff | `src/features/install/` | App Store handoff, Android PWA instructions, and browser/WebView detection. |
| Runtime infrastructure | `src/platform/server/` | Cloudflare env and bindings, D1, future logging/HTTP adapters. |
| Shared primitives | `src/shared/` | Reserved for domain-neutral primitives only, such as online status. |
| Expo companion app | `apps/mobile/` | Native WebView shell that loads the same web app; no alternate game implementation. |
| Shared animations | `packages/animations/` | Trick motion, the stage, its sets and riders, and the three.js renderer, plus the small SVG avatar/push-off components and browser feedback helpers. The renderer is a separate entry, `@skrobot/animations/three`, so three.js ships only to pages that show a trick; filming a trick to MP4 (with a WebM fallback) is another, `@skrobot/animations/three/video`, so the encoder loads only when someone downloads a video. Map: the Animation Source Map below. |
| Animation playground | `skrobot-animations/` | Standalone Vite playground: a robot and skate-style tuner on the 3D stage, a Contact sheet of every trick's key frames, and the Blender prototype. Consumes `@skrobot/animations` and owns only preview controls/fixtures. |
| Frozen design references | `prototype/` | Static artifacts with no build step; see its README for the maintained product sources. |

## Animation Source Map

Consumers use `@skrobot/animations` (root: motion data, sets and skaters,
cameras, small SVG components), `@skrobot/animations/three` (`TrickScene3D`),
and `@skrobot/animations/three/video` (`recordTrickVideo`, `renderTrickPreview`, and the `RenderQuality` type). Everything else is
private to the package; the import graph test checks alias and relative
imports, and that the root entry never loads three.js.

One folder per concept under `packages/animations/src/`:

| Folder | What lives there |
|---|---|
| `motion/` | The trick's motion, with no drawing: `trick.ts` (`TRICK_MOTIONS` table and `specFor`: what each flatground trick does; `computeFrame`: the board, feet, and spins at clock time t; phase timing), `rig.ts` (the rider's 3D body solved on that: ballistic hips, fixed-length legs, landing spring) on `skeleton.ts`'s dimensions and frames, `boardClearance.ts`, `stance.ts` (regular/goofy and trick stance), `style.ts` (per-robot skate style), and grinds: `grindDefinitions.ts` (names, lock poses, contact, which ends a trick out can pop off), `grindTricks.ts` (tricks popped into and out of a grind), `grind.ts` (timeline and board path, flat bar or handrail), `grindRig.ts` (rider on the bar) |
| `stage/` | One attempt put in the world, frame by frame: `stage.ts` (`planStage`, `stageFrame`; flat ground and the flat bar), `downhill.ts` (down a stair set and its handrail), `frameParts.ts` (shadows, dust, faces, keeping the board out of the ground), `gaze.ts` (where the rider looks: the obstacle rolling in, the board from the setup to touchdown, down the rail while grinding, then ahead). Reads motion, never changes it |
| `camera/` | `camera.ts`: the crane (`SceneCamera`, bounds, lift with the pop, zoom), the sun, and the palette. `view.ts`: the crane as a three.js camera, physics ↔ three coordinates, tripod framing |
| `sets/` | The spots (UI: "Spot"; code: "set"). `sets.ts` registers labels, spot-specific terrain (and, where there's a choice, other obstacles to go over), supported tricks, handrails, panoramas and tripods. `setKit.ts` shared helpers, `classicSpot3d.ts` shared weathered surfaces, shadows and cameras; `props/` realistic street props loaded after a set is drawn (Poly Haven's CC0 jacaranda rebuilt for phones, Blender-modelled cars, parked or driving on the attempt's clock; Hollywood uses them); `bar.ts`/`bar3d.ts` the flat bar, `plaza3d.ts`, `waterfront/`, `elToro/`, `hollywood/`, `wallenberg/`, `sunset/`, `lyon/`, `leapOfFaith/`, `miami/`. Each landmark owns its layout and scenery. The drop planner in `elToro/stairs.ts` accepts terrain, optional side-entry routes (or a held angled line, with a carve back downhill after it), a least pop for drops with something to clear, and a roll-in run-up (`dropIn`: Wallenberg's rider drops in from a ramp's deck and gains the gap's speed under gravity); `stage/bank.ts` turns the whole trick into its route and aligns rider and board to sloped landings, and a bank's roll-out can roll off a raised edge and drop (Miami's slab). Grinds ride a `Handrail` in its own frame: a set's handrails run down its stairs, while Miami's slab edges are ledges at an angle across the set (`SetInfo.ledges`), reached across a gap from a fixed takeoff, and their locks rest on the granite behind the edge. References: [El Toro](EL_TORO_REFERENCE.md), [Hollywood 16](HOLLYWOOD_REFERENCE.md), [Wallenberg](WALLENBERG_REFERENCE.md), [Sunset Car Wash](SUNSET_REFERENCE.md), [Lyon 25](LYON_REFERENCE.md), [Leap of Faith](LEAP_OF_FAITH_REFERENCE.md), [Miami Triangle](MIAMI_TRIANGLE_REFERENCE.md). |
| `riders/` | Who rides. `skaters.ts` is the registry. `look.ts` (robot colors, expressions), `placement.ts` (posing meshes from rig frames), `shoe3d.ts`, `robot/`, `human/` (`humanRig.ts` and `humanProportions.ts`: a person's proportions on the robot's rig, which the realistic human wears), `realistic/` (a skinned MakeHuman adult, CC0: `skaterPose.ts` solves its full skeleton from the rig — feet on the rig's soles, spine and neck bending, knees over the feet, arm follow-through, hands (kept out of the jeans, whose girth `restSkeleton` measures off the outfit), head and eyes following the stage's gaze, eyelids — `deltaMush.ts` keeps the clothes from pinching where the skinning bends them, `teeDrape.ts` keeps the tee outside the legs (a raised thigh lifts it rather than coming through it), `realisticMaterials.ts` lights skin, cloth, and knit with the body's own sun shadow; `blender/build_skater.py` builds `assets/`, re-cutting MakeHuman's tight outfit into relaxed jeans and a boxy tee; `build_skater.py … alien` makes the green alien from the same body, tee, jeans and shoes — MakeHuman head targets, a bare domed head, warped almond eyes that ride the head, three long fingers and a thumb — which `RealisticHuman3D('alien')` shades green) |
| `board/` | The skateboard: `deck.ts` (shape), `board.ts` (wheels, trucks, roll), `boardDimensions.ts`, `boardCollision.ts`, `footContact.ts`, and its two meshes (`board3d.ts` cartoon, `realisticBoard3d.ts` for the realistic human and the alien) |
| `three/` | The renderer and the public 3D entries: `TrickScene3D.tsx` (+ `.css`, `useTrickPlayback.ts`), `renderer.ts` (passes, and which set/rider/board meshes each set and skater gets), `rendererPool.ts` (renderers reused across remounts), `depth.ts` (floating reversed depth, camera-aware forward fallback, and shared depth decoding), `screenPass.ts` (owned post cameras), `post.ts` (outline, blur, FXAA passes), `materials.ts`, `geometry.ts`, `bake.ts`, `cinematic.ts` (export-only smooth shell lighting, clearcoat and depth contact shading), `video.ts` (MP4: mediabunny + WebCodecs, original/cinematic finish and paired still previews), `canvasRecording.ts` (MediaRecorder fallback, MP4 or WebM) |
| `sound/` | `soundtrack.ts` (when each sound plays and how fast the wheels roll, from the stage plan), `skateSounds.ts` (Web Audio synthesis and the recorded loops in `public/sounds/skate/`; the wheels' loop runs quicker and louder with the spot's speed), `preferences.ts` (sound effects opt-in, off by default), `useTrickSound.ts`, and `audio.ts` (the page's one AudioContext, shared with `rpsFeedback.ts`). The game and explorer honor the preference; voice mode keeps effects off under the open mic. `roll.mp3` is the project's own close recording of a board rolling (take #1 of two); `grind.mp3` is C-V's "Skateboarding Rail Slide" on Freesound (CC0, freesound.org/s/845524) |
| `ui/` | Small SVG components for the game's screens: `RobotAvatar.tsx`, `PushOffAnimation.tsx`, `robotColors.ts` |

Where to make common changes:

| Change | Where |
|---|---|
| A new flatground trick, or how one moves | a row in `TRICK_MOTIONS` (`motion/trick.ts`); every motion sweep test picks it up, and `explorer.test.ts` fails if a catalog trick has no row |
| A new grind or slide | `GRINDS` in `motion/grindDefinitions.ts` |
| A new spot | a folder under `sets/` with its 3D set piece, an entry in `STAGE_SETS` (`sets/sets.ts`), and one in `SET_PIECES` (`three/renderer.ts`); camera presets that only make sense there go in the explorer's `CAMERA_PRESETS` with `set` |
| A new skater | a folder under `riders/`, an entry in `SKATERS` (`riders/skaters.ts`), and one in `RIDER_PIECES` (`three/renderer.ts`) |
| Camera angles or framing | `camera/camera.ts` (bounds, lift); explorer presets in `src/features/explorer/explorer.ts` |
| How the stage looks (ink, shading, shadows) | `three/post.ts`, `three/materials.ts` |

Motion solvers share the skeleton contract, not each other's private constants.
Grind entry reuses the flatground solver for the hop; tricks into and out of a
grind borrow its rotation clocks. Match-specific choices,
reel text, and reducer callbacks belong in `features/game`, passed through the
stage's `LeadIn` API. Keep tests sampling the complete motion; aggregate hot
sweeps by their worst violation instead of making an assertion per sample.

## Dependency Map

Imports across web features must go through `@/features/<name>` unless an API
route is importing server-only feature code. ESLint enforces the common cases;
`src/architecture.test.ts` locks the exact graph and catches relative bypasses.

| Feature | May depend on | Must not depend on |
|---|---|---|
| `apps/mobile` | React Native/Expo, WebView, linking helpers | `src/*`, Cloudflare platform, web feature internals, game/domain packages |
| `packages/animations` | React, three.js (never reachable from the root entry), package-local files | `src/*`, `skrobot-animations/*`, app/platform code |
| `skrobot-animations` | package-local files, `@skrobot/animations` | `src/*`; reusable animation behavior belongs in `packages/animations` |
| `auth` | `platform/server` from server files | Gameplay, screens, other features |
| `analytics` | `platform/server` from server files | Gameplay and screen features; AppShell supplies lifecycle context through the public tracking API |
| `billing` | `platform/server` from server files | Auth UI, gameplay, screens, other features |
| `tricks` | none | Other features |
| `explorer` | `tricks`, `robots`, `@skrobot/animations`, `@skrobot/animations/three`, `@skrobot/animations/three/video` (loaded on demand) | Other features; it plays animations and never reads or writes player records |
| `gallery` | `tricks`, `records`, `robots`, `skater`, `@skrobot/animations/three` (loaded on demand) | Other features |
| `records` | `tricks` | Other features; the catalog dependency is limited to legacy display-name migration into stable trick IDs |
| `robots` | `tricks`, `records`, `@skrobot/animations` | Screens, game, voice, auth, billing, skater |
| `skater` | `tricks`, `records`, `robots` | Screens, game, voice, auth, billing |
| `home` | `robots`, `records`, `skater` | Game/voice flow internals; non-flatground roster setup |
| `install` | none | Other features; AppShell supplies native-shell context |
| `game` | `tricks`, `robots`, `records`, `@skrobot/animations`, `@skrobot/animations/three` | Voice, home, auth, billing |
| `voice` | `game`, `tricks`, `robots`, `records`, `auth`, `billing` | Home screens |
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
- `src/features/analytics/api.ts`

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
- Animation motion and reusable scenes stay in `packages/animations`; game features supply match-specific text and state.
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
