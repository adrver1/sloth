"""
Every baked light in Canopy Camp, from one place (Adriaen 2026-11-12: "We don't want to generate shadows and light maps
in several different places", and bake the whole scene as one). Run it whenever a prop is added, moved or reshaped.

    python props/bake_all.py                       # all steps
    python props/bake_all.py --only light          # or: layout, jeep, ktx, ground
    set BLENDER=...\\blender.exe  and, on the desktop GPU, GPU_RUN=...\\render-jobs\\gpu_run.py

  jeep    props/jeep/build_jeep.py: the jeep GLB the light bake casts shadows with, its far LOD and their models/*.txt
          copies (its own Cycles AO bake, a few seconds); with --jeep toy or camper, props/jeep/archive/build_jeep_styles.py
          --style <jeep> instead (the GLB only, review R2-258); stamped like the others, so it reruns only when its builder
          or props/lib changed (review R2-228)
  light   props/camp/bake_camp_lightmap.py: ONE Blender scene (the ground disc, the picked set, the lived-in props and the
          jeep) under one set of lights, day (the page's sun + sky) and night (fire, lanterns, stove, moon) ->
            models/camp_lm_<2k|1k>.png          props: the four night lights, fire, stove, lanterns, moon (RGBA), on TEXCOORD_1
            models/camp_lm_sun_<2k|1k>.png      props: where the sun reaches them (R) and sky occlusion (G)
            models/camp_shadow_picked_<jeep>.png         ground: day shadow (sun + sky)
            models/camp_ground_night_picked_<jeep>.png   ground: the same four night lights
            models/camp_lights.json             the channel order and each light's colour
          and the props' GLBs/txt (the channel layout is described once, in apps/canopy-prototype/camp/campProps.js above
          lnight). The 4K maps stay on the desktop (.gitignore, review R2-207): ?lm=4k works there, and a clone or Pages
          falls back to the 2K maps
  ktx     the light maps again as KTX2 (UASTC + zstd, linear: they are data), base64 in <map>.ktx2.txt next to the PNGs (artifacts
          don't serve .ktx2; the .ktx2 itself is deleted, and .gitignore covers one a stopped bake leaves), which stay as
          the fallback, and camp_lights.json "ktx2": each converted map with the hash of its PNG, merged into the entries
          already there (the page tries KTX2 only for the maps listed, and tools/check-imports.cjs finds a stale one);
          needs Khronos' toktx (KTX-Software): set TOKTX=<path to toktx.exe> or have it on PATH. When this step will run
          (stale, forced, or after a layout or light step that runs), toktx is checked before any step starts. The light step
          removes the old .ktx2.txt of every map it rewrites and writes
          camp_lights.json without the "ktx2" entries; this step lists only the maps whose .ktx2.txt is newer than its PNG,
          and fails when one is not, so the page never loads an out-of-date KTX2 copy (review R2-005)
  layout  props/shadow/export_casters.cjs: the clearing's layout (the worn spots, the jeep's track, the path, the deadwood,
          and the "place" block: where the page stands each baked prop and light, which the light bake reads instead of
          keeping its own copy). All but the deadwood comes from props/shadow/layout_pure.mjs in node (review R2-257); the
          exporter boots the page for the deadwood and checks the page agrees. The exporter serves the repo itself, on a free
          port, through tools/camp-page.cjs openCamp -> props/shadow/layout_picked.json (needs `npm ci`, and CHROMIUM=<a
          Chrome> when the repo's playwright has no browser of its own); it stops the bake if the page gave an incomplete
          layout or disagrees with layout_pure.mjs
  ground  props/ground/bake_ground.py: the worn soil, ash and litter (numpy) -> models/camp_ground_picked.jpg and _mask.png
  summit  the Summit Cabin's light maps (Adriaen 2026-11-15): props/summit/export_summit.cjs boots summit.html and writes the
          cabin's and lookout's meshes with their light-map UVs (summit/lightmap.js packLightmap) and night lights to
          props/summit/summit_static.glb and summit_layout.json, then props/summit/bake_summit_lightmap.py bakes sky occlusion
          and the night light -> models/summit_lm_ao_<2k|1k>.png, summit_lm_night_<2k|1k>.png and summit_lm.json; and the
          scout camp's ground (Adriaen 2026-11-16: "precompute shadows ... as in the summer camp"), a 44 m square round the
          cabin and the fire, under every prop that stands there -> models/summit_ground_ao.png (sky occlusion),
          summit_ground_night.png (fire, cabin and lantern light, one channel each) and summit_ground.json

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
import argparse, glob, hashlib, json, os, shutil, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "props"))
from lib.export import to_txt  # noqa: E402  (plain Python: it needs no Blender)
ap = argparse.ArgumentParser()
ap.add_argument("--only", choices=["layout", "jeep", "light", "ktx", "ground", "summit"], action="append")
ap.add_argument("--size", type=int, default=2048, help="props light map size: 2048, the largest the page ships (review R2-170)")
ap.add_argument("--ground-size", type=int, default=1024, help="ground light maps size")
ap.add_argument("--samples", type=int, default=512, help="the light step's sample scale (bake_camp_lightmap.py PASS_SAMPLES)")
ap.add_argument("--jeep", default="expedition", help="the toy and camper are archived")
ap.add_argument("--objects", help="light step: bake only these props (Name,Name,...) into their atlas rectangles (bake_camp_lightmap.py --objects)")
ap.add_argument("--force", action="store_true", help="run the chosen steps even when bake.lock.json says they are current")
ap.add_argument("--check", action="store_true", help="report which steps' outputs are stale and run nothing")
a = ap.parse_args()
steps = a.only or ["layout", "jeep", "light", "ktx", "ground", "summit"]   # layout first: the light bake reads the placements ("place") and the deadwood from it; the jeep before the light, which casts its shadows
BLENDER = os.environ.get("BLENDER", "blender")
GPU_RUN = os.environ.get("GPU_RUN")
TOKTX = os.environ.get("TOKTX", "toktx")
MODELS = os.path.join(ROOT, "apps/canopy-prototype/models")
LOCK = os.path.join(ROOT, "props", "bake.lock.json")


def blender(script, *args):
    cmd = [BLENDER, "-b", "--python-use-system-env", "--python"]
    cmd += [GPU_RUN, "--", script, "--", *args] if GPU_RUN else [script, "--", *args]
    run(cmd)


def run(cmd, **kw):
    t = time.time()
    print(">", " ".join(os.path.relpath(c, ROOT) if os.path.isabs(c) and c.startswith(ROOT) else c for c in cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kw)
    print(f"  done in {time.time() - t:.0f} s", flush=True)


# ------------------------------------------------------------------ stamps (props/bake.lock.json)
def rel(f):
    return os.path.relpath(f, ROOT).replace(os.sep, "/")


TEXT_EXT = {".py", ".js", ".cjs", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".glsl"}


def file_hash(f):
    """sha256 of a file: of its pixels for an image, of its text with LF line ends for a source file, of its content without the "ktx2" flag for camp_lights.json."""
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
            data = fi.read()
        if ext in TEXT_EXT:   # a Windows checkout has CRLF line ends: hash text as LF so both machines agree
            data = data.replace(b"\r\n", b"\n")
        h.update(data)
    return h.hexdigest()[:20]


def hashes(files):
    return {rel(f): file_hash(f) if os.path.isfile(f) else None for f in sorted(set(files))}


LINKS = {"karaoke"}


def tree(*dirs, skip=(), exts=None):
    out = []
    for d in dirs:
        for dp, dn, fn in os.walk(os.path.join(ROOT, d)):
            dn[:] = sorted(x for x in dn if x not in ("__pycache__", "archive", *skip))
            # the karaoke link (apps/canopy-prototype/karaoke -> ../karaoke) is a folder link on Linux but a small text file on a
            # Windows checkout without core.symlinks, so it is left out on both, or the two machines never agree
            out += [os.path.join(dp, f) for f in fn if not f.endswith(".pyc") and f not in LINKS and (exts is None or f.endswith(exts))]
    return out


def tool_version(cmd):
    """The first line of `cmd --version`, or None when the tool is not here (a --check on a machine without it)."""
    try:
        return subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=60).stdout.strip().splitlines()[0]
    except (OSError, IndexError, subprocess.SubprocessError):
        return None


def light_maps():
    """The props maps the light step writes: 2K and 1K, and 4K only with --size 4096 (a bake under 4096 removes the old
    4K maps, which no longer fit the new light-map UVs, review R2-170)."""
    k = "[124]" if a.size >= 4096 else "[12]"
    return [f for p in (f"camp_lm_{k}k.png", f"camp_lm_sun_{k}k.png") for f in sorted(glob.glob(os.path.join(MODELS, p)))]


def ktx_maps():
    return [f for p in ("camp_lm_[12]k.png", "camp_lm_sun_[12]k.png", f"camp_ground_night_picked_{a.jeep}.png")
            for f in sorted(glob.glob(os.path.join(MODELS, p)))]   # (the jeep's ground and door-spill maps went with its baked light)


LIGHT_CMD = ["--size", str(a.size), "--samples", str(a.samples), "--ground", str(a.ground_size), "--jeep", a.jeep]
KTX_CMD = ["--t2", "--encode", "uastc", "--uastc_quality", "2", "--uastc_rdo_l", "1.0", "--zcmp", "19",
           "--assign_oetf", "linear", "--assign_primaries", "none", "--genmipmap"]
LAYOUT_JSON = os.path.join(ROOT, "props/shadow/layout_picked.json")
JEEP_SCRIPT = os.path.join(ROOT, "props/jeep", "build_jeep.py" if a.jeep == "expedition" else "archive/build_jeep_styles.py")
JEEP_CMD = [] if a.jeep == "expedition" else ["--style", a.jeep]     # the archived styles: build_jeep_styles.py (review R2-258)


SUMMIT_CMD = ["--samples", str(a.samples)]
SUMMIT_DIR = os.path.join(ROOT, "props/summit")


def summit_outputs():
    return [os.path.join(SUMMIT_DIR, f) for f in ("summit_static.glb", "summit_layout.json")] + \
        [os.path.join(MODELS, f"summit_lm_{k}_{s}k.png") for k in ("ao", "night") for s in (2, 1)] + [os.path.join(MODELS, "summit_lm.json")] + \
        [os.path.join(MODELS, f) for f in ("summit_ground_ao.png", "summit_ground_night.png", "summit_ground.json")]


def jeep_outputs():
    """The jeep step's files: its GLB, and for the expedition (the page's jeep) its far LOD and both base64 copies."""
    out = [os.path.join(ROOT, "props/jeep", f"jeep_{a.jeep}.glb")]
    if a.jeep == "expedition":
        out += [os.path.join(ROOT, "props/jeep/jeep_expedition_lod.glb")] + [os.path.join(MODELS, f"jeep_expedition{s}.txt") for s in ("", "_lod")]
    return out


def inputs(step):
    """{name: hash or value} of everything the step reads. A None value (a tool that is not on this machine) is not compared."""
    if step == "layout":
        three = json.load(open(os.path.join(ROOT, "node_modules/three/package.json"))).get("version") if os.path.exists(os.path.join(ROOT, "node_modules/three/package.json")) else None
        files = tree("apps/canopy-prototype", skip=("models", "lmpreview")) + [os.path.join(ROOT, "props/shadow", f) for f in ("export_casters.cjs", "layout_pure.mjs")]
        return {**hashes(files), "cmd": [a.jeep], "three": three}
    if step == "jeep":
        scripts = [os.path.join(ROOT, "props/jeep/build_jeep.py")] + ([] if a.jeep == "expedition" else [JEEP_SCRIPT])
        return {**hashes(scripts + tree("props/lib", exts=(".py",))), "cmd": JEEP_CMD,
                "blender": tool_version(BLENDER)}
    if step == "light":
        files = tree("props/camp", "props/lib", exts=(".py",)) + tree("props/lived", exts=(".py", ".png", ".jpg", ".json"))
        files += [LAYOUT_JSON, os.path.join(ROOT, "props", "jeep", f"jeep_{a.jeep}.glb")]
        gpu = file_hash(GPU_RUN) if GPU_RUN and os.path.isfile(GPU_RUN) else None    # outside the repo: by name, not path
        return {**hashes(files), "cmd": LIGHT_CMD, "blender": tool_version(BLENDER), "gpu_run": gpu}
    if step == "ktx":
        return {**hashes(ktx_maps()), "cmd": KTX_CMD, "toktx": tool_version(TOKTX)}
    if step == "ground":
        return {**hashes([os.path.join(ROOT, "props/ground/bake_ground.py"), LAYOUT_JSON]), "cmd": ["--props", "picked"]}
    if step == "summit":   # the summit page's code that makes the cabin, the lookout and their UVs (the page checks the bake's sig too)
        files = [os.path.join(ROOT, "apps/canopy-prototype/summit", f) for f in ("cabin.js", "lightmap.js", "land.js", "core.js", "forest.js", "scoutCamp.js", "road.js", "groundLight.js")]
        files += [os.path.join(SUMMIT_DIR, f) for f in ("export_summit.cjs", "bake_summit_lightmap.py")] + tree("props/lib", exts=(".py",))
        gpu = file_hash(GPU_RUN) if GPU_RUN and os.path.isfile(GPU_RUN) else None
        return {**hashes(files), "cmd": SUMMIT_CMD, "blender": tool_version(BLENDER), "gpu_run": gpu}


def outputs(step):
    if step == "layout":
        return hashes([LAYOUT_JSON])
    if step == "jeep":
        return hashes(jeep_outputs())
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
    if step == "summit":
        return hashes(summit_outputs())


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
    run(["node", os.path.join(ROOT, "props/shadow/export_casters.cjs"), a.jeep])   # it serves the repo itself, on a free port


def step_jeep():
    blender(JEEP_SCRIPT, *JEEP_CMD)


def step_light():
    blender(os.path.join(ROOT, "props/camp/bake_camp_lightmap.py"), *LIGHT_CMD, *(["--objects", a.objects] if a.objects else []))


def step_ktx():
    maps = ktx_maps()
    for f in maps:
        out = f[:-4] + ".ktx2"
        run([TOKTX, *KTX_CMD, out, f])
        to_txt(out, out + ".txt")   # artifacts don't serve .ktx2: the page loads them base64 from .ktx2.txt, like the models
        print(f"  {os.path.basename(out)}: {os.path.getsize(out) // 1024} KB, as text {os.path.getsize(out + '.txt') // 1024} KB (png {os.path.getsize(f) // 1024} KB)", flush=True)
        os.remove(out)
    old = [f for f in maps if not os.path.exists(f[:-4] + ".ktx2.txt") or os.path.getmtime(f[:-4] + ".ktx2.txt") < os.path.getmtime(f)]
    # tells the page which maps have a .ktx2.txt (it tries no other, so the 4K maps do not 404), stamped with the first 16 hex
    # digits of each source PNG's sha256, so tools/check-imports.cjs finds a .ktx2.txt that is older than its PNG
    stamp = {os.path.basename(f)[:-4]: hashlib.sha256(open(f, "rb").read()).hexdigest()[:16] for f in maps if f not in old}
    jf = os.path.join(MODELS, "camp_lights.json"); j = json.load(open(jf))
    j["ktx2"] = {**(j["ktx2"] if isinstance(j.get("ktx2"), dict) else {}), **stamp}   # merged, so a run with fewer maps (--jeep none) keeps the others
    json.dump(j, open(jf, "w"), indent=1)
    if old:
        sys.exit("no KTX2 for the page: these maps have no up-to-date .ktx2.txt: " + ", ".join(os.path.basename(f) for f in old))


def step_ground():
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}     # PYTHONPATH may hold Blender's own libraries
    run([sys.executable, os.path.join(ROOT, "props/ground/bake_ground.py"), "--props", "picked"], env=env)


def step_summit():
    run(["node", os.path.join(SUMMIT_DIR, "export_summit.cjs")])   # serves the repo itself, on a free port, like the layout step
    blender(os.path.join(SUMMIT_DIR, "bake_summit_lightmap.py"), *SUMMIT_CMD)


STEPS = {"layout": step_layout, "jeep": step_jeep, "light": step_light, "ktx": step_ktx, "ground": step_ground, "summit": step_summit}
if a.check:
    lock, bad = load_lock(), 0
    for st in steps:
        why = stale(st, lock)
        bad += bool(why)
        print(f"{st}: " + ("current" if not why else "stale: " + "; ".join(why[:8]) + (f"; and {len(why) - 8} more" if len(why) > 8 else "")))
    sys.exit(1 if bad else 0)
# toktx is checked before the light step's GPU minutes, not after, and only when the ktx step will run: it is stale, or
# forced, or a step before it runs (the layout or the jeep makes the light step run, and the light step rewrites the maps it encodes)
if "ktx" in steps and not (shutil.which(TOKTX) or os.path.isfile(TOKTX)) and (
        a.force or any(stale(s, load_lock()) for s in ("layout", "jeep", "light", "ktx") if s in steps)):
    sys.exit(f"the ktx step needs Khronos' toktx, and {TOKTX!r} is not on PATH: set TOKTX=<path to toktx> or leave out the ktx step")
for st in steps:
    why = stale(st, load_lock())
    if not why and not a.force:
        print(f"{st}: unchanged since its last run (props/bake.lock.json), skipped; --force runs it anyway", flush=True)
        continue
    print(f"{st}: runs, because " + "; ".join(why[:5]) if why else f"{st}: runs (--force)", flush=True)
    before = inputs(st)
    STEPS[st]()
    stamp(st, before)
