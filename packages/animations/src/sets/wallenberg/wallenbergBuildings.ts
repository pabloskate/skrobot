import type { Vec3 } from '../../camera/view';
import type { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { BLOCK, F, INCH, face, mixHex, part, pipe, solidBox, tag, tube, type RailShadow, type ShadowBox } from './wallenbergKit';
import {
  WALLENBERG_ANNEX_FRONT_X,
  WALLENBERG_ANNEX_HEIGHT,
  WALLENBERG_ANNEX_X,
  WALLENBERG_DROP,
  WALLENBERG_GYM_BACK_X,
  WALLENBERG_GYM_FAR_Z,
  WALLENBERG_GYM_HEIGHT,
  WALLENBERG_GYM_X,
  WALLENBERG_GYM_Z,
  WALLENBERG_RAMP,
  WALLENBERG_RUN,
  wallenbergSlope,
} from './wallenbergLayout';
import { WALLENBERG_PAINT as PAINT } from './wallenbergPalette';

const BRICK = tag('brick');
const GLASS = tag('glass');
const METAL = tag('metal');
const SIDING = tag('siding');
const STUCCO = tag('stucco');
const WALL = tag(BLOCK);
const FAR = 1000 * F;

/** Where the gym's brick base stops: about knee to chest height, as in the photographs. */
export const GYM_BRICK_TOP = 4.75 * F;
/** Where the brick runs along the front from the corner on the line, the downspout at its end. */
export const GYM_BRICK_END_Z = WALLENBERG_GYM_Z + 8.5 * F;
/** The front door, with its blue awning, facing the top platform. */
export const GYM_DOOR_Z = 18.5 * F;

/**
 * A point on one of the gym's walls: `s` along it and `y` up it, `out` proud of it. The front faces +x down the
 * gap; the side faces −z over the alley.
 */
type Wall = 'front' | 'side';
const onWall = (wall: Wall, s: number, y: number, out = 0): Vec3 =>
  wall === 'front' ? [WALLENBERG_GYM_X + out, y, s] : [s, y, WALLENBERG_GYM_Z - out];
const wallNormal = (wall: Wall): Vec3 => (wall === 'front' ? [1, 0, 0] : [0, 0, -1]);

/** A flat panel on a wall, `s0`…`s1` along it and `y0`…`y1` up it, `out` proud of it, facing out. */
function panel(b: Bake, wall: Wall, s0: number, s1: number, y0: number, y1: number, out: number, color: string, ink = WALL) {
  // Wound so the face looks out of the wall whichever way the wall runs.
  const [a, c] = wall === 'front' ? [s1, s0] : [s0, s1];
  face(b, onWall(wall, a, y0, out), onWall(wall, c, y0, out), onWall(wall, c, y1, out), onWall(wall, a, y1, out), color, ink, wallNormal(wall));
}

/** A box standing proud of a wall: its face and its edges (top, bottom, ends), `depth` deep. */
function relief(b: Bake, wall: Wall, s0: number, s1: number, y0: number, y1: number, depth: number, color: string, ink = WALL, top = color) {
  const [lo, hi] = [Math.min(s0, s1), Math.max(s0, s1)];
  if (wall === 'front') solidBox(b, [WALLENBERG_GYM_X, y0, lo], [WALLENBERG_GYM_X + depth, y1, hi], color, top, ink, 'tbfke');
  else solidBox(b, [lo, y0, WALLENBERG_GYM_Z - depth], [hi, y1, WALLENBERG_GYM_Z], color, top, ink, 'tbkle');
}

/** A round wall vent: a galvanized hood with its dark throat. */
function vent(b: Bake, wall: Wall, s: number, y: number) {
  tube(b, [onWall(wall, s, y, 1), onWall(wall, s, y, 12)], 11, PAINT.vent, METAL, 14);
  tube(b, [onWall(wall, s, y, 12), onWall(wall, s, y, 13)], 7.5, PAINT.ventCap, METAL, 14);
}

/** A wall-pack light: a dark box with a pale lens under it. */
function lamp(b: Bake, wall: Wall, s: number, y: number) {
  relief(b, wall, s - 0.5 * F, s + 0.5 * F, y, y + 0.6 * F, 10, PAINT.lamp, METAL);
  relief(b, wall, s - 0.4 * F, s + 0.4 * F, y - 0.08 * F, y, 9, '#e9e6d6', METAL);
}

/**
 * The gym's glazing over its blue panels: ribbed powder-blue panels (the look's siding grooves), dark windows
 * above them in a pale frame, and the cream block between.
 */
function glazing(b: Bake, wall: Wall, s0: number, s1: number, panelFrom: number, glassFrom: number, glassTo: number) {
  panel(b, wall, s0, s1, panelFrom, glassFrom, 3, PAINT.panel, SIDING);
  panel(b, wall, s0, s1, glassFrom, glassTo, 1, PAINT.glass, GLASS);
  // The sill between them, the head over the glass, and the mullions.
  relief(b, wall, s0, s1, glassFrom - 2, glassFrom + 1.5, 5, PAINT.mullion, METAL);
  relief(b, wall, s0, s1, glassTo - 1.5, glassTo, 4, PAINT.mullion, METAL);
  const panes = Math.max(2, Math.round((s1 - s0) / (3.2 * F)));
  for (let k = 0; k <= panes; k++) {
    const s = s0 + ((s1 - s0) * k) / panes;
    relief(b, wall, s - 1.1, s + 1.1, glassFrom, glassTo, 3.5, PAINT.mullion, METAL);
  }
  relief(b, wall, s0, s1, (glassFrom + glassTo) / 2 - 0.8, (glassFrom + glassTo) / 2 + 0.8, 3, PAINT.mullion, METAL);
}

/**
 * The gym (refs: FindSkateSpots, the roll-in stills, the 51-inch shot): painted block, cream, a red brick base
 * round its corner on the line and along the alley, powder-blue ribbed panels under dark windows in bays between
 * block pilasters, round vents and wall-pack lights in the band above the brick; on the front, the door with its
 * blue awning and the conduit running diagonally across the plain wall to a light over it; on the side, the
 * little roof over a side door that the roll-in is set against.
 */
export function buildGym(props: Bake, shadows: ShadowBox[]) {
  const x = WALLENBERG_GYM_X, z = WALLENBERG_GYM_Z, h = WALLENBERG_GYM_HEIGHT;
  solidBox(props, [WALLENBERG_GYM_BACK_X, 0, z], [x, h, WALLENBERG_GYM_FAR_Z], PAINT.block, '#9c9a92', part(80, BLOCK, 2, 0.15), 'tfke');
  // The parapet's metal coping.
  solidBox(props, [WALLENBERG_GYM_BACK_X - 4, h, z - 4], [x + 4, h + 0.7 * F, WALLENBERG_GYM_FAR_Z + 4], PAINT.coping, PAINT.coping, part(86, 'metal', 2, 0.12), 'tbfkle');
  shadows.push({ min: [WALLENBERG_GYM_BACK_X, 0, z], max: [x, h, WALLENBERG_GYM_FAR_Z] });

  // Front: brick round the corner, the glazing above it in two bays, then plain block to the door.
  relief(props, 'front', z, GYM_BRICK_END_Z, 0, GYM_BRICK_TOP, 2.2, PAINT.brick, BRICK, '#a39684');
  glazing(props, 'front', z + 0.9 * F, z + 4.3 * F, 9.5 * F, 14 * F, 20.5 * F);
  glazing(props, 'front', z + 5.4 * F, GYM_BRICK_END_Z - 0.6 * F, 9.5 * F, 14 * F, 20.5 * F);
  relief(props, 'front', z + 4.3 * F, z + 5.4 * F, GYM_BRICK_TOP, h, 4, PAINT.block);
  for (const s of [z + 2.6 * F, z + 6.6 * F]) vent(props, 'front', s, 7.3 * F);
  // The downspout at the brick's end, copper gone orange, down to a shoe at the foot.
  tube(props, [onWall('front', GYM_BRICK_END_Z + 0.4 * F, h, 4), onWall('front', GYM_BRICK_END_Z + 0.4 * F, 0.8 * F, 4), onWall('front', GYM_BRICK_END_Z + 0.4 * F, 0.15 * F, 12)], 2.4, PAINT.downspout, METAL);
  // The door, its frame, the awning and its fascia, a sign beside it.
  const d0 = GYM_DOOR_Z, d1 = GYM_DOOR_Z + 3.4 * F;
  relief(props, 'front', d0 - 3, d1 + 3, 0, 7.4 * F, 1.2, '#55514b', METAL);
  relief(props, 'front', d0, d1, 0, 7.15 * F, 2.2, PAINT.door, METAL);
  relief(props, 'front', d0 + 0.3 * F, d0 + 1.3 * F, 3.4 * F, 3.6 * F, 4, '#b5b8b0', METAL);
  solidBox(props, [x, 7.5 * F, d0 - 0.9 * F], [x + 2.4 * F, 7.85 * F, d1 + 0.9 * F], PAINT.awning, PAINT.awning, part(108, 'metal', 2, 0.12), 'tbfke');
  solidBox(props, [x + 2.4 * F, 7.5 * F, d0 - 0.9 * F], [x + 2.55 * F, 8.05 * F, d1 + 0.9 * F], PAINT.awningFascia, PAINT.awningFascia, METAL, 'tbfke');
  shadows.push({ min: [x, 7.5 * F, d0 - 0.9 * F], max: [x + 2.55 * F, 8.05 * F, d1 + 0.9 * F] });
  relief(props, 'front', d0 - 1.4 * F, d0 - 0.7 * F, 4.3 * F, 5 * F, 1, PAINT.sign, METAL);
  // The conduit up across the plain block to the light over the door, and a second light high on the wall.
  tube(props, [onWall('front', d1 + 9 * F, 6.8 * F, 3), onWall('front', d0 + 1 * F, 14 * F, 3), onWall('front', d0 - 3 * F, 14 * F, 3)], 1.1, PAINT.conduit, METAL);
  lamp(props, 'front', d0 + 1.7 * F, 12.3 * F);
  lamp(props, 'front', d1 + 12 * F, 17.5 * F);
  // A second downspout at the far end of the front.
  tube(props, [onWall('front', WALLENBERG_GYM_FAR_Z - 1 * F, h, 4), onWall('front', WALLENBERG_GYM_FAR_Z - 1 * F, 0.15 * F, 4)], 2.4, PAINT.blockShade, METAL);

  // Side: the brick base along the run-up, then bays of glazing between pilasters, vents and lights below them.
  relief(props, 'side', WALLENBERG_ANNEX_FRONT_X, x, 0, GYM_BRICK_TOP, 2.2, PAINT.brick, BRICK, '#a39684');
  const bay = 9.2 * F, pier = 1.3 * F;
  for (let s1 = x - 0.6 * F; s1 - bay > WALLENBERG_GYM_BACK_X + 1 * F; s1 -= bay + pier) {
    const s0 = s1 - bay;
    glazing(props, 'side', s0, s1, 11 * F, 17.5 * F, 22 * F);
    relief(props, 'side', s0 - pier, s0, GYM_BRICK_TOP, h, 4, PAINT.block);
    if (s0 > WALLENBERG_ANNEX_FRONT_X) {
      vent(props, 'side', s0 + bay * 0.62, 8.6 * F);
      lamp(props, 'side', s0 + bay * 0.22, 9.4 * F);
    }
  }
  relief(props, 'side', x - 0.6 * F, x, GYM_BRICK_TOP, h, 4, PAINT.block);
  tube(props, [onWall('side', -30.5 * F, h, 4), onWall('side', -30.5 * F, 0.15 * F, 4)], 2.4, PAINT.downspout, METAL);

  // The little roof over the side door, level with the roll-in's deck: the ramp's high end butts up to it.
  const r = WALLENBERG_RAMP;
  const roof = r.height;
  const front = r.deck - 1;
  solidBox(props, [front - 5.5 * F, roof - 7 * INCH, -0.5 * F], [front, roof, z], '#8c9ea8', '#a9b5ba', part(109, 'metal', 2, 0.12), 'tbkle');
  shadows.push({ min: [front - 5.5 * F, roof - 7 * INCH, -0.5 * F], max: [front, roof, z] });
  relief(props, 'side', front - 3.6 * F, front - 0.6 * F, 0, 7 * F, 1.5, PAINT.door, METAL);
  relief(props, 'side', front - 1.25 * F, front - 1 * F, 3.4 * F, 3.7 * F, 3, '#b5b8b0', METAL);
}

/**
 * The one-storey brick annex against the gym's side wall near its back, well behind the roll-in: its pink door,
 * a buff parapet, and the planted terrace on its roof behind a galvanized rail (the 2024 group photograph).
 */
export function buildAnnex(props: Bake, _mesh: Bake, rails: RailShadow[], shadows: ShadowBox[]) {
  const x0 = WALLENBERG_ANNEX_X, x1 = WALLENBERG_ANNEX_FRONT_X;
  const z0 = -12 * F, z1 = WALLENBERG_GYM_Z;
  const h = WALLENBERG_ANNEX_HEIGHT;
  solidBox(props, [x0, 0, z0], [x1, h, z1], PAINT.brick, '#8d8a80', part(84, 'brick', 2, 0.15), 'tke');
  shadows.push({ min: [x0, 0, z0], max: [x1, h, z1] });
  // The door, up on the slope's side, and its head.
  const sill = wallenbergSlope(x1);
  solidBox(props, [x1, sill, -10 * F], [x1 + 3, sill + 7 * F, -7.2 * F], PAINT.annexDoor, PAINT.annexDoor, part(85, 'metal', 2, 0.1), 'e');
  solidBox(props, [x1, sill + 7 * F, -10.3 * F], [x1 + 4, sill + 7.4 * F, -6.9 * F], PAINT.annexParapet, PAINT.annexParapet, STUCCO, 'te');
  // A louvred vent low on the alley side.
  solidBox(props, [x1, 1.2 * F, -1.5 * F], [x1 + 1.5, 2.6 * F, 1.5 * F], '#7d7a70', '#7d7a70', METAL, 'e');
  // Its parapet and coping.
  solidBox(props, [x0, h, z0], [x1 + 3, h + 1.2 * F, z0 + 0.7 * F], PAINT.annexParapet, PAINT.annexParapet, part(87, 'stucco', 2, 0.1), 'tke');
  solidBox(props, [x1 - 0.7 * F, h, z0], [x1 + 3, h + 1.2 * F, z1], PAINT.annexParapet, PAINT.annexParapet, part(88, 'stucco', 2, 0.1), 'tkle');
  // The planter along the roof's front, white hydrangeas in it, and the rail behind.
  solidBox(props, [x1 - 3.2 * F, h, -11 * F], [x1 - 0.8 * F, h + 2 * F, 3 * F], PAINT.planter, '#6b5a47', part(89, 'concrete', 2, 0.1), 'tfkle');
  for (let k = 0; k < 7; k++) {
    const cz = (-10.2 + k * 1.9) * F, cx = x1 - 2 * F;
    const r = (0.85 + 0.35 * hash2(k, 1, 87)) * F;
    shrubMass(props, cx, h + 2 * F, cz, r, k);
    for (let f = 0; f < 3; f++) {
      const a = f * 2.1 + k;
      const at: Vec3 = [cx + Math.cos(a) * r * 0.55, h + 2 * F + r * (0.75 + 0.2 * hash2(k, f, 88)), cz + Math.sin(a) * r * 0.55];
      solidBox(props, [at[0] - 3, at[1], at[2] - 3], [at[0] + 3, at[1] + 4, at[2] + 3], PAINT.bloom, PAINT.bloom, tag(13), 'tfkle');
    }
  }
  const railY = h + 1.2 * F + 3 * F;
  pipe(props, [[x1 - 4 * F, railY, z0 + 0.4 * F], [x1 - 4 * F, railY, z1 - 0.4 * F]], rails, 1.4, PAINT.galvanised);
  for (let s = z0 + 0.4 * F; s <= z1; s += 4 * F) tube(props, [[x1 - 4 * F, h, s], [x1 - 4 * F, railY, s]], 1.3, PAINT.galvanised);
}

function shrubMass(props: Bake, x: number, y: number, z: number, r: number, seed: number) {
  const around = 8;
  for (let i = 0; i < 3; i++) for (let j = 0; j < around; j++) {
    const p = (ii: number, jj: number): Vec3 => {
      const lat = (Math.PI / 2) * (ii / 3), lon = (jj / around) * Math.PI * 2;
      const wob = 0.85 + 0.3 * hash2(seed, ii * 10 + (jj % around), 90);
      return [x + Math.cos(lat) * Math.cos(lon) * r * wob, y + Math.sin(lat) * r * wob, z + Math.cos(lat) * Math.sin(lon) * r * wob];
    };
    const a0 = p(i, j), a1 = p(i, j + 1), b1 = p(i + 1, j + 1), b0 = p(i + 1, j);
    const n: Vec3 = [(a0[0] + b1[0]) / 2 - x, (a0[1] + b1[1]) / 2 - y, (a0[2] + b1[2]) / 2 - z];
    const m = Math.hypot(...n) || 1;
    props.quad(a0, b0, b1, a1, [n[0] / m, n[1] / m, n[2] / m], { color: mixHex(PAINT.shrub, '#3f4f30', 0.3 * (1 - i / 3)) }, tag(13));
  }
}

/* ----- The neighbourhood ----- */

/**
 * One apartment building in the Richmond's manner: a stucco block with a cornice, a garage door and an entry on
 * the street floor, and above it, floor by floor, either a three-sided bay window or a pair of plain windows,
 * white sash all round. Facing +x (`facing` 1) or −x, its facade at `x`, `z0`…`z1` along the street.
 */
function apartment(props: Bake, x: number, base: number, z0: number, z1: number, height: number, facing: 1 | -1, color: string, seed: number) {
  const depth = 40 * F;
  const back = x - facing * depth;
  solidBox(props, [Math.min(x, back), base, z0], [Math.max(x, back), base + height, z1], color, '#a8a69c', part(151, 'stucco', 2, 0.12), facing > 0 ? 'tfke' : 'tfkl');
  const out = (d: number) => x + facing * d;
  const n: Vec3 = [facing, 0, 0];
  /** A flat quad on the facade, `d` proud of it. */
  const flat = (s0: number, s1: number, y0: number, y1: number, d: number, paint: string, ink = STUCCO) => {
    const [a, c] = facing > 0 ? [s1, s0] : [s0, s1];
    face(props, [out(d), y0, a], [out(d), y0, c], [out(d), y1, c], [out(d), y1, a], paint, ink, n);
  };
  const window = (s0: number, s1: number, y0: number, y1: number, d: number) => {
    flat(s0 - 0.35 * F, s1 + 0.35 * F, y0 - 0.35 * F, y1 + 0.35 * F, d + 0.6, PAINT.trim);
    flat(s0, s1, y0, y1, d + 1, PAINT.windowGlass, GLASS);
    flat((s0 + s1) / 2 - 1, (s0 + s1) / 2 + 1, y0, y1, d + 1.4, PAINT.windowFrame, METAL);
    flat(s0, s1, (y0 + y1) / 2 - 0.8, (y0 + y1) / 2 + 0.8, d + 1.4, PAINT.windowFrame, METAL);
  };
  const width = z1 - z0;
  // The street floor: a garage door and the entry beside it.
  const garage0 = z0 + 0.12 * width, garage1 = garage0 + Math.min(9 * F, width * 0.45);
  flat(garage0, garage1, base, base + 7.5 * F, 0.6, PAINT.garage, METAL);
  for (let k = 1; k < 5; k++) flat(garage0, garage1, base + k * 1.5 * F - 0.3, base + k * 1.5 * F + 0.3, 1, '#a9a79e', METAL);
  const entry = z1 - 0.18 * width;
  flat(entry - 1.7 * F, entry + 1.7 * F, base, base + 7.2 * F, 0.6, '#5b4a3e', METAL);
  window(garage1 + 1.5 * F, entry - 2.6 * F, base + 3.5 * F, base + 7 * F, 0);
  // The floors above.
  const bay = hash2(seed, 2, 152) > 0.4;
  for (let y = base + 10 * F; y + 6 * F < base + height - 3 * F; y += 10 * F) {
    if (bay) {
      const b0 = z0 + 0.15 * width, b1 = z0 + 0.62 * width, d = 2.6 * F;
      solidBox(props, [Math.min(out(0), out(d)), y - 1 * F, b0], [Math.max(out(0), out(d)), y + 7.2 * F, b1], color, PAINT.trim, part(153, 'stucco', 2, 0.1), facing > 0 ? 'tbfke' : 'tbfkl');
      window(b0 + 0.8 * F, b1 - 0.8 * F, y + 0.6 * F, y + 5.6 * F, d);
      window(b1 + 1.6 * F, z1 - 1.6 * F, y + 0.6 * F, y + 5.6 * F, 0);
    } else {
      const mid = (z0 + z1) / 2;
      window(z0 + 2 * F, mid - 1.2 * F, y + 0.6 * F, y + 5.6 * F, 0);
      window(mid + 1.2 * F, z1 - 2 * F, y + 0.6 * F, y + 5.6 * F, 0);
    }
  }
  // The cornice.
  solidBox(props, [Math.min(out(-0.5), out(1.1 * F)), base + height - 1.4 * F, z0], [Math.max(out(-0.5), out(1.1 * F)), base + height, z1], PAINT.trim, PAINT.trim, part(154, 'stucco', 2, 0.1), facing > 0 ? 'tbfke' : 'tbfkl');
}

/**
 * The neighbourhood round the school: stucco apartments in pale colours up the hill beyond the gate and the
 * lot (the 51-inch shot), and across the yard below the blocks.
 */
export function buildNeighbourhood(props: Bake) {
  const colors = PAINT.houses;
  const row = (x: number, base: number, from: number, count: number, facing: 1 | -1, seed: number) => {
    let z = from;
    for (let k = 0; k < count; k++) {
      const width = (24 + 8 * hash2(k, seed, 150)) * F;
      const height = (28 + 14 * hash2(k, seed, 151)) * F;
      const setback = hash2(k, seed, 155) * 3 * F;
      apartment(props, x - facing * setback, base, z, z + width - 1.2 * F, height, facing, colors[(k * 3 + seed) % colors.length], k * 13 + seed);
      z += width;
    }
  };
  row(WALLENBERG_GYM_BACK_X - 45 * F, wallenbergSlope(-FAR), -175 * F, 8, 1, 1);
  row(WALLENBERG_RUN + 150 * F, -WALLENBERG_DROP, -150 * F, 8, -1, 4);
}
