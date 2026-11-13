"""Build phone-sized realistic street cars from CC0 BlenderKit source models.

Follows the same pipeline as build_tree.py: imports high-detail CC0 1.0 Public
Domain automotive models (a modern street coupe/sedan, a stock compact
sportback/hatchback with its aftermarket wing removed, and a classic boxy SUV),
strips all badges/emblems/text, replaces 90k-poly tread-block tire soup with
clean revolved tires fitted to the original alloy rims, simplifies dense meshes
to a mobile budget (~42k-67k tris per car), maps every material to CAR_SURFACES
(streetProps.ts), bakes Cycles ambient occlusion against a ground plane into
vertex color red, and packs the surface id (/16) into vertex color green.

CC0 1.0 sources (BlenderKit cc_zero):
  - sedan:     bd89753e-31e2-4223-8d86-3b850115c10f
  - hatchback: 1d0e2c6c-2889-4009-9be5-628f3f04229c
  - suv:       8063f534-1304-45f9-8c0e-a4e3c8714f6d

    blender -b --factory-startup --python build_cars.py -- <src dir> <out dir>
"""
import bpy, bmesh, os, sys, math, json, uuid, urllib.request
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
if len(args) == 1:
    SRC_DIR = os.path.join(args[0], "src")
    OUT = args[0]
else:
    SRC_DIR, OUT = args[0], args[1]
os.makedirs(SRC_DIR, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

# Surface numbers, shared with streetProps.ts (CAR_SURFACES).
PAINT, GLASS, TRIM, TIRE, RIM, HEAD, TAIL, PLATE, CHROME, AMBER = range(10)

CC0_SOURCES = {
    "sedan": ("bd89753e-31e2-4223-8d86-3b850115c10f", 4.78),
    "hatchback": ("1d0e2c6c-2889-4009-9be5-628f3f04229c", 4.32),
    "suv": ("8063f534-1304-45f9-8c0e-a4e3c8714f6d", 3.94),
}


def ensure_source(label, asset_id):
    """Use cached <label>.blend in SRC_DIR, or fetch CC0 blend from BlenderKit."""
    path = os.path.join(SRC_DIR, f"{label}.blend")
    if os.path.exists(path):
        return path
    url = f"https://www.blenderkit.com/api/v1/assets/{asset_id}/?format=json"
    asset = json.loads(urllib.request.urlopen(url).read())
    assert asset["license"] == "cc_zero", f"Expected cc_zero, got {asset['license']}"
    files = {f["fileType"]: f for f in asset["files"] if not f["isThumbnail"]}
    chosen = files.get("resolution_0_5K") or files.get("blend")
    sep = "&" if "?" in chosen["downloadUrl"] else "?"
    dl = json.loads(urllib.request.urlopen(f"{chosen['downloadUrl']}{sep}scene_uuid={uuid.uuid4()}").read())
    req = urllib.request.Request(dl["filePath"], headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(path, "wb") as fp:
        fp.write(resp.read())
    return path


def connected_islands(bm):
    seen, out = set(), []
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, grp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            grp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(grp)
    return out


def add_revolved_tire(bm_tire, x0, x1, cy, cz, r_in, r_out, segs=36):
    """Add a smooth, watertight revolved tire along axle X between x0..x1 around (cy, cz)."""
    cx = (x0 + x1) * 0.5
    hw = (x1 - x0) * 0.5
    sh = r_out - max(0.014, (r_out - r_in) * 0.22)
    rmid = (r_in + r_out) * 0.5
    # Closed cross-section loop in (local_x, radius).
    prof = [
        (-hw * 0.78, r_in),
        (-hw * 0.98, rmid),
        (-hw * 0.94, sh),
        (-hw * 0.72, r_out),
        (0.0, r_out + 0.003),
        (hw * 0.72, r_out),
        (hw * 0.94, sh),
        (hw * 0.98, rmid),
        (hw * 0.78, r_in),
    ]
    rings = []
    for i in range(segs):
        a = i * math.tau / segs
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm_tire.verts.new((cx + lx, cy + ca * pr, cz + sa * pr)) for (lx, pr) in prof])
    n = len(prof)
    for i in range(segs):
        ni = (i + 1) % segs
        for j in range(n):
            nj = (j + 1) % n
            bm_tire.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))


def surface_for_sedan(obj_name, mat_name):
    if obj_name == "Circle":
        return CHROME
    if mat_name.startswith("Carbon fiber"):
        return PAINT
    if mat_name in ("Material.004", "Material.022"):
        return GLASS
    if mat_name in ("Material.009", "Material.011"):
        return HEAD
    if mat_name in ("Material.005", "Material.007", "Material.010"):
        return TAIL
    if mat_name in ("tire", "Material.002"):
        return TIRE
    if mat_name in ("disk.001", "disk.002", "bolt"):
        return RIM
    return TRIM


def surface_for_hatchback(obj_name, mat_name, face_center_z):
    if mat_name == "carpaint":
        return PAINT
    if mat_name in ("Glass_Rough", "mirror"):
        return GLASS
    if mat_name == "Black_Glass":
        return GLASS if face_center_z > 0.80 else TRIM
    if mat_name == "WhiteLight":
        return HEAD
    if mat_name == "RedLight":
        return TAIL
    if mat_name == "BlinkerGlass":
        return AMBER
    if mat_name == "Heated Metal":
        return CHROME
    if mat_name == "tire":
        return TIRE
    if mat_name in ("disk.001", "bolt"):
        return RIM
    return TRIM


def surface_for_suv(obj_name, mat_name):
    if mat_name == "Car Paint":
        return PAINT
    if mat_name == "Black Opaque  Glass":
        return GLASS
    if mat_name in ("Condensation on chrome", "Chrome"):
        return CHROME
    if mat_name in ("Automotive led lights", "Automotive led lights.001"):
        return HEAD
    if mat_name == "Carlight triangle chrome red":
        return TAIL
    if mat_name == "Carlight triangle chrome orange":
        return AMBER
    if mat_name == "TireProcedural":
        return TIRE
    if obj_name.startswith("Front tire") and mat_name in ("Material", "Material.001"):
        return RIM
    return TRIM


def decimate_mesh_obj(obj, ratio):
    if ratio >= 0.999 or len(obj.data.polygons) < 80:
        return
    bpy.context.view_layer.objects.active = obj
    dec = obj.modifiers.new("dec", 'DECIMATE')
    dec.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="dec")


def load_and_convert(label, blend_path, target_length):
    """Import source .blend, de-badge, simplify to mobile budget, and return one surface-tagged object."""
    keep = {o.name for o in bpy.data.objects if o.name.startswith("__built_")}
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)

    imported = []
    for o in data_to.objects:
        if o is None:
            continue
        bpy.context.scene.collection.objects.link(o)
        imported.append(o)

    bpy.context.view_layer.update()

    drop_sedan = {"Text", "Circle.001", "Circle.004", "Plane.008", "Plane.072", "Plane.076", "Plane.009"}
    mesh_objs = []
    for o in imported:
        if o.type != 'MESH' or o.hide_render:
            continue
        if label == "sedan" and any(o.name == d or o.name.startswith(d + ".") for d in drop_sedan):
            continue
        if label == "suv" and (o.name == "Chrome.002" or o.name.startswith("Chrome.002.")):
            continue

        for m in list(o.modifiers):
            if m.type == 'WIREFRAME':
                o.modifiers.remove(m)
            elif m.type == 'SUBSURF':
                if label == "suv":
                    lvl = 0
                else:
                    lvl = 0 if len(o.data.polygons) > 500 else 1
                m.levels = lvl
                m.render_levels = lvl
        mesh_objs.append(o)

    deps = bpy.context.evaluated_depsgraph_get()
    buckets = {s: bmesh.new() for s in range(10)}
    wheel_buckets = {s: bmesh.new() for s in (TIRE, RIM, TRIM)}

    for o in mesh_objs:
        eo = o.evaluated_get(deps)
        me = eo.to_mesh()
        if not len(me.polygons):
            eo.to_mesh_clear()
            continue
        mw = eo.matrix_world.copy()
        raw_mats = [ms.material.name if ms.material else "" for ms in eo.material_slots]

        bm = bmesh.new()
        bm.from_mesh(me)
        eo.to_mesh_clear()
        bm.transform(mw)

        if label == "hatchback" and o.name.startswith("body"):
            drop_faces = set()
            for f in bm.faces:
                mn = raw_mats[f.material_index] if f.material_index < len(raw_mats) else ""
                if any(mn.startswith(k) for k in ("Emblem", "WingBolts", "Clear Plastic", "ClearPlastic")):
                    drop_faces.add(f)
            for grp in connected_islands(bm):
                ys = [v.co.y for f in grp for v in f.verts]
                zs = [v.co.z for f in grp for v in f.verts]
                if (min(ys) > 1.95 and min(zs) > 1.00) or max(zs) > 1.48:
                    drop_faces.update(grp)
            if drop_faces:
                bmesh.ops.delete(bm, geom=list(drop_faces), context='FACES')

        is_wheel = any(k in o.name for k in ("Sports wheel", "Wheel", "Front tire"))

        # On sedan & hatchback, replace 90k-poly tread-block tire soup with a clean revolved tire!
        revolve_tire = is_wheel and label in ("sedan", "hatchback")
        tire_pts = []
        rim_pts = []

        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        for f in bm.faces:
            mn = raw_mats[f.material_index] if f.material_index < len(raw_mats) else ""
            if label == "sedan":
                surf = surface_for_sedan(o.name, mn)
            elif label == "hatchback":
                if mn.startswith("Emblem"):
                    continue
                surf = surface_for_hatchback(o.name, mn, f.calc_center_median().z)
            else:
                surf = surface_for_suv(o.name, mn)

            if revolve_tire and surf == TIRE:
                for v in f.verts:
                    tire_pts.append(v.co.copy())
                continue
            if revolve_tire and surf == RIM:
                for v in f.verts:
                    rim_pts.append(v.co.copy())

            target_bm = wheel_buckets[surf] if (is_wheel and surf in wheel_buckets) else buckets[surf]
            new_verts = [target_bm.verts.new(v.co) for v in f.verts]
            try:
                target_bm.faces.new(new_verts)
            except ValueError:
                pass

        if revolve_tire and tire_pts:
            x0 = min(p.x for p in tire_pts)
            x1 = max(p.x for p in tire_pts)
            y0, y1 = min(p.y for p in tire_pts), max(p.y for p in tire_pts)
            z0, z1 = min(p.z for p in tire_pts), max(p.z for p in tire_pts)
            cy, cz = (y0 + y1) * 0.5, (z0 + z1) * 0.5
            r_out = max(y1 - y0, z1 - z0) * 0.5
            if rim_pts:
                r_rim = max(math.hypot(p.y - cy, p.z - cz) for p in rim_pts)
                r_in = min(r_out * 0.84, max(r_out * 0.58, r_rim - 0.008))
            else:
                r_in = r_out * 0.72
            add_revolved_tire(wheel_buckets[TIRE], x0, x1, cy, cz, r_in, r_out, segs=36)

        bm.free()

    for o in list(bpy.data.objects):
        if not o.name.startswith("__built_"):
            bpy.data.objects.remove(o, do_unlink=True)

    # Tuned decimation ratios so the three cars land around ~42k-67k clean tris (~1.35 MB total GLB).
    body_ratios = {
        "sedan": {PAINT: 0.32, TRIM: 0.15, GLASS: 0.60, HEAD: 0.75, TAIL: 0.60, CHROME: 0.25},
        "hatchback": {PAINT: 0.36, TRIM: 0.24, GLASS: 0.75, HEAD: 0.85, TAIL: 0.75, CHROME: 0.20, AMBER: 1.0},
        "suv": {PAINT: 0.32, TRIM: 0.09, CHROME: 0.12, GLASS: 0.60, HEAD: 0.25, TAIL: 0.35, AMBER: 0.40},
    }[label]
    wheel_ratios = {
        "sedan": {TIRE: 1.0, RIM: 0.045, TRIM: 0.02},
        "hatchback": {TIRE: 1.0, RIM: 0.045, TRIM: 0.02},
        "suv": {TIRE: 0.055, RIM: 0.09, TRIM: 0.06},
    }[label]

    parts = []
    for is_whl, bdict, rdict in ((False, buckets, body_ratios), (True, wheel_buckets, wheel_ratios)):
        for surf, bm in bdict.items():
            if not len(bm.faces):
                bm.free()
                continue
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new(f"part_{surf}_{is_whl}")
            bm.to_mesh(me)
            bm.free()
            obj = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(obj)
            decimate_mesh_obj(obj, rdict.get(surf, 0.5))

            bm2 = bmesh.new()
            bm2.from_mesh(obj.data)
            sharp = [e for e in bm2.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(58.0)]
            if sharp:
                bmesh.ops.split_edges(bm2, edges=sharp)
            bm2.to_mesh(obj.data)
            bm2.free()

            obj.data.attributes.new("surface", 'INT', 'FACE')
            obj.data.attributes["surface"].data.foreach_set("value", [surf] * len(obj.data.polygons))
            parts.append(obj)

    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    car = bpy.context.active_object
    car.name = f"__built_{label}"
    car.data.materials.clear()

    # Rotate +90 deg about Z so nose (-Y in all 3 sources) points +X, center X/Y, ground Z at 0, scale uniformly.
    rot = Matrix.Rotation(math.pi / 2, 4, 'Z')
    car.data.transform(rot)
    xs = [v.co.x for v in car.data.vertices]
    ys = [v.co.y for v in car.data.vertices]
    zs = [v.co.z for v in car.data.vertices]
    cx = (min(xs) + max(xs)) * 0.5
    cy = (min(ys) + max(ys)) * 0.5
    min_z = min(zs)
    cur_len = max(xs) - min(xs)
    scale = target_length / cur_len
    xform = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-cx, -cy, -min_z)))
    car.data.transform(xform)
    car.data.update()

    for poly in car.data.polygons:
        poly.use_smooth = True

    return car


def finalize_surface_attribute(obj):
    """Ensure vertices are separated across surface boundaries and store _SURFACE per vertex."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.faces.layers.int.get("surface")
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][layer] != e.link_faces[1][layer]]
    if edges:
        bmesh.ops.split_edges(bm, edges=edges)
    bm.to_mesh(obj.data)
    bm.free()

    me = obj.data
    vals = [0] * len(me.polygons)
    me.attributes["surface"].data.foreach_get("value", vals)
    point = [0.0] * len(me.vertices)
    for poly, v in zip(me.polygons, vals):
        for vi in poly.vertices:
            point[vi] = float(v)
    attr = me.attributes.new("_SURFACE", 'FLOAT', 'POINT')
    attr.data.foreach_set("value", point)
    me.attributes.remove(me.attributes["surface"])


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

built = []
for label, (asset_id, target_len) in CC0_SOURCES.items():
    blend_path = ensure_source(label, asset_id)
    car = load_and_convert(label, blend_path, target_len)
    finalize_surface_attribute(car)
    built.append(car)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.device = 'CPU'
if scene.world is None:
    scene.world = bpy.data.worlds.new("w")
scene.world.light_settings.distance = 1.2

for i, car in enumerate(built):
    clean_name = car.name.replace("__built_", "")
    car.name = clean_name
    car.data.name = clean_name
    car.location = (0, i * 5.0, 0)
    attr = car.data.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    car.data.color_attributes.active_color = attr

bpy.ops.mesh.primitive_plane_add(size=50, location=(0, 5.0, 0))
ground = bpy.context.active_object

for car in built:
    bpy.ops.object.select_all(action='DESELECT')
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    car.location = (0, 0, 0)
    me = car.data
    surface = [0.0] * len(me.vertices)
    me.attributes["_SURFACE"].data.foreach_get("value", surface)
    col = [0.0] * (len(me.vertices) * 4)
    me.color_attributes["Col"].data.foreach_get("color", col)
    for i, sv in enumerate(surface):
        col[i * 4 + 1] = (sv + 0.5) / 16.0
        col[i * 4 + 2] = 0.0
    me.color_attributes["Col"].data.foreach_set("color", col)
    me.attributes.remove(me.attributes["_SURFACE"])
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    tris = sum(len(f.vertices) - 2 for f in me.polygons)
    print(f"CAR {car.name:10s} verts={len(me.vertices):6d} tris={tris:6d} size=({max(xs)-min(xs):.2f}, {max(ys)-min(ys):.2f}, {max(zs)-min(zs):.2f})")

bpy.data.objects.remove(ground, do_unlink=True)
shared_mat = bpy.data.materials.new("car")
for car in built:
    car.data.materials.clear()
    car.data.materials.append(shared_mat)

bpy.ops.object.select_all(action='DESELECT')
for car in built:
    car.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "cars.raw.glb"), export_format='GLB', use_selection=True, export_yup=True,
    export_materials='PLACEHOLDER', export_texcoords=False, export_normals=True,
    export_vertex_color='NAME', export_vertex_color_name='Col', export_attributes=False,
)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "cars.blend"))
