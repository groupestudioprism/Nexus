/* Permissions de Nexus — fonctions PURES (testées dans tests/unit/permissions.test.mjs).
 *
 * Trois niveaux, du plus fort au plus faible :
 *  1. Règles Firestore (serveur) : seules garantes de la sécurité. Rôle administrateur, données des autres comptes, données des
 *     applications : tout est vérifié par Google à chaque requête. Rien ici ne les remplace.
 *  2. Connexions Nexus (consentement) : ce que VOUS avez autorisé Nexus à faire avec chaque application. Nexus refuse d'utiliser
 *     une application ou une autorisation non accordée. Ce contrôle protège contre une action involontaire de Nexus ; il ne
 *     restreint pas vos propres droits sur vos données (vous gardez l'accès direct dans chaque application).
 *  3. Interface : masquer un bouton n'est qu'un confort ; chaque action repasse par ces fonctions puis par les règles.
 */
import { appById } from "../connectors/registry.js";

export const isActive = (profile) => !!profile && profile.status === "active";
export const isAdmin = (profile) => isActive(profile) && profile.role === "admin";

/* Licence d'un produit : active et non expirée. `now` injectable pour les tests. */
export function licenseState(license, now = Date.now()) {
  if (!license) return "none";
  if (license.status === "suspended") return "suspended";
  const exp = license.expiresAt ? (typeof license.expiresAt === "number" ? license.expiresAt : (license.expiresAt.toMillis ? license.expiresAt.toMillis() : 0)) : 0;
  if (license.status === "expired" || (exp && exp <= now)) return "expired";
  return license.status === "active" ? "active" : "none";
}

/* Connexion Nexus ↔ application : active et portant l'autorisation demandée. */
export function hasScope(connection, scope) {
  return !!connection && connection.status === "active" && Array.isArray(connection.scopes) && connection.scopes.includes(scope);
}

/* Autorisations qu'une application PEUT recevoir (définies dans le registre, jamais au-delà). */
export function grantableScopes(appId) {
  const app = appById(appId);
  return app ? app.scopes.slice() : [];
}

export function sanitizeScopes(appId, scopes) {
  const allowed = new Set(grantableScopes(appId));
  return Array.from(new Set((scopes || []).filter((s) => allowed.has(s))));
}

/* État affiché d'une application dans Nexus.
 * available     : fiche connue, pas d'intégration de données (ex. ARCHIVISION) ou rien à connecter
 * disconnected  : intégration possible, non autorisée
 * connecting    : autorisation en cours d'enregistrement
 * connected     : connexion active (et dernière vérification réussie si elle a eu lieu)
 * error         : la dernière vérification a échoué (règles, réseau…)
 * forbidden     : compte inactif ou accès refusé par les règles */
export function appStatus({ app, profile, connection, pending, lastCheck }) {
  if (!isActive(profile)) return "forbidden";
  if (pending) return "connecting";
  if (!app.cloud) return "available";
  if (!connection || connection.status !== "active") return "disconnected";
  if (lastCheck && lastCheck.ok === false) return lastCheck.code === "permission-denied" ? "forbidden" : "error";
  return "connected";
}

export const STATUS_LABEL = {
  available: "Disponible", disconnected: "Non connectée", connecting: "Connexion en cours",
  connected: "Connectée", error: "Erreur", forbidden: "Accès insuffisant"
};

/* Une action donnée est-elle permise à Nexus ? Renvoie { ok, reason } (reason = code d'erreur nx/…). */
export function canUse({ profile, connection, appId, scope }) {
  if (!isActive(profile)) return { ok: false, reason: "app/suspended" };
  const app = appById(appId);
  if (!app) return { ok: false, reason: "nx/invalid" };
  if (!app.scopes.includes(scope)) return { ok: false, reason: "nx/scope-missing" };
  if (!connection || connection.status !== "active") return { ok: false, reason: "nx/not-connected" };
  if (!hasScope(connection, scope)) return { ok: false, reason: "nx/scope-missing" };
  return { ok: true };
}

/* Niveau de risque d'une action : décide de la confirmation explicite. */
export function needsConfirmation(scope) {
  return scope === "documents.create";
}
