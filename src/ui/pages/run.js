/* Détail d'une exécution : chaque étape, son statut, son résultat ou son erreur. */
import { html, mount, delegate } from "../../core/dom.js";
import { dateTimeLabel, durationLabel, toMillis } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { getLive, onLive, cancelRun, retryRun } from "../../workflows/live.js";
import * as repo from "../../data/repo.js";
import { statusPill, errorBlock, skeletonList, notice, toast, confirmDialog } from "../components.js";
import { icon } from "../icons.js";
import { runStatus } from "./automations.js";

const STEP_TEXT = { pending: "En attente", running: "En cours", succeeded: "Terminée", failed: "Échec", skipped: "Non exécutée", cancelled: "Annulée", awaiting: "Attend votre confirmation" };

export async function render({ root, params, state, setCrumbs, setTitle }) {
  const uid = state.user.uid;
  let stored = null, err = null;
  const draw = () => {
    const live = getLive(params.id);
    const st = live && live.state ? live.state : stored;
    if (!st) { mount(root, err ? errorBlock(err) : skeletonList(4)); return; }
    const name = live ? live.workflow.name : stored.workflowName;
    const status = live && live.state ? live.state.status : runStatus(stored);
    setTitle(name);
    setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "/automatisations", label: "Automatisations" }, { path: "", label: name }]);
    const started = live ? live.state.startedAt : toMillis(stored.startedAt), ended = live ? live.state.endedAt : toMillis(stored.endedAt);
    const active = status === "running" || status === "awaiting_confirmation";
    mount(root, html`
      <div class="page-head"><div><div class="row" style="gap:10px"><h1>${name}</h1>${statusPill(status)}</div>
        <p class="lede">Démarrée le ${dateTimeLabel(started)}${ended ? ` · durée ${durationLabel(ended - started)}` : ""}</p></div>
        <div class="actions">
          ${active && live ? html`<button class="btn danger" data-act="stop">${icon("stop")}Arrêter</button>` : ""}
          ${live && live.runner.canRetry() ? html`<button class="btn primary" data-act="retry">${icon("retry")}Réessayer l'étape en échec</button>` : ""}
          ${status === "interrupted" ? html`<button class="btn" data-act="close">Marquer comme annulée</button>` : ""}
        </div></div>
      ${status === "interrupted" ? notice("warn", "Cette exécution a été interrompue : Nexus a été fermé ou rechargé avant la fin. Les étapes non terminées n'ont pas eu lieu. Relancez l'automatisation pour recommencer (aucun doublon ne sera créé pour une étape déjà vérifiée).") : ""}
      ${status === "awaiting_confirmation" ? notice("warn", "Une confirmation vous est demandée dans la fenêtre ouverte. Rien n'est écrit tant que vous n'avez pas confirmé.") : ""}
      ${live && live.warnings ? notice("warn", html`<b>Certaines applications n'ont pas pu être lues :</b> ${live.warnings.join(" ; ")}`) : ""}
      <div class="two" style="margin-top:16px">
        <section class="panel"><div class="panel-head"><h2>Étapes</h2></div><div class="panel-body">
          <ol class="steps">${st.steps.map((s) => html`<li class="step ${s.status}"><div class="step-body">
            <div class="step-title">${s.label}</div>
            <div class="step-sub">${STEP_TEXT[s.status] || s.status}${s.summary ? " · " + s.summary : ""}${s.verified ? " · vérifié par relecture" : ""}</div>
            ${s.error ? html`<div class="step-err">${s.error}</div>` : ""}</div><span></span></li>`)}</ol>
        </div></section>
        <aside class="panel"><div class="panel-head"><h2>Résultat</h2></div><div class="panel-body stack" style="--gap:12px">
          ${st.result ? html`<p>${st.result.summary}</p>${(st.result.links || []).map((l) => /^https:\/\//.test(l.url) ? html`<a class="btn primary" href="${l.url}" target="_blank" rel="noopener">${icon("external")}${l.label}</a>` : "")}`
            : status === "failed" ? html`<p class="step-err">${st.error || "Échec"}</p>` : status === "cancelled" ? html`<p class="muted">${st.error || "Annulée"} : aucune étape suivante n'a été exécutée.</p>` : html`<p class="muted">Le résultat s'affichera à la fin de l'exécution.</p>`}
          <p class="small muted">Chaque exécution est conservée 180 jours dans votre historique.</p>
        </div></aside>
      </div>`);
  };
  const off = delegate(root, {
    stop: async () => { if (await confirmDialog({ title: "Arrêter l'exécution ?", body: html`<p>L'étape en cours est interrompue dès que possible ; les étapes suivantes n'auront pas lieu.</p>`, confirmLabel: "Arrêter", danger: true })) cancelRun(params.id); },
    retry: () => retryRun(params.id).catch((e) => toast(errorMessage(e), "err")),
    close: async () => {
      try { await repo.updateRun(uid, params.id, { status: "cancelled", error: "Interrompue (page fermée pendant l'exécution)", endedAt: true }); stored = await repo.getRun(uid, params.id); toast("Exécution marquée comme annulée."); }
      catch (e) { toast(errorMessage(e), "err"); }
      draw();
    }
  });
  const off2 = onLive((id) => { if (id === params.id) draw(); });
  draw();
  if (!getLive(params.id)) {
    try { stored = await repo.getRun(uid, params.id); if (!stored) err = { code: "not-found" }; } catch (e) { err = e; }
    draw();
  }
  return () => { off(); off2(); };
}
