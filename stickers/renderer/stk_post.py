"""Raw transparent renders -> 512x512 WhatsApp stickers: crop to the
subject, thick white outline, soft shadow, caption, extras (Zzz, speed
lines). Also a 96x96 tray icon and a contact sheet."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

S = os.path.dirname(os.path.abspath(__file__))
RAW, OUT = f"{S}/raw", f"{S}/out"
os.makedirs(OUT, exist_ok=True)
FONT = f"{S}/fonts/Fredoka.ttf"
meta = json.load(open(f"{RAW}/meta.json"))

CAP = {
    "hang": "Hang in there!", "sleep": "5 more minutes…", "wave": "Hiii!", "king": "Ta-daa!",
    "crawl": "On my way!", "hug": "Hugs!", "plane": "Wheee!", "leg": "Don't go to work",
    "swing": "Teamwork!", "knees": "Bounce bounce", "titanic": "King of the world!", "slow": "Brb",
    "duo": "Besties",
    "love": "Love you!", "balloon": "Floating on love", "peek": "Miss you", "smitten": "Smitten", "lots": "Love you lots", "family": "Happy family",
}
ORDER = ["wave", "hang", "hug", "sleep", "crawl", "king", "duo", "leg", "swing", "plane", "titanic", "knees", "slow", "love", "smitten", "peek", "balloon", "lots", "family"]
BROWN = (74, 52, 36, 255)


def crop(im, cut_px=None, cut_top=None):
    """Crop to the drawn subject. A bust shot is cut straight across at
    cut_px (below the chest, from the render); nothing else may touch the
    frame: a part touching an edge means the camera clipped it."""
    a = im.split()[3].point(lambda v: 255 if v > 8 else 0)
    if cut_px:
        a = a.crop((0, 0, im.width, cut_px))
    if cut_top:   # a legs shot: clear everything above the hip line
        a.paste(0, (0, 0, im.width, cut_top))
    x0, y0, x1, y1 = a.getbbox()
    edges = {"left": x0 <= 1, "top": (y0 <= 1) and not cut_top, "right": x1 >= im.width - 1, "bottom": (y1 >= im.height - 1) and not cut_px}
    if any(edges.values()):
        raise SystemExit(f"clipped by the frame: {[k for k, v in edges.items() if v]}")
    return im.crop((x0, y0, x1, y1))


def outline(im, r):
    """Thick white die-cut border round the subject, with no drop shadow: the
    background is cut away here, so the alpha is fully clear outside the
    border and only its outer pixel is anti-aliased."""
    a = im.split()[3].point(lambda v: 255 if v > 40 else 0)
    big = a.filter(ImageFilter.MaxFilter(2 * r + 1)).filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: 255 if v > 110 else 0)
    big = big.filter(ImageFilter.GaussianBlur(0.7))
    out = Image.new("RGBA", im.size, (255, 255, 255, 0))
    out.putalpha(big)
    out.alpha_composite(im)
    return out


def text(d, xy, s, size, anchor="mm"):
    f = ImageFont.truetype(FONT, size)
    d.text(xy, s, font=f, fill=BROWN, anchor=anchor, stroke_width=max(6, size // 7), stroke_fill=(255, 255, 255, 255))


def sticker(name):
    raw = Image.open(f"{RAW}/{name}.png").convert("RGBA")
    m = meta.get(name, {})
    sub = crop(raw, m.get("cutPx"), m.get("cutTopPx"))
    cap = CAP.get(name)
    box_h = 512 - 40 - (96 if cap else 0)
    k = min(452 / sub.width, box_h / sub.height)
    sub = sub.resize((max(1, int(sub.width * k)), max(1, int(sub.height * k))), Image.LANCZOS)
    pad = 24
    canvas = Image.new("RGBA", (sub.width + 2 * pad, sub.height + 2 * pad), (0, 0, 0, 0))
    canvas.alpha_composite(sub, (pad, pad))
    d = ImageDraw.Draw(canvas)
    if m.get("zzz"):
        for i, (x, y, s) in enumerate(((0.62, 0.62, 44), (0.76, 0.48, 58), (0.90, 0.32, 74))):
            text(d, (int(canvas.width * x), int(canvas.height * y) + pad), "z" if i < 2 else "Z", s)
    if m.get("speed"):
        for i, y in enumerate((0.45, 0.6, 0.75)):
            yy = int(canvas.height * y)
            d.line([(canvas.width - pad - 50 - i * 14, yy), (canvas.width - pad, yy)], fill=BROWN, width=8)
    canvas = outline(canvas, 9)
    out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    top = max(4, (512 - canvas.height - (80 if cap else 0)) // 2)   # subject and caption centred as one block
    out.alpha_composite(canvas, ((512 - canvas.width) // 2, max(0, top)))
    if cap:
        size = 64
        f = ImageFont.truetype(FONT, size)
        while f.getlength(cap) > 470:
            size -= 2
            f = ImageFont.truetype(FONT, size)
        text(ImageDraw.Draw(out), (256, min(512 - 44, top + canvas.height + 34)), cap, size)
    return out


def clean(im):
    """Cut the background out for good: alpha under 8 becomes 0 and every
    clear pixel is white, so no app has to remove anything."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 8 else v)
    white = Image.new("RGBA", im.size, (255, 255, 255, 0))
    out = Image.composite(Image.merge("RGBA", (r, g, b, a)), white, a.point(lambda v: 255 if v else 0))
    return out


def main():
    names = [n for n in ORDER if os.path.exists(f"{RAW}/{n}.png")]
    tiles = []
    for i, n in enumerate(names):
        im = clean(sticker(n))
        q = 90
        while True:   # WhatsApp: 512x512 WebP under 100 KB
            p = f"{OUT}/{i + 1:02d}_{n}.webp"
            im.save(p, "WEBP", quality=q, method=6)
            if os.path.getsize(p) < 100_000 or q < 40:
                break
            q -= 10
        im.save(f"{OUT}/{i + 1:02d}_{n}.png")
        tiles.append(im)
    tray = clean(sticker("wave").resize((96, 96), Image.LANCZOS))
    tray.save(f"{OUT}/tray.png")
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 512, rows * 512), (236, 229, 221))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 512, (i // cols) * 512), t)
    sheet.save(f"{S}/sheet.jpg", quality=85)
    print(len(tiles), "stickers")


if __name__ == "__main__":
    main()
