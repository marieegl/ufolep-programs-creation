# Composer un mouvement et compter les points

Ce document est la **référence** pour construire un enchaînement et calculer sa **note de
départ** — en particulier pour répondre à « fais-moi un mouvement à note maximale pour tel
agrès / tel niveau » et pour raisonner sur un remplacement (« mets un saut à la place de
cet acro »).

Les **données concrètes** (quels éléments existent, ce qu'ils valident) vivent dans
[`../src/data/catalog.json`](../src/data/catalog.json) ; ce fichier-ci décrit les **règles**.
C'est le même moteur que l'app (`src/score.ts`), donc une note calculée à la main avec ces
règles doit correspondre à celle de l'application.

## 1. Ce que contient une évolution

Chaque agrès a 8 évolutions (A1, A2, B1, B2, B3, C1, C2, C3). Pour chacune, la
décomposition fixe :

- **Tronc commun (TC)** : une liste d'**exigences** (ex. « 4 arches », « 8 à 10 éléments »,
  « 1 pivot P4 (min.) »). Chaque exigence vaut **1 point**.
- **Valorisations** : une liste d'orientations techniques, chacune **principale `(*)` = 3
  points** ou **secondaire = 2 points**.
- **`CHOISIR n PARMI LES m`** : à partir de B1, seules les **n = 4** valorisations les
  mieux payantes comptent (A1/A2 : pas de plafond, toutes comptent).
- **Paliers autorisés** : les seuls paliers dont on peut prendre des éléments.
- **Paliers valorisables** : la fenêtre de paliers qui « rapporte » pour les valorisations
  (les seuils propres à chaque critère, ex. `P4 (min.)`, sont déjà encodés dans les données).

Dans `catalog.json`, pour une évolution : `exigences`, `valorisations` (avec `points`),
`valorisationsAChoisir`, `paliersAutorises`, `paliersValorisables`.

## 2. Comment les points sont comptés

**Note de départ = points d'exigences + points des valorisations retenues.**

### Tronc commun
- 1 point par exigence satisfaite.
- Un **même élément peut satisfaire plusieurs exigences** du TC (pas d'exclusivité).
- Certaines exigences portent sur l'enchaînement entier : `N arches` (nombre d'arches
  distinctes utilisées), `N à M éléments` (nombre total d'éléments).

### Valorisations
- Principale `(*)` = **3 pts**, secondaire = **2 pts**.
- On ne retient que les **n = 4** mieux payantes (sauf A1/A2 : toutes).
- **Un élément ne valide qu'UNE valorisation** — **sauf une valorisation de liaison**
  (LA / LAE / LG / LM / PG) qui est exemptée (l'élément d'une liaison peut aussi compter
  ailleurs). Le moteur attribue au mieux payant d'abord.
- Les **nomades ne valorisent jamais** (ils ne satisfont aucune valorisation).

### Validation du juge
- Un critère **« à cocher » (manuel)** n'est jamais détectable par l'app : le juge le
  valide (liaisons LG/LM/LA, PG…). Pour une note **maximale**, on les suppose réalisés.
- Un critère **« à confirmer »** : l'élément est détecté, le juge confirme (ex. une sortie,
  « avec rotation 180° »…). Pour le max, on les suppose confirmés.

### Saut (à part)
- Pas de tronc commun. La note **est la valeur du saut** choisi, selon son palier :

  | Palier | PR1 | PR2 | PR3 | P1–P2 | P3–P4–P5 | P6–P7 | Nomades |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | Valeur | 9 | 10 | 11 | 12 | 13 | 14 | 12 |

  *(L'app regroupe pour l'instant les pré-requis à 9.)*
- Les valorisations du saut s'ajoutent à la note **finale** (après exécution) — elles ne
  comptent pas dans la note de départ.

## 3. Contraintes de composition

Un enchaînement valable respecte :
- **Paliers autorisés** : uniquement des éléments de ces paliers.
- **Nombre d'éléments** : la fourchette du TC (`6 à 8`, `8 à 10`, `8 à 12`…).
- **Nombre d'arches** : au moins le nombre demandé (`4 arches`, `5 arches`) → prendre des
  éléments d'arches distinctes.
- Exigences spécifiques (ex. « 3 acros en poutre haute », « 1 changement de barre »,
  « 1 élément à l'ATR »).
- Les sorties de poutre ne sont pas une arche publiée : elles sont repérées par le drapeau
  `sortie` (voir `data/sorties.csv`).

## 4. Recette d'une note maximale

Pour un agrès + une évolution :

1. Lire dans `catalog.json` l'évolution : ses `exigences`, ses `valorisations` (avec points
   et `(*)`), `valorisationsAChoisir`, `paliersAutorises`.
2. Lister les éléments de l'agrès dans les `paliersAutorises` (champ `elements`).
3. **Couvrir toutes les exigences du TC** (chaque élément peut en couvrir plusieurs).
4. **Choisir les 4 valorisations les mieux payantes** (les `(*)` d'abord) réalisables avec
   des **éléments distincts** (les liaisons ne consomment pas d'élément). Chaque critère
   dit quels éléments le remplissent (les `criteres` de `catalog.json` listent les
   `element_id`).
5. Respecter le **nombre d'éléments**, le **nombre d'arches**, et les exigences spécifiques.
6. Note = (nb exigences) + (somme des points des 4 valorisations retenues) → doit atteindre
   le **plafond** du §6.

Pour le Saut : prendre le saut valant le plus au palier le plus haut autorisé.

## 5. Gérer un remplacement (« mets un saut à la place de l'acro »)

- Repérer **ce que l'élément retiré validait** (exigence ? valorisation ? quelle(s) ?).
- Le **remplaçant** doit : être dans un **palier autorisé**, et re-valider au moins ce que
  l'ancien couvrait pour **ne pas perdre de points** — sinon annoncer la perte.
- Attention à l'**exclusivité** : si le remplaçant valide une valorisation déjà prise par
  un autre élément, il ne rapporte rien de plus (sauf liaison).
- Vérifier que le **nombre d'éléments / d'arches** reste respecté.
- Recompter la note et la comparer au plafond.

## 6. Plafonds (filière féminine)

| Évolution | A1 · A2 | B1 | B2 · B3 | C1 · C2 · C3 |
| --- | --- | --- | --- | --- |
| Sol / Barres / Poutre | **13** | **14** | **15** | **15** |
| Saut | **12** | **13** (B1) · 13 (B2/B3) | — | **14** |

Détail Saut : A → 12, B → 13, C → 14 (valeur du meilleur saut au palier autorisé).

Décomposition des 13/14/15 (hors Saut) :
- **13** = 4 exigences + (3+2+2+2).
- **14** = 4 exigences + (3+3+2+2).
- **15** = 5 exigences + (3+3+2+2).

## 7. Où lire les données

Dans [`../src/data/catalog.json`](../src/data/catalog.json) :
- `elements` : chaque élément a `agres`, `arche`, `archeNom`, `famille`, `palier`,
  `numero`, `sortie`, `libelle`.
- `evolutions` : `exigences`, `valorisations` (`texte`, `points`), `valorisationsAChoisir`,
  `paliersAutorises`, `paliersValorisables`.
- `criteres` : un critère par (agrès, genre, texte) avec `type`, `nombreMin`, `confirmation`,
  `liaison`, et la liste des `elements` (ids) qui le remplissent.

Le détail du langage des critères et des contrôles est dans
[`criteres.md`](criteres.md) ; le lexique (LA, LAE, LG, LM, PG…) est dans l'app (bouton
**Lexique**) et sur la feuille *généralités* de l'UFOLEP.
