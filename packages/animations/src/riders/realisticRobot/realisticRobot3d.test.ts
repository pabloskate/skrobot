import { describe, expect, it } from 'vitest';
import { Mesh, Vector3, Vector4, type BufferAttribute, type BufferGeometry, type Object3D, type ShaderMaterial } from 'three';
import { RealisticBoard3D } from '../../board/realisticBoard3d';
import { toThree } from '../../camera/view';
import { ARM_RADII, HAND_RADIUS, LEG_RADII } from '../../motion/skeleton';
import { DEFAULT_SKATE_STYLE } from '../../motion/style';
import { planStage, stageFrame, type StageFrame } from '../../stage/stage';
import { RiderDaylight } from '../../three/daylight';
import { rgb } from '../../three/materials';
import type { RobotLook } from '../look';
import { RealisticRobot3D } from './realisticRobot3d';
import { BACK_HATCH, EYE_LIFT, EYES, eyeGlow, HEAD_VENTS, SCREEN, SHOE_LACES } from './robotMaterials';
import { ballGeometry, KNEE_R, mittGeometry, SHOULDER_R } from './robotParts';

const LOOK: RobotLook = { body: '#7ec8e3', accent: '#e05c7a', variant: 0 };

type Stance = 'regular' | 'fakie';
const stage = (base: string, { landed = true, stance = 'regular' as Stance, riderStance = 'regular' as 'regular' | 'goofy' } = {}) =>
  planStage({ id: base, name: base, base, stance }, { riderStance, landed, style: DEFAULT_SKATE_STYLE, fall: 'slam', shankProgress: 0.5, skater: 'realistic-robot' });

function pose(rider: RealisticRobot3D, frame: StageFrame) {
  rider.update(frame.rig, frame.expression);
  rider.group.updateMatrixWorld(true);
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
const part = (root: Object3D, name: string) => root.getObjectByName(name) as Mesh;

/** Everything a pose writes: each part's matrix, each material's uniforms, each rewritten vertex. */
function picture(rider: RealisticRobot3D): number[] {
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

describe('the realistic robot', () => {
  it.each([0, 1, 2, 3] as const)('poses variant %i through a landed trick, a slam and a goofy grind', (variant) => {
    const rider = new RealisticRobot3D({ ...LOOK, variant });
    for (const plan of [stage('Ollie'), stage('Kickflip', { landed: false }), stage('Boardslide', { riderStance: 'goofy' })]) {
      for (let i = 0; i <= 24; i++) {
        pose(rider, stageFrame(plan, (plan.end * i) / 24, 1));
        expect(picture(rider).every(Number.isFinite)).toBe(true);
      }
    }
    rider.dispose();
  });

  it('shows the same picture for a frame however the clip got there', () => {
    const rider = new RealisticRobot3D(LOOK);
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

  it('shares landmark shade with the board and returns to daylight when the set changes', () => {
    const light = new RiderDaylight();
    const rider = new RealisticRobot3D(LOOK, light);
    const board = new RealisticBoard3D(light);
    const surfaces = [...materials(rider.group), ...materials(board.group)];
    const origin = new Vector3();
    light.setSpot({ origin, count: 1, min: [new Vector4(-40, 100, -40, 1)], max: [new Vector4(40, 120, 40, 0)], look: new Vector4(0.9, 0.03, 0, 0), soffit: 1 });
    origin.x = -300;
    for (const { uniforms } of surfaces) {
      expect(uniforms.uInfo.value.z).toBe(0);
      expect(uniforms.uBoxCount.value).toBe(1);
      expect(uniforms.uSpotOrigin.value.x).toBe(-300);
    }
    light.setSpot();
    expect(surfaces.every(m => m.uniforms.uBoxCount.value === 0)).toBe(true);
    rider.dispose();
    board.dispose();
  });

  it('seats both ends of each limb on its rig joints and fits the cartoon robot\'s tapered envelope', () => {
    const rider = new RealisticRobot3D(LOOK);
    for (const plan of [stage('Kickflip'), stage('Kickflip', { landed: false }), stage('Boardslide', { riderStance: 'goofy' })]) {
      const frame = stageFrame(plan, plan.end * 0.45, 1);
      pose(rider, frame);
      for (const side of ['left', 'right'] as const) {
        const arm = frame.rig.arms.find(a => a.side === side)!;
        const leg = frame.rig.legs.find(l => l.side === side)!;
        for (const [name, from, to, ra, rb] of [
          ['upper-arm', arm.shoulder, arm.elbow, ARM_RADII.shoulder, ARM_RADII.elbow],
          ['forearm', arm.elbow, arm.hand, ARM_RADII.elbow, ARM_RADII.wrist],
          ['thigh', leg.hip, leg.knee, LEG_RADII.hip, LEG_RADII.knee],
          ['shin', leg.knee, leg.ankle, LEG_RADII.knee, LEG_RADII.ankle],
        ] as const) {
          const mesh = part(rider.group, side + '-' + name);
          const a = new Vector3(...toThree(from)), b = new Vector3(...toThree(to));
          expect(mesh.localToWorld(new Vector3()).distanceTo(a)).toBeLessThan(1e-6);
          expect(mesh.localToWorld(new Vector3(1, 0, 0)).distanceTo(b)).toBeLessThan(1e-6);
          const vertices = mesh.geometry.getAttribute('position');
          let maxWidth = 0;
          for (let i = 0; i < vertices.count; i++) {
            const p = new Vector3().fromBufferAttribute(vertices, i);
            const t = Math.max(0, Math.min(1, p.x));
            const ax = a.clone().lerp(b, t);
            maxWidth = Math.max(maxWidth, mesh.localToWorld(p).distanceTo(ax) / (ra + t * (rb - ra)));
          }
          // A plain sleeve, 90% of the clearance radius all the way along, as the cartoon robot's limbs are.
          expect(maxWidth).toBeCloseTo(0.9, 5);
        }
        expect(part(rider.group, side + '-shoe').getWorldPosition(new Vector3()).toArray()).toEqual(toThree(leg.shoe.origin));
      }
    }
    rider.dispose();
  });

  it('keeps the head dimensions and all four antenna heights on the original head frame', () => {
    for (const variant of [0, 1, 2, 3] as const) {
      const rider = new RealisticRobot3D({ ...LOOK, variant });
      const frame = stageFrame(stage('Ollie'), 0, 1);
      pose(rider, frame);
      const head = part(rider.group, 'head');
      head.geometry.computeBoundingBox();
      expect(head.geometry.boundingBox!.getSize(new Vector3()).toArray()).toEqual([28, 30, 36]);
      const top = meshes(rider.group).filter(m => m.name === 'crest' || m.name === 'antenna-tip');
      const highest = Math.max(...top.flatMap(m => {
        const p = m.geometry.getAttribute('position');
        return Array.from({ length: p.count }, (_, i) => head.worldToLocal(m.localToWorld(new Vector3().fromBufferAttribute(p, i))).y);
      }));
      // Sphere antenna tips stay upright in world space; their tessellation can undershoot the crown slightly.
      expect(highest).toBeCloseTo([27, 27.8, 19.4, 24.9][variant], 1);
      rider.dispose();
    }
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

describe('the realistic robot\'s paint', () => {
  it('lies on the surface it is painted on', () => {
    const rider = new RealisticRobot3D(LOOK);
    const within = (points: Array<{ y: number; z: number }>, side: number, up: number, halfS: number, halfU: number) => {
      const zs = points.map((p) => p.z);
      const ys = points.map((p) => p.y);
      expect(side - halfS).toBeGreaterThanOrEqual(Math.min(...zs));
      expect(side + halfS).toBeLessThanOrEqual(Math.max(...zs));
      expect(up - halfU).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(up + halfU).toBeLessThanOrEqual(Math.max(...ys));
    };
    const chest = part(rider.group, 'chest').geometry;
    within(facing(chest, 'x', -1), BACK_HATCH.side, BACK_HATCH.up, BACK_HATCH.half[0], BACK_HATCH.half[1]);

    const head = part(rider.group, 'head').geometry;
    const ventsHalfU = ((HEAD_VENTS.count - 1) / 2) * HEAD_VENTS.gap + HEAD_VENTS.half[1];
    within(facing(head, 'x', -1), 0, HEAD_VENTS.up, HEAD_VENTS.half[0], ventsHalfU);

    // The screen and the groove round it are inside the grid they're painted on.
    const grid = part(rider.group, 'visor').geometry.getAttribute('position');
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
    const upper = part(rider.group, 'left-upper').geometry;
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
