# Hollywood High 16 reference notes

The recreation depicts the classic open sixteen-stair on the south end of the
Hollywood High auditorium walkway. Research and image inspection: October 5,
2026. It is an architectural interpretation at El Toro's 29 world units per foot,
not a measured survey or a claim about present-day access.

## Sources and image checks

- [Ryan Ferguson, Sacred Skate Spots](https://ryanferguson.co.uk/blogs/blog/sacred-skate-spots-skateboarding-world): the user's starting reference confirms the sixteen-stair and central handrail.
- [Skate Seeker, Hollywood High 16 Stair and Handrail](https://skateseeker.com/spots/Hollywood-High-16-Stair-and-Handrail), [inspected photograph](https://d2r14unw8dk37p.cloudfront.net/spots/34/images/05a419ba-bfad-4670-a60b-83d342a53236.jpg): overhead three-quarter photograph shows the single round central bar, three supports, taped lower posts, parking-side cheek and rail, upper square wire fence, lower dark picket fence and adjoining parking area.
- [Ranker, Best Skate Spots in Los Angeles](https://www.ranker.com/list/best-skate-spots-in-los-angeles/krak), [inspected straight-on photograph](https://imgix.ranker.com/user_node_img/50034/1000667593/original/hollywood-high-school-photo-u1): verified the actual sixteen-riser count, brick school on the left when looking up, wall-mounted school-side rail, weathered nosings, concrete cheek on the opposite side, tree cover and billboard skyline.
- [Steve Emig, Skate/BMX History of Hollywood High School](https://steveemigthewhitebear.substack.com/p/skatebmx-history-of-hollywood-high): identifies the sixteen as the south-facing flight and the separate twelve as north-facing; describes the auditorium mural. Used to avoid treating pictures of the twelve as the sixteen.
- [Our BMX, That Spot's History: Hollywood High 16](https://ourbmx.com/odi-bmx-hollywood-high-16-stair-that-spots-history-ep-04/): independent spot identification and rail-history reference.
- [Jenkem, Let's Measure These Legendary Spots](https://www.jenkemmag.com/home/2017/05/19/lets-measure-legendary-spots/): requests field measurements for Hollywood High; it does **not** publish a surveyed dimension for it. No exact measurement was invented from this article.
- [SLAP, Famous Gaps Comparison](https://www.slapmagazine.com/index.php?topic=95350.0): community estimate places the horizontal run near fourteen feet, with disagreement about the vertical drop. Useful only as a scale cross-check, never treated as a verified measurement.

The [FindSkateSpots photograph](https://images.findskatespots.com/images/large/da4517d64b26c11c83b1c5d97989e1de.jpg)
was also inspected. It shows the opposite **twelve-stair**, with the school on the
right while looking up, and was used only for shared brickwork, cornice and rail
details. It did not determine the sixteen's shape or orientation.

## Dimensions and confidence

| Feature | Modeled value | Evidence |
| --- | --- | --- |
| Stair count | 16 risers / 15 treads | Verified in photographs and independent spot references |
| Vertical drop | 8 ft / 2.44 m | Visual estimate; no reliable field survey found |
| Lip to last riser | 14 ft / 4.27 m | Photo-based estimate, consistent with community map estimate |
| Clear flight width | 16 ft / 4.88 m | Photo-based estimate |
| Riser / tread | 6 in / 11.2 in | Derived from the estimated drop/run above |
| Center rail height | 36 in over nosing line | Photo-based estimate |
| Center rail diameter | About 1.82 in | Photo-based estimate |
| Center rail start / end | 1 ft before lip / 0.35 ft before last riser | Photo-based estimate; straight rail ends on vertical posts |
| School, trees, cars, street and signs | Approximate contextual placement | Image-derived composition, not cadastral measurements |

The center rail and both side rails are real observed features. The center has
no middle horizontal bar. The school-side rail is supported by wall brackets;
the parking-side rail is supported above a low concrete cheek. Open fence mesh
is confined to the side of the run-up, with no fictitious fence across the trick
line. The auditorium mural is simplified painted geometry, not a photographic
copy or an exact portrait reproduction. Cars and billboards convey the observed
parking/street context and are deliberately unbranded.

Only the center rail is suitable for the available unconstrained grind motions.
The school-side pipe is about five inches from the masonry, and the parking-side
pipe passes close to the exterior fence. They remain visible architectural
features rather than playable rails: a sideways board cannot fit safely between
these obstacles without clipping. Their observed placement is not widened to
make otherwise incompatible animations fit.

## Coordinate and rendering contract

`x = 0` is the takeoff lip, `y = 0` the top landing; travel is positive `x`.
The final riser is at `x = 406`, lower ground is `y = -232`. The center rail is
at `z = 0`, school at positive `z`, parking at negative `z`, and default trick
line is `z = -116`. Both rider stances use this same scene.

The builder uses two merged `Bake` geometries and the shared classic-spot sky,
weathered materials, rider-shadow projection and analytical prop shadows.
Mortar, nosing wear, street joints, signs, brackets, fence wire, foliage and palm
fronds are actual geometry without runtime image downloads or billboard trees.
