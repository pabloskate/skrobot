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
locker frontage across the stairs on the opposite side from the dirt bank.
The building, fence, lantern and its rear grove move together. The twenty risers,
nine-and-a-half-foot drop and twenty-foot run define the current model. The drop
was revised from nine feet at the user's request on October 7; it is a modeling
choice, not a newly surveyed measurement. The rider's line is six feet
left of the center rail when looking up the stairs, halfway across that flight.
The school keeps its placement when the flight is narrowed, leaving the upper
walkway open beside it.

The follow-up photos confirm two distinct structures: the locker building on
the left when looking up the stairs, and an open covered walkway on the right.
The right-hand structure has a low, broad roof, exposed projecting beams, a
dark soffit and square tan masonry columns. It belongs above the planted bank,
with open views between the supports rather than another solid building.

The spot has one fixed downhill direction. Fakie turns the board and the rider's
feet round so the rider rolls tail first down that same flight, the shoulders and
head turned back over the back shoulder to the stairs; choosing a stance never
mirrors the building, rails, landscape or camera.

The final floor correction removes the artificial square paving grid from the
landings and covered walkway. Continuous concrete keeps subtle mottling and
aggregate, while the steps retain their worn lips and vertical streaks.

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
boardslide takes the right rail, by the side wall, and a backside one the
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
rider (`EL_TORO_TRIPODS` in `sets/elToro/elToroCamera.ts`): crouched on the bottom
landing off the line, up the grass bank past the side wall, and at the top beside
the wall. Each has a fixed lens, so the rider grows as they come closer and
shrinks as they go. Beyond the bottom landing the set is an open concrete
expanse, which the side and top tripods look out over once the rider is down.

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
  grime. Do not add a square paving grid. Rails need narrow rubbed highlights,
  joints and believable post attachments rather than mirror-like chrome.
- Use irregular dry soil, mulch, leaf litter and olive-green planting with
  visible gaps and twig interiors. Keep the rider and stair silhouette legible.
- Model campus fixtures such as the polygonal lantern, chain-link fence,
  recessed lights and locker hardware at a detail level appropriate to the
  scene's camera distance.

The shipped assets use procedural runtime materials and baked 3D props. Source
photographs are visual references only; they are not redistributed as textures
or bundled into the application. Reusable scene code belongs in
`packages/animations/src/sets/elToro/`: `elToroLayout.ts` owns layout,
`elToroBuilding.ts`, `elToroCanopy.ts` and `elToroLandscape.ts` own environment props,
`elToroMaterials.ts` owns surface treatment, and `elToro3d.ts` assembles the set.

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

## Validation of this detail pass

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
