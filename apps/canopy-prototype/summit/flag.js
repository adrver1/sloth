// Summit Cabin: a pennant on a pole that swings round with the wind and flutters. One implementation for every flag in the
// level: the scout camp's (scoutCamp.js) and the one on the fire lookout's roof (lookout.js).
// Exports scoutPennant() (the scouts' pennant texture), poleMat, pennant({ parent, at, pole, size, tex, poleMat }) (adds the pole and the cloth; returns the triangles it added) and
// flagsStep(now, wind) (each frame, after fxStep sets the wind).
import * as THREE from 'three';
import { canvasTex, hazed, tris } from './core.js';

const flags = [];
// the scouts' pennant, green with a gold chevron, and the poles' dark wood (the camp's flag and the lookout's)
export const scoutPennant = () => canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#2f6a3c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h / 2); c.lineTo(0, h); c.fill(); c.fillStyle = '#f2d27a'; c.beginPath(); c.moveTo(18, 14); c.lineTo(34, 32); c.lineTo(18, 50); c.lineTo(26, 32); c.fill(); });
export const poleMat = hazed(new THREE.MeshLambertMaterial({ color: '#4a3a2c' }));

// parent: the group it stands in; at: the pole's foot in that group; pole: its height (m); size: the cloth's length (m);
// tex: the cloth's texture (a pennant shape on transparent); poleMat: the pole's material
export function pennant({ parent, at, pole, size, tex, poleMat }) {
  const g = new THREE.Group(); g.position.copy(at); parent.add(g);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, pole, 6), poleMat); stick.position.y = pole / 2; stick.castShadow = true; g.add(stick);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2, 6, 1).translate(size / 2, 0, 0), hazed(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide })));
  cloth.position.y = pole - size * 0.32; g.add(cloth);
  flags.push({ cloth, turn: parent.rotation.y, phase: flags.length * 1.7 });
  return tris(stick.geometry) + tris(cloth.geometry);
}

// each frame: every flag points downwind (in its parent's turned frame), swings a little, and its cloth flutters
export function flagsStep(now, wind) {
  for (const f of flags) {
    f.cloth.rotation.y = -Math.atan2(wind.z, wind.x) - f.turn + Math.sin(now * 3.1 + f.phase) * 0.25;
    f.cloth.scale.y = 1 - 0.1 * Math.abs(Math.sin(now * 5 + f.phase));
  }
}
