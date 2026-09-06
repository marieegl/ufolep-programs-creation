# Observations on the source PDFs

Everything here was found while extracting, and none of it is settled. The point of
the file is to be re-read against the next issue of the programme: an item that has
gone away was a draft bug that got fixed, an item that is still there is either a
deliberate rule we have misread or a bug worth reporting to the UFOLEP.

Extracted from the issue dated **JUIL. 26** (the date printed on every arch page;
the four rulebook PDFs carry no date). Every page still carries the
*EN COURS DE VALIDATION* watermark.

Re-run both extractors and diff the CSVs to see what moved:

```sh
uv run scripts/extract_decompo.py data/pdf/decompo-note.pdf data/csv/decompo-note.csv
for a in sol saut barres-asym poutre anneaux barres-paralleles barre-fixe; do
  uv run scripts/extract_arches.py "data/pdf/arches-$a.pdf" "data/csv/elements-$a.csv"
done
```

## Likely errors in the programme

These contradict the programme's own stated rules, so one side of the contradiction
is wrong. The scripts flag all of them in the `controle` column.

| # | Where | Observation | How to re-check |
| --- | --- | --- | --- |
| 1 | `decompo-note.pdf` p.6, Arçons **C2** | One valorisation flagged `(*)` where every other évolution at that level has two, so the start score comes to **14 instead of 15**. | `controle` empty for that row |
| 2 | `decompo-note.pdf` p.9, Barre fixe **A1** | No `CHOISIR n VALORISATIONS PARMIS LES m` banner is printed at all — the page has 2 banners for 6 columns. Five valorisations are offered; taking all five gives **15 instead of 13**. A banner reading *CHOISIR 4 PARMIS LES 5* would give exactly 13. | `valorisations_a_choisir` non-empty for that row |
| 3 | `decompo-note.pdf` p.9, Barre fixe **B1** | One valorisation flagged `(*)` instead of two, so the start score comes to **13 instead of 14**. | `controle` empty for that row |
| 4 | `arches-poutre.pdf` p.5 | Arch 28 is titled **ACCRO POUTRE MOUSSE**; every other acrobatic arch is spelt *ACRO*. | the `arche` column for Poutre arch 28 |

## Missing material

| # | Observation | How to re-check |
| --- | --- | --- |
| 5 | **No arches PDF for Arçons.** The seven other apparatus each have one, and Arçons does have its décomposition page (p.6), so its element catalog is simply not published yet. | a new `arches-arcons.pdf` on the site; `AGRES` in `extract_arches.py` already has an entry for it |
| 6 | **Anneaux and Barre fixe have no NOMADE elements** — the grey zone is printed on every page but left empty. Checked visually, so this is the PDF's state and not a extraction miss. Every other apparatus has some. | `palier == "NOMADE"` appearing in those two CSVs |

## Leftovers from earlier layouts

Not errors in the programme itself, but artefacts in the files that an extractor has
to know about. They are worth watching because a fixed file may drop the workaround's
justification — or break it.

| # | Observation | How to re-check |
| --- | --- | --- |
| 7 | `arches-sol.pdf` p.3, right half carries the caption **"En arrière"** painted white on white. It does not print, and it does not belong: that half has no family. Captions are now filtered on colour. | `WHITE` filter in `family_captions` — drop it and see if a spurious family appears |
| 8 | `decompo-note.pdf` keeps **a full earlier set of crosses hidden beneath the coloured panels** of the palier grids. They do not print. A cell is only struck out if its crosses were painted *after* the last panel covering it. | `marks()` in `extract_decompo.py` — ignore painting order and see if paliers stop increasing across évolutions |
| 9 | `decompo-note.pdf` pp.4-9 have the **display font converted to outlines**, so apparatus names, the discipline, and some évolution captions do not exist as text at all. Body text (Calibri) is intact. Names come from page order instead. | whether `page.get_text()` on p.4 yields "BARRES ASYMÉTRIQUES" |

## Open questions for the UFOLEP

| # | Question |
| --- | --- |
| 10 | **Ten elements have no decidable family.** On pages that draw no radial separator at the arch apex, a few labels are centred across it (the three *équerre* elements of SOL *MAINTIEN ET SOUPLESSE*, six of *BARRES ASYMÉTRIQUES BALANCÉS AVANT*, one of *ROTATIONS*). Do they belong to one family, or to the arch as a whole? They are left with no family and flagged `famille incertaine`. |
| 11 | **Arch numbers are not unique.** They restart per discipline: GAF runs Sol 11-18, Barres asymétriques 19-23, Poutre 24-31, while GAM reuses 24-27 for Anneaux and 24-28 for Barres parallèles. So an element's key needs the apparatus, not just the arch number. |
| 12 | **Is a palier global or per apparatus?** The same element name appears on several apparatus; nothing yet says whether its rating travels with it. |

## Settled

| Observation | Answer |
| --- | --- |
| Value of a vault by palier | **Integers**, not tenths: PR 9 · P1-P2 12 · P3-P4-P5 13 · P6-P7 14 · Nomades 12. Read from the merged cells of `decompo-note.pdf` p.2 and confirmed by Marie; not yet extracted programmatically. |
| The unlabelled white disc at the arch centre | **P1.** Rings are only labelled from P2 up. |
| Start score formula | 1 point per Tronc Commun requirement, then the chosen valorisations at 3 points each for those flagged `(*)` and 2 for the rest. Reproduces the totals published on p.1 (A → 13, B1 → 14, B2/B3/C → 15) on 53 of the 56 columns; the 3 misses are items 1-3 above. |
| The `+` suffix on an element number | Exactly one palier above the plain variant (170 → P3, 170+ → P4), recovered from geometry alone. |
