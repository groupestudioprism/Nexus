/* Fournisseur AXION « clé personnelle » : appel direct navigateur → fournisseur choisi. La clé est chiffrée localement (AES-GCM,
 * clé non extractible en IndexedDB, par compte) ; elle n'est jamais envoyée à Nexus/Firestore ni écrite dans les journaux. */
import { buildRequest, extractText, redactKey, validateConfig, checkRate } from "../byok.js";
import { registerProvider } from "../provider.js";

const DB = "nx-axion-byok", ST = "kv";
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const get = async (k) => { const d = await idb(); return new Promise((res, rej) => { const r = d.transaction(ST).objectStore(ST).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
const put = async (k, v) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST, "readwrite"); v === undefined ? t.objectStore(ST).delete(k) : t.objectStore(ST).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };

async function cryptoKey(uid) {
  let k = await get("ck:" + uid);
  if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await put("ck:" + uid, k); }
  return k;
}
export async function saveConfig(uid, cfg) {
  const errs = validateConfig(cfg); if (errs.length) throw Object.assign(new Error(errs[0]), { code: "nx/axion-config" });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(uid), new TextEncoder().encode(JSON.stringify(cfg)));
  await put("cfg:" + uid, { iv, data });
}
export async function loadConfig(uid) {
  const r = await get("cfg:" + uid); if (!r) return null;
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: r.iv }, await cryptoKey(uid), r.data))); } catch (x) { return null; }
}
export async function clearConfig(uid) { await put("cfg:" + uid, undefined); await put("ck:" + uid, undefined); await put("rate:" + uid, undefined); }
export async function hasConfig(uid) { return !!(await get("cfg:" + uid)); }

export function createByokProvider({ uid, signal: _s }) {
  return {
    id: "byok",
    async generate({ system, prompt, json, signal }) {
      const cfg = await loadConfig(uid);
      if (!cfg) throw Object.assign(new Error("config"), { code: "nx/axion-off" });
      const now = Date.now(), ts = ((await get("rate:" + uid)) || []).filter((t) => now - t < 86400000);
      const rate = checkRate(ts, now);
      if (!rate.ok) throw Object.assign(new Error("rate"), { code: "nx/axion-limit" });
      await put("rate:" + uid, [...ts, now]);
      const q = buildRequest(cfg, { system, prompt, json });
      try {
        const res = await fetch(q.url, { method: "POST", headers: q.headers, body: JSON.stringify(q.body), signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
        if (!res.ok) throw Object.assign(new Error("http"), { code: "nx/axion-unavailable", detail: `Le fournisseur a répondu ${res.status}.` });
        return extractText(cfg.provider, await res.json());
      } catch (e) {
        if (e.code) throw e;
        if (e.name === "AbortError") throw e;
        throw Object.assign(new Error("net"), { code: "nx/axion-unavailable", detail: redactKey(e.message, cfg.key) });
      }
    }
  };
}
registerProvider("byok", createByokProvider);
