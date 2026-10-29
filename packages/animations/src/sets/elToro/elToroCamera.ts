import type { SceneCamera, TripodId } from '../../camera/camera';
import { RISER, TREAD } from './stairs';
import { EL_TORO_CANOPY } from './elToroCanopy';
import { BUILDING_FACE, EAVE, EL_TORO_FILMERS, RIDER_LANE_Z } from './elToroLayout';
import { SET_SCALE } from '../setScale';
import type { StageFrame } from '../../stage/stage';
import { stageView, tripodView, type StageView, type Vec3 } from '../../camera/view';
import { tripodStand } from '../tripods';

/** The camera stays in the open walkway, clear of the school's eave and wall (the set's z on the stage; the stage's is less where the rider is across it). */
const CAMERA_Z = (BUILDING_FACE - EAVE - 24) * SET_SCALE;
/** The nearest canopy beam projects six units past the roof edge. */
const CAMERA_MIN_Z = (EL_TORO_CANOPY.z1 + 6 + 24) * SET_SCALE;
/** The rider's line down the stairs, across the set on the stage. */
const LANE_Z = RIDER_LANE_Z * SET_SCALE;
/** Those limits in the stage's z with the rider on their line down the stairs. */
export const EL_TORO_CAMERA_Z = CAMERA_Z - LANE_Z;
export const EL_TORO_CAMERA_MIN_Z = CAMERA_MIN_Z - LANE_Z;
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
export function elToroView(lift: number, camera: Readonly<SceneCamera>, zoom: number, aspect: number, across = LANE_Z): StageView {
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

/** El Toro filmed from one of its tripods: the eye stays where the filmer stands while the set slides under the rider. */
export function elToroTripodView(tripod: TripodId, frame: Pick<StageFrame, 'scroll' | 'lift' | 'stairs'>, zoom: number, aspect: number, camera: Readonly<SceneCamera>): StageView {
  const spot = tripodStand(EL_TORO_FILMERS.stairs, tripod, camera.side);
  const across = frame.stairs?.across ?? LANE_Z;
  const eye: Vec3 = [spot.u * SET_SCALE - frame.scroll, spot.height * SET_SCALE, spot.z * SET_SCALE - across];
  return tripodView(eye, frame.lift, spot.frame * SET_SCALE, spot.place, zoom, aspect, camera.pan);
}
