"""
Scene reset for the props/ generators.
"""
import bpy


def reset():
    """An empty scene (factory settings)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
