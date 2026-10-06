import {
  Bone,
  Color,
  Group,
  HalfFloatType,
  Mesh,
  Matrix4,
  NearestFilter,
  OrthographicCamera,
  Quaternion,
  RGBAFormat,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type Object3D,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Rig } from '../../motion/skeleton';
import type { Expression } from '../look';
import { toThree, type StageView } from '../../camera/view';
import type { StageFrame } from '../../stage/stage';
import { SkaterSolver, type RestBone, type RestSkeleton, type Sole } from './skaterPose';
import { DeltaMush } from './deltaMush';
import { TeeDrape } from './teeDrape';
import {
  beanieMaterial, eyeMaterial, hairCardMaterial, outfitMaterial, shadowCasterMaterial, shoeMaterial, skinMaterial, sunShadow,
  SHADOW_SIZE, type Knees,
} from './realisticMaterials';

// Each URL a literal, so bundlers (webpack, Vite) find and ship the file.
const MODEL = new URL('./assets/skater.glb', import.meta.url).href;
const TEXTURES = {
  skin: new URL('./assets/skin.jpg', import.meta.url).href,
  skinNormal: new URL('./assets/skin_normal.jpg', import.meta.url).href,
  outfit: new URL('./assets/outfit.jpg', import.meta.url).href,
  outfitNormal: new URL('./assets/outfit_normal.jpg', import.meta.url).href,
  outfitAO: new URL('./assets/outfit_ao.jpg', import.meta.url).href,
  eye: new URL('./assets/eye.jpg', import.meta.url).href,
  hair: new URL('./assets/hair.jpg', import.meta.url).href,
  brows: new URL('./assets/brows.png', import.meta.url).href,
  lashes: new URL('./assets/lashes.png', import.meta.url).href,
} as const;
type TextureName = keyof typeof TEXTURES;
/** Color textures; the rest (normals, occlusion) are data. */
const COLOR: ReadonlySet<TextureName> = new Set(['skin', 'outfit', 'eye', 'brows', 'lashes']);

export const SKATER_OUTFIT = {
  tee: '#e4e0d6',
  denimDark: '#232e42',
  denimLight: '#61779a',
  shoe: '#2a2a2c',
  sole: '#e9e4d8',
  hair: '#2a1e17',
  beanie: '#4b5052',
} as const;

/** The beanie's knit is laid out round this point (rest pose), from its brim's front edge up. */
const BEANIE_CENTER: [number, number, number] = [0, 174.6, 6];
const BEANIE_BRIM = 167.3;

/**
 * A realistic skater: a MakeHuman-built adult (CC0), skinned to a full
 * human skeleton and posed every frame from the trick rig by SkaterSolver.
 * The mesh, its rig, and its textures are made by blender/build_skater.py.
 *
 * The body shades itself: before each frame (`prepare`) its parts are
 * drawn from the sun into a small depth map that every material reads.
 *
 * Nothing draws until the model has loaded (`ready`); a failed load leaves
 * the stage without a rider rather than throwing.
 */
export class RealisticHuman3D {
  readonly group = new Group();
  readonly ready: Promise<void>;
  private solver: SkaterSolver | null = null;
  private bones: Bone[] = [];
  /** Each bone's parent's index in `bones`, or -1 when its parent isn't a bone. */
  private parents: number[] = [];
  private readonly world: Matrix4[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: ShaderMaterial[] = [];
  private textures: Texture[] = [];
  private disposed = false;
  /** The sun's view of the body: casters sharing the visible meshes' geometry and bones. */
  private readonly shadow = sunShadow();
  private readonly shadowScene = new Scene();
  private readonly shadowCamera = new OrthographicCamera();
  private readonly caster = shadowCasterMaterial();
  private shadowTarget: WebGLRenderTarget | null = null;
  private root = 0;
  private lastT: number | null = null;
  /** The clothes, posed through Delta Mush rather than drawn straight off the skin, the tee then kept outside the legs. */
  private readonly mushed: { mush: DeltaMush; drape: TeeDrape }[] = [];
  /** The jeans' knees: where they are at rest, how far they're bent now. */
  private readonly knees: Knees = { uKneeL: { value: new Vector3() }, uKneeR: { value: new Vector3() }, uBend: { value: new Vector2() }, uHem: { value: 0 } };
  /** Hip, knee, and ankle bones per leg, left then right. */
  private legBones: [number, number, number][] = [];

  constructor() {
    this.group.name = 'realistic-human';
    this.ready = this.load().catch(() => {});
  }

  private async load(): Promise<void> {
    const names = Object.keys(TEXTURES) as TextureName[];
    const results = await Promise.allSettled([
      skaterLoader().loadAsync(MODEL),
      ...names.map((name) => new TextureLoader().loadAsync(TEXTURES[name])),
    ]);
    const [model, ...maps] = results;
    const loaded: Partial<Record<TextureName, Texture>> = {};
    maps.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const texture = result.value as Texture;
      texture.flipY = false;
      if (COLOR.has(names[i])) texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 4;
      loaded[names[i]] = texture;
    });
    this.textures = Object.values(loaded);
    if (this.disposed || model.status !== 'fulfilled' || results.some((r) => r.status === 'rejected')) {
      this.release(model.status === 'fulfilled' ? model.value.scene : null);
      return;
    }
    const tex = loaded as Record<TextureName, Texture>;
    const scene = model.value.scene;
    scene.updateMatrixWorld(true);

    const meshes = new Map<string, SkinnedMesh>();
    scene.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        const role = (Array.isArray(object.material) ? object.material[0] : object.material).name;
        meshes.set(role, object);
      }
    });
    const body = meshes.get('body');
    const shoes = meshes.get('shoes');
    if (!body || !shoes) {
      this.release(scene);
      return;
    }
    const rest = restSkeleton(body, shoes);
    this.bones = body.skeleton.bones;
    this.parents = rest.bones.map((b) => b.parent);
    this.root = Math.max(0, rest.bones.findIndex((b) => b.name === 'root'));
    this.solver = new SkaterSolver(rest);
    const soles = rest.soles;
    for (const bone of this.bones) {
      bone.matrixAutoUpdate = false;
      this.world.push(new Matrix4());
    }

    const floor = Math.min(soles.L.center.y, soles.R.center.y);
    const boneAt = (name: string) => rest.bones.findIndex((b) => b.name.replace(/\./g, '') === name);
    this.legBones = ['L', 'R'].map((s) => [boneAt(`upperleg01${s}`), boneAt(`lowerleg01${s}`), boneAt(`foot${s}`)] as [number, number, number]);
    this.knees.uKneeL.value.copy(rest.bones[this.legBones[0][1]].head);
    this.knees.uKneeR.value.copy(rest.bones[this.legBones[1][1]].head);
    this.knees.uHem.value = floor + 7;
    const shadow = this.shadow;
    const make: Record<string, () => ShaderMaterial> = {
      body: () => skinMaterial(tex.skin, tex.skinNormal, tex.hair, SKATER_OUTFIT.hair, shadow),
      beanie: () => beanieMaterial(SKATER_OUTFIT.beanie, BEANIE_CENTER, BEANIE_BRIM, shadow),
      outfit: () => outfitMaterial(tex.outfit, tex.outfitNormal, tex.outfitAO, SKATER_OUTFIT, this.knees, shadow),
      shoes: () => shoeMaterial({ upper: SKATER_OUTFIT.shoe, sole: SKATER_OUTFIT.sole, soleTop: 2.6, floor }, shadow),
      eyes: () => eyeMaterial(tex.eye, shadow),
      brows: () => hairCardMaterial(tex.brows, SKATER_OUTFIT.hair, shadow),
      lashes: () => hairCardMaterial(tex.lashes, '#140e0b', shadow),
    };
    /** Parts too fine to throw a shadow worth drawing. */
    const noCast = new Set(['brows', 'lashes', 'eyes']);
    /** Cloth: skinning alone pinches it at bent knees and hips and under the arms (deltaMush.ts). */
    const cloth = new Set(['outfit']);
    for (const [role, mesh] of meshes) {
      const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of old) m.dispose();
      const m = make[role]?.();
      if (!m) {
        mesh.visible = false;
        continue;
      }
      // Baked occlusion rides in the vertex colors where the build put it.
      m.vertexColors = mesh.geometry.hasAttribute('color');
      this.materials.push(m);
      this.geometries.push(mesh.geometry);
      if (cloth.has(role)) {
        const mush = new DeltaMush(mesh);
        this.mushed.push({ mush, drape: new TeeDrape(mush, mesh.geometry.getAttribute('uv'), mesh.skeleton) });
        this.geometries.push(mush.geometry);
        m.defines = { ...m.defines, USE_REST: '' };
        m.needsUpdate = true;
        mesh.visible = false;
        const drawn = new Mesh(mush.geometry, m);
        drawn.name = role;
        drawn.frustumCulled = false;
        this.group.add(drawn);
        const proxy = new Mesh(mush.geometry, this.caster);
        proxy.frustumCulled = false;
        this.shadowScene.add(proxy);
        continue;
      }
      mesh.material = m;
      mesh.frustumCulled = false;
      if (!noCast.has(role)) {
        const proxy = new SkinnedMesh(mesh.geometry, this.caster);
        proxy.bind(mesh.skeleton, mesh.bindMatrix);
        proxy.frustumCulled = false;
        proxy.matrixAutoUpdate = false;
        this.shadowScene.add(proxy);
      }
    }
    this.group.add(scene);
  }

  /** Draw the body from the sun into the shadow map its materials read. */
  prepare(renderer: WebGLRenderer): void {
    if (!this.solver) return;
    if (!this.shadowTarget) {
      this.shadowTarget = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
        type: HalfFloatType, format: RGBAFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter,
      });
      this.shadow.uShadowMap.value = this.shadowTarget.texture;
    }
    // The bones' world matrices, for this frame's pose, before the scene pass gets to them.
    this.group.updateMatrixWorld(true);
    const center = this.solver.pose.head[this.root];
    this.shadow.uShadowCenter.value.copy(center);
    this.caster.uniforms.uShadowCenter.value.copy(center);
    const clear = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.shadowTarget);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, false, false);
    renderer.render(this.shadowScene, this.shadowCamera);
    renderer.setClearColor(clear, alpha);
    this.shadow.uShadowOn.value = 1;
  }

  update(rig: Rig, expression: Expression, _view: StageView, frame?: StageFrame): void {
    const solver = this.solver;
    if (!solver) return;
    // The ground under the rider: the asphalt, or down a stair set the step their shadow falls on.
    // Trick time since the last frame drawn, while playback runs forward.
    const t = frame?.t;
    const dt = t != null && this.lastT != null ? t - this.lastT : -1;
    if (t != null) this.lastT = t;
    const pose = solver.solve(rig, {
      expression,
      ground: frame?.stairs?.shadowY ?? 0,
      dt,
      time: t ?? 0,
      gaze: frame?.gaze ? new Vector3(...toThree(frame.gaze)) : null,
    });
    // How far each knee is bent, for the creases behind it.
    this.legBones.forEach(([hip, knee, ankle], i) => {
      const thigh = pose.head[knee].clone().sub(pose.head[hip]);
      const shin = pose.head[ankle].clone().sub(pose.head[knee]);
      const bend = Math.min(1, thigh.angleTo(shin) / (100 * Math.PI / 180));
      this.knees.uBend.value.setComponent(i, bend);
    });
    const one = new Vector3(1, 1, 1);
    const inverse = new Matrix4();
    for (let i = 0; i < this.bones.length; i++) {
      this.world[i].compose(pose.head[i], pose.quat[i], one);
    }
    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i];
      const p = this.parents[i];
      if (p >= 0) inverse.copy(this.world[p]).invert();
      else inverse.copy(bone.parent?.matrixWorld ?? new Matrix4()).invert();
      bone.matrix.multiplyMatrices(inverse, this.world[i]);
      bone.matrixWorldNeedsUpdate = true;
    }
    if (this.mushed.length) {
      this.group.updateMatrixWorld(true);
      for (const { mush, drape } of this.mushed) mush.update((nodes) => drape.fit(nodes));
    }
  }

  private release(scene: Object3D | null) {
    scene?.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) m.dispose();
      }
    });
    for (const t of this.textures) t.dispose();
    this.textures = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.caster.dispose();
    this.shadowTarget?.dispose();
    this.solver = null;
  }
}

/** A loader for the skater: its meshes are meshopt-compressed (gltfpack). */
export const skaterLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

/** The skeleton at rest (world), and the soles of the shoes, from the loaded skater (its matrices up to date). */
export function restSkeleton(body: SkinnedMesh, shoes: SkinnedMesh): RestSkeleton {
  const bones = body.skeleton.bones;
  const index = new Map(bones.map((b, i) => [b as Object3D, i]));
  return {
    bones: bones.map((bone): RestBone => {
      const head = new Vector3(), quat = new Quaternion(), scale = new Vector3();
      bone.matrixWorld.decompose(head, quat, scale);
      return { name: bone.name, parent: bone.parent ? index.get(bone.parent) ?? -1 : -1, head, quat };
    }),
    soles: soleOf(shoes),
  };
}

/** Each shoe's sole, from the shoe mesh at rest: its middle underneath, and which way its toe points. */
function soleOf(shoes: SkinnedMesh): { L: Sole; R: Sole } {
  const position = shoes.geometry.getAttribute('position');
  const matrix = shoes.matrixWorld;
  const sole = (sign: number): Sole => {
    const points: Vector3[] = [];
    for (let i = 0; i < position.count; i++) {
      const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix);
      if (Math.sign(p.x) === sign) points.push(p);
    }
    // The long axis on the ground: the principal direction of the footprint.
    const mean = points.reduce((m, p) => m.add(p), new Vector3()).divideScalar(points.length);
    let xx = 0, xz = 0, zz = 0;
    for (const p of points) {
      const dx = p.x - mean.x, dz = p.z - mean.z;
      xx += dx * dx; xz += dx * dz; zz += dz * dz;
    }
    const angle = 0.5 * Math.atan2(2 * xz, zz - xx);
    const fwd = new Vector3(Math.sin(angle), 0, Math.cos(angle));
    if (fwd.z < 0) fwd.negate();
    const across = new Vector3(fwd.z, 0, -fwd.x);
    let lo = Infinity, hi = -Infinity, left = Infinity, right = -Infinity, floor = Infinity;
    for (const p of points) {
      const d = p.clone().sub(mean);
      lo = Math.min(lo, d.dot(fwd)); hi = Math.max(hi, d.dot(fwd));
      left = Math.min(left, d.dot(across)); right = Math.max(right, d.dot(across));
      floor = Math.min(floor, p.y);
    }
    const center = mean.clone().addScaledVector(fwd, (lo + hi) / 2).addScaledVector(across, (left + right) / 2);
    center.y = floor;
    return { center, fwd };
  };
  // MakeHuman's left is +x.
  return { L: sole(1), R: sole(-1) };
}
