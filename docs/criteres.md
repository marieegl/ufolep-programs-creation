# Attaching elements to criteria

The décomposition asks for things like *"1 acro sur la poutre P4 (min.)"*. The arches
PDFs list elements. Nothing in either file links the two: the criterion is a sentence,
the element is a label, and the match lives in the reader's head.

`data/criteres.csv` is where that reading is written down — **one rule per criterion**,
never one row per element. `scripts/resolve_criteres.py` applies each rule to the
catalog and emits `data/csv/criteres-elements.csv`, one row per criterion-element pair.
The current issue resolves to **327 rules over 332 lines and 4167 pairs**, so the pairs
file is twelve times the size of the thing a human maintains.

That ratio is the whole point. A re-issued programme is re-resolved in a second; a
hand-associated table would have to be re-read element by element. It also means a
mistake is visible: a rule is one line and says what it looks for, whereas a wrong pair
in a 3819-row table is invisible.

```sh
npm run data     # build catalog · resolve rules · rebuild catalog with the pairs
```

The build runs twice because the two halves need each other: the resolver matches
against built element ids, and the catalog embeds the resolved pairs. Run
`npm run resolve` alone while iterating on a rule — it prints the flags without
touching `src/data/catalog.json`.

## A rule

| Column | Meaning |
| --- | --- |
| `agres` `genre` `texte` | Which criterion. `texte` must match the décomposition **exactly**, minus the `(*)` points flag |
| `type` | How it is counted — see below |
| `nombre` | `2` is a floor, `6-8` a range |
| `confirmation` | `oui` when the elements are a necessary condition only, and a judge still has to tick it |
| `palier` | `P3` means exactly P3, `P3+` means P3 or above, `PR` is PRÉ-REQUIS |
| `arche` `famille` `libelle` | Regexes matched against the element's arch name, family and label |
| `tag` | Requires a boolean element flag rather than matching text — `sortie` selects the elements hand-tagged in [`data/sorties.csv`](../data/sorties.csv) |
| `exclure` | Regex that rejects on family **or** label |
| `exclure_arche` | Regex that rejects on arch name |
| `attendu` | Why a flag on this rule is expected rather than a bug |
| `commentaire` | What the rule had to interpret, for the next reader |

`exclure` and `exclure_arche` are separate because *"hors sortie"* names a family and
*"hors arche champignon"* names an arch, and three men's arches carry *Sorties* in their
own name — one shared exclusion column would empty them out.

**Several rows sharing `agres` + `genre` + `texte` are one rule, and their selections
are unioned.** That is how *"1 FORCE ou 1 saut écart P3 (min.)"* is expressed without an
expression language:

```csv
Sol,valorisation,1 FORCE ou 1 saut écart P3 (min.),elements,1,,P3+,,force,,,,,
Sol,valorisation,1 FORCE ou 1 saut écart P3 (min.),elements,1,,P3+,sauts gymniques,,ecart,,,,
```

### Matching

Motifs are matched case- and accent-insensitively, with punctuation flattened to
spaces — labels and criterion texts come from different pages of different PDFs and
disagree on apostrophes and accents. Punctuation becomes a space *before* accents are
stripped, or `l’appui` would fold to `lappui` and no motif would ever reach it.

The motif itself is only unaccented, never flattened: it is a regex, and flattening
would turn `atr|roue` into the phrase `atr roue`. So alternation (`180|tour`), character
classes (`acro [12]`, which takes ACRO 1 and ACRO 2 while leaving ACCRO POUTRE MOUSSE
out) and anchors (`^roue`, which takes *Roue* but not *Souplesse avant ou roue arabe*)
all work.

NOMADE sits outside the palier ladder, so a `P3+` threshold never reaches it.

### Tags

Some criteria reward something no wording in the catalog identifies. The Poutre
*sorties* are the case: the arches PDF publishes no dismount arch, family or label, so
no motif can find one. The dismounts are instead named by id in
[`data/sorties.csv`](../data/sorties.csv); `build_data.py` turns that list into a
`sortie` flag on each element, and a rule selects them with `tag,sortie`. The flag rides
on the element, so it also shows as a `· sortie` badge in the app.

A tag is not a motif — it is not folded, matched as a regex, or counted against the
too-broad control — so it may sit next to a `palier` threshold: `1 sortie P3 (min.)` is
`tag=sortie` plus `palier=P3+`, which selects the tagged dismounts at P3 and above and
leaves out both the P2 dismounts and the nomade one (a nomade valorises nothing). The
*liaison acro* dismount criteria carry `confirmation,oui` on top, because the tag proves
there is a dismount but not that it is chained into an acro liaison — the judge ticks that.

### The six types

| Type | Counts | Example |
| --- | --- | --- |
| `elements` | matching elements in the routine | `1 acro P2 (min.)` |
| `max` | matching elements, and is met while **at or below** `nombre` | `1 PR max dans tout l’enchaînement` |
| `familles` | the distinct families the matching elements belong to | `2 acros de sens différents` |
| `arches` | the distinct arches of the whole routine, motifs ignored | `4 Arches` |
| `total` | the elements of the whole routine, motifs ignored | `6 à 8 éléments` |
| `manuel` | nothing — the judge ticks it | `1 LA` |

`arches` and `total` look at the routine as a whole, so a motif on them would be
silently ignored and the resolver rejects one. `exclure_arche` still applies, which is
what makes *"3 arches (péda NON)"* count arches minus the pedagogical one.

A `manuel` rule must carry a `commentaire` saying what is not derivable, so that a
deliberate hand-off cannot be confused with a motif nobody got round to writing.

Of the 327 rules, **28 are `manuel`** — 9%. Those are almost all liaisons (a *LA* is a
sequence of elements, not an element). The five Poutre sorties used to be here too —
nothing in the catalog names a dismount — but they are now selected through the `tag`
column against the hand-kept list of dismount ids described above.

## The controls

The resolver's job is not only to resolve but to refuse to look right. Every rule is
checked and the script exits non-zero under `--strict` if anything is unexplained:

1. **Both directions of coverage.** Every criterion printed in the décomposition must
   have a rule (*"critère sans règle"*), and every rule must match a printed criterion
   (*"règle sans critère correspondant"*). This is what catches a typo in `texte`, which
   would otherwise silently produce a criterion with no elements.
2. **Nothing selected.** A rule that matches no element has almost certainly read the
   wrong vocabulary. Two rules are flagged here and both are documented in `attendu`:
   Anneaux and Barre fixe reward `1 sortie P6 (min.)` and neither catalog has a sortie
   above P5.
3. **A palier no évolution can reach.** A rule asking for P6 in an évolution that allows
   P1-P5 read the wrong palier. `max` rules are exempt — naming a palier the évolution
   does *not* reward is the entire point of *"1 PR max"*.
4. **A motif that is too broad.** An `elements` rule that names an arch, family or
   wording and still takes more than half the apparatus has lost its meaning. Rules
   whose only condition is a palier threshold are exempt: *"1 élément P2 (min.)"* really
   does mean any of 78 of the 88 Barre fixe elements.
5. **Fewer families than asked.** A `familles` rule wanting 2 distinct families out of a
   selection that spans one is reading the wrong arch.

Apparatus with no published arches PDF are exempt from control 2 — Arçons has a
décomposition page but no elements, so its 34 element-scoped rules are written against a
catalog that does not exist yet, and will resolve the day the PDF is published.

## Scoring

`src/score.ts` reads the resolved criteria and reports, per criterion, one of four
states: `satisfait`, `insuffisant`, `a-confirmer` (elements are there, the judge has not
ticked) and `manuel`. The décomposition — not `criteres.csv` — stays the authority on
which criteria an évolution asks for and what each valorisation is worth; a rule only
says how to recognise one.

**One element, one valorisation.** A selected element may satisfy several *exigences* of
the Tronc Commun at once, but it is credited to at most **one** valorisation — except a
**liaison** valorisation (LA / LAE / LG / LM / PG), which is exempt: an element used inside
a liaison may still count for another valorisation. The `liaison` flag is computed in
`build_data.py` (uppercase token, minus the "… incorporés dans les LAE" case, which rewards
the elements not the liaison). The engine serves the exclusive valorisations best-paying
first, so a shared element lands where it is worth most — greedy, not a global optimum, but
it never credits one element twice.

`noteMaximale` gives the ceiling: 1 point per exigence, plus the best-paying
valorisations up to the `CHOISIR n PARMIS LES m` cap. `src/score.test.ts` checks it
against the notes published on page 1 (A → 13, B1 → 14, B2/B3/C → 15) for all 48
non-Saut évolutions, and asserts that the three known draft errors still deviate — a
corrected re-issue shows up as a failing test rather than passing silently.

It is computed from the criteria rather than from a composition on purpose: building a
routine that satisfies every criterion at once is a constraint-satisfaction problem —
the element count is bounded, the arch count is a floor, a `max` criterion caps a
palier — and the ceiling does not depend on solving it.

Saut is scored differently and does not go through any of this: no Tronc Commun, and the
start score is the value of the vault itself, an integer per palier. Its valorisations
apply to the *final* note, after execution, so they are reported but not summed.
