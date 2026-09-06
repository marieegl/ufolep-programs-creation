# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf>=1.24"]
# ///
"""Extract gymnastic elements from a UFOLEP 'arches' PDF into CSV.

Each page is a half-arch: concentric rings are paliers (P2..P7), the left half
holds one family of elements and the right half another, and a grey strip below
the arch holds the PRÉ-REQUIS (left) and NOMADE (right) zones.

Geometry is calibrated per page from the yellow ring paths (centre, baseline)
and the palier labels printed under the arch, so a re-issued PDF re-calibrates
itself rather than relying on hardcoded coordinates.
"""

import argparse
import csv
import math
import re

import pymupdf

RING_FILL = (0.99, 0.73, 0.19)
RING_TOLERANCE = 0.06
PALIER_LABEL = re.compile(r"^P\d$")
ELEMENT_NUMBER = re.compile(r"^\d+\+?$")
NOISE = ("Imprimerie", "EN COURS DE VALIDATION")
HEADER_BOTTOM = 62
MONTH_YEAR = r"\b(JANV|F[EÉ]VR|MARS|AVRIL|MAI|JUIN|JUIL|AO[UÛ]T|SEPT|OCT|NOV|D[EÉ]C)[A-Z]*\.?\s*\d{2}\b"


def close_to_ring_fill(fill) -> bool:
    if fill is None or len(fill) != 3:
        return False
    return all(abs(a - b) < RING_TOLERANCE for a, b in zip(fill, RING_FILL))


def calibrate(page):
    """Return (centre_x, baseline_y, outer_radius) from the widest yellow ring."""
    rings = [
        d["rect"]
        for d in page.get_drawings()
        if close_to_ring_fill(d.get("fill"))
        and d["rect"].width > 400
        and d["rect"].height > 200
    ]
    if not rings:
        return None
    outer = max(rings, key=lambda r: r.width)
    return (outer.x0 + outer.x1) / 2, outer.y1, outer.width / 2


def palier_rings(page, centre_x, baseline_y):
    """Map each palier label to its ring radius, measured from the printed labels."""
    labels = []
    for x0, y0, x1, y1, text, *_ in page.get_text("words"):
        if not PALIER_LABEL.match(text):
            continue
        if not (baseline_y < (y0 + y1) / 2 < baseline_y + 25):
            continue
        labels.append((text, abs((x0 + x1) / 2 - centre_x)))

    radii: dict[str, list[float]] = {}
    for name, radius in labels:
        radii.setdefault(name, []).append(radius)
    return {name: sum(v) / len(v) for name, v in radii.items()}


def rebuild_line(line) -> str:
    """Read a rotated caption line in glyph order along its own baseline."""
    dx, dy = line["dir"]
    glyphs = []
    for span in line["spans"]:
        for char in span["chars"]:
            gx0, gy0, gx1, gy1 = char["bbox"]
            position = (gx0 + gx1) / 2 * dx + (gy0 + gy1) / 2 * dy
            glyphs.append((position, char["c"]))
    return "".join(c for _, c in sorted(glyphs))


def side_captions(page, centre_x, baseline_y):
    """Reconstruct the large rotated family captions on each half of the arch."""
    halves: dict[str, list[str]] = {"gauche": [], "droite": []}
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            span = line["spans"][0]
            if span["size"] < 15 or "Phenomena" not in span["font"]:
                continue
            x0, y0, x1, y1 = line["bbox"]
            if not (HEADER_BOTTOM < (y0 + y1) / 2 < baseline_y):
                continue
            side = "gauche" if (x0 + x1) / 2 < centre_x else "droite"
            halves[side].append(rebuild_line(line))

    return {
        side: re.sub(r"\s+", " ", "".join(parts)).strip()
        for side, parts in halves.items()
    }


def belongs_to_arch(caption, arche) -> bool:
    """A family is a subdivision of the arch, so its name is echoed in the title.

    Some pages carry an invisible caption left over from an earlier layout
    (SOL p.3 right half); this discards it instead of inventing a family.
    """
    words = {w for w in re.findall(r"\w+", caption.lower()) if len(w) > 2}
    return bool(words & set(re.findall(r"\w+", arche.lower())))


def page_header(page):
    """Read the arch identity from the top banner: number, agrès, arch name."""
    parts = [w[4] for w in page.get_text("words") if (w[1] + w[3]) / 2 < HEADER_BOTTOM]
    text = re.sub(r"\s+", " ", " ".join(parts)).strip()
    text = re.sub(MONTH_YEAR, "", text, flags=re.IGNORECASE).strip()

    chunks = [c.strip() for c in text.split(" I ") if c.strip()]
    numero = chunks.pop(0) if chunks and chunks[0].isdigit() else ""
    if not chunks:
        return numero, "", ""

    head = chunks[0].split()
    agres = head[0] if head else ""
    arche = " / ".join(filter(None, [" ".join(head[1:]), *chunks[1:]]))
    return numero, agres, arche


def is_element_start(words, i) -> bool:
    if not ELEMENT_NUMBER.match(words[i]):
        return False
    if i + 1 < len(words) and words[i + 1] == "-":
        return True
    return (
        i + 2 < len(words)
        and words[i + 1].lower().startswith("new")
        and words[i + 2] == "-"
    )


def split_into_elements(words):
    """Split a run of (text, bbox) words into element chunks at 'NNN - ' boundaries."""
    texts = [w[0] for w in words]
    starts = [i for i in range(len(texts)) if is_element_start(texts, i)]
    if not starts:
        return []
    bounds = starts + [len(texts)]
    return [words[bounds[k] : bounds[k + 1]] for k in range(len(starts))]


def centroid(chunk):
    xs = [(w[1][0] + w[1][2]) / 2 for w in chunk]
    ys = [(w[1][1] + w[1][3]) / 2 for w in chunk]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def classify(cx, cy, centre_x, baseline_y, rings, strip_top):
    """Assign a palier and a side to an element from its position on the page."""
    side = "gauche" if cx < centre_x else "droite"
    if cy > strip_top:
        return ("PRÉ-REQUIS" if side == "gauche" else "NOMADE"), side, None

    radius = math.hypot(cx - centre_x, cy - baseline_y)
    if not rings:
        return "", side, radius

    name, best = min(rings.items(), key=lambda kv: abs(kv[1] - radius))
    step = ring_step(rings)
    if abs(best - radius) > step * 0.6:
        # Rings are only labelled from P2 up; the white disc inside the innermost
        # ring is P1, printed without a label.
        return ("P1" if radius < min(rings.values()) else "HORS-ANNEAU"), side, radius
    return name, side, radius


def ring_step(rings) -> float:
    radii = sorted(rings.values())
    gaps = [b - a for a, b in zip(radii, radii[1:])]
    return sum(gaps) / len(gaps) if gaps else 67.5


def controles(palier, libelle):
    """Flag rows a human needs to look at. Cheap consistency checks, not guesses."""
    flags = []
    if palier in ("", "HORS-ANNEAU"):
        flags.append("palier indéterminé")

    if not libelle:
        flags.append("libellé vide")
    return " ; ".join(flags)


def parse_label(text):
    """Split '82 new - Roulade arrière' into ('82', 'new', 'Roulade arrière')."""
    match = re.match(r"^(\d+\+?)\s*(new\+?)?\s*-\s*(.*)$", text, re.IGNORECASE)
    if not match:
        return "", "", text
    return match.group(1), (match.group(2) or "").lower(), match.group(3).strip()


def extract_page(page, page_no):
    geometry = calibrate(page)
    if geometry is None:
        return []
    centre_x, baseline_y, outer_radius = geometry
    rings = palier_rings(page, centre_x, baseline_y)
    numero, agres, arche = page_header(page)
    captions = {
        side: caption
        for side, caption in side_captions(page, centre_x, baseline_y).items()
        if belongs_to_arch(caption, arche)
    }
    strip_top = baseline_y + 18

    blocks: dict[int, list] = {}
    for x0, y0, x1, y1, text, block_no, *_ in page.get_text("words"):
        if (y0 + y1) / 2 < HEADER_BOTTOM or any(n in text for n in NOISE):
            continue
        blocks.setdefault(block_no, []).append((text, (x0, y0, x1, y1)))

    rows = []
    for block_no in sorted(blocks):
        for chunk in split_into_elements(blocks[block_no]):
            raw = re.sub(r"\s+", " ", " ".join(w[0] for w in chunk)).strip()
            cx, cy = centroid(chunk)
            palier, side, radius = classify(
                cx, cy, centre_x, baseline_y, rings, strip_top
            )
            numero_el, variante, libelle = parse_label(raw)
            # Elements in the PRÉ-REQUIS / NOMADE strip sit outside the arch, so the
            # left/right split there carries no family meaning.
            in_strip = palier in ("PRÉ-REQUIS", "NOMADE")
            famille = "" if in_strip else captions.get(side, "")
            rows.append(
                {
                    "page": page_no,
                    "agres": agres,
                    "arche_numero": numero,
                    "arche": arche,
                    "famille": famille,
                    "cote": "" if in_strip else side,
                    "palier": palier,
                    "numero": numero_el,
                    "variante": variante,
                    "libelle": libelle,
                    "libelle_brut": raw,
                    "x": round(cx, 1),
                    "y": round(cy, 1),
                    "rayon": round(radius, 1) if radius is not None else "",
                    "controle": controles(palier, libelle),
                }
            )
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("out")
    parser.add_argument("--pages", default="")
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    wanted = (
        [int(p) for p in args.pages.split(",")]
        if args.pages
        else range(1, doc.page_count + 1)
    )

    rows = []
    for page_no in wanted:
        page_rows = extract_page(doc[page_no - 1], page_no)
        rows.extend(page_rows)
        print(f"page {page_no}: {len(page_rows)} éléments")

    fields = list(rows[0].keys()) if rows else []
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n{len(rows)} éléments -> {args.out}")


if __name__ == "__main__":
    main()
