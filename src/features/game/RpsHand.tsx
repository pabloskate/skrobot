import type { Rps } from './rps';

interface Props {
  kind: Rps;
  /** Hand color. Defaults to the player's white glove. */
  fill?: string;
  /** Cuff color. Defaults to the app purple. */
  cuff?: string;
  /** Robot hands trade the glove cuff's highlight for a panel seam. */
  robot?: boolean;
  className?: string;
}

/**
 * Rock/paper/scissors hand in the robot avatar's ink-outline style, fingers
 * pointing up (rotate it to aim elsewhere). Built like the avatar's limbs:
 * every part is drawn once as a fat ink silhouette, then again as a flat fill
 * on top, so overlapping parts merge into one outlined hand. Only a few
 * interior lines come back: finger separations and the thumb, whose edge is
 * open at the base so it grows out of the palm instead of reading as a strap.
 * Ink is `currentColor`, like RobotAvatar.
 */

/** Visible outline width in the 100×100 viewBox. */
const OUTLINE = 3.4;

type Part =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string }
  /** Round-capped stroke from base to tip. */
  | { kind: 'finger'; d: string; w: number };

interface Thumb {
  shape: string;
  edge: string;
}

interface HandShape {
  parts: Part[];
  lines: { d: string; w?: number }[];
  thumb?: Thumb;
}

const rect = (x: number, y: number, w: number, h: number, rx: number): Part => ({ kind: 'rect', x, y, w, h, rx });
const circle = (cx: number, cy: number, r: number): Part => ({ kind: 'circle', cx, cy, r });
const finger = (x1: number, y1: number, x2: number, y2: number, w: number): Part => ({
  kind: 'finger',
  d: `M${x1} ${y1} L${x2} ${y2}`,
  w,
});

const ROCK_THUMB: Thumb = {
  shape: 'M18 58.5 Q31 49 47 43 A8 8 0 0 1 56 55.5 Q41 66 28 71.5 Q21 73 19 67 Z',
  edge: 'M18.5 58.2 Q31 49 47 43 A8 8 0 0 1 56 55.5 Q41 66 28 71.5 Q25 73 24.5 75.5',
};

const SCISSORS_THUMB: Thumb = {
  shape: 'M21.5 61.5 Q36 55.5 51.5 51.5 A8 8 0 0 1 56.5 66.5 Q42 70.5 29 75 Q23 76.5 22 70.5 Z',
  edge: 'M22 61.2 Q36 55.5 51.5 51.5 A8 8 0 0 1 56.5 66.5 Q42 70.5 29 75 Q26.5 76 26 78.5',
};

const SHAPES: Record<Rps, HandShape> = {
  // Palm-side fist: shallow knuckle scallops, thumb crossing the curled fingers.
  rock: {
    parts: [
      rect(20, 27, 15, 34, 7.5),
      rect(34, 23.5, 15, 34, 7.5),
      rect(48, 24.5, 15, 34, 7.5),
      rect(62, 29, 14, 32, 7),
      rect(20, 36, 57, 50, 16),
      circle(25, 68, 11),
      { kind: 'path', d: ROCK_THUMB.shape },
    ],
    lines: [{ d: 'M34.5 32 v13' }, { d: 'M48.5 30 v14' }, { d: 'M62.5 34 v16' }],
    thumb: ROCK_THUMB,
  },
  // Open hand, fingers fanned, thumb out to the side. The silhouette says it all.
  paper: {
    parts: [
      finger(30, 74, 13, 52, 13),
      finger(34, 52, 27.5, 15, 12.5),
      finger(45, 50, 44, 8.5, 12.5),
      finger(56, 50, 60, 12, 12.5),
      finger(66, 55, 73.5, 25, 11),
      rect(23, 42, 53, 44, 16),
      circle(31, 69, 12),
    ],
    lines: [],
  },
  // Two fingers in a V; ring and pinky curled under the thumb.
  scissors: {
    parts: [
      finger(37, 54, 26.5, 12, 12.5),
      finger(49, 52, 58, 9, 12.5),
      rect(55, 34, 14, 32, 7),
      rect(67.5, 38.5, 12, 28, 6),
      rect(22, 44, 56, 42, 16),
      circle(27, 69, 11),
      { kind: 'path', d: SCISSORS_THUMB.shape },
    ],
    lines: [{ d: 'M67.5 42.5 v12' }, { d: 'M42.2 49 L44.6 41', w: 2.6 }, { d: 'M58.6 40 L57.8 47', w: 2.6 }],
    thumb: SCISSORS_THUMB,
  },
};

const CUFF = 'M29 79.5 h42 a4 4 0 0 1 4 4.4 l-1.2 10 a4 4 0 0 1 -4 3.6 h-39.6 a4 4 0 0 1 -4 -3.6 l-1.2 -10 a4 4 0 0 1 4 -4.4 z';

function renderPart(part: Part, key: number, silhouette: boolean, fill: string) {
  if (part.kind === 'finger') {
    return (
      <path
        key={key}
        d={part.d}
        fill="none"
        stroke={silhouette ? 'currentColor' : fill}
        strokeWidth={silhouette ? part.w + OUTLINE * 2 : part.w}
        strokeLinecap="round"
      />
    );
  }
  const paint = silhouette
    ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: OUTLINE * 2, strokeLinejoin: 'round' as const }
    : { fill };
  if (part.kind === 'rect') {
    return <rect key={key} x={part.x} y={part.y} width={part.w} height={part.h} rx={part.rx} {...paint} />;
  }
  if (part.kind === 'circle') return <circle key={key} cx={part.cx} cy={part.cy} r={part.r} {...paint} />;
  return <path key={key} d={part.d} {...paint} />;
}

export default function RpsHand({ kind, fill = '#fff', cuff = '#6431d8', robot = false, className }: Props) {
  const { parts, lines, thumb } = SHAPES[kind];
  const line = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {parts.map((p, i) => renderPart(p, i, true, fill))}
      {parts.map((p, i) => renderPart(p, i, false, fill))}
      {lines.map((l) => (
        <path key={l.d} d={l.d} strokeWidth={l.w ?? 2.8} {...line} />
      ))}
      {thumb && (
        <>
          <path d={thumb.shape} fill={fill} />
          <path d={thumb.edge} strokeWidth={OUTLINE} {...line} />
        </>
      )}
      <path d={CUFF} fill={cuff} stroke="currentColor" strokeWidth={OUTLINE} strokeLinejoin="round" />
      {robot ? (
        <path d="M50 81.5 v14" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" opacity={0.45} />
      ) : (
        <path d="M33 85 h34" stroke="rgba(255,255,255,.5)" strokeWidth={2.6} strokeLinecap="round" />
      )}
    </svg>
  );
}
