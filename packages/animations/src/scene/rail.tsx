import type { ReactElement } from 'react';
import { GROUND } from '../TrickAnimation';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { OUTLINE } from './draw';
import { mixHex, pathOf, type V3 } from './math';
import { BAR_HALF, BAR_TOP_Y, BAR_Z } from './grindDefinitions';

/**
 * The flat bar for TrickScene grinds: one square steel tube on two square
 * posts, in the plaza's ledge paint with a top worn back to bare metal.
 * Plain boxes, lit like the ledges and outlined like the board, so it sits
 * in the foreground with the rider without adding detail to read.
 */

/** Posts sit this far in from each end of the bar. */
const POST_INSET = 46;
const POST_HALF = 2.1;
const PAINT = PALETTE.paint;
const WORN = mixHex(PALETTE.paint, PALETTE.metal, 0.6);

export interface BarSpan {
  /** World x of the bar's two ends, x0 < x1. */
  x0: number;
  x1: number;
}

interface Box {
  x0: number;
  x1: number;
  /** World y of the top and bottom (y is down, so top < bottom). */
  top: number;
  bottom: number;
  z0: number;
  z1: number;
}

function boxes(span: BarSpan): { bar: Box; posts: Box[] } {
  const bar: Box = { x0: span.x0, x1: span.x1, top: BAR_TOP_Y, bottom: BAR_TOP_Y + 2 * BAR_HALF, z0: BAR_Z - BAR_HALF, z1: BAR_Z + BAR_HALF };
  const post = (x: number): Box => ({
    x0: x - POST_HALF,
    x1: x + POST_HALF,
    top: bar.bottom,
    bottom: GROUND,
    z0: BAR_Z - POST_HALF,
    z1: BAR_Z + POST_HALF,
  });
  return { bar, posts: [post(span.x0 + POST_INSET), post(span.x1 - POST_INSET)] };
}

const corners = (b: Box): V3[] => {
  const out: V3[] = [];
  for (const x of [b.x0, b.x1]) for (const y of [b.top, b.bottom]) for (const z of [b.z0, b.z1]) out.push({ x, y, z });
  return out;
};

function drawBox(cam: Camera, b: Box, key: string, ow: number, top: string): ReactElement {
  const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const faces: Array<{ n: V3; pts: V3[]; color: string }> = [
    { n: { x: 0, y: -1, z: 0 }, pts: [P(b.x0, b.top, b.z0), P(b.x1, b.top, b.z0), P(b.x1, b.top, b.z1), P(b.x0, b.top, b.z1)], color: top },
    { n: { x: 0, y: 1, z: 0 }, pts: [P(b.x0, b.bottom, b.z0), P(b.x1, b.bottom, b.z0), P(b.x1, b.bottom, b.z1), P(b.x0, b.bottom, b.z1)], color: PAINT },
    { n: { x: 0, y: 0, z: 1 }, pts: [P(b.x0, b.top, b.z1), P(b.x1, b.top, b.z1), P(b.x1, b.bottom, b.z1), P(b.x0, b.bottom, b.z1)], color: PAINT },
    { n: { x: 0, y: 0, z: -1 }, pts: [P(b.x0, b.top, b.z0), P(b.x1, b.top, b.z0), P(b.x1, b.bottom, b.z0), P(b.x0, b.bottom, b.z0)], color: PAINT },
    { n: { x: -1, y: 0, z: 0 }, pts: [P(b.x0, b.top, b.z0), P(b.x0, b.top, b.z1), P(b.x0, b.bottom, b.z1), P(b.x0, b.bottom, b.z0)], color: PAINT },
    { n: { x: 1, y: 0, z: 0 }, pts: [P(b.x1, b.top, b.z0), P(b.x1, b.top, b.z1), P(b.x1, b.bottom, b.z1), P(b.x1, b.bottom, b.z0)], color: PAINT },
  ];
  const els: ReactElement[] = [];
  for (const [i, face] of faces.entries()) {
    const c = face.pts.reduce((m, p) => ({ x: m.x + p.x / 4, y: m.y + p.y / 4, z: m.z + p.z / 4 }), { x: 0, y: 0, z: 0 });
    if (!facesCamera(cam, c, face.n)) continue;
    const pts = cam.clipPolygon(face.pts);
    if (pts.length < 3) continue;
    els.push(
      <path key={i} d={pathOf(pts.map((p) => cam.project(p)))} fill={tone(face.color, lambert(face.n))}
        stroke={PALETTE.ink} strokeWidth={ow} strokeLinejoin="round" />,
    );
  }
  return <g key={key}>{els}</g>;
}

/** The bar, posts first (farthest first) so the tube paints over their tops. */
export function drawBar(cam: Camera, span: BarSpan): ReactElement {
  const { bar, posts } = boxes(span);
  const s = cam.project({ x: (span.x0 + span.x1) / 2, y: BAR_TOP_Y, z: BAR_Z }).s;
  // Thinner ink than the board: the tube is only a few units across, and a
  // full outline on each face would leave no paint showing.
  const ow = OUTLINE * s * 0.8;
  const sorted = posts
    .map((p, i) => ({ p, i, depth: cam.depthOf({ x: (p.x0 + p.x1) / 2, y: p.top, z: BAR_Z }) }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <g>
      {sorted.map(({ p, i }) => drawBox(cam, p, `post${i}`, ow, PAINT))}
      {drawBox(cam, bar, 'tube', ow, WORN)}
    </g>
  );
}

/** Solids whose cast shadows make up the bar's shadow on the ground. */
export function barShadowParts(span: BarSpan): V3[][] {
  const { bar, posts } = boxes(span);
  return [corners(bar), ...posts.map(corners)];
}
