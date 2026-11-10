# Build one character's office glb with the turnaround/pose renders stubbed out.
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
