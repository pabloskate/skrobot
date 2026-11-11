import { describe, expect, it } from 'vitest';
import { BufferGeometry, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, Raycaster, ShaderMaterial, Texture, Vector3, type Vector4 } from 'three';
import { resolveSkateStyle } from '../../motion/style';
import { SKATERS, type Skater } from '../../riders/skaters';
import type { RiderStance, Robot, Stance } from '../../types';
import { ElToro3D, EL_TORO_LOOK } from './elToro3d';
import { planStage, stageFrame } from '../../stage/stage';
import { stageView, toThree } from '../../camera/view';
import type { Vec3 } from '../../camera/view';
import {
  BUILDING_END, BUILDING_LENGTH, BUILDING_BACK, BUILDING_FACE, EAVE, CENTER_Z, EL_TORO_FILMERS, FAR_RAIL_Z, HILL_EDGE, HILL_RAIL_Z, LIP_AWAY, RAIL_EXT, RAIL_R, RIDER_LANE_Z, WALL_THICK, WALL_Z,
} from './elToroLayout';
import { SET_FOOT, RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD, stairGround } from './stairs';
import { buildElToroBuilding } from './elToroBuilding';
import { Bake } from '../../three/bake';
import { buildElToroCanopy, EL_TORO_CANOPY, EL_TORO_CANOPY_COLUMNS } from './elToroCanopy';
import { buildElToroGeometry } from './elToroGeometry';
import { elToroCanopies, elToroTrees } from './elToroTrees';
import { crownSpheres } from '../props/trees';
import { MAX_CANOPIES, MAX_CONTACTS, SURFACE } from '../surfaces';
import { SET_SCALE } from '../setScale';

const robot: Robot = {
  id: 'el-toro-geometry',
  name: 'Geometry rider',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
};

function scene() {
  const set = new ElToro3D();
  const shadow = new Texture();
  const view = stageView(0);
  const update = (stance: Stance, skater: Skater = 'robot', riderStance: RiderStance = 'regular', base = 'Ollie') => {
    const plan = planStage({ id: base, name: base, base, stance }, {
      landed: true,
      riderStance,
      skater,
      style: resolveSkateStyle(robot.skateStyle),
      fall: 'slam',
      shankProgress: 0.65,
      set: 'el-toro',
    });
    const frame = stageFrame(plan, 0.5, 1);
    set.update(view, frame.scroll, { width: 500, height: 404 }, shadow, [0.3, 0.3, 0.3], frame);
    return frame;
  };
  update('regular');
  update('fakie');
  const builds = set.group.children.filter((child): child is Group => child instanceof Group);
  return { set, shadow, builds, update };
}

/** The ground (with its decals) and the props, as ClassicSpot3D draws them. */
const parts = (set: ElToro3D) => set.terrain() as Mesh<BufferGeometry, ShaderMaterial>[];
const groundOf = (set: ElToro3D) => parts(set)[0];
/** The solid (look surface) of vertex i, decoded as the shader does. */
const solidOf = (geometry: BufferGeometry, i: number) => Math.floor((geometry.getAttribute('aInfo').getW(i) * 255) / 4 + 0.01);

const geometry = buildElToroGeometry(elToroCanopies());
/** The handrails' own segments: the bars and posts of exactly three rails. */
const handrails = geometry.railSegments.filter(({ radius }) => radius === RAIL_R);

describe('El Toro environment geometry', () => {
  it('keeps the detailed scene within the mobile geometry, draw and uniform budgets', () => {
    const { set, shadow, builds } = scene();
    try {
      expect(builds).toHaveLength(1);
      const meshes = parts(set);
      // Ground, props and the ground's decals: detail is merged into those three draws.
      expect(meshes).toHaveLength(3);
      let vertices = 0;
      for (const { geometry } of meshes) {
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        expect(position.count).toBeGreaterThan(0);
        expect(position.count % 3).toBe(0);
        expect(normal.count).toBe(position.count);
        expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
        expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
        vertices += position.count;
      }
      // The polygon trees, the per-block masonry, the modelled fence wires and roof seams are gone.
      expect(vertices).toBeLessThan(100_000);
      // Camera-facing discs must not return as a foliage shortcut: foliage
      // and architecture need to keep their shape in every orbit angle.
      const props = meshes[1];
      expect(Array.from(props.geometry.getAttribute('aCorner').array).every((value) => value === 0)).toBe(true);

      const u = groundOf(set).material.uniforms;
      for (const [countName, arrayNames, most] of [
        ['uRailCount', ['uRailA', 'uRailB'], 48],
        ['uBoxCount', ['uBoxMin', 'uBoxMax'], 12],
        ['uContactCount', ['uContactA', 'uContactB', 'uContactStep'], MAX_CONTACTS],
        ['uCanopyCount', ['uCanopy'], MAX_CANOPIES],
      ] as const) {
        const count = u[countName].value as number;
        expect(Number.isInteger(count)).toBe(true);
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(most);
        for (const name of arrayNames) {
          const entries = u[name].value as Vector4[];
          expect(count).toBeLessThanOrEqual(entries.length);
          expect(entries.flatMap((entry) => entry.toArray()).every(Number.isFinite)).toBe(true);
        }
      }
      // A zero radius or reach would produce invalid shadow math on live entries.
      for (const name of ['uRailA', 'uContactA', 'uCanopy']) {
        const count = u[name === 'uRailA' ? 'uRailCount' : name === 'uContactA' ? 'uContactCount' : 'uCanopyCount'].value as number;
        expect((u[name].value as Vector4[]).slice(0, count).every((entry) => entry.w > 0)).toBe(true);
      }
      // Props stand in the school's and the canopy's shade too.
      expect(props.material.uniforms.uBoxCount.value).toBe(u.uBoxCount.value);
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('stays inside its own shadow, contact and canopy budgets', () => {
    expect(geometry.shadowBoxes.length).toBeLessThanOrEqual(12);
    expect(geometry.railSegments.length).toBeLessThanOrEqual(48);
    expect(geometry.contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
    expect(geometry.canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
    // Both locker blocks' walls/eaves, canopy slab and six near piers, lantern.
    expect(geometry.shadowBoxes).toHaveLength(12);
    for (const { min, max } of geometry.shadowBoxes) for (let i = 0; i < 3; i++) expect(max[i]).toBeGreaterThan(min[i]);
    for (const { reach, strength } of geometry.contacts) {
      expect(reach).toBeGreaterThan(0);
      expect(strength).toBeGreaterThan(0);
    }
  });

  it('pins the campus massing, column grid and open gate to the shape plan', () => {
    expect(BUILDING_END / SET_FOOT).toBe(-18);
    expect(BUILDING_LENGTH / SET_FOOT).toBe(96);
    expect(BUILDING_BACK / SET_FOOT).toBe(125);
    expect(BUILDING_FACE).toBe(844);
    expect(EAVE).toBe(38);
    expect(EL_TORO_CANOPY.z1).toBe(-235);
    expect(EL_TORO_CANOPY.u0 / SET_FOOT).toBe(-114);
    expect(EL_TORO_CANOPY.u1 / SET_FOOT).toBe(4);
    expect(EL_TORO_CANOPY.z0 / SET_FOOT).toBe(-88);
    expect(EL_TORO_CANOPY_COLUMNS).toHaveLength(24);
    expect([...new Set(EL_TORO_CANOPY_COLUMNS.map(p=>p.u/SET_FOOT))]).toEqual([-4,-26,-48,-70,-92,-110]);
    expect([...new Set(EL_TORO_CANOPY_COLUMNS.map(p=>p.z/SET_FOOT))]).toEqual([-13,-35,-57,-83]);
    const fence = geometry.wireMesh.geometry.getAttribute('position');
    for(let i=0;i<fence.count;i++) {
      expect(fence.getX(i)).toBeCloseTo(-0.8*SET_FOOT,4);
      expect(fence.getZ(i)).toBeGreaterThanOrEqual(25*SET_FOOT);
      expect(fence.getZ(i)).toBeLessThanOrEqual(125*SET_FOOT);
    }
  });

  it('exposes both stair ends without a wall and keeps the three filmer sight lines clear', () => {
    const material = new MeshBasicMaterial({side:DoubleSide});
    const meshes=[geometry.ground,geometry.props,geometry.wireMesh.geometry].map(g=>new Mesh(g,material));
    try {
      // Across the former wall, one foot above the descending steps: clear air.
      const ray=new Raycaster(new Vector3(10*SET_FOOT,-3.5*SET_FOOT,17.8*SET_FOOT),new Vector3(0,0,1),0,0.6*SET_FOOT);
      expect(ray.intersectObject(meshes[0])).toHaveLength(0);
      for(const stand of Object.values(EL_TORO_FILMERS.stairs!.stands)) {
        const eye=new Vector3(stand.u,stand.height,stand.z);
        const target=new Vector3(10*SET_FOOT,-2*SET_FOOT,12*SET_FOOT);
        const direction=target.clone().sub(eye);
        const sight=new Raycaster(eye,direction.clone().normalize(),0,direction.length());
        const scenery = sight.intersectObjects(meshes).filter(hit => {
          const g=(hit.object as Mesh).geometry;
          const id=Math.round(g.getAttribute('aInfo').getX(hit.faceIndex! * 3)*255);
          // The preserved open handrails naturally cross a side view; scenery must not.
          return id < 60 || id > 69;
        });
        expect(scenery).toHaveLength(0);
      }
    } finally { material.dispose(); }
  });

  it('keeps exactly the same scene when the rider changes stance, placed under the rider', () => {
    const { set, shadow, builds, update } = scene();
    try {
      const meshes = parts(set);
      update('regular');
      const position = builds[0].position.clone();
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) {
        const frame = update(stance);
        expect(set.group.children.filter((child) => child instanceof Group)).toEqual(builds);
        expect(parts(set)).toEqual(meshes);
        // A nollie or fakie takes off further back (stairs.ts), so only its run along the stairs differs.
        expect(builds[0].position.x).toBeCloseTo(-frame.scroll, 9);
        expect(builds[0].position.y).toBe(position.y);
        expect(builds[0].position.z).toBe(position.z);
        if (stance !== 'nollie' && stance !== 'fakie') expect(builds[0].position.equals(position)).toBe(true);
        expect(builds[0].visible).toBe(true);
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('slides under the center rail for a grind, and keeps the lip out of reach with no stairs to place it', () => {
    const { set, shadow, builds, update } = scene();
    try {
      const grind = update('regular', 'robot', 'regular', 'Frontside 50-50 Grind');
      expect(builds[0].position.z).toBeCloseTo(-grind.stairs!.across, 9);
      set.update(stageView(0), 120, { width: 500, height: 404 }, shadow, [0.3, 0.3, 0.3]);
      expect(builds[0].position.x).toBeCloseTo(-120 + LIP_AWAY * SET_SCALE, 9);
      expect(builds[0].position.z).toBeCloseTo(-RIDER_LANE_Z * SET_SCALE, 9);
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('has one center rail and straight sloping bars without horizontal end kick-outs, every one casting its shadow', () => {
    const { set, shadow } = scene();
    try {
      // Three rails of a top bar, a mid bar and six posts each, exactly as before the look.
      expect(handrails).toHaveLength(24);
      const lanes = new Set<number>();
      for (const { a, b } of handrails) {
        expect(a[2]).toBe(b[2]);
        lanes.add(a[2]);
        if (Math.abs(a[0] - b[0]) > 0.01) {
          expect((b[1] - a[1]) / (b[0] - a[0])).toBeCloseTo(-RISER / TREAD, 8);
          expect(Math.min(a[0], b[0])).toBe(-RAIL_EXT);
          expect(Math.max(a[0], b[0])).toBe(STAIR_RUN + RAIL_EXT);
        } else {
          expect(a[0]).toBe(b[0]);
        }
      }
      expect([...lanes].sort((a, b) => a - b)).toEqual([HILL_RAIL_Z, CENTER_Z, FAR_RAIL_Z]);
      // The ground receives every one of them (and the fence's and the lantern's bars after them).
      const u = groundOf(set).material.uniforms;
      const a = u.uRailA.value as Vector4[], b = u.uRailB.value as Vector4[];
      handrails.forEach((rail, i) => {
        expect(a[i].toArray()).toEqual([...rail.a, RAIL_R]);
        expect(b[i].toArray().slice(0, 3)).toEqual(rail.b);
      });
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('centers the rail on the actual steps while preserving their twenty risers, height and run', () => {
    const ground = geometry.ground;
    const position = ground.getAttribute('position');
    const normal = ground.getAttribute('normal');
    const risers = new Map<number, Vector3[]>();
    const steps: Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i);
      // Treads and risers: the concrete faces between the bank and the wall, from the lip to the bottom step.
      if (point.x < 0 || point.x > STAIR_RUN + 1e-6 || point.z < HILL_EDGE || point.z > WALL_Z) continue;
      // The lower lawn shares precisely this apron corner, but is not a stair face.
      if (solidOf(ground,i) === SURFACE.grass) {
        expect(point.x).toBe(STAIR_RUN);
        expect(point.z).toBe(HILL_EDGE);
        continue;
      }
      // Nor is the base under the landing's slabs, a hair below them.
      if (point.y < -STAIR_DROP - 1e-3) continue;
      const riser = normal.getX(i) === 1;
      const tread = normal.getY(i) === 1 && point.y < -1;
      if (!riser && !tread) continue;
      expect(solidOf(ground, i)).toBe(SURFACE.concrete);
      steps.push(point);
      if (!riser) continue;
      const face = risers.get(point.x) ?? [];
      face.push(point);
      risers.set(point.x, face);
    }
    expect(risers.size).toBe(STAIR_STEPS);
    expect(STAIR_STEPS).toBe(20);
    expect([...risers.keys()].sort((a, b) => a - b).every((x, k) => Math.abs(x - k * TREAD) < 1e-4)).toBe(true);
    expect(Math.min(...steps.map(({ x }) => x))).toBe(0);
    expect(Math.max(...steps.map(({ x }) => x))).toBeCloseTo(STAIR_RUN, 5);
    expect(STAIR_RUN / SET_FOOT).toBe(20);
    expect(Math.max(...steps.map(({ y }) => y))).toBeCloseTo(0, 5);
    expect(Math.min(...steps.map(({ y }) => y))).toBeCloseTo(-STAIR_DROP, 5);
    expect(STAIR_DROP / SET_FOOT).toBe(9.5);
    for (const face of risers.values()) {
      const minZ = Math.min(...face.map(({ z }) => z));
      const maxZ = Math.max(...face.map(({ z }) => z));
      expect(maxZ - minZ).toBe(24 * SET_FOOT);
      expect((minZ + maxZ) / 2).toBe(CENTER_Z);
      expect(CENTER_Z - minZ).toBe(12 * SET_FOOT);
      expect(maxZ - CENTER_Z).toBe(12 * SET_FOOT);
      // Each riser is one step's height.
      const ys = face.map(({ y }) => y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(RISER, 4);
    }
  });

  it('draws the run-up and the landing at the height the board rolls on', () => {
    const mesh = new Mesh(geometry.ground, new MeshBasicMaterial({ side: DoubleSide }));
    const drawn = (u: number, z: number) =>
      new Raycaster(new Vector3(u, 60, z), new Vector3(0, -1, 0), 0, 60 + STAIR_DROP + 20).intersectObject(mesh)[0]?.point.y;
    // The rider's lane, and where a grind comes off a rail: those as far as the round lawn, the lane well past it.
    for (const [z, reach] of [[RIDER_LANE_Z, 140], [HILL_RAIL_Z, 50], [CENTER_Z, 50], [FAR_RAIL_Z, 50]]) {
      for (let u = -60 * SET_FOOT; u < -SET_FOOT; u += 3.7 * SET_FOOT) expect(drawn(u, z)).toBeCloseTo(stairGround(u), 4);
      for (let u = STAIR_RUN + 0.5 * SET_FOOT; u < reach * SET_FOOT; u += 1.7 * SET_FOOT) expect(drawn(u, z)).toBeCloseTo(stairGround(u), 4);
    }
  });

  it('bakes the ground with look surfaces: concrete stairs and landings, soil on the bank and in the bed, grass beyond', () => {
    const ground = geometry.ground;
    const position = ground.getAttribute('position');
    const solids = new Set<number>();
    /** The solids of the triangles whose middles `pick` accepts (the bank and the bed are single long quads). */
    const at = (pick: (p: Vector3) => boolean) => {
      const found = new Set<number>();
      for (let i = 0; i < position.count; i += 3) {
        const middle = new Vector3();
        for (let k = 0; k < 3; k++) middle.add(new Vector3().fromBufferAttribute(position, i + k).divideScalar(3));
        if (pick(middle)) found.add(solidOf(ground, i));
      }
      return found;
    };
    for (let i = 0; i < position.count; i++) solids.add(solidOf(ground, i));
    expect([...solids].sort()).toEqual([SURFACE.grass, SURFACE.concrete, SURFACE.soil].sort());
    // The bank beside the steps and the bed beyond the wall are soil.
    expect(at((p) => p.x > 100 && p.x < 500 && p.z < HILL_EDGE - 1 && p.z > -7.3 * SET_FOOT && p.y < -1)).toEqual(new Set([SURFACE.concrete]));
    expect(at((p) => p.x > SET_FOOT && p.x < 12*SET_FOOT && p.z < -8*SET_FOOT && p.z > -88*SET_FOOT && p.y < 0)).toEqual(new Set([SURFACE.soil]));
    expect(at((p) => p.x > 0 && p.x < STAIR_RUN && p.z > WALL_Z + 1 && p.z < 125*SET_FOOT && p.y < 0)).toEqual(new Set([SURFACE.soil]));
    // Every face is uninked: the look's surfaces draw no outlines.
    expect(Array.from({ length: position.count }, (_, i) => ground.getAttribute('aInfo').getZ(i)).every((w) => w === 0)).toBe(true);
    // Decals are ground too: concrete, soil or grass, never a prop.
    const decals = geometry.decals;
    for (let i = 0; i < decals.getAttribute('position').count; i++) expect([SURFACE.grass, SURFACE.concrete, SURFACE.soil]).toContain(solidOf(decals, i));
  });

  it('rides the left flight when looking upstairs for every avatar and stance', () => {
    const { set, shadow, builds, update } = scene();
    try {
      const build = builds[0];
      const centerRail = handrails.filter(({ a }) => a[2] === CENTER_Z);
      const farRail = handrails.filter(({ a }) => a[2] === FAR_RAIL_Z);
      expect(centerRail.length).toBeGreaterThan(0);
      expect(farRail.length).toBeGreaterThan(0);
      const fixedZ = build.position.z;

      for (const { id: skater } of SKATERS) {
        for (const riderStance of ['regular', 'goofy'] as RiderStance[]) {
          for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) {
            const frame = update(stance, skater, riderStance);
            set.group.updateMatrixWorld(true);
            const rider = new Vector3(...toThree(frame.rig.board.center));
            const localRider = build.worldToLocal(rider.clone());
            expect(build.position.z).toBe(fixedZ);
            expect(rider.z).toBe(0);
            expect(localRider.z).toBeCloseTo(RIDER_LANE_Z, 9);
            expect(localRider.z).toBeCloseTo((CENTER_Z + WALL_Z) / 2, 9);
            expect(localRider.z).toBeGreaterThan(CENTER_Z);
            expect(localRider.z).toBeLessThan(WALL_Z);

            // Check the actual scene transform and rail endpoints, not only
            // the layout constants. Positive z is left when looking upstairs.
            for (const rail of centerRail) {
              const point = build.localToWorld(new Vector3(...rail.a));
              expect(point.z).toBeLessThan(rider.z);
              expect(rider.z - point.z).toBeGreaterThanOrEqual(6 * SET_FOOT);
              expect(point.z + rail.radius).toBeLessThan(rider.z);
            }
            for (const rail of farRail) {
              const point = build.localToWorld(new Vector3(...rail.a));
              expect(point.z - rail.radius).toBeGreaterThan(rider.z);
            }
          }
        }
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('places the school, lockers and fence across the stairs beyond the far rail, the fence mesh drawn per pixel', () => {
    const props = new Bake(), mesh = new Bake();
    const rails: Array<{ a: Vec3; b: Vec3; radius: number }> = [];
    buildElToroBuilding(props, mesh, rails);
    const geometry = props.geometry(), panels = mesh.geometry();
    try {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.z).toBeGreaterThan(WALL_Z);
      // One uninterrupted panel of diamond mesh, each corner carrying its (along, up) distances; posts and rails cast shadows.
      expect(panels.getAttribute('position').count).toBe(6);
      expect(Array.from(panels.getAttribute('aCorner').array).some((v) => v > 0)).toBe(true);
      expect(rails.length).toBeGreaterThan(0);
      for (const { a, b } of rails) expect(Math.min(a[2], b[2])).toBeGreaterThan(WALL_Z);
    } finally {
      geometry.dispose();
      panels.dispose();
    }
  });

  it('keeps the right-side open canopy on the upper landing, clear of every stair and the rider lane', () => {
    const props = new Bake();
    buildElToroCanopy(props);
    const geometry = props.geometry();
    try {
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox!;
      expect(max.x).toBeCloseTo(EL_TORO_CANOPY.u1 + 30.2, 4);
      expect(max.z).toBeLessThan(HILL_EDGE);
      expect(min.y).toBe(0);
      expect(max.y).toBeGreaterThan(300);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  it('has one canopy underside and closed perimeter corners without duplicate faces', () => {
    const props = new Bake();
    buildElToroCanopy(props);
    const geometry = props.geometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const C = EL_TORO_CANOPY;
    try {
      const mesh = new Mesh(geometry, material);
      // Look upward between the rafters: one underside, belonging to the slab.
      const underside = new Raycaster(new Vector3(C.u0 + 214.37, C.roofBottom - 2, C.z0 + 286.71), new Vector3(0, 1, 0), 0, 3).intersectObject(mesh);
      expect(underside).toHaveLength(1);
      expect(underside[0].point.y).toBe(C.roofBottom);

      // A ray through each outer corner crosses the two real frame sections:
      // metal top/bottom, then wood top/bottom, each exactly once.
      for (const [u, ux] of [[C.u0, -1], [C.u1, 1]]) {
        for (const [z, zz] of [[C.z0, -1], [C.z1, 1]]) {
          const hits = new Raycaster(new Vector3(u + ux * 1.37, 380, z + zz * 2.11), new Vector3(0, -1, 0), 0, 40).intersectObject(mesh);
          expect(hits).toHaveLength(4);
          [375.6, 371, 370, 344].forEach((y, index) => expect(hits[index].point.y).toBeCloseTo(y, 4));
        }
      }

      // Looking along either perimeter side must encounter only its exterior
      // ends, with no buried caps left at the joins between adjacent sides.
      for (const [uRayY, zRayY, half] of [[363.3, 352.3, 4], [373.3, 373.3, 4.3]]) {
        for (const z of [C.z0 - 1.71, C.z1 + 1.71]) {
          const hits = new Raycaster(new Vector3(C.u0 - 10, uRayY, z), new Vector3(1, 0, 0), 0, C.u1 - C.u0 + 20).intersectObject(mesh);
          expect(hits).toHaveLength(2);
          expect(hits[0].point.x).toBeCloseTo(C.u0 - half, 4);
          expect(hits[1].point.x).toBeCloseTo(C.u1 + half, 4);
        }
        for (const u of [C.u0 - 1.37, C.u1 + 1.37]) {
          const hits = new Raycaster(new Vector3(u, zRayY, C.z0 - 10), new Vector3(0, 0, 1), 0, C.z1 - C.z0 + 20).intersectObject(mesh);
          expect(hits).toHaveLength(2);
          expect(hits[0].point.z).toBeCloseTo(C.z0 - half, 4);
          expect(hits[1].point.z).toBeCloseTo(C.z1 + half, 4);
        }
      }
    } finally {
      material.dispose();
      geometry.dispose();
    }
  });

  it('stands the trees and their shade off the stairs, the landings the rider uses and the filmers', () => {
    const trees = elToroTrees();
    expect(trees.length).toBeGreaterThan(0);
    const stairs = { u0: -RAIL_EXT - 15 * SET_FOOT, u1: STAIR_RUN + 60 * SET_FOOT, z0: HILL_EDGE, z1: WALL_Z + WALL_THICK };
    for (const { at, height } of trees) {
      const [u, , z] = at;
      // Not on the stairs, the run-up or the roll-away.
      expect(u > stairs.u0 && u < stairs.u1 && z > stairs.z0 && z < stairs.z1).toBe(false);
      expect(height).toBeGreaterThan(10 * SET_FOOT);
      for (const stand of Object.values(EL_TORO_FILMERS.stairs!.stands)) {
        expect(Math.hypot(u - stand.u, z - stand.z)).toBeGreaterThan(5 * SET_FOOT);
      }
    }
    // No crown hangs into the rider's line down the stairs: every one clears it by more than its radius.
    for (const { center, radius } of crownSpheres(trees)) {
      const along = Math.min(STAIR_RUN + 40 * SET_FOOT, Math.max(-20 * SET_FOOT, center[0]));
      const across = Math.abs(center[2] - RIDER_LANE_Z);
      const above = center[1] - Math.max(-STAIR_DROP, Math.min(0, -along * RISER / TREAD));
      expect(Math.hypot(Math.max(0, Math.abs(center[0] - along)), across, Math.max(0, above - 10 * SET_FOOT))).toBeGreaterThan(radius);
    }
    // The dappling crowns are among the trees' own, within budget.
    const canopies = elToroCanopies(trees);
    expect(canopies.length).toBeGreaterThan(0);
    expect(canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
    const crowns = crownSpheres(trees);
    for (const c of canopies) expect(crowns.some(({ center, radius }) => center.every((v, i) => v === c.at[i]) && radius === c.radius)).toBe(true);
  });

  it('starts its look from Carlsbad’s midday, with board marks on its own run-up and landing', () => {
    expect(EL_TORO_LOOK).toMatchObject({ light: 'shader', propShadows: true, soffit: 0.6, penumbra: 0.03 });
    expect(EL_TORO_LOOK.marks!.length).toBeGreaterThan(0);
    // The run-up marks sit on the rider's line, before the lip.
    const runUp = EL_TORO_LOOK.marks![0];
    expect(runUp.x[1]).toBeLessThanOrEqual(0);
    expect(runUp.z[0] * SET_FOOT).toBeLessThan(RIDER_LANE_Z);
    expect(runUp.z[1] * SET_FOOT).toBeGreaterThan(RIDER_LANE_Z);
  });

  it('releases every owned geometry and material once, including the overlay', () => {
    const { set, shadow } = scene();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    for (const root of [set.group, set.overlay]) {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
    }
    const disposalCounts = new Map<BufferGeometry | Material, number>();
    for (const resource of [...geometries, ...materials]) {
      disposalCounts.set(resource, 0);
      resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource)! + 1));
    }
    let shadowDisposals = 0;
    shadow.addEventListener('dispose', () => shadowDisposals++);
    set.dispose();
    expect(geometries.size).toBeGreaterThanOrEqual(5);
    expect(materials.size).toBeGreaterThanOrEqual(4);
    expect([...disposalCounts.values()].every((count) => count === 1)).toBe(true);
    // The rider's shadow texture belongs to the renderer, not this spot.
    expect(shadowDisposals).toBe(0);
    shadow.dispose();
  });
});
