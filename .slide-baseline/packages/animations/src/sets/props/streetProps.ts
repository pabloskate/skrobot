import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  Quaternion,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type ShaderMaterial,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SUN, sceneMaterial } from '../../three/materials';
import type { Vec3 } from '../../camera/view';

/**
 * Realistic street props for the classic spots: trees from Poly Haven scans
 * (CC0), rebuilt for phones by blender/build_tree.py, and cars modelled by
 * blender/build_cars.py, parked or driving down the street on the
 * attempt's clock (`drive`). They load after the set is drawn
 * (`ready`) and are shaded in the set's own light: the same sun, the same
 * haze with distance, and no ink outline.
 */

// Each URL a literal, so bundlers (webpack, Vite) find and ship the file.
const TREE = {
  model: new URL('./assets/jacaranda.glb', import.meta.url).href,
  trunk: new URL('./assets/jacaranda_trunk.jpg', import.meta.url).href,
  branches: new URL('./assets/jacaranda_branches.jpg', import.meta.url).href,
  leaves: new URL('./assets/jacaranda_leaves.webp', import.meta.url).href,
};
/** The tree model's height (its units are metres). */
const TREE_HEIGHT = 19.47;
const CARS = new URL('./assets/cars.glb', import.meta.url).href;
/** World units per metre: the sets are laid out in feet of 29 units. */
const METRE = 29 / 0.3048;

export type CarModel = 'sedan' | 'hatchback' | 'suv';

/** A car: where its middle is on the ground, which way its nose points (degrees about up, 0 = +x), and its paint. */
export interface CarPlacement {
  at: Vec3;
  yaw: number;
  model: CarModel;
  paint: string;
  /**
   * Driving: world units a second along its nose, from `at` at the
   * attempt's start, coming round again every `lap` units (centered on
   * `at`) so it's always somewhere down the street. Parked when omitted.
   */
  speed?: number;
  lap?: number;
}

/** A tree standing at `at` (the set's coordinates, y up), `height` world units tall, turned `yaw` degrees. */
export interface TreePlacement {
  at: Vec3;
  height: number;
  yaw: number;
}

export interface StreetPropPlacements {
  trees?: TreePlacement[];
  cars?: CarPlacement[];
}

/** A mesh's role from its glTF node name ("leaves", "trunk", "sedan"…), whatever suffix a loader adds. */
const meshName = (mesh: Mesh) => mesh.name.toLowerCase().replace(/[^a-z]/g, '');

/** Standing at `at`, turned `yaw` degrees about up, drawn `scale` times its modelled size. */
const placement = (at: Vec3, yaw: number, scale: number) => new Matrix4().compose(
  new Vector3(...at),
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (yaw * Math.PI) / 180),
  new Vector3(scale, scale, scale),
);

const sun = `vec3(${SUN.x.toFixed(5)}, ${SUN.y.toFixed(5)}, ${SUN.z.toFixed(5)})`;

// three declares position, normal, uv, color (with vertexColors), and instanceMatrix.
const VERT = /* glsl */ `
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vShade;
void main() {
  mat4 placed = modelMatrix * instanceMatrix;
  vec4 world = placed * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(placed) * normal);
  vUv = uv;
  #ifdef USE_COLOR
    vShade = color.r;
  #else
    vShade = 1.0;
  #endif
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** The set's light: daylight and haze as the baked props have it (sets/elToro/elToroMaterials.ts). */
const LIGHT = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vShade;
const vec3 SUN = ${sun};
vec3 hazed(vec3 color) {
  float haze = 0.72 * smoothstep(2400.0, 12000.0, length(vWorld - cameraPosition));
  return mix(color, vec3(0.776, 0.816, 0.8), haze);
}
`;

function barkMaterial(map: Texture): ShaderMaterial {
  return sceneMaterial(VERT, LIGHT + /* glsl */ `
    uniform sampler2D uMap;
    void main() {
      vec3 n = normalize(vNormal);
      if (!gl_FrontFacing) n = -n;
      vec3 color = texture(uMap, vUv).rgb * 1.1;
      color *= 0.7 + 0.38 * max(dot(n, SUN), 0.0);
      outColor = vec4(hazed(color), 1.0);
      outInfo = vec4(0.0);
    }
  `, { uMap: { value: map } }, { side: DoubleSide });
}

/** Leaf clumps: cut out of the atlas, lit as one soft crown (the cards' normals point out of it), glowing through when backlit. */
function leafMaterial(map: Texture): ShaderMaterial {
  return sceneMaterial(VERT, LIGHT + /* glsl */ `
    uniform sampler2D uMap;
    void main() {
      vec4 tex = texture(uMap, vUv);
      if (tex.a < 0.5) discard;
      vec3 n = normalize(vNormal);
      float lit = dot(n, SUN);
      vec3 eye = normalize(cameraPosition - vWorld);
      float through = pow(max(0.0, dot(-eye, SUN)), 2.0) * 0.35;
      vec3 color = tex.rgb * (0.78 + 0.42 * smoothstep(-0.5, 0.8, lit) + through) * (0.75 + 0.25 * vShade);
      outColor = vec4(hazed(color), 1.0);
      outInfo = vec4(0.0);
    }
  `, { uMap: { value: map } }, { side: DoubleSide });
}

/** Surface numbers, carried ×1/8 in the car models' vertex color green (blender/build_cars.py). */
const CAR_SURFACES = ['PAINT', 'GLASS', 'TRIM', 'TIRE', 'RIM', 'HEAD', 'TAIL', 'PLATE'];

/** Cars: paint and glass that mirror the sky, rubber, alloy, lamps; occlusion baked in the vertex colors. */
function carMaterial(): ShaderMaterial {
  const surfaces = CAR_SURFACES.map((name, i) => `const float ${name} = ${i}.0;`).join('\n');
  return sceneMaterial(VERT.replace('out vec3 vWorld;', `
    out float vSurface;
    out vec3 vPaint;
    out vec3 vWorld;`).replace('vUv = uv;', `vUv = vec2(0.0);
    #ifdef USE_COLOR
      vSurface = color.g * 8.0 - 0.5;
    #else
      vSurface = 0.0;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vPaint = instanceColor;
    #else
      vPaint = vec3(0.6);
    #endif`), LIGHT + /* glsl */ `
    in float vSurface;
    in vec3 vPaint;
    ${surfaces}
    vec3 sky(vec3 r) {
      vec3 up = vec3(0.62, 0.72, 0.82), horizon = vec3(0.86, 0.87, 0.85), ground = vec3(0.36, 0.35, 0.32);
      return r.y > 0.0 ? mix(horizon, up, smoothstep(0.0, 0.6, r.y)) : mix(horizon, ground, smoothstep(0.0, 0.25, -r.y));
    }
    void main() {
      float id = floor(vSurface + 0.5);
      vec3 n = normalize(vNormal);
      if (!gl_FrontFacing) n = -n;
      vec3 eye = normalize(cameraPosition - vWorld);
      float nl = max(dot(n, SUN), 0.0);
      float nv = max(dot(n, eye), 0.0);
      vec3 r = reflect(-eye, n);
      float ao = vShade;
      float spec = pow(max(dot(n, normalize(SUN + eye)), 0.0), 90.0);
      vec3 color;
      if (id == PAINT) {
        float fres = 0.05 + 0.6 * pow(1.0 - nv, 4.0);
        color = vPaint * (0.42 + 0.62 * nl) * ao;
        color = mix(color, sky(r) * ao, fres) + vec3(0.9) * spec * nl;
      } else if (id == GLASS) {
        float fres = 0.18 + 0.7 * pow(1.0 - nv, 3.0);
        color = mix(vec3(0.05, 0.065, 0.075), sky(r), fres) * ao + vec3(1.0) * spec * nl;
      } else if (id == RIM) {
        color = mix(vec3(0.55, 0.56, 0.57), sky(r), 0.45) * (0.5 + 0.5 * nl) * ao + vec3(0.6) * spec;
      } else if (id == HEAD) {
        color = mix(vec3(0.82, 0.83, 0.8), sky(r), 0.35) * ao + vec3(0.8) * spec;
      } else if (id == TAIL) {
        color = vec3(0.55, 0.06, 0.05) * (0.6 + 0.4 * nl) * ao + vec3(0.5) * spec;
      } else if (id == PLATE) {
        color = vec3(0.84, 0.84, 0.8) * (0.55 + 0.45 * nl) * ao;
      } else {
        // Trim and tires: dark rubber and plastic.
        float base = id == TIRE ? 0.07 : 0.1;
        color = vec3(base) * (0.6 + 0.6 * nl) * ao + vec3(0.12) * spec * nl;
      }
      outColor = vec4(hazed(color), 1.0);
      outInfo = vec4(0.0);
    }
  `, {});
}

export class StreetProps {
  readonly group = new Group();
  readonly ready: Promise<void>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: ShaderMaterial[] = [];
  private readonly textures: Texture[] = [];
  /** Cars that drive, each with the instance it's drawn as. */
  private readonly traffic: Array<{ mesh: InstancedMesh; index: number; car: CarPlacement }> = [];
  private driven = 0;
  private disposed = false;

  constructor(placements: StreetPropPlacements) {
    this.group.name = 'street-props';
    this.ready = this.load(placements).catch(() => {});
  }

  private async load(placements: StreetPropPlacements): Promise<void> {
    await Promise.all([this.loadTrees(placements.trees ?? []), this.loadCars(placements.cars ?? [])]);
  }

  private async loadTrees(trees: TreePlacement[]): Promise<void> {
    if (!trees.length) return;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const textures = new TextureLoader();
    const [model, trunk, branches, leaves] = await Promise.all([
      loader.loadAsync(TREE.model),
      textures.loadAsync(TREE.trunk),
      textures.loadAsync(TREE.branches),
      textures.loadAsync(TREE.leaves),
    ]);
    // Sampled as stored: the set's shaders work in display color, as its baked vertex colors are.
    for (const t of [trunk, branches, leaves]) {
      t.flipY = false;
      t.anisotropy = 4;
      this.textures.push(t);
    }
    if (this.disposed) {
      this.release(model.scene);
      return;
    }
    const make: Record<string, () => ShaderMaterial> = {
      trunk: () => barkMaterial(trunk),
      branches: () => barkMaterial(branches),
      leaves: () => leafMaterial(leaves),
    };
    const matrices = trees.map((tree) => placement(tree.at, tree.yaw, tree.height / TREE_HEIGHT));
    this.instance(model.scene, matrices, (name) => (make[name] ?? make.trunk)());
  }

  private async loadCars(cars: CarPlacement[]): Promise<void> {
    if (!cars.length) return;
    const model = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CARS);
    if (this.disposed) {
      this.release(model.scene);
      return;
    }
    const byModel = new Map<string, CarPlacement[]>();
    for (const car of cars) byModel.set(car.model, [...(byModel.get(car.model) ?? []), car]);
    model.scene.updateMatrixWorld(true);
    model.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const placed = byModel.get(meshName(object));
      if (!placed) return;
      const material = carMaterial();
      material.vertexColors = object.geometry.hasAttribute('color');
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const mesh = new InstancedMesh(geometry, material, placed.length);
      placed.forEach((car, i) => {
        mesh.setMatrixAt(i, placement(car.at, car.yaw, METRE));
        // Stored as written: these shaders work in display color.
        mesh.setColorAt(i, new Color().setStyle(car.paint, LinearSRGBColorSpace));
        if (car.speed) this.traffic.push({ mesh, index: i, car });
      });
      this.add(mesh, geometry, material);
    });
    this.release(model.scene);
    this.drive(this.driven);
  }

  /** Moves the driving cars to where they are `t` seconds into the attempt. */
  drive(t: number) {
    this.driven = t;
    const moved = new Set<InstancedMesh>();
    for (const { mesh, index, car } of this.traffic) {
      const lap = car.lap ?? Infinity;
      const run = car.speed! * t;
      const along = Number.isFinite(lap) ? run - lap * Math.floor(run / lap + 0.5) : run;
      const yaw = (car.yaw * Math.PI) / 180;
      const at: Vec3 = [car.at[0] + along * Math.cos(yaw), car.at[1], car.at[2] - along * Math.sin(yaw)];
      mesh.setMatrixAt(index, placement(at, car.yaw, METRE));
      moved.add(mesh);
    }
    for (const mesh of moved) mesh.instanceMatrix.needsUpdate = true;
  }

  /** Every mesh of `scene` drawn once per matrix, in the material its name asks for. */
  private instance(scene: Group, matrices: Matrix4[], material: (name: string) => ShaderMaterial) {
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const m = material(meshName(object));
      m.vertexColors = object.geometry.hasAttribute('color');
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const mesh = new InstancedMesh(geometry, m, matrices.length);
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      this.add(mesh, geometry, m);
    });
    this.release(scene);
  }

  private add(mesh: InstancedMesh, geometry: BufferGeometry, material: ShaderMaterial) {
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.geometries.push(geometry);
    this.materials.push(material);
    this.group.add(mesh);
  }

  private release(scene: Group) {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const m of materials) m.dispose();
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
