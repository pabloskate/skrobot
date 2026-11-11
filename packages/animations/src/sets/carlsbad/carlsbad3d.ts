import { Vector3 } from 'three';
import type { Vec3 } from '../../camera/view';
import { SUN } from '../../three/materials';
import { ClassicSpot3D } from '../classicSpot3d';
import { crownSpheres } from '../props/trees';
import { MAX_CANOPIES, type Canopy, type SpotLook } from '../surfaces';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_DROP, CARLSBAD_FILMERS, CARLSBAD_FOOT as F, CARLSBAD_LANE_Z, CARLSBAD_RUN,
  carlsbadGround, carlsbadLanding, carlsbadPaved, carlsbadUpperEdge,
} from './carlsbadLayout';
import { carlsbadTrees } from './carlsbadTrees';

/** Bright Southern California midday (BUILD_SPEC.md §2), tuned against refs/163, 03, 154. */
export const CARLSBAD_LOOK: SpotLook = {
  ink: '#6f6c66',
  propShadows: true,
  light: 'shader',
  fill: { sky: 0.7, bounce: 0.9 },
  soffit: 0.6,
  haze: { color: '#cdd5d6', from: 45, to: 900, amount: 0.5 },
  // A softer sun edge than the default: the block wall's and the eave's shade no longer cut like a stencil.
  penumbra: 0.03,
  boxContact: 1.6,
  // Broadleaf crowns in full sun: their shade on the pad is nearly as deep as a wall's.
  dapple: 0.85,
  // Urethane marks where boards roll to the lip, land and roll away (refs/155, 03).
  marks: [{ x: [-14, -0.5], z: [-3, 3] }, { x: [13.5, 34], z: [-6, 4.5] }],
};

/** Paving the cameras look at: the landing, the lower paths and the curved path round the lobe, and the upper pad by the lip. */
function seenPaving(x: number, z: number): boolean {
  if (!carlsbadPaved(x, z)) return false;
  const lower = x > carlsbadUpperEdge(z);
  return lower
    ? x < 60 * F && z > -75 * F && z < 62 * F
    : x > -60 * F && z > -25 * F && z < 20 * F;
}

/** Where a sun ray from `p` meets the ground: the upper level's plane, else the lower ground below it. */
function shadeFoot(p: Vec3): [number, number] {
  const along = (y: number) => (p[1] - y) / SUN.y;
  let x = p[0] - SUN.x * along(0), z = p[2] - SUN.z * along(0);
  if (x <= carlsbadUpperEdge(z)) return [x, z];
  for (let i = 0; i < 2; i++) {
    const s = along(carlsbadLanding(x));
    x = p[0] - SUN.x * s;
    z = p[2] - SUN.z * s;
  }
  return [x, z];
}

/** Sample offsets across a crown, square to the sun: its middle and two rings. */
const CROWN_SAMPLES: readonly [number, number][] = [
  [0, 0],
  ...Array.from({ length: 6 }, (_, i) => [0.45, (i * Math.PI) / 3] as [number, number]),
  ...Array.from({ length: 12 }, (_, i) => [0.8, ((i + 0.5) * Math.PI) / 6] as [number, number]),
];

/**
 * The crown spheres whose shade the cameras will see on paving: each crown
 * is scored by how much of its sun shadow lands on the landing, the lower
 * paths or the upper pad (sampled across the crown, square to the sun, and
 * followed down to the ground), and the best fill the canopy budget. A crown
 * whose shade falls only on lawn, the bank or out of sight is left out.
 */
export function carlsbadCanopies(trees = carlsbadTrees()): Canopy[] {
  const sun = new Vector3(SUN.x, SUN.y, SUN.z);
  const u = new Vector3(0, 1, 0).cross(sun).normalize(), v = sun.clone().cross(u);
  return crownSpheres(trees)
    .map(({ center, radius }) => {
      let hits = 0;
      for (const [r, a] of CROWN_SAMPLES) {
        const k = r * radius, du = Math.cos(a) * k, dv = Math.sin(a) * k;
        const p: Vec3 = [center[0] + u.x * du + v.x * dv, center[1] + u.y * du + v.y * dv, center[2] + u.z * du + v.z * dv];
        if (seenPaving(...shadeFoot(p))) hits++;
      }
      return { canopy: { at: center, radius } as Canopy, score: (hits / CROWN_SAMPLES.length) * radius * radius };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANOPIES)
    .map(({ canopy }) => canopy);
}

/** The perimeter block wall's shade on the lawn at its foot (x ≈ 66 ft, 8 ft tall). */
function wallShadow(): { min: Vec3; max: Vec3 } {
  const floor = carlsbadLanding(66 * F);
  return { min: [66 * F, floor, -74 * F], max: [66.77 * F, floor + 8.25 * F, 18 * F] };
}

export class Carlsbad3D extends ClassicSpot3D {
  constructor() {
    const trees = carlsbadTrees();
    super({
      build: () => {
        const built = buildCarlsbadGeometry();
        return { ...built, shadowBoxes: [...built.shadowBoxes, wallShadow()], canopies: carlsbadCanopies(trees) };
      },
      laneZ: CARLSBAD_LANE_Z, ground: carlsbadGround,
      grade: CARLSBAD_DROP / CARLSBAD_RUN, run: CARLSBAD_RUN, drop: CARLSBAD_DROP,
      cameraZ: [-42 * F, 36 * F], stayUp: ['stairs'],
      filmers: CARLSBAD_FILMERS,
      streetProps: { trees },
      look: CARLSBAD_LOOK,
    });
  }
}
