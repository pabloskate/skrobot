import type { ReactElement } from 'react';
import { mixHex } from './math';
import { seeded } from './setKit';

/**
 * The waterfront set's far panorama: hills, a downtown lit gold by the sun
 * behind the viewer, the far shore with its clock tower and port cranes, a
 * suspension bridge, and clouds. All of it sits at infinity, so it's drawn
 * once, in panorama units (viewBox units at the stock lens, the horizon at
 * y = 0, up negative), and every frame only slides and scales the finished
 * tiles. Each tile repeats every `period` and carries its own reflection,
 * mirrored under the horizon and broken into ripples, for the bay.
 *
 * Shading follows the scene's sun (behind the viewer, high on the right):
 * the faces toward the camera are in soft light, the faces turned right
 * catch it full, and a few windows blaze where they mirror it.
 */

export interface PanoramaTile {
  key: string;
  period: number;
  /** Panorama u of the tile's local x = 0 in the stock view. */
  origin: number;
  /** Parallax with the street, as a share of the plaza's own scroll. */
  drift: number;
  art: ReactElement;
  /** How far up and down the art reaches. */
  artSpan: Span;
  /** Its mirror image on the bay; drawn under the horizon, before the plaza covers the shore. */
  reflection: ReactElement | null;
  reflectionSpan: Span;
}

/** A vertical extent in panorama units: top (up is negative), then bottom. */
export type Span = readonly [top: number, bottom: number];

const NO_SPAN: Span = [0, 0];

/**
 * How far up and down path data reaches, in its own units. A curve counts
 * its control point and an arc its whole radius, so this can only overshoot.
 */
export function spanOf(paths: readonly string[]): Span {
  let top = Infinity;
  let bottom = -Infinity;
  const see = (y: number, pad = 0) => {
    top = Math.min(top, y - pad);
    bottom = Math.max(bottom, y + pad);
  };
  for (const d of paths) {
    const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
    let i = 0;
    let cmd = '';
    let y = 0;
    let startY = 0;
    const next = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      const to = (dy: number) => (rel ? y + dy : dy);
      switch (cmd.toUpperCase()) {
        case 'M':
          next();
          y = to(next());
          startY = y;
          // Pairs after a move are lines.
          cmd = rel ? 'l' : 'L';
          break;
        case 'L':
          next();
          y = to(next());
          break;
        case 'H':
          next();
          break;
        case 'V':
          y = to(next());
          break;
        case 'Q':
          next();
          see(to(next()));
          next();
          y = to(next());
          break;
        case 'A': {
          next();
          const ry = Math.abs(next());
          next();
          next();
          next();
          see(y, ry);
          next();
          y = to(next());
          see(y, ry);
          break;
        }
        case 'Z':
          y = startY;
          // Anything after a close has to start with a command.
          cmd = '';
          break;
        default:
          throw new Error(`spanOf: unsupported path command "${cmd}" in ${d.slice(0, 40)}`);
      }
      see(y);
    }
  }
  return top <= bottom ? [top, bottom] : NO_SPAN;
}

const f = (n: number) => +n.toFixed(2);
const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
const poly = (pts: Array<[number, number]>) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('') + 'Z';
/** Clockwise, like `rect`, so overlapping shapes in one path add up instead of cutting holes. */
const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0Z`;

/** Path data gathered per paint, then painted in the order the paints were declared. */
class Layer {
  private readonly d = new Map<string, string[]>();
  constructor(private readonly paints: ReadonlyArray<readonly [name: string, fill: string]>) {
    for (const [name] of paints) this.d.set(name, []);
  }
  add(name: string, d: string) {
    const list = this.d.get(name);
    if (!list) throw new Error(`unknown paint ${name}`);
    list.push(d);
  }
  span(): Span {
    return spanOf([...this.d.values()].flat());
  }
  render(key: string, opacity?: number): ReactElement {
    return (
      <g key={key} opacity={opacity}>
        {this.paints.map(([name, fill]) => {
          const d = this.d.get(name)!.join('');
          return d ? <path key={name} d={d} fill={fill} /> : null;
        })}
      </g>
    );
  }
}

// ---------- Palette ----------

export const BAY = {
  skyTop: '#8f7fd8',
  skyHigh: '#b79ee0',
  belt: '#efb3c8',
  skyLow: '#f9c8b8',
  horizon: '#f6d5c9',
  sun: '#fff1d8',
  earthShadow: '#c3aedb',
  cloudTop: '#fff3e8',
  cloudMid: '#ffe1d5',
  cloudBottom: '#eab3c8',
  cloudBase: '#dca6c3',
  hillFar: '#dcbbd6',
  hillNear: '#cfa8cb',
  waterHorizon: '#f0c4c4',
  waterHigh: '#d7accb',
  waterMid: '#a99ad0',
  waterNear: '#7f7cc4',
  waterDeep: '#6a68b6',
  gull: '#4f4380',
} as const;

const FAR = { face: ['#ddb3ca', '#d8adc6'], side: '#efc8c4', rim: '#f5d6cc', detail: '#d3a8c3', light: '#f3909c' };
const MID = {
  face: ['#c497bf', '#bd90bb', '#cba0c3'],
  side: '#f0bfab',
  rim: '#ffe1c8',
  window: '#ab80ad',
  sideWindow: '#e3a996',
  glint: '#ffe0a0',
  detail: '#a57aa8',
  light: '#ff5a6e',
};
const SHORE = {
  face: ['#a984ad', '#b18bb2'],
  side: '#e6ae9c',
  rim: '#f7cdb4',
  window: '#94709c',
  sideWindow: '#d3998d',
  glint: '#ffd78c',
  detail: '#8f6c98',
  land: '#9a789f',
  tree: '#8a7aa6',
  treeLit: '#a796b4',
};
const BRIDGE = { tower: '#d48a78', towerLit: '#f0b293', cable: '#c47d70', deck: '#b37476', deckLit: '#e3a28c' };
const CRANE = '#c6888e';

// ---------- Buildings ----------

type Roof = 'flat' | 'setback' | 'antenna' | 'spire' | 'crown' | 'dome' | 'tank' | 'saw';

interface Building {
  x: number;
  w: number;
  h: number;
  roof: Roof;
  /** Index into the layer's face tones. */
  tone: number;
  /** Panorama y it stands on: 0 for the ground, a roof for a setback. */
  base?: number;
}

interface Look {
  windows: boolean;
  /** Window grid pitch (x, y) and pane size. */
  pitch: [number, number];
  pane: [number, number];
  glintRate: number;
  /** Side face width as a share of the front's. */
  side: number;
}

/**
 * One building: a front face in soft light and a narrower right face in
 * full sun, a bright roof edge, a window grid, and its roof. Windows go dark
 * at random and a few blaze gold.
 */
function building(layer: Layer, b: Building, look: Look, rand: () => number) {
  const sw = Math.max(1.6, b.w * look.side);
  const face = `face${b.tone}`;
  const base = b.base ?? 0;
  const top = base - b.h;
  layer.add(face, rect(b.x, top, b.w, b.h + 1));
  layer.add('side', rect(b.x + b.w, top, sw, b.h + 1));
  layer.add('rim', rect(b.x + b.w, top, sw, 0.9));
  layer.add('rimFront', rect(b.x, top, b.w, 0.6));
  if (look.windows) {
    const [px, py] = look.pitch;
    const [pw, ph] = look.pane;
    const cols = Math.floor((b.w - 2.4) / px);
    const rows = Math.floor((b.h - 5) / py);
    const x0 = b.x + (b.w - (cols - 1) * px - pw) / 2;
    for (let r = 0; r < rows; r++) {
      const y = top + 3 + r * py;
      for (let c = 0; c < cols; c++) {
        const roll = rand();
        if (roll < 0.1) continue;
        layer.add(roll > 1 - look.glintRate ? 'glint' : 'window', rect(x0 + c * px, y, pw, ph));
      }
      if (sw > 3.2 && rand() > 0.25) layer.add('sideWindow', rect(b.x + b.w + sw * 0.3, y, sw * 0.4, ph));
    }
  }
  const cx = b.x + b.w / 2;
  switch (b.roof) {
    case 'setback': {
      const w2 = b.w * 0.62;
      const h2 = Math.max(5, b.h * 0.16);
      building(layer, { ...b, x: cx - w2 / 2, w: w2, h: h2, base: top, roof: 'flat' }, { ...look, windows: false }, rand);
      break;
    }
    case 'antenna':
      layer.add('detail', rect(cx - 0.45, top - 22, 0.9, 22));
      layer.add('detail', rect(cx - 2.2, top - 3, 4.4, 3));
      layer.add('light', circle(cx, top - 22.4, 1.1));
      break;
    case 'spire':
      layer.add(face, poly([[b.x + b.w * 0.18, top], [cx, top - b.w * 0.95], [cx, top]]));
      layer.add('side', poly([[cx, top], [cx, top - b.w * 0.95], [b.x + b.w + sw * 0.6, top]]));
      layer.add('detail', rect(cx - 0.35, top - b.w * 0.95 - 9, 0.7, 9));
      break;
    case 'crown': {
      let w = b.w;
      let y = top;
      for (let i = 0; i < 3; i++) {
        w *= 0.7;
        const h = 4.5 - i;
        layer.add(face, rect(cx - w / 2, y - h, w, h + 0.5));
        layer.add('side', rect(cx + w / 2, y - h, Math.max(1, sw * (0.7 ** (i + 1))), h + 0.5));
        layer.add('rim', rect(cx - w / 2, y - h, w, 0.6));
        y -= h;
      }
      layer.add(face, poly([[cx - w * 0.35, y], [cx, y - 12], [cx + w * 0.35, y]]));
      layer.add('light', circle(cx, y - 12.4, 0.9));
      break;
    }
    case 'dome': {
      const r = b.w * 0.42;
      layer.add(face, `M${f(cx - r)} ${f(top + 0.5)}a${f(r)} ${f(r * 0.8)} 0 0 1 ${f(2 * r)} 0Z`);
      layer.add('side', `M${f(cx + r * 0.2)} ${f(top - r * 0.78)}a${f(r)} ${f(r * 0.8)} 0 0 1 ${f(r * 0.8)} ${f(r * 0.78 + 0.5)}h${f(-r * 0.8)}Z`);
      layer.add('detail', rect(cx - 0.4, top - r * 0.8 - 7, 0.8, 7));
      break;
    }
    case 'tank': {
      const tx = b.x + b.w * (0.25 + rand() * 0.4);
      layer.add('detail', rect(tx - 2.2, top - 4, 0.6, 4));
      layer.add('detail', rect(tx + 1.6, top - 4, 0.6, 4));
      layer.add('detail', rect(tx - 2.6, top - 9, 5.2, 5.4));
      layer.add('detail', poly([[tx - 2.9, top - 9], [tx, top - 11.6], [tx + 2.9, top - 9]]));
      break;
    }
    case 'saw':
      for (let x = b.x; x < b.x + b.w - 3; x += 5) {
        layer.add(face, poly([[x, top + 0.5], [x, top - 3.4], [x + 5, top + 0.5]]));
        layer.add('rim', poly([[x, top - 3.4], [x + 0.9, top - 3.4], [x + 5.2, top + 0.3], [x + 4.3, top + 0.3]]));
      }
      break;
    default:
      break;
  }
}

/**
 * A building's reflection: its two faces mirrored under the horizon in
 * strips that wobble sideways and thin out with depth, like a reflection
 * on a breezy bay. Glints smear into short vertical streaks.
 */
function reflect(layer: Layer, b: Building, look: Look, rand: () => number, glints = true) {
  const sw = Math.max(1.6, b.w * look.side);
  const depth = b.h * 0.85;
  for (let y = 0.6; y < depth; y += 2.3 + y * 0.025) {
    const fade = 1 - y / depth;
    const wobble = (rand() - 0.5) * (1.2 + y * 0.04);
    const shrink = (1 - fade) * b.w * 0.3 * rand();
    const h = 1.1 + rand() * 0.6;
    layer.add(`face${b.tone}`, rect(b.x + wobble + shrink / 2, y, b.w - shrink, h));
    layer.add('side', rect(b.x + b.w + wobble, y, sw * (0.6 + 0.4 * fade), h));
  }
  if (glints && look.windows && rand() > 0.35) {
    const gx = b.x + 1 + rand() * (b.w - 2);
    layer.add('glint', rect(gx, 1 + rand() * depth * 0.4, 0.9, 2.4 + rand() * 3));
  }
}

const PAINTS_FULL = (c: { face: string[]; side: string; rim: string }, extra: ReadonlyArray<readonly [string, string]>) => [
  ...c.face.map((fill, i) => [`face${i}`, fill] as const),
  ['side', c.side] as const,
  ['rimFront', mixHex(c.face[0], c.rim, 0.55)] as const,
  ['rim', c.rim] as const,
  ...extra,
];

/** A row of buildings laid edge to edge from `x0` to `x1`, leaving gaps; heights follow `envelope`. */
function fillRow(
  rand: () => number,
  x0: number,
  x1: number,
  opts: { minW: number; maxW: number; minH: number; maxH: number; gap: number; tones: number; roofs: Roof[]; envelope?: (x: number) => number },
): Building[] {
  const out: Building[] = [];
  let x = x0;
  while (x < x1) {
    const w = opts.minW + rand() * (opts.maxW - opts.minW);
    if (x + w * 1.3 > x1) break;
    const env = opts.envelope ? opts.envelope(x + w / 2) : 1;
    const h = (opts.minH + rand() * (opts.maxH - opts.minH)) * env;
    const roof = rand() < 0.55 ? 'flat' : opts.roofs[Math.floor(rand() * opts.roofs.length)];
    out.push({ x, w, h: Math.max(4, h), roof, tone: Math.floor(rand() * opts.tones) });
    x += w * 1.3 + rand() * opts.gap;
  }
  return out;
}

// ---------- Layers ----------

const SMOOTH = (period: number, waves: Array<[n: number, amp: number, phase: number]>) => (x: number) =>
  waves.reduce((h, [n, amp, phase]) => h + amp * Math.sin((2 * Math.PI * n * x) / period + phase), 0);

function hills(key: string, period: number, origin: number, drift: number, base: number, waves: Array<[number, number, number]>, fill: string): PanoramaTile {
  const height = SMOOTH(period, waves);
  let d = `M0 3`;
  for (let x = 0; x <= period; x += 8) d += `L${x} ${f(-Math.max(2, base + height(x)))}`;
  d += `L${period} 3Z`;
  return { key, period, origin, drift, art: <path d={d} fill={fill} />, artSpan: spanOf([d]), reflection: null, reflectionSpan: NO_SPAN };
}

function farCity(): PanoramaTile {
  const period = 1300;
  const rand = seeded(11);
  const look: Look = { windows: false, pitch: [4, 5], pane: [1.4, 2], glintRate: 0, side: 0.22 };
  const art = new Layer(PAINTS_FULL(FAR, [['detail', FAR.detail], ['light', FAR.light]]));
  // Taller toward the downtown core, which sits behind the mid layer's towers.
  const envelope = (x: number) => 0.45 + 0.75 * Math.exp(-(((x - 700) / 260) ** 2));
  for (const b of fillRow(rand, 0, period, { minW: 9, maxW: 22, minH: 14, maxH: 64, gap: 5, tones: 2, roofs: ['setback', 'antenna', 'spire'], envelope })) {
    building(art, b, look, rand);
  }
  return { key: 'cityFar', period, origin: -520, drift: 0.02, art: art.render('art'), artSpan: art.span(), reflection: null, reflectionSpan: NO_SPAN };
}

/** Downtown: hand-placed landmarks in a crowd of filler towers. */
function midCity(): PanoramaTile {
  const period = 1500;
  const origin = -520;
  const at = (u: number) => u - origin;
  const rand = seeded(29);
  const look: Look = { windows: true, pitch: [3.9, 5.2], pane: [1.5, 2.3], glintRate: 0.07, side: 0.24 };
  const extra = [
    ['window', MID.window], ['sideWindow', MID.sideWindow], ['glint', MID.glint], ['detail', MID.detail], ['light', MID.light],
  ] as const;
  const art = new Layer(PAINTS_FULL(MID, extra));
  const water = new Layer(PAINTS_FULL(MID, [['glint', MID.glint]]));

  const landmarks: Building[] = [
    { x: at(-26), w: 15, h: 66, roof: 'flat', tone: 1 },
    { x: at(-5), w: 15, h: 59, roof: 'flat', tone: 1 },
    { x: at(42), w: 24, h: 90, roof: 'antenna', tone: 0 },
    { x: at(196), w: 22, h: 76, roof: 'dome', tone: 2 },
    { x: at(276), w: 21, h: 84, roof: 'crown', tone: 0 },
  ];
  const fill: Building[] = [];
  const free = (x: number, w: number) =>
    [...landmarks, { x: at(132), w: 36, h: 0, roof: 'flat' as Roof, tone: 0 }, { x: at(372), w: 26, h: 0, roof: 'flat' as Roof, tone: 0 }]
      .every((l) => x + w * 1.3 < l.x - 1 || x > l.x + l.w * 1.3 + 1);
  const core = (x: number) => 0.38 + 0.8 * Math.exp(-(((x - at(150)) / 230) ** 2));
  for (const b of fillRow(rand, 0, period, { minW: 11, maxW: 24, minH: 20, maxH: 62, gap: 3, tones: 3, roofs: ['setback', 'tank', 'antenna'], envelope: core })) {
    if (free(b.x, b.w)) fill.push(b);
  }
  const all = [...fill, ...landmarks].sort((a, b) => a.x - b.x);
  for (const b of all) {
    building(art, b, look, rand);
    reflect(water, b, look, rand);
  }

  // The pyramid: the skyline's signature, catching the sun down its right flank.
  const px = at(150);
  const ph = 116;
  art.add('face0', poly([[px - 17, 1], [px, -ph], [px + 3, -ph + 6], [px + 3, 1]]));
  art.add('side', poly([[px + 3, 1], [px + 3, -ph + 6], [px, -ph], [px + 15, 1]]));
  art.add('face1', poly([[px - 22, 1], [px - 22, -40], [px - 13, -48], [px - 13, 1]]));
  art.add('side', poly([[px + 12, 1], [px + 12, -44], [px + 19, -38], [px + 19, 1]]));
  art.add('detail', rect(px - 0.4, -ph - 14, 0.8, 14));
  art.add('light', circle(px, -ph - 14.4, 1.1));
  for (let y = -ph + 16; y < -4; y += 5.2) {
    const half = (17 * (y + ph)) / ph;
    for (let x = px - half + 2; x < px + 1; x += 3.6) art.add(rand() > 0.93 ? 'glint' : 'window', rect(x, y, 1.3, 2.2));
  }
  for (let y = 1; y < ph * 0.85; y += 2.4 + y * 0.025) {
    const half = (17 * (ph - y * 1.15)) / ph;
    if (half <= 0.5) break;
    const wobble = (rand() - 0.5) * (1.2 + y * 0.04);
    water.add('face0', rect(px - half + wobble, y, half + 3, 1.3));
    water.add('side', rect(px + 3 + wobble, y, Math.max(0, half * 0.85 - 3), 1.3));
  }

  // A tower crane over a building going up.
  const cx = at(372);
  art.add('face2', rect(cx, -40, 22, 41));
  art.add('side', rect(cx + 22, -40, 5, 41));
  art.add('detail', rect(cx + 9, -104, 1.6, 64));
  for (let y = -100; y < -42; y += 6) art.add('detail', poly([[cx + 9, y], [cx + 10.6, y + 6], [cx + 10.6, y + 5.2], [cx + 9, y - 0.8]]));
  art.add('detail', rect(cx - 30, -104, 64, 1.3));
  art.add('detail', poly([[cx - 30, -103], [cx + 9.8, -114], [cx + 34, -103], [cx + 33, -103], [cx + 9.8, -112], [cx - 29, -103]]));
  art.add('detail', rect(cx + 24, -103, 7, 4));
  art.add('detail', rect(cx - 22, -103, 0.5, 26));
  art.add('detail', rect(cx - 23.5, -78, 3.5, 2.5));
  art.add('light', circle(cx + 9.8, -114.6, 0.9));

  return {
    key: 'cityMid', period, origin, drift: 0.032,
    art: art.render('art'), artSpan: art.span(), reflection: water.render('water', 0.5), reflectionSpan: water.span(),
  };
}

/** The far shore: a bridge running in from the left, the ferry clock tower, piers, and port cranes. */
function shore(): PanoramaTile {
  const period = 1700;
  const origin = -620;
  const at = (u: number) => u - origin;
  const rand = seeded(47);
  const look: Look = { windows: true, pitch: [3.4, 4.2], pane: [1.3, 1.8], glintRate: 0.08, side: 0.26 };
  const extra = [
    ['window', SHORE.window], ['sideWindow', SHORE.sideWindow], ['glint', SHORE.glint], ['detail', SHORE.detail],
    ['light', MID.light], ['tree', SHORE.tree], ['treeLit', SHORE.treeLit], ['land', SHORE.land],
  ] as const;
  const art = new Layer([
    ['bTower', BRIDGE.tower], ['bTowerLit', BRIDGE.towerLit], ['bCable', BRIDGE.cable], ['bDeck', BRIDGE.deck], ['bDeckLit', BRIDGE.deckLit],
    ...PAINTS_FULL(SHORE, extra),
    ['crane', CRANE],
  ]);
  const water = new Layer([
    ['bTower', BRIDGE.tower], ['bDeck', BRIDGE.deckLit],
    ...PAINTS_FULL(SHORE, [['glint', SHORE.glint]]),
    ['crane', CRANE],
  ]);

  // --- Suspension bridge: anchorage, two towers, main span, back to the shore.
  const deckY = -9.5;
  const anchorL = at(-620);
  const towerL = at(-410);
  const towerR = at(-140);
  const anchorR = at(-52);
  const towerTop = -76;
  art.add('bDeck', rect(anchorL, deckY, anchorR - anchorL, 2.6));
  art.add('bDeckLit', rect(anchorL, deckY - 0.7, anchorR - anchorL, 0.9));
  // Cable: parabolas between tower tops (main span) and down to each anchorage.
  const cableAt = (x: number) => {
    if (x < towerL) {
      const t = (x - anchorL) / (towerL - anchorL);
      return deckY - 2 + (towerTop + 2 - (deckY - 2)) * t * t;
    }
    if (x > towerR) {
      const t = (anchorR - x) / (anchorR - towerR);
      return deckY - 2 + (towerTop + 2 - (deckY - 2)) * t * t;
    }
    const t = (x - (towerL + towerR) / 2) / ((towerR - towerL) / 2);
    return deckY - 3.5 + (towerTop + 2 - (deckY - 3.5)) * t * t;
  };
  let cable = '';
  for (let x = anchorL; x <= anchorR; x += 4) cable += `${x === anchorL ? 'M' : 'L'}${f(x)} ${f(cableAt(x))}`;
  for (let x = anchorR; x >= anchorL; x -= 4) cable += `L${f(x)} ${f(cableAt(x) + 1.1)}`;
  art.add('bCable', `${cable}Z`);
  for (let x = anchorL + 6; x < anchorR - 2; x += 6.5) {
    if (Math.abs(x - towerL) < 4 || Math.abs(x - towerR) < 4) continue;
    const top = cableAt(x) + 0.8;
    if (deckY - top > 1) art.add('bCable', rect(x, top, 0.38, deckY - top));
  }
  for (const tx of [towerL, towerR]) {
    art.add('bTower', poly([[tx - 3.6, 1], [tx - 2.6, towerTop], [tx + 2.6, towerTop], [tx + 3.6, 1]]));
    art.add('bTowerLit', poly([[tx + 1, 1], [tx + 1, towerTop], [tx + 2.6, towerTop], [tx + 3.6, 1]]));
    for (const y of [towerTop + 4, towerTop + 24, towerTop + 44]) art.add('bDeck', rect(tx - 2.4, y, 4.8, 1.6));
    art.add('bTower', rect(tx - 2.2, towerTop - 3, 4.4, 3));
    art.add('light', circle(tx, towerTop - 3.6, 1));
    art.add('bDeck', poly([[tx - 6, 1], [tx - 4.6, -2], [tx + 4.6, -2], [tx + 6, 1]]));
    for (let y = 1; y < -towerTop * 0.85; y += 2.4 + y * 0.025) {
      const wobble = (rand() - 0.5) * (1 + y * 0.05);
      water.add('bTower', rect(tx - 3 + wobble, y, 6 - y * 0.03, 1.2));
    }
  }
  for (let x = anchorL; x < anchorR; x += 9 + rand() * 6) {
    water.add('bDeck', rect(x + (rand() - 0.5) * 2, -deckY + (rand() - 0.5) * 1.5, 5 + rand() * 6, 0.9));
  }
  art.add('land', poly([[anchorR - 14, 1], [anchorR - 8, -6], [anchorR + 30, -5], [anchorR + 40, 1]]));

  // --- The shore itself: a strip of land under everything from the bridge on.
  const shoreFrom = anchorR - 10;
  art.add('land', rect(shoreFrom, -2.2, period - shoreFrom, 3.4));

  // Ferry terminal: a long low hall of arches under a clock tower with a flag.
  const fx = at(-30);
  const hall: Building = { x: fx, w: 112, h: 11, roof: 'flat', tone: 0 };
  building(art, hall, { ...look, windows: false }, rand);
  for (let x = fx + 4; x < fx + 108; x += 5) art.add('window', `M${f(x)} -2v-4.2a1.4 1.4 0 0 1 2.8 0v4.2Z`);
  const tx = fx + 50;
  art.add('face1', rect(tx - 4, -46, 8, 36));
  art.add('side', rect(tx + 4, -46, 2.2, 36));
  art.add('face1', rect(tx - 4.8, -48, 9.6, 2.5));
  art.add('face0', poly([[tx - 4, -48], [tx + 1, -60], [tx + 1, -48]]));
  art.add('side', poly([[tx + 1, -48], [tx + 1, -60], [tx + 6.2, -48]]));
  art.add('glint', circle(tx, -40, 2.3));
  art.add('detail', circle(tx, -40, 0.7));
  art.add('detail', rect(tx + 0.7, -70, 0.5, 10));
  art.add('light', poly([[tx + 1.2, -70], [tx + 6, -68.6], [tx + 1.2, -67.2]]));
  for (let y = 1; y < 50; y += 2.6) water.add('face1', rect(tx - 4 + (rand() - 0.5) * 2, y, 8, 1.1));
  for (let y = 1; y < 10; y += 2.4) water.add('face0', rect(fx + (rand() - 0.5) * 2, y, 112, 1.1));
  water.add('glint', rect(tx - 0.5, 36, 1.2, 5));

  // Piers and sheds, then the port with its gantry cranes, then town.
  const rows: Building[] = [
    ...fillRow(rand, at(92), at(470), { minW: 14, maxW: 34, minH: 6, maxH: 17, gap: 6, tones: 2, roofs: ['saw', 'tank'] }),
    ...fillRow(rand, at(640), at(1080), { minW: 10, maxW: 24, minH: 8, maxH: 30, gap: 7, tones: 2, roofs: ['setback', 'tank', 'saw'] }),
  ];
  for (const b of rows) {
    building(art, b, look, rand);
    reflect(water, b, look, rand);
  }
  for (let x = at(470); x < at(640); x += 9 + rand() * 4) {
    const r = 3 + rand() * 2.5;
    art.add('tree', circle(x, -r * 0.6, r));
    art.add('treeLit', circle(x + r * 0.25, -r * 0.8, r * 0.6));
  }
  // Container stacks along the quay.
  for (let x = at(505); x < at(600); x += 7.5) {
    const stack = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < stack; s++) art.add(s % 2 ? 'face1' : 'sideWindow', rect(x, -3 - (s + 1) * 2.6, 7, 2.4));
  }
  for (const gx of [at(520), at(574)]) {
    art.add('crane', rect(gx, -34, 1.3, 34));
    art.add('crane', rect(gx + 15, -34, 1.3, 34));
    art.add('crane', poly([[gx - 1, -30], [gx + 17, -30], [gx + 17, -28.6], [gx - 1, -28.6]]));
    art.add('crane', rect(gx - 32, -37.5, 62, 2.2));
    art.add('crane', poly([[gx + 4, -37.5], [gx + 9, -52], [gx + 10.5, -52], [gx + 13, -37.5]]));
    art.add('crane', poly([[gx - 31, -37], [gx + 9.6, -51.5], [gx + 9.6, -50.4], [gx - 30, -36.2]]));
    art.add('face0', rect(gx + 12, -44, 9, 6.5));
    art.add('side', rect(gx + 21, -44, 2.4, 6.5));
    art.add('light', circle(gx + 9.8, -52.4, 0.8));
    for (let y = 1; y < 34; y += 2.6) water.add('crane', rect(gx + (rand() - 0.5) * 2, y, 1.3, 1));
  }

  return {
    key: 'shore', period, origin, drift: 0.045,
    art: art.render('art'), artSpan: art.span(), reflection: water.render('water', 0.55), reflectionSpan: water.span(),
  };
}

// ---------- Clouds ----------

interface Cloud {
  u: number;
  y: number;
  /** Puffs on top of a flat base: [dx, dy, r]. */
  puffs: Array<[number, number, number]>;
  baseW: number;
}

const CLOUDS: Cloud[] = [
  { u: -330, y: -108, baseW: 150, puffs: [[-58, -5, 12], [-38, -13, 17], [-12, -19, 22], [16, -14, 18], [40, -8, 13], [60, -3, 8]] },
  { u: -70, y: -136, baseW: 70, puffs: [[-22, -4, 8], [-6, -10, 12], [12, -6, 9], [26, -2, 5]] },
  { u: 175, y: -120, baseW: 116, puffs: [[-42, -4, 10], [-22, -12, 15], [2, -16, 18], [24, -9, 13], [42, -4, 8]] },
  { u: 440, y: -102, baseW: 136, puffs: [[-52, -4, 10], [-30, -12, 16], [-4, -18, 21], [24, -12, 16], [48, -5, 10]] },
  { u: 735, y: -134, baseW: 90, puffs: [[-30, -4, 9], [-10, -11, 13], [12, -8, 11], [30, -3, 6]] },
];

/**
 * Towering banks low on the horizon, behind the city: big, soft, and pinker
 * than the clouds overhead, since the sunset light reaches them through more
 * air. They give the sky a focal point and set the skyline off against them.
 */
const BANKS: Cloud[] = [
  {
    u: 110, y: -20, baseW: 360,
    puffs: [[-160, -6, 22], [-128, -18, 30], [-90, -30, 38], [-48, -44, 46], [-4, -58, 52], [42, -46, 44], [84, -34, 36], [122, -22, 30], [156, -10, 22]],
  },
  {
    u: 640, y: -16, baseW: 260,
    puffs: [[-112, -6, 18], [-80, -18, 26], [-40, -30, 34], [4, -36, 36], [46, -24, 28], [86, -12, 20], [116, -4, 14]],
  },
];

/** Long thin cloud streaks low in the sky: [u, y, width, thickness]. */
const STREAKS: Array<[number, number, number, number]> = [
  [-470, -66, 230, 3.2], [-190, -82, 150, 2.4], [60, -58, 260, 3.4], [360, -86, 170, 2.2], [610, -70, 240, 3], [880, -60, 170, 2.4],
];

/** A lens: tapered at both ends, fullest in the middle. */
const lens = (x: number, y: number, w: number, h: number) =>
  `M${f(x)} ${f(y)}Q${f(x + w / 2)} ${f(y - h)} ${f(x + w)} ${f(y)}Q${f(x + w / 2)} ${f(y + h * 0.7)} ${f(x)} ${f(y)}Z`;

/**
 * Clouds: each one a single mass, filled with `fill` (a vertical gradient,
 * cream on top where the sun catches it, pink underneath). One soft mass
 * reads as a cloud; per-puff shading reads as a bunch of balloons.
 */
function clouds(fill: string): PanoramaTile {
  const period = 1500;
  const origin = -560;
  const els: ReactElement[] = [];
  const paths: string[] = [];
  let streaks = '';
  let streaksLit = '';
  for (const [u, y, w, h] of STREAKS) {
    const x = u - origin;
    streaks += lens(x, y, w, h);
    streaksLit += lens(x + w * 0.2, y - h * 0.25, w * 0.55, h * 0.45);
  }
  for (const [i, c] of BANKS.entries()) {
    const x = c.u - origin;
    const half = c.baseW / 2;
    let d = `M${f(x - half)} ${f(c.y - 7)}h${f(c.baseW)}a8.5 8.5 0 0 1 0 17h${f(-c.baseW)}a8.5 8.5 0 0 1 0 -17Z`;
    for (const [dx, dy, r] of c.puffs) d += circle(x + dx, c.y + dy, r);
    paths.push(d);
    els.push(<path key={`bank${i}`} d={d} fill={fill} opacity={0.62} />);
  }
  paths.push(streaks, streaksLit);
  els.push(<path key="streak" d={streaks} fill="#f7c7c9" />, <path key="streakLit" d={streaksLit} fill="#ffe4da" />);
  for (const [i, c] of CLOUDS.entries()) {
    const x = c.u - origin;
    const half = c.baseW / 2;
    // A deep base under the puffs fills the notches between them.
    let d = `M${f(x - half)} ${f(c.y - 7)}h${f(c.baseW)}a8.5 8.5 0 0 1 0 17h${f(-c.baseW)}a8.5 8.5 0 0 1 0 -17Z`;
    for (const [dx, dy, r] of c.puffs) d += circle(x + dx, c.y + dy, r);
    const base = lens(x - half + 8, c.y + 8.4, c.baseW - 14, 1.5);
    paths.push(d, base);
    els.push(
      <path key={`c${i}`} d={d} fill={fill} />,
      <path key={`b${i}`} d={base} fill={BAY.cloudBase} />,
    );
  }
  return {
    key: 'clouds', period, origin, drift: 0.012,
    art: <g key="art" opacity={0.96}>{els}</g>, artSpan: spanOf(paths), reflection: null, reflectionSpan: NO_SPAN,
  };
}

/** The fixed layers, built once on first use. */
let fixed: PanoramaTile[] | null = null;
/** Clouds per gradient: each scene has its own gradient id. Kept small. */
const cloudTiles = new Map<string, PanoramaTile>();

/** Far to near. `cloudFill` paints the clouds, normally a scene's own gradient. */
export function panorama(cloudFill: string): PanoramaTile[] {
  fixed ??= [
    hills('hillFar', 2000, -700, 0.008, 30, [[3, 13, 0.4], [7, 8, 2.1], [15, 4, 4.4]], BAY.hillFar),
    hills('hillNear', 1600, -640, 0.014, 13, [[4, 7, 1.3], [9, 4, 0.2], [19, 2.4, 2.7]], BAY.hillNear),
    farCity(),
    midCity(),
    shore(),
  ];
  let sky = cloudTiles.get(cloudFill);
  if (!sky) {
    if (cloudTiles.size >= 8) cloudTiles.clear();
    sky = clouds(cloudFill);
    cloudTiles.set(cloudFill, sky);
  }
  return [sky, ...fixed];
}
