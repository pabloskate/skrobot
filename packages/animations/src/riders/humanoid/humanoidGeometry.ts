import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH } from '../../motion/skeleton';
import { smoothstep } from '../../math';
import { blobGeometry, loftGeometry, roundedBoxGeometry } from '../../three/geometry';
import { HUMAN_FOREARM, HUMAN_SCALE, HUMAN_SHIN, HUMAN_THIGH, HUMAN_UPPER_ARM, profile } from '../human/humanGeometry';
import { HUMANOID_SURFACE as S } from './humanoidMaterials';
import type { Vec3 } from '../../camera/view';

/** Rigid assemblies are merged at authoring time, including their fasteners. */
class Assembly {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly surfaces: number[] = [];

  add(geometry: BufferGeometry, surface: number): this {
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    for (let i = 0; i < (index?.count ?? p.count); i++) {
      const at = index ? index.getX(i) : i;
      this.positions.push(p.getX(at), p.getY(at), p.getZ(at));
      this.normals.push(n.getX(at), n.getY(at), n.getZ(at));
      this.surfaces.push(surface);
    }
    geometry.dispose();
    return this;
  }
  sphere(at: Vec3, radii: Vec3, surface: number, segments = 20): this {
    return this.add(new SphereGeometry(1, segments, Math.max(4, segments / 2)).scale(...radii).translate(...at), surface);
  }
  box(at: Vec3, half: Vec3, radius: number, surface: number): this {
    return this.add(roundedBoxGeometry({ f: half[0], u: half[1], s: half[2], r: radius }, 1).translate(...at), surface);
  }
  cylinder(a: Vec3, b: Vec3, ra: number, rb: number, surface: number, segments = 20): this {
    const axis = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = new CylinderGeometry(rb, ra, axis.length(), segments, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis.normalize()));
    return this.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), surface);
  }
  tube(points: Vec3[], radius: number, surface: number, segments = 16): this {
    return this.add(new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), segments, radius, 5, false), surface);
  }
  ring(at: Vec3, radius: number, tube: number, surface: number, axis: 'x' | 'y' | 'z' = 'z'): this {
    const g = new TorusGeometry(radius, tube, 4, 20);
    if (axis === 'x') g.rotateY(Math.PI / 2);
    if (axis === 'y') g.rotateX(Math.PI / 2);
    return this.add(g.translate(...at), surface);
  }
  finish(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('aSurface', new Float32BufferAttribute(this.surfaces, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const armor = (from: number, length: number, r: ReadonlyArray<readonly [number, number, number]>, axis: 'x' | 'y' = 'x', square = 0.82) => {
  const a = profile(r.map(([t, ra]) => [t, ra]));
  const b = profile(r.map(([t, , rb]) => [t, rb]));
  const small = a(0.5) < 2.5 || b(0.5) < 2;
  return loftGeometry({
    length, radius: (t) => [a(t), b(t)], square: () => square, caps: [0.17, 0.23],
    stations: small ? 5 : 9, radial: small ? 12 : 24, capRings: small ? 2 : 3,
    warp: (along, y, z) => axis === 'x' ? [from + along, y, z] : [y, from + along, z],
  });
};
const bolt = (a: Assembly, at: Vec3, normal: 'x' | 'z' = 'z', radius = 0.62) => {
  const offset: Vec3 = normal === 'x' ? [0.35, 0, 0] : [0, 0, Math.sign(at[2]) * 0.35];
  const b: Vec3 = [at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]];
  a.cylinder(at, b, radius, radius, S.titanium, 8);
  a.sphere(b, normal === 'x' ? [0.08, radius * 0.32, radius * 0.32] : [radius * 0.32, radius * 0.32, 0.08], S.polymer, 8);
};

export function humanoidTorsoGeometry(): BufferGeometry {
  const a = new Assembly();
  // Side inserts, rear service panel and their vents are finished directly
  // on this shell by the material. Independent panels at fixed x/z offsets
  // intersected its changing cross-section and left ragged exposed slats.
  a.add(armor(-9, 34, [[0, 7.6, 10.7], [0.16, 9.3, 13.2], [0.63, 11.1, 16.4], [0.92, 9.5, 17.3], [1, 7.9, 15]], 'y'), S.torso);
  for (const sign of [-1, 1]) {
    a.tube([[8.7, 17.9, sign * 9.5], [9.8, 14, sign * 10.2], [9.6, 4, sign * 8.2], [7.6, -6.2, sign * 5.7]], 0.13, S.graphite);
    for (const y of [-2, 18]) bolt(a, [8, y, sign * 10.7], 'x', 0.54);
  }
  // Fine chest seam and small recessed status indicator; no branding.
  a.tube([[8.9, 18.5, -10], [10, 17.3, -5], [10.4, 17, 0], [10, 17.3, 5], [8.9, 18.5, 10]], 0.15, S.polymer);
  a.box([11.12, 10.7, 0], [0.17, 0.45, 2.1], 0.15, S.polymer);
  a.box([11.3, 10.7, 0], [0.04, 0.14, 1.35], 0.035, S.light);
  return a.finish();
}

/** A closed, continuous black optical shell. */
function headShell(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  // Keep the former visor boundary in the grid so the head retains its
  // proportions. The entire closed shell now has the same black finish.
  const latitudes = [-Math.PI / 2, -1.45, -1.35,
    ...Array.from({ length: 25 }, (_, i) => -1.25 + i / 24 * 2.5),
    1.35, 1.45, Math.PI / 2];
  const longitudes = [
    ...Array.from({ length: 10 }, (_, i) => -Math.PI + i / 10 * (Math.PI - 1.47)),
    ...Array.from({ length: 37 }, (_, i) => -1.47 + i / 36 * 2.94),
    ...Array.from({ length: 10 }, (_, i) => 1.47 + (i + 1) / 10 * (Math.PI - 1.47)),
  ];
  const rows = latitudes.length - 1;
  const cols = longitudes.length - 1;
  for (const lat of latitudes) {
    for (const theta of longitudes) {
      const taper = 0.91 + 0.09 * (Math.sin(lat) * 0.5 + 0.5);
      positions.push(-1.35 + 11.15 * Math.cos(lat) * Math.cos(theta), -9 + 12.6 * Math.sin(lat), 9.2 * taper * Math.cos(lat) * Math.sin(theta));
      // Analytic normals keep the longitude wrap and poles smooth too.
      const normal = new Vector3(
        Math.cos(lat) * Math.cos(theta) / 11.15,
        (Math.sin(lat) - 0.045 * Math.cos(lat) ** 2 * Math.sin(theta) ** 2 / taper) / 12.6,
        Math.cos(lat) * Math.sin(theta) / (9.2 * taper),
      ).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const p = row * (cols + 1) + col;
    // One triangle per pole cell avoids collapsed faces at the closed tips.
    if (row > 0) {
      indices.push(p, p + cols + 1, p + 1);
    }
    if (row < rows - 1) {
      indices.push(p + 1, p + cols + 1, p + cols + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  const shell = g.toNonIndexed();
  g.dispose();
  return shell;
}

export function humanoidHeadGeometry(): BufferGeometry {
  const a = new Assembly();
  a.add(headShell(), S.glass);
  const visorPoint = (theta: number, lat: number, out = 0.25): Vec3 => [
    -1.35 + (11.15 + out) * Math.cos(lat) * Math.cos(theta),
    -9 + (12.6 + out) * Math.sin(lat),
    (9.2 + out) * (0.91 + 0.09 * (Math.sin(lat) * 0.5 + 0.5)) * Math.cos(lat) * Math.sin(theta),
  ];
  // A readable illuminated brow arc on the uninterrupted black shell.
  a.tube(Array.from({ length: 19 }, (_, i) => {
    const theta = -1.02 + i / 18 * 2.04;
    return visorPoint(theta, 0.28 - 0.045 * Math.cos(theta * 2));
  }), 0.5, S.light, 36);
  a.sphere([9.7, -10.8, 0], [0.2, 0.55, 0.55], S.graphite, 12);
  a.sphere([9.87, -10.8, 0], [0.06, 0.28, 0.28], S.glass, 12);
  return a.finish();
}

/** Servo spine along x, length ten, scaled only along its axis at runtime. */
export function humanoidSpineGeometry(): BufferGeometry {
  const a = new Assembly();
  const r = 4.8;
  a.cylinder([0, 0, 0], [10, 0, 0], r, r * 0.9, S.polymer);
  for (let x = 0.8; x < 10; x += 1.35) a.ring([x, 0, 0], r, 0.28, S.graphite, 'x');
  for (const z of [-1, 1]) {
    a.cylinder([0, -1.1, z * r * 0.8], [5.8, -1.1, z * r * 0.8], 0.75, 0.75, S.graphite);
    a.cylinder([5.6, -1.1, z * r * 0.8], [10, -1.1, z * r * 0.8], 0.46, 0.46, S.titanium);
  }
  for (const x of [0, 10]) a.cylinder([x - 0.2, 0, 0], [x + 0.2, 0, 0], r + 0.7, r + 0.7, S.titanium);
  return a.finish();
}

export function humanoidPelvisGeometry(): BufferGeometry {
  const a = new Assembly();
  a.add(armor(-4.1, 9, [[0, 5.6, 8.1], [0.6, 6.2, 11.6], [1, 5.6, 10.6]], 'y'), S.graphite);
  a.add(armor(-4.9, 7.1, [[0, 1.7, 4.5], [0.6, 2.1, 7], [1, 1.8, 7.9]], 'y').translate(5.7, 0, 0), S.pearl);
  a.ring([0, 5.1, 0], 5.1, 0.65, S.titanium, 'y');
  for (const side of [-1, 1]) {
    a.sphere([0, -0.2, side * 7.2], [5.4, 5.4, 5.4], S.polymer);
    a.cylinder([0, 0.4, side * 9.4], [0, 0.4, side * 11.2], 3.8, 3.7, S.titanium);
    a.cylinder([0, 0.4, side * 11.25], [0, 0.4, side * 11.4], 2.8, 2.8, S.graphite);
    for (const x of [-2.2, 2.2]) bolt(a, [x, 1.8, side * 11.45], 'z', 0.45);
  }
  return a.finish();
}

export type HumanoidLimb = 'upper' | 'fore' | 'thigh' | 'shin';
export const HUMANOID_LENGTH = { upper: HUMAN_UPPER_ARM * HUMAN_SCALE, fore: HUMAN_FOREARM * HUMAN_SCALE, thigh: HUMAN_THIGH, shin: HUMAN_SHIN } as const;

export function humanoidLimbGeometry(kind: HumanoidLimb): BufferGeometry {
  const a = new Assembly();
  const length = HUMANOID_LENGTH[kind];
  const leg = kind === 'thigh' || kind === 'shin';
  const distal = kind === 'fore' || kind === 'shin';
  const joint = leg ? (distal ? 5.3 : 6.6) : (distal ? 4.3 : 5.8);
  const top = leg ? (distal ? 5.6 : 7.1) : (distal ? 4.8 : 5.3);
  const tip = leg ? (distal ? 3.1 : 5) : (distal ? 3.0 : 3.9);
  a.sphere([0, 0, 0], [joint, joint, joint * 0.9], S.polymer, 24);
  a.cylinder([0, 0, -joint * 0.95], [0, 0, joint * 0.95], joint * 0.69, joint * 0.69, S.titanium, 24);
  for (const side of [-1, 1]) {
    a.cylinder([0, 0, side * joint * 0.97], [0, 0, side * joint * 1.02], joint * 0.48, joint * 0.48, S.graphite);
    a.ring([0, 0, side * joint * 1.03], joint * 0.36, 0.17, S.titanium);
    bolt(a, [0, 0, side * joint * 1.05], 'z', 0.75);
  }
  const from = leg ? 7.4 : 5.7;
  const end = length - (leg ? 7 : 4.1);
  a.cylinder([from - 2, 0, 0], [length - 1, 0, 0], top * 0.59, tip * 0.77, S.polymer);
  // Sculpted bulge, flatter outer faces, and a narrowing cuff make this an
  // armor panel rather than the toy robot's constant-width capsules.
  a.add(armor(from, end - from, [[0, top * 0.9, top * 0.87], [0.2, top, top], [0.52, top * 0.92, top * 0.93], [0.82, tip * 1.08, tip * 1.03], [1, tip, tip * 0.92]], 'x', 0.83).translate(0, 0.55, 0), S.pearl);
  if (!distal && !leg) a.sphere([3.6, 0.9, 0], [5.5, 6.3, 6.8], S.pearl, 24);
  // The inset rear actuator channel has a telescopic bright piston inside.
  a.add(armor(from + 2, Math.max(3, end - from - 4), [[0, 1.25, top * 0.52], [0.5, 1.3, top * 0.5], [1, 1.0, tip * 0.49]], 'x').translate(0, -top * 0.82, 0), S.graphite);
  for (const side of [-1, 1]) {
    const z = side * top * 0.38;
    a.cylinder([from + 1, -top * 0.91, z], [from + (end - from) * 0.55, -top * 0.88, z], 0.73, 0.73, S.graphite, 12);
    a.cylinder([from + (end - from) * 0.52, -top * 0.88, z], [length - 3, -tip * 0.64, z], 0.4, 0.4, S.titanium, 12);
    a.tube([[from + 2, top * 0.72, side * top * 0.62], [from + (end - from) * 0.35, top * 0.7, side * top * 0.72], [end - 1, tip * 0.77, side * tip * 0.57]], 0.115, S.graphite);
    bolt(a, [from + 3, 1, side * top * 0.97], 'z', 0.52);
    bolt(a, [end - 2, 0.7, side * tip], 'z', 0.44);
  }
  if (distal) {
    for (const x of [length - 3, length - 1.5]) a.ring([x, 0, 0], tip * 0.87, 0.34, S.titanium, 'x');
  }
  return a.finish();
}

export function humanoidPalmGeometry(): BufferGeometry {
  const a = new Assembly();
  a.add(armor(0.8, 5.4, [[0, 1.45, 2.1], [0.4, 1.65, 3.5], [0.9, 1.4, 3.65], [1, 1.2, 3.6]], 'x', 0.72), S.polymer);
  a.add(armor(1.4, 3.7, [[0, 0.46, 2.0], [0.5, 0.6, 3.1], [1, 0.43, 3.2]], 'x').translate(0, 1.37, 0), S.pearl);
  a.cylinder([-0.8, 0, 0], [0.8, 0, 0], 2.1, 2.1, S.titanium);
  for (const z of [-2.6, -0.87, 0.87, 2.6]) {
    a.tube([[0.3, 1.55, z * 0.5], [2.7, 2.0, z * 0.75], [5.8, 1.25, z]], 0.21, S.titanium, 10);
    a.sphere([6, 0, z], [1, 0.98, 0.68], S.graphite, 12);
  }
  bolt(a, [3.2, 1.2, -3.25], 'z', 0.42);
  bolt(a, [3.2, 1.2, 3.25], 'z', 0.42);
  return a.finish();
}

/** One unit-long phalanx and its hinge, instanced thirty times across two hands. */
export function humanoidFingerGeometry(): BufferGeometry {
  const a = new Assembly();
  a.cylinder([0, 0, -0.52], [0, 0, 0.52], 0.48, 0.48, S.graphite, 8);
  a.cylinder([0.1, 0, 0], [0.76, 0, 0], 0.49, 0.39, S.titanium, 8);
  a.sphere([0.49, 0.4, 0], [0.3, 0.18, 0.38], S.pearl, 8);
  a.sphere([0.82, -0.03, 0], [0.19, 0.4, 0.38], S.polymer, 8);
  return a.finish();
}

export function humanoidFootGeometry(): BufferGeometry {
  const a = new Assembly();
  // A slim robotic skate foot, wholly inside the existing shoe footprint.
  // Its sole uses the same grounded plane so footContact remains authoritative.
  const ground = -SHOE_HALF_HEIGHT + 0.3;
  const width = (x: number) => 0.86 + 0.14 * smoothstep((x + 8) / 12);
  const spring = (x: number) => 1.3 * Math.max(0, (x - 5) / (SHOE_HALF_LENGTH - 5)) ** 2;
  a.add(blobGeometry([SHOE_HALF_LENGTH, 1.25, SHOE_HALF_WIDTH * 1.1], { side: 0.5, plan: 0.55 },
    (x, y, z) => [x, ground + 1.25 + y + spring(x), z * width(x)], 14, 32), S.polymer);
  a.add(blobGeometry([SHOE_HALF_LENGTH - 0.9, 1, SHOE_HALF_WIDTH * 0.99], { side: 0.58, plan: 0.75 },
    (x, y, z) => {
      const top = 4.6 + 4.1 * (1 - smoothstep((x + 2.5) / 9.5));
      return [x, ground + 1.7 + (top - ground - 1.7) * (y + 1) / 2 + spring(x), z * width(x)];
    }, 14, 32), S.graphite);
  for (const side of [-1, 1]) {
    a.tube([[-9.4, 2.5, side * 4.3], [-5, 3.2, side * 5.75], [1, 2.5, side * 6.0], [6, 0.2, side * 5.6]], 0.32, S.titanium);
    for (const x of [-5.5, -1.2]) bolt(a, [x, 2.1, side * 6.05], 'z', 0.43);
  }
  a.add(armor(-5.5, 6, [[0, 0.46, 3.8], [0.5, 0.67, 4.2], [1, 0.42, 4.2]], 'x').translate(0, 8, 0), S.polymer);
  for (let x = 1.5; x < 7; x += 1.8) a.tube([[x, 5.8, -3.1], [x + 0.25, 6.1, 0], [x, 5.8, 3.1]], 0.14, S.polymer, 10);
  return a.finish();
}
