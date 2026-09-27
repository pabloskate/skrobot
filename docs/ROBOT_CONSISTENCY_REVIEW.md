# Robot consistency review — September 6, 2026

September 20 follow-up: [Pro reliability review](PRO_ROBOT_RELIABILITY_REVIEW.md)
raises the six routed Classic pros' land rates and removes late backside shuvits
from the catalog and robot tables. The values below describe the earlier pass.

Follow-up: [the set-selection review](ROBOT_SETTING_REVIEW.md) revises the weights
that this consistency pass preserved, while keeping these land rates unchanged.

All 49 roster bots were reviewed: 33 classic bots (including the ten outside the
routed flatground roster) and 16 Defense bots. The 2,926 existing classic
trick/stance entries were considered individually; 2,817 changed. Classic bag
membership, explicit zeros, and classic set weights were preserved. Defense now
has 382 individually authored entries, with more core flip sets and less frequent
specialty combinations. The authoritative numbers remain in
`src/features/robots/behavior.ts`.

These are **authored game probabilities**, informed by evidence and tuned for a
real person skating a session. They are not measured probabilities for fictional
bots, estimates of any named professional, or a generated skill/difficulty curve.
No blanket percentage reduction, stance multiplier, random jitter, runtime cap,
or fallback determines a rate. The temporary transcription used four columns
(regular, fakie, switch, nollie), then copied the chosen numbers into the literal
tables. It did not calculate rates. Existing unavailable tricks stay unavailable.

## Evidence and its limits

[Purser, Yeomans, Benson and Shorter, *Trick Trajectories* (2026)](https://www.tandfonline.com/doi/full/10.1080/01490400.2026.2709229)
analyzed 24,053 attempts across 443 games in 13 BATB tournaments. Its central
finding for this task is a reliable core alongside a less dependable wider
repertoire. A high rate on a frequently practiced trick does not justify the
same rate across the bag.

The authors' [Skateboarding Trick Attempt Dataset, v1](https://doi.org/10.25916/sut.31043779.v1)
was inspected locally. Illustrative calculations below filter `Variant == None`
and `Type == Defence`, then count `Outcome == Land`. These are **our descriptive
calculations**, not bot inputs. The dataset is CC BY-NC 4.0; raw observations are
not bundled with the app or committed in this change.

| Dataset trick | Landed / attempts | Observed fraction |
| --- | ---: | ---: |
| Kickflip | 316 / 330 | 95.8% |
| Backside 180 Bigspin | 204 / 234 | 87.2% |
| Switch Backside 180 Bigspin | 47 / 97 | 48.5% |
| 360 Shuvit | 59 / 88 | 67.0% |
| Switch 360 Shuvit | 3 / 11 | 27.3% |
| Hardflip | 138 / 234 | 59.0% |
| Double Kickflip | 29 / 51 | 56.9% |
| Lazer Flip | 16 / 35 | 45.7% |

Selection matters: setters choose their strengths, while defenders face someone
else's bag. Rebate-coded rows are excluded here, which is not identical to a
clean first-attempt-only sample. Tournaments also mix entrants and conditions;
small samples, especially eleven switch 360 shuvits, are weak evidence. Some
stance/direction names need mapping (e.g. half cab, full cab). There is no credible
per-trick population dataset here for beginners or for the app's entire rail and
transition catalog. Those rates are explicitly editorial judgments.

[skatedeluxe's flatground progression](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/)
provides a second reference for prerequisites. Its
[bigspin lesson](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-bs-bigspin/)
explains scoop/body timing;
[switch flips](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-switch-kickflip-switch-heelflip/)
and [nollie flips](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-nollie-kickflip-nollie-heelflip/)
are distinct practices. The
[tre-flip](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-360-flip-treflip/)
and [hardflip](https://www.skatedeluxe.com/blog/en/trick-tips/skateboard/flat/how-to-hardflip/)
lessons explain different scoop/flick demands. These lessons support qualitative
choices, not exact percentages.

## Trick-by-trick decisions

Each row below was considered separately in every bot's existing bag. A
specialist can reverse the usual ordering; the table does not define runtime
rules. Familiarity, direction, stance, and this bot's practice history matter
more than the catalog's single display difficulty number.

| Base trick | Judgment applied when choosing individual entries |
| --- | --- |
| Ollie | Dependable core for experienced bots; switch/nollie still vary. A few Pro regular ollies reach 96%, but this does not spread into the flip bag. |
| Ollie North | Foot removal and recovery are separate practice. Substantially below ollies; Houdini has more comfort than a rail specialist. |
| Frontside 180 | Strong regular foundation; Echo and Palindrome have practiced switch frontside rotation. |
| Backside 180 | Half cabs can outperform regular backside 180s; switch backside rotation is a different weakness. |
| Pop Shuvit | Swivel's strength is retained at 84% regular, 81% fakie, 50% switch, 76% nollie. No four-stance certainty. |
| Frontside Shuvit | Magnet favors this direction; switch frontside can be more comfortable than switch backside for particular bots. |
| Kickflip | Sparky's 75% signature survives; other beginners need not have a dependable flip. Pros have different off-stance gaps. |
| Heelflip | Independent from kickflip. Lefty favors heels; Achilles remains weak; Scope and Echo have heel strengths. |
| Backside 360 | Full cabs favor Carousel and Rewind. Switch backside 360s are meaningfully less dependable. |
| Frontside 360 | Orbit favors regular frontside; Echo and Palindrome favor switch frontside. Not copied from backside rates. |
| Backside Flip | Half cab flips form a reliable core for several bots; switch variants remain substantially less reliable. |
| Frontside Flip | Diesel and Bouncer practice the regular version. Fakie and nollie do not inherit that confidence. |
| Bigspin | Fakie/nollie can be comfortable; switch backside bigspin remains a clear opening, even for Pros. |
| Varial Kickflip | Zigzag can favor it over a plain flip. Maestro's tre-flip practice does not make every varial automatic. |
| 360 Shuvit | Full scoop and catch without a body turn deserve separate rates from bigspins. Abacus is strong, not certain. |
| Late Backside Shuvit | Snooze's existing specialty only; regular 69%, fakie 57%. No automatic additions elsewhere. |
| Late Frontside Shuvit | A separate midair timing skill; Snooze favors it, most bots rarely get it first try. |
| Varial Heelflip | Zigzag and Scope have deliberate strengths; heel weakness carries through Achilles' individual entries. |
| FS Bigspin | Separate from BS bigspin: Echo and Palindrome are more comfortable with switch FS than switch BS. |
| Backside Heelflip | Scope's heel side and half cab familiarity help; a good kickflip does not imply a good backside heel. |
| Frontside Heelflip | More emphasis for Scope and Diesel; not assigned the backside-heel rate. |
| Frontside 360 Shuvit | Less familiar than ordinary FS shuvits; Scope/Abacus practice the full scoop. |
| Pressure Flip | Houdini's regular 79% is a specialty. Most Pro pressure flips remain well below their ordinary flips. |
| Hardflip | Diesel's regular 69% beats Scope's 39%; each fakie/switch/nollie entry receives its own judgment. |
| Inward Heelflip | Diesel and Scope have useful versions; hardflip proficiency does not automatically carry over. |
| 360 Flip | Maestro's regular 88% is dependable, but switch 63% and nollie 72% differ. Zigzag still lacks tres. |
| Double Kickflip | Encore's regular 74%, fakie 79%, nollie 58% reward practice; its unavailable switch version stays absent. |
| Late Kickflip | Snooze is unusually comfortable; being able to double flip does not confer automatic late timing. |
| Bigspin Flip | Maestro and Abacus have practiced bigflips. Fakie can be stronger; switch is its own challenge. |
| Dolphin Flip | Houdini's unusual footwork helps. Other Pros do not receive 90%+ on an infrequently practiced flick. |
| Impossible | Houdini wraps at 76% regular/57% fakie. A reliable tre flip is not equivalent to a reliable wrap. |
| Double Heelflip | Encore and Scope practice these; generally less dependable than their single heels or double kicks. |
| Backside 360 Kickflip | Full cab flips differ from regular 360 flips and receive much more conservative rates; Abacus favors fakie. |
| Frontside 360 Kickflip | Existing classic exclusion preserved. Fortress retains it as a rare Defense challenge, not a routine set. |
| FS Bigspin Flip | Encore's limited classic bag remains a long shot; Defense occurrences receive low selection weights. |
| BS Bigspin Heelflip | Existing classic exclusions preserved. Defense occurrences are specialty surprises with individually low nominal rates and weights. |
| FS Bigspin Heelflip | Scope is the specialist (67% regular/73% fakie); other bots are appreciably weaker. |
| Laser Flip | Scope 72% regular versus Maestro 29%; the specialist's switch exclusion is preserved. |
| 360 Double Kickflip | Encore's limited regular/fakie specialty is 51%/59%; Defense versions are occasional challenges. |

Every existing non-flatground entry was also reviewed individually. Noodle favors
boardslides and noseslides over blunts and noseblunts. Clamp favors 50-50s and 5-0s,
with separate lower odds for salad, suski, smith, feeble, nosegrind and overcrooked
entries. Crown's smith/feeble strengths do not make hurricanes certain. Pendulum
and Gecko retain transition strengths but nose stalls, disasters, bigspin stalls,
sweepers and blunt variations differ. Manuals and nose manuals require balance
through a duration; neither gets a free 97% because a bot knows an ollie.

## Every classic bot

Examples below are chosen entries, not rules that generate the rest. Names match
the editor; stable internal IDs are included for reviewing the source.

| Bot (ID) | Individual character retained or clarified |
| --- | --- |
| Gutsy (`sacker`) | Original 90% ollie, 45% kickflip, 35% heelflip retained; norths are less secure. |
| Magnet (`fronty`) | Regular FS shuvit 76%; regular backside 180 remains outside its bag. |
| Lefty (`flipper`) | Regular heel 58% versus kickflip 40%; switch/nollie heels still explicit zero. |
| Sparky (`flipster`) | Regular kickflip 75%; switch and nollie 15%; norths are not foundations it has mastered. |
| Boomerang (`cabby`) | Half cab 86%; switch ollie 56%; switch pop shuvit stays 50%. |
| Swivel (`shifty`) | Strong shuvits, shakier body/flip combinations; no 97% scoop plateau. |
| Achilles (`heelzy`) | Kickflip 82%, heelflip 25%; each heel-family entry remains weak. |
| Zigzag (`varial`) | Varial kickflip 68%, varial heel 58%; tres remain absent. |
| Cyclone (`biggy`) | Fakie bigspin 72%, regular 64%; flips lag behind rotations. |
| Nosy (`nolly`) | Nollie flip 74%, regular flip 56%; nollie tre 44%, nollie laser 12%. |
| Rewind (`fakie`) | Fakie flip 79%, full cab 65%; switch flips 26%. |
| Orbit (`jupiter`) | Regular frontside 360 68%, fakie bigspin 82%; heel/late combinations are openings. |
| Bouncer (`hesh`) | Regular tre 52%, FS flip 66%; switch hardflip 18%. |
| Snooze (`latezy`) | Regular late BS/FS shuvits 69%/63%, late flip 47%; ordinary switch flips 44%. |
| Echo (`switchy`) | Switch heel 76%, switch FS bigspin 58%, switch BS bigspin 38%. |
| Diesel (`hardy`) | Regular hardflip 69%, inward heel 58%; switch hardflip stays absent. |
| Carousel (`caball`) | Full cab 81%, half cab flip 80%; switch BS 360 29%. |
| Palindrome (`freely`) | Switch heel 85%, switch FS bigspin 74%; switch BS bigspin 53%, pressure flip 23%. |
| Houdini (`impy`) | Regular impossible 76%, pressure flip 79%; ordinary heels 64%, lasers 18%. |
| Abacus (`c360po`) | Regular tre 85%, bigspin 82%, 360 shuvit 72%; switch BS bigspin 52%. |
| Scope (`laser`) | Regular heel 91%, laser 72%, hardflip 39%; no switch laser added. |
| Maestro (`tre`) | Regular tre 88%, bigflip 78%, heel 74%; switch BS bigspin 39%. |
| Encore (`double`) | Fakie double kick 79%, regular double heel 62%; pressure flip 32%, switch BS bigspin 32%. |
| Scuffy (`baily`) | Ollie 67%, pop shuvit 41%; genuinely early-stage control. |
| Rusty (`tictac`) | Caveman 85%, boneless 69%, manual 58%; no new flip bag. |
| Hocus (`wally`) | No-comply 83%, boneless 86%; kickflip 59%, tre 27%. |
| Noodle (`lanky`) | Boardslide 83%, noseslide 76%; noseblunt 16%, weak off-stance flatground. |
| Gecko (`wallride`) | Drop-in 93%, fakie bigspin stall 59%; blunt-to-fakie 24%. |
| Clamp (`droopy`) | 50-50 85%, 5-0 69%, feeble 54%; hurricane 26%. |
| Pendulum (`spine`) | Rock-to-fakie 88%, disaster 72%; noseblunt stall 29%. |
| Jack (`skater`) | Broad moderate bag: kickflip 70%, boardslide 74%, manual 57%; no universal specialty. |
| Crown (`smitty`) | Smith 86%, feeble 82%; regular tre 52%, switch flip 42%. |
| Metronome (`drone`) | Regular kickflip 88%, half cab flip 75%; late flip 25%, laser 25%. |

## Every Defense bot

Defense mode deliberately presents every set as landed. A player match gives the
bot a letter; a miss gives the player one. Therefore changing its nominal land
rate alone cannot make this mode easier. Both the individual nominal rates and
the explicit **Defense set weights** were reviewed. Weights are relative draw
weights; used tricks are removed, so initial shares change through a game.
No game rules or guaranteed round-by-round mix were introduced.

| Bot | Set-selection decision |
| --- | --- |
| Speed Bump | Mostly ollies, shuvits and 180s; flips/norths are occasional. |
| Hurdle | Regular heel remains its main challenge; kickflips are less frequent than heels. |
| Pothole | Regular/fakie frontside sets dominate; switch/nollie asks are occasional. |
| Tripwire | Regular/fakie shuvits lead; switch pop shuvits stop crowding out fundamentals. |
| Turnstile | Fakie flips and bigspins lead; switch flips and nollie full rotations are occasional. |
| Rampart | Retains the prior hand-edited rotation bag; regular basics support the bigspin challenges. |
| Deadbolt | Regular/fakie varials remain the specialty; ordinary flips and 180s get breathing room. |
| Quicksand | Late FS shuvits and switch 360 shuvits become occasional tests rather than the dominant draw. |
| Barricade | Regular tres and half cab flips lead, off-stance hardflips become rare. |
| Sentinel | Switch/nollie single flips lead; switch 360 shuvits and hardflips are uncommon. |
| Moat | Regular/fakie backside flips remain prominent; switch backside 360s appear sparingly. |
| Gauntlet | Regular hardflip/inward practice balanced by ordinary flips and 180s; off-stance combinations rare. |
| Aegis | Single heels and varial heels anchor the game; lasers/bigheels remain specialties, not every round. |
| Fortress | Adds regular/fakie flips and half cab flips; double kickflips stay prominent, rare full-rotation combinations recede. |
| Bastion | Nollie single flips support nollie tres/bigflips; nollie lasers become occasional challenges. |
| Citadel | Fakie flips, half cab flips, bigspins and full cabs support the cab-flip/bigflip specialties. |

## Pacing and verification

The last-letter retry matters: a constant 97% bot misses twice with probability
0.03 × 0.03 = 0.0009 per challenge. A hypothetical unlimited sequence of identical
97% challenges would require about 1,244 landed sets on average to earn five
letters (four ordinary misses plus that double miss). Actual games have finite
bags, varied rates, turns and failed sets; this is a diagnostic illustration,
not an actual match-length prediction.

`node scripts/audit-robot-consistency.mjs [path/to/before-behavior.ts]` runs the
production reducer with seed 20260906, 2,000 games per robot/scenario/version and
alternating first setter. It counts physical player attempts, including failed
sets and final-letter retries, not animation transitions. The perfect-player
probe shares the robot's set weights and can copy/set every trick in its bag;
it isolates defense pacing, not human win probability. Matched opponents use
the same authored rates on both sides. Percentiles exclude unfinished games,
which are reported separately.

| Pro bot | Matched median attempts before → after | Matched p95 before → after |
| --- | ---: | ---: |
| Palindrome | 49 → 35 | 89 → 63 |
| Houdini | 64 → 30 | 111 → 52 |
| Abacus | 79 → 33 | 130 → 60 |
| Scope | 96 → 33 | 144 → 58 |
| Maestro | 101 → 32 | 146 → 57 |
| Encore | 113 → 30 | 153 → 55 |

The before/after pacing audit covers 184,000 games across the 23 routed classic
bots. New Hard matched medians are 30–33 attempts and Pro medians 30–35; all new
Hard/Pro pacing games finish. These tests do not model fatigue, injury, human
strategy or individual skatepark skill. Physical playtesting remains the next
source of feedback.

The classic ladder was recalibrated with
`npm run simulate:robot-elo -- --games=2000 --seed=20260906`: 506,000 games, zero
draws. Every Pro still ranks above every Hard, every Hard above every Medium,
and every Medium above every Easy. Existing display-rating anchors stay fixed.
Player-rating calibration is reproducible with
`node scripts/calibrate-player-rating.mjs`; it tests the existing synthetic
player curve against the new fixed robot ladder. That curve estimates the player
only and does not author or modify any robot probability.

The player calibration ran 340,400 synthetic games; three reached its action
limit and were excluded from the fit. Adjacent sampling reversals at the high
end are pooled to keep the player-rating table monotonic. Selection uses the
existing player curve, sets with at least 20% estimated success, and relative
weights equal to that player's probability squared. These assumptions belong
only to this reproducible offline player probe.

Regression checks cover finite probabilities, removal of near-certain plateaus,
stance/personality exceptions, practical matched-game attempt counts, existing
bag exclusions and core-flip representation in Pro Defense draws.

Final verification: all 342 tests, ESLint, web/mobile/animation typechecks and
the production build passed. The build needed the normal host credentials for
the existing remote Cloudflare binding session. The live `/tune` editor showed
Maestro's new 88% regular tre and 39% switch bigspin, with no local overrides.
