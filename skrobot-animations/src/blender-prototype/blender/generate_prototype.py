"""Build the isolated Skrobot Blender kickflip prototype.

Run from the repository root:

    /Applications/Blender.app/Contents/MacOS/Blender \
      --background --factory-startup \
      --python skrobot-animations/src/blender-prototype/blender/generate_prototype.py

The script writes editable .blend sources beside itself and web-ready GLBs to
``skrobot-animations/public/blender-prototype``. It deliberately has no input
from the production animation package: this is a removable vertical slice.

Proportions and palette are transcribed from
``packages/animations/src/TrickAnimation3D.tsx`` so the prototype reads as the
same character as the shipped 3D robots: rounded capsule limbs, a big visored
head, flat cartoon fills, and a kicked maple deck. Lengths below are written in
that file's SVG art units; :func:`V` converts them into Blender space.
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
    """Flat, unlit-leaning material.

    The viewer re-shades every surface with a toon ramp, so the only thing that
    has to survive the glTF round trip is the base color. Metallic stays at 0
    and roughness high so anything opening the .blend sees the same flat look.
    """
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
# Robot proportions (TrickAnimation.tsx / TrickAnimation3D.tsx)
# ---------------------------------------------------------------------------

THIGH = 35.0
SHIN = 35.0
FOOT_Y = 65.0  # resting feet below the hip
LIFT = 65.0  # hip above the deck's mid-plane

HIP_Z = 2.4
FOOT_Z = 2.6
# Every figure below is the matching literal in TrickAnimation3D.tsx: the 2D
# renderer draws strokes by width, so a capsule "width 20" is radius 10 here.
# Eyeballing these against a screenshot goes wrong fast — the shipped camera is
# a different projection, so read the source, don't measure the picture.
SHOULDER_Z = 12.0
LIMB_R = 3.25  # legs: capsule width 6.5
ARM_R = 3.125  # arms: capsule width 6.25
TORSO_R = 10.0  # capsule width 20
HEAD_R = 11.0  # capsule width 22
BOOT_R = 3.0  # capsule width 5.2, thickened so the boot reads against the grip
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


def build_robot(materials: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    body = materials["body"]
    accent = materials["accent"]
    ink = materials["ink"]

    root = empty("RobotRig")
    pelvis = empty("Rig.Pelvis", parent=root)
    # Static stance turn lives on its own node so the animation can keep
    # writing plain lean values to Rig.Torso.
    stance = empty("Rig.Stance", parent=pelvis, rotation=(0.0, 0.0, math.radians(-STANCE_BODY_YAW)))
    torso = empty("Rig.Torso", parent=stance)

    joints: dict[str, bpy.types.Object] = {
        "root": root,
        "pelvis": pelvis,
        "torso": torso,
    }

    capsule_between("Body.Torso", (1.0, -11.0, 0.0), (1.0, -39.0, 0.0), TORSO_R, body, parent=torso)

    neck = empty("Rig.Neck", parent=torso, location=V(7.0, -50.0, 0.0))
    capsule_between("Body.Neck", (0.0, 0.0, 0.0), (0.0, -6.0, 0.0), 1.5, accent, parent=neck)

    head = empty(
        "Rig.Head",
        parent=neck,
        location=V(0.0, -6.0, 0.0),
        rotation=(0.0, 0.0, math.radians(HEAD_LOOK_FORWARD)),
    )
    joints["head"] = head
    # Head capsule is centred on the neck axis; the 2D art's x=5..9 span is
    # measured from the hip, and Rig.Head already carries that x=7 offset.
    capsule_between("Body.Head", (-2.0, -9.0, 0.0), (2.0, -9.0, 0.0), HEAD_R, body, parent=head)
    # Visor. The 2D art paints a band roughly 60% of the head wide and 30% tall,
    # inset from the silhouette on every side. In 3D that has to be sculpted,
    # not placed: this ellipsoid is mostly buried inside the skull and only the
    # cap that out-reaches the head's own surface shows, which is what gives the
    # lens-shaped patch. Widening it means growing it until it breaches further
    # around the curve — a small, forward-pushed blob reads as a snout instead.
    ellipsoid("Body.Visor", (5.0, -9.5, 0.0), (8.6, 6.5, 9.0), ink, parent=head)
    # Eyes are squashed on the depth axis so they read as dots painted on the
    # visor. Full spheres bulge out under a three-quarter camera and turn the
    # face into a bug's.
    ellipsoid("Eye.L", (13.1, -9.5, -3.2), (1.0, 1.3, 1.65), accent, parent=head)
    ellipsoid("Eye.R", (13.1, -9.5, 3.2), (1.0, 1.3, 1.65), accent, parent=head)
    capsule_between("Body.Antenna", (0.0, -20.0, 0.0), (0.0, -28.0, 0.0), 1.25, ink, parent=head)
    sphere_at("Body.AntennaBall", (0.0, -29.5, 0.0), 3.0, accent, parent=head)

    # Arms hang off the torso; both swing in the (yawed) body plane.
    for side, sign in (("Front", 1.0), ("Back", -1.0)):
        shoulder = empty(f"Rig.Shoulder.{side}", parent=torso, location=V(4.0, -37.0, sign * SHOULDER_Z))
        elbow = empty(f"Rig.Elbow.{side}", parent=shoulder, location=V(0.0, UPPER_ARM, 0.0))
        capsule_between(f"Body.UpperArm.{side}", (0.0, 0.0, 0.0), (0.0, UPPER_ARM, 0.0), ARM_R, accent, parent=shoulder)
        capsule_between(f"Body.Forearm.{side}", (0.0, 0.0, 0.0), (0.0, FOREARM, 0.0), ARM_R, accent, parent=elbow)
        joints[f"shoulder.{side}"] = shoulder
        joints[f"elbow.{side}"] = elbow

    # Legs stay in board space (no stance yaw) so the boots keep sitting on the
    # rails while the upper body is turned toward the camera.
    for side, sign in (("Nose", 1.0), ("Tail", -1.0)):
        hip = empty(f"Rig.Hip.{side}", parent=pelvis, location=V(0.0, 0.0, sign * HIP_Z))
        knee = empty(f"Rig.Knee.{side}", parent=hip, location=V(0.0, THIGH, 0.0))
        ankle = empty(f"Rig.Ankle.{side}", parent=knee, location=V(0.0, SHIN - ANKLE_LIFT, 0.0))
        foot = empty(f"Rig.Foot.{side}", parent=ankle)
        capsule_between(f"Body.Thigh.{side}", (0.0, 0.0, 0.0), (0.0, THIGH, 0.0), LIMB_R, accent, parent=hip)
        capsule_between(f"Body.Shin.{side}", (0.0, 0.0, 0.0), (0.0, SHIN - ANKLE_LIFT, 0.0), LIMB_R, accent, parent=knee)
        sphere_at(f"Body.Knee.{side}", (0.0, 0.0, 0.0), 3.6, accent, parent=knee)
        # Boot: short cuff at the ankle plus a heel-to-toe sole raked toeside.
        capsule_between(
            f"Body.BootCuff.{side}",
            (0.0, 0.0, 0.0),
            (1.2, ANKLE_LIFT + 0.6, TOE_SIDE * 0.6),
            BOOT_R - 0.3,
            body,
            parent=foot,
        )
        capsule_between(
            f"Body.BootSole.{side}",
            (-2.0, ANKLE_LIFT + 0.6, TOE_SIDE * -2.6),
            (4.4, ANKLE_LIFT + 0.6, TOE_SIDE * 4.2),
            BOOT_R,
            body,
            parent=foot,
        )
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
