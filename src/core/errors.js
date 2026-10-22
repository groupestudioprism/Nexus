/* Messages d'erreur en français. Les messages bruts de Firebase ne sont jamais affichés (même principe que le site Studio Prism). */
const MESSAGES = {
  // Authentication
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "E-mail ou mot de passe incorrect.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/missing-password": "Saisissez votre mot de passe.",
  "auth/user-disabled": "Ce compte de connexion a été désactivé. Contactez Studio Prism.",
  "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  "auth/network-request-failed": "Connexion impossible : vérifiez votre connexion internet, puis réessayez.",
  "auth/requires-recent-login": "Pour des raisons de sécurité, reconnectez-vous puis recommencez.",
  "auth/user-token-expired": "Votre session a expiré. Reconnectez-vous.",
  "auth/id-token-expired": "Votre session a expiré. Reconnectez-vous.",
  "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase Authentication (domaines autorisés).",
  "app/auth-timeout": "Firebase Authentication ne répond pas. Vérifiez votre connexion, puis réessayez.",
  // Profil Studio Prism
  "app/firestore-timeout": "Authentification réussie, mais la lecture de votre profil Studio Prism ne répond pas. Réessayez dans un instant.",
  "app/profile-invalid": "Votre profil Studio Prism est incomplet. Contactez Studio Prism.",
  "app/suspended": "Ce compte est désactivé. Contactez Studio Prism pour le réactiver.",
  "app/pending": "Votre compte Entreprise est en attente de validation par Studio Prism. Vous recevrez l'accès dès sa validation.",
  "app/account-deleted": "Ce compte Studio Prism n'existe plus. Vous pouvez en créer un nouveau sur le site Studio Prism.",
  "app/session-expired": "Votre session a expiré. Reconnectez-vous pour continuer.",
  "app/sdk-unavailable": "Les services Firebase n'ont pas pu être chargés (connexion internet, bloqueur de contenus ou pare-feu).",
  // Firestore
  "permission-denied": "Accès refusé par les règles de sécurité. Si cela persiste, les règles Firestore de Nexus ne sont peut-être pas encore publiées.",
  "unavailable": "Le service est momentanément injoignable. Vérifiez votre connexion, puis réessayez.",
  "deadline-exceeded": "Le service met trop de temps à répondre. Réessayez.",
  "not-found": "Élément introuvable : il a peut-être été supprimé.",
  "failed-precondition": "Opération impossible dans l'état actuel. Rechargez la page et réessayez.",
  "resource-exhausted": "Quota atteint. Réessayez plus tard.",
  "unauthenticated": "Vous devez être connecté.",
  "app/timeout": "Le service met trop de temps à répondre. Réessayez.",
  "app/offline": "Vous êtes hors ligne. Les données affichées peuvent être incomplètes.",
  // Nexus
  "nx/not-connected": "Cette application n'est pas connectée à Nexus. Autorisez-la depuis Connexions.",
  "nx/scope-missing": "Cette autorisation n'a pas été accordée à Nexus pour cette application.",
  "nx/quota-or-denied": "Écriture refusée : quota de stockage de l'application atteint, ou accès refusé.",
  "nx/too-big": "Contenu trop volumineux pour l'application cible.",
  "nx/invalid": "Données invalides.",
  "nx/cancelled": "Opération annulée.",
  "nx/axion-off": "AXION n'est pas configuré. Un administrateur doit l'activer (Administration → AXION).",
  "nx/axion-limit": "Limite quotidienne de demandes à AXION atteinte. Le compteur repart demain.",
  "nx/axion-unavailable": "AXION n'a pas pu répondre (service non activé dans la console Firebase, App Check manquant ou quota atteint).",
  "nx/axion-format": "AXION a renvoyé une réponse inexploitable. Reformulez la demande.",
  "nx/not-verified": "L'opération a été envoyée mais son résultat n'a pas pu être vérifié."
};

export function errorCode(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  return err.code || err.name || "unknown";
}

export function errorMessage(err) {
  const c = errorCode(err);
  if (MESSAGES[c]) return MESSAGES[c];
  if (c.startsWith("auth/")) return "La connexion a échoué. Réessayez.";
  if (err && err.userMessage) return err.userMessage;
  return "Une erreur inattendue est survenue. Réessayez.";
}

export const nxError = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);

export const withTimeout = (promise, ms, code = "app/timeout") => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(nxError(code)), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});
