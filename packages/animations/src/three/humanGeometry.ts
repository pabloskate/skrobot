import type { BufferGeometry } from 'three';
import { smoothstep } from '../scene/math';
import { loftGeometry } from './geometry';
import { SHIN, THIGH } from '../scene/skeleton';
import type { Vec3 } from './view';

/**
 * The skater's body, cut like clothes over a person. Every piece is built in
 * the local axes of the frame that carries it (x forward or along the bone,
 * y up, z to the right), as a loft: a cross-section swept along an axis,
 * changing size and center as it goes. Proportions are a young adult's —
 * a head about a seventh of the height, long legs, hands to mid-thigh.
 *
 * Modelled at the robot's scale, where the rig's own numbers are, and drawn
 * HUMAN_SCALE bigger (the head HUMAN_HEAD): standing over the robot's board
 * and feet, that's a grown-up about two boards tall. The pant legs are the
 * exception, cut at the person's size, because they have to fit both the
 * board's clearance and the shoes.
 */

// ---------- Size ----------

/** How much bigger than modelled the person is drawn, and the rig grown: hips up, and the legs' bones. */
export const HUMAN_SCALE = 1.42;
/** How much bigger than modelled the head is drawn: a grown-up's head is a smaller share of them than a kid's. */
export const HUMAN_HEAD = 1.2;
/** The person's leg bones (world units). */
export const HUMAN_THIGH = THIGH * HUMAN_SCALE;
export const HUMAN_SHIN = SHIN * HUMAN_SCALE;
/** Shoulder joint to elbow, and elbow to wrist, as modelled. */
export const HUMAN_UPPER_ARM = 19;
export const HUMAN_FOREARM = 17;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Piecewise-linear profile through (t, value) keys, eased between them. */
export function profile(keys: ReadonlyArray<readonly [number, number]>): (t: number) => number {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        return lerp(v0, v1, smoothstep((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** A vertical loft: `along` is height (y), the cross-section spans depth (x) and width (z). */
const upright = (y0: number, mirror = 1) => (along: number, a: number, b: number): Vec3 => [a, y0 + along, mirror * b];

// ---------- Head ----------

/** The skull's place in the rig's head frame: lower than the robot's big box head, a touch back. */
export const SKULL_AT = { f: -1.5, u: -8 } as const;
/** Skull height span (skull-local y), from the chin's station to the crown's. */
const SKULL_Y0 = -10.5;
const SKULL_Y1 = 8.5;

const skullDepth = profile([[0, 5.6], [0.13, 8.2], [0.3, 9.8], [0.47, 10.4], [0.62, 10.8], [0.82, 11], [1, 10.5]]);
const skullWidth = profile([[0, 4.8], [0.13, 7.3], [0.3, 8.8], [0.47, 9.5], [0.62, 9.9], [0.82, 10], [1, 9.6]]);
const skullForward = profile([[0, 3.3], [0.13, 1.8], [0.3, 0.9], [0.47, 0.45], [0.62, 0.2], [1, -0.4]]);

/** Skull-local half depth, half width, and forward shift at a height: what the face is painted on. */
export function skullAt(y: number): { depth: number; width: number; forward: number } {
  const t = (y - SKULL_Y0) / (SKULL_Y1 - SKULL_Y0);
  return { depth: skullDepth(t), width: skullWidth(t), forward: skullForward(t) };
}

/** The head: an egg, flatter in the face, narrowing to a jaw with the chin forward. */
export function skullGeometry(): BufferGeometry {
  return loftGeometry({
    length: SKULL_Y1 - SKULL_Y0,
    radius: (t) => [skullDepth(t), skullWidth(t)],
    offset: (t) => [skullForward(t), 0],
    square: () => 0.9,
    caps: [0.42, 0.66],
    warp: upright(SKULL_Y0),
    stations: 30,
    radial: 48,
  });
}

/** Ears sit level with the eyes, just behind the skull's middle. */
export const EAR_AT: Vec3 = [-1.2, -0.6, 9.4];

/** One ear (the right; mirror for the left): a cupped oval tipped back. */
export function earGeometry(mirror: 1 | -1): BufferGeometry {
  const tilt = (12 * Math.PI) / 180;
  const r = profile([[0, 1.5], [0.25, 2.2], [0.6, 2.4], [1, 1.9]]);
  return loftGeometry({
    length: 6.4,
    radius: (t) => [r(t), r(t) * 0.45],
    caps: [0.9, 0.9],
    warp: (along, a, b) => {
      // Up the ear; a across its face, front to back; b out from the head.
      const y = along - 3.2;
      return [EAR_AT[0] + a * Math.cos(tilt) - y * Math.sin(tilt), EAR_AT[1] + a * Math.sin(tilt) + y * Math.cos(tilt), mirror * (EAR_AT[2] + 0.4 + b)];
    },
    stations: 10,
    radial: 20,
  });
}

/** The nose: where its bridge leaves the face between the eyes, and where its underside meets the lip. */
export const NOSE = { top: 1, bottom: -4.4 } as const;

/**
 * The nose: a wedge standing off the face, narrow along the bridge from
 * between the eyes, rounding out to the tip, with the nostrils' wings
 * either side of its base and the underside turning back in to the lip.
 * Its back is buried in the skull; what shows is how far it stands out.
 */
export function noseGeometry(): BufferGeometry {
  const length = NOSE.top - NOSE.bottom;
  /** How far the nose stands out in front of the face, and its half width, down from the bridge. */
  const out = profile([[0, 0.3], [0.35, 1.2], [0.7, 2.55], [0.82, 2.85], [0.93, 2.25], [1, 1.1]]);
  const half = profile([[0, 0.95], [0.45, 1.05], [0.72, 1.45], [0.87, 1.95], [1, 1.6]]);
  /** How far the nose's back is buried behind the face: little, so its sides slope into the cheeks instead of standing up off them. */
  const BURIED = 0.7;
  const front = (t: number) => {
    const s = skullAt(NOSE.top - t * length);
    return s.depth + s.forward;
  };
  return loftGeometry({
    length,
    radius: (t) => [out(t) + BURIED, half(t)],
    offset: (t) => [front(t) - BURIED, 0],
    caps: [0.4, 0.3],
    warp: (along, a, b) => [a, NOSE.top - along, b],
    stations: 22,
    radial: 28,
  });
}

/**
 * Curly hair under the beanie: a mop fuller at the back and sides than the
 * skull, so it puffs out of the cuff there, and sunk inside the skull at the
 * face, so the face is clear. Its edge against the skin is where the two
 * surfaces cross; the outline pass inks it.
 */
export function hairGeometry(): BufferGeometry {
  const y0 = -6.5;
  const length = 14;
  const tilt = Math.tan((BEANIE.tilt * Math.PI) / 180);
  return loftGeometry({
    length,
    radius: (t) => {
      const s = skullAt(y0 + t * length);
      const puff = profile([[0, 0.1], [0.2, 1.1], [0.6, 1.6], [1, 1.0]])(t);
      return [s.depth + puff, s.width + puff * 0.95];
    },
    offset: (t) => {
      const s = skullAt(y0 + t * length);
      // Pushed back: the mop hangs off the back of the head and clears the face.
      return [s.forward - profile([[0, 3.6], [0.4, 2.9], [1, 2.2]])(t), 0];
    },
    caps: [0.35, 0.4],
    warp: (along, a, b) => {
      // Curls: the surface ripples round the head and in rows down it.
      const ripple = 1 + 0.045 * Math.sin(Math.atan2(b, a) * 11 + along * 0.9) * Math.sin(along * 1.3 + 0.6);
      let x = a * ripple;
      let z = b * ripple;
      const y = y0 + along;
      // Above the cuff's line the beanie holds it in: pulled back inside the
      // skull's own outline there, so only what's under the cuff puffs out.
      const over = smoothstep((y - (BEANIE.at[1] + (x - BEANIE.at[0]) * tilt) + 1.2) / 1.6);
      if (over > 0) {
        const s = skullAt(Math.min(y, SKULL_Y1));
        const r = Math.hypot((x - s.forward) / s.depth, z / s.width) || 1;
        const k = 1 + (Math.min(1, 0.98 / r) - 1) * over;
        x = s.forward + (x - s.forward) * k;
        z *= k;
      }
      return [x, y, z];
    },
    stations: 28,
    radial: 64,
  });
}

/** A curl springing out from under the cuff: a little hook of hair. */
export function curlGeometry(size: number, mirror: 1 | -1): BufferGeometry {
  return loftGeometry({
    length: 3.2 * size,
    radius: (t) => {
      const r = lerp(1.25, 0.55, t) * size;
      return [r, r];
    },
    caps: [1, 1],
    warp: (along, a, b) => {
      // Bend the tube round into a hook.
      const bend = along / (3.2 * size);
      const angle = bend * 2.2;
      const R = 2 * size;
      const cx = Math.sin(angle) * R;
      const cy = (1 - Math.cos(angle)) * R;
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      return [cx + nx * a, cy + ny * a, mirror * b];
    },
    stations: 10,
    radial: 14,
  });
}

// ---------- Beanie ----------

/** The beanie: where its brim ring sits in skull-local space, and how far it's pushed back. */
export const BEANIE = { at: [0.3, 5.3, 0] as Vec3, tilt: 13, cuff: 3.3 } as const;

/**
 * A cuffed knit beanie worn pushed back: a band folded up round the head
 * with a step in to the crown, the crown slouching a little behind.
 */
export function beanieGeometry(): BufferGeometry {
  const s = skullAt(BEANIE.at[1]);
  const length = 8;
  const cuffT = BEANIE.cuff / length;
  const depth = profile([[0, s.depth + 1.0], [cuffT - 0.02, s.depth + 1.3], [cuffT + 0.03, s.depth + 0.7], [0.65, s.depth + 0.6], [1, s.depth - 1.2]]);
  const width = profile([[0, s.width + 0.9], [cuffT - 0.02, s.width + 1.2], [cuffT + 0.03, s.width + 0.6], [0.65, s.width + 0.45], [1, s.width - 1.3]]);
  const tilt = (BEANIE.tilt * Math.PI) / 180;
  return loftGeometry({
    length,
    radius: (t) => [depth(t), width(t)],
    offset: (t) => [s.forward - profile([[0, 0], [0.6, 0.4], [1, 1.1]])(t), 0],
    square: () => 0.92,
    caps: [0.2, 0.58],
    warp: (along, a, b) => {
      // Tip the crown back about the brim's center: the front of the brim rides up.
      const x = a;
      const y = along;
      return [BEANIE.at[0] + x * Math.cos(tilt) - y * Math.sin(tilt), BEANIE.at[1] + x * Math.sin(tilt) + y * Math.cos(tilt), b];
    },
    stations: 30,
    radial: 56,
  });
}

// ---------- Torso ----------

/** Tee heights in the rig's torso frame (its origin sits 14 above the hip joints). */
export const TEE = { hem: -21, top: 19 } as const;

const teeDepth = profile([[0, 11.4], [0.18, 10.8], [0.4, 10], [0.68, 10], [0.88, 9.6], [1, 8.6]]);
const teeWidth = profile([[0, 14.8], [0.14, 14.3], [0.36, 13.7], [0.68, 14.2], [0.88, 14.7], [1, 14.6]]);
const teeForward = profile([[0, 0.2], [0.36, 0.3], [0.68, 1], [1, 0.4]]);

/**
 * An oversized tee: boxy, hanging to just past the waistband and flaring a
 * little at the hem, the shoulders dropped and rounded off, open at the
 * bottom like the real thing. Its lower half turns with the hips and its
 * upper half with the chest, and the legs push it out of their way (see
 * Human3D), so it twists and drapes the way cloth does.
 */
export function teeGeometry(): BufferGeometry {
  return loftGeometry({
    length: TEE.top - TEE.hem,
    radius: (t) => [teeDepth(t), teeWidth(t)],
    offset: (t) => [teeForward(t), 0],
    square: (t) => lerp(0.78, 0.9, t),
    caps: [0, 0.42],
    // Open at the hem: the legs are inside it, not through a floor.
    open: [true, false],
    warp: (along, a, b) => {
      // Drape: soft folds falling from the chest, deepest at the hem.
      const fold = 1 + 0.035 * Math.sin(Math.atan2(b, a) * 7 + 0.8) * (1 - smoothstep(along / 26));
      return [a * fold, TEE.hem + along, b * fold];
    },
    stations: 34,
    radial: 72,
  });
}

/** The tee's hold on the body at a height: 0 turns with the hips, 1 with the chest. */
export const teeChestWeight = (y: number) => smoothstep((y - (TEE.hem + 4)) / (12 - (TEE.hem + 4)));

/**
 * The seat of the pants, in the hips' own frame (origin between the hip
 * joints): the waistband, under the tee's hem, and the seat the thighs
 * come out of.
 */
export const SEAT = { bottom: -7, top: 3.5 } as const;
export function seatGeometry(): BufferGeometry {
  return loftGeometry({
    length: SEAT.top - SEAT.bottom,
    radius: (t) => [profile([[0, 6.4], [0.45, 8.6], [0.8, 8.5], [1, 8.0]])(t), profile([[0, 9], [0.45, 12.4], [0.8, 12.6], [1, 12.2]])(t)],
    offset: (t) => [profile([[0, -0.3], [0.45, -0.7], [1, 0]])(t), 0],
    square: () => 0.8,
    caps: [0.55, 0.3],
    warp: upright(SEAT.bottom),
    stations: 16,
    radial: 44,
  });
}

/**
 * A short sleeve, from inside the shoulder down the upper arm: wide at the
 * armhole, open at the end (a flat hem the arm comes out of).
 */
export const SLEEVE = { start: -0.5, length: 11 } as const;
export function sleeveGeometry(): BufferGeometry {
  const r = profile([[0, 6.1], [0.5, 5.8], [1, 5.7]]);
  return loftGeometry({
    length: SLEEVE.length,
    radius: (t) => [r(t), r(t)],
    caps: [0.55, 0.12],
    warp: (along, a, b) => [SLEEVE.start + along, a, b],
    stations: 12,
    radial: 32,
  });
}

// ---------- Limbs ----------

/** A limb along +x from 0 to `length` with a radius profile and round ends. */
function limb(length: number, r: (t: number) => number, caps: readonly [number, number] = [1, 1], extra = 0): BufferGeometry {
  return loftGeometry({
    length: length + extra,
    radius: (t) => [r(t), r(t)],
    caps,
    stations: 18,
    radial: 28,
  });
}

/** Bare arms: a lean upper arm and a forearm swelling below the elbow, narrowing to the wrist. */
export const ARM_RADII = { shoulder: 4.3, elbow: 3.5, forearm: 3.75, wrist: 2.75 } as const;
export const upperArmGeometry = () => limb(HUMAN_UPPER_ARM, profile([[0, ARM_RADII.shoulder], [0.4, 4.1], [1, ARM_RADII.elbow]]));
export const forearmGeometry = () => limb(HUMAN_FOREARM, profile([[0, ARM_RADII.elbow], [0.22, ARM_RADII.forearm], [1, ARM_RADII.wrist]]));

/**
 * Pant legs, cut at the person's size (world units): room in the thigh,
 * then slimmer down the shin to an ankle that drops into the shoe's collar.
 * The hem runs on past the ankle and breaks over the shoe, kept narrower
 * than the shoe so it never shows through its sides. The rig tucks the feet
 * to clear a board as thick as the robot's legs; where these roomier legs
 * would still take it, humanRig swings the knee aside.
 */
export const PANT_RADII = { hip: 10.9, knee: 7.8, ankle: 5.6 } as const;
export const PANT_HEM = 3.6;
const thighProfile = profile([[0, PANT_RADII.hip], [0.35, 10.4], [0.75, 9.1], [1, PANT_RADII.knee]]);
const shinProfile = profile([[0, PANT_RADII.knee], [1, PANT_RADII.ankle], [1 + (PANT_HEM / HUMAN_SHIN) * 0.5, 5.9], [1 + PANT_HEM / HUMAN_SHIN, 6.1]]);
/** A pant leg's radius by distance down the thigh from the hip. */
export const thighRadius = (along: number) => thighProfile(along / HUMAN_THIGH);
/** A pant leg's radius by distance down the shin from the knee (to HUMAN_SHIN at the ankle, then the hem). */
export const shinRadius = (along: number) => shinProfile(along / HUMAN_SHIN);
export const thighGeometry = () => limb(HUMAN_THIGH, (t) => thighRadius(t * HUMAN_THIGH));
export const shinGeometry = () => limb(HUMAN_SHIN, (t) => shinRadius(t * (HUMAN_SHIN + PANT_HEM)), [1, 0.12], PANT_HEM);

// ---------- Hands ----------

/**
 * A relaxed hand, in hand-local axes: x from the wrist to the fingertips, y
 * out of the back of the hand, z toward the thumb (`mirror` -1 for the right
 * hand, so both thumbs point forward). Palm, four curled fingers, and thumb.
 */
export function handGeometries(mirror: 1 | -1): BufferGeometry[] {
  const palmGeometry = loftGeometry({
    length: 6.6,
    radius: (t) => [lerp(1.75, 1.85, t), lerp(2.6, 3.25, smoothstep(t * 1.4))],
    offset: (t) => [0, lerp(0, -0.3, t)],
    square: () => 0.75,
    caps: [0.8, 0.45],
    warp: (along, a, b) => [0.4 + along, a, mirror * b],
    stations: 10,
    radial: 28,
  });
  // Four fingers off the knuckles, each curling a little more toward the palm than the last.
  const fingers = [
    { z: 2.0, length: 5.3, curl: 0.75 },
    { z: 0.68, length: 5.9, curl: 0.85 },
    { z: -0.66, length: 5.5, curl: 0.95 },
    { z: -1.92, length: 4.4, curl: 1.05 },
  ].map(({ z, length, curl }) => loftGeometry({
    length,
    radius: (t) => {
      const r = lerp(0.86, 0.66, t);
      return [r * 1.05, r];
    },
    caps: [1, 1],
    warp: (along, a, b) => {
      const angle = (along / length) * curl;
      const R = length / curl;
      const cx = 6.6 + Math.sin(angle) * R;
      const cy = -0.2 - (1 - Math.cos(angle)) * R;
      return [cx - Math.sin(angle) * a, cy + Math.cos(angle) * a, mirror * (z + b)];
    },
    stations: 10,
    radial: 14,
  }));
  const thumb = loftGeometry({
    length: 5.6,
    radius: (t) => {
      const r = lerp(1.45, 1.05, t);
      return [r, r];
    },
    caps: [1, 1],
    warp: (along, a, b) => {
      // Out from the heel of the palm, forward and down beside the fingers.
      const d: Vec3 = [0.72, -0.42, 0.55];
      const m = Math.hypot(...d);
      const u: Vec3 = [d[0] / m, d[1] / m, d[2] / m];
      // Two axes square to it.
      const e1: Vec3 = [0, Math.cos(0.3), Math.sin(0.3)];
      const dot = e1[0] * u[0] + e1[1] * u[1] + e1[2] * u[2];
      const p: Vec3 = [e1[0] - u[0] * dot, e1[1] - u[1] * dot, e1[2] - u[2] * dot];
      const pm = Math.hypot(...p);
      const v: Vec3 = [p[0] / pm, p[1] / pm, p[2] / pm];
      const w: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const base: Vec3 = [1.8, -0.7, 2.2];
      return [
        base[0] + u[0] * along + v[0] * a + w[0] * b,
        base[1] + u[1] * along + v[1] * a + w[1] * b,
        mirror * (base[2] + u[2] * along + v[2] * a + w[2] * b),
      ];
    },
    stations: 10,
    radial: 18,
  });
  return [palmGeometry, ...fingers, thumb];
}
