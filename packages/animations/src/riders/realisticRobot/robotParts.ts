import { CylinderGeometry, LatheGeometry, SphereGeometry, Vector2, type BufferGeometry } from 'three';
import { ARM_RADII, HAND_RADIUS, LEG_RADII } from '../../motion/skeleton';
import { roundedBoxGeometry, type BoxSpec } from '../../three/geometry';
import type { RobotLook } from '../look';

/**
 * The robot's moulded fittings: the cartoon robot's shapes (robot/robotParts.ts),
 * turned finely enough for a close camera. Each is in the
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

/** A joint's ball: plain, so it looks the same however the joint turns. */
export const ballGeometry = (r: number) => smooth(new SphereGeometry(r, 64, 32));

/**
 * A limb between two joints: one plain tapered sleeve, its open ends inside the balls at its
 * joints. x runs from 0 to 1 for placeBetween, so both ends stay seated even through blends
 * where the distance between rig joints changes.
 */
export function limbGeometry(ra: number, rb: number, length: number) {
  const profile = [0, 0.5, 1].map((t) => new Vector2(ra + (rb - ra) * t, t * length));
  return smooth(new LatheGeometry(profile, 64)).rotateZ(-Math.PI / 2).scale(1 / length, 1, 1);
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

/** An ear cap: a shallow domed button on the side of the head. */
export const earGeometry = (head: BoxSpec, side: 1 | -1) => smooth(new SphereGeometry(1, 32, 16))
  .scale(EAR.r, EAR.r, EAR.depth)
  .translate(-EAR.back, 0, side * (head.s + EAR.proud - EAR.depth));

/** An antenna's socket: its radii, top and bottom, and its height over the head's top. */
const SOCKET = { top: 2.8, bottom: 3.2, height: 1.8 } as const;

/**
 * Where the antenna (or the crest) is let into the top of the head: a
 * collar round each stalk's foot, a plinth under the crest. `at` is where
 * each stalk leaves the head, in the head's axes.
 */
export function socketGeometries(head: BoxSpec, variant: RobotLook['variant'], at: ReadonlyArray<readonly [f: number, s: number]>): BufferGeometry[] {
  if (variant === 2) return [roundedBoxGeometry({ f: 8.7, u: 1, s: 3, r: 1 }, 2).translate(-1, head.u, 0)];
  return at.map(([f, s]) => smooth(new CylinderGeometry(SOCKET.top, SOCKET.bottom, SOCKET.height, 28)).translate(f, head.u, s));
}
