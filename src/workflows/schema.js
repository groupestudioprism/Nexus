/* Validation d'une automatisation — PURE (tests/unit/schema.test.mjs).
 * Une automatisation invalide n'est ni enregistrée ni exécutée. Les règles Firestore vérifient en plus la forme du document. */
import { STEP_TYPES, MAX_STEPS } from "./steps.js";

export function validateWorkflow(wf) {
  const errors = [];
  const name = typeof wf?.name === "string" ? wf.name.trim() : "";
  if (!name) errors.push("Donnez un nom à l'automatisation.");
  else if (name.length > 80) errors.push("Le nom est limité à 80 caractères.");
  if (typeof wf?.description === "string" && wf.description.length > 300) errors.push("La description est limitée à 300 caractères.");
  const steps = Array.isArray(wf?.steps) ? wf.steps : [];
  if (!steps.length) errors.push("Ajoutez au moins une étape.");
  if (steps.length > MAX_STEPS) errors.push(`${MAX_STEPS} étapes au maximum.`);

  const have = new Set();
  let confirmed = false;
  const ids = new Set();
  steps.forEach((s, i) => {
    const n = i + 1;
    const t = STEP_TYPES[s?.type];
    if (!t) { errors.push(`Étape ${n} : type inconnu.`); return; }
    if (typeof s.id !== "string" || !/^[a-z]+-[a-z0-9]{2,12}$/.test(s.id) || ids.has(s.id)) errors.push(`Étape ${n} : identifiant invalide.`);
    ids.add(s.id);
    if (i === 0 && t.kind !== "source") errors.push("La première étape doit récupérer des données (« Récupérer des projets et documents »).");
    if (i > 0 && t.kind === "source") errors.push(`Étape ${n} : une seule étape de récupération, en premier.`);
    for (const need of t.needs || []) if (!have.has(need)) errors.push(`Étape ${n} (${t.short}) : il manque une étape qui fournit ${need === "items" ? "des projets" : need === "report" ? "un rapport" : need} avant elle.`);
    if (t.sensitive && !confirmed) errors.push(`Étape ${n} (${t.short}) : ajoutez « Demander ma confirmation » avant cette étape, qui écrit dans une application.`);
    for (const e of t.validate(s.config || {})) errors.push(`Étape ${n} (${t.short}) : ${e}`);
    if (t.kind === "control") confirmed = true;
    if (t.sensitive) confirmed = false;   // chaque écriture exige sa propre confirmation
    for (const g of t.gives || []) have.add(g);
  });
  return { ok: errors.length === 0, errors };
}

/* Copie propre pour l'enregistrement : seulement les champs attendus. */
export function normalizeWorkflow(wf) {
  return {
    id: wf.id || undefined,
    name: String(wf.name || "").trim().slice(0, 80),
    description: String(wf.description || "").trim().slice(0, 300),
    status: wf.status === "paused" ? "paused" : "active",
    template: String(wf.template || "").slice(0, 40),
    steps: (wf.steps || []).map((s) => ({ id: s.id, type: s.type, config: JSON.parse(JSON.stringify(s.config || {})) }))
  };
}
