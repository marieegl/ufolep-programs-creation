/** Saved routines. The app has no server — it is a single HTML file served from GitHub
Pages or double-clicked from disk — so a saved mouvement lives in the browser's
localStorage, under the origin it was saved from. */

export type Mouvement = {
  id: string;
  nom: string;
  agres: string;
  evolution: string;
  elements: string[];
  /** The criteria the coach confirmed by hand (a Set in the live composition). */
  coches: string[];
  /** element id → clé of the valorisation it is pinned to (a Map in the live composition). */
  affectations: [string, string][];
  /** The score when it was saved, so the list reads without recomputing every routine. */
  total: number;
  plafond: number;
  /** ISO timestamp of the last save. */
  date: string;
};

const CLE = "mouvements";

const estTexte = (v: unknown): v is string => typeof v === "string";

/** localStorage holds whatever a previous version — or another tab — wrote, so every
field is checked and anything malformed is dropped rather than crashing the app. */
const valider = (brut: unknown): Mouvement | null => {
  if (!brut || typeof brut !== "object") return null;
  const m = brut as Record<string, unknown>;
  if (!estTexte(m.id) || !estTexte(m.nom) || !estTexte(m.agres) || !estTexte(m.evolution)) {
    return null;
  }
  if (!Array.isArray(m.elements) || !m.elements.every(estTexte)) return null;
  const coches = Array.isArray(m.coches) ? m.coches.filter(estTexte) : [];
  const affectations = Array.isArray(m.affectations)
    ? (m.affectations.filter(
        (p) => Array.isArray(p) && p.length === 2 && p.every(estTexte),
      ) as [string, string][])
    : [];
  return {
    id: m.id,
    nom: m.nom,
    agres: m.agres,
    evolution: m.evolution,
    elements: m.elements,
    coches,
    affectations,
    total: typeof m.total === "number" ? m.total : 0,
    plafond: typeof m.plafond === "number" ? m.plafond : 0,
    date: estTexte(m.date) ? m.date : "",
  };
};

/** Parse the stored list. Exported for the tests; the app goes through `lire`. */
export const parser = (texte: string | null): Mouvement[] => {
  if (!texte) return [];
  try {
    const brut = JSON.parse(texte);
    if (!Array.isArray(brut)) return [];
    return brut.map(valider).filter((m): m is Mouvement => m !== null);
  } catch {
    return []; // Corrupted storage reads as "nothing saved" instead of a blank app.
  }
};

export const lire = (): Mouvement[] => {
  try {
    return parser(localStorage.getItem(CLE));
  } catch {
    return []; // Private mode can block localStorage entirely.
  }
};

export const ecrire = (liste: Mouvement[]): void => {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste));
  } catch {
    // Private mode or a full quota: the routine just isn't remembered.
  }
};

/** Newest first — the coach works on what they saved last. */
export const trier = (liste: Mouvement[]): Mouvement[] =>
  [...liste].sort((a, b) => b.date.localeCompare(a.date));

const identifiant = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `m-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
};

/** Insert or replace. A save replaces the entry with the same id (updating the routine
being worked on) or, failing that, the one with the same name on the same évolution —
saving "Compèt mars" twice overwrites it rather than piling up duplicates. */
export const enregistrer = (
  liste: Mouvement[],
  mouvement: Omit<Mouvement, "id" | "date"> & { id?: string },
): { liste: Mouvement[]; enregistre: Mouvement } => {
  const existant =
    liste.find((m) => m.id === mouvement.id) ??
    liste.find(
      (m) =>
        m.nom.trim().toLowerCase() === mouvement.nom.trim().toLowerCase() &&
        m.agres === mouvement.agres &&
        m.evolution === mouvement.evolution,
    );
  const enregistre: Mouvement = {
    ...mouvement,
    nom: mouvement.nom.trim(),
    id: existant?.id ?? identifiant(),
    date: new Date().toISOString(),
  };
  const suivante = existant
    ? liste.map((m) => (m.id === existant.id ? enregistre : m))
    : [...liste, enregistre];
  return { liste: suivante, enregistre };
};

export const supprimer = (liste: Mouvement[], id: string): Mouvement[] =>
  liste.filter((m) => m.id !== id);
