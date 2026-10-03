import type { ReactElement } from 'react';
import { X0 } from '../TrickAnimation';
import type { Camera, ViewBox } from '../scene/camera';
import { clamp01 } from '../scene/math';
import { BLEED_L, BLEED_R, BLEED_Y, band, num, type FarLayer } from '../scene/setKit';
import { tileLayer, waterfrontIds } from '../scene/waterfront';
import { BAY, panorama } from '../scene/waterfrontPanorama';
import { WATER_Z } from '../scene/waterfrontProps';
import { ASPHALT } from './view';

/**
 * The waterfront's far panorama for TrickScene3D: the afterglow sky, the bay,
 * the city, shore, bridge, and clouds with their reflections, the horizon
 * haze, and the gulls. All of it sits at infinity, so it is TrickScene's own
 * art, laid out exactly as drawWaterfront lays it out, in SVG layers under
 * the WebGL canvas — vector-sharp at any zoom, and only slid by the browser
 * as the street drifts. The canvas is see-through wherever the 3D set
 * doesn't cover it.
 */

const percent = (share: number) => `${(share * 100).toFixed(4)}%`;

/** One far layer as its own SVG, framed to the picture (TrickScene's FarSvg). */
function FarSvg({ layer, view }: { layer: FarLayer; view: ViewBox }) {
  const { box, shift } = layer;
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: percent((box.x - view.x) / view.width),
        top: percent((box.y - view.y) / view.height),
        width: percent(box.width / view.width),
        height: percent(box.height / view.height),
        maxWidth: 'none',
        pointerEvents: 'none',
        ...(shift === undefined ? null : { transform: `translateX(${percent(shift / box.width)})`, willChange: 'transform' }),
      }}
    >
      {layer.defs && <defs>{layer.defs}</defs>}
      {layer.art}
    </svg>
  );
}

/** Gulls wheeling over the bay: [u, y above the horizon, phase] (waterfront.tsx). */
const GULLS: Array<[number, number, number]> = [[-170, -98, 0], [-148, -110, 1.7], [-128, -94, 3.1], [70, -152, 0.8], [318, -104, 2.2], [342, -96, 4]];

function farLayers(cam: Camera, scroll: number, view: ViewBox, idBase: string): FarLayer[] {
  const ids = waterfrontIds(idBase);
  const hy = cam.horizonY;
  const viewTop = view.y;
  // The bay's gradient reaches its near color at the sea wall, on the 3D set's asphalt.
  const waterNear = cam.project({ x: X0, y: ASPHALT, z: WATER_Z });
  const waterSpan = Math.max(20, waterNear.y - hy);
  const stop = (y: number) => `${(clamp01((y - hy) / waterSpan) * 100).toFixed(1)}%`;
  const wide = { x: BLEED_L, width: BLEED_R - BLEED_L };
  const far: FarLayer[] = [];

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
      if (layer) far.push(tile.key === 'clouds' ? { ...layer, defs: cloudDefs } : layer);
    }
  }

  // The horizon haze and the gulls, over the panorama and under everything near.
  const k = cam.farScale;
  let gulls = '';
  for (const [u, y, phase] of GULLS) {
    const x = X0 + k * (u - cam.pan - scroll * cam.drift * 0.05);
    const cy = hy + y * k;
    const flap = Math.sin(scroll * 0.045 + phase * 2.1);
    const w = 4.6 * k;
    const lift = (1.6 + 1.8 * flap) * k;
    gulls += `M${num(x - w)} ${num(cy - lift * 0.4)}Q${num(x - w * 0.45)} ${num(cy - lift)} ${num(x)} ${num(cy)}`;
    gulls += `Q${num(x + w * 0.45)} ${num(cy - lift)} ${num(x + w)} ${num(cy - lift * 0.4)}`;
  }
  const airBox = band(view, hy - 200 * k, hy + 16);
  if (airBox) {
    far.push({
      key: 'haze',
      box: airBox,
      defs: (
        <linearGradient id={ids.haze} x1="0" y1={hy - 26} x2="0" y2={hy + 14} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={BAY.horizon} stopOpacity="0" />
          <stop offset="72%" stopColor={BAY.horizon} stopOpacity="0.45" />
          <stop offset="100%" stopColor={BAY.horizon} stopOpacity="0" />
        </linearGradient>
      ),
      art: (
        <>
          <rect {...wide} y={hy - 26} height={40} fill={`url(#${ids.haze})`} />
          <path d={gulls} fill="none" stroke={BAY.gull} strokeWidth={1.05 * k} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
        </>
      ),
    });
  }
  return far;
}

export default function WaterfrontFar({ cam, scroll, view, idBase }: { cam: Camera; scroll: number; view: ViewBox; idBase: string }): ReactElement {
  return <>{farLayers(cam, scroll, view, idBase).map((layer) => <FarSvg key={layer.key} layer={layer} view={view} />)}</>;
}
