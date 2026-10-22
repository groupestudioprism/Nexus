/* Administration de Nexus (administrateur actif uniquement — la page est filtrée par le routeur, l'écriture par les règles Firestore).
 * Nexus n'ajoute aucune gestion de comptes : utilisateurs, rôles, licences et catalogue restent dans l'administration du site. */
import { html, mount, delegate, $ } from "../../core/dom.js";
import { errorMessage } from "../../core/errors.js";
import { dateTimeLabel } from "../../core/format.js";
import { APP_CONFIG } from "../../config/app-config.js";
import { appCheckEnabled } from "../../core/firebase.js";
import * as axion from "../../axion/axion.js";
import { DEFAULT_SETTINGS, validateSettings } from "../../axion/protocol.js";
import * as repo from "../../data/repo.js";
import { notice, toast, busy, confirmDialog, pill } from "../components.js";
import { icon } from "../icons.js";

export async function render({ root, state }) {
  const uid = state.user.uid;
  let cfg = await axion.loadSettings(true), loadErr = null;
  if (!cfg) loadErr = axion.status();
  const s = cfg || { ...DEFAULT_SETTINGS };
  mount(root, html`
    <div class="page-head"><div><h1>Administration</h1><p class="lede">Réglages globaux de Nexus. Les comptes, rôles, licences et produits se gèrent dans l'administration du site Studio Prism.</p></div>
      <div class="actions"><a class="btn" href="${APP_CONFIG.SITE_URL}#/admin" target="_blank" rel="noopener">${icon("external")}Administration du site</a></div></div>
    <div class="two">
      <section class="panel"><div class="panel-head"><h2>AXION</h2><span class="spacer"></span>${pill(s.enabled ? "ok" : "", s.enabled ? "Activé" : "Désactivé")}</div><div class="panel-body stack" style="--gap:16px">
        ${loadErr ? notice("err", html`<b>Réglage illisible :</b> ${errorMessage({ code: loadErr.code })} Les règles Firestore de Nexus sont-elles publiées ?`) : ""}
        ${notice("warn", html`<b>Avant d'activer AXION :</b>
          <ul class="feat" style="margin-top:6px">
            <li><b>Gemini Developer API</b> (offre gratuite, forfait Spark) : les conditions de l'API Gemini réservent aux offres <b>payantes</b> les applications proposées à des utilisateurs de l'Espace économique européen, de la Suisse ou du Royaume-Uni, et les contenus envoyés à l'offre gratuite peuvent être utilisés par Google pour améliorer ses produits.</li>
            <li><b>Vertex AI</b> : exige le forfait Blaze (payant) sur le projet Firebase.</li>
            <li>Firebase annonce qu'<b>App Check</b> sera obligatoire pour Firebase AI Logic à partir du 2 novembre 2026. État ici : ${appCheckEnabled() ? "App Check actif" : "App Check non configuré (src/config/app-config.js)"}.</li>
            <li>Dans la console Firebase : AI Logic → Commencer, puis choisir le fournisseur correspondant au moteur ci-dessous.</li>
          </ul>`)}
        <form id="ax" novalidate class="stack" style="--gap:14px">
          <label class="check"><input type="checkbox" id="ax-on" ${s.enabled ? "checked" : ""}><span><b>Activer AXION dans Nexus</b><br><span class="muted">Visible par tous les comptes actifs, avec les limites ci-dessous.</span></span></label>
          <div class="editor-step" style="padding:0;border:0"><div class="grid2">
            <label class="field"><span>Moteur</span><select class="input" id="ax-backend"><option value="googleai" ${s.backend === "googleai" ? "selected" : ""}>Gemini Developer API</option><option value="vertexai" ${s.backend === "vertexai" ? "selected" : ""}>Vertex AI (forfait Blaze)</option></select></label>
            <label class="field"><span>Modèle</span><input class="input" id="ax-model" value="${s.model}" maxlength="80"><span class="hint">Ex. celui des applications SPECTRA : gemini-3.6-flash</span></label>
            <label class="field"><span>Région (Vertex AI)</span><input class="input" id="ax-loc" value="${s.location}" maxlength="30"></label>
          </div></div>
          <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:600;margin-bottom:8px">Demandes par jour et par compte</legend>
            <div class="editor-step" style="padding:0;border:0"><div class="grid2" style="margin-top:0">
              <label class="field"><span>Offre gratuite</span><input class="input" type="number" min="0" max="5000" id="ax-free" value="${s.dailyLimit.free}"></label>
              <label class="field"><span>Avec licence</span><input class="input" type="number" min="0" max="5000" id="ax-lic" value="${s.dailyLimit.licensed}"></label>
              <label class="field"><span>Administrateur</span><input class="input" type="number" min="0" max="5000" id="ax-admin" value="${s.dailyLimit.admin}"></label>
            </div></div>
            <p class="small muted" style="margin-top:8px">Compteur contrôlé par les règles Firestore. Il ne remplace pas les quotas de Firebase AI Logic (console) ni App Check, seuls à protéger réellement le service.</p></fieldset>
          <p class="form-error" id="ax-err" role="alert"></p>
          <div class="row"><button class="btn primary" type="submit" id="ax-save">Enregistrer</button>${cfg && cfg.updatedAt ? html`<span class="small muted">Modifié le ${dateTimeLabel(cfg.updatedAt)}</span>` : ""}</div>
        </form>
      </div></section>
      <aside class="stack" style="--gap:20px">
        <section class="panel"><div class="panel-head"><h2>Règles Firestore de Nexus</h2></div><div class="panel-body stack" style="--gap:12px">
          <p class="small">Vérifie que les règles publiées contiennent le bloc Nexus (lecture de votre propre espace et du réglage AXION).</p>
          <button class="btn sm" data-act="rules">${icon("shield")}Vérifier</button><div id="rules-out"></div>
        </div></section>
        <section class="panel"><div class="panel-head"><h2>Confidentialité</h2></div><div class="panel-body small">
          Un administrateur ne lit ni ne modifie les connexions, automatisations ou historiques des autres comptes : les règles de Nexus le refusent. Après la suppression d'un compte, ses données Nexus (nxUsers/{uid}) se suppriment depuis la console Firebase.
        </div></section>
      </aside>
    </div>`);

  $("#ax", root).onsubmit = async (e) => {
    e.preventDefault();
    const b = $("#ax-save", root), err = $("#ax-err", root);
    const next = {
      enabled: $("#ax-on", root).checked, backend: $("#ax-backend", root).value, model: $("#ax-model", root).value.trim(), location: $("#ax-loc", root).value.trim() || "global",
      dailyLimit: { free: Number($("#ax-free", root).value), licensed: Number($("#ax-lic", root).value), admin: Number($("#ax-admin", root).value) }
    };
    const errors = validateSettings(next);
    if (errors.length) { err.textContent = errors.join(" "); return; }
    err.textContent = "";
    if (next.enabled && !s.enabled && !(await confirmDialog({ title: "Activer AXION ?", confirmLabel: "Activer", body: html`<p>Vous confirmez avoir vérifié les conditions du moteur choisi (offre, région des utilisateurs, coût éventuel) et activé Firebase AI Logic dans la console.</p>` }))) return;
    busy(b, true, "Enregistrement…");
    try { await repo.saveAxionConfig(next, uid); await axion.loadSettings(true); toast("Réglage d'AXION enregistré."); Object.assign(s, next); }
    catch (x) { err.textContent = errorMessage(x); }
    busy(b, false);
  };
  return delegate(root, {
    rules: async (e, b) => {
      busy(b, true, "Vérification…");
      const out = [];
      try { await repo.getAxionConfig(); out.push(["ok", "Lecture du réglage AXION : autorisée"]); } catch (x) { out.push(["err", `Réglage AXION : ${errorMessage(x)}`]); }
      try { await repo.listConnections(uid); out.push(["ok", "Lecture de votre espace Nexus : autorisée"]); } catch (x) { out.push(["err", `Espace Nexus : ${errorMessage(x)}`]); }
      busy(b, false);
      mount($("#rules-out", root), html`${out.map(([k, t]) => notice(k, t))}`);
    }
  });
}
