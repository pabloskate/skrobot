import type { SceneCamera, TripodId } from '../../camera/camera';
import type { StageView } from '../../camera/view';
import type { StageFrame } from '../../stage/stage';
import { CARLSBAD_LOOK } from '../carlsbad/carlsbad3d';
import { ClassicSpot3D } from '../classicSpot3d';
import type { SpotLook } from '../surfaces';
import { elToroTripodView, elToroView } from './elToroCamera';
import { buildElToroGeometry } from './elToroGeometry';
import { CENTER_Z, EL_TORO_FILMERS, FAR_RAIL_Z, HILL_EDGE, HILL_RAIL_Z, LIP_AWAY, RIDER_LANE_Z, WALL_Z } from './elToroLayout';
import { elToroCanopies, elToroTrees } from './elToroTrees';
import { RISER, SET_FOOT, STAIR_DROP, STAIR_RUN, TREAD, stairGround } from './stairs';

/**
 * El Toro in the same Southern California midday as Carlsbad, twenty miles
 * up the coast: its sun, fill, eave shade and haze. Urethane marks where
 * boards roll to the lip along the left-hand flight and land and roll away
 * at the bottom (feet, the spot's own x and z), fainter than Carlsbad's.
 * The stairs' own wear (riser stains under the rails, rubbed noses, dusty
 * backs and leaves), gum on the walks, a greyer mortar in the block, and
 * the locker banks' doors (a foot wide, eight tiers to the lower level's
 * 9.5 ft drop, so both levels' banks share the grid) are El Toro's alone,
 * as are the leaves patterned round its modelled shrubs and hedges.
 */
export const EL_TORO_LOOK: SpotLook = {
  ...CARLSBAD_LOOK,
  marks: [{ x: [-14, -0.5], z: [9, 15] }, { x: [24, 55], z: [4, 15] }],
  // A thinner haze than Carlsbad's: the far blocks sit back without washing out.
  haze: { color: '#cfd6d6', from: 60, to: 1100, amount: 0.42 },
  markDepth: 0.1,
  stairs: {
    x: [0, STAIR_RUN / SET_FOOT],
    z: [HILL_EDGE / SET_FOOT, WALL_Z / SET_FOOT],
    top: 0,
    tread: TREAD / SET_FOOT,
    riser: RISER / SET_FOOT,
    rails: [HILL_RAIL_Z, CENTER_Z, FAR_RAIL_Z].map((z) => z / SET_FOOT),
  },
  gum: 4,
  mortar: '#c4b49a',
  lockers: { door: 1, tier: 9.5 / 8, from: 9.5 / 16 },
  foliage: true,
  // Carlsbad's wing sash is Carlsbad's alone.
  sash: undefined,
};

/**
 * Classic El Toro: twenty steps, a single center handrail, straight sloping
 * side rails, an exposed dirt bank, the locker school on the left and an
 * open covered walkway on the right when viewed from the landing.
 * Photo references and the user-supplied layout correction are documented
 * in docs/EL_TORO_REFERENCE.md.
 *
 * Drawn by the shared classic-spot pipeline with the realistic look:
 * procedural concrete, soil, grass, block, roofing and metal, the rails'
 * and the buildings' shade, contact shade where faces meet, and the
 * street-prop gums' dapple. Rider shadows are reprojected from the
 * renderer's shadow level onto each tread and riser. The environment is
 * built once in its canonical downhill direction. Fakie changes the rider's
 * heading in stage.ts; it never mirrors or rebuilds this location.
 */
export class ElToro3D extends ClassicSpot3D {
  constructor() {
    const trees = elToroTrees();
    super({
      build: () => buildElToroGeometry(elToroCanopies(trees)),
      laneZ: RIDER_LANE_Z,
      ground: stairGround,
      grade: STAIR_DROP / STAIR_RUN,
      run: STAIR_RUN,
      drop: STAIR_DROP,
      filmers: EL_TORO_FILMERS,
      streetProps: { trees },
      look: EL_TORO_LOOK,
      away: LIP_AWAY,
    });
  }

  /** Filmed from one of its tripods, or by the crane kept in the walkway between the school and the canopy. */
  override view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null): StageView | null {
    if (!frame.stairs) return null;
    return tripod ? elToroTripodView(tripod, frame, zoom, aspect, camera) : elToroView(frame.lift, camera, zoom, aspect, frame.stairs.across);
  }
}
