import { CylinderGeometry, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { ARM_RADII, HAND_RADIUS, LEG_RADII } from '../../motion/skeleton';
import { roundedBoxGeometry, type BoxSpec } from '../../three/geometry';
import type { RobotLook } from '../look';

/**
 * The robot's mechanical fittings. Each is in the
 * local axes its rig frame gives it (x forward, y up, z to the side), and
 * each keeps inside the rig's clearance for its joint (skeleton.ts), so the
 * motion that keeps the limbs out of the board keeps these out too.
 */

const smooth = <T extends BufferGeometry>(geometry: T) => {
  geometry.deleteAttribute('uv');
  return geometry;
};

/** The shoulder's cap and the knee's ball: as big as the rig allows its joint. */
export const SHOULDER_R = ARM_RADII.shoulder;
export const KNEE_R = LEG_RADII.knee;

/** A captive ball with a retaining ring machined into each side. All cuts go into the original sphere. */
export function ballGeometry(r: number) {
  // Radius and depth from the equator out to the center of the axle cap, as fractions of r.
  const cap = [[1, 0], [0.985, 0.16], [0.94, 0.33], [0.87, 0.48], [0.8, 0.58],
    [0.73, 0.65], [0.70, 0.61], [0.67, 0.61], [0.65, 0.69], [0.62, 0.72],
    [0.49, 0.75], [0.38, 0.85], [0.28, 0.91], [0.16, 0.965], [0, 1]];
  const profile = [
    ...cap.slice(1).reverse().map(([width, z]) => new Vector2(r * width, -r * z)),
    ...cap.map(([width, z]) => new Vector2(r * width, r * z)),
  ];
  return smooth(new LatheGeometry(profile, 32)).rotateX(Math.PI / 2);
}

/**
 * A turned actuator between two bearing centers. The softened tube shoulders, ferrule and exposed
 * shaft all fit the old tapered limb. x runs from 0 to 1 for placeBetween, so both journals stay
 * seated even through blends where the distance between rig joints changes.
 */
export function linkGeometry(ra: number, rb: number, length: number) {
  const stations = [[0, 0.72], [0.12, 0.72], [0.14, 0.84], [0.17, 0.96], [0.20, 1],
    [0.66, 1], [0.69, 0.97], [0.695, 0.895], [0.705, 0.895], [0.71, 0.98],
    [0.735, 0.98], [0.75, 0.90], [0.756, 0.70], [0.94, 0.70], [1, 0.68]];
  const profile = [new Vector2(0, 0), ...stations.map(([t, k]) => new Vector2((ra + (rb - ra) * t) * k, t * length)), new Vector2(0, length)];
  return smooth(new LatheGeometry(profile, 24)).rotateZ(-Math.PI / 2).scale(1 / length, 1, 1);
}

/**
 * The glove, along the forearm from the wrist at 0: a rolled cuff the
 * forearm goes into, then the mitt, widest over the knuckles and closing to
 * a blunt tip. `floor` is the least it narrows to between the two, clear of
 * the forearm inside it.
 */
const MITT = {
  cuff: { at: -2.6, half: 1, r: 4.55 },
  palm: { at: 1, back: 3, front: 4.6, r: 5 },
  floor: 3.95,
} as const;

/**
 * A hand: a mitt with a rolled cuff, one moulding turned about the forearm
 * (placement.ts's placeBetween leaves its roll arbitrary, so it has to look
 * the same all the way round), inside the ball the rig keeps clear for it.
 */
export function mittGeometry(): BufferGeometry {
  const { cuff, palm, floor } = MITT;
  const from = cuff.at - cuff.half;
  const tip = palm.at + palm.front;
  const arc = (x: number, at: number, half: number) => Math.sqrt(Math.max(0, 1 - ((x - at) / half) ** 2));
  const steps = 28;
  const profile = [new Vector2(0, from)];
  for (let i = 0; i <= steps; i++) {
    const x = from + ((tip - from) * i) / steps;
    const bead = floor + (cuff.r - floor) * arc(x, cuff.at, cuff.half);
    const mitt = palm.r * arc(x, palm.at, x < palm.at ? palm.back : palm.front);
    // Past the knuckles the mitt alone closes the tip.
    const r = x > palm.at ? mitt : Math.max(bead, mitt);
    profile.push(new Vector2(Math.min(r, Math.sqrt(Math.max(0, HAND_RADIUS ** 2 - x * x))), x));
  }
  return smooth(new LatheGeometry(profile, 24)).rotateZ(-Math.PI / 2);
}

/** An ear: its radius, how proud of the head's side it stands, and how far back of the head's middle. */
const EAR = { r: 4.8, proud: 0.6, depth: 1.4, back: 1 } as const;

/** A chamfered retaining ring and inset center, in the original ear button's envelope. */
export function earGeometry(head: BoxSpec, side: 1 | -1) {
  const profile = [[0, EAR.proud - 2 * EAR.depth], [EAR.r, EAR.proud - EAR.depth], [4.15, -0.18],
    [3.85, 0.03], [3.65, 0.03], [3.52, -0.07], [3.36, 0.08], [3.12, 0.29], [1.4, 0.47], [0, EAR.proud]];
  return smooth(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 32))
    .rotateX(side * Math.PI / 2).translate(-EAR.back, 0, side * head.s);
}

/** An antenna's socket: its radii, top and bottom, and its height over the head's top. */
const SOCKET = { top: 2.8, bottom: 3.2, height: 1.8 } as const;

/**
 * Where the antenna (or the crest) is let into the top of the head: a
 * collar round each stalk's foot, a plinth under the crest. `at` is where
 * each stalk leaves the head, in the head's axes.
 */
export function socketGeometries(head: BoxSpec, variant: RobotLook['variant'], at: ReadonlyArray<readonly [f: number, s: number]>): BufferGeometry[] {
  if (variant === 2) return [roundedBoxGeometry({ f: 8.7, u: 1, s: 3, r: 1 }, 2).translate(-1, head.u, 0)];
  return at.map(([f, s]) => smooth(new CylinderGeometry(SOCKET.top, SOCKET.bottom, SOCKET.height, 20)).translate(f, head.u, s));
}
