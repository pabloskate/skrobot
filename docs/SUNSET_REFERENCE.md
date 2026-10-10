# Sunset Car Wash reference and reconstruction

The scene reconstructs the **skateable 2019 version** of the roof-to-bank at
7955 Sunset Boulevard, Los Angeles. It uses the blue canopy, orange lower trim,
large white lettering and gray bank visible in Milton Martinez's cover photo.
The skated line approaches along the canopy, transfers off its short end, then
turns about 90° to descend the broad bank on the **right when viewed from the
street**. The top of that exposed landing bank is the same height as the bank
across the canopy frontage. It deliberately predates
the barrier installed along the bank's bottom in 2021.
The later white/green “Sunset Speedwash” branding is not mixed into this version.

## References inspected

- [CCS: A Brief History of the Sunset Carwash (July 19, 2022)](https://shop.ccs.com/blogs/blog/carwash-history).
  Historical overview and the 2003/2019 action photographs; also documents the
  2021 barrier. The article is useful for identifying which appearance belongs
  to which period, not for surveyed dimensions.
- [Milton Martinez, December 2019 Thrasher cover, reproduced by CCS](https://cdn.shopify.com/s/files/1/0519/1388/3831/files/milton.jpg?v=1658188255).
  Viewed at full resolution. Establishes the blue/orange/silver canopy,
  rounded Sunset logo, open gap beneath the fascia, roof edge, rough gray paint,
  very steep landing and oleander planting beside the landing line.
- [Jim Greco / Pee Wee Monkress 2003 photos, reproduced by CCS](https://cdn.shopify.com/s/files/1/0519/1388/3831/files/graco_peewee.jpg?v=1658174201).
  Viewed directly. Confirms the same roof-to-bank structure under the older
  cream “100% HAND CAR WASH” signage. That older branding is reference only.
- [Skate Sonr spot record](https://skatesonr.com/skate_spots/united_states/california/los_angeles/13655013079519232/the_car_wash_bank/)
  and its [wide bank/canopy photograph](https://images.skatesonr.com/places/2022/05/12/2689_app_1920x1080_pixeled.jpeg).
  Viewed directly. Supplies the address and the long horizontal bank, projecting
  box planters, trowel/paint streaks, sidewalk and the large roadside billboard.
- [CCS visitors beside the bank](https://cdn.shopify.com/s/files/1/0519/1388/3831/files/CCS_carwash.jpg?v=1657923772).
  Viewed directly for relative human scale, bank pitch, sidewalk joints and
  canopy support details. This later photograph has the barrier and new
  branding, so those details are excluded from the classic scene.
- [Ryan Ferguson: The 25 most sacred skate spots of all-time](https://ryanferguson.co.uk/blogs/blog/sacred-skate-spots-skateboarding-world).
  User-supplied starting point; additional photos above supply the geometry.

- User-supplied seven-image reference set (October 5, 2026): full frontage,
  a street-side overview and five sequential frames of the transfer. Inspected
  directly. The side overview establishes the bank extending well past the
  canopy and tapering down at its distant end. The airborne/touchdown frames
  establish the roof-end transfer and quarter-turn into the bank, the open
  canopy bays, corner oleander, and white stucco / terracotta buildings behind.
  These user references govern the line and adjacency of the revised scene.
- Subsequent user corrections specify a uniform bank crest across the frontage
  and open landing, with the transfer on the right from the street. The side
  landing must not acquire a separate raised section reaching toward the roof.
- Additional user photographs show that the real spot is substantially larger
  relative to a skater than the initial reconstruction. The whole environment
  and collision surface are increased **50%**, while rider and board dimensions
  remain unchanged. This is a visual scale estimate from the photographs,
  not a newly discovered survey or published measurement.

These images were used as visual references, not redistributed as textures.

## Dimensions and confidence

No reliable survey or published measured bank section was located. Every
numeric dimension below is a **photo-based reconstruction estimate**, informed
by people, rail heights and the canopy proportions. Do not present these as
verified real-world measurements. Units match El Toro at 29 world units/foot.
The current estimates include the 1.5× scene-scale correction described above.

| Feature | Reconstruction | Basis |
| --- | --- | --- |
| Roof edge above sidewalk | 18 ft / 5.49 m | Relative human and fascia scale, revised from the additional photos |
| Roof to bank crest | 6 ft / 1.83 m everywhere | Fascia plus open wash-bay gap; uniform crest required by the user |
| Bank vertical fall | 12 ft / 3.66 m | Same crest-to-sidewalk fall across frontage and exposed landing |
| Bank horizontal run | 12 ft / 3.66 m | Starts at the front edge; no extra uphill extension |
| Main bank angle | About 47.2° | Derived from the chosen run/drop and rounded toe |
| Rounded toe | Final 1.8 ft / 0.55 m of run | Visible slight easing at sidewalk; smooth tangent is a simulation approximation |
| Roof approach | 3 ft behind front edge, along canopy toward its short end | Transfer line in user sequence |
| Landing position | 3 ft downhill of front edge and 9 ft past the right canopy end | Chosen playable entry on the open right-hand bank |
| Bank width | 135 ft / 41.1 m, plus 18 ft end taper | Long frontage and broad open side extension |
| Bank beyond right canopy end | 33 ft / 10.06 m at the frontage crest height, plus taper | Street-side reference silhouette; no separate raised landing |
| Canopy | 97.5 ft wide × 54 ft deep | Photo-guided scene envelope |
| Sidewalk | 7.5 ft / 2.29 m wide | Relative scale from wide and visitor views |

The exact placement of background buildings, palms, roof equipment and the
billboard is an approximate contextual composition. The billboard's invented
California sunshine artwork avoids copying a transient advertisement. Core
spot identifiers—the steep painted bank, canopy lip, blue/orange fascia,
open bays, projecting shrub planters, sidewalk and Sunset Boulevard—follow
photographed features.

## Contextual street life

`sunsetStreetscape.ts` adds lived-in context that is composed, not surveyed:
traffic on Sunset that keeps right (the inner near lane and both far lanes;
the curb lane stays empty because the rollout reaches about twelve feet into
it), cars being dried in the bays with their roofs over the bank crest, cars
waiting in the side lot with its stall lines, vacuum stations, cashier booth,
towel cart and puddles, coiled hoses on the bay columns, rooftop units and
vents behind the roof approach, lane oil, tar-sealed cracks, manholes, gum,
a hydrant with red curb, a bus bench and stop, a city trash can, a row of
shopfronts with abstract sign lettering across the boulevard, a mini-mall past
the lot, palms and street trees, and wooden power poles in the alley. Wheel
marks and repainted patches on the bank follow its slope. Cars and trees are
the shared realistic street props; everything else is baked geometry.

## Geometry and motion contract

`sunsetLayout.ts` owns the profile and spatial surface sampler used by scenery
and motion. x runs downhill toward Sunset Boulevard. From the street looking
uphill, negative z is right and positive z is left. The canopy occupies
z=-9 ft to z=88.5 ft, with its front roof edge at x=0/y=0. The approach follows
**negative z** at x=-3 ft, leaving the short end at z=-9 ft and turning toward
+x before touchdown. The landing line is z=-18 ft; touchdown is x=3 ft. The
frontage is not the takeoff direction.

The bank starts at **x=0/y=-6 ft across its entire width**, from z=-42 ft to
z=93 ft. The frontage and the exposed right-hand landing share this same
crest, with no raised portion or uphill extension beside the roof. The
canopy remains above the frontage, leaving the photographed open wash bays.
The bank falls twelve feet over twelve feet of horizontal run, then joins the
sidewalk through a quadratic toe. Height and tangent are continuous at both
ends of the toe. The broad landing is clear of planters and canopy architecture.

A narrow top cap and contextual planting sit behind the uniform crest. The
far end tapers down beside the driveway, matching the overview silhouette;
that decorative taper is outside the rider's route. The stage aligns board
and rider to the bank and carries the rollout through the toe onto the street.
Geometry uses the same profile and smooth normals, with 16 segments at the toe.
Scenery is authored in its original normalized coordinates, then geometry and
architectural shadow bounds are scaled by `SUNSET_SCALE=1.5`. The layout exports
world-scale dimensions for collision and motion. Rider scale stays at 29 world
units per foot; the larger obstacle therefore produces the corresponding
flight, drop and rollout rather than enlarging the rider with the scene.

The environment merges into one ground and one prop mesh plus the shared sky.
It uses El Toro's weathered material family, real 3D foliage and lettering,
static canopy/planter shadows, and the shared projected rider shadows. No
camera-facing foliage or image textures are required.

Verification: `npx vitest run packages/animations/src/sets/sunset/sunset.test.ts`
checks the derivative, bank/sidewalk continuity, landing region, agreement
between rendered vertices and the ride surface, finite geometry, and the
140,000-vertex mobile budget. It also checks that all bank-profile vertices
start at x≥0, both crest ends have the same height, the rendered roof lies
to the left of the landing from the street, and the roof approach and
right-hand bank landing sample their respective surfaces.

The route contributes a 90° turn to every trick, independently of the trick's
own rotation. The roof approach has route yaw -90° and the downhill landing
has route yaw 0°; the rig's yaw metadata adds +90° initially, easing to 0° at
touchdown. A 180 therefore adds its own rotation to the side entry. Regular,
goofy and backward approaches all use the same roof-end transfer. The airborne
center follows a ballistic drop with horizontal travel across both axes; the
landing scrubs cross-bank motion as the wheels face downhill. Stage regressions
check all approach stances, additional trick rotations, surface clearance,
and position continuity at pop/touchdown.
