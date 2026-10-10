# Street prop assets

Built by the scripts in `../blender/`; don't edit by hand.

| File | Made from |
|---|---|
| `jacaranda.glb`, `jacaranda_trunk.jpg`, `jacaranda_branches.jpg`, `jacaranda_leaves.webp` | Poly Haven's [Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree) (CC0), rebuilt by `build_tree.py`: real trunk and limbs, twigs dropped and decimated; the 120k modelled fronds replaced by ~1,200 leaf-clump cards textured with clumps of the real fronds rendered from above. |
| `cars.glb` | Original, modelled by `build_cars.py` (a sedan, a hatchback, an SUV). |

Poly Haven assets are CC0: no attribution required.

## Rebuild

```sh
# The tree: download Poly Haven's jacaranda_tree glTF (1k) first.
blender -b --factory-startup --python ../blender/build_tree.py -- <jacaranda_tree.gltf> <work dir> jacaranda
blender -b --factory-startup --python ../blender/build_cars.py -- <work dir>
# Then meshopt-compress each *.raw.glb into this folder (positions and UVs kept float):
npx gltfpack@0.24.0 -i <work dir>/jacaranda.raw.glb -o jacaranda.glb -c -vpf -vtf -vn 10 -kn -km -kv
npx gltfpack@0.24.0 -i <work dir>/cars.raw.glb -o cars.glb -c -vpf -vn 10 -kn -km -kv
# and copy the tree's textures here.
```
