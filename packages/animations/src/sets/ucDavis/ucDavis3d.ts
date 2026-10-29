import { ClassicSpot3D } from '../classicSpot3d';
import { craneThrough, type SceneCamera, type TripodId } from '../../camera/camera';
import { fromThree, stageView, type StageView } from '../../camera/view';
import { smoothstep } from '../../math';
import type { StageFrame } from '../../stage/stage';
import { SET_SCALE } from '../setScale';
import { buildUcDavisGeometry } from './ucDavisGeometry';
import {
  UC_DAVIS_DROP, UC_DAVIS_FILMERS, UC_DAVIS_FOOT as F, UC_DAVIS_LANE_Z, UC_DAVIS_RUN, ucDavisGround,
  UC_DAVIS_BUILDING_FRONT_X,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_ROOF_FRONT_X,
} from './ucDavisLayout';

export class UcDavis3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildUcDavisGeometry,
      laneZ: UC_DAVIS_LANE_Z, ground: ucDavisGround,
      grade: UC_DAVIS_DROP / UC_DAVIS_RUN, run: UC_DAVIS_RUN, drop: UC_DAVIS_DROP,
      cameraZ: [-100 * F, 100 * F],
      stayUp: ['stairs'],
      filmers: UC_DAVIS_FILMERS,
    });
  }

  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null): StageView | null {
    const view = super.view(frame, camera, zoom, aspect, tripod);
    if (!view || tripod || !frame.stairs) return view;
    const x = (view.eye[0] + frame.scroll) / SET_SCALE;
    const z = (view.eye[2] + frame.stairs.across) / SET_SCALE;
    // A following camera can ride inside the actual hallway. Keep it
    // between the walls and under the ceiling while filming the approach.
    const inside = 1 - smoothstep((x - UC_DAVIS_BUILDING_FRONT_X) / (4 * F));
    const limit = UC_DAVIS_HALL_HALF_WIDTH - 0.75 * F;
    const across = z + (Math.max(-limit, Math.min(limit, z)) - z) * inside;
    const covered = 1 - smoothstep((Math.min(x, frame.scroll / SET_SCALE) - UC_DAVIS_ROOF_FRONT_X) / (4 * F));
    const y = view.eye[1] / SET_SCALE;
    const height = y + (Math.min(y, 10.5 * F) - y) * covered;
    if (across === z && height === y) return view;
    const eye: [number, number, number] = [view.eye[0], height * SET_SCALE, across * SET_SCALE - frame.stairs.across];
    return stageView(frame.lift, craneThrough(fromThree(eye), frame.lift), zoom, aspect);
  }
}
