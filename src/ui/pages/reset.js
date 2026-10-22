/* Mot de passe oublié : e-mail de réinitialisation Firebase (même message que l'adresse existe ou non). */
import { html, mount, $ } from "../../core/dom.js";
import { errorMessage } from "../../core/errors.js";
import * as session from "../../auth/session.js";
import { notice, busy } from "../components.js";
import { authArt } from "./login.js";

export function render({ root }) {
  mount(root, html`<div class="auth">${authArt()}
    <section class="auth-form"><form class="auth-card" id="f" novalidate>
      <div><h1>Mot de passe oublié</h1><p class="muted" style="margin-top:6px">Indiquez l'adresse de votre compte Studio Prism : vous recevrez un lien pour choisir un nouveau mot de passe. Il servira partout : site, applications et Nexus.</p></div>
      <div id="msg"></div>
      <label class="field"><span>Adresse e-mail</span><input class="input" id="email" type="email" autocomplete="username" required autocapitalize="none" spellcheck="false"></label>
      <p class="form-error" id="err" role="alert"></p>
      <button class="btn primary" type="submit" id="go" style="min-height:46px">Envoyer le lien</button>
      <a href="#/connexion" class="small">Retour à la connexion</a>
    </form></section></div>`);
  const email = $("#email", root), err = $("#err", root), go = $("#go", root);
  email.focus();
  $("#f", root).onsubmit = async (e) => {
    e.preventDefault(); err.textContent = "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { err.textContent = "Saisissez une adresse e-mail valide."; email.setAttribute("aria-invalid", "true"); return; }
    busy(go, true, "Envoi…");
    try {
      await session.resetPassword(email.value);
      mount($("#msg", root), notice("ok", "Si un compte Studio Prism utilise cette adresse, un e-mail vient de lui être envoyé. Pensez à vérifier les indésirables."));
      busy(go, false); go.textContent = "Renvoyer le lien";
    } catch (x) { busy(go, false); err.textContent = errorMessage(x); }
  };
}
