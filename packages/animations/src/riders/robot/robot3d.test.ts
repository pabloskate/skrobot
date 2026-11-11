import { describe, expect, it } from 'vitest';
import { Mesh, type BufferAttribute, type BufferGeometry, type Object3D, type ShaderMaterial, type Vector4 } from 'three';
import { Board3D } from '../../board/board3d';
import { stageView, toThree } from '../../camera/view';
import { ARM_RADII, HAND_RADIUS, LEG_RADII } from '../../motion/skeleton';
import { DEFAULT_SKATE_STYLE } from '../../motion/style';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import { rgb } from '../../three/materials';
import type { RobotLook } from '../look';
import { WINDUP_BOARD } from '../windup/windup3d';
import { Robot3D } from './robot3d';
import { BACK_HATCH, EYE_LIFT, EYES, eyeGlow, HEAD_VENTS, SCREEN, SHOE_LACES } from './robotMaterials';
import { ballGeometry, KNEE_R, mittGeometry, SHOULDER_R } from './robotParts';

const LOOK: RobotLook = { body: '#7ec8e3', accent: '#e05c7a', variant: 0 };

type Stance = 'regular' | 'fakie';
const stage = (base: string, { landed = true, stance = 'regular' as Stance, riderStance = 'regular' as 'regular' | 'goofy' } = {}) =>
  planStage({ id: base, name: base, base, stance }, { riderStance, landed, style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, skater: 'robot' });

function pose(rider: Robot3D, frame: StageFrame) {
  rider.update(frame.rig, frame.expression, stageView(frame.lift));
}

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) found.push(o);
  });
  return found;
}

const material = (mesh: Mesh) => mesh.material as ShaderMaterial;
const materials = (root: Object3D) => [...new Set(meshes(root).map(material))];
const info = (m: ShaderMaterial) => m.uniforms.uInfo.value as Vector4;
const inkId = (m: ShaderMaterial) => Math.round(info(m).x * 255);
const has = (name: string) => (mesh: Mesh) => name in material(mesh).uniforms;
const meshWith = (root: Object3D, test: (mesh: Mesh) => boolean) => meshes(root).find(test)!;
const isChest = has('uContact');

/** Everything a pose writes: each part's matrix, each material's uniforms, each rewritten vertex. */
function picture(rider: Robot3D): number[] {
  const flat = (value: unknown): number[] =>
    typeof value === 'number' ? [value]
      : Array.isArray(value) ? value.flatMap(flat)
        : value && typeof (value as { toArray?: unknown }).toArray === 'function' ? (value as { toArray(): number[] }).toArray()
          : [];
  const out: number[] = [];
  rider.group.traverse((o) => {
    out.push(...o.matrix.elements);
    if (!(o instanceof Mesh)) return;
    out.push(...(o.geometry.getAttribute('position') as BufferAttribute).array);
    for (const uniform of Object.values(material(o).uniforms)) out.push(...flat(uniform.value));
  });
  return out;
}

/** A geometry's points whose normal points along `axis` by more than `cos`. */
function facing(geometry: BufferGeometry, axis: 'x' | 'y', sign: 1 | -1, cos = 0.7) {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const points: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < pos.count; i++) {
    const n = axis === 'x' ? nor.getX(i) : nor.getY(i);
    if (n * sign > cos) points.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
  }
  return points;
}

const luma = (hex: string) => {
  const [r, g, b] = rgb(hex).map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('the robot', () => {
  it.each([0, 1, 2, 3] as const)('poses variant %i through a landed trick, a slam and a goofy grind', (variant) => {
    const rider = new Robot3D({ ...LOOK, variant });
    for (const plan of [stage('Ollie'), stage('Kickflip', { landed: false }), stage('Boardslide', { riderStance: 'goofy' })]) {
      for (let i = 0; i <= 24; i++) {
        pose(rider, stageFrame(plan, (plan.end * i) / 24, 1));
        expect(picture(rider).every(Number.isFinite)).toBe(true);
      }
    }
    rider.dispose();
  });

  it('shows the same picture for a frame however the clip got there', () => {
    const rider = new Robot3D(LOOK);
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

  it.each([0, 1, 2, 3] as const)('gives every part of variant %i an outline and a place in the paint order, on ids the board does not use', (variant) => {
    const rider = new Robot3D({ ...LOOK, variant });
    const plan = stage('Ollie');
    pose(rider, stageFrame(plan, plan.end / 2, 1));
    const board = new Board3D(WINDUP_BOARD);
    const boardIds = new Set(materials(board.group).flatMap((m) =>
      Object.entries(m.uniforms).filter(([name]) => name.startsWith('uInfo')).map(([, uniform]) => Math.round((uniform.value as Vector4).x * 255))));
    expect(boardIds.size).toBeGreaterThan(0);
    const ids = new Set<number>();
    for (const m of materials(rider.group)) {
      expect(inkId(m)).toBeGreaterThan(0);
      expect(info(m).y).toBeGreaterThan(0);
      expect(info(m).z).toBeGreaterThan(0);
      expect(m.fragmentShader).toContain('outInfo = uInfo;');
      expect(boardIds.has(inkId(m))).toBe(false);
      ids.add(inkId(m));
    }
    // Arms, legs, shoulders, hands, knees and shoes in pairs; the chest, the head and its fittings.
    expect(ids.size).toBe(15);
    rider.dispose();
    board.dispose();
  });

  it('draws the head heaviest, and whatever is fitted to it lighter', () => {
    for (const variant of [0, 1, 2, 3] as const) {
      const rider = new Robot3D({ ...LOOK, variant });
      const face = material(meshWith(rider.group, has('uExpression')));
      const inHead = materials(rider.group).filter((m) => inkId(m) === inkId(face));
      const widths = new Set(inHead.map((m) => info(m).z));
      // The shell and its screen, the neck, and the antenna or crest.
      expect(widths.size).toBe(3);
      expect(info(face).z).toBe(Math.max(...widths));
      expect(Math.max(...materials(rider.group).map((m) => info(m).z))).toBe(info(face).z);
      rider.dispose();
    }
  });

  it('keeps the drawn limbs inside the rig\'s tapered envelopes', () => {
    const rider = new Robot3D(LOOK);
    const limbs = meshes(rider.group).filter((mesh) => mesh.matrixAutoUpdate);
    for (const plan of [stage('Kickflip'), stage('Kickflip', { landed: false }), stage('Boardslide', { riderStance: 'goofy' })]) {
      const frame = stageFrame(plan, plan.end * 0.45, 1);
      pose(rider, frame);
      for (const [i, side] of (['left', 'right'] as const).entries()) {
        const arm = frame.rig.arms.find((a) => a.side === side)!;
        const leg = frame.rig.legs.find((l) => l.side === side)!;
        for (const [id, segments] of [
          [1 + i, [[arm.shoulder, arm.elbow, ARM_RADII.shoulder, ARM_RADII.elbow], [arm.elbow, arm.hand, ARM_RADII.elbow, ARM_RADII.wrist]]],
          [3 + i, [[leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee], [leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle]]],
        ] as const) {
          const drawn = limbs.filter((mesh) => inkId(material(mesh)) === id);
          expect(drawn).toHaveLength(2);
          for (const [j, mesh] of drawn.entries()) {
            const [from, to, ra, rb] = segments[j];
            const a = toThree(from);
            const b = toThree(to);
            const vertices = mesh.geometry.getAttribute('position');
            let worst = -Infinity;
            for (let k = 0; k < vertices.count; k++) {
              const p = [vertices.getX(k), vertices.getY(k), vertices.getZ(k)];
              // How far outside the sweep of the rig's two end balls, at the station along it that's nearest.
              const gap = (t: number) => Math.hypot(...p.map((v, axis) => v - a[axis] - t * (b[axis] - a[axis]))) - (ra + t * (rb - ra));
              let lo = 0;
              let hi = 1;
              for (let n = 0; n < 32; n++) {
                const l = lo + (hi - lo) / 3;
                const h = hi - (hi - lo) / 3;
                if (gap(l) < gap(h)) hi = h;
                else lo = l;
              }
              worst = Math.max(worst, gap((lo + hi) / 2));
            }
            expect(worst).toBeLessThanOrEqual(1e-4);
          }
        }
      }
    }
    rider.dispose();
  });

  it('keeps every fitting inside the ball the rig keeps clear for its joint', () => {
    for (const [geometry, limit] of [
      [mittGeometry(), HAND_RADIUS],
      [ballGeometry(SHOULDER_R), ARM_RADII.shoulder],
      [ballGeometry(KNEE_R), LEG_RADII.knee],
    ] as const) {
      const p = geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        expect(Math.hypot(p.getX(i), p.getY(i), p.getZ(i))).toBeLessThanOrEqual(limit + 1e-6);
      }
      geometry.dispose();
    }
  });

  it('turns the glove about the forearm, so its roll never shows', () => {
    const p = mittGeometry().getAttribute('position');
    // A lathe's every station is a full circle about x: the same number of points at each (station, radius).
    const circles = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(4)} ${Math.hypot(p.getY(i), p.getZ(i)).toFixed(4)}`;
      circles.set(key, (circles.get(key) ?? 0) + 1);
    }
    const counts = new Set(circles.values());
    expect(counts.size).toBe(1);
    expect([...counts][0]).toBeGreaterThan(12);
  });
});

describe('the robot\'s paint', () => {
  it('lies on the surface it is painted on', () => {
    const rider = new Robot3D(LOOK);
    const within = (points: Array<{ y: number; z: number }>, side: number, up: number, halfS: number, halfU: number) => {
      const zs = points.map((p) => p.z);
      const ys = points.map((p) => p.y);
      expect(side - halfS).toBeGreaterThanOrEqual(Math.min(...zs));
      expect(side + halfS).toBeLessThanOrEqual(Math.max(...zs));
      expect(up - halfU).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(up + halfU).toBeLessThanOrEqual(Math.max(...ys));
    };
    const chest = meshWith(rider.group, isChest).geometry;
    within(facing(chest, 'x', -1), BACK_HATCH.side, BACK_HATCH.up, BACK_HATCH.half[0], BACK_HATCH.half[1]);

    const head = meshWith(rider.group, (mesh) => has('uSeamLit')(mesh) && !has('uExpression')(mesh) && !has('uSplit')(mesh) && !isChest(mesh)).geometry;
    const ventsHalfU = ((HEAD_VENTS.count - 1) / 2) * HEAD_VENTS.gap + HEAD_VENTS.half[1];
    within(facing(head, 'x', -1), 0, HEAD_VENTS.up, HEAD_VENTS.half[0], ventsHalfU);

    // The screen and the groove round it are inside the grid they're painted on.
    const grid = meshWith(rider.group, has('uExpression')).geometry.getAttribute('position');
    const reach = (axis: 'getY' | 'getZ') => Array.from({ length: grid.count }, (_, i) => grid[axis](i));
    expect(Math.max(...reach('getZ'))).toBeGreaterThan(SCREEN.center[0] + SCREEN.extent[0]);
    expect(Math.max(...reach('getY'))).toBeGreaterThan(SCREEN.center[1] + SCREEN.extent[1]);
    expect(Math.min(...reach('getY'))).toBeLessThan(SCREEN.center[1] - SCREEN.extent[1]);

    // Every expression's eyes sit on the glass.
    const eyeHalf = {
      open: EYES.open.half,
      focus: EYES.focus.half,
      happy: [EYES.happy.radius + EYES.happy.half, EYES.happy.radius - EYES.happy.drop + EYES.happy.half],
      wince: [2.2 + EYES.wince.half, 2.4 + EYES.wince.half],
    };
    for (const [w, h] of Object.values(eyeHalf)) {
      expect(EYES.side + w).toBeLessThan(SCREEN.center[0] + SCREEN.extent[0] - 2);
      expect(EYES.up + h).toBeLessThan(SCREEN.center[1] + SCREEN.extent[1] - 2);
      expect(EYES.up - h).toBeGreaterThan(SCREEN.center[1] - SCREEN.extent[1] + 2);
    }

    // The laces cross the top of the upper.
    const upper = meshWith(rider.group, (mesh) => has('uSplit')(mesh) && has('uSeamLit')(mesh)).geometry;
    const top = facing(upper, 'y', 1, 0.6);
    for (let i = 0; i < SHOE_LACES.count; i++) {
      const x = SHOE_LACES.from + (i * (SHOE_LACES.to - SHOE_LACES.from)) / Math.max(1, SHOE_LACES.count - 1);
      const row = top.filter((p) => Math.abs(p.x - x) < 1.5);
      expect(row.length).toBeGreaterThan(0);
      expect(Math.max(...row.map((p) => Math.abs(p.z)))).toBeGreaterThanOrEqual(SHOE_LACES.half);
    }
    rider.dispose();
  });

  it('lifts a dark accent until its eyes read on the glass, and leaves a bright one as it is', () => {
    for (const accent of ['#10002b', '#1b4332', '#2b2d42', '#3a2e4d', '#023e8a']) {
      expect(luma(accent)).toBeLessThan(EYE_LIFT.below);
      expect(luma(eyeGlow(accent))).toBeGreaterThanOrEqual(EYE_LIFT.to);
    }
    for (const accent of ['#e05c7a', '#e0455c', '#1d7a8c', '#f7c948', '#c8e6b0']) expect(eyeGlow(accent)).toBe(accent);
  });
});
