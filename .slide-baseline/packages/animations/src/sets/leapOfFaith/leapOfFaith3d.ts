import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, tone } from '../../camera/camera';
import type { Vec3 } from '../../camera/view';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { ClassicSpot3D } from '../classicSpot3d';
import type { WireMesh } from '../wireMesh';
import { hash2 } from '../setKit';
import {
  LEAP_OF_FAITH_ALCOVE_BACK, LEAP_OF_FAITH_ALCOVE_Z as WORLD_LEAP_OF_FAITH_ALCOVE_Z,
  LEAP_OF_FAITH_BALCONY_BACK, LEAP_OF_FAITH_BALCONY_END_Z as WORLD_LEAP_OF_FAITH_BALCONY_END_Z,
  LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_LANE_Z,
  LEAP_OF_FAITH_BEND_LENGTH, leapOfFaithStairPoint,
  LEAP_OF_FAITH_LOWER_RUN, LEAP_OF_FAITH_LOWER_STEPS,
  LEAP_OF_FAITH_MID_DROP, LEAP_OF_FAITH_MID_END_Z as WORLD_LEAP_OF_FAITH_MID_END_Z,
  LEAP_OF_FAITH_RAIL_HEIGHT, LEAP_OF_FAITH_RAIL_RADIUS,
  LEAP_OF_FAITH_HEAD_Z, LEAP_OF_FAITH_ROOF_Y, LEAP_OF_FAITH_RUN, leapOfFaithStairHeading,
  LEAP_OF_FAITH_STAIR_END_Z as WORLD_LEAP_OF_FAITH_STAIR_END_Z, LEAP_OF_FAITH_STAIR_RUN,
  LEAP_OF_FAITH_STAIR_X0, LEAP_OF_FAITH_STEPS,
  leapOfFaithGround, leapOfFaithRailBase as WORLD_leapOfFaithRailBase, leapOfFaithStairGround as WORLD_leapOfFaithStairGround,
} from './leapOfFaithLayout';

// The facade is authored in an architectural elevation's left-to-right z;
// reflect it once into the stage's camera convention, along with shadows.
const LEAP_OF_FAITH_ALCOVE_Z = -WORLD_LEAP_OF_FAITH_ALCOVE_Z;
const LEAP_OF_FAITH_BALCONY_END_Z = -WORLD_LEAP_OF_FAITH_BALCONY_END_Z;
const LEAP_OF_FAITH_MID_END_Z = -WORLD_LEAP_OF_FAITH_MID_END_Z;
const LEAP_OF_FAITH_STAIR_END_Z = -WORLD_LEAP_OF_FAITH_STAIR_END_Z;
const leapOfFaithRailBase = (z: number) => WORLD_leapOfFaithRailBase(-z);
const leapOfFaithStairGround = (z: number) => WORLD_leapOfFaithStairGround(-z);
const UP: Vec3 = [0, 1, 0];
const FRONT: Vec3 = [1, 0, 0];
const FLOOR = -LEAP_OF_FAITH_DROP;
const FAR = 300 * F;
/** Faces meant to read as flush stand this far apart. Exactly coplanar faces
 * z-fight (they flicker as the camera moves), at any depth precision. One unit
 * is a third of an inch: invisible, and many times what a depth buffer resolves. */
const STAND_OFF = 1;
const CONCRETE = '#ccd0c4';
const WHITE = '#d7dbd0';
const TREAD = '#adb2a7';
const METAL = '#939e99';
/** The railing's diamond mesh: wire gap, wire radius and color. */
const MESH: WireMesh = { spacing: 7.5, radius: 0.22, color: '#b3bcb3' };
const DETAIL: Ink = { id: 85, priority: 5, width: 0.16, kind: INK_PROP, solid: 10 };
const RAIL: Ink = { id: 62, priority: 6, width: 0.1, kind: INK_PROP };
type RailShadow = { a: Vec3; b: Vec3; radius: number };
type BoxShadow = { min: Vec3; max: Vec3 };
const lit = (color: string, n: Vec3) => ({ color: tone(color, lambert({ x: n[0], y: -n[1], z: n[2] })) });

function floor(b: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, lit(color, UP), NO_INK);
}

/** Stair wing pieces are authored straight, across in x and down the stair
 * in −z, then carried through the real plan: out from the walkway at 90°,
 * round the landing, along the facade. The facade, walkway, roof and
 * undercroft never pass through this. */
const stairVertex = ([x, y, z]: Vec3): Vec3 => {
  const point = leapOfFaithStairPoint(x, -z);
  return [point.x, y, -point.z];
};
class StairBake extends Bake {
  override vertex(p: Vec3, n: Vec3, paint: Paint, ink: Ink, corner: Vec3 = [0, 0, 0], band?: [number, number]) {
    // Authored across (+x) points to world (sin h, −cos h), downhill (−z) to (cos h, sin h).
    const h = leapOfFaithStairHeading(-p[2]), c = Math.cos(h), sn = Math.sin(h);
    const normal: Vec3 = [n[0] * sn - n[2] * c, n[1], n[0] * c + n[2] * sn];
    super.vertex(stairVertex(p), normal, paint, ink, corner, band);
  }
}

/** One panel of the diamond mesh over a railing: a quad rising with the stair,
 * its corners' (along, up) distances in `aCorner` for the wires to be drawn
 * from per pixel (wireMesh.ts). Unlike tubes of wire, that never sparkles. */
function meshPanel(b: Bake, x: number, z0: number, z1: number, y0: number, y1: number) {
  const width = z1 - z0;
  const height = LEAP_OF_FAITH_RAIL_HEIGHT - 12;
  const corners = ([[0, 0], [width, 0], [width, height], [0, height]] as const).map(([u, v]) => ({
    at: [x, y0 + (y1 - y0) * u / width + 7 + v, z0 + u] as Vec3,
    along: [u, v, 0] as Vec3,
  }));
  for (const k of [0, 1, 2, 0, 2, 3]) b.vertex(corners[k].at, FRONT, { color: MESH.color }, NO_INK, corners[k].along);
}

/** The late-1990s spot, before the elevator filled the leap. Baked into two
 * geometry buffers, with working stair treads, open bays and structural roof. */
export function buildLeapOfFaithGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const stairGround = new StairBake();
  const stairProps = new StairBake();
  const mesh = new Bake();
  const stairMesh = new StairBake();
  const railSegments: RailShadow[] = [];
  const shadowBoxes: BoxShadow[] = [];
  const makePipe = (b: Bake, stairs: boolean) => (points: Vec3[], radius = LEAP_OF_FAITH_RAIL_RADIUS, cast = true, color = METAL) => {
    b.tube(points, points.map(() => radius), { color, lit: { color: '#d3d7c9', from: -0.5, to: 1.5 } }, RAIL, 8);
    if (cast) for (let i = 1; i < points.length; i++) railSegments.push({ a: stairs ? stairVertex(points[i - 1]) : points[i - 1], b: stairs ? stairVertex(points[i]) : points[i], radius });
  };
  const pipe = makePipe(props, false);
  const stairPipe = makePipe(stairProps, true);
  const structure = (min: Vec3, max: Vec3, side = WHITE, top = CONCRETE, shadow = true, faces?: string) => {
    props.box(min, max, side, top, DETAIL, faces);
    if (shadow) shadowBoxes.push({ min, max });
  };

  // One continuous lower floor includes the court and the open undercroft.
  // Raised stair treads and the landing cover its footprint, without cracks
  // from trying to clip axis-aligned paving against the dogleg's polygon.
  floor(ground, -FAR, FAR, -FAR, FAR, FLOOR, '#bcb9a7');
  floor(ground, LEAP_OF_FAITH_BALCONY_BACK, 0, -LEAP_OF_FAITH_HEAD_Z, LEAP_OF_FAITH_BALCONY_END_Z, 0, '#b3b6ac');
  // The head of the stairs: the walkway floor runs on behind it, closed off
  // by the stair's far wall carried back along it.
  structure([LEAP_OF_FAITH_BALCONY_BACK, 0, -LEAP_OF_FAITH_HEAD_Z - 0.5 * F], [0, 3.5 * F, -LEAP_OF_FAITH_HEAD_Z], WHITE, CONCRETE, false, 'tfkle');
  // Upper concrete floor edge, then the large recessed bay beneath it. The
  // floor above is its top, so the slab has none of its own to fight it.
  structure([LEAP_OF_FAITH_ALCOVE_BACK, -1.5 * F, LEAP_OF_FAITH_ALCOVE_Z], [0, 0, LEAP_OF_FAITH_BALCONY_END_Z], WHITE, CONCRETE, true, 'bfkle');
  structure([LEAP_OF_FAITH_ALCOVE_BACK - 0.7 * F, FLOOR, LEAP_OF_FAITH_ALCOVE_Z], [LEAP_OF_FAITH_ALCOVE_BACK, -1.5 * F, LEAP_OF_FAITH_BALCONY_END_Z], '#70868a');
  structure([LEAP_OF_FAITH_ALCOVE_BACK, FLOOR, LEAP_OF_FAITH_ALCOVE_Z - 0.7 * F], [0, -1.5 * F, LEAP_OF_FAITH_ALCOVE_Z], '#899d9c');
  for (const z of [24 * F, 43 * F, LEAP_OF_FAITH_BALCONY_END_Z - 0.8 * F]) {
    structure([-1.1 * F, FLOOR, z], [0, -1.5 * F, z + 0.8 * F], '#b4c3bb');
  }

  // The upper flight leaves the walkway at 90°. The two flat landing facets
  // turn the lower flight another 90°, to run along the facade.
  const flight = (startZ: number, startY: number, steps: number, run: number, drop: number) => {
    const tread = run / (steps - 1), riser = drop / steps;
    for (let k = 0; k < steps; k++) {
      const z = startZ - k * tread, high = startY - k * riser, low = high - riser;
      stairGround.quad([LEAP_OF_FAITH_STAIR_X0, low, z], [0, low, z], [0, high, z], [LEAP_OF_FAITH_STAIR_X0, high, z], [0, 0, -1], lit('#989f94', [0, 0, -1]), DETAIL);
      if (k < steps - 1) {
        floor(stairGround, LEAP_OF_FAITH_STAIR_X0, 0, z - tread, z, low, TREAD);
        floor(stairGround, LEAP_OF_FAITH_STAIR_X0, 0, z - tread, z - tread + 1.3, low + 0.06, '#c6cbbd');
      }
    }
  };
  const bendMiddle = -LEAP_OF_FAITH_STAIR_RUN - LEAP_OF_FAITH_BEND_LENGTH / 2;
  flight(0, 0, LEAP_OF_FAITH_STEPS, LEAP_OF_FAITH_STAIR_RUN, LEAP_OF_FAITH_MID_DROP);
  for (const [a, b] of [[LEAP_OF_FAITH_MID_END_Z, bendMiddle], [bendMiddle, -LEAP_OF_FAITH_STAIR_RUN]]) {
    floor(stairGround, LEAP_OF_FAITH_STAIR_X0, 0, a, b, -LEAP_OF_FAITH_MID_DROP, TREAD);
  }
  flight(LEAP_OF_FAITH_MID_END_Z, -LEAP_OF_FAITH_MID_DROP, LEAP_OF_FAITH_LOWER_STEPS, LEAP_OF_FAITH_LOWER_RUN, LEAP_OF_FAITH_DROP - LEAP_OF_FAITH_MID_DROP);
  // The retaining cheek really changes direction at the landing: both of
  // its flat horizontal panels and the outgoing slope have their own face.
  const wallProfile: [number, number][] = [
    [LEAP_OF_FAITH_STAIR_END_Z, FLOOR + 0.35 * F],
    [LEAP_OF_FAITH_MID_END_Z, -LEAP_OF_FAITH_MID_DROP + 0.12 * F],
    [bendMiddle, -LEAP_OF_FAITH_MID_DROP + 0.12 * F],
    [-LEAP_OF_FAITH_STAIR_RUN, -LEAP_OF_FAITH_MID_DROP + 0.12 * F],
    [0, 0], [LEAP_OF_FAITH_ALCOVE_Z, 0],
  ];
  for (let i = 1; i < wallProfile.length; i++) {
    const [a, ya] = wallProfile[i - 1], [b, yb] = wallProfile[i];
    const target = b <= 0 ? stairGround : ground;
    target.quad([0.7 * F, FLOOR, a], [0.7 * F, FLOOR, b], [0.7 * F, yb, b], [0.7 * F, ya, a], FRONT, lit(WHITE, FRONT), DETAIL);
    const normal: Vec3 = [0, b - a, ya - yb];
    const length = Math.hypot(...normal);
    const n = normal.map(v => v / length) as Vec3;
    target.quad([0, ya, a], [0.7 * F, ya, a], [0.7 * F, yb, b], [0, yb, b], n, lit(CONCRETE, n), NO_INK);
    target.quad([0, ya, a], [0, yb, b], [0, FLOOR, b], [0, FLOOR, a], [-1, 0, 0], lit('#b6c1b6', [-1, 0, 0]), NO_INK);
    if (b <= 0) {
      // The tall white wall on the other side of the stairs, visible in
      // the supplied head-on photo, bends with the same landing.
      const x = LEAP_OF_FAITH_STAIR_X0;
      stairGround.quad([x, ya, a], [x, yb, b], [x, yb + 3.5 * F, b], [x, ya + 3.5 * F, a], FRONT, lit(WHITE, FRONT), DETAIL);
      stairGround.quad([x - 0.5 * F, ya + 3.5 * F, a], [x, ya + 3.5 * F, a], [x, yb + 3.5 * F, b], [x - 0.5 * F, yb + 3.5 * F, b], n, lit(CONCRETE, n), NO_INK);
    }
  }

  // Mesh is continuous around the two horizontal landing facets. The
  // walkway rail stays straight; at its end the stair rail turns 90° away.
  const stairJoints = [LEAP_OF_FAITH_STAIR_END_Z, LEAP_OF_FAITH_MID_END_Z - LEAP_OF_FAITH_LOWER_RUN / 2, LEAP_OF_FAITH_MID_END_Z, bendMiddle, -LEAP_OF_FAITH_STAIR_RUN, -LEAP_OF_FAITH_STAIR_RUN / 2, 0];
  const joints = [...stairJoints, 6 * F, 12 * F, 18 * F, 24 * F, 30 * F, 36 * F, 42 * F, 49 * F, LEAP_OF_FAITH_BALCONY_END_Z];
  for (let i = 1; i < joints.length; i++) {
    const a = joints[i - 1], b = joints[i], ya = leapOfFaithRailBase(a), yb = leapOfFaithRailBase(b);
    const rail = b <= 0 ? stairPipe : pipe;
    rail([[0, ya + LEAP_OF_FAITH_RAIL_HEIGHT, a], [0, yb + LEAP_OF_FAITH_RAIL_HEIGHT, b]]);
    rail([[0, ya + 7, a], [0, yb + 7, b]], 1.45);
    meshPanel(b <= 0 ? stairMesh : mesh, 0, a, b, ya, yb);
  }
  for (const z of joints) {
    const base = z >= 0 ? 0 : leapOfFaithStairGround(z);
    // The post's foot and its plate sit on the walking surface; seen from
    // below, a cap or underside lying in that plane would z-fight it.
    (z <= 0 ? stairPipe : pipe)([[0, base - STAND_OFF, z], [0, leapOfFaithRailBase(z) + LEAP_OF_FAITH_RAIL_HEIGHT, z]]);
    (z <= 0 ? stairProps : props).box([-3, base, z - 3], [3, base + 1.4, z + 3], '#798980', '#9ca99e', NO_INK, 'tfkle');
  }
  // Both photographs show a center pipe as well as the wall-side handrail.
  for (const x of [LEAP_OF_FAITH_STAIR_X0 / 2, LEAP_OF_FAITH_STAIR_X0 + 0.35 * F]) {
    for (let i = 1; i < stairJoints.length; i++) {
      const a = stairJoints[i - 1], b = stairJoints[i];
      stairPipe([[x, leapOfFaithRailBase(a) + LEAP_OF_FAITH_RAIL_HEIGHT, a], [x, leapOfFaithRailBase(b) + LEAP_OF_FAITH_RAIL_HEIGHT, b]], 1.7, false);
    }
    for (const z of stairJoints) stairPipe([[x, leapOfFaithStairGround(z) - STAND_OFF, z], [x, leapOfFaithRailBase(z) + LEAP_OF_FAITH_RAIL_HEIGHT, z]], 1.7, false);
  }

  // Roofed breezeway behind the rail. The heavy square piers and exposed
  // rafters matter to the silhouette in both archival camera angles.
  structure([LEAP_OF_FAITH_BALCONY_BACK - F, -0.2 * F, -2 * F], [LEAP_OF_FAITH_BALCONY_BACK, LEAP_OF_FAITH_ROOF_Y, LEAP_OF_FAITH_BALCONY_END_Z], '#bdc5ba');
  structure([LEAP_OF_FAITH_BALCONY_BACK - F, LEAP_OF_FAITH_ROOF_Y, -15 * F], [2 * F, LEAP_OF_FAITH_ROOF_Y + 0.65 * F, LEAP_OF_FAITH_BALCONY_END_Z + 2 * F], '#586662', '#a3a89a');
  for (const z of [4.5 * F, 21 * F, 38 * F, 54 * F]) {
    structure([-4.1 * F, 0, z], [-2.6 * F, LEAP_OF_FAITH_ROOF_Y, z + 1.5 * F], '#b4bbae', '#c0c6b6', false);
    // The cross beam runs behind the pier's face, not flush with it.
    structure([LEAP_OF_FAITH_BALCONY_BACK, LEAP_OF_FAITH_ROOF_Y - 1.1 * F, z + STAND_OFF], [2 * F, LEAP_OF_FAITH_ROOF_Y, z + 0.55 * F + STAND_OFF], '#737d71', '#818a7d', false);
  }
  for (let x = LEAP_OF_FAITH_BALCONY_BACK + 2 * F; x < 0; x += 3 * F) {
    structure([x, LEAP_OF_FAITH_ROOF_Y - 0.45 * F, -15 * F], [x + 0.24 * F, LEAP_OF_FAITH_ROOF_Y, LEAP_OF_FAITH_BALCONY_END_Z], '#7c8679', '#7c8679', false);
  }
  // Dark classroom openings are recessed in the back wall, away from the route.
  for (const z of [8 * F, 24 * F, 40 * F]) {
    props.box([LEAP_OF_FAITH_BALCONY_BACK + 0.05, 0, z], [LEAP_OF_FAITH_BALCONY_BACK + 0.3 * F, 7.3 * F, z + 3.2 * F], '#63736b', '#63736b', NO_INK);
    props.box([LEAP_OF_FAITH_BALCONY_BACK + 0.31 * F, 3.8 * F, z + 0.25 * F], [LEAP_OF_FAITH_BALCONY_BACK + 0.34 * F, 6.9 * F, z + 2.9 * F], '#384e49', '#384e49', NO_INK);
  }

  // School lunch tables in the recessed bay, visible in the 1997 photograph.
  for (const z of [13 * F, 33 * F, 49 * F]) picnicTable(props, pipe, -4.5 * F, z);
  // Conduit follows the alcove's back wall, with a small junction cabinet.
  for (const y of [FLOOR + 8.8 * F, FLOOR + 9.6 * F]) {
    pipe([[LEAP_OF_FAITH_ALCOVE_BACK + 1, y, LEAP_OF_FAITH_ALCOVE_Z], [LEAP_OF_FAITH_ALCOVE_BACK + 1, y, LEAP_OF_FAITH_BALCONY_END_Z]], 0.85, false, '#8f9f94');
  }
  props.box([LEAP_OF_FAITH_ALCOVE_BACK + 1, FLOOR + 8.5 * F, 6 * F], [LEAP_OF_FAITH_ALCOVE_BACK + 5, FLOOR + 10 * F, 7.3 * F], '#9dac9e', '#bbc7b8', NO_INK);

  // Circular weep holes, streaking, concrete joints and a few wheel scuffs.
  for (let z = LEAP_OF_FAITH_STAIR_END_Z + 4 * F; z < 0; z += 4.7 * F) {
    stairProps.tube([[0.7 * F + STAND_OFF, FLOOR + 0.48 * F, z], [0.7 * F + STAND_OFF + 0.3, FLOOR + 0.48 * F, z]], [1.8, 1.8], { color: '#66736b' }, NO_INK, 8);
  }
  for (let k = 0; k < 26; k++) {
    const z = LEAP_OF_FAITH_STAIR_END_Z * (1 - hash2(k, 1, 853));
    const y = FLOOR + 0.1 * F;
    stairProps.quad([0.7 * F + STAND_OFF, y, z], [0.7 * F + STAND_OFF, y, z + 1.2], [0.7 * F + STAND_OFF, y + 4 + hash2(k, 2, 891) * 12, z + 0.5], [0.7 * F + STAND_OFF, y + 6, z - 0.5], FRONT, lit('#a4b3a5', FRONT), NO_INK);
  }
  for (const x of [8 * F, 20 * F, 36 * F, 54 * F]) floor(ground, x, x + 0.45, -40 * F, 70 * F, FLOOR + 0.06, '#92998a');
  for (const z of [-26 * F, -12 * F, 2 * F, 16 * F, 32 * F, 48 * F]) floor(ground, 0.8 * F, 65 * F, z, z + 0.4, FLOOR + 0.06, '#92998a');
  for (let k = 0; k < 16; k++) {
    const x = (4 + hash2(k, 2, 625) * 19) * F, z = (2 + hash2(k, 4, 613) * 8) * F;
    floor(ground, x, x + 7 + hash2(k, 5, 941) * 25, z, z + 0.4, FLOOR + 0.09, '#969d8d');
  }
  const mirror = ([x, y, z]: Vec3): Vec3 => [x, y, -z];
  return {
    ground: mergeGeometries([ground.geometry(), stairGround.geometry()])!.scale(1, 1, -1),
    props: mergeGeometries([props.geometry(), stairProps.geometry()])!.scale(1, 1, -1),
    wireMesh: { ...MESH, geometry: mergeGeometries([mesh.geometry(), stairMesh.geometry()])!.scale(1, 1, -1) },
    railSegments: railSegments.map(({ a, b, radius }) => ({ a: mirror(a), b: mirror(b), radius })),
    shadowBoxes: shadowBoxes.map(({ min, max }) => ({ min: [min[0], min[1], -max[2]] as Vec3, max: [max[0], max[1], -min[2]] as Vec3 })),
  };
}

function picnicTable(props: Bake, pipe: (points: Vec3[], radius?: number, cast?: boolean, color?: string) => void, x: number, z: number) {
  const color = '#c9cebf';
  const board = (x0: number, x1: number, y: number) => props.box([x + x0 * F, FLOOR + y * F, z - 4 * F], [x + x1 * F, FLOOR + y * F + 2, z + 4 * F], '#a5b5a9', color, NO_INK);
  board(-1.3, 1.3, 2.5);
  board(-2.8, -1.7, 1.4);
  board(1.7, 2.8, 1.4);
  for (const along of [-2.5 * F, 2.5 * F]) {
    for (const sign of [-1, 1]) pipe([[x + sign * 2.35 * F, FLOOR + 1, z + along], [x + sign * 1.1 * F, FLOOR + 2.5 * F, z + along]], 1.3, false, '#829990');
    pipe([[x - 2.7 * F, FLOOR + 1.3 * F, z + along], [x + 2.7 * F, FLOOR + 1.3 * F, z + along]], 1.3, false, '#829990');
  }
  pipe([[x, FLOOR + 2.2 * F, z - 2.5 * F], [x, FLOOR + 0.3 * F, z], [x, FLOOR + 2.2 * F, z + 2.5 * F]], 1.2, false, '#829990');
}


export class LeapOfFaith3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildLeapOfFaithGeometry,
      laneZ: LEAP_OF_FAITH_LANE_Z,
      ground: leapOfFaithGround,
      grade: 0,
      run: LEAP_OF_FAITH_RUN,
      drop: LEAP_OF_FAITH_DROP,
      framing: 0.84,
      streetProps: {
        trees: [
          { at: [-24 * F, FLOOR, -70 * F], height: 43 * F, yaw: 27 },
          { at: [5 * F, FLOOR, -82 * F], height: 38 * F, yaw: 134 },
        ],
      },
      tripods: {
        // Out in front of the undercroft, as in the archival footage; the
        // stair block stands on +z and would hide the drop from there.
        bottom: { u: 28 * F, z: -20 * F, height: FLOOR + 3 * F, frame: 22 * F, place: 0.58 },
        side: { u: 12 * F, z: -34 * F, height: FLOOR + 5 * F, frame: 24 * F, place: 0.56 },
        top: { u: -0.5 * F, z: -6.5 * F, height: 5 * F, frame: 8 * F, place: 0.6 },
      },
    });
  }
}

export const createLeapOfFaith = () => new LeapOfFaith3D();
