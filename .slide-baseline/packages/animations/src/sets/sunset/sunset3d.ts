import { Bake, NO_INK, type Ink } from '../../three/bake';
import { INK_PROP } from '../../three/materials';
import { ClassicSpot3D } from '../classicSpot3d';
import { lambert, tone } from '../../camera/camera';
import { FOOT } from '../elToro/stairs';
import { hash2 } from '../setKit';
import { mixHex } from '../../math';
import type { Vec3 } from '../../camera/view';
import { sunsetLettering, sunsetPalm, sunsetShrub } from './sunsetDetails';
import { buildSunsetStreetscape, SUNSET_STREET_PROPS } from './sunsetStreetscape';
import * as layout from './sunsetLayout';

// Detail coordinates are authored together at one scale, then baked to world
// size. Physics uses the world dimensions directly; the rider is never scaled.
const SCALE = layout.SUNSET_SCALE;
const SUNSET_BANK_END = layout.SUNSET_BANK_END / SCALE;
const SUNSET_BANK_START = layout.SUNSET_BANK_START / SCALE;
const SUNSET_BANK_TOP = layout.SUNSET_BANK_TOP / SCALE;
const SUNSET_BANK_Z0 = layout.SUNSET_BANK_Z0 / SCALE;
const SUNSET_BANK_Z1 = layout.SUNSET_BANK_Z1 / SCALE;
const SUNSET_DROP = layout.SUNSET_DROP / SCALE;
const SUNSET_ROOF_BACK = layout.SUNSET_ROOF_BACK / SCALE;
const SUNSET_ROOF_Z0 = layout.SUNSET_ROOF_Z0 / SCALE;
const SUNSET_ROOF_Z1 = layout.SUNSET_ROOF_Z1 / SCALE;
const SUNSET_SIDEWALK_END = layout.SUNSET_SIDEWALK_END / SCALE;
const SUNSET_TOE_START = layout.SUNSET_TOE_START / SCALE;
const sunsetGround = (x: number) => layout.sunsetGround(x * SCALE) / SCALE;
const sunsetSlope = (x: number) => layout.sunsetSlope(x * SCALE);
const worldPoint = (p: Vec3): Vec3 => [p[0] * SCALE, p[1] * SCALE, p[2] * SCALE];

const UP: Vec3 = [0, 1, 0];
const STRUCTURE: Ink = { id: 85, priority: 4, width: 0.16, kind: INK_PROP, solid: 10 };
const PAINT: Ink = { id: 99, priority: 4, width: 0.13, kind: INK_PROP, solid: 11 };
const SC = {
  bank: '#aeb6b5', roof: '#b2aca0', sidewalk: '#c0bbac', asphalt: '#777971',
  blue: '#27789e', blueDark: '#1e5977', orange: '#d5753f', trim: '#c9cfca',
};

function horizontal(bake: Bake, x0: number, x1: number, z0: number, z1: number, y: number, color: string) {
  bake.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], UP, { color: tone(color, lambert({ x: 0, y: -1, z: 0 })) }, NO_INK);
}

/**
 * Canonical, real-world-oriented geometry. The empty landing bank is the
 * skateable pre-2021 version, with the 2019 blue/orange canopy. Photographic
 * sources and explicitly estimated dimensions: docs/SUNSET_REFERENCE.md.
 */
export function buildSunsetGeometry() {
  const ground = new Bake();
  const props = new Bake();
  const lower = -SUNSET_DROP;
  const taperEnd = SUNSET_BANK_Z0 - 12 * FOOT;

  // The canopy is a roof you can skate, never a solid cuboid filling its bays.
  horizontal(ground, SUNSET_ROOF_BACK, 0, SUNSET_ROOF_Z0, SUNSET_ROOF_Z1, 0, SC.roof);
  // Adjacent pavement replaces the asphalt underneath it. Almost coplanar
  // overlapping floors lose depth precision at street-level camera angles,
  // making whole triangles alternate between concrete and asphalt colors.
  const paving: Array<{ x0: number; x1: number; z0: number; z1: number; color: string | null }> = [
    { x0: SUNSET_BANK_START, x1: SUNSET_BANK_END, z0: taperEnd, z1: SUNSET_BANK_Z1, color: null },
    { x0: SUNSET_BANK_END, x1: SUNSET_SIDEWALK_END, z0: -10000, z1: 10000, color: SC.sidewalk },
    { x0: SUNSET_SIDEWALK_END + 39 * FOOT, x1: SUNSET_SIDEWALK_END + 46 * FOOT, z0: -10000, z1: 10000, color: SC.sidewalk },
    { x0: SUNSET_ROOF_BACK - 2000, x1: SUNSET_BANK_END, z0: SUNSET_BANK_Z1, z1: 3500, color: '#aaa99a' },
    { x0: SUNSET_ROOF_BACK - 2000, x1: SUNSET_BANK_END, z0: -4000, z1: taperEnd, color: '#aaa99a' },
  ];
  const xs = [...new Set([-24000, 24000, ...paving.flatMap(p => [p.x0, p.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([-24000, 24000, ...paving.flatMap(p => [p.z0, p.z1])])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
      const patch = paving.find(p => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1);
      if (patch?.color === null) continue;
      horizontal(ground, xs[i], xs[i + 1], zs[j], zs[j + 1], patch ? lower : lower - 0.3, patch?.color ?? SC.asphalt);
    }
  }

  // A single, level crest runs beneath the wash and past its right-hand end.
  // The landing uses exactly the same section as the rest of the frontage.
  const breaks = [SUNSET_BANK_START, SUNSET_TOE_START];
  for (let i = 1; i <= 16; i++) breaks.push(SUNSET_TOE_START + (SUNSET_BANK_END - SUNSET_TOE_START) * i / 16);
  const bankStrip = (a: number, b: number, z0: number, z1: number) => {
    const vertex = (x: number, z: number) => {
      const slope = sunsetSlope(x);
      const length = Math.hypot(slope, 1);
      ground.vertex([x, sunsetGround(x), z], [-slope / length, 1 / length, 0], { color: tone(SC.bank, lambert({ x: -slope / length, y: -1 / length, z: 0 })) }, { ...NO_INK, solid: 10 });
    };
    for (const [x, z] of [[a, z1], [b, z1], [b, z0], [a, z1], [b, z0], [a, z0]]) vertex(x, z);
  };
  for (let i = 0; i < breaks.length - 1; i++) bankStrip(breaks[i], breaks[i + 1], SUNSET_BANK_Z0, SUNSET_BANK_Z1);

  // The planted shoulder beside the roof is below the same continuous crest.
  horizontal(ground, SUNSET_BANK_START - 10, SUNSET_BANK_START, SUNSET_BANK_Z0, SUNSET_ROOF_Z0, SUNSET_BANK_TOP, '#b5bdb7');
  horizontal(ground, -430, SUNSET_BANK_START - 10, SUNSET_BANK_Z0, SUNSET_ROOF_Z0 - 8, SUNSET_BANK_TOP - 7, '#798370');
  ground.quad([SUNSET_BANK_START - 10, lower, SUNSET_BANK_Z0], [SUNSET_BANK_START - 10, lower, SUNSET_ROOF_Z0], [SUNSET_BANK_START - 10, SUNSET_BANK_TOP, SUNSET_ROOF_Z0], [SUNSET_BANK_START - 10, SUNSET_BANK_TOP, SUNSET_BANK_Z0], [-1, 0, 0], { color: '#a3aaa0' }, STRUCTURE);
  // The distant right end tapers down alongside the driveway as in the
  // street-side reference. The rider's broad central landing stays level
  // across z and well clear of this decorative end of the retaining bank.
  const crossSection = breaks;
  for (let i = 0; i < crossSection.length - 1; i++) {
    const a = crossSection[i], b = crossSection[i + 1];
    const p0: Vec3 = [a, sunsetGround(a), SUNSET_BANK_Z0];
    const p1: Vec3 = [b, sunsetGround(b), SUNSET_BANK_Z0];
    const p2: Vec3 = [b, lower, taperEnd];
    const p3: Vec3 = [a, lower, taperEnd];
    const gradient = -(sunsetGround((a + b) / 2) - lower) / (taperEnd - SUNSET_BANK_Z0);
    const length = Math.hypot(sunsetSlope((a + b) / 2), 1, gradient);
    const normal: Vec3 = [-sunsetSlope((a + b) / 2) / length, 1 / length, -gradient / length];
    ground.quad(p0, p1, p2, p3, normal, { color: tone(SC.bank, lambert({ x: normal[0], y: -normal[1], z: normal[2] })) }, { ...NO_INK, solid: 9 });
  }
  ground.quad([SUNSET_BANK_START, lower, taperEnd], [SUNSET_BANK_START, lower, SUNSET_BANK_Z0], [SUNSET_BANK_START, SUNSET_BANK_TOP, SUNSET_BANK_Z0], [SUNSET_BANK_START, lower, taperEnd], [-1, 0, 0], { color: '#9da89e' }, STRUCTURE);
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i], b = breaks[i + 1];
    ground.quad([b, lower, SUNSET_BANK_Z1], [a, lower, SUNSET_BANK_Z1], [a, sunsetGround(a), SUNSET_BANK_Z1], [b, sunsetGround(b), SUNSET_BANK_Z1], [0, 0, 1], { color: '#a0a7a2' }, STRUCTURE);
  }

  // Gray paint has long brush/trowel streaks and sparse chips; these marks
  // follow the actual sloped surface, rather than floating on a flat plane.
  const bankMark = (x: number, z: number, length: number, width: number, color: string) => {
    const x1 = Math.min(SUNSET_BANK_END - 1, x + length);
    const point = (u: number, v: number): Vec3 => [u, sunsetGround(u) + 0.14, v];
    ground.quad(point(x, z), point(x1, z + width * 0.8), point(x1, z + width * 1.5), point(x, z + width), UP, { color }, NO_INK);
  };
  for (let k = 0; k < 330; k++) {
    const x = 5 + hash2(k, 0, 851) * (SUNSET_BANK_END - 12);
    const z = SUNSET_BANK_Z0 + 4 + hash2(k, 1, 852) * (SUNSET_BANK_Z1 - SUNSET_BANK_Z0 - 8);
    const length = 7 + hash2(k, 2, 853) * 46;
    const color = mixHex(SC.bank, k % 4 === 0 ? '#757e77' : '#d1d2c7', k % 4 === 0 ? 0.22 : 0.26);
    bankMark(x, z, length, 0.3 + hash2(k, 3, 854) * 1.4, color);
  }
  for (let z = SUNSET_BANK_Z0 + 110; z < SUNSET_BANK_Z1; z += 174) bankMark(0, z, SUNSET_BANK_END - 1, 0.8, '#909b96');

  // Expansion joints, patched pavement, a shallow curb line and storm drains.
  for (let z = -3200; z < 3200; z += 145) {
    horizontal(ground, SUNSET_BANK_END + 1, SUNSET_SIDEWALK_END - 2, z, z + 0.9, lower + 0.13, '#8d9186');
    horizontal(ground, SUNSET_SIDEWALK_END + 40 * FOOT, SUNSET_SIDEWALK_END + 46 * FOOT, z, z + 0.9, lower + 0.13, '#939589');
  }
  horizontal(ground, SUNSET_SIDEWALK_END - 7, SUNSET_SIDEWALK_END, -6000, 6000, lower + 0.15, '#aaa99a');
  for (const z of [-1230, 840]) {
    horizontal(ground, SUNSET_SIDEWALK_END + 2, SUNSET_SIDEWALK_END + 35, z, z + 92, lower + 0.12, '#575e57');
    for (let k = 0; k < 10; k++) horizontal(ground, SUNSET_SIDEWALK_END + 5, SUNSET_SIDEWALK_END + 30, z + k * 9, z + k * 9 + 3, lower + 0.25, '#8b9083');
  }
  for (let k = 0; k < 14; k++) {
    const x = SUNSET_SIDEWALK_END + 70 + hash2(k, 3, 853) * 980;
    const z = -1700 + hash2(k, 4, 855) * 3400;
    horizontal(ground, x, x + 20 + hash2(k, 5, 855) * 70, z, z + 100, lower - 0.12, '#71766d');
  }
  for (const x of [SUNSET_SIDEWALK_END + 19 * FOOT, SUNSET_SIDEWALK_END + 19.4 * FOOT]) {
    horizontal(ground, x, x + 3.4, -11000, 11000, lower + 0.02, '#c4b46f');
  }
  for (let z = -3400; z <= 3400; z += 270) {
    for (const x of [SUNSET_SIDEWALK_END + 9 * FOOT, SUNSET_SIDEWALK_END + 30 * FOOT]) horizontal(ground, x, x + 3.6, z, z + 105, lower + 0.02, '#c9c9b9');
  }

  // Weathered tar/gravel roof with low seam ridges; takeoff remains flush.
  for (let x = SUNSET_ROOF_BACK + 90; x < -20; x += 130) horizontal(ground, x, x + 0.9, SUNSET_ROOF_Z0, SUNSET_ROOF_Z1, 0.15, '#92958b');
  for (let z = SUNSET_ROOF_Z0; z < SUNSET_ROOF_Z1; z += 180) horizontal(ground, SUNSET_ROOF_BACK, -2, z, z + 0.7, 0.17, '#9e9d90');
  for (let k = 0; k < 150; k++) {
    const x = SUNSET_ROOF_BACK + hash2(k, 0, 856) * -SUNSET_ROOF_BACK;
    const z = SUNSET_ROOF_Z0 + hash2(k, 1, 857) * (SUNSET_ROOF_Z1 - SUNSET_ROOF_Z0);
    horizontal(ground, x, x + 1.1, z, z + 2.1, 0.2, '#cecab9');
  }

  // Blue fascia wraps the long open canopy and its end. Silver roof-edge
  // flashing and the orange drip band match the 2019 cover photo.
  props.box([SUNSET_ROOF_BACK, -11, SUNSET_ROOF_Z0], [0, -0.6, SUNSET_ROOF_Z1], '#b7bdb6', '#c9ccc1', STRUCTURE, 'bfkle');
  props.box([-8, -79, SUNSET_ROOF_Z0], [-0.4, -10, SUNSET_ROOF_Z1], SC.blue, SC.blue, PAINT);
  props.box([SUNSET_ROOF_BACK, -79, SUNSET_ROOF_Z0], [-1, -10, SUNSET_ROOF_Z0 + 8], SC.blue, SC.blue, PAINT);
  props.box([-9, -85, SUNSET_ROOF_Z0 - 1], [0.3, -79, SUNSET_ROOF_Z1 + 1], SC.orange, '#e49667', PAINT);
  props.box([SUNSET_ROOF_BACK, -85, SUNSET_ROOF_Z0 - 1], [0, -79, SUNSET_ROOF_Z0 + 9], SC.orange, '#e49667', PAINT);
  props.box([-9, -12, SUNSET_ROOF_Z0 - 1], [0.2, -8, SUNSET_ROOF_Z1 + 1], SC.trim, '#d7d9cb', PAINT);
  props.box([SUNSET_ROOF_BACK, -12, SUNSET_ROOF_Z0 - 1], [0, -8, SUNSET_ROOF_Z0 + 9], SC.trim, '#d7d9cb', PAINT);
  for (let z = SUNSET_ROOF_Z0; z < SUNSET_ROOF_Z1; z += 250) {
    props.box([-0.1, -78, z], [0.05, -13, z + 0.7], SC.blueDark, SC.blueDark, null);
    for (const y of [-16, -74]) props.box([0.1, y, z + 3], [0.3, y + 1, z + 4], '#bac2b4', '#bac2b4', null);
  }
  // Anchor signs at their right edge; each facade keeps readable lettering
  // after moving the short canopy end to the right side of the frontage.
  const sign = (text: string, end: Vec3, right: Vec3, scale: number, color = '#f3ede0') => {
    const width = (text.length * 6 - 1) * scale;
    const start: Vec3 = [end[0] - right[0] * width, end[1], end[2] - right[2] * width];
    sunsetLettering(props, text, start, right, scale, color);
  };
  sign('SUNSET CAR WASH', [0.5, -25, -55], [0, 0, -1], 5.7);
  sign('100% HAND WASH', [0.5, -33, 590], [0, 0, -1], 3.8, '#eee4c5');
  sign('SUNSET CAR WASH', [-855, -28, SUNSET_ROOF_Z0 - 0.5], [-1, 0, 0], 6);
  // Circular Sunset badge at the canopy's corner, built in its vertical plane.
  const logo = (cx: number, cy: number, cz: number, axis: 'x' | 'z') => {
    const point = (r: number, a: number): Vec3 => axis === 'x' ? [cx, cy + Math.sin(a) * r, cz + Math.cos(a) * r] : [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz];
    const n: Vec3 = axis === 'x' ? [1, 0, 0] : [0, 0, -1];
    for (const [r, color] of [[25, '#e0b87b'], [21, '#d2c9a5'], [17, '#bf704a']] as const) {
      for (let k = 0; k < 36; k++) props.triangle([cx, cy, cz], point(r, k * Math.PI / 18), point(r, (k + 1) * Math.PI / 18), n, { color }, NO_INK);
      // Each concentric face needs its own tiny offset toward the viewer.
      if (axis === 'x') cx += 0.03; else cz -= 0.03;
    }
  };
  logo(0.65, -45, -126, 'x');
  logo(-60, -45, SUNSET_ROOF_Z0 - 0.65, 'z');
  sign('SUNSET', [0.8, -35, -146], [0, 0, -1], 1.2);
  sign('CAR WASH', [0.8, -49, -152], [0, 0, -1], 1.1);
  sign('SUNSET', [-80, -35, SUNSET_ROOF_Z0 - 0.8], [-1, 0, 0], 1.2);
  sign('CAR WASH', [-85, -49, SUNSET_ROOF_Z0 - 0.8], [-1, 0, 0], 1.1);

  // Open wash bays: columns, joists, strip lights, interior pipes, guide rail.
  for (let z = SUNSET_ROOF_Z0 + 80; z < SUNSET_ROOF_Z1; z += 250) {
    props.box([-55, -194, z - 3], [-48, -79, z + 3], SC.blueDark, SC.blue, PAINT);
    props.box([SUNSET_ROOF_BACK + 90, -194, z - 4], [SUNSET_ROOF_BACK + 100, -10, z + 4], '#8e978e', '#bcc0b3', STRUCTURE);
    props.box([SUNSET_ROOF_BACK + 45, -21, z - 4], [-8, -12, z + 4], '#6c766e', '#9eaa9e', STRUCTURE);
    props.box([-130, -20, z - 63], [-104, -18, z + 63], '#f0dfb3', '#fff0cb', null);
    props.tube([[-72, -112, z - 85], [-72, -112, z + 110]], [1.7, 1.7], { color: '#a9b1a8' }, NO_INK, 8);
  }
  for (const y of [-115, -138]) props.tube([[-35, y, SUNSET_ROOF_Z0], [-35, y, SUNSET_ROOF_Z1]], [1.8, 1.8], { color: '#97a69c' }, NO_INK, 8);
  props.box([SUNSET_ROOF_BACK + 120, -196, SUNSET_ROOF_Z0 + 35], [-26, -190, SUNSET_ROOF_Z1 - 35], '#757d71', '#8b9185', STRUCTURE);
  // Recessed service wall with a wash entrance, windows and utility equipment.
  props.box([SUNSET_ROOF_BACK - 38, -260, SUNSET_ROOF_Z0 - 18], [SUNSET_ROOF_BACK + 5, 82, SUNSET_ROOF_Z1 + 18], '#c8c6b5', '#d9d5c3', STRUCTURE);
  for (let z = SUNSET_ROOF_Z0 + 50; z < SUNSET_ROOF_Z1 - 100; z += 220) {
    props.box([SUNSET_ROOF_BACK + 5.1, -182, z], [SUNSET_ROOF_BACK + 5.8, -84, z + 100], '#4a6567', '#667b75', PAINT);
    for (const atZ of [z, z + 50, z + 100]) props.box([SUNSET_ROOF_BACK + 6, -182, atZ], [SUNSET_ROOF_BACK + 7, -84, atZ + 2], '#a4ada2', '#c1c6b8', null);
  }
  for (const z of [1300, 880]) {
    props.box([-740, 0, z], [-648, 64, z + 95], '#9ea499', '#b5b9aa', STRUCTURE);
    for (let i = 0; i < 8; i++) props.box([-646.9, 9 + i * 6, z + 8], [-646, 11 + i * 6, z + 86], '#66786f', '#66786f', null);
    props.tube([[-690, 63, z + 49], [-690, 81, z + 49]], [15, 15], { color: '#adb2a6' }, NO_INK, 12);
  }

  // Two box planters puncture the long bank, left of the canonical jump.
  // Their fronts sit close to the sidewalk while their back edges enter it.
  for (const [z, seed] of [[400, 1], [575, 2], [1320, 3]] as const) {
    const x0 = SUNSET_BANK_END - 105;
    const x1 = SUNSET_BANK_END - 13;
    const top = lower + 86;
    props.box([x0, lower + 2, z - 54], [x1, top, z + 54], '#adb2a6', '#bfc2b5', STRUCTURE);
    horizontal(props, x0 + 6, x1 - 6, z - 48, z + 48, top + 0.2, '#555d42');
    for (let k = 0; k < 8; k++) props.box([x1 + 0.1, lower + 4, z - 51 + k * 14], [x1 + 0.2, top - 1, z - 50.2 + k * 14], '#9da797', '#9da797', null);
    sunsetShrub(props, (x0 + x1) / 2, top, z, 68, seed);
  }

  // Dense oleander at the corner and greenery behind the continuous bank
  // crest appear in the sequence; all leaves remain off the takeoff/landing.
  sunsetShrub(props, SUNSET_BANK_END - 77, lower + 138, SUNSET_ROOF_Z0 + 106, 86, 20, sunsetGround(SUNSET_BANK_END - 77));
  for (const [x, z, radius, seed] of [[-235, -340, 100, 21], [-270, -555, 120, 22], [-290, -750, 110, 23]]) {
    sunsetShrub(props, x, SUNSET_BANK_TOP + 65, z, radius, seed, SUNSET_BANK_TOP - 7);
    sunsetShrub(props, x - 25, SUNSET_BANK_TOP + 125, z + 8, radius * 0.8, seed + 10, SUNSET_BANK_TOP - 7);
  }

  // White stucco / terracotta buildings behind the canopy corner are
  // especially clear in the user's airborne and touchdown reference frames.
  const houseZ0 = SUNSET_BANK_Z0 - 200;
  const houseZ1 = SUNSET_ROOF_Z0 - 24;
  props.box([-865, lower, houseZ0], [-555, 176, houseZ1], '#d1cec0', '#ddd7c6', STRUCTURE);
  props.box([-710, 176, houseZ1 - 460], [-540, 257, houseZ1 - 180], '#d5d1c2', '#ded8c8', STRUCTURE);
  props.box([-872, 177, houseZ0 - 7], [-548, 185, houseZ1 + 7], '#aa7960', '#b58b70', STRUCTURE);
  for (let z = houseZ0 - 4; z < houseZ1 + 5; z += 15) {
    props.tube([[-855, 198, z], [-700, 192, z], [-538, 176, z]], [5.5, 5.5, 5.5], { color: ['#a77358', '#ae7e60', '#996b55'][Math.abs(Math.floor(z / 15)) % 3] }, NO_INK, 8, false);
  }
  for (const z of [houseZ1 - 148, houseZ1 - 608]) {
    props.box([-554, 26, z], [-553, 103, z + 63], '#68736c', '#68736c', PAINT);
    props.box([-552.9, 18, z - 5], [-548, 26, z + 68], '#b8b8a5', '#c6c5b0', STRUCTURE);
  }

  // A small service driveway and poles remain outside the rider's lane.
  for (const z of [SUNSET_BANK_Z1 + 130, SUNSET_BANK_Z0 - 15 * FOOT]) {
    const x = SUNSET_SIDEWALK_END - 32;
    props.tube([[x, lower, z], [x, lower + 625, z]], [4.8, 3.2], { color: '#808b7d' }, NO_INK, 10);
    props.tube([[x, lower + 615, z], [x + 38, lower + 660, z], [x + 105, lower + 665, z]], [3, 2.7, 2.5], { color: '#879083' }, NO_INK, 8);
    props.box([x + 90, lower + 655, z - 12], [x + 142, lower + 663, z + 12], '#879083', '#b7bcaf', STRUCTURE);
  }
  // A billboard at the roof's far end appears in the photographs. The
  // neutral wash advert preserves its silhouette without copying an ad.
  props.box([-700, lower, SUNSET_ROOF_Z1 + 200], [-680, 465, SUNSET_ROOF_Z1 + 220], '#75766a', '#a3a38e', STRUCTURE);
  props.box([-1050, 305, SUNSET_ROOF_Z1 + 201], [-275, 655, SUNSET_ROOF_Z1 + 215], '#d2c9b5', '#ded4bd', STRUCTURE);
  sign('CALIFORNIA', [-992, 575, SUNSET_ROOF_Z1 + 199], [-1, 0, 0], 8.6, '#588580');
  sign('SUNSHINE', [-950, 457, SUNSET_ROOF_Z1 + 199], [-1, 0, 0], 9.5, '#bd7651');
  for (let i = 0; i < 7; i++) props.tube([[-1010 + i * 112, 305, SUNSET_ROOF_Z1 + 205], [-1010 + i * 112, 283, SUNSET_ROOF_Z1 + 150]], [1.4, 1.4], { color: '#6c7468' }, NO_INK, 6);
  for (const [x, z, height, seed] of [[-1290, 1250, 940, 1], [-1750, -510, 810, 2], [-800, -1550, 1160, 3], [-2380, 520, 1300, 4]]) sunsetPalm(props, x, lower, z, height, seed);

  // Low Los Angeles commercial backdrop: muted walls and dark shop glazing.
  for (const [x, z, width, depth, height] of [[-1850, 1200, 450, 1200, 430], [-1350, -1080, 600, 620, 355], [-1250, 2680, 650, 600, 460]]) {
    props.box([x - width, lower, z - depth / 2], [x, lower + height, z + depth / 2], '#c1c1b1', '#c7c7b5', STRUCTURE);
    props.box([x + 0.2, lower + 25, z - depth / 2 + 20], [x + 0.4, lower + 138, z + depth / 2 - 20], '#657a74', '#657a74', PAINT);
    for (let atZ = z - depth / 2 + 20; atZ < z + depth / 2 - 20; atZ += 70) props.box([x + 0.6, lower + 25, atZ], [x + 1, lower + 138, atZ + 2], '#aeb5a7', '#aeb5a7', null);
    props.box([x - width - 7, lower + height, z - depth / 2 - 7], [x + 7, lower + height + 9, z + depth / 2 + 7], '#a9b2a2', '#b3b9a9', STRUCTURE);
  }
  // Wheel marks and repainted patches on the bank, following its slope:
  // the scuffs gather where riders touch down, the patches cover old tags.
  const onBank = (x0: number, x1: number, z0: number, z1: number, lift: number, color: string) => {
    const point = (u: number, v: number): Vec3 => [u, sunsetGround(u) + lift, v];
    ground.quad(point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1), UP, { color }, NO_INK);
  };
  const landZ = layout.SUNSET_LANE_Z / SCALE;
  for (let k = 0; k < 16; k++) {
    const z = landZ + (hash2(k, 0, 870) - 0.5) * 110;
    const x = 8 + hash2(k, 1, 871) * (SUNSET_TOE_START - 30);
    onBank(x, Math.min(SUNSET_BANK_END - 2, x + 15 + hash2(k, 2, 872) * 40), z, z + 0.8 + hash2(k, 3, 873) * 1.2, 0.2, k % 3 ? '#8f9693' : '#9aa09c');
  }
  for (const [x0, x1, z0, z1, color] of [[30, 150, 140, 330, '#a6afae'], [12, 120, 820, 960, '#b4bcba'], [60, 200, 1460, 1600, '#a2abaa']] as const) onBank(x0, x1, z0, z1, 0.18, color);
  buildSunsetStreetscape(ground, props);
  return {
    ground: ground.geometry().scale(SCALE, SCALE, SCALE), props: props.geometry().scale(SCALE, SCALE, SCALE),
    shadowBoxes: [
      { min: [SUNSET_ROOF_BACK, -12, SUNSET_ROOF_Z0] as Vec3, max: [0, 0, SUNSET_ROOF_Z1] as Vec3 },
      { min: [-8, -85, SUNSET_ROOF_Z0] as Vec3, max: [0, -10, SUNSET_ROOF_Z1] as Vec3 },
      ...[400, 575, 1320].map(z => ({ min: [SUNSET_BANK_END - 105, lower, z - 54] as Vec3, max: [SUNSET_BANK_END - 13, lower + 145, z + 54] as Vec3 })),
      { min: [SUNSET_ROOF_BACK - 38, -260, SUNSET_ROOF_Z0 - 18] as Vec3, max: [SUNSET_ROOF_BACK + 5, 82, SUNSET_ROOF_Z1 + 18] as Vec3 },
    ].map(box => ({ min: worldPoint(box.min), max: worldPoint(box.max) })),
  };
}

export class Sunset3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildSunsetGeometry,
      laneZ: layout.SUNSET_LANE_Z,
      ground: layout.sunsetGround,
      grade: layout.SUNSET_GRADE,
      run: layout.SUNSET_BANK_END,
      drop: layout.SUNSET_DROP,
      framing: 0.82,
      streetProps: SUNSET_STREET_PROPS,
      tripods: {
        bottom: { u: (SUNSET_BANK_END + 22 * FOOT) * SCALE, z: -12 * FOOT * SCALE, height: (-SUNSET_DROP + 3 * FOOT) * SCALE, frame: 24 * FOOT, place: 0.44 },
        side: { u: 13 * FOOT * SCALE, z: -32 * FOOT * SCALE, height: (-SUNSET_DROP + 6 * FOOT) * SCALE, frame: 27 * FOOT, place: 0.48 },
        top: { u: -4 * FOOT * SCALE, z: -9 * FOOT * SCALE, height: 8 * FOOT * SCALE, frame: 22 * FOOT, place: 0.48 },
      },
    });
  }
}

export const buildSunset3D = () => new Sunset3D();
