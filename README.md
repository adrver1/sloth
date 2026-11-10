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
| `stickers/renderer/` | The sticker renderer page and its scripts (still and animated, 512×512 WebP). | |
| `stickers/packs/` | The finished sticker zips (furry, flat, animated, hearts) and the family sticker. | |
| `characters/sloth_baby/` | The sloth: `build_sloth_baby.py` and `sloth_rig.py`, plus the exported GLBs. The live look is `plush_real`. | |
| `engine/` | The desk-at-night repo as a git submodule (shallow, branch `main`). It provides the character kit (`engine/characters/_shared`), the ponytail engineer and the bearded operator the sloth plays with, and `engine/web/scripts/pack_chars.mjs`. Nothing from it is copied here. | |

Each app is a static page. Its models sit next to it as base64 `.txt` files, and it shares `fur.js` (shell fur) with the other apps. Three.js 0.186.1 loads from jsDelivr.

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
