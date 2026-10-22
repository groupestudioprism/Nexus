/* Moteur d'exécution des automatisations — PUR et injectable (tests/unit/engine.test.mjs).
 *
 * Volontairement simple : étapes en séquence, dans le navigateur, pendant que Nexus est ouvert.
 *  - chaque étape a un statut visible : pending → running → succeeded | failed | skipped | cancelled (awaiting pour une confirmation) ;
 *  - « Arrêter » interrompt avant l'étape suivante et annule une demande AXION en cours (AbortSignal) ;
 *  - « Réessayer » reprend à l'étape en échec, seulement si elle est déclarée sans risque (retryable) ;
 *  - une étape qui écrit dans une application n'est déclarée réussie qu'après RELECTURE du résultat (verified), sinon échec explicite.
 * Le moteur ne connaît ni Firebase ni l'interface : il reçoit des services et signale chaque changement par onUpdate(state).
 */
import { STEP_TYPES, requiredScopes } from "./steps.js";
import { validateWorkflow } from "./schema.js";
import { filterItems, composeReport } from "./report.js";

export const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const err = (code, msg) => Object.assign(new Error(msg || code), { code });

export function createRunner(workflow, services, onUpdate = () => {}) {
  const now = services.now || (() => Date.now());
  const state = {
    status: "pending", error: "", result: null, startedAt: 0, endedAt: 0,
    steps: workflow.steps.map((s) => ({ id: s.id, type: s.type, label: STEP_TYPES[s.type]?.label || s.type, status: "pending", startedAt: 0, endedAt: 0, summary: "", error: "", verified: false }))
  };
  const ctx = { items: null, summary: "", report: null, document: null, prepared: {} };
  let ctrl = new AbortController();
  let failedAt = -1;
  const emit = () => { try { onUpdate(clone(state)); } catch (e) { /* l'interface ne doit pas casser le moteur */ } };

  function finish(status, error = "") {
    state.status = status; state.error = error; state.endedAt = now();
    state.steps.forEach((s) => { if (s.status === "pending" && status !== "succeeded") s.status = status === "cancelled" ? "cancelled" : "skipped"; });
    emit();
    return clone(state);
  }

  async function runStep(i) {
    const def = workflow.steps[i], st = state.steps[i], c = def.config || {};
    const signal = ctrl.signal;
    st.status = "running"; st.startedAt = now(); st.error = ""; emit();
    switch (def.type) {
      case "collect": {
        const items = await services.collect(c, signal);
        ctx.items = items.slice(0, c.max);
        st.summary = `${ctx.items.length} élément${ctx.items.length > 1 ? "s" : ""} récupéré${ctx.items.length > 1 ? "s" : ""}`;
        break;
      }
      case "filter": {
        const before = ctx.items.length;
        ctx.items = filterItems(ctx.items, c, now());
        st.summary = `${ctx.items.length} sur ${before} conservé${ctx.items.length > 1 ? "s" : ""}`;
        break;
      }
      case "summarize": {
        ctx.summary = await services.summarize(c, ctx.items, signal);
        st.summary = `Synthèse de ${ctx.summary.length} caractères`;
        break;
      }
      case "report": {
        ctx.report = composeReport({ title: c.title, items: ctx.items, summary: ctx.summary, groupByApp: c.groupByApp, author: services.author || "", now: now() });
        st.summary = `« ${ctx.report.title} » prêt`;
        break;
      }
      case "confirm": {
        st.status = "awaiting"; state.status = "awaiting_confirmation"; emit();
        const ok = await services.confirm({ message: c.message, report: ctx.report, items: ctx.items, signal });
        if (signal.aborted) throw err("nx/cancelled");
        state.status = "running";
        if (!ok) throw err("nx/cancelled", "Refusé par l'utilisateur");
        st.summary = "Confirmé";
        st.confirmedAt = now();
        break;
      }
      case "writer": {
        if (!ctx.prepared[def.id]) ctx.prepared[def.id] = services.writer.prepare(ctx.report);   // même identifiant à chaque tentative
        const prep = ctx.prepared[def.id];
        const r = await services.writer.create(prep);
        const v = await services.writer.verify(prep);
        if (!v.ok) throw err("nx/not-verified", "Document envoyé mais non retrouvé à la relecture");
        st.verified = true;
        ctx.document = { id: r.id, url: services.writer.openUrl(r.id), title: prep.payload.title };
        st.summary = r.created ? "Document créé et vérifié" : "Document déjà présent (tentative précédente), vérifié";
        break;
      }
      default: throw err("nx/invalid", "Étape inconnue");
    }
    if (signal.aborted) throw err("nx/cancelled");
    st.status = "succeeded"; st.endedAt = now(); emit();
  }

  async function runFrom(start) {
    state.status = "running"; emit();
    for (let i = start; i < workflow.steps.length; i++) {
      if (ctrl.signal.aborted) return finish("cancelled", "Arrêtée par l'utilisateur");
      try {
        await runStep(i);
      } catch (e) {
        const st = state.steps[i];
        st.endedAt = now();
        if (e.code === "nx/cancelled" || ctrl.signal.aborted) {
          st.status = "cancelled"; st.error = e.message === "Refusé par l'utilisateur" ? "Refusé" : "Arrêtée";
          return finish("cancelled", e.message === "Refusé par l'utilisateur" ? "Refusée à l'étape de confirmation" : "Arrêtée par l'utilisateur");
        }
        st.status = "failed"; st.error = services.describeError ? services.describeError(e) : (e.message || e.code);
        failedAt = i;
        return finish("failed", st.error);
      }
    }
    const links = ctx.document ? [{ label: "Ouvrir dans SPECTRA Writer", url: ctx.document.url }] : [];
    state.result = {
      summary: ctx.document ? `Document « ${ctx.document.title} » créé et vérifié.` : ctx.report ? `Rapport « ${ctx.report.title} » composé (${(ctx.items || []).length} éléments).` : `${(ctx.items || []).length} éléments traités.`,
      links, documentId: ctx.document ? ctx.document.id : ""
    };
    return finish("succeeded");
  }

  return {
    get state() { return clone(state); },
    get context() { return ctx; },
    async start() {
      state.startedAt = now();
      const v = validateWorkflow(workflow);
      if (!v.ok) { state.steps[0].status = "failed"; state.steps[0].error = v.errors[0]; return finish("failed", v.errors.join(" ")); }
      const missing = requiredScopes(workflow.steps).filter(([a, s]) => !services.checkScope(a, s).ok);
      if (missing.length) {
        const e = `Autorisations manquantes : ${missing.map(([a, s]) => `${a} (${s})`).join(", ")}. Accordez-les dans Connexions.`;
        state.steps[0].status = "failed"; state.steps[0].error = e;
        return finish("failed", e);
      }
      return runFrom(0);
    },
    cancel() { ctrl.abort(); },
    canRetry() { return state.status === "failed" && failedAt >= 0 && !!STEP_TYPES[workflow.steps[failedAt].type]?.retryable; },
    async retry() {
      if (!this.canRetry()) throw err("nx/invalid", "Nouvelle tentative impossible");
      ctrl = new AbortController();
      const i = failedAt; failedAt = -1;
      state.error = ""; state.endedAt = 0;
      for (let k = i; k < state.steps.length; k++) Object.assign(state.steps[k], { status: "pending", error: "", summary: k === i ? "" : state.steps[k].summary });
      return runFrom(i);
    }
  };
}
