"""
The camp set's painted atlas, camp_paint.png (512 x 512, next to this file): the detail Adriaen picked to have painted
instead of modelled on the hammock (review R2-177 option C) and the wall tent (R2-203 option C), in one small texture the
page loads once with the camp set. build_camp.py writes it on every build (plain PIL, no Blender, the same pixels each
run) and lays each painted face's UV0 into one of its regions; the light bake keeps that UV0 and the image beside the
light-map UVs (lib.bake.flat_colours, objects tagged "paint_image"), and the page multiplies it over the vertex colours
(camp/campProps.js paintMat).

    paint(path)            writes the atlas
    REGIONS                {name: (x, y, w, h)} in image pixels, y down
    uv(region, u, v)       Blender UV (v up) of the point (u, v) in 0..1 of a region, u to the right and v up, kept
                           INSET pixels inside it so its mip levels blend less with the neighbours
    PLAIN                  the UV of the white block: faces that are only vertex-coloured (poles, ropes, the stove)

The regions and what they hold (each multiplies the face's vertex colour, so canvas and bed faces keep their colours
from the builder; "full colour" regions go on faces whose material is plain white):
    plain      white
    card       the hammock's end card: six strings on a clear ground (alpha), the ring's whipping at the top (v = 1) and
               the gathered hem at the bottom (v = 0). Strings are 4 px wide, so a few mip levels down they still pass
               the page's alpha test (campProps.js scales alpha up by the mip level)
    sling      full colour: five orange and cream bands across (v), pinstripes, a fine weave, the rolled hems' shadow on
               both long edges and the gathered pleats at each end (u = 0, 1)
    roof       canvas: the weave and six stitched panel seams along u, a hem at the eave (v = 0) and a ridge band (v = 1)
    wall       canvas: six panel seams, the hem's stitch line and a dirt fade from the ground up (v = 0)
    wallPatch  the wall with one stitched patch (the stove-side wall)
    gable      canvas: seams across, a dirt fade from the ground up
    ticking    full colour: the mattress's blue-grey ticking stripes along v
    blanket    full colour: a red camp blanket with a dark band and cream pinstripes near the foot (v = 0)
    pillow     full colour: white with a soft shade and piping round its edge
"""
import math
import random

SIZE = 512
INSET = 3
REGIONS = {
    "roof": (0, 0, 256, 256), "wall": (256, 0, 256, 128), "wallPatch": (256, 128, 256, 128),
    "sling": (0, 256, 256, 128), "gable": (256, 256, 256, 128),
    "plain": (0, 384, 64, 128), "card": (64, 384, 128, 128), "ticking": (192, 384, 128, 128), "blanket": (320, 384, 128, 128),
    "pillow": (448, 384, 64, 128),
}


def uv(region, u, v):
    """Blender UV of (u, v) in 0..1 of region (v up), INSET pixels in from its edges."""
    x, y, w, h = REGIONS[region]
    px = x + INSET + min(max(u, 0.0), 1.0) * (w - 2 * INSET)
    py = y + INSET + (1 - min(max(v, 0.0), 1.0)) * (h - 2 * INSET)
    return (px / SIZE, 1 - py / SIZE)


PLAIN = uv("plain", 0.5, 0.5)


def _srgb(rgb):
    """The atlas byte triple of a builder colour: the builders' material colours (lib.materials.mat) are linear, and the page
    decodes the atlas as sRGB, so a full-colour region painted from them matches the vertex colours it replaces."""
    return tuple(int(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055) + 0.5) for c in rgb)


def _weave(x, y):
    """A fine, regular canvas weave: one thread in two a little darker each way (compresses well)."""
    return 1.0 - 0.02 * ((x // 2) % 2) - 0.02 * ((y // 2) % 2)


def _seam(t, n, width, stitch_at=None):
    """The seam factor at t (0..1 along the axis the seams cross) for n panels: a dark fold line at each panel edge and
    a dashed stitch line beside it; width is in units of t (one pixel)."""
    d = abs(t * n - round(t * n)) / n                            # distance to the nearest seam, in t
    k = 1.0
    if d < 1.2 * width:
        k *= 0.78
    elif abs(d - 4 * width) < 0.8 * width and (stitch_at is None or stitch_at):
        k *= 0.86
    return k


def _canvas(px, name, seams_u, dirt, patch=None, ridge=False, eave=False):
    x0, y0, w, h = REGIONS[name]
    r = random.Random(sum(map(ord, name)))                       # a fixed stream per region
    blots = [(r.uniform(0, 1), r.uniform(0, 1), r.uniform(0.05, 0.15), r.uniform(0.95, 1.0)) for _ in range(10)]
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            u, v = (x - x0 + 0.5) / w, 1 - (y - y0 + 0.5) / h
            k = _weave(x, y)
            # seams: across u, the stitch dashes only every other 3 px down the seam
            k *= _seam(u, seams_u, 1 / w, stitch_at=(y // 3) % 2 == 0)
            for bu, bv, br, bk in blots:                         # faint water marks, so a wide panel is not one flat tone
                if (u - bu) ** 2 + (v - bv) ** 2 < br * br:
                    k *= bk + (1 - bk) * math.sqrt((u - bu) ** 2 + (v - bv) ** 2) / br
            col = (k, k, k)
            if dirt:                                             # dirt splashed up from the ground, fading out by `dirt` of the height
                f = max(0.0, 1 - v / dirt) ** 1.6 * (0.85 + 0.15 * math.sin(u * 61 + math.sin(u * 13) * 2))
                col = tuple(c * (1 - f * m) for c, m in zip(col, (0.38, 0.44, 0.55)))
                if abs(v - dirt * 0.28) < 0.6 / h * 1.5 and (x // 3) % 2 == 0:   # the hem's stitch line
                    col = tuple(c * 0.82 for c in col)
            if eave and v < 0.035:
                col = tuple(c * 0.86 for c in col)
            if ridge and v > 0.965:
                col = tuple(c * 0.84 for c in col)
            if patch:
                pu, pv, pw, ph = patch                           # a sewn-on patch: a shade warmer and darker, stitched round
                du, dv = abs(u - pu) - pw / 2, abs(v - pv) - ph / 2
                if du < 0 and dv < 0:
                    col = (col[0] * 0.93, col[1] * 0.9, col[2] * 0.82)
                    if max(du, dv) > -3.5 / w and ((x + y) // 3) % 2 == 0:
                        col = tuple(c * 0.75 for c in col)
                elif max(du, dv) < 1.2 / w:
                    col = tuple(c * 0.8 for c in col)          # its folded edge
            if col != (1, 1, 1):
                px[x, y] = _srgb(col) + (255,)                     # a linear factor on the white ground (the page multiplies in linear)


def _sling(px):
    """Full colour: bands across v, the weave, hem shadows along both long edges, pleats gathering to each end."""
    x0, y0, w, h = REGIONS["sling"]
    O, C = _srgb((0.95, 0.5, 0.15)), _srgb((0.8, 0.66, 0.44))      # the orange and the cream (weave) of the old stripes
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            u, v = (x - x0 + 0.5) / w, 1 - (y - y0 + 0.5) / h
            band = min(4, int(v * 5))
            c = O if band % 2 == 0 else C
            k = _weave(x, y)
            edge = abs(v * 5 - round(v * 5))                     # pinstripes on the band edges
            if 0 < round(v * 5) < 5 and edge < 0.06:
                k *= 0.7
            for e in (v, 1 - v):                                 # the rolled hem: a dark roll, a light lip, along each edge
                if e < 0.06:
                    k *= 0.62 + 0.38 * abs(math.sin(e / 0.06 * math.pi))
            for end in (u, 1 - u):                               # pleats: folds fanning in toward the gathered ends
                if end < 0.16:
                    fold = 0.5 + 0.5 * math.cos((v - 0.5) * math.pi * 9 * (1 + (0.16 - end) * 4))
                    k *= 1 - 0.28 * (1 - end / 0.16) * fold
            px[x, y] = tuple(min(255, int(ch * k + 0.5)) for ch in c) + (255,)


def _card(px):
    """The end card: six strings (vertical in the image; the card narrows them to the ring), a whipped ring at the top and
    the gathered hem at the bottom, on a clear ground."""
    x0, y0, w, h = REGIONS["card"]
    rope, dark, hem, hem2 = _srgb((0.7, 0.6, 0.4)), _srgb((0.4, 0.32, 0.2)), _srgb((0.8, 0.66, 0.44)), _srgb((0.66, 0.53, 0.34))
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            px[x, y] = (rope[0], rope[1], rope[2], 0)            # clear, in the rope's colour, so mips do not darken the edges
    for k in range(6):
        cx = x0 + 10 + k * (w - 20) / 5
        for y in range(y0, y0 + h):
            for x in range(int(cx - 2), int(cx + 2)):
                shade = 0.82 if x == int(cx - 2) else 1.0
                px[x, y] = tuple(int(c * shade) for c in rope) + (255,)
    for y in range(y0, y0 + 12):                                 # the ring's whipping
        for x in range(x0, x0 + w):
            px[x, y] = (dark if (y - y0) % 4 < 2 else rope) + (255,)
    for y in range(y0 + h - 8, y0 + h):                          # the gathered hem the strings are tied into
        for x in range(x0, x0 + w):
            px[x, y] = (hem if (x // 3) % 2 else hem2) + (255,)


def _ticking(px):
    x0, y0, w, h = REGIONS["ticking"]
    L, S, P = _srgb((0.84, 0.82, 0.76)), _srgb((0.36, 0.42, 0.55)), _srgb((0.5, 0.56, 0.66))   # ground, stripe, pinstripe
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            u = (x - x0 + 0.5) / w
            s = (u * 12) % 1
            c = L if s < 0.62 else S if s < 0.8 else L if s < 0.86 else P
            k = _weave(x, y)
            px[x, y] = tuple(int(ch * k) for ch in c) + (255,)


def _blanket(px):
    x0, y0, w, h = REGIONS["blanket"]
    red, band, pin = _srgb((0.62, 0.2, 0.15)), _srgb((0.1, 0.07, 0.06)), _srgb((0.85, 0.74, 0.48))
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            v = 1 - (y - y0 + 0.5) / h
            c = red
            d = abs(v - 0.14)
            if d < 0.05:
                c = band
            elif abs(d - 0.075) < 0.012:
                c = pin
            k = 1.0 - 0.06 * ((x // 2 + y // 2) % 2)               # a twill
            px[x, y] = tuple(int(ch * k) for ch in c) + (255,)


def _pillow(px):
    x0, y0, w, h = REGIONS["pillow"]
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            u, v = (x - x0 + 0.5) / w, 1 - (y - y0 + 0.5) / h
            m = max(abs(u - 0.5) * 2, abs(v - 0.5) * 2)
            k = 1 - 0.18 * max(0.0, (m - 0.55) / 0.45) ** 1.5
            if abs(m - 0.88) < 0.03:
                k *= 0.84                                        # the piping
            px[x, y] = tuple(int(ch * k) for ch in _srgb((0.94, 0.93, 0.9))) + (255,)


def paint(path):
    """Writes the atlas to path (PNG, RGBA)."""
    from PIL import Image
    im = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 255))
    px = im.load()
    _canvas(px, "roof", 6, 0, ridge=True, eave=True)
    _canvas(px, "wall", 6, 0.36)
    _canvas(px, "wallPatch", 6, 0.36, patch=(0.62, 0.55, 0.17, 0.2))
    _canvas(px, "gable", 6, 0.14)
    _sling(px)
    _card(px)
    _ticking(px)
    _blanket(px)
    _pillow(px)
    im.save(path, optimize=True)
    return path
