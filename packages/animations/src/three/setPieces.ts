import type { StageSet } from '../sets/sets';
import type { SetPiece } from './renderer';
import { ElToro3D } from '../sets/elToro/elToro3d';
import { Hollywood3D } from '../sets/hollywood/hollywood3d';
import { Wallenberg3D } from '../sets/wallenberg/wallenberg3d';
import { Sunset3D } from '../sets/sunset/sunset3d';
import { Lyon3D } from '../sets/lyon/lyon3d';
import { LeapOfFaith3D } from '../sets/leapOfFaith/leapOfFaith3d';
import { Miami3D } from '../sets/miami/miami3d';
import { UcDavis3D } from '../sets/ucDavis/ucDavis3d';
import { Carlsbad3D } from '../sets/carlsbad/carlsbad3d';
import { Emage3D } from '../sets/emage/emage3d';
import { Plaza3D } from '../sets/plaza3d';
import { Waterfront3D } from '../sets/waterfront/waterfront3d';

/** Each set's scenery. Its rules (stairs, a handrail, tripods) are in sets/sets.ts. */
export const SET_PIECES: Record<StageSet, () => SetPiece> = {
  plaza: () => new Plaza3D(),
  waterfront: () => new Waterfront3D(),
  'el-toro': () => new ElToro3D(),
  'hollywood-high': () => new Hollywood3D(),
  'hollywood-high-12': () => new Hollywood3D('twelve'),
  wallenberg: () => new Wallenberg3D(),
  'sunset-car-wash': () => new Sunset3D(),
  'lyon-25': () => new Lyon3D(),
  'leap-of-faith': () => new LeapOfFaith3D(),
  'miami-triangle': () => new Miami3D(),
  'uc-davis-gap': () => new UcDavis3D(),
  'carlsbad-gap': () => new Carlsbad3D(),
  'emage-20': () => new Emage3D(),
};
