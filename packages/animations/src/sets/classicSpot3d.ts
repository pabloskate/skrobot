import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3, Vector4, type Texture } from 'three';
import type { SceneCamera, TripodId } from '../camera/camera';
import { stageView, tripodView, type StageView, type Vec3 } from '../camera/view';
import type { StageFrame } from '../stage/stage';
import { elToroPropMaterial, elToroSkyMaterial } from './elToro/elToroMaterials';
import { StreetProps, type StreetPropPlacements } from './props/streetProps';

export interface SpotTripod { u: number; z: number; height: number; frame: number; place: number }
export interface ClassicSpotConfig {
  build: () => {
    ground: BufferGeometry; props: BufferGeometry;
    railSegments?: Array<{ a: Vec3; b: Vec3; radius: number }>;
    shadowBoxes?: Array<{ min: Vec3; max: Vec3 }>;
  };
  laneZ: number;
  ground: (x: number) => number;
  grade: number;
  run: number;
  drop: number;
  /** Base framing, before the viewer's zoom; wide enough for a pitched bank landing. */
  framing?: number;
  /** Camera corridor in the spot's coordinates, independent of the rider's line. */
  cameraZ?: [number, number];
  tripods?: Readonly<Record<TripodId, SpotTripod>>;
  /** Realistic trees and parked cars, loaded after the set (props/streetProps.ts). */
  streetProps?: StreetPropPlacements;
}

/** Weathered baked surfaces receive the rider's projected shadow on their actual height. */
function groundMaterial() {
  const material = elToroPropMaterial();
  Object.assign(material.uniforms, {
    uShadow: { value: null }, uShadowY: { value: 0 },
    uShadowOpacity: { value: new Vector3() },
    uRailCount: { value: 0 }, uBoxCount: { value: 0 },
    uRailA: { value: Array.from({ length: 48 }, () => new Vector4()) },
    uRailB: { value: Array.from({ length: 48 }, () => new Vector4()) },
    uBoxMin: { value: Array.from({ length: 12 }, () => new Vector3()) },
    uBoxMax: { value: Array.from({ length: 12 }, () => new Vector3()) },
  });
  material.fragmentShader = material.fragmentShader.replace('void main() {', /* glsl */ `
    uniform sampler2D uShadow;
    uniform float uShadowY;
    uniform vec3 uShadowOpacity;
    uniform mat4 projectionMatrix;
    uniform int uRailCount;
    uniform int uBoxCount;
    uniform vec4 uRailA[48];
    uniform vec4 uRailB[48];
    uniform vec3 uBoxMin[12];
    uniform vec3 uBoxMax[12];
    float sceneryShadow(vec3 p) {
      float shade = 0.0;
      for (int i = 0; i < 12; i++) {
        if (i >= uBoxCount) break;
        vec3 a = (uBoxMin[i] - p) / SUN, b = (uBoxMax[i] - p) / SUN;
        vec3 near_ = min(a, b), far_ = max(a, b);
        float enter = max(max(near_.x, near_.y), near_.z);
        float leave = min(min(far_.x, far_.y), far_.z);
        if (leave > max(enter, 0.5)) shade = 0.32;
      }
      for (int i = 0; i < 48; i++) {
        if (i >= uRailCount) break;
        vec3 a = uRailA[i].xyz, seg = uRailB[i].xyz - a;
        float len2 = max(dot(seg, seg), 0.001);
        float t = clamp(dot(p - a, seg) / len2, 0.0, 1.0);
        float s = max(0.0, dot(a + t * seg - p, SUN));
        t = clamp(dot(p + s * SUN - a, seg) / len2, 0.0, 1.0);
        s = max(0.0, dot(a + t * seg - p, SUN));
        float d = length(p + s * SUN - a - t * seg);
        float soft = 0.6 + 0.012 * s;
        if (s > 0.0) shade = max(shade, 0.3 * (1.0 - smoothstep(uRailA[i].w - soft, uRailA[i].w + soft, d)));
      }
      return shade * smoothstep(-0.05, 0.25, dot(normalize(vNormal), SUN));
    }
    vec3 surfaceShadow() {
      vec3 at = vWorld + ((uShadowY - vWorld.y) / SUN.y) * SUN;
      vec4 clip = projectionMatrix * viewMatrix * vec4(at, 1.0);
      if (clip.w <= 0.0) return vec3(0.0);
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec3(0.0);
      return texture(uShadow, uv).rgb;
    }
    void main() {
  `).replace('float haze =', /* glsl */ `
    vec3 s = surfaceShadow();
    float shade = 1.0 - (1.0 - sceneryShadow(vLocal)) * (1.0 - uShadowOpacity.x * s.x) * (1.0 - uShadowOpacity.y * s.y) * (1.0 - uShadowOpacity.z * s.z);
    color = mix(color, color * vec3(0.51, 0.59, 0.65), min(shade * 1.65, 0.75));
    float haze =
  `);
  return material;
}

/** Shared rendering mechanics; each landmark owns all of its scenery and measured layout. */
export class ClassicSpot3D {
  readonly group = new Group();
  readonly overlay = new Group();
  readonly overlayMaterials = [];
  readonly shadowGeometry = null;
  readonly propInk = '#70766e';
  private readonly sky = elToroSkyMaterial();
  private readonly solid = elToroPropMaterial();
  private readonly surface = groundMaterial();
  private readonly scenery = new Group();
  private readonly streetProps: StreetProps | null;
  /** Resolves once the street props have loaded (or failed to). */
  readonly ready: Promise<void>;

  constructor(private readonly config: ClassicSpotConfig) {
    const skyGeometry = new BufferGeometry();
    skyGeometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const sky = new Mesh(skyGeometry, this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    const built = config.build();
    const u = this.surface.uniforms;
    const rails = (built.railSegments ?? []).slice(0, 48);
    const boxes = (built.shadowBoxes ?? []).slice(0, 12);
    u.uRailCount.value = rails.length;
    u.uBoxCount.value = boxes.length;
    rails.forEach((r, i) => { u.uRailA.value[i].set(...r.a, r.radius); u.uRailB.value[i].set(...r.b, 0); });
    boxes.forEach((b, i) => { u.uBoxMin.value[i].set(...b.min); u.uBoxMax.value[i].set(...b.max); });
    const ground = new Mesh(built.ground, this.surface);
    const props = new Mesh(built.props, this.solid);
    ground.renderOrder = -50;
    ground.frustumCulled = props.frustumCulled = false;
    this.scenery.add(ground, props);
    this.streetProps = config.streetProps ? new StreetProps(config.streetProps) : null;
    if (this.streetProps) this.scenery.add(this.streetProps.group);
    this.ready = this.streetProps?.ready ?? Promise.resolve();
    this.group.add(sky, this.scenery);
  }

  view(frame: StageFrame, camera: Readonly<SceneCamera>, zoom: number, aspect: number, tripod: TripodId | null): StageView | null {
    if (!frame.stairs) return null;
    zoom *= this.config.framing ?? 1;
    const across = frame.stairs.across;
    if (tripod && this.config.tripods) {
      const p = this.config.tripods[tripod];
      const eye: Vec3 = [p.u - frame.scroll, p.height, p.z - across];
      return tripodView(eye, frame.lift, p.frame, p.place, zoom, aspect);
    }
    const rad = Math.PI / 180;
    const uphill = Math.max(0, Math.sin(camera.yaw * rad));
    const floorPitch = Math.atan(this.config.grade * uphill + Math.tan(3 * rad)) / rad;
    const safe = { ...camera, pitch: Math.max(camera.pitch, floorPitch) };
    const view = stageView(frame.lift, safe, zoom, aspect);
    if (!this.config.cameraZ) return view;
    const [min, max] = this.config.cameraZ.map(z => z - across);
    const bound = Math.max(min, Math.min(max, view.eye[2]));
    if (bound === view.eye[2]) return view;
    const target = camera.targetZ ?? 0;
    const ratio = Math.max(0.08, (bound - target) / (view.eye[2] - target));
    return stageView(frame.lift, { ...safe, lens: safe.lens * ratio }, zoom, aspect);
  }

  update(view: StageView, scroll: number, size: { width: number; height: number }, shadow: Texture, opacity: [number, number, number], frame?: StageFrame) {
    this.scenery.position.set(-scroll, 0, -(frame?.stairs?.across ?? this.config.laneZ));
    const u = this.surface.uniforms;
    u.uShadow.value = shadow;
    u.uShadowOpacity.value.set(...opacity);
    u.uShadowY.value = frame?.stairs?.shadowY ?? 0;
    const s = this.sky.uniforms;
    s.uRes.value.set(size.width, size.height);
    s.uFrustum.value.set(view.frustum.left, view.frustum.right, view.frustum.bottom, view.frustum.top);
    s.uRight.value.set(...view.right);
    s.uUp.value.set(...view.up);
    s.uBack.value.set(...view.back);
  }

  dispose() {
    this.sky.dispose(); this.solid.dispose(); this.surface.dispose();
    this.streetProps?.dispose();
    this.group.traverse(o => { if (o instanceof Mesh && !(o.parent === this.streetProps?.group)) o.geometry.dispose(); });
  }
}
