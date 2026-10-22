/* Historique : ce que Nexus a fait, quand, avec quelle application, et avec quel résultat. */
import { html, mount, delegate } from "../../core/dom.js";
import { dateTimeLabel } from "../../core/format.js";
import { appById } from "../../connectors/registry.js";
import * as repo from "../../data/repo.js";
import { statusPill, empty, skeletonList, errorBlock, STATUS_TEXT } from "../components.js";

const FILTERS = [["all", "Tout"], ["verified", "Vérifiées"], ["executed", "Exécutées"], ["pending_confirmation", "En attente"], ["failed", "Échecs"], ["cancelled", "Annulées"]];

export async function render({ root, state }) {
  let rows = null, err = null, filter = "all";
  const draw = () => {
    const list = rows ? rows.filter((r) => filter === "all" || r.status === filter) : null;
    mount(root, html`
      <div class="page-head"><div><h1>Historique</h1><p class="lede">Les opérations de Nexus sur votre compte, des plus récentes aux plus anciennes (180 jours). Le contenu de vos documents n'y est jamais copié.</p></div></div>
      ${err ? errorBlock(err, "reload") : ""}
      <div class="chips" role="group" aria-label="Filtrer par statut" style="margin-bottom:14px">${FILTERS.map(([k, l]) => html`<button class="chip" data-act="filter" data-k="${k}" aria-pressed="${filter === k}" style="${filter === k ? "border-color:var(--blue);background:#EAF1FE" : ""}">${l}</button>`)}</div>
      ${list == null ? skeletonList(5) : list.length ? html`<ul class="list">${list.map((r) => html`<li class="li" style="align-items:flex-start;flex-wrap:wrap">
          <div class="li-main" style="min-width:220px"><div class="li-title" style="white-space:normal">${r.label || r.action}</div>
            <div class="li-sub" style="white-space:normal">${dateTimeLabel(r.at)}${r.appId ? " · " + (appById(r.appId)?.name || r.appId) : ""}${r.confirmedAt ? " · confirmée par vous" : ""}</div>
            ${r.summary ? html`<div class="li-sub" style="white-space:normal">${r.summary}</div>` : ""}
            ${r.error ? html`<div class="step-err">${r.error}</div>` : ""}
            ${r.runId ? html`<a class="small" href="#/executions/${r.runId}">Voir l'exécution</a>` : ""}</div>
          ${statusPill(r.status)}</li>`)}</ul>` : empty({ icon: "history", title: filter === "all" ? "Aucune opération pour l'instant" : `Aucune opération « ${STATUS_TEXT[filter] || filter} »`, text: "" })}
      <details style="margin-top:22px" class="small"><summary style="cursor:pointer;font-weight:600">Que signifient les statuts ?</summary>
        <dl class="kv" style="margin-top:10px"><dt>Proposée</dt><dd>Suggérée (par exemple par AXION), rien n'a été fait.</dd><dt>En attente de confirmation</dt><dd>Nexus attend votre accord.</dd><dt>Exécutée</dt><dd>La demande a été envoyée et acceptée.</dd><dt>Vérifiée</dt><dd>Le résultat a été relu et correspond à ce qui était attendu.</dd><dt>Échec / Annulée</dt><dd>L'opération n'a pas abouti, ou a été arrêtée.</dd></dl></details>`);
  };
  const load = async () => { try { rows = await repo.listActivity(state.user.uid, 100); err = null; } catch (e) { err = e; rows = rows || []; } draw(); };
  const off = delegate(root, { filter: (e, b) => { filter = b.dataset.k; draw(); }, reload: load });
  draw();
  await load();
  return off;
}
