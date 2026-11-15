import type { Bake } from '../../three/bake';
import { NO_INK } from '../../three/bake';
import { hash2 } from '../setKit';
import { EMAGE_DROP, EMAGE_FOOT as F, EMAGE_RIVER_WIDTH, EMAGE_WATER_EDGE, EMAGE_WATER_Y, emageGround } from './emageLayout';
import { face, flat, foliage, mixHex, profile, rock, tag } from './emageKit';
import * as PAINT from './emagePalette';
import { disc } from './emageWear';

/**
 * The South Platte below the trail (refs 02, 06, 23-28, 44, 63, 77-80): a calm, darker pool held up behind the
 * boulder weir just downstream of the bridge, white water breaking below it into patches and streaks, then
 * olive running water; angular riprap at both edges; Commons Park's bank and lawns across it. The water is
 * drawn as props (the bank physically goes on down to the bed, so a board that gets away sinks from sight), on
 * the look's glass: it mirrors the sky and the far trees, more at a glance, and shows its own dark body
 * square-on.
 */

const LOWER = -EMAGE_DROP;
const FAR_BANK = EMAGE_WATER_EDGE + EMAGE_RIVER_WIDTH;
/** How far the river runs either way, past everything a camera sees. */
const RIVER_Z0 = -420 * F, RIVER_Z1 = 350 * F;
const WATER = tag('glass');
/** The pool behind the weir stands this much higher than the river below it. */
const POOL_RISE = 1.5 * F;
/** Foam lies on the water, a hair over it. */
const FOAM_LIFT = 0.35;

/**
 * The weir's crest, in feet: from the near bank at about (64, 32) to the far bank, about 25 ft downstream of the
 * bridge's centre line all the way (aerial 21), bowing a little upstream in the middle.
 */
const crestZ = (x: number) => {
  const t = (x / F - 64) / 122;
  return (32 + 45 * t + 4 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))) * F;
};

export function buildRiver(ground: Bake, props: Bake, decals: Bake) {
  buildWater(props);
  buildWeir(props, decals);
  buildRiprap(props);
  buildFarBank(ground, props);
}

/** The running water below the weir and the pool above it, in strips across the river so the pool can follow the crest. */
function buildWater(props: Bake) {
  const x0 = EMAGE_WATER_EDGE - 1 * F, x1 = FAR_BANK + 2 * F, strips = 12;
  for (let i = 0; i < strips; i++) {
    const a = x0 + (x1 - x0) * i / strips, c = x0 + (x1 - x0) * (i + 1) / strips;
    face(props, [a, EMAGE_WATER_Y, RIVER_Z0], [a, EMAGE_WATER_Y, crestZ(a)], [c, EMAGE_WATER_Y, crestZ(c)], [c, EMAGE_WATER_Y, RIVER_Z0], PAINT.WATER, [0, 1, 0], WATER);
    face(props, [a, EMAGE_WATER_Y + POOL_RISE, crestZ(a)], [a, EMAGE_WATER_Y + POOL_RISE, RIVER_Z1], [c, EMAGE_WATER_Y + POOL_RISE, RIVER_Z1], [c, EMAGE_WATER_Y + POOL_RISE, crestZ(c)], PAINT.POOL, [0, 1, 0], WATER);
  }
}

/**
 * The weir: grey-brown boulders two to four feet across packed in a line across the river, a second staggered
 * row below it and a few standing proud; the water pouring over them white at the crest, breaking below into
 * patches and streaks that thin out downstream.
 */
function buildWeir(props: Bake, decals: Bake) {
  const from = 62 * F, to = 188 * F;
  const rocks = [PAINT.WEIR_ROCK, PAINT.WEIR_ROCK_PALE, PAINT.WEIR_ROCK_DARK];
  // The crest row, packed shoulder to shoulder, then the row below it and the ones standing proud.
  for (let x = from, i = 0; x < to; i++) {
    const size = (1.1 + 0.9 * hash2(i, 0, 52)) * F;
    const z = crestZ(x) + (hash2(i, 0, 53) - 0.5) * 0.8 * F;
    const proud = hash2(i, 0, 54) > 0.86;
    rock(props, x, EMAGE_WATER_Y + (proud ? 0.9 : 0.35) * F, z, size, size * (proud ? 0.9 : 0.6), size * 0.85, rocks[i % 3], 500 + i);
    if (hash2(i, 0, 55) > 0.45) {
      const below = (1.7 + 1.2 * hash2(i, 0, 56)) * F, small = size * (0.6 + 0.3 * hash2(i, 0, 57));
      rock(props, x + 0.6 * size, EMAGE_WATER_Y + 0.1 * F, z - below, small, small * 0.55, small * 0.9, rocks[(i + 1) % 3], 600 + i);
    }
    x += size * (1.25 + 0.3 * hash2(i, 0, 58));
  }
  // White water: a dense band pouring off the crest, ragged on its lower edge, on the open water between the banks.
  const water0 = EMAGE_WATER_EDGE + 3 * F, water1 = FAR_BANK - 3 * F;
  for (let i = 0; i < 40; i++) {
    const x = water0 + (water1 - water0) * (i + 0.5) / 40;
    // Kept below the crest everywhere under it (a ragged disc reaches 1.18 of its size; the crest slopes).
    const length = (3 + 5 * hash2(i, 0, 61)) * F, r = (2.2 + 0.8 * hash2(i, 0, 62)) * F;
    disc(decals, x, crestZ(x) - 1.6 * F - length * 0.6, EMAGE_WATER_Y + FOAM_LIFT, r, PAINT.FOAM, PAINT.FOAM, NO_INK, 30 + i, 0.3, length * 0.5 / r, 9);
  }
  // Below it, the foam breaking up: patches and streaks drawn out downstream, thinner and greener the farther
  // they go, none in rows.
  for (let i = 0; i < 70; i++) {
    const x = water0 + (water1 - water0) * hash2(i, 0, 63);
    const reach = hash2(i, 0, 64) ** 1.3;
    const size = (0.6 + 1.6 * hash2(i, 0, 65) * (1 - 0.5 * reach)) * F;
    const down = Math.max((5 + 32 * reach) * F, size * (1.8 + 3.5 * reach) * 1.25 + 1.6 * F);
    const color = mixHex(PAINT.FOAM, PAINT.FOAM_FADING, Math.min(1, reach * 1.4));
    disc(decals, x, crestZ(x) - down, EMAGE_WATER_Y + FOAM_LIFT + 0.04, size, color, color, NO_INK, 120 + i, 0.45, 1.8 + 3.5 * reach, 7);
  }
}

/** Riprap: angular stone heaped at both water's edges, thicker at the near bank the cameras look down. */
function buildRiprap(props: Bake) {
  for (let i = 0; i < 74; i++) {
    const z = (-140 + i * 3.4 + 2 * hash2(i, 0, 61)) * F;
    const x = EMAGE_WATER_EDGE - (0.5 + 3.5 * hash2(i, 0, 63)) * F;
    const size = (0.8 + 1.1 * hash2(i, 0, 62)) * F;
    const color = [PAINT.RIPRAP, PAINT.WEIR_ROCK_DARK, PAINT.WEIR_ROCK_PALE][i % 3];
    rock(props, x, Math.max(emageGround(x), EMAGE_WATER_Y) + size * 0.15, z, size, size * 0.6, size * 0.9, color, 700 + i);
  }
  for (let i = 0; i < 34; i++) {
    const z = (-200 + i * 9 + 5 * hash2(i, 0, 66)) * F;
    const size = (1.2 + 1.2 * hash2(i, 0, 67)) * F;
    rock(props, FAR_BANK + (hash2(i, 0, 68) - 0.3) * 3 * F, EMAGE_WATER_Y + size * 0.2, z, size, size * 0.6, size, PAINT.RIPRAP, 800 + i);
  }
}

/** Commons Park's bank across the river, rising to its mown lawns, soft mounds and a pale curving path. */
function buildFarBank(ground: Bake, props: Bake) {
  const farTop = FAR_BANK + 14 * F;
  const rise = (x: number) => EMAGE_WATER_Y - 2 * F + (LOWER - 1 * F - EMAGE_WATER_Y + 2 * F) * Math.min(1, Math.max(0, (x - FAR_BANK + 3 * F) / (17 * F)));
  profile(ground, FAR_BANK - 3 * F, farTop, RIVER_Z0, RIVER_Z1, rise, () => PAINT.FAR_SLOPE, 4, tag('grass'));
  flat(ground, farTop, farTop + 500 * F, RIVER_Z0, RIVER_Z1, LOWER - 1 * F, PAINT.FAR_LAWN, tag('grass'));
  for (let i = 0; i < 32; i++) {
    const z0 = (-420 + i * 24) * F, z1 = z0 + 24 * F;
    const x0 = farTop + (35 + 12 * Math.sin(i / 5)) * F, x1 = farTop + (35 + 12 * Math.sin((i + 1) / 5)) * F;
    face(ground, [x0, LOWER - 0.9 * F, z0], [x1, LOWER - 0.9 * F, z1], [x1 + 8 * F, LOWER - 0.9 * F, z1], [x0 + 8 * F, LOWER - 0.9 * F, z0], PAINT.FAR_PATH);
  }
  // Low, broad lawn mounds, rounded enough not to read as facets.
  for (let i = 0; i < 5; i++) {
    const z = (-250 + i * 105 + 30 * hash2(i, 0, 1701)) * F;
    foliage(props, farTop + (95 + 45 * hash2(i, 0, 1702)) * F, LOWER - 1.6 * F, z, (40 + 15 * hash2(i, 0, 1703)) * F, 4 * F, (38 + 12 * hash2(i, 0, 1704)) * F, mixHex(PAINT.FAR_LAWN, PAINT.FAR_SLOPE, 0.3 * hash2(i, 0, 1705)), 1700 + i, tag('grass'), 4, 10);
  }
}
