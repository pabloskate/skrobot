import type { Vec3 } from '../../camera/view';
import { Bake } from '../../three/bake';
import { hash2 } from '../setKit';
import { EMAGE_FOOT as F, EMAGE_WATER_Y } from './emageLayout';
import { face, frame, picketPanel, prism, tag, tube, type ShadowBox } from './emageKit';
import { wearFace } from './emageWear';
import * as PAINT from './emagePalette';

/**
 * What stands round the stairs: the cable-stayed bridge over the trail and the South Platte, the two apartment
 * buildings either side of the old 16th Street corridor, and downtown beyond the park. Laid out in feet along
 * each one's own axis (`frame`), from the aerials and photographs in SITE_PLAN.md.
 */

/* ----- The bridge ----- */

/** The deck's centre line leaves the plaza beside the bench and heads off 22° to the rail side of the stairs. */
export const bridgePoint = frame(-10, 29, Math.cos(22 * Math.PI / 180), Math.sin(22 * Math.PI / 180));
const BRIDGE_LENGTH = 230;
/** The masts stand this far along the deck, where it widens round them. */
const MAST_AT = 115;
/** Deck sections, each one strip of timber, its cross beam, girders and guards. */
const DECK_SECTION = 10;
/** Lengthwise strips of boards across the deck. */
const DECK_STRIPS = 8;

/** The deck's slight rise to mid-span, in feet over the plaza. */
const deckRise = (u: number) => 0.8 * Math.sin(Math.PI * u / BRIDGE_LENGTH);
/** Half the deck's width: six feet, widening to nine round the masts. */
const deckHalfWidth = (u: number) => 6 + 3 * Math.max(0, 1 - Math.abs(u - MAST_AT) / 22);

export function buildBridge(props: Bake, mesh: Bake, shadows: ShadowBox[]) {
  const p = bridgePoint;
  for (let u = 0; u < BRIDGE_LENGTH; u += DECK_SECTION) {
    const end = Math.min(BRIDGE_LENGTH, u + DECK_SECTION);
    const rise = deckRise(u), riseEnd = deckRise(end), half = deckHalfWidth(u), halfEnd = deckHalfWidth(end);
    // Grey weathered timber boards laid lengthwise, a few boards' width to a strip, each strip its own tone.
    for (let k = 0; k < DECK_STRIPS; k++) {
      const v0 = -1 + 2 * k / DECK_STRIPS, v1 = -1 + 2 * (k + 1) / DECK_STRIPS;
      const tone = PAINT.DECK_TIMBER[Math.floor(hash2(k, u, 41) * PAINT.DECK_TIMBER.length)];
      face(props, p(u, rise, v0 * half), p(end, riseEnd, v0 * halfEnd), p(end, riseEnd, v1 * halfEnd), p(u, rise, v1 * half), tone, [0, 1, 0], tag('stucco'));
    }
    // Dark cross beams and round edge girders beneath the timber deck.
    prism(props, p, u, u + 0.7, -half, half, rise - 1.6, rise - 0.4, PAINT.DECK_SIDE, 'metal');
    for (const side of [-1, 1]) {
      tube(props, [p(u, rise - 1.3, side * half), p(end, riseEnd - 1.3, side * halfEnd)], F, PAINT.BRIDGE_SPINE);
      tube(props, [p(u, rise + 3.5, side * (half + 0.4)), p(end, riseEnd + 3.5, side * (halfEnd + 0.4))], 0.1 * F, PAINT.BRIDGE_GUARD);
      picketPanel(mesh, p(u, rise + 0.1, side * half), p(end, riseEnd + 0.1, side * halfEnd), 3.4 * F, (end - u) / 0.75);
    }
  }
  // Short conservative boxes follow the diagonal over the trail; no giant diagonal AABB.
  for (const u of [25, 37, 49]) {
    const a = p(u, -2.4, -6), b = p(u + 12, 0.8, 6);
    shadows.push({ min: [a[0] - 4.5 * F, a[1], a[2]], max: [b[0] + 4.5 * F, b[1], b[2]] });
  }
  for (const side of [-1, 1]) buildMast(props, side);
  buildAbutment(props);
}

/** One white tusk outside a deck edge, its fan of stays, and the tapered concrete pier it stands on. */
function buildMast(props: Bake, side: number) {
  const p = bridgePoint;
  const spine = [p(MAST_AT, -1, side * 8), p(MAST_AT, 12, side * 9), p(114, 27, side * 12), p(111, 40, side * 16), p(107, 51, side * 20)];
  props.tube(spine, [1.25, 1.1, 0.8, 0.45, 0.12].map(v => v * F), { color: PAINT.MAST }, tag('metal'), 8, true);
  for (const offset of [-90, -70, -50, -30, 30, 50, 70, 90]) {
    tube(props, [p(112, 38 + Math.abs(offset) / 9, side * 16), p(MAST_AT + offset, deckRise(MAST_AT + offset), side * 6)], 0.035 * F, PAINT.STAY, undefined, 5);
  }
  // Lugs on the mast where the stays meet it.
  for (const offset of [30, 50, 70, 90]) {
    const h = 38 + offset / 9;
    prism(props, p, 111.3, 112.7, side * 16 - 0.7, side * 16 + 0.7, h - 0.5, h + 0.5, PAINT.MAST, 'metal');
  }
  // The pier: four tapered faces of cast concrete, broader at the river bed, weathered at the waterline.
  const bottom = EMAGE_WATER_Y / F - 3;
  const centre = p(MAST_AT, -6, side * 8);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, b = (i + 1) * Math.PI / 2;
    const foot0 = p(MAST_AT + 4 * Math.cos(a), bottom, side * 8 + 4 * Math.sin(a)), foot1 = p(MAST_AT + 4 * Math.cos(b), bottom, side * 8 + 4 * Math.sin(b));
    const top1 = p(MAST_AT + 1.7 * Math.cos(b), -1.5, side * 8 + 1.7 * Math.sin(b)), top0 = p(MAST_AT + 1.7 * Math.cos(a), -1.5, side * 8 + 1.7 * Math.sin(a));
    wearFace(props, foot0, foot1, top1, top0, outwardNormal([foot0, foot1, top1], centre), PAINT.PIER_SIDE, tag('concrete'), 4000 * F + (side + 1) * 40 * F + i * 9 * F);
  }
}

/**
 * The west abutment in the bank: a pale cast block under the deck, with the curved retaining wall of red
 * sandstone blocks beside it, laid in courses (refs 38, 39), and the low sandstone blocks at the mouth (ref 29).
 */
function buildAbutment(props: Bake) {
  const p = bridgePoint;
  const corner = (u: number, y: number, v: number) => p(u, y, v);
  const centre = p(12, -5, 0);
  for (const [u0, v0, u1, v1] of [[0, -5, 24, -5], [24, -5, 24, 5], [24, 5, 0, 5]] as const) {
    const foot0 = corner(u0, -9, v0), foot1 = corner(u1, -9, v1), top1 = corner(u1, -1.5, v1), top0 = corner(u0, -1.5, v0);
    wearFace(props, foot0, foot1, top1, top0, outwardNormal([foot0, foot1, top1], centre), PAINT.PIER_SIDE, tag('concrete'), 4300 * F + u0 * F + v0 * F);
  }
  // The retaining wall's curve, in blocks a few feet long, three courses under a top that falls with the bank.
  const segments = 10, course = 1.3;
  for (let i = 0; i < segments; i++) {
    const u = i * 2.4, v = 8 + 7 * (1 - Math.cos(i * Math.PI / 18));
    const top = -0.25 * u;
    for (let k = 0; k < 3; k++) {
      const y1 = top - k * course, y0 = k === 2 ? -10 : y1 - course + 0.04;
      const shift = k % 2 ? 1.2 : 0;
      prism(props, p, u + shift * 0.5, u + 2.45 + shift * 0.5, v, v + 1.5, y0, y1, PAINT.WALL_STONE[(i * 3 + k * 2) % PAINT.WALL_STONE.length]);
    }
  }
  for (const [v, k] of [[-8, 0], [8, 1]] as const) prism(props, p, -5, 1, v - 1, v + 1, 0, 1.5, PAINT.WALL_STONE[k]);
}

/** A face's normal from three of its corners, turned away from `centre`. */
function outwardNormal([a, b, c]: Vec3[], centre: Vec3): Vec3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const away = (a[0] - centre[0]) * n[0] + (a[1] - centre[1]) * n[1] + (a[2] - centre[2]) * n[2];
  if (away < 0) n = [-n[0], -n[1], -n[2]];
  const length = Math.hypot(...n) || 1;
  return [n[0] / length, n[1] / length, n[2] / length];
}

/* ----- The apartments ----- */

/**
 * The four long facades the cameras see, as [x, z] of the corner, [x, z] of the far end, and which side of
 * that line the street is (1 left, -1 right): the south building's plaza and river faces, then the north's.
 */
export const APARTMENT_FACES = [
  [-62, 73, -330, -80, 1], [-62, 73, -100, 240, -1],
  [-45, -62, -220, -135, -1], [-45, -62, -25, -230, 1],
] as const;
/** Four storeys to the eaves, each eleven feet. */
const EAVES = 46;
const STOREY = 11;
/** How deep a wing is, from its facade to its back wall. */
const WING_DEPTH = 32;

export function buildApartments(props: Bake, _mesh: Bake, shadows: ShadowBox[]) {
  APARTMENT_FACES.forEach(([x, z, endX, endZ, side], facade) => {
    const length = Math.hypot(endX - x, endZ - z), p = frame(x, z, endX - x, endZ - z);
    const out = p(0, 0, side), origin = p(0, 0, 0);
    const normal: Vec3 = [(out[0] - origin[0]) / F, 0, (out[2] - origin[2]) / F];
    const ahead = p(1, 0, 0), along: Vec3 = [(ahead[0] - origin[0]) / F, 0, (ahead[2] - origin[2]) / F];
    const bays = Math.ceil(length / 20), step = length / bays;
    for (let bay = 0; bay < bays; bay++) buildBay(props, p, bay * step, (bay + 1) * step, bay, facade, side, normal, length);
    // The roof's hipped ends, meeting the ridge where it starts and stops.
    face(props, p(0, EAVES, 0), p(0, EAVES, -side * WING_DEPTH), p(HIP, RIDGE, -side * 16), p(HIP, RIDGE, -side * 16), PAINT.ROOF, [-along[0] * 0.5, 1, -along[2] * 0.5], tag('roofing'));
    face(props, p(length, EAVES, 0), p(length, EAVES, -side * WING_DEPTH), p(length - HIP, RIDGE, -side * 16), p(length - HIP, RIDGE, -side * 16), PAINT.ROOF, [along[0] * 0.5, 1, along[2] * 0.5], tag('roofing'));
    const corners = [p(0, 0, 0), p(length, 0, 0), p(0, 0, -side * WING_DEPTH), p(length, 0, -side * WING_DEPTH)];
    shadows.push({
      min: [Math.min(...corners.map(a => a[0])), 0, Math.min(...corners.map(a => a[2]))],
      max: [Math.max(...corners.map(a => a[0])), EAVES * F, Math.max(...corners.map(a => a[2]))],
    });
  });
  // A plain block closing the corridor in the far distance.
  prism(props, frame(-330, -190, 0, 1), 0, 115, -20, 20, 0, EAVES, PAINT.APARTMENT);
}

/** The ridge's height, and how far in from each end the hips bring it. */
const RIDGE = 55;
const HIP = 16;

/**
 * How a bay is finished (refs 01, 05, 14, 48, 56): most are pale grey-white, some mid-grey, every fifth or so
 * charcoal, the odd one cream; charcoal bays carry stacked balconies, pale ones French windows with Juliet
 * guards or plain pairs; a darker base on some.
 */
function bayStyle(bay: number, facade: number) {
  const pick = hash2(bay, facade, 31);
  const tone = bay % 5 === 2 ? 'charcoal' : bay % 5 === 4 ? 'grey' : pick > 0.86 ? 'cream' : 'pale';
  const wall = { charcoal: PAINT.DARK_BAY, grey: PAINT.WALL_GREY, cream: PAINT.WALL_CREAM, pale: PAINT.WALL_PALE }[tone];
  const windows = tone === 'charcoal' ? 'balconies' : tone === 'pale' && hash2(bay, facade, 32) < 0.45 ? 'juliet' : 'pairs';
  const base = tone === 'charcoal' || hash2(bay, facade, 33) < 0.25 ? (hash2(bay, facade, 34) < 0.5 ? PAINT.STONE_BASE : PAINT.DARK_BAY) : null;
  return { tone, wall, windows, base };
}

/** One bay of a facade, `u` to `end` along it: its wall, base, windows, balconies or guards, eave and its share of the roof. */
function buildBay(props: Bake, p: ReturnType<typeof frame>, u: number, end: number, bay: number, facade: number, side: number, normal: Vec3, length: number) {
  const across: Vec3 = [normal[2], 0, -normal[0]];
  const style = bayStyle(bay, facade);
  // Every third bay steps forward a couple of feet.
  const front = side * (bay % 3 === 1 ? 2 : 0);
  const out = (v: number) => front + side * v;
  const panel = (u0: number, u1: number, y0: number, y1: number, v: number, color: string, surface: 'stucco' | 'metal' | 'glass' | 'concrete') =>
    face(props, p(u0, y0, out(v)), p(u1, y0, out(v)), p(u1, y1, out(v)), p(u0, y1, out(v)), color, normal, tag(surface));
  panel(u, end, 0, EAVES, 0, style.wall, 'stucco');
  // Facade returns stop at the shared front plane, avoiding overlapping wing endcaps.
  for (const edge of [u, end]) face(props, p(edge, 0, 0), p(edge, 0, front), p(edge, EAVES, front), p(edge, EAVES, 0), style.wall, across, tag('stucco'));
  if (style.base) panel(u, end, 0, 10.2, 0.05, style.base, 'concrete');
  const mid = (u + end) / 2;
  for (let floor = 0; floor < 4; floor++) {
    const y = 2.5 + floor * STOREY;
    if (style.windows === 'balconies') {
      // Three narrow windows, the middle a door onto a small balcony on the upper floors.
      for (const offset of [-5.6, -1.6, 2.4]) {
        const tall = offset === -1.6 && floor > 0;
        panel(mid + offset, mid + offset + 3.2, tall ? y - 1.6 : y, y + 7, 0.08, PAINT.FRAME_DARK, 'metal');
        panel(mid + offset + 0.22, mid + offset + 2.98, (tall ? y - 1.6 : y) + 0.22, y + 6.78, 0.1, PAINT.WINDOW, 'glass');
      }
      if (floor > 0) {
        const slab = y - 1.9, reach = 3.6;
        prism(props, p, mid - 4.2, mid + 4.2, Math.min(out(0), out(reach)), Math.max(out(0), out(reach)), slab - 0.45, slab, PAINT.BALCONY_SIDE, 'concrete');
        panel(mid - 4.2, mid + 4.2, slab, slab + 3.3, reach, PAINT.BALCONY_RAIL, 'metal');
        for (const edge of [mid - 4.2, mid + 4.2]) face(props, p(edge, slab, out(0)), p(edge, slab, out(reach)), p(edge, slab + 3.3, out(reach)), p(edge, slab + 3.3, out(0)), PAINT.BALCONY_RAIL, across, tag('metal'));
      }
    } else {
      // A pair of windows in dark frames: tall French windows behind a Juliet guard, or plain sashes.
      const french = style.windows === 'juliet' && floor > 0;
      for (const offset of [-6.2, 1.4]) {
        const bottom = french ? y - 1.4 : y, width = french ? 4.4 : 4.8;
        panel(mid + offset, mid + offset + width, bottom, y + 7, 0.08, PAINT.FRAME_DARK, 'metal');
        panel(mid + offset + 0.25, mid + offset + width - 0.25, bottom + 0.25, y + 6.75, 0.1, PAINT.WINDOW, 'glass');
        if (french) panel(mid + offset - 0.3, mid + offset + width + 0.3, bottom + 0.2, bottom + 3.3, 0.55, PAINT.BALCONY_RAIL, 'metal');
      }
    }
  }
  // The eave: a white fascia and a shallow soffit along the bay's top.
  prism(props, p, u, end, Math.min(out(-0.2), out(1.1)), Math.max(out(-0.2), out(1.1)), EAVES - 1.1, EAVES + 0.1, PAINT.TRIM, 'stucco');
  // The roof plane runs back to a continuous ridge, front slope then back.
  const ridgeFrom = Math.max(u, HIP), ridgeTo = Math.min(end, length - HIP);
  face(props, p(u, EAVES, out(1.1)), p(end, EAVES, out(1.1)), p(ridgeTo, RIDGE, -side * 16), p(ridgeFrom, RIDGE, -side * 16), PAINT.ROOF, [normal[0] * 0.5, 1, normal[2] * 0.5], tag('roofing'));
  face(props, p(u, EAVES, -side * WING_DEPTH), p(end, EAVES, -side * WING_DEPTH), p(ridgeTo, RIDGE, -side * 16), p(ridgeFrom, RIDGE, -side * 16), PAINT.ROOF, [-normal[0] * 0.5, 1, -normal[2] * 0.5], tag('roofing'));
  // Cross gables with white pediments break the long eaves on the stepped-forward bays; pale chimneys behind.
  if (bay % 3 === 1) {
    const a = p(u + 2, EAVES, out(1.15)), b = p(end - 2, EAVES, out(1.15)), peak = p(mid, 52, out(1.15));
    face(props, a, b, peak, peak, PAINT.TRIM, normal, tag('stucco'));
    face(props, a, peak, p(mid, 53, -side * 12), p(u + 2, 49, -side * 12), PAINT.ROOF, [0, 1, 0], tag('roofing'));
    face(props, peak, b, p(end - 2, 49, -side * 12), p(mid, 53, -side * 12), PAINT.ROOF, [0, 1, 0], tag('roofing'));
    prism(props, p, u + 8, u + 12, Math.min(-side * 18, -side * 14), Math.max(-side * 18, -side * 14), 49, 59, PAINT.CHIMNEY);
  }
}

/* ----- Downtown ----- */

/** Mid-rise blocks beyond the park, the pair of teal glass slabs, taller towers further right: [x, z, width, height, paint]. */
const SKYLINE = [
  [900, -220, 90, 70, PAINT.TOWER_WARM], [950, 0, 100, 85, PAINT.TOWER_RED], [920, 220, 100, 65, PAINT.TOWER_CREAM],
  [1000, 450, 110, 265, PAINT.TOWER_TEAL], [1030, 590, 110, 275, PAINT.TOWER_TEAL],
  [1400, 750, 95, 390, PAINT.TOWER_GREY], [1500, 930, 85, 340, PAINT.TOWER_SLATE],
] as const;

export function buildSkyline(props: Bake) {
  for (const [x, z, width, height, color] of SKYLINE) {
    const p = frame(x, z, 0, 1);
    // Quiet masses in their own tones (the haze takes them far off); the mid-rise blocks on a darker podium.
    const tower = height > 200;
    prism(props, p, 0, width, 0, 55, -11, height, color);
    if (!tower) face(props, p(0, -11, 55.1), p(width, -11, 55.1), p(width, 14, 55.1), p(0, 14, 55.1), PAINT.TOWER_PODIUM, [-1, 0, 0], tag('stucco'));
  }
  buildPylon(props);
}

/** One lattice power pylon beyond the park. */
function buildPylon(props: Bake) {
  const p = frame(650, 320, 1, 0);
  for (const side of [-1, 1]) tube(props, [p(side * 14, -10, 0), p(side * 3, 125, 0)], 0.4 * F, PAINT.TOWER_GREY);
  for (let y = 0; y < 110; y += 20) {
    tube(props, [p(-12 + y / 12, y, 0), p(12 - (y + 20) / 12, y + 20, 0)], 0.2 * F, PAINT.TOWER_GREY);
    tube(props, [p(12 - y / 12, y, 0), p(-12 + (y + 20) / 12, y + 20, 0)], 0.2 * F, PAINT.TOWER_GREY);
  }
  for (const y of [80, 100, 118]) tube(props, [p(-20, y, 0), p(20, y, 0)], 0.4 * F, PAINT.TOWER_GREY);
}
