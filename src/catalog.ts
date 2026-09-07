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
  nombreMin: number;
  nombreMax: number | null;
  /** The selected elements are a necessary condition only — the coach still ticks it. */
  confirmation: boolean;
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
      return critere ? [{ critere, points: v.points }] : [];
    }),
  };
};
