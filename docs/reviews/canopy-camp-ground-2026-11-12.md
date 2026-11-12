# Canopy Camp: forest ground, height and paths (2026-11-12)

Adriaen asked how best to model forest ground: should it have height variation, how do we make it look real and organic, and what about dirt paths? This note answers those questions as an add-on to the [camp review](canopy-camp-review-2026-11-12.md). It follows the same rules: as few triangles as we can get away with, detail painted rather than modelled, and all bakes run in the GPU thread.

## The ground today

- **The clearing** is one flat disc (`ground.js`, 96 tris). A 256² wear map says where the ground is dirt, lush or dry grass, ash or mud. The bake (`props/ground/bake_ground.py`) writes this map for "our camp". Tiling grass and dirt textures blend along it, and grass, flower and clover cards are one instanced draw.
- **The forest floor** outside the clearing is a second flat disc, 30 m wide, with a tiling leaf-speckle texture.
- **The footpath to the glade and the jeep's track** are separate ribbons laid a few millimetres above the floor, using polygonOffset and alpha edges.
- **Everything is flat.** Props, the player and the plants all sit at y = 0, and collision is 2D.

From the start view it reads as a lawn with brown patches, not as forest ground. There are three reasons. It is perfectly level. The edges between grass and dirt are soft gradients, where in real ground they are ragged. And it is missing the layers a forest floor has: litter, moss, roots and stones.

## 1. Height: yes, but gentle, and mostly outside the camp

Real forest floor is never level. It has hummocks round roots, hollows where water collects, and a slope where the ground meets the trees. But the camp itself should stay almost flat, for three reasons:

- The props are placed and baked at y = 0.
- The ground shadow and night maps are top-down and planar, so they don't care about height. The props would, though, if they started floating or sinking.
- Collision and the sloth routes are 2D.

**Recommended shape (one function, one draw):**

| Zone | Height | Why |
|---|---|---|
| Camp floor (r < RC − 2) | 0 ± 3 cm, very low frequency | Props stay seated. A 3 cm swell is enough to catch the light and break the "lawn" look. |
| Clearing rim (RC − 2 … RC + 1) | Rises 0.2 – 0.5 m | A shallow bowl. Level designers use bowls and hollows for places that should feel safe and enclosed, which is exactly the feeling of a cozy camp. It also hides the bottom of the forest wall. |
| Forest floor (beyond RC + 1) | 0.4 – 1.2 m of hummocks and hollows | You never walk there, so it is free to be lumpy. Its silhouette against the mist is where height reads best. |
| Round each big tree | A 0.3 – 0.6 m mound, flaring to the buttresses | Trees grow on their own root mounds. This sits the hero trees in the ground instead of on it. |
| Paths and the track | Sunk 3 – 6 cm, with a 2 – 3 cm lip either side | Worn paths are lower than the ground beside them, and the lip catches light along the edge. |

**How to build it:**

- Use a radial grid that is denser where it matters: about 24 rings and 64 segments gives roughly 3k tris, which is still one draw. Keep it coarse in the camp, where the ground is near flat, and finer at the rim and round the trees.
- The height comes from one small greyscale heightmap, about 128², or from a function. That source must be shared:
  - Blender reads it for the bake. This is the "one scene manifest" item from the review (M3), so the bake and the page can't disagree.
  - The page reads it for the floor, the player's eye height, and where the plant cards, ferns, deadwood and pebbles sit.
- Normals come from the heightmap, so a bit of sun-and-shade relief appears for free with the live sun.
- Merge the forest-floor disc into the same mesh, so there is one ground with no seam. The path and the glade then become part of the ground mask instead of separate ribbons (see section 3).
- Cost: about 3k tris against the current 96 + 80, no extra draw, and a 128² texture.

**What not to do:**

- Don't displace in the vertex shader on phones, and don't use a dense grid "just for detail". Small bumps belong in the textures.
- Don't move the camp props off y = 0. Keep the camp's flat zone flat, so the GPU thread doesn't have to rebake.

## 2. Making it look real and organic

The forest-ground breakdowns all say the same three things. Build the ground in layers from the bottom up. Blend those layers by height, not by smooth alpha. And break the tiling at two or three scales.

**a. Height-based blending (the biggest single win, about 10 lines of shader).**

- Put a height value in the alpha channel of the grass and dirt tiles. Where the wear map says 50% dirt, dirt shows first in the low spots between grass blades and pebbles.
- The edge then becomes ragged and natural, instead of a soft brown gradient.
- Today `ground.js` mixes linearly. The change is in that one shader, with no new draws or textures.

**b. Layers a forest floor has, and where each goes.**

| Layer | Where | How (cheap) |
|---|---|---|
| Soil and dirt | Worn spots, paths | Already there (wear map R). Add height blending. |
| Leaf litter | Under the tree crowns, at the forest edge, swept into corners against logs, tent walls and seat bases, never on the paths | A third tiling texture (the camp's leaf palette, in brown and olive) on a fourth wear-map channel, or the existing "dry" lushness value repurposed. Plus a few flat leaf cards near the camera. |
| Moss | Round tree roots, on the north side of mounds, the deadwood collar, the shady rim | A moss tint in the ground shader where ground AO is high (the baked sky-occlusion green channel already says where it is shady). |
| Roots | Radiating 1 – 3 m from both hero trees, crossing the sloth path | Flat painted strips draped on the height surface, 2 – 4 tris each, about 12 of them, merged into one draw with the deadwood material. |
| Stones and pebbles | The path edges (kicked aside), round the fire ring, at the foot of the slope | Cards in the existing plant atlas, plus a pebble tile in the dirt texture. |
| Twigs and cones | Scattered sparsely, clumped near trees | Cards in the plant atlas. |

**c. Clump, don't sprinkle.**

- Real plants and litter grow in masses with gaps between, not evenly.
- The plant scatter already thickens at the edges and against props. Push it further: Poisson clumps of 5 – 15 cards with bare gaps between them, and larger sizes in the middle of each clump.
- Small details read in aggregate, so a few flat colours in masses beat many unique ones.

**d. Colour variation at three scales.**

- Large: hue patches 5 – 10 m wide from a world-space noise. Some areas are yellower and drier, some bluer and greener.
- Medium: the existing lush and dry blobs.
- Small: the tile itself, sampled at two scales and mixed by noise, so the 6×6 repeat of the grass tile stops showing.
- Tint the plant cards by the ground colour under them, by sampling the wear map at the card's foot. Every grass tuft then matches the patch it grows from.

**e. Contact: where things meet the ground.**

Every object that touches the ground needs a transition. We already have the contact shadow and plants growing against props. Add three things:

- A damp, darker ring.
- Litter piled on the uphill side.
- A moss or grass collar on logs, stumps and posts.

This is what stops objects looking "placed on" the ground.

**f. Check it in greyscale.**

- Screenshot the start view, desaturate it, and threshold it.
- The walkable dirt should read lighter than the grass, and the forest edge darker. If the path disappears in greyscale, it will disappear on a phone in sunlight.
- `tools/camp-probe.cjs` can save that greyscale view next to each screenshot.

## 3. Dirt paths

**Where paths go.**

- Paths are desire lines between the things people use: tent door, fire, wood pile, kitchen crate, laundry, jeep door, and the sloth path.
- They curve round obstacles and never run dead straight.
- They widen where they meet a used spot and where two join.
- `ground.js` already draws paths from the fire to each spot. Add paths between spots that are used together, such as wood pile to fire, and tent to laundry line.
- The thread that is extending the dirt under the hammock and behind the tent should follow the same rule: dirt where feet go, grass creeping back where they don't.

**What a worn path looks like, from the middle out:**

1. **Centre:** bare, compacted dirt, slightly smoother and lighter than loose soil, sunk a few centimetres.
2. **Edge:** ragged, using the height blend from section 2a. Grass tufts creep in, pebbles are kicked aside, and odd roots cross where trees are near.
3. **Verge:** taller grass and flowers, because nobody steps there. This is the opposite of the path, and it frames the path.
4. **In low spots:** a darker, wet patch. The camp has mud near the table and the jeep track already, so add one on the sloth path where it dips.

**The jeep track is a different kind of path.** It should have two ruts with a grass strip down the middle, not one band of dirt. The ruts are already painted. Grass cards on the middle strip and the verges would sell it.

**How to build paths.**

- Paths should be splines in the scene layout (M3), not hand-placed ribbons.
- The GPU bake draws them into the ground mask together with the wear. The page uses the same splines to sink the ground (the heightmap) and to keep plants off.
- The footpath and glade then stop being separate ribbons with polygonOffset. That is two fewer transparent draws and no seam where a ribbon ends.
- Keep the UVs along the path (u across, v along), so the dirt texture's streaks follow the direction of travel. The ribbons do this today; in the mask version, a flow direction in the mask does the same.

## Suggested order

| Step | What | Who | Cost |
|---|---|---|---|
| 1 | Height blend in the ground shader (2a), tile at two scales, plants tinted by the ground (2d) | Ground or atmosphere thread | 0 draws, 0 tris |
| 2 | Paths: more desire lines, verge grass, a grass strip down the jeep track, a wet patch in the path dip (3) | The trodden-dirt-paths thread | A few hundred cards |
| 3 | Leaf litter and moss layers, root strips round the hero trees (2b) | Ground thread; root strips with the deadwood | About 50 tris, +1 texture |
| 4 | Heightmap ground: bowl rim, forest hummocks, tree mounds, sunk paths. One mesh with the forest floor; plants, player and deadwood follow it (1) | Ground thread + GPU bake (layout manifest M3) | About 3k tris, −2 draws (ribbons gone) |

Steps 1 to 3 need no rebake. Step 4 needs the bake to read the same heightmap, which is why it goes last, and through the GPU thread.

## Sources

- [The Level Design Book: landscape massing](https://book.leveldesignbook.com/process/blockout/massing/landscape). Bowls and hollows as safe spaces, paths that bend round obstacles and show who uses them, rule-based ground materials, and detail at material transitions.
- [80.lv: Approaching organic environment building](https://80.lv/articles/approaching-organic-environment-building). Height-blended pebble, grass and dirt; grass clumps; world-position colour variation; breaking tiling at three scales; checking path readability as a threshold image.
- [80.lv: Forest ground Substance breakdown](https://80.lv/articles/forest-ground-substance-breakdown/). Forest floor layers (soil, roots, stones, needles, moss, twigs), built bottom-up, with height driving everything.
- [80.lv: Forest waypoint in UE4](https://80.lv/articles/forest-waypoint-in-ue4-creating-stylized-landscape-and-materials). Smooth, simple terrain; rocks blended into the ground; grass taking the ground colour under it; sparse three-plane grass.
- [80.lv: Giant's End village (Ghibli style)](https://80.lv/articles/giant-s-end-village-making-an-environment-in-the-ghibli-stlye). Moss on top of rock driven by normals, and grass as a kit of painted planes.
- [three.js forum: multiple textured terrain](https://discourse.threejs.org/t/how-to-create-a-multiple-textured-terrain/5069) and [Godot vertex-colour splat shader](https://godotshaders.com/shader/simple-splat-map-shader-for-3d-terrain-uses-vertex-colors-as-splatmap/). Splat-map blending in one draw, as `ground.js` does.
