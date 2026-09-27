import type { ReactElement } from 'react';
import { GROUND, W, X0 } from '../TrickAnimation';
import { PALETTE, facesCamera, lambert, tone, type Camera } from './camera';
import { mixHex, pathOf, type V3 } from './math';

/**
 * Golden-hour skate plaza behind the TrickScene robot.
 *
 * Far to near: warm sky with the sun glowing off-frame right, two hazy
 * skyline layers, a lawn running to the horizon, a row of trees, a line of
 * concrete ledges with painted edges, and the plaza's slab joints. Everything
 * from the lawn forward is real ground-plane geometry through the scene
 * camera, so it scrolls with the rider at the right parallax for its depth
 * and drops away as the camera rises with a pop.
 */

const SLAB = 64;
const LEDGE_FRONT_Z = -330;
const LEDGE_DEPTH = 24;
const LEDGE_H = 17;
const LAWN_Z = LEDGE_FRONT_Z - LEDGE_DEPTH - 8;
const TREE_Z = -440;
const FAR_Z = -20000;
const SPAN_LO = X0 - 2200;
const SPAN_HI = X0 + 2400;

const bgInk = mixHex(PALETTE.ink, PALETTE.concrete, 0.5);
/** Screen-space layers run past the viewBox so a container wider or taller
 *  than the stage's aspect letterboxes into more scene, not a seam. */
const BLEED_L = -W;
const BLEED_R = 2 * W;
const BLEED_Y = 320;

/** Positions of a repeating pattern element after scrolling, within the span. */
function repeats(offset: number, period: number, scroll: number): number[] {
  const out: number[] = [];
  const start = offset - scroll;
  let x = SPAN_LO + ((((start - SPAN_LO) % period) + period) % period);
  for (; x < SPAN_HI; x += period) out.push(x);
  return out;
}

// Skyline blocks: [x, width, height] in viewBox units, repeating.
const CITY_FAR: ReadonlyArray<readonly [number, number, number]> = [
  [0, 44, 38], [40, 30, 58], [66, 52, 30], [116, 26, 72], [140, 48, 44], [186, 36, 52],
  [224, 60, 26], [282, 30, 64], [310, 46, 40], [352, 28, 84], [378, 54, 34], [430, 40, 56],
  [468, 62, 30], [528, 34, 48], [560, 44, 66], [602, 58, 36], [658, 42, 50],
];
const CITY_FAR_PERIOD = 700;
const CITY_NEAR: ReadonlyArray<readonly [number, number, number]> = [
  [0, 58, 22], [54, 34, 40], [86, 70, 18], [150, 40, 30], [196, 66, 16], [258, 30, 46],
  [286, 60, 24], [342, 44, 34], [384, 76, 14], [456, 38, 38], [492, 56, 20],
];
const CITY_NEAR_PERIOD = 560;

function skyline(
  key: string,
  blocks: ReadonlyArray<readonly [number, number, number]>,
  period: number,
  shift: number,
  baseY: number,
  fill: string,
): ReactElement {
  let d = '';
  const offset = ((shift % period) + period) % period;
  for (let rep = Math.floor(BLEED_L / period) - 1; rep <= Math.ceil(BLEED_R / period) + 1; rep++) {
    for (const [x, w, h] of blocks) {
      const left = x + rep * period - offset;
      if (left > BLEED_R || left + w < BLEED_L) continue;
      d += `M${left.toFixed(1)} ${(baseY + 2).toFixed(1)}V${(baseY - h).toFixed(1)}H${(left + w).toFixed(1)}V${(baseY + 2).toFixed(1)}Z`;
    }
  }
  return <path key={key} d={d} fill={fill} />;
}

function groundQuad(cam: Camera, x0: number, x1: number, z0: number, z1: number): string {
  const quad = cam.clipPolygon([
    { x: x0, y: GROUND, z: z0 },
    { x: x1, y: GROUND, z: z0 },
    { x: x1, y: GROUND, z: z1 },
    { x: x0, y: GROUND, z: z1 },
  ]);
  return pathOf(quad.map((p) => cam.project(p)));
}

/** Axis-aligned prop box standing on the ground; visible faces, flat lit. */
function propBox(
  cam: Camera,
  key: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  h: number,
  color: string,
  paint?: string,
): ReactElement {
  const y0 = GROUND;
  const y1 = GROUND - h;
  const P = (x: number, y: number, z: number): V3 => ({ x, y, z });
  const faces: Array<{ n: V3; pts: V3[] }> = [
    { n: { x: 0, y: -1, z: 0 }, pts: [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)] },
    { n: { x: 0, y: 0, z: 1 }, pts: [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)] },
    { n: { x: -1, y: 0, z: 0 }, pts: [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)] },
    { n: { x: 1, y: 0, z: 0 }, pts: [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)] },
  ];
  const s = cam.project(P((x0 + x1) / 2, y1, z1)).s;
  const els: ReactElement[] = [];
  for (const [i, face] of faces.entries()) {
    const c = face.pts[0];
    if (!facesCamera(cam, c, face.n)) continue;
    els.push(
      <path key={i} d={pathOf(face.pts.map((p) => cam.project(p)))} fill={tone(color, lambert(face.n))}
        stroke={bgInk} strokeWidth={1.1 * s} strokeLinejoin="round" />,
    );
  }
  if (paint) {
    // Painted lip along the front-top edge, like waxed curb paint.
    const lip = 3.2;
    els.push(
      <path key="paint" d={pathOf([P(x0, y1, z1), P(x1, y1, z1), P(x1, y1 + lip, z1), P(x0, y1 + lip, z1)].map((p) => cam.project(p)))}
        fill={tone(paint, lambert({ x: 0, y: 0, z: 1 }))} />,
    );
  }
  return <g key={key}>{els}</g>;
}

export interface BackdropIds {
  sky: string;
  glow: string;
  ground: string;
  lawn: string;
  haze: string;
}

export function drawBackdrop(
  cam: Camera,
  scroll: number,
  ids: BackdropIds,
  viewTop: number,
  viewBottom: number,
): { defs: ReactElement; layers: ReactElement[] } {
  const hy = cam.horizonY;
  const lawnNear = cam.project({ x: X0, y: GROUND, z: LAWN_Z });
  const plazaNear = cam.project({ x: X0, y: GROUND, z: 120 });

  const defs = (
    <>
      <linearGradient id={ids.sky} x1="0" y1={viewTop} x2="0" y2={hy} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={PALETTE.skyTop} />
        <stop offset="55%" stopColor={PALETTE.skyMid} />
        <stop offset="88%" stopColor={PALETTE.skyLow} />
        <stop offset="100%" stopColor={PALETTE.horizon} />
      </linearGradient>
      <radialGradient id={ids.glow} cx={W + 30} cy={hy - 70} r={300} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={PALETTE.sun} stopOpacity="0.95" />
        <stop offset="35%" stopColor={PALETTE.sun} stopOpacity="0.45" />
        <stop offset="100%" stopColor={PALETTE.sun} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={ids.ground} x1="0" y1={hy} x2="0" y2={plazaNear.y} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={PALETTE.concreteFar} />
        <stop offset="100%" stopColor={PALETTE.concrete} />
      </linearGradient>
      <linearGradient id={ids.lawn} x1="0" y1={hy} x2="0" y2={lawnNear.y} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={PALETTE.lawnFar} />
        <stop offset="100%" stopColor={PALETTE.lawn} />
      </linearGradient>
      <linearGradient id={ids.haze} x1="0" y1={hy - 34} x2="0" y2={hy + 16} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={PALETTE.horizon} stopOpacity="0" />
        <stop offset="70%" stopColor={PALETTE.horizon} stopOpacity="0.5" />
        <stop offset="100%" stopColor={PALETTE.horizon} stopOpacity="0" />
      </linearGradient>
    </>
  );

  const layers: ReactElement[] = [];
  const skyTop = viewTop - BLEED_Y;
  layers.push(<rect key="sky" x={BLEED_L} y={skyTop} width={BLEED_R - BLEED_L} height={hy - skyTop + 1} fill={`url(#${ids.sky})`} />);
  layers.push(<rect key="glow" x={BLEED_L} y={skyTop} width={BLEED_R - BLEED_L} height={hy - skyTop + 1} fill={`url(#${ids.glow})`} />);

  // Soft golden-hour cloud banks: a long base with one or two puffs on top,
  // drifting slower than anything else.
  const drift = scroll * 0.015;
  const clouds: Array<[number, number, number]> = [[30, 128, 120], [270, 160, 150], [470, 104, 96], [640, 142, 130]];
  layers.push(
    <g key="clouds" fill="#fffaf1" opacity={0.62}>
      {clouds.map(([x, dy, w], i) => {
        const base = ((((x - drift) % 760) + 760) % 760) - 120;
        const y = hy - dy;
        return [-760, 0, 760].map((shift) => {
          const cx = base + shift;
          return (
            <g key={`${i}${shift}`}>
              <rect x={cx} y={y} width={w} height={9} rx={4.5} />
              <rect x={cx + w * 0.18} y={y - 7} width={w * 0.42} height={12} rx={6} />
              <rect x={cx + w * 0.5} y={y - 4} width={w * 0.3} height={9} rx={4.5} />
            </g>
          );
        });
      })}
    </g>,
  );

  layers.push(skyline('cityFar', CITY_FAR, CITY_FAR_PERIOD, scroll * 0.03, hy, PALETTE.cityFar));
  layers.push(skyline('cityNear', CITY_NEAR, CITY_NEAR_PERIOD, scroll * 0.06, hy, PALETTE.cityNear));

  // Ground to the horizon, then the lawn over everything behind the ledges.
  layers.push(<rect key="ground" x={BLEED_L} y={hy} width={BLEED_R - BLEED_L} height={viewBottom + BLEED_Y - hy} fill={`url(#${ids.ground})`} />);
  layers.push(<path key="lawn" d={groundQuad(cam, -40000, 40000, LAWN_Z, FAR_Z)} fill={`url(#${ids.lawn})`} />);
  layers.push(<rect key="haze" x={BLEED_L} y={hy - 34} width={BLEED_R - BLEED_L} height={50} fill={`url(#${ids.haze})`} />);

  // A far tree line, lost in the haze: no outlines, colors pulled toward
  // the horizon so it sits between the lawn and the skyline.
  const farTrees: ReactElement[] = [];
  const FAR_TREE_Z = -1100;
  const farTone = mixHex(PALETTE.tree, PALETTE.lawnFar, 0.5);
  const FAR_PATTERN: Array<[number, number]> = [[0, 34], [110, 28], [200, 40], [320, 30], [410, 26], [505, 38]];
  for (const [offset, r] of FAR_PATTERN) {
    for (const x of repeats(offset, 620, scroll)) {
      const cp = cam.project({ x, y: GROUND - 18 - r, z: FAR_TREE_Z });
      if (cp.x < BLEED_L || cp.x > BLEED_R) continue;
      const base = cam.project({ x, y: GROUND, z: FAR_TREE_Z });
      farTrees.push(
        <g key={`far${offset}_${Math.round(x)}`}>
          <line x1={base.x} y1={base.y} x2={cp.x} y2={cp.y} stroke={mixHex(PALETTE.trunk, PALETTE.lawnFar, 0.5)} strokeWidth={3.4 * cp.s} />
          <circle cx={cp.x} cy={cp.y} r={r * cp.s} fill={farTone} />
        </g>,
      );
    }
  }
  layers.push(<g key="farTrees">{farTrees}</g>);

  // Trees: trunk + two-tone canopy, softened outline for distance.
  const trees: ReactElement[] = [];
  const TREE_PATTERN: Array<[number, number]> = [[0, 26], [160, 21], [290, 30], [470, 23], [590, 27]];
  for (const [offset, r] of TREE_PATTERN) {
    for (const x of repeats(offset, 720, scroll)) {
      const baseP = cam.project({ x, y: GROUND, z: TREE_Z });
      const crown: V3 = { x, y: GROUND - 30 - r, z: TREE_Z };
      const cp = cam.project(crown);
      if (cp.x < BLEED_L || cp.x > BLEED_R) continue;
      const rr = r * cp.s;
      trees.push(
        <g key={`tree${offset}_${Math.round(x)}`}>
          <line x1={baseP.x} y1={baseP.y} x2={cp.x} y2={cp.y} stroke={bgInk} strokeWidth={5.4 * cp.s} strokeLinecap="round" />
          <line x1={baseP.x} y1={baseP.y} x2={cp.x} y2={cp.y} stroke={PALETTE.trunk} strokeWidth={3.6 * cp.s} strokeLinecap="round" />
          <circle cx={cp.x} cy={cp.y} r={rr + 0.9 * cp.s} fill={bgInk} />
          <circle cx={cp.x} cy={cp.y} r={rr} fill={tone(PALETTE.tree, 0.2)} />
          <circle cx={cp.x + rr * 0.16} cy={cp.y - rr * 0.14} r={rr * 0.8} fill={tone(PALETTE.tree, 0.62)} />
        </g>,
      );
    }
  }
  layers.push(<g key="trees">{trees}</g>);

  // Plaza slab joints, clipped to the near plane.
  const joints: string[] = [];
  const pushJoint = (a: V3, b: V3) => {
    const seg = cam.clip(a, b);
    if (!seg) return;
    const pa = cam.project(seg[0]);
    const pb = cam.project(seg[1]);
    joints.push(`M${pa.x.toFixed(1)} ${pa.y.toFixed(1)}L${pb.x.toFixed(1)} ${pb.y.toFixed(1)}`);
  };
  for (let z = LEDGE_FRONT_Z + SLAB * 0.5; z < 700; z += SLAB) {
    pushJoint({ x: SPAN_LO, y: GROUND, z }, { x: SPAN_HI, y: GROUND, z });
  }
  for (const x of repeats(0, SLAB, scroll)) {
    pushJoint({ x, y: GROUND, z: LEDGE_FRONT_Z }, { x, y: GROUND, z: 900 });
  }
  layers.push(
    <path key="joints" d={joints.join('')} fill="none" stroke={PALETTE.joint} strokeWidth={1.3} strokeLinecap="round" opacity={0.8} />,
  );

  // Ledge row at the back of the plaza.
  const ledges: ReactElement[] = [];
  const LEDGE_PATTERN: Array<[number, number]> = [[0, 190], [290, 120], [500, 210]];
  for (const [offset, len] of LEDGE_PATTERN) {
    for (const x of repeats(offset, 800, scroll)) {
      ledges.push(propBox(cam, `ledge${offset}_${Math.round(x)}`, x, x + len, LEDGE_FRONT_Z - LEDGE_DEPTH, LEDGE_FRONT_Z, LEDGE_H, PALETTE.ledge, PALETTE.paint));
    }
  }
  layers.push(<g key="ledges">{ledges}</g>);

  return { defs, layers };
}
