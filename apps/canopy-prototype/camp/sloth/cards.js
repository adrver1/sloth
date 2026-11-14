// Canopy Camp sloths, cards (Adriaen 2026-11-12: "sloths playing cards together, of course with the occasional dozing
// off"): now and then two sloths climb onto the two ends of the table, facing each other, each holding a fan of three
// cards in its left paw. In turn, slowly, one reaches out and lays a card on the pile between them. Now and then one nods
// off mid-game (eyes shut, head sinking, a z) and the other waits for it. After a minute or two they climb down and go
// home. Cards: quads (2 triangles each) with one painted texture, a fan of 3 per player and a pile of at most 8: 44
// triangles while they play.
//   buildCards()              paints the card and makes its material and shape (sloths.js, in its place in the build order)
//   startCards(a, b, leave)   a and b (both at home, awake) go and play at the table: each gets its end of the table and
//                             leave(s) sends it off; false when the table is in use or a game is on
//   cardsSit(s, T)            up on the table (eating.js eatStep brings it there): takes its cards
//   cardsStep(s, T, sd)       its turn at the game, each frame; when the game is over it climbs down and its trip's done()
//                             runs (eating.js startEat)
//   quitGame(s)               its game ends (it was borrowed: lend.js); the other one goes home
// The game's length, the pauses and where a card lands draw from the sloths' stream (core.js rng("sloths")) as they happen.
import * as THREE from "three";
import { rng, scene } from "../core.js";
const { R } = rng("sloths");
import { V, canvasTex } from "../util.js";
import { claim, release, taken } from "../places.js";
import { play, playOnce } from "./clips.js";
import { move } from "./moves.js";
import { lpawOf } from "./arms.js";
import { pois } from "./table.js";
import { wakeUp } from "./naps.js";

let cardMat = null, cardGeo = null, game = null;
const pile = [], lpaw = V(), q0 = new THREE.Quaternion();
function buildCards() {
  const cardTex = canvasTex(64, 96, (g) => { g.fillStyle = "#fff8ee"; g.fillRect(0, 0, 64, 96); g.strokeStyle = "#c9a27a"; g.lineWidth = 4; g.strokeRect(3, 3, 58, 90);
    g.fillStyle = "#e0566f"; g.beginPath(); g.moveTo(32, 66); g.bezierCurveTo(4, 44, 18, 22, 32, 38); g.bezierCurveTo(46, 22, 60, 44, 32, 66); g.fill(); });
  cardMat = new THREE.MeshLambertMaterial({ map: cardTex, side: THREE.DoubleSide }); cardGeo = new THREE.PlaneGeometry(0.055, 0.08);
}
function startCards(a, b, leave) {                  // a and b (both at home, awake) go and play at the table
  const P = pois().find((q) => q.name === "table"); if (!P || P.slots.length < 2 || game) return false;
  if (P.slots.some((q) => q.who || taken(q.key))) return false;
  game = { P, players: [a, b], over: false, len: R(70, 120), t: 0, turn: 0 };
  [a, b].forEach((s, i) => { const slot = P.slots[i]; slot.who = s; claim(slot.key, s); s.cardsTo = slot; if (s.trip.phase === "home") leave(s); });
  return true;
}
function quitGame(s) { if (game?.players.includes(s)) game.over = true; }
function cardsSit(s, T) {
  T.st = "cards"; T.t = 0; T.next = R(3, 6); play(s, "idle", 1);
  if (!s.hand) { s.hand = new THREE.Group(); for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(cardGeo, cardMat); c.position.set((k - 1) * 0.016, 0.04, k * 0.002); c.rotation.z = (1 - k) * 0.35; s.hand.add(c); } scene.add(s.hand); }
  s.hand.visible = true;
}
function cardsStep(s, T, sd) {
  const g = game, other = g?.players.find((q) => q !== s);
  lpawOf(s, lpaw); s.hand.position.copy(lpaw).y += 0.05 * s.sc / 2; s.hand.quaternion.copy(s.o.quaternion).multiply(q0.setFromAxisAngle(V(1, 0, 0), 0.35)); s.hand.scale.setScalar(s.sc / 2);   // held up before it, faces toward it
  if (!g || g.over) {                               // the game's over: down off the table and home
    if (s.dozing) { wakeUp(s); s.yawn = 1e-3; }
    if (s.once) return;
    s.hand.visible = false; T.st = "done"; play(s, "hang_walk", 1, -2); T.yaw = T.slot.yaw;
    return move(s, T, T.slot.p.clone(), 3.5, 0.12, -0.5, () => { T.slot.who = null; release(T.slot.key, s); if (g && g.players.every((q) => q.trip.st === "done" || q.trip.phase !== "eat")) { pile.forEach((c) => (c.visible = false)); game = null; } T.done(); });
  }
  if (s.dozing) {                                   // nodded off mid-game
    s.dozeT -= sd; if (s.dozeT < 0 || s.squish > 0.9) { wakeUp(s); s.yawn = 1e-3; T.next = R(2, 4); }
    return;
  }
  if (other?.trip.st !== "cards") return;           // wait for the other to sit down
  g.t += sd / 2; if (g.t > g.len) g.over = true;
  if (s.once) {                                     // laying a card: at the reach's far end it goes onto the pile, then back to sitting
    if (!T.laid && s.act.time > 1.7) { T.laid = true; const c = pile.find((q) => !q.visible) ?? (pile.length < 8 ? (pile.push(new THREE.Mesh(cardGeo, cardMat)), pile.at(-1)) : pile[0]); scene.add(c); c.visible = true;
      const u = g.P.slots[0].u, mid = g.P.c.clone().add(V(-u.z, 0, u.x).multiplyScalar(0.22));   // beside the fruit plate, between them
      c.position.set(mid.x + R(-0.03, 0.03), T.slot.h + 0.004 + pile.filter((q) => q.visible).length * 0.002, mid.z + R(-0.03, 0.03)); c.rotation.set(-Math.PI / 2, 0, R(0, 6.3)); }
    if (s.act.time > 2.3) { s.once = null; play(s, "idle", 0.9); g.turn = 1 - g.players.indexOf(s); T.next = R(4, 8); }
    return;
  }
  if (g.turn !== g.players.indexOf(s)) { if (other.dozing && T.t % 7 < sd) s.nod = 1; return; }   // its turn? (a nod at a sleeping partner)
  T.next -= sd;
  if (T.next < 0 && !other.dozing) {
    if (R(0, 1) < 0.18) { s.dozing = true; s.asleep = true; s.eyes(true); s.dozeT = R(10, 22); g.turn = 1 - g.turn; return; }   // dozes off instead
    T.laid = false; playOnce(s, "eat", 0.8, () => {});
  }
}

export { buildCards, cardsSit, cardsStep, quitGame, startCards };
