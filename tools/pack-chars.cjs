// Packs the camp's characters into its base64 page copies (review R2-039): desk-at-night's engine/web/scripts/pack_chars.mjs
// slims each GLB (quantized vertices, resampled clips), then each result goes base64 into apps/canopy-prototype/models/.
//   node tools/pack-chars.cjs sloth      characters/sloth_baby/sloth_baby.glb (the live plush_real style, with its own clips)
//                                        -> models/sloth.txt                                     (npm run pack:sloth)
//   node tools/pack-chars.cjs operator   engine/characters/bearded_operator/bearded_operator_<OPERATOR_OUTFIT>.glb (mesh, no
//                                        clips) -> models/operator.txt, and the OPERATOR_CLIPS of bearded_operator_survival.glb
//                                        (the same rig, with the play clips) -> models/operator_anims.txt (npm run pack:operator)
// OPERATOR_OUTFIT is the look he wears in the camp: camp_cargo, the olive field shirt with two flap pockets and sand cargo
// trousers (R2-200 look B, Adriaen's pick). desk-at-night builds the other outfits too (office, camp_khaki, camp_vest, ppe,
// ppe_deck, survival; build_bearded_operator.py --outfit): change the constant and repack to switch.
//   node tools/pack-chars.cjs operator_winter   engine/characters/bearded_operator/bearded_operator_<WINTER_OUTFIT>.glb (mesh, no
//                                        clips; the same rig, so operator_anims.txt plays on it) -> models/operator_winter.txt,
//                                        what he wears at the Summit Cabin (npm run pack:operator-winter). WINTER_OUTFIT is
//                                        winter_a, the puffer and beanie (Adriaen 2026-11-15; winter_b and winter_c are kept).
// Rebuild the GLB first: the sloth with python characters/sloth_baby/build_sloth_baby.py, the operator in desk-at-night (then
// move the engine/ pin). pack_chars.mjs needs desk-at-night's packages: run npm ci once in engine/web. PACK_CHARS=<path to
// pack_chars.mjs> uses another desk-at-night checkout's copy. The kit is only read from engine/, never copied here.
const path = require('path'), fs = require('fs'), os = require('os'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), MODELS = path.join(ROOT, 'apps/canopy-prototype/models');
const PACK = path.resolve(process.env.PACK_CHARS || path.join(ROOT, 'engine/web/scripts/pack_chars.mjs'));
const OP = path.join(ROOT, 'engine/characters/bearded_operator');
// the outfit the camp's operator wears (see the header); 'office' is the plain bearded_operator.glb
const OPERATOR_OUTFIT = 'camp_cargo';
const OPERATOR_GLB = OPERATOR_OUTFIT === 'office' ? 'bearded_operator.glb' : `bearded_operator_${OPERATOR_OUTFIT}.glb`;
// the outfit he wears at the Summit Cabin (see the header)
const WINTER_OUTFIT = 'winter_a';
// the clips the camp plays on the operator (camp/operator/), kept in operator_anims.txt; add a clip here when the camp plays a new one.
// Only those are packed (review R2-213: hug, play, play_knees, phone, phone_down and step_down were 40% of the keyframes and
// never played)
const OPERATOR_CLIPS = ['idle', 'walk', 'seated_idle', 'stand_up', 'sip', 'play_titanic', 'play_airplane', 'wave', 'blink', 'happy', 'talk'];

const what = process.argv[2];
if (!['sloth', 'operator', 'operator_winter'].includes(what)) { console.error('usage: node tools/pack-chars.cjs sloth|operator|operator_winter'); process.exit(2); }
if (!fs.existsSync(PACK)) { console.error(`${path.relative(ROOT, PACK)} is missing: run git submodule update --init --depth 1`); process.exit(2); }
if (!process.env.PACK_CHARS && !fs.existsSync(path.join(ROOT, 'engine/web/node_modules/@gltf-transform/core'))) {
  console.error('pack_chars.mjs needs desk-at-night\'s packages: run npm ci in engine/web first'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-chars-'));
const pack = (args, glb) => {
  if (!fs.existsSync(glb)) { console.error(`${path.relative(ROOT, glb)} is missing`); process.exit(2); }
  const out = fs.mkdtempSync(path.join(tmp, 'out-'));
  const r = spawnSync(process.execPath, [PACK, ...args, out, glb], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  return out;
};
const toTxt = (glb, name) => {
  const to = path.join(MODELS, name);
  fs.writeFileSync(to, fs.readFileSync(glb).toString('base64'));
  console.log(`${path.relative(ROOT, to)}: ${(fs.statSync(to).size / 1024).toFixed(0)} KB`);
};
try {
  if (what === 'sloth') {
    toTxt(path.join(pack(['--own'], path.join(ROOT, 'characters/sloth_baby/sloth_baby.glb')), 'sloth_baby.glb'), 'sloth.txt');
  } else if (what === 'operator_winter') {
    const glb = `bearded_operator_${WINTER_OUTFIT}.glb`;
    toTxt(path.join(pack([], path.join(OP, glb)), glb), 'operator_winter.txt');
  } else {
    toTxt(path.join(pack([], path.join(OP, OPERATOR_GLB)), OPERATOR_GLB), 'operator.txt');
    toTxt(path.join(pack(['--clips', OPERATOR_CLIPS.join(',')], path.join(OP, 'bearded_operator_survival.glb')), 'anims.glb'), 'operator_anims.txt');
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
