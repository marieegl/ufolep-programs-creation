# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Render each page with the extracted palier stamped on every element.

Lets a human compare the CSV against the original layout at a glance.
"""

import argparse
import csv
import math

import pymupdf

from extract_arches import calibrate, palier_rings, ring_step

RED = (0.85, 0.1, 0.1)
BLUE = (0.1, 0.25, 0.75)


def draw_rings(page, centre_x, baseline_y, rings):
    half = ring_step(rings) / 2
    for radius in rings.values():
        for edge in (radius - half, radius + half):
            page.draw_circle(
                pymupdf.Point(centre_x, baseline_y), edge, color=BLUE, width=0.4
            )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("csv")
    parser.add_argument("outdir")
    parser.add_argument("--dpi", type=int, default=110)
    args = parser.parse_args()

    rows = list(csv.DictReader(open(args.csv, encoding="utf-8")))
    by_page: dict[int, list] = {}
    for row in rows:
        by_page.setdefault(int(row["page"]), []).append(row)

    doc = pymupdf.open(args.pdf)
    for page_no, page_rows in sorted(by_page.items()):
        page = doc[page_no - 1]
        geometry = calibrate(page)
        if geometry:
            centre_x, baseline_y, _ = geometry
            draw_rings(page, centre_x, baseline_y, palier_rings(page, centre_x, baseline_y))

        for row in page_rows:
            x, y = float(row["x"]), float(row["y"])
            colour = RED if row["controle"] else BLUE
            page.draw_circle(pymupdf.Point(x, y), 3, color=colour, fill=colour)
            page.insert_text(
                pymupdf.Point(x + 5, y + 3),
                f"{row['numero']} {row['palier']}",
                fontsize=7,
                color=colour,
            )

        out = f"{args.outdir}/controle_p{page_no}.png"
        page.get_pixmap(dpi=args.dpi).save(out)
        print(f"{out}  ({len(page_rows)} éléments)")


if __name__ == "__main__":
    main()
