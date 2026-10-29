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

The locally downloaded originals, selected video frames and their direct
source URLs are retained in `output/reference/emage/`, with an archive at
`output/reference/emage-references.zip`. They are ignored research files,
not game textures or assets included in the application bundle.

## Visual observations

The walking lane has **twenty risers**, created by alternating broad
concrete terraces with narrow reddish sandstone half-steps. It should not
look like twenty identical treads stretching across the entire hillside.
Ten broad terrace levels extend inland from the narrow walking lane;
their beds contain gray gravel, patchy weeds and weathered joints.
Small horizontal rectangular lights are inset in the concrete risers,
immediately inland of the narrow lane. Some pale rectangular repairs
appear in the wider concrete faces.

Looking **downhill**, the handrail is on the **right**, at the river edge
of the walking lane. Looking uphill from the landing, it is on the left.
There is no middle handrail and no matching stair rail across the broad
terraces. The long descending rail has sparse vertical supports and a
straight cut lower end. At the top it joins a rounded, slightly drooping
horizontal continuation beside a long bench. The finish reads as worn
gray metal in daylight and dark gray in the evening photographs; the
imagery does not establish an exact measured cross-section or diameter.

The upper run-up is an open reddish paved plaza. Gray and cream apartment
facades with dark window frames, small balconies and pitched roof details
stand behind it. The lower landing meets a jointed reddish/tan riverside
path running across the foot of the stairs, perpendicular to descent.
Shrubs, trees, exposed soil, rocks and the river lie beyond the rail side.
The nearby white cable-stayed bridge, dark picket guards and concrete
river pier are important context. Its position and the background
buildings are visual approximations rather than a full neighborhood map.

## Geometry and confidence

No original survey, tape measurement or reliably dimensioned drawing for
the stair and rail was found. The following dimensions are explicit
photo-based modeling estimates in `emageLayout.ts`:

| Component | Model estimate |
| --- | --- |
| Walking stair count | 20 risers, supported by photographs and the spot name |
| Upper plaza to lower path | 10 ft down, approximately 6 in per riser |
| Stair run | 22 ft across, 19 treads between the 20 risers |
| Inset walking lane | Two red sandstone blocks side by side, about 6 ft across |
| Paved terrace treads | About 4 ft inland of the stones, then the gravel beds |
| Broad terraces | 10 paired levels extending about 40 ft inland |
| Descending rail height | About 3 ft above the stair pitch line |
| Lower rail end | Straight cut, near the bottom of the stair run |
| River trail at the foot | About 22 ft across, then a 6 ft dirt shoulder |
| Brush shelf | About 11 ft, easing about 1.5 ft down |
| Bank to the water | About 14 ft of bank; the water about 7 ft below the trail, some 47 ft past the last stair |

The shared scene coordinates run downhill along `+x`, toward the river,
with the walking lane on `z = 0`, the rail and planted bank on positive
`z` and the terraces on negative `z`. The South Platte crosses ahead of
the landing; the Platte River Bridge spans it to the side of the stairs,
and the brick apartments stand uphill behind the plaza. Rail diameter,
post spacing, bench length, paving extents, bank grades, bridge placement
and building details remain estimates. These choices preserve the
recognizable relationships in the references without claiming a measured
architectural reconstruction.

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
