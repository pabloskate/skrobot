# Building the realistic skater

`build_skater.py` makes everything in `../assets/` from MakeHuman's CC0
assets: the skinned body and default rig (163 bones: five vertebrae, three
neck bones, limb twist bones, fingers, eyes, lids, jaw), the eyes, brows,
lashes, tee and jeans, and shoes; it models the beanie itself. On the way
it:

- bakes the body's shape and drops the skin the clothes cover, then pulls
  the strip MakeHuman keeps under each hem a few millimetres deeper, so a
  sleeve bent differently from the arm under it can't show skin through;
- hands the jeans' thigh weights over to the shin across a short band at
  the knee joint, so a bent knee bends there instead of bowing the whole
  leg like an arch;
- moves most of the tee's thigh weights to the pelvis, so a raised knee
  lifts the hem instead of dragging it between the legs;
- re-cuts the suit's skin-tight fit into a skater's: slice by slice the
  tee's body and the jeans' legs are laid on their convex hulls (cloth
  bridges hollows instead of following every dip of the body), the tee
  then hangs straight down from the chest, the legs open to a relaxed
  straight leg and the sleeves widen toward the hem. Tight clothes showed
  every dent the skinning puts in a body, and read as leggings;
- fits the beanie over the skull (a shrinkwrapped sphere cut along a brim
  line, with a folded cuff and some slack at the crown);
- bakes ambient occlusion into the body's, beanie's, and shoes' vertex
  colors;
- scales it all to the trick rig's world units (a 1.8 m adult whose legs
  reach the rig's ankles) and exports one skinned GLB, meshopt-compressed
  with gltfpack;
- re-encodes the textures, and derives a short haircut's coverage from
  another MakeHuman skin.

## Setup (once)

1. Blender 4.2 or newer.
2. The MPFB extension (MakeHuman for Blender) from extensions.blender.org:
   `blender --command extension install-file --repo user_default --enable mpfb.zip`.
3. MakeHuman's asset packs "MakeHuman system assets" and "Skins 02"
   (<https://static.makehumancommunity.org/assets/assetpacks.html>),
   unzipped into MPFB's user data directory
   (`~/Library/Application Support/Blender/<version>/extensions/.user/user_default/mpfb/data`
   on macOS), so it has `skins/`, `clothes/`, `eyes/`, `eyebrows/`, ….
4. Node (the script runs `npx gltfpack`).

## Build

```sh
blender -b --python packages/animations/src/riders/realistic/blender/build_skater.py -- packages/animations/src/riders/realistic/assets
blender -b --python packages/animations/src/riders/realistic/blender/build_skater.py -- packages/animations/src/riders/realistic/assets alien
```

The second makes `alien.glb`: the same body, rig and clothes, reshaped by
MakeHuman's head and hand targets (`ALIEN_TARGETS`: a domed cranium over a
small, narrow face, a small nose and mouth, ears down to nubs, long thin
fingers), each eye widened into an almond tilted up at its outer corner
(`EYE_WARP`, about the eye bones' heads, so the eye and lid bones stay put),
the little fingers capped off at the knuckle, and no brows, lashes, or
beanie. Its eyes ride the head bone: they're solid black, so the lids carry
the look. It writes no textures (it wears the skater's).

Then check the skater in `/explore?skater=realistic` from a few angles, in
both stances and a slam, and run `npm test` (`realisticHuman3d.test.ts`
loads the built GLB: soles on the rig's soles, no stretched bones, knees
forward, a slammed body above the ground).

Shapes and fits that the shaders depend on are named constants on both
sides: the beanie's knit center and brim (`BEANIE_CENTER`, `BEANIE_BRIM` in
`realisticHuman3d.ts`), the shoe's sole height, and the tee as the top half
of the outfit texture.
