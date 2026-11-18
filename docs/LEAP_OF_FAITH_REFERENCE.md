# Leap of Faith reference notes

Researched and visually checked October 7, 2026; made realistic November 14, 2026 (see "Realism pass"). This set depicts the original
1997 gap at Point Loma High School, San Diego, using the sets'
scale of 29 units per foot (`SET_FOOT`). It is a photo-guided reconstruction, not a
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
| Landing from facade | 22 ft outward | Animation route estimate, set so the roll-in speed matches the other gaps; not a historical distance claim |

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
the walkway corner and lands 22 ft out, in the open courtyard clear of the
undercroft's tables. Both stances share the same route and terrain. The roll-in
speed is whatever carries the board from the pop to that landing over the
flight, so the landing sets it: at 11 ft out the rider crept in at 11 ft/s and
the rail's pop read as a slow, four-foot hop (user feedback, Nov 16). At 22 ft
out it is about 20–22 ft/s, as fast as El Toro or Emage. The ballistic pop is
the same for every style and set per trick (`LEAP_OF_FAITH_POPS`, the terrain's
`trickPop`, the pattern of Hollywood's fence): 1.2 (2.4 ft of deck rise) for
tricks whose board stays lined up down the line (`boardSweep` in
`motion/trick.ts`, read off each trick's own row), 1.65 for those that turn the
board across it and swing its ends out over the rail, and 2.4 for an
impossible, whose free end wraps down past the sole. Each is the lowest that
keeps wheels, deck and feet 0.2 ft clear of the rail for every trick base in
every stance. The rail is crossed near its top corner, still about two feet
over the walkway, so the pop can't go much lower at any speed. Popping right at the center pipe's top
end instead lands the rider's legs on that pipe. This is a playable trick-clearance choice, not a measurement of
Thomas's ollie. The rail remains scenery rather than a selectable grind.

The builder is split as the other realistic spots are (`leapOfFaithGeometry`, `Buildings`, `Court`, `Kit`,
`Palette`, `Trees`, `Wear`) and draws through the shared look (`ClassicSpot3D` with `LEAP_OF_FAITH_LOOK`):
ground, props and a decals layer, with the rail's diamond mesh drawn per pixel. Surface raycasts check the
stair floors and courtyard, and motion tests check wheel/deck/foot clearance over the walkway rail and the
stair's bay-side rail (`leapOfFaithGuardTop`) in all four trick stances with regular/goofy riders and low/high
styles. Camera tests follow the complete deep drop, check the actual head crown and board at the exact pop, and
raycast against the scenery for pier occlusion. `leapOfFaithGeometry.test.ts` holds the vertex and shader
budgets and the keep-clear volumes round the rider's line and the filmers' stands.

## Realism pass, November 14, 2026

Era: the original gap, **1997-98**, before the elevator (present by August 2007).

### Further references inspected

- [Jenkem, "Revisiting the Leap of Faith" video](https://www.youtube.com/watch?v=kCW7o0QFEJ4): archival
  pre-elevator footage (0:57, 1:03, 2:30, 2:34, including Richard King's 1998 attempt) and the 2023 visit
  (3:38 onward) for the enclosure, upper levels and materials.
- [Brittain detail, Jenkem](https://cdn.jenkemmag.com/mediaAssetsMaster/2023/01/LOF-OG1.jpg): wall finish,
  weep holes, mesh, upper pier, conduit, plank tables.
- [Flickr, August 20, 2007](https://www.flickr.com/photos/rotophoto/1186630942): the elevator already built.
- Google and Esri Wayback aerials at 32.740276, -117.226090 (viewed November 14, 2026), for orientation and
  the surrounding blocks. No 1990s aerial was found.

### What the aerial and footage settled

- **The gap faces north-west** (about 306°) onto a small lower court, not onto the big central court. The
  stair and the later elevator sit in the notch between the long wing and the block north of it; from the
  head of the stairs the street (Chatsworth Blvd) is straight ahead. In the scene's axes +x is about 306°,
  +z about 036°. The rider travels roughly due west.
- **Behind the rail there is no classroom wall.** The walkway is a breezeway on the lip of the upper terrace
  (the central court, at walkway level): sky and trees show through it in the 1997-98 frames.
- **Over the walkway is a second gallery**, a weathered concrete deck on exposed joists with a pipe rail,
  not a roof.
- **The walls, fascia and lower columns were painted pale sky blue**: the 1998 footage shows blue walls beside
  an off-white undercroft back wall in the same frame. The 1997 photograph overexposes them to blue-white.
  The lower court's paving was a warm red-brown tan.

### Estimates added (none surveyed)

| Feature | Model | Basis |
| --- | --- | --- |
| Fascia under the walkway | 3 ft deep | 2.9 ft of the 14.3 ft drop in two archival frames |
| Undercroft | 14 ft deep, opening about 11.3 ft tall | Tables against the back wall; later frontal view |
| Lower columns | 10 in square, about every 17 ft | One column in the archival frames; spacing assumed |
| Gallery deck | Soffit 12 ft over the walkway, edge beam 1.6 ft | Archival frames; height kept from the first model |
| Tall wall behind the stairs | Level top 2.5 ft over the walkway, hedge on it | Archival frames |
| Left block | Cream lower storey with a door, white ribbed siding above | Archival frames, top left |
| Right wing | Face 56 ft right of the stair corner | Aerial reads about 41 ft; see below |
| Perimeter wall, street | Wall 85 ft out, street beyond | Later photograph from the stair head; aerial |

### Known differences from the real place

- **The stair plan is the user's correction of October 8** (two 90° turns). Today's aerial shows the long
  flight about 40° off the facade line; the stairs may also have been rebuilt with the elevator. Not changed.
- **The right wing stands about 15 ft further right than measured**, so the filmers' stands and the modelled
  walkway's end stay clear.
- The four upper piers are single piers where the footage shows slim pairs; their positions are tuned to the
  cameras.
- The right wing, the far terrace block, the houses across the street and all planting positions are plain
  stand-ins: no 1990s aerial or four-way coverage exists to place them.
- Step counts, stair width, rail height and the 12 ft soffit remain the earlier estimates.
- Left out on purpose: the elevator tower and bridge, modern red tables, gates and guardrails, any school name,
  signage or artwork.
