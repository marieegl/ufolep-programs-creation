# UFOLEP NPT — start-score calculator

Tooling to turn the UFOLEP *Nouveau Programme Technique* (gymnastics) PDFs into a
structured catalog, and eventually a static web app that composes a routine and
computes its start score.

Source PDFs: <https://ufolepgym.com/index.php/npt/>. The women's apparatus (Sol,
Saut, Barres asymétriques, Poutre) reached their first validated issue in
September 2026 ("SEPT. 26", filed under *NPT - PRÊT POUR DIFFUSION*); the
men's-only apparatus are still earlier drafts. Extraction stays re-runnable rather
than hand-transcribed, so each re-issue is re-derived rather than re-typed.

## Layout

| Path | Contents |
| --- | --- |
| `data/pdf/` | The published PDFs, renamed to stable filenames |
| `data/csv/` | Extracted catalog, one file per apparatus |
| `data/criteres.csv` | One hand-maintained rule per scoring criterion, saying which elements satisfy it |
| `scripts/` | Extraction and verification scripts |
| `src/` | The web app, and the JSON catalog it is built with |
| `docs/criteres.md` | The rule language of `data/criteres.csv` and the controls that check it |
| `docs/observations.md` | What looks wrong or unsettled in the source PDFs, to re-read against the next issue |

## Running the app

```sh
npm install
npm run dev      # or: npm run build, then open dist/index.html
```

`npm run build` re-derives `src/data/catalog.json` from the CSVs and emits a single
self-contained `dist/index.html` — no separate asset files, so it works both on
GitHub Pages and from a double-click on a downloaded copy.

```sh
npm run data     # rebuild src/data/catalog.json from the CSVs and the rules
npm run test     # check the engine against the notes published on page 1
```

## Sharing the app

The app is handed over as the file itself: `dist/index.html` is self-contained, so it
travels by mail or by USB stick and opens on a double-click, with no network, install or
account. There is nothing hosted — this is a calculator for a handful of coaches, not a
public site. Note that nothing is saved either: a reload clears the chosen elements.

```sh
npm run build
cp dist/index.html ~/Desktop/"Note de départ NPT UFOLEP.html"
```

`.github/workflows/build.yml` runs on every push and pull request. Besides the
typecheck, the tests and the build, it re-derives the catalog and diffs it against the
committed copy: the catalog is checked in so the app builds without Python, but it is
generated, and an edited CSV that nobody re-resolved would otherwise stay invisible
until the next person ran `npm run data`. Each run also attaches `dist/index.html`, so a
built copy of any revision can be downloaded without a local toolchain.

## Extracting the elements

Scripts use [PEP 723](https://peps.python.org/pep-0723/) inline dependencies, so
`uv` installs what they need on the fly:

```sh
uv run scripts/extract_arches.py data/pdf/arches-sol.pdf data/csv/elements-sol.csv
```

Seven of the eight apparatus are published — there is no arches PDF for Arçons yet:

```sh
for a in sol saut barres-asym poutre anneaux barres-paralleles barre-fixe; do
  uv run scripts/extract_arches.py "data/pdf/arches-$a.pdf" "data/csv/elements-$a.csv"
done
```

That yields 675 elements over 30 arches, of which 11 carry a `controle` flag.

To eyeball the result, `overlay_check.py` re-renders each page with the extracted
palier stamped on every element and the ring boundaries drawn:

```sh
mkdir -p build/pages
cd scripts && uv run overlay_check.py ../data/pdf/arches-sol.pdf ../data/csv/elements-sol.csv ../build/pages
```

## How the "arches" PDFs are read

Each page is a half-arch rather than a table:

- **concentric rings are paliers** — an element's rating is its distance from the
  arch centre, not its column. Rings are labelled P2…P7; the unlabelled white disc
  inside the innermost ring is P1.
- **angular sectors are families**. Most subdivided arches split into halves
  (*En avant* / *En arrière*), but ANNEAUX *Force et maintien* splits into quarters,
  so the sector count is read off the captions themselves. A sector may well be
  unnamed while its neighbour is named, as with the *Sorties* of the men's arches.
- **an element label opens with its number**, but in several spellings: a bare
  number, a `+` variant, a `bis` variant attached or detached from the digits, and
  on every apparatus but Sol a second always-identical number whose meaning is
  unknown. Splitting the page into elements has to recognise all of them, or a
  label is silently glued to its neighbour.
- **a grey strip below the arch** holds PRÉ-REQUIS on the left and NOMADE on the right.
  It sits outside the arch, so the split there carries no family meaning.

Geometry is calibrated per page from the ring artwork and the printed palier labels,
so a re-issued PDF recalibrates itself instead of breaking on shifted coordinates.
Each apparatus draws its arch in its own colour, so the rings are recognised as the
largest group of same-coloured shapes rather than by a fixed colour.

The apparatus name is taken from the filename. The top banner does name it, but not
in a consistent position — on ANNEAUX it trails the arch name instead of leading it
— and a name of several words does not survive being split on whitespace.

## Extracting the scoring rules

`decompo-note.pdf` holds one page per apparatus, each split into columns — one per
*évolution* (A1, A2, B1, B2, B3, C1, C2, C3; A2 and C1 are women's only, so the
men's apparatus run six columns wide).

```sh
uv run scripts/extract_decompo.py data/pdf/decompo-note.pdf data/csv/decompo-note.csv
```

Two encodings make these pages harder to read than they look:

- **palier grids always print all eight paliers**; an unavailable one is greyed and
  struck through with two diagonal rules. An earlier draft of the grids also
  survives in the file as a full set of crosses hidden *beneath* the coloured
  panels, so painting order decides whether a cross actually prints.
- **the display font is outlined** on pages 4-9, so apparatus names and some column
  captions no longer exist as text. Names come from page order and from each
  discipline's fixed series of évolutions; the captions that did survive are used to
  check that alignment rather than to drive it.

Page 1 gives the scoring formula — one point per Tronc Commun requirement, plus the
chosen valorisations at three points each for the ones flagged `(*)` and two for the
rest — and the total it should reach (A → 13, B1 → 14, B2/B3/C → 15). The script
recomputes that total per column and flags any that misses, which is how the three
draft inconsistencies in the current issue were found. They are recorded in
[`docs/observations.md`](docs/observations.md) along with everything else that looks
wrong in the source, so the next issue can be diffed against them.

## Linking the criteria to the elements

A criterion is a sentence (*"1 acro sur la poutre P4 (min.)"*) and an element is a
label; nothing in either PDF links the two. That reading is written down in
[`data/criteres.csv`](data/criteres.csv) as **one rule per criterion**, and resolved
against the catalog:

```sh
uv run scripts/resolve_criteres.py data/criteres.csv src/data/catalog.json \
  data/csv/criteres-elements.csv --strict
```

329 rules over 334 lines expand to 4003 criterion-element pairs, so what a human
maintains is eleven times smaller than what the app consumes — and a re-issued
programme is re-resolved rather than re-read element by element. Five controls check
that every printed criterion has a rule and every rule still means something; the
current issue leaves two flags, both documented.

[`docs/criteres.md`](docs/criteres.md) describes the columns, the six ways a criterion
can be counted, and each control.
