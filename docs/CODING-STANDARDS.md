# Coding standards: Canopy Camp and its generators

These are the rules for `apps/canopy-prototype/` (the camp page, `camp.html` and `camp/`), its Blender generators in `props/` and the sloth's source in `characters/sloth_baby/`. They describe the code as it is after the section C clean-up of the 2026-11-13 review and the fixes of the 2026-11-14 review (branch `fx-integ`, 2026-11-15). Each rule says why it exists, meaning which kind of problem the reviews found, and where the canonical example lives. When the code and this file disagree, read the code, then fix whichever one is wrong.

The review state (what was found, what is fixed, what is open) is in `docs/reviews/code-review-2026-11-13/REVIEW-STATE.md`. The findings these rules refer to are in `docs/reviews/code-review-2026-11-13/findings.json` (ids such as `crosscut-03`) and `docs/reviews/review-2026-11-14/findings.json` (ids such as `R2-036`), each with its status in the `status.json` beside it.

## 1. Layout values live in `camp/layout.js`

- Rule: every place, radius and distance that more than one module or the bake uses is exported from `apps/canopy-prototype/camp/layout.js`. Import it; never type the number again in another module, a comment or a test.
- Why: the seat ring, crate, pot and wood pile were typed by hand in up to five modules and again in the bake, and drifted (C1: world-12, props-06, crosscut-10, operator-12, genbake-14).
- `layout.js` holds only numbers, vectors and pure functions: no scene, no DOM, no random numbers. Units are metres, y is up, the fire is at the origin.
- The one exception is `fromModel(tent, hammock)`, which copies build_camp.py's glTF extras into `TENT` and `HAMMOCK` when `campProps.js` `buildProps` runs (R2-250). So read `TENT.W`, `DW`, `yf`, `yb`, `stove`, `chimney`, `bed` and `HAMMOCK.knot`, `ropeEnd` only inside build or step functions, never at import time (section 4).
- Rule: things the camp can have more than one of are lists of entries in `layout.js`, never one-off names: `PATHS` (footpaths), `GLADES`, `HERO` (the big mossy trees), `WEAR` (worn ground, each entry with its `set`; `wearBlockers(set)` gives that set's blocker circles) and `ANCHORS` (where tagged props stand). A second path, glade or tree is one more entry. Why: a second path, glade or big tree meant editing five files, and the worn ground was painted from blocker circles typed again by hand (R2-036, R2-255).
- Example: `SEATS` in `camp/layout.js`, the log seats round the fire, read by `campProps.js`, `places.js` and `sloth/spots.js`, and `SEAT_SLOT`, where things go along a log (read by `places.js` and `sloth/spots.js`).

## 2. Shared helpers, no copies

- Rule: a helper used by two modules lives in `camp/util.js` (small stateless helpers) or `camp/actor.js` (what the sloths and the operator share). Before writing a helper, grep these two files. Never paste a copy into a module.
- Why: the review found pasted copies of smoothstep, canvas textures, base64 decoding, yaw maths and clip cross-fades that had drifted apart (world-15, crosscut-09, crosscut-13, operator-09, operator-23).
- `util.js` runs nothing on import, so the shared modules outside `camp/` (`ground.js`, `atmosphere.js`) can import it too. Its header lists every helper with its signature: `V`, `sstep`, `rand`, `vnoise`, `lcg`, `canvasTex`, `polyDist`, `lineDist`, `tris`, `trisIn`, `wrapPi`, `yawTo`, `yawFrom`, `ease`, `timers`, `lam`, `patchMaterial`, `swap`. Delays in frame-time code go through `timers()` stepped by the owner's step, never `setTimeout` (review R2-050).
- `actor.js` is the one character layer the sloths and the operator share, stateless functions over the object and numbers they are handed: clips (`crossFade`), turning and walking (`turnYaw`, `stepAlong`, `ahead` for the walker in the way, `ringPoint` for where to wander), looks (`aimBone`, `watched` and `gazeStep` before a wave), the sleep Zs (`makeZ`, `zAt`) and eating (`bite`). Each character keeps its own state machine and constants (how fast it turns, how much a bite takes), passed in (R2-212). A new piece of behaviour both have goes here, not into one character.
- A shader hook added to a material that may already have one goes through `util.js` `patchMaterial(mat, id, hook)`, which chains the hooks and puts each one's source in the program cache key. A material's only hook may set `onBeforeCompile` directly (`forest/cards.js` `leafMat`, `sky.js`, `ground.js`); three then keys the program on the hook's source. So never write a value into the shader text with a template literal: pass it as a uniform (`leafMat`'s `uSway`), or give the material its own `customProgramCacheKey` (`fur.js`). Otherwise two materials with different values share one program and one value (props-12, fixed in 9800b8e).
- Every shader hook edits three's source through `util.js` `swap(src, [anchor, text], ...)`, never a bare `.replace()`: a missing anchor (after a three upgrade, say) then warns once on the console instead of silently dropping the baked sun shadow or the light mix (R2-037). `shared/fur.js` uses its own copy of `swap`, since other pages share it and cannot import `camp/util.js`.
- The generators have the same rule for Python: helpers live in `props/lib/` (section 11).

## 3. Imports, not window globals

- Rule: modules talk through ES imports and exports only. No module reads or writes `window.__` names except `camp/debug.js`, which sets them all in `ready()` for the headless tools and lists each name with the tool that reads it.
- Why: 36 `window.__` globals had become the real API between modules, so a missing one failed silently and modules depended on load order (C2: crosscut-03, boot-04, props-08, sloths-31, operator-19).
- A new tool hook goes into `debug.js`'s `ready()` and its header table, with the tool that reads it. If no tool reads it, do not add it.
- A module's API is a named export object when it has several members, for example `jeepApi` (`jeep.js`), `seatApi` (`jeepSeat.js`), `carApi` (`car.js`), `slothLife` and `labApi` (`sloth/hooks.js`), `acts` (`chores.js`). Each object is built in its own module; no other module adds members to it.
- A signal between modules that do not import each other (the chores and the operator's remarks, the soup and the sloths) goes through `camp/events.js` `on(name, fn)` and `emit(name, detail)`, with its name and detail listed in that file's header. No `window` events (review R2-031).
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
- Shared materials, geometries and canvas textures made at import (for example in `pail.js`, `food.js`, `forest.js`, `activities/parts.js`) are allowed: they add nothing to the scene until a build function uses them.
- Example: the build list at the top of `apps/canopy-prototype/camp/main.js`.

## 5. Per-module step functions; what the frame loop may contain

- Rule: each module that changes something every frame exports a step function (`slothsStep(dt)`, `opStep(dt)`, `fireStep(dusk)`, `daylightStep(dt, wet)`...) or an object with `update`/`step`. `main.js`'s `renderer.setAnimationLoop` callback only calls those, in one fixed, commented order, then renders and runs the fps panel and resolution safety net.
- Why: `main.js` used to hold other modules' per-frame logic inline, and some values were read one frame late because of the order (C5, boot-06).
- New per-frame work goes into the owning module's step, not into `main.js`. If its order matters, say why in the comment beside the call (the light is set before the fire, the pools and the lanterns read it).
- A step that has nothing to do returns at once (for example, `labStep` while the lab is closed, `campStep` with `?campsloths=0`). Do not allocate per frame: reuse vectors and quaternions held at module level (see `actor.js`).

## 6. One named random stream per system

- Rule: seeded randomness comes from `core.js` `rng(name)`, one stream per system: `sky`, `forest`, `props`, `daylight`, `sloths` (where the sloths are placed: `sloths.js` and `sloth/body.js` `makeSloth`), `slothDay` (their run-time timers, the rest of `sloth/`, review R2-117), `operator` (all of `operator/`), `fx`. The same name returns the same stream. Use `R(a, b)` or `rnd()` from that stream.
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

- Rule: anything that lights up and opens a menu is registered in `camp/targets.js` with `addTarget(key, make)` (a single thing) or `addTargets(kind, items, make)` (a set: `things`, `sloths`, `doors`; `items()` hands back the same array while the set is unchanged) by the module that owns it. `input.js` does the lighting and the menus. One object has one target: a module that adds something to do with another module's thing adds an option to that target with `addOption(key, { ready, options })` (`chores.js` puts "Set the bowl down" on the log seat's target from `linger.js`), and never registers a second target on the same object. A thing with one obvious use may give its target `tap()`, which a tap runs at once instead of opening the menu (`trip.js`'s karaoke sign).
- Why: log seats were described in five modules and tapped through competing targets (operator-14, boot-08, R2-209).
- Rule: who holds a seat, a bed or a spot goes through `camp/places.js`: `claim(place, who)`, `release(place, who)`, `holder`, `taken`, `host`/`join`, and `addMover`/`addCrowd`/`movers` for walkers. The log seats live in one table, `places.js` `logSeats()`, built once from `Seat_<i>`: each seat's middle, its axis, its slots (where you, the operator and Sunny sit, each with its key) and its two ends (where a bowl goes, held as `"bowl"`; `endFree(end)`). Read a seat's places from it instead of finding the logs or measuring them again (R2-209). Other keys for the log seats and the tent beds come from `seatKey(i, part)` and `bedKey(i)`; do not build those by hand. The jeep's places are fixed strings: `"jeep:driver"` and `"jeep:passenger"` (`jeepSeat.js` `holdSeat`, read by `sloth/day.js`), `"jeep:hood"` (the engine fix, `sloth/day.js` and `sloth/fix.js`) and `"jeep:P"` (a sloth's guest spot, `sloth/spots.js`).
- Why: the registry lived inside the sloths and was reached through `window.__campLife`, and characters sat on each other (operator-10, sloths-30, operator-15).
- Rule: what keeps plants, props and characters apart is the blocker list in `campProps.js`, changed only through `addBlocker({ at, r, walk, wild, tag })` and `dropBlockers(tag)`; never push to or splice the array. `blockersVersion()` counts the changes, and `nav.js` rebuilds the sloths' grid when it moves. Why: blockers were one shared array of `[centre, radius]` pairs with ad-hoc flags, filled and spliced by five modules, and the grid noticed a change only by the count (R2-038, R2-113).
- The operator's own wrappers are named `claimPlace` and `releasePlace` (`operator/places.js`) so they are not confused with `places.js`'s `claim` and `release`. Other modules import `claim` and `release` under those names; do not rename them on import.

## 9. One job per module, and size

- Rule: a module does one job, which its header can say in one sentence. When a module grows past about 400 lines or 25 KB, or gains a second job, split it into a folder with the old file as the way in.
- Why: the 910-line `sloths.js`, the 46 KB `audio.js` and the five-job `campLife.js` were hard to read and to change safely (sloths-29, operator-15, operator-17).
- Examples: `camp/sloths.js` with `camp/sloth/`, `camp/operator.js` with `camp/operator/`, `camp/audio.js` with `camp/audio/`.
- Still large: `apps/canopy-prototype/ground.js` (531 lines, 53 KB). Split it when you next change it a lot. `camp/forest.js` is split the same way: its steps live in `camp/forest/`.

## 10. File headers

- Rule: every source file starts with a comment that says what it does, what it exports (one line per export, with its signature when it takes arguments), which review findings shaped it, and anything a reader must know before changing it (order, options, units). Python files use the module docstring.
- Why: stale headers and comments that described removed features were one of the most common findings (crosscut-16, boot-22, boot-23, sloths-23, operator-24, world-25, genbake-12, gencamp-19, genlived-16).
- Not every file meets this yet. Known gaps (headers that do not list every export): `core.js` (21 exports), `layout.js` (`RC`, `FAR`, `SUN`, `HERO`, `JEEP_AT`, `TENT`, `HAMMOCK`, `CRATE` and more), `food.js`, `highlight.js`, `sky.js`, `weather.js`, `audio/context.js`, `activities/parts.js`. Every new file follows the rule, and a file you change gets its header brought up to it in the same commit.
- Rule: a `//` comment ends its line. When you add a trailing comment or join lines, never leave code after it, and keep one statement per line where a comment follows. Why: twice a new trailing comment swallowed the statement after it, which silently stopped the moon fading in and broke the tours' `acts` and `car` getters (R2-077, R2-121).
- When you change what a file does or exports, update its header in the same commit. Write plain, full sentences. Do not leave comments about code that is gone; git history keeps it.
- Read `head -30` of a file before reading it whole. Examples: `camp/util.js`, `camp/targets.js`, `camp/debug.js`, `props/lib/__init__.py`.

## 11. `fur.js` is edited only in `shared/`, and shared models stay equal

- Rule: edit `shared/fur.js`, then run `npm run sync-shared` (`tools/sync-shared.cjs`) to rewrite the copies in each app folder. `npm run check-shared` exits 1 if a copy differs.
- Why: there were six copies in three variants (props-11, hygiene-14). Each app folder is published on its own, so it needs its own copy.
- The copies start with a `GENERATED from shared/fur.js` line. Never edit them.
- The other pages' `models/sloth.txt` (five folders) and `models/ponytail.txt` (two) are in `sync-shared.cjs` `SAME`: the first folder listed holds the source; repack it, then run `npm run sync-shared`. Canopy Camp's own `sloth.txt` is a newer pack on purpose and is not in the group (R2-223).

## 12. Generators (`props/`, `characters/sloth_baby/`)

- Rule: shared Blender helpers live in `props/lib/` (`mesh.py`, `materials.py`, `bake.py`, `export.py`, `audit.py`). Scripts import them by path (`sys.path.insert(0, <props>)`, then `from lib.mesh import ...`). Never monkey-patch another script's function or `exec` another script.
- Why: `build_camp.bake` and `densify` were patched from six places, so results depended on which script was imported last (C3: gencamp-02, genlived-06, genbake-18, genlived-09).
- Rule: a builder has `make()`, which only creates its objects in the current scene and returns them (no reset, no light, no export), and `build(...)`, which resets, makes, lights and exports. Examples: `make()` and `build()` in `props/lived/build_fire.py`, `build_laundry.py`, `build_lived.py`. `props/camp/build_camp.py` `picked()` is the camp set's equivalent.
- Rule: the light bake reads the layout the page uses. `props/shadow/layout_pure.mjs` works it out in node from `camp/layout.js` and `camp/lanterns.js` (no browser, review R2-257); `props/shadow/export_casters.cjs` adds the deadwood from the live page (it sits on the terrain, whose root mounds come from the forest's stream), checks that the page agrees with `layout_pure.mjs`, and writes `props/shadow/layout_picked.json` (its `place` block), and `props/camp/bake_camp_lightmap.py` places everything from it. The bake keeps no copy of the layout, with one value typed again: the sun's direction (the bake stops if the two differ). The lanterns come as the points they hang from (`lanternHang`, from `lanterns.js` `lanternLayout`), and the bake hangs each light `LANTERN_DROP = 0.12` m below that, 5 mm above the page's jar centre (`JAR_Y`, 0.125 m): a deliberate offset that keeps the bake as it was (review props-07, R2-187).
- Rule: each baked prop says where it stands with tags set in its builder's `make()` (`props/lib/export.py` `tag`, written as glTF extras and read on the page as `userData`): `anchor`, a key of `camp/layout.js` `ANCHORS` or `"seats"` (one copy per log seat), and the flags `thin`, `no_shadow`, `unlit`, `unbaked`; a material that glows at night has the `glow` property. The bake (`stand`) and the page (`campProps.js` `stand`) place every node from its tags, so a new prop needs only its tag, and a new place a key in `ANCHORS` (review R2-249). Never place a baked prop by its name.
- Rule: never hand-edit a generated file: GLBs, base64 `.txt` models, light maps, `layout_picked.json`, the `fur.js` copies. Change the script and regenerate.
- Rule: bakes run only on Adriaen's desktop GPU, through the GPU bake thread, with `props/bake_all.py`. Other sessions run at most `python props/bake_all.py --only layout`. To see a change's light before the GPU run, a session may run the CPU preview, `bake_camp_lightmap.py -- --preview`, which writes only to the git-ignored `apps/canopy-prototype/lmpreview/` (view it with `camp.html?lmdir=lmpreview`). If a change needs a rebake (a prop moved or reshaped, the forest's stream changed), say so in the PR or report instead of baking. A prop changed alone can be baked alone: each prop has its own rectangle of the light map (`props/camp/atlas.json`), and `props/bake_all.py --only light --objects Name,...` bakes just those props into theirs (review R2-149). A builder must make the same mesh every run (sort what `remove_doubles` leaves, as `build_fire.py` `lathe` does), or its light-map UVs move. `python props/bake_all.py --check` lists the steps whose inputs changed since their last run, from the stamps in `props/bake.lock.json` (review R2-140); commit that file with the outputs.
- The sloth: `characters/sloth_baby/build_sloth_baby.py` and `sloth_rig.py` are the source of its GLBs. The character kit, the ponytail engineer and the bearded operator live only in desk-at-night (`engine/` submodule); never copy them into this repo.

## 13. Triangles and painted detail

- Rule: use as few triangles as still looks good (Adriaen 2026-11-11, CLAUDE.md). Spend them on silhouettes and things seen up close; paint detail into colours or textures (bamboo rings, planks, log stacks) instead of modelling it. No hidden detail: no subdividing for AO bakes, no caps nobody sees, no high segment counts on small parts.
- Why: geometry that nobody sees costs phone frame time and bake time.
- Every export prints a triangle count per object (`props/lib/export.py` `report`, called by `export_glb`); at run time `util.js` `trisIn` gives each prop's count. Every export also runs the mesh audit (`props/lib/audit.py`, review R2-021): per object it prints how many triangles are enclosed, hidden from the player, seen only from behind, flipped, degenerate or overlapping, and it stops the build on a back-only triangle or a same-facing overlap that its `KNOWN` list does not hold. Fix the fault; raise a `KNOWN` entry only when it is meant, and lower it when a fix removes faults. Quote its numbers with the triangle counts. Say the counts when you show a change. Examples of painted detail: `textured_posts` in `props/camp/build_camp.py` (the hammock posts' nodes in `bamboo.png`), `props/lived/wood_stack.jpg`.

## 14. Archives

- Rule: retired asset variants are kept, not deleted: `props/camp/archive/` (the Storybook, Rustic and Jungle camp sets and the first picked GLB), `props/jeep/archive/` (the Toy and Camper jeeps), each with a README. An archive keeps the GLB only: its base64 `.txt` copy is made again with `base64 -w0` when it is needed (R2-221). Their builders live next to them, in `props/camp/archive/build_camp_styles.py` and `props/jeep/archive/build_jeep_styles.py` (each with its command line), and import what they share with the live set from `build_camp.py` and `build_jeep.py`, which keep no branch, option or builder that only an archived style uses (R2-258). After moving a builder, check that the live and the archived builds make the same geometry as before. Keep the sloth styles `plush`, `baby` and `plush_real`, and the flat sticker set.
- Rule: the page has no branches for retired options. When an option is archived, remove its code paths from the page; the asset stays in `archive/` and the code stays in git history.
- Why: about 45 branches served the retired looks and prop sets (crosscut-17, world-04), and the archived styles' builders made up much of the live generators (gencamp-08).

## 15. How to check a change

Adriaen, 2026-11-14: a change, including a clean-up, need not keep the camp byte-for-byte the same. It must not make the player's experience worse.

- `npm run check` passes: the static checks (`tools/check-imports.cjs`, `tools/check-python.py`, `check-shared`) that CI runs on every pull request and before every deploy.
- The camp loads with no page or console errors. Interactions still work (walk, boop, feed, sit, the menus, the jeep), and no character gets stuck or clips.
- Screenshots at phone size (390×844) and desktop size (1280×800) look no worse. Show them to Adriaen.
- Performance is no worse than main. In the cloud, `tools/camp-probe.cjs` (`npm run probe`, `npm run probe:phone`, both with `--strict`, which exits 1 on any page error) gives exact counts (draw calls, triangles per object, shader programs, downloads); its fps means nothing under SwiftShader. Real frame times, start-up time and draws come from `tools/camp-gpu.cjs` (`--phone` for the phone view) on Adriaen's desktop through Remote Control.
- `npm run replay` (`tools/camp-replay.cjs`) and `npm run scenarios` (`tools/camp-scenarios.cjs`) are optional diagnostics. Their fingerprints are expected to change; a difference is something to look at, not a failure. `CAMP_GPU=1` makes them use the real GPU (`tools/camp-page.cjs`) on a GPU machine.
- No long runs on the cloud CPU: keep SwiftShader runs to a few hundred frames, run at most two headless browsers at once on a shared machine, and pick ports with `PORT=` or `--port`. Long runs and play-tests go to Adriaen's desktop, in the worktrees `C:\claude\sloth-gpu` and `C:\claude\sloth-gpu-main`. Never touch `C:\claude\sloth`, which is the GPU bake thread's copy.
- If you changed anything under `camp/audio.js` or `camp/audio/`, say so: nobody in the cloud can hear audio, and Adriaen checks the mix by ear.

## 16. Review status

- Rule: when a commit fixes or changes a review finding, update its entry in the review's `status.json` in the same commit (1-space JSON indent). First review (`crosscut-03` style ids): `docs/reviews/code-review-2026-11-13/status.json`, then run `python3 docs/reviews/code-review-2026-11-13/build.py` and commit the regenerated `findings.md` with it. Second review (`R2-NNN`): `docs/reviews/review-2026-11-14/status.json` (status, one-sentence note, commits, needs_rebake), its `counts`, and section 1 of `REVIEW-STATE.md`. A change that shows only after the GPU rebake is `waiting_rebake` until the rebaked models are committed.
- Why: the status page is generated; editing `findings.md` by hand is lost on the next build.
- Commit in small steps, each one loading on its own, with plain, full-sentence messages.
