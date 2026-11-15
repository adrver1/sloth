# Canopy Camp code review: state for the next reviewer

Written 2026-11-14 on branch `c-a` (head 95b79a7) for a future AI coding session; the second review's status (section 1, "Second review: status after the rebake") was brought up to date on 2026-11-15 on branch `claude/project-thread-n6c974`, after the GPU rebake. It says what the two reviews covered, where the findings stand, and what to review next. Every count below was read from the files named; re-run the commands to check them.

## 1. The two reviews

There are two reviews. The second is the current list.

| | First review | Second review |
|---|---|---|
| Folder | `docs/reviews/code-review-2026-11-13/` | `docs/reviews/review-2026-11-14/` |
| Files | `code-review.md` (ranked summary), `findings.json`, `status.json`, `findings.md` (generated), `build.py` | `review.md` (ranked list with details), `findings.json` |
| Commit reviewed | `main` at 21d168d (merge of PR #13), 2026-11-13 | `claude/project-thread-n6c974` at b538272, 2026-11-14 |
| Findings | 267, in 10 areas | 258 (`R2-001` to `R2-258`), in 10 areas and 4 groups |
| Status tracking | `status.json`, rendered by `build.py` | `status.json` (no build script; edit it directly) |

`docs/reviews/review-2026-11-14/` is committed on `fx-integ` and `claude/project-thread-n6c974`. If it is missing where you are, look for it on those branches or on `main` before assuming it is lost.

### First review (2026-11-13)

- Scope: the camp page (`apps/canopy-prototype/camp.html`, the 23 modules then in `camp/`, and the shared `activities.js`, `atmosphere.js`, `bakedlight.js`, `ground.js`, `fur.js`); the generators and bakes in `props/camp`, `props/lived`, `props/jeep`, `props/ground`, `props/shadow` and `props/bake_all.py`; repo hygiene (git pack, GitHub Pages workflow, tools, README).
- It did not cover `characters/` (no area for it in `findings.json`).
- Method: ten reviewers, one per area, read every file in their area and wrote findings with file and line. Most areas were static reading; the crosscut area used small read-only scripts (import graph, export table, `window.__` table, duplicate-body scan). Line numbers in `findings.json` are on 21d168d, not on the current code.
- Impacts: 21 high, 109 medium, 137 low. 36 findings are flagged `needs_rebake`.
- Measured versus estimated: 68 findings carry an `estimate_or_measured` field. 54 of them start with "Estimate"; of the other 14, most are static counts or say "not measured", and only about four are partly measured (sizes from git, in hygiene-01, -02, -03 and -24). The timed numbers are in `code-review.md`'s "measured" rows, timed on the cloud machine (CPU only, Blender 5.3, headless Chromium with SwiftShader): for example the 3 MB light-map decode (139 ms to 8 ms), draws per frame (138 to 129), the ground bake (39 s to 10 s), the light-bake set-up (25 s to 4 s). Every Cycles bake time, the 20-minute full bake split, the "about 195 Cycles sessions", the 3 GB of float images and the sample-budget savings (G2 to G5 in `code-review.md`) are estimates from reading the code.

### Second review (2026-11-14)

- Ten areas: boot, sloths, operator, world, props-runtime, hygiene (code), and generators, props-efficiency, props-look, characters (assets).
- Method (from `review.md`, "How this list was made"): 148 new findings, each area checked by a verifier; 2 refuted and dropped; 30 items added by the verifiers. 139 of the first review's 199 not-fixed findings were re-triaged: 131 still open (they appear under their old ids in `old_ids`), 7 fixed by the restructure and 1 no longer relevant. 89 source items were merged into others.
- Groups: A fix now, no rebake, no pick (170); B fix now, then one rebake (19); C needs Adriaen's pick (50); D needs Adriaen's decision on scope (19). Impacts: 9 high, 77 medium, 172 low. These are the `counts` block of its `findings.json` as of 21:11 on 2026-11-14; re-read that block if the file is newer.
- Criteria are Adriaen's: player experience on a phone, development speed including AI iteration, few triangles, keep every asset variant.

### Second review: status after the rebake (2026-11-15)

Read from `docs/reviews/review-2026-11-14/status.json` (one entry per R2 id: status, one-sentence note, commits, needs_rebake, lane, followup). The nine fix lanes, the cross-cutting items and Adriaen's picks were merged on `fx-integ`, then into `claude/project-thread-n6c974`. The GPU rebake has run (8dae856, KTX2 maps d758416), Adriaen checked the result on his desktop GPU (`final_play_test` in `status.json`), the operator wears camp_cargo (look B) since the engine pin move (b7814cb), and the run-time stand-ins for the old bake are gone (7f8b34c). Nothing is pushed.

| Status | Count |
|---|---|
| fixed | 239 |
| partly | 11 |
| already_fixed | 5 (R2-002, R2-011, R2-133, R2-180, R2-211) |
| blocked | 2 (R2-214, R2-219) |
| deferred | 1 (R2-178, Adriaen: no visible difference) |

No entry needs a rebake any more. Fixes from the final GPU check: the fire ring's z-fight with the level floor (88b9676) and its siblings, the operator's blob shadow and the rain ripples (e7d1211), both noted on R2-181; the move lab's follow camera (016201d, e6e0108); the scenario tool's tap menu on main (c779b63).

What is left:
- The canopy haze above the backdrop (`final_play_test.items.canopy_haze`) is fixed: Adriaen picked the 30 m look with no day top fade (2026-11-15); sky.js draws the backdrop and domes FAR/30 times taller (`LIFT`).
- R2-218 is done: the 33 merged remote branches were deleted on 2026-11-15, after PR #33 merged.
- blocked: R2-214 (commit .glb and .ktx2 as the source and make the base64 copies at publish time: only Adriaen's go-ahead is missing now), R2-219 (one-line pointers in the `/mnt/project-files` copies).
- partly: R2-004 (the CI probe job is continue-on-error; make it block deploys once its runner time is known), R2-033 (lam, tris and tent-frame sharing left to other findings), R2-034 (`camp/operator/` still calls `THREE.MathUtils.smoothstep`), R2-083 (far sloths' mixers every 4th frame), R2-087 (the cabin SpotLight stays at intensity 0; Adriaen's pick), R2-125 (upstream desk-at-night PR not opened), R2-174 (the `?fur=0` tint is Adriaen's call), R2-183 (the shaft fade on a real GPU), R2-215 (`?slothmat=old` and `pois` kept for Adriaen and the tours), R2-238 (check that R2-239 closed the rest), R2-257 (the deadwood still needs the browser; making it pure moves the forest and needs a rebake).
- Not recorded as checked: audio by ear (rain starts at full level, insects use `sstep`, the jeep engine stops 30 s after everyone leaves, `camp/audio/` reworked); real-GPU frame times (`npm run gpu`, `npm run gpu:phone`); a play-test of the hammock rope climb, the operator's put-down and cuddle, the chore sparks, the R2-068 wave, the merged log-seat menu while holding a bowl, and the operator's wave-back (now the sloths' line-of-sight test). Run headless since: the jeep doors, the sloth's hammock and bed naps, and the operator sleeping in the tent bed.
- With the next builder change: wall_tent's docstring in props/camp/build_camp.py still says layout.js TENT mirrors the tent sizes; it should say camp/layout.js fromModel copies W, yf, yb, DW, stove, chimney, bed and pegs into TENT. Editing it alone makes `props/bake_all.py --check` report the light step stale, so it waits for a builder change that rebakes anyway.
- Kept on purpose: camp/bakedlight.js still accepts `"ktx2": true` in camp_lights.json (older bakes, such as a `?lmdir=` preview from an older bake_all.py); models/camp_lights.json carries the hash object.
- First review's `status.json` still lacks the entries the R2 fixes close (for example gencamp-06 via R2-226, genbake-03 via R2-111, genlived-13 via R2-231, genlived-10 via R2-251, genlived-03 via R2-243, and the `fixed_by_restructure` ids in section 3).

Probe at 7f8b34c (SwiftShader, no errors): desktop 124 draws, 49,183 triangles, 56 programs; phone 72 draws, 39,357 triangles, 56 programs (c0b2627 the same, within 2 triangles of animation).

## 2. Coverage and gaps

Depth per area of the first review (area keys from `findings.json`):

| Area | Findings | Depth |
|---|---|---|
| genbake (bake_all.py, bake_camp_lightmap.py, bake_ground.py, export_casters.cjs) | 34 | Read in full; ground bake and set-up timed on CPU; no Cycles bake run |
| gencamp (build_camp.py, build_jeep.py) | 21 | Static only; every time figure is an estimate |
| genlived (build_lived.py, build_fire.py, build_laundry.py) | 16 | Read in full; bpy.ops calls counted, not timed |
| crosscut (imports, globals, helpers, PR branches) | 22 | Scripted static analysis over all modules and PRs #14 to #16 |
| boot (core, main, input, hud, player, save, highlight, linger, lab) | 32 | Read in full; WASD bug reproduced headless |
| sloths (sloths.js, then one 1,096-line file) | 37 | Read in full; static |
| operator (operator.js, activities.js, campLife.js) | 25 | Read in full; static, nothing run |
| world (forest, sky, terrain, ground, atmosphere, deadwood, weather) | 31 | Read line by line |
| props (campProps, jeep, lanterns, canister, bakedlight, fur) | 25 | Read in full, plus the bake's layout section |
| hygiene (git, Pages, CI, README, tools) | 24 | git pack and tree sizes measured |

Not looked at by either review, or only in part (from both reviews' own notes; `review.md` "Coverage gaps" has the full list):

- Real phone GPUs and real GPU frame times. Every render was SwiftShader at desktop size. Overdraw, shader cost and point-size findings are estimates for mobile.
- Any Cycles bake or render. KTX2 quality (toktx is not installed in the cloud). Light-map texels and seams.
- Audio by ear. Nobody in the cloud can hear it. The second review read about 300 of the then 498 lines of `audio.js`; since then it has been split into `camp/audio/context.js`, `sfx.js`, `music.js` and `watch.js` (d8e81b2), which nobody has reviewed.
- 6 of the first review's generator findings were not re-triaged one by one in the second review (its `findings.json`, `not_retriaged`), but each is covered in substance by a named R2 finding: genbake-13 by R2-217, genbake-17 by R2-127, genbake-31 by R2-170, genbake-32 (high) by R2-207, genbake-33 by R2-214, genbake-34 by R2-024.
- The `engine/` submodule (desk-at-night: character kit, ponytail engineer, bearded operator). It was not checked out; only GLB stats were read.
- The sloth styles `plush` and `plush_real`, the archived camp and jeep styles (`props/camp/archive/build_camp_styles.py`, `props/jeep/archive/build_jeep_styles.py`), `characters/aussie_critters`.
- Other apps in `apps/` (karaoke, synth, stickers-page, playtime, catch-the-baby, fur-options, playtime-tools), the stickers renderer and packs (including the 500 KB WhatsApp limit), and the canopy pages other than `camp.html`.
- The karaoke trip (PR #32), beyond what `glade.js` reads. It was merged into `fx-integ` on 2026-11-15 and ported to the restructured modules (`trip.js`, `layout.js` `tripPath` as a `PATHS` entry, `forest/` and `glade.js` reading it, `debug.js` `__trip`). Neither review has read that port; a check of the merge only found six items, fixed in the commit after it: the glade's dressing kept on its old stream (the road and the cut scene's view now only hide what was drawn), `actor.js` `kitLook` shared by the operator and the trip's cast, the homeward toast naming only the saved riders, `layout.js` `ROAD_TRUNK_R` and one `path.ribbon` curve per path, and followups on R2-016, R2-035, R2-036, R2-100 and R2-212 in `status.json`.
- `glade.js`, `deadwood.js` and the `atmosphere.js` pools only in part. `tools/tours/*.json` (28 files) were not reviewed.
- The 68 findings then marked fixed were not spot-checked for regressions (only props-01 and sloths-03).
- Evidence files for the second review live in session scratchpads (`evidence_dir` per finding) and may be gone.

## 3. First review: status on c-a (2026-11-14)

This section is the first review as of `c-a`. Most of the open findings it ranks below were fixed on `fx-integ` under their R2 ids (R2-001, R2-003, R2-146, R2-004 partly, R2-207, R2-160, R2-161, R2-162, R2-170, R2-171, R2-140, R2-254, R2-006 to R2-020); see section 1 for what is open now.

`python3 docs/reviews/code-review-2026-11-13/build.py` on `c-a` prints:

```
findings.md: 267 findings, fixed 72, partly fixed 36, checked, still open 3, waiting on Adriaen 9, open 147
```

No finding is `in progress` or `planned`. `status.json` says `"as_of": "section C round 6 and the leaf sway, 2026-11-14"`.

### Open findings that matter most, ranked by impact

Second-review ids are given where they exist; old ids are in each R2 finding's `old_ids`.

1. **R2-001** (operator, high, A). The operator poses a sloth by calling `s.mixer.stopAllAction()` in `slothPose()`, `camp/operator/buddy.js:21`, and never fades the pose out, so a sloth he played or napped with keeps the `titanic` or `curl` pose mixed in. Still present on `c-a`. Not started.
2. **R2-146** (props-efficiency, high, B). The soup pot body is inside-out (`props/lived/build_fire.py` `lathe()` has no normal fix), so the near wall disappears. Needs a generator fix and a light rebake on Adriaen's GPU.
3. **R2-004 / hygiene-03** (high, A). No CI check stands between a merge and the live page; `.github/workflows/` holds only `pages.yml`, and `tools/camp-probe.cjs` always exits 0. Not started.
4. **R2-003** (props-runtime, high, A). `camp/jeep.js:57` still sets `THREE.PCFSoftShadowMap`, which three no longer supports, so the first frame recompiles almost every shader after `compileAsync`. One-line fix. Not started.
5. **R2-207 / hygiene-01, genbake-32, props-16** (high, D). 4K light maps are committed on every rebake (about 35 MB each) and copied to Pages. Waiting on Adriaen.
6. **R2-160, R2-161, R2-162** (world and props-look, high, C). Fire ring blown out to near-white; visible world edge from the glade; leaf overdraw (about 12,200 alpha-tested two-sided cards). Each changes the look, so waiting on Adriaen's pick.
7. **genbake-23** (high in the first review; R2-170 and R2-171 are medium, group C) (rebake). Samples spent on a 4K map that is not published, 512 samples on the shadowless pass. Needs a rebake and Adriaen's eye.
8. **genbake-26** (high in the first review; R2-140 is low, group A). No input stamps, so every bake run redoes every step and nobody can tell whether a committed bake is current. Planned in `code-review.md` G4; not started.
9. **genbake-18 / R2-254** (high in the first review and partly fixed; R2-254 is medium, group C). The bake now calls each lived builder's `make()`; the GLB round trip through scratch GLBs remains (R2-254 folds in genlived-04).
10. Mediums in group A of `review.md` with player-visible effects: R2-006 to R2-010, R2-012 (sloth and operator glitches with gifts, naps and putting sloths down), R2-013 (saved rain fades in from dry on every load), R2-014 (the jeep door stays open), R2-015 and R2-016 (start-up canvas readback and glade floor painter), R2-020 (ground maps not in PRE, pop in late). Not started unless a commit after b538272 says so.

Second-review findings already fixed on `c-a` after b538272 (no R2 status file records this yet): R2-002 (food given to a wild sloth, 1a0e5b5), R2-011 (chore sounds read from the toast text, 25a996f), R2-033 (jeep API built in three files, e66242c), R2-180 / props-12 (the ferns and the leaves shared one sway, 9800b8e; `status.json` has it as fixed).

Small fixes made while this file was checked, after 95b79a7: the leaf sway (9800b8e), `?seed` that is not a number keeps 7 and the URL option table names today's readers (953b37c), `jeep.js`'s header points to `seatApi` and `jeepSeat.js` imports `places.js` `claim` under its own name (5ec7a97), and `layout.js`'s header names the lantern drop (d8f51c5).

### First-review entries that are out of date

The second review found these fixed or no longer relevant (`fixed_by_restructure`: crosscut-20, genbake-16, operator-04, operator-08, operator-11, world-05, world-15, world-24; `not_relevant`: crosscut-19, as PRs #15 and #16 are merged), but `status.json` does not say so. operator-11, world-05 and world-15 are `partly fixed` there; the other five are missing from it, so they count as open. Check each against the code and update `status.json`.

### The three `checked, still open` entries

- genbake-03 and gencamp-06: the bake runs on the GPU only because `gpu_run.py` outside the repo turns OptiX back on after each factory reset. A `--device` flag and a device print inside the repo are still to do (R2-226).
- sloths-25: five hand-rolled tweens remain (R2-027).

## 4. What to review next, in order

1. **The split modules.** Since 21d168d, 70 files were added under `apps/canopy-prototype/camp/` and `activities/`, and the diff to `c-a` over `apps/canopy-prototype`, `props` and `tools` is about 11,500 lines added and 3,900 removed. Nobody has reviewed the result as a whole. In particular:
   - `camp/sloth/` (24 modules) and `camp/sloths.js` (entry), `camp/places.js`, `camp/nav.js`, `camp/actor.js`, `camp/fx.js`, `camp/swing.js`.
   - `camp/operator/` (15 modules) and `camp/operator.js`.
   - `activities.js` and `activities/` (`carry.js`, `fireChore.js`, `fruitBowl.js`, `parts.js`, `soupChore.js`), `camp/chores.js`, `camp/campAir.js`, `camp/campGround.js`.
   - The build order in `camp/main.js` (the commented list of build functions), and `camp/debug.js`, which now sets every `window.__` name.
   - The named random streams: `rng(name, start)` in `camp/core.js`.
   - The second review saw the split up to b538272 only. Commits 230b97f (tools only) to 95b79a7, and the small fixes in section 3, came after it.
2. **`camp/audio.js` and `camp/audio/`.** Split after both reviews and never reviewed. Read for logic; say in any report that nobody heard it.
3. **The open high findings above** (R2-001, R2-003, R2-004 are cheap and need no pick or rebake).
4. **`props/lib/`** (`bake.py`, `export.py`, `materials.py`, `mesh.py`), added after the first review. Also confirm that the 6 generator findings the second review did not re-triage (section 2) are really covered by the R2 findings named there.
5. **Never reviewed:** `tools/tours/*.json`, `tools/camp-gpu.cjs`, `tools/camp-page.cjs`, the `plush` and `plush_real` sloth styles, the other apps in `apps/`, the stickers renderer.

## 5. How to keep it current

- First review: edit `docs/reviews/code-review-2026-11-13/status.json`. It uses a 1-space JSON indent; keep it. Each entry is `"<id>": {"status": ..., "commits": [...], "note": ...}`, and `status` must be one of the strings in its `statuses` list (`fixed`, `partly fixed`, `checked, still open`, `in progress`, `planned`, `waiting on Adriaen`, `open`). Update `as_of`.
- Then run `python3 docs/reviews/code-review-2026-11-13/build.py`. It rewrites `findings.md` and fails if `status.json` names an id that is not in `findings.json`. Commit `status.json` and `findings.md` together. Never edit `findings.md` or `findings.json` by hand.
- Ids are `<area key>-NN` (for example `boot-06`, `genbake-23`) and are fixed: they never change or get reused. A finding missing from `status.json` is open.
- Second review: ids are `R2-NNN`; `old_ids` and `sources` map them to first-review ids. Its status is `docs/reviews/review-2026-11-14/status.json` (1-space indent, no build script): edit the entry's `status` (one of its `statuses` keys), `note` (one sentence), `commits` and `needs_rebake`, update `counts` and `as_of`, and update section 1 of this file. A change that needs a new rebake goes in as `waiting_rebake` until the GPU thread has baked it.
- Line numbers in both `findings.json` files are on the reviewed commits (21d168d and b538272). Grep for the named function instead.

## 6. How to check a change

Adriaen's rule (2026-11-14): a clean-up must leave the player's experience no worse. Byte-identical behaviour is not required, and replay or scenario fingerprints are expected to change. No worse means: no page or console errors, no stuck or clipping characters, interactions still work, nothing visibly worse on a phone-sized and a desktop-sized view, and draws, triangles, shader programs and frame time no worse than `main`.

Testing rule (Adriaen, 2026-11-14): no long runs on the cloud CPU. SwiftShader is slow, so keep cloud runs to a few hundred frames. Long runs and play-tests go to Adriaen's desktop GPU through Remote Control, in the worktrees `C:\claude\sloth-gpu` and `C:\claude\sloth-gpu-main`. Never touch `C:\claude\sloth`, which belongs to the GPU bake thread. Bakes run only through the GPU thread. On a shared machine, run at most two headless browsers at once and use only your assigned ports.

| Tool | What it gives | When it helps |
|---|---|---|
| `tools/camp-probe.cjs` | Exact draws, triangles per object, downloads, textures, shader programs, page errors, a screenshot (SwiftShader). `PORT=` and `ROOT=` pick the port and the checkout; `THROTTLE=mbps,latencyMs` emulates a phone connection. fps is meaningless. | The cloud check for every change: run on `c-a` and on a worktree of `main` and compare the counts. It always exits 0, so read the output. |
| `tools/camp-gpu.cjs` | Real-GPU frame times (mean, p95, worst), start-up times, draws, triangles, programs, a screenshot. `--phone` sets 390x844 at DPR 3 with `?touch=1`. | On Adriaen's desktop, through Remote Control, for anything that could cost frame time or start-up. Its times mean nothing under SwiftShader. |
| `npm run replay` (`tools/camp-replay.cjs`) | A 480-frame tour on a virtual clock with seeded `Math.random`, a fingerprint of every object, screenshots; `--compare dirA dirB` diffs the shots. | Optional. To see what changed in a tour, or to confirm a change meant to be identical really is. Use `--frames` to keep cloud runs short. |
| `npm run scenarios` (`tools/camp-scenarios.cjs`) | Many tours from `tools/tours/scenarios.json` with real taps, whole camp days and saved state; `run` and `compare`. | Optional. To find errors and stuck characters across many interactions. A DIFF is something to look at, not a failure. Long, so run it on the desktop GPU. |
| `CAMP_GPU=1` | Makes `tools/camp-page.cjs` (and so replay and scenarios) use the real GPU instead of SwiftShader. | Replays and scenarios on a GPU machine. |

Also say in every report whether anything under `camp/audio.js` or `camp/audio/` changed, and whether a change needs a light rebake (do not run one in the cloud).
