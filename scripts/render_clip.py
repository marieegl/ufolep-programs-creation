# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Render a rectangular region of a PDF page to PNG. Usage: pdf page x0 y0 x1 y1 out [zoom]"""

import sys

import pymupdf

pdf, page_no, x0, y0, x1, y1, out = sys.argv[1:8]
zoom = float(sys.argv[8]) if len(sys.argv) > 8 else 3.0

page = pymupdf.open(pdf)[int(page_no) - 1]
clip = pymupdf.Rect(float(x0), float(y0), float(x1), float(y1))
page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip).save(out)
print(out)
