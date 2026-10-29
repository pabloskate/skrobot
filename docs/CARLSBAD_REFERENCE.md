# Carlsbad Gap reference

The scene reconstructs the original Carlsbad High School grass gap, before
demolition, rather than the replacement campus's twelve-stair or Carlsbad's
unrelated Water Gap. It is available in Dream Tricks and the Trick Explorer.

## Sources inspected

- [Krak's archival montage](https://www.youtube.com/watch?v=A7LnmEIsa84),
  with its [archive and clip credits](https://skatekrak.com/mag/carlsbad).
  Actual footage around 56–64 seconds was inspected for the approach, jump,
  stair rails and reverse view of the curved landing. The rider approaches
  **parallel to the classroom facade**, across the upper concrete courtyard.
  A tightly cropped front photograph can misleadingly suggest that the
  classroom blocks the approach. There is no invented hallway through it.
- [Wide contest photograph](https://sixby6.wordpress.com/wp-content/uploads/2015/04/carlsbad-hot-spots.jpg)
  and [demolition photograph](https://sixby6.wordpress.com/wp-content/uploads/2015/04/carlsbad-demolished.jpg),
  from [THE6BY6's archival feature](https://sixby6.wordpress.com/2015/05/13/hot-spots-hammers-at-carlsbad/).
  Both 1280 × 720 images were visually inspected. They establish the upper
  courtyard, eleven yellow-edged risers, two side rails without a center
  rail, concrete stair cheeks, worn bank and low front retaining wall.
- [Front photograph](https://fillow.net/images/spots/carlsbad-gap.jpg).
  Inspected for the pale classroom walls, brown doors, horizontally divided
  windows, shallow overhanging roof, slim posts and curled rail returns.
- [J-Ros's original photograph on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Carlsbad_Gap.JPG).
  Inspected for the green bank, curved retaining wall and round drain.
  Earlier and later footage shows different grass conditions; the model
  uses patchy green and brown rather than claiming one specific date.
- [Jeremy Wray's firsthand account](https://www.limitlessculturex.com/post/remembering-the-carlsbad-gap-with-jeremy-wray).
  Confirms the uphill landing, slick pavement and severe impact.
- [Keen Ramps' replica-building account](https://keenramps.com/blogs/posts-without-blog/2018-sun-diego-am-slam-built-by-keen-ramps).
  Describes the curved/uphill landing. A replica is useful corroboration,
  not a dimensional survey of the original.
- [Visit Carlsbad's local skate history](https://visitcarlsbad.com/blog/carlsbads-skateboarding-legacy-2025/).
  Identifies the original eleven-stair gap and its 2012 removal.

External photographs and footage remain research references. They are not
shipped as game textures or assets.

## Geometry and confidence

The **eleven stairs**, grass gap beside them, two side pipes, yellow noses,
low curved retaining wall, adjacent classroom wing, pavement joints and
**uphill** landing are supported by the visual references. Looking uphill
from the bottom, the stairs are on the **left** (+z), the bank on their
right, and the classroom flanks the grass side of the approach (−z).

No reliable surveyed plan or original tape measurement was found. The
following are explicit modeling estimates in `carlsbadLayout.ts`:

| Component | Model estimate |
| --- | --- |
| Upper walk to stair foot | 6 ft down |
| Stair run | 11 ft across, ten treads between eleven risers |
| Gap on the riding line, lip to bank toe | 13 ft across |
| Bank width alongside the stairs | 33 ft |
| Low wall height above adjacent paving | 1.3 ft |
| Initial uphill paving grade | 6.5%, easing to level farther away |
| Stair handrail height and diameter | About 3 ft and 1.56 in |

The estimate of 6 ft down corresponds to approximately 6.55-inch risers.
The rider touches down three feet past the toe; that extra clearance is a
staging choice, separate from the estimated architectural span. Building
lengths, roof overhang, windows, doors, tree positions and paving widths are
visual approximations. The lower path curves around the bank and flares at
the stair apron; its width is simplified to keep the existing straight
ride-away on concrete. A full curved skating route is not modeled.

## Implementation and checks

`packages/animations/src/sets/carlsbad/` owns the layout, baked scenery,
terrain tests and cameras. The registry and renderer use the same physical
surfaces and the existing foot-to-stage scale. The upper courtyard stays
open along the approach. The grass descends into a wall whose toe bows out
beside the stairs and curves toward the classroom side. Yellow safety
strips wrap the stair noses; both tubular rails have rounded ends and curled
lower returns. The roof, doors and window frames are modeled geometry.

The uphill surface participates in landing and rollout physics: the board
settles onto its grade and loses speed. The side rails are scenery; this
version offers the grass gap as the playable line. Both explorers retain
the existing tricks, rider stances, outcomes, share URLs and video export.

Tests check eleven drawn risers, rendering/physical-surface agreement,
toe curvature, stage scaling, uphill wheel contact and deceleration across
all four trick stances and both rider stances, finite geometry and mobile
vertex/shadow limits, and framing from all three tripods and the crane in
portrait and landscape. The shared classic-spot clearance sweep also
includes Carlsbad. Browser checks cover the real 3D canvas in both explorers.
