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

  it("ne crédite un élément partagé qu'à une seule valorisation exclusive", () => {
    // Two exclusive valorisations of the same évolution that share an element.
    let trouve:
      | { evo: Evolution; a: string; b: string; element: string }
      | undefined;
    for (const evo of catalog.evolutions) {
      const excl = criteresOf(evo).valorisations
        .map((v) => v.critere)
        .filter((c) => !c.liaison && c.type === "elements" && c.nombreMin === 1);
      for (let i = 0; i < excl.length && !trouve; i++) {
        for (let j = i + 1; j < excl.length && !trouve; j++) {
          const partage = excl[i].elements.find((id) => excl[j].elements.includes(id));
          if (partage) trouve = { evo, a: excl[i].texte, b: excl[j].texte, element: partage };
        }
      }
      if (trouve) break;
    }
    expect(trouve).toBeTruthy();
    const { evo, a, b, element } = trouve!;
    const coches = new Set([`valorisation ${a}`, `valorisation ${b}`]);
    const note = noter(evo, { elements: [element], coches });
    const gagnees = note.valorisations.filter(
      (l) => (l.critere.texte === a || l.critere.texte === b) && l.points > 0,
    );
    expect(gagnees).toHaveLength(1);
  });

  it("ne décompte un élément partagé que dans une seule valorisation", () => {
    // The n°98 case: one element eligible for two exclusive valorisations must appear in a
    // single count, not both.
    let trouve: { evo: Evolution; a: string; b: string; element: string } | undefined;
    for (const evo of catalog.evolutions) {
      const excl = criteresOf(evo).valorisations
        .map((v) => v.critere)
        .filter((c) => !c.liaison && c.type === "elements");
      for (let i = 0; i < excl.length && !trouve; i++) {
        for (let j = i + 1; j < excl.length && !trouve; j++) {
          const partage = excl[i].elements.find((id) => excl[j].elements.includes(id));
          if (partage) trouve = { evo, a: excl[i].texte, b: excl[j].texte, element: partage };
        }
      }
      if (trouve) break;
    }
    const { evo, a, b, element } = trouve!;
    const note = noter(evo, { elements: [element], coches: new Set() });
    const lignes = note.valorisations.filter((l) => l.critere.texte === a || l.critere.texte === b);
    // The single element shows up in exactly one of the two counts.
    expect(lignes.filter((l) => l.trouves > 0)).toHaveLength(1);
  });

  it("épingle un élément partagé à la valorisation choisie par l'entraîneur", () => {
    // Same kind of shared element as above, but now the coach pins it elsewhere. The
    // default credits one valorisation; an affectation must move the credit to the other.
    let trouve: { evo: Evolution; a: string; b: string; element: string } | undefined;
    for (const evo of catalog.evolutions) {
      const excl = criteresOf(evo).valorisations
        .map((v) => v.critere)
        .filter((c) => !c.liaison && c.type === "elements" && c.nombreMin === 1);
      for (let i = 0; i < excl.length && !trouve; i++) {
        for (let j = i + 1; j < excl.length && !trouve; j++) {
          const partage = excl[i].elements.find((id) => excl[j].elements.includes(id));
          if (partage) trouve = { evo, a: excl[i].texte, b: excl[j].texte, element: partage };
        }
      }
      if (trouve) break;
    }
    const { evo, a, b, element } = trouve!;
    const coches = new Set([`valorisation ${a}`, `valorisation ${b}`]);
    const credite = (texte: string, affectations?: Map<string, string>) =>
      noter(evo, { elements: [element], coches, affectations }).valorisations.find(
        (l) => l.critere.texte === texte,
      )!.points > 0;

    // One of the two wins by default; pinning to the loser flips the credit.
    const defautA = credite(a);
    const perdante = defautA ? b : a;
    const clefPerdante = `valorisation ${perdante}`;
    const avecEpingle = new Map([[element, clefPerdante]]);
    expect(credite(perdante, avecEpingle)).toBe(true);
    expect(credite(defautA ? a : b, avecEpingle)).toBe(false);
  });

  it("ignore une épingle vers une valorisation inéligible et garde le défaut", () => {
    const evo = evolution("Barres asymétriques", "B3");
    const excl = criteresOf(evo).valorisations
      .map((v) => v.critere)
      .filter((c) => !c.liaison && c.type === "elements" && c.nombreMin === 1);
    const cible = excl.find((c) => c.elements.length > 0)!;
    const element = cible.elements[0];
    const autre = excl.find((c) => !c.elements.includes(element));
    const coches = new Set([cleDe(cible)]);
    const bidon = new Map([[element, autre ? cleDe(autre) : "valorisation inexistante"]]);
    // The element isn't eligible for the pinned valorisation, so the pin is dropped and
    // the default credit stands.
    const note = noter(evo, { elements: [element], coches, affectations: bidon });
    expect(note.valorisations.find((l) => l.critere.texte === cible.texte)!.points).toBeGreaterThan(0);
  });

  it("laisse un élément de liaison compter aussi pour une valorisation exclusive", () => {
    let trouve:
      | { evo: Evolution; liaison: string; exclusive: string; element: string }
      | undefined;
    for (const evo of catalog.evolutions) {
      const crits = criteresOf(evo).valorisations.map((v) => v.critere);
      const liaisons = crits.filter((c) => c.liaison && c.type === "elements" && c.nombreMin === 1);
      const exclusives = crits.filter((c) => !c.liaison && c.type === "elements" && c.nombreMin === 1);
      for (const l of liaisons) {
        for (const x of exclusives) {
          const partage = l.elements.find((id) => x.elements.includes(id));
          if (partage) {
            trouve = { evo, liaison: l.texte, exclusive: x.texte, element: partage };
            break;
          }
        }
        if (trouve) break;
      }
      if (trouve) break;
    }
    expect(trouve).toBeTruthy();
    const { evo, liaison, exclusive, element } = trouve!;
    const coches = new Set([`valorisation ${liaison}`, `valorisation ${exclusive}`]);
    const note = noter(evo, { elements: [element], coches });
    const ligneLiaison = note.valorisations.find((l) => l.critere.texte === liaison)!;
    const ligneExclusive = note.valorisations.find((l) => l.critere.texte === exclusive)!;
    // The single shared element credits the liaison and the exclusive valorisation both.
    expect(ligneLiaison.points).toBeGreaterThan(0);
    expect(ligneExclusive.points).toBeGreaterThan(0);
  });

  it("note le Saut à la valeur du saut choisi", () => {
    const evo = evolution("Saut", "C3");
    const p7 = elementsOf("Saut").find((e) => e.palier === "P7")!;
    const note = noter(evo, { elements: [p7.id], coches: new Set() });
    expect(note.valeurDuSaut).toBe(14);
    expect(note.total).toBe(14);
  });
});
