"""
Materials for the props/ generators: mat() is a flat base colour (kept in the material's "base" property, which the
bakes read), baked_material() the one plain material that draws the "Col" vertex colours the bakes write.
"""
import bpy


def mat(name, rgb):
    """The material called name, made once with base colour rgb (also kept as m["base"] for the bakes)."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.diffuse_color = (*rgb, 1)
        m["base"] = list(rgb)
    return m


def baked_material(roughness=None):
    """A new "Baked" material whose base colour is the "Col" colour attribute (the exporter writes it as COLOR_0)."""
    m = bpy.data.materials.new("Baked")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    if roughness is not None:
        bsdf.inputs["Roughness"].default_value = roughness
    return m
