"""
The shared builder library for the props/ generators (build_camp.py, build_jeep.py, the lived builders and the light
bake), so they stop importing helpers from, and patching, each other:

    mesh.py       primitives and mesh helpers (box, cyl and rod with caps=, ball, torus, rough_up, join, capless, quad ...)
    materials.py  mat (a flat base colour), baked_material (the one vertex-colour "Baked" material)
    bake.py       bake (Cycles AO into vertex colours, with explicit split and apply), flat_colours (no light), densify
    export.py     reset

A script imports it by path, as the scripts import each other: sys.path.insert(0, <props>), then `from lib.mesh import ...`.
"""
