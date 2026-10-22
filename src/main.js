/* Nexus — démarrage, routage et contrôle d'accès des pages.
 * Les gardes ci-dessous décident de l'AFFICHAGE ; la sécurité des données reste assurée par les règles Firestore. */
import { html, mount, $ } from "./core/dom.js";
import { parseHash, resolve, safeReturn, replace } from "./core/router.js";
import { errorMessage } from "./core/errors.js";
import { isAdmin } from "./core/permissions.js";
import * as session from "./auth/session.js";
import * as hub from "./data/hub.js";
import { renderShell, setCrumbs } from "./ui/shell.js";
import { notice } from "./ui/components.js";
import { icon } from "./ui/icons.js";
import { onLive, pendingConfirmations } from "./workflows/live.js";
import * as repo from "./data/repo.js";
import * as intro from "./ui/intro.js";

const app = document.getElementById("app");
const lazy = (name) => () => import(`./ui/pages/${name}.js`);

/* access : "public" (visiteur), "guest" (visiteur uniquement : connexion), "user" (compte actif), "admin" (administrateur actif) */
const ROUTES = [
  { path: "/connexion", access: "guest", page: lazy("login"), title: "Connexion" },
  { path: "/mot-de-passe", access: "guest", page: lazy("reset"), title: "Mot de passe oublié" },
  { path: "/decouvrir", access: "public", page: lazy("discover"), title: "Découvrir Nexus" },
  { path: "/accueil", access: "user", page: lazy("home"), title: "Accueil" },
  { path: "/applications", access: "user", page: lazy("apps"), title: "Applications" },
  { path: "/applications/:id", access: "user", page: lazy("app-detail"), title: "Application" },
  { path: "/connexions", access: "user", page: lazy("connections"), title: "Connexions" },
  { path: "/automatisations", access: "user", page: lazy("automations"), title: "Automatisations" },
  { path: "/automatisations/nouvelle", access: "user", page: lazy("workflow-edit"), title: "Nouvelle automatisation" },
  { path: "/automatisations/:id", access: "user", page: lazy("workflow-edit"), title: "Automatisation" },
  { path: "/executions/:id", access: "user", page: lazy("run"), title: "Exécution" },
  { path: "/axion", access: "user", page: lazy("axion"), title: "AXION" },
  { path: "/historique", access: "user", page: lazy("history"), title: "Historique" },
  { path: "/compte", access: "user", page: lazy("account"), title: "Mon compte" },
  { path: "/admin", access: "admin", page: lazy("admin"), title: "Administration" }
];

let cleanup = null, shellFor = "", renderSeq = 0, lastNotice = null, navigated = false;

function bootScreen() {
  mount(app, html`<div class="boot" aria-busy="true"><img class="boot-mark" src="assets/brand/nexus-mark.svg" alt="Chargement de Nexus"></div>`);
  shellFor = "";
}

function errorScreen(st) {
  shellFor = "";
  mount(app, html`<div class="auth-form" style="min-height:100vh"><div class="auth-card">
    <img src="assets/brand/nexus-mark.svg" alt="" width="44" height="44">
    <h1>Nexus n'a pas pu ouvrir votre session</h1>
    ${notice("err", errorMessage({ code: st.notice }))}
    <div class="row"><button class="btn primary" id="x-retry">${icon("retry")}Réessayer</button>${st.user ? html`<button class="btn" id="x-out">Se déconnecter</button>` : ""}</div>
  </div></div>`);
  $("#x-retry").onclick = () => (st.user ? session.refresh() : location.reload());
  const out = $("#x-out"); if (out) out.onclick = () => session.signOutUser();
}

async function render() {
  const mine = ++renderSeq;
  const st = session.getState();
  const { path, query } = parseHash(location.hash);
  if (st.status === "loading") return bootScreen();
  if (path === "/") return replace(st.status === "in" ? "/accueil" : "/connexion");
  const hit = resolve(ROUTES, path);
  if (!hit) {
    if (st.status !== "in") return replace("/connexion");
    return renderPage({ route: { title: "Page introuvable", access: "user", page: lazy("notfound") }, params: {} }, path, query, mine);
  }
  const { route } = hit;
  if (st.status === "error" && route.access !== "public") return errorScreen(st);
  if (route.access === "guest" && st.status === "in") return replace(safeReturn(query.retour));
  if ((route.access === "user" || route.access === "admin") && st.status !== "in") {
    lastNotice = st.notice;
    return replace(`/connexion?retour=${encodeURIComponent(path)}`);
  }
  if (route.access === "admin" && !isAdmin(st.profile)) {
    return renderPage({ route: { title: "Accès refusé", access: "user", page: lazy("forbidden") }, params: {} }, path, query, mine);
  }
  return renderPage(hit, path, query, mine);
}

async function renderPage({ route, params }, path, query, mine) {
  const st = session.getState();
  if (cleanup) { try { cleanup(); } catch (e) { /* rien */ } cleanup = null; }
  document.title = `${route.title} · Nexus`;
  let root;
  if (st.status === "in") {
    const key = path.split("/")[1] + "|" + st.profile.role + "|" + st.profile.firstName;
    if (shellFor !== key) {
      renderShell(app, { path, profile: st.profile, onSignOut: signOut, badges: { "/automatisations": pendingConfirmations() || 0 } });
      shellFor = key;
    }
    root = $("#nx-main");
    setCrumbs([{ path: "/accueil", label: "Nexus" }, { path, label: route.title }]);
  } else {
    shellFor = "";
    if (app._nxShellOff) { app._nxShellOff(); app._nxShellOff = null; }
    app.innerHTML = "";
    root = document.createElement("div");
    app.appendChild(root);
  }
  root.innerHTML = "";
  let mod;
  try { mod = await route.page(); }
  catch (e) { if (mine === renderSeq) mount(root, notice("err", "Cette page n'a pas pu être chargée (connexion internet ?). Rechargez la page.")); return; }
  if (mine !== renderSeq) return;
  const notice0 = lastNotice; lastNotice = null;
  try {
    cleanup = (await mod.render({ root, params, query, path, state: st, notice: notice0, setCrumbs, setTitle: (t) => { document.title = `${t} · Nexus`; } })) || null;
  } catch (e) {
    console.error(e);
    if (mine === renderSeq) mount(root, notice("err", errorMessage(e)));
  }
  // Après une navigation, le focus va au contenu (lecteurs d'écran) ; au premier affichage, le lien d'évitement reste le premier arrêt.
  if (st.status === "in" && navigated && document.activeElement === document.body) root.focus({ preventScroll: true });
  navigated = true;
}

async function signOut() {
  await session.signOutUser().catch(() => {});
  hub.reset();
}

/* Préférence « réduire les animations » (en plus de celle du système). */
async function applyPrefs(st) {
  try {
    const p = await repo.getPrefs(st.user.uid);
    document.documentElement.classList.toggle("reduce-motion", !!p.reduceMotion);
  } catch (e) { /* préférences facultatives */ }
}

let lastStatus = "", lastUid = "";
session.subscribe((st) => {
  intro.notify(st.status);   // le voile d'ouverture attend la fin du chargement de session, sans jamais la retarder
  const uidNow = st.user ? st.user.uid : "";
  if (st.status !== lastStatus || uidNow !== lastUid) {
    if (uidNow !== lastUid) hub.reset();
    lastStatus = st.status; lastUid = uidNow;
    if (st.status === "out") { lastNotice = st.notice; shellFor = ""; }
    if (st.status === "in") applyPrefs(st);
    render();
  }
});
window.addEventListener("hashchange", render);
onLive(() => {
  const n = pendingConfirmations();
  const a = document.querySelector('.nav a[href="#/automatisations"]');
  if (!a) return;
  let b = a.querySelector(".nav-badge");
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("span"); b.className = "nav-badge"; a.appendChild(b); }
  b.textContent = String(n); b.setAttribute("aria-label", `${n} en attente`);
});
function offline() { const el = document.getElementById("nx-offline"); if (el) mount(el, navigator.onLine ? "" : html`<div class="offline-bar" role="status">Vous êtes hors ligne : les données affichées peuvent être incomplètes et les actions échoueront.</div>`); }
window.addEventListener("online", offline); window.addEventListener("offline", offline);
bootScreen();
session.start();
