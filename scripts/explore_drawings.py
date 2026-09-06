# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""List the largest vector drawings on a page to locate the arch geometry."""

import sys

import pymupdf

page = pymupdf.open(sys.argv[1])[int(sys.argv[2]) - 1]
drawings = page.get_drawings()
print(f"{len(drawings)} drawings")

by_area = sorted(drawings, key=lambda d: -(d["rect"].width * d["rect"].height))
for d in by_area[:12]:
    r = d["rect"]
    print(
        f"  [{r.x0:7.1f},{r.y0:6.1f} -> {r.x1:7.1f},{r.y1:6.1f}] "
        f"w={r.width:6.1f} h={r.height:6.1f} fill={d.get('fill')} type={d['type']}"
    )
