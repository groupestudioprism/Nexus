/* Automatisations : mes enchaînements entre applications, des modèles pour démarrer, les dernières exécutions. */
import { html, mount, delegate } from "../../core/dom.js";
import { relativeTime, plural } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { STEP_TYPES } from "../../workflows/steps.js";
import { TEMPLATES } from "../../workflows/templates.js";
import { getLive, onLive } from "../../workflows/live.js";
import * as repo from "../../data/repo.js";
import { go } from "../../core/router.js";
import { statusPill, empty, skeletonList, errorBlock, toast, confirmDialog } from "../components.js";
import { icon } from "../icons.js";
import { launch } from "../run-ui.js";

export const runStatus = (r) => {
  const l = getLive(r.id);
  if (l && l.state) return l.state.status;
  if (r.status === "running" || r.status === "awaiting_confirmation") return "interrupted";
  return r.status;
};

export async function render({ root, state }) {
  const uid = state.user.uid;
  let workflows = null, runs = null, err = null;
  const draw = () => {
    const waiting = (runs || []).filter((r) => runStatus(r) === "awaiting_confirmation");
    mount(root, html`
      <div class="page-head"><div><h1>Automatisations</h1><p class="lede">Enchaînez des tâches d'une application à l'autre. Elles s'exécutent dans cet onglet, étape par étape, et vous demandent confirmation avant toute écriture.</p></div>
        <div class="actions"><a class="btn primary" href="#/automatisations/nouvelle">${icon("plus")}Nouvelle automatisation</a></div></div>
      ${err ? errorBlock(err, "reload") : ""}
      ${waiting.map((r) => html`<div class="notice warn" style="margin-bottom:12px">${icon("warn")}<div class="notice-body"><b>${r.workflowName}</b> attend votre confirmation. <a href="#/executions/${r.id}">Voir l'exécution</a></div></div>`)}
      <section>
        <div class="section-head"><h2>Mes automatisations</h2></div>
        ${workflows == null ? skeletonList(3) : workflows.length ? html`<ul class="list">${workflows.map((w) => html`<li class="li" style="flex-wrap:wrap">
            <div class="li-main" style="min-width:220px"><a class="li-title" href="#/automatisations/${w.id}" style="color:inherit">${w.name}</a>
              <div class="li-sub">${(w.steps || []).map((s) => STEP_TYPES[s.type]?.short || s.type).join(" → ")}</div>
              <div class="li-sub">${w.lastRunAt ? `Dernière exécution ${relativeTime(w.lastRunAt)} · ${plural(w.runCount || 0, "exécution", "exécutions")}` : "Jamais exécutée"}${w.status === "paused" ? " · en pause" : ""}</div></div>
            <div class="li-side"><a class="btn sm" href="#/automatisations/${w.id}">${icon("edit")}Modifier</a><button class="btn sm primary" data-act="run" data-id="${w.id}" ${w.status === "paused" ? "disabled" : ""}>${icon("play")}Exécuter</button></div></li>`)}</ul>`
          : empty({ icon: "flow", title: "Aucune automatisation pour l'instant", text: "Partez d'un modèle ci-dessous ou composez la vôtre étape par étape." })}
      </section>
      <section class="section">
        <div class="section-head"><h2>Partir d'un modèle</h2></div>
        <div class="tiles">${TEMPLATES.map((t) => html`<div class="tile"><h3>${t.name}</h3><p class="tag">${t.description}</p>
          <div class="tile-foot">${t.needsAxion ? html`<span>Nécessite AXION</span>` : html`<span>${t.build().length} étapes</span>`}<span class="spacer"></span><button class="btn sm" data-act="use" data-tpl="${t.id}">Utiliser ce modèle</button></div></div>`)}</div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Dernières exécutions</h2></div>
        ${runs == null ? skeletonList(2) : runs.length ? html`<ul class="list">${runs.map((r) => html`<li><a class="li" href="#/executions/${r.id}"><div class="li-main"><div class="li-title">${r.workflowName}</div><div class="li-sub">${relativeTime(r.startedAt)}${r.result && r.result.summary ? " · " + r.result.summary : r.error ? " · " + r.error : ""}</div></div>${statusPill(runStatus(r))}</a></li>`)}</ul>`
          : empty({ icon: "history", title: "Aucune exécution", text: "Les exécutions et le détail de chaque étape s'afficheront ici." })}
      </section>`);
  };
  const load = async () => {
    try { [workflows, runs] = await Promise.all([repo.listWorkflows(uid), repo.listRuns(uid, 15)]); err = null; }
    catch (e) { err = e; workflows = workflows || []; runs = runs || []; }
    draw();
  };
  const off = delegate(root, {
    reload: load,
    use: (e, b) => go(`/automatisations/nouvelle?modele=${b.dataset.tpl}`),
    run: async (e, b) => {
      const w = workflows.find((x) => x.id === b.dataset.id);
      if (!w) return;
      const hasWrite = (w.steps || []).some((s) => STEP_TYPES[s.type]?.sensitive);
      if (!hasWrite || await confirmDialog({ title: `Exécuter « ${w.name} » ?`, body: html`<p>L'automatisation va démarrer dans cet onglet. Gardez Nexus ouvert jusqu'à la fin : une confirmation vous sera demandée avant toute écriture.</p>`, confirmLabel: "Exécuter" })) {
        await launch(w).catch((x) => toast(errorMessage(x), "err"));
      }
    }
  });
  const off2 = onLive(() => draw());
  draw();
  await load();
  return () => { off(); off2(); };
}
