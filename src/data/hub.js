/* Hub de Nexus : relie l'interface aux connecteurs, en appliquant les autorisations accordées (connexions) et en journalisant
 * chaque opération dans l'historique. C'est ici — et nulle part dans l'interface — que Nexus décide s'il PEUT agir. */
import { getState, services } from "../auth/session.js";
import { APP_CONFIG } from "../config/app-config.js";
import { withTimeout, nxError, errorMessage } from "../core/errors.js";
import { canUse, sanitizeScopes } from "../core/permissions.js";
import { APPS, appById, dataApps } from "../connectors/registry.js";
import * as cloud from "../connectors/cloud.js";
import * as repo from "./repo.js";

const T = (p) => withTimeout(p, APP_CONFIG.TIMEOUTS.query);
const me = () => { const s = getState(); if (s.status !== "in") throw nxError("unauthenticated"); return s; };
const svc = () => { const s = services(); return { db: s.db, F: s.F }; };

let connections = null;               // { appId: connexion }
const checks = {};                    // { appId: { ok, code, at } } — dernière vérification réelle
const itemsCache = {};                // { appId: { own, shared, at } }
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const changed = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

export function reset() { connections = null; Object.keys(checks).forEach((k) => delete checks[k]); Object.keys(itemsCache).forEach((k) => delete itemsCache[k]); }

export async function loadConnections(force = false) {
  if (connections && !force) return connections;
  const { user } = me();
  const list = await repo.listConnections(user.uid);
  connections = {};
  list.forEach((c) => { connections[c.id] = c; });
  return connections;
}
export const connectionOf = (appId) => (connections || {})[appId] || null;
export const lastCheck = (appId) => checks[appId] || null;
export const connectedAppIds = () => Object.values(connections || {}).filter((c) => c.status === "active").map((c) => c.appId);

export function allowed(appId, scope) {
  const { profile } = getState();
  return canUse({ profile, connection: connectionOf(appId), appId, scope });
}
function require(appId, scope) {
  const r = allowed(appId, scope);
  if (!r.ok) throw nxError(r.reason);
}

/* Accorder / modifier les autorisations d'une application, puis VÉRIFIER réellement l'accès aux données. */
export async function grant(appId, scopes) {
  const { user } = me();
  const app = appById(appId);
  const clean = sanitizeScopes(appId, scopes);
  if (!app || !clean.length) throw nxError("nx/invalid");
  const existing = connectionOf(appId);
  await repo.grantConnection(user.uid, appId, clean, !!existing);
  await loadConnections(true);
  let check = { ok: true };
  if (app.cloud) { check = await cloud.checkAccess(svc(), app, user.uid); checks[appId] = check; }
  await repo.addActivity(user.uid, {
    action: existing ? "connection.update" : "connection.grant", label: `${existing ? "Autorisations modifiées" : "Connexion autorisée"} : ${app.name}`, appId,
    status: check.ok ? "verified" : "failed", confirmed: true,
    summary: `Autorisations : ${clean.join(", ")}${app.cloud ? (check.ok ? " · accès aux données vérifié" : "") : ""}`,
    error: check.ok ? "" : errorMessage({ code: check.code })
  }).catch(() => {});
  delete itemsCache[appId];
  changed();
  return check;
}

export async function revoke(appId) {
  const { user } = me();
  const app = appById(appId);
  await repo.revokeConnection(user.uid, appId);
  await loadConnections(true);
  delete checks[appId]; delete itemsCache[appId];
  await repo.addActivity(user.uid, { action: "connection.revoke", label: `Connexion retirée : ${app ? app.name : appId}`, appId, status: "executed", confirmed: true, summary: "Nexus n'utilise plus cette application." }).catch(() => {});
  changed();
}

export async function verify(appId) {
  const { user } = me();
  const app = appById(appId);
  require(appId, "projects.read");
  checks[appId] = await cloud.checkAccess(svc(), app, user.uid);
  changed();
  return checks[appId];
}

/* Projets / documents d'une application (vos éléments, et les partages si l'autorisation « shared.read » est accordée). */
export async function items(appId, { force = false } = {}) {
  const { user } = me();
  const app = appById(appId);
  require(appId, "projects.read");
  const c = itemsCache[appId];
  if (c && !force && Date.now() - c.at < 90000) return c;
  try {
    const own = await T(cloud.listOwn(svc(), app, user.uid));
    let shared = [];
    if (allowed(appId, "shared.read").ok) shared = await T(cloud.listShared(svc(), app, user.email)).catch(() => []);
    itemsCache[appId] = { own, shared, at: Date.now() };
    checks[appId] = { ok: true, at: Date.now() };
    return itemsCache[appId];
  } catch (e) {
    checks[appId] = { ok: false, code: e.code || "unknown", at: Date.now() };
    throw e;
  } finally { changed(); }
}

/* Éléments récents de toutes les applications connectées (accueil, automatisations, AXION). Les échecs sont rendus, pas cachés. */
export async function recentAll({ includeShared = false, apps = null, force = false } = {}) {
  const ids = (apps || dataApps().map((a) => a.id)).filter((id) => allowed(id, "projects.read").ok);
  const results = await Promise.all(ids.map(async (id) => {
    try { const r = await items(id, { force }); return { id, list: includeShared && allowed(id, "shared.read").ok ? [...r.own, ...r.shared] : r.own }; }
    catch (e) { return { id, error: e }; }
  }));
  const list = results.flatMap((r) => r.list || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return { list, errors: results.filter((r) => r.error), apps: ids };
}

/* ------------------------------------------------------------------ SPECTRA Writer (écriture confirmée) */
export function writerService() {
  return {
    prepare(report) {
      require("spectrawriter", "documents.create");
      const id = services().F.doc(services().F.collection(services().db, "swDocs")).id;
      return { id, payload: cloud.buildWriterPayload({ title: report.title, html: report.html, plainText: report.text }) };
    },
    async create(prep) {
      require("spectrawriter", "documents.create");
      const { user, profile } = me();
      return T(cloud.createWriterDoc(svc(), { uid: user.uid, email: user.email, ownerName: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(), id: prep.id, payload: prep.payload }));
    },
    async verify(prep) {
      const { user } = me();
      try { return await T(cloud.verifyWriterDoc(svc(), { uid: user.uid, id: prep.id, payload: prep.payload })); }
      catch (e) { return { ok: false, reason: e.code || "lecture impossible" }; }
    },
    openUrl: (id) => appById("spectrawriter").deepLink(id)
  };
}

export const appsList = () => APPS;
