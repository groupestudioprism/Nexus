/* Catalogue des étapes d'automatisation — définitions PURES (aucune dépendance au navigateur ni à Firebase).
 *
 * Chaque étape déclare : ce qu'elle consomme (needs) et produit (gives) dans le contexte d'exécution, les autorisations Nexus
 * qu'elle exige, si elle peut être relancée sans risque (retryable), et la validation de sa configuration.
 * L'exécution réelle est dans engine.js, qui reçoit les services (connecteurs, AXION…) par injection.
 */
import { appById, dataApps } from "../connectors/registry.js";

const str = (v, max) => typeof v === "string" && v.length <= max;
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export const STEP_TYPES = Object.freeze({
  collect: {
    label: "Récupérer des projets et documents",
    short: "Récupérer",
    kind: "source",
    gives: ["items"],
    retryable: true,
    describe: (c) => `Depuis ${(c.apps || []).map((a) => appById(a)?.name || a).join(", ") || "—"}${c.includeShared ? ", partages compris" : ""}`,
    defaults: () => ({ apps: dataApps().filter((a) => a.family === "archi").map((a) => a.id), includeShared: false, max: 100 }),
    scopes: (c) => (c.apps || []).flatMap((a) => c.includeShared ? [[a, "projects.read"], [a, "shared.read"]] : [[a, "projects.read"]]),
    validate(c) {
      const e = [];
      if (!Array.isArray(c.apps) || !c.apps.length) e.push("Choisissez au moins une application.");
      else if (c.apps.some((a) => !appById(a) || !appById(a).cloud)) e.push("Application inconnue ou sans données.");
      if (typeof c.includeShared !== "boolean") e.push("Option « partages » invalide.");
      if (!int(c.max, 1, 300)) e.push("Le nombre maximal doit être compris entre 1 et 300.");
      return e;
    }
  },
  filter: {
    label: "Filtrer",
    short: "Filtrer",
    kind: "transform",
    needs: ["items"],
    gives: ["items"],
    retryable: true,
    describe: (c) => [c.days ? `modifiés depuis ${c.days} j` : "", c.contains ? `nom contenant « ${c.contains} »` : ""].filter(Boolean).join(", ") || "Aucun filtre",
    defaults: () => ({ days: 30, contains: "" }),
    validate(c) {
      const e = [];
      if (!int(c.days, 0, 3650)) e.push("La période doit être comprise entre 0 (toutes) et 3 650 jours.");
      if (!str(c.contains, 60)) e.push("Le texte recherché est limité à 60 caractères.");
      return e;
    }
  },
  summarize: {
    label: "Résumé par AXION",
    short: "AXION",
    kind: "ai",
    needs: ["items"],
    gives: ["summary"],
    retryable: true,
    describe: (c) => c.instruction ? `« ${c.instruction.slice(0, 60)}${c.instruction.length > 60 ? "…" : ""} »` : "Synthèse de l'activité",
    defaults: () => ({ instruction: "Fais une synthèse courte de l'activité : ce qui a avancé, ce qui semble en attente." }),
    validate(c) { return str(c.instruction, 400) && c.instruction.trim() ? [] : ["L'instruction est obligatoire (400 caractères au plus)."]; }
  },
  report: {
    label: "Composer un rapport",
    short: "Rapport",
    kind: "transform",
    needs: ["items"],
    gives: ["report"],
    retryable: true,
    describe: (c) => `« ${c.title || "Rapport"} »`,
    defaults: () => ({ title: "Rapport d'activité des projets", groupByApp: true }),
    validate(c) {
      const e = [];
      if (!str(c.title, 120) || !c.title.trim()) e.push("Le titre est obligatoire (120 caractères au plus).");
      if (typeof c.groupByApp !== "boolean") e.push("Option de regroupement invalide.");
      return e;
    }
  },
  confirm: {
    label: "Demander ma confirmation",
    short: "Confirmation",
    kind: "control",
    retryable: true,
    describe: (c) => c.message || "Vérifier avant de continuer",
    defaults: () => ({ message: "Vérifiez le rapport avant sa création dans SPECTRA Writer." }),
    validate(c) { return str(c.message, 200) ? [] : ["Le message est limité à 200 caractères."]; }
  },
  writer: {
    label: "Créer un document SPECTRA Writer",
    short: "SPECTRA Writer",
    kind: "action",
    needs: ["report"],
    gives: ["document"],
    retryable: true,       // idempotent : identifiant choisi à l'avance, jamais de doublon
    sensitive: true,       // écrit dans une application : confirmation obligatoire avant
    describe: () => "Nouveau document dans votre espace SPECTRA Writer",
    defaults: () => ({}),
    scopes: () => [["spectrawriter", "documents.create"]],
    validate() { return []; }
  }
});

export const STEP_ORDER = ["collect", "filter", "summarize", "report", "confirm", "writer"];
export const MAX_STEPS = 10;

export function newStep(type, id) {
  const t = STEP_TYPES[type];
  if (!t) throw new Error("type inconnu");
  return { id: id || `${type}-${Math.random().toString(36).slice(2, 8)}`, type, config: t.defaults() };
}

/* Autorisations Nexus nécessaires à tout le workflow : [[appId, scope], …] sans doublon. */
export function requiredScopes(steps) {
  const seen = new Set(), out = [];
  for (const s of steps || []) {
    const t = STEP_TYPES[s.type];
    if (!t || !t.scopes) continue;
    for (const [a, sc] of t.scopes(s.config || {})) {
      const k = a + "|" + sc;
      if (!seen.has(k)) { seen.add(k); out.push([a, sc]); }
    }
  }
  return out;
}
