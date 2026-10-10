"""Build the realistic skater and export the browser assets.

The body, its rig and weights, the eyes, brows, lashes, outfit and shoes are
MakeHuman assets (CC0) put together with MPFB, MakeHuman's Blender add-on.
The beanie is modelled here, fitted over the skull. Everything is scaled to
the trick rig's world units (about a centimetre each) and exported as one
skinned GLB, with its textures re-encoded beside it.

The alien is the same body in the same clothes, reshaped: MakeHuman's head
targets (a domed cranium over a small, narrow face), each eye warped into a
big almond tilted up at its outer corner, long thin fingers and no little
finger, and no brows, lashes, or beanie. It shares the skater's textures.

Needs Blender 4.2+ with the MPFB extension and the MakeHuman asset packs
"makehuman_system_assets" and "skins02" in MPFB's user data (see README.md).

    blender -b --python build_skater.py -- <assets dir> [skater|alien]
"""
import bpy, bmesh, os, sys, math, shutil, subprocess, tempfile
from mathutils.bvhtree import BVHTree
import numpy as np
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.locationservice import LocationService

ARGS = sys.argv[sys.argv.index("--") + 1:]
OUT = ARGS[0]
# Who to build: the skater, or the alien made from him.
LOOK = ARGS[1] if len(ARGS) > 1 else "skater"
assert LOOK in ("skater", "alien"), LOOK
ALIEN = LOOK == "alien"
os.makedirs(OUT, exist_ok=True)
DATA = LocationService.get_user_data()
# Metres to world units: a 1.8 m adult whose legs reach the rig's ankles.
SCALE = 97.0

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

# ---------- The body ----------

macro = TargetService.get_default_macro_info_dict()
macro.update({"gender": 1.0, "age": 0.5, "muscle": 0.62, "weight": 0.42, "proportions": 0.75, "height": 0.6})
macro["race"] = {"caucasian": 0.8, "african": 0.05, "asian": 0.15}
body = HumanService.create_human(macro_detail_dict=macro)

# The alien's head and hands, as MakeHuman targets ("@" for each side), some
# pushed past MakeHuman's own range. Set before the rig, so it fits them.
ALIEN_TARGETS = {
    # A big, rounded cranium over a small face that narrows to the chin.
    "head-age-decr": 1.0, "head-invertedtriangular": 0.6, "head-round": 1.0, "head-oval": 0.4, "head-scale-horiz-incr": 0.5,
    "head-back-scale-depth-incr": 1.0, "forehead-scale-vert-incr": 0.3, "forehead-temple-incr": 1.0,
    "chin-width-decr": 1.0, "chin-bones-decr": 0.5, "chin-prognathism-decr": 0.6, "chin-cleft-decr": 1.0,
    "@-cheek-volume-decr": 1.0, "@-cheek-bones-incr": 0.6,
    # Bigger eyes, opened wider, without bags under them (warped into almonds below).
    "@-eye-scale-incr": 2.0, "@-eye-height1-incr": 1.0, "@-eye-height2-incr": 1.0, "@-eye-height3-incr": 1.0,
    "@-eye-corner1-up": 1.0, "@-eye-bag-decr": 1.0,
    # A small flat nose, a small lipless mouth, ears down to nubs.
    "nose-scale-horiz-decr": 2.0, "nose-scale-vert-decr": 1.5, "nose-scale-depth-decr": 1.8, "nose-volume-decr": 1.5,
    "nose-point-width-decr": 1.0, "nose-nostrils-width-decr": 1.0, "nose-flaring-decr": 1.0,
    "mouth-scale-horiz-decr": 1.0, "mouth-trans-backward": 0.3, "mouth-upperlip-height-decr": 1.0,
    "mouth-upperlip-volume-decr": 1.5, "mouth-lowerlip-volume-decr": 1.5,
    "@-ear-scale-decr": 1.6, "@-ear-flap-decr": 1.0, "@-ear-lobe-decr": 1.0,
    # Long, thin fingers, a little apart.
    "@-hand-fingers-length-incr": 1.0, "@-hand-fingers-diameter-decr": 1.0, "@-hand-fingers-distance-incr": 0.6,
}
if ALIEN:
    for name, weight in ALIEN_TARGETS.items():
        for target in ([name.replace("@", s) for s in ("l", "r")] if "@" in name else [name]):
            key = TargetService.load_target(body, TargetService.target_full_path(target), weight=0.0)
            key.slider_max = max(1.0, weight)
            key.value = weight

rig = HumanService.add_builtin_rig(body, "default")


def add(kind, name, atype):
    return HumanService.add_mhclo_asset(os.path.join(DATA, kind, name, name + ".mhclo"), body,
                                        asset_type=atype, subdiv_levels=0, material_type="MAKESKIN")


parts = {"eyes": add("eyes", "high-poly", "Eyes")}
if not ALIEN:
    parts["brows"] = add("eyebrows", "eyebrow008", "Eyebrows")
    parts["lashes"] = add("eyelashes", "eyelashes01", "Eyelashes")
parts["outfit"] = add("clothes", "male_casualsuit06", "Clothes")
parts["shoes"] = add("clothes", "shoes06", "Clothes")
HumanService.set_character_skin(os.path.join(DATA, "skins", "young_caucasian_male", "young_caucasian_male.mhmat"), body, skin_type="MAKESKIN")

# Bake the shape into the body and drop what the clothes cover, so nothing pokes through.
TargetService.bake_targets(body)
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    if m.type == 'MASK':
        bpy.ops.object.modifier_apply(modifier=m.name)

meshes = {"body": body, **parts}
for role, obj in meshes.items():
    for m in list(obj.modifiers):
        if m.type != 'ARMATURE':
            obj.modifiers.remove(m)


def smooth01(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------- The alien's eyes and hands ----------

# Each eye, its lids and socket, widened into an almond and turned so its outer
# corner rises, about the eyeball's middle (where the eye and lid bones start),
# fading out over the face around it.
EYE_WARP = {"wide": 1.7, "tall": 1.35, "tilt": 22.0, "reach": 0.04, "full": 0.45, "forward": 0.002}


def eye_warp(obj, side):
    center = rig.matrix_world @ rig.data.bones[f"eye.{side}"].head_local
    turn = math.radians(EYE_WARP["tilt"]) * (1 if side == "L" else -1)
    c, s = math.cos(turn), math.sin(turn)
    reach = EYE_WARP["reach"]
    world = obj.matrix_world
    local = world.inverted()
    for v in obj.data.vertices:
        d = world @ v.co - center
        r = math.sqrt(d.x * d.x + d.z * d.z + (0.6 * d.y) ** 2)
        k = 1.0 - smooth01(reach * EYE_WARP["full"], reach, r)
        if k <= 0:
            continue
        x, z = d.x * EYE_WARP["wide"], d.z * EYE_WARP["tall"]
        warped = Vector((x * c - z * s, d.y - EYE_WARP["forward"], x * s + z * c))
        v.co = local @ (center + d + (warped - d) * k)


def drop_little_fingers():
    """Three fingers and a thumb: each little finger cut off at its knuckle, the hole
    capped and smoothed round, its weights handed to the bone of its palm."""
    world = body.matrix_world
    groups = {g.name: g.index for g in body.vertex_groups}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    for side in ("L", "R"):
        knuckle = rig.matrix_world @ rig.data.bones[f"finger5-1.{side}"].head_local
        tip = rig.matrix_world @ rig.data.bones[f"finger5-3.{side}"].tail_local
        along = (tip - knuckle).normalized()
        finger = {groups[f"finger5-{j}.{side}"] for j in (1, 2, 3)}
        on = lambda v: sum(v[deform].get(i, 0.0) for i in finger)
        cut = {v for v in bm.verts if on(v) > 0.5 and (world @ v.co - knuckle).dot(along) > 0}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in cut for v in f.verts)], context='FACES')
        hole = [e for e in bm.edges if e.is_boundary and (world @ e.verts[0].co - knuckle).length < 0.03]
        capped = bmesh.ops.poke(bm, faces=bmesh.ops.holes_fill(bm, edges=hole, sides=0)["faces"])
        for middle in capped["verts"]:
            around = [e.other_vert(middle) for e in middle.link_edges]
            for v in around:
                for i, w in v[deform].items():
                    middle[deform][i] = middle[deform].get(i, 0.0) + w / len(around)
        near = set()
        for f in capped["faces"]:
            near.update(f.verts)
        for v in list(near):
            near.update(e.other_vert(v) for e in v.link_edges)
        for _ in range(4):
            bmesh.ops.smooth_vert(bm, verts=list(near), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        palm = groups[f"metacarpal4.{side}"]
        for v in bm.verts:
            w = on(v)
            if w > 0:
                for i in finger:
                    if i in v[deform]:
                        del v[deform][i]
                v[deform][palm] = v[deform].get(palm, 0.0) + w
        print("ALIEN little finger", side, "cut", len(cut), "capped", len(hole), "edges")
    bm.to_mesh(body.data)
    bm.free()


# The bare cranium, smoothed: the targets leave MakeHuman's scalp stretched into
# facets with a fold up from each ear. It's blended toward a half-ellipsoid over
# the eyes (from a little over them at the front, lower behind), then the scalp
# is subdivided and relaxed.
DOME = {"from": 0.035, "fade": 0.11, "drop": 0.08, "blend": 0.9, "tall": 1.03, "relax": 6}


def smooth_cranium():
    world = body.matrix_world
    local = world.inverted()
    head = body.vertex_groups["head"].index
    eye = rig.matrix_world @ rig.data.bones["eye.L"].head_local
    on_head = {v.index: world @ v.co for v in body.data.vertices if any(g.group == head and g.weight > 0.9 for g in v.groups)}
    front, back = min(p.y for p in on_head.values()), max(p.y for p in on_head.values())

    def start(p):
        return eye.z + DOME["from"] - DOME["drop"] * smooth01(front + 0.3 * (back - front), back, p.y)

    scalp = {i: p for i, p in on_head.items() if p.z > start(p)}
    ys = [p.y for p in scalp.values()]
    middle = Vector((0.0, (min(ys) + max(ys)) / 2, eye.z))
    reach = Vector((max(abs(p.x) for p in scalp.values()), (max(ys) - min(ys)) / 2, (max(p.z for p in scalp.values()) - eye.z) * DOME["tall"]))
    for i, p in scalp.items():
        d = p - middle
        u = Vector((d.x / reach.x, d.y / reach.y, d.z / reach.z))
        if u.length < 1e-6:
            continue
        on = middle + Vector((u.x * reach.x, u.y * reach.y, u.z * reach.z)) / u.length
        k = smooth01(start(p), start(p) + DOME["fade"], p.z) * DOME["blend"]
        body.data.vertices[i].co = local @ (p + (on - p) * k)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    region = {bm.verts[i] for i in scalp}
    edges = list({e for f in bm.faces if all(v in region for v in f.verts) for e in f.edges})
    bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True, smooth=1.0)
    deform = bm.verts.layers.deform.active
    inner = [v for v in bm.verts if not v.is_boundary and v[deform].get(head, 0.0) > 0.85 and (world @ v.co).z > start(world @ v.co) + 0.01]
    for _ in range(DOME["relax"]):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(body.data)
    bm.free()
    print("ALIEN cranium", len(scalp), "scalp vertices smoothed")


if ALIEN:
    for side in ("L", "R"):
        eye_warp(body, side)
        eye_warp(parts["eyes"], side)
    smooth_cranium()
    # Solid black eyes have no iris to aim: they ride the head, and the lids carry the look.
    eyes = parts["eyes"]
    for group in list(eyes.vertex_groups):
        if group.name != "head":
            eyes.vertex_groups.remove(group)
    head = eyes.vertex_groups.get("head") or eyes.vertex_groups.new(name="head")
    head.add(range(len(eyes.data.vertices)), 1.0, 'REPLACE')
    drop_little_fingers()

# The tee hangs from the hips: most of what its hem took from the thighs moves to the
# pelvis, so a raised knee lifts it a little instead of dragging it between the legs.
outfit = parts["outfit"]
uv = outfit.data.uv_layers.active.data
on_tee = [False] * len(outfit.data.vertices)
for loop in outfit.data.loops:
    if uv[loop.index].uv.y > 0.5:
        on_tee[loop.vertex_index] = True
groups = {g.index: g.name for g in outfit.vertex_groups}
root = outfit.vertex_groups.get("root") or outfit.vertex_groups.new(name="root")
moved = 0
for v in outfit.data.vertices:
    if not on_tee[v.index]:
        continue
    for g in list(v.groups):
        if groups.get(g.group, "").startswith("upperleg"):
            take = g.weight * 0.75
            g.weight -= take
            root.add([v.index], take, 'ADD')
            moved += 1
print("TEE weights moved to the pelvis", moved)

# A skater's fit, not the suit's: straight, relaxed jeans and a boxy tee. Tight
# clothes show every dent the skinning puts in the body under them; skaters
# don't wear them anyway.
from mathutils.geometry import convex_hull_2d


def drape(points, ease):
    """Cloth bridges hollows: in a slice of a garment, move each sector of it
    out by the gap between its outermost point and the slice's convex hull
    (plus `ease`), along the line from the slice's middle. Every layer in a
    sector moves together, so a hem's folded-under inside stays under.
    `points` are (vertex, 2D coords) pairs; returns {vertex: new 2D coords}."""
    if len(points) < 4:
        return {}
    flat = [p for _, p in points]
    middle = sum(flat, Vector((0.0, 0.0))) / len(flat)
    hull = [flat[i] - middle for i in convex_hull_2d(flat)]

    def to_hull(d):
        best = None
        for i in range(len(hull)):
            a, b = hull[i], hull[(i + 1) % len(hull)]
            e = b - a
            den = d.x * e.y - d.y * e.x
            if abs(den) < 1e-12:
                continue
            t = (a.x * e.y - a.y * e.x) / den
            u = (a.x * d.y - a.y * d.x) / den
            if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                best = t if best is None else min(best, t)
        return best

    SECTORS = 64
    sector = lambda d: int((math.atan2(d.y, d.x) + math.pi) / (2 * math.pi) * SECTORS) % SECTORS
    outer = [0.0] * SECTORS
    for p in flat:
        d = p - middle
        k = sector(d)
        outer[k] = max(outer[k], d.length)
    moved = {}
    for v, p in points:
        d = p - middle
        r = d.length
        if r < 1e-6:
            continue
        d.normalize()
        reach = to_hull(d)
        if reach is None:
            continue
        gap = max(0.0, reach - outer[sector(d)]) + ease
        moved[v] = middle + d * (r + gap)
    return moved


bones = rig.data.bones
loosened = set()
for v in outfit.data.vertices:
    co = v.co.copy()
    if not on_tee[v.index]:
        # Jeans legs: at least a relaxed straight leg's girth from mid-thigh down.
        side = "L" if co.x > 0 else "R"
        hip = bones[f"upperleg01.{side}"].head_local
        ankle = bones[f"foot.{side}"].head_local
        axis = ankle - hip
        t = (co - hip).dot(axis) / axis.length_squared
        if t < 0.25:
            continue
        near = hip + axis * min(1.0, t)
        radial = co - near
        floor = 0.082 + (0.076 - 0.082) * smooth01(0.5, 1.0, t)
        r = radial.length
        if r < floor and r > 1e-6:
            v.co = near + radial.normalized() * (r + (floor - r) * smooth01(0.25, 0.48, t))
            loosened.add(v.index)
        continue
    arm = sum(g.weight for g in v.groups if groups.get(g.group, "").startswith(("upperarm", "shoulder01")))
    if arm > 0.45:
        # Sleeves: open toward the hem.
        side = "L" if co.x > 0 else "R"
        top = bones[f"upperarm01.{side}"].head_local
        elbow = bones[f"lowerarm01.{side}"].head_local
        axis = elbow - top
        t = (co - top).dot(axis) / axis.length_squared
        near = top + axis * max(0.0, min(1.0, t))
        radial = co - near
        r = radial.length
        floor = 0.064
        if r < floor and r > 1e-6:
            v.co = near + radial.normalized() * (r + (floor - r) * smooth01(0.05, 0.3, t))
            loosened.add(v.index)
# The tee's body and the jeans' legs drape: slice by slice, hollows bridged.
SLICE = 0.012
torso = {}
legs = {"L": {}, "R": {}}
for v in outfit.data.vertices:
    arm = sum(g.weight for g in v.groups if groups.get(g.group, "").startswith(("upperarm", "shoulder01")))
    if on_tee[v.index]:
        if arm < 0.3 and v.co.z < 1.40:
            torso.setdefault(int(v.co.z / SLICE), []).append((v, Vector((v.co.x, v.co.y))))
    else:
        side = "L" if v.co.x > 0 else "R"
        hip = bones[f"upperleg01.{side}"].head_local
        ankle = bones[f"foot.{side}"].head_local
        axis = ankle - hip
        t = (v.co - hip).dot(axis) / axis.length_squared
        if t > 0.18:
            # Coordinates across the leg: x and the leg's forward (-y), the axis being near vertical.
            legs[side].setdefault(int(t / 0.02), []).append((v, Vector((v.co.x, v.co.y)), t))
for points in torso.values():
    for v, p in drape(points, 0.004).items():
        v.co.x, v.co.y = p.x, p.y
        loosened.add(v.index)
for side in legs.values():
    for points in side.values():
        ramp = {v: smooth01(0.18, 0.3, t) for v, _, t in points}
        for v, p in drape([(v, p) for v, p, _ in points], 0.003).items():
            old = Vector((v.co.x, v.co.y))
            new_xy = old + (p - old) * ramp[v]
            v.co.x, v.co.y = new_xy.x, new_xy.y
            loosened.add(v.index)

# The tee's body hangs straight down from the chest: below it, each direction
# round the torso is at least as far out as the chest is.
chest = [v for v in outfit.data.vertices if on_tee[v.index] and 1.27 < v.co.z < 1.35 and abs(v.co.x) < 0.17]
cy = sum(v.co.y for v in chest) / len(chest)
BINS = 48
envelope = [0.0] * BINS
def bin_of(co):
    return int((math.atan2(co.x, -(co.y - cy)) + math.pi) / (2 * math.pi) * BINS) % BINS
for v in chest:
    b = bin_of(v.co)
    envelope[b] = max(envelope[b], Vector((v.co.x, v.co.y - cy)).length)
for b in range(BINS):
    if envelope[b] == 0.0:
        envelope[b] = max(envelope[(b - 1) % BINS], envelope[(b + 1) % BINS])
for v in outfit.data.vertices:
    if not on_tee[v.index] or v.index in loosened:
        continue
    arm = sum(g.weight for g in v.groups if groups.get(g.group, "").startswith(("upperarm", "shoulder01")))
    if arm > 0.3 or v.co.z > 1.34:
        continue
    flat = Vector((v.co.x, v.co.y - cy))
    r = flat.length
    target = envelope[bin_of(v.co)] + 0.008
    w = smooth01(1.33, 1.17, v.co.z)
    if r < target and r > 1e-6:
        out = flat.normalized() * (r + (target - r) * w)
        v.co.x, v.co.y = out.x, cy + out.y
        loosened.add(v.index)
# Even out the new shapes a little, leaving the hems where they are.
bm = bmesh.new()
bm.from_mesh(outfit.data)
bm.verts.ensure_lookup_table()
moved = [bm.verts[i] for i in loosened]
ring = set(moved)
for vert in moved:
    for e in vert.link_edges:
        ring.add(e.other_vert(vert))
inner = [vt for vt in ring if not any(e.is_boundary for e in vt.link_edges)]
for _ in range(3):
    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(outfit.data)
bm.free()
print("OUTFIT loosened", len(loosened))

# A knee, not an arch: MakeHuman blends the jeans' thigh and shin weights over a
# long stretch of leg, so a bent knee bows like a banana. Hand the thigh over to the
# shin across a short band at the knee joint, keeping each half's own split between
# its bone and twist bone.
KNEE_BAND = 0.035
for v in outfit.data.vertices:
    if on_tee[v.index]:
        continue
    side = "L" if v.co.x > 0 else "R"
    hip = bones[f"upperleg01.{side}"].head_local
    knee = bones[f"lowerleg01.{side}"].head_local
    ankle = bones[f"foot.{side}"].head_local
    axis = ankle - hip
    t = (v.co - hip).dot(axis) / axis.length_squared
    tk = (knee - hip).dot(axis) / axis.length_squared
    band = KNEE_BAND / axis.length
    if t < tk - 3 * band or t > tk + 3 * band:
        continue
    named = {groups.get(g.group, ""): g for g in v.groups}
    upper = {n: g.weight for n, g in named.items() if n.startswith("upperleg") and n.endswith(side)}
    lower = {n: g.weight for n, g in named.items() if n.startswith("lowerleg") and n.endswith(side)}
    total = sum(upper.values()) + sum(lower.values())
    if total < 0.2:
        continue
    shin = smooth01(tk - band, tk + band, t)
    def spread(part, share, default):
        weights = part if sum(part.values()) > 1e-6 else {default: 1.0}
        norm = sum(weights.values())
        for name, w in weights.items():
            group = outfit.vertex_groups.get(name) or outfit.vertex_groups.new(name=name)
            group.add([v.index], total * share * w / norm, 'REPLACE')
    spread(upper, 1.0 - shin, f"upperleg02.{side}")
    spread(lower, shin, f"lowerleg01.{side}")

# The jeans' waistband and belt loops sit under the tee: tuck whatever the tee
# covers well inside it, so a bend never pushes denim out through the cotton.
tee_mesh = bmesh.new()
tee_mesh.from_mesh(outfit.data)
tee_mesh.verts.ensure_lookup_table()
bmesh.ops.delete(tee_mesh, geom=[f for f in tee_mesh.faces if not all(on_tee[v.index] for v in f.verts)], context='FACES_ONLY')
tee_tree = BVHTree.FromBMesh(tee_mesh)
tee_mesh.free()
outfit.data.update()
tucked = 0
for v in outfit.data.vertices:
    if on_tee[v.index]:
        continue
    n = v.normal
    out = tee_tree.ray_cast(v.co + n * 0.0005, n, 0.06)[0]
    poke = tee_tree.ray_cast(v.co - n * 0.0005, -n, 0.02)
    if poke[0] is not None:
        v.co -= n * (poke[3] + 0.008)
        tucked += 1
    elif out is not None:
        v.co -= n * 0.008
        tucked += 1
print("JEANS tucked under the tee", tucked)

# Skin the clothes still cover: MakeHuman keeps a margin of it under each hem. Far
# from any skin that shows, it's dropped; the strip left near the hems sits a few
# millimetres deeper, so a sleeve or collar bent a little differently from the
# arm under it can't let skin show through.
import heapq
cloth = BVHTree.FromObject(parts["outfit"], bpy.context.evaluated_depsgraph_get())
COVER = 0.05     # metres of cloth over the skin that count as covering it
KEEP = 0.03      # covered skin kept within this far (over the skin) of skin that shows
DEPTH = 0.007
mesh = body.data
covered = [cloth.ray_cast(v.co + v.normal * 0.0005, v.normal, COVER)[0] is not None for v in mesh.vertices]
# Skin already out through the cloth at rest: the cloth is just inside it.
inside = [0.0] * len(mesh.vertices)
for v in mesh.vertices:
    hit, _, _, d = cloth.ray_cast(v.co - v.normal * 0.0005, -v.normal, 0.015)
    if hit is not None:
        covered[v.index] = True
        inside[v.index] = d
# Distance over the surface from the nearest uncovered vertex.
links = [[] for _ in mesh.vertices]
for e in mesh.edges:
    a, b = e.vertices
    d = (mesh.vertices[a].co - mesh.vertices[b].co).length
    links[a].append((b, d))
    links[b].append((a, d))
far = [0.0 if not c else math.inf for c in covered]
queue = [(0.0, i) for i, c in enumerate(covered) if not c]
heapq.heapify(queue)
while queue:
    d, i = heapq.heappop(queue)
    if d > far[i]:
        continue
    for j, w in links[i]:
        if d + w < far[j]:
            far[j] = d + w
            heapq.heappush(queue, (d + w, j))
pushed = 0
for v in mesh.vertices:
    if covered[v.index]:
        v.co -= v.normal * (DEPTH + inside[v.index])
        pushed += 1
bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
drop = [f for f in bm.faces if all(far[v.index] > KEEP for v in f.verts)]
bmesh.ops.delete(bm, geom=drop, context='FACES')
bm.to_mesh(mesh)
bm.free()
print("SKIN dropped faces", len(drop))
print("SKIN pushed under cloth", pushed)

# World units: scale the armature and everything on it, then apply.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in meshes.values():
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
rig.scale = (SCALE, SCALE, SCALE)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# ---------- The beanie ----------
# The alien goes bareheaded.


def model_beanie():


    def head_points():
        """Body vertices that follow the head bone, in world space (Blender axes: z up, -y forward)."""
        group = body.vertex_groups["head"].index
        pts = []
        for v in body.data.vertices:
            for g in v.groups:
                if g.group == group and g.weight > 0.9:
                    pts.append(body.matrix_world @ v.co)
        return np.array([p[:] for p in pts])


    skull = head_points()
    top = skull[:, 2].max()
    brow = rig.matrix_world @ rig.data.bones["eye.L"].head_local
    ear = skull[np.abs(skull[:, 0]) > np.abs(skull[:, 0]).max() - 1.0]
    ear_top = ear[:, 2].max()
    center = Vector(((skull[:, 0].min() + skull[:, 0].max()) / 2, (skull[:, 1].min() + skull[:, 1].max()) / 2, (top + brow.z) / 2))

    # A sphere wrapped onto the skull from outside, then cut along the brim.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, radius=1.0, location=center)
    cap = bpy.context.active_object
    cap.name = "beanie"
    cap.scale = ((skull[:, 0].max() - skull[:, 0].min()) * 0.62, (skull[:, 1].max() - skull[:, 1].min()) * 0.62, (top - brow.z) * 1.1)
    bpy.ops.object.transform_apply(scale=True)
    wrap = cap.modifiers.new("wrap", 'SHRINKWRAP')
    wrap.target = body
    wrap.wrap_method = 'NEAREST_SURFACEPOINT'
    wrap.wrap_mode = 'OUTSIDE_SURFACE'
    wrap.offset = 0.7
    smooth = cap.modifiers.new("smooth", 'SMOOTH')
    smooth.factor = 1.0
    smooth.iterations = 12
    bpy.ops.object.modifier_apply(modifier="wrap")
    bpy.ops.object.modifier_apply(modifier="smooth")

    # The brim, round the head: two fingers over the brows at the front, just over the
    # tops of the ears at the sides, down toward the nape behind.
    front_y = skull[:, 1].min()
    back_y = skull[:, 1].max()
    FRONT_Z = brow.z + 2.3
    SIDE_Z = min(ear_top + 0.4, FRONT_Z - 0.8)
    BACK_Z = SIDE_Z - 3.6


    def brim_z(co):
        d = Vector((co.x - center.x, co.y - center.y))
        a = math.atan2(abs(d.x), -d.y)  # 0 at the front, pi at the back
        if a < math.pi / 2:
            t = a / (math.pi / 2)
            return FRONT_Z + (SIDE_Z - FRONT_Z) * (1 - math.cos(t * math.pi)) / 2
        t = (a - math.pi / 2) / (math.pi / 2)
        return SIDE_Z + (BACK_Z - SIDE_Z) * (1 - math.cos(t * math.pi)) / 2


    bm = bmesh.new()
    bm.from_mesh(cap.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < brim_z(v.co)], context='VERTS')
    # The cut follows the sphere's grid; lay the edge along the brim's curve.
    for v in bm.verts:
        if any(e.is_boundary for e in v.link_edges):
            v.co.z = brim_z(v.co)
    CUFF = 5.0
    for v in bm.verts:
        rise = v.co.z - brim_z(v.co)
        out = Vector((v.co.x - center.x, v.co.y - center.y, 0)).normalized()
        # The folded cuff stands proud of the crown, rolled at its top edge.
        cuff = 1.0 - min(1.0, max(0.0, (rise - CUFF) / 0.8))
        roll = math.exp(-((rise - CUFF + 0.3) / 0.5) ** 2)
        v.co += out * (0.55 * cuff + 0.15 * roll)
        # Knit has some slack: the crown stands off the skull and slouches back a little.
        up = max(0.0, (v.co.z - (top - 9.0)) / 9.0)
        behind = max(0.0, min(1.0, (v.co.y - front_y) / (back_y - front_y)))
        v.co.z += 1.6 * up * up
        v.co.y += 2.2 * up * up * behind
    bm.to_mesh(cap.data)
    bm.free()
    solid = cap.modifiers.new("solid", 'SOLIDIFY')
    solid.thickness = 0.45
    solid.offset = 1.0
    solid.use_rim = True
    sub = cap.modifiers.new("sub", 'SUBSURF')
    sub.levels = 1
    bpy.ops.object.modifier_apply(modifier="solid")
    bpy.ops.object.modifier_apply(modifier="sub")
    bpy.ops.object.shade_smooth()
    for poly in cap.data.polygons:
        poly.use_smooth = True
    # Ride the head bone.
    cap.vertex_groups.new(name="head").add(range(len(cap.data.vertices)), 1.0, 'REPLACE')
    cap.parent = rig
    cap.matrix_parent_inverse = rig.matrix_world.inverted()
    arm = cap.modifiers.new("Armature", 'ARMATURE')
    arm.object = rig
    print("BEANIE center", tuple(round(c, 2) for c in center), "brim", round(FRONT_Z, 2), round(BACK_Z, 2))
    return cap


if not ALIEN:
    meshes["beanie"] = model_beanie()

# ---------- Ambient occlusion ----------
# Baked into each vertex at rest, everything else occluding: ear folds, nostrils,
# between the fingers, under the beanie's cuff and the tee's collar, the ankles in the shoes.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 96
if scene.world is None:
    scene.world = bpy.data.worlds.new("world")
scene.world.light_settings.distance = 7.0
for role in [r for r in ("body", "beanie", "shoes") if r in meshes]:
    obj = meshes[role]
    attr = obj.data.color_attributes.new("ao", 'FLOAT_COLOR', 'POINT')
    obj.data.color_attributes.active_color = attr
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    print("AO baked", role)

# ---------- Materials and export ----------

for role, obj in meshes.items():
    obj.name = role
    obj.data.name = role
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials.new(role))
    for poly in obj.data.polygons:
        poly.use_smooth = True

for role, obj in meshes.items():
    print("MESH", role, len(obj.data.vertices), len(obj.data.polygons))
print("BONES", len(rig.data.bones), "HEIGHT", round(max(v.co.z for v in body.data.vertices), 2))

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for obj in meshes.values():
    obj.select_set(True)
raw = os.path.join(tempfile.mkdtemp(), f"{LOOK}.raw.glb")
bpy.ops.export_scene.gltf(
    filepath=raw, export_format='GLB', use_selection=True,
    export_yup=True, export_apply=False, export_skins=True, export_animations=False, export_morph=False,
    export_materials='EXPORT', export_image_format='NONE', export_texcoords=True, export_normals=True,
    export_tangents=False, export_extras=False, export_def_bones=False, export_leaf_bone=False,
    export_influence_nb=4, export_vertex_color='ACTIVE',
)
# Meshopt-compressed for the browser (three's GLTFLoader decodes it with MeshoptDecoder).
# Positions and UVs stay floats: the shaders read rest positions in world units, and
# quantized UVs would need a texture transform the custom materials don't apply.
subprocess.run(["npx", "--yes", "gltfpack@0.24.0", "-i", raw, "-o", os.path.join(OUT, f"{LOOK}.glb"),
                "-c", "-vpf", "-vtf", "-vn", "10", "-kn", "-km", "-ke", "-kv"], check=True)

# ---------- Textures ----------
# The alien wears the skater's: his skin is shaded green from the same maps.
if ALIEN:
    sys.exit(0)


def load(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    return img


def save(img, name, size, quality=88):
    if size and img.size[0] != size:
        img.scale(size, size)
    img.file_format = 'JPEG'
    img.save(filepath=os.path.join(OUT, name), quality=quality)


def write(pixels, name, size, quality=88):
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    save(img, name, 0, quality)


S = os.path.join(DATA, "skins")
C = os.path.join(DATA, "clothes")
save(load(os.path.join(S, "young_caucasian_male", "young_lightskinned_male_diffuse.png")), "skin.jpg", 2048)
save(load(os.path.join(S, "mindfront_aksel_skin", "Aksel_Skin_NRM.png")), "skin_normal.jpg", 1024, 92)
save(load(os.path.join(C, "male_casualsuit06", "male_casualsuit06_diffuse.png")), "outfit.jpg", 2048)
save(load(os.path.join(C, "male_casualsuit06", "male_casualsuit06_normal.png")), "outfit_normal.jpg", 1024, 92)
save(load(os.path.join(C, "male_casualsuit06", "male_casualsuit06_ao.png")), "outfit_ao.jpg", 1024)
save(load(os.path.join(DATA, "eyes", "materials", "brown_eye.png")), "eye.jpg", 512)
shutil.copy(os.path.join(DATA, "eyebrows", "eyebrow008", "eyebrow008.png"), os.path.join(OUT, "brows.png"))
shutil.copy(os.path.join(DATA, "eyelashes", "eyelashes01", "eyelashes01.png"), os.path.join(OUT, "lashes.png"))

# A short haircut's coverage, taken from where another MakeHuman skin (same UVs) paints hair on the scalp.
painted = load(os.path.join(S, "young_african_male", "young_darkskinned_male_diffuse.png"))
painted.scale(1024, 1024)
px = np.array(painted.pixels[:], dtype=np.float32).reshape(1024, 1024, 4)
lum = px[..., 0] * 0.3 + px[..., 1] * 0.59 + px[..., 2] * 0.11
mask = np.clip((0.15 - lum) / 0.07, 0.0, 1.0)
cols = np.arange(1024)[None, :] / 1024.0
mask *= (cols > 0.62)  # the head's island
# A clean short cut rather than that skin's sparse curls: spread the coverage out,
# fill it in, and firm the hairline up again.
for step in (1, 2, 3, 4, 6, 4, 2):
    mask = (mask + np.roll(mask, step, 0) + np.roll(mask, -step, 0) + np.roll(mask, step, 1) + np.roll(mask, -step, 1)) / 5.0
mask = np.clip((mask - 0.12) / 0.22, 0.0, 1.0)
rgba = np.stack([mask, mask, mask, np.ones_like(mask)], axis=-1)
write(rgba, "hair.jpg", 1024)
