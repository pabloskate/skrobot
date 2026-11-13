import type { Vec3 } from '../../camera/view';
import type { Bake, Ink } from '../../three/bake';
import { hash2 } from '../setKit';
import { F, METAL, face, mixHex, part, solidBox, tag, type ShadowBox } from './ucDavisKit';
import {
  UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_BUILDING_FRONT_X, UC_DAVIS_BUILDING_Z0, UC_DAVIS_BUILDING_Z1, UC_DAVIS_DROP,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_ROOF_BOTTOM, UC_DAVIS_ROOF_FRONT_X, UC_DAVIS_ROOF_TOP, ucDavisSideBankTop,
} from './ucDavisLayout';
import { UC_DAVIS_PAINT as PAINT } from './ucDavisPalette';
import { finTone, panelPatches, panelTone } from './ucDavisWear';

const CONCRETE = tag('concrete');
const STUCCO = tag('stucco');
const GLASS = tag('glass');
/** Exposed aggregate: the look's asphalt on an upright face reads as cast panels with their stones bared. */
const AGGREGATE = tag('asphalt');
const LOWER = -UC_DAVIS_DROP;

/** A wall plane: `at(s, y)` is the point `s` along it and `y` up it; `n` its outward normal. */
interface Plane { at: (s: number, y: number) => Vec3; n: Vec3 }
/** A wall facing +x (toward the gap), `out` in front of x. */
const facingX = (x: number, sign: 1 | -1 = 1): Plane => ({ at: (s, y) => [x, y, s], n: [sign, 0, 0] });
/** A wall facing ±z at z. */
const facingZ = (z: number, sign: 1 | -1): Plane => ({ at: (s, y) => [s, y, z], n: [0, 0, sign] });

/** Cut lines from `a` to `b` every `step`, plus any `extra` inside, in order and without near-duplicates. */
function cuts(a: number, b: number, step: number, extra: number[] = []): number[] {
  const all = [a, b, ...extra.filter((v) => v > a && v < b)];
  for (let v = a + step; v < b - step * 0.3; v += step) all.push(v);
  all.sort((p, q) => p - q);
  return all.filter((v, i) => i === 0 || v - all[i - 1] > 0.02 * F);
}

/**
 * A wall face in cells on the cut lines `ss` (along) and `ys` (up), each cell its own four vertices so a patch's
 * edge stays crisp: `paint(s, y, cs, cy)` colours the corner at (s, y) of the cell centred on (cs, cy). All the
 * cells lie in one plane, so nothing is layered on the wall to fight it.
 */
function cellWall(b: Bake, plane: Plane, ss: number[], ys: number[], paint: (s: number, y: number, cs: number, cy: number) => string, ink: Ink | ((cs: number, cy: number) => Ink) = STUCCO) {
  for (let i = 0; i + 1 < ss.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const [s0, s1, y0, y1] = [ss[i], ss[i + 1], ys[j], ys[j + 1]];
    const cs = (s0 + s1) / 2, cy = (y0 + y1) / 2;
    face(b, plane.at(s0, y0), plane.at(s1, y0), plane.at(s1, y1), plane.at(s0, y1),
      [paint(s0, y0, cs, cy), paint(s1, y0, cs, cy), paint(s1, y1, cs, cy), paint(s0, y1, cs, cy)], typeof ink === 'function' ? ink(cs, cy) : ink, plane.n);
  }
}

/**
 * One rust-red panel, `s0`…`s1` along its wall and `y0`…`y1` up it: smooth painted render, rolled squares of
 * fresher paint over old tags and the tags' ghosts, chalky high up and grimy at the plinth.
 */
function redPanel(b: Bake, plane: Plane, s0: number, s1: number, y0: number, y1: number, bay: number) {
  const patches = panelPatches(bay, s0, s1).filter((p) => p.y1 < y1);
  const ss = cuts(s0, s1, 1.4 * F, patches.flatMap((p) => [p.z0, p.z1]));
  const ys = cuts(y0, y1, 1.5 * F, [y0 + 0.5 * F, ...patches.flatMap((p) => [p.y0, p.y1])]);
  cellWall(b, plane, ss, ys, (s, y, cs, cy) => {
    const tone = panelTone(bay, s, y);
    const over = patches.filter((p) => cs > p.z0 && cs < p.z1 && cy > p.y0 && cy < p.y1).pop();
    return over ? mixHex(over.color, tone, 0.42) : tone;
  });
}

/** A glazed door in a slot between panels: dark glass in a steel frame, a mullion across it. */
function glazedSlot(b: Bake, x: number, z0: number, z1: number, y0: number, y1: number) {
  face(b, [x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], PAINT.glass, GLASS, [1, 0, 0]);
  const frame = part(72, 'metal', 2, 0.1);
  solidBox(b, [x, y0, z0 - 0.12 * F], [x + 0.12 * F, y1, z0], PAINT.mullion, PAINT.mullion, frame, 'tfke');
  solidBox(b, [x, y0, z1], [x + 0.12 * F, y1, z1 + 0.12 * F], PAINT.mullion, PAINT.mullion, frame, 'tfke');
  solidBox(b, [x, y1, z0 - 0.12 * F], [x + 0.12 * F, y1 + 0.15 * F, z1 + 0.12 * F], PAINT.mullion, PAINT.mullion, METAL, 'tbe');
  solidBox(b, [x, 7.2 * F, z0], [x + 0.08 * F, 7.35 * F, z1], PAINT.mullion, PAINT.mullion, METAL, 'tbe');
}

/**
 * Roessler's low red wing (refs: the Camarillo photograph, Luc's side view, the 2023 frames): two wings either
 * side of the open hallway the run-up comes through, rust-red rendered panels between pale cast pilasters on a
 * pale plinth, the odd glazed door in a slot, the plain pale fin wall left of the hallway with its louvres, and
 * the deep roof: exposed-aggregate fascia panels in a smooth frame over a ribbed soffit that shades the wall.
 */
export function buildRoessler(props: Bake, shadows: ShadowBox[]) {
  const x = UC_DAVIS_BUILDING_FRONT_X;
  const z0 = UC_DAVIS_BUILDING_Z0, z1 = UC_DAVIS_BUILDING_Z1;
  const hall = UC_DAVIS_HALL_HALF_WIDTH, back = UC_DAVIS_BUILDING_BACK_X;
  // The two wings. Their fronts are dressed below; the left wing's end is the fin wall's return.
  solidBox(props, [back, LOWER, z0], [x, 13 * F, -hall], PAINT.pilaster, PAINT.soffit, part(64, 'concrete', 2, 0.14), 'tbkle');
  solidBox(props, [back, LOWER, hall], [x, 13 * F, z1], PAINT.fin, PAINT.soffit, part(70, 'concrete', 2, 0.14), 'tbkle');
  shadows.push({ min: [back, LOWER, z0], max: [x, 13 * F, -hall] }, { min: [back, LOWER, hall], max: [x, 13 * F, z1] });
  // The left wing's end over the planted bank: the same pale paint, grimy where the soil meets it.
  const end = facingZ(z1, 1);
  cellWall(props, end, cuts(back, x, 3 * F), cuts(LOWER, 13 * F, 2 * F, [0, 0.8 * F, 2 * F]), (s, y) => finTone(s, y - ucDavisSideBankTop(s)), CONCRETE);

  // The right wing's front: bays of red panel between pilasters, every fourth bay with a glazed door at its start.
  const front = facingX(x + 0.12);
  for (let z = z0 + 0.5 * F, bay = 0; z < z1; z += 9 * F, bay++) {
    const stop = Math.min(z + 8.5 * F, -hall);
    if (stop <= z) continue;
    const door = bay % 4 === 0 && z + 2.6 * F <= stop;
    if (door) glazedSlot(props, x + 0.12, z + 0.25 * F, z + 1.65 * F, 0.42 * F, 8.6 * F);
    if (door) redPanel(props, front, z + 0.25 * F, z + 1.65 * F, 8.75 * F, 11.6 * F, bay + 40);
    redPanel(props, front, door ? z + 1.77 * F : z, stop, 0.4 * F, 11.6 * F, bay);
    if (door) redPanel(props, front, z, z + 0.13 * F, 0.4 * F, 11.6 * F, bay);
    solidBox(props, [x, 0, z - 0.35 * F], [x + 0.25 * F, 12 * F, z], PAINT.pilaster, PAINT.pilaster, part(66, 'concrete', 2, 0.12), 'fke');
  }
  // The pale fin wall left of the hallway, with louvres high up, and its plinth.
  const fin = facingX(x + 0.12);
  cellWall(props, fin, cuts(hall + 0.4 * F, z1, 2.2 * F, [9 * F, 12 * F]), cuts(0, 12 * F, 1.6 * F, [0.6 * F, 9.4 * F, 10.8 * F]),
    (s, y, cs, cy) => (cs > 9 * F && cs < 12 * F && cy > 9.4 * F && cy < 10.8 * F ? PAINT.louvre : finTone(s, y)), CONCRETE);
  for (let k = 0; k < 6; k++) {
    const y = (9.47 + k * 0.22) * F;
    solidBox(props, [x + 0.12, y, 9 * F], [x + 0.12 + 0.18 * F, y + 0.07 * F, 12 * F], PAINT.louvreSlot, PAINT.louvre, METAL, 'tbe');
  }
  // Plinths, and the pilasters either side of the hallway.
  for (const [a, b] of [[z0, -hall], [hall, z1]]) {
    solidBox(props, [x, 0, a], [x + 0.32 * F, 0.42 * F, b], mixHex(PAINT.plinth, PAINT.plinthGrime, 0.35), PAINT.plinth, part(68, 'concrete', 2, 0.1), 'tfke');
  }
  for (const z of [-hall - 0.4 * F, hall]) solidBox(props, [x, 0, z], [x + 0.25 * F, 12 * F, z + 0.4 * F], PAINT.pilaster, PAINT.pilaster, part(67, 'concrete', 2, 0.12), 'fke');

  buildHallway(props);
  buildRoof(props, shadows);
}

/**
 * The open hallway between the wings: white render on the left wall, red panels on the right, a pale ceiling
 * low over it with a lamp. Its far end stays open, as the 2023 frames show it, light at the end.
 */
function buildHallway(props: Bake) {
  const x = UC_DAVIS_BUILDING_FRONT_X, back = UC_DAVIS_BUILDING_BACK_X, hall = UC_DAVIS_HALL_HALF_WIDTH;
  cellWall(props, facingZ(hall - 0.1, -1), cuts(back, x, 3 * F), cuts(0, 11.5 * F, 1.5 * F, [0.6 * F]), (s, y) => finTone(s, y, PAINT.hallWall), STUCCO);
  for (let s = back, bay = 0; s < x; s += 9.6 * F, bay++) {
    redPanel(props, facingZ(-hall + 0.1, 1), s + 0.2 * F, Math.min(x, s + 9.6 * F), 0, 11.5 * F, 80 + bay);
  }
  solidBox(props, [back, 11.5 * F, -hall], [x, 13 * F, hall], PAINT.hallCeiling, PAINT.soffit, part(71, 'concrete', 2, 0.1), 'bfke');
  // A plain lamp box on the ceiling, halfway along.
  solidBox(props, [-25 * F, 11.25 * F, -0.6 * F], [-23 * F, 11.5 * F, 0.6 * F], '#d9d7cc', '#d9d7cc', METAL, 'bfkle');
}

/**
 * The deep roof: its slab running out over the terrace, a smooth frame round exposed-aggregate fascia panels
 * on its face (cells of one plane), the ribbed soffit under it shading the top of the wall.
 */
function buildRoof(props: Bake, shadows: ShadowBox[]) {
  const z0 = UC_DAVIS_BUILDING_Z0 - F, z1 = UC_DAVIS_BUILDING_Z1;
  const min: Vec3 = [UC_DAVIS_BUILDING_BACK_X, UC_DAVIS_ROOF_BOTTOM, z0], max: Vec3 = [UC_DAVIS_ROOF_FRONT_X, UC_DAVIS_ROOF_TOP, z1];
  solidBox(props, min, max, PAINT.soffit, '#9e9b91', part(74, 'concrete', 2, 0.14), 'tb');
  solidBox(props, min, max, PAINT.fasciaFrame, PAINT.fasciaFrame, part(75, 'concrete', 2, 0.14), 'fkl');
  shadows.push({ min, max });
  // The fascia: frame bands top and bottom, a frame strip every five feet, aggregate panels between.
  const bays: number[] = [];
  for (let z = z0; z < z1; z += 5 * F) bays.push(z, Math.min(z1, z + 0.25 * F));
  const ss = cuts(z0, z1, 100 * F, bays);
  const ys = [UC_DAVIS_ROOF_BOTTOM, 12.6 * F, 14.05 * F, UC_DAVIS_ROOF_TOP];
  for (let i = 0; i + 1 < ss.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const [s0, s1, y0, y1] = [ss[i], ss[i + 1], ys[j], ys[j + 1]];
    const strip = s1 - s0 < 0.3 * F || j !== 1;
    const k = Math.floor((s0 - z0) / (5 * F));
    const c = strip ? PAINT.fasciaFrame : mixHex(PAINT.fascia, '#b8b2a3', 0.4 * hash2(k, 1, 620));
    face(props, [UC_DAVIS_ROOF_FRONT_X, y0, s0], [UC_DAVIS_ROOF_FRONT_X, y0, s1], [UC_DAVIS_ROOF_FRONT_X, y1, s1], [UC_DAVIS_ROOF_FRONT_X, y1, s0],
      c, strip ? part(76, 'concrete', 2, 0.1) : AGGREGATE, [1, 0, 0]);
  }
  // Ribs under the soffit every five feet, out to the fascia.
  for (let z = UC_DAVIS_BUILDING_Z0; z < z1; z += 5 * F) {
    solidBox(props, [UC_DAVIS_BUILDING_FRONT_X, 11.8 * F, z], [UC_DAVIS_ROOF_FRONT_X, UC_DAVIS_ROOF_BOTTOM, Math.min(z + 0.32 * F, z1)], PAINT.beam, PAINT.beam, CONCRETE, 'bfke');
  }
}

/**
 * A cast-concrete campus block facing `facing` (+1 toward +x, −1 toward −x) with its face at `x`, from `z0` to
 * `z1` and `base` up `floors` storeys: columns and floor slabs standing proud of the face, each bay a dark
 * window band over a beige spandrel, and on the street floor a recessed, darker arcade.
 */
function campusBlock(props: Bake, x: number, z0: number, z1: number, base: number, floors: number, facing: 1 | -1, depth: number, ink: number) {
  const storey = 12.5 * F, height = floors * storey + 2 * F;
  const back = x - facing * depth;
  solidBox(props, [Math.min(x, back), base, z0], [Math.max(x, back), base + height, z1], PAINT.frame, '#a9a79d', part(ink, 'concrete', 2, 0.14), facing > 0 ? 'tfkl' : 'tfke');
  const plane = facingX(x + facing * 0.12, facing);
  const bay = 11 * F, column = 1.4 * F;
  /** Each bay: a beige spandrel to sill height, then two panes of glass split by a mullion, a band of frame over them. */
  const sill = 4.6 * F, head = 10.6 * F, mullion = 0.25 * F;
  const ss: number[] = [];
  for (let z = z0; z < z1; z += bay) {
    const mid = z + column + (bay - column) / 2;
    ss.push(z, Math.min(z1, z + column), mid - mullion / 2, mid + mullion / 2);
  }
  const ys: number[] = [base];
  for (let f = 0; f < floors; f++) ys.push(base + f * storey + 1.2 * F, base + f * storey + sill, base + f * storey + head, base + (f + 1) * storey);
  ys.push(base + height);
  const cell = (cs: number, cy: number) => {
    const k = (cs - z0) % bay, level = (cy - base) % storey, f = Math.floor((cy - base) / storey);
    const mid = column + (bay - column) / 2;
    if (k < column || level < 1.2 * F || f >= floors || level > head) return 'frame';
    if (Math.abs(k - mid) < mullion) return 'mullion';
    return level > sill ? 'glass' : f === 0 ? 'arcade' : 'spandrel';
  };
  cellWall(props, plane, cuts(z0, z1, 1000 * F, ss), cuts(base, base + height, 1000 * F, ys), (_s, _y, cs, cy) => {
    switch (cell(cs, cy)) {
      case 'glass': return Math.floor((cy - base) / storey) === 0 ? '#2b3433' : PAINT.window;
      case 'mullion': return PAINT.mullion;
      case 'spandrel': return mixHex(PAINT.spandrel, PAINT.frameShade, 0.3 * hash2(Math.floor((cs - z0) / bay), Math.floor((cy - base) / storey), 630));
      case 'arcade': return PAINT.frameShade;
      default: return PAINT.frame;
    }
  }, (cs, cy) => (cell(cs, cy) === 'glass' ? GLASS : cell(cs, cy) === 'mullion' ? METAL : STUCCO));
  // Columns and slab edges stand out from the face, so the sun picks out the grid.
  for (let z = z0; z < z1; z += bay) {
    const zz = Math.min(z1 - 1.4 * F, z);
    solidBox(props, [Math.min(x, x + facing * 1.4 * F), base, zz], [Math.max(x, x + facing * 1.4 * F), base + height, zz + 1.4 * F], PAINT.frame, PAINT.frame, part(ink + 1, 'concrete', 2, 0.1), facing > 0 ? 'tfke' : 'tfkl');
  }
  for (let f = 1; f <= floors; f++) {
    const y = base + f * storey;
    solidBox(props, [Math.min(x, x + facing * F), y - 1.2 * F, z0], [Math.max(x, x + facing * F), y, z1], PAINT.balcony, PAINT.balcony, part(ink + 2, 'concrete', 2, 0.1), facing > 0 ? 'tbfke' : 'tbfkl');
  }
}

/** The campus blocks' footprints (set units): the taller block back past the wing's left end, facing +x, and the building across the quad, facing −x. */
export const UC_DAVIS_BLOCKS = [
  { x0: -118 * F, x1: -72 * F, z0: 24 * F, z1: 92 * F },
  { x0: 98 * F, x1: 116 * F, z0: -77 * F, z1: 88 * F },
] as const;

/**
 * The campus round the gap: the taller block standing back beyond the wing's left end (the 2023 frames), and
 * the building across the quad below, both pale cast concrete with recessed glazing.
 */
export function buildCampusBuildings(props: Bake, shadows: ShadowBox[]) {
  const [tall, across] = UC_DAVIS_BLOCKS;
  campusBlock(props, tall.x1, tall.z0, tall.z1, LOWER, 5, 1, tall.x1 - tall.x0, 140);
  campusBlock(props, across.x0, across.z0, across.z1, LOWER, 3, -1, across.x1 - across.x0, 150);
  shadows.push({ min: [across.x0, LOWER, across.z0], max: [across.x1, LOWER + 39.5 * F, across.z1] });
}
