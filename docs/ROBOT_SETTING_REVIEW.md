# Robot set selection review — September 2026

September 20 follow-up: [Pro reliability review](PRO_ROBOT_RELIABILITY_REVIEW.md)
raises Pro landing rates while preserving their set weights. Late backside
shuvits are removed from the catalog and Snooze's tables. Numbers below describe
the preceding set-selection pass.

This pass revisits all 49 bots: 33 Classic and 16 Defense. It changes their
explicit set weights, not their landing probabilities. Both landing-rate tables
are byte-for-byte identical to the preceding consistency review. Every existing
trick/stance key remains present in the set tables: 2,926 Classic entries and 382
Defense entries.

## What was wrong

The previous consistency pass deliberately left Classic set weights alone.
Those weights still reflected the old, much more consistent bots. The picker
correctly sampled the supplied weights, but the supplied choices were poor.
Hard/Pro flatground bots spent 11.5–28.0% of their opening probability on tricks
with a land rate below 30%. Maestro gave a 39% dolphin flip nearly the same
weight as an 88% tre. Abacus treated all four stances of a 360 shuvit alike,
despite substantially different landing rates.

Simply weighting every trick by its land rate would keep those two problems:
the weakest sets would still appear too often, and highly reliable ollies would
compete with meaningful challenges. A good voluntary set needs confidence,
a plausible challenge for a peer, and a place in that particular bot's repertoire.

## Evidence and judgment

[Purser et al., *Trick Trajectories*](https://www.tandfonline.com/doi/full/10.1080/01490400.2026.2709229)
reports improvement concentrated in skaters' core repertoire. In the authors'
[trick-attempt dataset](https://doi.org/10.25916/sut.31043779.v1), our descriptive
analysis of `Variant == None` found an 86.0% landing fraction among 12,322 offense
attempts, versus 71.0% among 10,566 defense attempts. Frequent voluntary sets
included tre flips, kickflips, and switch/nollie flips. These observations support
favoring a practiced core. They do not establish ideal game weights or causal
effects: entrants choose their own sets, and rebate-coded attempts are excluded.

The new weights are editorial choices, written individually. Tournament data
informs the approach; no dataset row is used as a gameplay weight, and no raw
research data ships with the app. Beginner, rail, and transition preferences
remain design judgments. The goal is a believable opponent for a real skating
session, not a statistical recreation of BATB professionals.

## The authored setting policy

- **Hard/Pro Classic fundamentals are copy-only:** all four plain ollies,
  regular pop shuvits, regular frontside shuvits, and both regular 180s have zero
  set weight. Their landing rates and ability to copy a player's set remain.
  Off-stance shuvits/180s retain small, individually chosen weights, with more
  emphasis for the stance and rotation specialists. Ollie North is considered
  separately as a novelty, not treated as a plain ollie.
- **A dependable core leads the bag:** familiar flips and well-practiced
  specialties receive the largest weights. A difficult signature does not
  automatically deserve a high weight. Bouncer's 37% hardflip is an occasional
  attempt; its 85% kickflip is a staple. Scope's 72% laser is a credible regular
  choice for that specialist, while its 39% hardflip is rare.
- **Weak voluntary sets are exceptional:** every bot's initial share for all
  sub-30% tricks combined is below 1%. Many are copy-only. Others have small
  explicit weights, generally 0.01–0.03, preserving occasional gambles. This is
  a regression guard on the authored data, not a runtime cap. Basic copy-only
  moves are deliberate exceptions to “higher confidence means more sets.”
- **Stances are individual skills:** Encore prefers its fakie double kickflip;
  Palindrome emphasizes switch heels and switch frontside combinations;
  Abacus sets regular 360 shuvits far more often than switch ones. No family-wide
  favorite boost or uniform stance multiplier runs during a game.
- **Easy still feels like Easy:** ollies, shuvits, and 180s remain useful sets.
  Every positive-rate entry of the six routed beginner bots retains a positive
  set weight, including tiny weights on long-shot backups. This avoids shrinking
  already small setting repertoires.
- **Defense has its own weights:** these games treat robot sets as landed,
  so reducing a bot's land probability would not make its choice rarer. Its
  separate set table was reviewed directly. Hard regular 180s are occasional
  relief at 0.03 weight each; flips and personal specialties lead. All 382
  Defense entries keep positive weights, with at least 15 choices per bot.

Weights are relative. For example, Maestro's tre weight is 12 and its dolphin
weight is 0.2, making the tre 60 times as likely while both remain available.
At the opening of a full-bag game these are approximately 10.2% and 0.17% of
choices. Its 92% kickflip has weight 9. The weights are not landing percentages.

The production selector remains weighted random sampling over unused tricks.
Successful sets leave the game; failed sets remain eligible. This naturally
broadens the selection later in a game. It does not force a scripted opening,
peek at the player's hidden skill, adjust rates to the score, or introduce a
second formula that overrides the editor. The same selector serves screen and
voice play.

## Individual repertoires

| Classic bot | Setting emphasis |
| --- | --- |
| Gutsy | Ollies, regular frontside 180, half cabs and shuvits; flips remain tentative. |
| Sparky | Regular kickflip leads, followed by fakie flips and familiar shuvits. |
| Magnet | Regular/fakie frontside shuvits and frontside 180s; switch front shuv is secondary. |
| Lefty | Familiar foundations with a noticeable heelflip preference; fakie heel remains less trusted. |
| Boomerang | Half cab and fakie pop shuvit; full cab is a rare stretch. |
| Swivel | Regular/fakie/nollie shuvits, then its dependable regular kickflip. |
| Achilles | Regular and fakie kickflips; heels remain nearly absent from voluntary sets. |
| Nosy | Nollie flips and nollie shuvits/rotations; difficult off-stance combinations are rare. |
| Rewind | Fakie kickflip, half cab, full cab and fakie bigspin. |
| Zigzag | Varial kickflip and core flips; varial heels are less frequent. |
| Cyclone | Regular, fakie and nollie bigspins; 360 shuvits are secondary. |
| Bouncer | Kickflips, frontside flips and fakie backside flips; the shaky hardflip loses priority. |
| Snooze | Regular late shuvits, kickflips and fakie backside flips; late kickflip is an occasional specialty. |
| Echo | Switch heels and switch flips alongside regular flips; switch frontside combinations show personality. |
| Carousel | Fakie flip, full cab, fakie backside flip and fakie bigspin. |
| Diesel | Regular hardflip and frontside flip with strong core flips; inward heels are secondary. |
| Orbit | Bigspins in its practiced stances, full cabs and regular 360 rotations. |
| Houdini | Regular impossible and pressure flip; fakie variants and dolphin flips are less trusted. |
| Encore | Fakie/regular double kickflips, ordinary kickflips and tre flips; double heels are secondary. |
| Maestro | Regular/fakie tre and bigspin flips; dolphins are occasional rather than co-headliners. |
| Scope | Heel flips, varial heels, lasers and frontside heel combinations; hardflips are rare. |
| Palindrome | Switch heel, switch flip, switch FS bigspin and switch tre, with a varied regular/nollie core. |
| Abacus | Tre flips, full cabs, bigspins and practiced 360 shuvits; switch 360 shuvits are rare. |
| Scuffy | Hippie jumps, cavemen and ollies; small shuvit/180 repertoire remains available. |
| Rusty | Cavemen, powerslides, bonelesses and manuals; limited transition tricks follow. |
| Hocus | Boneless and no-comply 180 lead; core flatground remains a credible alternative. |
| Noodle | Boardslides and noseslides dominate; lipslides precede shakier tailslides. |
| Gecko | Rock to fakie, stalls and sweepers; its lipslide is no longer overpromoted. |
| Clamp | 50-50s and 5-0s first, then crooked/feeble grinds; salad and overcrooked grinds are rare. |
| Pendulum | Rock n roll, axle stall, disaster and rock to fakie; drop-ins are not competitive staples. |
| Jack | A varied core of flips, boardslides, 50-50s and modest transition tricks. |
| Crown | Smith, feeble and crooked grinds; hurricane appears much less often. |
| Metronome | Core flips and a diverse mix of solid grinds/transition tricks; basic cruising moves are copy-only. |

| Defense bot | Setting emphasis |
| --- | --- |
| Pothole | Regular/fakie foundations; kickflip and ollie north are exceptional. |
| Speed Bump | Ollies, 180s and shuvits; rare flips stay rare. |
| Tripwire | Regular/fakie pop shuvits and frontside shuvits. |
| Hurdle | Foundations with a modest regular heel specialty. |
| Turnstile | Fakie flip, fakie bigspin and full cab; weak switch/nollie flips recede. |
| Deadbolt | Varials and core flips, with supporting 180s. |
| Rampart | Fakie/regular bigspins and familiar shuvits; weak varials become long shots. |
| Quicksand | Bigspins and shuvits, with occasional late frontside shuvit. |
| Barricade | Core flips and tre/backside flips; awkward hardflip variants become rare. |
| Moat | Fakie/regular backside flips and full cabs; ordinary 180s become occasional relief. |
| Sentinel | Switch flips and switch heels, backed by regular/fakie/nollie flips. |
| Gauntlet | Regular hardflip/frontside flip, core flips and inward heels. |
| Aegis | Heel family across its practiced stances; lasers support the core. |
| Bastion | Nollie flips, nollie tre and nollie bigspin. |
| Fortress | Core flips, regular double kickflip and tre; exotic combinations become exceptional. |
| Citadel | Fakie flip, fakie tre, fakie backside flip and fakie bigspin. |

## Verification

`scripts/audit-robot-setting.mjs` reports exact opening shares, then samples
1,000 ten-opportunity sequences per bot/version, using the actual picker and
removing successful sets. These sequences isolate repertoire depletion; they
omit opponent sets. The same audit separately runs 500 complete games per
routed Classic bot/version/scenario through the production reducer, including
opponent set consumption, misses and final-letter retries.

The full round robin used seed 20260907, 2,000 games per matchup and 506,000 total
games, with **zero capped games**. Robot Elo values were refreshed from it.
Player rating projection was recalibrated with 340,400 games (zero capped)
against the resulting fixed ladder;
the synthetic player curve is unchanged. These are simulation results, not
predictions of a particular person's win rate.

Matched Hard/Pro games finished in the pacing audit, with medians of 29–39
physical player attempts and 95th percentiles of 48–61. The six Pro medians are
31–39. A perfect-copy/set probe took a median of 17–23 attempts against Pro.
Some identical small beginner bags can still exhaust every shared set without
either side reaching five letters: 7 of 3,000 new equal-bag beginner probes
were capped, versus 5 with the previous weights. One of 3,000 perfect-bag
beginner probes was also capped. This pre-existing rules edge case is reported
instead of counting capped simulations as completed games. Normal roster
matchups did not stall in the much larger round robin.

Regression checks cover sub-30% set share for all 49 bots, removal of Hard/Pro
fundamental sets, retained copying ability, individual stance/specialty choices,
finite weights, viable repertoire sizes, and the unchanged direct-lookup
contract. The tuning editor now shows both set chance and land rate and labels
zero-weight tricks “copy only”; nonzero chances below 0.1% no longer round to 0%.

Final validation: `npm run check` passed lint, web/mobile/animation typechecks,
all 348 tests in 37 files, and the production build. The local editor was checked
visually and through its accessible controls with no browser tuning overrides.
