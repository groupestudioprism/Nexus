/* Connexion avec le compte Studio Prism (aucun compte propre à Nexus). */
import { html, mount, $ } from "../../core/dom.js";
import { errorMessage } from "../../core/errors.js";
import { safeReturn, replace } from "../../core/router.js";
import { APP_CONFIG } from "../../config/app-config.js";
import * as session from "../../auth/session.js";
import { notice, busy } from "../components.js";
import { icon } from "../icons.js";

export function authArt() {
  return html`<section class="auth-art" aria-label="Nexus">
    <a class="brand" href="#/decouvrir"><img src="assets/brand/nexus-mark.svg" alt="" width="30" height="30"><span class="brand-word">NEXUS</span></a>
    <div class="art"><img src="assets/brand/nexus-mark.svg" alt=""></div>
    <p class="claim">Vos applications Studio Prism, enfin reliées.</p>
    <p class="claim-sub">Retrouvez vos projets ARCHIPLAN, ARCHITRAFIC et SPECTRA au même endroit, autorisez ce que Nexus peut faire, et enchaînez les tâches d'une application à l'autre.</p>
    <p class="studio">Une application Studio Prism · même compte que le site et les applications</p>
  </section>`;
}

export function render({ root, query, notice: n }) {
  const retour = safeReturn(query.retour);
  const info = n && n !== "app/session-expired" ? notice(n === "app/pending" ? "warn" : "err", errorMessage({ code: n }))
    : n === "app/session-expired" ? notice("warn", errorMessage({ code: n }))
    : query.retour ? notice("info", "Connectez-vous pour accéder à cette page.") : "";
  mount(root, html`<div class="auth">${authArt()}
    <section class="auth-form"><form class="auth-card" id="f" novalidate>
      <div><h1>Se connecter</h1><p class="muted" style="margin-top:6px">Avec votre compte Studio Prism, le même que sur le site et dans les applications.</p></div>
      <div id="msg">${info}</div>
      <label class="field"><span>Adresse e-mail</span><input class="input" id="email" type="email" autocomplete="username" required inputmode="email" autocapitalize="none" spellcheck="false"></label>
      <label class="field"><span>Mot de passe</span><span class="pw"><input class="input" id="pw" type="password" autocomplete="current-password" required><button type="button" class="btn ghost sm" id="eye" aria-pressed="false">Afficher</button></span></label>
      <div class="row" style="justify-content:space-between">
        <label class="check"><input type="checkbox" id="remember" checked><span>Rester connecté sur cet appareil</span></label>
        <a href="#/mot-de-passe" class="small">Mot de passe oublié ?</a>
      </div>
      <p class="form-error" id="err" role="alert"></p>
      <button class="btn primary" type="submit" id="go" style="min-height:46px">Se connecter</button>
      <div class="divider">Pas encore de compte ?</div>
      <a class="btn" href="${APP_CONFIG.SITE_URL}#/compte/inscription" target="_blank" rel="noopener">${icon("external")}Créer un compte sur le site Studio Prism</a>
      <p class="small muted">Le compte se crée sur le site Studio Prism. Revenez ensuite ici : la même adresse et le même mot de passe ouvrent Nexus.</p>
    </form></section></div>`);

  const email = $("#email", root), pw = $("#pw", root), err = $("#err", root), go = $("#go", root);
  $("#eye", root).onclick = (e) => { const show = pw.type === "password"; pw.type = show ? "text" : "password"; e.currentTarget.textContent = show ? "Masquer" : "Afficher"; e.currentTarget.setAttribute("aria-pressed", String(show)); };
  email.focus();
  $("#f", root).onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = ""; email.removeAttribute("aria-invalid"); pw.removeAttribute("aria-invalid");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { err.textContent = "Saisissez une adresse e-mail valide."; email.setAttribute("aria-invalid", "true"); email.focus(); return; }
    if (!pw.value) { err.textContent = "Saisissez votre mot de passe."; pw.setAttribute("aria-invalid", "true"); pw.focus(); return; }
    busy(go, true, "Connexion…");
    try {
      await session.signIn({ email: email.value, password: pw.value, remember: $("#remember", root).checked });
      replace(retour);
    } catch (x) {
      busy(go, false);
      $("#msg", root).innerHTML = "";
      err.textContent = errorMessage(x);
      if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(x.code)) { pw.value = ""; pw.focus(); }
    }
  };
}
