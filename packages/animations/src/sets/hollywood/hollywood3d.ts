import { buildSchool } from './hollywoodSchool';
import { buildFenceExtensions } from './hollywoodFenceShapes';
import { buildStreet } from './hollywoodStreet';
import { Bake, NO_INK, type Ink, type Paint } from '../../three/bake';
import { INK_PROP, rgb } from '../../three/materials';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import { stairContacts, surfaceInk, SURFACE, type SpotLook, type ContactLine } from '../surfaces';
import type { Vec3 } from '../../camera/view';
import { ClassicSpot3D, type ClassicSpotConfig } from '../classicSpot3d';
import { hollywoodCanopies, HOLLYWOOD_PALMS, HOLLYWOOD_TREES } from './hollywoodTrees';
export { HOLLYWOOD_PALMS, HOLLYWOOD_TREES } from './hollywoodTrees';
import { HollywoodDecals } from './hollywoodDecals';
import { HOLLYWOOD_PAINT as PAINT } from './hollywoodPalette';
import { TurnedBake, turnPoint, type Baker } from './turn';
import {
  HOLLYWOOD_12_FILMERS, HOLLYWOOD_12_LIP, HOLLYWOOD_12_STEPS, HOLLYWOOD_12_DROP, HOLLYWOOD_12_RUN,
  HOLLYWOOD_12_RISER, HOLLYWOOD_12_TREAD, HOLLYWOOD_12_GRADE, HOLLYWOOD_12_LANE_Z,
  HOLLYWOOD_12_RAIL_END, hollywood12Ground, hollywood12Nosing, hollywood12CheekTop,
} from './hollywoodLayout';
import {
  HOLLYWOOD_BUILDING_FACE,
  HOLLYWOOD_CHEEK_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_DROP, HOLLYWOOD_FAR_CURB_Z,
  HOLLYWOOD_FENCE_END, HOLLYWOOD_FENCE_START, HOLLYWOOD_FENCE_TIPS, HOLLYWOOD_FILMERS,
  HOLLYWOOD_FENCE_TOP, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FOOT as F, HOLLYWOOD_GRADE,
  HOLLYWOOD_LANE_WIDTH, HOLLYWOOD_LANE_Z, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RAIL_END,
  HOLLYWOOD_RAIL_HEIGHT, HOLLYWOOD_RAIL_LINES, HOLLYWOOD_RAIL_RADIUS,
  HOLLYWOOD_RAIL_START, HOLLYWOOD_RIGHT_Z, HOLLYWOOD_RISER, HOLLYWOOD_ROAD_Y,
  HOLLYWOOD_RUN, HOLLYWOOD_SIDE_RAIL_Z, HOLLYWOOD_STEPS, HOLLYWOOD_TREAD,
  hollywoodCheekTop, hollywoodGround, hollywoodNosing,
} from './hollywoodLayout';

const ink = (id: number, priority = 5, solid = 0): Ink => ({ id, priority, width: 0.18, kind: INK_PROP, solid });
const STEP_INK = ink(40, 4, SURFACE.concrete);
/** The school's face brick and Highland's asphalt: the look's brick and asphalt surfaces (HOLLYWOOD_LOOK). */
export const HOLLYWOOD_BRICK_INK = ink(74, 7, SURFACE.brick);
export const HOLLYWOOD_ROAD_INK = ink(42, 3, SURFACE.asphalt);
const WALL_INK = ink(75, 7, SURFACE.concrete);
const up: Vec3 = [0, 1, 0];
const front: Vec3 = [0, 0, -1];
const lower = -HOLLYWOOD_DROP;
const FAR = 24000;
const rgbOf = (color: string) => rgb(color) as [number, number, number];
const hexOf = (c: [number, number, number]) => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const random = (seed: number) => { const a = Math.sin(seed * 93.17 + 72.81) * 43758.5453; return a - Math.floor(a); };
/** The run-up's poured slabs near the lip: five feet long, four across. */
const SLAB = 5 * F;
const RUN_UP_SLABS = 8;
const SLAB_TINTS = PAINT.walkwaySlabs;

export interface HollywoodRailSegment { a: Vec3; b: Vec3; radius: number }
export interface HollywoodShadowBox { min: Vec3; max: Vec3 }

/** Three flat bakes under per-pixel daylight, with modelled trees. The layout is never mirrored. */
export type HollywoodFlight = 'sixteen' | 'twelve';

export function buildHollywoodGeometry(flight: HollywoodFlight = 'sixteen') {
  const groundBake = new Bake(color => color);
  const propsBake = new Bake(color => color);
  const decalsBake = new HollywoodDecals(flight === 'twelve');
  const turned = flight === 'twelve';
  // The twelve is this scene turned half round: every piece is authored once, in the sixteen's frame.
  const at = (p: Vec3) => turned ? turnPoint(HOLLYWOOD_12_LIP, p) : p;
  const ground: Baker = turned ? new TurnedBake(groundBake, HOLLYWOOD_12_LIP) : groundBake;
  const props: Baker = turned ? new TurnedBake(propsBake, HOLLYWOOD_12_LIP) : propsBake;
  const decals: Baker = turned ? new TurnedBake(decalsBake, HOLLYWOOD_12_LIP) : decalsBake;
  const railSegments: HollywoodRailSegment[] = [];
  const shadowBoxes: HollywoodShadowBox[] = [];
  const tube: Tube = (spine, radius, color, detail = ink(71, 6), sides = 8, cast = false) => {
    props.tube(spine, spine.map(() => radius), { color }, detail, sides, true);
    if (cast) for (let i = 1; i < spine.length; i++) railSegments.push({ a: at(spine[i - 1]), b: at(spine[i]), radius });
  };

  buildPaving(ground);
  // The sixteen, then the twelve: physically at the walkway's north end, falling north, so drawn in its own
  // downhill frame through a half turn (same school, same street).
  buildFlight(ground, props, tube);
  const northProps = new TurnedBake(props, HOLLYWOOD_12_LIP);
  const northGround = new TurnedBake(ground, HOLLYWOOD_12_LIP);
  const northTube: Tube = (spine, radius, color, detail, sides, cast) =>
    tube(spine.map((p) => turnPoint(HOLLYWOOD_12_LIP, p)), radius, color, detail, sides, cast);
  buildFlight(northGround, northProps, northTube, true);
  buildTwelveCheekRail(northTube);
  railWeeps(decals, props, false);
  railWeeps(new TurnedBake(decals, HOLLYWOOD_12_LIP), northProps, true);
  buildSlabJoints(decals);
  buildRetainingWall(ground, shadowBoxes);
  buildSchool(props, shadowBoxes);
  buildSigns(props);
  buildBoundary(props, tube);
  buildStreet(props, ground, decals);
  buildWear(decals, decals);

  const boxes = shadowBoxes.map(({ min, max }) => {
    const a = at(min), b = at(max);
    return { min: [Math.min(a[0], b[0]), min[1], Math.min(a[2], b[2])] as Vec3, max: [Math.max(a[0], b[0]), max[1], Math.max(a[2], b[2])] as Vec3 };
  });
  const contacts = hollywoodContacts(turned, at);
  // The stage sun stays fixed; crown shadows are selected after turning the trees.
  const trees = [...HOLLYWOOD_TREES, ...HOLLYWOOD_PALMS].map(tree => ({ ...tree, at: at(tree.at), yaw: tree.yaw + (turned ? 180 : 0) }));
  const canopies = hollywoodCanopies(trees, turned);
  return { ground: groundBake.geometry(), props: propsBake.geometry(), decals: decalsBake.geometry(), railSegments, shadowBoxes: boxes, contacts, canopies };
}

/**
 * The level paving, each piece on its own footprint: broad planes stacked a fraction apart would fight for depth
 * from far cameras. The walkway (x -72..0) is long slabs, the eight nearest the sixteen's lip each a slightly
 * different pour; the landings and the sidewalk run on past both stairs; then the road and everything beyond it.
 */
function buildPaving(ground: Baker) {
  const plane = (x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = surfaceInk('concrete')) =>
    ground.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], up, { color }, detail);
  plane(HOLLYWOOD_12_LIP, -RUN_UP_SLABS * SLAB, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, 0, PAINT.walkway);
  const across = (HOLLYWOOD_RIGHT_Z - HOLLYWOOD_LEFT_Z) / 4;
  for (let i = 0; i < RUN_UP_SLABS; i++) for (let j = 0; j < 4; j++) {
    const x0 = -(i + 1) * SLAB, z0 = HOLLYWOOD_LEFT_Z + j * across;
    plane(x0, x0 + SLAB, z0, z0 + across, 0, SLAB_TINTS[Math.floor(random(i * 17 + j * 5) * SLAB_TINTS.length)]);
  }
  // The sixteen's landing and the walk south of it, the twelve's landing and the walk north of it, the
  // sidewalk between them, Highland, and the far side.
  plane(HOLLYWOOD_RUN, FAR, HOLLYWOOD_CURB_Z, FAR, lower, PAINT.landing);
  plane(-FAR, HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN, HOLLYWOOD_CHEEK_Z, FAR, lower, PAINT.landing);
  plane(-FAR, HOLLYWOOD_RUN, HOLLYWOOD_CURB_Z, HOLLYWOOD_CHEEK_Z, lower, PAINT.sidewalk);
  plane(-FAR, FAR, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_CURB_Z, HOLLYWOOD_ROAD_Y, PAINT.road, HOLLYWOOD_ROAD_INK);
  plane(-FAR, FAR, -FAR, HOLLYWOOD_FAR_CURB_Z, lower, PAINT.farGround);
}

/**
 * The twelve's street-side cheek carries its own pale handrail (02, 30, 31): scenery only (ink 63), the sixteen's
 * side-rail pipe and paint, on three posts into the cheek. Drawn in the twelve's frame; not in any motion data.
 */
function buildTwelveCheekRail(northTube: Tube) {
  const sideZ = -HOLLYWOOD_SIDE_RAIL_Z;
  const sideAt = (x: number): Vec3 => [x, hollywood12Nosing(x) + HOLLYWOOD_RAIL_HEIGHT, sideZ];
  northTube([sideAt(HOLLYWOOD_RAIL_START), sideAt(HOLLYWOOD_12_RAIL_END)], HOLLYWOOD_RAIL_RADIUS, '#bfc3b2', ink(63, 11), 12);
  for (const x of [HOLLYWOOD_RAIL_START, 6 * HOLLYWOOD_12_TREAD, HOLLYWOOD_12_RAIL_END]) {
    northTube([[x, hollywood12CheekTop(x), sideZ], sideAt(x)], HOLLYWOOD_RAIL_RADIUS, '#bfc3b2', ink(63, 11), 10);
  }
}

/** Tooled joints between the walkway's slabs near the sixteen's lip, and across and along its landing. */
function buildSlabJoints(decals: Baker) {
  for (let i = 1; i <= RUN_UP_SLABS; i++) flat(decals, -i * SLAB - 0.3, -i * SLAB + 0.3, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, 0.09, PAINT.walkwayJoint);
  const across = (HOLLYWOOD_RIGHT_Z - HOLLYWOOD_LEFT_Z) / 4;
  for (let j = 1; j < 4; j++) {
    const z = HOLLYWOOD_LEFT_Z + j * across;
    flat(decals, -RUN_UP_SLABS * SLAB, -1, z - 0.3, z + 0.3, 0.09, PAINT.walkwayJoint);
  }
  for (const x of [HOLLYWOOD_RUN + 6 * F, HOLLYWOOD_RUN + 16 * F, HOLLYWOOD_RUN + 30 * F]) {
    flat(decals, x, x + 0.6, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z + 12 * F, lower + 0.09, PAINT.walkwayJoint);
  }
  for (const z of [-2 * F, 5.4 * F]) flat(decals, HOLLYWOOD_RUN + 1, HOLLYWOOD_RUN + 32 * F, z, z + 0.6, lower + 0.09, PAINT.walkwayJoint);
}

/**
 * The brick retaining wall under the walkway's street edge (62-66), from the sidewalk up to the walkway between
 * the two lips, under a pale concrete coping. Its shadow box spans the whole platform.
 */
function buildRetainingWall(ground: Baker, shadowBoxes: HollywoodShadowBox[]) {
  const cheek = HOLLYWOOD_CHEEK_Z;
  // Every face but the street one, which is drawn below in strips so its paint can carry the weather.
  ground.box([HOLLYWOOD_12_LIP, lower, cheek], [0, 0, HOLLYWOOD_LEFT_Z], PAINT.brick, PAINT.brick, HOLLYWOOD_BRICK_INK, 'tbfle');
  retainingFace(ground, cheek);
  ground.box([HOLLYWOOD_12_LIP, 0, cheek], [0, 0.4 * F, HOLLYWOOD_LEFT_Z], PAINT.coping, PAINT.coping, WALL_INK);
  shadowBoxes.push({ min: [HOLLYWOOD_12_LIP, lower, cheek], max: [0, 0, HOLLYWOOD_RIGHT_Z] });
}

/**
 * The retaining wall's street face (62-66), the biggest brick face in the game: strips a foot or two wide, the
 * brick's paint varying corner to corner so the brick surface carries it (its paint is the wall's mean): faint
 * rain streaks washing down from the coping, each its own length, rust weeping from under the mesh posts, and a
 * dirtier band along the sidewalk where splash and feet reach. Same ink as the box face it replaces (`k`, the box's fourth face), so outlines don't move.
 */
function retainingFace(ground: Baker, z: number) {
  const faceInk = { ...HOLLYWOOD_BRICK_INK, id: HOLLYWOOD_BRICK_INK.id + 3, priority: HOLLYWOOD_BRICK_INK.priority + 3 };
  const base = rgbOf(PAINT.brick);
  const paint = (scale: number, warm = 0): Paint => ({ color: hexOf(base.map((v, i) => v * scale * (i === 0 ? 1 + warm : 1 - warm * 0.5)) as [number, number, number]) });
  // Breakpoints along the wall, 1-2.5 ft apart; heights from the sidewalk (feet over it).
  const xs: number[] = [HOLLYWOOD_12_LIP];
  for (let k = 0; xs[xs.length - 1] < 0; k++) xs.push(Math.min(0, xs[xs.length - 1] + (1 + 1.5 * random(k + 3100)) * F));
  // Rust weeps from most of the mesh posts on the coping (buildBoundary's posts, every 116 units): a narrow run of
  // breakpoints either side of each, the middle one rusty.
  const rusty = new Map<number, number>();
  for (let x = HOLLYWOOD_12_LIP + 1.3 * F, k = 0; x < -30; x += 116, k++) {
    if (random(k + 2050) < 0.3) continue;
    rusty.set(x, 1.2 + 2.5 * random(k + 2060));
    for (const dx of [-0.25 * F, 0.25 * F]) xs.push(x + dx);
    xs.push(x);
  }
  xs.sort((a, b) => a - b);
  for (let k = xs.length - 1; k > 0; k--) if (xs[k] - xs[k - 1] < 2 && !rusty.has(xs[k - 1]) && !rusty.has(xs[k])) xs.splice(k, 1);
  const rows = [0, 0.5, 1.4, 3.2, 5.2, 7.1, 8];
  const streak = xs.map((x, k) => {
    // Most breakpoints clean, some under a streak that runs from the coping down a few feet.
    const strength = random(k * 3 + 3300) < 0.4 ? 0.1 + 0.14 * random(k * 3 + 3301) : 0;
    const reach = 1.5 + 4.5 * random(k * 3 + 3302);
    return { strength, reach, rust: rusty.get(x) ?? 0 };
  });
  const shade = (k: number, row: number) => {
    const height = rows[row];
    const fromTop = 8 - height;
    const { strength, reach, rust } = streak[k];
    // Streaks fade out down their reach; the band along the sidewalk is darker and a touch browner; rust weeps
    // are darker and much warmer, gone within a few feet.
    const wash = strength * Math.max(0, 1 - fromTop / reach) * (fromTop > 0.15 ? 1 : 0.4);
    const weep = rust ? Math.max(0, 1 - fromTop / rust) : 0;
    const splash = height < 0.6 ? 0.2 : height < 1.5 ? 0.1 : 0;
    const drift = 0.025 * (random(k * 7 + row * 13 + 3500) - 0.5);
    return paint(1 - wash - splash - 0.2 * weep + drift, splash * 0.15 + 0.3 * weep);
  };
  for (let k = 0; k + 1 < xs.length; k++) {
    for (let row = 0; row + 1 < rows.length; row++) {
      const y0 = lower + rows[row] * F, y1 = lower + rows[row + 1] * F;
      ground.quadCorners([xs[k + 1], y0, z], [xs[k], y0, z], [xs[k], y1, z], [xs[k + 1], y1, z], [0, 0, -1],
        [shade(k + 1, row), shade(k, row), shade(k, row + 1), shade(k + 1, row + 1)], faceInk);
    }
  }
}

/**
 * The two wall plates: the sixteen wing's small NO SKATING sign by its stair (the one lettering in the spot), and a
 * blank white plate on the twelve's wing where 02 shows its sign: past the stair's foot, six feet up.
 */
function buildSigns(props: Baker) {
  const face = HOLLYWOOD_BUILDING_FACE;
  props.box([90, 11, face - 2.1], [164, 45, face - 0.3], '#6e756d', '#6e756d', NO_INK);
  props.quad([93, 14, face - 2.4], [161, 14, face - 2.4], [161, 42, face - 2.4], [93, 42, face - 2.4], front, { color: '#e8e5ca' }, NO_INK);
  lettering(props, 'NO', 97, 25, face - 2.6, 2, '#374348');
  lettering(props, 'SKATING', 121, 23, face - 2.6, 0.65, '#374348');
  // Past the twelve's foot (x = -82.5), six feet over its landing, where 02 shows the wing's sign.
  props.box([-87 * F, -2.6 * F, face - 2], [-84.5 * F, -1.4 * F, face - 0.3], '#e8e5ca', '#e8e5ca', NO_INK);
}

/**
 * Contact darkening (12 at most): every riser's foot on the ridden stair, then where the wings, the courts' back
 * walls, the retaining wall, the fence and the kerb meet the ground.
 */
function hollywoodContacts(turned: boolean, at: (p: Vec3) => Vec3): ContactLine[] {
  const ground: Array<[Vec3, Vec3]> = [
    // The twelve's wing and the sixteen's, along their street faces.
    [[-88.5 * F, lower, HOLLYWOOD_BUILDING_FACE], [-66 * F, 0, HOLLYWOOD_BUILDING_FACE]],
    [[-6 * F, 0, HOLLYWOOD_BUILDING_FACE], [16.5 * F, lower, HOLLYWOOD_BUILDING_FACE]],
    // Both courts' back walls.
    [[16.5 * F, lower, 36 * F], [50 * F, lower, 36 * F]],
    [[-116 * F, lower, 36 * F], [-88.5 * F, lower, 36 * F]],
    // The retaining wall, the fence line and the near kerb.
    [[HOLLYWOOD_12_LIP, lower, HOLLYWOOD_CHEEK_Z], [0, lower, HOLLYWOOD_CHEEK_Z]],
    [[HOLLYWOOD_FENCE_START, lower, HOLLYWOOD_FENCE_Z], [HOLLYWOOD_FENCE_END, lower, HOLLYWOOD_FENCE_Z]],
    [[-90 * F, lower, HOLLYWOOD_CURB_Z], [140 * F, lower, HOLLYWOOD_CURB_Z]],
  ];
  return [
    stairContacts(0, 0, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z,
      turned ? HOLLYWOOD_12_TREAD : HOLLYWOOD_TREAD,
      turned ? HOLLYWOOD_12_RISER : HOLLYWOOD_RISER,
      turned ? HOLLYWOOD_12_STEPS : HOLLYWOOD_STEPS, 0.5 * F),
    ...ground.map(([a, b]) => ({ a: at(a), b: at(b), reach: 0.4 * F, strength: 0.25 })),
  ];
}

/** The active flight's geometry in its downhill frame. */
function buildFlight(ground: Baker, props: Baker, tube: Tube, twelve = false) {
  const steps = twelve ? HOLLYWOOD_12_STEPS : HOLLYWOOD_STEPS;
  const tread = twelve ? HOLLYWOOD_12_TREAD : HOLLYWOOD_TREAD;
  const riser = twelve ? HOLLYWOOD_12_RISER : HOLLYWOOD_RISER;
  const run = twelve ? HOLLYWOOD_12_RUN : HOLLYWOOD_RUN;
  const railEnd = twelve ? HOLLYWOOD_12_RAIL_END : HOLLYWOOD_RAIL_END;
  const groundAt = twelve ? hollywood12Ground : hollywoodGround;
  const nosing = twelve ? hollywood12Nosing : hollywoodNosing;
  const wallFace = twelve ? -HOLLYWOOD_BUILDING_FACE : HOLLYWOOD_BUILDING_FACE;
  const rails = twelve ? [{ z: 0, wallMounted: false }, { z: -HOLLYWOOD_RAIL_LINES[2].z, wallMounted: true }] : HOLLYWOOD_RAIL_LINES;
  const plane = (x0: number, x1: number, z0: number, z1: number, y: number, color: string, detail = surfaceInk('concrete')) =>
    ground.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], up, { color }, detail);
  // Each flight has its own risers and intervening treads. Pale rounded wear bands
  // and blackened corners remain visible when seen from the landing.
  for (let k = 1; k <= steps; k++) {
    const x = (k - 1) * tread;
    const high = -(k - 1) * riser;
    const low = -k * riser;
    ground.quad([x, high, HOLLYWOOD_LEFT_Z], [x, low, HOLLYWOOD_LEFT_Z], [x, low, HOLLYWOOD_RIGHT_Z], [x, high, HOLLYWOOD_RIGHT_Z], [1, 0, 0], { color: PAINT.riser }, STEP_INK);
    // The worn nosing wraps onto the vertical face. A low landing camera
    // cannot see the tread tops, so their wear alone would flatten all
    // sixteen identically colored risers into an apparent concrete slope.
    for (const [y0, y1, color] of [
      [high - 1.1, high, PAINT.riserArris],
      [high - 1.65, high - 1.1, PAINT.riserNosing],
      [low, low + 0.65, PAINT.riserFoot],
    ] as const) {
      ground.quad([x + 0.025, y0, HOLLYWOOD_LEFT_Z], [x + 0.025, y0, HOLLYWOOD_RIGHT_Z], [x + 0.025, y1, HOLLYWOOD_RIGHT_Z], [x + 0.025, y1, HOLLYWOOD_LEFT_Z], [1, 0, 0], { color }, NO_INK);
    }
    if (k < steps) {
      plane(x, x + tread, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low, PAINT.tread, STEP_INK);
      plane(x + tread - 1.8, x + tread, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low + 0.06, PAINT.treadNose, NO_INK);
      plane(x + 0.06, x + 2, HOLLYWOOD_LEFT_Z, HOLLYWOOD_RIGHT_Z, low + 0.08, PAINT.treadBack, NO_INK);
    }
    // A few narrow drips down the riser off its nose (01, 02), different on every step.
    for (let j = 0; j < 2; j++) {
      if (random(k * 37 + j) < 0.35) continue;
      const z = HOLLYWOOD_LEFT_Z + 15 + random(k * 51 + j) * (HOLLYWOOD_RIGHT_Z - HOLLYWOOD_LEFT_Z - 35);
      const w = 0.5 + random(k * 29 + j) * 1.2;
      const h = 3 + random(k * 71 + j) * 7;
      const top = high - 1.7;
      props.quad([x + 0.08, top - h, z + w * 0.4], [x + 0.08, top - h * 0.8, z + w * 0.7], [x + 0.08, top, z + w], [x + 0.08, top, z], [1, 0, 0], { color: PAINT.riserDrip }, NO_INK);
    }
  }
  // Solid outside cheek: a narrow concrete slope, not a second staircase.
  const cheekOuter = twelve ? -HOLLYWOOD_CHEEK_Z : HOLLYWOOD_CHEEK_Z;
  const cheekInner = twelve ? HOLLYWOOD_RIGHT_Z : HOLLYWOOD_LEFT_Z;
  const outside: Vec3 = [0, 0, twelve ? 1 : -1];
  const cheekTop = twelve ? hollywood12CheekTop : hollywoodCheekTop;
  for (const [x0, x1] of [[0, run], [run, run + 0.4 * F]]) {
    const h0 = cheekTop(x0), h1 = cheekTop(x1);
    const n: Vec3 = [-(h1 - h0) / Math.hypot(x1 - x0, h1 - h0), (x1 - x0) / Math.hypot(x1 - x0, h1 - h0), 0];
    ground.quad([x0, h0, cheekOuter], [x1, h1, cheekOuter], [x1, h1, cheekInner], [x0, h0, cheekInner], n, { color: PAINT.cheekTop }, WALL_INK);
    ground.quad([x0, lower, cheekOuter], [x1, lower, cheekOuter], [x1, h1, cheekOuter], [x0, h0, cheekOuter], outside, { color: PAINT.cheekFace }, WALL_INK);
    ground.quad([x0, lower, cheekInner], [x0, h0, cheekInner], [x1, h1, cheekInner], [x1, lower, cheekInner], [0, 0, -outside[2]], { color: PAINT.cheekInner }, WALL_INK);
  }
  cheekWeather(props, run, cheekOuter, outside, cheekTop, twelve ? 4100 : 400);

  // The sixteen has three pipes; the twelve has center and wall pipes.
  // The round center rail has three supports and no
  // horizontal ends or lower longitudinal rail, unlike El Toro's handrails.
  rails.forEach(({ z, wallMounted }, index) => {
    const detail = ink(60 + index, 10 + index);
    const at = (x: number): Vec3 => [x, nosing(x) + HOLLYWOOD_RAIL_HEIGHT, z];
    tube([at(HOLLYWOOD_RAIL_START), at(railEnd)], HOLLYWOOD_RAIL_RADIUS, index === 0 ? '#555b56' : '#959d91', detail, 12, true);
    const posts = [HOLLYWOOD_RAIL_START, Math.floor(steps / 2) * tread, railEnd];
    for (const x of posts) {
      const h = nosing(x) + HOLLYWOOD_RAIL_HEIGHT;
      if (wallMounted) {
        // Short returned brackets embed in the school wall rather than
        // inventing a second free-standing rail in the narrow school lane.
        tube([[x, h - 4, wallFace - 0.1], [x, h - 4, z], [x, h, z]], 1.5, '#9aa194', detail, 8, true);
      } else {
        const base = index === 0 ? groundAt(x) : cheekTop(x);
        tube([[x, base, z], [x, h, z]], HOLLYWOOD_RAIL_RADIUS, index === 0 ? '#797f73' : '#a0a699', detail, 10, true);
        props.tube([[x, base + 0.2, z], [x, base + 1.2, z]], [4.2, 3.7], { color: '#878e80' }, detail, 10);
        // Faded paper stickers wrapped around the lower center posts.
        if (index === 0) {
          props.tube([[x, base + 9, z], [x, base + 18, z]], [2.24, 2.24], { color: '#d1cbbb' }, detail, 10);
          props.tube([[x, base + 19, z], [x, base + 22, z]], [2.26, 2.26], { color: '#909285' }, detail, 10);
        }
      }
    }
  });

}

/**
 * A cast cheek's street face (01, 02, 16): faint form joints every eight feet and grime run down from its sloping
 * top where water leaves it, drawn just proud of the face in the flight's own frame.
 */
function cheekWeather(props: Baker, run: number, cheekOuter: number, outside: Vec3, cheekTop: (x: number) => number, seed: number) {
  const z = cheekOuter + outside[2] * 0.15;
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: string) =>
    outside[2] < 0 ? props.quad(a, b, c, d, outside, { color }, NO_INK) : props.quad(b, a, d, c, outside, { color }, NO_INK);
  for (let x = 8 * F; x < run; x += 8 * F) quad([x - 0.3, lower, z], [x + 0.3, lower, z], [x + 0.3, cheekTop(x) - 1, z], [x - 0.3, cheekTop(x) - 1, z], PAINT.cheekStain);
  for (let i = 0; i < 9; i++) {
    const w = 3 + random(i * 7 + seed + 1) * 10;
    const x = random(i * 7 + seed) * (run - w);
    const topY = Math.min(cheekTop(x), cheekTop(x + w)) - 0.5;
    const drop = (0.15 + random(i * 7 + seed + 2) * 0.5) * (topY - lower);
    quad([x, topY, z], [x + w, topY, z], [x + w * 0.8, topY - drop * 0.7, z], [x + w * 0.2, topY - drop, z], PAINT.cheekStain);
  }
}

type Tube = (spine: Vec3[], radius: number, color: string, detail?: Ink, sides?: number, cast?: boolean) => void;

/** Welded mesh atop the upper retaining cheek, black spear fence below (raised a little: it's an obstacle now). */
function buildBoundary(props: Baker, tube: Tube) {
  const z = HOLLYWOOD_LEFT_Z - 0.22 * F;
  const length = -HOLLYWOOD_12_LIP - 1.3 * F;
  const white = '#bfc3b2';
  // Square welded wire, not chain-link: vertical/horizontal open mesh.
  for (const y of [7, 87]) tube([[-length, y, z], [-38, y, z]], 1.6, white, ink(72, 6));
  for (let x = -length; x < -30; x += 116) {
    tube([[x, 2, z], [x, 96, z]], 2.1, white, ink(72, 6));
    props.box([x - 5, 0.3, z - 5], [x + 5, 2, z + 5], '#8e9588', '#b7bbab', NO_INK);
  }
  for (let x = -length; x < -38; x += 10.5) tube([[x, 10, z], [x, 83, z]], 0.35, '#a1aa98', NO_INK, 4);
  for (let y = 12; y < 83; y += 10.5) tube([[-length, y, z], [-38, y, z]], 0.35, '#a1aa98', NO_INK, 4);
  const sideTop = hollywoodNosing(HOLLYWOOD_RAIL_START) + HOLLYWOOD_RAIL_HEIGHT;
  tube([[-38, 87, z], [HOLLYWOOD_RAIL_START, sideTop, HOLLYWOOD_SIDE_RAIL_Z]], 1.7, white, ink(72, 6));
  const fenceZ = HOLLYWOOD_FENCE_Z;
  const fenceTop = HOLLYWOOD_FENCE_TOP;
  // The fixed pickets beside each stair, each on the lattice it has always had in its own frame: pickets every
  // 17 units and posts every 232 (eight feet), phased as the original single run from x = -1870.5 (pickets) and
  // -1862 (posts) laid them, now starting at the first picket and post past x = -3 ft. The twelve's run is the
  // same lattice measured from its lip. Bar ends stay outside the guard's window (hollywoodFixed.test.ts), so no
  // protected tube cap moves.
  const PICKET_STEP = 17, POST_STEP = 8 * F;
  const sixteenPickets = -1870.5 + Math.ceil((-3 * F + 1870.5) / PICKET_STEP) * PICKET_STEP;
  const sixteenPosts = -1862 + Math.ceil((-3 * F + 1862) / POST_STEP) * POST_STEP;
  for (const [start, end, picketStart, postStart] of [
    [-3 * F, HOLLYWOOD_FENCE_END, sixteenPickets, sixteenPosts],
    [HOLLYWOOD_FENCE_START, HOLLYWOOD_12_LIP + 3 * F, HOLLYWOOD_12_LIP - 652.5, HOLLYWOOD_12_LIP - 644],
  ]) {
    for (const y of [lower + 16, fenceTop - 18]) tube([[start, y, fenceZ], [end, y, fenceZ]], 1.5, '#424e49', ink(73, 6));
    for (let x = picketStart; x < end; x += PICKET_STEP) {
      tube([[x, lower + 8, fenceZ], [x, fenceTop, fenceZ]], 1.1, '#424e49', ink(73, 6), 5);
      props.tube([[x, fenceTop - 2, fenceZ], [x, HOLLYWOOD_FENCE_TIPS, fenceZ]], [2.7, 0.1], { color: '#424e49' }, NO_INK, 4, true);
    }
    // Square posts every eight feet, set in the sidewalk, capped no higher than the spears.
    for (let x = postStart; x < end; x += POST_STEP) {
      props.box([x - 3, lower, fenceZ - 3], [x + 3, fenceTop + 1, fenceZ + 3], '#39433f', '#4c5853', ink(144, 6));
      props.frustum(x, fenceZ, fenceTop + 1, HOLLYWOOD_FENCE_TIPS - 1, 3.6, 0.6, { color: '#3d4843' }, NO_INK);
      props.box([x - 4.5, lower, fenceZ - 4.5], [x + 4.5, lower + 1.2, fenceZ + 4.5], '#9b9c90', '#a9aa9e', NO_INK);
    }
  }
  buildFenceExtensions(props);
}

/**
 * Rust weeping from the rails' feet (01, 02, 16, 41): an orange-brown stain round each centre-rail post on its
 * tread or landing, run down the riser below it, and down the cheek's inner face under each cheek-rail post. Drawn
 * in a flight's own downhill frame, for either flight.
 */
function railWeeps(decals: Baker, props: Baker, twelve: boolean) {
  const steps = twelve ? HOLLYWOOD_12_STEPS : HOLLYWOOD_STEPS;
  const tread = twelve ? HOLLYWOOD_12_TREAD : HOLLYWOOD_TREAD;
  const riser = twelve ? HOLLYWOOD_12_RISER : HOLLYWOOD_RISER;
  const railEnd = twelve ? HOLLYWOOD_12_RAIL_END : HOLLYWOOD_RAIL_END;
  const groundAt = twelve ? hollywood12Ground : hollywoodGround;
  const cheekTop = twelve ? hollywood12CheekTop : hollywoodCheekTop;
  const seed = twelve ? 5200 : 5100;
  for (const [k, x] of [Math.floor(steps / 2) * tread, railEnd].entries()) {
    const base = groundAt(x);
    // The post stands on the tread or landing that groundAt gives; its stain spreads downhill toward that tread's nose.
    blotSoft(decals, x + 0.25 * F, 0, base + 0.16, (0.28 + 0.12 * random(seed + k)) * F, RUST, PAINT.tread, seed + k);
    // The riser below, if the stain reaches its nose: a narrow run down its face.
    const nose = (Math.floor(x / tread) + 1) * tread;
    if (nose - x < 1.2 * F && nose < steps * tread) {
      const w = 0.12 * F, top = base, bottom = base - riser * (0.5 + 0.35 * random(seed + k + 10));
      props.quadCorners([nose + 0.12, top, -w], [nose + 0.12, top, w], [nose + 0.12, bottom, w * 0.4], [nose + 0.12, bottom, -w * 0.4], [1, 0, 0],
        [{ color: RUST }, { color: RUST }, { color: PAINT.riser }, { color: PAINT.riser }], NO_INK);
    }
  }
  // Under each cheek-rail post, down the cheek's inner face toward the stair.
  const face = twelve ? HOLLYWOOD_RIGHT_Z - 0.15 : HOLLYWOOD_LEFT_Z + 0.15, toward: Vec3 = [0, 0, twelve ? -1 : 1];
  const posts = twelve ? [HOLLYWOOD_RAIL_START, 6 * HOLLYWOOD_12_TREAD, HOLLYWOOD_12_RAIL_END] : [HOLLYWOOD_RAIL_START, Math.floor(steps / 2) * tread, railEnd];
  posts.forEach((x, k) => {
    if (x < 0) return;
    const top = cheekTop(x) - 0.3, reach = (1 + 1.5 * random(seed + 20 + k)) * F, w = 0.18 * F;
    props.quadCorners([x - w, top, face], [x + w, top, face], [x + w * 0.5, top - reach, face], [x - w * 0.5, top - reach, face], toward,
      [{ color: RUST_ON_CONCRETE }, { color: RUST_ON_CONCRETE }, { color: PAINT.cheekInner }, { color: PAINT.cheekInner }], NO_INK);
  });
}

/** Rust on concrete: a faint warm brown over the buff, never orange. */
const RUST = '#a99a83';
const RUST_ON_CONCRETE = '#a3927a';

/**
 * The marks a famous spot collects, each where the photos show it: gum and old stains on the paving, hairline
 * cracks and a patched slab, wax and black board scuffs at both lips, wheel streaks from powerslides on both
 * landings, and dry leaves in the gutter and along the
 * fences' feet. Ground marks go in `ground` (the decals), which drops any that would float, sink or lie under a wall.
 */
function buildWear(props: Baker, ground: Baker) {
  const scatter = (count: number, seed: number, x0: number, x1: number, z0: number, z1: number, draw: (x: number, z: number, k: number) => void) => {
    for (let k = 0; k < count; k++) draw(x0 + random(seed + k * 3) * (x1 - x0), z0 + random(seed + k * 3 + 1) * (z1 - z0), k);
  };
  // Gum: small dark spots, thickest on the sidewalk and the walkway near the lip.
  const GUM = ['#77736a', '#827e74', '#6b675f', '#8c887d'];
  scatter(40, 700, -50 * F, 90 * F, HOLLYWOOD_CURB_Z + F, HOLLYWOOD_FENCE_Z - 1.5 * F, (x, z, k) => blot(ground, x, z, lower + 0.14, 1.1 + random(k + 760) * 1.3, GUM[k % 4], k + 760, 5));
  scatter(16, 900, -30 * F, -1, HOLLYWOOD_LEFT_Z + 4, HOLLYWOOD_RIGHT_Z - 4, (x, z, k) => blot(ground, x, z, 0.14, 1.1 + random(k + 960) * 1.2, GUM[k % 4], k + 960, 5));
  // Old stains, each a shade darker than the paving it sits on and fading out at its edge.
  const stain = (base: string, k: number) => shadeHex(base, 0.94 - 0.04 * random(k + 1190));
  scatter(9, 1100, -38 * F, -2 * F, HOLLYWOOD_LEFT_Z + F, HOLLYWOOD_RIGHT_Z - F, (x, z, k) => blotSoft(ground, x, z, 0.12, (0.8 + random(k + 1150) * 1.2) * F, stain(PAINT.walkway, k), PAINT.walkway, k + 1150));
  scatter(8, 1200, -50 * F, 80 * F, HOLLYWOOD_CURB_Z + 2 * F, HOLLYWOOD_FENCE_Z - 2 * F, (x, z, k) => blotSoft(ground, x, z, lower + 0.12, (0.8 + random(k + 1250) * 1.3) * F, stain(PAINT.sidewalk, k), PAINT.sidewalk, k + 1250));
  scatter(5, 1300, HOLLYWOOD_RUN + 2 * F, HOLLYWOOD_RUN + 30 * F, HOLLYWOOD_LEFT_Z + F, HOLLYWOOD_RIGHT_Z - F, (x, z, k) => blotSoft(ground, x, z, lower + 0.12, (0.8 + random(k + 1350) * 1.1) * F, stain(PAINT.landing, k), PAINT.landing, k + 1350));
  // Hairline cracks wandering across slabs.
  const crack = (x: number, z: number, y: number, seed: number, zMin: number, zMax: number, color: string) => {
    const points: Array<[number, number]> = [[x, z]];
    for (let i = 0; i < 7; i++) {
      x += (random(seed + i) - 0.3) * 1.6 * F;
      z = Math.max(zMin, Math.min(zMax, z + (random(seed + i + 40) - 0.5) * 2 * F));
      points.push([x, z]);
    }
    seam(ground, points, y, 0.55, color);
  };
  crack(-24 * F, -3 * F, 0.11, 1400, HOLLYWOOD_LEFT_Z + 2, HOLLYWOOD_RIGHT_Z - 2, '#8f8877');
  crack(-11 * F, 4 * F, 0.11, 1450, HOLLYWOOD_LEFT_Z + 2, HOLLYWOOD_RIGHT_Z - 2, '#8f8877');
  for (const [x, seed] of [[-40 * F, 1500], [-8 * F, 1550], [52 * F, 1600]]) crack(x, HOLLYWOOD_CURB_Z + 6 * F, lower + 0.11, seed, HOLLYWOOD_CURB_Z + F, HOLLYWOOD_FENCE_Z - F, '#959283');
  // A patched sidewalk slab between the joints, newer and greyer (63, 64).
  ground.quad([25 * F + 0.5, lower + 0.1, -23 * F + 0.5], [30 * F, lower + 0.1, -23 * F + 0.5], [30 * F, lower + 0.1, -18 * F], [25 * F + 0.5, lower + 0.1, -18 * F],
    up, { color: '#bab9af' }, surfaceInk('concrete'));
  // The covered courts' floors, worn darker and greyer under the slab where feet and bikes go, fading out to the open landing.
  // (The decals' wall footprints stop them at the piers, the end walls and the auditorium's line at z = 31.)
  for (const [x0, x1] of [[17, 46.5], [-114.5, -89]]) {
    const worn = { color: PAINT.courtFloor }, open = { color: PAINT.landing };
    const xm0 = x0 + 6, xm1 = x1 - 6, z0 = 10.5, zm0 = 15, zm1 = 26, z1 = 30.9;
    const y = lower + 0.1, at = (x: number, z: number): Vec3 => [x * F, y, z * F];
    ground.quad(at(xm0, zm0), at(xm1, zm0), at(xm1, zm1), at(xm0, zm1), up, worn, surfaceInk('concrete'));
    ground.quadCorners(at(x0, z0), at(x1, z0), at(xm1, zm0), at(xm0, zm0), up, [open, open, worn, worn], surfaceInk('concrete'));
    ground.quadCorners(at(xm0, zm1), at(xm1, zm1), at(x1, z1), at(x0, z1), up, [worn, worn, open, open], surfaceInk('concrete'));
    ground.quadCorners(at(x0, z0), at(xm0, zm0), at(xm0, zm1), at(x0, z1), up, [open, worn, worn, open], surfaceInk('concrete'));
    ground.quadCorners(at(xm1, zm0), at(x1, z0), at(x1, z1), at(xm1, zm1), up, [worn, open, open, worn], surfaceInk('concrete'));
  }
  // Both lips: wax smeared along the nose where boards grind and slide out, and black scuffs where tails and
  // wheels hit, mostly on the street half where the lines come in. The twelve's lip faces the other way.
  for (const [lip, dir, zSign, seed] of [[0, -1, 1, 1700], [HOLLYWOOD_12_LIP, 1, -1, 1900]] as const) {
    for (let k = 0; k < 10; k++) {
      const z = zSign * (-210 + random(seed + k + 80) * 260), w = (1 + random(seed + k + 90) * 3) * F;
      const x0 = lip + dir * 0.02, x1 = lip + dir * 0.35 * F;
      flat(ground, Math.min(x0, x1), Math.max(x0, x1), z, z + w, 0.13, k % 2 ? '#a69f8c' : '#a19a87');
    }
    for (let k = 0; k < 18; k++) {
      const z = zSign * (-200 + random(k + seed) * 230);
      const x = lip + dir * (0.3 + random(k + seed + 20) ** 2 * 1.5 * F);
      const len = 4 + random(k + seed + 40) * 10;
      const angle = (random(k + seed + 60) - 0.5) * 0.5;
      seam(ground, [[x + dir * len * Math.cos(angle), z - len * Math.sin(angle)], [x, z]], 0.15, 0.6 + random(k + seed + 70) * 0.8, k % 3 ? '#77736b' : '#8a867c');
    }
  }
  // Powerslides on both landings: four faint urethane streaks, two pairs a truck's length apart, each slide a short arc.
  const slide = (x: number, z: number, angle: number, len: number, seed: number) => {
    const along: [number, number] = [Math.cos(angle), Math.sin(angle)], across: [number, number] = [-along[1], along[0]];
    for (const offset of [-0.95, -0.7, 0.7, 0.95]) {
      const points: Array<[number, number]> = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3, bend = 0.25 * F * Math.sin(t * Math.PI);
        points.push([x + along[0] * t * len + across[0] * (offset * F + bend), z + along[1] * t * len + across[1] * (offset * F + bend)]);
      }
      seam(ground, points, lower + 0.15, 1.6, random(seed + offset) < 0.5 ? '#b3ad9c' : '#b7b1a0');
    }
  };
  for (let k = 0; k < 4; k++) {
    slide(HOLLYWOOD_RUN + (5 + random(k + 1800) * 14) * F, -150 + random(k + 1820) * 120, (random(k + 1860) - 0.5) * 0.6, (2.5 + random(k + 1840) * 3) * F, k + 1880);
    slide(HOLLYWOOD_12_LIP - HOLLYWOOD_12_RUN - (5 + random(k + 1900) * 14) * F, 30 + random(k + 1920) * 120, Math.PI + (random(k + 1960) - 0.5) * 0.6, (2.5 + random(k + 1940) * 3) * F, k + 1980);
  }
  // Dry leaves caught in the gutter and along the fences' feet.
  const LEAVES = ['#8a7a55', '#6d6447', '#9a8a62', '#5f5a43', '#7f6a4a'];
  const leaf = (x: number, z: number, y: number, k: number) => {
    const a = random(k * 7 + 2000) * Math.PI * 2, r = 1.6 + random(k * 7 + 2001) * 1.8;
    const p = (t: number, s: number): Vec3 => [x + Math.cos(a + t) * r * s, y, z + Math.sin(a + t) * r * s];
    props.triangle(p(0, 1), p(2.4, 0.6), p(-2.4, 0.6), up, { color: LEAVES[k % LEAVES.length] }, NO_INK);
  };
  scatter(45, 2100, -70 * F, 110 * F, HOLLYWOOD_CURB_Z - 1.3 * F, HOLLYWOOD_CURB_Z - 0.2, (x, z, k) => leaf(x, z, HOLLYWOOD_ROAD_Y + 0.12, k));
  scatter(30, 2300, -34 * F, -2 * F, HOLLYWOOD_LEFT_Z + 1, HOLLYWOOD_LEFT_Z + 9, (x, z, k) => leaf(x, z, 0.16, k + 50));
  scatter(30, 2500, -40 * F, 30 * F, HOLLYWOOD_FENCE_Z - 7, HOLLYWOOD_FENCE_Z - 1, (x, z, k) => leaf(x, z, lower + 0.16, k + 90));
  for (const { at: [x, , z] } of HOLLYWOOD_TREES) scatter(8, 2700 + x, x - 1.8 * F, x + 1.8 * F, z - 1.8 * F, z + 1.8 * F, (lx, lz, k) => leaf(lx, lz, lower + 0.14, k + 140));
}

const flat = (bake: Baker, x0: number, x1: number, z0: number, z1: number, y: number, color: string) =>
  bake.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], up, { color }, NO_INK);

/** An irregular blot on the ground: a stain, a gum spot, a dried puddle. */
function blot(bake: Baker, x: number, z: number, y: number, r: number, color: string, seed: number, sides = 7) {
  const at = (i: number): Vec3 => {
    const k = r * (0.78 + 0.32 * random(seed * 13 + (i % sides)));
    return [x + Math.cos(i * Math.PI * 2 / sides) * k, y, z + Math.sin(i * Math.PI * 2 / sides) * k * 0.8];
  };
  for (let i = 0; i < sides; i++) bake.triangle([x, y, z], at(i + 1), at(i), up, { color }, NO_INK);
}

/** A soft blot on concrete: a darker heart fading out to `rim` paint (the paving's own) at its edge, the concrete's grain carrying on through it. */
function blotSoft(bake: Baker, x: number, z: number, y: number, r: number, color: string, rim: string, seed: number, sides = 7) {
  const detail = surfaceInk('concrete');
  const ring = (i: number, scale: number): Vec3 => {
    const k = r * scale * (0.75 + 0.35 * random(seed * 13 + (i % sides)));
    return [x + Math.cos(i * Math.PI * 2 / sides) * k, y, z + Math.sin(i * Math.PI * 2 / sides) * k * 0.8];
  };
  const heart = { color }, edge = { color: rim };
  for (let i = 0; i < sides; i++) {
    bake.triangle([x, y, z], ring(i + 1, 0.55), ring(i, 0.55), up, heart, detail);
    bake.quadCorners(ring(i + 1, 0.55), ring(i + 1, 1), ring(i, 1), ring(i, 0.55), up, [heart, edge, edge, heart], detail);
  }
}

/** A hex paint scaled toward black by `k`. */
const shadeHex = (color: string, k: number) => hexOf(rgbOf(color).map(v => v * k) as [number, number, number]);

/** A thin line along the ground through (x, z) points: a crack, a sealed seam. */
function seam(bake: Baker, points: Array<[number, number]>, y: number, width: number, color: string) {
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1], [x1, z1] = points[i];
    const length = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / length * width / 2, nz = (x1 - x0) / length * width / 2;
    bake.quad([x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz], up, { color }, NO_INK);
  }
}

/** Lane centers out from the near curb; the near two run +x, the far two back (cars keep right). */
const lane = (n: number) => HOLLYWOOD_CURB_Z - (n + 0.5) * HOLLYWOOD_LANE_WIDTH;
const MPH = (5280 * F) / 3600;
/** Each car's lap down the street: out of sight in the haze before it comes round again. */
const LAP = 700 * F;

/** Traffic on the avenue, everyday colors, sun-faded: one speed per lane, so no car ever catches another. */
export const HOLLYWOOD_TRAFFIC = ([
  [1, -40, 'sedan', '#9aa3a6', 27], [1, 180, 'suv', '#2d3438', 27],
  [2, 60, 'hatchback', '#d9d7cf', 33],
  [4, 120, 'sedan', '#6b2a2c', 30], [4, -170, 'suv', '#4f5b66', 30],
  [5, -10, 'sedan', '#c8c4b8', 25],
] as const).map(([n, x, model, paint, mph]) => ({
  at: [x * F, HOLLYWOOD_ROAD_Y, lane(n)] as Vec3,
  yaw: n < 3 ? 0 : 180,
  model,
  paint,
  speed: mph * MPH,
  lap: LAP,
}));

// Compact block lettering on actual signs (the NO SKATING sign), baked into the same prop mesh.
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

function lettering(props: Baker, text: string, x: number, y: number, z: number, scale: number, color: string) {
  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]];
    if (!glyph) continue;
    glyph.forEach((row, r) => [...row].forEach((pixel, c) => {
      if (pixel !== '1') return;
      const a = 254 - x - (i * 6 + c + 0.9) * scale, b = y + (6 - r) * scale;
      props.quad([a, b, z], [a + scale * 0.9, b, z], [a + scale * 0.9, b + scale * 0.9, z], [a, b + scale * 0.9, z], front, { color }, NO_INK);
    }));
  }
}

/** Shared daylight; only the ridden stair's procedural wear changes with the frame. */
export const HOLLYWOOD_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  marks: [{ x: [-14, -0.5], z: [-7, -1] }, { x: [18, 45], z: [-7, 6] }],
  markDepth: 0.1,
  gum: 4,
  // Modular face brick, 7 5/8 x 2 1/4 in on 3/8 in joints, grey-tan mortar barely recessed (refs 41, 42, 38).
  brick: { length: 7.625 / 12, height: 2.25 / 12, joint: 0.375 / 12, mortar: PAINT.mortar, paint: PAINT.brick, spread: 0.08 },
  // Old Highland Avenue asphalt: 3/8 in stones worn into view (refs 44, 13, 36).
  asphalt: { scale: 0.03, contrast: 0.16 },
  foliage: true,
  stairs: {
    x: [0, HOLLYWOOD_RUN / F], z: [HOLLYWOOD_LEFT_Z / F, HOLLYWOOD_RIGHT_Z / F],
    top: 0, tread: HOLLYWOOD_TREAD / F, riser: HOLLYWOOD_RISER / F,
    // No rails: their extra staining underneath turned the risers into a stained car park, where 01 and 02 show
    // clean warm concrete with a few runs.
  },
};

function hollywoodLook(flight: HollywoodFlight): SpotLook {
  return flight === 'sixteen' ? HOLLYWOOD_LOOK : {
    ...HOLLYWOOD_LOOK,
    marks: [{ x: [-14, -0.5], z: [1, 7] }, { x: [12, 38], z: [-6, 7] }],
    stairs: { ...HOLLYWOOD_LOOK.stairs!, x: [0, HOLLYWOOD_12_RUN / F],
      tread: HOLLYWOOD_12_TREAD / F, riser: HOLLYWOOD_12_RISER / F,
    },
  };
}

/** The same scene filmed facing down the chosen flight. */
export function hollywoodConfig(flight: HollywoodFlight = 'sixteen'): ClassicSpotConfig {
  const twelve = flight === 'twelve';
  const at = (p: Vec3) => twelve ? turnPoint(HOLLYWOOD_12_LIP, p) : p;
  const turn = (yaw: number) => twelve ? yaw + 180 : yaw;
  return {
      build: () => buildHollywoodGeometry(flight),
      laneZ: twelve ? HOLLYWOOD_12_LANE_Z : HOLLYWOOD_LANE_Z,
      ground: twelve ? hollywood12Ground : hollywoodGround,
      grade: twelve ? HOLLYWOOD_12_GRADE : HOLLYWOOD_GRADE,
      run: twelve ? HOLLYWOOD_12_RUN : HOLLYWOOD_RUN,
      drop: twelve ? HOLLYWOOD_12_DROP : HOLLYWOOD_DROP,
      // The crane stays clear of the real school wall on the positive side.
      cameraZ: twelve ? [-HOLLYWOOD_BUILDING_FACE + 25, 30 * F] : [-30 * F, HOLLYWOOD_BUILDING_FACE - 25],
      streetProps: {
        trees: [...HOLLYWOOD_TREES, ...HOLLYWOOD_PALMS].map((tree) => ({ ...tree, at: at(tree.at), yaw: turn(tree.yaw) })),
        cars: [...HOLLYWOOD_TRAFFIC, ...[-110, -45, 80].map((x) => ({
          at: [x * F, HOLLYWOOD_ROAD_Y, lane(0)] as Vec3, yaw: 0,
          model: 'sedan' as const, paint: '#a6a49a', speed: 0, lap: LAP,
        })), { at: [20 * F, HOLLYWOOD_ROAD_Y, lane(6)] as Vec3, yaw: 180,
          model: 'suv' as const, paint: '#686d68', speed: 0, lap: LAP }].map((car) => ({ ...car, at: at(car.at), yaw: turn(car.yaw) })),
      },
      look: hollywoodLook(flight),
      filmers: twelve ? HOLLYWOOD_12_FILMERS : HOLLYWOOD_FILMERS,
      stayUp: twelve ? [] : ['fence'],
  };
}

export class Hollywood3D extends ClassicSpot3D {
  constructor(flight: HollywoodFlight = 'sixteen') {
    super(hollywoodConfig(flight));
  }
}

export const buildHollywood3D = () => new Hollywood3D();
