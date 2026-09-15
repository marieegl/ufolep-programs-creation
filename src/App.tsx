import { useMemo, useState } from "react";
import { catalog, criteresOf, elementsOf, evolutionsOf } from "./catalog";
import type { Element, Evolution } from "./catalog";
import { cleDe, noteMaximale, noter } from "./score";
import type { Etat, Ligne } from "./score";

/** Injected at build time by Vite — see `define` in vite.config.ts. */
declare const __DATE_BUILD__: string;

const ETATS: Record<Etat, string> = {
  satisfait: "satisfaite",
  insuffisant: "non satisfaite",
  "a-confirmer": "à confirmer",
  manuel: "à cocher",
};

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

  const note = evolution ? noter(evolution, { elements: choisis, coches }) : null;
  const plafond = evolution ? noteMaximale(evolution) : 0;
  const roles = useMemo(() => (evolution ? apports(evolution) : new Map()), [evolution]);

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
  };

  const basculer = (id: string) =>
    setChoisis((actuels) =>
      actuels.includes(id) ? actuels.filter((autre) => autre !== id) : [...actuels, id],
    );

  const cocher = (cle: string) =>
    setCoches((actuelles) => {
      const suivantes = new Set(actuelles);
      if (!suivantes.delete(cle)) suivantes.add(cle);
      return suivantes;
    });

  return (
    <main>
      <header>
        <h1>Note de départ — NPT UFOLEP</h1>
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
      </header>

      {!evolution || !note ? (
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
                      {bloc.lignes.map((ligne) => (
                        <tr key={cleDe(ligne.critere)} data-etat={ligne.etat}>
                          <td className="etat" title={ETATS[ligne.etat]} aria-label={ETATS[ligne.etat]} />
                          <td>
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
                      ))}
                    </tbody>
                  ))}
              </table>
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
  onClick: () => void;
};

function Choix({ element, apports, choisi, onClick }: ChoixProps) {
  return (
    <li>
      <button onClick={onClick} aria-pressed={choisi}>
        <span className="palier">{element.palier}</span>
        <span className="libelle">
          {element.libelle}
          <small>
            n° {element.numero}
            {element.famille && ` · ${element.famille}`}
            {element.nouveau && " · nouveau"}
          </small>
        </span>
        <span className="apports">
          {apports.map((apport) => (
            <span key={apport.texte} className={`apport ${apport.genre}`} title={apport.texte}>
              {apport.genre === "exigence" ? "E" : apport.genre === "max" ? "!" : `+${apport.points}`}
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}
