"""Build the isolated Skrobot Blender kickflip prototype.

Run from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender \
      --background --factory-startup \
      --python skrobot-animations/src/blender-prototype/blender/generate_prototype.py

The script writes editable .blend sources beside itself and web-ready GLBs to
``skrobot-animations/public/blender-prototype``. It deliberately has no input
from the production animation package: this is a removable vertical slice.

The Second Session characters are original hard-surface toy robots: oversized
helmet shells, inset display faces, articulated mechanical limbs and vulcanized
skate shoes. Only the palette and joint contract come from the original bots.
All mesh coordinates are art units, converted into Blender space by V().
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Sequence

import bmesh
import bpy
from mathutils import Matrix


SCRIPT_DIR = Path(__file__).resolve().parent
PLAYGROUND_DIR = SCRIPT_DIR.parents[2]
GENERATED_DIR = SCRIPT_DIR / "generated"
PUBLIC_DIR = PLAYGROUND_DIR / "public" / "blender-prototype"

FPS = 30
END_FRAME = 105

# ---------------------------------------------------------------------------
# Art units
# ---------------------------------------------------------------------------
# One art unit is one SVG unit in TrickAnimation3D. The board is 96 of them
# long; 1/60 puts it at a comfortable 1.6 Blender units.
U = 1.0 / 60.0


def V(x: float, y: float, z: float = 0.0) -> tuple[float, float, float]:
    """Art space (x = travel, y = DOWN, z = toward camera) to Blender Z-up."""
    return (x * U, z * U, -y * U)


def radians(values: Sequence[float]) -> tuple[float, float, float]:
    return tuple(math.radians(value) for value in values)  # type: ignore[return-value]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# Palette (sRGB hex, exactly the colors the 3D renderer paints with)
# ---------------------------------------------------------------------------

PALETTE = {
    # robot.avatar for the reference robot ("shifty" in the playground data)
    "body": "#7ec8e3",
    "accent": "#e05c7a",
    # --anim-ink from TrickAnimation3D.css
    "ink": "#25354b",
    # deck materials
    "grip": "#2f2f33",
    "wood": "#c9a66b",
    "ply": "#cdaa74",
    "wheel": "#fbfbf3",
    "truck": "#61708a",
    "ivory": "#f4eedf",
    "rubber": "#192737",
    "visor": "#102c3b",
    "light": "#d7fcf3",
}


def srgb_to_linear(channel: float) -> float:
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def linear_rgba(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Blender stores base color linearly; the palette above is sRGB."""
    raw = hex_color.lstrip("#")
    channels = [int(raw[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return (*(srgb_to_linear(c) for c in channels), alpha)  # type: ignore[return-value]


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def material(name: str, hex_color: str, *, roughness: float = 0.62) -> bpy.types.Material:
    """Export palette colors; the viewer assigns enamel/rubber/glass finishes."""
    color = linear_rgba(hex_color)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.roughness = roughness
    mat.metallic = 0.0
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Metallic"].default_value = 0.0
        shader.inputs["Roughness"].default_value = roughness
        if "Specular IOR Level" in shader.inputs:
            shader.inputs["Specular IOR Level"].default_value = 0.12
    return mat


def parent_local(obj: bpy.types.Object, parent: bpy.types.Object | None) -> None:
    if parent is None:
        return
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)


def empty(
    name: str,
    *,
    parent: bpy.types.Object | None = None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    parent_local(obj, parent)
    obj.location = location
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.1
    return obj


# ---------------------------------------------------------------------------
# Mesh construction
# ---------------------------------------------------------------------------


def make_mesh(
    name: str,
    verts: Sequence[tuple[float, float, float]],
    faces: Sequence[Sequence[int]],
    materials: Sequence[bpy.types.Material],
    *,
    parent: bpy.types.Object | None = None,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    smooth: bool = True,
    material_indices: Sequence[int] | None = None,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(list(verts), [], [list(face) for face in faces])
    mesh.validate(verbose=False)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    for mat in materials:
        mesh.materials.append(mat)
    if material_indices is not None:
        for polygon, index in zip(mesh.polygons, material_indices):
            polygon.material_index = index
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    parent_local(obj, parent)
    obj.location = location
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    return obj


def capsule_geometry(radius: float, length: float, seg_u: int = 32, seg_v: int = 10):
    """Capsule along local +Z: `length` is the distance between cap centers."""
    half = length / 2.0
    verts: list[tuple[float, float, float]] = [(0.0, 0.0, half + radius)]
    rings: list[list[int]] = []

    def add_ring(z: float, r: float) -> None:
        ring = []
        for j in range(seg_u):
            phi = 2.0 * math.pi * j / seg_u
            ring.append(len(verts))
            verts.append((r * math.cos(phi), r * math.sin(phi), z))
        rings.append(ring)

    for i in range(1, seg_v + 1):
        theta = (math.pi / 2.0) * (i / seg_v)
        add_ring(half + radius * math.cos(theta), radius * math.sin(theta))
    for i in range(seg_v):
        theta = math.pi / 2.0 + (math.pi / 2.0) * (i / seg_v)
        add_ring(-half + radius * math.cos(theta), radius * math.sin(theta))

    bottom_pole = len(verts)
    verts.append((0.0, 0.0, -half - radius))

    faces: list[list[int]] = []
    first = rings[0]
    for j in range(seg_u):
        k = (j + 1) % seg_u
        faces.append([0, first[j], first[k]])
    for a, b in zip(rings, rings[1:]):
        for j in range(seg_u):
            k = (j + 1) % seg_u
            faces.append([a[j], b[j], b[k], a[k]])
    last = rings[-1]
    for j in range(seg_u):
        k = (j + 1) % seg_u
        faces.append([bottom_pole, last[k], last[j]])
    return verts, faces


def cylinder_geometry(radius: float, depth: float, seg: int = 32):
    """Capped cylinder along local +Z."""
    half = depth / 2.0
    verts: list[tuple[float, float, float]] = []
    top_ring: list[int] = []
    bottom_ring: list[int] = []
    for j in range(seg):
        phi = 2.0 * math.pi * j / seg
        x = radius * math.cos(phi)
        y = radius * math.sin(phi)
        top_ring.append(len(verts))
        verts.append((x, y, half))
        bottom_ring.append(len(verts))
        verts.append((x, y, -half))
    top_center = len(verts)
    verts.append((0.0, 0.0, half))
    bottom_center = len(verts)
    verts.append((0.0, 0.0, -half))

    faces: list[list[int]] = []
    for j in range(seg):
        k = (j + 1) % seg
        faces.append([top_ring[j], bottom_ring[j], bottom_ring[k], top_ring[k]])
        faces.append([top_center, top_ring[k], top_ring[j]])
        faces.append([bottom_center, bottom_ring[j], bottom_ring[k]])
    return verts, faces


def capsule_between(
    name: str,
    a_art: tuple[float, float, float],
    b_art: tuple[float, float, float],
    radius_art: float,
    mat: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
    smooth: bool = True,
) -> bpy.types.Object:
    """Capsule spanning two art-space points, expressed in the parent's frame."""
    ax, ay, az = V(*a_art)
    bx, by, bz = V(*b_art)
    dx, dy, dz = bx - ax, by - ay, bz - az
    span = math.sqrt(dx * dx + dy * dy + dz * dz)
    verts, faces = capsule_geometry(radius_art * U, span)
    # Orient local +Z along the segment.
    pitch = math.acos(clamp(dz / span, -1.0, 1.0)) if span > 1e-9 else 0.0
    yaw = math.atan2(dy, dx)
    return make_mesh(
        name,
        verts,
        faces,
        [mat],
        parent=parent,
        location=((ax + bx) / 2.0, (ay + by) / 2.0, (az + bz) / 2.0),
        rotation=(0.0, pitch, yaw),
        smooth=smooth,
    )


def sphere_at(
    name: str,
    center_art: tuple[float, float, float],
    radius_art: float,
    mat: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    verts, faces = capsule_geometry(radius_art * U, 0.0)
    return make_mesh(name, verts, faces, [mat], parent=parent, location=V(*center_art))


def ellipsoid(
    name: str,
    center_art: tuple[float, float, float],
    radii_art: tuple[float, float, float],
    mat: bpy.types.Material,
    *,
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """Sphere with independent radii along (depth, vertical, lateral).

    A capsule is round in cross-section, so it can only ever be a tube; a band
    painted across a face needs to be squashed on one axis.
    """
    depth_r, vertical_r, lateral_r = radii_art
    verts, faces = capsule_geometry(1.0, 0.0, seg_u=40, seg_v=12)
    scaled = [(x * depth_r * U, y * lateral_r * U, z * vertical_r * U) for x, y, z in verts]
    return make_mesh(name, scaled, faces, [mat], parent=parent, location=V(*center_art))


# ---------------------------------------------------------------------------
# Joint dimensions shared with the existing motion contract
# ---------------------------------------------------------------------------

THIGH = 35.0
SHIN = 35.0
FOOT_Y = 65.0  # resting feet below the hip
LIFT = 65.0  # hip above the deck's mid-plane

HIP_Z = 2.4
FOOT_Z = 2.6
UPPER_ARM = 15.0
FOREARM = 14.0
ANKLE_LIFT = 2.2
# Foot targets are authored on the deck's mid-plane (that's the plane the 2D
# renderer draws feet on). In 3D the deck is a solid, so the boots have to be
# lifted onto its top face or they sink through the griptape.
FOOT_DECK_LIFT = 4.0

# Resting stance turn: shoulders/head rotate off travel toward the camera so the
# rider stands across the board instead of facing down it. The exporter flips
# Blender's Y axis, so turning the chest toward Blender -Y is what puts it on
# the +Z side the viewer's camera sits on; TOE_SIDE keeps the boots agreeing.
STANCE_BODY_YAW = 40.0
# The chest's 40° turn still leaves the camera (which sits at a 64° bearing off
# the travel axis) looking at the rider's cheek. The head takes up the
# remainder so the visor reads as a frontal band, less a few degrees back
# toward travel so the rider still looks where they're going.
HEAD_LOOK_FORWARD = -19.0
TOE_SIDE = -1.0
# Arms splay away from the trunk so they clear the torso silhouette instead of
# hanging inside it under a three-quarter camera.
ARM_SPLAY = 13.0

# Deck (TrickAnimation3D board geometry)
DECK_PROFILE: tuple[tuple[float, float], ...] = (
    (-48, -8),
    (-42, -6.2),
    (-36, -4),
    (-28, -2.2),
    (-16, -1.4),
    (0, -1.1),
    (16, -1.4),
    (28, -2.2),
    (36, -4),
    (42, -6.2),
    (48, -8),
)
DECK_TIP_X = 48.0
DECK_HALF_W = 8.5
DECK_CORNER_R = 9.5
DECK_THICKNESS = 1.8
WHEEL_X = 28.0
WHEEL_Y = 8.0
WHEEL_Z = 7.0
WHEEL_R = 5.0
HUB_R = 1.8
# Deck centre rides this far above the ground when the wheels are down.
DECK_REST_HEIGHT = WHEEL_Y + WHEEL_R


def deck_kick_y(x: float) -> float:
    if x <= DECK_PROFILE[0][0]:
        return DECK_PROFILE[0][1]
    for (x0, y0), (x1, y1) in zip(DECK_PROFILE, DECK_PROFILE[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return DECK_PROFILE[-1][1]


def deck_half_width(x: float) -> float:
    ax = abs(x)
    round_start = DECK_TIP_X - DECK_CORNER_R
    if ax <= round_start:
        return DECK_HALF_W
    u = (ax - round_start) / DECK_CORNER_R
    if u >= 1.0:
        return 0.0
    return DECK_HALF_W * math.sqrt(1.0 - u * u)


def build_deck(materials: dict[str, bpy.types.Material], parent: bpy.types.Object) -> bpy.types.Object:
    """Solid deck: griptape top, printed maple bottom, ply rail band."""
    length_steps = 40
    width_steps = 8
    top: list[tuple[float, float, float]] = []
    bottom: list[tuple[float, float, float]] = []
    for i in range(length_steps + 1):
        x = -DECK_TIP_X + 2.0 * DECK_TIP_X * i / length_steps
        half_w = max(deck_half_width(x), 0.5)
        y = deck_kick_y(x)
        for j in range(width_steps + 1):
            z = -half_w + 2.0 * half_w * j / width_steps
            top.append(V(x, y - DECK_THICKNESS / 2.0, z))
            bottom.append(V(x, y + DECK_THICKNESS / 2.0, z))

    stride = width_steps + 1
    offset = len(top)
    verts = top + bottom

    def t(i: int, j: int) -> int:
        return i * stride + j

    def b(i: int, j: int) -> int:
        return offset + i * stride + j

    faces: list[list[int]] = []
    indices: list[int] = []
    grip, wood, ply = 0, 1, 2
    for i in range(length_steps):
        for j in range(width_steps):
            faces.append([t(i, j), t(i + 1, j), t(i + 1, j + 1), t(i, j + 1)])
            indices.append(grip)
            faces.append([b(i, j), b(i, j + 1), b(i + 1, j + 1), b(i + 1, j)])
            indices.append(wood)
    for i in range(length_steps):
        faces.append([t(i, 0), t(i + 1, 0), b(i + 1, 0), b(i, 0)])
        indices.append(ply)
        faces.append([t(i, width_steps), b(i, width_steps), b(i + 1, width_steps), t(i + 1, width_steps)])
        indices.append(ply)
    for j in range(width_steps):
        faces.append([t(0, j), b(0, j), b(0, j + 1), t(0, j + 1)])
        indices.append(ply)
        faces.append([t(length_steps, j), t(length_steps, j + 1), b(length_steps, j + 1), b(length_steps, j)])
        indices.append(ply)

    return make_mesh(
        "Deck",
        verts,
        faces,
        [materials["grip"], materials["wood"], materials["ply"]],
        parent=parent,
        smooth=False,
        material_indices=indices,
    )


def build_deck_decal(
    name: str,
    parent: bpy.types.Object,
    mat: bpy.types.Material,
    outline_points: Sequence[tuple[float, float]],
    steps: int = 14,
) -> bpy.types.Object:
    """Flat graphic riding just under the printed face, following the kick."""
    lift = DECK_THICKNESS / 2.0 + 0.35
    verts: list[tuple[float, float, float]] = []
    faces: list[list[int]] = []
    for i in range(steps + 1):
        p = i / steps
        x = outline_points[0][0] + (outline_points[-1][0] - outline_points[0][0]) * p
        half_z = outline_points[0][1] + (outline_points[-1][1] - outline_points[0][1]) * p
        y = deck_kick_y(x) + lift
        verts.append(V(x, y, -half_z))
        verts.append(V(x, y, half_z))
    for i in range(steps):
        a, b = 2 * i, 2 * i + 1
        c, d = 2 * (i + 1), 2 * (i + 1) + 1
        faces.append([a, c, d, b])
    return make_mesh(name, verts, faces, [mat], parent=parent, smooth=False)


def build_board(materials: dict[str, bpy.types.Material]) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    root = empty("SkateboardRig")
    build_deck(materials, root)

    # Underside graphic: centre stripe plus a diamond badge, in the robot accent.
    build_deck_decal("Decal.DeckStripe", root, materials["accent"], ((-34.0, 2.4), (34.0, 2.4)))
    build_deck_decal("Decal.DeckBadge", root, materials["accent"], ((-7.0, 0.2), (7.0, 0.2)), steps=8)
    build_deck_decal("Decal.DeckBadgeWide", root, materials["accent"], ((-2.5, 5.0), (2.5, 5.0)), steps=4)

    wheels: list[bpy.types.Object] = []
    for truck_x in (-WHEEL_X, WHEEL_X):
        capsule_between(
            f"Truck.Hanger{truck_x:+.0f}",
            (truck_x, 1.0, 0.0),
            (truck_x, WHEEL_Y - 1.0, 0.0),
            2.0,
            materials["truck"],
            parent=root,
        )
        capsule_between(
            f"Truck.Axle{truck_x:+.0f}",
            (truck_x, WHEEL_Y, -WHEEL_Z),
            (truck_x, WHEEL_Y, WHEEL_Z),
            1.25,
            materials["truck"],
            parent=root,
        )
        for side, wz in (("L", -WHEEL_Z), ("R", WHEEL_Z)):
            pivot = empty(f"WheelPivot.{truck_x:+.0f}.{side}", parent=root, location=V(truck_x, WHEEL_Y, wz))
            verts, faces = cylinder_geometry(WHEEL_R * U, 4.0 * U)
            make_mesh(
                f"Wheel.{truck_x:+.0f}.{side}",
                verts,
                faces,
                [materials["wheel"]],
                parent=pivot,
                rotation=(math.pi / 2.0, 0.0, 0.0),
                smooth=True,
            )
            hub_verts, hub_faces = cylinder_geometry(HUB_R * U, 4.6 * U)
            make_mesh(
                f"Decal.WheelHub.{truck_x:+.0f}.{side}",
                hub_verts,
                hub_faces,
                [materials["accent"]],
                parent=pivot,
                rotation=(math.pi / 2.0, 0.0, 0.0),
                smooth=True,
            )
            wheels.append(pivot)
    return root, wheels


def shell(name, center, size, mat, parent, bevel=2.0):
    """Beveled solid in art coordinates; modifiers are baked into the GLB."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0] * U, size[2] * U, size[1] * U)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Soft machined corners", "BEVEL")
    modifier.width = bevel * U
    modifier.segments = 5
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    modifier = obj.modifiers.new("Panel normals", "WEIGHTED_NORMAL")
    modifier.keep_sharp = True
    modifier.weight = 40
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    parent_local(obj, parent)
    obj.location = V(*center)
    return obj


def build_robot(materials: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    body, accent, ink = (materials[k] for k in ("body", "accent", "ink"))
    ivory, rubber, visor, light = (materials[k] for k in ("ivory", "rubber", "visor", "light"))
    root = empty("RobotRig")
    pelvis = empty("Rig.Pelvis", parent=root)
    stance = empty("Rig.Stance", parent=pelvis, rotation=(0, 0, math.radians(-STANCE_BODY_YAW)))
    torso = empty("Rig.Torso", parent=stance)
    joints = {"root": root, "pelvis": pelvis, "torso": torso}

    # Layered chassis: a floating chest plate over a dark flexible waist.
    shell("Chassis.Waist", (0, -4, 0), (16, 12, 20), rubber, torso, 4)
    shell("Chassis.Main", (0, -25, 0), (23, 33, 29), body, torso, 7)
    shell("Chassis.Chest", (11, -26, 0), (4, 23, 24), ivory, torso, 3)
    shell("Chassis.Battery", (-12, -24, 0), (7, 23, 20), accent, torso, 3)
    for z in (-5, 0, 5):
        shell(f"Detail.BackVent.{z}", (-15.7, -25, z), (0.7, 11, 1.4), rubber, torso, 0.5)
    shell("Detail.ChestBadge", (13.5, -28, 0), (1.2, 10, 10), accent, torso, 2.5)
    shell("Detail.BadgeSlash", (14.2, -28, 0), (0.7, 5.5, 2.2), ivory, torso, 0.5)
    for z in (-7, -3, 1):
        shell(f"Detail.BatteryLed.{z}", (13.3, -18, z), (0.7, 1.7, 2), light, torso, 0.5)
    for z in (-10, 10):
        sphere_at(f"Detail.ChestRivet.{z}", (12.8, -34, z), 0.9, ink, parent=torso)
    neck = empty("Rig.Neck", parent=torso, location=V(0, -44, 0))
    capsule_between("Joint.Neck", (0, 3, 0), (0, -5, 0), 4, rubber, parent=neck)
    head = empty("Rig.Head", parent=neck, location=V(0, -6, 0))
    joints["head"] = head

    # A broad rounded helmet with an actual recessed face assembly. The front
    # is local +X; generous cheek walls keep it readable from every angle.
    shell("Helmet.Shell", (0, -13, 0), (29, 32, 39), body, head, 8)
    shell("Helmet.FaceGasket", (13.4, -11, 0), (5, 23, 33), rubber, head, 6)
    shell("Helmet.Display", (16, -11, 0), (1.7, 19, 29), visor, head, 4.5)
    shell("Helmet.Brow", (13.2, -24, 0), (8, 4, 32), body, head, 1.8)
    shell("Helmet.Chin", (11.6, 1, 0), (8, 4, 27), ivory, head, 1.8)
    # Display glints are physical inlays, intentionally restrained.
    shell("Detail.DisplayGlint", (17, -17.5, -8), (0.4, 1, 7), light, head, 0.4)
    for sign in (-1, 1):
        ellipsoid(f"Helmet.EarGasket.{sign}", (0, -11, sign*19), (7, 8, 2.5), rubber, parent=head)
        ellipsoid(f"Helmet.EarCap.{sign}", (0, -11, sign*21), (5.8, 6.5, 1.7), accent, parent=head)
        shell(f"Detail.EarSlot.{sign}", (0, -11, sign*22.5), (1.8, 7, 0.6), ivory, head, 0.5)

    # Four profiles share the engineered chassis, with their own silhouette
    # and face. Variant groups are switched in the viewer alongside palette.
    for variant in range(4):
        profile = empty(f"Variant.{variant}", parent=head)
        for sign in (-1, 1):
            eye = shell(f"Face.Eye.{variant}.{sign}", (17.2, -11.5, sign*6.5),
                        (0.8, 6.5 if variant != 2 else 3.3, 4.4), accent, profile, 1.6)
            if variant == 2:
                eye.rotation_euler.x = sign * math.radians(13)
        shell(f"Face.Mouth.{variant}", (17.2, -4.7, 0), (0.6, 1.3, 4.8), light, profile, 0.5)
        if variant == 0:
            capsule_between("Swivel.Aerial", (-4, -27, -9), (-6, -39, -11), 1.3, rubber, parent=profile)
            sphere_at("Swivel.Signal", (-6, -40, -11), 3.5, accent, parent=profile)
            shell("Swivel.CrownStripe", (0, -29.2, 1), (16, 1.8, 5), ivory, profile, 0.8)
        elif variant == 1:
            shell("Scuffy.CapBrim", (14, -26, 0), (19, 3.5, 39), accent, profile, 1.5)
            shell("Scuffy.CapPatch", (2, -29, 0), (12, 2, 12), accent, profile, 1)
        elif variant == 2:
            for z in (-6, 0, 6):
                shell(f"Gutsy.CrownRib.{z}", (-1, -29.5, z), (20, 4, 2.5), accent, profile, 1)
            shell("Gutsy.NoseGuard", (17.8, -6, 0), (2, 6, 2.5), ivory, profile, 0.9)
        else:
            for sign in (-1, 1):
                capsule_between(f"Nosy.Aerial.{sign}", (-2, -25, sign*13), (-2, -35, sign*18), 1.4, rubber, parent=profile)
                sphere_at(f"Nosy.Signal.{sign}", (-2, -36, sign*18), 2.8, accent, parent=profile)

    for side, sign in (("Front", 1.0), ("Back", -1.0)):
        shoulder = empty(f"Rig.Shoulder.{side}", parent=torso, location=V(0, -33, sign*18))
        elbow = empty(f"Rig.Elbow.{side}", parent=shoulder, location=V(0, UPPER_ARM+3, 0))
        sphere_at(f"Joint.Shoulder.{side}", (0, 0, 0), 5, rubber, parent=shoulder)
        shell(f"Arm.ShoulderCap.{side}", (0, 1, sign*2), (11, 10, 10), accent, shoulder, 3.5)
        capsule_between(f"Joint.UpperArm.{side}", (0, 5, 0), (0, UPPER_ARM+3, 0), 3, rubber, parent=shoulder)
        shell(f"Arm.Sleeve.{side}", (0, 9, 0), (8, 10, 8), body, shoulder, 2.5)
        sphere_at(f"Joint.Elbow.{side}", (0, 0, 0), 4.4, ink, parent=elbow)
        shell(f"Arm.Forearm.{side}", (0, 9, 0), (10, 14, 10), accent, elbow, 3)
        shell(f"Arm.Cuff.{side}", (0, 16, 0), (10.5, 3, 10.5), ivory, elbow, 1)
        shell(f"Hand.Palm.{side}", (0, 22, 0), (9, 10, 8), rubber, elbow, 3)
        shell(f"Hand.Knuckles.{side}", (2, 23, 0), (7, 6, 8.5), body, elbow, 2)
        sphere_at(f"Hand.Thumb.{side}", (4, 19, -sign*4), 2.5, rubber, parent=elbow)
        joints[f"shoulder.{side}"] = shoulder
        joints[f"elbow.{side}"] = elbow

    for side, sign in (("Nose", 1.0), ("Tail", -1.0)):
        hip = empty(f"Rig.Hip.{side}", parent=pelvis, location=V(0, 0, sign*HIP_Z))
        knee = empty(f"Rig.Knee.{side}", parent=hip, location=V(0, THIGH, 0))
        ankle = empty(f"Rig.Ankle.{side}", parent=knee, location=V(0, SHIN-ANKLE_LIFT, 0))
        foot = empty(f"Rig.Foot.{side}", parent=ankle)
        sphere_at(f"Joint.Hip.{side}", (0, 1, 0), 4.5, rubber, parent=hip)
        capsule_between(f"Joint.ThighRod.{side}", (0, 4, 0), (0, THIGH, 0), 2.8, ink, parent=hip)
        shell(f"Leg.Thigh.{side}", (0, 16, 0), (9, 23, 10), accent, hip, 3)
        sphere_at(f"Joint.Knee.{side}", (0, 0, 0), 5.5, rubber, parent=knee)
        shell(f"Leg.KneePad.{side}", (4, 1, 0), (5, 9, 10), ivory, knee, 2)
        capsule_between(f"Joint.ShinRod.{side}", (0, 3, 0), (0, SHIN-ANKLE_LIFT, 0), 2.6, ink, parent=knee)
        shell(f"Leg.Shin.{side}", (0, 16, 0), (8, 21, 9), body, knee, 2.5)
        shell(f"Leg.ShinInset.{side}", (4, 16, 0), (1, 12, 4), accent, knee, 0.4)
        # Real shoes across the board: cream sole, dark foxing, toe cap/laces.
        shell(f"Shoe.Sole.{side}", (1, 3, -3), (12, 3, 20), ivory, foot, 1.2)
        shell(f"Shoe.Foxing.{side}", (1, 1, -3), (12.3, 1.5, 20.3), rubber, foot, 0.6)
        shell(f"Shoe.Upper.{side}", (0, -2, -3), (11, 7, 18), body, foot, 2.5)
        shell(f"Shoe.Toe.{side}", (0, -1, -10), (10.6, 5, 5), ivory, foot, 1.8)
        shell(f"Shoe.Collar.{side}", (0, -5, 1), (10, 4, 8), accent, foot, 1.5)
        for z in (-6, -3, 0):
            shell(f"Detail.Lace.{side}.{z}", (0, -5.6, z), (7, 0.9, 1), ivory, foot, 0.35)
        joints[f"hip.{side}"] = hip
        joints[f"knee.{side}"] = knee
        joints[f"ankle.{side}"] = ankle
        joints[f"foot.{side}"] = foot
    return joints


# ---------------------------------------------------------------------------
# Animation
# ---------------------------------------------------------------------------


def key_transform(
    obj: bpy.types.Object,
    frame: int,
    *,
    location: tuple[float, float, float] | None = None,
    rotation_degrees: tuple[float, float, float] | None = None,
) -> None:
    if location is not None:
        obj.location = location
        obj.keyframe_insert(data_path="location", frame=frame)
    if rotation_degrees is not None:
        obj.rotation_euler = radians(rotation_degrees)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def set_interpolation(obj: bpy.types.Object, mode: str = "BEZIER") -> None:
    animation_data = obj.animation_data
    if not animation_data or not animation_data.action:
        return
    # Blender 5.2 stores curves in layered Action slots rather than exposing
    # the legacy ``action.fcurves`` collection. The default interpolation is
    # already Bezier, so older versions get explicit handles and newer ones
    # safely retain their defaults.
    curves = getattr(animation_data.action, "fcurves", ())
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = mode
            if mode == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def solve_leg(foot_x: float, foot_y: float) -> tuple[float, float]:
    """Two-bone IK in the body plane. Returns (hip, knee) in art degrees.

    Both knees fold toward the nose, matching the 2D renderer's IK, so a
    crouch reads as a skate compression instead of a squat.
    """
    reach = math.hypot(foot_x, foot_y)
    reach = clamp(reach, 8.0, THIGH + SHIN - 0.4)
    base = math.atan2(foot_x, foot_y)
    hip_offset = math.acos(
        clamp((reach * reach + THIGH * THIGH - SHIN * SHIN) / (2.0 * reach * THIGH), -1.0, 1.0)
    )
    knee_interior = math.acos(
        clamp((THIGH * THIGH + SHIN * SHIN - reach * reach) / (2.0 * THIGH * SHIN), -1.0, 1.0)
    )
    return math.degrees(base + hip_offset), math.degrees(math.pi - knee_interior)


# Each phase: frame, travel x, hip height above ground, tail foot, nose foot,
# front-arm angle, back-arm angle, torso lean, head lean. Feet are body-local
# (art units below the hip); heights are art units above the asphalt.
LAND_PHASES: tuple[tuple, ...] = (
    (1, -190.0, 72.0, (-28.0, 59.0), (20.0, 59.0), 20.0, -28.0, -2.0, -3.0),
    (18, -105.0, 62.0, (-30.0, 49.0), (19.0, 49.0), 34.0, -42.0, 9.0, 4.0),
    (28, -52.0, 58.0, (-32.0, 45.0), (18.0, 45.0), 44.0, -55.0, 15.0, 7.0),
    (38, -8.0, 104.0, (-30.0, 46.0), (18.0, 44.0), -18.0, 32.0, -7.0, -6.0),
    (47, 26.0, 190.0, (-22.0, 40.0), (16.0, 38.0), -38.0, 52.0, -12.0, -9.0),
    (62, 80.0, 140.0, (-25.0, 48.0), (18.0, 46.0), -12.0, 26.0, -5.0, -4.0),
    (77, 136.0, 68.0, (-29.0, 52.0), (19.0, 50.0), 26.0, -34.0, 10.0, 5.0),
    (105, 250.0, 72.0, (-28.0, 59.0), (20.0, 59.0), 20.0, -28.0, -2.0, -3.0),
)

BAIL_PHASES: tuple[tuple, ...] = (
    (1, -190.0, 72.0, (-28.0, 59.0), (20.0, 59.0), 20.0, -28.0, -2.0, -3.0),
    (18, -105.0, 62.0, (-30.0, 49.0), (19.0, 49.0), 34.0, -42.0, 9.0, 4.0),
    (28, -52.0, 58.0, (-32.0, 45.0), (18.0, 45.0), 44.0, -55.0, 15.0, 7.0),
    (38, -8.0, 100.0, (-30.0, 46.0), (18.0, 44.0), -18.0, 32.0, -7.0, -6.0),
    (47, 24.0, 182.0, (-16.0, 42.0), (26.0, 36.0), -52.0, 68.0, -16.0, -12.0),
    (61, 62.0, 126.0, (2.0, 48.0), (36.0, 32.0), -74.0, 92.0, -24.0, -18.0),
    (78, 96.0, 56.0, (18.0, 46.0), (42.0, 28.0), -96.0, 118.0, -30.0, -22.0),
    (105, 128.0, 32.0, (24.0, 44.0), (44.0, 26.0), -104.0, 126.0, -32.0, -24.0),
)

# Board: frame, travel x, deck-centre height, (flip about the long axis,
# pitch, yaw) in degrees.
LAND_BOARD: tuple[tuple, ...] = (
    (1, -192.0, DECK_REST_HEIGHT, (0.0, 0.0, 0.0)),
    (18, -107.0, DECK_REST_HEIGHT, (0.0, 0.0, 0.0)),
    (28, -54.0, DECK_REST_HEIGHT + 5.0, (0.0, -24.0, 0.0)),
    (38, -8.0, 58.0, (124.0, -6.0, 0.0)),
    (47, 26.0, 150.0, (236.0, 6.0, 0.0)),
    (62, 80.0, 92.0, (360.0, 0.0, 0.0)),
    (77, 136.0, DECK_REST_HEIGHT + 3.0, (360.0, 0.0, 0.0)),
    (105, 250.0, DECK_REST_HEIGHT, (360.0, 0.0, 0.0)),
)

BAIL_BOARD: tuple[tuple, ...] = (
    (1, -192.0, DECK_REST_HEIGHT, (0.0, 0.0, 0.0)),
    (18, -107.0, DECK_REST_HEIGHT, (0.0, 0.0, 0.0)),
    (28, -54.0, DECK_REST_HEIGHT + 5.0, (0.0, -24.0, 0.0)),
    (38, -8.0, 56.0, (118.0, -8.0, 6.0)),
    (47, 28.0, 140.0, (214.0, 10.0, 22.0)),
    (61, 86.0, 88.0, (268.0, 16.0, 58.0)),
    (78, 150.0, 30.0, (306.0, 6.0, 104.0)),
    (105, 214.0, DECK_REST_HEIGHT, (322.0, 0.0, 128.0)),
)

# Lateral drift of the board once it gets kicked out on a bail (art units).
BAIL_BOARD_DRIFT = {1: 0.0, 18: 0.0, 28: 0.0, 38: -4.0, 47: -16.0, 61: -34.0, 78: -52.0, 105: -64.0}

# Root roll/pitch/yaw for the bail: the rider tips out over the tail.
BAIL_ROOT_ROTATION = {
    1: (0.0, 0.0, 0.0),
    18: (0.0, 0.0, 0.0),
    28: (0.0, 0.0, 0.0),
    38: (4.0, -6.0, 0.0),
    47: (14.0, -16.0, -6.0),
    61: (32.0, -34.0, -14.0),
    78: (58.0, -62.0, -24.0),
    105: (72.0, -78.0, -30.0),
}


def animate_robot(joints: dict[str, bpy.types.Object], variant: str) -> None:
    phases = LAND_PHASES if variant == "land" else BAIL_PHASES
    for frame, travel_x, hip_h, tail_foot, nose_foot, arm_front, arm_back, lean, head_lean in phases:
        root_rotation = (0.0, 0.0, 0.0) if variant == "land" else BAIL_ROOT_ROTATION[frame]
        key_transform(
            joints["root"],
            frame,
            location=V(travel_x, -hip_h, 0.0),
            rotation_degrees=root_rotation,
        )
        key_transform(joints["torso"], frame, rotation_degrees=(0.0, -lean, 0.0))
        key_transform(joints["head"], frame, rotation_degrees=(0.0, -head_lean, HEAD_LOOK_FORWARD))

        for side, target in (("Tail", tail_foot), ("Nose", nose_foot)):
            hip_deg, knee_deg = solve_leg(target[0], target[1] - FOOT_DECK_LIFT)
            key_transform(joints[f"hip.{side}"], frame, rotation_degrees=(0.0, -hip_deg, 0.0))
            key_transform(joints[f"knee.{side}"], frame, rotation_degrees=(0.0, knee_deg, 0.0))
            # Keep the boot flat on the deck regardless of the leg chain.
            key_transform(joints[f"foot.{side}"], frame, rotation_degrees=(0.0, hip_deg - knee_deg, 0.0))

        for side, sign, angle in (("Front", 1.0, arm_front), ("Back", -1.0, arm_back)):
            key_transform(
                joints[f"shoulder.{side}"],
                frame,
                rotation_degrees=(sign * ARM_SPLAY, -angle, 0.0),
            )
            key_transform(joints[f"elbow.{side}"], frame, rotation_degrees=(0.0, -abs(angle) * 0.5 - 18.0, 0.0))

    for joint in joints.values():
        set_interpolation(joint)


def animate_board(root: bpy.types.Object, wheels: list[bpy.types.Object], variant: str) -> None:
    phases = LAND_BOARD if variant == "land" else BAIL_BOARD
    start_x = phases[0][1]
    for frame, x, height, rotation in phases:
        drift = BAIL_BOARD_DRIFT[frame] if variant == "bail" else 0.0
        key_transform(root, frame, location=V(x, -height, drift), rotation_degrees=rotation)
        rolled = (x - start_x) * U
        for wheel in wheels:
            key_transform(wheel, frame, rotation_degrees=(0.0, math.degrees(rolled / (WHEEL_R * U)), 0.0))

    set_interpolation(root)
    for wheel in wheels:
        set_interpolation(wheel, "LINEAR")


def set_render_engine(scene: bpy.types.Scene) -> None:
    # EEVEE's identifier changed across Blender versions; pick whichever the
    # running build advertises so the script stays factory-startup safe.
    available = scene.render.bl_rna.properties["engine"].enum_items.keys()
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if candidate in available:
            scene.render.engine = candidate
            return


def build_variant(variant: str) -> None:
    clear_scene()
    scene = bpy.context.scene
    scene.name = f"Skrobot Kickflip {variant.title()} Prototype"
    set_render_engine(scene)
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = END_FRAME
    scene.frame_set(1)

    materials = {key: material(f"SKR {key.title()}", value) for key, value in PALETTE.items()}

    joints = build_robot(materials)
    board_root, wheels = build_board(materials)
    animate_robot(joints, variant)
    animate_board(board_root, wheels, variant)

    scene.frame_set(1)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    blend_path = GENERATED_DIR / f"skrobot-kickflip-{variant}.blend"
    glb_path = PUBLIC_DIR / f"skrobot-kickflip-{variant}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_merge_animation="ACTION",
        export_anim_scene_split_object=False,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    print(f"WROTE {blend_path}")
    print(f"WROTE {glb_path}")


for outcome in ("land", "bail"):
    build_variant(outcome)

print("BLENDER_PROTOTYPE_BUILD_OK")
