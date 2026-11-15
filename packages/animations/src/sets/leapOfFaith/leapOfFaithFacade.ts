import type { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { INK, ft, makePipe, mixHex, plainBox, tubeFt, worldBox } from './leapOfFaithKit';
import { LEAP_OF_FAITH_FOOT as F } from './leapOfFaithLayout';
import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';

/**
 * The facade, world axes in feet: the four upper piers on the rail line, the walkway slab over the undercroft
 * with its downstand fascia, the undercroft itself (off-white back wall, pale blue side walls, slim columns,
 * surface conduit), and the gallery deck over the open breezeway with its joists and two-pipe rail. Refs 20,
 * 82, 91 (1998), 05, 140, 143, 144 (1997), 97 (later, for the joists).
 *
 * Boxes that abut leave out the faces they share: the props are drawn double-sided, so a hidden face lying in
 * another's plane would fight it.
 */

/** The lower court's floor, in feet. */
export const COURT = -14.3;
/** Far enough below any face that its wear sees no ground: a wall that doesn't stand on the court gets no splash-back. */
const AIRBORNE = COURT - 40;
/** The four fixed upper piers on the rail line: each stands 1.5 ft toward −z from its z. */
export const PIER_Z = [-4.5, -21, -38, -54];
/** The undercroft's front columns (z), the last a half column against the right wing. */
export const COLUMN_Z = [-22, -39, -55.58];
/** The undercroft's back wall (x), its ceiling (y) and its two ends (z). */
export const BAY_BACK = -14;
export const BAY_CEILING = -1.5;
export const BAY_Z: [number, number] = [-56, -5];
/** The gallery deck: front and back (x), its soffit and top (y), its ends (z). */
const DECK_X: [number, number] = [-14, 1.5];
const DECK_Y: [number, number] = [12, 12.6];
const DECK_Z: [number, number] = [-56, 9];
/** The two-pipe gallery rail: its two lines (x) along the deck's back and front, its pipes' heights. */
const GALLERY_RAIL_X = [-13.7, 1.1];
const GALLERY_RAIL_Y = [14.3, 16.1];
/** The cross beams hang every 4 ft (z of each); a lighter joist hangs between each pair (refs 05, 140, 97). */
const BEAM_STEP = 4;
const FIRST_BEAM = -55;

export function buildLeapOfFaithFacade(b: Bake) {
  piers(b);
  undercroft(b);
  conduit(b);
  gallery(b);
}

/** The four fixed upper piers, exactly their old extents: bare board-marked concrete, stained from the deck (ref 140). */
function piers(b: Bake) {
  for (const z of PIER_Z) {
    worldBox(b, [-4.1, 0, z - 1.5], [-2.6, 12, z], PAINT.pier, { kind: 'cast', faces: 'fkle' });
  }
}

/**
 * The walkway slab, its fascia about 3 ft deep (refs 82, 20), the off-white back wall 14 ft in, the pale blue
 * side walls and the slim columns on the front edge: scuffed low by benches and boards, dirty at the foot.
 */
function undercroft(b: Bake) {
  const [z0, z1] = BAY_Z;
  // The slab's soffit, off-white, in shade but for the bounce off the court.
  worldBox(b, [BAY_BACK, BAY_CEILING, z0], [0, 0, z1], PAINT.concrete, { underside: PAINT.bayBack, faces: 'b' });
  // The fascia: its face, the underside the sun line falls from, and the back the bay sees. A paler cap band
  // along its top edge (refs 20, 82), a hair proud of it.
  worldBox(b, [-0.65, -3, z0], [0, 0, z1], PAINT.white, { foot: COURT, faces: 'ebl' });
  worldBox(b, [0, -0.42, z0], [1 / F, 0, z1], PAINT.cap, { foot: COURT, faces: 'e' });
  // The back wall, the side wall by the return, and the end wall against the right wing, which also closes the
  // covered walk's end.
  worldBox(b, [-14.7, COURT, z0], [BAY_BACK, BAY_CEILING, z1], PAINT.bayBack, { faces: 'e', use: [0.2, 0] });
  worldBox(b, [BAY_BACK, COURT, -5.7], [0, BAY_CEILING, z1], PAINT.white, { faces: 'ke' });
  worldBox(b, [-14.7, COURT, -63], [0, 0, z0], PAINT.white, { faces: 'fe' });
  // The return's end, where the stair's cheek stands proud of the bay.
  worldBox(b, [0, COURT, z1 - 1 / F], [0.7, 0, z1], PAINT.white, { faces: 'k' });
  // The columns, scuffed and flaked low where benches and boards hit them.
  for (const z of COLUMN_Z) {
    const half = z < -55;
    worldBox(b, [-0.85, COURT, z - 0.42], [0, BAY_CEILING, half ? z0 : z + 0.42], PAINT.white, { faces: half ? 'fle' : 'fkle', use: [0.55, 0] });
  }
}

/**
 * Two runs of surface conduit high on the back wall, a junction box in the left corner with a drop to a switch
 * below it (refs 05, 144, 18), painted out with the wall.
 */
function conduit(b: Bake) {
  const x = BAY_BACK + 0.09;
  for (const y of [-2.35, -2.8]) tubeFt(b, [[x, y, -6.6], [x, y, -55.7]], 2.4, PAINT.conduit, INK.metal);
  plainBox(b, [BAY_BACK, -3.3, -7.25], [BAY_BACK + 0.42, -1.95, -5.7], PAINT.junction, INK.metal, 'tbfke');
  tubeFt(b, [[x, -3.3, -6.15], [x, -8.3, -6.15]], 2.2, PAINT.conduit, INK.metal);
  plainBox(b, [BAY_BACK, -8.95, -6.4], [BAY_BACK + 0.2, -8.3, -5.9], PAINT.junction, INK.metal, 'tbfke');
}

/**
 * The gallery: a shallow weathered deck, dark underneath with a cross beam every 4 ft and a lighter joist
 * between, its edge beam on the court side water-stained from the deck and rust run down from the rail's posts.
 */
function gallery(b: Bake) {
  const [x0, x1] = DECK_X, [y0, y1] = DECK_Y, [z0, z1] = DECK_Z;
  const cast = { kind: 'cast' as const, foot: AIRBORNE };
  worldBox(b, [x0, y0, z0], [x1, y1, z1], PAINT.concrete, { ...cast, underside: PAINT.beam, faces: 'tble' });
  worldBox(b, [0.5, 10.4, z0], [x1, y0, z1], PAINT.concrete, { ...cast, underside: PAINT.beam, faces: 'blef' });
  for (let z = FIRST_BEAM; z < z1; z += BEAM_STEP) {
    worldBox(b, [x0, 10.9, z], [0.5, y0, z + 0.45], PAINT.beam, { ...cast, faces: 'bfkl' });
    if (z + 2.3 < z1) worldBox(b, [x0, 11.45, z + 2], [0.5, y0, z + 2.3], PAINT.beam, { ...cast, faces: 'bfkl' });
  }
  // The two-pipe rail along both edges, a post every 6.5 ft on a small plate.
  const pipe = makePipe(b, false, []);
  for (const x of GALLERY_RAIL_X) {
    for (const y of GALLERY_RAIL_Y) pipe([ft([x, y, z0]), ft([x, y, z1])], 1.6, false);
    for (let z = z0; z <= z1; z += 6.5) {
      pipe([ft([x, y1, z]), ft([x, 16.1, z])], 1.6, false);
      plainBox(b, [x - 0.17, y1, z - 0.17], [x + 0.17, y1 + 0.05, z + 0.17], PAINT.plate, INK.metal, 'tfkle');
      if (x > 0) rustRun(b, x1 + 1 / F, z, y1, 1.1 + 0.6 * (((z * 7.3) % 1 + 1) % 1));
    }
  }
}

/** Rust run down the deck's front from a rail post's fixing at `z`: a narrow tapering stain `length` long, a hair proud. */
function rustRun(b: Bake, x: number, z: number, top: number, length: number) {
  const paint = { color: mixHex(PAINT.rust, PAINT.concrete, 0.45) };
  const w = 0.11;
  const corners: Vec3[] = [[x, top, z - w], [x, top, z + w], [x, top - length, z + 0.02], [x, top - length, z - 0.02]];
  const [a, c, d, e] = corners.map(ft);
  b.quad(a, e, d, c, [1, 0, 0], paint, INK.concrete);
}
