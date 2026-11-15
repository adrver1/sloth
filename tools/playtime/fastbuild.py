# Builds one desk-at-night character's office GLB with its turnaround and pose renders stubbed out, such as the
# ponytail engineer that Sloth Playtime loads (apps/playtime/models/ponytail.txt is that GLB slimmed and base64-packed). Run it with Blender's Python on a character folder in the engine/ submodule, so the kit stays there:
#   <blender python> tools/playtime/fastbuild.py engine/characters/<name> <out.glb>
# Moved here from apps/playtime-tools/ (review R2-222).
import os, sys, runpy
here = sys.argv[1]; out = sys.argv[2]
sys.path.insert(0, os.path.join(here, "..", "_shared"))
import base_body as base
base.setup_render = lambda *a, **k: None
base.render_views = lambda *a, **k: []
base.strip = lambda *a, **k: None
base.contact_sheet = lambda *a, **k: None
base.pose_tests = lambda: {}
import bpy
bpy.ops.wm.save_as_mainfile = lambda *a, **k: None
name = os.path.basename(here)
sys.argv = [f"build_{name}.py", "--outfit", "office", "--out", out]
runpy.run_path(os.path.join(here, f"build_{name}.py"), run_name="__main__")
