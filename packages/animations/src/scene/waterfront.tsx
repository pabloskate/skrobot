import type { ReactElement } from 'react';
import { GROUND, X0 } from '../TrickAnimation';
import { PALETTE, type Camera, type ViewBox } from './camera';
import { clamp01, mixHex, type V3 } from './math';
import {
  BLEED_L,
  BLEED_R,
  BLEED_Y,
  SPAN_HI,
  SPAN_LO,
  band,
  boxOnGround,
  groundQuad,
  hash2,
  num,
  pathD,
  repeats,
  repeatsIndexed,
  shadowPath,
  worldPath,
  type FarLayer,
} from './setKit';
import { BAY, panorama, type PanoramaTile } from './waterfrontPanorama';
import {
  LEDGE_DEPTH,
  LEDGE_FRONT_Z,
  LEDGE_H,
  PROM_Z,
  SEAT_Z,
  SLAB,
  TREE_Z,
  WALL_Z,
  WATER_Z,
  WF,
  bench,
  bin,
  boxCorners,
  inView,
  lamp,
  lampShadow,
  ledge,
  palm,
  palmShadow,
  planter,
  seaWall,
  stringLights,
  type Anchor,
  type Item,
} from './waterfrontProps';

/**
 * Waterfront: a skate plaza on a bayside promenade at golden hour.
 *
 * Far to near: a sky in the sunset's afterglow (the sun is low behind the
 * viewer's right shoulder, so the sky ahead holds the pink belt and the city
 * across the bay glows gold), the far panorama with its reflection on the
 * water, sailboats and ripples on the bay, then the promenade: a railing on
 * the sea wall, benches and planters, palms and lamps, and the plaza's
 * ledges. Everything from the water forward is world geometry through the
 * scene camera, lit by the same sun as the robot and casting its shadows
 * along the same rays, so it holds up from every crane angle.
 *
 * Props are painted row by row, far to near. The eye is always on the
 * viewer's side of every row (camera z > 0), so a nearer row can never be
 * hidden by a farther one; inside a row they sort by depth.
 */

export interface WaterfrontIds {
  sky: string;
  glow: string;
  belt: string;
  water: string;
  ground: string;
  haze: string;
  lamp: string;
  wash: string;
  vignette: string;
  cloud: string;
  air: string;
}

export const waterfrontIds = (base: string): WaterfrontIds => ({
  sky: `${base}-wf-sky`,
  glow: `${base}-wf-glow`,
  belt: `${base}-wf-belt`,
  water: `${base}-wf-water`,
  ground: `${base}-wf-ground`,
  haze: `${base}-wf-haze`,
  lamp: `${base}-wf-lamp`,
  wash: `${base}-wf-wash`,
  vignette: `${base}-wf-vignette`,
  cloud: `${base}-wf-cloud`,
  air: `${base}-wf-air`,
});

// ---------- Far panorama ----------

/**
 * How far (viewBox units) a panorama layer reaches past each side of the
 * view. It slides up to half that before it's laid out again, so drifting
 * with the street redraws it every few seconds rather than every frame.
 */
export const FAR_OVERSCAN = 60;

/**
 * A panorama tile's art (or its reflection) as a far layer: copies of the
 * tile edge to edge across the view and its overscan, at the horizon. They
 * are laid out for the tile's drift rounded to a step, and the remainder of
 * the drift is the layer's shift, which costs the browser no repaint.
 * Rounding (rather than remembering where it was last laid out) keeps the
 * layer a pure function of the frame.
 */
export function tileLayer(
  cam: Camera,
  tile: PanoramaTile,
  part: 'art' | 'reflection',
  scroll: number,
  hy: number,
  view: ViewBox,
): FarLayer | null {
  const el = part === 'art' ? tile.art : tile.reflection;
  if (!el) return null;
  const k = cam.farScale;
  const [top, bottom] = part === 'art' ? tile.artSpan : tile.reflectionSpan;
  const rows = band(view, hy + k * top - 1, hy + k * bottom + 1);
  if (!rows) return null;
  const box = { ...rows, x: view.x - FAR_OVERSCAN, width: view.width + 2 * FAR_OVERSCAN };
  const drift = tile.drift * scroll * cam.drift;
  const step = FAR_OVERSCAN / k;
  const laid = Math.round(drift / step) * step;
  const width = k * tile.period;
  // Screen x of copy n's local 0, as laid out.
  const at = (n: number) => X0 + k * (tile.origin + n * tile.period - cam.pan - laid);
  const copies: ReactElement[] = [];
  for (let n = Math.floor((box.x - at(0)) / width); at(n) < box.x + box.width; n++) {
    copies.push(<g key={n} transform={`translate(${at(n).toFixed(2)} ${hy.toFixed(2)}) scale(${k})`}>{el}</g>);
  }
  return { key: `${tile.key}-${part}`, box, shift: -k * (drift - laid), art: <>{copies}</> };
}

/** Gulls wheeling over the bay: [u, y above the horizon, phase]. */
const GULLS: Array<[number, number, number]> = [[-170, -98, 0], [-148, -110, 1.7], [-128, -94, 3.1], [70, -152, 0.8], [318, -104, 2.2], [342, -96, 4]];

function gulls(cam: Camera, scroll: number, hy: number): ReactElement {
  const k = cam.farScale;
  let d = '';
  for (const [u, y, phase] of GULLS) {
    const x = X0 + k * (u - cam.pan - scroll * cam.drift * 0.05);
    const cy = hy + y * k;
    const flap = Math.sin(scroll * 0.045 + phase * 2.1);
    const w = 4.6 * k;
    const lift = (1.6 + 1.8 * flap) * k;
    d += `M${num(x - w)} ${num(cy - lift * 0.4)}Q${num(x - w * 0.45)} ${num(cy - lift)} ${num(x)} ${num(cy)}`;
    d += `Q${num(x + w * 0.45)} ${num(cy - lift)} ${num(x + w)} ${num(cy - lift * 0.4)}`;
  }
  return <path key="gulls" d={d} fill="none" stroke={BAY.gull} strokeWidth={1.05 * k} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />;
}

// ---------- The bay ----------

/** A short horizontal dash on the water, tapered at both ends. */
function dash(cam: Camera, x0: number, x1: number, z: number, thick: number): string {
  const a = cam.project({ x: x0, y: GROUND, z });
  const b = cam.project({ x: x1, y: GROUND, z });
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const h = Math.max(0.3, thick * (a.s + b.s) * 0.5);
  return `M${num(a.x)} ${num(a.y)}L${num(mx)} ${num(my - h)}L${num(b.x)} ${num(b.y)}L${num(mx)} ${num(my + h * 0.6)}Z`;
}

function ripples(cam: Camera, scroll: number, view: ViewBox): ReactElement {
  let lit = '';
  let dark = '';
  for (let k = 0; k < 24; k++) {
    const z = WATER_Z - 22 * Math.pow(1.24, k);
    // Spaced by the row's distance alone: tied to the camera, the pattern
    // would reshuffle every frame the crane rises with a pop.
    const period = Math.max(60, 0.075 * (520 - 0.9 * z));
    for (const { x, i } of repeatsIndexed((k * 37) % period, period, scroll, X0 - 3200, X0 + 3200)) {
      const h = hash2(i, k, 3);
      const len = period * (0.22 + 0.4 * h);
      const x0 = x + period * 0.5 * hash2(i, k, 4);
      const a = cam.project({ x: x0, y: GROUND, z });
      if (!cam.sees({ x: x0, y: GROUND, z }) || !inView(view, a, 60)) continue;
      const d = dash(cam, x0, x0 + len, z, 1.3);
      if (h > 0.55) lit += d;
      else if (h < 0.3) dark += d;
    }
  }
  // A few crests catch the light and twinkle as the camera moves along.
  let glints = '';
  for (let k = 2; k < 14; k++) {
    const z = WATER_Z - 22 * Math.pow(1.24, k);
    for (const { x, i } of repeatsIndexed(90 * k, 260 + 60 * k, scroll, X0 - 2400, X0 + 2400)) {
      const at = { x: x + 120 * hash2(i, k, 40), y: GROUND, z };
      if (!cam.sees(at)) continue;
      const p = cam.project(at);
      if (!inView(view, p, 10)) continue;
      const twinkle = Math.max(0, Math.sin(scroll * 0.035 + 6.28 * hash2(i, k, 41)));
      const r = (1.2 + 3.2 * p.s) * twinkle ** 2;
      if (r < 0.4) continue;
      const q = r * 0.22;
      glints += `M${num(p.x - r)} ${num(p.y)}L${num(p.x - q)} ${num(p.y - q)}L${num(p.x)} ${num(p.y - r)}L${num(p.x + q)} ${num(p.y - q)}L${num(p.x + r)} ${num(p.y)}L${num(p.x + q)} ${num(p.y + q)}L${num(p.x)} ${num(p.y + r)}L${num(p.x - q)} ${num(p.y + q)}Z`;
    }
  }
  return (
    <g key="ripples">
      <path d={dark} fill={WF.rippleDark} opacity={0.3} />
      <path d={lit} fill={WF.rippleLit} opacity={0.75} />
      <path d={glints} fill={WF.glint} />
    </g>
  );
}

/** Boats on the bay: [x offset, z, period, kind]. */
const BOATS: Array<[number, number, number, 'sail' | 'ferry']> = [
  [260, -1350, 2900, 'sail'],
  [1650, -2050, 2900, 'sail'],
  [980, -2900, 3700, 'ferry'],
];

function boats(cam: Camera, scroll: number, view: ViewBox): ReactElement[] {
  const out: ReactElement[] = [];
  for (const [offset, z, period, kind] of BOATS) {
    for (const { x, i } of repeatsIndexed(offset, period, scroll, X0 - 6000, X0 + 6000)) {
      const foot = { x, y: GROUND, z };
      if (!cam.sees(foot)) continue;
      const p = cam.project(foot);
      if (!inView(view, p, 80)) continue;
      const s = p.s;
      const key = `${kind}${offset}_${i}`;
      if (kind === 'sail') {
        out.push(
          <g key={key} transform={`translate(${num(p.x)} ${num(p.y)}) scale(${s.toFixed(3)})`}>
            <path d="M-22 -1h44l-7 8h-31Z" fill={WF.hull} opacity={0.22} transform="scale(1 -1) translate(0 -2)" />
            <path d="M-2 4v40M-2 6l14 26M-2 12l-12 20" stroke={WF.sailShade} strokeWidth={2.4} opacity={0.32} />
            <path d="M-24 -7h48l-7 8h-34Z" fill={WF.hull} />
            <path d="M-23 -6.2h46" stroke={WF.sail} strokeWidth={1.2} />
            <path d="M-1.5 -7v-58" stroke={WF.hull} strokeWidth={1.6} />
            <path d="M0 -64L0 -10L24 -10Z" fill={WF.sail} />
            <path d="M0 -64L0 -10L7 -10Z" fill={WF.sailShade} />
            <path d="M-3 -58L-3 -10L-19 -10Z" fill={WF.sailShade} />
          </g>,
        );
      } else {
        out.push(
          <g key={key} transform={`translate(${num(p.x)} ${num(p.y)}) scale(${s.toFixed(3)})`}>
            <path d="M-46 1h92v7h-92Z" fill={WF.sail} opacity={0.22} />
            <path d="M-50 -10h100l-6 10h-88Z" fill={WF.hull} />
            <path d="M-40 -22h74v12h-74Z" fill={WF.sail} />
            <path d="M-36 -18h66v4h-66Z" fill={WF.hull} opacity={0.7} />
            <path d="M-28 -31h46v9h-46Z" fill={WF.sailShade} />
            <path d="M-6 -42h8v11h-8Z" fill={WF.hull} />
            <path d="M-50 -10h100" stroke={WF.sail} strokeWidth={1.4} />
          </g>,
        );
      }
    }
  }
  return out;
}

// ---------- The ground ----------

function plazaGround(cam: Camera, scroll: number, view: ViewBox): ReactElement[] {
  const layers: ReactElement[] = [];
  const near = 2600;
  layers.push(<path key="promenade" d={groundQuad(cam, -40000, 40000, WATER_Z, PROM_Z)} fill={WF.paver} />);

  // Slab tones: a few slabs a shade darker or lighter, the way poured
  // concrete cures unevenly. Stable per slab as the plaza scrolls.
  let darker = '';
  let lighter = '';
  let cracks = '';
  const zRows: number[] = [];
  for (let z = LEDGE_FRONT_Z + SLAB * 0.5; z < 760; z += SLAB) zRows.push(z);
  const cells = repeatsIndexed(0, SLAB, scroll, X0 - 1500, X0 + 1500);
  for (let r = 0; r + 1 < zRows.length; r++) {
    const z0 = zRows[r];
    const z1 = zRows[r + 1];
    for (const { x, i } of cells) {
      const h = hash2(i, r, 1);
      if (h > 0.3 && h < 0.82) continue;
      const mid = { x: x + SLAB / 2, y: GROUND, z: (z0 + z1) / 2 };
      if (!cam.sees(mid) || !inView(view, cam.project(mid), 120)) continue;
      const d = groundQuad(cam, x + 1, x + SLAB - 1, z0 + 1, z1 - 1);
      if (h <= 0.3) darker += d;
      else lighter += d;
      if (hash2(i, r, 2) > 0.9) {
        const pts: V3[] = [];
        const zz = z0 + 8 + 30 * hash2(i, r, 5);
        for (let k = 0; k <= 4; k++) pts.push({ x: x + 6 + k * 13, y: GROUND, z: zz + (k % 2 ? 5 : -3) * hash2(i, r, 6 + k) });
        const seg = pts.map((p) => cam.project(p));
        cracks += pathD(seg, false);
      }
    }
  }
  layers.push(<path key="slabDark" d={darker} fill={WF.slabDark} />);
  layers.push(<path key="slabLight" d={lighter} fill={WF.slabLight} />);
  // Granite bands across the plaza every few slabs: a rhythm that sells the speed.
  let bands = '';
  for (const x of repeats(SLAB * 2, SLAB * 6, scroll, X0 - 2000, X0 + 2000)) {
    const mid = { x, y: GROUND, z: 0 };
    if (!cam.sees(mid) && !cam.sees({ x, y: GROUND, z: PROM_Z })) continue;
    bands += groundQuad(cam, x - 7, x + 7, PROM_Z, near);
  }
  layers.push(<path key="bands" d={bands} fill={WF.band} />);
  layers.push(<path key="cracks" d={cracks} fill="none" stroke={WF.crack} strokeWidth={0.8} strokeLinejoin="round" opacity={0.75} />);

  // Old stains and gum spots: the plaza is well used.
  let stains = '';
  let gum = '';
  for (const { x, i } of repeatsIndexed(60, 340, scroll, X0 - 1400, X0 + 1400)) {
    for (let k = 0; k < 2; k++) {
      const cx = x + 300 * hash2(i, k, 50);
      const cz = -260 + 560 * hash2(i, k, 51);
      const mid = { x: cx, y: GROUND, z: cz };
      if (!cam.sees(mid) || !inView(view, cam.project(mid), 60)) continue;
      const r = 8 + 16 * hash2(i, k, 52);
      const blob: V3[] = [];
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2;
        const rr = r * (0.6 + 0.5 * hash2(i * 9 + j, k, 53));
        blob.push({ x: cx + Math.cos(a) * rr * 1.4, y: GROUND, z: cz + Math.sin(a) * rr });
      }
      stains += worldPath(cam, blob);
      for (let j = 0; j < 4; j++) {
        const g = { x: cx + 90 * (hash2(i, j, 54) - 0.5), y: GROUND, z: cz + 70 * (hash2(i, j, 55) - 0.5) };
        if (cam.sees(g)) gum += worldPath(cam, [g, { ...g, x: g.x + 2.2 }, { ...g, x: g.x + 2.2, z: g.z + 2 }, { ...g, z: g.z + 2 }]);
      }
    }
  }
  layers.push(<path key="stains" d={stains} fill={WF.stain} opacity={0.1} />);
  layers.push(<path key="gum" d={gum} fill={WF.stain} opacity={0.35} />);

  // Joints: the plaza's slabs, then the promenade's running bond.
  const joints: string[] = [];
  const pushLine = (a: V3, b: V3, into: string[]) => {
    const seg = cam.clip(a, b);
    if (!seg) return;
    const pa = cam.project(seg[0]);
    const pb = cam.project(seg[1]);
    into.push(`M${num(pa.x)} ${num(pa.y)}L${num(pb.x)} ${num(pb.y)}`);
  };
  for (const z of zRows) pushLine({ x: SPAN_LO, y: GROUND, z }, { x: SPAN_HI, y: GROUND, z }, joints);
  for (const x of repeats(0, SLAB, scroll)) pushLine({ x, y: GROUND, z: PROM_Z }, { x, y: GROUND, z: near }, joints);
  layers.push(<path key="joints" d={joints.join('')} fill="none" stroke={WF.joint} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />);

  const bond: string[] = [];
  const rowsZ: number[] = [];
  for (let z = PROM_Z; z > WALL_Z + 1; z -= 30) rowsZ.push(z);
  for (const z of rowsZ) pushLine({ x: SPAN_LO, y: GROUND, z }, { x: SPAN_HI, y: GROUND, z }, bond);
  for (let r = 0; r + 1 < rowsZ.length; r++) {
    for (const x of repeats(r % 2 ? 32 : 0, 64, scroll, X0 - 1600, X0 + 1600)) {
      pushLine({ x, y: GROUND, z: rowsZ[r] }, { x, y: GROUND, z: rowsZ[r + 1] }, bond);
    }
  }
  pushLine({ x: SPAN_LO, y: GROUND, z: WALL_Z }, { x: SPAN_HI, y: GROUND, z: WALL_Z }, bond);
  layers.push(<path key="bond" d={bond.join('')} fill="none" stroke={WF.paverJoint} strokeWidth={1} opacity={0.7} />);
  // A darker soldier course where the promenade meets the plaza.
  layers.push(<path key="soldier" d={groundQuad(cam, -40000, 40000, PROM_Z - 10, PROM_Z)} fill={WF.paverDark} />);

  // Skid marks and wax where the plaza gets skated: along the riding lane.
  let skids = '';
  for (const { x, i } of repeatsIndexed(140, 520, scroll, X0 - 1400, X0 + 1400)) {
    for (let k = 0; k < 3; k++) {
      const len = 30 + 70 * hash2(i, k, 7);
      const z = -46 + 92 * hash2(i, k, 8);
      const x0 = x + 160 * hash2(i, k, 9);
      skids += groundQuad(cam, x0, x0 + len, z, z + 1.6 + 1.6 * hash2(i, k, 10));
    }
  }
  layers.push(<path key="skids" d={skids} fill={WF.skid} opacity={0.13} />);

  // A manhole cover in the foreground, now and then.
  for (const { x, i } of repeatsIndexed(620, 1700, scroll, X0 - 1200, X0 + 1200)) {
    const ring = (r: number): V3[] => Array.from({ length: 20 }, (_, k) => {
      const a = (k / 20) * Math.PI * 2;
      return { x: x + Math.cos(a) * r, y: GROUND, z: 150 + Math.sin(a) * r };
    });
    const outer = worldPath(cam, ring(21));
    if (!outer) continue;
    let grid = '';
    for (let k = -2; k <= 2; k++) {
      const off = k * 6.5;
      const half = Math.sqrt(Math.max(0, 15 * 15 - off * off));
      const seg = cam.clip({ x: x - half, y: GROUND, z: 150 + off }, { x: x + half, y: GROUND, z: 150 + off });
      if (seg) grid += pathD(seg.map((p) => cam.project(p)), false);
    }
    layers.push(
      <g key={`manhole${i}`}>
        <path d={outer} fill={WF.grate} opacity={0.55} />
        <path d={worldPath(cam, ring(17))} fill="none" stroke={WF.concrete} strokeWidth={1} opacity={0.5} />
        <path d={grid} fill="none" stroke={WF.concrete} strokeWidth={0.9} opacity={0.45} />
      </g>,
    );
  }
  return layers;
}

// ---------- The set ----------

/** Palms and lamps alternate down the promenade; seats and planters between them. */
const PALMS: number[] = [120, 520];
const LAMPS: number[] = [330, 730];
const ROW_PERIOD = 800;
const BENCHES: number[] = [190];
const PLANTERS: number[] = [580];
const BINS: number[] = [432];

const LEDGES: Array<[number, number]> = [[0, 190], [290, 120], [500, 210]];

export function drawWaterfront(
  cam: Camera,
  scroll: number,
  ids: WaterfrontIds,
  view: ViewBox,
): { defs: ReactElement; layers: ReactElement[]; far: FarLayer[] } {
  const hy = cam.horizonY;
  const viewTop = view.y;
  const waterNear = cam.project({ x: X0, y: GROUND, z: WATER_Z });
  const plazaNear = cam.project({ x: X0, y: GROUND, z: 120 });
  const waterSpan = Math.max(20, waterNear.y - hy);
  const stop = (y: number) => `${(clamp01((y - hy) / waterSpan) * 100).toFixed(1)}%`;

  // The sky, the bay, and the far panorama are far layers: painted once and
  // slid, not repainted with the robot every frame. The water's gradient
  // follows the crane up with a pop, so only its layer is redrawn then.
  const far: FarLayer[] = [];
  const wide = { x: BLEED_L, width: BLEED_R - BLEED_L };
  const skyTop = viewTop - BLEED_Y;
  const skyHeight = Math.max(0, hy - skyTop + 1);
  const skyBox = band(view, viewTop - 1, hy + 1);
  if (skyBox) {
    far.push({
      key: 'sky',
      box: skyBox,
      defs: (
        <>
          <linearGradient id={ids.sky} x1="0" y1={viewTop - 40} x2="0" y2={hy} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={BAY.skyTop} />
            <stop offset="42%" stopColor={BAY.skyHigh} />
            <stop offset="74%" stopColor={BAY.belt} />
            <stop offset="91%" stopColor={BAY.skyLow} />
            <stop offset="100%" stopColor={BAY.horizon} />
          </linearGradient>
          {/* The sun is behind the viewer's right shoulder: its glow stays just past the frame's right edge. */}
          <radialGradient id={ids.glow} cx={Math.max(view.x + view.width + 110, X0 + cam.farScale * (420 - cam.pan))} cy={hy - 150} r={360} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={BAY.sun} stopOpacity="0.85" />
            <stop offset="40%" stopColor={BAY.sun} stopOpacity="0.32" />
            <stop offset="100%" stopColor={BAY.sun} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.belt} x1="0" y1={hy - 70} x2="0" y2={hy} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={BAY.belt} stopOpacity="0" />
            <stop offset="55%" stopColor={BAY.belt} stopOpacity="0.4" />
            <stop offset="88%" stopColor={BAY.earthShadow} stopOpacity="0.35" />
            <stop offset="100%" stopColor={BAY.horizon} stopOpacity="0.2" />
          </linearGradient>
        </>
      ),
      art: (
        <>
          <rect key="sky" {...wide} y={skyTop} height={skyHeight} fill={`url(#${ids.sky})`} />
          <rect key="glow" {...wide} y={skyTop} height={skyHeight} fill={`url(#${ids.glow})`} />
          <rect key="belt" {...wide} y={hy - 70} height={70} fill={`url(#${ids.belt})`} />
        </>
      ),
    });
  }
  // The bay runs to the horizon; the plaza is laid over it further down.
  const waterBox = band(view, hy - 1, view.y + view.height + 1);
  if (waterBox) {
    far.push({
      key: 'water',
      box: waterBox,
      defs: (
        <linearGradient id={ids.water} x1="0" y1={hy} x2="0" y2={waterNear.y} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={BAY.waterHorizon} />
          <stop offset={stop(hy + 10)} stopColor={BAY.waterHigh} />
          <stop offset={stop(hy + waterSpan * 0.45)} stopColor={BAY.waterMid} />
          <stop offset="100%" stopColor={BAY.waterNear} />
        </linearGradient>
      ),
      art: <rect {...wide} y={hy} height={Math.max(0, view.y + view.height + BLEED_Y - hy)} fill={`url(#${ids.water})`} />,
    });
  }
  const tiles = panorama(`url(#${ids.cloud})`);
  const cloudDefs = (
    <linearGradient id={ids.cloud} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={BAY.cloudTop} />
      <stop offset="55%" stopColor={BAY.cloudMid} />
      <stop offset="100%" stopColor={BAY.cloudBottom} />
    </linearGradient>
  );
  for (const part of ['reflection', 'art'] as const) {
    for (const tile of tiles) {
      const layer = tileLayer(cam, tile, part, scroll, hy, view);
      // The clouds paint with a gradient of their own.
      if (layer) far.push(tile.key === 'clouds' ? { ...layer, defs: cloudDefs } : layer);
    }
  }

  const defs = (
    <>
      <linearGradient id={ids.ground} x1="0" y1={hy} x2="0" y2={plazaNear.y} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={WF.concreteFar} />
        <stop offset="100%" stopColor={WF.concrete} />
      </linearGradient>
      <linearGradient id={ids.haze} x1="0" y1={hy - 26} x2="0" y2={hy + 14} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={BAY.horizon} stopOpacity="0" />
        <stop offset="72%" stopColor={BAY.horizon} stopOpacity="0.45" />
        <stop offset="100%" stopColor={BAY.horizon} stopOpacity="0" />
      </linearGradient>
      <radialGradient id={ids.lamp}>
        <stop offset="0%" stopColor={WF.lampGlow} stopOpacity="0.75" />
        <stop offset="35%" stopColor={WF.lampGlow} stopOpacity="0.3" />
        <stop offset="100%" stopColor={WF.lampGlow} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.wash} x1={view.x + view.width} y1={view.y} x2={view.x} y2={view.y + view.height} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffd2a1" stopOpacity="0.24" />
        <stop offset="50%" stopColor="#ffd2a1" stopOpacity="0" />
        <stop offset="78%" stopColor="#5b4aa8" stopOpacity="0" />
        <stop offset="100%" stopColor="#5b4aa8" stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id={ids.air} x1="0" y1={hy - 60} x2="0" y2={hy + 50} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={BAY.horizon} stopOpacity="0" />
        <stop offset="50%" stopColor={BAY.horizon} stopOpacity="0.32" />
        <stop offset="62%" stopColor={BAY.horizon} stopOpacity="0.32" />
        <stop offset="100%" stopColor={BAY.horizon} stopOpacity="0" />
      </linearGradient>
      <radialGradient id={ids.vignette} cx={view.x + view.width / 2} cy={view.y + view.height * 0.5} r={Math.hypot(view.width, view.height) * 0.6} gradientUnits="userSpaceOnUse">
        <stop offset="55%" stopColor="#2a1f5c" stopOpacity="0" />
        <stop offset="100%" stopColor="#2a1f5c" stopOpacity="0.26" />
      </radialGradient>
    </>
  );

  const layers: ReactElement[] = [];
  layers.push(<rect key="haze" {...wide} y={hy - 26} height={40} fill={`url(#${ids.haze})`} />);
  layers.push(gulls(cam, scroll, hy));
  layers.push(ripples(cam, scroll, view));
  layers.push(<g key="boats">{boats(cam, scroll, view)}</g>);

  // The plaza, laid over the bay up to the sea wall.
  layers.push(<path key="ground" d={groundQuad(cam, -40000, 40000, WATER_Z, 2600)} fill={`url(#${ids.ground})`} />);
  layers.push(...plazaGround(cam, scroll, view));

  // Props, gathered by row so each row's shadows go down before any prop.
  const shadows: string[] = [];
  let grates = '';
  const seats: Item[] = [];
  const trees: Item[] = [];
  const ledges: Item[] = [];
  const anchors: Anchor[] = [];
  const palmsAt = (offsets: number[], z: number, into: Item[], minZ: number, salt: number) => {
    for (const offset of offsets) {
      for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
        const idx = i * 7 + offset + salt;
        if (z === TREE_Z) anchors.push({ x, h: 150, key: `palm${idx}` });
        const item = palm(cam, x, z, idx, view);
        if (!item) continue;
        into.push(item);
        shadows.push(...palmShadow(cam, x, z, idx, minZ));
        grates += groundQuad(cam, x - 18, x + 18, z - 18, z + 18);
      }
    }
  };
  const lampsAt = (offsets: number[], z: number, into: Item[], minZ: number) => {
    for (const offset of offsets) {
      for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
        if (z === TREE_Z) anchors.push({ x, h: 136, key: `lamp${offset}_${i}` });
        const item = lamp(cam, x, z, `lamp${offset}_${i}`, `url(#${ids.lamp})`, view);
        if (!item) continue;
        into.push(item);
        shadows.push(lampShadow(cam, x, z, minZ));
      }
    }
  };
  const benchesAt = (offsets: number[], z: number, facing: 1 | -1, into: Item[], minZ: number) => {
    for (const offset of offsets) {
      for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
        const b = bench(cam, x, z, `bench${offset}_${i}`, facing);
        if (!b) continue;
        into.push(b.item);
        shadows.push(shadowPath(cam, boxCorners(b.shadow), 1, minZ));
      }
    }
  };

  palmsAt(PALMS, TREE_Z, trees, WATER_Z, 0);
  lampsAt(LAMPS, TREE_Z, trees, WATER_Z);
  benchesAt(BENCHES, SEAT_Z, 1, seats, WATER_Z);
  for (const offset of PLANTERS) {
    for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
      const p = planter(cam, x, SEAT_Z, i * 7 + offset);
      if (!p) continue;
      seats.push(p.item);
      shadows.push(shadowPath(cam, boxCorners(p.shadow), 1, WATER_Z));
    }
  }
  for (const offset of BINS) {
    for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
      const b = bin(cam, x, SEAT_Z - 8, `bin${offset}_${i}`, view);
      if (!b) continue;
      seats.push(b.item);
      shadows.push(shadowPath(cam, b.shadow, 7, WATER_Z));
    }
  }
  for (const [offset, len] of LEDGES) {
    for (const { x, i } of repeatsIndexed(offset, ROW_PERIOD, scroll)) {
      const item = ledge(cam, x, len, i * 3 + offset);
      if (!item) continue;
      ledges.push(item);
      shadows.push(shadowPath(cam, boxCorners(boxOnGround(x, x + len, LEDGE_FRONT_Z - LEDGE_DEPTH, LEDGE_FRONT_Z, LEDGE_H)), 0.5));
    }
  }
  trees.push(...stringLights(cam, anchors, view));

  // Iron grates round the palms' roots, then every prop's shadow.
  layers.push(<path key="grates" d={grates} fill={WF.grate} stroke={mixHex(WF.grate, PALETTE.ink, 0.3)} strokeWidth={0.8} />);
  layers.push(<g key="propShadows" fill={PALETTE.shadow} opacity={0.26}>{shadows.filter(Boolean).map((d, i) => <path key={i} d={d} />)}</g>);
  const byDepth = (items: Item[]) => items.sort((p, q) => p.depth - q.depth).map((it) => it.el);
  layers.push(...seaWall(cam, scroll, view));
  layers.push(<g key="seats">{byDepth(seats)}</g>);
  layers.push(<g key="trees">{byDepth(trees)}</g>);
  layers.push(<g key="ledges">{byDepth(ledges)}</g>);

  // Air: distance fades everything near the horizon into the haze, so a
  // long look down the promenade recedes instead of staying crisp to the end.
  layers.push(<rect key="air" {...wide} y={hy - 60} height={110} fill={`url(#${ids.air})`} />);
  // Light over the whole set: a warm wash from the sun's side, cool shade
  // opposite, and a soft vignette.
  const full = { x: view.x - 10, y: view.y - 10, width: view.width + 20, height: view.height + 20 };
  layers.push(<rect key="wash" {...full} fill={`url(#${ids.wash})`} />);
  layers.push(<rect key="vignette" {...full} fill={`url(#${ids.vignette})`} />);
  return { defs, layers, far };
}

