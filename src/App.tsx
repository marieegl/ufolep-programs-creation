import { useMemo, useState } from "react";
import { catalog, criteresOf, elementById, elementsOf, evolutionsOf } from "./catalog";
import type { Element, Evolution } from "./catalog";
import { cleDe, noteMaximale, noter } from "./score";
import type { Etat, Ligne } from "./score";
import { lexique } from "./lexique";

/** Injected at build time by Vite — see `define` in vite.config.ts. */
declare const __DATE_BUILD__: string;

const ETATS: Record<Etat, string> = {
  satisfait: "satisfaite",
  insuffisant: "non satisfaite",
  "a-confirmer": "à confirmer",
  manuel: "à cocher",
};

/** An element whose number ends with "+": an acro chained directly after another. */
const DEFINITION_PLUS =
  "Élément + : élément acro enchaîné directement d’un autre élément acro au sol, ou gym pour les LM en poutre";
const estPlus = (element: Element) => element.numero.endsWith("+");

/** What the criterion counts, spelt so the number on the row means something. */
const compteur = ({ critere, trouves }: Ligne) => {
  // A criterion that selects elements and has none is unreachable: either the apparatus
  // has no published arches, or the programme rewards something it never catalogued.
  // Saying so beats a 0 / 1 the coach would spend the afternoon trying to fill.
  const selecteur = critere.type === "elements" || critere.type === "familles";
  if (selecteur && critere.elements.length === 0) return "aucun élément au catalogue";
  switch (critere.type) {
    case "manuel":
      return "";
    case "max":
      return `${trouves} / ${critere.nombreMin} max`;
    case "total":
      return `${trouves} / ${critere.nombreMin}${critere.nombreMax ? `–${critere.nombreMax}` : ""}`;
    case "arches":
      return `${trouves} / ${critere.nombreMin} arches`;
    case "familles":
      return `${trouves} / ${critere.nombreMin} familles`;
    default:
      return `${trouves} / ${critere.nombreMin}`;
  }
};

/** What each element brings to *this* évolution — the reason to pick it, or not. */
const apports = (evolution: Evolution) => {
  const { exigences, valorisations } = criteresOf(evolution);
  const map = new Map<string, { genre: string; texte: string; points: number }[]>();
  for (const genre of ["exigence", "valorisation"] as const) {
    for (const { critere, points } of genre === "exigence" ? exigences : valorisations) {
      for (const id of critere.elements) {
        const apport = { genre: critere.type === "max" ? "max" : genre, texte: critere.texte, points };
        map.set(id, [...(map.get(id) ?? []), apport]);
      }
    }
  }
  return map;
};

export function App() {
  const [agres, setAgres] = useState(catalog.agres[0].nom);
  const [evolutionNom, setEvolutionNom] = useState("A1");
  const [choisis, setChoisis] = useState<string[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  /** element id → clé of the valorisation the coach pinned it to (overrides the default). */
  const [affectations, setAffectations] = useState<Map<string, string>>(new Map());
  /** Index of the composition row being dragged, while a drag is in progress. */
  const [glisse, setGlisse] = useState<number | null>(null);
  const [lexiqueOuvert, setLexiqueOuvert] = useState(false);
  /** Clé of the valorisation whose eligible elements are highlighted, or null. */
  const [apercu, setApercu] = useState<string | null>(null);
  /** "light" | "dark" once the coach has chosen; null follows the OS setting. */
  const [theme, setTheme] = useState<string | null>(
    () => document.documentElement.dataset.theme || null,
  );

  const evolutions = evolutionsOf(agres);
  const evolution = evolutions.find((e) => e.evolution === evolutionNom) ?? evolutions[0];

  const disponibles = useMemo(
    () => (evolution ? elementsOf(agres).filter((e) => evolution.paliersAutorises.includes(e.palier)) : []),
    [agres, evolution],
  );

  /** The list is long — 88 elements on Barre fixe — so it keeps the arches as landmarks. */
  const groupes = useMemo(() => {
    const out: { arche: string; elements: Element[] }[] = [];
    for (const element of disponibles) {
      const dernier = out[out.length - 1];
      if (dernier?.arche === element.archeNom) dernier.elements.push(element);
      else out.push({ arche: element.archeNom, elements: [element] });
    }
    return out;
  }, [disponibles]);

  const note = evolution ? noter(evolution, { elements: choisis, coches, affectations }) : null;
  const plafond = evolution ? noteMaximale(evolution) : 0;
  const roles = useMemo(() => (evolution ? apports(evolution) : new Map()), [evolution]);

  /** The elements eligible for the previewed valorisation — highlighted in the list. */
  const surbrillance = useMemo(() => {
    if (!apercu || !note) return new Set<string>();
    const ligne = note.valorisations.find((l) => cleDe(l.critere) === apercu);
    return new Set(ligne?.critere.elements ?? []);
  }, [apercu, note]);

  /** An évolution only allows some paliers, so changing it drops what it forbids.

  A2 and C1 are women's only, so the évolution being looked at may not exist on the
  apparatus being switched to. */
  const changer = (nomAgres: string, nom: string) => {
    const proposees = evolutionsOf(nomAgres);
    const suivante = proposees.find((e) => e.evolution === nom) ?? proposees[0];
    const permis = new Set(suivante?.paliersAutorises ?? []);
    setAgres(nomAgres);
    setEvolutionNom(suivante?.evolution ?? nom);
    setChoisis((actuels) =>
      nomAgres === agres
        ? actuels.filter((id) => permis.has(catalog.elements.find((e) => e.id === id)!.palier))
        : [],
    );
    if (nomAgres !== agres) setCoches(new Set());
    // Valorisation keys differ per évolution, so pins never carry over.
    setAffectations(new Map());
    setApercu(null);
  };

  const basculer = (id: string) => {
    setChoisis((actuels) =>
      actuels.includes(id) ? actuels.filter((autre) => autre !== id) : [...actuels, id],
    );
    // Dropping an element drops any pin it carried.
    setAffectations((actuelles) => {
      if (!actuelles.has(id)) return actuelles;
      const suivantes = new Map(actuelles);
      suivantes.delete(id);
      return suivantes;
    });
  };

  /** Pin an element to a valorisation (empty clé → back to the automatic choice). */
  const affecter = (id: string, clef: string) =>
    setAffectations((actuelles) => {
      const suivantes = new Map(actuelles);
      if (clef) suivantes.set(id, clef);
      else suivantes.delete(id);
      return suivantes;
    });

  const sombre = theme ? theme === "dark" : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const basculerTheme = () => {
    const suivant = sombre ? "light" : "dark";
    setTheme(suivant);
    document.documentElement.dataset.theme = suivant;
    try {
      localStorage.setItem("theme", suivant);
    } catch {
      // Private mode can block localStorage; the choice just won't be remembered.
    }
  };

  /** Move a composition element to another rank. The order is the routine's order —
  it does not change the score, which is set-based, but it lets the coach lay the
  movement out as it will be performed. */
  const reordonner = (depuis: number, vers: number) =>
    setChoisis((actuels) => {
      const copie = [...actuels];
      const [deplace] = copie.splice(depuis, 1);
      copie.splice(vers, 0, deplace);
      return copie;
    });

  const cocher = (cle: string) =>
    setCoches((actuelles) => {
      const suivantes = new Set(actuelles);
      if (!suivantes.delete(cle)) suivantes.add(cle);
      return suivantes;
    });

  return (
    <main>
      <header>
        <div className="titre">
          <h1>Note de départ — NPT UFOLEP</h1>
          <div className="actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={basculerTheme}
              aria-label={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
              title={sombre ? "Mode clair" : "Mode sombre"}
            >
              {sombre ? "☀︎" : "🌙"}
            </button>
            <button
              type="button"
              className="lien-lexique"
              onClick={() => setLexiqueOuvert((ouvert) => !ouvert)}
              aria-pressed={lexiqueOuvert}
            >
              {lexiqueOuvert ? "← Retour au calcul" : "Lexique"}
            </button>
          </div>
        </div>
        {!lexiqueOuvert && (
          <>
            <nav aria-label="Agrès">
              {catalog.agres.map((a) => (
                <button
                  key={a.id}
                  onClick={() => changer(a.nom, evolutionNom)}
                  aria-current={a.nom === agres}
                >
                  {a.nom}
                </button>
              ))}
            </nav>
            <nav aria-label="Évolution">
              {evolutions.map((e) => (
                <button
                  key={e.id}
                  onClick={() => changer(agres, e.evolution)}
                  aria-current={e.evolution === evolution?.evolution}
                >
                  {e.evolution}
                </button>
              ))}
            </nav>
          </>
        )}
      </header>

      {lexiqueOuvert ? (
        <Lexique />
      ) : !evolution || !note ? (
        <p>Aucune évolution publiée pour cet agrès.</p>
      ) : (
        <>
          <aside className="note">
            <p className="total">
              <strong>{note.total}</strong> / {plafond}
            </p>
            {note.valeurDuSaut !== null ? (
              <p>
                Valeur du saut choisi. Les valorisations du Saut s’ajoutent à la note{" "}
                <em>finale</em>, après exécution — elles ne comptent pas ici.
              </p>
            ) : (
              <p>
                {note.pointsExigences} pt d’exigences + {note.pointsValorisations} pt de
                valorisations
                {evolution.valorisationsAChoisir
                  ? ` (${evolution.valorisationsAChoisir} retenues au plus)`
                  : ""}
                . Paliers autorisés : {evolution.paliersAutorises.join(" · ")}.
              </p>
            )}
          </aside>

          {choisis.length > 0 && (
            <section className="composition">
              <h2>
                Composition du mouvement{" "}
                <small>
                  {choisis.length} élément{choisis.length > 1 ? "s" : ""} · glisser ou flèches pour réordonner
                </small>
              </h2>
              <ol>
                {choisis.map((id, i) => {
                  const element = elementById.get(id);
                  if (!element) return null;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={() => setGlisse(i)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (glisse !== null && glisse !== i) {
                          reordonner(glisse, i);
                          setGlisse(i);
                        }
                      }}
                      onDragEnd={() => setGlisse(null)}
                      data-drag={glisse === i || undefined}
                      data-apercu={surbrillance.has(id) || undefined}
                    >
                      <span className="poignee" aria-hidden="true">⠿</span>
                      <span className="rang">{i + 1}</span>
                      <span className="palier">{element.palier}</span>
                      <span className="libelle">
                        {estPlus(element) && (
                          <span className="plus" title={DEFINITION_PLUS}>+ </span>
                        )}
                        {element.libelle}
                        <small>
                          n° {element.numero}
                          {element.famille && ` · ${element.famille}`}
                          {element.sortie && " · sortie"}
                        </small>
                        {(() => {
                          // When an element can serve several exclusive valorisations, let
                          // the coach pin which one it counts for; "Auto" keeps the default.
                          const options = note.valorisations.filter(
                            (l) =>
                              !l.critere.liaison &&
                              (l.critere.type === "elements" || l.critere.type === "familles") &&
                              l.critere.elements.includes(id),
                          );
                          if (options.length < 2) return null;
                          const creditee = note.valorisations.find((l) =>
                            l.elementsRetenus.includes(id),
                          );
                          return (
                            <select
                              className="affectation"
                              value={affectations.get(id) ?? ""}
                              onChange={(event) => affecter(id, event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              title="Compter cet élément pour…"
                              aria-label={`Valorisation comptée pour ${element.libelle}`}
                            >
                              <option value="">
                                Auto{creditee ? ` — ${creditee.critere.texte}` : " — non compté"}
                              </option>
                              {options.map((l) => (
                                <option key={cleDe(l.critere)} value={cleDe(l.critere)}>
                                  {l.critere.texte}
                                </option>
                              ))}
                            </select>
                          );
                        })()}
                      </span>
                      <Apports apports={roles.get(id) ?? []} />
                      <span className="ordre">
                        <button
                          type="button"
                          onClick={() => reordonner(i, i - 1)}
                          disabled={i === 0}
                          aria-label="Monter"
                          title="Monter"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => reordonner(i, i + 1)}
                          disabled={i === choisis.length - 1}
                          aria-label="Descendre"
                          title="Descendre"
                        >
                          ▼
                        </button>
                      </span>
                      <button
                        type="button"
                        className="retirer"
                        onClick={() => basculer(id)}
                        aria-label={`Retirer ${element.libelle}`}
                        title="Retirer de la composition"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <div className="colonnes">
            <section>
              <h2>Exigences et valorisations</h2>
              <table className="criteres">
                {[
                  { titre: "Tronc commun — 1 pt chacune", lignes: note.exigences },
                  { titre: "Valorisations", lignes: note.valorisations },
                ]
                  .filter((bloc) => bloc.lignes.length > 0)
                  .map((bloc) => (
                    <tbody key={bloc.titre}>
                      <tr className="genre">
                        <td colSpan={5}>{bloc.titre}</td>
                      </tr>
                      {bloc.lignes.map((ligne) => {
                        // A "principale" valorisation is worth 3 points, a "secondaire" 2.
                        // The décomposition marks the principales with (*) on a darker cell.
                        const principale =
                          ligne.critere.genre === "valorisation" && ligne.pointsPossibles === 3;
                        // Clicking a valorisation that selects elements previews them in the list.
                        const cliquable =
                          ligne.critere.genre === "valorisation" && ligne.critere.elements.length > 0;
                        const actif = apercu === cleDe(ligne.critere);
                        return (
                        <tr
                          key={cleDe(ligne.critere)}
                          data-etat={ligne.etat}
                          data-principale={principale || undefined}
                        >
                          <td className="etat" title={ETATS[ligne.etat]} aria-label={ETATS[ligne.etat]} />
                          <td
                            className={cliquable ? "cliquable" : undefined}
                            data-apercu={actif || undefined}
                            onClick={
                              cliquable
                                ? () => setApercu(actif ? null : cleDe(ligne.critere))
                                : undefined
                            }
                            title={cliquable ? "Voir les éléments correspondants dans la liste" : undefined}
                          >
                            {principale && (
                              <span className="principale" title="Valorisation principale — 3 points">
                                (*){" "}
                              </span>
                            )}
                            {ligne.critere.texte}
                            {ligne.critere.commentaire && (
                              <small title={ligne.critere.commentaire}> ⓘ</small>
                            )}
                          </td>
                          <td className="compte">{compteur(ligne)}</td>
                          <td className="coche">
                            {(ligne.critere.confirmation || ligne.critere.type === "manuel") && (
                              <input
                                type="checkbox"
                                checked={coches.has(cleDe(ligne.critere))}
                                onChange={() => cocher(cleDe(ligne.critere))}
                                aria-label={`Confirmer : ${ligne.critere.texte}`}
                              />
                            )}
                          </td>
                          <td className="points">
                            {ligne.points || ""}
                            <small>/{ligne.pointsPossibles}</small>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  ))}
              </table>
              <ul className="legende" aria-label="Légende des états">
                <li data-etat="satisfait">satisfaite</li>
                <li data-etat="a-confirmer">à confirmer</li>
                <li data-etat="manuel">à cocher</li>
                <li data-etat="insuffisant">non satisfaite</li>
                <li className="legende-principale">
                  <span>(*)</span> vaut 3 points
                </li>
              </ul>
            </section>

            <section>
              <h2>
                Éléments <small>{choisis.length} choisis sur {disponibles.length} possibles</small>
              </h2>
              {disponibles.length === 0 ? (
                <p>Le programme ne publie pas encore les arches de cet agrès.</p>
              ) : (
                <ul className="elements">
                  {groupes.map((groupe) => (
                    <li key={groupe.arche}>
                      <h3>{groupe.arche}</h3>
                      <ul>
                        {groupe.elements.map((element) => (
                          <Choix
                            key={element.id}
                            element={element}
                            apports={roles.get(element.id) ?? []}
                            choisi={choisis.includes(element.id)}
                            apercu={surbrillance.has(element.id)}
                            onClick={() => basculer(element.id)}
                          />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <footer>
        <span>Édition {catalog.edition}</span>
        <span>Généré le {__DATE_BUILD__}</span>
        <span>Propriété de Marie Engel — usage personnel</span>
      </footer>
    </main>
  );
}

type ChoixProps = {
  element: Element;
  apports: { genre: string; texte: string; points: number }[];
  choisi: boolean;
  apercu: boolean;
  onClick: () => void;
};

function Choix({ element, apports, choisi, apercu, onClick }: ChoixProps) {
  return (
    <li>
      <button onClick={onClick} aria-pressed={choisi} data-apercu={apercu || undefined}>
        <span className="palier">{element.palier}</span>
        <span className="libelle">
          {estPlus(element) && <span className="plus" title={DEFINITION_PLUS}>+ </span>}
          {element.libelle}
          <small>
            n° {element.numero}
            {element.famille && ` · ${element.famille}`}
            {element.nouveau && " · nouveau"}
            {element.sortie && " · sortie"}
          </small>
        </span>
        <Apports apports={apports} />
      </button>
    </li>
  );
}

/** The programme's vocabulary, grouped so LA / LAE / LG / LM / PG read side by side. */
function Lexique() {
  return (
    <section className="lexique">
      {lexique.map((groupe) => (
        <div key={groupe.titre} className="groupe">
          <h2>{groupe.titre}</h2>
          <dl>
            {groupe.entrees.map((entree) => (
              <div key={entree.terme}>
                <dt>{entree.terme}</dt>
                <dd>
                  {entree.definition}
                  {entree.precision && <small>{entree.precision}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

/** The little E / ! / +n chips that say why an element is worth picking. */
function Apports({ apports }: { apports: { genre: string; texte: string; points: number }[] }) {
  return (
    <span className="apports">
      {apports.map((apport) => (
        <span key={apport.texte} className={`apport ${apport.genre}`} title={apport.texte}>
          {apport.genre === "exigence" ? "E" : apport.genre === "max" ? "!" : `+${apport.points}`}
        </span>
      ))}
    </span>
  );
}
