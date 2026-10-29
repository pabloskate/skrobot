import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Texture, Vector3, type Object3D } from 'three';
import { DEFAULT_SCENE_CAMERA, type CameraSide, type TripodId } from '../camera/camera';
import { toThree, type StageView } from '../camera/view';
import { resolveSkateStyle } from '../motion/style';
import { planStage, stageFrame, type StageFrame, type StagePlan } from '../stage/stage';
import type { RiderStance } from '../types';
import { sweepHz, SWEEP_TIMEOUT } from '../testing';
import { SET_FOOT as F, SET_SCALE } from './setScale';
import { setInfo, STAGE_SETS, type Obstacle, type StageSet } from './sets';
import { filmersFor, setFilmers, standSide, tripodSide, tripodStand } from './tripods';
import { Carlsbad3D } from './carlsbad/carlsbad3d';
import { ElToro3D } from './elToro/elToro3d';
import { Emage3D } from './emage/emage3d';
import { Hollywood3D } from './hollywood/hollywood3d';
import { LeapOfFaith3D } from './leapOfFaith/leapOfFaith3d';
import { Lyon3D } from './lyon/lyon3d';
import { Miami3D } from './miami/miami3d';
import { Sunset3D } from './sunset/sunset3d';
import { UcDavis3D } from './ucDavis/ucDavis3d';
import { Wallenberg3D } from './wallenberg/wallenberg3d';

interface Piece {
  group: Object3D;
  view(frame: StageFrame, camera: typeof DEFAULT_SCENE_CAMERA, zoom: number, aspect: number, tripod: TripodId | null): StageView | null;
  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, opacity: [number, number, number], frame: StageFrame): void;
  dispose(): void;
}

const PIECES: Partial<Record<StageSet, () => Piece>> = {
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

const LANDMARKS = STAGE_SETS.filter((set) => set.tripods.length > 0).map((set) => set.id);
const TRIPODS: TripodId[] = ['bottom', 'side', 'top'];
const SIDES: CameraSide[] = ['left', 'right'];
const RIDERS: RiderStance[] = ['regular', 'goofy'];

/** A line filmed at a spot: a flatground trick over one of its obstacles, or a grind down one of its ledges. */
interface Line { name: string; base: string; obstacle?: Obstacle }

/** Every way down a spot has filmers for. */
function linesAt(set: StageSet): Line[] {
  const info = setInfo(set);
  const lines: Line[] = (info.obstacles?.map((o) => o.id) ?? ['stairs' as const]).map((obstacle) => ({ name: obstacle, base: 'Kickflip', obstacle }));
  // A grind down each ledge: frontside takes one edge, backside the other.
  if (info.ledges) for (const base of ['Frontside 50-50 Grind', 'Backside 50-50 Grind']) lines.push({ name: base, base });
  return lines;
}

const plan = (set: StageSet, line: Line, riderStance: RiderStance): StagePlan => planStage({ id: line.base, name: line.base, base: line.base, stance: 'regular' }, {
  set, obstacle: line.obstacle, landed: true, riderStance, style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65,
});

/** The pop and touchdown of a jump, or a grind's. */
const moments = (stage: StagePlan) => stage.stairs ? { pop: stage.stairs.pop, land: stage.stairs.land } : { pop: stage.grind!.pop, land: stage.grind!.land };

const inSet = (frame: StageFrame, eye: readonly number[]) => ({ u: (eye[0] + frame.scroll) / SET_SCALE, z: (eye[2] + frame.stairs!.across) / SET_SCALE });

/** The scenery as drawn this frame, in the stage's three world: everything solid but the sky. */
function scenery(piece: Piece, view: StageView, frame: StageFrame, material: MeshBasicMaterial): Mesh[] {
  piece.update(view, frame.scroll, { width: 620, height: 500 }, new Texture(), [0, 0, 0], frame);
  piece.group.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  piece.group.traverse((o) => {
    if (!(o instanceof Mesh) || o.renderOrder <= -100) return;
    const solid = new Mesh(o.geometry, material);
    solid.matrixAutoUpdate = false;
    solid.matrixWorld.copy(o.matrixWorld);
    meshes.push(solid);
  });
  return meshes;
}

const other = (side: CameraSide): CameraSide => side === 'left' ? 'right' : 'left';

describe('the landmarks’ filmers stand either side of the rider’s line', () => {
  it('has filmers wherever a spot offers tripods, each with somewhere to stand across the line', () => {
    for (const set of STAGE_SETS) {
      const filmers = setFilmers(set.id);
      expect(filmers != null, set.id).toBe(set.tripods.length > 0);
      if (!filmers) continue;
      expect(PIECES[set.id], set.id).toBeDefined();
      const tables = [filmers.stairs, ...Object.values(filmers.obstacles ?? {}), ...Object.values(filmers.ledges ?? {})];
      for (const tripods of tables) for (const tripod of set.tripods) {
        const own = standSide(tripods, tripod);
        expect(tripodStand(tripods, tripod)).toBe(tripods.stands[tripod]);
        expect(tripodStand(tripods, tripod, own)).toBe(tripods.stands[tripod]);
        // Really across, and far enough off the line that the picture changes.
        const across = tripodStand(tripods, tripod, other(own));
        expect(standSide({ ...tripods, stands: { ...tripods.stands, [tripod]: across } }, tripod), `${set.id}/${tripod}`).toBe(other(own));
        const line = typeof tripods.line === 'number' ? tripods.line : tripods.line(across.u);
        expect(Math.abs(across.z - line), `${set.id}/${tripod}`).toBeGreaterThan(4 * F - 1e-6);
      }
    }
    // The explorer reads each filmer's own side from the same tables.
    expect(tripodSide('plaza', 'bottom')).toBeNull();
    expect(tripodSide('el-toro', 'side')).toBe('right');
    expect(tripodSide('hollywood-high', 'side', { obstacle: 'fence' })).toBe(standSide(setFilmers('hollywood-high')!.obstacles!.fence!, 'side'));
    expect(tripodSide('miami-triangle', 'bottom', { ledge: 'right' })).toBe('left');
    expect(tripodSide('miami-triangle', 'bottom', { ledge: 'left' })).toBe('right');
  });

  it.each(LANDMARKS)('films %s from either side with the rider in frame, the filmer standing clear of them on that side', (set) => {
    const piece = PIECES[set]!();
    const failures: string[] = [];
    try {
      for (const line of linesAt(set)) for (const rider of RIDERS) {
        const stage = plan(set, line, rider);
        const hz = sweepHz(15);
        const { pop, land } = moments(stage);
        const times = [...Array.from({ length: Math.ceil(stage.end * hz) + 1 }, (_, i) => Math.min(stage.end, i / hz)), pop, land];
        for (const tripod of TRIPODS) {
          // How near the rider rides by each side's filmer: across the line, no nearer than its own (or four feet).
          const closest = { left: Infinity, right: Infinity };
          for (const side of SIDES) {
            for (const t of times) {
              const frame = stageFrame(stage, t, 1);
              const view = piece.view(frame, { ...DEFAULT_SCENE_CAMERA, side }, 1, 1.24, tripod)!;
              const context = `${line.name}/${rider}/${tripod}/${side} at ${t.toFixed(2)}`;
              const eye = inSet(frame, view.eye);
              const tripods = filmersFor(setFilmers(set)!, frame.stairs!);
              const shown = tripodStand(tripods, tripod, side);
              if (Math.abs(eye.u - shown.u) > 1e-6 || Math.abs(eye.z - shown.z) > 1e-6) failures.push(`${context}: moved off its stand`);
              if (standSide({ ...tripods, stands: { ...tripods.stands, [tripod]: shown } }, tripod) !== side) failures.push(`${context}: on the wrong side`);
              const board = inSet(frame, toThree(frame.rig.board.center));
              closest[side] = Math.min(closest[side], Math.hypot(eye.u - board.u, eye.z - board.z));
              for (const point of [frame.rig.head.at(0, -30, 0), frame.rig.board.center]) {
                const p = view.cam.project(point);
                if (!(p.x > view.box.x && p.x < view.box.x + view.box.width && p.y > view.box.y && p.y < view.box.y + view.box.height)) {
                  failures.push(`${context}: out of frame`);
                  break;
                }
              }
            }
          }
          const own = standSide(filmersFor(setFilmers(set)!, stageFrame(stage, pop, 1).stairs!), tripod);
          const across = other(own);
          if (closest[across] < Math.min(closest[own], 4 * F) - 0.05 * F) {
            failures.push(`${line.name}/${rider}/${tripod}/${across}: rides ${(closest[across] / F).toFixed(1)} ft from the filmer, ${(closest[own] / F).toFixed(1)} on its own side`);
          }
        }
      }
    } finally { piece.dispose(); }
    expect(failures.slice(0, 20)).toEqual([]);
  }, SWEEP_TIMEOUT);

  it.each(LANDMARKS)('sees the rider at %s past the scenery from across the line about as well as from the filmer’s own side', (set) => {
    // As each spot's own tests check its filmers: from the run-up's last
    // moments to the ride away (the top one, past the lip, only until the
    // rider drops away from it), the board only once it's up off the lip
    // that hides it from below. Across the line a filmer stands on the
    // ground like its own one and loses the rider hardly any more often.
    const piece = PIECES[set]!();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const failures: string[] = [];
    const down = new Vector3(0, -1, 0);
    try {
      for (const line of linesAt(set)) {
        const stage = plan(set, line, 'regular');
        const { pop, land } = moments(stage);
        for (const tripod of TRIPODS) {
          const own = standSide(filmersFor(setFilmers(set)!, stageFrame(stage, pop, 1).stairs!), tripod);
          const across = other(own);
          const hidden = { left: 0, right: 0 };
          const heights = { left: [Infinity, -Infinity], right: [Infinity, -Infinity] };
          for (const side of SIDES) {
            const until = tripod === 'top' ? (pop + land) / 2 : Math.min(stage.end, land + 0.4);
            for (let t = pop - 0.4; t <= until; t += 1 / sweepHz(10)) {
              const frame = stageFrame(stage, t, 1);
              const view = piece.view(frame, { ...DEFAULT_SCENE_CAMERA, side }, 1, 1.24, tripod)!;
              const solid = scenery(piece, view, frame, material);
              const eye = new Vector3(...view.eye);
              const under = new Raycaster(eye, down, 0, 30 * F * SET_SCALE).intersectObjects(solid)[0];
              const height = under ? under.distance / SET_SCALE / F : Infinity;
              heights[side] = [Math.min(heights[side][0], height), Math.max(heights[side][1], height)];
              const points = t >= pop + 0.15 || tripod === 'top' ? [frame.rig.head.at(0, -30, 0), frame.rig.board.center] : [frame.rig.head.at(0, -30, 0)];
              for (const point of points) {
                const target = new Vector3(...toThree(point));
                const direction = target.sub(eye);
                const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 6);
                if (ray.intersectObjects(solid).length) hidden[side]++;
              }
            }
          }
          const context = `${line.name}/${tripod}/${across}`;
          // Standing on something, holding the camera at a person's height or a little over (or as high as its own one does).
          const [low, high] = heights[across];
          if (low < 1.5 || high > Math.max(12, heights[own][1] + 0.5)) failures.push(`${context}: eye ${low.toFixed(1)}–${high.toFixed(1)} ft over what's under it`);
          if (hidden[across] > hidden[own] + 3) failures.push(`${context}: rider hidden ${hidden[across]} times, ${hidden[own]} from its own side`);
        }
      }
    } finally { piece.dispose(); material.dispose(); }
    expect(failures).toEqual([]);
  }, SWEEP_TIMEOUT);
});
