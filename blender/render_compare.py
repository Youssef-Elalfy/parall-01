"""
Before/after comparison renders of the PARALL / 01 model with identical cameras.

Run inside Blender after build_parall01.py:
    COMPARE_TAG = "before"; exec(open(r"<repo>/blender/render_compare.py").read())

Writes blender/renders/compare/<tag>_<view>_clay.png (neutral clay override, no
reflections) and, unless COMPARE_COLOR is False, <tag>_<view>_color.png.
"""
import os
import bpy

ROOT = r"C:\Users\youss\OneDrive\Desktop\PARALL-01"
OUT = os.path.join(ROOT, "blender", "renders", "compare")
os.makedirs(OUT, exist_ok=True)
tag = globals().get("COMPARE_TAG", "before")
do_color = globals().get("COMPARE_COLOR", True)

scn = bpy.context.scene
prev_engine = scn.render.engine
prev_cam = scn.camera
prev_res = (scn.render.resolution_x, scn.render.resolution_y)
view_layer = scn.view_layers[0]
prev_override = view_layer.material_override

clay = bpy.data.materials.get("PARALL_Clay") or bpy.data.materials.new("PARALL_Clay")
clay.use_nodes = True
bsdf = next(n for n in clay.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.6, 1)
bsdf.inputs["Roughness"].default_value = 0.55
bsdf.inputs["Metallic"].default_value = 0.0

try:
    scn.render.engine = "BLENDER_EEVEE"
except TypeError:
    pass
scn.eevee.taa_render_samples = 48
scn.render.resolution_x, scn.render.resolution_y = 1280, 720
scn.render.image_settings.file_format = "PNG"

views = {"front": "Cam_Front", "side": "Cam_Side", "threequarter": "Cam_ThreeQuarter"}
for view, cam_name in views.items():
    scn.camera = bpy.data.objects[cam_name]
    view_layer.material_override = clay
    scn.render.filepath = os.path.join(OUT, f"{tag}_{view}_clay.png")
    bpy.ops.render.render(write_still=True)
    if do_color:
        view_layer.material_override = None
        scn.render.filepath = os.path.join(OUT, f"{tag}_{view}_color.png")
        bpy.ops.render.render(write_still=True)

view_layer.material_override = prev_override
scn.camera = prev_cam
scn.render.resolution_x, scn.render.resolution_y = prev_res
try:
    scn.render.engine = prev_engine
except TypeError:
    pass
print("compare renders written to", OUT)
