import type { SceneCamera, TripodId } from '../../camera/camera';
import { FOOT, RISER, STAIR_DROP, STAIR_RUN, TREAD } from './stairs';
import { EL_TORO_CANOPY } from './elToroCanopy';
import { BUILDING_FACE, EAVE, RIDER_LANE_Z, WALL_Z, hill } from './elToroLayout';
import type { StageFrame } from '../../stage/stage';
import { stageView, tripodView, type StageView, type Vec3 } from '../../camera/view';

/** The camera stays in the open walkway, clear of the school's eave and wall (the set's z; the stage's is less where the rider is across it). */
const CAMERA_Z = BUILDING_FACE - EAVE - 24;
/** The nearest canopy beam projects six units past the roof edge. */
const CAMERA_MIN_Z = EL_TORO_CANOPY.z1 + 6 + 24;
/** Those limits in the stage's z with the rider on their line down the stairs. */
export const EL_TORO_CAMERA_Z = CAMERA_Z - RIDER_LANE_Z;
export const EL_TORO_CAMERA_MIN_Z = CAMERA_MIN_Z - RIDER_LANE_Z;
const DEG = Math.PI / 180;
/** A fallen rider's low orbit target still needs a few degrees over the asphalt. */
const FLOOR_CLEARANCE_SLOPE = Math.tan(3 * DEG);

/**
 * Keep the full orbit inside the open corridor between the school and the
 * canopy. Uphill views also rise above the stair grade, so the camera stays
 * over the steps while the rider descends. Both constraints depend only on
 * the requested orbit, never the frame, stance or outcome.
 *
 * Shortening the lens scales focal length and distance together, preserving
 * the target and its scale. These fixed limits never pump during the attempt.
 */
export function elToroView(lift: number, camera: Readonly<SceneCamera>, zoom: number, aspect: number, across = RIDER_LANE_Z): StageView {
  const uphill = Math.max(0, Math.sin(camera.yaw * DEG));
  const floorPitch = Math.atan((RISER / TREAD) * uphill + FLOOR_CLEARANCE_SLOPE) / DEG;
  const safeCamera = { ...camera, pitch: Math.max(camera.pitch, floorPitch) };
  const view = stageView(lift, safeCamera, zoom, aspect);
  // `across` is where the rider is across the set: their line, or the center rail for a grind.
  const max = CAMERA_Z - across;
  const min = CAMERA_MIN_Z - across;
  const bound = view.eye[2] > max ? max : view.eye[2] < min ? min : null;
  if (bound === null) return view;
  const targetZ = camera.targetZ ?? 0;
  const ratio = (bound - targetZ) / (view.eye[2] - targetZ);
  return stageView(lift, { ...safeCamera, lens: safeCamera.lens * ratio }, zoom, aspect);
}

/**
 * Where El Toro's filmers stand, in the set's own layout (along the stairs
 * from the lip, across them, and the lens's height over the top landing),
 * how far off each one's lens shows the rider at the crane's size, and how
 * far down the picture it holds them. All three stand on the side wall's
 * side, clear of the rider's line, the rail, and the ride away.
 */
export const EL_TORO_TRIPODS: Readonly<Record<TripodId, { u: number; z: number; height: number; frame: number; place: number }>> = {
  // Crouched on the bottom landing a little off the line, where the ride away rolls up to.
  bottom: { u: STAIR_RUN + 30 * FOOT, z: WALL_Z - FOOT, height: 3 * FOOT - STAIR_DROP, frame: 30 * FOOT, place: 0.42 },
  // Well up the grass bank past the side wall, on a long lens across the set.
  side: { u: 0.6 * STAIR_RUN, z: WALL_Z + 20 * FOOT, height: hill(0.6 * STAIR_RUN) + 5 * FOOT, frame: 30 * FOOT, place: 0.52 },
  // At the top beside the side wall, holding the camera up to see down the set.
  top: { u: -40, z: WALL_Z + 3 * FOOT, height: 6 * FOOT, frame: 20 * FOOT, place: 0.48 },
};

/** El Toro filmed from one of its tripods: the eye stays where the filmer stands while the set slides under the rider. */
export function elToroTripodView(tripod: TripodId, frame: Pick<StageFrame, 'scroll' | 'lift' | 'stairs'>, zoom: number, aspect: number): StageView {
  const spot = EL_TORO_TRIPODS[tripod];
  const across = frame.stairs?.across ?? RIDER_LANE_Z;
  const eye: Vec3 = [spot.u - frame.scroll, spot.height, spot.z - across];
  return tripodView(eye, frame.lift, spot.frame, spot.place, zoom, aspect);
}
