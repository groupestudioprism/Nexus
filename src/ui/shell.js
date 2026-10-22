/* Coque de l'application connectée : rail (ordinateur), barre d'onglets + feuille « Plus » (mobile), fil d'Ariane. */
import { html, mount, delegate, $ } from "../core/dom.js";
import { icon } from "./icons.js";
import { initials } from "../core/format.js";
import { isAdmin } from "../core/permissions.js";

export const NAV = [
  { path: "/accueil", label: "Accueil", icon: "home" },
  { path: "/applications", label: "Applications", icon: "apps" },
  { path: "/connexions", label: "Connexions", icon: "link" },
  { path: "/automatisations", label: "Automatisations", icon: "flow", mobileLabel: "Flux" },
  { path: "/axion", label: "AXION", icon: "axion" },
  { path: "/historique", label: "Historique", icon: "history" }
];
const MOBILE_TABS = ["/accueil", "/applications", "/automatisations", "/axion"];

const current = (path, item) => path === item || path.startsWith(item + "/");

export function renderShell(root, { path, profile, onSignOut, badges = {} }) {
  const admin = isAdmin(profile);
  const name = `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || profile.email;
  const sub = admin ? "Administrateur" : profile.accountKind === "company" ? (profile.companyName || "Compte Entreprise") : "Compte Studio Prism";
  mount(root, html`
    <a class="skip" href="#nx-main" data-act="skip">Aller au contenu</a>
    <div class="shell">
      <aside class="rail" aria-label="Navigation principale">
        <a class="brand" href="#/accueil" aria-label="Nexus, accueil"><img src="assets/brand/nexus-mark.svg" alt=""><span class="brand-word">NEXUS</span></a>
        <nav class="nav">
          ${NAV.map((n) => html`<a href="#${n.path}" ${current(path, n.path) ? html`aria-current="page"` : ""}>${icon(n.icon)}<span>${n.label}</span>${badges[n.path] ? html`<span class="nav-badge" aria-label="${badges[n.path]} en attente">${badges[n.path]}</span>` : ""}</a>`)}
        </nav>
        <div class="rail-foot">
          <button class="me-btn" data-act="menu" aria-haspopup="menu" aria-expanded="false">
            <span class="avatar" aria-hidden="true">${initials(profile.firstName, profile.lastName, profile.email)}</span>
            <span><span class="me-name">${name}</span><br><span class="me-sub">${sub}</span></span>
          </button>
          <p class="signature">Une application Studio Prism</p>
        </div>
      </aside>
      <div class="main">
        <div class="topbar">
          <a class="mobile-brand" href="#/accueil" aria-label="Nexus, accueil"><img src="assets/brand/nexus-mark.svg" alt=""></a>
          <nav class="crumbs" aria-label="Fil d'Ariane" id="nx-crumbs"></nav>
        </div>
        <div id="nx-offline"></div>
        <main class="page" id="nx-main" tabindex="-1"></main>
      </div>
    </div>
    <nav class="tabbar" aria-label="Navigation">
      ${MOBILE_TABS.map((p) => { const n = NAV.find((x) => x.path === p); return html`<a href="#${p}" ${current(path, p) ? html`aria-current="page"` : ""}>${icon(n.icon)}<span>${n.mobileLabel || n.label}</span></a>`; })}
      <button data-act="more" aria-haspopup="dialog" ${["/connexions", "/historique", "/compte", "/admin"].some((p) => current(path, p)) ? html`aria-current="page"` : ""}>${icon("more")}<span>Plus</span></button>
    </nav>
    <div id="nx-live" class="sr-only" aria-live="polite"></div>`);

  const menuItems = () => html`
    <a href="#/compte">${icon("user")}Mon compte et paramètres</a>
    ${admin ? html`<a href="#/admin">${icon("shield")}Administration</a>` : ""}
    <hr><button data-act="signout">${icon("logout")}Se déconnecter</button>`;

  if (root._nxShellOff) root._nxShellOff();   // une seule écoute, même si la coque est redessinée
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; $(".me-btn", root)?.setAttribute("aria-expanded", "false"); } };
  root._nxShellOff = delegate(root, {
    skip: (e) => { e.preventDefault(); $("#nx-main").focus(); },
    menu: (e, b) => {
      if (menu) return closeMenu();
      menu = document.createElement("div");
      menu.className = "menu"; menu.setAttribute("role", "menu");
      mount(menu, menuItems());
      $(".rail", root).appendChild(menu);
      b.setAttribute("aria-expanded", "true");
      menu.querySelector("a,button").focus();
      const off = (ev) => { if (!menu || menu.contains(ev.target) || b.contains(ev.target)) return; closeMenu(); document.removeEventListener("click", off); };
      setTimeout(() => document.addEventListener("click", off));
      menu.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { closeMenu(); b.focus(); } });
      menu.addEventListener("click", (ev) => { if (ev.target.closest("[data-act=signout]")) { closeMenu(); onSignOut(); } else if (ev.target.closest("a")) closeMenu(); });
    },
    more: () => {
      const bd = document.createElement("div");
      bd.className = "sheet-backdrop";
      mount(bd, html`<div class="sheet" role="dialog" aria-modal="true" aria-label="Plus"><div class="grip"></div>
        <a href="#/connexions">${icon("link")}Connexions</a>
        <a href="#/historique">${icon("history")}Historique</a>
        <a href="#/compte">${icon("user")}Mon compte et paramètres</a>
        ${admin ? html`<a href="#/admin">${icon("shield")}Administration</a>` : ""}
        <button class="item" data-x="out">${icon("logout")}Se déconnecter</button></div>`);
      document.body.appendChild(bd);
      const close = () => bd.remove();
      bd.addEventListener("click", (ev) => {
        if (ev.target === bd || ev.target.closest("a")) close();
        if (ev.target.closest("[data-x=out]")) { close(); onSignOut(); }
      });
      bd.addEventListener("keydown", (ev) => { if (ev.key === "Escape") close(); });
      bd.querySelector("a").focus();
    }
  });
}

export function setCrumbs(items) {
  const el = document.getElementById("nx-crumbs");
  if (!el) return;
  mount(el, html`${items.map((c, i) => i < items.length - 1 ? html`<a href="#${c.path}">${c.label}</a><span aria-hidden="true">/</span>` : html`<span aria-current="page">${c.label}</span>`)}`);
}
