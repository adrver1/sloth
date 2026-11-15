// Canopy Camp forest: the clearing floor with the path and track ribbons (the layout itself is layout.js), the two big mossy
// trees with their low branches, the forest wall of trunks, leaves in culled wedges, ferns and verge plants. The steps live in
// camp/forest/: base.js (the forest stream, the track, trackDist), floor.js (ribbons and the grass tile), trees.js (bark, the
// big trees, the wall, the crowns), cards.js (the leaf card, the scatter, the culled sectors) and plants.js (leaf clumps, verge, ferns).
// Exports buildForest() (main.js, once), FLOOR_OVERLAYS, branchCurves (the big trees' low branches), grassTex (the clearing's
// grass tile, for campGround.js), track and trackDist, and for glade.js's bushes leafGeo, leafM, perClump, cards(n), scatterLeaves,
// clumpN and withLeafN (the leaf card, its material, how many leaves a clump draws from its stream, how many of n become cards,
// the leaf scatter every leafy thing shares, a leaf's light normal and the card geometry that carries them).
import { track, trackDist } from "./forest/base.js";
import { FLOOR_OVERLAYS, clearingFloor, grassTex, trackRoad } from "./forest/floor.js";
import { branchCurves, crowns, forestWall, heroTrees } from "./forest/trees.js";
import { cards, clumpN, leafCard, leafGeo, leafM, perClump, scatterLeaves, withLeafN } from "./forest/cards.js";
import { ferns, verge, wallLeaves } from "./forest/plants.js";

// buildForest (main.js, once, right after the sky) runs the steps below in this order. Every step but the crowns and the
// verge draws from the forest stream, so the order is what keeps the forest as it was baked: do not move a step.
function buildForest() {
  clearingFloor();               // the grass tile and the footpath to the glade
  trackRoad();                   // the jeep's dirt road and the tyre ruts (not with ?jeep=none)
  heroTrees();                   // the two big mossy trees, their low branches and lianas: one draw of bark
  const wall = forestWall();     // the forest wall's trunks, each on a root mound
  leafCard();                    // the leaf card everything leafy shares (leafGeo, leafM, perClump, leafScale)
  const clumps = wallLeaves(wall);   // the leaf clumps on the wall, the branches, the big crowns and the eye-height edge
  crowns(wall, clumps);          // limbs into the clumps and a crown on each near forest tree (its own stream)
  verge();                       // bushes along the jeep's track (its own stream)
  ferns();                       // ferns and undergrowth round the clearing
}

export { buildForest, FLOOR_OVERLAYS, branchCurves, cards, clumpN, grassTex, leafGeo, leafM, perClump, scatterLeaves, track, trackDist, withLeafN };
