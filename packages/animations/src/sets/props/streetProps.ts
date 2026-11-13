import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  Quaternion,
  RepeatWrapping,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type ShaderMaterial,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { glslRgb, SUN, sceneMaterial } from '../../three/materials';
import type { Vec3 } from '../../camera/view';
import { SET_FOOT, SET_SCALE } from '../setScale';
import { treeMatrix, treeVariant, type TreePlacement, type TreeSpecies } from './trees';

export { crownSpheres, treeCrowns, TREE_SPECIES_IDS, type CrownSphere, type TreePlacement, type TreeSpecies } from './trees';

/**
 * Realistic street props for the classic spots: trees (a jacaranda from a
 * Poly Haven scan (CC0), rebuilt for phones by blender/build_tree.py, and
 * the species grown by blender/build_species.py; see trees.ts for the
 * placement and crown-sphere math), and cars modelled by
 * blender/build_cars.py, parked or driving down the street on the
 * attempt's clock (`drive`). They load after the set is drawn
 * (`ready`) and are shaded in the set's own light: the same sun, the same
 * haze with distance, and no ink outline.
 */

/**
 * Each species' model and the texture each of its parts is drawn with.
 * The jacaranda's nodes are `trunk`, `branches` and `leaves`; the grown
 * species have a `bark` and a `leaves` node per variant, `a_bark`,
 * `a_leaves`, `b_bark`... Their bark tiles round and up the trunk.
 */
interface TreeAssets {
  model: string;
  textures: Record<string, string>;
  tiled: boolean;
}

// Each URL a literal, so bundlers (webpack, Vite) find and ship the file.
const TREES: Record<TreeSpecies, TreeAssets> = {
  jacaranda: {
    model: new URL('./assets/jacaranda.glb', import.meta.url).href,
    textures: {
      trunk: new URL('./assets/jacaranda_trunk.jpg', import.meta.url).href,
      branches: new URL('./assets/jacaranda_branches.jpg', import.meta.url).href,
      leaves: new URL('./assets/jacaranda_leaves.webp', import.meta.url).href,
    },
    tiled: false,
  },
  eucalyptus: {
    model: new URL('./assets/eucalyptus.glb', import.meta.url).href,
    textures: {
      bark: new URL('./assets/eucalyptus_bark.jpg', import.meta.url).href,
      leaves: new URL('./assets/eucalyptus_leaves.webp', import.meta.url).href,
    },
    tiled: true,
  },
  ornamental: {
    model: new URL('./assets/ornamental.glb', import.meta.url).href,
    textures: {
      bark: new URL('./assets/ornamental_bark.jpg', import.meta.url).href,
      leaves: new URL('./assets/ornamental_leaves.webp', import.meta.url).href,
    },
    tiled: true,
  },
  fanPalm: {
    model: new URL('./assets/fan_palm.glb', import.meta.url).href,
    textures: {
      bark: new URL('./assets/fan_palm_bark.jpg', import.meta.url).href,
      leaves: new URL('./assets/fan_palm_leaves.webp', import.meta.url).href,
    },
    tiled: true,
  },
  ficus: {
    model: new URL('./assets/ficus.glb', import.meta.url).href,
    textures: {
      bark: new URL('./assets/ficus_bark.jpg', import.meta.url).href,
      leaves: new URL('./assets/ficus_leaves.webp', import.meta.url).href,
    },
    tiled: true,
  },
};
const CARS = new URL('./assets/cars.glb', import.meta.url).href;
/** Set units per metre (the sets are laid out in feet of SET_FOOT units). */
const METRE = SET_FOOT / 0.3048;

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

export interface StreetPropPlacements {
  trees?: TreePlacement[];
  cars?: CarPlacement[];
}

/** A mesh's role from its glTF node name ("leaves", "trunk", "sedan"…), whatever suffix a loader adds. */
const meshName = (mesh: Mesh) => mesh.name.toLowerCase().replace(/[^a-z]/g, '');

/** A tree mesh's variant and role from its node name: "a_bark" is variant 0's bark; "trunk" (the jacaranda) variant 0's trunk. */
export function treePart(name: string): { variant: number; role: string } {
  const match = /^(?:([a-z])_)?([a-z]+)/.exec(name.toLowerCase());
  return { variant: match?.[1] ? match[1].charCodeAt(0) - 97 : 0, role: match?.[2] ?? '' };
}

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

/** Distance haze: its color, where it starts and is full (set units), and how much at full. */
export interface PropHaze {
  color: string;
  from: number;
  to: number;
  amount: number;
}

/** The set's light: daylight and haze as the baked props have it (sets/elToro/elToroMaterials.ts), or a spot's own haze. */
function light(haze?: PropHaze) {
  const fade = haze
    ? `${haze.amount.toFixed(4)} * smoothstep(${haze.from.toFixed(1)}, ${haze.to.toFixed(1)},`
    : '0.72 * smoothstep(2400.0, 12000.0,';
  const color = haze ? glslRgb(haze.color) : 'vec3(0.776, 0.816, 0.8)';
  return /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vShade;
const vec3 SUN = ${sun};
vec3 hazed(vec3 color) {
  float haze = ${fade} length(vWorld - cameraPosition) / ${SET_SCALE.toFixed(5)});
  return mix(color, ${color}, haze);
}
`;
}

function barkMaterial(map: Texture, haze?: PropHaze): ShaderMaterial {
  return sceneMaterial(VERT, light(haze) + /* glsl */ `
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
function leafMaterial(map: Texture, haze?: PropHaze): ShaderMaterial {
  return sceneMaterial(VERT, light(haze) + /* glsl */ `
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

/** Surface numbers, carried ×1/16 in the car models' vertex color green (blender/build_cars.py). */
const CAR_SURFACES = ['PAINT', 'GLASS', 'TRIM', 'TIRE', 'RIM', 'HEAD', 'TAIL', 'PLATE', 'CHROME', 'AMBER'];

/** Cars: paint and glass that mirror the sky, rubber, alloy, chrome, lamps; occlusion baked in the vertex colors. */
function carMaterial(haze?: PropHaze): ShaderMaterial {
  const surfaces = CAR_SURFACES.map((name, i) => `const float ${name} = ${i}.0;`).join('\n');
  return sceneMaterial(VERT.replace('out vec3 vWorld;', `
    out float vSurface;
    out vec3 vPaint;
    out vec3 vWorld;`).replace('vUv = uv;', `vUv = vec2(0.0);
    #ifdef USE_COLOR
      vSurface = color.g * 16.0 - 0.5;
    #else
      vSurface = 0.0;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vPaint = instanceColor;
    #else
      vPaint = vec3(0.6);
    #endif`), light(haze) + /* glsl */ `
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
      vec3 h = normalize(SUN + eye);
      float nh = max(dot(n, h), 0.0);
      float ao = vShade;
      float spec = pow(nh, 100.0);
      float sheen = pow(nh, 22.0);
      vec3 color;
      if (id == PAINT) {
        float fres = 0.04 + 0.55 * pow(1.0 - nv, 4.2);
        color = vPaint * (0.40 + 0.62 * nl + 0.14 * sheen * nl) * ao;
        color = mix(color, sky(r) * ao, fres) + vec3(0.95) * spec * nl;
      } else if (id == GLASS) {
        float fres = 0.20 + 0.72 * pow(1.0 - nv, 3.0);
        color = mix(vec3(0.025, 0.035, 0.045), sky(r), fres) * ao + vec3(1.0) * pow(nh, 140.0) * nl;
      } else if (id == RIM) {
        color = mix(vec3(0.60, 0.62, 0.64), sky(r), 0.48) * (0.52 + 0.48 * nl) * ao + vec3(0.75) * spec * nl;
      } else if (id == CHROME) {
        color = mix(vec3(0.78, 0.80, 0.82), sky(r), 0.72) * (0.65 + 0.35 * nl) * ao + vec3(1.0) * pow(nh, 120.0) * nl;
      } else if (id == HEAD) {
        float fres = 0.15 + 0.45 * pow(1.0 - nv, 3.0);
        color = mix(vec3(0.84, 0.86, 0.88) * (0.7 + 0.3 * nl), sky(r), fres) * ao + vec3(0.95) * spec * nl;
      } else if (id == TAIL) {
        float fres = 0.12 + 0.45 * pow(1.0 - nv, 3.5);
        color = mix(vec3(0.56, 0.04, 0.04) * (0.62 + 0.38 * nl), sky(r), fres) * ao + vec3(0.85) * spec * nl;
      } else if (id == AMBER) {
        float fres = 0.12 + 0.40 * pow(1.0 - nv, 3.5);
        color = mix(vec3(0.78, 0.36, 0.04) * (0.65 + 0.35 * nl), sky(r), fres) * ao + vec3(0.75) * spec * nl;
      } else if (id == PLATE) {
        color = vec3(0.85, 0.85, 0.81) * (0.58 + 0.42 * nl) * ao;
      } else {
        // Trim and tires: dark rubber and satin plastic.
        float base = id == TIRE ? 0.055 : 0.075;
        float s = id == TIRE ? 0.04 : 0.10;
        color = vec3(base) * (0.58 + 0.56 * nl) * ao + vec3(s) * sheen * nl;
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

  /** `haze`: a spot's own distance haze (its realistic look); omitted, the stock haze every spot has. */
  constructor(placements: StreetPropPlacements, private readonly haze?: PropHaze) {
    this.group.name = 'street-props';
    this.ready = this.load(placements).catch(() => {});
  }

  private async load(placements: StreetPropPlacements): Promise<void> {
    await Promise.all([this.loadTrees(placements.trees ?? []), this.loadCars(placements.cars ?? [])]);
  }

  private async loadTrees(trees: TreePlacement[]): Promise<void> {
    const bySpecies = new Map<TreeSpecies, TreePlacement[]>();
    for (const tree of trees) {
      const species = tree.species ?? 'jacaranda';
      bySpecies.set(species, [...(bySpecies.get(species) ?? []), tree]);
    }
    await Promise.all([...bySpecies].map(([species, placed]) => this.loadSpecies(TREES[species], placed)));
  }

  /** One species: each variant's parts drawn once per tree of that variant. */
  private async loadSpecies(assets: TreeAssets, trees: TreePlacement[]): Promise<void> {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const textures = new TextureLoader();
    const roles = Object.keys(assets.textures);
    const [model, ...maps] = await Promise.all([
      loader.loadAsync(assets.model),
      ...roles.map((role) => textures.loadAsync(assets.textures[role])),
    ]);
    // Sampled as stored: the set's shaders work in display color, as its baked vertex colors are.
    for (const t of maps) {
      t.flipY = false;
      t.anisotropy = 4;
      this.textures.push(t);
    }
    if (assets.tiled) maps[roles.indexOf('bark')].wrapS = maps[roles.indexOf('bark')].wrapT = RepeatWrapping;
    if (this.disposed) {
      this.release(model.scene);
      return;
    }
    const map = (role: string) => maps[roles.indexOf(role)] ?? maps[0];
    const matrices = new Map<number, Matrix4[]>();
    for (const tree of trees) {
      const variant = treeVariant(tree);
      matrices.set(variant, [...(matrices.get(variant) ?? []), treeMatrix(tree)]);
    }
    this.instance(model.scene, (name) => matrices.get(treePart(name).variant) ?? [], (name) => {
      const { role } = treePart(name);
      return role === 'leaves' ? leafMaterial(map('leaves'), this.haze) : barkMaterial(map(role), this.haze);
    });
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
      const material = carMaterial(this.haze);
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

  /** Every mesh of `scene` drawn once per matrix its name asks for, in the material its name asks for. */
  private instance(scene: Group, place: (name: string) => Matrix4[], material: (name: string) => ShaderMaterial) {
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const matrices = place(object.name);
      if (!matrices.length) return;
      const m = material(object.name);
      m.vertexColors = object.geometry.hasAttribute('color');
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const mesh = new InstancedMesh(geometry, m, matrices.length);
      mesh.name = object.name;
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
