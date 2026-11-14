// Canopy Camp operator, what he says: words of encouragement and love to his life partner, "bonita" (Adriaen, 2026-11-12),
// in pools by what he is doing, with remarks on what you just did and a few for sitting with you and for cooking. Lines
// come from a shuffled bag per pool, so none repeats until all have been said; the bags are kept in the camp save
// (camp/save.js, part "operator"; Adriaen: a reload carries on where he left off), read once when this module loads.
// Exports LINES, bag, pickLine(pool) and line() (the line for what he is doing now).
import { load, save } from "../save.js";
import { mug } from "./handProps.js";
import { op } from "./state.js";

const LINES = {   // spoken to his life partner, "bonita" (Adriaen, 2026-11-12)
  awake: [
    "You're doing great, bonita. You know that?", "I'm so glad it's you I get to share this with.", "Proud of you. Always, bonita.",
    "You mean more to me than you know.", "Whatever today was, you made it through. I'm right here.", "Be gentle with yourself today, my love.",
    "Small steps are still steps. I'll walk them with you.", "I love you, exactly as you are.", "My favourite part of the day? Seeing you.",
    "Take your time, bonita. Nobody rushes in our camp.", "You've got this. And if not, we'll figure it out together.",
    "The world's a bit warmer with you in it. Mine especially.", "Breathe in... and out. There you go, bonita.",
    "You don't have to carry it all alone. That's what I'm for.", "I believe in you. Always have.", "The sloths adore you. Not as much as I do.",
    "Rest a little, my love. You've earned it.", "You're braver than you feel right now, bonita.", "Look how far you've come. I'm so proud.",
    "It's okay to not be okay. I'm right here, always.",
  ],
  eat: ["I saved you the best bowl, bonita.", "Good food, and you beside me. That's all I need."],
  read: ["This book is good, but you're my favourite story.", "Every story has a hard chapter. Ours only gets better."],
  drink: ["Come sit with me, bonita. I made enough for two.", "A warm drink and you. Perfect evening."],
  warm: ["Come warm your hands with me, my love.", "The fire's nice, but you light up the whole camp."],
  play: ["Look at them, bonita! They get that smile from you.", "Want a turn? They love you almost as much as I do."],
  thanks: ["Mm, the {food}! Thank you, bonita.", "You always know what I need, my love.", "Food tastes better from you, bonita.",
    "Delicious. You spoil me, my love.", "Thank you, bonita. Come share it with me."],
  sleep: ["Mmm... love you too, bonita...", "Zz... you're doing fine, my love... zz", "Mm... come here... sleep well, bonita..."],
  // remarks on what you just did (activities.js / input.js "camp-act"; Adriaen 2026-11-13)
  react_log: ["Look at that fire go, bonita.", "You've got the touch with that fire, my love."],
  react_water: ["Soup night? I like where this is going."],
  react_veg: ["Chef bonita at work.", "Smells like home already."],
  react_soup: ["You made soup for all of us. I love you."],
  react_feed: ["You're spoiling them, bonita. Keep going.", "{name} adores you. Join the club."],
  react_boop: ["Did you just boop {name}? Adorable. Both of you."],
  // sitting with you by the fire
  fire: ["This. Right here. My favourite place.", "Listen to that fire... and the sloths snoring.", "Lean on me if you're tired, bonita.",
    "Remember our first campfire? You burned every marshmallow.", "I'd sit by any fire, as long as it's with you."],
  cookStir: ["Almost ready, one more stir.", "Secret ingredient? Love. And a carrot."],
  cookGive: ["For you, bonita. Careful, it's hot.", "Made with love. And maybe too much onion."],
};
// the lines still to come are kept in the camp save (camp/save.js; Adriaen: a reload carries on where he left off); lines no longer in LINES drop out
const bag = (() => { try { const b = { ...(load("operator")?.lines || {}) }; for (const k in b) b[k] = Array.isArray(b[k]) ? b[k].filter((l) => LINES[k]?.includes(l)) : []; return b; } catch { return {}; } })();
function line() {
  // an activity's own lines only once he is actually at it (the bowl, the book, the mug, his hands at the fire, a sloth in his
  // hands), not on the walk there; asleep, only the sleepy ones; otherwise the general lines
  const doing = { eat: !!op.eat, read: op.ik?.book > 0.4, drink: !!op.inHand && op.inHand === mug, warm: op.kind === "warm" && !!op.ik?.R, play: !!op.carry }[op.kind];
  const k = op.sleeping ? "sleep" : op.kind === "join" && op.seated && Math.random() < 0.5 ? "fire" : (doing && Math.random() < 0.35 ? op.kind : "awake");
  return pickLine(k);
}
function pickLine(k) {   // the next line from a pool's shuffled bag (kept in the camp save)
  if (!bag[k]?.length) bag[k] = [...LINES[k]].sort(() => Math.random() - 0.5);
  const l = bag[k].pop(); save("operator", { lines: bag }); return l;
}

export { LINES, bag, line, pickLine };
