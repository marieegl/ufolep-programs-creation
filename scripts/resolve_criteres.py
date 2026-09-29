#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Expand the hand-written criterion rules against the element catalog.

`data/criteres.csv` holds one rule per criterion formulation; this script applies
each rule to the catalog and writes one row per criterion-element pair, plus the
checks that say whether a rule is plausible. Nothing is hand-associated: a re-issued
programme is re-resolved rather than re-transcribed.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

PALIER_ORDER = ["PRÉ-REQUIS", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "NOMADE"]
PALIER_ALIAS = {"PR": "PRÉ-REQUIS"}

# A rule whose selector takes in more than half of an apparatus has almost certainly
# lost its meaning; a genuine criterion names something narrower than that.
TOO_BROAD = 0.5

# What the engine counts. `elements` and `max` count matching elements, `familles`
# counts the distinct families they belong to ("2 acros de sens différents"),
# `arches` and `total` ignore the selector and look at the routine as a whole.
SELECTOR_TYPES = {"elements", "max", "familles"}
ROUTINE_TYPES = {"arches", "total"}
VALID_TYPES = SELECTOR_TYPES | ROUTINE_TYPES | {"manuel"}

COLUMNS = [
    "agres", "genre", "texte", "type", "nombre", "confirmation", "palier",
    "arche", "famille", "libelle", "exclure", "exclure_arche", "attendu", "commentaire",
]
MOTIF_COLUMNS = ("arche", "famille", "libelle")

# A boolean attribute the element carries, not a regex on its text — used where the
# programme rewards something no wording identifies, like a Poutre 'sortie'. The value
# names the element flag to require (`sortie`). Kept out of MOTIF_COLUMNS: it is not
# matched, folded or breadth-checked like an arch/family/label motif.
TAG_COLUMN = "tag"


def unaccent(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def fold(text: str) -> str:
    """Case- and accent-insensitive form, punctuation flattened to spaces.

    Labels and criterion texts come from different pages of different PDFs and
    disagree on apostrophes ('l’appui' / "l’appui") and on accents, so motifs are
    matched against this form. Punctuation becomes a space *before* accents are
    stripped: dropping a typographic apostrophe first would glue 'l’appui' into
    'lappui' and no motif would ever match it.
    """
    return re.sub(r"\s+", " ", unaccent(re.sub(r"[^0-9A-Za-zÀ-ÿ]+", " ", text or ""))).strip()


def fold_motif(motif: str) -> str:
    """Same normalisation, minus the punctuation pass, which would eat the regex.

    A motif is a regular expression: flattening its characters would turn 'atr|roue'
    into 'atr roue' and its alternation would silently become a phrase.
    """
    return unaccent(motif).strip()


def palier_index(name: str) -> int:
    return PALIER_ORDER.index(PALIER_ALIAS.get(name, name))


def parse_palier(cell: str) -> tuple[str, bool] | None:
    """'P3' means exactly P3, 'P3+' means P3 or above."""
    cell = cell.strip()
    if not cell:
        return None
    return PALIER_ALIAS.get(cell.rstrip("+"), cell.rstrip("+")), cell.endswith("+")


def parse_nombre(cell: str) -> tuple[int, int | None]:
    """'2' is a floor, '6-8' is a range."""
    cell = cell.strip()
    if not cell:
        return 1, None
    if "-" in cell:
        low, high = cell.split("-", 1)
        return int(low), int(high)
    return int(cell), None


def matches(rule: dict, element: dict) -> bool:
    # A tag is an element flag, not a motif: 'sortie' requires element["sortie"] is set.
    # `.get(... or "")` because a rule row may predate the column and read back as None.
    tag = (rule.get(TAG_COLUMN) or "").strip()
    if tag and not element.get(tag):
        return False
    for column, field in zip(MOTIF_COLUMNS, ("archeNom", "famille", "libelle")):
        motif = rule[column].strip()
        if motif and not re.search(fold_motif(motif), fold(element[field])):
            return False
    # 'hors sortie' names a family or a wording; 'hors arche champignon' names an
    # arch. They have to be separate: three arches carry 'Sorties' in their own name,
    # so one exclusion column would empty them out.
    exclure = rule["exclure"].strip()
    if exclure and re.search(fold_motif(exclure), fold(f"{element['famille'] or ''} {element['libelle']}")):
        return False
    exclure_arche = rule["exclure_arche"].strip()
    if exclure_arche and re.search(fold_motif(exclure_arche), fold(element["archeNom"])):
        return False
    palier = parse_palier(rule["palier"])
    if palier:
        name, minimum = palier
        # NOMADE sits outside the palier ladder, so a threshold never reaches it.
        if element["palier"] == "NOMADE" and name != "NOMADE":
            return False
        if minimum:
            return palier_index(element["palier"]) >= palier_index(name)
        return element["palier"] == name
    return True


def catalogued_criteria(catalog: dict) -> dict[tuple[str, str, str], list[dict]]:
    """Every (agres, genre, texte) printed in the décomposition, with its évolutions.

    The `(*)` marker is a points flag, not part of the text — the same criterion can
    be worth 3 points in one évolution and 2 in another — so one rule covers all of
    its occurrences.
    """
    found: dict[tuple[str, str, str], list[dict]] = {}
    for evolution in catalog["evolutions"]:
        for genre, key in (("exigence", "exigences"), ("valorisation", "valorisations")):
            for item in evolution[key]:
                text = item["texte"] if isinstance(item, dict) else item
                text = re.sub(r"^\(\*\)\s*", "", text).strip()
                found.setdefault((evolution["agres"], genre, text), []).append(evolution)
    return found


def palier_out_of_range(rows: list[dict], evolutions: list[dict]) -> str:
    """A threshold no évolution can reach means the rule read the wrong palier."""
    for rule in rows:
        palier = parse_palier(rule["palier"])
        # A `max` rule names a palier the évolution does *not* reward — that is the
        # whole point of '1 PR max dans tout l’enchaînement'.
        if not palier or rule["type"] == "max":
            continue
        name = palier[0]
        # The grids abbreviate PRÉ-REQUIS to PR; elements spell it out.
        if all(name not in [PALIER_ALIAS.get(p, p) for p in e["paliersAutorises"]] for e in evolutions):
            allowed = " ".join(evolutions[0]["paliersAutorises"])
            return f"palier {name} hors des paliers autorisés ({allowed})"
    return ""


def check(rows: list[dict], selected: list[dict], pool: list[dict]) -> str:
    """Say why a rule looks wrong, or return ''."""
    kind = rows[0]["type"]
    if kind not in VALID_TYPES:
        return f"type inconnu: {kind}"
    if len({r["type"] for r in rows}) > 1:
        return "les lignes d'une même règle ne s'accordent pas sur le type"
    if kind == "manuel":
        if any(r[c].strip() for r in rows for c in MOTIF_COLUMNS):
            return "règle manuelle avec un motif: choisir l'un ou l'autre"
        # A criterion the machine gives up on has to say why, or the next reader
        # cannot tell a deliberate hand-off from a motif nobody got round to writing.
        if not rows[0]["commentaire"].strip():
            return "règle manuelle sans commentaire expliquant ce qui n'est pas dérivable"
        return ""
    if kind in ROUTINE_TYPES:
        # `exclure_arche` still applies — 'N arches (péda NON)' counts arches minus one.
        if any(r[c].strip() for r in rows for c in MOTIF_COLUMNS):
            return f"une règle {kind} porte sur l'enchaînement entier et ignore les motifs"
        return ""
    if not pool:
        return ""  # apparatus with no published arches PDF; nothing to select from
    if not selected:
        return "aucun élément sélectionné"
    # Breadth only means something for a rule that names something. A `familles` rule
    # is meant to span an arch, a `max` rule to name what must stay rare, and a rule
    # whose only condition is a palier threshold selects most of the apparatus by
    # design — '1 élément P2 (min.)' really does mean any of them.
    named = any(r[c].strip() for r in rows for c in ("arche", "famille", "libelle"))
    if kind == "elements" and named and len(selected) > len(pool) * TOO_BROAD:
        return f"motif trop large: {len(selected)}/{len(pool)} éléments"
    if kind == "familles" and len({e["famille"] for e in selected}) < parse_nombre(rows[0]["nombre"])[0]:
        return "moins de familles distinctes que la règle en demande"
    return ""


def main(rules_path: Path, catalog_path: Path, out_path: Path) -> int:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    with rules_path.open(encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = set(COLUMNS) - set(reader.fieldnames or [])
        if missing:
            sys.exit(f"{rules_path}: colonnes manquantes: {', '.join(sorted(missing))}")
        rules = list(reader)

    per_agres: dict[str, list[dict]] = {}
    for element in catalog["elements"]:
        per_agres.setdefault(element["agres"], []).append(element)

    # Rows sharing a key are one rule whose selections are unioned, which is how the
    # 'X ou Y' criteria are written without an expression language.
    grouped: dict[tuple[str, str, str], list[dict]] = {}
    for rule in rules:
        grouped.setdefault((rule["agres"], rule["genre"], rule["texte"].strip()), []).append(rule)

    printed = catalogued_criteria(catalog)
    rows = []
    problems = []
    expected = []
    for key, group in grouped.items():
        agres, genre, texte = key
        pool = per_agres.get(agres, [])
        kind = group[0]["type"]
        selected: list[dict] = []
        if kind in SELECTOR_TYPES:
            selected = [e for e in pool if any(matches(r, e) for r in group)]
        evolutions = printed.pop(key, None)
        if evolutions is None:
            message = "règle sans critère correspondant dans la décomposition"
        else:
            message = palier_out_of_range(group, evolutions) or check(group, selected, pool)
        if message and group[0]["attendu"].strip():
            expected.append((agres, genre, texte, message, group[0]["attendu"].strip()))
        elif message:
            problems.append((agres, genre, texte, message))
        low, high = parse_nombre(group[0]["nombre"])
        for element in selected:
            rows.append(
                {
                    "agres": agres,
                    "genre": genre,
                    "texte": texte,
                    "type": kind,
                    "nombre_min": low,
                    "nombre_max": high or "",
                    "confirmation": group[0]["confirmation"],
                    "element_id": element["id"],
                    "palier": element["palier"],
                    "famille": element["famille"] or "",
                    "libelle": element["libelle"],
                }
            )

    for agres, genre, texte in printed:
        problems.append((agres, genre, texte, "critère sans règle"))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "agres", "genre", "texte", "type", "nombre_min", "nombre_max",
                "confirmation", "element_id", "palier", "famille", "libelle",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    kinds = {t: sum(1 for g in grouped.values() if g[0]["type"] == t) for t in sorted(VALID_TYPES)}
    print(f"{out_path}: {len(grouped)} règles ({len(rules)} lignes), {len(rows)} couples critère-élément")
    print("  " + " · ".join(f"{t} {n}" for t, n in kinds.items() if n))
    if expected:
        print(f"\n{len(expected)} signalement(s) attendu(s), documenté(s) dans data/criteres.csv:")
        for agres, genre, texte, message, why in sorted(expected):
            print(f"  [{agres}] {genre} · {texte}\n      → {message} — {why}")
    if problems:
        print(f"\n{len(problems)} à revoir:")
        for agres, genre, texte, message in sorted(problems):
            print(f"  [{agres}] {genre} · {texte}\n      → {message}")
    return 1 if problems else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rules", type=Path)
    parser.add_argument("catalog", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--strict", action="store_true", help="exit non-zero if a rule looks wrong")
    args = parser.parse_args()
    status = main(args.rules, args.catalog, args.out)
    sys.exit(status if args.strict else 0)
