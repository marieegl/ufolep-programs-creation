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
import pathlib
import re

import pymupdf

# One PDF per apparatus, so its name comes from the file rather than the banner.
AGRES = {
    "sol": "Sol",
    "saut": "Saut",
    "barres-asym": "Barres asymétriques",
    "poutre": "Poutre",
    "arcons": "Arçons",
    "anneaux": "Anneaux",
    "barres-paralleles": "Barres parallèles",
    "barre-fixe": "Barre fixe",
}
WHITE = 0xFFFFFF
CAPTION_GAP = 15
PALIER_LABEL = re.compile(r"^P\d$")
ELEMENT_NUMBER = re.compile(r"^\d+\+?$")
NOISE = ("Imprimerie", "EN COURS DE VALIDATION")
HEADER_BOTTOM = 62
MONTH_YEAR = r"\b(JANV|F[EÉ]VR|MARS|AVRIL|MAI|JUIN|JUIL|AO[UÛ]T|SEPT|OCT|NOV|D[EÉ]C)[A-Z]*\.?\s*\d{2}\b"


def calibrate(page):
    """Return (centre_x, baseline_y, outer_radius) from the widest ring.

    Each apparatus prints its arch in its own colour, so the rings are recognised
    as the largest group of same-coloured shapes big enough to span an arch.
    """
    groups: dict[tuple, list] = {}
    for drawing in page.get_drawings():
        fill, rect = drawing.get("fill"), drawing["rect"]
        if fill is None or rect.width < 400 or rect.height < 200:
            continue
        groups.setdefault(tuple(round(c, 2) for c in fill), []).append(rect)
    if not groups:
        return None
    outer = max(max(groups.values(), key=len), key=lambda r: r.width)
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


def angle_of(x, y, centre_x, baseline_y) -> float:
    """Bearing of a point on the arch, from 0° at the right foot to 180° at the left."""
    return math.degrees(math.atan2(baseline_y - y, x - centre_x))


def family_captions(page, centre_x, baseline_y):
    """The large rotated family captions, as (angle, name) along the arch.

    A caption is broken into fragments that each form their own text block, so
    they are regrouped by bearing: fragments of one caption sit a few degrees
    apart while distinct captions stand tens of degrees apart.

    Some pages carry a caption left over from an earlier layout, painted white on
    white (SOL p.3, right half); it does not print, so it is dropped.
    """
    fragments = []
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            span = line["spans"][0]
            if span["size"] < 15 or "Phenomena" not in span["font"]:
                continue
            if span["color"] == WHITE:
                continue
            x0, y0, x1, y1 = line["bbox"]
            middle = (y0 + y1) / 2
            if not (HEADER_BOTTOM < middle < baseline_y):
                continue
            angle = angle_of((x0 + x1) / 2, middle, centre_x, baseline_y)
            fragments.append((angle, rebuild_line(line)))

    captions, previous = [], None
    for angle, text in sorted(fragments, reverse=True):
        if previous is not None and previous - angle <= CAPTION_GAP:
            captions[-1][1].append(text)
        else:
            captions.append((angle, [text]))
        previous = angle
    return [(a, re.sub(r"\s+", " ", "".join(p)).strip()) for a, p in captions]


def sector_count(captions) -> int:
    """How many equal sectors the arch is divided into.

    Each sector carries at most one caption, so a half holding two captions means
    the halves are themselves subdivided (ANNEAUX 'Force / Croix / ATR / Appuis').
    """
    for side in (True, False):
        if sum(1 for angle, _ in captions if (angle > 90) == side) > 1:
            return 4
    return 2


def sector_of(angle, count) -> int:
    return min(max(int((180 - angle) / (180 / count)), 0), count - 1)


def family_at(angle, captions, count) -> str:
    """The family an element belongs to, or none when its sector is uncaptioned."""
    wanted = sector_of(angle, count)
    return next(
        (text for a, text in captions if sector_of(a, count) == wanted),
        "",
    )


def family_of(chunk, captions, count, centre_x, baseline_y):
    """The family of an element, and whether its words agree on it.

    An element normally sits well inside one sector, so all its words agree. Some
    pages draw no separator at the apex and centre a few labels across it; there
    the family really is undecided, and a straddle is reported rather than settled
    on a fraction of a degree of centroid.
    """
    families = {
        family_at(
            angle_of((x0 + x1) / 2, (y0 + y1) / 2, centre_x, baseline_y),
            captions,
            count,
        )
        for _, (x0, y0, x1, y1) in chunk
    }
    if len(families) == 1:
        return families.pop(), False
    return "", True


def page_header(page, agres):
    """Read the arch number and name from the top banner.

    The banner also names the apparatus, but not always in the same place — on
    Anneaux it trails the arch name instead of leading it — and a name of several
    words does not survive being split on whitespace. The apparatus is already
    known from the file, so it is removed from the banner rather than parsed out.

    Arch numbers run to two digits, whereas the digits inside a name count a
    family or an approach ("ACROS 2", "APPEL 1 PIED"), which keeps them apart.
    """
    parts = [w[4] for w in page.get_text("words") if (w[1] + w[3]) / 2 < HEADER_BOTTOM]
    text = re.sub(r"\s+", " ", " ".join(parts)).strip()
    text = re.sub(MONTH_YEAR, "", text, flags=re.IGNORECASE)
    text = re.sub(rf"\b{re.escape(agres)}s?\b", "", text, count=1, flags=re.IGNORECASE)

    numero = re.search(r"\b\d{2,}\b", text)
    if numero:
        text = text[: numero.start()] + text[numero.end() :]

    chunks = [c.strip() for c in text.split(" I ") if c.strip()]
    return (numero.group() if numero else ""), " / ".join(chunks)


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


def controles(palier, libelle, famille_incertaine):
    """Flag rows a human needs to look at. Cheap consistency checks, not guesses."""
    flags = []
    if palier in ("", "HORS-ANNEAU"):
        flags.append("palier indéterminé")
    if famille_incertaine:
        flags.append("famille incertaine")
    if not libelle:
        flags.append("libellé vide")
    return " ; ".join(flags)


def parse_label(text):
    """Split '82 new - Roulade arrière' into ('82', 'new', 'Roulade arrière')."""
    match = re.match(r"^(\d+\+?)\s*(new\+?)?\s*-\s*(.*)$", text, re.IGNORECASE)
    if not match:
        return "", "", text
    return match.group(1), (match.group(2) or "").lower(), match.group(3).strip()


def extract_page(page, page_no, agres):
    geometry = calibrate(page)
    if geometry is None:
        return []
    centre_x, baseline_y, outer_radius = geometry
    rings = palier_rings(page, centre_x, baseline_y)
    numero, arche = page_header(page, agres)
    captions = family_captions(page, centre_x, baseline_y)
    sectors = sector_count(captions)
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
            famille, incertaine = family_of(
                chunk, captions, sectors, centre_x, baseline_y
            )
            # The strip sits outside the arch, and the P1 disc is narrower than a
            # label, so neither carries a family.
            if in_strip or palier == "P1":
                famille, incertaine = "", False
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
                    "controle": controles(palier, libelle, incertaine),
                }
            )
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("out")
    parser.add_argument("--pages", default="")
    parser.add_argument("--agres", default="")
    args = parser.parse_args()

    stem = pathlib.Path(args.pdf).stem.removeprefix("arches-")
    agres = args.agres or AGRES.get(stem, stem)

    doc = pymupdf.open(args.pdf)
    wanted = (
        [int(p) for p in args.pages.split(",")]
        if args.pages
        else range(1, doc.page_count + 1)
    )

    rows = []
    for page_no in wanted:
        page_rows = extract_page(doc[page_no - 1], page_no, agres)
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
