import { describe, expect, it } from 'vitest';
import { BufferGeometry, Material, Mesh, ShaderMaterial } from 'three';
import { HANGER_BOTTOM, WHEEL_R } from '../scene/board';
import { resolveSkateStyle } from '../skateStyle';
import type { Robot } from '../types';
import { Board3D } from './board3d';
import { RealisticBoard3D } from './realisticBoard3d';
import { planStage, stageFrame } from './stage';
import { stageView } from './view';

const look = { graphic: '#59696f', stripe: '#c5d4d0' };
const robot: Robot = { id: 'board-check', name: 'Rider', avatar: { body: '#eeeeea', accent: '#61d0e0', variant: 0 } };

describe('Humanoid realistic skateboard', () => {
  it('retains the original deck contact surface, hanger clearance, and wheel radius', () => {
    const classic = new Board3D(look);
    const realistic = new RealisticBoard3D();
    try {
      const oldDeck = (classic.group.children[0] as Mesh).geometry;
      const newBody = (realistic.group.children[0] as Mesh).geometry;
      const original = oldDeck.getAttribute('position').array;
      const upgraded = newBody.getAttribute('position').array;
      // The deck is merged first, preserving every source position exactly.
      expect(Array.from(upgraded.slice(0, original.length))).toEqual(Array.from(original));
      newBody.computeBoundingBox();
      expect(newBody.boundingBox!.min.y).toBeCloseTo(-HANGER_BOTTOM, 5);
      const oldWheels = classic.group.children.filter((child): child is Mesh<BufferGeometry, ShaderMaterial> =>
        child instanceof Mesh && Boolean((child.material as ShaderMaterial).uniforms.uAngle));
      const newWheels = realistic.group.children.slice(1) as Mesh[];
      expect(newWheels.map((wheel) => wheel.position.toArray())).toEqual(oldWheels.map((wheel) => wheel.position.toArray()));
      expect(newWheels).toHaveLength(4);
      const wheel = newWheels[0].geometry.getAttribute('position');
      let radius = 0;
      for (let i = 0; i < wheel.count; i++) radius = Math.max(radius, Math.hypot(wheel.getX(i), wheel.getY(i)));
      expect(radius).toBeCloseTo(WHEEL_R, 5);
    } finally {
      classic.dispose();
      realistic.dispose();
    }
  });

  it('follows the same flips, rotations and signed wheel roll in every stance', () => {
    const classic = new Board3D(look);
    const realistic = new RealisticBoard3D();
    const view = stageView(0);
    try {
      for (const base of ['Kickflip', '360 Flip', 'Frontside 50-50 Grind']) {
        for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
          const plan = planStage(robot, { id: base, name: base, base, stance }, {
            landed: true, riderStance: 'goofy', style: resolveSkateStyle(), fall: 'slam', shankProgress: 0.65, skater: 'humanoid', set: 'el-toro',
          });
          for (const fraction of [0, 0.22, 0.49, 0.71, 0.9, 1]) {
            const frame = stageFrame(plan, plan.end * fraction, 1);
            classic.update(frame.rig.board, frame.wheels, view);
            realistic.update(frame.rig.board, frame.wheels, view);
            expect(realistic.group.matrix.elements).toEqual(classic.group.matrix.elements);
            for (const wheel of realistic.group.children.slice(1) as Mesh<BufferGeometry, ShaderMaterial>[]) {
              expect(wheel.material.uniforms.uAngle.value).toBe(frame.wheels.angle);
              expect(wheel.material.uniforms.uSweep.value).toBe(frame.wheels.sweep);
            }
          }
        }
      }
    } finally {
      classic.dispose();
      realistic.dispose();
    }
  });

  it('uses bounded finite geometry and releases shared resources exactly once', () => {
    const board = new RealisticBoard3D();
    const resources = new Set<BufferGeometry | Material>();
    let triangles = 0;
    let draws = 0;
    board.group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      draws++;
      const geometry = object.geometry;
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      resources.add(geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
      for (const name of ['position', 'normal', 'aSurface', 'aLayer']) expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      expect((object.material as ShaderMaterial).uniforms.uInfo.value.z).toBe(0);
    });
    expect(draws).toBe(5);
    expect(triangles).toBeLessThan(20_000);
    const disposals = new Map<object, number>();
    for (const resource of resources) {
      disposals.set(resource, 0);
      resource.addEventListener('dispose', () => { disposals.set(resource, disposals.get(resource)! + 1); });
    }
    board.dispose();
    board.dispose();
    expect([...disposals.values()].every((count) => count === 1)).toBe(true);
  });
});
