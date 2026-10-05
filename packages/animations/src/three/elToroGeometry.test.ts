import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Material, Mesh, ShaderMaterial, Texture, Vector3, type Vector4 } from 'three';
import { resolveSkateStyle } from '../skateStyle';
import { SKATERS, type Skater } from '../skaters';
import type { RiderStance, Robot, Stance } from '../types';
import { ElToro3D } from './elToro3d';
import { planStage, stageFrame } from './stage';
import { stageView, toThree } from './view';
import { CENTER_Z, FAR_RAIL_Z, HILL_EDGE, HILL_RAIL_Z, RIDER_LANE_Z, WALL_Z } from './elToroLayout';
import { FOOT, RISER, STAIR_DROP, STAIR_RUN, STAIR_STEPS, TREAD } from '../scene/stairs';
import { buildElToroBuilding } from './elToroBuilding';
import { Bake } from './bake';
import { buildElToroCanopy } from './elToroCanopy';

const robot: Robot = {
  id: 'el-toro-geometry',
  name: 'Geometry rider',
  avatar: { body: '#7ec8e3', accent: '#e05c7a', variant: 0 },
};

function scene() {
  const set = new ElToro3D();
  const shadow = new Texture();
  const view = stageView(0);
  const update = (stance: Stance, skater: Skater = 'robot', riderStance: RiderStance = 'regular') => {
    const plan = planStage(robot, { id: 'ollie', name: 'Ollie', base: 'Ollie', stance }, {
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

const meshes = (group: Group): Mesh<BufferGeometry, ShaderMaterial>[] =>
  group.children.filter((child): child is Mesh<BufferGeometry, ShaderMaterial> => child instanceof Mesh);

describe('El Toro environment geometry', () => {
  it('keeps the detailed scene within the mobile geometry and draw budgets', () => {
    const { set, shadow, builds } = scene();
    try {
      expect(builds).toHaveLength(1);
      for (const build of builds) {
        const parts = meshes(build);
        // Detail is merged into the existing ground and prop draws.
        expect(parts).toHaveLength(2);
        let vertices = 0;
        for (const { geometry } of parts) {
          const position = geometry.getAttribute('position');
          const normal = geometry.getAttribute('normal');
          expect(position.count).toBeGreaterThan(0);
          expect(position.count % 3).toBe(0);
          expect(normal.count).toBe(position.count);
          expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
          expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
          vertices += position.count;
        }
        // The separate canopy and planting add masonry piers and roof beams.
        expect(vertices).toBeLessThan(140_000);
        const props = parts.find(({ geometry }) => geometry.hasAttribute('aCorner'))!;
        expect(props).toBeDefined();
        // Camera-facing discs must not return as a foliage shortcut: foliage
        // and architecture need to keep their shape in every orbit angle.
        expect(Array.from(props.geometry.getAttribute('aCorner').array).every((value) => value === 0)).toBe(true);

        const ground = parts.find(({ geometry }) => geometry.hasAttribute('aKind'))!;
        expect(ground).toBeDefined();
        const uniforms = ground.material.uniforms;
        for (const [countName, arrayNames] of [
          ['uRails', ['uRailA', 'uRailB']],
          ['uCanopies', ['uCanopy']],
        ] as const) {
          const count = uniforms[countName].value as number;
          expect(Number.isInteger(count)).toBe(true);
          expect(count).toBeGreaterThan(0);
          for (const name of arrayNames) {
            const entries = uniforms[name].value as Vector4[];
            expect(count).toBeLessThanOrEqual(entries.length);
            expect(entries.flatMap((entry) => entry.toArray()).every(Number.isFinite)).toBe(true);
            // A zero radius would produce invalid shadow math on live entries.
            if (name !== 'uRailB') expect(entries.slice(0, count).every((entry) => entry.w > 0)).toBe(true);
          }
        }
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('keeps exactly the same scene and position when the rider changes stance', () => {
    const { set, shadow, builds, update } = scene();
    try {
      const parts = meshes(builds[0]);
      const position = builds[0].position.clone();
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as Stance[]) {
        update(stance);
        expect(set.group.children.filter((child) => child instanceof Group)).toEqual(builds);
        expect(meshes(builds[0])).toEqual(parts);
        expect(builds[0].position.equals(position)).toBe(true);
        expect(builds[0].visible).toBe(true);
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('has one center rail and straight sloping bars without horizontal end kick-outs', () => {
    const { set, shadow, builds } = scene();
    try {
      const ground = meshes(builds[0]).find(({ geometry }) => geometry.hasAttribute('aKind'))!;
      const { uRailA, uRailB, uRails } = ground.material.uniforms;
      const a = uRailA.value as Vector4[];
      const b = uRailB.value as Vector4[];
      const lanes = new Set<number>();
      for (let i = 0; i < uRails.value; i++) {
        expect(a[i].z).toBe(b[i].z);
        lanes.add(a[i].z);
        if (Math.abs(a[i].x - b[i].x) > 0.01) {
          expect((b[i].y - a[i].y) / (b[i].x - a[i].x)).toBeCloseTo(-RISER / TREAD, 8);
        }
      }
      expect([...lanes].sort((a, b) => a - b)).toEqual([HILL_RAIL_Z, CENTER_Z, FAR_RAIL_Z]);
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('centers the rail on the actual steps while preserving their twenty risers, height and run', () => {
    const { set, shadow, builds } = scene();
    try {
      const ground = meshes(builds[0]).find(({ geometry }) => geometry.hasAttribute('aKind'))!;
      const position = ground.geometry.getAttribute('position');
      const kind = ground.geometry.getAttribute('aKind');
      const risers = new Map<number, Vector3[]>();
      const steps: Vector3[] = [];
      for (let i = 0; i < position.count; i++) {
        // The surface attributes identify treads and risers independently
        // of props, landings, side walls and their much larger bounds.
        if (kind.getX(i) !== 1 && kind.getX(i) !== 2) continue;
        const point = new Vector3().fromBufferAttribute(position, i);
        steps.push(point);
        if (kind.getX(i) !== 2) continue;
        const face = risers.get(point.x) ?? [];
        face.push(point);
        risers.set(point.x, face);
      }
      expect(risers.size).toBe(STAIR_STEPS);
      expect(STAIR_STEPS).toBe(20);
      expect(Math.min(...steps.map(({ x }) => x))).toBe(0);
      expect(Math.max(...steps.map(({ x }) => x))).toBeCloseTo(STAIR_RUN, 5);
      expect(STAIR_RUN / FOOT).toBe(20);
      expect(Math.max(...steps.map(({ y }) => y))).toBeCloseTo(0, 5);
      expect(Math.min(...steps.map(({ y }) => y))).toBeCloseTo(-STAIR_DROP, 5);
      expect(STAIR_DROP / FOOT).toBe(9);
      for (const face of risers.values()) {
        const minZ = Math.min(...face.map(({ z }) => z));
        const maxZ = Math.max(...face.map(({ z }) => z));
        expect(maxZ - minZ).toBe(24 * FOOT);
        expect((minZ + maxZ) / 2).toBe(CENTER_Z);
        expect(CENTER_Z - minZ).toBe(12 * FOOT);
        expect(maxZ - CENTER_Z).toBe(12 * FOOT);
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('rides the left flight when looking upstairs for every avatar and stance', () => {
    const { set, shadow, builds, update } = scene();
    try {
      const build = builds[0];
      const ground = meshes(build).find(({ geometry }) => geometry.hasAttribute('aKind'))!;
      const railStarts = (ground.material.uniforms.uRailA.value as Vector4[])
        .slice(0, ground.material.uniforms.uRails.value);
      const centerRail = railStarts.filter(({ z }) => z === CENTER_Z);
      const farRail = railStarts.filter(({ z }) => z === FAR_RAIL_Z);
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
            expect(localRider.z).toBe(RIDER_LANE_Z);
            expect(localRider.z).toBe((CENTER_Z + WALL_Z) / 2);
            expect(localRider.z).toBeGreaterThan(CENTER_Z);
            expect(localRider.z).toBeLessThan(WALL_Z);

            // Check the actual scene transform and rail endpoints, not only
            // the layout constants. Positive z is left when looking upstairs.
            for (const rail of centerRail) {
              const point = build.localToWorld(new Vector3(rail.x, rail.y, rail.z));
              expect(point.z).toBeLessThan(rider.z);
              expect(rider.z - point.z).toBeGreaterThanOrEqual(6 * FOOT);
              expect(point.z + rail.w).toBeLessThan(rider.z);
            }
            for (const rail of farRail) {
              const point = build.localToWorld(new Vector3(rail.x, rail.y, rail.z));
              expect(point.z - rail.w).toBeGreaterThan(rider.z);
            }
          }
        }
      }
    } finally {
      set.dispose();
      shadow.dispose();
    }
  });

  it('places the school, lockers and fence across the stairs beyond the far rail', () => {
    const props = new Bake();
    buildElToroBuilding(props, 1);
    const geometry = props.geometry();
    try {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.z).toBeGreaterThan(WALL_Z);
    } finally {
      geometry.dispose();
    }
  });

  it('keeps the right-side open canopy on the upper landing, clear of every stair and the rider lane', () => {
    const props = new Bake();
    buildElToroCanopy(props, 1);
    const geometry = props.geometry();
    try {
      geometry.computeBoundingBox();
      const { min, max } = geometry.boundingBox!;
      expect(max.x).toBeLessThan(0);
      expect(max.z).toBeLessThan(HILL_EDGE);
      expect(min.y).toBe(0);
      expect(max.y).toBeGreaterThan(300);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  it('releases every owned geometry and material once, including the cached scene', () => {
    const { set, shadow } = scene();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    set.group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    const disposalCounts = new Map<BufferGeometry | Material, number>();
    for (const resource of [...geometries, ...materials]) {
      disposalCounts.set(resource, 0);
      resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource)! + 1));
    }
    let shadowDisposals = 0;
    shadow.addEventListener('dispose', () => shadowDisposals++);
    set.dispose();
    expect(geometries.size).toBeGreaterThanOrEqual(3);
    expect(materials.size).toBeGreaterThanOrEqual(3);
    expect([...disposalCounts.values()].every((count) => count === 1)).toBe(true);
    // The rider's shadow texture belongs to the renderer, not this spot.
    expect(shadowDisposals).toBe(0);
    shadow.dispose();
  });
});
