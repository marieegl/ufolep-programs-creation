# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Dump text spans with coordinates to understand the page geometry."""

import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
page = doc[int(sys.argv[2]) - 1]
print(f"page size: {page.rect.width:.0f} x {page.rect.height:.0f}")

for block in page.get_text("dict")["blocks"]:
    if block["type"] != 0:
        continue
    x0, y0, x1, y1 = block["bbox"]
    text = " ".join(
        span["text"] for line in block["lines"] for span in line["spans"]
    ).strip()
    if not text:
        continue
    size = block["lines"][0]["spans"][0]["size"]
    font = block["lines"][0]["spans"][0]["font"]
    print(f"[{x0:6.1f},{y0:6.1f} -> {x1:6.1f},{y1:6.1f}] s={size:4.1f} {font:22s} {text[:90]}")
