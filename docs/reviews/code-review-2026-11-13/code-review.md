# Canopy Camp code review (2026-11-13)

What I looked at: the camp page (`camp.html`, the 23 modules in `apps/canopy-prototype/camp/`, and the shared `activities.js`, `atmosphere.js`, `bakedlight.js`, `ground.js`, `fur.js`), the generators and bakes (`props/camp`, `props/lived`, `props/jeep`, `props/ground`, `props/shadow`, `props/bake_all.py`), and the repo itself (git, Pages, tools, README). Ten reviewers read every file and wrote 267 findings with file and line; the full list is in [findings.md](findings.md). This page ranks them and says what to do first. It builds on the 2026-11-12 audit ([camp-review.md](../canopy-camp-review-2026-11-12.md)) and only repeats its items where they are still open.

The goal set for this pass: code that is cleanly separated, easy to maintain and to grow, with no stale or duplicate functions or sections.

Numbers marked **measured** were timed here (cloud machine, CPU only, Blender 5.3, headless Chromium with SwiftShader). Numbers marked **estimate** were not.

## The short answer

1. **The generators are not slow because of their Python.** Building every mesh takes a few seconds. The time goes into Cycles: renders that are redone when nothing changed, samples spent on a 4K map that is never published, about 195 separate Cycles sessions per bake, and possibly the CPU instead of the GPU (see G1). The geometry scripts are messy (monkey-patching, `exec`, copies of helpers) but that costs maintainability, not minutes.
2. **The camp page has five real bugs**, all small: WASD did nothing on a computer since the module split, the hammock lost its baked light, the dead trunk was missing from the bake, sloths could get stuck (card game, eating), and a wild sloth left your gift in the air. All are fixed on the branch except the dead trunk, which needs a rebake.
3. **The split into modules is only half done.** The 2026-11-12 split cut one long script at its section headers, so the modules still behave like one script: they talk through 36 `window.__` globals, rely on import order and a shared random stream, and the camp layout is typed by hand in up to six places and again in the bake. This is the main thing that makes the camp hard to grow, and fixing it changes how modules are split, so it needs your go-ahead (section C).
4. **A good part of the code still serves options that were retired**: the Painterly and Low-poly looks (about 45 branches), the baked jeep cabin light (still sampled every frame, always times zero), the Rustic and Jungle prop sets (39 % of `build_camp.py`), the old fire sprites and firefly cloud. Some of it is now removed; the rest is listed in section D.

## A. Already fixed on branch `claude/project-thread-n6c974`

Every clean-up was checked with a new replay tool (`npm run replay`, `tools/camp-replay.cjs`): it runs the camp on a virtual clock with fixed random numbers, walks a 480-frame tour (walk, boop, feed, sit, change time and weather), and prints a fingerprint of every object's position, visibility and material, plus screenshots. "Same picture" below means the fingerprint and screenshots are identical before and after.

| Fix | Result | Check |
|---|---|---|
| WASD and arrow keys walk again (the split dropped the key listeners) | bug fix | walked in a headless page |
| Base64 models and light maps decode with one shared helper | 139 ms to 8 ms for the 3 MB light map, **measured**; one fetch of `camp_lights.json` instead of two | same picture |
| Light shafts and track overlays draw in one pass | 138 to 129 draws a frame, and no shader re-keying each frame, **measured** | same picture |
| Dead code removed: ground shade disc, kettle steam, unused forest materials and exports, `__back`, food and deadwood leftovers, 7 duplicate imports | 50 lines out, 21 in | same fingerprint |
| Ground bake works out each path only near it | 39 s to 10 s, byte-identical output, **measured** | same files |
| Wood stack renders are cached (`props/lived/wood_stack.json`) | light bake set-up 25 s to 4 s, byte-identical `lived.glb`, **measured** | same files |
| Layout step writes only the layout, and stops on a broken one | no unused casters GLB, no silent empty layout | byte-identical layout |
| `bake_all.py --only ktx` no longer globs the old jeep maps | | |
| Hammock keeps its baked night light (its sway shader dropped the light-map hook) | visible at night | before and after in the project files (review/code-review/) |
| Dead trunk is seated, counted and in the bake layout again (a comment had swallowed its line) | **needs a light rebake** | layout regenerated |
| Sloth borrowed on the way to the table frees its place and ends its card game; a sloth eating your gift is never sent off (it froze for good); wild sloths eat your gift; the fire highlight follows what you hold | bug fixes | headless check |

## B. Generator efficiency, ranked

The full light bake takes about 20 minutes on your desktop (GPU thread). What it does per run, from reading the script and timing the CPU parts here:

| Step | Cost | Status |
|---|---|---|
| Rebuild the three lived props, including 3 Cycles renders of the wood stack | 25 s of the 36 s set-up, **measured** | cached now (4 s) |
| Build 12 camp props and delete 9 of them (`picked()`) | about 3 s, **measured** | G7 |
| 16 bake passes at 512 samples on a 4096 atlas, one Cycles session per object (about 195 sessions) | most of the 20 minutes, **estimate** | G2, G3, G4 |
| Keep 11 float 4096 images (about 3 GB) in memory | memory, not time, **estimate** | G5 |
| Ground bake | 39 s, **measured** | 10 s now |
| Jeep build renders 6 Cycles preview stills on every default run | most of the jeep build, **measured** 6 s at preview size here | G8 |

**G1. Check that the bake really runs on the GPU** (genbake-03, gencamp-06). `build_camp.reset()` calls `bpy.ops.wm.read_factory_settings`, which resets the preferences where the GPU choice lives, and it runs four times after `gpu_run.py` has started Blender. No script sets `scene.cycles.device`, and two builders set it to `"CPU"`. Two rebakes 26 minutes apart suggest the GPU is in use, but nothing in the repo guarantees or logs it. Fix: print the device and compute type before the first bake, and add a `--device` flag that aborts if a GPU was asked for and none is on. Effort S. I've asked for this check to be run on the desktop.

**G2. Spend samples where they show** (genbake-23). The bake takes 512 samples at 4096 although the page ships 2K and 1K maps box-filtered from the 4K, and the shadowless `SUN_OPEN` pass also takes 512. Per-pass samples (SUN_OPEN 8, SUN 128, the rest picked by eye from an A/B) cut the sampling work about 4.5 times, **estimate**. Changes the bake, so it needs a rebake and your eye.

**G3. Bake each pass once for all objects** (genbake-24). Each `bpy.ops.object.bake` starts one Cycles session per selected object. Baking through one joined copy (the light-map UVs are already one atlas) makes it 4 sessions per pass instead of 26. Saves 3 to 6 minutes per run, **estimate**; one run at `--samples 16` on the desktop gives the real fixed cost.

**G4. Stamps, so unchanged steps are skipped** (genbake-26, genbake-27). Nothing records which inputs made the committed outputs, so every run redoes everything and nobody can tell whether a committed bake is current. A `props/bake.lock.json` with a hash of each step's inputs lets `bake_all.py` skip what didn't change. Step 2 caches each pass, so moving one lantern redoes 3 passes, not 16.

**G5. Free images as soon as they are read** (genbake-25): about 3 GB less peak memory, **estimate**. Effort S.

**G6. Write outputs to a staging folder** (genbake-04, genlived-05). A failed or `--unwrap-only` run today leaves committed GLBs half-made and out of step.

**G7. Build only the picked props** (gencamp-01). `picked()` builds the Rustic and Jungle sets in full and deletes 9 of 12 objects. Split per prop. This goes with C3.

**G8. Jeep previews opt-in** (gencamp-04), and give the jeep a step in `bake_all.py` (gencamp-05); today its page copy is made by hand.

**G9. Fallen log shadow is mirrored in the bake** (genbake-02): the caster is yawed about 31 degrees the wrong way. One-line fix (`-yaw`), needs a rebake to see.

## C. Structure: what would make the camp easy to grow (needs your go-ahead)

These change how modules are split, so I have not started them. Each can land as a few small PRs that keep the picture the same (checked with the replay tool).

**C1. One source for the camp layout** (genbake-14, props-07, world-12, world-16, operator-12, props-06, crosscut-10, genbake-19; earlier audit M3). About 25 placement and light values are typed by hand in both the page and `bake_camp_lightmap.py` (all agree today except one 5 mm lantern offset), and inside the page the seat ring, crate, pot and wood pile are repeated in up to five modules. Proposal: a pure `camp/layout.js` (no scene, no DOM) that every module imports, written out to `layout_picked.json` for the bake; the bake first asserts its copies match, then reads them. This also lets the layout step run without a whole headless page.

**C2. The modules talk through imports, not window globals** (crosscut-03, boot-04, props-08, sloths-31). 12 globals are the real API between modules (`__camp`, `__jeep`, `__campLife`, `__acts` and so on), 8 are for the tools, 17 are debug hooks nothing reads. Turn the 12 into exports (keeping the window names as aliases for the tools), and list the rest in one place.

**C3. A shared builder library for the generators** (gencamp-02, gencamp-17, genbake-18, genlived-04, genlived-06; earlier audit M7). `build_camp.bake` and `densify` are monkey-patched from six places, so results depend on which script was imported last, and the light bake drives the lived builders through `exec`, a factory reset each, and a GLB written and read back. Proposal: `props/lib/` with the mesh helpers, one export-and-count helper, and a `make()` per builder that only creates its objects; the bake calls `make()` for each, resets once and exports once.

**C4. One character layer for the sloths and the operator** (operator-09, sloths-29, operator-10, sloths-30). `operator.js` and `sloths.js` each implement clips, walking, steering, turning, the gaze wave, Zs and eating, and have already drifted apart. A third character would mean a third copy. Proposal: `camp/actor.js` for the shared stateless parts, `camp/places.js` for who-is-where (claims, hosts, movers, path finding, now inside `sloths.js`), then split the 910-line `sloths.js` into body, spots, errands and naps. Best done after PR #14 lands, since it touches `operator.js`.

**C5. Each module owns its frame step** (boot-06, crosscut-14). `main.js` holds other modules' per-frame logic inline, and most modules build the scene while being imported. Give each module a `step(dt)` that `main.js` calls in a list.

**C6. One `fur.js`** (props-11, hygiene-14): six copies in three variants across the repo, although the README calls it shared.

## D. Retired options still in the code (needs your go-ahead to remove)

Kept on purpose until you say so, because some were decided only yesterday.

- Painterly and Low-poly looks: about 45 branches in the page (world-04, crosscut-17). Removing them must keep the seeded random calls in `forest.js` so the forest stays the same; the replay tool checks that.
- Baked jeep cabin light, door spill and headlights: still compiled, sampled and written every frame, always times zero (props-02, world-06, crosscut-05). Removes about 40 lines and 4 texture samplers from the floor shader.
- Rustic, Jungle and Storybook builders: 39 % of `build_camp.py`, 13 % of `build_jeep.py` (gencamp-08). They could move next to the archived GLBs in `props/camp/archive/`, which stay as they are.
- Old fire glow sprites and the old firefly cloud: hidden but still updated every frame (props-03, world-10, crosscut-08).
- `camp_shadow_picked_none.png`: a bake no script can make any more (genbake-13). Either make `--jeep none` work again or drop it.

## E. Repo and safety net

- **4K light maps are committed on every rebake**: 193 MB of the 317 MB git pack, 35 MB per bake, and copied to Pages although the page only loads them with `?lm=4k` (hygiene-01, genbake-32; earlier audit M5). Proposal: keep them out of git (they stay on the desktop) and out of Pages. Needs your go-ahead, since the history keeps the old ones unless rewritten, which I would not do.
- **No check before a merge goes live** (hygiene-03). A broken import leaves the public page stuck on the loading card. A small CI job that checks every import resolves, compiles the Python, and loads the camp headless once would catch the usual parallel-thread breakage. Effort M.
- README and CLAUDE.md say nothing about Canopy Camp, `props/`, the bakes, `tools/` or Pages (hygiene-04). Effort S.
- Pages also deploys three old prototypes, and the folder URL opens the old one (hygiene-02).
- No `.gitattributes` for the megabyte base64 `.txt` files; `package-lock.json` is ignored (hygiene-05, hygiene-06).

## F. Smaller runtime items worth doing with the next touch

- Three ground textures load after the loading card lifts and pop in (boot-11, world-19).
- The sky backdrop makes about 72,600 canvas calls at start-up (world-18).
- Every word or emoji sprite makes a new canvas texture that is never freed; the sleep Zs stay in the scene at opacity 0 (sloths-11, sloths-12, crosscut-12).
- Tap targets rebuild their bounds and closures every frame (crosscut-11).
- The operator poses a sloth by driving its mixer directly and never fades the pose out (operator-01).
- 18 URL options and 6 storage keys are read in 7 files with no list (boot-17, crosscut-15).

## G. Notes on the open PRs

- PR #15 and PR #16 both add `camp/audio.js`; #16 carries #15's first commit, so merge #15 first (crosscut-19).
- `audio.js` in both reads `acts.cook.stage`, which exists only in PR #14, so if an audio PR lands first the soup-ready sound may play all the time (operator-04, crosscut-20). Reading `window.__acts?.soup?.stage ?? "empty"` works on every branch. I can't hear audio here, so this is from reading the code.
- The branch with these fixes merges cleanly with #14, #15 and #16 (checked with `git merge-tree`).

## Suggested order

1. Merge the PR with section A (small commits, each checked).
2. GPU thread: light rebake for the dead trunk, commit `wood_stack.json`, and the device check G1.
3. Your picks on C1 to C6, D and the 4K maps (one decision card).
4. Then G2 to G6 as one bake-pipeline PR, tested with one rebake on the desktop.
