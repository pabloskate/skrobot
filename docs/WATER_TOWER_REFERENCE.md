# Water Tower Gap reference notes

Researched and built November 24, 2026. This set depicts the two reservoirs at the Rowland
Water District yard, 3021 Fullerton Road, Rowland Heights, California, as they stood the
morning in 1997 that Jeremy Wray ollied from one roof to the other. It uses the sets' scale
of 29 units per foot (`SET_FOOT`). The riding dimensions come from a public lidar survey
and the day's footage; the surroundings are a photo-guided reconstruction, not a survey.

## The legend and the measurements

The gap is usually given as 16 feet across and 40 feet up. Neither figure describes what
the rider crossed.

| Feature | Model | Source and confidence |
| --- | --- | --- |
| Roof edge to roof edge on the line through both centres | **13.9 ft** | 2023 USGS lidar (3DEP `CA_LosAngeles_1_B23`): fitted roof centres 188.2 ft apart, less two fitted radii. Working range 13 to 15 ft. No rooftop tape exists |
| Wall to wall at the foot | about 16 ft (not modelled as a riding dimension) | Taped on camera in Jenkem's 2020 revisit (192 in); Wray paced and later taped "just over 16". This is where the 16 comes from: each roof slab overhangs its wall by about a foot |
| Roofs over the pavement in the slot | **21 ft** | Lidar: 21.0 and 21.3 ft at the gap, 17 to 24 ft round the rest of each tank as the grade falls away. People standing beside the walls in the 1997 footage agree. "About 40 feet" is Wray's own guess in an interview ("I'm guessing it's about 40 feet up"), repeated since as a measurement |
| Roof diameter | **174.4 ft** each (87.2 ft radius) | Lidar fits of 174.1 and 174.6 ft, drawn alike. The 1997 aerial gives 170 to 183 ft |
| Level between the roofs | level | Lidar puts the landing rim about 2 in higher, inside its scatter. Wray: "It's completely flat" |
| Roof shape | flat | Really a very shallow crown, about 1 degree, 1.5 ft higher at the centre. Left out so the rider rides a level line |
| Roof overhang past the wall | 1 ft | Lidar wall returns and photographs |
| Direction of travel | north-north-east, 027 degrees true | From the southernmost tank to the middle one; the 1997 footage runs right to left seen from the hillside to the west |

The day's ollie, read off the footage (Ty Evans' angle, counted on two copies): about
0.50 s in the air (12 frames at 24 fps; 15 to 16 at 30 fps), the board's middle travelling
15 to 17 ft, so about 32 ft/s (22 mph, range 19 to 25). The board peaks about 2.3 ft over
the roofs. The tail leaves within half a foot of the rim and the back wheels come down
under a foot inside the far one. He rolls away across the landing roof for over four
seconds. Wray recalls five tries, pushing "as fast as humanly possible".

## Scene and motion contract

`y = 0` is both roofs; the pavement is `y = -21 ft`. `+x` runs along the rider's line from
the lip (the takeoff roof's edge) toward the landing tank. `+z` is the rider's right,
toward Fullerton Road; `-z` is the hillside. The takeoff tank is centred at
`x = -87.2 ft`, the landing tank at `x = +101.1 ft`, both on `z = 0`, which is the lane.
`waterTowerLayout.ts` owns these and the terrain; `waterTowerSurface` is the two roof
discs and the pavement everywhere else.

The terrain has no drop, so the flight is the pop's own. The spot sets the pop every trick
takes, whoever rides it (`WATER_TOWER_POP`, 0.78 as a style's pop height, through the
terrain's `trickPop`): a low, quick pop of about 0.62 s, against the flatground hop's 0.8 s.
The tricks are solved on the flatground clock and run about 1.3 times as fast to be round by
touchdown. The roll-in speed follows from the landing, 2 ft inside the far rim: about
26 ft/s (18 mph). That sits between the game's fast gaps and the day's ollie (32 ft/s,
0.5 s), which would hurry every flip trick to 1.6 times its pace. At this speed a kick-out
rolls: the roll's knee clearing (`kickOut.ts` `rollingAt`) turns a knee up out of the ground
by the least that clears it, since the old quarter-leg steps jumped the knee across the leg
in one frame on a fast dive.
The rider appears already rolling about 25 ft before the lip, as at
every spot, and rolls away for about 22 ft; there are 170 ft of roof each way.

Falls stay on the landing roof: `waterTower.test.ts` checks the rider and the board
through every fall.

## Filmers

Each stands where the day's pictures were taken (`WATER_TOWER_FILMERS`):

- **Bottom** is Daniel Harold Sturt's Thrasher cover (November 1997, issue 202): on the
  pavement in the slot on the rider's left, looking up. It sees the rider only in the air
  between the two walls. Across the line, that filmer crouches on the landing roof.
- **Side** is Ty Evans' video angle, up the hillside on the left with a long lens across
  both roofs to the road. A player's visit opens here (`opens: 'side'`), because the cover's
  angle hides the run-up and the landing. Across the line it stands on the landing roof's
  rim, since there is no hill on the road side.
- **Top** stands on the takeoff roof beside the lip.

## Scenery

Drawn through the realistic look (`WATER_TOWER_LOOK`). The roofs are in the ground mesh, so
they take the rider's shadow; their pour rings, joints, patches and stains are decals. The
walls, ring beams, lips and footings are cast concrete worn per pixel through the look's
wall wear, kept faint. The hillsides use the look's `scrub` surface (`surfaces.ts`, added
for this spot and opt-in): dry grass, pale dirt and scattered bushes drawn per pixel, each
face's paint saying how much brush and dirt it carries. The whole spot bakes to about
90,000 vertices, under its 100,000 budget, and draws in 6.5 to 8.8 ms a frame on the Mac
mini's GPU, level with El Toro and UC Davis; a phone is unmeasured.

## Known differences from the place

- The roofs' shallow crown is left out (above).
- The engine's sun is the same at every spot, so the early-morning easterly light of the
  footage (the takeoff tank's near wall in shade, the landing tank's lit) is not matched.
- Later additions are left out: the safety railings on the takeoff roof, the sand-coloured
  pebbled wall coating, the tall roadside tree screen, the district's newer frontage.
- No lettering, logo or utility name is shown anywhere.
- The scrub's bushes are drawn flat on the slope, with shading and shade but no height, so a
  camera low on the hillside sees them as marks on the ground. The houses on the far crest
  are plain boxes with windows.
- Fixture positions on the roofs (hatch, vent, pipe stubs) and the wall ladder are placed
  from single frames, not surveyed.

## References actually inspected

- USGS 3DEP lidar, `CA_LosAngeles_1_B23`, flown November 22, 2023: roof fits, heights,
  centre spacing and bearing. Present-day geometry; nothing in the photographs suggests
  the tanks changed size since 1997.
- [NETRonline historic aerial, 1997](https://www.historicaerials.com/viewer): all three
  tanks present, roof size to within the image's blur.
- [Jenkem, "Revisiting the Water Tower Ollie with Jeremy Wray" (2020)](https://www.youtube.com/watch?v=1grq_HFt0Eo):
  the 1997 footage in real time (0:43 to 1:03), the tape between the walls (6:13 to 6:24),
  the slot from the ground. Article: [jenkemmag.com](https://www.jenkemmag.com/home/2020/01/19/revisiting-water-tower-ollie-jeremy-wray/).
- [411 Video Magazine extract](https://www.youtube.com/watch?v=fbd_NplSsM0): a second copy of
  the make, for the frame count.
- [The Nine Club clip](https://www.youtube.com/watch?v=yhFFPavRSsw&t=428s): Wray on pacing
  and taping the gap, "completely flat", five tries.
- [STORIED](https://www.youtube.com/watch?v=hlFG83r2W9s): the "about 40 feet" guess (2:53),
  wider 1997 establishing shots, the later railings.
- [Thrasher, November 1997](https://www.thrashermagazine.com/articles/magazine/november-1997/?tmpl=component)
  and the [Chrome Ball interview](https://chromeballincident.blogspot.com/2018/03/chrome-ball-interview-115-jeremy-wray.html):
  the cover and its scan.
- [FindSkateSpots listing](https://findskatespots.com/spots/rowland-heights-ca/3021-fullerton-road-rowland-heights-water-tower-gap)
  and Google Street View (May 2025): the slot and the road side today.

Reference photographs are linked for verification; they are not shipped as game textures.

Not found: a 1997 survey, a rooftop tape of the gap, the tanks' drawings or capacities, a
second timed angle of the make, the exact skate line across the roofs, the date and hour
of the shoot.
