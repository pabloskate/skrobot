import type { ReactElement } from 'react';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { OUTLINE } from './draw';
import { cross3, dot3, hull, norm3, pathOf, rad, sub3, type P2, type V3 } from './math';
import { DECK_HALF_WIDTH, type BoardRig } from './rig';

/**
 * Skateboard for TrickScene: a solid popsicle deck (grip top, painted
 * bottom, maple ply band) on silver trucks and cream wheels. The deck keeps
 * the physics renderers' dimensions — 96 long, kicked nose and tail — so
 * foot targets land where the trick engine expects.
 *
 * Parts are painted with their own outlines (not merged like the robot):
 * the board is small and reads better when wheels and deck stay separate.
 */

const DECK_PROFILE: ReadonlyArray<[number, number]> = [
  [-48, -8.4], [-42, -6.4], [-36, -4], [-28, -2.2], [-16, -1.4], [0, -1.1],
  [16, -1.4], [28, -2.2], [36, -4], [42, -6.4], [48, -8.4],
];
const TIP_X = 48;
const HALF_W = DECK_HALF_WIDTH;
const CORNER_R = 9.5;
const SAMPLES = 36;
const THICKNESS = 2;
const WHEEL_X = 28;
const WHEEL_Y = 8.4;
const WHEEL_Z = 7.2;
const WHEEL_R = 4.6;
const WHEEL_HALF_W = 2.1;

function kickY(x: number): number {
  if (x <= DECK_PROFILE[0][0]) return DECK_PROFILE[0][1];
  for (let i = 1; i < DECK_PROFILE.length; i++) {
    const [x0, y0] = DECK_PROFILE[i - 1];
    const [x1, y1] = DECK_PROFILE[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return DECK_PROFILE[DECK_PROFILE.length - 1][1];
}

function halfWidth(x: number): number {
  const ax = Math.abs(x);
  const start = TIP_X - CORNER_R;
  if (ax <= start) return HALF_W;
  const u = (ax - start) / CORNER_R;
  return u >= 1 ? 0 : HALF_W * Math.sqrt(1 - u * u);
}

function outline(offsetY: number): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = -TIP_X + (2 * TIP_X * i) / SAMPLES;
    pts.push({ x, y: kickY(x) + offsetY, z: -halfWidth(x) });
  }
  for (let i = SAMPLES - 1; i >= 1; i--) {
    const x = -TIP_X + (2 * TIP_X * i) / SAMPLES;
    pts.push({ x, y: kickY(x) + offsetY, z: halfWidth(x) });
  }
  return pts;
}

const TOP_LOCAL = outline(-THICKNESS / 2);
const BOTTOM_LOCAL = outline(THICKNESS / 2);
const RAIL_STEP = 3;

interface Part {
  depth: number;
  el: ReactElement;
}

export interface BoardLook {
  /** Painted underside. */
  graphic: string;
  /** Stripe across the underside graphic. */
  stripe: string;
}

/** Outline samples plus wheel bottoms, for the cast ground shadow. */
export function boardShadowPoints(board: BoardRig): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < TOP_LOCAL.length; i += 3) pts.push(board.point(TOP_LOCAL[i]));
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    for (const wz of [-WHEEL_Z, WHEEL_Z]) pts.push(board.point({ x: tx, y: WHEEL_Y + WHEEL_R, z: wz }));
  }
  return pts;
}

export function drawBoard(cam: Camera, board: BoardRig, look: BoardLook): ReactElement {
  const s = cam.project(board.center).s;
  const ow = 2 * OUTLINE * s * 0.85;
  const up = norm3(board.dir({ x: 0, y: -1, z: 0 }));
  const seeingTop = facesCamera(cam, board.center, up);
  const top = TOP_LOCAL.map(board.point);
  const bottom = BOTTOM_LOCAL.map(board.point);
  const topPath = pathOf(top.map((p) => cam.project(p)));
  const bottomPath = pathOf(bottom.map((p) => cam.project(p)));
  const lamUp = lambert(up);
  const gripFill = tone(PALETTE.grip, lamUp);
  const graphicFill = tone(look.graphic, 1 - lamUp);

  // Ply band: back-face culled quads between the two faces.
  const rails: ReactElement[] = [];
  for (let i = 0; i < top.length; i += RAIL_STEP) {
    const j = (i + RAIL_STEP) % top.length;
    const q = [top[i], top[j], bottom[j], bottom[i]];
    let n = cross3(sub3(q[1], q[0]), sub3(q[3], q[0]));
    const m = Math.hypot(n.x, n.y, n.z);
    if (m < 1e-6) continue;
    n = { x: n.x / m, y: n.y / m, z: n.z / m };
    if (dot3(n, sub3(q[0], board.center)) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
    if (!facesCamera(cam, q[0], n)) continue;
    const fill = tone(PALETTE.ply, lambert(n));
    rails.push(<path key={`r${i}`} d={pathOf(q.map((p) => cam.project(p)))} fill={fill} stroke={fill} strokeWidth={0.6} />);
  }

  // Underside stripe, lifted off the face so it never z-fights.
  let stripe: ReactElement | null = null;
  if (!seeingTop) {
    const y = (x: number) => kickY(x) + THICKNESS / 2 + 0.15;
    const pts: V3[] = [];
    for (const x of [-30, -10, 10, 30]) pts.push({ x, y: y(x), z: -3.2 });
    for (const x of [30, 10, -10, -30]) pts.push({ x, y: y(x), z: 3.2 });
    const fill = tone(look.stripe, 1 - lamUp);
    stripe = <path d={pathOf(pts.map((p) => cam.project(board.point(p))))} fill={fill} />;
  }

  // Trucks and wheels, far → near so a spun board mirrors cleanly.
  const parts: Part[] = [];
  const axle = norm3(board.dir({ x: 0, y: 0, z: 1 }));
  const wheelUp = norm3(board.dir({ x: 0, y: -1, z: 0 }));
  const wheelFwd = norm3(board.dir({ x: 1, y: 0, z: 0 }));
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    const hangerA = board.point({ x: tx, y: WHEEL_Y, z: -WHEEL_Z + WHEEL_HALF_W });
    const hangerB = board.point({ x: tx, y: WHEEL_Y, z: WHEEL_Z - WHEEL_HALF_W });
    const baseTop = board.point({ x: tx, y: THICKNESS / 2 + kickY(tx) + 0.5, z: 0 });
    const baseBot = board.point({ x: tx, y: WHEEL_Y - 1.5, z: 0 });
    const pa = cam.project(hangerA);
    const pb = cam.project(hangerB);
    const pc = cam.project(baseTop);
    const pd = cam.project(baseBot);
    const metal = tone(PALETTE.metal, 0.55);
    parts.push({
      depth: (pa.depth + pb.depth) / 2,
      el: (
        <g key={`truck${tx}`}>
          <line x1={pc.x} y1={pc.y} x2={pd.x} y2={pd.y} stroke={PALETTE.ink} strokeWidth={4.6 * s + ow} strokeLinecap="round" />
          <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={PALETTE.ink} strokeWidth={3 * s + ow} strokeLinecap="round" />
          <line x1={pc.x} y1={pc.y} x2={pd.x} y2={pd.y} stroke={tone(PALETTE.metal, 0.35)} strokeWidth={4.6 * s} strokeLinecap="round" />
          <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={metal} strokeWidth={3 * s} strokeLinecap="round" />
        </g>
      ),
    });
    for (const wz of [-WHEEL_Z, WHEEL_Z]) {
      const c = board.point({ x: tx, y: WHEEL_Y, z: wz });
      const ring = (offset: number): P2[] => {
        const out: P2[] = [];
        for (let k = 0; k < 16; k++) {
          const a = rad(k * 22.5);
          const ca = Math.cos(a) * WHEEL_R;
          const sa = Math.sin(a) * WHEEL_R;
          out.push(cam.project({
            x: c.x + axle.x * offset + wheelUp.x * ca + wheelFwd.x * sa,
            y: c.y + axle.y * offset + wheelUp.y * ca + wheelFwd.y * sa,
            z: c.z + axle.z * offset + wheelUp.z * ca + wheelFwd.z * sa,
          }));
        }
        return out;
      };
      const plus = ring(WHEEL_HALF_W);
      const minus = ring(-WHEEL_HALF_W);
      const silhouette = pathOf(hull(plus.concat(minus)));
      // Paint whichever cap faces the camera.
      const plusCenter = { x: c.x + axle.x * WHEEL_HALF_W, y: c.y + axle.y * WHEEL_HALF_W, z: c.z + axle.z * WHEEL_HALF_W };
      const plusVisible = facesCamera(cam, plusCenter, axle);
      const cap = plusVisible ? plus : minus;
      const capNormal = plusVisible ? axle : { x: -axle.x, y: -axle.y, z: -axle.z };
      const pc2 = cam.project(c);
      parts.push({
        depth: pc2.depth,
        el: (
          <g key={`wheel${tx}${wz}`}>
            <path d={silhouette} fill={tone(PALETTE.wheel, 0.3)} stroke={PALETTE.ink} strokeWidth={ow} strokeLinejoin="round" />
            <path d={pathOf(cap)} fill={tone(PALETTE.wheel, lambert(capNormal))} />
          </g>
        ),
      });
    }
  }
  parts.sort((a, b) => a.depth - b.depth);
  const running = parts.map((p) => p.el);

  const face = (d: string, fill: string, key: string) => (
    <path key={key} d={d} fill={fill} stroke={PALETTE.ink} strokeWidth={ow} strokeLinejoin="round" />
  );
  return (
    <g key="board">
      {seeingTop ? running : null}
      {face(seeingTop ? bottomPath : topPath, seeingTop ? graphicFill : gripFill, 'back')}
      {rails}
      {face(seeingTop ? topPath : bottomPath, seeingTop ? gripFill : graphicFill, 'front')}
      {stripe}
      {seeingTop ? null : running}
    </g>
  );
}
