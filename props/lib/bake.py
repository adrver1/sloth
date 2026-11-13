"""
Vertex-colour light for the props/ generators, both into the "Col" colour attribute drawn by one "Baked" material:

    bake(objs, samples, split=False, apply=True)   Cycles ambient occlusion (with a ground plane) times each face's base
                                                   colour, for props that carry their own light (the archived camp
                                                   styles, the jeep, a builder run on its own)
    flat_colours(objs, glow=())                    the plain base colours, no light, for props the light bake lights
                                                   (props/camp/bake_camp_lightmap.py); alpha 0 marks glowing faces

Before the AO bake each object (unless it has the "coarse" property) has its transforms applied (apply=True) or, with
split=True, its long edges split by densify() so the per-vertex AO has room to vary ("ao_edge" sets the length). The
low-triangle rule (Adriaen 2026-11-11) means only the archived styles split.
"""
import bpy
from mathutils import Vector

from lib.materials import baked_material
from lib.mesh import apply_all


def densify(o, edge=0.13):
    """Split long edges so baked AO per vertex has room to vary."""
    apply_all(o)
    bpy.ops.object.mode_set(mode="EDIT")
    for _ in range(3):
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        n = 0
        for e in o.data.edges:
            a, b = o.data.vertices[e.vertices[0]].co, o.data.vertices[e.vertices[1]].co
            if (a - b).length > edge:
                e.select = True; n += 1
        bpy.ops.object.mode_set(mode="EDIT")
        if not n:
            break
        bpy.ops.mesh.subdivide(number_cuts=1)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(objs, samples, split=False, apply=True):
    """Cycles AO (distance 0.6, over a 40 m ground plane) x base colour into "Col"; see the module docstring."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.world = sc.world or bpy.data.worlds.new("w")
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    ground = bpy.context.object
    for o in objs:
        if not o.get("coarse"):                         # "coarse": keep the modelled detail, AO only at the existing vertices
            if split:
                densify(o, o.get("ao_edge", 0.13))      # "ao_edge": a coarser split for that object
            elif apply:
                apply_all(o)
        ao = o.data.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
        o.data.color_attributes.active_color = ao
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        o.data.color_attributes.active_color = o.data.color_attributes["AO"]
        sc.render.bake.target = "VERTEX_COLORS"
        sc.world.light_settings.distance = 0.6
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.data.objects.remove(ground)
    # colour = base colour x soft AO, into the attribute the exporter writes as COLOR_0
    for o in objs:
        me = o.data
        ao = me.color_attributes["AO"]
        col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        bases = [Vector(m["base"]) for m in me.materials]
        for poly in me.polygons:
            base = bases[poly.material_index]
            for li in poly.loop_indices:
                a = ao.data[li].color[0]
                k = 0.32 + 0.68 * a
                col.data[li].color = (base.x * k, base.y * k, base.z * k, 1)
        me.color_attributes.remove(ao)
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.materials.clear()
        me.materials.append(baked_material(roughness=0.9))   # one plain material that uses the colour attribute


def flat_colours(objs, glow=()):
    """Plain base colours into "Col" (alpha 0 on faces whose material name is in glow), one "Baked" material each."""
    for o in objs:
        me = o.data
        for c in list(me.color_attributes):
            me.color_attributes.remove(me.color_attributes[c.name])
        col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        for poly in me.polygons:
            m = me.materials[poly.material_index] if me.materials else None
            base = Vector(m["base"]) if m and "base" in m else Vector((0.5, 0.5, 0.5))
            al = 0.0 if m and m.name.split(".")[0] in glow else 1.0
            for li in poly.loop_indices:
                col.data[li].color = (base.x, base.y, base.z, al)
        me.color_attributes.active_color = col
        m = baked_material()
        me.materials.clear(); me.materials.append(m)
