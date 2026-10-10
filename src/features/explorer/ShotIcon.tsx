import type { SceneCamera } from '@skrobot/animations';

const SIZE = 48;
const C = SIZE / 2;
/** How far from the rider the camera is drawn: out past the stairs, wherever it stands. */
const REACH = 15.5;
/** The stair nosings, top-down, across the rider's line from the top (left) to the bottom (right). */
const STEPS = [19, 21.5, 24, 26.5, 29];

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A map of the shot from above: the stairs in the middle, the rider's line
 * running down them left to right, and a camera standing where the filmer
 * does, aimed at the rider, on legs if it's a tripod. Decorative; the label
 * beside it names the shot.
 */
export default function ShotIcon({ camera, tripod = false }: { camera: SceneCamera; tripod?: boolean }) {
  const yaw = (camera.yaw * Math.PI) / 180;
  // World x right, world z (toward the viewer) down, as CameraDial maps it.
  // Rounded so the server and the browser, whose trig can differ in the last
  // digit, render the same markup.
  const x = round(C - Math.sin(yaw) * REACH);
  const y = round(C + Math.cos(yaw) * REACH);
  const aim = round((Math.atan2(C - y, C - x) * 180) / Math.PI);
  return (
    <svg className="dream-shot-icon" width={56} height={56} viewBox={`3 3 ${SIZE - 6} ${SIZE - 6}`} aria-hidden>
      <rect x={STEPS[0] - 1.5} y={16} width={STEPS[STEPS.length - 1] - STEPS[0] + 3} height={16} rx={2} fill="currentColor" fillOpacity={0.08} />
      {STEPS.map((step) => (
        <line key={step} x1={step} y1={17} x2={step} y2={31} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.2} strokeLinecap="round" />
      ))}
      <path d={`M10 ${C} H37`} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="2.5 2.5" strokeLinecap="round" fill="none" />
      <path d={`M35 ${C - 3} L39 ${C} L35 ${C + 3}`} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <g transform={`translate(${x} ${y}) rotate(${aim})`}>
        <path d="M6 -1.5 L12 -5 V5 L6 1.5 Z" fill="currentColor" fillOpacity={0.16} />
        {tripod && (
          <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
            <line x1={-1} y1={0} x2={-6.5} y2={-4.5} />
            <line x1={-1} y1={0} x2={-6.5} y2={4.5} />
            <line x1={-1} y1={0} x2={-7.5} y2={0} />
          </g>
        )}
        <rect x={-4.5} y={-3.6} width={8} height={7.2} rx={1.8} fill="currentColor" />
        <path d="M3 -2 L6.5 -3.4 V3.4 L3 2 Z" fill="currentColor" />
      </g>
    </svg>
  );
}
