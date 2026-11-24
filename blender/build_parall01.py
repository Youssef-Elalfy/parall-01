"""
PARALL / 01 — original smart-eyewear model generator (Blender 5.x Python), v3.

Reference: the owner's PARALL / 01 product design sheet. Browline-style
smart eyewear: a sculpted brushed-titanium brow bar that carries two
elegantly curved, individually base-curved lenses with rimless lower edges
(chamfered, softly glowing), a turned spatial-camera bezel on the left brow
corner, tapered two-piece temples with a recessed cyan status light, laser
etched wordmark, soft-touch knurled tips, three-knuckle hinges, pillow
silicone nose pads on cup arms and internal modules for exploded views.

Run inside Blender:   exec(open(r"<repo>/blender/build_parall01.py").read())
Headless:             blender --background --python blender/build_parall01.py

Units: modelled in millimetres, baked to scene units (1 unit = 100 mm).
Axes (Blender, Z up): X width, -Y front. glTF export is Y-up (front = +Z).

Outputs: blender/parall-01.blend (copy) and public/models/parall-01.glb (Draco).
"""
import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector

MM = 0.01
EYE_C = 36.5        # lens centre distance from the bridge centre (mm)
LENS_SCALE = 0.96
R_EYE = 125.0       # per-lens horizontal base curve
R_WRAP = 300.0      # overall face-form wrap
R_VERT = 170.0      # gentle vertical curvature
TEMPLE_SPLAY_DEG = 3.0
ROOT_DIR = r"C:\Users\youss\OneDrive\Desktop\PARALL-01"
try:
    ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
except NameError:
    pass
GLB_PATH = os.path.join(ROOT_DIR, "public", "models", "parall-01.glb")
BLEND_PATH = os.path.join(ROOT_DIR, "blender", "parall-01.blend")
FONT_PATH = r"C:\Windows\Fonts\bahnschrift.ttf"
COLL_NAME = "PARALL_01"
STUDIO_NAME = "PARALL_studio"


# =============================================================================
# 2D helpers
# =============================================================================
def signed_area(pts):
    return 0.5 * sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))


def ccw(pts):
    return pts if signed_area(pts) > 0 else list(reversed(pts))


def catmull_closed(ctrl, samples=14):
    n = len(ctrl)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = (Vector(ctrl[(i + k) % n]) for k in (-1, 0, 1, 2))
        for j in range(samples):
            t = j / samples
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((p.x, p.y))
    return out


def resample(pts, step=0.6):
    n = len(pts)
    acc = []
    L = 0.0
    for i in range(n):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % n])
        acc.append((L, a, b))
        L += (b - a).length
    count = max(12, int(L / step))
    out = []
    j = 0
    for k in range(count):
        d = L * k / count
        while j < n - 1 and acc[j + 1][0] <= d:
            j += 1
        s0, a, b = acc[j]
        seg = (b - a).length or 1.0
        p = a.lerp(b, (d - s0) / seg)
        out.append((p.x, p.y))
    return out


def offset_outline(pts, d):
    """Offset a CCW closed outline along its outward normal by d (negative = inward)."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e1, e2 = (p1 - p0), (p2 - p1)
        n1 = Vector((e1.y, -e1.x)).normalized()
        n2 = Vector((e2.y, -e2.x)).normalized()
        nn = (n1 + n2).normalized()
        miter = d / max(nn.dot(n1), 0.35)  # true miter length so corners stay convex
        out.append((p1.x + nn.x * miter, p1.y + nn.y * miter))
    return out


def round_corners(pts, r, thresh_deg=22.0):
    """Fillet sharp corners of a dense closed outline with radius r (tangent arcs)."""
    n = len(pts)
    P = [Vector(p) for p in pts]
    corners = []
    for i in range(n):
        d1 = (P[i] - P[i - 1])
        d2 = (P[(i + 1) % n] - P[i])
        if d1.length < 1e-9 or d2.length < 1e-9:
            continue
        turn = math.acos(max(-1.0, min(1.0, d1.normalized().dot(d2.normalized()))))
        if turn > math.radians(thresh_deg):
            corners.append((i, turn))
    if not corners:
        return pts
    drop = set()
    arcs = {}
    for i, turn in corners:
        theta = math.pi - turn
        t = r / math.tan(theta / 2)

        def walk(step):
            dist, k, prev = 0.0, i, P[i]
            while True:
                k2 = (k + step) % n
                seg = (P[k2] - prev).length
                if dist + seg >= t or abs(k2 - i) > n // 3:
                    f = (t - dist) / seg if seg > 1e-9 else 0.0
                    return prev.lerp(P[k2], min(1.0, f)), k, k2
                dist += seg
                prev = P[k2]
                k = k2
        a, _, ka = walk(-1)
        b, _, kb = walk(1)
        da = (a - P[i]).normalized()
        db = (b - P[i]).normalized()
        bis = (da + db).normalized()
        rr = (a - P[i]).length * math.tan(theta / 2)
        c = P[i] + bis * (rr / max(1e-6, math.sin(theta / 2)))
        a0 = math.atan2((a - c).y, (a - c).x)
        a1 = math.atan2((b - c).y, (b - c).x)
        dang = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        seg = max(4, int(abs(dang) * rr / 0.35))
        arc = [(c.x + rr * math.cos(a0 + dang * k / seg), c.y + rr * math.sin(a0 + dang * k / seg)) for k in range(seg + 1)]
        # drop the original vertices between a and b (walking backward from i to ka, forward to kb)
        k = i
        while k != ka:
            drop.add(k)
            k = (k - 1) % n
        k = i
        while k != kb:
            drop.add(k)
            k = (k + 1) % n
        arcs[i] = arc
    out = []
    for k in range(n):
        if k in arcs:
            out.extend(arcs[k])
        elif k not in drop:
            out.append((P[k].x, P[k].y))
    return out


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# =============================================================================
# Front-surface deformation (per-lens base curve + wrap + vertical curve)
# =============================================================================
def front_dy(x, z):
    ax = math.sqrt(x * x + 36.0)
    return (ax - EYE_C) ** 2 / (2 * R_EYE) + x * x / (2 * R_WRAP) + z * z / (2 * R_VERT)


def front_grad(x, z):
    ax = math.sqrt(x * x + 36.0)
    dx = (ax - EYE_C) / R_EYE * (x / ax) + x / R_WRAP
    dz = z / R_VERT
    return dx, dz


def deform_front(me):
    for v in me.vertices:
        v.co.y += front_dy(v.co.x, v.co.z)


def surface_frame(x, y, z):
    """Matrix placing a part on the deformed front surface; local -Y follows the surface normal."""
    gx, gz = front_grad(x, z)
    rz = Matrix.Rotation(math.atan(gx), 4, "Z")
    rx = Matrix.Rotation(-math.atan(gz), 4, "X")
    return Matrix.Translation((x, y + front_dy(x, z), z)) @ rz @ rx


# =============================================================================
# Mesh helpers
# =============================================================================
def clean_mesh(me, dist=1e-4):
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(me)
    bm.free()


def eval_curve(cu, name):
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    return me


def refine_caps(me, max_len):
    """Curve fills triangulate flat caps into long slivers (up to ~140 mm). Those
    chords cannot follow later bending (face-form wrap, temple taper) and show up
    as faceted reflections. Split cap-only edges longer than max_len and
    re-beautify until every cap triangle is small and well shaped."""
    bm = bmesh.new()
    bm.from_mesh(me)

    def is_cap(f):
        return abs(f.normal.z) > 0.9995

    cap_layer = bm.faces.layers.int.get("cap") or bm.faces.layers.int.new("cap")
    for _ in range(14):
        bm.normal_update()
        long_edges = [e for e in bm.edges
                      if e.calc_length() > max_len and e.link_faces and all(is_cap(f) for f in e.link_faces)]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=False)
        bm.normal_update()
        caps = [f for f in bm.faces if is_cap(f)]
        bmesh.ops.triangulate(bm, faces=[f for f in caps if len(f.verts) > 3])
        bm.normal_update()
        caps = [f for f in bm.faces if is_cap(f)]
        inner = [e for e in bm.edges if e.link_faces and all(is_cap(f) for f in e.link_faces) and len(e.link_faces) == 2]
        bmesh.ops.beautify_fill(bm, faces=caps, edges=inner)
    bm.normal_update()
    for f in bm.faces:
        f[cap_layer] = 1 if is_cap(f) else 0
    bm.to_mesh(me)
    bm.free()


def smooth_cap_normals(me, iterations=8):
    """Irregular cap triangulation gives slightly noisy vertex normals; anisotropic
    brushed metal stretches highlights and makes that noise visible. Laplacian
    smooth the normals of interior cap vertices and store them as custom split
    normals (bevels and creases keep their automatic normals)."""
    attr = me.attributes.get("cap")
    if attr is None or attr.domain != "FACE":
        return
    cap = [d.value for d in attr.data]
    me.update()
    vert_faces = [[] for _ in me.vertices]
    for p in me.polygons:
        for vi in p.vertices:
            vert_faces[vi].append(p.index)
    cap_vert = [bool(fs) and all(cap[f] for f in fs) for fs in vert_faces]
    normals = [Vector((0.0, 0.0, 0.0)) for _ in me.vertices]
    for p in me.polygons:
        if cap[p.index]:
            for vi in p.vertices:
                normals[vi] += p.normal * p.area
    nbrs = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        if cap_vert[a] and cap_vert[b]:
            nbrs[a].append(b)
            nbrs[b].append(a)
    normals = [n.normalized() if n.length > 0 else n for n in normals]
    for _ in range(iterations):
        nxt = list(normals)
        for vi, ns in enumerate(nbrs):
            if cap_vert[vi] and ns:
                acc = normals[vi] * 2.0
                for nb in ns:
                    acc += normals[nb]
                nxt[vi] = acc.normalized()
        normals = nxt
    loop_normals = []
    for loop in me.loops:
        vi = loop.vertex_index
        loop_normals.append(tuple(normals[vi]) if cap_vert[vi] else (0.0, 0.0, 0.0))
    me.normals_split_custom_set(loop_normals)


def boolean_union(name, meshes):
    """Exact boolean union: removes interpenetrating inner shells and the
    jagged intersection seams they cause (brow + endpieces)."""
    scene_coll = bpy.context.scene.collection
    objs = []
    for i, me in enumerate(meshes):
        ob = bpy.data.objects.new(f"{name}_bool_{i}", me)
        scene_coll.objects.link(ob)
        objs.append(ob)
    base = objs[0]
    for other in objs[1:]:
        mod = base.modifiers.new("union", "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = other
        other.hide_viewport = True
        other.hide_render = True
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    out.name = name
    for ob in objs:
        bpy.data.objects.remove(ob)
    for me in meshes:
        if me.users == 0:
            bpy.data.meshes.remove(me)
    bm = bmesh.new()
    bm.from_mesh(out)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(out)
    bm.free()
    return out


def shape_mesh(name, outline, half_depth, bevel, bevel_res=4, max_edge=2.0, fillet=True):
    """Filled 2D outline (final size) extruded to +/-half_depth with rounded edges."""
    cu = bpy.data.curves.new(name + "_cu", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    base = round_corners(ccw(outline), bevel * 1.7) if fillet else outline  # spline outlines are already smooth
    pts = offset_outline(ccw(base), -bevel)
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, (x, y) in enumerate(pts):
        sp.points[i].co = (x, y, 0.0, 1.0)
    sp.use_cyclic_u = True
    cu.extrude = max(0.0, half_depth - bevel)
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    me = eval_curve(cu, name)
    clean_mesh(me)
    refine_caps(me, max_edge)
    return me


def tube_mesh(name, path, radius, res=4):
    cu = bpy.data.curves.new(name + "_cu", "CURVE")
    cu.dimensions = "3D"
    cu.fill_mode = "FULL"
    sp = cu.splines.new("NURBS")
    sp.points.add(len(path) - 1)
    for i, co in enumerate(path):
        sp.points[i].co = (co[0], co[1], co[2], 1.0)
    sp.use_endpoint_u = True
    sp.order_u = 3
    sp.resolution_u = 12
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    me = eval_curve(cu, name)
    clean_mesh(me)
    return me


def lathe(name, profile, segs=64):
    """Spin an (r, h) profile around local Z into a closed solid."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, h)) for (r, h) in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if profile[0][0] > 1e-6 and profile[-1][0] > 1e-6:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=2 * math.pi, steps=segs, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def rounded_box(name, size, bevel, segments=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments,
                    profile=0.5, affect="EDGES", clamp_overlap=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def pillow(name, size, power=0.62, u=48, v=24):
    """Rounded-rectangle 'pillow' solid (super-ellipsoid) for nose pads."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    for vert in bm.verts:
        c = vert.co
        vert.co = Vector((
            math.copysign(abs(c.x) ** 0.9, c.x) * size[0] / 2,
            math.copysign(abs(c.y) ** power, c.y) * size[1] / 2,
            math.copysign(abs(c.z) ** power, c.z) * size[2] / 2,
        ))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def text_mesh(name, body, size, depth, tracking=1.25):
    cu = bpy.data.curves.new(name + "_txt", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.space_character = tracking
    cu.resolution_u = 4
    if os.path.exists(FONT_PATH):
        try:
            cu.font = bpy.data.fonts.load(FONT_PATH, check_existing=True)
        except Exception:
            pass
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.name = name
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-3)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return me


def set_mat_index(me, idx):
    for p in me.polygons:
        p.material_index = idx
    return me


def join(name, meshes):
    bm = bmesh.new()
    for me in meshes:
        bm.from_mesh(me)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for me in meshes:
        bpy.data.meshes.remove(me)
    return out


def box_uv(me, scale=1 / 40, z_along="x"):
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            c = loop.vert.co
            if ax == 0:
                u, v = c.y, c.z
            elif ax == 1:
                u, v = c.x, c.z
            else:
                u, v = (c.x, c.y) if z_along == "x" else (c.y, c.x)
            loop[uv].uv = (u * scale, v * scale)
    bm.to_mesh(me)
    bm.free()


def finish(me, angle=34):
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass


def taper_x(me, fn):
    """Scale X (thickness) by fn(y) about x = 0."""
    for v in me.vertices:
        v.co.x *= fn(v.co.y)


FRONT = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # (u,v,w) -> (u,-w,v)
SIDE = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))    # (s,v,w) -> (w,s,v)
TO_FRONT = Matrix.Rotation(math.radians(90), 4, "X")                       # local +Z -> world -Y


# =============================================================================
# Materials (Cycles / EEVEE). The web scene re-creates the key ones by name.
# =============================================================================
def new_mat(name):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL"):
            nt.nodes.remove(n)
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    return mat, nt, bsdf


def setin(node, key, val):
    if key in node.inputs:
        try:
            node.inputs[key].default_value = val
            return True
        except Exception:
            return False
    return False


def principled(name, color, metallic=0.0, rough=0.5, transmission=0.0, ior=1.5, emission=None,
               strength=1.0, coat=0.0, coat_rough=0.05, aniso=0.0, thin_film=0.0, thin_ior=1.38,
               sheen=0.0):
    mat, nt, b = new_mat(name)
    setin(b, "Base Color", (*color, 1.0))
    setin(b, "Metallic", metallic)
    setin(b, "Roughness", rough)
    setin(b, "Transmission Weight", transmission)
    setin(b, "IOR", ior)
    setin(b, "Coat Weight", coat)
    setin(b, "Coat Roughness", coat_rough)
    setin(b, "Anisotropic", aniso)
    setin(b, "Sheen Weight", sheen)
    setin(b, "Thin Film Thickness", thin_film)
    setin(b, "Thin Film IOR", thin_ior)
    if emission is not None:
        setin(b, "Emission Color", (*emission, 1.0))
        setin(b, "Emission Strength", strength)
    else:
        setin(b, "Emission Strength", 0.0)
    if transmission > 0:
        for attr, val in (("surface_render_method", "DITHERED"), ("use_raytrace_refraction", True),
                          ("thickness_mode", "SLAB")):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass
    return mat, nt, b


def link(nt, a, b):
    nt.links.new(a, b)


def brushed(name, color, r_lo, r_hi, aniso=0.65, coat=0.0):
    """Brushed metal: UV-stretched noise drives roughness + micro bump; anisotropy along U."""
    mat, nt, b = principled(name, color, metallic=1.0, rough=(r_lo + r_hi) / 2, aniso=aniso, coat=coat, coat_rough=0.12)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    setin(mp, "Scale", (1.2, 320.0, 1.0))
    nz = nt.nodes.new("ShaderNodeTexNoise")
    setin(nz, "Scale", 6.0)
    setin(nz, "Detail", 3.0)
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs[3].default_value = r_lo
    mr.inputs[4].default_value = r_hi
    link(nt, tc.outputs["UV"], mp.inputs["Vector"])
    link(nt, mp.outputs["Vector"], nz.inputs["Vector"])
    link(nt, nz.outputs["Fac"], mr.inputs[0])
    link(nt, mr.outputs[0], b.inputs["Roughness"])
    try:
        tg = nt.nodes.new("ShaderNodeTangent")
        tg.direction_type = "UV_MAP"
        link(nt, tg.outputs["Tangent"], b.inputs["Tangent"])
    except Exception:
        pass
    bump = nt.nodes.new("ShaderNodeBump")
    setin(bump, "Strength", 0.12)
    setin(bump, "Distance", 0.00025)
    link(nt, nz.outputs["Fac"], bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], b.inputs["Normal"])
    return mat


def knurled(name, color):
    mat, nt, b = principled(name, color, rough=0.62, sheen=0.25, coat=0.08, coat_rough=0.4)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    waves = []
    for ang in (45.0, -45.0):
        mp = nt.nodes.new("ShaderNodeMapping")
        setin(mp, "Rotation", (0.0, 0.0, math.radians(ang)))
        wv = nt.nodes.new("ShaderNodeTexWave")
        setin(wv, "Scale", 110.0)
        setin(wv, "Distortion", 0.0)
        link(nt, tc.outputs["UV"], mp.inputs["Vector"])
        link(nt, mp.outputs["Vector"], wv.inputs["Vector"])
        waves.append(wv)
    mn = nt.nodes.new("ShaderNodeMath")
    mn.operation = "MINIMUM"
    link(nt, waves[0].outputs["Fac"], mn.inputs[0])
    link(nt, waves[1].outputs["Fac"], mn.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump")
    setin(bump, "Strength", 0.35)
    setin(bump, "Distance", 0.0006)
    link(nt, mn.outputs[0], bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], b.inputs["Normal"])
    return mat


def make_materials():
    M = {}
    M["frame"] = brushed("PARALL_Frame", (0.3, 0.315, 0.335), 0.22, 0.36, aniso=0.85, coat=0.0)
    M["arm"] = brushed("PARALL_FrameArm", (0.2, 0.212, 0.23), 0.3, 0.44, aniso=0.7)
    M["tip"] = knurled("PARALL_TempleTip", (0.028, 0.03, 0.034))
    M["lens"] = principled("PARALL_Lens", (0.9, 0.955, 1.0), rough=0.0, transmission=1.0, ior=1.5,
                           thin_film=125.0, thin_ior=1.38)[0]
    M["lensedge"] = principled("PARALL_LensEdge", (0.75, 0.95, 1.0), rough=0.04, transmission=1.0, ior=1.52,
                               emission=(0.56, 0.9, 1.0), strength=1.1)[0]
    M["polish"] = principled("PARALL_Polished", (0.78, 0.8, 0.83), metallic=1.0, rough=0.16)[0]
    M["glass"] = principled("PARALL_SensorGlass", (0.02, 0.02, 0.03), rough=0.0, transmission=0.85, ior=1.6,
                            thin_film=520.0, thin_ior=1.45, coat=1.0, coat_rough=0.0)[0]
    M["iris"] = principled("PARALL_CameraIris", (0.06, 0.04, 0.16), metallic=0.8, rough=0.18,
                           thin_film=380.0, thin_ior=1.6)[0]
    M["led"] = principled("PARALL_LED", (0.56, 0.9, 1.0), emission=(0.45, 0.88, 1.0), strength=4.0)[0]
    M["pad"] = principled("PARALL_NosePad", (0.97, 0.99, 1.0), rough=0.16, transmission=1.0, ior=1.41)[0]
    M["grille"] = principled("PARALL_Grille", (0.012, 0.013, 0.016), rough=0.5)[0]
    M["engrave"] = principled("PARALL_Engraving", (0.1, 0.105, 0.115), metallic=1.0, rough=0.55)[0]
    M["pcb"] = principled("PARALL_PCB", (0.03, 0.07, 0.06), rough=0.45, coat=0.4)[0]
    M["chip"] = principled("PARALL_Chip", (0.015, 0.015, 0.018), rough=0.3)[0]
    M["battery"] = brushed("PARALL_Battery", (0.16, 0.17, 0.19), 0.35, 0.5, aniso=0.3)
    return M


# =============================================================================
# Geometry definitions (mm)
# =============================================================================
# Left lens, local coordinates (+x = nasal). CCW control polygon for a Catmull-Rom spline.
LENS_CTRL = [
    (-24.5, -15.5), (-14.0, -19.8), (0.0, -20.2), (11.0, -17.6), (19.0, -11.6),
    (24.4, -1.6), (26.8, 8.0), (26.0, 14.0),
    (22.4, 18.2), (8.0, 18.9), (-8.0, 18.9), (-21.0, 18.4), (-26.7, 16.0),
    (-28.3, 9.0), (-28.5, -1.0), (-27.5, -9.6),
]

# Brow bar (left half, global coordinates), traversed from the top centre outward.
# v4 (slimmer front housing): ~15-20 % lower brow, 20 % shallower, lighter outer
# corner, deeper sculpted bridge arch.
BROW_LEFT = [
    (-9.0, 23.3), (-22.0, 24.4), (-38.0, 25.2), (-54.0, 25.4), (-63.5, 24.9), (-68.3, 23.6),
    (-70.0, 21.2), (-70.1, 16.8), (-69.5, 12.6), (-68.4, 9.6), (-66.3, 8.2),
    (-64.0, 8.4), (-62.5, 10.3), (-61.8, 13.2), (-60.8, 15.4), (-55.0, 16.2),
    (-40.0, 16.5), (-25.0, 16.3), (-15.5, 15.9), (-12.8, 15.9), (-9.8, 16.4),
    (-6.0, 17.9), (-2.6, 18.9),
]

EP_X = 67.4          # endpiece centre |x|
EP_Z = 18.0          # hinge height
EP_BACK = 12.5       # endpiece depth behind the brow


def lens_outline(side):
    pts = resample(catmull_closed(LENS_CTRL, 16), 0.72)
    pts = [(x * LENS_SCALE, y * LENS_SCALE) for (x, y) in pts]
    if side > 0:
        pts = [(-x, y) for (x, y) in reversed(pts)]
    return ccw(pts)


def brow_outline():
    ctrl = [(0.0, 22.6)] + BROW_LEFT + [(0.0, 19.2)] + [(-x, y) for (x, y) in reversed(BROW_LEFT)]
    return ccw(resample(catmull_closed(ctrl, 14), 0.62))


# =============================================================================
# Build
# =============================================================================
def wipe_collection(name):
    old = bpy.data.collections.get(name)
    if old:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def build():
    coll = wipe_collection(COLL_NAME)
    M = make_materials()
    root = bpy.data.objects.new("PARALL_01", None)
    root.empty_display_size = 0.5
    coll.objects.link(root)
    objs = {}

    def add(name, me, mats, parent=None, loc=(0, 0, 0), uv=None, angle=34):
        if uv is not None:
            box_uv(me, z_along=uv)
        finish(me, angle)
        smooth_cap_normals(me)
        idx = [p.material_index for p in me.polygons]
        me.materials.clear()
        for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
            me.materials.append(m)
        for p, i in zip(me.polygons, idx):
            p.material_index = i
        ob = bpy.data.objects.new(name, me)
        coll.objects.link(ob)
        ob.parent = parent if parent is not None else root
        ob.location = loc
        objs[name] = ob
        return ob

    # ---------------- brow bar ---------------------------------------------
    brow = shape_mesh("brow", brow_outline(), half_depth=2.4, bevel=1.0, bevel_res=6, max_edge=1.8, fillet=False)
    brow.transform(FRONT)
    deform_front(brow)

    # ---------------- endpieces (rigid, tucked behind the curved brow) ------
    ep_profile = ccw(resample(catmull_closed([
        (-1.2, 23.2), (4.0, 23.5), (8.6, 23.3), (EP_BACK - 1.7, 22.9), (EP_BACK - 0.1, 21.2), (EP_BACK - 0.2, 15.0),
        (EP_BACK - 1.5, 12.9), (8.5, 12.5), (3.0, 12.9), (-0.6, 14.2), (-1.5, 18.6)], 12), 0.5))
    frame_parts = [brow]
    hinge_pts = {}
    for side in (-1, 1):
        ep = shape_mesh("endpiece", ep_profile, half_depth=2.4, bevel=1.1, bevel_res=6, max_edge=1.5, fillet=False)
        ep.transform(SIDE)
        base_y = front_dy(side * EP_X, EP_Z)
        ep.transform(Matrix.Translation((side * EP_X, base_y - 0.6, 0.0)))
        frame_parts.append(ep)
        hinge_pts[side] = Vector((side * EP_X, base_y - 0.6 + EP_BACK - 0.35, EP_Z))  # temple seats into the rounded back
    add("Frame", boolean_union("Frame", frame_parts), M["frame"], uv="x", angle=40)

    # ---------------- spatial camera (lathe-turned) -------------------------
    cam_x, cam_z = -66.3, 18.9
    cam_frame = surface_frame(cam_x, -2.45, cam_z) @ TO_FRONT
    bezel = lathe("bezel", [(2.15, -1.4), (2.15, 0.8), (2.3, 1.12), (2.95, 1.16), (3.25, 0.95), (3.38, 0.46), (3.4, -1.4)], 128)
    glass = lathe("glass", [(0.0, 0.88), (1.0, 0.84), (1.72, 0.7), (2.16, 0.47), (2.16, 0.05), (0.0, 0.05)], 128)
    iris = lathe("iris", [(0.0, 0.52), (0.52, 0.52), (0.6, 0.42), (1.3, 0.38), (2.0, 0.25), (2.0, 0.0), (0.0, 0.0)], 96)
    for me in (bezel, glass, iris):
        me.transform(cam_frame)
    add("Camera_Ring", bezel, M["polish"], angle=50)
    add("Camera_Glass", glass, M["glass"], angle=60)
    add("Camera_Iris", iris, M["iris"], angle=50)
    mod = rounded_box("Module_Camera", (4.0, 5.0, 5.4), 0.7, 2)
    mod.transform(surface_frame(-EP_X, 3.2, cam_z))
    add("Module_Camera", mod, M["pcb"])
    pin = lathe("pin", [(0.0, 0.25), (0.62, 0.22), (0.72, 0.0), (0.72, -0.8), (0.0, -0.8)], 32)
    pin.transform(surface_frame(66.3, -2.45, 20.4) @ TO_FRONT)
    add("Sensor_Pinhole", pin, M["glass"], angle=50)

    # ---------------- lenses: base-curved meniscus with chamfered glowing edge
    for side in (-1, 1):
        label = "Left" if side < 0 else "Right"
        outline = lens_outline(side)
        cx = side * EYE_C
        bm = bmesh.new()
        RINGS = 16
        n = len(outline)

        def ring_at(u, y):
            return [bm.verts.new((cx + x * u, y, z * u)) for (x, z) in outline]
        F, B = [], []
        for r in range(1, RINGS + 1):
            u = (r / RINGS) * 0.985
            q = 1 - (u / 0.985) ** 2
            F.append(ring_at(u, -1.0 - 0.75 * q))
            B.append(ring_at(u, 1.0 - 0.55 * q))
        EF = ring_at(1.0, -0.55)
        EB = ring_at(1.0, 0.62)
        cf = bm.verts.new((cx, -1.75, 0.0))
        cb = bm.verts.new((cx, 0.45, 0.0))
        edge_faces = []
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((cf, F[0][i], F[0][j]))
            bm.faces.new((cb, B[0][j], B[0][i]))
            for r in range(RINGS - 1):
                bm.faces.new((F[r][i], F[r + 1][i], F[r + 1][j], F[r][j]))
                bm.faces.new((B[r][j], B[r + 1][j], B[r + 1][i], B[r][i]))
            edge_faces.append(bm.faces.new((F[-1][i], EF[i], EF[j], F[-1][j])))
            edge_faces.append(bm.faces.new((EF[i], EB[i], EB[j], EF[j])))
            edge_faces.append(bm.faces.new((EB[i], B[-1][i], B[-1][j], EB[j])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in edge_faces:
            f.material_index = 1
        lm = bpy.data.meshes.new("Lens_" + label)
        bm.to_mesh(lm)
        bm.free()
        deform_front(lm)
        add("Lens_" + label, lm, [M["lens"], M["lensedge"]], angle=42)

    # ---------------- nose pads: pillow pads in metal cups on wire arms ------
    arms, cups, pads = [], [], []
    for side in (-1, 1):
        s = side
        path = [(s * 6.6, 1.2, 18.4), (s * 8.0, 4.6, 15.2), (s * 10.1, 8.0, 9.4), (s * 12.0, 9.8, 4.4), (s * 12.8, 10.4, 2.0)]
        arms.append(tube_mesh("arm", path, 0.5, 4))
        pad_m = (Matrix.Translation((s * 14.0, 11.8, -1.6))
                 @ Matrix.Rotation(math.radians(-s * 40), 4, "Z")
                 @ Matrix.Rotation(math.radians(s * 12), 4, "Y"))
        cup = rounded_box("cup", (1.2, 3.4, 5.6), 0.45, 3)
        cup.transform(pad_m @ Matrix.Translation((-s * 1.7, 0, 0.6)))
        cups.append(cup)
        pad = pillow("pad", (2.7, 6.6, 12.6))
        pad.transform(pad_m)
        pads.append(pad)
    for me in arms + cups + pads:
        deform_front(me)
    add("NosePad_Arms", join("NosePad_Arms", arms + cups), M["polish"], angle=50)
    add("NosePads", join("NosePads", pads), M["pad"], angle=60)

    # ---------------- temples -----------------------------------------------
    STRAIGHT, R_EAR, ARC_DEG = 116.0, 52.0, 38.0
    H0, H1 = 5.2, 2.3

    def half_h(s):
        return H0 - (H0 - H1) * smoothstep(4, 96, s)

    def cz(s):
        return (H0 - half_h(s)) * 0.72 - 0.014 * s

    def centerline(step=1.0):
        pts = []
        s = 0.0
        while s <= STRAIGHT + 1e-6:
            t = Vector((1.0, cz(s + 0.5) - cz(s - 0.5))).normalized()
            pts.append((s, Vector((s, cz(s))), Vector((-t.y, t.x))))
            s += step
        pos = Vector((STRAIGHT, cz(STRAIGHT)))
        ang = math.atan2(cz(STRAIGHT + 0.5) - cz(STRAIGHT - 0.5), 1.0)
        L = R_EAR * math.radians(ARC_DEG)
        t = 0.0
        while t + step <= L + 1e-6:
            ang -= step / R_EAR
            pos = pos + Vector((math.cos(ang), math.sin(ang))) * step
            t += step
            tan = Vector((math.cos(ang), math.sin(ang)))
            pts.append((STRAIGHT + t, pos.copy(), Vector((-tan.y, tan.x))))
        return pts

    CL = centerline()
    TOTAL = CL[-1][0]

    def strip(top_rng, bot_rng, pad=0.0, cap=False, cap_start=False):
        tops = [c[1] + c[2] * (half_h(c[0]) + pad) for c in CL if top_rng[0] <= c[0] <= top_rng[1]]
        bots = [c[1] - c[2] * (half_h(c[0]) + pad) for c in CL if bot_rng[0] <= c[0] <= bot_rng[1]]
        capp = []
        if cap:
            c = CL[-1]
            r = half_h(c[0]) + pad
            tan = Vector((c[2].y, -c[2].x))
            for k in range(1, 16):
                th = math.pi * k / 16
                capp.append(c[1] + (-c[2] * math.cos(th) + tan * math.sin(th)) * r)
        caps = []
        if cap_start:
            c0 = min((q for q in CL if q[0] >= top_rng[0]), key=lambda q: q[0])
            r0 = half_h(c0[0]) + pad
            tan0 = Vector((c0[2].y, -c0[2].x))
            for k in range(1, 16):
                th = math.pi * k / 16
                caps.append(c0[1] + (c0[2] * math.cos(th) - tan0 * math.sin(th)) * r0)
        pts = ([(p.x, p.y) for p in bots] + [(p.x, p.y) for p in capp] + [(p.x, p.y) for p in reversed(tops)]
               + [(p.x, p.y) for p in caps])
        return ccw(pts)

    def at(s, v_off=0.0):
        c = min(CL, key=lambda q: abs(q[0] - s))
        return c[1] + c[2] * v_off

    def thick(y):
        # temple half-thickness: 2.8 mm at the hinge -> 1.75 mm at the ear
        return 2.3 - 0.85 * smoothstep(0, 110, y)

    for side in (-1, 1):
        label = "Left" if side < 0 else "Right"
        H = hinge_pts[side]
        splay = Matrix.Rotation(math.radians(-side * TEMPLE_SPLAY_DEG), 4, "Z")

        def make(nm, outline, half0, bevel, res=4):
            me = shape_mesh(nm, outline, half_depth=half0, bevel=bevel, bevel_res=res)
            me.transform(SIDE)
            taper_x(me, lambda y: thick(max(0.0, y)) / thick(0.0))
            me.transform(splay)
            return me

        front = make("TempleFront", strip((0.4, 56.0), (0.4, 50.0)), 2.3, 1.05, 5)
        temple = add("Temple_" + label, front, M["frame"], loc=H, uv="y", angle=40)
        arm = make("TempleArm", strip((56.5, 121.6), (50.5, 121.6)), 2.3, 0.95, 5)
        add("TempleArm_" + label, arm, M["arm"], parent=temple, uv="y", angle=40)
        tip = make("TempleTip", strip((123.5, TOTAL), (123.5, TOTAL), pad=0.4, cap=True, cap_start=True), 2.7, 1.2, 5)
        add("TempleTip_" + label, tip, M["tip"], parent=temple, uv="y", angle=40)

        # three-knuckle hinge + slotted screw head
        kn = []
        for zc in (-3.2, 0.0, 3.2):
            k = lathe("kn", [(0.0, -1.5), (1.15, -1.5), (1.45, -1.28), (1.5, -1.0), (1.5, 1.0), (1.45, 1.28), (1.15, 1.5), (0.0, 1.5)], 64)
            k.transform(Matrix.Translation((-side * 0.35, -0.15, zc)))
            kn.append(k)
        screw = lathe("screw", [(0.0, 0.0), (1.0, 0.0), (1.0, 0.25), (0.82, 0.45), (0.0, 0.5)], 64)
        screw.transform(Matrix.Translation((-side * 0.35, -0.15, 4.72)))
        slot = set_mat_index(rounded_box("slot", (1.6, 0.26, 0.24), 0.07, 1), 1)
        slot.transform(Matrix.Rotation(math.radians(30), 4, "Z"))
        slot.transform(Matrix.Translation((-side * 0.35, -0.15, 5.15)))
        hinge = join("Hinge_" + label, kn + [screw, slot])
        hinge.transform(splay)
        add("Hinge_" + label, hinge, [M["polish"], M["grille"]], parent=temple, angle=50)

        # recessed status light: dark bezel slot + emissive light pipe
        lc = at(20.0, 1.7)
        bez = rounded_box("bezel", (0.5, 16.0, 1.9), 0.24, 3)
        bez.transform(splay @ Matrix.Translation((side * (thick(lc.x) + 0.12), lc.x, lc.y)))
        add("LED_Bezel_" + label, bez, M["grille"], parent=temple)
        led = rounded_box("led", (0.4, 14.6, 0.85), 0.2, 3)
        led.transform(splay @ Matrix.Translation((side * (thick(lc.x) + 0.3), lc.x, lc.y)))
        add("Status_LED_" + label, led, M["led"], parent=temple)

        # micro-perforated mic grille near the hinge
        holes = []
        gc = at(8.0, -2.6)
        for k in range(5):
            hcyl = lathe("hole", [(0.36, 0.0), (0.36, 0.3), (0.0001, 0.3), (0.0001, 0.0)], 16)
            hcyl.transform(Matrix.Rotation(math.radians(90 * side), 4, "Y"))
            hcyl.transform(Matrix.Translation((side * (thick(gc.x) - 0.12), gc.x - 3.2 + k * 1.6, gc.y)))
            holes.append(hcyl)
        grille = join("Mic_Grille_" + label, holes)
        grille.transform(splay)
        add("Mic_Grille_" + label, grille, M["grille"], parent=temple)

        # laser-etched wordmark on the arm
        ec = at(84.0, 0.2)
        eng = text_mesh("engraving", "PARALL", 2.7, 0.04, 1.34)
        eng.transform(Matrix(((0, 0, side, 0), (side, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
        eng.transform(splay @ Matrix.Translation((side * (thick(84.0) + 0.02), ec.x, ec.y)))
        add("Engraving_" + label, eng, M["engrave"], parent=temple)

        # cyan light ring seated in the arm -> tip seam, aligned to the temple curve
        cs = min(CL, key=lambda q: abs(q[0] - 121.4))
        ang = math.atan2(-cs[2].x, cs[2].y)
        ring_w = 2 * (thick(cs[1].x) * 1.08 + 0.05)
        acc = rounded_box("accent", (ring_w, 0.55, 2 * (half_h(cs[0]) + 0.22)), 0.2, 3)
        acc.transform(splay @ Matrix.Translation((0.0, cs[1].x, cs[1].y)) @ Matrix.Rotation(ang, 4, "X"))
        add("Accent_" + label, acc, M["led"], parent=temple)

        # inner speaker port near the ear
        spc = at(102.0, -0.6)
        sp = rounded_box("speaker", (0.5, 12.0, 1.5), 0.22, 3)
        sp.transform(splay @ Matrix.Translation((-side * (thick(102.0) + 0.02), spc.x, spc.y)))
        add("Speaker_" + label, sp, M["grille"], parent=temple)

        # internal modules (hidden until exploded)
        bc = at(26.0, 0.3)
        board = set_mat_index(rounded_box("pcb", (0.8, 34.0, 7.6), 0.3, 1), 0)
        board.transform(Matrix.Translation((0, bc.x, bc.y)))
        chips = []
        for (dy, dz, w, h) in ((-9.0, 1.2, 7.5, 4.6), (3.5, -1.6, 5.2, 3.6), (11.5, 2.0, 4.2, 2.4)):
            ch = set_mat_index(rounded_box("chip", (1.0, w * 0.9, h * 0.85), 0.2, 1), 1)
            ch.transform(Matrix.Translation((side * 0.5, bc.x + dy, bc.y + dz)))
            chips.append(ch)
        comp = join("Module_Compute_" + label, [board] + chips)
        comp.transform(splay)
        add("Module_Compute_" + label, comp, [M["pcb"], M["chip"]], parent=temple)
        btc = at(86.0, 0.0)
        bat = rounded_box("battery", (1.5, 40.0, 3.2), 0.6, 3)
        bat.transform(splay @ Matrix.Translation((0, btc.x, btc.y)))
        add("Module_Battery_" + label, bat, M["battery"], parent=temple, uv="y")

    # ---------------- bake mm -> scene units ----------------------------------
    S = Matrix.Scale(MM, 4)
    for o in coll.objects:
        if o.type == "MESH":
            o.data.transform(S)
        o.location = o.location * MM
    return coll, objs


# =============================================================================
# Product studio (Cycles)
# =============================================================================
def studio():
    old = bpy.data.collections.get(STUDIO_NAME)
    if old:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
    for nm in ("PARALL_studio",):
        pass
    coll = bpy.data.collections.new(STUDIO_NAME)
    bpy.context.scene.collection.children.link(coll)

    def area(nm, loc, energy, sx, sy, color=(1, 1, 1), target=(0, 0.5, 0.0), spread=50.0):
        ld = bpy.data.lights.new(nm, "AREA")
        ld.energy = energy
        ld.spread = math.radians(spread)
        ld.shape = "RECTANGLE"
        ld.size = sx
        ld.size_y = sy
        ld.color = color
        ob = bpy.data.objects.new(nm, ld)
        ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(ob)
        return ob

    area("Key_Softbox", (-0.3, 0.3, 2.5), 90, 1.4, 0.5, target=(0, 0.3, 0), spread=40)
    area("Strip_Left", (-2.4, -0.9, 0.9), 200, 0.14, 2.2, target=(0, 0.3, 0.1), spread=28)
    area("Strip_Right", (2.5, 0.4, 1.0), 170, 0.14, 2.2, target=(0, 0.3, 0.1), spread=28)
    area("Rim_Cyan", (-1.2, 2.6, 0.45), 320, 2.4, 0.2, color=(0.45, 0.85, 1.0), target=(0, 0.2, 0), spread=40)
    area("Front_Card", (0.0, -3.4, 0.25), 22, 3.0, 0.4, target=(0, 0, 0.05), spread=18)
    area("Kicker_Warm", (1.6, -1.2, -0.12), 30, 1.0, 0.3, color=(1.0, 0.86, 0.74), target=(0, 0.2, 0), spread=30)

    # glossy dark cyclorama (floor curving into the back wall)
    bm = bmesh.new()
    prof = [(-7.0 + i * (8.0 / 12), 0.0) for i in range(13)]
    R = 1.8
    for k in range(1, 13):
        a = (math.pi / 2) * k / 12
        prof.append((1.0 + R * math.sin(a), R * (1 - math.cos(a))))
    for k in range(1, 6):
        prof.append((1.0 + R, R + k * 0.8))
    rows = [[bm.verts.new((x, y, z)) for (y, z) in prof] for x in (-9.0, 9.0)]
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    me = bpy.data.meshes.new("Cyclorama")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    cyc = bpy.data.objects.new("Studio_Cyclorama", me)
    model = bpy.data.collections.get(COLL_NAME)
    if model:
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ v.co).z for o in model.all_objects if o.type == "MESH" for v in o.data.vertices]
        cyc.location.z = min(zs) - 0.0005
    fm = principled("Studio_Floor", (0.003, 0.0034, 0.0045), rough=0.42, coat=0.3, coat_rough=0.08)[0]
    me.materials.append(fm)
    coll.objects.link(cyc)

    def cam(nm, loc, target, lens):
        cd = bpy.data.cameras.new(nm)
        cd.lens = lens
        cd.sensor_width = 36
        ob = bpy.data.objects.new(nm, cd)
        ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(ob)
        return ob

    hero = cam("Cam_Hero", (-2.05, -2.5, 0.3), (0.1, 0.32, -0.02), 52)
    cam("Cam_Front", (0.0, -7.2, 0.04), (0.0, 0.0, 0.04), 135)
    cam("Cam_Side", (-6.8, 0.7, 0.62), (0.0, 0.7, 0.02), 100)
    cam("Cam_ThreeQuarter", (-2.5, -2.9, 1.05), (0.0, 0.5, -0.02), 70)
    bpy.context.scene.camera = hero

    scn = bpy.context.scene
    world = scn.world or bpy.data.worlds.new("World")
    scn.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.004, 0.005, 0.007, 1)
    bg.inputs[1].default_value = 1.0
    # keep only this studio's lights / cameras in renders (startup-file Cube/Light are hidden, not deleted)
    for o in bpy.data.objects:
        in_ours = any(c.name in (COLL_NAME, STUDIO_NAME) for c in o.users_collection)
        if not in_ours and o.type in ("MESH", "LIGHT"):
            o.hide_render = True
            o.hide_viewport = True
    return coll


def configure_cycles(samples=192, res=(1600, 900)):
    scn = bpy.context.scene
    try:
        scn.render.engine = "CYCLES"
    except TypeError:
        pass
    c = scn.cycles
    for attr, val in (("samples", samples), ("use_adaptive_sampling", True), ("adaptive_threshold", 0.012),
                      ("use_denoising", True), ("max_bounces", 12), ("diffuse_bounces", 3),
                      ("glossy_bounces", 6), ("transmission_bounces", 12), ("transparent_max_bounces", 12),
                      ("caustics_reflective", False), ("caustics_refractive", False), ("blur_glossy", 0.6),
                      ("use_light_tree", True), ("device", "CPU")):
        try:
            setattr(c, attr, val)
        except Exception:
            pass
    try:
        c.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    try:
        scn.view_settings.view_transform = "AgX"
        scn.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    scn.render.film_transparent = False
    scn.view_settings.exposure = -0.35


def export(coll):
    bpy.ops.object.select_all(action="DESELECT")
    for o in coll.all_objects:
        o.select_set(True)
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    kwargs = dict(
        filepath=GLB_PATH, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_normals=True, export_texcoords=True, export_materials="EXPORT", export_cameras=False,
        export_lights=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=16, export_draco_normal_quantization=16,
        export_draco_texcoord_quantization=14,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        for k in [k for k in kwargs if k.startswith("export_draco")]:
            kwargs.pop(k)
        bpy.ops.export_scene.gltf(**kwargs)
    print("GLB", GLB_PATH, os.path.getsize(GLB_PATH), "bytes")


def stats(coll):
    tris = 0
    for o in coll.objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return tris


coll, objs = build()
studio()
configure_cycles()
print("objects:", len(objs))
print("triangles:", stats(coll))
if os.environ.get("PARALL_EXPORT", "1") == "1" and globals().get("PARALL_DO_EXPORT", True):
    export(coll)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH, copy=True)
    print("BLEND", BLEND_PATH)
