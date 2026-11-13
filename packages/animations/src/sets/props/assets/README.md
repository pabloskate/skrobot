# Street prop assets

Built by the scripts in `../blender/`; don't edit by hand.

| File | Made from |
|---|---|
| `jacaranda.glb`, `jacaranda_trunk.jpg`, `jacaranda_branches.jpg`, `jacaranda_leaves.webp` | Poly Haven's [Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree) (CC0), rebuilt by `build_tree.py`: real trunk and limbs, twigs dropped and decimated; the 120k modelled fronds replaced by ~1,200 leaf-clump cards textured with clumps of the real fronds rendered from above. |
| `cars.glb` | CC0 1.0 automotive models (BlenderKit `cc_zero`: `bd89753e`, `1d0e2c6c`, `8063f534`), rebuilt by `build_cars.py`: de-badged, simplified to phone budgets with smooth revolved tires, surface-tagged, and Cycles AO baked into vertex colors. |
| `eucalyptus.glb`, `eucalyptus_bark.jpg`, `eucalyptus_leaves.webp` | Original, grown by `build_species.py`: three tall campus gums (45-60 ft), pale mottled trunks, high drooping crowns. |
| `ornamental.glb`, `ornamental_bark.jpg`, `ornamental_leaves.webp` | Original, grown by `build_species.py`: three young street trees (12-18 ft), thin trunks forking at half height into loose, open tufts. |
| `fan_palm.glb`, `fan_palm_bark.jpg`, `fan_palm_leaves.webp` | Original, grown by `build_species.py`: three Mexican fan palms (50-70 ft), thin curved trunks, small grey-green fan heads over skirts of dead fronds. |
| `ficus.glb`, `ficus_bark.jpg`, `ficus_leaves.webp` | Original, grown by `build_species.py`: three Indian laurel figs (30-35 ft), the clipped Los Angeles street tree: broad flat-bottomed crowns of small dark glossy leaves on stout limbs, a fluted grey trunk whitewashed at its foot, roots lifting the well. The bark texture's left half is bare bark, its right half the whitewash. |

The `build_species.py` models and textures are procedural: no scans or photos.
Each GLB holds three variants as node pairs `a_bark`/`a_leaves`, `b_bark`/... .
The bark textures tile (they repeat up the trunk); the leaves are a 2x2 atlas.
After rebuilding one, copy the heights and crown spheres it prints (and
writes to `crowns.json`) into `TREE_SPECIES` in `../trees.ts`;
`streetProps.test.ts` checks the two agree.

Poly Haven assets are CC0: no attribution required.

## Rebuild

```sh
# The tree: download Poly Haven's jacaranda_tree glTF (1k) first.
blender -b --factory-startup --python ../blender/build_tree.py -- <jacaranda_tree.gltf> <work dir> jacaranda
blender -b --factory-startup --python ../blender/build_cars.py -- <work dir>
# The other species (all four, or name some: eucalyptus ornamental fan_palm ficus):
blender -b --factory-startup --python ../blender/build_species.py -- <work dir>
# Then meshopt-compress each *.raw.glb into this folder (positions and UVs kept float):
npx gltfpack@0.24.0 -i <work dir>/jacaranda.raw.glb -o jacaranda.glb -c -vpf -vtf -vn 10 -kn -km -kv
npx gltfpack@0.24.0 -i <work dir>/cars.raw.glb -o cars.glb -c -vpf -vn 10 -kn -km -kv
for t in eucalyptus ornamental fan_palm ficus; do
  npx gltfpack@0.24.0 -i <work dir>/$t.raw.glb -o $t.glb -c -vpf -vtf -vn 10 -kn -km -kv
done
# and copy the trees' textures (*_trunk/_branches/_bark.jpg, *_leaves.webp) here.
```
