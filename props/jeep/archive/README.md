# Archived jeep styles

Adriaen kept the Expedition for the camp on 2026-11-12. The Toy and Camper styles are kept here for later use:

- `jeep_toy.glb`, `jeep_camper.glb`: the models.
- `camp_shadow_picked_<jeep>.png`: their baked ground shadows, and `camp_shadow_picked_none.png`, the old day shadow for
  `?jeep=none` (retired by R2-217: the bake always places a jeep, so it could not be made again and had gone stale; `?jeep=none`
  now renders its sun shadows live and paints its night light pools).

`props/jeep/build_jeep.py --style toy|camper` still builds both. The camp page loads models as base64 text, so to
bring one back, write its text copy into the page's models folder with
`base64 -w0 props/jeep/archive/jeep_toy.glb > apps/canopy-prototype/models/jeep_toy.txt`, let `OPT.jeep` in
`apps/canopy-prototype/camp/core.js` accept its name (it takes only `expedition` or `none` now; the `JEEP` setting), and bake
its light with `python props/bake_all.py --jeep <style>`, which writes its ground shadow and night maps.

The base64 copies and the old shadow-caster exports (`casters_picked_<jeep>.glb`, for a ground-shadow bake script that
is gone) were removed on 2026-11-14 (review R2-221): the text copy is one command away, and nothing reads the casters.
