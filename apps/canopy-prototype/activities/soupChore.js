// Camp activities, chunk 2: the soup pot. The pot over the fire starts empty. Carry the water pail (under the snack table) to
// it and pour; take vegetables one at a time from the kitchen crate and drop them in; after two it bubbles for about 20 s and
// is soup. Tap the pot with empty hands to ladle a bowl, carry it to a log seat and set it down: the sloths nearby perk up
// (window event "camp-food"). One pot makes three bowls, then it is empty again. The pot model (props/lived/build_fire.py)
// is not touched: a flat disc at the soup's surface shows it empty, water or broth, and fades away once the soup is done so
// the modelled soup shows. Triangles: the surface disc 12, the pail 60 (camp/canister.js), a bowl 24; bubbles are sprites.
// Exports createSoupChore({ scene, me, pot, fire, carry, burst, toast, told, nearSloth }): { soup (its state), seats,
// wants() (would a tap on the pot do something with what you hold), pour(), addVeg(), ladle(), serve(seat), placePail(table)
// (builds the pail under the table: the caller says when, since things are built in a fixed order), cook (the same steps for
// the operator, camp/operator/cook.js), update(dt, flare) }.
import * as THREE from "three";
import { makePail } from "../camp/canister.js";
import { V } from "../camp/util.js";
import { bowlGeo, bowlMat, bubbleTex, flat, soupGeo, soupMat, surfTex } from "./parts.js";

const COOK = 20, BOWLS = 3;
const STAGE = { empty: 0x2e2824, water: 0x86a9b0, 1: 0xc8a466, 2: 0xd9852f, 3: 0xd6712a };

export function createSoupChore({ scene, me, pot: potAt, fire, carry, burst, toast, told, nearSloth }) {
  const pot = { at: potAt.at.clone(), r: potAt.r };
  const soup = { stage: "empty", veg: 0, cook: 0, bowls: 0, fade: 1 };   // stage: empty, water, cooking, ready
  const surf = new THREE.Mesh(new THREE.CircleGeometry(pot.r + 0.002, 12).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: surfTex, color: STAGE.empty, transparent: true, depthWrite: true }));
  surf.position.copy(pot.at).setY(pot.at.y + 0.012); surf.renderOrder = 1; scene.add(surf);
  const surfCol = new THREE.Color(STAGE.empty), surfTo = new THREE.Color(STAGE.empty);
  const bubbles = Array.from({ length: 10 }, () => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex, transparent: true, depthWrite: false })); o.visible = false; scene.add(o); return { o, live: false, t: 0, life: 1 }; });
  function bubble(big = 1) {
    const b = bubbles.find((q) => !q.live); if (!b) return;
    const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * pot.r * 0.8;
    b.live = true; b.t = 0; b.life = 0.5 + Math.random() * 0.7; b.big = big * (0.02 + Math.random() * 0.025); b.o.visible = true; b.o.position.set(pot.at.x + Math.cos(a) * r, pot.at.y + 0.022, pot.at.z + Math.sin(a) * r);
  }
  function pour() {   // the water goes in: the surface turns to water with a burst of bubbles
    soup.stage = "water"; soup.veg = 0; surfTo.set(STAGE.water); soup.fade = 1;
    for (let i = 0; i < 8; i++) setTimeout(() => bubble(1.4), i * 70);
    burst(pot.at.clone().add(V(0, 0.25, 0)), "splash!", 1, 1.2, 60);
  }
  function addVeg() {
    soup.veg++; surfTo.set(STAGE[Math.min(3, soup.veg)]);
    burst(pot.at.clone().add(V(0, 0.25, 0)), "plop!", 1, 1.2, 60); for (let i = 0; i < 4; i++) bubble(1.2);
    if (soup.veg === 2 && soup.stage === "water") { soup.stage = "cooking"; soup.cook = 0; setTimeout(() => toast("The soup is bubbling 🍲"), 700); }
  }
  function ladle() {   // a bowl out of the pot; after the last one it is empty again
    soup.bowls++;
    if (soup.bowls >= BOWLS) setTimeout(() => { soup.stage = "empty"; soup.veg = 0; soup.bowls = 0; surfTo.set(STAGE.empty); surf.material.opacity = 1; soup.fade = 1; }, 400);
  }
  carry.onPutBack("bowl", () => { if (soup.stage === "ready" && soup.bowls > 0) soup.bowls--; });   // its soup goes back in the pot
  // the bowls on the log seats: each seat holds one; a bowl is eaten up after a while and goes
  const seats = [];
  scene.traverse((o) => { if (/^Seat(_\d)?$/.test(o.name) && o.parent === scene) { const b = new THREE.Box3().setFromObject(o), c = b.getCenter(V()); seats.push({ o, top: b.max.y, c, bowl: null }); } });
  const bowlsOut = [];
  function serve(seat) {
    // set it at the seat's end nearer to you, a little in from the edge, so it doesn't sit under a sloth on the middle of it
    const along = V(1, 0, 0).applyQuaternion(seat.o.quaternion).setY(0).normalize(), toMe = V(me.pos.x - seat.c.x, 0, me.pos.z - seat.c.z);
    const at = seat.c.clone().addScaledVector(along, (toMe.dot(along) >= 0 ? 1 : -1) * 0.32).setY(seat.top);
    const g = new THREE.Group(), s = new THREE.Mesh(soupGeo, soupMat); g.add(new THREE.Mesh(bowlGeo, bowlMat), s); g.position.copy(at); g.scale.setScalar(1.3); scene.add(g);
    const b = { g, s, t: 0, seat }; seat.bowl = b; bowlsOut.push(b);
    const near = nearSloth(at, 4);
    near.slice(0, 2).forEach((sl, i) => setTimeout(() => { sl.nod = 1.6; burst(sl.p.clone().add(V(0, 0.3, 0)), i ? "🍲" : "*sniff sniff*", 1, 2, 60); }, 600 + i * 700));
    dispatchEvent(new CustomEvent("camp-food", { detail: { kind: "soup", at: at.clone() } }));   // for the sloths' own lives (sloth life thread)
  }
  // the water pail, under the snack table out of the way (Adriaen 2026-11-13): between its legs (local x +-0.45), nudged
  // to the fire side of the top's middle so it peeks out; the table's own blocker keeps you off it, so it adds none
  let pail = null, pailAt = null, tableAt = null;
  function placePail(table) {
    const tb = table.at;
    pailAt = (() => { const ax = V(Math.sin(table.yaw), 0, Math.cos(table.yaw));   // the table top's short axis
      const side = Math.sign(ax.dot(V(fire.x - tb.x, 0, fire.z - tb.z))) || 1;
      return tb.clone().setY(0).addScaledVector(ax, side * 0.2); })();
    pail = makePail(); pail.position.copy(pailAt); pail.rotation.y = Math.atan2(fire.x - pailAt.x, fire.z - pailAt.z); scene.add(pail);
    tableAt = tb.clone().setY(0);
    carry.onPutBack("water", () => { pail.visible = true; });   // it stands under the table again
    return { at: pailAt, pail };
  }
  const wantsVeg = () => soup.stage === "water" || (soup.stage === "cooking" && soup.veg < 2);
  return {
    soup, seats, pour, addVeg, ladle, serve, placePail,
    // would a tap on the pot do something with what you hold: pour the water, add a vegetable, fill a bowl
    wants: () => (carry.held === "water" && soup.stage === "empty") || (carry.held === "veg" && (soup.stage === "water" || (soup.stage === "cooking" && soup.veg < 3))) || (!carry.held && soup.stage === "ready"),
    // the operator makes the soup now and then (camp/operator/cook.js): the same pot and pail, step by step; each step says
    // whether it could be done (you may have done it first)
    cook: {
      get pail() { return pailAt; }, get table() { return tableAt; },
      can: () => soup.stage === "empty" && pail.visible && carry.held !== "water",
      takePail() { if (!pail.visible || soup.stage !== "empty" || carry.held === "water") return false; pail.visible = false; return true; },
      pour() { pail.visible = true; if (soup.stage !== "empty") return false; pour(); soup.by = "operator"; return true; },
      wantsVeg,
      addVeg() { if (!wantsVeg()) return false; addVeg(); return true; },
      get stage() { return soup.stage; },
      ladle() { if (soup.stage !== "ready" || soup.bowls >= BOWLS) return false; ladle(); return true; },
      handToYou() { if (carry.held) return false; carry.hold("bowl"); toast("A bowl of soup for you 🍲", "clink"); return true; },   // into your hands, if they're free
      setDown() { const s = seats.filter((q) => !q.bowl).sort((a, b) => flat(a.c, me.pos) - flat(b.c, me.pos))[0]; if (!s) return false; serve(s); return true; },   // else on the seat nearest you
    },
    // the pot: the surface eases to its stage's colour; cooking bubbles harder as it goes (faster with a big fire: flare),
    // then the disc fades and the modelled soup shows
    update(dt, flare) {
      surfCol.lerp(surfTo, Math.min(1, dt * 1.5)); surf.material.color.copy(surfCol);
      if (soup.stage === "cooking") {
        soup.cook += dt * (1 + 0.25 * flare); const k = Math.min(1, soup.cook / COOK);
        if (Math.random() < dt * (2 + 10 * k)) bubble(0.8 + 0.6 * k);
        if (k >= 1) { soup.stage = "ready"; soup.fade = 1; const s = nearSloth(fire, 6)[0]; if (s) { s.nod = 1.6; burst(s.p.clone().add(V(0, 0.3, 0)), "*smells good*", 1, 2.2, 60); } toast("Soup's ready 🍲", "clink"); if (soup.by === "you") told("soup"); }
      } else if (soup.stage === "ready") {
        soup.fade = Math.max(0, soup.fade - dt / 2); surf.material.opacity = soup.fade; surf.visible = soup.fade > 0.01;
        if (Math.random() < dt * 2) bubble(0.7);
      } else { surf.visible = true; surf.material.opacity = 1; if (soup.stage === "water" && Math.random() < dt * 0.6) bubble(0.6); }
      for (const b of bubbles) { if (!b.live) continue; b.t += dt; const k = b.t / b.life; b.o.scale.setScalar(b.big * (0.4 + k)); b.o.material.opacity = 1 - k * k; if (k >= 1) { b.live = false; b.o.visible = false; } }
      // bowls on the seats: the soup goes down over a minute and a half, then the bowl is taken away
      for (let i = bowlsOut.length - 1; i >= 0; i--) { const b = bowlsOut[i]; b.t += dt;
        b.s.position.y = -0.03 * Math.min(1, b.t / 90); b.s.visible = b.t < 90;
        if (b.t > 120) { scene.remove(b.g); b.seat.bowl = null; bowlsOut.splice(i, 1); } }
    },
  };
}
