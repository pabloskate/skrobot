import {
  BufferGeometry,
  DepthTexture,
  FloatType,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
  type ShaderMaterial,
  type Texture,
} from 'three';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import { stageView, toThree, tracked, type StageView } from '../camera/view';
import type { BoardLook, WheelSpin } from '../board/board';
import { Board3D } from '../board/board3d';
import { RealisticBoard3D } from '../board/realisticBoard3d';
import type { BoardRig, Rig } from '../motion/skeleton';
import { RealisticHuman3D } from '../riders/realistic/realisticHuman3d';
import type { Expression, RobotLook } from '../riders/look';
import { Robot3D } from '../riders/robot/robot3d';
import type { Skater } from '../riders/skaters';
import { Bar3D } from '../sets/bar3d';
import { ElToro3D } from '../sets/elToro/elToro3d';
import { Hollywood3D } from '../sets/hollywood/hollywood3d';
import { Wallenberg3D } from '../sets/wallenberg/wallenberg3d';
import { Sunset3D } from '../sets/sunset/sunset3d';
import { Lyon3D } from '../sets/lyon/lyon3d';
import { LeapOfFaith3D } from '../sets/leapOfFaith/leapOfFaith3d';
import { Miami3D } from '../sets/miami/miami3d';
import { Plaza3D } from '../sets/plaza3d';
import { setInfo, type StageSet } from '../sets/sets';
import { Waterfront3D } from '../sets/waterfront/waterfront3d';
import type { GroundPolygon, StageFrame } from '../stage/stage';
import { rgb, shadowShapeMaterial } from './materials';
import { SCENE_FAR as FAR, SceneCamera3D, prepareReversedDepth, sceneNear } from './depth';
import { ScreenPass } from './screenPass';
import { cinematicContactMaterial, prepareCinematicSurfaces, type RenderQuality } from './cinematic';
import { blurMaterial, copyMaterial, dustMaterial, EDGE_TILE, edgeMaterial, fxaaMaterial, inkMaterial, shadowChannel } from './post';

/** A rider's meshes, posed from the rig every frame. */
export interface RiderPiece {
  group: Group;
  /** Optional local model/texture decoding; redraw frozen scenes when it finishes. */
  ready?: Promise<void>;
  /** `frame` is the whole stage frame, for riders that need more than the rig (the ground under a slam). */
  update(rig: Rig, expression: Expression, view: StageView, frame?: StageFrame): void;
  /** Optional work on the GPU before the scene pass, after `update` (the realistic skater's own shadow). */
  prepare?(renderer: WebGLRenderer): void;
  dispose(): void;
}

/** A board's meshes, posed from the rig's board every frame. */
export interface BoardPiece {
  group: Group;
  update(board: BoardRig, spin: WheelSpin, view: StageView): void;
  dispose(): void;
}

/** A set the renderer stages the rider on. */
export interface SetPiece {
  /** Drawn in the scene pass. */
  group: Group;
  /** See-through parts drawn after the outlines, hidden by hand behind nearer things. */
  overlay: Group;
  overlayMaterials: ShaderMaterial[];
  /** Prop shadows in street coordinates (shadow channel 4), slid with the street; null for none. */
  shadowGeometry: BufferGeometry | null;
  propInk: string;
  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number], frame: StageFrame): void;
  /** Optional assets loading after the set is built; redraw frozen scenes when it finishes. */
  ready?: Promise<void>;
  /** The set's own camera for this frame (its tripods, or limits on the crane), or null for the stock crane. */
  view?(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null): StageView | null;
  dispose(): void;
}

/** Each set's scenery. Its rules (stairs, a handrail, tripods) are in sets/sets.ts. */
const SET_PIECES: Record<StageSet, () => SetPiece> = {
  plaza: () => new Plaza3D(),
  waterfront: () => new Waterfront3D(),
  'el-toro': () => new ElToro3D(),
  'hollywood-high': () => new Hollywood3D(),
  wallenberg: () => new Wallenberg3D(),
  'sunset-car-wash': () => new Sunset3D(),
  'lyon-25': () => new Lyon3D(),
  'leap-of-faith': () => new LeapOfFaith3D(),
  'miami-triangle': () => new Miami3D(),
};

/** Each skater's body, and the board they ride. */
const RIDER_PIECES: Record<Skater, (look: RendererLook, quality: RenderQuality) => { rider: RiderPiece; board: BoardPiece }> = {
  robot: (look, quality) => ({ rider: new Robot3D(look.robot), board: quality === 'cinematic' ? new RealisticBoard3D() : new Board3D(look.board) }),
  realistic: () => ({ rider: new RealisticHuman3D(), board: new RealisticBoard3D() }),
  alien: () => ({ rider: new RealisticHuman3D('alien'), board: new RealisticBoard3D() }),
};

/**
 * Draws StageFrames with WebGL: the set, the bar, the board, and the rider
 * in one depth-tested scene, so whatever is nearer the camera covers what is
 * behind it pixel by pixel — no paint order to get wrong when limbs cross,
 * the board flips past a foot, or the camera swings round.
 *
 * Each frame runs five passes:
 *  1. cast shadows: the stage's ground silhouettes into their own target, blurred;
 *  2. the scene, writing color and each pixel's ink record;
 *  3. outlines: ink wherever a nearer part's outline reaches (post.ts);
 *  4. dust puffs, see-through, over the finished picture;
 *  5. FXAA to the canvas.
 */

/** Most dust puffs on stage at once (a pop and a landing). */
const MAX_PUFFS = 12;
/** Cast shadows are drawn at this share of the canvas's resolution and blurred anyway. */
const SHADOW_SCALE = 0.5;
/** Blur of the cast shadows, in viewBox units. */
const SHADOW_BLUR = 1.8;

export interface RendererLook {
  robot: RobotLook;
  board: BoardLook;
  /** Who rides; the robot when omitted. */
  skater?: Skater;
}

export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly ready: Promise<void>;
  /** What it draws on; a stage puts it in the page while it borrows the renderer. */
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera: SceneCamera3D;
  private readonly rider: RiderPiece;
  private readonly board: BoardPiece;
  private readonly bar = new Bar3D();
  private readonly set: SetPiece;
  /** The waterfront's far panorama is under the canvas, so its sky stays see-through. */
  private readonly setLight: boolean;
  private readonly propShadowMaterial = shadowShapeMaterial();
  private readonly overlayScene = new Scene();
  private readonly propShadows = new Group();

  private readonly shadowScene = new Scene();
  private readonly shadowGeometry = new BufferGeometry();
  private readonly dustScene = new Scene();
  private readonly dustGeometry = new InstancedBufferGeometry();
  private readonly dust = dustMaterial();

  private readonly main: WebGLRenderTarget;
  private readonly post: WebGLRenderTarget;
  private readonly composite: WebGLRenderTarget;
  private readonly copy = copyMaterial();
  private readonly copyQuad: ScreenPass;
  private readonly edges: WebGLRenderTarget;
  private readonly edge = edgeMaterial();
  private readonly edgeQuad: ScreenPass;
  private readonly shadowA: WebGLRenderTarget;
  private readonly shadowB: WebGLRenderTarget;
  private readonly ink = inkMaterial();
  private readonly blur = blurMaterial();
  private readonly fxaa = fxaaMaterial();
  private readonly inkQuad: ScreenPass;
  private readonly blurQuad: ScreenPass;
  private readonly fxaaQuad: ScreenPass;
  private readonly contact: ShaderMaterial | null;
  private readonly contactQuad: ScreenPass | null;
  private size = { width: 1, height: 1, ratio: 1 };

  constructor(canvas: HTMLCanvasElement, look: RendererLook, set: StageSet = 'plaza', quality: RenderQuality = 'standard') {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', reversedDepthBuffer: true });
    this.camera = new SceneCamera3D(this.renderer.capabilities.reversedDepthBuffer);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    ({ rider: this.rider, board: this.board } = RIDER_PIECES[look.skater ?? 'robot'](look, quality));
    this.set = SET_PIECES[set]();
    this.ready = Promise.all([this.rider.ready, this.set.ready]).then(() => {});
    this.setLight = setInfo(set).farPanorama;
    this.scene.add(this.set.group, this.bar.group, this.board.group, this.rider.group);
    this.overlayScene.add(this.set.overlay);
    this.contact = quality === 'cinematic' ? cinematicContactMaterial() : null;
    this.contactQuad = this.contact ? new ScreenPass(this.contact) : null;
    if (quality === 'cinematic') {
      prepareCinematicSurfaces(this.scene);
      // Some riders install decoded materials asynchronously.
      this.ready = this.ready.then(() => { prepareCinematicSurfaces(this.scene); });
    }
    // Three r185 reverses the entire render list, including explicit ordering,
    // and complements Always/Equal depth tests. Preserve the scene's intended
    // sky-first order and the ink pass's unconditional depth copy.
    if (this.renderer.capabilities.reversedDepthBuffer) {
      prepareReversedDepth([this.scene, this.overlayScene], [this.ink]);
    }

    this.shadowGeometry.setAttribute('position', new Float32BufferAttribute([], 3));
    this.shadowGeometry.setAttribute('channel', new Float32BufferAttribute([], 4));
    const shadows = new Mesh(this.shadowGeometry, this.propShadowMaterial);
    shadows.frustumCulled = false;
    this.shadowScene.add(shadows, this.propShadows);
    if (this.set.shadowGeometry) {
      const props = new Mesh(this.set.shadowGeometry, this.propShadowMaterial);
      props.frustumCulled = false;
      this.propShadows.add(props);
    }

    const quad = new PlaneGeometry(2, 2);
    this.dustGeometry.index = quad.index;
    this.dustGeometry.setAttribute('position', quad.getAttribute('position'));
    this.dustGeometry.setAttribute('aPuff', new InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4));
    this.dustGeometry.setAttribute('aOpacity', new InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1));
    this.dustGeometry.instanceCount = 0;
    const dust = new Mesh(this.dustGeometry, this.dust);
    dust.frustumCulled = false;
    this.dustScene.add(dust);

    this.main = new WebGLRenderTarget(1, 1, { count: 2, depthBuffer: true, minFilter: NearestFilter, magFilter: NearestFilter });
    this.main.depthTexture = new DepthTexture(1, 1, FloatType);
    this.post = new WebGLRenderTarget(1, 1, { depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter });
    this.post.depthTexture = new DepthTexture(1, 1, FloatType);
    this.composite = new WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.edges = new WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter });
    const shadowOptions = { depthBuffer: false, type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter };
    this.shadowA = new WebGLRenderTarget(1, 1, shadowOptions);
    this.shadowB = new WebGLRenderTarget(1, 1, shadowOptions);
    for (const texture of this.main.textures) {
      texture.type = UnsignedByteType;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
    }

    this.inkQuad = new ScreenPass(this.ink);
    this.copyQuad = new ScreenPass(this.copy);
    this.edgeQuad = new ScreenPass(this.edge);
    this.blurQuad = new ScreenPass(this.blur);
    this.fxaaQuad = new ScreenPass(this.fxaa);
  }

  /** Match the canvas to its CSS size at `ratio` device pixels per CSS pixel. */
  setSize(width: number, height: number, ratio: number) {
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (w === Math.round(this.size.width) && h === Math.round(this.size.height) && ratio === this.size.ratio) return;
    this.size = { width: w, height: h, ratio };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.main.setSize(w, h);
    this.post.setSize(w, h);
    this.composite.setSize(w, h);
    this.edges.setSize(Math.ceil(w / EDGE_TILE), Math.ceil(h / EDGE_TILE));
    const sw = Math.max(1, Math.round(w * SHADOW_SCALE));
    const sh = Math.max(1, Math.round(h * SHADOW_SCALE));
    this.shadowA.setSize(sw, sh);
    this.shadowB.setSize(sw, sh);
  }

  /** Draw a frame through the crane at `camera`, or from `tripod` where the set has one. */
  render(frame: StageFrame, camera: Readonly<SceneCamera> = DEFAULT_SCENE_CAMERA, zoom = 1, tripod?: TripodId | null) {
    const { width, height } = this.size;
    const aspect = width / height;
    const crane = tracked(camera, frame);
    const view = this.set.view?.(frame, crane, zoom, aspect, tripod ?? null) ?? stageView(frame.lift, crane, zoom, aspect);
    this.placeCamera(view);
    const pxPerUnit = height / view.box.height;
    const shadowOpacity: [number, number, number] = [0.3, frame.shadows.boardOpacity, frame.shadows.bodyOpacity];

    this.rider.update(frame.rig, frame.expression, view, frame);
    this.board.update(frame.rig.board, frame.wheels, view);
    this.bar.update(frame.span);
    this.writeShadows(frame);
    this.set.update(view, frame.scroll, { width, height }, this.shadowA.texture, shadowOpacity, frame);
    this.propShadows.position.x = -frame.scroll;
    this.writeDust(frame);

    const r = this.renderer;
    this.rider.prepare?.(r);
    // 1. Cast shadows, then a two-way blur.
    r.setRenderTarget(this.shadowA);
    r.clear(true, false, false);
    r.render(this.shadowScene, this.camera);
    const sigma = SHADOW_BLUR * pxPerUnit * SHADOW_SCALE;
    this.blurInto(this.shadowA, this.shadowB, 1, 0, sigma);
    this.blurInto(this.shadowB, this.shadowA, 0, 1, sigma);

    // 2. The scene.
    r.setRenderTarget(this.main);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);

    // 3. Outlines: find the tiles where parts meet, then ink around them.
    const focalPx = view.focal * pxPerUnit;
    const edge = this.edge.uniforms;
    edge.uInfo.value = this.main.textures[1];
    edge.uDepth.value = this.main.depthTexture;
    edge.uSize.value = [width, height];
    edge.uFocalPx.value = focalPx;
    edge.uNear.value = this.camera.near;
    edge.uFar.value = FAR;
    r.setRenderTarget(this.edges);
    this.edgeQuad.render(r);
    const ink = this.ink.uniforms;
    ink.uEdges.value = this.edges.texture;
    ink.uColor.value = this.main.textures[0];
    ink.uInfo.value = this.main.textures[1];
    ink.uDepth.value = this.main.depthTexture;
    ink.uTexel.value.set(1 / width, 1 / height);
    ink.uFocalPx.value = focalPx;
    ink.uNear.value = this.camera.near;
    ink.uFar.value = FAR;
    ink.uPropInk.value.set(...rgb(this.set.propInk));
    ink.uOverlays.value = this.setLight ? 1 : 0;
    ink.uBox.value.set(view.box.x, view.box.y, view.box.width, view.box.height);
    ink.uRes.value.set(width, height);
    ink.uHorizon.value = view.cam.horizonY;
    r.setRenderTarget(this.post);
    this.inkQuad.render(r);

    // 4. See-through parts — the set's, then dust — behind whatever is in front of them.
    // A separate target avoids sampling a depth texture attached to the active framebuffer.
    r.setRenderTarget(this.composite);
    this.copy.uniforms.uSource.value = this.post.texture;
    this.copyQuad.render(r);
    for (const m of [...this.set.overlayMaterials, this.dust]) {
      m.uniforms.uDepth.value = this.post.depthTexture;
      m.uniforms.uRes.value.set(width, height);
      m.uniforms.uNear.value = this.camera.near;
      m.uniforms.uFar.value = FAR;
    }
    r.render(this.overlayScene, this.camera);
    if (this.dustGeometry.instanceCount > 0) r.render(this.dustScene, this.camera);

    // 5. Antialias onto the canvas.
    if (this.contact && this.contactQuad) {
      const u = this.contact.uniforms;
      u.uSource.value = this.composite.texture;
      u.uDepth.value = this.main.depthTexture;
      u.uTexel.value.set(1 / width, 1 / height);
      u.uNear.value = this.camera.near;
      u.uFar.value = FAR;
      u.uFocalPx.value = focalPx;
      r.setRenderTarget(this.post);
      this.contactQuad.render(r);
    }
    this.fxaa.uniforms.tDiffuse.value = this.contact ? this.post.texture : this.composite.texture;
    this.fxaa.uniforms.resolution.value.set(1 / width, 1 / height);
    r.setRenderTarget(null);
    this.fxaaQuad.render(r);
  }

  private placeCamera(view: StageView) {
    const { eye, right, up, back, frustum } = view;
    this.camera.matrixWorld.set(
      right[0], up[0], back[0], eye[0],
      right[1], up[1], back[1], eye[1],
      right[2], up[2], back[2], eye[2],
      0, 0, 0, 1,
    );
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.camera.setFrustum(frustum, sceneNear(view.distance, this.camera.reversedDepth));
  }

  private blurInto(from: WebGLRenderTarget, to: WebGLRenderTarget, dx: number, dy: number, sigma: number) {
    const u = this.blur.uniforms;
    u.uSource.value = from.texture;
    u.uStep.value.set(dx / from.width, dy / from.height);
    u.uSigma.value = sigma;
    this.renderer.setRenderTarget(to);
    this.blurQuad.render(this.renderer);
  }

  private writeShadows(frame: StageFrame) {
    const position: number[] = [];
    const channel: number[] = [];
    // On the asphalt, or down a stair set at the level of the step they fall on.
    const level = frame.stairs?.shadowY ?? 0;
    const add = (polygon: GroundPolygon, c: readonly number[]) => {
      if (polygon.length < 3) return;
      const at = (i: number) => toThree({ x: polygon[i].x, y: 0, z: polygon[i].z });
      const first = at(0);
      for (let i = 1; i < polygon.length - 1; i++) {
        for (const p of [first, at(i), at(i + 1)]) {
          // Laid at the shadows' level, whatever toThree made of the physics y.
          position.push(p[0], level, p[2]);
          channel.push(...c);
        }
      }
    };
    for (const polygon of frame.shadows.bar) add(polygon, shadowChannel.bar);
    add(frame.shadows.board, shadowChannel.board);
    for (const polygon of frame.shadows.body) add(polygon, shadowChannel.body);
    // Contact shadows go in the board's channel, darker than its cast shadow (max blending keeps the darkest).
    for (const { polygon, dark } of frame.shadows.contact ?? []) add(polygon, shadowChannel.board.map((c) => c * dark));
    this.shadowGeometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    this.shadowGeometry.setAttribute('channel', new Float32BufferAttribute(channel, 4));
  }

  private writeDust(frame: StageFrame) {
    const puff = this.dustGeometry.getAttribute('aPuff') as InstancedBufferAttribute;
    const opacity = this.dustGeometry.getAttribute('aOpacity') as InstancedBufferAttribute;
    const count = Math.min(MAX_PUFFS, frame.dust.length);
    for (let i = 0; i < count; i++) {
      const d = frame.dust[i];
      const [x, y, z] = toThree(d.center);
      puff.setXYZW(i, x, y, z, d.radius);
      opacity.setX(i, d.opacity);
    }
    puff.needsUpdate = true;
    opacity.needsUpdate = true;
    this.dustGeometry.instanceCount = count;
  }

  dispose() {
    this.rider.dispose();
    this.board.dispose();
    this.bar.dispose();
    this.set.dispose();
    this.shadowGeometry.dispose();
    this.dustGeometry.dispose();
    for (const m of [this.ink, this.edge, this.blur, this.fxaa, this.dust, this.copy, this.propShadowMaterial] as ShaderMaterial[]) m.dispose();
    for (const q of [this.inkQuad, this.edgeQuad, this.blurQuad, this.fxaaQuad, this.copyQuad]) q.dispose();
    for (const t of [this.main, this.post, this.composite, this.edges, this.shadowA, this.shadowB]) t.dispose();
    this.contact?.dispose();
    this.contactQuad?.dispose();
    this.renderer.dispose();
    // Let the context go now rather than at garbage collection: browsers cap
    // live contexts, and the one they drop first may be a stage still on screen.
    this.renderer.forceContextLoss();
  }
}
