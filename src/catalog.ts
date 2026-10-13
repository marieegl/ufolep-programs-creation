import data from "./data/catalog.json";

export type Palier = "PRÉ-REQUIS" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "NOMADE";
export type Discipline = "GAF" | "GAM" | "MIXTE";

export type Agres = {
  id: string;
  nom: string;
  discipline: Discipline;
  nbElements: number;
};

export type Element = {
  id: string;
  agres: string;
  arche: number;
  archeNom: string;
  famille: string | null;
  cote: string | null;
  palier: Palier;
  numero: string;
  nouveau: boolean;
  /** Hand-tagged as a dismount in data/sorties.csv — the arches PDF marks none. */
  sortie: boolean;
  marque: string | null;
  libelle: string;
  controle: string | null;
};

export type Valorisation = {
  texte: string;
  points: number;
};

export type Evolution = {
  id: string;
  agres: string;
  discipline: Discipline;
  evolution: string;
  ordre: number;
  paliersAutorises: Palier[];
  paliersValorisables: Palier[];
  valorisationsAChoisir: number | null;
  noteDeDepart: number | null;
  exigences: string[];
  valorisations: Valorisation[];
  controle: string | null;
};

/** How a criterion is counted; `data/criteres.csv` holds the rule behind each one. */
export type CritereType = "elements" | "max" | "familles" | "arches" | "total" | "manuel";

export type Critere = {
  agres: string;
  genre: "exigence" | "valorisation";
  texte: string;
  type: CritereType;
  /** A liaison valorisation (LA/LAE/LG/LM/PG): exempt from the one-element-one-valorisation rule. */
  liaison: boolean;
  nombreMin: number;
  nombreMax: number | null;
  /** The selected elements are a necessary condition only — the coach still ticks it. */
  confirmation: boolean;
  /** The rule names a palier itself ('1 saut P2 (min.)'), so it — and not the
  évolution's `paliersValorisables` band — decides which paliers it accepts. */
  palierPropre: boolean;
  exclureArche: string | null;
  commentaire: string | null;
  elements: string[];
};

export type Catalog = {
  edition: string;
  paliers: Palier[];
  valeursSaut: Record<Palier, number>;
  agres: Agres[];
  elements: Element[];
  evolutions: Evolution[];
  criteres: Critere[];
};

export const catalog = data as Catalog;

export const elementsOf = (agres: string) => catalog.elements.filter((e) => e.agres === agres);

export const evolutionsOf = (agres: string) => catalog.evolutions.filter((e) => e.agres === agres);

export const elementById = new Map(catalog.elements.map((e) => [e.id, e]));

/** The criteria of one évolution, in the order the décomposition prints them.

The décomposition is the authority on which criteria an évolution asks for and what
each valorisation is worth; `criteres` only says how to recognise one. */
export const criteresOf = (evolution: Evolution) => {
  const byText = new Map(
    catalog.criteres
      .filter((c) => c.agres === evolution.agres)
      .map((c) => [`${c.genre} ${c.texte}`, c]),
  );
  const find = (genre: string, texte: string) => byText.get(`${genre} ${texte}`);
  return {
    exigences: evolution.exigences.flatMap((texte) => {
      const critere = find("exigence", texte);
      return critere ? [{ critere, points: 1 }] : [];
    }),
    valorisations: evolution.valorisations.flatMap((v) => {
      const critere = find("valorisation", v.texte);
      return critere ? [{ critere: valorisable(critere, evolution), points: v.points }] : [];
    }),
  };
};

/** An évolution rewards a *narrower* band of paliers than it allows: Sol A1 allows
PRÉ-REQUIS→P3 but only valorises P1/P2, so a P3 counts towards the tronc commun and is
worth nothing on top, and a PRÉ-REQUIS is below the band. `criteres` is written per
apparatus, so the band is applied here — the same criterion keeps a different pool of
eligible elements in each évolution.

Three kinds are left alone: those that do not select elements (manuel, arches, total)
count the composition itself; a `max` names on purpose a palier the évolution does
*not* reward ('1 PR max dans tout l'enchaînement'); and a criterion that names its own
palier is the authority on what it accepts — Barre fixe A1 rewards 'les 2 courbes PR'
although PRÉ-REQUIS is outside its band. The band only fills the silence. */
const valorisable = (critere: Critere, evolution: Evolution): Critere => {
  const compteLaComposition =
    critere.type === "arches" || critere.type === "total" || critere.type === "manuel";
  if (compteLaComposition || critere.type === "max" || critere.palierPropre) return critere;
  const dans = (paliers: Palier[]) => {
    const bande = new Set<string>(paliers);
    return critere.elements.filter((id) => {
      const palier = elementById.get(id)?.palier;
      return !!palier && bande.has(palier);
    });
  };
  // The band must not make a printed valorisation unwinnable: 'Enchaîner 3 balancés
  // complets en appui' is a named motif, and Barres parallèles A1 only has two of them
  // inside its band. When the band cannot reach the minimum, what the évolution allows
  // takes over — the décomposition prints the valorisation, so it must be reachable.
  const elements = dans(evolution.paliersValorisables);
  const retenus =
    elements.length >= critere.nombreMin ? elements : dans(evolution.paliersAutorises);
  return retenus.length === critere.elements.length ? critere : { ...critere, elements: retenus };
};
