# Second Session — Blender robot prototype

Original robot sculptures for the animation playground, using the familiar
Swivel, Scuffy, Gutsy and Nosy palettes. This experiment is isolated from the
production renderers.

## Visual design

Broad, beveled helmet shells surround inset navy display faces. Layered enamel
chassis panels sit over dark rubber joints; the limbs have separate guards,
mechanical pivots, mitts and skate shoes with toe caps, laces and cream soles.
Swivel has an offset antenna, Scuffy a cap brim, Gutsy reinforced crown ribs and
narrow eyes, and Nosy paired antennae. Each helmet/face is grouped under a
`Variant.0`–`Variant.3` node. The viewer switches these with the robot palette.

The Three.js viewer uses physical materials, a studio reflection environment,
warm directional light and cool rim light. Thin silhouette outlines only occur
on the large shell pieces. The original skate spot and trick catalog remain.
The timeline slider pauses and scrubs the animation for inspecting poses.

## Files and ownership

- `blender/generate_prototype.py`: deterministic geometry and editable rig source.
- `blender/generated/*.blend`: generated editable Blender scenes, including sample kickflip clips.
- `../../public/blender-prototype/*.glb`: generated browser assets.
- `BlenderPrototype.tsx`: viewer, materials, lighting and preview controls.
- `poseFromFrame.ts`: binds the joint hierarchy to shared animation physics.
- `rig.test.ts`: loads the actual GLB with GLTFLoader to verify joint binding,
  articulation and exclusive character selection.

Joint names are normalized by GLTFLoader (for example, `Rig.Head` becomes
`RigHead`). Binding must accept both names. Baked GLB clips are ignored in the
browser; `@skrobot/animations` owns trick motion. Do not copy that engine here.
The new shell proportions are independently authored; leg lengths remain 35
art units per segment to honor the existing foot-target contract.

## Regenerate and verify

From the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python skrobot-animations/src/blender-prototype/blender/generate_prototype.py
npm run typecheck:animations
npm test
npm --prefix skrobot-animations run build
```

Open the playground's Blender prototype mode. Check all four robot selections,
regular/goofy stances, land/bail and the timeline at pop, flip, catch and landing.
Reload the preview after renderer changes so the scene effect is recreated.
