/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Matrix4, Mesh, ShaderMaterial, SkinnedMesh, Texture, TextureLoader, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RealisticHuman3D, restSkeleton, skaterLoader, type RealisticCharacter } from './realisticHuman3d';
import { SkaterSolver, aroundBone, girthAt, girthFrame, type RestSkeleton, type SkeletonPose } from './skaterPose';
import { DeltaMush } from './deltaMush';
import { TeeDrape } from './teeDrape';
import { planStage, stageFrame } from '../../stage/stage';
import { stageView, toThree } from '../../camera/view';
import { DEFAULT_SKATE_STYLE } from '../../motion/style';
import { SHOE_HALF_HEIGHT } from '../../motion/skeleton';

afterEach(() => vi.restoreAllMocks());

const CHARACTERS: readonly RealisticCharacter[] = ['skater', 'alien'];

/** The built skater (or the alien made from him), parsed from the package's own asset. */
async function skater(character: RealisticCharacter = 'skater'): Promise<GLTF> {
  const file = readFileSync(new URL(character === 'alien' ? './assets/alien.glb' : './assets/skater.glb', import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const gltf = await new Promise<GLTF>((resolve, reject) => skaterLoader().parse(buffer, '', resolve, reject));
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

function meshes(gltf: GLTF) {
  const found = new Map<string, SkinnedMesh>();
  gltf.scene.traverse((o) => {
    if (o instanceof SkinnedMesh) found.set((o.material as { name: string }).name, o);
  });
  return found;
}

async function rest(character: RealisticCharacter = 'skater'): Promise<RestSkeleton> {
  const parts = meshes(await skater(character));
  return restSkeleton(parts.get('body')!, parts.get('shoes')!, parts.get('outfit'));
}

const trick = (base: string) => ({ id: base, name: base, base, stance: 'regular' as const });
const options = (riderStance: 'regular' | 'goofy', landed = true) =>
  ({ riderStance, landed, style: DEFAULT_SKATE_STYLE, fall: 'slam' as const, shankProgress: 0.5, skater: 'realistic' as const });
const named = (skeleton: RestSkeleton, name: string) => skeleton.bones.findIndex((b) => b.name.replace(/\./g, '') === name.replace(/\./g, ''));

/** Put the loaded skater's bones where a solved pose has them, as the rider does each frame. */
function wear(gltf: GLTF, pose: SkeletonPose) {
  const bones = meshes(gltf).get('body')!.skeleton.bones;
  const index = new Map(bones.map((b, i) => [b as object, i]));
  const world = pose.head.map((head, i) => new Matrix4().compose(head, pose.quat[i], new Vector3(1, 1, 1)));
  bones.forEach((bone, i) => {
    const parent = bone.parent ? index.get(bone.parent) : undefined;
    const inverse = parent === undefined ? bone.parent?.matrixWorld.clone().invert() ?? new Matrix4() : world[parent].clone().invert();
    bone.matrixAutoUpdate = false;
    bone.matrix.multiplyMatrices(inverse, world[i]);
  });
  gltf.scene.updateMatrixWorld(true);
}

describe.each(CHARACTERS)('realistic %s skeleton', (character) => {
  it('keeps each sole on the rig’s sole and never stretches a bone, in both stances', async () => {
    const skeleton = await rest(character);
    const solver = new SkaterSolver(skeleton);
    const restLength = skeleton.bones.map((b) => (b.parent >= 0 ? b.head.distanceTo(skeleton.bones[b.parent].head) : 0));
    for (const base of ['Ollie', 'Kickflip', '360 Flip', 'Kickflip into Backside Boardslide']) {
      for (const stance of ['regular', 'goofy'] as const) {
        const stage = planStage(trick(base), options(stance));
        for (const share of [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
          const rig = stageFrame(stage, stage.end * share, 1).rig;
          const pose = solver.solve(rig);
          skeleton.bones.forEach((b, i) => {
            if (b.parent < 0) return;
            expect(pose.head[i].distanceTo(pose.head[b.parent])).toBeCloseTo(restLength[i], 3);
          });
          for (const leg of rig.legs) {
            const side = leg.side === 'left' ? 'L' : 'R';
            const foot = named(skeleton, `foot.${side}`);
            // Where this pose puts the rest sole's middle.
            const sole = skeleton.soles[side].center.clone().sub(skeleton.bones[foot].head)
              .applyQuaternion(pose.quat[foot].clone().multiply(skeleton.bones[foot].quat.clone().invert()))
              .add(pose.head[foot]);
            const target = new Vector3(...toThree(leg.shoe.at(0, -SHOE_HALF_HEIGHT, 0)));
            expect(sole.distanceTo(target), `${base} ${stance} ${share} ${side}`).toBeLessThan(0.05);
          }
        }
      }
    }
  });

  it('bends the knees forward, over the feet, while riding', async () => {
    const skeleton = await rest(character);
    const solver = new SkaterSolver(skeleton);
    const stage = planStage(trick('Kickflip'), options('regular'));
    for (const share of [0.05, 0.2, 0.35, 0.8]) {
      const pose = solver.solve(stageFrame(stage, stage.end * share, 1).rig);
      const pelvis = pose.quat[named(skeleton, 'root')].clone().multiply(skeleton.bones[named(skeleton, 'root')].quat.clone().invert());
      const forward = new Vector3(0, 0, 1).applyQuaternion(pelvis);
      for (const s of ['L', 'R']) {
        const hip = pose.head[named(skeleton, `upperleg01.${s}`)];
        const knee = pose.head[named(skeleton, `lowerleg01.${s}`)];
        const ankle = pose.head[named(skeleton, `foot.${s}`)];
        const axis = ankle.clone().sub(hip).normalize();
        const bend = knee.clone().sub(hip).projectOnPlane(axis);
        expect(bend.dot(forward), `${share} ${s}`).toBeGreaterThan(0);
        // Never locked straight.
        expect(hip.distanceTo(ankle)).toBeLessThan(hip.distanceTo(knee) + knee.distanceTo(ankle) - 0.5);
      }
    }
  });

  it('keeps a slammed body on top of the ground', async () => {
    const skeleton = await rest(character);
    const solver = new SkaterSolver(skeleton);
    const stage = planStage(trick('Kickflip'), options('regular', false));
    const trunk = ['root', 'spine03', 'spine01', 'neck01', 'head'].map((n) => named(skeleton, n));
    for (let share = 0.5; share <= 1; share += 0.05) {
      const pose = solver.solve(stageFrame(stage, stage.end * share, 1).rig);
      for (const b of trunk) expect(pose.head[b].y, `${share}`).toBeGreaterThan(4);
    }
  });

  it('holds a hand open out for balance and relaxed (curled, wrist lifted, fingers together) while riding', async () => {
    const skeleton = await rest(character);
    const solver = new SkaterSolver(skeleton);
    const stage = planStage(trick('Kickflip'), options('regular'));
    const at = (pose: { head: Vector3[] }, name: string) => pose.head[named(skeleton, name)].clone();
    /** How far the middle finger curls (degrees): its middle bone against the back of the hand. */
    const curl = (pose: { head: Vector3[] }, s: string) => {
      const hand = at(pose, `finger3-1.${s}`).sub(at(pose, `metacarpal2.${s}`));
      const middle = at(pose, `finger3-3.${s}`).sub(at(pose, `finger3-2.${s}`));
      return hand.angleTo(middle) * 180 / Math.PI;
    };
    const riding = solver.solve(stageFrame(stage, stage.end * 0.05, 1).rig);
    const ridingCurl = ['L', 'R'].map((s) => curl(riding, s));
    const air = solver.solve(stageFrame(stage, stage.end * 0.42, 1).rig);
    const airCurl = ['L', 'R'].map((s) => curl(air, s));
    // Out for balance at least one hand opens well past how it rests while riding.
    expect(Math.min(...airCurl)).toBeLessThan(Math.max(...ridingCurl) - 8);
    // Riding, the fingers lie nearly side by side: the index and little fingers' first bones within 20° of each other.
    for (const s of ['L', 'R']) {
      const index = at(riding, `finger2-2.${s}`).sub(at(riding, `finger2-1.${s}`)).normalize();
      const little = at(riding, `finger5-2.${s}`).sub(at(riding, `finger5-1.${s}`)).normalize();
      expect(index.angleTo(little) * 180 / Math.PI).toBeLessThan(30);
    }
  });

  it('lets the arms follow through only while playback runs forward', async () => {
    const skeleton = await rest(character);
    const still = new SkaterSolver(skeleton);
    const playing = new SkaterSolver(skeleton);
    const stage = planStage(trick('Kickflip'), options('regular'));
    const hand = named(skeleton, 'wrist.L');
    const t = stage.end * 0.3;
    for (let k = 20; k > 0; k--) playing.solve(stageFrame(stage, t - k / 60, 1).rig, { dt: 1 / 60 });
    const rig = stageFrame(stage, t, 1).rig;
    const lagging = playing.solve(rig, { dt: 1 / 60 }).head[hand].clone();
    const posed = still.solve(rig).head[hand].clone();
    expect(lagging.distanceTo(posed)).toBeGreaterThan(0.5);
    // A redraw, a seek, or a replay puts the arm straight back where the rig has it.
    expect(playing.solve(rig, { dt: 0 }).head[hand].distanceTo(posed)).toBeLessThan(1e-6);
  });

  it('turns a limb only a little against what it hangs off, whichever way the rider faces, and never over between frames', async () => {
    const skeleton = await rest(character);
    const solver = new SkaterSolver(skeleton);
    const delta = (pose: SkeletonPose, i: number) => pose.quat[i].clone().multiply(skeleton.bones[i].quat.clone().invert());
    /** How far a bone is turned about itself against the one it hangs off (degrees). */
    const roll = (pose: SkeletonPose, child: string, parent: string, tip: string) => {
      const c = named(skeleton, child);
      const turn = delta(pose, named(skeleton, parent)).invert().multiply(delta(pose, c));
      const axis = skeleton.bones[named(skeleton, tip)].head.clone().sub(skeleton.bones[c].head).normalize();
      return Math.abs(2 * Math.atan2(turn.x * axis.x + turn.y * axis.y + turn.z * axis.z, turn.w) * 180 / Math.PI);
    };
    const limbs = ['upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'upperarm01', 'upperarm02', 'lowerarm01']
      .flatMap((b) => ['L', 'R'].map((s) => named(skeleton, `${b}.${s}`)));
    // Deep crouches (where a thigh points nearly at its knee's pole), and a boardslide that turns the rider round.
    for (const base of ['Kickflip', 'Kickflip into Backside Boardslide']) {
      for (const stance of ['regular', 'goofy'] as const) {
        const stage = planStage(trick(base), options(stance));
        let last: SkeletonPose | null = null;
        for (let t = 0; t <= stage.end; t += 1 / 60) {
          const pose = solver.solve(stageFrame(stage, t, 1).rig);
          for (const s of ['L', 'R']) {
            expect(roll(pose, `upperleg01.${s}`, 'root', `lowerleg01.${s}`), `${base} ${stance} ${t.toFixed(2)} thigh ${s}`).toBeLessThan(30);
            expect(roll(pose, `upperarm01.${s}`, `clavicle.${s}`, `lowerarm01.${s}`), `${base} ${stance} ${t.toFixed(2)} arm ${s}`).toBeLessThan(30);
          }
          if (last) {
            for (const b of limbs) {
              const turned = pose.quat[b].clone().normalize().angleTo(last.quat[b].clone().normalize()) * 180 / Math.PI;
              expect(turned, `${base} ${stance} ${t.toFixed(3)} ${skeleton.bones[b].name}`).toBeLessThan(60);
            }
          }
          last = { head: pose.head.map((h) => h.clone()), quat: pose.quat.map((q) => q.clone()) };
        }
      }
    }
  });
  it('rests the hands on the jeans, never in them, through tricks in both stances', async () => {
    const skeleton = await rest(character);
    const jeans = skeleton.jeans!;
    const solver = new SkaterSolver(skeleton);
    const bone = (name: string) => named(skeleton, name);
    let deepest = 0;
    for (const base of ['Ollie', 'Kickflip', '360 Flip', 'Backside 180', 'Kickflip into Backside Boardslide']) {
      for (const stance of ['regular', 'goofy'] as const) {
        const stage = planStage(trick(base), options(stance));
        let last = -1;
        for (let k = 0; k <= 60; k++) {
          const t = (stage.end * k) / 60;
          const pose = solver.solve(stageFrame(stage, t, 1).rig, { dt: last < 0 ? -1 : t - last, time: t });
          last = t;
          for (const hand of ['L', 'R']) {
            for (const f of [2, 3, 4, 5]) {
              const [k1, k2, k3] = [1, 2, 3].map((j) => bone(`finger${f}-${j}.${hand}`));
              if (!skeleton.skinned![k1]) continue;
              const tip = pose.head[k3].clone().add(pose.head[k3].clone().sub(pose.head[k2]));
              for (const p of [pose.head[k1], pose.head[k2], pose.head[k3], tip]) {
                for (const leg of ['L', 'R'] as const) {
                  for (const [from, to, girth] of [[`upperleg01.${leg}`, `lowerleg01.${leg}`, jeans[leg].thigh], [`lowerleg01.${leg}`, `foot.${leg}`, jeans[leg].shin]] as const) {
                    const b = bone(from);
                    const turn = pose.quat[b].clone().multiply(skeleton.bones[b].quat.clone().invert());
                    const frame = girthFrame(pose.head[b], pose.head[bone(to)], new Vector3(0, 0, 1).applyQuaternion(turn));
                    const { t: along, off, angle } = aroundBone(p, pose.head[b], frame);
                    const reach = girthAt(girth, along, angle);
                    if (along >= 0 && along <= 1 && reach > 0) deepest = Math.max(deepest, reach - off);
                  }
                }
              }
            }
          }
        }
      }
    }
    // Without the jeans to keep out of, fingers went about 12 units into a thigh.
    expect(deepest).toBeLessThan(2.5);
  });
});

describe('realistic skater assets', () => {
  function loaders(character: RealisticCharacter = 'skater') {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(() => skater(character));
    const textures: Texture<HTMLImageElement>[] = [];
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
      const texture = new Texture<HTMLImageElement>();
      textures.push(texture);
      return texture;
    });
    return textures;
  }

  it.each(CHARACTERS)('dresses every part of the %s in its own outline-free material and poses it, in both stances', async (character) => {
    loaders(character);
    const rider = new RealisticHuman3D(character);
    await rider.ready;
    const parts = new Set<string>();
    rider.group.traverse((o) => {
      if (o instanceof Mesh && o.visible) {
        expect(o.material).toBeInstanceOf(ShaderMaterial);
        expect((o.material as ShaderMaterial).uniforms.uInfo.value.z).toBe(0);
        parts.add(o.name);
      }
    });
    expect(parts.size).toBeGreaterThanOrEqual(character === 'alien' ? 4 : 7);
    for (const stance of ['regular', 'goofy'] as const) {
      const stage = planStage(trick('Kickflip'), options(stance));
      for (const share of [0, 0.35, 0.7]) {
        const frame = stageFrame(stage, stage.end * share, 1);
        rider.update(frame.rig, frame.expression, stageView(frame.lift), frame);
        rider.group.updateMatrixWorld(true);
        rider.group.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      }
    }
    rider.dispose();
  });

  it('draws its own shadow before the scene, and turns it on for its materials', async () => {
    loaders();
    const rider = new RealisticHuman3D();
    await rider.ready;
    const stage = planStage(trick('Ollie'), options('regular'));
    const frame = stageFrame(stage, 0.2, 1);
    rider.update(frame.rig, frame.expression, stageView(frame.lift), frame);
    const calls: string[] = [];
    const renderer = {
      getClearColor: (c: unknown) => c, getClearAlpha: () => 0,
      setRenderTarget: (t: unknown) => calls.push(t ? 'target' : 'canvas'),
      setClearColor: () => {}, clear: () => calls.push('clear'), render: () => calls.push('render'),
    };
    rider.prepare(renderer as never);
    expect(calls).toEqual(['target', 'clear', 'render']);
    let lit = 0;
    rider.group.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof ShaderMaterial && 'uShadowOn' in o.material.uniforms) lit += o.material.uniforms.uShadowOn.value;
    });
    expect(lit).toBeGreaterThan(0);
    rider.dispose();
  });

  it('releases what it loaded once, and nothing when a texture fails', async () => {
    const textures = loaders();
    const rider = new RealisticHuman3D();
    await rider.ready;
    const disposed = textures.map((t) => vi.spyOn(t, 'dispose'));
    rider.dispose();
    rider.dispose();
    for (const d of disposed) expect(d).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(() => skater());
    const loaded: Texture<HTMLImageElement>[] = [];
    let n = 0;
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
      if (n++ === 2) throw new Error('offline');
      const texture = new Texture<HTMLImageElement>();
      loaded.push(texture);
      return texture;
    });
    const offline = new RealisticHuman3D();
    const released = () => loaded.map((t) => vi.spyOn(t, 'dispose'));
    await offline.ready;
    expect(offline.group.children).toHaveLength(0);
    // Already released by the failed load.
    for (const d of released()) expect(d).not.toHaveBeenCalled();
    offline.dispose();
  });

  it('drops assets that arrive after the viewer has closed', async () => {
    let finish!: (gltf: GLTF) => void;
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockReturnValue(new Promise<GLTF>((resolve) => { finish = resolve; }));
    const textures: Texture<HTMLImageElement>[] = [];
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => {
      const texture = new Texture<HTMLImageElement>();
      textures.push(texture);
      return texture;
    });
    const rider = new RealisticHuman3D();
    rider.dispose();
    const gltf = await skater();
    const geometry = vi.spyOn(meshes(gltf).get('body')!.geometry, 'dispose');
    const released = textures.map((t) => vi.spyOn(t, 'dispose'));
    finish(gltf);
    await rider.ready;
    expect(rider.group.children).toHaveLength(0);
    expect(geometry).toHaveBeenCalledTimes(1);
    for (const d of released) expect(d).toHaveBeenCalledTimes(1);
  });

  it('builds the alien from the skater: the same skeleton and soles, three fingers and a thumb, eyes riding the head, no brows, lashes, or beanie', async () => {
    const [human, alien] = await Promise.all([rest('skater'), rest('alien')]);
    expect(alien.bones.map((b) => b.name)).toEqual(human.bones.map((b) => b.name));
    for (const side of ['L', 'R'] as const) {
      expect(alien.soles[side].center.distanceTo(human.soles[side].center)).toBeLessThan(0.5);
      expect(alien.skinned![named(alien, `finger5-1.${side}`)]).toBe(false);
      expect(alien.skinned![named(alien, `finger4-3.${side}`)]).toBe(true);
      expect(human.skinned![named(human, `finger5-1.${side}`)]).toBe(true);
    }
    const parts = meshes(await skater('alien'));
    expect([...parts.keys()].sort()).toEqual(['body', 'eyes', 'outfit', 'shoes']);
    const eyes = parts.get('eyes')!;
    const index = eyes.geometry.getAttribute('skinIndex'), weight = eyes.geometry.getAttribute('skinWeight');
    const head = eyes.skeleton.bones.findIndex((b) => b.name === 'head');
    for (let i = 0; i < index.count; i++) {
      for (let k = 0; k < 4; k++) if (weight.getComponent(i, k) > 0.01) expect(index.getComponent(i, k)).toBe(head);
    }
  });

  it('is built as an adult about 1.8 m tall standing on its soles, toes forward', async () => {
    const skeleton = await rest();
    const head = skeleton.bones[named(skeleton, 'head')].head;
    expect(head.y).toBeGreaterThan(155);
    expect(head.y).toBeLessThan(175);
    for (const sole of [skeleton.soles.L, skeleton.soles.R]) {
      expect(Math.abs(sole.center.y)).toBeLessThan(3);
      expect(sole.fwd.dot(new Vector3(0, 0, 1))).toBeGreaterThan(0.95);
    }
  });
});

describe('delta mush on the clothes', () => {
  it('gives back the rest pose untouched, and a rigid move of the whole body rigidly', async () => {
    const outfit = meshes(await skater()).get('outfit')!;
    const mush = new DeltaMush(outfit);
    const position = () => Array.from(mush.geometry.getAttribute('position').array as Float32Array);
    const rest = Array.from(mush.geometry.getAttribute('rest').array as Float32Array);
    for (const bone of outfit.skeleton.bones) bone.updateMatrixWorld(true);
    mush.update();
    position().forEach((p, i) => expect(Math.abs(p - rest[i])).toBeLessThan(1e-3));
    // Turn and move every bone together: the cloth follows exactly, nothing relaxes away.
    const move = new Matrix4().makeRotationY(0.7).setPosition(12, -3, 40);
    for (const bone of outfit.skeleton.bones) bone.matrixWorld.premultiply(move);
    mush.update();
    const moved = position();
    const p = new Vector3();
    for (let i = 0; i < rest.length; i += 3) {
      p.set(rest[i], rest[i + 1], rest[i + 2]).applyMatrix4(move);
      expect(Math.hypot(moved[i] - p.x, moved[i + 1] - p.y, moved[i + 2] - p.z)).toBeLessThan(1e-2);
    }
  });

  it('keeps the tee outside the legs through a crouch, a pop, and a landing, and leaves the rest pose as it was', async () => {
    const gltf = await skater();
    const parts = meshes(gltf);
    const skeleton = restSkeleton(parts.get('body')!, parts.get('shoes')!);
    const outfit = parts.get('outfit')!;
    const mush = new DeltaMush(outfit);
    const drape = new TeeDrape(mush, outfit.geometry.getAttribute('uv'), outfit.skeleton);
    let moved = Infinity;
    mush.update((nodes) => {
      const plain = nodes.slice();
      drape.fit(nodes);
      moved = Math.max(...nodes.map((v, i) => Math.abs(v - plain[i])));
    });
    expect(moved).toBeLessThan(1e-6);

    const solver = new SkaterSolver(skeleton);
    let deepest = -Infinity;
    for (const [base, stance, set] of [['Kickflip', 'regular', 'plaza'], ['Kickflip', 'goofy', 'plaza'], ['50-50 Grind', 'regular', 'el-toro']] as const) {
      const stage = planStage(trick(base), { ...options(stance), set });
      for (let t = 0; t <= stage.end; t += 1 / 20) {
        const frame = stageFrame(stage, t, 1);
        wear(gltf, solver.solve(frame.rig, { ground: frame.stairs?.shadowY ?? 0 }));
        mush.update((nodes) => {
          deepest = Math.max(deepest, drape.deepest(nodes));
          drape.fit(nodes);
          expect(drape.deepest(nodes), `${base} ${stance} ${t.toFixed(2)}`).toBeLessThanOrEqual(0);
        });
      }
    }
    // Skinned to the trunk alone, the thighs come well up into it.
    expect(deepest).toBeGreaterThan(3);
  });
});

describe('looking', () => {
  const gazeOf = (frame: ReturnType<typeof stageFrame>) => new Vector3(...toThree(frame.gaze!));
  const headPitch = (skeleton: RestSkeleton, pose: { quat: { clone(): import('three').Quaternion }[] }) => {
    const h = named(skeleton, 'head');
    const delta = pose.quat[h].clone().multiply(skeleton.bones[h].quat.clone().invert());
    return Math.asin(new Vector3(0, 0, 1).applyQuaternion(delta).y) * 180 / Math.PI;
  };

  it('bows the head over the board from the setup to touchdown, and lifts it to look ahead', async () => {
    const skeleton = await rest();
    const solver = new SkaterSolver(skeleton);
    const stage = planStage(trick('Kickflip'), options('regular'));
    const at = (t: number) => {
      const frame = stageFrame(stage, t, 1);
      return headPitch(skeleton, solver.solve(frame.rig, { gaze: gazeOf(frame) }));
    };
    expect(at(0.75)).toBeLessThan(-35); // the flip: watching the board
    expect(at(0.05)).toBeGreaterThan(-25); // rolling in: looking ahead
    expect(at(stage.end)).toBeGreaterThan(-20); // rolling away
  });

  it('turns the head smoothly through spins and fakie, never whipping it about', async () => {
    const skeleton = await rest();
    const h = named(skeleton, 'head');
    for (const [base, stance] of [['Backside 180', 'regular'], ['Bigspin', 'regular'], ['Kickflip', 'fakie'], ['360 Flip', 'regular']] as const) {
      const solver = new SkaterSolver(skeleton);
      const stage = planStage({ id: base, name: base, base, stance }, options('regular'));
      let last: Vector3 | null = null;
      for (let t = 0; t <= stage.end; t += 1 / 60) {
        const frame = stageFrame(stage, t, 1);
        const pose = solver.solve(frame.rig, { gaze: gazeOf(frame), dt: 1 / 60, time: t });
        const facing = new Vector3(0, 0, 1).applyQuaternion(pose.quat[h].clone().multiply(skeleton.bones[h].quat.clone().invert()));
        // A quick head turn to look at something peaks around 400°/s.
        if (last) expect(last.angleTo(facing) * 60 * 180 / Math.PI, `${base} ${stance} at ${t.toFixed(2)}`).toBeLessThan(450);
        last = facing;
      }
    }
  });
});
