import type { Robot } from './robots';

interface Props {
  robot: Robot;
  size?: number;
  /** 'stoked' raises the arms, 'bailed' lays the robot on its back next to the board. */
  pose?: 'idle' | 'stoked' | 'bailed';
}

/**
 * Parameterized robot-on-a-skateboard. Colors + variant come from robot data
 * so each bot looks distinct without shipping image assets.
 */
export default function RobotAvatar({ robot, size = 96, pose = 'idle' }: Props) {
  const { body, accent, variant } = robot.avatar;
  const stoked = pose === 'stoked';
  const bailed = pose === 'bailed';

  const eyes = [
    // variant 0: round eyes
    <g key="e">
      <circle cx="38" cy="26" r="4.5" fill="#1e2235" />
      <circle cx="58" cy="26" r="4.5" fill="#1e2235" />
    </g>,
    // variant 1: happy arcs
    <g key="e" stroke="#1e2235" strokeWidth="3.4" strokeLinecap="round" fill="none">
      <path d="M33 27 q5 -7 10 0" />
      <path d="M53 27 q5 -7 10 0" />
    </g>,
    // variant 2: rectangles
    <g key="e" fill="#1e2235">
      <rect x="33" y="21" width="9" height="9" rx="2" />
      <rect x="54" y="21" width="9" height="9" rx="2" />
    </g>,
    // variant 3: one wink
    <g key="e">
      <circle cx="38" cy="26" r="4.5" fill="#1e2235" />
      <path d="M53 26 h10" stroke="#1e2235" strokeWidth="3.4" strokeLinecap="round" />
    </g>,
  ][variant];

  const mouth = bailed ? (
    <ellipse cx="48" cy="38" rx="4.5" ry="5.5" fill="#1e2235" />
  ) : stoked ? (
    <path d="M40 36 q8 8 16 0" stroke="#1e2235" strokeWidth="3.4" strokeLinecap="round" fill="none" />
  ) : (
    <path d="M41 38 h14" stroke="#1e2235" strokeWidth="3.4" strokeLinecap="round" />
  );

  const armY = stoked ? -18 : 0;

  const figure = (
    <g>
      {/* antenna */}
      <line x1="48" y1="8" x2="48" y2="2" stroke={accent} strokeWidth="3" />
      <circle cx="48" cy="2" r="3.5" fill={accent} />
      {/* head */}
      <rect x="26" y="8" width="44" height="40" rx="12" fill={body} stroke="#1e2235" strokeWidth="3" />
      {eyes}
      {mouth}
      {/* arms */}
      <g stroke={accent} strokeWidth="5" strokeLinecap="round">
        <line x1="26" y1="58" x2="12" y2={66 + armY} />
        <line x1="70" y1="58" x2="84" y2={66 + armY} />
      </g>
      <circle cx="12" cy={66 + armY} r="4.5" fill={accent} />
      <circle cx="84" cy={66 + armY} r="4.5" fill={accent} />
      {/* torso */}
      <rect x="32" y="50" width="32" height="26" rx="8" fill={body} stroke="#1e2235" strokeWidth="3" />
      <rect x="42" y="56" width="12" height="9" rx="2" fill={accent} />
      {/* legs */}
      <g stroke="#1e2235" strokeWidth="5" strokeLinecap="round">
        <line x1="40" y1="76" x2="38" y2="86" />
        <line x1="56" y1="76" x2="58" y2="86" />
      </g>
    </g>
  );

  const board = (x: number, y: number, rot = 0) => (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M0 0 q4 6 12 6 h40 q8 0 12 -6" stroke="#1e2235" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="10" r="3.6" fill="#1e2235" />
      <circle cx="48" cy="10" r="3.6" fill="#1e2235" />
    </g>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={robot.name} role="img">
      {bailed ? (
        <>
          {board(2, 78, -8)}
          <g transform="translate(72 32) rotate(100) scale(0.62)">{figure}</g>
        </>
      ) : (
        <>
          <g transform="translate(2 0) scale(0.96)">{figure}</g>
          {board(18, 88)}
        </>
      )}
    </svg>
  );
}
