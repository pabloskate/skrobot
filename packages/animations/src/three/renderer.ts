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
  Texture,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
  type Object3D,
  type ShaderMaterial,
} from 'three';
import { DEFAULT_SCENE_CAMERA, type SceneCamera, type TripodId } from '../camera/camera';
import { stageView, toThree, tracked, tripodView, type StageView } from '../camera/view';
import type { BoardLook, WheelSpin } from '../board/board';
import { Board3D } from '../board/board3d';
import { RealisticBoard3D } from '../board/realisticBoard3d';
import type { BoardRig, Rig } from '../motion/skeleton';
import { RealisticHuman3D } from '../riders/realistic/realisticHuman3d';
import type { Expression, RobotLook } from '../riders/look';
import { RealisticRobot3D } from '../riders/realisticRobot/realisticRobot3d';
import { Robot3D } from '../riders/robot/robot3d';
import type { Skater } from '../riders/skaters';
import { Bar3D } from '../sets/bar3d';
import type { StageSet } from '../sets/sets';
import { SET_PIECES } from './setPieces';
import { groundUnder, spotPlanFrom } from './spotPlan';
import { FOOT } from '../units';
import { SET_SCALE } from '../sets/setScale';
import type { GroundPolygon, StageFrame } from '../stage/stage';
import { rgb, shadowShapeMaterial } from './materials';
import { SCENE_FAR as FAR, SceneCamera3D, prepareReversedDepth, sceneNear } from './depth';
import { ScreenPass } from './screenPass';
import { RiderDaylight, type SpotShade } from './daylight';
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
  /** A moving panorama composed behind the antialiased foreground. */
  panorama?: { mesh: Mesh; waterInView: boolean; compose(foreground: Texture, time: number): void };
  /** Sun blockers in the moving landmark frame, shared with riders that receive scenery shadows. */
  riderShade?: SpotShade;
  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, shadowOpacity: [number, number, number], frame: StageFrame): void;
  /** Optional assets loading after the set is built; redraw frozen scenes when it finishes. */
  ready?: Promise<void>;
  /** The set's own camera for this frame (its tripods, or limits on the crane), or null for the stock crane. */
  view?(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null): StageView | null;
  /** The ground and what's built on it, in set units, for a plan of the spot (spotPlan.ts); none on a flat street. */
  terrain?(): readonly Mesh[];
  dispose(): void;
}

/** Each skater's body, and the board they ride. */
const RIDER_PIECES: Record<Skater, (look: RendererLook, quality: RenderQuality, light: RiderDaylight) => { rider: RiderPiece; board: BoardPiece }> = {
  robot: (look, quality) => ({ rider: new Robot3D(look.robot), board: quality === 'cinematic' ? new RealisticBoard3D() : new Board3D(look.board) }),
  'realistic-robot': (look, _quality, light) => ({ rider: new RealisticRobot3D(look.robot, light), board: new RealisticBoard3D(light) }),
  realistic: () => ({ rider: new RealisticHuman3D(), board: new RealisticBoard3D() }),
  alien: () => ({ rider: new RealisticHuman3D('alien'), board: new RealisticBoard3D() }),
};

/**
 * Draws StageFrames with WebGL: the set, the bar, the board, and the rider
 * in one depth-tested scene, so whatever is nearer the camera covers what is
 * behind it pixel by pixel — no paint order to get wrong when limbs cross,
 * the board flips past a foot, or the camera swings round.
 *
 * A renderer is built for a rider and their colors and keeps its WebGL
 * context, rider, board and passes for life. The set is swapped under them
 * (`stage`), since another spot needs only its own meshes and shaders; the
 * last couple of sets stay built, so going back to one costs nothing.
 *
 * Each frame runs five passes:
 *  1. cast shadows: the stage's ground silhouettes into their own target, blurred;
 *  2. the scene, writing color and each pixel's ink record;
 *  3. outlines: ink wherever a nearer part's outline reaches (post.ts);
 *  4. dust puffs, see-through, over the finished picture;
 *  5. FXAA to the canvas.
 */

/** A placed tripod's stock lens: the rider at the crane's size from this far, held just above the middle of the picture. */
const STAND_FRAME = 28 * FOOT;
const STAND_PLACE = 0.5;

/** Most dust puffs on stage at once (a pop and a landing). */
const MAX_PUFFS = 12;
/** Cast shadows are drawn at this share of the canvas's resolution and blurred anyway. */
const SHADOW_SCALE = 0.5;
/** Blur of the cast shadows, in viewBox units. */
const SHADOW_BLUR = 1.8;

/** Sets a renderer keeps built besides the one on stage, so going back to the last couple of spots is instant. */
const KEEP_SETS = 2;
/** A set left off stage that nobody asks for again is let go after this long. */
const SET_IDLE_MS = 30_000;
/** Longest a load waits for a set's own assets (its trees and cars) before showing it without them yet. */
const ASSETS_WAIT_MS = 2500;
/** Longest a load waits on the shader compiler before drawing anyway (the first frame then waits for it). */
const COMPILE_WAIT_MS = 6000;
/** How often a load asks whether the shaders are compiled. */
const COMPILE_POLL_MS = 4;
/** Longest a load's own work runs before it lets the page have a turn. */
const SLICE_MS = 6;

const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
/** Give the page a turn (input, a frame) and carry straight on, without the few milliseconds a timer adds each time. */
const breathe = () => new Promise<void>((resolve) => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => { port1.close(); resolve(); };
  port2.postMessage(null);
});

/** A set this renderer has built: on stage, just left it, or being loaded to go on. */
interface BuiltSet {
  piece: SetPiece;
  /** Its prop shadows, in the shadow scene while it is on stage. */
  shadows: Mesh | null;
  /** Loads still at work on it; it isn't let go meanwhile. */
  loading: number;
  idle: ReturnType<typeof setTimeout> | null;
}

export interface RendererLook {
  robot: RobotLook;
  board: BoardLook;
  /** Who rides; the robot when omitted. */
  skater?: Skater;
}

export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  /** What it draws on; a stage puts it in the page while it borrows the renderer. */
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera: SceneCamera3D;
  private readonly rider: RiderPiece;
  private readonly board: BoardPiece;
  private readonly bar = new Bar3D();
  private readonly daylight = new RiderDaylight();
  /** The set on stage; none until the first `stage`. */
  private set: SetPiece | null = null;
  private setId: StageSet | null = null;
  private foreground: Texture | null = null;
  private panoramaTime = 0;
  /** Every set this renderer has built, the longest unused first. */
  private readonly sets = new Map<StageSet, BuiltSet>();
  /** Its rider and passes have been compiled, by a first frame or a load. */
  private warm = false;
  private disposed = false;
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

  /** `set` goes on stage at once; null leaves the stage empty until `stage` (after a `load`, to build it off the click). */
  constructor(canvas: HTMLCanvasElement, look: RendererLook, set: StageSet | null = 'plaza', private readonly quality: RenderQuality = 'standard') {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance', reversedDepthBuffer: true });
    this.camera = new SceneCamera3D(this.renderer.capabilities.reversedDepthBuffer);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;

    ({ rider: this.rider, board: this.board } = RIDER_PIECES[look.skater ?? 'robot'](look, quality, this.daylight));
    this.scene.add(this.bar.group, this.board.group, this.rider.group);
    this.contact = quality === 'cinematic' ? cinematicContactMaterial() : null;
    this.contactQuad = this.contact ? new ScreenPass(this.contact) : null;
    if (quality === 'cinematic') prepareCinematicSurfaces(this.scene);
    // Three r185 reverses the entire render list, including explicit ordering,
    // and complements Always/Equal depth tests. Preserve the scene's intended
    // sky-first order and the ink pass's unconditional depth copy. Each set
    // gets the same once, as it is built.
    if (this.renderer.capabilities.reversedDepthBuffer) prepareReversedDepth([this.scene], [this.ink]);

    this.shadowGeometry.setAttribute('position', new Float32BufferAttribute([], 3));
    this.shadowGeometry.setAttribute('channel', new Float32BufferAttribute([], 4));
    const shadows = new Mesh(this.shadowGeometry, this.propShadowMaterial);
    shadows.frustumCulled = false;
    this.shadowScene.add(shadows, this.propShadows);

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
    if (set) this.stage(set);
  }

  /** Resolves once the rider's and the staged set's own assets (models, textures) are decoded: redraw a still scene then. */
  get ready(): Promise<void> {
    const ready = Promise.all([this.rider.ready, this.set?.ready]).then(() => {});
    // Some riders and props install decoded materials asynchronously.
    return this.quality === 'cinematic' ? ready.then(() => { prepareCinematicSurfaces(this.scene); }) : ready;
  }

  /** Whether `set` is built here already, so staging it takes no time. */
  has(set: StageSet): boolean {
    return this.sets.has(set);
  }

  /**
   * Put `set` on stage in place of the one there. One this renderer hasn't
   * built is built on the spot, which stalls the page for a moment; `load`
   * it first to spread that out.
   */
  stage(set: StageSet) {
    if (set === this.setId) return;
    this.foreground = null;
    const next = this.built(set);
    const last = this.setId == null ? undefined : this.sets.get(this.setId);
    if (last) {
      this.scene.remove(last.piece.group);
      this.overlayScene.remove(last.piece.overlay);
      if (last.shadows) this.propShadows.remove(last.shadows);
      this.rest(this.setId!, last);
    }
    if (next.idle != null) clearTimeout(next.idle);
    next.idle = null;
    // The most recently staged goes last, so the longest unused is let go first.
    this.sets.delete(set);
    this.sets.set(set, next);
    this.scene.add(next.piece.group);
    this.overlayScene.add(next.piece.overlay);
    if (next.shadows) this.propShadows.add(next.shadows);
    this.set = next.piece;
    this.daylight.setSpot(next.piece.riderShade);
    this.setId = set;
    this.trim();
  }

  /**
   * Get `set` ready to go on stage without freezing the page: built (the one
   * step that can't be split), its own assets decoded and uploaded, and its
   * shaders compiled in the background where the browser can. A renderer
   * that has never drawn readies its rider and passes the same way. After
   * it resolves, `stage(set)` and the frame that follows are quick.
   */
  async load(set: StageSet): Promise<void> {
    const entry = this.built(set);
    entry.loading++;
    try {
      const fresh = !this.warm;
      // The shaders the set was built with compile while its models and textures decode.
      const assets = Promise.race([Promise.all([this.rider.ready, entry.piece.ready]), pause(ASSETS_WAIT_MS)]);
      await Promise.all([this.compile(entry.piece), assets]);
      if (this.disposed) return;
      await this.upload([entry.piece.group, entry.piece.overlay, ...(entry.piece.panorama ? [entry.piece.panorama.mesh] : []), ...(fresh ? [this.scene] : [])]);
      if (this.disposed) return;
      // And then whatever those assets brought with them.
      await this.compile(entry.piece, fresh);
    } finally {
      entry.loading--;
      if (!this.disposed) {
        // Loaded for a stage that may have moved on by now.
        if (set !== this.setId) this.rest(set, entry);
        this.trim();
      }
    }
  }

  /** `set` built, from this renderer's own or new. */
  private built(set: StageSet): BuiltSet {
    let entry = this.sets.get(set);
    if (entry) return entry;
    const piece = SET_PIECES[set]();
    let shadows: Mesh | null = null;
    if (piece.shadowGeometry) {
      shadows = new Mesh(piece.shadowGeometry, this.propShadowMaterial);
      // Laid out in the set's units, as its scenery is.
      shadows.scale.setScalar(SET_SCALE);
      shadows.frustumCulled = false;
    }
    if (this.quality === 'cinematic') prepareCinematicSurfaces(piece.group);
    if (this.renderer.capabilities.reversedDepthBuffer) prepareReversedDepth([piece.group, piece.overlay], []);
    entry = { piece, shadows, loading: 0, idle: null };
    this.sets.set(set, entry);
    return entry;
  }

  /** Start the wait after which a set that's off stage is let go. */
  private rest(set: StageSet, entry: BuiltSet) {
    if (entry.idle != null) clearTimeout(entry.idle);
    entry.idle = setTimeout(() => { entry.idle = null; this.release(set); }, SET_IDLE_MS);
  }

  /** Let a set go, unless it's on stage or a load is still at work on it. */
  private release(set: StageSet) {
    const entry = this.sets.get(set);
    if (!entry || set === this.setId || entry.loading > 0) return;
    if (entry.idle != null) clearTimeout(entry.idle);
    this.sets.delete(set);
    entry.piece.dispose();
  }

  /** Keep only the last few sets off stage. */
  private trim() {
    const spare = [...this.sets].filter(([set, entry]) => set !== this.setId && entry.loading === 0).map(([set]) => set);
    for (const set of spare.slice(0, Math.max(0, spare.length - KEEP_SETS))) this.release(set);
  }

  /** Send decoded textures to the GPU one at a time, the page breathing between them, rather than all in the first frame. */
  private async upload(roots: Object3D[]) {
    const textures = new Set<Texture>();
    for (const root of roots) {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const uniform of Object.values((material as ShaderMaterial).uniforms ?? {})) {
            const value: unknown = uniform.value;
            if (value instanceof Texture && value.image && !value.isRenderTargetTexture && !(value instanceof DepthTexture)) textures.add(value);
          }
        }
      });
    }
    let since = performance.now();
    for (const texture of textures) {
      if (this.disposed) return;
      if ((this.renderer.properties.get(texture) as { __webglTexture?: unknown }).__webglTexture) continue;
      this.renderer.initTexture(texture);
      if (performance.now() - since < SLICE_MS) continue;
      await breathe();
      since = performance.now();
    }
  }

  /**
   * Hand the shaders `piece` needs to the compiler and wait for them without
   * blocking, where the browser compiles off the page's thread
   * (KHR_parallel_shader_compile). Elsewhere this returns at once and the
   * first frame compiles them, as it always did. A program depends on the
   * target it draws into, so each is compiled for the pass that uses it.
   */
  private async compile(piece: SetPiece, rider = !this.warm) {
    const r = this.renderer;
    const waiting = new Set<Material>();
    const start = (root: Object3D, target: WebGLRenderTarget | null, into?: Scene) => {
      r.setRenderTarget(target);
      for (const material of r.compile(root, this.camera, into)) waiting.add(material);
    };
    start(piece.group, this.main, this.scene);
    start(piece.overlay, this.composite, this.overlayScene);
    if (piece.panorama) start(piece.panorama.mesh, null);
    if (rider) start(this.scene, this.main);
    if (!this.warm) {
      start(this.shadowScene, this.shadowA);
      start(this.dustScene, this.composite);
      const passes: Array<[ScreenPass | null, WebGLRenderTarget | null]> = [
        [this.blurQuad, this.shadowB], [this.edgeQuad, this.edges], [this.inkQuad, this.post],
        [this.copyQuad, this.composite], [this.contactQuad, this.post], [this.fxaaQuad, null],
      ];
      for (const [pass, target] of passes) {
        if (!pass) continue;
        r.setRenderTarget(target);
        waiting.add(pass.compile(r));
      }
      this.warm = true;
    }
    r.setRenderTarget(null);
    const compiling = () => [...waiting].some((material) => {
      const program = (r.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram;
      return program != null && !program.isReady();
    });
    const until = performance.now() + COMPILE_WAIT_MS;
    while (!this.disposed && performance.now() < until && compiling()) await pause(COMPILE_POLL_MS);
  }

  /** Match the canvas to its CSS size at `ratio` device pixels per CSS pixel. */
  setSize(width: number, height: number, ratio: number) {
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (w === Math.round(this.size.width) && h === Math.round(this.size.height) && ratio === this.size.ratio) return;
    this.foreground = null;
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
  render(frame: StageFrame, camera: Readonly<SceneCamera> = DEFAULT_SCENE_CAMERA, zoom = 1, tripod?: TripodId | null, waterTime = frame.t) {
    const set = this.set;
    if (!set) return;
    this.warm = true;
    const { width, height } = this.size;
    const aspect = width / height;
    const crane = tracked(camera, frame);
    const view = this.standView(frame, camera, zoom, aspect)
      ?? set.view?.(frame, crane, zoom, aspect, tripod ?? null) ?? stageView(frame.lift, crane, zoom, aspect);
    this.placeCamera(view);
    const pxPerUnit = height / view.box.height;
    const shadowOpacity: [number, number, number] = [0.3, frame.shadows.boardOpacity, frame.shadows.bodyOpacity];

    this.rider.update(frame.rig, frame.expression, view, frame);
    this.board.update(frame.rig.board, frame.wheels, view);
    this.bar.update(frame.span, this.setId === 'waterfront');
    this.writeShadows(frame);
    set.update(view, frame.scroll, { width, height }, this.shadowA.texture, shadowOpacity, frame);
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
    ink.uPropInk.value.set(...rgb(set.propInk));
    r.setRenderTarget(this.post);
    this.inkQuad.render(r);

    // 4. See-through parts — the set's, then dust — behind whatever is in front of them.
    // A separate target avoids sampling a depth texture attached to the active framebuffer.
    r.setRenderTarget(this.composite);
    this.copy.uniforms.uSource.value = this.post.texture;
    this.copyQuad.render(r);
    for (const m of [...set.overlayMaterials, this.dust]) {
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
    // Once the rider has stopped, only the bay needs to be redrawn. Reuse the now-free
    // render target to retain the finished, premultiplied foreground for those draws.
    const finished = set.panorama ? (this.contact ? this.composite : this.post) : null;
    r.setRenderTarget(finished);
    this.fxaaQuad.render(r);
    if (finished) {
      this.foreground = finished.texture;
      this.presentPanorama(waterTime);
    }
  }

  /** Advance the water without posing the skater or repeating shadows, outlines and FXAA. */
  animateWater(time: number) {
    // Active trick frames already draw water on the live clock between ambient ticks.
    if (this.set?.panorama?.waterInView && Math.abs(time - this.panoramaTime) >= 1 / 32) this.presentPanorama(time);
  }

  private presentPanorama(time: number) {
    const panorama = this.set?.panorama;
    if (!this.foreground || !panorama || this.disposed) return;
    this.panoramaTime = time;
    panorama.compose(this.foreground, time);
    this.renderer.setRenderTarget(null);
    this.renderer.render(panorama.mesh, this.camera);
  }

  /**
   * Filmed from a tripod the viewer stood somewhere in the spot
   * (`camera.stand`): on whatever is under it there, turned to the rider as
   * the set slides under them. Null without one, or on a flat street.
   */
  private standView(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number): StageView | null {
    const { stand } = camera;
    if (!stand || !frame.stairs || !this.set || !this.setId) return null;
    const plan = spotPlanFrom(this.setId, this.set.terrain?.bind(this.set));
    const ground = plan ? groundUnder(plan, stand.u, stand.z) : 0;
    const eye: [number, number, number] = [stand.u - frame.scroll, ground + stand.height, stand.z - frame.stairs.across];
    return tripodView(eye, frame.lift, stand.frame ?? STAND_FRAME, STAND_PLACE, zoom, aspect, camera.pan);
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
    this.disposed = true;
    this.rider.dispose();
    this.board.dispose();
    this.bar.dispose();
    for (const entry of this.sets.values()) {
      if (entry.idle != null) clearTimeout(entry.idle);
      entry.piece.dispose();
    }
    this.sets.clear();
    this.set = null;
    this.setId = null;
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
