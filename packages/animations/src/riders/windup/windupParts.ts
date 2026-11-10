import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, LatheGeometry, SphereGeometry, TorusGeometry, Vector2, type BufferAttribute } from 'three';
import { blobGeometry, solidHullGeometry } from '../../three/geometry';

/**
 * The wind-up robot's parts, each in the local axes its rig frame gives it
 * (x forward, y up, z to the side). A tin toy is pressed and turned, not
 * moulded: nearly every part here is a profile spun on a lathe, with a
 * rolled bead wherever two pressings would be crimped together.
 */

/** A lathe profile, bottom to top: (radius, height) pairs. */
type Profile = ReadonlyArray<readonly [radius: number, height: number]>;

/**
 * A part turned on a lathe: `profile` swept round the up axis (bottom to
 * top, so it faces out), then squashed to `depth` of its width front to
 * back, for a drum that is wider than it is deep.
 */
export function turnedGeometry(profile: Profile, depth = 1, radial = 44): BufferGeometry {
  const geometry = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), radial);
  geometry.deleteAttribute('uv');
  if (depth !== 1) {
    const pos = geometry.getAttribute('position') as BufferAttribute;
    const nor = geometry.getAttribute('normal') as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) * depth);
      // A squashed surface's normals stretch the other way.
      const n = [nor.getX(i) / depth, nor.getY(i), nor.getZ(i)];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      nor.setXYZ(i, n[0] / l, n[1] / l, n[2] / l);
    }
  }
  return geometry;
}

// ---------- The body ----------

/** Where the drum's hoops end and its red middle begins (torso-local heights); the chest paint keeps between them. */
export const DRUM_BELT_TOP = -5.3;
export const DRUM_COLLAR = 18.1;

/**
 * The chest: a drum bulging through the middle, a rolled rim round its
 * foot, another under a domed lid the neck comes out of. In the torso
 * frame's own coordinates: the hip joints sit 14 below its origin and the
 * shoulders 18 above, so the drum stops well short of the hips, leaving the
 * waist to the pelvis under it.
 */
export const drumGeometry = () => turnedGeometry([
  [0, -9], [10.8, -9], [12.5, -8.4], [13.2, -7.2], [12.9, -6],
  [13.4, -4], [14.3, 0], [14.8, 4], [14.9, 8], [14.6, 13], [13.9, 17.5],
  [14.2, 18.6], [14.6, 19.8], [14.2, 21],
  [13.2, 22.2], [11, 24], [7.5, 25.4], [3.5, 26], [0, 26.1],
], 0.8);

/** The hips: a ball joint the drum sits on and the thighs come out of, turning under the chest with the legs. */
export const pelvisGeometry = () => blobGeometry([9, 7.4, 11.6], { side: 1, plan: 1 }, undefined, 18, 32);

// ---------- The head ----------

/** The head's half extents: nearly a ball, a little wider than it is tall. */
export const HEAD = { f: 16, u: 15.5, s: 17 } as const;

export const headGeometry = () => blobGeometry([HEAD.f, HEAD.u, HEAD.s], { side: 1, plan: 1 });

/** The lens's radius, and how far forward of the head's middle its glass sits. */
export const LENS = { r: 7.6, at: HEAD.f + 2.1 } as const;

/**
 * The eye: a barrel standing out of the front of the head, its glass set a
 * little way back inside a rolled lip. Turned about the head's forward
 * axis; the material paints the glass and what's lit behind it.
 */
export const eyeGeometry = () => turnedGeometry([
  [LENS.r + 1.7, HEAD.f - 6], [LENS.r + 1.7, LENS.at - 0.2], [LENS.r + 1.4, LENS.at + 0.6], [LENS.r + 0.7, LENS.at + 0.9],
  [LENS.r + 0.1, LENS.at + 0.5], [LENS.r, LENS.at], [0, LENS.at],
]).rotateZ(-Math.PI / 2);

/** An ear: a bolt head on the side of the head, its nub standing out of a flat cap. `side` is +1 or -1 along z. */
export const earGeometry = (side: 1 | -1) => turnedGeometry([
  [0, -3], [4.5, -3], [4.5, 1.1], [4.1, 1.9], [2.5, 2.2], [2.1, 2.9], [0, 3],
], 1, 24).rotateX((side * Math.PI) / 2).translate(0, 0, side * (HEAD.s - 0.9));

/** The socket on top of the head the key turns in. */
export const keySocketGeometry = () => turnedGeometry([
  [0, HEAD.u - 1.5], [3.8, HEAD.u - 1.5], [3.8, HEAD.u + 0.6], [3, HEAD.u + 1.4], [0, HEAD.u + 1.4],
], 1, 20);

/**
 * The wind-up key, standing in its socket: a stem and two pressed wings, in
 * the head's axes with the wings out to either side. Three pieces, to be
 * turned together about the stem.
 */
export function keyGeometries(): BufferGeometry[] {
  const stem = new CylinderGeometry(1.7, 1.7, 6.6, 12).translate(0, HEAD.u + 3.7, 0);
  stem.deleteAttribute('uv');
  const wing = (side: 1 | -1) => solidHullGeometry(
    ([[5.3, 1.4], [13.1, 3.6], [13.7, 8.3], [10.2, 11.4], [6.4, 10.4]] as const).map(([y, z]) => [0, HEAD.u + y, side * z] as const),
    1.2,
  );
  return [stem, wing(1), wing(-1)];
}

// ---------- Limbs ----------

/**
 * An accordion sleeve one unit long along x, to be stretched between two
 * joints (placement.ts's placeBetween): `pleats` folds, tapering from
 * radius `ra` to `rb`, each fold `depth` from crest to valley, a crest at
 * either end. Its normals are a plain tube's, so the cel light falls down
 * its length in one piece and only the paint tells the folds apart.
 */
export function bellowsGeometry(pleats: number, ra: number, rb: number, depth: number, radial = 16): BufferGeometry {
  const stations = pleats * 8;
  const position: number[] = [];
  const normal: number[] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const r = ra + (rb - ra) * t - (depth / 2) * Math.cos(2 * Math.PI * pleats * t);
    for (let j = 0; j < radial; j++) {
      const a = (2 * Math.PI * j) / radial;
      position.push(t, r * Math.cos(a), r * Math.sin(a));
      normal.push(0, Math.cos(a), Math.sin(a));
    }
  }
  const index: number[] = [];
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      index.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  return geometry;
}

/** A joint's ball. */
export const ballGeometry = (r: number) => new SphereGeometry(r, 22, 16);

/** The pincer's ring: how far ahead of the wrist its middle sits, its radius, its thickness, and the gap between its tips (rad). */
const PINCER = { at: 1.6, r: 4, tube: 1.7, gap: (100 * Math.PI) / 180 } as const;

/**
 * A hand: a cuff the sleeve ends in and a pincer closing on nothing, in
 * axes where x runs on down the forearm and the pincer lies flat in x and
 * y. Four pieces of one silhouette.
 */
export function pincerGeometries(): BufferGeometry[] {
  const cuff = turnedGeometry([[0, -4.8], [4.3, -4.8], [4.9, -4.2], [4.9, -2.1], [4.3, -1.5], [0, -1.5]], 1, 20).rotateZ(-Math.PI / 2);
  const ring = new TorusGeometry(PINCER.r, PINCER.tube, 12, 28, 2 * Math.PI - PINCER.gap).rotateZ(PINCER.gap / 2).translate(PINCER.at, 0, 0);
  ring.deleteAttribute('uv');
  const tip = (side: 1 | -1) => {
    const a = (side * PINCER.gap) / 2;
    const ball = new SphereGeometry(PINCER.tube, 14, 10).translate(PINCER.at + PINCER.r * Math.cos(a), PINCER.r * Math.sin(a), 0);
    ball.deleteAttribute('uv');
    return ball;
  };
  return [cuff, ring, tip(1), tip(-1)];
}
