import type { ReactElement } from 'react';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { OUTLINE, facing } from './draw';
import { clamp01, cross3, dot3, hull, mixHex, norm3, pathOf, rad, sub3, type P2, type V3 } from './math';
import { DECK_HALF_WIDTH, type BoardRig } from './skeleton';

/**
 * Skateboard for TrickScene: a solid popsicle deck (grip top, painted
 * bottom, maple ply band) on silver trucks and cream wheels with metal
 * hubs. Each wheel carries one printed mark that turns with the distance
 * rolled, smeared over the angle it sweeps in a displayed frame, so a fast
 * wheel reads as a spinning blur instead of strobing. The deck keeps
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
export const WHEEL_X = 28;
const WHEEL_Y = 8.4;
/** Radius of the truck hanger (board.tsx draws it 3 wide). */
const HANGER_R = 1.5;
/** Board-local depth of the bottom of a truck hanger: what rides a bar in a grind. */
export const HANGER_BOTTOM = WHEEL_Y + HANGER_R;
const WHEEL_Z = 7.2;
export const WHEEL_R = 4.6;
const WHEEL_HALF_W = 2.1;
/** Board-local depth of the wheels' contact patch below the deck center. */
export const WHEEL_BOTTOM = WHEEL_Y + 4.6;
/**
 * Share of true rolling speed the wheels turn at. Full speed (about nine
 * turns a second) is a blur the eye can't follow on a wheel this small.
 */
export const WHEEL_SPIN = 0.6;
/** Core and bearing, as fractions of the wheel radius. */
const HUB_R = 0.44;
const NUT_R = 0.15;
/** The printed mark: its ring on the urethane, half-width, and length unsmeared. */
const MARK_R = 0.72;
const MARK_HALF_W = 0.16;
const MARK_ARC = rad(34);
/** A mark smeared past this is a solid ring; stop short so the head still leads. */
const MAX_SWEEP = rad(300);
/** Cap facing (1 head-on) below which the hub and mark fade toward edge-on. */
const DETAIL_FADE = 0.35;

function kickY(x: number): number {
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
  /** World z of the part, for sorting against a bar. */
  z: number;
  el: ReactElement;
}

export interface BoardLook {
  /** Painted underside. */
  graphic: string;
  /** Stripe across the underside graphic. */
  stripe: string;
}

/** How far the wheels have turned on their axles this frame. */
export interface WheelSpin {
  /** Roll angle about the axle in board space, radians. */
  angle: number;
  /** Signed radians turned over one displayed frame; the mark smears across it. */
  sweep: number;
}

/**
 * Wheel roll angle after the street has moved `dist` world units. Rolling
 * without slipping turns a wheel dist / R, scaled by WHEEL_SPIN so the
 * mark stays readable. Airborne wheels coast at their
 * takeoff spin; from touchdown on they roll along the board's landed
 * heading, so a board that lands turned 180° spins its wheels the other way.
 */
export function wheelRoll(dist: number, touchdownDist: number, dir: 1 | -1, landedYawDeg: number): number {
  const before = Math.min(dist, touchdownDist);
  const after = Math.max(0, dist - touchdownDist);
  return (WHEEL_SPIN * dir * (before + Math.cos(rad(landedYawDeg)) * after)) / WHEEL_R;
}

/**
 * A flat bar under the board. Running gear beyond the bar's centerline
 * (the far wheels of a truck straddling it, a truck hanging off the far
 * side) paints before the bar and the rest after it, and the deck stays on
 * top. Where the deck itself dips below the bar's top on the far side (the
 * nose of a smith or feeble), `cover` repaints the bar over just that part.
 */
export interface BoardBar {
  el: ReactElement;
  cover: ReactElement;
  clipId: string;
  /** World z of the bar's centerline and world y of its top. */
  z: number;
  top: number;
}

/** Keep the part of a polygon where `side` is positive (Sutherland–Hodgman). */
function clipPlane(pts: V3[], side: (p: V3) => number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
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

export function drawBoard(cam: Camera, board: BoardRig, look: BoardLook, spin: WheelSpin, bar?: BoardBar): ReactElement {
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
      z: (hangerA.z + hangerB.z) / 2,
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
      /** A point on the wheel `r` (a fraction of its radius) out at angle `a`. */
      const at = (offset: number, a: number, r = 1): P2 => {
        const ca = Math.cos(a) * WHEEL_R * r;
        const sa = Math.sin(a) * WHEEL_R * r;
        return cam.project({
          x: c.x + axle.x * offset + wheelUp.x * ca + wheelFwd.x * sa,
          y: c.y + axle.y * offset + wheelUp.y * ca + wheelFwd.y * sa,
          z: c.z + axle.z * offset + wheelUp.z * ca + wheelFwd.z * sa,
        });
      };
      const ring = (offset: number, r = 1): P2[] => {
        const out: P2[] = [];
        for (let k = 0; k < 16; k++) out.push(at(offset, rad(k * 22.5), r));
        return out;
      };
      const plus = ring(WHEEL_HALF_W);
      const minus = ring(-WHEEL_HALF_W);
      const silhouette = pathOf(hull(plus.concat(minus)));
      // Paint whichever cap faces the camera.
      const plusCenter = { x: c.x + axle.x * WHEEL_HALF_W, y: c.y + axle.y * WHEEL_HALF_W, z: c.z + axle.z * WHEEL_HALF_W };
      const plusVisible = facesCamera(cam, plusCenter, axle);
      const capOffset = plusVisible ? WHEEL_HALF_W : -WHEEL_HALF_W;
      const cap = plusVisible ? plus : minus;
      const capNormal = plusVisible ? axle : { x: -axle.x, y: -axle.y, z: -axle.z };
      const capLam = lambert(capNormal);
      const capFill = tone(PALETTE.wheel, capLam);
      // Hub and mark fade out as the cap turns edge-on, so the switch to the
      // other cap never pops.
      const detail = clamp01(facing(cam, c, capNormal) / DETAIL_FADE);
      // The mark: head at the roll angle, tail trailing back across the sweep,
      // tapering so the blur reads in the direction of travel.
      const sweep = Math.max(-MAX_SWEEP, Math.min(MAX_SWEEP, spin.sweep));
      const lead = sweep >= 0 ? 1 : -1;
      const head = spin.angle + (lead * MARK_ARC) / 2;
      const tail = spin.angle - sweep - (lead * MARK_ARC) / 2;
      const outer: P2[] = [];
      const inner: P2[] = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const a = tail + (head - tail) * u;
        const half = MARK_HALF_W * (0.3 + 0.7 * u);
        outer.push(at(capOffset, a, MARK_R + half));
        inner.push(at(capOffset, a, MARK_R - half));
      }
      const pc2 = cam.project(c);
      parts.push({
        depth: pc2.depth,
        z: c.z,
        el: (
          <g key={`wheel${tx}${wz}`}>
            <path d={silhouette} fill={tone(PALETTE.wheel, 0.3)} stroke={PALETTE.ink} strokeWidth={ow} strokeLinejoin="round" />
            <path d={pathOf(cap)} fill={capFill} />
            {detail > 0 ? (
              <g opacity={detail}>
                <path d={pathOf(outer.concat(inner.reverse()))} fill={mixHex(capFill, PALETTE.ink, 0.3)} />
                <path d={pathOf(ring(capOffset, HUB_R))} fill={tone(PALETTE.metal, capLam)} />
                <path d={pathOf(ring(capOffset, NUT_R))} fill={PALETTE.ink} />
              </g>
            ) : null}
          </g>
        ),
      });
    }
  }
  parts.sort((a, b) => a.depth - b.depth);
  let running = parts.map((p) => p.el);
  let cover: ReactElement | null = null;
  if (bar && seeingTop) {
    const beyond = (p: Part) => p.z < bar.z - 0.5;
    running = [
      ...parts.filter(beyond).map((p) => p.el),
      <g key="bar">{bar.el}</g>,
      ...parts.filter((p) => !beyond(p)).map((p) => p.el),
    ];
    // The deck below the bar's top and beyond it: its screen footprint.
    const dipped = (outline: V3[]) => clipPlane(clipPlane(outline, (p) => p.y - bar.top - 1), (p) => bar.z - p.z);
    const pts = [...dipped(top), ...dipped(bottom)];
    if (pts.length >= 3) {
      cover = (
        <g key="cover">
          <clipPath id={bar.clipId}><path d={pathOf(hull(pts.map((p) => cam.project(p))))} /></clipPath>
          <g clipPath={`url(#${bar.clipId})`}>{bar.cover}</g>
        </g>
      );
    }
  }

  const face = (d: string, fill: string, key: string) => (
    <path key={key} d={d} fill={fill} stroke={PALETTE.ink} strokeWidth={ow} strokeLinejoin="round" />
  );
  return (
    <g key="board">
      {bar && !seeingTop ? <g key="bar">{bar.el}</g> : null}
      {seeingTop ? running : null}
      {face(seeingTop ? bottomPath : topPath, seeingTop ? graphicFill : gripFill, 'back')}
      {rails}
      {face(seeingTop ? topPath : bottomPath, seeingTop ? gripFill : graphicFill, 'front')}
      {stripe}
      {cover}
      {seeingTop ? null : running}
    </g>
  );
}
