// Canopy Camp move lab, the small part that is always loaded (the panel itself, lab.js, loads when it is first opened):
//   addLabButton()    adds "Move lab 🧪" to the ⚙️ menu (Adriaen: "add the move lab in the artifact too") and opens the lab
//                     straight away with ?lab (core.js OPT.lab). sloths.js calls it once the sloths are built.
//   labStep(dt)       the open lab's frame step (it follows the chosen sloth with the camera and draws its path); nothing
//                     while the lab is closed. main.js calls it right after the sloths' step.
//   setLabStep(fn)    lab.js hands its step over when the panel opens, and null when it closes
import { $, OPT } from "./core.js";

let step = null;
const setLabStep = (fn) => { step = fn; };
const labStep = (dt) => { step?.(dt); };
const openLab = () => import("./lab.js").then((m) => m.toggle());

function addLabButton() {
  const b = document.createElement("button"); b.textContent = "Move lab 🧪"; $("opts")?.appendChild(b);
  b.onclick = () => { openLab(); const o = $("opts"); o.hidden = true; $("menu")?.setAttribute("aria-expanded", "false"); };
  if (OPT.lab) openLab();
}

export { addLabButton, labStep, setLabStep };
