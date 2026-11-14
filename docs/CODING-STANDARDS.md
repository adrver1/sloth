# Coding standards: Canopy Camp and its generators

These are the rules for `apps/canopy-prototype/` (the camp page, `camp.html` and `camp/`), its Blender generators in `props/` and the sloth's source in `characters/sloth_baby/`. They describe the code as it is after the section C clean-up of the 2026-11-13 review (status as of 2026-11-14). Each rule says why it exists, meaning which kind of problem the reviews found, and where the canonical example lives. When the code and this file disagree, read the code, then fix whichever one is wrong.

The review state (what was found, what is fixed, what is open) is in `docs/reviews/code-review-2026-11-13/REVIEW-STATE.md`. The findings these rules refer to (ids such as `crosscut-03`) are in `docs/reviews/code-review-2026-11-13/findings.json`, with their status in `status.json`.

## 1. Layout values live in `camp/layout.js`

- Rule: every place, radius and distance that more than one module or the bake uses is exported from `apps/canopy-prototype/camp/layout.js`. Import it; never type the number again in another module, a comment or a test.
- Why: the seat ring, crate, pot and wood pile were typed by hand in up to five modules and again in the bake, and drifted (C1: world-12, props-06, crosscut-10, operator-12, genbake-14).
- `layout.js` holds only numbers, vectors and pure functions: no scene, no DOM, no random numbers. Units are metres, y is up, the fire is at the origin.
- Example: `SEATS` in `camp/layout.js`, the log seats round the fire, read by `campProps.js`, `linger.js`, `places.js`, `operator/places.js` and `sloth/spots.js`.

## 2. Shared helpers, no copies

- Rule: a helper used by two modules lives in `camp/util.js` (small stateless helpers) or `camp/actor.js` (what the sloths and the operator share). Before writing a helper, grep these two files. Never paste a copy into a module.
- Why: the review found pasted copies of smoothstep, canvas textures, base64 decoding, yaw maths and clip cross-fades that had drifted apart (world-15, crosscut-09, crosscut-13, operator-09, operator-23).
- `util.js` runs nothing on import, so the shared modules outside `camp/` (`ground.js`, `atmosphere.js`) can import it too. Its header lists every helper with its signature: `V`, `sstep`, `rand`, `lcg`, `canvasTex`, `polyDist`, `lineDist`, `tris`, `trisIn`, `wrapPi`, `yawTo`, `yawFrom`, `ease`, `lam`, `patchMaterial`.
- `actor.js` is stateless functions over the object and numbers they are handed: `aimBone`, `crossFade`, `makeZ`, `zAt`. Each character keeps its own constants.
- A shader hook added to a material that may already have one goes through `util.js` `patchMaterial(mat, id, hook)`, which chains the hooks and puts each one's source in the program cache key. A material's only hook may set `onBeforeCompile` directly (`core.js` `leafMat`, `sky.js`, `ground.js`); three then keys the program on the hook's source. So never write a value into the shader text with a template literal: pass it as a uniform (`leafMat`'s `uSway`), or give the material its own `customProgramCacheKey` (`fur.js`). Otherwise two materials with different values share one program and one value (props-12, fixed in 9800b8e).
- The generators have the same rule for Python: helpers live in `props/lib/` (section 11).

## 3. Imports, not window globals

- Rule: modules talk through ES imports and exports only. No module reads or writes `window.__` names except `camp/debug.js`, which sets them all in `ready()` for the headless tools and lists each name with the tool that reads it.
- Why: 36 `window.__` globals had become the real API between modules, so a missing one failed silently and modules depended on load order (C2: crosscut-03, boot-04, props-08, sloths-31, operator-19).
- A new tool hook goes into `debug.js`'s `ready()` and its header table, with the tool that reads it. If no tool reads it, do not add it.
- A module's API is a named export object when it has several members, for example `jeepApi` (`jeep.js`), `seatApi` (`jeepSeat.js`), `carApi` (`car.js`), `slothLife` and `labApi` (`sloth/hooks.js`), `acts` (`chores.js`). Each object is built in its own module; no other module adds members to it.
- Example: `apps/canopy-prototype/camp/debug.js`.

## 4. Importing builds nothing; `main.js` sets the build order

- Rule: importing a camp module adds nothing to the scene, adds no DOM element or listener and draws no seeded random number. A module that makes part of the camp exports a build function (`buildForest`, `buildSloths`, `initInput`, `initAudio`, `wireSettings`...), and `main.js` calls it in its one commented build list.
- Why: modules used to build at import, so the camp depended on the order of `import "./x.js"` lines, which broke when imports were tidied (crosscut-14, boot-03, crosscut-06).
- Each line of the build list has a comment naming its module and which earlier steps it needs. A new step goes after the steps whose parts it uses; say which in its comment.
- No order-only imports (`import "./x.js";` with no names). If a module needs another to be built first, put the call in the right place in `main.js`.
- Do not read another module's value at import time if that value is set by a build function. `radio.js` reading `audio.stations` at load stopped the camp from loading (fixed in de182a2); read it when it is needed.
- Known exceptions:
  - `camp/core.js` is the base every module imports. At import it makes the renderer, the scene with its fog, the camera, the hemisphere light and the sun, adds them to the scene, and starts every download in `PRE`.
  - `camp/save.js` reads its localStorage key and adds its `pagehide` and `visibilitychange` listeners at import. It builds nothing.
  - `camp/lab.js`, the move lab, is loaded on demand by `labButton.js` (a dynamic `import()`), so it builds its panel, its path line and its listeners at import.
- Shared materials, geometries and canvas textures made at import (for example in `canister.js`, `food.js`, `forest.js`, `activities/parts.js`) are allowed: they add nothing to the scene until a build function uses them.
- Example: the build list at the top of `apps/canopy-prototype/camp/main.js`.

## 5. Per-module step functions; what the frame loop may contain

- Rule: each module that changes something every frame exports a step function (`slothsStep(dt)`, `opStep(dt)`, `fireStep(dusk)`, `daylightStep(dt, wet)`...) or an object with `update`/`step`. `main.js`'s `renderer.setAnimationLoop` callback only calls those, in one fixed, commented order, then renders and runs the fps panel and resolution safety net.
- Why: `main.js` used to hold other modules' per-frame logic inline, and some values were read one frame late because of the order (C5, boot-06).
- New per-frame work goes into the owning module's step, not into `main.js`. If its order matters, say why in the comment beside the call (the light is set before the fire, the pools and the lanterns read it).
- A step that has nothing to do returns at once (for example, `labStep` while the lab is closed, `campStep` with `?campsloths=0`). Do not allocate per frame: reuse vectors and quaternions held at module level (see `actor.js`).

## 6. One named random stream per system

- Rule: seeded randomness comes from `core.js` `rng(name)`, one stream per system: `sky`, `forest`, `props`, `daylight`, `sloths` (all of `sloth/`), `operator` (all of `operator/`), `fx`. The same name returns the same stream. Use `R(a, b)` or `rnd()` from that stream.
- Why: one shared stream meant that drawing one more number anywhere moved every tree and sloth after it, and texture noise depended on the detail level (world-13, sloths-35, props-10, genbake-20).
- Noise that must not touch any seeded stream uses `util.js` `rand(a, b)` (Math.random). A private repeatable stream uses `util.js` `lcg(seed)`.
- Do not change the forest's stream (`rng("forest", 3000 + seed)`) or the order of its draws without a rebake: the trees and their root mounds are in the light and ground bakes.
- Example: `rng` in `apps/canopy-prototype/camp/core.js`.

## 7. URL options and storage keys go through `core.js`

- Rule: every URL option is parsed once in `core.js` `OPT` and listed in the table above it (values, default, who reads it). Every localStorage key is in `core.js` `KEYS`, and is read and written through `core.js` `store` (which survives blocked storage). No other camp module reads `location.search` or calls `localStorage` directly.
- Why: 18 options and 6 keys were read in 7 files with three parsing styles and no list (boot-17, crosscut-15). A value that is not valid must fall back to the default (`?yaw=abc` once made the view blank fog).
- Known exceptions: `fur.js` reads `?fur=` itself because other pages share it; `save.js` owns `KEYS.save` and stores one part per owner (`load(part)`, `save(part, data)`).
- A new option: add it to `OPT` and the table, validate it there, and do not copy the table into the README (it points to `core.js`).

## 8. Tap targets and places

- Rule: anything that lights up and opens a menu is registered in `camp/targets.js` with `addTarget(key, make)` (a single thing) or `addTargets(kind, list)` (a set: `things`, `sloths`, `doors`) by the module that owns it. `input.js` does the lighting and the menus.
- Why: log seats were described in five modules and tapped through competing targets (operator-14, boot-08).
- Rule: who holds a seat, a bed or a spot goes through `camp/places.js`: `claim(place, who)`, `release(place, who)`, `holder`, `taken`, `host`/`join`, and `addMover`/`addCrowd`/`movers` for walkers. The log seats' and the tent beds' keys come from `seatKey(i, left)` and `bedKey(i)`; do not build those by hand. The jeep's places are fixed strings: `"jeep:driver"` and `"jeep:passenger"` (`jeepSeat.js` `holdSeat`, read by `sloth/day.js`), `"jeep:hood"` (the engine fix, `sloth/day.js` and `sloth/fix.js`) and `"jeep:P"` (a sloth's guest spot, `sloth/spots.js`).
- Why: the registry lived inside the sloths and was reached through `window.__campLife`, and characters sat on each other (operator-10, sloths-30, operator-15).
- The operator's own wrappers are named `claimPlace` and `releasePlace` (`operator/places.js`) so they are not confused with `places.js`'s `claim` and `release`. Other modules import `claim` and `release` under those names; do not rename them on import.

## 9. One job per module, and size

- Rule: a module does one job, which its header can say in one sentence. When a module grows past about 400 lines or 25 KB, or gains a second job, split it into a folder with the old file as the way in.
- Why: the 910-line `sloths.js`, the 46 KB `audio.js` and the five-job `campLife.js` were hard to read and to change safely (sloths-29, operator-15, operator-17).
- Examples: `camp/sloths.js` with `camp/sloth/`, `camp/operator.js` with `camp/operator/`, `camp/audio.js` with `camp/audio/`.
- Still large: `apps/canopy-prototype/ground.js` (476 lines, 47 KB) and `camp/forest.js` (31 KB, split into nine named steps called by `buildForest`). Split them when you next change them a lot.

## 10. File headers

- Rule: every source file starts with a comment that says what it does, what it exports (one line per export, with its signature when it takes arguments), which review findings shaped it, and anything a reader must know before changing it (order, options, units). Python files use the module docstring.
- Why: stale headers and comments that described removed features were one of the most common findings (crosscut-16, boot-22, boot-23, sloths-23, operator-24, world-25, genbake-12, gencamp-19, genlived-16).
- Not every file meets this yet. Known gaps (headers that do not list every export): `core.js` (21 exports), `layout.js` (`RC`, `FAR`, `SUN`, `HERO`, `JEEP_AT`, `TENT`, `HAMMOCK`, `CRATE` and more), `jeep.js` (described in a later block), `food.js`, `highlight.js`, `lanterns.js`, `sky.js`, `weather.js`, `audio/context.js`, `activities/parts.js`. Every new file follows the rule, and a file you change gets its header brought up to it in the same commit.
- When you change what a file does or exports, update its header in the same commit. Write plain, full sentences. Do not leave comments about code that is gone; git history keeps it.
- Read `head -30` of a file before reading it whole. Examples: `camp/util.js`, `camp/targets.js`, `camp/debug.js`, `props/lib/__init__.py`.

## 11. `fur.js` is edited only in `shared/`

- Rule: edit `shared/fur.js`, then run `npm run sync-shared` (`tools/sync-shared.cjs`) to rewrite the copies in each app folder. `npm run check-shared` exits 1 if a copy differs.
- Why: there were six copies in three variants (props-11, hygiene-14). Each app folder is published on its own, so it needs its own copy.
- The copies start with a `GENERATED from shared/fur.js` line. Never edit them.

## 12. Generators (`props/`, `characters/sloth_baby/`)

- Rule: shared Blender helpers live in `props/lib/` (`mesh.py`, `materials.py`, `bake.py`, `export.py`). Scripts import them by path (`sys.path.insert(0, <props>)`, then `from lib.mesh import ...`). Never monkey-patch another script's function or `exec` another script.
- Why: `build_camp.bake` and `densify` were patched from six places, so results depended on which script was imported last (C3: gencamp-02, genlived-06, genbake-18, genlived-09).
- Rule: a builder has `make()`, which only creates its objects in the current scene and returns them (no reset, no light, no export), and `build(...)`, which resets, makes, lights and exports. Examples: `make()` and `build()` in `props/lived/build_fire.py`, `build_laundry.py`, `build_lived.py`. `props/camp/build_camp.py` `picked()` is the camp set's equivalent.
- Rule: the light bake reads the layout from the live page. `props/shadow/export_casters.cjs` writes `props/shadow/layout_picked.json` (its `place` block), and `props/camp/bake_camp_lightmap.py` places everything from it. The bake keeps no copy of the layout, with two values typed again: the sun's direction (the bake stops if the two differ) and the lantern drop, `PAGE_LANTERN_DROP = 0.125` in `bake_camp_lightmap.py`, which is `lanterns.js` `JAR_Y` with no check (the bake hangs the light 0.12 m down on purpose, review props-07, still partly fixed). Exporting `JAR_Y` through `layout_picked.json` would remove the second copy; keeping the bake's 0.12 m offset, it needs no rebake.
- Rule: each baked prop says where it stands with tags set in its builder's `make()` (`props/lib/export.py` `tag`, written as glTF extras and read on the page as `userData`): `anchor`, a key of `camp/layout.js` `ANCHORS` or `"seats"` (one copy per log seat), and the flags `thin`, `no_shadow`, `unlit`, `unbaked`; a material that glows at night has the `glow` property. The bake (`stand`) and the page (`campProps.js` `stand`) place every node from its tags, so a new prop needs only its tag, and a new place a key in `ANCHORS` (review R2-249). Never place a baked prop by its name.
- Rule: never hand-edit a generated file: GLBs, base64 `.txt` models, light maps, `layout_picked.json`, the `fur.js` copies. Change the script and regenerate.
- Rule: bakes run only on Adriaen's desktop GPU, through the GPU bake thread, with `props/bake_all.py`. Other sessions run at most `python props/bake_all.py --only layout`. To see a change's light before the GPU run, a session may run the CPU preview, `bake_camp_lightmap.py -- --preview`, which writes only to the git-ignored `apps/canopy-prototype/lmpreview/` (view it with `camp.html?lmdir=lmpreview`). If a change needs a rebake (a prop moved or reshaped, the forest's stream changed), say so in the PR or report instead of baking. A prop changed alone can be baked alone: each prop has its own rectangle of the light map (`props/camp/atlas.json`), and `props/bake_all.py --only light --objects Name,...` bakes just those props into theirs (review R2-149). A builder must make the same mesh every run (sort what `remove_doubles` leaves, as `build_fire.py` `lathe` does), or its light-map UVs move. `python props/bake_all.py --check` lists the steps whose inputs changed since their last run, from the stamps in `props/bake.lock.json` (review R2-140); commit that file with the outputs.
- The sloth: `characters/sloth_baby/build_sloth_baby.py` and `sloth_rig.py` are the source of its GLBs. The character kit, the ponytail engineer and the bearded operator live only in desk-at-night (`engine/` submodule); never copy them into this repo.

## 13. Triangles and painted detail

- Rule: use as few triangles as still looks good (Adriaen 2026-11-11, CLAUDE.md). Spend them on silhouettes and things seen up close; paint detail into colours or textures (bamboo rings, planks, log stacks) instead of modelling it. No hidden detail: no subdividing for AO bakes, no caps nobody sees, no high segment counts on small parts.
- Why: geometry that nobody sees costs phone frame time and bake time.
- Every export prints a triangle count per object (`props/lib/export.py` `report`, called by `export_glb`); at run time `util.js` `trisIn` gives each prop's count. Say the counts when you show a change. Examples of painted detail: `painted_bamboo` in `props/camp/build_camp.py`, `props/lived/wood_stack.jpg`.

## 14. Archives

- Rule: retired asset variants are kept, not deleted: `props/camp/archive/` (the Storybook, Rustic and Jungle camp sets and the first picked GLB), `props/jeep/archive/` (the Toy and Camper jeeps). Their builders may stay in the generator (`build_camp.py` keeps one function per prop). Keep the sloth styles `plush`, `baby` and `plush_real`, and the flat sticker set.
- Rule: the page has no branches for retired options. When an option is archived, remove its code paths from the page; the asset stays in `archive/` and the code stays in git history.
- Why: about 45 branches served the retired looks and prop sets (crosscut-17, world-04, gencamp-08).

## 15. How to check a change

Adriaen, 2026-11-14: a change, including a clean-up, need not keep the camp byte-for-byte the same. It must not make the player's experience worse.

- The camp loads with no page or console errors. Interactions still work (walk, boop, feed, sit, the menus, the jeep), and no character gets stuck or clips.
- Screenshots at phone size (390×844) and desktop size (1280×800) look no worse. Show them to Adriaen.
- Performance is no worse than main. In the cloud, `tools/camp-probe.cjs` gives exact counts (draw calls, triangles per object, shader programs, downloads); its fps means nothing under SwiftShader. Real frame times, start-up time and draws come from `tools/camp-gpu.cjs` (`--phone` for the phone view) on Adriaen's desktop through Remote Control.
- `npm run replay` (`tools/camp-replay.cjs`) and `npm run scenarios` (`tools/camp-scenarios.cjs`) are optional diagnostics. Their fingerprints are expected to change; a difference is something to look at, not a failure. `CAMP_GPU=1` makes them use the real GPU (`tools/camp-page.cjs`) on a GPU machine.
- No long runs on the cloud CPU: keep SwiftShader runs to a few hundred frames, run at most two headless browsers at once on a shared machine, and pick ports with `PORT=` or `--port`. Long runs and play-tests go to Adriaen's desktop, in the worktrees `C:\claude\sloth-gpu` and `C:\claude\sloth-gpu-main`. Never touch `C:\claude\sloth`, which is the GPU bake thread's copy.
- If you changed anything under `camp/audio.js` or `camp/audio/`, say so: nobody in the cloud can hear audio, and Adriaen checks the mix by ear.

## 16. Review status

- Rule: when a commit fixes or changes a review finding, update its entry in `docs/reviews/code-review-2026-11-13/status.json` (status, commits, note; 1-space JSON indent), run `python3 docs/reviews/code-review-2026-11-13/build.py`, and commit `status.json` and the regenerated `findings.md` together.
- Why: the status page is generated; editing `findings.md` by hand is lost on the next build.
- Commit in small steps, each one loading on its own, with plain, full-sentence messages.
