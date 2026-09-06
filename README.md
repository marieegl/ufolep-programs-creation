# UFOLEP NPT — start-score calculator

Tooling to turn the UFOLEP *Nouveau Programme Technique* (gymnastics) PDFs into a
structured catalog, and eventually a static web app that composes a routine and
computes its start score.

Source PDFs: <https://ufolepgym.com/index.php/npt/> — the program is still a draft
(every page carries an "EN COURS DE VALIDATION" watermark), so extraction is
re-runnable rather than hand-transcribed.

## Layout

| Path | Contents |
| --- | --- |
| `data/pdf/` | The published PDFs, renamed to stable filenames |
| `data/csv/` | Extracted catalog, one file per apparatus |
| `scripts/` | Extraction and verification scripts |

## Extracting an apparatus

Scripts use [PEP 723](https://peps.python.org/pep-0723/) inline dependencies, so
`uv` installs what they need on the fly:

```sh
uv run scripts/extract_arches.py data/pdf/arches-sol.pdf data/csv/elements-sol.csv
```

To eyeball the result, `overlay_check.py` re-renders each page with the extracted
palier stamped on every element and the ring boundaries drawn:

```sh
cd scripts && uv run overlay_check.py ../data/pdf/arches-sol.pdf ../data/csv/elements-sol.csv ../build/pages
```

## How the "arches" PDFs are read

Each page is a half-arch rather than a table:

- **concentric rings are paliers** — an element's rating is its distance from the
  arch centre, not its column. Rings are labelled P2…P7; the unlabelled white disc
  inside the innermost ring is P1.
- **left and right halves are families** (e.g. *En avant* / *En arrière*). Pages whose
  arch has no subdivision simply carry no caption.
- **a grey strip below the arch** holds PRÉ-REQUIS on the left and NOMADE on the right.

Geometry is calibrated per page from the yellow ring artwork and the printed palier
labels, so a re-issued PDF recalibrates itself instead of breaking on shifted
coordinates.
