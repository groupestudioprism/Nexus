/* EXEMPLE — copier les valeurs utiles dans src/config/app-config.js. Ce fichier ne contient et ne doit contenir AUCUN secret :
 * tout ce qui est ici est envoyé tel quel au navigateur de chaque visiteur.
 */
export const APP_CONFIG = Object.freeze({
  FIREBASE_SDK: "13.0.0",
  SITE_URL: "https://groupestudioprism.github.io/Studio-Prism/",
  /* Firebase App Check (console Firebase → App Check → Applications → Web) :
   *  - "recaptcha-v3"         clé de site reCAPTCHA v3 (gratuit, quotas Google)
   *  - "recaptcha-enterprise" clé reCAPTCHA Enterprise (offre gratuite limitée, puis payant : à valider avant usage)
   * La clé de SITE est publique. La clé SECRÈTE reCAPTCHA se saisit uniquement dans la console Firebase, jamais ici. */
  APP_CHECK: Object.freeze({ provider: "recaptcha-v3", siteKey: "VOTRE_CLE_DE_SITE_RECAPTCHA" }),
  EMULATORS: Object.freeze({ auth: "http://127.0.0.1:9099", firestoreHost: "127.0.0.1", firestorePort: 8080 }),
  TIMEOUTS: Object.freeze({ auth: 35000, firestore: 15000, query: 20000, ai: 60000 })
});
