/* Mon compte et paramètres : le compte Studio Prism (lecture seule ici), les licences, les préférences et les données de Nexus. */
import { html, mount, delegate, $ } from "../../core/dom.js";
import { dateLabel } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { licenseState, isAdmin } from "../../core/permissions.js";
import { APP_CONFIG } from "../../config/app-config.js";
import { appById } from "../../connectors/registry.js";
import * as repo from "../../data/repo.js";
import * as hub from "../../data/hub.js";
import * as session from "../../auth/session.js";
import { pill, empty, toast, confirmDialog, busy, notice } from "../components.js";
import { icon } from "../icons.js";
import { LIC_LABEL } from "./apps.js";

const KIND = { individual: "Particulier", company: "Entreprise" };
const SUB = { free: "Gratuit", pro: "Pro", pro_entreprise: "Pro Entreprise" };

export async function render({ root, state }) {
  const p = state.profile, uid = state.user.uid;
  let prefs = {};
  try { prefs = await repo.getPrefs(uid); } catch (e) { /* préférences facultatives */ }
  const lics = state.licenses;
  mount(root, html`
    <div class="page-head"><div><h1>Mon compte et paramètres</h1><p class="lede">Votre compte Studio Prism est le même partout. Il se modifie sur le site Studio Prism ; Nexus l'affiche ici.</p></div>
      <div class="actions"><a class="btn" href="${APP_CONFIG.SITE_URL}#/compte" target="_blank" rel="noopener">${icon("external")}Gérer mon compte sur le site</a></div></div>
    <div class="two">
      <div class="stack" style="--gap:20px">
        <section class="panel"><div class="panel-head"><h2>Compte Studio Prism</h2></div><div class="panel-body">
          <dl class="kv">
            <dt>Nom</dt><dd>${`${p.firstName || ""} ${p.lastName || ""}`.trim() || "—"}</dd>
            <dt>E-mail</dt><dd>${p.email || state.user.email}${state.user.emailVerified ? "" : html` <span class="muted small">(non vérifiée)</span>`}</dd>
            <dt>Type de compte</dt><dd>${KIND[p.accountKind] || p.accountKind || "—"}${p.companyName ? ` · ${p.companyName}` : ""}${p.orgName ? ` · ${p.orgName}` : ""}</dd>
            <dt>Abonnement</dt><dd>${SUB[p.subscription] || p.subscription || "—"}</dd>
            <dt>Rôle</dt><dd>${isAdmin(p) ? "Administrateur" : "Utilisateur"}</dd>
            <dt>Membre depuis</dt><dd>${dateLabel(p.createdAt)}</dd>
          </dl>
          <p class="small muted" style="margin-top:14px">Nom, mot de passe, type de compte et suppression du compte : sur le site Studio Prism (Mon compte). Le rôle et l'abonnement sont gérés par Studio Prism.</p>
        </div></section>
        <section class="panel"><div class="panel-head"><h2>Mes licences</h2><span class="spacer"></span><button class="btn ghost sm" data-act="refresh">${icon("refresh")}Actualiser</button></div><div class="panel-body">
          ${lics == null ? notice("warn", "Vos licences n'ont pas pu être lues. Réessayez avec « Actualiser ».") : lics.length ? html`<ul class="list">${lics.map((l) => { const s = licenseState(l); return html`<li class="li"><div class="li-main"><div class="li-title">${l.productName || appById(l.productId)?.name || l.productId}</div><div class="li-sub">${LIC_LABEL[l.licenseType] || l.licenseType} · ${l.expiresAt ? `jusqu'au ${dateLabel(l.expiresAt)}` : "sans date de fin"}</div></div>${pill(s === "active" ? "ok" : s === "expired" ? "warn" : s === "suspended" ? "err" : "", s === "active" ? "Active" : s === "expired" ? "Expirée" : s === "suspended" ? "Suspendue" : "Inactive")}</li>`; })}</ul>`
            : empty({ icon: "info", title: "Aucune licence", text: "Les applications restent utilisables avec leur offre gratuite. Les licences sont attribuées par Studio Prism." })}
        </div></section>
      </div>
      <aside class="stack" style="--gap:20px">
        <section class="panel"><div class="panel-head"><h2>Préférences</h2></div><div class="panel-body stack" style="--gap:14px">
          <label class="check"><input type="checkbox" id="pf-motion" ${prefs.reduceMotion ? "checked" : ""}><span>Réduire les animations<br><span class="muted">En plus du réglage de votre appareil.</span></span></label>
          <p class="form-error" id="pf-err" role="alert"></p>
        </div></section>
        <section class="panel"><div class="panel-head"><h2>Session</h2></div><div class="panel-body stack" style="--gap:12px">
          <p class="small muted">Sur ce navigateur, la session est partagée avec le site Studio Prism : vous déconnecter ici vous déconnecte aussi du site.</p>
          <button class="btn" data-act="signout">${icon("logout")}Se déconnecter</button>
        </div></section>
        <section class="panel"><div class="panel-head"><h2>Mes données Nexus</h2></div><div class="panel-body stack" style="--gap:12px">
          <p class="small">Connexions, automatisations, exécutions et historique de Nexus. Les effacer ne touche à rien dans les applications ni à votre compte Studio Prism.</p>
          <button class="btn danger" data-act="wipe">${icon("trash")}Effacer mes données Nexus</button>
        </div></section>
      </aside>
    </div>`);
  const motion = $("#pf-motion", root);
  motion.onchange = async () => {
    document.documentElement.classList.toggle("reduce-motion", motion.checked);
    try { await repo.savePrefs(uid, { reduceMotion: motion.checked }); toast("Préférence enregistrée."); }
    catch (e) { $("#pf-err", root).textContent = errorMessage(e); }
  };
  return delegate(root, {
    refresh: async () => { await session.refresh(); window.dispatchEvent(new HashChangeEvent("hashchange")); },
    signout: async () => { await session.signOutUser(); hub.reset(); },
    wipe: async (e, b) => {
      const ok = await confirmDialog({ title: "Effacer toutes vos données Nexus ?", danger: true, confirmLabel: "Tout effacer",
        body: html`<p>Vos connexions, automatisations, exécutions, historique et préférences Nexus seront supprimés définitivement. Vos projets et documents dans les applications ne sont pas concernés.</p>` });
      if (!ok) return;
      busy(b, true, "Effacement…");
      try { const n = await repo.wipeMyData(uid); hub.reset(); toast(`${n} élément(s) effacé(s).`); busy(b, false); }
      catch (x) { busy(b, false); toast(errorMessage(x), "err"); }
    }
  });
}
