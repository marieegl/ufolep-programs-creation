#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Compile the extracted CSVs into the single JSON catalog the web app ships with."""

from __future__ import annotations

import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

PALIER_ORDER = ["PRÉ-REQUIS", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "NOMADE"]

# The décomposition abbreviates PRÉ-REQUIS in its palier lists; the arches PDFs spell
# it out on the elements. The catalog keeps one spelling so a palier can be compared.
PALIER_ALIAS = {"PR": "PRÉ-REQUIS"}

# The valorisation totals are integers per palier for Saut, tenths elsewhere;
# read off decompo-note.pdf p.2 and confirmed against the published tables.
VAULT_VALUES = {"PRÉ-REQUIS": 9, "P1": 12, "P2": 12, "P3": 13, "P4": 13, "P5": 13, "P6": 14, "P7": 14, "NOMADE": 12}


def slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def split_list(cell: str) -> list[str]:
    return [part.strip() for part in cell.split("|") if part.strip()]


def paliers(cell: str) -> list[str]:
    return [PALIER_ALIAS.get(name, name) for name in cell.split()]


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build_elements(csv_dir: Path) -> list[dict]:
    elements = []
    for path in sorted(csv_dir.glob("elements-*.csv")):
        for row in read_rows(path):
            agres = row["agres"]
            nouveau = row["variante"].lower().startswith("new")
            elements.append(
                {
                    # Element numbers repeat across paliers within an arch, and arch
                    # numbers restart per discipline, so the key needs all four parts.
                    "id": "-".join(
                        (
                            slug(agres),
                            row["arche_numero"],
                            slug(row["palier"]),
                            slug(row["numero"].replace("+", "-plus")),
                        )
                    )
                    + ("-new" if nouveau else ""),
                    "agres": agres,
                    "arche": int(row["arche_numero"]),
                    "archeNom": row["arche"],
                    "famille": row["famille"] or None,
                    "cote": row["cote"] or None,
                    "palier": row["palier"],
                    "numero": row["numero"],
                    "nouveau": nouveau,
                    "marque": row["marque"] or None,
                    "libelle": row["libelle"],
                    "controle": row["controle"] or None,
                }
            )
    elements.sort(key=lambda e: (e["agres"], e["arche"], PALIER_ORDER.index(e["palier"]), e["numero"]))
    return elements


def build_evolutions(csv_path: Path) -> list[dict]:
    evolutions = []
    for row in read_rows(csv_path):
        valorisations = [
            {
                "texte": re.sub(r"^\(\*\)\s*", "", text),
                "points": 3 if text.startswith("(*)") else 2,
            }
            for text in split_list(row["valorisations"])
        ]
        # The 'poutre mousse' column is not a separate grid but one more valorisation,
        # always worth 2: without it Poutre A1/A2 fall 2 points short of the published
        # 13, and `valorisations_proposees` is exactly len(valorisations) + 1 wherever
        # it is printed. Its text is prefixed because the mousse wording repeats the
        # high-beam one ('Acro P2 (min.)' / '1 acro P2 (min.)').
        if row.get("poutre_mousse", "").strip():
            valorisations.append({"texte": f"Poutre mousse : {row['poutre_mousse'].strip()}", "points": 2})
        exigences = split_list(row["exigences"])
        evolutions.append(
            {
                "id": f"{slug(row['agres'])}-{slug(row['evolution'])}",
                "agres": row["agres"],
                "discipline": row["discipline"],
                "evolution": row["evolution"],
                "ordre": int(row["ordre"]),
                "paliersAutorises": paliers(row["paliers_autorises"]),
                "paliersValorisables": paliers(row["paliers_valorisables"]),
                "valorisationsAChoisir": int(row["valorisations_a_choisir"] or 0) or None,
                "noteDeDepart": float(row["note_de_depart"]) if row["note_de_depart"] else None,
                "exigences": exigences,
                "valorisations": valorisations,
                "controle": row["controle"] or None,
            }
        )
    evolutions.sort(key=lambda e: (e["agres"], e["ordre"]))
    return evolutions


def build_criteres(rules_path: Path, pairs_path: Path) -> list[dict]:
    """One entry per criterion, carrying the elements that satisfy it.

    The rules file is the source of truth for what a criterion asks; the resolved
    pairs only exist for the criteria that select elements at all, so a criterion
    scoped to the routine or left to the coach appears here with an empty list.
    """
    criteres = {}
    for row in read_rows(rules_path):
        key = (row["agres"], row["genre"], row["texte"])
        if key in criteres:
            continue  # an 'X ou Y' criterion is spelt over several rows
        low, _, high = row["nombre"].partition("-")
        criteres[key] = {
            "agres": row["agres"],
            "genre": row["genre"],
            "texte": row["texte"],
            "type": row["type"],
            "nombreMin": int(low),
            "nombreMax": int(high) if high else None,
            "confirmation": row["confirmation"] == "oui",
            # Only an `arches` rule still needs its exclusion at scoring time: the
            # others were already applied when the elements were selected.
            "exclureArche": row["exclure_arche"] or None,
            "commentaire": row["commentaire"] or None,
            "elements": [],
        }
    for row in read_rows(pairs_path):
        criteres[(row["agres"], row["genre"], row["texte"])]["elements"].append(row["element_id"])
    return sorted(criteres.values(), key=lambda c: (c["agres"], c["genre"], c["texte"]))


def build_agres(elements: list[dict], evolutions: list[dict]) -> list[dict]:
    disciplines = {e["agres"]: e["discipline"] for e in evolutions}
    names = sorted({e["agres"] for e in elements} | set(disciplines))
    return [
        {
            "id": slug(name),
            "nom": name,
            "discipline": disciplines.get(name, "MIXTE"),
            "nbElements": sum(1 for e in elements if e["agres"] == name),
        }
        for name in names
    ]


def main(csv_dir: Path, out_path: Path, rules_path: Path) -> None:
    elements = build_elements(csv_dir)
    evolutions = build_evolutions(csv_dir / "decompo-note.csv")
    criteres = build_criteres(rules_path, csv_dir / "criteres-elements.csv")
    catalog = {
        "edition": "JUIL. 26",
        "paliers": PALIER_ORDER,
        "valeursSaut": VAULT_VALUES,
        "agres": build_agres(elements, evolutions),
        "elements": elements,
        "evolutions": evolutions,
        "criteres": criteres,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"{out_path}: {len(catalog['agres'])} agrès, {len(elements)} éléments, "
        f"{len(evolutions)} évolutions, {len(criteres)} critères, "
        f"{out_path.stat().st_size / 1024:.0f} kB"
    )


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: build_data.py <csv-dir> <catalog.json> <criteres.csv>")
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
