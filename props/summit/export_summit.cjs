// Summit Cabin light-map exporter (Adriaen 2026-11-15: bake the summit's light maps before PR 1). bake_all.py --only summit
// runs it before props/summit/bake_summit_lightmap.py. It opens summit.html (?lm=0, so the page's own light maps are off) in
// headless Chromium through tools/camp-page.cjs openCamp, and from the page's own modules writes:
//   props/summit/summit_static.glb    the receivers (R_<name>: the cabin's and lookout's lit meshes, in the world, with the
//                                     light-map UVs of summit/lightmap.js packLightmap as TEXCOORD_0) and the occluders
//                                     (O_<name>: their posts, legs and other meshes, and the ground round each, 1 m squares)
//   props/summit/summit_layout.json   { size, sig, meshes: { name: triangles }, lights: cabin.js bakeSources() }
// The page makes the same UVs when it loads the maps, and checks sig (lightmap.js signature) against the bake's.
//   node props/summit/export_summit.cjs [size]       (size: the atlas, 2048)
const fs = require('fs'), path = require('path');
const { openCamp, watch } = require('../../tools/camp-page.cjs');
const SIZE = +(process.argv[2] || 2048), OUT = __dirname;

(async () => {
  let w = null;
  const { page, close } = await openCamp({ url: '/apps/canopy-prototype/summit.html?lm=0', width: 640, height: 360, timeout: 180000, before: async (p) => { w = await watch(p); } });
  try {
    const r = await page.evaluate(async (SIZE) => {
      const THREE = await import('three');
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      const { receivers, signature, packLightmap } = await import('./summit/lightmap.js');
      const { bakeSources } = await import('./summit/cabin.js');
      const { height } = await import('./summit/land.js');
      const S = window.__scene.scene, groups = ['Cabin', 'Lookout'].map((n) => S.getObjectByName(n));
      S.updateMatrixWorld(true);
      const rec = receivers(groups), sig = signature(rec), meshes = Object.fromEntries(rec.map((o) => [o.name, (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3]));
      const pack = packLightmap(rec, SIZE), lights = bakeSources();
      const out = new THREE.Scene(), plain = new THREE.MeshBasicMaterial();
      const add = (name, g, m) => { g = g.clone(); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); g.applyMatrix4(m);
        const o = new THREE.Mesh(g, plain); o.name = name; out.add(o); };
      for (const o of rec) { const g = o.geometry.clone(), u1 = g.attributes.uv1, uv = new Float32Array(u1.count * 2);
        for (let i = 0; i < u1.count; i++) { uv[i * 2] = u1.getX(i); uv[i * 2 + 1] = 1 - u1.getY(i); }   // glTF counts v from the top
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); add('R_' + o.name, g, o.matrixWorld); }
      const isRec = new Set(rec), emit = (m) => m.emissive?.getHex() || m.isMeshBasicMaterial; let k = 0;
      for (const grp of groups) grp.traverse((o) => { if (!o.isMesh || isRec.has(o) || (!Array.isArray(o.material) && emit(o.material))) return;
        if (o.isInstancedMesh) { const m = new THREE.Matrix4(); for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); add(`O_${k++}`, o.geometry, m.premultiply(o.matrixWorld)); } }
        else add(`O_${k++}`, o.geometry, o.matrixWorld); });
      // the ground round the cabin (30 m) and the lookout (16 m), in 1 m squares, to throw the snow's occlusion and bounce
      for (const [cx, cz, r] of [[0, -2, 15], [groups[1].position.x, groups[1].position.z, 8]]) {
        const g = new THREE.PlaneGeometry(r * 2, r * 2, r * 2, r * 2).rotateX(-Math.PI / 2), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, height(x, z) - 0.02, z); }
        g.computeVertexNormals(); add(`O_ground_${k++}`, g, new THREE.Matrix4()); }
      const glb = await new GLTFExporter().parseAsync(out, { binary: true });
      let s = ''; const b = new Uint8Array(glb); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { glb: btoa(s), layout: { size: SIZE, sig, meshes, lights, texelsPerMetre: +pack.texelsPerMetre.toFixed(2), rects: pack.rects } };
    }, SIZE);
    fs.writeFileSync(path.join(OUT, 'summit_static.glb'), Buffer.from(r.glb, 'base64'));
    fs.writeFileSync(path.join(OUT, 'summit_layout.json'), JSON.stringify(r.layout, null, 1) + '\n');
    console.log(`summit_static.glb ${(Buffer.from(r.glb, 'base64').length / 1024).toFixed(0)} KB: ${Object.keys(r.layout.meshes).length} receivers (${Object.values(r.layout.meshes).reduce((a, b) => a + b, 0)} triangles, ${r.layout.rects} rectangles at ${r.layout.texelsPerMetre} texels a metre), ${r.layout.lights.length} lights`);
    if (w.errs.length) { console.error('page errors:\n' + w.errs.join('\n')); process.exitCode = 1; }
  } finally { await close(); }
})().catch((e) => { console.error(e); process.exit(1); });
