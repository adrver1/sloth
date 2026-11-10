"""Animated sticker frames (stk/anim_raw/<name>/*.png) -> 512x512 animated
WebP stickers for WhatsApp (under 500 KB, looping), cut out like the still
ones: one crop and scale for the whole loop, white die-cut outline on every
frame, caption, and moving extras (Zzz floating up, speed lines)."""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stk_post import CAP, ORDER, FONT, BROWN, outline, text, clean

S = os.path.dirname(os.path.abspath(__file__))
RAW, OUT = f"{S}/anim_raw", f"{S}/anim_out"
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(f"{RAW}/meta.json"))


def union_box(frames, cut_px, cut_top):
    box = None
    for im in frames:
        a = im.split()[3].point(lambda v: 255 if v > 8 else 0)
        if cut_px:
            a = a.crop((0, 0, im.width, cut_px))
        if cut_top:
            a.paste(0, (0, 0, im.width, cut_top))
        b = a.getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    x0, y0, x1, y1 = box
    w, h = frames[0].size
    edges = {"left": x0 <= 1, "top": y0 <= 1 and not cut_top, "right": x1 >= w - 1, "bottom": y1 >= h - 1 and not cut_px}
    if any(edges.values()):
        raise SystemExit(f"clipped by the frame: {[k for k, v in edges.items() if v]}")
    return box


def frames_of(name):
    m = meta[name]
    d = f"{RAW}/{name}"
    raw = [Image.open(f"{d}/{f}").convert("RGBA") for f in sorted(os.listdir(d)) if f.endswith(".png")]
    box = union_box(raw, m.get("cutPx"), m.get("cutTopPx"))
    cap = CAP.get(name)
    bw, bh = box[2] - box[0], box[3] - box[1]
    box_h = 512 - 40 - (96 if cap else 0)
    k = min(452 / bw, box_h / bh)
    sw, sh = max(1, int(bw * k)), max(1, int(bh * k))
    pad = 24
    out = []
    n = len(raw)
    for i, im in enumerate(raw):
        sub = im.crop(box)
        if m.get("cutTopPx"):   # legs shot: clear above the hip line
            pass
        sub = sub.resize((sw, sh), Image.LANCZOS)
        canvas = Image.new("RGBA", (sw + 2 * pad, sh + 2 * pad), (0, 0, 0, 0))
        canvas.alpha_composite(sub, (pad, pad))
        d = ImageDraw.Draw(canvas)
        ph = i / n
        if m.get("zzz"):   # three z's that float up and fade round the loop
            for j in range(3):
                u = (ph * 2 + j / 3) % 1
                x = 0.62 + 0.28 * u + 0.03 * math.sin(u * 6.28)
                y = 0.66 - 0.40 * u
                s = int(40 + 36 * u)
                if u < 0.9:
                    text(d, (int(canvas.width * x), int(canvas.height * y) + pad), "z" if u < 0.5 else "Z", s)
        if m.get("speed"):   # speed lines that flick back and forth
            for j, y in enumerate((0.45, 0.6, 0.75)):
                yy = int(canvas.height * y)
                off = int(18 * math.sin((ph * 4 + j / 3) * 6.28))
                d.line([(canvas.width - pad - 50 - j * 14 + off, yy), (canvas.width - pad + min(0, off), yy)], fill=BROWN, width=8)
        canvas = outline(canvas, 9)
        f = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        top = max(4, (512 - canvas.height - (80 if cap else 0)) // 2)
        f.alpha_composite(canvas, ((512 - canvas.width) // 2, top))
        if cap:
            size = 64
            ft = ImageFont.truetype(FONT, size)
            while ft.getlength(cap) > 470:
                size -= 2
                ft = ImageFont.truetype(FONT, size)
            text(ImageDraw.Draw(f), (256, min(512 - 44, top + canvas.height + 34)), cap, size)
        out.append(clean(f))
    return out, m


def main():
    names = [n for n in ORDER if n in meta and (len(sys.argv) < 2 or n in sys.argv[1].split(","))]
    for i, n in enumerate(names):
        frames, m = frames_of(n)
        dur = round(1000 / m["fps"])
        p = f"{OUT}/{ORDER.index(n) + 1:02d}_{n}.webp"
        q = 80
        while True:   # WhatsApp: animated 512x512 WebP under 500 KB, under 10 s
            frames[0].save(p, "WEBP", save_all=True, append_images=frames[1:], duration=dur, loop=0, quality=q, method=4, minimize_size=True)
            if os.path.getsize(p) < 480_000 or q <= 30:
                break
            q -= 10
        print(n, len(frames), "frames", f"{os.path.getsize(p) / 1024:.0f} KB", "q", q)


if __name__ == "__main__":
    main()
