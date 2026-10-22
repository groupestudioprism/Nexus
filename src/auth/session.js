/* Nexus — session Studio Prism (Firebase Authentication + profil Firestore users/{uid}).
 *
 * Même logique de compte que le site Studio Prism (js/auth.js) et les applications :
 *  - Firebase Authentication (e-mail + mot de passe) du projet « archivision-studioprism » ;
 *  - profil users/{uid} : firstName, lastName, email, accountKind (individual/company), subscription, role (user/admin),
 *    status (active/suspended/pending), et pour une entreprise companyId/companyName…, pour une organisation orgId/orgName/orgRole ;
 *  - un compte « suspended », « pending » (entreprise non validée) ou sans profil n'entre pas : la session est refermée avec un
 *    message clair (pas de boucle de redirection) ;
 *  - Nexus NE CRÉE PAS de compte et NE MODIFIE PAS le profil : l'inscription et la gestion du compte restent sur le site Studio
 *    Prism (pas de second système de comptes). Nexus lit le profil et les licences de l'utilisateur, rien d'autre.
 *
 * Ce module ne dessine rien : l'interface s'abonne avec subscribe().
 */
import { firebase } from "../core/firebase.js";
import { APP_CONFIG } from "../config/app-config.js";
import { nxError, withTimeout } from "../core/errors.js";

/* status : "loading" | "out" | "in" | "error" (authentifié mais profil illisible) */
let state = { status: "loading", user: null, profile: null, licenses: [], notice: null };
const listeners = new Set();
let fb = null, seq = 0, pendingNotice = null, explicitOut = false, unwatch = null, wasIn = false;

const emit = (next) => {
  state = next;
  if (next.status === "in") wasIn = true;
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
};
export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }

/* Lecture du profil : chaque cas d'échec a son propre code (et donc son propre message). */
async function readProfile(user) {
  const { db, F } = fb;
  let snap;
  try {
    snap = await withTimeout(F.getDoc(F.doc(db, "users", user.uid)), APP_CONFIG.TIMEOUTS.firestore, "app/firestore-timeout");
  } catch (err) { err.step = "firestore"; throw err; }
  if (!snap.exists()) throw nxError("app/account-deleted");
  const d = snap.data();
  if (d.status === "pending") throw nxError("app/pending");
  if (d.status === "suspended") throw nxError("app/suspended");
  if (d.status !== "active") throw nxError("app/profile-invalid");
  return { uid: user.uid, ...d };
}

/* Licences de l'utilisateur (licenses/{uid}_{produit}) : les règles n'autorisent que `where userId == uid`. */
async function readLicenses(uid) {
  const { db, F } = fb;
  try {
    const q = F.query(F.collection(db, "licenses"), F.where("userId", "==", uid));
    const s = await withTimeout(F.getDocs(q), APP_CONFIG.TIMEOUTS.query);
    return s.docs.map((x) => ({ id: x.id, ...x.data() }));
  } catch (e) {
    console.warn("[Nexus] licences illisibles :", e.code || e);
    return null;   // null = inconnu (différent de « aucune licence »)
  }
}

const FATAL = new Set(["app/suspended", "app/pending", "app/account-deleted", "app/profile-invalid"]);

/* Surveillance du profil pendant la session : désactivation ou suppression par l'administration → déconnexion immédiate. */
function watchProfile(uid) {
  stopWatch();
  const { db, F } = fb;
  try {
    unwatch = F.onSnapshot(F.doc(db, "users", uid), (snap) => {
      if (!fb.auth.currentUser || fb.auth.currentUser.uid !== uid) return;
      const d = snap.exists() ? snap.data() : null;
      const code = !d ? "app/account-deleted" : d.status === "suspended" ? "app/suspended" : d.status === "pending" ? "app/pending" : d.status !== "active" ? "app/profile-invalid" : "";
      if (code) { forceOut(code); return; }
      if (state.status === "in") emit({ ...state, profile: { uid, ...d } });   // rôle ou nom modifié par l'administration
    }, () => { /* une erreur de surveillance n'interrompt pas la session */ });
  } catch (e) { unwatch = null; }
}
function stopWatch() { if (unwatch) { try { unwatch(); } catch (e) { /* rien */ } } unwatch = null; }

async function forceOut(code) {
  pendingNotice = code;
  stopWatch();
  await fb.A.signOut(fb.auth).catch(() => {});
}

async function loadUser(user) {
  const mine = ++seq;
  try {
    const profile = await readProfile(user);
    if (mine !== seq) return;
    const licenses = await readLicenses(user.uid);
    if (mine !== seq) return;
    emit({ status: "in", user: { uid: user.uid, email: user.email, emailVerified: !!user.emailVerified }, profile, licenses, notice: null });
    watchProfile(user.uid);
  } catch (err) {
    if (mine !== seq) return;
    if (FATAL.has(err.code)) return forceOut(err.code);
    console.error("[Nexus] profil illisible :", err.code || err);
    emit({ status: "error", user: { uid: user.uid, email: user.email }, profile: null, licenses: [], notice: err.code || "unknown" });
  }
}

/* Démarrage : charge le SDK et écoute l'état de connexion (session restaurée, autre onglet, expiration). */
export async function start() {
  try {
    fb = await firebase();
  } catch (err) {
    emit({ status: "error", user: null, profile: null, licenses: [], notice: err.code || "app/sdk-unavailable" });
    return;
  }
  fb.A.onAuthStateChanged(fb.auth, (user) => {
    if (!user) {
      seq++;
      stopWatch();
      // Déconnexion sans action de la personne alors qu'elle était connectée = session expirée ou révoquée.
      const notice = pendingNotice || (wasIn && !explicitOut ? "app/session-expired" : null);
      pendingNotice = null; explicitOut = false; wasIn = false;
      emit({ status: "out", user: null, profile: null, licenses: [], notice });
      return;
    }
    if (manual > 0) return;   // signIn() traite lui-même l'arrivée de l'utilisateur
    loadUser(user);
  });
}

/* Session expirée ou révoquée (mot de passe changé, compte supprimé ou désactivé dans Authentication) : le jeton ne se renouvelle
 * plus. Vérifié au retour sur l'onglet et toutes les 5 minutes ; la personne est alors déconnectée avec un message explicite. */
const DEAD_TOKEN = new Set(["auth/invalid-refresh-token", "auth/user-token-expired", "auth/user-not-found", "auth/user-disabled", "auth/id-token-expired", "auth/invalid-user-token"]);
let lastForced = 0;
export async function checkSession() {
  if (!fb || !fb.auth.currentUser || state.status !== "in") return true;
  const force = Date.now() - lastForced > 10 * 60 * 1000;   // renouvellement réel au plus toutes les 10 minutes
  try { await fb.auth.currentUser.getIdToken(force); if (force) lastForced = Date.now(); return true; }
  catch (e) {
    if (DEAD_TOKEN.has(e && e.code)) { await forceOut("app/session-expired"); return false; }
    return true;   // simple coupure réseau : la session reste ouverte
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => { checkSession(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkSession(); });
  setInterval(() => { checkSession(); }, 5 * 60 * 1000);
}

let manual = 0;
export async function signIn({ email, password, remember = true }) {
  if (!fb) fb = await firebase();
  manual++;
  try {
    await fb.A.setPersistence(fb.auth, remember ? fb.A.browserLocalPersistence : fb.A.browserSessionPersistence);
    const cred = await withTimeout(fb.A.signInWithEmailAndPassword(fb.auth, String(email).trim(), password), APP_CONFIG.TIMEOUTS.auth, "app/auth-timeout");
    try {
      seq++;
      const profile = await readProfile(cred.user);
      const licenses = await readLicenses(cred.user.uid);
      emit({ status: "in", user: { uid: cred.user.uid, email: cred.user.email, emailVerified: !!cred.user.emailVerified }, profile, licenses, notice: null });
      watchProfile(cred.user.uid);
      return state;
    } catch (err) {
      // Authentification réussie mais profil inutilisable : la session est refermée (pas d'état à moitié connecté).
      if (FATAL.has(err.code)) pendingNotice = err.code;
      explicitOut = !FATAL.has(err.code);
      await fb.A.signOut(fb.auth).catch(() => {});
      throw err;
    }
  } finally {
    manual--;
  }
}

export async function signOutUser() {
  if (!fb) return;
  explicitOut = true;
  stopWatch();
  await fb.A.signOut(fb.auth);
}

/* Même réponse que l'adresse existe ou non (ne révèle pas quels e-mails ont un compte). */
export async function resetPassword(email) {
  if (!fb) fb = await firebase();
  try { await fb.A.sendPasswordResetEmail(fb.auth, String(email).trim()); }
  catch (err) { if (err && err.code === "auth/user-not-found") return; throw err; }
}

/* Relit profil et licences (bouton « Réessayer », retour d'une page de licence…). */
export async function refresh() {
  if (!fb || !fb.auth.currentUser) return;
  emit({ ...state, status: state.status === "in" ? "in" : "loading" });
  await loadUser(fb.auth.currentUser);
}

export const services = () => fb;
