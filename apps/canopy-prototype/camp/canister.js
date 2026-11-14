// Canopy Camp water pail for the soup pot chore (Adriaen picked it 2026-11-12 over a jerrycan and a camp jug; it replaced a
// plain textured box): a wooden stave bucket with two iron hoops and a wire bail handle, water showing inside. Staves, hoops
// and grain are painted on its 8 sides. 60 triangles: shell 16 (open, both faces drawn, so you see the inner wall), water 8,
// bail 36. No bottom: the water hides it. Built with its bottom at y 0, front toward +z.
import * as THREE from "three";
import { canvasTex } from "./util.js";

const R0 = 0.1, R1 = 0.125, H = 0.22, N = 8;
const wood = canvasTex(256, 64, (c, w, h) => { c.fillStyle = "#a8743f"; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { c.fillStyle = x % 64 ? "#9a6935" : "#b07b45"; c.fillRect(x + 1, 0, 30, h); c.fillStyle = "#5e3f22"; c.fillRect(x, 0, 2, h); }
  c.fillStyle = "#3d3a37"; c.fillRect(0, 8, w, 6); c.fillRect(0, h - 16, w, 6); }, { aniso: 1 });
const shellGeo = new THREE.CylinderGeometry(R1, R0, H, N, 1, true).translate(0, H / 2, 0), shellMat = new THREE.MeshLambertMaterial({ map: wood, side: THREE.DoubleSide });
const waterGeo = new THREE.CircleGeometry(R1 * 0.95, N).rotateX(-Math.PI / 2).translate(0, H * 0.85, 0), waterMat = new THREE.MeshLambertMaterial({ color: 0x5f93a6 });
const bailGeo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-R1, H, 0), new THREE.Vector3(0, H + 0.2, 0), new THREE.Vector3(R1, H, 0)), 6, 0.006, 3, false), bailMat = new THREE.MeshLambertMaterial({ color: 0x3d3a37 });

export function makePail() {
  const o = new THREE.Group(), bail = new THREE.Mesh(bailGeo, bailMat);
  bail.rotation.y = 0.5; o.add(new THREE.Mesh(shellGeo, shellMat), new THREE.Mesh(waterGeo, waterMat), bail);
  return o;
}
