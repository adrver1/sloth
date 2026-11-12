"""
Every baked light in Canopy Camp, from one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps
in several different places"). Run it whenever a prop is added, moved or reshaped; each step can also run on its own.

    python props/bake_all.py                       # all steps
    python props/bake_all.py --only props          # or: casters, shadow, ground
    set BLENDER=...\\blender.exe  and, on the desktop GPU, GPU_RUN=...\\render-jobs\\gpu_run.py

  props    props/camp/bake_camp_lightmap.py: the picked set and the lived-in props (wood pile, kitchen, fire set, laundry)
           in one light map (night light + day AO) -> models/camp_lm_<4k|2k|1k>.png and the props' GLBs/txt
  casters  props/shadow/export_casters.cjs: what stands in the clearing, from the live page (headless browser, served
           on :8765 by this script) -> props/shadow/casters_picked_<jeep>.glb and layout_picked.json
  shadow   props/shadow/bake_ground_shadow.py: the sun's and sky's shadow on the ground (Cycles) -> models/camp_shadow_picked_<jeep>.png
  ground   props/ground/bake_ground.py: the worn soil, ash and litter (numpy) -> models/camp_ground_picked.jpg and _mask.png

The props come first: the casters are read from the page, so they pick up the new props.
"""
import argparse, os, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--only", choices=["props", "casters", "shadow", "ground"], action="append")
ap.add_argument("--size", type=int, default=4096, help="light map size")
ap.add_argument("--samples", type=int, default=512, help="light map samples")
ap.add_argument("--shadow-samples", type=int, default=256)
ap.add_argument("--jeeps", default="expedition", help="comma list; the toy and camper are archived")
a = ap.parse_args()
steps = a.only or ["props", "casters", "shadow", "ground"]
BLENDER = os.environ.get("BLENDER", "blender")
GPU_RUN = os.environ.get("GPU_RUN")
jeeps = a.jeeps.split(",")


def blender(script, *args):
    cmd = [BLENDER, "-b", "--python-use-system-env", "--python"]
    cmd += [GPU_RUN, "--", script, "--", *args] if GPU_RUN else [script, "--", *args]
    run(cmd)


def run(cmd, **kw):
    t = time.time()
    print(">", " ".join(os.path.relpath(c, ROOT) if os.path.isabs(c) and c.startswith(ROOT) else c for c in cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kw)
    print(f"  done in {time.time() - t:.0f} s", flush=True)


if "props" in steps:
    blender(os.path.join(ROOT, "props/camp/bake_camp_lightmap.py"), "--size", str(a.size), "--samples", str(a.samples))
if "casters" in steps:
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen("http://localhost:8765/", timeout=1); break
            except OSError:
                time.sleep(0.2)
        for j in jeeps:
            run(["node", os.path.join(ROOT, "props/shadow/export_casters.cjs"), "picked", j])
    finally:
        srv.terminate()
if "shadow" in steps:
    os.environ["GPU"] = "1" if GPU_RUN else ""
    for j in jeeps:
        blender(os.path.join(ROOT, "props/shadow/bake_ground_shadow.py"), "--props", "picked", "--jeep", j, "--samples", str(a.shadow_samples))
if "ground" in steps:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}     # PYTHONPATH may hold Blender's own libraries
    run([sys.executable, os.path.join(ROOT, "props/ground/bake_ground.py"), "--props", "picked"], env=env)
