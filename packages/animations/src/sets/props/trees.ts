import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../camera/view';
import { SET_FOOT } from '../setScale';

/**
 * Tree species for the street props, and where each placed tree stands:
 * its instance matrix and its crown spheres. Pure data and math, so set
 * code (the ground shader's dappled shade, say) can use it without
 * loading a model; streetProps.ts loads and draws the GLBs.
 *
 * - `jacaranda`: the Poly Haven scan (blender/build_tree.py), one shape.
 * - `eucalyptus`: a tall campus gum, pale mottled trunk, high drooping crown (45-60 ft).
 * - `ornamental`: a young street tree, thin trunk, a few upright limbs each ending in a loose tuft (12-18 ft).
 * - `fanPalm`: a Mexican fan palm, thin curved trunk, small head of fans over a skirt of dead fronds (50-70 ft).
 * - `ficus`: an old Los Angeles street fig, smooth grey trunk clear to about 9 ft, stout limbs sweeping
 *   out into a broad, dense, clipped crown, flat underneath; the crown sits a few feet off the trunk
 *   toward +z at yaw 0, as street trees clipped back from the traffic grow (30-35 ft).
 *
 * The last four are grown by blender/build_species.py, three variants each.
 */
export type TreeSpecies = 'jacaranda' | 'eucalyptus' | 'ornamental' | 'fanPalm' | 'ficus';

export const TREE_SPECIES_IDS: readonly TreeSpecies[] = ['jacaranda', 'eucalyptus', 'ornamental', 'fanPalm', 'ficus'];

/**
 * A tree standing at `at` (the set's coordinates, y up), turned `yaw` degrees.
 *
 * Without `species` it is a jacaranda, drawn exactly as before species
 * existed. `height` scales it (world units, to the top of the crown);
 * omitted, the variant keeps its modelled height. The other species pick
 * one of their variants and vary a little (crown width, a slight lean)
 * from `seed`, which defaults to a hash of `at`, so a row never looks
 * cloned and a spot always draws the same row. `variant` picks a shape
 * outright (wrapping round the species' count). A jacaranda varies only
 * when given a `seed`.
 */
export interface TreePlacement {
  at: Vec3;
  height?: number;
  yaw: number;
  species?: TreeSpecies;
  variant?: number;
  seed?: number;
}

/** A ball of foliage, in the set's units: where a tree's crown casts its shade. */
export interface CrownSphere {
  center: Vec3;
  radius: number;
}

/** [x, y, z, radius] in the model's metres, y up, about the trunk's foot. */
type Sphere = readonly [number, number, number, number];

interface Variant {
  /** Modelled height, metres, to the top of the crown. */
  height: number;
  /** Crown spheres covering the foliage. */
  crowns: readonly Sphere[];
}

interface Species {
  variants: readonly Variant[];
  /** Seeded variation: crown width ±`width` (fraction), lean up to `lean` degrees. */
  width: number;
  lean: number;
}

/**
 * Heights and crown spheres as measured from the models: the jacaranda's
 * from its leaf cards (k-means over the card centres), the rest as printed
 * by build_species.py (its crowns.json). Rebuilding a model means updating
 * its row; streetProps.test.ts checks the two agree.
 */
export const TREE_SPECIES: Record<TreeSpecies, Species> = {
  jacaranda: {
    variants: [
      { height: 19.47, crowns: [[1.381, 11.564, 4.471, 7.563], [-7.361, 11.073, 0.068, 6.858], [-1.915, 11.795, -4.029, 6.599], [5.754, 10.144, -2.293, 6.306]] },
    ],
    width: 0.08,
    lean: 0,
  },
  eucalyptus: {
    variants: [
      { height: 14.886, crowns: [[-1.003, 9.342, -1.525, 2.782], [4.216, 11.068, -0.282, 3.207], [-1.236, 10.657, 2.438, 3.277], [0.301, 12.053, 0.79, 2.994], [1.576, 11.476, -2.174, 2.753]] },
      { height: 17.478, crowns: [[2.102, 11.335, -0.091, 3.346], [4.226, 12.474, -3.88, 4.484], [-0.238, 9.524, -2.445, 3.519], [-1.793, 9.182, 2.086, 3.592], [-3.289, 13.228, 2.08, 3.957]] },
      { height: 13.898, crowns: [[2.93, 9.136, -1.836, 2.702], [1.192, 9.511, 1.668, 2.752], [-3.048, 9.349, -1.342, 3.109], [-0.817, 10.564, -2.284, 2.868], [2.99, 10.905, 1.614, 2.956]] },
    ],
    width: 0.12,
    lean: 3,
  },
  ornamental: {
    variants: [
      { height: 4.813, crowns: [[0.007, 3.816, 0.017, 1.301]] },
      { height: 5.122, crowns: [[-0.246, 4.124, -0.273, 1.576]] },
      { height: 4.108, crowns: [[0.148, 3.131, -0.105, 1.314]] },
    ],
    width: 0.12,
    lean: 2,
  },
  fanPalm: {
    variants: [
      { height: 19.189, crowns: [[0.382, 16.95, 0.452, 2.249]] },
      { height: 20.909, crowns: [[-0.502, 18.45, -0.759, 2.197]] },
      { height: 16.963, crowns: [[-0.028, 14.45, 0.361, 2.103]] },
    ],
    width: 0.1,
    lean: 4,
  },
  ficus: {
    variants: [
      { height: 10.127, crowns: [[-0.29, 7.35, -1.446, 2.85], [-1.534, 7.35, 1.972, 2.85], [2.048, 7.35, 1.341, 2.85]] },
      { height: 10.456, crowns: [[0.269, 7.6, -1.159, 2.95], [-2.069, 7.6, 1.627, 2.95], [1.513, 7.6, 2.259, 2.95]] },
      { height: 9.935, crowns: [[0.161, 7.05, -1.314, 2.7], [-1.843, 7.05, 1.074, 2.7], [1.228, 7.05, 1.615, 2.7]] },
    ],
    width: 0.06,
    lean: 2,
  },
};

/** Set units per metre (the sets are laid out in feet of SET_FOOT units). */
const METRE = SET_FOOT / 0.3048;

/** A well-mixed number in [0, 1) from a seed and a stream. */
function random(seed: number, stream: number): number {
  let h = Math.imul((seed | 0) ^ Math.imul(stream + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const speciesOf = (tree: TreePlacement): TreeSpecies => tree.species ?? 'jacaranda';

/** The tree's seed: its own, or one from where it stands. */
export function treeSeed(tree: TreePlacement): number {
  if (tree.seed !== undefined) return tree.seed | 0;
  const [x, , z] = tree.at;
  return (Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(z * 16), 19349663)) | 0;
}

/** Which of its species' variants the tree is drawn as. */
export function treeVariant(tree: TreePlacement): number {
  const count = TREE_SPECIES[speciesOf(tree)].variants.length;
  if (tree.variant !== undefined) return ((Math.floor(tree.variant) % count) + count) % count;
  return Math.floor(random(treeSeed(tree), 0) * count);
}

/** The world height the tree stands, to the top of its crown. */
export function treeHeight(tree: TreePlacement): number {
  return tree.height ?? TREE_SPECIES[speciesOf(tree)].variants[treeVariant(tree)].height * METRE;
}

const UP = new Vector3(0, 1, 0);

/** Where the tree's model is drawn: its foot at `at`, turned, scaled to its height, and varied by its seed. */
export function treeMatrix(tree: TreePlacement): Matrix4 {
  const species = speciesOf(tree);
  const model = TREE_SPECIES[species];
  const scale = treeHeight(tree) / model.variants[treeVariant(tree)].height;
  const turn = new Quaternion().setFromAxisAngle(UP, (tree.yaw * Math.PI) / 180);
  const at = new Vector3(...tree.at);
  if (species === 'jacaranda' && tree.seed === undefined) {
    return new Matrix4().compose(at, turn, new Vector3(scale, scale, scale));
  }
  const seed = treeSeed(tree);
  const wide = 1 + (random(seed, 1) * 2 - 1) * model.width;
  const leanToward = random(seed, 2) * Math.PI * 2;
  const lean = (random(seed, 3) * model.lean * Math.PI) / 180;
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(Math.cos(leanToward), 0, Math.sin(leanToward)), lean);
  return new Matrix4().compose(at, tilt.multiply(turn), new Vector3(scale * wide, scale, scale * wide));
}

/** The tree's crown spheres in the set's units: centre and radius, each a ball of its foliage. */
export function treeCrowns(tree: TreePlacement): CrownSphere[] {
  const matrix = treeMatrix(tree);
  const grow = matrix.getMaxScaleOnAxis();
  return TREE_SPECIES[speciesOf(tree)].variants[treeVariant(tree)].crowns.map(([x, y, z, r]) => ({
    center: new Vector3(x, y, z).applyMatrix4(matrix).toArray() as Vec3,
    radius: r * grow,
  }));
}

/** Every placed tree's crown spheres, in placement order. */
export const crownSpheres = (trees: readonly TreePlacement[]): CrownSphere[] => trees.flatMap(treeCrowns);
