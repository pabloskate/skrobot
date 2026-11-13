import { ClassicSpot3D } from '../classicSpot3d';
import { craneThrough, type SceneCamera, type TripodId } from '../../camera/camera';
import { fromThree, stageView, type StageView } from '../../camera/view';
import { smoothstep } from '../../math';
import type { StageFrame } from '../../stage/stage';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import { SET_SCALE } from '../setScale';
import type { SpotLook } from '../surfaces';
import { buildUcDavisGeometry } from './ucDavisGeometry';
import {
  UC_DAVIS_DROP, UC_DAVIS_FILMERS, UC_DAVIS_FOOT as F, UC_DAVIS_LANE_Z, UC_DAVIS_RUN, ucDavisGround,
  UC_DAVIS_BUILDING_FRONT_X,
  UC_DAVIS_HALL_HALF_WIDTH, UC_DAVIS_ROOF_FRONT_X,
  UC_DAVIS_RISER, UC_DAVIS_STAIR_FLIGHT, UC_DAVIS_STAIR_MID_END, UC_DAVIS_STAIR_Z0, UC_DAVIS_STAIR_Z1, UC_DAVIS_TREAD,
} from './ucDavisLayout';
import { UC_DAVIS_CARS, UC_DAVIS_TREES } from './ucDavisTrees';

/**
 * The Sacramento Valley's dry, warm late-afternoon light (the Camarillo photograph, the 2023 frames), dustier
 * than Carlsbad's: the realistic look, with the drive's asphalt, the fascia's bared aggregate, the
 * nine-flat-nine's weathering and the ivy's leaves.
 */
export const UC_DAVIS_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  haze: { color: '#d8d8cd', from: 50, to: 850, amount: 0.5 },
  // Urethane where boards roll across the terrace to the lip, and land and roll away below it.
  marks: [{ x: [-30, -1], z: [-2.5, 2.5] }, { x: [UC_DAVIS_RUN / F + 1.5, UC_DAVIS_RUN / F + 18], z: [-4.5, 4.5] }],
  markDepth: 0.1,
  gum: 1.5,
  // The drive's asphalt; upright, the fascia's exposed-aggregate panels.
  asphalt: { scale: 0.03, contrast: 0.14 },
  // Both flights of the nine-flat-nine, the landing between left plain, heavier grime under the handrails.
  stairs: {
    x: [0, UC_DAVIS_STAIR_FLIGHT / F], z: [UC_DAVIS_STAIR_Z0 / F, UC_DAVIS_STAIR_Z1 / F], top: 0,
    tread: UC_DAVIS_TREAD / F, riser: UC_DAVIS_RISER / F,
    rails: [UC_DAVIS_STAIR_Z0 / F + 0.45, UC_DAVIS_STAIR_Z1 / F - 0.45], then: UC_DAVIS_STAIR_MID_END / F,
  },
  foliage: true,
  sash: undefined,
};

export class UcDavis3D extends ClassicSpot3D {
  constructor() {
    super({
      build: buildUcDavisGeometry,
      laneZ: UC_DAVIS_LANE_Z, ground: ucDavisGround,
      grade: UC_DAVIS_DROP / UC_DAVIS_RUN, run: UC_DAVIS_RUN, drop: UC_DAVIS_DROP,
      cameraZ: [-100 * F, 100 * F],
      stayUp: ['stairs'],
      filmers: UC_DAVIS_FILMERS,
      streetProps: { trees: UC_DAVIS_TREES, cars: UC_DAVIS_CARS },
      look: UC_DAVIS_LOOK,
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
