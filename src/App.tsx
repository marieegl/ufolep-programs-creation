import { useState } from "react";
import { catalog, elementsOf, evolutionsOf } from "./catalog";

export function App() {
  const [agres, setAgres] = useState(catalog.agres[0].nom);
  const elements = elementsOf(agres);
  const evolutions = evolutionsOf(agres);

  return (
    <main>
      <header>
        <h1>Note de départ — NPT UFOLEP</h1>
        <p>
          Catalogue de l’édition {catalog.edition} — {catalog.elements.length} éléments,{" "}
          {catalog.evolutions.length} évolutions.
        </p>
      </header>

      <nav>
        {catalog.agres.map((a) => (
          <button key={a.id} onClick={() => setAgres(a.nom)} aria-current={a.nom === agres}>
            {a.nom} <small>{a.nbElements}</small>
          </button>
        ))}
      </nav>

      <section>
        <h2>Évolutions</h2>
        {evolutions.length === 0 ? (
          <p>Aucune évolution pour cet agrès.</p>
        ) : (
          <ul className="evolutions">
            {evolutions.map((e) => (
              <li key={e.id}>
                <strong>{e.evolution}</strong> — paliers {e.paliersAutorises.join(" ")} — note{" "}
                {e.noteDeDepart ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Éléments</h2>
        {elements.length === 0 ? (
          <p>Le programme ne publie pas encore les arches de cet agrès.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Arche</th>
                <th>Famille</th>
                <th>Palier</th>
                <th>N°</th>
                <th>Libellé</th>
              </tr>
            </thead>
            <tbody>
              {elements.map((e) => (
                <tr key={e.id}>
                  <td>{e.archeNom}</td>
                  <td>{e.famille ?? "—"}</td>
                  <td>{e.palier}</td>
                  <td>
                    {e.numero}
                    {e.nouveau && <span className="badge">new</span>}
                  </td>
                  <td>{e.libelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
