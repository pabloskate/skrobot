import type { ReactElement } from 'react';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { OUTLINE, facing, newGroup, renderGroup, roundedBox, shadeShape, solidHull, type BoxSpec } from './draw';
import { BOTTOM_LOCAL, TOP_LOCAL, deckBottomY, deckTopY, drawDeck, kickY, THICKNESS } from './deck';
import { clamp01, hull, mixHex, norm3, pathOf, rad, type P2, type V3 } from './math';
import { frameOf, type BoardRig } from './skeleton';

/**
 * Skateboard for TrickScene: a solid popsicle deck (grip top, painted
 * bottom, maple ply band) on silver trucks (a baseplate and a hanger that
 * flares from a narrow neck out to the axle) and cream wheels with metal hubs. Each wheel
 * carries one printed mark that turns with the distance rolled, smeared over
 * the angle it sweeps in a displayed frame, so a fast wheel reads as a
 * spinning blur instead of strobing. The deck keeps the physics renderers'
 * dimensions — 96 long, kicked nose and tail — and the wheels the same 13
 * units of ride height under the deck, so foot targets and ground contact
 * land where the trick engine expects.
 *
 * Parts are painted with their own outlines (not merged like the robot):
 * the board is small and reads better when wheels and deck stay separate.
 */

export const WHEEL_X = 28;
/** Board-local depth of the wheels' contact patch below the deck center: the
 *  shared physics rides the deck this far off the ground. */
export const WHEEL_BOTTOM = 13;
export const WHEEL_R = 4.5;
export const WHEEL_Y = WHEEL_BOTTOM - WHEEL_R;
/** Board-local depth of the bottom of a truck hanger: what rides a bar in a
 *  grind. The wheels dip WHEEL_BOTTOM - HANGER_BOTTOM past the contact. */
export const HANGER_BOTTOM = 9.9;
export const WHEEL_HALF_W = WHEEL_R * 0.46;
/** The wheels' inner faces stay this far from the centerline, clear of a bar. */
export const WHEEL_INNER = 5;
export const WHEEL_Z = WHEEL_INNER + WHEEL_HALF_W;
/**
 * A truck, top to bottom the way a real one reads head-on: a baseplate flat
 * against the deck, the kingpin's bushing (a narrow urethane neck), and the
 * hanger, which rises to a short hump under the bushing and slopes out into
 * thin wings that carry the axle into the wheels. Narrow where it meets the
 * deck, widest at the axle. Board-local half extents, y down from the deck.
 */
const PLATE: BoxSpec = { f: 4.2, u: 0.55, s: 2.6, r: 0.5 };
const BUSHING: BoxSpec = { f: 1.5, u: 1.75, s: 1.45, r: 1.2 };
/** Where the plate ends and the bushing gives way to the hanger. */
const PLATE_BOTTOM = 1.2;
const HUMP_TOP = 4.5;
/**
 * The hanger's corners (its surface reaches HANGER_ROUND past them): the
 * hump under the bushing, and the wings, whose tops sit just over the axle
 * and whose ends meet the wheels' inner faces. Its underside runs flat at
 * HANGER_BOTTOM, where a grind rests.
 */
const HANGER_ROUND = 0.8;
const HUMP = { f: 1.9, s: 1.1 };
const WING = { f: 1.2, s: WHEEL_INNER - HANGER_ROUND, top: WHEEL_Y - 1.3 };
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

export { deckBottomY, deckTopY };

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
 * side) paints before the bar and the rest after it, whichever side of the
 * deck the camera sees. Seen from above, the deck stays on top, and where it
 * dips below the bar's top on the far side (the nose of a smith or feeble),
 * `cover` repaints the bar over just that part. Seen from below (a tilted
 * 5-0 or nosegrind from a low angle), the deck goes under all of it.
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
  const lamUp = lambert(up);
  const deck = drawDeck(cam, board, {
    grip: tone(PALETTE.grip, lamUp),
    graphic: tone(look.graphic, 1 - lamUp),
    stripe: tone(look.stripe, 1 - lamUp),
    ink: ow,
  });

  // Trucks and wheels, far → near so a spun board mirrors cleanly.
  const parts: Part[] = [];
  const axle = norm3(board.dir({ x: 0, y: 0, z: 1 }));
  const wheelUp = norm3(board.dir({ x: 0, y: -1, z: 0 }));
  const wheelFwd = norm3(board.dir({ x: 1, y: 0, z: 0 }));
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    // One truck, painted as a single silhouette: a baseplate under the
    // deck, the bushing, and a hanger flaring from a hump out to the axle.
    const underside = kickY(tx) + THICKNESS / 2;
    const truck = newGroup(`truck${tx}`);
    const frameAt = (y: number) => frameOf(board.point({ x: tx, y, z: 0 }), board.dir);
    // Board y is down and a frame's up is up: corners sit at u = -y.
    const humpTop = -(HUMP_TOP + HANGER_ROUND);
    const bottom = -(HANGER_BOTTOM - HANGER_ROUND);
    const wingTop = -(WING.top + HANGER_ROUND);
    const corners: Array<[number, number, number]> = [];
    for (const sf of [-1, 1]) {
      for (const ss of [-1, 1]) {
        corners.push(
          [sf * HUMP.f, humpTop, ss * HUMP.s], [sf * HUMP.f, bottom, ss * HUMP.s],
          [sf * WING.f, wingTop, ss * WING.s], [sf * WING.f, bottom, ss * WING.s],
        );
      }
    }
    // The hanger's middle: where the truck sorts against the wheels and scales its ink.
    const pt = cam.project(board.point({ x: tx, y: (HUMP_TOP + HANGER_BOTTOM) / 2, z: 0 }));
    const ink = { outline: OUTLINE * 0.85 };
    const hanger = () => shadeShape(truck, solidHull(cam, frameAt(0), corners, HANGER_ROUND), pt.s, PALETTE.metal, ink.outline);
    const bushing = () => roundedBox(truck, cam, frameAt((PLATE_BOTTOM + HUMP_TOP) / 2), BUSHING, look.graphic, ink);
    const plate = () => roundedBox(truck, cam, frameAt(underside + (PLATE_BOTTOM - underside) / 2), PLATE, PALETTE.metal, ink);
    // Nearest the camera paints last: the plate from above, the hanger from below.
    for (const paint of seeingTop ? [hanger, bushing, plate] : [plate, bushing, hanger]) paint();
    parts.push({ depth: pt.depth, z: board.point({ x: tx, y: WHEEL_Y, z: 0 }).z, el: renderGroup(truck) });
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
  // On a bar, the gear beyond its centerline is behind it from either side
  // of the deck, so the bar always goes between the far gear and the near.
  const beyond = (p: Part) => bar != null && p.z < bar.z - 0.5;
  const running = [
    ...parts.filter(beyond).map((p) => p.el),
    ...(bar ? [<g key="bar">{bar.el}</g>] : []),
    ...parts.filter((p) => !beyond(p)).map((p) => p.el),
  ];
  let cover: ReactElement | null = null;
  if (bar && seeingTop) {
    // The deck below the bar's top and beyond it: its screen footprint.
    const dipped = (outline: V3[]) => clipPlane(clipPlane(outline, (p) => p.y - bar.top - 1), (p) => bar.z - p.z);
    const pts = [...dipped(top), ...dipped(bottom)];
    if (pts.length >= 3) {
      // The deck's ink extends beyond its geometry. Include that stroke in
      // the cover footprint or a dark rim survives on the face of the bar.
      // SVG clip paths ignore strokeWidth, so expand the geometry itself.
      // Circumscribe the round stroke, with a small anti-aliasing overlap.
      const pad = (ow / 2 + 0.2 * s) / Math.cos(Math.PI / 8);
      const footprint = hull(pts.flatMap((p) => {
        const q = cam.project(p);
        return Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4;
          return { x: q.x + Math.cos(a) * pad, y: q.y + Math.sin(a) * pad };
        });
      }));
      cover = (
        <g key="cover">
          <clipPath id={bar.clipId}><path d={pathOf(footprint)} /></clipPath>
          <g clipPath={`url(#${bar.clipId})`}>{bar.cover}</g>
        </g>
      );
    }
  }

  // From above, the deck covers its running gear (and the bar under it, but
  // for the dipped part the cover puts back). From below, the gear and the
  // bar cover the deck: the bar is between the camera and the underside
  // wherever the two overlap.
  return (
    <g key="board">
      {seeingTop ? null : deck}
      {running}
      {seeingTop ? deck : null}
      {cover}
    </g>
  );
}
