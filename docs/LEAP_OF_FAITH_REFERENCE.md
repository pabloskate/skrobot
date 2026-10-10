# Leap of Faith reference notes

Researched and visually checked October 7, 2026. This set depicts the original
1997 gap at Point Loma High School, San Diego, using the existing animation
scale of 29 world units per foot. It is a photo-guided reconstruction, not a
survey of the school or its present-day configuration.

## References actually inspected

- [10VSM, Top 10 BIGGEST Gaps in Skateboarding](https://www.youtube.com/watch?v=EcjroC-Hl8U&t=427s), supplied by the user. Inspected frames at 7:14, 7:17, 7:23, 7:27 and 7:33 in the browser. The requested 7:07–7:28 passage introduces the spot, shows archival footage and the later altered structure. At **7:33**, the comparison graphic explicitly reads **14.30 FEET**. The archival caption identifies Jamie Thomas, Zero's *Thrill of It All*, 1997. The stairs descend to the viewer's left; the open picnic-table bay is on the right.
- [J. Grant Brittain's original photograph](https://jgrantbrittainphotos.com/products/leap-of-faith-skateboarding-photograph-jamie-thomas-1997-skateboard-photo-30x36-sports-print), [inspected wide image](https://jgrantbrittainphotos.com/cdn/shop/products/il_fullxfull.618048701_14sg_800x.jpg?v=1484723296). Shows the short upper flight, high intermediate landing, pale retaining face, diamond-mesh rail, substantial roof piers, exposed beams, recessed lunch-table bay and small wall drain holes. Brittain identifies Point Loma and the 1997 attempt; his accompanying text calls it a 17-foot wall, illustrating the conflicting historical estimates.
- [Garage Days Collection, 1997 Leap of Faith poster](https://garagedayscollection.com/products/leap-of-faith-poster), [inspected sequence image](https://garagedayscollection.com/cdn/shop/files/leapposter_2334x.jpg?v=1702830574). The surrounding sequence clarifies the line: off the upper walkway, over the railing near the upper stair's end, out into the courtyard. It does not descend the whole stair length. The lunch tables sit away from the landing line.
- User-supplied close-ups clarify the faceted landing, center stair rail and architectural turn. The first implementation flattened this bend. The correction uses an actual plan-view turn of **approximately 40° toward negative x** at the intermediate landing, following the user’s explicit handedness correction. The upper flight, balcony and undercroft stay fixed.
- October 8, 2026 correction from the user's *Thrill of It All* frames and clip (Zero, 1997): the earlier plan was wrong at the top. The upper flight does **not** continue the walkway's line. The walkway rail runs along the facade; at its end the upper flight leaves it at **90°**, descending straight out toward the court (from the court its steps face the camera and rise away). The faceted landing then turns the long lower flight another 90°, back parallel to the facade. In the clip Thomas ollies at the head of the stairs, crosses the stair's bay-side rail near its top corner, passes the walkway's corner and lands in front of the left side of the undercroft. The 40° dogleg described above is superseded.
- [FindSkateSpots, Point Loma](https://findskatespots.com/spots/san-diego-ca/2324-chatsworth-boulevard-point-loma-high-school-gap-over-rail-leap-of-faith), [top view](https://images.findskatespots.com/images/large/9s30k3er4tv5yrp1ef433trzyxrvonjz.jpg), [oblique view](https://images.findskatespots.com/images/large/i495sbz252ehnficcqgp4zjh8ov6jgh0.jpg). These later images expose the separate upper/lower stair axes and polygonal landing. Their modern elevator enclosure is not included in the 1997 reconstruction.
- [Jenkem's 2023 retrospective](https://www.jenkemmag.com/home/2023/01/17/revisiting-the-leap-of-faith-the-most-famous-trick-never-landed/), [inspected Brittain detail](https://cdn.jenkemmag.com/mediaAssetsMaster/2023/01/Jamie_Thomas_Leap_Of_Faith_Jenkem_Grantbrittain_Doc.jpg). Confirms the historic attempt and that later alterations make the original gap unavailable. The archived mesh, open lower bay and covered upper walkway guide this recreation; the later elevator enclosure is omitted.

Reference photographs are linked for verification; they are not shipped as game
textures. No image search thumbnail alone determined the scene geometry.

## Dimensions and confidence

| Feature | Model | Confidence |
| --- | --- | --- |
| Upper walkway to courtyard | **14.3 ft / 4.35864 m** | User requirement, corroborated by the supplied video's 14.30-foot graphic; not independently surveyed |
| Upper stair / landing drop | About 5.30 ft | Derived from the estimated 10/17 split and uniform risers; the landing is about 9 ft above the court |
| Upper / lower steps | 10 / 17 | Provisional visual reconstruction, 27 in total; not a verified riser count |
| Upper / lower stair run | 9 / 16 ft | Estimated one-foot treads between uniform risers |
| Intermediate landing | Two straight facets turning about its inner corner (9 ft outer radius) | Plan-shape reconstruction, not a surveyed radius |
| Upper flight vs walkway rail | 90°, straight out toward the court | User correction, Oct 8, matching the archival wide shot |
| Lower-flight turn | 90° at the landing, back parallel to the facade, away from the walkway | Archival wide shot; not surveyed |
| Stair width | 9 ft | Visual estimate |
| Guardrail height | 3 ft over the nosing | Visual estimate |
| Roof above the upper walkway | 12 ft | Visual estimate |
| Recessed bay depth | 10 ft | Visual estimate |
| Landing from facade | 11 ft outward | Animation route estimate; not a historical distance claim |

The decimal **14.3 ft** is deliberately preserved. It is not converted to
14 feet 3 inches (14.25 ft), nor replaced by the larger figures often attached
to the spot. Roof spans, classroom bays, furniture spacing and minor weathering
are contextual estimates. Only the drop has user-specified measured precision.

## Scene and motion contract

`y = 0` is the upper walkway; the courtyard is `y = -414.7`. The walkway's
front guardrail is `x = 0`, running toward −z over the undercroft. The walkway
floor carries on to `z = +20 ft` behind the head of the stairs. The upper flight
occupies `0 ≤ z ≤ 9 ft` and descends toward +x, its bay-side rail along `z = 0`,
square to the walkway rail. Its polygonal landing turns the lower flight 90°
to descend toward +z, parallel to the facade at `9 ≤ x ≤ 18 ft`. The balcony
and recessed bays extend toward negative `z` and are not transformed. The whole
stair wing (flights, landing, retaining walls, mesh, center pipe) is authored
straight and carried through one piecewise plan transform,
`leapOfFaithStairPoint`; collision uses the same flights and landing polygon.
The geometry is authored in elevation coordinates and reflected once into this
world convention, including its shadow primitives. Rider stance never mirrors
the architecture.

The route rolls out across the head of the stairs and pops three feet behind
the top nosing, in line with the center pipe (4.5 ft in from the bay-side
rail), angled 35° toward the undercroft (user request, Oct 8). It crosses that
rail about 3.4 ft down the flight, where its top has dropped about 2 ft, passes
the walkway corner and lands 11 ft out, about 5.3 ft in front of the
undercroft. Both stances share the same route and terrain. The
minimum ballistic pop is 2.0 in the existing style units (lowered from 2.5 when
the user found the bot popped too high). It is the lowest value that keeps every
flipping, spinning and wrapping board 0.2 ft clear of the rail; at 1.8–1.9 some
fakie kickflips and impossibles clip. Popping right at the center pipe's top
end instead lands the rider's legs on that pipe. This is a playable trick-clearance choice, not a measurement of
Thomas's ollie. The rail remains scenery rather than a selectable grind.

The builder merges the stair/ground surfaces and architectural details into two
meshes. Rail mesh is actual diamond wire geometry. The facade, open bay, roof,
piers, rafters, tables, conduit and drain holes remain visible from different
angles. Surface raycasts check the stair floors and courtyard, and motion tests
check wheel/deck/foot clearance over the walkway rail and the stair's
bay-side rail (`leapOfFaithGuardTop`) in all four trick stances with regular/goofy
riders and low/high styles. Camera tests follow the complete deep drop, check the actual head crown and board at the exact pop, and raycast against the scenery for pier occlusion.
