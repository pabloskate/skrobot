import type { DropTerrain } from '../elToro/stairs';
import { SET_FOOT as F } from '../setScale';
import type { SpotFilmers } from '../tripods';
/** Original Carlsbad High grass gap, not the replacement campus stairs.
 * Eleven risers and an uphill landing are documented; dimensions below
 * are photographic estimates, not a surveyed plan. docs/CARLSBAD_REFERENCE.md. */
export const CARLSBAD_FOOT = F;
export const CARLSBAD_STEPS = 11;
export const CARLSBAD_DROP = 6 * F;
export const CARLSBAD_STAIR_RUN = 11 * F;
export const CARLSBAD_RUN = 13 * F;
export const CARLSBAD_RISER = CARLSBAD_DROP / CARLSBAD_STEPS;
export const CARLSBAD_TREAD = CARLSBAD_STAIR_RUN / (CARLSBAD_STEPS - 1);
/** Looking uphill, positive z is image-left: the stairs are left of the grass. */
export const CARLSBAD_STAIR_Z0 = 5 * F;
export const CARLSBAD_STAIR_Z1 = 16 * F;
export const CARLSBAD_BANK_Z0 = -96 * F;
export const CARLSBAD_LANE_Z = 0;
export const CARLSBAD_UPHILL_GRADE = 0.065;
export const CARLSBAD_UPHILL_END = CARLSBAD_STAIR_RUN + 34 * F;
export const CARLSBAD_UPHILL_EASE = 10 * F;
/**
 * The classroom wing beside the grass stands this far off the stairs' line
 * (degrees from +x toward +z, measured off the 2005-2010 aerials): riders
 * pushed down its covered walk and carved out onto the pad for the lip.
 */
export const CARLSBAD_WING_YAW = -28.5;
const yaw = CARLSBAD_WING_YAW * Math.PI / 180;
export const carlsbadWingPoint = (u: number, v: number): PlanPoint =>
  [(u * Math.cos(yaw) - v * Math.sin(yaw)) * F, (u * Math.sin(yaw) + v * Math.cos(yaw)) * F];
export const CARLSBAD_ROOF_Y = 9 * F;
export const CARLSBAD_CHEEK = 0.67 * F;
export type PlanPoint = readonly [number, number];
const feet = (points: number[][]): PlanPoint[] => points.map(([x, z]) => [x * F, z * F]);
export const CARLSBAD_TOE = feet([
  [12.2, 4.33],
  [13, -5],
]);
export const CARLSBAD_CURB = feet([
  [13, -5],
  [18, -5.3],
  [23, -6.5],
  [27, -8.5],
  [32, -12], [37, -17.5], [42, -25], [45, -33], [44, -41.5],
  [40, -49.5], [33, -56.5], [26.5, -63], [16.5, -67], [13, -71],
  [12.5, -79], [12.5, -110],
]);
export const CARLSBAD_PATH_OUTER = CARLSBAD_CURB.map(([x, z], i): PlanPoint => {
  const a = CARLSBAD_CURB[Math.max(0, i - 1)], b = CARLSBAD_CURB[Math.min(CARLSBAD_CURB.length - 1, i + 1)];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const width = (i < 4 ? 12 : 9) * F;
  return [x - (b[1] - a[1]) / length * width, z + (b[0] - a[0]) / length * width];
});
/** Monotone cubic interpolation preserves the plan control points without overshoot. */
export function carlsbadOutline(points: readonly PlanPoint[], z: number): number {
  if (z >= points[0][1]) {
    return points[0][0];
  }
  for (let i = 1; i < points.length; i++) {
    if (z >= points[i][1]) {
      const [a, az] = points[i - 1],
        [b, bz] = points[i],
        t = (az - z) / (az - bz);
      const slope = (j: number) => {
        if (j === 0 || j === points.length - 1) {
          return 0;
        }
        const l = (points[j][0] - points[j - 1][0]) / (points[j][1] - points[j - 1][1]);
        const r = (points[j + 1][0] - points[j][0]) / (points[j + 1][1] - points[j][1]);
        return l * r <= 0 ? 0 : (2 * l * r) / (l + r);
      };
      return (
        (2 * t * t * t - 3 * t * t + 1) * a +
        (t * t * t - 2 * t * t + t) * (bz - az) * slope(i - 1) +
        (-2 * t * t * t + 3 * t * t) * b +
        (t * t * t - t * t) * (bz - az) * slope(i)
      );
    }
  }
  return points[points.length - 1][0];
}
const crestEnd = feet([[34.8,-26.6],[35,-29],[18,-60], [9,-66],[-5,-75],[-5,-110]]);
export const carlsbadUpperEdge = (z: number) => {
  if (z >= -7.2 * F) return 0;
  if (z >= -26.6 * F) return Math.max(0, (-7.66 * F - z) / 0.5430);
  return carlsbadOutline(crestEnd, z);
};

/** Body and roof polygons in set units, shared with the dressing pass. */
const rect = (x0: number, x1: number, z0: number, z1: number) => feet([[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);
const wingRect = (u0: number, u1: number, v0: number, v1: number) =>
  [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v]) => carlsbadWingPoint(u,v));
const across = [[0,0],[-130,0],[-130,110],[0,110]].map(([u,v]): PlanPoint => {
  const [x,z] = carlsbadWingPoint(u,v); return [x-32*F,z+53*F];
});
export const CARLSBAD_FOOTPRINTS = [
  {name: 'wing', footprint: wingRect(-140,40.1,-40.7,-16.7), roof: wingRect(-143,43.1,-43.7,-7.7)},
  {name: 'portable', footprint: rect(31,71,18,108), roof: rect(30,72,17,109)},
  {name: 'second-portable', footprint: rect(23,66,-170,-74), roof: rect(22,67,-171,-73)},
  {name: 'across-pad', footprint: across, roof: across},
];
export function carlsbadPolygonDistance(x: number, z: number, polygon: readonly PlanPoint[]): number {
  let inside = false, distance = Infinity;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j], b=polygon[i], dx=b[0]-a[0], dz=b[1]-a[1];
    if ((a[1]>z)!==(b[1]>z) && x < a[0]+(z-a[1])*dx/dz) inside=!inside;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
  }
  return inside ? 0 : distance;
}
export const carlsbadBuilt = (x: number,z: number,margin=0) =>
  CARLSBAD_FOOTPRINTS.some(({roof})=>carlsbadPolygonDistance(x,z,roof)<=margin);
export const carlsbadCheekTop = (x: number) =>
  (5 / 12) * F - (Math.max(0, Math.min(CARLSBAD_STAIR_RUN, x)) * CARLSBAD_RISER) / CARLSBAD_TREAD;
/** The broad runout rises against travel, then eases into the campus path. */
export function carlsbadLanding(x: number): number {
  const u = Math.max(0, x - CARLSBAD_STAIR_RUN);
  const straight = CARLSBAD_UPHILL_END - CARLSBAD_STAIR_RUN;
  const ease = Math.max(0, Math.min(CARLSBAD_UPHILL_EASE, u - straight));
  return (
    -CARLSBAD_DROP + CARLSBAD_UPHILL_GRADE * (Math.min(u, straight) + ease - (ease * ease) / (2 * CARLSBAD_UPHILL_EASE))
  );
}
export function carlsbadLandingSlope(x: number): number {
  if (x < CARLSBAD_STAIR_RUN) {
    return 0;
  }
  return CARLSBAD_UPHILL_GRADE * (1 - Math.max(0, Math.min(1, (x - CARLSBAD_UPHILL_END) / CARLSBAD_UPHILL_EASE)));
}
/** Precomputed chord-parameter Hermite curb, in set units. */
const curbPoints: PlanPoint[] = [];
for (let i = 0; i < CARLSBAD_CURB.length - 1; i++) {
  const a = CARLSBAD_CURB[i],
    b = CARLSBAD_CURB[i + 1];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tangent = (j: number): PlanPoint => {
    const l = CARLSBAD_CURB[Math.max(0, j - 1)],
      r = CARLSBAD_CURB[Math.min(CARLSBAD_CURB.length - 1, j + 1)];
    const n = Math.hypot(r[0] - l[0], r[1] - l[1]);
    return [(r[0] - l[0]) / n, (r[1] - l[1]) / n];
  };
  const ta = tangent(i),
    tb = tangent(i + 1),
    count = Math.ceil(length / (0.2 * F));
  for (let k = 0; k < count; k++) {
    const t = k / count;
    curbPoints.push(
      [0, 1].map(
        (j) =>
          (2 * t ** 3 - 3 * t * t + 1) * a[j] +
          (t ** 3 - 2 * t * t + t) * length * ta[j] +
          (-2 * t ** 3 + 3 * t * t) * b[j] +
          (t ** 3 - t * t) * length * tb[j],
      ) as unknown as PlanPoint,
    );
  }
}
curbPoints.push(CARLSBAD_CURB[CARLSBAD_CURB.length - 1]);
const curbLengths = [0];
for (let i = 1; i < curbPoints.length; i++)
  curbLengths.push(
    curbLengths[i - 1] + Math.hypot(curbPoints[i][0] - curbPoints[i - 1][0], curbPoints[i][1] - curbPoints[i - 1][1]),
  );
export const CARLSBAD_CURB_LENGTH = curbLengths[curbLengths.length - 1];
export const CARLSBAD_WALL_LINE = CARLSBAD_TOE;
export const CARLSBAD_CAP_WIDTH = (2 / 3) * F;
export function carlsbadCurbSample(s: number) {
  s = Math.max(0, Math.min(CARLSBAD_CURB_LENGTH, s));
  let lo = 0,
    hi = curbLengths.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (curbLengths[m] <= s) lo = m;
    else hi = m;
  }
  const a = curbPoints[lo],
    b = curbPoints[hi],
    length = curbLengths[hi] - curbLengths[lo],
    t = (s - curbLengths[lo]) / length;
  const tangent: PlanPoint = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as PlanPoint,
    tangent,
    inward: [tangent[1], -tangent[0]] as PlanPoint,
    s,
  };
}
// Small bounding blocks avoid projecting onto the entire curb per wheel/shadow query.
const curbBlocks = Array.from({ length: Math.ceil((curbPoints.length - 1) / 16) }, (_, block) => {
  const start = block * 16 + 1,
    end = Math.min(curbPoints.length, start + 16);
  const points = curbPoints.slice(start - 1, end);
  return {
    start,
    end,
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])),
    maxZ: Math.max(...points.map((p) => p[1])),
  };
});
export function carlsbadCurbNearest(x: number, z: number) {
  let best = Infinity,
    s = 0,
    d = 0;
  for (const block of curbBlocks) {
    const bx = Math.max(block.minX - x, 0, x - block.maxX),
      bz = Math.max(block.minZ - z, 0, z - block.maxZ);
    if (bx * bx + bz * bz > best) continue;
    for (let i = block.start; i < block.end; i++) {
      const a = curbPoints[i - 1],
        b = curbPoints[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = curbLengths[i] - curbLengths[i - 1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length)));
      const rx = x - a[0] - t * dx,
        rz = z - a[1] - t * dz,
        dist = rx * rx + rz * rz;
      if (dist < best) {
        best = dist;
        s = curbLengths[i - 1] + t * length;
        d = (rx * dz - rz * dx) / length;
      }
    }
  }
  return { ...carlsbadCurbSample(s), d };
}
const farS = curbLengths[curbPoints.findIndex((p) => p[1] <= -19 * F)];
export function carlsbadCurbTop(s: number) {
  const t = Math.max(0, Math.min(1, s / farS));
  return carlsbadLanding(carlsbadCurbSample(s).point[0]) + (1.9 - 0.8 * t * t * (3 - 2 * t)) * F;
}
/** Row intersections are mesh constraints only; heights use curb coordinates. */
export function carlsbadCurbOffset(z: number, d: number): number {
  // Miter at the external wall corner. The wall's eight-inch cap stays row-wise.
  const wall = (13 + (12.2 - 13) * Math.min(1, (z / F + 5) / 9.33)) * F - d;
  let lo = 0,
    hi = CARLSBAD_CURB_LENGTH;
  for (let i = 0; i < 36; i++) {
    const m = (lo + hi) / 2,
      q = carlsbadCurbSample(m);
    if (q.point[1] + q.inward[1] * d > z) lo = m;
    else hi = m;
  }
  const q = carlsbadCurbSample((lo + hi) / 2);
  const x = q.point[0] + q.inward[0] * d;
  if (lo < 0.00001 * F) {
    // Extend the first offset tangent back to the offset wall: a true miter,
    // not a jump from the wall to the first sampled offset vertex.
    return Math.max(wall, x + ((z - q.point[1] - q.inward[1] * d) * q.tangent[0]) / q.tangent[1]);
  }
  return z > -15 * F ? Math.max(wall, x) : x;
}
export const carlsbadBankEnd = (z: number) =>
  z >= -5 * F ? (13 + (12.2 - 13) * Math.min(1, (z / F + 5) / 9.33)) * F : carlsbadCurbOffset(z, 0);
export const carlsbadCapBack = (z: number) => carlsbadCurbOffset(z, CARLSBAD_CAP_WIDTH);
export const carlsbadToeTop = (z: number) =>
  z >= -5 * F
    ? carlsbadLanding(carlsbadBankEnd(z)) + (1.9 + 0.1 * Math.min(1, (z / F + 5) / 9.33)) * F
    : carlsbadCurbTop(carlsbadCurbNearest(carlsbadBankEnd(z), z).s);
/** West lawn with an eight-foot cross walk square to the wing. */
export function carlsbadLawnBounds(z: number): readonly [number, number] {
  const center = (-53 + (z/F-20.5)*18/32.5)*F;
  return [center-4*F/Math.cos(yaw), center+4*F/Math.cos(yaw)];
}
export function carlsbadUpperLawn(x: number, z: number): boolean {
  if (z < 17*F) return false;
  const center=(-53+(z/F-20.5)*18/32.5)*F;
  return x <= 0 && Math.abs(x-center)*Math.cos(yaw)>4*F;
}
export const carlsbadPathOuter = (z: number) => {
  if (z >= 4.33 * F) {
    return 27 * F;
  }
  const merge = Math.max(0, z / (4.33 * F));
  return carlsbadOutline(CARLSBAD_PATH_OUTER, z) * (1 - merge) + 27 * F * merge;
};
const shoulder = 2.5 * F;
// Preserve the round-3 riding strip exactly while moving the crest outside it.
const bankSlope = -0.35335908808057814;
export function carlsbadBank(x: number, z: number): number {
  const distance = Math.max(0, x - carlsbadUpperEdge(z));
  let bank = bankSlope * (distance < shoulder ? (distance * distance) / (2 * shoulder) : distance - shoulder / 2);
  // Extend the small wall-fit residual smoothly past the tip; the main
  // shoulder and slope never stretch to the lobe's changing row width.
  if (z > -8 * F) {
    const wallX = (13 + ((12.2 - 13) * (z / F + 5)) / 9.33) * F;
    const end = wallX - CARLSBAD_CAP_WIDTH;
    const top = carlsbadLanding(wallX) + (1.9 + (0.1 * (z / F + 5)) / 9.33) * F;
    const t = Math.max(0, Math.min(1, (z / F + 8) / 3));
    const correction = top - bankSlope * (end - carlsbadUpperEdge(z) - shoulder / 2);
    bank += correction * Math.min(1, distance / (end - carlsbadUpperEdge(z))) * t * t * (3 - 2 * t);
  }
  if (z >= -5 * F) {
    const end = carlsbadCapBack(z);
    const blend =
      Math.max(0, Math.min(1, (z / F - 1.33) / 3)) *
      Math.min(1, Math.max(0, (end - x) / Math.max(0.01 * F, end - 11 * F)));
    return bank * (1 - blend) + Math.min(0, carlsbadCheekTop(x) - 0.15 * F) * blend;
  }
  const q = carlsbadCurbNearest(x, z),
    u = Math.max(0, q.d - CARLSBAD_CAP_WIDTH);
  // Nearest arc length is discontinuous at the lobe medial axis. Fade its
  // boundary height into a smooth inland datum before reaching that axis.
  const t = Math.max(0, Math.min(1, (-z / F - 26) / 24));
  const oldDatum = (-3.6325 - 1.0725 * t * t * (3 - 2 * t)) * F;
  const shift = Math.max(0, Math.min(1, (-z/F-8)/7));
  const datum = oldDatum + shift*shift*(3-2*shift)*(carlsbadToeTop(z)-oldDatum);
  const v = Math.min(1, u / (3 * F)),
    fade = 1 - v * v * (3 - 2 * v);
  const lobe = datum + (carlsbadCurbTop(q.s) - datum) * fade + 0.75 * F * (1 - Math.exp(-u / (3.5 * F)));
  // Compact polynomial smooth maximum: a roughly three-foot concave foot.
  const k = Math.min(1.05 * F, u * 0.5),
    h = Math.max(0, k - Math.abs(bank - lobe));
  const blend = z > -8*F || Math.hypot(x-q.point[0],z-q.point[1]) > 3.7*F ? 1 : v * v * (3 - 2 * v);
  return lobe + blend * (Math.max(bank, lobe) + (k > 0 ? (h * h) / (4 * k) : 0) - lobe);
}
export function carlsbadStairGround(x: number): number {
  if (x <= 0) {
    return 0;
  }
  if (x >= CARLSBAD_STAIR_RUN) {
    return carlsbadLanding(x);
  }
  return -Math.min(CARLSBAD_STEPS, Math.floor(x / CARLSBAD_TREAD) + 1) * CARLSBAD_RISER;
}
export function carlsbadPaved(x: number, z: number): boolean {
  if (x <= carlsbadUpperEdge(z)) {
    return !carlsbadUpperLawn(x, z);
  }
  if (z >= CARLSBAD_STAIR_Z0 && z <= CARLSBAD_STAIR_Z1 && x <= CARLSBAD_STAIR_RUN) {
    return true;
  }
  if (z >= 4.33 * F) {
    return x >= 11 * F && x <= 27 * F;
  }
  return x >= carlsbadBankEnd(z) && (x <= carlsbadPathOuter(z) || (Math.abs(z) <= 2 * F && x <= 35 * F));
}
export function carlsbadSurface(x: number, z: number): number {
  const cheek = (z >= 4.33 * F && z < 5 * F) || (z > 16 * F && z <= 16.67 * F);
  if (cheek && x >= -2 * F && x <= 12.2 * F) {
    return carlsbadCheekTop(x);
  }
  if (z >= 5 * F && z <= 16 * F) {
    return carlsbadStairGround(x);
  }
  if (z > 16.67 * F) {
    return x <= 0 ? 0 : x < 11 * F ? -CARLSBAD_DROP * (x / (11 * F)) : carlsbadLanding(x);
  }
  if (x <= carlsbadUpperEdge(z)) {
    return 0;
  }
  const end = carlsbadBankEnd(z);
  if (x < carlsbadCapBack(z)) {
    return carlsbadBank(x, z);
  }
  if (x <= end) {
    return z >= -5 * F ? carlsbadToeTop(z) : carlsbadCurbTop(carlsbadCurbNearest(x, z).s);
  }
  return carlsbadLanding(x);
}
/** Joint polylines are exported for the dressing pass; coordinates are set units. */
export const CARLSBAD_JOINTS: PlanPoint[][] = [
  CARLSBAD_CURB.map(
    (p, i) => [(p[0] + CARLSBAD_PATH_OUTER[i][0]) / 2, (p[1] + CARLSBAD_PATH_OUTER[i][1]) / 2] as PlanPoint,
  ),
  ...CARLSBAD_CURB.slice(1).map((p, i) => [p, CARLSBAD_PATH_OUTER[i + 1]]),
  ...Array.from({length:18},(_,i)=>[carlsbadWingPoint(-130+i*10,-16.6),carlsbadWingPoint(-130+i*10,-7.5)]),
  ...[-30,-20,-10].map(x=>feet([[x,-7],[x,17]])),
  ...[-5,5,15].map(z=>feet([[-40,z],[0,z]])),
  ...[11, 19, 27].map((x) =>
    feet([
      [x, 16.67],
      [x, 62],
    ]),
  ),
  ...[20, 30, 40, 50, 60].map((z) =>
    feet([
      [11, z],
      [27, z],
    ]),
  ),
];
export const carlsbadGround = (x: number) => carlsbadSurface(x, CARLSBAD_LANE_Z);
export const CARLSBAD_TERRAIN: DropTerrain = {
  drop: CARLSBAD_DROP,
  run: CARLSBAD_RUN,
  landPast: 3 * F,
  laneZ: CARLSBAD_LANE_Z,
  // Seen coming out from under the eave: a longer run-up than a straight one needs.
  runUp: 1.35,
  carveIn: { yaw: CARLSBAD_WING_YAW, over: 22 * F, straight: 9.4 * F },
  ground: carlsbadGround,
  surface: carlsbadSurface,
  slope: (x) => (x > CARLSBAD_RUN ? carlsbadLandingSlope(x) : 0),
};
/** Where the filmers stand (tripods.ts). */
export const CARLSBAD_FILMERS: SpotFilmers = {
  stairs: {
    line: CARLSBAD_LANE_Z,
    stands: {
      bottom: {
        u: CARLSBAD_RUN + 29 * F,
        z: 13 * F,
        height: carlsbadLanding(CARLSBAD_RUN + 29 * F) + 4.5 * F,
        frame: 17 * F,
        place: 0.52,
      },
      // Beside the hallway, just outside the crest on the bank.
      side: {
        u: 16 * F,
        z: -15.5 * F,
        height: carlsbadSurface(16 * F, -15.5 * F) + 4.6 * F,
        frame: 18 * F,
        place: 0.53,
      },
      top: { u: -1 * F, z: 17.5 * F, height: 5.7 * F, frame: 14 * F, place: 0.6 },
    },
  },
};
