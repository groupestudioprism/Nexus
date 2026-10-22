/* Petits outils DOM sans dépendance.
 *
 * html`…` construit du HTML en ÉCHAPPANT toutes les valeurs insérées : une donnée venue de Firestore, d'une application
 * connectée ou d'AXION n'est jamais interprétée comme du HTML. Seul raw() (réservé au code de Nexus : icônes, fragments déjà
 * construits avec html``) insère du HTML tel quel.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

function part(v) {
  if (v == null || v === false) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function mount(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content);
  return el;
}

/* Délégation d'événements : <button data-act="save"> → handlers.save(event, element). */
export function delegate(root, handlers, type = "click") {
  const fn = (e) => {
    const t = e.target.closest && e.target.closest("[data-act]");
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.act];
    if (!h) return;
    if (t.tagName === "A" && t.getAttribute("href") === "#") e.preventDefault();
    h(e, t);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

/* Texte brut extrait d'un fragment HTML NON fiable (aperçu d'un document SPECTRA, par exemple) — sans jamais l'insérer dans la page. */
export function textOf(untrustedHtml, max = 240) {
  const doc = new DOMParser().parseFromString(String(untrustedHtml || ""), "text/html");
  const t = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function announce(msg) {
  const live = document.getElementById("nx-live");
  if (live) { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); }
}
