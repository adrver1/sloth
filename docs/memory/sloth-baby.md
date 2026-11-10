---
name: sloth-baby
description: characters/sloth_baby looks, its own rig and clips, and the ponytail engineer's play clip with two sloths (PR #146)
metadata:
  type: project
---

- 2026-10-28: sloth added (cream mask, dark teardrop eye patches). Builds need libegl1.
- 2026-11-04: Adriaen picked play style swing, and the sloth got its own rig (characters/sloth_baby/sloth_rig.py: idle, walk crawl at WALK_SPEED, cling under CLING_BRANCH); sloths cling under her forearms (anims.PLAY_HOLD). PR #146. Preview https://claude.ai/artifact/UUimcJPizJcUjnNKU6TyWd (source in /mnt/project-files/control-room-game/sloth-play/).
- 2026-11-04 later: Adriaen "keep it" + asked for real sloth limbs/locomotion. Added plush_real style, belly crawl walk, hang_walk (PR #146).

Character: [[ponytail-character]].
- 2026-11-04 20:55: Adriaen asked for all play styles back + a titanic pose: every PLAY_STYLE now baked (play = swing, play_airplane, play_knees, play_titanic); PLAY_PREVIEW removed. Claws/pads skinned per limb (region claw:arm.R).
- 20:57: titanic = the SLOTH does the bow pose (sloth clip titanic), held up by the waist by her (play_titanic, PLAY_HOLD hand.R); not her arms out.
- 21:02: live sloth STYLE = plush_real (sloth_baby.glb), old plush = sloth_baby_plush.glb. No sloth on her back (Adriaen: looks weird); second sloth sits on the floor watching.
- 21:11: waiting sloth clings to her shin (PLAY_HOLD ("leg", shin, belly)), not the floor. Page bug fixed: look up her bones before parenting sloths (same bone names).
- 21:25: scorecard fixes applied on Adriaen's yes (commit 48f9a19): one-piece hooked claws (`hook`), hidden faces dropped (head facets under mask, limb roots, neck cap), clips exported every 3rd frame, `pack_chars.mjs --own` packs a model with its own clips.
- 21:50: WhatsApp sticker pack (512 WebP, tray.png): https://claude.ai/artifact/AVmE22wrhF7VzAFbncbUsg; zip + tools in /mnt/project-files/sloth-stickers/.
- 21:55: sitting arms fixed (commit 72d68ec). Catch the Baby game: https://claude.ai/artifact/Vo8KXUVinCcxegRHpVaWSD. Source: /mnt/project-files/sloth-stickers/catch-the-baby/.
- 14:20: PR #146 merged into main (with #152 inside).
- 15:33: Adriaen kept only the live sloth row (char_sloth_baby) in the Big Asset Scorecard; plush/baby rows removed there (models stay in repo). Don't re-add them.
- 2026-11-05 21:10: re-rendered page/game/stickers from main's models. Adriaen: stickers must be fully cut out by us and framed with no clipped heads: render.html fit() pulls the camera back to include everything (above cutY for bust shots, cut straight across below the chest); stk_post.py fails if the subject touches the frame.

2026-11-05 22:00: fur picked = 4 merged shell layers (fur.js, default shells 4, ?fur=0 = original flat backup); page, game, stickers republished with it; flat stickers kept as sloth-stickers-flat.zip. Fur options page GNGvhQsK1cAjVCh1jdyLzA, source /mnt/project-files/sloth-fur/. PR #160: mask skirt 12 mm + limb/neck caps + smooth mask, live 826 tris; guide audit clean (0 z-fight/slivers/flips/inside-out).
- 2026-11-06: animated stickers (13, 12 fps 2-4 s loops, <500 KB, renderAnim one camera per loop, stk_anim.cjs + stk_anim_post.py) on the sticker page "Animated" tab; sloth-stickers-animated.zip. Hearts 14-18 + 19 family (her + bearded_operator swing the sloth), sloth-hearts.zip.
- 2026-11-05 22:20: Sloth Karaoke https://claude.ai/artifact/1XERJCtCi5Gb3uLF8iHvLj (source /mnt/project-files/sloth-stickers/karaoke/): pastel stage, original song "Slow, Slow" (WebAudio band, guide tune toggle), synced lyrics, her mic via 2-bone IK + jaw, 3 fur sloths. 2026-11-07: 2nd song Party Paws (default; ?song=slow): 4-sloth band with solos. 2026-11-08: 3rd song G’day, Slow Day (?song=aussie): outback, kookaburra, crowd platypus/wallaby/wombat/echidna, sunnies + cork hats.
- 2026-11-07: Sloth Synth (modular synth, 12 sloth modules, drag/tap cables, saves patch in localStorage) https://claude.ai/artifact/DdhRtkw7MLCyHAP7EKdfPu, source /mnt/project-files/sloth-stickers/synth/.
