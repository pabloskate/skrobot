"""Build the procedural street-tree species, in the jacaranda's style.

build_tree.py rebuilds a scanned tree; these species have no CC0 scan, so
they are grown here from a few rules and drawn the same way: textured bark
tubes, and the foliage as cut-out cards from a painted atlas, lit as one
soft crown (normals out of each foliage mass) and darker deep inside it
(vertex color). Every species has three variants, A to C, exported side
by side in one GLB as nodes `a_bark`, `a_leaves`, `b_bark`... (streetProps.ts
reads them by that name).

- eucalyptus: a tall Southern California campus gum: pale mottled trunk,
  forking high into an open, lumpy, drooping crown (45-60 ft).
- ornamental: a young street tree: thin trunk forking at half height, a few
  upright limbs each ending in a loose tuft, sky between them (12-18 ft).
- fan_palm: a Mexican fan palm (Washingtonia robusta): thin, slightly curved
  trunk, a small head of fans, a skirt of dead fronds (50-70 ft).
- ficus: an old Los Angeles street fig (Indian laurel, Ficus microcarpa):
  pale smooth trunk whitewashed at the foot, roots swelling out of the well,
  clear to 9-10 ft, then a few stout limbs sweeping up and out into a broad,
  dense, clipped crown, wider than tall, rounded on top and flat underneath,
  sitting a little off the trunk toward glTF +z (away from the street when
  planted at yaw 0) (30-35 ft).

    blender -b --factory-startup --python build_species.py -- <out dir> [species ...]

Writes, per species, `<name>.raw.glb`, `<name>_bark.jpg`, `<name>_leaves.webp`,
and `crowns.json` (each variant's height and crown spheres, glTF axes, metres)
for the table in trees.ts.
"""
import bpy, bmesh, os, sys, math, json
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
WANT = args[1:] or ["eucalyptus", "ornamental", "fan_palm", "ficus"]
os.makedirs(OUT, exist_ok=True)
UP = Vector((0, 0, 1))


# ---------------------------------------------------------------- images
def noise(h, w, scale, rng, stretch=(1.0, 1.0)):
    """Smooth tileable noise (zero mean, unit spread), features about `scale` px across."""
    white = rng.standard_normal((h, w))
    fy = np.fft.fftfreq(h)[:, None] * stretch[0]
    fx = np.fft.fftfreq(w)[None, :] * stretch[1]
    spec = np.fft.fft2(white) * np.exp(-(fx ** 2 + fy ** 2) * (scale * math.pi) ** 2 / 2)
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / (n.std() + 1e-9)


def fbm(h, w, scale, rng, octaves=4, stretch=(1.0, 1.0)):
    out, amp, total = np.zeros((h, w)), 1.0, 0.0
    for _ in range(octaves):
        out += amp * noise(h, w, scale, rng, stretch)
        total += amp
        amp *= 0.5
        scale /= 2
    return out / total


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mixc(a, b, t):
    return a * (1 - t[..., None]) + np.asarray(b) * t[..., None]


def bleed(rgb, alpha, steps=12):
    """Leaf color carried into the cut-out, so filtering at the alpha edge never shows black."""
    out, mask = rgb.copy(), alpha > 0.5
    for _ in range(steps):
        shifted = [np.roll(out, s, axis=ax) for ax in (0, 1) for s in (-1, 1)]
        masks = [np.roll(mask, s, axis=ax) for ax in (0, 1) for s in (-1, 1)]
        acc = sum(sh * m[..., None] for sh, m in zip(shifted, masks))
        cnt = sum(m.astype(np.float32) for m in masks)[..., None]
        fill = (~mask[..., None]) & (cnt > 0)
        out = np.where(fill, acc / np.maximum(cnt, 1), out)
        mask = mask | (cnt[..., 0] > 0)
    return out


def save(arr, name, quality):
    """Writes rows top first, as painted; stored as display color, as the shaders sample it."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1))], 2)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(np.clip(arr[::-1], 0, 1)).astype(np.float32).ravel())
    img.file_format = 'WEBP' if name.endswith('.webp') else 'JPEG'
    img.filepath_raw = os.path.join(OUT, name)
    img.save(quality=quality)


class Canvas:
    """A square tile painted with leaf and twig shapes, supersampled; coordinates 0..1, y down."""

    def __init__(self, size, ss=2):
        self.size, self.ss, self.n = size, ss, size * ss
        self.rgb = np.zeros((self.n, self.n, 3))
        self.a = np.zeros((self.n, self.n))

    def blade(self, base, angle, length, width, color, profile, curve=0.0, rib=0.85, tipshade=1.0):
        """A leaf from `base` pointing `angle` (radians, 0 = right, pi/2 = down), `profile(t)` its half-width shape."""
        n = self.n
        d = np.array([math.cos(angle), math.sin(angle)])
        p = np.array([-d[1], d[0]])
        reach = length * (1 + abs(curve)) + width
        x0, x1 = int(max(0, (base[0] - reach) * n)), int(min(n, (base[0] + reach) * n + 1))
        y0, y1 = int(max(0, (base[1] - reach) * n)), int(min(n, (base[1] + reach) * n + 1))
        if x0 >= x1 or y0 >= y1:
            return
        ys, xs = np.mgrid[y0:y1, x0:x1]
        rx, ry = (xs + 0.5) / n - base[0], (ys + 0.5) / n - base[1]
        s = rx * d[0] + ry * d[1]
        q = rx * p[0] + ry * p[1]
        t = s / length
        off = q - curve * length * t * t
        hw = 0.5 * width * profile(np.clip(t, 0, 1))
        inside = (t >= 0) & (t <= 1) & (np.abs(off) <= hw)
        if not inside.any():
            return
        shade = np.where(np.abs(off) < 0.14 * hw + 0.5 / n, rib, 1.0) * (1 + (tipshade - 1) * t)
        c = np.asarray(color)[None, None, :] * shade[..., None]
        region = self.rgb[y0:y1, x0:x1]
        region[inside] = c[inside]
        self.a[y0:y1, x0:x1][inside] = 1.0

    def stroke(self, pts, width, color):
        """A twig: capsules along a polyline (tile coordinates)."""
        for a, b in zip(pts[:-1], pts[1:]):
            a, b = np.asarray(a), np.asarray(b)
            length = float(np.linalg.norm(b - a))
            if length < 1e-6:
                continue
            ang = math.atan2(b[1] - a[1], b[0] - a[0])
            self.blade(a, ang, length + width * 0.5, width, color, lambda t: np.ones_like(t), rib=1.0)

    def pixels(self):
        """Box-filtered down to size: RGB and alpha (alpha cut at 0.5 by the shader)."""
        s, k = self.size, self.ss
        a = self.a.reshape(s, k, s, k).mean(axis=(1, 3))
        rgb = (self.rgb * self.a[..., None]).reshape(s, k, s, k, 3).mean(axis=(1, 3)) / np.maximum(a, 1e-6)[..., None]
        return rgb, a


def atlas(tiles):
    """2x2 tiles (each (rgb, alpha) at the same size) into one RGBA image, edges bled."""
    s = tiles[0][0].shape[0]
    rgb = np.zeros((2 * s, 2 * s, 3))
    a = np.zeros((2 * s, 2 * s))
    for i, (tr, ta) in enumerate(tiles):
        r, c = divmod(i, 2)
        rgb[r * s:(r + 1) * s, c * s:(c + 1) * s] = tr
        a[r * s:(r + 1) * s, c * s:(c + 1) * s] = ta
    return np.concatenate([bleed(rgb, a), a[..., None]], 2)


def tile_uv(tile, x, y):
    """Blender UV of a point (x, y; y down) inside tile 0-3 of a 2x2 atlas."""
    r, c = divmod(tile, 2)
    return ((c + x) / 2, 1 - (r + y) / 2)


lance = lambda t: np.sin(math.pi * np.clip(t, 0, 1) ** 0.75) ** 0.9
ovate = lambda t: np.sin(math.pi * np.clip(t, 0, 1) ** 0.6) ** 0.7
taper = lambda t: (1 - np.clip(t, 0, 1)) ** 0.7 * np.minimum(1, np.clip(t, 0, 1) * 12)


def jitter(rng, color, amount):
    return np.clip(np.asarray(color) * (1 + rng.normal(0, amount)) + rng.normal(0, amount * 0.25, 3), 0, 1)


# ---------------------------------------------------------------- geometry
class Builder:
    """One part of one variant: bmesh with UVs and a per-vertex shade, plus lighting normals per vertex."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.col = self.bm.verts.layers.float_color.new("Col")
        self.normals = {}  # vert -> lighting normal (leaves)

    def quad(self, corners, uvs, shade=1.0, normal=None):
        verts = [self.bm.verts.new(p) for p in corners]
        for v, p in zip(verts, corners):
            v[self.col] = (shade, shade, shade, 1.0)
            if normal is not None:
                self.normals[v] = normal(p)
        face = self.bm.faces.new(verts)
        for loop, uv in zip(face.loops, uvs):
            loop[self.uv].uv = uv
        return face

    def grid(self, rows, uvs, shades, normal=None):
        """Faces joining rows of points (each row the same length)."""
        vs = []
        for row, srow in zip(rows, shades):
            line = []
            for p, s in zip(row, srow):
                v = self.bm.verts.new(p)
                v[self.col] = (s, s, s, 1.0)
                if normal is not None:
                    self.normals[v] = normal(p)
                line.append(v)
            vs.append(line)
        for i in range(len(rows) - 1):
            for k in range(len(rows[0]) - 1):
                face = self.bm.faces.new((vs[i][k], vs[i][k + 1], vs[i + 1][k + 1], vs[i + 1][k]))
                for loop, (a, b) in zip(face.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                    loop[self.uv].uv = uvs[a][b]

    def tube(self, pts, radii, sides, vscale, u0=0.0, u1=1.0, shade=1.0):
        """A tapered tube along `pts`, verts shared round each ring (smooth), UV u round it and v along it."""
        frame = None
        rings, s = [], 0.0
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            if frame is None:
                frame = t.orthogonal().normalized()
            frame = (frame - t * frame.dot(t)).normalized()
            b = t.cross(frame)
            if i:
                s += (p - pts[i - 1]).length
            ring = []
            for k in range(sides):
                a = math.tau * k / sides
                v = self.bm.verts.new(p + (frame * math.cos(a) + b * math.sin(a)) * radii[i])
                v[self.col] = (shade, shade, shade, 1.0)
                ring.append(v)
            rings.append((ring, s / vscale))
        for (r0, v0), (r1, v1) in zip(rings[:-1], rings[1:]):
            for k in range(sides):
                k1 = (k + 1) % sides
                face = self.bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
                ua, ub = u0 + (u1 - u0) * k / sides, u0 + (u1 - u0) * (k + 1) / sides
                for loop, uv in zip(face.loops, ((ua, v0), (ub, v0), (ub, v1), (ua, v1))):
                    loop[self.uv].uv = uv
                face.smooth = True

    def finish(self, name, material):
        me = bpy.data.meshes.new(name)
        self.bm.verts.index_update()
        lookup = {v.index: n for v, n in self.normals.items()}
        self.bm.to_mesh(me)
        self.bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        if lookup:
            me.normals_split_custom_set([lookup[loop.vertex_index] for loop in me.loops])
        me.materials.append(material)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


def material(name):
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def card(b, center, normal, up, size, tile, shade, light, aspect=1.0, flip=False, inset=0.02):
    """A square leaf card at `center`, facing `normal`, its image's top toward `up`."""
    side = up.cross(normal)
    if side.length < 1e-4:
        side = normal.orthogonal()
    side.normalize()
    upv = normal.cross(side).normalized()
    hx, hy = side * size * 0.5, upv * size * 0.5 * aspect
    corners = [center - hx - hy, center + hx - hy, center + hx + hy, center - hx + hy]
    lo, hi = inset, 1 - inset
    xs = (hi, lo, lo, hi) if flip else (lo, hi, hi, lo)
    uvs = [tile_uv(tile, x, y) for x, y in zip(xs, (hi, hi, lo, lo))]
    b.quad(corners, uvs, shade, light)


def kmeans_spheres(points, weights, k, pad, rng, iters=40):
    """Crown spheres covering the foliage: k-means centres, radius out to the 85th percentile, plus `pad`."""
    pts = np.asarray(points)
    w = np.asarray(weights)
    k = min(k, len(pts))
    centres = pts[rng.choice(len(pts), k, replace=False, p=w / w.sum())]
    for _ in range(iters):
        lab = np.argmin(((pts[:, None] - centres[None]) ** 2).sum(-1), 1)
        for j in range(k):
            m = lab == j
            if m.any():
                centres[j] = (pts[m] * w[m, None]).sum(0) / w[m].sum()
    out = []
    for j in range(k):
        m = lab == j
        if not m.any():
            continue
        d = np.linalg.norm(pts[m] - centres[j], axis=1)
        out.append((centres[j], float(np.percentile(d, 85)) + pad))
    return out


def gltf(v):
    """Blender (z up) to glTF (y up): (x, z, -y)."""
    return [round(float(v[0]), 3), round(float(v[2]), 3), round(float(-v[1]), 3)]


# ---------------------------------------------------------------- eucalyptus
def eucalyptus_textures(rng):
    h, w = 512, 256
    # Lemon-scented / spotted gum: smooth pale bark shed in patches, cream over grey, pink and olive.
    base = np.full((h, w, 3), (0.70, 0.68, 0.62))
    patches = [((0.60, 0.61, 0.59), 34, 0.3), ((0.74, 0.64, 0.56), 24, 0.85), ((0.60, 0.59, 0.50), 40, 0.7),
               ((0.80, 0.78, 0.71), 18, 0.5), ((0.50, 0.47, 0.42), 12, 1.6)]
    for color, scale, level in patches:
        n = fbm(h, w, scale, rng, 3, stretch=(0.45, 1.0))
        base = mixc(base, color, smooth(level, level + 0.12, n))
    grain = fbm(h, w, 2.0, rng, 2, stretch=(0.2, 1.0))
    base *= (0.95 + 0.05 * grain)[..., None]
    streak = smooth(1.2, 2.2, noise(h, w, 1.5, rng, stretch=(0.08, 1.0)))
    base = mixc(base, (0.45, 0.41, 0.36), streak * 0.35)
    save(base, "eucalyptus_bark.jpg", 84)

    S = 512
    sage = [(0.35, 0.40, 0.29), (0.38, 0.43, 0.30), (0.33, 0.39, 0.32), (0.42, 0.44, 0.30), (0.31, 0.36, 0.26)]
    tiles = []
    for t, (n_twigs, per) in enumerate([(8, 30), (10, 32), (9, 38), (7, 26)]):
        cv = Canvas(S)
        for layer in range(2):
            dim = 0.62 if layer == 0 else 0.95
            for _ in range(n_twigs // 2 + layer):
                # Twigs leave high in the tile, arch out and sag; the leaves hang straight down off them.
                p = np.array([rng.uniform(0.22, 0.78), rng.uniform(0.04, 0.4)])
                side = -1 if rng.random() < 0.5 else 1
                rise = rng.uniform(0.1, 0.7)
                d = np.array([side * math.cos(rise), -math.sin(rise)])
                pts = [p.copy()]
                for i in range(6):
                    d = d / np.linalg.norm(d) + np.array([0, 0.2])
                    d = d / np.linalg.norm(d)
                    p = p + d * rng.uniform(0.05, 0.08)
                    pts.append(p.copy())
                cv.stroke(pts, 0.006, np.array((0.42, 0.33, 0.26)) * dim)
                for i in range(per // 2):
                    s = rng.uniform(0.05, 1.0)
                    seg = min(len(pts) - 2, int(s * (len(pts) - 1)))
                    f = s * (len(pts) - 1) - seg
                    at = pts[seg] * (1 - f) + pts[seg + 1] * f
                    hang = math.pi / 2 + rng.normal(0, 0.4)
                    color = jitter(rng, sage[rng.integers(len(sage))], 0.08) * dim
                    if rng.random() < 0.04:
                        color = np.array((0.50, 0.36, 0.26)) * dim
                    cv.blade(at, hang, rng.uniform(0.08, 0.14), rng.uniform(0.016, 0.026), color, lance,
                             curve=rng.normal(0, 0.18), rib=0.9, tipshade=1.08)
        tiles.append(cv.pixels())
    save(atlas(tiles), "eucalyptus_leaves.webp", 82)


def eucalyptus(letter, seed):
    rng = np.random.default_rng(seed)
    form = {"a": dict(height=16.5, fork=0.42, leaders=3, stems=1, width=0.9),
            "b": dict(height=18.0, fork=0.30, leaders=2, stems=2, width=0.8),
            "c": dict(height=14.5, fork=0.48, leaders=3, stems=1, width=1.0)}[letter]
    H = form["height"]
    k = H / 16.5
    bark, leaves = Builder(), Builder()
    masses = []  # (centre, radius) of each foliage mass

    def limb(start, d, length, r0, r1, sides, droop, wob):
        segs = max(2, int(length / 1.1) + 1)
        pts, p, dd = [start.copy()], start.copy(), d.normalized()
        for i in range(segs):
            dd = (dd - UP * droop + Vector(rng.normal(0, wob, 3))).normalized()
            p = p + dd * (length / segs)
            pts.append(p.copy())
        radii = [r0 + (r1 - r0) * i / segs for i in range(segs + 1)]
        bark.tube(pts, radii, sides, math.tau * max(r0, 0.06) * 2)
        return pts, radii

    def along(pts, radii, t):
        x = t * (len(pts) - 1)
        i = min(len(pts) - 2, int(x))
        f = x - i
        return pts[i].lerp(pts[i + 1], f), radii[i] + (radii[i + 1] - radii[i]) * f, (pts[i + 1] - pts[i]).normalized()

    def mass(at, R):
        masses.append((at - UP * R * rng.uniform(-0.1, 0.5), R))

    r0 = 0.44 * k * (0.78 if form["stems"] > 1 else 1.0)
    lean_az = rng.uniform(0, math.tau)
    for stem in range(form["stems"]):
        az = lean_az + stem * (math.pi + rng.uniform(-0.4, 0.4))
        lean = math.radians(rng.uniform(2, 5) if form["stems"] == 1 else rng.uniform(8, 12))
        d = Vector((math.cos(az) * math.sin(lean), math.sin(az) * math.sin(lean), math.cos(lean)))
        base = Vector((0, 0, -0.2)) + Vector((math.cos(az), math.sin(az), 0)) * (0.16 if form["stems"] > 1 else 0)
        tpts, trad = limb(base, d, H * form["fork"] + rng.uniform(-0.4, 0.4), r0, r0 * 0.8, 9, 0.0, 0.025)
        trad[0] *= 1.3
        top, rtop = tpts[-1], trad[-1]
        n_lead = form["leaders"]
        for l in range(n_lead):
            laz = az + l / n_lead * math.tau + rng.uniform(-0.4, 0.4)
            tilt = math.radians(rng.uniform(8, 22) + (6 if form["stems"] > 1 else 0))
            ld = Vector((math.cos(laz) * math.sin(tilt), math.sin(laz) * math.sin(tilt), math.cos(tilt)))
            start = tpts[-2].lerp(top, 0.7)
            length = (H - 2.0 * k - top.z) / math.cos(tilt) * rng.uniform(0.78, 1.0)
            lpts, lrad = limb(start, ld, length, rtop * 0.72, 0.1 * k, 6, -0.02, 0.06)
            mass(lpts[-1] + ld * 0.6, rng.uniform(1.5, 2.1) * k)
            out_az = laz
            n_side = int(rng.integers(4, 7))
            for j in range(n_side):
                t = 0.36 + 0.6 * (j + rng.uniform(0.0, 0.8)) / n_side
                at, r_at, dir_at = along(lpts, lrad, t)
                saz = out_az + rng.uniform(-1.4, 1.4) + j * 2.4
                out = Vector((math.cos(saz), math.sin(saz), 0))
                spread = math.radians(rng.uniform(50, 80))
                sd = (dir_at * math.cos(spread) + out * math.sin(spread)).normalized()
                slen = rng.uniform(2.4, 4.2) * k * form["width"] * (1.2 - 0.5 * t)
                spts, srad = limb(at, sd, slen, r_at * 0.55, 0.035, 5, 0.12, 0.08)
                mass(spts[-1], rng.uniform(1.2, 1.9) * k)
                for q in range(int(rng.integers(1, 3))):
                    tq = rng.uniform(0.45, 0.8)
                    a2, r2, d2 = along(spts, srad, tq)
                    tw = (d2 + Vector(rng.normal(0, 0.7, 3)) + UP * 0.3).normalized()
                    wpts, _ = limb(a2, tw, rng.uniform(1.0, 1.8) * k, r2 * 0.6, 0.015, 4, 0.12, 0.1)
                    mass(wpts[-1], rng.uniform(0.9, 1.4) * k)

    # Foliage masses: lumpy, open, the lower half hanging in a fringe.
    SIZE = 1.75 * k
    crown_c = sum((c for c, _ in masses), Vector()) / len(masses)
    clumps = []
    for c, R in masses:
        # A hanging tuft: flat on top, its fringe drooping well below the twig.
        for _ in range(int(4.5 * (R / k) ** 2) + 2):
            while True:
                v = Vector(rng.uniform(-1, 1, 3))
                if v.length <= 1:
                    break
            q = c + Vector((v.x * R, v.y * R, v.z * R * (0.6 if v.z > 0 else 0.95)))
            clumps.append((q, c, R))
    reach = max((q - crown_c).length for q, _, _ in clumps)
    for q, c, R in clumps:
        depth = min(1.0, (q - c).length / R)
        shade = (0.55 + 0.45 * depth ** 0.7) * (0.8 + 0.2 * min(1.0, (q - crown_c).length / reach))

        def light(p, c=c):
            a, b = (p - c), (p - crown_c)
            a.z *= 0.8
            b.z *= 0.8
            return (a.normalized() * 0.55 + b.normalized() * 0.45).normalized()

        out = q - crown_c
        out.z = 0
        out = out.normalized() if out.length > 1e-3 else Vector((1, 0, 0))
        n1 = (out + UP * rng.uniform(0.1, 0.6)).normalized()
        yaw = rng.uniform(0, math.tau)
        n2 = Vector((math.cos(yaw), math.sin(yaw), rng.uniform(-0.15, 0.15))).normalized()
        for n in (n1, n2):
            card(leaves, q, n, UP, SIZE * rng.uniform(0.85, 1.15), int(rng.integers(4)), shade, light, flip=rng.random() < 0.5)
    spheres = kmeans_spheres([q[:] for q, _, _ in clumps], [1.0] * len(clumps), 5, SIZE * 0.4, rng)
    return bark, leaves, spheres


# ---------------------------------------------------------------- ornamental
def ornamental_textures(rng):
    h, w = 512, 256
    base = np.full((h, w, 3), (0.42, 0.38, 0.33))
    n = fbm(h, w, 18, rng, 3, stretch=(0.5, 1.0))
    base = mixc(base, (0.33, 0.30, 0.27), smooth(0.2, 0.9, n))
    lichen = fbm(h, w, 10, rng, 3)
    base = mixc(base, (0.52, 0.52, 0.45), smooth(0.9, 1.4, lichen) * 0.7)
    fiss = smooth(1.0, 2.0, noise(h, w, 1.6, rng, stretch=(0.1, 1.0)))
    base = mixc(base, (0.22, 0.19, 0.16), fiss * 0.7)
    save(base, "ornamental_bark.jpg", 84)

    S = 256
    greens = [(0.27, 0.38, 0.16), (0.31, 0.43, 0.18), (0.24, 0.34, 0.15), (0.35, 0.45, 0.20), (0.29, 0.39, 0.13)]
    tiles = []
    for t in range(4):
        cv = Canvas(S, ss=3)
        # A ragged ball of small leaves: dark inside, lighter and sparser at the rim.
        for _ in range(4):
            a0 = rng.uniform(0, math.tau)
            pts = [np.array([0.5, 0.5])]
            for i in range(4):
                pts.append(pts[-1] + np.array([math.cos(a0), math.sin(a0)]) * 0.1 + rng.normal(0, 0.02, 2))
            cv.stroke(pts, 0.012, (0.25, 0.21, 0.17))
        count = (230, 290, 200, 260)[t]
        for i in range(count):
            r = 0.44 * math.sqrt(rng.random()) * (0.85 + 0.15 * math.sin(rng.uniform(0, 6)))
            a = rng.uniform(0, math.tau)
            at = np.array([0.5 + r * math.cos(a), 0.5 + r * math.sin(a)])
            k = i / count  # painted back to front: earlier is deeper
            dim = 0.62 + 0.4 * k
            color = jitter(rng, greens[rng.integers(len(greens))], 0.09) * dim
            point = a + rng.normal(0, 0.9)
            cv.blade(at, point, rng.uniform(0.045, 0.07), rng.uniform(0.025, 0.035), color, ovate, curve=rng.normal(0, 0.1), rib=0.88)
        tiles.append(cv.pixels())
    save(atlas(tiles), "ornamental_leaves.webp", 82)


def ornamental(letter, seed):
    """A young street tree: a thin, slightly crooked trunk forking at half height into a few
    upright limbs, each ending in its own loose tuft of leaves, with sky between them."""
    rng = np.random.default_rng(seed)
    form = {"a": dict(height=4.7, trunk=2.1, limbs=4, reach=1.1),
            "b": dict(height=5.2, trunk=2.5, limbs=3, reach=0.95),
            "c": dict(height=4.0, trunk=1.7, limbs=5, reach=1.0)}[letter]
    H = form["height"]
    bark, leaves = Builder(), Builder()
    lean = Vector((rng.normal(0, 0.04), rng.normal(0, 0.04), 1)).normalized()
    pts = [Vector((0, 0, -0.15))]
    for i in range(6):
        pts.append(pts[-1] + (lean + Vector((rng.normal(0, 0.05), rng.normal(0, 0.05), 0))).normalized() * (form["trunk"] + 0.15) / 6)
    r0 = 0.06
    bark.tube(pts, [r0 * 1.3] + [r0 * (1 - 0.25 * i / 6) for i in range(1, 7)], 7, math.tau * r0 * 2)
    fork = pts[-1]
    tufts = []  # (centre, radius) of each leaf tuft
    for l in range(form["limbs"]):
        az = l / form["limbs"] * math.tau + rng.uniform(-0.6, 0.6)
        tilt = math.radians(rng.uniform(10, 30))
        d = Vector((math.cos(az) * math.sin(tilt), math.sin(az) * math.sin(tilt), math.cos(tilt)))
        top = H - 0.45 - fork.z
        length = top / max(math.cos(tilt), 0.5) * rng.uniform(0.7, 1.0)
        lp = [fork.copy()]
        for i in range(4):
            d = (d + Vector(rng.normal(0, 0.12, 3)) + UP * 0.03).normalized()
            lp.append(lp[-1] + d * length / 4)
        bark.tube(lp, [0.04 * (1 - 0.6 * i / 4) for i in range(5)], 5, math.tau * 0.04 * 2)
        tufts.append((lp[-1] + UP * 0.1, rng.uniform(0.55, 0.75) * form["reach"]))
        # Side shoots off the upper half of the limb, each with a smaller tuft, pointing outward.
        for twig in range(int(rng.integers(1, 3))):
            base = lp[2 + twig % 2].lerp(lp[3], rng.uniform(0, 0.6))
            out = Vector((math.cos(az + rng.normal(0, 0.8)), math.sin(az + rng.normal(0, 0.8)), rng.uniform(0.3, 0.9))).normalized()
            tl = rng.uniform(0.45, 0.8) * form["reach"]
            tp = [base, base + out * tl * 0.5, base + (out + UP * 0.2).normalized() * tl]
            bark.tube(tp, [0.02, 0.014, 0.008], 4, 0.3)
            tufts.append((tp[-1], rng.uniform(0.35, 0.55) * form["reach"]))
    crown_c = sum((c for c, _ in tufts), Vector()) / len(tufts)
    SIZE = 0.72
    clumps = []
    for c, R in tufts:
        # A loose, flattish tuft: clumps scattered through it, thinning toward its edge.
        for _ in range(int(11 * (R / 0.6) ** 2) + 3):
            while True:
                v = Vector(rng.uniform(-1, 1, 3))
                if v.length <= 1:
                    break
            v *= rng.random() ** 0.35
            clumps.append((c + Vector((v.x * R, v.y * R, v.z * R * 0.7)), c, R))
    reach = max((q - crown_c).length for q, _, _ in clumps)
    for q, c, R in clumps:
        depth = min(1.0, (q - c).length / R)
        shade = (0.6 + 0.4 * depth ** 0.7) * (0.82 + 0.18 * min(1.0, (q - crown_c).length / reach))

        def light(p, c=c):
            a, b = p - c, p - crown_c
            a.z *= 0.8
            b.z *= 0.8
            return (a.normalized() * 0.5 + b.normalized() * 0.5).normalized()

        out = (q - c).normalized() if (q - c).length > 1e-3 else UP.copy()
        n2 = Vector(rng.normal(0, 1, 3)).normalized()
        if under:  # kept near level, so no card hangs below the clipped underside
            n2 = (n2 * 0.45 + Vector((0, 0, -1 if n2.z < 0 else 1))).normalized()
        spin = Vector(rng.normal(0, 1, 3)).normalized()
        for n in (out, n2):
            card(leaves, q, n, spin, SIZE * rng.uniform(0.75, 1.2), int(rng.integers(4)), shade, light)
    spheres = kmeans_spheres([q[:] for q, _, _ in clumps], [1.0] * len(clumps), 1, SIZE * 0.3, rng)
    return bark, leaves, spheres


# ---------------------------------------------------------------- fan palm
FAN_R, FAN_PHI, FAN_CY, FAN_RT = 0.85, math.radians(96), 0.56, 0.44


def fan_uv(tile, r, phi):
    """Where a point of the fan (r in 0..1 of its radius, phi off its midrib) is painted in its tile."""
    return tile_uv(tile, 0.5 + r * FAN_RT * math.sin(phi), FAN_CY - r * FAN_RT * math.cos(phi))


def palm_textures(rng):
    h, w = 512, 256
    y = np.arange(h)[:, None] / h
    # Grey, finely ringed with old leaf scars, faint vertical cracks.
    base = np.full((h, w, 3), (0.47, 0.43, 0.38))
    rings = 0.5 + 0.5 * np.sin(y * math.tau * 34 + 0.6 * noise(h, w, 20, rng))
    base *= (0.9 + 0.1 * rings)[..., None]
    base = mixc(base, (0.36, 0.33, 0.29), smooth(0.3, 1.2, fbm(h, w, 22, rng, 3, stretch=(0.4, 1.0))) * 0.8)
    base = mixc(base, (0.58, 0.56, 0.50), smooth(0.8, 1.5, fbm(h, w, 9, rng, 3)) * 0.5)
    base = mixc(base, (0.25, 0.22, 0.19), smooth(1.2, 2.2, noise(h, w, 1.4, rng, stretch=(0.07, 1.0))) * 0.7)
    save(base, "fan_palm_bark.jpg", 84)

    S = 512
    tiles = []
    # Tiles 0 and 1: live fans, a fresher one and an older one browning at the tips.
    # Washingtonia fans are a dull grey-green, never grass-bright.
    for t, (inner, outer, tip) in enumerate([((0.47, 0.49, 0.34), (0.37, 0.43, 0.30), (0.41, 0.44, 0.32)),
                                             ((0.49, 0.48, 0.36), (0.42, 0.44, 0.33), (0.53, 0.47, 0.35))]):
        n = S * 2
        ys, xs = np.mgrid[0:n, 0:n]
        x, yy = (xs + 0.5) / n - 0.5, FAN_CY - (ys + 0.5) / n
        r = np.hypot(x, yy) / FAN_RT
        phi = np.arctan2(x, yy)
        segs = 52
        k = (phi + FAN_PHI) / (2 * FAN_PHI) * segs
        idx = np.clip(np.floor(k).astype(int), 0, segs - 1)
        f = k - np.floor(k)
        split = 0.48 + 0.12 * rng.random(segs)
        tipr = np.clip(0.97 - 0.12 * rng.random(segs) - (rng.random(segs) < 0.12) * 0.25, 0.5, 1)
        rs, rt = split[idx], tipr[idx]
        z = np.clip((r - rs) / np.maximum(rt - rs, 1e-3), 0, 1)
        half = np.where(r < rs, 0.5, 0.44 * (1 - z) ** 0.55)
        inside = (np.abs(phi) < FAN_PHI - 0.03) & (r < rt) & (np.abs(f - 0.5) < half) & (r > 0.015)
        fold = 0.78 + 0.22 * np.cos(math.tau * f) ** 2 * np.sign(np.cos(math.tau * f))
        col = mixc(np.full((n, n, 3), inner), outer, smooth(0.05, 0.6, r))
        col = mixc(col, tip, smooth(0.6, 1.0, r) * (0.5 + 0.5 * rng.random(segs)[idx]))
        col = col * fold[..., None] * (1 + 0.06 * rng.standard_normal(segs)[idx])[..., None]
        col = mixc(col, (0.62, 0.52, 0.30), smooth(0.08, 0.0, r))  # the hastula
        a = inside.astype(float)
        a2 = a.reshape(S, 2, S, 2).mean(axis=(1, 3))
        c2 = (col * a[..., None]).reshape(S, 2, S, 2, 3).mean(axis=(1, 3)) / np.maximum(a2, 1e-6)[..., None]
        tiles.append((c2, a2))
    # Tile 2: the skirt, a thatch of dead fronds hanging against the trunk.
    straw = [(0.54, 0.48, 0.38), (0.47, 0.40, 0.31), (0.40, 0.34, 0.26), (0.57, 0.52, 0.43), (0.34, 0.29, 0.23)]
    cv = Canvas(S)
    cv.blade(np.array([-0.1, 0.0]), 0.0, 1.2, 0.5, (0.30, 0.24, 0.17), lambda t: np.ones_like(t), rib=1.0)
    for i in range(260):
        k = i / 260
        top = rng.uniform(-0.05, 0.3)
        x0 = rng.uniform(-0.05, 1.05)
        color = jitter(rng, straw[rng.integers(len(straw))], 0.07) * (0.62 + 0.42 * k)
        cv.blade(np.array([x0, top]), math.pi / 2 + rng.normal(0, 0.1), rng.uniform(0.5, 1.0) - top * 0.5,
                 rng.uniform(0.03, 0.08), color, taper, curve=rng.normal(0, 0.08), rib=0.8)
    tiles.append(cv.pixels())
    # Tile 3: a freshly dead fan hanging folded from the head.
    cv = Canvas(S)
    for i in range(70):
        k = i / 70
        ang = math.pi / 2 + rng.uniform(-0.42, 0.42)
        color = jitter(rng, straw[rng.integers(len(straw))], 0.07) * (0.65 + 0.4 * k)
        if rng.random() < 0.2:
            color = color * np.array((0.85, 0.95, 0.75)) + np.array((0.0, 0.04, 0.0))
        cv.blade(np.array([0.5 + rng.normal(0, 0.03), 0.04]), ang, rng.uniform(0.6, 0.92), rng.uniform(0.05, 0.1),
                 color, taper, curve=rng.normal(0, 0.1), rib=0.78)
    tiles.append(cv.pixels())
    save(atlas(tiles), "fan_palm_leaves.webp", 82)


def fan_palm(letter, seed):
    rng = np.random.default_rng(seed)
    form = {"a": dict(height=18.5, skirt=2.8, fans=30, curve=0.035),
            "b": dict(height=20.0, skirt=1.4, fans=26, curve=0.05),
            "c": dict(height=16.0, skirt=3.8, fans=32, curve=0.025)}[letter]
    H = form["height"]
    head = H - 1.9  # trunk top; the fans reach above it
    bark, leaves = Builder(), Builder()
    az = rng.uniform(0, math.tau)
    lean = Vector((math.cos(az), math.sin(az), 0))
    side = Vector((-lean.y, lean.x, 0))
    wobble = rng.uniform(0, math.tau)
    pts, radii = [], []
    n = 22
    for i in range(n + 1):
        t = i / n
        z = -0.2 + (head + 0.2) * t
        off = lean * form["curve"] * head * (t * t * 1.4 - 0.4 * t) + side * 0.12 * math.sin(t * 3 + wobble) * t
        pts.append(Vector((off.x, off.y, z)))
        flare = 0.22 * math.exp(-max(z, 0) / 0.6)
        radii.append(0.21 - 0.035 * t + flare + (0.12 * smooth(0.93, 1.0, np.array(t)).item()))
    bark.tube(pts, radii, 8, math.tau * 0.2 * 2)
    top = pts[-1]
    hc = top + UP * 0.35  # the head's middle

    def light(p):
        d = p - hc
        d.z = d.z * 0.7 + 0.25
        return d.normalized()

    # Live fans: petioles out of the head, young ones erect, old ones drooping.
    golden = math.pi * (3 - math.sqrt(5))
    reach = 0.0
    for i in range(form["fans"]):
        k = i / (form["fans"] - 1)
        elev = math.radians(10 + 118 * k ** 0.9 + rng.uniform(-6, 6))
        a = i * golden + rng.uniform(-0.2, 0.2)
        d = Vector((math.sin(elev) * math.cos(a), math.sin(elev) * math.sin(a), math.cos(elev)))
        plen = rng.uniform(1.2, 1.7)
        start = top + UP * rng.uniform(0.0, 0.5)
        pp = [start]
        dd = d.copy()
        for j in range(3):
            dd = (dd - UP * 0.1 * k).normalized()
            pp.append(pp[-1] + dd * plen / 3)
        base = pp[-1]
        e1 = (dd + UP * 0.12).normalized()
        e2 = e1.cross(UP)
        if e2.length < 0.2:
            e2 = Vector((-math.sin(a), math.cos(a), 0))
        e2.normalize()
        e3 = e1.cross(e2)
        if e3.z < 0:
            e2, e3 = -e2, -e3
        roll = rng.uniform(-0.5, 0.5)  # blades held at all angles, so the head reads round from anywhere
        e2, e3 = e2 * math.cos(roll) + e3 * math.sin(roll), e3 * math.cos(roll) - e2 * math.sin(roll)
        tile = 1 if k > 0.7 and rng.random() < 0.6 else 0
        petiole_uv = fan_uv(tile, 0.2, 0.0)
        # A petiole: a thin three-sided stalk, solid fan color.
        rings = []
        for j, p in enumerate(pp):
            r = 0.045 - 0.02 * j / 3
            rings.append([p + (e2 * math.cos(q) + e3 * math.sin(q)) * r for q in (0, 2.1, 4.2, 0)])
        leaves.grid(rings, [[petiole_uv] * 4 for _ in rings], [[0.8] * 4 for _ in rings], light)
        droop = rng.uniform(0.55, 0.85) + 0.4 * k
        spokes, rads = 11, (0.0, 0.3, 0.55, 0.78, 1.0)
        rows, uvs, shades = [], [], []
        for rr in rads:
            row, urow = [], []
            for s in range(spokes):
                phi = -FAN_PHI + 2 * FAN_PHI * s / (spokes - 1)
                r = max(rr, 0.02) * FAN_R
                h = 0.45 * abs(math.sin(phi)) * r - droop * FAN_R * max(0.0, rr - 0.35) ** 2 * (1 + 0.8 * abs(math.sin(phi)))
                h += (0.03 if s % 2 else -0.03) * rr
                row.append(base + e1 * (r * math.cos(phi)) + e2 * (r * math.sin(phi)) + e3 * h)
                urow.append(fan_uv(tile, max(rr, 0.02), phi))
            rows.append(row)
            uvs.append(urow)
            shades.append([0.72 + 0.28 * (1 - k * 0.6)] * spokes)
        leaves.grid(rows, uvs, shades, light)
        reach = max(reach, max((p - hc).length for p in rows[-1]))

    # Recently dead fans hanging round the head, then the skirt down the trunk.
    collar = int(rng.integers(9, 13))
    for i in range(collar):
        a = (i + rng.uniform(-0.3, 0.3)) / collar * math.tau
        radial = Vector((math.cos(a), math.sin(a), 0))
        top_p = top + radial * 0.4 + UP * rng.uniform(0.0, 0.3)
        bot_p = top + radial * rng.uniform(0.8, 1.1) - UP * rng.uniform(1.5, 2.1)
        tang = Vector((-radial.y, radial.x, 0))
        w = rng.uniform(0.45, 0.6)
        corners = [bot_p - tang * w, bot_p + tang * w, top_p + tang * w * 0.6, top_p - tang * w * 0.6]
        flip = rng.random() < 0.5
        xs = (0.98, 0.02) if flip else (0.02, 0.98)
        uv = [tile_uv(3, xs[0], 0.98), tile_uv(3, xs[1], 0.98), tile_uv(3, xs[1], 0.02), tile_uv(3, xs[0], 0.02)]
        leaves.quad(corners, uv, 0.72, light)
    if form["skirt"] > 0:
        z_top = top.z - 0.5
        z_bot = z_top - form["skirt"]
        for layer, (count, r_top, r_bot, bulge) in enumerate([(8, 0.42, 0.27, 0.04), (10, 0.6, 0.34, 0.08)]):
            for i in range(count):
                a = (i + 0.5 * layer + rng.uniform(-0.15, 0.15)) / count * math.tau
                width = math.tau * r_top / count * 0.75
                rows, uvs, shades = [], [], []
                for j in range(4):
                    t = j / 3
                    z = z_top + (z_bot - z_top) * t
                    ti = min(n, max(0, int(round((z + 0.2) / (head + 0.2) * n))))
                    cx = pts[ti]
                    r = r_top + (r_bot - r_top) * t + bulge * math.sin(math.pi * t)
                    radial = Vector((math.cos(a), math.sin(a), 0))
                    tang = Vector((-radial.y, radial.x, 0))
                    centre = Vector((cx.x, cx.y, z)) + radial * r
                    wj = width * (1 - 0.25 * t)
                    rows.append([centre - tang * wj, centre + tang * wj])
                    flip = (i + layer) % 2
                    x0, x1 = (0.98, 0.02) if flip else (0.02, 0.98)
                    yv = 0.01 + 0.98 * t
                    uvs.append([tile_uv(2, x0, yv), tile_uv(2, x1, yv)])
                    s = (0.6 + 0.2 * t) * (0.9 if layer == 0 else 1.0)
                    shades.append([s, s])
                leaves.grid(rows, uvs, shades, lambda p: Vector((p.x - top.x, p.y - top.y, 0.15)).normalized())
    spheres = [(np.array(hc[:]), reach * 0.8)]
    return bark, leaves, spheres


# ---------------------------------------------------------------- ficus
def ficus_textures(rng):
    """Bark: two tiles side by side, each tiling round the trunk on its own: u 0-0.5 the bare bark,
    u 0.5-1 the whitewash painted on the trunk's foot. Leaves: four clumps of small glossy leaves."""
    h, hw = 512, 128

    half = lambda color: np.full((h, hw, 3), color)

    # Bare bark: smooth, pale grey, softly mottled, ringed with fine wavy wrinkles, a little lichen.
    bare = half((0.45, 0.42, 0.37))
    bare = mixc(bare, (0.37, 0.345, 0.31), smooth(0.0, 1.0, fbm(h, hw, 22, rng, 3, stretch=(0.6, 1.0))) * 0.8)
    bare = mixc(bare, (0.52, 0.50, 0.45), smooth(0.6, 1.4, fbm(h, hw, 10, rng, 3)) * 0.6)
    bare = mixc(bare, (0.40, 0.42, 0.35), smooth(1.0, 1.7, fbm(h, hw, 7, rng, 3)) * 0.45)
    wrinkle = noise(h, hw, 1.0, rng, stretch=(1.0, 0.07))
    bare = mixc(bare, (0.29, 0.27, 0.24), smooth(1.3, 2.3, wrinkle) * 0.6)
    bare *= (0.96 + 0.04 * fbm(h, hw, 2.0, rng, 2))[..., None]
    # Whitewash: chalky, brushed up and down, the grey bark showing where it's thin or worn.
    wash = half((0.64, 0.63, 0.60))
    thin = smooth(0.5, 1.5, fbm(h, hw, 9, rng, 3, stretch=(0.25, 1.0)))
    wash = mixc(wash, (0.46, 0.44, 0.40), thin * 0.7)
    wash *= (0.97 + 0.03 * noise(h, hw, 1.2, rng, stretch=(0.06, 1.0)))[..., None]
    wash = mixc(wash, (0.54, 0.52, 0.48), smooth(1.4, 2.2, fbm(h, hw, 4, rng, 2)) * 0.5)
    save(np.concatenate([bare, wash], 1), "ficus_bark.jpg", 82)

    S = 512
    dark = [(0.14, 0.195, 0.10), (0.16, 0.22, 0.11), (0.12, 0.17, 0.09), (0.18, 0.235, 0.12), (0.15, 0.205, 0.09)]
    fresh = [(0.25, 0.32, 0.13), (0.29, 0.355, 0.16), (0.23, 0.30, 0.12)]
    leaf = lambda t: np.sin(math.pi * np.clip(t, 0, 1) ** 0.8) ** 0.6
    tiles = []
    # (leaves, share of fresh growth at the rim, how dark the deepest leaves are, twigs)
    for t, (count, fresh_share, deep) in enumerate([(1050, 0.12, 0.5), (1150, 0.18, 0.5), (800, 0.45, 0.58), (1150, 0.0, 0.42)]):
        cv = Canvas(S)
        ph = rng.uniform(0, math.tau, 3)
        rim = lambda a: 0.43 + 0.035 * math.sin(3 * a + ph[0]) + 0.025 * math.sin(5 * a + ph[1]) + 0.015 * math.sin(8 * a + ph[2])
        for _ in range(7):
            a0 = rng.uniform(0, math.tau)
            pts = [np.array([0.5, 0.5]) + rng.normal(0, 0.05, 2)]
            for i in range(5):
                a0 += rng.normal(0, 0.25)
                pts.append(pts[-1] + np.array([math.cos(a0), math.sin(a0)]) * 0.075)
            cv.stroke(pts, 0.009, (0.24, 0.22, 0.18))
        for i in range(count):
            k = i / count  # painted back to front: earlier is deeper, darker
            a = rng.uniform(0, math.tau)
            r = rim(a) * rng.random() ** 0.45
            at = np.array([0.5 + r * math.cos(a), 0.5 + r * math.sin(a)])
            color = jitter(rng, dark[rng.integers(len(dark))], 0.08)
            if rng.random() < fresh_share * (r / rim(a)) ** 2 * (0.4 + k):
                color = jitter(rng, fresh[rng.integers(len(fresh))], 0.08)
            color = color * (deep + (1 - deep) * k)
            ang = a + rng.normal(0, 1.0)
            length = rng.uniform(0.038, 0.06)
            width = length * rng.uniform(0.42, 0.55)
            cv.blade(at, ang, length, width, color, leaf, curve=rng.normal(0, 0.08), rib=0.84, tipshade=0.94)
            if rng.random() < 0.6:
                # The gloss: a bluish sheen down one half of the blade.
                d = np.array([math.cos(ang), math.sin(ang)])
                p = np.array([-d[1], d[0]]) * width * 0.2 * (1 if rng.random() < 0.5 else -1)
                sheen = np.clip(color * 1.2 + np.array((0.03, 0.04, 0.05)) * (0.5 + k), 0, 1)
                cv.blade(at + d * length * 0.15 + p, ang, length * 0.65, width * 0.36, sheen, leaf, rib=1.0)
        tiles.append(cv.pixels())
    sheet = atlas(tiles)
    sheet[..., 3] = sheet[..., 3] > 0.5  # the shader cuts at half: a hard mask stores in half the bytes
    save(sheet, "ficus_leaves.webp", 70)


def fluted(b, pts, radius, sides, vscale, bands):
    """A tube like Builder.tube, its ring radius `radius(i, angle)` (the trunk's flutes and root flare),
    textured in bands: (first ring, last ring, u0, u1), the ring between two bands doubled."""
    frames, frame, s, along = [], None, 0.0, []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if frame is None:
            frame = Vector((1, 0, 0)) if abs(t.x) < 0.9 else t.orthogonal().normalized()
        frame = (frame - t * frame.dot(t)).normalized()
        frames.append((frame, t.cross(frame)))
        if i:
            s += (p - pts[i - 1]).length
        along.append(s / vscale)
    for first, last, u0, u1 in bands:
        rings = []
        for i in range(first, last + 1):
            fa, fb = frames[i]
            ring = []
            for k in range(sides):
                a = math.tau * k / sides
                v = b.bm.verts.new(pts[i] + (fa * math.cos(a) + fb * math.sin(a)) * radius(i, a))
                v[b.col] = (1.0, 1.0, 1.0, 1.0)
                ring.append(v)
            rings.append((ring, along[i]))
        for (r0, v0), (r1, v1) in zip(rings[:-1], rings[1:]):
            for k in range(sides):
                k1 = (k + 1) % sides
                face = b.bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
                ua, ub = u0 + (u1 - u0) * k / sides, u0 + (u1 - u0) * (k + 1) / sides
                for loop, uv in zip(face.loops, ((ua, v0), (ub, v0), (ub, v1), (ua, v1))):
                    loop[b.uv].uv = uv
                face.smooth = True


def bezier(p0, p1, p2, n):
    return [p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t for t in (i / n for i in range(n + 1))]


def ficus(letter, seed):
    """An old clipped street fig. The crown is built first as a lumpy flattened ball (lobes on its
    surface, each a cluster of leaf cards), then the limbs are grown out of the trunk into it."""
    rng = np.random.default_rng(seed)
    form = {"a": dict(height=10.2, base=4.5, radius=3.6, clear=2.8, limbs=5, off=0.8, wash=1.05, twin=False),
            "b": dict(height=10.6, base=4.65, radius=3.8, clear=3.0, limbs=4, off=1.0, wash=0.9, twin=True),
            "c": dict(height=10.0, base=4.35, radius=3.4, clear=2.6, limbs=6, off=0.6, wash=1.2, twin=False)}[letter]
    H, B, R = form["height"], form["base"], form["radius"]
    k = H / 10.0
    bark, leaves = Builder(), Builder()

    # The crown: off the trunk toward -y (glTF +z), flat underneath from clipping, a full dome on top.
    off_az = -math.pi / 2 + rng.uniform(-0.25, 0.25)
    cc = Vector((math.cos(off_az) * form["off"], math.sin(off_az) * form["off"], 0.0))
    top = H - 1.1 * k  # the skin's top: the corners of the cards on it reach about H
    top_h = (top - B) * 0.64
    cc.z = top - top_h
    bot_h = cc.z - B
    ph = rng.uniform(0, math.tau, 3)

    def reach(a):
        return R * (1 + 0.06 * math.sin(2 * a + ph[0]) + 0.05 * math.sin(3 * a + ph[1]) + 0.03 * math.sin(5 * a + ph[2]))

    def surface(d):
        """The crown's skin in direction `d` (unit) from its middle: a superellipse, squarer below."""
        a = math.atan2(d.y, d.x)
        hz = math.sqrt(max(0.0, 1 - d.z * d.z))
        n = 2.1 if d.z >= 0 else 5.0
        # Solve hz^n + |z|^n = 1 along the ray (|v| scaled): s * (hz, |z|) on the curve.
        s = (hz ** n + abs(d.z) ** n) ** (-1 / n)
        return cc + Vector((d.x * s * reach(a), d.y * s * reach(a), d.z * s * (top_h if d.z >= 0 else bot_h)))

    def outward(p):
        """The skin's normal near `p`: out of the crown's ellipsoid, flattened below."""
        q = p - cc
        a = math.atan2(q.y, q.x)
        rr = reach(a)
        vz = top_h if q.z >= 0 else bot_h * 0.6
        return Vector((q.x / rr ** 2, q.y / rr ** 2, q.z / vz ** 2)).normalized()

    # Lobes: clumps of foliage bulging out of the skin, spread evenly over it (a Fibonacci sphere).
    n_lobes = int(34 * (R / 3.6) ** 2)
    golden = math.pi * (3 - math.sqrt(5))
    lobes = []
    for i in range(n_lobes):
        z = 1 - 2 * (i + 0.5) / n_lobes
        a = i * golden + rng.uniform(-0.3, 0.3)
        hz = math.sqrt(1 - z * z)
        d = Vector((hz * math.cos(a), hz * math.sin(a), z + rng.uniform(-0.05, 0.05))).normalized()
        Lr = rng.uniform(1.3, 1.8) * k
        lobes.append((surface(d) - outward(surface(d)) * Lr * 0.6, Lr, d))

    SIZE = 1.95 * k
    clumps = []
    for c, Lr, d in lobes:
        out = outward(c)
        under = d.z < -0.45
        for _ in range(int(11.5 * (Lr / (1.55 * k)) ** 2) + 2):
            while True:
                v = Vector(rng.uniform(-1, 1, 3))
                if 0.05 < v.length <= 1 and v.normalized().dot(out) > -0.25:
                    break
            v = v.normalized() * rng.random() ** 0.3
            q = c + Vector((v.x * Lr, v.y * Lr, v.z * Lr * (0.55 if under else 0.8)))
            if under:
                q.z = max(q.z, B + rng.uniform(0.0, 0.25))
            clumps.append((q, c, Lr, under))

    for q, c, Lr, under in clumps:
        rel = q - cc
        a = math.atan2(rel.y, rel.x)
        depth = min(1.0, math.sqrt((rel.x ** 2 + rel.y ** 2) / reach(a) ** 2 + rel.z ** 2 / (top_h if rel.z > 0 else bot_h) ** 2))
        lift = min(1.0, max(0.0, (q.z - B) / (H - B)))
        shade = (0.5 + 0.5 * depth ** 1.5) * (0.62 + 0.38 * lift)

        def light(p, c=c):
            return ((p - c).normalized() * 0.3 + outward(p) * 0.7).normalized()

        n1 = (outward(q) + Vector(rng.normal(0, 0.35, 3))).normalized()
        n2 = Vector(rng.normal(0, 1, 3)).normalized()
        if under:  # kept near level, so no card hangs below the clipped underside
            n2 = (n2 * 0.45 + Vector((0, 0, -1 if n2.z < 0 else 1))).normalized()
        spin = Vector(rng.normal(0, 1, 3)).normalized()
        if under or depth < 0.7:
            tiles = (3, int(rng.integers(2)))
        elif q.z > cc.z and rng.random() < 0.4:
            tiles = (2, int(rng.integers(2)))
        else:
            tiles = (int(rng.integers(2)), 3 if rng.random() < 0.4 else int(rng.integers(2)))
        # Most clumps get a second card across the first, for depth from every side.
        crossed = rng.random() < 0.7
        for n, tile in list(zip((n1, n2), tiles))[:2 if crossed else 1]:
            card(leaves, q, n, spin, SIZE * rng.uniform(0.85, 1.15), tile, shade, light, flip=rng.random() < 0.5)

    # The trunk: whitewashed at its foot, fluted, its roots flaring out over the well.
    lean = Vector((cc.x, cc.y, 0)).normalized() * 0.06
    fork = Vector((0, 0, form["clear"])) + lean * form["clear"]
    r0 = 0.31 * k
    flute_ph = rng.uniform(0, math.tau)

    def trunk_r(z, a, r):
        flare = 0.75 * math.exp(-max(z, 0.0) / 0.4)
        return r * (1 + flare + (0.07 + 0.25 * flare) * math.cos(5 * a + flute_ph))

    # One trunk, or (b) two grown together from the soil and parting at the fork.
    if form["twin"]:
        side = Vector((math.cos(off_az + 1.6), math.sin(off_az + 1.6), 0))
        stems = [(side * 0.14, side), (-side * 0.14, -side)]
    else:
        stems = [(Vector((0, 0, 0)), None)]
    tops = []
    for st, side in stems:
        rs = r0 * (0.74 if side else 1.0)
        top = fork + (side * 0.42 if side else Vector()) + UP * (rng.uniform(-0.2, 0.2) if side else 0)
        foot = Vector((st.x, st.y, -0.2))
        pts = [foot.lerp(top, i / 8) + Vector((rng.normal(0, 0.02), rng.normal(0, 0.02), 0)) * (0 < i < 8) for i in range(9)]
        if side:  # together to head height, then apart
            for i, p in enumerate(pts):
                t = i / 8
                pts[i] = Vector((st.x * (1 - smooth(0.0, 0.5, np.array(t)).item() * 0.6), st.y * (1 - smooth(0.0, 0.5, np.array(t)).item() * 0.6), p.z)) \
                    + side * 0.42 * smooth(0.5, 1.0, np.array(t)).item() + (top - fork - side * 0.42) * t
        cut = max(2, min(7, int(round((form["wash"] + 0.2) / (top.z + 0.2) * 8))))
        radius = lambda i, a, pts=pts, rs=rs, top=top: trunk_r(pts[i].z, a, rs * (1 - 0.18 * pts[i].z / top.z))
        fluted(bark, pts, radius, 12, 4 * math.tau * rs, [(0, cut, 0.5, 1.0), (cut, len(pts) - 1, 0.0, 0.5)])
        tops.append((pts[-1], side, rs * 0.82))
    # Surface roots, swelling out of the soil past the well's edge.
    for i in range(int(rng.integers(4, 7))):
        a = i / 5 * math.tau + rng.uniform(-0.4, 0.4)
        out = Vector((math.cos(a), math.sin(a), 0))
        L = rng.uniform(0.45, 0.8) * k
        pts = [out * r0 * 0.6 + UP * 0.18, out * (r0 + L * 0.35) + UP * 0.06, out * (r0 + L * 0.7) + UP * 0.02, out * (r0 + L) - UP * 0.08]
        bark.tube(pts, [0.15 * k, 0.1 * k, 0.065 * k, 0.04 * k], 5, 4 * math.tau * 0.1, 0.0, 0.5)

    # Limbs: stout, nearly as thick as the trunk they split from, sweeping out low under the crown,
    # then boughs off them turning up into it.
    def limb(pts, ra, rb, sides):
        bark.tube(pts, [ra + (rb - ra) * i / (len(pts) - 1) for i in range(len(pts))], sides, 4 * math.tau * max(ra, 0.05), 0.0, 0.5)

    n_l = form["limbs"]
    l_az0 = rng.uniform(0, math.tau)
    for l in range(n_l):
        az = l_az0 + l / n_l * math.tau + rng.uniform(-0.35, 0.35)
        dirh = Vector((math.cos(az), math.sin(az), 0))
        top, side, rs = max(tops, key=lambda tp: dirh.dot(tp[1]) if tp[1] else 0)
        start = top - UP * 0.2 + dirh * rs * 0.3
        tip = Vector((cc.x, cc.y, 0)) + dirh * reach(az) * rng.uniform(0.62, 0.82)
        tip.z = B + rng.uniform(0.3, 1.1) * k
        horiz = (Vector((tip.x, tip.y, 0)) - Vector((start.x, start.y, 0))).length
        tilt = math.radians(rng.uniform(55, 68))
        ctrl = start + (dirh * math.sin(tilt) + UP * math.cos(tilt)) * horiz * 0.7
        ctrl.z = min(ctrl.z, B - 0.35)
        pts = bezier(start, ctrl, tip, 6)
        limb(pts, rs * rng.uniform(0.66, 0.78), 0.07 * k, 7)
        # Two or three boughs off its outer half, up into the lobes round and above its end.
        for j in range(int(rng.integers(2, 4))):
            i = min(len(pts) - 2, int(rng.uniform(0.5, 0.9) * (len(pts) - 1)))
            at = pts[i]
            baz = az + rng.uniform(-1.0, 1.0)
            aim = at + Vector((math.cos(baz), math.sin(baz), rng.uniform(0.5, 1.2))) * 2.5
            goal = min(lobes, key=lambda lb: (lb[0] - aim).length)[0] + Vector(rng.normal(0, 0.3, 3))
            limb(bezier(at, at.lerp(goal, 0.5) + UP * 0.3, goal, 3), 0.09 * k, 0.03 * k, 4)

    spheres = ficus_spheres(np.array([v.co[:] for v in leaves.bm.verts]), np.array([q[:] for q, _, _, _ in clumps]), B)
    return bark, leaves, spheres


def ficus_spheres(corners, clumps, floor):
    """Three equal crown spheres resting on the clipped underside (none hangs below it: they cast the
    shade, and the look has 16 for a whole spot), round the crown's middle: the smallest that holds
    nine in ten of the leaf cards' corners within 1.25 radii, reaching no farther out than the leaves."""
    mid = clumps[:, :2].mean(0)
    out = np.percentile(np.linalg.norm(corners[:, :2], axis=1), 97)
    for r in np.arange(2.4, 6.0, 0.05):
        best = None
        for d in np.arange(0.3, 3.0, 0.1):
            for turn in np.linspace(0, math.tau / 3, 12, endpoint=False):
                centres = [np.array([*(mid + d * np.array([math.cos(turn + j * math.tau / 3), math.sin(turn + j * math.tau / 3)])), floor + r])
                           for j in range(3)]
                if max(np.linalg.norm(c[:2]) for c in centres) + r > out:
                    continue
                held = np.zeros(len(corners), bool)
                for c in centres:
                    held |= np.linalg.norm(corners - c, axis=1) <= 1.25 * r
                if best is None or held.mean() > best[0]:
                    best = (held.mean(), centres)
        if best and best[0] >= 0.9:
            print("FICUS spheres r", round(r, 2), "held", round(best[0], 3), "reach", round(out, 2))
            return [(c, r) for c in best[1]]
    raise RuntimeError("no spheres hold the crown")


# ---------------------------------------------------------------- build
SPECIES = {
    "eucalyptus": (eucalyptus_textures, eucalyptus, 11),
    "ornamental": (ornamental_textures, ornamental, 23),
    "fan_palm": (palm_textures, fan_palm, 37),
    "ficus": (ficus_textures, ficus, 41),
}
crowns_path = os.path.join(OUT, "crowns.json")
crowns = json.load(open(crowns_path)) if os.path.exists(crowns_path) else {}
for name in WANT:
    paint, grow_variant, seed = SPECIES[name]
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    paint(np.random.default_rng(seed))
    objects, table = [], []
    for i, letter in enumerate("abc"):
        bark, leaves, spheres = grow_variant(letter, seed * 10 + i)
        ob = bark.finish(f"{letter}_bark", material("bark"))
        ol = leaves.finish(f"{letter}_leaves", material("leaves"))
        height = max(max((ob.matrix_world @ v.co).z for v in o.data.vertices) for o in (ob, ol))
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in (ob, ol))
        table.append({"height": round(height, 3), "tris": tris,
                      "crowns": [gltf(c) + [round(r, 3)] for c, r in spheres]})
        objects += [ob, ol]
        print("VARIANT", name, letter, "height", round(height, 2), "tris", tris,
              "bark", len(ob.data.polygons), "leaves", len(ol.data.polygons), "spheres", len(spheres))
    crowns[name] = table
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{name}.raw.glb"), export_format='GLB', use_selection=True, export_yup=True,
        export_materials='PLACEHOLDER', export_image_format='NONE', export_texcoords=True, export_normals=True,
        export_vertex_color='NAME', export_vertex_color_name='Col', export_attributes=True,
    )
json.dump(crowns, open(crowns_path, "w"), indent=1)
print("CROWNS", json.dumps(crowns))
