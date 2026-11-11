# El Toro 20 visual reference

The 3D spot reconstructs the classic El Toro 20 at El Toro High School in Lake
Forest, California. The chosen appearance uses one center rail and straight sloping handrails
without horizontal end kick-outs, and omits the later yellow gate. The existing
twenty steps, height and length remain the foundation. The final width correction
uses two equal twelve-foot flights, with the handrail exactly halfway across;
this is an artistic proportion based on the references, not a surveyed width.

This is a photo-grounded artistic reconstruction, not a measured scan. Photos
from different years show changes in rails, landscaping and concrete finishes.
Use the classic appearance for the whole scene rather than combining every
feature visible in newer photographs.

## Confirmed layout corrections

The user's October 4 reference photo and clarification supersede the earlier
rail reconstruction: one center rail, no kinks at the ends, and the school and
locker frontage on the +z side, opposite the canopy and hedge bank.
The building, fence, lantern and its rear grove move together. The twenty risers,
nine-and-a-half-foot drop and twenty-foot run define the current model. The drop
was revised from nine feet at the user's request on October 7; it is a modeling
choice, not a newly surveyed measurement. The rider's line is six feet
left of the center rail when looking up the stairs, halfway across that flight.
The shape pass moves its downhill wall to u -18 while preserving the run-up facade and camera corridor.

The follow-up photos confirm two distinct structures: the locker building on
the left when looking up the stairs, and an open covered walkway on the right.
The right-hand structure has a low, broad roof, exposed projecting beams, a
dark soffit and square tan masonry columns. It belongs above the planted bank,
with open views between the supports rather than another solid building.

The spot has one fixed downhill direction. Fakie turns the board and the rider's
feet round so the rider rolls tail first down that same flight, the shoulders and
head turned back over the back shoulder to the stairs; choosing a stance never
mirrors the building, rails, landscape or camera.

The shape pass uses large slab joints on the pale landing apron and darker rollaway. The steps retain their existing worn lips and vertical streaks.

The 3D Explorer supports a full 360-degree orbit. Bottom center frames the middle
rail at a wider 0.6x default; Bottom right views the stairs from the planted-bank
side. Camera limits keep the eye clear of both roofs and above the uphill grade
without changing the lens as an attempt plays. The SVG comparison keeps its
original restricted viewing range.

## Grinds down the rails

Every flat-bar grind and slide, with any trick in or out, is offered at El Toro
and rides the center handrail by default, or a side rail (`rail=side` in the
explorer's link). The three rails are the same pipe (`EL_TORO_RAIL` in
`sets/elToro/stairs.ts`; where each stands is `rails` in `sets/sets.ts`; the
motion is the flat-bar grind in `motion/grind.ts` with a `Handrail`). A side
rail isn't picked by hand: it's the one the grind's approach puts on the
rider's far side, coming in from the steps. Every grind and slide is named
for the side facing the rail before the pop, boardslides included (frontside:
chest to the rail, toeside). Going down, a regular rider's frontside
boardslide takes the right rail, by the locker-side dirt bank, and a backside one the
left, by the bank; goofy, fakie, and spins into the
grind swap it as they swap the rider's toeside. A slip off a side rail falls
back onto the steps. The physics follows a real down rail rather than the
flat bar's:

- The skater rolls in beside the rail at about 13 ft/s, well under the speed it
  takes to jump the set, and pops a foot before the rail starts. They don't ollie
  to the rail's top end: carried along at speed, the rail falls away under the
  board, so a modest ollie (about 2 ft) gets the board over its line and it comes
  down onto it about five steps down (further with a trick in, which needs the
  hang time).
- The board waits beside the rail until its wheels are over the rail's line, then
  steps across and turns into the lock; the lock pose is the flat bar's, tipped
  with the rail, so slides sit across it and grinds along it.
- Down the rail it speeds up: gravity along the slope less a waxed rail's
  friction (trucks 0.2, a deck's wood 0.27). Exit speed is derived from the
  current rail slope and contact distance. The body leans down the rail, square
  to what it feels.
- It pops off the bottom already falling with the rail and lands on the bottom
  landing about seven feet past the last step. Fakie rides the same stairs
  backwards; a slip comes down on the steps and lies along their edges.

## Tripod angles

Besides the crane presets, three tripods stand still in the spot and pan with the
rider (`EL_TORO_FILMERS` in `sets/elToro/elToroLayout.ts`): crouched on the bottom
landing off the line, up the locker-side dirt bank, and at the top through the open gate frame, all on the rider's right. The viewer can stand any of them on the left
instead, their mirror image across the rider's line (`sets/tripods.ts`): the
bottom one nearer the center rail, the side one up the planted bank. Each has a
fixed lens, so the rider grows as they come closer and shrinks as they go.
Beyond the bottom landing the filmers look over the round lawn, rollaway and lower locker block.

## References

| Source | Observed details and limits |
| --- | --- |
| User-supplied photos, October 4: `Screenshot 2026-10-04 at 4.35.58 PM` and `4.35.54 PM` | Confirm the left-side school roof and the separate right-side open canopy. The latter establishes the exposed beam ends, deep fascia, masonry supports and open shaded circulation space. |
| [Classic frontal overview](https://cdn.prod.website-files.com/5de281f083c9d71142e46792/67c1b00fb163de221efde044_El-toro.png), reproduced by [Limitless Culture](https://www.limitlessculturex.com/post/what-will-website-be-like-in-100-years) | Tan masonry school building, blue locker banks, dark standing-seam hip roof, broad eaves, upper chain-link fence and tall campus lantern. Sparse shrubs expose the dirt slope; the stair edge has a plain concrete curb. This view lacks the center rail, so it is a surroundings reference rather than the selected rail layout. |
| [2017 rail close-up](https://img.redbull.com/images/q_auto%2Cf_auto/redbullcom/2017/12/27/efbb7fc0-ccad-4efd-80a8-a9e3b5700877/barandilla-el-toro-20-spot-skate-arriba), from the [Red Bull gallery](https://www.redbull.com/es-es/galleries/asi-es-el-toro-20-spot-skate) | Dull gray-green steel, a rubbed and darker rail crown, visible welded connections, dusty stair edges, twigs and rough shrub interiors. Concrete is mottled and spotted rather than uniformly cream. |
| [Ryan Decenzo photo, credited to Mikendo](https://x.com/ryandecenzo/status/652522180631220224) ([image](https://pbs.twimg.com/media/CQ45dzKWUAAfCLu.png)) | Older vegetation and campus context: irregular dense shrubs, tan masonry columns, deep canopy shade and blue railings. Its viewing direction differs from the frontal locker-building reference. |
| [Jaws at El Toro, Lowcard, November 2017](https://www.lowcardmag.com/news/jaws-vs-el-toro-20-stair/) ([frame](https://www.lowcardmag.com/images/2017/11/Screen-Shot-2017-11-01-at-11.55.22-AM.png)) | Pale worn stair lips and broad dark streaks on the risers, with bushes and covered campus space behind the stairs. Useful for material wear, not a substitute for the locker-side background. |
| [FindSkateSpots listing](https://findskatespots.com/spots/lake-forest-ca/ridge-route-drive-el-toro-20) ([modern frontal photo](https://images.findskatespots.com/images/large/ocld0pm5036yosrryjl0wz7wqfz0vaj8.jpg)) | Clear roof seams, soffit lights, blue lockers, lantern construction and fence. The yellow gate and bright newer stair-edge strips belong to the later appearance and are not part of the classic reconstruction. |

## Detail and asset approach

- Preserve the recognizable building silhouette: a dark hip roof with raised
  seams and broad shaded soffits above rough tan masonry and blue lockers.
- Break up flat surfaces with restrained concrete aggregate, worn edges and
  grime. Keep slab joints large and restrained. Rails need narrow rubbed highlights,
  joints and believable post attachments rather than mirror-like chrome.
- Use irregular dry soil, mulch, leaf litter and olive-green planting with
  visible gaps and twig interiors. Keep the rider and stair silhouette legible.
- Model campus fixtures such as the polygonal lantern, chain-link fence,
  recessed lights and locker hardware at a detail level appropriate to the
  scene's camera distance.

The shipped assets use procedural runtime materials and baked 3D props. Source
photographs are visual references only; they are not redistributed as textures
or bundled into the application. Reusable scene code belongs in
`packages/animations/src/sets/elToro/`: `elToroLayout.ts` owns layout and palette,
`elToroGeometry.ts` the stairs, landings, paving, banks, decals and contact lines,
`elToroCampus.ts` the shared block architecture, lower campus and fixtures,
`elToroBuilding.ts`, `elToroCanopy.ts`, `elToroLandscape.ts` and `elToroTrees.ts`
the other environment props, `elToroMaterials.ts` the shader, and `elToro3d.ts`
assembles the set with `EL_TORO_LOOK`.

## Validation checklist

Repeat these checks when changing the spot. The Contact sheet currently has no
El Toro selector; inspect the spot itself in the Explorer at the matching fixed
moments for each rider stance.

- [ ] Confirm twenty risers, a 9.5-foot drop and a twenty-foot run, the center rail
  bisects the stairs, and the rider stays on the left flight.
- [ ] Play regular and fakie approaches through takeoff, flight, landing and
  roll-away; verify the same downhill layout and camera, with fakie rolling tail
  first and looking down the stairs.
- [ ] Compare regular and goofy rider stances in the playground Contact sheet
  for the affected trick family, including the robot and realistic riders.
- [ ] Inspect cameras looking from the run-up and from the landing, plus the
  normal side view: check roof shape, fence transparency, rail connections,
  vegetation overlap and the rider's visibility.
- [ ] Inspect close and wide views for texture aliasing, floating props,
  incorrect shadow placement and sudden detail changes.
- [ ] Check the narrow mobile viewport and a desktop viewport for framing and
  rendering responsiveness.
- [ ] Run the animation package typecheck and applicable package invariants
  with `npm test`; inspect any failures before recording results.

## Historical validation before the realism and shape passes

- Final confidence pass (`npm run check`): lint, web/mobile/animation typechecks,
  60 test files / 558 tests, and production build passed. Environment geometry tests cover finite
  geometry, two merged scene meshes, fewer than 140,000 vertices, fixed layout
  across stances, straight single-center rails, school/canopy placement and disposal.
- Animation/package and playground typechecks, repository lint and Next production
  build passed.
- Explorer visually inspected at desktop and 390px mobile widths: regular robot
  run-up/landing, goofy rider, and fakie/human landing. No rendering errors appeared in those snapshots.
- Playground Contact sheet: Kickflip family, both rider stances, WebGL/SVG
  comparison; all 84 WebGL frames rendered. This checks the unchanged default
  plaza renderer, since the Contact sheet does not expose El Toro.
- Humanoid Contact sheet: all 84 frames across seven kickflip-family tricks and
  both rider stances rendered without failures. The robot uses 19 draws and
  54,572 triangles; its realistic skateboard uses five draws and 18,336 triangles.
  Body and board tests cover finite geometry, contact geometry, motion and disposal.
- Final mobile and desktop checks cover centered stairs, the left riding line,
  the right-hand canopy, continuous concrete without a grid, and the realistic rider's
  realistic board. Bottom-center framing, full-circle drag/keyboard input and
  shared camera links were checked in both Explorer routes.
- Browser viewport emulation is not a physical-device GPU performance benchmark.

The stance correction has focused tests for a fixed scene, backward rider heading,
board-local wheel spin and rigidly transformed frame axes, including 936 stair
clearance combinations across tricks, trick/rider stances and pop heights. Layout
tests pin the three rail locations, straight slopes, and school beyond the far rail.

## Realistic look port

El Toro is now a `ClassicSpot3D` with `EL_TORO_LOOK` (Carlsbad's midday plus its
own urethane marks). Its bespoke surface shader is gone. The ground bakes look
surfaces: concrete stairs with worn noses and gritty treads, soil on the bank and
in the bed (surface 20), and grass. The school's roof uses standing-seam roofing
(surface 21). Masonry and metal props are flat-baked and lit per pixel, and the
fence is a per-pixel diamond-mesh panel. The trees are street-prop gums, a
jacaranda and two ornamentals. Their dapple comes from the crowns whose shade
lands in view (`elToroTrees.ts`). Rails, `stairs.ts` and the rail registry are
unchanged.

## OG campus shape pass (1998–2001)

Coordinates below are feet: u downhill from the lip, z toward the locker side,
y above the top landing. The supplied site plan is an artistic reconstruction,
not a survey. Stair/rail geometry, physics, camera limits and filmer stands remain unchanged.

- The +z wall is removed. Exposed step ends meet dirt from z 18 to 125, with
  irregular olive shrub masses and a clear side-filmer corridor. The opposite
  flank has a 16-inch concrete band at z -7.3..-6, level returns and a small
  top corner curb. The canopy bank has two hedge rows, mulch, then grass.
- Block A: walls u -114..-18, z 844/29..125, height 11. A five-foot roof skirt
  surrounds the flat centre and HVAC boxes. The eave is 4.5 feet on three sides;
  the run-up face preserves the existing 38-unit EAVE (1.31 feet) for camera
  clearance. Four-tier locker bands wrap both visible faces; hardware is deferred.
- The locker walk reaches the fence at u -0.8, z 25..125. The seven-foot open
  gate frame spans z 19..25, leaving the top filmer in clear air. The lantern
  stands at u -2.5, z 26.5, 15 feet tall plus its cap.
- Canopy roof: u -114..4, z -88..-235/29. Twenty-four two-foot columns occupy
  u -4/-26/-48/-70/-92/-110 and z -13/-35/-57/-83. The open shelter has projecting
  beams, dark soffit/fascia and a terrace guardrail at u 0.5 with a six-foot return.
  Only six near columns receive shadow boxes; the remaining columns are real geometry.
- Pale apron u 20..48, z -6..40; bank-foot walk u 22..42, z 40..125; darker
  rollaway u 48..150, z -10..29. Block B is u 42..138, z 30..126 at y -9.5,
  with lockers on its two circulation faces and the same skirt roof as A.
- Lower grass strip u 20..34, z -88..-6, sidewalk u 34..42, and round lawn
  centred at (82,-32), radius 38, with segmented near seat-wall, trees and bins.
- Blocks G (-236..-140,35..131), D (-110..-10,-190..-100), E (60..150,-180..-95)
  and F (150..220,-60..10) enclose the campus. Distant plain wings at z 170..185,
  z -240..-225 and u 240..260 close lateral gaps behind an existing-model tree belt.
  The distant u wings leave z 10..29 open for the riding corridor.

Reference images remain outside the repository. Fine locker hardware, recessed
soffit lights, flowers, more natural shrub variation, localized stains and litter
are left for the dressing pass. No new assets or dependencies were added.

Shape-pass baked budget: 82,254 vertices (10,680 ground, 64,554 props, 7,020
 decals), plus six fence-panel vertices: 82,260 total. Twelve shadow boxes,
41 shadow rail segments (including the unchanged 24 handrail segments), four
contact entries, six dapple canopies; maximum fragment shader declaration is
185 uniform vectors. Existing tree models remain street props, not baked foliage
billboards. Other spots' shader and mesh hashes match the pipeline-port baseline.

## Dressing pass (surfaces, wear, planting, fixtures)

The finished spot as the cameras see it. Shapes and positions are the shape
pass's; only surfaces and small objects changed, plus three plain fixes noted
at the end. Feet, as above.

- **Look options.** `EL_TORO_LOOK` turns on five look features that only El
  Toro compiles (`SpotLook.stairs`, `gum`, `mortar`, `lockers`, `markDepth` in
  `sets/surfaces.ts`). With them unset the shared shader text is unchanged, so
  every other spot's shader and mesh hashes are the same. Board marks are half
  Carlsbad's depth; the haze is thinner (`from 60, to 1100, amount 0.42`).
- **Stairs.** Painted warm pale buff (`ET` palette). Each step has its own
  slight tone, drifting across it, with no step-to-step banding. Noses are
  rubbed paler where the flights are walked. The stair wear runs per pixel
  over the stair's own box:
  - risers carry mottled grey-brown blotches over their lower part, narrow runs
    off the nose that fade out, and a ragged foot band, all heavier under the
    rails;
  - arrises and noses are pale and chipped;
  - treads are dusty at the back and toward the ends, with grit specks and dry
    leaves in the inner corners and against the flanks;
  - step ends are dirty where they stand out of the bank.
- **Contact shade.** The 12 contact lines are every riser's foot, both flanks'
  step ends, the bank's and the band's feet, the corner curb, and the wall feet
  of blocks A, B, D, E, F and G.
- **Paving.** The apron (u 20..48, z -6..40) is laid in 10 x 11.5 ft slabs,
  each its own pour, with one darker replaced slab at u 30, z 17. The bank-foot
  walk and the older, darker rollaway paving each have their own slab grids,
  and the run-up walk has joints across and along it. Joints are decals: a fine
  dark groove fading into each slab's paint. On top of that:
  - cracks start at a joint or edge and stop inside one slab; the lower ones now
    sit on the slabs, not under them;
  - stains mark low corners;
  - a wash of dirt lies along the bank's foot, and dry leaves along it and the
    lawn edge;
  - the shader adds gum spots at about four per 100 sq ft.
- **Lockers.** Flat panels on surface 22, painted per pixel:
  - doors are a foot wide in five tiers of 9.5/8 ft, so both levels share the
    grid;
  - every door has a latch, a handle shadow and vent slots, with dark gaps
    between doors;
  - each door has its own tone and the odd one is a deeper blue, with chalky
    sun fade and a scuffed bottom tier.

  Each 12-door bank sits on a concrete base curb under a sheet-metal cap, with
  4 ft tan block piers between banks. Banks skip the classroom doors, which now
  have dark-brown frames.
- **Blocks.** Walls are coursed 8 x 16 in buff block, with mortar a touch
  greyer than the block. The eave is a tan soffit closed by a deep dark-brown
  fascia board. Recessed downlights run every 16 ft along the corridor eaves.
  The charcoal-brown seam skirt now rises 6.5 ft over 12. Block E keeps its
  stucco and red-tile edge.
- **Canopy.** Heavy dark glulam girders and dark 6 x 8 in timber beams
  7 ft apart, their ends projecting past both edges with paler end grain. The
  soffit is dark under a deep dark fascia. Five picnic tables stand in the
  gloom, and the terrace guardrail's pickets are 8 in apart.
- **Planting** (`elToroLandscape.ts`). Every plant is lumpy foliage geometry:
  each mass is pushed in and out by broad bumps, tipped paler and darker
  underneath through its alpha.
  - On the locker bank, about 30 irregular clumps are thrown at random and kept
    where they don't crowd a neighbour, the side filmer's view or the far rail.
    Each is two to four overlapping masses with its woody stems showing
    underneath.
  - Low pink-flowering bushes stand near the stair foot, with dark ground-cover
    mats between the shrubs.
  - On the canopy bank are two rows of big clipped hedges, each its own size,
    touching their neighbours.
- **Fixtures.** Grey litter bins have a foot ring, a rolled rim and a domed
  lid. The round lawn's seat-wall has an inner face and a coping proud of both
  faces. Two precast concrete benches stand on pedestals.
- **Surroundings.**
  - The four 500 ft enclosure walls are replaced by an outer ring of fifteen
    separate low blocks, 10.5 to 13 ft, with seam roofs. They stand behind the
    perimeter gum rows.
  - Block H (u -250..-185, z -45..24) and a gum in front of it close the view
    back up the run-up. Nothing solid stands nearer than u -180 on the
    rider's line.

Plain fixes:
- The bottom-landing cracks were drawn at the landing height, under the slabs,
  and so were hidden.
- The far perimeter gums stood inside the old enclosure walls.
- One campus gum stood where block H now is; it moved in front of it.

Review fixes after the pass:
- **Leaves.** The stock leaf pattern (solid 13) is one flat projection, which
  striped the rounded shrubs down their sides. `SpotLook.foliage` swaps in a
  pattern read through each face's own plane at leaf and branch scale. Only El
  Toro sets it, so the other spots' shaders are unchanged.
- **Trees.** The broadleaf by the stair's top corner stands on the bank in
  front of the canopy (u 12, z -18, 27 ft), as in refs/07 and 31, not under its
  roof. No tree stands on the run-up's own line.
- **Fence shade.** Only the fence's top rail and its posts within 40 ft of the
  stairs cast shadows; the rest were never seen and cost every ground pixel a
  test.

Dressing-pass baked budget: 94,515 vertices (6,594 ground, 75,201 props,
12,720 decals) plus six fence-panel vertices, 94,521 in all. Twelve shadow
boxes, 32 rail segments (24 of them the handrails'), 12 contact lines and six
canopies. The largest fragment shader declares 185 uniform vectors. On the
Mac mini's GPU the stock tripods draw in 6.6 to 9.1 ms a frame (Carlsbad 7.0
to 8.0; the old El Toro 4.8 to 6.0).
