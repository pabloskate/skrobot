import type { SceneCamera } from '../../camera/camera';
import { stageView, type StageView } from '../../camera/view';
import { WALLENBERG_DROP, WALLENBERG_RUN, WALLENBERG_SCHOOL_X } from './wallenbergLayout';

/** Keep an uphill camera in front of the gym, including the beginning of the approach. */
export function wallenbergView(lift: number, scroll: number, camera: Readonly<SceneCamera>, zoom: number, aspect: number): StageView {
  const rad = Math.PI / 180;
  const uphill = Math.max(0, Math.sin(camera.yaw * rad));
  const floorPitch = Math.atan(WALLENBERG_DROP / WALLENBERG_RUN * uphill + Math.tan(3 * rad)) / rad;
  const safe = { ...camera, pitch: Math.max(camera.pitch, floorPitch) };
  const view = stageView(lift, safe, zoom, aspect);
  const limit = WALLENBERG_SCHOOL_X + 12 - scroll;
  if (view.eye[0] >= limit) return view;
  // Distance and focal length scale together, retaining the target and rider size.
  // The bound follows the approaching rider continuously; it never flips the spot.
  return stageView(lift, { ...safe, lens: safe.lens * Math.max(0.001, limit / view.eye[0]) }, zoom, aspect);
}
