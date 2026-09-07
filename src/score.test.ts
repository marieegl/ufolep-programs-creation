import { describe, expect, it } from "vitest";
import { catalog, criteresOf, elementsOf, evolutionsOf } from "./catalog";
import type { Evolution } from "./catalog";
import { cleDe, noteMaximale, noter } from "./score";
import type { Composition } from "./score";

const vide = (): Composition => ({ elements: [], coches: new Set() });

const evolution = (agres: string, nom: string): Evolution => {
  const found = evolutionsOf(agres).find((e) => e.evolution === nom);
  if (!found) throw new Error(`${agres} ${nom} absente du catalogue`);
  return found;
};

/** The note each évolution is published with on page 1, by letter. */
const PUBLIEE: Record<string, number> = { A: 13, B1: 14, B2: 15, B3: 15, C: 15 };

/** The décomposition contradicts its own published note in three places; each is
recorded in docs/observations.md and none is corrected in the data, so that a corrected
re-issue shows up here as a failure rather than passing silently. */
const ECARTS_CONNUS = new Set(["Arçons C2", "Barre fixe A1", "Barre fixe B1"]);

const cible = (evolution: Evolution) =>
  PUBLIEE[evolution.evolution] ?? PUBLIEE[evolution.evolution[0]];

describe("noteMaximale", () => {
  const notables = catalog.evolutions.filter((e) => e.agres !== "Saut");

  it.each(notables.filter((e) => !ECARTS_CONNUS.has(`${e.agres} ${e.evolution}`)))(
    "$agres $evolution atteint la note publiée",
    (evolution) => {
      expect(noteMaximale(evolution)).toBe(cible(evolution));
    },
  );

  it.each([...ECARTS_CONNUS])("%s reste sur son écart documenté", (nom) => {
    const trouvee = notables.find((e) => `${e.agres} ${e.evolution}` === nom)!;
    expect(noteMaximale(trouvee)).not.toBe(cible(trouvee));
  });

  it("vaut le meilleur palier autorisé au Saut", () => {
    expect(noteMaximale(evolution("Saut", "A1"))).toBe(12);
    expect(noteMaximale(evolution("Saut", "C3"))).toBe(14);
  });
});

describe("criteresOf", () => {
  it.each(catalog.evolutions)("$agres $evolution résout tous ses critères", (evolution) => {
    const { exigences, valorisations } = criteresOf(evolution);
    expect(exigences).toHaveLength(evolution.exigences.length);
    expect(valorisations).toHaveLength(evolution.valorisations.length);
  });
});

describe("noter", () => {
  it("ne donne rien à un enchaînement vide", () => {
    const note = noter(evolution("Sol", "B1"), vide());
    expect(note.total).toBe(0);
    expect(note.exigences.every((l) => l.etat !== "satisfait")).toBe(true);
  });

  it("satisfait une exigence dès que ses éléments sont là", () => {
    const evo = evolution("Poutre", "B3");
    const critere = criteresOf(evo).exigences.find(
      (c) => c.critere.type === "elements" && !c.critere.confirmation,
    )!.critere;
    const composition = { elements: critere.elements.slice(0, critere.nombreMin), coches: new Set<string>() };
    const ligne = noter(evo, composition).exigences.find((l) => l.critere.texte === critere.texte)!;
    expect(ligne.etat).toBe("satisfait");
    expect(ligne.points).toBe(1);
  });

  it("attend la coche du juge sur un critère à confirmer", () => {
    const evo = evolution("Poutre", "C3");
    const critere = criteresOf(evo).valorisations.find((c) => c.critere.confirmation)!.critere;
    const elements = critere.elements.slice(0, critere.nombreMin);
    const avant = noter(evo, { elements, coches: new Set() });
    const apres = noter(evo, { elements, coches: new Set([cleDe(critere)]) });
    const ligneDe = (note: typeof avant) =>
      note.valorisations.find((l) => l.critere.texte === critere.texte)!;
    expect(ligneDe(avant).etat).toBe("a-confirmer");
    expect(ligneDe(avant).points).toBe(0);
    expect(ligneDe(apres).etat).toBe("satisfait");
    expect(ligneDe(apres).points).toBeGreaterThan(0);
  });

  it("laisse un critère manuel à la main du juge", () => {
    const evo = evolution("Poutre", "B3");
    const critere = criteresOf(evo).valorisations.find((c) => c.critere.type === "manuel")!.critere;
    expect(noter(evo, vide()).valorisations.find((l) => l.critere.texte === critere.texte)!.etat).toBe(
      "manuel",
    );
    const coche = { elements: [], coches: new Set([cleDe(critere)]) };
    expect(noter(evo, coche).valorisations.find((l) => l.critere.texte === critere.texte)!.etat).toBe(
      "satisfait",
    );
  });

  it("plafonne les valorisations à celles que l'évolution retient", () => {
    const evo = evolution("Sol", "C3");
    const { valorisations } = criteresOf(evo);
    const composition: Composition = {
      elements: valorisations.flatMap((v) => v.critere.elements.slice(0, v.critere.nombreMin)),
      coches: new Set(valorisations.map((v) => cleDe(v.critere))),
    };
    const note = noter(evo, composition);
    const gagnees = note.valorisations.filter((l) => l.points > 0);
    expect(gagnees.length).toBeGreaterThan(evo.valorisationsAChoisir!);
    expect(note.pointsValorisations).toBe(noteMaximale(evo) - note.exigences.length);
  });

  it("dépasse le nombre d'éléments qu'un max autorise", () => {
    const critere = catalog.criteres.find((c) => c.type === "max")!;
    const evo = catalog.evolutions.find(
      (e) => e.agres === critere.agres && e.valorisations.some((v) => v.texte === critere.texte),
    )!;
    const trop = { elements: critere.elements.slice(0, critere.nombreMin + 1), coches: new Set<string>() };
    expect(noter(evo, trop).valorisations.find((l) => l.critere.texte === critere.texte)!.etat).toBe(
      "insuffisant",
    );
  });

  it("note le Saut à la valeur du saut choisi", () => {
    const evo = evolution("Saut", "C3");
    const p7 = elementsOf("Saut").find((e) => e.palier === "P7")!;
    const note = noter(evo, { elements: [p7.id], coches: new Set() });
    expect(note.valeurDuSaut).toBe(14);
    expect(note.total).toBe(14);
  });
});
