/* Composition d'un rapport (HTML simple compatible SPECTRA Writer) — PURE.
 * Toutes les valeurs (noms de projets, résumé d'AXION…) sont échappées : le rapport ne peut contenir aucune balise venue des données. */
import { appById } from "../connectors/registry.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const d = (ms) => ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";
const size = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`;

export function filterItems(items, { days = 0, contains = "" } = {}, now = Date.now()) {
  const min = days > 0 ? now - days * 864e5 : 0;
  const needle = String(contains || "").trim().toLowerCase();
  return items.filter((it) => (!min || (it.updatedAt || 0) >= min) && (!needle || String(it.name).toLowerCase().includes(needle)));
}

export function composeReport({ title, items, summary, groupByApp = true, author = "", now = Date.now() }) {
  const t = String(title || "Rapport").slice(0, 120);
  const parts = [`<h1>${e(t)}</h1>`, `<p class="sw-lead">Rapport préparé par Nexus le ${e(d(now))}${author ? ` pour ${e(author)}` : ""} · ${items.length} élément${items.length > 1 ? "s" : ""}.</p>`];
  const text = [t, `${items.length} élément(s)`];
  if (summary) {
    parts.push("<h2>Synthèse</h2>");
    String(summary).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 20).forEach((p) => { parts.push(`<p>${e(p).replace(/\n/g, "<br>")}</p>`); text.push(p); });
    parts.push(`<p><small>Synthèse rédigée par AXION à partir des noms et dates des éléments : à relire avant diffusion.</small></p>`);
  }
  const groups = groupByApp ? [...new Set(items.map((i) => i.appId))].map((a) => [a, items.filter((i) => i.appId === a)]) : [["", items]];
  for (const [appId, list] of groups) {
    if (!list.length) continue;
    parts.push(`<h2>${e(appId ? (appById(appId)?.name || appId) : "Éléments")}</h2>`);
    parts.push("<table class=\"sw-table t-zebra\"><thead><tr><th>Nom</th>" + (groupByApp ? "" : "<th>Application</th>") + "<th>Dernière modification</th><th>Taille</th></tr></thead><tbody>");
    for (const it of list) {
      parts.push(`<tr><td>${e(it.name)}${it.shared ? " <small>(partagé)</small>" : ""}</td>${groupByApp ? "" : `<td>${e(appById(it.appId)?.name || it.appId)}</td>`}<td>${e(d(it.updatedAt))}</td><td>${e(it.size ? size(it.size) : "—")}</td></tr>`);
      text.push(`${it.name} — ${d(it.updatedAt)}`);
    }
    parts.push("</tbody></table>");
  }
  if (!items.length) parts.push("<p>Aucun élément ne correspond aux critères de l'automatisation.</p>");
  return { title: t, html: parts.join(""), text: text.join("\n") };
}

/* Données transmises à AXION : uniquement des métadonnées (noms, application, dates, tailles), jamais le contenu des documents. */
export function itemsDigest(items, max = 80) {
  return items.slice(0, max).map((i) => `- [${appById(i.appId)?.name || i.appId}] ${i.name} · modifié ${d(i.updatedAt)}${i.shared ? " · partagé" : ""}`).join("\n");
}
