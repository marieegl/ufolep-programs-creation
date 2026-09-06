# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Inspect the radial geometry of an 'arche' page: header words and line directions."""

import math
import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
page = doc[int(sys.argv[2]) - 1]
print(f"page {page.rect.width:.0f} x {page.rect.height:.0f}\n")

print("=== header words (y > 620) ===")
for w in page.get_text("words"):
    x0, y0, x1, y1, text = w[0], w[1], w[2], w[3], w[4]
    if y0 > 620 and y1 < 700:
        print(f"  x={(x0 + x1) / 2:7.1f} y={(y0 + y1) / 2:6.1f}  {text}")

print("\n=== element lines: direction + centre ===")
for block in page.get_text("dict")["blocks"]:
    if block["type"] != 0:
        continue
    for line in block["lines"]:
        text = "".join(s["text"] for s in line["spans"]).strip()
        size = line["spans"][0]["size"]
        if not text or size > 8 or size < 4:
            continue
        x0, y0, x1, y1 = line["bbox"]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        dx, dy = line["dir"]
        angle = math.degrees(math.atan2(dy, dx))
        print(f"  c=({cx:7.1f},{cy:6.1f}) dir={angle:7.1f}deg  {text[:60]}")
