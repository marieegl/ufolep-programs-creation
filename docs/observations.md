# Observations on the source PDFs

Everything here was found while extracting, and none of it is settled. The point of
the file is to be re-read against the next issue of the programme: an item that has
gone away was a draft bug that got fixed, an item that is still there is either a
deliberate rule we have misread or a bug worth reporting to the UFOLEP.

The women's arches (Sol, Saut, Barres asymétriques, Poutre) were re-issued dated
**SEPT. 26** and reached their first validated state — the *EN COURS DE VALIDATION*
watermark is gone and they are filed under *NPT - PRÊT POUR DIFFUSION*. The men's-only
arches (Anneaux, Barres parallèles, Barre fixe) are still earlier drafts, and the four
rulebook PDFs carry no date. Items below were re-checked against the SEPT. 26 issue;
anything specific to the men's apparatus still reflects the earlier draft.

The women's **décomposition** sheets were also refreshed from the SEPT. 26 brochure
(*Programme Technique GAF 2026-2030*). `data/csv/decompo-note.csv` was hand-corrected
against it rather than re-extracted — the brochure embeds the four sheets on pages 26/28/30/32
instead of shipping the standalone `decompo-note.pdf` the extractor expects. The changes:
Poutre B3 sortie `1 sortie P4 (min.)` → `1 sortie avec liaison acro`; Poutre C2 sortie
element `P5 (min.)` → `P4 (min.)`; Poutre B2/B3/C1/C2 Tronc Commun element gained `(min.)`;
Sol C1 `1 salto position tendue` → `… appel 2 pieds`; Saut B3 now carries real valorisations
(item 16 below, resolved). Re-running `extract_decompo.py` on the old PDF would revert these.

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
| 16 | *(resolved SEPT. 26)* Saut **B3** | ~~One valorisation read literally **"En cours de Validation"** — the watermark in a criterion's slot.~~ The refreshed SEPT. 26 sheet fills it with the three real Saut valorisations, matching C1-C3; the placeholder criterion was removed from both `decompo-note.csv` and `criteres.csv`. | — |
| 17 | `decompo-note.pdf` p.9, Barre fixe | A valorisation reads **"1 appui / élan PXX"** — an unfilled palier placeholder. Treated as a palier-less rule, so it selects the whole *appuis / élans* vocabulary instead of one palier's worth. | `grep PXX data/csv/decompo-note.csv` |

## Missing material

| # | Observation | How to re-check |
| --- | --- | --- |
| 5 | **No arches PDF for Arçons.** The seven other apparatus each have one, and Arçons does have its décomposition page (p.6), so its element catalog is simply not published yet. | a new `arches-arcons.pdf` on the site; `AGRES` in `extract_arches.py` already has an entry for it |
| 6 | **Anneaux and Barre fixe have no NOMADE elements** — the grey zone is printed on every page but left empty. Checked visually, so this is the PDF's state and not a extraction miss. Every other apparatus has some. | `palier == "NOMADE"` appearing in those two CSVs |
| 18 | **No sortie above P5 on Anneaux or Barre fixe**, although C3 rewards `1 sortie P6 (min.)` on both. Sorties are recognised by the word in the element label, and the highest either catalog offers is P5. So the criterion is unreachable as published. | the two rows carrying `attendu` in `data/criteres.csv`; `npm run resolve` reports them and nothing else |
| 19 | **The Poutre publishes no sortie arch** — no arch, no family, no label mentions one — yet five of its valorisations reward a sortie (`1 sortie P3 (min.)` up to `1 sortie avec liaison acro dont 1 élément P5 (min.)`). Its eight arches are ATR ET MAINTIEN, PIVOT, ACRO 1, ACRO 2, ACCRO POUTRE MOUSSE, SAUTS APPEL 1 PIED, SAUTS APPEL 2 PIEDS, ENTRÉES: entries are catalogued as their own arch, exits are not. The dismounts are the ACRO 1 / ACRO 2 acros performed as an exit, so they **are** in the catalog — just not labelled as sorties. They are now named by id in `data/sorties.csv` (19 elements, confirmed by Marie) and reach the five criteria through the `tag` column with `confirmation`, so the criteria are no longer `manuel`; the judge still ticks each one. | a dedicated sortie arch appearing in `data/csv/elements-poutre.csv`, which would let the tag be replaced by an arch motif |
| 20 | **Seven words the décomposition scores by are in no element label**: `sangle`, `shoot`, `changement de face`, `changement de barre`, `champignon`, `transversal`, `transport` — zero occurrences across all 675 elements, families and arch names. Four of them are Arçons vocabulary and Arçons has no arches PDF (item 5), which accounts for those; the rest are criteria naming something the catalog does not describe. | `npm run resolve` — a rule on one of these words is flagged *aucun élément sélectionné* |

## Leftovers from earlier layouts

Not errors in the programme itself, but artefacts in the files that an extractor has
to know about. They are worth watching because a fixed file may drop the workaround's
justification — or break it.

| # | Observation | How to re-check |
| --- | --- | --- |
| 7 | `arches-sol.pdf` p.3, right half carries the caption **"En arrière"** painted white on white. It does not print, and it does not belong: that half has no family. Captions are now filtered on colour. | `WHITE` filter in `family_captions` — drop it and see if a spurious family appears |
| 8 | `decompo-note.pdf` keeps **a full earlier set of crosses hidden beneath the coloured panels** of the palier grids. They do not print. A cell is only struck out if its crosses were painted *after* the last panel covering it. | `marks()` in `extract_decompo.py` — ignore painting order and see if paliers stop increasing across évolutions |
| 13 | **Element numbers are spelt three different ways.** Beyond the plain number, thirteen elements are numbered `bis` and the spelling varies — attached or detached, capitalised or not (`55 bis`, `19bis`, `71 Bis`), and one has the stamp of item 14 glued to the dash (`113 bis 26-`). All are normalised to a lowercase `Nbis`. Until this was handled, those labels were not recognised as element starts and their text was appended to the preceding element, which is why the catalog grew from 655 to 663. | `grep -c bis data/csv/elements-*.csv` should total 13 |
| 9 | `decompo-note.pdf` pp.4-9 have the **display font converted to outlines**, so apparatus names, the discipline, and some évolution captions do not exist as text at all. Body text (Calibri) is intact. Names come from page order instead. | whether `page.get_text()` on p.4 yields "BARRES ASYMÉTRIQUES" |

## Open questions for the UFOLEP

| # | Question |
| --- | --- |
| 10 | **Ten elements have no decidable family.** On pages that draw no radial separator at the arch apex, a few labels are centred across it (the three *équerre* elements of SOL *MAINTIEN ET SOUPLESSE*, six of *BARRES ASYMÉTRIQUES BALANCÉS AVANT*, one of *ROTATIONS*). Do they belong to one family, or to the arch as a whole? They are left with no family and flagged `famille incertaine`. |
| 11 | **Arch numbers are not unique.** They restart per discipline: GAF runs Sol 11-18, Barres asymétriques 19-23, Poutre 24-31, while GAM reuses 24-27 for Anneaux and 24-28 for Barres parallèles. So an element's key needs the apparatus, not just the arch number. |
| 12 | **Is a palier global or per apparatus?** The same element name appears on several apparatus; nothing yet says whether its rating travels with it. |
| 14 | **What is the second number printed on every element label but Sol's?** It is always **26** — `46 26 - De la suspension…` — and appears on 286 of the 663 elements. Nothing in the rulebooks mentions it. The edition is dated JUIL. **26**, so it may mark an element added or revised in this issue, which would make it a second, redundant spelling of the `new` marker some elements also carry. It is kept in its own `marque` column rather than folded into the number, so a later answer can reinterpret it without re-extracting. |
| 22 | **Which families of the Anneaux `FORCE ET MAINTIEN` arch are "les maintiens"?** That arch is the only one split into quarters (item 10's neighbour), and several criteria say *maintien* without saying which quarters count. Currently read as `croix|appuis|atr`. | the family names of Anneaux arch 24-27 in `data/csv/elements-anneaux.csv` |
| 23 | **What is a "bonus"?** The word appears in the rulebooks but no bonus is ever defined or quantified in this issue. It applies after the final note, so nothing can be attached to a start score; the app ignores it. | a bonus table appearing in the next issue |
| 15 | **Element numbers are not unique within an arch either.** Ten pairs share an arch and a number while sitting on different paliers, and only five of those are the known `+` variants. So the catalog key is apparatus + arch + palier + number. |

## Settled

| Observation | Answer |
| --- | --- |
| Value of a vault by palier | **Integers**, not tenths: PR 9 · P1-P2 12 · P3-P4-P5 13 · P6-P7 14 · Nomades 12. Read from the merged cells of `decompo-note.pdf` p.2 and confirmed by Marie; not yet extracted programmatically. |
| The unlabelled white disc at the arch centre | **P1.** Rings are only labelled from P2 up. |
| Start score formula | 1 point per Tronc Commun requirement, then the chosen valorisations at 3 points each for those flagged `(*)` and 2 for the rest. Reproduces the totals published on p.1 (A → 13, B1 → 14, B2/B3/C → 15) on 53 of the 56 columns; the 3 misses are items 1-3 above. |
| The `poutre mousse` band on `decompo-note.pdf` p.5 | **One more valorisation, always worth 2** — not a separate grid, which is how it reads on the page. Two independent proofs: Poutre A1 and A2 compute 11 against a published 13 without it and exactly 13 with it, while all six other columns stay right; and `valorisations_proposees` equals `len(valorisations) + 1` in every column where the banner is printed (B → 5 = 4+1, C → 6 = 5+1). Its eight texts are prefixed `Poutre mousse : ` in the catalog, because the mousse wording repeats the high-beam one (`Acro P2 (min.)` against `1 acro P2 (min.)`). |
| Palier spelling | The décomposition abbreviates **PR**, the arches PDFs spell out **PRÉ-REQUIS**. Normalised to the long form when the catalog is built, so `paliersAutorises` can be compared to an element's palier — otherwise every pré-requis silently drops out of an évolution that allows it. |
| The `+` suffix on an element number | Exactly one palier above the plain variant (170 → P3, 170+ → P4), recovered from geometry alone. |
| What is a "PG"? | **Passage Gymnique** — the `generalites.pdf` LEXIQUE defines it: *"Enchaînement de 2 sauts minimum différents liés directement ou indirectement avec des pas courus, petits sauts, pas chassés, tour chorégraphique… sans passage au sol, ni passage chorégraphique statique entre les sauts."* So Sol's `1 PG ou 1 FORCE` is a composed passage of jumps, not a single element or arch — it stays `manuel`/`confirmation` for scoring, but the term is no longer a guess (was open question 21). |
