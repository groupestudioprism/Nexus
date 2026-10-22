/* Exécutions en cours dans cet onglet : le moteur continue quand on change de page ; l'état est enregistré dans Firestore à chaque
 * changement (nxUsers/{uid}/runs) pour l'historique. Une exécution trouvée « en cours » sans moteur actif (page fermée) est
 * présentée comme interrompue — jamais comme réussie. */
import { createRunner } from "./engine.js";
import { requiredScopes } from "./steps.js";
import { itemsDigest } from "./report.js";
import * as repo from "../data/repo.js";
import * as hub from "../data/hub.js";
import * as axion from "../axion/axion.js";
import { getState } from "../auth/session.js";
import { errorMessage } from "../core/errors.js";
import { appById } from "../connectors/registry.js";

const live = new Map();          // runId → { runner, state, workflow, confirmReq }
const listeners = new Set();
export const onLive = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = (id) => listeners.forEach((f) => { try { f(id); } catch (e) { console.error(e); } });
export const getLive = (id) => live.get(id) || null;
export const pendingConfirmations = () => [...live.values()].filter((r) => r.state && r.state.status === "awaiting_confirmation").length;

/* Lance une automatisation. `confirmUi(req)` affiche la demande de confirmation et résout true/false. */
export async function startRun(workflow, { confirmUi }) {
  const { user, profile } = getState();
  const uid = user.uid;
  const runId = repo.newRunId(uid);
  const entry = { runner: null, state: null, workflow, confirmReq: null };
  live.set(runId, entry);
  let actId = "";
  let saving = Promise.resolve();
  const persist = (st) => {
    const patch = { status: st.status, steps: st.steps.map((s) => ({ id: s.id, type: s.type, label: s.label, status: s.status, summary: s.summary.slice(0, 200), error: String(s.error || "").slice(0, 300), verified: !!s.verified })), error: String(st.error || "").slice(0, 500), result: st.result || null };
    patch.endedAt = ["succeeded", "failed", "cancelled"].includes(st.status) ? true : null;
    saving = saving.then(() => repo.updateRun(uid, runId, patch)).catch((e) => console.warn("[Nexus] exécution non enregistrée :", e.code || e));
  };

  const services = {
    now: () => Date.now(),
    author: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
    checkScope: (appId, scope) => hub.allowed(appId, scope),
    describeError: (e) => e.code === "nx/not-verified" ? errorMessage(e) : (e.message && !e.code ? e.message : errorMessage(e)),
    async collect(c) {
      await hub.loadConnections();
      const r = await hub.recentAll({ includeShared: c.includeShared, apps: c.apps, force: true });
      if (r.errors.length && !r.list.length) throw r.errors[0].error;
      if (r.errors.length) entry.warnings = r.errors.map((x) => `${appById(x.id)?.name || x.id} : ${errorMessage(x.error)}`);
      return r.list;
    },
    async summarize(c, items, signal) {
      return axion.summarize({ instruction: c.instruction, digest: itemsDigest(items), connectedApps: hub.connectedAppIds(), signal });
    },
    confirm: (req) => {
      entry.confirmReq = req; changed(runId);
      return confirmUi({ ...req, runId, workflow }).finally(() => { entry.confirmReq = null; });
    },
    writer: wrapWriter(hub.writerService(), uid, runId, () => actId, (v) => { actId = v; })
  };

  entry.runner = createRunner(workflow, services, (st) => { entry.state = st; persist(st); changed(runId); });
  entry.state = entry.runner.state;
  await repo.createRun(uid, runId, {
    workflowId: workflow.id || "", workflowName: workflow.name, trigger: "manual", status: "running",
    steps: entry.state.steps.map((s) => ({ id: s.id, type: s.type, label: s.label, status: "pending", summary: "", error: "", verified: false })),
    error: "", result: null, scopes: requiredScopes(workflow.steps).map(([a, s]) => `${a}:${s}`)
  });
  if (workflow.id) repo.markWorkflowRun(uid, workflow.id).catch(() => {});
  entry.runner.start().then((st) => logEnd(uid, runId, workflow, st));
  return runId;
}

export async function retryRun(runId) {
  const e = live.get(runId);
  if (!e || !e.runner.canRetry()) return;
  const { user } = getState();
  const st = await e.runner.retry();
  logEnd(user.uid, runId, e.workflow, st);
}
export function cancelRun(runId) { const e = live.get(runId); if (e) e.runner.cancel(); }

function logEnd(uid, runId, wf, st) {
  repo.addActivity(uid, {
    action: "workflow.run", label: `Automatisation : ${wf.name}`, runId,
    status: st.status === "succeeded" ? (st.steps.some((s) => s.verified) ? "verified" : "executed") : st.status === "failed" ? "failed" : "cancelled",
    summary: st.result ? st.result.summary : "", error: st.error
  }).catch(() => {});
}

/* L'écriture dans SPECTRA Writer est journalisée en trois temps : en attente de confirmation → exécutée → vérifiée (ou échec). */
function wrapWriter(w, uid, runId, getAct, setAct) {
  return {
    prepare: (report) => w.prepare(report),
    openUrl: w.openUrl,
    async create(prep) {
      const id = await repo.addActivity(uid, { action: "spectrawriter.create", label: `Création d'un document SPECTRA Writer : ${prep.payload.title}`, appId: "spectrawriter", runId, status: "executed", confirmed: true, summary: "Écriture envoyée" }).catch(() => "");
      setAct(id);
      try { return await w.create(prep); }
      catch (e) { if (id) repo.updateActivity(uid, id, { status: "failed", error: errorMessage(e) }).catch(() => {}); throw e; }
    },
    async verify(prep) {
      const v = await w.verify(prep);
      const id = getAct();
      if (id) repo.updateActivity(uid, id, v.ok ? { status: "verified", summary: "Document relu dans SPECTRA Writer : identique à ce qui a été envoyé" } : { status: "failed", error: "Document non retrouvé à la relecture" }).catch(() => {});
      return v;
    }
  };
}
