/* Accès aux données PROPRES à Nexus (Firestore), regroupées sous nxUsers/{uid} : une personne ne lit et n'écrit que les siennes
 * (imposé par les règles Firestore, Studio-Prism/firebase/rules/30-nexus.rules). Aucune copie des données des applications n'est conservée ici : seulement des
 * références (identifiant, nom) et des résumés courts.
 *
 *   nxUsers/{uid}                    préférences Nexus
 *   nxUsers/{uid}/connections/{app}  autorisations accordées à Nexus pour une application
 *   nxUsers/{uid}/workflows/{id}     automatisations
 *   nxUsers/{uid}/runs/{id}          exécutions (étapes, statuts, résultat) — conservées 180 jours (expireAt)
 *   nxUsers/{uid}/activity/{id}      historique des opérations — conservé 180 jours (expireAt)
 *   nxUsers/{uid}/aiUsage/{jour}     compteur quotidien de demandes à AXION
 *   nxConfig/axion                   réglage global d'AXION (lecture : comptes actifs ; écriture : administrateur actif)
 */
import { services } from "../auth/session.js";
import { APP_CONFIG } from "../config/app-config.js";
import { withTimeout } from "../core/errors.js";

const RETENTION_DAYS = 180;
const S = () => { const s = services(); if (!s) throw Object.assign(new Error("sdk"), { code: "app/sdk-unavailable" }); return s; };
const T = (p) => withTimeout(p, APP_CONFIG.TIMEOUTS.query);
const userDoc = (uid) => { const { db, F } = S(); return F.doc(db, "nxUsers", uid); };
const sub = (uid, name) => { const { db, F } = S(); return F.collection(db, "nxUsers", uid, name); };
const now = () => S().F.serverTimestamp();
const expireAt = () => S().F.Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 864e5);
const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/* ---------------------------------------------------------------- préférences */
export async function getPrefs(uid) {
  const { F } = S();
  const s = await T(F.getDoc(userDoc(uid)));
  return s.exists() ? s.data() : {};
}
export async function savePrefs(uid, prefs) {
  const { F } = S();
  const clean = {};
  if ("reduceMotion" in prefs) clean.reduceMotion = !!prefs.reduceMotion;
  if ("home" in prefs) clean.home = ["accueil", "applications", "automatisations"].includes(prefs.home) ? prefs.home : "accueil";
  if ("axionConsent" in prefs) clean.axionConsent = !!prefs.axionConsent;
  clean.updatedAt = now();
  await T(F.setDoc(userDoc(uid), clean, { merge: true }));
}

/* ---------------------------------------------------------------- connexions */
export async function listConnections(uid) {
  const { F } = S();
  return rows(await T(F.getDocs(sub(uid, "connections"))));
}
export async function grantConnection(uid, appId, scopes, existing) {
  const { F } = S();
  const ref = F.doc(sub(uid, "connections"), appId);
  const data = { appId, scopes, status: "active", updatedAt: now(), revokedAt: null };
  if (existing) await T(F.updateDoc(ref, data));
  else await T(F.setDoc(ref, { ...data, grantedAt: now() }));
}
export async function revokeConnection(uid, appId) {
  const { F } = S();
  await T(F.updateDoc(F.doc(sub(uid, "connections"), appId), { status: "revoked", scopes: [], revokedAt: now(), updatedAt: now() }));
}

/* ---------------------------------------------------------------- automatisations */
export async function listWorkflows(uid) {
  const { F } = S();
  return rows(await T(F.getDocs(F.query(sub(uid, "workflows"), F.orderBy("updatedAt", "desc"), F.limit(50)))));
}
export async function getWorkflow(uid, id) {
  const { F } = S();
  const s = await T(F.getDoc(F.doc(sub(uid, "workflows"), id)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function saveWorkflow(uid, wf) {
  const { F } = S();
  const data = { name: wf.name, description: wf.description || "", trigger: { type: "manual" }, steps: wf.steps, status: wf.status || "active", template: wf.template || "", updatedAt: now() };
  if (wf.id) { await T(F.updateDoc(F.doc(sub(uid, "workflows"), wf.id), data)); return wf.id; }
  const ref = F.doc(sub(uid, "workflows"));
  await T(F.setDoc(ref, { ...data, runCount: 0, lastRunAt: null, createdAt: now() }));
  return ref.id;
}
export async function deleteWorkflow(uid, id) {
  const { F } = S();
  await T(F.deleteDoc(F.doc(sub(uid, "workflows"), id)));
}
export async function markWorkflowRun(uid, id) {
  const { F } = S();
  await T(F.updateDoc(F.doc(sub(uid, "workflows"), id), { runCount: F.increment(1), lastRunAt: now(), updatedAt: now() }));
}

/* ---------------------------------------------------------------- exécutions */
export function newRunId(uid) { const { F } = S(); return F.doc(sub(uid, "runs")).id; }
export async function createRun(uid, id, run) {
  const { F } = S();
  await T(F.setDoc(F.doc(sub(uid, "runs"), id), { ...run, startedAt: now(), updatedAt: now(), endedAt: null, expireAt: expireAt() }));
}
export async function updateRun(uid, id, patch) {
  const { F } = S();
  const p = { ...patch, updatedAt: now() };
  if (patch.endedAt === true) p.endedAt = now();
  else if (patch.endedAt === null) p.endedAt = null;
  await T(F.updateDoc(F.doc(sub(uid, "runs"), id), p));
}
export async function listRuns(uid, max = 30) {
  const { F } = S();
  return rows(await T(F.getDocs(F.query(sub(uid, "runs"), F.orderBy("startedAt", "desc"), F.limit(max)))));
}
export async function getRun(uid, id) {
  const { F } = S();
  const s = await T(F.getDoc(F.doc(sub(uid, "runs"), id)));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/* ---------------------------------------------------------------- historique */
/* status : proposed | pending_confirmation | executed | verified | failed | cancelled */
export async function addActivity(uid, entry) {
  const { F } = S();
  const ref = F.doc(sub(uid, "activity"));
  await T(F.setDoc(ref, {
    action: String(entry.action).slice(0, 60), label: String(entry.label || "").slice(0, 120), appId: entry.appId || "",
    status: entry.status, summary: String(entry.summary || "").slice(0, 300), error: String(entry.error || "").slice(0, 300),
    runId: entry.runId || "", confirmedAt: entry.confirmed ? now() : null, at: now(), updatedAt: now(), expireAt: expireAt()
  }));
  return ref.id;
}
export async function updateActivity(uid, id, patch) {
  const { F } = S();
  const p = { updatedAt: now() };
  if (patch.status) p.status = patch.status;
  if (patch.summary != null) p.summary = String(patch.summary).slice(0, 300);
  if (patch.error != null) p.error = String(patch.error).slice(0, 300);
  if (patch.confirmed) p.confirmedAt = now();
  await T(F.updateDoc(F.doc(sub(uid, "activity"), id), p));
}
export async function listActivity(uid, max = 50) {
  const { F } = S();
  return rows(await T(F.getDocs(F.query(sub(uid, "activity"), F.orderBy("at", "desc"), F.limit(max)))));
}

/* ---------------------------------------------------------------- AXION : réglage global et compteur */
export async function getAxionConfig() {
  const { db, F } = S();
  const s = await T(F.getDoc(F.doc(db, "nxConfig", "axion")));
  return s.exists() ? s.data() : null;
}
export async function saveAxionConfig(cfg, uid) {
  const { db, F } = S();
  await T(F.setDoc(F.doc(db, "nxConfig", "axion"), {
    enabled: !!cfg.enabled, backend: cfg.backend, model: cfg.model, location: cfg.location || "global",
    dailyLimit: { free: cfg.dailyLimit.free, licensed: cfg.dailyLimit.licensed, admin: cfg.dailyLimit.admin },
    updatedAt: now(), updatedBy: uid
  }));
}
export async function getAiUsage(uid, day) {
  const { F } = S();
  const s = await T(F.getDoc(F.doc(sub(uid, "aiUsage"), day)));
  return s.exists() ? (s.data().count || 0) : 0;
}
/* +1 sur le compteur du jour ; les règles refusent tout saut et tout dépassement de la limite configurée. */
export async function bumpAiUsage(uid, day, current) {
  const { F } = S();
  const ref = F.doc(sub(uid, "aiUsage"), day);
  if (current === 0) await T(F.setDoc(ref, { count: 1, updatedAt: now() }));
  else await T(F.updateDoc(ref, { count: current + 1, updatedAt: now() }));
}

/* ---------------------------------------------------------------- effacer mes données Nexus */
export async function wipeMyData(uid) {
  const { db, F } = S();
  let n = 0;
  for (const name of ["connections", "workflows", "runs", "activity", "aiUsage"]) {
    for (;;) {
      const snap = await T(F.getDocs(F.query(sub(uid, name), F.limit(200))));
      if (snap.empty) break;
      const b = F.writeBatch(db);
      snap.docs.forEach((d) => b.delete(d.ref));
      await T(b.commit());
      n += snap.size;
    }
  }
  await T(F.deleteDoc(userDoc(uid)).catch(() => {}));
  return n;
}
