# Archived jeep styles

Adriaen kept the Expedition for the camp on 2026-11-12. The Toy and Camper styles are kept here for later use:

- `jeep_toy.glb`, `jeep_camper.glb`: the models.
- `jeep_toy.txt`, `jeep_camper.txt`: the same, base64 for the camp page.
- `camp_shadow_picked_<jeep>.png`: their baked ground shadows.
- `casters_picked_<jeep>.glb`: the shadow-caster exports.

`props/jeep/build_jeep.py --style toy|camper` still builds both. To bring one back, put its glb back in `props/jeep/` and its
txt in `apps/canopy-prototype/models/`, let `OPT.jeep` in `apps/canopy-prototype/camp/core.js` accept its name (the `JEEP`
setting), and bake its light with `python props/bake_all.py --jeep <style>`, which writes its ground shadow and night maps.
