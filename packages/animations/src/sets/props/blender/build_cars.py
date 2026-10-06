"""Model everyday parked cars for the street sets: a sedan, a hatchback and an SUV.

Each body is lofted from cross-sections along its length (rounded below
the beltline, the greenhouse leaning in above it), smoothed with a
subdivision surface, its wheel arches cut out; then wheels, lights, grille,
mirrors and plates are added. Every part carries a surface number (paint,
glass, trim, tire, rim, lamps, plate) in a vertex attribute, and ambient
occlusion is baked into the vertex colors, so each car draws as one mesh in
one material: the vertex color carries the occlusion in red and the surface
number (/8) in green. Paint color is the instance's own (streetProps.ts).

    blender -b --factory-startup --python build_cars.py -- <out dir>
"""
import bpy, bmesh, os, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = sys.argv[sys.argv.index("--") + 1]
os.makedirs(OUT, exist_ok=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# Surface numbers, shared with streetProps.ts.
PAINT, GLASS, TRIM, TIRE, RIM, HEAD, TAIL, PLATE = range(8)


def lerp_keys(keys, s):
    """Piecewise-linear value at s from [(s, value), ...] sorted by s."""
    if s <= keys[0][0]:
        return keys[0][1]
    for (s0, v0), (s1, v1) in zip(keys, keys[1:]):
        if s <= s1:
            t = (s - s0) / (s1 - s0)
            return v0 + (v1 - v0) * t
    return keys[-1][1]


# Profiles along the car, s = 0 at the rear bumper, 1 at the front. Heights in metres.
CARS = {
    "sedan": dict(
        length=4.72, width=1.82, wheelbase=2.80, wheel=0.33, front_overhang=0.95,
        bottom=[(0, 0.30), (0.08, 0.20), (0.92, 0.20), (1, 0.32)],
        belt=[(0, 0.86), (0.04, 0.99), (0.20, 1.02), (0.30, 1.0), (0.62, 0.98), (0.92, 0.86), (1, 0.70)],
        roof=[(0, 0.86), (0.04, 0.99), (0.17, 1.03), (0.33, 1.42), (0.55, 1.45), (0.66, 1.03), (1, 0.70)],
        half=[(0, 0.80), (0.05, 0.88), (0.5, 0.91), (0.94, 0.88), (1, 0.74)],
        glass=(0.18, 0.65), pillars=[0.445],
    ),
    "hatchback": dict(
        length=4.20, width=1.78, wheelbase=2.60, wheel=0.32, front_overhang=0.88,
        bottom=[(0, 0.32), (0.06, 0.21), (0.92, 0.21), (1, 0.33)],
        belt=[(0, 0.95), (0.05, 1.02), (0.62, 1.0), (0.92, 0.88), (1, 0.72)],
        roof=[(0, 0.95), (0.03, 1.10), (0.10, 1.44), (0.55, 1.48), (0.67, 1.03), (1, 0.72)],
        half=[(0, 0.80), (0.05, 0.86), (0.5, 0.89), (0.94, 0.86), (1, 0.73)],
        glass=(0.04, 0.66), pillars=[0.18, 0.44],
    ),
    "suv": dict(
        length=4.75, width=1.90, wheelbase=2.82, wheel=0.37, front_overhang=0.95,
        bottom=[(0, 0.42), (0.07, 0.30), (0.92, 0.30), (1, 0.44)],
        belt=[(0, 1.10), (0.04, 1.16), (0.62, 1.12), (0.9, 1.05), (1, 0.92)],
        roof=[(0, 1.10), (0.02, 1.30), (0.06, 1.72), (0.58, 1.76), (0.70, 1.15), (1, 0.92)],
        half=[(0, 0.86), (0.05, 0.93), (0.5, 0.95), (0.95, 0.93), (1, 0.82)],
        glass=(0.03, 0.69), pillars=[0.17, 0.44],
    ),
}

RING = 18     # points round a cross-section
SLICES = 22   # cross-sections along the car


def section(p, s):
    """Cross-section at s: points (y, z) round from the bottom center, counter-clockwise seen from the front."""
    half = lerp_keys(p["half"], s) * p["width"] / 1.82
    bottom, belt, roof = lerp_keys(p["bottom"], s), lerp_keys(p["belt"], s), lerp_keys(p["roof"], s)
    cabin = roof - belt
    top_half = half * 0.74  # the greenhouse leans in (tumblehome)
    pts = []
    # Lower body: a squared ellipse from the bottom middle round the side to the beltline.
    for i in range(8):
        a = -math.pi / 2 + (i / 7) * math.pi / 2  # bottom middle → side → beltline corner
        c, si = math.cos(a), math.sin(a)
        y = half * math.copysign(abs(c) ** 0.35, c)
        z = (bottom + belt) / 2 + (belt - bottom) / 2 * math.copysign(abs(si) ** 0.6, si)
        pts.append((y, z))
    # Shoulder, then the greenhouse side up to the roof's edge, then across the roof.
    pts.append((half * 0.97, belt + 0.02))
    if cabin > 0.02:
        pts.append((top_half + (half - top_half) * 0.15, belt + cabin * 0.85))
        pts.append((top_half * 0.92, roof - 0.01))
    else:
        pts.append((half * 0.9, belt + 0.03))
        pts.append((half * 0.75, belt + 0.04))
    pts.append((0.0, roof + (0.015 if cabin > 0.02 else 0.04)))
    # The other side, mirrored.
    right = pts[1:-1]
    full = pts + [(-y, z) for (y, z) in reversed(right)]
    return full


def surface_of(p, s, k, n):
    """Which surface a body face is: glass in the greenhouse sides and screens, paint elsewhere."""
    g0, g1 = p["glass"]
    cabin = lerp_keys(p["roof"], s) - lerp_keys(p["belt"], s)
    side_glass = k in (8, 9, n - 10, n - 9)
    if g0 < s < g1 and cabin > 0.12:
        if side_glass and all(abs(s - q) > 0.018 for q in p["pillars"]):
            return GLASS
        # Windshield and rear window: the roof's slopes.
        roof_k = k in (10, 11, n - 11)
        slope = abs(lerp_keys(p["roof"], min(1, s + 0.02)) - lerp_keys(p["roof"], max(0, s - 0.02))) / 0.04
        if roof_k and slope > 2.0:
            return GLASS
    return PAINT


def body(name, p):
    bm = bmesh.new()
    rings = []
    for j in range(SLICES + 1):
        s = j / SLICES
        x = (s - 0.5) * p["length"]
        rings.append([bm.verts.new((x, y, z)) for (y, z) in section(p, s)])
    # Each end turns in on itself in a small inset ring before it's capped, so the
    # smoothing rounds the bumper over instead of pinching a big flat cap.
    def inset(ring, dx):
        # Narrowed to a thin upright sliver: the bumper wraps round to it, and its cap is too thin to pinch.
        pts = [v.co.copy() for v in ring]
        mid = sum(pts, Vector()) / len(pts)
        return [bm.verts.new((p.x + dx, mid.y + (p.y - mid.y) * 0.08, mid.z + (p.z - mid.z) * 0.8)) for p in pts]
    rings.insert(0, inset(rings[0], -0.06))
    rings.append(inset(rings[-1], 0.06))
    n = len(rings[0])
    surf = bm.faces.layers.int.new("surface")
    for j in range(len(rings) - 1):
        s = min(1.0, max(0.0, (j - 0.5) / SLICES))
        for k in range(n):
            a, b = rings[j][k], rings[j][(k + 1) % n]
            c, d = rings[j + 1][(k + 1) % n], rings[j + 1][k]
            f = bm.faces.new((a, d, c, b))
            f[surf] = surface_of(p, s, k, n)
    # Close the ends.
    for ring, flip in ((rings[0], False), (rings[-1], True)):
        f = bm.faces.new(list(reversed(ring)) if not flip else ring)
        f[surf] = PAINT
    # Faces out, whichever way round the loft wound them.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for f in me.polygons:
        f.material_index = 0
    sub = obj.modifiers.new("sub", 'SUBSURF')
    sub.levels = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="sub")
    return obj


def cylinder(name, center, radius, width, verts=32, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=width, location=center,
                                        rotation=(math.pi / 2, 0, 0) if axis == 'Y' else (0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    return o


def tag(obj, surface):
    me = obj.data
    if "surface" not in me.attributes:
        me.attributes.new("surface", 'INT', 'FACE')
    vals = [surface] * len(me.polygons)
    me.attributes["surface"].data.foreach_set("value", vals)


def build(name, p):
    car = body(name, p)
    half_w = p["width"] / 2
    wheel_x = [p["length"] / 2 - p["front_overhang"], p["length"] / 2 - p["front_overhang"] - p["wheelbase"]]
    r = p["wheel"]
    # Wheel arches.
    for x in wheel_x:
        for side in (1, -1):
            cut = cylinder("arch", (x, side * half_w, r + 0.02), r + 0.06, 0.7)
            mod = car.modifiers.new("arch", 'BOOLEAN')
            mod.object = cut
            mod.operation = 'DIFFERENCE'
            mod.solver = 'EXACT'
            bpy.context.view_layer.objects.active = car
            bpy.ops.object.modifier_apply(modifier="arch")
            bpy.data.objects.remove(cut, do_unlink=True)
    parts = [car]
    # Wheels: a rounded tire, a rim with five spokes, a dark well behind.
    for x in wheel_x:
        for side in (1, -1):
            y = side * (half_w - 0.14)
            tire = cylinder("tire", (x, y, r), r, 0.22, 28)
            bev = tire.modifiers.new("bev", 'BEVEL'); bev.width = 0.05; bev.segments = 3
            bpy.ops.object.modifier_apply(modifier="bev")
            tag(tire, TIRE)
            rim = cylinder("rim", (x, y + side * 0.112, r), r * 0.64, 0.02, 24)
            tag(rim, RIM)
            parts += [tire, rim]
            for k in range(5):
                a = k * math.tau / 5
                bpy.ops.mesh.primitive_cube_add(size=1, location=(x + math.cos(a) * r * 0.32, y + side * 0.125, r + math.sin(a) * r * 0.32),
                                                rotation=(0, -a, 0))
                spoke = bpy.context.active_object
                spoke.scale = (r * 0.62, 0.02, 0.05)
                bpy.ops.object.transform_apply(scale=True)
                tag(spoke, TRIM)
                parts.append(spoke)
            well = cylinder("well", (x, side * (half_w - 0.32), r + 0.03), r + 0.05, 0.12, 24)
            tag(well, TRIM)
            parts.append(well)
    L = p["length"] / 2
    belt_front, belt_rear = lerp_keys(p["belt"], 0.97), lerp_keys(p["belt"], 0.03)
    bottom_front, bottom_rear = lerp_keys(p["bottom"], 0.98), lerp_keys(p["bottom"], 0.02)
    # Trim sits on the body's actual surface: found by casting at it from outside.
    tree = BVHTree.FromObject(car, bpy.context.evaluated_depsgraph_get())

    def onto(origin, direction):
        hit, *_ = tree.ray_cast(Vector(origin), Vector(direction), 10.0)
        return hit

    def box(center, size, surface, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=center, rotation=rot)
        o = bpy.context.active_object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True)
        bev = o.modifiers.new("bev", 'BEVEL'); bev.width = min(size) * 0.3; bev.segments = 2
        bpy.ops.object.modifier_apply(modifier="bev")
        tag(o, surface)
        parts.append(o)
        return o

    def on_end(y, z, size, surface, front, proud=0.3):
        """A part on the nose (front) or tail, `proud` of its depth standing out of the body."""
        sign = 1 if front else -1
        hit = onto((sign * (L + 2), y, z), (-sign, 0, 0))
        if hit is None:
            return
        box((hit.x - sign * size[0] * (0.5 - proud), y, z), size, surface)

    lamp_z = (belt_front + bottom_front) / 2 + 0.1
    tail_z = (belt_rear + bottom_rear) / 2 + 0.12
    for side in (1, -1):
        on_end(side * half_w * 0.66, lamp_z, (0.1, half_w * 0.36, 0.08), HEAD, True)
        on_end(side * half_w * 0.7, tail_z, (0.1, half_w * 0.32, 0.1), TAIL, False)
        # Mirrors on the doors at the base of the windshield.
        mx = (p["glass"][1] - 0.5) * p["length"] - 0.12
        mz = lerp_keys(p["belt"], p["glass"][1]) + 0.06
        hit = onto((mx, side * (half_w + 2), mz), (0, -side, 0))
        if hit is not None:
            box((mx, hit.y + side * 0.07, mz), (0.16, 0.16, 0.11), PAINT)
    on_end(0, lamp_z - 0.03, (0.08, half_w * 0.72, 0.15), TRIM, True)            # grille
    on_end(0, bottom_front + 0.13, (0.04, 0.52, 0.12), PLATE, True, 0.6)           # front plate
    on_end(0, tail_z - 0.12, (0.04, 0.52, 0.12), PLATE, False, 0.6)               # rear plate
    on_end(0, bottom_front + 0.03, (0.12, half_w * 1.6, 0.09), TRIM, True, 0.25)  # lower bumper lips
    on_end(0, bottom_rear + 0.03, (0.12, half_w * 1.6, 0.09), TRIM, False, 0.25)
    # The body's own surfaces (paint, glass) came with the loft, as its face attribute.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = car
    bpy.ops.object.join()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return car


def split_surfaces(obj):
    """Separate vertices where surfaces meet, so a per-vertex surface number is exact."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    layer = bm.faces.layers.int.get("surface")
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0][layer] != e.link_faces[1][layer]]
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


scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.device = 'CPU'
if scene.world is None:
    scene.world = bpy.data.worlds.new("w")
scene.world.light_settings.distance = 1.2
built = []
for i, (name, p) in enumerate(CARS.items()):
    car = build(name, p)
    # The body's lofted faces keep their glass tags; the join merged the attribute.
    split_surfaces(car)
    for poly in car.data.polygons:
        poly.use_smooth = True
    car.location = (0, i * 4.0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    attr = car.data.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
    car.data.color_attributes.active_color = attr
    built.append(car)
# A ground for the occlusion under the cars.
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 4, 0))
ground = bpy.context.active_object
for car in built:
    bpy.ops.object.select_all(action='DESELECT')
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    car.location = (0, 0, 0)
    # Occlusion in red; the surface number (/8) in green, so it survives packing as a color.
    me = car.data
    surface = [0.0] * len(me.vertices)
    me.attributes["_SURFACE"].data.foreach_get("value", surface)
    col = [0.0] * (len(me.vertices) * 4)
    me.color_attributes["Col"].data.foreach_get("color", col)
    for i, sv in enumerate(surface):
        col[i * 4 + 1] = (sv + 0.5) / 8.0
        col[i * 4 + 2] = 0.0
    me.color_attributes["Col"].data.foreach_set("color", col)
    me.attributes.remove(me.attributes["_SURFACE"])
    print("CAR", car.name, "verts", len(car.data.vertices), "tris", sum(len(f.vertices) - 2 for f in car.data.polygons))
bpy.data.objects.remove(ground, do_unlink=True)
for car in built:
    car.data.materials.clear()
    car.data.materials.append(bpy.data.materials.new("car"))
bpy.ops.object.select_all(action='DESELECT')
for car in built:
    car.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "cars.raw.glb"), export_format='GLB', use_selection=True, export_yup=True,
    export_materials='PLACEHOLDER', export_texcoords=False, export_normals=True,
    export_vertex_color='NAME', export_vertex_color_name='Col', export_attributes=False,
)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "cars.blend"))
