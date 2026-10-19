# UC Davis Gap reference

## Research and dimensions

The scene recreates the classic filmed **UC Davis Gap**, also called the **Roessler Gap** or **Ivy Gap**, beside Roessler Hall at UC Davis. It uses **approximately 24 feet 4 inches horizontally and 10 feet down** (7.42 m × 3.05 m).

- [Henry Luc, *Sustainable Skateparks: A Design for a Davis Skate Plaza*, UC Davis Landscape Architecture senior project, June 2008, printed page 6 / PDF page 12](https://humanecology.ucdavis.edu/sites/g/files/dgvnsk161/files/inline-files/HLuc.pdf#page=12). This primary on-site study gives those approximate dimensions and explains that they were derived from the adjacent nine-flat-nine stairs. Its two photographs, including one looking down from the takeoff, were visually inspected. The study supports a long approach and broad lower landing; its dimensions are estimates, not a surveyed plan.
- [Kyle Camarillo, Chris Joslin 360 flip at Davis Gap](https://kylecamarillo.com/purchase/chris-joslin-360-flip-davis-gap-print). The photographer's image was visually inspected for the pale curved planter, ivy and worn earth, conifer, rust-red wall panels, concrete framing and low curb.
- [Dern Brothers, *Skating the UC Davis Gap in 2023!? Feat. Corey Duffel — Spot History Ep. 11*](https://www.youtube.com/watch?v=jmUcMTgtr-A). The overview and actual Joslin approach sequence at **7:44.25–7:45.15** were watched in the collaborative browser. Joslin emerges from the recessed hallway, rolls straight across the terrace, and pops at the edge with no visible approach turn. The footage also distinguishes the rounded planter, roof overhang and stairs.
- [Davis LocalWiki, *Roessler Hall*](https://en.localwiki.org/davis/Roessler_Hall) describes a 28-foot gap without a measurement method. That conflicting figure is not used as an exact measurement. Different endpoints may explain it, but this remains unverified.

- User-supplied front and takeoff photographs, October 14, 2026. These establish the orientation: from the lower landing, the facade terminates at the left corner and continues right toward the sole access stair. The planter is left of the jump line, with the conifer to its right.

## Reconstruction choices

`packages/animations/src/sets/ucDavis/ucDavisLayout.ts` holds the geometry used by the renderer and the flight planner. As at the other landmarks, one foot is 29 set units; `SET_SCALE` converts this to the rider's real board scale. The walkway lip is x=0, y=0; travel is toward +x and the lower landing is y=−10 feet. Rider stance changes the rider, never the architecture.

The straight run-up comes through an open hallway and continues across the concrete terrace in front of the red facade. Looking uphill from the lower landing, **+z is image-left**: the facade ends at that corner, while the planted bank and low curb wrap around the building’s side. The facade faces downhill (+x) and continues across the background toward the **single access stair on image-right (negative z)**. The semicircular rock-filled planter sits left of the jump line (+z), and the conifer stands right of it (negative z). The ivy bank has a worn dirt path, a rounded front-left corner and one continuous low curb running around the corner and along the building’s side. Soil slopes laterally to that side curb; there is no vertical earth slice at the facade end. The wall immediately left of the hallway is plain pale concrete with high horizontal louvres; rust-red panels continue to the right. The stair rails are scenery; the lower pavement stays clear through the rollout. The model includes pale concrete bays, a projecting roof, campus planting and street furniture.

The hallway is an actual opening between two building wings, with a continuous level floor and recessed interior walls. The rider remains on the same straight +x line through approach, takeoff and landing; there is no scene-imposed turn. Hallway width/depth and facade setback are photo-derived approximations, not measured dimensions. Moving cameras stay within the hallway walls and under its ceiling while filming the approach. Rider stance never reverses the scenery.

The wrap is a quarter-ellipse joining the original front toe to a side bed extending 12 feet past the building corner. The side bed continues along the return and eases down behind the building instead of ending in another tall cut. These widths and extents are photo-derived modeling choices.

Only the total span and drop are grounded in the study's numeric estimate. Stair tread allocation, landing length, widths, planter radius and depth, building extent and panel spacing, curb height, bank curvature, trees and other scenery are visual approximations. The stair layout uses two nine-riser flights, each with eight treads, separated by a level landing. Geometry is intentionally simplified for the mobile renderer. The classic open skating configuration is the target, rather than a claim about current construction or site access. External photos remain research references; none are shipped as app textures.

The rider lands three feet beyond the bank's toe; that clearance is a gameplay choice and is separate from the quoted gap span. Both Dream Tricks and the Trick Explorer expose this single gap line, all supported flatground tricks and rider stances, three tripod shots, the moving camera, shared URLs and the existing export pipeline.

## Verification

The spot tests check foot-to-stage scaling, launch/planter separation, the pale left wall, right-hand staircase, sloped wraparound bank and continuous low curb, approach clearance from the building, rendered floor agreement with collision heights, the eighteen drawn risers, finite geometry and the mobile vertex budget, and camera framing/occlusion. The shared classic-spot sweep checks wheel clearance across tricks, all four trick stances and both rider stances. Existing takeoff, landing and kick-out suites also include this spot through `STAGE_SETS`.
