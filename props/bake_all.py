"""
Every baked light in Canopy Camp, from one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps
in several different places", and bake the whole scene as one). Run it whenever a prop is added, moved or reshaped.

    python props/bake_all.py                       # all steps
    python props/bake_all.py --only light          # or: layout, ground
    set BLENDER=...\\blender.exe  and, on the desktop GPU, GPU_RUN=...\\render-jobs\\gpu_run.py

  light   props/camp/bake_camp_lightmap.py: ONE Blender scene (the ground disc, the picked set, the lived-in props and the
          jeep) under one set of lights, day (the page's sun + sky) and night (fire, lanterns, stove, moon) ->
            models/camp_lm_<2k|1k>.png          props: night light, one light per channel (RGBA), on TEXCOORD_1
            models/camp_lm_sun_<2k|1k>.png      props: where the sun reaches them (R) and sky occlusion (G)
            models/camp_shadow_picked_<jeep>.png         ground: day shadow (sun + sky)
            models/camp_ground_night_picked_<jeep>.png   ground: night light
          and the props' GLBs/txt
  ktx     the light maps again as KTX2 (UASTC + zstd, linear: they are data), base64 in <map>.ktx2.txt next to the PNGs (artifacts
          don't serve .ktx2), which stay as the fallback;
          needs Khronos' toktx (KTX-Software): set TOKTX=<path to toktx.exe> or have it on PATH. A run with this step checks
          for toktx before any step starts. The light step removes the old .ktx2.txt of every map it rewrites and writes
          camp_lights.json without the "ktx2" flag; this step sets the flag only when every map's .ktx2.txt is newer than
          its PNG, so the page never loads an out-of-date KTX2 copy (review R2-005)
  layout  props/shadow/export_casters.cjs: the clearing's layout from the live page (prop spots, the jeep's track, the path,
          the deadwood, the ground's height, and the "place" block: where the page stands each baked prop and light, which
          the light bake reads instead of keeping its own copy), served by this script on a free local port that it
          hands the exporter as LAYOUT_PORT (it stops if its server dies or never answers, review R2-042) ->
          props/shadow/layout_picked.json (needs `npm install` and CHROME=<a Chrome>); it stops the bake if the page gave
          an incomplete layout
  ground  props/ground/bake_ground.py: the worn soil, ash and litter (numpy) -> models/camp_ground_picked.jpg and _mask.png

Stamps (review R2-140): after each step, props/bake.lock.json records the hash of every input the step read (its scripts,
props/lib, the layout JSON, the jeep GLB, its command line, the Blender or toktx version) and of every output it wrote.
Images are hashed by their pixels, so a PNG re-encoded with the same pixels counts as unchanged, and camp_lights.json
without its "ktx2" flag, which the ktx step sets after the light step. A step whose inputs and outputs both match its
entry is skipped; --force runs every chosen step anyway. Commit bake.lock.json with the outputs.

    python props/bake_all.py --check               # which committed outputs are stale, and why; runs nothing (exit 1 if any)

The layout step's inputs are the camp page's own files (apps/canopy-prototype, without models/ and lmpreview/), the
exporter, three.js's version and its command line; the light step's are props/camp and props/lib (scripts),
props/lived (scripts and textures), layout_picked.json, the jeep GLB, its command line (without --objects), the Blender
version and GPU_RUN's script. props/camp/atlas.json is one of the light step's outputs.
--objects Name,... hands the light step bake_camp_lightmap.py's --objects: only those props are baked again.
"""
import argparse, base64, glob, hashlib, json, os, shutil, socket, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--only", choices=["light", "ktx", "layout", "ground"], action="append")
ap.add_argument("--size", type=int, default=2048, help="props light map size: 2048, the largest the page ships (review R2-170)")
ap.add_argument("--ground-size", type=int, default=1024, help="ground light maps size")
ap.add_argument("--samples", type=int, default=512, help="the light step's sample scale (bake_camp_lightmap.py PASS_SAMPLES)")
ap.add_argument("--jeep", default="expedition", help="the toy and camper are archived")
ap.add_argument("--objects", help="light step: bake only these props (Name,Name,...) into their atlas rectangles (bake_camp_lightmap.py --objects)")
ap.add_argument("--force", action="store_true", help="run the chosen steps even when bake.lock.json says they are current")
ap.add_argument("--check", action="store_true", help="report which steps' outputs are stale and run nothing")
a = ap.parse_args()
steps = a.only or ["layout", "light", "ktx", "ground"]   # layout first: the light bake reads the placements ("place") and the deadwood from it
BLENDER = os.environ.get("BLENDER", "blender")
GPU_RUN = os.environ.get("GPU_RUN")
TOKTX = os.environ.get("TOKTX", "toktx")
MODELS = os.path.join(ROOT, "apps/canopy-prototype/models")
LOCK = os.path.join(ROOT, "props", "bake.lock.json")
if "ktx" in steps and not a.check and not (shutil.which(TOKTX) or os.path.isfile(TOKTX)):   # before the light step's GPU minutes, not after
    sys.exit(f"the ktx step needs Khronos' toktx, and {TOKTX!r} is not on PATH: set TOKTX=<path to toktx> or leave out the ktx step")


def blender(script, *args):
    cmd = [BLENDER, "-b", "--python-use-system-env", "--python"]
    cmd += [GPU_RUN, "--", script, "--", *args] if GPU_RUN else [script, "--", *args]
    run(cmd)


def run(cmd, **kw):
    t = time.time()
    print(">", " ".join(os.path.relpath(c, ROOT) if os.path.isabs(c) and c.startswith(ROOT) else c for c in cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kw)
    print(f"  done in {time.time() - t:.0f} s", flush=True)


def free_port():
    with socket.socket() as k:
        k.bind(("127.0.0.1", 0)); return k.getsockname()[1]


# ------------------------------------------------------------------ stamps (props/bake.lock.json)
def rel(f):
    return os.path.relpath(f, ROOT).replace(os.sep, "/")


def file_hash(f):
    """sha256 of a file: of its pixels for an image, of its content without the "ktx2" flag for camp_lights.json."""
    h = hashlib.sha256()
    ext = os.path.splitext(f)[1].lower()
    if ext in (".png", ".jpg", ".jpeg"):
        from PIL import Image
        with Image.open(f) as im:
            h.update(f"{im.mode} {im.size}".encode()); h.update(im.tobytes())
    elif os.path.basename(f) == "camp_lights.json":
        j = json.load(open(f)); j.pop("ktx2", None); h.update(json.dumps(j, sort_keys=True).encode())
    else:
        with open(f, "rb") as fi:
            h.update(fi.read())
    return h.hexdigest()[:20]


def hashes(files):
    return {rel(f): file_hash(f) if os.path.isfile(f) else None for f in sorted(set(files))}


def tree(*dirs, skip=(), exts=None):
    out = []
    for d in dirs:
        for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
            dn[:] = sorted(x for x in dn if x not in ("__pycache__", "archive", *skip))
            out += [os.path.join(dp, f) for f in fn if not f.endswith(".pyc") and (exts is None or f.endswith(exts))]
    return out


def tool_version(cmd):
    """The first line of `cmd --version`, or None when the tool is not here (a --check on a machine without it)."""
    try:
        return subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=60).stdout.strip().splitlines()[0]
    except (OSError, IndexError, subprocess.SubprocessError):
        return None


def light_maps():
    return [f for p in ("camp_lm_[124]k.png", "camp_lm_sun_[124]k.png") for f in sorted(glob.glob(os.path.join(MODELS, p)))]


def ktx_maps():
    return [f for p in ("camp_lm_[12]k.png", "camp_lm_sun_[12]k.png", f"camp_ground_night_picked_{a.jeep}.png")
            for f in sorted(glob.glob(os.path.join(MODELS, p)))]   # (the jeep's ground and door-spill maps went with its baked light)


LIGHT_CMD = ["--size", str(a.size), "--samples", str(a.samples), "--ground", str(a.ground_size), "--jeep", a.jeep]
KTX_CMD = ["--t2", "--encode", "uastc", "--uastc_quality", "2", "--uastc_rdo_l", "1.0", "--zcmp", "19",
           "--assign_oetf", "linear", "--assign_primaries", "none", "--genmipmap"]
LAYOUT_JSON = os.path.join(ROOT, "props/shadow/layout_picked.json")


def inputs(step):
    """{name: hash or value} of everything the step reads. A None value (a tool that is not on this machine) is not compared."""
    if step == "layout":
        three = json.load(open(os.path.join(ROOT, "node_modules/three/package.json"))).get("version") if os.path.exists(os.path.join(ROOT, "node_modules/three/package.json")) else None
        files = tree("apps/canopy-prototype", skip=("models", "lmpreview")) + [os.path.join(ROOT, "props/shadow/export_casters.cjs")]
        return {**hashes(files), "cmd": ["picked", a.jeep], "three": three}
    if step == "light":
        files = tree("props/camp", "props/lib", exts=(".py",)) + tree("props/lived", exts=(".py", ".png", ".jpg", ".json"))
        files += [LAYOUT_JSON, os.path.join(ROOT, "props", "jeep", f"jeep_{a.jeep}.glb")]
        gpu = file_hash(GPU_RUN) if GPU_RUN and os.path.isfile(GPU_RUN) else None    # outside the repo: by name, not path
        return {**hashes(files), "cmd": LIGHT_CMD, "blender": tool_version(BLENDER), "gpu_run": gpu}
    if step == "ktx":
        return {**hashes(ktx_maps()), "cmd": KTX_CMD, "toktx": tool_version(TOKTX)}
    if step == "ground":
        return {**hashes([os.path.join(ROOT, "props/ground/bake_ground.py"), LAYOUT_JSON]), "cmd": ["--props", "picked"]}


def outputs(step):
    if step == "layout":
        return hashes([LAYOUT_JSON])
    if step == "light":
        files = light_maps() + [os.path.join(MODELS, n) for n in (f"camp_shadow_picked_{a.jeep}.png", f"camp_ground_night_picked_{a.jeep}.png",
                                                                  "camp_lights.json", "camp_picked_lm.txt", "lived.txt", "fire.txt", "laundry.txt")]
        files += [os.path.join(ROOT, "props/camp/camp_picked_lm.glb"), os.path.join(ROOT, "props/camp/atlas.json")]
        files += [os.path.join(ROOT, "props/lived", f"{n}.glb") for n in ("lived", "fire", "laundry")]
        return hashes(files)
    if step == "ktx":
        return hashes([f[:-4] + ".ktx2.txt" for f in ktx_maps()])
    if step == "ground":
        return hashes([os.path.join(MODELS, "camp_ground_picked.jpg"), os.path.join(MODELS, "camp_ground_picked_mask.png")])


def load_lock():
    try:
        return json.load(open(LOCK))
    except (OSError, ValueError):
        return {}


def stale(step, lock):
    """Why the step must run again, as a list of short reasons; empty when its entry matches."""
    e = lock.get(step)
    if not e:
        return ["it has no entry in bake.lock.json"]
    why = []
    now = inputs(step)
    for k in sorted(set(now) | set(e["inputs"])):
        if now.get(k) is None and k in ("blender", "toktx", "three", "gpu_run"):
            continue                                     # the tool is not on this machine: not compared
        if now.get(k) != e["inputs"].get(k):
            why.append(f"input {k} changed" if k in now and k in e["inputs"] else f"input {k} {'added' if k in now else 'removed'}")
    for k, v in outputs(step).items():
        if v is None or v != e["outputs"].get(k):
            why.append(f"output {k} {'missing' if v is None else 'changed since the step ran'}")
    return why


def stamp(step, before):
    """Records the step's inputs (as they were when it started) and outputs. An input that changed during the run (the
    light step's wood-stack texture on a cache miss, or a hand edit) is stored as it was before, so the next run repeats the step."""
    after = inputs(step)
    moved = [k for k in before if before[k] != after.get(k)]
    if moved:
        print(f"  {step}: these inputs changed while it ran, so the next run repeats it: {', '.join(moved)}", flush=True)
    lock = load_lock(); lock[step] = {"inputs": before, "outputs": outputs(step)}
    json.dump(lock, open(LOCK, "w"), indent=1, sort_keys=True); open(LOCK, "a").write("\n")


# ------------------------------------------------------------------ the steps
def step_layout():
    port = free_port()                                       # never one another server or bake already holds
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            if srv.poll() is not None:
                sys.exit(f"the layout server on port {port} stopped at once (exit {srv.returncode})")
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=1); break
            except OSError:
                time.sleep(0.2)
        else:
            sys.exit(f"the layout server on port {port} did not answer in 10 s")
        run(["node", os.path.join(ROOT, "props/shadow/export_casters.cjs"), "picked", a.jeep], env={**os.environ, "LAYOUT_PORT": str(port)})
    finally:
        srv.terminate()


def step_light():
    blender(os.path.join(ROOT, "props/camp/bake_camp_lightmap.py"), *LIGHT_CMD, *(["--objects", a.objects] if a.objects else []))


def step_ktx():
    maps = ktx_maps()
    for f in maps:
        out = f[:-4] + ".ktx2"
        run([TOKTX, *KTX_CMD, out, f])
        # artifacts don't serve .ktx2: the page loads them base64 from .ktx2.txt, like the models
        with open(out, "rb") as fi, open(out + ".txt", "w") as fo: fo.write(base64.b64encode(fi.read()).decode())
        print(f"  {os.path.basename(out)}: {os.path.getsize(out) // 1024} KB, as text {os.path.getsize(out + '.txt') // 1024} KB (png {os.path.getsize(f) // 1024} KB)", flush=True)
        os.remove(out)
    old = [os.path.basename(f) for f in maps if not os.path.exists(f[:-4] + ".ktx2.txt") or os.path.getmtime(f[:-4] + ".ktx2.txt") < os.path.getmtime(f)]
    jf = os.path.join(MODELS, "camp_lights.json"); j = json.load(open(jf))
    j["ktx2"] = bool(maps) and not old; json.dump(j, open(jf, "w"), indent=1)   # tells the page to try .ktx2
    if old:
        sys.exit("no KTX2 for the page: these maps have no up-to-date .ktx2.txt: " + ", ".join(old))


def step_ground():
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}     # PYTHONPATH may hold Blender's own libraries
    run([sys.executable, os.path.join(ROOT, "props/ground/bake_ground.py"), "--props", "picked"], env=env)


STEPS = {"layout": step_layout, "light": step_light, "ktx": step_ktx, "ground": step_ground}
if a.check:
    lock, bad = load_lock(), 0
    for st in steps:
        why = stale(st, lock)
        bad += bool(why)
        print(f"{st}: " + ("current" if not why else "stale: " + "; ".join(why[:8]) + (f"; and {len(why) - 8} more" if len(why) > 8 else "")))
    sys.exit(1 if bad else 0)
for st in steps:
    why = stale(st, load_lock())
    if not why and not a.force:
        print(f"{st}: unchanged since its last run (props/bake.lock.json), skipped; --force runs it anyway", flush=True)
        continue
    print(f"{st}: runs, because " + "; ".join(why[:5]) if why else f"{st}: runs (--force)", flush=True)
    before = inputs(st)
    STEPS[st]()
    stamp(st, before)
