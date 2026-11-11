# sloth

This repo holds the baby sloth character and the fun pages made with it: karaoke, synth, stickers and small games. README.md says what is where. The full history of how each piece was made, and every pick Adriaen made, is in `docs/threads/`.

## Rules

- The apps are published as artifacts; README.md lists their URLs. The source of truth is `apps/<name>/`. Edit it there, then republish to the same URL, so the link stays the same.
- Show a change to Adriaen as a screenshot or a republished page. Adriaen reviews on a phone, so check both a phone-sized and a desktop-sized view.
- You can't hear audio in a cloud session. Say so whenever you change a sound, because Adriaen checks the mix by ear and found the didgeridoo far too loud the first time.
- Keep every asset variant: sloth styles `plush`, `baby` and `plush_real`, and the flat sticker set as a backup to the furry one.
- `characters/sloth_baby/` is the sloth's source; its GLBs are generated from it. The character kit, the ponytail engineer and the bearded operator live only in desk-at-night, pulled in as the `engine/` submodule. Never copy them here. Make a fix to them as a PR in desk-at-night, then move the submodule pin.
- In a cloud session, attach both adrver1/sloth and adrver1/desk-at-night, and run `git submodule update --init --depth 1`.
- Use as few triangles as we can get away with while it still looks good (Adriaen, 2026-11-11). Think twice about where they go: spend them on silhouettes and things seen up close, and paint detail into colours or textures instead of modelling it (bamboo rings, planks, log stacks). Don't let tools add hidden detail, such as subdividing just for AO bakes, caps no one sees, or high segment counts on small parts. Print a triangle count per object for every model you export, and say it when you show a change.
- Stickers must be fully cut out, with no clipped heads. Animated stickers must stay under 500 KB at 512×512, because that is WhatsApp's limit.
