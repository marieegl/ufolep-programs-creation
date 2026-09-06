# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Extract the scoring rules from the UFOLEP NPT 'décomposition de la note' PDF.

One page per agrès. Each page is a row of evolution columns (A1..C3); each column
stacks four sections: Tronc Commun requirements, allowed paliers, valorisable
paliers, and valorisations.

The palier grids print all eight paliers whatever the evolution and strike the
unavailable ones through with two diagonal rules, so availability is read from
the vector strokes rather than from the text.
"""

import argparse
import csv
import re

import pymupdf

SECTIONS = (
    "Tronc Commun",
    "Paliers autorisés",
    "Paliers valorisables",
    "Valorisations",
    # Poutre closes each column with the substitution allowed on a foam beam.
    "POUTRE MOUSSE",
)
PALIERS = ("PR", "P1", "P2", "P3", "P4", "P5", "P6", "P7")
EVOLUTIONS = ("A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3")
# A2 and C1 are women's evolutions, so the men's apparatus run six columns wide.
SERIES = {
    "MIXTE": EVOLUTIONS,
    "GAF": EVOLUTIONS,
    "GAM": ("A1", "B1", "B2", "B3", "C2", "C3"),
}
CHOOSE = re.compile(r"CHOISIR\s+(\d+)\s+VALORISATIONS?\s+PARMIS?\s+LES\s+(\d+)", re.I)
# Page 1 breaks the start score down: one point per Tronc Commun requirement, then
# the chosen valorisations at three points for the ones flagged (*) and two for the
# rest. It also publishes the resulting total per evolution, which every agrès page
# has to reproduce.
STARRED = "(*)"
POINTS_STARRED, POINTS_PLAIN = 3, 2
NOTES = {"A": 13, "B1": 14, "B2": 15, "B3": 15, "C": 15}

# The display font is outlined on most pages, so the agrès name and discipline no
# longer exist as text. Page order is the only remaining handle on them.
PAGES = {
    2: ("Saut", "MIXTE"),
    3: ("Sol", "MIXTE"),
    4: ("Barres asymétriques", "GAF"),
    5: ("Poutre", "GAF"),
    6: ("Arçons", "GAM"),
    7: ("Anneaux", "GAM"),
    8: ("Barres parallèles", "GAM"),
    9: ("Barre fixe", "GAM"),
}


def text_lines(page):
    """Every text line as (text, bbox), with soft hyphens and runs of space folded."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            text = re.sub(
                r"\s+", " ", "".join(s["text"] for s in line["spans"])
            ).strip()
            if text:
                lines.append((text, line["bbox"], block["number"]))
    return lines


def columns(lines):
    """Column centres, taken from the 'Paliers autorisés' banner of each evolution."""
    xs = [
        (bbox[0] + bbox[2]) / 2 for text, bbox, _ in lines if text == "Paliers autorisés"
    ]
    return sorted(xs)


def section_bands(lines, centre, half_width, page_bottom):
    """For one column, the y range of each stacked section.

    Saut carries no Tronc Commun, so a section that is absent is simply skipped
    and the one above it extends down to the next section present.
    """
    found = {}
    for text, bbox, _ in lines:
        if text in SECTIONS and abs((bbox[0] + bbox[2]) / 2 - centre) < half_width:
            found[text] = bbox[3]

    present = [name for name in SECTIONS if name in found]
    tops = [found[name] for name in present]
    return dict(zip(present, zip(tops, tops[1:] + [page_bottom])))


def marks(page):
    """Painting order of the strike-through rules and of the fills that hide them.

    An earlier draft of the grids is still in the file: a full set of crosses sits
    underneath the coloured panels that mark the available paliers. Those crosses
    do not print, so a cross only counts if it was painted after the last fill
    covering its cell.
    """
    crosses, fills = [], []
    for index, drawing in enumerate(page.get_drawings()):
        rect = drawing["rect"]
        if drawing["type"] == "s":
            if rect.width > 8 and rect.height > 5:
                crosses.append((index, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2))
        else:
            for item in drawing["items"]:
                if item[0] == "re":
                    fills.append((index, item[1]))
    return crosses, fills


def palier_grid(lines, centre, half_width, band, crosses, fills):
    """Read one 4x2 palier grid: a palier is available unless its cell is struck out."""
    cells = {}
    top, bottom = band
    for text, bbox, _ in lines:
        if text not in PALIERS:
            continue
        cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        if abs(cx - centre) < half_width and top < cy < bottom:
            cells[text] = (cx, cy)

    grid = {}
    for palier, (cx, cy) in cells.items():
        painted = max(
            (i for i, r in fills if r.x0 < cx < r.x1 and r.y0 < cy < r.y1), default=-1
        )
        # Cells are 30 x 16.7pt; a struck cell holds two rules across its diagonal.
        crossed = sum(
            1
            for i, sx, sy in crosses
            if i > painted and abs(sx - cx) < 15 and abs(sy - cy) < 8.4
        )
        grid[palier] = crossed < 2
    return grid


def rules_between(page, centre, half_width, band):
    """The horizontal keylines that box each requirement, top to bottom."""
    top, bottom = band
    ys = {
        round(d["rect"].y0, 1)
        for d in page.get_drawings()
        if d["type"] == "s"
        and d["rect"].height < 1
        and d["rect"].width > half_width
        and abs((d["rect"].x0 + d["rect"].x1) / 2 - centre) < half_width
        and top < d["rect"].y0 < bottom
    }
    return sorted(ys)


def stack_bottom(page, centre, half_width, top):
    """Where a column's stack of boxes ends.

    The bottom section runs to the foot of the page, which on Saut also carries the
    table of vault values and the draft watermark. Every box is bordered on its
    sides whether or not it holds anything, so the stack reaches as far as those
    side rules run without a break.
    """
    sides = [
        (d["rect"].y0, d["rect"].y1)
        for d in page.get_drawings()
        if d["type"] == "s"
        and d["rect"].width < 1
        and d["rect"].height > 5
        and abs((d["rect"].x0 + d["rect"].x1) / 2 - centre) < half_width
    ]
    cursor, extended = top, True
    while extended:
        extended = False
        for y0, y1 in sides:
            if y0 <= cursor + 1 and y1 > cursor:
                cursor, extended = y1, True
    return cursor


def items(page, lines, centre, half_width, band):
    """The separate boxes of a Tronc Commun / Valorisations section, top to bottom.

    Text blocks straddle the boxes in both directions — one block can span three
    requirements, and one requirement can be split across two — so the printed
    keylines decide where an item starts and ends.
    """
    if band is None:
        return []
    top, bottom = band
    bottom = min(bottom, stack_bottom(page, centre, half_width, top))
    separators = rules_between(page, centre, half_width, (top, bottom))

    grouped: dict[int, list] = {}
    for text, bbox, _ in lines:
        cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        if not (abs(cx - centre) < half_width and top < cy < bottom):
            continue
        if text in SECTIONS or CHOOSE.search(text):
            continue
        slot = sum(1 for y in separators if y < cy)
        grouped.setdefault(slot, []).append((bbox[1], text))

    return [
        re.sub(r"\s+", " ", " ".join(t for _, t in sorted(group))).strip()
        for _, group in sorted(grouped.items())
    ]


def choose_rules(page, lines):
    """'CHOISIR 4 VALORISATIONS PARMIS LES 5' — one banner spans several columns.

    The banner's own box gives its reach; the caption inside it is centred and
    narrower, so the box is what says which evolutions the rule applies to.
    """
    boxes = [d["rect"] for d in page.get_drawings() if d["type"] == "s"]
    rules = []
    for text, bbox, _ in lines:
        match = CHOOSE.search(text)
        if not match:
            continue
        span = min(
            (r for r in boxes if r.x0 <= bbox[0] and r.x1 >= bbox[2] and r.height > 5),
            key=lambda r: r.width,
            default=None,
        )
        reach = (span.x0, span.x1) if span else (bbox[0], bbox[2])
        rules.append((reach, int(match.group(1)), int(match.group(2))))
    return rules


def name_columns(lines, centres, half_width, discipline):
    """Label each column with its evolution.

    Some captions were outlined along with the display font, so names come from the
    discipline's fixed series of evolutions; the captions that did survive are used
    to check the alignment rather than to drive it.
    """
    series = SERIES[discipline]
    if len(series) != len(centres):
        return [""] * len(centres), "colonnes inattendues pour la discipline"

    for text, bbox, _ in lines:
        if text not in EVOLUTIONS or bbox[3] > 200:
            continue
        cx = (bbox[0] + bbox[2]) / 2
        for index, centre in enumerate(centres):
            if abs(cx - centre) < half_width and series[index] != text:
                return list(series), f"colonne {index + 1} légendée {text}"
    return list(series), ""


def extract_page(page, page_no):
    agres, discipline = PAGES[page_no]
    lines = text_lines(page)
    centres = columns(lines)
    if not centres:
        return []
    half_width = (
        min(b - a for a, b in zip(centres, centres[1:])) / 2 if len(centres) > 1 else 70
    )
    crosses, fills = marks(page)
    rules = choose_rules(page, lines)
    names, misaligned = name_columns(lines, centres, half_width, discipline)

    rows = []
    for index, centre in enumerate(centres):
        bands = section_bands(lines, centre, half_width, page.rect.y1)
        if "Paliers autorisés" not in bands:
            continue
        allowed = palier_grid(
            lines, centre, half_width, bands["Paliers autorisés"], crosses, fills
        )
        valuable = palier_grid(
            lines, centre, half_width, bands["Paliers valorisables"], crosses, fills
        )
        pick, among = next(
            ((p, a) for (x0, x1), p, a in rules if x0 < centre < x1), ("", "")
        )
        exigences = items(page, lines, centre, half_width, bands.get("Tronc Commun"))
        valorisations = items(page, lines, centre, half_width, bands.get("Valorisations"))
        # On Poutre the foam-beam substitution is one of the offered valorisations.
        mousse = items(page, lines, centre, half_width, bands.get("POUTRE MOUSSE"))

        offered = valorisations + mousse
        starred = sum(1 for v in offered if v.startswith(STARRED))
        chosen = pick or len(offered)
        note = (
            len(exigences)
            + POINTS_STARRED * starred
            + POINTS_PLAIN * (chosen - starred)
            if exigences
            else ""
        )

        controle = [misaligned] if misaligned else []
        expected = NOTES.get(names[index], NOTES.get(names[index][:1]))
        if note and note != expected:
            controle.append(f"note {note} au lieu de {expected}")
        if among and len(valorisations) + len(mousse) != among:
            controle.append(
                f"{len(valorisations) + len(mousse)} valorisations lues, {among} annoncées"
            )
        if len(allowed) != len(PALIERS) or len(valuable) != len(PALIERS):
            controle.append("grille de paliers incomplète")
        if {p for p, ok in valuable.items() if ok} - {
            p for p, ok in allowed.items() if ok
        }:
            controle.append("palier valorisable non autorisé")

        rows.append(
            {
                "page": page_no,
                "agres": agres,
                "discipline": discipline,
                "evolution": names[index],
                "ordre": index + 1,
                "paliers_autorises": " ".join(p for p in PALIERS if allowed.get(p)),
                "paliers_valorisables": " ".join(p for p in PALIERS if valuable.get(p)),
                "valorisations_a_choisir": pick or "",
                "valorisations_proposees": among or "",
                "valorisations_a_3_points": starred,
                "note_de_depart": note,
                "exigences": " | ".join(exigences),
                "valorisations": " | ".join(valorisations),
                "poutre_mousse": " | ".join(mousse),
                "controle": " ; ".join(controle),
            }
        )
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("out")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    rows = []
    for page_no in sorted(PAGES):
        page_rows = extract_page(doc[page_no - 1], page_no)
        rows.extend(page_rows)
        print(f"page {page_no} {PAGES[page_no][0]}: {len(page_rows)} évolutions")

    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n{len(rows)} évolutions -> {args.out}")


if __name__ == "__main__":
    main()
