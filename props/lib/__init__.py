"""
The shared builder library for the props/ generators (build_camp.py, build_jeep.py, the lived builders and the light
bake), so they stop importing helpers from, and patching, each other:

    mesh.py       primitives and mesh helpers (box, cyl and rod with caps=, ball, torus, quad, rough_up, capless, join,
                  obj_from_bm ...)
    materials.py  mat (a flat base colour), image_material, baked_material (the one vertex-colour "Baked" material)
    bake.py       bake (Cycles AO into vertex colours, with explicit split and apply), flat_colours (no light), densify
    export.py     reset, tris, report (the per-object triangle count every export prints) and export_glb
    audit.py      audit, the mesh check export_glb runs (hidden, back-only, flipped, degenerate and overlapping triangles
                  per object), which stops a build on a fault not in its KNOWN list

A script imports it by path, as the scripts import each other: sys.path.insert(0, <props>), then `from lib.mesh import ...`.
"""
