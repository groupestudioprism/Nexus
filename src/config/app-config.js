/* Réglages publics de Nexus (aucun secret). Copier src/config/app-config.example.js pour en documenter les valeurs.
 *
 * FIREBASE_SDK : version du SDK modulaire chargé depuis le CDN officiel (www.gstatic.com). 13.0.0 est la version déjà
 *                utilisée par l'IA des applications SPECTRA sur le même projet (firebase-ai).
 * APP_CHECK    : clé de site reCAPTCHA (publique) pour Firebase App Check. Vide = App Check non initialisé.
 *                Firebase annonce qu'App Check sera OBLIGATOIRE pour Firebase AI Logic à partir du 2 novembre 2026.
 */
export const APP_CONFIG = Object.freeze({
  FIREBASE_SDK: "13.0.0",
  SITE_URL: "https://groupestudioprism.github.io/Studio-Prism/",
  APP_CHECK: Object.freeze({ provider: "", siteKey: "" }),   // provider : "recaptcha-v3" | "recaptcha-enterprise" | ""
  /* Émulateurs Firebase : utilisés UNIQUEMENT si la page est servie depuis localhost/127.0.0.1 ET que l'adresse contient ?emu=1. */
  EMULATORS: Object.freeze({ auth: "http://127.0.0.1:9099", firestoreHost: "127.0.0.1", firestorePort: 8080 }),
  /* Délais par étape (même logique que le site Studio Prism : chaque dépassement a son propre message). */
  TIMEOUTS: Object.freeze({ auth: 35000, firestore: 15000, query: 20000, ai: 60000 })
});
