import type { Robot } from './types';

interface Props {
  robot: Robot;
  size?: number;
  /** 'stoked' raises the arms, 'bailed' lays the robot on its back next to the board. */
  pose?: 'idle' | 'stoked' | 'bailed';
}

/** Chunky friendly-bot outline shared by every robot. `currentColor` keeps the
 * SVG outline tied to the app's palette via CSS. */
const STROKE = 'currentColor';
const SW = 4;

/**
 * Parameterized robot-on-a-skateboard. Colors + variant come from robot data
 * so each bot looks distinct without shipping image assets. The look is a
 * chunky, rounded mascot: thick dark outlines, gold ball hands + antenna,
 * a big gold belly plate, and a happy face.
 */
export default function RobotAvatar({ robot, size = 96, pose = 'idle' }: Props) {
  const { body, accent, variant } = robot.avatar;
  const stoked = pose === 'stoked';
  const bailed = pose === 'bailed';

  const eyes = [
    // variant 0: round eyes
    <g key="e" fill={STROKE}>
      <circle cx="39" cy="27" r="4.6" />
      <circle cx="57" cy="27" r="4.6" />
    </g>,
    // variant 1: happy arcs
    <g key="e" stroke={STROKE} strokeWidth="3.6" strokeLinecap="round" fill="none">
      <path d="M34 29 A7 7 0 0 1 44 29" />
      <path d="M52 29 A7 7 0 0 1 62 29" />
    </g>,
    // variant 2: rectangles
    <g key="e" fill={STROKE}>
      <rect x="34" y="22" width="10" height="10" rx="2.5" />
      <rect x="52" y="22" width="10" height="10" rx="2.5" />
    </g>,
    // variant 3: one wink
    <g key="e" stroke={STROKE} strokeWidth="3.6" strokeLinecap="round">
      <circle cx="39" cy="27" r="4.6" fill={STROKE} stroke="none" />
      <path d="M52 28 h10" fill="none" />
    </g>,
  ][variant];

  const mouth = bailed ? (
    <ellipse cx="48" cy="41" rx="4.6" ry="5.6" fill={STROKE} />
  ) : stoked ? (
    <path d="M40 39 q8 9 16 0" stroke={STROKE} strokeWidth="3.6" strokeLinecap="round" fill="none" />
  ) : (
    <path d="M42 41 h12" stroke={STROKE} strokeWidth="3.6" strokeLinecap="round" />
  );

  // Arms curve out from the shoulders; idle they dangle, stoked they reach up.
  const hand = { fill: accent, stroke: STROKE, strokeWidth: 3 };
  const arms = stoked ? (
    <g>
      <path d="M30 54 C22 47, 17 39, 15 32" />
      <path d="M66 54 C74 47, 79 39, 81 32" />
      <circle cx="14" cy="30" r="5" {...hand} />
      <circle cx="82" cy="30" r="5" {...hand} />
    </g>
  ) : (
    <g>
      <path d="M30 56 C20 60, 16 70, 14 76" />
      <path d="M66 56 C76 60, 80 70, 82 76" />
      <circle cx="13" cy="78" r="5" {...hand} />
      <circle cx="83" cy="78" r="5" {...hand} />
    </g>
  );

  const figure = (
    <g>
      {/* antenna */}
      <line x1="48" y1="9" x2="48" y2="3" stroke={STROKE} strokeWidth={SW} strokeLinecap="round" />
      <circle cx="48" cy="2.5" r="4" fill={accent} stroke={STROKE} strokeWidth="3" />
      {/* arms (drawn behind the body) */}
      <g
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {arms}
      </g>
      {/* head */}
      <rect x="25" y="9" width="46" height="40" rx="14" fill={body} stroke={STROKE} strokeWidth={SW} />
      {eyes}
      {mouth}
      {/* legs — extended down so the feet rest on the board deck */}
      <g stroke={STROKE} strokeWidth={SW} strokeLinecap="round">
        <line x1="41" y1="78" x2="38" y2="95" />
        <line x1="55" y1="78" x2="58" y2="95" />
      </g>
      {/* torso */}
      <rect x="31" y="50" width="34" height="28" rx="11" fill={body} stroke={STROKE} strokeWidth={SW} />
    </g>
  );

  const board = (x: number, y: number, rot = 0) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d="M0 0 q4 6 12 6 h40 q8 0 12 -6"
        stroke={STROKE}
        strokeWidth={SW}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="16" cy="10" r="3.8" fill="#fbfbf3" stroke={STROKE} strokeWidth="2.4" />
      <circle cx="48" cy="10" r="3.8" fill="#fbfbf3" stroke={STROKE} strokeWidth="2.4" />
      <circle cx="16" cy="10" r="1.5" fill={accent} />
      <circle cx="48" cy="10" r="1.5" fill={accent} />
    </g>
  );

  return (
    <svg className="robot-avatar" width={size} height={size} viewBox="0 -5 100 106" aria-label={robot.name} role="img">
      {bailed ? (
        <>
          {board(2, 80, -8)}
          <g transform="translate(74 30) rotate(100) scale(0.6)">{figure}</g>
        </>
      ) : (
        <>
          <g transform="translate(2 0) scale(0.95)">{figure}</g>
          {board(18, 86)}
        </>
      )}
    </svg>
  );
}
