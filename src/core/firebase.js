/* Nexus — point d'entrée UNIQUE du SDK Firebase.
 *
 * - SDK modulaire chargé depuis le CDN officiel de Google (www.gstatic.com), sans outil de build : compatible GitHub Pages.
 *   La version est définie à un seul endroit (src/config/app-config.js).
 * - Même projet Firebase que le site Studio Prism et ses applications : mêmes comptes, mêmes règles Firestore.
 * - Servi depuis groupestudioprism.github.io (même origine que le site Studio Prism), Nexus partage la session Firebase du site :
 *   une personne déjà connectée au site (« Se souvenir de moi ») l'est aussi dans Nexus.
 * - Émulateurs : seulement sur localhost avec ?emu=1 (tests). Jamais en production.
 */
import { firebaseConfig } from "../config/firebase-config.js";
import { APP_CONFIG } from "../config/app-config.js";

const BASE = `https://www.gstatic.com/firebasejs/${APP_CONFIG.FIREBASE_SDK}/`;
let booting = null;

export function emulatorMode() {
  try {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    return local && new URLSearchParams(location.search).get("emu") === "1";
  } catch (e) { return false; }
}

/* Charge le SDK une seule fois et renvoie { app, auth, db, A (fonctions Auth), F (fonctions Firestore), core }. */
export function firebase() {
  if (!booting) {
    booting = (async () => {
      const [core, A, F] = await Promise.all([
        import(BASE + "firebase-app.js"),
        import(BASE + "firebase-auth.js"),
        import(BASE + "firebase-firestore.js")
      ]);
      const emu = emulatorMode();
      const config = emu ? { ...firebaseConfig, projectId: "demo-nexus" } : firebaseConfig;
      const app = core.initializeApp(config);
      const auth = A.getAuth(app);
      auth.languageCode = "fr";
      const db = F.getFirestore(app);
      if (emu) {
        A.connectAuthEmulator(auth, APP_CONFIG.EMULATORS.auth, { disableWarnings: true });
        F.connectFirestoreEmulator(db, APP_CONFIG.EMULATORS.firestoreHost, APP_CONFIG.EMULATORS.firestorePort);
        window.__nexusTest = { auth };   // tests de bout en bout uniquement (émulateurs locaux) : jamais défini en production
      }
      await initAppCheck(app, emu);
      return { app, auth, db, A, F, core, emu };
    })().catch((err) => {
      booting = null;   // nouvel essai possible (réseau revenu)
      throw Object.assign(new Error("sdk"), { code: "app/sdk-unavailable", cause: err });
    });
  }
  return booting;
}

/* Firebase App Check (facultatif tant qu'aucune clé n'est configurée). Clé de SITE uniquement : publique. */
let appCheckReady = false;
async function initAppCheck(app, emu) {
  const { provider, siteKey } = APP_CONFIG.APP_CHECK;
  if (emu || !provider || !siteKey) return;
  try {
    const C = await import(BASE + "firebase-app-check.js");
    const P = provider === "recaptcha-enterprise" ? new C.ReCaptchaEnterpriseProvider(siteKey) : new C.ReCaptchaV3Provider(siteKey);
    C.initializeAppCheck(app, { provider: P, isTokenAutoRefreshEnabled: true });
    appCheckReady = true;
  } catch (e) {
    console.warn("[Nexus] App Check non initialisé :", e && e.message);
  }
}
export const appCheckEnabled = () => appCheckReady;

/* Module Firebase AI Logic, chargé à la première demande seulement (aucun coût au démarrage). */
let aiModule = null;
export function loadAiModule() {
  if (!aiModule) aiModule = import(BASE + "firebase-ai.js").catch((e) => { aiModule = null; throw e; });
  return aiModule;
}
