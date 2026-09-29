#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Generate the PWA / home-screen icons from a single definition.

One flat, full-bleed dark tile with 'NPT' over a small 'UFOLEP', so the home-screen
icon reads at a glance and iOS can round the corners itself. Re-run to change the look;
the PNGs it writes to public/ are what the app ships.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (22, 32, 43)  # #16202b — the app's accent
GOLD = (216, 149, 36)  # #d89524 — the "à confirmer" amber, used as an accent
WHITE = (255, 255, 255)

FONTS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/Library/Fonts/Arial Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def centered(draw: ImageDraw.ImageDraw, text: str, y: float, f: ImageFont.FreeTypeFont, fill, size: int):
    box = draw.textbbox((0, 0), text, font=f)
    w = box[2] - box[0]
    draw.text(((size - w) / 2 - box[0], y), text, font=f, fill=fill)


def make(size: int, path: Path) -> None:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)
    centered(draw, "NPT", size * 0.24, font(int(size * 0.40)), WHITE, size)
    centered(draw, "UFOLEP", size * 0.66, font(int(size * 0.135)), GOLD, size)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    print(f"wrote {path} ({size}×{size})")


def main(public: Path) -> None:
    make(512, public / "icon-512.png")
    make(192, public / "icon-192.png")
    make(180, public / "apple-touch-icon.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public"))
