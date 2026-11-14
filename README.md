# sloth

The baby sloth and everything made with it: the low-poly sloth character and its rig, the karaoke stage, the modular synth, the WhatsApp stickers and the small games and preview pages.

This work started in the desk-at-night repo (thread "Make fun extras with the sloth babies", 2026-11-04 to 2026-11-10) and moved here on 2026-11-10. The full thread is in [docs/threads](docs/threads/make-fun-extras-with-the-sloth-babies.md), and the old project note is in [docs/memory/sloth-baby.md](docs/memory/sloth-baby.md).

## What is where

| Path | What it is | Published artifact |
| --- | --- | --- |
| `apps/karaoke/` | **Sloth Karaoke.** Three songs: Party Paws (default), G’day, Slow Day (`?song=aussie`) and Slow, Slow (`?song=slow`). | https://claude.ai/artifact/1XERJCtCi5Gb3uLF8iHvLj |
| `apps/synth/` | **Sloth Synth.** A modular synth with 12 sloth modules and patch cables; every knob has a CV jack. | https://claude.ai/artifact/DdhRtkw7MLCyHAP7EKdfPu |
| `apps/stickers-page/` | **Sloth Babies Stickers.** The preview page for the 19 stickers, with Animated and Still tabs. | https://claude.ai/artifact/AVmE22wrhF7VzAFbncbUsg |
| `apps/catch-the-baby/` | **Catch the Baby**, a small game. | https://claude.ai/artifact/Vo8KXUVinCcxegRHpVaWSD |
| `apps/playtime/` | **Sloth Playtime.** The ponytail engineer's play clips with two sloths. | https://claude.ai/artifact/UUimcJPizJcUjnNKU6TyWd |
| `apps/fur-options/` | **Sloth Fur Options.** The fur looks; 4 merged shell layers was the pick. | https://claude.ai/artifact/GNGvhQsK1cAjVCh1jdyLzA |
| `apps/canopy-prototype/` | **Canopy Camp**, the camp game (`camp.html`); see the Canopy Camp section below. | GitHub Pages: https://adrver1.github.io/sloth/canopy-prototype/camp.html |
| `props/` | The camp's Blender generators and bakes (`props/lib/`, `bake_all.py`); see Canopy Camp below. | |
| `tools/` | The camp's headless checks (replay, scenarios, probe), the generator fingerprint and `sync-shared.cjs`. | |
| `docs/reviews/` | The code reviews; `code-review-2026-11-13/findings.md` lists every finding with its status. | |
| `stickers/renderer/` | The sticker renderer page and its scripts (still and animated, 512×512 WebP). | |
| `stickers/packs/` | The finished sticker zips (furry, flat, animated, hearts) and the family sticker. | |
| `characters/aussie_critters/` | The karaoke's Aussie crowd (platypus, wallaby, echidna, wombat): `build_critters.py` and `critter_rig.py` (idle, bop, cheer, and hop for the wallaby), plus the exported GLBs. Packed for the page with `pack_chars.mjs --own`, then base64 into `apps/karaoke/models/`. | |
| `characters/sloth_baby/` | The sloth: `build_sloth_baby.py` and `sloth_rig.py`, plus the exported GLBs. The live look is `plush_real`. | |
| `engine/` | The desk-at-night repo as a git submodule (shallow, branch `main`). It provides the character kit (`engine/characters/_shared`), the ponytail engineer and the bearded operator the sloth plays with, and `engine/web/scripts/pack_chars.mjs`. Nothing from it is copied here. | |

Each app is a static page. Its models sit next to it as base64 `.txt` files. The shell fur, `fur.js`, has one source, `shared/fur.js`; each app folder that uses it keeps a generated copy next to its page, because each folder is published on its own. Edit only `shared/fur.js`, then run `npm run sync-shared` (`tools/sync-shared.cjs`) to rewrite the copies; `npm run check-shared` exits 1 if a copy differs. Three.js 0.186.1 loads from jsDelivr.

## Canopy Camp

`apps/canopy-prototype/camp.html` is the camp game: a clearing in the canopy with seven named sloths, the bearded operator, a jeep, chores, a day cycle and weather. It is plain ES modules on Three.js 0.186.1, no build step. It is published on GitHub Pages (`.github/workflows/pages.yml`: https://adrver1.github.io/sloth/canopy-prototype/camp.html). Every source file starts with a comment saying what it does and what it exports; read that first.

**Modules** (`apps/canopy-prototype/camp/`). Importing a module builds nothing: each one that makes part of the camp exports a build function, and `main.js` calls them in one commented list, in the order the camp is built (a step comes after the steps whose parts it uses). Each system draws from its own named random stream (`core.js` `rng("forest")`, `rng("sloths")`...), seeded from `?seed`, so moving a step or drawing more in one system does not move the others. Each frame `main.js` calls the step functions in one fixed order.

| Group | Modules |
| --- | --- |
| Shared base | `core.js` (URL options, renderer, scene, camera, the named random streams, every download started at once), `util.js` (small helpers, and yawTo/yawFrom for turning to face), `layout.js` (where everything stands), `places.js` (who holds which seat, bed or spot, and who is walking about), `targets.js` (the things that light up and open a menu), `events.js` (the few signals between modules that do not import each other: act, food, cheer), `actor.js` (what the sloths and the operator share: bone aim, clip cross-fade, sleep Zs), `fx.js`, `hud.js`, `save.js` |
| World | `sky.js`, `forest.js`, `terrain.js`, `campGround.js` (with `../ground.js`), `glade.js` (the sloth tree's glade at the end of the footpath), `campAir.js` (with `../atmosphere.js`), `deadwood.js`, `lanterns.js`, `daytime.js`, `daylight.js` (with `../bakedlight.js`), `weather.js` |
| Props and things to use | `campProps.js`, `chores.js` (with `../activities.js` and `../activities/`), `food.js`, `canister.js`, `swing.js`, `tentInside.js`, `jeep.js`, `jeepSeat.js`, `car.js`, `clock.js`, `radio.js`, `linger.js` |
| Sloths | `sloths.js` (the way in), `cast.js` (the seven names), `sloth/` (one job per module: body, clips, face, spots, the ways in and out, day, naps, eating, cards, step...) |
| Operator | `operator.js` (the way in), `operator/` (model, state, places, walk, day, cook, buddy, talk, the poses after the clip) |
| You | `player.js`, `input.js` (keys, stick, look, taps, the menus), `highlight.js`, `nav.js`, `audio.js` (all sound, made in WebAudio: the way in, with `audio/` holding the context, the sounds, the music and the camp watchers) |
| Tools and lab | `debug.js` (every `window.__` name the headless tools use, with who reads it; set by `ready()` once the camp is built), `lab.js` and `labButton.js` (the move lab, `?lab`) |

Import the layout from `camp/layout.js` and the helpers from `camp/util.js`; don't paste a copy into a module. `fur.js` in the app folder is a generated copy: edit `shared/fur.js`, then run `npm run sync-shared`.

**URL options** (`camp.html?name=value`): the table at the top of `camp/core.js`, `OPT`, lists each one with its values and default. In short: the look (`detail`, `lm`, `fur`, `slothmat`), what is in the camp (`jeep`, `lived`, `op`, `campsloths`, `seed`), the day (`time`, `cycle`, `weather`), where you start (`pos`, `yaw`, `pitch`), sound (`sound`, `station`), and `lab` and `touch` for testing.

**Generators** (`props/`, Blender bpy). The builders make the props' GLBs: `props/camp/build_camp.py` (the camp set), `props/jeep/build_jeep.py`, `props/lived/build_*.py` (the lived-in props, the fire, the laundry). `props/lib/` is their shared library (`mesh.py`, `materials.py`, `bake.py`, `export.py`, which prints the triangle count per object). `props/bake_all.py` makes every baked light from one place: `layout` (the clearing's layout from the live page, `props/shadow/export_casters.cjs`), `light` (`props/camp/bake_camp_lightmap.py`, one Blender scene), `ktx` and `ground` (`props/ground/bake_ground.py`). Only the GPU thread runs the bakes; other sessions run at most `python props/bake_all.py --only layout`. The archived prop styles stay in `props/*/archive/`.

**Tools** (`tools/`, from the repo root after `npm install`):

- `npm run replay` (`tools/camp-replay.cjs`): runs the camp headless on a virtual clock with seeded randomness for 480 frames (`--frames 300` for a quicker run), walks a short tour (boop, feed, night, rain, sit) and prints a fingerprint of the scene, the draws, the shader programs and any errors. It and the scenario tours are optional diagnostics, not gates: comparing two runs of the same code is still useful, but a clean-up may change the camp's behaviour, and the fingerprint with it. `--shots dir` saves screenshots, `--compare dirA dirB` compares two runs' shots.
- `npm run scenarios` (`tools/camp-scenarios.cjs`): the scenario tours in `tools/tours/` (the operator's day, the sloths' trips, the jeep, the chores, a phone view...), each a state dump per step, run against two checkouts and compared. The header says how to run base against head; differences are something to look at, not a failure in themselves.
- `tools/camp-page.cjs`: the headless set-up both of them share (Chromium on SwiftShader, three.js from node_modules, the virtual clock). `CAMP_GPU=1` makes it use the machine's real GPU instead (on a GPU machine such as Adriaen's desktop).
- `tools/camp-probe.cjs`: draw calls, triangles per object, shader programs, downloads, textures and the time to ready of one camp page (`PORT=` picks its port, `ROOT=` serves another checkout). The counts are exact under SwiftShader; its fps is not.
- `tools/camp-gpu.cjs`: real-GPU frame times, start-up times, draws and a screenshot (`--phone` for the phone view). Run it on Adriaen's desktop through Remote Control.
- `tools/gen_fingerprint.py`: the same kind of fingerprint for a `props/` generator, run in bpy.
- `tools/sync-shared.cjs`: `npm run sync-shared` / `npm run check-shared` for the `shared/` copies.

A Canopy Camp clean-up PR checks the player's experience: the camp loads with no page or console errors, the interactions still work (the replay's tour, or by hand), screenshots at phone and desktop size look no worse, `camp-probe.cjs` shows no more draws, triangles or programs than main, and `camp-gpu.cjs` on the desktop shows no slower frames. Replays and scenarios are optional. Keep cloud runs short (a few hundred frames); long runs and play-tests go to Adriaen's desktop. The coding rules are in `docs/CODING-STANDARDS.md`.

## Run and check

```bash
git clone --recurse-submodules https://github.com/adrver1/sloth   # or: git submodule update --init
npm install                    # three, playwright
npm run serve                  # http://localhost:8765/apps/karaoke/index.html
```

To pick up character changes from desk-at-night, run `git submodule update --remote engine` and commit the new pin.

Screenshots use Playwright with SwiftShader (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). On a page, `?still` with `window.__beat` sets the karaoke song position, and `window.__cam=[x,y,z,tx,ty,tz]` sets the camera.

To make stickers, keep the server running and do the following:

```bash
node stickers/renderer/stk_run.cjs        # still frames to stickers/renderer/raw
python3 stickers/renderer/stk_post.py     # cut-out WebP files to stickers/renderer/out
node stickers/renderer/stk_anim.cjs       # animated frames
python3 stickers/renderer/stk_anim_post.py
```

To rebuild the sloth in Blender, run `python characters/sloth_baby/build_sloth_baby.py` with bpy installed. It needs `libegl1`, and it loads the kit from `engine/`. Then pack it for a page: run `npm ci` once in `engine/web`, then `node engine/web/scripts/pack_chars.mjs --own <out dir> characters/sloth_baby/sloth_baby.glb`. The ponytail and bearded models are built and packed in desk-at-night the same way, from `engine/characters/*/build_*.py`.

The base64 `.txt` models next to each app are generated page copies, not source.
