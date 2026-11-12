# Canopy Camp review: performance, coziness, maintainability

Review of `apps/canopy-prototype/camp.html` as of branch `claude/project-thread-c8zad5` (ed8df86, the merge branch the live page is built from), 2026-11-12. Default settings: look Mossy, props "Our camp", Detail Medium, Light 2K, Cabin baked, jeep Expedition.

This is an audit only; no app code changed. Numbers come from `tools/camp-probe.cjs` (headless Chromium, SwiftShader, so fps is meaningless there; draw calls, triangles, bytes and textures are exact). Screenshots of the start view: `/mnt/project-files/canopy-hide-and-seek/review/` (desktop, night, phone).

Rules this review respects: fewest triangles that still look good, quads and cards with painted textures over modelled detail, tris reported per item; all light, shadow and ground bakes run only in the GPU thread through `props/bake_all.py` (items that touch a bake or its output are marked **GPU thread**); fur keeps 3 shells on secondary animals; keep every sloth style and sticker variant.

**Status (2026-11-12):** Adriaen agreed with all findings, including archiving decided options (M6). Sound (B5) waits until the visuals are finished.

## The ten things to do first

| # | Item | Area | Gain |
|---|---|---|---|
| 1 | Ship the light maps as KTX2 (UASTC + zstd), and default phones to 1K | Perf, **GPU thread** export step | 17 MB → about 8 MB download; about 44 MB → 11 MB of GPU memory |
| 2 | Load all models in parallel behind a short loading card, then `renderer.compileAsync()` | Perf | Faster start, no hitch on the first look around |
| 3 | Share one shader program for all light-mapped props (cache key per feature, not per material uuid) | Perf | About 30 identical shader compiles become a handful |
| 4 | Split the forest leaves into sectors so the half behind you isn't drawn | Perf | About 11k fewer quads per frame of alpha-tested overdraw |
| 5 | Sloth body: `MeshPhysicalMaterial` → Lambert like the camp; fur shells off beyond about 8 m | Perf | Cheapest win on the most-drawn character |
| 6 | A real night: deep blue sky and fog, moon and stars in the canopy gap, warm vs. cool contrast | Cozy | The biggest mood change for little work |
| 7 | Bring a sloth into the start view, and give the sloths small idle life | Fun | The heroes are 7 m up and barely visible on a phone |
| 8 | Phone HUD: fold the 8 dev buttons into one ⚙ menu; move the hint off the fire | Fun | Frees the top quarter of the phone screen |
| 9 | Sound: fire crackle, rainforest bed, night insects (Adriaen checks by ear). **Deferred until the visuals are done (Adriaen, 2026-11-12)** | Cozy | The single largest coziness multiplier |
| 10 | Split `camp.html` into one module per thread, and publish only from `main` | Maintain | Six threads stop colliding in one 126 KB file |

## The scene as a whole

What the start view costs today:

| | Desktop 1280×800 | Phone 390×844 |
|---|---|---|
| Draw calls | 93 | 69 |
| Triangles drawn | 59.7k | 51.6k |
| Download | 17.2 MB | 17.2 MB |
| Textures in GPU memory | about 50 MB (two 2K RGBA light maps alone are about 44 MB with mipmaps) | same |

A common mobile guideline is under 100 draw calls and under 100k vertices ([three.js tips](https://www.utsubo.com/blog/threejs-best-practices-100-tips)), so the geometry budget is fine. The real costs are **download size, texture memory, fill rate** (alpha-tested leaf cards drawn behind you, a large transparent ground layer) and **load order** (models are fetched one after another).

Where the triangles go:

| Group | Tris | Draws | Share |
|---|---|---|---|
| Forest leaf cards (crowns, low branches, verge): 11,092 quads | 22,184 | 3 | 37% |
| Sloths, 6 × (826 body + 840 fur shells) | 9,996 | 12 | 17% |
| Jeep (body 4,880, back door 612, doors 2×174, glass 72, lamps, map, compass) | 6,002 | 12 | 10% |
| Camp props, "Our camp" (table, tent, hammock, 8 lanterns, 3 seats, kitchen) | 4,996 | 17 | 8% |
| Ground plant cards (1,090 + 260 track verge) | 5,400 | 2 | 9% |
| Hero trees and branches 2,904; forest wall trunks 1,608 | 4,512 | 2 | 8% |
| Ferns, 70 × 48 | 3,360 | 1 | 6% |
| Fire and pot (Pot 568, Ring 394, Fire 286, Embers 60, Tripod 48 + legs 66, Chain 36) | 1,458 | 7 | 2% |
| Lived props (WoodPile 532, TentSide 176, SeatThings 120, WoodStack 94, LooseLogs 60, MatRoll 28, SeatTops 3×2) | 1,016 | 9 | 2% |
| Sky dome 760, sky cylinder 64 | 824 | 2 | 1% |
| Laundry (posts 40, cloth 50) | 90 | 2 | <1% |
| Effects (smoke, sparks, steam, butterflies, fireflies, glow sprites) | about 400 | about 20 | <1% |

Not drawn but present: six invisible 960-triangle spheres used as sloth tap targets.

Strong points worth keeping: one instanced draw per plant kind, baked light with live channels (fire flicker, jeep lights, doors), adaptive pixel ratio that drops when fps falls, the painted backdrop instead of distant geometry, textured quads for chain, laundry, wood stack and book pages, and effects as one instanced draw each.

## 1. Performance

### P1. Light maps are 10 MB of PNG and about 44 MB of GPU memory (**GPU thread**, export step only)
`camp_lm_2k.png` (5.7 MB) and `camp_lm_sun_2k.png` (4.4 MB) are 58% of the whole download, and RGBA 2K with mipmaps takes about 22 MB each on the GPU. iOS Safari is the browser most likely to drop the page for memory.
- Encode both as **KTX2 UASTC with zstd**, linear (they are data, decoded with `pow(2.2)` in `bakedlight.js`). UASTC stays at 8 bits per pixel on the GPU (4 MB per 2K map instead of 22 MB) and keeps the smooth gradients that ETC1S would band. `gltf-transform uastc` or `toktx --encode uastc --zcmp` does it; the page needs `KTX2Loader` plus the Basis transcoder from jsDelivr, and `detectSupport(renderer)` ([glTF Transform CLI](https://gltf-transform.dev/cli)).
- Until then: default phones to the 1K set (1.4 + 1.2 MB). The difference is hard to see at phone size.
- This is only a re-encode of what the bake writes, but it belongs in `bake_all.py`, so send it to the GPU thread through the coordinator.
- The same applies to the ground maps (`camp_ground_night_*` 1.1 MB, mask 0.4 MB, jeep 0.4 MB).

### P2. Load in parallel, show a loading card, warm up shaders
`camp.html` awaits `sloth`, the camp props, lived, laundry, fire and jeep one after the other (lines 656 to 796), each a base64 `.txt` that is 33% bigger than the GLB and decoded on the main thread.
- Start every fetch at the top with `Promise.all`, then place them as they arrive.
- Publish the `.glb` files directly as artifact supporting files (the Artifact tool supports binary files up to 15 MB), compressed with **meshopt** (`EXT_meshopt_compression`, decoder in `three/addons/libs/meshopt_decoder.module.js`). Keep `TEXCOORD_1` at 16 bits so the light-map UVs stay exact. Expect the 2.1 MB of model text to drop to well under 1 MB.
- Show a small cream loading card with the sloth and a progress bar, then call `await renderer.compileAsync(scene, camera)` before fading in, so the first turn of the head doesn't stutter.

### P3. One shader program per material uuid
`lnight()` sets `customProgramCacheKey = () => "lmap-" + mat.uuid` (line 690), so every light-mapped prop material compiles its own copy of an identical program. On a phone each compile can take 50 to 200 ms. Key it by the features that change the code (map, vertex colours, alpha test), for example `"lmap-" + !!mat.map + !!mat.vertexColors + mat.alphaTest`.

### P4. Foliage overdraw
The forest leaves are one InstancedMesh of 7,080 quads plus two more (3,148 and 864), all alpha-tested and double-sided. An InstancedMesh is culled as a whole, so all 11k quads are shaded every frame, including the half behind the camera. Alpha test (`discard`) also weakens early depth rejection on the tile-based GPUs in phones, so stacked leaves shade many times per pixel ([foliage overdraw](https://app.cinevva.com/blog/2026-05-11-foliage-overdraw)).
- Split each leaf mesh into 8 wedge sectors around the clearing (8 draws instead of 1) and let three.js frustum-cull them; or move to `BatchedMesh`, which culls and sorts per instance.
- Fewer, bigger leaf-cluster cards in the far crowns: one card with 20 to 30 painted leaves replaces many single-leaf quads at the same silhouette.
- The ground plant cards (1,350) have `frustumCulled = false`; split them the same way.
- Where antialias is on, try `alphaToCoverage` for softer leaf edges at no sorting cost.

### P5. The sloths
- The body uses `MeshPhysicalMaterial` (from the GLB) and the fur shells `MeshStandardMaterial`: the two most expensive materials in three.js, on 12 draws. The camp is Lambert everywhere else. Swap both for Lambert (or a small toon ramp) and the look will also match the props better.
- Fur LOD: the wild sloths hang 6 to 8 m up, where shells can't be seen. Hide the shell mesh beyond about 8 m (the 3-shell rule stays for close-up).
- Tap targets: replace the six 960-triangle invisible spheres with a ray-sphere test (`ray.intersectSphere`), or at least `SphereGeometry(0.42, 8, 6)`.
- Their meshes have `frustumCulled = false`. Give each a fixed bounding sphere instead, so off-screen sloths skip skinning and drawing.

### P6. Merge static props into fewer draws
Everything light-mapped shares one atlas and one material type, so after placement the static pieces can become one mesh per material:
- 8 lanterns (8 draws) → 1; 3 seats + 3 seat tops (6) → 2; lived props (6) → 1 or 2; fire static parts (Ring, Tripod, TripodLegs, Fire) → 2.
- `BufferGeometryUtils.mergeGeometries` after `put()` keeps both UV sets. Saves about 18 draws on desktop.
- Keep separate only what moves (jeep doors, laundry cloth, pot steam, chain).

### P7. Triangle trims, item by item
Spend triangles on silhouettes and things seen close; paint the rest.

| Item | Now | Target | How |
|---|---|---|---|
| Table (snack table) | 1,104 | about 300 | Plank top as one box with planks painted; legs 4-sided; food as small cards or a few low lathe pieces |
| Lanterns | 8 × 200 = 1,600 | 8 × 40 = 320 | 6-sided prism with a painted paper or glass texture and candle; handle as one textured quad |
| Hammock | 716 | about 350 | Cloth with 6 to 8 segments along its length; rope ends as cards |
| Pot | 568 | about 250 | 10-sided lathe, no hidden inside below the soup surface; handle as a quad |
| Fire ring stones | 394 | about 200 | Fewer stones, each 8 to 12 triangles; stone variety in the texture |
| Tent | 826 | keep | Already coarse; fine for a walk-in hero |
| Jeep | 6,002 | add a 1,500 LOD | Swap beyond about 12 m; the near view keeps all detail |
| Sky dome | 760 | about 100 | A low-segment hemisphere or a gradient in the background shader |
| Wood pile | 532 | about 300 | Chopping stump and hatchet are fine; check for hidden faces under the stack |

That is about 3,500 triangles saved with no visible loss, mostly in props you see from a few metres.

### P8. Smaller things
- Ground transparency: the glade disc, track ribbons, ruts and shade disc are transparent with `depthWrite: false`, so they blend on top of the floor every frame. Fold them into the baked ground texture where they don't move (**GPU thread** for the bake).
- `castShadows` re-renders shadows every second for 30 s while props load; with parallel loading (P2) it can run once after everything is placed.
- Pause the effects (`atmo.update`) for things far behind the camera.
- Keep the adaptive pixel ratio; consider starting phones at 1.5 instead of 1.75.

## 2. Engaging, fun, breathtaking, cozy

Cozy design rests on safety, abundance and softness, and gets stronger with contrast: rain outside a warm shelter, a clear threshold into it ([Kitfox: Designing for coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)). Stylized forests read through silhouettes, clustered (not even) vegetation, dead trunks and fallen logs, and small moving life for depth ([Eastshade: art tips for building forests](https://eastshade.com/category/developement-updates/page/3)). Painterly scenes use one or two colours per material and large soft colour variation ([Meadows breakdown](https://80.lv/articles/meadows-creating-stylized-nature-in-ue4/)); Firewatch sets colour per moment and layers silhouettes in bands of fog ([Art of Firewatch](https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch)).

What the screenshots show (`review-start-desktop.png`, `review-start-night.png`, `review-start-phone.png`):

### B1. Night that feels like night
At Rest the fog and sky stay grey-green and the forest keeps its daytime value; only the fire pool and fireflies change. Night needs a colour change, not just less light.
- Fog and backdrop to deep blue-teal at the top, near-black green at the trunks; the warm fire, lanterns and tent the only warm colours. Warm near, cool far is what makes a camp feel safe.
- A moon and a few stars in the canopy gap overhead (one sprite and a star texture on the dome).
- Moonlight is already a baked channel; tint it cooler and let it rim the canopy edge.

### B2. Pieces that read flat and too bright
The three seat tops and the tripod legs are bright, saturated and nearly unshaded in both day and night, so they jump out of the scene (front seats and the yellow tripod in all three screenshots). They are the only light-mapped parts with a texture and no vertex colours. Check their texture albedo against the vertex-coloured props (it is likely too light and saturated) and whether the night tone clips them.

### B3. The lanterns
The string hangs at eye height across the start view, and the eight lanterns are large plain cylinders that look lit by day and like white boxes at night.
- Raise the string or curve it to frame the view instead of cutting it.
- Smaller lanterns with a paper or glass texture, a visible candle, warm gradient emissive only from dusk, a slow sway, and a soft glow sprite each.
- This also fits the settled lanterns activity (hang them at dusk, light each with a twig).

### B4. The sloths are the stars
From the start view the sloths hang 7 m up in the tree, a few pixels tall on a phone.
- Put one sloth within 4 m of the start view (on the low branch over the hammock or a seat).
- Small idle life: a slow blink, a yawn, a scratch, a head turn to follow you when you are close.
- A faint rim light (fresnel term in the fur shader) so brown fur reads against brown and green.

### B5. Sound (Adriaen checks by ear; cloud sessions can't hear audio)
Already last on the atmosphere list; it adds more coziness than any visual item. Fire crackle that grows as you approach, a soft rainforest bed by day, insects and a distant owl by night, the soup bubbling, a tap sound on boops. Positional and quiet, with a mute button.

### B6. Colour and composition
- The forest is mostly one mid green. Add a few saturated accents near the clearing: heliconia reds, orchids, a bromeliad on the hero tree, orange shelf fungus on a log.
- Frame the view with darker foreground leaves at the screen edges, keep the back layers lighter in the fog.
- Cluster ground plants instead of scattering them evenly, and add a fallen mossy log, a stump and a dead trunk in the wall (cheap: trunks without crowns).
- Stronger light shafts in the morning; they are at 0.22 opacity now.

### B7. Moments to linger
- Sit by the fire: tap a seat to sit, the camera lowers, the view slowly drifts, the soup steams. A natural spot for the friendship book.
- Occasional warm rain: drops on the canopy, you shelter under the tent awning, fireflies after. The contrast makes the camp warmer.
- Dawn mist and a golden hour between day and Rest.
- Small extra life: a frog on a log, a gecko on a tent pole, a hummingbird at the hibiscus (animated cards, a few triangles each).

### B8. Phone HUD and hints
On a phone the eight buttons take three rows, about a quarter of the screen, and the hint text sits over the fire.
- One ⚙ button opens the looks, props, detail, light and cabin settings; keep the friends pill and Rest.
- Put the hint above the stick and fade it after the first walk.
- Hide the developer toggles from the shared link (keep them behind `?dev`).

### B9. Fun
The settled activities plan (`canopy-hide-and-seek/activities-plan.md`) already covers chores, snacks, favourites, the book and photos, so this review adds nothing new there. It does suggest two cheap extras that use what exists: spotting wild sloths with binoculars from the jeep (the project is "hide-and-seek"), and the friends counter showing sloth faces instead of a number.

## 3. Easier to maintain

### M1. One integration branch
The live page is built from `claude/project-thread-c8zad5`, a merge of six or more thread branches; `main` is behind it. Merge into `main` by pull request and publish the artifact only from `main`. Each thread then rebases on `main` and no one has to merge siblings before publishing.

### M2. Split `camp.html` by owner
1,427 lines and 126 KB edited by the canopy, jeep, props, atmosphere, sloth-life and activities threads. Atmosphere, ground, activities and baked light already live in their own modules; finish the job:
`sky.js` (backdrop, dome, clouds), `forest.js` (trees, wall, leaves, ferns), `campProps.js` (picked props, lived, laundry, fire), `jeep.js`, `sloths.js`, `input.js`, `hud.js`. `camp.html` becomes a short file that sets up the renderer and calls each. Merge conflicts shrink to the module a thread owns.

### M3. One scene manifest
Positions live in `camp.html` constants (seats on a 2.1 m ring, laundry ends, jeep at, tent at), and the bake reads its own copy (`props/shadow/layout_picked.json`). A single `camp_layout.json` with every object's name, file, position, rotation, triangle budget and light-map channel, read by both the Blender bake and the page, means the bake and the page can never disagree. Names the page looks up (`SeatTop_0`, `Lantern_3`, `DoorP`) are then listed in one place.

### M4. A budget check before every publish
`tools/camp-probe.cjs` (added with this review) loads the page headless and prints draws, triangles per object, every download with its size, textures and errors. Add a budget and fail on it, for example phone at most 80 draws, 60k tris and 8 MB, and run it before each republish. It also writes the per-object triangle report the project rule asks for.

### M5. Generated files and git size
The repository pack is 203 MB. The 4K light maps (25 MB + 18 MB) are committed although they are "local only", and every model is stored twice (GLB and base64 `.txt`). Keep 4K maps out of git (`.gitignore` or Git LFS), drop the `.txt` copies once the page loads GLBs directly (P2), and let the GPU thread commit only the published sizes.

### M6. Retire options that were decided
Each toggle doubles a code path: three looks, five prop sets (Our camp, Storybook, Rustic, Jungle, Old shapes), Cabin baked/live, Light 2K/1K, `?fire=old`. The jeep set the pattern: picked style live, others in `archive/`. Moving decided options to an archive folder (kept, not deleted) and out of `camp.html` would remove a large share of the branches in the code. That choice is Adriaen's.

### M7. Shared builder tools
`build_camp.py`, `build_lived.py`, `build_fire.py`, `build_laundry.py` and `build_jeep.py` each carry their own densify, export and triangle printing. One `props/lib/` with low-poly helpers, the per-object triangle report, and one export step (meshopt, texture encode) keeps every builder consistent.

### M8. README
`README.md` has no row for `apps/canopy-prototype/` and its artifact URL. Add it, and point to the activities plan, the bake pipeline and this review.

## Blender modelling notes for this project

From the guides and breakdowns read for this review, condensed to what fits the camp:
- Silhouette first: put triangles where the outline is seen against sky or ground; flat faces and painted texture for everything inside the outline ([Eastshade](https://eastshade.com/category/developement-updates/page/3)).
- One texel density across props so nothing looks blurrier than its neighbour; trim sheets (one shared texture with planks, bark, rope, canvas strips) instead of a texture per prop ([Frozenbyte trim sheets](https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets)).
- Render detailed versions onto simple shapes (already done for the wood stack, chain and seat tops); this is the project's preferred technique.
- No hidden faces: delete bottoms on the ground, insides of closed pots, faces between touching parts.
- Low segment counts on small round parts: 6 sides for anything under 5 cm wide, 8 to 10 for hero round parts.
- Foliage as clusters on cards with normals transferred from a sphere around the crown, so the crown shades as one volume ([Meadows](https://80.lv/articles/meadows-creating-stylized-nature-in-ue4/)).
- Exports: `gltf-transform inspect` first, then `meshopt`, `dedup`, `prune`, `join` for static parts, and KTX2 for textures ([glTF Transform CLI](https://gltf-transform.dev/cli)).

## Sources
- [100 Three.js tips that improve performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [How modern engines beat foliage overdraw](https://app.cinevva.com/blog/2026-05-11-foliage-overdraw)
- [glTF Transform CLI](https://gltf-transform.dev/cli)
- [Needle Engine optimization guide](https://engine.needle.tools/docs/how-to-guides/optimization/)
- [Eastshade: art tips for building forests](https://eastshade.com/category/developement-updates/page/3)
- [Meadows: creating stylized nature](https://80.lv/articles/meadows-creating-stylized-nature-in-ue4/)
- [Kitfox Games: Designing for coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)
- [GDC 2015: The art of Firewatch](https://www.thumbsticks.com/gdc-2015-the-art-of-firewatch)
- [Day and night in stylized scenes](https://80.lv/articles/day-night-in-stylized-scenes)
- [Frozenbyte: tile textures and trim sheets](https://wiki.frozenbyte.com/index.php/3D_Asset_Workflow:_Tile_Textures_and_Trimsheets)
