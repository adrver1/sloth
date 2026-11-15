# Archived camp sets

Adriaen picked the camp's own prop set on 2026-11-12 (camp review). The earlier styles are kept here for later use:

- `camp_storybook.glb`, `camp_rustic.glb`, `camp_jungle.glb`: the Storybook, Rustic and Jungle sets, each one GLB with
  six objects (Fire, Seat, Tent, Hammock, Lantern, Table), each at its own origin.
- `camp_picked.glb`: the first picked set, from before the light map.

`build_camp_styles.py` here holds their builders, moved out of `props/camp/build_camp.py` unchanged (review R2-258;
the props they share with the picked set, the rustic seat and table and the materials, are imported from it).
`props/camp/archive/build_camp_styles.py --style storybook|rustic|jungle` remakes one, with its own AO bake, into
`props/camp/out/` (git-ignored), or over the GLB here with `--overwrite-archive` (see the script's docstring). The first
picked GLB is not remade: the picked set now comes from the light bake, `props/camp/bake_camp_lightmap.py`. The camp page loads models as base64 text, so to try one in the page again, write its text copy
with `base64 -w0 props/camp/archive/camp_rustic.glb > camp_rustic.txt`. The page has no code for these sets any more:
it is in git history.

The base64 copies that sat next to each GLB were removed on 2026-11-14 (review R2-221), since each is one command away.
