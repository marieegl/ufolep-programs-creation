import { describe, expect, it } from "vitest";
import { catalog, criteresOf, elementById, elementsOf, evolutionsOf } from "./catalog";
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

describe("éléments nomades", () => {
  const nomades = new Set(
    catalog.elements.filter((e) => e.palier === "NOMADE").map((e) => e.id),
  );

  it("n'entrent dans aucune liste d'éléments de valorisation", () => {
    const fautifs = catalog.criteres
      .filter((c) => c.genre === "valorisation")
      .flatMap((c) => c.elements.filter((id) => nomades.has(id)).map((id) => `${c.texte} ← ${id}`));
    expect(fautifs).toEqual([]);
  });

  it("comptent toujours comme des éléments dans des exigences", () => {
    const retenus = catalog.criteres
      .filter((c) => c.genre === "exigence")
      .flatMap((c) => c.elements.filter((id) => nomades.has(id)));
    expect(retenus.length).toBeGreaterThan(0);
  });

  it("un nomade sélectionné ne crédite aucune valorisation", () => {
    // Poutre B3 : une entrée nomade (arche ENTRÉES) ne doit valoriser nulle part.
    const evo = evolution("Poutre", "B3");
    const nomade = elementsOf("Poutre").find(
      (e) => e.palier === "NOMADE" && e.archeNom.toUpperCase().startsWith("ENTR"),
    )!;
    expect(nomade).toBeTruthy();
    const note = noter(evo, { elements: [nomade.id], coches: new Set() });
    expect(note.valorisations.every((l) => !l.elementsRetenus.includes(nomade.id))).toBe(true);
    expect(note.pointsValorisations).toBe(0);
  });
});

describe("éléments « sans envol »", () => {
  // Une LAE (liaison acro avec envol) et toute valorisation « avec envol » exigent un
  // envol ; un acro « sans envol » (tic-tac, souplesse, roue sans envol) n'y a pas sa
  // place, même si son palier suffit. L'envol n'étant pas marqué au catalogue, on
  // s'appuie sur le libellé.
  const exigeEnvol = (texte: string) => texte.includes("LAE") || /avec envol/i.test(texte);
  const sansEnvol = (id: string) => /sans envol/i.test(elementById.get(id)?.libelle ?? "");

  it("n'entrent dans aucune valorisation exigeant un envol", () => {
    const fautifs = catalog.criteres
      .filter((c) => c.genre === "valorisation" && exigeEnvol(c.texte))
      .flatMap((c) => c.elements.filter(sansEnvol).map((id) => `${c.agres} · ${c.texte} ← ${id}`));
    expect(fautifs).toEqual([]);
  });

  it("le tic-tac (152) reste un acro mais ne compte dans aucune LAE au Sol", () => {
    const tictac = elementsOf("Sol").find(
      (e) => e.numero === "152" && /tic-tac/i.test(e.libelle),
    )!;
    expect(tictac).toBeTruthy();
    const dansEnvol = catalog.criteres.filter(
      (c) => c.agres === "Sol" && exigeEnvol(c.texte) && c.elements.includes(tictac.id),
    );
    expect(dansEnvol).toEqual([]);
    // Il reste un acro : présent dans un critère « 2 acros » (exigence et/ou valorisation).
    const commeAcro = catalog.criteres.filter(
      (c) => c.agres === "Sol" && /2 acros/i.test(c.texte) && c.elements.includes(tictac.id),
    );
    expect(commeAcro.length).toBeGreaterThan(0);
  });
});

describe("sauts écart", () => {
  // « Saut écart » ne se limite pas aux libellés contenant « écart » : les antéro-
  // postérieurs, sissonnes, biches et enjambés en sont aussi. Le motif a été élargi
  // (`ecart|enjambe|antero|sissonne|biche`). La version « écart antéro » exclut en
  // revanche le carpé écarté (latéral).
  const numeros = (agres: string, texte: string) =>
    new Set(
      (catalog.criteres.find((c) => c.agres === agres && c.texte === texte)?.elements ?? []).map(
        (id) => elementById.get(id)?.numero,
      ),
    );

  it("au Sol, « SAUT écart » attrape antéro / sissonne / biche / enjambé", () => {
    const p3 = numeros("Sol", "1 FORCE ou 1 SAUT écart P3 (min.)");
    for (const n of ["37", "41", "49", "60", "69"]) expect(p3.has(n)).toBe(true);
    // Palier exact : le P3 (37) tombe sous le seuil P4 de la règle P4.
    const p4 = numeros("Sol", "1 FORCE ou 1 SAUT écart P4 (min.)");
    expect(p4.has("37")).toBe(false);
    for (const n of ["41", "49", "60", "69"]) expect(p4.has(n)).toBe(true);
  });

  it("en Poutre, « écart antéro » inclut sissonne/biche mais exclut le carpé écarté", () => {
    const antero = numeros("Poutre", "1 saut avec écart antéro");
    expect(antero.has("55")).toBe(true); // sissonne
    expect(antero.has("27")).toBe(true); // biche
    expect(antero.has("66")).toBe(false); // carpé écarté (latéral)
  });

  it("en Poutre, « saut écart avec rotation » garde le carpé écarté", () => {
    const generique = numeros("Poutre", "1 saut écart avec 1 rotation à 180°");
    for (const n of ["49", "55", "27", "66"]) expect(generique.has(n)).toBe(true);
  });
});

describe("sorties Barre fixe", () => {
  // Les saltos de sortie de la Barre fixe (doubles saltos, saltos tendus…) ne disent
  // pas « sortie » dans leur libellé : ils sont tagués à la main dans data/sorties.csv,
  // et les critères « sortie » sélectionnent par tag (comme la Poutre), pas par motif.
  const ATTENDUS = ["139", "141", "142", "145", "146", "148", "149", "152", "154", "155", "159", "160"];

  it("sont marqués comme sortie dans le catalogue", () => {
    const nonMarques = ATTENDUS.filter(
      (n) => !elementsOf("Barre fixe").some((e) => e.numero === n && e.sortie),
    );
    expect(nonMarques).toEqual([]);
  });

  it("comptent toutes pour l'exigence « 1 sortie »", () => {
    const sortie = catalog.criteres.find((c) => c.agres === "Barre fixe" && c.texte === "1 sortie")!;
    const nums = new Set(sortie.elements.map((id) => elementById.get(id)?.numero));
    for (const n of ATTENDUS) expect(nums.has(n)).toBe(true);
  });

  it("alimentent « 1 sortie P6 (min.) », qui n'est plus vide", () => {
    const p6 = catalog.criteres.find((c) => c.agres === "Barre fixe" && c.texte === "1 sortie P6 (min.)")!;
    expect(p6.elements.length).toBeGreaterThan(0);
  });
});

describe("paliers valorisables", () => {
  // Une évolution autorise plus de paliers qu'elle n'en récompense : au Sol A1, les
  // paliers autorisés vont de PRÉ-REQUIS à P3, mais seuls P1 et P2 sont valorisables.
  // Un P3 compte donc dans le tronc commun sans rien rapporter en valorisation.
  const solA1 = () => evolution("Sol", "A1");

  const valorisation = (evo: Evolution, texte: string) =>
    criteresOf(evo).valorisations.find((v) => v.critere.texte === texte)!.critere;

  it("retirent d'une valorisation les éléments hors de la bande", () => {
    const saut = valorisation(solA1(), "1 saut");
    const paliers = new Set(saut.elements.map((id) => elementById.get(id)!.palier));
    expect([...paliers].sort()).toEqual(["P1", "P2"]);
  });

  it("laissent ces mêmes éléments compter pour le tronc commun", () => {
    const evo = solA1();
    const brut = catalog.criteres.find((c) => c.agres === "Sol" && c.texte === "1 saut")!;
    const p3 = brut.elements.find((id) => elementById.get(id)!.palier === "P3")!;
    const note = noter(evo, { elements: [p3], coches: new Set() });
    expect(note.valorisations.find((l) => l.critere.texte === "1 saut")!.trouves).toBe(0);
    // Au Sol A1 le tronc commun se compte sur l'enchaînement lui-même : le P3 y entre.
    expect(note.exigences.find((l) => l.critere.texte === "6 à 8 éléments")!.trouves).toBe(1);
    expect(note.exigences.find((l) => l.critere.texte === "4 arches")!.trouves).toBe(1);
  });

  it("ne touchent pas à une valorisation qui nomme son propre palier", () => {
    // Barre fixe A1 récompense « les 2 courbes PR » alors que PRÉ-REQUIS est hors
    // de sa bande valorisable : la règle nomme son palier, elle fait autorité.
    const courbes = valorisation(evolution("Barre fixe", "A1"), "Réaliser les 2 courbes PR");
    expect(courbes.elements.length).toBe(2);
    expect(courbes.elements.every((id) => elementById.get(id)!.palier === "PRÉ-REQUIS")).toBe(true);
  });

  it("ne rendent aucune valorisation imprenable", () => {
    for (const evo of catalog.evolutions) {
      if (evo.agres === "Arçons") continue; // agrès sans éléments dans l'édition SEPT. 26
      for (const { critere } of criteresOf(evo).valorisations) {
        if (critere.type !== "elements" && critere.type !== "familles") continue;
        const brut = catalog.criteres.find(
          (c) => c.agres === critere.agres && c.genre === "valorisation" && c.texte === critere.texte,
        )!;
        if (brut.elements.length < critere.nombreMin) continue; // déjà courte dans les données
        expect(
          critere.elements.length,
          `${evo.agres} ${evo.evolution} · ${critere.texte}`,
        ).toBeGreaterThanOrEqual(critere.nombreMin);
      }
    }
  });
});
