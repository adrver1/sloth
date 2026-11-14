// Canopy Camp operator, his state: the one object (op) that says what he is doing, how he stands or sits, what is in his
// hands, which sloth is with him, what he is saying and how long until he may do some things again. Every field is named
// here with its starting value; the activity scripts and the per-frame steps read and write it, and audio.js and the
// checks read it through opApi.op. The two resets (hands, body) are here too, so no script clears fields by hand.
// Exports op, reset(part), handsBusy(), freeHand() and settled() (what his hands and body are free for), and his name and
// size (ME, RADIUS) for the claims and as a mover in camp/places.js.
const ME = "operator", RADIUS = 0.3;                   // his name for claims and loans, and his radius as a mover

const op = {
  // his day: what he is doing ("start" until the first pick, "idle" between), what the checks asked for next, what he did last
  kind: "start", next: null, last: null,
  place: null,                                         // the seat or bed he holds (a claim key, "log:1", "bed:0")
  cooking: false, poured: false,                       // making the soup; the water has gone in on this pour
  wasNight: false,                                     // asleep: it was night a frame ago (he gets up a little after the light)
  // his body
  seated: false, lying: false, sleeping: false,
  footLock: null,                                      // where his feet stay planted while he sits down or rises
  lean: 0,                                             // bent forward at the waist, 0 to 1.3
  pass: null,                                          // stepping round someone in his way { side, t, d }
  // his head and face
  look: 0, gaze: 0, happy: false,                      // head down (-) or round; how long you have looked at him; a smile
  anim: { blink: 2, zz: 0, look: 0, shut: false, smiling: false },   // s to the next blink; the Z's phase; how far his head has
                                                       // turned to you; his eyes held shut asleep; the smile held on (headPose.js)
  // his hands
  ik: null,                                            // what they reach for after the clip { R, L, book, hug, sleep, nap }
  inHand: null,                                        // the prop in his right hand (handProps.js hold)
  eat: null, pail: null, stir: null, veg: false,       // soup { t, spoon }; the pail { tilt, from, k }; stirring { t, k }; a vegetable in hand
  fid: null,                                           // a little fidget { kind, t, k, T }
  // a sloth with him: the one he plays with or cuddles, and the hold { s, k, from, q0, arms } while it is in his hands (arms:
  // its two upper-arm bones, found by handPose.js on the first frame)
  buddy: null, carry: null,
  // talking: s left of the line, of the smile after, of the munching; the hand out for food, the food flying and at his lips
  talk: { t: 0, smile: 0, munch: 0, hand: null, fly: null, food: null },
  // s until he may sit with you again, cook again, remark again, fidget again
  cd: { join: 0, cook: 60, react: 0, fid: 4 },
};

// hands: what dropping everything clears. body: what a jump to another activity (checks) clears on top of that.
const RESET = {
  hands: { ik: null, eat: null, pail: null, stir: null, veg: false, lean: 0 },
  body: { seated: false, lying: false, sleeping: false, look: 0, footLock: null, carry: null, pass: null, cooking: false, fid: null },
};
const reset = (part) => Object.assign(op, RESET[part]);

// What his hands are doing, said once here for the poses that read it (review R2-023). A new prop or hand state goes into these.
// handsBusy(): a reach, the soup, a prop in his hand, a sloth, the pail, the stirring, a vegetable or the cooking lean
const handsBusy = () => !!(op.ik || op.eat || op.inHand || op.carry || op.pail || op.stir || op.veg || op.lean);
// freeHand(): the hand free to take food, "R" unless the right one is busy, then "L"; null when neither is (soup, a book, a
// sloth, lying down, or a left-hand reach)
const freeHand = () => op.eat || op.ik?.book || op.ik?.hug || op.carry || op.lying || op.sleeping || op.ik?.L ? null
  : op.inHand || op.pail || op.stir || op.veg || op.ik?.R ? "L" : "R";
// settled(): standing, or sat right down on a log; not midway sitting down or getting up (his feet are locked then while he
// is not yet, or no longer, seated) and not on the bed's edge (seated with no foot lock)
const settled = () => !op.footLock === !op.seated;

export { ME, RADIUS, freeHand, handsBusy, op, reset, settled };
