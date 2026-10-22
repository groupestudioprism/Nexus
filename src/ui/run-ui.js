/* Lancement d'une automatisation depuis l'interface : contrôle préalable des autorisations, confirmation visible du résultat. */
import { html, raw } from "../core/dom.js";
import { go } from "../core/router.js";
import { errorMessage } from "../core/errors.js";
import { requiredScopes } from "../workflows/steps.js";
import { validateWorkflow } from "../workflows/schema.js";
import { startRun } from "../workflows/live.js";
import { appById, SCOPES } from "../connectors/registry.js";
import * as hub from "../data/hub.js";
import { confirmDialog, toast, notice } from "./components.js";

/* Confirmation d'une étape « Demander ma confirmation » : montre exactement ce qui va être créé. */
export function confirmStep(req) {
  const r = req.report;
  return confirmDialog({
    title: "Confirmer la suite de l'automatisation",
    wide: true,
    signal: req.signal,
    body: html`<p style="margin-bottom:12px"><b>${req.workflow.name}</b> · ${req.message}</p>
      ${r ? html`<p class="small muted" style="margin-bottom:8px">Aperçu du document qui sera créé dans votre espace SPECTRA Writer :</p><div class="report-preview">${raw(r.html)}</div>` : html`<p>${(req.items || []).length} élément(s) prêts.</p>`}
      <p class="small muted" style="margin-top:12px">« Refuser » arrête l'automatisation : rien n'est créé.</p>`,
    confirmLabel: r ? "Créer le document" : "Continuer"
  });
}

export async function launch(wf) {
  const v = validateWorkflow(wf);
  if (!v.ok) { toast(v.errors[0], "err"); return null; }
  try { await hub.loadConnections(); } catch (e) { toast(errorMessage(e), "err"); return null; }
  const missing = requiredScopes(wf.steps).filter(([a, s]) => !hub.allowed(a, s).ok);
  if (missing.length) {
    const go2 = await confirmDialog({
      title: "Autorisations nécessaires",
      body: html`<p style="margin-bottom:10px">Cette automatisation a besoin d'autorisations que vous n'avez pas encore accordées à Nexus :</p>
        <ul class="feat">${missing.map(([a, s]) => html`<li><b>${appById(a)?.name || a}</b> : ${SCOPES[s]?.label || s}</li>`)}</ul>
        ${notice("info", "Accordez-les depuis Connexions, puis relancez l'automatisation.")}`,
      confirmLabel: "Ouvrir Connexions"
    });
    if (go2) go("/connexions");
    return null;
  }
  try {
    const id = await startRun(wf, { confirmUi: confirmStep });
    go(`/executions/${id}`);
    return id;
  } catch (e) { toast(errorMessage(e), "err"); return null; }
}
