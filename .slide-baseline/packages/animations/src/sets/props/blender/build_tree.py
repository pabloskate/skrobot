"""Build a phone-sized street tree from a Poly Haven (CC0) tree scan.

The source jacaranda is ~3.9M triangles. This keeps its real trunk and limbs
(twigs dropped, the rest decimated) and replaces its 120k modelled fronds
with leaf-clump cards: a few clumps of the real fronds are rendered from
above into a cut-out atlas, and the canopy is filled with crossed cards
where the fronds actually are, so the tree keeps its own silhouette.

    blender -b --factory-startup --python build_tree.py -- <source .gltf> <out dir> [name]
"""
import bpy, bmesh, os, sys, math, random, tempfile
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = args[0], args[1]
NAME = args[2] if len(args) > 2 else "street_tree"
os.makedirs(OUT, exist_ok=True)
random.seed(7)
rng = np.random.default_rng(7)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=SRC)
src = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# One object per material.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
parts = {}
for o in bpy.context.selected_objects:
    m = o.data.materials[o.data.polygons[0].material_index].name
    key = 'leaves' if 'lea' in m else 'trunk' if 'trunk' in m else 'branches'
    o.name = key
    parts[key] = o
print("PARTS", {k: len(v.data.polygons) for k, v in parts.items()})

# Ground the tree at its trunk base, in metres, y up (Blender z up here).
trunk_pts = np.array([v.co[:] for v in parts['trunk'].data.vertices])
base = Vector((float(np.median(trunk_pts[:, 0])), float(np.median(trunk_pts[:, 1])), float(trunk_pts[:, 2].min())))
for o in parts.values():
    o.data.transform(Matrix.Translation(-base))
height = max(max(v.co.z for v in o.data.vertices) for o in parts.values())
print("HEIGHT", round(height, 2))


def islands(bm):
    """Connected face sets of a bmesh, as lists of faces."""
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, group = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            group.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(group)
    return out


# ---------- Limbs: drop the twigs, decimate the rest ----------
def thin(obj, min_size, ratio):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    dropped = []
    for group in islands(bm):
        pts = [v.co for f in group for v in f.verts]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        if (hi - lo).length < min_size:
            dropped.extend(group)
    bmesh.ops.delete(bm, geom=dropped, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    dec = obj.modifiers.new("dec", 'DECIMATE')
    dec.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="dec")
    print("LIMB", obj.name, "dropped", len(dropped), "now", len(obj.data.polygons))


thin(parts['trunk'], 0.0, 0.025)
thin(parts['branches'], 1.2, 0.012)

# ---------- Leaves: where they are ----------
leaves = parts['leaves']
me = leaves.data
n = len(me.polygons)
centers = np.zeros(n * 3, dtype=np.float32)
areas = np.zeros(n, dtype=np.float32)
me.polygons.foreach_get("center", centers)
me.polygons.foreach_get("area", areas)
centers = centers.reshape(-1, 3)
CELL = 1.7 * height / 24.0  # metres; ~1.7 m on the 24 m source tree
cells = {}
keys = np.floor(centers / CELL).astype(np.int64)
for k, c, a in zip(map(tuple, keys), centers, areas):
    e = cells.get(k)
    if e is None:
        cells[k] = [c * a, a]
    else:
        e[0] += c * a
        e[1] += a
area_all = np.array([e[1] for e in cells.values()])
keep_floor = np.percentile(area_all, 40)
canopy = [(e[0] / e[1], e[1]) for e in cells.values() if e[1] >= keep_floor]
weights = np.array([a for _, a in canopy])
center = sum((Vector(c) * a for c, a in canopy), Vector()) / float(weights.sum())
print("CELLS", len(cells), "kept", len(canopy), "canopy center", tuple(round(x, 2) for x in center))

# ---------- Clump atlas: the real fronds, rendered from above ----------
TILE = 512
TILES = 2  # 2x2 atlas
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = scene.render.resolution_y = TILE
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
if scene.world is None:
    scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.0

# Emission of the frond albedo, cut out where the atlas is black; deeper fronds darker.
leaf_src = me.materials[0]
tex_img = next(nd.image for nd in leaf_src.node_tree.nodes if nd.type == 'TEX_IMAGE' and 'diff' in nd.image.name)
clump_mat = bpy.data.materials.new("clump")
clump_mat.use_nodes = True
nt = clump_mat.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = tex_img
sep = nt.nodes.new("ShaderNodeSeparateColor")
mx1 = nt.nodes.new("ShaderNodeMath"); mx1.operation = 'MAXIMUM'
mx2 = nt.nodes.new("ShaderNodeMath"); mx2.operation = 'MAXIMUM'
cut = nt.nodes.new("ShaderNodeMath"); cut.operation = 'GREATER_THAN'; cut.inputs[1].default_value = 0.06
geo = nt.nodes.new("ShaderNodeNewGeometry")
sepz = nt.nodes.new("ShaderNodeSeparateXYZ")
depth = nt.nodes.new("ShaderNodeMapRange")
depth.inputs[1].default_value = -CELL * 0.6
depth.inputs[2].default_value = CELL * 0.6
depth.inputs[3].default_value = 0.55
depth.inputs[4].default_value = 1.0
emit = nt.nodes.new("ShaderNodeEmission")
mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0
transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
mix = nt.nodes.new("ShaderNodeMixShader")
L = nt.links.new
L(tex.outputs['Color'], sep.inputs['Color'])
L(sep.outputs[0], mx1.inputs[0]); L(sep.outputs[1], mx1.inputs[1])
L(mx1.outputs[0], mx2.inputs[0]); L(sep.outputs[2], mx2.inputs[1])
L(mx2.outputs[0], cut.inputs[0])
L(geo.outputs['Position'], sepz.inputs[0])
L(sepz.outputs['Z'], depth.inputs[0])
L(tex.outputs['Color'], mul.inputs[6])
L(depth.outputs[0], mul.inputs[7])
L(mul.outputs[2], emit.inputs['Color'])
L(cut.outputs[0], mix.inputs[0])
L(transparent.outputs[0], mix.inputs[1])
L(emit.outputs[0], mix.inputs[2])
L(mix.outputs[0], out.inputs['Surface'])

cam_data = bpy.data.cameras.new("cam")
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# Middling cells make the best clumps: full, with light through the gaps.
dense = sorted(canopy, key=lambda ca: -ca[1])
picks = [dense[int(len(dense) * q)] for q in (0.22, 0.3, 0.38, 0.46)]
tile_files = []
for t, (c, _) in enumerate(picks):
    c = Vector(c)
    bm = bmesh.new()
    bm.from_mesh(me)
    # A ball of fronds, so the clump's outline is ragged and round, never a cube's.
    radius = CELL * 0.6
    outside = [f for f in bm.faces if (f.calc_center_median() - c).length > radius]
    bmesh.ops.delete(bm, geom=outside, context='FACES')
    clump_me = bpy.data.meshes.new(f"clump{t}")
    bm.to_mesh(clump_me)
    bm.free()
    clump_me.transform(Matrix.Translation(-c))
    clump_me.materials.clear()
    clump_me.materials.append(clump_mat)
    clump = bpy.data.objects.new(f"clump{t}", clump_me)
    scene.collection.objects.link(clump)
    for o in parts.values():
        o.hide_render = True
    cam_data.ortho_scale = CELL * 1.3
    cam.location = (0, 0, CELL * 3)
    cam.rotation_euler = (0, 0, random.uniform(0, math.pi))
    f = os.path.join(tempfile.gettempdir(), f"{NAME}_clump{t}.png")
    scene.render.filepath = f
    bpy.ops.render.render(write_still=True)
    tile_files.append(f)
    bpy.data.objects.remove(clump, do_unlink=True)

atlas = np.zeros((TILE * TILES, TILE * TILES, 4), dtype=np.float32)
for t, f in enumerate(tile_files):
    img = bpy.data.images.load(f)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE, TILE, 4)
    r, c = divmod(t, TILES)
    atlas[r * TILE:(r + 1) * TILE, c * TILE:(c + 1) * TILE] = px
# Bleed leaf color into the cut-out area so filtering at the alpha edge never shows black.
rgb, a = atlas[..., :3], atlas[..., 3:4]
bleed = rgb.copy()
mask = a[..., 0] > 0.5
for _ in range(12):
    shifted = [np.roll(bleed, s, axis=ax) for ax in (0, 1) for s in (-1, 1)]
    masks = [np.roll(mask, s, axis=ax) for ax in (0, 1) for s in (-1, 1)]
    acc = sum(sh * m[..., None] for sh, m in zip(shifted, masks))
    cnt = sum(m.astype(np.float32) for m in masks)[..., None]
    fill = (~mask[..., None]) & (cnt > 0)
    bleed = np.where(fill, acc / np.maximum(cnt, 1), bleed)
    mask = mask | (cnt[..., 0] > 0)
atlas[..., :3] = bleed
out_img = bpy.data.images.new(f"{NAME}_leaves", TILE * TILES, TILE * TILES, alpha=True)
out_img.pixels.foreach_set(atlas.ravel())
out_img.file_format = 'WEBP'
out_img.filepath_raw = os.path.join(OUT, f"{NAME}_leaves.webp")
bpy.context.scene.render.image_settings.quality = 88
out_img.save(quality=88)

# ---------- Canopy cards ----------
bm = bmesh.new()
uv_layer = bm.loops.layers.uv.new("UVMap")
shade_layer = bm.verts.layers.float_color.new("Col")
reach = max((Vector(c) - center).length for c, _ in canopy)
SIZE = CELL * 1.35
for c, a in canopy:
    c = Vector(c) + Vector(rng.normal(0, CELL * 0.12, 3))
    outward = (c - center)
    outward.z *= 0.6
    outward = outward.normalized() if outward.length > 1e-6 else Vector((0, 0, 1))
    # Deeper in the canopy is darker (light comes in from outside).
    shade = 0.55 + 0.45 * min(1.0, (Vector(c) - center).length / reach) ** 0.7
    tile = random.randrange(TILES * TILES)
    tr, tc = divmod(tile, TILES)
    u0, v0 = tc / TILES, 1 - (tr + 1) / TILES
    for k in range(2):
        if k == 0:
            normal = outward
        else:
            yaw = random.uniform(0, math.tau)
            normal = Vector((math.cos(yaw), math.sin(yaw), random.uniform(-0.3, 0.3))).normalized()
        side = normal.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        upv = side.cross(normal).normalized()
        spin = random.uniform(0, math.tau)
        side, upv = side * math.cos(spin) + upv * math.sin(spin), -side * math.sin(spin) + upv * math.cos(spin)
        s = SIZE * random.uniform(0.85, 1.15) * 0.5
        corners = [c - side * s - upv * s, c + side * s - upv * s, c + side * s + upv * s, c - side * s + upv * s]
        verts = [bm.verts.new(p) for p in corners]
        for v in verts:
            v[shade_layer] = (shade, shade, shade, 1.0)
        face = bm.faces.new(verts)
        for loop, (u, v) in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv_layer].uv = (u0 + (0.02 + 0.96 * u) / TILES, v0 + (0.02 + 0.96 * v) / TILES)
cards_me = bpy.data.meshes.new("leaves")
bm.to_mesh(cards_me)
bm.free()
# Lighting normals: out from the canopy's middle, so the crown shades as one soft volume.
normals = []
for loop in cards_me.loops:
    p = cards_me.vertices[loop.vertex_index].co
    d = p - center
    d.z *= 0.8
    normals.append(d.normalized())
cards_me.normals_split_custom_set(normals)
cards = bpy.data.objects.new("leaves", cards_me)
scene.collection.objects.link(cards)
bpy.data.objects.remove(leaves, do_unlink=True)
print("CARDS", len(cards_me.polygons))

# ---------- Export ----------
for name, o in (("trunk", parts['trunk']), ("branches", parts['branches']), ("leaves", cards)):
    o.name = name
    o.data.name = name
    for poly in o.data.polygons:
        poly.use_smooth = True
    mat = o.data.materials[0] if o.data.materials and name != 'leaves' else bpy.data.materials.new(name)
    mat.name = name
    o.data.materials.clear()
    o.data.materials.append(mat)
bpy.ops.object.select_all(action='DESELECT')
for o in (parts['trunk'], parts['branches'], cards):
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, f"{NAME}.raw.glb"), export_format='GLB', use_selection=True, export_yup=True,
    export_materials='PLACEHOLDER', export_image_format='NONE', export_texcoords=True, export_normals=True,
    export_vertex_color='NAME', export_vertex_color_name='Col', export_attributes=True,
)


def save(img, name, size):
    if img.size[0] != size:
        img.scale(size, size)
    img.file_format = 'JPEG'
    img.save(filepath=os.path.join(OUT, name), quality=86)


tex_dir = os.path.dirname(SRC)
for key, size in (("trunk", 512), ("branches", 512)):
    path = next(os.path.join(tex_dir, "textures", f) for f in os.listdir(os.path.join(tex_dir, "textures")) if key in f and "diff" in f)
    save(bpy.data.images.load(path, check_existing=False), f"{NAME}_{key}.jpg", size)
print("HEIGHT_M", round(height, 3), "CENTER", tuple(round(x, 3) for x in center))
