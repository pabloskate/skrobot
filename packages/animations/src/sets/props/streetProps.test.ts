import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, Quaternion, Texture, TextureLoader, Vector3, type Group, type ShaderMaterial } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SET_FOOT } from '../setScale';
import { StreetProps, treePart } from './streetProps';
import {
  TREE_SPECIES, TREE_SPECIES_IDS, crownSpheres, treeCrowns, treeHeight, treeMatrix, treeVariant,
  type TreePlacement, type TreeSpecies,
} from './trees';

const F = SET_FOOT;
const METRE = SET_FOOT / 0.3048;
const FILES: Record<TreeSpecies, string> = {
  jacaranda: 'jacaranda', eucalyptus: 'eucalyptus', ornamental: 'ornamental', fanPalm: 'fan_palm', ficus: 'ficus',
};
const asset = (name: string) => fileURLToPath(new URL(`./assets/${name}`, import.meta.url));

/** A species' GLB parsed from disk, as the browser loader would give it. */
async function model(species: TreeSpecies): Promise<GLTF> {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(asset(`${FILES[species]}.glb`));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
}

/** World positions of a model's meshes, by node name. */
function meshes(scene: Group) {
  scene.updateMatrixWorld(true);
  const out = new Map<string, Vector3[]>();
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const p = o.geometry.getAttribute('position');
    out.set(o.name, Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)));
  });
  return out;
}

const close = (a: Matrix4, b: Matrix4) => a.elements.forEach((e, i) => expect(e).toBeCloseTo(b.elements[i], 4));

describe('tree species', () => {
  it('keeps every existing jacaranda exactly as it was drawn before species', () => {
    for (const tree of [
      { at: [-17 * F, 0, -20.5 * F], height: 22 * F, yaw: 20 },
      { at: [5 * F, -3 * F, -82 * F], height: 38 * F, yaw: 134 },
    ] satisfies TreePlacement[]) {
      const scale = tree.height / 19.47;
      const before = new Matrix4().compose(
        new Vector3(...tree.at),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (tree.yaw * Math.PI) / 180),
        new Vector3(scale, scale, scale),
      );
      expect(treeMatrix(tree).elements).toEqual(before.elements);
      expect(treeMatrix({ ...tree, species: 'jacaranda' }).elements).toEqual(before.elements);
      expect(treeVariant(tree)).toBe(0);
    }
  });

  it('models each new species at its real size, in three shapes', () => {
    const feet: Record<Exclude<TreeSpecies, 'jacaranda'>, [number, number]> = {
      eucalyptus: [45, 60], ornamental: [12, 18], fanPalm: [50, 70], ficus: [30, 35],
    };
    for (const [species, [lo, hi]] of Object.entries(feet) as Array<[keyof typeof feet, [number, number]]>) {
      const { variants } = TREE_SPECIES[species];
      expect(variants).toHaveLength(3);
      for (const v of variants) {
        expect(v.height / 0.3048).toBeGreaterThanOrEqual(lo);
        expect(v.height / 0.3048).toBeLessThanOrEqual(hi);
        // The crown sits up in the tree and stays inside it.
        for (const [, y, , r] of v.crowns) {
          expect(y).toBeGreaterThan(v.height * 0.35);
          expect(y - r).toBeGreaterThan(0);
          expect(y).toBeLessThan(v.height);
        }
      }
    }
  });

  it('varies a row from its seeds, the same way every time', () => {
    const row: TreePlacement[] = Array.from({ length: 12 }, (_, i) => ({ at: [i * 18 * F, 0, -60 * F], yaw: 0, species: 'eucalyptus' }));
    expect(new Set(row.map(treeVariant)).size).toBe(3);
    const matrices = row.map((tree) => treeMatrix(tree).elements.join());
    expect(new Set(matrices).size).toBe(row.length);
    expect(row.map((tree) => treeMatrix(tree).elements.join())).toEqual(matrices);
    // An explicit seed or variant wins over the position, and variants wrap.
    const tree: TreePlacement = { at: [0, 0, 0], yaw: 30, species: 'fanPalm', seed: 7 };
    const shape = (t: TreePlacement) => treeMatrix(t).elements.slice(0, 12);
    expect(shape({ ...tree, at: [90, 0, -40] })).toEqual(shape(tree));
    expect(shape({ ...tree, seed: 8 })).not.toEqual(shape(tree));
    expect(treeVariant({ ...tree, variant: 4 })).toBe(1);
    expect(treeVariant({ ...tree, variant: -1 })).toBe(2);
    // A seeded jacaranda varies too.
    const jac: TreePlacement = { at: [0, 0, 0], height: 30 * F, yaw: 0 };
    expect(treeMatrix({ ...jac, seed: 3 }).elements).not.toEqual(treeMatrix(jac).elements);
  });

  it('stands each tree on its foot at its height, with only a slight lean', () => {
    for (const species of TREE_SPECIES_IDS) {
      for (let seed = 0; seed < 9; seed++) {
        const tree: TreePlacement = { at: [40, 3, -70], yaw: seed * 40, species, seed, height: 40 * F };
        const m = treeMatrix(tree);
        expect(new Vector3().applyMatrix4(m).toArray()).toEqual([40, 3, -70].map((v) => expect.closeTo(v, 9)));
        const top = new Vector3(0, TREE_SPECIES[species].variants[treeVariant(tree)].height, 0).applyMatrix4(m);
        expect(top.y - 3).toBeGreaterThan(40 * F * 0.99);
        expect(top.y - 3).toBeLessThanOrEqual(40 * F + 1e-9);
        expect(Math.hypot(top.x - 40, top.z + 70)).toBeLessThan(40 * F * Math.tan((5 * Math.PI) / 180));
      }
      // No height: the variant's modelled one.
      const own: TreePlacement = { at: [0, 0, 0], yaw: 0, species, variant: 0 };
      expect(treeHeight(own)).toBeCloseTo(TREE_SPECIES[species].variants[0].height * METRE, 9);
    }
  });

  it('puts each tree’s crown spheres where its crown is drawn', () => {
    const tree: TreePlacement = { at: [100, 2, -50], height: 50 * F, yaw: 90, species: 'eucalyptus', variant: 1, seed: 11 };
    const spheres = treeCrowns(tree);
    const { crowns, height } = TREE_SPECIES.eucalyptus.variants[1];
    expect(spheres).toHaveLength(crowns.length);
    const m = treeMatrix(tree);
    const scale = (50 * F) / height;
    spheres.forEach(({ center, radius }, i) => {
      const [x, y, z, r] = crowns[i];
      expect(center).toEqual(new Vector3(x, y, z).applyMatrix4(m).toArray().map((v) => expect.closeTo(v, 9)));
      expect(radius).toBeGreaterThanOrEqual(r * scale);
      expect(radius).toBeLessThanOrEqual(r * scale * 1.13);
      expect(center[1]).toBeGreaterThan(2 + 50 * F * 0.4);
    });
    // Turning the tree turns its crown about its foot: +90° takes +x to −z.
    const plain = treeCrowns({ at: [0, 0, 0], height: 60 * F, yaw: 0 });
    const turned = treeCrowns({ at: [0, 0, 0], height: 60 * F, yaw: 90 });
    plain.forEach(({ center: [x, y, z], radius }, i) => {
      expect(turned[i].center).toEqual([z, y, -x].map((v) => expect.closeTo(v, 9)));
      expect(turned[i].radius).toBeCloseTo(radius, 9);
    });
    // All of a spot's trees, in order.
    const trees: TreePlacement[] = [tree, { at: [0, 0, 0], height: 15 * F, yaw: 0, species: 'ornamental' }];
    expect(crownSpheres(trees)).toEqual([...spheres, ...treeCrowns(trees[1])]);
  });
});

describe('tree models', () => {
  it('names each part by variant and role', () => {
    expect(treePart('trunk')).toEqual({ variant: 0, role: 'trunk' });
    expect(treePart('leaves_1')).toEqual({ variant: 0, role: 'leaves' });
    expect(treePart('b_bark')).toEqual({ variant: 1, role: 'bark' });
    expect(treePart('c_leaves')).toEqual({ variant: 2, role: 'leaves' });
  });

  for (const species of TREE_SPECIES_IDS.filter((s) => s !== 'jacaranda')) {
    it(`${species}: matches its table, its crowns hold its leaves, and stays small`, async () => {
      const parts = meshes((await model(species)).scene);
      const { variants } = TREE_SPECIES[species];
      expect([...parts.keys()].sort()).toEqual(['a_bark', 'a_leaves', 'b_bark', 'b_leaves', 'c_bark', 'c_leaves']);
      variants.forEach((v, i) => {
        const letter = 'abc'[i];
        const all = [...parts.get(`${letter}_bark`)!, ...parts.get(`${letter}_leaves`)!];
        expect(Math.max(...all.map((p) => p.y))).toBeCloseTo(v.height, 2);
        expect(Math.min(...all.map((p) => p.y))).toBeLessThan(0.05);
        const leaves = parts.get(`${letter}_leaves`)!;
        const held = leaves.filter((p) => v.crowns.some(([x, y, z, r]) => p.distanceTo(new Vector3(x, y, z)) <= r * 1.25));
        expect(held.length / leaves.length).toBeGreaterThan(0.85);
      });
      const bytes = [`${FILES[species]}.glb`, `${FILES[species]}_bark.jpg`, `${FILES[species]}_leaves.webp`]
        .reduce((sum, name) => sum + statSync(asset(name)).size, 0);
      expect(bytes).toBeLessThan(320_000);
    });
  }
});

describe('StreetProps trees', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws each species and variant a spot asks for, and nothing it does not', async () => {
    const models = Object.fromEntries(await Promise.all(TREE_SPECIES_IDS.map(async (s) => [s, await model(s)] as const)));
    const loaded: string[] = [];
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async (url: string) => {
      const species = TREE_SPECIES_IDS.find((s) => url.endsWith(`/${FILES[s]}.glb`))!;
      loaded.push(species);
      return models[species];
    });
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
    const trees: TreePlacement[] = [
      { at: [0, 0, 0], height: 30 * F, yaw: 10 },
      { at: [50, 0, 0], height: 25 * F, yaw: 70 },
      { at: [0, 0, 90], yaw: 0, species: 'fanPalm', variant: 0 },
      { at: [30, 0, 90], yaw: 0, species: 'fanPalm', variant: 2 },
      { at: [60, 0, 90], yaw: 45, species: 'fanPalm', variant: 2, seed: 4 },
    ];
    const props = new StreetProps({ trees });
    await props.ready;
    expect(loaded.sort()).toEqual(['fanPalm', 'jacaranda']);
    const drawn = props.group.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh);
    // The jacaranda's three parts, and the palm's bark and leaves for the two variants used.
    expect(drawn.map((m) => `${m.name}:${m.count}`).sort()).toEqual(
      ['a_bark:1', 'a_leaves:1', 'branches:2', 'c_bark:2', 'c_leaves:2', 'leaves:2', 'trunk:2'],
    );
    const at = new Matrix4();
    drawn.find((m) => m.name === 'trunk')!.getMatrixAt(1, at);
    close(at, treeMatrix(trees[1]));
    drawn.find((m) => m.name === 'c_leaves')!.getMatrixAt(1, at);
    close(at, treeMatrix(trees[4]));
    props.dispose();
  });

  it('hazes with the stock set light unless a spot passes its own', async () => {
    const jacaranda = await model('jacaranda');
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async () => jacaranda);
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
    const shaders = async (props: StreetProps) => {
      await props.ready;
      const out = props.group.children
        .filter((o): o is InstancedMesh => o instanceof InstancedMesh)
        .map((m) => (m.material as ShaderMaterial).fragmentShader);
      props.dispose();
      return out;
    };
    const trees: TreePlacement[] = [{ at: [0, 0, 0], height: 30 * F, yaw: 10 }];
    const stock = await shaders(new StreetProps({ trees }));
    const own = await shaders(new StreetProps({ trees }, { color: '#cdd5d6', from: 1305, to: 26100, amount: 0.5 }));
    expect(stock.length).toBe(3);
    for (const s of stock) {
      expect(s).toContain('float haze = 0.72 * smoothstep(2400.0, 12000.0, length(vWorld - cameraPosition)');
      expect(s).toContain('return mix(color, vec3(0.776, 0.816, 0.8), haze);');
    }
    for (const s of own) {
      expect(s).toContain('float haze = 0.5000 * smoothstep(1305.0, 26100.0, length(vWorld - cameraPosition)');
      expect(s).not.toContain('vec3(0.776, 0.816, 0.8)');
    }
  });
});
