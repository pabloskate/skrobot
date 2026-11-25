import type { CarPlacement, TreePlacement } from '../props/streetProps';
import { WATER_TOWER_FOOT as F } from './waterTowerLayout';
import { point } from './waterTowerKit';
import { crest, landHeight, roadBend } from './waterTowerSite';

/** Thin young street trees along the verge, as in 1997 (09-18), not today's tall screen: x, z and height in feet. */
const VERGE = [-175, -114, -56, 19, 87, 172, 238, 311].map((x, i) => [x, 138 + roadBend(x), 12 + (i % 3) * 2]);
/** Clumps at the hill's foot behind the takeoff tank, round the office, and beyond the third tank. */
const CLUMPS = [
  [-142, -108, 18], [-154, -105, 23], [-168, -110, 17],
  [-244, -47, 26], [-249, -38, 21], [-311, -63, 28], [-301, -85, 30],
  [364, -53, 22], [378, -73, 25],
];

/** The street-prop trees: the verge's ornamentals first (their crowns dapple the ground), then the clumps. */
export const WATER_TOWER_TREES: TreePlacement[] = [...VERGE, ...CLUMPS].map(([x, z, h], i) => ({
  at: point(x, landHeight(x, z) - 0.25, z),
  height: h * F,
  yaw: i * 137,
  seed: 711 + i,
  species: i < VERGE.length ? 'ornamental' : i % 2 ? 'eucalyptus' : 'ficus',
}));
// Small multi-stem crowns pick out clumps along the drainage cuts: three in four on the east slope, the rest high
// on the hillside, each sunk a third of its height so it reads as a bush.
for (let i = 0; i < 96; i++) {
  const x = 355 * Math.sin(i * 24.82);
  const z = i % 4 ? roadBend(x) + 253 + 166 * (0.5 + 0.5 * Math.sin(i * 82.33)) : -161 - 66 * (0.5 + 0.5 * Math.cos(i * 19.31));
  const h = 5 + 4 * Math.sin(i * 5.42) ** 2;
  WATER_TOWER_TREES.push({ at: point(x, landHeight(x, z) - h * 0.32, z), height: h * F, species: 'ficus', yaw: i * 117, seed: 890 + i });
}

// Oaks and big shrubs crowding the crest round the houses (66), in loose clumps.
for (let i = 0; i < 26; i++) {
  const x = -560 + i * 44 + 14 * Math.sin(i * 7.1), across = crest(x) - 18 + 26 * (0.5 + 0.5 * Math.sin(i * 3.3));
  const z = roadBend(x) + across, h = 16 + 9 * Math.sin(i * 2.17) ** 2;
  WATER_TOWER_TREES.push({ at: point(x, landHeight(x, z) - 0.5, z), height: h * F, species: i % 3 ? 'ficus' : 'eucalyptus', yaw: i * 71, seed: 1010 + i });
}

// The street-prop cars point along +x at zero yaw and toward -z as yaw increases.
const roadHeading = (x: number) => (-Math.atan2(roadBend(x + 1) - roadBend(x - 1), 2) * 180) / Math.PI;
/** Two sedans in Fullerton's lanes, one each way. */
export const WATER_TOWER_CARS: CarPlacement[] = [
  { at: point(-82, -25, 170 + roadBend(-82)), yaw: roadHeading(-82), model: 'sedan', paint: '#a0a09a' },
  { at: point(147, -25, 210 + roadBend(147)), yaw: 180 + roadHeading(147), model: 'sedan', paint: '#d1cec0' },
];
