"""
Headless Cycles renders of the PARALL / 01 studio shots.

    blender --background blender/parall-01.blend --python blender/render_shots.py -- [samples] [width] [height]

Writes blender/renders/parall01_<camera>.png for each studio camera.
"""
import os
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
samples = int(argv[0]) if len(argv) > 0 else 256
width = int(argv[1]) if len(argv) > 1 else 1600
height = int(argv[2]) if len(argv) > 2 else 900
cams = argv[3].split(",") if len(argv) > 3 else ["Cam_Hero", "Cam_Front", "Cam_Side", "Cam_ThreeQuarter"]

root = os.path.dirname(os.path.abspath(bpy.data.filepath))
out_dir = os.path.join(root, "renders")
os.makedirs(out_dir, exist_ok=True)

scn = bpy.context.scene
scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = samples
scn.cycles.use_adaptive_sampling = True
scn.cycles.adaptive_threshold = 0.01
scn.cycles.use_denoising = True
scn.render.resolution_x = width
scn.render.resolution_y = height
scn.render.resolution_percentage = 100
scn.render.image_settings.file_format = "PNG"
scn.render.image_settings.color_mode = "RGB"

for name in cams:
    cam = bpy.data.objects.get(name)
    if cam is None:
        print("missing camera", name)
        continue
    scn.camera = cam
    scn.render.filepath = os.path.join(out_dir, "parall01_" + name.replace("Cam_", "").lower() + ".png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scn.render.filepath, flush=True)
