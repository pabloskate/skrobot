import type { Vec3 } from '../camera/view';
import { glslRgb, SUN } from '../three/materials';
import { DAYLIGHT, type Ink } from '../three/bake';
import { treeHeight, type TreePlacement } from './props/trees';
import { SET_FOOT } from './setScale';

/**
 * The realistic look for classic spots, opt in per spot (`look` on
 * ClassicSpotConfig): procedural surfaces chosen by a face's ink `solid`,
 * soft analytic shadows, contact darkening and tree dapple on the ground.
 * A spot without `look` compiles exactly the shaders it always had.
 *
 * Bake its faces in neutral daylight (`new Bake(daylight)`, three/bake.ts)
 * so the vertex colors carry brightness, not a hue shift; the surfaces
 * below add the texture at every distance on top of that color.
 */

/** Ink solids the look shades (sets 6 plain, 10 masonry, 11 streaked paint and 13 leaves are older). */
export const SURFACE = {
  /** Mown turf; paint it browner where it's worn and the shader breaks it into bare patches. */
  grass: 14,
  /** Paving, curbs, cheeks, cast walls: aggregate, broom finish, stains. */
  concrete: 15,
  /** Dark glass reflecting the sky, brighter toward grazing. */
  glass: 16,
  /** Stucco or painted render. */
  stucco: 17,
  /** Painted or galvanised metal that isn't a rail: doors, poles, posts. */
  metal: 18,
  /** Vertical board siding (T1-11 on a portable classroom): grooves every eight inches, boards in their own tones. */
  siding: 19,
} as const;
export type SurfaceName = keyof typeof SURFACE;

/** An uninked face of one surface (no outline, just its shader branch). */
export const surfaceInk = (name: SurfaceName): Ink => ({ id: 0, priority: 0, width: 0, kind: 0, solid: SURFACE[name] });

/**
 * A line of contact darkening on the ground, in set units: where a wall,
 * curb or riser meets it. Darkens `strength` at the line, fading out over
 * `reach` (3D distance, so the foot of a wall drawn in the ground mesh
 * darkens too). `step`/`count` repeat it, nearest copy only, for a stair's
 * riser feet: `a`, `b` the first riser's foot, `step` one tread down.
 */
export interface ContactLine {
  a: Vec3;
  b: Vec3;
  reach: number;
  strength?: number;
  step?: Vec3;
  count?: number;
}

/** A tree crown as a sphere (set units) whose sun shadow dapples the ground. */
export interface Canopy {
  at: Vec3;
  radius: number;
}

/** Per-spot knobs, all optional; distances in feet. */
export interface SpotLook {
  /** Outline color of inked props (every classic spot's stock is #70766e). */
  ink?: string;
  /** Distance haze: its color, where it starts and is full, and how much at full. */
  haze?: { color?: string; from?: number; to?: number; amount?: number };
  /** Share of the sun the shadow boxes block (0-1, default 0.92): a shadow is the face lit by sky and bounce alone. */
  shadow?: number;
  /** Penumbra growth with distance from the caster (the sun's apparent size, ~0.01-0.02). */
  penumbra?: number;
  /** Scales every contact line's strength, and the darkening at shadow boxes' feet. */
  contact?: number;
  /** How far the darkening at a shadow box's foot reaches, in feet (0 turns it off). */
  boxContact?: number;
  /** Share of the sun a tree crown blocks where it's densest (0 off, default 0.7). */
  dapple?: number;
  /**
   * Props and walls receive the shadow boxes too (a facade under its eave).
   * Costs one ray-box test per box per prop pixel.
   */
  propShadows?: boolean;
  /**
   * Where the daylight comes from. 'baked' (default): flat paint was baked
   * with `new Bake(daylight)`, so only round parts are lit here. 'shader':
   * paint is the authored, sunlit color, flat-baked, and every face is lit
   * per pixel (one dot and a pow). Box exposure (sun 0 under an eave) then
   * comes from `propShadows` rather than the bake.
   */
  light?: 'baked' | 'shader';
  /**
   * Fill light with `light: 'shader'`: open sky and ground bounce, each
   * relative to the sun on a face square to it (the bake's 0.6 and 0.3).
   * A sunlit flat face keeps its authored color whatever they are; raising
   * `bounce` lifts walls and soffits in shade (light off sunlit paving),
   * raising `sky` lifts every shadow. With baked light they only change
   * how deep the shadows are.
   */
  fill?: { sky?: number; bounce?: number };
  /**
   * How much a shadow box overhead (an eave, a canopy roof) also hides the
   * open sky from the props under it (0-1, default 0, needs `propShadows`):
   * a wall darkens toward its soffit, and the soffit, lit only by bounce,
   * stays pale. One more loop over the boxes per prop pixel.
   */
  soffit?: number;
  /**
   * Where boards land and roll away on flat concrete: rectangles in feet (the spot's own x and z), where the
   * paving picks up long, thin urethane marks along x. Compiled in as constants, no uniforms.
   */
  marks?: Array<{ x: [number, number]; z: [number, number] }>;
}

/** The look's defaults, as compiled. */
export function resolveLook(look: SpotLook) {
  return {
    ink: look.ink ?? '#70766e',
    hazeColor: look.haze?.color ?? '#c6d0cc',
    hazeFrom: (look.haze?.from ?? 2400 / SET_FOOT) * SET_FOOT,
    hazeTo: (look.haze?.to ?? 12000 / SET_FOOT) * SET_FOOT,
    hazeAmount: look.haze?.amount ?? 0.72,
    shadow: look.shadow ?? 0.92,
    penumbra: look.penumbra ?? 0.016,
    contact: look.contact ?? 1,
    boxContact: (look.boxContact ?? 1.2) * SET_FOOT,
    dapple: look.dapple ?? 0.7,
    propShadows: look.propShadows ?? false,
    light: look.light ?? 'baked',
    sky: look.fill?.sky ?? DAYLIGHT.sky,
    bounce: look.fill?.bounce ?? DAYLIGHT.bounce,
    soffit: look.propShadows ? (look.soffit ?? 0) : 0,
    marks: look.marks ?? [],
  };
}

type Look = ReturnType<typeof resolveLook>;

/** Uniform budgets on top of the stock ground shader's (48 rails, 12 boxes): 36 + 16 vec4s, well inside WebGL2's 224. */
export const MAX_CONTACTS = 12;
export const MAX_CANOPIES = 16;

/** Crown spheres for street-prop trees: a generic broadleaf, its crown's middle at 62% of its height and as wide as 30% of it. */
export function canopiesFromTrees(trees: readonly TreePlacement[], crown = { at: 0.62, radius: 0.3 }): Canopy[] {
  return trees.map((t) => {
    const height = treeHeight(t);
    return { at: [t.at[0], t.at[1] + height * crown.at, t.at[2]], radius: height * crown.radius };
  });
}

/**
 * Contact darkening at every riser's foot of a straight stair falling along
 * +x: the top riser at x0, from height y0, `tread` and `riser` a step, across
 * z0-z1 (set units).
 */
export function stairContacts(x0: number, y0: number, z0: number, z1: number, tread: number, riser: number, steps: number, reach: number, strength = 0.32): ContactLine {
  return { a: [x0, y0 - riser, z0], b: [x0, y0 - riser, z1], reach, strength, step: [tread, -riser, 0], count: steps };
}

const vec3s = (c: readonly number[]) => `vec3(${c.map((v) => v.toFixed(3)).join(', ')})`;

/**
 * Procedural surfaces, chosen by solid, in the look's fill light. Needs
 * EL_TORO_NOISE (hash, noise, weather, grain), SUN and three's
 * cameraPosition. `q` is the face's planar coordinate in feet, `local` its
 * position in feet, `n` its normal, `world` the stage position.
 * Every feature finer than a pixel fades (grain's own fade, or `resolves`).
 */
export function surfacesGlsl(look: Pick<Look, 'sky' | 'bounce'> & Partial<Pick<Look, 'propShadows' | 'marks'>>) {
  const flat = [0, 1, 2].map((i) => SUN.y * DAYLIGHT.sunTint[i] + look.sky * DAYLIGHT.skyTint[i]);
  // With prop shadows, glass looks for the boxes its reflection runs into (an eave over the window).
  const reflectBlocked = look.propShadows
    ? 'float lookReflectBlocked(vec3 at, vec3 dir);'
    : 'float lookReflectBlocked(vec3 at, vec3 dir) { return 0.0; }';
  // Soft-edged rectangles, a foot of linear fade, where the marks are: a distance to the nearest edge, cheap
  // enough for every concrete pixel.
  const zones = (look.marks ?? []).map(({ x, z }) =>
    `m = max(m, min(min(q.x - ${(x[0] - 1).toFixed(2)}, ${(x[1] + 1).toFixed(2)} - q.x), min(q.y - ${(z[0] - 1).toFixed(2)}, ${(z[1] + 1).toFixed(2)} - q.y)));`).join('\n  ');
  return /* glsl */ `
${reflectBlocked}
float lookMarkZone(vec2 q) {
  float m = -1.0;
  ${zones}
  return clamp(m, 0.0, 1.0);
}
float lookLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 lookSkyLight(vec3 n) { return (0.5 + 0.5 * n.y) * ${look.sky.toFixed(3)} * ${vec3s(DAYLIGHT.skyTint)}; }
vec3 lookBounce(vec3 n) { return (0.5 - 0.5 * n.y) * ${look.bounce.toFixed(3)} * ${vec3s(DAYLIGHT.bounceTint)}; }
vec3 lookSun(vec3 n) { return max(dot(n, SUN), 0.0) * ${vec3s(DAYLIGHT.sunTint)}; }
// Daylight per pixel, as a multiplier on display color (1 on a sunlit flat face): for round parts, or every face with shader light.
vec3 lookDaylight(vec3 n) {
  return pow((lookSun(n) + lookSkyLight(n) + lookBounce(n)) / vec3(${flat.map((v) => v.toFixed(4)).join(', ')}), vec3(1.0 / 2.2));
}
// What's left of a face's daylight with a share of the sun blocked and only part of the sky open, as a
// display-color multiplier: shadows darken without turning blue or purple, faces turned from the sun don't change.
vec3 lookLit(vec3 color, vec3 n, float blocked, float open) {
  vec3 sky = lookSkyLight(n), bounce = lookBounce(n), sun = lookSun(n);
  return color * pow((sky * open + bounce + sun * (1.0 - clamp(blocked, 0.0, 1.0))) / (sky + bounce + sun), vec3(1.0 / 2.2));
}
// Darken by a share of the sun blocked (0 none, 1 all of it).
vec3 lookShadow(vec3 color, vec3 n, float blocked) {
  return lookLit(color, n, blocked, 1.0);
}
// 1 where a feature 1/f feet across spans a few pixels, 0 once it's subpixel.
float resolves(vec2 q, float f) {
  vec2 d = vec2(length(dFdx(q)), length(dFdy(q))) * f;
  return 1.0 - smoothstep(0.35, 1.1, max(d.x, d.y));
}

vec3 lookGrass(vec3 c, vec2 q) {
  float l = lookLuma(c);
  // How worn the paint says it is: watered turf has green well over red and blue, straw has none, and
  // trodden dirt has red over green.
  float gr = c.g - max(c.r, c.b);
  float dry = clamp(1.0 - gr / 0.13, 0.0, 1.0);
  float trodden = clamp((-gr - 0.025) / 0.04, 0.0, 1.0);
  // Worn turf is patchy, not an even khaki: green and straw in drifts a foot to a few feet across, the
  // painted dryness setting how much of each.
  float drift = noise(q * 0.31 + 2.3) * 0.62 + noise(q * 1.3 + 7.7) * 0.38;
  float straw = smoothstep(-0.16, 0.16, drift - (1.0 - dry));
  vec3 turf = mix(mix(c, ${glslRgb('#5a7c35')} * (l / 0.42), 0.55 * dry), mix(c, ${glslRgb('#a09461')} * (l / 0.55), 0.6 * (1.0 - dry)), straw);
  // Watered turf at distance: soft drifts 30-60 ft across, then patches 8-20 ft, a few paler where it's thinner.
  turf *= 0.93 + 0.10 * noise(q * 0.021 + 1.7) + 0.10 * (weather(q * 0.07) - 0.5);
  turf = mix(turf, turf * vec3(1.05, 1.05, 0.93), 0.4 * smoothstep(0.62, 0.86, noise(q * 0.045 + 3.1)));
  // Clumps a few inches across, turned so no grid shows, with shade between them.
  // Close detail is skipped where it can't resolve: distant turf, most of the frame, costs a few noises.
  vec2 r1 = mat2(0.8, -0.6, 0.6, 0.8) * q, r2 = mat2(0.28, 0.96, -0.96, 0.28) * q;
  float near_ = resolves(q, 5.1), fine = resolves(q, 9.0);
  if (near_ > 0.0) {
    float clump = noise(r1 * 2.3) * 0.5 + noise(r2 * 5.1 + 3.0) * 0.32 + noise(r1 * 11.0 + 7.0) * 0.18;
    // Full contrast only close in: at mid distance the clumps soften into the turf rather than reading as noise.
    float close = near_ * (0.45 + 0.55 * fine);
    turf *= 1.0 + close * (0.40 * (clump - 0.5) - 0.06 * smoothstep(0.42, 0.22, clump));
    // Straw catches the light on its tips; green clumps go yellow at theirs.
    turf = mix(turf, turf * vec3(1.06, 1.05, 0.9), close * (0.3 + 0.3 * straw) * smoothstep(0.62, 0.8, clump));
  }
  // Tufts and blades: crisp dark gaps and pale tips, each gone before it aliases.
  if (fine > 0.0) {
    float tuft = noise(r2 * 9.0 + 5.0) * 0.6 + noise(r1 * vec2(19.0, 13.0)) * 0.4;
    // Their contrast only comes in close, where the blades themselves resolve, so mid-distance turf stays smooth.
    float blades = fine * (0.35 + 0.65 * resolves(q, 26.0));
    turf *= 1.0 - blades * (0.30 * smoothstep(0.5, 0.78, tuft) - 0.12 * smoothstep(0.32, 0.12, tuft));
    turf *= 1.0 + 0.30 * resolves(q, 30.0) * (noise(r2 * vec2(30.0, 20.0) + 2.0) - 0.5);
  }
  turf = mix(turf, vec3(lookLuma(turf)), 0.08);
  // Bare dirt where it's trodden, in ragged patches rather than a smooth fade; turf the paint calls whole skips it.
  if (trodden <= 0.0) return turf;
  float ragged = noise(q * 0.55 + 11.0) * 0.6 + noise(q * 2.6) * 0.4;
  float bare = smoothstep(0.42, 0.6, trodden + (ragged - 0.5) * 0.7);
  if (bare <= 0.0) return turf;
  vec3 dirt = ${glslRgb('#7b6f5c')} * (l / 0.42) * (0.84 + 0.26 * noise(q * 1.7 + 4.0));
  if (fine > 0.0) dirt *= 1.0 + fine * 0.18 * (noise(r1 * 9.0) - 0.5);
  // Thin grass and straw survive in the dirt, and the patch edges are greener.
  float tufts = smoothstep(0.6, 0.8, noise(r2 * 3.7 + 1.0)) * (1.0 - bare * 0.6);
  return mix(turf, mix(dirt, turf * 0.85, tufts * 0.6), bare);
}

vec3 lookConcrete(vec3 c, vec2 q, vec3 n) {
  float flatwork = smoothstep(0.55, 0.85, abs(n.y));
  // Safety-yellow paint on concrete chips back to the concrete in flakes; duller paint is more worn.
  float yellow = c.r - c.b;
  if (yellow > 0.2) {
    float worn = clamp(1.0 - (yellow - 0.3) / 0.3, 0.0, 1.0);
    float chip = noise(q * 2.3 + 3.0) * 0.6 + noise(q * 9.1 + 1.0) * 0.4;
    float bare = smoothstep(0.6, 0.65, chip + 0.34 * worn - 0.2);
    c = mix(c * (1.0 - 0.1 * worn), ${glslRgb('#bdb8a8')} * (0.9 + 0.14 * chip), bare);
    // Grime ground into the worn paint.
    c *= 1.0 - 0.12 * worn * (1.0 - chip);
  }
  // Pours and trowelling: tone that drifts over tens of feet and a few feet.
  c *= 0.93 + 0.11 * weather(q * 0.05) + 0.06 * (noise(q * 0.21 + 7.0) - 0.5);
  // Gentle mottling a foot or two across, where the float left it denser or wetter.
  c *= 1.0 + 0.045 * (noise(q * 0.62 + 13.0) - 0.5) * (0.4 + 0.6 * resolves(q, 0.6));
  // Aggregate: fine sand, then sparse pale and dark stones.
  c += grain(q * 16.0) * 0.05;
  // Broom finish (faint streaks across the walk) and stones, only where they resolve.
  float broom = flatwork * resolves(q, 6.0), stones = resolves(q, 38.0);
  if (broom > 0.0) c *= 1.0 + broom * 0.05 * (noise(vec2(q.x * 6.0, q.y * 0.3)) - 0.5);
  if (stones > 0.0) {
    float stone = noise(q * 38.0 + 9.0);
    c *= 1.0 + stones * (0.07 * smoothstep(0.80, 0.95, stone) - 0.06 * smoothstep(0.20, 0.06, stone));
  }
  // Stains: rare, soft-edged blotches of water and grime.
  float stain = smoothstep(0.66, 0.86, noise(q * 0.12 + 21.0) * 0.7 + noise(q * 0.29 + 5.0) * 0.3) * (0.6 + 0.4 * noise(q * 1.1));
  c *= 1.0 - 0.075 * stain;
  // Cast walls: rain streaks running down them.
  if (flatwork < 1.0) c *= 1.0 - (1.0 - flatwork) * 0.11 * smoothstep(0.42, 0.9, noise(vec2(q.x * 1.6, q.y * 0.12 + 2.0)));
  // Urethane marks where boards land and roll away: long thin strokes along the roll, a pair's worth here and there.
  float zone = flatwork * lookMarkZone(q);
  if (zone > 0.0) {
    float stroke = noise(vec2(q.x * 0.22 + 3.0, q.y * 9.0));
    float mark = smoothstep(0.72, 0.86, stroke) * smoothstep(0.3, 0.65, noise(q * 0.3 + 8.0));
    c *= 1.0 - 0.2 * zone * mark * resolves(q, 9.0);
  }
  return c;
}

// Window glass: the dark room shows through square-on; the panes mirror the sky above the horizon and the
// pale, sunlit ground below it, more so at a glance (Fresnel), each pane a little warped its own way. Under
// an eave the reflection rising toward the sky meets the shaded soffit instead, so a covered walk's windows
// read dark. It carries its own light: a reflection isn't shaded by the eave's shadow, so the caller skips
// daylight for it.
vec3 lookGlass(vec3 c, vec3 n, vec3 world, vec2 q, vec3 local) {
  vec3 v = normalize(cameraPosition - world);
  if (dot(n, v) < 0.0) n = -n;
  vec2 warp = vec2(noise(q * 0.32), noise(q * 0.32 + 5.2)) - 0.5;
  vec3 t = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  n = normalize(n + 0.04 * (t * warp.x + vec3(0.0, warp.y, 0.0)));
  vec3 r = reflect(-v, n);
  // Sky over a ragged line of far trees, and the pale sunlit ground below the horizon.
  vec3 sky = mix(${glslRgb('#dfe5e6')}, ${glslRgb('#8eaec6')}, pow(clamp(r.y, 0.0, 1.0), 0.6));
  float azimuth = atan(r.z, r.x);
  float treeTop = 0.05 + 0.13 * noise(vec2(azimuth * 9.0, 1.0)) + 0.06 * noise(vec2(azimuth * 31.0, 4.0));
  sky = mix(sky, ${glslRgb('#56604d')} * (0.8 + 0.4 * noise(vec2(azimuth * 60.0, r.y * 40.0))), smoothstep(0.012, -0.012, r.y - treeTop));
  vec3 below = mix(${glslRgb('#b4b19f')}, ${glslRgb('#7d8a5e')}, smoothstep(-0.1, -0.45, r.y));
  // Linear light, tinted by the glass, the open sky brighter than white paper.
  vec3 env = pow(mix(below, sky, smoothstep(-0.03, 0.03, r.y)), vec3(2.2)) * vec3(0.84, 0.9, 0.88) * mix(1.0, 1.2, step(treeTop, r.y));
  env = mix(env, pow(${glslRgb('#6f6a5d')}, vec3(2.2)) * (0.85 + 0.3 * noise(q * 0.6)), lookReflectBlocked(local * ${SET_FOOT.toFixed(1)}, r));
  float cosv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = 0.05 + 0.95 * pow(1.0 - cosv, 5.0);
  // Uneven from pane to pane: some reflect more, some show blinds or a lit room behind.
  float pane = noise(q * 0.3 + 3.7) * 0.7 + noise(q * 0.9 + 1.3) * 0.3;
  vec3 room = pow(c, vec3(2.2)) * (0.7 + 1.2 * smoothstep(0.6, 0.95, noise(q * 0.31 + 11.0)));
  float k = clamp((0.1 + 1.6 * fresnel) * (0.45 + 1.1 * pane), 0.0, 0.94);
  return pow(mix(room, env, k), vec3(1.0 / 2.2));
}

// Concrete block, 8 x 16 in, running bond, recessed 3/8 in joints: each joint box-filtered over the pixel, so
// courses read as fine lines at mid distance and fade to their average tone before they can shimmer.
float lookJointArea(float u, float period, float width) {
  // Integral of the joint (width wide, centred on each multiple of period) from 0 to u.
  float m = mod(u, period);
  return floor(u / period) * width + min(m, 0.5 * width) + max(0.0, m - period + 0.5 * width);
}
float lookJoint(float x, float period, float width) {
  float h = max(fwidth(x), 1e-4) * 0.5;
  return clamp((lookJointArea(x + h, period, width) - lookJointArea(x - h, period, width)) / (2.0 * h), 0.0, 1.0);
}
vec3 lookMasonry(vec3 c, vec2 q, vec3 n) {
  if (abs(n.y) > 0.5) return c;
  float row = floor(q.y / 0.6667);
  float x = q.x + 0.6667 * mod(row, 2.0);
  // Each block its own tone, once blocks are bigger than a pixel or two.
  c *= 1.0 + 0.07 * resolves(q, 0.75) * (hash(vec2(floor(x / 1.3333), row) + 17.0) - 0.5);
  float joint = max(lookJoint(q.y, 0.6667, 0.032), lookJoint(x, 1.3333, 0.032));
  return c * (1.0 - 0.32 * joint);
}

vec3 lookStucco(vec3 c, vec2 q, vec3 n) {
  c *= 0.96 + 0.07 * weather(q * 0.11);
  c += grain(q * 24.0) * 0.05 + grain(q * 6.0) * 0.02;
  // Dust settles on the upper faces of sills and ledges.
  c *= 1.0 - 0.05 * smoothstep(0.6, 0.9, n.y) * noise(q * 0.7);
  return c;
}

vec3 lookMetal(vec3 c, vec2 q, vec3 n, vec3 world) {
  vec3 v = normalize(cameraPosition - world);
  if (dot(n, v) < 0.0) n = -n;
  // Spangle or uneven paint, then a soft, quiet highlight.
  c *= 0.96 + 0.07 * noise(q * 3.0);
  float spec = pow(max(dot(n, normalize(SUN + v)), 0.0), 24.0);
  return c + vec3(0.11) * spec;
}

vec3 lookSiding(vec3 c, vec2 q, vec3 n) {
  if (abs(n.y) > 0.5) return lookStucco(c, q, n);
  // Boards eight inches apart, each a touch its own tone, with sun-faded streaks running down them.
  float board = floor(q.x / 0.6667);
  c *= 1.0 + 0.05 * resolves(q, 1.0) * (hash(vec2(board, 3.0)) - 0.5);
  c *= 0.95 + 0.08 * noise(vec2(q.x * 0.9, q.y * 0.07)) + 0.04 * (weather(q * 0.12) - 0.5);
  c += grain(q * 18.0) * 0.04;
  // The routed groove: a shadowed line, box-filtered so it fades to a faint tone before it can shimmer.
  return c * (1.0 - 0.38 * lookJoint(q.x + 0.02, 0.6667, 0.045));
}

vec3 lookSurface(vec3 c, float surface, vec2 q, vec3 n, vec3 world, vec3 local) {
  // Turf is projected from above, so a steep bank never stretches it or seams where faces turn.
  if (surface < 14.5) return lookGrass(c, local.xz);
  if (surface < 15.5) return lookConcrete(c, q, n);
  if (surface < 16.5) return lookGlass(c, n, world, q, local);
  if (surface < 17.5) return lookStucco(c, q, n);
  if (surface < 18.5) return lookMetal(c, q, n, world);
  return lookSiding(c, q, n);
}
`;
}

/**
 * Soft shadow-box shadows (uBoxMin/uBoxMax/uBoxCount, set units) for the look; needs SUN. A box may stand at an
 * angle: its corners are given in the frame its yaw makes, and the yaw's cosine and sine ride in the corners'
 * fourth components (no uniform vectors of their own).
 */
export const LOOK_BOX_SHADOW_GLSL = /* glsl */ `
uniform int uBoxCount;
uniform vec4 uBoxMin[12];
uniform vec4 uBoxMax[12];
uniform vec4 uLook;
// A point or a direction in box i's frame.
vec3 lookBoxFrame(vec3 v, int i) {
  vec2 turn = vec2(uBoxMin[i].w, uBoxMax[i].w);
  return vec3(v.x * turn.x + v.z * turn.y, v.y, v.z * turn.x - v.x * turn.y);
}
// uLook: x share of the sun a box blocks, y penumbra growth, z contact scale, w box-foot reach (set units).
float lookBoxShadow(vec3 at) {
  float shade = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uBoxCount) break;
    vec3 p = lookBoxFrame(at, i), sun = lookBoxFrame(SUN, i);
    // A turn can lay the sun along a face: keep the slabs' division finite.
    sun.xz += step(abs(sun.xz), vec2(1e-4)) * 2e-4;
    vec3 a = (uBoxMin[i].xyz - p) / sun, b = (uBoxMax[i].xyz - p) / sun;
    vec3 near_ = min(a, b), far_ = max(a, b);
    float enter = max(max(near_.x, near_.y), near_.z);
    float leave = min(min(far_.x, far_.y), far_.z);
    if (leave < 0.5) continue;
    // The ray's chord through the box goes negative as it misses: a penumbra about the edge, wider farther from the caster.
    float w = 1.5 + uLook.y * max(enter, 0.0);
    shade = max(shade, smoothstep(-w, w, leave - max(enter, 0.5)));
  }
  return shade * uLook.x;
}
// Share of the open sky a point under a box overhead still sees (1 in the open): it looks out past the box's
// nearest edge, so less of the sky the closer it is up under it.
float lookSkyOpen(vec3 at) {
  float open = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uBoxCount) break;
    vec3 lo = uBoxMin[i].xyz, hi = uBoxMax[i].xyz, p = lookBoxFrame(at, i);
    float below = lo.y - p.y;
    vec2 inside = min(p.xz - lo.xz, hi.xz - p.xz);
    float edge = min(inside.x, inside.y);
    if (below < -0.5 || edge < 0.0) continue;
    open = min(open, max(below, 0.0) / (max(below, 0.0) + edge + 1.0));
  }
  return open;
}
`;

/** Reflections that run into a shadow box (glass under an eave); for props with `propShadows`, after LOOK_BOX_SHADOW_GLSL. */
export const LOOK_REFLECT_GLSL = /* glsl */ `
// 1 if a ray from a point (set units) along dir runs into a box: a reflection meeting an eave. A point inside
// a box (glass set in its wall) doesn't see that box.
float lookReflectBlocked(vec3 at, vec3 dir) {
  for (int i = 0; i < 12; i++) {
    if (i >= uBoxCount) break;
    vec3 p = lookBoxFrame(at, i), d = lookBoxFrame(dir, i);
    d += step(abs(d), vec3(1e-4)) * 2e-4;
    vec3 a = (uBoxMin[i].xyz - p) / d, b = (uBoxMax[i].xyz - p) / d;
    vec3 near_ = min(a, b), far_ = max(a, b);
    float enter = max(max(near_.x, near_.y), near_.z);
    float leave = min(min(far_.x, far_.y), far_.z);
    if (enter > 1.0 && leave > enter) return 1.0;
  }
  return 0.0;
}
`;

/** Contact darkening and tree dapple for the look's ground; needs SUN, noise and LOOK_BOX_SHADOW_GLSL. */
export const LOOK_GROUND_GLSL = /* glsl */ `
uniform int uContactCount;
uniform vec4 uContactA[${MAX_CONTACTS}];
uniform vec4 uContactB[${MAX_CONTACTS}];
uniform vec4 uContactStep[${MAX_CONTACTS}];
uniform int uCanopyCount;
uniform vec4 uCanopy[${MAX_CANOPIES}];
uniform float uDapple;
float lookContact(vec3 p) {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_CONTACTS}; i++) {
    if (i >= uContactCount) break;
    vec3 a = uContactA[i].xyz, ab = uContactB[i].xyz - a;
    vec4 st = uContactStep[i];
    if (st.w > 1.5) a += st.xyz * clamp(floor(dot(p - a, st.xyz) / max(dot(st.xyz, st.xyz), 1e-3) + 0.5), 0.0, st.w - 1.0);
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    float f = 1.0 - smoothstep(0.0, uContactA[i].w, length(p - a - t * ab));
    occ = max(occ, uContactB[i].w * f * f);
  }
  // Where each shadow box stands on the ground.
  if (uLook.w > 0.0) for (int i = 0; i < 12; i++) {
    if (i >= uBoxCount) break;
    vec3 lo = uBoxMin[i].xyz, hi = uBoxMax[i].xyz, q = lookBoxFrame(p, i);
    vec2 out_ = max(max(lo.xz - q.xz, q.xz - hi.xz), 0.0);
    float d = length(vec2(length(out_), max(abs(q.y - lo.y) - 0.5, 0.0)));
    float f = 1.0 - smoothstep(0.0, uLook.w, d);
    occ = max(occ, 0.28 * f * f);
  }
  return min(occ * uLook.z, 0.6);
}
float lookDapple(vec3 p) {
  float shade = 0.0;
  for (int i = 0; i < ${MAX_CANOPIES}; i++) {
    if (i >= uCanopyCount) break;
    vec3 delta = uCanopy[i].xyz - p;
    float along = dot(delta, SUN);
    if (along < 0.0) continue;
    vec3 across = delta - SUN * along;
    float r = uCanopy[i].w;
    float d = sqrt(dot(across, across)) / r;
    if (d >= 1.25) continue;
    // In feet across the crown, turned and bent differently for each tree: each pattern is its own, stays
    // put, and lines up with nothing (noise cut at a level otherwise falls into square blocks).
    float turn = float(i) * 2.4 + 0.7;
    vec2 c = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * (across.xz / ${SET_FOOT.toFixed(1)}) + float(i) * 7.31;
    c += 0.5 * sin(c.yx * 0.83 + turn);
    // The sun's disc blurs the shade the farther the ground is below the crown.
    float soft = 0.06 + 0.004 * along / ${SET_FOOT.toFixed(1)};
    // A ragged outline; leaves thick over the middle of the crown and thinning to gaps of sky at its rim.
    float edge = d + 0.3 * (noise(c * 0.17) - 0.5);
    float body = 1.0 - smoothstep(0.7 - soft, 1.0 + soft, edge);
    float leaves = noise(c * 0.45) * 0.65 + noise(mat2(0.8, 0.6, -0.6, 0.8) * c * 1.25 + 3.0) * 0.35;
    float cover = smoothstep(0.22 + 0.2 * d - soft, 0.42 + 0.2 * d + soft, leaves);
    // Round flecks of sun through the leaves: one to a cell, some cells with none, each kept inside its cell.
    vec2 cell = c * 0.7, f = fract(cell) - 0.5;
    float h = hash(floor(cell) + float(i) * 17.0);
    vec2 middle = 0.13 * (vec2(fract(h * 13.7), fract(h * 71.3)) * 2.0 - 1.0);
    float size = 0.08 + 0.13 * fract(h * 37.9), blur = min(soft, 0.12);
    float fleck = step(0.4, h) * (1.0 - smoothstep(size - blur, size + blur, length(f - middle)));
    shade = max(shade, body * cover * (1.0 - 0.75 * fleck));
  }
  return shade * uDapple;
}
`;
