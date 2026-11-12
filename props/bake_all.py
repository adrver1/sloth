"""
Every baked light in Canopy Camp, from one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps
in several different places", and bake the whole scene as one). Run it whenever a prop is added, moved or reshaped.

    python props/bake_all.py                       # all steps
    python props/bake_all.py --only light          # or: layout, ground
    set BLENDER=...\\blender.exe  and, on the desktop GPU, GPU_RUN=...\\render-jobs\\gpu_run.py

  light   props/camp/bake_camp_lightmap.py: ONE Blender scene (the ground disc, the picked set, the lived-in props and the
          jeep) under one set of lights, day (the page's sun + sky) and night (fire, lanterns, stove, moon) ->
            models/camp_lm_<4k|2k|1k>.png       props: night light (RGB) and sky occlusion (A), on TEXCOORD_1
            models/camp_lm_sun_<4k|2k|1k>.png   props: where the sun reaches them
            models/camp_shadow_picked_<jeep>.png         ground: day shadow (sun + sky)
            models/camp_ground_night_picked_<jeep>.png   ground: night light
          and the props' GLBs/txt
  ktx     the light maps again as KTX2 (UASTC + zstd, linear: they are data), next to the PNGs, which stay as the fallback;
          needs Khronos' toktx (KTX-Software): set TOKTX=<path to toktx.exe> or have it on PATH
  layout  props/shadow/export_casters.cjs: the clearing's layout from the live page (prop spots, the jeep's track, the path),
          served on :8765 by this script -> props/shadow/layout_picked.json (needs `npm install` and CHROME=<a Chrome>)
  ground  props/ground/bake_ground.py: the worn soil, ash and litter (numpy) -> models/camp_ground_picked.jpg and _mask.png
"""
import argparse, os, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--only", choices=["light", "ktx", "layout", "ground"], action="append")
ap.add_argument("--size", type=int, default=4096, help="props light map size")
ap.add_argument("--ground-size", type=int, default=1024, help="ground light maps size")
ap.add_argument("--samples", type=int, default=512)
ap.add_argument("--jeep", default="expedition", help="the toy and camper are archived")
a = ap.parse_args()
steps = a.only or ["light", "ktx", "layout", "ground"]
BLENDER = os.environ.get("BLENDER", "blender")
GPU_RUN = os.environ.get("GPU_RUN")


def blender(script, *args):
    cmd = [BLENDER, "-b", "--python-use-system-env", "--python"]
    cmd += [GPU_RUN, "--", script, "--", *args] if GPU_RUN else [script, "--", *args]
    run(cmd)


def run(cmd, **kw):
    t = time.time()
    print(">", " ".join(os.path.relpath(c, ROOT) if os.path.isabs(c) and c.startswith(ROOT) else c for c in cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kw)
    print(f"  done in {time.time() - t:.0f} s", flush=True)


if "light" in steps:
    blender(os.path.join(ROOT, "props/camp/bake_camp_lightmap.py"), "--size", str(a.size), "--samples", str(a.samples),
            "--ground", str(a.ground_size), "--jeep", a.jeep)
if "ktx" in steps:
    import glob
    TOKTX = os.environ.get("TOKTX", "toktx")
    M = os.path.join(ROOT, "apps/canopy-prototype/models")
    maps = [f for p in ("camp_lm_[12]k.png", "camp_lm_sun_[12]k.png", f"camp_ground_night_picked_{a.jeep}.png",
                        f"camp_ground_jeep_picked_{a.jeep}.png", f"camp_ground_door[PDB]_picked_{a.jeep}.png") for f in sorted(glob.glob(os.path.join(M, p)))]
    for f in maps:
        out = f[:-4] + ".ktx2"
        run([TOKTX, "--t2", "--encode", "uastc", "--uastc_quality", "2", "--uastc_rdo_l", "1.0", "--zcmp", "19",
             "--assign_oetf", "linear", "--assign_primaries", "none", "--genmipmap", out, f])
        print(f"  {os.path.basename(out)}: {os.path.getsize(out) // 1024} KB (png {os.path.getsize(f) // 1024} KB)", flush=True)
if "layout" in steps:
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen("http://localhost:8765/", timeout=1); break
            except OSError:
                time.sleep(0.2)
        run(["node", os.path.join(ROOT, "props/shadow/export_casters.cjs"), "picked", a.jeep])
    finally:
        srv.terminate()
if "ground" in steps:
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}     # PYTHONPATH may hold Blender's own libraries
    run([sys.executable, os.path.join(ROOT, "props/ground/bake_ground.py"), "--props", "picked"], env=env)
