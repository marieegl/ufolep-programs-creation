import { catalog, criteresOf, elementById } from "./catalog";
import type { Critere, Evolution } from "./catalog";

/** What the coach has put together: the elements, and the ticks only they can give. */
export type Composition = {
  elements: string[];
  /** Keyed by `${genre} ${texte}` — the criteria the coach has confirmed by hand. */
  coches: Set<string>;
  /** element id → clé of the valorisation the coach pinned it to, when it could serve
  several. Overrides the greedy default; an empty/absent entry falls back to it. */
  affectations?: Map<string, string>;
};

export type Etat = "satisfait" | "insuffisant" | "a-confirmer" | "manuel";

export type Ligne = {
  critere: Critere;
  etat: Etat;
  /** How many of the criterion's elements the composition uses. */
  trouves: number;
  requis: number;
  points: number;
  pointsPossibles: number;
  elementsRetenus: string[];
};

export type Note = {
  exigences: Ligne[];
  valorisations: Ligne[];
  pointsExigences: number;
  pointsValorisations: number;
  /** Non-null only for Saut, where the start score is the value of the vault itself. */
  valeurDuSaut: number | null;
  total: number;
};

export const cleDe = (critere: Critere) => `${critere.genre} ${critere.texte}`;

const compte = (critere: Critere, composition: Composition) => {
  const retenus = composition.elements.filter((id) => critere.elements.includes(id));
  switch (critere.type) {
    case "familles": {
      const familles = new Set(retenus.map((id) => elementById.get(id)?.famille ?? ""));
      return { trouves: familles.size, retenus };
    }
    case "arches": {
      const arches = new Set(
        composition.elements
          .map((id) => elementById.get(id))
          .filter((e) => e && !exclue(critere, e.archeNom))
          .map((e) => e!.arche),
      );
      return { trouves: arches.size, retenus: composition.elements };
    }
    case "total":
      return { trouves: composition.elements.length, retenus: composition.elements };
    default:
      return { trouves: retenus.length, retenus };
  }
};

const exclue = (critere: Critere, archeNom: string) =>
  critere.exclureArche !== null &&
  new RegExp(critere.exclureArche, "i").test(
    archeNom.normalize("NFKD").replace(/[^0-9A-Za-z]+/g, " "),
  );

const etatDe = (critere: Critere, trouves: number, coche: boolean): Etat => {
  if (critere.type === "manuel") return coche ? "satisfait" : "manuel";
  const atteint =
    critere.type === "max"
      ? trouves <= critere.nombreMin
      : trouves >= critere.nombreMin && (critere.nombreMax === null || trouves <= critere.nombreMax);
  if (!atteint) return "insuffisant";
  return critere.confirmation && !coche ? "a-confirmer" : "satisfait";
};

const ligne = (critere: Critere, points: number, composition: Composition): Ligne => {
  const { trouves, retenus } = compte(critere, composition);
  const etat = etatDe(critere, trouves, composition.coches.has(cleDe(critere)));
  return {
    critere,
    etat,
    trouves,
    requis: critere.nombreMin,
    points: etat === "satisfait" ? points : 0,
    pointsPossibles: points,
    elementsRetenus: retenus,
  };
};

/** For a `familles` criterion the count is distinct families, not elements; for the rest
it is the elements themselves. Returns the count and one element per unit (one per family,
or each element), in the given order. */
const mesurer = (critere: Critere, ids: string[]) => {
  if (critere.type === "familles") {
    const parFamille = new Map<string, string>();
    for (const id of ids) {
      const famille = elementById.get(id)?.famille ?? "";
      if (!parFamille.has(famille)) parFamille.set(famille, id);
    }
    return { trouves: parFamille.size, unites: [...parFamille.values()] };
  }
  return { trouves: ids.length, unites: ids };
};

/** Which valorisations the composition satisfies. Every selected element is attributed to
*exactly one* exclusive valorisation — so its count and its credit both land in a single
place, never two. A liaison valorisation (LA/LAE/LG/LM/PG) is exempt and scored
independently: an element inside a liaison may still count elsewhere, and liaisons take no
element from the pool.

The default attribution is greedy: best-paying valorisations first (then most-demanding,
then narrowest pool), each claiming just enough distinct elements to reach its minimum —
but only when it can actually reach it, so a shared element is not wasted on a valorisation
that would stay unsatisfied. Elements left over are then soaked into the best-paying
valorisation they're eligible for, so the count reflects everything the coach picked. A
coach can override the default by pinning an element to a valorisation it's eligible for.
This is greedy, not a global optimum, but it never attributes one element twice. */
const evaluerValorisations = (
  valorisations: { critere: Critere; points: number }[],
  composition: Composition,
): Ligne[] => {
  const exclusif = (c: Critere) => !c.liaison && (c.type === "elements" || c.type === "familles");
  const ordre = valorisations
    .filter((v) => exclusif(v.critere))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.critere.nombreMin - a.critere.nombreMin ||
        a.critere.elements.length - b.critere.elements.length,
    );

  // Distinct ids, in the coach's order — an element attributed here cannot land elsewhere.
  const elements = [...new Set(composition.elements)];
  const attribue = new Map<string, string>(); // element id → clé of its valorisation
  const libres = (critere: Critere) =>
    elements.filter((id) => critere.elements.includes(id) && !attribue.has(id));

  // 1. Honour the coach's pins first (ignored if the element isn't eligible, or the target
  //    isn't an exclusive valorisation of this évolution).
  for (const [id, clef] of composition.affectations ?? new Map<string, string>()) {
    if (!clef || !elements.includes(id)) continue;
    const cible = ordre.find((v) => cleDe(v.critere) === clef);
    if (cible && cible.critere.elements.includes(id)) attribue.set(id, clef);
  }

  // 2. Satisfy pass: each valorisation, best-paying first, claims just enough distinct
  //    units to reach its minimum — but only if it actually can, so an element isn't wasted
  //    on a valorisation that would stay short while another it could complete goes without.
  for (const { critere } of ordre) {
    const clef = cleDe(critere);
    const deja = elements.filter((id) => attribue.get(id) === clef);
    const { trouves: potentiel, unites } = mesurer(critere, [...deja, ...libres(critere)]);
    if (potentiel < critere.nombreMin) continue;
    let aPrendre = critere.nombreMin - mesurer(critere, deja).trouves;
    for (const id of unites) {
      if (aPrendre <= 0) break;
      if (!attribue.has(id)) {
        attribue.set(id, clef);
        aPrendre--;
      }
    }
  }

  // 3. Soak pass: every remaining eligible element joins the best-paying valorisation it
  //    fits, so the count shows all the coach picked (and may complete a late minimum).
  for (const { critere } of ordre) {
    const clef = cleDe(critere);
    for (const id of libres(critere)) attribue.set(id, clef);
  }

  const credite = new Map<string, Ligne>();
  for (const { critere, points } of ordre) {
    const clef = cleDe(critere);
    const retenus = elements.filter((id) => attribue.get(id) === clef);
    const { trouves } = mesurer(critere, retenus);
    const etat = etatDe(critere, trouves, composition.coches.has(clef));
    credite.set(clef, {
      critere,
      etat,
      trouves,
      requis: critere.nombreMin,
      points: etat === "satisfait" ? points : 0,
      pointsPossibles: points,
      elementsRetenus: retenus,
    });
  }

  // Keep the décomposition's order; liaisons and non-selecting valorisations stay independent.
  return valorisations.map(
    ({ critere, points }) => credite.get(cleDe(critere)) ?? ligne(critere, points, composition),
  );
};

/** The value of the vault that counts — an integer per palier, not a tenth.

Saut scores unlike every other apparatus: no Tronc Commun, and the start score is the
value of the vault itself. Its valorisations are added to the *final* note, after
execution, so they are reported but not summed here. */
const valeurDuSaut = (composition: Composition) => {
  const valeurs = composition.elements
    .map((id) => elementById.get(id))
    .map((e) => (e ? catalog.valeursSaut[e.palier] : 0));
  return valeurs.length === 0 ? 0 : Math.max(...valeurs);
};

export const noter = (evolution: Evolution, composition: Composition): Note => {
  const { exigences, valorisations } = criteresOf(evolution);
  const lignesExigences = exigences.map(({ critere, points }) => ligne(critere, points, composition));
  const lignesValorisations = evaluerValorisations(valorisations, composition);

  const pointsExigences = lignesExigences.reduce((sum, l) => sum + l.points, 0);

  // 'CHOISIR n PARMIS LES m': when more valorisations are met than the évolution
  // takes, the best-paying ones count.
  const gagnees = lignesValorisations
    .filter((l) => l.points > 0)
    .map((l) => l.points)
    .sort((a, b) => b - a);
  const retenues = evolution.valorisationsAChoisir ?? gagnees.length;
  const pointsValorisations = gagnees.slice(0, retenues).reduce((sum, p) => sum + p, 0);

  const saut = evolution.agres === "Saut" ? valeurDuSaut(composition) : null;
  return {
    exigences: lignesExigences,
    valorisations: lignesValorisations,
    pointsExigences,
    pointsValorisations,
    valeurDuSaut: saut,
    total: saut ?? pointsExigences + pointsValorisations,
  };
};

/** The start score of a routine that satisfies everything the évolution asks for.

This is the ceiling shown next to the running total, and what the tests check against
the notes published on page 1 of the décomposition. It is computed from the criteria
rather than from a composition on purpose: a routine that satisfies every criterion at
once is a constraint-satisfaction problem — the element count is bounded, the arch
count is a floor and a `max` criterion caps a palier — and the ceiling does not depend
on solving it. */
export const noteMaximale = (evolution: Evolution): number => {
  const { exigences, valorisations } = criteresOf(evolution);
  if (evolution.agres === "Saut") {
    return Math.max(...evolution.paliersAutorises.map((p) => catalog.valeursSaut[p]));
  }
  const gains = valorisations.map((v) => v.points).sort((a, b) => b - a);
  const retenues = evolution.valorisationsAChoisir ?? gains.length;
  return exigences.length + gains.slice(0, retenues).reduce((sum, p) => sum + p, 0);
};
