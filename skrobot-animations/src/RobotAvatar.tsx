import type { Robot } from './types';

interface Props {
  robot: Robot;
  size?: number;
  /** 'stoked' raises the arms, 'bailed' lays the robot on its back next to the board. */
  pose?: 'idle' | 'stoked' | 'bailed';
}

/** Front-facing avatar matching the side-view animation robot style from
 * TrickAnimation. Slim robot with a rectangular head, visor, smooth curved
 * limbs, and accent-colored boots. `currentColor` keeps the SVG outline tied
 * to the app's palette via CSS. */
const STROKE = 'currentColor';
const SW = 3;
const LIMB_W = 5.5;

export default function RobotAvatar({ robot, size = 96, pose = 'idle' }: Props) {
  const { body, accent } = robot.avatar;
  const stoked = pose === 'stoked';
  const bailed = pose === 'bailed';

  /** Outlined path: thick dark stroke behind a thinner accent stroke. */
  const outlinedPath = (d: string, w = LIMB_W) => (
    <>
      <path d={d} stroke={STROKE} strokeWidth={w + 2} strokeLinecap="round" fill="none" />
      <path d={d} stroke={accent} strokeWidth={w - 1} strokeLinecap="round" fill="none" />
    </>
  );

  /** Faded-back arm path (thinner, low opacity for depth). */
  const backArmPath = (d: string) => (
    <path d={d} stroke={accent} strokeWidth={4.5} strokeLinecap="round" fill="none" opacity="0.35" />
  );

  const hand = { fill: accent, stroke: STROKE, strokeWidth: 1.5 };

  // --- Arms ---

  const armPaths = stoked
    ? {
        frontL: 'M38 40 Q26 26 24 12',
        frontR: 'M58 40 Q70 26 72 12',
        backL: 'M38 40 Q30 28 28 16',
        backR: 'M58 40 Q66 28 68 16',
        handL: { cx: 24, cy: 12 },
        handR: { cx: 72, cy: 12 },
      }
    : {
        frontL: 'M38 40 Q24 54 22 68',
        frontR: 'M58 40 Q72 54 74 68',
        backL: 'M38 40 Q30 52 28 66',
        backR: 'M58 40 Q66 52 68 66',
        handL: { cx: 22, cy: 68 },
        handR: { cx: 74, cy: 68 },
      };

  const backArms = (
    <g key="ba">
      {backArmPath(armPaths.backL)}
      {backArmPath(armPaths.backR)}
    </g>
  );

  const frontArms = (
    <g key="fa">
      {outlinedPath(armPaths.frontL)}
      {outlinedPath(armPaths.frontR)}
      <circle cx={armPaths.handL.cx} cy={armPaths.handL.cy} r={4} {...hand} />
      <circle cx={armPaths.handR.cx} cy={armPaths.handR.cy} r={4} {...hand} />
    </g>
  );

  // --- Legs ---

  const legs = (
    <g key="l">
      {outlinedPath('M42 64 Q36 78 34 92')}
      {outlinedPath('M54 64 Q60 78 62 92')}
    </g>
  );

  // --- Body (torso + head, drawn on top of limbs) ---

  const bodyGroup = (
    <g key="b">
      {/* Neck */}
      <line x1={48} y1={32} x2={48} y2={36} stroke={STROKE} strokeWidth={2.5} strokeLinecap="round" />
      {/* Torso */}
      <rect x={36} y={36} width={24} height={28} rx={9} fill={body} stroke={STROKE} strokeWidth={SW} />
      {/* Head */}
      <rect x={34} y={12} width={28} height={20} rx={7} fill={body} stroke={STROKE} strokeWidth={SW} />
      {/* Visor */}
      <rect x={38} y={16} width={20} height={7} rx={3.5} fill={STROKE} opacity={0.85} />
      {/* Eyes */}
      <circle cx={43} cy={19.5} r={2} fill={accent} />
      <circle cx={53} cy={19.5} r={2} fill={accent} />
      {/* Antenna */}
      <line x1={48} y1={12} x2={48} y2={6} stroke={STROKE} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={48} cy={4.5} r={3.5} fill={accent} stroke={STROKE} strokeWidth={1.5} />
    </g>
  );

  // --- Boots ---

  const boots = (
    <g key="bo">
      <rect x={28} y={89} width={12} height={7} rx={3.5} fill={accent} stroke={STROKE} strokeWidth={2} />
      <rect x={56} y={89} width={12} height={7} rx={3.5} fill={accent} stroke={STROKE} strokeWidth={2} />
    </g>
  );

  /** Skateboard drawn below the boots. */
  const board = (x: number, y: number, rot = 0) => (
    <g key="bd" transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path
        d="M0 0 q4 6 12 6 h40 q8 0 12 -6"
        stroke={STROKE}
        strokeWidth={SW}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="16" cy="10" r="3.8" fill="#c8c8c8" stroke={STROKE} strokeWidth="2.5" />
      <circle cx="48" cy="10" r="3.8" fill="#c8c8c8" stroke={STROKE} strokeWidth="2.5" />
    </g>
  );

  return (
    <svg
      className="robot-avatar"
      width={size}
      height={size}
      viewBox="0 -5 100 106"
      aria-label={robot.name}
      role="img"
    >
      {bailed ? (
        <>
          {board(2, 80, -8)}
          <g transform="translate(74 30) rotate(100) scale(0.6)">
            {backArms}
            {legs}
            {frontArms}
            {boots}
            {bodyGroup}
          </g>
        </>
      ) : (
        <>
          <g transform="translate(2 0) scale(0.95)">
            {backArms}
            {legs}
            {frontArms}
            {boots}
            {bodyGroup}
          </g>
          {board(18, 86)}
        </>
      )}
    </svg>
  );
}
