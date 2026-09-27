# Pro robot reliability — September 20, 2026

The six routed Classic pros now have more dependable core flips and practiced
specialties. The requested display-rating range was the previous Palindrome
level (about 1850) at the bottom, with the strongest around or slightly above
2000. Ratings are measured from games, not assigned to match the target.

## Authored changes

Only these six pros' landing probabilities were raised: 374 existing trick/stance
entries changed. Their bag membership and set weights are unchanged. Setting and
copying use the same landing probability, so both improve. Every new number is
an explicit literal in `src/features/robots/behavior.ts`; no runtime multiplier,
skill curve, score adjustment, or stance rule was added.

| Robot | Display rating before → after | Opening set lands before → after | Emphasis |
| --- | ---: | ---: | --- |
| Palindrome | 1850 → 1860 | 71.3% → 74.5% | Small improvements to ordinary and switch flips; remains the Pro entry point. |
| Houdini | 1760 → 1870 | 68.5% → 79.7% | Impossibles, pressure flips, and supporting regular/fakie flips. |
| Maestro | 1830 → 1940 | 75.7% → 86.2% | Tres, bigflips and core flips; stronger supporting heel copies. |
| Encore | 1810 → 1980 | 72.0% → 85.4% | Double flips and dependable core flip copies. |
| Abacus | 1870 → 2000 | 74.7% → 84.7% | Rotations, tres and bigflips, supported by better flip copies. |
| Scope | 1860 → 2010 | 73.2% → 84.3% | Heel combinations and lasers, plus better supporting kick-side copies. |

Opening reliability is the exact sum of each available trick's land rate times
its share of the initial set weights. It is not the mean over every trick in
the bag and is not a full-game landing percentage. Successful sets leave the
pool, changing subsequent selection. Browser-local `/tune` overrides are not
part of this calibration.

Weaknesses remain explicit. For example, Maestro's regular dolphin stays at
39%, Scope's regular hardflip at 39%, and Houdini's regular laser at 18%.
Only 3.9–9.6% of each Pro bag has a land rate of at least 90%; the existing
regression guard against near-certain rates across the whole bag still passes.

## Late backside shuvit removal

All four late backside shuvit stance variants are removed from the shared game
catalog, including its descriptions and discipline metadata. This removes them
from the picker, gallery, voice trick pool, and tuning grid. Snooze was the only
Classic robot carrying them: its regular/fakie consistency and set entries are
removed, along with the signature chip. No Defense robot carried them.
Late frontside shuvits and late kickflips remain available.

Existing animation support is retained for historical/standalone uses; it does
not make a trick selectable. Historical records are not rewritten.

## Calibration

`node scripts/simulate-robot-elo.mjs --games=2000 --seed=20260920 --json`
runs the production reducer over the updated catalog: 506,000 games, zero
unfinished games. Four-game blocks balance reducer side and first setter.

Measured raw Elo is Palindrome 2006, Houdini 2022, Maestro 2169, Encore 2240,
Abacus 2291, and Scope 2299. The existing raw-to-display mapping is unchanged.
The full tournament's mean stays anchored at 1500, so improving Pro also moves
other robots' relative ratings downward. Their land rates and set weights are
unchanged except for Snooze's removed tricks. The synthetic-player projection
is recalibrated separately against this measured ladder using
`node scripts/calibrate-player-rating.mjs`: 340,400 games, zero unfinished games.
The player skill model and display-rating mapping are unchanged; only the
measured skill-to-Elo anchors are refreshed.

## Physical attempt pacing

`node scripts/audit-robot-consistency.mjs /path/to/pre-edit-behavior.ts` compares
the pre-edit and final tables through the production reducer, seed 20260906,
2,000 games per robot/scenario/version. Both sides of a matched game use the
same robot's rates and weights; first setter alternates. Attempts include
missed sets and final-letter retries. These are synthetic comparisons, not
predictions of an individual skater's win rate or session duration.

| Robot | Matched median attempts before → after | Matched p95 before → after | Perfect-player median after |
| --- | ---: | ---: | ---: |
| Palindrome | 37 → 40 | 63 → 65 | 24 |
| Houdini | 31 → 39 | 53 → 62 | 24 |
| Maestro | 36 → 47 | 57 → 73 | 32 |
| Encore | 34 → 46 | 55 → 68 | 30 |
| Abacus | 38 → 51 | 61 → 78 | 35 |
| Scope | 37 → 51 | 63 → 79 | 35 |

All Pro audit games finish. The regression test allows a Pro median below 55
attempts for this stronger tier, retains the Hard median below 45, and retains
the p95 limit below 85 for both. The audit's 26 unfinished beginner-only games
are unchanged before and after this pass; shared-bag exhaustion is outside this
tuning change.

Regression coverage also checks bounded opening-set reliability, individual
specialties and weaknesses, the display-rating range, and complete removal of
late backside shuvits from the selectable catalog and all robot tables.

`npm run check` passed: ESLint, web/mobile/shared-animation/playground typechecks,
all 356 tests across 37 files, and the production Next.js build.

Deployed September 20, 2026 via `npm run deploy` to production Worker `skrobot`,
version `098cde72-25c4-4366-9ce3-439b7355aa9e` at 100% traffic. Both
`https://app.skaterobot.com` and the native shell's
`https://skrobot.me-d6a.workers.dev` returned HTTP 200 for the homepage and guest
`/api/me`. All 12 homepage JavaScript assets on each domain matched the build;
the live game data contains the new ratings and omits the retired trick.
