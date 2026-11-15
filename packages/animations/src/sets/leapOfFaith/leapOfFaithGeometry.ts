import { LEAP_OF_FAITH_PAINT as PAINT } from './leapOfFaithPalette';
import {
  LEAP_OF_FAITH_ALCOVE_Z, LEAP_OF_FAITH_BALCONY_END_Z, LEAP_OF_FAITH_MID_END_Z, LEAP_OF_FAITH_STAIR_END_Z,
  leapOfFaithRailBase, leapOfFaithStairGround, FRONT, FLOOR,
  FAR, STAND_OFF, CONCRETE, WHITE,
  TREAD, MESH, DETAIL, type RailShadow,
  METAL_INK, CONCRETE_INK, floor,
  StairBake, meshPanel, makePipe,
  wall, mirror, structureBox,
} from './leapOfFaithKit';
import {
  LEAP_OF_FAITH_BALCONY_BACK, LEAP_OF_FAITH_DROP, LEAP_OF_FAITH_FOOT as F, LEAP_OF_FAITH_BEND_LENGTH,
  LEAP_OF_FAITH_LOWER_RUN, LEAP_OF_FAITH_LOWER_STEPS, LEAP_OF_FAITH_MID_DROP,
  LEAP_OF_FAITH_RAIL_HEIGHT, LEAP_OF_FAITH_HEAD_Z, LEAP_OF_FAITH_STAIR_RUN, LEAP_OF_FAITH_STAIR_X0,
  LEAP_OF_FAITH_STEPS,
} from './leapOfFaithLayout';
import type { BufferGeometry } from 'three';
import { Bake } from '../../three/bake';
import type { Vec3 } from '../../camera/view';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canopiesFromTrees, surfaceInk } from '../surfaces';
import { LEAP_OF_FAITH_TREES } from './leapOfFaithTrees';
import { buildLeapOfFaithBuildings } from './leapOfFaithBuildings';
import { buildLeapOfFaithCourt } from './leapOfFaithCourt';
import { buildLeapOfFaithWear } from './leapOfFaithWear';
import { CAP_BAND } from './leapOfFaithBlocks';
import { leapOfFaithContacts, leapOfFaithShadowBoxes } from './leapOfFaithLight';

/** Protected stair/rail bake is reflected once; Buildings and Court add unreflected world geometry. */
export function buildLeapOfFaithGeometry() {
  const ground = new Bake(color => color);
  const props = new Bake(color => color);
  const stairGround = new StairBake();
  const stairProps = new StairBake();
  const mesh = new Bake(color => color);
  const stairMesh = new StairBake();
  const railSegments: RailShadow[] = [];
  const pipe = makePipe(props, false, railSegments);
  const stairPipe = makePipe(stairProps, true, railSegments);

  // One continuous lower floor includes the court and the open undercroft.
  // Raised stair treads and the landing cover its footprint, without cracks
  // from trying to clip axis-aligned paving against the dogleg's polygon.
  ground.quad([-FAR, FLOOR, FAR], [FAR, FLOOR, FAR], [FAR, FLOOR, -FAR], [-FAR, FLOOR, -FAR], [0, 1, 0], { color: PAINT.court }, surfaceInk('pavers'));
  floor(ground, LEAP_OF_FAITH_BALCONY_BACK, 0, -LEAP_OF_FAITH_HEAD_Z, LEAP_OF_FAITH_BALCONY_END_Z, 0, PAINT.walkway);
  // The head of the stairs: the walkway floor runs on behind it, closed off
  // by the stair's far wall carried back along it.
  structureBox(props, [LEAP_OF_FAITH_BALCONY_BACK, 0, -LEAP_OF_FAITH_HEAD_Z - 0.5 * F], [0, 3.5 * F, -LEAP_OF_FAITH_HEAD_Z], WHITE, CONCRETE, 'tfkle');

  // The upper flight leaves the walkway at 90°. The two flat landing facets
  // turn the lower flight another 90°, to run along the facade.
  const flight = (startZ: number, startY: number, steps: number, run: number, drop: number) => {
    const tread = run / (steps - 1), riser = drop / steps;
    for (let k = 0; k < steps; k++) {
      const z = startZ - k * tread, high = startY - k * riser, low = high - riser;
      stairGround.quad([LEAP_OF_FAITH_STAIR_X0, low, z], [0, low, z], [0, high, z], [LEAP_OF_FAITH_STAIR_X0, high, z], [0, 0, -1], { color: PAINT.riser }, DETAIL);
      if (k < steps - 1) {
        floor(stairGround, LEAP_OF_FAITH_STAIR_X0, 0, z - tread, z, low, TREAD);
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
    // The big wall's face: scuffed low where boards come down beside the landing (the upper flight's face).
    const use: [number, number] = i === 4 ? [0.35, 0] : [0.1, 0];
    wall(target, [[0.7 * F, FLOOR, a], [0.7 * F, FLOOR, b], [0.7 * F, yb, b], [0.7 * F, ya, a]], FRONT, WHITE, FLOOR, [ya, yb], 'painted', use);
    // Its pale cap band along the top edge (refs 20, 82), a hair proud of the face.
    const out = 0.7 * F + STAND_OFF, band = CAP_BAND * F;
    wall(target, [[out, ya - band, a], [out, yb - band, b], [out, yb, b], [out, ya, a]], FRONT, PAINT.cap, FLOOR, [ya, yb]);
    const normal: Vec3 = [0, b - a, ya - yb];
    const length = Math.hypot(...normal);
    const n = normal.map(v => v / length) as Vec3;
    target.quad([0, ya, a], [0.7 * F, ya, a], [0.7 * F, yb, b], [0, yb, b], n, { color: CONCRETE }, CONCRETE_INK);
    wall(target, [[0, ya, a], [0, yb, b], [0, FLOOR, b], [0, FLOOR, a]], [-1, 0, 0], WHITE, FLOOR, [ya, yb]);

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
    (z <= 0 ? stairProps : props).box([-3, base, z - 3], [3, base + 1.4, z + 3], PAINT.plate, PAINT.plateCap, METAL_INK, 'tfkle');
  }
  // Both photographs show a center pipe as well as the wall-side handrail.
  for (const x of [LEAP_OF_FAITH_STAIR_X0 / 2, LEAP_OF_FAITH_STAIR_X0 + 0.35 * F]) {
    for (let i = 1; i < stairJoints.length; i++) {
      const a = stairJoints[i - 1], b = stairJoints[i];
      stairPipe([[x, leapOfFaithRailBase(a) + LEAP_OF_FAITH_RAIL_HEIGHT, a], [x, leapOfFaithRailBase(b) + LEAP_OF_FAITH_RAIL_HEIGHT, b]], 1.7, false);
    }
    for (const z of stairJoints) stairPipe([[x, leapOfFaithStairGround(z) - STAND_OFF, z], [x, leapOfFaithRailBase(z) + LEAP_OF_FAITH_RAIL_HEIGHT, z]], 1.7, false);
  }

  // The architecture round the gap is authored in world axes (leapOfFaithBuildings.ts), as are its wear and its
  // light: merged after the legacy bakes are reflected, never reflected itself.
  const worldProps = new Bake(color => color);
  const worldGround = new Bake(color => color);
  const decals = new Bake(color => color);
  buildLeapOfFaithBuildings(worldProps);
  buildLeapOfFaithCourt(worldProps, worldGround);
  buildLeapOfFaithWear(worldGround, decals);
  const mergeWorld = (legacy: BufferGeometry, world: Bake) => {
    const added = world.geometry();
    try {
      return mergeGeometries([legacy, added])!;
    } finally {
      legacy.dispose();
      added.dispose();
    }
  };
  return {
    decals: decals.geometry(),
    contacts: leapOfFaithContacts(wallProfile),
    canopies: canopiesFromTrees(LEAP_OF_FAITH_TREES),
    ground: mergeWorld(mergeReflected(ground, stairGround), worldGround),
    props: mergeWorld(mergeReflected(props, stairProps), worldProps),
    wireMesh: { ...MESH, geometry: mergeReflected(mesh, stairMesh) },
    railSegments: railSegments.map(({ a, b, radius }) => ({ a: mirror(a), b: mirror(b), radius })),
    shadowBoxes: leapOfFaithShadowBoxes(),
  };
}

/** Merge owns the temporary source buffers; only the returned geometry survives the bake. */
function mergeReflected(...bakes: Bake[]): BufferGeometry {
  const sources = bakes.map(b => b.geometry());
  try { return mergeGeometries(sources)!.scale(1, 1, -1); }
  finally { sources.forEach(g => g.dispose()); }
}
