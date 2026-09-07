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

export type Catalog = {
  edition: string;
  paliers: Palier[];
  valeursSaut: Record<Palier, number>;
  agres: Agres[];
  elements: Element[];
  evolutions: Evolution[];
};

export const catalog = data as Catalog;

export const elementsOf = (agres: string) => catalog.elements.filter((e) => e.agres === agres);

export const evolutionsOf = (agres: string) => catalog.evolutions.filter((e) => e.agres === agres);
