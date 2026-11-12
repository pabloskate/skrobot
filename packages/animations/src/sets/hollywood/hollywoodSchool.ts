import type { Vec3 } from '../../camera/view';
import type { Paint } from '../../three/bake';
import { surfaceInk } from '../surfaces';
import type { Baker } from './turn';
import { HOLLYWOOD_PAINT as PAINT } from './hollywoodPalette';
import { HOLLYWOOD_BUILDING_FACE, HOLLYWOOD_FOOT as F } from './hollywoodLayout';

/**
 * The school beside the walkway, in feet in the sixteen's frame (x down the sixteen from its lip, y up from the
 * walkway, z across: +z the school, -z Highland). Every size here is a reading from photos and map rulers, not a
 * survey: see the site plan and docs/HOLLYWOOD_REFERENCE.md. Walls are plain throughout: the real auditorium's
 * mural and the covered court's painted wall are left out on purpose.
 *
 * From the walkway west: two short brick wings beside the stairs, the broad entry stair between them up to a porch
 * and five pairs of red doors under a shallow canopy, and over everything the pale auditorium with its eight
 * projecting fins. At each stair's foot, beyond its wing, a covered court: a flat slab on brick walls and a pier.
 */

type SurfaceKind = 'brick' | 'concrete' | 'stucco' | 'metal' | 'glass' | 'asphalt';
type ShadowBoxes = { min: Vec3; max: Vec3 }[];

/** Paint, as it looks in sun: see hollywoodPalette.ts. */
const BRICK = PAINT.brick;
const CAP = PAINT.coping;
const PLINTH = PAINT.plinth;
const ENTRY_CONCRETE = PAINT.entryConcrete;
const ENTRY_NOSING = PAINT.entryStrip;
const PORCH = PAINT.porch;
const RAIL_WHITE = PAINT.whiteRail;
const AUDITORIUM = PAINT.auditorium;
const PEBBLE = PAINT.pebble;
const FIN = PAINT.fin;
const DOOR = PAINT.door;
const DOOR_MEETING = PAINT.doorFrame;
const DOOR_PANEL = PAINT.doorPanel;
const PULL_BAR = PAINT.pullBar;
const SOFFIT = PAINT.soffit;
const LIGHT_LENS = PAINT.lens;
const COURT_CONCRETE = PAINT.courtConcrete;
const GALVANISED = PAINT.galvanised;
const WALL_BOX = PAINT.wallBox;
const SOUTH_BLOCK = '#d8cdb2';

/** The wings' street face, in feet. */
const WING_FACE = HOLLYWOOD_BUILDING_FACE / F;
/** The wings run back to the auditorium's flank at z = 25 and stand 7.8 ft over the walkway (15.8 over the landings). */
const WING_BACK = 25;
const WING_TOP = 7.8;
/** The twelve's wing (x -88.5..-66) and the sixteen's (x -6..16.5). */
const WINGS: Array<[number, number]> = [[-88.5, -66], [-6, 16.5]];
/** The entry stair spans the walkway between the wings, x -66..-6. */
const ENTRY_NORTH = -66;
const ENTRY_SOUTH = -6;
/** Eleven risers from z = 10 up to the porch at z = 21, y = 6: exactly 6/11 ft each so the porch lands on its datum. */
const ENTRY_RISERS = 11;
const ENTRY_FIRST_RISER_Z = 10;
const PORCH_Y = 6;
/** Five-inch concrete caps on the entry cheeks. */
const CHEEK_CAP = 5 / 12;
/** The auditorium: x -108..36, back wall z = 110, 50 ft tall. */
const AUDITORIUM_NORTH = -108;
const AUDITORIUM_SOUTH = 36;
const AUDITORIUM_BACK = 110;
const AUDITORIUM_TOP = 50;
/** The fins' centres, 12.8 ft apart, and the pebble-panelled bay between the end fins. */
const FIN_CENTERS = [-80.8, -68, -55.2, -42.4, -29.6, -16.8, -4, 8.8];
/** The five door pairs' centres, one between each pair of inner piers. */
const DOOR_CENTERS = [-60, -48, -36, -24, -12];

interface SchoolTools {
  props: Baker;
  shadows: ShadowBoxes;
  /** A box between two corners in feet; `shadow` also makes it a shadow box. */
  box: (min: Vec3, max: Vec3, color: string, surface?: SurfaceKind, shadow?: boolean, faces?: string) => void;
  /**
   * A tube rail through points in feet, its radius in set units, white unless told otherwise; a wire (`wire`) is
   * four-sided and open-ended, its ends buried in the rail and the tread.
   */
  pipe: (points: Vec3[], radius?: number, color?: string, wire?: boolean) => void;
}

/** Builds every piece of the school into `props`, pushing its shadow boxes (set units) onto `shadows`. */
export function buildSchool(props: Baker, shadows: ShadowBoxes) {
  const box: SchoolTools['box'] = (min, max, color, surface = 'concrete', shadow = false, faces = 'tbfkle') => {
    const a = min.map(v => v * F) as Vec3, b = max.map(v => v * F) as Vec3;
    props.box(a, b, color, color, surfaceInk(surface), faces);
    if (shadow) shadows.push({ min: a, max: b });
  };
  const pipe: SchoolTools['pipe'] = (points, radius = 1.8, color = RAIL_WHITE, wire = false) => props.tube(
    points.map(p => p.map(v => v * F) as Vec3), points.map(() => radius), { color }, surfaceInk('metal'), wire ? 4 : 6, !wire);
  const tools: SchoolTools = { props, shadows, box, pipe };

  buildWings(tools);
  buildEntryStair(tools);
  buildEntryCheeks(tools);
  buildEntryRails(tools);
  buildAuditorium(tools);
  buildPorchFront(tools);
  for (const [start, end] of [[16.5, 50], [-116, -88.5]]) buildCourt(tools, start, end);
  // The auditorium's mass last, behind everything on its face, so the depth test spares the pixels they hide.
  buildAuditoriumMass(tools);
  // The plain single-storey block that closes the view south down the walk (26, 25).
  box([60, -8, 14], [150, 4, 70], SOUTH_BLOCK, 'stucco', true);
}

/**
 * The two brick wings beside the stairs (02, 19, 24, 41, 42): solid running-bond brick from the landing to a thin
 * pale cap, the twelve's with a roof-slab eave three feet out over its stair (02, 32), the sixteen's with a stepped
 * dark concrete base following its steps (24, 19).
 */
function buildWings({ box }: SchoolTools) {
  for (const [start, end] of WINGS) {
    box([start, -8, WING_FACE], [end, WING_TOP, WING_BACK], BRICK, 'brick', true);
    box([start, WING_TOP, WING_FACE - 0.2], [end, 8.2, WING_BACK], CAP);
  }
  // The twelve wing's eave.
  box([-88.5, 7.5, WING_FACE - 3], [-66, 8.2, WING_BACK], CAP);
  // The sixteen's stepped plinth: one thin box per step, kept off its fixed wall rail.
  for (let step = 0; step < 16; step++) {
    const x = step * 16 / 15;
    box([x, -8, WING_FACE - 0.06], [Math.min(16.5, x + 16 / 15), -step / 2 + 0.15, WING_FACE], PLINTH);
  }
}

/**
 * The broad entry stair from the walkway up to the porch (28, 11, 02): buff concrete, a dark non-slip strip set
 * just back from each nose so the nose itself stays bare concrete.
 */
function buildEntryStair({ box }: SchoolTools) {
  // The apron between the walkway's edge and the first riser.
  box([ENTRY_NORTH, -0.1, 8], [ENTRY_SOUTH, 0, ENTRY_FIRST_RISER_Z], ENTRY_CONCRETE, 'concrete', false, 'tk');
  for (let step = 0; step < ENTRY_RISERS; step++) {
    const height = (step + 1) * 6 / 11;
    // Only the tread and riser show: the back hides in the next step, the ends in the cheeks, the bottom in the walk.
    box([ENTRY_NORTH, 0, ENTRY_FIRST_RISER_Z + step], [ENTRY_SOUTH, height, 11 + step], ENTRY_CONCRETE, 'concrete', false, 'tk');
    box([ENTRY_NORTH + 0.5, height, ENTRY_FIRST_RISER_Z + step + 0.12], [ENTRY_SOUTH - 0.5, height + 0.008, ENTRY_FIRST_RISER_Z + step + 0.4], ENTRY_NOSING, 'concrete', false, 't');
  }
  // The porch in front of the doors.
  box([ENTRY_NORTH, 0, 21], [ENTRY_SOUTH, PORCH_Y, 31], PORCH, 'concrete', false, 'tfle');
}

/**
 * The entry stair's two brick cheeks (28, 11, 02), 1.5 ft thick along x = -66 and x = -6: level at 4.5 ft over the
 * apron, then sloping with the stair so each cross-section stays three feet over its nosing, under one continuous
 * five-inch cap rather than a staircase of brick boxes.
 */
function buildEntryCheeks({ props, box }: SchoolTools) {
  for (const x of [-66.75, -6.75]) {
    // Level over the apron (z 8..10), then sloping up the stair (z 10..21).
    for (const [z0, z1, y0, y1] of [[8, 10, 4.5, 4.5], [10, 21, 4.5, 9]]) {
      for (const side of [x, x + 1.5]) {
        const normal: Vec3 = [side === x ? -1 : 1, 0, 0];
        props.quad([side * F, 0, z0 * F], [side * F, 0, z1 * F], [side * F, y1 * F, z1 * F], [side * F, y0 * F, z0 * F],
          normal, { color: BRICK }, surfaceInk('brick'));
        props.quad([side * F, y0 * F, z0 * F], [side * F, y1 * F, z1 * F], [side * F, (y1 + CHEEK_CAP) * F, z1 * F], [side * F, (y0 + CHEEK_CAP) * F, z0 * F],
          normal, { color: CAP }, surfaceInk('concrete'));
      }
      // The cap's top, tilted with the slope.
      const slope = (y1 - y0) / (z1 - z0), norm = Math.hypot(1, slope);
      props.quad(
        [x * F, (y0 + CHEEK_CAP) * F, z0 * F], [(x + 1.5) * F, (y0 + CHEEK_CAP) * F, z0 * F],
        [(x + 1.5) * F, (y1 + CHEEK_CAP) * F, z1 * F], [x * F, (y1 + CHEEK_CAP) * F, z1 * F],
        [0, 1 / norm, -slope / norm], { color: CAP }, surfaceInk('concrete'));
    }
    // The cheek's end facing the walkway, and its cap.
    box([x, 0, 7.95], [x + 1.5, 4.5, 8], BRICK, 'brick');
    box([x, 4.5, 7.95], [x + 1.5, 4.5 + CHEEK_CAP, 8], CAP);
  }
}

/**
 * The entry stair's white tube handrails (11): four evenly spaced down the middle plus one against each cheek with
 * wire infill, each a sloping top pipe on three posts, running on level over the porch's edge.
 */
function buildEntryRails({ box, pipe }: SchoolTools) {
  for (const x of [-65, -54, -42, -30, -18, -7]) {
    // The top pipe: down to the apron at its foot, three feet over the first nosing, rising with the stair, level
    // onto the porch, and back down to it.
    pipe([[x, 0, 9], [x, 3, 9], [x, 9, 21], [x, 9, 23], [x, PORCH_Y, 23]]);
    // Posts on the first tread, partway up and on the top one, each on a small square base plate (11).
    for (const z of [10.5, 15.5, 20.5]) {
      const height = (Math.floor(z - 10) + 1) * 6 / 11;
      pipe([[x, height, z], [x, 3 + (z - 9) / 2, z]]);
      box([x - 0.2, height, z - 0.2], [x + 0.2, height + 0.04, z + 0.2], RAIL_WHITE, 'metal', false, 'tfkle');
    }
    for (const z of [9, 23]) box([x - 0.2, z === 9 ? 0 : PORCH_Y, z - 0.2], [x + 0.2, (z === 9 ? 0 : PORCH_Y) + 0.04, z + 0.2], RAIL_WHITE, 'metal', false, 'tfkle');
    // The two side rails' vertical wire infill, every six inches.
    if (x === -65 || x === -7) {
      for (let z = 10; z < 21; z += 0.5) pipe([[x, (z - 10) * 6 / 11 + 0.3, z], [x, 3 + (z - 9) / 2, z]], 0.35, RAIL_WHITE, true);
    }
  }
}

/**
 * The auditorium (50-57, 24, 33): a tall pale cream-buff block. Over the canopy its central bay is set back three
 * feet and filled with coarse exposed-aggregate panels between eight projecting cream fins; above the fins and on
 * both flanks the wall is flat and plain, only faintly streaked where rain runs off the parapet. Its ground floor is
 * notched for the porch and the two courts, so neither fills with an invented wall.
 */
function buildAuditorium(tools: SchoolTools) {
  const { box, shadows } = tools;
  // One conservative shadow box from the door wall back; the fins and flanks in front of it cast none of their own.
  shadows.push({ min: [AUDITORIUM_NORTH * F, -8 * F, 31 * F], max: [AUDITORIUM_SOUTH * F, AUDITORIUM_TOP * F, AUDITORIUM_BACK * F] });
  // The plain flanks out to z = 25, and the plain band over the fins. Their faces to the street, and the fins',
  // are drawn by auditoriumShading with the parapet's streaks in them; their backs are inside the upper block and
  // their ends against each other, so only the outer ends, tops and soffits are drawn here.
  box([AUDITORIUM_NORTH, 16.3, 25], [-80.8, AUDITORIUM_TOP, 31], AUDITORIUM, 'stucco', false, 'tbl');
  box([8.8, 16.3, 25], [AUDITORIUM_SOUTH, AUDITORIUM_TOP, 31], AUDITORIUM, 'stucco', false, 'tbe');
  box([-80.8, 42, 25], [8.8, AUDITORIUM_TOP, 31], AUDITORIUM, 'stucco', false, 'tb');
  // The recessed bay of exposed-aggregate panels: the asphalt surface stood upright gives their coarse stones. Its
  // face to the street is drawn by pebbleFace with its shadow line in it, so the stones are shaded once; of the
  // rest only its soffit over the door wall shows.
  box([-80.8, 16.3, 28], [8.8, 42, 31], PEBBLE, 'asphalt', false, 'b');
  for (const x of FIN_CENTERS) {
    // A fin, 1.5 ft wide, standing three feet proud of the panels (its top under the band).
    box([x - 0.75, 16.3, 25], [x + 0.75, 42, 28], FIN, 'stucco', false, 'ble');
    // Under the six inner fins, the piers between the door bays.
    if (x > -80 && x < 8) box([x - 0.65, PORCH_Y, 27.2], [x + 0.65, 15.5, 31], FIN, 'stucco');
  }
  auditoriumShading(tools);
}

/** The auditorium's upper block over everything, and its ground floor behind the porch and between the courts. */
function buildAuditoriumMass({ box }: SchoolTools) {
  // (Its back faces the school's interior, never seen from the street or the walk; the ground floor's tops are
  // inside the upper block.)
  box([AUDITORIUM_NORTH, 2, 31], [AUDITORIUM_SOUTH, AUDITORIUM_TOP, AUDITORIUM_BACK], AUDITORIUM, 'stucco', false, 'tbkle');
  box([-88.5, -8, 31], [16.5, 2, AUDITORIUM_BACK], AUDITORIUM, 'stucco', false, 'kle');
  box([AUDITORIUM_NORTH, -8, 37], [AUDITORIUM_SOUTH, 2, AUDITORIUM_BACK], AUDITORIUM, 'stucco', false, 'kle');
}

/**
 * The shading the bake owes the auditorium's face: the soft shadow line on the panels where each fin and the band
 * stand proud of them (carried as ambient occlusion), and faint streaks down the fins and flanks from the parapet.
 * Both are drawn in the faces themselves, so no pixel of the face is shaded twice.
 */
function auditoriumShading({ props }: SchoolTools) {
  pebbleFace(props);
  // Streaks from the parapet: narrow, a shade darker at the top and gone a few to a dozen feet down.
  let seed = 0;
  const next = () => fract(Math.sin(++seed * 91.7 + 13.1) * 43758.5453);
  const fins = FIN_CENTERS.map(x => {
    const streaks: Streak[] = [];
    if (next() < 0.6) streaks.push({ x: x - 0.6 + 0.6 * next(), width: 0.3 + 0.3 * next(), reach: 4 + 8 * next(), depth: 0.035 + 0.035 * next() });
    return streaks;
  });
  const faces = ([[AUDITORIUM_NORTH, -80.8, 16.3], [-80.8, 8.8, 42], [8.8, AUDITORIUM_SOUTH, 16.3]] as const).map(([start, end, bottom]) => {
    const streaks: Streak[] = [];
    for (let x = start + 1; x < end - 2; x += 2.5 + 4 * next()) {
      const band = start === -80.8;
      streaks.push({ x, width: 0.5 + 1.2 * next(), reach: band ? 2 + 5 * next() : 5 + 14 * next(), depth: 0.025 + 0.035 * next() });
    }
    return { start, end, bottom, streaks };
  });
  FIN_CENTERS.forEach((x, i) => streakedFace(props, x - 0.75, x + 0.75, 16.3, 42, FIN, fins[i]));
  for (const { start, end, bottom, streaks } of faces) streakedFace(props, start, end, bottom, AUDITORIUM_TOP, AUDITORIUM, streaks);
}

interface Streak { x: number; width: number; reach: number; depth: number }

/**
 * A stucco face looking -z at z = 25 (its box's back face, ink id 3), x0..x1 by y0..y1 in feet, in vertical strips:
 * plain, or a streak darkening `depth` toward the top and gone `reach` down.
 */
function streakedFace(props: Baker, x0: number, x1: number, y0: number, y1: number, color: string, streaks: Streak[]) {
  const ink = { ...surfaceInk('stucco'), id: 3, priority: 3 }, clean: Paint = { color };
  const rect = (a: number, b: number, ya: number, yb: number, low: Paint, high: Paint) => props.quadCorners(
    [b * F, ya * F, 25 * F], [a * F, ya * F, 25 * F], [a * F, yb * F, 25 * F], [b * F, yb * F, 25 * F], [0, 0, -1], [low, low, high, high], ink);
  let x = x0;
  for (const s of streaks) {
    const a = Math.max(x0, s.x), b = Math.min(x1, s.x + s.width);
    if (b <= a) continue;
    rect(x, a, y0, y1, clean, clean);
    const foot = Math.max(y0, y1 - s.reach);
    rect(a, b, foot, y1, clean, { color: shadeOf(color, 1 - s.depth) });
    if (foot > y0) rect(a, b, y0, foot, clean, clean);
    x = b;
  }
  rect(x, x1, y0, y1, clean, clean);
}

/**
 * The panels' face at z = 28, in strips: down both sides of every inner fin, and under the band, the stones darken
 * into the corner (0.5 at a fin, 0.55 under the band, gone 1.1 ft out), carried as ambient occlusion in the face
 * itself rather than in a skin laid over it.
 */
function pebbleFace(props: Baker) {
  const REACH = 1.1, LEFT = FIN_CENTERS[0], RIGHT = FIN_CENTERS[FIN_CENTERS.length - 1];
  const sides = FIN_CENTERS.flatMap(c => [c - 0.75, c + 0.75]).filter(x => x > LEFT && x < RIGHT);
  const cuts = [...new Set([LEFT, RIGHT, ...sides, ...sides.flatMap(x => [x - REACH, x + REACH])])]
    .filter(x => x >= LEFT && x <= RIGHT).sort((a, b) => a - b);
  const fromFin = (x: number) => {
    if (FIN_CENTERS.some(c => Math.abs(x - c) < 0.75 - 1e-6)) return 0.5;
    const d = Math.min(...sides.map(s => Math.abs(x - s)));
    return d >= REACH ? 1 : 0.5 + 0.5 * (d / REACH);
  };
  const fromBand = (y: number) => (y > 42 - REACH ? 1 - 0.45 * (y - (42 - REACH)) / REACH : 1);
  const paint = (x: number, y: number): Paint => {
    const ao = fromFin(x) * fromBand(y);
    return ao < 0.999 ? { color: PEBBLE, alpha: ao } : { color: PEBBLE };
  };
  const ink = { ...surfaceInk('asphalt'), id: 3, priority: 3 };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [x0, x1] = [cuts[i], cuts[i + 1]];
    for (const [y0, y1] of [[16.3, 42 - REACH], [42 - REACH, 42]]) {
      props.quadCorners([x1 * F, y0 * F, 28 * F], [x0 * F, y0 * F, 28 * F], [x0 * F, y1 * F, 28 * F], [x1 * F, y1 * F, 28 * F], [0, 0, -1],
        [paint(x1, y0), paint(x0, y0), paint(x0, y1), paint(x1, y1)], ink);
    }
  }
}

const fract = (v: number) => v - Math.floor(v);
/** A hex paint scaled toward black by `k`. */
function shadeOf(color: string, k: number) {
  const v = parseInt(color.slice(1), 16);
  const channel = (shift: number) => Math.round(((v >> shift) & 255) * k).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * The door wall at z = 31 and the shallow canopy over the porch (28, 11, 33, 02): in each bay a pair of dark red
 * leaves in a dark frame, a plain pull bar on each leaf by the meeting stiles, a plain grey panel over the pair, and
 * small square lights in the canopy's soffit.
 */
function buildPorchFront({ box }: SchoolTools) {
  for (const x of DOOR_CENTERS) {
    // The frame: head, two jambs and the mullion between the leaves, standing a little proud of the wall.
    // (Everything here stands on the porch against the wall: no bottom or back faces.)
    const front = 'tkle';
    box([x - 3.3, PORCH_Y, 30.8], [x - 3, 13.8, 31], DOOR_MEETING, 'metal', false, front);
    box([x + 3, PORCH_Y, 30.8], [x + 3.3, 13.8, 31], DOOR_MEETING, 'metal', false, front);
    box([x - 3.3, 13.5, 30.8], [x + 3.3, 13.8, 31], DOOR_MEETING, 'metal', false, 'tbkle');
    // The two leaves, set just back in the frame, and the dark line where they meet.
    box([x - 3, PORCH_Y, 30.88], [x + 3, 13.5, 31], DOOR, 'metal', false, 'k');
    box([x - 0.04, PORCH_Y, 30.84], [x + 0.04, 13.5, 30.88], DOOR_MEETING, 'metal', false, front);
    // A pull bar on each leaf: an upright bar on two short standoffs.
    for (const side of [-1, 1]) {
      const bx = x + side * 0.6;
      box([bx - 0.05, 9, 30.62], [bx + 0.05, 11.5, 30.72], PULL_BAR, 'metal');
      for (const y of [9.2, 11.3]) box([bx - 0.03, y - 0.03, 30.72], [bx + 0.03, y + 0.03, 30.88], PULL_BAR, 'metal');
    }
    // The plain grey panel over the pair, up to the canopy.
    box([x - 3.3, 13.8, 30.9], [x + 3.3, 15.5, 31], DOOR_PANEL, 'metal', false, 'bkle');
  }
  // The canopy: a thin white slab on the piers.
  box([-68, 15.5, 20], [-4, 16.3, 28], FIN, 'concrete', true);
  // Small square lights in its soffit, one before each door pair and one over each end of the porch (02).
  for (const x of [-64, ...DOOR_CENTERS, -8]) {
    // (Set into the soffit: no top faces.)
    box([x - 0.45, 15.44, 23.55], [x + 0.45, 15.5, 24.45], DOOR_MEETING, 'metal', false, 'bfkle');
    box([x - 0.32, 15.42, 23.68], [x + 0.32, 15.44, 24.32], LIGHT_LENS, 'concrete', false, 'bfkle');
  }
}

/**
 * A covered court beside a stair's foot (22, 23, 26, 25): a flat slab, its underside nine feet over the landing,
 * with a rounded outer street corner and a plain pale fascia, carried on a plain brick back wall, a brick end wall
 * and one brick pier. Under it a cast bench-table along the back and a run of low tube barriers. The sixteen's is
 * x 16.5..50 (its pier at x = 48), the twelve's x -116..-88.5 (pier at x = -114); both z 7..36.
 */
function buildCourt({ props, shadows, box, pipe }: SchoolTools, start: number, end: number) {
  const south = start > 0;
  // The slab's plan, clockwise from above, with a two-foot radius at the outer street corner.
  const outline: Array<[number, number]> = [[start, 36], [end, 36], [end, 9]];
  for (let i = 1; i <= 6; i++) {
    const angle = -i * Math.PI / 12;
    outline.push([end - 2 + 2 * Math.cos(angle), 9 + 2 * Math.sin(angle)]);
  }
  outline.push([start, 7]);
  // The soffit (y = 1, facing down) and the roof (y = 2, facing up), fanned from the first corner.
  for (const [height, normalY] of [[1, -1], [2, 1]]) {
    for (let i = 1; i + 1 < outline.length; i++) {
      const corners = [outline[0], outline[i], outline[i + 1]].map(([x, z]): Vec3 => [x * F, height * F, z * F]);
      if (normalY < 0) corners.reverse();
      props.triangle(corners[0], corners[1], corners[2], [0, normalY, 0], { color: SOFFIT }, surfaceInk('concrete'));
    }
  }
  // The fascia round every edge.
  outline.forEach(([x0, z0], index) => {
    const [x1, z1] = outline[(index + 1) % outline.length];
    const length = Math.hypot(x1 - x0, z1 - z0);
    props.quad([x0 * F, F, z0 * F], [x1 * F, F, z1 * F], [x1 * F, 2 * F, z1 * F], [x0 * F, 2 * F, z0 * F],
      [-(z1 - z0) / length, 0, (x1 - x0) / length], { color: SOFFIT }, surfaceInk('concrete'));
  });
  shadows.push({ min: [start * F, F, 7 * F], max: [end * F, 2 * F, 36 * F] });
  // Small square soffit lights in dark trims.
  for (const x of [start + 5, (start + end) / 2, end - 5]) {
    box([x - 0.45, 0.94, 17.9], [x + 0.45, 1, 18.8], DOOR_MEETING, 'metal', false, 'bfkle');
    box([x - 0.32, 0.92, 18.03], [x + 0.32, 0.94, 18.67], LIGHT_LENS, 'concrete', false, 'bfkle');
  }
  // Brick back wall, the corner pier and the end wall.
  box([start, -8, 36], [end, 1, 37], BRICK, 'brick');
  const pier = south ? 48 : -114;
  box([pier - 1, -8, 8], [pier + 1, 1, 10], BRICK, 'brick');
  box([south ? end - 1 : start, -8, 10], [south ? end : start + 1, 1, 36], BRICK, 'brick');
  // The cast bench-table along the back wall: its top, the bench in front of it, and their legs.
  box([start + 3, -5.5, 32], [end - 3, -5, 34], COURT_CONCRETE);
  box([start + 3, -6.5, 30.2], [end - 3, -6.2, 31.4], COURT_CONCRETE);
  for (const x of [start + 5, end - 5]) {
    box([x, -8, 32.5], [x + 0.5, -5, 33.5], COURT_CONCRETE);
    box([x, -8, 30.5], [x + 0.5, -6.2, 31.1], COURT_CONCRETE);
  }
  // A plain grey utility box on the back wall, and a conduit up from it to the soffit.
  const boxX = south ? start + 9 : end - 11;
  box([boxX, -4.5, 35.6], [boxX + 2, -1.5, 36], WALL_BOX, 'metal');
  box([boxX + 0.9, -1.5, 35.8], [boxX + 1.1, 1, 36], WALL_BOX, 'metal');
  // Low tube barriers, each a three-foot-high inverted U four feet wide.
  for (let x = start + 5; x < end - 3; x += 6) pipe([[x, -8, 28], [x, -5, 28], [x + 4, -5, 28], [x + 4, -8, 28]], 1.3, GALVANISED);
}
