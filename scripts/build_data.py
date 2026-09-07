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

# The valorisation totals are integers per palier for Saut, tenths elsewhere;
# read off decompo-note.pdf p.2 and confirmed against the published tables.
VAULT_VALUES = {"PRÉ-REQUIS": 9, "P1": 12, "P2": 12, "P3": 13, "P4": 13, "P5": 13, "P6": 14, "P7": 14, "NOMADE": 12}


def slug(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def split_list(cell: str) -> list[str]:
    return [part.strip() for part in cell.split("|") if part.strip()]


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
        exigences = split_list(row["exigences"])
        evolutions.append(
            {
                "id": f"{slug(row['agres'])}-{slug(row['evolution'])}",
                "agres": row["agres"],
                "discipline": row["discipline"],
                "evolution": row["evolution"],
                "ordre": int(row["ordre"]),
                "paliersAutorises": row["paliers_autorises"].split(),
                "paliersValorisables": row["paliers_valorisables"].split(),
                "valorisationsAChoisir": int(row["valorisations_a_choisir"] or 0) or None,
                "noteDeDepart": float(row["note_de_depart"]) if row["note_de_depart"] else None,
                "exigences": exigences,
                "valorisations": valorisations,
                "controle": row["controle"] or None,
            }
        )
    evolutions.sort(key=lambda e: (e["agres"], e["ordre"]))
    return evolutions


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


def main(csv_dir: Path, out_path: Path) -> None:
    elements = build_elements(csv_dir)
    evolutions = build_evolutions(csv_dir / "decompo-note.csv")
    catalog = {
        "edition": "JUIL. 26",
        "paliers": PALIER_ORDER,
        "valeursSaut": VAULT_VALUES,
        "agres": build_agres(elements, evolutions),
        "elements": elements,
        "evolutions": evolutions,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"{out_path}: {len(catalog['agres'])} agrès, {len(elements)} éléments, "
        f"{len(evolutions)} évolutions, {out_path.stat().st_size / 1024:.0f} kB"
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: build_data.py <csv-dir> <catalog.json>")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
