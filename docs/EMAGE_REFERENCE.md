# Emage 20 Stair reference

The scene reconstructs the riverside Emage 20 stair and its side handrail
in Denver, Colorado. The name comes from the nearby Emage shop; these are
the amphitheater stairs beside the South Platte River, not storefront
entrance stairs. Both the stair gap and the descending side rail are
playable lines.

## Sources inspected

- [FindSkateSpots: Emage 20 Stair / Rail](https://findskatespots.com/spots/denver-co/1620-platte-street-emage-20-stair-rail).
  All seven original 1200 × 800 listing photographs were downloaded and
  visually inspected. Together they establish the inset walking lane,
  broad concrete terraces, reddish half-treads, step lights, rail ends,
  upper plaza, bench, river path, vegetation and nearby bridge. The listing
  uses **1620 Platte Street**, the shop address, as its location reference;
  this is not a surveyed coordinate for the stair itself.
- [Eric's Tech World: Searching for an Iconic Denver Skate Spot](https://www.youtube.com/watch?v=UVuucmV1wDE),
  published December 23, 2022. The actual video was downloaded and frames
  inspected between 4:35 and 6:40: the bridge walk, lower stair overview,
  broad terraces, perpendicular lower path, upper approach and montage of
  tricks down the stairs and rail. A clear front view around 6:30 shows
  how the small sandstone half-treads alternate with the concrete risers.
- [ASCE: Inspection and Rating of the Platte River Bridge in Denver](https://ascelibrary.org/doi/10.1061/9780784412640.002),
  Rui Liu and Kevin L. Rens, 2013. Its abstract identifies the cable-stayed
  pedestrian bridge over the South Platte between Commons Park and Commons
  West Apartments on the former 16th Street alignment. This corroborates
  the setting; it does **not** provide stair dimensions. The white
  cable-stayed bridge in the photographs is the **Platte River Bridge**.
  Highland Bridge crosses I-25 nearby and is a different structure.

- [Kickflip down Emage (YouTube Short)](https://www.youtube.com/shorts/nFLw9HS8wHs).
  Downloaded and inspected frame by frame. It is the clearest view of the
  landing: a kickflip lands on the river trail at the foot of the stairs,
  and within a couple of seconds the rider is off the board and running
  into the brush on the river side. It also shows how wide the red
  sandstone half-steps are compared with a rider, the gravel terraces
  beside them, and the brick apartments uphill.

A second research pass (November 2026) added 51 images: Google and Esri
aerials of the stair, plaza and river; the 2015 bridge photo survey at
[johnweeks.com](http://www.johnweeks.com/cablestay/pages/ped16.html)
(form of the deck, masts, stays, piers and abutment; its dimensions are
the photographer's own estimates); frames of a June 2017 contest edit and
of archive clips in the 2022 walkthrough; and a user panorama from the
rocks below the bridge. They are scratch research files, kept out of the
repository.

The locally downloaded originals, selected video frames and their direct
source URLs are retained in `output/reference/emage/`, with an archive at
`output/reference/emage-references.zip`. They are ignored research files,
not game textures or assets included in the application bundle.

## Era

The scene shows the place as it stood about 2021 to 2022, in leaf: the
apartments in their repainted pale grey and charcoal scheme (earlier
footage shows them warm red-tan), the terrace beds gone to gravel and dry
weeds, the bank brush still green. The 2022 walkthrough was filmed
leafless in late autumn; its buildings and paving are used with the
listing photographs' foliage, because the game's trees are all in leaf.
There is no writing, signage, graffiti or artwork in the scene.

## Visual observations

The walking lane has **twenty risers**, created by alternating broad
concrete terraces with narrow reddish sandstone half-steps. Ten terrace
levels extend inland from the lane; each is a concrete curb with a gravel
bed behind it, weeds along the back of the bed, and a small recessed light
in the riser beside the lane. A few stones have been replaced in pale
concrete.

Looking **downhill**, the handrail is on the **right**, at the river edge
of the walking lane. Looking uphill from the landing, it is on the left.
There is no middle handrail. At the top the rail joins a rounded, slightly
drooping galvanised guard beside a long bench, hard against the mouth of
the bridge.

The stairs descend about 110 degrees true (east-south-east), measured on a
north-up aerial. Read from the same aerials:

- **Apartments.** Two four-storey buildings flank a paved corridor on the
  old 16th Street line, which meets the plaza at an angle. The south
  building's nearest corner is about 62 ft back and 73 ft to the rail side;
  its plaza face runs about 30 degrees off the stairs' line and closes the
  view straight up the stairs some 190 ft back. The north building's corner
  is about 45 ft back and 62 ft to the terrace side, its river face running
  along the trail.
- **Bridge.** The Platte River Bridge leaves the plaza beside the bench and
  runs about 22 degrees to the right of the stairs' line, some 230 ft to
  the far bank, with two white tusk-shaped masts on tapered piers at
  mid-river and a sandstone retaining wall at its west abutment.
- **Weir.** A line of stacked boulders crosses the river about 25 ft
  downstream of the bridge, a calm pool above it and white water below,
  straight ahead of the stairs.
- **Plaza and trail.** The plaza is dusty red-tan concrete in panels with
  long curved score lines and a curved band of dark pavers where it meets
  the corridor. The foot of the stairs is a buff concrete apron that
  narrows to a trail about 10 ft wide either way, with dry-grass verges.
- **Planting.** A willow thicket covers the bank beside the rail and the
  river bank; cottonwoods stand along the river and in Commons Park
  across it. Downtown lies ahead and to the right.

## Geometry and confidence

No original survey, tape measurement or reliably dimensioned drawing for
the stair and rail was found. The following dimensions are explicit
photo-based modeling estimates in `emageLayout.ts`; the second research
pass's aerial and photo estimates (riser 5.5 to 6.3 in, run 18 to 23 ft,
lane 5.2 to 6.2 ft, rail 33 to 37 in over the nosings) bracket them:

| Component | Model estimate |
| --- | --- |
| Walking stair count | 20 risers, supported by photographs and the spot name |
| Upper plaza to lower path | 10 ft down, approximately 6 in per riser |
| Stair run | 22 ft across, 19 treads between the 20 risers |
| Inset walking lane | Two red sandstone blocks side by side, about 6 ft across |
| Paved terrace treads | About 4 ft inland of the stones, then the gravel beds |
| Broad terraces | 10 paired levels extending about 35 ft inland of the lane (aerial: 31 to 40 ft) |
| Descending rail height | About 3 ft above the stair pitch line |
| Lower rail end | Straight cut, near the bottom of the stair run |
| River trail at the foot | About 22 ft across, then a 6 ft dirt shoulder |
| Brush shelf | About 11 ft, easing about 1.5 ft down |
| Bank to the water | About 14 ft of bank; the water about 7 ft below the trail, some 47 ft past the last stair |

The shared scene coordinates run downhill along `+x`, toward the river,
with the walking lane on `z = 0`, the rail, bridge and south building on
positive `z` and the terraces and north building on negative `z`.
Positions of the buildings, bridge and weir are good to about 10 ft and
their angles to about 5 degrees. Rail diameter, post spacing, bench
length, building bay sizes, bank grades and the skyline remain estimates.

## Known differences from the place

- The bridge mouth is drawn about 8 ft further from the stairs than the
  aerial suggests, because the bench and guard, which the roll-in tests
  protect, stand between them.
- The thicket in front of the side filmer is kept under about 2.5 ft so
  the rail can be filmed across it; the real one is head-high.
- The river is drawn square to the stairs; the real channel is skewed
  some 15 to 20 degrees.
- The trees are the game's eucalyptus and ornamental models standing in
  for cottonwood and willow.
- The far bank and skyline are generic massing.

## Implementation

`Emage3D` draws through the shared realistic look (`EMAGE_LOOK` in
`emage3d.ts`): per-pixel daylight, shadow boxes, contact lines, tree
dapple, a decals layer, per-pixel riser weathering (`walls`), gravel from
the asphalt aggregate, the plaza's panels from `pavers`, urethane marks,
and the glass surface laid level for the river. The set is split into
`emageGeometry.ts` (stairs, terraces, plaza, trail, handrail),
`emageRiver.ts`, `emageBuildings.ts` (apartments, bridge, skyline),
`emageTrees.ts`, `emageWear.ts`, `emageKit.ts` and `emagePalette.ts`.
`emageGeometry.test.ts` holds the budgets: under 100,000 baked vertices,
at most 12 shadow boxes, 48 rail segments, and the look's contact and
canopy limits.

The stair-gap landing and rail approach/exit use the shared animation
system. The side rail is an actual selectable grind obstacle; the upper
bench guard, bridge guards and broad terrace edges are scenery.

## Landing with nowhere to roll

There is no ride-away: the trail gives a landing about half a second of
riding, not room to roll it out, and the river is just past it. `EMAGE_TERRAIN.runout` and `EMAGE_RAIL.runout`
mark the trail's far edge. A made gap or grind is ridden a moment to
absorb the landing, then the rider hops off beside the board before that
edge (`motion/fall/stepOff.ts`). From the hop on, the kick-out physics
runs the rider out on their feet and lets the board roll away. The shelf
and bank carry brush (`emageBrush`) that drags on the rider and the
board, so both stop in the brush on the shelf, about 34 to 37 ft past the
last stair and short of the water, as in the short. The brush straight
ahead is knee-high scrub so the rider stays in view wading into it.
