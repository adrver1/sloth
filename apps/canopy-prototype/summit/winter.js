// Summit Cabin winter gear for the seven sloths (Adriaen 2026-11-15, look A on prototypes/winter-prototype.html): a striped
// bobble hat with a turned-up band and a pompom, tipped back off the eyes, and a striped scarf with two tails, each knitted in
// the sloth's own colour. winterGear(name, head) hangs it off the head bone (call it after cast.js dress) and returns its
// triangle count. The head bone's frame: y 0.02 .. 0.137, x ±0.078, the face toward -z (-0.092), the back +z (0.049).
// Trimmed from the prototype's ~150 triangles: hat dome 24, band 12, pompom 8, scarf 48, tails 4 = 96, merged into one mesh
// with one knit texture and one material per sloth (one draw; the pompom's uvs sit in a light stripe of the knit).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const KNIT = { Hibi: ['#ff6f9c', '#ffe1ea'], Mango: ['#ff8a1f', '#fff4dc'], Figgy: ['#8a4fb8', '#e9dcf5'], Bandit: ['#5a9e35', '#f1f6e6'],
  Pip: ['#6fc3e8', '#ffffff'], Hazel: ['#3f7fd0', '#e3eefc'], Sunny: ['#ffcf33', '#fff6d6'] };
function knit(base, light) {   // 64 px: the base colour, light stripes every 16 px, and the V of the stitches
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64); g.fillStyle = light; for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.5;
  for (let y = 2; y < 64; y += 6) for (let x = 0; x < 64; x += 6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 4); g.lineTo(x + 6, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const put = (g, pos, rot = [0, 0, 0], sc = [1, 1, 1]) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...sc)));
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function winterGear(name, head) {
  const [base, light] = KNIT[name] || KNIT.Hibi, map = knit(base, light);
  const parts = [], add = (g) => { parts.push(g.index ? g.toNonIndexed() : g); };
  // the hat sits a little wider on Mango, so the bandana's knot stays under it (the prototype's to-do)
  const tip = [0.45, 0, 0], wide = name === 'Mango' ? 1.07 : 1;
  add(put(new THREE.SphereGeometry(0.08, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.098, 0.006], tip, [wide, 0.9, 1.02 * wide]));   // 24
  add(put(new THREE.CylinderGeometry(0.083, 0.084, 0.022, 6, 1, true), [0, 0.103, 0.004], tip, [wide, 1, 1.03 * wide]));   // 12
  { const o = put(new THREE.OctahedronGeometry(0.026, 0), [0, 0.168, 0.04]), uv = o.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.97); add(o); }   // 8, in the top light stripe
  add(put(new THREE.TorusGeometry(0.052, 0.018, 4, 6), [0, 0.012, -0.006], [Math.PI / 2, 0, 0], [1.08, 0.9, 1]));   // 48
  const tail = (x, a, l) => add(put(new THREE.PlaneGeometry(0.026, l).translate(0, -l / 2, 0), [x, 0.0, -0.068], [0.25, 0, a]));
  tail(0.016, -0.12, 0.07); tail(0.03, 0.1, 0.06);   // 2 each
  const g = mergeGeometries(parts), o = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }));
  o.name = 'winter'; o.userData.gear = true; head.add(o);
  head.traverse((m) => { if (/trait_(scarf|leafHat)/.test(m.name)) m.visible = false; });   // Sunny's scarf and Figgy's leaf hat give way to the winter ones
  return tris(g);
}
