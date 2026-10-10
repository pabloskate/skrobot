import type { SceneCamera } from '../../camera/camera';
import { stageView, type StageView } from '../../camera/view';
import {
  FOOT, WALLENBERG_ANNEX_FRONT_X, WALLENBERG_ANNEX_HEIGHT, WALLENBERG_ANNEX_X, WALLENBERG_DROP, WALLENBERG_GYM_X, WALLENBERG_GYM_Z, WALLENBERG_RUN, wallenbergRampHeight, wallenbergSurface,
} from './wallenbergLayout';

/** How far the crane keeps off the gym's side wall, the annex and the ground. */
export const WALLENBERG_CLEAR = 1.5 * FOOT;
/** Fastest the crane swings back out past the gym: degrees per foot the rider travels. */
const RELEASE = 2.8 / FOOT;
/** Sampling of the rider's travel, and the rounding of the swing's corners. */
const STEP = FOOT / 2;
const ROUND = 6;
const DEG = Math.PI / 180;
/** Steepest the crane tilts up to see over the roll-in or the annex; past it, it closes in instead. */
const MAX_TILT = 45;

/**
 * How far round (degrees from square to the line) the crane must swing to
 * keep out of the gym, its target at (x, z) and its eye `reach` away. Down
 * the alley beside the gym's side wall it swings round to film along the
 * wall: ahead of the rider until the eye is out past the gym's front (any
 * swing past that is clear too), or behind them until, swung round, the
 * eye is out past the front; between those, behind, the eye is in the gym.
 */
function swing(yaw: number, reach: number, x: number, z: number): number {
  const wall = WALLENBERG_GYM_Z - WALLENBERG_CLEAR - z;
  const alongWall = wall >= reach ? 0 : wall <= -reach ? 90 : Math.acos(wall / reach) / DEG;
  const front = WALLENBERG_GYM_X + WALLENBERG_CLEAR;
  if (yaw > 0) return x - reach * Math.sin(alongWall * DEG) >= front ? 0 : alongWall;
  const ahead = (front - x) / reach;
  return Math.min(alongWall, ahead <= 0 ? 0 : ahead >= 1 ? 90 : Math.asin(ahead) / DEG);
}

/**
 * Keep the crane out of the gym and the terrace. Down the alley it swings
 * round to film along the gym's wall, from ahead of the rider or behind,
 * and back out once they're past its corner, no faster than RELEASE, its
 * corners rounded. Where it would be under the roll-in, the slope or in the
 * annex it tilts up over them, and failing that closes in, distance and
 * focal length together; the rider's framing is kept throughout.
 */
export function wallenbergView(lift: number, scroll: number, camera: Readonly<SceneCamera>, zoom: number, aspect: number): StageView {
  const uphill = Math.max(0, Math.sin(camera.yaw * DEG));
  const floorPitch = Math.atan(WALLENBERG_DROP / WALLENBERG_RUN * uphill + Math.tan(3 * DEG)) / DEG;
  const pitched = { ...camera, pitch: Math.max(camera.pitch, floorPitch) };
  const requested = stageView(lift, pitched, zoom, aspect);
  const yaw = ((pitched.yaw % 360) + 540) % 360 - 180;
  let safe = pitched;
  if (Math.abs(yaw) < 90) {
    const reach = requested.distance * Math.cos(pitched.pitch * DEG);
    const target = requested.eye.map((v, i) => v - requested.back[i] * requested.distance);
    const x = scroll + target[0];
    // The swing at every point of the rider's travel up to here, released no faster than RELEASE.
    const back = Math.ceil(90 / RELEASE / STEP) + 2 * ROUND;
    let held = 0;
    const eased: number[] = [];
    for (let i = -back; i <= 2 * ROUND; i++) {
      held = Math.max(swing(yaw, reach, x + i * STEP, target[2]), held - RELEASE * STEP);
      eased.push(held);
    }
    // Round its corners without ever swinging less than it needs: dilate, then blur as far.
    let sum = 0;
    let total = 0;
    for (let k = -ROUND; k <= ROUND; k++) {
      let most = 0;
      for (let j = -ROUND; j <= ROUND; j++) most = Math.max(most, eased[back + k + j]);
      const w = Math.exp(-((k / (ROUND / 2)) ** 2) / 2);
      sum += w * most;
      total += w;
    }
    const round = Math.max(Math.abs(yaw), sum / total);
    if (round > Math.abs(yaw)) safe = { ...pitched, yaw: Math.sign(yaw || -1) * round };
  }
  // Over the roll-in (the whole alley's width, so a swung crane never sees its edge), the annex and the slope:
  // tilt up over them, as a filmer up on the deck would, eased over the rider's travel; failing that, close in.
  const clearAt = ([x, y, z]: number[]) => {
    const inAnnex = x < WALLENBERG_ANNEX_FRONT_X + WALLENBERG_CLEAR && x > WALLENBERG_ANNEX_X && z < WALLENBERG_GYM_Z && y < WALLENBERG_ANNEX_HEIGHT + WALLENBERG_CLEAR;
    const ground = x < 0 && Math.abs(z) < WALLENBERG_GYM_Z ? wallenbergRampHeight(x) : wallenbergSurface(x, z);
    return !inAnnex && y >= ground + WALLENBERG_CLEAR;
  };
  const view = safe === pitched ? requested : stageView(lift, safe, zoom, aspect);
  const target = view.eye.map((v, i) => v - view.back[i] * view.distance);
  const turn = safe.yaw * DEG;
  // The eye with the rider at x down the line (as high as the roll-in carries them there), tilted to `pitch`.
  const ride = (x: number) => (x < 0 ? wallenbergRampHeight(x) : 0);
  const eyeAt = (x: number, pitch: number) => [
    x + target[0] - view.distance * Math.sin(turn) * Math.cos(pitch * DEG),
    target[1] + ride(x) - ride(scroll) + view.distance * Math.sin(pitch * DEG),
    target[2] + view.distance * Math.cos(turn) * Math.cos(pitch * DEG),
  ];
  const tilt = (x: number) => {
    if (clearAt(eyeAt(x, safe.pitch))) return safe.pitch;
    if (!clearAt(eyeAt(x, MAX_TILT))) return MAX_TILT;
    let lo = safe.pitch;
    let hi = MAX_TILT;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (clearAt(eyeAt(x, mid))) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const tilts = Array.from({ length: 4 * ROUND + 1 }, (_, i) => tilt(scroll + (i - 2 * ROUND) * STEP));
  let sum = 0;
  let total = 0;
  for (let k = -ROUND; k <= ROUND; k++) {
    let most = safe.pitch;
    for (let j = -ROUND; j <= ROUND; j++) most = Math.max(most, tilts[2 * ROUND + k + j]);
    const w = Math.exp(-((k / (ROUND / 2)) ** 2) / 2);
    sum += w * most;
    total += w;
  }
  const up = sum / total > safe.pitch + 1e-6 ? { ...safe, pitch: sum / total } : safe;
  const tilted = up === safe ? view : stageView(lift, up, zoom, aspect);
  const world = (v: StageView, r = 1) => {
    const aim = v.eye.map((e, i) => e - v.back[i] * v.distance);
    const [x, y, z] = v.eye.map((e, i) => aim[i] + (e - aim[i]) * r);
    return [x + scroll, y, z];
  };
  if (clearAt(world(tilted))) return tilted;
  let lo = 0.05;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (clearAt(world(tilted, mid))) lo = mid;
    else hi = mid;
  }
  return stageView(lift, { ...up, lens: up.lens * lo }, zoom, aspect);
}
