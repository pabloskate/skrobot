import { describe, expect, it } from 'vitest';
import { BufferGeometry, InstancedMesh, Material, Matrix4, Mesh, Vector3 } from 'three';
import type { FallVariant } from '../../motion/trick';
import { resolveSkateStyle } from '../../motion/style';
import type { RiderStance, Stance } from '../../types';
import { Humanoid3D } from './humanoid3d';
import { humanoidHeadGeometry } from './humanoidGeometry';
import { HUMANOID_SURFACE } from './humanoidMaterials';
import { FlexibleNeck3D } from './flexibleNeck3d';
import { shiftFrame } from '../../motion/skeleton';
import { planStage, stageFrame } from '../../stage/stage';
import { stageView, toThree } from '../../camera/view';

const plan = (stance: Stance = 'regular', riderStance: RiderStance = 'regular', fall?: FallVariant) => planStage({
  id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance,
}, {
  riderStance, landed: fall == null, style: resolveSkateStyle(), fall: fall ?? 'slam', shankProgress: 0.65, skater: 'humanoid', set: 'plaza',
});

describe('Humanoid renderer', () => {
  it('keeps the flexible neck attached and its bend bounded through head and fall poses', () => {
    const neck = new FlexibleNeck3D();
    try {
      const positions = neck.geometry.getAttribute('position');
      let ringSize = 0;
      while (ringSize < positions.count && positions.getY(ringSize) === 0) ringSize++;
      const rings = positions.count / ringSize;
      for (const riderStance of ['regular', 'goofy'] as const) {
        for (const fall of [undefined, 'slam'] as const) {
          const stage = plan('regular', riderStance, fall);
          for (const fraction of [0, 0.3, 0.6, 1]) {
            const frame = stageFrame(stage, stage.end * fraction, 1);
            const head = shiftFrame(frame.rig.head, 0, -8.5, 0);
            neck.update(frame.rig.torso, head);
            const start = new Vector3(...toThree(frame.rig.torso.at(-0.8, 23, 0)));
            const end = new Vector3(...toThree(head.at(-1.8, -16.5, 0)));
            for (let row = 0; row < rings; row++) {
              const center = new Vector3();
              for (let col = 0; col < ringSize; col++) {
                center.add(new Vector3().fromBufferAttribute(positions, row * ringSize + col));
              }
              center.divideScalar(ringSize);
              const straight = start.clone().lerp(end, row / (rings - 1));
              expect(center.distanceTo(straight)).toBeLessThan(start.distanceTo(end) * 0.3);
              if (row === 0) expect(center.distanceTo(start)).toBeLessThan(0.0001);
              if (row === rings - 1) expect(center.distanceTo(end)).toBeLessThan(0.0001);
            }
            for (const attribute of ['position', 'normal']) {
              expect(Array.from(neck.geometry.getAttribute(attribute).array).every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    } finally {
      neck.geometry.dispose();
    }
  });

  it('keeps the continuous black head closed and its wraparound normals smooth', () => {
    const head = humanoidHeadGeometry();
    try {
      const positions = head.getAttribute('position');
      const normals = head.getAttribute('normal');
      const surfaces = head.getAttribute('aSurface');
      const edges = new Map<string, number[][]>();
      const vertexKey = (at: number) => [positions.getX(at), positions.getY(at), positions.getZ(at)]
        .map((coordinate) => Math.round(coordinate * 100_000)).join(',');
      for (let at = 0; at < positions.count; at += 3) {
        const surface = surfaces.getX(at);
        if (surface !== HUMANOID_SURFACE.glass) continue;
        const vertices = [at, at + 1, at + 2];
        if (new Set(vertices.map(vertexKey)).size < 3) continue;
        for (let side = 0; side < 3; side++) {
          const pair = [vertices[side], vertices[(side + 1) % 3]]
            .sort((a, b) => vertexKey(a).localeCompare(vertexKey(b)));
          const key = pair.map(vertexKey).join('/');
          const neighbors = edges.get(key) ?? [];
          neighbors.push(pair.flatMap((i) => [normals.getX(i), normals.getY(i), normals.getZ(i)]));
          edges.set(key, neighbors);
        }
      }
      let normalError = 0;
      for (const neighbors of edges.values()) {
        expect(neighbors).toHaveLength(2);
        normalError = Math.max(normalError, ...neighbors[0].map((normal, i) => Math.abs(normal - neighbors[1][i])));
      }
      expect(edges.size).toBeGreaterThan(1000);
      expect(normalError).toBeLessThan(0.0001);
    } finally {
      head.dispose();
    }
  });

  it('keeps detailed assemblies finite and within mobile draw and triangle budgets', () => {
    const rider = new Humanoid3D();
    try {
      let draws = 0;
      let triangles = 0;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      rider.group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        draws++;
        const count = object.geometry.index?.count ?? object.geometry.getAttribute('position').count;
        triangles += count / 3 * (object instanceof InstancedMesh ? object.count : 1);
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      expect(draws).toBeLessThan(70);
      expect(triangles).toBeLessThan(60_000);
      expect(materials.size).toBe(1);
      for (const geometry of geometries) {
        const position = geometry.getAttribute('position');
        expect(position.count).toBeGreaterThan(0);
        expect((geometry.index?.count ?? position.count) % 3).toBe(0);
        for (const name of ['position', 'normal', 'aSurface']) {
          const attribute = geometry.getAttribute(name);
          expect(attribute.count).toBe(position.count);
          expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
        }
      }
    } finally {
      rider.dispose();
    }
  });

  it('follows grounded feet and keeps rigid and finger transforms valid through stance and fall changes', () => {
    const rider = new Humanoid3D();
    const view = stageView(0);
    const instance = new Matrix4();
    try {
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
        for (const riderStance of ['regular', 'goofy'] as const) {
          for (const fall of [undefined, 'slam', 'bail', 'shank'] as const) {
            const stage = plan(stance, riderStance, fall);
            for (const fraction of [0.03, 0.25, 0.55, 0.8, 1]) {
              const frame = stageFrame(stage, stage.end * fraction, 1);
              rider.update(frame.rig, frame.expression, view);
              rider.group.updateMatrixWorld(true);
              rider.group.traverse((object) => {
                expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
                expect(Math.abs(object.matrixWorld.determinant())).toBeGreaterThan(1e-6);
                if (object instanceof InstancedMesh) {
                  for (let i = 0; i < object.count; i++) {
                    object.getMatrixAt(i, instance);
                    expect(instance.elements.every(Number.isFinite)).toBe(true);
                    expect(Math.abs(instance.determinant())).toBeGreaterThan(0.01);
                  }
                }
              });
              for (const leg of frame.rig.legs) {
                const foot = rider.group.getObjectByName(`humanoid-${leg.side}-foot`)!;
                const at = new Vector3().setFromMatrixPosition(foot.matrixWorld);
                const expected = new Vector3(...toThree(leg.shoe.origin));
                expect(at.distanceTo(expected)).toBeLessThan(1e-6);
              }
            }
          }
        }
      }
    } finally {
      rider.dispose();
    }
  });

  it('opens and braces mechanical fingers above the floor during a slam', () => {
    const rider = new Humanoid3D();
    const view = stageView(0);
    const local = new Matrix4();
    const world = new Matrix4();
    const p = new Vector3();
    try {
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
        for (const riderStance of ['regular', 'goofy'] as const) {
          const stage = plan(stance, riderStance, 'slam');
          for (const fraction of [0.75, 0.85, 0.95, 1]) {
            const frame = stageFrame(stage, stage.end * fraction, 1);
            rider.update(frame.rig, frame.expression, view);
            rider.group.updateMatrixWorld(true);
            for (const side of ['left', 'right']) {
              const hand = rider.group.getObjectByName(`humanoid-${side}-hand`)!;
              let lowest = Infinity;
              hand.traverse((mesh) => {
                if (!(mesh instanceof Mesh)) return;
                const positions = mesh.geometry.getAttribute('position');
                const instances = mesh instanceof InstancedMesh ? mesh.count : 1;
                for (let i = 0; i < instances; i++) {
                  if (mesh instanceof InstancedMesh) { mesh.getMatrixAt(i, local); world.multiplyMatrices(mesh.matrixWorld, local); }
                  else world.copy(mesh.matrixWorld);
                  for (let vertex = 0; vertex < positions.count; vertex++) {
                    p.fromBufferAttribute(positions, vertex).applyMatrix4(world);
                    lowest = Math.min(lowest, p.y);
                  }
                }
              });
              expect(lowest, `${stance}/${riderStance} ${side} hand at ${fraction}`).toBeGreaterThanOrEqual(-0.05);
            }
          }
        }
      }
    } finally {
      rider.dispose();
    }
  });

  it('disposes each shared geometry, material and instance buffer owner once', () => {
    const rider = new Humanoid3D();
    const resources = new Set<BufferGeometry | Material | InstancedMesh>();
    rider.group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
      if (object instanceof InstancedMesh) resources.add(object);
    });
    const calls = new Map<object, number>();
    for (const resource of resources) {
      calls.set(resource, 0);
      const disposed = () => { calls.set(resource, calls.get(resource)! + 1); };
      if (resource instanceof InstancedMesh) resource.addEventListener('dispose', disposed);
      else resource.addEventListener('dispose', disposed);
    }
    rider.dispose();
    rider.dispose();
    expect([...calls.values()].every((count) => count === 1)).toBe(true);
  });
});
