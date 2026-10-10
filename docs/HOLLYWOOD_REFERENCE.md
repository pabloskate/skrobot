# Hollywood High 16 reference notes

The recreation depicts the classic open sixteen-stair on the south end of the
Hollywood High auditorium walkway. Research and image inspection: October 5,
2026. It is an architectural interpretation at El Toro's 29 world units per foot,
not a measured survey or a claim about present-day access.

## Sources and image checks

- [Ryan Ferguson, Sacred Skate Spots](https://ryanferguson.co.uk/blogs/blog/sacred-skate-spots-skateboarding-world): the user's starting reference confirms the sixteen-stair and central handrail.
- [Skate Seeker, Hollywood High 16 Stair and Handrail](https://skateseeker.com/spots/Hollywood-High-16-Stair-and-Handrail), [inspected photograph](https://d2r14unw8dk37p.cloudfront.net/spots/34/images/05a419ba-bfad-4670-a60b-83d342a53236.jpg): overhead three-quarter photograph shows the single round central bar, three supports, taped lower posts, street-side cheek and rail, upper square wire fence, lower dark picket fence and the paved area beyond it (first read as parking; the fence clip below shows a sidewalk and a road).
- [Ranker, Best Skate Spots in Los Angeles](https://www.ranker.com/list/best-skate-spots-in-los-angeles/krak), [inspected straight-on photograph](https://imgix.ranker.com/user_node_img/50034/1000667593/original/hollywood-high-school-photo-u1): verified the actual sixteen-riser count, brick school on the left when looking up, wall-mounted school-side rail, weathered nosings, concrete cheek on the opposite side, tree cover and billboard skyline.
- [Steve Emig, Skate/BMX History of Hollywood High School](https://steveemigthewhitebear.substack.com/p/skatebmx-history-of-hollywood-high): identifies the sixteen as the south-facing flight and the separate twelve as north-facing; describes the auditorium mural. Used to avoid treating pictures of the twelve as the sixteen.
- [Our BMX, That Spot's History: Hollywood High 16](https://ourbmx.com/odi-bmx-hollywood-high-16-stair-that-spots-history-ep-04/): independent spot identification and rail-history reference.
- [Jenkem, Let's Measure These Legendary Spots](https://www.jenkemmag.com/home/2017/05/19/lets-measure-legendary-spots/): requests field measurements for Hollywood High; it does **not** publish a surveyed dimension for it. No exact measurement was invented from this article.
- [SLAP, Famous Gaps Comparison](https://www.slapmagazine.com/index.php?topic=95350.0): community estimate places the horizontal run near fourteen feet, with disagreement about the vertical drop. Useful only as a scale cross-check, never treated as a verified measurement.
- [Ryan Decenzo, Frontside Flip over Hollywood High 16's Fence](https://www.youtube.com/watch?v=6Nxr-IsAlhY) (the user's reference, October 6, 2026): the fence gap. The rider rolls across the top landing at an angle toward the street, pops near the lip, clears the street-side handrail a few steps down and the black picket fence, and lands on the wide sidewalk between the fence and the road. Beyond the sidewalk is a multi-lane street with moving traffic, not a parking lot.

The [FindSkateSpots photograph](https://images.findskatespots.com/images/large/da4517d64b26c11c83b1c5d97989e1de.jpg)
was also inspected. It shows the opposite **twelve-stair**, with the school on the
right while looking up, and was used only for shared brickwork, cornice and rail
details. It did not determine the sixteen's shape or orientation.

## Dimensions and confidence

| Feature | Modeled value | Evidence |
| --- | --- | --- |
| Stair count | 16 risers / 15 treads | Verified in photographs and independent spot references |
| Vertical drop | 8 ft / 2.44 m | Visual estimate; no reliable field survey found |
| Lip to last riser | 16 ft / 4.88 m | Photo-based estimate, lengthened from 14 ft at the user's request (October 6, 2026): the set is longer than the community map estimate |
| Clear flight width | 16 ft / 4.88 m | Photo-based estimate |
| Riser / tread | 6 in / 12.8 in | Derived from the estimated drop/run above |
| Center rail height | 36 in over nosing line | Photo-based estimate |
| Center rail diameter | About 1.82 in | Photo-based estimate |
| Center rail start / end | 1 ft before lip / 0.35 ft before last riser | Photo-based estimate; straight rail ends on vertical posts |
| Picket fence | 7.25 ft over the sidewalk, spear tips ~3 in higher | Raised half a foot from the first estimate at the user's request (October 6, 2026), so it reads as an obstacle |
| Sidewalk past the fence | 14 ft to the curb | Video-based estimate ("a big sidewalk") |
| Street | Four 11 ft lanes, curbs 6 in high | Contextual; lane count and widths are typical, not measured |
| School, trees, cars and signs | Approximate contextual placement | Image-derived composition, not cadastral measurements |

The center rail and both side rails are real observed features. The center has
no middle horizontal bar. The school-side rail is supported by wall brackets;
the street-side rail is supported above a low concrete cheek. Open fence mesh
is confined to the side of the run-up, with no fictitious fence across the trick
line. The auditorium mural is simplified painted geometry, not a photographic
copy or an exact portrait reproduction. Cars and billboards convey the observed
street context and are deliberately unbranded. The cars drive their lanes (near
side down the stairs' way, far side back, one speed per lane) on the attempt's
clock, so scrubbing and video export see the same traffic.

Only the center rail is suitable for the available unconstrained grind motions.
The school-side pipe is about five inches from the masonry, and the street-side
pipe passes close to the exterior fence. They remain visible architectural
features rather than playable rails: a sideways board cannot fit safely between
these obstacles without clipping. Their observed placement is not widened to
make otherwise incompatible animations fit.

## Over the fence

The explorer's Obstacle picker (`obstacle=fence`) sends a flatground trick over
the street-side rail and the picket fence instead of down the steps
(`HOLLYWOOD_FENCE_TERRAIN`). The line is straight and angled 32° toward the
street: never more than 45° off the stairs, because the run-up is a walkway
along them and the gap is out and down, not sideways. It pops at the lip three
feet street-side of the center rail's first post, passes over the side rail a
few steps down where it has dropped to the run-up's level, and lands about seven
feet past the fence after a 24 ft flight (about 19 ft/s). A landed rider carves
back to riding along the sidewalk; a fall slides on along the line.

The fence takes a real pop whoever rides it: the terrain's `pop` (1.4, a 2.8 ft
ollie) is the least pop used for the arc, while each rider's own trick motion
is unchanged. Spinning boards sweep their ends back over the fence late in the
flight, which is what set the flight length and that pop (lines were scored
against every trick; `hollywoodFence.test.ts` guards the clearances). The
crane stays at the run-up's height and tilts down after the rider (up to 40°)
rather than sinking behind the pickets, as the filmer at the top does; the
fence has its own tripods.

## Coordinate and rendering contract

`x = 0` is the takeoff lip, `y = 0` the top landing; travel is positive `x`.
The final riser is at `x = 464`, lower ground is `y = -232`. The center rail is
at `z = 0`, school at positive `z`, the street at negative `z` (fence at
`z = -259.55`, near curb at `z = -667`), and the default trick line down the
steps is `z = -116`. Both rider stances use this same scene.

The builder uses two merged `Bake` geometries and the shared classic-spot sky,
weathered materials, rider-shadow projection and analytical prop shadows.
Mortar, nosing wear, street joints, signs, brackets, fence wire, foliage and palm
fronds are actual geometry without runtime image downloads or billboard trees.

Lived-in detail is contextual, not observed one-for-one: tinted run-up slabs and
their joints, gum, stains, hairline cracks, black board scuffs at the lip and
powerslide marks on the landing; buffed-out graffiti, downspouts, a utility
panel and a security light on the school; form joints, drips and weep holes on
the cheek's street face; square fence posts; and on Highland, cobra-head
streetlights, a hydrant with red curb, parking and school-zone signs, a trash
can, a signal cabinet, a storm drain, a corner signal with a continental
crosswalk, oil-stained lanes, trench patches, tar-sealed cracks, manholes and
gutter leaves. Across the road the shops have glass, doors, awnings, sign bands
of abstract lettering and rooftop units, the billboards abstract art, catwalks
and lamps, with hazy mid-rises behind. A Streamline classroom wing continues
the campus down the block, set back behind a hedge clear of the landing.
Furniture stays out of the fence line's touchdown and ride away and away from
the tripods.
