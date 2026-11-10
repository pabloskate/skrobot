import { describe, expect, it } from 'vitest';
import { Mesh, type BufferAttribute, type Object3D, type ShaderMaterial, type Vector2, type Vector4 } from 'three';
import { Board3D } from '../../board/board3d';
import { stageView } from '../../camera/view';
import { DEFAULT_SKATE_STYLE } from '../../motion/style';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import { IRIS } from './windupMaterials';
import { bellowsGeometry, LENS } from './windupParts';
import { WINDUP_BOARD, WindUp3D } from './windup3d';

const trick = (base: string) => ({ id: base, name: base, base, stance: 'regular' as const });
const stage = (base: string, landed = true, riderStance: 'regular' | 'goofy' = 'regular') =>
  planStage(trick(base), { riderStance, landed, style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, skater: 'windup' });

function pose(rider: WindUp3D, frame: StageFrame) {
  rider.update(frame.rig, frame.expression, stageView(frame.lift), frame);
}

function materials(root: Object3D): ShaderMaterial[] {
  const found = new Set<ShaderMaterial>();
  root.traverse((o) => {
    if (o instanceof Mesh) found.add(o.material as ShaderMaterial);
  });
  return [...found];
}

/** Everything a pose writes: each part's matrix, each material's uniforms, each limb's rewritten vertices. */
function picture(rider: WindUp3D): number[] {
  const out: number[] = [];
  rider.group.traverse((o) => {
    out.push(...o.matrix.elements);
    if (!(o instanceof Mesh)) return;
    if (o.matrixAutoUpdate) out.push(...(o.geometry.getAttribute('position') as BufferAttribute).array);
    for (const uniform of Object.values((o.material as ShaderMaterial).uniforms)) {
      const value = uniform.value as number | { toArray(): number[] };
      out.push(...(typeof value === 'number' ? [value] : value.toArray()));
    }
  });
  return out;
}

const inkId = (info: Vector4) => Math.round(info.x * 255);

describe('Wind-Up', () => {
  it('poses every part, from the roll in to a slam, regular and goofy', () => {
    const rider = new WindUp3D();
    for (const plan of [stage('Ollie'), stage('Kickflip', false), stage('Boardslide', true, 'goofy')]) {
      for (let i = 0; i <= 24; i++) {
        pose(rider, stageFrame(plan, (plan.end * i) / 24, 1));
        expect(picture(rider).every(Number.isFinite)).toBe(true);
      }
    }
    rider.dispose();
  });

  it('gives every part an outline and a place in the paint order, on ids the board does not use', () => {
    const rider = new WindUp3D();
    const plan = stage('Ollie');
    pose(rider, stageFrame(plan, plan.end / 2, 1));
    const board = new Board3D(WINDUP_BOARD);
    const boardIds = new Set(materials(board.group).flatMap((m) =>
      Object.entries(m.uniforms).filter(([name]) => name.startsWith('uInfo')).map(([, uniform]) => inkId(uniform.value as Vector4))));
    expect(boardIds.size).toBeGreaterThan(0);
    const ids = new Set<number>();
    for (const m of materials(rider.group)) {
      const info = m.uniforms.uInfo.value as Vector4;
      expect(inkId(info)).toBeGreaterThan(0);
      expect(info.y).toBeGreaterThan(0);
      expect(info.z).toBeGreaterThan(0);
      expect(boardIds.has(inkId(info))).toBe(false);
      ids.add(inkId(info));
    }
    // Two arms, shoulders, hands, legs, knees and shoes; the chest, the pelvis, the head with its neck, the eye, the ears, the key.
    expect(ids.size).toBe(18);
    rider.dispose();
    board.dispose();
  });

  it('shows the same picture for a frame however the clip got there', () => {
    const rider = new WindUp3D();
    const plan = stage('Kickflip');
    const at = (share: number) => stageFrame(plan, plan.end * share, 1);
    pose(rider, at(0.3));
    const first = picture(rider);
    pose(rider, at(0.8));
    expect(picture(rider)).not.toEqual(first);
    pose(rider, at(0.3));
    expect(picture(rider)).toEqual(first);
    rider.dispose();
  });

  it('keeps the iris behind the glass wherever the rider looks', () => {
    expect(IRIS.reach + IRIS.r).toBeLessThanOrEqual(LENS.r);
    const rider = new WindUp3D();
    const plan = stage('Ollie');
    const frame = stageFrame(plan, plan.end / 2, 1);
    const eye = materials(rider.group).find((m) => m.uniforms.uLook)!;
    const look = eye.uniforms.uLook.value as Vector2;
    const { head } = frame.rig;
    let farthest = 0;
    for (const f of [-300, 0, 300]) {
      for (const u of [-300, 0, 300]) {
        for (const s of [-300, 0, 300]) {
          pose(rider, { ...frame, gaze: head.at(f, u, s) });
          expect(look.length()).toBeLessThanOrEqual(IRIS.reach + 1e-9);
          farthest = Math.max(farthest, look.length());
        }
      }
    }
    // It does look: well off the middle for something beside it, and dead ahead for something dead ahead.
    expect(farthest).toBeGreaterThan(IRIS.reach * 0.7);
    pose(rider, { ...frame, gaze: head.at(400, 0, 0) });
    expect(look.length()).toBeLessThan(1e-6);
    pose(rider, { ...frame, gaze: head.at(300, 0, 300) });
    expect(look.x).toBeGreaterThan(0);
    expect(Math.abs(look.y)).toBeLessThan(1e-6);
    rider.dispose();
  });

  it('ends a sleeve on a valley, the narrowest it gets, at both ends', () => {
    const [pleats, ra, rb, depth] = [3, 4, 3.6, 1.2];
    const position = bellowsGeometry(pleats, ra, rb, depth).getAttribute('position');
    const radius = (i: number) => Math.hypot(position.getY(i), position.getZ(i));
    let widest = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      if (x === 0) expect(radius(i)).toBeCloseTo(ra - depth / 2, 6);
      if (x === 1) expect(radius(i)).toBeCloseTo(rb - depth / 2, 6);
      widest = Math.max(widest, radius(i));
    }
    // Its crests stand a fold's depth over its valleys, and no further than the wider end's.
    expect(widest).toBeGreaterThan(rb + depth / 2 - 1e-6);
    expect(widest).toBeLessThanOrEqual(ra + depth / 2 + 1e-6);
  });
});
