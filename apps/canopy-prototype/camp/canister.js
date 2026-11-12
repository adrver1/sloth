// PROTOTYPE (throwaway): three water carriers for the soup pot chore, to replace the plain textured box (Adriaen 2026-11-12:
// "looks very strange"). Question: which reads best as "the water" on the ground by the table and in your hand?
// ?can=jerry (default) | pail | jug in camp.html. Each is built bottom at y 0, its front toward +z, and reports its triangles.
// Once one is picked, the others go.
import * as THREE from "three";

const tex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };

// A: a jerrycan seen in profile, extruded: slanted shoulder with a spout, the carry handle as a real hole in the top, an X
// pressed into each side painted on the faces (not modelled)
function jerry() {
  const W = 0.2, H = 0.3, D = 0.11, s = new THREE.Shape();
  s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H - 0.05); s.lineTo(W / 2 - 0.05, H); s.lineTo(-W / 2, H); s.lineTo(-W / 2, 0);
  const hole = new THREE.Path(); const hx0 = -W / 2 + 0.03, hx1 = W / 2 - 0.075, hy0 = H - 0.075, hy1 = H - 0.025;
  hole.moveTo(hx0, hy0); hole.lineTo(hx0, hy1); hole.lineTo(hx1, hy1); hole.lineTo(hx1, hy0); hole.lineTo(hx0, hy0); s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 1 }); g.translate(0, 0, -D / 2); g.rotateY(-Math.PI / 2);   // the profile faces sideways, the spout end forward (+z)
  // caps: the side panels, painted. ExtrudeGeometry gives the caps shape-space UVs (metres), so map them onto the 128px texture
  const side = tex(128, 192, (c, w, h) => { c.fillStyle = "#c8452c"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#a3361f"; c.lineWidth = 9; c.beginPath(); c.moveTo(18, 70); c.lineTo(w - 18, h - 14); c.moveTo(w - 18, 70); c.lineTo(18, h - 14); c.stroke();
    c.strokeStyle = "#e0654a"; c.lineWidth = 3; c.strokeRect(10, 62, w - 20, h - 70); });
  side.repeat.set(1 / W, 1 / H); side.offset.set(0.5, 0);
  const body = new THREE.MeshLambertMaterial({ map: side }), edge = new THREE.MeshLambertMaterial({ color: 0xb23c25 });
  const m = new THREE.Mesh(g, [body, edge]);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 6, 1), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
  spout.position.set(0, H + 0.005, W / 2 - 0.03); spout.rotation.x = 0.7;   // on the slanted shoulder
  const o = new THREE.Group(); o.add(m, spout); return o;
}

// B: a wooden pail with two iron hoops and a wire bail handle, water inside (staves, hoops and grain painted on 8 sides)
function pail() {
  const R0 = 0.1, R1 = 0.125, H = 0.22, N = 8, o = new THREE.Group();
  const wood = tex(256, 64, (c, w, h) => { c.fillStyle = "#a8743f"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { c.fillStyle = x % 64 ? "#9a6935" : "#b07b45"; c.fillRect(x + 1, 0, 30, h); c.fillStyle = "#5e3f22"; c.fillRect(x, 0, 2, h); }
    c.fillStyle = "#3d3a37"; c.fillRect(0, 8, w, 6); c.fillRect(0, h - 16, w, 6); });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(R1, R0, H, N, 1, true).translate(0, H / 2, 0), new THREE.MeshLambertMaterial({ map: wood, side: THREE.DoubleSide }));
  const water = new THREE.Mesh(new THREE.CircleGeometry(R1 * 0.95, N).rotateX(-Math.PI / 2).translate(0, H * 0.85, 0), new THREE.MeshLambertMaterial({ color: 0x5f93a6 }));
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R0, N).rotateX(Math.PI / 2).translate(0, 0.002, 0), new THREE.MeshLambertMaterial({ color: 0x6e4a28 }));
  const bail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-R1, H, 0), new THREE.Vector3(0, H + 0.2, 0), new THREE.Vector3(R1, H, 0)), 6, 0.006, 3, false), new THREE.MeshLambertMaterial({ color: 0x3d3a37 }));
  bail.rotation.y = 0.5; o.add(shell, water, bottom, bail); return o;
}

// C: a round camp water jug (cooler style): a lathed drum with a white lid, a tap at the front and a carry handle on top
function jug() {
  const o = new THREE.Group(), N = 8;
  const pts = [[0, 0], [0.105, 0], [0.115, 0.02], [0.115, 0.22], [0.1, 0.245], [0, 0.245]].map(([x, y]) => new THREE.Vector2(x, y));
  const band = tex(64, 128, (c, w, h) => { c.fillStyle = "#2f7fb3"; c.fillRect(0, 0, w, h); c.fillStyle = "#f2efe6"; c.fillRect(0, 0, w, 26); c.fillRect(0, h - 14, w, 14); c.fillStyle = "#3d94c8"; c.fillRect(0, 60, w, 10); });
  const drum = new THREE.Mesh(new THREE.LatheGeometry(pts, N), new THREE.MeshLambertMaterial({ map: band }));
  const tap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), new THREE.MeshLambertMaterial({ color: 0xf2efe6 })); tap.position.set(0, 0.04, 0.125);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 3, 5, Math.PI), new THREE.MeshLambertMaterial({ color: 0xf2efe6 })); handle.position.y = 0.245;
  o.add(drum, tap, handle); return o;
}

const KIND = { jerry, pail, jug };
export function makeCanister(kind) { const o = (KIND[kind] ?? jerry)(); o.userData.tris = tris(o); return o; }
