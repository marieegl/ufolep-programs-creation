import { describe, expect, it } from "vitest";
import { enregistrer, parser, supprimer, trier } from "./mouvements";
import type { Mouvement } from "./mouvements";

const base = {
  nom: "Compèt mars",
  agres: "Sol",
  evolution: "A1",
  elements: ["e1", "e2"],
  coches: [],
  affectations: [] as [string, string][],
  total: 8,
  plafond: 10,
};

describe("mouvements enregistrés", () => {
  it("lit une liste vide quand le stockage est vide ou corrompu", () => {
    expect(parser(null)).toEqual([]);
    expect(parser("pas du json")).toEqual([]);
    expect(parser('{"nom":"x"}')).toEqual([]); // un objet, pas une liste
  });

  it("écarte les entrées malformées sans perdre les bonnes", () => {
    const texte = JSON.stringify([
      { id: "1", nom: "ok", agres: "Sol", evolution: "A1", elements: ["e1"] },
      { id: "2", nom: "sans agrès", evolution: "A1", elements: [] },
      { id: "3", nom: "éléments non textuels", agres: "Sol", evolution: "A1", elements: [1] },
    ]);
    const liste = parser(texte);
    expect(liste.map((m) => m.id)).toEqual(["1"]);
    // Les champs absents prennent une valeur sûre plutôt que `undefined`.
    expect(liste[0].coches).toEqual([]);
    expect(liste[0].total).toBe(0);
  });

  it("remplace l’entrée de même nom sur la même évolution au lieu d’empiler", () => {
    const premier = enregistrer([], base);
    const second = enregistrer(premier.liste, { ...base, total: 9 });
    expect(second.liste).toHaveLength(1);
    expect(second.liste[0].total).toBe(9);
    expect(second.liste[0].id).toBe(premier.enregistre.id);
  });

  it("crée une entrée distincte pour la même nom sur une autre évolution", () => {
    const premier = enregistrer([], base);
    const second = enregistrer(premier.liste, { ...base, evolution: "A2" });
    expect(second.liste).toHaveLength(2);
  });

  it("met à jour par id même si le nom a changé", () => {
    const premier = enregistrer([], base);
    const second = enregistrer(premier.liste, {
      ...base,
      id: premier.enregistre.id,
      nom: "Compèt avril",
    });
    expect(second.liste).toHaveLength(1);
    expect(second.liste[0].nom).toBe("Compèt avril");
  });

  it("trie du plus récent au plus ancien et supprime par id", () => {
    const liste: Mouvement[] = [
      { ...base, id: "a", nom: "a", date: "2026-01-01T00:00:00.000Z" },
      { ...base, id: "b", nom: "b", date: "2026-03-01T00:00:00.000Z" },
    ];
    expect(trier(liste).map((m) => m.id)).toEqual(["b", "a"]);
    expect(supprimer(liste, "a").map((m) => m.id)).toEqual(["b"]);
  });
});
