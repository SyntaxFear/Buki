#!/usr/bin/env python3
"""Generate deterministic sample photos of kids' drawings on a wooden table.

Used by the simulator demo (no camera hardware) and as realistic pipeline
fixtures. Pure Pillow, seeded — same output every run.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1200, 1600


def wood_background(seed: int) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (W, H), (139, 101, 65))
    d = ImageDraw.Draw(img)
    # planks
    plank_w = W // 4
    for i in range(5):
        x = i * plank_w
        tone = rng.randint(-14, 14)
        d.rectangle([x, 0, x + plank_w - 3, H], fill=(139 + tone, 101 + tone, 65 + tone // 2))
        d.line([x + plank_w - 2, 0, x + plank_w - 2, H], fill=(96, 68, 42), width=3)
    # grain
    for _ in range(220):
        x = rng.randint(0, W)
        y = rng.randint(0, H)
        length = rng.randint(40, 300)
        tone = rng.randint(-18, 10)
        d.line(
            [x, y, x + rng.randint(-10, 10), y + length],
            fill=(139 + tone, 101 + tone, 65 + tone // 2),
            width=rng.randint(1, 3),
        )
    return img.filter(ImageFilter.GaussianBlur(1.2))


def crayon_line(d: ImageDraw.ImageDraw, pts, color, width, rng):
    """Slightly wobbly multi-pass stroke that reads as crayon."""
    for _ in range(3):
        jittered = [
            (x + rng.uniform(-2.5, 2.5), y + rng.uniform(-2.5, 2.5)) for x, y in pts
        ]
        d.line(jittered, fill=color, width=width, joint="curve")


def paper_with_drawing(draw_fn, seed: int, tilt_deg: float) -> Image.Image:
    rng = random.Random(seed)
    pw, ph = 820, 1100
    paper = Image.new("RGB", (pw, ph), (246, 243, 234))
    pd = ImageDraw.Draw(paper)
    # faint paper grain
    for _ in range(1600):
        x = rng.randint(0, pw - 1)
        y = rng.randint(0, ph - 1)
        tone = rng.randint(-5, 4)
        pd.point((x, y), fill=(246 + tone, 243 + tone, 234 + tone))
    draw_fn(pd, rng)

    rotated = paper.rotate(tilt_deg, expand=True, resample=Image.BICUBIC, fillcolor=None)
    mask = Image.new("L", (pw, ph), 255).rotate(tilt_deg, expand=True, resample=Image.BICUBIC)
    out = Image.new("RGBA", rotated.size, (0, 0, 0, 0))
    out.paste(rotated, (0, 0), mask)
    return out


def draw_sun_house(d: ImageDraw.ImageDraw, rng):
    yellow = (240, 190, 40)
    red = (205, 70, 55)
    green = (90, 150, 70)
    blue = (70, 110, 180)
    brown = (120, 85, 50)
    # sun
    d.ellipse([80, 80, 240, 240], outline=yellow, width=14)
    for a in range(0, 360, 30):
        r0, r1 = 90, 140
        cx, cy = 160, 160
        d.line(
            [cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a)),
             cx + r1 * math.cos(math.radians(a)), cy + r1 * math.sin(math.radians(a))],
            fill=yellow, width=10,
        )
    # house
    crayon_line(d, [(260, 760), (260, 520), (560, 520), (560, 760), (260, 760)], red, 13, rng)
    crayon_line(d, [(240, 520), (410, 380), (580, 520)], brown, 13, rng)
    crayon_line(d, [(350, 760), (350, 640), (450, 640), (450, 760)], blue, 11, rng)
    # grass
    for x in range(120, 720, 36):
        crayon_line(d, [(x, 980), (x + 14, 930), (x + 28, 980)], green, 9, rng)
    # cloud
    d.ellipse([560, 120, 700, 200], outline=blue, width=10)


def draw_cat(d: ImageDraw.ImageDraw, rng):
    dark = (60, 60, 65)
    orange = (225, 140, 60)
    pink = (225, 130, 150)
    # head
    d.ellipse([250, 220, 590, 540], outline=dark, width=13)
    # ears
    crayon_line(d, [(290, 280), (260, 150), (390, 240)], dark, 12, rng)
    crayon_line(d, [(550, 280), (580, 150), (450, 240)], dark, 12, rng)
    # face
    d.ellipse([330, 330, 380, 380], outline=dark, width=10)
    d.ellipse([460, 330, 510, 380], outline=dark, width=10)
    crayon_line(d, [(400, 420), (420, 445), (440, 420)], pink, 9, rng)
    for sx in (-1, 1):
        for dy in (-14, 8, 30):
            cx = 420 + sx * 65
            crayon_line(d, [(cx, 430 + dy), (cx + sx * 130, 420 + dy)], dark, 6, rng)
    # body
    d.ellipse([230, 520, 610, 940], outline=orange, width=13)
    # stripes
    for i in range(4):
        y = 600 + i * 80
        crayon_line(d, [(300, y), (540, y + 25)], orange, 10, rng)
    # tail
    crayon_line(d, [(600, 760), (700, 660), (680, 540)], orange, 12, rng)


def draw_boat(d: ImageDraw.ImageDraw, rng):
    blue = (60, 105, 175)
    red = (205, 70, 55)
    yellow = (240, 190, 40)
    dark = (70, 70, 75)
    # hull
    crayon_line(d, [(220, 700), (280, 800), (560, 800), (620, 700), (220, 700)], red, 13, rng)
    # mast
    crayon_line(d, [(420, 700), (420, 300)], dark, 11, rng)
    # sail
    crayon_line(d, [(430, 310), (430, 660), (640, 660), (430, 310)], blue, 12, rng)
    crayon_line(d, [(410, 360), (410, 660), (260, 660), (410, 360)], blue, 10, rng)
    # waves
    for y in (880, 940):
        pts = []
        for x in range(140, 700, 40):
            pts.append((x, y + (12 if (x // 40) % 2 else -12)))
        crayon_line(d, pts, blue, 9, rng)
    # sun
    d.ellipse([580, 120, 700, 240], outline=yellow, width=12)
    # birds
    for bx, by in ((220, 180), (300, 230)):
        crayon_line(d, [(bx, by), (bx + 28, by - 18), (bx + 56, by)], dark, 7, rng)


def perspective_coeffs(target_quad, source_rect):
    """Solve the 8 PIL PERSPECTIVE coefficients mapping target→source (pure python)."""
    a = []
    b = []
    for (tx, ty), (sx, sy) in zip(target_quad, source_rect):
        a.append([tx, ty, 1, 0, 0, 0, -sx * tx, -sx * ty])
        a.append([0, 0, 0, tx, ty, 1, -sy * tx, -sy * ty])
        b.append(sx)
        b.append(sy)
    # gaussian elimination on the 8x8 system
    n = 8
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[piv] = m[piv], m[col]
        div = m[col][col]
        m[col] = [v / div for v in m[col]]
        for r in range(n):
            if r != col and m[r][col] != 0:
                f = m[r][col]
                m[r] = [rv - f * cv for rv, cv in zip(m[r], m[col])]
    return [m[i][n] for i in range(n)]


def compose_perspective(name: str, seed: int, draw_fn):
    """A hand-held angled shot: real perspective, not just rotation."""
    rng = random.Random(seed)
    pw, ph = 820, 1100
    paper = Image.new("RGBA", (pw, ph), (246, 243, 234, 255))
    pd = ImageDraw.Draw(paper)
    for _ in range(1600):
        x = rng.randint(0, pw - 1)
        y = rng.randint(0, ph - 1)
        tone = rng.randint(-5, 4)
        pd.point((x, y), fill=(246 + tone, 243 + tone, 234 + tone, 255))
    draw_fn(pd, rng)

    # paper corners inside the photo: top edge farther away (narrower)
    quad = [(330, 260), (890, 330), (1000, 1330), (200, 1260)]
    coeffs = perspective_coeffs(quad, [(0, 0), (pw, 0), (pw, ph), (0, ph)])
    warped = paper.transform((W, H), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC)

    bg = wood_background(seed)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh_mask = warped.split()[3].point(lambda a: min(a, 110))
    shadow.paste((20, 12, 6, 110), (14, 18), sh_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    out = Image.alpha_composite(bg.convert("RGBA"), shadow)
    out.alpha_composite(warped)
    out.convert("RGB").save(OUT / f"{name}.jpg", quality=88)
    print("wrote", OUT / f"{name}.jpg")


def compose(name: str, seed: int, tilt: float, draw_fn):
    bg = wood_background(seed)
    paper = paper_with_drawing(draw_fn, seed + 1, tilt)
    # soft drop shadow
    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    sh_mask = paper.split()[3].point(lambda a: min(a, 110))
    px = (W - paper.width) // 2
    py = (H - paper.height) // 2
    shadow.paste((20, 12, 6, 110), (px + 14, py + 18), sh_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow)
    bg.paste(paper, (px, py), paper)
    out = bg.convert("RGB")
    # subtle vignette/lighting falloff
    out.save(OUT / f"{name}.jpg", quality=88)
    print("wrote", OUT / f"{name}.jpg")


compose("sample-house", 7, 4.5, draw_sun_house)
compose("sample-cat", 21, -3.5, draw_cat)
compose_perspective("sample-boat", 35, draw_boat)
