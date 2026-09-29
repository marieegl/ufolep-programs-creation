/** The glossary from the programme's généralités, grouped so the terms that go
together are read together. Static reference text, not extracted from the PDFs — it
explains the vocabulary the décomposition scores by (LA, LM, PG…). */

export type Entree = {
  terme: string;
  /** The short gloss printed next to the term. */
  definition: string;
  /** A longer clarification, shown under the gloss when the term needs one. */
  precision?: string;
};

export type GroupeLexique = {
  titre: string;
  entrees: Entree[];
};

export const lexique: GroupeLexique[] = [
  {
    titre: "Structure du programme",
    entrees: [
      { terme: "Tronc commun", definition: "Base commune de chaque niveau." },
      { terme: "Arche", definition: "Classification technique des éléments." },
      {
        terme: "Palier",
        definition: "Le niveau de classification technique des éléments sur chaque arche.",
      },
      {
        terme: "Pré-requis",
        definition: "Base technique initiale à l’évolution de l’arche.",
      },
      {
        terme: "Nomades",
        definition: "Éléments non évolutifs (éléments isolés).",
      },
      {
        terme: "Valorisation",
        definition: "Orientation technique de l’évolution gymnique et acrobatique.",
        precision: "Deux niveaux de valorisation : principales (*) et secondaires.",
      },
    ],
  },
  {
    titre: "Liaisons et passages",
    entrees: [
      {
        terme: "LA — Liaison Acrobatique",
        definition:
          "Enchaînement de plusieurs éléments acrobatiques liés directement, sans pas intermédiaires et sans sursauts.",
      },
      {
        terme: "LAE — Liaison Acrobatique avec Envol",
        definition:
          "Enchaînement de plusieurs éléments acrobatiques avec envol liés directement, sans pas intermédiaires et sans sursauts.",
        precision: "Les saltos doivent être appel 2 pieds.",
      },
      {
        terme: "LG — Liaison Gymnique",
        definition:
          "Enchaînement de 2 éléments gymniques différents minimum (pivot et saut uniquement).",
        precision: "Les 2 éléments doivent être dans les paliers valorisables.",
      },
      {
        terme: "LM — Liaison Mixte",
        definition:
          "Enchaînement d’un élément gymnique (pivot et saut uniquement) et d’un élément acrobatique, ou inversement, en poutre.",
        precision: "Les 2 éléments doivent être dans les paliers valorisables.",
      },
      {
        terme: "PG — Passage Gymnique",
        definition:
          "Enchaînement de 2 sauts minimum différents liés directement ou indirectement avec des pas courus, petits sauts, pas chassés, tour chorégraphique, etc.",
        precision: "Sans passage au sol ni passage chorégraphique statique entre les sauts.",
      },
    ],
  },
  {
    titre: "Éléments",
    entrees: [
      {
        terme: "Éléments gymniques",
        definition: "Sauts, pivots et maintiens.",
        precision: "Le maintien n’entre pas dans les séries LM et LG.",
      },
      {
        terme: "Élément +",
        definition:
          "Élément acrobatique enchaîné directement d’un autre élément acrobatique au sol, ou gymnique pour les LM en poutre.",
      },
    ],
  },
  {
    titre: "Spécifique GAM",
    entrees: [
      {
        terme: "Cheval d’arçons — contre-élan",
        definition: "Utilisation de la même jambe à la suite lors de l’enchaînement.",
      },
      {
        terme: "Lâcher",
        definition:
          "Élément avec envol et saisie de la barre à mains simultanées ou alternatives.",
        precision:
          "Entrée poisson, retrait Chouchounova, retrait, contre-mouvement, Chapochnikova et salto Pak, Gienger, Jaeger, Voronine.",
      },
      {
        terme: "Changement de barre",
        definition: "Passage d’une barre à l’autre entre 2 éléments des paliers autorisés.",
      },
      {
        terme: "Élan à vide — reprise d’élan",
        definition:
          "Élan des jambes à l’appui facial qui n’est pas nécessaire à l’élément suivant.",
      },
      {
        terme: "Élan à vide — balancé intermédiaire",
        definition:
          "Balancé répété à la suite, non nécessaire à l’élément suivant, sauf si la valorisation le demande.",
        precision: "Une seule pénalité d’élan à vide est comptée pour un balancé avant-arrière.",
      },
    ],
  },
];
