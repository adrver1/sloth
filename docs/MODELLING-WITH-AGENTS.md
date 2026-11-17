# Modelling with agents

How Claude threads build, change and check 3D models in this repo: props in `props/`, the sloth in `characters/sloth_baby/`, and anything else exported to Canopy Camp or Summit Cabin. Adriaen agreed to it on 2026-11-17 (thread "Discuss AI-aided modelling"). It combines what this project learned with what others report (sources at the end). The triangle rules in `CLAUDE.md` and the code rules in `docs/CODING-STANDARDS.md` still apply; this file is about the modelling loop.

## 1. What to model with code, and what not

- **Good fit:** things made of measurable parts. Hard-surface props, buildings, furniture, the jeep, tents, fences, rope and chain, terrain and scatter, and characters built on a kit that already exists (the sloth rig, the desk-at-night kit in `engine/`). Code is exact at sizes, symmetry, repetition and keeping triangle counts low.
- **Hard:** organic shapes judged by feel, such as faces, cuteness, animal proportions, cloth drape, hands and natural rocks. Expect several rounds with Adriaen and plan for them.
- **Out of reach in the cloud:** sound (no audio here) and motion timing judged by feel. Say so and leave the call to Adriaen.
- **Known weak spots of agents:** running code is not the same as a correct shape. Agents mis-place parts (floating, poking through), mix up axes (Blender is Z-up, three.js Y-up), wind faces the wrong way, get the scale wrong, and drift into "geometry soup" when they change many things without looking. Boolean and multi-object constructions are the hardest kind of task.

## 2. How to build

1. **Parametric generator, not a one-off mesh.** Named sizes in metres at the top of the builder, `make()` and `build()` as in `docs/CODING-STANDARDS.md` section 12. A tweak is then one line and git keeps the history.
2. **Start with a brief.** Write down where it stands, how close the player gets, its real size, a reference photo or sketch, and a triangle budget. "Like this photo, 40 cm tall, seen from 2 m" beats a paragraph.
3. **Silhouette first.** Block it out and look from the game camera (phone and desktop) before adding detail. Spend triangles on the outline and on what the player sees up close.
4. **Paint detail rather than modelling it.** Render a detailed version onto a simple block (the 94-triangle `WoodStack` with `wood_stack.jpg`), or use textured quads (the soup pot chain, the laundry). Keep the detailed source in the script as the render source only.
5. **Show 2 or 3 options** that differ in structure, and wait for a pick (the `prototype` skill).
6. **AI 3D generators (text or image to 3D)** are for concepts, blockouts and the odd organic hero shape, not for shipping as they come. Their meshes are dense and their textures carry baked lighting. If one is used: keep the high-res source, decimate or retopologise to the budget in Blender, bake colour (and AO if needed) onto the low-poly mesh, judge it under neutral light, and record the tool, version and prompt in the prop's log. Count cost per accepted asset; clean-up usually costs more than generation.
7. **No hidden cost.** No subdividing only for a bake (the first hammock reached about 7k triangles that way), no caps nobody sees, no high segment counts on small parts. Bakes run only on the GPU thread (`props/bake_all.py`), sent through the coordinator.

## 3. The loop: one change, then look

- **One change per round.** Name the target ("eyes 30% smaller") and what must not change (the protected part: "head shape, ears, fur colours"). Fixing one part often breaks the joint next to it, so look there too.
- **Look after every change.** Never stack several edits without a render. Use the check sheet in section 4.
- **Better, same or worse.** Compare before and after from the same cameras. Keep only changes that are better; revert the rest.
- **Three strikes.** If the same problem fails three times, stop and ask Adriaen, with the three attempts side by side.
- **Turn vague feedback into measurable corrections** before editing. "Cuter" becomes, for example, "head 10% larger relative to the body, eyes lower, snout shorter", and say which reading you chose.

## 4. The check sheet

Every model shown to Adriaen comes with:

- Four angles (front, side, back, three-quarter from above) plus a view from below and a close-up at the nearest distance the player gets.
- The game view at phone and desktop size.
- A wireframe (`props/lived/build_lived.py --parts` writes a per-piece GLB for one).
- Triangles per object, and the change from before.
- The audit line per object from `props/lib/audit.py` (it runs on every export): enclosed and player-hidden triangles, back-only faces, flips, overlaps.
- Specific geometry checks for the prop where a general audit cannot tell: is the part round from below, does it touch the ground, does it clear the things next to it.

## 5. A separate review pass

The agent that made a change does not judge it alone, because self-review is too lenient: a model that looked fine from the front once stayed a box from the side. Before showing a model, run a review that only looks and reports, without editing. A subagent with the check sheet and the brief, but not the maker's conclusion, is the easy way. It answers: does it match the reference and the brief, what is wrong from each angle, what costs triangles for nothing. The maker then fixes, and the loop in section 3 continues.

## 6. A log per model

Each model in active work keeps a short log in `docs/models/<name>.md`, so a later thread does not undo a pick or repeat a failed attempt. One entry per round:

```
## 2026-11-17 round 3
- Target: eyes 30% smaller (Adriaen)
- Protected: head shape, ears, fur colours
- Change: EYE_R 0.060 -> 0.042 in build_sloth.py
- Tris: Head 412 -> 412, total 2,310 -> 2,310
- Verdict: better (Adriaen picked it)
```

Adriaen's lasting picks also go where the code can see them: a comment in the builder citing Adriaen and the date.

## Sources

- What this project learned: `docs/threads/`, and the triangle rules in `CLAUDE.md`.
- [3D-Agent: architecture learnings, Blender forum](https://forum.blender.org/t/3d-agent-blender-ai-assistant-built-a-multi-agent-system-on-top-of-blenders-mcp-and-python-api-and-sharing-architecture-learnings-for-the-lab-discussion/44260): screenshots after each step, planning apart from code, narrow tasks.
- [Making better 3D modelling with Blender MCP, Zenn](https://zenn.dev/test_myname/articles/gpt-5-6-blender-mcp-modeling?locale=en): maker and reviewer apart, one change with a protected area, better/same/worse gate, three strikes, structured log.
- [VoxelCodeBench, arXiv 2604.02580](https://www.emergentmind.com/papers/2604.02580): executable code is far easier than spatially correct output.
- [AI 3D model generators for game development, Wavect](https://wavect.io/blog/ai-3d-model-generators-game-development-2026/): generated is not game-ready, where generators work, the retopologise-and-bake workflow, cost per accepted asset.
