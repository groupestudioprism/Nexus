/* AXION dans Nexus — état de configuration, demandes, compteur quotidien, journal.
 *
 * Rien n'est simulé : si AXION n'est pas activé (nxConfig/axion), si le service ne répond pas ou si la limite est atteinte, l'interface
 * l'affiche tel quel avec les étapes à suivre. Les données envoyées au modèle se limitent à ce que la personne voit à l'écran
 * (sa question et, si elle le choisit, les noms et dates de ses projets).
 */
import { services, getState } from "../auth/session.js";
import { loadAiModule, appCheckEnabled } from "../core/firebase.js";
import { APP_CONFIG } from "../config/app-config.js";
import { withTimeout, nxError } from "../core/errors.js";
import { dayKey } from "../core/format.js";
import { isAdmin, licenseState } from "../core/permissions.js";
import { makeProvider } from "./provider.js";
import "./providers/firebase-ai-logic.js";
import * as byok from "./providers/byok.js";
import { INJECTION_GUARD, sanitizeUntrusted } from "./byok.js";
import { DEFAULT_SETTINGS, dailyLimitFor, parseAxionResponse, systemPrompt } from "./protocol.js";
import * as repo from "../data/repo.js";

let settings = null, settingsErr = null, lastTest = null, byokOn = false;

/* Clé personnelle : mode local (voir docs/AXION-CLE-PERSONNELLE.md). */
export const byokStore = byok;
export async function refreshByok() { const st = getState(); byokOn = !!(st.user && await byok.hasConfig(st.user.uid).catch(() => false)); return byokOn; }
export const usingByok = () => byokOn;

export async function loadSettings(force = false) {
  if (settings && !force) return settings;
  try {
    const s = await repo.getAxionConfig();
    settings = s ? { ...DEFAULT_SETTINGS, ...s, dailyLimit: { ...DEFAULT_SETTINGS.dailyLimit, ...(s.dailyLimit || {}) } } : { ...DEFAULT_SETTINGS, missing: true };
    settingsErr = null;
  } catch (e) { settingsErr = e; settings = null; }
  return settings;
}

/* État lisible : off (non activé), error (réglage illisible), ready (activé, non testé), ok / failing (dernier test). */
export function status() {
  if (settingsErr) return { state: "error", code: settingsErr.code || "unknown" };
  if (!settings) return { state: "loading" };
  if (byokOn) return { state: lastTest ? (lastTest.ok ? "ok" : "failing") : "ready", backend: "byok", model: "clé personnelle", detail: lastTest && lastTest.detail, at: lastTest && lastTest.at };
  if (!settings.enabled) return { state: "off", missing: !!settings.missing };
  const base = { backend: settings.backend, model: settings.model, appCheck: appCheckEnabled() };
  if (lastTest) return { state: lastTest.ok ? "ok" : "failing", ...base, detail: lastTest.detail, at: lastTest.at };
  return { state: "ready", ...base };
}

function quotaInfo() {
  const st = getState();
  const licensed = (st.licenses || []).some((l) => licenseState(l) === "active");
  return { uid: st.user.uid, limit: dailyLimitFor(settings, { admin: isAdmin(st.profile), licensed }) };
}

export async function usageToday() {
  const { uid, limit } = quotaInfo();
  const used = await repo.getAiUsage(uid, dayKey());
  return { used, limit };
}

async function call({ prompt, json = true, signal, apps = [] }) {
  await loadSettings();
  await refreshByok();
  if (byokOn) {
    const st = getState();
    const p = makeProvider("byok", { uid: st.user.uid });
    return withTimeout(p.generate({ system: systemPrompt({ firstName: sanitizeUntrusted(st.profile.firstName, 40), apps }) + "\n" + INJECTION_GUARD, prompt, json, signal, settings }), APP_CONFIG.TIMEOUTS.ai, "nx/axion-unavailable");
  }
  if (!settings || !settings.enabled) throw nxError("nx/axion-off");
  const { uid, limit } = quotaInfo();
  const day = dayKey();
  const used = await repo.getAiUsage(uid, day);
  if (used >= limit) throw nxError("nx/axion-limit");
  const st = getState();
  const provider = makeProvider("firebase-ai-logic", { app: services().app, loadAi: loadAiModule });
  const text = await withTimeout(provider.generate({
    system: systemPrompt({ firstName: st.profile.firstName, apps }), prompt, json, signal, settings
  }), APP_CONFIG.TIMEOUTS.ai, "nx/axion-unavailable");
  await repo.bumpAiUsage(uid, day, used).catch((e) => console.warn("[Nexus] compteur AXION :", e.code || e));
  return text;
}

/* Test de connexion réel (petite demande). Le résultat est affiché tel quel, réussite ou échec. */
export async function testConnection() {
  try {
    const t = await call({ prompt: 'Réponds exactement {"reply":"AXION est opérationnel."}', json: true });
    const r = parseAxionResponse(t);
    lastTest = { ok: true, at: Date.now(), detail: r.reply };
  } catch (e) {
    lastTest = { ok: false, at: Date.now(), detail: e.detail || e.code };
    throw e;
  }
  return lastTest;
}

/* Demande à AXION. ctx : { question, items (métadonnées transmises), connectedApps, signal } */
export async function ask({ question, items = [], connectedApps = [], signal }) {
  const known = new Map(items.map((i) => [i.appId + "|" + i.id, i]));
  const listing = items.length ? "\n\n<donnees>\nÉléments transmis (métadonnées uniquement) :\n" + items.map((i) => `- app=${sanitizeUntrusted(i.appId, 40)} id=${sanitizeUntrusted(i.id, 120)} nom="${String(i.name).replace(/"/g, "'")}" modifié=${i.updatedAt ? new Date(i.updatedAt).toISOString().slice(0, 10) : "?"}${i.shared ? " partagé" : ""}`).join("\n") + "\n</donnees>" : "";
  const text = await call({ prompt: `Demande : ${question}${listing}`, signal, apps: connectedApps });
  return parseAxionResponse(text, { known, connectedApps });
}

/* Résumé pour l'étape « Résumé par AXION » des automatisations. */
export async function summarize({ instruction, digest, connectedApps = [], signal }) {
  const text = await call({ prompt: `Demande : ${instruction}\n\nÉléments (métadonnées uniquement) :\n${digest || "(aucun élément)"}`, signal, apps: connectedApps });
  const r = parseAxionResponse(text);
  return r.reply;
}

export const currentSettings = () => settings;
