/* Éditeur d'automatisation : une suite d'étapes simples, validée en direct. */
import { html, raw, mount, delegate, $ } from "../../core/dom.js";
import { errorMessage } from "../../core/errors.js";
import { go, replace } from "../../core/router.js";
import { STEP_TYPES, STEP_ORDER, MAX_STEPS, newStep, requiredScopes } from "../../workflows/steps.js";
import { validateWorkflow, normalizeWorkflow } from "../../workflows/schema.js";
import { TEMPLATES } from "../../workflows/templates.js";
import { dataApps, appById, SCOPES } from "../../connectors/registry.js";
import * as repo from "../../data/repo.js";
import * as hub from "../../data/hub.js";
import { notice, toast, busy, confirmDialog, errorBlock, skeletonList, pill } from "../components.js";
import { icon } from "../icons.js";
import { launch } from "../run-ui.js";

function stepForm(s, i) {
  const c = s.config;
  const f = (name) => `data-i="${i}" data-f="${name}"`;
  switch (s.type) {
    case "collect": return html`<div class="grid2"><div class="field" style="grid-column:1/-1"><span>Applications</span><div class="chips">${dataApps().map((a) => html`<label class="chip"><input type="checkbox" data-i="${i}" data-f="apps" value="${a.id}" ${c.apps.includes(a.id) ? "checked" : ""}>${a.name}</label>`)}</div></div>
      <label class="check"><input type="checkbox" ${raw(f("includeShared"))} ${c.includeShared ? "checked" : ""}><span>Inclure les éléments partagés avec moi</span></label>
      <label class="field"><span>Nombre maximal d'éléments</span><input class="input" type="number" min="1" max="300" value="${c.max}" ${raw(f("max"))}></label></div>`;
    case "filter": return html`<div class="grid2"><label class="field"><span>Modifiés depuis (jours) <span class="hint">0 = sans limite</span></span><input class="input" type="number" min="0" max="3650" value="${c.days}" ${raw(f("days"))}></label>
      <label class="field"><span>Nom contenant <span class="hint">facultatif</span></span><input class="input" maxlength="60" value="${c.contains}" ${raw(f("contains"))}></label></div>`;
    case "summarize": return html`<div class="grid2"><label class="field" style="grid-column:1/-1"><span>Instruction pour AXION</span><textarea class="input" maxlength="400" ${raw(f("instruction"))}>${c.instruction}</textarea><span class="hint">AXION reçoit seulement les noms, applications et dates des éléments, jamais leur contenu.</span></label></div>`;
    case "report": return html`<div class="grid2"><label class="field"><span>Titre du rapport</span><input class="input" maxlength="120" value="${c.title}" ${raw(f("title"))}></label>
      <label class="check" style="align-self:end"><input type="checkbox" ${raw(f("groupByApp"))} ${c.groupByApp ? "checked" : ""}><span>Regrouper par application</span></label></div>`;
    case "confirm": return html`<div class="grid2"><label class="field" style="grid-column:1/-1"><span>Message affiché</span><input class="input" maxlength="200" value="${c.message}" ${raw(f("message"))}></label></div>`;
    case "writer": return html`<p class="small muted" style="margin-top:8px">Crée un nouveau document dans votre espace SPECTRA Writer (jamais de modification d'un document existant), puis le relit pour vérifier.</p>`;
    default: return "";
  }
}

export async function render({ root, params, query, state, setCrumbs, setTitle }) {
  const uid = state.user.uid;
  const isNew = !params.id;
  let wf, loadErr = null, dirty = false;
  if (isNew) {
    const t = TEMPLATES.find((x) => x.id === query.modele);
    wf = t ? { name: t.name, description: t.description, steps: t.build(), status: "active", template: t.id } : { name: "", description: "", steps: [newStep("collect")], status: "active" };
  } else {
    mount(root, skeletonList(3));
    try { wf = await repo.getWorkflow(uid, params.id); } catch (e) { loadErr = e; }
    if (!wf && !loadErr) loadErr = { code: "not-found" };
  }
  setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "/automatisations", label: "Automatisations" }, { path: "", label: isNew ? "Nouvelle" : (wf ? wf.name : "…") }]);
  if (loadErr) { mount(root, html`<div class="page-head"><h1>Automatisation</h1></div>${errorBlock(loadErr)}<p style="margin-top:12px"><a href="#/automatisations">Retour aux automatisations</a></p>`); return; }
  setTitle(isNew ? "Nouvelle automatisation" : wf.name);
  try { await hub.loadConnections(); } catch (e) { /* les autorisations s'afficheront « inconnues » */ }

  const errorsBox = () => {
    const v = validateWorkflow(wf);
    const el = $("#wf-errors", root);
    if (el) mount(el, v.ok ? notice("ok", "L'automatisation est valide.") : notice("warn", html`<b>À corriger avant d'enregistrer :</b><ul class="feat" style="margin-top:6px">${v.errors.map((e) => html`<li>${e}</li>`)}</ul>`));
    const sc = $("#wf-scopes", root);
    if (sc) {
      const req = requiredScopes(wf.steps);
      mount(sc, req.length ? html`<ul class="list">${req.map(([a, s]) => { const ok = hub.allowed(a, s).ok; return html`<li class="li"><div class="li-main"><div class="li-title small">${appById(a)?.name || a}</div><div class="li-sub">${SCOPES[s]?.label || s}</div></div>${ok ? pill("ok", "Accordée") : pill("warn", "Manquante")}</li>`; })}</ul>${req.some(([a, s]) => !hub.allowed(a, s).ok) ? html`<p class="small" style="margin-top:8px"><a href="#/connexions">Accorder les autorisations manquantes</a></p>` : ""}` : html`<p class="small muted">Aucune autorisation nécessaire.</p>`);
    }
    return v;
  };

  const draw = () => {
    mount(root, html`
      <div class="page-head"><div><h1>${isNew ? "Nouvelle automatisation" : "Modifier l'automatisation"}</h1><p class="lede">Les étapes s'exécutent dans l'ordre. Chaque étape utilise le résultat de la précédente.</p></div>
        <div class="actions">${!isNew ? html`<button class="btn danger" data-act="delete">${icon("trash")}Supprimer</button>` : ""}<button class="btn" data-act="save">Enregistrer</button><button class="btn primary" data-act="saveRun">${icon("play")}Enregistrer et exécuter</button></div></div>
      <div class="two">
        <div class="stack" style="--gap:18px">
          <section class="panel"><div class="panel-body stack" style="--gap:14px">
            <label class="field"><span>Nom</span><input class="input" id="wf-name" maxlength="80" value="${wf.name}" placeholder="Ex. : Rapport mensuel des chantiers"></label>
            <label class="field"><span>Description <span class="hint">facultatif</span></span><textarea class="input" id="wf-desc" maxlength="300" style="min-height:70px">${wf.description || ""}</textarea></label>
            <label class="check"><input type="checkbox" id="wf-paused" ${wf.status === "paused" ? "checked" : ""}><span>Mettre en pause (ne peut pas être exécutée)</span></label>
          </div></section>
          <section>
            <div class="section-head"><h2>Étapes</h2><span class="muted small">${wf.steps.length} / ${MAX_STEPS}</span></div>
            <ol class="steps">${wf.steps.map((s, i) => { const t = STEP_TYPES[s.type]; return html`<li class="step"><div class="editor-step">
              <div class="row"><div class="step-title">${t.label}</div><span class="spacer"></span>
                <div class="step-tools"><button class="icon-btn" data-act="up" data-i="${i}" aria-label="Monter l'étape ${i + 1}" ${i === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-btn" data-act="down" data-i="${i}" aria-label="Descendre l'étape ${i + 1}" ${i === wf.steps.length - 1 ? "disabled" : ""}>${icon("down")}</button><button class="icon-btn" data-act="remove" data-i="${i}" aria-label="Retirer l'étape ${i + 1}">${icon("trash")}</button></div></div>
              ${stepForm(s, i)}</div><span></span></li>`; })}</ol>
            ${wf.steps.length < MAX_STEPS ? html`<div class="field"><span>Ajouter une étape</span><div class="add-step">${STEP_ORDER.map((t) => html`<button class="btn sm" data-act="add" data-type="${t}">${icon("plus")}${STEP_TYPES[t].short}</button>`)}</div></div>` : ""}
          </section>
        </div>
        <aside class="stack" style="--gap:18px">
          <section class="panel"><div class="panel-head"><h2>Vérification</h2></div><div class="panel-body" id="wf-errors"></div></section>
          <section class="panel"><div class="panel-head"><h2>Autorisations nécessaires</h2></div><div class="panel-body" id="wf-scopes"></div></section>
          <section class="panel"><div class="panel-body small muted">Déclenchement : manuel, depuis Nexus. Les déclenchements planifiés exigeraient un serveur (non disponible sur le forfait gratuit actuel).</div></section>
        </aside>
      </div>`);
    errorsBox();
  };

  const read = () => {
    wf.name = $("#wf-name", root).value;
    wf.description = $("#wf-desc", root).value;
    wf.status = $("#wf-paused", root).checked ? "paused" : "active";
  };
  const onInput = (e) => {
    const t = e.target;
    if (t.id === "wf-name" || t.id === "wf-desc" || t.id === "wf-paused") { read(); dirty = true; errorsBox(); return; }
    if (t.dataset.i == null || !t.dataset.f) return;
    const s = wf.steps[+t.dataset.i], f = t.dataset.f;
    dirty = true;
    if (f === "apps") s.config.apps = [...root.querySelectorAll(`input[data-i="${t.dataset.i}"][data-f="apps"]`)].filter((x) => x.checked).map((x) => x.value);
    else if (t.type === "checkbox") s.config[f] = t.checked;
    else if (t.type === "number") s.config[f] = t.value === "" ? NaN : Number(t.value);
    else s.config[f] = t.value;
    errorsBox();
  };
  root.addEventListener("input", onInput);
  root.addEventListener("change", onInput);

  const save = async (b) => {
    read();
    const v = errorsBox();
    if (!v.ok) { toast("Corrigez l'automatisation avant de l'enregistrer.", "err"); $("#wf-errors", root).scrollIntoView({ block: "center" }); return null; }
    busy(b, true, "Enregistrement…");
    try {
      const n = normalizeWorkflow(wf);
      const id = await repo.saveWorkflow(uid, { ...n, id: wf.id });
      wf.id = id; dirty = false;
      busy(b, false);
      return id;
    } catch (e) { busy(b, false); toast(errorMessage(e), "err"); return null; }
  };
  const move = (i, d) => { const a = wf.steps; [a[i], a[i + d]] = [a[i + d], a[i]]; dirty = true; draw(); };
  const off = delegate(root, {
    up: (e, b) => move(+b.dataset.i, -1),
    down: (e, b) => move(+b.dataset.i, 1),
    remove: (e, b) => { wf.steps.splice(+b.dataset.i, 1); dirty = true; draw(); },
    add: (e, b) => { read(); wf.steps.push(newStep(b.dataset.type)); dirty = true; draw(); },
    save: async (e, b) => { const id = await save(b); if (id) { toast("Automatisation enregistrée."); if (isNew) replace(`/automatisations/${id}`); } },
    saveRun: async (e, b) => { const id = await save(b); if (id) { toast("Automatisation enregistrée."); await launch({ ...normalizeWorkflow(wf), id }); } },
    delete: async () => {
      if (!(await confirmDialog({ title: "Supprimer cette automatisation ?", body: html`<p>« ${wf.name} » sera supprimée. Ses exécutions passées restent dans l'historique.</p>`, confirmLabel: "Supprimer", danger: true }))) return;
      try { await repo.deleteWorkflow(uid, wf.id); toast("Automatisation supprimée."); dirty = false; go("/automatisations"); } catch (x) { toast(errorMessage(x), "err"); }
    }
  });
  const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", warn);
  draw();
  return () => { off(); root.removeEventListener("input", onInput); root.removeEventListener("change", onInput); window.removeEventListener("beforeunload", warn); };
}
