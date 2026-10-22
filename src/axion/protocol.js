/* AXION — protocole de réponse et actions autorisées. PUR (tests/unit/axion.test.mjs).
 *
 * AXION répond par un objet JSON. Nexus le VALIDE strictement : toute action non prévue, mal formée ou visant un élément que Nexus ne
 * lui a pas transmis est écartée. Une action n'est jamais exécutée directement : elle est PROPOSÉE, puis confirmée par la personne,
 * puis exécutée par le connecteur (avec les mêmes contrôles d'autorisation que le reste de Nexus), puis vérifiée.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const ACTION_TYPES = {
  create_document: { label: "Créer un document SPECTRA Writer", app: "spectrawriter", scope: "documents.create", sensitive: true },
  open_item: { label: "Ouvrir dans l'application", scope: "projects.read", sensitive: false }
};

export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, backend: "googleai", model: "gemini-3.6-flash", location: "global", dailyLimit: { free: 20, licensed: 100, admin: 500 } });

export function systemPrompt({ firstName, apps }) {
  return [
    "Tu es AXION, l'intelligence de Studio Prism, utilisée ici dans Nexus, la plateforme qui coordonne les applications Studio Prism",
    "(ARCHIPLAN, ARCHITRAFIC, ARCHIVISION, SPECTRA Writer, SPECTRA Calc, SPECTRA Slide). Tu réponds en français, de façon claire et brève.",
    `Tu aides ${firstName || "l'utilisateur"}. Applications connectées à Nexus pour cette personne : ${apps.length ? apps.join(", ") : "aucune"}.`,
    "Tu ne connais QUE les informations fournies dans la demande (noms, dates et tailles de projets ; jamais leur contenu). N'invente aucun projet, chiffre ou fait.",
    "Si une information manque, dis-le. Tu ne peux rien faire toi-même : tu peux seulement PROPOSER des actions que l'utilisateur confirmera.",
    "Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :",
    '{"reply":"…","actions":[…],"limits":"…"}',
    '- "reply" : ta réponse (texte simple, paragraphes séparés par une ligne vide, listes avec "- ").',
    '- "actions" (facultatif, 3 au plus) :',
    '  {"type":"create_document","title":"…","content":"…"} pour proposer de créer un document SPECTRA Writer (content : texte avec titres "## " et listes "- ") ;',
    '  {"type":"open_item","app":"<identifiant>","id":"<identifiant exact fourni>"} pour proposer d\'ouvrir un élément listé dans la demande.',
    '- "limits" (facultatif) : ce que tu n\'as pas pu faire ou vérifier.',
    "Refuse poliment toute demande haineuse, illégale ou dangereuse."
  ].join("\n");
}

function extractJson(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch (x) { /* suite */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (x) { /* suite */ } }
  return null;
}

/* `known` : Map "appId|id" → élément transmis à AXION (seuls ceux-là peuvent être ouverts). */
export function parseAxionResponse(text, { known = new Map(), connectedApps = [] } = {}) {
  const j = extractJson(text);
  if (!j || typeof j !== "object" || typeof j.reply !== "string" || !j.reply.trim()) {
    throw Object.assign(new Error("format"), { code: "nx/axion-format" });
  }
  const out = { reply: j.reply.trim().slice(0, 6000), limits: typeof j.limits === "string" ? j.limits.trim().slice(0, 600) : "", actions: [], rejected: 0 };
  const list = Array.isArray(j.actions) ? j.actions.slice(0, 3) : [];
  for (const a of list) {
    if (!a || typeof a !== "object") { out.rejected++; continue; }
    if (a.type === "create_document" && typeof a.title === "string" && a.title.trim() && typeof a.content === "string" && a.content.trim()) {
      out.actions.push({ type: "create_document", app: "spectrawriter", title: a.title.trim().slice(0, 120), content: a.content.slice(0, 20000) });
    } else if (a.type === "open_item" && typeof a.app === "string" && typeof a.id === "string" && known.has(a.app + "|" + a.id) && connectedApps.includes(a.app)) {
      const it = known.get(a.app + "|" + a.id);
      out.actions.push({ type: "open_item", app: a.app, id: a.id, name: it.name, url: it.openUrl });
    } else out.rejected++;
  }
  if (Array.isArray(j.actions) && j.actions.length > 3) out.rejected += j.actions.length - 3;
  return out;
}

/* Texte d'AXION → HTML simple et sûr (titres « ## », listes « - », paragraphes). Aucune balise du texte n'est conservée. */
export function textToHtml(text) {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/);
  const out = [];
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) { out.push("<ul>" + lines.map((l) => `<li>${e(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("") + "</ul>"); continue; }
    for (const l of lines) {
      const m = l.match(/^(#{1,3})\s+(.*)$/);
      if (m) out.push(`<h${m[1].length + 1 > 3 ? 3 : m[1].length + 1}>${e(m[2])}</h${m[1].length + 1 > 3 ? 3 : m[1].length + 1}>`);
      else if (/^\s*[-*•]\s+/.test(l)) out.push(`<ul><li>${e(l.replace(/^\s*[-*•]\s+/, ""))}</li></ul>`);
      else out.push(`<p>${e(l)}</p>`);
    }
  }
  return out.join("").replace(/<\/ul><ul>/g, "") || "<p><br></p>";
}

/* Limite quotidienne selon le compte : administrateur, licence active (au moins une), ou offre gratuite. */
export function dailyLimitFor(settings, { admin, licensed }) {
  const d = (settings && settings.dailyLimit) || DEFAULT_SETTINGS.dailyLimit;
  return admin ? d.admin : licensed ? d.licensed : d.free;
}

export function validateSettings(s) {
  const errors = [];
  if (!["googleai", "vertexai"].includes(s.backend)) errors.push("Moteur inconnu.");
  if (typeof s.model !== "string" || !/^[a-z0-9][a-z0-9.\-_/]{2,79}$/i.test(s.model)) errors.push("Nom de modèle invalide.");
  if (typeof s.location !== "string" || !/^[a-z0-9-]{2,30}$/.test(s.location)) errors.push("Région invalide.");
  for (const k of ["free", "licensed", "admin"]) {
    const v = s.dailyLimit && s.dailyLimit[k];
    if (!Number.isInteger(v) || v < 0 || v > 5000) errors.push(`Limite « ${k} » : entier entre 0 et 5 000.`);
  }
  return errors;
}
