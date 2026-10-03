import type { ReactElement } from 'react';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { cross3, norm3, pathOf, sub3, type V3 } from './math';
import { DECK_HALF_WIDTH, type BoardRig } from './skeleton';

/**
 * The deck: its shape, and how it is drawn.
 *
 * The shape is a popsicle: flat between the trucks, kicked up past them into
 * a nose and tail that curl harder toward the tip, with round ends.
 *
 * It is drawn as a closed surface of small facets (grip, underside, ply band
 * and the printed stripe) instead of two whole faces and a band. Each facet
 * decides for itself whether it faces the camera, and the ones that do are
 * painted far to near. A kick that curls toward the camera therefore shows its
 * underside and hides the grip behind it, where one global "which face is up"
 * choice painted the grip over everything and let the layers show through
 * each other.
 *
 * Ink goes only where a line belongs: along the contour where the surface
 * folds away from the camera, and along the crease where the grip or the
 * underside meets the ply. Each line is painted with the facet it belongs to,
 * so a nearer part of the deck covers it like anything else.
 */

export const TIP_X = 48;
export const THICKNESS = 2.4;
const KICK_FROM = 28;
const KICK_RISE = 8.4;
const KICK_CURL = 1.3;
const MID_Y = -1;
const HALF_W = DECK_HALF_WIDTH;
const CORNER_R = 9.5;
/** Segments along the deck. */
const SAMPLES = 28;
/** Printed stripe on the underside: how far along the deck it runs and how wide. */
const STRIPE_X = 30;
const STRIPE_HALF_W = 3.2;
/** How far the stripe is lifted off the underside so the two never tie. */
const STRIPE_LIFT = 0.15;

const DECK_PROFILE: ReadonlyArray<[number, number]> = (() => {
  const nose: Array<[number, number]> = [];
  for (let x = KICK_FROM; x <= TIP_X; x += 2) nose.push([x, MID_Y - KICK_RISE * ((x - KICK_FROM) / (TIP_X - KICK_FROM)) ** KICK_CURL]);
  const tail = nose.map(([x, y]): [number, number] => [-x, y]).reverse();
  return [...tail, [-8, MID_Y - 0.1], [0, MID_Y], [8, MID_Y - 0.1], ...nose];
})();

/** Board-local y of the deck's midplane at `x`. */
export function kickY(x: number): number {
  if (x <= DECK_PROFILE[0][0]) return DECK_PROFILE[0][1];
  for (let i = 1; i < DECK_PROFILE.length; i++) {
    const [x0, y0] = DECK_PROFILE[i - 1];
    const [x1, y1] = DECK_PROFILE[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return DECK_PROFILE[DECK_PROFILE.length - 1][1];
}

/** Board-local y of the grip and of the underside at `x` along the deck. */
export const deckTopY = (x: number) => kickY(x) - THICKNESS / 2;
export const deckBottomY = (x: number) => kickY(x) + THICKNESS / 2;

/** Half the deck's width at `x` along it: full through the middle, rounded off at the tips. */
export function halfWidth(x: number): number {
  const ax = Math.abs(x);
  const start = TIP_X - CORNER_R;
  if (ax <= start) return HALF_W;
  const u = (ax - start) / CORNER_R;
  return u >= 1 ? 0 : HALF_W * Math.sqrt(1 - u * u);
}

/** Stations along the deck, bunched toward the tips so the rounded ends stay round. */
const stationX = (i: number) => -TIP_X * Math.cos((Math.PI * i) / SAMPLES);

/** The deck's planform at one face (offsetY from the midplane), around once. */
function outline(offsetY: number): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = stationX(i);
    pts.push({ x, y: kickY(x) + offsetY, z: -halfWidth(x) });
  }
  for (let i = SAMPLES - 1; i >= 1; i--) {
    const x = stationX(i);
    pts.push({ x, y: kickY(x) + offsetY, z: halfWidth(x) });
  }
  return pts;
}

export const TOP_LOCAL = outline(-THICKNESS / 2);
export const BOTTOM_LOCAL = outline(THICKNESS / 2);

// ----- Facets -----

type Kind = 'top' | 'bottom' | 'band' | 'stripe';

interface Facet {
  kind: Kind;
  /** Board-local corners. A tip facet has a repeated corner (a triangle). */
  pts: V3[];
  /** Board-local centroid and outward unit normal. */
  c: V3;
  n: V3;
}

/** An edge two facets share, where ink may belong. */
interface Seam {
  a: number;
  b: number;
  p: V3;
  q: V3;
}

const outward = (pts: V3[], toward: V3): V3 => {
  // Cross of the diagonals: right for quads and triangles with a repeated corner alike.
  const n = norm3(cross3(sub3(pts[2], pts[0]), sub3(pts[3], pts[1])));
  return n.x * toward.x + n.y * toward.y + n.z * toward.z < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
};

const facet = (kind: Kind, pts: V3[], toward: V3): Facet => ({
  kind,
  pts,
  c: {
    x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
    y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4,
    z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4,
  },
  n: outward(pts, toward),
});

const { FACETS, SEAMS } = (() => {
  const h = THICKNESS / 2;
  const st = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const x = stationX(i);
    return { x, y: kickY(x), w: halfWidth(x) };
  });
  type Station = (typeof st)[number];
  // A point on the face `dy` off the midplane, at a side (-1 left, +1 right).
  const at = (s: Station, dy: number, side: -1 | 1): V3 => ({ x: s.x, y: s.y + dy, z: side * s.w });
  const UP: V3 = { x: 0, y: -1, z: 0 };
  const DOWN: V3 = { x: 0, y: 1, z: 0 };
  const facets: Facet[] = [];
  // Layout: top strips, underside strips, left band, right band, then the stripe.
  for (let i = 0; i < SAMPLES; i++) {
    const [a, b] = [st[i], st[i + 1]];
    facets.push(facet('top', [at(a, -h, -1), at(b, -h, -1), at(b, -h, 1), at(a, -h, 1)], UP));
  }
  for (let i = 0; i < SAMPLES; i++) {
    const [a, b] = [st[i], st[i + 1]];
    facets.push(facet('bottom', [at(a, h, -1), at(b, h, -1), at(b, h, 1), at(a, h, 1)], DOWN));
  }
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < SAMPLES; i++) {
      const [a, b] = [st[i], st[i + 1]];
      facets.push(facet('band', [at(a, -h, side), at(b, -h, side), at(b, h, side), at(a, h, side)], { x: 0, y: 0, z: side }));
    }
  }
  const top = (i: number) => i;
  const bottom = (i: number) => SAMPLES + i;
  const band = (side: -1 | 1, i: number) => 2 * SAMPLES + (side === -1 ? 0 : SAMPLES) + i;
  for (let i = 0; i < SAMPLES; i++) {
    const [a, b] = [st[i], st[i + 1]];
    const stripeLo = Math.max(a.x, -STRIPE_X);
    const stripeHi = Math.min(b.x, STRIPE_X);
    if (stripeLo >= stripeHi) continue;
    const y = (x: number) => kickY(x) + h + STRIPE_LIFT;
    facets.push(facet('stripe', [
      { x: stripeLo, y: y(stripeLo), z: -STRIPE_HALF_W }, { x: stripeHi, y: y(stripeHi), z: -STRIPE_HALF_W },
      { x: stripeHi, y: y(stripeHi), z: STRIPE_HALF_W }, { x: stripeLo, y: y(stripeLo), z: STRIPE_HALF_W },
    ], DOWN));
  }
  const seams: Seam[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const [a, b] = [st[i], st[i + 1]];
    for (const side of [-1, 1] as const) {
      // Where the grip and the underside meet the ply along each long edge.
      seams.push({ a: top(i), b: band(side, i), p: at(a, -h, side), q: at(b, -h, side) });
      seams.push({ a: bottom(i), b: band(side, i), p: at(a, h, side), q: at(b, h, side) });
    }
    if (i === SAMPLES - 1) continue;
    // Where neighbours meet: a line only if the surface folds away there.
    seams.push({ a: top(i), b: top(i + 1), p: at(b, -h, -1), q: at(b, -h, 1) });
    seams.push({ a: bottom(i), b: bottom(i + 1), p: at(b, h, -1), q: at(b, h, 1) });
    for (const side of [-1, 1] as const) seams.push({ a: band(side, i), b: band(side, i + 1), p: at(b, -h, side), q: at(b, h, side) });
  }
  // The two sides of the ply meet at each tip.
  for (const i of [0, SAMPLES]) {
    const s = st[i];
    seams.push({ a: band(-1, Math.min(i, SAMPLES - 1)), b: band(1, Math.min(i, SAMPLES - 1)), p: at(s, -h, 1), q: at(s, h, 1) });
  }
  return { FACETS: facets, SEAMS: seams };
})();

export interface DeckPaint {
  grip: string;
  graphic: string;
  stripe: string;
  /** Ink width in pixels, where a contour or crease is drawn. */
  ink: number;
}

/** Ink strip widths, in line widths: a contour's lies outside the deck, a
 *  crease's on the grip or underside next to the ply. */
const CONTOUR = 0.62;
const CREASE = 0.8;
/** How far, in strip widths, a strip runs past each end of its edge. */
const JOIN = 0.5;
/** How far past its facet's depth an ink strip is painted, so it lands on top of it. */
const INK_LIFT = 0.02;
/** A facet sits this far in front of the underside it is printed on. */
const STRIPE_DEPTH = 0.05;

export function drawDeck(cam: Camera, board: BoardRig, paint: DeckPaint): ReactElement {
  const count = FACETS.length;
  const seen = new Array<boolean>(count);
  const depth = new Array<number>(count);
  const normal = new Array<V3>(count);
  for (let k = 0; k < count; k++) {
    const f = FACETS[k];
    const c = board.point(f.c);
    normal[k] = board.dir(f.n);
    seen[k] = facesCamera(cam, c, normal[k]);
    depth[k] = cam.project(c).depth + (f.kind === 'stripe' ? STRIPE_DEPTH : 0);
  }
  const items: Array<{ depth: number; el: ReactElement }> = [];
  for (let k = 0; k < count; k++) {
    if (!seen[k]) continue;
    const f = FACETS[k];
    const fill = f.kind === 'top'
      ? paint.grip
      : f.kind === 'bottom'
        ? paint.graphic
        : f.kind === 'stripe'
          ? paint.stripe
          : tone(PALETTE.ply, lambert(normal[k]));
    // The stroke in the facet's own color closes the hairline gaps between neighbours.
    items.push({
      depth: depth[k],
      el: <path key={`f${k}`} d={pathOf(f.pts.map((p) => cam.project(board.point(p))))} fill={fill} stroke={fill} strokeWidth={0.6} strokeLinejoin="round" />,
    });
  }
  SEAMS.forEach((seam, j) => {
    const [va, vb] = [seen[seam.a], seen[seam.b]];
    // A contour (one side faces away) or a crease (grip or underside meets the ply).
    const contour = va !== vb;
    const crease = va && vb && FACETS[seam.a].kind !== FACETS[seam.b].kind;
    if (!contour && !crease) return;
    const p = cam.project(board.point(seam.p));
    const q = cam.project(board.point(seam.q));
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.05) return;
    // The strip lies on one side of the edge only, so it never reaches into a
    // neighbouring facet: outside the deck for a contour, on the grip or
    // underside for a crease. `from` is the facet whose side that is.
    const owner = contour ? (va ? seam.a : seam.b) : FACETS[seam.a].kind === 'band' ? seam.b : seam.a;
    const c = cam.project(board.point(FACETS[owner].c));
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const toward = Math.sign(nx * (c.x - (p.x + q.x) / 2) + ny * (c.y - (p.y + q.y) / 2)) || 1;
    const w = paint.ink * (contour ? -CONTOUR : CREASE) * toward;
    const [ox, oy] = [nx * w, ny * w];
    // Each strip runs a little past both ends along its edge so neighbours
    // overlap instead of leaving a wedge where the outline turns.
    const [ex, ey] = [((q.x - p.x) / len) * Math.abs(w) * JOIN, ((q.y - p.y) / len) * Math.abs(w) * JOIN];
    const pts = [
      [p.x - ex, p.y - ey], [q.x + ex, q.y + ey], [q.x + ex + ox, q.y + ey + oy], [p.x - ex + ox, p.y - ey + oy],
    ];
    items.push({
      depth: (contour ? depth[owner] : Math.max(depth[seam.a], depth[seam.b])) + INK_LIFT,
      el: <path key={`s${j}`} d={`M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`} fill={PALETTE.ink} />,
    });
  });
  items.sort((a, b) => a.depth - b.depth);
  return <g key="deck">{items.map((item) => item.el)}</g>;
}
