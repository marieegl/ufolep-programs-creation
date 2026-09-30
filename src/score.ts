import { catalog, criteresOf, elementById } from "./catalog";
import type { Critere, Evolution } from "./catalog";

/** What the coach has put together: the elements, and the ticks only they can give. */
export type Composition = {
  elements: string[];
  /** Keyed by `${genre} ${texte}` — the criteria the coach has confirmed by hand. */
  coches: Set<string>;
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

/** Which valorisations the composition satisfies, crediting each selected element to at
most one *exclusive* valorisation. A liaison valorisation (LA/LAE/LG/LM/PG) is exempt: an
element used inside a liaison may still count for another valorisation, so liaisons are
scored independently and consume nothing. The exclusive ones are served best-paying first
(then most-demanding, then narrowest pool), so a shared element lands where it is worth
most. This is greedy, not a global optimum, but it never credits one element twice. */
const evaluerValorisations = (
  valorisations: { critere: Critere; points: number }[],
  composition: Composition,
): Ligne[] => {
  const consommes = new Set<string>();
  const exclusif = (c: Critere) => !c.liaison && (c.type === "elements" || c.type === "familles");
  const ordre = valorisations
    .filter((v) => exclusif(v.critere))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.critere.nombreMin - a.critere.nombreMin ||
        a.critere.elements.length - b.critere.elements.length,
    );

  const credite = new Map<string, Ligne>();
  for (const { critere, points } of ordre) {
    const clef = cleDe(critere);
    const dispo = composition.elements.filter(
      (id) => critere.elements.includes(id) && !consommes.has(id),
    );
    let trouves: number;
    let retenus: string[];
    if (critere.type === "familles") {
      const parFamille = new Map<string, string>();
      for (const id of dispo) {
        const famille = elementById.get(id)?.famille ?? "";
        if (!parFamille.has(famille)) parFamille.set(famille, id);
      }
      trouves = parFamille.size;
      retenus = trouves >= critere.nombreMin ? [...parFamille.values()].slice(0, critere.nombreMin) : [];
    } else {
      trouves = dispo.length;
      retenus = trouves >= critere.nombreMin ? dispo.slice(0, critere.nombreMin) : [];
    }
    retenus.forEach((id) => consommes.add(id));
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
