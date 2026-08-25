import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  FALL_VARIANT_OPTIONS,
  FLIP_T,
  FALL_T,
  HOLD,
  LAND_T,
  ROLL_IN,
  computeFrame,
  specFor,
  type FallVariant,
  type RiderStance,
  type Stance,
} from '@skrobot/animations';
import { ROBOTS, robotById, tricksForStance } from '../data';
import { applyRobotPalette, bindRig, poseFromFrame, type RigHandles } from './poseFromFrame';
import styles from './BlenderPrototype.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** Geometry-only source. Baked clips are ignored — motion comes from computeFrame. */
const RIG_ASSET = '/blender-prototype/skrobot-kickflip-land.glb';

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const RIDER_STANCES: RiderStance[] = ['regular', 'goofy'];

/**
 * Presentation is deliberately matched to the shipped 3D robots
 * (`packages/animations/src/TrickAnimation3D.tsx` + its CSS): flat cel-shaded
 * fills, a heavy ink outline on every part, and the same mini skate spot —
 * blue sky, warm sun, green shoulders, an asphalt lane with a dashed centre
 * line. Blender owns the geometry; `@skrobot/animations` owns the motion;
 * this file owns the look and the playground controls.
 */
const INK = '#25354b';
const SKY_TOP = '#7ec8f0';
const SKY_MID = '#a8daf5';
const SKY_HORIZON = '#d6eefb';
const SPOT_FLOOR = '#95c07f';
const SPOT_FLOOR_FAR = '#b5d49a';
const SPOT_ASPHALT = '#7d8794';
const SPOT_ASPHALT_DEEP = '#6b7582';
const LANE_CENTER = '#ffecaa';

// One SVG art unit from the 2D renderer, in Blender/glTF units.
const U = 1 / 60;
const LANE_HALF = 72 * U;
const DECK_REST_HEIGHT = 13 * U;

// glTF is Y-up after the Blender export: X = travel, Y = height, +Z = the side
// the rider's chest is turned toward. Sitting the camera at +X/+Z reproduces
// the 2D renderer's framing — travel runs left to right and the near edge of
// the board falls away to the left.
const CAMERA_DIRECTION = new THREE.Vector3(0.417, 0.309, 0.855).normalize();
const CAMERA_DISTANCE = 8.4;
const CAMERA_TARGET = new THREE.Vector3(0, 1.3, 0);
// Same key light the 2D renderer shades with: high, to the right, slightly
// toward the viewer.
const LIGHT_DIRECTION = new THREE.Vector3(0.46, 0.82, 0.34).normalize();
// The spot is a finite patch, exactly like the 2D floor. Its far edge is what
// reads as the horizon; an infinite plane at this camera pitch would fill the
// frame and leave no sky.
const SPOT_FAR_Z = -2.7;
const SPOT_NEAR_Z = 12;

const CAMERA_FORWARD = CAMERA_DIRECTION.clone().negate();
const CAMERA_RIGHT = new THREE.Vector3().crossVectors(CAMERA_FORWARD, new THREE.Vector3(0, 1, 0)).normalize();
const CAMERA_UP = new THREE.Vector3().crossVectors(CAMERA_RIGHT, CAMERA_FORWARD).normalize();

/** Position sky scenery by where it should land in frame rather than by world
 *  coordinates — the camera is yawed off every axis, so hand-picked positions
 *  end up behind the viewer. Offsets are fractions of the visible half-extent
 *  at `distance`; (0, 0) is dead centre. */
function skyAnchor(right: number, up: number, distance: number): THREE.Vector3 {
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(15));
  const halfWidth = halfHeight * 1.6;
  return CAMERA_TARGET.clone()
    .addScaledVector(CAMERA_FORWARD, distance)
    .addScaledVector(CAMERA_RIGHT, right * halfWidth)
    .addScaledVector(CAMERA_UP, up * halfHeight);
}

/** Three-step ramp: the cel banding that replaces smooth PBR falloff. The
 *  steps sit close together on purpose — the 2D robots are flat fills with a
 *  narrow highlight, not half-lit solids, so a wide ramp reads as a dark blob
 *  across the shaded side of the head. */
function createToonRamp(): THREE.DataTexture {
  const ramp = new THREE.DataTexture(new Uint8Array([224, 244, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

/** Ink outline: an inverted hull pushed along the normal in view space, so the
 *  stroke keeps a constant screen weight at any distance or zoom. */
function createOutlineMaterial(thickness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      outlineColor: { value: new THREE.Color(INK) },
      outlineThickness: { value: thickness },
    },
    vertexShader: `
      uniform float outlineThickness;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 viewNormal = normalize(normalMatrix * normal);
        mvPosition.xyz += viewNormal * outlineThickness * -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 outlineColor;
      void main() {
        gl_FragColor = vec4(outlineColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    // Push the hull slightly back so it only shows as a rim, not as a
    // z-fought sawtooth where it meets the fill.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/** Welded copy of a geometry with averaged normals. Flat-shaded parts (the
 *  deck) carry split normals, and an inverted hull built on those tears open
 *  at every hard edge. */
function createOutlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', source.getAttribute('position').clone());
  if (source.getIndex()) shell.setIndex(source.getIndex()!.clone());
  const welded = mergeVertices(shell, 1e-5);
  welded.computeVertexNormals();
  if (welded !== shell) shell.dispose();
  return welded;
}

function radialTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function cloudTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  // Just enough blur to hide the sprite's pixel edge — the 2D clouds are solid
  // lobed shapes, so heavy blur turns them into smears.
  ctx.filter = 'blur(2.5px)';
  const puffs: Array<[number, number, number]> = [
    [0.5, 0.62, 0.2],
    [0.32, 0.66, 0.15],
    [0.68, 0.68, 0.14],
    [0.42, 0.5, 0.14],
    [0.6, 0.52, 0.12],
  ];
  puffs.forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.ellipse(cx * size, cy * (size / 2), r * size, r * size * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSkyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      skyTop: { value: new THREE.Color(SKY_TOP) },
      skyMid: { value: new THREE.Color(SKY_MID) },
      skyHorizon: { value: new THREE.Color(SKY_HORIZON) },
      domeRadius: { value: 60 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 skyTop;
      uniform vec3 skyMid;
      uniform vec3 skyHorizon;
      uniform float domeRadius;
      varying vec3 vWorldPosition;
      void main() {
        // h is the sine of the elevation angle. The camera looks slightly
        // down, so the whole visible sky lives in a narrow band just above the
        // horizon — the ramp has to saturate inside it or the sky reads white.
        float h = clamp(vWorldPosition.y / domeRadius, -1.0, 1.0);
        vec3 color = mix(skyHorizon, skyMid, smoothstep(0.0, 0.08, h));
        color = mix(color, skyTop, smoothstep(0.06, 0.24, h));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), material);
}

/** Green shoulders, asphalt lane, curb lines, and a dashed centre stripe. */
function createSpot(): THREE.Group {
  const spot = new THREE.Group();
  const flat = -Math.PI / 2;
  const depth = SPOT_NEAR_Z - SPOT_FAR_Z;
  const midZ = (SPOT_NEAR_Z + SPOT_FAR_Z) / 2;

  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(160, depth),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(SPOT_FLOOR) }),
  );
  shoulder.rotation.x = flat;
  shoulder.position.set(0, -0.004, midZ);
  spot.add(shoulder);

  // Far strip drifts lighter, the same aerial-perspective cue the 2D floor uses.
  const shoulderFar = new THREE.Mesh(
    new THREE.PlaneGeometry(160, depth * 0.4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(SPOT_FLOOR_FAR), transparent: true, opacity: 0.6 }),
  );
  shoulderFar.rotation.x = flat;
  shoulderFar.position.set(0, -0.0035, SPOT_FAR_Z + depth * 0.2);
  spot.add(shoulderFar);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(160, LANE_HALF * 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(SPOT_ASPHALT) }),
  );
  road.rotation.x = flat;
  road.position.y = -0.002;
  spot.add(road);

  const roadNear = new THREE.Mesh(
    new THREE.PlaneGeometry(160, LANE_HALF),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(SPOT_ASPHALT_DEEP), transparent: true, opacity: 0.5 }),
  );
  roadNear.rotation.x = flat;
  roadNear.position.set(0, -0.0015, LANE_HALF * 0.5);
  spot.add(roadNear);

  const curbMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(INK),
    transparent: true,
    opacity: 0.28,
  });
  const lipMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.34,
  });
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.022), curbMaterial);
    curb.rotation.x = flat;
    curb.position.set(0, -0.001, side * LANE_HALF);
    spot.add(curb);

    const lip = new THREE.Mesh(new THREE.PlaneGeometry(160, 0.014), lipMaterial);
    lip.rotation.x = flat;
    lip.position.set(0, -0.001, side * (LANE_HALF + 0.1));
    spot.add(lip);
  }

  const dashMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(LANE_CENTER),
    transparent: true,
    opacity: 0.78,
  });
  const dashGeometry = new THREE.PlaneGeometry(52 * U, 0.055);
  for (let x = -24; x <= 24; x += 2.2) {
    const dash = new THREE.Mesh(dashGeometry, dashMaterial);
    dash.rotation.x = flat;
    dash.position.set(x, -0.0005, 0);
    spot.add(dash);
  }

  return spot;
}

function createSky(): THREE.Group {
  const sky = new THREE.Group();

  const sunTexture = radialTexture([
    [0, 'rgba(255, 222, 150, 1)'],
    [0.42, 'rgba(255, 214, 132, 0.95)'],
    [0.5, 'rgba(255, 214, 132, 0.3)'],
    [1, 'rgba(255, 214, 132, 0)'],
  ]);
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: sunTexture, transparent: true, depthWrite: false, opacity: 0.85, fog: false }),
  );
  sun.scale.setScalar(8);
  sun.position.copy(skyAnchor(0.82, 0.52, 46));
  sky.add(sun);

  const puff = cloudTexture();
  // right, up, distance, scale
  const clouds: Array<[number, number, number, number]> = [
    [-0.68, 0.62, 40, 2.6],
    [0.16, 0.86, 48, 2.2],
    [-0.98, 0.4, 36, 1.9],
    [0.86, 0.78, 52, 2.4],
    [-0.3, 0.34, 44, 1.7],
  ];
  for (const [right, up, distance, scale] of clouds) {
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.92, fog: false }),
    );
    cloud.position.copy(skyAnchor(right, up, distance));
    cloud.scale.set(scale * 2, scale, 1);
    sky.add(cloud);
  }

  return sky;
}

interface BlobShadow {
  mesh: THREE.Mesh;
  baseRadius: number;
}

function createBlobShadow(radius: number, texture: THREE.Texture): BlobShadow {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      color: new THREE.Color('#1c2430'),
      opacity: 0.32,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  return { mesh, baseRadius: radius };
}

/** Cast, not pinned: the blob slides along the key light's ray and fades as the
 *  subject rises, which is what actually sells the pop. */
function updateBlobShadow(shadow: BlobShadow, subject: THREE.Vector3, groundOffset: number) {
  const height = Math.max(0, subject.y - groundOffset);
  const slide = height / LIGHT_DIRECTION.y;
  const fade = Math.min(1, height / 2.4);
  shadow.mesh.position.x = subject.x - LIGHT_DIRECTION.x * slide;
  shadow.mesh.position.z = subject.z - LIGHT_DIRECTION.z * slide;
  const scale = shadow.baseRadius * (1 - 0.3 * fade);
  shadow.mesh.scale.set(scale, scale * 0.62, 1);
  (shadow.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - 0.62 * fade);
}

/** Repaint the imported GLB in the game's cartoon style and give every part an
 *  ink outline. Decals and eyes get a lighter stroke so they stay crisp. */
function applyCartoonStyle(root: THREE.Object3D, ramp: THREE.DataTexture, disposables: Set<THREE.Object3D>) {
  const outlineHeavy = createOutlineMaterial(0.0042);
  const outlineLight = createOutlineMaterial(0.0014);
  const converted = new Map<THREE.Material, THREE.MeshToonMaterial>();
  const meshes: THREE.Mesh[] = [];

  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });

  for (const mesh of meshes) {
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toonMaterials = sourceMaterials.map((source) => {
      const existing = converted.get(source);
      if (existing) return existing;
      const base = (source as THREE.MeshStandardMaterial).color ?? new THREE.Color('#ffffff');
      // The rider is the subject, not scenery: fog belongs to the ground fade.
      const toon = new THREE.MeshToonMaterial({ color: base.clone(), gradientMap: ramp, fog: false });
      toon.name = source.name;
      converted.set(source, toon);
      return toon;
    });
    mesh.material = Array.isArray(mesh.material) ? toonMaterials : toonMaterials[0];

    // Decals sit a hair off the deck and the antenna/neck/visor are thinner
    // than the stroke itself — a full-weight hull swallows them or, on the
    // visor, turns the lens edge into a crunchy intersection.
    const isDetail =
      mesh.name.startsWith('Decal.') ||
      mesh.name.startsWith('Eye.') ||
      mesh.name === 'Body.Visor' ||
      mesh.name === 'Body.Antenna' ||
      mesh.name === 'Body.AntennaBall' ||
      mesh.name === 'Body.Neck';
    const outline = new THREE.Mesh(
      createOutlineGeometry(mesh.geometry),
      isDetail ? outlineLight : outlineHeavy,
    );
    outline.name = `${mesh.name}.Outline`;
    outline.renderOrder = -1;
    mesh.add(outline);
    disposables.add(outline);
  }

  return () => {
    outlineHeavy.dispose();
    outlineLight.dispose();
    converted.forEach((material) => material.dispose());
  };
}

function disposeScene(scene: THREE.Scene) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const withMaterial = object as THREE.Mesh | THREE.Sprite;
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
    if (object instanceof THREE.Mesh) object.geometry.dispose();
    const objectMaterials = Array.isArray(withMaterial.material) ? withMaterial.material : [withMaterial.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      const mapped = material as THREE.MeshBasicMaterial;
      if (mapped.map) textures.add(mapped.map);
    });
  });
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export default function BlenderPrototype() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const poseRef = useRef<{
    rig: RigHandles;
    spec: ReturnType<typeof specFor>;
    landed: boolean;
    fall: FallVariant;
    riderStance: RiderStance;
    shankProgress: number;
  } | null>(null);
  const animationTimeRef = useRef(0);
  const endTimeRef = useRef(ROLL_IN + FLIP_T + LAND_T);
  const clipDurationRef = useRef(ROLL_IN + FLIP_T + LAND_T + HOLD);
  const selectionRef = useRef({
    spec: specFor({ id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' as Stance }),
    landed: true,
    fall: 'bail' as FallVariant,
    riderStance: 'regular' as RiderStance,
    body: ROBOTS[0].avatar.body,
    accent: ROBOTS[0].avatar.accent,
  });

  const [selectedRobotId, setSelectedRobotId] = useState(ROBOTS[0].id);
  const [selectedBase, setSelectedBase] = useState('Kickflip');
  const [selectedStance, setSelectedStance] = useState<Stance>('regular');
  const [selectedRiderStance, setSelectedRiderStance] = useState<RiderStance>('regular');
  const [landed, setLanded] = useState(true);
  const [fallVariant, setFallVariant] = useState<FallVariant>('bail');
  const [playKey, setPlayKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 0.4>(1);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [progress, setProgress] = useState(0);

  const robot = useMemo(() => robotById(selectedRobotId) ?? ROBOTS[0], [selectedRobotId]);
  const availableTricks = useMemo(() => tricksForStance(selectedStance), [selectedStance]);
  const currentTrick = useMemo(
    () => availableTricks.find((trick) => trick.base === selectedBase) ?? availableTricks[0],
    [availableTricks, selectedBase],
  );
  const spec = useMemo(
    () => (currentTrick ? specFor(currentTrick) : specFor({ id: 'ollie', name: 'Ollie', base: 'Ollie', stance: 'regular' })),
    [currentTrick],
  );
  const endTime = ROLL_IN + FLIP_T + (landed ? LAND_T : FALL_T);
  const clipDuration = endTime + HOLD;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    endTimeRef.current = endTime;
    clipDurationRef.current = clipDuration;
  }, [endTime, clipDuration]);

  useEffect(() => {
    selectionRef.current = {
      spec,
      landed,
      fall: fallVariant,
      riderStance: selectedRiderStance,
      body: robot.avatar.body,
      accent: robot.avatar.accent,
    };
  }, [spec, landed, fallVariant, selectedRiderStance, robot]);

  // Scene + GLB load once; trick changes only update poseRef / retint.
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    setLoadState('loading');
    setProgress(0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(new THREE.Color(SKY_HORIZON), 8, 15);

    // Default-framebuffer MSAA is skipped on purpose: the composer renders
    // into its own multisampled target, then SMAA cleans the remaining
    // high-contrast ink rims that 4x MSAA still leaves stair-stepped.
    // The extra pixel-ratio headroom is supersampling — inverted-hull
    // strokes are binary edges, so they need more than native resolution.
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1) * 2, 3));

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const cameraOffset = CAMERA_DIRECTION.clone().multiplyScalar(CAMERA_DISTANCE);
    camera.position.copy(CAMERA_TARGET).add(cameraOffset);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(CAMERA_TARGET);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 20;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 2.7));
    const key = new THREE.DirectionalLight(0xfff3dc, 0.62);
    key.position.copy(LIGHT_DIRECTION).multiplyScalar(20);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdff1ff, 0x9fbf88, 0.45));

    scene.add(createSkyDome());
    scene.add(createSky());
    scene.add(createSpot());

    const composer = new EffectComposer(renderer);
    composer.renderTarget1.samples = Math.min(4, renderer.capabilities.maxSamples);
    const smaaPass = new SMAAPass();
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(smaaPass);
    composer.addPass(new OutputPass());

    const blobTexture = radialTexture([
      [0, 'rgba(255, 255, 255, 1)'],
      [0.45, 'rgba(255, 255, 255, 0.72)'],
      [1, 'rgba(255, 255, 255, 0)'],
    ]);
    const boardShadow = createBlobShadow(46 * U * 2, blobTexture);
    const riderShadow = createBlobShadow(30 * U * 2, blobTexture);
    scene.add(boardShadow.mesh, riderShadow.mesh);

    const ramp = createToonRamp();
    const outlineOwners = new Set<THREE.Object3D>();
    let releaseStyle: (() => void) | null = null;
    let disposed = false;
    let lastProgressWrite = 0;
    let previousFrameTime: number | null = null;
    animationTimeRef.current = 0;

    const loader = new GLTFLoader();
    loader.load(
      RIG_ASSET,
      (gltf) => {
        if (disposed) return;
        // Drop baked clips — this prototype drives the rig from computeFrame.
        gltf.animations = [];
        releaseStyle = applyCartoonStyle(gltf.scene, ramp, outlineOwners);
        const rig = bindRig(gltf.scene);
        if (!rig) {
          setLoadState('error');
          return;
        }
        const selection = selectionRef.current;
        applyRobotPalette(gltf.scene, { body: selection.body, accent: selection.accent });
        scene.add(gltf.scene);
        poseRef.current = {
          rig,
          spec: selection.spec,
          landed: selection.landed,
          fall: selection.fall,
          riderStance: selection.riderStance,
          shankProgress: 0.65,
        };
        poseFromFrame(
          rig,
          computeFrame(0, selection.spec, selection.landed, selection.fall, 0.65),
          selection.spec,
          selection.riderStance,
        );
        setLoadState('ready');
      },
      undefined,
      (error) => {
        if (disposed) return;
        console.error('Failed to load Blender prototype', error);
        setLoadState('error');
      },
    );

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      camera.fov = aspect < 0.9 ? 40 : 30;
      renderer.setSize(width, height, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      controls.update();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const riderPosition = new THREE.Vector3();
    const boardPosition = new THREE.Vector3();
    renderer.setAnimationLoop((time) => {
      const delta = previousFrameTime === null ? 0 : Math.min((time - previousFrameTime) / 1000, 0.05);
      previousFrameTime = time;
      const pose = poseRef.current;
      if (pose && !pausedRef.current) {
        animationTimeRef.current = Math.min(
          clipDurationRef.current,
          animationTimeRef.current + delta * speedRef.current,
        );
        const frame = computeFrame(
          Math.min(animationTimeRef.current, endTimeRef.current),
          pose.spec,
          pose.landed,
          pose.fall,
          pose.shankProgress,
        );
        poseFromFrame(pose.rig, frame, pose.spec, pose.riderStance);
      }
      if (pose) {
        pose.rig.rider.getWorldPosition(riderPosition);
        updateBlobShadow(riderShadow, riderPosition, 0);
        pose.rig.board.getWorldPosition(boardPosition);
        updateBlobShadow(boardShadow, boardPosition, DECK_REST_HEIGHT);
        if (delta > 0) {
          const desiredX = THREE.MathUtils.clamp(riderPosition.x * 0.86, -2.6, 3.6);
          const desiredY = THREE.MathUtils.clamp(0.5 + riderPosition.y * 0.55, 1.2, 2.5);
          const follow = Math.min(1, delta * 3.5);
          const shiftX = (desiredX - controls.target.x) * follow;
          const shiftY = (desiredY - controls.target.y) * follow;
          controls.target.x += shiftX;
          controls.target.y += shiftY;
          camera.position.x += shiftX;
          camera.position.y += shiftY;
        }
      }
      if (time - lastProgressWrite > 80) {
        setProgress(Math.min(1, animationTimeRef.current / clipDurationRef.current));
        lastProgressWrite = time;
      }
      controls.update();
      composer.render();
    });

    const resetCamera = () => {
      controls.target.copy(CAMERA_TARGET);
      camera.position.copy(CAMERA_TARGET).add(cameraOffset);
      controls.update();
    };
    canvas.addEventListener('dblclick', resetCamera);

    return () => {
      disposed = true;
      poseRef.current = null;
      canvas.removeEventListener('dblclick', resetCamera);
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      releaseStyle?.();
      ramp.dispose();
      disposeScene(scene);
      smaaPass.dispose();
      composer.dispose();
      renderer.dispose();
    };
    // Scene boots once; playKey / trick changes are handled by the pose effect.
  }, []);

  // Push the latest trick/outcome into the running scene and rewind playback.
  useEffect(() => {
    const pose = poseRef.current;
    if (!pose) return;
    pose.spec = spec;
    pose.landed = landed;
    pose.fall = fallVariant;
    pose.riderStance = selectedRiderStance;
    pose.shankProgress = 0.55 + Math.random() * 0.25;
    animationTimeRef.current = 0;
    applyRobotPalette(pose.rig.rider.parent ?? pose.rig.rider, robot.avatar);
    poseFromFrame(
      pose.rig,
      computeFrame(0, spec, landed, fallVariant, pose.shankProgress),
      spec,
      selectedRiderStance,
    );
    setProgress(0);
    setPaused(false);
  }, [spec, landed, fallVariant, selectedRiderStance, robot, playKey]);

  const handleStanceChange = (stance: Stance) => {
    setSelectedStance(stance);
    const matching = tricksForStance(stance).find((trick) => trick.base === selectedBase);
    if (!matching) {
      const fallback = tricksForStance(stance)[0];
      if (fallback) setSelectedBase(fallback.base);
    }
  };

  const play = (nextLanded: boolean) => {
    setLanded(nextLanded);
    setPaused(false);
    setPlayKey((key) => key + 1);
  };

  const replay = () => {
    setPaused(false);
    setPlayKey((key) => key + 1);
  };

  return (
    <main className={styles.prototype}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Blender lab · physics-driven</p>
        <h2>Same tricks. Real scene.</h2>
        <p className={styles.summary}>
          Blender owns the capsule rig and board; the playground&rsquo;s shared{' '}
          <code>computeFrame</code> physics drives every joint. Pick any flatground
          trick, stance, and outcome — cel-shaded to match the shipped 3D robots.
        </p>
      </div>

      <section className={styles.picker} aria-label="Trick selection">
        <label>
          <span>Robot</span>
          <select value={selectedRobotId} onChange={(event) => setSelectedRobotId(event.target.value)}>
            {ROBOTS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Rider</span>
          <select
            value={selectedRiderStance}
            onChange={(event) => setSelectedRiderStance(event.target.value as RiderStance)}
          >
            {RIDER_STANCES.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Stance</span>
          <select
            value={selectedStance}
            onChange={(event) => handleStanceChange(event.target.value as Stance)}
          >
            {STANCES.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Trick</span>
          <select value={selectedBase} onChange={(event) => setSelectedBase(event.target.value)}>
            {availableTricks.map((trick) => (
              <option key={trick.id} value={trick.base}>{trick.base}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Fall</span>
          <select
            value={fallVariant}
            onChange={(event) => setFallVariant(event.target.value as FallVariant)}
            disabled={landed}
          >
            {FALL_VARIANT_OPTIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className={styles.stage} aria-label="Blender trick prototype">
        <div ref={hostRef} className={styles.viewport}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label={`Interactive 3D Skrobot ${currentTrick?.name ?? 'trick'}`}
          />
          <div className={styles.stageTopline}>
            <span className={styles.liveDot} />
            {loadState === 'loading' ? 'Loading GLB' : loadState === 'error' ? 'Asset error' : 'Live WebGL'}
          </div>
          <div className={styles.outcomeStamp} data-outcome={landed ? 'land' : 'bail'}>
            <span>{landed ? 'Landed' : fallVariant}</span>
            <strong>{currentTrick?.base ?? 'Ollie'}</strong>
          </div>
          {loadState === 'loading' && <div className={styles.loader}>Assembling rig…</div>}
          {loadState === 'error' && <div className={styles.loader}>Couldn’t load the prototype asset.</div>}
          <p className={styles.orbitHint}>Drag to orbit · double-click to reset</p>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>

        <div className={styles.controls}>
          <div className={styles.outcomes} aria-label="Animation outcome">
            <button
              type="button"
              className={landed ? styles.primaryButton : styles.controlButton}
              onClick={() => play(true)}
            >
              Land it
            </button>
            <button
              type="button"
              className={!landed ? styles.dangerButton : styles.controlButton}
              onClick={() => play(false)}
            >
              Bail out
            </button>
          </div>
          <div className={styles.transport}>
            <button type="button" className={styles.textButton} onClick={replay}>Replay</button>
            <button type="button" className={styles.textButton} onClick={() => setPaused((value) => !value)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className={styles.speedButton}
              onClick={() => setSpeed((value) => (value === 1 ? 0.4 : 1))}
              aria-label={`Playback speed ${speed} times`}
            >
              {speed}×
            </button>
          </div>
        </div>
      </section>

      <section className={styles.notes} aria-label="Prototype implementation notes">
        <div>
          <span>Motion</span>
          <strong>Shared computeFrame physics</strong>
          <p>Same Spec catalog and timeline as the 2D/3D playground renderers.</p>
        </div>
        <div>
          <span>Geometry</span>
          <strong>Blender capsule rig</strong>
          <p>One GLB for the meshes; joints are posed each frame in Three.js.</p>
        </div>
        <div>
          <span>Boundary</span>
          <strong>Playground only</strong>
          <p>No production renderer imports this code or downloads these assets.</p>
        </div>
      </section>
    </main>
  );
}
