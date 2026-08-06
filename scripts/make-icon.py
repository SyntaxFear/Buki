#!/usr/bin/env python3
"""Generate the Bloombook app icon + splash art (PIL, deterministic)."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"

BEIGE = (235, 230, 218, 255)
CORAL = (232, 105, 90, 255)
CORAL_DARK = (217, 91, 76, 255)
CREAM = (253, 248, 237, 255)
TEAL = (94, 198, 180, 255)
YELLOW = (242, 201, 76, 255)
FLOWER = (232, 92, 74, 255)
GREEN = (91, 158, 99, 255)


def rounded(d, box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)


def draw_book(size: int, on_beige: bool) -> Image.Image:
    img = Image.new("RGBA", (size, size), BEIGE if on_beige else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024

    # open book cover
    bx0, by0, bx1, by1 = 132 * s, 262 * s, 892 * s, 782 * s
    rounded(d, (bx0, by0, bx1, by1), 56 * s, CORAL)
    # pages
    px0, py0, px1, py1 = bx0 + 34 * s, by0 + 34 * s, bx1 - 34 * s, by1 - 34 * s
    rounded(d, (px0, py0, px1, py1), 34 * s, CREAM)
    # spine dots
    cx = (px0 + px1) / 2
    y = py0 + 30 * s
    while y < py1 - 20 * s:
        d.ellipse((cx - 5 * s, y, cx + 5 * s, y + 10 * s), fill=CORAL_DARK)
        y += 34 * s
    # washi tapes
    tape = Image.new("RGBA", (int(180 * s), int(56 * s)), TEAL)
    tape.putalpha(235)
    tape = tape.rotate(-12, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(tape, (int(96 * s), int(216 * s)))
    tape2 = Image.new("RGBA", (int(170 * s), int(54 * s)), YELLOW)
    tape2.putalpha(235)
    tape2 = tape2.rotate(10, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(tape2, (int(700 * s), int(724 * s)))

    # flower on the right page: stem + petals
    fx, fy = cx + 190 * s, (py0 + py1) / 2 + 40 * s
    d.line((fx, fy + 10 * s, fx - 26 * s, fy + 130 * s), fill=GREEN, width=int(22 * s))
    import math
    for a in range(0, 360, 60):
        r = math.radians(a)
        pr = 52 * s
        d.ellipse(
            (fx + math.cos(r) * pr - 34 * s, fy + math.sin(r) * pr - 34 * s,
             fx + math.cos(r) * pr + 34 * s, fy + math.sin(r) * pr + 34 * s),
            fill=FLOWER,
        )
    d.ellipse((fx - 30 * s, fy - 30 * s, fx + 30 * s, fy + 30 * s), fill=YELLOW)

    # little sun doodle on the left page
    sx, sy = cx - 210 * s, (py0 + py1) / 2 - 60 * s
    d.ellipse((sx - 44 * s, sy - 44 * s, sx + 44 * s, sy + 44 * s), outline=YELLOW, width=int(16 * s))
    for a in range(0, 360, 45):
        r = math.radians(a)
        d.line(
            (sx + math.cos(r) * 62 * s, sy + math.sin(r) * 62 * s,
             sx + math.cos(r) * 92 * s, sy + math.sin(r) * 92 * s),
            fill=YELLOW, width=int(14 * s),
        )
    return img


# iOS icon (opaque)
draw_book(1024, True).convert("RGB").save(OUT / "icon.png")
# splash icon (transparent, book only)
draw_book(512, False).save(OUT / "splash-icon.png")
# android adaptive: foreground transparent art, background solid beige
draw_book(1024, False).save(OUT / "android-icon-foreground.png")
Image.new("RGB", (1024, 1024), BEIGE[:3]).save(OUT / "android-icon-background.png")
draw_book(1024, False).convert("LA").save(OUT / "android-icon-monochrome.png")
# favicon
draw_book(196, True).convert("RGB").save(OUT / "favicon.png")
print("icons written to", OUT)
