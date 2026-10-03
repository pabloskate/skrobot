import type { ReactElement } from 'react';
import { GROUND, X0 } from '../TrickAnimation';
import { LIGHT_SCREEN, PALETTE, lambert, tone, type Camera, type ViewBox } from './camera';
import { clamp01, mixHex, type P2, type V3 } from './math';
import { boxFaces, boxOnGround, groundQuad, hash2, num, pathD, repeats, repeatsIndexed, shadowPath, worldPath, type Box } from './setKit';

/**
 * The waterfront set's promenade, near to far from the plaza: its ledges,
 * benches, planters and bins, palms and lamps strung with festoon lights,
 * and the railing on the sea wall. Each prop is world geometry through the
 * scene camera, outlined and sunlit like the plaza's, with its shadow cast
 * along the scene's sun. Billboards (palms, lamps, bins) stand on a
 * projected foot and top, so they lean with the lens like real verticals.
 */

export const SLAB = 64;
export const LEDGE_FRONT_Z = -330;
export const LEDGE_DEPTH = 24;
export const LEDGE_H = 17;
/** Where the plaza's slabs give way to the promenade's pavers. */
export const PROM_Z = -386;
export const TREE_Z = -416;
export const SEAT_Z = -470;
/** The plaza's far edge: a granite coping on the sea wall, the bay beyond. */
export const WALL_Z = -600;
export const COPING_DEPTH = 14;
export const COPING_H = 6;
export const WATER_Z = WALL_Z - COPING_DEPTH;
export const RAIL_Z = WALL_Z - COPING_DEPTH / 2;
export const RAIL_H = 44;

export const INK = mixHex(PALETTE.ink, PALETTE.concrete, 0.42);

/** The set's own colors, tuned to sit in the sunset light under the scene palette. */
export const WF = {
  concrete: '#f0dcc7',
  concreteFar: '#f2ddd4',
  slabDark: '#e9d4bf',
  slabLight: '#f4e3d0',
  joint: '#cbb39f',
  crack: '#b9a08f',
  paver: '#e5bfac',
  paverDark: '#d9ad9a',
  paverJoint: '#c99a88',
  coping: '#eadbc9',
  ledge: '#e6d6c4',
  rail: '#4b3f7c',
  railLit: '#f3c3a4',
  trunk: '#b8957d',
  trunkLit: '#e6bf98',
  trunkRing: '#93725f',
  frondDark: '#4a6f6c',
  frondMid: '#6a9a72',
  frondLit: '#b5cd7e',
  coconut: '#7b5a4c',
  lampMetal: '#4b3f7c',
  lampGlass: '#ffe7b0',
  lampGlow: '#ffd38a',
  wood: '#cf9567',
  woodLit: '#eab481',
  planter: '#e4d3c0',
  shrubDark: '#4f8768',
  shrubLit: '#97c27a',
  flowerA: '#ff8fa8',
  flowerB: '#ffd36e',
  bin: '#5a4c8c',
  grate: '#9c8a96',
  sail: '#fff4e6',
  sailShade: '#e9c6cf',
  hull: '#584b8a',
  rippleLit: '#fbe1dc',
  glint: '#fff7ec',
  buoy: '#f26b4e',
  stain: '#a48d7c',
  band: '#dcc3b0',
  rippleDark: '#6560aa',
  skid: '#6f6380',
} as const;

/** A prop ready to paint, with its camera depth for sorting inside its row. */
export interface Item {
  depth: number;
  el: ReactElement;
}

export const inView = (view: ViewBox, p: P2, margin: number) =>
  p.x > view.x - margin && p.x < view.x + view.width + margin && p.y > view.y - margin && p.y < view.y + view.height + margin;

/** The granite coping along the sea wall and the railing on it. */
export function seaWall(cam: Camera, scroll: number, view: ViewBox): ReactElement[] {
  const out: ReactElement[] = [];
  const copingTop = GROUND - COPING_H;
  out.push(
    <g key="coping">
      {boxFaces(cam, { x0: -40000, x1: 40000, z0: WATER_Z, z1: WALL_Z, top: copingTop, bottom: GROUND + 2 }, WF.coping, { ink: INK, inkWidth: 0.6 })}
    </g>,
  );
  // Rails: thin bars along the street, lit along their tops.
  const bar = (y: number, h: number) =>
    worldPath(cam, [
      { x: -40000, y, z: RAIL_Z },
      { x: 40000, y, z: RAIL_Z },
      { x: 40000, y: y + h, z: RAIL_Z },
      { x: -40000, y: y + h, z: RAIL_Z },
    ]);
  let posts = '';
  for (const x of repeats(0, 52, scroll, X0 - 2600, X0 + 2600)) {
    const base = { x, y: copingTop, z: RAIL_Z };
    if (!cam.sees(base)) continue;
    const a = cam.project(base);
    const b = cam.project({ x, y: copingTop - RAIL_H, z: RAIL_Z });
    if (!inView(view, a, 30) && !inView(view, b, 30)) continue;
    const wa = 1.5 * a.s;
    const wb = 1.3 * b.s;
    posts += `M${num(a.x - wa)} ${num(a.y)}L${num(b.x - wb)} ${num(b.y)}L${num(b.x + wb)} ${num(b.y)}L${num(a.x + wa)} ${num(a.y)}Z`;
  }
  out.push(
    <g key="railing">
      <path d={posts} fill={WF.rail} />
      <path d={bar(copingTop - RAIL_H * 0.5, 1.6)} fill={WF.rail} />
      <path d={bar(copingTop - RAIL_H - 1, 3.2)} fill={WF.rail} />
      <path d={bar(copingTop - RAIL_H - 1.4, 1.1)} fill={WF.railLit} />
    </g>,
  );
  // Lifebuoys hung on the railing now and then: orange rings with four white bands.
  for (const { x, i } of repeatsIndexed(670, 1600, scroll, X0 - 2600, X0 + 2600)) {
    const c = { x, y: copingTop - 24, z: RAIL_Z + 2 };
    if (!cam.sees(c)) continue;
    const p = cam.project(c);
    if (!inView(view, p, 30)) continue;
    const r = 7 * p.s;
    const band = 2 * Math.PI * r;
    out.push(
      <g key={`buoy${i}`}>
        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={INK} strokeWidth={5.6 * p.s} />
        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={WF.buoy} strokeWidth={4 * p.s} />
        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={WF.sail} strokeWidth={4 * p.s} strokeDasharray={`${num(band * 0.09)} ${num(band * 0.16)}`} strokeDashoffset={num(band * 0.04)} />
        <path d={`M${num(p.x - r * 0.75)} ${num(p.y - r * 0.85)}A${num(r * 1.1)} ${num(r * 1.1)} 0 0 1 ${num(p.x + r * 0.9)} ${num(p.y - r * 0.4)}`} fill="none" stroke="#fff4e0" strokeWidth={1 * p.s} opacity={0.6} />
      </g>,
    );
  }
  return out;
}

/** A ground-standing billboard's foot and top, or null if it's off camera. */
function stand(cam: Camera, x: number, z: number, h: number, view: ViewBox, margin: number) {
  const foot = { x, y: GROUND, z };
  if (!cam.sees(foot)) return null;
  const a = cam.project(foot);
  const b = cam.project({ x, y: GROUND - h, z });
  if (!inView(view, a, margin) && !inView(view, b, margin)) return null;
  return { a, b, foot };
}

export function palm(cam: Camera, x: number, z: number, idx: number, view: ViewBox): Item | null {
  const h = 250 + 50 * hash2(idx, 0, 11);
  const lean = (hash2(idx, 0, 12) - 0.5) * 70;
  const at = stand(cam, x, z, h, view, 160);
  if (!at) return null;
  const N = 10;
  const spine: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    spine.push({ x: x + lean * t * t, y: GROUND - h * t, z });
  }
  const pts = spine.map((p) => cam.project(p));
  const left: P2[] = [];
  const right: P2[] = [];
  const litEdge: P2[] = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const q = pts[Math.min(N, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x;
    let ty = q.y - o.y;
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    const half = ((13 - 5 * (i / N)) / 2) * p.s * (i === 0 ? 1.25 : 1);
    left.push({ x: p.x + ty * half, y: p.y - tx * half });
    right.push({ x: p.x - ty * half, y: p.y + tx * half });
    litEdge.push({ x: p.x - ty * half * 0.1, y: p.y + tx * half * 0.1 });
  }
  const top = pts[N];
  const sTop = top.s;
  const ink = 0.9 * sTop;
  const rightDown = [...right].reverse();
  const trunk = pathD([...left, ...rightDown]);
  const lit = pathD([...litEdge, ...rightDown]);
  let rings = '';
  for (let i = 1; i < N; i++) {
    const l = left[i];
    const r = right[i];
    const mx = (l.x + r.x) / 2;
    const my = (l.y + r.y) / 2 + 1.2 * pts[i].s;
    rings += `M${num(l.x)} ${num(l.y)}Q${num(mx)} ${num(my)} ${num(r.x)} ${num(r.y)}`;
  }

  return {
    depth: cam.depthOf(at.foot),
    el: (
      <g key={`palm${idx}`}>
        <path d={trunk} fill={WF.trunk} stroke={INK} strokeWidth={ink * 1.1} strokeLinejoin="round" />
        <path d={lit} fill={WF.trunkLit} />
        <path d={rings} fill="none" stroke={WF.trunkRing} strokeWidth={0.9 * sTop} opacity={0.7} />
        <g transform={`translate(${num(top.x)} ${num(top.y)}) scale(${sTop.toFixed(3)})`}>{palmCrown(idx)}</g>
      </g>
    ),
  };
}

/** Fronds: arching feathers, back ones first. [screen angle, length, droop]. */
const FRONDS: Array<[number, number, number]> = [
  [158, 0.8, 0.5], [22, 0.8, 0.5], [118, 0.55, 0.35], [64, 0.55, 0.35],
  [-172, 1, 0.62], [-8, 1, 0.62], [-146, 1, 0.7], [-34, 1, 0.7],
  [-122, 0.85, 0.66], [-58, 0.85, 0.66], [-98, 0.5, 0.3], [-80, 0.52, 0.32],
];
const crowns = new Map<number, ReactElement>();

/**
 * A palm's crown about its top, in world units: fronds fanned in the
 * picture plane (a crown reads the same from every side), coconuts tucked
 * under the front ones. The shape only depends on the palm, so it's built
 * once and placed and scaled each frame.
 */
function palmCrown(idx: number): ReactElement {
  const cached = crowns.get(idx);
  if (cached) return cached;
  const fronds: ReactElement[] = [];
  const base = 100 + 18 * hash2(idx, 0, 13);
  for (const [fi, [deg, lenK, droopK]] of FRONDS.entries()) {
    const a = ((deg + (hash2(idx, fi, 14) - 0.5) * 14) * Math.PI) / 180;
    const L = base * lenK;
    const droop = droopK * (0.85 + 0.3 * hash2(idx, fi, 15));
    const at = (u: number): P2 => ({ x: L * u * Math.cos(a), y: L * u * Math.sin(a) + droop * L * u * u });
    const upper: P2[] = [];
    const lower: P2[] = [];
    const S = 26;
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      const p = at(u);
      const q = at(Math.min(1, u + 0.02));
      const o = at(Math.max(0, u - 0.02));
      let tx = q.x - o.x;
      let ty = q.y - o.y;
      const m = Math.hypot(tx, ty) || 1;
      tx /= m;
      ty /= m;
      // The side of the spine that hangs: whichever normal points down.
      let nx = -ty;
      let ny = tx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      // Leaflets hang from the spine and sweep toward the tip: a fine,
      // uneven fringe below, a shorter one above.
      const w = 0.21 * L * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.6) * (1 - 0.3 * u);
      const tooth = i % 2 === 1;
      const jitter = 0.8 + 0.4 * hash2(idx * 31 + fi, i, 16);
      const up = tooth ? 0.42 * jitter : 0.12;
      const down = tooth ? jitter : 0.22;
      upper.push({ x: p.x - nx * w * up + tx * w * (tooth ? 0.5 : 0), y: p.y - ny * w * up + ty * w * (tooth ? 0.5 : 0) });
      lower.push({ x: p.x + nx * w * down + tx * w * (tooth ? 0.7 : 0), y: p.y + ny * w * down + ty * w * (tooth ? 0.7 : 0) });
    }
    const light = clamp01(0.45 + 0.4 * Math.cos(a) * LIGHT_SCREEN.x - 0.45 * Math.sin(a) * -LIGHT_SCREEN.y - (fi < 4 ? 0.3 : 0));
    const fill = light > 0.5 ? mixHex(WF.frondMid, WF.frondLit, (light - 0.5) * 2) : mixHex(WF.frondDark, WF.frondMid, light * 2);
    const spinePath = pathD(Array.from({ length: 8 }, (_, i) => at(i / 7)), false);
    fronds.push(
      <g key={fi}>
        <path d={pathD([...upper, ...lower.reverse()])} fill={fill} stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
        <path d={spinePath} fill="none" stroke={mixHex(fill, '#fff2d0', 0.35)} strokeWidth={0.9} strokeLinecap="round" />
      </g>,
    );
  }
  const nuts = [[-4, 4], [3, 6], [8, 2]].map(([dx, dy], i) => (
    <circle key={`n${i}`} cx={dx} cy={dy} r={3.6} fill={WF.coconut} stroke={INK} strokeWidth={0.72} />
  ));
  const crown = <>{fronds.slice(0, 4)}{nuts}{fronds.slice(4)}</>;
  if (crowns.size > 64) crowns.clear();
  crowns.set(idx, crown);
  return crown;
}

export function palmShadow(cam: Camera, x: number, z: number, idx: number, minZ: number): string[] {
  const h = 250 + 50 * hash2(idx, 0, 11);
  const lean = (hash2(idx, 0, 12) - 0.5) * 70;
  const crown: V3 = { x: x + lean, y: GROUND - h, z };
  const out = [shadowPath(cam, [{ x, y: GROUND, z }, { x: x + lean * 0.3, y: GROUND - h * 0.55, z }, crown], 5, minZ)];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + idx;
    const mid: V3 = { x: crown.x + Math.cos(a) * 48, y: crown.y - 10, z: crown.z + Math.sin(a) * 48 };
    const tip: V3 = { x: crown.x + Math.cos(a) * 92, y: crown.y + 30, z: crown.z + Math.sin(a) * 92 };
    out.push(shadowPath(cam, [crown, mid, tip], 7, minZ));
  }
  return out;
}

const LAMP_H = 150;

export function lamp(cam: Camera, x: number, z: number, key: string, glow: string, view: ViewBox): Item | null {
  const at = stand(cam, x, z, LAMP_H, view, 60);
  if (!at) return null;
  const { a, b } = at;
  const s = b.s;
  const ink = 0.9 * s;
  const pole = `M${num(a.x - 2.6 * a.s)} ${num(a.y)}L${num(b.x - 1.6 * s)} ${num(b.y)}L${num(b.x + 1.6 * s)} ${num(b.y)}L${num(a.x + 2.6 * a.s)} ${num(a.y)}Z`;
  const footing = `M${num(a.x - 5 * a.s)} ${num(a.y + 0.5)}v${num(-12 * a.s)}l${num(2 * a.s)} ${num(-3 * a.s)}h${num(6 * a.s)}l${num(2 * a.s)} ${num(3 * a.s)}v${num(12 * a.s)}Z`;
  const L = (dx: number, dy: number) => `${num(b.x + dx * s)} ${num(b.y + dy * s)}`;
  const glass = `M${L(-5, -2)}L${L(-6.5, -16)}L${L(6.5, -16)}L${L(5, -2)}Z`;
  const cap = `M${L(-9, -16)}L${L(0, -24)}L${L(9, -16)}Z`;
  const collar = `M${L(-4, 0)}L${L(-5.5, -2.5)}L${L(5.5, -2.5)}L${L(4, 0)}Z`;
  return {
    depth: cam.depthOf(at.foot),
    el: (
      <g key={key}>
        <circle cx={b.x} cy={b.y - 9 * s} r={30 * s} fill={glow} />
        <path d={pole} fill={WF.lampMetal} />
        <path d={footing} fill={WF.lampMetal} />
        <path d={`M${num(a.x + 0.6 * a.s)} ${num(a.y - 14 * a.s)}L${num(b.x + 0.4 * s)} ${num(b.y)}`} stroke={WF.railLit} strokeWidth={0.8 * s} opacity={0.55} />
        <path d={glass} fill={WF.lampGlass} stroke={WF.lampMetal} strokeWidth={ink} strokeLinejoin="round" />
        <path d={collar} fill={WF.lampMetal} />
        <path d={cap} fill={WF.lampMetal} stroke={WF.lampMetal} strokeWidth={ink} strokeLinejoin="round" />
        <path d={`M${L(0, -24)}L${L(0, -28)}`} stroke={WF.lampMetal} strokeWidth={1.4 * s} strokeLinecap="round" />
      </g>
    ),
  };
}

export function lampShadow(cam: Camera, x: number, z: number, minZ: number): string {
  return shadowPath(cam, [{ x, y: GROUND, z }, { x, y: GROUND - LAMP_H, z }, { x, y: GROUND - LAMP_H - 24, z }], 3, minZ);
}

/**
 * Festoon lights strung between the promenade's palms and lamps, sagging
 * between anchors. Each span sorts with the row by its middle, so a nearer
 * trunk still covers the end of a wire tied to it.
 */
export interface Anchor {
  x: number;
  /** Height the wire is tied at. */
  h: number;
  key: string;
}

export function stringLights(cam: Camera, anchors: Anchor[], view: ViewBox): Item[] {
  const items: Item[] = [];
  const z = TREE_Z + 3;
  const sorted = [...anchors].sort((a, b) => a.x - b.x);
  for (let k = 0; k + 1 < sorted.length; k++) {
    const a = sorted[k];
    const b = sorted[k + 1];
    const at = (t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: GROUND - (a.h + (b.h - a.h) * t - 26 * 4 * t * (1 - t)), z });
    const mid = at(0.5);
    if (!cam.sees(mid) || !cam.sees(at(0)) || !cam.sees(at(1))) continue;
    const pm = cam.project(mid);
    if (!inView(view, pm, 140)) continue;
    const wire: P2[] = [];
    for (let i = 0; i <= 12; i++) wire.push(cam.project(at(i / 12)));
    let bulbs = '';
    let glows = '';
    for (let i = 1; i < 9; i++) {
      const p = cam.project(at(i / 9));
      const r = 1.7 * p.s;
      bulbs += `M${num(p.x - r)} ${num(p.y + r)}a${num(r)} ${num(r)} 0 1 1 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 1 ${num(-2 * r)} 0Z`;
      const g = 5.5 * p.s;
      glows += `M${num(p.x - g)} ${num(p.y + r)}a${num(g)} ${num(g)} 0 1 1 ${num(2 * g)} 0a${num(g)} ${num(g)} 0 1 1 ${num(-2 * g)} 0Z`;
    }
    items.push({
      depth: pm.depth,
      el: (
        <g key={`lights-${a.key}`}>
          <path d={pathD(wire, false)} fill="none" stroke={WF.lampMetal} strokeWidth={0.7 * pm.s} opacity={0.8} />
          <path d={glows} fill={WF.lampGlow} opacity={0.22} />
          <path d={bulbs} fill={WF.lampGlass} />
        </g>
      ),
    });
  }
  return items;
}

/** A bench whose seat front is at `z`, facing +z (`facing` 1) or -z (-1). */
export function bench(cam: Camera, x: number, z: number, key: string, facing: 1 | -1 = 1): { item: Item; shadow: Box } | null {
  const len = 64;
  const span = (a: number, b: number): [number, number] => {
    const p = z - facing * a;
    const q = z - facing * b;
    return [Math.min(p, q), Math.max(p, q)];
  };
  const [sz0, sz1] = span(16, 0);
  const seat = boxOnGround(x, x + len, sz0, sz1, 15);
  seat.bottom = seat.top + 3.5;
  const [bz0, bz1] = span(17, 14);
  const back: Box = { x0: x, x1: x + len, z0: bz0, z1: bz1, top: GROUND - 32, bottom: GROUND - 18 };
  const [lz0, lz1] = span(15, 1);
  const legs = [boxOnGround(x + 5, x + 9, lz0, lz1, 11.5), boxOnGround(x + len - 9, x + len - 5, lz0, lz1, 11.5)];
  const [hz0, hz1] = span(17, 0);
  const center = { x: x + len / 2, y: GROUND, z };
  if (!cam.sees(center)) return null;
  const opts = { ink: INK, inkWidth: 0.8 * cam.project(center).s };
  return {
    item: {
      depth: cam.depthOf(center),
      el: (
        <g key={key}>
          {legs.map((l, i) => <g key={i}>{boxFaces(cam, l, WF.lampMetal, opts)}</g>)}
          {boxFaces(cam, back, WF.wood, { ...opts, top: WF.woodLit })}
          {boxFaces(cam, seat, WF.wood, { ...opts, top: WF.woodLit })}
        </g>
      ),
    },
    shadow: { x0: x, x1: x + len, z0: hz0, z1: hz1, top: GROUND - 32, bottom: GROUND },
  };
}

function shrubs(cam: Camera, b: Box, seed: number): ReactElement {
  let dark = '';
  let lit = '';
  let flowersA = '';
  let flowersB = '';
  const circle = (cx: number, cy: number, r: number) =>
    `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0Z`;
  const n = Math.max(3, Math.round((b.x1 - b.x0) / 14));
  for (let k = 0; k < n; k++) {
    const x = b.x0 + 6 + ((b.x1 - b.x0 - 12) * k) / (n - 1);
    const zc = (b.z0 + b.z1) / 2 + (hash2(seed, k, 20) - 0.5) * 8;
    const r = 9 + 5 * hash2(seed, k, 21);
    const p = cam.project({ x, y: b.top - r * 0.5, z: zc });
    const rr = r * p.s;
    dark += circle(p.x, p.y, rr);
    lit += circle(p.x + rr * 0.2, p.y - rr * 0.22, rr * 0.72);
    if (hash2(seed, k, 22) > 0.4) flowersA += circle(p.x - rr * 0.3, p.y - rr * 0.4, 1.4 * p.s);
    if (hash2(seed, k, 23) > 0.5) flowersB += circle(p.x + rr * 0.45, p.y - rr * 0.1, 1.3 * p.s);
  }
  const s = cam.project({ x: (b.x0 + b.x1) / 2, y: b.top, z: b.z1 }).s;
  return (
    <g key="shrubs">
      <path d={dark} fill={WF.shrubDark} stroke={INK} strokeWidth={0.8 * s} />
      <path d={dark} fill={WF.shrubDark} />
      <path d={lit} fill={WF.shrubLit} />
      <path d={flowersA} fill={WF.flowerA} />
      <path d={flowersB} fill={WF.flowerB} />
    </g>
  );
}

export function planter(cam: Camera, x: number, z: number, idx: number): { item: Item; shadow: Box } | null {
  const b = boxOnGround(x, x + 96, z - 30, z, 20);
  const center = { x: x + 48, y: GROUND, z };
  if (!cam.sees(center)) return null;
  const s = cam.project(center).s;
  return {
    item: {
      depth: cam.depthOf(center),
      el: (
        <g key={`planter${idx}`}>
          {boxFaces(cam, b, WF.planter, { ink: INK, inkWidth: 1 * s })}
          {shrubs(cam, b, idx)}
        </g>
      ),
    },
    shadow: { ...b, top: b.top - 14 },
  };
}

export function bin(cam: Camera, x: number, z: number, key: string, view: ViewBox): { item: Item; shadow: V3[] } | null {
  const at = stand(cam, x, z, 28, view, 30);
  if (!at) return null;
  const { a, b } = at;
  const w = 7.5;
  const body = `M${num(a.x - w * a.s)} ${num(a.y)}L${num(b.x - w * b.s)} ${num(b.y)}L${num(b.x + w * b.s)} ${num(b.y)}L${num(a.x + w * a.s)} ${num(a.y)}Z`;
  const litBand = `M${num(a.x + w * 0.25 * a.s)} ${num(a.y)}L${num(b.x + w * 0.25 * b.s)} ${num(b.y)}L${num(b.x + w * 0.75 * b.s)} ${num(b.y)}L${num(a.x + w * 0.75 * a.s)} ${num(a.y)}Z`;
  return {
    item: {
      depth: cam.depthOf(at.foot),
      el: (
        <g key={key}>
          <path d={body} fill={WF.bin} stroke={INK} strokeWidth={0.8 * b.s} />
          <path d={litBand} fill={mixHex(WF.bin, WF.railLit, 0.4)} />
          <ellipse cx={b.x} cy={b.y} rx={(w + 1) * b.s} ry={2.4 * b.s} fill={mixHex(WF.bin, '#ffffff', 0.15)} stroke={INK} strokeWidth={0.8 * b.s} />
        </g>
      ),
    },
    shadow: [{ x: x - w, y: GROUND - 28, z }, { x: x + w, y: GROUND - 28, z }, { x, y: GROUND, z }],
  };
}

export const boxCorners = (b: Box): V3[] => {
  const out: V3[] = [];
  for (const x of [b.x0, b.x1]) for (const y of [b.top, b.bottom]) for (const z of [b.z0, b.z1]) out.push({ x, y, z });
  return out;
};

export function ledge(cam: Camera, x: number, len: number, idx: number): Item | null {
  const b = boxOnGround(x, x + len, LEDGE_FRONT_Z - LEDGE_DEPTH, LEDGE_FRONT_Z, LEDGE_H);
  const center = { x: x + len / 2, y: GROUND, z: LEDGE_FRONT_Z };
  if (!cam.sees(center)) return null;
  const s = cam.project(center).s;
  const lip = 3.2;
  const paint = worldPath(cam, [
    { x: b.x0, y: b.top, z: b.z1 }, { x: b.x1, y: b.top, z: b.z1 }, { x: b.x1, y: b.top + lip, z: b.z1 }, { x: b.x0, y: b.top + lip, z: b.z1 },
  ]);
  // Wax: the stretch of the edge that gets skated, darkened and glossy.
  const w0 = x + len * (0.15 + 0.3 * hash2(idx, 0, 30));
  const w1 = w0 + len * 0.35;
  const wax = worldPath(cam, [
    { x: w0, y: b.top, z: b.z1 - 5 }, { x: w1, y: b.top, z: b.z1 - 5 }, { x: w1, y: b.top, z: b.z1 }, { x: w0, y: b.top, z: b.z1 },
  ]);
  return {
    depth: cam.depthOf(center),
    el: (
      <g key={`ledge${idx}`}>
        <path d={groundQuad(cam, b.x0 - 2, b.x1 + 2, b.z1, b.z1 + 5)} fill={PALETTE.shadow} opacity={0.14} />
        {boxFaces(cam, b, WF.ledge, { ink: INK, inkWidth: 1.1 * s })}
        {paint && <path d={paint} fill={tone(PALETTE.paint, lambert({ x: 0, y: 0, z: 1 }))} />}
        {wax && <path d={wax} fill={PALETTE.ink} opacity={0.12} />}
      </g>
    ),
  };
}
