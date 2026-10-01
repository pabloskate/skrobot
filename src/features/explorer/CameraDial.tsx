import type { SceneCamera } from '@skrobot/animations';

const SIZE = 24;
const C = SIZE / 2;
const R = 9.5;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A top-down map of the camera: the board in the middle rolling right, and
 * the camera round it where it stands, closer in the higher it looks down
 * from. Decorative; the label beside it names the angle.
 */
export default function CameraDial({ camera, size = SIZE }: { camera: SceneCamera; size?: number }) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const reach = R * Math.cos((camera.pitch * Math.PI) / 180);
  // The camera's eye relative to the rider: world x right, world z (toward the viewer) down.
  // Rounded so the server and the browser, whose trig can differ in the last
  // digit, render the same markup.
  const x = round(C - Math.sin(yaw) * reach);
  const y = round(C + Math.cos(yaw) * reach);
  const toRider = Math.atan2(C - y, C - x);
  const spread = 0.5;
  const ray = 6;
  const cone = [toRider - spread, toRider + spread]
    .map((a) => `${round(x + Math.cos(a) * ray)},${round(y + Math.sin(a) * ray)}`)
    .join(' ');
  return (
    <svg className="explorer-dial" width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <circle cx={C} cy={C} r={R + 1.5} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1.2} />
      <rect x={C - 4.5} y={C - 1.6} width={9} height={3.2} rx={1.6} fill="currentColor" />
      <polygon points={`${x},${y} ${cone}`} fill="currentColor" fillOpacity={0.35} />
      <circle cx={x} cy={y} r={2.6} fill="currentColor" />
    </svg>
  );
}
